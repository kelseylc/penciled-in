import { addDays, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateCandidateSlots, templateConstraints } from "@/lib/slots";
import { TEMPLATES } from "@/lib/templates";

export type RsvpState = "in" | "out" | "late";
export type OccurrenceStatus = "pending" | "confirmed" | "at_risk" | "repolling" | "cancelled";

export interface EvaluationResult {
  status: OccurrenceStatus;
  /** Set when a rescue poll is live for this session. */
  rescueSlug: string | null;
  attending: number;
  out: number;
  pendingCount: number;
  quorumMin: number;
  totalParticipants: number;
  inNames: string[];
  lateNames: string[];
  outNames: string[];
  noResponseNames: string[];
  requiredOut: string[];
}

function makeSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Recompute an occurrence's status from its RSVPs. Pure-ish: reads + one write. */
export async function evaluateOccurrence(occurrenceId: string): Promise<EvaluationResult> {
  const { data: occ } = await supabaseAdmin
    .from("occurrences")
    .select("id, project_id, status")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) throw new Error("That session isn't available anymore.");

  const [{ data: project }, { data: participants }, { data: rsvps }] = await Promise.all([
    supabaseAdmin.from("projects").select("id, quorum_min").eq("id", occ.project_id).maybeSingle(),
    supabaseAdmin
      .from("participants")
      .select("id, display_name, is_required")
      .eq("project_id", occ.project_id)
      .order("display_name"),
    supabaseAdmin
      .from("occurrence_rsvps")
      .select("participant_id, state")
      .eq("occurrence_id", occurrenceId),
  ]);

  const quorumMin = project?.quorum_min ?? 2;
  const byParticipant = new Map<string, RsvpState>();
  for (const r of rsvps ?? []) byParticipant.set(r.participant_id, r.state as RsvpState);

  const inNames: string[] = [];
  const lateNames: string[] = [];
  const outNames: string[] = [];
  const noResponseNames: string[] = [];
  const requiredOut: string[] = [];

  for (const p of participants ?? []) {
    const state = byParticipant.get(p.id);
    if (state === "in") inNames.push(p.display_name);
    else if (state === "late") lateNames.push(p.display_name);
    else if (state === "out") outNames.push(p.display_name);
    else noResponseNames.push(p.display_name);
    if (p.is_required && state === "out") requiredOut.push(p.display_name);
  }

  const attending = inNames.length + lateNames.length;
  const pendingCount = noResponseNames.length;

  let status: OccurrenceStatus;
  if (occ.status === "repolling" || occ.status === "cancelled") {
    status = occ.status as OccurrenceStatus;
  } else if (requiredOut.length > 0) {
    status = "at_risk";
  } else if (attending >= quorumMin) {
    status = "confirmed";
  } else if (attending + pendingCount >= quorumMin) {
    status = "pending";
  } else {
    status = "at_risk";
  }

  if (status !== occ.status) {
    await supabaseAdmin.from("occurrences").update({ status }).eq("id", occurrenceId);
  }

  // In a campaign, the rescue poll is not something the DM has to start — the
  // moment the table is short, it already exists.
  let rescueSlug: string | null = null;
  if (status === "at_risk") {
    const { ensureRescueProject } = await import("@/lib/rescue.server");
    const rescue = await ensureRescueProject(occurrenceId);
    if (rescue) {
      rescueSlug = rescue.slug;
      status = "repolling";
    }
  } else if (occ.status === "repolling") {
    const { data: refreshed } = await supabaseAdmin
      .from("occurrences")
      .select("rescue_project_id")
      .eq("id", occurrenceId)
      .maybeSingle();
    if (refreshed?.rescue_project_id) {
      const { data: rescueProject } = await supabaseAdmin
        .from("projects")
        .select("slug")
        .eq("id", refreshed.rescue_project_id)
        .maybeSingle();
      rescueSlug = rescueProject?.slug ?? null;
    }
  }

  return {
    status,
    rescueSlug,
    attending,
    out: outNames.length,
    pendingCount,
    quorumMin,
    totalParticipants: (participants ?? []).length,
    inNames,
    lateNames,
    outNames,
    noResponseNames,
    requiredOut,
  };
}

/**
 * Spawn a one-off re-poll project for a single occurrence: same people,
 * required flags, quorum, duration and template, window ±7 days.
 * The locked cadence is never touched.
 */
export async function createRepollProject(occurrenceId: string, organizerId: string) {
  const { data: occ } = await supabaseAdmin
    .from("occurrences")
    .select("id, project_id, scheduled_start_utc, scheduled_end_utc, status")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) throw new Error("That session isn't available anymore.");

  const { data: parent } = await supabaseAdmin
    .from("projects")
    .select(
      "id, name, template, duration_minutes, quorum_min, group_id, organizer_id, repoll_for_occurrence_id",
    )
    .eq("id", occ.project_id)
    .maybeSingle();
  if (!parent) throw new Error("Plan not found");

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("display_name, timezone, is_required, profile_id")
    .eq("project_id", parent.id)
    .order("display_name");

  const tz = participants?.[0]?.timezone || "UTC";
  const localDate = toZonedTime(new Date(occ.scheduled_start_utc), tz);
  const windowStart = format(addDays(localDate, -7), "yyyy-MM-dd");
  const windowEnd = format(addDays(localDate, 7), "yyyy-MM-dd");

  const template =
    TEMPLATES.find((t) => t.id === parent.template) ?? TEMPLATES[TEMPLATES.length - 1]!;

  const { slots } = generateCandidateSlots({
    constraints: templateConstraints(template, parent.duration_minutes),
    windowStart,
    windowEnd,
    timezone: tz,
  });
  if (slots.length === 0) throw new Error("Couldn't build any times for that week.");

  const slug = makeSlug();
  const { data: project, error } = await supabaseAdmin
    .from("projects")
    .insert({
      name: `Re-poll: ${parent.name}`,
      template: parent.template,
      duration_minutes: parent.duration_minutes,
      mode: "one_off",
      cadence: null,
      window_mode: "custom",
      window_start: windowStart,
      window_end: windowEnd,
      quorum_min: parent.quorum_min,
      group_id: parent.group_id,
      organizer_id: parent.organizer_id ?? organizerId,
      status: "collecting",
      slug,
      parent_project_id: parent.id,
      repoll_for_occurrence_id: occ.id,
    })
    .select("id, slug")
    .single();
  if (error || !project) throw new Error(error?.message ?? "Could not start the re-poll");

  const { error: pErr } = await supabaseAdmin.from("participants").insert(
    (participants ?? []).map((p) => ({
      project_id: project.id,
      display_name: p.display_name,
      timezone: p.timezone,
      is_required: p.is_required,
      profile_id: p.profile_id,
    })),
  );
  if (pErr) throw new Error(pErr.message);

  const { error: sErr } = await supabaseAdmin
    .from("candidate_slots")
    .insert(slots.map((s) => ({ project_id: project.id, ...s })));
  if (sErr) throw new Error(sErr.message);

  await supabaseAdmin.from("occurrences").update({ status: "repolling" }).eq("id", occ.id);

  return { slug: project.slug, projectId: project.id };
}

/** Move a single occurrence to the re-polled time. Cadence untouched. */
export async function applyRepollResult(occurrenceId: string, startUtc: string, endUtc: string) {
  await supabaseAdmin
    .from("occurrences")
    .update({
      scheduled_start_utc: startUtc,
      scheduled_end_utc: endUtc,
      status: "pending",
    })
    .eq("id", occurrenceId);
  await supabaseAdmin.from("occurrence_rsvps").delete().eq("occurrence_id", occurrenceId);
}
