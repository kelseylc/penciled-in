import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Check, Mic, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { allZones, zoneLabel } from "@/lib/timezones";
import { z } from "zod";

import { AccountUpsellCard } from "@/components/AccountUpsellCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readGuestToken, writeGuestToken } from "@/lib/guest-token";
import {
  getRespondBundle,
  joinProject,
  submitResponses,
  type RespondBundle,
} from "@/lib/respond.functions";
import { summarizeAnswers, type SlotState } from "@/lib/summary";
import { patternCoversSlot } from "@/lib/weekly-availability";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$slug")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Respond to a plan — Penciled.in" },
      {
        name: "description",
        content: "Tap your availability. Takes about 30 seconds and never asks you to sign up.",
      },
      { property: "og:title", content: "Can you make it? — Penciled.in" },
      {
        property: "og:description",
        content: "Tap the times that work. Takes 30 seconds — no signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Can you make it? — Penciled.in" },
      {
        name: "twitter:description",
        content: "Tap the times that work. Takes 30 seconds — no signup.",
      },
    ],
  }),
  component: RespondPage,
});

const NEXT: Record<"unknown" | SlotState, "unknown" | SlotState> = {
  unknown: "yes",
  yes: "maybe",
  maybe: "no",
  no: "unknown",
};

function tzLabel(timezone: string) {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "long" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? timezone
    );
  } catch {
    return timezone;
  }
}

function RespondPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchBundle = useServerFn(getRespondBundle);
  const join = useServerFn(joinProject);
  const submit = useServerFn(submitResponses);

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [screen, setScreen] = useState<"who" | "grid" | "confirm" | "done">("who");
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, SlotState>>({});
  const [prefilled, setPrefilled] = useState(false);
  /** Slots filled in from the saved pattern rather than actually answered. */
  const [predicted, setPredicted] = useState<Set<string>>(() => new Set());

  const [bannerOpen, setBannerOpen] = useState(true);
  const [changingTz, setChangingTz] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const stored = search.t ?? readGuestToken(slug);
    if (stored) {
      setToken(stored);
      writeGuestToken(slug, stored);
    }
    setTokenReady(true);
  }, [slug, search.t]);

  const bundleQuery = useQuery<RespondBundle>({
    queryKey: ["respond", slug, token],
    queryFn: () => fetchBundle({ data: { slug, token } }),
    enabled: tokenReady,
    placeholderData: (prev) => prev,
  });

  const bundle = bundleQuery.data;

  // Resume an existing response when a valid token is present.
  useEffect(() => {
    if (!bundle?.me) return;
    setName(bundle.me.display_name);
    setAnswers((current) => {
      if (Object.keys(current).length > 0) return current;
      const next: Record<string, SlotState> = {};
      for (const r of bundle.me!.responses) next[r.candidate_slot_id] = r.state;
      return next;
    });
    setScreen((s) => (s === "who" ? "grid" : s));
  }, [bundle?.me]);

  // Pre-fill from saved standing availability when there is no answer yet.
  // A slot the pattern says nothing about stays unknown — never an implied no.
  useEffect(() => {
    const defaults = bundle?.me?.defaults;
    if (!bundle || !defaults) return;
    if (bundle.me!.responses.length > 0) return;
    const zone = bundle.me!.timezone || timezone;
    setAnswers((current) => {
      if (Object.keys(current).length > 0) return current;
      const next: Record<string, SlotState> = {};
      const guessed = new Set<string>();
      for (const slot of bundle.slots) {
        const local = toZonedTime(new Date(slot.start_utc), zone);
        const dateISO = format(local, "yyyy-MM-dd");
        if (defaults.blackout_dates.includes(dateISO)) {
          next[slot.id] = "no";
          guessed.add(slot.id);
          continue;
        }
        const covered = patternCoversSlot(defaults.weekly_pattern, zone, slot.start_utc);
        if (covered) {
          next[slot.id] = covered;
          guessed.add(slot.id);
        }
      }
      if (guessed.size > 0) {
        setPrefilled(true);
        setPredicted(guessed);
      }
      return next;
    });
  }, [bundle, timezone]);


  const grouped = useMemo(() => {
    if (!bundle) return [];
    const map = new Map<
      string,
      { label: string; weekend: boolean; slots: RespondBundle["slots"] }
    >();
    for (const slot of bundle.slots) {
      const local = toZonedTime(new Date(slot.start_utc), timezone);
      const key = format(local, "yyyy-MM-dd");
      const entry = map.get(key) ?? {
        label: format(local, "EEE MMM d"),
        weekend: local.getDay() === 0 || local.getDay() === 6,
        slots: [],
      };
      entry.slots.push(slot);
      map.set(key, entry);
    }
    return [...map.values()];
  }, [bundle, timezone]);

  // Saved availability older than 90 days probably isn't true anymore.
  const staleDefaults = useMemo(() => {
    const updated = bundle?.me?.defaults?.updated_at;
    if (!updated) return false;
    return Date.now() - new Date(updated).getTime() > 90 * 24 * 3600_000;
  }, [bundle?.me?.defaults?.updated_at]);

  const respondedCount = bundle?.participants.filter((p) => p.responded).length ?? 0;
  const totalCount = bundle?.participants.length ?? 0;
  const outstanding = bundle?.participants.filter((p) => !p.responded) ?? [];

  const joinMutation = useMutation({
    mutationFn: async () => join({ data: { slug, name: name.trim(), timezone } }),
    onSuccess: (res) => {
      setToken(res.token);
      writeGuestToken(slug, res.token);
      if (res.returning && res.hadResponses) setWelcomeBack(true);
      navigate({ to: "/p/$slug", params: { slug }, search: { t: res.token }, replace: true });
      setScreen("grid");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't start your response"),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Missing your response link");
      return submit({
        data: {
          slug,
          token,
          timezone,
          responses: Object.entries(answers).map(([candidate_slot_id, state]) => ({
            candidate_slot_id,
            state,
          })),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["respond", slug] });
      setScreen("done");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save your answer"),
  });

  function cycle(id: string) {
    // Tapping a predicted answer makes it a real one.
    setPredicted((current) => {
      if (!current.has(id)) return current;
      const copy = new Set(current);
      copy.delete(id);
      return copy;
    });
    setAnswers((current) => {
      const next = NEXT[current[id] ?? "unknown"];
      const copy = { ...current };
      if (next === "unknown") delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }


  function bulkSet(filter: (weekend: boolean) => boolean, state: SlotState | null) {
    if (!bundle) return;
    const next: Record<string, SlotState> = { ...answers };
    for (const day of grouped) {
      for (const slot of day.slots) {
        if (!filter(day.weekend)) continue;
        if (state === null) delete next[slot.id];
        else next[slot.id] = state;
      }
    }
    setAnswers(next);
    setPredicted(new Set());

  }

  if (!tokenReady || (bundleQuery.isLoading && !bundle)) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (bundleQuery.isError || !bundle) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 text-center">
        <h1 className="text-2xl font-black">This link isn't working</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask whoever sent it to share it again.</p>
      </main>
    );
  }

  const tzLine = (
    <div className="mt-3 text-xs text-muted-foreground">
      Times shown in {tzLabel(timezone)} — not right?{" "}
      <button
        type="button"
        onClick={() => setChangingTz((v) => !v)}
        className="underline underline-offset-4"
      >
        change
      </button>
      {changingTz && (
        <select
          className="mt-2 block h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
            setChangingTz(false);
          }}
        >
          {allZones(timezone).map((z) => (
            <option key={z} value={z}>
              {zoneLabel(z)}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  if (screen === "who") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-28 pt-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {bundle.project.name}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">What's your name?</h1>
        <Input
          className="mt-6 h-14 text-base"
          placeholder="Your name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) joinMutation.mutate();
          }}
        />
        {tzLine}
        <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md bg-background px-5 pb-6 pt-4">
          <Button
            className="h-14 w-full text-base font-bold"
            disabled={!name.trim() || joinMutation.isPending}
            onClick={() => joinMutation.mutate()}
          >
            Continue
          </Button>
        </div>
      </main>
    );
  }

  if (screen === "grid") {
    const answeredCount = Object.keys(answers).length;
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-8">
        <h1 className="text-2xl font-black tracking-tight">When can you make it?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You're the {ordinal(respondedCount + (bundle.me?.responded ? 0 : 1))} of {totalCount} to
          respond.
        </p>
        {tzLine}

        <div className="sticky top-0 z-10 -mx-5 mt-4 bg-background/95 px-5 py-3 backdrop-blur">
          <div className="flex flex-wrap gap-3 text-xs">
            <Legend className="bg-emerald-500 text-white" label="Yes" />
            <Legend className="bg-amber-400 text-amber-950" label="Maybe" />
            <Legend
              className="border-2 border-muted-foreground/50 text-muted-foreground"
              label="No"
            />
            <Legend className="border border-border bg-card" label="Not set" />
          </div>
        </div>

        {welcomeBack && (
          <p className="mt-3 rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
            Welcome back — here's what you said last time.
          </p>
        )}

        {prefilled && bannerOpen && (
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl bg-accent p-4 text-accent-foreground">
            <p className="min-w-0 text-sm">
              {staleDefaults
                ? "Predicted from your usual schedule — but that was set a while ago. Tap anything to change it."
                : "Predicted from your usual schedule (dotted outline) — tap anything to confirm or change it."}{" "}
              <Link to="/availability" className="font-bold underline underline-offset-4">
                Update your usual availability
              </Link>
            </p>


            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setBannerOpen(false)}
              className="grid size-11 shrink-0 place-items-center rounded-full"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => bulkSet((weekend) => weekend, "yes")}
            className="h-12 rounded-xl border-2 border-border text-sm font-bold"
          >
            All weekends work
          </button>
          <button
            type="button"
            onClick={() => bulkSet(() => true, "no")}
            className="h-12 rounded-xl border-2 border-border text-sm font-bold"
          >
            Nothing works
          </button>
        </div>

        <div className="mt-6 space-y-5">
          {grouped.map((day) => (
            <section key={day.label}>
              <h2 className="text-sm font-bold">{day.label}</h2>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {day.slots.map((slot) => {
                  const state = answers[slot.id];
                  const guess = predicted.has(slot.id);
                  const local = toZonedTime(new Date(slot.start_utc), timezone);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      aria-label={`${day.label} ${format(local, "h:mm a")} — ${state ?? "not set"}${
                        guess ? " (predicted from your usual schedule)" : ""
                      }`}
                      onClick={() => cycle(slot.id)}
                      className={cn(
                        "h-12 rounded-xl text-sm font-bold transition-colors",
                        state === "yes" && "bg-emerald-500 text-white",
                        state === "maybe" && "bg-amber-400 text-amber-950",
                        state === "no" &&
                          "border-2 border-muted-foreground/50 text-muted-foreground line-through",
                        !state && "border border-border bg-card",
                        guess && "border-2 border-dashed border-foreground/60 opacity-80",
                      )}
                    >

                      {format(local, "h:mm a").replace(":00", "")}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <button
          type="button"
          disabled
          className="mt-6 inline-flex min-h-11 items-center gap-2 self-start text-sm text-muted-foreground opacity-60"
        >
          <Mic className="size-4" /> Voice input — coming soon
        </button>

        <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background px-5 pb-6 pt-4">
          <Button
            className="h-14 w-full text-base font-bold"
            disabled={answeredCount === 0}
            onClick={() => setScreen("confirm")}
          >
            Review answer
          </Button>
        </div>
      </main>
    );
  }

  if (screen === "confirm") {
    const bullets = summarizeAnswers(bundle.slots, answers, timezone);
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-40 pt-10">
        <h1 className="text-2xl font-black tracking-tight">Here's what we heard</h1>
        <ul className="mt-5 space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex min-w-0 items-start gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 text-base">{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 space-y-4">
          {grouped
            .filter((day) => day.slots.some((s) => answers[s.id]))
            .map((day) => (
              <section key={day.label}>
                <h2 className="text-xs font-bold text-muted-foreground">{day.label}</h2>
                <div className="mt-1 flex flex-wrap gap-2">
                  {day.slots
                    .filter((s) => answers[s.id])
                    .map((s) => {
                      const state = answers[s.id];
                      const local = toZonedTime(new Date(s.start_utc), timezone);
                      return (
                        <span
                          key={s.id}
                          className={cn(
                            "rounded-lg px-3 py-2 text-xs font-bold",
                            state === "yes" && "bg-emerald-500 text-white",
                            state === "maybe" && "bg-amber-400 text-amber-950",
                            state === "no" &&
                              "border-2 border-muted-foreground/50 text-muted-foreground line-through",
                          )}
                        >
                          {format(local, "h:mm a").replace(":00", "")}
                        </span>
                      );
                    })}
                </div>
              </section>
            ))}
        </div>

        <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background px-5 pb-6 pt-4">
          <Button
            className="h-14 w-full text-base font-bold"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? "Saving…" : "Submit"}
          </Button>
          <button
            type="button"
            onClick={() => setScreen("grid")}
            className="mt-3 min-h-11 w-full text-sm text-muted-foreground underline underline-offset-4"
          >
            Go back and edit
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-14">
      <h1 className="text-3xl font-black tracking-tight">Thanks, {name.trim() || "friend"}.</h1>
      <p className="mt-2 text-base text-muted-foreground">
        We'll let you know when it's locked in.
      </p>

      <div className="mt-8 rounded-2xl border border-border p-4">
        <p className="text-sm font-bold">
          {respondedCount} of {totalCount} responded · quorum is {bundle.project.quorum_min}
        </p>
        {outstanding.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Still out: {outstanding.map((p) => p.display_name).join(", ")}
          </p>
        )}
      </div>

      <AccountUpsellCard variant="respondent" defaultName={name} />

      <button
        type="button"
        onClick={() => setScreen("grid")}
        className="mt-auto min-h-11 pt-10 text-sm text-muted-foreground underline underline-offset-4"
      >
        Change my answer
      </button>
    </main>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("size-4 rounded", className)} aria-hidden />
      {label}
    </span>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
