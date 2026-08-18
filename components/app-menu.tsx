"use client";

/**
 * Compatibilidade temporária para cabeçalhos das planilhas antigas.
 * A navegação oficial agora pertence ao ProductShell lateral.
 */
export function AppMenu({ countLabel }: { active?: string; countLabel?: string }) {
  return countLabel ? <span data-topbar-secondary className="hidden shrink-0 text-[10px] font-semibold tabular-nums text-slate-600 xl:inline-flex">{countLabel}</span> : null;
}
