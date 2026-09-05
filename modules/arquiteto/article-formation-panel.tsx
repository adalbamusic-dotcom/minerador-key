"use client";

import React from "react";
import type { ArticleSiloView } from "@/lib/arquiteto/article-silo-view";
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
 * Mesmo padrão operacional da aba Silos: uma ação para entender o lote, outra
 * para confirmar o que foi revisado. Entre as duas, a leitura do que o
 * Arquiteto encontrou e por quê.
 *
 * A pergunta que o painel responde é editorial, não técnica: estes candidatos
 * são mesmo conteúdos diferentes? Por isso todo número vem com o motivo, e um
 * candidato de uma keyword só precisa dizer POR QUE ficou sozinho — "1
 * keyword" não é explicação.
 *
 * Os números são pontuação editorial explicável — não são score de SEO nem
 * probabilidade de ranking.
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

function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const ratio = total > 0 ? value / total : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-44 shrink-0 truncate text-text-muted">{label}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded bg-surface">
        <span className={`block h-full ${tone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums text-foreground">
        {value}{total > 0 ? `/${total}` : ""}
      </span>
    </div>
  );
}

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
  stale,
  scenarioState,
  busy,
  confirmed,
  selectedCandidate,
  selectedSingletonAudit,
  keywordLabels,
  mergeTargets,
  siloViews,
  selectedSiloRef,
  onSelectSilo,
  waiting,
  crossSilo,
  parentBinding,
  batch,
  serpGate,
  preSerpArtifacts,
  legacy,
  conclusionGates,
  onProcess,
  onConfirm,
  onChangePrincipal,
  onSplitKeyword,
  onMoveKeyword,
  onMergeCandidates,
}: {
  universes: readonly ArticleFormationUniverse[];
  summary: ReturnType<typeof summarizeArticleFormation>;
  processed: boolean;
  stale: boolean;
  /** Estágio do cenário em uma palavra: processada, parcial, confirmada… */
  scenarioState: string;
  busy: boolean;
  confirmed: { articles: number; keywords: number; pending: number } | null;
  selectedCandidate: ArticleCandidate | null;
  /** Presente quando o candidato aberto tem uma keyword só. */
  selectedSingletonAudit: SingletonAudit | null;
  keywordLabels: ReadonlyMap<string, string>;
  /** Outros candidatos do MESMO Silo — juntar atravessa Silo nenhum. */
  mergeTargets: readonly { candidateRef: string; label: string }[];
  /** Hierarquia por SiloPage — a leitura por Silo vive aqui. */
  siloViews: readonly ArticleSiloView[];
  /** Silo aberto; `null` mostra o resumo global. */
  selectedSiloRef: string | null;
  onSelectSilo: (siloRef: string | null) => void;
  /** Keywords que ainda não pertencem à arquitetura de Article. */
  waiting: {
    received: number;
    awaitingConfirmation: number;
    withoutSilo: number;
    rows: readonly { keywordId: string; keyword: string; reason: string; siloName: string | null }[];
  };
  /** §1 — nenhum Article pode misturar Silos. */
  crossSilo: number;
  /**
   * Como cada ArticleDNA conhece o próprio Silo.
   *
   * Declarado é contrato; inferido é legado legível; conflito não move nada.
   */
  parentBinding: { declared: number; legacy: number; conflict: number; unresolved: number };
  /** §13 — a leitura do lote corrente, com os nomes que a operação usa. */
  batch: {
    keywords: number;
    siloPages: number;
    /** Ainda cenário: nenhum ArticleDNA os descreve. */
    candidates: number;
    /** Já materializados — o remoto confirmou a composição. */
    articles: number;
    grouped: number;
    singletons: number;
    pendencias: number;
    conflitos: number;
    revisoesHumanas: number;
  };
  /**
   * §12 — o gate SERP do lote.
   *
   * A lógica propõe; o mercado verifica. Enquanto houver artigo sem
   * evidência vigente, "Concluir formação" não grava — e a mesa diz
   * exatamente quantos e por quê, em vez de deixar o botão falhar mudo.
   */
  serpGate: {
    total: number;
    /** Foram ao mercado — divergente e inconclusivo INCLUSOS. */
    analyzed: number;
    supported: number;
    divergent: number;
    divergentResolved: number;
    inconclusive: number;
    inconclusiveResolved: number;
    missing: number;
    stale: number;
    failed: number;
    /** Evidência existe; falta a decisão editorial da pessoa. */
    awaitingHuman: number;
    blocking: number;
  };
  /** ArticleDNA gravado antes do gate: homologação, não formação vigente. */
  preSerpArtifacts: number;
  /**
   * §1 — ArticleDNA de formações anteriores.
   *
   * Eles continuam no acervo canônico; ficam fora de grid, contagem, mapa,
   * seleção e formação. Contá-los aqui é o oposto de escondê-los: a mesa diz
   * quantos existem e por que não participam do cenário corrente.
   */
  legacy: { current: number; legacy: number; reasons: readonly { reason: string; count: number; label: string }[] };
  /** §14 — resposta da portaria na última tentativa de concluir. */
  conclusionGates: readonly { code: string; ok: boolean; detail: string }[];
  onProcess: () => void;
  onConfirm: () => void;
  onChangePrincipal: (candidateRef: string, keywordId: string) => void;
  onSplitKeyword: (candidateRef: string, keywordId: string) => void;
  onMoveKeyword: (keywordId: string, targetCandidateRef: string) => void;
  onMergeCandidates: (leftCandidateRef: string, rightCandidateRef: string) => void;
}) {
  const [mergeTarget, setMergeTarget] = React.useState("");
  const [waitingOpen, setWaitingOpen] = React.useState(false);
  const jaPublicadas = universes.reduce((total, universe) => total + universe.matchedToPublished.length, 0);
  const totalKeywords = summary.keywordsEmCandidatos + jaPublicadas + summary.freeKeywords;

  // Estado da formação. Publicado NÃO entra na mesma autoridade dos
  // candidatos: ele já existe e não está esperando decisão nenhuma.
  const singletonsARevisar = universes
    .flatMap(universe => universe.singletonAudits)
    .filter(audit => SINGLETON_REVIEW.has(audit.classification)).length;
  const comConflito = summary.needsReview;
  const prontos = Math.max(summary.candidates - comConflito - singletonsARevisar, 0);

  const nomeDaKeyword = (keywordId: string) => keywordLabels.get(keywordId) || "keyword";
  const siloAberto = selectedSiloRef
    ? siloViews.find(view => view.siloRef === selectedSiloRef) ?? null
    : null;

  return (
    <section className="mt-3 rounded border border-divider bg-surface-subtle p-3" data-testid="architect-formation-panel">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onProcess}
          disabled={busy}
          data-testid="architect-process-articles"
          className="inline-flex min-h-9 items-center gap-1.5 rounded border border-module-accent/50 bg-module-accent/10 px-3 text-sm font-semibold text-module-accent transition-colors hover:bg-module-accent/20 disabled:opacity-40"
        >
          {busy ? "Processando…" : processed ? "Reprocessar artigos" : "Processar artigos"}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || !processed}
          data-testid="architect-confirm-formation"
          title={processed ? "Concluir a formação revisada e materializar os ArticleDNA" : "Processe os artigos antes de concluir."}
          className="inline-flex min-h-9 items-center gap-1.5 rounded border border-positive-soft/45 px-3 text-sm font-semibold text-positive-soft transition-colors hover:bg-positive-soft/10 disabled:opacity-40"
        >
          Concluir formação
        </button>
        {stale && (
          <span className="text-sm text-warning" data-testid="architect-formation-stale">
            Formação desatualizada: o lote mudou desde a última análise.
          </span>
        )}
      </div>

      {!processed ? (
        <p className="mt-2 text-sm leading-6 text-text-muted" data-testid="architect-formation-idle">
          {summary.silos
            ? `${summary.silos} Silo(s) confirmado(s) com ${summary.keywords} keyword(s). Processe os artigos: o Arquiteto lê o conjunto de cada Silo antes de propor qualquer artigo.`
            : "Confirme a arquitetura na aba Silos para liberar a formação de artigos."}
        </p>
      ) : (
        <>
          <div className="mt-3">
            <p className="text-sm font-semibold uppercase tracking-wider text-module-accent">Análise dos artigos</p>
            <p className="mt-1 text-sm leading-6 text-foreground" data-testid="architect-formation-summary">
              {summary.keywords} keyword(s) analisada(s) · {summary.candidates} candidato(s)
            </p>
            <p className="text-sm leading-6 text-text-muted">
              {summary.singles} candidato(s) individual(is) · {summary.grouped} agrupamento(s)
            </p>
            <p className="text-sm leading-6 text-text-muted">
              {summary.publishedArticles} artigo(s) publicado(s) reconhecido(s) · {summary.possibleOverlaps} possível(is) sobreposição(ões) ·{" "}
              {comConflito + singletonsARevisar} formação(ões) precisa(m) de revisão
            </p>
            {summary.overflowKeywords > 0 && (
              <p className="text-sm leading-6 text-warning" data-testid="architect-formation-overflow">
                {summary.overflowKeywords} busca(s) convergem além do teto de seis e esperam decisão editorial.
              </p>
            )}
          </div>

          {/* §13 — a leitura do lote com os nomes que a operação usa. Nada
              aqui é fixo no código: todo número vem do cenário corrente. */}
          <div className="mt-3" data-testid="architect-batch-reading">
            <p className="text-sm font-semibold text-text-muted">Leitura do lote</p>
            <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
              {([
                ["Keywords analisadas", batch.keywords],
                ["SiloPages", batch.siloPages],
                ["Articles formados", batch.articles],
                ["Articles candidatos", batch.candidates],
                ["Agrupamentos", batch.grouped],
                ["Singletons", batch.singletons],
                ["Pendências", batch.pendencias],
                ["Conflitos", batch.conflitos],
                ["SERP analisada", serpGate.analyzed],
                ["SERP sustentada", serpGate.supported],
                ["SERP divergente", serpGate.divergent],
                ["SERP inconclusiva", serpGate.inconclusive],
                ["SERP a coletar", serpGate.missing + serpGate.stale + serpGate.failed],
                ["Aguardando decisão", serpGate.awaitingHuman],
                ["Revisões humanas", batch.revisoesHumanas],
              ] as const).map(([rotulo, valor]) => (
                <div key={rotulo} className="flex items-baseline justify-between gap-2">
                  <dt className="text-text-muted">{rotulo}</dt>
                  <dd className="tabular-nums text-foreground">{valor}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* O gate em uma frase: por que Concluir não está liberado. */}
          {serpGate.blocking > 0 && (
            <p className="mt-2 text-sm leading-6 text-warning" data-testid="architect-serp-gate-alert">
              {serpGate.analyzed} de {serpGate.total} artigo(s) foram confrontados com a SERP.{" "}
              {serpGate.awaitingHuman > 0 && (
                <>
                  {serpGate.awaitingHuman} precisa(m) de decisão humana:{" "}
                  {serpGate.divergent - serpGate.divergentResolved} divergente(s) e{" "}
                  {serpGate.inconclusive - serpGate.inconclusiveResolved} inconclusivo(s).{" "}
                </>
              )}
              {serpGate.missing + serpGate.stale + serpGate.failed > 0 && (
                <>{serpGate.missing + serpGate.stale + serpGate.failed} ainda precisa(m) de coleta.</>
              )}
            </p>
          )}

          {/* §0 — ArticleDNA gravado antes do gate não é formação vigente. */}
          {preSerpArtifacts > 0 && (
            <p className="mt-2 text-sm leading-6 text-text-muted" data-testid="architect-pre-serp-artifacts">
              {preSerpArtifacts} ArticleDNA foram gravados antes do gate SERP. Eles permanecem no acervo como
              homologação, não contam como prontos para aprovação e serão sucedidos quando a composição
              passar pela evidência.
            </p>
          )}

          {/* §1 — o acervo antigo é contado, nunca misturado ao cenário. */}
          {legacy.legacy > 0 && (
            <p className="mt-2 text-sm leading-6 text-text-muted" data-testid="architect-legacy-articles">
              {legacy.legacy} ArticleDNA de formações anteriores continuam no acervo e ficam fora deste cenário
              {legacy.reasons.length ? `: ${legacy.reasons.map(item => `${item.count} ${item.label}`).join(" · ")}` : ""}.
            </p>
          )}

          <div className="mt-3">
            <p className="mt-1 text-sm text-text-muted" data-testid="architect-formation-state">
              Estado: <span className="text-foreground">{scenarioState}</span>
            </p>
          </div>

          {/* §1: um Article que mistura Silos não tem pai. Isso é defeito, não
              preferência — e aparece antes de qualquer número bonito. */}
          {crossSilo > 0 && (
            <p className="mt-2 text-sm leading-6 text-danger" data-testid="architect-cross-silo-alert">
              {crossSilo} artigo(s) reúnem keywords de Silos diferentes e não pertencem a nenhuma SiloPage.
            </p>
          )}

          {/* §21: a mesa precisa dizer COMO cada artigo conhece o Silo dele.
              Inferir pelo consenso das keywords serve para ler o legado; não
              serve como contrato, porque o pai mudaria junto com elas. */}
          {(parentBinding.legacy > 0 || parentBinding.conflict > 0 || parentBinding.unresolved > 0) && (
            <p
              className={`mt-2 text-sm leading-6 ${parentBinding.conflict || parentBinding.unresolved ? "text-danger" : "text-text-muted"}`}
              data-testid="architect-parent-binding"
            >
              Vínculo com o Silo: {parentBinding.declared} declarado(s)
              {parentBinding.legacy ? ` · ${parentBinding.legacy} inferido(s) do consenso das keywords (legado)` : ""}
              {parentBinding.conflict ? ` · ${parentBinding.conflict} em conflito` : ""}
              {parentBinding.unresolved ? ` · ${parentBinding.unresolved} sem Silo resolvível` : ""}
            </p>
          )}

          {/* As pendências não pertencem à arquitetura de Article: elas são
              contadas aqui, com o detalhe sob demanda, em vez de ocupar a mesa
              como se já fossem conteúdo. */}
          <div className="mt-3" data-testid="architect-waiting-summary">
            <p className="text-sm leading-6 text-text-muted">
              {waiting.received} keyword(s) recebida(s) · {summary.keywords} participam da formação ·{" "}
              {waiting.awaitingConfirmation} aguardam confirmação do Silo · {waiting.withoutSilo} ainda não possuem Silo
            </p>
            {waiting.rows.length > 0 && (
              <button
                type="button"
                onClick={() => setWaitingOpen(valor => !valor)}
                data-testid="architect-waiting-toggle"
                className="mt-1 text-sm text-text-muted transition-colors hover:text-foreground"
              >
                {waitingOpen ? "Ocultar pendências" : `Ver ${waiting.rows.length} pendência(s)`}
              </button>
            )}
            {waitingOpen && (
              <ul className="mt-1 space-y-0.5 text-sm leading-6 text-text-muted" data-testid="architect-waiting-details">
                {waiting.rows.map(row => (
                  <li key={row.keywordId}>
                    <span className="text-foreground">{row.keyword}</span>
                    {row.siloName ? ` · ${row.siloName}` : ""} · {row.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* §9: 13 de 17 com uma keyword só não é formação validada — é
              fragmentação que ainda não foi explicada. Informativo, não trava. */}
          {summary.singles > 0 && summary.candidates > 0 && (
            <div className="mt-3" data-testid="architect-fragmentation-alert">
              <p className="text-sm leading-6 text-warning">
                {summary.singles} de {summary.candidates} candidato(s) têm apenas uma keyword. Ainda não há
                evidência suficiente para afirmar que representam {summary.singles} intenções únicas.
              </p>
              {/* O agrupamento já descontou o tema do pai — nome, entidade
                  central, intenção macro, fronteira e narrativa do Silo. O que
                  sobrou e continua separado são os modificadores; dizer isso
                  evita concluir que faltou contexto quando não faltou. */}
              <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="architect-fragmentation-explanation">
                O agrupamento já desconta o universo do Silo — entidade central, intenção macro,
                fronteira e narrativa. O que mantém estes candidatos separados são os modificadores
                de cada busca, não a falta de contexto do pai.
              </p>
            </div>
          )}

          {/* §20: fragmentação por Silo, visível de relance. */}
          <div className="mt-3 grid gap-1" data-testid="architect-chart-silo-distribution">
            <p className="text-sm font-semibold text-text-muted">Distribuição da formação</p>
            {siloViews.length === 0
              ? <p className="text-sm leading-6 text-text-muted">Nenhum Silo confirmado participa da formação.</p>
              : siloViews.map(view => (
                <Bar
                  key={view.siloRef}
                  label={view.siloLabel}
                  value={view.counts.articles + view.counts.candidates}
                  total={summary.candidates || 1}
                  tone="bg-module-accent/70"
                />
              ))}
          </div>

          {/* §8: a leitura por Silo, sem sair da mesma mesa. */}
          <div className="mt-3" data-testid="architect-silo-panel">
            <label className="flex flex-wrap items-center gap-2 text-sm text-text-muted" htmlFor="architect-panel-silo">
              Silo:
              <select
                id="architect-panel-silo"
                value={selectedSiloRef ?? ""}
                onChange={event => onSelectSilo(event.target.value || null)}
                className="min-h-8 min-w-0 flex-1 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm text-foreground"
              >
                <option value="">Todos os Silos</option>
                {siloViews.map(view => (
                  <option key={view.siloRef} value={view.siloRef}>{view.siloLabel}</option>
                ))}
              </select>
            </label>
            {siloAberto && (
              <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="architect-silo-panel-counts">
                Keywords: {siloAberto.counts.keywords} · Articles: {siloAberto.counts.articles} ·
                Candidatos: {siloAberto.counts.candidates} · Publicados: {siloAberto.counts.published} ·
                Singletons: {siloAberto.counts.singletons} · Agrupamentos: {siloAberto.counts.grouped} ·
                Possíveis sobreposições: {siloAberto.counts.possibleOverlaps}
              </p>
            )}
          </div>

          {/* Composição: revela fragmentação de relance. */}
          <div className="mt-3 grid gap-1" data-testid="architect-chart-composition">
            <p className="text-sm font-semibold text-text-muted">Composição dos candidatos</p>
            <Bar label="1 keyword" value={summary.composition.um} total={summary.candidates} tone="bg-text-muted/50" />
            <Bar label="2 keywords" value={summary.composition.dois} total={summary.candidates} tone="bg-module-accent/70" />
            <Bar label="3–6 keywords" value={summary.composition.tresASeis} total={summary.candidates} tone="bg-module-accent/70" />
          </div>

          {/* Estado. Publicado aparece à parte: é patrimônio, não candidato. */}
          <div className="mt-3 grid gap-1" data-testid="architect-chart-state">
            <p className="text-sm font-semibold text-text-muted">Estado da formação</p>
            <Bar label="Prontos" value={prontos} total={summary.candidates} tone="bg-success/70" />
            <Bar label="Revisar agrupamento" value={comConflito} total={summary.candidates} tone="bg-warning/70" />
            <Bar label="Possível sobreposição" value={singletonsARevisar} total={summary.candidates} tone="bg-warning/70" />
            <Bar label="Publicado/protegido" value={summary.publishedArticles} total={summary.publishedArticles} tone="bg-module-accent/40" />
          </div>

          {/* Destino de cada keyword do lote. */}
          <div className="mt-3 grid gap-1" data-testid="architect-chart-keyword-destination">
            <p className="text-sm font-semibold text-text-muted">Destino das keywords</p>
            <Bar label="Em artigo candidato" value={summary.keywordsEmCandidatos} total={totalKeywords} tone="bg-module-accent/70" />
            <Bar label="Já publicadas" value={jaPublicadas} total={totalKeywords} tone="bg-success/70" />
            <Bar label="Sem convergência" value={summary.freeKeywords} total={totalKeywords} tone="bg-text-muted/50" />
          </div>

          {selectedCandidate && (
            <div className="mt-3 rounded border border-divider bg-surface p-2" data-testid="architect-chart-candidate">
              <p className="text-sm font-semibold text-foreground">
                Candidato: {nomeDaKeyword(selectedCandidate.principalKeywordId)}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Principal sugerida: <span className="text-foreground">{nomeDaKeyword(selectedCandidate.principalKeywordId)}</span>
              </p>

              <p className="mt-2 text-sm font-semibold text-text-muted">Keywords</p>
              <ul className="mt-0.5 space-y-0.5 text-sm leading-6" data-testid="architect-candidate-keywords">
                {selectedCandidate.keywords.map(item => (
                  <li key={item.keywordId} className="flex flex-wrap items-center gap-2 text-foreground">
                    <span className="inline-block w-4 font-semibold text-module-accent" title={ROLE_TITLES[item.role]}>
                      {ROLE_LABELS[item.role]}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{nomeDaKeyword(item.keywordId)}</span>
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
                    Mantido como candidato independente · {SINGLETON_CLASSIFICATION_LABELS[selectedSingletonAudit.classification]}
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

          {confirmed && (
            <p
              className={`mt-3 text-sm leading-6 ${confirmed.pending ? "text-warning" : "text-positive-soft"}`}
              data-testid="architect-formation-confirmed"
            >
              {/* Com pendência, dizer "confirmada" seria contraditório. */}
              {confirmed.pending ? "Formação aplicada parcialmente." : "Formação concluída."}{" "}
              {confirmed.articles} artigo(s) confirmado(s) · {confirmed.keywords} keyword(s) cobertas
              {confirmed.pending ? ` · ${confirmed.pending} continuam pendentes e não foram alteradas` : ""}
            </p>
          )}
        </>
      )}
    </section>
  );
}
