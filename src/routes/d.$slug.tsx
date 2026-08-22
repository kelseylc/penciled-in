import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarPlus, Copy, Globe2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildIcs, downloadIcs, slugifyFilename, type IcsCadence } from "@/lib/ics";
import { getLockedPlan, type LockedPlan } from "@/lib/locked.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/d/$slug")({
  head: () => ({
    meta: [
      { title: "It's happening — Adulting is Hard" },
      {
        name: "description",
        content:
          "The date is locked. See the time in your zone, who's in, and add it to your calendar.",
      },
      { property: "og:title", content: "It's happening — Adulting is Hard" },
      {
        property: "og:description",
        content: "The date is locked in. Takes 30 seconds — no signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LockedPage,
});

const STATUS_LABEL: Record<string, string> = {
  in: "In",
  late: "Running late",
  out: "Out",
  yes: "In",
  maybe: "Maybe",
  no: "Out",
};

function localTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function zoneAbbrev(iso: string, tz: string) {
  try {
    return formatInTimeZone(new Date(iso), tz, "zzz");
  } catch {
    return tz;
  }
}

function LockedPage() {
  const { slug } = Route.useParams();
  const tz = useMemo(localTz, []);
  const fetchPlan = useServerFn(getLockedPlan);
  const [zonesOpen, setZonesOpen] = useState(false);

  const query = useQuery<LockedPlan>({
    queryKey: ["locked", slug],
    queryFn: () => fetchPlan({ data: { slug } }),
  });

  const data = query.data;

  if (query.isLoading) return <Shell>Loading the plan…</Shell>;
  if (query.error || !data)
    return <Shell>{(query.error as Error)?.message ?? "Couldn't load this plan."}</Shell>;

  if (data.project.status !== "locked") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">{data.project.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Nothing's decided yet — the answers are still coming in.
        </p>
        <Link
          to="/p/$slug"
          params={{ slug }}
          className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
        >
          Add your times
        </Link>
      </Shell>
    );
  }

  const upcoming = data.occurrences.filter((o) => o.status !== "cancelled");
  const next = upcoming.find((o) => new Date(o.scheduled_start_utc) > new Date()) ?? upcoming[0];
  const recurring = data.project.mode === "recurring";

  const statusFor = (participantId: string) => {
    if (recurring && next) return data.rsvps[next.id]?.[participantId] ?? "unknown";
    return data.slotStates[participantId] ?? "unknown";
  };

  const attending = data.participants.filter((p) => ["in", "late", "yes"].includes(statusFor(p.id)));
  const outList = data.participants.filter((p) => ["out", "no"].includes(statusFor(p.id)));

  const zones = Array.from(
    new Set([tz, ...data.participants.map((p) => p.timezone).filter((v): v is string => !!v)]),
  );

  function calendarFile() {
    if (!next || !data) return;
    const cadence = recurring ? ((data.project.cadence ?? "weekly") as IcsCadence) : null;
    const ics = buildIcs({
      uid: `${data.project.id}-${next.id}@adultingishard`,
      title: data.project.name,
      description: `Locked in with Adulting is Hard. ${window.location.origin}/d/${slug}`,
      url: `${window.location.origin}/d/${slug}`,
      startUtc: next.scheduled_start_utc,
      endUtc: next.scheduled_end_utc,
      cadence,
      count: cadence ? upcoming.length : 0,
    });
    downloadIcs(slugifyFilename(data.project.name), ics);
    toast.success(cadence ? "Series added — every one of them" : "Calendar file saved");
  }

  function copySummary() {
    if (!next || !data) return;
    const label = recurring ? `Session ${next.index} — ` : "";
    const primary = `${formatInTimeZone(new Date(next.scheduled_start_utc), tz, "EEE MMM d, h:mm a")} ${zoneAbbrev(next.scheduled_start_utc, tz)}`;
    const others = zones
      .filter((z) => z !== tz)
      .slice(0, 2)
      .map(
        (z) =>
          `${formatInTimeZone(new Date(next.scheduled_start_utc), z, "h:mm a")} ${zoneAbbrev(next.scheduled_start_utc, z)}`,
      );
    const times = [primary, ...others].join(" / ");
    const inNames = attending.map((p) => p.display_name).join(", ") || "nobody yet";
    const outNames = outList.map((p) => p.display_name).join(", ");
    const text =
      `${label}${times}\n` +
      `In: ${inNames}${outNames ? ` · Out: ${outNames}` : ""}\n` +
      `Calendar file: ${window.location.origin}/d/${slug}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied — go paste it in the chat"))
      .catch(() => toast.error("Couldn't copy — long-press to select instead."));
  }

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">It's happening</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{data.project.name}</h1>

      {next && (
        <section className="mt-5 rounded-3xl border border-primary/30 bg-primary/10 p-5">
          {recurring && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Session {next.index} of {upcoming.length}
            </p>
          )}
          <p className="mt-1 text-3xl font-black leading-tight">
            {formatInTimeZone(new Date(next.scheduled_start_utc), tz, "EEEE MMM d")}
          </p>
          <p className="text-2xl font-bold">
            {formatInTimeZone(new Date(next.scheduled_start_utc), tz, "h:mm a")} –{" "}
            {formatInTimeZone(new Date(next.scheduled_end_utc), tz, "h:mm a")}{" "}
            {zoneAbbrev(next.scheduled_start_utc, tz)}
          </p>
          <button
            type="button"
            onClick={() => setZonesOpen((v) => !v)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline"
          >
            <Globe2 className="h-4 w-4" />
            {zones.length} timezone{zones.length === 1 ? "" : "s"} in this group
          </button>
          {zonesOpen && (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {zones.map((z) => (
                <li key={z}>
                  {z.split("/").pop()?.replace(/_/g, " ")} —{" "}
                  {formatInTimeZone(new Date(next.scheduled_start_utc), z, "EEE h:mm a")}{" "}
                  {zoneAbbrev(next.scheduled_start_utc, z)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Who's coming
        </h2>
        <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
          {data.participants.map((p) => {
            const s = statusFor(p.id);
            return (
              <li key={p.id} className="flex min-h-12 items-center justify-between px-4 py-3">
                <span className="text-base">
                  {p.display_name}
                  {p.is_required && (
                    <span className="ml-2 text-xs text-muted-foreground">required</span>
                  )}
                </span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    ["in", "yes"].includes(s) && "bg-accent text-accent-foreground",
                    s === "late" && "bg-secondary text-secondary-foreground",
                    ["out", "no"].includes(s) && "bg-destructive/15 text-destructive",
                    s === "unknown" && "bg-muted text-muted-foreground",
                    s === "maybe" && "bg-secondary text-secondary-foreground",
                  )}
                >
                  {STATUS_LABEL[s] ?? "Haven't said"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {recurring && upcoming.length > 1 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            The rest of the run
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {upcoming.slice(0, 12).map((o) => (
              <li key={o.id}>
                Session {o.index} —{" "}
                {formatInTimeZone(new Date(o.scheduled_start_utc), tz, "EEE MMM d, h:mm a")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-0 mt-8 space-y-2 bg-gradient-to-t from-background via-background pb-6 pt-4">
        <Button className="h-14 w-full rounded-2xl text-base" onClick={calendarFile}>
          <CalendarPlus className="mr-2 h-5 w-5" />
          Add to calendar
        </Button>
        <Button
          variant="secondary"
          className="h-14 w-full rounded-2xl text-base"
          onClick={copySummary}
        >
          <Copy className="mr-2 h-5 w-5" />
          Copy summary
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8 text-base">
      <AppBar />
      {children}
    </main>
  );
}
