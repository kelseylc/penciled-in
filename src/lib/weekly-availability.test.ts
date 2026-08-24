import { describe, expect, it } from "vitest";

import {
  normalizeDay,
  parseWeeklyPattern,
  patternCoversSlot,
  type WeeklyPattern,
} from "./weekly-availability";

const pattern: WeeklyPattern = {
  tue: { all_day: false, ranges: [{ start: "17:00", end: "23:00", state: "yes" }] },
  sat: { all_day: false, ranges: [{ start: "10:00", end: "15:00", state: "maybe" }] },
  sun: { all_day: true, ranges: [] },
};

describe("patternCoversSlot", () => {
  it("returns the range state for a slot starting inside a window", () => {
    // Tue 2026-09-08 22:00 UTC = 18:00 New York
    expect(patternCoversSlot(pattern, "America/New_York", "2026-09-08T22:00:00Z")).toBe("yes");
  });

  it("returns maybe when the matching range is a maybe", () => {
    // Sat 2026-09-12 15:00 UTC = 11:00 New York
    expect(patternCoversSlot(pattern, "America/New_York", "2026-09-12T15:00:00Z")).toBe("maybe");
  });

  it("returns yes for an all-day weekday", () => {
    expect(patternCoversSlot(pattern, "America/New_York", "2026-09-13T13:00:00Z")).toBe("yes");
  });

  it("returns null outside any range, never no", () => {
    // Tue 14:00 New York, outside 17:00-23:00
    expect(patternCoversSlot(pattern, "America/New_York", "2026-09-08T18:00:00Z")).toBeNull();
  });

  it("returns null for a weekday with no entry", () => {
    expect(patternCoversSlot(pattern, "America/New_York", "2026-09-09T22:00:00Z")).toBeNull();
  });

  it("evaluates in the participant's timezone, not UTC", () => {
    // 2026-09-09T01:00Z is Wednesday in UTC but Tuesday 21:00 in New York
    expect(patternCoversSlot(pattern, "America/New_York", "2026-09-09T01:00:00Z")).toBe("yes");
    expect(patternCoversSlot(pattern, "Europe/London", "2026-09-09T01:00:00Z")).toBeNull();
  });
});

describe("normalizeDay", () => {
  it("merges overlapping ranges instead of erroring", () => {
    const day = normalizeDay({
      all_day: false,
      ranges: [
        { start: "18:00", end: "21:00", state: "yes" },
        { start: "20:00", end: "23:00", state: "yes" },
      ],
    });
    expect(day.ranges).toEqual([{ start: "18:00", end: "23:00", state: "yes" }]);
  });

  it("keeps split days apart", () => {
    const day = normalizeDay({
      all_day: false,
      ranges: [
        { start: "18:00", end: "21:00", state: "yes" },
        { start: "07:00", end: "09:00", state: "yes" },
      ],
    });
    expect(day.ranges.map((r) => r.start)).toEqual(["07:00", "18:00"]);
  });
});

describe("parseWeeklyPattern", () => {
  it("converts the old day-part bucket shape", () => {
    const parsed = parseWeeklyPattern({ "2": ["evening"] });
    expect(parsed.tue).toEqual({
      all_day: false,
      ranges: [{ start: "17:00", end: "23:00", state: "yes" }],
    });
  });

  it("ignores unknown junk and leaves missing days unset", () => {
    const parsed = parseWeeklyPattern({ nope: 5, wed: { all_day: false, ranges: [] } });
    expect(parsed).toEqual({});
  });
});
