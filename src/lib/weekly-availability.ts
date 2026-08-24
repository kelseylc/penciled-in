import { toZonedTime } from "date-fns-tz";

/**
 * Standing weekly availability.
 *
 * This is the one place in the app that intentionally stores wall-clock local
 * time instead of a UTC instant: a weekly pattern is a repeating rule about
 * someone's week, not a fixed point in time. It is always evaluated against
 * the participant's stored IANA timezone at read time.
 */

export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Index matches JavaScript's Date#getDay(). */
export const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** Sunday-first, matching how dates are read everywhere else in the app. */
export const DAY_ORDER: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const WEEKDAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];
export const WEEKEND_KEYS: DayKey[] = ["sat", "sun"];

export type RangeState = "yes" | "maybe";

export interface AvailabilityRange {
  /** "HH:mm", 24-hour, wall clock in the person's own timezone. */
  start: string;
  end: string;
  state: RangeState;
}

export interface DayPattern {
  all_day: boolean;
  ranges: AvailabilityRange[];
}

export type WeeklyPattern = Partial<Record<DayKey, DayPattern>>;

export const MAX_RANGES_PER_DAY = 4;
export const DEFAULT_RANGE: AvailabilityRange = { start: "18:00", end: "21:00", state: "yes" };

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatRange(range: AvailabilityRange): string {
  return `${formatClock(range.start)} – ${formatClock(range.end)}`;
}

export function formatClock(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

const LEGACY_BUCKETS: Record<string, { start: string; end: string }> = {
  morning: { start: "06:00", end: "12:00" },
  afternoon: { start: "12:00", end: "17:00" },
  evening: { start: "17:00", end: "23:00" },
};

function isRange(value: unknown): value is AvailabilityRange {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r["start"] === "string" &&
    typeof r["end"] === "string" &&
    /^\d{2}:\d{2}$/.test(r["start"]) &&
    /^\d{2}:\d{2}$/.test(r["end"])
  );
}

/**
 * Accepts the current shape, or the original day-part bucket shape, and always
 * returns the current shape. A day that is absent means "no standing signal" —
 * it is never backfilled with anything.
 */
export function parseWeeklyPattern(raw: unknown): WeeklyPattern {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: WeeklyPattern = {};

  for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeDayKey(rawKey);
    if (!key || value == null) continue;

    // Legacy: { "1": ["morning","evening"] } or { mon: { morning: "yes" } }
    if (Array.isArray(value)) {
      const ranges = value
        .map((b) => LEGACY_BUCKETS[String(b)])
        .filter(Boolean)
        .map((b) => ({ ...b!, state: "yes" as RangeState }));
      if (ranges.length > 0) out[key] = normalizeDay({ all_day: false, ranges });
      continue;
    }

    if (typeof value !== "object") continue;
    const obj = value as Record<string, unknown>;

    if (Array.isArray(obj["ranges"]) || typeof obj["all_day"] === "boolean") {
      const ranges = (Array.isArray(obj["ranges"]) ? obj["ranges"] : []).filter(isRange).map((r) => ({
        start: r.start,
        end: r.end,
        state: r.state === "maybe" ? ("maybe" as const) : ("yes" as const),
      }));
      const day = normalizeDay({ all_day: obj["all_day"] === true, ranges });
      if (day.all_day || day.ranges.length > 0) out[key] = day;
      continue;
    }

    const legacy = Object.entries(obj)
      .filter(([bucket, state]) => LEGACY_BUCKETS[bucket] && state !== "no" && state != null)
      .map(([bucket, state]) => ({
        ...LEGACY_BUCKETS[bucket]!,
        state: state === "maybe" ? ("maybe" as const) : ("yes" as const),
      }));
    if (legacy.length > 0) out[key] = normalizeDay({ all_day: false, ranges: legacy });
  }

  return out;
}

function normalizeDayKey(key: string): DayKey | null {
  const lower = key.toLowerCase().slice(0, 3) as DayKey;
  if (DAY_KEYS.includes(lower)) return lower;
  const index = Number(key);
  if (Number.isInteger(index) && index >= 0 && index <= 6) return DAY_KEYS[index]!;
  return null;
}

/**
 * Sort ranges and silently merge overlapping/touching ones. Redundant data is
 * not a user error, so it never surfaces as a validation message.
 */
export function normalizeDay(day: DayPattern): DayPattern {
  if (day.all_day) return { all_day: true, ranges: [] };
  const sorted = [...day.ranges]
    .filter((r) => toMinutes(r.end) > toMinutes(r.start))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const merged: AvailabilityRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && toMinutes(range.start) <= toMinutes(last.end)) {
      if (toMinutes(range.end) > toMinutes(last.end)) last.end = range.end;
      if (range.state === "yes") last.state = "yes";
      continue;
    }
    merged.push({ ...range });
  }
  return { all_day: false, ranges: merged };
}

export function normalizePattern(pattern: WeeklyPattern): WeeklyPattern {
  const out: WeeklyPattern = {};
  for (const key of DAY_KEYS) {
    const day = pattern[key];
    if (!day) continue;
    const normalized = normalizeDay(day);
    if (normalized.all_day || normalized.ranges.length > 0) out[key] = normalized;
  }
  return out;
}

export function isPatternEmpty(pattern: WeeklyPattern): boolean {
  return Object.keys(normalizePattern(pattern)).length === 0;
}

/**
 * Does a candidate slot fall inside someone's standing availability?
 *
 * Only the slot's *start* time is checked — a slot that starts inside a
 * preferred window counts even if it runs slightly past the end. Returns null
 * when there's no standing signal; null must never be read as "no".
 */
export function patternCoversSlot(
  pattern: WeeklyPattern | null | undefined,
  participantTimezone: string,
  slotStartUtc: string,
  _slotDurationMinutes?: number,
): RangeState | null {
  if (!pattern) return null;
  let local: Date;
  try {
    local = toZonedTime(new Date(slotStartUtc), participantTimezone || "UTC");
  } catch {
    return null;
  }
  if (Number.isNaN(local.getTime())) return null;

  const day = pattern[DAY_KEYS[local.getDay()]!];
  if (!day) return null;
  if (day.all_day) return "yes";

  const mins = local.getHours() * 60 + local.getMinutes();
  for (const range of day.ranges) {
    if (mins >= toMinutes(range.start) && mins < toMinutes(range.end)) return range.state;
  }
  return null;
}
