import type { PlanDraft } from "@/lib/plan-draft";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "template",
    "name",
    "mode",
    "cadence",
    "days",
    "startAfter",
    "endBy",
    "durationMinutes",
    "fullDay",
    "rollingWeeks",
    "people",
    "quorum",
    "deadlineDays",
    "missing",
    "summary",
  ],
  properties: {
    template: { type: "string", enum: ["brunch", "dinner", "movie", "dnd", "trip", "hang"] },
    name: { type: "string" },
    mode: { type: "string", enum: ["one_off", "recurring"] },
    cadence: {
      type: ["string", "null"],
      enum: ["weekly", "biweekly", "monthly", "quarterly", null],
    },
    days: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
    startAfter: { type: "number", minimum: 0, maximum: 24 },
    endBy: { type: "number", minimum: 0, maximum: 24 },
    durationMinutes: { type: ["integer", "null"], minimum: 30, maximum: 480 },
    fullDay: { type: "boolean" },
    rollingWeeks: { type: "integer", minimum: 1, maximum: 12 },
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["display_name", "is_required"],
        properties: {
          display_name: { type: "string" },
          is_required: { type: "boolean" },
        },
      },
    },
    quorum: { type: ["integer", "null"], minimum: 1, maximum: 100 },
    deadlineDays: { type: ["integer", "null"], minimum: 1, maximum: 60 },
    missing: {
      type: "array",
      items: { type: "string", enum: ["people", "days", "time", "name", "window"] },
    },
    summary: { type: "string" },
  },
} as const;

const SYSTEM = `You turn a short spoken or typed description of a social plan into a scheduling draft for a group-scheduling app called Party.up.

Rules:
- Pick the closest template: brunch, dinner, movie (movie night), dnd (D&D / long game session), trip (multi-day / weekend away), hang (anything else).
- days: 0=Sunday … 6=Saturday. Only the days the user allows. If unspecified, use the template's natural days.
- startAfter / endBy are decimal local hours (10.5 = 10:30am). Give a sensible window AROUND any stated start time (e.g. "around 10:30 or 11am" -> startAfter 10.5, endBy 13 with a 90 min duration).
- durationMinutes: 30..480 in 30-minute steps, or null for "any length". fullDay true only for multi-day trips.
- rollingWeeks: how many weeks ahead to look (default 4).
- people: names mentioned as attendees, excluding the organizer ("me", "I"). is_required true only when the plan clearly hinges on that person (e.g. it is a plan with one specific friend).
- quorum: leave null unless the user states a minimum headcount. deadlineDays: null unless stated.
- name: a short human title like "Brunch with Iris". summary: one plain sentence describing the draft in the user's words.
- missing: list pieces the description did not settle — "people" if no attendee names, "days"/"time"/"name"/"window" likewise. Never guess a person's name.`;

export async function parsePlanText(
  text: string,
  timezone: string,
  today: string,
): Promise<PlanDraft> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.6-sol",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Today is ${today} and the organizer's timezone is ${timezone}.\n\nDescription: ${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "plan_draft", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Too many requests right now — try again in a moment.");
    if (res.status === 402)
      throw new Error(
        "This workspace is out of AI credits. Add credits to keep using the prompt box.",
      );
    throw new Error(`Could not read that plan (${res.status}). ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("The assistant returned an empty draft. Try rephrasing.");

  const draft = JSON.parse(content) as PlanDraft;
  // Normalize a few things the wizard depends on.
  if (!draft.days?.length) draft.days = [0, 1, 2, 3, 4, 5, 6];
  draft.days = [...new Set(draft.days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (draft.endBy <= draft.startAfter) draft.endBy = Math.min(24, draft.startAfter + 3);
  if (draft.durationMinutes != null) {
    draft.durationMinutes = Math.min(
      480,
      Math.max(30, Math.round(draft.durationMinutes / 30) * 30),
    );
  }
  if (draft.mode !== "recurring") draft.cadence = null;
  draft.people = (draft.people ?? []).slice(0, 50);
  draft.missing = draft.missing ?? [];
  if (!draft.people.length && !draft.missing.includes("people")) draft.missing.push("people");
  return draft;
}
