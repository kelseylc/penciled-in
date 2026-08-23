import { AppBar } from "@/components/AppBar";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { AlertTriangle, Copy } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  actOnOccurrence,
  getOrganizerOccurrences,
  type OrganizerOccurrence,
} from "@/lib/occurrences.functions";
import { listNames } from "@/lib/solver";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "My events — Penciled.in" },
      {
        name: "description",
        content:
          "See the next sessions for every group you organize, spot at-risk nights early, and re-poll just that session.",
      },
      { property: "og:title", content: "My events — Penciled.in" },
      {
        property: "og:description",
        content: "Confirmed, at risk or pending — the recurring loop at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function localTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const CHIP: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-primary/15 text-primary border-primary/40" },
  at_risk: {
    label: "At risk",
    className: "bg-destructive/15 text-destructive border-destructive/40",
  },
  pending: { label: "Pending", className: "bg-muted text-muted-foreground border-border" },
  repolling: { label: "Re-polling", className: "bg-accent/20 text-accent-foreground border-border" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
};

function HomePage() {
  const { session, loading } = useAuth();
  const tz = useMemo(localTz, []);
  const qc = useQueryClient();
  const fetchOccurrences = useServerFn(getOrganizerOccurrences);
  const actFn = useServerFn(actOnOccurrence);

  const query = useQuery({
    queryKey: ["organizer-occurrences"],
    queryFn: () => fetchOccurrences({ data: { slug: null } }),
    enabled: !!session,
  });

  const act = useMutation({
    mutationFn: (vars: { occurrenceId: string; action: "repoll" | "go_ahead" | "cancel" }) =>
      actFn({ data: vars }),
    onSuccess: (res, vars) => {
      if (vars.action === "repoll" && res.repollSlug) {
        toast.success("Re-poll started — share the link with the group.");
      } else if (vars.action === "cancel") {
        toast.success("Session cancelled");
      } else {
        toast.success("Going ahead anyway");
      }
      qc.invalidateQueries({ queryKey: ["organizer-occurrences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Shell>Loading…</Shell>;
  if (!session)
    return (
      <Shell>
        <p className="text-muted-foreground">Sign in to see your group's sessions.</p>
        <Link to="/auth" className="mt-4 inline-block underline">
          Sign in
        </Link>
      </Shell>
    );
  if (query.isLoading) return <Shell>Loading your sessions…</Shell>;

  const all = [...(query.data ?? [])].sort(
    (a, b) =>
      new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime(),
  );
  const next = all[0];
  if (!next) {
    return (
      <Shell>
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">My events</h1>
          <p className="text-sm text-muted-foreground">
            Your scheduled and upcoming plans will show up here.
          </p>
        </header>
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No events yet. Start a plan from a template or describe it in plain words.
          </p>
        </div>
        <Link
          to="/new"
          className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
        >
          Start scheduling
        </Link>
        <Link
          to="/"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl border border-border text-sm font-semibold"
        >
          Back to home
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Next up</h1>
        <p className="text-sm text-muted-foreground">
          Your next session, in your local time.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {next.project_name}
        </h2>
        <OccurrenceCard
          occ={next}
          tz={tz}
          pending={act.isPending}
          onAct={(action) => act.mutate({ occurrenceId: next.id, action })}
        />
      </section>

      <Link
        to="/new"
        className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
      >
        Schedule next event
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to="/home"
          className="flex min-h-12 items-center justify-center rounded-2xl border border-border text-sm font-semibold"
        >
          My events
        </Link>
        <Link
          to="/groups"
          className="flex min-h-12 items-center justify-center rounded-2xl border border-border text-sm font-semibold"
        >
          My groups
        </Link>
      </div>
    </Shell>
  );
}

function OccurrenceCard({
  occ,
  tz,
  pending,
  onAct,
}: {
  occ: OrganizerOccurrence;
  tz: string;
  pending: boolean;
  onAct: (action: "repoll" | "go_ahead" | "cancel") => void;
}) {
  const chip = CHIP[occ.status] ?? CHIP["pending"]!;
  const when = format(toZonedTime(new Date(occ.scheduled_start_utc), tz), "EEE MMM d, h:mm a");
  const atRisk = occ.status === "at_risk";

  function copyConfirmLink() {
    const link = `${window.location.origin}/o/${occ.id}`;
    const text = `${occ.project_name} — ${when}. You in? Takes 10 seconds: ${link}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Confirm link copied"))
      .catch(() => toast.error("Couldn't copy"));
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{when}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {occ.attending} of {occ.totalParticipants} confirmed · quorum {occ.quorum_min}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${chip.className}`}
        >
          {chip.label}
        </span>
      </div>

      {atRisk && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>
              Only {occ.attending} of {occ.totalParticipants} confirmed for{" "}
              {format(toZonedTime(new Date(occ.scheduled_start_utc), tz), "MMM d")}.
              {occ.requiredOut.length > 0 && (
                <>
                  {" "}
                  {listNames(occ.requiredOut)} (required) can't make it.
                </>
              )}
            </span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Just this session — your locked cadence stays put.
          </p>
          <div className="mt-3 space-y-2">
            <Button
              className="h-12 w-full"
              disabled={pending}
              onClick={() => onAct("repoll")}
            >
              Re-poll this session
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="h-11 flex-1"
                disabled={pending}
                onClick={() => onAct("go_ahead")}
              >
                Go ahead anyway
              </Button>
              <Button
                variant="ghost"
                className="h-11 flex-1"
                disabled={pending}
                onClick={() => onAct("cancel")}
              >
                Cancel session
              </Button>
            </div>
          </div>
        </div>
      )}

      {occ.status === "repolling" && occ.repollSlug && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <p>Re-polling this session (±7 days). Your cadence hasn't moved.</p>
          <div className="mt-3 flex gap-2">
            <Link
              to="/share/$slug"
              params={{ slug: occ.repollSlug }}
              className="flex h-11 flex-1 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
            >
              Share re-poll
            </Link>
            <Link
              to="/results/$slug"
              params={{ slug: occ.repollSlug }}
              className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold"
            >
              Re-poll results
            </Link>
          </div>
        </div>
      )}

      {(occ.outNames.length > 0 || occ.noResponseNames.length > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {occ.outNames.length > 0 && <>{listNames(occ.outNames)} out. </>}
          {occ.noResponseNames.length > 0 && (
            <>
              {listNames(occ.noResponseNames)}{" "}
              {occ.noResponseNames.length === 1 ? "hasn't" : "haven't"} answered.
            </>
          )}
        </p>
      )}

      {occ.status !== "cancelled" && occ.status !== "repolling" && (
        <Button variant="secondary" className="mt-3 h-11 w-full" onClick={copyConfirmLink}>
          <Copy className="mr-2 h-4 w-4" /> Copy confirm link
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
