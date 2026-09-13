"use client";

import { useState } from "react";
import { ChevronDown, FileCheck2, Search, UserRound, Video } from "lucide-react";
import { RADAR_R3_AREAS, type RadarR3Area, type RadarR3Model } from "@/lib/radar/r3-workbench";
import type { RadarR6ExpertEvidenceInput, RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import type { RadarExpertEvidence } from "@/lib/radar/analysis-contracts";
import { radarR4SerpStatusLabel, type RadarR4AmazonState } from "@/lib/radar/r4-queue";
import { radarSufficiencyLabel } from "@/lib/radar/investigation-sufficiency";
import { RADAR_PHASE1_HANDLER } from "@/lib/radar/operational-actions";
import { InfoHint } from "@/components/info-hint";
import type { RadarPhase1Action } from "@/lib/radar/serp-phase1";
import {
  buildRadarArticleDnaSummary, buildRadarAuthoritySummary, buildRadarCompetitiveSummary,
  buildRadarDiscoverySummary, buildRadarInternalLinkSummary, buildRadarReportSummary,
  buildRadarResearchCardSummary, radarReportCheckTone,
} from "@/lib/radar/operational-view";
import { radarQueryExecutionLabel } from "@/lib/radar/deep-research";
import { radarQueryDispositionLabel } from "@/lib/radar/research-query-plan";
import type { RadarDeepResearchView } from "@/lib/radar/deep-research-view";
import { RADAR_DEFAULT_SEARCH_MODE, radarSearchModeAvailability, radarSearchModeLabel, type RadarPrimarySearchMode } from "@/lib/radar/search-mode";
import { RadarR3AmazonPanel } from "./radar-r3-amazon-panel";
import { RadarR3ContentDossier } from "./radar-r3-content-dossier";
import { RadarR3VideosPanel, type RadarVideoSourcesView } from "./radar-r3-videos-panel";
import { summarizeRadarVideoLibrary, type RadarLibrarySource } from "@/lib/radar/video-library";
import { RadarBlueprintSummaryCard, RadarSpecialistBriefList, RadarVideoBriefList } from "./radar-r3-blueprint";
import { RadarR3ResearchDetails } from "./radar-r3-research-details";
import { RadarR3SpecialistPanel } from "./radar-r3-specialist-panel";
import { RadarR6ReportPanel } from "./radar-r6-report-panel";

type RadarR3WorkbenchProps = {
  model: RadarR3Model | null;
  refreshing: boolean;
  /*
   * O QUE SAIU DAQUI, E POR QUE NÃO VOLTA POR DESCUIDO.
   *
   * `onReviewSerp`, `onStartSerpAnalysis`, `onConfirmSerpCuration`,
   * `onResearchDecision`, `onConfirmResearchCuration`, `onRefreshSerp`,
   * `onFocusAdjacent`, `onInvestigationAction`, `pendingReviewCount`,
   * `serpApprovalBlockedReason` e `serpReviewRemoteConfirmed` alimentavam a
   * superfície antiga: aprovar SERP, rejeitar, iniciar curadoria, confirmar
   * classificação manual, analisar pendentes, navegar a fila de revisão.
   *
   * Removê-los do CONTRATO — e não só da árvore renderizada — é o que impede
   * que um deles seja religado sem uma decisão explícita. As funções continuam
   * existindo onde precisam existir; o Workbench Fase 1 deixou de alcançá-las.
   */
  reviewingSerp?: boolean;
  serpAction?: "start" | "decision" | "extract" | null;
  onAnalyzeSerpSelection?: () => void;
  onTopicChange?: (articleId: string, topicId: string, text: string) => void;
  onTopicRemove?: (articleId: string, topicId: string) => void;
  onTopicMove?: (articleId: string, topicId: string, direction: -1 | 1) => void;
  onTopicAdd?: (articleId: string, text: string) => void;
  onTopicReview?: (articleId: string, topicId: string) => void;
  onTopicUndo?: (articleId: string) => void;
  onTopicRedo?: (articleId: string) => void;
  canUndoTopics?: boolean;
  canRedoTopics?: boolean;
  onTopicAdjacent?: (direction: "previous" | "next") => void;
  topicQueuePosition?: number;
  topicQueueTotal?: number;
  /*
   * AS FONTES DE VÍDEO CHEGAM PRONTAS DO SERVIDOR — Gate 1 de Vídeos.
   *
   * `onExistingContentAdd` e `onExistingContentStateChange` saíram do contrato
   * junto com o formulário unitário: eles escreviam num `useState` que era a
   * única cópia da fonte. Tirá-los do CONTRATO, e não só da árvore, é o que
   * impede que o caminho local volte sem uma decisão explícita.
   */
  videoSources?: RadarVideoSourcesView;
  onRegisterVideoSources?: (articleId: string | null, raw: string) => void;
  /*
   * AS AÇÕES DE VÍDEO ACEITAM ARTIGO NULO — §2.3.2.
   *
   * A biblioteca é da MARCA e existe sem artigo selecionado. Só as ações da
   * camada do artigo exigem um, e quem recusa é o servidor, em voz alta.
   */
  onExtractVideoText?: (articleId: string | null, videoSourceId: string) => void;
  onFetchVideoMetadata?: (articleId: string | null, videoSourceId: string) => void;
  onProvideVideoTranscript?: (articleId: string | null, videoSourceId: string, transcript: string) => void;
  onUploadVideoMedia?: (articleId: string | null, videoSourceId: string, file: File) => void;
  onLibraryAction?: (articleId: string | null, action: "SELECT" | "UNSELECT" | "PROCESS_SELECTED" | "ARCHIVE" | "CLEAR_LIST", videoSourceIds: string[]) => void;
  /** O artigo ativo, quando existe. A camada da marca não depende dele. */
  articleId?: string | null;
  onReloadLibrary?: (articleId: string | null) => void;
  /** Casar pauta com conteúdo — Gate 3. Ação humana, sem provider. */
  onRunMatching?: (articleId: string | null) => void;
  onReportReview?: () => void;
  onReportApprove?: () => void;
  onReportGenerate?: () => void;
  /** As duas ações humanas da investigação profunda. Nada dispara sozinho. */
  onStartDeepResearch?: () => void;
  /** Traz para a tela a coleta real já gravada. É leitura: não consulta provider. */
  onRecoverSerp?: () => void;
  onFinalizeInvestigation?: () => void;
  /** A curadoria do universo pesquisado: marcar (rascunho) e confirmar (escrita). */
  /** Zera a investigação deste artigo de teste. Não toca nos fundamentos. */
  onResetInvestigation?: () => void;
  /** O modo da pesquisa principal e a troca, disponível antes de iniciar. */
  searchMode?: RadarPrimarySearchMode;
  onSearchModeChange?: (mode: RadarPrimarySearchMode) => void;
  onAmazonStateChange?: (articleId: string, state: RadarR4AmazonState) => void;
  expertContext?: RadarR6ExpertTopicContext | null;
  onExpertEvidenceChange?: (articleId: string, evidence: RadarR6ExpertEvidenceInput[], summary: { contributionCount: number; pendingCount: number; remote: true; canonicalEvidence: RadarExpertEvidence[]; blockedEvidenceCount: number; articleDnaVersionId: string }) => void;
  /** Kept for the canonical article route and legacy deep-link callers. */
  onOpenArticle: () => void;
  onOpenDetail: (tab?: "resumo" | "serp" | "referencias" | "analise-serp" | "relatorio") => void;
};

type StatusTone = "info" | "pending" | "success" | "warning" | "neutral";

const areaIcon: Record<RadarR3Area, typeof Search> = { pesquisa: Search, videos: Video, especialista: UserRound, relatorio: FileCheck2 };
const areaLabel: Record<RadarR3Area, string> = { pesquisa: "Pesquisa", videos: "Vídeos", especialista: "Especialista", relatorio: "Relatório" };

const toneText: Record<StatusTone, string> = {
  info: "text-context-accent",
  pending: "text-pending",
  success: "text-success",
  warning: "text-warning",
  neutral: "text-text-muted",
};

const toneDot: Record<StatusTone, string> = {
  info: "bg-context-accent",
  pending: "bg-pending",
  success: "bg-success",
  warning: "bg-warning",
  neutral: "bg-divider",
};

function StatusMark({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`mt-2 inline-flex items-center gap-2 text-sm ${toneText[tone]}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[tone]}`} aria-hidden="true" />{children}</span>;
}

/**
 * O QUE CADA CARD DIZ QUANDO ESTÁ FECHADO.
 *
 * Uma linha de números e uma de estado. Nada de provider, snapshot, versão
 * técnica ou explicação de arquitetura: o card responde "como está", e quem
 * quiser saber "como funciona" abre.
 */
function areaCopy(area: RadarR3Area, model: RadarR3Model, mode: RadarPrimarySearchMode): { lines: string[]; status: string; tone: StatusTone } {
  if (area === "pesquisa") {
    /*
     * A PESQUISA FALA DA INVESTIGAÇÃO INTEIRA — não da coleta de uma SERP.
     *
     * O card antigo somava três frases verdadeiras ("SERP concluída", "análise
     * reaberta", "relatório aguardando") e produzia uma leitura falsa. O estado
     * agora vem de uma autoridade só, e o modo escolhido aparece no topo
     * porque é ele que define o que os números descrevem.
     */
    if (model.deepResearch) {
      const resumo = buildRadarResearchCardSummary({ view: model.deepResearch, mode });
      return {
        lines: [
          resumo.modeLabel,
          `${resumo.counts.queries} consulta(s) · ${resumo.counts.references} referência(s)`,
          `${resumo.counts.analyzed} analisada(s) · ${resumo.counts.failures} falha(s)`,
          `Modelo competitivo: ${resumo.model.label}`,
        ],
        status: resumo.statusLabel,
        tone: resumo.tone,
      };
    }
    const queueState = model.r4?.serp.state;
    if (queueState) {
      const progress = model.r4?.serp.position && model.r4.serp.total ? ` · ${model.r4.serp.position}/${model.r4.serp.total}` : "";
      return { lines: [radarSearchModeLabel(mode), `${model.serp.resultCount} resultado(s)${progress}`], status: radarR4SerpStatusLabel(queueState), tone: queueState === "COMPLETED" ? "success" : queueState.startsWith("FAILED") ? "warning" : "pending" };
    }
    const investigation = model.serp.investigation;
    if (investigation) {
      const investigationTone: StatusTone = investigation.state === "COMPLETED" ? "success"
        : investigation.state === "REOPENED" ? "warning"
          : investigation.state === "NOT_STARTED" ? "neutral" : "pending";
      return { lines: [radarSearchModeLabel(mode), `${model.serp.resultCount} resultado(s) · ${investigation.completedCount}/${investigation.stages.length} etapas`], status: investigation.headline, tone: investigationTone };
    }
    const tone: StatusTone = model.serp.status.includes("Simulada") ? "warning" : model.serp.pendingCount > 0 || !model.serp.resultCount ? "pending" : "success";
    return { lines: [radarSearchModeLabel(mode), `${model.serp.resultCount} resultado(s)`], status: model.serp.pendingCount > 0 ? `${model.serp.pendingCount} pendente(s)` : model.serp.status, tone };
  }

  if (area === "videos") {
    /*
     * A ÁREA QUE NÃO USA SERP.
     *
     * A pesquisa descobre o que o mercado publicou; aqui entra o que a marca
     * escolheu deliberadamente. O card conta quantos materiais existem e diz o
     * que a área ainda não faz — prometer transcrição num rótulo seria pior do
     * que a ausência.
     */
    const materiais = model.r4?.existingContent || [];
    const registrados = materiais.filter(item => item.state !== "IGNORED_FOR_ARTICLE").length;
    return {
      lines: [
        registrados ? `${registrados} material(is) registrado(s)` : "Nenhum material registrado",
        "Entrada deliberada, sem SERP",
      ],
      status: registrados ? "Aguardando transcrição" : "Não utilizado",
      tone: registrados ? "pending" : "neutral",
    };
  }

  if (area === "relatorio") {
    const observado = model.deepResearch?.observed || null;
    if (observado && model.deepResearch) {
      const resumo = buildRadarReportSummary({ observed: observado, view: model.deepResearch });
      const prontos = resumo.checks.filter(item => item.state === "READY").length;
      const exigidos = resumo.checks.filter(item => item.state !== "NOT_REQUIRED").length;
      return {
        lines: [`${prontos} de ${exigidos} verificação(ões) prontas`, resumo.blockers.length ? `${resumo.blockers.length} ponto(s) em aberto` : "Nenhum ponto em aberto"],
        status: model.report.approved ? "Aprovado" : resumo.blockers.length ? "Em aberto" : "Pronto para revisão",
        tone: model.report.approved ? "success" : resumo.blockers.length ? "pending" : "success",
      };
    }
    return { lines: [model.report.status], status: model.report.sentToPlanner ? "Enviado ao Planejador" : "Aguardando investigação", tone: model.report.approved ? "success" : "neutral" };
  }

  /*
   * O ESPECIALISTA LÊ A MESMA AUTORIDADE QUE O RELATÓRIO — §5 e §8.
   *
   * O card dizia "Não necessário" enquanto o bloco de autoridade, na mesma
   * tela, dizia "Especialista: 1 ponto preparado". Nenhum dos dois mentia
   * sobre o próprio dado: o card lia o estado do FLUXO (ninguém escolhido,
   * nada enviado) e o bloco lia a AUTORIDADE de evidência, que preparou um
   * ponto de revisão a partir de uma afirmação YMYL.
   *
   * Agora os dois saem de `buildRadarSpecialistSummary`, e a necessidade
   * preparada aparece antes de qualquer pedido ter sido enviado.
   *
   * GATE 18.7 · E A PLANILHA ENTROU NO MESMO LUGAR.
   *
   * Este card montava a leitura por conta própria enquanto a linha da planilha
   * lia o estado do fluxo — a mesma tela dizia "1 ponto preparado" e "Não
   * necessário". A projeção passou a ser montada uma vez, por quem tem a
   * investigação em mãos, e chega pronta no modelo.
   */
  const resumoEspecialista = model.specialist.summary;
  if (resumoEspecialista) {
    return {
      lines: model.r4?.topics.items.length
        ? [`${model.r4.topics.items.length} pauta(s) local(is)`, ...resumoEspecialista.lines]
        : resumoEspecialista.lines,
      status: resumoEspecialista.statusLabel,
      tone: resumoEspecialista.tone,
    };
  }
  return {
    lines: model.r4?.topics.items.length
      ? [`${model.r4.topics.items.length} pauta(s) local(is)`]
      : [`${model.specialist.contributionsReceived} contribuição(ões)`, `${model.specialist.pending} pendente(s)`],
    status: model.specialist.status,
    tone: model.r4?.specialist === "READY_FOR_REVIEW" || model.r4?.specialist === "RECEIVED" ? "pending" : "neutral",
  };
}

const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-context-accent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:border-divider disabled:opacity-50";

/**
 * A AÇÃO DO ARTIGO ATIVO — no fim do bloco operacional, antes da planilha.
 *
 * Um botão, alinhado à direita, sempre no mesmo lugar. Não é barra, stepper
 * nem wizard: é a MESMA ação que a aba da SERP oferece, visível para quem
 * ainda não expandiu o card. A coluna "Próxima ação" da planilha continua
 * sendo informação — e informação não substitui operação.
 *
 * Enquanto a SERP está expandida ela é a dona do slot e este some: dois
 * botões para a mesma decisão seria o começo do problema outra vez.
 */
/**
 * SEM INVESTIGAÇÃO RESOLVIDA, O QUE EXISTE É UM MOTIVO — não uma ação antiga.
 *
 * Aqui morava `PrimaryAction`, que lia a autoridade legada da investigação e
 * oferecia o que ela devolvesse: Iniciar curadoria, Analisar páginas pendentes,
 * Aprovar investigação. Vocabulário de um fluxo que não existe mais, num botão
 * que a Fase 1 não reconhece — a segunda autoridade de workflow, no lugar mais
 * visível da tela.
 *
 * Quando não há view da investigação, não há o que operar: falta o contexto do
 * artigo. Dizer isso é mais útil que oferecer uma etapa herdada, e é honesto:
 * READ_ONLY por construção, sem nenhum handler.
 */
function ResearchUnavailable({ model }: { model: RadarR3Model }) {
  const motivo = model.researchContext?.state === "COMPLETE"
    ? "A investigação deste artigo ainda não foi montada nesta sessão."
    : "O contexto do artigo ainda não foi resolvido: sem principal com texto, não há consulta central para pesquisar.";
  return <div className="mt-3 border-t border-divider pt-3" data-testid="radar-research-unavailable">
    <p className="text-sm leading-6 text-text-muted">Pesquisa indisponível. {motivo}</p>
  </div>;
}

/*
 * A INVESTIGAÇÃO PROFUNDA, NO LUGAR ONDE A DECISÃO ACONTECE.
 *
 * Duas ações humanas e nada mais: começar e finalizar. Entre elas, o que o
 * Radar observou — plano de consultas, universo, comparação com o ArticleDNA,
 * links e fontes. O detalhe técnico fica recolhido; a síntese vem primeiro.
 *
 * Este bloco NÃO prescreve: não escreve outline, não define quantidade de link,
 * âncora final nem posição. Isso é do Planejador.
 */
function DeepResearch({ view, busy, searchMode, onSearchModeChange, onStart, onAnalyze, onFinalize, onReset, onRecover }: { view: RadarDeepResearchView; busy: boolean; searchMode: RadarPrimarySearchMode; onSearchModeChange?: (mode: RadarPrimarySearchMode) => void; onStart?: () => void; onAnalyze?: () => void; onFinalize?: () => void; onReset?: () => void; onRecover?: () => void }) {
  /* A Fase 1 tem uma ação por vez: iniciar, analisar ou finalizar. */
  const acao = view.phase1;
  const resumo = view.summary;
  const registro = view.record;
  /*
   * A AÇÃO RESOLVIDA ESCOLHE O HANDLER PELO MAPA CANÔNICO.
   *
   * Uma cadeia de `if` aqui é onde "Finalizar" passa a chamar a análise sem
   * que nada quebre visivelmente. O mapa é dado, vive no domínio e é testado —
   * a tela só o consulta.
   */
  const disparar = () => {
    const handler = RADAR_PHASE1_HANDLER[acao.id];
    if (handler === "START") return onStart?.();
    if (handler === "ANALYZE") return onAnalyze?.();
    if (handler === "FINALIZE") return onFinalize?.();
  };

  const observado = view.observed;
  const temAmostra = observado.sample.comparablePages > 0;
  const competitivo = buildRadarCompetitiveSummary(observado);
  const links = buildRadarInternalLinkSummary(observado);
  const autoridade = buildRadarAuthoritySummary(observado);
  const descoberta = buildRadarDiscoverySummary(observado.aiDiscovery);

  return <section className="mt-3 rounded-md border border-divider bg-surface-subtle p-3" data-testid="radar-deep-research" data-state={view.state}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-foreground">Pesquisa {radarSearchModeLabel(searchMode)}</h2>
      <span className="rounded-full border border-divider px-2.5 py-0.5 text-sm text-text-muted" data-testid="radar-deep-research-state">{deepResearchStateLabel(view.state)}</span>
    </div>

    {/*
      * A CHAVE DA PESQUISA PRINCIPAL — antes de começar, nunca no meio.
      *
      * Web pesquisa páginas; YouTube pesquisa vídeos; Amazon pesquisa produtos.
      * São universos diferentes e produzem modelos diferentes: misturá-los na
      * mesma amostra não descreveria nenhum deles. Por isso é UMA escolha, e
      * não três lugares para pesquisar.
      */}
    {onSearchModeChange && <div className="mt-3" data-testid="radar-search-mode">
      <span className="text-sm text-text-muted">Pesquisar em</span>
      <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Onde pesquisar">
        {(["WEB", "YOUTUBE", "AMAZON"] as const).map(modo => {
          const disponibilidade = radarSearchModeAvailability(modo);
          const congelado = view.state !== "NOT_STARTED";
          return <button key={modo} type="button" role="radio" aria-checked={searchMode === modo} data-testid={`radar-search-mode-${modo.toLowerCase()}`}
            className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60 ${searchMode === modo ? "border-context-accent bg-selected font-medium text-foreground" : "border-divider text-text-muted hover:border-module-accent/40 hover:text-foreground"}`}
            disabled={busy || congelado}
            title={congelado ? "A investigação em curso foi feita no modo atual. Zere para trocar." : disponibilidade.reason || undefined}
            onClick={() => onSearchModeChange(modo)}>
            <span aria-hidden="true">{searchMode === modo ? "●" : "○"}</span>
            {radarSearchModeLabel(modo)}
            {disponibilidade.engine === "planned" && <span className="text-xs text-text-muted">em construção</span>}
          </button>;
        })}
      </div>
    </div>}

    {/* O RESUMO PRIMEIRO. O detalhe atrás de quem pedir. */}
    <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" data-testid="radar-research-summary">
      <Meta label="Keywords" value={resumo.articleKeywords} />
      <Meta label="Consultas" value={resumo.queriesExecuted || resumo.queriesPlanned} />
      <Meta label="Referências" value={observado.sample.uniqueReferences} />
      <Meta label="Páginas comparáveis" value={observado.sample.comparablePages} />
      <Meta label="Intenção" value={observado.intent.observedInSerp || observado.intent.declared} />
      <Meta label="Suficiência" value={radarSufficiencyLabel(view.sufficiency.level)} />
    </dl>

    {temAmostra && <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
      {/*
        * QUATRO PERGUNTAS, QUATRO RESUMOS.
        *
        * Cada bloco responde em números o que a camada correspondente concluiu
        * e guarda a leitura inteira atrás de um clique. Treze blocos abertos ao
        * mesmo tempo foi o que fez esta área crescer até deixar de ser lida.
        */}
      <Resumo testId="radar-summary-model" title="Modelo competitivo" lines={[
        `${competitivo.comparablePages} página(s) comparável(is)`,
        `${competitivo.recurrentConcepts} conceito(s) recorrente(s) · ${competitivo.coreQuestions} pergunta(s) central(is)`,
        `${competitivo.gaps} lacuna(s) · ${competitivo.differentiations} diferenciação(ões) · ${competitivo.conflicts} conflito(s)`,
      ]}>
        <div className="grid gap-3 md:grid-cols-2">
          {view.narrative.map(secao => <div key={secao.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{secao.title}</h4>
            <ul className="mt-1 space-y-1 text-sm leading-6 text-foreground">{secao.lines.map((linha, index) => <li key={index}>{linha}</li>)}</ul>
          </div>)}
        </div>
      </Resumo>

      <Resumo testId="radar-summary-links" title="Links internos" lines={[
        `${links.relatedDestinations} destino(s) relacionado(s)`,
        `${links.resolvedApplications} aplicação(ões) resolvida(s)${links.unresolvedRelations ? ` · ${links.unresolvedRelations} sem contexto natural` : ""}`,
        `${links.recommendedOccurrences} ocorrência(s) recomendada(s)`,
      ]}>
        {/*
          * RELAÇÃO SEM APLICAÇÃO NÃO É ERRO.
          *
          * O Arquiteto aprovou a relação; esta rodada não achou onde aplicá-la
          * com fundamento. Mostrar como falha convidaria alguém a "consertar"
          * apagando a relação.
          */}
        {links.unresolvedNote && <p className="mb-3 text-sm leading-6 text-text-muted" data-testid="radar-links-unresolved">{links.unresolvedNote}</p>}
        <ul className="space-y-2.5">{[...observado.internalLinkPlan.outgoing, ...(observado.internalLinkPlan.siloPage ? [observado.internalLinkPlan.siloPage] : [])].map(item => <li key={item.nodeId} className="rounded-md border border-divider bg-surface p-2.5">
          <p className="text-sm font-medium text-foreground">{item.slug || item.nodeId}</p>
          <dl className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Meta label="Relação" value={item.relationTypes.join(" · ")} />
            <Meta label="Quantidade" value={item.recommendedOccurrences} />
            <Meta label="Âncora" value={item.anchor.recommendedAnchor} />
            <Meta label="Contexto" value={item.preferredContexts[0] || item.supportingContexts[0]?.conceptLabel} />
          </dl>
          {item.evidence[0] && <p className="mt-1.5 text-sm leading-6 text-text-muted">{item.evidence[0]}</p>}
        </li>)}</ul>
      </Resumo>

      <Resumo testId="radar-summary-authority" title="Fontes e autoridade" lines={[
        `${autoridade.citingCompetitors} de ${autoridade.sampleSize} concorrentes citam fontes externas`,
        `${autoridade.distinctSources} fonte(s) distinta(s) · ${autoridade.recurrentDomains} domínio(s) recorrente(s)`,
        `YMYL ${autoridade.ymylLabel} · ${autoridade.claimsNeedingSupport} afirmação(ões) precisam de revisão`,
        `Especialista: ${autoridade.specialistPoints} ponto(s) preparado(s)`,
      ]}>
        <div className="grid gap-3 md:grid-cols-2">
          {view.narrative.filter(secao => secao.title === "Fontes e referências" || secao.title === "Autoridade e evidência").map(secao => <div key={secao.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{secao.title}</h4>
            <ul className="mt-1 space-y-1 text-sm leading-6 text-foreground">{secao.lines.map((linha, index) => <li key={index}>{linha}</li>)}</ul>
          </div>)}
        </div>
      </Resumo>

      <Resumo testId="radar-summary-discovery" title="Busca e compreensão" lines={[
        `${descoberta.coreQuestions} pergunta(s) central(is)`,
        `${descoberta.answersNeedingClarity} resposta(s) que precisam ser claras · ${descoberta.definitions} definição(ões)`,
        `${descoberta.unitsNeedingEvidence} precisam de evidência · ${descoberta.unitsDependingOnSpecialist} dependem do especialista`,
      ]}>
        <ul className="space-y-1 text-sm leading-6 text-foreground">
          {(view.narrative.find(secao => secao.title === "Descoberta e compreensão")?.lines || []).map((linha, index) => <li key={index}>{linha}</li>)}
        </ul>
      </Resumo>
    </div>}

    {/*
      * PROVENIÊNCIA TÉCNICA — um lugar só, sempre recolhido.
      *
      * Plano de consultas, fundamento congelado, versões e limitações técnicas.
      * Nada disso é operação cotidiana, e nada disso deixou de existir.
      */}
    <details className="mt-3 rounded-md border border-divider bg-surface p-3" data-testid="radar-technical-provenance">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Proveniência e detalhes técnicos</summary>
      <div className="mt-3 space-y-4">
        <p className="text-sm leading-6 text-text-muted">A pesquisa cobre a unidade editorial inteira — principal, secundárias e reforços — contra o que o ArticleDNA declara. A SERP da principal é a canônica do artigo: é ela que tem snapshot, revisão e aprovação; as demais são auxiliares e alimentam o universo competitivo. Nada é coletado por abrir a tela.</p>
        {registro && <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Meta label="Iniciada em" value={new Date(registro.startedAt).toLocaleString("pt-BR")} />
          <Meta label="ArticleDNA" value={registro.fingerprint.articleDnaVersionId} />
          <Meta label="SiloDNA" value={registro.fingerprint.siloDnaVersionId} />
          <Meta label="SERP de formação" value={registro.fingerprint.formationAssessmentId} />
          <Meta label="Grafo de links" value={registro.fingerprint.internalLinkGraphVersionId} />
        </dl>}
        <div className="overflow-x-auto rounded-md border border-divider">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">Plano de consultas da investigação</caption>
            <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-muted"><tr><th scope="col" className="px-3 py-2">Keyword</th><th scope="col" className="px-3 py-2">Papel</th><th scope="col" className="px-3 py-2">SERP</th><th scope="col" className="px-3 py-2">Decisão</th><th scope="col" className="px-3 py-2">Motivo</th></tr></thead>
            <tbody>{view.plan.queries.map(query => {
              const execucao = registro?.queries.find(item => item.queryId === query.queryId) || null;
              const classe = execucao?.serpClass || (query.role === "principal" ? "canonical" : "auxiliary");
              return <tr key={query.queryId} className="border-t border-divider align-top first:border-t-0">
                <td className="px-3 py-2 text-foreground">{query.keyword || "Texto não resolvido nesta versão"}</td>
                <td className="px-3 py-2 text-text-muted">{roleLabel(query.role)}</td>
                <td className="px-3 py-2 text-text-muted">{classe === "canonical" ? "Canônica do artigo" : "Auxiliar de pesquisa"}</td>
                <td className="px-3 py-2 text-text-muted">{execucao ? radarQueryExecutionLabel(execucao.execution) : radarQueryDispositionLabel(query.disposition)}</td>
                <td className="px-3 py-2 text-text-muted">{execucao?.reason || query.reason}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {resumo.limitations.length > 0 && <div><h3 className="text-sm font-semibold text-foreground">O que esta investigação não pôde afirmar</h3><ul className="mt-1 space-y-1 text-sm leading-6 text-text-muted">{resumo.limitations.map(item => <li key={item}>{item}</li>)}</ul></div>}
      </div>
    </details>

    {/*
      * A INVESTIGAÇÃO CONGELADA — o que "finalizada" significa, com endereço.
      *
      * Sem isto, "finalizada" era um carimbo de data: a leitura continuava
      * sendo recalculada e ninguém conseguiria provar depois quais evidências
      * o Planejador recebeu. O hash é do CONTEÚDO congelado, não do ArticleDNA.
      */}
    {view.finalizedBundle && <section className="mt-3 rounded-md border border-success/35 bg-success-soft/25 p-3" data-testid="radar-frozen-bundle">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Investigação congelada</h3>
        <span className="text-sm text-text-muted">{new Date(view.finalizedBundle.frozenAt).toLocaleString("pt-BR")}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Meta label="Evidências" value={view.finalizedBundle.bundleId} />
        <Meta label="Hash do pacote" value={view.finalizedBundle.bundleHash} />
        <Meta label="Amostra" value={`${view.finalizedBundle.sample.comparablePages} comparável(is)`} />
        <Meta label="Links planejados" value={view.finalizedBundle.links.totalRecommendedLinks} />
        <Meta label="Especialista" value={`${view.finalizedBundle.authority.specialistRequirements.length} ponto(s)`} />
      </dl>
      {view.finalizedBundle.acknowledgedInsufficiency && <p className="mt-2 text-sm leading-6 text-warning" data-testid="radar-frozen-insufficiency">Encerrada com insuficiência declarada: {view.finalizedBundle.acknowledgedInsufficiency}</p>}
      <p className="mt-2 text-sm leading-6 text-text-muted">Esta versão não muda mais. Para pesquisar de novo, zere a investigação — o registro anterior permanece.</p>
    </section>}

    <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-divider pt-3">
      {(acao.blockedReason || acao.hint) && <p className="mr-auto max-w-3xl text-sm leading-6 text-text-muted" data-testid="radar-deep-research-reason">{acao.blockedReason || acao.hint}</p>}
      {/*
        * Zerar é ação de bancada, não de operação: discreta, sem borda de ação,
        * e só aparece quando existe investigação para descartar.
        */}
      {onReset && view.state !== "NOT_STARTED" && <button type="button" data-testid="radar-reset-investigation" className="inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={onReset} title="Descarta a investigação deste artigo de teste. Os fundamentos não são tocados.">Zerar investigação</button>}
      {/*
        * BOTÃO MORTO NÃO É INFORMAÇÃO.
        *
        * Depois de congelada, não há ação primária: oferecer "SERP finalizada"
        * desabilitado convidaria ao clique e não faria nada. Quem quiser nova
        * rodada usa zerar, que é explícito.
        */}
      <RecoverSerpAction view={view} busy={busy} onRecover={onRecover} />
      {acao.id !== "NONE" && <Phase1Button acao={acao} busy={busy} onTrigger={disparar} />}
    </div>
  </section>;
}

/**
 * UM RESUMO E O QUE HÁ ATRÁS DELE.
 *
 * Três ou quatro linhas de números na primeira camada; a leitura inteira no
 * `details`. O conteúdo interno só monta quando alguém abre — e abrir renderiza
 * dado que já existe, nunca dispara coleta.
 */
function Resumo({ testId, title, lines, children }: { testId: string; title: string; lines: string[]; children: React.ReactNode }) {
  return <section className="rounded-md border border-divider bg-surface p-2.5" data-testid={testId}>
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    <ul className="mt-1.5 space-y-0.5 text-sm leading-6 text-text-muted">{lines.map(linha => <li key={linha}>{linha}</li>)}</ul>
    <details className="mt-2"><summary className="cursor-pointer text-sm text-context-accent">Ver detalhe</summary><div className="mt-2.5">{children}</div></details>
  </section>;
}

/*
 * O ESTADO EM VOCABULÁRIO ATUAL — §3 do Gate 18.1.
 *
 * `AWAITING_REVIEW` dizia "Aguardando revisão humana" e reintroduzia na tela a
 * etapa de revisão da SERP que o Gate 15.3 removeu: quem lia aquilo procurava
 * um botão de aprovar que não existe mais. O estado em si está certo — a
 * análise terminou e a investigação não foi finalizada — e o que faltava era
 * chamá-lo pelo que ele é.
 *
 * O identificador interno continua o mesmo de propósito: renomeá-lo mexeria em
 * projeções e testes por toda parte sem mudar nada para quem opera. O que a
 * pessoa lê é o rótulo, e é o rótulo que estava errado.
 */
const deepResearchStateLabel = (state: RadarDeepResearchView["state"]) => ({
  NOT_STARTED: "Não iniciada",
  RUNNING: "Em andamento",
  AWAITING_REVIEW: "Analisada",
  FINALIZED: "Finalizada",
  STALE: "Fundamento mudou",
}[state]);

const roleLabel = (role: "principal" | "secundaria" | "reforco_narrativo") => ({
  principal: "Principal", secundaria: "Secundária", reforco_narrativo: "Reforço narrativo",
}[role]);

function Meta({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div><dt className="text-xs text-text-muted">{label}</dt><dd className="mt-1 break-words text-sm text-foreground">{value === null || value === undefined || value === "" ? "Não informado" : value}</dd></div>;
}

/**
 * O CARD DE RESUMO — e por que ele encolheu.
 *
 * Ele tinha altura mínima de oito linhas para caber uma frase explicativa que
 * ninguém lê duas vezes. Agora a altura é a do conteúdo: nome, três linhas de
 * número e o estado. Quatro cards assim cabem numa faixa, e a área de trabalho
 * volta a ser a área de trabalho.
 */
/**
 * O RESUMO DA BIBLIOTECA DE VÍDEOS — §2.3.2.
 *
 * O card contava `model.r4.existingContent`, o conteúdo local legado: com a
 * biblioteca cheia ele ainda dizia "Nenhum material registrado", e sem artigo
 * nem aparecia. Aqui ele conta o que existe de fato, na MARCA.
 *
 * A linha do artigo só entra quando há artigo. Sem um, o card informa o acervo
 * — nunca um zero que seria mentira sobre a biblioteca.
 */
function resumoDaBiblioteca(
  sources: readonly RadarLibrarySource[],
  articleId: string | null,
  leitura: { loading?: boolean; error?: string | null; readbackConfirmed?: boolean },
): { lines: string[]; status: string; tone: StatusTone } {
  /*
   * O CARD NÃO INVENTA UM ACERVO VAZIO — §2.3.3.
   *
   * Com o SELECT quebrado ele dizia "Nenhuma fonte na biblioteca da marca".
   * Era falso: ninguém sabia quantas existiam. A projeção é do domínio e é a
   * MESMA que o painel usa — duas leituras do mesmo fato divergem, e já
   * divergiram antes nesta tela.
   */
  const vista = summarizeRadarVideoLibrary({ sources, articleId, ...leitura });
  const status = vista.state === "READ_FAILED" ? "Erro de leitura"
    : vista.state === "LOADING" ? "Lendo"
    : vista.state === "NOT_READ" ? "Não lida"
    : !vista.counts.live ? "Não utilizado"
    : vista.counts.textReady === vista.counts.live ? "Texto pronto"
    : vista.counts.processing ? "Processando"
    : "Aguardando extração";

  return {
    lines: [vista.headline, vista.detail || (vista.state === "READ_OK" ? "Entrada deliberada, sem SERP" : "")],
    status,
    tone: vista.tone,
  };
}

function AreaCard({ area, copy, expanded, onToggle }: { area: RadarR3Area; copy: { lines: string[]; status: string; tone: StatusTone }; expanded: boolean; onToggle: () => void }) {
  const Icon = areaIcon[area];
  return <button type="button" data-testid={`radar-r3-card-${area}`} aria-controls={`radar-r3-panel-${area}`} aria-expanded={expanded} onClick={onToggle} className={`min-w-0 rounded-md border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${expanded ? "border-context-accent bg-selected" : "border-divider bg-surface-subtle hover:border-module-accent/40"}`}>
    <span className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><Icon className={`h-4 w-4 shrink-0 ${expanded ? "text-context-accent" : "text-text-muted"}`} aria-hidden="true" /><span className="text-sm font-semibold text-foreground">{areaLabel[area]}</span></span><ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></span>
    {copy.lines.map((linha, index) => <span key={index} className={`mt-1 block truncate text-sm leading-5 ${index === 0 ? "text-foreground" : "text-text-muted"}`}>{linha}</span>)}
    <StatusMark tone={copy.tone}>{copy.status}</StatusMark>
  </button>;
}

function DisabledAreaCard({ area }: { area: RadarR3Area }) {
  const Icon = areaIcon[area];
  return <button type="button" disabled aria-disabled="true" data-testid={`radar-r3-card-${area}-disabled`} className="min-w-0 cursor-not-allowed rounded-md border border-divider bg-surface-subtle p-2.5 text-left">
    <span className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="text-sm font-semibold text-text-muted">{areaLabel[area]}</span></span><ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" /></span>
    <span className="mt-1 block text-sm text-text-muted" aria-hidden="true">&nbsp;</span>
    <span className="mt-2 block h-1.5 w-24 rounded-full bg-divider" aria-hidden="true" />
  </button>;
}

/**
 * A AÇÃO DA FASE 1 NA PRIMEIRA CAMADA, COM A PESQUISA RECOLHIDA.
 *
 * Mesma autoridade, mesmo mapa de handler, mesmo rótulo. O que muda é só o
 * lugar: aqui ela existe para quem ainda não abriu a área. Finalizada, a ação
 * é `NONE` e nada é renderizado — botão morto convida ao clique e não faz nada.
 */
/**
 * A AÇÃO PRIMÁRIA E A EXPLICAÇÃO AO LADO — §8 e §10.
 *
 * Um componente só porque o botão tem dois lugares de render: dentro da área
 * Pesquisa e no slot da primeira camada, que é o que aparece quando qualquer
 * outra área está aberta. Duas cópias do rótulo e do ⓘ divergiriam, e foi
 * justamente fora da área Pesquisa que o botão deixou de dizer o que fazia.
 *
 * O tooltip carrega EXPLICAÇÃO. `blockedReason` e `hint` continuam no texto
 * visível ao lado, nunca escondidos atrás do ⓘ.
 */
function Phase1Button({ acao, busy, onTrigger }: { acao: RadarPhase1Action; busy: boolean; onTrigger: () => void }) {
  return <span className="inline-flex items-center gap-1.5">
    <button type="button" data-testid="radar-deep-research-button" data-action-id={acao.id} className={primaryButton} disabled={!acao.enabled || busy} onClick={onTrigger} title={acao.blockedReason || undefined}>{acao.label}</button>
    {acao.info && <InfoHint title={acao.label} description={acao.info} side="top" align="end" />}
  </span>;
}

/**
 * RECUPERAR NÃO GASTA — e por isso não disputa com a ação primária.
 *
 * Uma coleta real pode ter sido paga, ter voltado do provider e nunca ter
 * chegado ao estado do navegador. Nesse caso "Não iniciado" é verdade sobre a
 * tela e mentira sobre o banco, e o único caminho oferecido era pagar de novo.
 *
 * Discreta como "Zerar investigação": é ação de bancada, não a decisão do dia.
 * Só aparece no estado em que a perda é possível.
 */
function RecoverSerpAction({ view, busy, onRecover }: { view: RadarDeepResearchView; busy: boolean; onRecover?: () => void }) {
  if (!onRecover || view.state !== "NOT_STARTED") return null;
  return <span className="inline-flex items-center gap-1.5">
    <button type="button" data-testid="radar-recover-serp" className="inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={onRecover}>Recuperar pesquisa já paga</button>
    <InfoHint title="Recuperar pesquisa já paga" description="Pergunta ao banco se já existe uma coleta real gravada para este artigo e a traz de volta para a tela. É uma leitura: nenhuma consulta nova é feita ao provider e nada é cobrado. Use quando uma pesquisa tiver sido executada e a tela continuar dizendo que não foi iniciada." side="top" align="end" />
  </span>;
}

function Phase1Slot({ view, busy, onStart, onAnalyze, onFinalize, onRecover }: {
  view: RadarDeepResearchView; busy: boolean;
  onStart?: () => void; onAnalyze?: () => void; onFinalize?: () => void; onRecover?: () => void;
}) {
  const acao = view.phase1;
  /* Booleano, não o elemento: um JSX que renderiza `null` continua sendo truthy. */
  const podeRecuperar = Boolean(onRecover) && view.state === "NOT_STARTED";
  if (acao.id === "NONE" && !podeRecuperar) return null;
  const disparar = () => {
    const handler = RADAR_PHASE1_HANDLER[acao.id];
    if (handler === "START") return onStart?.();
    if (handler === "ANALYZE") return onAnalyze?.();
    if (handler === "FINALIZE") return onFinalize?.();
  };
  return <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-divider pt-3" data-testid="radar-phase1-slot">
    {(acao.blockedReason || acao.hint) && <p className="mr-auto max-w-3xl text-sm leading-6 text-text-muted">{acao.blockedReason || acao.hint}</p>}
    <RecoverSerpAction view={view} busy={busy} onRecover={onRecover} />
    {acao.id !== "NONE" && <Phase1Button acao={acao} busy={busy} onTrigger={disparar} />}
  </div>;
}

/**
 * O ARTIGO INVESTIGADO — faixa de contexto, não área de trabalho.
 *
 * "Conteúdo" ocupava um quarto da primeira camada para exibir um fundamento
 * que ninguém edita aqui. Fundamento não é etapa: ele é o que está sendo
 * investigado, e precisa estar visível o tempo todo — em uma linha, não em um
 * card. Os fundamentos completos continuam inteiros, a um clique.
 *
 * READ_ONLY por construção: esta faixa não recebe nenhum handler.
 */
function ArticleContextBand({ model }: { model: RadarR3Model }) {
  const resumo = model.researchContext ? buildRadarArticleDnaSummary(model.researchContext) : null;
  const partes = resumo
    ? [
      resumo.principal,
      resumo.silo,
      resumo.role,
      resumo.intent,
      resumo.funnel,
      `${resumo.keywordCount} keyword(s)`,
    ].filter((item): item is string => Boolean(item))
    : [model.keyword, model.silo, model.hierarchy].filter((item): item is string => Boolean(item));

  return <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="radar-article-context-band">
    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">ArticleDNA</span>
    <span className="text-foreground">{model.articleDnaVersion}</span>
    <span className="text-text-muted">·</span>
    <span className="text-keyword">{resumo?.principal || model.keyword || "principal não resolvida"}</span>
    {partes.slice(1).map(parte => <span key={parte} className="text-text-muted">· {parte}</span>)}
    {resumo && !resumo.complete && <span className="text-warning">· contexto parcial</span>}
    {model.researchContext && <details className="w-full" data-testid="radar-article-foundations-details">
      <summary className="cursor-pointer text-sm text-context-accent">Ver fundamentos do Article</summary>
      <div className="mt-2.5">
        <RadarR3ContentDossier model={model.content} editorialContext={model.editorialContext} researchContext={model.researchContext} />
      </div>
    </details>}
  </div>;
}

/**
 * O RELATÓRIO RESPONDE PERGUNTAS.
 *
 * "Prévia gerada · 34 necessidades" é verdade e não informa. Cada linha aqui é
 * uma pergunta fechada com a resposta e o porquê — e o que está em aberto é
 * nomeado em vez de virar um número solto.
 */
function ReportSummaryPanel({ model }: { model: RadarR3Model }) {
  if (!model.deepResearch) return null;
  const materiais = model.r4?.existingContent || [];
  const resumo = buildRadarReportSummary({
    observed: model.deepResearch.observed,
    view: model.deepResearch,
    videos: { registered: materiais.filter(item => item.state !== "IGNORED_FOR_ARTICLE").length, transcribed: 0 },
  });
  return <section className="rounded-md border border-divider bg-surface p-3" data-testid="radar-report-summary">
    <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {resumo.checks.map(check => <div key={check.id} className="rounded-md border border-divider bg-surface-subtle p-2.5">
        <dt className="text-sm font-medium text-foreground">{check.question}</dt>
        <dd className={`mt-1 text-sm ${toneText[radarReportCheckTone(check.state)]}`}>{check.state === "READY" ? "Sim" : check.state === "PARTIAL" ? "Parcialmente" : check.state === "NOT_REQUIRED" ? "Não se aplica" : "Ainda não"}</dd>
        <dd className="mt-1 text-sm leading-6 text-text-muted">{check.detail}</dd>
      </div>)}
    </dl>
    {resumo.blockers.length > 0 && <div className="mt-3" data-testid="radar-report-blockers">
      <h3 className="text-sm font-semibold text-foreground">Em aberto</h3>
      <ul className="mt-1 space-y-1 text-sm leading-6 text-text-muted">{resumo.blockers.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}
  </section>;
}

export function RadarR3Workbench({ videoSources, onRegisterVideoSources, onExtractVideoText, onFetchVideoMetadata, onProvideVideoTranscript, onUploadVideoMedia, onLibraryAction, articleId = null, onReloadLibrary, onRunMatching, model, refreshing, reviewingSerp = false, serpAction = null, onAnalyzeSerpSelection, onTopicChange, onTopicRemove, onTopicMove, onTopicAdd, onTopicReview, onTopicUndo, onTopicRedo, canUndoTopics = false, canRedoTopics = false, onTopicAdjacent, topicQueuePosition, topicQueueTotal, onReportReview, onReportApprove, onReportGenerate, onStartDeepResearch, onRecoverSerp, onFinalizeInvestigation, onResetInvestigation, searchMode = RADAR_DEFAULT_SEARCH_MODE, onSearchModeChange, onAmazonStateChange, expertContext, onExpertEvidenceChange }: RadarR3WorkbenchProps) {
  const [expandedArea, setExpandedArea] = useState<RadarR3Area | null>(null);

  /*
   * DUAS CAMADAS, E SÓ UMA DEPENDE DO ARTIGO — §2.3.2.
   *
   * A biblioteca é da MARCA: ela é montada aqui fora, antes de qualquer decisão
   * sobre haver artigo. A pauta de apoio é do ARTIGO e só aparece quando existe
   * investigação — a ausência dela não leva a biblioteca junto.
   */
  const areaDeVideos = <div className="space-y-3">
    <RadarR3VideosPanel articleId={articleId} videoSources={videoSources} onRegisterVideoSources={onRegisterVideoSources} onExtractVideoText={onExtractVideoText} onFetchVideoMetadata={onFetchVideoMetadata} onProvideVideoTranscript={onProvideVideoTranscript} onUploadVideoMedia={onUploadVideoMedia} onLibraryAction={onLibraryAction} onReloadLibrary={onReloadLibrary} onRunMatching={onRunMatching} />
    {/*
      * A PAUTA RECOLHEU — VIDEOS 3.1 · §1 e §3.
      *
      * O bloco aberto no topo estava certo no conteúdo e errado no espaço:
      * empurrava a biblioteca, a seleção e o casamento para baixo da dobra, e
      * repetia logo abaixo as mesmas quatro pautas. Quem abre a área Vídeos
      * quer escolher fontes; a pauta é consulta.
      *
      * `<details>` e não estado de React: recolher não é decisão a guardar.
      * Sem `open`, sem efeito, sem storage — ele nasce fechado a cada montagem,
      * e o F5 não tem o que restaurar. Abrir e fechar não toca em nada.
      *
      * A lista vem de `videoSources.briefs`, que é o snapshot congelado. O
      * `model.deepResearch.blueprint.videoBriefs` saiu daqui: era a segunda
      * leitura da mesma pauta, e divergia da de baixo depois do congelamento.
      */}
    {(videoSources?.briefs.length || 0) > 0 && <details className="rounded-md border border-divider bg-surface p-3" data-testid="radar-videos-brief-panel">
      <summary className="cursor-pointer text-sm font-semibold text-context-accent">
        Pautas audiovisuais da investigação · {videoSources!.briefs.length}
      </summary>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">Onde um vídeo enriquece a narrativa deste artigo, segundo a investigação congelada.</p>
      <div className="mt-2.5"><RadarVideoBriefList briefs={videoSources!.briefs} /></div>
    </details>}
  </div>;
  const copyDeVideos = resumoDaBiblioteca(videoSources?.sources || [], articleId, {
    loading: videoSources?.loading,
    error: videoSources?.error,
    readbackConfirmed: videoSources?.readbackConfirmed,
  });


  /*
   * SEM ARTIGO, A MARCA CONTINUA TENDO BIBLIOTECA — §2.3.2.
   *
   * Este retorno antecipado desabilitava as QUATRO áreas, e foi ele que tornou
   * a biblioteca inalcançável sem artigo selecionado: o painel sequer chegava a
   * existir. Agora as três áreas do artigo continuam desabilitadas — elas
   * dependem mesmo de um — e Vídeos permanece de pé.
   */
  if (!model) return <section className="shrink-0 border-b border-divider bg-surface px-4 py-4 lg:px-6 lg:py-8" aria-label="Radar Workbench R4" data-testid="radar-r3-workbench-empty"><div className="mx-auto max-w-[1800px]">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-module-accent">Radar Workbench</p>
    <p className="mt-1 text-sm text-foreground">Selecione um artigo para trabalhar — a biblioteca de vídeos da marca está disponível sem isso.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{RADAR_R3_AREAS.map(area => area === "videos"
      ? <AreaCard key={area} area={area} copy={copyDeVideos} expanded={expandedArea === "videos"} onToggle={() => setExpandedArea(current => current === "videos" ? null : "videos")} />
      : <DisabledAreaCard key={area} area={area} />)}</div>
    <div id={expandedArea === "videos" ? "radar-r3-panel-videos" : undefined} className="mt-3">{expandedArea === "videos" && areaDeVideos}</div>
  </div></section>;

  return <section className="shrink-0 border-b border-divider bg-surface px-4 py-3 lg:px-6 lg:py-4" aria-label="Radar Workbench R4" data-testid="radar-r3-workbench"><div className="mx-auto max-w-[1800px]">
    {/*
      * DUAS LINHAS VIRARAM UMA.
      *
      * "Radar Workbench" sobre "Trabalhando em" sobre o título dizia três vezes
      * onde a pessoa está. O rótulo da área usa `context-accent` — ele informa;
      * `module-accent` é feedback de ponteiro e não pinta conteúdo.
      */}
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-context-accent">Radar</p>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">{model.title}</h1>
    </header>
    <ArticleContextBand model={model} />
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{RADAR_R3_AREAS.map(area => <AreaCard key={area} area={area} copy={area === "videos" ? copyDeVideos : areaCopy(area, model, searchMode)} expanded={expandedArea === area} onToggle={() => setExpandedArea(current => current === area ? null : area)} />)}</div>
    {/*
      * QUATRO ÁREAS, QUATRO DONOS — e nada operacional depois do switch.
      *
      * A investigação era montada fora daqui e reaparecia nas quatro áreas: quem
      * abria o Especialista via o seletor Google/YouTube/Amazon e o modelo
      * competitivo inteiro embaixo. Cada painel agora vive dentro da própria
      * área, e o que fica global é só o fundamento do artigo.
      */}
    <div id={expandedArea ? `radar-r3-panel-${expandedArea}` : undefined} className="mt-3">
      {/* A CAMADA DO ARTIGO REMONTA POR ARTIGO. A key saiu do Workbench inteiro — ela apagava a biblioteca da marca a cada troca — e ficou onde sempre pertenceu: nos painéis cujo rascunho é de um artigo só. */}
      {expandedArea === "pesquisa" && <div key={model.articleId} className="space-y-3">
        {model.deepResearch && <DeepResearch view={model.deepResearch} busy={refreshing || reviewingSerp || serpAction !== null} searchMode={searchMode} onSearchModeChange={onSearchModeChange} onStart={onStartDeepResearch} onAnalyze={onAnalyzeSerpSelection} onFinalize={onFinalizeInvestigation} onReset={onResetInvestigation} onRecover={onRecoverSerp} />}
        {/*
          * AMAZON NÃO É UM LUGAR SEPARADO — é um dos destinos da pesquisa.
          *
          * Enquanto a engine não existe, a decisão registrada sobre Amazon
          * continua acessível aqui dentro, no modo a que ela pertence.
          */}
        {/*
          * O DOSSIÊ EDITORIAL, DEPOIS DA INVESTIGAÇÃO.
          *
          * Os cards acima dizem o que o Radar encontrou; este bloco diz o que
          * fazer com o que foi encontrado. Ele só aparece quando existe amostra:
          * propor blocos narrativos sem evidência seria inventar estrutura.
          */}
        {model.deepResearch && model.deepResearch.blueprint.sections.length > 0
          && <RadarBlueprintSummaryCard blueprint={model.deepResearch.blueprint} />}
        {searchMode === "AMAZON" && <RadarR3AmazonPanel model={model.amazon} state={model.r4?.amazon} onStateChange={state => onAmazonStateChange?.(model.articleId, state)} />}
        {/*
          * O WORKFLOW LEGADO SAIU DAQUI — não foi escondido de novo.
          *
          * Este expansível guardava as seis abas do processo antigo inteiras e
          * operantes: Coleta, Concorrentes, Análise, Evidências, Revisão e
          * Histórico, com Aprovar SERP, Rejeitar SERP, Continuar para Análise,
          * Analisar páginas pendentes, checkboxes de curadoria e
          * classificadores manuais. Recolher não substituiu: criou uma segunda
          * autoridade de workflow, com mais botões que a primeira.
          *
          * O que fica é CONSULTA. Os dados continuam todos — concorrentes,
          * páginas, evidências, histórico — e nenhum deles governa o processo:
          * `RadarR3ResearchDetails` não recebe um único handler.
          */}
        {searchMode !== "AMAZON" && model.deepResearch && <details className="rounded-md border border-divider bg-surface p-3" data-testid="radar-research-details-disclosure">
          <summary className="cursor-pointer text-sm text-context-accent">Ver detalhes da pesquisa</summary>
          <div className="mt-2.5">
            <RadarR3ResearchDetails model={model} view={model.deepResearch} />
          </div>
        </details>}
      </div>}
      {expandedArea === "videos" && areaDeVideos}
      {expandedArea === "especialista" && <div key={model.articleId} className="space-y-3">
        {/*
          * §15 — A PAUTA CHEGA SOZINHA, E PREPARADO NÃO É ENVIADO.
          *
          * Os pontos que a investigação preparou aparecem aqui sem ninguém
          * copiar nada. Nenhum pedido saiu: o envio é outra decisão.
          */}
        {model.deepResearch && <section className="rounded-md border border-divider bg-surface p-3" aria-label="Pauta do especialista do Radar" data-testid="radar-specialist-brief-panel">
          <h3 className="text-base font-semibold text-foreground">Revisão necessária</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">O que a investigação precisa que um profissional esclareça, com o contexto já reunido.</p>
          <div className="mt-2.5"><RadarSpecialistBriefList briefs={model.deepResearch.blueprint.specialistBriefs} /></div>
        </section>}
        <RadarR3SpecialistPanel model={model} expertContext={expertContext} onExpertEvidenceChange={onExpertEvidenceChange} onTopicChange={onTopicChange} onTopicRemove={onTopicRemove} onTopicMove={onTopicMove} onTopicAdd={onTopicAdd} onTopicReview={onTopicReview} onTopicUndo={onTopicUndo} onTopicRedo={onTopicRedo} canUndoTopics={canUndoTopics} canRedoTopics={canRedoTopics} onTopicAdjacent={onTopicAdjacent} topicQueuePosition={topicQueuePosition} topicQueueTotal={topicQueueTotal} />
      </div>}
      {expandedArea === "relatorio" && <div key={model.articleId} className="space-y-3">
        <ReportSummaryPanel model={model} />
        <RadarR6ReportPanel report={model.r6Report} canonicalApproved={model.report.approved} onGenerate={onReportGenerate} onReview={onReportReview} onApprove={onReportApprove} />
      </div>}
    </div>
    {/*
      * A AÇÃO PRIMÁRIA NÃO PODE DEPENDER DE ABRIR UM CARD.
      *
      * Quando a investigação passou a viver dentro da área Pesquisa, o botão
      * foi junto — e com os quatro cards recolhidos não sobrava ação nenhuma
      * na primeira camada. Quem abre o Radar veria o estado e não teria o que
      * clicar.
      *
      * Este slot repõe a MESMA ação, resolvida pela MESMA autoridade da Fase 1.
      * Ele some quando a Pesquisa está aberta, porque lá dentro ela já existe:
      * dois botões para a mesma decisão foi o problema que a composição
      * anterior criou.
      */}
    {expandedArea !== "pesquisa" && model.deepResearch && <Phase1Slot
      view={model.deepResearch}
      busy={refreshing || reviewingSerp || serpAction !== null}
      onStart={onStartDeepResearch}
      onRecover={onRecoverSerp}
      onAnalyze={onAnalyzeSerpSelection}
      onFinalize={onFinalizeInvestigation}
    />}
    {expandedArea !== "pesquisa" && !model.deepResearch && <ResearchUnavailable model={model} />}
  </div></section>;
}
