import { AppBar } from "@/components/AppBar";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ChevronDown, Lock, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountUpsellCard } from "@/components/AccountUpsellCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getResults, lockOneOff, lockCadence } from "@/lib/results.functions";
import { nudgeResponders } from "@/lib/nudge.functions";
import { saveGroupFromProject } from "@/lib/groups.functions";
import { Input } from "@/components/ui/input";
import {
  enumerateCadences,
  listNames,
  rankSlots,
  type Cadence,
  type SlotScore,
  type CadenceOption,
} from "@/lib/solver";

export const Route = createFileRoute("/results/$slug")({
  head: () => ({
    meta: [
      { title: "Results — Penciled.in" },
      {
        name: "description",
        content: "See the best times for your group and lock one in with a single tap.",
      },
      { property: "og:title", content: "Results — Penciled.in" },
      {
        property: "og:description",
        content: "Ranked times, who's missing by name, and one button to decide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultsPage,
});

function localTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatSlot(startUtc: string, endUtc: string, tz: string) {
  const s = toZonedTime(new Date(startUtc), tz);
  const e = toZonedTime(new Date(endUtc), tz);
  const t = (d: Date) => {
    const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    const m = d.getMinutes() === 0 ? "" : `:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${h}${m}${d.getHours() < 12 ? "am" : "pm"}`;
  };
  return `${format(s, "EEE MMM d")}, ${t(s)}–${t(e)}`;
}

function ResultsPage() {
  const { slug } = Route.useParams();
  const { session } = useAuth();
  const tz = useMemo(localTz, []);
  const fetchResults = useServerFn(getResults);
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const query = useQuery({
    queryKey: ["results", slug],
    queryFn: () => fetchResults({ data: { slug } }),
  });

  const nudgeFn = useServerFn(nudgeResponders);
  const saveGroupFn = useServerFn(saveGroupFromProject);
  const [groupName, setGroupName] = useState("");
  const [savedGroupSlug, setSavedGroupSlug] = useState<string | null>(null);
  const [groupPromptOpen, setGroupPromptOpen] = useState(true);

  const saveGroupM = useMutation({
    mutationFn: () => saveGroupFn({ data: { slug, name: groupName.trim() } }),
    onSuccess: (res) => {
      setSavedGroupSlug(res.slug);
      toast.success("Saved — that crew is one tap away next time");
      qc.invalidateQueries({ queryKey: ["results", slug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nudgeM = useMutation({
    mutationFn: () => nudgeFn({ data: { slug, origin: window.location.origin } }),
    onSuccess: async (res) => {
      if (res.emailed > 0) {
        toast.success(`Nudged ${res.emailed} by email`);
        return;
      }
      try {
        await navigator.clipboard.writeText(res.message);
        toast.success("Nudge copied — paste it in the chat");
      } catch {
        toast.error("Couldn't copy — long-press to select instead.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lockSlotFn = useServerFn(lockOneOff);
  const lockCadenceFn = useServerFn(lockCadence);

  const lockSlotM = useMutation({
    mutationFn: (slotId: string) => lockSlotFn({ data: { slug, slotId } }),
    onSuccess: () => {
      toast.success("Locked in");
      qc.invalidateQueries({ queryKey: ["results", slug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lockCadenceM = useMutation({
    mutationFn: (option: CadenceOption) =>
      lockCadenceFn({
        data: {
          slug,
          weekday: option.weekday,
          cadenceKind: (data?.project.cadence ?? "weekly") as Cadence,
          occurrences: option.occurrences,
          durationMinutes: option.durationMinutes,
        },
      }),
    onSuccess: () => {
      toast.success("Cadence locked");
      qc.invalidateQueries({ queryKey: ["results", slug] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;

  const ranked: SlotScore[] = useMemo(() => {
    if (!data) return [];
    return rankSlots(data.slots, data.participants, data.responses, data.project.quorum_min, {
      previousOccurrenceUtc: data.previousOccurrenceUtc,
      timezone: tz,
    });
  }, [data, tz]);

  const cadences: CadenceOption[] = useMemo(() => {
    if (!data || data.project.mode !== "recurring") return [];
    return enumerateCadences(
      data.slots,
      data.participants,
      data.responses,
      data.project.quorum_min,
      (data.project.cadence ?? "weekly") as Cadence,
      tz,
      data.project.duration_minutes,
    );
  }, [data, tz]);

  if (query.isLoading) return <Shell>Crunching answers…</Shell>;
  if (query.error || !data)
    return <Shell>{(query.error as Error)?.message ?? "Couldn't load this plan."}</Shell>;

  // Reads are open to anyone with the link; only deciding needs the organizer.
  const canDecide = !!session;

  const waiting = data.participants.filter((p) => !p.responded).map((p) => p.display_name);
  const total = data.participants.length;
  const locked = data.project.status === "locked";

  return (
    <Shell>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{data.project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {data.participants.filter((p) => p.responded).length} of {total} responded · times in
          your local zone
        </p>
      </header>

      {locked && (
        <div className="mb-4 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Check className="h-4 w-4 shrink-0" /> This plan is locked in.
          </p>
          <Link
            to="/d/$slug"
            params={{ slug }}
            className="mt-3 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
          >
            Open the share-ready page
          </Link>
        </div>
      )}

      {canDecide && locked && !data.project.group_id && !savedGroupSlug && groupPromptOpen && (
        <div className="mb-5 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">
            Save these {total} people as a group?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Next time you can skip straight past the awkward name-typing part.
          </p>
          <Input
            className="mt-3 h-12 rounded-xl text-base"
            placeholder="Sunday crew"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <Button
              className="h-12 flex-1"
              disabled={!groupName.trim() || saveGroupM.isPending}
              onClick={() => saveGroupM.mutate()}
            >
              Save group
            </Button>
            <Button
              variant="secondary"
              className="h-12"
              onClick={() => setGroupPromptOpen(false)}
            >
              Not now
            </Button>
          </div>
        </div>
      )}

      {savedGroupSlug && (
        <div className="mb-5 rounded-2xl border border-accent bg-accent/40 p-4 text-sm">
          Group saved. Its permanent link:{" "}
          <Link to="/g/$slug" params={{ slug: savedGroupSlug }} className="underline">
            /g/{savedGroupSlug}
          </Link>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Waiting on: </span>
            {waiting.join(", ")}
          </p>
          {canDecide && (
            <Button variant="secondary" className="h-11 shrink-0" onClick={() => nudgeM.mutate()}>
              Nudge
            </Button>
          )}
        </div>
      )}

      {data.project.mode === "recurring" ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Best cadences
          </h2>
          {cadences.length === 0 && (
            <p className="text-sm text-muted-foreground">No candidate times yet.</p>
          )}
          {cadences.slice(0, 3).map((option, i) => (
            <article
              key={`${option.weekday}-${option.startTime}`}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {i === 0 ? "Best fit" : "Alternate"}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{option.label}</h3>
              <p className="mt-1 text-sm">
                Quorum met for {option.metCount} of the next {option.totalCount} sessions
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{option.tradeoff}</p>
              {canDecide && (
                <Button
                  className="mt-4 h-12 w-full"
                  disabled={lockCadenceM.isPending || locked}
                  onClick={() => lockCadenceM.mutate(option)}
                >
                  <Lock className="mr-2 h-4 w-4" /> Lock this cadence
                </Button>
              )}
            </article>
          ))}
        </section>
      ) : (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Best times
          </h2>
          {ranked.length === 0 && (
            <p className="text-sm text-muted-foreground">No candidate times yet.</p>
          )}
          {ranked.slice(0, 3).map((s) => (
            <SlotCard
              key={s.slot.id}
              score={s}
              total={total}
              tz={tz}
              disabled={lockSlotM.isPending || locked}
              canLock={canDecide}
              onLock={() => lockSlotM.mutate(s.slot.id)}
            />
          ))}
        </section>
      )}

      {ranked.length > 3 && (
        <section className="mt-6">
          <button
            type="button"
            className="flex h-11 w-full items-center justify-between rounded-xl border border-border px-4 text-sm font-medium"
            onClick={() => setShowAll((v) => !v)}
          >
            See all slots ({ranked.length})
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`}
            />
          </button>
          {showAll && (
            <ul className="mt-3 space-y-2">
              {ranked.slice(3).map((s) => (
                <li
                  key={s.slot.id}
                  className={`rounded-xl border p-3 text-sm ${
                    s.viable ? "border-border bg-card" : "border-border/60 bg-muted/40 opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {formatSlot(s.slot.start_utc, s.slot.end_utc, tz)}
                    </span>
                    <span className="text-muted-foreground">
                      {s.yes + s.maybe} of {total}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.viable ? missingLine(s) || "Everyone can make it." : s.reasons.join(" · ")}
                  </p>
                  {canDecide && s.viable && !locked && (
                    <Button
                      variant="secondary"
                      className="mt-3 h-11 w-full"
                      onClick={() => lockSlotM.mutate(s.slot.id)}
                    >
                      Lock this in
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!canDecide && <AccountUpsellCard variant="organizer" />}
    </Shell>
  );
}

function missingLine(s: SlotScore): string {
  const parts: string[] = [];
  if (s.noNames.length > 0) {
    parts.push(
      `${listNames(s.noNames)} can't make it${s.noNames.length === 1 ? "." : "."}`,
    );
  }
  if (s.unknownNames.length > 0) {
    parts.push(
      `${listNames(s.unknownNames)} ${s.unknownNames.length === 1 ? "hasn't" : "haven't"} responded.`,
    );
  }
  if (s.maybeNames.length > 0) {
    parts.push(`${listNames(s.maybeNames)} said maybe.`);
  }
  return parts.join(" ");
}

function SlotCard({
  score,
  total,
  tz,
  disabled,
  canLock,
  onLock,
}: {
  score: SlotScore;
  total: number;
  tz: string;
  disabled: boolean;
  canLock: boolean;
  onLock: () => void;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 ${
        score.viable ? "border-border bg-card" : "border-border/60 bg-muted/40 opacity-70"
      }`}
    >
      <h3 className="text-lg font-semibold">
        {formatSlot(score.slot.start_utc, score.slot.end_utc, tz)}
      </h3>
      <p className="mt-1 text-sm">
        {score.yes + score.maybe} of {total} can make it
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {score.viable ? missingLine(score) || "Everyone can make it." : score.reasons.join(" · ")}
      </p>
      {canLock && score.viable && (
        <Button className="mt-4 h-12 w-full" disabled={disabled} onClick={onLock}>
          <Lock className="mr-2 h-4 w-4" /> Lock this in
        </Button>
      )}
    </article>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-6 pb-24">
      <AppBar />
      {children}
    </main>
  );
}
