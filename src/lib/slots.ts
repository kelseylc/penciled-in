import { addDays, format, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

import type { ProjectTemplate, TimeRange } from "./templates";

export type Granularity = "daypart" | "hourly";

export interface GeneratedSlot {
  start_utc: string;
  end_utc: string;
}

export interface SlotGenerationResult {
  slots: GeneratedSlot[];
  granularityUsed: Granularity;
  widened: boolean;
  truncated: boolean;
}

export const MAX_SLOTS = 200;

const DAYPARTS: TimeRange[] = [
  { start: 8, end: 12 }, // morning
  { start: 12, end: 17 }, // afternoon
  { start: 17, end: 24 }, // evening
];

function toUtc(dayISO: string, hour: number, timezone: string): Date {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const base = parseISO(`${dayISO}T00:00:00`);
  const shifted = addDays(base, Math.floor(h / 24));
  const local = `${format(shifted, "yyyy-MM-dd")}T${String(h % 24).padStart(2, "0")}:${String(
    m,
  ).padStart(2, "0")}:00`;
  return fromZonedTime(local, timezone);
}

function intersect(a: TimeRange, b: TimeRange): TimeRange | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

function buildSlots(
  template: ProjectTemplate,
  durationMinutes: number,
  windowStart: string,
  windowEnd: string,
  timezone: string,
  granularity: Granularity,
): GeneratedSlot[] {
  const durationHours = durationMinutes / 60;
  const out: GeneratedSlot[] = [];
  const last = parseISO(`${windowEnd}T00:00:00`);
  let cursor = parseISO(`${windowStart}T00:00:00`);

  while (cursor.getTime() <= last.getTime()) {
    const dayISO = format(cursor, "yyyy-MM-dd");
    const dow = cursor.getDay();
    const kind = dow === 0 || dow === 6 ? "weekend" : "weekday";
    const ranges = template.windows[kind];

    for (const range of ranges) {
      if (granularity === "hourly") {
        for (let h = range.start; h + durationHours <= range.end + 1e-9; h += 1) {
          out.push({
            start_utc: toUtc(dayISO, h, timezone).toISOString(),
            end_utc: toUtc(dayISO, h + durationHours, timezone).toISOString(),
          });
        }
      } else {
        for (const part of DAYPARTS) {
          const hit = intersect(range, part);
          if (!hit) continue;
          if (hit.end - hit.start + 1e-9 < durationHours) continue;
          out.push({
            start_utc: toUtc(dayISO, hit.start, timezone).toISOString(),
            end_utc: toUtc(dayISO, hit.start + durationHours, timezone).toISOString(),
          });
        }
      }
    }
    cursor = addDays(cursor, 1);
  }

  // de-dupe identical starts
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.start_utc) ? false : (seen.add(s.start_utc), true)));
}

export function generateCandidateSlots(opts: {
  template: ProjectTemplate;
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  timezone: string;
  granularity: Granularity;
}): SlotGenerationResult {
  const { template, durationMinutes, windowStart, windowEnd, timezone } = opts;
  let granularityUsed = opts.granularity;
  let slots = buildSlots(
    template,
    durationMinutes,
    windowStart,
    windowEnd,
    timezone,
    granularityUsed,
  );
  let widened = false;

  if (slots.length > MAX_SLOTS && granularityUsed === "hourly") {
    granularityUsed = "daypart";
    widened = true;
    slots = buildSlots(
      template,
      durationMinutes,
      windowStart,
      windowEnd,
      timezone,
      granularityUsed,
    );
  }

  const truncated = slots.length > MAX_SLOTS;
  if (truncated) slots = slots.slice(0, MAX_SLOTS);

  return { slots, granularityUsed, widened, truncated };
}
