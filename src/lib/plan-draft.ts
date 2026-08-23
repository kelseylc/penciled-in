import type { TemplateId } from "@/lib/templates";

/** A parsed plan draft produced from a natural-language description. */
export interface PlanDraft {
  template: TemplateId;
  name: string;
  mode: "one_off" | "recurring";
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | null;
  days: number[];
  startAfter: number;
  endBy: number;
  durationMinutes: number | null;
  fullDay: boolean;
  rollingWeeks: number;
  people: { display_name: string; is_required: boolean }[];
  quorum: number | null;
  deadlineDays: number | null;
  /** Which wizard pieces the model could not fill from the description. */
  missing: ("people" | "days" | "time" | "name" | "window")[];
  summary: string;
}

export const PLAN_DRAFT_KEY = "penciled:plan-draft";

export function stashDraft(draft: PlanDraft) {
  try {
    sessionStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function takeDraft(): PlanDraft | null {
  try {
    const raw = sessionStorage.getItem(PLAN_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PLAN_DRAFT_KEY);
    return JSON.parse(raw) as PlanDraft;
  } catch {
    return null;
  }
}
