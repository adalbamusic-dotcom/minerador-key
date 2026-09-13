"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { radarConclusiveIntent, radarDeclaredArticleIntent } from "@/lib/radar/editorial-identity";
import { useRouter, useSearchParams } from "next/navigation";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { useBrand } from "@/components/brand-context";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import type { RadarAnalysisVersion, RadarExpertEvidence } from "@/lib/radar/analysis-contracts";
import { buildRadarBenchmark, createRadarAnalysisSuccessor, createRadarAnalysisVersion, suggestRadarAnalysisMode } from "@/lib/radar/analysis-contracts";
import { isRadarPlannerHandoff } from "@/lib/radar/planner-handoff";
import { approveRadarReport, radarReportApprovalIssues } from "@/lib/radar/report-approval";
import { deriveRadarSerpReviewState } from "@/lib/radar/serp-review-state";
import { selectedRadarOrganicDecisionKeys } from "@/lib/radar/serp-curation";
import { compareStrategyWithSerp, resolveRadarPublication, type RadarComparisonStatus } from "@/lib/radar/editorial-identity";
import { buildRadarArchitectHref, buildRadarArticleHref, buildRadarModuleHref, radarCanonicalRouteKey, resolveRadarRouteItem } from "@/lib/radar/route-resolution";
import { selectLatestRadarSerpRecord } from "@/lib/radar/serp-hydration";
import { buildRadarSerpView, type RadarSerpView } from "@/lib/radar/snapshot-view";
import { radarAnalysisMatchesSerp } from "@/lib/radar/serp-curation";
import type { SerpOrganicResult } from "@/lib/radar/serp/contracts";
import { classifyRadarExtractionFormat, classifyRadarSemanticTerm, extractionFormatLabel, semanticGroupLabel, summarizeRadarExtractionFormats } from "@/lib/radar/analysis-insights";
import { deriveRadarTransferState } from "@/lib/radar/workflow-insights";
import { buildRadarKgrStrategy, radarKgrClassificationLabel, radarSlugAlignmentLabel } from "@/lib/radar/strategy-context";
import { buildRadarCompetitiveReport } from "@/lib/radar/competitive-report";

import { buildRadarFlowProgress, deriveRadarReferenceRole, radarSemanticDecisionLabel, resolveRadarTab, selectRadarSemanticPresentation, type RadarReferenceRole, type RadarTab } from "@/lib/radar/flow-presentation";
import { buildExpertTopicContext } from "@/lib/radar/r6-sequential";
import { parseRadarExpertEvidenceReviews, projectRadarExpertEvidence, type RadarExpertBriefEvidenceSource, type RadarExpertContributionEvidenceSource } from "@/lib/radar/expert-evidence";
import { CompetitiveReportPanel } from "./competitive-report-panel";
import { RadarExpertBriefPanel } from "./radar-expert-brief-panel";
import { RadarAnalysisSignals } from "./radar-analysis-signals";
import { RadarSerpScreen } from "./radar-serp-screen";
import { useNoticeBridge } from "@/components/global-notice-center";

const tabs: RadarTab[] = ["resumo", "serp", "referencias", "analise-serp", "evidencias-adicionais", "relatorio", "historico"];
type Tab = RadarTab;
type Decision = RadarAnalysisVersion["payload"]["serpDecisions"][number];
type DraftText = { reason: string; note: string };

const tabLabels: Record<Tab, string> = { resumo: "Resumo", serp: "SERP", referencias: "Referências", "analise-serp": "Análise SERP", "evidencias-adicionais": "Evidências adicionais", relatorio: "Relatório", historico: "Histórico" };
const button = "inline-flex min-h-10 items-center justify-center rounded border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-teal-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70 disabled:cursor-not-allowed disabled:opacity-50";
const card = "rounded border border-slate-800 bg-slate-950/40 p-3";
const flowSection = "rounded-lg border border-slate-800 bg-slate-900/35 p-5";

function actorId(session: ReturnType<typeof useSession>["data"]) { return session?.user?.email || session?.user?.id || "usuario-local"; }
function hostOf(value: string | null | undefined) { try { return value ? new URL(value).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { return ""; } }
function resultDomain(result: SerpOrganicResult) { return result.domain || hostOf(result.url); }
function resultFormat(result: SerpOrganicResult) { return (result.manualType || result.inferredType || "orgânico").toLocaleLowerCase("pt-BR"); }
function isFormatReference(result: SerpOrganicResult) { return /video|social|youtube|instagram|tiktok|facebook/.test(`${resultFormat(result)} ${result.url}`.toLocaleLowerCase("pt-BR")); }
function comparisonClass(status: RadarComparisonStatus) { return status === "Alinhado" ? "border-emerald-900/60 text-emerald-200" : status === "Atenção" ? "border-orange-900/60 text-orange-200" : status === "Parcialmente alinhado" ? "border-amber-900/60 text-amber-200" : "border-slate-700 text-slate-300"; }
function publicationStatusLabel(status: string) { return ({ draft: "Rascunho", approved: "Aguardando aprovação", rejected: "Rejeitado", superseded: "Substituído" } as Record<string, string>)[status] || status; }

function Field({ label, value, tone }: { label: string; value: string | number | null | undefined; tone?: "keyword" }) { const displayValue = value === null || value === undefined || value === "" ? "Não informado" : value; return <div><dt className="text-slate-500">{label}</dt><dd className={`mt-0.5 break-words ${tone === "keyword" ? "text-keyword" : "text-slate-200"}`}>{displayValue}</dd></div>; }
function ProtectedField({ label, value, reason }: { label: string; value: string | null | undefined; reason: string }) { const displayValue = value || (label === "Canonical" ? "Não recebido nesta etapa" : label === "URL estrutural" ? "Ainda não confirmada em Publicações" : "Não informado"); const displayReason = !value && label === "Canonical" ? "A identidade publicada permanece protegida. Confirme o vínculo no Arquiteto ou em Publicações." : reason; return <div className="rounded border border-emerald-900/50 bg-emerald-950/10 p-2"><dt className="flex items-center gap-1 text-[10px] text-slate-400"><span aria-hidden="true">🔒</span>{label}<span className="sr-only">Protegido</span></dt><dd className="mt-1 break-all text-[11px] text-white">{displayValue}</dd><p className="mt-1 text-[9px] text-emerald-200">Protegido e preservado. {displayReason}</p></div>; }
function StatusBadge({ status }: { status: RadarComparisonStatus }) { return <span className={`rounded border px-2 py-1 text-[9px] font-semibold ${comparisonClass(status)}`}>{status}</span>; }

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseExpertBriefEvidenceSource(value: unknown): RadarExpertBriefEvidenceSource | null {
  const record = objectValue(value);
  if (!record) return null;
  const id = stringValue(record.id);
  const brandId = stringValue(record.brandId);
  const expertId = stringValue(record.expertId);
  if (!id || !brandId || !expertId) return null;
  return { id, brandId, expertId, articleId: stringValue(record.articleId), articleDnaVersionId: stringValue(record.articleDnaVersionId) };
}

function parseExpertContributionEvidenceSource(value: unknown): RadarExpertContributionEvidenceSource | null {
  const record = objectValue(value);
  if (!record) return null;
  const sourceType = record.sourceType;
  if (sourceType !== "TEXT" && sourceType !== "VOICE" && sourceType !== "AUDIO" && sourceType !== "DOCUMENT") return null;
  const id = stringValue(record.id);
  const brandId = stringValue(record.brandId);
  const expertId = stringValue(record.expertId);
  const briefId = stringValue(record.briefId);
  const externalUpdateId = stringValue(objectValue(record.evidence)?.externalUpdateId);
  const receivedAt = stringValue(record.receivedAt);
  if (!id || !brandId || !expertId || !briefId || !externalUpdateId || !receivedAt) return null;
  return {
    id,
    brandId,
    expertId,
    briefId,
    sourceType,
    originalText: stringValue(record.originalText),
    transcriptText: stringValue(record.transcriptText),
    organizationPayload: objectValue(record.organizationPayload),
    externalUpdateId,
    originalAssetUri: stringValue(objectValue(record.evidence)?.originalAssetUri),
    checksum: stringValue(objectValue(record.evidence)?.checksum),
    receivedAt,
  };
}

type RemoteExpertEvidenceState = {
  selectionKey: string;
  reviewRevision: number;
  loaded: boolean;
  error: string | null;
  briefCount: number;
  contributionCount: number;
  pendingCount: number;
  blockedCount: number;
  evidence: RadarExpertEvidence[];
};

const emptyRemoteExpertEvidence: RemoteExpertEvidenceState = { selectionKey: "", reviewRevision: -1, loaded: false, error: null, briefCount: 0, contributionCount: 0, pendingCount: 0, blockedCount: 0, evidence: [] };

function radarExpertEvidenceFingerprint(evidence: RadarExpertEvidence[]) {
  return JSON.stringify([...evidence].sort((left, right) => left.id.localeCompare(right.id)));
}

function approvedExpertEvidence(analysis: RadarAnalysisVersion | undefined) {
  const packageData = analysis?.payload.plannerPackage;
  return packageData && isRadarPlannerHandoff(packageData) ? packageData.expertEvidence : [];
}

export function RadarAnalysisPage({ brandRef, articleId: routeKey }: { brandRef: string; articleId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { activeBrand, selectedBrandId } = useBrand();
  const pipeline = useEditorialPipeline();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = resolveRadarTab(requestedTab);
  const [mode, setMode] = useState<"kgr_light" | "competitive_full">("kgr_light");
  const modeTouched = useRef(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  useNoticeBridge({ notice, module: "radar", area: "Análise SERP", title: "Radar · Análise", fallbackSeverity: "INFO" });
  const [humanReason, setHumanReason] = useState("");
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, DraftText>>({});
  const [referenceFilter, setReferenceFilter] = useState<"all" | RadarReferenceRole>("all");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [pendingReferencesOnly, setPendingReferencesOnly] = useState(false);
  const [remoteExpertEvidence, setRemoteExpertEvidence] = useState<RemoteExpertEvidenceState>(emptyRemoteExpertEvidence);
  const [remoteExpertEvidenceReviewRevision, setRemoteExpertEvidenceReviewRevision] = useState(0);
  const refreshRemoteExpertEvidence = useCallback(() => {
    setRemoteExpertEvidenceReviewRevision(current => current + 1);
  }, []);

  const row = resolveRadarRouteItem(pipeline.radarItems, routeKey);
  const article = row ? pipeline.articleVersions[row.articleId] : undefined;
  const articleId = row?.articleId || routeKey;
  const canonicalRoute = row ? radarCanonicalRouteKey(row) : routeKey;
  const radarHref = buildRadarArticleHref({ brandRef, articleId: canonicalRoute });
  const radarOverviewHref = buildRadarModuleHref({ brandRef, module: "radar" });
  const routeQuery = searchParams.toString();
  const serp = row ? selectLatestRadarSerpRecord(pipeline.serpRecords, row) : null;
  const serpView = serp ? buildRadarSerpView(serp) : null;
  const research = serp?.research || null;
  const analysisReady = Boolean(research && serpView && !serpView.partial);
  const legacyReview = serp ? pipeline.serpReviews.filter(review => review.snapshotId === serp.id).at(-1) : undefined;
  const latestAnalysis = row?.analysisVersions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
  const analysis = radarAnalysisMatchesSerp({ analysis: latestAnalysis, brandId: row?.brandId || selectedBrandId || "", articleId, articleDnaVersionId: row?.articleDnaVersionId || "", view: serpView }) ? latestAnalysis : null;
  /*
   * A MESMA leitura de atualidade que o Workbench usa.
   *
   * Sem ela esta tela aprovava sobre uma SERP cuja curadoria já tinha mudado:
   * o registro dizia `approved`, mas descrevia uma amostra que ninguém mais
   * estava vendo. É o gate que faltava aqui e existia lá.
   */
  const serpReviewState = deriveRadarSerpReviewState({
    reviews: pipeline.serpReviews.filter(review => review.articleId === articleId),
    snapshotId: serp?.id,
    selectedCompetitorIds: selectedRadarOrganicDecisionKeys(serpView, analysis, row ? { brandId: row.brandId, articleId: row.articleId, articleDnaVersionId: row.articleDnaVersionId } : undefined),
  });
  const conflicts = serp ? pipeline.serpMergeConflicts.filter(conflict => conflict.snapshotId === serp.id || conflict.articleId === articleId) : [];
  const plannerItem = pipeline.plannerItems.find(item => item.articleId === articleId);
  const publicationLegacy = pipeline.publications.find(item => item.articleId === articleId) || null;
  const publicationOperational = pipeline.operationalPublications.find(item => item.articleId === articleId) || null;

  const keywordSource = (() => {
    if (!row || !article) return null;
    const principal = row.hydration?.principalKeyword;
    const ids = new Set([article.payload.principalKeywordId, row.principalKeywordId, row.hydration?.principalKeywordId, principal?.referenceKeywordId, principal?.canonicalKeywordId, principal?.sourceKeywordId, principal?.originalKeywordId, ...(principal?.aliases || [])].filter(Boolean));
    return pipeline.snapshot?.keywords.find(keyword => ids.has(keyword.id)) || null;
  })();

  const silo = row?.siloId ? pipeline.siloVersions[row.siloId] || null : null;
  const siloPage = row?.siloId ? Object.values(pipeline.siloPageVersions).find(page => page.payload.siloId === row.siloId && page.payload.brandId === selectedBrandId) || null : null;
  const siloName = row && (row.hydration?.silo?.name || pipeline.snapshot?.silos.find(item => item.id === row.siloId)?.nome || silo?.payload.centralEntity || null);
  const identity = row && article ? {
    brandName: activeBrand?.nome || pipeline.snapshot?.brand.nome || selectedBrandId || "Marca não identificada",
    title: article.payload.promise || row.title,
    principalKeyword: row.hydration?.principalKeyword?.keyword || keywordSource?.keyword || null,
    slug: row.slug || article.payload.suggestedSlug,
    canonical: article.payload.canonical,
    siloName,
    hierarchy: article.payload.hierarchy || row.hierarchy,
    articleDna: article,
    siloDna: silo,
    siloPage,
    radarItem: row,
    hydration: row.hydration,
    publication: resolveRadarPublication({ legacy: publicationLegacy, operational: publicationOperational, keywordPublished: row.hydration?.principalKeyword?.isPublished }),
  } : null;

  const kgrStrategy = row && article && identity ? buildRadarKgrStrategy({ article: article.payload, context: row.arquitetoStrategyContext || null, published: identity.publication.published, slug: identity.slug, siloName, pillarArticleId: silo?.payload.pillarArticleId }) : null;
  const recommendation = suggestRadarAnalysisMode({ kgr: kgrStrategy?.kgrScore ?? keywordSource?.kgr_score ?? null, volume: kgrStrategy?.principalVolume ?? keywordSource?.volume_search ?? null, kgrClassification: kgrStrategy?.classification, resultCount: serpView?.organicResults.length || 0, keywordDnaConfidence: null, format: article?.payload.hierarchy || row?.format || "article", intent: radarDeclaredArticleIntent(article?.payload) || radarConclusiveIntent(row?.intent) || "" });
  useEffect(() => {
    if (!analysis && !modeTouched.current && mode !== recommendation.suggestedMode) {
      setMode(recommendation.suggestedMode);
    }
  }, [analysis, mode, recommendation.suggestedMode]);
  const comparison = article ? compareStrategyWithSerp({ expectedIntent: radarDeclaredArticleIntent(article.payload), observedIntent: serpView?.diagnostic?.dominantIntent, expectedTopics: article.payload.requiredTopics.slice(0, 8), observedTopics: serpView?.diagnostic?.frequentEntities || [], hasOrganicEvidence: Boolean(serpView?.organicResults.length) }) : null;
  const evidenceApproved = analysis?.payload.status === "approved";
  const latestApprovedAnalysis = row?.analysisVersions.filter(version => version.payload.status === "approved").sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
  const transfer = deriveRadarTransferState({ currentVersionNumber: analysis?.versionNumber || 0, analysisStatus: analysis?.payload.status || null, transfer: analysis?.payload.plannerTransfer || null, fallbackSentVersionNumber: row?.state === "sent_planner" ? latestApprovedAnalysis?.versionNumber || null : null });
  const updateAvailable = transfer.state === "update_available";

  const selectedArticleId = row?.articleId || "";
  const selectedArticleDnaVersionId = row?.articleDnaVersionId || "";
  const remoteExpertEvidenceSelectionKey = JSON.stringify([selectedBrandId || "", selectedArticleId, selectedArticleDnaVersionId]);
  const remoteExpertEvidenceReady = remoteExpertEvidence.selectionKey === remoteExpertEvidenceSelectionKey && remoteExpertEvidence.reviewRevision === remoteExpertEvidenceReviewRevision && remoteExpertEvidence.loaded;
  const expertEvidenceNeedsReapproval = Boolean(evidenceApproved && remoteExpertEvidenceReady && !remoteExpertEvidence.error && radarExpertEvidenceFingerprint(remoteExpertEvidence.evidence) !== radarExpertEvidenceFingerprint(approvedExpertEvidence(analysis)));
  const reportApprovedForCurrentEvidence = Boolean(evidenceApproved && !expertEvidenceNeedsReapproval);
  useEffect(() => {
    if (!selectedBrandId || !selectedArticleId || !selectedArticleDnaVersionId) {
      return;
    }
    let active = true;
    const controller = new AbortController();
    const selectionKey = JSON.stringify([selectedBrandId, selectedArticleId, selectedArticleDnaVersionId]);
    const params = new URLSearchParams({ brandId: selectedBrandId, articleId: selectedArticleId, articleDnaVersionId: selectedArticleDnaVersionId });
    void fetch(`/api/editorial/expert-briefs?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(stringValue(objectValue(payload)?.error) || "Não foi possível carregar as contribuições do especialista.");
        const briefCandidates: unknown[] = Array.isArray(payload.briefs) ? payload.briefs : [];
        const briefs = briefCandidates
          .map(parseExpertBriefEvidenceSource)
          .filter((brief): brief is RadarExpertBriefEvidenceSource => Boolean(brief && brief.brandId === selectedBrandId && brief.articleId === selectedArticleId && brief.articleDnaVersionId === selectedArticleDnaVersionId));
        const briefIds = new Set(briefs.map(brief => brief.id));
        const contributionCandidates: unknown[] = Array.isArray(payload.contributions) ? payload.contributions : [];
        const contributions = contributionCandidates
          .map(parseExpertContributionEvidenceSource)
          .filter((contribution): contribution is RadarExpertContributionEvidenceSource => Boolean(contribution && contribution.brandId === selectedBrandId && briefIds.has(contribution.briefId)));
        const evidence: RadarExpertEvidence[] = [];
        let pendingCount = 0;
        let blockedCount = 0;
        for (const contribution of contributions) {
          const brief = briefs.find(item => item.id === contribution.briefId && item.expertId === contribution.expertId);
          if (!brief) {
            blockedCount += 1;
            continue;
          }
          let reviews: ReturnType<typeof parseRadarExpertEvidenceReviews> = {};
          try {
            const key = `radar:expert-evidence-review:${encodeURIComponent(selectedBrandId)}:${encodeURIComponent(selectedArticleId)}:${encodeURIComponent(selectedArticleDnaVersionId)}:${encodeURIComponent(brief.id)}`;
            const raw = window.localStorage.getItem(key);
            reviews = parseRadarExpertEvidenceReviews(raw ? JSON.parse(raw) : null);
          } catch {
            reviews = {};
          }
          const projection = projectRadarExpertEvidence({ brandId: selectedBrandId, articleId: selectedArticleId, articleDnaVersionId: selectedArticleDnaVersionId, brief, contribution, review: reviews[contribution.id] });
          if (projection.evidence) evidence.push(projection.evidence);
          else if (projection.reason === "pending_review") pendingCount += 1;
          else blockedCount += 1;
        }
        if (active) setRemoteExpertEvidence({ selectionKey, reviewRevision: remoteExpertEvidenceReviewRevision, loaded: true, error: null, briefCount: briefs.length, contributionCount: contributions.length, pendingCount, blockedCount, evidence });
      })
      .catch(loadError => {
        if (active && (loadError as Error)?.name !== "AbortError") setRemoteExpertEvidence({ ...emptyRemoteExpertEvidence, selectionKey, reviewRevision: remoteExpertEvidenceReviewRevision, loaded: true, error: loadError instanceof Error ? loadError.message : "Não foi possível carregar as contribuições do especialista.", pendingCount: 1 });
      });
    return () => { active = false; controller.abort(); };
  }, [remoteExpertEvidenceReviewRevision, selectedArticleDnaVersionId, selectedArticleId, selectedBrandId]);

  useEffect(() => {
    if (!row || routeKey === canonicalRoute) return;
    if (radarHref) router.replace(`${radarHref}${routeQuery ? `?${routeQuery}` : ""}`, { scroll: false });
  }, [canonicalRoute, radarHref, routeKey, routeQuery, row, router]);

  if (!row || !article || !identity) return <main className="p-6 text-sm text-slate-400">Artigo não encontrado ou alias ambíguo no Radar. {radarOverviewHref ? <button className={button} onClick={() => router.push(radarOverviewHref)}>Voltar ao Radar</button> : <button className={button} disabled title="Contexto da marca não disponível">Voltar ao Radar</button>}</main>;

  const identityConfirmed = Boolean(activeBrand?.nome || selectedBrandId) && Boolean(identity.principalKeyword) && Boolean(identity.articleDna) && Boolean(identity.siloDna) && Boolean(identity.publication.label);
  const setTab = (next: Tab) => { if (radarHref) router.replace(`${radarHref}?tab=${next}`, { scroll: false }); };
  const architectHref = buildRadarArchitectHref({ brandRef, articleId });
  const goArchitect = () => { if (architectHref) router.push(architectHref); };
  const save = async (next: RadarAnalysisVersion) => pipeline.saveRadarAnalysis(articleId, next);
  const startAnalysis = async () => {
    if (analysis) { setNotice("A camada de evidências já foi iniciada; nenhuma nova versão foi criada."); return; }
    if (busy || !selectedBrandId || !research || !analysisReady) { if (!analysisReady) setNotice("A visualização está disponível, mas este snapshot ainda não possui payload canônico completo para registrar a investigação."); return; }
    setBusy("start"); setNotice("");
    try {
      const next = await createRadarAnalysisVersion({ brandId: selectedBrandId, article, research, mode, modeRecommendation: recommendation, actorId: actorId(session), humanReason, ownDomainHost: hostOf(activeBrand?.site_url || article.payload.canonical) });
      const saved = await save(next);
      setNotice(saved.persistenceMode === "remote" && saved.readbackConfirmed ? "Investigação continuada usando o snapshot existente. Nenhuma nova SERP foi coletada; write remoto e readback confirmados." : "A investigação foi aplicada na recuperação local; a persistência remota não foi confirmada.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível continuar a investigação."); } finally { setBusy(""); }
  };
  const collectCurrentSerp = async () => {
    if (busy || !selectedBrandId || !identity.principalKeyword) {
      if (!identity.principalKeyword) setNotice("A keyword principal não está hidratada para esta coleta.");
      return;
    }
    setBusy("collect-serp"); setNotice("");
    try {
      const record = await pipeline.collectSerp(articleId, pipeline.snapshot?.brand.localizacao || "Brasil", row.articleDnaVersionId);
      setNotice(`SERP real v${record.research?.version || 1} coletada: ${record.research?.organicResults.length || 0} resultado(s).`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a SERP real.");
    } finally {
      setBusy("");
    }
  };
  const patchAnalysis = async (patch: Partial<RadarAnalysisVersion["payload"]>, message: string) => {
    if (!analysis) { setNotice("Continue a investigação para registrar curadoria; a identidade e o snapshot permanecem preservados."); return; }
    setBusy("save");
    try {
      const nextVersionId = crypto.randomUUID();
      const candidatePayload = { ...analysis.payload, ...patch } as RadarAnalysisVersion["payload"];
      const report = research ? await buildRadarCompetitiveReport({ payload: candidatePayload, article: article.payload, research, radarItemId: row.id, analysisVersionId: nextVersionId, analysisVersionNumber: analysis.versionNumber + 1, generatedBy: actorId(session), siloDnaVersionId: silo?.versionId || null, status: "draft" }) : null;
      const next = await createRadarAnalysisSuccessor(analysis, { ...patch, ...(report ? { competitiveReport: report } : {}) }, actorId(session), undefined, nextVersionId);
      const saved = await save(next);
      setNotice(saved.persistenceMode === "remote" && saved.readbackConfirmed ? `${message} Persistência remota e readback confirmados.` : `${message} A recuperação local foi atualizada, mas a persistência remota não foi confirmada.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar a curadoria."); } finally { setBusy(""); }
  };

  const pendingRows: Decision[] = serpView ? [
    ...serpView.organicResults.map(result => ({ key: `organic:${result.position}`, itemType: "organic" as const, decision: "pending" as const, reason: "", note: "", ownDomain: hostOf(result.url) === hostOf(activeBrand?.site_url || article.payload.canonical) })),
    ...serpView.peopleAlsoAsk.map(result => ({ key: `paa:${result.position}`, itemType: "people_also_ask" as const, decision: "pending" as const, reason: "", note: "", ownDomain: false })),
    ...serpView.relatedSearches.map((_, index) => ({ key: `related:${index + 1}`, itemType: "related_search" as const, decision: "pending" as const, reason: "", note: "", ownDomain: false })),
    ...(serpView.knowledgeGraph ? [{ key: "knowledge_graph:1", itemType: "knowledge_graph" as const, decision: "pending" as const, reason: "", note: "", ownDomain: false }] : []),
  ] : [];
  const decisionRows = analysis?.payload.serpDecisions || pendingRows;
  const patchDecision = (key: string, patch: Partial<Decision>, message = "Curadoria consolidada em uma nova versão de evidências.") => void patchAnalysis({ serpDecisions: decisionRows.map(item => item.key === key ? { ...item, ...patch } : item) }, message);
  const draftFor = (key: string, decision: Decision): DraftText => decisionDrafts[key] || { reason: decision.reason, note: decision.note };
  const saveDecisionDraft = (key: string, decision: Decision) => { const draft = draftFor(key, decision); if (draft.reason === decision.reason && draft.note === decision.note) return; patchDecision(key, draft, "Anotação da curadoria consolidada."); };
  const updateDecisionDraft = (key: string, field: keyof DraftText, value: string) => setDecisionDrafts(current => ({ ...current, [key]: { ...draftFor(key, decisionRows.find(item => item.key === key) || pendingRows[0]), [field]: value } }));


  const renderSnapshotHeader = (view: RadarSerpView) => <div className={card}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xs font-semibold text-white">Análise da SERP v{view.version}</h2><p className="mt-1 text-[10px] text-slate-400">{view.query} · {view.provider} · {view.origin} · {view.source}</p></div><span className="rounded border border-slate-700 px-2 py-1 text-[10px]">{view.persistenceMode === "remote" ? "Persistência remota" : "Persistência local/fallback"}</span></div><dl className="mt-3 grid gap-2 text-[10px] md:grid-cols-5"><Field label="Coleta" value={view.capturedAt}/><Field label="Resultados" value={view.organicResults.length}/><Field label="PAA" value={view.peopleAlsoAsk.length}/><Field label="Relacionadas" value={view.relatedSearches.length}/><Field label="Hash" value={view.hash ? `${view.hash.slice(0, 12)}…` : "não disponível no legado"}/></dl>{view.partial && <p className="mt-2 text-[10px] text-amber-300">Esta análise está parcialmente disponível. O payload legado foi mantido para não perder resultados observados.</p>}{conflicts.map(conflict => <p className="mt-2 text-[10px] text-orange-200" key={`${conflict.snapshotId}:${conflict.remoteHash}`}>Proteção de integridade: a versão com conflito não foi escolhida silenciosamente. {conflict.reason}</p>)}</div>;

  const renderIdentity = () => <section className="space-y-3"><div className={card}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-wider text-teal-400">Identidade editorial</p><h2 className="mt-1 text-base font-semibold text-white">{identity.title}</h2><p className="mt-1 text-[10px] text-slate-400">Recebida do Arquiteto · {identity.publication.label}</p></div><span className={`rounded border px-2 py-1 text-[10px] ${identity.publication.published ? "border-emerald-800 text-emerald-200" : "border-slate-700 text-slate-300"}`}>{identity.publication.published ? "🔒 Publicado e protegido" : "Artigo novo · identidade definida no Arquiteto"}</span></div><dl className="mt-4 grid gap-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4"><Field label="Marca" value={identity.brandName}/><Field label="Keyword principal" tone="keyword" value={identity.principalKeyword || "Referência ainda não hidratada"}/><Field label="Função no silo" value={identity.hierarchy}/><Field label="Definição do artigo" value={`ID · v${identity.articleDna.versionNumber}`}/><Field label="Silo" value={identity.siloName}/><Field label="Arquitetura do silo" value={identity.siloDna ? `ID · v${identity.siloDna.versionNumber}` : "Ainda não hidratado"}/><Field label="Página do silo" value={identity.siloPage ? `${identity.siloPage.payload.h1} · v${identity.siloPage.versionNumber}` : "Não relacionada"}/><Field label="Evidências Radar" value={analysis ? `${publicationStatusLabel(analysis.payload.status)} v${analysis.versionNumber}` : "Ainda não iniciadas"}/></dl><details className="mt-4 rounded border border-slate-800 p-2 text-[10px]"><summary className="cursor-pointer text-slate-400">Ver proveniência e IDs</summary><dl className="mt-2 grid gap-2 text-[9px] text-slate-500 sm:grid-cols-2"><Field label="RadarItem" value={row.id}/><Field label="ID da definição do artigo" value={article.entityId}/><Field label="Hash da definição do artigo" value={article.contentHash}/><Field label="ID da arquitetura do silo" value={silo?.entityId}/><Field label="Keyword principal de origem" value={article.payload.principalKeywordId}/><Field label="Última transferência" value={plannerItem?.importedAt || (row.state === "sent_planner" ? row.updatedAt : null)}/><Field label="Origem" value="Arquiteto"/><Field label="Estado do workflow" value={row.state}/></dl></details></div>{renderProtection()}</section>;

  const renderProtection = () => <section className={`${card} ${identity.publication.published ? "border-emerald-900/60" : "border-slate-800"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xs font-semibold text-white">Identidade protegida</h2><p className="mt-1 text-[10px] text-slate-400">{identity.publication.published ? "Este conteúdo já está publicado. O Radar pode recomendar atualizações de conteúdo, mas não altera a URL." : "O Radar consulta a formação recebida, mas não edita a identidade criada pelo Arquiteto."}</p></div><button className={button} onClick={goArchitect}>{identity.publication.published ? "Ver identidade no Arquiteto" : "Revisar no Arquiteto"}</button></div><dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><ProtectedField label="Keyword principal" value={identity.principalKeyword} reason={identity.publication.published ? "Conteúdo publicado preserva esta keyword." : "Alterações pertencem ao fluxo do Arquiteto."}/><ProtectedField label="Slug" value={`/${identity.slug}`} reason={identity.publication.published ? "Conteúdo publicado preserva este endereço." : "O slug é definido na formação do artigo."}/><ProtectedField label="Canonical" value={identity.canonical} reason={identity.publication.published ? "A URL canônica publicada permanece preservada." : "A definição pertence ao Arquiteto."}/><ProtectedField label="Marca" value={identity.brandName} reason="A marca deste artigo não é trocada no Radar."/><ProtectedField label="URL estrutural" value={identity.publication.destinationUrl} reason={identity.publication.destinationUrl ? "Link publicado somente para abertura." : "A URL final ainda não foi confirmada em Publicações."}/></dl>{identity.publication.destinationUrl ? <a className="mt-3 inline-flex text-[10px] text-teal-300 underline" href={identity.publication.destinationUrl} target="_blank" rel="noreferrer">Abrir artigo publicado ↗</a> : <p className="mt-3 text-[10px] text-slate-500">Slug recebido do Arquiteto. A URL final ainda não foi confirmada em Publicações.</p>}{identity.publication.updateAvailable && <p className="mt-2 text-[10px] text-amber-200">Atualização de conteúdo disponível; a identidade publicada continua protegida.</p>}</section>;





  const renderKgrStrategy = () => !kgrStrategy ? <section className={flowSection}><h2 className="text-xl font-semibold text-white">Contexto KGR não recebido</h2><p className="mt-2 text-base leading-6 text-amber-100">O Radar não inventa KGR. O modo sugerido será confirmado com o contexto editorial disponível e pode ser alterado por decisão humana.</p></section> : <section className={flowSection}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Contexto recebido do Arquiteto</h2><p className="mt-2 text-base leading-6 text-slate-300">O Radar interpreta a estratégia sem reagrupar keywords, trocar a principal ou alterar o silo.</p></div><span className="rounded border border-teal-800/70 px-3 py-2 text-sm text-teal-200">{radarKgrClassificationLabel(kgrStrategy.classification, kgrStrategy.source)}</span></div><dl className="mt-4 grid gap-3 text-base sm:grid-cols-2 lg:grid-cols-4"><Field label="Keyword principal" tone="keyword" value={kgrStrategy.principalKeyword}/><Field label="KGR" value={kgrStrategy.kgrScore ?? "Não recebido"}/><Field label="Volume" value={kgrStrategy.principalVolume ?? "Não recebido"}/><Field label="Slug" value={`/${kgrStrategy.slug}`}/><Field label="Função no silo" value={kgrStrategy.hierarchy.role === "pillar" ? "Pilar" : "Suporte"}/><Field label="Composição" value={`${kgrStrategy.keywordComposition.totalCount} keyword(s) recebida(s)`}/><Field label="Alinhamento" value={radarSlugAlignmentLabel(kgrStrategy.slugAlignment)}/><Field label="Origem" value={kgrStrategy.source === "keyword_dna" ? "Perfil da keyword" : kgrStrategy.source === "minerador" ? "Minerador" : "Não recebida"}/></dl></section>;
  const renderComparison = () => <section className={card}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xs font-semibold text-white">Estratégia recebida x busca observada</h2><p className="mt-1 text-[10px] text-slate-500">Comparação de evidências. Um termo ausente no snippet não prova ausência no conteúdo da página.</p></div>{comparison && <StatusBadge status={comparison.overall}/>}</div>{comparison ? <div className="mt-3 grid gap-3 lg:grid-cols-3"><div className="rounded border border-slate-800 p-2 text-[10px]"><div className="flex justify-between gap-2"><strong>Intenção</strong><StatusBadge status={comparison.intent.status}/></div><p className="mt-2 text-slate-400">Esperada: {comparison.intent.expected}</p><p className="text-slate-400">Observada: {comparison.intent.observed}</p></div><div className="rounded border border-slate-800 p-2 text-[10px]"><div className="flex justify-between gap-2"><strong>Tópicos e entidades</strong><StatusBadge status={comparison.topics.status}/></div><p className="mt-2 text-slate-500">Esperados: {comparison.topics.expected.join(" · ") || "não informados"}</p><p className="text-slate-400">Observados: {comparison.topics.observed.join(" · ") || "não identificados nos snippets"}</p>{comparison.topics.missing.length > 0 && <p className="mt-2 text-amber-200">Não identificado nos snippets: {comparison.topics.missing.join(" · ")}. A confirmação depende da análise das páginas.</p>}</div><div className="rounded border border-slate-800 p-2 text-[10px]"><strong>Domínio próprio e função</strong><p className="mt-2 text-slate-400">Domínio próprio: {serpView?.organicResults.some(result => hostOf(result.url) === hostOf(activeBrand?.site_url || article.payload.canonical)) ? "presente na amostra" : "não identificado na amostra"}</p><p className="mt-1 text-slate-500">{identity.hierarchy} é função no silo; não é comparada diretamente com formato SERP.</p><p className="mt-1 text-slate-500">Formatos observados: {serpView?.diagnostic?.dominantFormats.join(" · ") || "não observados"}</p></div></div> : <p className="mt-3 text-[10px] text-slate-500">A SERP ainda não oferece evidência suficiente para comparação.</p>}</section>;

  const resultDecision = (key: string) => decisionRows.find(item => item.key === key) || pendingRows.find(item => item.key === key);
  const isOwnResult = (result: SerpOrganicResult, decision?: Decision) => Boolean(decision?.ownDomain || hostOf(result.url) === hostOf(activeBrand?.site_url || article.payload.canonical));
  const extractionPages = analysis?.payload.extractions || [];
  const extractionFormats = summarizeRadarExtractionFormats(extractionPages);
  const organicResults = research?.organicResults || serpView?.organicResults || [];
  const extractionForResult = (result: SerpOrganicResult) => extractionPages.find(page => page.url === result.url);
  const resultRole = (result: SerpOrganicResult): RadarReferenceRole => {
    const decision = resultDecision(`organic:${result.position}`);
    return deriveRadarReferenceRole({ decision: decision?.decision || "pending", reason: decision?.reason, ownDomain: isOwnResult(result, decision), formatReference: isFormatReference(result) });
  };
  const expertContext = row && article && identity ? (() => {
    try {
      const approvedReferences = organicResults.filter(result => ["primary", "support"].includes(resultRole(result))).map(result => ({ position: result.position, title: result.title || "Resultado sem título", url: result.url, role: resultRole(result) as "primary" | "support" }));
      return buildExpertTopicContext(articleId, {
        brandId: row.brandId,
        article,
        articleDnaVersionId: row.articleDnaVersionId,
        keywordDnas: article.payload.keywordReferences.map(reference => ({ keywordId: reference.keywordId, keywordDnaVersionId: reference.keywordDnaVersionId, keyword: reference.keywordId === article.payload.principalKeywordId ? identity.principalKeyword : null, role: reference.role })),
        siloDna: silo,
        serp: {
          reviewed: legacyReview?.status === "approved",
          snapshotId: serp?.id || null,
          snapshotVersion: serp?.research?.version || null,
          analysisVersionId: analysis?.versionId || null,
          needs: analysis?.payload.competitiveReport?.needs.flatMap(need => [need.title, ...need.topics]) || serpView?.diagnostic?.opportunities || [],
          openGaps: [...(comparison?.topics.missing || []), ...(analysis?.payload.competitiveReport?.profile.limitations || []), ...(serpView?.diagnostic?.possibleConflicts || [])],
          conflicts: serpView?.diagnostic?.possibleConflicts || [],
          knownQuestions: [...(serpView?.peopleAlsoAsk || []).map(question => question.question), ...(serpView?.relatedSearches || []).map(search => search.term)],
          approvedReferences,
        },
        amazon: { state: "AMAZON_NOT_APPLICABLE", criteria: [], evidence: [] },
        existingContent: [],
      });
    } catch {
      return null;
    }
  })() : null;
  const referenceCounts = organicResults.reduce<Record<RadarReferenceRole, number>>((counts, result) => {
    const role = resultRole(result);
    counts[role] += 1;
    return counts;
  }, { primary: 0, support: 0, format: 0, own: 0, excluded: 0, pending: 0 });
  const analysisQueue = organicResults.filter(result => ["primary", "support"].includes(resultRole(result)) && !extractionForResult(result));
  const alreadyAnalyzedComparableCount = organicResults.filter(result => ["primary", "support"].includes(resultRole(result)) && Boolean(extractionForResult(result))).length;
  const failedExtractionCount = extractionPages.filter(page => !["success", "partial"].includes(page.status)).length;
  const externalIncludedOrganicCount = referenceCounts.primary;
  const supportReferenceCount = referenceCounts.support;
  const formatReferenceCount = referenceCounts.format;
  const ownReferenceCount = referenceCounts.own;
  const excludedReferenceCount = referenceCounts.excluded;
  const pendingComparableCount = organicResults.filter(result => resultRole(result) === "pending" && !isOwnResult(result, resultDecision(`organic:${result.position}`)) && !isFormatReference(result)).length;
  const selectedMode = analysis?.payload.mode || mode;
  /*
   * O QUE A TELA MOSTRA É O QUE A AUTORIDADE DECIDE.
   *
   * Enquanto a lista exibida vinha de `analysisApprovalIssues` e a decisão de
   * `approve` somava outras checagens, a tela conseguia dizer "sem pendências"
   * sobre um artigo que o clique recusaria em seguida.
   */
  const approvalIssues = row && article ? radarReportApprovalIssues({
    identity: { brandId: row.brandId, articleId: row.articleId, articleDnaVersionId: row.articleDnaVersionId, radarItemId: row.id },
    analysis,
    article,
    research,
    serpReview: { status: serpReviewState.review?.status ?? null, currentness: serpReviewState.currentness },
    expertEvidence: {
      loaded: remoteExpertEvidence.loaded,
      contextMatches: remoteExpertEvidence.selectionKey === remoteExpertEvidenceSelectionKey,
      failed: Boolean(remoteExpertEvidence.error),
      pendingCount: remoteExpertEvidence.pendingCount,
      blockedCount: remoteExpertEvidence.blockedCount,
    },
    kgrStrategy,
  }) : [];
  const referencesSelected = Boolean(analysis && pendingComparableCount === 0);
  const pagesAnalyzed = Boolean(analysis && extractionPages.length > 0);
  const reportGenerated = Boolean(analysis?.payload.competitiveReport);
  const sentToPlanner = transfer.state === "sent";
  const nextAction = (() => {
    if (!identityConfirmed) return "Confira a identidade recebida do Arquiteto antes de continuar.";
    if (!serpView) return "A SERP ainda não foi coletada ou recuperada para este artigo.";
    if (!analysis) return "Defina o modo da investigação e continue usando o snapshot existente.";
    if (tab === "referencias") return pendingComparableCount ? `Classifique os ${pendingComparableCount} resultado(s) comparável(is) restantes.` : analysisQueue.length ? `Analise as ${analysisQueue.length} referência(s) principal(is) selecionada(s).` : "Todas as páginas comparáveis selecionadas já foram analisadas.";
    if (tab === "analise-serp") return analysisQueue.length ? "Analise as referências principais selecionadas." : !pagesAnalyzed ? "Selecione referências comparáveis para formar a amostra." : extractionFormats.comparable === 1 ? "A amostra tem uma página: revise os valores observados e suas limitações." : "Revise estrutura, formatos, semântica e lacunas observadas.";
    if (tab === "evidencias-adicionais") return !analysis ? "Aguardando análise SERP antes de relacionar necessidades adicionais." : "As evidências adicionais são opcionais; use-as para complementar necessidades observadas.";
    if (tab === "relatorio") return approvalIssues.length ? `Resolva os pontos antes da aprovação: ${approvalIssues.join(" ")}` : !reportGenerated ? "A prévia detalhada será gerada após a curadoria da amostra." : expertEvidenceNeedsReapproval ? "Nova contribuição recebida; revise e aprove novamente o relatório antes do Planejador." : !reportApprovedForCurrentEvidence ? "Revise o relatório e confirme as necessidades que serão enviadas ao Planejador." : updateAvailable ? "A versão atual aprovada precisa ser enviada ao Planejador." : "O relatório foi aprovado e aguarda o próximo uso no fluxo.";
    if (tab === "historico") return transfer.state === "update_available" ? `A versão v${transfer.sentVersionNumber} já foi enviada; a versão atual requer nova aprovação.` : transfer.state === "sent" ? `A versão v${transfer.sentVersionNumber} foi enviada ao Planejador.` : "O histórico mostra o que foi consolidado e o que ainda não foi enviado.";
    return pendingComparableCount ? `Classifique os ${pendingComparableCount} resultado(s) comparável(is) restantes.` : analysisQueue.length ? `Analise as ${analysisQueue.length} referência(s) principal(is) selecionada(s).` : !reportGenerated ? "Revise a amostra e gere a prévia do relatório." : expertEvidenceNeedsReapproval ? "Nova contribuição recebida; revise e aprove novamente o relatório." : !reportApprovedForCurrentEvidence ? "Revise o relatório e aprove as evidências." : updateAvailable ? "Envie a atualização de evidências ao Planejador." : "A investigação está aprovada.";
  })();
  const progress = buildRadarFlowProgress({ serpCollected: Boolean(serpView), referencesSelected, pagesAnalyzed, reportGenerated, reportApproved: reportApprovedForCurrentEvidence, sentToPlanner });
  const renderFlowProgress = () => {
    const renderSteps = (steps: typeof progress) => <ol className="mt-3 space-y-2" role="list">{steps.map(step => <li className="flex items-start gap-2 border-b border-divider pb-2 last:border-0 last:pb-0" key={step.label}><span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${step.done ? "border-success text-success" : step.current ? "border-context-accent text-context-accent" : "border-divider text-text-muted"}`} aria-hidden="true">{step.done ? "✓" : "·"}</span><span><strong className="block text-sm text-foreground">{step.label}</strong><span className="mt-0.5 block text-xs text-text-muted">{step.done ? "Concluída" : step.current ? "Etapa atual" : "Aguardando"}</span></span></li>)}</ol>;
    return <section className={`${flowSection} border-divider bg-surface`} aria-label="Progresso da investigação"><div className="grid gap-3 sm:grid-cols-3"><div><span className="block text-xs uppercase tracking-wide text-text-muted">Modo</span><strong className="text-base text-foreground">{selectedMode === "kgr_light" ? "KGR leve" : "Competitivo completo"}</strong></div><div><span className="block text-xs uppercase tracking-wide text-text-muted">Etapa atual</span><strong className="text-base text-foreground">{tabLabels[tab]}</strong></div><div><span className="block text-xs uppercase tracking-wide text-text-muted">Persistência</span><strong className="text-sm text-foreground">{pipeline.persistenceMode === "server" ? "Sincronização remota confirmada" : "Salvo neste navegador"}</strong>{pipeline.persistenceMode !== "server" && <span className="block text-xs text-warning">Sincronização remota ainda não confirmada</span>}</div></div><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-module-accent">Próxima ação</p><p className="mt-1 max-w-3xl text-base leading-6 text-foreground">{nextAction}</p></div>{reportApprovedForCurrentEvidence && (updateAvailable || transfer.state === "not_sent") && <button className={button} onClick={() => void sendCurrentEvidence()} disabled={busy === "send"}>{busy === "send" ? "Enviando…" : transfer.state === "not_sent" ? "Enviar ao Planejador" : "Enviar atualização"}</button>}</div><div className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2 lg:grid-cols-4"><span>SERP: {organicResults.length}</span><span>Referências principais: {externalIncludedOrganicCount}</span><span>Referências de apoio: {supportReferenceCount}</span><span>Referências de formato: {formatReferenceCount}</span><span>Seu artigo: {ownReferenceCount}</span><span>Excluídas: {excludedReferenceCount}</span><span>Pendentes: {pendingComparableCount}</span><span>Já analisadas: {alreadyAnalyzedComparableCount}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-3"><section className="rounded-md border border-divider bg-surface-subtle p-4"><h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Investigação SERP</h2><p className="mt-1 text-xs text-text-muted">Coleta, referências e análise.</p>{renderSteps(progress.slice(0, 3))}</section><section className="rounded-md border border-divider bg-surface-subtle p-4"><div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Evidências adicionais</h2><p className="mt-1 text-xs text-text-muted">Especialista e conteúdo existente.</p></div><span className="rounded-full border border-divider px-2 py-1 text-xs text-text-muted">Opcional</span></div><p className="mt-4 text-sm leading-6 text-foreground">{!analysis ? "Aguardando análise SERP" : "Não iniciadas · podem complementar necessidades observadas"}</p><button className={`${button} mt-4`} onClick={() => setTab("evidencias-adicionais")}>Trabalhar evidências</button></section><section className="rounded-md border border-divider bg-surface-subtle p-4"><h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Consolidação</h2><p className="mt-1 text-xs text-text-muted">Relatório, aprovação e Planejador.</p>{renderSteps(progress.slice(3))}</section></div></section>;
  };

  const renderModeSelector = () => <section className={`${flowSection} max-w-5xl`}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Modo da investigação</h2><p className="mt-2 max-w-3xl text-base leading-6 text-slate-300">O Radar usa o contexto recebido para sugerir uma profundidade. A escolha continua humana e nenhuma SERP nova é coletada ao abrir esta tela.</p></div><span className="rounded border border-teal-800/70 px-3 py-2 text-sm text-teal-200">Sugestão: {recommendation.suggestedMode === "kgr_light" ? "KGR leve" : "Competitivo completo"}</span></div><p className="mt-3 text-base leading-6 text-slate-300">{recommendation.reasons.join(" ")}</p>{!kgrStrategy?.kgrScore && !keywordSource?.kgr_score && <p className="mt-3 rounded border border-amber-800/60 bg-amber-950/20 p-3 text-base text-amber-100">KGR não recebido. A sugestão é baseada somente no contexto disponível; confirme o modo antes de continuar.</p>}<dl className="mt-4 grid gap-3 text-base sm:grid-cols-3"><Field label="KGR recebido" value={keywordSource?.kgr_score ?? "Não recebido"}/><Field label="Volume da principal" value={keywordSource?.volume_search ?? "Não recebido"}/><Field label="Origem" value={keywordSource ? "Perfil e análise da keyword" : "Contexto não localizado"}/></dl><div className="mt-5 grid gap-3 md:grid-cols-2"><button className={`${button} min-h-16 justify-start text-left ${mode === "kgr_light" ? "border-teal-500 bg-teal-950/20" : ""}`} onClick={() => { modeTouched.current = true; setMode("kgr_light"); }}><span><strong className="block text-base">KGR leve</strong><span className="mt-1 block text-sm text-slate-400">Amostra leve de 1–3 referências, sem exigir concorrentes diretos.</span></span></button><button className={`${button} min-h-16 justify-start text-left ${mode === "competitive_full" ? "border-teal-500 bg-teal-950/20" : ""}`} onClick={() => { modeTouched.current = true; setMode("competitive_full"); }}><span><strong className="block text-base">Competitivo completo</strong><span className="mt-1 block text-sm text-slate-400">Seleção de concorrentes diretos e amostra de 3–5 páginas comparáveis.</span></span></button></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm text-slate-300">Motivo da escolha (opcional)<input className="mt-1 min-h-11 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base text-white" value={humanReason} onChange={event => setHumanReason(event.target.value)} placeholder="Registre uma decisão diferente da sugestão"/></label><button className={button} disabled={busy === "start" || Boolean(analysis) || !analysisReady} onClick={() => void startAnalysis()}>{analysis ? "Investigação iniciada" : busy === "start" ? "Salvando…" : "Continuar investigação"}</button></div></section>;


  const sendCurrentEvidence = async () => {
    if (!analysis || !evidenceApproved || !selectedBrandId || busy) return;
    if (!remoteExpertEvidenceReady) { setNotice("Aguarde a leitura remota do ExpertBrief antes de enviar o relatório."); return; }
    if (remoteExpertEvidence.error) { setNotice("A contribuição do especialista não pôde ser lida; o handoff permanece bloqueado."); return; }
    if (remoteExpertEvidence.pendingCount || remoteExpertEvidence.blockedCount) { setNotice("Revise todas as contribuições remotas do especialista antes de enviar o relatório."); return; }
    if (expertEvidenceNeedsReapproval) { setNotice("Uma nova contribuição alterou as evidências; revise e aprove novamente o relatório antes do Planejador."); return; }
    if (row.state !== "approved" && row.state !== "sent_planner") { setNotice("A aprovação do item no workflow ainda precisa ser registrada no Radar antes do envio ao Planejador."); return; }
    setBusy("send");
    try {
      const result = pipeline.importApprovedToPlanner([row.id]);
      const transferReceipt = await createRadarAnalysisSuccessor(analysis, { status: "approved", plannerTransfer: { sourceAnalysisVersionId: analysis.versionId, sourceAnalysisVersionNumber: analysis.versionNumber, sentAt: new Date().toISOString(), sentBy: actorId(session) } }, actorId(session));
      await save(transferReceipt);
      setNotice(result.imported ? "Evidências enviadas ao Planejador sem duplicar o artigo." : "Atualização de evidências registrada para o Planejador; nenhum artigo ou plano editorial foi duplicado.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível registrar o envio ao Planejador."); } finally { setBusy(""); }
  };


  const renderExpertEvidenceReport = () => <section className={flowSection} aria-label="ExpertEvidence do relatório"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">ExpertEvidence</h2><p className="mt-2 text-base leading-6 text-slate-300">Contribuições remotas entram no relatório somente depois de conteúdo legível e decisão humana no Radar.</p></div><span className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-300">{remoteExpertEvidenceReady ? `${remoteExpertEvidence.evidence.length} evidência(s)` : "Leitura pendente"}</span></div>{!remoteExpertEvidenceReady ? <p className="mt-3 text-base text-slate-300">Aguardando readback remoto das contribuições deste artigo.</p> : remoteExpertEvidence.error ? <p className="mt-3 rounded border border-orange-800/60 bg-orange-950/20 p-3 text-base text-orange-100">A leitura remota falhou; nenhuma contribuição foi promovida ao relatório.</p> : remoteExpertEvidence.pendingCount || remoteExpertEvidence.blockedCount ? <p className="mt-3 rounded border border-amber-800/60 bg-amber-950/20 p-3 text-base text-amber-100">{remoteExpertEvidence.pendingCount ? `${remoteExpertEvidence.pendingCount} contribuição(ões) aguardam revisão.` : ""}{remoteExpertEvidence.pendingCount && remoteExpertEvidence.blockedCount ? " " : ""}{remoteExpertEvidence.blockedCount ? `${remoteExpertEvidence.blockedCount} contribuição(ões) não possuem conteúdo legível preservado.` : ""}</p> : remoteExpertEvidence.evidence.length ? <div className="mt-4 space-y-3">{remoteExpertEvidence.evidence.map(evidence => <article className="rounded border border-slate-800 bg-slate-950/30 p-3" key={evidence.id}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-base text-white">{evidence.evidenceType === "EDITORIAL_ORGANIZATION" ? "Organização editorial" : evidence.evidenceType === "TRANSCRIPTION" ? "Transcrição fiel" : "Texto original"}</strong><span className="text-sm text-emerald-200">{evidence.humanDecision === "rejected" ? "Rejeitada · preservada na proveniência" : "Aceita por decisão humana"}</span></div><p className="mt-2 whitespace-pre-wrap text-base leading-6 text-slate-300">{evidence.approvedContent}</p><p className="mt-2 text-sm text-slate-500">Origem remota preservada; a aprovação não altera o ArticleDNA.</p></article>)}</div> : <p className="mt-3 text-base text-slate-300">Nenhuma ExpertEvidence aprovada para esta versão do artigo.</p>}</section>;

  const renderOverview = () => <div className="space-y-5">{renderIdentity()}<section className={flowSection}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><span className="block text-sm text-slate-400">Modo escolhido</span><strong className="mt-1 block text-lg text-white">{selectedMode === "kgr_light" ? "KGR leve" : "Competitivo completo"}</strong></div><div><span className="block text-sm text-slate-400">SERP</span><strong className="mt-1 block text-lg text-white">{serpView ? "Disponível" : "Ainda não disponível"}</strong></div><div><span className="block text-sm text-slate-400">Referências externas</span><strong className="mt-1 block text-lg text-white">{externalIncludedOrganicCount}</strong></div><div><span className="block text-sm text-slate-400">Páginas analisadas</span><strong className="mt-1 block text-lg text-white">{extractionPages.length}</strong></div></div><p className="mt-4 text-base leading-6 text-slate-300">{identity.publication.published ? "Este artigo está publicado e protegido. O Radar registra evidências e propostas sem trocar a principal, o slug, a canonical ou a URL." : "Este artigo ainda não está publicado. A identidade recebida do Arquiteto continua preservada durante a investigação."}</p></section>{renderKgrStrategy()}{renderModeSelector()}{renderComparison()}</div>;


  const renderSample = () => { const centralTerms = [identity.principalKeyword, ...article.payload.requiredTopics, ...article.payload.coverage, ...(silo?.payload.includedTopics || [])].filter((term): term is string => Boolean(term)); const semanticPresentation = selectRadarSemanticPresentation(analysis?.payload.semanticTerms || [], centralTerms); return !analysis ? <section className={flowSection}><h2 className="text-xl font-semibold text-white">Amostra ainda não analisada</h2><p className="mt-2 text-base leading-6 text-slate-300">Selecione referências principais ou de apoio e use a ação coletiva para formar a amostra.</p></section> : <section className="space-y-5"><section className={flowSection}><h2 className="text-xl font-semibold text-white">Amostra analisada</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Páginas analisadas" value={extractionPages.length}/><Field label="Comparáveis no benchmark" value={extractionFormats.comparable}/><Field label="Referências de apoio" value={supportReferenceCount}/><Field label="Referências de formato" value={formatReferenceCount}/><Field label="Seu conteúdo" value={ownReferenceCount}/><Field label="Falhas ou bloqueios" value={failedExtractionCount}/></div>{extractionFormats.comparable === 1 ? <p className="mt-4 text-base leading-6 text-amber-100">Valor observado em uma página comparável. A amostra não permite calcular média, mediana ou tendência de mercado; use os valores como evidência individual.</p> : extractionFormats.comparable > 1 ? <p className="mt-4 text-base leading-6 text-slate-300">A amostra agrega {extractionFormats.comparable} páginas comparáveis. Média, mediana, mínimo, máximo e limitações aparecem por métrica.</p> : <p className="mt-4 text-base leading-6 text-amber-100">Ainda não há página editorial comparável no benchmark. Referências de apoio, formato e próprias continuam visíveis com sua função preservada.</p>}</section><section className={flowSection}><h2 className="text-xl font-semibold text-white">Estrutura observada</h2>{analysis.payload.benchmark ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(analysis.payload.benchmark.metrics).map(([key, metric]) => <div className="rounded border border-slate-800 p-4" key={`${key}:${metric.label}`}><strong className="text-base text-white">{metric.label}</strong>{metric.sampleSize === 1 ? <p className="mt-2 text-base text-slate-300">Valor observado: {metric.mean.toFixed(1)}</p> : <><p className="mt-2 text-base text-slate-300">Média: {metric.mean.toFixed(1)} · mediana: {metric.median.toFixed(1)}</p><p className="mt-1 text-sm text-slate-400">Mínimo: {metric.min.toFixed(0)} · máximo: {metric.max.toFixed(0)} · amostra: {metric.sampleSize}</p></>}<p className="mt-1 text-sm text-slate-400">{metric.sampleSize === 1 ? "Sem faixa de mercado; comparação limitada a esta página." : `Faixa típica: ${metric.typicalRange[0].toFixed(0)}–${metric.typicalRange[1].toFixed(0)}`}</p></div>)}</div> : <p className="mt-3 text-base text-slate-300">Nenhuma métrica estrutural foi consolidada.</p>}</section><section className={flowSection}><h2 className="text-xl font-semibold text-white">Páginas e elementos observados</h2>{extractionPages.length ? extractionPages.map((page, index) => <article className="mt-3 rounded border border-slate-800 p-4" key={`${page.id}:${index}`}><div className="flex flex-wrap items-start justify-between gap-3"><strong className="text-base text-white">{page.title || page.url}</strong><span className="text-sm text-slate-300">{extractionFormatLabel(classifyRadarExtractionFormat(page))} · {page.status === "success" ? "Extração completa" : page.status === "partial" ? "Extração parcial" : "Não concluída"}</span></div><a className="mt-2 block break-all text-sm text-teal-300 underline" href={page.url} target="_blank" rel="noreferrer">{page.url}</a><div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4"><span>{page.wordCount} palavras</span><span>H1: {page.h1.length} · H2: {page.h2.length} · H3: {page.h3.length}</span><span>Listas: {page.listCount} · tabelas: {page.tableCount} · FAQ: {page.faqCount}</span><span>Links internos: {page.internalLinkCount} · externos: {page.externalLinkCount}</span><span>Imagens: {page.imageCount} · citações: {page.blockquoteCount}</span><span>Comparações: {page.comparisonCount} · dados estruturados: {page.structuredDataTypes.join(", ") || "não observados"}</span></div>{page.error && <p className="mt-3 text-sm text-orange-200">Limitação da extração: {page.error}</p>}</article>) : <p className="mt-3 text-base text-slate-300">Nenhuma página foi analisada ainda.</p>}</section>{renderComparison()}<section className={flowSection}><h2 className="text-xl font-semibold text-white">Semântica e entidades</h2><p className="mt-2 text-base leading-6 text-slate-300">Termos centrais, relevantes, entidades, tópicos, variações e ruído são mostrados como observação. Frequência não é meta de densidade.</p><div className="mt-4"><h3 className="text-base font-semibold text-white">Termos centrais</h3><div className="mt-2 flex flex-wrap gap-2">{centralTerms.length ? centralTerms.map((term, index) => <span className="rounded border border-teal-800/70 px-3 py-2 text-sm text-teal-100" key={`${term}:${index}`}>{term}</span>) : <span className="text-base text-slate-400">Nenhum termo central foi recebido.</span>}</div></div><div className="mt-5"><h3 className="text-base font-semibold text-white">Termos relevantes observados</h3>{semanticPresentation.relevant.length ? <div className="mt-2 grid gap-3 md:grid-cols-2">{semanticPresentation.relevant.map((term, index) => <article className="rounded border border-slate-800 p-4" key={`${term.term}:${term.pageIds.join("|")}:${index}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-base text-white">{term.term}</strong><span className="text-sm text-slate-400">{radarSemanticDecisionLabel(term.decision)}</span></div><p className="mt-2 text-sm text-slate-300">{term.frequency} ocorrência(s) · {term.pageCount} página(s) · fontes: {term.sources.join(", ")}</p></article>)}</div> : <p className="mt-2 text-base text-slate-400">Nenhum termo relevante confirmado.</p>}</div><details className="mt-5 rounded border border-slate-800 p-4"><summary className="cursor-pointer text-base font-semibold text-white">Ruído ou termos fora da amostra ({semanticPresentation.ignored.length})</summary>{semanticPresentation.ignored.length > 0 && <div className="mt-3 space-y-2">{semanticPresentation.ignored.map((term, index) => <div className="rounded border border-slate-800 p-3 text-sm text-slate-300" key={`${term.term}:${term.pageIds.join("|")}:${index}`}>{term.term} · {term.frequency} ocorrência(s) · {semanticGroupLabel(classifyRadarSemanticTerm(term))}</div>)}</div>}</details><div className="mt-5"><h3 className="text-base font-semibold text-white">Entidades da SERP</h3><div className="mt-2 flex flex-wrap gap-2">{serpView?.diagnostic?.frequentEntities.length ? serpView.diagnostic.frequentEntities.map((entity, index) => <span className="rounded border border-slate-800 px-3 py-2 text-sm" key={`${entity}:${index}`}>{entity}</span>) : <span className="text-base text-slate-400">Nenhuma entidade recorrente disponível.</span>}</div></div></section></section>; };

  const renderReport = () => <section className="space-y-5"><section className={flowSection}><h2 className="text-xl font-semibold text-white">Relatório de referências da SERP · {analysis?.payload.competitiveReport ? `Prévia v${analysis.versionNumber}` : "Aguardando análise"}</h2><p className="mt-2 text-base leading-6 text-slate-300">A consolidação organiza referências, análise SERP, necessidades e limitações para revisão humana antes do Planejador.</p></section>{analysis && <CompetitiveReportPanel mode={selectedMode} report={analysis.payload.competitiveReport} preview={{ answers: research?.peopleAlsoAsk.length || 0, related: research?.relatedSearches.length || 0, extracted: extractionPages.length, comparable: extractionFormats.comparable }}/>}<section className={flowSection}><h2 className="text-xl font-semibold text-white">Revisão e aprovação</h2>{approvalIssues.length > 0 ? <div className="mt-3 rounded border border-orange-800/60 bg-orange-950/20 p-4 text-base text-orange-100"><strong>O relatório ainda precisa de atenção</strong>{approvalIssues.map((issue, index) => <p className="mt-2" key={`${issue}:${index}`}>{issue}</p>)}</div> : <p className="mt-3 text-base text-slate-300">{expertEvidenceNeedsReapproval ? "Nova contribuição recebida; a aprovação anterior precisa de revisão humana." : evidenceApproved ? "Relatório aprovado por decisão humana." : reportGenerated ? "Revise a prévia detalhada e confirme as necessidades antes de aprovar." : "A prévia ainda será gerada após a curadoria da amostra."}</p>}<div className="mt-4 flex flex-wrap gap-3">{analysis && <button className={button} disabled={busy === "approve" || reportApprovedForCurrentEvidence || approvalIssues.length > 0 || !reportGenerated} onClick={() => void approve()}>{busy === "approve" ? "Aprovando…" : reportApprovedForCurrentEvidence ? "Relatório aprovado" : expertEvidenceNeedsReapproval ? "Reaprovar relatório com novas evidências" : `Aprovar relatório de referências v${analysis.versionNumber}`}</button>}{reportApprovedForCurrentEvidence && (updateAvailable || transfer.state === "not_sent") && <button className={button} disabled={busy === "send"} onClick={() => void sendCurrentEvidence()}>{busy === "send" ? "Enviando…" : transfer.state === "not_sent" ? "Enviar ao Planejador" : "Enviar atualização"}</button>}{conflicts.length > 0 && <button className={button} onClick={goArchitect}>Revisar identidade no Arquiteto</button>}</div></section></section>;





  const renderHistory = () => <section className={card}><h2 className="text-xs font-semibold text-white">Histórico de evidências</h2>{serpView && <div className="mt-2 rounded border border-slate-800 p-2 text-[10px]"><strong>SERP v{serpView.version} · {serpView.provider} · {serpView.organicResults.length} resultado(s)</strong><p className="mt-1 text-slate-500">{serpView.capturedAt} · hash {serpView.hash?.slice(0, 16) || "não disponível no legado"} · revisão {legacyReview?.status || "pendente"}</p></div>}{row.analysisVersions.slice().sort((a, b) => b.versionNumber - a.versionNumber).map(version => <div className="mt-2 rounded border border-slate-800 p-2 text-[10px]" key={version.versionId}><strong>Pacote de evidências · v{version.versionNumber} · {publicationStatusLabel(version.payload.status)}</strong><p className="mt-1 text-slate-500">{version.createdAt} · {version.origin} · {version.createdBy}</p></div>)}{analysis?.payload.extractions.map(page => <div className="mt-2 rounded border border-slate-800 p-2 text-[10px]" key={page.id}><strong>Extração · {page.status}</strong><p className="text-slate-500">{page.url} · {page.fetchedAt}</p></div>)}{analysis?.payload.plannerPackage && "packageType" in analysis.payload.plannerPackage && <div className="mt-2 rounded border border-teal-900/50 p-2 text-[10px]"><strong>Pacote de evidências do Radar · v{analysis.payload.plannerPackage.version}</strong><p className="text-slate-500">{analysis.payload.plannerPackage.serp.snapshotId} · hash {analysis.payload.plannerPackage.hash.slice(0, 16)} · enviado ao Planejador como evidência.</p></div>}{!serpView && !analysis && <p className="mt-2 text-[10px] text-amber-200">Análise da SERP não localizada na recuperação ou na persistência remota.</p>}</section>;

  const extractSelected = async () => {
    if (!analysis || !research || !analysisQueue.length || busy) return;
    const candidates = analysisQueue.map(result => ({ key: `organic:${result.position}`, url: result.url, itemType: "organic" as const, decision: "included" as const }));
    if (!candidates.length) return;
    setBusy("extract"); setNotice("");
    try {
      const response = await fetch("/api/editorial/radar-analysis/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, articleId, analysis, candidates }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível extrair os concorrentes.");
      const pages = (body.pages || []).map((item: { page: unknown }) => item.page).filter(Boolean) as Parameters<typeof buildRadarBenchmark>[1];
      const primaryUrls = new Set(analysisQueue.filter(result => resultRole(result) === "primary").map(result => result.url));
      const benchmark = buildRadarBenchmark(analysis.payload.mode, pages.filter(page => primaryUrls.has(page.url)));
      const semanticTerms = pages.flatMap(page => page.recurringTerms).slice(0, 50).map(term => ({ term: term.term, frequency: term.frequency, pageCount: term.pageCount, pageIds: term.pageIds, sources: term.sources.filter((source): source is "body" | "h1" | "h2" | "h3" | "title" => ["body", "h1", "h2", "h3", "title"].includes(source)), relation: "Termo recorrente observado nas páginas selecionadas.", decision: "pending" as const, note: "" }));
      const structuralDecisions = Object.entries(benchmark?.metrics || {}).map(([key, metric]) => ({ key, label: metric.label, observedCount: Math.round(metric.mean), sampleSize: metric.sampleSize, observedText: `Observado: média ${metric.mean.toFixed(1)}; faixa ${metric.typicalRange[0].toFixed(0)}–${metric.typicalRange[1].toFixed(0)}.`, level: "optional" as const, enforcement: "advisory" as const, humanNote: "" }));
      const competitorCount = pages.length;
      const competitiveness = { classification: competitorCount >= 5 ? "high" as const : competitorCount >= 3 ? "medium" as const : competitorCount ? "low" as const : "insufficient_evidence" as const, dimensions: { sample: Math.min(1, competitorCount / 5), structure: Math.min(1, (benchmark?.metrics.h2?.mean || 0) / 12), depth: Math.min(1, (benchmark?.metrics.words?.mean || 0) / 2500) }, reasons: [`${competitorCount} página(s) selecionada(s) foram extraídas.`, "A classificação é observacional e não define o plano editorial."], score: competitorCount ? Math.min(1, competitorCount / 5) : null };
      await patchAnalysis({ selectedCompetitorIds: [...new Set([...analysis.payload.selectedCompetitorIds, ...candidates.map(candidate => candidate.key)])], extractionIds: [...new Set([...analysis.payload.extractionIds, ...pages.map(page => page.id)])], extractions: [...analysis.payload.extractions.filter(page => !pages.some(nextPage => nextPage.url === page.url)), ...pages], benchmark, semanticTerms, structuralDecisions, competitiveness }, `${pages.length} página(s) extraída(s); ${body.errors?.length || 0} falha(s) isolada(s).`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha na extração."); } finally { setBusy(""); }
  };

  /**
   * Aprovação das evidências.
   *
   * A ordem importa e vive aqui: portão → relatório competitivo → pacote de
   * evidências → handoff do Planejador → sucessora → READBACK. Um POST que
   * não lançou exceção não é prova de que o remoto guardou o que foi enviado,
   * então quem encerra é o readback, não a ausência de erro.
   */
  const approve = async () => {
    if (!analysis || !research || !article || !selectedBrandId) return;
    setBusy("approve");
    try {
      // A DECISÃO NÃO MORA AQUI. Esta tela reúne o contexto canônico e chama a
      // autoridade única; o Workbench chama a mesma função com o mesmo
      // contrato. Duas telas, um só significado para "aprovar".
      const result = await approveRadarReport({
        identity: { brandId: row.brandId, articleId: row.articleId, articleDnaVersionId: row.articleDnaVersionId, radarItemId: row.id },
        analysis,
        article,
        research,
        serpReview: { status: serpReviewState.review?.status ?? null, currentness: serpReviewState.currentness },
        expertEvidence: {
          loaded: remoteExpertEvidence.loaded,
          contextMatches: remoteExpertEvidence.selectionKey === remoteExpertEvidenceSelectionKey,
          failed: Boolean(remoteExpertEvidence.error),
          pendingCount: remoteExpertEvidence.pendingCount,
          blockedCount: remoteExpertEvidence.blockedCount,
          approved: remoteExpertEvidence.evidence,
        },
        kgrStrategy,
        siloDnaVersionId: silo?.versionId || null,
        selectedBy: actorId(session),
        persist: successor => save(successor),
      });

      if (!result.ok) {
        setNotice(result.reason === "BLOCKED" ? result.issues.join(" ") : result.message);
        return;
      }
      if (result.outcome === "ALREADY_APPROVED") {
        setNotice("Este relatório já está aprovado nesta versão, com o mesmo snapshot e a mesma curadoria. Nenhuma sucessora foi criada.");
        return;
      }
      if (row.state === "awaiting_approval") pipeline.updateRadarState([row.id], "approved");
      setNotice("Evidências aprovadas. Write remoto e readback confirmados; a identidade permanece protegida e o Planejador decide se cria nova versão do plano.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível aprovar as evidências."); } finally { setBusy(""); }
  };

  const renderAdvancedSelection = () => {
    if (!serpView) return <section className={flowSection}><h2 className="text-xl font-semibold text-white">SERP ainda não disponível</h2><p className="mt-2 text-base leading-6 text-slate-300">Recupere ou colete um snapshot antes de selecionar referências.</p></section>;
    const search = referenceSearch.trim().toLocaleLowerCase("pt-BR");
    const filteredResults = serpView.organicResults.filter(result => {
      const role = resultRole(result);
      const haystack = [result.title, result.url, result.domain, result.snippet, result.manualType, result.inferredType].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return (referenceFilter === "all" || role === referenceFilter) && (!pendingReferencesOnly || role === "pending") && (!search || haystack.includes(search));
    });
    const assign = (key: string, role: "primary" | "support" | "format" | "excluded" | "pending") => {
      const decision: Decision["decision"] = role === "excluded" ? "excluded" : role === "pending" ? "pending" : "included";
      const reason = role === "primary" ? "Referência principal selecionada pelo usuário." : role === "support" ? "Referência de apoio selecionada pelo usuário." : role === "format" ? "Referência de formato selecionada pelo usuário." : role === "excluded" ? "Página não utilizada nesta investigação." : "";
      patchDecision(key, { decision, reason });
    };
    const roleLabel = (role: RadarReferenceRole) => role === "primary" ? "Referência principal" : role === "support" ? "Referência de apoio" : role === "format" ? "Referência de formato" : role === "own" ? "Seu artigo publicado" : role === "excluded" ? "Não utilizado" : "Aguardando decisão";
    return <section className="space-y-5">
      {renderSnapshotHeader(serpView)}
      <section className="rounded-lg border border-divider bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold text-foreground">Resultados da SERP</h2><p className="mt-2 max-w-3xl text-base leading-6 text-text-muted">Classifique cada página por função editorial. A seleção não dispara nova coleta nem extração automática.</p></div>
          <span className="text-base text-text-muted">{filteredResults.length} de {serpView.organicResults.length} resultado(s)</span>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_auto]">
          <label className="text-sm text-foreground">Buscar resultado<input className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" value={referenceSearch} onChange={event => setReferenceSearch(event.target.value)} placeholder="Título, domínio ou snippet"/></label>
          <label className="text-sm text-foreground">Filtrar por função<select className="mt-1 min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" value={referenceFilter} onChange={event => setReferenceFilter(event.target.value as "all" | RadarReferenceRole)}><option value="all">Todas</option><option value="pending">Pendentes</option><option value="primary">Principais</option><option value="support">Apoio</option><option value="format">Formato</option><option value="own">Próprio</option><option value="excluded">Excluídas</option></select></label>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-md border border-divider bg-surface-subtle px-3 py-2 text-sm text-foreground"><input type="checkbox" checked={pendingReferencesOnly} onChange={event => setPendingReferencesOnly(event.target.checked)}/>Somente pendentes</label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-text-muted"><span>{referenceCounts.primary} principais</span><span>· {referenceCounts.support} apoio</span><span>· {referenceCounts.format} formato</span><span>· {referenceCounts.pending} pendentes</span><span>· {referenceCounts.excluded} excluídas</span></div>
        <div className="mt-5 space-y-4">
          {filteredResults.length ? filteredResults.map((result, index) => {
            const key = "organic:" + result.position;
            const decision = resultDecision(key);
            const role = resultRole(result);
            const extraction = extractionForResult(result);
            const draft = decision ? draftFor(key, decision) : { reason: "", note: "" };
            return <article className="rounded-md border border-divider bg-surface-subtle p-4" key={serpView.record.id + ":" + key + ":" + index}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><strong className="text-base text-foreground">{result.position}. {result.title || "Resultado sem título"}</strong><span className="rounded-full border border-divider px-2 py-1 text-sm text-text-muted">{roleLabel(role)}</span>{extraction && <span className="rounded-full border border-success/60 px-2 py-1 text-sm text-success">Já analisada</span>}</div>
                  <a className="mt-2 block break-all text-sm text-context-accent underline" href={result.url} target="_blank" rel="noreferrer">{resultDomain(result)}</a>
                  <p className="mt-2 text-base leading-6 text-text-muted">{result.snippet || "Snippet não retornado."}</p>
                  <p className="mt-2 text-sm text-text-muted">Tipo: {result.manualType || result.inferredType || "não classificado"} · posição {result.position} · {role === "primary" ? "entra no benchmark editorial" : role === "support" ? "contextualiza a amostra" : role === "format" ? "registra presença de formato" : role === "own" ? "linha de base própria" : role === "excluded" ? "fora desta investigação" : "defina uma função"}</p>
                </div>
              </div>
              {analysis && decision && <div className="mt-4 flex flex-wrap gap-2">
                {role === "own" ? <><button className={button} onClick={() => assign(key, "primary")}>Usar como referência</button><button className={button} onClick={() => assign(key, "excluded")}>Não utilizar</button></> : role === "primary" ? <><button className={button} onClick={() => assign(key, "support")}>Usar como apoio</button><button className={button} onClick={() => assign(key, "pending")}>Restaurar decisão</button><button className={button} onClick={() => assign(key, "excluded")}>Não utilizar</button></> : role === "support" ? <><button className={button} onClick={() => assign(key, "primary")}>Usar como referência</button><button className={button} onClick={() => assign(key, "pending")}>Restaurar decisão</button><button className={button} onClick={() => assign(key, "excluded")}>Não utilizar</button></> : role === "format" ? <><button className={button} onClick={() => assign(key, "pending")}>Restaurar decisão</button><button className={button} onClick={() => assign(key, "excluded")}>Não utilizar</button></> : role === "excluded" ? <button className={button} onClick={() => assign(key, "pending")}>Restaurar para decisão</button> : <><button className={button} onClick={() => assign(key, isFormatReference(result) ? "format" : "primary")}>{isFormatReference(result) ? "Manter como formato" : "Usar como referência"}</button>{!isFormatReference(result) && <button className={button} onClick={() => assign(key, "support")}>Usar como apoio</button>}<button className={button} onClick={() => assign(key, "excluded")}>Não utilizar</button></>}
                {role !== "pending" && <label className="flex min-w-56 flex-1 items-center"><span className="sr-only">Motivo ou observação da decisão</span><input className="min-h-10 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" value={draft.reason} placeholder="Motivo ou observação (opcional)" onChange={event => updateDecisionDraft(key, "reason", event.target.value)} onBlur={() => saveDecisionDraft(key, decision)}/></label>}
              </div>}
            </article>;
          }) : <p className="rounded-md border border-divider bg-surface-subtle p-4 text-base text-text-muted">Nenhum resultado corresponde aos filtros atuais.</p>}
        </div>
      </section>
      <section className="rounded-lg border border-divider bg-surface p-5"><h2 className="text-xl font-semibold text-foreground">Outras referências da SERP</h2><p className="mt-2 text-base text-text-muted">Perguntas, pesquisas relacionadas e entidades contextualizam o relatório, mas não são páginas para extração.</p><div className="mt-4 grid gap-4 lg:grid-cols-3">{serpView.peopleAlsoAsk.length > 0 && <div><h3 className="text-base font-semibold text-foreground">Perguntas relacionadas</h3>{serpView.peopleAlsoAsk.map((item, index) => <div className="mt-2 rounded-md border border-divider bg-surface-subtle p-3 text-base" key={serpView.record.id + ":paa:" + item.position + ":" + index}><p className="text-foreground">{item.question}</p>{analysis && <button className={button + " mt-3"} onClick={() => patchDecision("paa:" + item.position, { decision: "included", reason: "Pergunta útil para o contexto do relatório." })}>Usar no relatório</button>}</div>)}</div>}{serpView.relatedSearches.length > 0 && <div><h3 className="text-base font-semibold text-foreground">Pesquisas relacionadas</h3><div className="mt-2 flex flex-wrap gap-2">{serpView.relatedSearches.map((item, index) => <span className="rounded-full border border-divider px-3 py-2 text-sm text-text-muted" key={serpView.record.id + ":related:" + item.term + ":" + index}>{item.term}</span>)}</div></div>}{serpView.knowledgeGraph && <div><h3 className="text-base font-semibold text-foreground">Entidade observada</h3><div className="mt-2 rounded-md border border-divider bg-surface-subtle p-3 text-base"><strong className="text-foreground">{serpView.knowledgeGraph.title || "Entidade sem título"}</strong><p className="mt-2 text-text-muted">{serpView.knowledgeGraph.description || "Sem descrição retornada."}</p></div></div>}</div></section>
      <section className="rounded-lg border border-context-accent/50 bg-surface p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-semibold text-foreground">Análise da amostra</h2><p className="mt-2 text-base text-text-muted">{analysisQueue.length ? analysisQueue.length + " página(s) comparável(is) nova(s) aguardam análise" : "Todas as páginas comparáveis selecionadas já foram analisadas."}</p></div><button className={button} disabled={!analysis || !analysisQueue.length || busy === "extract"} onClick={() => void extractSelected()}>{busy === "extract" ? "Analisando páginas…" : analysisQueue.length ? "Analisar páginas selecionadas (" + analysisQueue.length + ")" : "Análise da amostra atualizada"}</button></div>{!analysisQueue.length && analysis && <p className="mt-3 text-sm text-text-muted">Selecione uma nova referência principal ou de apoio para reativar a análise. Páginas já analisadas não serão reprocessadas.</p>}</section>
    </section>;
  };

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {radarOverviewHref ? <button className="text-base text-teal-300 underline" onClick={() => router.push(radarOverviewHref)}>← Voltar ao Radar</button> : <button className="text-base text-teal-300" disabled>← Voltar ao Radar</button>}
            <h1 className="mt-3 text-2xl font-semibold text-white">{identity.title}</h1>
            <p className="mt-2 text-base text-slate-300">{identity.publication.label} · Silo: {identity.siloName || "não hidratado"} · {selectedMode === "kgr_light" ? "KGR leve" : "Competitivo completo"} · etapa: {tabLabels[tab]}</p>
            <p className="mt-1 text-sm text-slate-400">Definição do artigo · v{article.versionNumber} · Evidências {analysis ? `v${analysis.versionNumber}` : "ainda não iniciadas"}</p>
          </div>
          <div className="text-right text-sm text-slate-300"><p>{identity.publication.published ? "Publicado e protegido" : "Artigo novo"}</p><p className="mt-1 text-slate-400">{pipeline.persistenceMode === "server" ? "Sincronização remota confirmada" : "Salvo neste navegador"}</p></div>
        </div>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Etapas do Radar">{tabs.map(item => <button key={item} className={`${button} ${tab === item ? "border-teal-500 bg-teal-950/20 text-teal-100" : ""}`} onClick={() => setTab(item)}>{tabLabels[item]}</button>)}</nav>
      </header>
      {notice && <div className="border-b border-amber-900/50 bg-amber-950/20 px-5 py-3 text-base text-amber-100" role="status">{notice}</div>}
      <div className="flex-1 overflow-auto p-5"><div className="mx-auto max-w-7xl space-y-5">
        {tab === "resumo" && renderFlowProgress()}
        {tab === "resumo" && renderOverview()}
        {tab === "serp" && <RadarSerpScreen view={serpView} records={pipeline.serpRecords.filter(record => record.input.articleId === articleId)} keyword={identity.principalKeyword} articleDnaVersionId={row.articleDnaVersionId} refreshing={busy === "collect-serp"} onRefresh={() => void collectCurrentSerp()} onOpenReferences={() => setTab("referencias")} />}
        {tab === "referencias" && renderAdvancedSelection()}
        {tab === "analise-serp" && <RadarAnalysisSignals needs={analysis?.payload.competitiveReport?.needs.map(need => `${need.title} · prioridade ${need.priority}`) || []} gaps={[...(comparison?.topics.missing || []), ...(analysis?.payload.competitiveReport?.profile.limitations || [])]} conflicts={[...(serpView?.diagnostic?.possibleConflicts || []), ...conflicts.map(conflict => conflict.reason)]} opportunities={serpView?.diagnostic?.opportunities || []} sources={[...extractionPages.map(page => page.url), ...(analysis?.payload.competitiveReport?.competitors.map(competitor => competitor.url) || [])]} />}
        {tab === "analise-serp" && renderSample()}
        {tab === "evidencias-adicionais" && <RadarExpertBriefPanel key={`${articleId}:${row.articleDnaVersionId}`} brandId={row.brandId} articleId={articleId} articleDnaVersionId={row.articleDnaVersionId} articleTitle={identity.title} articleVersion={`v${article.versionNumber}`} articleRole={identity.hierarchy} context={expertContext} onExpertEvidenceChange={refreshRemoteExpertEvidence} />}
        {tab === "relatorio" && renderReport()}
        {tab === "relatorio" && renderExpertEvidenceReport()}
        {tab === "historico" && <section className={flowSection}><h2 className="text-xl font-semibold text-white">Histórico</h2><p className="mt-2 text-base leading-6 text-slate-300">Versões, snapshots, extrações e transferências permanecem rastreáveis neste artigo.</p>{renderHistory()}</section>}
      </div></div>
    </main>
  );
}
