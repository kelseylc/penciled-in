import { describe, expect, it } from "vitest";

import { enumerateCadences, rankSlots, scoreSlot, type SolverParticipant } from "./solver";

const people: SolverParticipant[] = [
  { id: "a", display_name: "Ana", is_required: true },
  { id: "b", display_name: "Ben", is_required: false },
  { id: "c", display_name: "Cleo", is_required: false },
  { id: "d", display_name: "Dana", is_required: false },
];

const slot = (id: string, iso: string) => ({
  id,
  start_utc: iso,
  end_utc: new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString(),
});

describe("scoreSlot", () => {
  it("scores yes=1 and maybe=0.5 and never counts unknown as no", () => {
    const s = scoreSlot(
      slot("s1", "2026-09-06T18:00:00Z"),
      people,
      { s1: { a: "yes", b: "maybe", c: "no" } },
      2,
    );
    expect(s.yes).toBe(1);
    expect(s.maybe).toBe(1);
    expect(s.no).toBe(1);
    expect(s.unknown).toBe(1);
    expect(s.score).toBe(1.5);
    expect(s.viable).toBe(true);
  });

  it("fails when a required person is not yes/maybe", () => {
    const s = scoreSlot(
      slot("s1", "2026-09-06T18:00:00Z"),
      people,
      { s1: { a: "no", b: "yes", c: "yes", d: "yes" } },
      2,
    );
    expect(s.viable).toBe(false);
    expect(s.reasons[0]).toContain("Ana");
  });

  it("fails when yes+maybe is under quorum", () => {
    const s = scoreSlot(slot("s1", "2026-09-06T18:00:00Z"), people, { s1: { a: "yes" } }, 3);
    expect(s.viable).toBe(false);
    expect(s.reasons.join()).toContain("3 needed");
  });
});

describe("rankSlots", () => {
  it("puts viable slots first and breaks ties by more yes, then earlier date", () => {
    const slots = [
      slot("late", "2026-09-08T18:00:00Z"),
      slot("early", "2026-09-06T18:00:00Z"),
      slot("bad", "2026-09-07T18:00:00Z"),
    ];
    const ranked = rankSlots(
      slots,
      people,
      {
        late: { a: "yes", b: "yes", c: "maybe" },
        early: { a: "yes", b: "yes", c: "maybe" },
        bad: { a: "no", b: "yes", c: "yes" },
      },
      2,
    );
    expect(ranked.map((r) => r.slot.id)).toEqual(["early", "late", "bad"]);
    expect(ranked[2]!.viable).toBe(false);
  });
});

describe("enumerateCadences", () => {
  it("projects 12 weekly occurrences and reports the tradeoff in words", () => {
    // Sundays 14:00 UTC
    const slots = [
      slot("s1", "2026-09-06T14:00:00Z"),
      slot("s2", "2026-09-13T14:00:00Z"),
    ];
    const responses = {
      s1: { a: "yes", b: "yes", c: "yes", d: "no" },
      s2: { a: "yes", b: "yes", c: "yes", d: "no" },
    } as const;
    const options = enumerateCadences(
      slots,
      people,
      responses as never,
      3,
      "weekly",
      "UTC",
      300,
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(options).toHaveLength(1);
    const top = options[0]!;
    expect(top.weekday).toBe(0);
    expect(top.occurrences).toHaveLength(12);
    expect(top.metCount).toBe(12);
    expect(top.tradeoff).toContain("never with Dana");
    expect(top.label).toContain("Every Sunday");
  });
});
