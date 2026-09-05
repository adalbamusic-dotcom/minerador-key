"use client";

import type { ArchitectRecoveryAudit, ArchitectRecoveryPlan } from "@/lib/editorial/architect-recovery";
import { architectRecoveryAuditText } from "@/lib/editorial/architect-recovery";

interface ArchitectRecoveryPanelProps {
  snapshotReady: boolean;
  snapshotCreatedAt: string | null;
  audit: ArchitectRecoveryAudit | null;
  plan: ArchitectRecoveryPlan | null;
  busy: boolean;
  error: string | null;
  onExportSnapshot: () => void;
  onAudit: () => void;
  onRecover: () => void;
}

export function ArchitectRecoveryPanel({
  snapshotReady,
  snapshotCreatedAt,
  audit,
  plan,
  busy,
  error,
  onExportSnapshot,
  onAudit,
  onRecover,
}: ArchitectRecoveryPanelProps) {
  return (
    <section className="border-b border-slate-800/70 bg-slate-900/55 px-3 py-1.5 text-sm text-slate-300">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Recuperação segura</span>
        <button onClick={onExportSnapshot} disabled={busy} className="inline-flex h-8 items-center rounded-md border border-emerald-700/60 bg-emerald-950/15 px-2.5 text-[13px] font-medium text-emerald-100 transition-colors hover:border-emerald-400 hover:bg-emerald-900/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 disabled:cursor-not-allowed disabled:opacity-40">
          Exportar snapshot do Arquiteto
        </button>
        <button onClick={onAudit} disabled={!snapshotReady || busy} className="inline-flex h-8 items-center rounded-md border border-cyan-700/60 bg-cyan-950/15 px-2.5 text-[13px] font-medium text-cyan-100 transition-colors hover:border-cyan-400 hover:bg-cyan-900/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-40">
          Auditar fontes
        </button>
        <button onClick={onRecover} disabled={!snapshotReady || !audit || !plan || busy} className="inline-flex h-8 items-center rounded-md border border-amber-700/60 bg-amber-950/15 px-2.5 text-[13px] font-medium text-amber-100 transition-colors hover:border-amber-400 hover:bg-amber-900/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-40">
          Aplicar recuperação segura
        </button>
        <span className={snapshotReady ? "text-xs text-emerald-200" : "text-xs text-slate-500"}>
          {busy ? "Processando leitura…" : snapshotReady ? `Ponto de recuperação validado${snapshotCreatedAt ? ` em ${new Date(snapshotCreatedAt).toLocaleTimeString("pt-BR")}` : ""}` : "Ponto de recuperação obrigatório antes da auditoria"}
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-rose-200">{error}</p>}
      {audit && (
        <details className="mt-2 rounded-md border border-slate-800/60 bg-slate-900/30 px-2 py-1.5" open>
          <summary className="cursor-pointer text-xs font-medium text-slate-200">Relatório de auditoria · {audit.counts.masterKeywords} keywords · {audit.counts.recoverableNewArticles} artigos novos recuperáveis</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-slate-400">{architectRecoveryAuditText(audit)}</pre>
          {plan && <p className="mt-2 text-xs leading-5 text-amber-200">A recuperação preservará {plan.preservedArticleVersionIds.length} definição(ões) de artigo, {plan.preservedSiloVersionIds.length} arquitetura(s) de silo e {plan.preservedSiloPageVersionIds.length} página(s) de silo, sem chamar IA.</p>}
        </details>
      )}
    </section>
  );
}
