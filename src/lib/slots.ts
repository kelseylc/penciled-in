import { addDays, format, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

import type { EventConstraints, ProjectTemplate } from "./templates";

export interface GeneratedSlot {
  start_utc: string;
  end_utc: string;
}

export interface SlotGenerationResult {
  slots: GeneratedSlot[];
  /** Hour step actually used between start options. */
  stepHours: number;
  widened: boolean;
  truncated: boolean;
}

export const MAX_SLOTS = 200;

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

function eachDay(windowStart: string, windowEnd: string): string[] {
  const out: string[] = [];
  const last = parseISO(`${windowEnd}T00:00:00`);
  let cursor = parseISO(`${windowStart}T00:00:00`);
  while (cursor.getTime() <= last.getTime()) {
    out.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return out;
}

function build(
  c: EventConstraints,
  days: string[],
  timezone: string,
  stepHours: number,
): GeneratedSlot[] {
  const allowed = new Set(c.days);
  const out: GeneratedSlot[] = [];
  const startAfter = Math.max(0, Math.min(24, c.startAfter));
  const endBy = Math.max(startAfter, Math.min(24, c.endBy));

  if (c.fullDay) {
    // Contiguous runs of allowed days become one multi-day block.
    let run: string[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const first = run[0]!;
      const last = run[run.length - 1]!;
      out.push({
        start_utc: toUtc(first, startAfter, timezone).toISOString(),
        end_utc: toUtc(last, endBy, timezone).toISOString(),
      });
      run = [];
    };
    for (const day of days) {
      const dow = parseISO(`${day}T00:00:00`).getDay();
      if (allowed.has(dow)) run.push(day);
      else flush();
    }
    flush();
    return out;
  }

  for (const day of days) {
    const dow = parseISO(`${day}T00:00:00`).getDay();
    if (!allowed.has(dow)) continue;

    if (c.durationMinutes === null) {
      out.push({
        start_utc: toUtc(day, startAfter, timezone).toISOString(),
        end_utc: toUtc(day, endBy, timezone).toISOString(),
      });
      continue;
    }

    const durationHours = c.durationMinutes / 60;
    for (let h = startAfter; h + durationHours <= endBy + 1e-9; h += stepHours) {
      out.push({
        start_utc: toUtc(day, h, timezone).toISOString(),
        end_utc: toUtc(day, h + durationHours, timezone).toISOString(),
      });
    }
  }

  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.start_utc) ? false : (seen.add(s.start_utc), true)));
}

export function generateCandidateSlots(opts: {
  constraints: EventConstraints;
  windowStart: string;
  windowEnd: string;
  timezone: string;
}): SlotGenerationResult {
  const days = eachDay(opts.windowStart, opts.windowEnd);
  let stepHours = 1;
  let slots = build(opts.constraints, days, opts.timezone, stepHours);
  let widened = false;

  while (slots.length > MAX_SLOTS && stepHours < 6 && opts.constraints.durationMinutes !== null) {
    stepHours += 1;
    widened = true;
    slots = build(opts.constraints, days, opts.timezone, stepHours);
  }

  const truncated = slots.length > MAX_SLOTS;
  if (truncated) slots = slots.slice(0, MAX_SLOTS);

  return { slots, stepHours, widened, truncated };
}

/** Minutes stored on the project row for a given set of constraints. */
export function effectiveDurationMinutes(c: EventConstraints): number {
  if (c.fullDay) {
    const span = Math.max(1, c.days.length);
    return Math.min(10080, Math.round(span * 24 * 60));
  }
  if (c.durationMinutes === null) {
    return Math.max(15, Math.round((c.endBy - c.startAfter) * 60));
  }
  return c.durationMinutes;
}

export function templateConstraints(
  template: ProjectTemplate,
  durationMinutes?: number | null,
): EventConstraints {
  return {
    ...template.defaults,
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  };
}
