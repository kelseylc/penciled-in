import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  confirmMyAvailability,
  getMyAvailability,
  type MyAvailability,
} from "@/lib/availability.functions";
import { DAY_LABELS, DAY_ORDER, formatRange } from "@/lib/weekly-availability";

/**
 * The monthly ritual. Confirming has to be one tap and editing has to be one
 * tap away — the second "still true?" costs more than ignoring it, standing
 * availability rots and quietly starts lying on everyone's behalf.
 */
export function AvailabilityRefreshCard() {
  const qc = useQueryClient();
  const load = useServerFn(getMyAvailability);
  const confirm = useServerFn(confirmMyAvailability);

  const query = useQuery<MyAvailability>({
    queryKey: ["my-availability"],
    queryFn: () => load({ data: undefined }),
  });

  const still = useMutation({
    mutationFn: () => confirm({ data: undefined }),
    onSuccess: (result) => {
      qc.setQueryData(["my-availability"], result);
      toast.success("Noted — we'll keep using it.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = query.data;
  if (!data || !data.needsRefresh) return null;

  const lines = DAY_ORDER.filter((day) => data.weekly_pattern[day]).map((day) => {
    const entry = data.weekly_pattern[day]!;
    return `${DAY_LABELS[day]}: ${
      entry.all_day ? "any time" : entry.ranges.map(formatRange).join(", ")
    }`;
  });

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-bold">Still true?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        You set this {data.ageDays} days ago
        {data.stale ? " — until you confirm, we won't count it toward quorum." : "."}
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {lines.length > 0 ? (
          lines.map((line) => <li key={line}>{line}</li>)
        ) : (
          <li className="text-muted-foreground">Nothing saved yet.</li>
        )}
      </ul>
      {data.blackout_dates.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Away on {data.blackout_dates.slice(0, 4).join(", ")}
          {data.blackout_dates.length > 4 ? "…" : ""}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          className="h-11 flex-1"
          disabled={still.isPending}
          onClick={() => still.mutate()}
        >
          Still good
        </Button>
        <Link
          to="/availability"
          className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold"
        >
          Something's changed
        </Link>
      </div>
    </div>
  );
}
