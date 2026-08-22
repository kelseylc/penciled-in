import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomSlug() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

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
