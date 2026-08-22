import { format, startOfWeek } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export type SlotState = "yes" | "maybe" | "no";

export interface SummarySlot {
  id: string;
  start_utc: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function daypartOf(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Plain-English bullets describing what the person answered. */
export function summarizeAnswers(
  slots: SummarySlot[],
  answers: Record<string, SlotState>,
  timezone: string,
): string[] {
  const bullets: string[] = [];
  const buckets = new Map<string, { yes: number; total: number }>();
  const weeks = new Map<string, { no: number; total: number; label: string }>();
  let yesCount = 0;
  let maybeCount = 0;

  for (const slot of slots) {
    const local = toZonedTime(new Date(slot.start_utc), timezone);
    const key = `${local.getDay()}|${daypartOf(local.getHours())}`;
    const bucket = buckets.get(key) ?? { yes: 0, total: 0 };
    bucket.total += 1;
    const state = answers[slot.id];
    if (state === "yes") {
      bucket.yes += 1;
      yesCount += 1;
    }
    if (state === "maybe") maybeCount += 1;
    buckets.set(key, bucket);

    const weekStart = startOfWeek(local, { weekStartsOn: 1 });
    const wk = `${format(weekStart, "yyyy-MM-dd")}`;
    const w = weeks.get(wk) ?? { no: 0, total: 0, label: format(weekStart, "MMM d") };
    w.total += 1;
    if (state === "no") w.no += 1;
    weeks.set(wk, w);
  }

  const goodBuckets = [...buckets.entries()]
    .filter(([, v]) => v.yes > 0)
    .sort((a, b) => b[1].yes / b[1].total - a[1].yes / a[1].total)
    .slice(0, 3);

  for (const [key, value] of goodBuckets) {
    const [dayIdx, part] = key.split("|");
    const day = WEEKDAYS[Number(dayIdx)];
    const qualifier = value.yes === value.total ? "every" : value.yes > 1 ? "most" : "one";
    bullets.push(
      qualifier === "one"
        ? `Free one ${day} ${part}`
        : `Free ${qualifier} ${day} ${part}s`,
    );
  }

  for (const [, w] of weeks) {
    if (w.total > 0 && w.no === w.total) {
      bullets.push(`Nothing works the week of ${w.label}`);
    }
  }

  if (maybeCount > 0) {
    bullets.push(`${maybeCount} time${maybeCount === 1 ? "" : "s"} marked as a maybe`);
  }
  if (yesCount === 0 && maybeCount === 0) {
    bullets.push("Nothing in this window works for you");
  }

  return bullets;
}
