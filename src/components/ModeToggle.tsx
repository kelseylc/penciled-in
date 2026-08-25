import { D20Icon } from "@/components/D20Icon";
import { copy, type AppMode } from "@/lib/mode";

/**
 * The d20 toggle. A rotating die is not self-evidently a control, so the die
 * is decoration on top of a real `role="switch"` with a visible text label,
 * a focus ring, and a sub-300ms animation that reduced-motion users don't get.
 */
export function ModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: AppMode;
  onChange: (next: AppMode) => void;
  className?: string;
}) {
  const campaign = mode === "campaign";

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={campaign}
        aria-label="Campaign mode"
        onClick={() => onChange(campaign ? "plans" : "campaign")}
        className="group flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-card px-2 pr-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          className={`flex size-9 items-center justify-center rounded-xl transition-colors motion-safe:duration-200 ${
            campaign ? "bg-campaign/15 text-campaign" : "bg-muted text-muted-foreground"
          }`}
        >
          <D20Icon
            filled={false}
            className={`size-6 transition-transform motion-safe:duration-[260ms] motion-safe:ease-out ${
              campaign ? "rotate-[144deg] scale-105" : "rotate-0"
            }`}
          />
        </span>
        <span className="text-sm font-bold">{copy(mode).modeLabel}</span>
      </button>
      <span className="text-xs text-muted-foreground">
        {campaign ? "Built for keeping a campaign alive" : "Ad-hoc plans with friends"}
      </span>
    </div>
  );
}
