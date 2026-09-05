"use client";

import { useId, type KeyboardEventHandler } from "react";
import { typedConfirmationMatches } from "@/lib/lifecycle/typed-confirmation";

export function TypedConfirmField({
  confirmationName,
  value,
  onChange,
  onKeyDown,
  disabled = false,
}: {
  confirmationName: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
}) {
  const inputId = useId();
  const target = confirmationName.trim();
  const hasInput = value.length > 0;
  const matches = typedConfirmationMatches(value, target);

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm leading-5 text-text-muted">
        Digite <strong className="break-words font-semibold text-foreground">{target}</strong> para confirmar.
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={hasInput && !matches}
        aria-label={`Digite ${target} para confirmar`}
        className="min-h-10 w-full rounded-md border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-context-accent focus:ring-2 focus:ring-context-accent/25 disabled:cursor-wait disabled:opacity-60"
      />
      {hasInput && !matches ? <p className="text-sm leading-5 text-danger" role="status">O texto ainda não corresponde ao nome exato.</p> : null}
    </div>
  );
}
