/**
 * Minimal, dependency-free iCalendar generation. Runs entirely in the browser:
 * we never talk to a calendar API, we just hand the viewer a file.
 */

export type IcsCadence = "weekly" | "biweekly" | "monthly" | "quarterly";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** UTC timestamp in iCalendar basic format, e.g. 20261109T190000Z */
export function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold long lines at 75 octets, per RFC 5545. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

const RRULE_BY_CADENCE: Record<IcsCadence, (weekdayCode: string) => string> = {
  weekly: (d) => `FREQ=WEEKLY;BYDAY=${d}`,
  biweekly: (d) => `FREQ=WEEKLY;INTERVAL=2;BYDAY=${d}`,
  monthly: (d) => `FREQ=MONTHLY;BYDAY=${d};BYSETPOS=1`,
  quarterly: (d) => `FREQ=MONTHLY;INTERVAL=3;BYDAY=${d};BYSETPOS=1`,
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string;
  url?: string;
  startUtc: string;
  endUtc: string;
  /** When set, emits a recurring series instead of a single event. */
  cadence?: IcsCadence | null;
  /** Number of occurrences in the series (used as COUNT). */
  count?: number;
}

export function buildIcs(event: IcsEventInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Adulting is Hard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(event.startUtc)}`,
    `DTEND:${toIcsUtc(event.endUtc)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.description) lines.push(fold(`DESCRIPTION:${escapeText(event.description)}`));
  if (event.url) lines.push(fold(`URL:${event.url}`));

  if (event.cadence) {
    const weekday = DAY_CODES[new Date(event.startUtc).getUTCDay()]!;
    const rule = RRULE_BY_CADENCE[event.cadence](weekday);
    const count = event.count && event.count > 1 ? `;COUNT=${event.count}` : "";
    lines.push(`RRULE:${rule}${count}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

export function downloadIcs(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugifyFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "plan"
  );
}
