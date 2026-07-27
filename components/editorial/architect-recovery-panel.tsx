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
    <section className="border-b border-slate-900 bg-[#080a0e] px-3 py-2 text-[10px] text-slate-400">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold uppercase tracking-widest text-slate-600">Recuperação segura</span>
        <button onClick={onExportSnapshot} disabled={busy} className="rounded border border-emerald-900/70 px-2 py-1 font-semibold text-emerald-400 hover:border-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
          Exportar snapshot do Arquiteto
        </button>
        <button onClick={onAudit} disabled={!snapshotReady || busy} className="rounded border border-cyan-900/70 px-2 py-1 font-semibold text-cyan-400 hover:border-cyan-700 disabled:cursor-not-allowed disabled:opacity-40">
          Auditar fontes
        </button>
        <button onClick={onRecover} disabled={!snapshotReady || !audit || !plan || busy} className="rounded border border-amber-900/70 px-2 py-1 font-semibold text-amber-400 hover:border-amber-700 disabled:cursor-not-allowed disabled:opacity-40">
          Aplicar recuperação segura
        </button>
        <span className={snapshotReady ? "text-emerald-500" : "text-slate-600"}>
          {busy ? "Processando leitura…" : snapshotReady ? `Snapshot validado${snapshotCreatedAt ? ` em ${new Date(snapshotCreatedAt).toLocaleTimeString("pt-BR")}` : ""}` : "Snapshot obrigatório antes da auditoria"}
        </span>
      </div>
      {error && <p className="mt-1 text-rose-400">{error}</p>}
      {audit && (
        <details className="mt-2 rounded border border-slate-900 bg-black/20 px-2 py-1.5" open>
          <summary className="cursor-pointer font-semibold text-slate-300">Relatório de auditoria · {audit.counts.masterKeywords} keywords · {audit.counts.recoverableNewArticles} artigos novos recuperáveis</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[9px] leading-4 text-slate-500">{architectRecoveryAuditText(audit)}</pre>
          {plan && <p className="mt-2 text-[9px] text-amber-500">A recuperação preservará {plan.preservedArticleVersionIds.length} ArticleDNA(s), {plan.preservedSiloVersionIds.length} SiloDNA(s) e {plan.preservedSiloPageVersionIds.length} SiloPage(s), sem chamar IA.</p>}
        </details>
      )}
    </section>
  );
}
