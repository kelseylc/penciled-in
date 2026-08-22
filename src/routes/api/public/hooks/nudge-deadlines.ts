import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint: reminds anyone still "unknown" 48 hours before the deadline.
 * Called hourly by pg_cron with the project's publishable key.
 */
export const Route = createFileRoute("/api/public/hooks/nudge-deadlines")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];

        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const origin = new URL(request.url).origin;
        const { nudgeDueProjects } = await import("@/lib/nudge.server");
        const results = await nudgeDueProjects(origin);

        return new Response(JSON.stringify({ ok: true, nudged: results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
