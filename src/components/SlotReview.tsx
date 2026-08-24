import { format, parseISO } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Plus, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GeneratedSlot } from "@/lib/slots";
import { cn } from "@/lib/utils";

interface Props {
  slots: GeneratedSlot[];
  timezone: string;
  /** Default length in minutes used when the organizer adds a time by hand. */
  durationMinutes: number;
  removed: string[];
  onRemovedChange: (next: string[]) => void;
  extra: GeneratedSlot[];
  onExtraChange: (next: GeneratedSlot[]) => void;
}

function localTime(iso: string, timezone: string) {
  return format(toZonedTime(parseISO(iso), timezone), "h:mma").toLowerCase();
}

export function SlotReview({
  slots,
  timezone,
  durationMinutes,
  removed,
  onRemovedChange,
  extra,
  onExtraChange,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("18:00");

  const removedSet = useMemo(() => new Set(removed), [removed]);

  const visible = useMemo(() => {
    const merged = [...slots.filter((s) => !removedSet.has(s.start_utc)), ...extra];
    return merged.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  }, [slots, extra, removedSet]);

  const byDay = useMemo(() => {
    const map = new Map<string, GeneratedSlot[]>();
    for (const slot of visible) {
      const key = format(toZonedTime(parseISO(slot.start_utc), timezone), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible, timezone]);

  function removeSlot(slot: GeneratedSlot) {
    if (extra.some((e) => e.start_utc === slot.start_utc && e.end_utc === slot.end_utc)) {
      onExtraChange(extra.filter((e) => e.start_utc !== slot.start_utc));
      return;
    }
    onRemovedChange([...removed, slot.start_utc]);
  }

  function removeDay(daySlots: GeneratedSlot[]) {
    const keys = new Set(daySlots.map((s) => s.start_utc));
    onExtraChange(extra.filter((e) => !keys.has(e.start_utc)));
    onRemovedChange([
      ...removed,
      ...slots.filter((s) => keys.has(s.start_utc)).map((s) => s.start_utc),
    ]);
  }

  function addSlot() {
    const start = fromZonedTime(`${day}T${time}:00`, timezone);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const start_utc = start.toISOString();
    if (visible.some((s) => s.start_utc === start_utc)) {
      setAdding(false);
      return;
    }
    onRemovedChange(removed.filter((r) => r !== start_utc));
    if (!slots.some((s) => s.start_utc === start_utc)) {
      onExtraChange([...extra, { start_utc, end_utc: end.toISOString() }]);
    }
    setAdding(false);
  }

  const edited = removed.length > 0 || extra.length > 0;

  return (
    <div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-sm font-bold">
          {visible.length} time {visible.length === 1 ? "option" : "options"}
        </p>
        {edited && (
          <button
            type="button"
            onClick={() => {
              onRemovedChange([]);
              onExtraChange([]);
            }}
            className="flex h-11 items-center gap-1.5 px-2 text-xs font-bold text-muted-foreground"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        )}
      </div>

      {adding ? (
        <div className="mt-2 rounded-2xl border-2 border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="slot-day" className="text-xs font-bold">
                Date
              </Label>
              <Input
                id="slot-day"
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 h-12"
              />
            </div>
            <div>
              <Label htmlFor="slot-time" className="text-xs font-bold">
                Start
              </Label>
              <Input
                id="slot-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 h-12"
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-11" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button className="h-11" onClick={addSlot}>
              Add time
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-sm font-bold"
        >
          <Plus className="size-4" /> Add a time
        </button>
      )}

      <div className="mt-4 space-y-4">
        {byDay.map(([dayKey, daySlots]) => (
          <div key={dayKey}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">
                {format(parseISO(`${dayKey}T00:00:00`), "EEE d MMM")}
              </p>
              <button
                type="button"
                onClick={() => removeDay(daySlots)}
                className="h-11 px-2 text-xs font-bold text-muted-foreground"
              >
                Remove day
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {daySlots.map((slot) => {
                const spanHours =
                  (parseISO(slot.end_utc).getTime() - parseISO(slot.start_utc).getTime()) / 3_600_000;
                const allDay = spanHours >= 20;
                const endDay = format(toZonedTime(parseISO(slot.end_utc), timezone), "EEE d MMM");
                const startDay = format(parseISO(`${dayKey}T00:00:00`), "EEE d MMM");
                return (
                <span
                  key={slot.start_utc}
                  className={cn(
                    "flex items-center gap-1 rounded-full border-2 border-border bg-secondary py-1 pl-3 pr-1 text-sm font-bold",
                  )}
                >
                  {allDay
                    ? startDay === endDay
                      ? "All day"
                      : `All day → ${endDay}`
                    : `${localTime(slot.start_utc, timezone)}–${localTime(slot.end_utc, timezone)}`}

                  <button
                    type="button"
                    aria-label={`Remove ${format(parseISO(`${dayKey}T00:00:00`), "EEE d MMM")} ${localTime(slot.start_utc, timezone)}`}
                    onClick={() => removeSlot(slot)}
                    className="grid size-8 place-items-center rounded-full text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </span>
                );
              })}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No times left — add one, or go back and widen the window.
          </p>
        )}
      </div>
    </div>
  );
}
