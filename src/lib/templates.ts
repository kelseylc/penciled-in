export type TemplateId =
  | "coffee"
  | "brunch"
  | "lunch"
  | "dinner"
  | "movie"
  | "dnd"
  | "hang";

export type DayKind = "weekday" | "weekend";

/** Hour ranges are decimal hours in the organizer's local timezone. */
export interface TimeRange {
  start: number;
  end: number;
}

export interface ProjectTemplate {
  id: TemplateId;
  label: string;
  blurb: string;
  emoji: string;
  defaultDuration: number;
  /** null => user picks duration */
  durationRange?: { min: number; max: number; step: number };
  windowLabel: string;
  /** Ranges per day kind. Empty array => that day kind is excluded. */
  windows: Record<DayKind, TimeRange[]>;
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "coffee",
    label: "Coffee",
    blurb: "Short and caffeinated",
    emoji: "☕️",
    defaultDuration: 60,
    windowLabel: "Weekdays, before 10am or after 3pm",
    windows: {
      weekday: [
        { start: 7, end: 10 },
        { start: 15, end: 19 },
      ],
      weekend: [],
    },
  },
  {
    id: "brunch",
    label: "Brunch",
    blurb: "Weekend, eggs involved",
    emoji: "🥞",
    defaultDuration: 90,
    windowLabel: "Sat/Sun, 9am–1pm",
    windows: { weekday: [], weekend: [{ start: 9, end: 13 }] },
  },
  {
    id: "lunch",
    label: "Lunch",
    blurb: "Midday, any day",
    emoji: "🥗",
    defaultDuration: 90,
    windowLabel: "Any day, 11:30am–2pm",
    windows: {
      weekday: [{ start: 11.5, end: 14 }],
      weekend: [{ start: 11.5, end: 14 }],
    },
  },
  {
    id: "dinner",
    label: "Dinner",
    blurb: "Evening, any day",
    emoji: "🍝",
    defaultDuration: 90,
    windowLabel: "Any day, 5:30–9pm",
    windows: {
      weekday: [{ start: 17.5, end: 21 }],
      weekend: [{ start: 17.5, end: 21 }],
    },
  },
  {
    id: "movie",
    label: "Movie night",
    blurb: "Feature length plus talking",
    emoji: "🍿",
    defaultDuration: 150,
    windowLabel: "Any day, 6–10pm",
    windows: {
      weekday: [{ start: 18, end: 22 }],
      weekend: [{ start: 18, end: 22 }],
    },
  },
  {
    id: "dnd",
    label: "D&D session",
    blurb: "The long haul",
    emoji: "🎲",
    defaultDuration: 240,
    durationRange: { min: 180, max: 360, step: 30 },
    windowLabel: "Weekends any time; weekdays after 6pm",
    windows: {
      weekday: [{ start: 18, end: 24 }],
      weekend: [{ start: 9, end: 24 }],
    },
  },
  {
    id: "hang",
    label: "Just hang",
    blurb: "No constraints, no theme",
    emoji: "🛋️",
    defaultDuration: 120,
    durationRange: { min: 30, max: 360, step: 30 },
    windowLabel: "Unconstrained",
    windows: {
      weekday: [{ start: 8, end: 24 }],
      weekend: [{ start: 8, end: 24 }],
    },
  },
];

export function getTemplate(id: TemplateId): ProjectTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]!;
}
