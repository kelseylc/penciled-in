import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppBar } from "@/components/AppBar";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  getMyAvailability,
  saveMyAvailability,
  type MyAvailability,
} from "@/lib/availability.functions";
import {
  DAY_LABELS,
  DAY_ORDER,
  DEFAULT_RANGE,
  MAX_RANGES_PER_DAY,
  WEEKDAY_KEYS,
  WEEKEND_KEYS,
  formatRange,
  normalizeDay,
  toMinutes,
  type AvailabilityRange,
  type DayKey,
  type WeeklyPattern,
} from "@/lib/weekly-availability";

export const Route = createFileRoute("/availability")({
  head: () => ({
    meta: [
      { title: "Your usual availability — Penciled.in" },
      {
        name: "description",
        content:
          "Set the times you're usually free once and we'll pre-fill your answers on every future plan.",
      },
      { property: "og:title", content: "Your usual availability — Penciled.in" },
      {
        property: "og:description",
        content: "Set it once, and future plans come pre-filled.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AvailabilityRoute,
});

function AvailabilityRoute() {
  return (
    <RequireAuth>
      <AvailabilityPage />
    </RequireAuth>
  );
}

interface Editing {
  day: DayKey;
  index: number | null;
  start: string;
  end: string;
}

function AvailabilityPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(getMyAvailability);
  const save = useServerFn(saveMyAvailability);

  const [pattern, setPattern] = useState<WeeklyPattern>({});
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const query = useQuery<MyAvailability>({
    queryKey: ["my-availability"],
    queryFn: () => load({ data: undefined }),
  });

  useEffect(() => {
    if (!query.data || loaded) return;
    setPattern(query.data.weekly_pattern);
    setLoaded(true);
  }, [query.data, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { weekly_pattern: pattern } }),
    onSuccess: (result) => {
      qc.setQueryData(["my-availability"], result);
      setPattern(result.weekly_pattern);
      toast.success("Got it. We'll use this to save you some taps.");
      navigate({ to: "/home" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save that"),
  });

  function setDayRanges(day: DayKey, ranges: AvailabilityRange[]) {
    setPattern((current) => {
      const next = { ...current };
      if (ranges.length === 0) delete next[day];
      else next[day] = normalizeDay({ all_day: false, ranges });
      return next;
    });
  }

  function toggleAllDay(day: DayKey, on: boolean) {
    setPattern((current) => {
      const next = { ...current };
      if (on) next[day] = { all_day: true, ranges: [] };
      else delete next[day];
      return next;
    });
  }

  function openAdd(day: DayKey) {
    const existing = pattern[day]?.ranges ?? [];
    if (existing.length >= MAX_RANGES_PER_DAY) {
      toast.message("That's a lot of windows — try 'All day' instead?");
      return;
    }
    setRangeError(null);
    setEditing({ day, index: null, start: DEFAULT_RANGE.start, end: DEFAULT_RANGE.end });
  }

  function openEdit(day: DayKey, index: number) {
    const range = pattern[day]?.ranges[index];
    if (!range) return;
    setRangeError(null);
    setEditing({ day, index, start: range.start, end: range.end });
  }

  function commitRange() {
    if (!editing) return;
    if (toMinutes(editing.end) <= toMinutes(editing.start)) {
      setRangeError("End time should be after start time.");
      return;
    }
    const current = pattern[editing.day]?.ranges ?? [];
    const next = [...current];
    const range: AvailabilityRange = { start: editing.start, end: editing.end, state: "yes" };
    if (editing.index === null) next.push(range);
    else next[editing.index] = range;
    setDayRanges(editing.day, next);
    setEditing(null);
  }

  function copyTo(source: DayKey, targets: DayKey[]) {
    const day = pattern[source];
    if (!day) return;
    setPattern((current) => {
      const next = { ...current };
      for (const target of targets) {
        if (target === source) continue;
        next[target] = { all_day: day.all_day, ranges: day.ranges.map((r) => ({ ...r })) };
      }
      return next;
    });
    toast.success("Copied — you can still edit each day on its own.");
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-32">
      <AppBar title="Your usual availability" />

      <h1 className="mt-2 text-2xl font-black tracking-tight">When are you usually free?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Set this once and we'll pre-fill your answers on future plans. You can change it anytime, or
        override it for a specific week.
      </p>

      {query.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">One sec…</p>
      ) : (
        <div className="mt-6 space-y-3">
          {DAY_ORDER.map((day) => {
            const entry = pattern[day];
            const ranges = entry?.ranges ?? [];
            const allDay = entry?.all_day === true;
            return (
              <section key={day} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold">{DAY_LABELS[day]}</h2>
                  <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-muted-foreground">
                    All day
                    <Switch
                      checked={allDay}
                      onCheckedChange={(on) => toggleAllDay(day, on)}
                      aria-label={`${DAY_LABELS[day]} all day`}
                    />
                  </label>
                </div>

                {!allDay && (
                  <>
                    {ranges.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ranges.map((range, index) => (
                          <span
                            key={`${range.start}-${range.end}`}
                            className="flex items-center gap-1 rounded-full border border-border bg-secondary py-1 pl-3 pr-1 text-sm font-bold"
                          >
                            {formatRange(range)}
                            <button
                              type="button"
                              aria-label={`Edit ${DAY_LABELS[day]} ${formatRange(range)}`}
                              onClick={() => openEdit(day, index)}
                              className="grid size-8 place-items-center rounded-full text-muted-foreground"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${DAY_LABELS[day]} ${formatRange(range)}`}
                              onClick={() =>
                                setDayRanges(
                                  day,
                                  ranges.filter((_, i) => i !== index),
                                )
                              }
                              className="grid size-8 place-items-center rounded-full text-muted-foreground"
                            >
                              <X className="size-4" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => openAdd(day)}
                      className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-bold"
                    >
                      <Plus className="size-4" />{" "}
                      {ranges.length > 0 ? "Add another time" : "Add a time"}
                    </button>
                  </>
                )}

                {(allDay || ranges.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    <button
                      type="button"
                      onClick={() => copyTo(day, WEEKDAY_KEYS)}
                      className="min-h-11 text-xs font-bold text-primary"
                    >
                      Copy to weekdays
                    </button>
                    <button
                      type="button"
                      onClick={() => copyTo(day, WEEKEND_KEYS)}
                      className="min-h-11 text-xs font-bold text-primary"
                    >
                      Copy to weekends
                    </button>
                    <button
                      type="button"
                      onClick={() => copyTo(day, DAY_ORDER)}
                      className="min-h-11 text-xs font-bold text-primary"
                    >
                      Copy to all days
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background px-5 pb-6 pt-4">
        <Button
          className="h-14 w-full text-base font-bold"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving…" : "Save my usual availability"}
        </Button>
        <button
          type="button"
          onClick={() => navigate({ to: "/home" })}
          className="mt-2 min-h-11 w-full text-sm text-muted-foreground underline underline-offset-4"
        >
          Skip for now — you can always add this later from your account.
        </button>
      </div>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-md rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{editing ? DAY_LABELS[editing.day] : ""}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 px-4 pb-2">
            <div>
              <Label htmlFor="range-start" className="text-xs font-bold">
                Start
              </Label>
              <Input
                id="range-start"
                type="time"
                className="mt-1 h-12"
                value={editing?.start ?? DEFAULT_RANGE.start}
                onChange={(e) =>
                  setEditing((cur) => (cur ? { ...cur, start: e.target.value } : cur))
                }
              />
            </div>
            <div>
              <Label htmlFor="range-end" className="text-xs font-bold">
                End
              </Label>
              <Input
                id="range-end"
                type="time"
                className="mt-1 h-12"
                value={editing?.end ?? DEFAULT_RANGE.end}
                onChange={(e) => setEditing((cur) => (cur ? { ...cur, end: e.target.value } : cur))}
              />
            </div>
          </div>
          {rangeError && <p className="px-4 text-sm text-destructive">{rangeError}</p>}
          <div className="grid grid-cols-2 gap-3 p-4">
            <Button variant="secondary" className="h-12" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button className="h-12" onClick={commitRange}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
