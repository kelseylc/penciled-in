import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format } from "date-fns";
import { AlertTriangle, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppBar } from "@/components/AppBar";
import { D20Icon } from "@/components/D20Icon";
import { RequireAuth } from "@/components/RequireAuth";
import { SlotReview } from "@/components/SlotReview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { createCampaign } from "@/lib/campaign.functions";
import { CADENCE_LABELS, describeTableRule, quorumForTableRule } from "@/lib/campaign";
import { TABLE_RULES, type TableRule } from "@/lib/mode";
import { generateCandidateSlots, type GeneratedSlot } from "@/lib/slots";
import { DAY_LABELS, DAY_NAMES, formatHour } from "@/lib/templates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/session-zero")({
  head: () => ({
    meta: [
      { title: "Session Zero — Party.up" },
      {
        name: "description",
        content:
          "Set your campaign's cadence, quorum, and table rules once. Then send the party one link.",
      },
      { property: "og:title", content: "Session Zero — Party.up" },
      {
        property: "og:description",
        content: "Set the cadence, the quorum, and the table rules once. Then send one link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <SessionZero />
    </RequireAuth>
  ),
});

type Cadence = "weekly" | "biweekly" | "monthly" | "adhoc";

interface PartyMember {
  key: string;
  name: string;
  role: "dm" | "player";
  required: boolean;
}

const STEPS = ["The campaign", "The party", "The cadence", "Table rules", "Review"];

/**
 * A slider you can actually read: current value called out, end values pinned,
 * and labelled ticks underneath so it's obvious what you're selecting.
 */
function TickSlider({
  caption,
  value,
  min,
  max,
  step,
  ticks,
  formatValue,
  onChange,
}: {
  caption: string;
  value: number;
  min: number;
  max: number;
  step: number;
  ticks: number[];
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{caption}</span>
        <span className="text-sm font-bold text-primary">{formatValue(value)}</span>
      </div>
      <Slider
        className="mt-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v ?? value)}
        aria-label={caption}
        aria-valuetext={formatValue(value)}
      />
      <div className="relative mt-1.5 h-8">
        {ticks.map((tick) => (
          <div
            key={tick}
            className={cn(
              "absolute top-0 flex flex-col",
              tick === min
                ? "items-start"
                : tick === max
                  ? "-translate-x-full items-end"
                  : "-translate-x-1/2 items-center",
            )}
            style={{ left: `${((tick - min) / (max - min)) * 100}%` }}
          >
            <span className="h-1.5 w-px bg-border" />
            <span className="mt-1 whitespace-nowrap text-[10px] text-muted-foreground">
              {formatValue(tick)}
            </span>
          </div>
        ))}

      </div>
    </div>
  );
}

function SessionZero() {
  const navigate = useNavigate();
  const run = useServerFn(createCampaign);
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [campaignName, setCampaignName] = useState("");
  const [system, setSystem] = useState("");

  const [dmName, setDmName] = useState("");
  const [party, setParty] = useState<PartyMember[]>([
    { key: "p1", name: "", role: "player", required: false },
    { key: "p2", name: "", role: "player", required: false },
    { key: "p3", name: "", role: "player", required: false },
  ]);

  const [cadence, setCadence] = useState<Cadence>("biweekly");
  const [days, setDays] = useState<number[]>([0, 6]);
  const [startAfter, setStartAfter] = useState(17);
  const [endBy, setEndBy] = useState(23);
  const [durationHours, setDurationHours] = useState(4);
  const [weeks, setWeeks] = useState(4);

  const [tableRule, setTableRule] = useState<TableRule>("play_anyway");
  const [autoLock, setAutoLock] = useState(true);

  const [removed, setRemoved] = useState<string[]>([]);
  const [extra, setExtra] = useState<GeneratedSlot[]>([]);

  const namedPlayers = party.filter((p) => p.name.trim().length > 0);
  const partySize = namedPlayers.length + 1;
  const quorum = quorumForTableRule(tableRule, partySize);

  const windowStart = format(new Date(), "yyyy-MM-dd");
  const windowEnd = format(addDays(new Date(), weeks * 7), "yyyy-MM-dd");

  const generated = useMemo(
    () =>
      generateCandidateSlots({
        constraints: {
          days,
          startAfter,
          endBy,
          durationMinutes: Math.round(durationHours * 60),
        },
        windowStart,
        windowEnd,
        timezone,
      }),
    [days, startAfter, endBy, durationHours, windowStart, windowEnd, timezone],
  );

  const finalSlots = useMemo(() => {
    const removedSet = new Set(removed);
    return [...generated.slots.filter((s) => !removedSet.has(s.start_utc)), ...extra].sort((a, b) =>
      a.start_utc.localeCompare(b.start_utc),
    );
  }, [generated.slots, removed, extra]);

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  const canAdvance = (() => {
    if (step === 0) return campaignName.trim().length > 0;
    if (step === 1) return dmName.trim().length > 0 && namedPlayers.length > 0;
    if (step === 2) return days.length > 0 && endBy - startAfter >= durationHours;
    return true;
  })();

  async function submit() {
    if (finalSlots.length === 0) {
      toast.error("There are no times left to send. Widen the window or add one back.");
      return;
    }
    setSaving(true);
    try {
      const result = await run({
        data: {
          campaign_name: campaignName.trim(),
          system: system.trim() || null,
          cadence,
          duration_minutes: Math.round(durationHours * 60),
          table_rule: tableRule,
          auto_lock_rescue: autoLock,
          quorum_min: quorum,
          window_start: windowStart,
          window_end: windowEnd,
          response_deadline: addDays(new Date(), 5).toISOString(),
          venue: null,
          vtt_link: null,
          party: [
            { display_name: dmName.trim(), timezone, role: "dm" as const, is_required: true },
            ...namedPlayers.map((p) => ({
              display_name: p.name.trim(),
              timezone: null,
              role: "player" as const,
              is_required: p.required,
            })),
          ],
          slots: finalSlots.slice(0, 200),
        },
      });
      await navigate({ to: "/share/$slug", params: { slug: result.slug } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the campaign");
      setSaving(false);
    }
  }

  return (
    <main className="campaign-scope mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-28 pt-2">
      <AppBar />

      <div className="flex items-center gap-2">
        <D20Icon filled={false} className="size-5 text-primary" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Session Zero</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>
      <div className="mt-3 flex gap-1" aria-hidden>
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {step === 0 && (
          <>
            <div>
              <h1 className="text-2xl font-black tracking-tight">What's the campaign called?</h1>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Curse of Strahd"
                autoFocus
                className="mt-3 h-14 text-base"
              />
            </div>
            <div>
              <Label htmlFor="system" className="text-sm font-semibold">
                What are you playing? <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="system"
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                placeholder="D&D 5e"
                className="mt-2 h-12"
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Who's at the table?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The DM is always required — no DM, no session.
              </p>
            </div>

            <div>
              <Label htmlFor="dm" className="text-sm font-semibold">
                You, the DM
              </Label>
              <Input
                id="dm"
                value={dmName}
                onChange={(e) => setDmName(e.target.value)}
                placeholder="Your name"
                className="mt-2 h-12"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Players</Label>
              {party.map((member, index) => (
                <div key={member.key} className="flex items-center gap-2">
                  <Input
                    value={member.name}
                    onChange={(e) =>
                      setParty((prev) =>
                        prev.map((p) =>
                          p.key === member.key ? { ...p, name: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder={`Player ${index + 1}`}
                    className="h-12"
                  />
                  <button
                    type="button"
                    aria-label={`Mark ${member.name || `player ${index + 1}`} as required`}
                    aria-pressed={member.required}
                    onClick={() =>
                      setParty((prev) =>
                        prev.map((p) =>
                          p.key === member.key ? { ...p, required: !p.required } : p,
                        ),
                      )
                    }
                    className={cn(
                      "flex h-12 shrink-0 items-center rounded-xl border px-3 text-xs font-bold",
                      member.required
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    Required
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove player ${index + 1}`}
                    onClick={() => setParty((prev) => prev.filter((p) => p.key !== member.key))}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full"
                onClick={() =>
                  setParty((prev) => [
                    ...prev,
                    { key: `p${Date.now()}`, name: "", role: "player", required: false },
                  ])
                }
              >
                <Plus className="mr-1 size-4" /> Add a player
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1 className="text-2xl font-black tracking-tight">How often do you play?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Lock this once. Individual sessions can move without touching it.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["weekly", "biweekly", "monthly", "adhoc"] as Cadence[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCadence(option)}
                  aria-pressed={cadence === option}
                  className={cn(
                    "min-h-14 rounded-2xl border px-2 text-sm font-semibold",
                    cadence === option
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border",
                  )}
                >
                  {CADENCE_LABELS[option]}
                </button>
              ))}
            </div>

            {cadence === "adhoc" && (
              <p className="rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
                One session only — no repeating cadence. You'll still pick times and lock a
                date with the party.
              </p>
            )}


            <div>
              <Label className="text-sm font-semibold">Which days could work?</Label>
              <div className="mt-2 flex gap-1.5">
                {DAY_LABELS.map((label, index) => (
                  <button
                    key={DAY_NAMES[index]}
                    type="button"
                    aria-label={DAY_NAMES[index]}
                    aria-pressed={days.includes(index)}
                    onClick={() => toggleDay(index)}
                    className={cn(
                      "size-11 flex-1 rounded-xl border text-sm font-bold",
                      days.includes(index)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">
                Between {formatHour(startAfter)} and {formatHour(endBy)}
              </Label>
              <div className="mt-3 space-y-6">
                <TickSlider
                  caption="Earliest start"
                  value={startAfter}
                  min={0}
                  max={23}
                  step={1}
                  ticks={[0, 6, 12, 18, 23]}
                  formatValue={formatHour}
                  onChange={(v) => setStartAfter(Math.min(v, endBy - 1))}
                />
                <TickSlider
                  caption="Done by"
                  value={endBy}
                  min={1}
                  max={24}
                  step={1}
                  ticks={[1, 6, 12, 18, 24]}
                  formatValue={formatHour}
                  onChange={(v) => setEndBy(Math.max(v, startAfter + 1))}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Session length</Label>
              <div className="mt-3">
                <TickSlider
                  caption="Session length"
                  value={durationHours}
                  min={1}
                  max={8}
                  step={0.5}
                  ticks={[1, 2, 4, 6, 8]}
                  formatValue={(v) => `${v} hr${v === 1 ? "" : "s"}`}
                  onChange={setDurationHours}
                />
              </div>
            </div>


            <div>
              <Label htmlFor="weeks" className="text-sm font-semibold">
                Look at the next
              </Label>
              <select
                id="weeks"
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="mt-2 h-12 w-full rounded-xl border border-border bg-card px-3 text-sm font-semibold"
              >
                {[2, 3, 4, 6, 8].map((w) => (
                  <option key={w} value={w}>
                    {w} weeks
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 className="text-2xl font-black tracking-tight">What are your table rules?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This decides when a session runs short and when it gets rescued.
              </p>
            </div>

            <div className="space-y-2">
              {TABLE_RULES.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  aria-pressed={tableRule === rule.id}
                  onClick={() => setTableRule(rule.id)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left",
                    tableRule === rule.id ? "border-primary bg-primary/10" : "border-border",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    {rule.label}
                    {rule.recommended && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{rule.blurb}</span>
                  {rule.warning && tableRule === rule.id && (
                    <span className="mt-2 flex items-start gap-2 text-xs font-semibold text-destructive">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {rule.warning}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
              {describeTableRule(tableRule, quorum, partySize)}
            </p>

            <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
              <div>
                <p className="text-sm font-bold">Auto-lock rescues</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If a session loses quorum, everyone gets a short poll of nearby times (same
                  days and hours, within a week of the original). The first time that clears
                  quorum — required players in, DM in — is locked automatically, and the whole
                  party gets an email plus a banner with the new date and who's in. Only that one
                  session moves; the {CADENCE_LABELS[cadence]!.toLowerCase()} cadence stays put.
                  Turn this off and the DM picks the winning time by hand.
                </p>

              </div>
              <Switch checked={autoLock} onCheckedChange={setAutoLock} aria-label="Auto-lock rescues" />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Send this to the party</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {finalSlots.length} times,{" "}
                {cadence === "adhoc"
                  ? "one-off session"
                  : `${CADENCE_LABELS[cadence]!.toLowerCase()} cadence`}
                ,{" "}
                {describeTableRule(tableRule, quorum, partySize).toLowerCase()}
              </p>
            </div>

            <SlotReview
              slots={generated.slots}
              timezone={timezone}
              durationMinutes={Math.round(durationHours * 60)}
              removed={removed}
              onRemovedChange={setRemoved}
              extra={extra}
              onExtraChange={setExtra}
            />
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
        <div className="campaign-scope flex gap-2">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-14 flex-1"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </Button>
          )}
          <Button
            type="button"
            className="h-14 flex-[2] text-base font-bold"
            disabled={!canAdvance || saving}
            onClick={() => (step === STEPS.length - 1 ? void submit() : setStep((s) => s + 1))}
          >
            {step === STEPS.length - 1
              ? saving
                ? "Starting…"
                : "Start the campaign"
              : "Continue"}
          </Button>
        </div>
      </div>
    </main>
  );
}
