import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  DAY_KEYS,
  normalizePattern,
  parseWeeklyPattern,
  type DayKey,
  type WeeklyPattern,
} from "@/lib/weekly-availability";

/**
 * Turn one poll's answers into a standing weekly pattern.
 *
 * Only yes/maybe become ranges — a "no" for one specific Thursday is not a
 * standing rule about Thursdays, and treating it as one is how these systems
 * start lying about people.
 */
export async function rememberUsualFromAnswers(
  profileId: string,
  slots: { id: string; start_utc: string; end_utc: string }[],
  answers: { candidate_slot_id: string; state: "yes" | "maybe" | "no" }[],
  timezone: string,
): Promise<boolean> {
  const byId = new Map(slots.map((s) => [s.id, s]));
  const pattern: WeeklyPattern = {};

  for (const answer of answers) {
    if (answer.state === "no") continue;
    const slot = byId.get(answer.candidate_slot_id);
    if (!slot) continue;

    const start = toZonedTime(new Date(slot.start_utc), timezone);
    const end = toZonedTime(new Date(slot.end_utc), timezone);
    const day = DAY_KEYS[start.getDay()] as DayKey;
    const range = {
      start: format(start, "HH:mm"),
      // A slot that runs past midnight clamps — the next day is its own rule.
      end: format(end, "yyyy-MM-dd") === format(start, "yyyy-MM-dd") ? format(end, "HH:mm") : "23:59",
      state: answer.state,
    };

    const existing = pattern[day] ?? { all_day: false, ranges: [] };
    existing.ranges.push(range);
    pattern[day] = existing;
  }

  const merged = normalizePattern(pattern);
  if (Object.keys(merged).length === 0) return false;

  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("default_availability")
    .select("id, weekly_pattern")
    .eq("profile_id", profileId)
    .maybeSingle();

  // Merging rather than replacing: answering one poll shouldn't wipe out a
  // schedule someone deliberately set.
  const combined = existing
    ? normalizePattern(mergePatterns(parseWeeklyPattern(existing.weekly_pattern), merged))
    : merged;

  if (existing) {
    await supabaseAdmin
      .from("default_availability")
      .update({
        weekly_pattern: combined as unknown as Json,
        updated_at: now,
        last_confirmed_at: now,
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("default_availability").insert({
      profile_id: profileId,
      weekly_pattern: combined as unknown as Json,
      updated_at: now,
      last_confirmed_at: now,
    });
  }
  return true;
}

function mergePatterns(base: WeeklyPattern, extra: WeeklyPattern): WeeklyPattern {
  const out: WeeklyPattern = { ...base };
  for (const day of Object.keys(extra) as DayKey[]) {
    const a = out[day];
    const b = extra[day]!;
    if (!a) {
      out[day] = b;
      continue;
    }
    out[day] = { all_day: a.all_day || b.all_day, ranges: [...a.ranges, ...b.ranges] };
  }
  return out;
}
