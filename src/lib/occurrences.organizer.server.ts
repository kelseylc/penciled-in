import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createRepollProject } from "@/lib/occurrences.server";
import { daysSinceLastPlayed, ensureRescueProject, markSessionPlayed } from "@/lib/rescue.server";
import type { OrganizerOccurrence } from "@/lib/occurrences.functions";

type SB = SupabaseClient<Database>;

export async function loadOrganizerOccurrences(
  sb: SB,
  slug: string | null,
): Promise<OrganizerOccurrence[]> {
  let projectQuery = sb
    .from("projects")
    .select("id, name, slug, quorum_min, mode, status, app_mode, group_id")
    .is("repoll_for_occurrence_id", null)
    .eq("is_rescue", false);
  if (slug) projectQuery = projectQuery.eq("slug", slug);

  const { data: projects } = await projectQuery;
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) return [];

  // Reaches a week back so a session that has already happened can still be
  // marked "we played" — that stamp is what keeps the campaign health honest.
  const nowIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: occurrences }, { data: participants }, { data: repolls }] = await Promise.all([
    sb
      .from("occurrences")
      .select(
        "id, project_id, scheduled_start_utc, scheduled_end_utc, status, session_number, played_at, moved_at, rescue_project_id",
      )
      .in("project_id", projectIds)
      .gte("scheduled_start_utc", nowIso)
      .order("scheduled_start_utc", { ascending: true }),
    sb
      .from("participants")
      .select("id, project_id, display_name, is_required")
      .in("project_id", projectIds)
      .order("display_name"),
    sb
      .from("projects")
      .select("slug, repoll_for_occurrence_id")
      .in("parent_project_id", projectIds),
  ]);

  const occIds = (occurrences ?? []).map((o) => o.id);
  const rsvpByOcc = new Map<string, Map<string, string>>();
  if (occIds.length > 0) {
    const { data: rsvps } = await sb
      .from("occurrence_rsvps")
      .select("occurrence_id, participant_id, state")
      .in("occurrence_id", occIds);
    for (const r of rsvps ?? []) {
      const bucket = rsvpByOcc.get(r.occurrence_id) ?? new Map<string, string>();
      bucket.set(r.participant_id, r.state);
      rsvpByOcc.set(r.occurrence_id, bucket);
    }
  }

  const repollByOcc = new Map<string, string>();
  for (const r of repolls ?? []) {
    if (r.repoll_for_occurrence_id) repollByOcc.set(r.repoll_for_occurrence_id, r.slug);
  }

  // "Days since we last played" is per campaign, so it is resolved once per
  // group rather than once per session.
  const groupIds = [...new Set((projects ?? []).map((p) => p.group_id).filter(Boolean))] as string[];
  const gapByGroup = new Map<string, number | null>();
  await Promise.all(
    groupIds.map(async (id) => gapByGroup.set(id, await daysSinceLastPlayed(id))),
  );

  return (occurrences ?? []).map((occ) => {
    const project = (projects ?? []).find((p) => p.id === occ.project_id)!;
    const people = (participants ?? []).filter((p) => p.project_id === occ.project_id);
    const states = rsvpByOcc.get(occ.id) ?? new Map<string, string>();

    const inNames: string[] = [];
    const lateNames: string[] = [];
    const outNames: string[] = [];
    const noResponseNames: string[] = [];
    const requiredOut: string[] = [];
    for (const p of people) {
      const state = states.get(p.id);
      if (state === "in") inNames.push(p.display_name);
      else if (state === "late") lateNames.push(p.display_name);
      else if (state === "out") outNames.push(p.display_name);
      else noResponseNames.push(p.display_name);
      if (p.is_required && state === "out") requiredOut.push(p.display_name);
    }

    return {
      id: occ.id,
      project_id: occ.project_id,
      project_name: project.name,
      project_slug: project.slug,
      scheduled_start_utc: occ.scheduled_start_utc,
      scheduled_end_utc: occ.scheduled_end_utc,
      status: occ.status,
      quorum_min: project.quorum_min,
      attending: inNames.length + lateNames.length,
      totalParticipants: people.length,
      inNames,
      lateNames,
      outNames,
      noResponseNames,
      requiredOut,
      repollSlug: repollByOcc.get(occ.id) ?? null,
      appMode: project.app_mode === "campaign" ? ("campaign" as const) : ("plans" as const),
      sessionNumber: occ.session_number,
      playedAt: occ.played_at,
      movedAt: occ.moved_at,
      groupId: project.group_id,
      daysSinceLastPlayed: project.group_id ? (gapByGroup.get(project.group_id) ?? null) : null,
    };
  });
}

export async function runOccurrenceAction(
  sb: SB,
  userId: string,
  occurrenceId: string,
  action: "repoll" | "go_ahead" | "cancel" | "played" | "acknowledge",
  origin?: string | null,
) {
  // RLS check: the caller must be able to see this occurrence.
  const { data: occ } = await sb
    .from("occurrences")
    .select("id, project_id")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) throw new Error("You can't manage that session.");

  const { ensureNextOccurrence } = await import("@/lib/anti-drift.server");

  if (action === "repoll") {
    // Campaigns get the five-chip rescue poll; everything else keeps the
    // full ±7 day re-poll grid.
    const rescue = await ensureRescueProject(occurrenceId);
    if (rescue) return { ok: true, repollSlug: rescue.slug, nextStartUtc: null };
    const { slug } = await createRepollProject(occurrenceId, userId);
    return { ok: true, repollSlug: slug, nextStartUtc: null };
  }

  if (action === "acknowledge") {
    // "Got it" clears the moved-session banner for the whole table.
    const { error } = await sb
      .from("occurrences")
      .update({ moved_at: null })
      .eq("id", occurrenceId);
    if (error) throw new Error(error.message);
    return { ok: true, repollSlug: null, nextStartUtc: null };
  }

  if (action === "played") {
    await markSessionPlayed(occurrenceId);
    // Never empty: logging a session immediately mints the next one.
    const next = await ensureNextOccurrence(occ.project_id);
    return { ok: true, repollSlug: null, nextStartUtc: next?.scheduled_start_utc ?? null };
  }

  if (action === "cancel") {
    const { error } = await sb
      .from("occurrences")
      .update({ status: "cancelled" })
      .eq("id", occurrenceId);
    if (error) throw new Error(error.message);
    // Skipping one night must never leave the calendar blank.
    const next = await ensureNextOccurrence(occ.project_id);
    return { ok: true, repollSlug: null, nextStartUtc: next?.scheduled_start_utc ?? null };
  }

  const { error } = await sb
    .from("occurrences")
    .update({ status: "confirmed" })
    .eq("id", occurrenceId);
  if (error) throw new Error(error.message);
  void origin;
  return { ok: true, repollSlug: null, nextStartUtc: null };
}

