import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, Clock, Dices, ShieldAlert, Users } from "lucide-react";

import { AppBar } from "@/components/AppBar";
import { ModeToggle } from "@/components/ModeToggle";
import { PlanPrompt } from "@/components/PlanPrompt";
import { useAppMode } from "@/hooks/useAppMode";
import { copy } from "@/lib/mode";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Party.up — keep your campaign on the calendar" },
      {
        name: "description",
        content:
          "Lock a cadence, agree on a quorum, and rescue a session the moment it falls apart. Built for D&D groups, works for any plan.",
      },
      { property: "og:title", content: "Party.up — Adulting is hard, scheduling shouldn't be." },
      {
        property: "og:description",
        content:
          "Lock a cadence, agree on a quorum, and rescue a session the moment it falls apart. No calendar syncing needed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const CAMPAIGN_POINTS = [
  { icon: Dices, text: "Session Zero locks the cadence, the quorum, and who's required." },
  { icon: ShieldAlert, text: "A session falls apart? The rescue poll already exists." },
  { icon: CalendarCheck, text: "There's always a next session on the calendar." },
];

const PLAN_POINTS = [
  { icon: Clock, text: "Describe it in plain words or set it up manually in one screen." },
  { icon: Users, text: "Quorum or required? Decide if good enough beats everyone." },
  {
    icon: CalendarCheck,
    text: "Create recurring events: lock the cadence once, confirm each session.",
  },
];

function Index() {
  const { mode, setMode } = useAppMode();
  const c = copy(mode);
  const campaign = mode === "campaign";

  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-2 ${
        campaign ? "campaign-scope" : ""
      }`}
    >
      <AppBar back={false} />
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Party.up
      </p>

      <ModeToggle mode={mode} onChange={setMode} className="mt-4" />

      <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight">{c.homeHeader}</h1>
      <p className="mt-4 text-base text-muted-foreground">{c.homeSub}</p>

      {campaign ? (
        <>
          <Link
            to="/session-zero"
            className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground"
          >
            Start Session Zero
          </Link>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Takes about a minute. You'll get a link to send the party.
          </p>

          <div className="mt-5 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="mt-5">
            <PlanPrompt />
          </div>
        </>
      ) : (
        <>
          <div className="mt-7">
            <PlanPrompt />
          </div>

          <div className="mt-4 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Link
            to="/new"
            className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
          >
            Create event manually
          </Link>
        </>
      )}

      <ul className="mt-8 space-y-4">
        {(campaign ? CAMPAIGN_POINTS : PLAN_POINTS).map(({ icon: Icon, text }) => (
          <li key={text} className="flex min-w-0 items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 text-sm text-muted-foreground">{text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">
        <div className="grid grid-cols-2 gap-2">
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
      </div>
    </main>
  );
}
