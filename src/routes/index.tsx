import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, Clock, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Adulting is Hard — lock in a date with your group" },
      {
        name: "description",
        content:
          "Group scheduling that ships a decision. Under 30 seconds to respond, no signup for guests, timezone-aware.",
      },
      { property: "og:title", content: "Adulting is Hard — lock in a date with your group" },
      {
        property: "og:description",
        content:
          "Pick a template, share one link, get a decision. Takes 30 seconds — no signup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Adulting is Hard
      </p>
      <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight">
        Lock in a date without the 200-message thread.
      </h1>
      <p className="mt-4 text-base text-muted-foreground">
        Pick a template, share one link, get a decision. Your people answer in under 30 seconds and
        never make an account.
      </p>

      <ul className="mt-8 space-y-4">
        {[
          { icon: Clock, text: "Templates narrow the options, so nobody sees a wall of times." },
          { icon: Users, text: "Quorum, not unanimity — good enough beats everyone." },
          { icon: CalendarCheck, text: "Recurring: lock the cadence once, confirm each session." },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex min-w-0 items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 text-sm text-muted-foreground">{text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">
        <Link
          to="/new"
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
        >
          Start a plan
        </Link>
        <Link
          to="/home"
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl border border-border text-sm font-semibold"
        >
          Your upcoming sessions
        </Link>
        <Link
          to="/auth"
          className="mt-3 flex min-h-11 w-full items-center justify-center text-sm text-muted-foreground underline underline-offset-4"
        >
          Organizer sign in
        </Link>
      </div>
    </main>
  );
}
