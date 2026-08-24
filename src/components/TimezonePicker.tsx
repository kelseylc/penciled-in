import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { searchZones, zoneLabel } from "@/lib/timezones";

/** Searchable timezone chooser with city-style labels instead of raw IANA strings. */
export function TimezonePicker({
  open,
  onOpenChange,
  value,
  fallback,
  personName,
  onSelect,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  fallback: string;
  personName?: string | undefined;
  onSelect: (zone: string) => void;
  onClear?: (() => void) | undefined;
}) {
  const [query, setQuery] = useState("");
  const zones = useMemo(() => searchZones(query, fallback), [query, fallback]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{personName ? `Where is ${personName}?` : "Pick a timezone"}</DialogTitle>
          <DialogDescription>
            Only if you know. They can change it themselves when they respond.
          </DialogDescription>
        </DialogHeader>

        <Input
          className="h-12"
          autoFocus
          placeholder="Search a city — London, Denver, Tokyo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {zones.map((z) => (
            <li key={z}>
              <button
                type="button"
                onClick={() => {
                  onSelect(z);
                  onOpenChange(false);
                }}
                className={
                  "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold " +
                  (z === value ? "bg-primary/10 text-primary" : "hover:bg-secondary")
                }
              >
                {zoneLabel(z)}
              </button>
            </li>
          ))}
          {zones.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">No matching cities.</li>
          )}
        </ul>

        {value && onClear && (
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-muted-foreground underline underline-offset-4"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
          >
            Clear — let them set it
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
