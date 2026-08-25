import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { randomSlug } from "@/lib/slug";

/** Turn the people on a locked plan into a reusable saved group. */
export const saveGroupFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ slug: z.string().min(3).max(40), name: z.string().trim().min(1).max(60) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: project } = await sb
      .from("projects")
      .select("id, group_id, organizer_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("Plan not found");
    if (project.organizer_id !== context.userId) throw new Error("Only the organizer can do that");
    if (project.group_id) throw new Error("These people are already saved as a group");

    const { data: participants } = await sb
      .from("participants")
      .select("display_name, timezone, is_required, profile_id")
      .eq("project_id", project.id);

    const groupSlug = randomSlug();
    const { data: group, error: gErr } = await sb
      .from("groups")
      .insert({ name: data.name, owner_id: context.userId, slug: groupSlug })
      .select("id, slug")
      .single();
    if (gErr || !group) throw new Error(gErr?.message ?? "Couldn't save that group");

    const rows = (participants ?? []).map((p) => ({
      group_id: group.id,
      display_name: p.display_name,
      timezone: p.timezone,
      is_required_default: p.is_required,
      profile_id: p.profile_id,
    }));
    if (rows.length > 0) {
      const { error: mErr } = await sb.from("group_members").insert(rows);
      if (mErr) throw new Error(mErr.message);
    }

    await sb.from("projects").update({ group_id: group.id }).eq("id", project.id);

    return { slug: group.slug, members: rows.length };
  });

export interface GroupPage {
  group: { name: string; slug: string };
  members: { display_name: string }[];
  plans: {
    slug: string;
    name: string;
    status: string;
    mode: string;
    nextStartUtc: string | null;
  }[];
}

/** Public: the group's permanent link, safe to drop in a chat once and reuse. */
export const getGroupPage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(3).max(40) }).parse(data))
  .handler(async ({ data }): Promise<GroupPage> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("id, name, slug")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!group) throw new Error("That group link isn't valid.");

    const [{ data: members }, { data: projects }] = await Promise.all([
      supabaseAdmin
        .from("group_members")
        .select("display_name")
        .eq("group_id", group.id)
        .order("display_name"),
      supabaseAdmin
        .from("projects")
        .select("id, slug, name, status, mode")
        .eq("group_id", group.id)
        .is("repoll_for_occurrence_id", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const ids = (projects ?? []).map((p) => p.id);
    const next = new Map<string, string>();
    if (ids.length > 0) {
      const { data: occ } = await supabaseAdmin
        .from("occurrences")
        .select("project_id, scheduled_start_utc")
        .in("project_id", ids)
        .gte("scheduled_start_utc", new Date().toISOString())
        .neq("status", "cancelled")
        .order("scheduled_start_utc");
      for (const o of occ ?? []) {
        if (!next.has(o.project_id)) next.set(o.project_id, o.scheduled_start_utc);
      }
    }

    return {
      group: { name: group.name, slug: group.slug },
      members: members ?? [],
      plans: (projects ?? []).map((p) => ({
        slug: p.slug,
        name: p.name,
        status: p.status,
        mode: p.mode,
        nextStartUtc: next.get(p.id) ?? null,
      })),
    };
  });

/* ------------------------------------------------------------------ *
 * Saved groups: list, manage members, hand out co-organizer access.
 * ------------------------------------------------------------------ */

export interface MyGroup {
  slug: string;
  name: string;
  memberCount: number;
  organizerCount: number;
  isOwner: boolean;
}

/** Every group I own or co-organize. */
export const listMyGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyGroup[]> => {
    const sb = context.supabase;
    // RLS already limits this to groups I own or am linked to as a member.
    const { data: groups, error } = await sb
      .from("groups")
      .select("id, name, slug, owner_id")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (groups ?? []).map((g) => g.id);
    const counts = new Map<string, { members: number; organizers: number }>();
    if (ids.length > 0) {
      const { data: members } = await sb
        .from("group_members")
        .select("group_id, profile_id")
        .in("group_id", ids);
      for (const m of members ?? []) {
        const c = counts.get(m.group_id) ?? { members: 0, organizers: 0 };
        c.members += 1;
        if (m.profile_id) c.organizers += 1;
        counts.set(m.group_id, c);
      }
    }

    return (groups ?? []).map((g) => ({
      slug: g.slug,
      name: g.name,
      memberCount: counts.get(g.id)?.members ?? 0,
      organizerCount: (counts.get(g.id)?.organizers ?? 0) + 1,
      isOwner: g.owner_id === context.userId,
    }));
  });

export interface ManageMember {
  id: string;
  display_name: string;
  timezone: string | null;
  is_required_default: boolean;
  is_organizer: boolean;
  email: string | null;
  is_me: boolean;
}

export interface GroupManage {
  slug: string;
  name: string;
  isOwner: boolean;
  members: ManageMember[];
}

/** Organizer view of a saved group: members, co-organizers, required defaults. */
export const getGroupManage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(3).max(40) }).parse(data))
  .handler(async ({ data, context }): Promise<GroupManage> => {
    const sb = context.supabase;
    const { data: group } = await sb
      .from("groups")
      .select("id, name, slug, owner_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!group) throw new Error("That group isn't available to you.");

    const { data: members } = await sb
      .from("group_members")
      .select("id, display_name, timezone, is_required_default, profile_id")
      .eq("group_id", group.id)
      .order("display_name");

    const profileIds = (members ?? []).map((m) => m.profile_id).filter(Boolean) as string[];
    const emails = new Map<string, string | null>();
    if (profileIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", profileIds);
      for (const p of profiles ?? []) emails.set(p.id, p.email);
    }

    return {
      slug: group.slug,
      name: group.name,
      isOwner: group.owner_id === context.userId,
      members: (members ?? []).map((m) => ({
        id: m.id,
        display_name: m.display_name,
        timezone: m.timezone,
        is_required_default: m.is_required_default,
        is_organizer: !!m.profile_id,
        email: m.profile_id ? (emails.get(m.profile_id) ?? null) : null,
        is_me: m.profile_id === context.userId,
      })),
    };
  });

/** Create an empty saved group from scratch. */
export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        members: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: group, error } = await sb
      .from("groups")
      .insert({ name: data.name, owner_id: context.userId, slug: randomSlug() })
      .select("id, slug")
      .single();
    if (error || !group) throw new Error(error?.message ?? "Couldn't create that group");

    const names = (data.members ?? []).filter(Boolean);
    if (names.length > 0) {
      await sb
        .from("group_members")
        .insert(names.map((n) => ({ group_id: group.id, display_name: n })));
    }
    return { slug: group.slug };
  });

export const renameGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ slug: z.string().min(3).max(40), name: z.string().trim().min(1).max(60) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("groups")
      .update({ name: data.name })
      .eq("slug", data.slug);
    if (error) throw new Error("Only the group owner can rename it.");
    return { ok: true };
  });

export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(3).max(40),
        display_name: z.string().trim().min(1).max(80),
        timezone: z.string().max(64).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: group } = await sb
      .from("groups")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!group) throw new Error("That group isn't available to you.");
    const { error } = await sb.from("group_members").insert({
      group_id: group.id,
      display_name: data.display_name,
      timezone: data.timezone ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        memberId: z.string().uuid(),
        is_required_default: z.boolean().optional(),
        remove: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    if (data.remove) {
      const { error } = await sb.from("group_members").delete().eq("id", data.memberId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await sb
      .from("group_members")
      .update({ is_required_default: data.is_required_default ?? false })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Make an existing member a co-organizer by linking their account.
 * They need an account already (any respondent who saved their availability has one).
 */
export const setCoOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(3).max(40),
        memberId: z.string().uuid(),
        email: z.string().trim().email().max(160).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: group } = await sb
      .from("groups")
      .select("id, owner_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!group) throw new Error("That group isn't available to you.");

    if (data.email === null) {
      if (group.owner_id !== context.userId)
        throw new Error("Only the group owner can remove a co-organizer.");
      const { error } = await sb
        .from("group_members")
        .update({ profile_id: null })
        .eq("id", data.memberId)
        .eq("group_id", group.id);
      if (error) throw new Error(error.message);
      return { ok: true, linked: false as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    if (!profile)
      throw new Error("No account with that email yet. Ask them to sign in once, then try again.");

    const { error } = await sb
      .from("group_members")
      .update({ profile_id: profile.id })
      .eq("id", data.memberId)
      .eq("group_id", group.id);
    if (error) throw new Error(error.message);
    return { ok: true, linked: true as const };
  });

/**
 * Pause a campaign. Hiatus is a legitimate state — an app that can't be told
 * "we're not playing right now" just becomes another thing to mute.
 */
export const setCampaignPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ groupId: z.string().uuid(), paused: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("groups")
      .update({ paused_at: data.paused ? new Date().toISOString() : null })
      .eq("id", data.groupId);
    if (error) throw new Error("Only the campaign owner can pause it.");
    return { ok: true, paused: data.paused };
  });
