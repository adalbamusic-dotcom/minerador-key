"use client";

import { AlertTriangle, CheckCircle2, Loader2, Search, Send } from "lucide-react";
import { internalButton, internalButtonPrimary } from "@/components/editorial/internal-page-visual";
import { subjectDiscoveryHasVolume } from "@/lib/minerador/subject-discovery-volume";
import { useSubjectSearchBatch } from "./use-subject-search-batch";
import { subjectImportResultText } from "./subject-search-client";
import {
  SUBJECT_SEARCH_BATCH_TEXTS,
  subjectSearchBatchButtonLabel,
  subjectSearchBatchConfirmLabel,
  subjectSearchBatchVisibleCandidates,
  type SubjectSearchBatchLine,
} from "./subject-search-batch-model";
import { subjectCandidateGoogleAdsVolume } from "./subject-search-model";

/**
 * "BUSCAR SUSTENTAÇÃO PARA OS N ARTIGOS" — o lote da Pesquisa por Assunto no
 * card "Cadastrar Assuntos", depois do "Cadastrar" (SDD
 * `sdd-acelerar-fluxo-do-plano-2026-10-13.md`, itens 7 e 8).
 *
 * Um plano somado (cota do Google Ads, US$ 0) → uma confirmação → as linhas,
 * uma por vez → uma tabela por artigo, com "Só com volume" marcado e nada
 * pré-selecionado → uma confirmação de envio ao Processador. O Volume que a
 * pesquisa mediu vai pelo recibo do servidor; a Lógica roda no servidor.
 */

const number = new Intl.NumberFormat("pt-BR");

export function SubjectSearchBatchPanel({ brandId, lines, onImported }: {
  brandId: string;
  lines: readonly SubjectSearchBatchLine[];
  onImported?: (keywordIds: string[]) => void;
}) {
  const batch = useSubjectSearchBatch({ brandId, lines, onImported });
  if (!lines.length) return null;
  const { phase, summary } = batch;
  const showResults = phase === "results" || phase === "importing" || phase === "imported";

  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-divider pt-4 text-sm leading-6" aria-label="Sustentação dos artigos cadastrados" data-subject-search-batch>
      <div>
        <h3 className="text-base font-semibold text-foreground">Sustentação dos artigos</h3>
        <p className="text-text-muted">{SUBJECT_SEARCH_BATCH_TEXTS.intro}</p>
      </div>

      {phase === "idle" ? (
        <div>
          <button type="button" onClick={() => void batch.requestPlans()} className={internalButtonPrimary} data-subject-search-batch-start>
            <Search className="h-4 w-4" aria-hidden="true" />
            {subjectSearchBatchButtonLabel(lines.length)}
          </button>
        </div>
      ) : null}

      {phase === "planning" ? (
        <p className="flex items-center gap-2 text-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Montando o plano das {lines.length} linha(s)… nada é consultado agora.</p>
      ) : null}

      {phase === "planned" ? (
        <div className="flex flex-col gap-3 rounded-md border border-divider px-3 py-3" role="region" aria-label={SUBJECT_SEARCH_BATCH_TEXTS.planTitle} data-subject-search-batch-plan>
          <p className="font-semibold text-foreground">{SUBJECT_SEARCH_BATCH_TEXTS.planTitle}</p>
          <p className="text-foreground">
            <strong>{SUBJECT_SEARCH_BATCH_TEXTS.planCost}</strong> · {summary.ready} pesquisa(s) · até {summary.adsCalls} consulta(s) ao Google Ads{summary.paidCalls > 0 ? ` · custo máximo US$ ${summary.maxCostUsd.toFixed(3)}` : ""}
          </p>
          <p className="text-text-muted">{SUBJECT_SEARCH_BATCH_TEXTS.planRule}</p>
          <div className="overflow-x-auto rounded-md border border-divider">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface text-text-muted">
                <tr>
                  <th scope="col" className="w-12 px-2 py-2 font-semibold">#</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Artigo</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Semente (keyword)</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Plano</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {batch.plans.map(item => (
                  <tr key={item.line.subjectKeywordId} className="align-top">
                    <td className="px-2 py-2 text-foreground">{item.line.order}</td>
                    <td className="px-2 py-2 text-foreground">{item.line.title || <span className="text-text-muted">sem título</span>}</td>
                    <td className="px-2 py-2"><span className="text-keyword">{item.seed || item.line.keyword || "—"}</span></td>
                    <td className="px-2 py-2">
                      {item.plan && !item.error
                        ? <span className="text-foreground">{item.plan.lines.map(line => line.label).join(" · ")}</span>
                        : <span className="text-danger">{item.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.refused > 0 ? <p className="text-warning">{summary.refused} linha(s) ficam de fora deste lote (motivo na tabela); as outras seguem.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={batch.cancelPlans} className={internalButton}>Cancelar</button>
            <button type="button" onClick={() => void batch.confirmExecute()} disabled={!summary.ready} className={internalButtonPrimary} data-subject-search-batch-confirm>
              {subjectSearchBatchConfirmLabel(summary.ready)}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "executing" ? (
        <p className="flex items-center gap-2 text-foreground" role="status" data-subject-search-batch-progress><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Pesquisando no Google Ads: {batch.progress.done} de {batch.progress.total} linha(s)…</p>
      ) : null}

      {showResults ? (
        <div className="flex flex-col gap-3" data-subject-search-batch-results>
          <p className="text-text-muted">{SUBJECT_SEARCH_BATCH_TEXTS.localNote}</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-9 items-center gap-2 rounded-md border border-divider bg-surface-subtle px-3 text-sm text-foreground" title={SUBJECT_SEARCH_BATCH_TEXTS.onlyWithVolumeHelp} data-subject-search-batch-only-volume>
              <input type="checkbox" checked={batch.onlyWithVolume} onChange={event => batch.setOnlyWithVolume(event.target.checked)} />
              {SUBJECT_SEARCH_BATCH_TEXTS.onlyWithVolume}
            </label>
            <button type="button" onClick={() => batch.markWithVolume(null)} disabled={batch.busy} className={internalButton} data-subject-search-batch-mark-all>Marcar todas as com volume (lote)</button>
            <button type="button" onClick={() => batch.clearSelection(null)} disabled={batch.busy} className={internalButton}>Desmarcar tudo</button>
          </div>

          {lines.map((line, index) => {
            const entry = batch.results[line.subjectKeywordId];
            const sent = batch.imports[line.subjectKeywordId];
            if (!entry) return null;
            const selected = batch.selection[line.subjectKeywordId] || new Set<string>();
            const visible = entry.result ? subjectSearchBatchVisibleCandidates(entry.result, batch.onlyWithVolume) : [];
            const withVolume = entry.result ? entry.result.candidates.filter(candidate => !candidate.isSubjectPhrase && subjectDiscoveryHasVolume(candidate)).length : 0;
            return (
              <details key={line.subjectKeywordId} open={index === 0} className="rounded-md border border-divider" data-subject-search-batch-line={line.subjectKeywordId}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 px-3 py-2 text-foreground">
                  <span className="font-semibold">{line.order}. {line.title || "sem título"}</span>
                  <span className="text-keyword">{entry.result?.subject.phrase || line.keyword}</span>
                  {entry.result ? <span className="text-text-muted">· {withVolume} com volume · {selected.size} marcada(s)</span> : <span className="text-danger">· {entry.error}</span>}
                  {sent?.ok ? <span className="text-success">· enviada</span> : null}
                </summary>
                {entry.result ? (
                  <div className="flex flex-col gap-2 border-t border-divider px-3 py-2">
                    {entry.result.receipt && entry.result.receipt.status !== "recorded" ? <p className="text-warning">{SUBJECT_SEARCH_BATCH_TEXTS.noReceipt}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => batch.markWithVolume(line.subjectKeywordId)} disabled={batch.busy || Boolean(sent?.ok)} className={internalButton}>Marcar as com volume</button>
                      <button type="button" onClick={() => batch.clearSelection(line.subjectKeywordId)} disabled={batch.busy || Boolean(sent?.ok)} className={internalButton}>Desmarcar</button>
                    </div>
                    <div className="max-h-80 overflow-auto rounded-md border border-divider">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="sticky top-0 bg-surface text-text-muted">
                          <tr>
                            <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Marcar</span></th>
                            <th scope="col" className="px-2 py-2 font-semibold">Keyword</th>
                            <th scope="col" className="w-40 px-2 py-2 font-semibold">Volume (Google Ads)</th>
                            <th scope="col" className="w-40 px-2 py-2 font-semibold">Situação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider">
                          {visible.map(candidate => {
                            const volume = subjectCandidateGoogleAdsVolume(candidate);
                            const checked = selected.has(candidate.normalizedKeyword);
                            return (
                              <tr key={candidate.normalizedKeyword} className={checked ? "bg-selected" : undefined}>
                                <td className="px-2 py-1">
                                  <input type="checkbox" aria-label={`Marcar ${candidate.keyword}`} checked={checked} disabled={batch.busy || Boolean(sent?.ok)} onChange={() => batch.toggle(line.subjectKeywordId, candidate.normalizedKeyword)} className="h-4 w-4" />
                                </td>
                                <td className="px-2 py-1 text-keyword">{candidate.keyword}</td>
                                <td className={`px-2 py-1 ${volume === null ? "text-text-muted" : "text-foreground"}`}>{volume === null ? "Sem média" : number.format(volume)}</td>
                                <td className="px-2 py-1 text-text-muted">{candidate.existingKeywordId ? "Já existe na marca" : "Nova"}</td>
                              </tr>
                            );
                          })}
                          {!visible.length ? <tr><td colSpan={4} className="px-2 py-2 text-text-muted">{batch.onlyWithVolume ? "Nenhuma candidata com volume para este artigo." : "O Google Ads não devolveu candidatas para este artigo."}</td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                    {sent ? (
                      <p className={sent.ok ? "text-success" : "text-danger"} role="status">
                        {sent.ok && sent.payload ? subjectImportResultText(sent.payload) : sent.error}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </details>
            );
          })}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground">{batch.importPlan.items} keyword(s) marcada(s) em {batch.importPlan.lines.length} artigo(s){batch.importPlan.items ? ` · ${batch.importPlan.withVolume} com volume` : ""}.</span>
            <button type="button" onClick={batch.openImportConfirm} disabled={batch.busy || !batch.importPlan.lines.length || batch.confirmingImport} className={internalButtonPrimary} data-subject-search-batch-send>
              <Send className="h-4 w-4" aria-hidden="true" />
              {SUBJECT_SEARCH_BATCH_TEXTS.sendTitle}
            </button>
          </div>

          {batch.confirmingImport ? (
            <div className="flex flex-col gap-2 rounded-md border border-module-accent/40 px-3 py-3" role="alertdialog" aria-label="Confirmar o envio ao Processador" data-subject-search-batch-send-confirm>
              <p className="font-semibold text-foreground">Confirmar: {batch.importPlan.items} keyword(s) de {batch.importPlan.lines.length} artigo(s) vão ao Processador.</p>
              <p className="text-foreground">{SUBJECT_SEARCH_BATCH_TEXTS.sendRule}</p>
              <ul className="list-disc space-y-1 pl-5 text-foreground">
                {batch.importPlan.lines.map(item => (
                  <li key={item.line.subjectKeywordId}>
                    {item.line.order}. {item.line.title || item.subjectPhrase}: {item.items.length} keyword(s), {item.withVolume} com volume{item.receiptRecorded ? "" : " — sem recibo: o Volume será medido no Processador"}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={batch.closeImportConfirm} disabled={phase === "importing"} className={internalButton}>Voltar</button>
                <button type="button" onClick={() => void batch.confirmImport()} disabled={phase === "importing"} className={internalButtonPrimary} data-subject-search-batch-send-apply>
                  {phase === "importing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Confirmar envio ao Processador
                </button>
              </div>
            </div>
          ) : null}

          {phase === "imported" ? (
            <p className={`flex items-center gap-2 ${Object.values(batch.imports).some(item => !item.ok) ? "text-warning" : "text-success"}`} role="status" data-subject-search-batch-imported>
              {Object.values(batch.imports).some(item => !item.ok) ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
              Envio concluído: {Object.values(batch.imports).filter(item => item.ok).length} artigo(s) enviado(s), {Object.values(batch.imports).filter(item => !item.ok).length} com falha (o resultado de cada um está no artigo). Depois, aprove e envie ao Arquiteto pela planilha.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
