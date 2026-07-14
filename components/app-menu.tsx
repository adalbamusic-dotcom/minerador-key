"use client";

/**
 * Compatibilidade temporária para cabeçalhos das planilhas antigas.
 * A navegação oficial agora pertence ao ProductShell lateral.
 */
export function AppMenu({ countLabel }: { active?: string; countLabel?: string }) {
  return countLabel ? <span className="text-[10px] font-semibold tabular-nums text-slate-600">{countLabel}</span> : null;
}
