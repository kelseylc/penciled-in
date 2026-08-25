import { addDays, addMonths } from "date-fns";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailShell, formatInZone, sendEmail } from "@/lib/email.server";
import { DRIFT_ALARM_DAYS } from "@/lib/anti-drift.shared";
import { daysSinceLastPlayed } from "@/lib/rescue.server";

/**
 * Anti-drift.
 *
 * Two rules keep a campaign alive:
 *  1. Never empty — the calendar always holds a next session. Cancelling or
 *     playing one immediately mints the following one from the locked cadence.
 *  2. Notice the silence — 45 days without a played session and we say so,
 *     out loud, with three honest options including "pause".
 */

export { DRIFT_ALARM_DAYS } from "@/lib/anti-drift.shared";

function advance(date: Date, cadence: string | null): Date {
  if (cadence === "biweekly") return addDays(date, 14);
  if (cadence === "monthly") return addMonths(date, 1);
  if (cadence === "quarterly") return addMonths(date, 3);
  return addDays(date, 7);
}

/**
 * Guarantee a future session exists for a locked recurring project.
 * Idempotent — returns the next occurrence either way.
 */
export async function ensureNextOccurrence(
  projectId: string,
): Promise<{ id: string; scheduled_start_utc: string } | null> {
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, mode, duration_minutes, status")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.mode !== "recurring") return null;

  const nowIso = new Date().toISOString();
  const { data: upcoming } = await supabaseAdmin
    .from("occurrences")
    .select("id, scheduled_start_utc")
    .eq("project_id", projectId)
    .gte("scheduled_start_utc", nowIso)
    .not("status", "in", '("cancelled")')
    .order("scheduled_start_utc", { ascending: true })
    .limit(1);
  if (upcoming?.[0]) return upcoming[0];

  const { data: decision } = await supabaseAdmin
    .from("decisions")
    .select("cadence_kind")
    .eq("project_id", projectId)
    .maybeSingle();

  const { data: last } = await supabaseAdmin
    .from("occurrences")
    .select("scheduled_start_utc, scheduled_end_utc")
    .eq("project_id", projectId)
    .order("scheduled_start_utc", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return null;

  // Walk the cadence forward until we're past today — same weekday, same time.
  let start = new Date(last.scheduled_start_utc);
  const durationMs = Math.max(
    new Date(last.scheduled_end_utc).getTime() - start.getTime(),
    30 * 60_000,
  );
  let guard = 0;
  while (start.getTime() <= Date.now() && guard < 60) {
    start = advance(start, decision?.cadence_kind ?? "weekly");
    guard += 1;
  }
  if (start.getTime() <= Date.now()) return null;

  const { data: created } = await supabaseAdmin
    .from("occurrences")
    .insert({
      project_id: projectId,
      scheduled_start_utc: start.toISOString(),
      scheduled_end_utc: new Date(start.getTime() + durationMs).toISOString(),
      status: "pending",
    })
    .select("id, scheduled_start_utc")
    .single();

  return created ?? null;
}

export interface DriftReport {
  groupId: string;
  groupName: string;
  daysSince: number | null;
  emailed: boolean;
}

/**
 * The 45-day alarm. It never nags a paused campaign, and it only fires when
 * nothing else is already in flight (no live poll, no upcoming session).
 */
export async function driftSweep(origin: string): Promise<DriftReport[]> {
  const { data: groups } = await supabaseAdmin
    .from("groups")
    .select("id, name, campaign_name, slug, owner_id, paused_at")
    .eq("mode", "campaign")
    .is("paused_at", null);

  const reports: DriftReport[] = [];

  for (const group of groups ?? []) {
    const days = await daysSinceLastPlayed(group.id);
    if (days === null || days < DRIFT_ALARM_DAYS) continue;

    const { data: projects } = await supabaseAdmin
      .from("projects")
      .select("id, status")
      .eq("group_id", group.id);
    const ids = (projects ?? []).map((p) => p.id);

    // An open poll means the group is already trying — don't pile on.
    const collecting = (projects ?? []).some((p) => p.status === "collecting");
    if (collecting) continue;

    if (ids.length > 0) {
      // Never empty: top the calendar back up before we complain about it.
      for (const p of projects ?? []) await ensureNextOccurrence(p.id);
      const { data: upcoming } = await supabaseAdmin
        .from("occurrences")
        .select("id, scheduled_start_utc")
        .in("project_id", ids)
        .gte("scheduled_start_utc", new Date().toISOString())
        .neq("status", "cancelled")
        .limit(1);
      if (upcoming?.[0]) {
        reports.push({
          groupId: group.id,
          groupName: group.campaign_name ?? group.name,
          daysSince: days,
          emailed: false,
        });
        continue;
      }
    }

    let emailed = false;
    if (group.owner_id) {
      const { data: owner } = await supabaseAdmin
        .from("profiles")
        .select("email, timezone")
        .eq("id", group.owner_id)
        .maybeSingle();
      if (owner?.email) {
        const name = group.campaign_name ?? group.name;
        const link = `${origin}/g/${group.slug}`;
        emailed = await sendEmail(
          owner.email,
          `${name}: ${days} days since you played`,
          `It's been ${days} days since ${name} last played.\n\nThree honest options: pick a new cadence, run one rescue poll for a single night, or pause the campaign so we stop nagging.\n\n${link}\n\n— Penciled.in`,
          emailShell(
            `${days} days since ${name} played`,
            `<p style="margin:0 0 12px;">No judgement — campaigns drift. Three honest options:</p>
             <p style="margin:0 0 4px;">1. Pick a new cadence that fits real life now.</p>
             <p style="margin:0 0 4px;">2. Run one rescue poll for a single night.</p>
             <p style="margin:0;">3. Pause the campaign — we'll stop nagging until you're back.</p>`,
            { label: "Open the campaign", link },
          ),
        );
      }
    }

    reports.push({
      groupId: group.id,
      groupName: group.campaign_name ?? group.name,
      daysSince: days,
      emailed,
    });
  }

  return reports;
}

/** Human sentence for the drift banner. */
export function driftLine(days: number | null, next: string | null, timezone: string | null) {
  if (days === null) return "You haven't logged a session yet.";
  if (days < DRIFT_ALARM_DAYS) return `${days} days since you last played.`;
  return next
    ? `${days} days since you last played. Next on the calendar: ${formatInZone(next, timezone)}.`
    : `${days} days since you last played, and nothing's on the calendar.`;
}
