"use client";

import React from "react";
import {
  SINGLETON_CLASSIFICATION_LABELS,
  type ArticleCandidate,
  type ArticleFormationUniverse,
  type SingletonAudit,
  type summarizeArticleFormation,
} from "@/lib/arquiteto/article-formation";

/**
 * Painel da fase Artigos.
 *
 * 2026-10-16 · mora em "Detalhes técnicos", logo abaixo da barra de sempre
 * (Processar artigos · Concluir formação · Melhorar publicados…), que é quem
 * age. Pedido do dono: "tem muita coisa que está demais para mostrar nesse
 * painel, pode reduzir os dados do banco de dados, mostra só o que é útil para
 * o user". Por isso o painel diz só o que leva a uma ação ou é alerta real: o
 * que falta fazer, a formação desatualizada (o botão que resolve está logo
 * acima), conflitos e pendências quando existem, a portaria da conclusão e o
 * artigo aberto com as decisões dele. As contagens internas (leitura do lote,
 * singletons, agrupamentos, distribuição, estado do cenário, acervo antigo)
 * saíram da tela; nenhum dado foi apagado.
 *
 * 2026-10-16 (noite) · pedido do dono, literal: "quero que desapareça esse
 * monte de texto no painel que só confunde". Saíram também "Formação
 * desatualizada…" (vira o destaque do botão "Reprocessar artigos"), "N
 * Assunto(s) aguardando sustentação", "N de M artigo(s) foram confrontados
 * com a SERP…" e "Formação concluída. N artigo(s)…"; as pendências são só o
 * contador no botão que as abre. Nenhuma função saiu.
 *
 * A pergunta que o painel responde é editorial, não técnica: estes candidatos
 * são mesmo conteúdos diferentes? Os números são pontuação editorial
 * explicável — não são score de SEO nem probabilidade de ranking.
 */

const RISK_TONES: Record<ArticleCandidate["cannibalizationRisk"], string> = {
  baixa: "text-success",
  média: "text-warning",
  alta: "text-danger",
};

const ROLE_LABELS: Record<ArticleCandidate["keywords"][number]["role"], string> = {
  principal: "P",
  secundaria: "S",
  reforco: "R",
};

const ROLE_TITLES: Record<ArticleCandidate["keywords"][number]["role"], string> = {
  principal: "Principal",
  secundaria: "Secundária",
  reforco: "Reforço",
};

/** Classificações que pedem olhar humano antes de confirmar. */
const SINGLETON_REVIEW: ReadonlySet<SingletonAudit["classification"]> = new Set(["POSSIBLE_MERGE", "PUBLISHED_OVERLAP"]);
/** D2/D3 — publicado e Assunto sozinhos são artigos completos, nunca "candidato independente". */
const SINGLETON_ANCHORS: ReadonlySet<SingletonAudit["classification"]> = new Set(["PUBLISHED_ANCHOR", "SUBJECT_TRUNK"]);

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 text-text-muted">{label}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded bg-surface">
        <span className="block h-full bg-module-accent/70" style={{ width: `${value}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function ArticleFormationPanel({
  universes,
  summary,
  processed,
  busy,
  selectedCandidate,
  selectedCandidateSerp = null,
  selectedSingletonAudit,
  keywordLabels,
  mergeTargets,
  waiting,
  crossSilo,
  parentBinding,
  conclusionGates,
  onChangePrincipal,
  onSplitKeyword,
  onMoveKeyword,
  onMergeCandidates,
}: {
  universes: readonly ArticleFormationUniverse[];
  summary: ReturnType<typeof summarizeArticleFormation>;
  processed: boolean;
  busy: boolean;
  selectedCandidate: ArticleCandidate | null;
  /**
   * D2.2 — o dilema de "mesmo assunto no Google" do artigo selecionado,
   * quando ele é publicado ou de Assunto. Aditivo: sem ele, nada muda.
   */
  selectedCandidateSerp?: React.ReactNode;
  /** Presente quando o candidato aberto tem uma keyword só. */
  selectedSingletonAudit: SingletonAudit | null;
  keywordLabels: ReadonlyMap<string, string>;
  /** Outros candidatos do MESMO Silo — juntar atravessa Silo nenhum. */
  mergeTargets: readonly { candidateRef: string; label: string }[];
  /** Keywords que ainda não pertencem à arquitetura de Article. */
  waiting: {
    awaitingConfirmation: number;
    withoutSilo: number;
    rows: readonly { keywordId: string; keyword: string; reason: string; siloName: string | null }[];
  };
  /** §1 — nenhum Article pode misturar Silos. */
  crossSilo: number;
  /** §21 — artigo cujo Silo não se resolve: conflito não move nada. */
  parentBinding: { conflict: number; unresolved: number };
  /*
   * 2026-10-16 (noite) · saíram `stale`, `confirmed` e `serpGate` (pedido do
   * dono: "esse monte de texto no painel que só confunde"). O gate SERP do lote
   * continua barrando "Concluir formação" na portaria (abaixo, quando barra); a
   * formação desatualizada é o destaque do botão "Reprocessar artigos".
   */
  /** §14 — resposta da portaria na última tentativa de concluir. */
  conclusionGates: readonly { code: string; ok: boolean; detail: string }[];
  onChangePrincipal: (candidateRef: string, keywordId: string) => void;
  onSplitKeyword: (candidateRef: string, keywordId: string) => void;
  onMoveKeyword: (keywordId: string, targetCandidateRef: string) => void;
  onMergeCandidates: (leftCandidateRef: string, rightCandidateRef: string) => void;
}) {
  const [mergeTarget, setMergeTarget] = React.useState("");
  const [waitingOpen, setWaitingOpen] = React.useState(false);

  // Formações que pedem olhar humano. Publicado NÃO entra: ele já existe e
  // não está esperando decisão nenhuma.
  const singletonsARevisar = universes
    .flatMap(universe => universe.singletonAudits)
    .filter(audit => SINGLETON_REVIEW.has(audit.classification)).length;
  const aRevisar = summary.needsReview + singletonsARevisar;
  const semSilo = waiting.awaitingConfirmation + waiting.withoutSilo;

  const nomeDaKeyword = (keywordId: string) => keywordLabels.get(keywordId) || "keyword";

  return (
    <section className="mt-3 rounded border border-divider bg-surface-subtle p-3" data-testid="architect-formation-panel">
      {/* 2026-10-16 (noite) · "Formação desatualizada" saiu daqui: é o próprio botão "Reprocessar artigos" (destacado, com o porquê no title), na barra. */}
      {!processed ? (
        <p className="text-sm leading-6 text-text-muted" data-testid="architect-formation-idle">
          {summary.silos
            ? "Processe os artigos: o Arquiteto lê o conjunto de cada Silo antes de propor qualquer artigo."
            : "Confirme a arquitetura na aba Silos para liberar a formação de artigos."}
        </p>
      ) : (
        <>
          {/* O que falta fazer — só o que existe. */}
          {/* 2026-10-16 (noite) · pedido do dono: sem "N Assunto(s) aguardando sustentação" (cada linha da tabela diz o estado dela). */}
          {(summary.publishedAwaitingSupport > 0 || aRevisar > 0) && (
            <ul className="space-y-0.5 text-sm leading-6 text-foreground" data-testid="architect-formation-todo">
              {summary.publishedAwaitingSupport > 0 && <li>{summary.publishedAwaitingSupport} publicado(s) aguardando reforço</li>}
              {aRevisar > 0 && <li className="text-warning">{aRevisar} formação(ões) precisa(m) de revisão</li>}
            </ul>
          )}
          {summary.overflowKeywords > 0 && (
            <p className="text-sm leading-6 text-warning" data-testid="architect-formation-overflow">
              {summary.overflowKeywords} busca(s) convergem além do teto de seis e esperam decisão editorial.
            </p>
          )}
          {summary.deferredKeywords > 0 && (
            <p className="text-sm leading-6 text-text-muted" data-testid="architect-formation-deferred">
              {summary.deferredKeywords} keyword(s) em Keywords não agrupadas por precedência ou pelo teto de seis, cada uma com o motivo.
            </p>
          )}

          {/* 2026-10-16 (noite) · pedido do dono: sem "N de M artigo(s) foram confrontados com a SERP…" — a portaria da conclusão (abaixo) diz o que barrou, quando barra. */}

          {/* §1: um Article que mistura Silos não tem pai. Isso é defeito, não preferência. */}
          {crossSilo > 0 && (
            <p className="mt-2 text-sm leading-6 text-danger" data-testid="architect-cross-silo-alert">
              {crossSilo} artigo(s) reúnem keywords de Silos diferentes e não pertencem a nenhuma SiloPage.
            </p>
          )}

          {/* §21: só o conflito de verdade; o vínculo inferido do legado é leitura interna. */}
          {(parentBinding.conflict > 0 || parentBinding.unresolved > 0) && (
            <p className="mt-2 text-sm leading-6 text-danger" data-testid="architect-parent-binding">
              Vínculo com o Silo:
              {parentBinding.conflict ? ` ${parentBinding.conflict} em conflito` : ""}
              {parentBinding.conflict && parentBinding.unresolved ? " ·" : ""}
              {parentBinding.unresolved ? ` ${parentBinding.unresolved} sem Silo resolvível` : ""}
            </p>
          )}

          {/*
            * As pendências não pertencem à arquitetura de Article: o detalhe fica sob demanda.
            * 2026-10-16 (noite) · pedido do dono: só o contador no botão que as abre, quando há (> 0) — nenhuma frase solta.
            */}
          {waiting.rows.length > 0 && (
            <div className="mt-2" data-testid="architect-waiting-summary">
              <button
                type="button"
                onClick={() => setWaitingOpen(valor => !valor)}
                aria-expanded={waitingOpen}
                data-testid="architect-waiting-toggle"
                title={semSilo > 0 ? `${waiting.awaitingConfirmation} aguardam a confirmação do Silo · ${waiting.withoutSilo} sem Silo` : undefined}
                className="min-h-8 text-sm text-text-muted transition-colors hover:text-foreground"
              >
                {`Pendências (${waiting.rows.length})`}
              </button>
              {waitingOpen && (
                <ul className="mt-1 space-y-0.5 text-sm leading-6 text-text-muted" data-testid="architect-waiting-details">
                  {waiting.rows.map(row => (
                    <li key={row.keywordId}>
                      <span className="text-keyword">{row.keyword}</span>
                      {row.siloName ? ` · ${row.siloName}` : ""} · {row.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedCandidate && (
            <div className="mt-3 rounded border border-divider bg-surface p-2" data-testid="architect-chart-candidate">
              <p className="text-sm font-semibold text-foreground">
                Candidato: {nomeDaKeyword(selectedCandidate.principalKeywordId)}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Principal sugerida: <span className="text-keyword">{nomeDaKeyword(selectedCandidate.principalKeywordId)}</span>
              </p>
              {selectedCandidateSerp && <div className="mt-2" data-testid="architect-candidate-serp-subject">{selectedCandidateSerp}</div>}

              <p className="mt-2 text-sm font-semibold text-text-muted">Keywords</p>
              <ul className="mt-0.5 space-y-0.5 text-sm leading-6" data-testid="architect-candidate-keywords">
                {selectedCandidate.keywords.map(item => (
                  <li key={item.keywordId} className="flex flex-wrap items-center gap-2 text-foreground">
                    <span className="inline-block w-4 font-semibold text-module-accent" title={ROLE_TITLES[item.role]}>
                      {ROLE_LABELS[item.role]}
                    </span>
                    <span className="min-w-0 flex-1 text-keyword">{nomeDaKeyword(item.keywordId)}</span>
                    {/* A proposta é do Arquiteto; a decisão é de quem revisa. */}
                    {item.role !== "principal" && (
                      <button
                        type="button"
                        disabled={busy}
                        data-testid="architect-candidate-make-principal"
                        onClick={() => onChangePrincipal(selectedCandidate.candidateRef, item.keywordId)}
                        className="shrink-0 rounded border border-divider px-2 py-0.5 text-sm text-text-muted transition-colors hover:border-module-accent/40 hover:text-foreground disabled:opacity-40"
                      >
                        Tornar principal
                      </button>
                    )}
                    {selectedCandidate.keywords.length > 1 && (
                      <button
                        type="button"
                        disabled={busy}
                        data-testid="architect-candidate-split"
                        onClick={() => onSplitKeyword(selectedCandidate.candidateRef, item.keywordId)}
                        className="shrink-0 rounded border border-divider px-2 py-0.5 text-sm text-text-muted transition-colors hover:border-warning/40 hover:text-foreground disabled:opacity-40"
                      >
                        Separar
                      </button>
                    )}
                    {/* Mover atravessa artigos do MESMO Silo — a lista já nasce
                        restrita, para que a tela nem ofereça o inválido. */}
                    {mergeTargets.length > 0 && (
                      <select
                        disabled={busy}
                        value=""
                        aria-label={`Mover ${nomeDaKeyword(item.keywordId)} para outro artigo`}
                        data-testid="architect-candidate-move"
                        onChange={event => {
                          if (event.target.value) onMoveKeyword(item.keywordId, event.target.value);
                        }}
                        className="min-h-7 shrink-0 rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-sm text-text-muted"
                      >
                        <option value="">Mover para…</option>
                        {mergeTargets.map(target => (
                          <option key={target.candidateRef} value={target.candidateRef}>{target.label}</option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
                {selectedCandidate.overflowKeywordIds.map(keywordId => (
                  <li key={keywordId} className="text-warning">
                    <span className="mr-1.5 inline-block w-4 font-semibold" title="Além do teto de seis">+</span>
                    {nomeDaKeyword(keywordId)}
                  </li>
                ))}
              </ul>

              {/* Juntar só dentro do mesmo Silo: dois assuntos de Silos
                  diferentes não viram um artigo por decisão de tela. */}
              {mergeTargets.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="architect-candidate-merge">
                  <label className="text-sm text-text-muted" htmlFor="architect-merge-target">Juntar com:</label>
                  <select
                    id="architect-merge-target"
                    value={mergeTarget}
                    onChange={event => setMergeTarget(event.target.value)}
                    className="min-h-8 min-w-0 flex-1 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm text-foreground"
                  >
                    <option value="">Selecione um artigo deste Silo</option>
                    {mergeTargets.map(target => (
                      <option key={target.candidateRef} value={target.candidateRef}>{target.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !mergeTarget}
                    data-testid="architect-candidate-merge-apply"
                    onClick={() => {
                      onMergeCandidates(selectedCandidate.candidateRef, mergeTarget);
                      setMergeTarget("");
                    }}
                    className="shrink-0 rounded border border-divider px-2 py-1 text-sm text-text-muted transition-colors hover:border-module-accent/40 hover:text-foreground disabled:opacity-40"
                  >
                    Juntar
                  </button>
                </div>
              )}

              <div className="mt-2 grid gap-1">
                <ScoreBar label="Coerência" value={selectedCandidate.scores.coherence.value} />
                <ScoreBar label="Intenção" value={selectedCandidate.scores.intent.value} />
                <ScoreBar label="Centralidade" value={selectedCandidate.scores.centrality.value} />
              </div>
              <p className={`mt-1 text-sm ${RISK_TONES[selectedCandidate.cannibalizationRisk]}`}>
                Sobreposição: {selectedCandidate.cannibalizationRisk}
              </p>

              {/* O gráfico nunca substitui a explicação. */}
              <p className="mt-2 text-sm font-semibold text-text-muted">Por quê?</p>
              {selectedSingletonAudit ? (
                <div data-testid="architect-candidate-singleton">
                  <p className="text-sm leading-6 text-foreground">
                    {SINGLETON_ANCHORS.has(selectedSingletonAudit.classification)
                      ? SINGLETON_CLASSIFICATION_LABELS[selectedSingletonAudit.classification]
                      : <>Mantido como candidato independente · {SINGLETON_CLASSIFICATION_LABELS[selectedSingletonAudit.classification]}</>}
                  </p>
                  <ul className="mt-0.5 space-y-0.5 text-sm leading-6 text-text-muted">
                    {selectedSingletonAudit.reasons.map(razao => <li key={razao}>✓ {razao}</li>)}
                  </ul>
                </div>
              ) : (
                <ul className="mt-0.5 space-y-0.5 text-sm leading-6 text-text-muted">
                  <li>✓ {selectedCandidate.reason}</li>
                  {[
                    ...selectedCandidate.scores.coherence.reasons,
                    ...selectedCandidate.scores.intent.reasons,
                    ...selectedCandidate.scores.centrality.reasons,
                  ].slice(0, 5).map(razao => <li key={razao}>✓ {razao}</li>)}
                </ul>
              )}
              {selectedCandidate.conflicts.map(conflito => (
                <p key={conflito} className="mt-1 text-sm leading-6 text-warning">△ {conflito}</p>
              ))}
            </div>
          )}

          {conclusionGates.length > 0 && (
            <div className="mt-3" data-testid="architect-conclusion-gates">
              <p className="text-sm font-semibold text-text-muted">Portaria da conclusão</p>
              <ul className="mt-1 space-y-0.5 text-sm leading-6">
                {conclusionGates.map(gate => (
                  <li key={gate.code} className={gate.ok ? "text-text-muted" : "text-warning"}>
                    <span className="mr-1.5 inline-block w-4 font-semibold">{gate.ok ? "✓" : "△"}</span>
                    {gate.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 2026-10-16 (noite) · pedido do dono: sem "Formação concluída. N artigo(s)…" — a coluna "Definição do artigo" de cada linha diz o que foi formado. */}
        </>
      )}
    </section>
  );
}
