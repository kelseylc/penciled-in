import { createServerFn } from "@tanstack/react-start";

import type { TestModeSeed } from "@/lib/testmode.server";

export type { TestModeSeed };

export const enterTestMode = createServerFn({ method: "POST" }).handler(
  async (): Promise<TestModeSeed> => {
    const { seedTestMode } = await import("@/lib/testmode.server");
    return seedTestMode();
  },
);
