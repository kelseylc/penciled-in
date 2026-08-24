import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseWeeklyPattern, type WeeklyPattern } from "@/lib/weekly-availability";

export interface ResultsBundle {
  project: {
    id: string;
    name: string;
    slug: string;
    status: string;
    mode: string;
    cadence: string | null;
    quorum_min: number;
    duration_minutes: number;
    group_id: string | null;
  };
  participants: {
    id: string;
    display_name: string;
    is_required: boolean;
    responded: boolean;
    timezone: string | null;
    weekly_pattern: WeeklyPattern | null;
    blackout_dates: string[] | null;
  }[];

  slots: { id: string; start_utc: string; end_utc: string }[];
  /** slotId -> participantId -> state */
  responses: Record<string, Record<string, "yes" | "maybe" | "no">>;
  previousOccurrenceUtc: string | null;
  decision: {
    chosen_slot_id: string | null;
    cadence_weekday: number | null;
    cadence_start_time_utc: string | null;
    cadence_kind: string | null;
  } | null;
}

const slugSchema = z.object({ slug: z.string().min(3).max(40) });

// Results are deliberately public: anyone holding the project link can read
// tallies, outstanding names, ranked slots, and the decision. No token, no login.
export const getResults = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }): Promise<ResultsBundle> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin;

    const { data: project } = await sb
      .from("projects")
      .select("id, name, slug, status, mode, cadence, quorum_min, duration_minutes, group_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("Plan not found");

    const [{ data: participants }, { data: slots }, { data: decision }, { data: occ }] =
      await Promise.all([
        sb
          .from("participants")
          .select("id, display_name, is_required, responded_at, profile_id, timezone")
          .eq("project_id", project.id)
          .order("display_name"),

        sb
          .from("candidate_slots")
          .select("id, start_utc, end_utc")
          .eq("project_id", project.id)
          .order("start_utc"),
        sb
          .from("decisions")
          .select("chosen_slot_id, cadence_weekday, cadence_start_time_utc, cadence_kind")
          .eq("project_id", project.id)
          .maybeSingle(),
        sb
          .from("occurrences")
          .select("scheduled_start_utc")
          .eq("project_id", project.id)
          .eq("status", "confirmed")
          .order("scheduled_start_utc", { ascending: false })
          .limit(1),
      ]);

    const participantIds = (participants ?? []).map((p) => p.id);
    const responses: ResultsBundle["responses"] = {};
    if (participantIds.length > 0) {
      const { data: rows } = await sb
        .from("slot_responses")
        .select("participant_id, candidate_slot_id, state")
        .in("participant_id", participantIds);
      for (const r of rows ?? []) {
        const bucket = (responses[r.candidate_slot_id] ??= {});
        bucket[r.participant_id] = r.state as "yes" | "maybe" | "no";
      }
    }

    // Saved default availability, when participants are linked to group members.
    const defaults = new Map<
      string,
      { weekly_pattern: Record<string, string[]> | null; blackout_dates: string[] | null }
    >();
    const profileIds = (participants ?? [])
      .map((p) => p.profile_id)
      .filter((v): v is string => !!v);
    if (project.group_id && profileIds.length > 0) {
      const { data: members } = await sb
        .from("group_members")
        .select("id, profile_id")
        .eq("group_id", project.group_id)
        .in("profile_id", profileIds);
      const memberIds = (members ?? []).map((m) => m.id);
      if (memberIds.length > 0) {
        const { data: das } = await sb
          .from("default_availability")
          .select("group_member_id, weekly_pattern, blackout_dates")
          .in("group_member_id", memberIds);
        for (const da of das ?? []) {
          const member = (members ?? []).find((m) => m.id === da.group_member_id);
          if (!member?.profile_id) continue;
          defaults.set(member.profile_id, {
            weekly_pattern: (da.weekly_pattern ?? null) as Record<string, string[]> | null,
            blackout_dates: da.blackout_dates ?? null,
          });
        }
      }
    }

    return {
      project,
      participants: (participants ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        is_required: p.is_required,
        responded: !!p.responded_at,
        weekly_pattern: p.profile_id ? (defaults.get(p.profile_id)?.weekly_pattern ?? null) : null,
        blackout_dates: p.profile_id ? (defaults.get(p.profile_id)?.blackout_dates ?? null) : null,
      })),
      slots: slots ?? [],
      responses,
      previousOccurrenceUtc: occ?.[0]?.scheduled_start_utc ?? null,
      decision: decision ?? null,
    };
  });

export const lockOneOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ slug: z.string().min(3).max(40), slotId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: project } = await sb
      .from("projects")
      .select("id, repoll_for_occurrence_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("Plan not found");

    const { data: slot } = await sb
      .from("candidate_slots")
      .select("id, start_utc, end_utc")
      .eq("id", data.slotId)
      .eq("project_id", project.id)
      .maybeSingle();
    if (!slot) throw new Error("That time isn't part of this plan");

    await sb.from("decisions").delete().eq("project_id", project.id);
    const { error: dErr } = await sb
      .from("decisions")
      .insert({ project_id: project.id, chosen_slot_id: slot.id });
    if (dErr) throw new Error(dErr.message);

    if (project.repoll_for_occurrence_id) {
      // Re-poll: move only this one session; the locked cadence stays put.
      const { applyRepollResult } = await import("@/lib/occurrences.server");
      await applyRepollResult(project.repoll_for_occurrence_id, slot.start_utc, slot.end_utc);
      const { error: rErr } = await sb
        .from("projects")
        .update({ status: "locked" })
        .eq("id", project.id);
      if (rErr) throw new Error(rErr.message);
      return { ok: true };
    }

    await sb.from("occurrences").delete().eq("project_id", project.id);
    const { error: oErr } = await sb.from("occurrences").insert({
      project_id: project.id,
      scheduled_start_utc: slot.start_utc,
      scheduled_end_utc: slot.end_utc,
      status: "confirmed",
    });
    if (oErr) throw new Error(oErr.message);

    const { error: pErr } = await sb
      .from("projects")
      .update({ status: "locked" })
      .eq("id", project.id);
    if (pErr) throw new Error(pErr.message);

    return { ok: true };
  });

export const lockCadence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(3).max(40),
        weekday: z.number().int().min(0).max(6),
        cadenceKind: z.enum(["weekly", "biweekly", "monthly", "quarterly"]),
        occurrences: z.array(z.string().datetime()).min(1).max(24),
        durationMinutes: z.number().int().min(15).max(720),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: project } = await sb
      .from("projects")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("Plan not found");

    const first = new Date(data.occurrences[0]!);
    const startTimeUtc = `${String(first.getUTCHours()).padStart(2, "0")}:${String(
      first.getUTCMinutes(),
    ).padStart(2, "0")}:00`;

    await sb.from("decisions").delete().eq("project_id", project.id);
    const { error: dErr } = await sb.from("decisions").insert({
      project_id: project.id,
      cadence_weekday: data.weekday,
      cadence_start_time_utc: startTimeUtc,
      cadence_kind: data.cadenceKind,
    });
    if (dErr) throw new Error(dErr.message);

    await sb.from("occurrences").delete().eq("project_id", project.id);
    const rows = data.occurrences.map((iso) => ({
      project_id: project.id,
      scheduled_start_utc: iso,
      scheduled_end_utc: new Date(
        new Date(iso).getTime() + data.durationMinutes * 60_000,
      ).toISOString(),
      status: "pending",
    }));
    const { error: oErr } = await sb.from("occurrences").insert(rows);
    if (oErr) throw new Error(oErr.message);

    const { error: pErr } = await sb
      .from("projects")
      .update({ status: "locked" })
      .eq("id", project.id);
    if (pErr) throw new Error(pErr.message);

    return { ok: true, occurrences: rows.length };
  });
