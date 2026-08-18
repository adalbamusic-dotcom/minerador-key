"use client";

import { LogOut } from "lucide-react";
import { useSupabaseSession } from "./supabase-session-context";

type SessionLogoutButtonProps = {
  callbackUrl?: string;
  compact?: boolean;
  className?: string;
  label?: string;
};

export function SessionLogoutButton({ callbackUrl = "/login", compact = false, className = "", label = "Sair da conta" }: SessionLogoutButtonProps) {
  const { signOut } = useSupabaseSession();
  return <button type="button" aria-label={compact ? label : undefined} onClick={() => void signOut(callbackUrl)} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 ${className}`}>
    <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
    {!compact ? <span>{label}</span> : null}
  </button>;
}
