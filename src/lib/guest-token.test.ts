import { afterEach, describe, expect, it } from "vitest";

import { storedGuestTokens } from "./guest-token";

const A = "a".repeat(32);
const B = "b".repeat(32);

/** Stand-ins for the two browser globals the function reads. */
function stubBrowser(local: Record<string, string> | "blocked", cookie: string) {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  const keys = local === "blocked" ? [] : Object.keys(local);
  const storage =
    local === "blocked"
      ? {
          get length(): number {
            throw new Error("storage blocked");
          },
          key: () => null,
          getItem: () => null,
        }
      : {
          length: keys.length,
          key: (i: number) => keys[i] ?? null,
          getItem: (k: string) => local[k] ?? null,
        };
  g.window = { localStorage: storage };
  g.document = { cookie };
}

afterEach(() => {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  delete g.window;
  delete g.document;
});

describe("storedGuestTokens", () => {
  it("collects tokens from localStorage", () => {
    stubBrowser({ "aih.token.brunch": A }, "");
    expect(storedGuestTokens()).toEqual([A]);
  });

  it("collects tokens the cookie layer still holds after localStorage is evicted", () => {
    stubBrowser({}, `aih.token.brunch=${A}`);
    expect(storedGuestTokens()).toEqual([A]);
  });

  it("returns one entry when both layers hold the same token", () => {
    stubBrowser({ "aih.token.brunch": A }, `aih.token.brunch=${A}`);
    expect(storedGuestTokens()).toEqual([A]);
  });

  it("merges tokens that only one layer has", () => {
    stubBrowser({ "aih.token.brunch": A }, `aih.token.dnd=${B}`);
    expect(storedGuestTokens().sort()).toEqual([A, B].sort());
  });

  it("ignores unrelated keys and malformed values", () => {
    stubBrowser({ "aih.token.brunch": "not-a-token", "other.key": A }, "session=xyz; theme=dark");
    expect(storedGuestTokens()).toEqual([]);
  });

  it("still reads cookies when localStorage throws", () => {
    stubBrowser("blocked", `aih.token.brunch=${A}`);
    expect(storedGuestTokens()).toEqual([A]);
  });

  it("is empty when there is no browser at all", () => {
    expect(storedGuestTokens()).toEqual([]);
  });
});
