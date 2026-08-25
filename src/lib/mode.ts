/**
 * Mode is both global UI chrome and a stamped, immutable property of every
 * group and project.
 *
 * - The d20 toggle sets a *global preference* (which mode the app opens in and
 *   what a new thing gets stamped with).
 * - Opening a group or project renders in *that object's* mode, regardless of
 *   the toggle. A campaign always looks like a campaign; a brunch always looks
 *   like a brunch.
 *
 * Every user-facing string that differs between modes lives in COPY below.
 * Components read `copy(mode).x` — they never hardcode either wording.
 */

export type AppMode = "campaign" | "plans";

export const MODES: AppMode[] = ["campaign", "plans"];

export function isAppMode(value: unknown): value is AppMode {
  return value === "campaign" || value === "plans";
}

export function asAppMode(value: unknown, fallback: AppMode = "plans"): AppMode {
  return isAppMode(value) ? value : fallback;
}

export interface ModeCopy {
  mode: AppMode;
  /** "Campaign" / "Plans" — the toggle's visible text label. */
  modeLabel: string;
  container: string;
  containerPlural: string;
  event: string;
  eventPlural: string;
  organizer: string;
  participants: string;
  participantsShort: string;
  setupFlow: string;
  newCta: string;
  homeHeader: string;
  homeSub: string;
  lockedState: string;
  atRisk: string;
  rescue: string;
  emptyState: string;
  success: string;
  mySection: string;
  otherSection: string;
  /** Framing shown to a first-time respondent, above the name field. */
  respondFraming: (organizer: string, name: string) => string;
}

const CAMPAIGN: ModeCopy = {
  mode: "campaign",
  modeLabel: "Campaign",
  container: "Campaign",
  containerPlural: "Campaigns",
  event: "Session",
  eventPlural: "Sessions",
  organizer: "DM",
  participants: "Players",
  participantsShort: "the party",
  setupFlow: "Session Zero",
  newCta: "New session",
  homeHeader: "Keep your campaign alive.",
  homeSub:
    "Fixed cadence, a quorum you agreed on, and a rescue poll that already exists the moment a session falls apart.",
  lockedState: "is on",
  atRisk: "The table's short",
  rescue: "Save the session",
  emptyState: "No sessions scheduled — that's how campaigns die.",
  success: "The party assembles.",
  mySection: "Your campaigns",
  otherSection: "Other plans",
  respondFraming: (organizer, name) => `${organizer}'s trying to get ${name} on the calendar.`,
};

const PLANS: ModeCopy = {
  mode: "plans",
  modeLabel: "Plans",
  container: "Group",
  containerPlural: "Groups",
  event: "Plan",
  eventPlural: "Plans",
  organizer: "Organizer",
  participants: "Friends",
  participantsShort: "your friends",
  setupFlow: "New plan",
  newCta: "New plan",
  homeHeader: "Adulting is hard, scheduling shouldn't be.",
  homeSub:
    "Organize an event, share one link to attendees, find the dates that work, lock it in. No calendar syncing needed.",
  lockedState: "is set",
  atRisk: "Not enough people yet",
  rescue: "Find another time",
  emptyState: "Nothing planned yet.",
  success: "See you then.",
  mySection: "Your plans",
  otherSection: "Campaigns",
  respondFraming: (organizer, name) => `${organizer} is trying to find a time for ${name}.`,
};

export function copy(mode: AppMode): ModeCopy {
  return mode === "campaign" ? CAMPAIGN : PLANS;
}

/** Table rules are a campaign-mode Session Zero decision. */
export type TableRule = "play_anyway" | "strict_quorum" | "everyone";

export const TABLE_RULES: {
  id: TableRule;
  label: string;
  blurb: string;
  recommended?: boolean;
  warning?: string;
}[] = [
  {
    id: "play_anyway",
    label: "Play anyway",
    blurb: "We play with whoever shows, as long as the DM's there.",
    recommended: true,
  },
  {
    id: "strict_quorum",
    label: "Need a quorum",
    blurb: "We need at least a few players plus the DM.",
  },
  {
    id: "everyone",
    label: "Everyone or nothing",
    blurb: "We only play with the full table.",
    warning: "Heads up — this is the setting most likely to kill a campaign.",
  },
];

/** Does this table rule allow the group to run short? */
export function permitsPlayAnyway(rule: TableRule | null | undefined): boolean {
  return rule !== "everyone";
}

export const MODE_STORAGE_KEY = "penciled:mode";
