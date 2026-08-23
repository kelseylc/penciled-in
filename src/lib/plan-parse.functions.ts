import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parsePlanText } from "@/lib/plan-parse.server";

export const parsePlan = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        text: z.string().min(3).max(2000),
        timezone: z.string().min(1).max(64),
        today: z.string().min(4).max(32),
      })
      .parse(data),
  )
  .handler(async ({ data }) => parsePlanText(data.text, data.timezone, data.today));
