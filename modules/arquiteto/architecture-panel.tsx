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
  consolidation: {
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
            <p className="text-sm font-semibold text-text-muted">Cobertura do lote</p>
            <Bar label="Associadas a Silo" value={cobertura.associadas} total={totalKeywords} tone="bg-success/70" />
            <Bar label="Com destino sugerido" value={cobertura.sugeridas} total={totalKeywords} tone="bg-module-accent/70" />
            <Bar label="Ambíguas" value={cobertura.ambiguas} total={totalKeywords} tone="bg-warning/70" />
            <Bar label="Sem destino" value={cobertura.semDestino} total={totalKeywords} tone="bg-text-muted/50" />
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
