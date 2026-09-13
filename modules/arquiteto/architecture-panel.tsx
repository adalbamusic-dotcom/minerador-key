"use client";

import React from "react";
import type { ArchitectureAnalysis, ClusterAnalysis, ExplainedScore } from "@/lib/arquiteto/architecture-analysis";

/**
 * Painel de arquitetura da aba Silos.
 *
 * Responde três perguntas, nessa ordem: o que o Arquiteto encontrou, por que
 * organizou assim, e o que falta confirmar. Os quatro motores — Lógica, SERP,
 * IA e Revisão — aparecem como LEITURA do que já rodou, não como etapas que a
 * pessoa precisa disparar uma a uma.
 *
 * Os números são pontuação arquitetural explicável. Não são score de SEO, nem
 * probabilidade de ranking: por isso todo gráfico vem acompanhado do motivo.
 */

const DESTINATION_LABELS: Record<ClusterAnalysis["destination"], string> = {
  strengthen_existing_silo: "Silos existentes",
  new_silo_candidate: "Novo Silo",
  insufficient_depth: "Sem profundidade",
  ambiguous: "Ambíguos",
};

const DESTINATION_TONES: Record<ClusterAnalysis["destination"], string> = {
  strengthen_existing_silo: "bg-success/70",
  new_silo_candidate: "bg-module-accent/70",
  insufficient_depth: "bg-text-muted/50",
  ambiguous: "bg-warning/70",
};

/** Barra proporcional com o valor ao lado — porcentagem sozinha esconde a base. */
function Bar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const ratio = total > 0 ? value / total : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-40 shrink-0 truncate text-text-muted">{label}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded bg-surface">
        <span className={`block h-full ${tone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums text-foreground">
        {value}{total > 0 ? `/${total}` : ""}
      </span>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: ExplainedScore }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 text-text-muted">{label}</span>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded bg-surface">
        <span className="block h-full bg-module-accent/70" style={{ width: `${score.value}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-foreground">{score.value}</span>
    </div>
  );
}

export type ArchitectureProcessChip = {
  label: string;
  detail: string;
  tone: "ok" | "warn" | "idle";
};

export function ArchitecturePanel({
  analysis,
  processed,
  stale,
  scenarioState,
  busy,
  confirmed,
  processChips,
  selectedCluster,
  consolidation,
  preflight,
  proposal,
  currentAssigned,
  pendingAssigned,
  restore,
  homologation,
  onProcess,
  onConfirm,
  onContinueToArticles,
}: {
  analysis: ArchitectureAnalysis;
  processed: boolean;
  stale: boolean;
  /** Estágio do cenário em uma palavra: processada, parcial, confirmada… */
  scenarioState: string;
  busy: boolean;
  /** Síntese da última confirmação, quando houver. */
  confirmed: { silos: number; keywords: number; pending: number } | null;
  processChips: ArchitectureProcessChip[];
  selectedCluster: ClusterAnalysis | null;
  /**
   * O QUE A CONFIRMAÇÃO VAI ENCONTRAR — antes do clique.
   *
   * A pessoa só descobria o bloqueio depois de confirmar e ver a recusa vir do
   * servidor. Cada linha diz, por Silo, o estado dos quatro fatos que a
   * portaria confere, e nomeia o impedimento quando existe.
   */
  preflight: readonly {
    siloId: string;
    label: string;
    siloDna: string;
    siloPage: string;
    canonical: string;
    publication: string;
    ready: boolean;
    blockers: readonly string[];
  }[];
  /**
   * RESTAURAR ≠ REPROCESSAR.
   *
   * Reprocessar é incremental: ele preserva a estrutura corrente, e por isso
   * reproduz um cenário contaminado em vez de consertá-lo. Restaurar tem outro
   * baseline — o ArticleDNA aprovado — e devolve as keywords ao território que
   * o artefato declara. Não edita artefato, não chama provider.
   */
  restore: {
    plan: {
      clean: boolean;
      summary: string;
      articlesAffected: number;
      keywordsToRestore: number;
      articles: readonly {
        articleId: string;
        label: string;
        alignedBefore: number;
        keywordCount: number;
        keywords: readonly {
          keywordId: string;
          label: string;
          currentTerritoryLabel: string | null;
          approvedTerritoryLabel: string | null;
        }[];
      }[];
    };
    previewOpen: boolean;
    busy: boolean;
    onRestore: () => void;
  };
  /**
   * REINICIAR HOMOLOGAÇÃO — `null` em produção.
   *
   * Terceira operação, distinta das outras duas: `Reprocessar` é incremental,
   * `Restaurar` conserta em direção ao aprovado, e esta RECOMEÇA a cópia de
   * trabalho da rodada. Nenhum artefato versionado é apagado.
   */
  /**
   * `null` nesta rodada — ver §3 do corte de reset.
   *
   * O reset da homologação virou operação administrativa explícita
   * (`npm run reset:arquiteto`), executada uma vez. A rota e o domínio
   * continuam existindo e testados; o que sai é o controle, para não competir
   * com Reprocessar e Restaurar no caminho básico.
   */
  homologation: {
    plan: {
      summary: string;
      totalCleared: number;
      totalPreserved: number;
      phrase: string;
      clearing: readonly { subjectType: string; count: number; reason: string }[];
      preserving: readonly { subjectType: string; count: number; reason: string }[];
    } | null;
    busy: boolean;
    onRestart: () => void;
  } | null;
  /**
   * A etapa seguinte do Silo, dentro do painel da fase.
   *
   * Formar a cópia de trabalho e consolidar viviam nos botões Lógica e
   * Revisão do seletor de processos. Quando a aba Silos trocou os quatro
   * motores por este painel, os dois únicos caminhos até SiloDNA e SiloPage
   * saíram do fluxo — e sem SiloPage canônica não existe `siloId`, que é
   * justamente o que Links Internos e Radar exigem para trabalhar.
   *
   * O Pilar continua sendo decisão humana: este bloco leva até a escolha,
   * não a substitui.
   */
  /**
   * §12 — os números do que o processamento PROPÔS.
   *
   * A linha da análise diz como o lote foi lido; esta diz o que vai
   * acontecer. Enquanto só existia a primeira, "2 sem profundidade" era
   * tudo que a pessoa via — e "sem profundidade" não conta o que foi
   * feito com aquelas keywords.
   */
  /** Quantas keywords JÁ têm membership gravada. Eixo separado da proposta. */
  currentAssigned?: number | null;
  /** Quantas decisões da proposta ainda DIFEREM do gravado. */
  pendingAssigned?: number | null;

  proposal?: {
    KEYWORDS_ANALYZED: number;
    RESOLVED_KEYWORDS: number;
    SILOS_REUSED: number;
    SILOS_PROPOSED: number;
    ASSIGNED: number;
    EXPLICIT_UNASSIGNED: number;
    BLOCKED: number;
  } | null;

  /**
   * `null` quando a fase está no caminho básico.
   *
   * Formar cópias e consolidar são passos que `Confirmar arquitetura` já
   * executa; oferecê-los ao lado dela dava três atos para a mesma coisa.
   */
  consolidation: null | {
    workingCopies: number;
    pillarsDecided: number;
    consolidated: number;
    canForm: boolean;
    formBlocker: string | null;
    canConsolidate: boolean;
    consolidateBlocker: string | null;
    onForm: () => void;
    onConsolidate: () => void;
  } | null;
  onProcess: () => void;
  onConfirm: () => void;
  onContinueToArticles: () => void;
}) {
  const [detalhes, setDetalhes] = React.useState(false);
  const { summary } = analysis;
  const totalClusters = summary.clusters;

  // Cobertura do lote: quantas keywords já têm destino e quantas não têm.
  const cobertura = analysis.clusters.reduce((acc, cluster) => {
    const membros = cluster.memberKeywordIds.length;
    if (cluster.destination === "strengthen_existing_silo") acc.associadas += membros;
    else if (cluster.destination === "new_silo_candidate") acc.sugeridas += membros;
    else if (cluster.destination === "ambiguous") acc.ambiguas += membros;
    else acc.semDestino += membros;
    return acc;
  }, { associadas: 0, sugeridas: 0, ambiguas: 0, semDestino: 0 });
  const totalKeywords = cobertura.associadas + cobertura.sugeridas + cobertura.ambiguas + cobertura.semDestino;

  return (
    <section className="mt-3 rounded border border-divider bg-surface-subtle p-3" data-testid="architect-architecture-panel">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onProcess}
          disabled={busy}
          data-testid="architect-process-architecture"
          className="inline-flex min-h-9 items-center gap-1.5 rounded border border-module-accent/50 bg-module-accent/10 px-3 text-sm font-semibold text-module-accent transition-colors hover:bg-module-accent/20 disabled:opacity-40"
        >
          {busy ? "Processando…" : processed ? "Reprocessar arquitetura" : "Processar arquitetura"}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || !processed}
          data-testid="architect-confirm-architecture"
          title={processed ? "Confirmar os silos prontos do cenário revisado" : "Processe a arquitetura antes de confirmar."}
          className="inline-flex min-h-9 items-center gap-1.5 rounded border border-positive-soft/45 px-3 text-sm font-semibold text-positive-soft transition-colors hover:bg-positive-soft/10 disabled:opacity-40"
        >
          Confirmar arquitetura
        </button>
        {confirmed && (
          <button
            type="button"
            onClick={onContinueToArticles}
            data-testid="architect-continue-to-articles"
            className="inline-flex min-h-9 items-center gap-1.5 rounded border border-divider px-3 text-sm font-medium text-foreground transition-colors hover:border-module-accent/40"
          >
            Continuar para Artigos
          </button>
        )}
        {stale && (
          <span className="text-sm text-warning" data-testid="architect-architecture-stale">
            Arquitetura desatualizada: o lote mudou desde a última análise.
          </span>
        )}
      </div>

      {homologation && (
        <div className="mt-3 rounded border border-danger/40 bg-danger-soft/40 p-3" data-testid="architect-homologation-fresh">
          <p className="text-sm font-semibold text-foreground">Reiniciar homologação</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Limpa a cópia de trabalho da rodada atual sem apagar o histórico aprovado. Diferente de
            Reprocessar, que é incremental, e de Restaurar, que devolve as keywords ao território do
            ArticleDNA aprovado.
          </p>

          {homologation.plan && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2" data-testid="architect-homologation-fresh-preview">
              <div>
                <p className="text-sm font-semibold text-warning">Será limpo ({homologation.plan.totalCleared})</p>
                <ul className="mt-1 space-y-0.5 text-sm leading-6 text-text-muted">
                  {homologation.plan.clearing.map(item => (
                    <li key={item.subjectType}>{item.count} × {item.subjectType} — {item.reason}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold text-positive-soft">Será preservado ({homologation.plan.totalPreserved})</p>
                <ul className="mt-1 space-y-0.5 text-sm leading-6 text-text-muted">
                  {homologation.plan.preserving.map(item => (
                    <li key={item.subjectType}>{item.count} × {item.subjectType} — {item.reason}</li>
                  ))}
                  <li>Artefatos versionados (ArticleDNA, SiloDNA, SiloPage, grafos) — nenhum é apagado.</li>
                </ul>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={busy || homologation.busy}
            data-testid="architect-homologation-fresh-action"
            onClick={homologation.onRestart}
            title="Limpa a working copy da rodada atual sem apagar o histórico aprovado."
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded border border-danger/50 px-3 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
          >
            {homologation.busy
              ? "Reiniciando…"
              : homologation.plan
                ? `Confirmar reinício (${homologation.plan.phrase})`
                : "Reiniciar homologação"}
          </button>
        </div>
      )}

      {!restore.plan.clean && (
        <div className="mt-3 rounded border border-warning/40 bg-warning/10 p-3" data-testid="architect-restore-working-copy">
          <p className="text-sm font-semibold text-foreground">A cópia de trabalho não representa os ArticleDNA aprovados</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {restore.plan.summary} Reprocessar não conserta isto: ele preserva a estrutura corrente.
            Restaurar devolve as keywords ao território que o artefato aprovado declara — sem editar
            ArticleDNA, sem criar sucessora e sem chamar provider.
          </p>
          <p className="mt-2 text-sm text-text-muted">
            ARTICLES_AFETADOS = {restore.plan.articlesAffected} · KEYWORDS_A_RESTAURAR = {restore.plan.keywordsToRestore}
          </p>

          {restore.previewOpen && (
            <ul className="mt-2 space-y-2" data-testid="architect-restore-preview">
              {restore.plan.articles.map(article => (
                <li key={article.articleId}>
                  <p className="text-sm font-medium text-foreground">
                    {article.label}{" "}
                    <span className="text-text-muted">
                      {article.alignedBefore}/{article.keywordCount} → {article.keywordCount}/{article.keywordCount}
                    </span>
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {article.keywords.map(keyword => (
                      <li key={keyword.keywordId} className="text-sm leading-6 text-text-muted">
                        {keyword.label}: {keyword.currentTerritoryLabel || "sem Silo"} → {keyword.approvedTerritoryLabel || "sem Silo"}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={busy || restore.busy}
            data-testid="architect-restore-action"
            onClick={restore.onRestore}
            title={restore.previewOpen
              ? "Aplica as atribuições acima de uma vez só; se alguma falhar, todas voltam."
              : "Primeiro clique mostra o que seria restaurado. Nada é gravado agora."}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded border border-warning/50 px-3 text-sm font-semibold text-warning transition-colors hover:bg-warning/10 disabled:opacity-40"
          >
            {restore.busy
              ? "Restaurando…"
              : restore.previewOpen
                ? `Restaurar ${restore.plan.keywordsToRestore} atribuição(ões)`
                : "Restaurar cópia de trabalho"}
          </button>
        </div>
      )}

      {preflight.length > 0 && (
        <div className="mt-3 rounded border border-divider bg-surface p-3" data-testid="architect-silopage-preflight">
          <p className="text-sm font-semibold text-foreground">O que a confirmação vai fechar</p>
          <p className="mt-0.5 text-sm leading-6 text-text-muted">
            Confirmar arquitetura fecha SiloDNA e SiloPage juntos. Aprovado não é publicado: uma página
            planejada pode ser aprovada com canonical planejado e continuar fora do ar.
          </p>
          <ul className="mt-2 space-y-2">
            {preflight.map(silo => (
              <li key={silo.siloId} className="rounded border border-divider/70 p-2" data-testid={`architect-silopage-preflight-${silo.siloId}`}>
                <p className="text-sm font-medium text-foreground">
                  {silo.label}
                  <span className={`ml-2 text-xs font-semibold ${silo.ready ? "text-positive-soft" : "text-warning"}`}>
                    {silo.ready ? "pronto para confirmar" : "SILO_PAGE_APPROVAL_READY = NO"}
                  </span>
                </p>
                <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm leading-6 text-text-muted sm:grid-cols-4">
                  <div><dt className="inline">SiloDNA: </dt><dd className="inline text-foreground">{silo.siloDna}</dd></div>
                  <div><dt className="inline">SiloPage: </dt><dd className="inline text-foreground">{silo.siloPage}</dd></div>
                  <div><dt className="inline">Canonical: </dt><dd className="inline text-foreground">{silo.canonical}</dd></div>
                  <div><dt className="inline">Publicação: </dt><dd className="inline text-foreground">{silo.publication}</dd></div>
                </dl>
                {silo.blockers.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-sm leading-6 text-warning">
                    {silo.blockers.map(motivo => <li key={motivo}>• {motivo}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!processed ? (
        <p className="mt-2 text-sm leading-6 text-text-muted">
          Importe as keywords e processe a arquitetura: o Arquiteto lê o lote inteiro antes de sugerir qualquer silo.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <p className="text-sm font-semibold uppercase tracking-wider text-module-accent">Análise da arquitetura</p>
            <p className="mt-1 text-sm leading-6 text-foreground" data-testid="architect-architecture-summary">
              {totalKeywords} keyword(s) analisada(s) · {totalClusters} grupo(s) narrativo(s)
            </p>
            <p className="text-sm leading-6 text-text-muted">
              {summary.strengthening} fortalece(m) Silos existentes · {summary.newSilos} novo(s) Silo(s) recomendado(s) ·{" "}
              {summary.insufficient} sem profundidade para Silo · {summary.ambiguous} precisa(m) de revisão
            </p>
            {proposal && (
              <p className="mt-1 text-sm leading-6 text-foreground" data-testid="architect-architecture-proposal">
                {proposal.SILOS_PROPOSED} Silo(s) a criar · {proposal.SILOS_REUSED} reutilizado(s) ·{" "}
                {proposal.ASSIGNED} keyword(s) atribuída(s) · {proposal.EXPLICIT_UNASSIGNED} sem Silo ·{" "}
                {proposal.BLOCKED} bloqueio(s)
              </p>
            )}
            <p className="mt-1 text-sm text-text-muted" data-testid="architect-scenario-state">
              Estado: <span className="text-foreground">{scenarioState}</span> · Confiança: <span className="text-foreground">{summary.confidence}</span>
            </p>
          </div>

          {consolidation && (
            <div className="mt-3 rounded border border-module-accent/35 bg-module-accent/5 p-3" data-testid="architect-silo-consolidation">
              <p className="text-sm font-semibold uppercase tracking-wider text-module-accent">Consolidação dos Silos</p>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {consolidation.workingCopies} cópia(s) de trabalho · {consolidation.pillarsDecided} com Pilar decidido · {consolidation.consolidated} consolidada(s).
              </p>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                O território confirmado ainda não é Silo canônico: SiloDNA e SiloPage nascem aqui, e é a SiloPage que dá o endereço que Links Internos e Radar exigem.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={consolidation.onForm}
                  disabled={busy || !consolidation.canForm}
                  data-testid="architect-form-silo-working-copy"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded border border-module-accent/50 bg-module-accent/10 px-3 text-sm font-semibold text-module-accent transition-colors hover:bg-module-accent/20 disabled:opacity-40"
                >
                  Formar cópias de trabalho
                </button>
                <button
                  type="button"
                  onClick={consolidation.onConsolidate}
                  disabled={busy || !consolidation.canConsolidate}
                  data-testid="architect-consolidate-silos"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded border border-positive-soft/45 px-3 text-sm font-semibold text-positive-soft transition-colors hover:bg-positive-soft/10 disabled:opacity-40"
                >
                  Consolidar Silos
                </button>
              </div>
              {/* Botão desabilitado sem motivo é beco sem saída: o que falta vem escrito. */}
              {!consolidation.canForm && consolidation.formBlocker && (
                <p className="mt-2 text-sm leading-6 text-text-muted" data-testid="architect-form-blocker">• {consolidation.formBlocker}</p>
              )}
              {!consolidation.canConsolidate && consolidation.consolidateBlocker && (
                <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="architect-consolidate-blocker">• {consolidation.consolidateBlocker}</p>
              )}
            </div>
          )}

          {/* Destino dos clusters */}
          <div className="mt-3 grid gap-1" data-testid="architect-chart-destinations">
            <p className="text-sm font-semibold text-text-muted">Destino dos grupos</p>
            {(Object.keys(DESTINATION_LABELS) as ClusterAnalysis["destination"][]).map(destino => (
              <Bar
                key={destino}
                label={DESTINATION_LABELS[destino]}
                value={analysis.clusters.filter(cluster => cluster.destination === destino).length}
                total={totalClusters}
                tone={DESTINATION_TONES[destino]}
              />
            ))}
          </div>

          {/* Cobertura do lote — sempre com a quantidade, nunca só o percentual. */}
          <div className="mt-3 grid gap-1" data-testid="architect-chart-coverage">
            {/*
              * §4 — DOIS EIXOS, NUNCA SOMADOS.
              *
              * A cobertura era montada com os DESTINOS DOS GRUPOS: um grupo
              * "sem profundidade" contava como "sem destino" mesmo depois de a
              * proposta ter dado destino às suas keywords. A tela dizia
              * "9 atribuídas" e "6 sem destino" ao mesmo tempo.
              *
              * ATUAL é o que está gravado. PROPOSTA é o que Confirmar vai
              * materializar.
              */}
            <p className="text-sm font-semibold text-text-muted">Atual · já gravado</p>
            <Bar label="Associadas a Silo" value={currentAssigned ?? 0} total={proposal?.KEYWORDS_ANALYZED || totalKeywords} tone="bg-text-muted/50" />
            {/*
              * §2/§3 — proposta materializada não é pendência.
              *
              * A proposta é derivada, então continua sendo calculada depois da
              * confirmação. Enquanto o rótulo dizia "aguardando", a tela
              * mostrava "Atual 9/9" e "Proposta 9/9 aguardando" ao mesmo
              * tempo — e a pessoa não sabia se faltava clicar de novo.
              */}
            <p className="mt-2 text-sm font-semibold text-module-accent">
              {(pendingAssigned ?? 0) > 0 ? "Proposta · aguardando confirmação" : "Proposta · aplicada"}
            </p>
            <Bar
              label={(pendingAssigned ?? 0) > 0 ? "Com destino proposto" : "Última proposta aplicada"}
              value={proposal?.ASSIGNED ?? cobertura.associadas}
              total={proposal?.KEYWORDS_ANALYZED || totalKeywords}
              tone={(pendingAssigned ?? 0) > 0 ? "bg-module-accent/70" : "bg-success/70"}
            />
            <Bar label="Sem destino, com motivo" value={proposal?.EXPLICIT_UNASSIGNED ?? cobertura.semDestino} total={proposal?.KEYWORDS_ANALYZED || totalKeywords} tone="bg-warning/70" />
            <Bar label="Bloqueadas" value={proposal?.BLOCKED ?? cobertura.ambiguas} total={proposal?.KEYWORDS_ANALYZED || totalKeywords} tone="bg-danger/70" />
          </div>

          {selectedCluster && (
            <div className="mt-3 rounded border border-divider bg-surface p-2" data-testid="architect-chart-cluster">
              <p className="text-sm font-semibold text-foreground">Grupo: {selectedCluster.label}</p>
              <div className="mt-1 grid gap-1">
                <ScoreBar label="Coerência" score={selectedCluster.scores.coherence} />
                <ScoreBar label="Aderência" score={selectedCluster.scores.siloFit} />
                <ScoreBar label="Profundidade" score={selectedCluster.scores.depth} />
              </div>
              {/* O gráfico nunca substitui a explicação. */}
              <p className="mt-2 text-sm font-semibold text-text-muted">Por quê?</p>
              <ul className="mt-0.5 space-y-0.5 text-sm leading-6 text-text-muted">
                {[...selectedCluster.scores.coherence.reasons, ...selectedCluster.scores.siloFit.reasons, ...selectedCluster.scores.depth.reasons]
                  .slice(0, 6)
                  .map(razao => <li key={razao}>{razao.startsWith("atenção") ? "△" : "✓"} {razao}</li>)}
              </ul>
            </div>
          )}

          {analysis.narrative.length > 0 && (
            <div className="mt-3" data-testid="architect-architecture-narrative">
              <p className="text-sm font-semibold text-text-muted">Por que esta arquitetura?</p>
              <ul className="mt-0.5 space-y-0.5 text-sm leading-6 text-text-muted">
                {analysis.narrative.map(linha => <li key={linha}>• {linha}</li>)}
              </ul>
            </div>
          )}

          {confirmed && (
            <p
              className={`mt-3 text-sm leading-6 ${confirmed.pending ? "text-warning" : "text-positive-soft"}`}
              data-testid="architect-architecture-confirmed"
            >
              {/* Com pendência, dizer "confirmada" seria contraditório: parte do
                  cenário continua intocada. */}
              {confirmed.pending ? "Arquitetura aplicada parcialmente." : "Arquitetura confirmada."}{" "}
              {confirmed.keywords} associação(ões) confirmada(s)
              {confirmed.silos ? ` · ${confirmed.silos} Silo(s) confirmado(s)` : ""}
              {confirmed.pending ? ` · ${confirmed.pending} Silo(s) continuam pendentes e não foram alterados` : ""}
            </p>
          )}
        </>
      )}

      {/* Os motores continuam auditáveis — como leitura, não como jornada. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setDetalhes(valor => !valor)}
          data-testid="architect-process-details-toggle"
          className="text-sm text-text-muted transition-colors hover:text-foreground"
        >
          {detalhes ? "Ocultar detalhes do processamento" : "Ver detalhes do processamento"}
        </button>
        {detalhes && (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1" data-testid="architect-process-chips">
            {processChips.map(chip => (
              <span
                key={chip.label}
                className={`text-sm ${chip.tone === "ok" ? "text-success" : chip.tone === "warn" ? "text-warning" : "text-text-muted"}`}
              >
                {chip.label} {chip.tone === "ok" ? "✓" : chip.tone === "warn" ? "⚠" : "—"} {chip.detail}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
