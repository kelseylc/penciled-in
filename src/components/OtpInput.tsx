import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const LENGTH = 6;

type Props = {
  /** Fired once six digits are present. */
  onComplete: (code: string) => void;
  disabled?: boolean;
  /** Bump to clear the boxes (e.g. after a wrong code). */
  resetKey?: number;
};

/**
 * Six single-character boxes. iOS autofills the mailed code into the keyboard
 * suggestion bar via autocomplete="one-time-code" on the first input.
 */
export function OtpInput({ onComplete, disabled, resetKey = 0 }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const fired = useRef(false);

  useEffect(() => {
    setDigits(Array(LENGTH).fill(""));
    fired.current = false;
    refs.current[0]?.focus();
  }, [resetKey]);

  function commit(next: string[]) {
    setDigits(next);
    const code = next.join("");
    if (code.length === LENGTH && !next.includes("") && !fired.current) {
      fired.current = true;
      onComplete(code);
    }
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    // Handles paste / iOS autofill dumping the whole code into one box.
    const next = [...digits];
    let cursor = index;
    for (const ch of clean) {
      if (cursor >= LENGTH) break;
      next[cursor] = ch;
      cursor += 1;
    }
    commit(next);
    refs.current[Math.min(cursor, LENGTH - 1)]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < LENGTH - 1) refs.current[index + 1]?.focus();
  }

  return (
    <div className="flex justify-between gap-2">
      {digits.map((digit, i) => (
        <input
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={LENGTH}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          className={cn(
            "h-14 w-full min-w-11 rounded-xl border border-border bg-card text-center text-2xl font-black text-foreground",
            "outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
