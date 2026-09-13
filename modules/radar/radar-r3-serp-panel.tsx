"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ExternalLink, History, RefreshCw, XCircle } from "lucide-react";
import type { RadarR3Model } from "@/lib/radar/r3-workbench";
import { buildRadarSerpProcessTabs, nextSerpStep, type RadarSerpProcessTab } from "@/lib/radar/serp-process-navigation";
import { buildRadarSerpCurationSummary, buildRadarSerpSelectionProjection, radarAnalysisCandidates, radarOrganicDecisionKey, radarOrganicRenderKey, type RadarSerpSelectionScope } from "@/lib/radar/serp-curation";
import type { RadarR4SerpQueueState } from "@/lib/radar/r4-queue";
import { radarModelMeasureLabel, radarModelPresenceLabel, type RadarCompetitiveModel, type RadarModelMeasure, type RadarModelPresence } from "@/lib/radar/competitive-model";
import { buildRadarSerpSynthesis } from "@/lib/radar/serp-synthesis";
import { buildRadarAnalysisMembership, radarMembershipLabel } from "@/lib/radar/analysis-membership";
import { buildRadarCurrentStateChain } from "@/lib/radar/current-state-chain";
import { isComparableRadarExtraction } from "@/lib/radar/analysis-insights";
import { resolveRadarInvestigationSufficiency, radarSufficiencyLabel } from "@/lib/radar/investigation-sufficiency";
import type { RadarArticleResearchContext } from "@/lib/radar/article-research-context";
import { radarDeclaredCommercialSignal } from "@/lib/radar/foundation-profiles";
import { radarSerpTabAction, type RadarSerpTabAction } from "@/lib/radar/investigation-state";
import type { RadarDeepResearchView } from "@/lib/radar/deep-research-view";
import { radarResearchDecisionLabel, type RadarResearchDecision } from "@/lib/radar/research-curation";
import { radarReferenceAppearanceSummary, radarReferenceOrigin, radarReferenceOriginLabel } from "@/lib/radar/research-reference";
import { radarCompetitorClassLabel } from "@/lib/radar/competitor-universe";

// Seleção de concorrentes e referências permanece restrita à subaba Concorrentes.
// Revisão e aprovação da SERP permanece restrita à subaba Revisão.
type SerpCurationRole = "primary" | "support" | "format" | "excluded" | "pending";
type Props = {
  model: RadarR3Model["serp"]; scope: RadarSerpSelectionScope; refreshing: boolean; onRefresh: () => void;
  onFocusAdjacent?: (direction: "previous" | "next") => void; pendingReviewCount?: number; reviewing?: boolean;
  onReview?: (status: "approved" | "rejected") => void; queueState?: RadarR4SerpQueueState | null;
  action?: "start" | "decision" | "extract" | null; onStartAnalysis?: () => void;
  /** A confirmação da curadoria inteira. Não existe write por clique. */
  onConfirmCuration?: (changes: Array<{ key: string; role: SerpCurationRole; reason?: string }>) => void;
  onAnalyzeSelected?: () => void;
  approvalBlockedReason?: string | null; reviewRemoteConfirmed?: boolean;
  /**
   * A investigação já foi congelada?
   *
   * Um bundle congelado não pode coexistir com "Analisar páginas pendentes":
   * a leitura viva ainda calcula pendências, mas elas descrevem uma rodada que
   * o USER encerrou. Congelado, este painel vira leitura — sem ação.
   */
  finalized?: boolean;
  /** O dispatcher canônico da página. A aba escolhe QUANDO; ele decide o QUE. */
  onInvestigationAction?: (id: string) => void;
  /** O contexto estratégico resolvido do artigo. Alimenta o modelo competitivo. */
  researchContext?: RadarArticleResearchContext;
  /** A investigação profunda já resolvida — a aba lê a mesma suficiência. */
  deepResearch?: RadarDeepResearchView;
  /** Marcação local de uma referência da pesquisa. Rascunho, não escrita. */
  onResearchDecision?: (referenceId: string, decision: RadarResearchDecision) => void;
  /** A confirmação da curadoria da pesquisa inteira. Uma escrita. */
  onConfirmResearchCuration?: () => void;
};

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const compactButton = "inline-flex min-h-9 items-center justify-center rounded-md border border-divider px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const section = "rounded-md border border-divider bg-surface p-4";
const inset = "rounded-md border border-divider bg-surface-subtle p-3";

function dateLabel(value: string | null | undefined) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function Meta({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-1 break-words text-sm text-foreground">{value === null || value === undefined || value === "" ? "Não informado" : value}</dd></div>;
}

function roleLabel(role: SerpCurationRole | "own") {
  return { primary: "Concorrente selecionado", support: "Referência de apoio", format: "Formato observado", own: "Página própria", excluded: "Ignorado", pending: "Aguardando decisão" }[role];
}

function ProcessTabs({ activeTab, onSelect, state }: { activeTab: RadarSerpProcessTab; onSelect: (tab: RadarSerpProcessTab) => void; state: Parameters<typeof buildRadarSerpProcessTabs>[0] }) {
  return <div className="overflow-x-auto"><div className="flex min-w-max gap-1 border-b border-divider" role="tablist" aria-label="Etapas da investigação SERP">{buildRadarSerpProcessTabs(state).map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={"radar-serp-tabpanel-" + tab.id} onClick={() => onSelect(tab.id)} className={"inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus " + (activeTab === tab.id ? "border-context-accent text-context-accent" : "border-transparent text-text-muted hover:border-context-accent/45 hover:text-foreground")}><span>{tab.label}</span><span className="rounded border border-divider px-1.5 py-0.5 text-xs leading-none text-text-muted">{tab.status}</span></button>)}</div></div>;
}

const TOPICOS_VISIVEIS = 10;
const DESTAQUES_VISIVEIS = 12;

/**
 * A ÁREA FIXA DE AÇÃO DA ABA — no fim dela, alinhada à direita.
 *
 * A jornada tinha virado uma barra global acima dos cards: para agir sobre a
 * SERP era preciso sair da SERP. Aqui a ação volta para dentro da aba que a
 * possui, sempre no mesmo lugar, e a aba que não é dona da ação de agora
 * aponta para a que é — em vez de fingir que não há nada a fazer.
 *
 * O componente não decide: rótulo, habilitação e motivo chegam prontos.
 */
function TabAction({ acao, busy, icon, onRun }: { acao: RadarSerpTabAction | null; busy: boolean; icon?: React.ReactNode; onRun: (acao: RadarSerpTabAction) => void }) {
  if (!acao) return null;
  return <div className="flex flex-wrap items-center justify-end gap-3 border-t border-divider pt-3" data-testid="radar-serp-tab-action" data-action-id={acao.id} data-action-kind={acao.kind}>
    {acao.blockedReason && <p className="mr-auto max-w-3xl text-sm leading-6 text-text-muted" data-testid="radar-serp-tab-action-reason">{acao.blockedReason}</p>}
    <button type="button" className={button + " border-context-accent"} data-testid={acao.id === "COLLECT" ? "radar-serp-collect-action" : "radar-serp-tab-action-button"} disabled={!acao.enabled || busy} onClick={() => onRun(acao)} title={acao.blockedReason || undefined}>{icon}{acao.label}</button>
  </div>;
}

function Sources({ items }: { items: Array<{ url: string; title: string; value: number }> }) {
  if (!items.length) return null;
  return <details className="mt-1"><summary className="cursor-pointer text-xs text-text-muted">Ver páginas ({items.length})</summary><ul className="mt-1 space-y-1 text-xs text-text-muted">{items.map(item => <li key={item.url} className="break-all">{item.title} — {item.value}</li>)}</ul></details>;
}

function ModelMeasure({ item }: { item: RadarModelMeasure }) {
  return <div><dt className="text-xs text-text-muted">{item.label}</dt><dd className="mt-1 text-sm text-foreground">{radarModelMeasureLabel(item)}</dd>{item.outliers.length > 0 && <p className="mt-1 text-xs text-warning">Fora da faixa: {item.outliers.map(outlier => outlier.title + " (" + outlier.value + ")").join(" · ")}</p>}<Sources items={item.sources} /></div>;
}

function ModelPresence({ item }: { item: RadarModelPresence }) {
  return <div><dt className="text-xs text-text-muted">{item.label}</dt><dd className="mt-1 text-sm text-foreground">{radarModelPresenceLabel(item)}</dd><Sources items={item.sources} /></div>;
}

/**
 * O QUE A SERP PRODUZIU — na aba que promete evidências.
 *
 * A aba Evidências dizia apenas o que NÃO existe: nenhuma ExternalEvidence,
 * nenhuma ProductEvidence. Depois de uma coleta e uma análise inteiras, ler
 * só ausências é o que fez a investigação parecer inútil. Aqui saem as
 * observações que a amostra realmente produziu, com a fonte de cada uma.
 *
 * Vem do relatório persistido, não do cálculo de render: se a pessoa está na
 * aba Evidências, o que importa é o que ficou gravado na versão.
 */
function SerpObservations({ analysis }: { analysis: RadarR3Model["serp"]["analysis"] }) {
  const modelo = analysis?.payload.competitiveReport?.observedCompetitiveModel || null;
  if (!modelo) return <div className={inset + " mt-3"}><h4 className="text-sm font-semibold text-foreground">Observações vindas da SERP</h4><p className="mt-2 text-sm text-text-muted">Nenhuma ainda: elas aparecem quando o relatório competitivo desta versão for gerado.</p></div>;
  const topicos = modelo.semantics.recurringTopics.slice(0, TOPICOS_VISIVEIS);
  return <div className={inset + " mt-3"} data-testid="radar-serp-observations">
    <h4 className="text-sm font-semibold text-foreground">Observações vindas da SERP</h4>
    <p className="mt-1 text-xs text-text-muted">Amostra: {modelo.sample.analyzed} página(s) analisada(s), {modelo.sample.comparable} comparável(is). Observação da amostra — a decisão editorial é do Planejador.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <div><h5 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Tópicos recorrentes</h5>{topicos.length ? <ul className="mt-1 space-y-1 text-sm text-foreground">{topicos.map(item => <li key={item.topic}>{item.topic} — {item.pages}/{item.sampleSize} página(s)</li>)}</ul> : <p className="mt-1 text-sm text-text-muted">Nenhum tópico se repetiu na amostra.</p>}</div>
      <div><h5 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Lacunas dos concorrentes</h5>{modelo.gaps.length ? <ul className="mt-1 space-y-1 text-sm text-foreground">{modelo.gaps.map((item, index) => <li key={index}>{item.description}<span className="block text-xs text-text-muted">{item.evidence}</span></li>)}</ul> : <p className="mt-1 text-sm text-text-muted">Nenhuma lacuna observada nesta amostra.</p>}</div>
      <div><h5 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Oportunidades observadas</h5>{modelo.opportunities.length ? <ul className="mt-1 space-y-1 text-sm text-foreground">{modelo.opportunities.map((item, index) => <li key={index}>{item.description}<span className="block text-xs text-text-muted">{item.evidence}</span></li>)}</ul> : <p className="mt-1 text-sm text-text-muted">Nenhuma oportunidade derivada da amostra.</p>}</div>
    </div>
    {modelo.limitations.length > 0 && <p className="mt-3 text-xs text-warning">{modelo.limitations.join(" · ")}</p>}
  </div>;
}

/**
 * O RESUMO DA SERP — a conclusão antes da matemática.
 *
 * A aba abria com mediana, faixa central e outlier, e quem lia tinha que
 * descobrir sozinho o que a amostra ensinou. Aqui vem primeiro o que os
 * concorrentes fazem em comum, o que se repete, o que ficou pouco coberto e
 * o que a amostra não permite afirmar. Os números continuam inteiros, um
 * clique adiante.
 */
/**
 * A CADEIA CORRENTE, PARA CONFERÊNCIA.
 *
 * A tela mostrava três números que pareciam da mesma versão e não eram. Aqui
 * dá para ver a qual snapshot e a qual impressão digital da curadoria cada
 * entidade pertence — e o que não fecha aparece nomeado.
 */
function StateChain({ chain }: { chain: ReturnType<typeof buildRadarCurrentStateChain> }) {
  const linha = (rotulo: string, valores: Array<[string, string | number]> | null) =>
    <div key={rotulo} className={inset}><h5 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{rotulo}</h5>{valores
      ? <dl className="mt-1 space-y-0.5 text-xs text-foreground">{valores.map(([chave, valor]) => <div key={chave} className="break-all"><dt className="inline text-text-muted">{chave}: </dt><dd className="inline">{valor}</dd></div>)}</dl>
      : <p className="mt-1 text-xs text-text-muted">Não existe nesta versão.</p>}</div>;
  return <section className={section} aria-label="Cadeia canônica da versão corrente" data-testid="radar-state-chain">
    <h4 className="text-sm font-semibold text-foreground">Cadeia da versão corrente</h4>
    <p className="mt-1 text-xs text-text-muted">{chain.consistent ? "Snapshot, curadoria, análise, relatório e aprovação pertencem à mesma versão." : "Há divergência entre as entidades desta linha."}</p>
    <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {linha("Snapshot", chain.snapshot ? [["id", chain.snapshot.snapshotId], ["versão", chain.snapshot.version], ["resultados", chain.snapshot.organicResultIds.length]] : null)}
      {linha("Curadoria", chain.curation ? [["versão", chain.curation.curationVersionId], ["selecionadas", chain.curation.selectedResultIds.length], ["fingerprint", chain.curation.fingerprint || "vazia"]] : null)}
      {linha("Análise", chain.analysis ? [["versão", chain.analysis.analysisVersionId], ["tentadas", chain.analysis.attemptedResultIds.length], ["sucesso", chain.analysis.successfulResultIds.length], ["falhas", chain.analysis.failedResultIds.length]] : null)}
      {linha("Relatório", chain.report ? [["id", chain.report.reportVersionId], ["análise", chain.report.analysisVersionId]] : null)}
      {linha("Aprovação", chain.approval ? [["id", chain.approval.approvalVersionId], ["snapshot", chain.approval.snapshotId], ["selecionadas", chain.approval.selectedResultIds.length]] : null)}
    </div>
    {chain.breaks.length > 0 && <ul className="mt-3 space-y-1 text-xs text-warning" data-testid="radar-state-chain-breaks">{chain.breaks.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>;
}

/* Componente do módulo, não do render: recriá-lo a cada leitura remonta a lista. */
function Lista({ titulo, itens, vazio }: { titulo: string; itens: string[]; vazio: string }) {
  return <div className={inset}><h4 className="text-sm font-semibold text-foreground">{titulo}</h4>{itens.length
    ? <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground">{itens.map((item, index) => <li key={index}>{item}</li>)}</ul>
    : <p className="mt-2 text-sm text-text-muted">{vazio}</p>}</div>;
}

function SerpSummary({ model }: { model: RadarCompetitiveModel }) {
  const resumo = buildRadarSerpSynthesis(model);
  return <section className={section} aria-label="Resumo da SERP" data-testid="radar-serp-summary">
    <h3 className="text-base font-semibold text-foreground">Resumo da SERP</h3>
    <dl className="mt-3 grid gap-3 sm:grid-cols-3">
      <Meta label="Amostra" value={resumo.headline} />
      <Meta label="Intenção predominante" value={resumo.intent} />
      <Meta label="Formato dominante" value={resumo.dominantFormat} />
    </dl>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <Lista titulo="O que os concorrentes fazem em comum" itens={resumo.commonPatterns} vazio="Nenhum padrão apareceu na maioria da amostra." />
      <Lista titulo="Estrutura observada" itens={resumo.structure} vazio="Sem página comparável, não há estrutura a observar." />
      <Lista titulo="Tópicos recorrentes" itens={resumo.recurringTopics} vazio="Nenhum tema se repetiu na amostra." />
      <Lista titulo="Pouco coberto pela amostra" itens={resumo.underCovered} vazio="Nenhum tema relacionado à consulta ficou pouco coberto." />
      <Lista titulo="Oportunidades observadas" itens={resumo.opportunities} vazio="Nenhuma oportunidade derivada desta amostra." />
      <Lista titulo="Limitações da leitura" itens={resumo.limitations} vazio="Nenhuma limitação registrada." />
    </div>
    {resumo.setAside.length > 0 && <p className="mt-3 text-xs text-text-muted" data-testid="radar-serp-summary-noise">Fora da leitura editorial (vitrine, navegação ou ficha de produto): {resumo.setAside.join(" · ")}.</p>}
    <p className="mt-3 text-xs text-text-muted">Tudo acima é observação da amostra. A estrutura do nosso artigo é decisão do Planejador.</p>
  </section>;
}

/**
 * O MOLDE COMPETITIVO — o que a amostra revela, em formato legível.
 *
 * Números soltos não eram produto. Aqui a mesma medição vira leitura: faixa
 * central sem o outlier, ordem temática dos H2, padrão de abertura, cobertura,
 * lacunas e oportunidades. Tudo rotulado como observação — a estrutura do
 * nosso artigo continua sendo decisão do Planejador.
 */
function CompetitiveModel({ model }: { model: RadarCompetitiveModel }) {
  return <section className={section} aria-label="Modelo competitivo observado" data-testid="radar-competitive-model">
    <h3 className="text-base font-semibold text-foreground">Modelo competitivo observado</h3>
    <p className="mt-1 text-sm leading-6 text-text-muted">Consulta: {model.identity.query || "não informada"} · Intenção observada: {model.identity.observedIntent || "não classificada"} · Formato que compete: {model.identity.dominantFormat || "não determinado"}. Amostra: {model.sample.analyzed} analisada(s), {model.sample.comparable} comparável(is). Tudo abaixo é observação da amostra; a estrutura do nosso artigo é decisão do Planejador.</p>

    <h4 className="mt-4 text-sm font-semibold text-foreground">Estrutura competitiva</h4>
    <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{model.structure.map(item => <ModelMeasure key={item.key} item={item} />)}</dl>

    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className={inset}><h4 className="text-sm font-semibold text-foreground">Padrão de abertura</h4><dl className="mt-2 grid gap-2">{model.opening.measures.map(item => <ModelMeasure key={item.key} item={item} />)}{model.opening.patterns.map(item => <ModelPresence key={item.key} item={item} />)}</dl></div>
      <div className={inset}><h4 className="text-sm font-semibold text-foreground">Padrão de fechamento</h4><dl className="mt-2 grid gap-2">{model.closing.measures.map(item => <ModelMeasure key={item.key} item={item} />)}{model.closing.patterns.map(item => <ModelPresence key={item.key} item={item} />)}</dl></div>
    </div>

    {model.organization.length > 0 && <div className={inset + " mt-4"}><h4 className="text-sm font-semibold text-foreground">Padrão de organização</h4><ol className="mt-2 space-y-2 text-sm text-text-muted">{model.organization.map((item, index) => <li key={item.topic}><span className="text-foreground">{index + 1}. {item.topic}</span> — observado em {item.pages}/{item.sampleSize} · H2 {item.asH2} · H3 {item.asH3}<details className="mt-1"><summary className="cursor-pointer text-xs">Ver ocorrências</summary><ul className="mt-1 space-y-1 text-xs">{item.occurrences.map((oc, position) => <li key={oc.pageId + position} className="break-all">{oc.title} · H{oc.level}</li>)}</ul></details></li>)}</ol></div>}

    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className={inset}><h4 className="text-sm font-semibold text-foreground">Formatação recorrente</h4><dl className="mt-2 grid gap-2 sm:grid-cols-2">{model.formatting.map(item => <ModelPresence key={item.key} item={item} />)}</dl></div>
      <div className={inset}><h4 className="text-sm font-semibold text-foreground">Principal observada</h4>{model.keyword ? <dl className="mt-2 grid gap-2 sm:grid-cols-2">{model.keyword.placements.map(item => <ModelPresence key={item.key} item={item} />)}<ModelMeasure item={model.keyword.occurrences} /></dl> : <p className="mt-2 text-sm text-text-muted">A presença por localização aparece após reanalisar as referências com a principal informada.</p>}<p className="mt-2 text-xs text-text-muted">Frequência observada. O Radar não define quantas vezes usar.</p></div>
      <div className={inset}><h4 className="text-sm font-semibold text-foreground">Links</h4><dl className="mt-2 grid gap-2">{model.links.map(item => <ModelMeasure key={item.key} item={item} />)}</dl></div>
      <div className={inset}><h4 className="text-sm font-semibold text-foreground">Cobertura semântica</h4><p className="mt-2 text-sm text-text-muted">{model.semantics.recurringTopics.map(item => item.topic + " (" + item.pages + "/" + item.sampleSize + ")").join(" · ") || "Nenhum tópico recorrente na amostra."}</p>{model.semantics.emphasizedTerms.length > 0 && <p className="mt-2 text-xs text-text-muted">Em destaque: {model.semantics.emphasizedTerms.slice(0, DESTAQUES_VISIVEIS).map(item => item.term + " (" + item.pages + "/" + item.sampleSize + ")").join(" · ")}</p>}</div>
    </div>

    {model.gaps.length > 0 && <div className={inset + " mt-4"}><h4 className="text-sm font-semibold text-foreground">Lacunas dos concorrentes</h4><ul className="mt-2 space-y-1 text-sm text-text-muted">{model.gaps.map((item, index) => <li key={index}>{item.description}</li>)}</ul></div>}
    {model.opportunities.length > 0 && <div className={inset + " mt-4"}><h4 className="text-sm font-semibold text-foreground">Oportunidades observadas</h4><ul className="mt-2 space-y-1 text-sm text-text-muted">{model.opportunities.map((item, index) => <li key={index}>{item.description}</li>)}</ul><p className="mt-2 text-xs text-text-muted">Derivadas da amostra. Viram decisão editorial somente no Planejador.</p></div>}
    {model.sample.excluded.length > 0 && <div className={inset + " mt-4"}><h4 className="text-sm font-semibold text-foreground">Fora do benchmark, ainda visíveis</h4><ul className="mt-2 space-y-1 text-sm text-text-muted">{model.sample.excluded.map(item => <li key={item.url} className="break-all">{item.title} — {item.reason}</li>)}</ul></div>}
    {model.limitations.length > 0 && <div className="mt-4 rounded-md border border-pending bg-pending-soft/40 p-3"><h4 className="text-sm font-semibold text-foreground">Limitações da amostra</h4><ul className="mt-2 space-y-1 text-sm text-foreground">{model.limitations.map(item => <li key={item}>{item}</li>)}</ul></div>}
  </section>;
}

function AnalysisDetails({ model, summary }: { model: RadarR3Model["serp"]; summary: ReturnType<typeof buildRadarSerpCurationSummary> }) {
  const report = model.analysis?.payload.competitiveReport;
  const diagnostic = model.view?.diagnostic;
  return <section className={section} aria-label="Leitura da análise da amostra"><h3 className="text-base font-semibold text-foreground">Leitura da análise da amostra</h3><p className="mt-1 text-sm text-text-muted">{summary.selectedCompetitors} página(s) selecionada(s) · {summary.needs} necessidade(s) · {summary.gaps} lacuna(s) · {summary.conflicts} conflito(s).</p><p className="mt-3 text-sm leading-6 text-text-muted">Intenção: {report?.dnaComparison.observedIntent || diagnostic?.dominantIntent || "Não classificada"}. Formatos: {diagnostic?.dominantFormats.join(" · ") || "Não observados"}. A leitura é observacional e não cria metas editoriais.</p></section>;
}

export function RadarR3SerpPanel({ model, scope, refreshing, onRefresh, onFocusAdjacent, pendingReviewCount = 0, reviewing = false, onReview, queueState = null, action = null, onStartAnalysis, onConfirmCuration, onAnalyzeSelected, approvalBlockedReason = null, reviewRemoteConfirmed = false, onInvestigationAction, researchContext, deepResearch, onResearchDecision, onConfirmResearchCuration, finalized = false }: Props) {
  const reasonInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const view = model.view;
  const analysis = model.analysis;
  const diagnostic = view?.diagnostic;
  const projection = buildRadarSerpSelectionProjection(view, analysis, scope);
  const candidates = radarAnalysisCandidates(view, analysis, scope);
  const summary = buildRadarSerpCurationSummary({ view, analysis, scope, review: { status: model.reviewStatus, currentness: model.reviewCurrentness } });
  /*
   * Uma fonte para os contadores da amostra: seleção confirmada, reutilizadas
   * e pendentes. Extração existir não coloca a página na amostra corrente.
   */
  /*
   * A AMOSTRA É A DAS DUAS CURADORIAS — não só a da SERP canônica.
   *
   * A aba Análise dizia "7 selecionadas" enquanto a investigação já trabalhava
   * com 18: ela recalculava o pertencimento sem a curadoria da pesquisa. Dois
   * espaços de estado na mesma tela, e o antigo com a palavra mais visível.
   */
  const membership = buildRadarAnalysisMembership({
    view, analysis, scope,
    researchSelectedUrls: deepResearch?.curation.confirmed ? deepResearch.curation.selectedRows.map(row => row.reference.url) : [],
  });
  const cadeia = buildRadarCurrentStateChain({ view, analysis, review: model.reviewHistory.find(item => item.snapshotId === model.latestSnapshotId) || null, reviewCurrentness: model.reviewCurrentness, scope });
  const complementaryCount = (view?.peopleAlsoAsk.length || 0) + (view?.relatedSearches.length || 0) + (view?.knowledgeGraph ? 1 : 0);
  const processState = { hasSnapshot: Boolean(view), resultCount: view?.organicResults.length || 0, hasAnalysis: Boolean(analysis), pendingDecisions: summary.pendingDecisions, selectedCompetitors: projection.selectedRows.length, pendingAnalysisCount: candidates.length, analyzedCount: analysis?.payload.extractions.length || 0, evidenceCount: complementaryCount, needsCount: summary.needs, reviewStatus: model.reviewStatus, historyCount: model.records.length };
  const [activeTab, setActiveTab] = useState<RadarSerpProcessTab>(() => nextSerpStep(processState));

  /*
   * A CURADORIA É RASCUNHO ATÉ ALGUÉM CONFIRMAR.
   *
   * Cada clique em Concorrente/Apoio/Ignorar criava uma versão remota e
   * reabria a análise: escolher sete referências virava sete decisões
   * editoriais definitivas e sete avisos. Marcar deixou de escrever; o
   * rascunho vive aqui e some quando a versão da análise muda — ou seja,
   * quando a confirmação chegou de volta pelo readback.
   */
  const [draft, setDraft] = useState<Record<string, { role?: SerpCurationRole; reason?: string }>>({});
  const [draftVersion, setDraftVersion] = useState<string | null>(analysis?.versionId ?? null);
  if (draftVersion !== (analysis?.versionId ?? null)) { setDraftVersion(analysis?.versionId ?? null); setDraft({}); }
  /*
   * DECLARADA ANTES DE QUALQUER JSX QUE A LEIA.
   *
   * Os blocos desta tela são const de JSX, avaliadas na hora em que a linha
   * roda. Com esta variável declarada lá no fim, a tabela do universo a lia
   * antes da inicialização e a aba quebrava em runtime — sem o typecheck nem
   * os testes de texto perceberem.
   */
  const busy = refreshing || reviewing || action !== null;
  const canChangeDecisions = Boolean(analysis && onConfirmCuration && action === null && !reviewing);
  const reviewConfirmed = model.reviewStatus === "approved" && model.reviewCurrentness === "current" && reviewRemoteConfirmed;
  const reviewReopened = model.reviewStatus === "approved" && model.reviewCurrentness === "reopened";
  const reviewNeedsComparison = model.reviewStatus === "approved" && model.reviewCurrentness === "unknown";
  const selectionByKey = new Map(projection.rows.map(row => [row.key, row]));
  const changeDecision = (key: string, role: SerpCurationRole) =>
    setDraft(current => ({ ...current, [key]: { role, reason: reasonInputRefs.current[key]?.value ?? current[key]?.reason } }));
  const papelDe = (key: string, persistido: SerpCurationRole | "own") => draft[key]?.role ?? persistido;
  /** O que ainda não foi confirmado — e por isso ainda não é decisão. */
  const alteracoes = Object.entries(draft).flatMap(([key, item]) => {
    const atual = selectionByKey.get(key);
    if (!atual || atual.role === "own") return [];
    const papelAtual = atual.role as SerpCurationRole;
    const motivoAtual = atual.decision?.reason ?? "";
    const role = item.role ?? papelAtual;
    const reason = item.reason ?? motivoAtual;
    if (role === papelAtual && reason === motivoAtual) return [];
    return [{ key, role, reason }];
  });
  const selecionadasAgora = projection.rows.filter(row => ["primary", "support"].includes(papelDe(row.key, row.role))).length;

  /*
   * UMA ação primária, derivada do estado real.
   *
   * O painel não decide mais o rótulo por conta própria: sem snapshot ele
   * oferece "Iniciar coleta SERP"; com snapshot, "Atualizar SERP"; e em
   * bloqueio estrutural NÃO oferece ação nenhuma, porque repetir não resolve
   * vínculo quebrado.
   */
  // Um cálculo por render: o resumo e os dados técnicos leem o mesmo modelo.
  /*
   * A SUFICIÊNCIA DA AMOSTRA, ANTES DE QUALQUER LEITURA.
   *
   * Zero páginas comparáveis não é uma leitura fraca: é ausência de leitura. O
   * modelo, as lacunas e as oportunidades só aparecem quando existe do que
   * concluir; as observações e as falhas continuam visíveis de qualquer forma.
   */
  const comparaveis = (analysis?.payload.extractions || []).filter(isComparableRadarExtraction).length;
  /*
   * UMA SUFICIÊNCIA SÓ.
   *
   * A investigação profunda já resolveu a leitura com a evidência de intenção
   * (o que a composição declara × o que a SERP devolveu). Recalcular aqui sem
   * essa evidência produziria dois veredictos para a mesma amostra — o começo
   * do contador que discorda do contador.
   */
  const suficiencia = deepResearch?.sufficiency || resolveRadarInvestigationSufficiency({
    hasSnapshot: Boolean(view),
    curationConfirmed: summary.curationStarted,
    selected: membership.selected,
    analyzed: membership.analyzed,
    failed: analysis?.payload.extractionFailures.length || 0,
    comparable: comparaveis,
  });
  const falhasDeExtracao = analysis?.payload.extractionFailures || [];
  const formatosObservados = projection.rows.filter(row => row.role === "format").length;
  /*
   * O QUE AS KEYWORDS JÁ DIZIAM SOBRE A CONSULTA.
   *
   * "cremes skin care" foi lido como amostra falha por trazer páginas de
   * produto — sem ninguém perguntar se a própria composição é transacional.
   * Quando é, a SERP comercial concorda com a keyword; não a contradiz.
   */
  const sinalComercial = researchContext ? radarDeclaredCommercialSignal(researchContext) : null;
  /*
   * UMA AUTORIDADE, UMA LEITURA.
   *
   * A aba montava o próprio modelo estrutural enquanto o relatório gravava
   * outro. Dois cálculos sobre a mesma investigação é uma discordância
   * esperando acontecer. Agora ele vem pronto da view, junto do modelo
   * competitivo observado que a mesma investigação produziu.
   *
   * O portão continua o mesmo: sem amostra comparável não há faixa nem
   * mediana a mostrar, e sem extração acionada pelo USER não há extração.
   */
  const modeloCompetitivo = suficiencia.canBuildCompetitiveModel && analysis?.payload.extractions.length
    ? deepResearch?.observed.evidence.structural ?? null
    : null;

  const collectionAction = model.collection;
  const collectionBlocked = collectionAction?.state === "STRUCTURAL_BLOCK";
  const collectionLabel = refreshing
    ? (collectionAction?.isFirstCollection ? "Coletando SERP…" : "Coletando…")
    : collectionAction?.actionLabel ?? (queueState === "FAILED_RETRYABLE" ? "Tentar novamente" : "Atualizar SERP");
  const collection = <div className={section}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-foreground">Coleta da SERP</h3><p className="mt-1 text-sm text-text-muted">Provider canônico: {model.provider}. Abrir esta subaba não dispara chamada; coletar é sempre explícito.</p></div></div>{collectionBlocked ? <div className="mt-4 rounded-md border border-warning bg-warning-soft/30 p-3" data-testid="radar-serp-structural-block"><p className="text-sm font-semibold text-foreground">Coleta bloqueada</p><p className="mt-1 text-sm leading-6 text-foreground">{collectionAction?.detail}</p><p className="mt-2 text-sm text-text-muted">Corrija o vínculo da keyword antes de coletar. Nenhuma chamada DataForSEO foi iniciada.</p></div> : !view ? <p className="mt-4 rounded-md border border-pending bg-pending-soft p-3 text-sm text-foreground">{collectionAction?.detail || "Nenhum snapshot disponível. A coleta DataForSEO é explícita e só acontece por esta ação."}</p> :<dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Meta label="Consulta principal" value={view.query} /><Meta label="Snapshot" value={"v" + view.version} /><Meta label="Provider" value={view.provider} /><Meta label="Capturado em" value={dateLabel(view.capturedAt)} /><Meta label="Resultados orgânicos" value={view.organicResults.length} /></dl>}</div>;

  /*
   * A CURADORIA DO UNIVERSO PESQUISADO.
   *
   * Quando a pesquisa profunda está ativa, a aba passa a mostrar o universo
   * INTEIRO — inclusive as URLs que só uma consulta auxiliar encontrou. A
   * curadoria da SERP canônica continua existindo, logo abaixo, intocada: é
   * ela que sustenta snapshot, revisão e aprovação do artigo.
   */
  const pesquisa = deepResearch?.references.length ? deepResearch.curation : null;
  const decisaoDaPesquisa = (referenceId: string, decision: RadarResearchDecision) => onResearchDecision?.(referenceId, decision);
  const researchTable = !pesquisa ? null : <div className={section} data-testid="radar-research-curation">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Universo pesquisado</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">Todas as páginas que a investigação encontrou — na SERP canônica do artigo e nas consultas auxiliares. Recorrência é sinal, não aprovação: a seleção continua sua.</p>
      </div>
      {pesquisa.stale && <span className="rounded-full border border-warning px-2.5 py-1 text-sm text-warning" data-testid="radar-research-curation-stale">Universo mudou desde a última curadoria</span>}
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Meta label="Referências pesquisáveis" value={pesquisa.availableCount} />
      <Meta label="Selecionadas para análise" value={pesquisa.selectedCount} />
      <Meta label="Aguardando decisão" value={pesquisa.pendingCount} />
      <Meta label="Alterações não confirmadas" value={pesquisa.dirtyCount} />
    </dl>
    <div className="mt-4 overflow-x-auto rounded-md border border-divider">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <caption className="sr-only">Referências do universo pesquisado e decisões humanas</caption>
        <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-muted"><tr><th scope="col" className="w-12 px-3 py-3">Usar</th><th scope="col" className="min-w-72 px-3 py-3">Página</th><th scope="col" className="w-36 px-3 py-3">Origem</th><th scope="col" className="w-48 px-3 py-3">Classificação</th><th scope="col" className="min-w-64 px-3 py-3">Decisão</th></tr></thead>
        <tbody>{pesquisa.rows.map(row => {
          const referencia = row.reference;
          const origem = radarReferenceOrigin(referencia);
          return <tr key={referencia.referenceId} className="border-t border-divider align-top first:border-t-0" data-testid="radar-research-reference" data-reference-id={referencia.referenceId}>
            <td className="px-3 py-3"><input type="checkbox" aria-label={"Selecionar " + (referencia.title || referencia.domain) + " para a análise"} checked={row.analyzable} onChange={event => decisaoDaPesquisa(referencia.referenceId, event.target.checked ? "primary" : "excluded")} disabled={!onResearchDecision} className="h-4 w-4" /></td>
            <td className="px-3 py-3"><div className="min-w-0"><a className="font-medium text-foreground underline decoration-divider underline-offset-2 hover:text-context-accent" href={referencia.url} target="_blank" rel="noreferrer">{referencia.title || "Página sem título"}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></a><span className="mt-1 block break-all text-xs text-text-muted">{referencia.domain}</span><p className="mt-1 text-sm leading-5 text-text-muted">{radarReferenceAppearanceSummary(referencia)}</p></div></td>
            <td className="px-3 py-3 text-text-muted">{radarReferenceOriginLabel(origem)}</td>
            <td className="px-3 py-3"><span className="rounded-full border border-divider px-2 py-1 text-xs text-text-muted">{radarCompetitorClassLabel(referencia.classification)}</span><p className="mt-2 text-xs leading-5 text-text-muted">{referencia.classificationReason}</p></td>
            <td className="px-3 py-3"><span className="rounded-full border border-divider px-2 py-1 text-xs text-text-muted">{radarResearchDecisionLabel(row.decision)}</span>{row.decision === "pending" && <p className="mt-2 text-xs text-text-muted">Sugerida: {radarResearchDecisionLabel(row.suggestedDecision)}</p>}<div className="mt-2 flex flex-wrap gap-2">{(["primary", "support", "format", "authority", "excluded"] as const).map(decisao => <button key={decisao} type="button" aria-pressed={row.decision === decisao} className={row.decision === decisao ? compactButton + " border-context-accent bg-selected" : compactButton} onClick={() => decisaoDaPesquisa(referencia.referenceId, decisao)} disabled={!onResearchDecision || busy}>{radarResearchDecisionLabel(decisao)}</button>)}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-3 text-sm text-text-muted">{pesquisa.dirtyCount ? pesquisa.dirtyCount + " alteração(ões) ainda não confirmada(s). Nada foi gravado até você confirmar." : pesquisa.confirmed ? "Curadoria da pesquisa confirmada para este universo." : "Marque as referências que entram na análise e confirme uma vez."}</p>
  </div>;
  const competitors = !view ? <div className={section}><h3 className="text-base font-semibold text-foreground">Concorrentes e referências</h3><p className="mt-2 text-sm leading-6 text-text-muted">Sem snapshot, esta etapa não possui dados operacionais. Consulte Coleta para atualizar a SERP explicitamente.</p></div> : <div className={section}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-foreground">Concorrentes e referências</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">Apenas as páginas marcadas como concorrente ou apoio alimentam a análise. Posição alta não significa aprovação automática.</p></div></div><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Meta label="Resultados SERP" value={view.organicResults.length} /><Meta label="Concorrentes selecionados" value={summary.selectedCompetitors} /><Meta label="Referências incluídas" value={summary.includedReferences} /><Meta label={summary.curationStarted ? "Decisões pendentes" : "Aguardando curadoria"} value={summary.curationStarted ? summary.pendingDecisions : summary.awaitingCuration} /><Meta label="Alterações não confirmadas" value={alteracoes.length} /></dl>{formatosObservados > 0 && <p className="mt-3 text-sm text-text-muted" data-testid="radar-format-demotion">{formatosObservados} referência(s) incluída(s) foram classificadas como formato observado (vídeo ou social) e ficam fora do benchmark editorial. Elas continuam incluídas na curadoria — a diferença entre os dois contadores é essa, e não uma seleção perdida.</p>}{!analysis && <p className="mt-4 rounded-md border border-pending bg-pending-soft p-3 text-sm leading-6 text-foreground">Inicie a curadoria para registrar decisões humanas neste snapshot. Enquanto isso, os resultados permanecem somente observados.</p>}<div className="mt-4 overflow-x-auto rounded-md border border-divider"><table className="w-full min-w-[900px] border-collapse text-left text-sm"><caption className="sr-only">Resultados orgânicos e decisões de curadoria da SERP</caption><thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-muted"><tr><th scope="col" className="w-12 px-3 py-3">Usar</th><th scope="col" className="w-20 px-3 py-3">Posição</th><th scope="col" className="min-w-72 px-3 py-3">Página</th><th scope="col" className="w-36 px-3 py-3">Tipo</th><th scope="col" className="w-52 px-3 py-3">Decisão</th><th scope="col" className="min-w-64 px-3 py-3">Classificar</th></tr></thead><tbody>{view.organicResults.map(result => { const key = radarOrganicDecisionKey(result); const selection = selectionByKey.get(key); const decision = selection?.decision; const role = papelDe(key, selection?.role || "pending"); const disabled = !canChangeDecisions; return <tr className="border-t border-divider align-top first:border-t-0" key={radarOrganicRenderKey(view.record.id, result) + ":" + (analysis?.versionId || "no-analysis")}><td className="px-3 py-3"><input type="checkbox" aria-label={"Selecionar " + (result.title || result.domain) + " como concorrente"} checked={role === "primary" || role === "support"} onChange={event => changeDecision(key, event.target.checked ? "primary" : "excluded")} disabled={disabled || role === "own"} className="h-4 w-4" /></td><td className="px-3 py-3 font-medium text-foreground">{result.position}</td><td className="px-3 py-3"><div className="min-w-0"><a className="font-medium text-foreground underline decoration-divider underline-offset-2 hover:text-context-accent" href={result.url} target="_blank" rel="noreferrer">{result.title || "Resultado sem título"}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></a><span className="mt-1 block break-all text-xs text-text-muted">{result.domain || result.url}</span><p className="mt-1 line-clamp-2 text-sm leading-5 text-text-muted">{result.snippet || "Snippet não retornado."}</p></div></td><td className="px-3 py-3 text-text-muted">{result.manualType || result.inferredType || "orgânico"}</td><td className="px-3 py-3"><span className="rounded-full border border-divider px-2 py-1 text-xs text-text-muted">{roleLabel(role)}</span>{decision && analysis && <label className="mt-3 block"><span className="text-xs text-text-muted">Motivo da decisão</span><input ref={element => { reasonInputRefs.current[key] = element; }} defaultValue={decision.reason} maxLength={1000} className="mt-1 min-h-9 w-full rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-context-accent focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50" onBlur={event => { const next = event.relatedTarget; const row = event.currentTarget.closest("tr"); if (next instanceof HTMLElement && row?.contains(next)) return; const valor = event.currentTarget.value; setDraft(current => ({ ...current, [key]: { role: current[key]?.role ?? (selection?.role as SerpCurationRole | undefined), reason: valor } })); }} disabled={disabled} /></label>}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2">{analysis && <><button type="button" aria-pressed={role === "primary"} className={role === "primary" ? compactButton + " border-context-accent bg-selected" : compactButton} onClick={() => changeDecision(key, "primary")} disabled={disabled || role === "own"}>Concorrente</button><button type="button" aria-pressed={role === "support"} className={role === "support" ? compactButton + " border-context-accent bg-selected" : compactButton} onClick={() => changeDecision(key, "support")} disabled={disabled || role === "own"}>Apoio</button><button type="button" aria-pressed={role === "format"} className={role === "format" ? compactButton + " border-context-accent bg-selected" : compactButton} onClick={() => changeDecision(key, "format")} disabled={disabled || role === "own"}>Formato</button><button type="button" aria-pressed={role === "excluded"} className={role === "excluded" ? compactButton + " border-context-accent bg-selected" : compactButton} onClick={() => changeDecision(key, "excluded")} disabled={disabled}>Ignorar</button>{role !== "pending" && <button type="button" className={compactButton} onClick={() => changeDecision(key, "pending")} disabled={disabled}>Aguardar</button>}</>}</div></td></tr>; })}</tbody></table></div>{analysis && <p className="mt-3 text-sm text-text-muted">{alteracoes.length ? `${selecionadasAgora} referência(s) selecionada(s) · ${alteracoes.length} alteração(ões) ainda não confirmada(s). Nada foi gravado até você confirmar.` : "A seleção é derivada da versão vinculada ao snapshot atual. Confirmar grava uma vez, com readback."}</p>}</div>;

  const analysisPanel = !view || !analysis ? <div className={section}><h3 className="text-base font-semibold text-foreground">Análise da amostra</h3><p className="mt-2 text-sm leading-6 text-text-muted">A análise fica disponível depois de uma coleta e da curadoria humana dos concorrentes. Nenhum cálculo é iniciado ao abrir esta subaba.</p></div> : <><section className={section}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-foreground">Análise das referências selecionadas</h3><p className="mt-1 text-sm leading-6 text-text-muted">Usa somente concorrentes e apoios marcados em Concorrentes. PAA, relacionadas e entidade são evidência complementar, não páginas do benchmark.</p><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Meta label="Amostra confirmada" value={radarMembershipLabel(membership)} /><Meta label="Páginas na amostra" value={membership.analyzed} /><Meta label="Intenção observada na SERP" value={diagnostic?.dominantIntent || "Não classificada"} /><Meta label="Formatos observados na SERP" value={diagnostic?.dominantFormats.join(" · ") || "Não classificados"} /><Meta label="Suficiência" value={radarSufficiencyLabel(suficiencia.level)} /><Meta label="Limitações" value={diagnostic?.limitations.length || 0} /></dl></div></div>{analysis.payload.competitiveReport && <div className="mt-4 grid gap-3 md:grid-cols-2"><div className={inset}><h4 className="text-sm font-semibold text-foreground">Necessidades</h4><p className="mt-1 text-sm text-text-muted">{summary.needs} necessidade(s) derivada(s) da amostra.</p></div><div className={inset}><h4 className="text-sm font-semibold text-foreground">Lacunas e conflitos</h4><p className="mt-1 text-sm text-text-muted">{summary.gaps} lacuna(s) registrada(s) · {summary.conflicts} conflito(s) observado(s).</p></div></div>}</section>{!suficiencia.canBuildCompetitiveModel && <section className="rounded-md border border-warning bg-warning-soft/25 p-4" data-testid="radar-insufficient-sample">
      <h3 className="text-base font-semibold text-foreground">{suficiencia.headline}</h3>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground">{suficiencia.reasons.map(item => <li key={item}>{item}</li>)}</ul>
      <p className="mt-2 text-sm text-text-muted">Sem amostra editorial comparável, o Radar não monta modelo estrutural, lacunas nem oportunidades. As páginas observadas e as falhas continuam abaixo.</p>
      {diagnostic?.dominantFormats.length ? <p className="mt-2 text-sm text-text-muted">O que a SERP mostra: {diagnostic.dominantFormats.join(" · ")}. Uma consulta dominada por produto ou vídeo é uma descoberta sobre a consulta — não um artigo editorial a imitar.</p> : null}
      {sinalComercial?.expectsCommercialSerp && <p className="mt-2 text-sm text-foreground" data-testid="radar-commercial-signal">A composição deste artigo declara intenção comercial em {sinalComercial.commercialKeywords} keyword(s) ({sinalComercial.declaredIntents.join(" · ")}). Uma SERP com lojas e produtos é coerente com essa composição — a ausência de amostra editorial descreve a consulta, não uma falha da coleta.</p>}
    </section>}
    {falhasDeExtracao.length > 0 && <section className={section} data-testid="radar-extraction-failures">
      <h3 className="text-base font-semibold text-foreground">{falhasDeExtracao.length} página(s) selecionada(s) não puderam ser extraídas</h3>
      <p className="mt-1 text-sm text-text-muted">Elas continuam selecionadas na curadoria e fora da amostra até uma nova tentativa.</p>
      <details className="mt-2"><summary className="cursor-pointer text-xs text-text-muted">Ver detalhe por página</summary><ul className="mt-2 space-y-1 text-xs text-text-muted">{falhasDeExtracao.map(item => <li key={item.key} className="break-all">{item.url} — {item.code}{item.status ? " · HTTP " + item.status : ""} · {item.message}</li>)}</ul></details>
    </section>}
    {modeloCompetitivo && <SerpSummary model={modeloCompetitivo} />}<details className={section}><summary className="cursor-pointer text-sm font-semibold text-foreground">Ver dados técnicos da amostra</summary><div className="mt-4 space-y-4"><StateChain chain={cadeia} />{modeloCompetitivo && <CompetitiveModel model={modeloCompetitivo} />}<AnalysisDetails model={model} summary={summary} /></div></details></>;

  const evidence = <div className={section}><h3 className="text-base font-semibold text-foreground">Evidências</h3><p className="mt-1 text-sm leading-6 text-text-muted">Esta visão organiza evidências sem transformar URLs em evidência e sem criar persistência nova.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><div className={inset}><h4 className="text-sm font-semibold text-foreground">Necessidades de evidência</h4><p className="mt-2 text-sm text-text-muted">{summary.needs ? summary.needs + " necessidade(s) observada(s) na análise." : "Nenhuma necessidade registrada para a amostra atual."}</p></div><div className={inset}><h4 className="text-sm font-semibold text-foreground">SerpEvidence</h4><p className="mt-2 text-sm text-text-muted">{complementaryCount ? complementaryCount + " item(ns) complementar(es) de PAA, pesquisas relacionadas ou entidade." : "Nenhuma evidência complementar retornada pelo snapshot."}</p></div><div className={inset}><h4 className="text-sm font-semibold text-foreground">ExternalEvidence</h4><p className="mt-2 text-sm text-text-muted">Nenhuma ExternalEvidence é criada nesta tela; o contrato atual não persiste fontes externas neste painel. O que a SERP produziu aparece abaixo como observação da amostra, não como fonte externa.</p></div><div className={inset}><h4 className="text-sm font-semibold text-foreground">ExpertEvidence e ProductEvidence</h4><p className="mt-2 text-sm text-text-muted">Permanecem separadas nos fluxos de Especialista e Amazon, sem serem inferidas a partir de links da SERP.</p></div></div><SerpObservations analysis={model.analysis} />{complementaryCount > 0 && <div className="mt-3 grid gap-3 md:grid-cols-3">{view?.peopleAlsoAsk.length ? <div className={inset}><h4 className="text-sm font-semibold text-foreground">People Also Ask</h4><div className="mt-2 space-y-2">{view.peopleAlsoAsk.map(item => <div key={view.record.id + ":paa:" + item.position} className="border-b border-divider pb-2 text-sm last:border-0"><p className="text-foreground">{item.question}</p><p className="mt-1 text-text-muted">{item.answer || "Sem resposta textual no snapshot."}</p></div>)}</div></div> : null}{view?.relatedSearches.length ? <div className={inset}><h4 className="text-sm font-semibold text-foreground">Pesquisas relacionadas</h4><div className="mt-2 flex flex-wrap gap-2">{view.relatedSearches.map(item => <span key={view.record.id + ":related:" + item.term} className="rounded-full border border-divider px-2.5 py-1 text-sm text-text-muted">{item.term}</span>)}</div></div> : null}{view?.knowledgeGraph ? <div className={inset}><h4 className="text-sm font-semibold text-foreground">Entidade observada</h4><p className="mt-2 text-sm text-foreground">{view.knowledgeGraph.title || "Entidade sem título"}</p><p className="mt-1 text-sm text-text-muted">{view.knowledgeGraph.description || "Sem descrição retornada."}</p></div> : null}</div>}</div>;

  const review = <><div className={section}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-foreground">Revisão e aprovação</h3><p className="mt-1 text-sm leading-6 text-text-muted">A aprovação liga a decisão humana ao artigo, à versão do ArticleDNA, ao snapshot e à curadoria desta análise.</p></div><span className="rounded-full border border-divider px-2.5 py-1 text-sm text-text-muted">{reviewConfirmed ? "SERP aprovada" : reviewReopened ? "Revisão reaberta" : reviewNeedsComparison ? "Aprovação histórica exige comparação" : model.reviewStatus === "approved" ? "Aprovação local não confirmada" : model.reviewStatus === "rejected" ? "SERP rejeitada" : "Aguardando decisão"}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5"><Meta label="Concorrentes selecionados" value={summary.selectedCompetitors} /><Meta label="Referências aprovadas" value={summary.approvedReferences} /><Meta label="Necessidades" value={summary.needs} /><Meta label="Lacunas" value={summary.gaps} /><Meta label="Conflitos" value={summary.conflicts} /></dl>{approvalBlockedReason && !reviewConfirmed && <p className="mt-4 rounded-md border border-pending bg-pending-soft p-3 text-sm leading-6 text-foreground">{approvalBlockedReason}</p>}{reviewReopened && <p className="mt-4 rounded-md border border-pending bg-pending-soft p-3 text-sm leading-6 text-foreground">A aprovação histórica remota foi preservada, mas a curadoria atual mudou e reabriu a revisão.</p>}{reviewNeedsComparison && <p className="mt-4 rounded-md border border-pending bg-pending-soft p-3 text-sm leading-6 text-foreground">Há aprovação remota neste snapshot, mas ela não contém o fingerprint de curadoria necessário para confirmar que ainda é a decisão atual.</p>}{!reviewConfirmed && onReview && <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={button + " border-success text-success"} onClick={() => onReview("approved")} disabled={reviewing || Boolean(approvalBlockedReason)} title={approvalBlockedReason || undefined}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Aprovar SERP</button><button type="button" className={button + " border-warning text-warning"} onClick={() => onReview("rejected")} disabled={reviewing}>{reviewing ? "Registrando…" : <><XCircle className="h-4 w-4" aria-hidden="true" />Rejeitar SERP</>}</button></div>}{reviewConfirmed && <p className="mt-4 text-sm text-success">A aprovação remota foi confirmada com o snapshot e a curadoria atuais. {model.reviewNotes || "Sem nota adicional."}</p>}{model.reviewStatus === "approved" && !reviewConfirmed && !reviewReopened && !reviewNeedsComparison && <p className="mt-4 text-sm text-warning">A decisão local ainda não tem write remoto e readback confirmados.</p>}</div>{onFocusAdjacent && pendingReviewCount > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-pending bg-pending-soft/50 px-3 py-2"><p className="text-sm text-foreground">{pendingReviewCount} SERP(s) aguardando revisão</p><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => onFocusAdjacent("previous")}>Anterior</button><button type="button" className={button} onClick={() => onFocusAdjacent("next")}>Próxima pendente</button></div></div>}</>;

  const history = <div className={section}><div className="flex items-center gap-2"><History className="h-4 w-4 text-context-accent" aria-hidden="true" /><h3 className="text-base font-semibold text-foreground">Histórico de coletas</h3></div>{model.records.length ? <div className="mt-3 space-y-2">{model.records.map(record => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-divider py-2 text-sm last:border-0"><span className="text-foreground">v{record.research?.version || 1} · {record.provider} · {record.research?.organicResults.length || record.snapshot?.results.length || 0} resultado(s)</span><span className="break-all text-text-muted">{dateLabel(record.research?.collectedAt || record.snapshot?.capturedAt)} · {record.id}</span></div>)}</div> : <p className="mt-3 text-sm text-text-muted">Ainda não há snapshots anteriores para este artigo.</p>}<p className="mt-3 text-sm text-text-muted">Revisão atual: {model.reviewStatus || "pendente"} · {model.reviewCurrentness}. {model.reviewedAt ? "Registrada em " + dateLabel(model.reviewedAt) + ". " : ""}{view?.hash ? "Hash do snapshot atual: " + view.hash + "." : ""}</p>{model.reviewHistory.length > 0 && <div className="mt-3 space-y-2 border-t border-divider pt-3"><h4 className="text-sm font-semibold text-foreground">Decisões preservadas</h4>{model.reviewHistory.map(review => <div key={review.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-foreground">{review.status === "approved" ? "Aprovada" : "Rejeitada"} · {review.snapshotId}</span><span className="text-text-muted">{dateLabel(review.reviewedAt)}</span></div>)}</div>}</div>;

  /*
   * A coleta continua sendo decidida por `model.collection`: bloqueio
   * estrutural não vira botão, e primeira coleta não é "atualizar".
   */
  const collectionTabAction: RadarSerpTabAction | null = collectionAction?.actionLabel === null ? null : {
    kind: "run", id: "COLLECT", label: collectionLabel, target: null,
    enabled: !(refreshing || action !== null || collectionBlocked || collectionAction?.canStart === false || queueState === "FAILED_FINAL"),
    blockedReason: collectionBlocked ? collectionAction?.detail || "Corrija o vínculo da keyword antes de coletar." : null,
  };
  /*
   * Com alteração pendente, a ação da aba é confirmar — e a análise não
   * roda sobre uma seleção que ninguém gravou ainda.
   */
  const confirmacao: RadarSerpTabAction | null = alteracoes.length ? {
    kind: "run", id: "DECIDE_RESULTS", target: null,
    label: `Confirmar seleção (${selecionadasAgora})`,
    enabled: Boolean(onConfirmCuration) && !busy,
    blockedReason: null,
  } : null;
  /* A confirmação do universo pesquisado — uma escrita, como a canônica. */
  const confirmacaoDaPesquisa: RadarSerpTabAction | null = pesquisa?.dirtyCount ? {
    /* Mesma ação de decidir resultados — sobre o universo, não sobre a canônica. */
    kind: "run", id: "DECIDE_RESULTS", target: null,
    label: `Confirmar seleção (${pesquisa.selectedCount})`,
    enabled: Boolean(onConfirmResearchCuration) && !busy,
    blockedReason: null,
  } : null;
  /*
   * CONGELADO NÃO OFERECE AÇÃO.
   *
   * A leitura viva continua calculando pendências, e elas descrevem uma rodada
   * que já foi encerrada. Oferecer "analisar pendentes" ao lado de um bundle
   * congelado convidaria a reabrir por engano o que o USER fechou.
   */
  const tabAction = finalized ? null
    : activeTab === "collection" ? collectionTabAction
    : confirmacao && activeTab !== "competitors" ? { ...confirmacao, kind: "navigate" as const, target: "competitors" as const, label: "Confirmar seleção em Concorrentes", blockedReason: `${alteracoes.length} alteração(ões) da curadoria ainda não confirmada(s).` }
      : radarSerpTabAction(activeTab, model.investigation);
  // Os handlers são os canônicos que já existiam; a aba só escolhe quando chamar.
  const runTabAction = (acao: RadarSerpTabAction) => {
    if (acao.kind === "navigate") { if (acao.target) setActiveTab(acao.target); return; }
    if (acao.id === "COLLECT") return onRefresh();
    if (acao.id === "START_CURATION") return onStartAnalysis?.();
    if (acao.id === "START_ANALYSIS" || acao.id === "ANALYZE_PENDING") return onAnalyzeSelected?.();
    onInvestigationAction?.(acao.id);
  };

    /*
   * DUAS CURADORIAS, UMA ABA — sem misturar as listas.
   *
   * Com pesquisa profunda ativa, o universo é a superfície de trabalho e a
   * curadoria da SERP canônica fica recolhida, íntegra: ela continua sendo o
   * que a revisão lê e a aprovação assina.
   */
  const competitorsTab = researchTable
    ? <div className="space-y-4">{researchTable}<details className={section} data-testid="radar-canonical-curation"><summary className="cursor-pointer text-sm font-semibold text-foreground">Curadoria da SERP canônica do artigo ({view?.organicResults.length || 0} resultado(s))</summary><p className="mt-2 text-sm leading-6 text-text-muted">Esta é a lista que sustenta snapshot, revisão e aprovação do artigo. Ela não muda com a pesquisa profunda.</p><div className="mt-3">{competitors}</div></details></div>
    : competitors;
  const content: Record<RadarSerpProcessTab, React.ReactNode> = { collection, competitors: competitorsTab, analysis: analysisPanel, evidence, review, history };
  return <section className="space-y-4" aria-label="Processo contextual da SERP do Radar"><ProcessTabs activeTab={activeTab} onSelect={setActiveTab} state={processState} /><div id={"radar-serp-tabpanel-" + activeTab} role="tabpanel" aria-label={activeTab}>{content[activeTab]}</div>{finalized ? null : activeTab === "competitors" && confirmacaoDaPesquisa ? <TabAction acao={confirmacaoDaPesquisa} busy={busy} onRun={() => onConfirmResearchCuration?.()} /> : activeTab === "competitors" && confirmacao ? <TabAction acao={confirmacao} busy={busy} onRun={() => onConfirmCuration?.(alteracoes)} /> : <TabAction acao={tabAction} busy={busy} onRun={runTabAction} icon={activeTab === "collection" ? <RefreshCw className={"h-4 w-4" + (refreshing ? " animate-spin" : "")} aria-hidden="true" /> : undefined} />}</section>;
}
