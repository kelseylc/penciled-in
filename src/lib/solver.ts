import { addDays, addMonths, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export type SlotState = "yes" | "maybe" | "no";
export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly";

export interface SolverParticipant {
  id: string;
  display_name: string;
  is_required: boolean;
  /** Weekly availability pattern: weekday index -> ["morning","afternoon","evening"]. */
  weekly_pattern?: Record<string, string[]> | null;
  /** ISO yyyy-MM-dd dates the person is never available. */
  blackout_dates?: string[] | null;
}

export interface SolverSlot {
  id: string;
  start_utc: string;
  end_utc: string;
}

/** slotId -> participantId -> state. Missing entries are "unknown". */
export type ResponseMap = Record<string, Record<string, SlotState>>;

export interface SlotScore {
  slot: SolverSlot;
  yes: number;
  maybe: number;
  no: number;
  unknown: number;
  score: number;
  viable: boolean;
  /** Human-readable reasons the slot fails a hard filter. Empty when viable. */
  reasons: string[];
  yesNames: string[];
  maybeNames: string[];
  noNames: string[];
  unknownNames: string[];
  missingRequired: string[];
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function daypartOfHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Score a single candidate slot. Pure. Unknown is never treated as "no". */
export function scoreSlot(
  slot: SolverSlot,
  participants: SolverParticipant[],
  responses: ResponseMap,
  quorumMin: number,
): SlotScore {
  const byParticipant = responses[slot.id] ?? {};
  const yesNames: string[] = [];
  const maybeNames: string[] = [];
  const noNames: string[] = [];
  const unknownNames: string[] = [];
  const missingRequired: string[] = [];

  for (const p of participants) {
    const state = byParticipant[p.id];
    if (state === "yes") yesNames.push(p.display_name);
    else if (state === "maybe") maybeNames.push(p.display_name);
    else if (state === "no") noNames.push(p.display_name);
    else unknownNames.push(p.display_name);

    if (p.is_required && state !== "yes" && state !== "maybe") {
      missingRequired.push(p.display_name);
    }
  }

  const yes = yesNames.length;
  const maybe = maybeNames.length;
  const no = noNames.length;
  const unknown = unknownNames.length;
  const score = 1.0 * yes + 0.5 * maybe;

  const reasons: string[] = [];
  if (missingRequired.length > 0) {
    reasons.push(
      `${listNames(missingRequired)} ${missingRequired.length === 1 ? "is" : "are"} required and can't make it`,
    );
  }
  if (yes + maybe < quorumMin) {
    reasons.push(`Only ${yes + maybe} of the ${quorumMin} needed can make it`);
  }

  return {
    slot,
    yes,
    maybe,
    no,
    unknown,
    score,
    viable: reasons.length === 0,
    reasons,
    yesNames,
    maybeNames,
    noNames,
    unknownNames,
    missingRequired,
  };
}

/**
 * Rank every candidate slot. Viable slots first (by score), then non-viable
 * ones so the organizer can still see them greyed out with the reason.
 * Tiebreak: more yes -> fewer maybe -> fewer unknown -> earlier date ->
 * matches the weekday/time of the previous confirmed occurrence.
 */
export function rankSlots(
  slots: SolverSlot[],
  participants: SolverParticipant[],
  responses: ResponseMap,
  quorumMin: number,
  options: { previousOccurrenceUtc?: string | null; timezone?: string } = {},
): SlotScore[] {
  const tz = options.timezone ?? "UTC";
  const prev = options.previousOccurrenceUtc ? new Date(options.previousOccurrenceUtc) : null;
  const prevKey = prev ? weekdayTimeKey(prev, tz) : null;

  return slots
    .map((s) => scoreSlot(s, participants, responses, quorumMin))
    .sort((a, b) => {
      if (a.viable !== b.viable) return a.viable ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      if (b.yes !== a.yes) return b.yes - a.yes;
      if (a.maybe !== b.maybe) return a.maybe - b.maybe;
      if (a.unknown !== b.unknown) return a.unknown - b.unknown;
      const at = new Date(a.slot.start_utc).getTime();
      const bt = new Date(b.slot.start_utc).getTime();
      if (at !== bt) return at - bt;
      if (prevKey) {
        const am = weekdayTimeKey(new Date(a.slot.start_utc), tz) === prevKey ? 0 : 1;
        const bm = weekdayTimeKey(new Date(b.slot.start_utc), tz) === prevKey ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      return 0;
    });
}

function weekdayTimeKey(date: Date, timezone: string): string {
  const local = toZonedTime(date, timezone);
  return `${local.getDay()}|${format(local, "HH:mm")}`;
}

export function listNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/* ------------------------------------------------------------------ */
/* Recurring: cadence enumeration                                      */
/* ------------------------------------------------------------------ */

export interface CadenceOption {
  weekday: number;
  /** HH:mm in the reference timezone. */
  startTime: string;
  durationMinutes: number;
  /** Projected occurrence start times (UTC ISO). */
  occurrences: string[];
  metCount: number;
  totalCount: number;
  /** Participants who are never available across the projection. */
  neverAvailable: string[];
  /** Participants who miss at least one projected occurrence. */
  sometimesMissing: string[];
  label: string;
  tradeoff: string;
  score: number;
}

export function occurrenceCount(cadence: Cadence): number {
  if (cadence === "weekly" || cadence === "biweekly") return 12;
  if (cadence === "monthly") return 6;
  return 4;
}

function advance(date: Date, cadence: Cadence): Date {
  if (cadence === "weekly") return addDays(date, 7);
  if (cadence === "biweekly") return addDays(date, 14);
  if (cadence === "monthly") return addMonths(date, 1);
  return addMonths(date, 3);
}

function stateFromDefaults(
  p: SolverParticipant,
  localDate: Date,
): SlotState | undefined {
  const iso = format(localDate, "yyyy-MM-dd");
  if (p.blackout_dates?.includes(iso)) return "no";
  const pattern = p.weekly_pattern?.[String(localDate.getDay())];
  if (!pattern || pattern.length === 0) return undefined;
  return pattern.includes(daypartOfHour(localDate.getHours())) ? "yes" : "no";
}

/**
 * Enumerate every (weekday, start time) pair supported by the candidate slots,
 * project the next N occurrences, and count how many meet quorum + required
 * attendance. Fixed weekday + fixed start time only — no drifting patterns.
 */
export function enumerateCadences(
  slots: SolverSlot[],
  participants: SolverParticipant[],
  responses: ResponseMap,
  quorumMin: number,
  cadence: Cadence,
  timezone: string,
  durationMinutes: number,
  from: Date = new Date(),
): CadenceOption[] {
  const pairs = new Map<string, { weekday: number; startTime: string; slots: SolverSlot[] }>();
  for (const slot of slots) {
    const local = toZonedTime(new Date(slot.start_utc), timezone);
    const startTime = format(local, "HH:mm");
    const key = `${local.getDay()}|${startTime}`;
    const entry = pairs.get(key) ?? { weekday: local.getDay(), startTime, slots: [] };
    entry.slots.push(slot);
    pairs.set(key, entry);
  }

  const total = occurrenceCount(cadence);
  const options: CadenceOption[] = [];

  for (const pair of pairs.values()) {
    // Per-participant fallback state for this (weekday, time) pair, taken from
    // how they answered the candidate slots that match it.
    const pairStates = new Map<string, Map<string, SlotState>>();
    for (const slot of pair.slots) {
      const local = toZonedTime(new Date(slot.start_utc), timezone);
      const day = format(local, "yyyy-MM-dd");
      const answers = responses[slot.id] ?? {};
      for (const p of participants) {
        const st = answers[p.id];
        if (!st) continue;
        const map = pairStates.get(day) ?? new Map<string, SlotState>();
        map.set(p.id, st);
        pairStates.set(day, map);
      }
    }

    // Modal answer per participant across the matching slots (their usual answer).
    const usual = new Map<string, SlotState>();
    for (const p of participants) {
      const counts: Record<SlotState, number> = { yes: 0, maybe: 0, no: 0 };
      let any = false;
      for (const slot of pair.slots) {
        const st = (responses[slot.id] ?? {})[p.id];
        if (st) {
          counts[st] += 1;
          any = true;
        }
      }
      if (!any) continue;
      const best = (["yes", "maybe", "no"] as SlotState[]).reduce((a, b) =>
        counts[b] > counts[a] ? b : a,
      );
      usual.set(p.id, best);
    }

    // First projected occurrence: next matching weekday at or after `from`.
    const localFrom = toZonedTime(from, timezone);
    let cursor = new Date(localFrom);
    cursor.setHours(Number(pair.startTime.slice(0, 2)), Number(pair.startTime.slice(3, 5)), 0, 0);
    while (cursor.getDay() !== pair.weekday || cursor.getTime() < localFrom.getTime()) {
      cursor = addDays(cursor, 1);
      cursor.setHours(Number(pair.startTime.slice(0, 2)), Number(pair.startTime.slice(3, 5)), 0, 0);
    }

    const occurrences: string[] = [];
    let metCount = 0;
    const missedBy = new Map<string, number>();
    const availableAtLeastOnce = new Set<string>();

    for (let i = 0; i < total; i += 1) {
      const day = format(cursor, "yyyy-MM-dd");
      const utc = fromZonedTime(
        `${day}T${pair.startTime}:00`,
        timezone,
      );
      occurrences.push(utc.toISOString());

      let yes = 0;
      let maybe = 0;
      let requiredOk = true;
      for (const p of participants) {
        const explicit = pairStates.get(day)?.get(p.id);
        const state =
          explicit ?? stateFromDefaults(p, cursor) ?? usual.get(p.id) ?? undefined;
        if (state === "yes") yes += 1;
        else if (state === "maybe") maybe += 1;
        if (state === "yes" || state === "maybe") availableAtLeastOnce.add(p.id);
        else missedBy.set(p.id, (missedBy.get(p.id) ?? 0) + 1);
        if (p.is_required && state !== "yes" && state !== "maybe") requiredOk = false;
      }
      if (requiredOk && yes + maybe >= quorumMin) metCount += 1;

      cursor = advance(cursor, cadence);
      cursor.setHours(Number(pair.startTime.slice(0, 2)), Number(pair.startTime.slice(3, 5)), 0, 0);
    }

    const neverAvailable = participants
      .filter((p) => !availableAtLeastOnce.has(p.id))
      .map((p) => p.display_name);
    const sometimesMissing = participants
      .filter((p) => availableAtLeastOnce.has(p.id) && (missedBy.get(p.id) ?? 0) > 0)
      .map((p) => p.display_name);

    const label = `${cadencePrefix(cadence)} ${WEEKDAY_NAMES[pair.weekday]}, ${formatTimeRange(
      pair.startTime,
      durationMinutes,
    )}`;

    const tradeoff =
      neverAvailable.length > 0
        ? `${metCount} of ${total}, but never with ${listNames(neverAvailable)}`
        : sometimesMissing.length > 0
          ? `${metCount} of ${total} — ${listNames(sometimesMissing)} ${
              sometimesMissing.length === 1 ? "misses" : "miss"
            } some sessions`
          : `${metCount} of ${total}, everyone can make all of them`;

    options.push({
      weekday: pair.weekday,
      startTime: pair.startTime,
      durationMinutes,
      occurrences,
      metCount,
      totalCount: total,
      neverAvailable,
      sometimesMissing,
      label,
      tradeoff,
      score: metCount - neverAvailable.length * 0.5,
    });
  }

  return options.sort((a, b) => {
    if (b.metCount !== a.metCount) return b.metCount - a.metCount;
    if (a.neverAvailable.length !== b.neverAvailable.length)
      return a.neverAvailable.length - b.neverAvailable.length;
    if (a.sometimesMissing.length !== b.sometimesMissing.length)
      return a.sometimesMissing.length - b.sometimesMissing.length;
    return a.weekday - b.weekday || a.startTime.localeCompare(b.startTime);
  });
}

function cadencePrefix(cadence: Cadence): string {
  if (cadence === "weekly") return "Every";
  if (cadence === "biweekly") return "Every other";
  if (cadence === "monthly") return "Monthly on";
  return "Quarterly on";
}

export function formatTimeRange(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const start = new Date(2000, 0, 1, h ?? 0, m ?? 0);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const fmt = (d: Date) => {
    const hh = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    const mm = d.getMinutes() === 0 ? "" : `:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${hh}${mm}${d.getHours() < 12 ? "am" : "pm"}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}
