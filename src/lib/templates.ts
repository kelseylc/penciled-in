export type TemplateId = "brunch" | "dinner" | "movie" | "dnd" | "trip" | "hang";

export type DayKind = "weekday" | "weekend";

/** Organizer-set boundaries for when an event may happen. All hours are decimal
 *  hours in the organizer's local timezone (e.g. 17.5 = 5:30pm). */
export interface EventConstraints {
  /** Days of week allowed, 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Earliest the event may start. */
  startAfter: number;
  /** Latest the event must be finished by (24 = midnight). */
  endBy: number;
  /** null = "any length" — the whole allowed window is offered as one block. */
  durationMinutes: number | null;
  /** Multi-day: every selected day in a contiguous run must work for everyone. */
  fullDay?: boolean;
}

export interface ProjectTemplate {
  id: TemplateId;
  label: string;
  blurb: string;
  emoji: string;
  windowLabel: string;
  defaults: EventConstraints;
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "brunch",
    label: "Brunch",
    blurb: "Weekend, eggs involved",
    emoji: "🥞",
    windowLabel: "Sat/Sun · 90 min · 10am–3pm",
    defaults: { days: [0, 6], startAfter: 10, endBy: 15, durationMinutes: 90 },
  },
  {
    id: "dinner",
    label: "Dinner",
    blurb: "Any day, after the kids are down",
    emoji: "🍝",
    windowLabel: "Any day · 2 hrs · after 5pm",
    defaults: { days: ALL_DAYS, startAfter: 17, endBy: 24, durationMinutes: 120 },
  },
  {
    id: "movie",
    label: "Movie night",
    blurb: "Feature length plus talking",
    emoji: "🍿",
    windowLabel: "Fri/Sat · 3 hrs · after 5pm",
    defaults: { days: [5, 6], startAfter: 17, endBy: 24, durationMinutes: 180 },
  },
  {
    id: "dnd",
    label: "D&D session",
    blurb: "The long haul",
    emoji: "🎲",
    windowLabel: "Any day · 4 hrs · done by 11pm",
    defaults: { days: ALL_DAYS, startAfter: 9, endBy: 23, durationMinutes: 240 },
  },
  {
    id: "trip",
    label: "Weekend trip",
    blurb: "Whole days, everyone in",
    emoji: "🧳",
    windowLabel: "Sat + Sun · full days",
    defaults: { days: [6, 0], startAfter: 0, endBy: 24, durationMinutes: null, fullDay: true },
  },
  {
    id: "hang",
    label: "Custom hang",
    blurb: "You set every boundary",
    emoji: "🛋️",
    windowLabel: "You pick days, length and hours",
    defaults: { days: ALL_DAYS, startAfter: 9, endBy: 24, durationMinutes: null },
  },
];

export function getTemplate(id: TemplateId): ProjectTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]!;
}

export function formatHour(h: number): string {
  if (h >= 24) return "midnight";
  const hour = Math.floor(h);
  const mins = Math.round((h - hour) * 60);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${mins ? `:${String(mins).padStart(2, "0")}` : ""}${suffix}`;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Any length";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}${m ? `.${Math.round((m / 60) * 10)}` : ""} hr${h === 1 && !m ? "" : "s"}`;
}

export function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return "Any day";
  if (set.length === 0) return "No days";
  if (set.length === 2 && set.includes(0) && set.includes(6)) return "Sat/Sun";
  return set.map((d) => DAY_NAMES[d]!.slice(0, 3)).join(", ");
}
