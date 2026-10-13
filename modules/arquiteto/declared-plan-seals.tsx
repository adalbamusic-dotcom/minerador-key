import type { DeclaredPlanSeal } from "@/lib/arquiteto/declared-plan-seals";

/**
 * SELOS DO PLANO DECLARADO (SDD 2026-10-12 §9, item 6) — discretos, com texto
 * (≥ 14 px), borda do token neutro; a divergência usa o texto `warning`. A cor
 * nunca aparece sozinha e o selo nunca é botão: só informa (o título explica).
 */
export function DeclaredPlanSeals({ seals, className = "" }: { seals: readonly DeclaredPlanSeal[]; className?: string }) {
  if (!seals.length) return null;
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-1 ${className}`} data-declared-plan-seals>
      {seals.map(seal => (
        <span
          key={seal.kind}
          title={seal.title}
          data-declared-plan-seal={seal.kind}
          className={`inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-sm leading-tight ${seal.tone === "warning" ? "border-warning/40 text-warning" : "border-divider text-text-muted"}`}
        >
          <span className="min-w-0 break-words">{seal.label}</span>
          <span className="sr-only">. {seal.title}</span>
        </span>
      ))}
    </span>
  );
}
