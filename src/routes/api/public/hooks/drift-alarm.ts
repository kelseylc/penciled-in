import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint: the anti-drift sweep. Tops up empty calendars, chases quiet
 * rescue polls, and raises the 45-day alarm on campaigns that have gone quiet.
 * Called daily by pg_cron with the project's publishable key.
 */
export const Route = createFileRoute("/api/public/hooks/drift-alarm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace("Bearer ", "");
        const expected =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];

        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const origin = new URL(request.url).origin;
        const { driftSweep } = await import("@/lib/anti-drift.server");
        const drift = await driftSweep(origin);

        return new Response(JSON.stringify({ ok: true, drift }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
