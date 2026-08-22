import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface LockedPlan {
  project: {
    id: string;
    name: string;
    slug: string;
    status: string;
    mode: string;
    cadence: string | null;
    duration_minutes: number;
    quorum_min: number;
    template: string;
  };
  decision: {
    chosen_slot_id: string | null;
    cadence_weekday: number | null;
    cadence_kind: string | null;
  } | null;
  occurrences: {
    id: string;
    scheduled_start_utc: string;
    scheduled_end_utc: string;
    status: string;
    index: number;
  }[];
  participants: {
    id: string;
    display_name: string;
    is_required: boolean;
    timezone: string | null;
  }[];
  /** occurrenceId -> participantId -> "in" | "out" | "late" */
  rsvps: Record<string, Record<string, string>>;
  /** participantId -> "yes" | "maybe" | "no" on the chosen one-off slot */
  slotStates: Record<string, string>;
}

/**
 * Public: anyone holding the plan link can see the decision. There is no
 * personal data here beyond the display names the group already shares.
 */
export const getLockedPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(3).max(40) }).parse(data))
  .handler(async ({ data }): Promise<LockedPlan> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select(
        "id, name, slug, status, mode, cadence, duration_minutes, quorum_min, template",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (!project) throw new Error("This plan link isn't valid anymore.");

    const [{ data: decision }, { data: occurrences }, { data: participants }] = await Promise.all([
      supabaseAdmin
        .from("decisions")
        .select("chosen_slot_id, cadence_weekday, cadence_kind")
        .eq("project_id", project.id)
        .maybeSingle(),
      supabaseAdmin
        .from("occurrences")
        .select("id, scheduled_start_utc, scheduled_end_utc, status")
        .eq("project_id", project.id)
        .order("scheduled_start_utc"),
      supabaseAdmin
        .from("participants")
        .select("id, display_name, is_required")
        .eq("project_id", project.id)
        .order("display_name"),
    ]);

    const occIds = (occurrences ?? []).map((o) => o.id);
    const rsvps: LockedPlan["rsvps"] = {};
    if (occIds.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from("occurrence_rsvps")
        .select("occurrence_id, participant_id, state")
        .in("occurrence_id", occIds);
      for (const r of rows ?? []) {
        (rsvps[r.occurrence_id] ??= {})[r.participant_id] = r.state;
      }
    }

    const slotStates: Record<string, string> = {};
    if (decision?.chosen_slot_id) {
      const { data: rows } = await supabaseAdmin
        .from("slot_responses")
        .select("participant_id, state")
        .eq("candidate_slot_id", decision.chosen_slot_id);
      for (const r of rows ?? []) slotStates[r.participant_id] = r.state;
    }

    return {
      project,
      decision: decision ?? null,
      occurrences: (occurrences ?? []).map((o, i) => ({ ...o, index: i + 1 })),
      participants: participants ?? [],
      rsvps,
      slotStates,
    };
  });
