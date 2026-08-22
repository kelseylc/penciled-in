import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Check, Clock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getOccurrenceGuest, submitOccurrenceRsvp } from "@/lib/occurrences.functions";

export const Route = createFileRoute("/o/$id")({
  head: () => ({
    meta: [
      { title: "Are you in? — Adulting is Hard" },
      {
        name: "description",
        content: "Confirm this session in one tap. In, out, or running late — no signup.",
      },
      { property: "og:title", content: "Are you in? — Adulting is Hard" },
      {
        property: "og:description",
        content: "One tap to confirm the next session with your group.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search["t"] === "string" ? (search["t"] as string) : undefined,
  }),
  component: OccurrencePage,
});

function localTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatWhen(startUtc: string, tz: string) {
  const d = toZonedTime(new Date(startUtc), tz);
  const abbr =
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date(startUtc))
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${format(d, "EEEE MMM d, h:mm a")} ${abbr}`.trim();
}

type State = "in" | "out" | "late";

function OccurrencePage() {
  const { id } = Route.useParams();
  const { t } = Route.useSearch();
  const tz = useMemo(localTz, []);

  const [token, setToken] = useState<string | null>(t ?? null);
  const [name, setName] = useState("");
  const [claimedName, setClaimedName] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState<State | null>(null);

  const fetchBundle = useServerFn(getOccurrenceGuest);
  const rsvpFn = useServerFn(submitOccurrenceRsvp);

  const query = useQuery({
    queryKey: ["occurrence", id, token, claimedName],
    queryFn: () => fetchBundle({ data: { occurrenceId: id, token, name: claimedName } }),
    placeholderData: (prev) => prev,
  });
  const data = query.data;

  useEffect(() => {
    if (token || !data) return;
    const stored = window.localStorage.getItem(`aih:token:${data.project.slug}`);
    if (stored) setToken(stored);
  }, [data, token]);

  useEffect(() => {
    if (data?.me?.state && !submitted) setNote(data.me.note ?? "");
  }, [data, submitted]);

  const mutation = useMutation({
    mutationFn: (state: State) =>
      rsvpFn({
        data: {
          occurrenceId: id,
          token,
          name: claimedName ?? (name.trim() || null),
          state,
          note: note.trim() || null,
        },
      }),
    onSuccess: (res, state) => {
      if (res.token && data) {
        setToken(res.token);
        window.localStorage.setItem(`aih:token:${data.project.slug}`, res.token);
      }
      setSubmitted(state);
      query.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading && !data) return <Shell>Loading…</Shell>;
  if (query.error || !data)
    return <Shell>{(query.error as Error)?.message ?? "This session link isn't valid."}</Shell>;

  const knownMe = data.me;

  if (data.occurrence.status === "cancelled") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">{data.project.name}</h1>
        <p className="mt-2 text-muted-foreground">
          This session was cancelled. Nothing to do here.
        </p>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell>
        <div className="flex h-full flex-col justify-center">
          <h1 className="text-2xl font-bold">
            {submitted === "in"
              ? "You're in."
              : submitted === "late"
                ? "Noted — running late."
                : "Got it, you're out."}
          </h1>
          <p className="mt-2 text-muted-foreground">{formatWhen(data.occurrence.scheduled_start_utc, tz)}</p>
          <p className="mt-4 text-sm">
            {data.tally.attending} of {data.tally.total} confirmed
            {data.tally.noResponse > 0 ? ` · ${data.tally.noResponse} still to answer` : ""}.
          </p>
          <Button
            variant="secondary"
            className="mt-6 h-12"
            onClick={() => {
              setSubmitted(null);
            }}
          >
            Change my answer
          </Button>
        </div>
      </Shell>
    );
  }

  if (!knownMe) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">{data.project.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {formatWhen(data.occurrence.scheduled_start_utc, tz)}
        </p>
        <label htmlFor="who" className="mt-8 block text-sm font-medium">
          What&apos;s your name?
        </label>
        <Input
          id="who"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="mt-2 h-14 text-base"
          autoFocus
        />
        <Button
          className="mt-4 h-14 w-full text-base font-bold"
          disabled={!name.trim()}
          onClick={() => setClaimedName(name.trim())}
        >
          Continue
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Session {data.occurrence.index} of {data.occurrence.total}
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{data.project.name}</h1>
      <p className="mt-1 text-lg">{formatWhen(data.occurrence.scheduled_start_utc, tz)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Hi {knownMe.display_name} — times shown in your local zone.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Are you in?</h2>
      <div className="mt-4 space-y-3">
        <RsvpButton
          state="in"
          current={knownMe.state}
          icon={<Check className="h-5 w-5" />}
          label="I'm in"
          onClick={() => mutation.mutate("in")}
          disabled={mutation.isPending}
        />
        <RsvpButton
          state="out"
          current={knownMe.state}
          icon={<X className="h-5 w-5" />}
          label="Can't make it"
          onClick={() => mutation.mutate("out")}
          disabled={mutation.isPending}
        />
        <RsvpButton
          state="late"
          current={knownMe.state}
          icon={<Clock className="h-5 w-5" />}
          label="Running late"
          onClick={() => mutation.mutate("late")}
          disabled={mutation.isPending}
        />
      </div>

      <label htmlFor="note" className="mt-6 block text-sm text-muted-foreground">
        Add a note (optional)
      </label>
      <Input
        id="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. there by 7:30"
        className="mt-2 h-12"
      />

      <p className="mt-6 text-sm text-muted-foreground">
        {data.tally.attending} of {data.tally.total} confirmed so far.
      </p>
    </Shell>
  );
}

function RsvpButton({
  state,
  current,
  icon,
  label,
  onClick,
  disabled,
}: {
  state: State;
  current: State | null;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const active = current === state;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border text-base font-bold transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground"
      }`}
    >
      {icon}
      {label}
      {active && <span className="ml-1 text-xs font-medium opacity-80">saved</span>}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">{children}</main>;
}
