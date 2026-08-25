import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppBar } from "@/components/AppBar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { writeGuestToken } from "@/lib/guest-token";
import { enterTestMode, type TestModeSeed } from "@/lib/testmode.functions";

export const Route = createFileRoute("/test")({
  head: () => ({
    meta: [
      { title: "Test mode — Party.up" },
      {
        name: "description",
        content:
          "Open every Party.up screen with seeded demo data — organizer, guest, results, and locked views.",
      },
      { property: "og:title", content: "Test mode — Party.up" },
      {
        property: "og:description",
        content: "Audit every screen with seeded demo data, no sign-in dance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TestModePage,
});

const STORAGE_KEY = "aih:testmode";

function Row({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <a
      href={href}
      className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
    >
      <span>
        <span className="block text-base font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className="text-xs text-muted-foreground">Open →</span>
    </a>
  );
}

function TestModePage() {
  const { session } = useAuth();
  const seedFn = useServerFn(enterTestMode);
  const [seed, setSeed] = useState<TestModeSeed | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setSeed(JSON.parse(raw) as TestModeSeed);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const run = useMutation({
    mutationFn: async () => {
      const data = await seedFn();
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) throw new Error(error.message);
      // Seed guest tokens so the respond screens skip the "who are you" step.
      for (const p of data.projects) {
        const first = p.participants[0];
        if (first) writeGuestToken(p.slug, first.token);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    },
    onSuccess: (data) => {
      setSeed(data);
      toast.success("Test mode ready — signed in as the demo organizer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const oneOff = seed?.projects.find((p) => p.kind === "collecting");
  const lockedOne = seed?.projects.find((p) => p.kind === "locked-one-off");
  const recurring = seed?.projects.find((p) => p.kind === "locked-recurring");

  return (
    <div className="min-h-dvh bg-background">
      <AppBar />
      <main className="mx-auto w-full max-w-md px-5 pb-24 pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Test mode</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seeds a full demo dataset, signs you in as a demo organizer, and links every screen in the
          app so you can audit them end to end.
        </p>

        <Button
          className="mt-5 h-14 w-full rounded-2xl text-base font-bold"
          onClick={() => run.mutate()}
          disabled={run.isPending}
        >
          {run.isPending ? "Setting up…" : seed ? "Reset demo data" : "Enter test mode"}
        </Button>
        {session && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Signed in as {session.user.email}</p>
            <button
              type="button"
              className="min-h-11 text-xs font-bold text-primary"
              onClick={async () => {
                await supabase.auth.signOut();
                toast.success("Signed out — signed-out screens are now auditable");
              }}
            >
              Sign out
            </button>
          </div>
        )}

        {seed && (
          <div className="mt-8 space-y-6">
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Organizer screens
              </h2>
              <Row href="/" label="Landing" hint="Home page and CTAs" />
              <Row href="/new" label="Create a plan" hint="7-step wizard, ends on Review" />
              <Row
                href="/new?demo=1"
                label="Review time options"
                hint="Jumps to Step 7 with a prefilled plan — edit, remove, add slots"
              />
              <Row
                href="/home"
                label="My events"
                hint="Next session, at-risk banner, empty state"
              />
              <Row href="/groups" label="My groups" hint="Saved groups list + create" />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Accounts
              </h2>
              <Row href="/auth" label="Sign in" hint="Email + password" />
              <Row
                href="/auth?mode=signup"
                label="Create account"
                hint="Ends on confirm-email screen"
              />
              <Row
                href="/auth?mode=forgot"
                label="Forgot password"
                hint="Email form, sends the reset link"
              />
              <Row
                href="/reset-password"
                label="Set a new password"
                hint="Where the recovery email link lands"
              />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                One-off plan — collecting
              </h2>
              <Row
                href={`/share/${oneOff?.slug}`}
                label="Share screen"
                hint="Link + chat message"
              />
              <Row
                href={`/p/${oneOff?.slug}?t=${oneOff?.participants[2]?.token ?? ""}`}
                label="Respond as guest"
                hint={`Token link for ${oneOff?.participants[2]?.name ?? "a guest"}`}
              />
              <Row href={`/p/${oneOff?.slug}`} label="Respond, no token" hint="Name-entry screen" />
              <Row href={`/results/${oneOff?.slug}`} label="Results" hint="Ranked slots, nudge" />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                One-off plan — locked
              </h2>
              <Row
                href={`/d/${lockedOne?.slug}`}
                label="Decision view"
                hint=".ics + copy summary"
              />
              <Row
                href={`/results/${lockedOne?.slug}`}
                label="Results (locked)"
                hint="Post-lock state"
              />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Recurring plan — locked cadence
              </h2>
              <Row
                href={`/d/${recurring?.slug}`}
                label="Decision view"
                hint="Recurring .ics (RRULE)"
              />
              <Row
                href={`/results/${recurring?.slug}`}
                label="Cadence results"
                hint="Top cadences"
              />
              {seed.occurrences.map((o, i) => (
                <Row
                  key={o.id}
                  href={`/o/${o.id}?t=${recurring?.participants[0]?.token ?? ""}`}
                  label={`Session ${i + 1} RSVP — ${o.status}`}
                  hint={new Date(o.startUtc).toLocaleString()}
                />
              ))}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Group
              </h2>
              <Row href={`/g/${seed.group.slug}`} label={seed.group.name} hint="Saved group page" />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Guest tokens
              </h2>
              {seed.projects.map((p) => (
                <div key={p.slug} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <ul className="mt-2 space-y-1">
                    {p.participants.map((t) => (
                      <li key={t.token} className="text-xs text-muted-foreground">
                        <a className="underline" href={`/p/${p.slug}?t=${t.token}`}>
                          {t.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <Link to="/" className="block pt-2 text-center text-sm underline">
              Back to home
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
