import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createRepollProject } from "@/lib/occurrences.server";
import type { OrganizerOccurrence } from "@/lib/occurrences.functions";

type SB = SupabaseClient<Database>;

export async function loadOrganizerOccurrences(
  sb: SB,
  slug: string | null,
): Promise<OrganizerOccurrence[]> {
  let projectQuery = sb
    .from("projects")
    .select("id, name, slug, quorum_min, mode, status")
    .is("repoll_for_occurrence_id", null);
  if (slug) projectQuery = projectQuery.eq("slug", slug);

  const { data: projects } = await projectQuery;
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) return [];

  const nowIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const [{ data: occurrences }, { data: participants }, { data: repolls }] = await Promise.all([
    sb
      .from("occurrences")
      .select("id, project_id, scheduled_start_utc, scheduled_end_utc, status")
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
    };
  });
}

export async function runOccurrenceAction(
  sb: SB,
  userId: string,
  occurrenceId: string,
  action: "repoll" | "go_ahead" | "cancel",
) {
  // RLS check: the caller must be able to see this occurrence.
  const { data: occ } = await sb
    .from("occurrences")
    .select("id, project_id")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) throw new Error("You can't manage that session.");

  if (action === "repoll") {
    const { slug } = await createRepollProject(occurrenceId, userId);
    return { ok: true, repollSlug: slug };
  }

  if (action === "cancel") {
    const { error } = await sb
      .from("occurrences")
      .update({ status: "cancelled" })
      .eq("id", occurrenceId);
    if (error) throw new Error(error.message);
    return { ok: true, repollSlug: null };
  }

  const { error } = await sb
    .from("occurrences")
    .update({ status: "confirmed" })
    .eq("id", occurrenceId);
  if (error) throw new Error(error.message);
  return { ok: true, repollSlug: null };
}
