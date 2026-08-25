import { addDays } from "date-fns";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * The rescue loop.
 *
 * A campaign dies in the gap between "someone can't make it" and "someone
 * creates a new poll". So the poll is not something the DM creates — it
 * already exists the moment a session goes at risk, with a handful of
 * forward-looking times and nothing to fill in.
 */

/**
 * Days offset from the original session, in the order players see them.
 * Deliberately five: enough to find a night, few enough to answer in one screen.
 */
const RESCUE_OFFSETS = [1, -1, 7, 8, 14];

function makeSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (const b of crypto.getRandomValues(new Uint8Array(8))) out += alphabet[b % alphabet.length];
  return out;
}

export interface CampaignContext {
  isCampaign: boolean;
  autoLock: boolean;
  groupId: string | null;
  tableRule: string | null;
}

export async function campaignContextForProject(projectId: string): Promise<CampaignContext> {
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, app_mode, group_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { isCampaign: false, autoLock: false, groupId: null, tableRule: null };

  let groupMode: string | null = null;
  let autoLock = true;
  let tableRule: string | null = null;
  if (project.group_id) {
    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("mode, auto_lock_rescue, table_rule")
      .eq("id", project.group_id)
      .maybeSingle();
    groupMode = group?.mode ?? null;
    autoLock = group?.auto_lock_rescue ?? true;
    tableRule = group?.table_rule ?? null;
  }

  return {
    isCampaign: project.app_mode === "campaign" || groupMode === "campaign",
    autoLock,
    groupId: project.group_id,
    tableRule,
  };
}

/**
 * Idempotent: if this session already has a rescue poll, hand back the same
 * one. Nobody should ever end up with two competing polls for one night.
 */
export async function ensureRescueProject(
  occurrenceId: string,
): Promise<{ slug: string; projectId: string } | null> {
  const { data: occ } = await supabaseAdmin
    .from("occurrences")
    .select("id, project_id, scheduled_start_utc, scheduled_end_utc, rescue_project_id")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) return null;

  if (occ.rescue_project_id) {
    const { data: existing } = await supabaseAdmin
      .from("projects")
      .select("id, slug, status")
      .eq("id", occ.rescue_project_id)
      .maybeSingle();
    if (existing && existing.status !== "cancelled") {
      return { slug: existing.slug, projectId: existing.id };
    }
  }

  const context = await campaignContextForProject(occ.project_id);
  if (!context.isCampaign) return null;

  const { data: parent } = await supabaseAdmin
    .from("projects")
    .select("id, name, template, duration_minutes, quorum_min, group_id, organizer_id")
    .eq("id", occ.project_id)
    .maybeSingle();
  if (!parent) return null;

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("display_name, timezone, is_required, profile_id, role")
    .eq("project_id", parent.id)
    .order("display_name");

  const start = new Date(occ.scheduled_start_utc);
  const end = new Date(occ.scheduled_end_utc);
  const durationMs = Math.max(end.getTime() - start.getTime(), 60 * 60 * 1000);
  const now = Date.now();

  // Same time of night, different nights — never a time that has already passed.
  const slots = RESCUE_OFFSETS.map((offset) => addDays(start, offset))
    .filter((d) => d.getTime() > now)
    .map((d) => ({
      start_utc: d.toISOString(),
      end_utc: new Date(d.getTime() + durationMs).toISOString(),
    }));
  if (slots.length === 0) return null;

  const slug = makeSlug();
  const { data: project, error } = await supabaseAdmin
    .from("projects")
    .insert({
      name: `Rescue: ${parent.name.replace(/ — cadence$/, "")}`,
      template: parent.template,
      app_mode: "campaign",
      is_rescue: true,
      duration_minutes: parent.duration_minutes,
      mode: "one_off",
      cadence: null,
      window_mode: "custom",
      window_start: slots[0]!.start_utc.slice(0, 10),
      window_end: slots[slots.length - 1]!.start_utc.slice(0, 10),
      quorum_min: parent.quorum_min,
      group_id: parent.group_id,
      organizer_id: parent.organizer_id,
      status: "collecting",
      slug,
      parent_project_id: parent.id,
      repoll_for_occurrence_id: occ.id,
    })
    .select("id, slug")
    .single();
  if (error || !project) return null;

  await supabaseAdmin.from("participants").insert(
    (participants ?? []).map((p) => ({
      project_id: project.id,
      display_name: p.display_name,
      timezone: p.timezone,
      is_required: p.is_required,
      profile_id: p.profile_id,
      role: p.role,
    })),
  );

  await supabaseAdmin
    .from("candidate_slots")
    .insert(slots.map((s) => ({ project_id: project.id, ...s })));

  await supabaseAdmin
    .from("occurrences")
    .update({ rescue_project_id: project.id, status: "repolling" })
    .eq("id", occ.id);

  return { slug: project.slug, projectId: project.id };
}

export interface AutoLockResult {
  locked: boolean;
  startUtc?: string;
  endUtc?: string;
  occurrenceId?: string;
}

/**
 * The first slot that clears the bar wins, immediately. Waiting for the DM to
 * come back and press a button is the exact delay this whole feature exists
 * to remove.
 */
export async function maybeAutoLockRescue(projectId: string): Promise<AutoLockResult> {
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, is_rescue, status, quorum_min, repoll_for_occurrence_id, group_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || !project.is_rescue || project.status !== "collecting") return { locked: false };
  if (!project.repoll_for_occurrence_id) return { locked: false };

  const context = await campaignContextForProject(projectId);
  if (!context.autoLock) return { locked: false };

  const [{ data: participants }, { data: slots }] = await Promise.all([
    supabaseAdmin.from("participants").select("id, is_required").eq("project_id", projectId),
    supabaseAdmin
      .from("candidate_slots")
      .select("id, start_utc, end_utc")
      .eq("project_id", projectId)
      .order("start_utc"),
  ]);
  if (!participants?.length || !slots?.length) return { locked: false };

  const { data: responses } = await supabaseAdmin
    .from("slot_responses")
    .select("participant_id, candidate_slot_id, state")
    .in(
      "candidate_slot_id",
      slots.map((s) => s.id),
    );

  const requiredIds = new Set(participants.filter((p) => p.is_required).map((p) => p.id));

  for (const slot of slots) {
    const forSlot = (responses ?? []).filter((r) => r.candidate_slot_id === slot.id);
    const positive = forSlot.filter((r) => r.state === "yes" || r.state === "maybe");
    const requiredCovered = [...requiredIds].every((id) =>
      positive.some((r) => r.participant_id === id),
    );
    if (!requiredCovered) continue;
    if (positive.length < project.quorum_min) continue;

    await supabaseAdmin
      .from("occurrences")
      .update({
        scheduled_start_utc: slot.start_utc,
        scheduled_end_utc: slot.end_utc,
        status: "confirmed",
        moved_at: new Date().toISOString(),
      })
      .eq("id", project.repoll_for_occurrence_id);
    await supabaseAdmin
      .from("occurrence_rsvps")
      .delete()
      .eq("occurrence_id", project.repoll_for_occurrence_id);
    await supabaseAdmin.from("projects").update({ status: "decided" }).eq("id", projectId);
    await supabaseAdmin.from("decisions").insert({
      project_id: projectId,
      chosen_slot_id: slot.id,
      cadence_kind: null,
    });

    return {
      locked: true,
      startUtc: slot.start_utc,
      endUtc: slot.end_utc,
      occurrenceId: project.repoll_for_occurrence_id,
    };
  }

  return { locked: false };
}

/** Mark a session as played and stamp its number, so "days since" stays honest. */
export async function markSessionPlayed(occurrenceId: string) {
  const { data: occ } = await supabaseAdmin
    .from("occurrences")
    .select("id, project_id, session_number, played_at")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ || occ.played_at) return;

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("group_id")
    .eq("id", occ.project_id)
    .maybeSingle();

  let sessionNumber = occ.session_number;
  if (project?.group_id) {
    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("session_counter")
      .eq("id", project.group_id)
      .maybeSingle();
    sessionNumber = (group?.session_counter ?? 0) + 1;
    await supabaseAdmin
      .from("groups")
      .update({ session_counter: sessionNumber })
      .eq("id", project.group_id);
  }

  await supabaseAdmin
    .from("occurrences")
    .update({ played_at: new Date().toISOString(), session_number: sessionNumber })
    .eq("id", occurrenceId);
}

/** Days since the campaign last actually played. Null when it never has. */
export async function daysSinceLastPlayed(groupId: string): Promise<number | null> {
  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("group_id", groupId);
  const ids = (projects ?? []).map((p) => p.id);
  if (ids.length === 0) return null;

  const { data: last } = await supabaseAdmin
    .from("occurrences")
    .select("played_at")
    .in("project_id", ids)
    .not("played_at", "is", null)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last?.played_at) return null;

  return Math.floor((Date.now() - new Date(last.played_at).getTime()) / 86_400_000);
}
