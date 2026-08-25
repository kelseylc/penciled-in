import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailShell, formatInZone, sendEmail } from "@/lib/email.server";

/**
 * Auto-lock only works if the group knows it happened. A silently moved
 * session is worse than no rescue at all, so every auto-lock announces itself:
 * email now, a persistent home banner until dismissed, and a paste-ready line
 * for the group chat.
 */

export interface Announcement {
  sessionLabel: string;
  inNames: string[];
  outNames: string[];
  /** One line, ready to paste into the group chat. */
  text: string;
  emailed: number;
}

function listNames(names: string[]): string {
  if (names.length === 0) return "nobody yet";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export async function announceMovedOccurrence(
  occurrenceId: string,
  origin: string,
): Promise<Announcement | null> {
  const { data: occ } = await supabaseAdmin
    .from("occurrences")
    .select("id, project_id, scheduled_start_utc, session_number")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (!occ) return null;

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, name, app_mode")
    .eq("id", occ.project_id)
    .maybeSingle();
  if (!project) return null;

  const { data: participants } = await supabaseAdmin
    .from("participants")
    .select("id, display_name, timezone, profile_id")
    .eq("project_id", occ.project_id)
    .order("display_name");

  const { data: rsvps } = await supabaseAdmin
    .from("occurrence_rsvps")
    .select("participant_id, state")
    .eq("occurrence_id", occ.id);

  const outIds = new Set((rsvps ?? []).filter((r) => r.state === "out").map((r) => r.participant_id));
  const inNames = (participants ?? []).filter((p) => !outIds.has(p.id)).map((p) => p.display_name);
  const outNames = (participants ?? []).filter((p) => outIds.has(p.id)).map((p) => p.display_name);

  const label =
    project.app_mode === "campaign" && occ.session_number
      ? `Session ${occ.session_number}`
      : project.name.replace(/ — cadence$/, "");

  const link = `${origin}/o/${occ.id}`;
  const text = `${label} moved to ${formatInZone(occ.scheduled_start_utc, participants?.[0]?.timezone ?? "UTC")}\nIn: ${listNames(inNames)}${outNames.length ? ` · Out: ${listNames(outNames)}` : ""}\n${link}`;

  // Everyone sees the banner again — this change must not be missable.
  await supabaseAdmin
    .from("participants")
    .update({ last_seen_change_at: null })
    .eq("project_id", occ.project_id);

  let emailed = 0;
  const profileIds = (participants ?? []).map((p) => p.profile_id).filter((v): v is string => !!v);
  if (profileIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", profileIds);
    const emails = new Map((profiles ?? []).filter((p) => p.email).map((p) => [p.id, p.email!]));
    for (const p of participants ?? []) {
      const to = p.profile_id ? emails.get(p.profile_id) : undefined;
      if (!to) continue;
      const when = formatInZone(occ.scheduled_start_utc, p.timezone);
      const ok = await sendEmail(
        to,
        `${label} moved to ${when}`,
        `${label} moved to ${when}.\n\nIn: ${listNames(inNames)}${outNames.length ? `\nOut: ${listNames(outNames)}` : ""}\n\nIt locked in automatically because everyone required could make it. Your regular cadence hasn't moved.\n\n${link}`,
        emailShell(
          `${label} moved to ${when}`,
          `<p style="margin:0 0 12px;">It locked in automatically because everyone required could make it. <strong>Just this one</strong> — your regular cadence stays put.</p>
           <p style="margin:0;">In: ${listNames(inNames)}${outNames.length ? `<br>Out: ${listNames(outNames)}` : ""}</p>`,
          { label: "See the session", link },
        ),
      );
      if (ok) emailed += 1;
    }
  }

  await supabaseAdmin
    .from("occurrences")
    .update({ announced_at: new Date().toISOString() })
    .eq("id", occ.id);

  return { sessionLabel: label, inNames, outNames, text, emailed };
}
