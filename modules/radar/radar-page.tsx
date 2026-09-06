"use client";
import { loadStateSummary } from "@/lib/editorial/partial-read";

import { loadInternalLinkGraphs } from "@/lib/arquiteto/internal-link-graph-persistence";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { CheckCircle2, Columns3, Download, Plus, XCircle } from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { OperationalDataGrid, type OperationalDataGridTopbarApi, type OperationalGridBulkSelectionChange, type OperationalGridColumn } from "@/components/editorial/operational-data-grid";
import { DataOriginBadge, ProviderNotConfiguredState } from "@/components/editorial/pipeline-ui";
import { WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { approvedArticleVersions, type RadarItem } from "@/lib/editorial/operational-flow";
import type { VersionEnvelope, ArticleDNA } from "@/lib/arquiteto/contracts";
import type { RadarAnalysisVersion, RadarExpertEvidence, RadarExtractionPage } from "@/lib/radar/analysis-contracts";
import { buildRadarBenchmark, createRadarAnalysisSuccessor, createRadarAnalysisVersion, RadarExtractionPageSchema, suggestRadarAnalysisMode } from "@/lib/radar/analysis-contracts";
import { resolvePrimaryKeyword } from "@/lib/radar/keyword-resolver";
import { buildRadarArchitectHref, buildRadarArticleHref, radarCanonicalRouteKey } from "@/lib/radar/route-resolution";
import { buildRadarSerpView } from "@/lib/radar/snapshot-view";
import { buildRadarSerpSelectionProjection, radarAnalysisCandidates, radarAnalysisMatchesSerp, radarOrganicDecisionKey, radarOrganicRenderKey, radarSerpApprovalBlockReason, radarSerpApprovalIssues, selectedRadarOrganicDecisionKeys, type RadarSerpSelectionScope } from "@/lib/radar/serp-curation";
import { buildRadarCompetitiveReport } from "@/lib/radar/competitive-report";
import { buildRadarWorkbenchStages, resolveRadarWorkbenchArticleId, summarizeRadarReferenceCounts, type RadarAdditionalEvidenceState } from "@/lib/radar/workbench";
import { clearSelection, createRadarSpreadsheetSelection, selectAndActivateArticle, selectVisibleArticles, setArticleSelection, type RadarSpreadsheetSelectionState } from "@/lib/radar/spreadsheet-selection";
import { buildRadarR3Model, type RadarR3Model } from "@/lib/radar/r3-workbench";
import { availableBulkActions, createRadarR4LocalArticleState, createRadarR4SerpQueue, nextActionForRadarR4Article, radarR4AmazonStatusLabel, radarR4SpecialistStatusLabel, removeRadarR4Topic, moveRadarR4Topic, updateRadarR4Topic, updateRadarR4SerpQueueItem, type RadarR4AmazonState, type RadarR4BulkArticleSnapshot, type RadarR4BulkOperation, type RadarR4ExistingContentKind, type RadarR4ExistingContentState, type RadarR4LocalArticleState, type RadarR4SerpQueue, type RadarR4Topic } from "@/lib/radar/r4-queue";
import { areRadarR5TopicsReviewed, classifyRadarR5SerpFailure, deriveRadarR5PersistedSerpState, latestRadarR5SerpRecord, topicSuggestionsToRadarTopics } from "@/lib/radar/r5-sequential";
import { deriveRadarSerpReviewState } from "@/lib/radar/serp-review-state";
import { buildExpertTopicContext, buildRadarR6ConsolidatedReport, normalizeRadarR6ReportState, radarR6CanApproveReport, radarR6TopicReviewCounts, radarR6ReportStateLabel, type RadarR6ExpertEvidenceInput, type RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import { parseRadarR7TopicResponse, preserveRadarR7TopicsOnFailure, radarR7ReportEvidenceFingerprint } from "@/lib/radar/r7-sequential";
import { approveRadarReport } from "@/lib/radar/report-approval";
import { buildRadarKgrStrategy } from "@/lib/radar/strategy-context";
import { classifyRadarSerpCollectionFailure, radarSerpCollectionAction, type RadarSerpCollectionState } from "@/lib/radar/serp-collection-state";
import { ImportPanel, Field, card, btn, sessionId, useReadyPipeline } from "@/components/editorial/operational-screen-shared";
import { useNoticeBridge } from "@/components/global-notice-center";
import { RadarWorkbench } from "./radar-workbench";
import { RadarR3ProfileMirror } from "./radar-r3-profile-mirror";
import { RadarR4BulkOperationsBar, RadarR5QueueProgress, type RadarR5QueueView } from "./radar-r4-bulk-operations-bar";
import { useRadarAnalysisReadback } from "./use-radar-analysis-readback";
import { useRadarSerpReviewReadback } from "./use-radar-serp-review-readback";

type RadarR5TopicHistory = { past: RadarR4Topic[][]; future: RadarR4Topic[][] };
type RadarSerpAction = { articleId: string; kind: "start" | "decision" | "extract" };
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

export function RadarPage({ brandRef }: { brandRef: string }) {
  const { data: session } = useSession(); const router = useRouter(); const { selectedBrandId } = useBrand(); const { pipeline, state } = useReadyPipeline(); const [picker, setPicker] = useState(false); const [notice, setNotice] = useState(""); const [busyArticleId, setBusyArticleId] = useState<string | null>(null); const [reviewingArticleId, setReviewingArticleId] = useState<string | null>(null); const [serpAction, setSerpAction] = useState<RadarSerpAction | null>(null); const serpActionRef = useRef<RadarSerpAction | null>(null); const reviewingArticleIdRef = useRef<string | null>(null); const [expandedRadarId, setExpandedRadarId] = useState<string | null>(null); const [spreadsheetSelection, setSpreadsheetSelection] = useState(createRadarSpreadsheetSelection); const { activeArticleId, selectedArticleIds } = spreadsheetSelection; const [r4LocalByArticle, setR4LocalByArticle] = useState<Record<string, RadarR4LocalArticleState>>({}); const [r4SerpQueue, setR4SerpQueue] = useState<RadarR4SerpQueue | null>(null); const [topicHistoryByArticle, setTopicHistoryByArticle] = useState<Record<string, RadarR5TopicHistory>>({}); const [expertEvidenceByArticle, setExpertEvidenceByArticle] = useState<Record<string, RadarR6ExpertEvidenceInput[]>>({}); const [canonicalExpertEvidenceByArticle, setCanonicalExpertEvidenceByArticle] = useState<Record<string, RadarExpertEvidence[]>>({}); const [expertContributionSummaryByArticle, setExpertContributionSummaryByArticle] = useState<Record<string, { contributionCount: number; pendingCount: number; blockedEvidenceCount: number; remote: true; articleDnaVersionId: string }>>({}); const approvingArticleIdRef = useRef<string | null>(null); const collectingArticleIdRef = useRef<string | null>(null); const [collectionByArticle, setCollectionByArticle] = useState<Record<string, { state: RadarSerpCollectionState; blockedReason: string | null }>>({});
  const claimSerpAction = (next: RadarSerpAction) => { if (serpActionRef.current || serpAction) return false; serpActionRef.current = next; setSerpAction(next); return true; };
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
    return { article, view, analysis, latestSerpRecord: record, latestReview, reviewState, referenceCounts, analysisQueue, pagesAnalyzed, reportGenerated, reportApproved, reportState, r6Report, sentToPlanner, additionalEvidenceState, activity, nextAction: r3.nextAction, stages, publicationLabel, serpStatus, kgrStrategy, expertSummary, collection, r3: { ...r3, serp: { ...r3.serp, collection } } };
  };
  const resolvedActiveArticleId = resolveRadarWorkbenchArticleId({ selectedId: activeArticleId, rowIds: pipeline.radarItems.map(row => row.articleId) });
  const activeRadarItem = resolvedActiveArticleId ? pipeline.radarItems.find(row => row.articleId === resolvedActiveArticleId) || null : null;
  const activeRadarRowId = activeRadarItem?.id || null;
  const bulkSelectedRowIds = new Set(pipeline.radarItems.filter(row => selectedArticleIds.includes(row.articleId)).map(row => row.id));
  const activeWorkbenchData = activeRadarItem ? rowWorkbenchData(activeRadarItem) : null;
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
  const columns: OperationalGridColumn<RadarItem>[] = [
    { id: "article", header: "Artigo", value: row => `${row.title} ${resolveRowKeyword(row).keyword} ${row.hierarchy}`, pinned: "left", sortable: true, width: 280, render: row => { const data = rowWorkbenchData(row); const isFocused = row.articleId === activeArticleId; return <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><strong className="block truncate text-sm text-foreground">{data.r3.title}</strong>{isFocused && <span className="shrink-0 rounded border border-context-accent/35 px-1.5 py-0.5 text-[10px] font-semibold text-context-accent">Em foco</span>}</div><span className="mt-1 block truncate text-sm text-keyword">{data.r3.keyword} · {data.r3.silo} · {data.r3.articleDnaVersion}</span></div>; } },
    { id: "serp", header: "SERP", value: row => { const data = rowWorkbenchData(row); return `${data.r3.serp.provider} ${data.r3.serp.resultCount} ${data.r3.serp.pendingCount} ${data.r3.r4?.serp.state || ""}`; }, width: 185, render: row => { const data = rowWorkbenchData(row).r3; const queue = data.r4?.serp; const queueLabel = queue?.state === "QUEUED" ? `Na fila ${queue.position || 1}/${queue.total || 1}` : queue?.state === "RUNNING" ? `Processando ${queue.position || 1}/${queue.total || 1}` : queue?.state === "WAITING_REVIEW" ? "Aguardando revisão" : queue?.state === "FAILED_RETRYABLE" ? "Falha · tentar novamente" : queue?.state === "FAILED_FINAL" ? (data.serp.collection?.state === "STRUCTURAL_BLOCK" ? "Coleta bloqueada" : "Falha final") : queue?.state === "COMPLETED" ? "SERP concluída" : data.serp.resultCount ? `${data.serp.resultCount} resultado(s)` : "Aguardando SERP"; return <div><strong className="block text-sm text-foreground">{queueLabel}</strong><span className="mt-1 block text-sm text-text-muted">{data.serp.provider} · {data.serp.pendingCount} pendente(s)</span></div>; } },
    { id: "amazon", header: "Amazon", value: row => { const data = rowWorkbenchData(row); return radarR4AmazonStatusLabel(data.r3.r4?.amazon || "AMAZON_NOT_APPLICABLE"); }, width: 165, render: row => { const data = rowWorkbenchData(row).r3; const amazonState = data.r4?.amazon || "AMAZON_NOT_APPLICABLE"; return <div><strong className="block text-sm text-foreground">{radarR4AmazonStatusLabel(amazonState)}</strong><span className="mt-1 block text-sm text-text-muted">Sem coleta externa</span></div>; } },
    { id: "content", header: "Conteúdo", value: row => { const data = rowWorkbenchData(row).r3.content; return `${data.articleDnaVersion} ${data.needs} ${data.evidenceCount}`; }, width: 190, render: row => { const data = rowWorkbenchData(row).r3.content; return <div><strong className="block text-sm text-foreground">{data.articleDnaVersion} · {data.needs} necessidade(s)</strong><span className="mt-1 block text-sm text-text-muted">{data.evidenceCount} evidência(s) · {data.sourceCount} fonte(s)</span></div>; } },
    { id: "specialist", header: "Especialista", value: row => rowWorkbenchData(row).r3.specialist.status, width: 180, render: row => { const data = rowWorkbenchData(row).r3.specialist; return <div><strong className="block text-sm text-foreground">{data.status}</strong><span className="mt-1 block text-sm text-text-muted">{data.expert} · {data.contributionsReceived} recebida(s) · {data.pending} pendente(s)</span></div>; } },
    { id: "report", header: "Relatório", value: row => rowWorkbenchData(row).reportState, width: 170, render: row => { const data = rowWorkbenchData(row); const localReport = data.reportState !== "NOT_STARTED"; return <div><strong className="block text-sm text-foreground">{localReport ? radarR6ReportStateLabel(data.reportState) : data.r3.report.status}</strong><span className="mt-1 block text-sm text-text-muted">{localReport ? `${data.r6Report?.needs.length || data.r3.report.needs} necessidade(s) · local` : `${data.r3.report.needs} necessidade(s) · ${data.r3.report.sentToPlanner ? "Planejador" : "Não enviado"}`}</span></div>; } },
    { id: "nextAction", header: "Próxima ação", value: row => rowWorkbenchData(row).r3.nextAction, width: 235, render: row => <span className="block whitespace-normal text-sm leading-5 text-foreground">{rowWorkbenchData(row).r3.nextAction}</span> },
    { id: "format", header: "Formato", value: row => row.format, filterOptions: [...new Set(pipeline.radarItems.map(item => item.format))].map(value => ({ label: value, value })), width: 110 },
    { id: "state", header: "Status", value: row => row.state, render: row => <WorkflowStatusBadge status={row.state}/>, sortable: true, filterOptions: ["research_pending", "researching", "needs_review", "conflicts", "awaiting_approval", "approved", "sent_planner"].map(value => ({ label: value, value })), width: 165 },
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
    setNotice(saved.persistenceMode === "remote" && saved.readbackConfirmed
      ? `${message} Persistência remota e readback confirmados.`
      : `${message} A recuperação local foi atualizada, mas a persistência remota não foi confirmada.`);
    return saved;
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
    if (!claimSerpAction({ articleId: target.articleId, kind: "start" })) return;
    setNotice("");
    try {
      const next = await createRadarAnalysisVersion({ brandId: target.brandId, article: data.article, research, mode: recommendation.suggestedMode, modeRecommendation: recommendation, actorId: sessionId(session), ownDomainHost: hostOf(data.article.payload.canonical), previous });
      await persistSerpAnalysis(target.articleId, next, "Curadoria iniciada usando o snapshot existente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a curadoria da SERP.");
    } finally { releaseSerpAction(target.articleId, "start"); }
  };
  const persistSerpDecision = async (key: string, role?: RadarSerpDecisionRole, reasonOverride?: string) => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data?.analysis || !data.view || serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) return;
    const currentDecision = data.analysis.payload.serpDecisions.find(decision => decision.key === key);
    if (!currentDecision) { setNotice("A decisão não pertence ao snapshot SERP atualmente selecionado."); return; }
    const decisionValues = role ? { ...decisionForSerpRole(role), ...(reasonOverride !== undefined ? { reason: reasonOverride } : {}) } : { decision: currentDecision.decision, reason: reasonOverride ?? currentDecision.reason };
    const nextDecisions = data.analysis.payload.serpDecisions.map(decision => decision.key === key ? { ...decision, decision: decisionValues.decision, reason: decisionValues.reason } : decision);
    const projected = { ...data.analysis, payload: { ...data.analysis.payload, serpDecisions: nextDecisions } } as RadarAnalysisVersion;
    const selectedCompetitorIds = selectedRadarOrganicDecisionKeys(data.view, projected, radarSelectionScope(target));
    const selectedUrls = new Set(data.view.organicResults.filter(result => selectedCompetitorIds.includes(radarOrganicDecisionKey(result))).map(result => result.url));
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
      await persistSerpAnalysis(target.articleId, next, "Curadoria atualizada; a análise derivada foi reaberta para a nova seleção.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar a decisão da curadoria.");
    } finally { releaseSerpAction(target.articleId, "decision"); }
  };
  const analyzeSerpSelection = async () => {
    const target = activeRadarItem;
    const data = activeWorkbenchData;
    if (!target || !data?.article || !data.analysis || !data.view?.record.research || serpActionRef.current || serpAction || busyArticleId || reviewingArticleIdRef.current || reviewingArticleId) return;
    const candidates = radarAnalysisCandidates(data.view, data.analysis, radarSelectionScope(target));
    if (!candidates.length) { setNotice("Nenhuma referência selecionada aguarda análise. Ajuste a curadoria ou consulte as páginas já analisadas."); return; }
    const research = data.view.record.research;
    if (!claimSerpAction({ articleId: target.articleId, kind: "extract" })) return;
    setNotice("");
    try {
      const response = await fetch("/api/editorial/radar-analysis/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: target.brandId, articleId: target.articleId, analysis: data.analysis, candidates }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível analisar as referências selecionadas.");
      const pages: RadarExtractionPage[] = (Array.isArray(body.pages) ? body.pages : []).flatMap((item: { page?: unknown }) => {
        const parsed = RadarExtractionPageSchema.safeParse(item.page);
        return parsed.success ? [parsed.data] : [];
      });
      const selectionScope = radarSelectionScope(target);
      const selectedKeys = selectedRadarOrganicDecisionKeys(data.view, data.analysis, selectionScope);
      const primaryUrls = new Set(buildRadarSerpSelectionProjection(data.view, data.analysis, selectionScope).rows.filter(selection => selection.role === "primary").map(selection => selection.result.url));
      const benchmark = buildRadarBenchmark(data.analysis.payload.mode, pages.filter(page => primaryUrls.has(page.url)));
      const semanticTerms = pages.flatMap(page => page.recurringTerms).slice(0, 50).map(term => ({ term: term.term, frequency: term.frequency, pageCount: term.pageCount, pageIds: term.pageIds, sources: term.sources.filter((source): source is "body" | "h1" | "h2" | "h3" | "title" => ["body", "h1", "h2", "h3", "title"].includes(source)), relation: "Termo recorrente observado nas páginas selecionadas.", decision: "pending" as const, note: "" }));
      const structuralDecisions = Object.entries(benchmark.metrics).map(([metricKey, metric]) => ({ key: metricKey, label: metric.label, observedCount: Math.round(metric.mean), sampleSize: metric.sampleSize, observedText: `Observado: média ${metric.mean.toFixed(1)}; faixa ${metric.typicalRange[0].toFixed(0)}–${metric.typicalRange[1].toFixed(0)}.`, level: "optional" as const, enforcement: "advisory" as const, humanNote: "" }));
      const competitorCount = pages.length;
      const competitiveness = { classification: competitorCount >= 5 ? "high" as const : competitorCount >= 3 ? "medium" as const : competitorCount ? "low" as const : "insufficient_evidence" as const, dimensions: { sample: Math.min(1, competitorCount / 5), structure: Math.min(1, (benchmark.metrics.h2?.mean || 0) / 12), depth: Math.min(1, (benchmark.metrics.words?.mean || 0) / 2500) }, reasons: [`${competitorCount} página(s) selecionada(s) foram extraídas.`, "A classificação é observacional e não define o plano editorial."], score: competitorCount ? Math.min(1, competitorCount / 5) : null };
      const mergedExtractions = [...data.analysis.payload.extractions.filter(page => !pages.some(nextPage => nextPage.url === page.url)), ...pages];
      const nextVersionId = crypto.randomUUID();
      const candidatePayload = { ...data.analysis.payload, selectedCompetitorIds: selectedKeys, extractionIds: [...new Set(mergedExtractions.map(page => page.id))], extractions: mergedExtractions, benchmark, semanticTerms, structuralDecisions, competitiveness };
      const report = await buildRadarCompetitiveReport({ payload: candidatePayload, article: data.article!.payload, research, radarItemId: target.id, analysisVersionId: nextVersionId, analysisVersionNumber: data.analysis.versionNumber + 1, generatedBy: sessionId(session), siloDnaVersionId: target.siloId ? pipeline.siloVersions[target.siloId]?.versionId || null : null, status: "draft" });
      const next = await createRadarAnalysisSuccessor(data.analysis, { ...candidatePayload, competitiveReport: report }, sessionId(session), undefined, nextVersionId);
      await persistSerpAnalysis(target.articleId, next, `${pages.length} referência(s) analisada(s) usando somente a seleção humana.`);
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
        needs: report?.needs.flatMap(need => [need.title, ...need.topics]) || data.view?.diagnostic?.opportunities || [],
        openGaps: [...(report?.profile.limitations || []), ...(data.view?.diagnostic?.possibleConflicts || [])],
        conflicts: data.view?.diagnostic?.possibleConflicts || [],
        knownQuestions: [...(data.view?.peopleAlsoAsk || []).map(question => question.question), ...(data.view?.relatedSearches || []).map(search => search.term)],
        approvedReferences,
      },
      amazon: { state: local.amazon, criteria: [], evidence: [] },
      existingContent: local.existingContent || [],
    });
  };
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
  const generateReportForArticle = () => {
    if (!activeRadarItem) return;
    updateLocalState(activeRadarItem.articleId, current => ({ ...current, report: "REPORT_GENERATED", reportApprovedEvidenceFingerprint: null }));
    setNotice("Prévia do relatório atualizada localmente. Nenhuma versão remota foi criada.");
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
  return <div className="flex min-h-screen flex-col bg-background">{notice && <div className="shrink-0 border-b border-warning/40 bg-warning-soft/30 px-4 py-2 text-sm text-warning" role="status">{notice}</div>}<RadarWorkbench key={activeRadarRowId || "radar-empty"} model={activeWorkbenchData?.r3 || null} expertContext={activeExpertContext} refreshing={Boolean(busyArticleId)} reviewingSerp={Boolean(reviewingArticleId)} onReviewSerp={reviewSerpForArticle} serpAction={serpAction && serpAction.articleId === activeRadarItem?.articleId ? serpAction.kind : null} onStartSerpAnalysis={() => void startSerpAnalysis()} onSerpDecisionChange={(key, role, reason) => void persistSerpDecision(key, role, reason)} onSerpDecisionReasonChange={(key, reason) => void persistSerpDecision(key, undefined, reason)} onAnalyzeSerpSelection={() => void analyzeSerpSelection()} serpApprovalBlockedReason={serpApprovalBlockedReason} serpReviewRemoteConfirmed={serpReviewRemoteConfirmed} onRefreshSerp={() => activeRadarItem ? void collect(activeRadarItem) : undefined} onFocusAdjacent={focusAdjacent} pendingReviewCount={pendingReviewRows.length} onTopicChange={updateTopicForArticle} onTopicRemove={removeTopicForArticle} onTopicMove={moveTopicForArticle} onTopicAdd={addTopicForArticle} onTopicReview={reviewTopicForArticle} onTopicUndo={undoTopicsForArticle} onTopicRedo={redoTopicsForArticle} canUndoTopics={Boolean(activeRadarItem && topicHistoryByArticle[activeRadarItem.articleId]?.past.length)} canRedoTopics={Boolean(activeRadarItem && topicHistoryByArticle[activeRadarItem.articleId]?.future.length)} onTopicAdjacent={focusTopicAdjacent} topicQueuePosition={activeTopicQueuePosition && activeTopicQueuePosition > 0 ? activeTopicQueuePosition : undefined} topicQueueTotal={pendingTopicRows.length || undefined} onExistingContentAdd={addExistingContentForArticle} onExistingContentStateChange={updateExistingContentState} onReportGenerate={generateReportForArticle} onReportReview={reviewReportForArticle} onReportApprove={() => void approveReportForArticle()} onAmazonStateChange={setAmazonStateForArticle} onOpenArticle={openActiveArticle} onOpenDetail={openDetail} onExpertEvidenceChange={handleExpertEvidenceChange}/><HistoryControls entries={history.entries} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onRestore={history.restore} moduleId="radar" showHistory={false} showUndoRedo={false}/><div className="flex min-h-0 flex-1 flex-col" data-radar-r4-focused-id={activeArticleId || undefined} data-radar-r4-selected-count={selectedArticleIds.length} data-radar-r4-serp-batch-id={r4SerpQueue?.id || undefined}><RadarR5QueueProgress queue={r4SerpQueue} onView={focusQueueView}/><div className="shrink-0 border-b border-divider bg-background px-4 py-2" data-testid="radar-r4-spreadsheet-heading"><h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Planilha</h2>{diagnostico.incompatible.length > 0 && <p className="mt-1 text-sm text-warning" role="status">{loadStateSummary(diagnostico)} · {diagnostico.incompatible.map(registro => `${registro.stage || registro.kind} ${registro.id}${registro.paths.length ? ` (${registro.paths.join(", ")})` : ""}`).join(" · ")} <button type="button" className="underline" onClick={() => void pipeline.reloadOperational()}>Tentar carregar novamente</button></p>}</div><OperationalDataGrid module="radar" userId={sessionId(session)} brandId={selectedBrandId} rows={pipeline.radarItems} columns={columns} expandedRowId={expandedRadarId} onExpandedRowChange={handleExpandedChange} bulkSelectedRowIds={bulkSelectedRowIds} onBulkSelectionChange={handleBulkSelectionChange} activeRowId={activeRadarRowId} activeRowClassName="border-l-2 border-l-context-accent bg-surface-subtle/55" bulkSelectedRowClassName="bg-positive-soft/10" onRowActivate={handleRowActivate} topbar={{ moduleId: "radar", history: { getCount: () => history.entries.length, canUndo: () => history.canUndo, canRedo: () => history.canRedo, undo: history.undo, redo: history.redo, open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "radar" } })) }, renderActions: renderTopbarActions }} emptyTitle={radarEmptyTitle} renderBulkBar={rows => <RadarR4BulkOperationsBar selectedRows={selectedSnapshotsFor(rows)} onAction={handleBulkAction}/>} renderExpanded={row => <RadarProfile r3={rowWorkbenchData(row).r3} articleHref={buildRadarArticleHref({ brandRef, articleId: radarCanonicalRouteKey(row) })} architectHref={buildRadarArchitectHref({ brandRef, articleId: row.articleId })}/>} /></div>{picker && <ImportPanel title="Importar artigos aprovados" rows={importable} label={version => `${version.payload.promise} · /${version.suggestedSlug} · ${version.payload.mainIntent}`} onClose={() => setPicker(false)} onImport={ids => { const selectedVersions = importable.filter(version => ids.includes(version.id)); history.capture(`Importar ${selectedVersions.length} artigos do Arquiteto`); void (async () => { const graphs = await loadInternalLinkGraphs(selectedBrandId).catch(() => []); const result = await pipeline.importApprovedToRadar(selectedVersions.map(version => version.payload.articleId), [], {}, {}, graphs); const partes = [`${result.imported} item(ns) enviado(s)`]; if (result.skipped) partes.push(`${result.skipped} já existente(s)`); for (const item of result.blocked) partes.push(`${item.label} bloqueado: ${item.reasons.join(" ")}`); setNotice(partes.join(" · ")); })(); setPicker(false); }}/>}</div>;
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
      {article ? <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="ArticleDNA" value={`v${article.versionNumber}`}/><Field label="Keyword principal" tone="keyword" value={primaryKeyword}/><Field label="Secundárias e reforços" value={Math.max(0, article.payload.keywordReferences.length - 1)}/><Field label="Intenção" value={article.payload.mainIntent}/><Field label="Função no silo" value={row.hierarchy}/><Field label="Publicação" value={publicationLabel}/><Field label="Slug" value={`/${row.slug}`}/><Field label="Canonical" value={article.payload.canonical || "Ainda não confirmada"}/></dl> : <p className="mt-3 text-sm text-warning">ArticleDNA não hidratado para esta linha.</p>}
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
  return <div className="grid gap-3 lg:grid-cols-3"><section className={card}><h3 className="text-[10px] font-bold">Definição do artigo e referências</h3>{article ? <dl className="mt-2 space-y-2"><Field label="Intenção" value={article.payload.mainIntent}/><Field label="Cobertura" value={article.payload.coverage.join(" · ")}/><Field label="Keywords" value={article.payload.keywordReferences.length}/><Field label="Fronteira" value={article.payload.antiCannibalizationBoundary}/></dl> : <p className="mt-2 text-[10px] text-red-400">Versão ausente.</p>}</section><section className={card}><h3 className="text-[10px] font-bold">SERP e evidências</h3>{serp ? <><DataOriginBadge origin={serp.origin}/><dl className="mt-2 space-y-2"><Field label="Intenção dominante" value={serp.snapshot?.dominantIntent}/><Field label="Perguntas" value={serp.snapshot?.questions.join(" · ")}/><Field label="Lacunas" value={serp.snapshot?.gaps.join(" · ")}/></dl></> : <ProviderNotConfiguredState/>}</section><section className={card}><h3 className="text-[10px] font-bold">Originalidade</h3><p className="mt-2 text-[10px] text-slate-500">Conflito interno: funcional.</p><p className="mt-1 text-[10px] text-slate-500">Similaridade externa: aguardando provedor.</p><p className="mt-1 text-[10px] text-slate-500">Originalidade estratégica: decisão humana.</p></section></div>;
}

function RadarDetail({ row, article, pipeline }: { row: RadarItem; article?: VersionEnvelope<ArticleDNA>; pipeline: ReturnType<typeof useEditorialPipeline> }) {
  const snapshots = [...pipeline.serpRecords.filter(record => record.input.articleId === row.articleId)].sort((a, b) => (a.research?.version || 0) - (b.research?.version || 0));
  const serp = snapshots.at(-1); const review = serp && pipeline.serpReviews.find(item => item.snapshotId === serp.id); const [notes, setNotes] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const decide = async (status: "approved" | "rejected") => { if (!serp?.research) return; setSaving(true); setMessage(""); try { const result = await pipeline.reviewSerp(row.articleId, serp.id, status, notes); setMessage(result.persistenceMode === "remote" && result.readbackConfirmed ? status === "approved" ? "Pesquisa aprovada; write remoto e readback confirmados. A análise permanece imutável." : "Pesquisa rejeitada; write remoto e readback confirmados." : "A decisão foi aplicada na recuperação local; a persistência remota não foi confirmada."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível registrar a decisão."); } finally { setSaving(false); } };
  return <div className="grid gap-3 lg:grid-cols-3"><section className={card}><h3 className="text-[10px] font-bold">Definição do artigo e referências</h3>{article ? <dl className="mt-2 space-y-2"><Field label="Intenção" value={article.payload.mainIntent}/><Field label="Cobertura" value={article.payload.coverage.join(" · ")}/><Field label="Keywords" value={article.payload.keywordReferences.length}/><Field label="Fronteira" value={article.payload.antiCannibalizationBoundary}/></dl> : <p className="mt-2 text-[10px] text-red-400">Versão ausente.</p>}</section><section className={`${card} lg:col-span-2`}><div className="flex items-center justify-between"><h3 className="text-[10px] font-bold">SERP e revisão humana</h3>{serp && <DataOriginBadge origin={serp.origin}/>}</div>{!serp && <ProviderNotConfiguredState/>}{serp && !serp.research && <p className="mt-2 text-[10px] text-amber-300">Dados simulados: não podem ser aprovados como evidência real.</p>}{serp?.research && <><div className="mt-2 grid gap-2 sm:grid-cols-4"><Field label="Consulta" value={serp.research.query}/><Field label="Captura" value={new Date(serp.research.collectedAt).toLocaleString("pt-BR")}/><Field label="Análise da SERP" value={`v${serp.research.version}`}/><Field label="Persistência" value={serp.persistenceMode === "remote" ? "remota" : "local — não confirmada"}/></div><div className="mt-3 grid gap-3 md:grid-cols-2"><section><h4 className="text-[9px] font-bold uppercase text-slate-500">Resultados orgânicos ({serp.research.organicResults.length})</h4><div className="mt-1 max-h-64 overflow-auto rounded border border-slate-900">{serp.research.organicResults.length ? serp.research.organicResults.map(result => <div key={`${serp.id}:${result.position}`} className="border-b border-slate-900 p-2 text-[10px] last:border-0"><div className="flex justify-between gap-2"><strong>{result.position}. {result.title}</strong><span className="text-slate-600">{result.manualType || result.inferredType} · {result.confidence}</span></div><a className="break-all text-teal-400" href={result.url} target="_blank" rel="noreferrer">{result.domain}</a><p className="mt-1 text-slate-500">{result.snippet || "Sem snippet retornado."}</p></div>) : <p className="p-2 text-[10px] text-slate-500">Nenhum resultado orgânico retornado.</p>}</div></section><section><h4 className="text-[9px] font-bold uppercase text-slate-500">People Also Ask ({serp.research.peopleAlsoAsk.length})</h4><div className="mt-1 max-h-64 overflow-auto rounded border border-slate-900">{serp.research.peopleAlsoAsk.length ? serp.research.peopleAlsoAsk.map(item => <div key={`${serp.id}:paa:${item.position}`} className="border-b border-slate-900 p-2 text-[10px] last:border-0"><strong>{item.question}</strong><p className="mt-1 text-slate-500">{item.answer || "Sem resposta resumida retornada."}</p></div>) : <p className="p-2 text-[10px] text-slate-500">Nenhuma pergunta retornada.</p>}</div><h4 className="mt-3 text-[9px] font-bold uppercase text-slate-500">Pesquisas relacionadas ({serp.research.relatedSearches.length})</h4><div className="mt-1 flex flex-wrap gap-1">{serp.research.relatedSearches.length ? serp.research.relatedSearches.map(item => <span key={`${serp.id}:related:${item.term}`} className="rounded border border-slate-800 px-1.5 py-1 text-[9px] text-slate-400">{item.term}</span>) : <span className="text-[10px] text-slate-500">Nenhuma retornada.</span>}</div></section></div><section className="mt-3 rounded border border-context-accent/25 bg-context-accent/10 p-2"><h4 className="text-[9px] font-bold uppercase text-context-accent">Diagnóstico determinístico</h4><div className="mt-2 grid gap-2 sm:grid-cols-3"><Field label="Intenção aparente" value={serp.research.diagnostic.dominantIntent}/><Field label="Confiança" value={serp.research.diagnostic.confidence}/><Field label="Veredito" value={serp.research.diagnostic.verdict}/><Field label="Formatos" value={serp.research.diagnostic.dominantFormats.join(" · ")}/><Field label="Domínios recorrentes" value={serp.research.diagnostic.frequentDomains.join(" · ")}/><Field label="Conflitos" value={serp.research.diagnostic.possibleConflicts.join(" · ")}/></div><p className="mt-2 text-[9px] text-slate-500">{serp.research.diagnostic.limitations.join(" ")}</p></section><div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-[260px] flex-1 text-[9px] text-slate-500">Nota da revisão<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded border border-slate-800 bg-black p-2 text-[10px] text-slate-200" placeholder="Registre a decisão humana…"/></label><button className={`${btn} border-emerald-900 text-emerald-300`} disabled={saving} onClick={() => void decide("approved")}><CheckCircle2 className="mr-1 h-3 w-3"/>{review?.status === "approved" ? "Aprovada" : "Aprovar pesquisa"}</button><button className={`${btn} border-red-900 text-red-300`} disabled={saving} onClick={() => void decide("rejected")}><XCircle className="mr-1 h-3 w-3"/>Rejeitar pesquisa</button></div>{review && <p className="mt-2 text-[9px] text-slate-500">Última decisão: {review.status} por {review.reviewedBy} em {new Date(review.reviewedAt).toLocaleString("pt-BR")}. {review.notes}</p>}{message && <p className="mt-2 text-[9px] text-amber-300">{message}</p>}</>}</section><section className={card}><h3 className="text-[10px] font-bold">Histórico de análises</h3>{snapshots.length ? <div className="mt-2 space-y-1">{snapshots.map(snapshot => <div key={snapshot.id} className="flex justify-between gap-2 border-b border-slate-900 py-1 text-[9px]"><span>{snapshot.research ? `v${snapshot.research.version} · ${snapshot.origin}` : "mock"}</span><span className="text-slate-600">{snapshot.research?.contentHash.slice(0, 10) || "local"}</span></div>)}</div> : <p className="mt-2 text-[10px] text-slate-500">Nenhuma pesquisa registrada.</p>}</section></div>;
}
