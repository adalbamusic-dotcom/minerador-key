import { analysisApprovalIssues, type RadarAnalysisVersion } from "./analysis-contracts.ts";
import { deriveRadarReferenceRole, type RadarReferenceRole } from "./flow-presentation.ts";
import type { RadarSerpView } from "./snapshot-view.ts";
import type { SerpOrganicResult } from "./serp/contracts.ts";

/**
 * The persisted decision contract predates the Workbench and uses the SERP
 * position as the organic result key. Keep that key for compatibility, but
 * bind every read to the current snapshot before projecting it into the UI.
 */
export function radarOrganicDecisionKey(result: Pick<SerpOrganicResult, "position">) {
  return `organic:${result.position}`;
}

/**
 * React identity is snapshot-bound and URL-aware. It is not persisted and is
 * intentionally different from the historical decision key above.
 */
export function radarOrganicRenderKey(snapshotId: string, result: Pick<SerpOrganicResult, "position" | "url">) {
  return `${snapshotId}:${radarOrganicDecisionKey(result)}:${result.url}`;
}

export function radarAnalysisMatchesSerp(input: {
  analysis: RadarAnalysisVersion | null | undefined;
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  view: RadarSerpView | null | undefined;
}) {
  const { analysis, brandId, articleId, articleDnaVersionId, view } = input;
  if (!analysis || !view || !view.record.research || !view.hash) return false;
  return analysis.payload.brandId === brandId
    && analysis.payload.articleId === articleId
    && analysis.payload.articleDnaVersionId === articleDnaVersionId
    && analysis.payload.serpSnapshotId === view.record.id
    && analysis.payload.serpSnapshotVersion === view.version
    && analysis.payload.serpSnapshotHash === view.hash;
}

function decisionMap(analysis: RadarAnalysisVersion | null | undefined) {
  return new Map((analysis?.payload.serpDecisions || []).map(decision => [decision.key, decision]));
}

function formatReference(result: SerpOrganicResult) {
  return /video|social|youtube|instagram|tiktok|facebook|formato|vídeo/i.test(`${result.manualType || result.inferredType || ""} ${result.url}`);
}

export function radarOrganicDecisionFor(analysis: RadarAnalysisVersion | null | undefined, result: SerpOrganicResult) {
  return decisionMap(analysis).get(radarOrganicDecisionKey(result));
}

export type RadarSerpSelectionScope = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
};

export type RadarOrganicSelectionProjection = {
  key: string;
  result: SerpOrganicResult;
  decision: RadarAnalysisVersion["payload"]["serpDecisions"][number] | null;
  role: RadarReferenceRole;
  selected: boolean;
};

/**
 * One organic result projection powers both the visible checkbox and every
 * selector that depends on the selection. The persisted decision key remains
 * position-based for compatibility; the React/render key stays snapshot and
 * URL aware through radarOrganicRenderKey.
 */
export function radarOrganicSelectionFor(analysis: RadarAnalysisVersion | null | undefined, result: SerpOrganicResult): RadarOrganicSelectionProjection {
  const decision = radarOrganicDecisionFor(analysis, result) || null;
  const role = deriveRadarReferenceRole({
    decision: decision?.decision || "pending",
    reason: decision?.reason,
    ownDomain: decision?.ownDomain,
    formatReference: formatReference(result),
  });
  return {
    key: radarOrganicDecisionKey(result),
    result,
    decision,
    role,
    selected: role === "primary" || role === "support",
  };
}

export type RadarSerpSelectionProjection = {
  compatible: boolean;
  snapshotId: string | null;
  rows: RadarOrganicSelectionProjection[];
  selectedRows: RadarOrganicSelectionProjection[];
  selectedKeys: string[];
};

/**
 * Canonical working-copy projection for the current article/snapshot. A
 * mismatched analysis deliberately produces an empty projection so stale
 * selections cannot enable actions for a different snapshot.
 */
function analysisMatchesSelectionScope(view: RadarSerpView, analysis: RadarAnalysisVersion, scope?: RadarSerpSelectionScope) {
  return analysisMatchesViewSnapshot(view, analysis)
    && (!scope || (analysis.payload.brandId === scope.brandId && analysis.payload.articleId === scope.articleId && analysis.payload.articleDnaVersionId === scope.articleDnaVersionId));
}

export function buildRadarSerpSelectionProjection(view: RadarSerpView | null | undefined, analysis: RadarAnalysisVersion | null | undefined, scope?: RadarSerpSelectionScope): RadarSerpSelectionProjection {
  const compatible = Boolean(view && analysis && analysisMatchesSelectionScope(view, analysis, scope));
  const rows = compatible ? view!.organicResults.map(result => radarOrganicSelectionFor(analysis, result)) : [];
  const selectedRows = rows.filter(row => row.selected);
  return {
    compatible,
    snapshotId: view?.record.id || null,
    rows,
    selectedRows,
    selectedKeys: selectedRows.map(row => row.key).sort(),
  };
}

export function radarOrganicIsSelectedCompetitor(analysis: RadarAnalysisVersion | null | undefined, result: SerpOrganicResult) {
  return radarOrganicSelectionFor(analysis, result).selected;
}

function analysisMatchesViewSnapshot(view: RadarSerpView, analysis: RadarAnalysisVersion) {
  return analysis.payload.serpSnapshotId === view.record.id
    && analysis.payload.serpSnapshotVersion === view.version
    && analysis.payload.serpSnapshotHash === view.hash;
}

function pendingOrganicDecisionCount(view: RadarSerpView | null | undefined, analysis: RadarAnalysisVersion | null | undefined, scope?: RadarSerpSelectionScope) {
  return buildRadarSerpSelectionProjection(view, analysis, scope).rows.filter(row => !row.decision || row.decision.decision === "pending").length;
}

export function selectedRadarOrganicResults(view: RadarSerpView | null | undefined, analysis: RadarAnalysisVersion | null | undefined, scope?: RadarSerpSelectionScope) {
  return buildRadarSerpSelectionProjection(view, analysis, scope).selectedRows.map(row => row.result);
}

export function selectedRadarOrganicDecisionKeys(view: RadarSerpView | null | undefined, analysis: RadarAnalysisVersion | null | undefined, scope?: RadarSerpSelectionScope) {
  return buildRadarSerpSelectionProjection(view, analysis, scope).selectedKeys;
}

export function radarSelectionFingerprint(view: RadarSerpView | null | undefined, analysis: RadarAnalysisVersion | null | undefined, scope?: RadarSerpSelectionScope) {
  return selectedRadarOrganicDecisionKeys(view, analysis, scope).join("|");
}

export function radarAnalysisCandidates(view: RadarSerpView | null | undefined, analysis: RadarAnalysisVersion | null | undefined, scope?: RadarSerpSelectionScope) {
  const projection = buildRadarSerpSelectionProjection(view, analysis, scope);
  if (!projection.compatible || !analysis) return [];
  const extractedUrls = new Set(analysis.payload.extractions.map(page => page.url));
  return projection.selectedRows
    .filter(row => !extractedUrls.has(row.result.url))
    .map(row => ({ key: row.key, url: row.result.url, itemType: "organic" as const, decision: "included" as const }));
}

export type RadarSerpCurationSummary = {
  selectedCompetitors: number;
  approvedReferences: number;
  /** Decisões pendentes DENTRO da análise. Só faz sentido com curadoria iniciada. */
  pendingDecisions: number;
  /** Existe análise compatível com este snapshot/artigo/versão? */
  curationStarted: boolean;
  /** Resultados orgânicos do snapshot, independentemente de haver análise. */
  observedResults: number;
  /** Resultados esperando a curadoria começar — zero depois que ela começa. */
  awaitingCuration: number;
  needs: number;
  gaps: number;
  conflicts: number;
};

export function buildRadarSerpCurationSummary(input: {
  view: RadarSerpView | null | undefined;
  analysis: RadarAnalysisVersion | null | undefined;
  scope?: RadarSerpSelectionScope;
}) : RadarSerpCurationSummary {
  const compatibleAnalysis = input.view && input.analysis && analysisMatchesSelectionScope(input.view, input.analysis, input.scope) ? input.analysis : null;
  const projection = buildRadarSerpSelectionProjection(input.view, compatibleAnalysis, input.scope);
  const approvedReferences = projection.rows.filter(row => row.decision?.decision === "included").length;
  /*
   * "Pendente" e "ainda não iniciada" são estados diferentes.
   *
   * `pendingDecisions` conta decisões pendentes DENTRO de uma análise. Sem
   * análise a projeção é vazia e o número dá zero — e a tela mostrava
   * "Decisões pendentes: 0" ao lado de sete resultados dizendo "Aguardando
   * decisão". Zero ali não significava nada resolvido: significava que não
   * havia onde registrar decisão.
   */
  const observedResults = input.view?.organicResults.length || 0;
  const curationStarted = Boolean(compatibleAnalysis);
  return {
    selectedCompetitors: selectedRadarOrganicResults(input.view, input.analysis, input.scope).length,
    approvedReferences,
    curationStarted,
    observedResults,
    awaitingCuration: curationStarted ? 0 : observedResults,
    pendingDecisions: pendingOrganicDecisionCount(input.view, compatibleAnalysis, input.scope),
    needs: compatibleAnalysis?.payload.competitiveReport?.needs.length || 0,
    gaps: compatibleAnalysis?.payload.competitiveReport?.profile.limitations.length || 0,
    conflicts: input.view?.diagnostic?.possibleConflicts.length || 0,
  };
}

export function radarSerpApprovalBlockReason(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  view: RadarSerpView | null | undefined;
  analysis: RadarAnalysisVersion | null | undefined;
}) {
  if (!input.view?.record.research || input.view.origin !== "real") return "A aprovação exige uma SERP real com snapshot canônico.";
  if (!radarAnalysisMatchesSerp(input)) return "Inicie ou atualize a curadoria para este snapshot antes de aprovar a SERP.";
  if (pendingOrganicDecisionCount(input.view, input.analysis, { brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }) > 0) return "Decida todos os resultados orgânicos antes de aprovar a SERP.";
  return null;
}

/**
 * The legacy analysis contract also stores PAA, related-search and Knowledge
 * Graph rows as pending decisions. In the unified Workbench those rows are
 * read-only complementary evidence, while every organic result remains
 * explicitly decided before SERP approval.
 */
export function radarSerpApprovalIssues(input: {
  view: RadarSerpView | null | undefined;
  analysis: RadarAnalysisVersion | null | undefined;
  scope?: RadarSerpSelectionScope;
}) {
  if (!input.analysis) return [];
  const issues = analysisApprovalIssues(input.analysis);
  if (pendingOrganicDecisionCount(input.view, input.analysis, input.scope) > 0) return issues;
  return issues.filter(issue => issue !== "Existem itens da SERP sem decisão.");
}
