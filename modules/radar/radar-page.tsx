"use client";
import { loadStateSummary } from "@/lib/editorial/partial-read";

import { loadInternalLinkGraphs } from "@/lib/arquiteto/internal-link-graph-persistence";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { CheckCircle2, Columns3, Download, Plus, XCircle } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { OperationalDataGrid, type OperationalDataGridTopbarApi, type OperationalGridBulkSelectionChange, type OperationalGridColumn } from "@/components/editorial/operational-data-grid";
import { DataOriginBadge, ProviderNotConfiguredState } from "@/components/editorial/pipeline-ui";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { approvedArticleVersions, type RadarItem } from "@/lib/editorial/operational-flow";
import type { VersionEnvelope, ArticleDNA } from "@/lib/arquiteto/contracts";
import type { RadarAnalysisPayload, RadarAnalysisVersion, RadarExpertEvidence, RadarExtractionPage } from "@/lib/radar/analysis-contracts";
import { buildRadarBenchmark, createRadarAnalysisSuccessor, createRadarAnalysisVersion, RadarExtractionPageSchema, suggestRadarAnalysisMode } from "@/lib/radar/analysis-contracts";
import { resolvePrimaryKeyword } from "@/lib/radar/keyword-resolver";
import { buildRadarArchitectHref, buildRadarArticleHref, radarCanonicalRouteKey } from "@/lib/radar/route-resolution";
import { buildRadarSerpView } from "@/lib/radar/snapshot-view";
import { buildRadarSerpCurationSummary, buildRadarSerpSelectionProjection, radarAnalysisCandidates, radarAnalysisMatchesSerp, radarOrganicDecisionKey, radarOrganicRenderKey, radarSerpApprovalBlockReason, radarSerpApprovalIssues, selectedRadarOrganicDecisionKeys, type RadarSerpSelectionScope } from "@/lib/radar/serp-curation";
import { buildRadarCompetitiveReport } from "@/lib/radar/competitive-report";
import { RADAR_INTENT_NOT_CONCLUDED, radarDeclaredArticleIntent, radarObservedGapsForArticle } from "@/lib/radar/editorial-identity";
import { buildRadarEditorialContext, radarPrincipalHydrated } from "@/lib/radar/editorial-context";
import { buildRadarArticleResearchContext } from "@/lib/radar/article-research-context";
import { buildRadarDeepResearchView } from "@/lib/radar/deep-research-view";
import type { SerpResearchSnapshot } from "@/lib/radar/serp/contracts";
import { startRadarDeepResearch, settleRadarDeepResearchQuery, finalizeRadarDeepResearch, radarQueryEvidenceFrom, type RadarDeepResearchRecord } from "@/lib/radar/deep-research";
import { radarCanonicalReusePlan, radarResearchResumption } from "@/lib/radar/research-resumption";
import { radarResumableRemoteAnalysis, radarUnconfirmedClaimsNotice, type RadarRemoteOnlyClaim } from "@/lib/radar/remote-authority";
import { freezeRadarEvidenceBundle } from "@/lib/radar/investigation-finalization";
import { radarActionOutcome, radarClaimAction, type RadarOperationalActionId } from "@/lib/radar/operational-actions";
import { radarSufficiencyLabel } from "@/lib/radar/investigation-sufficiency";
import { buildRadarResearchCuration, type RadarResearchDecision } from "@/lib/radar/research-curation";
import { radarNormalizedUrl } from "@/lib/radar/research-reference";
import { buildRadarResetPayload, radarResetDecision, radarResetLabel, radarResetSummary } from "@/lib/radar/radar-reset";
import { buildRadarAutomaticResearchCuration } from "@/lib/radar/research-auto-selection";
import { RADAR_EXTRACTION_MAX_ATTEMPTS, radarExtractionFailureIsRecoverable } from "@/lib/radar/extraction-retry";
import { radarPhase1NextAction } from "@/lib/radar/serp-phase1";
import { RADAR_DEFAULT_SEARCH_MODE, radarSearchModeLabel, type RadarPrimarySearchMode } from "@/lib/radar/search-mode";
import { buildRadarArticleDnaSummary, buildRadarReportSummary, buildRadarResearchCardSummary, buildRadarSpecialistSummary, radarSpecialistCell, RADAR_OPERATIONAL_STATUS_LABEL, RADAR_OPERATIONAL_STATUS_ORDER, radarOperationalRow, type RadarOperationalTone } from "@/lib/radar/operational-view";
import { radarExtractionBatches, radarExtractionErrorMessage } from "@/lib/radar/extraction-request";
import { buildRadarAnalysisMembership } from "@/lib/radar/analysis-membership";
import { buildRadarSourceVerificationPlan } from "@/lib/radar/source-authority";
import { buildRadarEvidenceClaims } from "@/lib/radar/claim-evidence";
import { radarSourceVerificationBatches, radarSourceVerificationErrorMessage } from "@/lib/radar/source-verification-request";
import { buildRadarExternalSourceResearch } from "@/lib/radar/link-and-source-research";
import { buildRadarSemanticConceptModel } from "@/lib/radar/semantic-concept-model";
import { buildRadarWorkbenchStages, resolveRadarWorkbenchArticleId, summarizeRadarReferenceCounts, type RadarAdditionalEvidenceState } from "@/lib/radar/workbench";
import { clearSelection, createRadarSpreadsheetSelection, selectAndActivateArticle, selectVisibleArticles, setArticleSelection, type RadarSpreadsheetSelectionState } from "@/lib/radar/spreadsheet-selection";
import { buildRadarR3Model, type RadarR3Model } from "@/lib/radar/r3-workbench";
import type { RadarVideoSourceInputVerdict, RadarVideoSourceText } from "@/lib/radar/video-source";
import type { RadarLibrarySource } from "@/lib/radar/video-library";
import type { RadarBriefCoverage } from "@/lib/radar/video-brief-matching";
import { availableBulkActions, createRadarR4LocalArticleState, createRadarR4SerpQueue, nextActionForRadarR4Article, radarR4SpecialistStatusLabel, removeRadarR4Topic, moveRadarR4Topic, updateRadarR4Topic, updateRadarR4SerpQueueItem, type RadarR4AmazonState, type RadarR4BulkArticleSnapshot, type RadarR4BulkOperation, type RadarR4ExistingContentKind, type RadarR4ExistingContentState, type RadarR4LocalArticleState, type RadarR4SerpQueue, type RadarR4Topic } from "@/lib/radar/r4-queue";
import { areRadarR5TopicsReviewed, classifyRadarR5SerpFailure, deriveRadarR5PersistedSerpState, latestRadarR5SerpRecord, topicSuggestionsToRadarTopics } from "@/lib/radar/r5-sequential";
import { deriveRadarSerpReviewState } from "@/lib/radar/serp-review-state";
import { buildExpertTopicContext, buildRadarR6ConsolidatedReport, normalizeRadarR6ReportState, radarR6CanApproveReport, radarR6TopicReviewCounts, radarR6ReportStateLabel, type RadarR6ExpertEvidenceInput, type RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import { parseRadarR7TopicResponse, preserveRadarR7TopicsOnFailure, radarR7ReportEvidenceFingerprint } from "@/lib/radar/r7-sequential";
import { approveRadarReport } from "@/lib/radar/report-approval";
import { buildRadarKgrStrategy } from "@/lib/radar/strategy-context";
import { classifyRadarSerpCollectionFailure, radarSerpCollectionAction, type RadarSerpCollectionState } from "@/lib/radar/serp-collection-state";
import { buildRadarInvestigationView } from "@/lib/radar/investigation-state";
import { ImportPanel, Field, card, btn, sessionId, useReadyPipeline } from "@/components/editorial/operational-screen-shared";
import { useNoticeBridge } from "@/components/global-notice-center";
import { RadarWorkbench } from "./radar-workbench";
import { RadarR3ProfileMirror } from "./radar-r3-profile-mirror";
import { RadarR4BulkOperationsBar, RadarR5QueueProgress, type RadarR5QueueView } from "./radar-r4-bulk-operations-bar";
import { useRadarAnalysisReadback } from "./use-radar-analysis-readback";
import { useRadarSerpReviewReadback } from "./use-radar-serp-review-readback";

type RadarR5TopicHistory = { past: RadarR4Topic[][]; future: RadarR4Topic[][] };
type RadarSerpAction = { articleId: string; kind: "start" | "decision" | "extract" };

/**
 * O vocabulário da tela traduzido para o das ações operacionais.
 *
 * `start` cobre coleta e curadoria; `extract` é a análise; `decision` é o que
 * escreve uma conclusão — finalizar, zerar, aprovar. O guarda de concorrência
 * é cego ao tipo: o que ele impede é DUAS operações ao mesmo tempo.
 */
const RADAR_SERP_ACTION_KIND: Record<RadarSerpAction["kind"], RadarOperationalActionId> = {
  start: "START",
  extract: "ANALYZE",
  decision: "FINALIZE",
};
type RadarSerpDecisionRole = "primary" | "support" | "format" | "excluded" | "pending";

function hostOf(value: string | null | undefined) {
  try { return value ? new URL(value).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { return ""; }
}

function decisionForSerpRole(role: RadarSerpDecisionRole) {
  return role === "excluded" ? { decision: "excluded" as const, reason: "Resultado SERP excluído pelo usuário." }
    : role === "pending" ? { decision: "pending" as const, reason: "" }
      : role === "support" ? { decision: "included" as const, reason: "Referência de apoio selecionada pelo usuário." }
        : role === "format" ? { decision: "included" as const, reason: "Referência de formato observada pelo usuário." }
          : { decision: "included" as const, reason: "Concorrente selecionado pelo usuário." };
}

function radarSelectionScope(row: Pick<RadarItem, "brandId" | "articleId" | "articleDnaVersionId">): RadarSerpSelectionScope {
  return { brandId: row.brandId, articleId: row.articleId, articleDnaVersionId: row.articleDnaVersionId };
}

/*
 * O TOM DO ESTADO NA PLANILHA — o mesmo vocabulário visual do Workbench.
 *
 * Cor forte só onde há significado: "Pesquisando" não é alerta e "Não
 * iniciado" não é erro. Pintar tudo tiraria o peso do único que precisa ser
 * visto de longe.
 */
const TOM_DA_LINHA: Record<RadarOperationalTone, string> = {
  neutral: "border-divider text-text-muted",
  info: "border-context-accent/50 text-context-accent",
  pending: "border-pending text-pending",
  success: "border-success/50 text-success",
  warning: "border-warning text-warning",
};

export function RadarPage({ brandRef }: { brandRef: string }) {
  const { data: session } = useSession(); const router = useRouter(); const { selectedBrandId } = useBrand(); const { pipeline, state } = useReadyPipeline(); const [picker, setPicker] = useState(false); const [notice, setNotice] = useState(""); const [busyArticleId, setBusyArticleId] = useState<string | null>(null); const [reviewingArticleId, setReviewingArticleId] = useState<string | null>(null); const [serpAction, setSerpAction] = useState<RadarSerpAction | null>(null); const serpActionRef = useRef<RadarSerpAction | null>(null); const reviewingArticleIdRef = useRef<string | null>(null); const [expandedRadarId, setExpandedRadarId] = useState<string | null>(null); const [spreadsheetSelection, setSpreadsheetSelection] = useState(createRadarSpreadsheetSelection); const { activeArticleId, selectedArticleIds } = spreadsheetSelection; const [r4LocalByArticle, setR4LocalByArticle] = useState<Record<string, RadarR4LocalArticleState>>({}); const [r4SerpQueue, setR4SerpQueue] = useState<RadarR4SerpQueue | null>(null); const [topicHistoryByArticle, setTopicHistoryByArticle] = useState<Record<string, RadarR5TopicHistory>>({}); const [expertEvidenceByArticle, setExpertEvidenceByArticle] = useState<Record<string, RadarR6ExpertEvidenceInput[]>>({}); const [canonicalExpertEvidenceByArticle, setCanonicalExpertEvidenceByArticle] = useState<Record<string, RadarExpertEvidence[]>>({}); const [expertContributionSummaryByArticle, setExpertContributionSummaryByArticle] = useState<Record<string, { contributionCount: number; pendingCount: number; blockedEvidenceCount: number; remote: true; articleDnaVersionId: string }>>({}); const approvingArticleIdRef = useRef<string | null>(null); const collectingArticleIdRef = useRef<string | null>(null); const generatingReportIdRef = useRef<string | null>(null); const [collectionByArticle, setCollectionByArticle] = useState<Record<string, { state: RadarSerpCollectionState; blockedReason: string | null }>>({});
  /*
   * AS FONTES DE VÍDEO SÃO REMOTAS — o dicionário abaixo é CACHE, não cópia.
   *
   * A autoridade é `radar_video_sources`. Este estado existe só para a tela
   * não reler a cada render; ele nasce vazio, é preenchido por leitura e nunca
   * é a única cópia de uma fonte registrada.
   */
  const [videoLibrary, setVideoLibrary] = useState<{
    sources: RadarLibrarySource[];
    texts: RadarVideoSourceText[];
    loading: boolean;
    saving: boolean;
    extracting: string | null;
    lastBatch: Array<{ raw: string; verdict: RadarVideoSourceInputVerdict; reason: string }> | null;
    error: string | null;
    readbackConfirmed: boolean;
    /** De qual artigo é a sobreposição de seleção já carregada. `null` = nenhuma. */
    overlayArticleId: string | null;
  }>({ sources: [], texts: [], loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: false, overlayArticleId: null });
  /**
   * UMA TENTATIVA POR CONTEXTO — §2.3.2, e é isto que mata o laço.
   *
   * O efeito antigo guardava-se por `readbackConfirmed`, e tinha o próprio
   * cache como dependência. No caminho de ERRO os dois viravam falso de novo,
   * o efeito redisparava, e a leitura entrava em laço — foi esse laço que o
   * USER viu como "tela piscando".
   *
   * A chave é marca + artigo: cada contexto é tentado UMA vez, dê certo ou não.
   * Repetir depois de falhar passa a ser decisão de quem opera, e existe um
   * botão para isso.
   */
  const bibliotecaTentada = useRef(new Set<string>());

  /**
   * O CASAMENTO GRAVADO — Gate 3.
   *
   * Separado do estado da BIBLIOTECA de propósito: o transcript é da marca e a
   * biblioteca é da marca; o recorte é do ARTIGO, e vive e morre com ele. Juntá-los
   * num objeto só faria trocar de artigo parecer que a biblioteca mudou.
   *
   * `coverage: null` significa "ainda não casado" — diferente de "casado e sem
   * trecho", que é uma resposta.
   */
  const [videoMatching, setVideoMatching] = useState<{
    articleId: string | null;
    coverage: RadarBriefCoverage[] | null;
    running: boolean;
    error: string | null;
  }>({ articleId: null, coverage: null, running: false, error: null });

  /*
   * O QUE A ÚLTIMA COLETA DEVOLVEU, PARA QUEM ENCADEIA.
   *
   * A pesquisa profunda coleta e, na sequência, cria a versão da curadoria. Ler
   * o estado derivado no mesmo tique traria o snapshot anterior; o registro da
   * chamada é a única fonte honesta nesse intervalo.
   */
  const ultimaColetaRef = useRef<{ articleId: string; research: SerpResearchSnapshot | null } | null>(null);
  /*
   * A PORTA DA PESQUISA INTEIRA — §6.
   *
   * `collectingArticleIdRef` fecha só a coleta canônica, e `serpActionRef` só a
   * gravação final. Entre as duas corre o laço das SERPs auxiliares, que são
   * vários awaits sem nenhum guarda: um segundo clique ali passava direto e
   * começava outra rodada paga em paralelo. Este ref cobre do primeiro clique
   * até o último `finally`.
   */
  const pesquisaEmVooRef = useRef<string | null>(null);
  /*
   * O RASCUNHO DA CURADORIA DA PESQUISA.
   *
   * Mesma disciplina da curadoria canônica: marcar é local, confirmar é que
   * grava. Um write por clique já produziu sete versões e sete avisos iguais.
   */
  const [researchDraftByArticle, setResearchDraftByArticle] = useState<Record<string, Record<string, { decision: RadarResearchDecision; reason?: string }>>>({});
  /* O modo da pesquisa principal, por artigo. Escolhido ANTES de iniciar. */
  const [searchModeByArticle, setSearchModeByArticle] = useState<Record<string, RadarPrimarySearchMode>>({});
  /*
   * O GUARDA DE CONCORRÊNCIA — decidido pelo domínio, aplicado aqui.
   *
   * A ref fecha a porta ANTES de qualquer `await`: estado de render chega tarde
   * demais, e dois cliques rápidos produziriam duas coletas, dois snapshots e
   * dois avisos de sucesso. Quem decide se o segundo clique entra é
   * `radarClaimAction`, que é testável fora da tela.
   */
  const claimSerpAction = (next: RadarSerpAction) => {
    const atual = serpActionRef.current || serpAction;
    const decisao = radarClaimAction(
      atual ? { articleId: atual.articleId, action: RADAR_SERP_ACTION_KIND[atual.kind] } : null,
      { articleId: next.articleId, action: RADAR_SERP_ACTION_KIND[next.kind] },
    );
    if (!decisao.granted) { setNotice(decisao.refusal || "Outra ação ainda está em andamento."); return false; }
    serpActionRef.current = next; setSerpAction(next); return true;
  };
  const releaseSerpAction = (articleId: string, kind: RadarSerpAction["kind"]) => { if (serpActionRef.current?.articleId === articleId && serpActionRef.current.kind === kind) serpActionRef.current = null; setSerpAction(current => current?.articleId === articleId && current.kind === kind ? null : current); };
  const applySpreadsheetSelection = useCallback((transition: (current: RadarSpreadsheetSelectionState) => RadarSpreadsheetSelectionState) => setSpreadsheetSelection(transition), []);
  const selectAndActivate = useCallback((articleId: string) => applySpreadsheetSelection(current => selectAndActivateArticle(current, articleId)), [applySpreadsheetSelection]);
  const handleBulkSelectionChange = useCallback((_rowIds: string[], change: OperationalGridBulkSelectionChange) => {
    if (change.kind === "clear" || (change.kind === "visible" && !change.checked)) return applySpreadsheetSelection(() => clearSelection());
    if (change.kind === "row") {
      const articleId = pipeline.radarItems.find(row => row.id === change.rowId)?.articleId;
      if (articleId) applySpreadsheetSelection(current => setArticleSelection(current, articleId, change.checked));
      return;
    }
    const visibleArticleIds = change.rowIds.flatMap(rowId => {
      const articleId = pipeline.radarItems.find(row => row.id === rowId)?.articleId;
      return articleId ? [articleId] : [];
    });
    applySpreadsheetSelection(current => selectVisibleArticles(current, visibleArticleIds));
  }, [applySpreadsheetSelection, pipeline.radarItems]);
  const handleRowActivate = useCallback((row: RadarItem) => { if ((serpActionRef.current && serpActionRef.current.articleId !== row.articleId) || (reviewingArticleIdRef.current && reviewingArticleIdRef.current !== row.articleId) || (serpAction && serpAction.articleId !== row.articleId) || (reviewingArticleId && reviewingArticleId !== row.articleId)) return; selectAndActivate(row.articleId); }, [reviewingArticleId, selectAndActivate, serpAction]);

  /* ================= as fontes de vídeo, lidas do servidor ================ */

  /**
   * LER NÃO É GRAVAR — §7 e §11.
   *
   * A LEITURA É POR MARCA — §2.3.2. `articleId` é opcional e só acrescenta a
   * camada de seleção daquele artigo; sem ele vem a biblioteca crua. Era a
   * exigência de artigo que impedia administrar o acervo sem abrir um.
   *
   * E ELA NUNCA ESVAZIA A LISTA. Trocar de artigo mantém as mesmas fontes na
   * tela e atualiza só os checkboxes: zerar `sources` enquanto a requisição
   * viaja apagava a biblioteca inteira por meio segundo a cada troca.
   */
  const loadVideoLibrary = useCallback(async (articleId: string | null) => {
    if (!selectedBrandId) return;
    setVideoLibrary(current => ({ ...current, loading: true, error: null }));
    try {
      const busca = new URLSearchParams({ brandId: selectedBrandId });
      if (articleId) busca.set("articleId", articleId);
      const resposta = await fetch(`/api/editorial/radar-video-sources?${busca.toString()}`);
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.success) throw new Error(corpo?.error || "Não foi possível ler a biblioteca de vídeos.");
      setVideoLibrary(current => ({
        ...current,
        sources: corpo.sources || [],
        texts: corpo.texts || current.texts,
        loading: false, saving: false, extracting: null,
        error: null, readbackConfirmed: true, overlayArticleId: articleId,
      }));
    } catch (error) {
      setVideoLibrary(current => ({
        ...current,
        loading: false, saving: false, extracting: null,
        error: error instanceof Error ? error.message : "Falha ao ler a biblioteca de vídeos.",
      }));
    }
  }, [selectedBrandId]);

  /** Repetir depois de uma falha é decisão de quem opera, não do efeito. */
  const reloadVideoLibrary = useCallback((articleId: string | null) => {
    if (!selectedBrandId) return;
    bibliotecaTentada.current.delete(`${selectedBrandId}:${articleId || ""}`);
    void loadVideoLibrary(articleId);
  }, [loadVideoLibrary, selectedBrandId]);

  /**
   * REGISTRAR — a única escrita desta área, e só no clique.
   *
   * O cliente manda o bloco CRU: a classificação, a deduplicação e a
   * normalização são do servidor, que confere contra o que está gravado. A tela
   * não é autoridade sobre o que já existe.
   *
   * SEM ARTIGO É FLUXO PRINCIPAL — §2.3.2. A fonte entra na biblioteca da marca
   * e nenhum vínculo de artigo é criado, aqui nem no servidor.
   *
   * Sucesso só depois do readback: a resposta traz a lista relida do banco, e é
   * ela que substitui o cache — nunca o que enviamos.
   */
  const registerVideoSources = useCallback(async (articleId: string | null, raw: string) => {
    if (!selectedBrandId || !raw.trim()) return;
    const item = articleId ? pipeline.radarItems.find(row => row.articleId === articleId) || null : null;
    setVideoLibrary(current => ({ ...current, saving: true, lastBatch: null, error: null }));
    try {
      const resposta = await fetch("/api/editorial/radar-video-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: selectedBrandId,
          articleId: articleId || null,
          raw,
          articleDnaVersionId: item?.articleDnaVersionId || null,
        }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.success) throw new Error(corpo?.error || "Não foi possível registrar as fontes de vídeo.");
      if (!corpo.readbackConfirmed) throw new Error("A gravação não foi confirmada pela releitura remota.");
      setVideoLibrary(current => ({
        ...current,
        sources: corpo.sources || [],
        texts: corpo.texts || current.texts,
        loading: false, saving: false, extracting: null,
        lastBatch: corpo.entries || [], error: null, readbackConfirmed: true, overlayArticleId: articleId,
      }));
    } catch (error) {
      setVideoLibrary(current => ({
        ...current,
        saving: false, lastBatch: null,
        error: error instanceof Error ? error.message : "Falha ao registrar as fontes de vídeo.",
      }));
    }
  }, [pipeline.radarItems, selectedBrandId]);


  /**
   * EXTRAIR TEXTO — a única ação de processamento desta área, e só no clique.
   *
   * Enfileira e relê. O provider não é chamado daqui nem do navegador: quem
   * executa é o Local Worker. Um segundo clique encontra o job do primeiro,
   * porque quem recusa a duplicata é o índice único do banco.
   */
  const extractVideoText = useCallback(async (articleId: string | null, videoSourceId: string) => {
    if (!selectedBrandId) return;
    setVideoLibrary(current => ({ ...current, extracting: videoSourceId, error: null }));
    try {
      const resposta = await fetch("/api/editorial/radar-video-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, articleId: articleId || null, videoSourceId }),
      });
      const corpo = await resposta.json();
      if (!corpo?.success) throw new Error(corpo?.error || "Não foi possível enfileirar a extração.");
    } catch (error) {
      setVideoLibrary(current => ({ ...current, extracting: null, error: error instanceof Error ? error.message : "Falha ao enfileirar a extração." }));
      return;
    }
    /* O estado vem do servidor, sempre: a releitura é a confirmação. */
    await loadVideoLibrary(articleId);
  }, [loadVideoLibrary, selectedBrandId]);


  /**
   * OBTER METADADOS PÚBLICOS — ação explícita, e só ela.
   *
   * É o que a YouTube Data API alcança com a credencial atual. NÃO inicia
   * transcrição, não cria job e não roda no F5.
   */
  const fetchVideoMetadata = useCallback(async (articleId: string | null, videoSourceId: string) => {
    if (!selectedBrandId) return;
    try {
      const resposta = await fetch("/api/editorial/radar-video-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, articleId: articleId || null, videoSourceId }),
      });
      const corpo = await resposta.json();
      if (!corpo?.success) throw new Error(corpo?.error || "Não foi possível obter os metadados.");
    } catch (error) {
      setVideoLibrary(current => ({ ...current, error: error instanceof Error ? error.message : "Falha ao obter os metadados." }));
      return;
    }
    await loadVideoLibrary(articleId);
  }, [loadVideoLibrary, selectedBrandId]);

  /**
   * INFORMAR A TRANSCRIÇÃO — o caminho legítimo quando a marca já a tem.
   *
   * A proveniência fica registrada como `USER_PROVIDED_TRANSCRIPT`: não se
   * finge que o texto veio da API. O original é preservado como veio, sem
   * normalização nem resumo.
   */
  const provideVideoTranscript = useCallback(async (articleId: string | null, videoSourceId: string, transcript: string) => {
    if (!selectedBrandId || !transcript.trim()) return;
    try {
      const resposta = await fetch("/api/editorial/radar-video-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, articleId: articleId || null, videoSourceId, providedTranscript: transcript }),
      });
      const corpo = await resposta.json();
      if (!corpo?.success) throw new Error(corpo?.error || "Não foi possível preservar a transcrição.");
    } catch (error) {
      setVideoLibrary(current => ({ ...current, error: error instanceof Error ? error.message : "Falha ao preservar a transcrição." }));
      return;
    }
    await loadVideoLibrary(articleId);
  }, [loadVideoLibrary, selectedBrandId]);


  /**
   * ENVIAR ÁUDIO — o arquivo vai ao Storage durável e a extração entra na fila.
   *
   * `FormData` porque é um arquivo: nada é lido no navegador além do que o
   * próprio `input` entrega, e nenhum provider é chamado daqui. Quem transcreve
   * é o Local Worker.
   */
  const uploadVideoMedia = useCallback(async (articleId: string | null, videoSourceId: string, file: File) => {
    if (!selectedBrandId) return;
    setVideoLibrary(current => ({ ...current, extracting: videoSourceId, error: null }));
    try {
      const corpoEnvio = new FormData();
      corpoEnvio.set("brandId", selectedBrandId);
      if (articleId) corpoEnvio.set("articleId", articleId);
      corpoEnvio.set("videoSourceId", videoSourceId);
      corpoEnvio.set("file", file);
      const resposta = await fetch("/api/editorial/radar-video-media", { method: "POST", body: corpoEnvio });
      const corpo = await resposta.json();
      if (!corpo?.success) throw new Error(corpo?.error || "Não foi possível enviar a mídia.");
    } catch (error) {
      setVideoLibrary(current => ({ ...current, extracting: null, error: error instanceof Error ? error.message : "Falha ao enviar a mídia." }));
      return;
    }
    await loadVideoLibrary(articleId);
  }, [loadVideoLibrary, selectedBrandId]);


  /**
   * AS AÇÕES DA BIBLIOTECA — seleção, processamento e arquivamento.
   *
   * TODAS por ação humana. Marcar um checkbox declara que o artigo usa a
   * fonte; não chama provider, não enfileira nada. Processar é outra ação, e
   * só alcança o que foi selecionado.
   *
   * DUAS CAMADAS — §2.3.2. `ARCHIVE` e `CLEAR_LIST` são da biblioteca e valem
   * sem artigo; `SELECT`, `UNSELECT` e `PROCESS_SELECTED` exigem um, e o
   * servidor recusa em voz alta quando ele não vem.
   *
   * A resposta traz a decisão POR ITEM: "arquivei quatro, mantive duas porque
   * sustentam evidência congelada" é uma resposta; "não foi possível" não é.
   */
  const runVideoLibraryAction = useCallback(async (
    articleId: string | null,
    action: "SELECT" | "UNSELECT" | "PROCESS_SELECTED" | "ARCHIVE" | "CLEAR_LIST",
    videoSourceIds: string[],
  ) => {
    if (!selectedBrandId) return;
    setVideoLibrary(current => ({ ...current, saving: true, error: null }));
    try {
      const resposta = await fetch("/api/editorial/radar-video-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, articleId: articleId || null, action, videoSourceIds }),
      });
      const corpo = await resposta.json();
      if (!corpo?.success) throw new Error(corpo?.error || "Não foi possível executar a ação da biblioteca.");
      if (corpo.summary) {
        const { archived, keptInUse, keptFrozen } = corpo.summary;
        const partes = [`${archived} arquivada(s)`];
        if (keptInUse) partes.push(`${keptInUse} mantida(s) por uso em outro artigo`);
        if (keptFrozen) partes.push(`${keptFrozen} mantida(s) por sustentarem evidência congelada`);
        setNotice(partes.join(" · "));
      }
      if (corpo.decisions && action === "PROCESS_SELECTED") {
        setNotice(`${corpo.enqueued} enfileirada(s) · ${corpo.reusedText} com texto reutilizado`);
      }
    } catch (error) {
      setVideoLibrary(current => ({ ...current, saving: false, error: error instanceof Error ? error.message : "Falha na ação da biblioteca." }));
      return;
    }
    /* O estado vem do servidor: a releitura é a confirmação. */
    await loadVideoLibrary(articleId);
  }, [loadVideoLibrary, selectedBrandId]);



  /**
   * CASAR PAUTAS COM O CONTEÚDO — ação humana, e a única que grava recorte.
   *
   * ZERO PROVIDER: o servidor lê transcript já gravado e pauta já congelada. A
   * resposta traz a cobertura RELIDA do banco, nunca a que foi calculada.
   */
  const runVideoMatching = useCallback(async (articleId: string | null) => {
    if (!selectedBrandId || !articleId) return;
    setVideoMatching(current => ({ ...current, articleId, running: true, error: null }));
    try {
      const resposta = await fetch("/api/editorial/radar-video-matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, articleId }),
      });
      const corpo = await resposta.json();
      if (!corpo?.success) throw new Error(corpo?.error || "Não foi possível casar as pautas com o conteúdo.");
      setVideoMatching({ articleId, coverage: corpo.coverage || [], running: false, error: null });
      const partes = [`${corpo.summary?.supported ?? 0} pauta(s) coberta(s)`, `${corpo.summary?.extracts ?? 0} trecho(s)`];
      if (corpo.reused) partes.push("nada mudou desde o último casamento");
      if (corpo.skippedWithoutText?.length) partes.push(`${corpo.skippedWithoutText.length} fonte(s) selecionada(s) ainda sem texto`);
      setNotice(partes.join(" · "));
    } catch (error) {
      setVideoMatching(current => ({ ...current, articleId, running: false, error: error instanceof Error ? error.message : "Falha ao casar pautas." }));
    }
  }, [selectedBrandId]);

  const handleExpandedChange = useCallback((id: string | null) => { const rowArticleId = id ? pipeline.radarItems.find(row => row.id === id)?.articleId : null; if ((serpActionRef.current && id && rowArticleId !== serpActionRef.current.articleId) || (reviewingArticleIdRef.current && id && rowArticleId !== reviewingArticleIdRef.current) || (serpAction && id && rowArticleId !== serpAction.articleId) || (reviewingArticleId && id && rowArticleId !== reviewingArticleId)) return; setExpandedRadarId(id); }, [pipeline.radarItems, reviewingArticleId, serpAction]);
  const handleExpertEvidenceChange = useCallback((articleId: string, evidence: RadarR6ExpertEvidenceInput[], summary: { contributionCount: number; pendingCount: number; blockedEvidenceCount: number; remote: true; canonicalEvidence: RadarExpertEvidence[]; articleDnaVersionId: string }) => { setExpertEvidenceByArticle(current => ({ ...current, [articleId]: evidence })); setCanonicalExpertEvidenceByArticle(current => ({ ...current, [articleId]: summary.canonicalEvidence })); setExpertContributionSummaryByArticle(current => ({ ...current, [articleId]: { contributionCount: summary.contributionCount, pendingCount: summary.pendingCount, blockedEvidenceCount: summary.blockedEvidenceCount, remote: true, articleDnaVersionId: summary.articleDnaVersionId } })); }, []);
  useNoticeBridge({ notice, module: "radar", area: "Radar", title: "Radar", fallbackSeverity: "INFO" });
  const radarReadbackScopeKey = useMemo(() => {
    if (!selectedBrandId) return null;
    const snapshots = pipeline.serpRecords
      .map(record => `${record.input.articleId}:${record.id}:${record.research?.version || 0}:${record.research?.contentHash || ""}`)
      .sort()
      .join("|");
    return `${selectedBrandId}:${snapshots}`;
  }, [pipeline.serpRecords, selectedBrandId]);
  useRadarAnalysisReadback({ scopeKey: radarReadbackScopeKey, enabled: Boolean(pipeline.snapshot), radarItems: pipeline.radarItems, reload: pipeline.reloadRadarAnalysis });
  useRadarSerpReviewReadback({ scopeKey: radarReadbackScopeKey, enabled: Boolean(pipeline.snapshot) && !pipeline.loading, radarItems: pipeline.radarItems, records: pipeline.serpRecords, reload: pipeline.reloadSerpReview });
  const historyValue = useMemo(() => ({ radarItems: pipeline.radarItems, serpRecords: pipeline.serpRecords, productEvidence: pipeline.productEvidence }), [pipeline.radarItems, pipeline.serpRecords, pipeline.productEvidence]);
  const history = useLocalHistory("radar", historyValue, snapshot => pipeline.restoreOperationalSnapshot("radar", snapshot), 30, selectedBrandId || "sem-marca");
  /*
   * A LEITURA DA BIBLIOTECA, AO ABRIR A MARCA — §2.3.2.
   *
   * É este efeito que faz a lista sobreviver ao F5: sem ele, a área voltaria a
   * depender do que estivesse em memória. Ele LÊ e só lê — nenhuma escrita,
   * nenhum provider, nenhum job.
   *
   * A CONDIÇÃO É A MARCA, NÃO O ARTIGO. Sem artigo selecionado a biblioteca
   * carrega igual; o artigo, quando existe, só acrescenta a camada de seleção.
   *
   * E o cache SAIU das dependências. Ele estava lá junto com uma guarda que o
   * caminho de erro reabria — leitura falha, `readbackConfirmed` volta a falso,
   * o efeito redispara, e assim indefinidamente. Era o laço que piscava a tela.
   */
  useEffect(() => {
    if (!selectedBrandId) return;
    /* O artigo é resolvido aqui dentro: `activeRadarItem` só existe depois do
     * retorno antecipado de carregamento, e um hook não pode ficar lá embaixo. */
    const articleId = resolveRadarWorkbenchArticleId({ selectedId: activeArticleId, rowIds: pipeline.radarItems.map(row => row.articleId) });
    const chave = `${selectedBrandId}:${articleId || ""}`;
    if (bibliotecaTentada.current.has(chave)) return;
    bibliotecaTentada.current.add(chave);
    void loadVideoLibrary(articleId);
  }, [activeArticleId, loadVideoLibrary, pipeline.radarItems, selectedBrandId]);

  if (state || !pipeline.snapshot) return state;
  const approved = approvedArticleVersions(pipeline.articleVersions, pipeline.versionEvents);
  const resolveRowKeyword = (row: RadarItem) => {
    const article = pipeline.articleVersions[row.articleId]?.payload;
    if (!article || !selectedBrandId) return { ok: false as const, keyword: "", message: "A keyword principal deste artigo não foi encontrada. Corrija o vínculo no Arquiteto antes de pesquisar a SERP." };
    const hydrated = (row.hydration?.keywordSnapshots || []).map(snapshot => ({ id: snapshot.canonicalKeywordId || snapshot.referenceKeywordId, keyword: snapshot.keyword, lista_id: snapshot.siloId, brandId: snapshot.brandId, aliases: [snapshot.referenceKeywordId, ...snapshot.aliases], sourceKeywordId: snapshot.sourceKeywordId, originalKeywordId: snapshot.originalKeywordId }));
    const databaseKeywords = pipeline.snapshot!.keywords.map(keyword => ({ ...keyword, brandId: selectedBrandId }));
    const resolved = resolvePrimaryKeyword({ brandId: selectedBrandId, article, keywords: [...hydrated, ...databaseKeywords], allowedSiloIds: [...new Set([row.siloId, ...pipeline.snapshot!.silos.map(silo => silo.id)].filter((id): id is string => Boolean(id)))] });
    return resolved.ok ? resolved : { ...resolved, keyword: "" };
  };
  const siloLabel = (row: RadarItem) => row.hydration?.silo?.name || pipeline.snapshot!.silos.find(silo => silo.id === row.siloId)?.nome || "Silo não hidratado";
  const latestSerp = (articleId: string) => latestRadarR5SerpRecord(pipeline.serpRecords, articleId);
  const localStateFor = (articleId: string) => {
    const local = r4LocalByArticle[articleId];
    if (local?.serp.state) return local;
    const persistedSerp = deriveRadarR5PersistedSerpState({ articleId, records: pipeline.serpRecords, reviews: pipeline.serpReviews });
    return local ? { ...local, serp: persistedSerp.state ? persistedSerp : local.serp } : { ...createRadarR4LocalArticleState(), serp: persistedSerp };
  };
  const updateLocalState = (articleId: string, update: (current: RadarR4LocalArticleState) => RadarR4LocalArticleState) => setR4LocalByArticle(current => ({ ...current, [articleId]: update(current[articleId] || createRadarR4LocalArticleState()) }));
  const rowWorkbenchData = (row: RadarItem) => {
    const record = latestSerp(row.articleId);
    const view = record ? buildRadarSerpView(record) : null;
    const records = [...pipeline.serpRecords.filter(item => item.input.articleId === row.articleId)].sort((a, b) => (a.research?.version || 0) - (b.research?.version || 0));
    const latestAnalysis = row.analysisVersions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
    const analysis = radarAnalysisMatchesSerp({ analysis: latestAnalysis, brandId: row.brandId, articleId: row.articleId, articleDnaVersionId: row.articleDnaVersionId, view }) ? latestAnalysis : null;
    const selectionProjection = buildRadarSerpSelectionProjection(view, analysis, radarSelectionScope(row));
    const reviewState = deriveRadarSerpReviewState({ reviews: pipeline.serpReviews, snapshotId: record?.id, selectedCompetitorIds: selectionProjection.rows.filter(selection => selection.role === "primary" || selection.role === "support").map(selection => selection.key) });
    const latestReview = reviewState.review;
    const selectionByKey = new Map(selectionProjection.rows.map(selection => [selection.key, selection]));
    const references = (view?.organicResults || []).map(result => {
      const selection = selectionByKey.get(radarOrganicDecisionKey(result));
      return { key: radarOrganicRenderKey(view?.record.id || "serp", result), position: result.position, title: result.title || "Resultado sem título", domain: result.domain || result.url, url: result.url, role: selection?.role || "pending", state: selection?.decision?.decision || "pending" };
    });
    const roles = references.map(reference => ({ role: reference.role }));
    const referenceCounts = summarizeRadarReferenceCounts(roles);
    const extractionPages = analysis?.payload.extractions || [];
    const extractionUrls = new Set(extractionPages.map(page => page.url));
    const analysisQueue = selectionProjection.rows.filter(selection => ["primary", "support"].includes(selection.role) && !extractionUrls.has(selection.result.url)).length;
    const localState = localStateFor(row.articleId);
    const legacyReportGenerated = Boolean(analysis?.payload.competitiveReport);
    const legacyReportApproved = analysis?.payload.status === "approved";
    const sentToPlanner = row.state === "sent_planner" || Boolean(analysis?.payload.plannerTransfer);
    const additionalEvidenceState: RadarAdditionalEvidenceState = analysis ? "not-started" : "not-needed";
    const referencesReviewed = Boolean(view?.organicResults.length) && referenceCounts.pending === 0;
    const article = pipeline.articleVersions[row.articleId];
    const publication = pipeline.operationalPublications.find(item => item.articleId === row.articleId);
    const publicationLabel = publication?.state === "published" ? "Publicado e protegido" : publication?.state ? publication.state : row.state === "sent_planner" ? "Enviado ao Planejador" : "Ainda não publicado";
    const serpStatus = !view ? "Não coletada" : record?.isMock ? "Simulada · não aprovável" : "Coletada";
    const pagesAnalyzed = extractionPages.length;
    const normalizedReportState = normalizeRadarR6ReportState({ localState: localState.report, legacyGenerated: legacyReportGenerated, legacyApproved: legacyReportApproved });
    const serpReviewed = latestReview?.status === "approved" && reviewState.currentness === "current";
    const expertEvidence = expertEvidenceByArticle[row.articleId] || [];
    const canonicalExpertEvidence = canonicalExpertEvidenceByArticle[row.articleId] || [];
    const expertSummary = expertContributionSummaryByArticle[row.articleId];
    const expertRequired = localState.specialist !== "NOT_REQUIRED" || Boolean(expertSummary);
    const r6Report = buildRadarR6ConsolidatedReport({
      brandId: row.brandId,
      articleId: row.articleId,
      article: article || null,
      siloDnaVersionId: row.siloId ? pipeline.siloVersions[row.siloId]?.versionId || null : null,
      state: normalizedReportState,
      serp: {
        reviewed: serpReviewed,
        snapshotId: record?.id || null,
        analysisVersionId: analysis?.versionId || null,
        report: analysis?.payload.competitiveReport || null,
        references: references.filter(reference => reference.role === "primary" || reference.role === "support").map(reference => reference.url),
        needs: analysis?.payload.competitiveReport?.needs.flatMap(need => [need.title, ...need.topics]) || [],
        gaps: analysis?.payload.competitiveReport?.profile.limitations || [],
        conflicts: view?.diagnostic?.possibleConflicts || [],
      },
      amazon: { state: localState.amazon, evidenceIds: [], summaries: [], reviewed: localState.amazon === "AMAZON_REVIEWED" },
      expert: { required: expertRequired, evidence: expertEvidence, contentBlocked: expertSummary?.blockedEvidenceCount || 0 },
      approvedEvidenceFingerprint: localState.reportApprovedEvidenceFingerprint,
    });
    const reportState = r6Report?.state || normalizedReportState;
    const reportGenerated = legacyReportGenerated || reportState !== "NOT_STARTED";
    const reportApproved = (legacyReportApproved && !r6Report?.stale) || Boolean(r6Report?.final);
    const topicCounts = radarR6TopicReviewCounts(localState.topics.items, localState.topics.reviewedIds);
    const activityEvents = [
      ...(view ? [{ label: "SERP disponível", detail: `v${view.version} · ${view.provider}`, at: view.capturedAt }] : []),
      ...(analysis ? [{ label: "Análise da amostra", detail: `${pagesAnalyzed} página(s) analisada(s)`, at: analysis.createdAt }] : []),
      ...(reportGenerated ? [{ label: "Relatório disponível", detail: radarR6ReportStateLabel(reportState), at: analysis?.createdAt || null }] : []),
      ...(sentToPlanner ? [{ label: "Transferência registrada", detail: "Pacote disponível para o Planejador", at: analysis?.createdAt || null }] : []),
    ];
    const activity = {
      requestsSent: 0,
      contributionsReceived: expertSummary?.contributionCount || 0,
      pending: referenceCounts.pending + (reportGenerated && !reportApproved ? 1 : 0) + (r6Report?.pendingContributions.length || 0) + (reportApproved && !sentToPlanner ? 1 : 0),
      lastUpdatedAt: view?.capturedAt || analysis?.createdAt || row.updatedAt || null,
      events: activityEvents,
      sourceLabel: expertSummary ? "Contribuições lidas do ExpertBrief remoto selecionado." : "Estado SERP/análise do artigo; contribuição remota ainda não foi lida.",
    };
    const stages = buildRadarWorkbenchStages({ serpCollected: Boolean(view), serpResultCount: view?.organicResults.length || 0, referencesReviewed, referenceCounts, analysisStarted: Boolean(analysis), pagesAnalyzed, additionalEvidenceState, reportGenerated, reportApproved, sentToPlanner });
    const baseR3 = buildRadarR3Model({ row, article: article || null, keyword: row.hydration?.principalKeyword?.keyword || resolveRowKeyword(row).keyword, silo: siloLabel(row), publication: publicationLabel, view, records, analysis: analysis || null, referenceCounts, references, analysisQueue, pagesAnalyzed, reportGenerated, reportApproved, sentToPlanner, serpStatus, latestSnapshotId: record?.id || null, reviewStatus: latestReview?.status || null, reviewNotes: latestReview?.notes || null, reviewCurrentness: reviewState.currentness, reviewedAt: latestReview?.reviewedAt || null, reviewHistory: pipeline.serpReviews.filter(review => review.articleId === row.articleId).sort((left, right) => Date.parse(right.reviewedAt) - Date.parse(left.reviewedAt)) });
    const contentRows = [
      ...baseR3.content.rows,
      ...(localState.topics.items.length ? [
        { area: "Especialista" as const, data: "Solicitações", value: `${topicCounts.total} solicitação(ões)`, source: "Pauta local derivada do contexto do artigo", state: `${localState.topics.state} · local` },
        { area: "Especialista" as const, data: "Perguntas", value: `${topicCounts.reviewed}/${topicCounts.total} revisada(s)`, source: "Decisão humana individual sobre a pauta", state: topicCounts.pending ? "pendente · local" : "revisado · local" },
      ] : []),
      ...(localState.topics.context?.openGaps.length ? [{ area: "SERP" as const, data: "Lacunas abertas", value: `${localState.topics.context.openGaps.length} lacuna(s)`, source: "Contexto Radar para investigação", state: "observado" }] : []),
      ...(localState.existingContent?.length ? [{ area: "Especialista" as const, data: "Material relacionado", value: `${localState.existingContent.length} entrada(s)`, source: "Conteúdo existente do especialista", state: "somente leitura" }] : []),
      { area: "Especialista" as const, data: "Contribuições", value: `${expertSummary?.contributionCount || 0} recebida(s)`, source: expertSummary ? "ExpertBrief selecionado · readback remoto" : "Leitura Telegram remota ainda não realizada", state: expertSummary ? "persistido" : "não verificado" },
       { area: "Especialista" as const, data: "ExpertEvidence", value: `${canonicalExpertEvidence.length} evidência(s) projetada(s)`, source: expertSummary ? "Contribuição remota + decisão humana local" : "Nenhuma contribuição remota foi lida", state: expertSummary ? (expertSummary.pendingCount || expertSummary.blockedEvidenceCount ? "pendente · local" : "revisado · local") : "ausente" },
    ];
    const r3: RadarR3Model = {
      ...baseR3,
      r4: localState,
      content: { ...baseR3.content, rows: contentRows },
       specialist: { ...baseR3.specialist, existingContent: localState.existingContent?.length ? localState.existingContent.map(item => item.label).join(" · ") : baseR3.specialist.existingContent, contributionsReceived: expertSummary?.contributionCount || baseR3.specialist.contributionsReceived, reviewedEvidence: canonicalExpertEvidence.length, pending: (expertSummary?.pendingCount || 0) + (expertSummary?.blockedEvidenceCount || 0), status: expertSummary ? (expertSummary.pendingCount || expertSummary.blockedEvidenceCount ? "Contribuição aguardando revisão" : "Contribuição revisada localmente") : radarR4SpecialistStatusLabel(localState.specialist) },
      report: reportState === "NOT_STARTED"
        ? baseR3.report
        : { ...baseR3.report, status: radarR6ReportStateLabel(reportState), summary: r6Report?.summary || "Prévia consolidada local aguardando revisão humana.", approved: reportApproved },
      r6Report,
      nextAction: nextActionForRadarR4Article({ baseAction: baseR3.nextAction, localState }),
    };
    /*
     * O MESMO contexto estratégico que a rota de detalhe monta.
     *
     * `analysisApprovalIssues` usa o KGR para barrar composição acima do teto.
     * Sem calculá-lo aqui, o Workbench aprovaria uma composição que a outra
     * tela recusa — e a autoridade única viraria uma função com duas respostas.
     */
    const kgrStrategy = article
      ? buildRadarKgrStrategy({ article: article.payload, context: row.arquitetoStrategyContext || null, published: publication?.state === "published", slug: row.slug || article.payload.suggestedSlug, siloName: siloLabel(row), pillarArticleId: row.siloId ? pipeline.siloVersions[row.siloId]?.payload.pillarArticleId : undefined })
      : null;
    /*
     * A ação da Coleta é DERIVADA do estado real, não de um clique preso na
     * sessão: sem snapshot há uma ação primária explícita; com snapshot, a
     * primeira coleta não é oferecida e atualizar continua sendo outra decisão.
     */
    const collection = radarSerpCollectionAction({
      hasSnapshot: Boolean(view),
      state: collectionByArticle[row.articleId]?.state || (view ? "SUCCESS" : "NOT_COLLECTED"),
      contextReady: resolveRowKeyword(row).ok,
      blockedReason: collectionByArticle[row.articleId]?.blockedReason,
    });
    // Bloqueio estrutural manda corrigir o vínculo, nunca repetir a coleta.
    if (collection.state === "STRUCTURAL_BLOCK") r3.nextAction = "Corrija o vínculo da keyword antes de coletar.";

    /*
     * O ESTADO COMPOSTO — uma leitura só para o card, a barra e o botão.
     *
     * Modelo e relatório ainda vivem na mesma versão da análise: o modelo é o
     * benchmark consolidado sobre as extrações atuais, e o relatório é o
     * `competitiveReport` persistido. `stale` compara com a amostra corrente,
     * que é como a reabertura já funciona no resto do Radar.
     */
    const curationSummary = buildRadarSerpCurationSummary({ view, analysis, scope: radarSelectionScope(row) });
    /*
     * RELATÓRIO EXISTIR NÃO É RELATÓRIO PRONTO.
     *
     * O relatório antigo era gerado como efeito colateral da análise e não
     * carregava o modelo observado — foi ele que fez a tela anunciar conclusão
     * sobre algo que a pessoa nunca leu. Prontidão passa a ser o modelo
     * presente; defasagem, o modelo descrevendo outra amostra.
     */
    const modeloDoRelatorio = analysis?.payload.competitiveReport?.observedCompetitiveModel || null;
    /*
     * O contexto editorial é resolvido com a LINHA inteira.
     *
     * A tela lia só o ArticleDNA e por isso mostrava vazio o que o RadarItem
     * já transportava: referências de KeywordDNA, contexto de estratégia,
     * proveniência da SERP de formação e o grafo de links internos.
     */
    const editorialContext = buildRadarEditorialContext({ item: row, article: article || null, keyword: row.hydration?.principalKeyword?.keyword || resolveRowKeyword(row).keyword });
    /*
     * O CONTEXTO RESOLVIDO — a junção que ninguém fazia.
     *
     * A referência do Arquiteto tem os números; a hidratação tem o texto. Aqui
     * as duas viram uma coisa só, e nenhuma keyword some no caminho.
     */
    const researchContext = buildRadarArticleResearchContext({ item: row, article: article || null });
    /*
     * A INVESTIGAÇÃO PROFUNDA, RESOLVIDA UMA VEZ.
     *
     * Plano de consultas, universo competitivo, comparação com o ArticleDNA,
     * suficiência e o estado das duas ações humanas saem daqui — a tela não
     * recompõe nada por conta própria. Nada é executado nesta leitura: montar
     * o plano não dispara coleta.
     */
    const deepResearch = buildRadarDeepResearchView({
      context: researchContext,
      record: analysis?.payload.deepResearch || null,
      running: busyArticleId === row.articleId || serpAction?.articleId === row.articleId,
      snapshot: view ? { query: view.query, organicResults: view.organicResults } : null,
      extractions: analysis?.payload.extractions || [],
      extractionFailures: analysis?.payload.extractionFailures.length || 0,
      extractionFailureUrls: (analysis?.payload.extractionFailures || []).map(item => item.url),
      selectedReferences: curationSummary.selectedCompetitors,
      curationConfirmed: curationSummary.curationStarted,
      model: modeloDoRelatorio,
      diagnostic: view?.diagnostic ? { dominantIntent: view.diagnostic.dominantIntent, dominantFormats: view.diagnostic.dominantFormats } : null,
      /*
       * §8 — A AUTORIDADE CORRENTE É O ÚLTIMO READBACK CONFIRMADO.
       *
       * Modelos montados localmente que não chegaram ao banco não tornam a
       * investigação finalizável. O carimbo vem da versão persistida.
       */
      analysisConfirmed: Boolean(analysis?.payload.analysisCompletedAt),
      /* O que o servidor já guardou desta análise — Gate 18.10.1 · §2. */
      persistedAnalysis: analysis?.payload || null,
      researchDraft: researchDraftByArticle[row.articleId],
      mode: searchModeByArticle[row.articleId] || RADAR_DEFAULT_SEARCH_MODE,
      /* As fontes que o ANALYZE verificou, lidas de volta da versão gravada. */
      verifiedSources: analysis?.payload.verifiedSources || [],
      /*
       * A INVESTIGAÇÃO CONGELADA, LIDA DE VOLTA — nunca reconstruída.
       *
       * É isto que faz o F5 devolver a mesma finalização: a leitura viva
       * continua sendo calculada ao lado, mas quem responde pelo que já foi
       * finalizado é o que está gravado.
       */
      finalizedBundle: analysis?.payload.finalizedBundle || null,
    });
    const investigation = buildRadarInvestigationView({
      hasSnapshot: Boolean(view),
      collection,
      curationStarted: curationSummary.curationStarted,
      organicResults: view?.organicResults.length || 0,
      pendingDecisions: curationSummary.pendingDecisions,
      selectedReferences: curationSummary.selectedCompetitors,
      pendingExtractions: analysisQueue,
      analyzedPages: pagesAnalyzed,
      comparablePages: analysis?.payload.benchmark?.validPageCount || 0,
      modelReady: pagesAnalyzed > 0 && analysisQueue === 0,
      modelStale: pagesAnalyzed > 0 && analysisQueue > 0,
      reportReady: modeloDoRelatorio !== null,
      reportStale: modeloDoRelatorio !== null && (analysisQueue > 0 || modeloDoRelatorio.sample.analyzed !== pagesAnalyzed),
      investigationReviewed: localState.report === "REPORT_REVIEWED" || localState.report === "REPORT_APPROVED" || reportApproved,
      investigationApproved: reportApproved,
      serpCurationApproved: latestReview?.status === "approved",
      serpCurationCurrent: reviewState.currentness === "current",
      sentToPlanner,
    });
    /*
     * A COLUNA "PRÓXIMA AÇÃO" FALA A LÍNGUA DA FASE 1.
     *
     * "Analisar páginas pendentes (1)" era o fluxo interno vazando para a
     * planilha: um número que só significa algo para quem escreveu o código. A
     * próxima ação é uma das três, com o mesmo nome do botão.
     */
    r3.nextAction = collection.state === "STRUCTURAL_BLOCK" ? r3.nextAction
      : radarPhase1NextAction(deepResearch.phase1);
    /*
     * O ESPECIALISTA, RESOLVIDO UMA VEZ — GATE 18.7.
     *
     * `r3.specialist.status` era montado lá em cima, antes da investigação
     * existir, e caía em `radarR4SpecialistStatusLabel(localState.specialist)`
     * — o estado do fluxo R4, que nasce `NOT_REQUIRED`. Com a investigação
     * real finalizada e um ponto de revisão congelado, a planilha dizia "Não
     * necessário" enquanto o card e o bundle, na mesma tela, diziam 1 ponto.
     *
     * A necessidade é conclusão da investigação; o estado do fluxo é o que
     * alguém fez a respeito dela. A linha passa a ler a primeira, com a
     * segunda no subtítulo, e as duas saem desta única montagem.
     */
    const especialista = buildRadarSpecialistSummary({
      observed: deepResearch.observed,
      finalized: deepResearch.finalizedBundle,
      specialist: r3.specialist,
    });
    const r3Consolidado: RadarR3Model = {
      ...r3, editorialContext, researchContext, deepResearch,
      specialist: { ...r3.specialist, summary: especialista, status: especialista.statusLabel },
      serp: { ...r3.serp, collection, investigation },
    };

    return { article, view, analysis, latestSerpRecord: record, latestReview, reviewState, referenceCounts, analysisQueue, pagesAnalyzed, reportGenerated, reportApproved, reportState, r6Report, sentToPlanner, additionalEvidenceState, activity, nextAction: r3.nextAction, stages, publicationLabel, serpStatus, kgrStrategy, expertSummary, collection, editorialContext, researchContext, deepResearch, r3: r3Consolidado };
  };
  const resolvedActiveArticleId = resolveRadarWorkbenchArticleId({ selectedId: activeArticleId, rowIds: pipeline.radarItems.map(row => row.articleId) });
  const activeRadarItem = resolvedActiveArticleId ? pipeline.radarItems.find(row => row.articleId === resolvedActiveArticleId) || null : null;
  const activeRadarRowId = activeRadarItem?.id || null;


  const bulkSelectedRowIds = new Set(pipeline.radarItems.filter(row => selectedArticleIds.includes(row.articleId)).map(row => row.id));
  const activeWorkbenchData = activeRadarItem ? rowWorkbenchData(activeRadarItem) : null;
  /*
   * ======  O QUE SOBROU DO FLUXO ANTIGO, DE PROPÓSITO  ==================
   *
   * GATE 15.3 removeu o workflow legado da SUPERFÍCIE, não do repositório.
   * Daqui para baixo continuam vivos `serpApprovalBlockedReason`,
   * `focusAdjacent`, `runInvestigationAction`, `confirmResearchCuration`,
   * `confirmSerpCuration`, `reviewSerpForArticle` e `serpReviewRemoteConfirmed`.
   * Nenhum deles é passado ao Workbench: a Fase 1 tem uma autoridade só, que é
   * START → ANALYZE → FINALIZE com RESET explícito.
   *
   * O linter aponta cada um como "assigned but never used", e o aviso é
   * exatamente a evidência que se quer: enquanto ele existir, nenhum destes
   * caminhos está ligado à tela. Silenciá-lo com um disable apagaria o sinal.
   *
   * Eles não foram apagados porque tocam escrita remota — aprovar, rejeitar,
   * confirmar curadoria — e apagá-los seria uma decisão sobre persistência,
   * não sobre interface. Religar qualquer um exige um diff com nome.
   */
  const serpApprovalBlockedReason = activeRadarItem && activeWorkbenchData ? (() => {
    const identityIssue = radarSerpApprovalBlockReason({ brandId: activeRadarItem.brandId, articleId: activeRadarItem.articleId, articleDnaVersionId: activeRadarItem.articleDnaVersionId, view: activeWorkbenchData.view, analysis: activeWorkbenchData.analysis });
    if (identityIssue) return identityIssue;
    const analysisIssues = activeWorkbenchData.analysis ? radarSerpApprovalIssues({ view: activeWorkbenchData.view, analysis: activeWorkbenchData.analysis, scope: radarSelectionScope(activeRadarItem) }) : [];
    return analysisIssues[0] || null;
  })() : null;
  const pendingReviewRows = pipeline.radarItems.filter(row => { const data = rowWorkbenchData(row); return data.r3.r4?.serp.state === "WAITING_REVIEW" || Boolean(data.view && data.referenceCounts.pending > 0); });
  const pendingTopicRows = pipeline.radarItems.filter(row => {
    const topics = rowWorkbenchData(row).r3.r4?.topics;
    return Boolean(topics && topics.items.length > 0 && !areRadarR5TopicsReviewed(topics.items, topics.reviewedIds));
  });
  const focusAdjacent = (direction: "previous" | "next") => {
    if (!pendingReviewRows.length) return;
    const currentIndex = pendingReviewRows.findIndex(row => row.articleId === activeArticleId);
    const nextIndex = currentIndex < 0 ? direction === "next" ? 0 : pendingReviewRows.length - 1 : (currentIndex + (direction === "next" ? 1 : -1) + pendingReviewRows.length) % pendingReviewRows.length;
    selectAndActivate(pendingReviewRows[nextIndex].articleId);
  };
  const focusTopicAdjacent = (direction: "previous" | "next") => {
    if (!pendingTopicRows.length) return;
    const currentIndex = pendingTopicRows.findIndex(row => row.articleId === activeArticleId);
    const nextIndex = currentIndex < 0 ? direction === "next" ? 0 : pendingTopicRows.length - 1 : Math.min(Math.max(currentIndex + (direction === "next" ? 1 : -1), 0), pendingTopicRows.length - 1);
    selectAndActivate(pendingTopicRows[nextIndex].articleId);
  };
  const focusQueueView = (view: RadarR5QueueView) => {
    if (!r4SerpQueue) return;
    const states = view === "pending" ? ["QUEUED", "RUNNING", "WAITING_REVIEW"] : ["FAILED_RETRYABLE", "FAILED_FINAL"];
    const articleId = r4SerpQueue.articleIds.find(id => states.includes(r4SerpQueue.items[id]?.state || ""));
    const row = articleId ? pipeline.radarItems.find(item => item.articleId === articleId) : undefined;
    if (!row) { setNotice(view === "pending" ? "Nenhum item pendente na fila SERP." : "Nenhuma falha registrada na fila SERP."); return; }
    selectAndActivate(row.articleId);
    setNotice(view === "pending" ? "Workbench focado no próximo artigo pendente da fila SERP." : "Workbench focado no próximo artigo com falha da fila SERP.");
  };
  /*
   * A LINHA OPERACIONAL — uma projeção, lida por Status e por Próxima ação.
   *
   * As duas colunas precisam concordar entre si e com o card. Derivá-las do
   * mesmo `radarOperationalRow` é o que garante isso por construção: não há
   * como uma dizer "finalizada" e a outra pedir revisão da SERP.
   */
  const operationalRowFor = (row: RadarItem) => {
    const data = rowWorkbenchData(row);
    return radarOperationalRow({
      view: data.r3.deepResearch,
      running: busyArticleId === row.articleId,
      legacyNextAction: data.r3.nextAction,
    });
  };

  const columns: OperationalGridColumn<RadarItem>[] = [
    { id: "article", header: "Artigo", value: row => `${row.title} ${resolveRowKeyword(row).keyword} ${row.hierarchy}`, pinned: "left", sortable: true, width: 280, render: row => { const data = rowWorkbenchData(row); const isFocused = row.articleId === activeArticleId; return <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><strong className="block truncate text-sm text-foreground">{data.r3.title}</strong>{isFocused && <span className="shrink-0 rounded border border-context-accent/35 px-1.5 py-0.5 text-xs font-semibold text-context-accent">Em foco</span>}</div>{/*
      * A COR DA KEYWORD PERTENCE À KEYWORD.
      *
      * A linha inteira vinha em `text-keyword` — silo e versão do ArticleDNA
      * junto. O papel é do VALOR da keyword; nome de silo e versão são
      * metadado, e a coluna Conteúdo já é dona deles.
      */}
      <span className="mt-1 block truncate text-sm"><span className="text-keyword">{data.r3.keyword}</span><span className="text-text-muted"> · {data.r3.hierarchy}</span></span></div>; } },
    /*
     * PESQUISA — a mesma leitura do card, pelo mesmo selector.
     *
     * A coluna dizia "SERP" porque era o único destino possível. Desde que o
     * modo virou escolha, o rótulo passou a mentir sobre YouTube e Amazon. E o
     * estado vem de `radarOperationalStatus`: a planilha não pode ter uma
     * verdade diferente da do Workbench sobre a mesma investigação.
     */
    { id: "research", header: "Pesquisa", value: row => { const data = rowWorkbenchData(row); return `${data.r3.serp.provider} ${data.r3.serp.resultCount} ${data.r3.serp.pendingCount} ${data.r3.r4?.serp.state || ""}`; }, width: 200, render: row => { const data = rowWorkbenchData(row).r3; const modo = searchModeByArticle[row.articleId] || RADAR_DEFAULT_SEARCH_MODE; if (data.deepResearch) { const resumo = buildRadarResearchCardSummary({ view: data.deepResearch, mode: modo }); return <div><strong className="block text-sm text-foreground">{resumo.statusLabel}</strong><span className="mt-1 block text-sm text-text-muted">{resumo.modeLabel} · {resumo.counts.analyzed} de {resumo.counts.references} analisada(s)</span></div>; } const queue = data.r4?.serp; const queueLabel = queue?.state === "QUEUED" ? `Na fila ${queue.position || 1}/${queue.total || 1}` : queue?.state === "RUNNING" ? `Processando ${queue.position || 1}/${queue.total || 1}` : queue?.state === "WAITING_REVIEW" ? "Aguardando revisão" : queue?.state === "FAILED_RETRYABLE" ? "Falha · tentar novamente" : queue?.state === "FAILED_FINAL" ? (data.serp.collection?.state === "STRUCTURAL_BLOCK" ? "Coleta bloqueada" : "Falha final") : queue?.state === "COMPLETED" ? "Pesquisa concluída" : data.serp.resultCount ? `${data.serp.resultCount} resultado(s)` : "Não iniciada"; return <div><strong className="block text-sm text-foreground">{queueLabel}</strong><span className="mt-1 block text-sm text-text-muted">{radarSearchModeLabel(modo)} · {data.serp.pendingCount} pendente(s)</span></div>; } },
    { id: "content", header: "Conteúdo", value: row => { const data = rowWorkbenchData(row).r3.content; return `${data.articleDnaVersion} ${data.needs} ${data.evidenceCount}`; }, width: 190, render: row => { const data = rowWorkbenchData(row).r3; const resumo = data.researchContext ? buildRadarArticleDnaSummary(data.researchContext) : null; return <div><strong className="block text-sm text-foreground">{resumo ? `${resumo.silo || "Sem silo"} · ${resumo.role || "Sem papel"}` : data.content.articleDnaVersion}</strong><span className="mt-1 block text-sm text-text-muted">{resumo ? `${resumo.keywordCount} keyword(s)${resumo.funnel ? ` · funil ${resumo.funnel.toLowerCase()}` : ""}` : `${data.content.needs} necessidade(s)`}</span></div>; } },
    /*
     * A LINHA LÊ A NECESSIDADE; O SUBTÍTULO, O FLUXO.
     *
     * O subtítulo anterior começava pelo nome do especialista ("Não
     * selecionado"), que é justamente uma das inferências que o §REGRAS
     * proíbe: não ter ninguém escolhido não diz nada sobre a investigação
     * precisar de revisão.
     */
    { id: "specialist", header: "Especialista", value: row => radarSpecialistCell(rowWorkbenchData(row).r3.specialist).title, width: 180, render: row => { const celula = radarSpecialistCell(rowWorkbenchData(row).r3.specialist); return <div><strong className="block text-sm text-foreground">{celula.title}</strong><span className="mt-1 block text-sm text-text-muted">{celula.subtitle}</span></div>; } },
    /*
     * O RELATÓRIO DIZ O QUE FALTA, NÃO QUANTAS NECESSIDADES EXISTEM.
     *
     * "34 necessidades" não ajuda ninguém a decidir: 34 é muito ou pouco? O
     * que a coluna responde agora é quantas verificações estão prontas e
     * quantos pontos seguem em aberto — a mesma leitura do card.
     */
    { id: "report", header: "Relatório", value: row => rowWorkbenchData(row).reportState, width: 190, render: row => { const data = rowWorkbenchData(row); const localReport = data.reportState !== "NOT_STARTED"; const resumo = data.r3.deepResearch ? buildRadarReportSummary({ observed: data.r3.deepResearch.observed, view: data.r3.deepResearch }) : null; const exigidos = resumo?.checks.filter(item => item.state !== "NOT_REQUIRED").length || 0; return <div><strong className="block text-sm text-foreground">{localReport ? radarR6ReportStateLabel(data.reportState) : data.r3.report.status}</strong><span className="mt-1 block text-sm text-text-muted">{resumo ? `${resumo.checks.filter(item => item.state === "READY").length} de ${exigidos} pronta(s) · ${resumo.blockers.length} em aberto` : `${data.r3.report.needs} necessidade(s) · ${data.r3.report.sentToPlanner ? "Planejador" : "Não enviado"}`}</span></div>; } },
    { id: "nextAction", header: "Próxima ação", value: row => operationalRowFor(row).nextAction, width: 235, render: row => <span className="block whitespace-normal text-sm leading-5 text-foreground">{operationalRowFor(row).nextAction}</span> },
    { id: "format", header: "Formato", value: row => row.format, filterOptions: [...new Set(pipeline.radarItems.map(item => item.format))].map(value => ({ label: value, value })), width: 110 },
    /*
     * §15 — O MESMO ESTADO NA PLANILHA E NO CARD.
     *
     * A coluna mostrava `row.state`: o estado do fluxo editorial persistido,
     * que descreve a esteira Marca→Planejador e não a investigação. Daí a
     * linha dizer "Pesquisa pendente" enquanto o card, na mesma tela, dizia
     * "Finalizado". Os dois estavam certos sobre coisas diferentes — e quem
     * opera não tem como saber disso.
     *
     * O estado persistido continua gravado e continua governando a esteira. O
     * que a planilha MOSTRA, quando existe investigação, é a projeção do
     * Radar: a mesma de `radarOperationalStatus`, com o mesmo vocabulário.
     */
    { id: "state", header: "Status", value: row => operationalRowFor(row).statusLabel, sortable: true,
      render: row => { const linha = operationalRowFor(row); return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm ${TOM_DA_LINHA[linha.tone]}`} title={linha.nextAction}>{linha.statusLabel}</span>; },
      filterOptions: RADAR_OPERATIONAL_STATUS_ORDER.map(status => ({ label: RADAR_OPERATIONAL_STATUS_LABEL[status], value: RADAR_OPERATIONAL_STATUS_LABEL[status] })), width: 165 },
  ];
  const bulkSnapshotFor = (row: RadarItem): RadarR4BulkArticleSnapshot => {
    const data = rowWorkbenchData(row);
    const local = localStateFor(row.articleId);
    const topicCounts = radarR6TopicReviewCounts(local.topics.items, local.topics.reviewedIds);
    return { articleId: row.articleId, keywordReady: resolveRowKeyword(row).ok, serpCollected: Boolean(data.latestSerpRecord?.origin === "real" && data.latestSerpRecord.research) || ["WAITING_REVIEW", "COMPLETED"].includes(local.serp.state || ""), serpReviewed: data.latestReview?.status === "approved" && data.reviewState.currentness === "current", analysisStarted: Boolean(data.analysis), reportGenerated: data.reportGenerated || data.reportState !== "NOT_STARTED", reportApproved: data.reportApproved, sentToPlanner: data.sentToPlanner, rowState: row.state, topicsState: local.topics.state, topicsReviewed: areRadarR5TopicsReviewed(local.topics.items, local.topics.reviewedIds), topicsTotal: topicCounts.total, topicsReviewedCount: topicCounts.reviewed, specialistState: local.specialist, serpQueueState: local.serp.state, amazonState: local.amazon };
  };
  const selectedSnapshotsFor = (rows: RadarItem[]) => rows.map(bulkSnapshotFor);
  const setCollectionState = (articleId: string, state: RadarSerpCollectionState, blockedReason: string | null) =>
    setCollectionByArticle(current => ({ ...current, [articleId]: { state, blockedReason } }));
  /*
   * A ação primária despacha para o handler que já existe.
   *
   * Não há caminho novo aqui: coleta, curadoria, extração, relatório, revisão e
   * aprovação continuam sendo as mesmas funções. O que mudou é que a pessoa
   * deixa de precisar descobrir qual delas é a vez.
   */
  const runInvestigationAction = (id: string) => {
    const target = activeRadarItem;
    if (!target) { setNotice("Selecione um artigo para continuar a investigação."); return; }
    if (id === "COLLECT") return void collect(target);
    if (id === "START_CURATION") return void startSerpAnalysis();
    if (id === "DECIDE_RESULTS") { setNotice("Abra a subaba Concorrentes e decida os resultados pendentes."); return; }
    if (id === "START_ANALYSIS" || id === "ANALYZE_PENDING") return void analyzeSerpSelection();
    if (id === "CONSOLIDATE_MODEL" || id === "GENERATE_REPORT") return void generateReportForArticle();
    if (id === "REVIEW_INVESTIGATION") return reviewReportForArticle();
    if (id === "APPROVE_INVESTIGATION") return void approveReportForArticle();
    if (id === "PREPARE_PLANNER") { setNotice("Use a ação de envio ao Planejador na planilha para transferir a investigação aprovada."); return; }
  };
  /*
   * A COLETA É EXPLÍCITA E ÚNICA.
   *
   * `collectingArticleIdRef` fecha a porta antes de qualquer await: dois
   * cliques rápidos produziam duas requisições, dois snapshots e dois avisos
   * de sucesso. `busyArticleId` é estado de render e chega tarde demais.
   */
  const collect = async (row: RadarItem): Promise<"WAITING_REVIEW" | "FAILED_RETRYABLE" | "FAILED_FINAL"> => {
    if (collectingArticleIdRef.current) return "FAILED_RETRYABLE";
    const resolved = resolveRowKeyword(row);
    if (!resolved.ok) {
      setCollectionState(row.articleId, "STRUCTURAL_BLOCK", resolved.message);
      setNotice(resolved.message);
      return "FAILED_FINAL";
    }
    if (busyArticleId) return "FAILED_RETRYABLE";
    collectingArticleIdRef.current = row.articleId;
    history.capture(`Coletar SERP real de ${row.title}`);
    setCollectionState(row.articleId, "VALIDATING", null);
    updateLocalState(row.articleId, current => ({ ...current, serp: { ...current.serp, state: "RUNNING", position: current.serp.position || 1, total: current.serp.total || 1, error: null } }));
    setBusyArticleId(row.articleId); setNotice("Validando o artigo antes de falar com o DataForSEO…");
    try {
      setCollectionState(row.articleId, "COLLECTING", null);
      setNotice("Pesquisando a SERP real via DataForSEO…");
      const record = await pipeline.collectSerp(row.articleId, pipeline.snapshot!.brand.localizacao || "Brasil", row.articleDnaVersionId);
      ultimaColetaRef.current = { articleId: row.articleId, research: record.research || null };
      setCollectionState(row.articleId, "PERSISTING", null);
      updateLocalState(row.articleId, current => ({ ...current, serp: { ...current.serp, state: "WAITING_REVIEW", position: current.serp.position || 1, total: current.serp.total || 1, error: null } }));
      setCollectionState(row.articleId, "SUCCESS", null);
      setNotice(`SERP real v${record.research?.version || 1} coletada: ${record.research?.organicResults.length || 0} resultado(s). ${record.persistenceMode === "remote" ? "Persistência remota confirmada." : "Coleta concluída, mas a persistência remota não foi confirmada."}`);
      return "WAITING_REVIEW";
    } catch (error) {
      /*
       * Vínculo quebrado não é retry.
       *
       * A classificação passou a olhar o código que o servidor devolve antes
       * de qualquer chamada paga. Um Silo não comprovado deixa de aparecer
       * como "falha · tentar novamente" e passa a dizer o que precisa ser
       * corrigido — e onde.
       */
      const motivo = error instanceof Error ? error.message : "Falha na coleta SERP.";
      const classificacao = classifyRadarSerpCollectionFailure(error);
      setCollectionState(row.articleId, classificacao, classificacao === "STRUCTURAL_BLOCK" ? motivo : null);
      const failureState = classificacao === "STRUCTURAL_BLOCK" ? "FAILED_FINAL" as const : classifyRadarR5SerpFailure(error);
      updateLocalState(row.articleId, current => ({ ...current, serp: { ...current.serp, state: failureState, position: current.serp.position || 1, total: current.serp.total || 1, error: motivo } }));
      setNotice(motivo);
      return failureState;
    } finally { collectingArticleIdRef.current = null; setBusyArticleId(null); }
  };
  const radarItemForArticleId = (articleId: string) => pipeline.radarItems.find(row => row.articleId === articleId);
  const radarItemIdsForArticles = (articleIds: string[]) => articleIds.map(articleId => radarItemForArticleId(articleId)?.id).filter((id): id is string => Boolean(id));
  const transition = (articleIds: string[], target: RadarItem["state"], label: string) => { const radarItemIds = radarItemIdsForArticles(articleIds); if (!radarItemIds.length) return; history.capture(label); pipeline.updateRadarState(radarItemIds, target); };
  const sendToPlanner = (articleIds: string[]) => { const radarItemIds = radarItemIdsForArticles(articleIds); history.capture(`Enviar ${articleIds.length} artigo(s) ao Planejador`); return pipeline.importApprovedToPlanner(radarItemIds); };
  const startSerpBatch = async (ids: string[], mode: "default" | "explicit_refresh" = "default") => {
    const rows = ids.map(id => radarItemForArticleId(id)).filter((row): row is RadarItem => Boolean(row));
    const actions = availableBulkActions(selectedSnapshotsFor(rows));
    const eligible = mode === "explicit_refresh" ? actions.refreshSerp.eligible : actions.serp.eligible;
    const queue = createRadarR4SerpQueue(eligible);
    if (!queue.articleIds.length) return;
    setR4SerpQueue(queue);
    setNotice(mode === "explicit_refresh" ? `Refresh explícito iniciado para ${queue.articleIds.length} artigo(s).` : `Lote SERP iniciado para ${queue.articleIds.length} artigo(s), em sequência.`);
    queue.articleIds.forEach((articleId, index) => updateLocalState(articleId, current => ({ ...current, serp: { state: "QUEUED", position: index + 1, total: queue.articleIds.length, error: null } })));
    const outcomes: Record<"WAITING_REVIEW" | "FAILED_RETRYABLE" | "FAILED_FINAL", number> = { WAITING_REVIEW: 0, FAILED_RETRYABLE: 0, FAILED_FINAL: 0 };
    for (const id of queue.articleIds) {
      const row = radarItemForArticleId(id);
      if (!row) continue;
      setR4SerpQueue(current => current ? updateRadarR4SerpQueueItem(current, id, "RUNNING") : current);
      updateLocalState(row.articleId, current => ({ ...current, serp: { ...current.serp, state: "RUNNING", position: queue.items[id].position, total: queue.items[id].total, error: null } }));
      const outcome = await collect(row);
      outcomes[outcome] += 1;
      setR4SerpQueue(current => current ? updateRadarR4SerpQueueItem(current, id, outcome, outcome === "WAITING_REVIEW" ? null : "A coleta falhou; o item pode ser tentado novamente.") : current);
    }
    setNotice(`Lote SERP concluído: ${outcomes.WAITING_REVIEW} aguardando revisão, ${outcomes.FAILED_RETRYABLE} retry disponível e ${outcomes.FAILED_FINAL} falha(s) final(is).`);
  };
  const reviewSelected = (ids: string[]) => {
    const rows = pipeline.radarItems.filter(row => ids.includes(row.articleId));
    const eligible = availableBulkActions(selectedSnapshotsFor(rows)).review.eligible;
    const first = pipeline.radarItems.find(row => eligible.includes(row.articleId));
    if (!first) { setNotice("Nenhuma SERP selecionada está aguardando revisão individual."); return; }
    selectAndActivate(first.articleId);
    setNotice(`${eligible.length} SERP(s) na fila de revisão. Revise cada snapshot no Workbench; nenhuma aprovação foi criada em lote.`);
  };
  const persistSerpAnalysis = async (articleId: string, next: RadarAnalysisVersion, message: string) => {
    const saved = await pipeline.saveRadarAnalysis(articleId, next);
    /*
     * O AVISO DIZ QUAL ETAPA FICOU SEM CARIMBO — 18.10 · §5.
     *
     * "A recuperação local foi atualizada" era duas vezes impreciso: ela podia
     * ter falhado (quota), e não dizia O QUE ficou por confirmar. Sem isso a
     * pessoa via o estado recuar e não sabia se tinha perdido o trabalho ou só
     * a confirmação — e a diferença decide se ela refaz uma operação cara.
     */
    const confirmado = saved.persistenceMode === "remote" && saved.readbackConfirmed;
    const pendencia = confirmado ? null : radarUnconfirmedClaimsNotice(
      (saved.unconfirmedClaims || []) as readonly RadarRemoteOnlyClaim[],
    );
    setNotice(confirmado
      ? `${message} Persistência remota e readback confirmados.`
      : [message, pendencia || "A persistência remota não foi confirmada; o que está na tela vale apenas nesta aba."].join(" "));
    return saved;
  };
  /*
   * A PRIMEIRA VERSÃO DA ANÁLISE, MONTADA EM UM LUGAR SÓ.
   *
   * "Iniciar curadoria" e "Iniciar pesquisa profunda" criam a mesma coisa: a
   * versão da análise sobre o snapshot corrente. A única diferença é que a
   * pesquisa profunda chega com o fundamento congelado para gravar junto.
   */
  const curationVersionFor = async (target: RadarItem, article: VersionEnvelope<ArticleDNA>, research: SerpResearchSnapshot, deepResearch?: RadarDeepResearchRecord | null) => {
    const sourceKeyword = pipeline.snapshot!.keywords.find(keyword => keyword.id === target.principalKeywordId);
    const kgr = target.arquitetoKgrIdentity;
    const recommendation = suggestRadarAnalysisMode({
      kgr: kgr?.kgrValue ?? sourceKeyword?.kgr_score ?? null,
      volume: kgr?.primaryVolume ?? sourceKeyword?.volume_search ?? null,
      kgrClassification: kgr ? kgr.isKgrArticle ? "confirmed_kgr" : "not_kgr" : undefined,
      resultCount: research.organicResults.length,
      keywordDnaConfidence: null,
      format: target.format,
      intent: target.intent,
    });
    const previous = target.analysisVersions.slice().sort((left, right) => right.versionNumber - left.versionNumber)[0];
    return createRadarAnalysisVersion({ brandId: target.brandId, article, research, mode: recommendation.suggestedMode, modeRecommendation: recommendation, actorId: sessionId(session), ownDomainHost: hostOf(article.payload.canonical), previous, deepResearch: deepResearch || null });
  };
  const startSerpAnalysis = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    /*
     * CLIQUE QUE NÃO FAZ NADA NÃO PODE FICAR MUDO.
     *
     * O guard devolvia `void` em silêncio quando outra ação estava em voo, e a
     * pessoa clicava em "Iniciar curadoria" sem resposta nenhuma — nem sucesso,
     * nem erro, nem motivo. Recusa é declarada, como em todo o resto do fluxo.
     */
    if (!target || !data) { setNotice("Selecione um artigo antes de iniciar a curadoria."); return; }
    if (serpActionRef.current || serpAction) { setNotice("Outra ação da SERP ainda está em andamento neste artigo. Aguarde a conclusão."); return; }
    if (busyArticleId) { setNotice("A coleta da SERP ainda está em andamento. Aguarde a conclusão para iniciar a curadoria."); return; }
    if (reviewingArticleIdRef.current || reviewingArticleId) { setNotice("A revisão da SERP está em andamento. Aguarde a conclusão para iniciar a curadoria."); return; }
    if (data.analysis) { setNotice("A curadoria já foi iniciada para o snapshot atual; nenhuma nova versão foi criada."); return; }
    const view = data.view;
    const research = view?.record.research;
    if (!data.article || !view || !research || view.source === "legacy_snapshot" || view.partial) {
      setNotice("Este snapshot não possui payload canônico completo para iniciar a curadoria.");
      return;
    }
    if (!claimSerpAction({ articleId: target.articleId, kind: "start" })) return;
    setNotice("");
    try {
      const next = await curationVersionFor(target, data.article, research);
      await persistSerpAnalysis(target.articleId, next, "Curadoria iniciada usando o snapshot existente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a curadoria da SERP.");
    } finally { releaseSerpAction(target.articleId, "start"); }
  };
  /*
   * ZERAR O RADAR DESTE ARTIGO — para a próxima rodada começar limpa.
   *
   * Artigo de homologação é descartável: em vez de arrastar `v1 → stale →
   * reopened → reused`, a linha volta a "nunca investigada" e a execução
   * seguinte recomeça do zero. Os fundamentos (ArticleDNA, KeywordDNA,
   * SiloDNA, SiloPage, grafo) não passam por aqui e não são tocados.
   */
  /*
   * ZERAR A INVESTIGAÇÃO CORRENTE — GATE 17.
   *
   * A decisão de zerar não mora aqui: `radarResetDecision` responde se a ação
   * escreve, recusa por concorrência ou não muda nada, e esta função obedece.
   * O sucesso é gated pelo readback, como toda escrita remota do Radar: dizer
   * "zerada" com base em setState mostraria uma tela limpa sobre um banco que
   * ainda tem a investigação antiga.
   */
  const resetRadarInvestigation = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data) { setNotice("Selecione um artigo antes de zerar a investigação."); return; }

    const decisao = radarResetDecision({
      hasCurrentInvestigation: Boolean(data.analysis),
      inFlight: Boolean(serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId),
    });
    if (!decisao.writes || !data.analysis) { setNotice(decisao.message); return; }

    const resumo = radarResetSummary(data.analysis.payload);
    if (!claimSerpAction({ articleId: target.articleId, kind: "decision" })) return;
    history.capture(`Zerar investigação Radar de ${target.title}`);
    setNotice("");
    try {
      const next = await createRadarAnalysisSuccessor(
        data.analysis,
        buildRadarResetPayload(data.analysis.payload),
        sessionId(session), undefined, crypto.randomUUID(),
      );
      const saved = await pipeline.saveRadarAnalysis(target.articleId, next);
      const resultado = radarActionOutcome({
        action: "RESET",
        persistence: { persistenceMode: saved.persistenceMode, readbackConfirmed: saved.readbackConfirmed },
        successMessage: `Investigação zerada. ${radarResetLabel(resumo)}`,
      });
      setNotice(resultado.message);
      /*
       * O RASCUNHO E O MODO SÓ CAEM COM O RESET CONFIRMADO.
       *
       * Liberar o seletor de modo sobre uma escrita que não voltou deixaria a
       * pessoa escolher YouTube para uma investigação Google que continua viva
       * no banco. §11 devolve a escolha depois do reset — não antes dele.
       */
      if (!resultado.advances) return;
      setResearchDraftByArticle(current => ({ ...current, [target.articleId]: {} }));
      setSearchModeByArticle(current => {
        const proximo = { ...current };
        delete proximo[target.articleId];
        return proximo;
      });
    } catch (error) {
      setNotice(radarActionOutcome({ action: "RESET", error }).message);
    } finally { releaseSerpAction(target.articleId, "decision"); }
  };

  /*
   * UM CLIQUE, UMA PESQUISA — e a recusa é dita em voz alta.
   *
   * Este invólucro é o único ponto de entrada da ação primária, venha ela do
   * painel da área Pesquisa ou do slot da primeira camada. Ele existe por dois
   * motivos concretos:
   *
   * 1. O guarda antigo não olhava `collectingArticleIdRef` — o único fechado
   *    antes do primeiro await. Um clique durante a coleta chegava até
   *    `collect`, recebia FAILED_RETRYABLE e voltava SEM MENSAGEM NENHUMA. Foi
   *    isso que a pessoa descreveu como "apertei e não aconteceu nada".
   *
   * 2. Nenhum guarda cobria o laço das SERPs auxiliares, onde cada iteração é
   *    uma consulta paga.
   *
   * A frase diz o custo, porque o custo é o que torna o clique repetido caro.
   */
  const startDeepResearch = async () => {
    const target = activeRadarItem;
    if (!target) { setNotice("Selecione um artigo antes de iniciar a pesquisa profunda."); return; }
    if (pesquisaEmVooRef.current || collectingArticleIdRef.current || serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) {
      setNotice("A pesquisa deste artigo já está em andamento. Aguarde a conclusão: cada clique é uma consulta paga ao provider.");
      return;
    }
    pesquisaEmVooRef.current = target.articleId;
    try {
      await rodadaDePesquisaProfunda();
    } finally {
      pesquisaEmVooRef.current = null;
    }
  };


  /*
   * A PESQUISA PROFUNDA COMEÇA AQUI — E SÓ AQUI.
   *
   * Abrir o artigo não coleta nada. Este handler existe atrás de um clique
   * humano e faz, em ordem: resolve o contexto, congela o fundamento (versões
   * de ArticleDNA, keywords, Silo, SERP de formação e grafo), executa a
   * consulta central pelo contrato canônico e grava o registro na versão da
   * análise. O que a coleta canônica não permite executar fica registrado como
   * planejado, com motivo — nunca some.
   */
  const rodadaDePesquisaProfunda = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data) { setNotice("Selecione um artigo antes de iniciar a pesquisa profunda."); return; }
    if (serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) {
      setNotice("Outra ação ainda está em andamento neste artigo. Aguarde a conclusão.");
      return;
    }
    const investigacao = data.deepResearch;
    if (!investigacao?.plan.primary?.keyword) {
      setNotice("A composição não tem principal com texto resolvido; não existe consulta central para investigar.");
      return;
    }
    if (!data.article) { setNotice("O ArticleDNA desta linha não foi resolvido; a investigação não pode congelar o fundamento."); return; }

    /*
     * O MODO É ESCOLHIDO ANTES E CONGELA COM A INVESTIGAÇÃO.
     *
     * Web pesquisa páginas; YouTube pesquisa vídeos. Os dois produzem modelos
     * competitivos diferentes, e trocar no meio faria a leitura descrever um
     * universo que não foi o pesquisado.
     */
    const modoDaPesquisa = searchModeByArticle[target.articleId] || RADAR_DEFAULT_SEARCH_MODE;
    const consultaCentral = investigacao.plan.primary;

    /*
     * A CANÔNICA JÁ PAGA NÃO É RECOLETADA — Gate 18.9 · §4.
     *
     * "Cada investigação paga a sua coleta" continua valendo para uma
     * investigação NOVA: é isso que impede misturar rodada nova com dado
     * antigo. Mas RETOMAR não é começar. Quando a consulta central já tem
     * evidência gravada — porque a rodada anterior a coletou, ou porque ela foi
     * recuperada do banco — consultar o DataForSEO de novo cobraria a segunda
     * vez pelo mesmo dado, que foi o defeito que o Gate 18.8 encontrou.
     *
     * A porta é `evidence`, não o carimbo `EXECUTED`: uma consulta marcada como
     * executada e sem evidência nunca produziu SERP, e precisa mesmo ser feita.
     */
    const retomada = investigacao.resumption;
    const registroAnterior = investigacao.record;
    const planoDeReaproveitamento = radarCanonicalReusePlan({
      resumption: retomada,
      hasPersistedRecord: Boolean(registroAnterior),
      hasCanonicalSnapshot: Boolean(data.latestSerpRecord?.research),
    });
    const reaproveitarCanonica = planoDeReaproveitamento.reuse;
    history.capture(`${reaproveitarCanonica ? "Completar" : "Iniciar"} pesquisa ${radarSearchModeLabel(modoDaPesquisa)} de ${target.title}`);
    let registro = reaproveitarCanonica && registroAnterior
      ? registroAnterior
      : startRadarDeepResearch({ context: data.researchContext, plan: investigacao.plan, startedBy: sessionId(session), primarySearchMode: modoDaPesquisa });

    /*
     * 1. A SERP CANÔNICA — coletada quando falta, reaproveitada quando existe.
     */
    let research: SerpResearchSnapshot | null = null;
    if (reaproveitarCanonica) {
      research = data.latestSerpRecord?.research || null;
      setNotice(`SERP principal reaproveitada do que já está gravado (v${research?.version || 1}). ${planoDeReaproveitamento.reason}`);
    } else {
      const status = await collect(target);
      const coletado = ultimaColetaRef.current;
      research = status === "WAITING_REVIEW" && coletado?.articleId === target.articleId ? coletado.research : null;
      if (!research) {
        registro = settleRadarDeepResearchQuery(registro, consultaCentral.queryId, { execution: "NOT_EXECUTED", reason: "A coleta da SERP não foi concluída; a consulta central não chegou a ser executada." });
        return;
      }
      registro = settleRadarDeepResearchQuery(registro, consultaCentral.queryId, {
        execution: "EXECUTED",
        reason: `SERP canônica do artigo: ${research.organicResults.length} resultado(s) observados. Ela é a que vai à revisão e à aprovação.`,
        evidence: radarQueryEvidenceFrom({ serpClass: "canonical", research }),
      });
    }
    if (!research) return;

    /*
     * 2. AS SERPs AUXILIARES DE PESQUISA.
     *
     * Uma por keyword secundária ou de reforço que o plano marcou para executar.
     * Cada uma é uma chamada paga, então a recusa de qualquer uma é registrada
     * com motivo e a investigação continua — nenhuma consulta some do registro.
     *
     * O que elas produzem é evidência: alimentam o universo competitivo e nunca
     * viram a SERP do artigo.
     */
    /*
     * SÓ O QUE FALTA — Gate 18.9 · §6.
     *
     * A fila sai da autoridade de retomada, não de um filtro local por
     * `PLANNED`. A diferença aparece na segunda passada: uma auxiliar que já
     * tem evidência fica de fora (não se paga duas vezes pela mesma consulta),
     * e uma que falhou na tentativa anterior entra de novo (um erro de rede
     * não pode apagar uma consulta do plano em silêncio). Consulta dispensada
     * pelo plano nunca entra: ela é decisão, não ausência.
     */
    const auxiliares = radarResearchResumption({ record: registro }).auxiliaryToCollect.filter(query => query.keyword);
    for (const [indice, auxiliar] of auxiliares.entries()) {
      setNotice(`Pesquisando "${auxiliar.keyword}" (${indice + 1} de ${auxiliares.length} consulta(s) auxiliar(es))…`);
      try {
        const pesquisa = await pipeline.collectAuxiliarySerp(target.articleId, auxiliar.keywordId, pipeline.snapshot?.brand.localizacao || "Brasil", target.articleDnaVersionId);
        registro = settleRadarDeepResearchQuery(registro, auxiliar.queryId, {
          execution: "EXECUTED",
          reason: `SERP auxiliar de pesquisa (${auxiliar.role === "secundaria" ? "secundária" : "reforço"}): ${pesquisa.organicResults.length} resultado(s). Não é a SERP do artigo e não vai à aprovação.`,
          evidence: radarQueryEvidenceFrom({ serpClass: "auxiliary", research: pesquisa }),
        });
      } catch (error) {
        registro = settleRadarDeepResearchQuery(registro, auxiliar.queryId, {
          execution: "NOT_EXECUTED",
          reason: `A coleta auxiliar desta keyword não foi concluída: ${error instanceof Error ? error.message : "erro não identificado"}`,
        });
      }
    }

    /* 3. O congelamento e as evidências, gravados na versão da análise. */
    if (!claimSerpAction({ articleId: target.articleId, kind: "start" })) return;
    setNotice("");
    try {
      const executadas = registro.queries.filter(query => query.execution === "EXECUTED");
      const auxiliaresExecutadas = executadas.filter(query => query.serpClass === "auxiliary").length;

      /*
       * A SELEÇÃO É AUTOMÁTICA — e vai gravada junto, na mesma escrita.
       *
       * Ninguém marca dezoito caixinhas para depois confirmar. O sistema decide
       * com os sinais que acabou de apurar, registra o motivo de cada uma, e a
       * pessoa continua livre para mudar o que quiser depois.
       */
      const selecao = buildRadarAutomaticResearchCuration({
        record: registro, context: data.researchContext, confirmedBy: sessionId(session), mode: modoDaPesquisa,
      });
      if (selecao.curation) registro = { ...registro, researchCuration: selecao.curation };

      /*
       * O NÚMERO É O QUE ACONTECEU — §10. Nada de "4" fixo: o plano varia por
       * artigo, e reaproveitar a canônica também conta como consulta resolvida.
       */
      const aviso = `Pesquisa ${reaproveitarCanonica ? "completada" : "concluída"}: ${executadas.length} consulta(s) — 1 SERP canônica (${reaproveitarCanonica ? "reaproveitada, sem nova cobrança" : "coletada agora"}) e ${auxiliaresExecutadas} auxiliar(es). ${selecao.references.length} página(s) observada(s), ${selecao.selected} selecionada(s) automaticamente para análise.`;
      /*
       * A VERSÃO NASCE SOBRE O SNAPSHOT QUE ACABOU DE CHEGAR.
       *
       * Enquanto a coleta era reaproveitada, dava para criar só uma sucessora
       * com o registro. Com recoleta sempre, herdar as decisões antigas faria a
       * curadoria descrever um snapshot que não existe mais — a fábrica é quem
       * amarra decisões, hash e versão do snapshot corrente.
       */
      const next = await curationVersionFor(target, data.article, research, registro);
      await persistSerpAnalysis(target.articleId, next, aviso);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a pesquisa profunda.");
    } finally { releaseSerpAction(target.articleId, "start"); }
  };


  /*
   * RECUPERAR O QUE JÁ FOI PAGO — §11.
   *
   * Leitura pura: pergunta ao banco qual coleta real já existe para este artigo
   * e a traz de volta ao estado da tela. Nenhuma unidade é gasta, e as três
   * respostas possíveis são ditas com o nome que têm.
   */
  const recuperarPesquisaPaga = async () => {
    const target = activeRadarItem;
    if (!target) { setNotice("Selecione um artigo antes de recuperar a pesquisa."); return; }
    if (pesquisaEmVooRef.current || collectingArticleIdRef.current || serpActionRef.current || serpAction || busyArticleId) {
      setNotice("Há uma ação em andamento neste artigo. Aguarde a conclusão antes de recuperar.");
      return;
    }
    const data = activeWorkbenchData;
    setNotice("Procurando no banco uma coleta real já gravada para este artigo…");
    try {
      const resultado = await pipeline.recoverSerp(target.articleId);
      const research = resultado.record?.research || null;
      if (resultado.state !== "RECOVERED" || !research) { setNotice(resultado.reason); return; }

      /*
       * RECUPERAR O SNAPSHOT NÃO É RETOMAR A PESQUISA — Gate 18.9 · §2.
       *
       * O Gate 18.8 devolvia a SERP paga ao `workspace` e parava aí. Mas o
       * estado da Fase 1 não mora no snapshot: `radarDeepResearchState` lê
       * `analysis.payload.deepResearch`, e sem registro ele responde
       * NOT_STARTED. Era exatamente a contradição que o USER viu — snapshot v8
       * recuperado, card "Não iniciado", CTA oferecendo recoletar.
       *
       * Materializar é gravar a consulta CANÔNICA como executada, com a
       * evidência do snapshot recuperado, na versão da análise. As auxiliares
       * continuam PLANNED: elas não foram executadas, e dizer o contrário
       * prometeria um universo competitivo que não existe.
       */
      const investigacao = data?.deepResearch;
      if (!data?.article || !investigacao?.plan.primary?.queryId) {
        setNotice(`${resultado.reason} O fundamento do artigo não está resolvido nesta tela, então a retomada não pôde ser gravada.`);
        return;
      }
      if (investigacao.resumption.canonicalComplete) { setNotice(resultado.reason); return; }
      if (!claimSerpAction({ articleId: target.articleId, kind: "start" })) return;
      try {
        const modoDaPesquisa = searchModeByArticle[target.articleId] || RADAR_DEFAULT_SEARCH_MODE;
        /*
         * Registro existente é preservado; só nasce um novo quando não há
         * nenhum. Sobrescrever apagaria auxiliares já executadas e faria a
         * retomada recoletar o que já foi pago.
         */
        const base = investigacao.record
          || startRadarDeepResearch({ context: data.researchContext, plan: investigacao.plan, startedBy: sessionId(session), primarySearchMode: modoDaPesquisa });
        const registro = settleRadarDeepResearchQuery(base, investigacao.plan.primary.queryId, {
          execution: "EXECUTED",
          reason: `SERP canônica v${research.version || 1} recuperada do que já estava gravado: ${research.organicResults.length} resultado(s). Nenhuma consulta nova foi feita ao provider.`,
          evidence: radarQueryEvidenceFrom({ serpClass: "canonical", research }),
        });
        const retomada = radarResearchResumption({ record: registro });
        const next = await curationVersionFor(target, data.article, research, registro);
        await persistSerpAnalysis(target.articleId, next,
          `${resultado.reason} Consulta principal materializada; ${retomada.auxiliaryToCollect.length} consulta(s) auxiliar(es) ainda a executar.`);
      } finally { releaseSerpAction(target.articleId, "start"); }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "A recuperação da pesquisa não pôde ser concluída.");
    }
  };

  /*
   * E TERMINA AQUI — TAMBÉM SÓ AQUI.
   *
   * Nenhuma etapa fecha a investigação sozinha. Quem declara o encerramento é
   * uma pessoa, e nem ela consegue encerrar o que não concluiu nada: a
   * suficiência responde antes.
   */
  const finalizeInvestigation = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data) { setNotice("Selecione um artigo antes de finalizar a investigação."); return; }
    if (serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) {
      setNotice("Outra ação ainda está em andamento neste artigo. Aguarde a conclusão.");
      return;
    }
    if (!data.analysis) { setNotice("Não existe versão de análise onde registrar a conclusão desta investigação."); return; }
    const investigacao = data.deepResearch;
    if (!investigacao) { setNotice("O contexto desta investigação não foi resolvido."); return; }

    const resultado = finalizeRadarDeepResearch({
      record: data.analysis.payload.deepResearch,
      currentFingerprint: investigacao.fingerprint,
      sufficiency: investigacao.sufficiency,
      summary: investigacao.summary,
      analyzed: investigacao.observed.sample.analyzedSuccess,
      finalizedBy: sessionId(session),
    });
    if (!resultado.ok) { setNotice(resultado.reason); return; }

    /*
     * FINALIZAR É CONGELAR — e congelar acontece ANTES de gravar.
     *
     * O bundle nasce aqui, do que o ANALYZE já produziu: nenhuma busca, nenhum
     * provider, nenhuma leitura nova. Se ele não puder ser montado, nada é
     * gravado — melhor não finalizar do que gravar um carimbo sem a fotografia
     * que ele deveria provar.
     */
    const congelamento = freezeRadarEvidenceBundle({
      readiness: investigacao.finalization,
      observed: investigacao.observed,
      record: resultado.record,
      mode: resultado.record.primarySearchMode,
      sufficiency: investigacao.sufficiency,
      /*
       * §26 — O DOSSIÊ EDITORIAL CONGELA JUNTO.
       *
       * A pauta do especialista e a de vídeos descrevem EXATAMENTE esta rodada.
       * Deixá-las fora do congelamento faria as duas envelhecerem em ritmo
       * diferente da evidência que as originou.
       */
      blueprint: investigacao.blueprint,
      frozenBy: sessionId(session),
      frozenAt: resultado.record.finalizedAt || new Date().toISOString(),
    });
    if (!congelamento.ok) { setNotice(congelamento.reason); return; }

    if (!claimSerpAction({ articleId: target.articleId, kind: "decision" })) return;
    history.capture(`Finalizar investigação de ${target.title}`);
    setNotice("");
    try {
      const next = await createRadarAnalysisSuccessor(data.analysis, { deepResearch: resultado.record, finalizedBundle: congelamento.bundle }, sessionId(session), undefined, crypto.randomUUID());
      /*
       * "FINALIZADA" SÓ DEPOIS DO READBACK.
       *
       * Estado local mudado não é investigação congelada: sem a confirmação
       * remota, o que existe é uma recuperação local que a próxima máquina não
       * enxerga. O aviso diz qual dos dois aconteceu, sem arredondar.
       */
      /*
       * O CONGELAMENTO TAMBÉM É ESCRITA DE AUTORIDADE — 18.10.3 · passo 10.
       *
       * O 18.10 já impediu o bundle não confirmado de entrar na projeção, então
       * a tela não mentia. Mas o erro remoto continuava virando fallback local:
       * a pessoa lia "não foi finalizada" sem o status nem o código, e a única
       * saída era tentar de novo às cegas. Aqui a falha sobe com HTTP e code.
       */
      const gravado = await pipeline.saveRadarAnalysis(target.articleId, next, { requireRemote: true });
      const desfecho = radarActionOutcome({
        action: "FINALIZE",
        persistence: gravado,
        successMessage: `Investigação finalizada e congelada: ${radarSufficiencyLabel(investigacao.sufficiency.level)}. Evidências ${congelamento.bundle.bundleId} · hash ${congelamento.bundle.bundleHash}. Persistência remota e readback confirmados.`,
      });
      setNotice(desfecho.message);
    } catch (error) {
      setNotice(radarActionOutcome({ action: "FINALIZE", error }).message);
    } finally { releaseSerpAction(target.articleId, "decision"); }
  };

  /*
   * A CURADORIA DA PESQUISA PROFUNDA — decisão humana sobre o universo.
   *
   * Ela NÃO toca a curadoria da SERP canônica: são duas listas, duas
   * identidades, duas decisões. O que elas compartilham é a disciplina —
   * rascunho na tela, uma escrita ao confirmar, um readback, um aviso.
   */
  const confirmResearchCuration = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data) { setNotice("Selecione um artigo antes de confirmar a curadoria da pesquisa."); return; }
    if (serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) {
      setNotice("Outra ação ainda está em andamento neste artigo. Aguarde a conclusão.");
      return;
    }
    if (!data.analysis) { setNotice("Não existe versão de análise onde registrar a curadoria da pesquisa."); return; }
    const investigacao = data.deepResearch;
    if (!investigacao?.references.length) { setNotice("Nenhuma referência pesquisada para curar. Inicie a pesquisa profunda antes."); return; }
    if (!investigacao.curation.dirtyCount) { setNotice("Nenhuma alteração da curadoria da pesquisa para confirmar."); return; }

    const curadoria = buildRadarResearchCuration({ view: investigacao.curation, confirmedBy: sessionId(session) });
    const registro = data.analysis.payload.deepResearch;
    if (!registro) { setNotice("Esta versão não tem investigação profunda registrada; inicie a pesquisa antes de curar."); return; }

    if (!claimSerpAction({ articleId: target.articleId, kind: "decision" })) return;
    history.capture(`Confirmar curadoria da pesquisa de ${target.title}`);
    setNotice("");
    try {
      const next = await createRadarAnalysisSuccessor(
        data.analysis,
        { deepResearch: { ...registro, researchCuration: curadoria } },
        sessionId(session), undefined, crypto.randomUUID(),
      );
      await persistSerpAnalysis(target.articleId, next, `Curadoria da pesquisa confirmada: ${investigacao.curation.selectedCount} referência(s) na amostra, de ${investigacao.curation.availableCount} pesquisada(s).`);
      setResearchDraftByArticle(current => ({ ...current, [target.articleId]: {} }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível confirmar a curadoria da pesquisa.");
    } finally { releaseSerpAction(target.articleId, "decision"); }
  };

  /*
   * A CURADORIA É CONFIRMADA UMA VEZ, NÃO A CADA CLIQUE.
   *
   * Cada classificação criava uma versão remota e reabria a análise: escolher
   * sete referências produzia sete decisões editoriais definitivas e sete
   * avisos iguais. Marcar virou rascunho na tela; aqui chega o conjunto
   * inteiro, em uma escrita, um readback e um aviso.
   */
  const confirmSerpCuration = async (changes: Array<{ key: string; role: RadarSerpDecisionRole; reason?: string }>) => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data?.analysis || !data.view || serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) return;
    if (!changes.length) { setNotice("Nenhuma alteração de curadoria para confirmar."); return; }
    const conhecidas = new Set(data.analysis.payload.serpDecisions.map(decision => decision.key));
    if (changes.some(change => !conhecidas.has(change.key))) {
      setNotice("Uma das decisões não pertence ao snapshot SERP atualmente selecionado.");
      return;
    }
    const porChave = new Map(changes.map(change => [change.key, change]));
    const nextDecisions = data.analysis.payload.serpDecisions.map(decision => {
      const change = porChave.get(decision.key);
      if (!change) return decision;
      const valores = decisionForSerpRole(change.role);
      return { ...decision, decision: valores.decision, reason: change.reason?.trim() || valores.reason };
    });
    const projected = { ...data.analysis, payload: { ...data.analysis.payload, serpDecisions: nextDecisions } } as RadarAnalysisVersion;
    const selectedCompetitorIds = selectedRadarOrganicDecisionKeys(data.view, projected, radarSelectionScope(target));
    const selectedUrls = new Set(data.view.organicResults.filter(result => selectedCompetitorIds.includes(radarOrganicDecisionKey(result))).map(result => result.url));
    /*
     * Extração de página que saiu da seleção não sobrevive: a análise da
     * versão nova descreve exatamente a amostra confirmada agora.
     */
    const retainedExtractions = data.analysis.payload.extractions.filter(page => selectedUrls.has(page.url));
    if (!claimSerpAction({ articleId: target.articleId, kind: "decision" })) return;
    setNotice("");
    try {
      const next = await createRadarAnalysisSuccessor(data.analysis, {
        serpDecisions: nextDecisions,
        selectedCompetitorIds,
        extractionIds: retainedExtractions.map(page => page.id),
        extractions: retainedExtractions,
        benchmark: null,
        semanticTerms: [],
        structuralDecisions: [],
        competitiveness: null,
        competitiveReport: null,
        plannerPackage: null,
        plannerTransfer: null,
      }, sessionId(session), undefined, crypto.randomUUID());
      await persistSerpAnalysis(target.articleId, next, `Seleção confirmada: ${selectedCompetitorIds.length} referência(s) serão usadas na análise.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível confirmar a curadoria.");
    } finally { releaseSerpAction(target.articleId, "decision"); }
  };
  const analyzeSerpSelection = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data?.article || !data.analysis || !data.view?.record.research || serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) return;
    const canonicos = radarAnalysisCandidates(data.view, data.analysis, radarSelectionScope(target));
    /*
     * AS REFERÊNCIAS DA PESQUISA ENTRAM NA MESMA ANÁLISE.
     *
     * Só as confirmadas, só as ainda não extraídas, e sempre por ID: a URL de
     * cada uma é resolvida no servidor, a partir da curadoria persistida.
     */
    const jaExtraidas = new Set(data.analysis.payload.extractions.map(page => radarNormalizedUrl(page.url)));
    /*
     * UMA URL, UM CANDIDATO — mesmo vindo das duas curadorias.
     *
     * A canônica endereça por posição e a pesquisa por referenceId: chaves
     * diferentes para o mesmo destino. Sem esta dedução por URL normalizada, a
     * mesma página era buscada duas vezes e a conta do aviso não fechava
     * (13 tentativas para 12 pendentes).
     */
    const jaCobertas = new Set(canonicos.map(candidate => radarNormalizedUrl(candidate.url)));
    const daPesquisa = (data.deepResearch?.curation.confirmed ? data.deepResearch.curation.selectedRows : [])
      .filter(row => row.confirmedDecision
        && !jaExtraidas.has(row.reference.normalizedUrl)
        && !jaCobertas.has(row.reference.normalizedUrl))
      .map(row => ({ source: "research" as const, referenceId: row.reference.referenceId }));
    const candidates = [...canonicos, ...daPesquisa];
    /* A chave que o servidor devolve no erro: posição da canônica ou id da referência. */
    const chaveDoCandidato = (candidate: (typeof candidates)[number]) => "source" in candidate ? candidate.referenceId : candidate.key;
    /*
     * RETOMAR A CONSOLIDAÇÃO NÃO EXIGE PÁGINA NOVA — 18.10.1 · §3.
     *
     * A auditoria achou a v24 com 11 páginas gravadas e sem
     * `analysisCompletedAt`: nada a extrair, e ainda assim tudo por
     * consolidar. Este porteiro recusava exatamente esse caso, e o artigo
     * ficava parado com o trabalho pago dentro do banco.
     *
     * Quando a versão remota já tem páginas e o carimbo não veio, o que
     * falta é a segunda metade do ANALYZE — e ela roda sobre o que já está
     * gravado. PAGE_EXTRACTION_CALLS = 0.
     */
    const persistencia = data.deepResearch?.persistence;
    const retomandoConsolidacao = persistencia?.state === "ANALYSIS_PARTIALLY_PERSISTED";
    if (!candidates.length && !retomandoConsolidacao) { setNotice("Nenhuma referência selecionada aguarda análise. Ajuste a curadoria ou consulte as páginas já analisadas."); return; }
    const research = data.view.record.research;
    if (!claimSerpAction({ articleId: target.articleId, kind: "extract" })) return;
    setNotice("");
    try {
      /*
       * A SELEÇÃO CURADA VAI EM LOTES — o contrato tem um teto real.
       *
       * Sete referências saíam em uma requisição só e voltavam `too_big` em
       * `candidates`, sob a mensagem "Solicitação de extração Radar inválida.".
       * O teto é do servidor e continua lá; o que mudou é que o cliente passou
       * a conhecê-lo em vez de descobrir por 400.
       */
      const principal = radarPrincipalHydrated(data.r3.keyword) ? data.r3.keyword : undefined;
      /*
       * Extração já feita não sai da amostra: ela é reutilizada. O que a
       * análise busca agora são as pendentes — e as três contas aparecem
       * separadas para "1 pendente" nunca mais ser lido como "1 selecionada".
       */
      const membership = buildRadarAnalysisMembership({ view: data.view, analysis: data.analysis, scope: radarSelectionScope(target), researchSelectedUrls: (data.deepResearch?.curation.confirmed ? data.deepResearch.curation.selectedRows : []).map(row => row.reference.url) });
      /*
       * Vazio na retomada: nenhuma página é lida de novo. O laço abaixo
       * inteiro fica sem fila, e `mergedExtractions` cai nas já gravadas.
       */
      const pages: RadarExtractionPage[] = [];
      const falhas: Array<{ key: string; url: string; code: string; message: string; status: number | null; observedAt: string }> = [];
      /*
       * Os lotes são invisíveis: uma análise lógica, um progresso, um
       * resultado. Nada de modelo, lacuna ou necessidade promovido no meio
       * do caminho — a amostra ainda não está fechada.
       */
      let processadas = 0;
      /*
       * O RETRY VIVE AQUI, E ELE É DO SISTEMA.
       *
       * Uma queda de conexão ou um 502 não podem deixar a investigação parada
       * — e um 403 não pode ser tentado para sempre. Cada rodada refaz só as
       * recuperáveis; o que sobra vira limitação declarada, com PENDING = 0.
       */
      const tentativas = new Map<string, number>();
      /*
       * RETOMAR CONSOLIDAÇÃO NÃO LÊ PÁGINA NENHUMA — 18.10.1 · §3 e §9.
       *
       * `radarAnalysisCandidates` exclui as páginas EXTRAÍDAS COM SUCESSO, não
       * as que falharam: as 5 "sem acesso" da rodada anterior voltam à lista de
       * candidatas. Deixar a fila cheia aqui faria "Concluir análise" relê-las —
       * contradizendo o próprio ⓘ, que promete que nada é coletado de novo.
       *
       * Elas já foram tentadas, já esgotaram o retry das recuperáveis e já estão
       * gravadas como limitação declarada na v24. A retomada consolida o que
       * existe; quem quiser tentar de novo aquelas páginas muda a curadoria, que
       * é outra decisão — e ela não pode acontecer por dentro desta.
       */
      let fila = retomandoConsolidacao ? [] : [...candidates];
      let rodada = 0;
      while (fila.length) {
        rodada += 1;
      for (const lote of radarExtractionBatches(fila)) {
        const response = await fetch("/api/editorial/radar-analysis/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: target.brandId, articleId: target.articleId, analysis: data.analysis, candidates: lote, snapshotId: research.id, snapshotHash: research.contentHash, ...(data.deepResearch?.curation.confirmed ? { universeFingerprint: data.deepResearch.curation.universeFingerprint } : {}), ...(principal ? { keyword: principal } : {}) }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          // A tela lê a frase; o log guarda o código e o caminho que recusou.
          console.error("[radar:extract]", body.code, body.details ? JSON.stringify(body.details) : "");
          throw new Error(radarExtractionErrorMessage(body.code, body.error || "Não foi possível analisar as referências selecionadas."));
        }
        for (const item of Array.isArray(body.pages) ? body.pages : []) {
          const parsed = RadarExtractionPageSchema.safeParse((item as { page?: unknown }).page);
          if (parsed.success) pages.push(parsed.data);
        }
        for (const item of Array.isArray(body.errors) ? body.errors : []) {
          const registro = item as { key?: string; error?: { url?: string; message?: string; code?: string; status?: number } };
          // Cada falha guarda URL, código e status: "3 não processadas" deixa de ser tudo o que sobra.
          if (registro.error?.url) falhas.push({
            key: registro.key || registro.error.url,
            url: registro.error.url,
            code: registro.error.code || "fetch_failed",
            message: registro.error.message || "Falha na extração.",
            status: typeof registro.error.status === "number" ? registro.error.status : null,
            observedAt: new Date().toISOString(),
          });
        }
        processadas += lote.length;
        if (processadas < candidates.length) setNotice(`Analisando páginas ${processadas} de ${candidates.length}…`);
      }

      /* Quem falhou por motivo do momento volta para a fila; o resto encerra. */
      for (const candidate of fila) tentativas.set(chaveDoCandidato(candidate), rodada);
      const recuperaveis = falhas.filter(falha =>
        (tentativas.get(falha.key) || rodada) < RADAR_EXTRACTION_MAX_ATTEMPTS
        && radarExtractionFailureIsRecoverable({ code: falha.code, status: falha.status }));
      fila = recuperaveis.length
        ? fila.filter(candidate => recuperaveis.some(falha => falha.key === chaveDoCandidato(candidate)))
        : [];
      if (fila.length) {
        /* A falha volta a ser tentativa: só a última fica registrada. */
        for (const candidate of fila) {
          const chave = chaveDoCandidato(candidate);
          const indice = falhas.findIndex(falha => falha.key === chave);
          if (indice >= 0) falhas.splice(indice, 1);
        }
        setNotice(`Repetindo ${fila.length} página(s) que falharam por motivo temporário…`);
      }
      }
      // Uma página que falhou não invalida as outras; nenhuma analisada, sim.
      if (!pages.length && !retomandoConsolidacao) throw new Error(falhas.length
        ? `Nenhuma das ${candidates.length} página(s) pendente(s) pôde ser analisada. As ${membership.reused} já analisada(s) continuam na amostra.`
        : "Nenhuma página pendente foi analisada.");

      /*
       * ====== A AMOSTRA É GRAVADA ANTES DE VERIFICAR AS FONTES ==========
       *
       * O SMOKE ENCONTROU ISTO: \`SOURCE_UNKNOWN\` para dois sourceId que o
       * próprio pipeline acabara de selecionar.
       *
       * A CAUSA ERA DE ORDEM, NÃO DE IDENTIDADE. O cliente montava o plano de
       * fontes sobre as páginas persistidas MAIS as recém-extraídas em memória;
       * a rota reconstruía o plano lendo as extrações da versão informada — que
       * ainda era a ANTERIOR, sem nenhuma das 12 páginas lidas na rodada. As
       * fontes descobertas nelas simplesmente não existiam para o servidor.
       *
       * Gravar a amostra primeiro resolve na raiz e sem enfraquecer nada: o
       * cliente continua mandando só \`sourceId\`, o servidor continua resolvendo
       * o endereço a partir do que está persistido — e agora os dois lados leem
       * exatamente o mesmo conjunto de páginas.
       *
       * O ganho secundário é de robustez: a extração é a parte cara da operação
       * e passa a estar salva antes de qualquer coisa que possa falhar depois.
       * Antes, um erro na verificação descartava as 12 páginas já lidas.
       */
      const selectionScope = radarSelectionScope(target);
      const selectedKeys = selectedRadarOrganicDecisionKeys(data.view, data.analysis, selectionScope);
      /* A dedução da amostra é por URL normalizada: uma página, um registro. */
      const novasNormalizadas = new Set(pages.map(page => radarNormalizedUrl(page.url)));
      const mergedExtractions = [...data.analysis.payload.extractions.filter(page => !novasNormalizadas.has(radarNormalizedUrl(page.url))), ...pages];
      const amostraPayload = {
        ...data.analysis.payload,
        /*
         * A AMOSTRA NÃO É A ANÁLISE CONCLUÍDA — §7.
         *
         * Esta versão tem as páginas lidas e ainda não tem fontes verificadas,
         * modelo nem relatório. Sem o carimbo, a Fase 1 não oferece FINALIZE
         * sobre ela — que foi exatamente o que o segundo smoke viu acontecer.
         */
        analysisCompletedAt: null,
        selectedCompetitorIds: selectedKeys,
        extractionIds: [...new Set(mergedExtractions.map(page => page.id))],
        extractions: mergedExtractions,
        extractionFailures: falhas,
      };
      /*
       * NA RETOMADA, A AMOSTRA JÁ É A VERSÃO REMOTA — §3 e §5.
       *
       * Gravar de novo criaria uma versão idêntica à v24 só para reconquistar
       * um readback que ela já tem. A rota de verificação lê a análise
       * PERSISTIDA pelo `analysisVersionId`, e a v24 é exatamente isso: a
       * versão gravada com as 11 páginas dentro.
       */
      /*
       * A BASE DA RETOMADA VEM DO SERVIDOR — 18.10.2 · §1, §3 e §7.
       *
       * `data.analysis` é a versão que a TELA está mostrando, e o workspace
       * também guarda versões aplicadas localmente pelo fallback do 18.10 —
       * de propósito, para não perder trabalho. A mais recente delas venceu a
       * seleção e virou o `analysisVersionId` mandado ao endpoint, que só
       * conhece o que está gravado: SOURCE_ANALYSIS_UNKNOWN.
       *
       * Aqui a base é LIDA do banco e provada contra o snapshot e o
       * fundamento correntes. Se a prova falhar, o endpoint não é chamado —
       * gastar verificação sabendo que a identidade é inválida seria pagar
       * por um erro conhecido.
       */
      let versaoDaAmostra: RadarAnalysisVersion;
      let lockRemoto: number | null = null;
      if (retomandoConsolidacao) {
        const remoto = await pipeline.readRemoteRadarAnalyses(target.articleId);
        if (!remoto.available) throw new Error(`A retomada precisa da análise gravada no servidor, e a leitura não pôde ser confirmada: ${remoto.reason}`);
        const base = radarResumableRemoteAnalysis({
          analyses: remoto.analyses,
          snapshot: { id: research.id, version: research.version, hash: research.contentHash },
          articleDnaVersionId: target.articleDnaVersionId,
        });
        if (!base.ok) throw new Error(`A consolidação não pôde ser retomada: ${base.reason}`);
        versaoDaAmostra = base.version as RadarAnalysisVersion;
        lockRemoto = remoto.lockVersion;
        setNotice(base.reason);
      } else {
        versaoDaAmostra = await createRadarAnalysisSuccessor(data.analysis, amostraPayload, sessionId(session), undefined, crypto.randomUUID());
      }
      const amostraSalva = retomandoConsolidacao
        ? { persistenceMode: "remote" as const, readbackConfirmed: true }
        : await pipeline.saveRadarAnalysis(target.articleId, versaoDaAmostra);
      if (!(amostraSalva.persistenceMode === "remote" && amostraSalva.readbackConfirmed)) {
        /*
         * SEM READBACK DA AMOSTRA, NÃO SE VERIFICA FONTE.
         *
         * A rota resolve o sourceId a partir do que está GRAVADO. Pedir a
         * verificação sobre uma amostra que o servidor não confirmou produziria
         * exatamente o SOURCE_UNKNOWN que esta correção existe para eliminar.
         */
        throw new Error("As páginas foram lidas, mas a gravação da amostra não foi confirmada. A verificação de fontes não foi executada.");
      }
      /*
       * ============ A VERIFICAÇÃO DE FONTES É SUBETAPA DO ANALYZE ==========
       *
       * Não é um quarto botão. Assim que as páginas terminam de ser lidas, a
       * MESMA operação que a pessoa iniciou segue: as citações observadas nelas
       * viram candidatas, as candidatas viram plano, e o plano é verificado no
       * servidor. Quem clicou em ANALISAR CONCORRÊNCIA pediu a leitura inteira.
       *
       * A tela só manda DOMÍNIO. O endereço é resolvido lá, a partir da análise
       * persistida — e por isso a verificação acontece depois de a versão
       * anterior já estar gravada, nunca sobre o que este cliente montou.
       */
      /* O MESMO conjunto que a rota lê: o da versão da amostra recém-gravada. */
      const paginasDaAmostra = versaoDaAmostra.payload.extractions;
      const semanticoLocal = buildRadarSemanticConceptModel({
        pages: paginasDaAmostra,
        keywordTexts: data.researchContext?.resolvedKeywordTexts || [],
        centralEntities: (data.researchContext?.keywords || [])
          .map(keyword => (keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null)?.payload?.centralEntity)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      });
      const planoDeFontes = buildRadarSourceVerificationPlan({
        candidates: buildRadarExternalSourceResearch({ pages: paginasDaAmostra, semantic: semanticoLocal }).evidenceCandidates,
        claims: buildRadarEvidenceClaims({ semantic: semanticoLocal }),
      });
      const fontesVerificadas: RadarAnalysisPayload["verifiedSources"] = [];
      const falhasDeFonte: RadarAnalysisPayload["sourceVerificationFailures"] = [];
      if (planoDeFontes.length) {
        setNotice(`Verificando ${planoDeFontes.length} fonte(s) relevante(s)…`);
        /* Uma fonte que falha por motivo do momento volta; o resto encerra. */
        const tentativasDeFonte = new Map<string, number>();
        let filaDeFontes = planoDeFontes.map(item => item.sourceId);
        let rodadaDeFonte = 0;
        while (filaDeFontes.length) {
          rodadaDeFonte += 1;
          const recusadasNestaRodada: RadarAnalysisPayload["sourceVerificationFailures"] = [];
          for (const lote of radarSourceVerificationBatches(filaDeFontes)) {
            const resposta = await fetch("/api/editorial/radar-analysis/verify-sources", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                brandId: target.brandId, articleId: target.articleId,
                /* A versão da AMOSTRA: a mesma que a rota vai ler para resolver os ids. */
                analysisVersionId: versaoDaAmostra.versionId,
                articleDnaVersionId: versaoDaAmostra.payload.articleDnaVersionId,
                sourceIds: lote,
                keywordTexts: data.researchContext?.resolvedKeywordTexts || [],
                centralEntities: (data.researchContext?.keywords || [])
                  .map(keyword => (keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null)?.payload?.centralEntity)
                  .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
              }),
            });
            const corpo = await resposta.json().catch(() => ({}));
            if (!resposta.ok) {
              /*
               * FALHAR AO VERIFICAR NÃO INVALIDA A ANÁLISE.
               *
               * A amostra competitiva já foi lida e continua valendo. O que se
               * perde é a camada factual — e ela vira limitação declarada, não
               * exceção que apaga o trabalho da pessoa.
               */
              console.error("[radar:verify-sources]", corpo.code, corpo.details ? JSON.stringify(corpo.details) : "");
              for (const sourceId of lote) {
                const alvo = planoDeFontes.find(item => item.sourceId === sourceId);
                recusadasNestaRodada.push({ sourceId, domain: alvo?.domain || sourceId, url: alvo?.candidateUrl || "", code: corpo.code || "verification_failed", message: radarSourceVerificationErrorMessage(corpo.code, corpo.error || "A fonte não pôde ser verificada."), status: resposta.status, observedAt: new Date().toISOString() });
              }
              continue;
            }
            for (const item of Array.isArray(corpo.verified) ? corpo.verified : []) fontesVerificadas.push(item);
            for (const item of Array.isArray(corpo.failures) ? corpo.failures : []) recusadasNestaRodada.push(item);
          }

          for (const sourceId of filaDeFontes) tentativasDeFonte.set(sourceId, rodadaDeFonte);
          const recuperaveisDeFonte = recusadasNestaRodada.filter(falha =>
            (tentativasDeFonte.get(falha.sourceId) || rodadaDeFonte) < RADAR_EXTRACTION_MAX_ATTEMPTS
            && radarExtractionFailureIsRecoverable({ code: falha.code, status: falha.status }));
          falhasDeFonte.push(...recusadasNestaRodada.filter(falha => !recuperaveisDeFonte.includes(falha)));
          filaDeFontes = recuperaveisDeFonte.map(falha => falha.sourceId);
          if (filaDeFontes.length) setNotice(`Repetindo ${filaDeFontes.length} fonte(s) que falharam por motivo temporário…`);
        }
        setNotice("Consolidando evidências…");
      }

      const primaryUrls = new Set([
        ...buildRadarSerpSelectionProjection(data.view, data.analysis, selectionScope).rows.filter(selection => selection.role === "primary").map(selection => selection.result.url),
        // O benchmark também é formado pelas referências que a pesquisa confirmou como concorrente.
        ...(data.deepResearch?.curation.confirmed ? data.deepResearch.curation.rows.filter(row => row.confirmedDecision === "primary").map(row => row.reference.url) : []),
      ]);
      /*
       * OS MODELOS SAEM DAS PÁGINAS DA BASE — 18.10.2.
       *
       * `pages` é o que foi lido AGORA, e na retomada isso é zero por
       * construção: benchmark vazio, zero termos recorrentes, competitividade
       * "insufficient_evidence" — um carimbo de análise sobre nada. As páginas
       * que sustentam a consolidação são as da versão base, gravadas.
       */
      const paginasDoModelo = retomandoConsolidacao ? paginasDaAmostra : pages;
      const benchmark = buildRadarBenchmark(versaoDaAmostra.payload.mode, paginasDoModelo.filter(page => primaryUrls.has(page.url)));
      const semanticTerms = paginasDoModelo.flatMap(page => page.recurringTerms).slice(0, 50).map(term => ({ term: term.term, frequency: term.frequency, pageCount: term.pageCount, pageIds: term.pageIds, sources: term.sources.filter((source): source is "body" | "h1" | "h2" | "h3" | "title" => ["body", "h1", "h2", "h3", "title"].includes(source)), relation: "Termo recorrente observado nas páginas selecionadas.", decision: "pending" as const, note: "" }));
      const structuralDecisions = Object.entries(benchmark.metrics).map(([metricKey, metric]) => ({ key: metricKey, label: metric.label, observedCount: Math.round(metric.mean), sampleSize: metric.sampleSize, observedText: `Observado: média ${metric.mean.toFixed(1)}; faixa ${metric.typicalRange[0].toFixed(0)}–${metric.typicalRange[1].toFixed(0)}.`, level: "optional" as const, enforcement: "advisory" as const, humanNote: "" }));
      const competitorCount = paginasDoModelo.length;
      const competitiveness = { classification: competitorCount >= 5 ? "high" as const : competitorCount >= 3 ? "medium" as const : competitorCount ? "low" as const : "insufficient_evidence" as const, dimensions: { sample: Math.min(1, competitorCount / 5), structure: Math.min(1, (benchmark.metrics.h2?.mean || 0) / 12), depth: Math.min(1, (benchmark.metrics.words?.mean || 0) / 2500) }, reasons: [`${competitorCount} página(s) selecionada(s) foram extraídas.`, "A classificação é observacional e não define o plano editorial."], score: competitorCount ? Math.min(1, competitorCount / 5) : null };
      const nextVersionId = crypto.randomUUID();
      /* A camada de evidência sobe sobre a amostra já gravada, não sobre a anterior. */
      /* O carimbo entra na versão FINAL: é ela que completa o pipeline. */
      const candidatePayload = { ...versaoDaAmostra.payload, analysisCompletedAt: new Date().toISOString(), verifiedSources: fontesVerificadas, sourceVerificationFailures: falhasDeFonte, benchmark, semanticTerms, structuralDecisions, competitiveness };
      const report = await buildRadarCompetitiveReport({ payload: candidatePayload, article: data.article!.payload, research, researchContext: data.researchContext, references: data.deepResearch?.references, radarItemId: target.id, analysisVersionId: nextVersionId, analysisVersionNumber: versaoDaAmostra.versionNumber + 1, generatedBy: sessionId(session), siloDnaVersionId: target.siloId ? pipeline.siloVersions[target.siloId]?.versionId || null : null, status: "draft" });
      const next = await createRadarAnalysisSuccessor(versaoDaAmostra, { ...candidatePayload, competitiveReport: report }, sessionId(session), undefined, nextVersionId);
      /*
       * A CONTA TEM DE FECHAR NA FRASE.
       *
       * "18 · 6 · 10 · 3" somava 19 e ninguém via onde estava a sobra. Agora o
       * que não teve desfecho aparece como sobra explícita em vez de sumir na
       * diferença entre dois números.
       */
      const semDesfecho = membership.selected - (membership.reused + pages.length + falhas.length);
      /*
       * A RETOMADA TEM CONTA PRÓPRIA — 18.10.1.
       *
       * A frase da rodada normal descreve leitura: "analisadas agora", "sem
       * acesso", "sem desfecho". Numa retomada esses três são zero por
       * construção, e "16 sem desfecho nesta rodada" descreveria como sobra o
       * trabalho que está justamente sendo consolidado. O que a pessoa precisa
       * saber aqui é outro: quantas páginas gravadas alimentaram a consolidação
       * e quantas candidatas ficaram DE FORA — porque ficar de fora é uma
       * decisão, e ela não pode acontecer em silêncio.
       */
      const conta = retomandoConsolidacao
        ? [
          `consolidação retomada sobre ${versaoDaAmostra.payload.extractions.length} página(s) já gravada(s)`,
          "nenhuma página foi lida de novo",
          ...(candidates.length ? [`${candidates.length} candidata(s) sem acesso na rodada anterior continuam de fora`] : []),
        ].join(" · ")
        : [
          `${membership.selected} selecionada(s)`,
          `${membership.reused} reutilizada(s)`,
          `${pages.length} analisada(s) agora`,
          ...(falhas.length ? [`${falhas.length} sem acesso`] : []),
          ...(semDesfecho ? [`${semDesfecho} sem desfecho nesta rodada`] : []),
        ].join(" · ");
      /*
       * A ESCRITA DE AUTORIDADE — 18.10.3 · §1, §3 e §4.
       *
       * É esta que carrega `analysisCompletedAt`. Ela não tem fallback local:
       * ou o banco aceita, ou o erro do servidor aparece inteiro — status,
       * código e corpo. Foi o fallback silencioso aqui que manteve o banco na
       * v24 enquanto a tela mostrava relatório e modelo prontos.
       *
       * E o lock declarado é o que a leitura remota desta mesma operação
       * devolveu, não o que o render capturou: entre um e outro cabe a escrita
       * da amostra da própria rodada.
       */
      const salvo = await pipeline.saveRadarAnalysis(target.articleId, next, {
        requireRemote: true,
        ...(typeof lockRemoto === "number" ? { expectedLock: lockRemoto } : {}),
      });
      setNotice(`${conta}. ${salvo.persistenceMode === "remote" && salvo.readbackConfirmed
        ? "Persistência remota e readback confirmados."
        : "A gravação remota não pôde ser confirmada."}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível analisar as referências selecionadas.");
    } finally { releaseSerpAction(target.articleId, "extract"); }
  };
  const reviewSerpForArticle = async (status: "approved" | "rejected") => {
    if (!activeRadarItem || reviewingArticleIdRef.current || reviewingArticleId || busyArticleId || serpActionRef.current || serpAction) return;
    const target = activeRadarItem;
    const data = rowWorkbenchData(target);
    const record = data.latestSerpRecord;
    if (!record?.research || record.origin !== "real") { setNotice("Apenas uma SERP real com snapshot disponível pode ser revisada."); return; }
    if (status === "approved") {
      const issue = radarSerpApprovalBlockReason({ brandId: target.brandId, articleId: target.articleId, articleDnaVersionId: target.articleDnaVersionId, view: data.view, analysis: data.analysis }) || (data.analysis ? radarSerpApprovalIssues({ view: data.view, analysis: data.analysis, scope: radarSelectionScope(target) })[0] : null);
      if (issue) { setNotice(issue); return; }
    }
    const selectionScope = radarSelectionScope(target);
    const selectionAtStart = selectedRadarOrganicDecisionKeys(data.view, data.analysis, selectionScope).join("|");
    const notes = status === "approved" ? `Aprovação vinculada ao snapshot ${record.id}; seleção humana: ${selectionAtStart || "nenhuma referência orgânica"}.` : "";
    reviewingArticleIdRef.current = target.id;
    setReviewingArticleId(target.id);
    setNotice(status === "approved" ? "Registrando aprovação humana da SERP…" : "Registrando rejeição humana da SERP…");
    try {
      const result = await pipeline.reviewSerp(target.articleId, record.id, status, notes);
      if (result.review.articleId !== target.articleId || result.review.snapshotId !== record.id || result.review.status !== status) throw new Error("O readback da revisão não corresponde ao artigo ou snapshot selecionado.");
      if (status === "approved" && selectedRadarOrganicDecisionKeys(data.view, data.analysis, selectionScope).join("|") !== selectionAtStart) throw new Error("A seleção mudou durante a aprovação; o sucesso não foi emitido.");
      updateLocalState(target.articleId, current => ({ ...current, serp: { ...current.serp, state: status === "approved" ? "COMPLETED" : "WAITING_REVIEW", error: status === "approved" ? null : "SERP rejeitada; refresh explícito disponível." } }));
      setR4SerpQueue(current => current ? updateRadarR4SerpQueueItem(current, target.articleId, status === "approved" ? "COMPLETED" : "WAITING_REVIEW") : current);
      setNotice(result.persistenceMode === "remote" && result.readbackConfirmed
        ? status === "approved" ? "SERP aprovada para este artigo. Write remoto e readback confirmados com a curadoria selecionada." : "SERP rejeitada para este artigo. Write remoto e readback confirmados."
        : "A revisão foi aplicada apenas na recuperação local; a persistência remota e o sucesso da aprovação não foram confirmados.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível registrar a revisão da SERP.");
    } finally { if (reviewingArticleIdRef.current === target.id) reviewingArticleIdRef.current = null; setReviewingArticleId(null); }
  };
  const approveSelected = (ids: string[]) => {
    const rows = pipeline.radarItems.filter(row => ids.includes(row.articleId));
    const eligible = availableBulkActions(selectedSnapshotsFor(rows)).approve.eligible;
    if (!eligible.length) return;
    transition(eligible, "approved", `Aprovar ${eligible.length} artigo(s) após revisão SERP`);
    setNotice(`${eligible.length} artigo(s) aprovado(s) localmente após a revisão SERP.`);
  };
  const reviewSpecialistSelected = (ids: string[]) => {
    const rows = pipeline.radarItems.filter(row => ids.includes(row.articleId));
    rows.forEach(row => updateLocalState(row.articleId, current => current.specialist === "RECEIVED" || current.specialist === "READY_FOR_REVIEW" ? { ...current, specialist: "REVIEWED" } : current));
    setNotice("Contribuições elegíveis marcadas como revisadas localmente. A aprovação editorial continua separada.");
  };
  const buildTopicContextForRow = (row: RadarItem, data: ReturnType<typeof rowWorkbenchData>) => {
    if (!data.article) throw new Error("ArticleDNA indisponível para preparar as pautas deste artigo.");
    const report = data.analysis?.payload.competitiveReport;
    const approvedReferences = data.r3.serp.references
      .filter(reference => (reference.role === "primary" || reference.role === "support") && reference.state === "included")
      .map(reference => ({ position: reference.position, title: reference.title, url: reference.url, role: reference.role as "primary" | "support" }));
    const local = localStateFor(row.articleId);
    return buildExpertTopicContext(row.articleId, {
      brandId: row.brandId,
      article: data.article,
      articleDnaVersionId: row.articleDnaVersionId,
      keywordDnas: data.article.payload.keywordReferences.map(reference => ({
        keywordId: reference.keywordId,
        keywordDnaVersionId: reference.keywordDnaVersionId,
        keyword: reference.keywordId === data.article?.payload.principalKeywordId ? data.r3.keyword : null,
        role: reference.role,
      })),
      siloDna: row.siloId ? pipeline.siloVersions[row.siloId] || null : null,
      serp: {
        reviewed: data.latestReview?.status === "approved" && data.reviewState.currentness === "current",
        snapshotId: data.latestSerpRecord?.id || null,
        snapshotVersion: data.latestSerpRecord?.research?.version || null,
        analysisVersionId: data.analysis?.versionId || null,
        /*
         * O ESPECIALISTA RECEBE PERGUNTAS, NÃO VOCABULÁRIO DO PARSER.
         *
         * A origem anterior era `report.needs[].topics`: termos recorrentes do
         * benchmark antigo, que chegavam à tela como `atilde`, `eacute`,
         * `ccedil` — resíduo de entidades HTML não decodificadas nas páginas
         * concorrentes. Um profissional abria a pauta e via trinta chips de
         * lixo de normalização onde deveria ver o que precisa da prática dele.
         *
         * A fonte agora é o Gate 12: pontos de revisão preparados, cada um com
         * a pergunta já contextualizada. Quando não há nenhum, a lista é vazia
         * — e vazio é a verdade, não um motivo para cair no ruído anterior.
         */
        needs: data.deepResearch?.observed.authorityEvidence.specialistReviewRequirements.map(item => item.topic) || [],
        /*
         * As divergências gravadas no snapshot passam pela autoridade atual: uma
         * lacuna de intenção registrada quando o fundamento ainda não chegava ao
         * Radar não descreve mais o artigo de hoje. Conflito real continua.
         */
        openGaps: [
          ...(report?.profile.limitations || []),
          ...radarObservedGapsForArticle({
            persistedConflicts: data.view?.diagnostic?.possibleConflicts || [],
            articleIntent: radarDeclaredArticleIntent(data.researchContext?.article),
            observedIntent: data.view?.diagnostic?.dominantIntent,
          }),
        ],
        conflicts: data.view?.diagnostic?.possibleConflicts || [],
        knownQuestions: [...(data.view?.peopleAlsoAsk || []).map(question => question.question), ...(data.view?.relatedSearches || []).map(search => search.term)],
        approvedReferences,
      },
      amazon: { state: local.amazon, criteria: [], evidence: [] },
      existingContent: local.existingContent || [],
    });
  };

  /*
   * AS PAUTAS DA COLUNA ESQUERDA — §15.
   *
   * Quando a investigação foi finalizada, a autoridade é o SNAPSHOT congelado:
   * é ele que dá significado ao `briefId` depois de um RESET. Sem investigação,
   * nenhuma pauta é inventada — e as fontes continuam existindo sem elas.
   */
  const videoBriefsDoArtigo = (() => {
    const investigacao = activeWorkbenchData?.deepResearch;
    /*
     * FINALIZADA É O QUE TEM BUNDLE CONGELADO — §3.0.1.
     *
     * Blueprint vivo não conta: o recorte se amarra ao congelado, e casar
     * contra pauta viva produziria evidência que muda de sentido na próxima
     * investigação. Por isso a contagem que a prontidão usa é a do SNAPSHOT.
     */
    const finalizada = Boolean(investigacao?.finalizedBundle);
    const congelado = investigacao?.finalizedBundle?.blueprint?.videoBriefSnapshots || [];
    if (congelado.length) {
      /*
       * UMA PROJEÇÃO SÓ, COMPLETA — VIDEOS 3.1 · §2 e §3.
       *
       * Ela era reduzida (tópico, propósito, o que procurar) e por isso a tela
       * precisava de uma SEGUNDA leitura, do blueprint vivo, para mostrar o
       * bloco relacionado e a evidência. Duas projeções da mesma pauta divergem
       * no primeiro congelamento: a de cima descrevia a investigação atual
       * enquanto a de baixo descrevia a congelada.
       *
       * Agora o snapshot vem inteiro, e a autoridade é uma.
       */
      return { finalizada, frozenBriefCount: congelado.length, briefs: congelado.map(item => ({ briefId: item.briefId, topic: item.topic, narrativePurpose: item.narrativePurpose, whatToLookFor: [...item.whatToLookFor], priority: item.priority, frozen: true, relatedSectionTitle: item.relatedSectionTitle, evidenceNeeded: item.evidenceNeeded, provenance: item.provenance.map(origem => ({ source: origem.source, detail: origem.detail })) })), reason: null };
    }
    const vivas = investigacao?.blueprint?.videoBriefs || [];
    if (vivas.length) {
      return { finalizada, frozenBriefCount: 0, briefs: vivas.map(item => ({ briefId: item.id, topic: item.topic, narrativePurpose: item.narrativePurpose, whatToLookFor: [...item.whatToLookFor], priority: item.priority, frozen: false, relatedSectionTitle: item.relatedSectionTitle, evidenceNeeded: item.evidenceNeeded, provenance: [] })), reason: null };
    }
    /*
     * A FRASE SAIU DAQUI. Quem decide o que dizer é `radarMatchingReadiness`,
     * no domínio — e é a MESMA decisão que habilita ou não o botão. Duas frases
     * sobre o mesmo fato divergem, e foi o que aconteceu: a coluna dizia que
     * não havia pauta enquanto o botão continuava aceso.
     */
    return { finalizada, frozenBriefCount: 0, briefs: [], reason: null };
  })();

  const activeExpertContext = activeRadarItem && activeWorkbenchData ? (() => {
    try { return buildTopicContextForRow(activeRadarItem, activeWorkbenchData); } catch { return null; }
  })() : null;
  const prepareTopicsBatch = async (ids: string[]) => {
    const rows = ids.map(id => radarItemForArticleId(id)).filter((row): row is RadarItem => Boolean(row));
    rows.forEach(row => updateLocalState(row.articleId, current => ({ ...current, topics: { ...current.topics, state: "TOPICS_PREPARING" }, specialist: "TOPICS_PREPARING" })));
    let prepared = 0;
    let failed = 0;
    for (const row of rows) {
      const data = rowWorkbenchData(row);
      let context: RadarR6ExpertTopicContext | null = null;
      try {
        context = buildTopicContextForRow(row, data);
        const response = await fetch("/api/editorial/radar-topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: row.brandId, articleId: row.articleId, articleDnaVersionId: row.articleDnaVersionId, context }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Não foi possível preparar as pautas deste artigo.");
        const suggestions = parseRadarR7TopicResponse(context, body);
        const topics = topicSuggestionsToRadarTopics(row.articleId, suggestions);
        updateLocalState(row.articleId, current => ({ ...current, topics: { state: "TOPICS_READY_FOR_REVIEW", items: topics, context, reviewedIds: [] }, specialist: "TOPICS_READY" }));
        prepared += 1;
      } catch {
        updateLocalState(row.articleId, current => ({
          ...current,
          topics: preserveRadarR7TopicsOnFailure(current.topics, context),
          specialist: "TOPICS_PREPARING",
        }));
        failed += 1;
      }
    }
    setNotice(`Preparação de pautas concluída: ${prepared} pronta(s) para revisão e ${failed} falha(s) com retry independente.`);
  };
  const approveTopicsBatch = (ids: string[]) => {
    ids.forEach(articleId => updateLocalState(articleId, current => ({ ...current, topics: { ...current.topics, state: "TOPICS_APPROVED" }, specialist: "READY_TO_SEND" })));
    setNotice("Pautas aprovadas localmente. O envio aguarda a fundação Telegram.");
  };
  const prepareReportBatch = (ids: string[]) => {
    ids.forEach(articleId => updateLocalState(articleId, current => ({ ...current, report: "REPORT_GENERATED", reportApprovedEvidenceFingerprint: null })));
    setNotice("Prévia do relatório preparada localmente para revisão. Nenhuma versão remota foi criada.");
  };
  /*
   * GERAR O RELATÓRIO COMPETITIVO — o fechamento canônico da investigação.
   *
   * Antes daqui saía uma "prévia local": um flag de sessão com a própria
   * mensagem admitindo que nenhuma versão remota era criada. A pessoa
   * perguntava "cadê o relatório?" com razão — não existia relatório, existia
   * um booleano. Agora o clique cria a sucessora da análise com o relatório
   * da versão, o modelo observado dentro dele, e quem encerra é o readback.
   */
  const generateReportForArticle = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || generatingReportIdRef.current) return;
    if (!data?.analysis || !data.article || !data.latestSerpRecord?.research) { setNotice("Colete a SERP e inicie a análise antes de gerar o relatório competitivo."); return; }
    if (!data.analysis.payload.extractions.length) { setNotice("Nenhuma referência foi analisada; não há amostra para o relatório competitivo."); return; }
    if (data.analysisQueue > 0) { setNotice(`${data.analysisQueue} referência(s) selecionada(s) ainda não foram analisadas; o relatório descreveria uma amostra incompleta.`); return; }
    generatingReportIdRef.current = target.articleId;
    history.capture(`Gerar relatório competitivo de ${target.title}`);
    setNotice("Gerando o relatório competitivo desta versão…");
    try {
      const nextVersionId = crypto.randomUUID();
      const report = await buildRadarCompetitiveReport({
        payload: data.analysis.payload,
        article: data.article.payload,
        research: data.latestSerpRecord.research,
        researchContext: data.researchContext,
        radarItemId: target.id,
        analysisVersionId: nextVersionId,
        analysisVersionNumber: data.analysis.versionNumber + 1,
        generatedBy: sessionId(session),
        siloDnaVersionId: target.siloId ? pipeline.siloVersions[target.siloId]?.versionId || null : null,
        previousReport: data.analysis.payload.competitiveReport,
        status: "draft",
      });
      const next = await createRadarAnalysisSuccessor(data.analysis, { ...data.analysis.payload, competitiveReport: report }, sessionId(session), undefined, nextVersionId);
      const saved = await persistSerpAnalysis(target.articleId, next, `Relatório competitivo v${next.versionNumber} gerado sobre ${report.observedCompetitiveModel?.sample.analyzed || 0} página(s) analisada(s).`);
      /*
       * O readback decide. Sem confirmação remota o relatório continua sendo
       * uma leitura desta aba, e a revisão local não pode fingir o contrário.
       */
      if (saved.persistenceMode === "remote" && saved.readbackConfirmed) {
        updateLocalState(target.articleId, current => ({ ...current, report: "REPORT_GENERATED", reportApprovedEvidenceFingerprint: null }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível gerar o relatório competitivo.");
    } finally { generatingReportIdRef.current = null; }
  };
  const reviewReportForArticle = () => {
    if (!activeRadarItem || !activeWorkbenchData?.r6Report) return;
    if (activeWorkbenchData.reportState !== "REPORT_GENERATED") { setNotice("Gere a prévia local antes de marcá-la como revisada."); return; }
    updateLocalState(activeRadarItem.articleId, current => ({ ...current, report: "REPORT_REVIEWED" }));
    setNotice("Relatório marcado como revisado localmente. A aprovação continua separada.");
  };
  /*
   * APROVAR É UM ATO SÓ — e ele não mora nesta tela.
   *
   * Antes daqui saía um flag em `useState` com a mensagem "aprovado
   * localmente": um verbo idêntico ao da rota de detalhe para uma ação que não
   * criava versão, não gerava pacote e não sobrevivia ao F5. Agora as duas
   * superfícies chamam `approveRadarReport`, e o que fecha é o readback.
   *
   * A revisão local do relatório continua sendo pré-condição de BOTÃO, não de
   * decisão: ela é estado de sessão e não pode decidir o que vale no remoto.
   */
  const approveReportForArticle = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data?.r6Report || approvingArticleIdRef.current) return;
    if (!data.analysis || !data.article || !data.latestSerpRecord?.research) {
      setNotice("Este artigo ainda não tem SERP coletada e análise iniciada para aprovar.");
      return;
    }
    if (!radarR6CanApproveReport(data.r6Report)) {
      setNotice("Revise o relatório localmente e resolva as pendências de SERP, Amazon e especialista antes de aprovar.");
      return;
    }
    approvingArticleIdRef.current = target.articleId;
    setNotice("Registrando a aprovação do relatório…");
    try {
      const result = await approveRadarReport({
        identity: { brandId: target.brandId, articleId: target.articleId, articleDnaVersionId: target.articleDnaVersionId, radarItemId: target.id },
        analysis: data.analysis,
        article: data.article,
        research: data.latestSerpRecord.research,
        serpReview: { status: data.latestReview?.status ?? null, currentness: data.reviewState.currentness },
        expertEvidence: {
          loaded: Boolean(data.expertSummary),
          contextMatches: data.expertSummary?.articleDnaVersionId === target.articleDnaVersionId,
          failed: false,
          pendingCount: data.expertSummary?.pendingCount || 0,
          blockedCount: data.expertSummary?.blockedEvidenceCount || 0,
          approved: canonicalExpertEvidenceByArticle[target.articleId] || [],
        },
        kgrStrategy: data.kgrStrategy,
        siloDnaVersionId: target.siloId ? pipeline.siloVersions[target.siloId]?.versionId || null : null,
        selectedBy: sessionId(session),
        persist: successor => pipeline.saveRadarAnalysis(target.articleId, successor),
      });

      if (!result.ok) {
        setNotice(result.reason === "BLOCKED" ? result.issues.join(" ") : result.message);
        return;
      }
      if (result.outcome === "ALREADY_APPROVED") {
        setNotice("Este relatório já está aprovado nesta versão, com o mesmo snapshot e a mesma curadoria. Nenhuma sucessora foi criada.");
        return;
      }
      updateLocalState(target.articleId, current => ({ ...current, report: "REPORT_APPROVED", reportApprovedEvidenceFingerprint: radarR7ReportEvidenceFingerprint(data.r6Report!) }));
      if (target.state === "awaiting_approval") pipeline.updateRadarState([target.id], "approved");
      setNotice(`Relatório aprovado na versão v${result.analysisVersionNumber}. Write remoto e readback confirmados; o pacote de evidências foi consolidado.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível aprovar o relatório.");
    } finally {
      approvingArticleIdRef.current = null;

    }
  };
  const updateTopicsForArticle = (articleId: string, update: (items: RadarR4Topic[]) => RadarR4Topic[], invalidatedTopicId?: string) => {
    const current = localStateFor(articleId).topics.items;
    const next = update(current);
    if (next === current) return;
    setTopicHistoryByArticle(history => ({ ...history, [articleId]: { past: [...(history[articleId]?.past || []), current], future: [] } }));
    updateLocalState(articleId, state => ({ ...state, topics: { ...state.topics, items: next, reviewedIds: state.topics.reviewedIds.filter(id => id !== invalidatedTopicId && next.some(topic => topic.id === id)) } }));
  };
  const updateTopicForArticle = (articleId: string, topicId: string, text: string) => updateTopicsForArticle(articleId, items => updateRadarR4Topic(items, topicId, text), topicId);
  const removeTopicForArticle = (articleId: string, topicId: string) => updateTopicsForArticle(articleId, items => removeRadarR4Topic(items, topicId));
  const moveTopicForArticle = (articleId: string, topicId: string, direction: -1 | 1) => updateTopicsForArticle(articleId, items => moveRadarR4Topic(items, topicId, direction));
  const reviewTopicForArticle = (articleId: string, topicId: string) => updateLocalState(articleId, current => ({ ...current, topics: { ...current.topics, reviewedIds: current.topics.reviewedIds.includes(topicId) ? current.topics.reviewedIds : [...current.topics.reviewedIds, topicId] } }));
  const setAmazonStateForArticle = (articleId: string, amazon: RadarR4AmazonState) => updateLocalState(articleId, current => ({ ...current, amazon }));
  const addExistingContentForArticle = (articleId: string, input: { kind: RadarR4ExistingContentKind; label: string; reference: string; state: RadarR4ExistingContentState }) => {
    const label = input.label.replace(/\s+/g, " ").trim();
    const reference = input.reference.replace(/\s+/g, " ").trim();
    if (!label || !reference) return;
    updateLocalState(articleId, current => ({ ...current, existingContent: [...(current.existingContent || []), { id: `${articleId}:existing:${Date.now()}`, ...input, label, reference }] }));
  };
  const updateExistingContentState = (articleId: string, contentId: string, state: RadarR4ExistingContentState) => updateLocalState(articleId, current => ({ ...current, existingContent: (current.existingContent || []).map(item => item.id === contentId ? { ...item, state } : item) }));
  const addTopicForArticle = (articleId: string, text: string) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return;
    updateTopicsForArticle(articleId, items => [...items, { id: `${articleId}:topic:human:${Date.now()}`, text: normalized, source: "Adicionado na revisão humana", sourceType: "Conteúdo existente" }]);
  };
  const undoTopicsForArticle = (articleId: string) => {
    const entry = topicHistoryByArticle[articleId];
    if (!entry?.past.length) return;
    const previous = entry.past.at(-1)!;
    const current = localStateFor(articleId).topics.items;
    updateLocalState(articleId, state => ({ ...state, topics: { ...state.topics, items: previous, reviewedIds: state.topics.reviewedIds.filter(id => previous.some(topic => topic.id === id)) } }));
    setTopicHistoryByArticle(history => ({ ...history, [articleId]: { past: entry.past.slice(0, -1), future: [current, ...entry.future] } }));
  };
  const redoTopicsForArticle = (articleId: string) => {
    const entry = topicHistoryByArticle[articleId];
    if (!entry?.future.length) return;
    const next = entry.future[0];
    const current = localStateFor(articleId).topics.items;
    updateLocalState(articleId, state => ({ ...state, topics: { ...state.topics, items: next, reviewedIds: state.topics.reviewedIds.filter(id => next.some(topic => topic.id === id)) } }));
    setTopicHistoryByArticle(history => ({ ...history, [articleId]: { past: [...entry.past, current], future: entry.future.slice(1) } }));
  };
  const handleBulkAction = (operation: RadarR4BulkOperation, ids: string[]) => {
    const rows = ids.map(id => radarItemForArticleId(id)).filter((row): row is RadarItem => Boolean(row));
    const eligible = availableBulkActions(selectedSnapshotsFor(rows))[operation].eligible;
    if (!eligible.length) return;
    if (operation === "serp") return void startSerpBatch(eligible);
    if (operation === "refreshSerp") return void startSerpBatch(eligible, "explicit_refresh");
    if (operation === "review") return reviewSelected(eligible);
    if (operation === "approve") return approveSelected(eligible);
    if (operation === "topics") return void prepareTopicsBatch(eligible);
    if (operation === "approveTopics") return approveTopicsBatch(eligible);
    if (operation === "report") return prepareReportBatch(eligible);
    if (operation === "specialist") return setNotice("Envio bloqueado: a fundação remota Telegram não foi atravessada nesta rodada.");
    if (operation === "reviewSpecialist") return reviewSpecialistSelected(eligible);
    if (operation === "planner") { const result = sendToPlanner(eligible); setNotice(`${result.imported} item(ns) enviado(s); ${result.skipped} ignorado(s).`); }
  };
  const importable = approved.map(version => { const articleVersion = version as VersionEnvelope<ArticleDNA>; const suggestedSlug = String((articleVersion.payload as unknown as { suggestedSlug?: string }).suggestedSlug || ""); const alreadyImported = pipeline.radarItems.some(item => item.articleId === articleVersion.payload.articleId); return { ...articleVersion, payload: { ...articleVersion.payload, suggestedSlug }, suggestedSlug, id: articleVersion.versionId, alreadyImported, importStatus: alreadyImported ? "sent_radar" : "approved" }; });
  const renderTopbarActions = (grid: OperationalDataGridTopbarApi<RadarItem>) => {
    const formatColumn = columns.find(column => column.id === "format");
    const statusColumn = columns.find(column => column.id === "state");
    const filter = (column: OperationalGridColumn<RadarItem>, label: string) => <select aria-label={`Filtrar por ${label.toLowerCase()}`} value={grid.filters[column.id] || ""} onChange={event => grid.setFilter(column.id, event.target.value)} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} max-w-36 cursor-pointer`}>
      <option value="">{label}: Todos</option>
      {column.filterOptions?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
    return <>
      {formatColumn ? filter(formatColumn, "Formato") : null}
      {statusColumn ? filter(statusColumn, "Status") : null}
      <button type="button" onClick={() => setPicker(true)} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} text-positive-soft/85`} title="Importar artigos aprovados do Arquiteto">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" /><span>Importar do Arquiteto</span>
      </button>
      <button type="button" onClick={() => grid.exportRows(grid.queriedRows, "planilha")} className={GLOBAL_TOPBAR_ACTION_CONTROL} title="Exportar planilha filtrada">
        <Download className="h-3.5 w-3.5" aria-hidden="true" /><span>Exportar</span>
      </button>
      <div className="relative shrink-0">
        <button type="button" onClick={grid.toggleColumns} className={GLOBAL_TOPBAR_ACTION_CONTROL} title="Exibir ou ocultar colunas" aria-label="Visualização">
          <Columns3 className="h-3.5 w-3.5" aria-hidden="true" /><span>Visualização</span>
        </button>
        {grid.showColumns ? <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-divider bg-surface-elevated p-2 shadow-lg">
          {grid.columns.map(column => <label key={column.id} className="flex items-center gap-2 py-1 text-xs text-foreground/75"><input type="checkbox" checked={!grid.hidden.has(column.id)} onChange={() => grid.toggleColumn(column.id)} />{column.header}</label>)}
        </div> : null}
      </div>
      <select aria-label="Modo de ordenação" value={grid.orderMode} onChange={event => grid.setOrderMode(event.target.value as "automatic" | "manual")} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} max-w-36 cursor-pointer`}>
        <option value="automatic">Ordem automática</option><option value="manual">Ordem manual</option>
      </select>
      <select aria-label="Quantidade por página" value={String(grid.pageSize)} onChange={event => grid.setPageSize(event.target.value === "all" ? "all" : Number(event.target.value) as 25 | 50 | 100 | 200)} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} max-w-24 cursor-pointer`}>
        {[25, 50, 100, 200].map(size => <option key={size}>{size}</option>)}<option value="all">Todos</option>
      </select>
    </>;
  };
  const openDetail = (tab: "resumo" | "serp" | "referencias" | "analise-serp" | "relatorio" | undefined = "resumo") => { if (!activeRadarItem) return; const href = buildRadarArticleHref({ brandRef, articleId: radarCanonicalRouteKey(activeRadarItem) }); if (href) router.push(`${href}?tab=${tab}`); };
  const openActiveArticle = () => { if (!activeRadarItem) return; const href = buildRadarArticleHref({ brandRef, articleId: radarCanonicalRouteKey(activeRadarItem) }); if (href) router.push(href); };
  const activeTopicQueuePosition = activeRadarItem ? pendingTopicRows.findIndex(row => row.id === activeRadarItem.id) + 1 : undefined;
  const serpReviewRemoteConfirmed = Boolean(activeWorkbenchData?.latestReview?.status === "approved" && activeWorkbenchData.r3.serp.reviewCurrentness === "current" && activeWorkbenchData.latestSerpRecord && pipeline.serpReviewReadbackSnapshotIds.includes(activeWorkbenchData.latestSerpRecord.id));
  /*
   * A frase depende de COMO a leitura terminou, nao de um booleano.
   *
   * Vazio confirmado convida a importar; falha de leitura pede nova tentativa;
   * parcial diz quantos registros nao couberam. Antes os tres diziam a mesma
   * coisa, e a tela chamava de vazia uma marca cuja consulta havia falhado.
   */
  const diagnostico = pipeline.loadDiagnostics;
  const radarEmptyTitle = diagnostico.state === "complete" || diagnostico.state === "empty_confirmed"
    ? "Nenhum artigo importado. Use “Importar do Arquiteto”."
    : loadStateSummary(diagnostico);
  return <div className="flex min-h-screen flex-col bg-background">{notice && <div className="shrink-0 border-b border-warning/40 bg-warning-soft/30 px-4 py-2 text-sm text-warning" role="status">{notice}</div>}{/*
    * O NAVEGADOR FALHOU — E DIZ ISSO SEM ACUSAR A OPERAÇÃO.
    *
    * Este aviso nasceu de um defeito real: a falha da cópia de recuperação no
    * `localStorage` derrubava do estado uma coleta que o DataForSEO já tinha
    * entregue e cobrado. A frase agora nomeia o navegador como responsável e
    * afirma, na mesma linha, que a pesquisa não precisa ser refeita.
    */}{pipeline.localRecoveryWarning && <div className="shrink-0 border-b border-pending/40 bg-pending/10 px-4 py-2 text-sm text-foreground" role="status" data-testid="radar-local-recovery-warning">{pipeline.localRecoveryWarning}</div>}<RadarWorkbench model={activeWorkbenchData?.r3 || null} articleId={activeRadarItem?.articleId || null} onReloadLibrary={reloadVideoLibrary} expertContext={activeExpertContext} refreshing={Boolean(busyArticleId)} reviewingSerp={Boolean(reviewingArticleId)} serpAction={serpAction && serpAction.articleId === activeRadarItem?.articleId ? serpAction.kind : null} onAnalyzeSerpSelection={() => void analyzeSerpSelection()} onTopicChange={updateTopicForArticle} onTopicRemove={removeTopicForArticle} onTopicMove={moveTopicForArticle} onTopicAdd={addTopicForArticle} onTopicReview={reviewTopicForArticle} onTopicUndo={undoTopicsForArticle} onTopicRedo={redoTopicsForArticle} canUndoTopics={Boolean(activeRadarItem && topicHistoryByArticle[activeRadarItem.articleId]?.past.length)} canRedoTopics={Boolean(activeRadarItem && topicHistoryByArticle[activeRadarItem.articleId]?.future.length)} onTopicAdjacent={focusTopicAdjacent} topicQueuePosition={activeTopicQueuePosition && activeTopicQueuePosition > 0 ? activeTopicQueuePosition : undefined} topicQueueTotal={pendingTopicRows.length || undefined} videoSources={{ ...videoLibrary, briefs: videoBriefsDoArtigo.briefs, briefsUnavailableReason: videoBriefsDoArtigo.reason, investigationFinalized: videoBriefsDoArtigo.finalizada, frozenBriefCount: videoBriefsDoArtigo.frozenBriefCount, coverage: videoMatching.coverage, matching: videoMatching.running }} onRunMatching={runVideoMatching} onRegisterVideoSources={registerVideoSources} onExtractVideoText={extractVideoText} onFetchVideoMetadata={fetchVideoMetadata} onProvideVideoTranscript={provideVideoTranscript} onUploadVideoMedia={uploadVideoMedia} onLibraryAction={runVideoLibraryAction} onReportGenerate={() => void generateReportForArticle()} onReportReview={reviewReportForArticle} onReportApprove={() => void approveReportForArticle()} onStartDeepResearch={() => void startDeepResearch()} onRecoverSerp={() => void recuperarPesquisaPaga()} onFinalizeInvestigation={() => void finalizeInvestigation()} onResetInvestigation={() => void resetRadarInvestigation()} searchMode={activeRadarItem ? searchModeByArticle[activeRadarItem.articleId] || RADAR_DEFAULT_SEARCH_MODE : RADAR_DEFAULT_SEARCH_MODE} onSearchModeChange={modo => activeRadarItem && setSearchModeByArticle(current => ({ ...current, [activeRadarItem.articleId]: modo }))} onAmazonStateChange={setAmazonStateForArticle} onOpenArticle={openActiveArticle} onOpenDetail={openDetail} onExpertEvidenceChange={handleExpertEvidenceChange}/><HistoryControls entries={history.entries} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onRestore={history.restore} moduleId="radar" showHistory={false} showUndoRedo={false}/><div className="flex min-h-0 flex-1 flex-col" data-radar-r4-focused-id={activeArticleId || undefined} data-radar-r4-selected-count={selectedArticleIds.length} data-radar-r4-serp-batch-id={r4SerpQueue?.id || undefined}><RadarR5QueueProgress queue={r4SerpQueue} onView={focusQueueView}/><div className="shrink-0 border-b border-divider bg-background px-4 py-2" data-testid="radar-r4-spreadsheet-heading"><h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Planilha</h2>{diagnostico.incompatible.length > 0 && <p className="mt-1 text-sm text-warning" role="status">{loadStateSummary(diagnostico)} · {diagnostico.incompatible.map(registro => `${registro.stage || registro.kind} ${registro.id}${registro.paths.length ? ` (${registro.paths.join(", ")})` : ""}`).join(" · ")} <button type="button" className="underline" onClick={() => void pipeline.reloadOperational()}>Tentar carregar novamente</button></p>}</div><OperationalDataGrid module="radar" userId={sessionId(session)} brandId={selectedBrandId} rows={pipeline.radarItems} columns={columns} expandedRowId={expandedRadarId} onExpandedRowChange={handleExpandedChange} bulkSelectedRowIds={bulkSelectedRowIds} onBulkSelectionChange={handleBulkSelectionChange} activeRowId={activeRadarRowId} activeRowClassName="border-l-2 border-l-context-accent bg-surface-subtle/55" bulkSelectedRowClassName="bg-positive-soft/10" onRowActivate={handleRowActivate} topbar={{ moduleId: "radar", history: { getCount: () => history.entries.length, canUndo: () => history.canUndo, canRedo: () => history.canRedo, undo: history.undo, redo: history.redo, open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "radar" } })) }, renderActions: renderTopbarActions }} emptyTitle={radarEmptyTitle} renderBulkBar={rows => <RadarR4BulkOperationsBar selectedRows={selectedSnapshotsFor(rows)} onAction={handleBulkAction}/>} renderExpanded={row => <RadarProfile r3={rowWorkbenchData(row).r3} articleHref={buildRadarArticleHref({ brandRef, articleId: radarCanonicalRouteKey(row) })} architectHref={buildRadarArchitectHref({ brandRef, articleId: row.articleId })}/>} /></div>{picker && <ImportPanel title="Importar artigos aprovados" rows={importable} label={version => `${version.payload.promise} · /${version.suggestedSlug} · ${radarDeclaredArticleIntent(version.payload) || RADAR_INTENT_NOT_CONCLUDED}`} onClose={() => setPicker(false)} onImport={ids => { const selectedVersions = importable.filter(version => ids.includes(version.id)); history.capture(`Importar ${selectedVersions.length} artigos do Arquiteto`); void (async () => { const graphs = await loadInternalLinkGraphs(selectedBrandId).catch(() => []); const result = await pipeline.importApprovedToRadar(selectedVersions.map(version => version.payload.articleId), [], {}, {}, graphs); const partes = [`${result.imported} item(ns) enviado(s)`]; if (result.skipped) partes.push(`${result.skipped} já existente(s)`); for (const item of result.blocked) partes.push(`${item.label} bloqueado: ${item.reasons.join(" ")}`); setNotice(partes.join(" · ")); })(); setPicker(false); }}/>}</div>;
}

function RadarProfile({ r3, articleHref, architectHref }: { r3: RadarR3Model; articleHref: string | null; architectHref: string | null }) {
  return <RadarR3ProfileMirror model={r3} articleHref={articleHref} architectHref={architectHref}/>;
}

export function LegacyRadarProfile({ row, article, pipeline, articleHref, architectHref }: { row: RadarItem; article?: VersionEnvelope<ArticleDNA>; pipeline: ReturnType<typeof useEditorialPipeline>; articleHref: string | null; architectHref: string | null }) {
  const profileSection = "rounded-lg border border-divider bg-surface p-4";
  const profileInset = "rounded-md border border-divider bg-surface-subtle p-3";
  const snapshots = [...pipeline.serpRecords.filter(record => record.input.articleId === row.articleId)].sort((a, b) => (a.research?.version || 0) - (b.research?.version || 0));
  const record = snapshots.at(-1);
  const serp = record ? buildRadarSerpView(record) : null;
  const latestAnalysis = row.analysisVersions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
  const analysis = radarAnalysisMatchesSerp({ analysis: latestAnalysis, brandId: row.brandId, articleId: row.articleId, articleDnaVersionId: row.articleDnaVersionId, view: serp }) ? latestAnalysis : null;
  const referenceRoles = buildRadarSerpSelectionProjection(serp, analysis, radarSelectionScope(row)).rows.map(selection => ({ role: selection.role }));
  const referenceCounts = summarizeRadarReferenceCounts(referenceRoles);
  const publication = pipeline.operationalPublications.find(item => item.articleId === row.articleId);
  const publicationLabel = publication?.state === "published" ? "Publicado e protegido" : publication?.state || "Ainda não publicado";
  const report = analysis?.payload.competitiveReport;
  const keywordSnapshots = row.hydration?.keywordSnapshots || [];
  const primaryKeyword = row.hydration?.principalKeyword?.keyword || keywordSnapshots[0]?.keyword || "Não hidratada";
  const reportStatus = !report ? "Aguardando análise SERP" : analysis?.payload.status === "approved" ? `Aprovado · v${analysis.versionNumber}` : `Prévia revisável · v${analysis?.versionNumber}`;
  return <div className="space-y-4" aria-label="Perfil Radar do Artigo">
    <section className={profileSection}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-module-accent">Perfil Radar do Artigo</p><h2 className="mt-1 text-lg font-semibold text-foreground">{article?.payload.promise || row.title}</h2><p className="mt-1 text-sm text-text-muted">Visão operacional expandida; a troca visual de contexto não cria versão nem coleta dados.</p></div><div className="flex flex-wrap gap-2">{architectHref && <a className="inline-flex min-h-10 items-center rounded-md border border-divider px-3 py-2 text-sm text-foreground hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" href={architectHref}>Ver no Arquiteto</a>}{articleHref && <a className="inline-flex min-h-10 items-center rounded-md border border-divider px-3 py-2 text-sm text-foreground hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" href={`${articleHref}?tab=resumo`}>Abrir detalhe completo</a>}</div></div>
      {article ? <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="ArticleDNA" value={`v${article.versionNumber}`}/><Field label="Keyword principal" tone="keyword" value={primaryKeyword}/><Field label="Secundárias e reforços" value={Math.max(0, article.payload.keywordReferences.length - 1)}/><Field label="Intenção" value={radarDeclaredArticleIntent(article.payload)}/><Field label="Função no silo" value={row.hierarchy}/><Field label="Publicação" value={publicationLabel}/><Field label="Slug" value={`/${row.slug}`}/><Field label="Canonical" value={article.payload.canonical || "Ainda não confirmada"}/></dl> : <p className="mt-3 text-sm text-warning">ArticleDNA não hidratado para esta linha.</p>}
    </section>
    {articleHref && <section className={profileSection} aria-label="Acesso rápido às áreas do Radar"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-foreground">Acesso rápido</h3><p className="mt-1 text-sm text-text-muted">Abra a área operacional correspondente sem perder o artigo selecionado.</p></div><span className="text-sm text-text-muted">Sem criar versão</span></div><nav className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Áreas detalhadas do Radar"><a className="rounded-md border border-divider bg-surface-subtle px-3 py-3 text-sm text-foreground hover:border-context-accent hover:text-context-accent" href={`${articleHref}?tab=serp`}>SERP</a><a className="rounded-md border border-divider bg-surface-subtle px-3 py-3 text-sm text-foreground hover:border-context-accent hover:text-context-accent" href={`${articleHref}?tab=referencias`}>Referências</a><a className="rounded-md border border-divider bg-surface-subtle px-3 py-3 text-sm text-foreground hover:border-context-accent hover:text-context-accent" href={`${articleHref}?tab=analise-serp`}>Análise SERP</a><a className="rounded-md border border-divider bg-surface-subtle px-3 py-3 text-sm text-foreground hover:border-context-accent hover:text-context-accent" href={`${articleHref}?tab=evidencias-adicionais`}>Evidências adicionais</a><a className="rounded-md border border-divider bg-surface-subtle px-3 py-3 text-sm text-foreground hover:border-context-accent hover:text-context-accent" href={`${articleHref}?tab=relatorio`}>Relatório</a></nav></section>}
    <div className="grid gap-4 xl:grid-cols-2">
      <section className={profileSection}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-base font-semibold text-foreground">SERP</h3><p className="mt-1 text-sm text-text-muted">Provider, snapshot e preview dos resultados reais ou legados.</p></div>{record && <DataOriginBadge origin={record.origin}/>}</div>{serp ? <><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Provider" value={serp.provider}/><Field label="Última coleta" value={new Date(serp.capturedAt).toLocaleString("pt-BR")}/><Field label="Resultados" value={serp.organicResults.length}/><Field label="Snapshot" value={`${serp.record.id} · v${serp.version}`}/><Field label="Status" value={record?.isMock ? "Simulada · não aprovável" : "Disponível"}/><Field label="Tipos observados" value={serp.diagnostic?.dominantFormats.join(" · ") || "Não classificados"}/></dl><div className="mt-3 space-y-2">{serp.organicResults.slice(0, 5).map(result => <article className={profileInset} key={`${serp.record.id}:preview:${result.position}`}><div className="flex items-start justify-between gap-3"><strong className="text-sm text-foreground">{result.position}. {result.domain || result.url}</strong><span className="text-xs text-text-muted">{result.manualType || result.inferredType || "orgânico"}</span></div><p className="mt-1 text-sm text-text-muted">{result.title || "Resultado sem título"}</p></article>)}</div>{articleHref && <a className="mt-3 inline-flex text-sm text-context-accent underline" href={`${articleHref}?tab=serp`}>Ver SERP completa ↗</a>}</> : <p className="mt-3 text-sm text-text-muted">SERP ainda não coletada ou recuperada para este artigo.</p>}</section>
      <section className={profileSection}><h3 className="text-base font-semibold text-foreground">Referências</h3><p className="mt-1 text-sm text-text-muted">Cada resultado mantém uma função única na investigação.</p><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><Field label="Total" value={referenceCounts.total}/><Field label="Principais" value={referenceCounts.primary}/><Field label="Apoio" value={referenceCounts.support}/><Field label="Formato" value={referenceCounts.format}/><Field label="Pendentes" value={referenceCounts.pending}/><Field label="Excluídas" value={referenceCounts.excluded}/></dl><p className="mt-4 text-sm text-text-muted">{referenceCounts.total ? `${referenceCounts.total - referenceCounts.pending} resultado(s) revisado(s).` : "Aguardando resultados da SERP para iniciar a curadoria."}</p></section>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className={profileSection}><h3 className="text-base font-semibold text-foreground">Análise SERP</h3>{analysis && serp ? <><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Amostra" value={analysis.payload.extractions.length ? `${analysis.payload.extractions.length} página(s)` : "Ainda não analisada"}/><Field label="Intenção observada" value={serp.diagnostic?.dominantIntent || "Ainda não disponível"}/><Field label="Formatos dominantes" value={serp.diagnostic?.dominantFormats.join(" · ") || "Ainda não disponíveis"}/><Field label="Conflitos" value={serp.diagnostic?.possibleConflicts.join(" · ") || "Nenhum registrado"}/></dl>{report ? <><p className="mt-3 text-sm text-text-muted">Necessidades consolidadas: <strong className="text-foreground">{report.needs.length}</strong> · limitações registradas: {report.summary.limitations.length}.</p><p className="mt-2 text-sm text-text-muted">{report.summary.text}</p></> : <p className="mt-3 text-sm text-warning">A análise foi iniciada, mas o relatório SERP ainda aguarda a amostra.</p>}</> : <p className="mt-3 text-sm text-text-muted">Aguardando análise SERP. Necessidades e lacunas não são inferidas antes da amostra.</p>}</section>
      <section className={profileSection}><h3 className="text-base font-semibold text-foreground">Evidências adicionais</h3><p className="mt-1 text-sm text-text-muted">Fluxo opcional separado da análise SERP.</p><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Especialista" value="Não selecionado"/><Field label="Canal" value="Telegram não consumido nesta visão"/><Field label="Conteúdo existente" value="Não utilizado"/><Field label="Contribuições" value="Não iniciadas"/></dl><p className="mt-4 text-sm text-text-muted">O painel com fixtures de especialista permanece na etapa Evidências adicionais da área detalhada. Nenhuma evidência é criada apenas por expandir a linha.</p></section>
    </div>
    <section className={profileSection}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-foreground">Relatório e decisão</h3><p className="mt-1 text-sm text-text-muted">Consolidação do Radar e disponibilidade para o Planejador.</p></div><span className="rounded-full border border-divider px-3 py-1 text-xs text-text-muted">{reportStatus}</span></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Relatório" value={report ? `v${analysis?.versionNumber}` : "Não gerado"}/><Field label="Aprovação" value={analysis?.payload.status === "approved" ? "Aprovado por decisão humana" : "Aguardando aprovação"}/><Field label="Planejador" value={pipeline.plannerItems.some(item => item.articleId === row.articleId) || row.state === "sent_planner" ? "Recebido" : "Não enviado"}/><Field label="Próxima ação" value={!serp ? "Coletar SERP" : !analysis ? "Iniciar análise SERP" : !report ? "Gerar relatório" : analysis.payload.status === "approved" ? "Consultar histórico" : "Revisar e aprovar"}/></dl></section>
    <details className={profileSection}><summary className="cursor-pointer text-sm font-semibold text-foreground">Proveniência e IDs técnicos</summary><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3"><Field label="brandId" value={row.brandId}/><Field label="RadarItem" value={row.id}/><Field label="articleId" value={row.articleId}/><Field label="articleDnaVersionId" value={row.articleDnaVersionId}/><Field label="SERP snapshot" value={record?.id || "Não disponível"}/><Field label="Provider" value={serp?.provider || "Não disponível"}/><Field label="Capturado em" value={serp?.capturedAt || "Não disponível"}/><Field label="Origem da linha" value={row.origin}/><Field label="Atualizado em" value={row.updatedAt}/></dl></details>
    <details className={profileSection}><summary className="cursor-pointer text-sm font-semibold text-foreground">Revisão completa do snapshot</summary><div className="mt-4"><RadarDetail row={row} article={article} pipeline={pipeline}/></div></details>
  </div>;
}

export function LegacyRadarDetail({ row, article, pipeline }: { row: RadarItem; article?: VersionEnvelope<ArticleDNA>; pipeline: ReturnType<typeof useEditorialPipeline> }) {
  const serp = pipeline.serpRecords.find(record => record.input.articleId === row.articleId);
  return <div className="grid gap-3 lg:grid-cols-3"><section className={card}><h3 className="text-xs font-bold">Definição do artigo e referências</h3>{article ? <dl className="mt-2 space-y-2"><Field label="Intenção" value={radarDeclaredArticleIntent(article.payload)}/><Field label="Cobertura" value={article.payload.coverage.join(" · ")}/><Field label="Keywords" value={article.payload.keywordReferences.length}/><Field label="Fronteira" value={article.payload.antiCannibalizationBoundary}/></dl> : <p className="mt-2 text-xs text-red-400">Versão ausente.</p>}</section><section className={card}><h3 className="text-xs font-bold">SERP e evidências</h3>{serp ? <><DataOriginBadge origin={serp.origin}/><dl className="mt-2 space-y-2"><Field label="Intenção dominante" value={serp.snapshot?.dominantIntent}/><Field label="Perguntas" value={serp.snapshot?.questions.join(" · ")}/><Field label="Lacunas" value={serp.snapshot?.gaps.join(" · ")}/></dl></> : <ProviderNotConfiguredState/>}</section><section className={card}><h3 className="text-xs font-bold">Originalidade</h3><p className="mt-2 text-xs text-slate-500">Conflito interno: funcional.</p><p className="mt-1 text-xs text-slate-500">Similaridade externa: aguardando provedor.</p><p className="mt-1 text-xs text-slate-500">Originalidade estratégica: decisão humana.</p></section></div>;
}

function RadarDetail({ row, article, pipeline }: { row: RadarItem; article?: VersionEnvelope<ArticleDNA>; pipeline: ReturnType<typeof useEditorialPipeline> }) {
  const snapshots = [...pipeline.serpRecords.filter(record => record.input.articleId === row.articleId)].sort((a, b) => (a.research?.version || 0) - (b.research?.version || 0));
  const serp = snapshots.at(-1); const review = serp && pipeline.serpReviews.find(item => item.snapshotId === serp.id); const [notes, setNotes] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const decide = async (status: "approved" | "rejected") => { if (!serp?.research) return; setSaving(true); setMessage(""); try { const result = await pipeline.reviewSerp(row.articleId, serp.id, status, notes); setMessage(result.persistenceMode === "remote" && result.readbackConfirmed ? status === "approved" ? "Pesquisa aprovada; write remoto e readback confirmados. A análise permanece imutável." : "Pesquisa rejeitada; write remoto e readback confirmados." : "A decisão foi aplicada na recuperação local; a persistência remota não foi confirmada."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível registrar a decisão."); } finally { setSaving(false); } };
  return <div className="grid gap-3 lg:grid-cols-3"><section className={card}><h3 className="text-xs font-bold">Definição do artigo e referências</h3>{article ? <dl className="mt-2 space-y-2"><Field label="Intenção" value={radarDeclaredArticleIntent(article.payload)}/><Field label="Cobertura" value={article.payload.coverage.join(" · ")}/><Field label="Keywords" value={article.payload.keywordReferences.length}/><Field label="Fronteira" value={article.payload.antiCannibalizationBoundary}/></dl> : <p className="mt-2 text-xs text-red-400">Versão ausente.</p>}</section><section className={`${card} lg:col-span-2`}><div className="flex items-center justify-between"><h3 className="text-xs font-bold">SERP e revisão humana</h3>{serp && <DataOriginBadge origin={serp.origin}/>}</div>{!serp && <ProviderNotConfiguredState/>}{serp && !serp.research && <p className="mt-2 text-xs text-amber-300">Dados simulados: não podem ser aprovados como evidência real.</p>}{serp?.research && <><div className="mt-2 grid gap-2 sm:grid-cols-4"><Field label="Consulta" value={serp.research.query}/><Field label="Captura" value={new Date(serp.research.collectedAt).toLocaleString("pt-BR")}/><Field label="Análise da SERP" value={`v${serp.research.version}`}/><Field label="Persistência" value={serp.persistenceMode === "remote" ? "remota" : "local — não confirmada"}/></div><div className="mt-3 grid gap-3 md:grid-cols-2"><section><h4 className="text-xs font-bold uppercase text-slate-500">Resultados orgânicos ({serp.research.organicResults.length})</h4><div className="mt-1 max-h-64 overflow-auto rounded border border-slate-900">{serp.research.organicResults.length ? serp.research.organicResults.map(result => <div key={`${serp.id}:${result.position}`} className="border-b border-slate-900 p-2 text-xs last:border-0"><div className="flex justify-between gap-2"><strong>{result.position}. {result.title}</strong><span className="text-slate-600">{result.manualType || result.inferredType} · {result.confidence}</span></div><a className="break-all text-teal-400" href={result.url} target="_blank" rel="noreferrer">{result.domain}</a><p className="mt-1 text-slate-500">{result.snippet || "Sem snippet retornado."}</p></div>) : <p className="p-2 text-xs text-slate-500">Nenhum resultado orgânico retornado.</p>}</div></section><section><h4 className="text-xs font-bold uppercase text-slate-500">People Also Ask ({serp.research.peopleAlsoAsk.length})</h4><div className="mt-1 max-h-64 overflow-auto rounded border border-slate-900">{serp.research.peopleAlsoAsk.length ? serp.research.peopleAlsoAsk.map(item => <div key={`${serp.id}:paa:${item.position}`} className="border-b border-slate-900 p-2 text-xs last:border-0"><strong>{item.question}</strong><p className="mt-1 text-slate-500">{item.answer || "Sem resposta resumida retornada."}</p></div>) : <p className="p-2 text-xs text-slate-500">Nenhuma pergunta retornada.</p>}</div><h4 className="mt-3 text-xs font-bold uppercase text-slate-500">Pesquisas relacionadas ({serp.research.relatedSearches.length})</h4><div className="mt-1 flex flex-wrap gap-1">{serp.research.relatedSearches.length ? serp.research.relatedSearches.map(item => <span key={`${serp.id}:related:${item.term}`} className="rounded border border-slate-800 px-1.5 py-1 text-xs text-slate-400">{item.term}</span>) : <span className="text-xs text-slate-500">Nenhuma retornada.</span>}</div></section></div><section className="mt-3 rounded border border-context-accent/25 bg-context-accent/10 p-2"><h4 className="text-xs font-bold uppercase text-context-accent">Diagnóstico determinístico</h4><div className="mt-2 grid gap-2 sm:grid-cols-3"><Field label="Intenção aparente" value={serp.research.diagnostic.dominantIntent}/><Field label="Confiança" value={serp.research.diagnostic.confidence}/><Field label="Veredito" value={serp.research.diagnostic.verdict}/><Field label="Formatos" value={serp.research.diagnostic.dominantFormats.join(" · ")}/><Field label="Domínios recorrentes" value={serp.research.diagnostic.frequentDomains.join(" · ")}/><Field label="Conflitos" value={serp.research.diagnostic.possibleConflicts.join(" · ")}/></div><p className="mt-2 text-xs text-slate-500">{serp.research.diagnostic.limitations.join(" ")}</p></section><div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-[260px] flex-1 text-xs text-slate-500">Nota da revisão<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded border border-slate-800 bg-black p-2 text-xs text-slate-200" placeholder="Registre a decisão humana…"/></label><button className={`${btn} border-emerald-900 text-emerald-300`} disabled={saving} onClick={() => void decide("approved")}><CheckCircle2 className="mr-1 h-3 w-3"/>{review?.status === "approved" ? "Aprovada" : "Aprovar pesquisa"}</button><button className={`${btn} border-red-900 text-red-300`} disabled={saving} onClick={() => void decide("rejected")}><XCircle className="mr-1 h-3 w-3"/>Rejeitar pesquisa</button></div>{review && <p className="mt-2 text-xs text-slate-500">Última decisão: {review.status} por {review.reviewedBy} em {new Date(review.reviewedAt).toLocaleString("pt-BR")}. {review.notes}</p>}{message && <p className="mt-2 text-xs text-amber-300">{message}</p>}</>}</section><section className={card}><h3 className="text-xs font-bold">Histórico de análises</h3>{snapshots.length ? <div className="mt-2 space-y-1">{snapshots.map(snapshot => <div key={snapshot.id} className="flex justify-between gap-2 border-b border-slate-900 py-1 text-xs"><span>{snapshot.research ? `v${snapshot.research.version} · ${snapshot.origin}` : "mock"}</span><span className="text-slate-600">{snapshot.research?.contentHash.slice(0, 10) || "local"}</span></div>)}</div> : <p className="mt-2 text-xs text-slate-500">Nenhuma pesquisa registrada.</p>}</section></div>;
}
