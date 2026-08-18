"use client";

import { Eye, EyeOff } from "lucide-react";
import type { ChangeEventHandler, InputHTMLAttributes } from "react";
import { useId, useState } from "react";

type PasswordFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  label?: string;
  error?: string;
};

export function PasswordField({
  id,
  label,
  error,
  value,
  onChange,
  disabled,
  className = "",
  "aria-label": ariaLabel,
  ...inputProps
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id || "password-" + generatedId;
  const [visible, setVisible] = useState(false);
  const accessibleLabel = ariaLabel || label || "Senha";

  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          {...inputProps}
          {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={"min-h-10 w-full rounded-md border border-foreground/20 bg-background px-3 pr-10 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent " + className}
        />
        <button
          type="button"
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!ariaLabel && !label ? <span className="sr-only">{accessibleLabel}</span> : null}
    </div>
  );
}
