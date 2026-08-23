import { AppBar } from "@/components/AppBar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format } from "date-fns";
import { ChevronLeft, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { takeDraft } from "@/lib/plan-draft";
import { createProject } from "@/lib/projects.functions";
import { saveGroupFromProject } from "@/lib/groups.functions";

import { effectiveDurationMinutes, generateCandidateSlots, MAX_SLOTS } from "@/lib/slots";
import {
  DAY_LABELS,
  describeDays,
  formatDuration,
  formatHour,
  getTemplate,
  TEMPLATES,
  type EventConstraints,
  type TemplateId,
} from "@/lib/templates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/new")({
  validateSearch: (search: Record<string, unknown>): { draft?: 1 } =>
    search["draft"] ? { draft: 1 } : {},

  head: () => ({
    meta: [
      { title: "New plan — Penciled.in" },
      {
        name: "description",
        content:
          "Create a group plan in a few taps: pick a template, a date window, your people, and a quorum.",
      },
      { property: "og:title", content: "New plan — Penciled.in" },
      {
        property: "og:description",
        content: "Pick a template, a date window, your people, and a quorum. Then share one link.",
      },
    ],
  }),
  component: NewProject,
});

type Person = {
  key: string;
  display_name: string;
  timezone: string;
  is_required: boolean;
  profile_id: string | null;
};

type GroupRow = { id: string; name: string };

const STEPS = ["Template", "Name", "Dates", "People", "Quorum", "Deadline", "Review"] as const;

function NewProject() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const create = useServerFn(createProject);
  const saveGroup = useServerFn(saveGroupFromProject);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<TemplateId | null>(null);
  const [constraints, setConstraints] = useState<EventConstraints>({
    days: [0, 1, 2, 3, 4, 5, 6],
    startAfter: 9,
    endBy: 24,
    durationMinutes: 120,
  });
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"one_off" | "recurring">("one_off");
  const [cadence, setCadence] = useState<"weekly" | "biweekly" | "monthly" | "quarterly">("weekly");
  const [windowMode, setWindowMode] = useState<"rolling" | "custom">("rolling");
  const [rollingWeeks, setRollingWeeks] = useState(4);
  const [range, setRange] = useState<DateRange | undefined>();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [newName, setNewName] = useState("");
  const [saveAsGroup, setSaveAsGroup] = useState(false);
  const [saveGroupName, setSaveGroupName] = useState("");
  const [quorum, setQuorum] = useState(2);
  const [quorumTouched, setQuorumTouched] = useState(false);
  const [hasDeadline, setHasDeadline] = useState(true);
  const [deadline, setDeadline] = useState<Date>(addDays(new Date(), 5));
  const [busy, setBusy] = useState(false);
  const [draftNote, setDraftNote] = useState<{ summary: string; missing: string[] } | null>(null);
  const search = Route.useSearch();

  useEffect(() => {
    if (!search.draft || !session) return;
    const draft = takeDraft();
    if (!draft) return;
    setTemplateId(draft.template);
    setConstraints({
      days: draft.days,
      startAfter: draft.startAfter,
      endBy: draft.endBy,
      durationMinutes: draft.durationMinutes,
      fullDay: draft.fullDay,
    });
    if (draft.name) setName(draft.name);
    setMode(draft.mode);
    if (draft.cadence) setCadence(draft.cadence);
    setWindowMode("rolling");
    setRollingWeeks(draft.rollingWeeks || 4);
    const parsedPeople = draft.people.map((p) => ({
      key: crypto.randomUUID(),
      display_name: p.display_name,
      timezone: tz,
      is_required: p.is_required,
      profile_id: null,
    }));
    setPeople(parsedPeople);
    if (draft.quorum) {
      setQuorum(draft.quorum);
      setQuorumTouched(true);
    }
    if (draft.deadlineDays) setDeadline(addDays(new Date(), draft.deadlineDays));
    setDraftNote({ summary: draft.summary, missing: draft.missing });
    setStep(parsedPeople.length === 0 ? 3 : draft.name ? 4 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.draft, session]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("groups")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => setGroups(data ?? []));
  }, [session]);

  useEffect(() => {
    if (!quorumTouched) {
      setQuorum(Math.max(2, Math.ceil(people.length * 0.6)));
    }
  }, [people.length, quorumTouched]);

  const template = templateId ? getTemplate(templateId) : null;

  const windowStart = windowMode === "rolling" ? new Date() : (range?.from ?? new Date());
  const windowEnd =
    windowMode === "rolling"
      ? addDays(new Date(), rollingWeeks * 7)
      : (range?.to ?? addDays(range?.from ?? new Date(), 7));

  const generation = useMemo(() => {
    if (!template) return null;
    return generateCandidateSlots({
      constraints,
      windowStart: format(windowStart, "yyyy-MM-dd"),
      windowEnd: format(windowEnd, "yyyy-MM-dd"),
      timezone: tz,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    template,
    constraints,
    tz,
    format(windowStart, "yyyy-MM-dd"),
    format(windowEnd, "yyyy-MM-dd"),
  ]);

  const generationKey = generation
    ? `${generation.slots.length}:${generation.slots[0]?.start_utc ?? ""}:${generation.slots[generation.slots.length - 1]?.start_utc ?? ""}`
    : "";
  useEffect(() => {
    setRemovedSlots([]);
    setExtraSlots([]);
  }, [generationKey]);

  const finalSlots = useMemo(() => {
    const gone = new Set(removedSlots);
    return [...(generation?.slots ?? []).filter((s) => !gone.has(s.start_utc)), ...extraSlots].sort(
      (a, b) => a.start_utc.localeCompare(b.start_utc),
    );
  }, [generation, removedSlots, extraSlots]);

  function patch(next: Partial<EventConstraints>) {
    setConstraints((c) => ({ ...c, ...next }));
  }

  function toggleDay(d: number) {
    setConstraints((c) => {
      const has = c.days.includes(d);
      const days = has ? c.days.filter((x) => x !== d) : [...c.days, d].sort((a, b) => a - b);
      return { ...c, days: days.length ? days : c.days };
    });
  }

  async function pickGroup(id: string) {
    setGroupId(id);
    const { data } = await supabase
      .from("group_members")
      .select("id, display_name, timezone, is_required_default, profile_id")
      .eq("group_id", id);
    setPeople(
      (data ?? []).map((m) => ({
        key: m.id,
        display_name: m.display_name,
        timezone: m.timezone ?? tz,
        is_required: m.is_required_default,
        profile_id: m.profile_id,
      })),
    );
  }

  function addPerson() {
    const value = newName.trim();
    if (!value) return;
    setPeople((p) => [
      ...p,
      {
        key: crypto.randomUUID(),
        display_name: value,
        timezone: tz,
        is_required: false,
        profile_id: null,
      },
    ]);
    setNewName("");
  }

  const canAdvance = [
    !!templateId && constraints.days.length > 0,
    name.trim().length > 0,
    windowMode === "rolling" || (!!range?.from && !!range?.to),
    people.length > 0,
    quorum >= 1,
    true,
  ][step];

  async function submit() {
    if (!template || !generation) return;
    setBusy(true);
    try {
      const result = await create({
        data: {
          name: name.trim(),
          template: template.id,
          duration_minutes: effectiveDurationMinutes(constraints),
          mode,
          cadence: mode === "recurring" ? cadence : null,
          window_mode: windowMode,
          window_start: format(windowStart, "yyyy-MM-dd"),
          window_end: format(windowEnd, "yyyy-MM-dd"),
          quorum_min: quorum,
          response_deadline: hasDeadline ? deadline.toISOString() : null,
          group_id: groupId,
          participants: people.map((p) => ({
            display_name: p.display_name,
            timezone: p.timezone,
            is_required: p.is_required,
            profile_id: p.profile_id,
          })),
          slots: generation.slots,
        },
      });
      if (saveAsGroup && !groupId && saveGroupName.trim() && session) {
        try {
          await saveGroup({ data: { slug: result.slug, name: saveGroupName.trim() } });
          toast.success(`Saved “${saveGroupName.trim()}” — reuse these people next time.`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't save that group");
        }
      }
      if (generation.widened) {
        toast.info("That window was huge, so start times are spaced further apart.");
      }
      navigate({ to: "/share/$slug", params: { slug: result.slug } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-6">
      <AppBar back={false} />
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (step === 0 ? navigate({ to: "/" }) : setStep(step - 1))}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{STEPS[step]}</p>
          <p className="text-xs text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
      </header>

      <div className="mt-3 flex gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-secondary")}
          />
        ))}
      </div>

      {draftNote && (
        <div className="mt-4 rounded-2xl border-2 border-primary/40 bg-primary/10 p-4">
          <p className="text-sm font-bold">Draft ready from your description</p>
          <p className="mt-1 text-xs text-muted-foreground">{draftNote.summary}</p>
          {draftNote.missing.length > 0 && (
            <p className="mt-2 text-xs font-semibold text-primary">
              Still need: {draftNote.missing.join(", ")}. Everything else is pre-filled — tap back
              anytime to change it.
            </p>
          )}
        </div>
      )}

      <div className="mt-8 flex-1">
        {step === 0 && (
          <section>
            <h1 className="text-2xl font-black tracking-tight">I'm organizing a:</h1>
            <div className="mt-5 space-y-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTemplateId(t.id);
                    setConstraints({ ...t.defaults, days: [...t.defaults.days] });
                  }}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl border-2 p-4 text-left",
                    templateId === t.id ? "border-primary bg-primary/10" : "border-border bg-card",
                  )}
                >
                  <span className="text-2xl" aria-hidden>
                    {t.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold">{t.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.windowLabel}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {template && (
              <div className="mt-6 space-y-5 rounded-2xl border-2 border-border bg-card p-4">
                <div>
                  <p className="text-sm font-bold">Which days work?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {describeDays(constraints.days)}
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    {DAY_LABELS.map((label, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={constraints.days.includes(i)}
                        onClick={() => toggleDay(i)}
                        className={cn(
                          "h-11 flex-1 rounded-xl border-2 text-sm font-bold",
                          constraints.days.includes(i)
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {constraints.fullDay ? (
                  <p className="text-xs text-muted-foreground">
                    Full days — everyone needs all selected days free. Add Friday or Monday for a
                    long weekend.
                  </p>
                ) : (
                  <>
                    <div>
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-bold">How long?</p>
                        <p className="text-sm font-medium text-muted-foreground">
                          {formatDuration(constraints.durationMinutes)}
                        </p>
                      </div>
                      <Slider
                        min={0}
                        max={480}
                        step={30}
                        value={[constraints.durationMinutes ?? 0]}
                        onValueChange={([v]) => patch({ durationMinutes: !v ? null : v })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Slide all the way left for “any length”.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-bold">Time of day</p>
                        <p className="text-sm font-medium text-muted-foreground">
                          {formatHour(constraints.startAfter)} – {formatHour(constraints.endBy)}
                        </p>
                      </div>
                      <Slider
                        min={0}
                        max={24}
                        step={0.5}
                        minStepsBetweenThumbs={1}
                        value={[constraints.startAfter, constraints.endBy]}
                        onValueChange={([a, b]) => patch({ startAfter: a ?? 0, endBy: b ?? 24 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Starts after {formatHour(constraints.startAfter)} · ends by{" "}
                        {formatHour(constraints.endBy)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Name it</h1>
              <Input
                className="mt-4 h-14 text-base"
                placeholder="Session 12"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-sm font-bold">How often?</Label>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
                {(["one_off", "recurring"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "h-12 rounded-xl text-sm font-bold",
                      mode === m ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {m === "one_off" ? "One-time" : "Recurring"}
                  </button>
                ))}
              </div>
            </div>

            {mode === "recurring" && (
              <div>
                <Label className="text-sm font-bold">Cadence</Label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["weekly", "Weekly"],
                      ["biweekly", "Every 2 weeks"],
                      ["monthly", "Monthly"],
                      ["quarterly", "Quarterly"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCadence(value)}
                      className={cn(
                        "h-12 rounded-xl border-2 text-sm font-bold",
                        cadence === value ? "border-primary bg-primary/10" : "border-border",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="text-2xl font-black tracking-tight">When are we looking?</h1>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
              {(["rolling", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setWindowMode(m)}
                  className={cn(
                    "h-12 rounded-xl text-sm font-bold capitalize",
                    windowMode === m ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {windowMode === "rolling" ? (
              <div className="mt-5 space-y-2">
                {[2, 4, 6].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setRollingWeeks(w)}
                    className={cn(
                      "flex h-14 w-full items-center justify-between rounded-2xl border-2 px-4 text-base font-bold",
                      rollingWeeks === w ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    Next {w} weeks
                    <span className="text-xs font-medium text-muted-foreground">
                      auto-rolls from today
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-border p-2">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={range}
                  onSelect={setRange}
                  disabled={{ before: new Date() }}
                  className="pointer-events-auto w-full"
                />
                <p className="px-2 pb-2 text-xs text-muted-foreground">
                  Tap a start date, then an end date.
                </p>
              </div>
            )}

            {generation && (
              <p className="mt-3 text-xs text-muted-foreground">
                {generation.slots.length} time options
                {generation.widened
                  ? ` — spaced ${generation.stepHours}h apart to stay under the cap.`
                  : generation.truncated
                    ? ` — capped at ${MAX_SLOTS}.`
                    : ""}
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className="text-2xl font-black tracking-tight">Who's invited?</h1>

            {groups.length > 0 && (
              <div className="mt-4 space-y-2">
                <Label className="text-sm font-bold">Use a saved group</Label>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pickGroup(g.id)}
                    className={cn(
                      "flex h-12 w-full items-center rounded-xl border-2 px-4 text-sm font-bold",
                      groupId === g.id ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                className="h-12"
                placeholder="Add a name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPerson();
                  }
                }}
              />
              <Button type="button" onClick={addPerson} className="size-12 shrink-0 p-0">
                <Plus className="size-5" />
              </Button>
            </div>

            <ul className="mt-4 space-y-3">
              {people.map((p) => (
                <li key={p.key} className="rounded-2xl border border-border p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold">{p.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.timezone}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${p.display_name}`}
                      onClick={() => setPeople((list) => list.filter((x) => x.key !== p.key))}
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">Required</p>
                      <p className="text-xs text-muted-foreground">
                        If this person can't make it, the slot doesn't count.
                      </p>
                    </div>
                    <Switch
                      checked={p.is_required}
                      onCheckedChange={(c) =>
                        setPeople((list) =>
                          list.map((x) => (x.key === p.key ? { ...x, is_required: c } : x)),
                        )
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>

            {!groupId && people.length > 1 && (
              <div className="mt-5 rounded-2xl border border-border p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">Save these people as a group</p>
                    <p className="text-xs text-muted-foreground">
                      {session
                        ? "Reuse this crew for future plans and hand out co-organizer access."
                        : "Sign in first to keep this crew for next time."}
                    </p>
                  </div>
                  <Switch
                    checked={saveAsGroup}
                    disabled={!session}
                    onCheckedChange={(c) => {
                      setSaveAsGroup(c);
                      if (c && !saveGroupName)
                        setSaveGroupName(name.trim() ? `${name.trim()} crew` : "");
                    }}
                  />
                </div>
                {saveAsGroup && (
                  <Input
                    className="mt-3 h-12"
                    placeholder="Group name"
                    value={saveGroupName}
                    onChange={(e) => setSaveGroupName(e.target.value)}
                  />
                )}
              </div>
            )}
          </section>
        )}

        {step === 4 && (
          <section>
            <h1 className="text-2xl font-black tracking-tight">How many is enough?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We can go ahead with at least this many people.
            </p>
            <div className="mt-8 flex items-center justify-center gap-6">
              <button
                type="button"
                aria-label="Fewer people"
                onClick={() => {
                  setQuorumTouched(true);
                  setQuorum((q) => Math.max(1, q - 1));
                }}
                className="size-16 rounded-full bg-secondary text-2xl font-black"
              >
                −
              </button>
              <span className="min-w-16 text-center text-5xl font-black tabular-nums">
                {quorum}
              </span>
              <button
                type="button"
                aria-label="More people"
                onClick={() => {
                  setQuorumTouched(true);
                  setQuorum((q) => Math.min(people.length || 100, q + 1));
                }}
                className="size-16 rounded-full bg-secondary text-2xl font-black"
              >
                +
              </button>
            </div>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Required people always have to be there, on top of this number.
            </p>
          </section>
        )}

        {step === 5 && (
          <section>
            <h1 className="text-2xl font-black tracking-tight">Responses needed by</h1>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold">Set a deadline</p>
                <p className="text-xs text-muted-foreground">Optional, but it speeds people up.</p>
              </div>
              <Switch checked={hasDeadline} onCheckedChange={setHasDeadline} />
            </div>
            {hasDeadline && (
              <div className="mt-4 rounded-2xl border border-border p-2">
                <Calendar
                  mode="single"
                  numberOfMonths={1}
                  selected={deadline}
                  onSelect={(d) => d && setDeadline(d)}
                  disabled={{ before: new Date() }}
                  className="pointer-events-auto w-full"
                />
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              {generation?.slots.length ?? 0} time options will go out to {people.length} people.
            </p>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background px-5 pb-6 pt-4">
        <Button
          className="h-14 w-full text-base font-bold"
          disabled={!canAdvance || busy}
          onClick={() => (step === STEPS.length - 1 ? submit() : setStep(step + 1))}
        >
          {busy ? "Creating…" : step === STEPS.length - 1 ? "Create & get link" : "Continue"}
        </Button>
      </div>
    </main>
  );
}
