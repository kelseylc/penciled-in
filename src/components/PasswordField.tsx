import { Eye, EyeOff } from "lucide-react";
import { useState, type RefObject } from "react";

import { FieldError } from "@/components/FieldError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  error?: string | undefined;
  inputRef?: RefObject<HTMLInputElement | null>;
};

/**
 * A password input you can actually check before submitting. Typing blind is
 * how a typo becomes a password-reset cycle, and a phone keyboard is where
 * caps lock does its worst damage unannounced.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  inputRef,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          ref={inputRef}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={
            [error ? errorId : null, capsLock ? capsId : null].filter(Boolean).join(" ") ||
            undefined
          }
          className="h-14 rounded-xl pr-14 text-base"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
          onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
          onBlur={() => setCapsLock(false)}
          placeholder={placeholder ?? "At least 8 characters"}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground"
        >
          {visible ? (
            <EyeOff className="size-5" aria-hidden />
          ) : (
            <Eye className="size-5" aria-hidden />
          )}
        </button>
      </div>
      {capsLock && (
        <p id={capsId} className="text-sm text-muted-foreground">
          Caps lock is on.
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
