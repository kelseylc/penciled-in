import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evaluateOccurrence } from "@/lib/occurrences.server";
import type { OccurrenceGuestBundle } from "@/lib/occurrences.functions";

async function resolveParticipant(
  projectId: string,
  token?: string | null,
  name?: string | null,
) {
  if (token) {
    const { data } = await supabaseAdmin
      .from("participants")
      .select("id, display_name, token")
      .eq("project_id", projectId)
      .eq("token", token)
      .maybeSingle();
    if (data) return data;
  }
  if (name) {
    const { data } = await supabaseAdmin
      .from("participants")
      .select("id, display_name, token")
      .eq("project_id", projectId)
      .ilike("display_name", name);
    if (data?.[0]) return data[0];
  }
  return null;
}

export async function loadOccurrenceGuestBundle(input: {
  occurrenceId: string;
  token?: string | null;
  name?: string | null;
}): Promise<OccurrenceGuestBundle> {
  const { data: occ } = await supabaseAdmin
    .from("occurrences")
    .select("id, project_id, scheduled_start_utc, scheduled_end_utc, status")
    .eq("id", input.occurrenceId)
    .maybeSingle();
  if (!occ) throw new Error("That session link isn't valid anymore.");

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("name, slug, quorum_min")
    .eq("id", occ.project_id)
    .maybeSingle();
  if (!project) throw new Error("That session link isn't valid anymore.");

  const { data: siblings } = await supabaseAdmin
    .from("occurrences")
    .select("id")
    .eq("project_id", occ.project_id)
    .order("scheduled_start_utc", { ascending: true });
  const index = (siblings ?? []).findIndex((s) => s.id === occ.id) + 1;

  const evaluation = await evaluateOccurrence(occ.id);
  const participant = await resolveParticipant(occ.project_id, input.token, input.name);

  let me: OccurrenceGuestBundle["me"] = null;
  if (participant) {
    const { data: rsvp } = await supabaseAdmin
      .from("occurrence_rsvps")
      .select("state, note")
      .eq("occurrence_id", occ.id)
      .eq("participant_id", participant.id)
      .maybeSingle();
    me = {
      id: participant.id,
      display_name: participant.display_name,
      state: (rsvp?.state as "in" | "out" | "late" | undefined) ?? null,
      note: rsvp?.note ?? null,
    };
  }

  return {
    occurrence: {
      id: occ.id,
      project_id: occ.project_id,
      scheduled_start_utc: occ.scheduled_start_utc,
      scheduled_end_utc: occ.scheduled_end_utc,
      status: evaluation.status,
      index: index > 0 ? index : 1,
      total: (siblings ?? []).length,
    },
    project,
    me,
    tally: {
      attending: evaluation.attending,
      out: evaluation.out,
      noResponse: evaluation.pendingCount,
      total: evaluation.totalParticipants,
    },
  };
}

export async function saveOccurrenceRsvp(input: {
  occurrenceId: string;
  token?: string | null;
  name?: string | null;
  state: "in" | "out" | "late";
  note?: string | null;
}) {
  const { data: occ } = await supabaseAdmin
    .from("occurrences")
    .select("id, project_id, status")
    .eq("id", input.occurrenceId)
    .maybeSingle();
  if (!occ) throw new Error("That session link isn't valid anymore.");
  if (occ.status === "cancelled") throw new Error("This session was cancelled.");

  let participant = await resolveParticipant(occ.project_id, input.token, input.name);
  if (!participant && input.name) {
    const { data: created, error } = await supabaseAdmin
      .from("participants")
      .insert({ project_id: occ.project_id, display_name: input.name, is_required: false })
      .select("id, display_name, token")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not add you to this session");
    participant = created;
  }
  if (!participant) throw new Error("Tell us who you are first.");

  await supabaseAdmin
    .from("occurrence_rsvps")
    .delete()
    .eq("occurrence_id", occ.id)
    .eq("participant_id", participant.id);

  const { error } = await supabaseAdmin.from("occurrence_rsvps").insert({
    occurrence_id: occ.id,
    participant_id: participant.id,
    state: input.state,
    note: input.note || null,
  });
  if (error) throw new Error(error.message);

  const evaluation = await evaluateOccurrence(occ.id);

  return {
    ok: true,
    token: participant.token,
    status: evaluation.status,
    tally: {
      attending: evaluation.attending,
      out: evaluation.out,
      noResponse: evaluation.pendingCount,
      total: evaluation.totalParticipants,
    },
  };
}
