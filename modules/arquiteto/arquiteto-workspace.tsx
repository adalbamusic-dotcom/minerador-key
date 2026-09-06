"use client";

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { useBrand } from "@/components/brand-context";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { buildDeterministicArticleArchitecture, describeAssignedGroups } from "@/lib/arquiteto/engine";
import { detectArchitectureConflicts } from "@/lib/arquiteto/conflicts";
import { MAX_KEYWORDS_PER_ARTICLE } from "@/lib/arquiteto/domain-rules";
import { commitManualArchitecture, manualMoveTargets, requestManualArchitecture, resolveManualArchitecture, type ManualArchitectureKind, type ManualArchitectureTarget, type PendingManualArchitecture } from "@/lib/arquiteto/manual-architecture-interaction";
import type {
  ArticleDNA,
  ArchitectKeyword,
  EditorialArticleUnitType,
  EditorialUnitClassification,
  LandingPagePurpose,
  KeywordArticleReview,
  ProvisionalArticleGroup,
  SiloDNA,
  SiloPage,
  InternalLinkGraph,
  InternalLinkGraphEdge,
  InternalLinkGraphNode,
  InternalLinkGraphWorkingCopy,
  VersionEnvelope,
  VersionReference,
  VersionStatusEvent,
} from "@/lib/arquiteto/contracts";
import { InternalLinkGraphEdgeSchema, ProvisionalArticleGroupSchema, SiloPageSchema, VersionedSiloDNASchema, VersionedSiloPageSchema } from "@/lib/arquiteto/contracts";
import {
  applyKeywordArticleReview,
  buildLogicalKeywordRecommendations,
  buildRelevantArticleCatalog,
  buildArticleReviewBatches,
  materialKeywordArticleDecisions,
  isNoOpKeywordArticleDecision,
  mergeKeywordArticleReviews,
} from "@/lib/arquiteto/keyword-article-review";
import { createStatusEvent, createVersionEnvelope, toVersionReference } from "@/lib/arquiteto/versioning";
import { loadCanonicalArquitetoArtifacts, persistArquitetoArtifact, persistArquitetoSiloPair } from "@/lib/arquiteto/canonical-persistence";
import { buildCanonicalArticleWorkspaceItems, mergeCanonicalArticleWorkspaceItems } from "@/lib/arquiteto/canonical-bootstrap";
import { persistArticleFormationMarker } from "@/lib/arquiteto/canonical-workspace";
import { anchorRemoteTerritoryForSilo, buildCanonicalWorkflowWorkspaceItems, confirmRemoteSiloCandidate, createRemoteSiloCandidate, persistArchitectureMarker, updateRemoteTerritoryContext, consolidateRemoteSiloFromWorkingCopy, createRemoteSiloWorkingCopy, loadCanonicalArquitetoWorkspace, persistArchitectWorkingCopy, updateRemoteSiloWorkingCopy, type CanonicalSiloWorkingCopy, type CanonicalTerritory, type CanonicalWorkspaceSnapshot, type RemoteArticleFormationSerp, persistMineradorArquitetoHandoff } from "@/lib/arquiteto/canonical-workspace";
import { absolutePublishedUrl, applySiloIdentityToProposal, classifySiloWorkingCopyFailure, consolidatedTerritoryRefsOf, deriveSupportArticleIds, draftSiloWorkingCopyFromProposal, humanExclusion, humanPillarSelection, resolveAuthoritativeSiloWorkingCopies, resolveProposalTerritoryRef, resolveSiloWorkingCopyIdentity, siloWorkingCopyIsReadOnly } from "@/lib/arquiteto/silo-working-copy-bridge";
import type { SiloWorkingCopyState } from "@/lib/arquiteto/silo-working-copy-record";
import { markSiloConsolidationIndeterminate, openSiloConsolidationOperation, registerSiloConsolidationAttempt, settleSiloConsolidationOperation, siloConsolidationRequestBody, type SiloConsolidationOperation } from "@/lib/arquiteto/silo-consolidation-operation";
import { CANONICAL_IMPORTABILITY, type CanonicalImportability } from "@/lib/arquiteto/minerador-handoff";
import { buildTerritorialLandscape } from "@/lib/arquiteto/territorial-landscape";
import { deriveTerritorialLogic, territorialAssignmentsFromWorkflowPayloads } from "@/lib/arquiteto/territorial-logic";
import { buildKeywordUniverse, reservedSiloPageHeadIds } from "@/lib/arquiteto/keyword-universe";
import { buildSiteStructureReading } from "@/lib/arquiteto/site-structure-evidence";
import { buildTerritorialSurface, deriveTerritorialProcessAvailability } from "@/lib/arquiteto/territorial-surface";
import { manualSiloCandidateDraft, planSiloAssignment, planSiteStructurePromotion, resolveSiloAssignmentOutcome } from "@/lib/arquiteto/silo-assignment";
import { validateManualSiloSlug, type SlugSubject } from "@/lib/arquiteto/slug-architecture";
import { TerritorialWorkspaceHeader, TerritorialWorkspaceRows } from "./territorial-workspace-rows";
import { ArticleFormationPanel } from "./article-formation-panel";
import { ArticleSiloPageRow } from "./article-silo-rows";
import { buildArticleSiloViews, filterArticleSiloViews, summarizeArticleSiloViews } from "@/lib/arquiteto/article-silo-view";
import { buildArticleFlowProjection } from "@/lib/arquiteto/article-flow";
import { auditArticleSiloScope } from "@/lib/arquiteto/article-silo-scope";
import { buildSiloScopedProvisionalGroups, countCrossSiloGroups, summarizeScopedGroups } from "@/lib/arquiteto/article-formation-scope";
import { articleParentLabel, assertSingleParent, readArticleParent, resolveParentBinding } from "@/lib/arquiteto/article-parent-binding";
import { findApprovedGraphForSilo, relevantEdgesForArticle, resolveCanonicalSiloForArticle } from "@/lib/arquiteto/radar-handoff-context";
import { materializeArticleSiloId, readArticleSiloContract } from "@/lib/arquiteto/article-silo-materialization";
import { resolveSiloPagePublicationIdentity } from "@/lib/arquiteto/silo-page-publication-identity";
import { assertSelectionScope, scopeFormationUniverses, selectedCandidateRefsOf } from "@/lib/arquiteto/article-selection-scope";
import { readArticleStructuralState, resolveTerritoryChangeImpact } from "@/lib/arquiteto/article-structural-impact";
import { detectExactPublishedRootDuplicates, resolveSupersedeReadiness, territoryRefsOutOfCompetition } from "@/lib/arquiteto/territory-duplicate";
import {
  ARTICLE_COMPATIBILITY_LABELS,
  ARTICLE_FUNNEL_LABELS,
  ARTICLE_INTENT_LABELS,
  ARTICLE_KGR_APPLICABILITY_LABELS,
  ARTICLE_KGR_LABELS,
  ARTICLE_PROTECTION_LABELS,
  resolveArticleClassification,
  CLASSIFICATION_BLOCKER_LABELS,
  unresolvedClassificationMessage,
  unresolvedClassifications,
  type ClassificationEvidence,
} from "@/lib/arquiteto/article-classification-closure";
import { buildRadarHandoffPlan } from "@/lib/arquiteto/radar-handoff-gate";
import { buildArchitectSerpProvenance } from "@/lib/arquiteto/radar-handoff-gate";
import type { RadarArticleHandoffContext } from "@/lib/editorial/operational-flow";
import { buildStructuralLinkConnections, structuralLinkBlockers } from "@/lib/arquiteto/internal-link-structure";
import { newFormationRef, planKeywordRole, planMergeCandidates, planMoveKeyword, planPrincipalChange, planSplitKeyword, type FormationKeywordLike, type FormationPlan } from "@/lib/arquiteto/article-formation-editing";
import { resolveArticleFormationState } from "@/lib/arquiteto/article-formation-decision";
import { buildArticleFormationConfirmationPlan, summarizeConfirmationPlan, validateFormationConclusion, type ConclusionGate, type ConfirmationEntry } from "@/lib/arquiteto/article-formation-confirmation";
import { MAX_ARTICLE_KEYWORDS, articleFormationBaseHash, buildArticleFormationUniverse, summarizeArticleFormation, type ArticleCandidate } from "@/lib/arquiteto/article-formation";
import { partitionMaterializedArticles, summarizeLegacyArticles } from "@/lib/arquiteto/formation-materialization";
import { observedFromArticleDna, readbackMaterializedArticles, type MaterializationReadback, type MaterializedArticleExpectation } from "@/lib/arquiteto/article-materialization-readback";
import { articleSerpParecerFromAssessment } from "@/lib/arquiteto/article-serp-interpretation";
import { ARTICLE_SERP_STATE_LABELS, articleSerpBaseHash, articleSerpBaseOf, resolveArticleFormationSerpState, serpWasExecutedFor, summarizeArticleSerpGate, type ArticleSerpGateState } from "@/lib/arquiteto/article-serp-gate";
import { comparePrincipalCandidates, simulateScenarioChange, type ScenarioChange, type ScenarioKeyword } from "@/lib/arquiteto/formation-scenario";
import { ArticleFormationReviewPanel, type EvidenceState } from "./article-formation-review";
import { ARTICLE_FORMATION_MARKER_CONTRACT_VERSION, ARTICLE_FORMATION_SCENARIO_LABELS, resolveArticleFormationScenarioState, type ArticleFormationMarkerPayload } from "@/lib/arquiteto/article-formation-marker";
import { SitemapViewHeader, SitemapViewRows } from "./sitemap-rows";
import { buildArticlePipelineRows } from "@/lib/arquiteto/article-pipeline";
import { buildSitemapView } from "@/lib/arquiteto/sitemap-view";
import { buildTerritorialSerpQuestions, territorialSerpBlockedReason, type TerritorialSerpAssessment } from "@/lib/arquiteto/territorial-serp";
import { buildTerritorialSerpBase, territorialSerpBaseHash } from "@/lib/arquiteto/territorial-serp-record";
import { territorialAiAvailabilityOf, type TerritorialAiProposal } from "@/lib/arquiteto/territorial-ai";
import { buildTerritorialReviewView, territorialHumanDecisionLabel, territorialProcessCells, type TerritorialReviewAction } from "@/lib/arquiteto/territorial-review";
import { buildArchitectureAnalysis, buildArchitectureConfirmationPlan } from "@/lib/arquiteto/architecture-analysis";
import { ArchitecturePanel } from "./architecture-panel";
import { buildArchitectureFlowProjection, clusterRefOfFlowNode } from "@/lib/arquiteto/architecture-flow";
import { ARCHITECTURE_MARKER_CONTRACT_VERSION, ARCHITECTURE_SCENARIO_LABELS, resolveArchitectureScenarioState, type ArchitectureMarkerPayload } from "@/lib/arquiteto/architecture-marker-record";
import { buildPublishedSiteArchitecture } from "@/lib/arquiteto/published-site-architecture";
import { resolveTerritoryConfirmationReadiness, siloIsHumanDecided } from "@/lib/arquiteto/territory";
import { TerritorialReviewPanel } from "./territorial-review-panel";
import { buildTerritorialAiBase, territorialAiBaseHash } from "@/lib/arquiteto/territorial-ai-record";
import { architectAreaHref, readArchitectAreaFromLocation, resolveArchitectArea, resolveArchitectDeepLink, sameStringSet } from "@/lib/arquiteto/deep-link";
import { deterministicArticleDnaPayload, deterministicSiloPagePayload } from "@/lib/arquiteto/adapters";
import { assertManualSiloPageSlugAvailable, autoManualSiloPageSlug, normalizeManualSiloPageSlug } from "@/lib/arquiteto/manual-silo";
import { confirmArticleArchitecture, confirmedArticlePayload } from "@/lib/arquiteto/architecture-confirmation";
import { applyManualKeywordRole, articleKeyOf, manualKeywordRoleFor, setManualSupportRole, type ManualArchitectureOutcome, type ManualKeywordRole } from "@/lib/arquiteto/manual-architecture";
import { articleConsolidationIssues, articleDnaReadbackIssues, publishedArticleCompatibilityIssues } from "@/lib/arquiteto/article-consolidation";
import { articleRadarGateIssues, isSerpAssessmentComplete, normalizeArticleProvisionalGroup, normalizeArticleWorkingCopyKeyword, resolveArticlePhaseProcessStates, resolveArticleRadarReadiness, resolveArticleSiloReadiness } from "@/lib/arquiteto/article-phase";
import { resolveSerpEvidencePriority } from "@/lib/arquiteto/serp-evidence-priority";
import { mergeSerpAssessments, resolveSerpArticleState } from "@/lib/arquiteto/serp-assessment-registry";
import { summarizeArticleExpandedPanel } from "@/lib/arquiteto/article-expanded-panel";
import { resolveSerpFormationVerdict, type SerpFormationObservationInput } from "@/lib/arquiteto/serp-formation-verdict";
import { buildArticleReviewChecklist } from "@/lib/arquiteto/article-review-checklist";
import { buildArticleAiReadout, type ArticleAiDecisionInput } from "@/lib/arquiteto/article-ai-readout";
import { AI_STRATEGIC_PAYLOAD_LIMIT, describeArticleAiBatchOutcome, measureStrategicPayload, projectSerpAssessmentForStrategicReview, projectSiloForStrategicReview, summarizeArticleAiExecutionStates, type ArticleAiExecutionState, type StrategicSerpAssessment } from "@/lib/arquiteto/ai-strategic-payload";
import {
  ARTICLE_AI_REVIEW_ARTIFACT_TYPE,
  applyHumanProposalDecisions,
  articleAiProposalId,
  buildArticleAiReviewPayload,
  currentArticleAiReviews,
  resolveArticleAiReviewBase,
  resolveArticleAiReviewReadout,
  type ArticleAiReviewProposalInput,
  type VersionedArticleArchitectureAiReview,
} from "@/lib/arquiteto/article-ai-review";
import { readArticleKgrDecision, resolveArticleKgrSerpReadout, type ArticleKgrDecisionTone } from "@/lib/arquiteto/article-kgr-decision";
import { aggregateArticleProcessReadModels, articleAiStateLabel, articleReviewStateLabel, deriveArticleProcessReadModel, type ArticleProcessReadModel } from "@/lib/arquiteto/article-process-read-model";
import { selectArticlePanelProcessTab } from "@/lib/arquiteto/article-panel-tab-navigation";
import { suggestInternalLinkAnchorConcepts } from "@/lib/arquiteto/link-anchor-concepts";
import { applyHumanEditorialUnitDecision, suggestEditorialUnitClassification } from "@/lib/arquiteto/unit-strategy";
import { mergeScopedArticleProcessOutput, resolveArticleProcessScope, scopedArticleProcessNotification } from "@/lib/arquiteto/article-process-scope";
import { architectFunctionalErrorMessage, type ArchitectFunctionalOperation } from "@/lib/arquiteto/functional-messages";
import { aiReviewErrorMessage } from "@/lib/arquiteto/ai-review-error";
import { applyArticleSelectionClick, applySelectionPaint, articleSelectionIdForCandidate, articleSelectionIdForWorkingArticle, resolveWorkingArticleId, sameSelectionSet, toggleVisibleArticleSelection } from "@/lib/arquiteto/article-selection";
import { assertArchitectKeywordDeleteReadback, parseArchitectKeywordDeletePreview, parseArchitectKeywordDeleteResult, selectedArticleKeywordIds, type ArchitectKeywordDeleteReview } from "@/lib/arquiteto/selected-keyword-delete-lifecycle";
import { applyCanonicalSiloNames, assignSiloToArticleMembers, canonicalSiloOptions, type CanonicalSiloOption } from "@/lib/arquiteto/silo-workspace";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies, type SiloWorkingCopy, type SiloWorkingCopyArticleReference } from "@/lib/arquiteto/silo-formation";
import {
  SiloReviewProposalSchema,
  applySiloAiProposal,
  collectSiloSerpGuidelines,
  createSiloConsolidationVersions,
  siloDnaReadbackIssues,
  siloPageReadbackIssues,
  type SiloReviewProposal,
} from "@/lib/arquiteto/silo-consolidation";
import { adaptKeywordIdentityContext, resolveArticleSerpIdentityContext, serpAssessmentModeLabel } from "@/lib/arquiteto/identity-context";
import {
  SerpFormationAssessmentSchema,
  SerpFormationRecoverySchema,
  SerpPublicationVerificationSchema,
  assessedKeywordDnaIds,
  architectSerpFormationKey,
  decideSerpRecommendation,
  findSerpRecommendationForKeyword,
  isPublishedStructuralRecommendation,
  latestActiveSerpFormationAssessment,
  markSerpAssessmentOutdated,
  preserveSiloCandidateEvidenceOnFailure,
  type SerpFormationAssessment,
  type SerpSiloCandidateAssessment,
  type SerpPublicationVerification,
  unassociatedSerpRecommendations,
} from "@/lib/arquiteto/serp-formation";
import { articleApprovalIssues, effectiveVersionStatus } from "@/lib/editorial/operational-flow";
import type { AIReviewAnnotation } from "@/lib/editorial/operational-contracts";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { ArticleDnaReadonlyPanel } from "@/components/editorial/article-dna-readonly-panel";
import { KeywordDnaReadonlyPanel } from "@/components/editorial/keyword-dna-readonly-panel";
import type { KeywordContextualPresentation } from "@/lib/minerador/keyword-contextual-presentation";
import { InfoHint } from "@/components/info-hint";
import { CompactSavedViews } from "@/components/editorial/compact-saved-views";
import { WorkflowImportDialog, WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { DeleteConfirmation, PublishedDeleteConfirmation } from "@/components/lifecycle/delete-confirmation";
import { DangerApprovalDialog } from "@/components/editorial/danger-approval-dialog";
import { BackgroundTaskNotice } from "@/components/editorial/background-task-notice";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { authenticatedArchitectActor } from "@/lib/arquiteto/f5-integrity";
import { createInternalLinkGraph, createInternalLinkGraphWorkingCopy, inferInternalLinkGraphRelationType, isInternalLinkGraphRelationCompatible, updateInternalLinkGraphWorkingCopy } from "@/lib/arquiteto/internal-link-graph";
import { loadInternalLinkGraphWorkingCopy, loadInternalLinkGraphs, persistInternalLinkGraph, persistInternalLinkGraphWorkingCopy, InternalLinkGraphWorkingCopyPersistenceError } from "@/lib/arquiteto/internal-link-graph-persistence";
import { ArchitectArchitectureMap, ArchitectWorkbench, type ArchitectLinksScenario, type ArchitectMapArticle, type ArchitectMapScenario, type ArchitectMapSilo, type ArchitectMapSnapshot, type ArchitectMapState, type ArchitectProcess, type ArchitectProcessState, type ArchitectWorkspaceMode } from "./arquiteto-workbench";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import { KeywordTableColumnResizeHandle, useKeywordTableColumnResize } from "@/modules/minerador/keyword-table/keyword-table-resize";
import { useKeywordTableResponsiveWidths, type KeywordTableColumnConstraint } from "@/modules/minerador/keyword-table/use-keyword-table-responsive-widths";
import { useNoticeCenter } from "@/components/global-notice-center";
import { GLOBAL_TOPBAR_ACTION_CONTROL, GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY } from "@/components/global-topbar-control";
import {
  ArchitectArticleDnaRecoverySchema,
  ArchitectRecoverySnapshotSchema,
  ArchitectReviewRecoverySchema,
  ArchitectSiloDnaRecoverySchema,
  auditArchitectWorkspace,
  architectArticleDnaRecoveryKey,
  architectReviewRecoveryKey,
  architectSiloDnaRecoveryKey,
  buildArchitectRecoveryPlan,
  createArchitectRecoverySnapshot,
  type ArchitectRecoveryAudit,
  type ArchitectRecoveryPlan,
  type ArchitectRecoverySnapshot,
} from "@/lib/editorial/architect-recovery";
import { readBrowserArtifactReadOnly, readBrowserStorageSnapshot, writeBrowserArtifact } from "@/lib/editorial/browser-artifact-store";
import {
  createAuthenticatedBrowserClient,
  getCurrentSupabaseToken,
  getSupabaseSessionErrorMessage,
  isSupabaseBrowserAuthError,
  isSupabaseTokenExpirationError,
  withSupabaseSelectRetry,
} from "@/lib/supabase/browser-authenticated-client";
// Labels rendered by the identity resolver: SERP de fortalecimento · SERP de arquitetura do publicado · SERP de formação.
import {
  Loader2,
  X,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Unlink,
  MoreHorizontal,
  ShieldCheck,
  Building2,
  Download,
  ArrowRight
} from "lucide-react";

interface KeywordImportCandidate {
  id: string;
  keyword: string;
  intent: string | null;
  volume_search: number | null;
  status: "aprovado" | "publicado";
  lista_id: string | null;
  siloName: string | null;
  importability: CanonicalImportability;
  workflowState: string | null;
}

function importabilityReason(candidate: KeywordImportCandidate) {
  switch (candidate.importability) {
    case CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED:
      return "Publicado protegido — disponível para reconstrução arquitetural.";
    case CANONICAL_IMPORTABILITY.WORKFLOW_RECEIVED:
      return "Já recebido pelo Arquiteto no workflow canônico remoto.";
    case CANONICAL_IMPORTABILITY.ARTICLE_DNA_INCORPORATED:
      return "Já incorporada na definição canônica remota do artigo.";
    case CANONICAL_IMPORTABILITY.REMOTE_WORKFLOW_BLOCKED:
      return `Workflow remoto incompatível${candidate.workflowState ? ` (${candidate.workflowState})` : ""}.`;
    default:
      return "A keyword não está aprovada para importação.";
  }
}

function canEnterCanonicalArchitectWorkflow(candidate: KeywordImportCandidate) {
  return candidate.importability === CANONICAL_IMPORTABILITY.IMPORTABLE
    || candidate.importability === CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED;
}

function importabilityStatus(candidate: KeywordImportCandidate) {
  if (candidate.importability === CANONICAL_IMPORTABILITY.IMPORTABLE) return "approved";
  if (candidate.importability === CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED) return "published";
  if (candidate.importability === CANONICAL_IMPORTABILITY.WORKFLOW_RECEIVED || candidate.importability === CANONICAL_IMPORTABILITY.ARTICLE_DNA_INCORPORATED) return "sent_architect";
  return "blocked";
}

type ArchitectDatabaseSources = {
  silos: any[];
  keywords: any[];
  briefings: any[];
  capturedAt: string;
};

type ArchitectBackgroundResult =
  | { kind: "logical_grouping"; groups: ProvisionalArticleGroup[]; regrouped: Array<Record<string, unknown>>; mutationItems: Array<Record<string, unknown>>; mutationKeywordIds: string[]; processedArticleIds: string[]; processedKeywordIds: string[]; workspaceArticleCount: number; siloCandidates: Array<Record<string, unknown>> }
  | { kind: "keyword_review"; review: KeywordArticleReview; batchCount: number; aiFailures?: Array<{ articleId: string; message: string }>; aiRegistrationFailures?: Array<{ articleId: string; message: string }>; aiExecutionStates?: Array<{ articleId: string; state: ArticleAiExecutionState }>; aiReviewVersions?: VersionedArticleArchitectureAiReview[]; mutationArticleIds: string[]; mutationKeywordIds: string[] }
  | { kind: "article_dna"; versions: VersionEnvelope<ArticleDNA>[]; events: VersionStatusEvent[] }
  | { kind: "silo_dna"; versions: VersionEnvelope<SiloDNA>[]; events: VersionStatusEvent[] }
  | { kind: "silo_page"; versions: VersionEnvelope<SiloPage>[]; events: VersionStatusEvent[] };

/** Keyword como a planilha a projeta: o suficiente para decidir papel e pertencimento. */
type ArchitectReviewKeyword = { id: string; keyword?: string; reviewRole?: ManualKeywordRole | null };


type PendingKeywordReview = {
  review: KeywordArticleReview;
  batchCount: number;
  aiFailures?: Array<{ articleId: string; message: string }>;
  /** Revisão executada cujo registro canônico não confirmou; não é falha de IA. */
  aiRegistrationFailures?: Array<{ articleId: string; message: string }>;
  aiExecutionStates?: Array<{ articleId: string; state: ArticleAiExecutionState }>;
  mutationArticleIds: string[];
  mutationKeywordIds: string[];
  createdAt: string;
};

class ArchitectStrategicApiError extends Error {
  constructor(message: string) { super(message); this.name = "ArchitectStrategicApiError"; }
}

type PendingDangerAction =
  | { type: "reset-new"; count: number }
  | { type: "remove-silo"; clusterIds: string[]; articleIds: string[]; siloName: string };

type AiReviewArticle = {
  mainKeywordObj: { id: string; aiReviewAnnotation?: AIReviewAnnotation } | null;
  supportKeywords: Array<{ id: string; aiReviewAnnotation?: AIReviewAnnotation }>;
};

type ArticleSelectionDrag = {
  pointerId: number;
  sourceId: string;
  mode: "select" | "deselect";
  startX: number;
  startY: number;
  started: boolean;
  initialSelectedIds: Set<string>;
  visibleIds: string[];
  visibleIdSet: Set<string>;
  lastPaintedId: string | null;
  lastAppliedSelection: Set<string>;
  captureTarget: HTMLInputElement;
  previousUserSelect: string;
  cleanupListeners: (() => void) | null;
};

type InternalLinksSaveState = "idle" | "loading" | "saving" | "saved" | "conflict" | "error";

type MemoizedArticleSubtreeProps = {
  revision: object;
  processTab?: "logic" | "serp" | "ai" | "review";
  render: () => React.ReactNode;
};

/**
 * Keeps the expensive article cells/expanded panels out of the selection
 * render path. The render callback is intentionally ignored while the
 * revision object is unchanged; selection state is not part of that revision.
 */
const MemoizedArticleSubtree = React.memo(
  function MemoizedArticleSubtree({ render }: MemoizedArticleSubtreeProps) {
    return <>{render()}</>;
  },
  (previous, next) => previous.revision === next.revision && previous.processTab === next.processTab,
);

type MemoizedArticleRowProps = {
  articleId: string;
  revision: object;
  selected: boolean;
  processTab?: "logic" | "serp" | "ai" | "review";
  render: () => React.ReactNode;
};

const MemoizedArticleRow = React.memo(
  function MemoizedArticleRow({ render }: MemoizedArticleRowProps) {
    return <>{render()}</>;
  },
  (previous, next) => previous.articleId === next.articleId
    && previous.selected === next.selected
    && previous.revision === next.revision
    && previous.processTab === next.processTab,
);

type ArticleSelectionCellProps = {
  id: string;
  isPublished: boolean;
  selected: boolean;
  onClick: (id: string, event: React.MouseEvent<HTMLInputElement>) => void;
  onPointerDown: (id: string, event: React.PointerEvent<HTMLInputElement>) => void;
  onPointerMove: React.PointerEventHandler<HTMLInputElement>;
  onPointerUp: React.PointerEventHandler<HTMLInputElement>;
  onPointerCancel: React.PointerEventHandler<HTMLInputElement>;
  onLostPointerCapture: React.PointerEventHandler<HTMLInputElement>;
};

const MemoizedArticleSelectionCell = React.memo(function MemoizedArticleSelectionCell({
  id,
  isPublished,
  selected,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: ArticleSelectionCellProps) {
  return (
    <td className="w-14 border-r border-slate-800/60 px-2 py-1 text-center">
      <input
        type="checkbox"
        role="checkbox"
        checked={selected}
        aria-checked={selected}
        aria-label={isPublished ? "Selecionar artigo publicado protegido" : "Selecionar artigo novo"}
        data-article-selection-id={id}
        onClick={event => onClick(id, event)}
        onChange={() => undefined}
        onPointerDown={event => onPointerDown(id, event)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        className="h-3.5 w-3.5 cursor-pointer rounded border-slate-700 bg-slate-950 accent-blue-500"
        title={isPublished ? "Selecionar publicado protegido" : "Selecionar artigo novo"}
      />
    </td>
  );
});

const ARTICLE_SELECTION_DRAG_THRESHOLD = 6;

const MANUAL_KEYWORD_ROLE_LABELS: Record<ManualKeywordRole, string> = {
  principal: "Principal",
  secundaria: "Secundária",
  reforco_narrativo: "Reforço",
};

// Helper slug
const toSlug = (text: string) =>
  text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[^\w-]+/g, "");

const SILO_COLORS = [
  { border: "border-l-divider", headerText: "text-foreground", countBg: "bg-surface-subtle", countBorder: "border-divider" },
  { border: "border-l-context-accent/60", headerText: "text-context-accent", countBg: "bg-context-accent/10", countBorder: "border-context-accent/25" },
  { border: "border-l-module-accent/60", headerText: "text-module-accent", countBg: "bg-module-accent/10", countBorder: "border-module-accent/25" },
  { border: "border-l-positive-soft/60", headerText: "text-positive-soft", countBg: "bg-positive-soft/10", countBorder: "border-positive-soft/25" },
  { border: "border-l-warning/60", headerText: "text-warning", countBg: "bg-warning/10", countBorder: "border-warning/25" },
  { border: "border-l-pending/60", headerText: "text-pending", countBg: "bg-pending/10", countBorder: "border-pending/25" },
];

const SUPPORT_KEYWORD_COLORS = [
  { row: "bg-surface-subtle", expanded: "bg-surface-elevated", border: "border-divider", title: "text-context-accent", stripe: "border-l-context-accent" },
  { row: "bg-surface-subtle", expanded: "bg-surface-elevated", border: "border-divider", title: "text-module-accent", stripe: "border-l-module-accent" },
  { row: "bg-surface-subtle", expanded: "bg-surface-elevated", border: "border-divider", title: "text-positive-soft", stripe: "border-l-positive-soft" },
  { row: "bg-surface-subtle", expanded: "bg-surface-elevated", border: "border-divider", title: "text-warning", stripe: "border-l-warning" },
  { row: "bg-surface-subtle", expanded: "bg-surface-elevated", border: "border-divider", title: "text-pending", stripe: "border-l-pending" },
  { row: "bg-surface-subtle", expanded: "bg-surface-elevated", border: "border-divider", title: "text-foreground", stripe: "border-l-divider" },
];

const EDITORIAL_UNIT_LABELS: Record<EditorialArticleUnitType, string> = {
  article: "Artigo", service_page: "Página de serviço", landing_page: "Landing page", category_page: "Página de categoria", other: "Outro",
};
/**
 * Tipos escolhíveis na fase Artigos. Página de categoria é decisão de
 * cluster/SiloPage e pertence à etapa Silos; um artigo publicado que já é
 * categoria continua sendo exibido com o rótulo canônico.
 */
const ARTICLE_PHASE_UNIT_TYPES: EditorialArticleUnitType[] = ["article", "service_page", "landing_page", "other"];
const LANDING_PURPOSE_LABELS: Record<Exclude<LandingPagePurpose, undefined>, string> = {
  seo: "SEO", campaign: "Campanha", hybrid: "Híbrida", unknown: "Ainda não definida",
};

/**
 * Colunas da planilha de Artigos. As larguras são o estado preferido do usuário;
 * a projeção responsiva encolhe primeiro as colunas `flexible`, depois as
 * normais, e nunca as `protected`. A soma dos mínimos (1120px) é o ponto a
 * partir do qual a grade passa a rolar horizontalmente — acima disso ela cabe
 * na área operacional sem barra horizontal.
 */
const architectColumnWidths: Record<string, number> = {
  index: 40, selection: 52, expand: 40, article: 168, keyword: 280, keywordCount: 104,
  aiReview: 112, articleDefinition: 120, silo: 128, actions: 176, approval: 148, status: 148,
};
const architectColumnConstraints: Record<string, KeywordTableColumnConstraint> = {
  index: { min: 36, max: 64 },
  selection: { min: 44, max: 72 },
  expand: { min: 36, max: 56 },
  article: { min: 120, max: 420, flexible: true },
  keyword: { min: 180, max: 720, flexible: true },
  keywordCount: { min: 84, max: 200 },
  aiReview: { min: 92, max: 220 },
  articleDefinition: { min: 96, max: 220 },
  silo: { min: 96, max: 260, flexible: true },
  actions: { min: 132, max: 300, priority: "protected" },
  approval: { min: 108, max: 240 },
  status: { min: 104, max: 240 },
};
const architectColumnIds = Object.keys(architectColumnWidths);

const ARCHITECT_UI = {
  toolbarButton: "inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-divider bg-surface-subtle px-2 text-sm font-medium text-foreground/75 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-40",
  primaryButton: "inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-context-accent/35 bg-context-accent/10 px-2 text-sm font-medium text-context-accent transition-colors hover:border-context-accent/55 hover:bg-context-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/30 disabled:cursor-not-allowed disabled:opacity-40",
  importButton: "inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-positive-soft/35 bg-positive-soft/10 px-2 text-sm font-medium text-positive-soft transition-colors hover:border-positive-soft/55 hover:bg-positive-soft/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-positive-soft/30 disabled:cursor-not-allowed disabled:opacity-40",
  dangerButton: "inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-danger/45 bg-danger-soft px-2 text-sm font-medium text-danger transition-colors hover:border-danger/65 hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30 disabled:cursor-not-allowed disabled:opacity-40",
  control: "min-h-8 rounded border border-divider bg-surface-subtle px-2 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted focus-visible:border-module-accent/45 focus-visible:ring-2 focus-visible:ring-module-accent/25",
  iconButton: "inline-flex min-h-8 min-w-8 items-center justify-center rounded border border-divider text-text-muted transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30",
  footerButton: "inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-divider bg-surface-subtle px-2 text-sm font-medium text-foreground/75 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-40",
  section: "rounded-md border border-divider bg-surface-subtle p-3",
  sectionLabel: "text-sm font-semibold uppercase tracking-wider text-foreground/75",
  metaLabel: "text-sm font-semibold uppercase tracking-wide text-text-muted",
  metaValue: "mt-1 text-sm leading-5 text-foreground/85",
};

/** Tom da decisão KGR do artigo: verde para KGR confirmado, âmbar para decisão humana pendente. */
const ARTICLE_KGR_TONE_CLASSES: Record<ArticleKgrDecisionTone, string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-foreground",
};

// ─── Componente principal ───────────────────────────────────────────────────
/**
 * Território de uma proposta local, LIDO dos ArticleDNAs que a compõem.
 *
 * Fora do componente de propósito: como função estável, ela não vira
 * dependência instável de memoização — e a proposta local não carrega
 * território próprio, então inventar um aqui criaria identidade no browser.
 */
function proposalTerritoryRef(
  copy: SiloWorkingCopy | null,
  articleDnas: Record<string, VersionEnvelope<ArticleDNA>>,
): string | null {
  if (!copy) return null;
  const articleIds = copy.articleReferences.map(reference => reference.articleId);
  const territoryRefByArticleId = new Map(articleIds.map(articleId => [
    articleId,
    articleDnas[articleId]?.payload.territoryRef,
  ]));
  return resolveProposalTerritoryRef({ articleIds, territoryRefByArticleId }).territoryRef;
}

export default function ArquitetoPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { brands, selectedBrandId, profileLoading } = useBrand();
  const supabase = useMemo(() => createAuthenticatedBrowserClient(), []);
  const { publishNotice } = useNoticeCenter();
  const showNotification = useCallback((type: "success" | "warning" | "error", msg: string) => {
    publishNotice({
      // WARNING existe para o desfecho que concluiu a execução mas ainda tem
      // pendência operacional; só ERROR significa que nada foi concluído.
      severity: type === "success" ? "SUCCESS" : type === "warning" ? "WARNING" : "ERROR",
      title: "Arquiteto",
      message: msg,
      source: type === "success" ? "persistence" : "workflow",
      confirmed: type === "success",
      module: "arquiteto",
      area: "Arquiteto",
    });
  }, [publishNotice]);
  const { articleVersions: acceptedArticleDnas, siloVersions: acceptedSiloDnas, siloPageVersions: acceptedSiloPages, versionEvents, aiReviewAnnotations,
    setArticleVersions: setAcceptedArticleDnas, setSiloVersions: setAcceptedSiloDnas, setSiloPageVersions: setAcceptedSiloPages, addVersionEvents,
    selectedEntityId, setSelectedEntityId, setArchitectImportedKeywordIds, importApprovedToRadar, importApprovedSiloPagesToRadar, radarItems,
    backgroundTasks, runBackgroundTask, consumeBackgroundTask, dismissBackgroundTask, addAiReviewAnnotations, restoreOperationalSnapshot,
    plannerItems, documents, operationalPublications } = useEditorialPipeline();

  // Data
  const [siloOptions, setSiloOptions] = useState<CanonicalSiloOption[]>([]);
  const [masterList, setMasterList] = useState<any[]>([]);
  const [canonicalBootstrapError, setCanonicalBootstrapError] = useState<{ code: string; message: string } | null>(null);
  const [canonicalBootstrapStatus, setCanonicalBootstrapStatus] = useState<"LOADING" | "LOADED" | "EMPTY" | "ERROR">("LOADING");
  const [canonicalWorkspaceReload, setCanonicalWorkspaceReload] = useState(0);
  const [keywordImportPool, setKeywordImportPool] = useState<KeywordImportCandidate[]>([]);
  const [keywordImportError, setKeywordImportError] = useState<string | null>(null);
  const [canonicalReceivedKeywordIds, setCanonicalReceivedKeywordIds] = useState<string[]>([]);
  // Apresentação Contextual recebida do Minerador: leitura para o perfil da keyword.
  const [keywordPresentations, setKeywordPresentations] = useState<Record<string, KeywordContextualPresentation>>({});
  const [databaseSources, setDatabaseSources] = useState<ArchitectDatabaseSources>({ silos: [], keywords: [], briefings: [], capturedAt: "" });
  const [recoverySnapshot, setRecoverySnapshot] = useState<ArchitectRecoverySnapshot | null>(null);
  const [recoveryAudit, setRecoveryAudit] = useState<ArchitectRecoveryAudit | null>(null);
  const [recoveryPlan, setRecoveryPlan] = useState<ArchitectRecoveryPlan | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const canonicalReceivedKeywordSignature = useMemo(() => [...canonicalReceivedKeywordIds].sort().join("|"), [canonicalReceivedKeywordIds]);
  const [keywordImportOpen, setKeywordImportOpen] = useState(false);
  const [provisionalGroups, setProvisionalGroups] = useState<ProvisionalArticleGroup[]>([]);
  const [serpAssessments, setSerpAssessments] = useState<SerpFormationAssessment[]>([]);
  /**
   * Evidência SERP da formação lida do REMOTO.
   *
   * O IndexedDB continua sendo cache de interface, mas deixou de ser
   * autoridade: a pergunta "esta composição foi ao mercado?" não pode ter
   * respostas diferentes em duas máquinas.
   */
  const [remoteArticleSerp, setRemoteArticleSerp] = useState<RemoteArticleFormationSerp[]>([]);
  /**
   * Os grafos de links da marca, lidos do remoto.
   *
   * O portão do Radar pergunta se o Article está coberto por um grafo
   * aprovado. Sem a lista carregada ele responderia "não" por ignorância, e
   * a recusa apareceria como pendência de arquitetura.
   */
  const [approvedLinkGraphs, setApprovedLinkGraphs] = useState<InternalLinkGraph[]>([]);
  const [siloCandidateSerpEvidence, setSiloCandidateSerpEvidence] = useState<SerpSiloCandidateAssessment[]>([]);
  const [publicationVerifications, setPublicationVerifications] = useState<SerpPublicationVerification[]>([]);
  const [serpBusy, setSerpBusy] = useState(false);
  // Estado da SERP por Article: falha específica carrega estágio, código e se
  // a execução daquela unidade pode ser repetida.
  const [serpExecution, setSerpExecution] = useState<Record<string, { status: "processing" | "ready" | "error"; queryCount: number; completed: number; message?: string; stage?: string; code?: string; retryable?: boolean; lastAttemptFailed?: boolean }>>({});
  const [verificationBusy, setVerificationBusy] = useState<Set<string>>(new Set());
  const [pendingKeywordReview, setPendingKeywordReview] = useState<PendingKeywordReview | null>(null);
  /** Confirmação curta (antes/depois/impacto) das ações estruturais humanas. */
  const [pendingManualArchitecture, setPendingManualArchitecture] = useState<PendingManualArchitecture | null>(null);
  // Revisão IA canônica por Article: é o que sobrevive ao F5.
  const [articleAiReviews, setArticleAiReviews] = useState<Record<string, VersionedArticleArchitectureAiReview>>({});
  // Hash da base arquitetural vigente, para detectar revisão de base antiga.
  const [articleBaseHashes, setArticleBaseHashes] = useState<Record<string, string>>({});
  const [rejectedKeywordReviewIds, setRejectedKeywordReviewIds] = useState<Set<string>>(new Set());
  const [pendingRadarSmokeReadback, setPendingRadarSmokeReadback] = useState<string[] | null>(null);
  const [siloWorkingCopies, setSiloWorkingCopies] = useState<SiloWorkingCopy[]>([]);
  const [pendingSiloReview, setPendingSiloReview] = useState<SiloReviewProposal | null>(null);
  const [rejectedSiloReviewIds, setRejectedSiloReviewIds] = useState<Set<string>>(new Set());
  const [siloWorkingCopyUndo, setSiloWorkingCopyUndo] = useState<SiloWorkingCopy[] | null>(null);
  const [siloReviewBusy, setSiloReviewBusy] = useState(false);
  const [siloConsolidating, setSiloConsolidating] = useState(false);
  // AUTORIDADE REMOTA da working copy de Silo. `siloWorkingCopies` acima segue
  // sendo só a PROPOSTA inicial: assim que existe linha remota para o
  // território, é esta lista que manda.
  const [remoteSiloWorkingCopies, setRemoteSiloWorkingCopies] = useState<CanonicalSiloWorkingCopy[]>([]);
  const [siloWorkingCopyConflict, setSiloWorkingCopyConflict] = useState<string | null>(null);
  // Territórios remotos: o `lockVersion` daqui é o expectedLock que a
  // consolidação exige, e o lifecycleStatus diz o que já virou histórico.
  const [remoteTerritories, setRemoteTerritories] = useState<CanonicalTerritory[]>([]);
  /**
   * Catálogo `marcas.silos_existentes` vindo do read-model canônico do
   * Arquiteto. Ler do brand context aqui acoplava a projeção territorial a uma
   * derivação instável do componente.
   */
  const [siloDecisionBusyKeywordId, setSiloDecisionBusyKeywordId] = useState<string | null>(null);
  const [siteStructureBusyUrl, setSiteStructureBusyUrl] = useState<string | null>(null);
  const [siloConfirmBusyRef, setSiloConfirmBusyRef] = useState<string | null>(null);
  /** Projeção da aba Silos; estado de UI, sem persistência canônica. */
  const [siloView, setSiloView] = useState<"architecture" | "sitemap">("architecture");
  /** Filtro operacional da projeção Arquitetura. Estado de UI. */
  const [siloScope, setSiloScope] = useState<"all" | "site_silos" | "manual_silos" | "structures" | "unassigned">("all");
  const [territorialSerpBusy, setTerritorialSerpBusy] = useState(false);
  /** Pareceres de SERP por pergunta. Evidência, nunca decisão aplicada. */
  const [territorialSerpAssessments, setTerritorialSerpAssessments] = useState<TerritorialSerpAssessment[]>([]);
  /** Hash da arquitetura que cada parecer validou; sustenta "Desatualizada". */
  const [territorialSerpBaseHashes, setTerritorialSerpBaseHashes] = useState<Map<string, string>>(new Map());
  const [territorialAiBusy, setTerritorialAiBusy] = useState(false);
  /** Propostas de IA por pergunta. Hipótese reversível, nunca decisão. */
  const [territorialAiProposals, setTerritorialAiProposals] = useState<TerritorialAiProposal[]>([]);
  const [territorialAiBaseHashes, setTerritorialAiBaseHashes] = useState<Map<string, string>>(new Map());
  const [reviewBusyAction, setReviewBusyAction] = useState<string | null>(null);
  const [architectureBusy, setArchitectureBusy] = useState(false);
  /** Hash do lote na última análise; sustenta o aviso de desatualizada. */
  /** Cenário vigente vindo do remoto; a análise em si é reconstruída. */
  const [architectureMarker, setArchitectureMarker] = useState<ArchitectureMarkerPayload | null>(null);
  /** Síntese da última confirmação; alimenta o CTA para Artigos. */
  const [confirmedArchitecture, setConfirmedArchitecture] = useState<{ silos: number; keywords: number; pending: number } | null>(null);
  const [formationBusy, setFormationBusy] = useState(false);
  /** Nó aberto na mesa/mapa da aba Artigos. Seleção é leitura. */
  const [selectedArticleNodeRef, setSelectedArticleNodeRef] = useState<string | null>(null);
  /** Linhas de page com o DNA aberto. A linha principal continua compacta. */
  const [expandedArticleRefs, setExpandedArticleRefs] = useState<Set<string>>(new Set());
  /**
   * Publicados selecionados.
   *
   * Identidade própria: usar um articleId fabricado faria o patrimônio entrar
   * em operações de Article que não valem para ele.
   */
  const [selectedPublishedRefs, setSelectedPublishedRefs] = useState<Set<string>>(new Set());

  const toggleArticleUnitExpansion = useCallback((ref: string) => {
    setExpandedArticleRefs(atual => {
      const proximo = new Set(atual);
      if (proximo.has(ref)) proximo.delete(ref);
      else proximo.add(ref);
      return proximo;
    });
  }, []);

  const togglePublishedSelection = useCallback((ref: string) => {
    setSelectedPublishedRefs(atual => {
      const proximo = new Set(atual);
      if (proximo.has(ref)) proximo.delete(ref);
      else proximo.add(ref);
      return proximo;
    });
  }, []);
  /** Silo aberto no painel; `null` mostra o resumo global. */
  const [panelSiloRef, setPanelSiloRef] = useState<string | null>(null);
  /** Cenário de formação vigente vindo do remoto; os candidatos são reconstruídos. */
  const [articleFormationMarker, setArticleFormationMarker] = useState<ArticleFormationMarkerPayload | null>(null);

  /** Grupos abertos no mapa; fora deles vale o limite anti-hairball. */
  const [expandedClusterRefs, setExpandedClusterRefs] = useState<Set<string>>(new Set());
  /** Promoções de página em voo — trava síncrona contra duplicar o silo. */
  const siteStructurePromotionsInFlight = useRef<Set<string>>(new Set());
  const [siloContextRef, setSiloContextRef] = useState<string | null>(null);
  const [siloContextDraft, setSiloContextDraft] = useState({ name: "", centralEntity: "", macroIntent: "", includes: "", excludes: "", statement: "", continuity: "coherent", brandAlignment: "aligned" });
  const [siloContextSaving, setSiloContextSaving] = useState(false);
  /**
   * Snapshot remoto do Site da Marca. SOMENTE remoto: o Arquiteto nunca lê
   * IndexedDB/localStorage da Marca, e coleta parcial não vira estrutura —
   * o read-model usa o catálogo do last-known-good.
   */
  const [brandSiteSnapshot, setBrandSiteSnapshot] = useState<Parameters<typeof buildSiteStructureReading>[0]["snapshot"]>(null);
  const [brandSiloCatalog, setBrandSiloCatalog] = useState<CanonicalWorkspaceSnapshot["brandSiloCatalog"]>([]);
  // Operação de consolidação em voo. Existe para o retry reenviar o MESMO
  // envelope; não é fonte canônica de nada.
  const pendingConsolidationRef = useRef<SiloConsolidationOperation | null>(null);
  const [mapLogicGroupsSnapshot, setMapLogicGroupsSnapshot] = useState<ProvisionalArticleGroup[] | null>(null);
  const [mapSerpAssessmentsSnapshot, setMapSerpAssessmentsSnapshot] = useState<SerpFormationAssessment[] | null>(null);
  const [mapSerpArticlesSnapshot, setMapSerpArticlesSnapshot] = useState<ArchitectMapArticle[] | null>(null);
  const [mapSerpSilosSnapshot, setMapSerpSilosSnapshot] = useState<ArchitectMapSilo[] | null>(null);
  const [mapAiKeywordReviewSnapshot, setMapAiKeywordReviewSnapshot] = useState<PendingKeywordReview | null>(null);
  const [mapAiSiloReviewSnapshot, setMapAiSiloReviewSnapshot] = useState<SiloReviewProposal | null>(null);
  const [mapAiArticlesSnapshot, setMapAiArticlesSnapshot] = useState<ArchitectMapArticle[] | null>(null);
  const [mapAiSilosSnapshot, setMapAiSilosSnapshot] = useState<ArchitectMapSilo[] | null>(null);
  const [mapState, setMapState] = useState<ArchitectMapState>({ scenario: "current", compare: false, selectedNodeId: null, selectedArticleId: null, selectedKeywordId: null, selectedSiloId: null });
  const [linksSelectedSiloId, setLinksSelectedSiloId] = useState<string | null>(null);
  const [linksScenario, setLinksScenario] = useState<ArchitectLinksScenario>("working");
  const [linksApprovedGraph, setLinksApprovedGraph] = useState<InternalLinkGraph | null>(null);
  const [linksWorkingCopy, setLinksWorkingCopy] = useState<InternalLinkGraphWorkingCopy | null>(null);
  const [linksSelectedNodeId, setLinksSelectedNodeId] = useState<string | null>(null);
  const [linksSelectedEdgeId, setLinksSelectedEdgeId] = useState<string | null>(null);
  const [linksSaveState, setLinksSaveState] = useState<InternalLinksSaveState>("idle");
  const [linksError, setLinksError] = useState<string | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksPersistedLockVersion, setLinksPersistedLockVersion] = useState<number | null>(null);
  const [linksLoadedGraphId, setLinksLoadedGraphId] = useState<string | null>(null);
  useEffect(() => { setSiloWorkingCopies([]); pendingConsolidationRef.current = null; }, [selectedBrandId]);
  useEffect(() => {
    setMapLogicGroupsSnapshot(null);
    setMapSerpAssessmentsSnapshot(null);
    setMapSerpArticlesSnapshot(null);
    setMapSerpSilosSnapshot(null);
    setMapAiKeywordReviewSnapshot(null);
    setMapAiSiloReviewSnapshot(null);
    setMapAiArticlesSnapshot(null);
    setMapAiSilosSnapshot(null);
    setMapExpanded(false);
    setMapState(previous => ({ ...previous, scenario: "current", compare: false, selectedNodeId: null, selectedArticleId: null, selectedKeywordId: null, selectedSiloId: null }));
    setLinksSelectedSiloId(null);
    setLinksScenario("working");
    setLinksApprovedGraph(null);
    setLinksWorkingCopy(null);
    setLinksSelectedNodeId(null);
    setLinksSelectedEdgeId(null);
    setLinksSaveState("idle");
    setLinksError(null);
    setLinksPersistedLockVersion(null);
    setLinksLoadedGraphId(null);
    // Autoridade remota some junto com a marca: manter WC/território de outra
    // Brand na tela seria mostrar arquitetura que não é desta marca.
    setRemoteSiloWorkingCopies([]);
    setRemoteTerritories([]);
    setBrandSiloCatalog([]);
    setBrandSiteSnapshot(null);
    setSiloWorkingCopyConflict(null);
  }, [selectedBrandId]);

  // UI state
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [updating,          setUpdating]          = useState(false);
  const [loadingKeywords,   setLoadingKeywords]   = useState(false);
  const architectTasks = useMemo(() => backgroundTasks.filter(task => ["logical_grouping", "keyword_review", "article_dna", "silo_dna", "silo_page"].includes(task.type)), [backgroundTasks]);
  const runningArchitectTask = (type: "logical_grouping" | "keyword_review" | "article_dna" | "silo_dna" | "silo_page") =>
    architectTasks.find(task => task.type === type && (task.status === "queued" || task.status === "running"));
  const activeLogicalTask = runningArchitectTask("logical_grouping");
  const activeKeywordReviewTask = runningArchitectTask("keyword_review");
  const activeArticleDnaTask = runningArchitectTask("article_dna");
  const activeSiloDnaTask = runningArchitectTask("silo_dna");
  const activeSiloPageTask = runningArchitectTask("silo_page");
  const generatingStrategic = Boolean(activeLogicalTask || activeKeywordReviewTask || activeArticleDnaTask || activeSiloDnaTask || activeSiloPageTask);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  const headerSelectionRef = useRef<HTMLInputElement>(null);
  /** Larguras preferidas do usuário (arraste tipo Excel) + projeção responsiva na largura real da área. */
  const articleTableRef = useRef<HTMLDivElement | null>(null);
  const columnResize = useKeywordTableColumnResize(architectColumnWidths, architectColumnConstraints);
  const articleColumnWidths = useKeywordTableResponsiveWidths(columnResize.widths, architectColumnConstraints, articleTableRef);
  const lastSelectionAnchorId = useRef<string | null>(null);
  const selectionDragRef = useRef<ArticleSelectionDrag | null>(null);
  const suppressSelectionClickRef = useRef(false);
  const lastLoadedImportSignature = useRef("");
  const persistWorkingCopyAssignmentsRef = useRef<((items: any[]) => Promise<boolean>) | null>(null);
  const recoveredArchitectArtifacts = useRef(new Set<string>());
  const canonicalArtifactsLoaded = useRef(new Set<string>());
  const reviewRecoveryReady = useRef(new Set<string>());
  const serpRecoveryReady = useRef(new Set<string>());
  const consumedExternalNavigation = useRef<string | null>(null);
  const masterListRef = useRef(masterList);
  masterListRef.current = masterList;
  const articleAiReviewsRef = useRef<Record<string, VersionedArticleArchitectureAiReview>>({});
  articleAiReviewsRef.current = articleAiReviews;

  // Accordion — expanded row ids & active tabs per expanded article
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeTabs,  setActiveTabs]  = useState<Record<string, "suporte" | "dna">>({});
  const [expandedProcessTabs, setExpandedProcessTabs] = useState<Record<string, "logic" | "serp" | "ai" | "review">>({});
  const [unitDrafts, setUnitDrafts] = useState<Record<string, { type: EditorialArticleUnitType; landingPagePurpose: LandingPagePurpose }>>({});
  const [primaryDrafts, setPrimaryDrafts] = useState<Record<string, string>>({});

  // Toolbar filters
  const [searchQuery,      setSearchQuery]      = useState("");
  const [filterHierarquia, setFilterHierarquia] = useState("Todos");
  const [filterStatus, setFilterStatus] = useState("Todos");

  // Inline edits
  const [customSlugs,       setCustomSlugs]       = useState<Record<string,string>>({});
  const [customHierarquias, setCustomHierarquias] = useState<Record<string,string>>({});
  const [selectedArticleIds,       setSelectedArticleIds]       = useState<Set<string>>(new Set());
  const selectedArticleIdsRef = useRef(selectedArticleIds);
  const visibleArticleIdsRef = useRef<string[]>([]);
  const pendingSelectionMeasurementRef = useRef<{ startMark: string; source: string; sequence: number } | null>(null);
  const selectionMeasurementSequenceRef = useRef(0);
  useEffect(() => {
    selectedArticleIdsRef.current = selectedArticleIds;
  }, [selectedArticleIds]);
  const markSelectionInteraction = useCallback((source: string) => {
    if (process.env.NODE_ENV === "production" || typeof performance === "undefined") return;
    const sequence = selectionMeasurementSequenceRef.current + 1;
    selectionMeasurementSequenceRef.current = sequence;
    const startMark = `architect-selection-start-${sequence}`;
    performance.mark(startMark);
    pendingSelectionMeasurementRef.current = { startMark, source, sequence };
  }, []);
  useLayoutEffect(() => {
    const pending = pendingSelectionMeasurementRef.current;
    if (!pending || typeof performance === "undefined") return;
    pendingSelectionMeasurementRef.current = null;
    const commitMark = `architect-selection-commit-${pending.sequence}`;
    performance.mark(commitMark);
    performance.measure("architect.selection.click-to-commit", pending.startMark, commitMark);
    const measures = performance.getEntriesByName("architect.selection.click-to-commit");
    const latest = measures[measures.length - 1];
    console.debug(`[Arquiteto] seleção commit source=${pending.source} durationMs=${latest ? latest.duration.toFixed(2) : "unknown"}`);
    performance.clearMarks(pending.startMark);
    performance.clearMarks(commitMark);
  }, [selectedArticleIds]);
  const [selectedSiloPageIds, setSelectedSiloPageIds] = useState<Set<string>>(new Set());
  const [expandedSiloIds, setExpandedSiloIds] = useState<Set<string>>(new Set());
  // A área explícita da URL vence o default: F5 em Silos precisa voltar em Silos.
  // O default só responde "onde cair quando nada foi escolhido".
  const [workspaceMode, setWorkspaceMode] = useState<ArchitectWorkspaceMode>(() =>
    resolveArchitectArea(readArchitectAreaFromLocation(typeof window === "undefined" ? null : window.location.href), "silos"));
  // Trocar de área reescreve a URL sem empilhar histórico nem recarregar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const href = architectAreaHref(window.location.href, workspaceMode);
    if (href) window.history.replaceState(window.history.state, "", href);
  }, [workspaceMode]);
  const [activeProcess, setActiveProcess] = useState<ArchitectProcess>("logic");
  const [mapExpanded, setMapExpanded] = useState(false);
  useEffect(() => {
    setActiveProcess(workspaceMode === "links" ? "review" : "logic");
  }, [workspaceMode]);
  useEffect(() => {
    setMapState(previous => ({ ...previous, scenario: "current", compare: false, selectedNodeId: null, selectedArticleId: null, selectedKeywordId: null, selectedSiloId: null }));
    setMapExpanded(false);
    setSelectedSiloPageIds(new Set());
  }, [workspaceMode]);
  const architectHistoryValue = useMemo(() => ({ masterList, customSlugs, customHierarquias, articleVersions: acceptedArticleDnas, siloVersions: acceptedSiloDnas, siloPageVersions: acceptedSiloPages, versionEvents, aiReviewAnnotations }), [masterList, customSlugs, customHierarquias, acceptedArticleDnas, acceptedSiloDnas, acceptedSiloPages, versionEvents, aiReviewAnnotations]);
  const masterHistory = useLocalHistory("arquiteto", architectHistoryValue, snapshot => {
    setMasterList(snapshot.masterList);
    setCustomSlugs(snapshot.customSlugs);
    setCustomHierarquias(snapshot.customHierarquias);
    setProvisionalGroups(describeAssignedGroups(snapshot.masterList));
    restoreOperationalSnapshot("arquiteto", snapshot);
    void persistWorkingCopyAssignmentsRef.current?.(snapshot.masterList);
    setSelectedArticleIds(new Set());
    lastSelectionAnchorId.current = null;
  }, 30, selectedBrandId || "sem-marca");
  const [selectedStatusAction, setSelectedStatusAction] = useState("");
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  const [keywordDeleteReview, setKeywordDeleteReview] = useState<ArchitectKeywordDeleteReview | null>(null);
  const [keywordDeleteSimpleOpen, setKeywordDeleteSimpleOpen] = useState(false);
  const [keywordDeletePublishedOpen, setKeywordDeletePublishedOpen] = useState(false);
  useEffect(() => {
    lastSelectionAnchorId.current = null;
    selectionDragRef.current = null;
    suppressSelectionClickRef.current = false;
    setSelectedArticleIds(new Set());
    setPendingKeywordReview(null);
    setRejectedKeywordReviewIds(new Set());
  }, [selectedBrandId]);

  useEffect(() => {
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId || !selectedBrandId || recoveredArchitectArtifacts.current.has(selectedBrandId)) return;
    const brandId = selectedBrandId;
    if (canonicalArtifactsLoaded.current.has(brandId)) return;
    let cancelled = false;
    const recover = async () => {
      const recoveredEvents: VersionStatusEvent[] = [];
      try {
        const raw = await readBrowserArtifactReadOnly(architectArticleDnaRecoveryKey(actorUserId, brandId));
        if (raw && !cancelled) {
          const recovered = ArchitectArticleDnaRecoverySchema.parse(raw);
          if (!canonicalArtifactsLoaded.current.has(brandId)) setAcceptedArticleDnas(current => ({ ...current, ...recovered.versions }));
          recoveredEvents.push(...recovered.events);
        }
      } catch { /* artefato inválido não impede a recuperação dos demais */ }
      try {
        const raw = await readBrowserArtifactReadOnly(architectSiloDnaRecoveryKey(actorUserId, brandId));
        if (raw && !cancelled) {
          const recovered = ArchitectSiloDnaRecoverySchema.parse(raw);
          if (!canonicalArtifactsLoaded.current.has(brandId)) setAcceptedSiloDnas(current => ({ ...current, ...recovered.versions }));
          recoveredEvents.push(...recovered.events);
        }
      } catch { /* artefato inválido não impede a recuperação dos demais */ }
      if (cancelled) return;
      recoveredArchitectArtifacts.current.add(brandId);
      if (recoveredEvents.length) addVersionEvents(recoveredEvents);
    };
    void recover();
    return () => { cancelled = true; };
    // Os comandos do contexto são recriados quando o workspace muda. Incluí-los
    // aqui faria o readback canônico reiniciar ao atualizar o próprio contexto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrandId, session?.user?.id, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "loading" || (sessionStatus === "authenticated" && profileLoading)) {
      setCanonicalBootstrapStatus("LOADING");
      setLoading(true);
      return;
    }
    if (sessionStatus !== "authenticated" || !selectedBrandId) {
      setCanonicalBootstrapError(null);
      setCanonicalBootstrapStatus("EMPTY");
      setCanonicalReceivedKeywordIds([]);
      setLoading(false);
      return;
    }
    const brandId = selectedBrandId;
    let cancelled = false;
    let bootstrapFinalized = false;
    setLoading(true);
    setLoadingKeywords(true);
    setCanonicalReceivedKeywordIds([]);
    setCanonicalBootstrapError(null);
    setCanonicalBootstrapStatus("LOADING");
    void loadCanonicalArquitetoWorkspace(brandId).then(canonical => {
      if (cancelled) return;
      bootstrapFinalized = true;
      canonicalArtifactsLoaded.current.add(brandId);
      // A working copy remota é adotada como autoridade já no bootstrap: se
      // ela existe, nenhuma proposta local pode se apresentar como o estado.
      setRemoteSiloWorkingCopies(canonical.siloWorkingCopies);
      setRemoteTerritories(canonical.territories);
      // Hidratação do parecer já gravado: F5 não consulta provider de novo.
      setTerritorialSerpAssessments(canonical.territorialSerp.map(item => item.payload.assessment));
      setTerritorialSerpBaseHashes(new Map(canonical.territorialSerp.map(item => [item.questionId, item.payload.baseHash])));
      // A evidência da formação vem do REMOTO: o navegador é cache, e a
      // pergunta "esta composição foi ao mercado?" não pode depender dele.
      setRemoteArticleSerp(canonical.articleFormationSerp);
      setTerritorialAiProposals(canonical.territorialAi.map(item => item.payload.proposal));
      setTerritorialAiBaseHashes(new Map(canonical.territorialAi.map(item => [item.questionId, item.payload.baseHash])));
    setArchitectureMarker(canonical.architectureMarker);
      setArticleFormationMarker(canonical.articleFormationMarker);
      // O cenário processado/confirmado volta do remoto: F5 não perde o que
      // o humano já mandou fazer.
      setArchitectureMarker(canonical.architectureMarker);
      setArticleFormationMarker(canonical.articleFormationMarker);
      setBrandSiloCatalog(canonical.brandSiloCatalog);
      // Patrimônio do site: leitura remota, sem disparar coleta nenhuma.
      void fetch(`/api/marca/site/sitemap?brandId=${encodeURIComponent(brandId)}`)
        .then(async response => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Site remoto indisponível.");
          return body.snapshot;
        })
        .then(snapshot => { if (!cancelled) setBrandSiteSnapshot(snapshot ?? null); })
        // Site indisponível não derruba o Arquiteto: a aba continua funcional.
        .catch(() => { if (!cancelled) setBrandSiteSnapshot(null); });
      const canonicalSilos = canonicalSiloOptions(canonical.siloDnas, canonical.siloPages);
      setKeywordPresentations(Object.fromEntries(canonical.keywordPresentations.map(item => [item.keywordId, item])));
      const workflowItems = buildCanonicalWorkflowWorkspaceItems(canonical.workflowItems, canonical.keywords, brandId);
      setCanonicalReceivedKeywordIds(canonical.workflowItems
        .filter(item => item.marcaId === brandId && item.subjectType === "keyword" && item.stage === "architect" && item.state === "received")
        .map(item => item.subjectId));
      const handoffKeywordIds = new Set(workflowItems.map(item => String(item.keywordId)));
      const bootstrap = buildCanonicalArticleWorkspaceItems(canonical.articleDnas, brandId, handoffKeywordIds);
      const workspaceItems = applyCanonicalSiloNames(
        mergeCanonicalArticleWorkspaceItems(workflowItems, bootstrap.items, brandId),
        canonicalSilos,
      );
      setMasterList(workspaceItems);
      setProvisionalGroups(describeAssignedGroups(workspaceItems as Parameters<typeof describeAssignedGroups>[0]));
      setSiloOptions(canonicalSilos);
      setDatabaseSources(current => ({ ...current, silos: canonicalSilos, keywords: canonical.availableKeywords, capturedAt: new Date().toISOString() }));
      const eligibilityByKeywordId = new Map(canonical.importEligibility.map(item => [item.keywordId, item]));
      setKeywordImportPool(canonical.availableKeywords.flatMap(keyword => {
        const eligibility = eligibilityByKeywordId.get(keyword.id);
        if (!eligibility || eligibility.importability === CANONICAL_IMPORTABILITY.NOT_APPROVED) return [];
        return [{
          id: keyword.id,
          keyword: keyword.keyword,
          intent: typeof keyword.intent === "string" ? keyword.intent : null,
          volume_search: typeof keyword.volume_search === "number" ? keyword.volume_search : null,
          status: String(keyword.status || "aprovado").toLocaleLowerCase("pt-BR") as KeywordImportCandidate["status"],
          lista_id: typeof keyword.lista_id === "string" ? keyword.lista_id : null,
          siloName: null,
          importability: eligibility.importability,
          workflowState: eligibility.workflowState,
        }];
      })
        .sort((left, right) => left.status.localeCompare(right.status) || left.keyword.localeCompare(right.keyword, "pt-BR")));
      if (bootstrap.contractGaps.length) {
        setCanonicalBootstrapError({
          code: "CANONICAL_BOOTSTRAP_CONTRACT_GAP",
          message: "A transferência remota foi lida, mas uma definição de artigo relacionada não possui os campos mínimos para aparecer na área de trabalho.",
        });
        setCanonicalBootstrapStatus("ERROR");
      } else {
        setCanonicalBootstrapError(null);
        setCanonicalBootstrapStatus(workspaceItems.length ? "LOADED" : "EMPTY");
      }
      setAcceptedArticleDnas(Object.fromEntries(canonical.articleDnas.map(version => [version.payload.articleId, version])));
      setAcceptedSiloDnas(Object.fromEntries(canonical.siloDnas.map(version => [version.payload.siloId, version])));
      setAcceptedSiloPages(Object.fromEntries(canonical.siloPages.map(version => [version.payload.siloPageId, version])));
      setArticleAiReviews(currentArticleAiReviews(canonical.aiReviews, selectedBrandId));
      const canonicalStatuses: VersionStatusEvent["status"][] = ["draft", "proposed", "approved", "rejected", "superseded"];
      const remoteEvents = canonical.statuses.flatMap(item => canonicalStatuses.includes(item.status as VersionStatusEvent["status"])
        ? [createStatusEvent(item.versionId, item.status as VersionStatusEvent["status"], session?.user?.id || "canonical-remote", "Estado carregado do artefato canônico.")]
        : []);
      if (remoteEvents.length) addVersionEvents(remoteEvents);
    }).catch(error => {
      if (!cancelled) {
        bootstrapFinalized = true;
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "QUERY_FAILURE";
        setCanonicalBootstrapError({ code, message: error instanceof Error ? error.message : "Não foi possível carregar os dados canônicos do Arquiteto." });
        setCanonicalBootstrapStatus("ERROR");
        showNotification("error", "Não foi possível carregar os dados do Arquiteto. Tente novamente mais tarde.");
      }
    }).finally(() => {
      if (!cancelled) {
        setLoadingKeywords(false);
        setLoading(false);
      }
      if (!cancelled && !bootstrapFinalized) {
        setCanonicalBootstrapStatus(current => current === "LOADING" ? "ERROR" : current);
        setCanonicalBootstrapError({
          code: "QUERY_FAILURE",
          message: "Não foi possível concluir o bootstrap canônico do Arquiteto.",
        });
      }
    });
    return () => { cancelled = true; };
    // Os comandos do contexto são recriados após cada atualização do workspace;
    // o ciclo é controlado por sessão, Brand e estado de perfil, não por eles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [canonicalWorkspaceReload, profileLoading, sessionStatus, selectedBrandId, session?.user?.id]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id || !selectedBrandId) return;
    const brandId = selectedBrandId;
    const actorUserId = session.user.id;
    let cancelled = false;
    serpRecoveryReady.current.delete(brandId);
    setSerpAssessments([]);
    setSiloCandidateSerpEvidence([]);
    setPublicationVerifications([]);
    const recover = async () => {
      try {
        const raw = await readBrowserArtifactReadOnly(architectSerpFormationKey(actorUserId, brandId));
        if (!cancelled && raw) {
          const recovered = SerpFormationRecoverySchema.parse(raw);
          setSerpAssessments(recovered.assessments);
          setSiloCandidateSerpEvidence(recovered.siloCandidateEvidence || []);
          setPublicationVerifications(recovered.verifications || []);
        }
      } catch { /* recuperação inválida não substitui o workspace atual */ }
      if (!cancelled) serpRecoveryReady.current.add(brandId);
    };
    void recover();
    return () => { cancelled = true; };
  }, [selectedBrandId, session?.user?.id, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id || !selectedBrandId || !serpRecoveryReady.current.has(selectedBrandId)) return;
    const actorUserId = session.user.id;
    const recovery = SerpFormationRecoverySchema.parse({ schemaVersion: 1, brandId: selectedBrandId, updatedAt: new Date().toISOString(), assessments: serpAssessments, siloCandidateEvidence: siloCandidateSerpEvidence, verifications: publicationVerifications });
    const timer = window.setTimeout(() => { void writeBrowserArtifact(architectSerpFormationKey(actorUserId, selectedBrandId), recovery).catch(() => undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedBrandId, session?.user?.id, sessionStatus, serpAssessments, siloCandidateSerpEvidence, publicationVerifications]);

  useEffect(() => {
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId || !selectedBrandId || !recoveredArchitectArtifacts.current.has(selectedBrandId)) return;
    const timer = window.setTimeout(() => {
      try {
        const versionIds = new Set(Object.values(acceptedArticleDnas).map(version => version.versionId));
        const recovery = ArchitectArticleDnaRecoverySchema.parse({ schemaVersion: 1, versions: acceptedArticleDnas,
          events: versionEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectArticleDnaRecoveryKey(actorUserId, selectedBrandId), recovery).catch(() => undefined);
      } catch { /* cada artefato mantém sua própria recuperação */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [acceptedArticleDnas, selectedBrandId, session?.user?.id, sessionStatus, versionEvents]);

  useEffect(() => {
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId || !selectedBrandId || !recoveredArchitectArtifacts.current.has(selectedBrandId)) return;
    const timer = window.setTimeout(() => {
      try {
        const versionIds = new Set(Object.values(acceptedSiloDnas).map(version => version.versionId));
        const recovery = ArchitectSiloDnaRecoverySchema.parse({ schemaVersion: 1, versions: acceptedSiloDnas,
          events: versionEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectSiloDnaRecoveryKey(actorUserId, selectedBrandId), recovery).catch(() => undefined);
      } catch { /* cada artefato mantém sua própria recuperação */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [acceptedSiloDnas, selectedBrandId, session?.user?.id, sessionStatus, versionEvents]);

  useEffect(() => {
    const requested = selectedEntityId || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("articleId") : null);
    if (!requested || !masterList.length) return;
    const navigation = resolveArchitectDeepLink(masterList, requested, selectedBrandId, consumedExternalNavigation.current);
    if (!navigation) return;
    consumedExternalNavigation.current = navigation.requestKey;
    setExpandedIds(current => sameStringSet(current, [navigation.articleRowId]) ? current : new Set([navigation.articleRowId]));
    setSelectedArticleIds(current => sameStringSet(current, [navigation.articleRowId]) ? current : new Set([navigation.articleRowId]));
    if (selectedEntityId) setSelectedEntityId(null);
    if (typeof window !== "undefined" && new URL(window.location.href).searchParams.has("articleId")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("articleId");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [masterList, selectedBrandId, selectedEntityId, setSelectedEntityId]);

  // Silo modal
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [newListName,     setNewListName]     = useState("");
  const [newSiloSlug, setNewSiloSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  /** Aviso de arquitetura já mostrado: o segundo clique é a decisão humana. */
  const [slugArchitectureAcknowledged, setSlugArchitectureAcknowledged] = useState(false);
  const [verifyingSiloPageId, setVerifyingSiloPageId] = useState<string | null>(null);
  useEffect(() => {
    if (workspaceMode !== "silos") setIsListModalOpen(false);
  }, [workspaceMode]);

  // Edição direta de Briefing/DNA do Artigo no acordeão
  const [savingBriefingId, setSavingBriefingId] = useState<string | null>(null);
  const [dnaMetaTitles, setDnaMetaTitles] = useState<Record<string, string>>({});
  const [dnaMetaDescriptions, setDnaMetaDescriptions] = useState<Record<string, string>>({});
  const [dnaAngulosVenda, setDnaAngulosVenda] = useState<Record<string, string>>({});
  const [dnaCTAs, setDnaCTAs] = useState<Record<string, string>>({});
  const [dnaAntiCanibalizacoes, setDnaAntiCanibalizacoes] = useState<Record<string, string>>({});

  // Inner Accordion - Keyword semantic DNA expanded rows
  const [expandedKwIds, setExpandedKwIds] = useState<Set<string>>(new Set());

  // Close the article-selection menu on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectionMenuRef.current && !selectionMenuRef.current.contains(e.target as Node)) setSelectionMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Readback canônico de silos
  const pushMasterHistory = (snapshot = masterList, label = "Alteração na arquitetura de artigos") => masterHistory.capture(label, { masterList: snapshot, customSlugs, customHierarquias, articleVersions: acceptedArticleDnas, siloVersions: acceptedSiloDnas, siloPageVersions: acceptedSiloPages, versionEvents, aiReviewAnnotations });

  const undoMasterList = () => {
    masterHistory.undo();
    showNotification("success", "Voltando uma alteração estrutural.");
  };

  const redoMasterList = () => {
    masterHistory.redo();
    showNotification("success", "Refazendo alteração estrutural.");
  };

  const fetchData = async () => {
    if (sessionStatus !== "authenticated" || !selectedBrandId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
      const canonicalSilos = canonicalSiloOptions(canonical.siloDnas, canonical.siloPages);
      setSiloOptions(canonicalSilos);
      setDatabaseSources(current => ({ ...current, silos: canonicalSilos, capturedAt: new Date().toISOString() }));

    } catch (err: any) {
      console.error("Erro ao carregar silos canônicos no Arquiteto:", { code: err?.code, message: err?.message });
      showNotification("error", err?.message || "Erro ao carregar os silos canônicos.");
    } finally {
      setLoading(false);
    }
  };

  const readArchitectDatabaseSources = async (): Promise<ArchitectDatabaseSources> => {
    if (sessionStatus !== "authenticated" || !selectedBrandId) {
      return { silos: [], keywords: [], briefings: [], capturedAt: new Date().toISOString() };
    }
    const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
    return {
      silos: canonicalSiloOptions(canonical.siloDnas, canonical.siloPages),
      keywords: canonical.availableKeywords,
      briefings: [],
      capturedAt: new Date().toISOString(),
    };
  };

  // ── Fetch & cluster master list
  const fetchMasterList = async () => {
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId || !selectedBrandId) return;
    setLoadingKeywords(true);
    setKeywordImportError(null);
    const canonicalWorkspaceOwnsMasterList = true;
    if (canonicalWorkspaceOwnsMasterList) {
      setCanonicalWorkspaceReload(current => current + 1);
      return;
    }
    try {
      // Inactive legacy path: import eligibility never comes from browser state.
      // The canonical path above always reloads the remote snapshot.
      const approvedIds = new Set<string>();
      const sourceData = await readArchitectDatabaseSources();
      setDatabaseSources(sourceData);
      const silosData = sourceData.silos;
      const allKws = sourceData.keywords;
      const allBriefingsRaw = sourceData.briefings;
      const siloNameMap: Record<string,string> = {};
      silosData.forEach(s => { siloNameMap[String(s.id)] = s.nome; });

      // Keywords
      // [DIAG] Rastreio de keywords por camada
      setKeywordImportPool(allKws
        .filter(keyword => ["aprovado", "publicado"].includes(keyword.status?.toLowerCase()))
        .map(keyword => ({
          id: keyword.id,
          keyword: keyword.keyword,
          intent: keyword.intent || null,
          volume_search: keyword.volume_search ?? null,
          status: keyword.status.toLowerCase() as KeywordImportCandidate["status"],
          lista_id: keyword.lista_id || null,
          siloName: keyword.lista_id ? siloNameMap[String(keyword.lista_id)] || null : null,
          importability: keyword.status?.toLowerCase() === "publicado"
            ? CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED
            : CANONICAL_IMPORTABILITY.IMPORTABLE,
          workflowState: null,
        }))
        .sort((left, right) => left.status.localeCompare(right.status) || left.keyword.localeCompare(right.keyword, "pt-BR")));

      // Briefings — busca em paralelo
      const allBriefings = allBriefingsRaw;

      // A leitura inicial apenas reapresenta o workspace já persistido. A
      // reconciliação de fontes fica bloqueada até o snapshot ser exportado.
      let persistedReview: z.infer<typeof ArchitectReviewRecoverySchema> | null = null;
      try {
        const rawRecovery = await readBrowserArtifactReadOnly(architectReviewRecoveryKey(actorUserId, selectedBrandId));
        if (rawRecovery) persistedReview = ArchitectReviewRecoverySchema.parse(rawRecovery);
      } catch { /* uma cópia inválida não autoriza reconstrução implícita */ }
      const recoveredWorkspaceItems = persistedReview?.masterList.map(item => item.source ? item : { ...item, source: "LOCAL_RECOVERY" }) || [];
      const currentWorkspaceItems = masterListRef.current.length ? masterListRef.current : recoveredWorkspaceItems;
      const currentWorkspaceByKeywordId = new Map(currentWorkspaceItems.map(item => [String(item.keywordId || item.id), item]));

      const items: any[] = [];

      // 1. Mapear todas as keywords publicadas de minerador_keywords
      const pubKws = allKws.filter(k => k.status?.toLowerCase() === "publicado");
      const pubBriefings = allBriefings.filter(b => b.status?.toLowerCase() === "publicado");

      const publishedMap = new Map<string, any>();

      pubKws.forEach(kw => {
        const briefing = pubBriefings.find(b => 
          b.keyword_principal.toLowerCase().trim() === kw.keyword.toLowerCase().trim()
        );

        const slugSemantica = kw.analise_semantica?.slug_sugerido || toSlug(kw.keyword);
        const hierarquiaSemantica = kw.analise_semantica?.hierarquia || "Pilar";
        const publishedArticleId = briefing ? `pub-b-${briefing.id}` : `pub-k-${kw.id}`;

        publishedMap.set(kw.keyword.toLowerCase().trim(), {
          id: publishedArticleId,
          clusterId: publishedArticleId,
          provisionalGroupId: publishedArticleId,
          briefingId: briefing?.id || null,
          keywordId: kw.id,
          keyword: kw.keyword,
          volume_search: kw.volume_search || 0,
          intent: kw.intent || "Informativo",
          kgr: kw.kgr_score || kw.kgr || null,
          status: "publicado",
          slug_sugerido: briefing?.slug_sugerido || slugSemantica,
          publishedUrl: briefing?.published_url || briefing?.publishedUrl || briefing?.url || kw.published_url || kw.publishedUrl || kw.url || null,
          canonical: briefing?.canonical || briefing?.canonical_url || kw.canonical || kw.canonical_url || null,
          hierarquia: briefing?.hierarquia || hierarquiaSemantica,
          silo_id: briefing?.silo_id || kw.lista_id,
          siloName: siloNameMap[String(briefing?.silo_id || kw.lista_id)] || null,
          isPublished: true,
          meta_title: briefing?.meta_title || null,
          meta_description: briefing?.meta_description || null,
          diretrizes_estrategicas: briefing?.diretrizes_estrategicas || null,
          keywords_secundarias: briefing?.keywords_secundarias || [],
          analise_semantica: kw.analise_semantica || null,
          ...adaptKeywordIdentityContext(kw),
        });
      });

      // Se houver algum briefing publicado que não esteja no minerador_keywords, adiciona
      pubBriefings.forEach(b => {
        const key = b.keyword_principal.toLowerCase().trim();
        if (!publishedMap.has(key)) {
          const kwMatch = allKws.find(k => k.keyword.toLowerCase().trim() === key);
          publishedMap.set(key, {
            id: `pub-b-${b.id}`,
            clusterId: `pub-b-${b.id}`,
            provisionalGroupId: `pub-b-${b.id}`,
            briefingId: b.id,
            keywordId: kwMatch?.id || null,
            keyword: b.keyword_principal,
            volume_search: kwMatch?.volume_search ?? null,
            intent: kwMatch?.intent || "Informativo",
            kgr: kwMatch?.kgr_score || kwMatch?.kgr || null,
            status: "publicado",
            slug_sugerido: b.slug_sugerido,
            publishedUrl: b.published_url || b.publishedUrl || b.url || null,
            canonical: b.canonical || b.canonical_url || null,
            hierarquia: b.hierarquia,
            silo_id: b.silo_id,
            siloName: siloNameMap[String(b.silo_id)] || null,
            isPublished: true,
            meta_title: b.meta_title || null,
            meta_description: b.meta_description || null,
            diretrizes_estrategicas: b.diretrizes_estrategicas || null,
            keywords_secundarias: b.keywords_secundarias || [],
            analise_semantica: kwMatch?.analise_semantica || null,
            ...(kwMatch ? adaptKeywordIdentityContext(kwMatch) : adaptKeywordIdentityContext(b)),
          });
        }
      });

      publishedMap.forEach(item => {
        const current = currentWorkspaceByKeywordId.get(String(item.keywordId || item.id));
        items.push(current ? { ...item, ...current, id: item.id, keywordId: item.keywordId, status: "publicado", isPublished: true } : item);
      });

      // Relações explícitas já gravadas no briefing são evidência de vínculo;
      // elas não são reagrupadas nem inferidas por similaridade lexical.
      pubBriefings.forEach(briefing => {
        const anchor = publishedMap.get(String(briefing.keyword_principal || "").toLowerCase().trim());
        if (!anchor) return;
        const secondaryValues = Array.isArray(briefing.keywords_secundarias)
          ? briefing.keywords_secundarias
          : typeof briefing.keywords_secundarias === "string"
            ? (() => { try { const parsed = JSON.parse(briefing.keywords_secundarias); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()
            : [];
        secondaryValues.forEach((secondary: unknown) => {
          const value = typeof secondary === "string" ? secondary.trim() : "";
          const secondaryKeyword = allKws.find(keyword => String(keyword.id) === value || String(keyword.keyword).toLowerCase().trim() === value.toLowerCase());
          if (!secondaryKeyword || secondaryKeyword.id === anchor.keywordId) return;
          if (items.some(item => item.keywordId === secondaryKeyword.id && item.clusterId === anchor.clusterId)) return;
          items.push({
            id: `pub-support-${briefing.id}-${secondaryKeyword.id}`,
            clusterId: anchor.clusterId,
            provisionalGroupId: anchor.provisionalGroupId,
            briefingId: briefing.id,
            keywordId: secondaryKeyword.id,
            keyword: secondaryKeyword.keyword,
            volume_search: secondaryKeyword.volume_search ?? null,
            intent: secondaryKeyword.intent || "Informativo",
            kgr: secondaryKeyword.kgr_score || secondaryKeyword.kgr || null,
            status: secondaryKeyword.status || "aprovado",
            slug_sugerido: anchor.slug_sugerido,
            publishedUrl: anchor.publishedUrl || secondaryKeyword.published_url || secondaryKeyword.publishedUrl || secondaryKeyword.url || null,
            canonical: anchor.canonical || secondaryKeyword.canonical || secondaryKeyword.canonical_url || null,
            hierarquia: "Reforco Narrativo",
            silo_id: anchor.silo_id,
            siloName: anchor.siloName,
            isPublished: false,
            computedSlug: anchor.slug_sugerido,
            computedHierarquia: "Reforco Narrativo",
            analise_semantica: secondaryKeyword.analise_semantica || null,
            ...adaptKeywordIdentityContext(secondaryKeyword),
          });
        });
      });

      // 2. Reapresentar keywords aprovadas importadas agora ou já presentes no
      // workspace atual. O índice só controla inclusão; não reagrupa os itens.
      const approved = allKws.filter(k => k.status?.toLowerCase() === "aprovado"
        && (approvedIds.has(String(k.id)) || currentWorkspaceByKeywordId.has(String(k.id))));
      approved.forEach(kw => {
        if (items.some(item => String(item.keywordId || item.id) === String(kw.id))) return;
        const current = currentWorkspaceByKeywordId.get(String(kw.id));
        items.push({
          ...(current || {}),
          id: current?.id || kw.id,
          keywordId: kw.id,
          keyword: current?.keyword || kw.keyword,
          volume_search: kw.volume_search ?? null,
          intent: kw.intent || "Informativo",
          kgr: kw.kgr_score || kw.kgr || null,
          publishedUrl: current?.publishedUrl || kw.published_url || kw.publishedUrl || kw.url || null,
          canonical: current?.canonical || kw.canonical || kw.canonical_url || null,
          status: "aprovado",
          silo_id: kw.lista_id,
          siloName: siloNameMap[String(kw.lista_id)] || null,
          isPublished: false,
          analise_semantica: kw.analise_semantica || null,
          ...adaptKeywordIdentityContext(kw),
        });
      });

      const legacyItems = items.map(item => item.source ? item : { ...item, source: "LEGACY_REMOTE" });
      const renderedIds = new Set(legacyItems.map(item => String(item.keywordId || item.id)));
      items.length = 0;
      items.push(...legacyItems);
      currentWorkspaceItems.forEach(item => {
        const keywordId = String(item.keywordId || item.id);
        if (!renderedIds.has(keywordId)) {
          items.push(item);
          renderedIds.add(keywordId);
        }
      });
      if (persistedReview) {
        setCustomSlugs(persistedReview.customSlugs);
        setCustomHierarquias(persistedReview.customHierarchies);
        if (persistedReview.annotations.length) addAiReviewAnnotations(persistedReview.annotations);
      }
      reviewRecoveryReady.current.add(selectedBrandId);
      const safeCurrentGroups = (persistedReview?.provisionalGroups || provisionalGroups).flatMap(group => {
        const parsed = ProvisionalArticleGroupSchema.safeParse(group);
        return parsed.success ? [parsed.data] : [];
      });
      setProvisionalGroups(safeCurrentGroups);
      setMasterList(items);

      // Pre-populate input values for editing briefing directly
      const initialMetaTitles: Record<string, string> = {};
      const initialMetaDescriptions: Record<string, string> = {};
      const initialAngulos: Record<string, string> = {};
      const initialCTAs: Record<string, string> = {};
      const initialAntiCanibalizacoes: Record<string, string> = {};

      allBriefings.forEach(b => {
        initialMetaTitles[b.id] = b.meta_title || "";
        initialMetaDescriptions[b.id] = b.meta_description || "";
        const strat = b.diretrizes_estrategicas || {};
        initialAngulos[b.id] = strat.angulo_de_venda || "";
        initialCTAs[b.id] = strat.chamada_para_acao || "";
        initialAntiCanibalizacoes[b.id] = strat.angulo_anti_canibalizacao || "";
      });

      setDnaMetaTitles(initialMetaTitles);
      setDnaMetaDescriptions(initialMetaDescriptions);
      setDnaAngulosVenda(initialAngulos);
      setDnaCTAs(initialCTAs);
      setDnaAntiCanibalizacoes(initialAntiCanibalizacoes);
      lastLoadedImportSignature.current = [...approvedIds].sort().join("|");

    } catch (err: any) {
      const authError = isSupabaseBrowserAuthError(err);
      console.error("Erro ao carregar o ecossistema no Arquiteto:", {
        code: authError ? err.code : err?.code,
        ...(authError ? err.diagnostic : {}),
        table: "minerador_keyword_lists/minerador_keywords/briefings_artigos",
        operation: "select",
        status: err?.status,
        tokenExpired: authError ? isSupabaseTokenExpirationError(err) : false,
        message: authError ? undefined : err?.message,
      });
      setKeywordImportError(
        authError ? getSupabaseSessionErrorMessage(err.code, err.expiresAt) : "Não foi possível atualizar os itens do Minerador.",
      );
      showNotification(
        "error",
        authError ? getSupabaseSessionErrorMessage(err.code, err.expiresAt) : "Erro ao carregar o ecossistema.",
      );
    } finally { setLoadingKeywords(false); }
  };

  useEffect(() => {
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId || !selectedBrandId || !reviewRecoveryReady.current.has(selectedBrandId) || !masterList.length) return;
    const timer = window.setTimeout(() => {
      try {
        const recovery = ArchitectReviewRecoverySchema.parse({ schemaVersion: 1, importedKeywordSignature: canonicalReceivedKeywordSignature,
          masterList, provisionalGroups, customSlugs, customHierarchies: customHierarquias,
          annotations: aiReviewAnnotations, savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectReviewRecoveryKey(actorUserId, selectedBrandId), recovery).catch(() => undefined);
      } catch { /* falha local não pode interromper o trabalho editorial */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [aiReviewAnnotations, canonicalReceivedKeywordSignature, customHierarquias, customSlugs, masterList, provisionalGroups, selectedBrandId, session?.user?.id, sessionStatus]);

  /** Estruturas observadas no site, já filtradas por natureza estrutural. */
  const siteStructureReading = useMemo(
    () => buildSiteStructureReading({ brandId: selectedBrandId || "", snapshot: brandSiteSnapshot }),
    [brandSiteSnapshot, selectedBrandId],
  );

  /**
   * Identidades de slug da Marca, lidas dos contratos que já existem: SiloPage,
   * ArticleDNA e silo candidato. Nenhuma identidade nova de slug é criada aqui.
   */
  const brandSlugSubjects = useMemo<SlugSubject[]>(() => {
    const pages = Object.values(acceptedSiloPages)
      .filter(version => !selectedBrandId || version.payload.brandId === selectedBrandId)
      .map(version => ({
        kind: "silo_page" as const,
        ref: version.payload.siloPageId,
        label: version.payload.siloPageId,
        slug: version.payload.slug,
        parentRef: null,
        hierarchy: null,
        isPublished: version.payload.publicationStatus === "published",
        canonical: version.payload.canonical,
      }));
    const siloPageBySiloId = new Map(Object.values(acceptedSiloPages).map(version => [version.payload.siloId, version.payload.siloPageId]));
    const articles = Object.values(acceptedArticleDnas)
      .filter(version => !selectedBrandId || version.payload.brandId === selectedBrandId)
      .map(version => ({
        kind: "article" as const,
        ref: version.payload.articleId,
        label: version.payload.articleId,
        slug: version.payload.suggestedSlug,
        parentRef: version.payload.siloId ? siloPageBySiloId.get(version.payload.siloId) ?? null : null,
        hierarchy: version.payload.hierarchy,
        // Identidade publicada é protegida e nunca vira alvo de sugestão.
        isPublished: Boolean(version.payload.publishedIdentityRef),
        canonical: version.payload.canonical,
      }));
    const candidates = remoteTerritories
      .map(item => item.territory)
      .filter(item => !selectedBrandId || item.brandId === selectedBrandId)
      .map(item => ({
        kind: "silo_candidate" as const,
        ref: item.territoryRef,
        label: item.name || item.centralEntity || item.territoryRef,
        slug: item.slugState.publishedSlug ?? item.slugState.confirmed ?? item.slugState.proposals[0]?.slug ?? "",
        parentRef: null,
        hierarchy: null,
        isPublished: item.publicationProtection === "protected",
        canonical: item.slugState.publishedCanonical,
      }))
      .filter(item => item.slug.trim().length > 0);
    // Páginas publicadas observadas no site entram como PROTEGIDAS: um slug novo
    // precisa se adaptar ao que já está no ar, nunca o contrário.
    const publicadas = siteStructureReading.structures.map(structure => ({
      kind: "silo_page" as const,
      ref: structure.evidenceId,
      label: structure.label,
      slug: structure.path || structure.normalizedUrl,
      parentRef: null,
      hierarchy: null,
      isPublished: true,
      canonical: structure.canonicalVerified ? structure.canonical : null,
    }));
    return [...pages, ...articles, ...candidates, ...publicadas];
  }, [acceptedSiloPages, acceptedArticleDnas, remoteTerritories, selectedBrandId, siteStructureReading]);

  // ── Handlers
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (workspaceMode !== "silos") {
      showNotification("error", "A criação explícita de Silo está disponível somente na aba Silos.");
      return;
    }
    if (!selectedBrandId || !activeBrand) { showNotification("error", "Selecione uma marca ativa antes de criar o silo."); return; }
    if (!newListName.trim()) { showNotification("error", "Nome do silo obrigatório."); return; }
    let normalizedSlug: string;
    try {
      const slugDraft = slugManuallyEdited ? newSiloSlug : newListName;
      normalizedSlug = normalizeManualSiloPageSlug(slugDraft);
      setNewSiloSlug(normalizedSlug);
      assertManualSiloPageSlugAvailable(normalizedSlug, [
        ...Object.values(acceptedSiloPages).filter(version => version.payload.brandId === selectedBrandId).map(version => version.payload.slug),
        ...masterList.filter(item => item.isPublished && item.slug_sugerido).map(item => String(item.slug_sugerido)),
        // Propostas de slug dos candidatos já criados também ocupam o espaço.
        ...remoteTerritories.flatMap(item => [
          item.territory.slugState.confirmed,
          ...item.territory.slugState.proposals.map(proposal => proposal.slug),
        ]).filter((slug): slug is string => Boolean(slug)),
      ]);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Identidade do silo inválida.");
      return;
    }
    // Slug é decisão de arquitetura: a identidade proposta é lida junto com
    // páginas, artigos e publicados da Marca antes de existir.
    const arquitetura = validateManualSiloSlug({
      subjects: brandSlugSubjects,
      name: newListName.trim(),
      slug: normalizedSlug,
    });
    if (arquitetura.status === "blocked") {
      showNotification("error", arquitetura.issues.filter(issue => issue.severity === "blocked").map(issue => issue.reason).join(" "));
      return;
    }
    if (arquitetura.status === "warning") {
      // Aviso não bloqueia: a decisão continua humana, com o conflito à vista.
      showNotification("error", `${arquitetura.issues.map(issue => issue.reason).join(" ")} Ajuste o slug ou confirme novamente para seguir assim.`);
      if (!slugArchitectureAcknowledged) { setSlugArchitectureAcknowledged(true); return; }
    }
    setSlugArchitectureAcknowledged(false);
    setSaving(true);
    try {
      // Porta canônica Silo-first: cria SÓ o candidato. Nenhuma lista de
      // keywords, nenhum SiloDNA, nenhuma SiloPage, nenhuma publicação — essas
      // entidades pertencem ao fim da cadeia, não à criação manual.
      const created = await createRemoteSiloCandidate({
        brandId: selectedBrandId,
        draft: manualSiloCandidateDraft({ name: newListName.trim(), slug: normalizedSlug }),
      });
      showNotification("success", `Silo "${newListName}" criado como candidato e confirmado no readback.`);
      setNewListName(""); setNewSiloSlug(""); setSlugManuallyEdited(false); setIsListModalOpen(false);
      // A criação já devolve o registro lido de volta; o reload confirma o
      // readback completo e hidrata a paisagem sem uma segunda carga concorrente.
      setRemoteTerritories(previous => [...previous.filter(item => item.territoryRef !== created.territoryRef), created]);
      setCanonicalWorkspaceReload(current => current + 1);
    } catch (error) {
      const failure = error as { message?: unknown } | null;
      showNotification("error", typeof failure?.message === "string" ? failure.message : "Erro ao criar silo");
    }
    finally { setSaving(false); }
  };

  const closeNewSiloModal = () => {
    setIsListModalOpen(false);
    setNewListName("");
    setNewSiloSlug("");
    setSlugManuallyEdited(false);
  };

  const handleNewSiloNameChange = (value: string) => {
    setNewListName(value);
    if (!slugManuallyEdited) setNewSiloSlug(autoManualSiloPageSlug(value));
  };

  // Salva o briefing do Artigo diretamente do acordeão
  const handleSaveArticleDna = async (art: any) => {
    const briefingId = art.briefingId;
    const keywordPrincipal = art.keywordPrincipal;
    setSavingBriefingId(briefingId);
    try {
      const protectedPublishedPayload = art.isPublished ? {} : {
        keyword_principal: keywordPrincipal,
        slug_sugerido: customSlugs[art.id] || customSlugs[briefingId] || toSlug(keywordPrincipal),
        silo_id: art.siloId,
      };

      const payload = {
        ...protectedPublishedPayload,
        hierarquia: customHierarquias[art.id] || customHierarquias[briefingId] || art.hierarquia || "Pilar",
        meta_title: (dnaMetaTitles[briefingId] || "").trim(),
        meta_description: (dnaMetaDescriptions[briefingId] || "").trim(),
        diretrizes_estrategicas: {
          angulo_de_venda: (dnaAngulosVenda[briefingId] || "").trim(),
          chamada_para_acao: (dnaCTAs[briefingId] || "").trim(),
          angulo_anti_canibalizacao: (dnaAntiCanibalizacoes[briefingId] || "").trim(),
        },
      };

      let error;
      if (briefingId.startsWith("temp-")) {
        // Insere novo briefing
        const { error: insError } = await supabase
          .from("briefings_artigos")
          .insert({
            ...payload,
            slug_sugerido: toSlug(keywordPrincipal),
            status: "publicado"
          });
        error = insError;
      } else {
        // Atualiza briefing existente
        const { error: updError } = await supabase
          .from("briefings_artigos")
          .update(payload)
          .eq("id", briefingId);
        error = updError;
      }

      if (error) throw error;
      showNotification("success", "DNA do Artigo salvo.");
      await fetchData();
      await fetchMasterList();
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao salvar DNA.");
    } finally {
      setSavingBriefingId(null);
    }
  };

  /**
   * A identidade editorial de um Silo confirmado.
   *
   * Patrimônio publicado manda: existindo página no ar, a SiloPage adota
   * aquele endereço e preserva URL e canonical. Sem patrimônio, vale o slug
   * que um humano aprovou para o Silo. O primeiro Article da composição
   * nunca decide o endereço da raiz.
   */
  const siloIdentityOf = (territorio: CanonicalTerritory) => resolveSiloWorkingCopyIdentity({
    territoryName: territorio.territory.name || null,
    centralEntity: territorio.territory.centralEntity || null,
    publishedSlug: territorio.territory.slugState?.publishedSlug ?? null,
    publishedCanonical: territorio.territory.slugState?.publishedCanonical ?? null,
    confirmedSlug: territorio.territory.slugState?.confirmed ?? null,
    // Entre as propostas, a humana é a única que vale como aprovação.
    proposedSlug: (territorio.territory.slugState?.proposals || [])
      .find(proposal => proposal.source === "human")?.slug ?? null,
  });

  const processDeterministicStructure = () => {
    if (workspaceMode !== "articles") {
      showNotification("error", "A lógica de formação de Artigos só pode ser executada na aba Artigos.");
      return;
    }
    if (!masterList.length) return;
    if (!selectedArticleIds.size) {
      showNotification("error", "Selecione um ou mais artigos para processar.");
      return;
    }
    const scope = resolveArticleProcessScope({
      selectedArticleIds: selectedArticleIdsRef.current,
      articles: articlesList,
      masterList,
      workingArticleIdFor: item => resolveWorkingArticleId(item),
    });
    const selectedKeywordIds = new Set(scope.selectedKeywordIds);
    if (!scope.selectedArticleIds.length || !selectedKeywordIds.size) {
      showNotification("error", "Os artigos selecionados não possuem KeywordDNAs processáveis.");
      return;
    }
    const source = masterList.filter(item => selectedKeywordIds.has(item.id)).map(item => ({ ...item }));
    const preservedGroups = provisionalGroups.filter(group => !group.keywordIds.some(keywordId => selectedKeywordIds.has(keywordId)));
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "logical_grouping",
      label: "Processar lógica sem IA",
      execute: async update => {
        update({ message: "Analisando perfis das keywords e priorizando publicados...", current: 0, total: 1 });
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const architecture = buildDeterministicArticleArchitecture(source);
        // A lógica forma somente grupos de Artigos. Um vínculo de Silo
        // existente em um publicado é proteção de identidade; nenhuma
        // hipótese nova de Silo atravessa esta fronteira.
        const processedGroups = architecture.groups.map(normalizeArticleProvisionalGroup);
        const regroupedArticles = processedGroups.flatMap((group, groupIndex) => {
          const principalId = group.principalSuggestion.keywordId;
          const principalKeyword = group.keywords.find(item => item.id === principalId);
          const existingWorkingArticleId = group.keywords
            .map(item => {
              const candidate = item as Record<string, unknown>;
              return typeof candidate.workingArticleId === "string" ? candidate.workingArticleId.trim() : "";
            })
            .find(value => Boolean(value) && !value.startsWith("workflow:"));
          const workingArticleId = existingWorkingArticleId || `working-article:${crypto.randomUUID()}`;
          return group.keywords.map(keyword => {
            const keywordRecord = keyword as ArchitectKeyword & Record<string, unknown>;
            const existingComputedHierarchy = typeof keywordRecord.computedHierarquia === "string" ? keywordRecord.computedHierarquia : null;
            const existingHierarchy = typeof keywordRecord.hierarquia === "string" ? keywordRecord.hierarquia : null;
            return {
              ...normalizeArticleWorkingCopyKeyword(keyword as Record<string, unknown>),
              workingArticleId,
              clusterId: groupIndex + 1,
              provisionalGroupId: group.id,
              ...(keyword.isPublished ? {
                siloId: group.suggestedSiloId,
                silo_id: group.suggestedSiloId,
                siloName: group.suggestedSiloName,
              } : {
                siloId: null,
                silo_id: null,
                siloName: null,
              }),
              computedSlug: keyword.slug_sugerido || toSlug(principalKeyword?.keyword || keyword.keyword),
              computedHierarquia: keyword.isPublished ? existingComputedHierarchy || existingHierarchy : null,
              hierarquia: keyword.isPublished ? existingHierarchy || existingComputedHierarchy : null,
              reviewRole: keyword.id === principalId
                ? "principal"
                : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria",
            };
          });
        });
        const reservedCandidates = architecture.siloCandidates.map(keyword => ({
          ...keyword,
          workingArticleId: null,
          clusterId: null,
          provisionalGroupId: null,
          siloId: null,
          silo_id: null,
          siloName: null,
          computedSlug: null,
          computedHierarquia: null,
          hierarquia: null,
          reviewRole: null,
        }));
        const mutationItems = [...regroupedArticles, ...reservedCandidates] as Array<Record<string, unknown>>;
        const regrouped = mergeScopedArticleProcessOutput({
          masterList: masterList as Array<Record<string, unknown> & { id: string }>,
          mutationKeywordIds: scope.selectedKeywordIds,
          mutationOutput: mutationItems as Array<Record<string, unknown> & { id: string }>,
        });
        const groups = [...preservedGroups, ...processedGroups];
        update({ message: `${scope.selectedArticleIds.length} artigo(s) selecionado(s) processado(s); ${reservedCandidates.length} candidata(s) reservada(s).`, current: 1, total: 1 });
        return { kind: "logical_grouping", groups, regrouped, mutationItems, mutationKeywordIds: scope.selectedKeywordIds, processedArticleIds: scope.selectedWorkingArticleIds, processedKeywordIds: scope.selectedKeywordIds, workspaceArticleCount: groups.length, siloCandidates: reservedCandidates };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a tarefa lógica.");
  };

  const formSilosWorkingCopy = async () => {
    if (workspaceMode !== "silos") {
      showNotification("error", "A formação da working copy dos Silos só pode começar na aba Silos.");
      return;
    }
    if (!selectedBrandId) {
      showNotification("error", "Selecione uma marca antes de formar a working copy dos Silos.");
      return;
    }
    const articleVersions = Object.values(acceptedArticleDnas).filter(version =>
      version.payload.brandId === selectedBrandId && effectiveVersionStatus(version.versionId, versionEvents) === "approved",
    );
    if (!articleVersions.length) {
      showNotification("error", "Confirme pelo menos um ArticleDNA antes de formar a working copy dos Silos.");
      return;
    }
    const result = formSiloWorkingCopies({
      brandId: selectedBrandId,
      articleVersions,
      existingSiloVersions: Object.values(acceptedSiloDnas),
      existingSiloPageVersions: Object.values(acceptedSiloPages),
      reservedCandidates: masterList
        .filter(keyword => keyword.siloCandidate?.status === "candidate")
        .map(keyword => ({ id: String(keyword.id), keyword: String(keyword.keyword), intent: keyword.intent || null, volume_search: keyword.volume_search ?? null, siloCandidate: keyword.siloCandidate })),
    });
    /**
     * A identidade é corrigida ANTES de qualquer escrita.
     *
     * `formSiloWorkingCopies` nomeia a proposta pelo conteúdo que ela reúne —
     * e o conteúdo não decide o endereço da estrutura. Persistir assim gravava
     * /cremes-skin como raiz de "Skin care para peles oleosas", e endereço
     * publicado não se troca depois.
     */
    const comIdentidade = result.workingCopies.map(copy => {
      const ref = siloWorkingCopyTerritoryRef(copy);
      const territorio = ref ? remoteTerritories.find(item => item.territoryRef === ref) : null;
      return territorio ? applySiloIdentityToProposal(copy, siloIdentityOf(territorio)) : copy;
    });
    setSiloWorkingCopies(comIdentidade);

    // CREATE REMOTO. A proposta só vira working copy de verdade depois que a
    // linha existe no servidor — e o sucesso é o readback, não o setState
    // acima. Uma proposta sem território resolvido não é criada: identidade
    // territorial não é inventada no browser.
    const created: string[] = [];
    const reconciled: string[] = [];
    const skipped: string[] = [];
    for (const copy of comIdentidade) {
      const territoryRef = siloWorkingCopyTerritoryRef(copy);
      if (!territoryRef) { skipped.push(copy.name); continue; }
      /**
       * A cópia remota que já existe é RECONCILIADA, não ignorada.
       *
       * Pular quando a linha existe deixava congelada a composição da
       * primeira formação: um Silo gravado com 3 dos seus 5 artigos ficava
       * assim para sempre, e consolidar dali criaria SiloDNA e SiloPage
       * descrevendo um Silo que não é o confirmado.
       *
       * O Pilar humano só cai se o artigo escolhido saiu da composição —
       * e nesse caso a queda é dita, não silenciosa.
       */
      const existente = remoteSiloWorkingCopies.find(item => item.workingCopy.territoryRef === territoryRef);
      if (existente) {
        if (siloWorkingCopyIsReadOnly(existente, consolidatedTerritoryRefs)) continue;
        const draft = draftSiloWorkingCopyFromProposal({ brandId: selectedBrandId, territoryRef, proposal: copy });
        const atuais = existente.workingCopy.articleRefs.map(reference => reference.articleId).slice().sort();
        const propostos = draft.articleRefs.map(reference => reference.articleId).slice().sort();
        // A comparação inclui a VERSÃO, não só quem está dentro.
        //
        // Um ArticleDNA sucedido depois da formação da cópia deixa a referência
        // descrevendo uma composição que não existe mais — e a consolidação
        // gravaria o Silo apontando para uma versão morta.
        const assinatura = (refs: readonly { articleId: string; articleDnaVersionId: string }[]) =>
          refs.map(reference => `${reference.articleId}@${reference.articleDnaVersionId}`).slice().sort().join("|");
        if (assinatura(existente.workingCopy.articleRefs) === assinatura(draft.articleRefs)) continue;
        const pilar = existente.workingCopy.pillarSelection;
        const pilarSobrevive = Boolean(pilar && propostos.includes(pilar.articleId));
        const atualizada = await persistRemoteWorkingCopy(existente, {
          name: draft.name,
          slug: draft.slug,
          existingSiloId: draft.existingSiloId,
          articleRefs: draft.articleRefs,
          pillarSuggestionArticleId: draft.pillarSuggestionArticleId,
          ...(pilarSobrevive ? {} : { pillarSelection: null }),
          supportArticleIds: existente.workingCopy.supportArticleIds.filter(articleId => propostos.includes(articleId)),
          reasons: draft.reasons,
          conflicts: draft.conflicts,
        });
        if (atualizada) {
          reconciled.push(pilar && !pilarSobrevive
            ? `${copy.name} (o Pilar decidido saiu da composição e voltou a ser decisão pendente)`
            : `${copy.name} (${atuais.length} → ${propostos.length} artigo(s))`);
        }
        continue;
      }
      try {
        const remote = await createRemoteSiloWorkingCopy({
          brandId: selectedBrandId,
          workingCopy: draftSiloWorkingCopyFromProposal({ brandId: selectedBrandId, territoryRef, proposal: copy }),
        });
        setRemoteSiloWorkingCopies(previous => [
          ...previous.filter(item => item.workingCopyRef !== remote.workingCopyRef),
          remote,
        ]);
        created.push(copy.name);
      } catch (error) {
        const classified = classifySiloWorkingCopyFailure(error);
        if (classified.reloadRemote) await reloadRemoteSiloWorkingCopies();
        showNotification("error", `${copy.name}: ${classified.message}`);
      }
    }
    if (created.length) {
      showNotification("success", `${created.length} working copy(s) de Silo criada(s) no servidor e confirmada(s) por readback.`);
    }
    if (reconciled.length) {
      showNotification("success", `${reconciled.length} working copy(s) reconciliada(s) com a composição do Silo confirmado: ${reconciled.join(", ")}.`);
    }
    if (skipped.length) {
      showNotification("error", `Sem silo confirmado, ${skipped.length} proposta(s) ficaram só locais: ${skipped.join(", ")}.`);
    }
    const blocked = comIdentidade.filter(copy => copy.source === "insufficient_architecture").length;
    showNotification("success", `${comIdentidade.length} working copy(s) de Silo formada(s) sem persistir SiloDNA/SiloPage.${blocked ? ` ${blocked} mantida(s) como insuficiente(s) para novo Silo.` : ""}`);
  };

  /**
   * Território de uma proposta local, lido dos ArticleDNAs que a compõem — a
   * proposta não carrega território próprio, e inventar um aqui criaria
   * identidade no browser.
   */
  const siloWorkingCopyTerritoryRef = (copy: SiloWorkingCopy | null): string | null =>
    proposalTerritoryRef(copy, acceptedArticleDnas);

  /** Territórios já consolidados: a WC deles é histórico. */
  const consolidatedTerritoryRefs = useMemo(() => consolidatedTerritoryRefsOf(remoteTerritories), [remoteTerritories]);

  /**
   * A LISTA QUE A TELA RENDERIZA. Remoto vence: enquanto não há linha remota
   * para o território, a proposta local aparece como proposta; a partir daí
   * ela some da autoridade e o que se vê é o snapshot do servidor.
   */
  const authoritativeSiloWorkingCopies = useMemo(() => resolveAuthoritativeSiloWorkingCopies({
    remote: remoteSiloWorkingCopies,
    proposals: siloWorkingCopies
      .map(proposal => ({ territoryRef: proposalTerritoryRef(proposal, acceptedArticleDnas), proposal }))
      .filter((entry): entry is { territoryRef: string; proposal: SiloWorkingCopy } => Boolean(entry.territoryRef)),
    consolidatedTerritoryRefs,
  }), [acceptedArticleDnas, consolidatedTerritoryRefs, remoteSiloWorkingCopies, siloWorkingCopies]);


  /** WC remota do território, quando existir. É ela que manda. */
  const remoteWorkingCopyFor = (territoryRef: string | null | undefined) =>
    territoryRef ? remoteSiloWorkingCopies.find(item => item.workingCopy.territoryRef === territoryRef) || null : null;

  /** Recarrega o remoto e devolve a lista nova. Usado após todo conflito. */
  const reloadRemoteSiloWorkingCopies = async () => {
    if (!selectedBrandId) return [];
    const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
    setRemoteSiloWorkingCopies(canonical.siloWorkingCopies);
    setRemoteTerritories(canonical.territories);
    setTerritorialSerpAssessments(canonical.territorialSerp.map(item => item.payload.assessment));
    setTerritorialSerpBaseHashes(new Map(canonical.territorialSerp.map(item => [item.questionId, item.payload.baseHash])));
    setRemoteArticleSerp(canonical.articleFormationSerp);
    setTerritorialAiProposals(canonical.territorialAi.map(item => item.payload.proposal));
    setTerritorialAiBaseHashes(new Map(canonical.territorialAi.map(item => [item.questionId, item.payload.baseHash])));
    return canonical.siloWorkingCopies;
  };

  /**
   * Escrita na WC remota com o lock DA CÓPIA CARREGADA.
   *
   * Falha não é normalizada: `STALE_WORKING_COPY` recarrega o remoto e informa
   * o conflito ao usuário — nunca reenvia com o lock novo, porque isso
   * aplicaria a edição por cima de uma decisão que ninguém viu.
   */
  const persistRemoteWorkingCopy = async (
    remote: CanonicalSiloWorkingCopy,
    patch: Partial<SiloWorkingCopyState>,
  ): Promise<CanonicalSiloWorkingCopy | null> => {
    if (!selectedBrandId) return null;
    try {
      const updated = await updateRemoteSiloWorkingCopy({
        brandId: selectedBrandId,
        workingCopyRef: remote.workingCopyRef,
        expectedLock: remote.lockVersion,
        // O servidor valida o ESTADO INTEIRO, não o delta: `SiloWorkingCopyStateSchema`
        // exige nome, slug, status de formação e o resto. Enviar só os campos
        // alterados fazia toda edição — Pilar, exclusão, recomposição — voltar como
        // "cópia de trabalho inválida" por falta de campos que ninguém pretendia mudar.
        workingCopy: { ...remote.workingCopy, ...patch },
      });
      // Sucesso é o readback remoto, não o estado de React.
      setRemoteSiloWorkingCopies(previous => previous.map(item =>
        item.workingCopyRef === updated.workingCopyRef ? updated : item));
      setSiloWorkingCopyConflict(null);
      return updated;
    } catch (error) {
      const classified = classifySiloWorkingCopyFailure(error);
      if (classified.reloadRemote) await reloadRemoteSiloWorkingCopies();
      setSiloWorkingCopyConflict(classified.outcome === "APPLIED" ? null : classified.message);
      showNotification("error", classified.message);
      return null;
    }
  };

  /**
   * Pilar. Quando existe WC remota, a decisão HUMANA vai para lá com ator,
   * momento, motivo e a composição vigente. Sem WC remota ainda, o clique só
   * move a proposta local — que não é decisão e não consolida nada.
   */
  /**
   * Exclusão de um Article da working copy. É decisão humana registrada com
   * ator, momento e motivo, e persistida no MESMO snapshot remoto que os
   * Suportes — um artigo excluído deixa de ser Suporte na mesma escrita.
   */
  const excludeWorkingCopyArticle = async (territoryRef: string, articleId: string, reason: string) => {
    const remote = remoteWorkingCopyFor(territoryRef);
    if (!remote) return showNotification("error", "Não há working copy remota para este silo.");
    if (siloWorkingCopyIsReadOnly(remote, consolidatedTerritoryRefs)) {
      return showNotification("error", "Este silo já foi consolidado; a working copy virou histórico.");
    }
    const actorUserId = session?.user?.id;
    if (!actorUserId) return showNotification("error", "Excluir um Article do Silo é decisão humana e exige sessão autenticada.");
    const exclusions = [
      ...remote.workingCopy.exclusions.filter(exclusion => exclusion.articleId !== articleId),
      humanExclusion({ articleId, actorUserId, decidedAt: new Date().toISOString(), reason }),
    ];
    const pillarArticleId = remote.workingCopy.pillarSelection?.articleId ?? null;
    const supportArticleIds = deriveSupportArticleIds({
      articleIds: remote.workingCopy.articleRefs.map(reference => reference.articleId),
      pillarArticleId,
      exclusions,
    });
    const updated = await persistRemoteWorkingCopy(remote, { exclusions, supportArticleIds });
    if (updated) showNotification("success", "Exclusão persistida na working copy remota.");
  };

  /**
   * A escolha do Pilar chega pelo Silo, não pelo id da proposta.
   *
   * O seletor da mesa entrega o territoryRef — a chave do Silo confirmado e
   * da linha remota. Procurar por `copy.id` não achava nada, a função caía no
   * ramo local, o `map` também não casava, e a decisão humana desaparecia sem
   * erro: o seletor voltava para "Sem Pilar decidido" e ninguém sabia por quê.
   */
  const chooseWorkingCopyPillar = async (territoryRef: string, articleId: string) => {
    const remote = remoteWorkingCopyFor(territoryRef);
    if (!remote) {
      // Sem linha remota a escolha fica na proposta local — pela mesma chave.
      setSiloWorkingCopies(previous => previous.map(item =>
        siloWorkingCopyTerritoryRef(item) === territoryRef ? chooseSiloWorkingCopyPillar(item, articleId) : item));
      return;
    }
    if (siloWorkingCopyIsReadOnly(remote, consolidatedTerritoryRefs)) {
      showNotification("error", "Este silo já foi consolidado; a working copy virou histórico.");
      return;
    }
    const actorUserId = session?.user?.id;
    if (!actorUserId) {
      showNotification("error", "A escolha do Pilar precisa de uma sessão autenticada: ela é registrada como decisão humana.");
      return;
    }
    const articleIds = remote.workingCopy.articleRefs.map(reference => reference.articleId);
    const pillarSelection = humanPillarSelection({
      articleId,
      actorUserId,
      decidedAt: new Date().toISOString(),
      reason: "Pilar escolhido manualmente na working copy de Silo.",
      currentArticleIds: articleIds,
    });
    // Suportes acompanham a decisão no MESMO snapshot: o Pilar deixa de ser
    // Suporte e o antigo Pilar volta a sê-lo, sem escrita separada.
    const supportArticleIds = deriveSupportArticleIds({
      articleIds,
      pillarArticleId: articleId,
      exclusions: remote.workingCopy.exclusions,
    });
    const updated = await persistRemoteWorkingCopy(remote, { pillarSelection, supportArticleIds });
    if (updated) showNotification("success", "Pilar humano persistido na working copy remota.");
  };

  const handlePipelineStep = async (label: string) => {
    if (label === "Gerar DNA dos Artigos") return handleGenerateArticleDnas();
    if (label === "Gerar DNA dos Silos") return handleGenerateSiloDnas();
  };

  const selectedStrategicGroups = (): ProvisionalArticleGroup[] => articlesList.filter(article => selectedArticleIds.has(article.id)).map(article => {
    const entityId = article.mainKeywordObj?.provisionalGroupId || article.briefingId;
    const base = provisionalGroups.find(group => group.id === entityId);
    const keywords = masterList.filter(keyword => resolveWorkingArticleId(keyword) === article.workingArticleId);
    const principalId = article.mainKeywordObj?.id || base?.principalSuggestion.keywordId || keywords[0]?.id;
    if (!base || !principalId || !keywords.length) return null;
    const roles = Object.fromEntries(keywords.map(keyword => [keyword.id,
      keyword.id === principalId ? "principal" : manualKeywordRoleFor(keyword)]));
    const principal = keywords.find(keyword => keyword.id === principalId) || keywords[0];
    const canReadSiloProjection = workspaceMode === "silos" || article.isPublished;
    return { ...base, keywordIds: keywords.map(keyword => keyword.id), keywords, suggestedSiloId: canReadSiloProjection && article.siloId ? String(article.siloId) : null,
      suggestedSiloName: canReadSiloProjection ? article.siloName || null : null, suggestedHierarchy: base.suggestedHierarchy || (article.hierarquia.startsWith("Pilar") ? "Pilar" : article.hierarquia.includes("Reforco") ? "Reforco Narrativo" : "Suporte"),
      principalSuggestion: { ...base.principalSuggestion, keywordId: principalId }, roles,
      ...(principal?.architectureStatus || base.architectureStatus ? { architectureStatus: principal?.architectureStatus || base.architectureStatus } : {}),
      ...(principal?.kgrIdentity || base.kgrIdentity ? { kgrIdentity: principal?.kgrIdentity || base.kgrIdentity } : {}),
    } as ProvisionalArticleGroup;
  }).filter((group): group is ProvisionalArticleGroup => Boolean(group))
    // Um Article por execução: grupo repetido criaria duas avaliações vigentes.
    .filter((group, index, all) => all.findIndex(candidate => (candidate.publishedAnchorId || candidate.id) === (group.publishedAnchorId || group.id)) === index);

  const callStrategicApiEnvelope = async <T,>(path: string, body: unknown, operation?: ArchitectFunctionalOperation): Promise<{ data: T; diagnostic: Record<string, unknown> | null }> => {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        const diagnostic = payload.diagnostic && typeof payload.diagnostic === "object" ? payload.diagnostic as Record<string, unknown> : null;
        const stage = typeof diagnostic?.failureStage === "string" ? diagnostic.failureStage : null;
        const code = typeof payload.code === "string" ? payload.code : null;
        const detail = typeof payload.error === "string" ? payload.error : null;
        const suffix = [stage ? `estágio ${stage}` : null, `HTTP ${response.status}`, code ? `código ${code}` : null].filter(Boolean).join(" · ");
        const message = operation === "ai" ? aiReviewErrorMessage(stage, architectFunctionalErrorMessage("ai")) : operation ? architectFunctionalErrorMessage(operation) : "Falha no serviço estratégico.";
        throw new ArchitectStrategicApiError(`${message}${suffix ? ` Diagnóstico: ${suffix}.` : ""}${detail ? ` ${detail}` : ""}`);
      }
      return {
        data: payload.data as T,
        diagnostic: payload.diagnostic && typeof payload.diagnostic === "object" ? payload.diagnostic as Record<string, unknown> : null,
      };
    } catch (error) {
      if (error instanceof ArchitectStrategicApiError) throw error;
      if (operation) throw new Error(architectFunctionalErrorMessage(operation));
      throw error;
    }
  };

  const callStrategicApi = async <T,>(path: string, body: unknown, operation?: ArchitectFunctionalOperation): Promise<T> =>
    (await callStrategicApiEnvelope<T>(path, body, operation)).data;

  const activeBrand = brands.find(brand => brand.id === selectedBrandId);
  const brandContext = activeBrand ? {
    id: activeBrand.id,
    name: activeBrand.nome,
    niche: activeBrand.nicho || null,
    guidelines: activeBrand.dna_diretrizes || null,
  } : undefined;
  const reviewSilosWithIA = async () => {
    if (!brandContext || !siloWorkingCopies.length) {
      showNotification("error", "Forme a working copy dos Silos antes de solicitar a revisão com IA.");
      return;
    }
    setSiloReviewBusy(true);
    try {
      const articleIds = [...new Set(siloWorkingCopies.flatMap(copy => copy.articleReferences.map(reference => reference.articleId)))];
      const articleVersions = articleIds.map(articleId => acceptedArticleDnas[articleId]).filter((version): version is VersionEnvelope<ArticleDNA> => Boolean(version));
      if (articleVersions.length !== articleIds.length) throw new Error("A working copy referencia ArticleDNA ausente; nenhuma proposta foi aplicada.");
      const result = await callStrategicApi<{ proposal: SiloReviewProposal }>("/api/arquiteto/silo-review", {
        brand: brandContext,
        silos: siloWorkingCopies.map(copy => ({
          id: copy.id, name: copy.name, slug: copy.slug,
          articleIds: copy.articleReferences.map(reference => reference.articleId),
          pillarArticleId: copy.pillarCandidateArticleId,
          supportArticleIds: copy.supportArticleIds,
          publishedProtection: { protected: copy.publishedProtection.protected, protectedFields: copy.publishedProtection.protectedFields },
          reasons: copy.reasons, conflicts: copy.conflicts,
        })),
        articleDnaFacts: articleVersions.map(version => ({ versionId: version.versionId, contentHash: version.contentHash, payload: version.payload })),
        serpGuidelines: collectSiloSerpGuidelines(articleVersions, serpAssessments),
      }, "ai");
      const proposal = SiloReviewProposalSchema.parse(result.proposal);
      setPendingSiloReview(proposal);
      setMapAiSiloReviewSnapshot(proposal);
      setMapAiArticlesSnapshot(previous => previous || architectureMapSnapshots.current.articles);
      setMapAiSilosSnapshot(previous => previous || architectureMapSnapshots.current.silos);
      setRejectedSiloReviewIds(new Set());
      showNotification("success", `${proposal.operations.length} proposta(s) de arquitetura dos Silos pronta(s) para revisão humana. Nada foi aplicado.`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível revisar os Silos com IA.");
    } finally {
      setSiloReviewBusy(false);
    }
  };
  const toggleRejectedSiloReview = (operationId: string) => {
    setRejectedSiloReviewIds(previous => {
      const next = new Set(previous);
      if (next.has(operationId)) next.delete(operationId); else next.add(operationId);
      return next;
    });
  };
  const applyPendingSiloReview = () => {
    if (!pendingSiloReview) return;
    const result = applySiloAiProposal(siloWorkingCopies, pendingSiloReview, [...rejectedSiloReviewIds]);
    if (!result.applied.length) {
      showNotification("error", result.rejected[0]?.reason || "Nenhuma proposta de Silo pôde ser aplicada.");
      return;
    }
    setSiloWorkingCopyUndo(siloWorkingCopies);
    setSiloWorkingCopies(result.workingCopies);
    setPendingSiloReview(null);
    setRejectedSiloReviewIds(new Set());
    showNotification("success", `${result.applied.length} proposta(s) aplicadas somente à working copy. ${result.rejected.length ? `${result.rejected.length} rejeitada(s). ` : ""}A confirmação humana ainda é necessária.`);
  };
  const undoSiloReview = () => {
    if (!siloWorkingCopyUndo) return;
    setSiloWorkingCopies(siloWorkingCopyUndo);
    setSiloWorkingCopyUndo(null);
    showNotification("success", "Última aplicação da IA desfeita na working copy. Nenhuma versão consolidada foi alterada.");
  };
  /**
   * CONSOLIDAÇÃO — caminho canônico ÚNICO.
   *
   * Só `POST /api/arquiteto/silo-consolidation`, que chama
   * `persist_silo_from_working_copy_atomic`. O caminho legado do par
   * (`/api/arquiteto/silo-pair`) é draft-only e não finaliza nada.
   *
   * O browser NÃO é autoridade de nenhum gate: readiness, confirmação humana,
   * binding semântico, validação de ArticleDNA e de Território, identidade
   * publicada e proveniência são resolvidos server-side, sobre o snapshot
   * REMOTO. Aqui só se monta o envelope e se despacha.
   */
  const consolidateSilos = async () => {
    if (!selectedBrandId) return showNotification("error", "Selecione uma marca antes de consolidar.");
    if (pendingSiloReview) return showNotification("error", "Revise, aplique ou descarte a proposta da IA antes de consolidar.");
    const actorUserId = session?.user?.id;
    if (!actorUserId) return showNotification("error", "A consolidação é decisão humana e exige sessão autenticada.");

    // A autoridade é a WC REMOTA. Sem linha remota não há o que consolidar:
    // consolidar a partir da proposta local persistiria uma arquitetura que
    // ninguém decidiu no servidor.
    const consolidable = remoteSiloWorkingCopies
      .filter(remote => !siloWorkingCopyIsReadOnly(remote, consolidatedTerritoryRefs));
    if (!consolidable.length) {
      return showNotification("error", "Não há working copy de Silo remota disponível para consolidar.");
    }

    setSiloConsolidating(true);
    try {
      for (const remote of consolidable) {
        const territoryRef = remote.workingCopy.territoryRef;
        const territory = remoteTerritories.find(item => item.territoryRef === territoryRef);
        if (!territory) throw new Error(`Silo ${territoryRef} não está no snapshot remoto; recarregue o workspace.`);
        const pillarSelection = remote.workingCopy.pillarSelection;
        if (!pillarSelection) throw new Error(`O Pilar de ${remote.workingCopy.name} ainda não foi decidido por um humano.`);

        // Retry reusa a operação congelada. Reconstruir o envelope geraria
        // versionId/createdAt novos e a RPC não reconheceria o replay.
        const inFlight = pendingConsolidationRef.current;
        let operation = inFlight
          && inFlight.territoryRef === territoryRef
          && inFlight.workingCopyExpectedLock === remote.lockVersion
          && inFlight.state !== "settled"
          ? inFlight
          : null;

        if (!operation) {
          const copy = siloWorkingCopies.find(item => siloWorkingCopyTerritoryRef(item) === territoryRef) || null;
          if (!copy) throw new Error(`A proposta local de ${remote.workingCopy.name} não está carregada; recarregue o workspace.`);
          const articleVersions = remote.workingCopy.articleRefs
            .map(reference => acceptedArticleDnas[reference.articleId])
            .filter((version): version is VersionEnvelope<ArticleDNA> => Boolean(version));
          const existingSiloDna = remote.workingCopy.existingSiloId ? acceptedSiloDnas[remote.workingCopy.existingSiloId] : undefined;
          const existingSiloPage = Object.values(acceptedSiloPages).find(version => version.payload.siloId === remote.workingCopy.existingSiloId);
          const articleStatuses = Object.fromEntries(articleVersions.map(version => [version.payload.articleId, effectiveVersionStatus(version.versionId, versionEvents) || "unknown"]));
          // A SiloPage ADOTA a identidade publicada em vez de criar outra.
          // Sem passar isto, um Silo com página no ar ganhava endereço novo e
          // o patrimônio ficava órfão.
          const identidade = siloIdentityOf(territory);
          /**
           * A decisão humana está no REMOTO; a proposta local não a conhece.
           *
           * O portão de consolidação lê `copy`: sem trazer o Pilar decidido
           * para cá, ele recusava dizendo que faltava Pilar — exatamente a
           * decisão que o humano tinha acabado de registrar.
           */
          const comPilar = chooseSiloWorkingCopyPillar(copy, pillarSelection.articleId);

          /*
           * A IDENTIDADE PUBLICÁVEL VEM DO CATÁLOGO QUE JÁ FOI VARRIDO.
           *
           * O construtor determinístico emitia `canonical: null` e verificação
           * `not_checked`, e o gate da SiloPage cobra exatamente esses dois
           * campos. As três páginas ficavam consolidadas e não aprováveis — não
           * por falta de decisão humana, mas porque o artefato nunca recebeu o
           * que a varredura do site já tinha observado.
           *
           * Nada aqui vai à rede: é transporte de fato existente.
           */
          const slugDaPagina = String(identidade.slug || "").replace(/^\/+/, "");
          const entradaCatalogo = (brandSiteSnapshot?.catalog || [])
            .find(entrada => String(entrada.normalizedUrl || "").replace(/^[^/]*\//, "") === slugDaPagina) || null;
          const identidadePublicavel = resolveSiloPagePublicationIdentity({
            slug: slugDaPagina,
            brandSiteUrl: brands.find(item => item.id === selectedBrandId)?.site_url ?? null,
            observation: entradaCatalogo
              ? {
                verificationStatus: entradaCatalogo.verificationStatus,
                resolvedUrl: entradaCatalogo.resolvedUrl ?? null,
                declaredCanonicalUrl: entradaCatalogo.declaredCanonicalUrl ?? null,
                normalizedCanonicalUrl: entradaCatalogo.normalizedCanonicalUrl ?? null,
                lastVerifiedAt: entradaCatalogo.lastSeenAt ?? null,
              }
              : null,
            current: existingSiloPage
              ? {
                publicationStatus: existingSiloPage.payload.publicationStatus,
                publishedUrl: existingSiloPage.payload.publishedUrl,
                canonical: existingSiloPage.payload.canonical,
              }
              : null,
          });

          const prepared = await createSiloConsolidationVersions(
            {
              copy: { ...comPilar, name: identidade.name, slug: identidade.slug, siloPage: { ...comPilar.siloPage, slug: identidade.slug } },
              // Silo confirmado por humano: profundidade ausente vira dívida
              // registrada, não recusa.
              humanConfirmedSilo: siloIsHumanDecided(territory.territory.lifecycleStatus),
              // De qual estado da cópia esta consolidação nasceu.
              workingCopy: { workingCopyRef: remote.workingCopyRef, lockVersion: remote.lockVersion },
              // A estrutura do SiloDNA espelha o Silo confirmado: entidade,
              // intenção macro, fronteira e narrativa vêm da decisão humana,
              // não dos artigos reunidos.
              territory: {
                territoryRef,
                centralEntity: territory.territory.centralEntity,
                macroIntent: territory.territory.macroIntent,
                boundary: territory.territory.boundary,
                narrative: territory.territory.narrative,
              },
              articleVersions, existingSiloDna, existingSiloPage, articleStatuses, pendingAiOperations: 0, serpAssessments,
              resolvedIdentity: {
                canonical: identidadePublicavel.canonical,
                publicationStatus: identidadePublicavel.publicationStatus,
                publishedUrl: identidadePublicavel.publishedUrl,
                publicationVerification: identidadePublicavel.publicationVerification,
              },
              publishedIdentity: identidade.publishedSlug
                ? {
                  publishedSlug: identidade.publishedSlug,
                  publishedUrl: absolutePublishedUrl(territory.territory.publishedStructureRef?.normalizedUrl),
                  publishedCanonical: identidade.publishedCanonical,
                  publishedStructureRef: territory.territory.publishedStructureRef ?? null,
                }
                : null,
            },
            actorUserId,
          );
          operation = openSiloConsolidationOperation({
            brandId: selectedBrandId,
            action: existingSiloDna || existingSiloPage ? "edit" : "create",
            territoryRef,
            territoryExpectedLock: territory.lockVersion,
            workingCopyExpectedLock: remote.lockVersion,
            siloDna: prepared.siloDna,
            siloPage: prepared.siloPage,
            /*
             * CONFIRMAR ENCERRA A FASE — E FASE ENCERRADA NÃO DEIXA ARTEFATO
             * PENDURADO.
             *
             * SiloDNA e SiloPage continuam tendo gates distintos: a arquitetura
             * e a página publicável são perguntas diferentes, e o gate próprio
             * da SiloPage segue conferindo slug, canonical, estrutura e
             * composição. O que muda é quem responde: nascer "proposta" e
             * esperar um segundo clique que a jornada nunca pedia deixava as
             * três SiloPages em `proposed` para sempre, e a fase seguinte
             * herdava um Silo pela metade.
             *
             * O ato humano de confirmar a arquitetura É a decisão sobre a
             * página que ela materializa. Uma decisão, dois artefatos — não
             * uma decisão valendo por duas: a decisão abaixo é própria da
             * página, carrega a versão e o hash dela, e o gate a recusa se a
             * estrutura não estiver completa.
             */
            statuses: { siloDna: "approved", siloPage: "approved" },
            decision: {
              actorUserId,
              decidedAt: new Date().toISOString(),
              reason: "Consolidação humana da arquitetura territorial do Silo.",
              territoryRef,
              pillarArticleId: pillarSelection.articleId,
              supportArticleIds: remote.workingCopy.supportArticleIds,
              excludedArticleIds: remote.workingCopy.exclusions.map(exclusion => exclusion.articleId),
              publishedIdentityResolved: false,
            },
            // A decisão é DA PÁGINA: versão e hash são os dela, e o SiloDNA
            // pareado entra para que aprovar sobre uma arquitetura e persistir
            // outra seja recusado no servidor.
            siloPageApproval: {
              actorUserId,
              decidedAt: new Date().toISOString(),
              reason: "Confirmação humana da fase Silos: a página do Silo é aprovada junto com a arquitetura que ela materializa.",
              scope: "silo_page_approval",
              siloPageId: prepared.siloPage.payload.siloPageId,
              siloPageVersionId: prepared.siloPage.versionId,
              siloPageContentHash: prepared.siloPage.contentHash,
              siloDnaVersionId: prepared.siloDna.versionId,
              territoryRef,
            },
          });
        }

        pendingConsolidationRef.current = registerSiloConsolidationAttempt(operation);
        try {
          const persisted = await consolidateRemoteSiloFromWorkingCopy(
            siloConsolidationRequestBody(pendingConsolidationRef.current),
          );
          // Só o readback encerra a operação.
          const canonicalDna = VersionedSiloDNASchema.parse(persisted.siloDna) as VersionEnvelope<SiloDNA>;
          const canonicalPage = VersionedSiloPageSchema.parse(persisted.siloPage) as VersionEnvelope<SiloPage>;
          setAcceptedSiloDnas(previous => ({ ...previous, [canonicalDna.payload.siloId]: canonicalDna }));
          setAcceptedSiloPages(previous => ({ ...previous, [canonicalPage.payload.siloPageId]: canonicalPage }));
          addVersionEvents([
            createStatusEvent(canonicalDna.versionId, "approved", actorUserId, "SiloDNA consolidado por confirmação humana."),
            createStatusEvent(canonicalPage.versionId, "approved", actorUserId, "SiloPage aprovada no mesmo ato humano que confirmou a arquitetura, pelo gate próprio da página."),
          ]);
          pendingConsolidationRef.current = null;
        } catch (error) {
          // A operação NÃO é descartada: o servidor pode ter commitado, e um
          // envelope novo viraria escrita dupla. Ela fica guardada para o retry.
          pendingConsolidationRef.current = markSiloConsolidationIndeterminate(
            pendingConsolidationRef.current!,
            error instanceof Error ? error.message : "falha sem resposta conclusiva",
          );
          throw error;
        }
      }
      await reloadRemoteSiloWorkingCopies();
      setSiloWorkingCopies([]);
      setSiloWorkingCopyUndo(null);
      showNotification("success", "Silos consolidados pelo caminho canônico. A SiloPage permanece proposta: a aprovação dela é decisão própria.");
    } catch (error) {
      const classified = classifySiloWorkingCopyFailure(error);
      if (classified.reloadRemote) await reloadRemoteSiloWorkingCopies();
      showNotification("error", classified.message);
    } finally {
      setSiloConsolidating(false);
    }
  };
  const articleEntityIdFor = (article: (typeof articlesList)[number]) => article.isPublished
    ? article.mainKeywordObj?.id
    : article.mainKeywordObj?.provisionalGroupId || article.briefingId;
  // Mensagens humanas nomeiam o artigo, não o identificador interno.
  const articleLabelFor = (articleId: string) => {
    const article = articlesList.find(candidate => articleEntityIdFor(candidate) === articleId);
    return article?.mainKeywordObj?.keyword || article?.slug || articleId;
  };
  const articleSerpIdentityFor = (article: (typeof articlesList)[number]) => {
    const articleId = articleEntityIdFor(article);
    const dna = articleId ? acceptedArticleDnas[articleId] : undefined;
    const principalReference = dna?.payload.keywordReferences.find(reference => reference.keywordId === article.mainKeywordObj?.id);
    return resolveArticleSerpIdentityContext({
      published: article.isPublished,
      principalKeywordId: article.mainKeywordObj?.id || dna?.payload.principalKeywordId || "",
      primaryKeywordPolicy: dna?.payload.primaryKeywordPolicy || article.mainKeywordObj?.primaryKeywordPolicy,
      keywordUrlRelation: principalReference?.keywordUrlRelation || article.mainKeywordObj?.keywordUrlRelation,
      architectureStatus: dna?.payload.architectureStatus || article.mainKeywordObj?.architectureStatus,
      kgrIdentity: dna?.payload.kgrIdentity || article.mainKeywordObj?.kgrIdentity,
      slug: dna?.payload.suggestedSlug || article.mainKeywordObj?.computedSlug || article.mainKeywordObj?.slug_sugerido || article.slug,
    });
  };
  const latestSerpAssessmentFor = (articleId: string | null | undefined) => {
    if (!articleId) return undefined;
    return latestActiveSerpFormationAssessment(serpAssessments, selectedBrandId || "", articleId);
  };
  /**
   * Decisão KGR do artigo. Projeta somente o contrato canônico já existente:
   * a aplicabilidade recebida em cada KeywordDNA nunca vira decisão do artigo.
   */
  const articleKgrDecisionFor = (article: (typeof articlesList)[number]) => {
    const articleId = articleEntityIdFor(article);
    const dna = articleId ? acceptedArticleDnas[articleId] : undefined;
    return readArticleKgrDecision({
      kgrIdentity: dna?.payload.kgrIdentity || article.mainKeywordObj?.kgrIdentity,
      principal: article.mainKeywordObj,
      principalKeywordId: article.mainKeywordObj?.id,
      supports: article.supportKeywords,
    });
  };
  /**
   * A EVIDÊNCIA QUE FECHA AS CLASSIFICAÇÕES.
   *
   * Nada aqui é novo: intenção e funil vêm da `analise_semantica` que o
   * Minerador já entrega, o KGR vem do read-model canônico do artigo, e a
   * intenção observada vem do parecer da SERP vigente. O que este bloco faz é
   * REUNIR isso num único retrato para que a conclusão não deixe campo aberto.
   *
   * Nenhum score novo, nenhuma métrica recalculada.
   */
  const classificationEvidenceFor = useCallback((input: {
    principalKeywordId: string;
    keywordIds: readonly string[];
    serpInterpretation: { observedIntent: string } | null;
    serpResolved: boolean;
    kgr: ReturnType<typeof readArticleKgrDecision>;
    isPublished: boolean;
    principalProtected: boolean;
  }): ClassificationEvidence => {
    const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
    const semanticaDe = (keywordId: string) => {
      const keyword = masterList.find(item => String(item.id) === keywordId);
      const semantic = (keyword?.analise_semantica || {}) as Record<string, unknown>;
      return {
        intent: texto(semantic.intencao_principal) || texto(keyword?.intent),
        funnel: texto(semantic.funil) || texto(semantic.funnel),
      };
    };

    const principal = semanticaDe(input.principalKeywordId);
    const secundarias = input.keywordIds
      .filter(id => id !== input.principalKeywordId)
      .map(semanticaDe);

    // Conflito de compatibilidade é divergência de intenção declarada em
    // relação à Principal — a mesma leitura que o resumo já fazia.
    const avaliadas = secundarias.filter(item => item.intent).length;
    const conflitos = principal.intent
      ? secundarias.filter(item => item.intent && item.intent !== principal.intent).length
      : 0;

    const observada = input.serpInterpretation?.observedIntent ?? null;
    return {
      principalIntent: principal.intent,
      compositionIntents: secundarias.map(item => item.intent),
      serpObservedIntent: observada === "indefinido" ? null : observada,
      serpMixedIntent: observada === "misto",
      serpResolved: input.serpResolved,
      principalFunnel: principal.funnel,
      compositionFunnels: secundarias.map(item => item.funnel),
      principalKgrScore: input.kgr.principalKgrScore,
      principalKgrApplicability: input.kgr.principalApplicability,
      fullKgr: input.kgr.fullKgr,
      humanKgrDecision: input.kgr.source === "HUMAN_DECISION" && (input.kgr.decision === "YES" || input.kgr.decision === "NO")
        ? input.kgr.decision
        : null,
      awaitingHumanKgrDecision: input.kgr.requiresHumanDecision,
      compatibilityConflicts: conflitos,
      compatibilityEvaluated: avaliadas,
      isPublished: input.isPublished,
      principalProtected: input.principalProtected,
    };
  }, [masterList]);

  /**
   * A CLASSIFICAÇÃO QUE A TELA MOSTRA — uma leitura, não duas.
   *
   * Quando o ArticleDNA aprovado já traz o retrato fechado, é ELE que aparece:
   * a tela não recalcula por cima do que o humano aprovou. Enquanto o artigo
   * ainda é candidato, a resolução roda ao vivo sobre a evidência corrente —
   * e mesmo aí devolve terminal, nunca "Pendente".
   */
  const articleClassificationFor = (article: (typeof articlesList)[number]) => {
    const { version } = articleDnaEntryFor({ articleId: articleEntityIdFor(article), candidateRef: article.candidateRef });
    const gravada = version?.payload.classification;
    if (gravada) return { classification: gravada, canonical: true };

    const principalId = article.mainKeywordObj ? String(article.mainKeywordObj.id) : "";
    const registro = article.candidateRef
      ? remoteArticleSerp.find(item => item.candidateRef === article.candidateRef)?.payload
      : undefined;
    const gate = article.candidateRef ? articleSerpGates.get(article.candidateRef) : undefined;
    return {
      canonical: false,
      classification: resolveArticleClassification(classificationEvidenceFor({
        principalKeywordId: principalId,
        keywordIds: [principalId, ...article.supportKeywords.map(item => String(item.id))].filter(Boolean),
        serpInterpretation: registro?.interpretation ?? null,
        serpResolved: serpWasExecutedFor(gate?.state || "missing"),
        kgr: articleKgrDecisionFor(article),
        isPublished: Boolean(article.isPublished),
        principalProtected: article.mainKeywordObj?.primaryKeywordPolicy === "locked",
      })),
    };
  };

  const handleArticleKgrDecision = async (article: (typeof articlesList)[number], decision: "YES" | "NO") => {
    const principal = article.mainKeywordObj;
    if (!principal || !selectedBrandId) return showNotification("error", "A Principal atual é necessária para registrar a decisão KGR.");
    const readModel = articleKgrDecisionFor(article);
    if (!readModel.requiresHumanDecision) return showNotification("error", "A decisão humana não se aplica ao KGR atual da Principal.");
    const persisted = await persistWorkingCopyAssignments([{ ...principal, articleKgrDecision: decision }]);
    if (!persisted) return;
    setProvisionalGroups(describeAssignedGroups(masterListRef.current));
    showNotification("success", `KGR do artigo registrado como ${decision === "YES" ? "Sim" : "Não"} na cópia de trabalho canônica.`);
  };

  /**
   * Veredito da SERP de formação: compatível, inconclusivo ou divergente.
   * Evidência insuficiente nunca vira conflito bloqueante.
   */
  const articleSerpVerdictFor = (article: (typeof articlesList)[number]) => {
    const articleId = articleEntityIdFor(article);
    const assessment = latestSerpAssessmentFor(articleId);
    const keywords = [article.mainKeywordObj, ...article.supportKeywords]
      .filter((keyword): keyword is NonNullable<typeof article.mainKeywordObj> => Boolean(keyword));
    if (!assessment) {
      return resolveSerpFormationVerdict({ hasAssessment: false, evidencePriority: "insuficiente", keywordCount: keywords.length, observations: [] });
    }
    const observations = (assessment.formationEvidence?.keywordObservations || []).map<SerpFormationObservationInput>(observation => {
      const keyword = keywords.find(item => String(item.id) === String(observation.keywordId));
      const recommendation = assessment.recommendations.find(item => item.keywordId === observation.keywordId);
      const reference = assessment.keywordDnaReferences.find(item => item.keywordId === observation.keywordId);
      return {
        keywordId: String(observation.keywordId),
        keyword: keyword?.keyword || observation.keywordId,
        currentRole: recommendation?.currentRole || (String(article.mainKeywordObj?.id) === String(observation.keywordId) ? "principal" : "secundaria"),
        upstreamIntent: reference?.payload.searchIntent || reference?.payload.originalIntentLabel || keyword?.intent || null,
        observedIntent: observation.observedIntent,
        compatibility: observation.compatibility,
        overlap: observation.overlap,
        dominantPageType: observation.dominantPageType,
        competition: observation.competition,
        conflict: observation.conflict,
        insufficientEvidence: observation.insufficientEvidence,
        likelyCannibalization: observation.likelyCannibalization,
        needsSeparation: observation.needsSeparation,
        principalPossiblyInadequate: observation.principalPossiblyInadequate,
        decisionStatus: recommendation?.decision.status || "pending",
        recommendationAction: recommendation?.action || null,
        recommendationReason: recommendation?.reason || null,
      };
    });
    return resolveSerpFormationVerdict({
      hasAssessment: true,
      evidencePriority: resolveSerpEvidencePriority(assessment).priority,
      keywordCount: keywords.length,
      observations,
    });
  };
  /** Checklist de fechamento do artigo: toda decisão obrigatória em um lugar. */
  const articleReviewChecklistFor = (
    article: (typeof articlesList)[number],
    kgr: ReturnType<typeof readArticleKgrDecision>,
    unitClassification: EditorialUnitClassification | null,
  ) => {
    const articleId = articleEntityIdFor(article);
    const version = articleDnaEntryFor({ articleId, candidateRef: article.candidateRef }).version;
    const entityIds = new Set([articleId, article.id, article.mainKeywordObj?.provisionalGroupId, version?.payload.articleId]
      .filter((value): value is string => Boolean(value)));
    const unresolvedConflicts = articleConflictsFor({ candidateRef: article.candidateRef, entityIds: [...entityIds] });
    const proposals = [
      ...(pendingKeywordReview?.review.decisions || [])
        .filter(decision => [article.mainKeywordObj, ...article.supportKeywords].some(keyword => String(keyword?.id) === String(decision.keywordId)))
        .filter(decision => {
          const keyword = [article.mainKeywordObj, ...article.supportKeywords].find(item => String(item?.id) === String(decision.keywordId));
          const conflictCount = (pendingKeywordReview?.review.conflicts || []).filter(conflict => conflict.entityIds.includes(decision.keywordId)).length;
          return !isNoOpKeywordArticleDecision(decision, keyword?.reviewRole, conflictCount);
        })
        .map(decision => ({ id: `pending:${decision.keywordId}`, title: decision.justification, resolved: false })),
      ...article.aiReviewAnnotations
        .filter(annotation => annotation.structuralChange !== false)
        .map(annotation => ({ id: annotation.id, title: annotation.summary, resolved: annotation.reviewState !== "pending_fine_review" })),
    ];
    return buildArticleReviewChecklist({
      hasArticleDna: Boolean(version),
      approved: Boolean(version && effectiveVersionStatus(version.versionId, versionEvents) === "approved"),
      // A frase precisa nomear a versão: "v5 aprovada" e "revisão atual"
      // são tempos diferentes, e o rótulo é o que os separa na tela.
      approvedVersionLabel: version ? `v${version.versionNumber}` : null,
      kgr: {
        label: kgr.label,
        requiresHumanDecision: kgr.requiresHumanDecision,
        fullKgr: kgr.fullKgr,
        principalKeyword: article.mainKeywordObj?.keyword || null,
        principalScoreLabel: kgr.principalKgrScore?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) ?? "—",
      },
      unitType: {
        defined: unitClassification?.status === "human_confirmed",
        label: unitClassification ? EDITORIAL_UNIT_LABELS[unitClassification.type] : null,
      },
      serp: articleSerpVerdictFor(article),
      aiProposals: proposals,
      unresolvedConflicts,
    });
  };
  const articleKgrSerpReadoutFor = (article: (typeof articlesList)[number]) => {
    const assessment = latestSerpAssessmentFor(articleEntityIdFor(article));
    const principalKeywordId = article.mainKeywordObj?.id;
    if (!assessment || !principalKeywordId) return null;
    const observation = assessment.formationEvidence?.keywordObservations.find(item => item.keywordId === principalKeywordId);
    return resolveArticleKgrSerpReadout({
      decision: articleKgrDecisionFor(article),
      competitionLevel: assessment.competitionLevel,
      intentCompatibility: assessment.intentCompatibility,
      evidencePriority: resolveSerpEvidencePriority(assessment).priority,
      principalObservation: observation
        ? {
          competition: observation.competition,
          compatibility: observation.compatibility,
          conflict: observation.conflict,
          insufficientEvidence: observation.insufficientEvidence,
          likelyCannibalization: observation.likelyCannibalization,
        }
        : null,
    });
  };
  /**
   * Derivador único de "Pronto para Silos". Silo não é pré-condição do artigo:
   * é a etapa seguinte, liberada só quando a fase Artigos fecha.
   */
  const articleSiloReadinessFor = (
    article: (typeof articlesList)[number],
    process: ArticleProcessReadModel,
    kgr: ReturnType<typeof readArticleKgrDecision>,
  ) => {
    const articleId = articleEntityIdFor(article);
    const version = articleDnaEntryFor({ articleId, candidateRef: article.candidateRef }).version;
    const entityIds = new Set([articleId, article.id, article.mainKeywordObj?.provisionalGroupId, version?.payload.articleId]
      .filter((value): value is string => Boolean(value)));
    const unresolvedConflicts = articleConflictsFor({ candidateRef: article.candidateRef, entityIds: [...entityIds] }).length;
    return resolveArticleSiloReadiness({
      hasArticleDna: Boolean(version),
      siloAssigned: Boolean(article.siloId && acceptedSiloDnas[String(article.siloId)]),
      reviewPending: process.review.state === "PENDING" || process.review.state === "IN_REVIEW",
      unresolvedConflicts,
      approved: Boolean(version && effectiveVersionStatus(version.versionId, versionEvents) === "approved"),
      kgrDecisionPending: kgr.requiresHumanDecision,
    });
  };
  /** READY_FOR_RADAR é distinto de READY_FOR_SILOS: exige Silos e Links fechados. */
  const articleRadarReadinessFor = (article: (typeof articlesList)[number], siloReadiness: ReturnType<typeof resolveArticleSiloReadiness>) => {
    const articleId = articleEntityIdFor(article);
    const version = articleDnaEntryFor({ articleId, candidateRef: article.candidateRef }).version;
    const siloVersion = article.siloId ? acceptedSiloDnas[String(article.siloId)] : undefined;
    const siloPageVersion = article.siloId ? Object.values(acceptedSiloPages).find(page => String(page.payload.siloId) === String(article.siloId)) : undefined;
    const assessment = latestSerpAssessmentFor(articleId);
    return resolveArticleRadarReadiness({
      siloReadiness,
      siloArtifactsApproved: Boolean(siloVersion && effectiveVersionStatus(siloVersion.versionId, versionEvents) === "approved")
        && Boolean(siloPageVersion && effectiveVersionStatus(siloPageVersion.versionId, versionEvents) === "approved"),
      internalLinkGraphApproved: Boolean(linksApprovedGraph?.nodes.some(node => node.articleDnaVersionRef?.versionId === version?.versionId)),
      serpAssessmentComplete: Boolean(assessment && isSerpAssessmentComplete({
        queryCount: assessment.queryCount,
        queriedKeywordDnaIds: assessedKeywordDnaIds(assessment),
        snapshotCount: assessment.snapshots.length,
        recommendationCount: assessment.recommendations.length,
        unassociatedRecommendationCount: unassociatedSerpRecommendations(assessment).length,
      })),
      alreadySent: Boolean(articleId && radarItems.some(item => item.articleId === articleId)),
    });
  };
  /** Leitura da IA por artigo: execução, propostas materiais e resumo do no-op. */
  const articleAiReadoutFor = (article: (typeof articlesList)[number]) => {
    const keywords = [article.mainKeywordObj, ...article.supportKeywords]
      .filter((keyword): keyword is NonNullable<typeof article.mainKeywordObj> => Boolean(keyword));
    const keywordIds = new Set(keywords.map(keyword => String(keyword.id)));
    const decisions = (pendingKeywordReview?.review.decisions || []).filter(decision => keywordIds.has(String(decision.keywordId)));
    // Depois do F5 não existe proposta em sessão: a leitura vem do artefato
    // canônico da revisão, que também registra o NO_OP.
    const durable = resolveArticleAiReviewReadout({
      review: articleAiReviews[articleEntityIdFor(article) || ""]?.payload,
      currentBaseContentHash: articleBaseHashes[articleEntityIdFor(article) || ""],
    });
    const durableDecisions: ArticleAiDecisionInput[] = decisions.length || durable.stale ? [] : (durable.review?.proposals || []).map(proposal => ({
      keywordId: proposal.keywordId,
      keyword: proposal.keyword || proposal.keywordId,
      currentRole: proposal.currentState.role || "secundaria",
      action: proposal.changeType,
      suggestedRole: proposal.proposedState.role,
      justification: proposal.reason,
      humanDecisionPoints: proposal.evidence,
      siloPlacementAction: proposal.proposedState.siloAction,
      conflictReasons: [],
      material: true,
    }));
    if (durableDecisions.length || (!decisions.length && !durable.stale && durable.state === "COMPLETED_NO_PROPOSALS")) {
      return buildArticleAiReadout({
        executed: true,
        keywordCount: keywords.length,
        serpConsidered: Boolean(durable.review?.base.serpAssessmentId) || Boolean(latestSerpAssessmentFor(articleEntityIdFor(article))),
        decisions: durableDecisions,
      });
    }
    return buildArticleAiReadout({
      executed: decisions.length > 0 || article.aiReviewAnnotations.length > 0,
      keywordCount: keywords.length,
      serpConsidered: Boolean(latestSerpAssessmentFor(articleEntityIdFor(article))),
      decisions: decisions.map<ArticleAiDecisionInput>(decision => {
        const keyword = keywords.find(item => String(item.id) === String(decision.keywordId));
        const conflictReasons = (pendingKeywordReview?.review.conflicts || [])
          .filter(conflict => conflict.entityIds.includes(decision.keywordId))
          .map(conflict => conflict.reason);
        return {
          keywordId: String(decision.keywordId),
          keyword: keyword?.keyword || String(decision.keywordId),
          currentRole: keyword ? manualKeywordRoleFor(keyword) : "secundaria",
          action: decision.action,
          suggestedRole: decision.suggestedRole,
          justification: decision.justification,
          humanDecisionPoints: decision.humanDecisionPoints,
          siloPlacementAction: decision.siloPlacement.action,
          conflictReasons,
          material: !isNoOpKeywordArticleDecision(decision, keyword?.reviewRole, conflictReasons.length),
        };
      }),
    });
  };
  const serpIndicatorFor = (article: (typeof articlesList)[number]) => {
    const articleId = articleEntityIdFor(article);
    const execution = articleId ? serpExecution[articleId] : undefined;
    if (execution?.status === "processing") return { label: `SERP processando · ${execution.completed} de ${execution.queryCount}`, className: "border-pending/40 bg-pending/10 text-pending" };
    if (execution?.status === "error") return { label: "SERP com erro", className: "border-danger/40 bg-danger-soft text-danger" };
    const assessment = latestSerpAssessmentFor(articleId);
    if (!assessment) return { label: "SERP não analisada", className: "border-slate-700 text-slate-500" };
    const articleVersion = articleId ? acceptedArticleDnas[articleId] : undefined;
    const expectedVersionId = articleVersion?.versionId || `work:${articleId}`;
    if (assessment.articleDnaVersionId !== expectedVersionId) return { label: `SERP desatualizada · v${assessment.version}`, className: "border-warning/40 bg-warning/10 text-warning" };
    // Conflito técnico só vira rótulo humano quando o veredito é divergência.
    if (articleSerpVerdictFor(article).kind === "DIVERGENCE") return { label: `SERP com divergência · v${assessment.version}`, className: "border-warning/40 bg-warning/10 text-warning" };
    return { label: `SERP pronta · v${assessment.version}`, className: "border-success/40 bg-success-soft text-success" };
  };
  const consolidationIssuesFor = (article: (typeof articlesList)[number], candidate: VersionEnvelope<ArticleDNA>, publishedBaseline?: VersionEnvelope<ArticleDNA>) => {
    const entityIds = new Set([
      ...candidate.payload.keywordReferences.map(reference => reference.keywordId),
      candidate.payload.articleId,
      article.id,
      article.mainKeywordObj?.provisionalGroupId,
    ].filter((value): value is string => Boolean(value)));
    const unresolvedConflictCount = articleConflictsFor({ candidateRef: article.candidateRef, entityIds: [...entityIds] }).length;
    return articleConsolidationIssues({
      candidate,
      publishedBaseline,
      compatiblePublishedBaselines: Object.values(acceptedArticleDnas).filter(version => Boolean(version.payload.publishedIdentityRef) && version.payload.articleId !== candidate.payload.articleId),
      pendingAiReviewCount: article.aiReviewAnnotations.filter(annotation => annotation.reviewState === "pending_fine_review").length,
      unresolvedConflictCount,
    });
  };
  const readbackConfirmedArticleDnas = async (versions: VersionEnvelope<ArticleDNA>[]) => {
    const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
    const issues = versions.flatMap(version => articleDnaReadbackIssues(version, canonical));
    if (issues.length) throw new Error(`A confirmação não passou no readback F5: ${issues.join(" ")}`);
    return canonical;
  };
  /**
   * A referência da evidência SERP vigente deste artigo.
   *
   * Só evidência VIGENTE viaja: um `formationBaseHash` diferente descreve
   * outra composição, e carimbar isso no payload assinaria como atual um
   * parecer que já envelheceu. Sem evidência vigente a função devolve `null`
   * e o portão de consolidação barra — que é o comportamento correto.
   */
  const canonicalSerpReferenceFor = (candidateRef: string | null | undefined): VersionReference | null => {
    if (!candidateRef) return null;
    const gate = articleSerpGates.get(candidateRef);
    if (!gate || !serpWasExecutedFor(gate.state)) return null;
    const registro = remoteArticleSerp.find(item => item.candidateRef === candidateRef)?.payload;
    if (!registro) return null;
    return {
      entityId: registro.assessment.id,
      // A base entra no versionId: é ela que prova QUAL composição foi olhada.
      versionId: `${registro.assessment.id}:${registro.formationBaseHash}`,
      contentHash: registro.assessment.contentHash,
    };
  };
  const handleConfirmArticleArchitecture = async (article: (typeof articlesList)[number], selectedPrincipalKeywordId?: string) => {
    const { key: articleId, version: current } = articleDnaEntryFor({ articleId: articleEntityIdFor(article), candidateRef: article.candidateRef });
    // A principal padrão é a DO ARTIGO REVISADO, não a da linha da grade.
    // Aprovar é fechar o que foi revisado; herdar a principal de outra
    // leitura trocaria, no ato de aprovar, a decisão que a formação tomou.
    const principalKeywordId = selectedPrincipalKeywordId || current?.payload.principalKeywordId || article.mainKeywordObj?.id;
    if (!current || !articleId || !principalKeywordId) return showNotification("error", "Selecione uma principal antes de confirmar a arquitetura.");
    try {
      const actorId = session?.user?.id || "human-reviewer";
      // A evidência SERP precisa CHEGAR ao payload consolidado.
      //
      // A formação grava o parecer no registro canônico por `candidateRef`; o
      // portão de consolidação pergunta pelo `serpAssessmentRef` do payload.
      // Enquanto cada lado lesse pela sua chave, um artigo com SERP vigente e
      // resolvida era barrado por "falta evidência" — com a evidência gravada.
      const evidencia = canonicalSerpReferenceFor(article.candidateRef);
      const base = evidencia ? { ...current, payload: { ...current.payload, serpAssessmentRef: evidencia } } : current;
      const successor = await confirmArticleArchitecture(base, principalKeywordId, actorId);
      const issues = consolidationIssuesFor(article, successor, article.isPublished ? current : undefined);
      if (issues.length) throw new Error(`A confirmação encontrou pendências: ${issues.join(" ")}`);
      const persisted = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "article_dna", action: "edit", version: successor, status: "approved" });
      const canonicalSuccessor = persisted.version as VersionEnvelope<ArticleDNA>;
      await readbackConfirmedArticleDnas([canonicalSuccessor]);
      setAcceptedArticleDnas(previous => ({ ...previous, [articleId!]: canonicalSuccessor }));
      addVersionEvents([createStatusEvent(canonicalSuccessor.versionId, "approved", canonicalSuccessor.createdBy, "Arquitetura confirmada manualmente; versão consolidada para o handoff.")]);
      showNotification("success", "Arquitetura confirmada e consolidada. A próxima SERP usará este contexto.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível confirmar a arquitetura.");
    }
  };
  const confirmSelectedArchitectures = async () => {
    const selectedArticles = articlesList.filter(article => selectedArticleIds.has(article.id));
    if (!selectedArticles.length) return showNotification("error", "Selecione ao menos um artigo para confirmar a arquitetura.");
    try {
      const prepared = await prepareSelectedLogicalArticleDnas();
      const preparedByEntity = new Map(prepared.versions.map(version => [version.payload.articleId, version]));
      const actorId = prepared.actorId;
      const successors: Array<{ articleId: string; version: VersionEnvelope<ArticleDNA> }> = [];
      for (const article of selectedArticles) {
        const articleId = articleEntityIdFor(article);
        const current = articleId ? preparedByEntity.get(articleId) || acceptedArticleDnas[articleId] : undefined;
        const principalId = primaryDrafts[article.id] || article.mainKeywordObj?.id || current?.payload.principalKeywordId;
        if (!current || !principalId) throw new Error(`O artigo "${article.keywordPrincipal}" não possui principal selecionável.`);
        const successor = await confirmArticleArchitecture(current, principalId, actorId);
        const issues = consolidationIssuesFor(article, successor, article.isPublished ? current : undefined);
        if (issues.length) throw new Error(`A confirmação encontrou pendências: ${issues.join(" ")}`);
        successors.push({ articleId: articleId || successor.payload.articleId, version: successor });
      }
      const approvalEvents = successors.map(item => createStatusEvent(item.version.versionId, "approved", actorId, "Arquitetura consolidada manualmente pelo Arquiteto."));
      const validationEvents = [...versionEvents, ...prepared.proposedEvents, ...approvalEvents];
      const invalid = successors.flatMap(item => articleApprovalIssues(item.version, validationEvents).map(issue => `${item.version.payload.promise}: ${issue}`));
      if (invalid.length) throw new Error(`A confirmação encontrou pendências: ${invalid.join(" ")}`);
      const persisted = [] as VersionEnvelope<ArticleDNA>[];
      for (const item of successors) {
        const result = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "article_dna", action: "edit", version: item.version, status: "approved" });
        persisted.push(result.version as VersionEnvelope<ArticleDNA>);
      }
      await readbackConfirmedArticleDnas(persisted);
      setAcceptedArticleDnas(previous => ({ ...previous, ...Object.fromEntries(persisted.map(version => [version.payload.articleId, version])) }));
      addVersionEvents(approvalEvents);
      showNotification("success", `${persisted.length} arquitetura(s) confirmada(s) e consolidada(s).`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível confirmar as arquiteturas selecionadas.");
    }
  };
  const handleEditorialUnitDecision = async (article: (typeof articlesList)[number], decision: { type: EditorialArticleUnitType; landingPagePurpose?: LandingPagePurpose; status?: "human_confirmed" | "conflict" | "unknown" }) => {
    const { key: articleId, version: current } = articleDnaEntryFor({ articleId: articleEntityIdFor(article), candidateRef: article.candidateRef });
    if (!current || !articleId) return showNotification("error", "Gere a definição do artigo antes de classificar o tipo da unidade.");
    try {
      const actorId = session?.user?.id || "human-reviewer";
      const payload = applyHumanEditorialUnitDecision(current.payload, decision, actorId);
      const successor = await createVersionEnvelope({
        entityId: current.payload.articleId, versionNumber: current.versionNumber + 1, previousVersionId: current.versionId,
        origin: "human", changeReason: "Classificação manual do tipo e propósito da unidade editorial.", createdBy: actorId, payload,
      });
      const persisted = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "article_dna", action: "edit", version: successor });
      const canonicalSuccessor = persisted.version as VersionEnvelope<ArticleDNA>;
      setAcceptedArticleDnas(previous => ({ ...previous, [articleId!]: canonicalSuccessor }));
      addVersionEvents([createStatusEvent(canonicalSuccessor.versionId, "proposed", canonicalSuccessor.createdBy, "Classificação humana registrada; aprovação editorial continua independente.")]);
      addVersionEvents([createStatusEvent(successor.versionId, "proposed", actorId, "Classificação humana registrada; aprovação editorial continua independente.")]);
      setSerpAssessments(previous => previous.map(assessment => assessment.articleDnaVersionId === current.versionId ? markSerpAssessmentOutdated(assessment, "Desatualizado por mudança do perfil da unidade editorial.") : assessment));
      showNotification("success", "Perfil da unidade salvo em nova versão da definição do artigo. A SERP anterior foi preservada no histórico.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar o perfil da unidade.");
    }
  };
  const openSerpResult = (article: (typeof articlesList)[number]) => {
    setExpandedIds(current => new Set([...current, article.id]));
    setExpandedProcessTabs(current => ({ ...current, [article.id]: "serp" }));
    window.requestAnimationFrame(() => document.getElementById(`article-row-${article.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const publicationUrlFor = (article: (typeof articlesList)[number]) => {
    const dna = articleEntityIdFor(article) ? acceptedArticleDnas[articleEntityIdFor(article)!] : undefined;
    return article.mainKeywordObj?.publishedUrl || article.mainKeywordObj?.url || dna?.payload.publishedIdentityRef?.publishedUrl || null;
  };

  /**
   * Grava o registro completo (vigentes + histórico) e confirma somente as
   * versões recém-escritas: comparar o histórico reintroduzia falso erro.
   */
  const persistSerpState = async (assessments: SerpFormationAssessment[], verifications = publicationVerifications, candidateEvidence = siloCandidateSerpEvidence, confirmTargets?: SerpFormationAssessment[]) => {
    if (!selectedBrandId) throw new Error("Marca ausente para persistir o assessment SERP.");
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId) throw new Error("Sessão autenticada ausente para persistir o assessment SERP.");
    const recovery = SerpFormationRecoverySchema.parse({ schemaVersion: 1, brandId: selectedBrandId, updatedAt: new Date().toISOString(), assessments, siloCandidateEvidence: candidateEvidence, verifications });
    const key = architectSerpFormationKey(actorUserId, selectedBrandId);
    await writeBrowserArtifact(key, recovery);
    const readback = await readBrowserArtifactReadOnly(key);
    const confirmed = SerpFormationRecoverySchema.parse(readback);
    // A confirmação é por assessment: comparar tamanhos de lote reintroduzia
    // semântica atômica e derrubava resultados válidos.
    const assessmentsReadBack = new Map(confirmed.assessments.map(item => [item.id, item]));
    const candidatesReadBack = new Map(confirmed.siloCandidateEvidence.map(item => [item.id, item]));
    const expectedAssessments = confirmTargets ?? assessments;
    const missingAssessments = expectedAssessments.filter(expected => {
      const actual = assessmentsReadBack.get(expected.id);
      return !actual
        || actual.contentHash !== expected.contentHash
        || actual.snapshots.length !== expected.snapshots.length
        || actual.recommendations.length !== expected.recommendations.length;
    });
    const assessmentsPreserved = missingAssessments.length === 0;
    const candidatesPreserved = candidateEvidence.every(expected => {
      const actual = candidatesReadBack.get(expected.id);
      return actual?.keywordDnaVersionId === expected.keywordDnaVersionId
        && actual.evidence.evidenceStatus === expected.evidence.evidenceStatus
        && (actual.snapshot?.contentHash || null) === (expected.snapshot?.contentHash || null);
    });
    if (confirmed.brandId !== selectedBrandId || !assessmentsPreserved || !candidatesPreserved) {
      const detail = missingAssessments.length
        ? ` Não confirmados: ${missingAssessments.map(assessment => assessment.articleId).join(", ")}.`
        : "";
      throw new Error(`A recuperação local da SERP não confirmou os assessments gravados.${detail}`);
    }
  };

  const handleValidateSerp = () => {
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione ao menos um artigo para validar o agrupamento pela SERP.");
      return;
    }
    void confirmSerpValidation(groups);
  };

  /** Falha específica de um Article devolvida pelo route da SERP. */
  type ArticleSerpFailure = { articleId: string; principalKeywordId: string; stage: string; code: string; message: string; retryable: boolean };

  const confirmSerpValidation = async (requestedGroups: ProvisionalArticleGroup[]) => {
    if (!requestedGroups.length || !brandContext) return;
    const requestedArticleIds = requestedGroups.map(group => group.publishedAnchorId || group.id);
    setSerpExecution(current => ({ ...current, ...Object.fromEntries(requestedGroups.map(group => [group.publishedAnchorId || group.id, { status: "processing" as const, queryCount: group.keywords.length, completed: 0 }])) }));
    setSerpBusy(true);
    try {
      const previousAssessments = Object.fromEntries(requestedGroups.map(group => {
        const articleId = group.publishedAnchorId || group.id;
        const previous = latestSerpAssessmentFor(articleId);
        return previous ? [articleId, { id: previous.id, version: previous.version }] : [];
      }).filter(([key]) => Boolean(key)));
      const articleDnaVersionIds = Object.fromEntries(requestedGroups.map(group => {
        const articleId = group.publishedAnchorId || group.id;
        const version = acceptedArticleDnas[articleId];
        return [articleId, version?.versionId || `work:${articleId}`];
      }));
      const result = await callStrategicApi<{
        assessments: SerpFormationAssessment[];
        failures?: ArticleSerpFailure[];
        summary?: { requestedArticles: number; completedArticles: number; failedArticles: number };
        siloCandidateEvidence?: SerpSiloCandidateAssessment[];
        queryCount: number;
      }>("/api/arquiteto/serp", {
        brandId: brandContext.id, groups: requestedGroups, siloCandidates: siloCandidateKeywords, location: "Brasil", language: "pt-br", device: "desktop",
        articleDnaVersionIds, previousAssessments,
        // A evidência nasce carimbada com a composição que observou: é o que
        // permite provar depois que ela ainda descreve o artigo de agora.
        formationBaseHashes: Object.fromEntries(requestedGroups
          .map(group => [group.publishedAnchorId || group.id, articleSerpGates.get(group.publishedAnchorId || group.id)?.expectedBaseHash])
          .filter((entry): entry is [string, string] => Boolean(entry[1]))),
      }, "serp");
      // Validação por Article: um assessment incompleto vira falha daquela
      // unidade e não invalida os assessments válidos do restante do lote.
      const parsedAssessments = result.assessments.map(assessment => SerpFormationAssessmentSchema.parse(assessment));
      const incompleteAssessments = parsedAssessments.filter(assessment => {
        const queried = assessedKeywordDnaIds(assessment);
        return assessment.snapshots.length !== queried.length || assessment.recommendations.length !== queried.length || !queried.includes(assessment.snapshots[0]?.keywordId || "");
      });
      const assessments = parsedAssessments.filter(assessment => !incompleteAssessments.includes(assessment));
      const serverFailures: ArticleSerpFailure[] = result.failures || [];
      const completedArticleIds = new Set(assessments.map(assessment => assessment.articleId));
      const failures: ArticleSerpFailure[] = [
        ...serverFailures,
        ...incompleteAssessments.map(assessment => ({
          articleId: assessment.articleId,
          principalKeywordId: assessment.recommendations[0]?.keywordId || "",
          stage: "assessment",
          code: "SERP_INCOMPLETE_ASSESSMENT",
          message: "A SERP retornou análise incompleta: a principal precisa de uma análise registrada e as keywords consultadas precisam de recomendação.",
          retryable: true,
        })),
        ...requestedArticleIds
          .filter(articleId => !completedArticleIds.has(articleId) && !serverFailures.some(failure => failure.articleId === articleId))
          .filter(articleId => !incompleteAssessments.some(assessment => assessment.articleId === articleId))
          .map(articleId => ({
            articleId,
            principalKeywordId: "",
            stage: "assessment",
            code: "SERP_ASSESSMENT_MISSING",
            message: "O servidor não devolveu avaliação para este artigo.",
            retryable: true,
          })),
      ];
      if (!assessments.length) {
        throw new Error(failures[0]?.message || "A SERP não produziu nenhuma avaliação para os artigos selecionados.");
      }
      // Uma vigente por Article, histórico preservado e reexecução idêntica sem
      // duplicata nem falso erro de confirmação.
      const merged = mergeSerpAssessments({ existing: serpAssessments, incoming: assessments, brandId: brandContext.id });
      const replaced = merged.assessments;
      const incomingCandidateEvidence = result.siloCandidateEvidence || [];
      const nextCandidateEvidence = preserveSiloCandidateEvidenceOnFailure(siloCandidateSerpEvidence, incomingCandidateEvidence);
      await persistSerpState(replaced, publicationVerifications, nextCandidateEvidence, merged.confirmTargets);
      setSerpAssessments(replaced);
      setMapSerpAssessmentsSnapshot(replaced);
      setMapSerpArticlesSnapshot(previous => previous || architectureMapSnapshots.current.articles);
      setMapSerpSilosSnapshot(previous => previous || architectureMapSnapshots.current.silos);
      setSiloCandidateSerpEvidence(nextCandidateEvidence);
      setSerpExecution(current => ({ ...current, ...Object.fromEntries(assessments.map(assessment => [assessment.articleId, { status: "ready" as const, queryCount: assessment.queryCount, completed: assessment.queryCount }])) }));
      const focusArticleIds = requestedArticleIds.map(articleId => articlesList.find(article => articleEntityIdFor(article) === articleId)?.id).filter((id): id is string => Boolean(id));
      setExpandedIds(current => new Set([...current, ...focusArticleIds]));
      setActiveTabs(current => ({ ...current, ...Object.fromEntries(focusArticleIds.map(id => [id, "suporte" as const])) }));
      window.setTimeout(() => document.getElementById(focusArticleIds[0] ? `article-row-${focusArticleIds[0]}` : "")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      // Estado por Article: concluído mantém o resultado; falho mostra estágio,
      // motivo e a possibilidade de repetir só aquela unidade.
      setSerpExecution(current => ({ ...current, ...Object.fromEntries(assessments.map(assessment => [assessment.articleId, {
        status: "ready" as const,
        queryCount: assessment.queryCount,
        completed: assessment.queryCount,
        lastAttemptFailed: false,
      }])) }));
      setSerpExecution(current => ({ ...current, ...Object.fromEntries(failures.map(failure => [failure.articleId, {
        status: latestSerpAssessmentFor(failure.articleId) ? "ready" as const : "error" as const,
        queryCount: requestedGroups.find(group => (group.publishedAnchorId || group.id) === failure.articleId)?.keywords.length || 0,
        completed: 0,
        lastAttemptFailed: true,
        message: `${failure.message} (estágio ${failure.stage} · código ${failure.code})`,
        stage: failure.stage,
        code: failure.code,
        retryable: failure.retryable,
      }])) }));
      const completedCount = assessments.length;
      const requestedCount = requestedGroups.length;
      showNotification(failures.length ? "error" : "success", failures.length
        ? `SERP parcial: ${completedCount} de ${requestedCount} artigo(s) concluído(s) · ${failures.length} com erro. ${failures.map(failure => `${failure.articleId}: ${failure.message}`).join(" ")}`
        : `SERP concluída: ${completedCount} de ${requestedCount} artigo(s) avaliado(s) · ${result.queryCount} snapshot(s). Salvamento local e readback confirmados; isso não comprova persistência remota.`);
    } catch (error) {
      // O erro real já vem sanitizado do servidor (estágio, HTTP, código) ou de
      // uma validação local. Engolir tudo em uma frase genérica escondia a causa.
      const detail = error instanceof Error && error.message.trim() ? error.message.trim() : "";
      const message = detail || architectFunctionalErrorMessage("serp");
      // Estado do processo vem da avaliação vigente; a tentativa falha é
      // registrada como última tentativa, sem invalidar o que já foi confirmado.
      setSerpExecution(current => ({ ...current, ...Object.fromEntries(requestedGroups.map(group => {
        const articleId = group.publishedAnchorId || group.id;
        const hasCurrent = Boolean(latestSerpAssessmentFor(articleId));
        return [articleId, {
          status: hasCurrent ? "ready" as const : "error" as const,
          queryCount: group.keywords.length,
          completed: hasCurrent ? group.keywords.length : 0,
          message,
          lastAttemptFailed: true,
        }];
      })) }));
      showNotification("error", requestedGroups.length > 1
        ? `${message} Nenhum artigo do lote foi avaliado nesta execução; os assessments já confirmados anteriormente permanecem.`
        : message);
    } finally { setSerpBusy(false); }
  };

  const handleSerpRecommendationDecision = async (article: (typeof articlesList)[number], keywordId: string, status: "followed" | "ignored") => {
    const articleId = articleEntityIdFor(article);
    const assessment = latestSerpAssessmentFor(articleId);
    if (!articleId || !assessment) return showNotification("error", "Nenhum assessment SERP persistido para este artigo.");
    const recommendation = assessment.recommendations.find(item => item.keywordId === keywordId);
    if (!recommendation) return showNotification("error", "Recomendação SERP ausente para esta keyword.");
    const identityContext = articleSerpIdentityFor(article);
    const proposalOnly = identityContext.principalProtected && keywordId === article.mainKeywordObj?.id;
    const actorId = session?.user?.id || "human-reviewer";
    const nextAssessment = decideSerpRecommendation(assessment, keywordId, status, actorId, acceptedArticleDnas[articleId]?.versionId || `work:${Date.now()}`, status === "ignored" ? "Decisão humana: manter a cópia de trabalho atual." : proposalOnly ? "Proposta de fortalecimento registrada; identidade publicada preservada." : null);
    const nextAssessments = serpAssessments.map(item => item.id === assessment.id ? nextAssessment : item);
    try {
      await persistSerpState(nextAssessments);
      setSerpAssessments(nextAssessments);
      showNotification("success", status === "followed"
        ? proposalOnly ? "Proposta de fortalecimento registrada; a identidade publicada permanece protegida. Nenhuma movimentação foi aplicada pela SERP." : "Decisão SERP registrada. A working copy permanece intacta; movimentos editoriais dependem da IA e da revisão humana."
        : "Recomendação ignorada e persistida.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível persistir a decisão SERP.");
    }
  };

  const handleVerifyPublication = async (article: (typeof articlesList)[number]) => {
    const url = publicationUrlFor(article);
    const articleId = articleEntityIdFor(article);
    if (!url || !articleId || !selectedBrandId) return showNotification("error", "URL publicada ausente; nenhuma URL será inventada.");
    setVerificationBusy(current => new Set(current).add(article.id));
    try {
      const result = await callStrategicApi<{ verification: SerpPublicationVerification }>("/api/arquiteto/publication/verify", {
        brandId: selectedBrandId, articleId, articleDnaVersionId: acceptedArticleDnas[articleId]?.versionId || null, url, sitemapUrl: null,
      });
      const verification = SerpPublicationVerificationSchema.parse(result.verification);
      const nextVerifications = [...publicationVerifications.filter(item => item.id !== verification.id && item.articleId !== articleId), verification];
      await persistSerpState(serpAssessments, nextVerifications);
      setPublicationVerifications(nextVerifications);
      showNotification("success", `Verificação concluída: ${verification.status}.`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Falha ao verificar URL e canonical.");
    } finally { setVerificationBusy(current => { const next = new Set(current); next.delete(article.id); return next; }); }
  };
  const renderSerpRecommendationForKeyword = (article: (typeof articlesList)[number], keywordDnaId: string | undefined, keywordLabel: string) => {
    const articleId = articleEntityIdFor(article);
    if (!articleId || !keywordDnaId) return null;
    const assessment = latestSerpAssessmentFor(articleId);
    if (!assessment) return null;
    if (!assessedKeywordDnaIds(assessment).includes(keywordDnaId)) return <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm leading-6 text-slate-400">Não consultada neste perfil de validação ({assessment.validationProfile}); a proveniência do perfil da keyword permanece preservada.</div>;
    const recommendation = findSerpRecommendationForKeyword(assessment, keywordDnaId);
    const rawRecommendation = assessment.recommendations.find(item => item.keywordId === keywordDnaId);
    const reference = assessment.keywordDnaReferences.find(item => item.keywordId === keywordDnaId);
    if (!recommendation) return <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
      <p className="font-semibold">Recomendação SERP não associada</p>
      <p className="mt-1 leading-6 text-warning/80">Perfil da keyword: {keywordDnaId} · Definição do artigo: {assessment.articleDnaVersionId}{rawRecommendation ? ` · versão da recomendação: ${rawRecommendation.keywordDnaVersionId}` : " · referência ausente"}</p>
    </div>;
    const identityContext = articleSerpIdentityFor(article);
    const publishedPrincipal = identityContext.principalProtected && keywordDnaId === article.mainKeywordObj?.id;
    const blocked = identityContext.principalProtected && isPublishedStructuralRecommendation(recommendation.action, keywordDnaId, article.mainKeywordObj?.id || keywordDnaId);
    const proposalAction = publishedPrincipal || recommendation.action === "revisar_conteudo" || recommendation.action === "sugerir_artigo_suporte";
    const assessmentMode = identityContext.mode;
    const assessmentLabel = serpAssessmentModeLabel(assessmentMode);
    const formationObservation = assessment.formationEvidence?.keywordObservations.find(item => item.keywordId === keywordDnaId && item.keywordDnaVersionId === recommendation.keywordDnaVersionId);
    const expectedIntent = reference?.payload.searchIntent || reference?.payload.originalIntentLabel || "não recebida";
    const snapshotIds = formationObservation?.snapshotIds.join(", ") || recommendation.snapshotIds.join(", ");
    return <div className="mt-2 rounded-lg border border-context-accent/25 bg-context-accent/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-context-accent">{assessmentLabel} · v{assessment.version}</span>
        <span className="rounded-md border border-context-accent/45 px-2 py-1 text-xs uppercase tracking-wide text-context-accent">{recommendation.decision.status}</span>
      </div>
      <p className="mt-2 text-base font-semibold text-slate-100">{recommendation.action === "fortalecer_intencao" ? "Fortalecer intenção" : recommendation.action === "revisar_conteudo" ? "Revisar conteúdo ao redor da principal" : recommendation.action === "sugerir_artigo_suporte" ? "Sugerir artigo complementar" : recommendation.action.replaceAll("_", " ")} · confiança {recommendation.confidence}</p>
      <p className="mt-1 text-sm leading-6 text-slate-300">{recommendation.reason}</p>
       <p className="mt-2 text-xs text-slate-500">Keyword: {keywordLabel} · papel atual {recommendation.currentRole} · intenção esperada {expectedIntent} · snapshot(s) {snapshotIds} · analisada em {new Date(assessment.createdAt).toLocaleString("pt-BR")}</p>
       {formationObservation && <p className="mt-3 rounded-md border border-divider bg-surface-subtle p-3 text-sm leading-6 text-text-muted">Observação SERP: compatibilidade {formationObservation.compatibility} · sobreposição {formationObservation.overlap} · intenção observada {formationObservation.observedIntent || "não observada"} · página dominante {formationObservation.dominantPageType || "não observada"} · competição {formationObservation.competition} · canibalização {formationObservation.likelyCannibalization === "likely" ? "provável" : formationObservation.likelyCannibalization === "unlikely" ? "não provável" : "indeterminada"} · cobertura {formationObservation.insufficientEvidence ? "evidência insuficiente" : "evidência observada"}. Separar: {formationObservation.needsSeparation === null ? "evidência insuficiente" : formationObservation.needsSeparation ? "possível" : "não indicado"} · juntar: {formationObservation.canJoin === null ? "evidência insuficiente" : formationObservation.canJoin ? "possível" : "não indicado"}{formationObservation.conflictReasons.length ? ` · motivos: ${formationObservation.conflictReasons.join(" ")}` : ""}.</p>}
      {recommendation.conflicts.length > 0 && <div className="mt-3 space-y-1 rounded-md border border-danger/45 bg-danger-soft p-3">{recommendation.conflicts.map(conflict => <p key={conflict} className="text-sm leading-6 text-danger">Conflito: {conflict}</p>)}</div>}
      {recommendation.decision.status === "pending" && <div className="mt-4 flex flex-wrap items-center gap-3">
        {(publishedPrincipal || !blocked) && <button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "followed")} className={ARCHITECT_UI.importButton} title={proposalAction ? "Registrar proposta sem alterar a identidade publicada" : "Aplicar somente a esta keyword na cópia de trabalho"}>{proposalAction ? recommendation.action === "sugerir_artigo_suporte" ? "Sugerir artigo complementar" : "Registrar proposta de atualização" : "Seguir recomendação"}</button>}
        <button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "ignored")} className={ARCHITECT_UI.toolbarButton}>Ignorar</button>
      </div>}
      {(blocked || publishedPrincipal) && <p className="mt-3 rounded-md border border-warning/45 bg-warning/10 p-3 text-sm leading-6 text-warning">Keyword principal protegida: a SERP só pode registrar proposta de fortalecimento ao redor da identidade consolidada.</p>}
    </div>;
  };
  const renderSerpRecommendations = (article: (typeof articlesList)[number]) => {
    const assessment = latestSerpAssessmentFor(articleEntityIdFor(article));
    if (!assessment) return null;
    const unassociated = unassociatedSerpRecommendations(assessment);
    const referenceCount = assessment.keywordDnaReferences.length;
    const queriedKeywordDnaIds = assessedKeywordDnaIds(assessment);
    const queriedCount = queriedKeywordDnaIds.length;
    const observations = assessment.formationEvidence?.keywordObservations || [];
    const compatibleCount = observations.filter(item => item.compatibility === "coerente").length;
    const conflictObservationCount = observations.filter(item => item.conflict || item.compatibility === "incompativel").length;
    const insufficientObservationCount = observations.filter(item => item.insufficientEvidence || item.compatibility === "insuficiente").length;
    const executionComplete = assessment.snapshots.length === queriedCount && assessment.queryCount === queriedCount;
    // Sinal técnico do assessment; o veredito humano vive no bloco de resultado.
    const architecturalSignal = assessment.conflicts.length || conflictObservationCount ? "Revisar pertencimento" : insufficientObservationCount ? "Evidência insuficiente" : "Manter";
    const articleDna = articleEntityIdFor(article) ? acceptedArticleDnas[articleEntityIdFor(article)!] : undefined;
    const publishedCanonical = article.mainKeywordObj?.canonical || articleDna?.payload.canonical || null;
    const evidencePriority = resolveSerpEvidencePriority(assessment);
    const provisionalSlug = articleDna?.payload.suggestedSlug || article.mainKeywordObj?.computedSlug || article.mainKeywordObj?.slug_sugerido || "não definido";
    const assessmentMode = articleSerpIdentityFor(article).mode;
    return <section className="mb-4 rounded-lg border border-context-accent/25 bg-context-accent/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 pb-3">
         <div><p className="text-xs font-bold uppercase tracking-widest text-context-accent">{serpAssessmentModeLabel(assessmentMode)}{assessment.evaluationStatus === "outdated" ? " · Desatualizado por correção do avaliador" : ""}</p><p className="mt-1 text-sm leading-6 text-text-muted">Assessment v{assessment.version} · {assessment.intentCompatibility} · competição {assessment.competitionLevel} · {assessment.queryCount} consulta(s) · perfil {assessment.validationProfile} · {new Date(assessment.createdAt).toLocaleString("pt-BR")}</p></div>
         <span className="font-mono text-xs text-slate-500">{assessment.contentHash.slice(0, 18)}…</span>
      </div>
        <p className={`text-sm leading-6 ${executionComplete ? "text-foreground" : "text-warning"}`}>Execução: <strong>{executionComplete ? `Concluída — ${assessment.snapshots.length}/${queriedCount}` : `Incompleta — ${assessment.snapshots.length}/${queriedCount}`}</strong> · Sinal técnico: <strong>{architecturalSignal}</strong>. Proveniência: {referenceCount} perfis das keywords · recomendações: {assessment.recommendations.length}/{queriedCount}.</p>
        <div className={`mt-3 rounded-md border p-3 text-sm leading-6 ${evidencePriority.priority === "prioritaria" ? "border-context-accent/35 bg-context-accent/10 text-foreground" : "border-warning/30 bg-warning/10 text-warning"}`}>
          <p className="font-semibold">Força da evidência: {evidencePriority.priority === "prioritaria" ? "Forte para recomendação" : "Insuficiente para alterar a hipótese atual"}</p>
          <p className="mt-1">{evidencePriority.reason}</p>
          <p className="mt-1 text-text-muted">Hipótese vigente: principal {article.keywordPrincipal}; a SERP não altera a working copy. IA pode interpretar a divergência e a revisão humana consolida ou rejeita.</p>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5" data-testid="architect-serp-summary">
          <span className="rounded border border-divider bg-surface-subtle px-2 py-1.5 text-text-muted">Consultadas: <strong className="text-foreground">{assessment.snapshots.length}/{queriedCount}</strong></span>
          <span className="rounded border border-divider bg-surface-subtle px-2 py-1.5 text-text-muted">Compatibilidade coerente: <strong className="text-foreground">{compatibleCount}</strong></span>
          <span className="rounded border border-divider bg-surface-subtle px-2 py-1.5 text-text-muted">Sinais de incompatibilidade: <strong className="text-foreground">{conflictObservationCount}</strong></span>
          <span className="rounded border border-divider bg-surface-subtle px-2 py-1.5 text-text-muted">Evidência fraca: <strong className="text-foreground">{insufficientObservationCount}</strong></span>
          <span className="rounded border border-divider bg-surface-subtle px-2 py-1.5 text-text-muted">Detalhe: <strong className="text-foreground">{assessment.formationEvidence ? "por keyword" : "resumo"}</strong></span>
        </div>
        {assessmentMode === "fortalecimento" && <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-warning">Principal protegida: {article.keywordPrincipal} · URL: {publicationUrlFor(article) || "não recebida"} · canonical: {publishedCanonical || "não recebida"}. Oportunidades abaixo fortalecem esta identidade.</p>}
        <section className="mt-3 rounded-md border border-divider bg-surface-subtle p-3 text-sm leading-6 text-text-muted">
          <p className="font-semibold text-foreground">Slug e SERP</p>
          <p className="mt-1">Atual/provisório: <span className={`font-medium ${article.isPublished ? "text-identity-published" : "text-identity-new"}`}>/{provisionalSlug.replace(/^\/+/, "")}</span> · Recomendação SERP: ainda não registrada para este assessment.</p>
        </section>
       {assessment.conflicts.length > 0 && <div className="mt-3 space-y-1 rounded-md border border-danger/45 bg-danger-soft p-3">{assessment.conflicts.map(conflict => <p key={conflict} className="text-sm leading-6 text-danger">Conflito do artigo: {conflict}</p>)}</div>}
       {unassociated.length > 0 && <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3"><p className="text-sm font-bold uppercase tracking-wider text-warning">Recomendação SERP não associada</p>{unassociated.map(recommendation => <p key={recommendation.id} className="mt-1 text-sm leading-6 text-warning/80">Perfil da keyword: {recommendation.keywordId} · Perfil da keyword v{recommendation.keywordDnaVersionId} · Definição do artigo: {assessment.articleDnaVersionId}</p>)}</div>}
    </section>;
  };
  /*
  const renderLegacySerpRecommendations = (article: (typeof articlesList)[number]) => {
    const assessment = latestSerpAssessmentFor(articleEntityIdFor(article));
    if (!assessment) return null;
    return <section className="mb-3 rounded border border-cyan-500/20 bg-cyan-500/[.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2 mb-2">
        <div><p className="text-[8.5px] font-bold uppercase tracking-widest text-cyan-300">Validação SERP de formação</p><p className="mt-1 text-[9px] text-slate-500">Assessment v{assessment.version} · {assessment.intentCompatibility} · competição {assessment.competitionLevel} · {assessment.queryCount} consulta(s)</p></div>
        <span className="text-[8px] font-mono text-slate-600">{assessment.contentHash.slice(0, 18)}…</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {assessment.recommendations.map(recommendation => {
          const keyword = [article.mainKeywordObj, ...article.supportKeywords].find(item => item?.id === recommendation.keywordId);
          const blocked = article.isPublished && (recommendation.action === "tornar_principal" || (recommendation.action === "separar_artigo" && recommendation.keywordId === article.mainKeywordObj?.id));
          return <div key={recommendation.id} className="rounded border border-divider bg-surface-subtle p-2.5">
            <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-semibold text-slate-200">{keyword?.keyword || recommendation.keywordId}</span><span className="rounded border border-cyan-900/60 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-cyan-400">{recommendation.decision.status}</span></div>
            <p className="mt-1 text-[9px] text-slate-400">{recommendation.reason}</p>
            <p className="mt-1 text-[8px] uppercase tracking-wider text-slate-600">Sugestão: {recommendation.action.replaceAll("_", " ")}</p>
            {recommendation.decision.status === "pending" && <div className="mt-2 flex items-center gap-2"><button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "followed")} disabled={blocked} className="rounded border border-emerald-900/60 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-300 hover:border-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" title={blocked ? "Principal publicada protegida" : "Aplicar somente a esta keyword na cópia de trabalho"}>Seguir recomendação</button><button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "ignored")} className="rounded border border-slate-700 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200">Ignorar</button></div>}
            {blocked && <p className="mt-1 text-[8px] text-amber-400">Aplicação direta bloqueada: identidade publicada protegida.</p>}
          </div>;
        })}
      </div>
    </section>;
  };
  */
  const deterministicConflicts = useMemo(
    () => detectArchitectureConflicts(provisionalGroups),
    [provisionalGroups],
  );

  /** Base arquitetural que a IA leu: ArticleDNA consolidado ou cópia de trabalho. */
  const articleAiReviewBaseFor = async (group: ProvisionalArticleGroup) => {
    const articleId = group.publishedAnchorId || group.id;
    const dna = acceptedArticleDnas[articleId];
    const assessment = latestSerpAssessmentFor(articleId);
    return resolveArticleAiReviewBase({
      articleId,
      principalKeywordId: group.principalSuggestion.keywordId || null,
      keywords: group.keywords.map(keyword => ({
        keywordId: String(keyword.id),
        role: (masterListRef.current.find(item => String(item.id) === String(keyword.id))?.reviewRole as ManualKeywordRole | undefined) || null,
      })),
      // Silo é etapa posterior: não integra a base estrutural revisada.
      articleDna: dna ? { versionId: dna.versionId, versionNumber: dna.versionNumber, contentHash: dna.contentHash } : null,
      serpAssessment: assessment ? { id: assessment.id, version: assessment.version, contentHash: assessment.contentHash } : null,
    });
  };

  /**
   * Escreve a revisão como sucessora do artefato canônico do Article. Mesma
   * base e mesmo resultado devolvem UNCHANGED pela própria fundação: nenhuma
   * versão inútil é criada na reexecução.
   */
  const persistArticleAiReviewVersion = async (input: {
    articleId: string;
    payload: ReturnType<typeof buildArticleAiReviewPayload>;
    actorUserId: string;
    changeReason: string;
    origin: "ai" | "human";
  }) => {
    const current = articleAiReviewsRef.current[input.articleId];
    const version = await createVersionEnvelope({
      entityId: input.articleId,
      versionNumber: (current?.versionNumber || 0) + 1,
      previousVersionId: current?.versionId || null,
      origin: input.origin,
      changeReason: input.changeReason,
      createdBy: input.actorUserId,
      payload: input.payload,
    });
    const persisted = await persistArquitetoArtifact({
      brandId: selectedBrandId,
      artifactType: ARTICLE_AI_REVIEW_ARTIFACT_TYPE,
      action: current ? "edit" : "create",
      version,
      status: "proposed",
    });
    return persisted.version as VersionedArticleArchitectureAiReview;
  };

  /** Readback obrigatório: sem confirmação remota não existe SUCCESS. */
  const readbackArticleAiReviews = async (versions: readonly VersionedArticleArchitectureAiReview[]) => {
    if (!versions.length) return;
    const canonical = await loadCanonicalArquitetoArtifacts(selectedBrandId);
    const confirmed = new Map(canonical.aiReviews.map(version => [version.versionId, version]));
    const missing = versions.filter(version => confirmed.get(version.versionId)?.contentHash !== version.contentHash);
    if (missing.length) {
      throw new Error(`A revisão da IA não foi confirmada no readback canônico. Artigos: ${missing.map(version => version.payload.articleId).join(", ")}.`);
    }
  };

  const handleRevalidateStructure = () => {
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione os artigos cujas keywords devem ser revisadas pela IA.");
      return;
    }
    // O gate da SERP é por Article: quem tem avaliação válida segue para a IA.
    const missingSerp = groups.filter(group => !latestSerpAssessmentFor(group.publishedAnchorId || group.id));
    const eligibleGroups = groups.filter(group => latestSerpAssessmentFor(group.publishedAnchorId || group.id));
    if (missingSerp.length && !eligibleGroups.length) {
      showNotification("error", "Valide a SERP antes de revisar com IA. A revisão manual continua disponível sem IA.");
      return;
    }
    if (missingSerp.length) {
      showNotification("error", missingSerp.length + " artigo(s) ficaram de fora da revisão com IA por falta de SERP válida; os demais seguem normalmente.");
    }
    const currentGroups = describeAssignedGroups(masterList);
    // Unidade canônica da IA é o Article: um request por artigo, sequencial.
    const batches = buildArticleReviewBatches(eligibleGroups);
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "keyword_review",
      label: "Revisar repartição das keywords com IA",
      execute: async update => {
        const reviews: KeywordArticleReview[] = [];
        // Falha de execução (não chegou/não voltou do provider) e falha de
        // registro canônico são acumuladas separadamente: só a primeira
        // impede o Article de contar como revisado.
        const failures: Array<{ articleId: string; message: string }> = [];
        const registrationFailures: Array<{ articleId: string; message: string }> = [];
        const executionStates: Array<{ articleId: string; state: ArticleAiExecutionState }> = [];
        const persistedReviews: VersionedArticleArchitectureAiReview[] = [];
        const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
        for (let index = 0; index < batches.length; index += 1) {
          const batchArticleId = batches[index][0]?.articleId || batches[index][0]?.groupId || `lote-${index + 1}`;
          update({ message: `Revisando artigo ${index + 1} de ${batches.length} sem gerar DNA...`, current: index, total: batches.length });
          // O foco é um Article; o catálogo continua trazendo os candidatos
          // relevantes. Sem eles a IA não tem como propor movimento, reforço de
          // publicado ou detectar canibalização entre artigos.
          const articleCatalog = buildRelevantArticleCatalog(currentGroups, batches[index]);
          const catalogGroupIds = new Set(articleCatalog.map(article => article.groupId));
          const logicalRecommendations = buildLogicalKeywordRecommendations(currentGroups, batches[index]).map(recommendation => {
            if (!recommendation.bestTargetGroupId || catalogGroupIds.has(recommendation.bestTargetGroupId)) return recommendation;
            return { ...recommendation, bestTargetGroupId: null, bestTargetFit: null, bestTargetPublished: false, recommendation: "avaliar_novo_artigo" as const, reason: `${recommendation.reason} O artigo-alvo ficou fora do catalogo enviado a IA.` };
          });
          const strategicPayload = {
            focusGroups: batches[index],
            articleCatalog,
            logicalRecommendations,
            brand: brandContext,
            serpAssessments: batches[index]
              .map(group => projectSerpAssessmentForStrategicReview(latestSerpAssessmentFor(group.publishedAnchorId || group.groupId)))
              .filter((assessment): assessment is StrategicSerpAssessment => Boolean(assessment)),
            silos: Object.values(acceptedSiloDnas).map(version => projectSiloForStrategicReview(version.payload as unknown as Record<string, unknown>)),
            publishedProtections: batches[index].flatMap(group => {
              const articleId = group.publishedAnchorId || group.groupId;
              const article = articlesList.find(candidate => articleEntityIdFor(candidate) === articleId);
              if (!article?.isPublished) return [];
              const dna = acceptedArticleDnas[articleId];
              return [{
                articleId,
                brandId: selectedBrandId,
                principalKeywordId: article.mainKeywordObj?.id || dna?.payload.principalKeywordId || null,
                publishedUrl: publicationUrlFor(article),
                slug: article.slug,
                canonical: article.mainKeywordObj?.canonical || dna?.payload.canonical || null,
                siloId: article.siloId || dna?.payload.siloId || null,
                primaryKeywordPolicy: dna?.payload.primaryKeywordPolicy || article.mainKeywordObj?.primaryKeywordPolicy || null,
                protectedFields: ["url", "slug", "canonical", "brand"],
              }];
            }),
          };
          // Guard determinístico antes da chamada: exceder o limite vira erro
          // específico daquele Article, não falha genérica do lote.
          const measurement = measureStrategicPayload(strategicPayload, AI_STRATEGIC_PAYLOAD_LIMIT);
          if (!measurement.withinLimit) {
            failures.push({
              articleId: batchArticleId,
              message: `Contexto estratégico de ${measurement.bytes} caracteres excede o limite de ${measurement.limit}. Maiores contribuintes: ${measurement.topContributors.map(item => `${item.key} (${item.bytes})`).join(", ")}.`,
            });
            executionStates.push({ articleId: batchArticleId, state: "ERROR" });
            continue;
          }
          try {
            const envelope = await callStrategicApiEnvelope<KeywordArticleReview>("/api/revalidate-structure", strategicPayload, "ai");
            const review = envelope.data;
            reviews.push(review);
            const material = materialKeywordArticleDecisions(review, keywordId =>
              masterListRef.current.find(item => String(item.id) === String(keywordId))?.reviewRole as ManualKeywordRole | undefined);
            // Execução concluída: com ou sem proposta, o Article foi revisado.
            executionStates.push({ articleId: batchArticleId, state: material.length ? "COMPLETED_WITH_PROPOSALS" : "COMPLETED_NO_PROPOSALS" });
            // NO_OP também é resultado: sem gravar, o F5 mostraria "Não executada".
            // Registro canônico é durabilidade, não execução: falhar aqui não
            // desfaz a revisão nem transforma o Article em erro de IA.
            try {
              if (!actorUserId) throw new Error("Sessão autenticada ausente; a revisão não foi registrada.");
              const sourceGroup = eligibleGroups.find(group => (group.publishedAnchorId || group.id) === batchArticleId);
              if (!sourceGroup) throw new Error("O artigo revisado saiu da seleção antes do registro canônico.");
              const articleKeywordIds = new Set(sourceGroup.keywords.map(keyword => String(keyword.id)));
              const proposals: ArticleAiReviewProposalInput[] = material
                .filter(decision => articleKeywordIds.has(String(decision.keywordId)))
                .map(decision => {
                  const keyword = masterListRef.current.find(item => String(item.id) === String(decision.keywordId));
                  return {
                    keywordId: String(decision.keywordId),
                    keyword: keyword?.keyword || null,
                    changeType: decision.action,
                    currentRole: (keyword?.reviewRole as ManualKeywordRole | undefined) || null,
                    currentSiloId: sourceGroup.suggestedSiloId || null,
                    proposedRole: decision.suggestedRole,
                    targetArticleId: decision.targetGroupId,
                    newArticleKey: decision.newArticleKey,
                    siloAction: decision.siloPlacement.action,
                    siloId: decision.siloPlacement.siloId,
                    siloName: decision.siloPlacement.siloName,
                    newSiloKey: decision.siloPlacement.newSiloKey,
                    reason: decision.justification,
                    evidence: decision.humanDecisionPoints,
                  };
                });
              persistedReviews.push(await persistArticleAiReviewVersion({
                articleId: batchArticleId,
                payload: buildArticleAiReviewPayload({
                  brandId: selectedBrandId,
                  articleId: batchArticleId,
                  base: await articleAiReviewBaseFor(sourceGroup),
                  provider: typeof envelope.diagnostic?.provider === "string" ? envelope.diagnostic.provider : "deepseek",
                  model: typeof envelope.diagnostic?.model === "string" ? envelope.diagnostic.model : null,
                  promptContract: null,
                  rawProposalCount: review.decisions.filter(decision => articleKeywordIds.has(String(decision.keywordId))).length,
                  proposals,
                }),
                actorUserId,
                changeReason: "Revisão arquitetural por IA executada por Article.",
                origin: "ai",
              }));
            } catch (error) {
              registrationFailures.push({ articleId: batchArticleId, message: error instanceof Error ? error.message : "Falha não identificada no registro canônico da revisão." });
            }
          } catch (error) {
            // Falha de execução de um Article não cancela os demais.
            failures.push({ articleId: batchArticleId, message: error instanceof Error ? error.message : "Falha não identificada na revisão com IA." });
            executionStates.push({ articleId: batchArticleId, state: "ERROR" });
          }
        }
        if (!reviews.length) {
          throw new Error(failures[0]?.message || "A revisão com IA não produziu resultado para os artigos selecionados.");
        }
        update({ message: "Confirmando o registro canônico da revisão...", current: batches.length, total: batches.length });
        try {
          await readbackArticleAiReviews(persistedReviews);
        } catch (error) {
          // O readback confirma durabilidade, não execução. Sem confirmação o
          // lote nunca é SUCCESS, mas os Articles revisados continuam revisados.
          for (const version of persistedReviews) {
            registrationFailures.push({ articleId: version.payload.articleId, message: error instanceof Error ? error.message : "Readback canônico não confirmado." });
          }
        }
        update({ message: "Repartição revisada; aguardando decisão humana.", current: batches.length, total: batches.length });
        return { kind: "keyword_review", review: mergeKeywordArticleReviews(reviews), batchCount: batches.length, aiFailures: failures, aiRegistrationFailures: registrationFailures, aiExecutionStates: executionStates, aiReviewVersions: persistedReviews, mutationArticleIds: groups.map(group => group.publishedAnchorId || group.id), mutationKeywordIds: groups.flatMap(group => group.keywordIds) };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a revisão das keywords.");
  };

  const toggleRejectedKeywordReview = (keywordId: string) => {
    setRejectedKeywordReviewIds(previous => {
      const next = new Set(previous);
      if (next.has(keywordId)) next.delete(keywordId); else next.add(keywordId);
      return next;
    });
  };

  /**
   * Registra a decisão humana por proposta. Devolve mensagem de erro quando a
   * gravação não confirma; a cópia de trabalho já mudou, então o usuário
   * precisa saber que o registro da decisão ficou para trás.
   */
  const persistHumanProposalDecisions = async (input: { acceptedKeywordIds: Set<string>; rejectedKeywordIds: Set<string> }) => {
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId) return "As propostas foram aplicadas, mas a decisão humana não foi registrada: sessão autenticada ausente.";
    const updated: VersionedArticleArchitectureAiReview[] = [];
    try {
      for (const [articleId, version] of Object.entries(articleAiReviewsRef.current)) {
        type HumanProposalDecision = { proposalId: string; reviewState: "accepted" | "rejected" };
        const decisions = version.payload.proposals.flatMap<HumanProposalDecision>(proposal => {
          if (input.acceptedKeywordIds.has(proposal.keywordId)) return [{ proposalId: proposal.proposalId, reviewState: "accepted" }];
          if (input.rejectedKeywordIds.has(proposal.keywordId)) return [{ proposalId: proposal.proposalId, reviewState: "rejected" }];
          return [];
        });
        if (!decisions.length) continue;
        updated.push(await persistArticleAiReviewVersion({
          articleId,
          payload: applyHumanProposalDecisions(version.payload, decisions, actorUserId),
          actorUserId,
          changeReason: "Decisão humana registrada sobre a proposta da IA.",
          origin: "human",
        }));
        articleAiReviewsRef.current = { ...articleAiReviewsRef.current, [articleId]: updated[updated.length - 1] };
      }
      await readbackArticleAiReviews(updated);
    } catch (error) {
      return `As propostas foram aplicadas, mas a decisão humana não foi registrada: ${error instanceof Error ? error.message : "falha na persistência canônica."}`;
    }
    if (updated.length) {
      setArticleAiReviews(previous => ({ ...previous, ...Object.fromEntries(updated.map(version => [version.payload.articleId, version])) }));
    }
    return null;
  };

  const applyPendingKeywordReview = async () => {
    const pending = pendingKeywordReview;
    if (!pending) return;
    const acceptedDecisions = pending.review.decisions.filter(decision => !rejectedKeywordReviewIds.has(decision.keywordId));
    if (!acceptedDecisions.length) {
      showNotification("error", "Rejeite menos uma proposta antes de aplicar a revisão.");
      return;
    }
    const current = masterListRef.current;
    const reviewToApply: KeywordArticleReview = { ...pending.review, decisions: acceptedDecisions };
    const mutationKeywordIds = new Set(pending.mutationKeywordIds);
    const currentMutationScope = current.filter(keyword => mutationKeywordIds.has(String(keyword.id)));
    const nextMutationScope = applyKeywordArticleReview(currentMutationScope, reviewToApply);
    const next = mergeScopedArticleProcessOutput({
      masterList: current,
      mutationKeywordIds,
      mutationOutput: nextMutationScope,
    });
    const acceptedIds = new Set(acceptedDecisions.map(decision => decision.keywordId));
    const nextAnnotations = next.filter(keyword => acceptedIds.has(keyword.id)).map(keyword => keyword.aiReviewAnnotation)
      .filter((annotation): annotation is AIReviewAnnotation => Boolean(annotation));
    const persisted = await persistWorkingCopyAssignmentsRef.current?.(nextMutationScope) ?? false;
    if (!persisted) {
      showNotification("error", "A proposta não foi aplicada: a working copy não confirmou o salvamento.");
      return;
    }
    pushMasterHistory(current, "Aplicar proposta de repartição da IA para revisão humana");
    setMasterList(next);
    setProvisionalGroups(describeAssignedGroups(next));
    addAiReviewAnnotations(nextAnnotations);
    setPendingKeywordReview(null);
    setRejectedKeywordReviewIds(new Set());
    // Aceitar proposta não aprova ArticleDNA: a decisão humana é registrada
    // como sucessora da própria revisão, sem reescrever o resultado da IA.
    const decisionMessage = await persistHumanProposalDecisions({
      acceptedKeywordIds: acceptedIds,
      rejectedKeywordIds: new Set(pending.review.decisions.map(decision => decision.keywordId).filter(keywordId => rejectedKeywordReviewIds.has(keywordId))),
    });
    showNotification(decisionMessage ? "error" : "success", decisionMessage
      || `${acceptedDecisions.length} proposta(s) aplicada(s) à cópia de trabalho. Revise e ajuste manualmente antes de confirmar.`);
  };

  const handleGenerateArticleDnas = () => {
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione ao menos um artigo para gerar DNA.");
      return;
    }
    const publishedVersions = Object.values(acceptedArticleDnas).filter(version => Boolean(version.payload.publishedIdentityRef));
    const publishedCompatibilityIssues = groups.flatMap(group => publishedArticleCompatibilityIssues(group.keywordIds, group.publishedAnchorId || group.id, publishedVersions));
    if (publishedCompatibilityIssues.length) {
      showNotification("error", publishedCompatibilityIssues[0] || "Existe artigo publicado compatível; fortaleça-o antes de criar outra URL.");
      return;
    }
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "article_dna",
      label: "Gerar definição artigo por artigo",
      execute: async update => {
        const versions: VersionEnvelope<ArticleDNA>[] = [];
        const events: VersionStatusEvent[] = [];
        for (let index = 0; index < groups.length; index += 1) {
          update({ message: `Gerando definição ${index + 1} de ${groups.length}...`, current: index, total: groups.length });
          const group = groups[index];
          const assessment = latestSerpAssessmentFor(group?.publishedAnchorId || group?.id);
          const batch = await callStrategicApi<{ versions: VersionEnvelope<ArticleDNA>[]; events: VersionStatusEvent[] }>("/api/arquiteto/article-dna", {
            groups: [group], brand: brandContext,
            ...(assessment ? { serpAssessmentRefs: { [group?.publishedAnchorId || group?.id]: {
              entityId: assessment.id,
              versionId: `${assessment.id}:v${assessment.version}`,
              contentHash: assessment.contentHash,
            } } } : {}),
          }, "ai");
          if (batch.versions.length !== 1 || batch.events.length < 1) {
            throw new Error(`O artigo ${index + 1} não retornou uma definição completa do artigo. Nada foi aplicado.`);
          }
          versions.push(...batch.versions); events.push(...batch.events);
        }
        if (versions.length !== groups.length) {
          throw new Error(`A IA concluiu ${versions.length} de ${groups.length} definições de artigo. Nada foi aplicado.`);
        }
        update({ message: "Definições dos artigos disponíveis na planilha para revisão.", current: groups.length, total: groups.length });
        return { kind: "article_dna", versions, events };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a geração da definição do artigo.");
  };

  const handleGenerateSiloDnas = () => {
    if (workspaceMode !== "silos") {
      showNotification("error", "A arquitetura de Silos só pode ser processada na aba Silos.");
      return;
    }
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione artigos dos silos que deseja analisar.");
      return;
    }
    const siloMap = new Map<string, { id: string; name: string; articleVersions: VersionEnvelope<ArticleDNA>[] }>();
    for (const group of groups) {
      if (!group.suggestedSiloId) continue;
      const articleVersion = acceptedArticleDnas[group.publishedAnchorId || group.id];
      if (!articleVersion || effectiveVersionStatus(articleVersion.versionId, versionEvents) !== "approved") continue;
      const id = String(group.suggestedSiloId);
      const current = siloMap.get(id) || { id, name: group.suggestedSiloName || "Silo", articleVersions: [] };
      current.articleVersions.push(articleVersion);
      siloMap.set(id, current);
    }
    if (!siloMap.size) {
      showNotification("error", "Aceite primeiro a definição dos artigos selecionados e confirme o silo.");
      return;
    }
    const silos = [...siloMap.values()];
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "silo_dna",
      label: "Gerar arquitetura silo por silo",
      execute: async update => {
        const versions: VersionEnvelope<SiloDNA>[] = [];
        const events: VersionStatusEvent[] = [];
        for (let index = 0; index < silos.length; index += 1) {
          update({ message: `Gerando arquitetura ${index + 1} de ${silos.length}...`, current: index, total: silos.length });
          const batch = await callStrategicApi<{ versions: VersionEnvelope<SiloDNA>[]; events: VersionStatusEvent[] }>("/api/arquiteto/silo-dna", {
            silos: [silos[index]], brand: brandContext,
          }, "ai");
          if (batch.versions.length !== 1 || batch.events.length < 1) {
            throw new Error(`O silo ${index + 1} não retornou uma arquitetura completa do silo. Nada foi aplicado.`);
          }
          versions.push(...batch.versions); events.push(...batch.events);
        }
        update({ message: "Arquiteturas dos silos disponíveis na planilha para revisão.", current: silos.length, total: silos.length });
        return { kind: "silo_dna", versions, events };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a geração da arquitetura do silo.");
  };

  const siloPageStatus = useCallback((siloId: string | null): string => {
    if (!siloId) return "none";
    const entityId = `silo-page:${siloId}`;
    const pageVersion = acceptedSiloPages[entityId];
    if (!pageVersion) return "pending";
    const versionStatus = effectiveVersionStatus(pageVersion.versionId, versionEvents);
    if (radarItems.some(item => item.articleId === entityId)) return "sent_radar";
    if (versionStatus === "approved") return "approved";
    if (versionStatus === "proposed") return "awaiting_approval";
    return "pending";
  }, [acceptedSiloPages, versionEvents, radarItems]);

  const handleGenerateSiloPageForSilo = async (siloId: string, siloName: string) => {
    const actorId = session?.user?.id || "human-reviewer";
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca antes de salvar a página do silo."); return; }
    const siloDnaVersion = acceptedSiloDnas[siloId];
    if (!siloDnaVersion) { showNotification("error", "Gere a arquitetura deste silo primeiro."); return; }
    const entityId = `silo-page:${siloId}`;
    const current = acceptedSiloPages[entityId];
    const currentStatus = current ? effectiveVersionStatus(current.versionId, versionEvents) : null;
    if (current && currentStatus !== "rejected" && currentStatus !== "superseded") {
      showNotification("error", "Este silo já possui uma Página do Silo.");
      return;
    }
    const slug = siloName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const payload = deterministicSiloPagePayload(siloDnaVersion, selectedBrandId, slug);
    const version = await createVersionEnvelope({ entityId, versionNumber: (current?.versionNumber || 0) + 1,
      previousVersionId: current?.versionId || null, origin: "system", changeReason: "Página do Silo criada pela lógica determinística.", createdBy: actorId, payload });
    const persisted = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "silo_page", action: current ? "edit" : "create", version });
    const canonicalVersion = persisted.version as VersionEnvelope<SiloPage>;
    setAcceptedSiloPages(previous => ({ ...previous, [entityId]: canonicalVersion }));
    addVersionEvents([createStatusEvent(canonicalVersion.versionId, "proposed", canonicalVersion.createdBy, "Página do Silo pronta para revisão humana.")]);
    addVersionEvents([createStatusEvent(version.versionId, "proposed", actorId, "Página do Silo pronta para revisão humana.")]);
    showNotification("success", "Página do Silo gerada. Status: Aguardando aprovação.");
  };

  const handleVerifySiloPage = async (pageVersion: VersionEnvelope<SiloPage>) => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma Brand antes de persistir a verificação."); return; }
    if (pageVersion.payload.publicationStatus !== "published" || !pageVersion.payload.publishedUrl) { showNotification("error", "A conferência exige uma página do silo publicada com URL registrada."); return; }
    setVerifyingSiloPageId(pageVersion.payload.siloPageId);
    try {
      const response = await fetch("/api/arquiteto/publication/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        brandId: selectedBrandId, entityType: "silo_page", siloPageId: pageVersion.payload.siloPageId, siloPageVersionId: pageVersion.versionId, url: pageVersion.payload.publishedUrl, sitemapUrl: null,
      }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Não foi possível conferir a página do silo.");
      const raw = body.data?.verification as Record<string, unknown>;
      const status = raw.status === "verified" && raw.declaredCanonical && raw.resolvedUrl && raw.declaredCanonical === raw.resolvedUrl ? "canonical_confirmed" : raw.status === "verified" ? "accessible" : raw.status === "sitemap_match" ? "sitemap_match" : raw.status === "canonical_mismatch" ? "canonical_mismatch" : raw.status === "not_in_sitemap" ? "not_in_sitemap" : raw.status === "unreachable" ? "unreachable" : "error";
      const verification = {
        status, checkedAt: typeof raw.checkedAt === "string" ? raw.checkedAt : new Date().toISOString(), requestedUrl: typeof raw.requestedUrl === "string" ? raw.requestedUrl : pageVersion.payload.publishedUrl,
        resolvedUrl: typeof raw.resolvedUrl === "string" ? raw.resolvedUrl : null, declaredCanonical: typeof raw.declaredCanonical === "string" ? raw.declaredCanonical : null,
        httpStatus: typeof raw.httpStatus === "number" ? raw.httpStatus : null, sitemapUrl: typeof raw.sitemapUrl === "string" ? raw.sitemapUrl : null,
        sitemapMatch: typeof raw.sitemapMatch === "boolean" ? raw.sitemapMatch : null, message: typeof raw.message === "string" ? raw.message : null,
      } as const;
      const successorPayload = SiloPageSchema.parse({ ...pageVersion.payload, publicationVerification: verification });
      const successor = await createVersionEnvelope({ entityId: successorPayload.siloPageId, versionNumber: pageVersion.versionNumber + 1, previousVersionId: pageVersion.versionId, origin: "system", changeReason: "Evidência explícita de verificação da identidade da SiloPage.", createdBy: session?.user?.id || "human-reviewer", payload: successorPayload });
      const persisted = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "silo_page", action: "edit", version: successor });
      const canonicalSuccessor = persisted.version as VersionEnvelope<SiloPage>;
      setAcceptedSiloPages(previous => ({ ...previous, [successorPayload.siloPageId]: canonicalSuccessor }));
      addVersionEvents([createStatusEvent(canonicalSuccessor.versionId, "proposed", canonicalSuccessor.createdBy, "Verificação registrada; revisão humana continua independente da publicação.")]);
      addVersionEvents([createStatusEvent(successor.versionId, "proposed", session?.user?.id || "human-reviewer", "Verificação registrada; revisão humana continua independente da publicação.")]);
      showNotification("success", `Verificação registrada: ${verification.status}. URL, slug e canonical foram preservados.`);
    } catch (error) { showNotification("error", error instanceof Error ? error.message : "Falha na verificação da página do silo."); }
    finally { setVerifyingSiloPageId(null); }
  };

  const handleGenerateSiloPageWithIA = (siloId: string, siloName: string) => {
    const siloDnaVersion = acceptedSiloDnas[siloId];
    if (!siloDnaVersion) { showNotification("error", "Gere a arquitetura deste silo primeiro."); return; }
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "silo_page",
      label: "Detectar viés · Página do Silo (IA)",
      execute: async update => {
        update({ message: "Gerando Página do Silo com IA...", current: 0, total: 1 });
        const batch = await callStrategicApi<{ versions: VersionEnvelope<SiloPage>[]; events: VersionStatusEvent[] }>("/api/arquiteto/silo-page", {
          siloId, siloName, siloDnaVersion, brand: brandContext,
        }, "ai");
        if (batch.versions.length !== 1 || batch.events.length < 1) {
          throw new Error("A IA não retornou uma Página do Silo completa.");
        }
        update({ message: "Página do Silo gerada. Revise na planilha.", current: 1, total: 1 });
        return { kind: "silo_page", versions: batch.versions, events: batch.events };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a geração da Página do Silo.");
  };

  const handleGenerateSelectedSiloPagesWithIA = () => {
    for (const pageEntityId of selectedSiloPageIds) {
      const siloId = pageEntityId.replace('silo-page:', '');
      const siloGroup = groupedArticles.find(g => String(g.siloId) === siloId);
      const siloName = siloGroup?.siloName || siloId;
      handleGenerateSiloPageWithIA(siloId, siloName);
    }
  };

  const toggleSiloPageSelection = (pageEntityId: string) => {
    setSelectedSiloPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageEntityId)) next.delete(pageEntityId); else next.add(pageEntityId);
      return next;
    });
  };

  const toggleSiloExpand = (siloId: string) => {
    setExpandedSiloIds(prev => {
      const next = new Set(prev);
      if (next.has(siloId)) next.delete(siloId); else next.add(siloId);
      return next;
    });
  };


  const sendSelectedToRadar = async () => {
    if (selectedArticleIds.size > 0 && selectedArticleRadarGateIssues.length > 0) {
      showNotification("error", `Radar bloqueado: ${selectedArticleRadarGateIssues.join(" ")}`);
      return;
    }
    let articlesSent = 0, pagesSent = 0, skipped = 0;
    if (selectedArticleIds.size > 0) {
      // A chave é a MESMA da grade e do painel. Ler pelo agrupamento
      // provisório aqui descartava em silêncio todo artigo do cenário.
      const selecionados = articlesList.filter(article => selectedArticleIds.has(article.id))
        .map(article => articleDnaEntryFor({ articleId: articleEntityIdFor(article), candidateRef: article.candidateRef }))
        .filter((entry): entry is { key: string; version: VersionEnvelope<ArticleDNA> } => Boolean(entry.key && entry.version));
      const articleIds = selecionados.map(entry => entry.version.payload.articleId);
      if (articleIds.length) {
        const serpByArticle = Object.fromEntries(articleIds.map(articleId => {
          const assessment = latestSerpAssessmentFor(articleId);
          return assessment ? [articleId, assessment] : [];
        }).filter(([key]) => Boolean(key))) as Record<string, SerpFormationAssessment>;

        /**
         * O contexto arquitetural viaja junto — resolvido, nunca escrito.
         *
         * O `siloId` canônico sai do SiloDNA que declara o mesmo território do
         * Article; a SiloPage e o grafo aprovado vêm atrás. Nenhum ArticleDNA
         * é tocado: preencher `siloId` lá em cima para o Radar enxergar seria
         * alterar um artefato aprovado por conveniência de quem lê depois.
         */
        const grafos = approvedLinkGraphs.length ? approvedLinkGraphs : await loadInternalLinkGraphs(selectedBrandId).catch(() => []);
        const siloVersoes = Object.values(acceptedSiloDnas);
        const paginas = Object.values(acceptedSiloPages);
        const contexto: Record<string, RadarArticleHandoffContext> = {};
        const semSilo: string[] = [];
        for (const entry of selecionados) {
          const resolucao = resolveCanonicalSiloForArticle({
            article: entry.version.payload, siloVersions: siloVersoes, siloPageVersions: paginas,
          });
          if (!resolucao.ok) { semSilo.push(`${entry.version.payload.promise}: ${resolucao.reason}`); continue; }
          const grafo = findApprovedGraphForSilo({ silo: resolucao.context, graphs: grafos });
          const registro = remoteArticleSerp.find(item => item.candidateRef === entry.version.payload.articleId)?.payload;
          contexto[entry.version.payload.articleId] = {
            silo: resolucao.context,
            internalLinks: relevantEdgesForArticle({ graph: grafo, articleDnaVersionId: entry.version.versionId }),
            serpProvenance: registro
              ? buildArchitectSerpProvenance({
                assessmentId: registro.assessment.id,
                formationBaseHash: registro.formationBaseHash,
                verdict: registro.verdict as "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE",
                humanResolution: registro.humanResolution
                  ? {
                    decision: registro.humanResolution.decision,
                    reason: registro.humanResolution.reason,
                    decidedBy: registro.humanResolution.decidedBy,
                    decidedAt: registro.humanResolution.decidedAt,
                  }
                  : null,
              })
              : null,
          };
        }
        const result = await importApprovedToRadar(articleIds, masterList as Array<Record<string, unknown>>, serpByArticle, contexto, approvedLinkGraphs);
        articlesSent = result.imported; skipped += result.skipped;
        for (const item of result.blocked) semSilo.push(`${item.label}: ${item.reasons.join(" ")}`);
        // Recusa é DECLARADA, nunca item mudo — e depois do envio, para incluir
        // o que o importador barrou além do que a resolução já tinha barrado.
        if (semSilo.length) showNotification("warning", `Bloqueado no handoff: ${semSilo.join(" ")}`);
        // §5 · o caminho legado é DECLARADO. Enquanto o `siloId` não vier
        // materializado no ArticleDNA, o pai é lido pelo território — leitura,
        // não conserto — e quem envia precisa ver quantos ainda dependem disso.
        const porLegado = Object.values(contexto)
          .filter(item => item.silo.siloIdProvenance === "LEGACY_TERRITORY_HYDRATION").length;
        if (porLegado) {
          showNotification("warning", `${porLegado} artigo(s) ainda não trazem o Silo gravado no próprio ArticleDNA: ele foi deduzido para este envio. Confirme a formação para gravá-lo no artefato.`);
        }
        setPendingRadarSmokeReadback(articleIds);
      }
    }
    if (selectedSiloPageIds.size > 0) {
      const siloPageIds = [...selectedSiloPageIds].filter(id => {
        const pv = acceptedSiloPages[id];
        return pv && effectiveVersionStatus(pv.versionId, versionEvents) === 'approved';
      });
      if (siloPageIds.length) {
        const result = importApprovedSiloPagesToRadar(siloPageIds);
        pagesSent = result.imported; skipped += result.skipped;
      }
    }
    const parts: string[] = [];
    if (articlesSent) parts.push(`${articlesSent} artigo(s)`);
    if (pagesSent) parts.push(`${pagesSent} página(s) do silo`);
    if (skipped) parts.push(`${skipped} já existente(s)`);
    showNotification(articlesSent || pagesSent ? 'success' : 'error', parts.length ? parts.join(', ') + ' enviada(s) ao Radar.' : 'Nenhum item aprovado selecionado.');
  };

  // O handoff ao Radar é ação explícita e posterior a Silos e Links Internos:
  // aprovar o ArticleDNA não cria RadarItem.

  useEffect(() => {
    if (!pendingRadarSmokeReadback?.length) return;
    const issues = pendingRadarSmokeReadback.flatMap(articleId => {
      const version = acceptedArticleDnas[articleId];
      const radar = radarItems.find(item => item.articleId === articleId);
      if (!version || !radar) return [`ArticleDNA ${articleId} ainda não apareceu no readback do Radar.`];
      const expectedReferences = version.payload.keywordReferences.map(reference => reference.keywordId).sort();
      const actualReferences = (radar.arquitetoKeywordDnaReferences || []).map(reference => reference.keywordId).sort();
      return [
        radar.articleDnaVersionId === version.versionId ? null : `Versão do ArticleDNA divergente no Radar para ${articleId}.`,
        radar.articleDnaContentHash === version.contentHash ? null : `Hash do ArticleDNA divergente no Radar para ${articleId}.`,
        JSON.stringify(actualReferences) === JSON.stringify(expectedReferences) ? null : `Refs de KeywordDNA incompletas no Radar para ${articleId}.`,
      ].filter((issue): issue is string => Boolean(issue));
    });
    const timer = window.setTimeout(() => {
      setPendingRadarSmokeReadback(null);
      showNotification(issues.length ? "error" : "success", issues.length ? `Smoke ArticleDNA → Radar bloqueado: ${issues.join(" ")}` : "Smoke ArticleDNA → Radar concluído com refs, versão e hash preservados.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [acceptedArticleDnas, pendingRadarSmokeReadback, radarItems, showNotification]);

  useEffect(() => {
    if (loading) return;
    const task = architectTasks.find(candidate => candidate.status === "completed" && !candidate.consumed && candidate.result);
    if (!task) return;
    const result = task.result as ArchitectBackgroundResult;
    if (result.kind === "logical_grouping") {
      // A execução só vira resultado visível depois que a working copy recebe
      // confirmação do writer canônico. O task é consumido antes do await para
      // impedir reaplicação em uma renderização intermediária.
      consumeBackgroundTask(task.id);
      void (async () => {
        const persisted = await persistWorkingCopyAssignmentsRef.current?.(result.mutationItems) ?? false;
        if (!persisted) {
          showNotification("error", "A lógica terminou, mas a working copy não confirmou o salvamento; nenhum agrupamento foi aplicado.");
          return;
        }
        pushMasterHistory(masterListRef.current, "Processar lógica sem IA e agrupar keywords em artigos");
        setProvisionalGroups(result.groups);
        setMapLogicGroupsSnapshot(result.groups);
        setMasterList(result.regrouped);
        showNotification("success", scopedArticleProcessNotification({
          processedArticleCount: result.processedArticleIds.length,
          processedKeywordCount: result.processedKeywordIds.length,
          workspaceArticleCount: result.workspaceArticleCount,
          reservedCandidateCount: result.siloCandidates.length,
        }));
      })();
      return;
    } else if (result.kind === "keyword_review") {
      // A resposta da IA é uma proposta. Nenhum silo, papel, principal ou
      // ArticleDNA muda até o usuário revisar e autorizar explicitamente.
      setPendingKeywordReview({ review: result.review, batchCount: result.batchCount, aiFailures: result.aiFailures, aiRegistrationFailures: result.aiRegistrationFailures, aiExecutionStates: result.aiExecutionStates, mutationArticleIds: result.mutationArticleIds, mutationKeywordIds: result.mutationKeywordIds, createdAt: new Date().toISOString() });
      setMapAiKeywordReviewSnapshot({ review: result.review, batchCount: result.batchCount, mutationArticleIds: result.mutationArticleIds, mutationKeywordIds: result.mutationKeywordIds, createdAt: new Date().toISOString() });
      setMapAiArticlesSnapshot(previous => previous || architectureMapSnapshots.current.articles);
      setMapAiSilosSnapshot(previous => previous || architectureMapSnapshots.current.silos);
      setRejectedKeywordReviewIds(new Set());
      if (result.aiReviewVersions?.length) {
        setArticleAiReviews(previous => ({
          ...previous,
          ...Object.fromEntries(result.aiReviewVersions!.map(version => [version.payload.articleId, version])),
        }));
      }
      // O toast anuncia a classificação final, não a contagem bruta do provider.
      const materialDecisions = materialKeywordArticleDecisions(result.review, keywordId =>
        masterListRef.current.find(item => String(item.id) === String(keywordId))?.reviewRole as ManualKeywordRole | undefined);
      // Conclusão vem do estado de execução por Article, não de `batchCount`
      // menos falhas: registro canônico pendente e proposta aguardando decisão
      // humana não são falha de execução da IA.
      const outcome = describeArticleAiBatchOutcome({
        summary: summarizeArticleAiExecutionStates(result.aiExecutionStates || []),
        materialProposalCount: materialDecisions.length,
        registrationFailureCount: result.aiRegistrationFailures?.length || 0,
      });
      showNotification(outcome.severity, outcome.message);
    } else if (result.kind === "article_dna") {
      if (!result.versions.length || !result.events.length) {
        showNotification("error", "A tarefa terminou sem produzir a definição do artigo. Nenhum status foi alterado; execute novamente.");
        consumeBackgroundTask(task.id);
        return;
      }
      const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
      if (!actorUserId || !selectedBrandId) {
        showNotification("error", "Sessão autenticada ausente; a proposta de ArticleDNA não foi aplicada.");
        consumeBackgroundTask(task.id);
        return;
      }
      const nextVersions = { ...acceptedArticleDnas, ...Object.fromEntries(result.versions.map(item => [item.payload.articleId, item])) };
      const nextEvents = [...versionEvents, ...result.events];
      setAcceptedArticleDnas(nextVersions);
      addVersionEvents(result.events);
      try {
        const versionIds = new Set(Object.values(nextVersions).map(version => version.versionId));
        const recovery = ArchitectArticleDnaRecoverySchema.parse({ schemaVersion: 1, versions: nextVersions,
          events: nextEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectArticleDnaRecoveryKey(actorUserId, selectedBrandId), recovery)
          .then(() => showNotification("success", `${result.versions.length} definição(ões) de artigo aplicadas e salvas. O status agora aguarda aprova├º├úo.`))
          .catch(() => showNotification("error", "A definição do artigo foi aplicada, mas o navegador recusou o salvamento dur├ível."));
      } catch (error) { console.error("[arquiteto] ArticleDNA", error); showNotification("error", "A definição do artigo retornada n├úo p├┤de ser validado para salvamento."); }
    } else if (result.kind === "silo_dna") {
      if (!result.versions.length || !result.events.length) {
        showNotification("error", "A tarefa terminou sem produzir a arquitetura do silo. Nenhum resultado foi aplicado.");
        consumeBackgroundTask(task.id);
        return;
      }
      const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
      if (!actorUserId || !selectedBrandId) {
        showNotification("error", "Sessão autenticada ausente; a proposta de SiloDNA não foi aplicada.");
        consumeBackgroundTask(task.id);
        return;
      }
      const nextVersions = { ...acceptedSiloDnas, ...Object.fromEntries(result.versions.map(item => [item.payload.siloId, item])) };
      const nextEvents = [...versionEvents, ...result.events];
      setAcceptedSiloDnas(nextVersions);
      addVersionEvents(result.events);
      try {
        const versionIds = new Set(Object.values(nextVersions).map(version => version.versionId));
        const recovery = ArchitectSiloDnaRecoverySchema.parse({ schemaVersion: 1, versions: nextVersions,
          events: nextEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectSiloDnaRecoveryKey(actorUserId, selectedBrandId), recovery)
          .then(() => showNotification("success", `${result.versions.length} arquitetura(s) de silo aplicadas e salvas. Revise os resumos na planilha.`))
          .catch(() => showNotification("error", "A arquitetura do silo foi aplicada, mas o navegador recusou o salvamento dur├ível."));
      } catch (error) { console.error("[arquiteto] SiloDNA", error); showNotification("error", "A arquitetura do silo retornada n├úo p├┤de ser validado para salvamento."); }
    } else if (result.kind === "silo_page") {
      if (!result.versions.length || !result.events.length) {
        showNotification("error", "A tarefa terminou sem produzir Pagina do Silo.");
        consumeBackgroundTask(task.id);
        return;
      }
      const nextVersions = { ...acceptedSiloPages, ...Object.fromEntries(result.versions.map(item => [item.payload.siloPageId, item])) };
      setAcceptedSiloPages(nextVersions);
      addVersionEvents(result.events);
      showNotification("success", `${result.versions.length} Pagina(s) do Silo gerada(s) com IA.`);
    }
    consumeBackgroundTask(task.id);
  }, [architectTasks, loading, consumeBackgroundTask, setAcceptedArticleDnas, setAcceptedSiloDnas, setAcceptedSiloPages, addVersionEvents, addAiReviewAnnotations, masterHistory.capture]);

    const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpandKw = (id: string) => {
    setExpandedKwIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── 3. FUSÃO E TRANSFORMAÇÃO: LISTA DE ARTIGOS (1 por Cluster) ──
  const toggleVisibleSiloArticleSelection = (visibleSiloArticleIds: string[], mode: "group" = "group") => {
    if (mode !== "group") return;
    markSelectionInteraction("silo-group-selection");
    setSelectedArticleIds(previous => toggleVisibleArticleSelection(previous, visibleSiloArticleIds));
  };

  const persistWorkingCopyAssignments = async (items: any[], options: { updateLocalLocks?: boolean } = {}) => {
    if (!selectedBrandId) return false;
    const updates = items.map(item => {
      const workflow = item.canonicalWorkflow;
      if (!workflow?.id || !Number.isInteger(workflow.lockVersion)) return null;
      return {
        workflowItemId: String(workflow.id),
        expectedLock: Number(workflow.lockVersion),
        assignment: {
          workingArticleId: item.workingArticleId != null ? String(item.workingArticleId) : null,
          clusterId: item.clusterId != null ? String(item.clusterId) : item.provisionalGroupId ? String(item.provisionalGroupId) : null,
          provisionalGroupId: item.provisionalGroupId != null ? String(item.provisionalGroupId) : item.clusterId != null ? String(item.clusterId) : null,
          siloId: item.siloId != null ? String(item.siloId) : null,
          silo_id: item.silo_id != null ? String(item.silo_id) : null,
          siloName: item.siloName || null,
          computedSlug: item.computedSlug || item.slug_sugerido || null,
          computedHierarquia: item.computedHierarquia || item.hierarquia || null,
          ...(item.reviewRole ? { role: item.reviewRole } : {}),
          ...(item.siloCandidate ? { siloCandidate: item.siloCandidate } : {}),
          ...(item.articleKgrDecision ? { articleKgrDecision: item.articleKgrDecision } : {}),
          manualEdit: true,
        },
      };
    }).filter((update): update is NonNullable<typeof update> => Boolean(update));
    if (!updates.length) return true;
    try {
      const result = await persistArchitectWorkingCopy({ brandId: selectedBrandId, updates });
      const rows = new Map(result.items.map(row => {
        const candidate = row as Record<string, unknown>;
        return typeof candidate.id === "string" ? [candidate.id, candidate] as const : null;
      }).filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry)));
      if (rows.size && options.updateLocalLocks !== false) {
        setMasterList(previous => previous.map(item => {
          const workflow = item.canonicalWorkflow as Record<string, unknown> | undefined;
          if (!workflow || typeof workflow.id !== "string") return item;
          const row = rows.get(workflow.id);
          if (!row) return item;
          return { ...item, ...(row.payload && typeof row.payload === "object" && (row.payload as Record<string, unknown>).kgrIdentity ? { kgrIdentity: (row.payload as Record<string, unknown>).kgrIdentity } : {}), canonicalWorkflow: { ...workflow, lockVersion: Number(row.lock_version || workflow.lockVersion), updatedAt: String(row.updated_at || workflow.updatedAt), payload: row.payload || workflow.payload } };
        }));
      }
      return true;
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "A alteração não foi confirmada no workspace canônico.");
      setCanonicalWorkspaceReload(current => current + 1);
      return false;
    }
  };
  persistWorkingCopyAssignmentsRef.current = persistWorkingCopyAssignments;

  const articleKeywordIds = (article: { mainKeywordObj: { id: string } | null; supportKeywords: Array<{ id: string }> }) => new Set([
    ...(article.mainKeywordObj ? [String(article.mainKeywordObj.id)] : []),
    ...article.supportKeywords.map(keyword => String(keyword.id)),
  ]);

  const confirmSiloAssignmentReadback = async (items: any[], silo: CanonicalSiloOption | null) => {
    if (!selectedBrandId) return false;
    try {
      const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
      const workflowById = new Map(canonical.workflowItems.map(item => [item.id, item]));
      const expectedSiloId = silo?.id || null;
      const confirmed = items.every(item => {
        const workflowId = item.canonicalWorkflow?.id;
        const payload = workflowId ? workflowById.get(String(workflowId))?.payload : null;
        const persistedSiloId = payload && (payload.siloId ?? payload.silo_id);
        return expectedSiloId ? persistedSiloId === expectedSiloId : persistedSiloId == null;
      });
      if (confirmed) setSiloOptions(canonicalSiloOptions(canonical.siloDnas, canonical.siloPages));
      return confirmed;
    } catch {
      return false;
    }
  };

  const updateArticleSilo = async (article: any, silo: CanonicalSiloOption | null) => {
    const keywordIds = articleKeywordIds(article);
    if (!keywordIds.size) return false;
    const nextMasterList = assignSiloToArticleMembers(masterList, keywordIds, silo);
    const affectedItems = nextMasterList.filter(item => keywordIds.has(String(item.id)));
    const persisted = await persistWorkingCopyAssignments(affectedItems, { updateLocalLocks: false });
    if (!persisted) return false;
    if (!await confirmSiloAssignmentReadback(affectedItems, silo)) {
      showNotification("error", "A mudança foi enviada, mas o readback canônico ainda não confirmou o silo do artigo. O estado anterior foi mantido na tela.");
      setCanonicalWorkspaceReload(current => current + 1);
      return false;
    }
    pushMasterHistory(masterList, `Mover artigo para ${silo?.nome || "Sem silo"}`);
    setMasterList(nextMasterList);
    setProvisionalGroups(describeAssignedGroups(nextMasterList));
    setCanonicalWorkspaceReload(current => current + 1);
    return true;
  };

  const persistArticleIdentityField = (article: any, field: "computedSlug" | "computedHierarquia", value: string) => {
    const keywordId = article.mainKeywordObj?.id;
    if (!keywordId || article.isPublished && field === "computedSlug") return;
    if (field === "computedHierarquia" && workspaceMode !== "silos") {
      showNotification("error", "Pilar e Suporte só podem ser definidos na aba Silos.");
      return;
    }
    const nextMasterList = masterList.map(item => item.id === keywordId
      ? { ...item, [field]: value, ...(field === "computedSlug" ? { slug_sugerido: value } : { hierarquia: value }) }
      : item);
    setMasterList(nextMasterList);
    void persistWorkingCopyAssignments(nextMasterList.filter(item => item.id === keywordId));
  };

  const handleDetachArticle = async (art: any): Promise<boolean> => {
    if (art.isPublished) {
      showNotification("error", "Artigos publicados sao bloqueados e nao podem ser removidos do Silo.");
      return false;
    }
    const moved = await updateArticleSilo(art, null);
    if (moved) showNotification("success", "Artigo movido para Sem silo.");
    return moved;
  };

  const handleMoveArticleToSilo = async (art: any, siloId: string): Promise<boolean> => {
    if (art.isPublished) {
      showNotification("error", "Artigos publicados ja foram validados no site e nao podem mudar de Silo.");
      return false;
    }
    if (!siloId) {
      return handleDetachArticle(art);
    }

    const target = siloOptions.find(silo => silo.id === siloId);
    if (!target) return false;

    const moved = await updateArticleSilo(art, target);
    if (moved) showNotification("success", `Artigo movido para ${target.nome}.`);
    return moved;
  };

  const handleMoveSelectedArticlesToSilo = async (siloId: string) => {
    if (!siloId) return;
    const target = siloOptions.find(silo => silo.id === siloId);
    if (!target) return;
    const selectedArticles = articlesList.filter(article => selectedArticleIds.has(article.id) && !article.isPublished);
    if (!selectedArticles.length) {
      showNotification("error", "Selecione ao menos um artigo novo para mover de silo.");
      return;
    }
    const keywordIds = new Set(selectedArticles.flatMap(article => [...articleKeywordIds(article)]));
    const nextMasterList = assignSiloToArticleMembers(masterList, keywordIds, target);
    const affectedItems = nextMasterList.filter(item => keywordIds.has(String(item.id)));
    const persisted = await persistWorkingCopyAssignments(affectedItems, { updateLocalLocks: false });
    if (!persisted) return;
    if (!await confirmSiloAssignmentReadback(affectedItems, target)) {
      showNotification("error", "A mudança foi enviada, mas o readback canônico ainda não confirmou os silos selecionados. O estado anterior foi mantido na tela.");
      setCanonicalWorkspaceReload(current => current + 1);
      return;
    }
    pushMasterHistory(masterList, `Mover ${selectedArticles.length} artigo(s) para ${target.nome}`);
    setMasterList(nextMasterList);
    setProvisionalGroups(describeAssignedGroups(nextMasterList));
    setCanonicalWorkspaceReload(current => current + 1);
    showNotification("success", `${selectedArticles.length} artigo(s) movido(s) para ${target.nome}.`);
  };

  const handleDeleteSiloGroup = (group: { articles: any[] }) => {
    if (group.articles.some(art => art.isPublished)) {
      showNotification("error", "Silos com artigos publicados nao podem ser apagados.");
      return;
    }
    setPendingDangerAction({ type: "remove-silo", clusterIds: group.articles.map(art => String(art.clusterId)),
      articleIds: group.articles.map(art => String(art.id)), siloName: group.articles[0]?.siloName || "Silo sem nome" });
  };

  const handleDetachSupportKeyword = (keyword: any) => {
    const article = articlesList.find(candidate => candidate.supportKeywords.some(item => item.id === keyword.id));
    if (article?.isPublished) {
      showNotification("error", "Keywords de um artigo publicado permanecem protegidas.");
      return;
    }
    const nextClusterId = `manual-${keyword.id}-${Date.now()}`;
    pushMasterHistory(masterList, `Separar a keyword ${keyword.keyword} do artigo`);
    const nextMasterList = masterList.map(kw =>
      kw.id === keyword.id
        ? { ...normalizeArticleWorkingCopyKeyword(kw), clusterId: nextClusterId, provisionalGroupId: nextClusterId, reviewRole: "principal" }
        : kw
    );
    setMasterList(nextMasterList);
    setProvisionalGroups(describeAssignedGroups(nextMasterList));
    void persistWorkingCopyAssignmentsRef.current?.(nextMasterList.filter(item => item.id === keyword.id));
    showNotification("success", "Keyword secundaria removida do artigo sem apagar o registro.");
  };

  const handleManualKeywordRoleChange = (article: (typeof articlesList)[number], keyword: any, role: ManualKeywordRole) => {
    if (article.isPublished) {
      showNotification("error", "A identidade de artigos publicados está protegida contra mudança de papel.");
      return;
    }
    const nextMasterList = applyManualKeywordRole(masterList, {
      clusterId: article.clusterId,
      keywordId: String(keyword.id),
      role,
    });
    if (nextMasterList.every((item, index) => item === masterList[index])) return;
    pushMasterHistory(masterList, `Definir ${MANUAL_KEYWORD_ROLE_LABELS[role].toLowerCase()} para ${keyword.keyword}`);
    setMasterList(nextMasterList);
    setProvisionalGroups(describeAssignedGroups(nextMasterList));
    void persistWorkingCopyAssignmentsRef.current?.(nextMasterList.filter(item => String(item.clusterId) === String(article.clusterId)));
    showNotification("success", `${keyword.keyword}: ${MANUAL_KEYWORD_ROLE_LABELS[role].toLowerCase()} definida na cópia de trabalho.`);
  };


  const markAiReviewChecked = (article: AiReviewArticle) => {
    const articleKeywords = article.mainKeywordObj
      ? [article.mainKeywordObj, ...article.supportKeywords]
      : article.supportKeywords;
    const keywordIds = new Set(articleKeywords.map(keyword => keyword.id));
    setMasterList(previous => previous.map(keyword => keywordIds.has(keyword.id) && keyword.aiReviewAnnotation
      ? { ...keyword, aiReviewAnnotation: { ...keyword.aiReviewAnnotation, reviewState: "reviewed" } }
      : keyword));
    const reviewedAnnotations: AIReviewAnnotation[] = articleKeywords.flatMap(keyword => keyword.aiReviewAnnotation
      ? [{ ...keyword.aiReviewAnnotation, reviewState: "reviewed" as const }]
      : []);
    addAiReviewAnnotations(reviewedAnnotations);
    showNotification("success", "Anotações da IA marcadas como revisadas. O status do artigo continua separado.");
  };

  /**
   * Leitura do lote inteiro. Vive aqui, antes da projeção de Article, porque a
   * reserva da cabeceira precisa ser conhecida antes de formar artigo.
   */
  const keywordUniverse = useMemo(
    () => buildKeywordUniverse({ brandId: selectedBrandId || "", keywords: masterList as Array<{ id: string }> }),
    [masterList, selectedBrandId],
  );
  /** Cabeceiras de silo candidato: fora do pool de Article enquanto a hipótese vale. */
  const reservedSiloHeadIds = useMemo(() => reservedSiloPageHeadIds(keywordUniverse), [keywordUniverse]);

  /**
   * Silos confirmados. No fluxo Silo-first o Article só se forma dentro de um
   * universo já aceito: keyword sem silo, ou em silo ainda candidato, aguarda a
   * decisão em vez de ser consumida cedo demais.
   */
  const confirmedTerritoryRefs = useMemo(
    () => new Set(remoteTerritories
      .filter(item => siloIsHumanDecided(item.territory.lifecycleStatus))
      .map(item => item.territoryRef)),
    [remoteTerritories],
  );


  /* ------------------------- FASE ARTIGOS: FORMAÇÃO ------------------------ */

  /**
   * Universo de formação, por Silo confirmado.
   *
   * Silo-first: só um Silo já confirmado libera formação. O conjunto inteiro de
   * keywords do Silo é lido de uma vez — é dele que sai o Article, não de cada
   * keyword isolada.
   *
   * Determinístico: nenhum provider é chamado aqui.
   */
  /**
   * A cerca de Silo em volta do formador canônico.
   *
   * Cada Silo confirmado entra sozinho em `buildProvisionalGroups`. O engine
   * não foi alterado: ele só passou a receber um universo por vez, em vez de
   * todas as keywords da marca.
   */
  const siloScopedGroups = useMemo(() => {
    const confirmados = remoteTerritories
      .filter(item => siloIsHumanDecided(item.territory.lifecycleStatus))
      .map(item => ({ ...item.territory, territoryRef: item.territoryRef }));

    const porSilo = new Map<string, typeof masterList>();
    masterList.forEach(keyword => {
      const ref = typeof keyword.territoryRef === "string" ? keyword.territoryRef : null;
      if (!ref || !confirmedTerritoryRefs.has(ref)) return;
      // Cabeceira de Silo não é artigo: ela É o Silo.
      if (reservedSiloHeadIds.has(String(keyword.id))) return;
      porSilo.set(ref, [...(porSilo.get(ref) || []), keyword] as typeof masterList);
    });

    return buildSiloScopedProvisionalGroups({
      silos: confirmados.map(territory => {
        const slug = territory.slugState.publishedSlug
          || territory.slugState.confirmed
          || territory.slugState.proposals?.[0]?.slug
          || null;
        return {
          siloRef: territory.territoryRef,
          siloLabel: territory.name || territory.centralEntity || "Silo sem nome",
          siloSlug: slug ? (slug.startsWith("/") ? slug : `/${slug}`) : null,
        };
      }),
      keywordsBySiloRef: porSilo as never,
    });
  }, [masterList, confirmedTerritoryRefs, reservedSiloHeadIds, remoteTerritories]);

  const scopedGroupsSummary = useMemo(() => summarizeScopedGroups(siloScopedGroups), [siloScopedGroups]);
  const crossSiloProvisionalGroups = useMemo(() => countCrossSiloGroups(siloScopedGroups), [siloScopedGroups]);

  const articleFormationUniverses = useMemo(() => {
    const publicado = brandSiteSnapshot?.catalog?.length
      ? buildPublishedSiteArchitecture({ catalog: brandSiteSnapshot.catalog as never })
      : null;

    const confirmados = remoteTerritories
      .filter(item => siloIsHumanDecided(item.territory.lifecycleStatus))
      .map(item => ({ ...item.territory, territoryRef: item.territoryRef }));
    const keywordsPorSilo = new Map<string, typeof masterList>();
    masterList.forEach(keyword => {
      const ref = typeof keyword.territoryRef === "string" ? keyword.territoryRef : null;
      if (!ref || !confirmedTerritoryRefs.has(ref)) return;
      // Cabeceira de silo não é artigo: ela É o silo.
      if (reservedSiloHeadIds.has(String(keyword.id))) return;
      keywordsPorSilo.set(ref, [...(keywordsPorSilo.get(ref) || []), keyword] as typeof masterList);
    });

    return confirmados.map(territory => {
      // Publicado > confirmado > proposto. A proposta humana já é o
      // endereço projetado do Silo: ignorá-la faria a mesa dizer "sem página"
      // sobre uma decisão que alguém já tomou.
      const siloSlug = territory.slugState.publishedSlug
        || territory.slugState.confirmed
        || territory.slugState.proposals?.[0]?.slug
        || null;
      const raiz = siloSlug ? (siloSlug.startsWith("/") ? siloSlug : `/${siloSlug}`) : null;
      // Patrimônio sob este Silo: as páginas que já existem publicadas.
      const publishedArticles = (publicado?.nodes || [])
        .filter(node => node.role === "leaf" && raiz && node.structuralRootPath === raiz)
        .map(node => ({
          normalizedUrl: node.normalizedUrl,
          path: node.path,
          label: node.h1 || node.label,
          canonical: node.canonical,
          matchedKeywordId: null,
        }));

      const escopo = siloScopedGroups.find(item => item.siloRef === territory.territoryRef);
      return buildArticleFormationUniverse({
        // A composição vem do formador canônico; aqui só é descrita.
        groups: (escopo?.groups || []).map(group => ({
          principalKeywordId: String(group.principalSuggestion.keywordId),
          keywordIds: group.keywords.map(keyword => String(keyword.id)),
        })),
        siloRef: territory.territoryRef,
        siloLabel: territory.name || territory.centralEntity || "Silo sem nome",
        siloSlug: raiz,
        // O tema do pai vem do DNA do Silo confirmado, não só do endereço.
        siloContext: {
          centralEntity: territory.centralEntity,
          macroIntent: territory.macroIntent,
          boundaryIncludes: territory.boundary?.includes,
          narrative: territory.narrative?.statement ?? null,
        },
        keywords: (keywordsPorSilo.get(territory.territoryRef) || []).map(keyword => ({
          keywordId: String(keyword.id),
          keyword: String(keyword.keyword || ""),
          intent: keyword.analise_semantica?.intencao_principal || keyword.intent || null,
          volume: keyword.volume_search ?? null,
          kgr: keyword.kgr ?? null,
          entity: keyword.analise_semantica?.entidade_central || null,
          problem: keyword.analise_semantica?.problema_percebido || null,
          isPublished: Boolean(keyword.isPublished),
          // Revisão humana lida do payload canônico. Estado incoerente não
          // vira agrupamento: ele volta para a lógica e a incoerência aparece.
          humanFormationRef: resolveArticleFormationState(keyword).formationRef,
          humanRole: resolveArticleFormationState(keyword).decision?.role ?? null,
        })),
        publishedArticles,
      });
    });
  }, [masterList, confirmedTerritoryRefs, reservedSiloHeadIds, remoteTerritories, brandSiteSnapshot, siloScopedGroups]);

  /**
   * Quais artigos do cenário JÁ têm ArticleDNA — e quais artefatos são acervo.
   *
   * Casar só pelo identificador fazia a mesa mentir: `article-candidate:<silo>:
   * <principal>` se repete quando a Principal é a mesma, então ArticleDNA de
   * formações antigas colidiam com candidatos de agora. O cabeçalho contava
   * "5 formados" enquanto as sete linhas diziam CANDIDATO.
   *
   * A reconciliação é por composição: mesmo Silo, mesma Principal, mesmas
   * keywords. O que não descreve o cenário corrente fica no acervo, fora do
   * fluxo — isolado, nunca apagado.
   */
  const materializationPartition = useMemo(() => partitionMaterializedArticles({
    accepted: Object.values(acceptedArticleDnas).map(version => ({
      articleId: String(version.payload.articleId),
      territoryRef: version.payload.territoryRef ? String(version.payload.territoryRef) : null,
      principalKeywordId: String(version.payload.principalKeywordId),
      keywordIds: [
        String(version.payload.principalKeywordId),
        ...(version.payload.secondaryKeywordIds || []).map(String),
        ...(version.payload.narrativeReinforcementIds || []).map(String),
      ],
    })),
    candidates: articleFormationUniverses.flatMap(universe => universe.candidates.map(candidate => ({
      candidateRef: candidate.candidateRef,
      siloRef: candidate.siloRef,
      principalKeywordId: candidate.principalKeywordId,
      keywordIds: [...candidate.keywords.map(item => item.keywordId), ...candidate.overflowKeywordIds],
    }))),
  }), [acceptedArticleDnas, articleFormationUniverses]);

  /** `candidateRef` dos artigos do cenário já materializados — ARTICLE vs CANDIDATO. */
  const materializedArticleIds = materializationPartition.current;

  /** Artefatos de formações anteriores: contados no painel, fora da mesa. */
  const legacyArticleSummary = useMemo(
    () => summarizeLegacyArticles(materializationPartition),
    [materializationPartition],
  );

  const legacyArticleDnaIds = useMemo(
    () => new Set(materializationPartition.legacy.map(item => item.articleId)),
    [materializationPartition],
  );

  /**
   * ArticleDNA que a mesa pode exibir — uma chave só para a fase inteira.
   *
   * Na fase Artigos o artigo é o candidato do cenário, e a reconciliação é por
   * composição. Ler o dicionário pelo id da working copy fazia a linha dizer
   * "Pendente" sobre um artigo que o cabeçalho já contava como formado.
   *
   * Fora dessa fase o acervo continua legível pela chave de sempre.
   */
  /**
   * A ÚNICA leitura de "qual ArticleDNA descreve este artigo" — e sob QUAL chave.
   *
   * O id do agrupamento provisório e a chave sob a qual o ArticleDNA foi
   * gravado não são a mesma coisa: a materialização da formação grava sob o
   * `candidateRef` do cenário revisado. Enquanto a grade lia pela composição e
   * o fechamento lia pelo agrupamento, a mesma pergunta tinha duas respostas —
   * a linha mostrava "v3" e o painel dizia "Em formação", sem artigo nenhum.
   *
   * Quem escreve precisa da CHAVE, não só da versão: gravar a sucessora sob a
   * chave errada não sucede o artigo, cria um segundo ao lado dele.
   */
  const articleDnaEntryFor = useCallback((input: { articleId?: string | null; candidateRef?: string | null }) => {
    // A partição do cenário responde em QUALQUER aba, não só na de Artigos.
    //
    // Restringir a leitura à aba Artigos fazia o MESMO artigo aparecer
    // "Consolidado · Aprovado" ali e "CANDIDATO · ainda não confirmado" em
    // Links: duas respostas para a mesma pergunta, só que separadas por aba.
    //
    // Quem tem candidateRef é linha do cenário corrente e só o cenário responde
    // por ela — sem cair no acervo quando não há correspondência.
    const doCenario = input.candidateRef
      ? materializationPartition.matched.get(input.candidateRef) ?? null
      : null;
    const key = doCenario || (input.candidateRef ? null : (input.articleId || null));
    return { key, version: key ? acceptedArticleDnas[key] : undefined };
  }, [acceptedArticleDnas, materializationPartition]);
  const articleDnaForGrid = useCallback(
    (articleId: string | null | undefined, candidateRef?: string | null) =>
      articleDnaEntryFor({ articleId, candidateRef }).version,
    [articleDnaEntryFor],
  );

  /**
   * A ÚNICA leitura de "quais conflitos estruturais este artigo ainda carrega".
   *
   * Na fase Artigos a autoridade é o CENÁRIO REVISADO: cada candidato carrega
   * os conflitos da composição que o humano confirmou. `detectArchitectureConflicts`
   * fala do agrupamento provisório do engine — a projeção ANTERIOR à revisão —
   * e consultá-lo no fechamento é pedir parecer sobre um objeto que a revisão
   * já substituiu: o cabeçalho contava 0 conflitos e a consolidação recusava
   * o mesmo artigo por 8, todos de agrupamentos que não existem mais.
   *
   * Fora da fase Artigos nada muda: sem cenário revisado, o agrupamento
   * provisório segue sendo a única leitura disponível.
   */
  const articleConflictsFor = useCallback((input: {
    candidateRef?: string | null;
    entityIds: readonly (string | null | undefined)[];
  }): readonly string[] => {
    if (workspaceMode === "articles") {
      if (!input.candidateRef) return [];
      for (const universe of articleFormationUniverses) {
        const candidato = universe.candidates.find(item => item.candidateRef === input.candidateRef);
        if (candidato) return candidato.conflicts;
      }
      return [];
    }
    const ids = new Set(input.entityIds.filter((value): value is string => Boolean(value)));
    return detectArchitectureConflicts(provisionalGroups)
      .filter(conflict => conflict.entityIds.some(entityId => ids.has(entityId)))
      .map(conflict => `${conflict.reason} ${conflict.recommendation}`);
  }, [articleFormationUniverses, provisionalGroups, workspaceMode]);

  /**
   * A ÚNICA leitura de "a que Silo este artigo pertence".
   *
   * Pertencer ao Silo vem da confirmação do território — decisão humana da
   * fase Silos. O `siloId` canônico vem da consolidação, que é posterior e
   * não desfaz aquela decisão. Enquanto a tela lia `siloId == null` como
   * "sem silo", o mesmo artigo aparecia aprovado, com pai declarado, e
   * listado em ARTIGOS SEM SILO.
   */
  const articleParentFor = (art: (typeof articlesList)[number]) => {
    const dna = articleDnaEntryFor({ articleId: articleEntityIdFor(art), candidateRef: art.candidateRef }).version;
    const territoryRef = dna?.payload.territoryRef
      || (typeof art.mainKeywordObj?.territoryRef === "string" ? art.mainKeywordObj.territoryRef : null)
      || null;
    const territorio = territoryRef ? remoteTerritories.find(item => item.territoryRef === territoryRef) : null;
    // O Silo canônico é resolvido pelo TERRITÓRIO, não por um campo no artigo.
    //
    // O ArticleDNA não carrega `siloId`, e não vai passar a carregar só para a
    // tela ler mais fácil: o par SiloDNA/SiloPage declara o território, e o
    // território é o que o artigo declara desde a formação. O vínculo já
    // existe — o que faltava era alguém segui-lo.
    const canonico = territoryRef
      ? Object.values(acceptedSiloDnas).find(version => version.payload.territoryRef === territoryRef)
      : undefined;
    return readArticleParent({
      territoryRef,
      territoryName: territorio?.territory.name || territorio?.territory.centralEntity || null,
      territoryConfirmed: siloIsHumanDecided(territorio?.territory.lifecycleStatus),
      canonicalSiloId: (typeof art.siloId === "string" && art.siloId.trim() ? art.siloId : null)
        || canonico?.payload.siloId
        || null,
      canonicalSiloName: art.siloName || canonico?.payload.name || null,
    });
  };

  /** Rótulo legível da keyword: o painel nunca mostra id cru. */
  const formationKeywordLabels = useMemo(
    () => new Map(masterList.map(keyword => [String(keyword.id), String(keyword.keyword || "")])),
    [masterList],
  );

  /**
   * Identidade editorial de cada Silo, lida do que EXISTE.
   *
   * `canonical` só é verdadeiro quando há SiloPage canônica gravada. Projetar
   * a unidade "SiloPage" na tela dá raiz à hierarquia; alegar que o artefato
   * existe seria prometer uma página publicável que ninguém criou.
   */
  const siloPageIdentities = useMemo(() => {
    const canonicais = new Set(Object.values(acceptedSiloPages)
      .map(version => String(version.payload.siloId ?? "")));
    return new Map(remoteTerritories
      .filter(item => siloIsHumanDecided(item.territory.lifecycleStatus))
      .map(item => [item.territoryRef, {
        origin: item.territory.architecturalOrigin === "manual_strategic" ? "manual" as const
          : item.territory.architecturalOrigin ? "site" as const : "unknown" as const,
        canonical: canonicais.has(item.territoryRef)
          // Território consolidado JÁ produziu SiloDNA + SiloPage canônicas.
          || Boolean(item.territory.consolidation?.siloPageVersionRef),
        published: item.territory.publicationProtection === "protected",
        protected: item.territory.publicationProtection === "protected",
      }]));
  }, [remoteTerritories, acceptedSiloPages]);

  const articleSiloViews = useMemo(() => buildArticleSiloViews({
    universes: articleFormationUniverses,
    siloIdentities: siloPageIdentities,
    materializedArticleIds,
    // Publicado editorial só existe se o Minerador entregou a keyword como
    // publicada. A varredura do site não tem autoridade para isso.
    publishedKeywordIds: new Set(masterList
      .filter(keyword => Boolean(keyword.isPublished))
      .map(keyword => String(keyword.id))),
    keywordLabels: formationKeywordLabels,
    humanDecidedKeywordIds: new Set(masterList
      .filter(keyword => resolveArticleFormationState(keyword).state === "decided")
      .map(keyword => String(keyword.id))),
  }), [articleFormationUniverses, siloPageIdentities, materializedArticleIds, formationKeywordLabels, masterList]);

  /**
   * De qual Article candidato cada keyword faz parte.
   *
   * Vazio enquanto a formação não é processada: sem isso a tabela voltaria a
   * projetar um artigo por keyword, que é justamente o legado Article-first
   * que saiu. Enquanto não há formação, a keyword aparece como pendente — não
   * como artigo.
   */
  const formationCandidateByKeyword = useMemo(() => {
    const indice = new Map<string, { candidateRef: string; principalKeywordId: string; siloRef: string; siloLabel: string; siloSlug: string | null }>();
    if (!articleFormationMarker) return indice;
    for (const universe of articleFormationUniverses) {
      for (const candidate of universe.candidates) {
        for (const item of candidate.keywords) {
          indice.set(item.keywordId, {
            candidateRef: candidate.candidateRef,
            principalKeywordId: candidate.principalKeywordId,
            siloRef: universe.siloRef,
            siloLabel: universe.siloLabel,
            siloSlug: universe.siloSlug,
          });
        }
      }
    }
    return indice;
  }, [articleFormationMarker, articleFormationUniverses]);

  const articlesList = useMemo(() => {
    const clustersMap = new Map<string, {
      workingArticleId: string;
      clusterId: string;
      siloId: any;
      siloName: string;
      isPublished: boolean;
      /** Principal sugerida pela formação; a decisão humana ainda prevalece. */
      principalKeywordId: string | null;
      /** Identidade da linha quando ela vem da formação. */
      candidateRef: string | null;
      keywords: any[];
    }>();

    masterList.forEach(kw => {
      if (kw.siloCandidate?.status === "candidate") return;
      // Cabeceira de silo candidato não vira artigo por projeção automática.
      if (reservedSiloHeadIds.has(String(kw.id))) return;
      // Silo-first: só keyword dentro de silo CONFIRMADO entra em formação. A
      // exceção é o patrimônio publicado, que já existe e não pode sumir.
      const territoryRef = typeof kw.territoryRef === "string" ? kw.territoryRef : null;
      if (!kw.isPublished && !kw.siloId && !confirmedTerritoryRefs.has(territoryRef || "")) return;
      // Uma keyword não é um artigo. Conteúdo novo só aparece na mesa depois
      // que a formação foi processada e a agrupou com as buscas que pedem o
      // mesmo conteúdo. O patrimônio publicado é a exceção: já existe.
      const candidato = kw.isPublished ? null : formationCandidateByKeyword.get(String(kw.id));
      if (!kw.isPublished && !candidato) return;
      const workingArticleId = resolveWorkingArticleId(kw);
      // A seleção precisa sobreviver a mudanças de keywords, papéis e silo.
      // Itens canônicos sempre têm ao menos o ID persistente do workflow; a
      // tabela nunca fabrica uma identidade a partir de cluster, conteúdo ou
      // índice visual.
      if (!workingArticleId) return;
      // Buscas do mesmo Article compartilham a linha: a chave é a composição,
      // não a keyword.
      const clusterKey = candidato ? candidato.candidateRef : workingArticleId;
      if (!clustersMap.has(clusterKey)) {
        clustersMap.set(clusterKey, {
          workingArticleId,
          clusterId: kw.clusterId != null && kw.clusterId !== "" ? String(kw.clusterId) : workingArticleId,
          siloId: kw.siloId,
          siloName: kw.siloName,
          isPublished: false,
          principalKeywordId: candidato ? candidato.principalKeywordId : null,
          candidateRef: candidato ? candidato.candidateRef : null,
          keywords: [],
        });
      }

      const entry = clustersMap.get(clusterKey)!;
      entry.isPublished = entry.isPublished || Boolean(kw.isPublished);
      entry.keywords.push(kw);
    });

    // Mapeamento final para objetos do tipo Artigo
    const articles = Array.from(clustersMap.values()).map(c => {
      // Uma decisão humana de principal tem precedência para artigos novos.
      // Em publicados, a âncora publicada continua protegida.
      const principalSugerida = c.principalKeywordId
        ? c.keywords.find(keyword => String(keyword.id) === c.principalKeywordId)
        : null;
      const main = c.keywords.find(keyword => keyword.isPublished)
        // A formação já escolheu quem representa o conteúdo, e é ela que vira
        // ArticleDNA. O papel manual antigo vinha antes e fazia a LINHA exibir
        // a principal anterior enquanto o painel e o artefato já mostravam a
        // nova — a mesa discordando do acervo sobre o mesmo artigo.
        || principalSugerida
        || c.keywords.find(keyword => !keyword.isPublished && manualKeywordRoleFor(keyword) === "principal")
        // Volume só decide quando não há formação, como no patrimônio publicado.
        || [...c.keywords].sort((left, right) => (right.volume_search || 0) - (left.volume_search || 0))[0];
      const supportKeywords = c.keywords.filter(keyword => keyword !== main);
      const aiReviewAnnotations: AIReviewAnnotation[] = [main, ...supportKeywords]
        .map(keyword => keyword?.aiReviewAnnotation)
        .filter((annotation): annotation is AIReviewAnnotation => Boolean(annotation));
      return {
        // Linha de formação é identificada pelo candidato: keywords do mesmo
        // grupo do Minerador compartilham `workingArticleId` e podem estar em
        // artigos diferentes.
        id: (c.candidateRef && articleSelectionIdForCandidate(c.candidateRef))
          || articleSelectionIdForWorkingArticle(c.workingArticleId)
          || `article-working:${encodeURIComponent(c.workingArticleId)}`,
        // A linha precisa saber qual artigo do cenário ela descreve: a revisão
        // da formação propõe mudanças sobre o candidato, não sobre a linha.
        candidateRef: c.candidateRef || null,
        workingArticleId: c.workingArticleId,
        clusterId: c.clusterId,
        siloId: main ? main.siloId : c.siloId,
        siloName: main ? main.siloName : c.siloName,
        siloSlug: (main ? main.siloId : c.siloId)
          ? toSlug((main ? main.siloName : c.siloName) || "")
          : null,
        isPublished: c.isPublished,
        keywordPrincipal: main?.keyword || "",
        slug: main?.computedSlug || toSlug(main?.keyword || ""),
        hierarquia: main?.computedHierarquia || "Pilar",
        volume: main?.volume_search ?? null,
        intent: main?.intent || "Informativo",
        kgr: main?.kgr || null,
        analiseSemantica: main?.analise_semantica || null,
        supportKeywords,
        mainKeywordObj: main,
        aiReviewAnnotations,
        briefingId: main?.briefingId || `temp-${c.clusterId}`
      };
    });

    // Artigos preserva a ordem canônica de chegada da working copy. A
    // ordenação por Silo e a numeração Pilar/Suporte pertencem somente à
    // projeção da etapa Silos.
    if (workspaceMode === "articles") {
      return articles.map(article => ({
        ...article,
        hierarquia: "Pendente para Silos",
      }));
    }

    // Ordenação: Silo (alfabético) -> Volume do artigo (Volume da Kw Principal) desc
    const sortedArticles = articles.sort((a, b) => {
      const sA = (a.siloName || "").toLowerCase();
      const sB = (b.siloName || "").toLowerCase();
      if (sA < sB) return -1;
      if (sA > sB) return 1;
      return (b.volume || 0) - (a.volume || 0);
    });

    const siloPositions: Record<string, number> = {};
    return sortedArticles.map(art => {
      const siloKey = art.siloId ? `${art.siloId}-${art.siloSlug || ""}` : "sem-silo";
      const position = siloPositions[siloKey] ?? 0;
      siloPositions[siloKey] = position + 1;

      return {
        ...art,
        hierarquia: customHierarquias[art.id] || (position === 0 ? "Pilar" : `Suporte ${position}`),
      };
    });
  }, [masterList, reservedSiloHeadIds, confirmedTerritoryRefs, formationCandidateByKeyword, customHierarquias, workspaceMode]);


  /** Leitura durável da revisão IA por Article, já com política de STALE. */
  const articleAiReviewReadoutFor = useCallback((articleId: string | null | undefined) => resolveArticleAiReviewReadout({
    review: articleId ? articleAiReviews[articleId]?.payload : null,
    currentBaseContentHash: articleId ? articleBaseHashes[articleId] : null,
  }), [articleAiReviews, articleBaseHashes]);

/**
   * Edição estrutural humana: a Revisão é a autoridade final sobre a working
   * copy. Toda ação — manual, aplicação de proposta da IA ou resolução de
   * divergência da SERP — passa por este mesmo caminho canônico.
   */
  /** O Article é identificado pela working copy; `clusterId` pode repetir. */
  const manualArticleKeyFor = (article: (typeof articlesList)[number]) =>
    article.mainKeywordObj ? articleKeyOf(article.mainKeywordObj) : String(article.clusterId);

  const manualMoveTargetsFor = (article: (typeof articlesList)[number]) => manualMoveTargets({
    articles: articlesList.map(candidate => ({
      id: candidate.id,
      articleKey: manualArticleKeyFor(candidate),
      label: candidate.keywordPrincipal || candidate.slug || candidate.id,
      isPublished: Boolean(candidate.isPublished),
    })),
    items: masterList,
    currentArticleId: article.id,
  });

  /** Um único caminho: mutação canônica → cópia de trabalho → persistência. */
  const commitManualArchitectureOutcome = async (
    outcome: ManualArchitectureOutcome<(typeof masterList)[number]>,
    historyLabel: string,
  ) => {
    const previous = masterList;
    const result = await commitManualArchitecture({
      previous,
      outcome,
      apply: items => {
        pushMasterHistory(previous, historyLabel);
        setMasterList(items);
        setProvisionalGroups(describeAssignedGroups(items));
      },
      persist: changed => persistWorkingCopyAssignments(changed, { updateLocalLocks: false }),
    });
    showNotification(result.status === "applied" ? "success" : "error", result.message);
    return result.status === "applied";
  };

  const handleManualSupportRole = async (article: (typeof articlesList)[number], keyword: ArchitectReviewKeyword, role: Exclude<ManualKeywordRole, "principal">) => {
    await commitManualArchitectureOutcome(
      setManualSupportRole(masterList, { articleKey: manualArticleKeyFor(article), keywordId: String(keyword.id), role }),
      `Definir ${MANUAL_KEYWORD_ROLE_LABELS[role].toLowerCase()} para ${keyword.keyword}`,
    );
  };

  const requestManualArchitectureAction = (input: {
    kind: ManualArchitectureKind;
    article: (typeof articlesList)[number];
    keyword: ArchitectReviewKeyword;
    target?: ManualArchitectureTarget | null;
  }) => {
    const request = requestManualArchitecture({
      kind: input.kind,
      items: masterList,
      articleKey: manualArticleKeyFor(input.article),
      articleLabel: String(input.article.keywordPrincipal || input.article.id),
      keywordId: String(input.keyword.id),
      isPublishedArticle: Boolean(input.article.isPublished),
      target: input.target,
    });
    if (!request.ok) {
      showNotification("error", request.reason);
      return;
    }
    setPendingManualArchitecture(request.pending);
  };

  const confirmManualArchitecture = async () => {
    const pending = pendingManualArchitecture;
    if (!pending) return;
    const label = pending.kind === "principal" ? `Definir ${pending.keywordLabel} como Principal`
      : pending.kind === "move" ? `Mover ${pending.keywordLabel} para ${pending.targetLabel}`
        : pending.kind === "ungroup" ? `Retirar ${pending.keywordLabel} do artigo`
          : `Criar artigo novo com ${pending.keywordLabel}`;
    const applied = await commitManualArchitectureOutcome(resolveManualArchitecture(masterList, pending), label);
    if (applied) setPendingManualArchitecture(null);
  };

  const articleProcessReadModelFor = useCallback((article: (typeof articlesList)[number]) => {
    const articleEntityId = articleEntityIdFor(article);
    const articleKeywordIds = new Set([article.mainKeywordObj, ...article.supportKeywords]
      .filter((keyword): keyword is NonNullable<typeof article.mainKeywordObj> => Boolean(keyword))
      .map(keyword => String(keyword.id)));
    // Proposta sem mutação não vira pendência humana: a IA executou e concluiu
    // que não há alteração estrutural a recomendar.
    const articleAiDecisions = (pendingKeywordReview?.review.decisions || []).filter(decision => articleKeywordIds.has(String(decision.keywordId)));
    const pendingProposalCount = articleAiDecisions.filter(decision => {
      const keyword = [article.mainKeywordObj, ...article.supportKeywords].find(item => String(item?.id) === String(decision.keywordId));
      const conflictCount = (pendingKeywordReview?.review.conflicts || []).filter(conflict => conflict.entityIds.includes(decision.keywordId)).length;
      return !isNoOpKeywordArticleDecision(decision, keyword?.reviewRole, conflictCount);
    }).length;
    // A IA executou para este artigo mesmo quando nada material foi proposto:
    // sem isso a aba ficava em "Não executada" depois de uma execução real.
    const aiCompletedWithoutProposals = articleAiDecisions.length > 0 && pendingProposalCount === 0;
    // Estado durável: o que o artefato canônico registra para este Article.
    const durableAiReview = articleAiReviewReadoutFor(articleEntityId);
    const articleDnaVersion = articleDnaForGrid(articleEntityId, article.candidateRef);
    const provisionalGroup = provisionalGroups.find(group => group.id === (article.mainKeywordObj?.provisionalGroupId || article.briefingId));
    const execution = articleEntityId ? serpExecution[articleEntityId] : undefined;
    return deriveArticleProcessReadModel({
      logicProcessing: Boolean(activeLogicalTask) && selectedArticleIds.has(article.id),
      hasLogicalOutput: Boolean(provisionalGroup?.groupingReasons?.length),
      serpProcessing: execution?.status === "processing",
      hasSerpAssessment: Boolean(latestSerpAssessmentFor(articleEntityId)),
      serpHasError: execution?.status === "error",
      aiProcessing: Boolean(activeKeywordReviewTask) && selectedArticleIds.has(article.id),
      pendingProposalCount,
      aiCompletedWithoutProposals,
      durableAiState: durableAiReview.state === "COMPLETED_NO_PROPOSALS" || durableAiReview.state === "COMPLETED_WITH_PROPOSALS"
        ? durableAiReview.state
        : null,
      durableMaterialProposalCount: durableAiReview.materialProposalCount,
      durablePendingProposalCount: durableAiReview.pendingProposalCount,
      aiBaseChanged: durableAiReview.stale,
      annotations: article.aiReviewAnnotations,
      humanPendingDecisionCount: articleDnaVersion?.payload.humanPendingDecisions.length || 0,
      reviewProcessing: Boolean(activeArticleDnaTask) && selectedArticleIds.has(article.id),
    });
  }, [acceptedArticleDnas, activeArticleDnaTask, activeKeywordReviewTask, activeLogicalTask, articleAiReviewReadoutFor, pendingKeywordReview, provisionalGroups, selectedArticleIds, serpAssessments, serpExecution]);
  // A base vigente é recalculada fora do render: a revisão de uma base antiga
  // não pode aparecer como revisão atual do Article.
  useEffect(() => {
    const reviewedArticleIds = new Set(Object.keys(articleAiReviews));
    if (!reviewedArticleIds.size) {
      setArticleBaseHashes(previous => (Object.keys(previous).length ? {} : previous));
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries: Array<[string, string]> = [];
      for (const group of provisionalGroups) {
        const articleId = group.publishedAnchorId || group.id;
        if (!reviewedArticleIds.has(articleId)) continue;
        const base = await articleAiReviewBaseFor(group);
        entries.push([articleId, base.articleContentHash]);
      }
      if (!cancelled) setArticleBaseHashes(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedArticleDnas, articleAiReviews, masterList, provisionalGroups]);

  const articleWorkflowStatus = useCallback((art: (typeof articlesList)[number]) => {
    if (art.isPublished) return "published";
    const articleEntityId = art.mainKeywordObj?.provisionalGroupId || art.briefingId;
    if (articleEntityId && radarItems.some(item => item.articleId === articleEntityId)) return "sent_radar";
    // Mesmo resolvedor da grade e do painel: ler por outra chave era o que
    // fazia o artigo aparecer "Consolidado" e "Em processo" ao mesmo tempo.
    const articleVersion = articleDnaEntryFor({ articleId: articleEntityId, candidateRef: art.candidateRef }).version;
    const versionStatus = articleVersion ? effectiveVersionStatus(articleVersion.versionId, versionEvents) : null;
    if (versionStatus === "approved") return "approved";
    if (articleVersion && versionStatus !== "rejected" && versionStatus !== "superseded") return "awaiting_approval";
    return "draft";
  }, [articleDnaEntryFor, versionEvents, radarItems]);

  const articleApprovalStatus = useCallback((art: (typeof articlesList)[number]) => {
    const articleEntityId = articleEntityIdFor(art);
    const assessment = latestSerpAssessmentFor(articleEntityId);
    // Só divergência com evidência suficiente é conflito para o humano.
    if (assessment && articleSerpVerdictFor(art).kind === "DIVERGENCE") return "conflicts";
    const articleVersion = articleDnaEntryFor({ articleId: articleEntityId, candidateRef: art.candidateRef }).version;
    if (!articleVersion) return "draft";
    const versionStatus = effectiveVersionStatus(articleVersion.versionId, versionEvents);
    if (versionStatus === "approved") return "approved";
    if (versionStatus === "rejected" || versionStatus === "superseded") return "draft";
    return "awaiting_approval";
  }, [articleDnaEntryFor, serpAssessments, versionEvents]);

  // ── Filtros aplicados sobre a lista de artigos
  const filteredArticles = useMemo(() => {
    return articlesList.filter(art => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMain = art.keywordPrincipal.toLowerCase().includes(q) || art.slug.toLowerCase().includes(q);
        const matchesSupport = art.supportKeywords.some(sk => sk.keyword.toLowerCase().includes(q));
        if (!matchesMain && !matchesSupport) return false;
      }
      if (workspaceMode !== "articles" && filterHierarquia !== "Todos") {
        const h = art.hierarquia.toLowerCase();
        const f = filterHierarquia.toLowerCase();
        if (f.includes("reforço")) {
          if (!h.includes("reforço")) return false;
        } else {
          if (!h.includes(f)) return false;
        }
      }
      if (filterStatus !== "Todos" && articleWorkflowStatus(art) !== filterStatus) return false;
      return true;
    });
  }, [articlesList, searchQuery, filterHierarquia, filterStatus, articleWorkflowStatus, workspaceMode]);

  const ungroupedKeywords = useMemo(
    () => masterList.filter(keyword => keyword.clusterId === null || keyword.clusterId === undefined || keyword.clusterId === "" || keyword.clusterId === 0),
    [masterList],
  );

  const siloCandidateKeywords = useMemo(
    () => masterList.filter(keyword => keyword.siloCandidate?.status === "candidate" && !keyword.isPublished),
    [masterList],
  );

  const ungroupedArticleKeywords = useMemo(
    () => ungroupedKeywords.filter(keyword => keyword.siloCandidate?.status !== "candidate" && !reservedSiloHeadIds.has(String(keyword.id))),
    [ungroupedKeywords, reservedSiloHeadIds],
  );

  /** Transparência: a cabeceira reservada é mostrada, sem virar artigo falso. */
  const reservedSiloHeadKeywords = useMemo(
    () => masterList.filter(keyword => reservedSiloHeadIds.has(String(keyword.id)) && !keyword.isPublished),
    [masterList, reservedSiloHeadIds],
  );

  const selectedArticlesForRadar = useMemo(
    () => articlesList.filter(article => selectedArticleIds.has(article.id)),
    [articlesList, selectedArticleIds],
  );

  const updateSiloCandidateDecision = (keyword: ArchitectKeyword, status: "candidate" | "not_candidate", reason: string) => {
    const previous = keyword.siloCandidate;
    const fallbackSignals = {
      volumeRank: null,
      volumeHigh: false,
      resultsPresent: false,
      shortTerm: false,
      broadEntity: false,
      capacityPotential: false,
      kgrOpportunity: false,
      commercialSecondary: false,
      specificNeed: false,
      relatedKeywordCount: 0,
    };
    const siloCandidate = {
      status,
      origin: "human" as const,
      score: previous?.score ?? null,
      reasons: [...new Set([...(previous?.reasons || []), reason])],
      signals: previous?.signals || fallbackSignals,
    };
    const next = masterList.map(item => item.id === keyword.id ? { ...item, siloCandidate } : item);
    pushMasterHistory(masterList, `${status === "candidate" ? "Reservar" : "Liberar"} candidata a Silo: ${keyword.keyword}`);
    setMasterList(next);
    setProvisionalGroups(describeAssignedGroups(next));
    void persistWorkingCopyAssignmentsRef.current?.(next.filter(item => item.id === keyword.id));
    showNotification("success", `${keyword.keyword}: decisão humana de candidata a Silo registrada na cópia de trabalho.`);
  };

  const handleUseSiloCandidateAsArticle = (keyword: ArchitectKeyword) => {
    if (keyword.isPublished) return;
    const groupId = `manual-candidate-${keyword.id}-${Date.now()}`;
    const next = masterList.map(item => item.id === keyword.id ? {
      ...item,
      siloCandidate: {
        ...(item.siloCandidate || { score: null, reasons: ["Marcada pelo motor determinístico."], signals: {
          volumeRank: null, volumeHigh: false, resultsPresent: false, shortTerm: false, broadEntity: false,
          capacityPotential: false, kgrOpportunity: false, commercialSecondary: false, specificNeed: false, relatedKeywordCount: 0,
        } }),
        status: "not_candidate" as const,
        origin: "human" as const,
        reasons: [...new Set([...(item.siloCandidate?.reasons || []), "Humano transformou a candidata em membro de um artigo provisório."])],
      },
      workingArticleId: `working-article:${crypto.randomUUID()}`,
      clusterId: groupId,
      provisionalGroupId: groupId,
      siloId: null,
      silo_id: null,
      siloName: null,
      computedSlug: item.slug_sugerido || toSlug(item.keyword),
      reviewRole: "principal" as const,
    } : item);
    pushMasterHistory(masterList, `Transformar candidata em artigo: ${keyword.keyword}`);
    setMasterList(next);
    setProvisionalGroups(describeAssignedGroups(next));
    void persistWorkingCopyAssignmentsRef.current?.(next.filter(item => item.id === keyword.id));
    showNotification("success", `${keyword.keyword}: candidata transformada em artigo provisório. Nenhum ArticleDNA foi criado.`);
  };

  const createRecoveryInput = (browserStorage: Awaited<ReturnType<typeof readBrowserStorageSnapshot>>, sources: ArchitectDatabaseSources) => {
    if (!selectedBrandId) throw new Error("Selecione uma marca antes de auditar o workspace.");
    return {
      brandId: selectedBrandId,
      masterKeywords: sources.keywords,
      importedKeywordIds: canonicalReceivedKeywordIds,
      currentMasterList: masterList,
      currentArticles: articlesList,
      provisionalGroups,
      articleDnas: acceptedArticleDnas,
      siloDnas: acceptedSiloDnas,
      siloPages: acceptedSiloPages,
      versionEvents,
      radarItems,
      plannerItems,
      documents,
      operationalPublications,
      historyEntries: masterHistory.entries,
      localStorage: browserStorage.localStorage,
      indexedDb: browserStorage.indexedDb,
      renderedItems: filteredArticles,
    };
  };

  const downloadRecoveryJson = (snapshot: ArchitectRecoverySnapshot) => {
    const serialized = JSON.stringify(snapshot, null, 2);
    const validated = ArchitectRecoverySnapshotSchema.parse(JSON.parse(serialized));
    const blob = new Blob([JSON.stringify(validated, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `ArchitectRecoverySnapshot-${selectedBrandId || "sem-marca"}-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return validated;
  };

  const exportRecoverySnapshot = async () => {
    if (!selectedBrandId || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const [sources, browserStorage] = await Promise.all([readArchitectDatabaseSources(), readBrowserStorageSnapshot()]);
      if (browserStorage.errors.length) throw new Error(`Snapshot incompleto: ${browserStorage.errors.join(" ")}`);
      setDatabaseSources(sources);
      const auditInput = createRecoveryInput(browserStorage, sources);
      const audit = auditArchitectWorkspace(auditInput);
      const snapshot = createArchitectRecoverySnapshot({
        auditInput,
        database: { brandId: selectedBrandId, capturedAt: sources.capturedAt, silos: sources.silos, keywords: sources.keywords, briefings: sources.briefings },
        workspace: {
          brandId: selectedBrandId,
          currentArticles: articlesList,
          currentNewArticles: articlesList.filter(article => !article.isPublished),
          currentPublishedArticles: articlesList.filter(article => article.isPublished),
          currentMasterList: masterList,
          ungroupedKeywords,
          provisionalGroups,
          keywordArticleReferences: articlesList.map(article => ({ articleId: article.id, keywordIds: [article.mainKeywordObj?.id, ...article.supportKeywords.map((keyword: any) => keyword.id)].filter(Boolean), roles: Object.fromEntries([[article.mainKeywordObj?.id, "principal"], ...article.supportKeywords.map((keyword: any) => [keyword.id, "secundaria"])]) })),
          architectImportedKeywordIds: canonicalReceivedKeywordIds,
          articleDnas: acceptedArticleDnas,
          siloDnas: acceptedSiloDnas,
          siloPages: acceptedSiloPages,
          versionEvents,
          radarItems,
          plannerItems,
          documents,
          operationalPublications,
          historyEntries: masterHistory.entries,
          backgroundTasks: architectTasks.map(task => ({ id: task.id, type: task.type, status: task.status, message: task.message, current: task.current, total: task.total, startedAt: task.startedAt, finishedAt: task.finishedAt, consumed: task.consumed, error: task.error })),
        },
        browser: { capturedAt: browserStorage.capturedAt, indexedDbAvailable: browserStorage.indexedDbAvailable, errors: browserStorage.errors, localStorage: browserStorage.localStorage, indexedDb: browserStorage.indexedDb },
      });
      const validated = downloadRecoveryJson(snapshot);
      setRecoverySnapshot(validated);
      setRecoveryAudit(audit);
      setRecoveryPlan(null);
      showNotification("success", "Ponto de recuperação criado e validado. A recuperação está liberada para auditoria.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar o ponto de recuperação.";
      setRecoveryError(message);
      showNotification("error", message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const auditRecoverySources = async () => {
    if (!recoverySnapshot || !selectedBrandId || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const [sources, browserStorage] = await Promise.all([readArchitectDatabaseSources(), readBrowserStorageSnapshot()]);
      if (browserStorage.errors.length) throw new Error(`Auditoria incompleta: ${browserStorage.errors.join(" ")}`);
      setDatabaseSources(sources);
      const input = createRecoveryInput(browserStorage, sources);
      const audit = auditArchitectWorkspace(input);
      const plan = buildArchitectRecoveryPlan(input);
      setRecoveryAudit(audit);
      setRecoveryPlan(plan);
      showNotification("success", `Auditoria concluída: ${audit.counts.recoverableNewArticles} artigo(s) novo(s) recuperável(is) e ${audit.counts.orphanKeywordsRecoverable} keyword(s) órfã(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível auditar as fontes.";
      setRecoveryError(message);
      showNotification("error", message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const applySafeRecovery = async () => {
    if (!recoverySnapshot || !recoveryPlan || !selectedBrandId || recoveryBusy) return;
    const actorUserId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorUserId) {
      const message = "Sessão autenticada ausente; a recuperação segura não foi aplicada.";
      setRecoveryError(message);
      showNotification("error", message);
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      pushMasterHistory(masterList, "Antes da recuperação segura do workspace");
      const sourceById = new Map(databaseSources.keywords.map(keyword => [String(keyword.id), keyword]));
      const siloNameMap = Object.fromEntries(databaseSources.silos.map(silo => [String(silo.id), silo.nome]));
      const currentByKeywordId = new Map(masterList.map(item => [String(item.keywordId || item.id), item]));
      const recoveredKeywordIds = new Set(recoveryPlan.recoveredMasterList.map(recovered => String(recovered.id)));
      const recoveredMasterItems = recoveryPlan.recoveredMasterList.map(recovered => {
        const keywordId = String(recovered.id);
        const source = sourceById.get(keywordId) || {};
        const current = currentByKeywordId.get(keywordId);
        const published = Boolean(current?.isPublished) || String(source.status || "").toLowerCase() === "publicado";
        const base = current || {
          id: keywordId,
          keywordId,
          keyword: source.keyword || keywordId,
          volume_search: source.volume_search ?? null,
          intent: source.intent ?? null,
          kgr: source.kgr_score || source.kgr || null,
          analise_semantica: source.analise_semantica || null,
        };
        if (published) {
          const publishedClusterId = current?.clusterId ?? base.clusterId ?? `pub-k-${keywordId}`;
          const publishedSiloId = current?.siloId ?? current?.silo_id ?? base.siloId ?? base.silo_id ?? source.lista_id ?? null;
          return {
            ...base,
            keywordId: base.keywordId || keywordId,
            status: "publicado",
            isPublished: true,
            clusterId: publishedClusterId,
            provisionalGroupId: current?.provisionalGroupId ?? base.provisionalGroupId ?? publishedClusterId,
            siloId: publishedSiloId,
            silo_id: current?.silo_id ?? base.silo_id ?? publishedSiloId,
            siloName: current?.siloName ?? base.siloName ?? siloNameMap[String(source.lista_id)] ?? null,
            computedSlug: current?.computedSlug ?? current?.slug_sugerido ?? base.computedSlug ?? base.slug_sugerido ?? source.slug_sugerido ?? toSlug(String(source.keyword || keywordId)),
            computedHierarquia: current?.computedHierarquia ?? current?.hierarquia ?? base.computedHierarquia ?? base.hierarquia ?? source.hierarquia ?? "Pilar",
          };
        }
        return {
          ...base,
          keywordId: base.keywordId || keywordId,
          keyword: base.keyword || source.keyword || keywordId,
          status: source.status || "aprovado",
          isPublished: false,
          clusterId: recovered.clusterId ?? null,
          provisionalGroupId: recovered.provisionalGroupId ?? null,
          siloId: recovered.siloId ?? null,
          silo_id: recovered.silo_id ?? null,
          siloName: recovered.siloName ?? null,
          computedSlug: recovered.computedSlug ?? current?.computedSlug ?? source.slug_sugerido ?? toSlug(String(source.keyword || keywordId)),
          computedHierarquia: recovered.computedHierarquia ?? current?.computedHierarquia ?? (published ? current?.hierarquia || "Pilar" : undefined),
        };
      });
      // Nenhum registro que já estava no workspace é descartado por falta de
      // correspondência momentânea na leitura da fonte mestre.
      const preservedCurrentItems = masterList.filter(item => !recoveredKeywordIds.has(String(item.keywordId || item.id)));
      const nextMasterList = [...recoveredMasterItems, ...preservedCurrentItems];
      const safeGroups = recoveryPlan.recoveredProvisionalGroups.flatMap(group => {
        const parsed = ProvisionalArticleGroupSchema.safeParse(group);
        return parsed.success ? [parsed.data] : [];
      });
      const rawReview = await readBrowserArtifactReadOnly(architectReviewRecoveryKey(actorUserId, selectedBrandId));
      let review: z.infer<typeof ArchitectReviewRecoverySchema> | null = null;
      try { if (rawReview) review = ArchitectReviewRecoverySchema.parse(rawReview); } catch { /* snapshot mantém a evidência inválida */ }
      const nextCustomSlugs = review?.customSlugs || customSlugs;
      const nextCustomHierarchies = review?.customHierarchies || customHierarquias;
      setMasterList(nextMasterList);
      setProvisionalGroups(safeGroups);
      setCustomSlugs(nextCustomSlugs);
      setCustomHierarquias(nextCustomHierarchies);
      setArchitectImportedKeywordIds(recoveryPlan.correctedImportedKeywordIds);
      const persistedReview = ArchitectReviewRecoverySchema.parse({
        schemaVersion: 1,
        importedKeywordSignature: recoveryPlan.correctedImportedKeywordIds.slice().sort().join("|"),
        masterList: nextMasterList,
        provisionalGroups: safeGroups,
        customSlugs: nextCustomSlugs,
        customHierarchies: nextCustomHierarchies,
        annotations: aiReviewAnnotations,
        savedAt: new Date().toISOString(),
      });
      await writeBrowserArtifact(architectReviewRecoveryKey(actorUserId, selectedBrandId), persistedReview);
      setRecoveryAudit(recoveryPlan);
      showNotification("success", `Recuperação aplicada sem reagrupamento: ${recoveryPlan.counts.recoverableNewArticles} artigo(s) preservado(s), ${recoveryPlan.orphanKeywordIds.length} keyword(s) em Keywords não agrupadas e índice corrigido.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível aplicar a recuperação segura.";
      setRecoveryError(message);
      showNotification("error", message);
    } finally {
      setRecoveryBusy(false);
    }
  };


  const prepareSelectedLogicalArticleDnas = async () => {
    const actorId = session?.user?.id || "human-reviewer";
    if (!selectedBrandId) throw new Error("Selecione uma marca antes de salvar a definição do artigo.");
    const versions: VersionEnvelope<ArticleDNA>[] = [];
    const proposedEvents: VersionStatusEvent[] = [];
    for (const group of selectedStrategicGroups()) {
      const entityId = group.publishedAnchorId || group.id;
      const current = acceptedArticleDnas[entityId];
      const currentStatus = current ? effectiveVersionStatus(current.versionId, versionEvents) : null;
      if (current && currentStatus !== "rejected" && currentStatus !== "superseded") {
        const currentKgrIdentity = current.payload.kgrIdentity || null;
        const nextKgrIdentity = deterministicArticleDnaPayload(group, selectedBrandId).kgrIdentity || null;
        if (JSON.stringify(currentKgrIdentity) !== JSON.stringify(nextKgrIdentity)) {
          const nextPayload = { ...current.payload };
          if (nextKgrIdentity) nextPayload.kgrIdentity = nextKgrIdentity;
          else delete nextPayload.kgrIdentity;
          const successor = await createVersionEnvelope({
            entityId,
            versionNumber: current.versionNumber + 1,
            previousVersionId: current.versionId,
            origin: "human",
            changeReason: "Decisão KGR do artigo reavaliada a partir da Principal vigente.",
            createdBy: actorId,
            payload: nextPayload,
          });
          const persistedSuccessor = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "article_dna", action: "edit", version: successor });
          const canonicalSuccessor = persistedSuccessor.version as VersionEnvelope<ArticleDNA>;
          versions.push(canonicalSuccessor);
          proposedEvents.push(createStatusEvent(canonicalSuccessor.versionId, "proposed", canonicalSuccessor.createdBy, "Decisão KGR atualizada; revisão humana da versão sucessora pendente."));
          continue;
        }
        const persistedCurrent = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "article_dna", action: "create", version: current });
        const canonicalCurrent = persistedCurrent.version as VersionEnvelope<ArticleDNA>;
        versions.push(canonicalCurrent);
        proposedEvents.push(createStatusEvent(canonicalCurrent.versionId, "proposed", canonicalCurrent.createdBy, "Base lógica pronta para decisão humana."));
        continue;
      }
      const publishedCompatibilityIssues = publishedArticleCompatibilityIssues(group.keywordIds, entityId,
        Object.values(acceptedArticleDnas).filter(version => Boolean(version.payload.publishedIdentityRef)));
      if (publishedCompatibilityIssues.length) throw new Error(publishedCompatibilityIssues[0]);
      const payloadBase = deterministicArticleDnaPayload(group, selectedBrandId);
      const assessment = latestSerpAssessmentFor(entityId);
      const payload: ArticleDNA = assessment ? {
        ...payloadBase,
        serpAssessmentRef: { entityId: assessment.id, versionId: `${assessment.id}:v${assessment.version}`, contentHash: assessment.contentHash },
      } : payloadBase;
      const version = await createVersionEnvelope({ entityId, versionNumber: (current?.versionNumber || 0) + 1,
        previousVersionId: current?.versionId || null, origin: "system", changeReason: "ArticleDNA-base criado pelo agrupamento lógico aprovado pelo usuário.", createdBy: actorId, payload });
      const persisted = await persistArquitetoArtifact({ brandId: selectedBrandId, artifactType: "article_dna", action: "create", version });
      const canonicalVersion = persisted.version as VersionEnvelope<ArticleDNA>;
      versions.push(canonicalVersion);
      proposedEvents.push(createStatusEvent(canonicalVersion.versionId, "proposed", canonicalVersion.createdBy, "Base lógica pronta para decisão humana."));
      proposedEvents.push(createStatusEvent(version.versionId, "proposed", actorId, "Base lógica pronta para decisão humana."));
    }
    if (versions.length) setAcceptedArticleDnas(previous => ({ ...previous, ...Object.fromEntries(versions.map(version => [version.payload.articleId, version])) }));
    if (proposedEvents.length) addVersionEvents(proposedEvents);
    return { actorId, versions, proposedEvents };
  };

  const changeSelectedArticleStatus = async (target: string) => {
    pushMasterHistory(masterList, `Alterar status de ${selectedArticleIds.size} artigo(s) para ${target}`);
    setSelectedStatusAction(target);
    if (target === "awaiting_approval") {
      const prepared = await prepareSelectedLogicalArticleDnas();
      showNotification(prepared.versions.length ? "success" : "error", prepared.versions.length
        ? `${prepared.versions.length} artigo(s) enviado(s) para aprovação humana, sem chamar IA.`
        : "Nenhum artigo novo válido foi encontrado na seleção.");
    } else if (target === "approved") {
      const prepared = await prepareSelectedLogicalArticleDnas();
      const candidates = prepared.versions.filter(version => effectiveVersionStatus(version.versionId, [...versionEvents, ...prepared.proposedEvents]) !== "approved");
      if (!candidates.length) showNotification("error", "Os artigos selecionados já estão aprovados ou não correspondem a grupos novos válidos.");
      else {
        const approvedEvents = candidates.map(version => createStatusEvent(version.versionId, "approved", prepared.actorId, "Status aprovado manualmente na barra de seleção."));
        const combinedEvents = [...versionEvents, ...prepared.proposedEvents, ...approvedEvents];
        const eligible = candidates.filter(version => articleApprovalIssues(version, combinedEvents).length === 0);
        const eligibleIds = new Set(eligible.map(version => version.versionId));
        addVersionEvents(approvedEvents.filter(event => eligibleIds.has(event.versionId)));
        const blocked = candidates.filter(version => !eligibleIds.has(version.versionId));
        const blockers = [...new Set(blocked.flatMap(version => articleApprovalIssues(version, combinedEvents).filter(issue => !issue.includes("aprovação humana"))))];
        showNotification(eligible.length ? "success" : "error", `${eligible.length} artigo(s) aprovado(s)${blocked.length ? `. ${blocked.length} pendente(s): ${blockers.join(" ")}` : " para o Radar."}`);
      }
    } else if (target === "sent_radar") {
      void sendSelectedToRadar();
    }
    if (selectedSiloPageIds.size > 0) {
      const actorId = session?.user?.id || "human-reviewer";
      if (target === "approved") {
        const pageEvents: VersionStatusEvent[] = [];
        for (const pageEntityId of selectedSiloPageIds) {
          const pv = acceptedSiloPages[pageEntityId];
          if (!pv) continue;
          const currentStatus = effectiveVersionStatus(pv.versionId, versionEvents);
          if (currentStatus !== "approved") pageEvents.push(createStatusEvent(pv.versionId, "approved", actorId, "Pagina do Silo aprovada manualmente."));
        }
        if (pageEvents.length) addVersionEvents(pageEvents);
      }
    }
    setSelectedStatusAction("");
  };

  // ── Mapeamento estável de cores por Artigo (Cluster) dentro de cada Silo
  /**
   * Continuidade da mesa: toda KeywordDNA recebida continua rastreável ao
   * trocar de aba. O que não pode virar Article vira linha de pipeline, com o
   * motivo do bloqueio — nada é criado só para manter a keyword visível.
   */
  const groupedArticles = useMemo(() => {
    if (workspaceMode === "articles") {
      /**
       * A hierarquia organiza a planilha; ela não substitui a planilha.
       *
       * O agrupamento muda a ORDEM e o cabeçalho — a linha do Article continua
       * sendo a mesma de sempre, com todas as colunas e o detalhe completo.
       */
      const porRef = new Map(articleSiloViews.map(view => [view.siloRef, view]));
      const grupos = new Map<string, {
        key: string;
        siloId: any;
        siloRef: string | null;
        siloName: string;
        siloSlug: string | null;
        articles: typeof filteredArticles;
        published: typeof articleSiloViews[number]["nodes"];
      }>();

      // A ordem é a das SiloPages; o patrimônio publicado abre cada grupo.
      for (const view of articleSiloViews) {
        grupos.set(view.siloRef, {
          key: view.siloRef,
          siloId: null,
          siloRef: view.siloRef,
          siloName: view.siloLabel,
          siloSlug: view.siloSlug,
          articles: [],
          published: view.nodes.filter(node => node.kind === "published"),
        });
      }

      for (const art of filteredArticles) {
        const ref = typeof art.mainKeywordObj?.territoryRef === "string" ? art.mainKeywordObj.territoryRef : null;
        const grupo = ref ? grupos.get(ref) : null;
        if (grupo) { grupo.articles.push(art); continue; }
        // Sem Silo resolvido a linha não some: ela ganha o próprio grupo.
        const semSilo = grupos.get("sem-silo") ?? {
          key: "sem-silo",
          siloId: null,
          siloRef: null,
          siloName: "ARTIGOS SEM SILO",
          siloSlug: null,
          articles: [] as typeof filteredArticles,
          published: [] as typeof articleSiloViews[number]["nodes"],
        };
        semSilo.articles.push(art);
        grupos.set("sem-silo", semSilo);
      }

      return [...grupos.values()].filter(grupo => grupo.articles.length > 0 || grupo.published.length > 0);
    }
    const groups = new Map<string, {
      key: string;
      siloId: any;
      // Campos da projeção de Artigos; nas demais áreas ficam vazios.
      siloRef: string | null;
      siloName: string;
      siloSlug: string | null;
      articles: typeof filteredArticles;
      published: typeof articleSiloViews[number]["nodes"];
    }>();

    filteredArticles.forEach(art => {
      /*
       * O grupo é o Silo a que o artigo PERTENCE, não o Silo já consolidado.
       *
       * Agrupar por `siloId` mandava para "ARTIGOS SEM SILO" oito artigos com
       * território confirmado e ArticleDNA aprovado: a aba Links negava um
       * vínculo que a fase Silos já tinha decidido. Que o grafo ainda dependa
       * de SiloDNA/SiloPage é PORTÃO, e portão se diz no cabeçalho do grupo.
       */
      const pai = articleParentFor(art);
      const hasCanonicalSilo = pai.state === "CANONICAL_SILO";
      const siloName = pai.hasParent ? articleParentLabel(pai) : "ARTIGOS SEM SILO";
      const siloSlug = hasCanonicalSilo ? (art.siloSlug || toSlug(pai.label)) : null;
      const key = pai.territoryRef ? `territory:${pai.territoryRef}` : "sem-silo";

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          siloId: hasCanonicalSilo ? art.siloId : null,
          siloRef: pai.territoryRef,
          siloName,
          siloSlug,
          articles: [],
          published: [],
        });
      }

      groups.get(key)!.articles.push(art);
    });

    return Array.from(groups.values());
    // `remoteTerritories` e a partição do cenário entram nas dependências:
    // sem elas o agrupamento congelava no primeiro render, quando os Silos
    // confirmados ainda não tinham chegado — e todo artigo caía em
    // "ARTIGOS SEM SILO" para sempre.
  }, [filteredArticles, articleSiloViews, workspaceMode, remoteTerritories, materializationPartition, acceptedArticleDnas]);

  const visibleArticleIds = useMemo(
    () => groupedArticles.flatMap(group => group.articles.map(article => article.id)),
    [groupedArticles],
  );
  useEffect(() => {
    visibleArticleIdsRef.current = visibleArticleIds;
  }, [visibleArticleIds]);
  const visibleSelectedArticleCount = visibleArticleIds.filter(id => selectedArticleIds.has(id)).length;
  const allVisibleArticlesSelected = visibleArticleIds.length > 0 && visibleSelectedArticleCount === visibleArticleIds.length;
  const someVisibleArticlesSelected = visibleSelectedArticleCount > 0 && !allVisibleArticlesSelected;
  const hiddenSelectedArticleCount = selectedArticleIds.size - visibleSelectedArticleCount;

  // A seleção altera somente a célula do checkbox, o realce da linha e os
  // agregados de seleção. Todo o restante da tabela usa esta revisão, que não
  // inclui selectedArticleIds, para permanecer memoizado durante um toggle.
  /**
   * Proposta humana em avaliação; nada foi gravado enquanto ela existe.
   *
   * Ela nasce ANTES da revisão de repintura da mesa de propósito: propor,
   * aplicar e descartar precisam aparecer na hora, e o detalhe do artigo é
   * memoizado. Sem entrar na revisão, a única tela onde a consequência é
   * mostrada ficaria congelada justamente quando ela passa a existir.
   */
  const [pendingScenarioChange, setPendingScenarioChange] = useState<ScenarioChange | null>(null);

  const articleTableRenderRevision = useMemo(() => ({
    articlesList,
    pendingScenarioChange,
    groupedArticles,
    filteredArticles,
    customSlugs,
    customHierarquias,
    acceptedArticleDnas,
    acceptedSiloDnas,
    versionEvents,
    radarItems,
    serpAssessments,
    publicationVerifications,
    serpExecution,
    verificationBusy,
    siloOptions,
    expandedIds,
    activeTabs,
    expandedKwIds,
    unitDrafts,
    primaryDrafts,
    dnaMetaTitles,
    dnaMetaDescriptions,
    dnaAngulosVenda,
    dnaCTAs,
    dnaAntiCanibalizacoes,
    pendingKeywordReview,
    pendingManualArchitecture,
    activeLogicalTask,
    activeKeywordReviewTask,
    activeArticleDnaTask,
    provisionalGroups,
    savingBriefingId,
  }), [
    articlesList,
    pendingScenarioChange,
    groupedArticles,
    filteredArticles,
    customSlugs,
    customHierarquias,
    acceptedArticleDnas,
    acceptedSiloDnas,
    versionEvents,
    radarItems,
    serpAssessments,
    publicationVerifications,
    serpExecution,
    verificationBusy,
    siloOptions,
    expandedIds,
    activeTabs,
    expandedKwIds,
    unitDrafts,
    primaryDrafts,
    dnaMetaTitles,
    dnaMetaDescriptions,
    dnaAngulosVenda,
    dnaCTAs,
    dnaAntiCanibalizacoes,
    pendingKeywordReview,
    pendingManualArchitecture,
    activeLogicalTask,
    activeKeywordReviewTask,
    activeArticleDnaTask,
    provisionalGroups,
    savingBriefingId,
  ]);

  useEffect(() => {
    const articleIds = new Set(articlesList.map(article => article.id));
    setSelectedArticleIds(current => {
      const next = new Set([...current].filter(id => articleIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (lastSelectionAnchorId.current && !articleIds.has(lastSelectionAnchorId.current)) {
      lastSelectionAnchorId.current = null;
    }
  }, [articlesList]);

  useEffect(() => {
    if (headerSelectionRef.current) {
      headerSelectionRef.current.indeterminate = someVisibleArticlesSelected;
    }
  }, [someVisibleArticlesSelected]);

  const getArticleIdAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const checkbox = element?.closest<HTMLElement>("[data-article-selection-id]");
    return checkbox?.dataset.articleSelectionId || null;
  }, []);

  const applySelectionPaintForId = useCallback((drag: ArticleSelectionDrag, currentId: string) => {
    if (!drag.visibleIdSet.has(currentId)) return false;
    if (drag.lastPaintedId === currentId) return false;
    drag.lastPaintedId = currentId;
    const next = applySelectionPaint({
      initialSelectedIds: drag.initialSelectedIds,
      visibleIds: drag.visibleIds,
      anchorId: drag.sourceId,
      currentId,
      mode: drag.mode,
    });
    if (sameSelectionSet(next, drag.lastAppliedSelection)) return false;
    drag.lastAppliedSelection = next;
    markSelectionInteraction("paint");
    setSelectedArticleIds(next);
    return true;
  }, [markSelectionInteraction]);

  const applySelectionPaintAtPoint = useCallback((clientX: number, clientY: number) => {
    const drag = selectionDragRef.current;
    if (!drag || !drag.started) return;
    const currentId = getArticleIdAtPoint(clientX, clientY);
    if (!currentId) return;
    applySelectionPaintForId(drag, currentId);
  }, [applySelectionPaintForId, getArticleIdAtPoint]);

  const maybeStartSelectionDrag = useCallback((event: Pick<PointerEvent, "clientX" | "clientY" | "preventDefault">) => {
    const drag = selectionDragRef.current;
    if (!drag || drag.started || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < ARTICLE_SELECTION_DRAG_THRESHOLD) return false;
    event.preventDefault();
    drag.started = true;
    suppressSelectionClickRef.current = true;
    lastSelectionAnchorId.current = drag.sourceId;
    drag.previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    drag.lastPaintedId = null;
    // O primeiro artigo é aplicado assim que o gesto vira pintura. O ponto
    // atual é recalculado logo depois, sem depender de pointerenter.
    applySelectionPaintForId(drag, drag.sourceId);
    try {
      if (!drag.captureTarget.hasPointerCapture(drag.pointerId)) drag.captureTarget.setPointerCapture(drag.pointerId);
    } catch {
      // O navegador pode ter cancelado o alvo entre pointerdown e o threshold;
      // os listeners temporários continuam recebendo o gesto.
    }
    applySelectionPaintAtPoint(event.clientX, event.clientY);
    return true;
  }, [applySelectionPaintAtPoint, applySelectionPaintForId]);

  const finishSelectionDrag = useCallback((pointerId?: number, cancelled = false) => {
    const drag = selectionDragRef.current;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    selectionDragRef.current = null;
    drag.cleanupListeners?.();
    drag.cleanupListeners = null;
    if (drag.started && !cancelled) {
      // O clique sintético posterior ao pointerup não pode alternar novamente
      // a seleção que já foi pintada imediatamente durante o movimento.
      suppressSelectionClickRef.current = true;
      window.setTimeout(() => {
        suppressSelectionClickRef.current = false;
      }, 0);
    } else if (cancelled) {
      suppressSelectionClickRef.current = false;
    }
    document.body.style.userSelect = drag.previousUserSelect;
    if (drag.captureTarget.hasPointerCapture(drag.pointerId)) {
      drag.captureTarget.releasePointerCapture(drag.pointerId);
    }
  }, []);

  const handleSelectionPointerDown = useCallback((id: string, event: React.PointerEvent<HTMLInputElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (selectionDragRef.current) return;
    event.stopPropagation();
    const currentSelectedArticleIds = selectedArticleIdsRef.current;
    const currentVisibleArticleIds = visibleArticleIdsRef.current;
    const drag: ArticleSelectionDrag = {
      pointerId: event.pointerId,
      sourceId: id,
      mode: currentSelectedArticleIds.has(id) ? "deselect" : "select",
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      initialSelectedIds: new Set(currentSelectedArticleIds),
      visibleIds: [...currentVisibleArticleIds],
      visibleIdSet: new Set(currentVisibleArticleIds),
      lastPaintedId: null,
      lastAppliedSelection: new Set(currentSelectedArticleIds),
      captureTarget: event.currentTarget,
      previousUserSelect: document.body.style.userSelect,
      cleanupListeners: null,
    };
    selectionDragRef.current = drag;

    const handleNativePointerMove = (nativeEvent: PointerEvent) => {
      const active = selectionDragRef.current;
      if (!active || active.pointerId !== nativeEvent.pointerId) return;
      if (!active.started) {
        maybeStartSelectionDrag(nativeEvent);
        return;
      }
      nativeEvent.preventDefault();
      applySelectionPaintAtPoint(nativeEvent.clientX, nativeEvent.clientY);
    };
    const handleNativePointerUp = (nativeEvent: PointerEvent) => {
      if (selectionDragRef.current?.pointerId === nativeEvent.pointerId) finishSelectionDrag(nativeEvent.pointerId);
    };
    const handleNativePointerCancel = (nativeEvent: PointerEvent) => {
      if (selectionDragRef.current?.pointerId === nativeEvent.pointerId) finishSelectionDrag(nativeEvent.pointerId, true);
    };
    window.addEventListener("pointermove", handleNativePointerMove, { passive: false });
    window.addEventListener("pointerup", handleNativePointerUp);
    window.addEventListener("pointercancel", handleNativePointerCancel);
    drag.cleanupListeners = () => {
      window.removeEventListener("pointermove", handleNativePointerMove);
      window.removeEventListener("pointerup", handleNativePointerUp);
      window.removeEventListener("pointercancel", handleNativePointerCancel);
    };
  }, [applySelectionPaintAtPoint, finishSelectionDrag, maybeStartSelectionDrag]);

  const handleSelectionPointerMove = useCallback((event: React.PointerEvent<HTMLInputElement>) => {
    const drag = selectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const startedNow = maybeStartSelectionDrag(event);
    if (selectionDragRef.current?.started && !startedNow) {
      event.preventDefault();
      applySelectionPaintAtPoint(event.clientX, event.clientY);
    }
  }, [applySelectionPaintAtPoint, maybeStartSelectionDrag]);

  const handleSelectionPointerUp = useCallback((event: React.PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    finishSelectionDrag(event.pointerId);
  }, [finishSelectionDrag]);

  const handleSelectionPointerCancel = useCallback((event: React.PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    finishSelectionDrag(event.pointerId, true);
  }, [finishSelectionDrag]);

  const handleSelectionLostPointerCapture = useCallback((event: React.PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    finishSelectionDrag(event.pointerId, true);
  }, [finishSelectionDrag]);

  useEffect(() => {
    const finish = () => finishSelectionDrag(undefined, true);
    window.addEventListener("blur", finish);
    return () => window.removeEventListener("blur", finish);
  }, [finishSelectionDrag]);

  const handleArticleSelectionClick = useCallback((id: string, event: React.MouseEvent<HTMLInputElement>, mode: "row" | "group" = "row") => {
    event.stopPropagation();
    if (mode !== "row") return;
    if (suppressSelectionClickRef.current) {
      event.preventDefault();
      suppressSelectionClickRef.current = false;
      return;
    }
    const result = applyArticleSelectionClick({
      selectedIds: selectedArticleIdsRef.current,
      visibleIds: visibleArticleIdsRef.current,
      id,
      anchorId: lastSelectionAnchorId.current && visibleArticleIdsRef.current.includes(lastSelectionAnchorId.current)
        ? lastSelectionAnchorId.current
        : null,
      shiftKey: event.shiftKey,
      additiveKey: event.ctrlKey || event.metaKey,
    });
    markSelectionInteraction(event.shiftKey ? event.ctrlKey || event.metaKey ? "ctrl-shift-click" : "shift-click" : event.ctrlKey || event.metaKey ? "additive-click" : "click");
    setSelectedArticleIds(result.selectedIds);
    lastSelectionAnchorId.current = result.anchorId;
  }, [markSelectionInteraction]);

  const selectArticles = (articleIds: string[]) => {
    markSelectionInteraction("selection-menu");
    setSelectedArticleIds(new Set(articleIds));
    if (articleIds.length === 0) lastSelectionAnchorId.current = null;
    setSelectionMenuOpen(false);
  };

  const selectGroup = (articleIds: string[]) => {
    markSelectionInteraction("group-selection");
    setSelectedArticleIds(new Set(articleIds));
    lastSelectionAnchorId.current = null;
    setSelectionMenuOpen(false);
  };

  const requestSelectedKeywordDeletion = async () => {
    if (!selectedBrandId) {
      showNotification("error", "Marca ativa ausente para a exclusão.");
      return;
    }
    const keywordIds = selectedArticleKeywordIds(selectedArticleIdsRef.current, articlesList);
    if (!keywordIds.length) {
      showNotification("error", "Selecione um ou mais artigos com KeywordDNAs para excluir.");
      return;
    }
    setUpdating(true);
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/delete/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds }),
      });
      const payload = await response.json().catch(() => ({}));
      const review = parseArchitectKeywordDeletePreview(keywordIds, response.ok ? payload : { success: false });
      setKeywordDeleteReview(review);
      if (review.publishedIds.length) setKeywordDeletePublishedOpen(true);
      else setKeywordDeleteSimpleOpen(true);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Nada foi excluído: a prévia do ciclo de vida não foi confirmada.");
    } finally {
      setUpdating(false);
    }
  };

  const confirmSelectedKeywordDeletion = async () => {
    if (!selectedBrandId || !keywordDeleteReview) return false;
    setUpdating(true);
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds: keywordDeleteReview.ids }),
      });
      const payload = await response.json().catch(() => ({}));
      const result = parseArchitectKeywordDeleteResult(keywordDeleteReview, response.ok ? payload : { success: false });
      const readback = await loadCanonicalArquitetoWorkspace(selectedBrandId);
      assertArchitectKeywordDeleteReadback(keywordDeleteReview, readback.keywords.map(keyword => keyword.id));
      const deletedIds = new Set(keywordDeleteReview.ids);
      setMasterList(previous => previous.filter(keyword => !deletedIds.has(String(keyword.id))));
      setProvisionalGroups(previous => previous.filter(group => !group.keywordIds.some(keywordId => deletedIds.has(String(keywordId)))));
      setSelectedArticleIds(new Set());
      lastSelectionAnchorId.current = null;
      setKeywordDeleteSimpleOpen(false);
      setKeywordDeletePublishedOpen(false);
      setKeywordDeleteReview(null);
      setCanonicalWorkspaceReload(current => current + 1);
      if (result.hardDeletedIds.length && result.recoverableIds.length) {
        showNotification("success", `${result.hardDeletedIds.length} KeywordDNA(s) excluída(s) definitivamente; ${result.recoverableIds.length} publicada(s) removida(s) da operação por 24 horas. Readback confirmado.`);
      } else if (result.recoverableIds.length) {
        showNotification("success", `${result.recoverableIds.length} KeywordDNA(s) publicada(s) removida(s) da operação por 24 horas. Readback confirmado.`);
      } else {
        showNotification("success", `${result.hardDeletedIds.length} KeywordDNA(s) excluída(s) definitivamente. Readback confirmado.`);
      }
      return true;
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Nada foi excluído: a transação ou o readback não foi confirmado.");
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const confirmDangerAction = () => {
    if (!pendingDangerAction) return;
    pushMasterHistory(masterList, pendingDangerAction.type === "reset-new" ? "Resetar organização dos artigos novos" : `Remover silo ${pendingDangerAction.siloName}`);
    if (pendingDangerAction.type === "reset-new") {
      setMasterList(previous => previous.filter(item => item.status === "publicado"));
      setSelectedArticleIds(new Set());
      showNotification("success", "Reset aprovado: somente itens não-publicados foram removidos.");
    } else {
      const clusterIds = new Set(pendingDangerAction.clusterIds);
      setMasterList(previous => previous.map(keyword => clusterIds.has(String(keyword.clusterId)) ? { ...keyword, siloId: null, silo_id: null, siloName: null } : keyword));
      setSelectedArticleIds(previous => { const next = new Set(previous); pendingDangerAction.articleIds.forEach(id => next.delete(id)); return next; });
      showNotification("success", "Silo removido da estrutura local; artigos voltaram para Sem Grupo.");
    }
    setPendingDangerAction(null);
  };

  const importApprovedKeywords = async (ids: string[]) => {
    if (!selectedBrandId || !ids.length) return;
    try {
      const result = await persistMineradorArquitetoHandoff({ brandId: selectedBrandId, keywordIds: ids });
      pushMasterHistory(masterList, `Importar ${result.importedKeywordIds.length} keyword(s) do Minerador`);
      setKeywordImportOpen(false);
      setCanonicalWorkspaceReload(current => current + 1);
      showNotification(
        "success",
        result.persistence === "UNCHANGED"
          ? "As keywords selecionadas já estavam no workspace canônico do Arquiteto."
          : `${result.createdKeywordIds.length} keyword(s) importada(s) para o Arquiteto.`,
      );
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível confirmar o handoff remoto.");
    }
  };

  const { registerControls, updateControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  const topbarHandlersRef = useRef({ fetchMasterList, processDeterministicStructure, showNotification, undoMasterList, redoMasterList });
  const siloHandlersRef = useRef({ formSilosWorkingCopy, reviewSilosWithIA, consolidateSilos, validateTerritorialSerp: async () => {}, reviewTerritorialWithAi: async () => {} });
  topbarHandlersRef.current.fetchMasterList = fetchMasterList;
  topbarHandlersRef.current.processDeterministicStructure = processDeterministicStructure;
  topbarHandlersRef.current.showNotification = showNotification;
  topbarHandlersRef.current.undoMasterList = undoMasterList;
  topbarHandlersRef.current.redoMasterList = redoMasterList;
  useEffect(() => {
    siloHandlersRef.current = { ...siloHandlersRef.current, formSilosWorkingCopy, reviewSilosWithIA, consolidateSilos };
  }, [consolidateSilos, formSilosWorkingCopy, reviewSilosWithIA]);

  const brandArticleVersions = Object.values(acceptedArticleDnas).filter(version => version.payload.brandId === selectedBrandId);
  const approvedBrandArticleVersions = brandArticleVersions.filter(version => effectiveVersionStatus(version.versionId, versionEvents) === "approved");
  const linkSiloContexts = useMemo(() => Object.values(acceptedSiloDnas)
    .filter(version => version.payload.brandId === selectedBrandId)
    .map(siloDna => {
      const siloId = siloDna.payload.siloId;
      const siloPage = acceptedSiloPages[`silo-page:${siloId}`]
        || Object.values(acceptedSiloPages).find(version => version.payload.siloId === siloId && version.payload.brandId === selectedBrandId);
      const workingCopy = siloWorkingCopies.find(copy => (copy.existingSiloId || copy.id) === siloId) || null;
      return siloPage ? { siloId, siloDna, siloPage, workingCopy } : null;
    })
    .filter((context): context is { siloId: string; siloDna: VersionEnvelope<SiloDNA>; siloPage: VersionEnvelope<SiloPage>; workingCopy: SiloWorkingCopy | null } => Boolean(context)),
  [acceptedSiloDnas, acceptedSiloPages, selectedBrandId, siloWorkingCopies]);
  const resolvedLinksSiloId = linksSelectedSiloId && linkSiloContexts.some(context => context.siloId === linksSelectedSiloId)
    ? linksSelectedSiloId
    : linkSiloContexts[0]?.siloId || null;
  const linkNodeDisplay = useMemo(() => Object.fromEntries((linksWorkingCopy || linksApprovedGraph)?.nodes.map(node => {
    const article = node.articleDnaVersionRef ? Object.values(acceptedArticleDnas).find(version => version.versionId === node.articleDnaVersionRef?.versionId)?.payload : null;
    const siloPage = node.siloPageVersionRef ? Object.values(acceptedSiloPages).find(version => version.versionId === node.siloPageVersionRef?.versionId)?.payload : null;
    return [node.nodeId, {
      slug: article?.publishedIdentityRef?.slug || article?.suggestedSlug || siloPage?.slug || null,
      canonical: article?.publishedIdentityRef?.canonical || article?.canonical || siloPage?.canonical || null,
    }];
  }) || []), [acceptedArticleDnas, acceptedSiloPages, linksApprovedGraph, linksWorkingCopy]);

  const linksSelectedContext = linkSiloContexts.find(context => context.siloId === resolvedLinksSiloId) || null;
  const stableLinksGraphId = resolvedLinksSiloId ? `arquiteto:internal-links:${resolvedLinksSiloId}` : null;
  const linksGraphId = linksLoadedGraphId || stableLinksGraphId;

  const handleLinksSiloChange = (siloId: string | null) => {
    setLinksSelectedSiloId(siloId);
    setLinksLoadedGraphId(null);
    setLinksApprovedGraph(null);
    setLinksWorkingCopy(null);
    setLinksSelectedNodeId(null);
    setLinksSelectedEdgeId(null);
    setLinksPersistedLockVersion(null);
    setLinksSaveState("idle");
    setLinksError(null);
  };

  const loadLinksRemote = useCallback(async () => {
    if (!selectedBrandId || !linksSelectedContext || !stableLinksGraphId) return;
    setLinksLoading(true);
    setLinksSaveState("loading");
    setLinksError(null);
    try {
      const graphs = await loadInternalLinkGraphs(selectedBrandId);
      const siloGraphs = graphs
        .filter(graph => graph.siloId === linksSelectedContext.siloId)
        .sort((left, right) => right.versionNumber - left.versionNumber);
      const approved = siloGraphs
        .filter(graph => graph.workflowStatus === "approved")
        .sort((left, right) => right.versionNumber - left.versionNumber)[0] || null;
      const graphIdentity = siloGraphs[0];
      const graphId = graphIdentity?.graphId || stableLinksGraphId;
      const workingCopy = await loadInternalLinkGraphWorkingCopy(selectedBrandId, graphId);
      setLinksLoadedGraphId(graphId);
      setLinksApprovedGraph(approved);
      setLinksWorkingCopy(workingCopy);
      setLinksPersistedLockVersion(workingCopy?.lockVersion ?? null);
      setLinksScenario(workingCopy ? "working" : approved ? "approved" : "working");
      setLinksSaveState("saved");
      return workingCopy;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar o InternalLinkGraph canônico.";
      setLinksError(message);
      setLinksSaveState("error");
    } finally {
      setLinksLoading(false);
    }
  }, [linksSelectedContext, selectedBrandId, stableLinksGraphId]);

  useEffect(() => {
    if (workspaceMode !== "links") return;
    // A entrada na aba é uma leitura externa; o callback atualiza o estado
    // somente depois da resposta canônica (ou do erro da leitura).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLinksRemote();
  }, [loadLinksRemote, workspaceMode]);

  const linkReferenceForVersion = (version: VersionEnvelope<unknown>): VersionReference => toVersionReference(version);
  const linksAuthenticatedActor = () => {
    const actorId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorId) throw new Error("Sessão autenticada ausente; o grafo não pode ser alterado.");
    return actorId;
  };
  const linkArticleLabel = (article: ArticleDNA, fallback: string) => {
    const reference = article.keywordReferences.find(item => item.keywordId === article.principalKeywordId);
    const keyword = reference?.keywordDnaSnapshot?.sourceKeywordSnapshot.keyword;
    return typeof keyword === "string" && keyword.trim() ? keyword : article.suggestedSlug || fallback;
  };

  const buildInitialLinksWorkingCopy = async (): Promise<InternalLinkGraphWorkingCopy> => {
    if (!selectedBrandId || !linksSelectedContext || !linksGraphId) throw new Error("Selecione um Silo com SiloDNA e SiloPage antes de abrir a working copy.");
    const silo = linksSelectedContext.siloDna.payload;
    const articleVersions = silo.articleReferences
      .map(reference => acceptedArticleDnas[reference.articleId])
      .filter((version): version is VersionEnvelope<ArticleDNA> => Boolean(version));
    if (articleVersions.length !== silo.articleReferences.length) throw new Error("A base do Silo referencia ArticleDNA que não está disponível no workspace.");
    const actorId = linksAuthenticatedActor();
    const siloPage = linksSelectedContext.siloPage;
    const nodes: InternalLinkGraphNode[] = [
      {
        nodeId: `silo-page:${silo.siloId}`,
        brandId: selectedBrandId,
        nodeType: "SILO_PAGE",
        articleDnaVersionRef: null,
        siloPageVersionRef: linkReferenceForVersion(siloPage),
        architecturalRole: null,
        snapshot: { label: siloPage.payload.h1 || `SiloPage · ${silo.name || silo.centralEntity}`, siloId: silo.siloId },
      },
      ...articleVersions.map(version => {
        const article = version.payload;
        const role = article.articleId === silo.pillarArticleId ? "PILAR" : silo.supportArticleIds.includes(article.articleId) ? "SUPORTE" : "OUTRO";
        return {
          nodeId: `article:${article.articleId}`,
          brandId: selectedBrandId,
          nodeType: "ARTICLE_DNA" as const,
          articleDnaVersionRef: linkReferenceForVersion(version),
          siloPageVersionRef: null,
          architecturalRole: role as "PILAR" | "SUPORTE" | "REFORCO" | "OUTRO",
          snapshot: { label: linkArticleLabel(article, article.articleId), siloId: silo.siloId },
        } satisfies InternalLinkGraphNode;
      }),
    ];
    return createInternalLinkGraphWorkingCopy({
      graphId: linksGraphId,
      brandId: selectedBrandId,
      siloId: silo.siloId,
      baseGraphVersionId: linksApprovedGraph?.graphVersionId || null,
      baseGraphContentHash: linksApprovedGraph?.contentHash || null,
      baseSiloDnaVersionRef: linkReferenceForVersion(linksSelectedContext.siloDna),
      baseSiloPageVersionRef: linkReferenceForVersion(siloPage),
      participatingArticleDnaVersionRefs: articleVersions.map(linkReferenceForVersion),
      nodes,
      edges: [],
      warnings: [],
      conflicts: [],
      createdBy: actorId,
      metadata: {},
    });
  };

  const persistLinksWorkingCopy = async (workingCopy: InternalLinkGraphWorkingCopy, action: "create" | "edit") => {
    if (!selectedBrandId) throw new Error("Selecione uma Brand antes de persistir o grafo.");
    const persisted = await persistInternalLinkGraphWorkingCopy({ brandId: selectedBrandId, action, workingCopy });
    setLinksWorkingCopy(persisted.workingCopy);
    setLinksLoadedGraphId(persisted.workingCopy.graphId);
    setLinksPersistedLockVersion(persisted.workingCopy.lockVersion);
    setLinksSaveState("saved");
    setLinksError(null);
    return persisted.workingCopy;
  };

  const handleOpenLinksWorkingCopy = async (): Promise<InternalLinkGraphWorkingCopy | null> => {
    setLinksSaveState("saving");
    try {
      /*
       * Abrir é ADOTAR o que já existe; criar é o caso de não existir.
       *
       * Uma tentativa anterior que falhou depois da escrita deixa a cópia
       * gravada no servidor. Insistir em `create` só recebia a recusa do
       * writer, e a cópia ficava inalcançável pelo único botão que a abriria.
       */
      const existente = await loadLinksRemote();
      if (existente) {
        setLinksScenario("working");
        showNotification("success", "Working copy do InternalLinkGraph carregada do servidor.");
        return existente;
      }
      const workingCopy = await buildInitialLinksWorkingCopy();
      const criada = await persistLinksWorkingCopy(workingCopy, "create");
      setLinksScenario("working");
      showNotification("success", "Working copy do InternalLinkGraph criada e confirmada no readback.");
      return criada;
    } catch (error) {
      setLinksSaveState("error");
      setLinksError(error instanceof Error ? error.message : "Não foi possível abrir a working copy do grafo.");
      showNotification("error", error instanceof Error ? error.message : "Não foi possível abrir a working copy do grafo.");
      return null;
    }
  };

  /**
   * `base` e o RETORNO existem para que uma ação componha várias etapas.
   *
   * Com "Processar links" derivando estrutura e âncoras no mesmo clique, ler
   * `linksWorkingCopy` do estado na segunda etapa pegaria a cópia ANTERIOR à
   * primeira: React só reflete o `set` no render seguinte, e as âncoras
   * chegariam a um grafo sem as arestas recém-criadas. Quem encadeia passa a
   * cópia adiante em vez de reler a tela.
   */
  const updateLinksWorkingCopy = async (
    changes: Partial<Pick<InternalLinkGraphWorkingCopy, "nodes" | "edges" | "warnings" | "conflicts">>,
    base?: InternalLinkGraphWorkingCopy,
  ): Promise<InternalLinkGraphWorkingCopy | null> => {
    const atual = base || linksWorkingCopy;
    if (!atual) return null;
    setLinksSaveState("idle");
    try {
      const next = await updateInternalLinkGraphWorkingCopy({
        previous: atual,
        changes,
        actorId: linksAuthenticatedActor(),
      });
      // lock_version is a remote concurrency token. Local edits update the
      // content/hash immediately but keep the last confirmed remote token.
      const resultado = { ...next, lockVersion: linksPersistedLockVersion || atual.lockVersion };
      setLinksWorkingCopy(resultado);
      setLinksSaveState("idle");
      setLinksError(null);
      return resultado;
    } catch (error) {
      setLinksSaveState("error");
      setLinksError(error instanceof Error ? error.message : "A alteração não corresponde ao contrato do grafo.");
      return null;
    }
  };

  const handleSaveLinksWorkingCopy = async () => {
    if (!linksWorkingCopy || linksPersistedLockVersion === null) return;
    setLinksSaveState("saving");
    try {
      await persistLinksWorkingCopy({ ...linksWorkingCopy, lockVersion: linksPersistedLockVersion }, "edit");
      showNotification("success", "Working copy do InternalLinkGraph salva e confirmada no readback.");
    } catch (error) {
      const isConflict = error instanceof InternalLinkGraphWorkingCopyPersistenceError && /stale|lock|concorr|vers[aã]o/i.test(`${error.code} ${error.message}`);
      setLinksSaveState(isConflict ? "conflict" : "error");
      setLinksError(error instanceof Error ? error.message : "Não foi possível salvar a working copy.");
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar a working copy.");
    }
  };

  const handleCreateLinksSuccessor = async (): Promise<InternalLinkGraphWorkingCopy | null> => {
    if (!linksApprovedGraph) return null;
    if (linksWorkingCopy) {
      showNotification("error", "Salve ou descarte a working copy atual antes de abrir uma sucessora.");
      return null;
    }
    setLinksSaveState("saving");
    try {
      const successor = await createInternalLinkGraphWorkingCopy({
        graphId: linksApprovedGraph.graphId,
        brandId: linksApprovedGraph.brandId,
        siloId: linksApprovedGraph.siloId,
        baseGraphVersionId: linksApprovedGraph.graphVersionId,
        baseGraphContentHash: linksApprovedGraph.contentHash,
        baseSiloDnaVersionRef: linksApprovedGraph.baseSiloDnaVersionRef,
        baseSiloPageVersionRef: linksApprovedGraph.baseSiloPageVersionRef,
        participatingArticleDnaVersionRefs: linksApprovedGraph.participatingArticleDnaVersionRefs,
        nodes: linksApprovedGraph.nodes,
        edges: linksApprovedGraph.edges,
        warnings: linksApprovedGraph.warnings,
        conflicts: linksApprovedGraph.conflicts,
        createdBy: linksAuthenticatedActor(),
        metadata: {},
      });
      const aberta = await persistLinksWorkingCopy(successor, "create");
      setLinksScenario("working");
      showNotification("success", "Working copy sucessora aberta a partir da versão aprovada.");
      return aberta;
    } catch (error) {
      setLinksSaveState("error");
      setLinksError(error instanceof Error ? error.message : "Não foi possível abrir a working copy sucessora.");
      showNotification("error", error instanceof Error ? error.message : "Não foi possível abrir a working copy sucessora.");
      return null;
    }
  };

  /**
   * PROCESSAR LINKS — a ação que PROPÕE.
   *
   * Uma fase, dois atos: processar propõe, confirmar fecha. Antes disto a aba
   * Links pedia motor por motor — abrir, derivar, pedir âncoras, salvar — e
   * mostrava "IA · Bloqueado" no lugar do que faltava fazer. Cada etapa era
   * uma chance de parar no meio e deixar o Silo com meio grafo.
   *
   * A cópia é passada adiante entre as etapas em vez de relida do estado:
   * dentro de um mesmo clique o React ainda não refletiu o `set` anterior, e
   * as âncoras chegariam a um grafo sem as arestas recém-derivadas.
   *
   * NADA aqui aprova: ao fim, a working copy está proposta e salva.
   */
  const processarLinks = async () => {
    if (!linksSelectedContext) {
      showNotification("error", "Selecione o Silo do grafo antes de processar os links.");
      return;
    }
    setLinksLoading(true);
    try {
      // Sucessora quando já existe grafo aprovado: aprovar de novo por cima do
      // mesmo artefato apagaria a versão que o humano já fechou.
      const aberta = linksWorkingCopy
        || (linksApprovedGraph ? await handleCreateLinksSuccessor() : await handleOpenLinksWorkingCopy());
      if (!aberta) return;

      const comEstrutura = await generateStructuralLinks(aberta);
      if (!comEstrutura) return;

      // O esqueleto é determinístico e obrigatório; as âncoras são a leitura
      // semântica por cima dele. Sem aresta não há o que ancorar.
      if (!comEstrutura.edges.length) {
        showNotification("warning", "Nenhuma conexão estrutural pôde ser derivada: o Silo não tem duas páginas linkáveis.");
        return;
      }
      await generateLinkAnchors(comEstrutura);
    } finally {
      setLinksLoading(false);
    }
  };

  const handleApproveLinks = async () => {
    if (!linksWorkingCopy || !selectedBrandId || linksSaveState === "saving") return;
    if (linksIsDirty) {
      showNotification("error", "Salve a working copy e confirme o readback antes da aprovação.");
      return;
    }
    if (linksApprovedGraph && linksWorkingCopy.contentHash === linksApprovedGraph.contentHash) {
      showNotification("error", "Nenhuma mudança estrutural foi feita; uma versão equivalente não será criada.");
      return;
    }
    setLinksSaveState("saving");
    try {
      const actorId = linksAuthenticatedActor();
      const graph = await createInternalLinkGraph({
        graphVersionId: crypto.randomUUID(),
        graphId: linksWorkingCopy.graphId,
        brandId: linksWorkingCopy.brandId,
        siloId: linksWorkingCopy.siloId,
        baseSiloDnaVersionRef: linksWorkingCopy.baseSiloDnaVersionRef,
        baseSiloPageVersionRef: linksWorkingCopy.baseSiloPageVersionRef,
        participatingArticleDnaVersionRefs: linksWorkingCopy.participatingArticleDnaVersionRefs,
        versionNumber: (linksApprovedGraph?.versionNumber || 0) + 1,
        previousVersionId: linksApprovedGraph?.graphVersionId || null,
        workflowStatus: "approved",
        createdBy: actorId,
        approvedBy: actorId,
        approvedAt: new Date().toISOString(),
        nodes: linksWorkingCopy.nodes,
        edges: linksWorkingCopy.edges,
        warnings: linksWorkingCopy.warnings,
        conflicts: linksWorkingCopy.conflicts,
      });
      const persisted = await persistInternalLinkGraph({ brandId: selectedBrandId, action: linksApprovedGraph ? "edit" : "create", graph });
      setLinksApprovedGraph(persisted.graph);
      setLinksWorkingCopy(null);
      setLinksPersistedLockVersion(null);
      setLinksScenario("approved");
      setLinksSaveState("saved");
      showNotification("success", `InternalLinkGraph v${persisted.graph.versionNumber} aprovado e confirmado no readback.`);
    } catch (error) {
      setLinksSaveState("error");
      setLinksError(error instanceof Error ? error.message : "Não foi possível aprovar o grafo.");
      showNotification("error", error instanceof Error ? error.message : "Não foi possível aprovar o grafo.");
    }
  };

  const linkNodeById = useMemo(() => new Map((linksWorkingCopy || linksApprovedGraph)?.nodes.map(node => [node.nodeId, node]) || []), [linksApprovedGraph, linksWorkingCopy]);
  const linkEdgeById = useMemo(() => new Map((linksWorkingCopy || linksApprovedGraph)?.edges.map(edge => [edge.edgeId, edge]) || []), [linksApprovedGraph, linksWorkingCopy]);
  const linksSelectedEdge = linksSelectedEdgeId ? linkEdgeById.get(linksSelectedEdgeId) || null : null;
  // A saved working copy is intentionally different from the approved baseline
  // until the human approves it. Dirty means only "not confirmed remotely";
  // comparison against the approved graph belongs to the review summary.
  const linksIsDirty = Boolean(linksWorkingCopy && linksSaveState !== "saved");
  const linksSelectedNode = linksSelectedNodeId ? linkNodeById.get(linksSelectedNodeId) || null : null;
  const linksReviewSummary = useMemo(() => {
    if (!linksWorkingCopy) return { added: 0, removed: 0, changed: 0 };
    const approvedEdges = new Map((linksApprovedGraph?.edges || []).map(edge => [edge.edgeId, edge]));
    const workingEdges = new Map(linksWorkingCopy.edges.map(edge => [edge.edgeId, edge]));
    const added = linksWorkingCopy.edges.filter(edge => !approvedEdges.has(edge.edgeId)).length;
    const removed = (linksApprovedGraph?.edges || []).filter(edge => !workingEdges.has(edge.edgeId)).length;
    const changed = linksWorkingCopy.edges.filter(edge => {
      const approved = approvedEdges.get(edge.edgeId);
      return approved ? JSON.stringify(approved) !== JSON.stringify(edge) : false;
    }).length;
    return { added, removed, changed };
  }, [linksApprovedGraph, linksWorkingCopy]);

  /**
   * O READ-MODEL DA FASE LINKS — uma leitura, dois botões.
   *
   * Os dois atos precisam concordar sobre o mesmo estado. Cada botão calculando
   * o seu próprio `disabled` é como a mesa passou a mostrar o mesmo artigo como
   * "Consolidado" e "Em processo" ao mesmo tempo: duas leituras da mesma
   * pergunta divergem no primeiro caso de borda.
   *
   * Todo impedimento é TEXTO. Botão apagado sem motivo obriga a adivinhar.
   */
  const linksPhaseReading = useMemo(() => {
    const blockers: string[] = [];
    if (!linksSelectedContext) blockers.push("Nenhum par SiloDNA + SiloPage disponível: o grafo não tem base sobre a qual existir.");

    const ocupado = linksLoading || linksSaveState === "saving";
    const processBlocker = !linksSelectedContext
      ? "Selecione o Silo do grafo."
      : ocupado
        ? "Há uma operação em curso."
        : null;

    const confirmBlocker = !linksWorkingCopy
      ? "Processe os links antes de confirmar: não há working copy a aprovar."
      : ocupado
        ? "Há uma operação em curso."
        : linksIsDirty || linksSaveState !== "saved"
          ? "Há alterações locais não confirmadas pelo readback; salve antes de aprovar."
          : !linksWorkingCopy.edges.length
            ? "A working copy não tem nenhuma conexão: não há grafo a aprovar."
            : null;

    if (confirmBlocker && linksWorkingCopy) blockers.push(confirmBlocker);

    const nome = linksSelectedContext
      ? linksSelectedContext.siloDna.payload.name
        || linksSelectedContext.siloDna.payload.centralEntity
        || linksSelectedContext.siloId
      : null;
    const summary = !nome
      ? "Sem Silo selecionado."
      : linksWorkingCopy
        ? `${nome} · working copy com ${linksWorkingCopy.edges.length} conexão(ões) sobre ${linksWorkingCopy.nodes.length} página(s). Proposta: nada aprovado ainda.`
        : linksApprovedGraph
          ? `${nome} · grafo aprovado v${linksApprovedGraph.versionNumber} com ${linksApprovedGraph.edges.length} conexão(ões). Processar abre uma sucessora; a versão aprovada é preservada.`
          : `${nome} · nenhum grafo ainda. Processar deriva o esqueleto do Silo e pede as âncoras.`;

    return {
      summary,
      blockers,
      canProcess: !processBlocker,
      processBlocker,
      canConfirm: !confirmBlocker,
      confirmBlocker,
    };
  }, [linksApprovedGraph, linksIsDirty, linksLoading, linksSaveState, linksSelectedContext, linksWorkingCopy]);
  const updateLinkEdge = async (edgeId: string, patch: Partial<Pick<InternalLinkGraphEdge, "sourceNodeId" | "targetNodeId" | "relationType" | "reason" | "priority" | "anchorConcepts">>) => {
    const current = linkEdgeById.get(edgeId);
    if (!current || !linksWorkingCopy) return;
    try {
      const nextEdge = InternalLinkGraphEdgeSchema.parse({ ...current, ...patch });
      const endpointChanged = patch.sourceNodeId !== undefined || patch.targetNodeId !== undefined || patch.relationType !== undefined;
      const nextSource = linkNodeById.get(nextEdge.sourceNodeId);
      const nextTarget = linkNodeById.get(nextEdge.targetNodeId);
      if (endpointChanged && (!nextSource || !nextTarget || !isInternalLinkGraphRelationCompatible(nextSource, nextTarget, nextEdge.relationType))) {
        throw new Error("O tipo da relação não é compatível com os nós source e target.");
      }
      const edges = linksWorkingCopy.edges.map(edge => edge.edgeId === edgeId ? nextEdge : edge);
      await updateLinksWorkingCopy({ edges });
    } catch (error) {
      setLinksSaveState("error");
      setLinksError(error instanceof Error ? error.message : "A relação não corresponde ao contrato canônico.");
    }
  };

  const suggestedAnchorConceptsForTarget = (target: InternalLinkGraphNode) => {
    const article = target.articleDnaVersionRef ? Object.values(acceptedArticleDnas).find(version => version.versionId === target.articleDnaVersionRef?.versionId)?.payload : null;
    const siloPage = target.siloPageVersionRef ? Object.values(acceptedSiloPages).find(version => version.versionId === target.siloPageVersionRef?.versionId)?.payload : null;
    return suggestInternalLinkAnchorConcepts({ article, siloPage, fallbackLabel: target.snapshot.label });
  };

  const handleCreateLinkEdge = async (sourceNodeId: string, targetNodeId: string) => {
    if (!linksWorkingCopy) {
      showNotification("error", "Abra a working copy antes de criar uma relação.");
      return;
    }
    const source = linkNodeById.get(sourceNodeId);
    const target = linkNodeById.get(targetNodeId);
    if (!source || !target || sourceNodeId === targetNodeId) {
      showNotification("error", "A relação precisa conectar dois nós distintos do mesmo grafo.");
      return;
    }
    if (linksWorkingCopy.edges.some(edge => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId)) {
      showNotification("error", "Esta relação dirigida já existe na working copy.");
      return;
    }
    const relationType = inferInternalLinkGraphRelationType(source, target);
    if (!relationType) {
      showNotification("error", "Os nós escolhidos não têm uma relação canônica compatível.");
      return;
    }
    const anchorConcepts = suggestedAnchorConceptsForTarget(target);
    if (!anchorConcepts.length) {
      showNotification("error", "A relação precisa de um conceito semântico de destino antes de ser criada.");
      return;
    }
    const actorId = linksAuthenticatedActor();
    const edge = InternalLinkGraphEdgeSchema.parse({
      edgeId: `edge:${crypto.randomUUID()}`,
      sourceNodeId,
      targetNodeId,
      relationType,
      reason: "Relação criada manualmente; motivo editorial pendente de revisão.",
      priority: "MEDIUM",
      anchorConcepts,
      origin: "human",
      createdBy: actorId,
      createdAt: new Date().toISOString(),
      provenance: { source: "human-workbench", references: [] },
    });
    await updateLinksWorkingCopy({ edges: [...linksWorkingCopy.edges, edge] });
    setLinksSelectedEdgeId(edge.edgeId);
  };

  /**
   * O esqueleto do Silo vira arestas.
   *
   * Nada aqui é sugestão: a SiloPage é a raiz, o Pilar foi escolhido por um
   * humano e os Suportes são o resto da composição consolidada. Pedir que
   * alguém arraste treze relações no mapa para redesenhar o organograma que
   * já existe é trabalho manual sobre uma decisão que já foi tomada.
   *
   * Relações que já existem são preservadas: reexecutar não apaga o que um
   * humano criou nem duplica o que já está lá.
   */
  const generateStructuralLinks = async (base?: InternalLinkGraphWorkingCopy): Promise<InternalLinkGraphWorkingCopy | null> => {
    const copia = base || linksWorkingCopy;
    if (!copia) {
      showNotification("error", "Abra a working copy antes de gerar as conexões.");
      return null;
    }
    const unidades = copia.nodes.map(node => ({
      nodeId: node.nodeId,
      nodeType: node.nodeType as "SILO_PAGE" | "ARTICLE_DNA",
      architecturalRole: node.architecturalRole,
      label: node.snapshot.label || node.nodeId,
    }));
    const impedimentos = structuralLinkBlockers(unidades);
    if (impedimentos.length) {
      showNotification("error", impedimentos.join(" "));
      return null;
    }

    try {
      const actorId = linksAuthenticatedActor();
      const existentes = new Set(copia.edges.map(edge => `${edge.sourceNodeId}->${edge.targetNodeId}`));
      const novas = buildStructuralLinkConnections(unidades)
        .filter(conexao => !existentes.has(`${conexao.sourceNodeId}->${conexao.targetNodeId}`))
        .map(conexao => {
          const destino = linkNodeById.get(conexao.targetNodeId);
          const anchorConcepts = destino ? suggestedAnchorConceptsForTarget(destino) : [];
          if (!anchorConcepts.length) return null;
          return InternalLinkGraphEdgeSchema.parse({
            edgeId: `edge:${crypto.randomUUID()}`,
            sourceNodeId: conexao.sourceNodeId,
            targetNodeId: conexao.targetNodeId,
            relationType: conexao.relationType,
            reason: conexao.reason,
            priority: conexao.priority,
            // Ponto de partida determinístico; a IA de âncoras refina depois.
            anchorConcepts,
            origin: "system",
            createdBy: actorId,
            createdAt: new Date().toISOString(),
            provenance: { source: "structural-derivation", references: [copia.graphId] },
          });
        })
        .filter((edge): edge is InternalLinkGraphEdge => Boolean(edge));

      // Esqueleto já inteiro NÃO é falha: quem encadeia segue com a cópia que
      // recebeu, em vez de tratar "nada a fazer" como interrupção.
      if (!novas.length) {
        showNotification("success", "O esqueleto do Silo já está inteiro na working copy.");
        return copia;
      }
      const atualizada = await updateLinksWorkingCopy({ edges: [...copia.edges, ...novas] }, copia);
      showNotification("success", `${novas.length} conexão(ões) estrutural(is) derivada(s). Nada foi persistido ainda: salve a working copy.`);
      return atualizada;
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível derivar as conexões.");
      return null;
    }
  };

  /**
   * As âncoras semânticas do lote, pela IA já configurada.
   *
   * A rota devolve PROPOSTA: ela não cria aresta, não aprova e não persiste.
   * O que chega aqui substitui os conceitos de partida das arestas que a IA
   * aceitou, e o que ela recusou fica dito — âncora que repete o slug ou não
   * descreve o destino é recusada antes de qualquer humano perder tempo com ela.
   *
   * Zero SERP: quantas vezes e em que parágrafo é pergunta do Radar.
   */
  const generateLinkAnchors = async (base?: InternalLinkGraphWorkingCopy): Promise<InternalLinkGraphWorkingCopy | null> => {
    const copia = base || linksWorkingCopy;
    if (!copia) {
      showNotification("error", "Abra a working copy antes de gerar as âncoras.");
      return null;
    }
    if (!copia.edges.length) {
      showNotification("error", "Gere as conexões estruturais antes de pedir âncoras.");
      return null;
    }
    const siloId = copia.siloId;
    setLinksLoading(true);
    try {
      const units = copia.nodes.map(node => {
        const article = node.articleDnaVersionRef
          ? Object.values(acceptedArticleDnas).find(version => version.versionId === node.articleDnaVersionRef!.versionId)?.payload
          : undefined;
        const siloPage = node.siloPageVersionRef
          ? Object.values(acceptedSiloPages).find(version => version.versionId === node.siloPageVersionRef!.versionId)?.payload
          : undefined;
        const nome = (keywordId: string | null | undefined) => {
          if (!keywordId || !article) return null;
          const snapshot = article.keywordReferences.find(reference => reference.keywordId === keywordId)?.keywordDnaSnapshot;
          const valor = snapshot?.sourceKeywordSnapshot.keyword;
          return typeof valor === "string" && valor.trim() ? valor : null;
        };
        return {
          ref: node.nodeId,
          unitType: node.nodeType as "SILO_PAGE" | "ARTICLE_DNA",
          label: node.snapshot.label || node.nodeId,
          siloId,
          siloLabel: Object.values(acceptedSiloDnas).find(version => version.payload.siloId === siloId)?.payload.name || siloId,
          architecturalRole: node.architecturalRole,
          principal: nome(article?.principalKeywordId) ,
          secondaries: (article?.secondaryKeywordIds || []).map(nome).filter((value): value is string => Boolean(value)).slice(0, 10),
          reinforcements: (article?.narrativeReinforcementIds || []).map(nome).filter((value): value is string => Boolean(value)).slice(0, 10),
          entities: (article?.entities || []).slice(0, 10),
          intent: article?.mainIntent || siloPage?.h1 || null,
          slug: article?.suggestedSlug || siloPage?.slug || null,
          narrative: article?.promise || siloPage?.intro || null,
          published: Boolean(article?.publishedIdentityRef) || siloPage?.publicationStatus === "published",
        };
      });
      const candidates = copia.edges.map(edge => ({
        sourceRef: edge.sourceNodeId,
        targetRef: edge.targetNodeId,
        relationType: edge.relationType,
        structuralReason: edge.reason,
      }));
      const resposta = await callStrategicApi<{
        proposals: { sourceRef: string; targetRef: string; anchorConcepts: { text: string }[] }[];
        rejected: { sourceRef: string; targetRef: string; anchor: string; code: string }[];
        summary: string;
      }>("/api/arquiteto/internal-link-graph/anchors", {
        brandId: selectedBrandId,
        siloId,
        units,
        candidates,
      });
      // O conceito chega como OBJETO — texto, relação semântica e motivo. A
      // aresta guarda só o texto: atribuir o objeto inteiro fazia o contrato do
      // grafo recusar a working copy inteira, e a recusa acontecia depois da IA
      // ter respondido, ou seja, com a proposta boa já em mãos.
      const porPar = new Map(resposta.proposals.map(item => [
        `${item.sourceRef}->${item.targetRef}`,
        item.anchorConcepts.map(conceito => conceito.text).filter(Boolean),
      ]));
      const atualizadas = copia.edges.map(edge => {
        const conceitos = porPar.get(`${edge.sourceNodeId}->${edge.targetNodeId}`);
        return conceitos?.length
          ? { ...edge, anchorConcepts: conceitos, origin: "ai" as const, provenance: { source: "link-anchor-ai", references: [copia.graphId] } }
          : edge;
      });
      /*
       * A proposta é PERSISTIDA na working copy, e a partir do valor que
       * acabou de ser calculado — não do estado da aba.
       *
       * A chamada demora quase um minuto; confiar que o estado de React
       * atravesse essa espera e chegue inteiro ao clique seguinte fez as
       * âncoras sumirem entre "proposta pronta" e "working copy salva".
       * Persistir aqui não aprova nada: o grafo aprovado é outro artefato,
       * com portão próprio.
       */
      const proximo = await updateInternalLinkGraphWorkingCopy({
        previous: copia,
        changes: { edges: atualizadas },
        actorId: linksAuthenticatedActor(),
      });
      const persistida = { ...proximo, lockVersion: linksPersistedLockVersion ?? copia.lockVersion };
      await persistLinksWorkingCopy(persistida, "edit");
      const aceitas = resposta.proposals.length;
      const recusadas = resposta.rejected.length;
      showNotification("success", `${aceitas} conexão(ões) com âncoras da IA · ${recusadas} devolvida(s) para revisão humana. A proposta é revisável: nada foi aprovado.`);
      return persistida;
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível gerar o mapa de âncoras.");
      return null;
    } finally {
      setLinksLoading(false);
    }
  };

  const handleDeleteLinkEdge = async () => {
    if (!linksSelectedEdgeId || !linksWorkingCopy) return;
    await updateLinksWorkingCopy({ edges: linksWorkingCopy.edges.filter(edge => edge.edgeId !== linksSelectedEdgeId) });
    setLinksSelectedEdgeId(null);
  };
  const serpConflictCount = serpAssessments.reduce((total, assessment) => total + assessment.conflicts.length, 0);
  const serpProcessing = Object.values(serpExecution).filter(execution => execution.status === "processing");
  const serpProgress = serpProcessing.length ? `${serpProcessing.reduce((total, execution) => total + execution.completed, 0)}/${serpProcessing.reduce((total, execution) => total + execution.queryCount, 0)}` : undefined;
  const scopedArticles = useMemo(() => articlesList.filter(article => selectedArticleIds.has(article.id)), [articlesList, selectedArticleIds]);
  const currentArticleEntityIds = useMemo(() => [...new Set(scopedArticles
    .map(article => articleEntityIdFor(article))
    .filter((id): id is string => Boolean(id)))], [scopedArticles]);
  const currentArticleSerpAssessments = useMemo(() => currentArticleEntityIds
    .map(articleId => latestSerpAssessmentFor(articleId))
    .filter((assessment): assessment is SerpFormationAssessment => Boolean(assessment)), [currentArticleEntityIds, selectedBrandId, serpAssessments]);
  const currentArticleSerpIncompleteCount = currentArticleSerpAssessments.filter(assessment => !isSerpAssessmentComplete({
    queryCount: assessment.queryCount,
    queriedKeywordDnaIds: assessedKeywordDnaIds(assessment),
    snapshotCount: assessment.snapshots.length,
    recommendationCount: assessment.recommendations.length,
    unassociatedRecommendationCount: unassociatedSerpRecommendations(assessment).length,
  })).length + Math.max(currentArticleEntityIds.length - currentArticleSerpAssessments.length, 0);
  const currentArticleDnaCount = currentArticleEntityIds.filter(articleId => Boolean(acceptedArticleDnas[articleId])).length;
  const currentApprovedArticleDnaCount = currentArticleEntityIds.filter(articleId => {
    const version = acceptedArticleDnas[articleId];
    return Boolean(version && effectiveVersionStatus(version.versionId, versionEvents) === "approved");
  }).length;
  const scopedArticleProcessModels = useMemo(
    () => scopedArticles.map(articleProcessReadModelFor),
    [articleProcessReadModelFor, scopedArticles],
  );
  const currentPendingAiReviewCount = scopedArticleProcessModels.reduce((count, model) => count + model.review.pendingCount, 0);
  const articlePhaseProcessStates = useMemo(() => {
    if (scopedArticleProcessModels.length) return aggregateArticleProcessReadModels(scopedArticleProcessModels);
    return resolveArticlePhaseProcessStates({
      hasArticleInput: masterList.length > 0,
      logicProcessing: Boolean(activeLogicalTask),
      hasLogicalOutput: provisionalGroups.length > 0,
      serpProcessing: serpBusy,
      hasSerpAssessments: currentArticleSerpAssessments.length > 0,
      serpHasIncompleteAssessment: currentArticleSerpIncompleteCount > 0,
      serpHasError: currentArticleEntityIds.some(articleId => serpExecution[articleId]?.status === "error"),
      aiProcessing: Boolean(activeKeywordReviewTask),
      aiHasOutput: false,
      reviewProcessing: Boolean(activeArticleDnaTask),
      hasArticleDna: currentArticleEntityIds.length > 0 && currentArticleDnaCount === currentArticleEntityIds.length,
      allArticleDnaApproved: currentArticleEntityIds.length > 0 && currentApprovedArticleDnaCount === currentArticleEntityIds.length,
      pendingAiReview: false,
      unresolvedConflicts: deterministicConflicts.length + currentArticleSerpAssessments.reduce((count, assessment) => count + assessment.conflicts.length, 0),
    });
  }, [
    activeArticleDnaTask,
    activeKeywordReviewTask,
    activeLogicalTask,
    currentArticleDnaCount,
    currentArticleEntityIds,
    currentArticleSerpAssessments,
    currentArticleSerpIncompleteCount,
    currentApprovedArticleDnaCount,
    deterministicConflicts,
    masterList.length,
    provisionalGroups.length,
    scopedArticleProcessModels,
    serpBusy,
    serpExecution,
  ]);

  /**
   * Paisagem territorial da aba Silos. Fonte única: territórios remotos +
   * membership do item de workflow da keyword. Não depende de ArticleDNA.
   */
  const territorialSurface = useMemo(() => {
    const payloads = new Map<string, unknown>(masterList.map(item => [String(item.id), item]));
    const { assignments } = territorialAssignmentsFromWorkflowPayloads({ brandId: selectedBrandId || "", payloads });
    const landscape = buildTerritorialLandscape({
      brandId: selectedBrandId || "",
      keywords: masterList as Array<{ id: string }>,
      territories: remoteTerritories.map(item => item.territory),
      assignments,
      siloDnas: Object.values(acceptedSiloDnas),
      siloPages: Object.values(acceptedSiloPages),
      // `marcas.silos_existentes` é registro remoto da Marca, escrito pela
      // criação manual de Silo. Sem ele, um Silo criado à mão sumia da aba.
      brandRegistrySilos: brandSiloCatalog,
      // Site/Sitemap entra como evidência publicada, nunca como Silo.
      siteStructures: siteStructureReading.structures,
    });
    // A primeira leitura é do LOTE inteiro: narrativas antes de destinos.
    const universe = keywordUniverse;
    const logic = deriveTerritorialLogic({ landscape, keywords: masterList as Array<{ id: string }>, universe });
    return { landscape, logic, universe, surface: buildTerritorialSurface({ landscape, logic }) };
  }, [masterList, remoteTerritories, selectedBrandId, acceptedSiloDnas, acceptedSiloPages, brandSiloCatalog, keywordUniverse, siteStructureReading]);

  /**
   * Visão Sitemap da aba Silos. Lê só o snapshot remoto já carregado — a mesma
   * fonte da visão Arquitetura, com outra pergunta. A busca da área filtra
   * aqui também, para a mesa continuar sendo uma só.
   */
  const sitemapView = useMemo(() => {
    const view = buildSitemapView({
      catalog: (brandSiteSnapshot?.catalog || []) as never,
      structures: territorialSurface.landscape.observedSiteStructures,
      territories: [...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories]
        .map(territory => ({
          territoryRef: territory.territoryRef,
          name: territory.name,
          centralEntity: territory.centralEntity,
          lifecycleStatus: territory.lifecycleStatus,
        })),
      existingStructures: territorialSurface.landscape.existingStructures
        .map(structure => ({ siloId: structure.siloId, name: structure.name || structure.siloId })),
    });
    const search = searchQuery.trim().toLowerCase();
    if (!search) return view;
    const rows = view.rows.filter(row =>
      row.path.toLowerCase().includes(search)
      || row.label.toLowerCase().includes(search)
      || (row.relation.label || "").toLowerCase().includes(search));
    return { ...view, rows };
  }, [brandSiteSnapshot, territorialSurface, searchQuery]);

  const articlePipeline = useMemo(() => {
    const territoryNames = new Map<string, string>();
    territorialSurface.landscape.candidateTerritories.forEach(territory => {
      territoryNames.set(territory.territoryRef, territory.name || territory.centralEntity || "Silo sem nome");
    });
    territorialSurface.landscape.confirmedTerritories.forEach(territory => {
      territoryNames.set(territory.territoryRef, territory.name || territory.centralEntity || "Silo sem nome");
    });
    return buildArticlePipelineRows({
      keywords: masterList.map(keyword => ({
        id: keyword.id,
        keyword: keyword.keyword,
        siloId: keyword.siloId,
        siloName: keyword.siloName,
        territoryRef: typeof keyword.territoryRef === "string" ? keyword.territoryRef : null,
        isPublished: Boolean(keyword.isPublished),
      })),
      confirmedTerritoryRefs,
      reservedHeadKeywordIds: reservedSiloHeadIds,
      // Quem já está numa linha de artigo não aparece de novo como pendente.
      keywordIdsInArticles: new Set(articlesList.flatMap(article => [
        ...(article.mainKeywordObj ? [String(article.mainKeywordObj.id)] : []),
        ...article.supportKeywords.map(keyword => String(keyword.id)),
      ])),
      territoryNames,
    });
  }, [masterList, confirmedTerritoryRefs, reservedSiloHeadIds, territorialSurface, articlesList]);

  /**
   * A mesma busca da área alcança a keyword bloqueada. Depender de artigo
   * formado faria a keyword sumir da busca justamente enquanto ela espera
   * decisão — que é quando o usuário mais precisa achá-la.
   */
  const visiblePipelineRows = useMemo(() => {
    // Elegível não é mais sinônimo de artigo: a keyword só vira linha de
    // artigo depois que a formação a agrupou. Esconder as elegíveis aqui
    // faria a keyword desaparecer da mesa justamente enquanto ela espera o
    // processamento. Quem já entrou num artigo é removido na origem, por
    // `keywordIdsInArticles` — não por estado.
    const pendentes = articlePipeline.rows;
    const search = searchQuery.trim().toLowerCase();
    if (!search) return pendentes;
    return pendentes.filter(row =>
      row.keyword.toLowerCase().includes(search)
      || (row.siloName || "").toLowerCase().includes(search));
  }, [articlePipeline, searchQuery]);

  /**
   * Dúvidas arquiteturais que justificam SERP.
   *
   * `evidence-on-demand`: silo confirmado e sem conflito não entra na lista.
   * Nenhuma consulta é disparada aqui — isto só diz o que PODE ser perguntado.
   */
  const territorialSerpQuestions = useMemo(() => buildTerritorialSerpQuestions({
    territories: [...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories]
      .map(territory => ({
        territoryRef: territory.territoryRef,
        name: territory.name,
        centralEntity: territory.centralEntity,
        lifecycleStatus: territory.lifecycleStatus,
        architecturalOrigin: territory.architecturalOrigin,
        publishedStructureRef: territory.publishedStructureRef ?? null,
        conflicts: territory.conflicts,
      })),
    keywordTexts: new Map(masterList.map(keyword => [String(keyword.id), String(keyword.keyword || "")])),
    heads: (keywordUniverse?.clusters || [])
      .filter(cluster => Boolean(cluster.headKeywordId))
      .map(cluster => ({
        keywordId: String(cluster.headKeywordId),
        keyword: String(masterList.find(item => String(item.id) === String(cluster.headKeywordId))?.keyword || ""),
        ambiguous: cluster.ambiguousHeadKeywordIds.length > 0,
        coherence: cluster.coherence,
      })),
  }), [territorialSurface, masterList, keywordUniverse]);

  /**
   * Fatos arquiteturais que a pergunta estava validando.
   *
   * Entra o que MUDA a pergunta — entidade, intenção, fronteira, página
   * publicada, cabeceira. Não entra seleção visual, zoom nem timestamp: isso
   * invalidaria evidência boa sem motivo.
   */
  const territorialSerpBaseOf = useCallback((question: { kind: string; territoryRef: string | null; comparedTerritoryRef: string | null; queries: { keyword: string }[] }) => {
    const territory = question.territoryRef
      ? remoteTerritories.find(item => item.territoryRef === question.territoryRef)?.territory ?? null
      : null;
    const facts: string[] = [];
    if (territory) {
      facts.push(`entity:${territory.centralEntity}`);
      facts.push(`intent:${territory.macroIntent}`);
      facts.push(`includes:${[...territory.boundary.includes].sort().join("|")}`);
      facts.push(`excludes:${[...territory.boundary.excludes].sort().join("|")}`);
      facts.push(`lifecycle:${territory.lifecycleStatus}`);
      if (territory.slugState.publishedSlug) facts.push(`published:${territory.slugState.publishedSlug}`);
    }
    return buildTerritorialSerpBase({ question: question as never, subjectFacts: facts });
  }, [remoteTerritories]);

  /**
   * Executa a SERP das dúvidas em aberto.
   *
   * Só roda por ação humana. O retorno é evidência: nada de território é
   * escrito, nem quando o parecer sugere usar o silo existente.
   */
  const validateTerritorialSerp = async () => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca ativa."); return; }
    const perguntas = territorialSerpQuestions.slice(0, 10).map(question => ({
      ...question,
      base: territorialSerpBaseOf(question),
    }));
    if (!perguntas.length) {
      showNotification("error", "Nenhuma dúvida arquitetural requer SERP agora.");
      return;
    }
    setTerritorialSerpBusy(true);
    try {
      const response = await fetch("/api/arquiteto/territorial-serp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, questions: perguntas }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.error || "Não foi possível validar a SERP dos silos.");
      const assessments = Array.isArray(body.data?.assessments) ? body.data.assessments : [];
      setTerritorialSerpAssessments(previous => {
        const porPergunta = new Map(previous.map(item => [item.questionId, item]));
        for (const assessment of assessments) porPergunta.set(assessment.questionId, assessment);
        return [...porPergunta.values()];
      });
      // Falha de consulta NÃO apaga parecer válido anterior: só entra hash de
      // quem realmente voltou do readback.
      setTerritorialSerpBaseHashes(previous => {
        const proximo = new Map(previous);
        for (const pergunta of perguntas) {
          if (assessments.some((item: { questionId: string }) => item.questionId === pergunta.questionId)) {
            proximo.set(pergunta.questionId, territorialSerpBaseHash(pergunta.base));
          }
        }
        return proximo;
      });
      const falhas = Array.isArray(body.data?.failures) ? body.data.failures.length : 0;
      showNotification(falhas ? "error" : "success", falhas
        ? `${assessments.length} parecer(es) de SERP · ${falhas} consulta(s) falharam. Nada foi aplicado.`
        : `${assessments.length} parecer(es) de SERP prontos para revisão humana. Nada foi aplicado.`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível validar a SERP dos silos.");
    } finally {
      setTerritorialSerpBusy(false);
    }
  };

  // O handler da SERP nasce depois das dúvidas; o ref o publica em efeito para
  // a topbar não precisar conhecer a ordem de declaração do componente.
  const validateTerritorialSerpRef = useRef(validateTerritorialSerp);

  /**
   * Foco de leitura da projeção Arquitetura.
   *
   * Filtra o que aparece, não o que existe: o patrimônio continua inteiro no
   * read-model, e "Todos" devolve a mesa completa.
   */
  const scopedTerritorialSurface = useMemo(() => {
    if (siloScope === "all") return territorialSurface.surface;
    const siteRefs = new Set(territorialSurface.landscape.observedSiteStructures
      .map(structure => structure.promotedTerritoryRef)
      .filter((ref): ref is string => Boolean(ref)));
    const groups = territorialSurface.surface.groups.filter(group => {
      if (siloScope === "structures") return group.kind === "existing_structures";
      if (siloScope === "unassigned") return group.kind === "unassigned" || group.kind === "ambiguous";
      if (group.kind !== "territories") return false;
      const ref = group.header?.ref || "";
      return siloScope === "site_silos" ? siteRefs.has(ref) : !siteRefs.has(ref);
    });
    return { ...territorialSurface.surface, groups };
  }, [territorialSurface, siloScope]);

  /** Base do que a IA analisou; espelha o que o servidor recebe. */
  const territorialAiBaseHashOf = useCallback((question: { questionId: string; kind: string; territoryRef: string | null }) => {
    const territory = question.territoryRef
      ? remoteTerritories.find(item => item.territoryRef === question.territoryRef)?.territory ?? null
      : null;
    const arquitetura: string[] = [];
    if (territory) {
      arquitetura.push(`silo: ${territory.name || territory.centralEntity}`);
      arquitetura.push(`entidade central: ${territory.centralEntity || "não definida"}`);
      arquitetura.push(`intenção macro: ${territory.macroIntent || "não definida"}`);
      arquitetura.push(`fronteira inclui: ${territory.boundary.includes.join(", ") || "não definida"}`);
      arquitetura.push(`fronteira exclui: ${territory.boundary.excludes.join(", ") || "nenhuma"}`);
      arquitetura.push(`estado: ${territory.lifecycleStatus}`);
    }
    for (const keyword of masterList) {
      if (typeof keyword.territoryRef === "string" && keyword.territoryRef === question.territoryRef) {
        arquitetura.push(`keyword associada: ${keyword.keyword} (${keyword.id})`);
      }
    }
    const logica = territorialSurface.logic.hypotheses
      .filter(hypothesis => !question.territoryRef || hypothesis.targets.some(target => target.territoryRef === question.territoryRef))
      .map(hypothesis => `${hypothesis.keywordId} · ${hypothesis.state}: ${hypothesis.targets.map(target => target.reason).join("; ")}`);
    return territorialAiBaseHash(buildTerritorialAiBase({
      questionId: question.questionId,
      kind: question.kind,
      architectureFacts: arquitetura,
      logicFacts: logica,
      serpBaseHash: territorialSerpBaseHashes.get(question.questionId) ?? null,
    }));
  }, [remoteTerritories, masterList, territorialSurface, territorialSerpBaseHashes]);

  /**
   * Disponibilidade da IA POR DÚVIDA, não por gate global.
   *
   * Uma pergunta com SERP desatualizada não pode travar as outras: cada caso
   * responde por si, e o Workbench soma os estados.
   */
  const territorialAiAvailability = useMemo(() => {
    const porPergunta = territorialSerpQuestions.map(question => {
      const gravado = territorialSerpBaseHashes.get(question.questionId) ?? null;
      const atual = territorialSerpBaseHash(territorialSerpBaseOf(question));
      // Toda pergunta que o motor levantou exige SERP; a exceção é a dúvida que
      // nunca entrou na lista — essa nem chega aqui.
      return {
        question,
        ...territorialAiAvailabilityOf({
          questionId: question.questionId,
          serpRequired: true,
          serpAssessmentBaseHash: gravado,
          currentSerpBaseHash: atual,
        }),
      };
    });
    return {
      items: porPergunta,
      ready: porPergunta.filter(item => item.availability === "ready"),
      awaiting: porPergunta.filter(item => item.availability !== "ready"),
    };
  }, [territorialSerpQuestions, territorialSerpBaseHashes, territorialSerpBaseOf]);

  /**
   * Revisar com IA — proposta reversível, nunca aplicação.
   *
   * Roda só por ação humana e só nas dúvidas com evidência vigente. Nada de
   * território é escrito: a única autoridade nova é a própria proposta.
   */
  const reviewTerritorialWithAi = async () => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca ativa."); return; }
    const prontas = territorialAiAvailability.ready.slice(0, 6);
    if (!prontas.length) {
      showNotification("error", territorialAiAvailability.awaiting[0]?.reason || "Nenhuma dúvida está pronta para revisão com IA.");
      return;
    }

    setTerritorialAiBusy(true);
    try {
      const questions = prontas.map(({ question }) => {
        const territory = question.territoryRef
          ? remoteTerritories.find(item => item.territoryRef === question.territoryRef)?.territory ?? null
          : null;
        const parecer = territorialSerpAssessments.find(item => item.questionId === question.questionId) ?? null;
        const publicado: string[] = [];
        if (territory?.slugState.publishedSlug) publicado.push(`slug publicado: ${territory.slugState.publishedSlug}`);
        if (territory?.slugState.publishedCanonical) publicado.push(`canonical publicado: ${territory.slugState.publishedCanonical}`);
        const arquitetura: string[] = [];
        if (territory) {
          arquitetura.push(`silo: ${territory.name || territory.centralEntity}`);
          arquitetura.push(`entidade central: ${territory.centralEntity || "não definida"}`);
          arquitetura.push(`intenção macro: ${territory.macroIntent || "não definida"}`);
          arquitetura.push(`fronteira inclui: ${territory.boundary.includes.join(", ") || "não definida"}`);
          arquitetura.push(`fronteira exclui: ${territory.boundary.excludes.join(", ") || "nenhuma"}`);
          arquitetura.push(`estado: ${territory.lifecycleStatus}`);
        }
        for (const keyword of masterList) {
          if (typeof keyword.territoryRef === "string" && keyword.territoryRef === question.territoryRef) {
            arquitetura.push(`keyword associada: ${keyword.keyword} (${keyword.id})`);
          }
        }
        const logica = territorialSurface.logic.hypotheses
          .filter(hypothesis => !question.territoryRef || hypothesis.targets.some(target => target.territoryRef === question.territoryRef))
          .map(hypothesis => `${hypothesis.keywordId} · ${hypothesis.state}: ${hypothesis.targets.map(target => target.reason).join("; ")}`);
        return {
          questionId: question.questionId,
          kind: question.kind,
          reason: question.reason,
          architectureFacts: arquitetura,
          logicFacts: logica,
          knownTargetRefs: remoteTerritories.map(item => item.territoryRef),
          knownKeywordIds: masterList.map(keyword => String(keyword.id)),
          publishedIdentity: publicado,
          serpRef: parecer
            ? {
              questionId: parecer.questionId,
              assessmentBaseHash: territorialSerpBaseHashes.get(parecer.questionId) || "desconhecido",
              recommendation: parecer.recommendation,
              snapshotIds: parecer.snapshotIds,
            }
            : null,
          serpFacts: parecer
            ? [`recomendação: ${parecer.recommendation}`, `compatibilidade: ${parecer.compatibility}`,
              `intenção observada: ${parecer.observedIntent || "indefinida"}`, `tipo dominante: ${parecer.dominantType || "indefinido"}`,
              `amplitude: ${parecer.breadth}`, `sobreposição: ${parecer.overlap ?? "sem comparação"}`, parecer.reason]
            : [],
        };
      });

      const response = await fetch("/api/arquiteto/territorial-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: selectedBrandId,
          brand: {
            name: brandContext?.name || "Marca",
            niche: brandContext?.niche ?? null,
            positioning: null,
          },
          questions,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.error || "Não foi possível revisar os silos com IA.");
      const propostas = Array.isArray(body.data?.proposals) ? body.data.proposals : [];
      setTerritorialAiProposals(previous => {
        const porPergunta = new Map(previous.map(item => [item.questionId, item]));
        for (const proposal of propostas) porPergunta.set(proposal.questionId, proposal);
        return [...porPergunta.values()];
      });
      setTerritorialAiBaseHashes(previous => {
        const proximo = new Map(previous);
        for (const { question } of prontas) {
          if (propostas.some((item: { questionId: string }) => item.questionId === question.questionId)) {
            proximo.set(question.questionId, territorialAiBaseHashOf(question));
          }
        }
        return proximo;
      });
      const falhas = Array.isArray(body.data?.failures) ? body.data.failures.length : 0;
      showNotification(falhas ? "error" : "success", falhas
        ? `${propostas.length} proposta(s) de IA · ${falhas} dúvida(s) falharam. Nada foi aplicado.`
        : `${propostas.length} proposta(s) de IA prontas para revisão humana. Nada foi aplicado.`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível revisar os silos com IA.");
    } finally {
      setTerritorialAiBusy(false);
    }
  };

  const reviewTerritorialWithAiRef = useRef(reviewTerritorialWithAi);
  useEffect(() => {
    validateTerritorialSerpRef.current = validateTerritorialSerp;
    reviewTerritorialWithAiRef.current = reviewTerritorialWithAi;
    siloHandlersRef.current.validateTerritorialSerp = () => validateTerritorialSerpRef.current();
    siloHandlersRef.current.reviewTerritorialWithAi = () => reviewTerritorialWithAiRef.current();
  });

  const territorialAvailability = useMemo(() => deriveTerritorialProcessAvailability({
    surface: territorialSurface.surface, landscape: territorialSurface.landscape,
  }), [territorialSurface]);

  /**
   * Usar uma página publicada observada como Silo.
   *
   * Cria SÓ o candidato, adotando a identidade publicada como protegida: nenhum
   * SiloDNA, nenhuma SiloPage, nenhuma URL nova, nenhum slug novo. Sucesso só
   * depois do readback canônico.
   */
  const promoteSiteStructureToSilo = async (normalizedUrl: string) => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca ativa."); return; }
    // Trava SÍNCRONA por página. `ALREADY_PROMOTED` lê `remoteTerritories`, que
    // só muda quando a primeira gravação volta: sem esta trava, dois cliques
    // seguidos passam os dois pelo guard e nascem dois silos para a MESMA
    // página publicada. O estado de UI sozinho chega tarde demais.
    if (siteStructurePromotionsInFlight.current.has(normalizedUrl)) return;
    siteStructurePromotionsInFlight.current.add(normalizedUrl);
    try {
      await runSiteStructurePromotion(normalizedUrl);
    } finally {
      siteStructurePromotionsInFlight.current.delete(normalizedUrl);
    }
  };

  const runSiteStructurePromotion = async (normalizedUrl: string) => {
    const structure = territorialSurface.landscape.observedSiteStructures.find(item => item.normalizedUrl === normalizedUrl);
    const catalogEntry = brandSiteSnapshot?.catalog.find(item => item.normalizedUrl === normalizedUrl) as { id?: string; lastVerifiedAt?: string | null } | undefined;
    if (!structure || !catalogEntry?.id) {
      showNotification("error", "A página não está no catálogo remoto; sincronize o sitemap novamente.");
      return;
    }

    const plan = planSiteStructurePromotion({
      structure: {
        normalizedUrl: structure.normalizedUrl,
        url: structure.url,
        path: structure.path,
        label: structure.label,
        canonical: structure.canonical,
        canonicalVerified: structure.canonicalVerified,
        isPublished: structure.isPublished,
        catalogEntryId: String(catalogEntry.id),
        observedAt: catalogEntry.lastVerifiedAt ?? null,
        reconciledSiloId: structure.reconciledSiloId,
      },
      existingTerritories: remoteTerritories.map(item => item.territory),
      reason: "Decisão humana: usar a página publicada como silo.",
    });
    if (!plan.ok) {
      showNotification("error", plan.refusals.map(refusal => refusal.detail).join(" ") || "Promoção recusada.");
      return;
    }

    setSiteStructureBusyUrl(normalizedUrl);
    try {
      const created = await createRemoteSiloCandidate({ brandId: selectedBrandId, draft: plan.draft });
      showNotification("success", `"${structure.label}" passou a ser silo candidato, com a página publicada preservada.`);
      setRemoteTerritories(previous => [...previous.filter(item => item.territoryRef !== created.territoryRef), created]);
      setCanonicalWorkspaceReload(current => current + 1);
    } catch (error) {
      const failure = error as { message?: unknown } | null;
      showNotification("error", typeof failure?.message === "string" ? failure.message : "Não foi possível usar a página como silo.");
    } finally {
      setSiteStructureBusyUrl(null);
    }
  };

  /**
   * Abre a definição de contexto do Silo com o que JÁ existe no remoto.
   *
   * O rascunho parte do estado vigente e nunca de um chute: campo vazio no
   * remoto continua vazio na tela, e o bloqueio correspondente segue visível.
   */
  const openSiloContextEditor = (territoryRef: string) => {
    const remote = remoteTerritories.find(item => item.territoryRef === territoryRef);
    if (!remote) { showNotification("error", "Silo não está no snapshot remoto; recarregue o workspace."); return; }
    const territory = remote.territory as unknown as Record<string, unknown>;
    const boundary = (territory.boundary || {}) as { includes?: string[]; excludes?: string[] };
    const narrative = (territory.narrative || {}) as Record<string, unknown>;
    setSiloContextDraft({
      name: String(territory.name || ""),
      centralEntity: String(territory.centralEntity || ""),
      macroIntent: String(territory.macroIntent || ""),
      includes: (boundary.includes || []).join(", "),
      excludes: (boundary.excludes || []).join(", "),
      statement: typeof narrative.statement === "string" ? narrative.statement : "",
      continuity: narrative.continuity === "unknown" || !narrative.continuity ? "coherent" : String(narrative.continuity),
      brandAlignment: narrative.brandAlignment === "unknown" || !narrative.brandAlignment ? "aligned" : String(narrative.brandAlignment),
    });
    setSiloContextRef(territoryRef);
  };

  /** Grava o contexto pelo PATCH canônico, com lock e readback. */
  const saveSiloContext = async () => {
    if (!selectedBrandId || !siloContextRef) return;
    const remote = remoteTerritories.find(item => item.territoryRef === siloContextRef);
    if (!remote) { showNotification("error", "Silo não está no snapshot remoto; recarregue o workspace."); return; }
    const listaDe = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

    setSiloContextSaving(true);
    try {
      const updated = await updateRemoteTerritoryContext({
        brandId: selectedBrandId,
        territoryRef: siloContextRef,
        expectedLock: remote.lockVersion,
        territory: remote.territory as unknown as Record<string, unknown>,
        context: {
          name: siloContextDraft.name.trim() || String(remote.territory.name || ""),
          centralEntity: siloContextDraft.centralEntity.trim(),
          macroIntent: siloContextDraft.macroIntent.trim(),
          includes: listaDe(siloContextDraft.includes),
          excludes: listaDe(siloContextDraft.excludes),
          statement: siloContextDraft.statement.trim() || null,
          continuity: siloContextDraft.continuity as "coherent" | "partial" | "fragmented" | "unknown",
          brandAlignment: siloContextDraft.brandAlignment as "aligned" | "adjacent" | "off_strategy" | "unknown",
        },
      });
      showNotification("success", "Contexto do silo registrado.");
      setRemoteTerritories(previous => [...previous.filter(item => item.territoryRef !== siloContextRef), updated]);
      setSiloContextRef(null);
      setCanonicalWorkspaceReload(current => current + 1);
    } catch (error) {
      const failure = error as { message?: unknown; code?: unknown } | null;
      const message = typeof failure?.message === "string" ? failure.message : "Não foi possível registrar o contexto.";
      showNotification("error", /lock|conflit/i.test(String(failure?.code ?? message))
        ? "O estado vigente mudou desde a leitura; recarregando sem sobrescrever."
        : message);
      setCanonicalWorkspaceReload(current => current + 1);
    } finally {
      setSiloContextSaving(false);
    }
  };

  /**
   * Confirmar Silo — o universo passa a poder receber Articles.
   *
   * Não consolida nada: SiloDNA, SiloPage e Pilar dependem da formação dos
   * Articles e vêm depois. A prontidão é avaliada por silo, não pela aba.
   */
  const confirmSiloCandidate = async (territoryRef: string) => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca ativa."); return; }
    const remote = remoteTerritories.find(item => item.territoryRef === territoryRef);
    if (!remote) { showNotification("error", "Silo não está no snapshot remoto; recarregue o workspace."); return; }

    setSiloConfirmBusyRef(territoryRef);
    try {
      const updated = await confirmRemoteSiloCandidate({
        brandId: selectedBrandId,
        territoryRef,
        expectedLock: remote.lockVersion,
        territory: remote.territory as unknown as Record<string, unknown>,
      });
      showNotification("success", `Silo "${remote.territory.name || territoryRef}" confirmado e pronto para a fase de Artigos.`);
      setRemoteTerritories(previous => [...previous.filter(item => item.territoryRef !== territoryRef), updated]);
      setCanonicalWorkspaceReload(current => current + 1);
    } catch (error) {
      const failure = error as { message?: unknown; code?: unknown } | null;
      const bruto = typeof failure?.message === "string" ? failure.message : "";
      const nome = remote.territory.name || remote.territory.centralEntity || "O silo";
      // O identificador técnico não é linguagem de tela: quem falha é o Silo,
      // e é pelo nome dele que a pessoa reconhece o caso. O ref fica no log.
      const legivel = bruto.replace(/territory:[0-9a-f-]{36}/gi, nome).trim();
      showNotification("error", /lock|conflit/i.test(String(failure?.code ?? bruto))
        ? `${nome}: o estado vigente mudou desde a leitura; recarregando sem sobrescrever.`
        : legivel || `${nome} não pôde ser confirmado.`);
      setCanonicalWorkspaceReload(current => current + 1);
    } finally {
      setSiloConfirmBusyRef(null);
    }
  };

  /**
   * Decisão humana de Silo para uma keyword.
   *
   * Caso A: o registro interno já existe → grava a membership direto.
   * Caso B: só existe a estrutura → ancora primeiro (o SERVIDOR emite o
   * identificador) e só então associa. Sucesso só é anunciado depois do
   * readback canônico confirmar o destino.
   */
  const applySiloDecision = async (
    keywordId: string,
    target: { kind: "territory"; territoryRef: string } | { kind: "existing_structure"; siloId: string } | { kind: "unassigned" },
  ) => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca ativa."); return; }
    const item = masterList.find(entry => String(entry.id) === keywordId) as Record<string, unknown> | undefined;
    const workflow = item?.canonicalWorkflow as { id?: unknown; lockVersion?: unknown } | undefined;
    if (!workflow?.id || !Number.isInteger(workflow.lockVersion)) {
      showNotification("error", "Esta keyword não tem item de workflow canônico; recarregue o workspace.");
      return;
    }
    const reason = target.kind === "unassigned"
      ? "Decisão humana: manter a keyword sem silo."
      : "Decisão humana de silo na aba Silos.";
    const plan = planSiloAssignment({
      brandId: selectedBrandId,
      landscape: territorialSurface.landscape,
      keyword: {
        keywordId,
        brandId: String(item?.brand_id || selectedBrandId),
        workflowItemId: String(workflow.id),
        expectedLock: Number(workflow.lockVersion),
        currentTerritoryRef: typeof item?.territoryRef === "string" ? item.territoryRef : null,
        isPublished: Boolean(item?.isPublished),
      },
      target,
      reason,
      decidedAt: new Date().toISOString(),
    });
    if (!plan.ok) {
      showNotification("error", plan.refusals.map(refusal => refusal.detail).join(" ") || "Decisão de silo recusada.");
      return;
    }

    setSiloDecisionBusyKeywordId(keywordId);
    try {
      let anchoredTerritoryRef: string | null = null;
      for (const step of plan.steps) {
        if (step.kind !== "anchor_structure") continue;
        const created = await anchorRemoteTerritoryForSilo({ brandId: selectedBrandId, draft: step.draft });
        anchoredTerritoryRef = created.territoryRef;
      }
      for (const step of plan.steps) {
        if (step.kind !== "assign_keyword") continue;
        const territoryRef = step.territoryRefFromAnchor ? anchoredTerritoryRef : step.territoryRef;
        if (step.territoryRefFromAnchor && !territoryRef) {
          throw new Error("O silo não confirmou identidade no readback; a associação não foi aplicada.");
        }
        await persistArchitectWorkingCopy({
          brandId: selectedBrandId,
          updates: [{
            workflowItemId: step.workflowItemId,
            expectedLock: step.expectedLock,
            assignment: { territoryRef, territoryAssignment: step.decision },
          }],
        });
      }

      // Readback canônico: a Surface só muda depois que o remoto confirma.
      const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
      const readback = new Map<string, string | null>();
      for (const entry of buildCanonicalWorkflowWorkspaceItems(canonical.workflowItems, canonical.keywords, selectedBrandId)) {
        const value = (entry as Record<string, unknown>).territoryRef;
        readback.set(String((entry as Record<string, unknown>).id), typeof value === "string" ? value : null);
      }
      const outcome = resolveSiloAssignmentOutcome({
        steps: plan.steps,
        readbackTerritoryRefByKeyword: readback,
        anchoredTerritoryRef,
      });
      if (outcome.outcome !== "applied") {
        showNotification("error", `A decisão de silo ficou ${outcome.outcome === "partial" ? "parcial" : "sem efeito"}: o readback não confirmou ${outcome.pending.length} keyword(s).`);
      } else {
        showNotification("success", target.kind === "unassigned"
          ? "Keyword mantida sem silo por decisão humana, confirmada no readback."
          : "Keyword associada ao silo e confirmada no readback.");
      }
      setCanonicalWorkspaceReload(current => current + 1);
    } catch (error) {
      // Lock stale: recusar e recarregar o estado vigente, nunca sobrescrever.
      const failure = error as { message?: unknown; code?: unknown } | null;
      const message = typeof failure?.message === "string" ? failure.message : "Não foi possível aplicar a decisão de silo.";
      showNotification("error", /lock|conflit/i.test(String(failure?.code ?? message))
        ? "O estado vigente mudou desde a leitura; recarregando sem sobrescrever."
        : message);
      setCanonicalWorkspaceReload(current => current + 1);
    } finally {
      setSiloDecisionBusyKeywordId(null);
    }
  };


  /**
   * Leituras comparativas da Revisão, uma por silo candidato/confirmado.
   *
   * Recalculada das fontes remotas — membership, contexto, confirmação, parecer
   * de SERP e proposta de IA. É por isso que sobrevive ao F5 sem record próprio.
   */
  const territorialReviewViews = useMemo(() => {
    const silos = [...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories];
    return silos.map(territory => {
      const pergunta = territorialSerpQuestions.find(item => item.territoryRef === territory.territoryRef) ?? null;
      const parecer = pergunta ? territorialSerpAssessments.find(item => item.questionId === pergunta.questionId) ?? null : null;
      const proposta = pergunta ? territorialAiProposals.find(item => item.questionId === pergunta.questionId) ?? null : null;
      const serpHashGravado = pergunta ? territorialSerpBaseHashes.get(pergunta.questionId) ?? null : null;
      const serpVigente = Boolean(pergunta && parecer && serpHashGravado === territorialSerpBaseHash(territorialSerpBaseOf(pergunta)));
      const aiHashGravado = pergunta ? territorialAiBaseHashes.get(pergunta.questionId) ?? null : null;
      const aiVigente = Boolean(pergunta && proposta && aiHashGravado === territorialAiBaseHashOf(pergunta));

      const hipotese = territorialSurface.logic.hypotheses
        .find(item => item.targets.some(target => target.territoryRef === territory.territoryRef)) ?? null;
      // Sugestão vira ação: keyword sem silo que a Lógica aponta para este.
      const sugeridas = territorialSurface.logic.hypotheses
        .filter(item => item.targets.some(target => target.territoryRef === territory.territoryRef))
        .map(item => masterList.find(kw => String(kw.id) === item.keywordId))
        .filter((kw): kw is (typeof masterList)[number] => Boolean(kw))
        .filter(kw => (typeof kw.territoryRef === "string" ? kw.territoryRef : null) !== territory.territoryRef)
        .map(kw => ({
          keywordId: String(kw.id),
          keyword: String(kw.keyword || ""),
          territoryRef: typeof kw.territoryRef === "string" ? kw.territoryRef : null,
          decision: null,
        }));

      const readiness = resolveTerritoryConfirmationReadiness({
        territory, report: territorialSurface.landscape.consistency,
      });

      return buildTerritorialReviewView({
        territory: {
          territoryRef: territory.territoryRef,
          name: territory.name,
          centralEntity: territory.centralEntity,
          lifecycleStatus: territory.lifecycleStatus,
          isPublished: territory.publicationProtection === "protected",
          slug: territory.slugState.publishedSlug || territory.slugState.confirmed,
          canonical: territory.slugState.publishedCanonical,
          confirmationBlockers: readiness.blockers.map(blocker => blocker.detail || blocker.code),
          confirmationReady: readiness.state === "ready",
        },
        keywords: masterList
          .filter(kw => (typeof kw.territoryRef === "string" ? kw.territoryRef : null) === territory.territoryRef)
          .map(kw => ({
            keywordId: String(kw.id),
            keyword: String(kw.keyword || ""),
            territoryRef: territory.territoryRef,
            decision: kw.territoryAssignment
              ? {
                source: String((kw.territoryAssignment as { source?: unknown }).source || "system"),
                reason: String((kw.territoryAssignment as { reason?: unknown }).reason || ""),
                decidedAt: String((kw.territoryAssignment as { decidedAt?: unknown }).decidedAt || ""),
              }
              : null,
          })),
        suggestedKeywords: sugeridas,
        logic: {
          presence: hipotese ? "current" : "not_executed",
          state: hipotese?.state ?? null,
          targetTerritoryRef: territory.territoryRef,
          reason: hipotese?.targets.map(target => target.reason).join("; ") ?? null,
        },
        serp: {
          presence: !pergunta ? "not_required" : !parecer ? "not_executed" : serpVigente ? "current" : "stale",
          assessment: parecer ?? null,
        },
        ai: {
          presence: !pergunta ? "not_required" : !proposta ? "not_executed" : aiVigente ? "current" : "stale",
          proposal: proposta ?? null,
        },
      });
    });
  }, [territorialSurface, territorialSerpQuestions, territorialSerpAssessments, territorialAiProposals,
    territorialSerpBaseHashes, territorialAiBaseHashes, territorialSerpBaseOf, territorialAiBaseHashOf, masterList]);

  /**
   * Despacho da decisão humana para os WRITERS CANÔNICOS já existentes.
   *
   * Nenhuma rota de "aplicar revisão": cada ação vira a mesma mutação que a
   * mesa já usa, com lock e readback. "Manter atual" não muda objeto canônico
   * e por isso não grava nada — a Revisão não inventa carimbo sem dono.
   */
  const applyReviewAction = async (action: TerritorialReviewAction) => {
    setReviewBusyAction(action.label);
    try {
      if (action.kind === "assign_keyword" || action.kind === "move_keyword") {
        await applySiloDecision(action.keywordId, { kind: "territory", territoryRef: action.territoryRef });
      } else if (action.kind === "keep_unassigned") {
        await applySiloDecision(action.keywordId, { kind: "unassigned" });
      } else if (action.kind === "update_context") {
        openSiloContextEditor(action.territoryRef);
      } else if (action.kind === "confirm_silo") {
        await confirmSiloCandidate(action.territoryRef);
      } else {
        showNotification("success", "Arquitetura mantida. Nenhuma mudança estrutural foi registrada.");
      }
    } finally {
      setReviewBusyAction(null);
    }
  };

  /**
   * Colunas Processamento/Decisão e o conteúdo da expansão, por silo.
   *
   * Derivado da própria Revisão: a mesa mostra o resumo, o detalhe abre embaixo.
   * Nada é perdido — só sai da linha principal.
   */
  const siloRowProjections = useMemo(() => {
    const processing = new Map<string, ReturnType<typeof territorialProcessCells>>();
    const decision = new Map<string, string>();
    const details = new Map<string, { label: string; value: string }[]>();
    for (const view of territorialReviewViews) {
      processing.set(view.subject.ref, territorialProcessCells(view));
      decision.set(view.subject.ref, territorialHumanDecisionLabel(view));
      const linhas: { label: string; value: string }[] = [];
      const territory = remoteTerritories.find(item => item.territoryRef === view.subject.ref)?.territory ?? null;
      if (territory) {
        linhas.push({ label: "Entidade central", value: territory.centralEntity || "não definida" });
        linhas.push({ label: "Intenção macro", value: territory.macroIntent || "não definida" });
        linhas.push({ label: "Fronteira inclui", value: territory.boundary.includes.join(", ") || "não definida" });
        linhas.push({ label: "Fronteira exclui", value: territory.boundary.excludes.join(", ") || "nenhuma" });
      }
      if (view.logic.reason) linhas.push({ label: "Lógica", value: view.logic.reason });
      if (view.serp.assessment) linhas.push({ label: "SERP", value: view.serp.assessment.reason });
      if (view.ai.proposal) linhas.push({ label: "IA", value: view.ai.proposal.reason });
      if (view.conflicts.length) linhas.push({ label: "Conflitos", value: view.conflicts.join(" ") });
      if (view.current.decision) linhas.push({ label: "Decisão humana", value: `${view.current.decision.reason} (${view.current.decision.decidedAt})` });
      details.set(view.subject.ref, linhas);
    }
    return { processing, decision, details };
  }, [territorialReviewViews, remoteTerritories]);

  /**
   * Análise do lote inteiro — a primeira arquitetura.
   *
   * Lê o universo completo antes de qualquer decisão por keyword: é o que
   * revela cabeceira, cauda e profundidade. Recalculada do read-model, então
   * sobrevive ao F5 sem storage próprio.
   */
  /**
   * A identidade estrutural de cada Silo, para o guarda de duplicata.
   *
   * Só isto: quem aponta para a mesma raiz publicada de um Silo que já tem
   * SiloDNA canônico. Nome parecido não entra — dois Silos podem legitimamente
   * se chamar de forma próxima e cobrir coisas diferentes.
   */
  const territoryIdentities = useMemo(() => remoteTerritories.map(item => ({
    territoryRef: item.territoryRef,
    name: item.territory.name ?? null,
    lifecycleStatus: item.territory.lifecycleStatus,
    publishedStructureRef: item.territory.publishedStructureRef ?? null,
    hasCanonicalSilo: Object.values(acceptedSiloDnas)
      .some(version => version.payload.territoryRef === item.territoryRef),
  })), [remoteTerritories, acceptedSiloDnas]);

  const duplicateTerritories = useMemo(
    () => detectExactPublishedRootDuplicates(territoryIdentities),
    [territoryIdentities],
  );

  /**
   * Cada duplicata com a sua pré-condição resolvida.
   *
   * Marcar como substituído com busca dentro deixaria a keyword presa num
   * Silo que os leitores excluem: some da proposta e não volta a lugar
   * nenhum. Restaurar primeiro, marcar depois.
   */
  const duplicateReadiness = useMemo(() => duplicateTerritories.map(duplicata => {
    const atribuidas = masterList.filter(keyword => keyword.territoryRef === duplicata.duplicateTerritoryRef);
    return {
      duplicata,
      atribuidas: atribuidas.map(keyword => String(keyword.keyword || keyword.id)),
      readiness: resolveSupersedeReadiness({ duplicate: duplicata, assignedKeywordCount: atribuidas.length }),
    };
  }), [duplicateTerritories, masterList]);

  const architectureAnalysis = useMemo(() => buildArchitectureAnalysis({
    universe: keywordUniverse,
    // Duplicata exata não disputa score com o próprio canônico.
    outOfCompetitionTerritoryRefs: territoryRefsOutOfCompetition(territoryIdentities),
    territories: [...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories]
      .map(territory => ({
        territoryRef: territory.territoryRef,
        name: territory.name,
        centralEntity: territory.centralEntity,
        lifecycleStatus: territory.lifecycleStatus,
        slug: territory.slugState.publishedSlug || territory.slugState.confirmed,
        isPublished: territory.publicationProtection === "protected",
      })),
    publishedArchitecture: brandSiteSnapshot?.catalog?.length
      ? buildPublishedSiteArchitecture({ catalog: brandSiteSnapshot.catalog as never })
      : null,
    keywordTexts: new Map(masterList.map(keyword => [String(keyword.id), String(keyword.keyword || "")])),
  }), [keywordUniverse, territorialSurface, brandSiteSnapshot, masterList]);

  /**
   * A arquitetura vigente ainda descreve o lote de agora?
   *
   * Muda quando entram keywords, nascem silos ou o site é ressincronizado —
   * nunca por abrir a página.
   */
  const architectureIsStale = Boolean(architectureMarker) && architectureMarker!.baseHash !== architectureAnalysis.baseHash;

  /**
   * Itens canônicos das keywords, para as edições escreverem com `expectedLock`.
   *
   * Sem lock não há concorrência segura: duas revisões simultâneas sobre a
   * mesma keyword sobrescreveriam uma à outra em silêncio.
   */
  const formationKeywordItems = useMemo<FormationKeywordLike[]>(
    () => masterList
      .map(keyword => {
        const workflow = (keyword as { canonicalWorkflow?: { id?: string; lockVersion?: number } }).canonicalWorkflow;
        if (!workflow?.id || typeof workflow.lockVersion !== "number") return null;
        return { keywordId: String(keyword.id), workflowItemId: workflow.id, lockVersion: workflow.lockVersion };
      })
      .filter((item): item is FormationKeywordLike => Boolean(item)),
    [masterList],
  );

  const articleFormationSummary = useMemo(
    () => summarizeArticleFormation(articleFormationUniverses),
    [articleFormationUniverses],
  );

  const articleFormationBase = useMemo(() => articleFormationBaseHash({
    siloRefs: articleFormationUniverses.map(universe => universe.siloRef),
    keywordIds: articleFormationUniverses.flatMap(universe => universe.keywordIds),
    publishedArticlePaths: articleFormationUniverses.flatMap(universe => universe.publishedArticles.map(item => item.path)),
  }), [articleFormationUniverses]);

  const formationIsStale = Boolean(articleFormationMarker)
    && articleFormationMarker!.baseHash !== articleFormationBase;

  /**
   * Síntese da última confirmação, lida do próprio marcador.
   *
   * Guardar isso em estado de sessão faria a frase sumir no F5 enquanto o
   * marcador continuava dizendo "Confirmada" — duas verdades sobre o mesmo
   * fato.
   */
  const confirmedFormation = useMemo(() => {
    const confirmation = articleFormationMarker?.confirmation;
    if (!confirmation || confirmation.status === "none") return null;
    return {
      articles: confirmation.confirmedArticleCount,
      keywords: confirmation.coveredKeywordCount,
      pending: confirmation.pendingSiloCount,
    };
  }, [articleFormationMarker]);



  /**
   * Candidato aberto no painel: o que a pessoa selecionou na mesa.
   *
   * Ler da própria seleção evita um segundo estado capaz de discordar da
   * tabela. Seleção é leitura — não entra no hash do cenário.
   */
  /**
   * A aba Artigos como hierarquia: SiloPage → Article → Keyword.
   *
   * Projeção pura sobre a formação vigente. A SiloPage é o pai, não um Article.
   */


  /** A mesma busca da área alcança Silo, artigo, keyword e slug. */
  const visibleArticleSiloViews = useMemo(
    () => filterArticleSiloViews(articleSiloViews, searchQuery),
    [articleSiloViews, searchQuery],
  );

  const articleSiloSummary = useMemo(
    () => summarizeArticleSiloViews(articleSiloViews),
    [articleSiloViews],
  );


  /** Mapa da aba: um cluster fechado por SiloPage. */
  const articleFlow = useMemo(
    () => buildArticleFlowProjection({ views: visibleArticleSiloViews, materializedArticleIds }),
    [visibleArticleSiloViews, materializedArticleIds],
  );

  /**
   * §1 — nenhum Article pode misturar Silos.
   *
   * Auditoria de leitura: ela aponta, não corrige. Um Article cross-silo não
   * tem pai — não cabe em SiloPage nenhuma e o slug não tem raiz.
   */
  const articleScopeAudit = useMemo(() => auditArticleSiloScope({
    subjects: [
      ...articleFormationUniverses.flatMap(universe => universe.candidates.map(candidate => ({
        ref: candidate.candidateRef,
        label: formationKeywordLabels.get(candidate.principalKeywordId) || candidate.candidateRef,
        siloRef: candidate.siloRef,
        principalKeywordId: candidate.principalKeywordId,
        keywordIds: candidate.keywords.map(item => item.keywordId),
      }))),
      ...Object.values(acceptedArticleDnas).map(version => {
        const keywordIds = version.payload.keywordReferences.map(reference => String(reference.keywordId));
        // O ArticleDNA nem sempre declara `territoryRef`. Enquanto ele não
        // declarar, o Silo é o das próprias keywords — e só é resolvível
        // porque todas concordam. Se discordassem, a auditoria diria
        // CROSS_SILO em vez de escolher um lado.
        const declarado = (version.payload as { territoryRef?: string | null }).territoryRef ?? null;
        const observados = [...new Set(keywordIds
          .map(id => masterList.find(item => String(item.id) === id))
          .map(item => (item && typeof item.territoryRef === "string" ? item.territoryRef : null))
          .filter((ref): ref is string => Boolean(ref)))];
        return {
          ref: String(version.payload.articleId),
          label: formationKeywordLabels.get(String(version.payload.principalKeywordId)) || String(version.payload.articleId),
          siloRef: declarado ?? (observados.length === 1 ? observados[0] : null),
          principalKeywordId: String(version.payload.principalKeywordId),
          keywordIds,
        };
      }),
    ],
    siloRefByKeywordId: new Map(masterList.map(keyword => [
      String(keyword.id),
      typeof keyword.territoryRef === "string" ? keyword.territoryRef : null,
    ])),
    confirmedSiloRefs: confirmedTerritoryRefs,
  }), [articleFormationUniverses, acceptedArticleDnas, formationKeywordLabels, masterList, confirmedTerritoryRefs]);

  /**
   * Como cada ArticleDNA conhece o próprio Silo.
   *
   * Declarado é contrato; inferido é legado legível; conflito NÃO move o
   * artigo — ele fica apontado para decisão humana.
   */
  const articleParentBindings = useMemo(() => {
    const parentByKeywordId = new Map(masterList.map(item => [
      String(item.id),
      typeof item.territoryRef === "string" ? item.territoryRef : null,
    ]));
    return new Map(Object.values(acceptedArticleDnas)
      // §1 — o acervo de formações anteriores é contado à parte, no painel.
      // Somá-lo aqui faria a leitura do vínculo descrever artigos que este
      // cenário nem propõe, e "12 inferidos" pareceria defeito do lote de hoje.
      .filter(version => !legacyArticleDnaIds.has(String(version.payload.articleId)))
      .map(version => {
        const ref = String(version.payload.articleId);
        return [ref, resolveParentBinding({
          ref,
          declaredParent: (version.payload as { territoryRef?: string | null }).territoryRef ?? null,
          keywordIds: version.payload.keywordReferences.map(reference => String(reference.keywordId)),
          parentByKeywordId,
        })];
      }));
  }, [acceptedArticleDnas, legacyArticleDnaIds, masterList]);

  const selectedFormationCandidate = useMemo<ArticleCandidate | null>(() => {
    // A mesa e o mapa passaram a apontar o MESMO nó. Ler da seleção de
    // checkbox faria o painel ficar mudo agora que a linha de artigo não tem
    // checkbox — selecionar aqui é abrir para leitura, não marcar para lote.
    if (!selectedArticleNodeRef) return null;
    for (const universe of articleFormationUniverses) {
      const encontrado = universe.candidates.find(candidate => candidate.candidateRef === selectedArticleNodeRef);
      if (encontrado) return encontrado;
    }
    return null;
  }, [selectedArticleNodeRef, articleFormationUniverses]);

  /**
   * Outros candidatos do MESMO Silo do candidato aberto.
   *
   * Juntar atravessando Silo criaria um artigo sem pai; a lista já nasce
   * restrita para que a tela nem ofereça a operação inválida.
   */
  const formationMergeTargets = useMemo(() => {
    if (!selectedFormationCandidate) return [];
    const universe = articleFormationUniverses
      .find(item => item.candidates.some(candidate => candidate.candidateRef === selectedFormationCandidate.candidateRef));
    if (!universe) return [];
    return universe.candidates
      .filter(candidate => candidate.candidateRef !== selectedFormationCandidate.candidateRef)
      .map(candidate => ({
        candidateRef: candidate.candidateRef,
        label: formationKeywordLabels.get(candidate.principalKeywordId) || "artigo sem nome",
      }));
  }, [selectedFormationCandidate, articleFormationUniverses, formationKeywordLabels]);

  /** Quando o candidato aberto tem uma keyword só, a explicação é a auditoria. */
  const selectedSingletonAudit = useMemo(() => {
    if (!selectedFormationCandidate || selectedFormationCandidate.keywords.length !== 1) return null;
    for (const universe of articleFormationUniverses) {
      const encontrado = universe.singletonAudits
        .find(audit => audit.candidateRef === selectedFormationCandidate.candidateRef);
      if (encontrado) return encontrado;
    }
    return null;
  }, [selectedFormationCandidate, articleFormationUniverses]);

  /**
   * Aplica um plano de edição da formação.
   *
   * Escreve pelo writer canônico que já existe e RELÊ o remoto: gravar não é
   * sucesso, sucesso é o remoto devolver o que foi gravado. Nenhum ArticleDNA
   * é criado aqui — isto é working state.
   */
  const applyFormationPlan = useCallback(async (plan: FormationPlan, acao: string) => {
    if (!selectedBrandId) return false;
    if (plan.refusals.length) {
      showNotification("error", plan.refusals.map(refusal => refusal.detail).join(" "));
      return false;
    }
    if (!plan.patches.length) return false;

    setFormationBusy(true);
    try {
      await persistArchitectWorkingCopy({
        brandId: selectedBrandId,
        updates: plan.patches.map(patch => ({
          workflowItemId: patch.workflowItemId,
          expectedLock: patch.expectedLock,
          assignment: patch.assignment,
        })),
      });
      // Gravar não é sucesso: sucesso é o remoto devolver o que foi gravado.
      const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
      const gravado = new Map<string, string | null>();
      for (const entry of buildCanonicalWorkflowWorkspaceItems(canonical.workflowItems, canonical.keywords, selectedBrandId)) {
        const registro = entry as Record<string, unknown>;
        const valor = registro.articleFormationRef;
        gravado.set(String(registro.id), typeof valor === "string" ? valor : null);
      }
      const naoConfirmadas = plan.patches
        .filter(patch => gravado.get(patch.keywordId) !== patch.assignment.articleFormationRef);
      setCanonicalWorkspaceReload(current => current + 1);
      if (naoConfirmadas.length) {
        showNotification("error", `${acao}: o readback não confirmou ${naoConfirmadas.length} keyword(s).`);
        return false;
      }
      showNotification("success", `${acao}: ${plan.patches.length} keyword(s) confirmadas no readback.`);
      return true;
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "A revisão não pôde ser gravada.");
      return false;
    } finally {
      setFormationBusy(false);
    }
  }, [selectedBrandId, showNotification]);

  /** Silo da keyword/candidato aberto — as edições valem dentro de um Silo. */
  const universeOfCandidate = useCallback((candidateRef: string) =>
    articleFormationUniverses.find(universe =>
      universe.candidates.some(candidate => candidate.candidateRef === candidateRef)) || null,
    [articleFormationUniverses]);

  const moveKeywordToCandidate = useCallback(async (keywordId: string, targetCandidateRef: string) => {
    const universe = universeOfCandidate(targetCandidateRef);
    if (!universe) return;
    await applyFormationPlan(planMoveKeyword({
      universe,
      keywords: formationKeywordItems,
      keywordId,
      targetCandidateRef,
      mintUuid: crypto.randomUUID(),
      decidedAt: new Date().toISOString(),
    }), "Keyword movida");
  }, [universeOfCandidate, formationKeywordItems, applyFormationPlan]);

  const mergeCandidates = useCallback(async (leftCandidateRef: string, rightCandidateRef: string) => {
    const universe = universeOfCandidate(leftCandidateRef);
    if (!universe) return;
    await applyFormationPlan(planMergeCandidates({
      universe,
      keywords: formationKeywordItems,
      leftCandidateRef,
      rightCandidateRef,
      mintUuid: crypto.randomUUID(),
      decidedAt: new Date().toISOString(),
    }), "Artigos juntados");
  }, [universeOfCandidate, formationKeywordItems, applyFormationPlan]);

  const splitKeywordFromCandidate = useCallback(async (candidateRef: string, keywordId: string) => {
    const universe = universeOfCandidate(candidateRef);
    if (!universe) return;
    await applyFormationPlan(planSplitKeyword({
      universe,
      keywords: formationKeywordItems,
      candidateRef,
      keywordId,
      newFormationRef: newFormationRef(crypto.randomUUID()),
      mintUuid: crypto.randomUUID(),
      decidedAt: new Date().toISOString(),
    }), "Keyword separada");
  }, [universeOfCandidate, formationKeywordItems, applyFormationPlan]);

  const changeCandidatePrincipal = useCallback(async (candidateRef: string, keywordId: string) => {
    const universe = universeOfCandidate(candidateRef);
    if (!universe) return;
    await applyFormationPlan(planPrincipalChange({
      universe,
      keywords: formationKeywordItems,
      candidateRef,
      keywordId,
      publishedKeywordIds: new Set(masterList.filter(item => item.isPublished).map(item => String(item.id))),
      mintUuid: crypto.randomUUID(),
      decidedAt: new Date().toISOString(),
    }), "Principal trocada");
  }, [universeOfCandidate, formationKeywordItems, applyFormationPlan, masterList]);

  /**
   * Secundária ↔ reforço narrativo — sem mover a busca de artigo.
   *
   * A decisão vivia só na tela: o ArticleDNA nascia com tudo como secundária.
   * Ela passa pelo mesmo writer das outras revisões, com `expectedLock` e
   * readback, porque é decisão editorial como qualquer outra.
   */
  const changeKeywordRole = useCallback(async (
    candidateRef: string,
    keywordId: string,
    role: "secundaria" | "reforco",
  ) => {
    const universe = universeOfCandidate(candidateRef);
    if (!universe) return;
    await applyFormationPlan(planKeywordRole({
      universe,
      keywords: formationKeywordItems,
      candidateRef,
      keywordId,
      role,
      mintUuid: crypto.randomUUID(),
      decidedAt: new Date().toISOString(),
    }), role === "reforco" ? "Reforço narrativo definido" : "Secundária definida");
  }, [universeOfCandidate, formationKeywordItems, applyFormationPlan]);

  /**
   * Registra que a composição fica como está, apesar do parecer.
   *
   * É a decisão editorial concreta — "li a evidência e mantenho" — amarrada ao
   * `formationBaseHash` que estava em tela. Se a composição mudar depois, ela
   * deixa de valer sozinha: não existe revogação manual porque não existe
   * decisão sobre uma composição que já não é a mesma.
   */
  const acceptSerpForCandidate = useCallback(async (candidateRef: string, reason: string) => {
    if (!selectedBrandId) return;
    const registro = remoteArticleSerp.find(item => item.candidateRef === candidateRef)?.payload;
    if (!registro) {
      showNotification("error", "Não há parecer de SERP para este artigo; colete a evidência antes de decidir.");
      return;
    }
    setFormationBusy(true);
    try {
      await callStrategicApi<{ candidateRef: string }>("/api/arquiteto/serp-resolution", {
        brandId: selectedBrandId,
        candidateRef,
        formationBaseHash: registro.formationBaseHash,
        assessmentId: registro.assessment.id,
        decision: "accept_current_composition",
        reason,
      }, "serp");
      // Gravar não é sucesso: o estado só muda depois que o remoto devolve.
      const canonical = await loadCanonicalArquitetoWorkspace(selectedBrandId);
      setRemoteArticleSerp(canonical.articleFormationSerp);
      const confirmado = canonical.articleFormationSerp
        .find(item => item.candidateRef === candidateRef)?.payload.humanResolution;
      if (confirmado?.formationBaseHash !== registro.formationBaseHash) {
        showNotification("error", "A decisão não foi confirmada pelo remoto.");
        return;
      }
      showNotification("success", "Decisão registrada para esta composição.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "A decisão não pôde ser gravada.");
    } finally {
      setFormationBusy(false);
    }
  }, [selectedBrandId, remoteArticleSerp, showNotification]);

  /* ------------------ §6–§11 revisão humana da formação ------------------ */

  /**
   * Keywords com os dados de leitura que a comparação usa.
   *
   * Tudo aqui já existe: volume, resultados, KGR, intenção, funil,
   * aplicabilidade e política de identidade publicada. Nenhum score novo é
   * inventado — a comparação só relê o que o Minerador entregou.
   */
  const scenarioKeywords = useMemo<ScenarioKeyword[]>(() => masterList.map(keyword => {
    const semantic = (keyword.analise_semantica || {}) as Record<string, unknown>;
    const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
    return {
      keywordId: String(keyword.id),
      keyword: String(keyword.keyword || ""),
      intent: texto(semantic.intencao_principal) || keyword.intent || null,
      volume: keyword.volume_search ?? null,
      kgr: keyword.kgr ?? null,
      entity: texto(semantic.entidade_central),
      problem: texto(semantic.problema_percebido),
      isPublished: Boolean(keyword.isPublished),
      results: keyword.results_allintitle ?? null,
      funnel: texto(semantic.funil) || texto(semantic.funnel),
      applicability: texto(semantic.aplicabilidade) || keyword.kgrIdentity?.bindingStatus || null,
      // Identidade publicada travada não troca de Principal por decisão de tela.
      protectedPublication: keyword.primaryKeywordPolicy === "locked",
      serpVerdict: null,
    };
  }), [masterList]);

  /** Tema do pai confirmado, para a simulação ler o mesmo universo da mesa. */
  const siloContextByRef = useMemo(() => new Map(remoteTerritories
    .filter(item => siloIsHumanDecided(item.territory.lifecycleStatus))
    .map(item => [item.territoryRef, {
      centralEntity: item.territory.centralEntity,
      macroIntent: item.territory.macroIntent,
      boundaryIncludes: item.territory.boundary?.includes,
      narrative: item.territory.narrative?.statement ?? null,
    }])), [remoteTerritories]);

  /** §6 — o que o remoto confirmou na última conclusão. */
  const [materializationReadback, setMaterializationReadback] = useState<MaterializationReadback | null>(null);

  /** §14 — o que a portaria respondeu na última tentativa de concluir. */
  const [conclusionGates, setConclusionGates] = useState<readonly ConclusionGate[]>([]);
  /** Impacto estrutural aguardando confirmação informada do humano. */
  const [architectureImpactAck, setArchitectureImpactAck] = useState<ReturnType<typeof resolveTerritoryChangeImpact> | null>(null);



  const candidateRefOfChange = (change: ScenarioChange) =>
    change.kind === "move_keyword" || change.kind === "move_to_silo" ? change.fromCandidateRef
      : change.kind === "merge_candidates" ? change.leftCandidateRef
        : change.candidateRef;

  /**
   * Antes/depois da proposta aberta.
   *
   * A simulação roda a MESMA leitura do cenário sobre a composição proposta.
   * Ela não persiste, não chama rede e não materializa: é uma pergunta.
   */
  const scenarioPreview = useMemo(() => {
    if (!pendingScenarioChange) return null;
    const universe = universeOfCandidate(candidateRefOfChange(pendingScenarioChange));
    if (!universe) return null;
    const doSilo = new Set(universe.keywordIds);
    return simulateScenarioChange({
      universe,
      keywords: scenarioKeywords.filter(item => doSilo.has(item.keywordId)),
      siloContext: siloContextByRef.get(universe.siloRef),
      keywordLabels: formationKeywordLabels,
      change: pendingScenarioChange,
    });
  }, [pendingScenarioChange, universeOfCandidate, scenarioKeywords, siloContextByRef, formationKeywordLabels]);

  /** §10 — trocar quem lidera é comparação, nunca sugestão aceita em silêncio. */
  const scenarioPrincipalComparison = useMemo(() => {
    if (!pendingScenarioChange || pendingScenarioChange.kind !== "change_principal") return null;
    const universe = universeOfCandidate(pendingScenarioChange.candidateRef);
    const candidate = universe?.candidates
      .find(item => item.candidateRef === pendingScenarioChange.candidateRef);
    if (!universe || !candidate) return null;
    return comparePrincipalCandidates({
      candidate,
      keywords: scenarioKeywords,
      currentKeywordId: candidate.principalKeywordId,
      proposedKeywordId: pendingScenarioChange.keywordId,
      suggestedSlug: candidate.suggestedSlug,
    });
  }, [pendingScenarioChange, universeOfCandidate, scenarioKeywords]);

  /**
   * Aplica a proposta ao cenário — pelos writers que já existem.
   *
   * O simulador responde "o que muda"; quem grava continua sendo o plano
   * canônico da working copy, com `expectedLock` e readback. Papel editorial
   * (secundária ↔ reforço) não altera composição e por isso não vira patch.
   */
  const applyPendingScenarioChange = useCallback(async () => {
    const change = pendingScenarioChange;
    if (!change || scenarioPreview?.refusal) return;
    if (change.kind === "change_principal") await changeCandidatePrincipal(change.candidateRef, change.keywordId);
    else if (change.kind === "move_keyword") await moveKeywordToCandidate(change.keywordId, change.toCandidateRef);
    else if (change.kind === "split_keyword" || change.kind === "remove_keyword") {
      // Remover deste artigo é separar: a busca continua no lote, com conteúdo
      // próprio. Descartá-la do Silo é decisão territorial, não de formação.
      await splitKeywordFromCandidate(change.candidateRef, change.keywordId);
    } else if (change.kind === "merge_candidates") {
      await mergeCandidates(change.leftCandidateRef, change.rightCandidateRef);
    } else if (change.kind === "set_role") await changeKeywordRole(change.candidateRef, change.keywordId, change.role);
    setPendingScenarioChange(null);
  }, [pendingScenarioChange, scenarioPreview, changeCandidatePrincipal, changeKeywordRole, moveKeywordToCandidate, splitKeywordFromCandidate, mergeCandidates]);

  /**
   * O ESCOPO DA FASE ARTIGOS É A SELEÇÃO — NUNCA O LOTE.
   *
   * A tabela é a área de seleção; o painel é a área de trabalho. Quando os
   * quatro motores saíram da tela, `processDeterministicStructure` — que já
   * era selection-scoped — ficou órfão, e os dois botões da fase passaram a
   * operar sobre `articleFormationUniverses` inteiro.
   *
   * O sintoma que o humano viu: "1 artigo precisa de decisão humana" sobre um
   * Article que ele não tinha selecionado. O gate olhava o lote enquanto a
   * pessoa olhava a seleção — a mesma pergunta com dois escopos.
   *
   * Nada de seleção NÃO significa tudo. Significa que não há o que fazer.
   */
  const selectedCandidateRefs = useMemo(
    () => selectedCandidateRefsOf({ selectedArticleIds, articles: articlesList }),
    [articlesList, selectedArticleIds],
  );

  /**
   * Os universos recortados pela seleção.
   *
   * Universo sem nenhum candidato selecionado sai inteiro: ele não participa,
   * não bloqueia e não é alterado.
   */
  const selectedFormationUniverses = useMemo(
    () => scopeFormationUniverses({ universes: articleFormationUniverses, selectedCandidateRefs }),
    [articleFormationUniverses, selectedCandidateRefs],
  );

  /**
   * ARTICLE APROVADO NÃO PODE SUMIR DA TELA.
   *
   * Quando a fase Silos move buscas de um ArticleDNA aprovado, o artefato
   * continua no acervo mas deixa de ser projetado: o agrupamento corrente só
   * enxerga keywords de territórios confirmados. O artigo vira invisível — sem
   * revisão, sem reprocesso, sem sequer aparecer como pendência.
   *
   * Esta leitura devolve esses artigos ao campo de visão, com o motivo.
   */
  const structuralRevisions = useMemo(() => {
    const territoryByKeywordId = new Map(masterList.map(keyword => [
      String(keyword.id),
      typeof keyword.territoryRef === "string" ? keyword.territoryRef : null,
    ]));
    const nomeDaKeyword = new Map(masterList.map(keyword => [String(keyword.id), String(keyword.keyword || keyword.id)]));
    return Object.values(acceptedArticleDnas)
      .filter(version => effectiveVersionStatus(version.versionId, versionEvents) === "approved")
      .map(version => ({
        version,
        label: nomeDaKeyword.get(version.payload.principalKeywordId) || version.payload.suggestedSlug || version.payload.articleId,
        reading: readArticleStructuralState({ article: version.payload, territoryByKeywordId }),
      }))
      .filter(item => item.reading.state === "REVISION_REQUIRED");
  }, [acceptedArticleDnas, masterList, versionEvents]);

  const siloLabelByRef = useMemo(
    () => new Map(articleFormationUniverses.map(universe => [universe.siloRef, universe.siloLabel])),
    [articleFormationUniverses],
  );

  /**
   * O GATE SERP DE CADA ARTICLE DO CENÁRIO.
   *
   * A lógica propõe; a SERP verifica no mercado. Um Article novo nunca está
   * fora deste gate — "não necessária" seria afirmar que a hipótese basta, e é
   * exatamente essa afirmação que o contrato proíbe.
   *
   * A evidência é reaproveitada quando ainda descreve a composição de agora:
   * obrigatória não quer dizer chamar o provider toda vez.
   */
  const articleSerpGates = useMemo(() => {
    const intentByKeywordId = new Map(scenarioKeywords.map(item => [item.keywordId, item.intent]));
    // O remoto manda. O parecer local só descreve o que ESTA aba coletou.
    const remotoPorCandidato = new Map(remoteArticleSerp.map(item => [item.candidateRef, item.payload]));

    const gates = new Map<string, ArticleSerpGateState>();
    for (const universe of articleFormationUniverses) {
      for (const candidate of universe.candidates) {
        const base = articleSerpBaseOf({
          candidate,
          intentByKeywordId,
          siloContext: siloContextByRef.get(universe.siloRef),
        });
        const remoto = remotoPorCandidato.get(candidate.candidateRef);
        const execucao = serpExecution[candidate.candidateRef];

        gates.set(candidate.candidateRef, resolveArticleFormationSerpState({
          candidateRef: candidate.candidateRef,
          expectedBaseHash: articleSerpBaseHash(base),
          observed: remoto
            ? {
              formationBaseHash: remoto.formationBaseHash,
              verdict: remoto.verdict,
              // A decisão humana vale para a composição sobre a qual foi
              // tomada, e o registro guarda exatamente essa base.
              humanDecisionBaseHash: remoto.humanResolution?.formationBaseHash ?? null,
            }
            : null,
          processing: execucao?.status === "processing",
          failed: execucao?.status === "error",
        }));
      }
    }
    return gates;
  }, [articleFormationUniverses, scenarioKeywords, remoteArticleSerp, siloContextByRef, serpExecution]);

  /**
   * PENDÊNCIA DE CLASSIFICAÇÃO POR CANDIDATO — §13.
   *
   * A resolução sempre devolve terminal; ela nunca deixa campo em branco. O
   * que sobra aqui é só o caso em que a REGRA devolve a decisão ao humano, e
   * escolher um default no lugar dele seria inventar a decisão editorial.
   *
   * Isto alimenta o portão para que o bloqueio apareça ANTES do clique, com
   * os campos nomeados — não como recusa muda no meio da escrita.
   */
  const unresolvedClassificationsByCandidate = useMemo(() => {
    const mapa = new Map<string, readonly string[]>();
    for (const universe of articleFormationUniverses) {
      for (const candidate of universe.candidates) {
        const principalId = candidate.keywords.find(item => item.role === "principal")?.keywordId;
        if (!principalId) continue;
        const keywordIds = candidate.keywords.map(item => item.keywordId);
        const keywords = keywordIds
          .map(id => masterList.find(item => String(item.id) === id))
          .filter((item): item is (typeof masterList)[number] => Boolean(item));
        const registro = remoteArticleSerp.find(item => item.candidateRef === candidate.candidateRef)?.payload;
        const gate = articleSerpGates.get(candidate.candidateRef);
        const evidencia = classificationEvidenceFor({
          principalKeywordId: principalId,
          keywordIds,
          serpInterpretation: registro?.interpretation ?? null,
          serpResolved: serpWasExecutedFor(gate?.state || "missing"),
          kgr: readArticleKgrDecision({
            kgrIdentity: keywords.find(item => String(item.id) === principalId)?.kgrIdentity,
            principal: keywords.find(item => String(item.id) === principalId),
            principalKeywordId: principalId,
            supports: keywords.filter(item => String(item.id) !== principalId),
          }),
          isPublished: keywords.some(item => Boolean(item.isPublished)),
          principalProtected: keywords.find(item => String(item.id) === principalId)?.primaryKeywordPolicy === "locked",
        });
        const codes = unresolvedClassifications(evidencia);
        if (codes.length) {
          mapa.set(candidate.candidateRef, codes.map(code => CLASSIFICATION_BLOCKER_LABELS[code]));
        }
      }
    }
    return mapa;
  }, [articleFormationUniverses, articleSerpGates, classificationEvidenceFor, masterList, remoteArticleSerp]);

  useEffect(() => {
    if (!selectedBrandId) { setApprovedLinkGraphs([]); return; }
    let vivo = true;
    void loadInternalLinkGraphs(selectedBrandId)
      .then(graphs => { if (vivo) setApprovedLinkGraphs(graphs.filter(graph => graph.workflowStatus === "approved")); })
      .catch(() => { if (vivo) setApprovedLinkGraphs([]); });
    return () => { vivo = false; };
  }, [selectedBrandId, canonicalWorkspaceReload]);

  /**
   * O PORTÃO DO RADAR — uma leitura só, a canônica.
   *
   * Este memo redecidia tudo por conta própria: achava o ArticleDNA pelo
   * agrupamento provisório, o Silo por `article.siloId`, a SERP pelo registro
   * legado e os conflitos pelo agrupamento anterior à revisão. Quatro chaves
   * diferentes das que a mesa usa — e o botão recusava por pendências que já
   * não existiam, sobre um objeto que já não era aquele.
   *
   * `buildRadarHandoffPlan` é o mesmo portão que responde o gate do lote.
   */
  const selectedArticleRadarPlan = useMemo(() => buildRadarHandoffPlan(selectedArticlesForRadar.map(article => {
    const dna = articleDnaEntryFor({ articleId: articleEntityIdFor(article), candidateRef: article.candidateRef }).version;
    const pai = articleParentFor(article);
    const gate = article.candidateRef ? articleSerpGates.get(article.candidateRef) : undefined;
    const coberto = Boolean(dna && approvedLinkGraphs.some(graph =>
      graph.nodes.some(node => node.articleDnaVersionRef?.versionId === dna.versionId)));
    return {
      articleId: dna?.payload.articleId || article.id,
      label: article.keywordPrincipal,
      articleDnaVersionId: dna?.versionId ?? null,
      articleDnaContentHash: dna?.contentHash ?? null,
      territoryRef: pai.territoryRef,
      siloId: pai.canonicalSiloId,
      principalKeywordId: dna?.payload.principalKeywordId ?? null,
      secondaryKeywordIds: dna?.payload.secondaryKeywordIds ?? [],
      narrativeReinforcementIds: dna?.payload.narrativeReinforcementIds ?? [],
      suggestedSlug: dna?.payload.suggestedSlug ?? null,
      keywordTerritoryRefs: pai.territoryRef ? [pai.territoryRef] : [],
      serpState: gate?.state ?? null,
      serpReason: gate?.reason ?? null,
      internalLinkGraphApproved: coberto,
      belongsToCurrentScenario: Boolean(dna),
      readbackConfirmed: Boolean(dna && effectiveVersionStatus(dna.versionId, versionEvents) === "approved"),
    };
  })), [selectedArticlesForRadar, articleDnaEntryFor, articleSerpGates, approvedLinkGraphs, versionEvents, remoteTerritories, acceptedSiloDnas]);

  const selectedArticleRadarGateIssues = useMemo(
    () => [...new Set(selectedArticleRadarPlan.blocked.flatMap(item => item.blockers))],
    [selectedArticleRadarPlan],
  );
  const canSendSelectedArticlesToRadar = selectedArticleRadarGateIssues.length === 0;

  const articleSerpGateSummary = useMemo(
    () => summarizeArticleSerpGate([...articleSerpGates.values()]),
    [articleSerpGates],
  );

  /**
   * Os candidatos do cenário no formato que a SERP já sabe consultar.
   *
   * A identidade é o `candidateRef`: o Article ainda NÃO existe quando a
   * evidência é coletada, e fabricar um ArticleDNA só para satisfazer a rota
   * seria inverter a ordem — gravar o contrato antes de verificar o mercado.
   */
  const serpGroupsForCandidates = useCallback((refs: readonly string[]): ProvisionalArticleGroup[] => {
    const alvos = new Set(refs);
    const grupos: ProvisionalArticleGroup[] = [];
    for (const universe of articleFormationUniverses) {
      for (const candidate of universe.candidates) {
        if (!alvos.has(candidate.candidateRef)) continue;
        const membros = [...candidate.keywords.map(item => item.keywordId), ...candidate.overflowKeywordIds]
          .map(keywordId => masterList.find(item => String(item.id) === keywordId))
          .filter((item): item is (typeof masterList)[number] => Boolean(item));
        if (!membros.length) continue;
        grupos.push({
          id: candidate.candidateRef,
          keywordIds: membros.map(item => String(item.id)),
          keywords: membros,
          publishedAnchorId: null,
          territoryRef: universe.siloRef,
          suggestedSiloId: null,
          suggestedSiloName: null,
          evidence: { lexical: 0.6, intent: 0.8, entities: 0.5, silo: 1, combined: 0.7 },
          confidence: 0.7,
          alerts: [],
          principalSuggestion: {
            keywordId: candidate.principalKeywordId,
            score: 0.7,
            breakdown: {
              cobertura: 0.6, intencao: 0.8, centralidadeSemantica: 0.7, aderenciaMarca: 0.5,
              potencialComercial: 0.5, volume: 0.5, dificuldade: 0.5, qualidadeSlug: 0.8,
              ancoraPublicada: 0, serp: null,
            },
            justificativa: ["Principal do cenário de formação vigente."],
            pendencias: [],
          },
          // O papel viaja: perguntamos à SERP se cada busca cabe como
          // secundária ou como reforço, então ela precisa saber o papel.
          roles: Object.fromEntries(candidate.keywords.map(item => [item.keywordId,
            item.role === "principal" ? "principal" : item.role === "reforco" ? "reforco_narrativo" : "secundaria"])),
          suggestedHierarchy: "Suporte" as const,
        } as unknown as ProvisionalArticleGroup);
      }
    }
    return grupos;
  }, [articleFormationUniverses, masterList]);

  /**
   * Tudo o que o painel de revisão precisa saber sobre um artigo do cenário.
   *
   * Mover e juntar só enxergam artigos do MESMO Silo: a lista já nasce
   * restrita, para que a tela nem chegue a oferecer o inválido.
   */
  const formationReviewFor = useCallback((candidateRef: string | null | undefined) => {
    if (!candidateRef) return null;
    const universe = universeOfCandidate(candidateRef);
    const candidate = universe?.candidates.find(item => item.candidateRef === candidateRef);
    if (!universe || !candidate) return null;
    const nome = (keywordId: string) => formationKeywordLabels.get(keywordId) || keywordId;
    const irmaos = universe.candidates
      .filter(item => item.candidateRef !== candidateRef)
      .map(item => ({ candidateRef: item.candidateRef, label: nome(item.principalKeywordId) }));
    return {
      candidate,
      scenario: {
        principal: nome(candidate.principalKeywordId),
        secundarias: candidate.keywords.filter(item => item.role === "secundaria").map(item => nome(item.keywordId)),
        reforcos: candidate.keywords.filter(item => item.role === "reforco").map(item => nome(item.keywordId)),
      },
      keywords: candidate.keywords.map(item => ({ keywordId: item.keywordId, label: nome(item.keywordId), role: item.role })),
      moveTargets: irmaos,
      mergeTargets: irmaos,
      siloTargets: [...siloLabelByRef.entries()]
        .filter(([ref]) => ref !== universe.siloRef)
        .map(([siloRef, label]) => ({ siloRef, label })),
      conclusion: [
        candidate.reason,
        ...candidate.scores.coherence.reasons.slice(0, 2),
        ...candidate.scores.intent.reasons.slice(0, 1),
        ...candidate.conflicts,
      ].filter(Boolean),
    };
  }, [universeOfCandidate, formationKeywordLabels, siloLabelByRef]);

  /**
   * Processar artigos — uma ação, o conjunto inteiro de cada Silo.
   *
   * Determinístico neste corte: sem SERP e sem IA. Nada é materializado; o
   * resultado é PROPOSTA de formação sobre um read-model.
   */
  const processArticleFormation = useCallback(async () => {
    if (!selectedBrandId) return;
    const escopo = assertSelectionScope(selectedCandidateRefs);
    if (!escopo.ok) {
      showNotification("error", escopo.reason);
      return;
    }
    setFormationBusy(true);
    try {
      if (!selectedFormationUniverses.length) {
        showNotification("error", "Nenhum Silo confirmado libera formação de artigos ainda.");
        return;
      }
      const marcador = await persistArticleFormationMarker(selectedBrandId, {
        contractVersion: ARTICLE_FORMATION_MARKER_CONTRACT_VERSION,
        baseHash: articleFormationBase,
        processedAt: new Date().toISOString(),
        confirmation: {
          status: "none",
          confirmedAt: null,
          confirmedArticleCount: 0,
          coveredKeywordCount: 0,
          pendingSiloCount: 0,
          failedCount: 0,
        },
      });
      setArticleFormationMarker(marcador);

      /**
       * §6 — a SERP entra AQUI, dentro do reprocessamento.
       *
       * A lógica acabou de propor os grupos; agora o mercado precisa dizer se
       * eles se sustentam. Não é uma quinta etapa manual: quem aperta
       * Reprocessar artigos já está pedindo o cenário verificado.
       *
       * Só entram os artigos SEM evidência vigente. Coletar de novo o que já
       * está atual seria gastar provider para reconfirmar o que não mudou.
       */
      // Artigo aprovado que perdeu buscas para outro território não aparece
      // no cenário; dizer o nome dele é a diferença entre "revisar" e "sumiu".
      if (structuralRevisions.length) {
        showNotification("warning", `${structuralRevisions.length} ArticleDNA aprovado(s) precisam de revisão estrutural e não estão no cenário: `
          + structuralRevisions.map(item => `${item.label} — ${item.reading.reason}`).join(" · "));
      }

      const pendentes = serpGroupsForCandidates(articleSerpGateSummary.needsCollection);
      if (!pendentes.length) {
        // Nada a coletar não é "nada aconteceu": é evidência reaproveitada. A
        // mensagem precisa dizer o que o mercado já respondeu, senão a pessoa
        // acha que o clique não fez nada e clica de novo.
        const g = articleSerpGateSummary;
        showNotification("success", `Formação processada: ${articleFormationSummary.candidates} Article(s). `
          + `SERP reaproveitada para ${g.analyzed}/${g.total}. `
          + `${g.supported} sustentado(s) · ${g.divergent} divergente(s) · ${g.inconclusive} inconclusivo(s)`
          + (g.awaitingHuman ? ` · ${g.awaitingHuman} aguardando decisão humana.` : "."));
        return;
      }
      showNotification("success", `Formação processada: ${articleFormationSummary.candidates} artigo(s) candidato(s). Coletando SERP de ${pendentes.length} artigo(s) sem evidência vigente.`);
      await confirmSerpValidation(pendentes);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "A formação não pôde ser processada.");
    } finally {
      setFormationBusy(false);
    }
  }, [structuralRevisions, selectedBrandId, articleFormationUniverses, articleFormationBase, articleFormationSummary, articleSerpGateSummary, serpGroupsForCandidates, showNotification]);

  /**
   * Cria os ArticleDNA dos candidatos aprovados.
   *
   * Usa o writer canônico que já existe — `persistArquitetoArtifact` com
   * `artifactType: "article_dna"` — e o payload determinístico do contrato
   * atual. Nenhum endpoint novo, nenhum ArticleDNAV2.
   *
   * O writer é UM POR CHAMADA e não tem transação: por isso cada criação é
   * independente e uma falha no meio não desfaz as anteriores. O que já foi
   * criado continua válido e a contagem devolvida diz exatamente quantos
   * passaram — declarar o lote inteiro como criado seria mentir.
   *
   * Nenhum provider é chamado aqui: SERP e IA são o próximo corte.
   */
  const materializeApprovedArticleDnas = useCallback(async (
    aprovados: readonly ConfirmationEntry[],
  ) => {
    if (!selectedBrandId) return [];
    const actorId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorId) return [];

    const criados: {
      candidateRef: string;
      keywordIds: string[];
      articleId: string;
      expectation: MaterializedArticleExpectation;
    }[] = [];
    const aprovacoes: VersionStatusEvent[] = [];
    for (const aprovado of aprovados) {
      const keywords = aprovado.keywordIds
        .map(keywordId => masterList.find(item => String(item.id) === keywordId))
        .filter((item): item is (typeof masterList)[number] => Boolean(item))
        // O slug validado precisa CHEGAR ao payload. O adapter recalcula tudo
        // — KGR, política de principal, estratégia de SERP — a partir do
        // `slug_sugerido` da principal, e o do Minerador é compartilhado entre
        // as keywords do mesmo cluster: usá-lo faria vários artigos nascerem
        // com o mesmo endereço, exatamente o que o validador acabou de barrar.
        .map(item => String(item.id) === aprovado.principalKeywordId
          ? { ...item, slug_sugerido: aprovado.slug, computedSlug: aprovado.slug }
          : item);
      if (!keywords.length) continue;

      /**
       * Nenhum ArticleDNA nasce atravessando Silo.
       *
       * A checagem acontece ANTES da escrita: deixar passar criaria um artigo
       * sem pai possível — nenhuma SiloPage o comporta e o slug não tem raiz.
       */
      const escopo = assertSingleParent({
        candidateRef: aprovado.candidateRef,
        parentSiloRef: aprovado.siloRef,
        keywordIds: aprovado.keywordIds,
        parentByKeywordId: new Map(masterList.map(item => [
          String(item.id),
          typeof item.territoryRef === "string" ? item.territoryRef : null,
        ])),
      });
      if (!escopo.ok) {
        showNotification("warning", `Um artigo não pôde ser criado: ${escopo.reason}`);
        continue;
      }

      // A identidade do ArticleDNA vem do agrupamento revisado — determinística
      // e estável, para que reconfirmar não crie um artigo paralelo.
      const articleId = aprovado.candidateRef;
      const grupo = {
        id: articleId,
        keywordIds: keywords.map(keyword => String(keyword.id)),
        keywords,
        publishedAnchorId: null,
        // Pai estrutural declarado: ele viaja com o grupo até o payload.
        territoryRef: aprovado.siloRef,
        suggestedSiloId: null,
        suggestedSiloName: null,
        evidence: { lexical: 0.6, intent: 0.8, entities: 0.5, silo: 1, combined: 0.7 },
        confidence: 0.7,
        alerts: [],
        principalSuggestion: {
          keywordId: aprovado.principalKeywordId,
          score: 0.7,
          breakdown: {
            cobertura: 0.6, intencao: 0.8, centralidadeSemantica: 0.7, aderenciaMarca: 0.5,
            potencialComercial: 0.5, volume: 0.5, dificuldade: 0.5, qualidadeSlug: 0.8,
            ancoraPublicada: 0, serp: null,
          },
          justificativa: ["Principal definida na formação revisada."],
          pendencias: [],
        },
        // Os papéis vêm do CENÁRIO, não de um default.
        //
        // Achatar tudo em "secundária" apagava, na escrita, a única coisa que a
        // revisão humana tinha decidido sobre reforço narrativo — e o DNA
        // nascia descrevendo um artigo que ninguém aprovou.
        roles: Object.fromEntries(aprovado.keywords.map(item => [item.keywordId,
          item.role === "principal" ? "principal"
            : item.role === "reforco" ? "reforco_narrativo"
              : "secundaria"])),
        suggestedHierarchy: "Suporte" as const,
      } as unknown as ProvisionalArticleGroup;

      try {
        /**
         * CONCLUIR A FORMAÇÃO É A APROVAÇÃO DO ARTICLE.
         *
         * Materializar como proposta e exigir um segundo clique de aprovação
         * criava duas decisões humanas para um único ato editorial: a mesa
         * mostrava o mesmo artigo como "Consolidado" e "Em processo" ao mesmo
         * tempo, e a etapa Silos ficava esperando uma aprovação que a jornada
         * principal não pedia em lugar nenhum.
         *
         * A evidência SERP vigente viaja junto — é ela que o portão de
         * consolidação exige, e a portaria já a validou antes desta escrita.
         */
        const base = deterministicArticleDnaPayload(grupo, selectedBrandId);
        const evidencia = canonicalSerpReferenceFor(aprovado.candidateRef);
        const confirmado = confirmedArticlePayload(
          evidencia ? { ...base, serpAssessmentRef: evidencia } : base,
          aprovado.principalKeywordId,
          actorId,
        );

        /*
         * O ARTEFATO APROVADO NÃO CARREGA ESTADO DE PROCESSO.
         *
         * "Pendente", "não recebido" e "aguardando" descrevem o processo, e o
         * processo acabou aqui. Se a evidência não sustenta resposta forte, o
         * campo registra a INCERTEZA — `Ambígua`, `Indeterminado`,
         * `Não aplicável` — que é resultado, não dívida.
         *
         * Duas coisas que isto NÃO faz: inventar certeza onde não há base, e
         * decidir no lugar do humano onde a regra devolve a decisão a ele. O
         * segundo caso BLOQUEIA a conclusão em vez de escolher um default.
         */
        const registroSerp = remoteArticleSerp.find(item => item.candidateRef === aprovado.candidateRef)?.payload;
        const gateSerp = articleSerpGates.get(aprovado.candidateRef);
        const kgrDoArtigo = readArticleKgrDecision({
          kgrIdentity: acceptedArticleDnas[articleId]?.payload.kgrIdentity,
          principal: keywords.find(item => String(item.id) === aprovado.principalKeywordId),
          principalKeywordId: aprovado.principalKeywordId,
          supports: keywords.filter(item => String(item.id) !== aprovado.principalKeywordId),
        });
        const evidenciaClassificacao = classificationEvidenceFor({
          principalKeywordId: aprovado.principalKeywordId,
          keywordIds: aprovado.keywordIds,
          serpInterpretation: registroSerp?.interpretation
            || (registroSerp ? articleSerpParecerFromAssessment(registroSerp, {
              principalKeywordId: aprovado.principalKeywordId,
              keywordIds: [...aprovado.keywordIds],
            } as never) : null),
          serpResolved: serpWasExecutedFor(gateSerp?.state || "missing"),
          kgr: kgrDoArtigo,
          isPublished: Boolean(base.publishedIdentityRef),
          principalProtected: keywords.find(item => String(item.id) === aprovado.principalKeywordId)?.primaryKeywordPolicy === "locked",
        });

        const naoResolvidas = unresolvedClassifications(evidenciaClassificacao);
        if (naoResolvidas.length) {
          showNotification("warning", unresolvedClassificationMessage(naoResolvidas)!);
          continue;
        }
        const classificacao = resolveArticleClassification(evidenciaClassificacao);

        /*
         * O ARTEFATO SAI DAQUI COMPLETO — território E Silo canônico.
         *
         * Emitir `siloId: null` e deixar que Links, Radar e o servidor
         * deduzissem o pai depois era a fase seguinte terminando o serviço
         * desta. Cada consumidor refazia a mesma busca e podia chegar a uma
         * resposta diferente.
         *
         * Se o Silo ainda não foi consolidado, a formação NÃO é concluída: a
         * ordem canônica é Silos antes de Artigos, e materializar um pai que
         * não existe seria inventar a referência. A recusa é nomeada.
         */
        const materializado = materializeArticleSiloId({
          article: { ...confirmado, classification: classificacao },
          siloVersions: Object.values(acceptedSiloDnas),
        });
        if (!materializado.ok) {
          showNotification("warning", `Um artigo não pôde ser concluído: ${materializado.reason}`);
          continue;
        }
        const payload = materializado.payload;
        // Reconfirmar não é criar de novo: se este agrupamento já virou
        // ArticleDNA, a nova decisão SUCEDE a versão vigente. Mandar sempre
        // "versão 1" faria toda reconfirmação colidir com o que já existe.
        const vigente = acceptedArticleDnas[articleId];
        const version = await createVersionEnvelope({
          entityId: articleId,
          versionNumber: (vigente?.versionNumber || 0) + 1,
          previousVersionId: vigente?.versionId || null,
          origin: "human",
          changeReason: vigente
            ? "Formação concluída novamente: composição revisada e ArticleDNA aprovado."
            : "Formação concluída: ArticleDNA materializado e aprovado na mesma decisão.",
          createdBy: actorId,
          payload,
        });
        const persistido = await persistArquitetoArtifact({
          brandId: selectedBrandId,
          artifactType: "article_dna",
          action: vigente ? "edit" : "create",
          version,
          status: "approved",
        });
        // Conteúdo idêntico volta como UNCHANGED: nada mudou, e contar isso
        // como artigo novo inflaria o resultado da confirmação.
        if (persistido.persistence === "UNCHANGED") continue;
        const canonico = persistido.version as VersionEnvelope<ArticleDNA>;
        aprovacoes.push(createStatusEvent(canonico.versionId, "approved", actorId,
          "Formação concluída: a decisão humana da fase Artigos aprova o ArticleDNA."));
        criados.push({
          candidateRef: aprovado.candidateRef,
          keywordIds: aprovado.keywordIds,
          articleId,
          // O que o remoto TEM que devolver. Sem guardar isso a conclusão
          // anunciaria sucesso comparando o cenário consigo mesmo.
          expectation: {
            articleId,
            territoryRef: aprovado.siloRef,
            principalKeywordId: payload.principalKeywordId,
            secondaryKeywordIds: payload.secondaryKeywordIds,
            narrativeReinforcementIds: payload.narrativeReinforcementIds,
            slug: payload.suggestedSlug ?? null,
            versionNumber: version.versionNumber,
            contentHash: version.contentHash,
          } satisfies MaterializedArticleExpectation,
        });
      } catch (error) {
        // Uma falha não derruba o lote: o writer não é transacional, e parar
        // aqui deixaria o que já foi criado sem contabilidade.
        showNotification("warning", error instanceof Error
          ? `Um artigo não pôde ser criado: ${error.message}`
          : "Um artigo não pôde ser criado.");
      }
    }
    if (aprovacoes.length) addVersionEvents(aprovacoes);
    return criados;
  }, [selectedBrandId, sessionStatus, session?.user?.id, masterList, acceptedArticleDnas, addVersionEvents, showNotification]);

  /**
   * Confirmar formação — registra a decisão humana sobre o agrupamento.
   *
   * NÃO cria ArticleDNA: a materialização continua sendo ação explícita
   * depois. Candidato com conflito não é confirmado às cegas — fica pendente.
   */
  /**
   * FECHAR A FASE ALCANÇA O QUE JÁ ESTAVA ABERTO.
   *
   * Os ArticleDNA aprovados ANTES deste contrato declaram território e não
   * declaram `siloId` — e por isso Links, Radar e o servidor tinham de deduzir
   * o pai cada um por sua conta. Confirmar a fase Artigos passa a fechá-los
   * também, criando SUCESSORAS.
   *
   * Sucessora, nunca overwrite: `previousVersionId` e `versionNumber + 1`. A
   * versão anterior continua no acervo — foi ela que o humano aprovou, e
   * apagá-la reescreveria a história da decisão.
   *
   * O payload muda em UM campo. Nada de composição, hierarquia, slug ou
   * decisão é reeditado: materializar a referência do pai não é oportunidade
   * de mexer no artigo. O status permanece `approved` porque a aprovação já
   * aconteceu; isto não é uma segunda aprovação, é o registro do pai que a
   * fase deveria ter gravado.
   */
  const materializeLegacyArticleSiloIds = useCallback(async () => {
    if (!selectedBrandId) return { materialized: 0, blocked: [] as string[] };
    const actorId = authenticatedArchitectActor({ sessionStatus, actorUserId: session?.user?.id, brandId: selectedBrandId });
    if (!actorId) return { materialized: 0, blocked: [] as string[] };

    const siloVersions = Object.values(acceptedSiloDnas);
    const eventos: ReturnType<typeof createStatusEvent>[] = [];
    const bloqueados: string[] = [];
    let materializados = 0;

    for (const vigente of Object.values(acceptedArticleDnas)) {
      // Só o que está aprovado e ainda incompleto. Rascunho não é dívida, e
      // artigo já conforme não precisa de versão nova.
      if (effectiveVersionStatus(vigente.versionId, versionEvents) !== "approved") continue;
      const contrato = readArticleSiloContract(vigente.payload);
      const semClassificacao = !vigente.payload.classification;
      if (contrato.state === "CURRENT" && !semClassificacao) continue;

      const materializado = materializeArticleSiloId({ article: vigente.payload, siloVersions });
      if (!materializado.ok) {
        bloqueados.push(`${vigente.payload.suggestedSlug || vigente.payload.articleId}: ${materializado.reason}`);
        continue;
      }

      /*
       * FECHAR O RETRATO TAMBÉM É FECHAR AS CLASSIFICAÇÕES.
       *
       * Os ArticleDNA aprovados antes deste contrato não têm o objeto: a tela
       * mostrava "Pendente" e "Não recebido" porque não havia o que ler. Isso
       * não é incerteza — é ausência de registro, e o retrato de um artigo
       * aprovado não pode ter campo em branco.
       *
       * Se a regra devolve a decisão ao humano (KGR fora do pleno com
       * aplicabilidade Aplicável), NÃO se escolhe por ele: o artigo é listado
       * e segue como está, para a fase Artigos resolver com gente.
       */
      let classificacao = vigente.payload.classification;
      if (semClassificacao) {
        const keywordIds = vigente.payload.keywordReferences.map(referencia => referencia.keywordId);
        const keywords = keywordIds
          .map(id => masterList.find(item => String(item.id) === id))
          .filter((item): item is (typeof masterList)[number] => Boolean(item));
        const registro = remoteArticleSerp.find(item => item.candidateRef === vigente.payload.articleId)?.payload;
        const gate = articleSerpGates.get(vigente.payload.articleId);
        const evidenciaLegado = classificationEvidenceFor({
          principalKeywordId: vigente.payload.principalKeywordId,
          keywordIds,
          serpInterpretation: registro?.interpretation ?? null,
          serpResolved: serpWasExecutedFor(gate?.state || "missing"),
          kgr: readArticleKgrDecision({
            kgrIdentity: vigente.payload.kgrIdentity,
            principal: keywords.find(item => String(item.id) === vigente.payload.principalKeywordId),
            principalKeywordId: vigente.payload.principalKeywordId,
            supports: keywords.filter(item => String(item.id) !== vigente.payload.principalKeywordId),
          }),
          isPublished: Boolean(vigente.payload.publishedIdentityRef),
          principalProtected: keywords.find(item => String(item.id) === vigente.payload.principalKeywordId)?.primaryKeywordPolicy === "locked",
        });
        const abertas = unresolvedClassifications(evidenciaLegado);
        if (abertas.length) {
          bloqueados.push(`${vigente.payload.suggestedSlug || vigente.payload.articleId}: ${unresolvedClassificationMessage(abertas)}`);
          continue;
        }
        classificacao = resolveArticleClassification(evidenciaLegado);
      }

      if (!materializado.changed && !semClassificacao) continue;

      try {
        const sucessora = await createVersionEnvelope({
          entityId: vigente.entityId,
          versionNumber: vigente.versionNumber + 1,
          previousVersionId: vigente.versionId,
          origin: "human",
          changeReason: semClassificacao
            ? "Fase Artigos encerrada: Silo canônico e classificações terminais materializados, composição preservada."
            : "Fase Artigos encerrada: Silo canônico materializado no ArticleDNA, composição preservada.",
          createdBy: actorId,
          payload: { ...materializado.payload, classification: classificacao },
        });
        const persistido = await persistArquitetoArtifact({
          brandId: selectedBrandId,
          artifactType: "article_dna",
          action: "edit",
          version: sucessora,
          status: "approved",
        });
        if (persistido.persistence === "UNCHANGED") continue;
        const canonico = persistido.version as VersionEnvelope<ArticleDNA>;
        setAcceptedArticleDnas(previous => ({ ...previous, [canonico.payload.articleId]: canonico }));
        eventos.push(createStatusEvent(canonico.versionId, "approved", actorId,
          "Sucessora com Silo canônico: a fase Artigos fecha o vínculo em vez de deixá-lo para a fase seguinte."));
        materializados += 1;
      } catch (error) {
        bloqueados.push(error instanceof Error ? error.message : "Uma sucessora não pôde ser gravada.");
      }
    }

    if (eventos.length) addVersionEvents(eventos);
    return { materialized: materializados, blocked: bloqueados };
  }, [acceptedArticleDnas, acceptedSiloDnas, addVersionEvents, articleSerpGates, classificationEvidenceFor, masterList, remoteArticleSerp, selectedBrandId, session?.user?.id, sessionStatus, versionEvents]);

  const confirmArticleFormation = useCallback(async () => {
    if (!selectedBrandId || !articleFormationMarker) return;
    const escopo = assertSelectionScope(selectedCandidateRefs);
    if (!escopo.ok) {
      showNotification("error", escopo.reason);
      return;
    }
    setFormationBusy(true);
    try {
      /**
       * Aqui a formação vira ArticleDNA.
       *
       * O plano decide quem entra: conflito declarado, slug recusado pelo
       * validador ou colisão com publicado NÃO entram. Confirmação parcial é o
       * caso normal — o pronto passa, o resto continua candidato.
       */
      // O plano decide sobre os SELECIONADOS. Um Article não selecionado com
      // pendência não entra e, por isso, não barra quem está pronto.
      const plano = buildArticleFormationConfirmationPlan({ universes: selectedFormationUniverses });
      const sintese = summarizeConfirmationPlan(plano);

      /**
       * §14 — a portaria roda ANTES de qualquer escrita.
       *
       * O plano decide caso a caso; a portaria olha o lote. Uma busca em dois
       * artigos ou uma composição que atravessa Silos não é caso duvidoso que
       * possa esperar: gravar ArticleDNA em cima disso carimbaria a
       * contradição no acervo canônico.
       */
      const portaria = validateFormationConclusion({
        universes: selectedFormationUniverses,
        plan: plano,
        keywordSiloRef: new Map(masterList.map(keyword => [
          String(keyword.id),
          typeof keyword.territoryRef === "string" ? keyword.territoryRef : null,
        ])),
        ceiling: MAX_ARTICLE_KEYWORDS,
        unresolvedClassifications: unresolvedClassificationsByCandidate,
        serpGates: articleSerpGates,
      });
      setConclusionGates(portaria.gates);
      if (!portaria.ok) {
        const impeditivos = portaria.gates.filter(gate => !gate.ok).map(gate => gate.detail);
        showNotification("error", impeditivos.length
          ? `A formação não foi concluída: ${impeditivos.join(" ")}`
          : "A formação não foi concluída: nenhum artigo do cenário está pronto para virar ArticleDNA.");
        return;
      }

      const criados = await materializeApprovedArticleDnas(plano.approved);

      /*
       * Confirmar fecha a fase INTEIRA — inclusive o que ficou aberto atrás.
       *
       * Sem isto, artigos aprovados antes do contrato seguiriam sem `siloId` e
       * a fase Links receberia de novo um lote pela metade.
       */
      const legado = await materializeLegacyArticleSiloIds();
      if (legado.blocked.length) {
        showNotification("warning", `${legado.blocked.length} artigo(s) sem Silo canônico materializado: ${legado.blocked.join(" · ")}`);
      }

      /**
       * §6 — o remoto é quem diz se a formação foi concluída.
       *
       * A escrita não é transacional e o payload passa por um adapter que
       * recalcula campos derivados. Anunciar sucesso pelo POST que não lançou
       * exceção deixaria a mesa exibindo "Article formado" sobre uma composição
       * que talvez não seja a aprovada — e o F5, que reconstrói do remoto,
       * mostraria outra coisa.
       */
      const canonical = criados.length ? await loadCanonicalArquitetoWorkspace(selectedBrandId) : null;
      const observados = new Map((canonical?.articleDnas || [])
        .map(version => [String(version.payload.articleId), observedFromArticleDna(version)] as const));
      const leitura = readbackMaterializedArticles({
        expectations: criados.map(item => item.expectation),
        observedByArticleId: observados,
      });
      setMaterializationReadback(criados.length ? leitura : null);
      if (criados.length) setCanonicalWorkspaceReload(current => current + 1);

      const confirmados = new Set(leitura.confirmed.map(item => item.articleId));
      const criadosConfirmados = criados.filter(item => confirmados.has(item.articleId));

      const prontos = plano.approved;
      const pendentes = plano.blocked.length;
      const cobertas = criadosConfirmados.reduce((total, item) => total + item.keywordIds.length, 0);
      const completa = prontos.length > 0
        && pendentes === 0
        && criadosConfirmados.length === prontos.length
        && leitura.rejected.length === 0;

      const marcador = await persistArticleFormationMarker(selectedBrandId, {
        contractVersion: ARTICLE_FORMATION_MARKER_CONTRACT_VERSION,
        baseHash: articleFormationBase,
        processedAt: articleFormationMarker.processedAt,
        confirmation: {
          // O marcador guarda o que o REMOTO confirmou. Guardar o que foi
          // enviado faria o F5 reconstruir a mesa a partir de uma contagem
          // que o acervo canônico nunca chegou a ter.
          status: completa ? "confirmed" : criadosConfirmados.length ? "partial" : "refused",
          confirmedAt: new Date().toISOString(),
          confirmedArticleCount: criadosConfirmados.length,
          coveredKeywordCount: cobertas,
          pendingSiloCount: pendentes,
          failedCount: prontos.length - criadosConfirmados.length,
        },
      });
      setArticleFormationMarker(marcador);

      const partes = [
        `${criadosConfirmados.length} ArticleDNA confirmados no readback`,
        `${cobertas} keyword(s) cobertas`,
        sintese.reinforcements ? `${sintese.reinforcements} possível(is) reforço(s) de artigo publicado` : null,
        sintese.slugBlocked ? `${sintese.slugBlocked} com endereço bloqueado` : null,
        sintese.needsReview ? `${sintese.needsReview} precisam de revisão` : null,
      ].filter(Boolean).join(" · ");

      // Divergência no readback não é aviso decorativo: é o remoto dizendo
      // que o que está gravado não é o que foi aprovado.
      if (leitura.rejected.length) {
        showNotification("error", `${leitura.summary} ${partes}`);
        return;
      }
      showNotification("success", `${completa ? "Formação concluída." : "Formação aplicada parcialmente."} ${partes}`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "A formação não pôde ser confirmada.");
    } finally {
      setFormationBusy(false);
    }
  }, [selectedBrandId, articleFormationMarker, articleFormationUniverses, articleFormationBase, articleSerpGates, unresolvedClassificationsByCandidate, materializeApprovedArticleDnas, materializeLegacyArticleSiloIds, masterList, showNotification]);


  /**
   * Processar arquitetura — uma ação, os motores por dentro.
   *
   * Orquestra o que já existe: universo → clusters → comparação com o
   * patrimônio → SERP apenas onde há dúvida. Nada de membership ou confirmação
   * muda aqui: o resultado é PROPOSTA.
   */
  const processArchitecture = async () => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca ativa."); return; }
    if (!masterList.length) { showNotification("error", "Importe as keywords do Minerador antes de processar a arquitetura."); return; }

    setArchitectureBusy(true);
    try {
      // A SERP entra só nas dúvidas que a exigem; varrer o lote inteiro seria
      // gastar consulta onde não há pergunta.
      const pendentes = territorialSerpQuestions.filter(question => {
        const gravado = territorialSerpBaseHashes.get(question.questionId);
        return !gravado || gravado !== territorialSerpBaseHash(territorialSerpBaseOf(question));
      });
      if (pendentes.length) await validateTerritorialSerp();

      // O fato "este cenário foi processado" é remoto: sem isso o F5 perde
      // o que o humano mandou fazer, e a análise reaparece como inexistente.
      const marcador = await persistArchitectureMarker(selectedBrandId, {
        contractVersion: ARCHITECTURE_MARKER_CONTRACT_VERSION,
        baseHash: architectureAnalysis.baseHash,
        processedAt: new Date().toISOString(),
        confirmation: {
          status: "none", confirmedAt: null, appliedMembershipCount: 0,
          confirmedSiloCount: 0, pendingSiloCount: 0, failedCount: 0,
        },
      });
      setArchitectureMarker(marcador);
      const resumo = architectureAnalysis.summary;
      showNotification("success",
        `Análise concluída: ${resumo.clusters} grupo(s) · ${resumo.strengthening} fortalece(m) silo existente · ${resumo.newSilos} novo(s) recomendado(s) · ${resumo.insufficient} sem profundidade. Nada foi aplicado.`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível processar a arquitetura.");
    } finally {
      setArchitectureBusy(false);
    }
  };

  /**
   * Confirmar arquitetura — uma vez, para o cenário revisado.
   *
   * Traduz o plano nos writers canônicos existentes, com lock e readback por
   * item. Silo com bloqueio fica de fora com o motivo: confirmação em lote não
   * atropela a prontidão de ninguém.
   */
  const confirmArchitecture = async () => {
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca ativa."); return; }
    const readiness = new Map(territorialSurface.landscape.candidateTerritories.map(territory => {
      const resultado = resolveTerritoryConfirmationReadiness({ territory, report: territorialSurface.landscape.consistency });
      return [territory.territoryRef, {
        ready: resultado.state === "ready",
        blockers: resultado.blockers.map(blocker => blocker.detail || blocker.code),
        label: territory.name || territory.centralEntity || "Silo sem nome",
      }];
    }));
    const plan = buildArchitectureConfirmationPlan({
      analysis: architectureAnalysis,
      readiness,
      candidateTerritoryRefs: new Set(territorialSurface.landscape.candidateTerritories.map(item => item.territoryRef)),
    });
    if (!plan.confirmTerritoryRefs.length && !plan.assignments.length) {
      showNotification("error", plan.skipped.length
        ? `Nenhum silo está pronto. ${plan.skipped[0].label}: ${plan.skipped[0].blockers.join(" ")}`
        : "Nada a confirmar no cenário atual.");
      return;
    }

    /*
     * SILOS NÃO DESMONTA ARTICLE APROVADO EM SILÊNCIO.
     *
     * Uma confirmação de arquitetura já moveu duas das três buscas de um
     * ArticleDNA aprovado para outro território. O artefato seguiu intacto no
     * acervo, mas sumiu da tela: o agrupamento corrente só projeta keywords de
     * territórios confirmados, e as dele passaram a viver em dois lugares.
     *
     * Silos continua podendo mudar a arquitetura. O que ele não pode é fazer
     * isso sem dizer quem perde o quê — a decisão precisa ser informada, e o
     * Article impactado precisa entrar em revisão em vez de desaparecer.
     */
    const impactoEstrutural = resolveTerritoryChangeImpact({
      proposals: plan.assignments.map(assignment => ({ keywordId: assignment.keywordId, territoryRef: assignment.territoryRef })),
      // O preview precisa do lote inteiro: dizer só "1 Article afetado"
      // esconderia para onde o resto está indo — foi assim que uma migração
      // inteira passou despercebida.
      approvedArticles: Object.values(acceptedArticleDnas)
        .filter(version => effectiveVersionStatus(version.versionId, versionEvents) === "approved"),
      territoryByKeywordId: new Map(masterList.map(keyword => [
        String(keyword.id),
        typeof keyword.territoryRef === "string" ? keyword.territoryRef : null,
      ])),
      labelByKeywordId: new Map(masterList.map(keyword => [String(keyword.id), String(keyword.keyword || keyword.id)])),
    });

    /*
     * QUEBRA DE ESTRUTURA APROVADA É BLOQUEIO, NÃO AVISO.
     *
     * "Confirme novamente para aplicar mesmo assim" convidava a criar
     * conscientemente o estado inconsistente que já custou uma investigação
     * inteira: o Article some da tela e não há jornada para revisá-lo.
     * Enquanto a revisão estrutural não existir, o caminho honesto é recusar.
     *
     * RESTAURAÇÃO é outra coisa. Devolver buscas ao território do Article
     * reaproxima a membership do DNA aprovado; proibi-la pelo mesmo motivo que
     * proíbe a quebra tornaria o estrago permanente. Ela passa, com preview.
     */
    /*
     * Bloqueio cobre DUAS coisas: quebra de estrutura aprovada e restauração
     * pela metade. A segunda não é destrutiva, mas deixaria o Article
     * divergente entre um clique e outro — estado que ninguém pediu e que só
     * existe porque o lote foi aplicado parcialmente.
     */
    if (impactoEstrutural.blocked.length) {
      showNotification("error", impactoEstrutural.summary);
      setArchitectureImpactAck(impactoEstrutural);
      return;
    }
    if (!impactoEstrutural.clean && !architectureImpactAck) {
      // Restauração ainda pede olho humano: o primeiro clique mostra o efeito.
      setArchitectureImpactAck(impactoEstrutural);
      showNotification("warning", `${impactoEstrutural.summary} Confirme novamente para aplicar.`);
      return;
    }
    setArchitectureImpactAck(null);

    setArchitectureBusy(true);
    const aplicadas: string[] = [];
    const falhas: string[] = [];
    try {
      // Sem atomicidade real no writer: cada item vai com lock e readback, e o
      // parcial é declarado em vez de anunciado como sucesso.
      for (const assignment of plan.assignments) {
        try {
          await applySiloDecision(assignment.keywordId, { kind: "territory", territoryRef: assignment.territoryRef });
          aplicadas.push(assignment.keywordId);
        } catch { falhas.push(assignment.keywordId); }
      }
      for (const territoryRef of plan.confirmTerritoryRefs) {
        try {
          await confirmSiloCandidate(territoryRef);
          aplicadas.push(territoryRef);
        } catch {
          // O identificador técnico não vai para a tela: quem falha é o Silo,
          // e é pelo nome dele que a pessoa reconhece o caso.
          falhas.push(territoryRef);
        }
      }
      const associacoes = aplicadas.filter(item => !plan.confirmTerritoryRefs.includes(item)).length;
      const silosConfirmados = aplicadas.filter(item => plan.confirmTerritoryRefs.includes(item)).length;
      // Silo bloqueado é PENDENTE, não falha: ele nem foi enviado ao writer.
      // "Confirmada" só quando não sobrou pendência nem falha.
      const completa = !falhas.length && !plan.skipped.length;
      setConfirmedArchitecture({ silos: silosConfirmados, keywords: associacoes, pending: plan.skipped.length });

      const marcador = await persistArchitectureMarker(selectedBrandId, {
        contractVersion: ARCHITECTURE_MARKER_CONTRACT_VERSION,
        baseHash: architectureAnalysis.baseHash,
        processedAt: architectureMarker?.processedAt || new Date().toISOString(),
        confirmation: {
          status: completa ? "confirmed" : (associacoes || silosConfirmados) ? "partial" : "refused",
          confirmedAt: new Date().toISOString(),
          appliedMembershipCount: associacoes,
          confirmedSiloCount: silosConfirmados,
          pendingSiloCount: plan.skipped.length,
          failedCount: falhas.length,
        },
      });
      setArchitectureMarker(marcador);

      const partes = [
        `${associacoes} associação(ões) confirmada(s)`,
        silosConfirmados ? `${silosConfirmados} Silo(s) confirmado(s)` : null,
        plan.skipped.length ? `${plan.skipped.length} Silo(s) continuam pendentes e não foram alterados` : null,
        falhas.length ? `${falhas.length} escrita(s) falharam` : null,
      ].filter(Boolean).join(" · ");
      showNotification(falhas.length ? "error" : "success",
        `${completa ? "Arquitetura confirmada." : "Arquitetura aplicada parcialmente."} ${partes}`);
    } finally {
      setArchitectureBusy(false);
      setCanonicalWorkspaceReload(current => current + 1);
    }
  };

  /** Leitura dos quatro motores; informação, não etapa clicável. */
  const architectureProcessChips = useMemo(() => {
    const serpVigentes = territorialReviewViews.filter(view => view.serp.presence === "current").length;
    const aiVigentes = territorialReviewViews.filter(view => view.ai.presence === "current").length;
    const conflitos = territorialReviewViews.filter(view => view.status === "conflict").length;
    const total = territorialReviewViews.length;
    return [
      { label: "Lógica", detail: territorialSurface.logic.hypotheses.length ? "concluída" : "sem hipótese no lote", tone: (territorialSurface.logic.hypotheses.length ? "ok" : "idle") as "ok" | "warn" | "idle" },
      { label: "SERP", detail: `${serpVigentes}/${total} vigente(s)`, tone: (serpVigentes >= total && total ? "ok" : serpVigentes ? "warn" : "idle") as "ok" | "warn" | "idle" },
      { label: "IA", detail: `${aiVigentes}/${total} vigente(s) · opcional`, tone: (aiVigentes ? "ok" : "idle") as "ok" | "warn" | "idle" },
      { label: "Revisão", detail: conflitos ? `${conflitos} conflito(s)` : "sem conflito", tone: (conflitos ? "warn" : "ok") as "ok" | "warn" | "idle" },
    ];
  }, [territorialReviewViews, territorialSurface]);

  /** Grupo em foco no painel. O primeiro do lote enquanto o canvas de

  /** Mapa da análise: Silo/Cluster no centro, keywords em órbita. */
  const architectureFlow = useMemo(() => buildArchitectureFlowProjection({
    analysis: architectureAnalysis,
    keywordTexts: new Map(masterList.map(keyword => [String(keyword.id), String(keyword.keyword || "")])),
    territoryLabels: new Map([...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories]
      .map(territory => [territory.territoryRef, {
        label: territory.name || territory.centralEntity || "Silo sem nome",
        slug: territory.slugState.publishedSlug || territory.slugState.confirmed,
      }])),
    publishedTerritoryRefs: new Set([...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories]
      .filter(territory => territory.publicationProtection === "protected")
      .map(territory => territory.territoryRef)),
    confirmedMembership: new Map(masterList
      .filter(keyword => typeof keyword.territoryRef === "string")
      .map(keyword => [String(keyword.id), String(keyword.territoryRef)])),
    expandedClusterRefs,
  }), [architectureAnalysis, masterList, territorialSurface, expandedClusterRefs]);

  /** Grupo em foco no painel: quem manda é a seleção feita no mapa. */
  const selectedClusterAnalysis = useMemo(() => {
    const clusterRef = clusterRefOfFlowNode(architectureFlow, mapState.selectedNodeId);
    return architectureAnalysis.clusters.find(cluster => cluster.clusterRef === clusterRef)
      ?? architectureAnalysis.clusters[0] ?? null;
  }, [architectureAnalysis, architectureFlow, mapState.selectedNodeId]);

  const processState = useMemo<Record<ArchitectProcess, { state: ArchitectProcessState; onClick?: () => void; disabled?: boolean; title?: string; progress?: string }>>(() => {
    const logicState: ArchitectProcessState = workspaceMode === "links"
      ? "blocked"
      : activeLogicalTask
        ? "processing"
        : workspaceMode === "silos"
          ? siloWorkingCopies.length ? "completed" : territorialAvailability.logic === "available" ? "available" : "blocked"
          : articlePhaseProcessStates.logic;
    // A SERP da aba Silos tem ciclo próprio: pergunta em aberto, processando,
    // concluída ou parcial. "Bloqueado" só quando não há dúvida a responder.
    // Parecer que validava OUTRA arquitetura fica desatualizado — e continua
    // legível. Só a mudança do próprio input invalida a SERP; rodar Lógica ou
    // IA não mexe aqui.
    const serpVigentes = territorialSerpQuestions.filter(question => {
      const gravado = territorialSerpBaseHashes.get(question.questionId);
      if (!gravado) return false;
      return gravado === territorialSerpBaseHash(territorialSerpBaseOf(question));
    }).length;
    const serpDesatualizados = territorialSerpAssessments.length - serpVigentes;
    const serpState: ArchitectProcessState = workspaceMode === "links"
      ? "blocked"
      : workspaceMode === "silos"
        ? territorialSerpBusy
          ? "processing"
          : !territorialSerpQuestions.length
            ? "blocked"
            : serpVigentes >= territorialSerpQuestions.length
              ? "completed"
              : serpVigentes || serpDesatualizados > 0
                ? "partial"
                : "available"
        : articlePhaseProcessStates.serp;
    // A IA da aba Silos acompanha a dúvida: proposta vigente por pergunta,
    // desatualizada quando o que ela analisou mudou.
    const aiVigentes = territorialSerpQuestions.filter(question => {
      const gravado = territorialAiBaseHashes.get(question.questionId);
      return Boolean(gravado) && gravado === territorialAiBaseHashOf(question);
    }).length;
    const aiDesatualizados = territorialAiProposals.length - aiVigentes;
    const aiState: ArchitectProcessState = workspaceMode === "links"
      ? "blocked"
      : workspaceMode === "silos"
        ? territorialAiBusy
          ? "processing"
          : !territorialAiAvailability.ready.length && !territorialAiProposals.length
            ? "blocked"
            : aiVigentes >= territorialSerpQuestions.length && territorialSerpQuestions.length > 0
              ? "completed"
              : aiVigentes || aiDesatualizados > 0
                ? "partial"
                : "available"
        : articlePhaseProcessStates.ai;
    const reviewState: ArchitectProcessState = workspaceMode === "links"
      ? linksLoading ? "processing" : linksWorkingCopy ? (linksIsDirty ? "pending" : "available") : linksApprovedGraph ? "completed" : "available"
      : workspaceMode === "silos"
        // A Revisão da aba Silos é a leitura comparativa: existe enquanto
        // houver silo para revisar, e sinaliza conflito e pendência.
        ? siloConsolidating
          ? "processing"
          : !territorialReviewViews.length
            ? "blocked"
            : territorialReviewViews.some(view => view.status === "conflict")
              ? "partial"
              : territorialReviewViews.every(view => view.status === "decision_recorded")
                ? "completed"
                : "pending"
        : articlePhaseProcessStates.review;
    return {
      logic: { state: logicState, onClick: workspaceMode === "articles" ? () => topbarHandlersRef.current.processDeterministicStructure() : workspaceMode === "silos" ? () => siloHandlersRef.current.formSilosWorkingCopy() : undefined, disabled: workspaceMode === "articles" ? masterList.length === 0 || selectedArticleIds.size === 0 || generatingStrategic : workspaceMode === "silos" ? territorialAvailability.logic !== "available" || generatingStrategic : true, title: workspaceMode === "silos" ? territorialAvailability.blockedReason || "Analisar a estrutura de silos e formar a working copy provisória dos Silos" : selectedArticleIds.size ? "Processar lógica somente nos artigos selecionados" : "Selecione um ou mais artigos para processar" },
      // SERP e IA territoriais não existem nesta rodada; dizer isso é mais
      // honesto do que oferecer a SERP de Article como se decidisse território.
      serp: {
        state: serpState,
        onClick: workspaceMode === "articles" ? handleValidateSerp : workspaceMode === "silos" ? () => { void siloHandlersRef.current.validateTerritorialSerp(); } : undefined,
        disabled: workspaceMode === "silos"
          ? territorialSerpBusy || !territorialSerpQuestions.length || !selectedBrandId
          : workspaceMode !== "articles" || selectedArticleIds.size === 0 || generatingStrategic || serpBusy,
        // O motivo funcional substitui o "Bloqueado" mudo.
        title: workspaceMode === "silos"
          ? territorialSerpBlockedReason({ questions: territorialSerpQuestions, hasBrand: Boolean(selectedBrandId) })
            || `Validar SERP de ${territorialSerpQuestions.length} dúvida(s) arquitetural(is). A SERP é evidência; a decisão continua humana.`
          : "Validar SERP diretamente; a planilha permanece visível",
        progress: workspaceMode === "silos"
          ? serpDesatualizados > 0
            ? `${serpVigentes}/${territorialSerpQuestions.length} · ${serpDesatualizados} desatualizado(s)`
            : serpVigentes
              ? `${serpVigentes}/${territorialSerpQuestions.length}`
              : territorialSerpQuestions.length ? `${territorialSerpQuestions.length} pendente(s)` : undefined
          : serpProgress,
      },
      ai: {
        state: aiState,
        onClick: workspaceMode === "articles" ? handleRevalidateStructure : workspaceMode === "silos" ? () => { void siloHandlersRef.current.reviewTerritorialWithAi(); } : undefined,
        disabled: workspaceMode === "silos"
          ? territorialAiBusy || !territorialAiAvailability.ready.length || !selectedBrandId
          : workspaceMode === "articles" ? selectedArticleIds.size === 0 || generatingStrategic : true,
        // Motivo funcional: dizer o que falta, não apenas que está bloqueado.
        title: workspaceMode === "silos"
          ? territorialAiAvailability.ready.length
            ? `Revisar ${territorialAiAvailability.ready.length} dúvida(s) com IA. A proposta é reversível; a decisão continua humana.`
            : territorialAiAvailability.awaiting[0]?.reason || "Nenhuma dúvida arquitetural aguarda revisão com IA."
          : "Revisar com IA a working copy",
        progress: workspaceMode === "silos"
          ? aiDesatualizados > 0
            ? `${aiVigentes}/${territorialSerpQuestions.length} · ${aiDesatualizados} desatualizada(s)`
            : aiVigentes
              ? `${aiVigentes}/${territorialSerpQuestions.length}`
              : territorialAiAvailability.awaiting.length
                ? `${territorialAiAvailability.ready.length} disponível(is) · ${territorialAiAvailability.awaiting.length} aguardando SERP`
                : undefined
          : undefined,
      },
      review: {
        state: reviewState,
        onClick: workspaceMode === "links" ? () => setMapExpanded(true) : workspaceMode === "articles" ? () => void confirmSelectedArchitectures() : undefined,
        disabled: workspaceMode === "silos"
          ? !territorialReviewViews.length
          : workspaceMode === "articles" ? selectedArticleIds.size === 0 || generatingStrategic : linksLoading,
        title: workspaceMode === "silos"
          ? territorialReviewViews.length
            ? `Revisar ${territorialReviewViews.length} silo(s): Atual, Lógica, SERP e IA lado a lado. A decisão é humana.`
            : "Nenhum silo para revisar ainda."
          : workspaceMode === "links" ? "Abrir a revisão humana do InternalLinkGraph" : "Confirmar a arquitetura após revisão humana",
      },
    };
  }, [acceptedSiloDnas, activeLogicalTask, articlePhaseProcessStates, confirmSelectedArchitectures, generatingStrategic, handleRevalidateStructure, handleValidateSerp, linksApprovedGraph, linksIsDirty, linksLoading, linksWorkingCopy, pendingSiloReview, selectedArticleIds.size, serpProgress, siloConsolidating, siloReviewBusy, siloWorkingCopies.length, territorialAvailability, workspaceMode]);
  const contextSummary = workspaceMode === "articles"
    ? activeProcess === "logic"
      ? activeLogicalTask ? `${activeLogicalTask.message || "Processando grupos"} · ${activeLogicalTask.current ?? 0}/${activeLogicalTask.total ?? masterList.length}` : [`${ungroupedArticleKeywords.length} keyword(s) sem grupo`, `${siloCandidateKeywords.length} candidata(s) a Silo reservada(s)`, `${articlePipeline.counts.eligible} elegível(is)`, `${articlePipeline.counts.awaiting_silo_confirmation} aguardando confirmação do Silo`, `${articlePipeline.counts.awaiting_silo} aguardando definição de Silo`, `${articlePipeline.counts.reserved_silo_head} reservada(s) para a página do Silo`].join(" · ")
      : activeProcess === "serp"
        ? serpBusy ? `SERP em andamento · ${serpProgress || "consultas iniciadas"}` : `${serpAssessments.length} avaliação(ões) observacional(is) concluída(s) · ${serpConflictCount} conflito(s) registrado(s)`
        : activeProcess === "ai"
          ? activeKeywordReviewTask ? `${activeKeywordReviewTask.message || "Revisão de grupos"} · proposta ainda não aplicada` : pendingKeywordReview ? `${materialKeywordArticleDecisions(pendingKeywordReview.review, keywordId => masterList.find(item => String(item.id) === String(keywordId))?.reviewRole as ManualKeywordRole | undefined).length} proposta(s) gerada(s) · ${pendingKeywordReview.review.conflicts.length} conflito(s) · revisão humana pendente` : "Nenhuma proposta de IA pendente"
          : articlePhaseProcessStates.review === "completed" ? `${currentApprovedArticleDnaCount} ArticleDNA(s) aprovado(s) · pronto(s) para Silos; nenhum Silo é criado nesta etapa` : `${currentArticleDnaCount}/${currentArticleEntityIds.length} ArticleDNA(s) carregado(s) · ArticleDNA ainda não consolidado`
    : workspaceMode === "silos"
      // A bancada da aba Silos responde pela paisagem territorial, não por
      // working copy de Silo: contar só SiloDNA escondia a fase inteira.
      ? activeProcess === "ai" && pendingSiloReview
        ? `${pendingSiloReview.operations.length} operação(ões) de IA · aguardando decisão humana`
        : [
            `${territorialSurface.surface.counts.territories} Silos`,
            `${territorialSurface.surface.counts.structures} estruturas`,
            `${territorialSurface.surface.counts.unassigned} keywords sem Silo`,
            // Processamento em uma linha só: o detalhe por silo está na mesa.
            `Processamento: SERP ${territorialReviewViews.filter(view => view.serp.presence === "current").length} atual(is) · IA ${territorialReviewViews.filter(view => view.ai.presence === "current").length} atual(is) · Revisão ${territorialReviewViews.filter(view => view.status === "conflict").length} conflito(s)`,
            // Auditoria do site: nada é escondido sem contagem.
            ...(siteStructureReading.counts.observedUrls
              // Verificadas já foram: "não resolvida" mentia sobre o estado.
              ? [`Site: ${siteStructureReading.counts.observedUrls} URLs · ${siteStructureReading.counts.structural} estruturais · ${siteStructureReading.counts.technical} técnicas · ${siteStructureReading.counts.unresolved} sem papel estrutural identificado`]
              : []),
          ].join(" · ")
      : linksLoading
        ? "Carregando a working copy e a versão aprovada do InternalLinkGraph..."
        : linksWorkingCopy
          ? `${linksWorkingCopy.edges.length} relação(ões) na working copy · lock_version ${linksWorkingCopy.lockVersion}${linksIsDirty ? " · alterações locais não salvas" : " · readback confirmado"}`
          : linksApprovedGraph
            ? `Versão aprovada v${linksApprovedGraph.versionNumber} carregada · abra uma working copy sucessora para editar`
            : "Nenhuma versão do grafo carregada para o Silo selecionado";

  const architectureMapSnapshots: Record<ArchitectMapScenario, ArchitectMapSnapshot> = (() => {
    type MapKeywordSource = { id: string; keyword?: string | null; reviewRole?: ManualKeywordRole | null; siloCandidate?: { status?: string } | null };
    const unique = (items: string[]) => [...new Set(items.filter(item => item.trim().length > 0))];
    const roleFor = (keyword: MapKeywordSource, roles?: Record<string, string>) => {
      const role = roles?.[String(keyword.id)] || manualKeywordRoleFor(keyword);
      return role === "principal" || role === "reforco_narrativo" ? role : "secundaria";
    };
    const keywordFor = (keyword: MapKeywordSource, role: ArchitectMapArticle["keywords"][number]["role"]) => ({
      id: String(keyword.id),
      label: String(keyword.keyword || keyword.id),
      role,
    });
    const selectionIdForGroup = (group: ProvisionalArticleGroup) => {
      const groupIdentity = new Set([group.id, group.publishedAnchorId, ...group.keywordIds].filter(Boolean).map(String));
      return articlesList.find(article => {
        const articleIdentity = [
          article.id,
          article.workingArticleId,
          article.mainKeywordObj?.id,
          article.mainKeywordObj?.provisionalGroupId,
          article.mainKeywordObj?.clusterId,
          article.briefingId,
          ...article.supportKeywords.map(keyword => keyword.id),
        ].filter(Boolean).map(String);
        return articleIdentity.some(identity => groupIdentity.has(identity));
      })?.id || null;
    };
    const articleFromCurrent = (article: (typeof articlesList)[number]): ArchitectMapArticle => {
      const articleId = (article.isPublished ? article.mainKeywordObj?.id : article.mainKeywordObj?.provisionalGroupId || article.briefingId) || article.id;
      const assessment = latestActiveSerpFormationAssessment(serpAssessments, selectedBrandId || "", articleId);
      const keywords = [article.mainKeywordObj, ...article.supportKeywords]
        .filter(Boolean)
        .slice(0, 6)
        .map((keyword: MapKeywordSource) => keywordFor(keyword, roleFor(keyword, undefined)));
      return {
        id: articleId,
        selectionId: article.id,
        label: article.keywordPrincipal || articleId,
        keywords,
         siloLabel: workspaceMode === "articles" ? null : article.siloName || null,
        siloCandidate: Boolean(article.mainKeywordObj?.siloCandidate?.status === "candidate"),
        published: Boolean(article.isPublished),
        protected: Boolean(article.isPublished),
        conflicts: assessment?.conflicts || [],
      };
    };
    const currentArticles: ArchitectMapArticle[] = [
      ...filteredArticles.map(articleFromCurrent),
      ...siloCandidateKeywords.map(keyword => ({
        id: `candidate:${keyword.id}`,
        selectionId: null,
        label: keyword.keyword,
        keywords: [keywordFor(keyword, "unknown")],
        siloLabel: null,
        siloCandidate: true,
        published: false,
        protected: false,
        conflicts: [],
      })),
    ];
    const visibleArticleOrder = new Map(filteredArticles.map((article, index) => [article.id, index]));
    const sortMapArticles = (items: ArchitectMapArticle[]) => items
      .map((article, index) => ({ article, index }))
      .sort((left, right) => {
        const leftOrder = left.article.selectionId ? visibleArticleOrder.get(left.article.selectionId) : undefined;
        const rightOrder = right.article.selectionId ? visibleArticleOrder.get(right.article.selectionId) : undefined;
        if (leftOrder === undefined && rightOrder === undefined) return left.index - right.index;
        if (leftOrder === undefined) return 1;
        if (rightOrder === undefined) return -1;
        return leftOrder - rightOrder;
      })
      .map(entry => entry.article);
    const logicGroups = mapLogicGroupsSnapshot || provisionalGroups;
    const logicArticles: ArchitectMapArticle[] = sortMapArticles(logicGroups.map(group => ({
      id: group.publishedAnchorId || group.id,
      selectionId: selectionIdForGroup(group),
      label: group.keywords.find(keyword => keyword.id === group.principalSuggestion.keywordId)?.keyword || group.keywords[0]?.keyword || group.id,
      keywords: group.keywords.slice(0, 6).map(keyword => keywordFor(keyword, roleFor(keyword, group.roles))),
       siloLabel: workspaceMode === "articles" ? null : group.suggestedSiloName || null,
      siloCandidate: group.keywords.some(keyword => keyword.siloCandidate?.status === "candidate"),
      published: Boolean(group.publishedAnchorId),
      protected: Boolean(group.publishedAnchorId),
      conflicts: unique([...group.alerts, ...(group.groupingReasons || []).filter(reason => reason.kind === "conflict").map(reason => reason.message)]),
    })));
    const mapSilosFromWorkingCopies: ArchitectMapSilo[] = siloWorkingCopies.map(copy => ({
      id: copy.existingSiloId || copy.id,
      label: copy.name,
      slug: copy.slug || null,
      pillarArticleId: copy.pillarCandidateArticleId,
      supportArticleIds: [...copy.supportArticleIds],
      articleIds: copy.articleReferences.map(reference => reference.articleId),
      conflicts: [...copy.conflicts, ...copy.siloPage.collisionReasons],
      published: copy.publishedProtection.protected,
      source: copy.source === "existing" ? "Silo existente" : copy.source === "new_candidate" ? "Candidata reservada" : "Arquitetura insuficiente",
    }));
    const mapSilosFromCanonical: ArchitectMapSilo[] = Object.values(acceptedSiloDnas)
      .filter(version => !selectedBrandId || version.payload.brandId === selectedBrandId)
      .map(version => {
        const payload = version.payload;
        const page = acceptedSiloPages[`silo-page:${payload.siloId}`]?.payload;
        return {
          id: payload.siloId,
          label: payload.name || payload.centralEntity || payload.siloId,
          slug: page?.slug || null,
          pillarArticleId: payload.pillarArticleId,
          supportArticleIds: [...payload.supportArticleIds],
          articleIds: payload.articleReferences.map(reference => reference.articleId),
          conflicts: [...payload.possibleConflicts, ...(page?.alerts || [])],
          published: Boolean(page?.publicationStatus === "published"),
          source: "SiloDNA consolidado",
        };
      });
    const currentSilos = mapSilosFromWorkingCopies.length ? mapSilosFromWorkingCopies : mapSilosFromCanonical;
    const serpAssessmentsForMap = mapSerpAssessmentsSnapshot || serpAssessments;
    const serpArticleBase = mapSerpArticlesSnapshot || currentArticles;
    const serpArticles = sortMapArticles(serpArticleBase.map(article => {
      const assessment = latestActiveSerpFormationAssessment(serpAssessmentsForMap, selectedBrandId || "", article.id);
      return assessment ? { ...article, conflicts: unique([...article.conflicts, ...assessment.conflicts]) } : article;
    }));
    // Uma avaliação vigente por Article: versões superadas da SERP não podem
    // repetir o mesmo conflito no painel nem entrar como evidência atual.
    const latestSerpForMap = unique(serpArticleBase.map(article => article.id))
      .map(articleId => latestActiveSerpFormationAssessment(serpAssessmentsForMap, selectedBrandId || "", articleId))
      .filter((assessment): assessment is SerpFormationAssessment => Boolean(assessment));
    const serpChanges = unique(latestSerpForMap.flatMap(assessment => [
      ...assessment.recommendations.map(recommendation => `SERP ${recommendation.keywordId} · ${recommendation.action}`),
      ...assessment.conflicts.map(conflict => `SERP ${assessment.articleId} · conflito: ${conflict}`),
    ]));
    const logicChanges = unique(logicArticles.map(article => `Lógica ${article.id} · grupo provisório`));
    const aiChanges = unique([
      ...(mapAiKeywordReviewSnapshot?.review.decisions || pendingKeywordReview?.review.decisions || []).map(decision => `IA ${decision.keywordId} · ${decision.sourceGroupId} → ${decision.targetGroupId || decision.newArticleKey || "mantido"}`),
      ...(mapAiSiloReviewSnapshot?.operations || pendingSiloReview?.operations || []).map(operation => `IA ${operation.operationId} · ${operation.sourceSiloId} → ${operation.targetSiloId || operation.action}`),
    ]);
    const logicGains = logicArticles.length ? [`${logicArticles.length} grupo(s) provisório(s) com razões determinísticas`] : [];
    const logicLosses = siloCandidateKeywords.length ? [`${siloCandidateKeywords.length} candidata(s) a Silo continuam reservadas`] : [];
    const serpGains = unique(latestSerpForMap.filter(assessment => assessment.intentCompatibility === "coerente").map(assessment => `SERP compatível · ${assessment.articleId}`));
    const serpLosses = unique(latestSerpForMap.flatMap(assessment => assessment.conflicts.map(conflict => `${assessment.articleId}: ${conflict}`)));
    const aiGains = aiChanges.length ? [`${aiChanges.length} proposta(s) IA em diff reversível`] : [];
    const aiLosses = unique((mapAiKeywordReviewSnapshot?.review.conflicts || pendingKeywordReview?.review.conflicts || []).map(conflict => conflict.reason));
    // ── Canvas territorial (modo Silos)
    // Projeta a MESMA paisagem da mesa. Nada é fabricado: `territoryRef` entra
    // verbatim e os campos de Article ficam vazios porque território não tem
    // pilar nem apoio — inventar essa forma aqui seria Article-first de novo.
    const territorialSilos: ArchitectMapSilo[] = [
      ...territorialSurface.landscape.existingStructures.map(structure => ({
        id: structure.siloId,
        label: structure.name || structure.siloId,
        slug: null,
        pillarArticleId: null,
        supportArticleIds: [],
        articleIds: [],
        conflicts: [],
        published: structure.isPublished,
        source: `Estrutura existente · ${structure.sourceKind}`,
      })),
      ...[...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories].map(territory => ({
        id: territory.territoryRef,
        label: territory.name || territory.centralEntity || territory.territoryRef,
        slug: territory.slugState.confirmed ?? territory.slugState.proposals[0]?.slug ?? null,
        pillarArticleId: null,
        supportArticleIds: [],
        articleIds: [],
        conflicts: territory.conflicts.map(conflict => conflict.code),
        published: territory.publicationProtection === "protected",
        source: territory.lifecycleStatus === "confirmed" ? "Silo confirmado" : "Silo candidato",
      })),
    ];
    const territorialHypotheses = territorialSurface.logic.hypotheses;
    // A Lógica só posiciona em território que já existe; candidata a universo
    // novo e ambiguidade continuam fora, com o motivo declarado.
    const territorialPlaceable = territorialHypotheses.filter(hypothesis => hypothesis.state === "existing_silo_match");
    const territorialLogicSnapshot: ArchitectMapSnapshot = {
      articles: [],
      silos: territorialSilos,
      gains: territorialPlaceable.length ? [`${territorialPlaceable.length} keyword(s) com destino em silo existente`] : [],
      losses: territorialHypotheses.length - territorialPlaceable.length
        ? [`${territorialHypotheses.length - territorialPlaceable.length} hipótese(s) sem silo emitido; o identificador do silo é emitido pelo servidor`]
        : [],
      changes: territorialHypotheses.map(hypothesis => `Lógica ${hypothesis.keywordId} · ${hypothesis.state}`),
    };
    if (workspaceMode === "silos") {
      // Sem cenário de Article na aba Silos, e sem SERP/IA territoriais nesta
      // rodada: repetir "Atual" é mais honesto do que mostrar outra unidade.
      const territorialCurrent: ArchitectMapSnapshot = { articles: [], silos: territorialSilos, gains: [], losses: [], changes: [] };
      return { current: territorialCurrent, logic: territorialLogicSnapshot, serp: territorialCurrent, ai: territorialCurrent };
    }
    const current: ArchitectMapSnapshot = { articles: currentArticles, silos: currentSilos, gains: [], losses: [], changes: [] };
    const logic: ArchitectMapSnapshot = { articles: logicArticles.length ? logicArticles : currentArticles, silos: currentSilos, gains: logicGains, losses: logicLosses, changes: logicChanges };
    const serp: ArchitectMapSnapshot = { articles: serpArticles, silos: mapSerpSilosSnapshot || currentSilos, gains: serpGains, losses: serpLosses, changes: serpChanges };
    const ai: ArchitectMapSnapshot = { articles: mapAiArticlesSnapshot ? sortMapArticles(mapAiArticlesSnapshot) : currentArticles, silos: mapAiSilosSnapshot || currentSilos, gains: aiGains, losses: aiLosses, changes: aiChanges };
    return { current, logic, serp, ai };
  })();

  const handleMapFocusArticle = useCallback((articleId: string) => {
    const article = articlesList.find(candidate => candidate.id === articleId || (candidate.isPublished ? candidate.mainKeywordObj?.id : candidate.mainKeywordObj?.provisionalGroupId || candidate.briefingId) === articleId);
    if (!article) return;
    setSelectedArticleIds(previous => previous.has(article.id) ? previous : new Set([...previous, article.id]));
  }, [articlesList]);

  const syncArticleInSiloWorkingCopies = (articleId: string, siloId: string | null) => {
    setSiloWorkingCopies(previous => {
      const withoutArticle = previous.map(copy => {
        const remaining = copy.articleReferences.filter(reference => reference.articleId !== articleId);
        const pillarChanged = copy.pillarCandidateArticleId === articleId;
        const nextPillar = pillarChanged ? remaining[0]?.articleId || null : copy.pillarCandidateArticleId;
        return {
          ...copy,
          articleReferences: remaining.map(reference => ({ ...reference, role: reference.articleId === nextPillar ? "pillar_candidate" as const : "support" as const })),
          pillarCandidateArticleId: nextPillar,
          supportArticleIds: copy.supportArticleIds.filter(id => id !== articleId && id !== nextPillar),
          siloPage: { ...copy.siloPage, pillarArticleId: null, supportArticleIds: copy.supportArticleIds.filter(id => id !== articleId && id !== nextPillar) },
        };
      });
      if (!siloId) return withoutArticle;
      const targetIndex = withoutArticle.findIndex(copy => copy.id === siloId || copy.existingSiloId === siloId);
      if (targetIndex < 0) return previous;
      const target = withoutArticle[targetIndex];
      const articleDna = acceptedArticleDnas[articleId];
      if (!articleDna) return previous;
      const targetPillar = target.pillarCandidateArticleId || articleId;
      const reference: SiloWorkingCopyArticleReference = {
        articleId,
        articleDnaVersionId: articleDna.versionId,
        articleDnaContentHash: articleDna.contentHash,
        keywordDnaReferences: articleDna.payload.keywordReferences.map(item => ({ keywordId: item.keywordId, keywordDnaVersionId: item.keywordDnaVersionId, keywordDnaContentHash: item.keywordDnaContentHash })),
        role: targetPillar === articleId ? "pillar_candidate" : "support",
        rationale: "Movimentação humana pela projeção do Workbench; confirmação do Silo ainda pendente.",
      };
      const next = [...withoutArticle];
      next[targetIndex] = {
        ...target,
        articleReferences: [...target.articleReferences, reference].map(item => ({ ...item, role: item.articleId === targetPillar ? "pillar_candidate" as const : "support" as const })),
        pillarCandidateArticleId: targetPillar,
        supportArticleIds: [...target.supportArticleIds, ...(targetPillar === articleId ? [] : [articleId])],
        siloPage: { ...target.siloPage, supportArticleIds: [...target.supportArticleIds, ...(targetPillar === articleId ? [] : [articleId])] },
      };
      return next;
    });
  };

  const handleMapMoveArticleToSilo = (articleId: string, siloId: string | null) => {
    const article = articlesList.find(candidate => candidate.id === articleId || (candidate.isPublished ? candidate.mainKeywordObj?.id : candidate.mainKeywordObj?.provisionalGroupId || candidate.briefingId) === articleId);
    if (!article) return;
    const targetWorkingCopy = siloId ? siloWorkingCopies.find(copy => copy.id === siloId || copy.existingSiloId === siloId) : null;
    if (targetWorkingCopy && !siloOptions.some(option => option.id === siloId)) {
      if (article.isPublished) return showNotification("error", "Artigos publicados permanecem protegidos.");
      syncArticleInSiloWorkingCopies(articleId, siloId);
      showNotification("success", "ArticleDNA movido na working copy do Silo; a confirmação humana continua pendente.");
      return;
    }
    void handleMoveArticleToSilo(article, siloId || "").then(moved => {
      if (moved) syncArticleInSiloWorkingCopies(articleId, siloId);
    });
  };

  const handleMapMoveKeywordToGroup = (keywordId: string, targetGroupId: string) => {
    const keyword = masterList.find(item => String(item.id) === keywordId);
    if (!keyword) return;
    const sourceArticle = articlesList.find(article => article.mainKeywordObj?.id === keywordId || article.supportKeywords.some(item => String(item.id) === keywordId));
    if (sourceArticle?.isPublished || keyword.isPublished) {
      showNotification("error", "Keywords de artigos publicados permanecem protegidas.");
      return;
    }
    const targetArticle = targetGroupId !== "__none__" && targetGroupId !== "__new__"
      ? articlesList.find(article => articleEntityIdFor(article) === targetGroupId || article.id === targetGroupId)
      : null;
    const newGroupId = targetGroupId === "__new__" ? `manual-${keywordId}-${Date.now()}` : null;
    const clusterId = newGroupId || targetArticle?.clusterId || targetArticle?.mainKeywordObj?.provisionalGroupId || targetArticle?.briefingId || null;
    const workingArticleId = newGroupId ? `working-article:${newGroupId}` : targetArticle?.workingArticleId || null;
    const targetHasPrincipal = Boolean(targetArticle?.mainKeywordObj && String(targetArticle.mainKeywordObj.id) !== keywordId);
    const reviewRole = targetGroupId === "__new__" ? "principal" : targetHasPrincipal ? "secundaria" : keyword.reviewRole;
    const nextMasterList = masterList.map(item => String(item.id) === keywordId
      ? { ...normalizeArticleWorkingCopyKeyword(item), clusterId, provisionalGroupId: clusterId, workingArticleId, ...(targetGroupId === "__none__" ? { reviewRole: null } : { reviewRole }) }
      : item);
    if (nextMasterList.every((item, index) => item === masterList[index])) return;
    pushMasterHistory(masterList, `Mover a keyword ${keyword.keyword} para a organização selecionada`);
    setMasterList(nextMasterList);
    setProvisionalGroups(describeAssignedGroups(nextMasterList));
    void persistWorkingCopyAssignmentsRef.current?.(nextMasterList.filter(item => String(item.id) === keywordId));
    showNotification("success", targetGroupId === "__none__" ? "Keyword movida para Não agrupadas." : targetGroupId === "__new__" ? "Novo grupo provisório criado para a keyword." : "Keyword movida para o grupo selecionado.");
  };

  const handleMapStateChange = useCallback((next: ArchitectMapState) => {
    /**
     * Aba Artigos: clicar no mapa abre a mesma leitura da mesa.
     *
     * Mapa e painel precisam olhar o MESMO objeto; duas seleções paralelas
     * fariam a tela mostrar um artigo e explicar outro. A SiloPage abre o
     * resumo do Silo; Article e keyword abrem a composição.
     */
    if (workspaceMode === "articles" && next.selectedNodeId !== mapState.selectedNodeId) {
      const no = articleFlow.nodes.find(item => item.id === next.selectedNodeId) || null;
      if (!no) {
        setSelectedArticleNodeRef(null);
      } else if (no.kind === "silo_page") {
        setPanelSiloRef(no.siloRef);
        setSelectedArticleNodeRef(null);
      } else {
        setPanelSiloRef(no.siloRef);
        setSelectedArticleNodeRef(no.articleRef);
      }
    }
    // Selecionar o centro de um grupo com keywords escondidas abre o grupo:
    // é assim que "+ N keywords" deixa de ser um beco sem saída.
    if (next.selectedNodeId && next.selectedNodeId !== mapState.selectedNodeId) {
      const clusterRef = clusterRefOfFlowNode(architectureFlow, next.selectedNodeId);
      if (clusterRef && architectureFlow.hiddenByCluster[clusterRef]) {
        setExpandedClusterRefs(previous => new Set(previous).add(clusterRef));
      }
    }
    setMapState(previous => previous.scenario === next.scenario
      && previous.compare === next.compare
      && previous.selectedNodeId === next.selectedNodeId
      && previous.selectedArticleId === next.selectedArticleId
      && previous.selectedKeywordId === next.selectedKeywordId
      && previous.selectedSiloId === next.selectedSiloId ? previous : next);
  }, [architectureFlow, articleFlow, mapState.selectedNodeId, workspaceMode]);

  const handleMapScenarioChange = useCallback((scenario: ArchitectMapScenario) => {
    setMapState(previous => ({
      ...previous,
      scenario,
      compare: scenario === "current" ? false : previous.compare,
      selectedNodeId: null,
      selectedArticleId: null,
      selectedKeywordId: null,
      selectedSiloId: null,
    }));
  }, []);

  const handleMapCompareChange = useCallback((compare: boolean) => {
    setMapState(previous => ({ ...previous, compare: previous.scenario === "current" ? false : compare }));
  }, []);

  const mapSelectedSnapshot = architectureMapSnapshots[mapState.scenario];
  const mapSelectedArticle = mapState.selectedArticleId
    ? mapSelectedSnapshot.articles.find(article => article.id === mapState.selectedArticleId) || architectureMapSnapshots.current.articles.find(article => article.id === mapState.selectedArticleId)
    : null;
  const mapSelectedSilo = mapState.selectedSiloId
    ? mapSelectedSnapshot.silos.find(silo => silo.id === mapState.selectedSiloId) || architectureMapSnapshots.current.silos.find(silo => silo.id === mapState.selectedSiloId)
    : null;
  const mapSelectedKeyword = mapSelectedArticle?.keywords.find(keyword => keyword.id === mapState.selectedKeywordId) || null;
  const mapGroupOptions = architectureMapSnapshots.current.articles.filter(article => !article.siloCandidate).map(article => ({ id: article.id, label: article.label }));
  const mapSiloOptions = architectureMapSnapshots.current.silos.map(silo => ({ id: silo.id, label: silo.label }));
  const mapVisibleArticleIds = useMemo(() => new Set(filteredArticles.map(article => article.id)), [filteredArticles]);
  const mapScenarioLabel = mapState.scenario === "logic" ? "Lógica" : mapState.scenario === "serp" ? "SERP" : mapState.scenario === "ai" ? "IA" : "Atual";

  const globalTopbarControls = useMemo<GlobalTopbarModuleControls>(() => ({
    moduleId: "arquiteto",
    tabs: <nav className="flex items-center gap-0.5" aria-label="Áreas do Arquiteto" role="tablist" data-arquiteto-topbar-tabs>
      {/* Ordem canônica do Arquiteto: território primeiro, artigo depois (SDD Silo-first §17). */}
      {(["silos", "articles", "links"] as const).map(nextMode => {
        const label = nextMode === "articles" ? "Artigos" : nextMode === "silos" ? "Silos" : "Links internos";
        return <button key={nextMode} type="button" role="tab" aria-selected={workspaceMode === nextMode} onClick={() => setWorkspaceMode(nextMode)} className={`min-h-8 shrink-0 rounded border px-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35 ${workspaceMode === nextMode ? "border-module-accent/50 bg-module-accent/10 text-module-accent" : "border-divider bg-surface-subtle text-text-muted hover:border-context-accent/40 hover:text-foreground"}`}>{label}</button>;
      })}
    </nav>,
    search: {
      getValue: () => searchQuery,
      setValue: (value) => setSearchQuery(value),
    },
    history: {
      getCount: () => masterHistory.entries.length,
      canUndo: () => masterHistory.canUndo,
      canRedo: () => masterHistory.canRedo,
      undo: () => topbarHandlersRef.current.undoMasterList(),
      redo: () => topbarHandlersRef.current.redoMasterList(),
      open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "arquiteto" } })),
     },
     actions: <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto xl:overflow-visible" data-arquiteto-topbar-actions>
        {workspaceMode === "articles" && <>
          <select
            aria-label="Filtrar por status"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className={`${GLOBAL_TOPBAR_ACTION_CONTROL} max-w-36 cursor-pointer`}
          >
            <option value="Todos">Status: Todos</option>
            <option value="draft">Em processo</option>
            <option value="awaiting_approval">Aguardando aprovação</option>
            <option value="approved">Aprovado</option>
            <option value="sent_radar">Importado no Radar</option>
            <option value="published">Publicado</option>
          </select>
          <CompactSavedViews
            userId={session?.user?.email || "usuario-local"}
            brandId={selectedBrandId}
            module="arquiteto"
            values={{ searchQuery, filterHierarquia, filterStatus }}
            onApply={(view) => {
              setSearchQuery(view.searchQuery || "");
              setFilterHierarquia(view.filterHierarquia || "Todos");
              setFilterStatus(view.filterStatus || "Todos");
            }}
          />
          <span className="h-6 shrink-0 border-l border-divider" aria-hidden="true" />
        </>}
        {workspaceMode === "silos" && <select
          aria-label="Filtrar por hierarquia"
          value={filterHierarquia}
          onChange={(event) => setFilterHierarquia(event.target.value)}
          className={`${GLOBAL_TOPBAR_ACTION_CONTROL} max-w-36 cursor-pointer`}
        >
          <option value="Todos">Hierarquia: Todas</option>
          <option value="Pilar">Pilar</option>
          <option value="Suporte">Suporte</option>
          <option value="Reforço">Reforço</option>
        </select>}
      <button
        type="button"
        onClick={() => { setKeywordImportOpen(true); void topbarHandlersRef.current.fetchMasterList(); }}
        className={`${GLOBAL_TOPBAR_ACTION_CONTROL} text-positive-soft/85`}
        title="Selecionar keywords aprovadas no Minerador"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Importar do Minerador</span>
      </button>
       {workspaceMode === "silos" && <button
         type="button"
         onClick={() => { setNewListName(""); setNewSiloSlug(""); setSlugManuallyEdited(false); setIsListModalOpen(true); }}
         className={GLOBAL_TOPBAR_ACTION_CONTROL}
         title="Criar novo Silo"
       >
         <Plus className="h-3.5 w-3.5" aria-hidden="true" />
         <span>Silo</span>
       </button>}
      <button
        type="button"
        onClick={() => topbarHandlersRef.current.showNotification("success", "Exportação iniciada...")}
        className={GLOBAL_TOPBAR_ACTION_CONTROL}
        title="Exportar planilha"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Exportar</span>
      </button>
      {/* Contador da MESA, não do módulo: no modo Silos a unidade visível é a
          keyword territorial. Rotular tudo como "artigos" era Article-first. */}
      {workspaceMode === "silos"
        ? <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} shrink-0 tabular-nums text-text-muted`} aria-label="Keywords na estrutura de silos">{territorialSurface.surface.counts.keywords} keywords</span>
        : <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} shrink-0 tabular-nums text-text-muted`} aria-label="Artigos e keywords aguardando decisão de silo">{filteredArticles.length} artigos{visiblePipelineRows.length ? ` · ${visiblePipelineRows.length} aguardando` : ""}</span>}
    </div>,
  }), [acceptedArticleDnas, activeLogicalTask, filterHierarquia, filterStatus, filteredArticles.length, generatingStrategic, masterHistory.canRedo, masterHistory.canUndo, masterHistory.entries.length, masterList.length, pendingSiloReview, searchQuery, selectedBrandId, session?.user?.email, siloConsolidating, siloReviewBusy, siloWorkingCopies.length, territorialSurface, visiblePipelineRows.length, workspaceMode]);
  const globalTopbarControlsRef = useRef<GlobalTopbarModuleControls>(globalTopbarControls);
  globalTopbarControlsRef.current = globalTopbarControls;

  useEffect(() => {
    registerControls(globalTopbarControlsRef.current);
    return () => unregisterControls("arquiteto");
  }, [registerControls, unregisterControls]);

  useEffect(() => {
    updateControls(globalTopbarControls);
  }, [globalTopbarControls, updateControls]);

  const dangerApproval = pendingDangerAction?.type === "reset-new"
    ? { title: "Resetar a organização dos artigos novos", description: `Esta ação removerá ${pendingDangerAction.count} keyword(s) não-publicada(s) da organização atual.`, impact: ["A organização local dos artigos novos será removida.", "Artigos publicados continuarão protegidos.", "A ação ficará disponível no histórico local para desfazer."], phrase: `RESETAR ${pendingDangerAction.count}`, label: "Aprovar reset" }
    : pendingDangerAction?.type === "remove-silo"
        ? { title: `Remover o silo “${pendingDangerAction.siloName}”`, description: "O silo será retirado da organização local e seus artigos voltarão para Sem Grupo.", impact: ["Os artigos não serão apagados.", "As relações locais com este silo serão removidas.", "Silos com publicados não podem chegar a esta confirmação."], phrase: "REMOVER SILO", label: "Aprovar remoção" }
        : null;

  if (sessionStatus === "loading" || profileLoading) {
    return (
        <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-module-accent animate-spin" />
      </div>
    );
  }
  if (sessionStatus === "unauthenticated") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-foreground p-6 text-center font-sans">
        <Building2 className="w-10 h-10 text-context-accent mb-3" />
        <h1 className="text-sm font-bold uppercase tracking-wider">Acesso Restrito</h1>
        <button onClick={() => router.push("/api/auth/signin")}
          className="mt-5 rounded border border-action-accent/60 bg-action-accent px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/35 cursor-pointer">
          Ir para Login
        </button>
      </div>
    );
  }

  const articleMode = workspaceMode === "articles";


  return (
    // A GlobalTopbar (40px = 2.5rem) já ocupa o topo do <main> do ProductShell.
    // Usar h-screen aqui empurrava o documento para 100vh + 40px e criava uma
    // segunda barra de rolagem vertical por fora da barra interna do workspace.
    <div className="relative flex h-[calc(100vh-2.5rem)] min-h-0 flex-col overflow-hidden bg-background font-sans text-sm text-foreground">
      <style jsx>{`
        .architect-scrollbar {
          scrollbar-color: color-mix(in srgb, var(--foreground) 24%, transparent) transparent;
          scrollbar-width: thin;
        }
        .architect-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .architect-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .architect-scrollbar::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--foreground) 20%, transparent);
          border-radius: 999px;
        }
        .architect-scrollbar::-webkit-scrollbar-thumb:hover {
          background: color-mix(in srgb, var(--foreground) 32%, transparent);
        }
      `}</style>

      <HistoryControls moduleId="arquiteto" showHistory={false} showUndoRedo={false} visualVariant="semantic" entries={masterHistory.entries} canUndo={masterHistory.canUndo} canRedo={masterHistory.canRedo}
        onUndo={undoMasterList} onRedo={redoMasterList} onRestore={masterHistory.restore} compact presentation="popover"/>

      {/* ── PLANILHA PRINCIPAL DE ARTIGOS ── */}
      <main className="architect-scrollbar min-w-0 flex-1 overflow-y-auto bg-background">
        {/* Recolhido ocupa um terço do topo (prioridade é a planilha); a seta abre para 72vh. */}
        <div className={`grid min-h-0 shrink-0 gap-0 bg-surface lg:grid-cols-2 lg:overflow-hidden ${mapExpanded ? "lg:max-h-[72vh]" : "lg:max-h-[33vh]"}`} data-testid="architect-workbench-layout">
          <div className="architect-scrollbar min-h-0 min-w-0 overflow-y-auto border-b border-divider lg:border-b-0 lg:border-r border-divider" data-testid="architect-workbench-left">
            <ArchitectWorkbench
              mode={workspaceMode}
              articleCount={filteredArticles.length}
              articleScope={workspaceMode === "articles" ? {
                siloPages: articleSiloSummary.siloPages,
                articles: articleSiloSummary.articles,
                candidates: articleSiloSummary.candidates,
                published: articleSiloSummary.published,
                waiting: visiblePipelineRows.length,
              } : null}
              // A contagem do cabeçalho é a mesma da mesa: silos candidatos e
              // confirmados. Contar só working copy escondia o Silo recém-criado.
              siloCount={territorialSurface.surface.counts.territories
                || siloWorkingCopies.length
                || siloOptions.length}
              selectedCount={selectedArticleIds.size + selectedSiloPageIds.size}
              activeProcess={activeProcess}
              onProcessChange={(process) => setActiveProcess(process)} /* trocar de processo não abre o mapa: quem abre é a seta */
              processes={processState}
              siloView={siloView}
              onSiloViewChange={setSiloView}
              siloScope={siloScope}
              onSiloScopeChange={setSiloScope}
              formation={{
                panel: (
                  <ArticleFormationPanel
                    universes={articleFormationUniverses}
                    summary={articleFormationSummary}
                    processed={Boolean(articleFormationMarker)}
                    stale={formationIsStale}
                    scenarioState={ARTICLE_FORMATION_SCENARIO_LABELS[resolveArticleFormationScenarioState({
                      marker: articleFormationMarker,
                      currentBaseHash: articleFormationBase,
                    })]}
                    busy={formationBusy}
                    selectedCount={selectedCandidateRefs.size}
                    confirmed={confirmedFormation}
                    selectedCandidate={selectedFormationCandidate}
                    selectedSingletonAudit={selectedSingletonAudit}
                    keywordLabels={formationKeywordLabels}
                    mergeTargets={formationMergeTargets}
                    siloViews={articleSiloViews}
                    selectedSiloRef={panelSiloRef}
                    onSelectSilo={setPanelSiloRef}
                    waiting={{
                      received: masterList.length,
                      awaitingConfirmation: articlePipeline.counts.awaiting_silo_confirmation,
                      withoutSilo: articlePipeline.counts.awaiting_silo,
                      rows: visiblePipelineRows.map(row => ({
                        keywordId: row.keywordId,
                        keyword: row.keyword,
                        reason: row.reason,
                        siloName: row.siloName,
                      })),
                    }}
                    crossSilo={articleScopeAudit.crossSilo}
                    // §13 — leitura do lote corrente. Todo número é derivado do
                    // cenário; nenhum deles é fixo no código.
                    batch={{
                      keywords: articleFormationSummary.keywords,
                      siloPages: articleSiloSummary.siloPages,
                      // Formado é o que o acervo canônico descreve; candidato é
                      // o que ainda é só cenário. Somá-los esconderia o que
                      // falta concluir.
                      articles: articleSiloSummary.articles,
                      candidates: articleSiloSummary.candidates,
                      grouped: articleFormationSummary.grouped,
                      singletons: articleFormationSummary.singles,
                      pendencias: visiblePipelineRows.length,
                      conflitos: articleFormationSummary.needsReview,
                      revisoesHumanas: articleFormationUniverses
                        .flatMap(universe => universe.candidates)
                        .filter(candidate => candidate.origin === "human").length,
                    }}
                    serpGate={articleSerpGateSummary}
                    // Article materializado cujo gate SERP não está vigente: ele
                    // foi gravado antes da evidência e não fecha o gate de hoje.
                    preSerpArtifacts={[...materializationPartition.matched.keys()].filter(ref => !serpWasExecutedFor(articleSerpGates.get(ref)?.state || "missing")).length}
                    legacy={legacyArticleSummary}
                    conclusionGates={conclusionGates}
                    parentBinding={{
                      declared: [...articleParentBindings.values()].filter(item => item.code === "PARENT_DECLARED").length,
                      legacy: [...articleParentBindings.values()].filter(item => item.code === "PARENT_INFERRED_LEGACY").length,
                      conflict: [...articleParentBindings.values()].filter(item => item.code === "PARENT_CONFLICT").length,
                      unresolved: [...articleParentBindings.values()].filter(item => item.code === "PARENT_UNRESOLVED").length,
                    }}
                    /*
                     * MUDANÇA DE COMPOSIÇÃO É PROPOSTA, NUNCA CLIQUE DIRETO.
                     *
                     * Estes quatro controles gravavam na working copy remota no
                     * primeiro clique, enquanto os MESMOS atos, na revisão de
                     * composição, passam por "Ver efeito" e "Aplicar". Dois
                     * caminhos para a mesma decisão, um deles sem volta.
                     *
                     * Foi assim que "skin care rosto" saiu de um artigo de três
                     * keywords e virou candidato sozinho sem ninguém decidir
                     * isso: uma exploração virou composição ativa, e a SERP
                     * seguinte foi coletada para o artigo errado.
                     *
                     * Agora tudo entra como proposta; aplicar continua sendo um
                     * ato à parte, e a base antiga fica intacta até lá.
                     */
                    onChangePrincipal={(candidateRef, keywordId) => setPendingScenarioChange({ kind: "change_principal", candidateRef, keywordId })}
                    onSplitKeyword={(candidateRef, keywordId) => setPendingScenarioChange({ kind: "split_keyword", candidateRef, keywordId })}
                    onMoveKeyword={(keywordId, targetCandidateRef) => {
                      const origem = articleFormationUniverses
                        .flatMap(universe => universe.candidates)
                        .find(candidate => candidate.keywords.some(item => item.keywordId === keywordId));
                      if (!origem) return;
                      setPendingScenarioChange({ kind: "move_keyword", keywordId, fromCandidateRef: origem.candidateRef, toCandidateRef: targetCandidateRef });
                    }}
                    onMergeCandidates={(left, right) => setPendingScenarioChange({ kind: "merge_candidates", leftCandidateRef: left, rightCandidateRef: right })}
                    onProcess={() => { void processArticleFormation(); }}
                    onConfirm={() => { void confirmArticleFormation(); }}
                  />
                ),
              }}
              /*
               * A FASE QUE FECHA A PASSADA — duas ações, como Silos e Artigos.
               *
               * Links era a única aba que ainda exibia motor: "IA · Bloqueado"
               * e "Revisão · Disponível" descreviam o estado interno em vez do
               * ato que faltava. Processar propõe; confirmar encerra. O que
               * impede cada uma é dito por extenso — botão desabilitado sem
               * motivo obriga a pessoa a adivinhar.
               */
              links={{
                panel: (
                  <div className="mt-3 rounded-md border border-divider bg-surface-subtle p-3" data-testid="architect-links-phase-panel">
                    <p className="text-sm font-semibold text-foreground">Links internos · fase final da passada</p>
                    <p className="mt-1 text-sm leading-6 text-text-muted">{linksPhaseReading.summary}</p>
                    {linksPhaseReading.blockers.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {linksPhaseReading.blockers.map(motivo => (
                          <li key={motivo} className="text-sm leading-6 text-warning">· {motivo}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid="architect-links-process"
                        onClick={() => { void processarLinks(); }}
                        disabled={!linksPhaseReading.canProcess}
                        title={linksPhaseReading.processBlocker || "Deriva o esqueleto do Silo e pede as âncoras semânticas. Nada é aprovado."}
                        className={ARCHITECT_UI.primaryButton}
                      >
                        Processar links
                      </button>
                      <button
                        type="button"
                        data-testid="architect-links-confirm"
                        onClick={() => { void handleApproveLinks(); }}
                        disabled={!linksPhaseReading.canConfirm}
                        title={linksPhaseReading.confirmBlocker || "Aprova o InternalLinkGraph e encerra a fase."}
                        className={ARCHITECT_UI.importButton}
                      >
                        Confirmar links internos
                      </button>
                    </div>
                  </div>
                ),
              }}
              architecture={{
                panel: (
                  <>
                  {/* O PLANO INTEIRO, ANTES DE ESCREVER.
                      Dizer só "1 Article afetado" esconderia para onde o resto
                      do lote está indo — foi exatamente assim que a migração
                      de duas buscas passou despercebida. */}
                  {/* DUPLICATA DE RAIZ PUBLICADA.
                      Dois Silos apontando para a mesma entrada do catálogo
                      disputavam score por ordenação — e o de campos vazios
                      chegou a levar uma busca de ArticleDNA aprovado. */}
                  {duplicateReadiness.length > 0 && (
                    <section className="mt-3 rounded border border-warning/40 bg-warning/10 p-3" data-testid="architect-duplicate-territories">
                      <p className="text-sm font-semibold text-foreground">Silo duplicado da mesma estrutura publicada</p>
                      <ul className="mt-1 space-y-1">
                        {duplicateReadiness.map(item => (
                          <li key={item.duplicata.duplicateTerritoryRef} className="text-sm leading-6 text-text-muted">
                            <span className="font-semibold text-foreground">
                              {siloLabelByRef.get(item.duplicata.duplicateTerritoryRef) || item.duplicata.duplicateTerritoryRef}
                            </span>{" "}
                            — {item.duplicata.reason}
                            <br />
                            Canônico: {siloLabelByRef.get(item.duplicata.canonicalTerritoryRef) || item.duplicata.canonicalTerritoryRef}
                            {" · "}
                            {item.readiness.state === "ready"
                              ? "sem buscas atribuídas: pode ser marcado como substituído."
                              : item.readiness.reason}
                            {item.atribuidas.length > 0 && <> Buscas presas: {item.atribuidas.join(", ")}.</>}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm leading-6 text-text-muted">
                        Enquanto não for marcado, ele não compete mais por afinidade — mas continua no acervo.
                      </p>
                    </section>
                  )}
                  {architectureImpactAck && (
                    <section
                      className={`mt-3 rounded border p-3 ${architectureImpactAck.blocked.length ? "border-danger/45 bg-danger-soft" : "border-warning/40 bg-warning/10"}`}
                      data-testid="architect-territory-impact-preview"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {architectureImpactAck.blocked.length ? "Confirmação bloqueada" : "Restauração estrutural · confirme para aplicar"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-text-muted">{architectureImpactAck.summary}</p>

                      {architectureImpactAck.impacted.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {architectureImpactAck.impacted.map(item => (
                            <li key={item.articleId} className="text-sm leading-6 text-foreground">
                              <span className="font-semibold">{item.label}</span>{" "}
                              <span className="text-text-muted">
                                {item.alignedBefore}/{item.keywordCountBefore} → {item.alignedAfter}/{item.keywordCountBefore} no território · {item.reason}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-3 text-sm font-semibold text-text-muted">Todas as atribuições deste plano</p>
                      <ul className="mt-1 space-y-0.5" data-testid="architect-territory-plan-rows">
                        {architectureImpactAck.plannedAssignments.map(linha => (
                          <li key={linha.keywordId} className="text-sm leading-6 text-text-muted">
                            {linha.label}: {siloLabelByRef.get(linha.currentTerritoryRef || "") || linha.currentTerritoryRef || "sem Silo"}
                            {" → "}
                            {siloLabelByRef.get(linha.proposedTerritoryRef || "") || linha.proposedTerritoryRef || "sem Silo"}
                            {linha.unchanged ? " (sem mudança)" : ""}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <ArchitecturePanel
                    analysis={architectureAnalysis}
                    processed={Boolean(architectureMarker)}
                    stale={architectureIsStale}
                    scenarioState={ARCHITECTURE_SCENARIO_LABELS[resolveArchitectureScenarioState({
                      marker: architectureMarker,
                      currentBaseHash: architectureAnalysis.baseHash,
                    })]}
                    busy={architectureBusy}
                    confirmed={confirmedArchitecture}
                    processChips={architectureProcessChips}
                    selectedCluster={selectedClusterAnalysis}
                    consolidation={(() => {
                      const aprovados = Object.values(acceptedArticleDnas).filter(version =>
                        version.payload.brandId === selectedBrandId
                        && effectiveVersionStatus(version.versionId, versionEvents) === "approved").length;
                      const abertas = remoteSiloWorkingCopies.filter(remote => !siloWorkingCopyIsReadOnly(remote, consolidatedTerritoryRefs));
                      const comPilar = abertas.filter(remote => Boolean(remote.workingCopy.pillarSelection)).length;
                      // A consolidação compara a proposta local com a linha remota;
                      // sem a proposta carregada ela não tem o que comparar.
                      const semProposta = abertas.filter(remote => !siloWorkingCopies
                        .some(copy => siloWorkingCopyTerritoryRef(copy) === remote.workingCopy.territoryRef)).length;
                      return {
                        workingCopies: remoteSiloWorkingCopies.length,
                        pillarsDecided: remoteSiloWorkingCopies.filter(remote => Boolean(remote.workingCopy.pillarSelection)).length,
                        consolidated: remoteSiloWorkingCopies.length - abertas.length,
                        canForm: aprovados > 0 && !siloConsolidating,
                        formBlocker: aprovados > 0
                          ? null
                          : "Nenhum ArticleDNA aprovado: a cópia de trabalho do Silo é montada a partir dos artigos já fechados na fase Artigos.",
                        canConsolidate: abertas.length > 0 && comPilar === abertas.length && semProposta === 0
                          && !pendingSiloReview && !siloConsolidating,
                        consolidateBlocker: !abertas.length
                          ? "Nenhuma cópia de trabalho aberta: forme as cópias antes de consolidar."
                          : comPilar < abertas.length
                            ? `${abertas.length - comPilar} Silo(s) ainda sem Pilar. Escolher o Pilar é decisão humana: o sistema propõe, não consolida sozinho.`
                            : semProposta > 0
                              ? "Forme as cópias de trabalho nesta sessão antes de consolidar."
                              : pendingSiloReview
                                ? "Há proposta da IA pendente: aplique ou descarte antes de consolidar."
                                : null,
                        onForm: () => { void formSilosWorkingCopy(); },
                        onConsolidate: () => { void consolidateSilos(); },
                      };
                    })()}
                    onProcess={() => { void processArchitecture(); }}
                    onConfirm={() => { void confirmArchitecture(); }}
                    onContinueToArticles={() => setWorkspaceMode("articles")}
                  />
                  </>
                ),
              }}
            />
            <div id="architect-contextual-area" data-testid="architect-contextual-area" className="border-b border-divider" aria-hidden="false">
            <div data-testid="architect-process-context-panel">
            {/* Na aba Silos quem responde "o que aconteceu" é o painel de
                arquitetura; repetir "Processo ativo" aqui reintroduziria a
                leitura de quatro etapas manuais. */}
            {workspaceMode !== "silos" && (
            <section className="rounded-lg border border-divider bg-surface-subtle p-3">
              <p className="text-sm font-semibold text-foreground">Processo ativo · {activeProcess === "logic" ? "Lógica" : activeProcess === "serp" ? "SERP" : activeProcess === "ai" ? "IA" : "Revisão"}</p>
              <p className="mt-1 text-sm leading-6 text-text-muted">{contextSummary}</p>
              <p className="mt-2 text-sm leading-6 text-text-muted">O mapa à direita é somente uma projeção do cenário. Persistência, SERP e IA continuam nos controles do processo.</p>
            </section>
            )}
            {workspaceMode === "links" && <section className="rounded-lg border border-divider bg-surface-subtle p-3" data-testid="architect-links-context">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">InternalLinkGraph · revisão humana</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">O grafo persistido define as relações. O mapa é uma projeção editável da working copy; posição, zoom e seleção não entram no hash.</p>
                </div>
                <span className={`shrink-0 rounded border px-2 py-1 text-xs font-semibold ${linksSaveState === "error" || linksSaveState === "conflict" ? "border-danger/40 bg-danger/10 text-danger" : linksIsDirty ? "border-warning/40 bg-warning/10 text-warning" : "border-divider bg-surface text-text-muted"}`}>
                  {linksLoading ? "Carregando" : linksSaveState === "saving" ? "Salvando" : linksSaveState === "conflict" ? "Conflito de versão" : linksSaveState === "error" ? "Erro de persistência" : linksIsDirty ? "Alterações não salvas" : linksWorkingCopy ? "Salvo · readback confirmado" : linksApprovedGraph ? `Aprovado v${linksApprovedGraph.versionNumber}` : "Sem grafo"}
                </span>
              </div>
              {linkSiloContexts.length > 0 ? <label className="mt-3 block text-sm font-semibold text-text-muted">Silo do grafo<select aria-label="Silo do InternalLinkGraph" value={resolvedLinksSiloId || ""} onChange={event => handleLinksSiloChange(event.target.value || null)} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground">
                {linkSiloContexts.map(context => <option key={context.siloId} value={context.siloId}>{context.siloDna.payload.name || context.siloDna.payload.centralEntity || context.siloId}</option>)}
              </select></label> : <p className="mt-3 rounded border border-warning/40 bg-warning/10 px-2 py-2 text-sm leading-6 text-warning">Nenhum par SiloDNA + SiloPage disponível para formar o contexto do grafo.</p>}
              {linksSelectedContext && <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-divider bg-surface px-2.5 py-2 text-sm"><span className="font-semibold text-foreground">Base:</span> {linksSelectedContext.siloDna.versionId} · {linksSelectedContext.siloPage.versionId}</div>
                <div className="rounded border border-divider bg-surface px-2.5 py-2 text-sm"><span className="font-semibold text-foreground">Participantes:</span> {(linksWorkingCopy || linksApprovedGraph)?.participatingArticleDnaVersionRefs.length || linksSelectedContext.siloDna.payload.articleReferences.length}</div>
              </div>}
              {linksError && <p className="mt-3 rounded border border-danger/40 bg-danger/10 px-2 py-2 text-sm leading-6 text-danger" role="alert">{linksError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {!linksWorkingCopy && linksSelectedContext && <button type="button" onClick={() => void (linksApprovedGraph ? handleCreateLinksSuccessor() : handleOpenLinksWorkingCopy())} disabled={linksLoading || linksSaveState === "saving"} className={ARCHITECT_UI.primaryButton}>{linksApprovedGraph ? "Criar nova working copy" : "Abrir working copy"}</button>}
                {linksWorkingCopy && <button type="button" onClick={() => void generateStructuralLinks()} disabled={linksLoading || linksSaveState === "saving"} data-testid="architect-generate-structural-links" className={ARCHITECT_UI.toolbarButton} title="Deriva as relações que a arquitetura do Silo já decidiu: raiz, Pilar e Suportes">Gerar conexões estruturais</button>}
                {linksWorkingCopy && <button type="button" onClick={() => void generateLinkAnchors()} disabled={linksLoading || linksSaveState === "saving" || !linksWorkingCopy.edges.length} data-testid="architect-generate-link-anchors" className={ARCHITECT_UI.toolbarButton} title="Propõe conceitos de âncora com a IA global; não consulta SERP e não aprova nada">Gerar mapa de âncoras</button>}
                {linksWorkingCopy && <button type="button" onClick={() => void handleSaveLinksWorkingCopy()} disabled={!linksIsDirty || linksLoading || linksSaveState === "saving" || linksSaveState === "conflict"} className={ARCHITECT_UI.primaryButton}>Salvar working copy</button>}
                {linksWorkingCopy && <button type="button" onClick={() => void loadLinksRemote()} disabled={linksLoading || linksSaveState === "saving"} className={ARCHITECT_UI.toolbarButton} title="Descarta apenas alterações locais não salvas e lê o estado canônico novamente">Recarregar do remoto</button>}
                {linksWorkingCopy && <button type="button" onClick={() => void handleApproveLinks()} disabled={linksLoading || linksSaveState === "saving" || linksIsDirty || linksSaveState !== "saved"} className={ARCHITECT_UI.toolbarButton}>Aprovar grafo</button>}
                {!linksWorkingCopy && linksApprovedGraph && <button type="button" onClick={() => void handleCreateLinksSuccessor()} disabled={linksLoading || linksSaveState === "saving"} className={ARCHITECT_UI.toolbarButton}>Editar versão aprovada</button>}
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">Status separados: {linksWorkingCopy ? `working copy ${linksWorkingCopy.workingCopyId} · lock_version ${linksWorkingCopy.lockVersion} · ${linksWorkingCopy.edges.length} relação(ões)` : linksApprovedGraph ? `versão aprovada ${linksApprovedGraph.graphVersionId} · ${linksApprovedGraph.edges.length} relação(ões)` : "nenhuma versão persistida"}.</p>
              {linksApprovedGraph && <p className="mt-1 text-sm leading-6 text-text-muted">Baseline aprovado: v{linksApprovedGraph.versionNumber} · {new Date(linksApprovedGraph.createdAt).toLocaleString("pt-BR")} · ator de aprovação registrado.</p>}
              {linksWorkingCopy && <div className="mt-3 rounded border border-divider bg-surface px-2.5 py-2 text-sm leading-6 text-text-muted"><span className="font-semibold text-foreground">Revisão:</span> {linksReviewSummary.added} adicionada(s) · {linksReviewSummary.removed} removida(s) · {linksReviewSummary.changed} alterada(s) · {linksWorkingCopy.nodes.length} nó(s) · {linksWorkingCopy.edges.length} aresta(s).</div>}
              {linksSelectedNode && <div className="mt-3 rounded border border-divider bg-surface px-2.5 py-2 text-sm leading-6"><p className="font-semibold text-foreground">Nó selecionado</p><p className="mt-1 text-text-muted">{linksSelectedNode.snapshot.label || linksSelectedNode.nodeId} · {linksSelectedNode.nodeType} · {linksSelectedNode.architecturalRole || "sem papel"}</p><p className="mt-1 text-text-muted">A seleção só altera o contexto visual; nenhum DNA é expandido.</p></div>}
              {linksSelectedEdge && linksWorkingCopy && <div key={linksSelectedEdge.edgeId} className="mt-3 rounded border border-module-accent/35 bg-surface p-3" data-testid="architect-link-edge-editor">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">Relação selecionada</p><p className="mt-1 text-xs text-text-muted">{linksSelectedEdge.edgeId} · origem {linksSelectedEdge.origin}</p></div><button type="button" onClick={() => void handleDeleteLinkEdge()} className={`${ARCHITECT_UI.footerButton} border-danger/40 text-danger hover:border-danger`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remover</button></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-text-muted">Source<select aria-label="Source da relação" value={linksSelectedEdge.sourceNodeId} onChange={event => void updateLinkEdge(linksSelectedEdge.edgeId, { sourceNodeId: event.target.value })} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground">{(linksWorkingCopy.nodes).map(node => <option key={node.nodeId} value={node.nodeId}>{node.snapshot.label || node.nodeId}</option>)}</select></label>
                  <label className="text-sm font-semibold text-text-muted">Target<select aria-label="Target da relação" value={linksSelectedEdge.targetNodeId} onChange={event => void updateLinkEdge(linksSelectedEdge.edgeId, { targetNodeId: event.target.value })} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground">{(linksWorkingCopy.nodes).map(node => <option key={node.nodeId} value={node.nodeId}>{node.snapshot.label || node.nodeId}</option>)}</select></label>
                  <label className="text-sm font-semibold text-text-muted">Tipo<select aria-label="Tipo da relação" value={linksSelectedEdge.relationType} onChange={event => void updateLinkEdge(linksSelectedEdge.edgeId, { relationType: event.target.value as InternalLinkGraphEdge["relationType"] })} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground">{["PILLAR_TO_SUPPORT", "SUPPORT_TO_PILLAR", "SUPPORT_TO_SUPPORT", "SILO_PAGE_TO_ARTICLE", "ARTICLE_TO_SILO_PAGE"].map(type => <option key={type} value={type}>{type}</option>)}</select></label>
                  <label className="text-sm font-semibold text-text-muted">Prioridade<select aria-label="Prioridade da relação" value={linksSelectedEdge.priority} onChange={event => void updateLinkEdge(linksSelectedEdge.edgeId, { priority: event.target.value as InternalLinkGraphEdge["priority"] })} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground"><option value="HIGH">Alta</option><option value="MEDIUM">Média</option><option value="LOW">Baixa</option></select></label>
                </div>
                <label className="mt-2 block text-sm font-semibold text-text-muted">Motivo semântico<textarea aria-label="Motivo da relação" defaultValue={linksSelectedEdge.reason} onBlur={event => void updateLinkEdge(linksSelectedEdge.edgeId, { reason: event.target.value })} className="mt-1 min-h-16 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground" /></label>
                <label className="mt-2 block text-sm font-semibold text-text-muted">Conceitos de âncora<textarea aria-label="Conceitos de âncora" defaultValue={linksSelectedEdge.anchorConcepts.join("\n")} onBlur={event => void updateLinkEdge(linksSelectedEdge.edgeId, { anchorConcepts: event.target.value.split("\n").map(value => value.trim()).filter(Boolean) })} className="mt-1 min-h-16 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground" /><span className="mt-1 block text-xs font-normal text-text-muted">Um conceito semântico por linha; não é a frase final do link.</span></label>
                <p className="mt-2 text-xs leading-5 text-text-muted">Proveniência: {linksSelectedEdge.provenance.source}{linksSelectedEdge.provenance.references.length ? ` · ${linksSelectedEdge.provenance.references.join(", ")}` : " · sem referência adicional"}.</p>
              </div>}
              {!linksSelectedEdge && linksWorkingCopy && <p className="mt-3 text-sm text-text-muted">Selecione uma aresta no mapa ou arraste de um nó para outro para criar uma relação humana.</p>}
            </section>}
            {mapState.scenario !== "current" && <section className="rounded-lg border border-divider bg-surface-subtle p-3" data-testid="architect-map-comparison">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Comparativo · {mapScenarioLabel} × Atual</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">{mapState.compare ? "Ganhos, perdas e mudanças da proposta selecionada." : "Fotografia histórica disponível para comparação."}</p>
              </div>
                <button type="button" aria-pressed={mapState.compare} onClick={() => handleMapCompareChange(!mapState.compare)} className={`min-h-8 shrink-0 rounded border px-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35 ${mapState.compare ? "border-warning/45 bg-warning/10 text-warning" : "border-divider bg-surface text-text-muted hover:border-module-accent/40 hover:text-foreground"}`}>{mapState.compare ? "Comparando com Atual" : "Comparar com Atual"}</button>
              </div>
              {mapState.compare && <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><p className="text-sm font-semibold text-positive-soft">Ganha</p><ul className="mt-1 space-y-1 text-sm leading-6 text-text-muted">{mapSelectedSnapshot.gains.length ? mapSelectedSnapshot.gains.slice(0, 5).map(item => <li key={item}>· {item}</li>) : <li>· Nenhum ganho registrado.</li>}</ul></div>
                  <div><p className="text-sm font-semibold text-warning">Perde</p><ul className="mt-1 space-y-1 text-sm leading-6 text-text-muted">{mapSelectedSnapshot.losses.length ? mapSelectedSnapshot.losses.slice(0, 5).map(item => <li key={item}>· {item}</li>) : <li>· Nenhuma perda registrada.</li>}</ul></div>
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">Mudanças</p>
                <ul className="mt-1 space-y-1 text-sm leading-6 text-text-muted">{mapSelectedSnapshot.changes.length ? mapSelectedSnapshot.changes.slice(0, 6).map(item => <li key={item}>· {item}</li>) : <li>· Nenhum movimento proposto.</li>}</ul>
              </>}
            </section>}
            {/* Revisão: as quatro leituras lado a lado e as ações que já têm
                writer canônico. Reutiliza a seleção do Workbench. */}
            {workspaceMode === "silos" && activeProcess === "review" && territorialReviewViews.length > 0 && (
              <div className="grid gap-2" data-testid="architect-review-list">
                <p className="text-sm text-text-muted">
                  {territorialReviewViews.filter(view => view.status === "conflict").length} com conflito ·{" "}
                  {territorialReviewViews.filter(view => view.status === "ready_for_decision").length} pronta(s) para decisão ·{" "}
                  {territorialReviewViews.filter(view => view.status === "decision_recorded").length} com decisão registrada
                </p>
                {territorialReviewViews.map(view => (
                  <TerritorialReviewPanel
                    key={view.subject.ref}
                    view={view}
                    busyAction={reviewBusyAction}
                    onAction={action => { void applyReviewAction(action); }}
                  />
                ))}
              </div>
            )}
            <section className="rounded-lg border border-divider bg-surface-subtle p-3" data-testid="architect-map-human-actions">
              <p className="text-sm font-semibold text-foreground">Ações humanas</p>
              {/* A instrução tem que descrever a unidade da aba: no modo Silos a
                  relação em revisão é territorial, não Article → Silo. */}
              {!mapSelectedArticle && !mapSelectedSilo ? <p className="mt-1 text-sm text-text-muted">{workspaceMode === "silos" ? "Selecione uma keyword, silo ou estrutura para revisar a relação com o silo." : articleMode ? "Selecione um artigo ou keyword no mapa." : "Selecione um artigo, keyword, SiloPage, Pilar ou Suporte no mapa."}</p> : null}
              {mapSelectedArticle && <>
                <p className="mt-1 font-semibold text-foreground">{mapSelectedArticle.label}</p>
                <p className="mt-1 text-sm text-text-muted">Principal: {mapSelectedArticle.keywords.find(keyword => keyword.role === "principal")?.label || "não definida"}</p>
                <p className="mt-1 text-sm text-text-muted">Secundárias: {mapSelectedArticle.keywords.filter(keyword => keyword.role === "secundaria").map(keyword => keyword.label).join(" · ") || "nenhuma"}</p>
                {mapSelectedArticle.siloCandidate && <p className="mt-1 text-sm text-context-accent">Candidata a Silo reservada; não é ArticleDNA consolidado.</p>}
                {mapSelectedArticle.published && <p className="mt-1 text-sm text-positive-soft">Publicado protegido: identidade editorial preservada.</p>}
                {mapSelectedArticle.conflicts.length > 0 && <p className="mt-1 text-sm text-warning">{mapSelectedArticle.conflicts.join(" ")}</p>}
              </>}
              {mapSelectedSilo && <>
                <p className="mt-1 font-semibold text-foreground">SiloPage · {mapSelectedSilo.label}</p>
                <p className="mt-1 text-sm text-text-muted">Pilar: {mapSelectedSilo.pillarArticleId || "não definido"} · {mapSelectedSilo.supportArticleIds.length} suporte(s)</p>
                {mapSelectedSilo.published && <p className="mt-1 text-sm text-positive-soft">Publicado protegido: slug, URL e canonical preservados.</p>}
                {mapSelectedSilo.conflicts.length > 0 && <p className="mt-1 text-sm text-warning">{mapSelectedSilo.conflicts.join(" ")}</p>}
              </>}
              {mapSelectedKeyword && workspaceMode === "articles" && !mapSelectedArticle?.published && <label className="mt-3 block text-sm font-semibold text-text-muted">Mover keyword para grupo da working copy<select aria-label="Grupo destino da keyword" defaultValue="" onChange={event => { if (event.target.value) handleMapMoveKeywordToGroup(mapSelectedKeyword.id, event.target.value); }} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm text-foreground"><option value="">Escolher destino</option><option value="__none__">Não agrupadas</option><option value="__new__">Novo grupo provisório</option>{mapGroupOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
              {mapSelectedArticle && workspaceMode === "silos" && !mapSelectedArticle.siloCandidate && !mapSelectedArticle.published && <label className="mt-3 block text-sm font-semibold text-text-muted">Mover ArticleDNA para Silo da working copy<select aria-label="Silo destino do ArticleDNA" defaultValue="" onChange={event => { if (event.target.value) handleMapMoveArticleToSilo(mapSelectedArticle.id, event.target.value === "__none__" ? null : event.target.value); }} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm text-foreground"><option value="">Escolher destino</option><option value="__none__">Sem silo</option>{mapSiloOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
             </section>
             </div>
           </div>
        {workspaceMode === "articles" && pendingKeywordReview && (
          <section className="border-b border-warning/35 bg-warning/10 px-4 py-3" role="status">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-warning">Proposta de repartição pronta para revisão humana</p>
                <p className="mt-1 text-sm text-text-muted">
                  {materialKeywordArticleDecisions(pendingKeywordReview.review, keywordId => masterList.find(item => String(item.id) === String(keywordId))?.reviewRole as ManualKeywordRole | undefined).length} proposta(s) · {pendingKeywordReview.batchCount} artigo(s) processado(s) · {pendingKeywordReview.review.conflicts.length} conflito(s) · {rejectedKeywordReviewIds.size} rejeitada(s). Nada foi movido ou confirmado.
                </p>
                {Boolean(pendingKeywordReview.aiExecutionStates?.length) && (
                  <p className="mt-1 text-xs text-text-muted" data-testid="architect-ai-article-states">
                    {(["COMPLETED_WITH_PROPOSALS", "COMPLETED_NO_PROPOSALS", "ERROR"] as const).map(state => {
                      const label = state === "COMPLETED_WITH_PROPOSALS" ? "com proposta" : state === "COMPLETED_NO_PROPOSALS" ? "sem alteração estrutural" : "com erro";
                      return `${(pendingKeywordReview.aiExecutionStates || []).filter(item => item.state === state).length} ${label}`;
                    }).join(" · ")}
                  </p>
                )}
                {Boolean(pendingKeywordReview.aiRegistrationFailures?.length) && (
                  <div className="mt-2 rounded border border-warning/40 bg-warning/10 p-2" data-testid="architect-ai-registration-failures">
                    <p className="text-xs font-semibold text-warning">{pendingKeywordReview.aiRegistrationFailures?.length} artigo(s) revisado(s) sem registro canônico confirmado. A revisão vale nesta sessão; o resultado pode não sobreviver ao F5.</p>
                    <ul className="mt-1 space-y-1">
                      {pendingKeywordReview.aiRegistrationFailures?.map(failure => (
                        <li key={failure.articleId} className="text-xs text-text-muted">
                          <span className="font-semibold text-text-strong">{articleLabelFor(failure.articleId)}</span>: {failure.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Boolean(pendingKeywordReview.aiFailures?.length) && (
                  <div className="mt-2 rounded border border-danger/40 bg-danger/10 p-2" data-testid="architect-ai-article-failures">
                    <p className="text-xs font-semibold text-danger">{pendingKeywordReview.aiFailures?.length} artigo(s) não revisado(s) pela IA. Os demais mantêm as propostas válidas.</p>
                    <ul className="mt-1 space-y-1">
                      {pendingKeywordReview.aiFailures?.map(failure => (
                        <li key={failure.articleId} className="text-xs text-text-muted">
                          <span className="font-semibold text-text-strong">{articleLabelFor(failure.articleId)}</span>: {failure.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={applyPendingKeywordReview} className={ARCHITECT_UI.primaryButton}>Aplicar proposta para revisar</button>
                <button type="button" onClick={() => { setPendingKeywordReview(null); setRejectedKeywordReviewIds(new Set()); }} className={ARCHITECT_UI.toolbarButton}>Descartar proposta</button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {pendingKeywordReview.review.decisions.map(decision => {
                const diff = pendingKeywordReview.review.diff?.find(item => item.keywordId === decision.keywordId);
                const rejected = rejectedKeywordReviewIds.has(decision.keywordId);
                return <div key={decision.keywordId} className={`rounded-md border px-3 py-2 text-sm ${rejected ? "border-danger/40 bg-danger/10 opacity-70" : "border-warning/30 bg-surface-subtle"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground" title={decision.keywordId}>{decision.keywordId}</p>
                      <p className="mt-1 text-text-muted">
                        {decision.action} · grupo {decision.sourceGroupId} → {decision.targetGroupId || decision.newArticleKey || "mantido"} · papel {decision.suggestedRole}
                      </p>
                      <p className="mt-1 text-text-muted">{diff?.justification || decision.justification}</p>
                    </div>
                    <button type="button" aria-pressed={rejected} onClick={() => toggleRejectedKeywordReview(decision.keywordId)} className={`${ARCHITECT_UI.footerButton} shrink-0 ${rejected ? "border-danger/50 text-danger" : "border-warning/40 text-warning"}`}>
                      {rejected ? "Rejeitada" : "Rejeitar"}
                    </button>
                  </div>
                </div>;
              })}
            </div>
            <p className="mt-2 text-sm text-text-muted">
              Sequência IA: diagnosticar grupos → revisar pertencimento → revisar papéis → revisar canibalização → consolidar proposta. Aplicação permanece pendente de revisão humana e pode ser desfeita pelo histórico.
            </p>
          </section>
        )}
        {workspaceMode === "silos" && (pendingSiloReview || siloWorkingCopyUndo) && (
          <section className="border-b border-warning/35 bg-warning/10 px-4 py-3" data-testid="silo-review-proposal">
            {pendingSiloReview && <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-warning">Proposta de Silos pronta para decisão humana</p>
                  <p className="mt-1 text-sm text-text-muted">{pendingSiloReview.operations.length} operação(ões) · {rejectedSiloReviewIds.size} rejeitada(s). Nenhum SiloDNA ou SiloPage foi alterado.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={applyPendingSiloReview} className={ARCHITECT_UI.primaryButton}>Aplicar na working copy</button>
                  <button type="button" onClick={() => { setPendingSiloReview(null); setRejectedSiloReviewIds(new Set()); }} className={ARCHITECT_UI.toolbarButton}>Descartar proposta</button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {pendingSiloReview.operations.map(operation => {
                  const rejected = rejectedSiloReviewIds.has(operation.operationId);
                  return <div key={operation.operationId} className={`rounded-md border px-3 py-2 text-sm ${rejected ? "border-danger/40 bg-danger/10 opacity-70" : "border-warning/30 bg-surface-subtle"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{operation.operationId} · {operation.action}</p>
                        <p className="mt-1 text-text-muted">{operation.sourceSiloId}{operation.targetSiloId ? ` → ${operation.targetSiloId}` : ""}{operation.articleId ? ` · ArticleDNA ${operation.articleId}` : ""}</p>
                        <p className="mt-1 leading-6 text-text-muted">{operation.justification}</p>
                      </div>
                      <button type="button" aria-pressed={rejected} onClick={() => toggleRejectedSiloReview(operation.operationId)} className={`${ARCHITECT_UI.footerButton} shrink-0 ${rejected ? "border-danger/50 text-danger" : "border-warning/40 text-warning"}`}>{rejected ? "Rejeitada" : "Rejeitar"}</button>
                    </div>
                  </div>;
                })}
              </div>
              <p className="mt-2 text-sm text-text-muted">A IA sugere; o humano decide. A aplicação é reversível e não equivale a aprovação.</p>
            </>}
            {!pendingSiloReview && siloWorkingCopyUndo && <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-text-muted">A última aplicação da IA permanece reversível na working copy.</span><button type="button" onClick={undoSiloReview} className={ARCHITECT_UI.toolbarButton}>Desfazer revisão da IA</button></div>}
          </section>
        )}
        {/* Transparência: a cabeceira reservada aparece, mas NÃO vira artigo.
            A reserva é derivada e cai sozinha se a hipótese de silo cair. */}
        {workspaceMode === "articles" && reservedSiloHeadKeywords.length > 0 && (
          <section className="border-b border-module-accent/35 bg-module-accent/5 px-4 py-4" data-testid="architect-reserved-silo-heads">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-widest text-module-accent">Reservadas para Silo · {reservedSiloHeadKeywords.length}</span>
              <span className="text-sm text-text-muted">Cabeceira de silo candidato; volta para artigos se a hipótese cair</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {reservedSiloHeadKeywords.map(keyword => (
                <span key={String(keyword.id)} className="rounded border border-module-accent/40 bg-surface px-2 py-1 text-sm text-foreground">
                  {keyword.keyword}
                </span>
              ))}
            </div>
          </section>
        )}
        {workspaceMode === "articles" && ungroupedArticleKeywords.length > 0 && (
          <section className="border-b border-warning/35 bg-warning/10 px-4 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-widest text-warning">Keywords não agrupadas · {ungroupedArticleKeywords.length}</span>
              <span className="text-sm text-text-muted">Sem agrupamento inferido durante a recuperação</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ungroupedArticleKeywords.map(keyword => (
                <div key={String(keyword.id)} className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <span className="font-medium text-keyword" title="Keyword preservada sem vínculo recuperável com artigo ou grupo">{keyword.keyword}</span>
                  {keyword.siloCandidate?.status !== "candidate" && <button type="button" onClick={() => updateSiloCandidateDecision(keyword, "candidate", "Humano marcou a keyword como candidata a Silo.")} className="rounded border border-warning/50 px-2 py-1 text-xs font-semibold text-warning hover:bg-warning/15">Reservar como candidata</button>}
                </div>
              ))}
            </div>
          </section>
        )}
        {workspaceMode === "silos" && authoritativeSiloWorkingCopies.length > 0 && (
          <section className="border-b border-module-accent/35 bg-module-accent/10 px-4 py-4" data-testid="silo-working-copy">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-widest text-module-accent">Working copy de Silos · {authoritativeSiloWorkingCopies.length}</span>
              <span className="text-sm text-text-muted">{remoteSiloWorkingCopies.length ? "Autoridade remota: as decisões humanas estão persistidas no servidor." : "Rascunho local: nenhuma working copy foi persistida ainda."}</span>
            </div>
            {siloWorkingCopyConflict && (
              <p className="mb-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-sm leading-6 text-warning">{siloWorkingCopyConflict}</p>
            )}
            <div className="grid gap-2 lg:grid-cols-2">
              {authoritativeSiloWorkingCopies.map(entry => {
                const copy = entry.proposal;
                const remote = entry.remote;
                if (!copy && !remote) return null;
                // Nome, slug e composição vêm do REMOTO quando ele existe.
                const name = remote?.workingCopy.name ?? copy!.name;
                const slug = remote?.workingCopy.slug ?? copy!.slug;
                const articleIds = remote
                  ? remote.workingCopy.articleRefs.map(reference => reference.articleId)
                  : copy!.articleReferences.map(reference => reference.articleId);
                const pillarArticleId = remote
                  ? remote.workingCopy.pillarSelection?.articleId ?? ""
                  : copy!.pillarCandidateArticleId ?? "";
                const supportArticleIds = remote ? remote.workingCopy.supportArticleIds : copy!.supportArticleIds;
                const exclusions = remote ? remote.workingCopy.exclusions : [];
                const readOnly = entry.readOnly;
                const articleLabel = (articleId: string) => {
                  const article = acceptedArticleDnas[articleId]?.payload;
                  const reference = article?.keywordReferences.find(item => item.keywordId === article.principalKeywordId);
                  const keyword = reference?.keywordDnaSnapshot?.sourceKeywordSnapshot.keyword;
                  return typeof keyword === "string" && keyword.trim() ? keyword : articleId;
                };
                return <div key={entry.territoryRef} className="rounded-lg border border-module-accent/35 bg-surface-subtle p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground" title={name}>{name}</p>
                      <p className="mt-1 text-sm text-text-muted">/{slug} · {articleIds.length} ArticleDNA(s) · {entry.authority === "REMOTE" ? "persistida no servidor" : "proposta local"}</p>
                    </div>
                    <span className="shrink-0 rounded border border-module-accent/40 bg-module-accent/10 px-2 py-1 text-xs font-semibold text-module-accent">{readOnly ? "Consolidada" : entry.authority === "REMOTE" ? "Remota" : "Provisório"}</span>
                  </div>
                  <label className="mt-3 block text-sm font-semibold text-text-muted" htmlFor={`silo-pillar-${entry.territoryRef}`}>{remote ? "Pilar humano · decisão persistida" : "Pilar sugerido · ainda não é decisão"}</label>
                  <select id={`silo-pillar-${entry.territoryRef}`} value={pillarArticleId} disabled={readOnly} onChange={event => void chooseWorkingCopyPillar(entry.territoryRef, event.target.value)} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm text-foreground disabled:opacity-60">
                    <option value="">Sem Pilar decidido</option>
                    {articleIds.map(articleId => <option key={articleId} value={articleId}>{articleLabel(articleId)}</option>)}
                  </select>
                  <p className="mt-2 text-sm leading-6 text-text-muted">Suportes: {supportArticleIds.length ? supportArticleIds.map(articleLabel).join(" · ") : "nenhum"}</p>
                  {exclusions.length > 0 && <p className="mt-2 text-sm leading-6 text-text-muted">Excluídos por decisão humana: {exclusions.map(exclusion => articleLabel(exclusion.articleId)).join(" · ")}</p>}
                  {remote && !readOnly && (
                    <label className="mt-2 block text-sm font-semibold text-text-muted" htmlFor={`silo-exclude-${entry.territoryRef}`}>Excluir um Article deste Silo</label>
                  )}
                  {remote && !readOnly && (
                    <select id={`silo-exclude-${entry.territoryRef}`} value="" onChange={event => { if (event.target.value) void excludeWorkingCopyArticle(entry.territoryRef, event.target.value, "Excluído manualmente da working copy de Silo."); }} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm text-foreground">
                      <option value="">Nenhum</option>
                      {articleIds.filter(articleId => !exclusions.some(exclusion => exclusion.articleId === articleId)).map(articleId => <option key={articleId} value={articleId}>{articleLabel(articleId)}</option>)}
                    </select>
                  )}
                  {!!copy && copy.reasons.length > 0 && <p className="mt-2 text-sm leading-6 text-text-muted">{copy.reasons.at(-1)}</p>}
                  {!!copy && copy.conflicts.length > 0 && <p className="mt-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-sm leading-6 text-warning">{copy.conflicts.join(" ")}</p>}
                  {!!copy && copy.publishedProtection.protected && <p className="mt-2 rounded border border-positive-soft/35 bg-positive-soft/10 px-2 py-1.5 text-sm leading-6 text-positive-soft">Publicado protegido: marca, URL, slug e canonical preservados.</p>}
                  {copy && <p className="mt-2 text-sm leading-6 text-text-muted">SiloPage: /{copy.siloPage.slug} · universo distinto do Pilar{copy.siloPage.collisionReasons.length ? ` · colisão: ${copy.siloPage.collisionReasons.join(" ")}` : ""}</p>}
                </div>;
              })}
            </div>
          </section>
        )}
        {workspaceMode === "articles" && siloCandidateKeywords.length > 0 && (
          <section className="border-b border-context-accent/35 bg-context-accent/10 px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-widest text-context-accent">Candidatas provisórias a Silo · {siloCandidateKeywords.length}</span>
              <span className="text-sm text-text-muted">Reservadas na working copy; não criam Silo nem entram automaticamente em ArticleDNA.</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {siloCandidateKeywords.map(keyword => {
                const candidateEvidence = siloCandidateSerpEvidence.find(item => item.keywordId === keyword.id);
                return <div key={String(keyword.id)} className="rounded-lg border border-context-accent/35 bg-surface-subtle p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-keyword" title={keyword.keyword}>{keyword.keyword}</p>
                      <p className="mt-1 text-sm leading-6 text-text-muted">{keyword.siloCandidate?.reasons.join(" ")}</p>
                    </div>
                    <span className="shrink-0 rounded border border-context-accent/40 bg-context-accent/10 px-2 py-1 text-xs font-semibold text-context-accent">Hipótese</span>
                  </div>
                  {candidateEvidence && <p className="mt-2 rounded border border-divider bg-surface-subtle px-2 py-1.5 text-sm leading-6 text-text-muted">SERP observacional: {candidateEvidence.evidence.evidenceStatus === "observed" ? `${candidateEvidence.evidence.categoryHubLike === true ? "sinal de categoria/hub" : "amplitude não confirmada"} · ${candidateEvidence.evidence.multipleNeeds === true ? "múltiplas necessidades" : "necessidades não observadas"}` : "evidência insuficiente; a candidata permanece apenas hipótese"}. Nenhuma criação de Silo foi feita.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleUseSiloCandidateAsArticle(keyword)} className={ARCHITECT_UI.footerButton}>Usar em artigo</button>
                    <button type="button" onClick={() => updateSiloCandidateDecision(keyword, "not_candidate", "Humano removeu a reserva de candidata a Silo.")} className={`${ARCHITECT_UI.footerButton} border-warning/40 text-warning hover:border-warning`}>Remover marcação</button>
                  </div>
                </div>;
              })}
            </div>
          </section>
        )}
          </div>
          <div className="min-h-0 min-w-0 overflow-hidden p-0">
            <ArchitectArchitectureMap
              clusterFlow={workspaceMode === "silos" ? architectureFlow : null}
              articleFlow={workspaceMode === "articles" ? articleFlow : null}
              mode={workspaceMode}
              snapshots={architectureMapSnapshots}
              expanded={mapExpanded}
              scenario={mapState.scenario}
              compare={mapState.compare}
              selectedArticleIds={selectedArticleIds}
              visibleArticleIds={mapVisibleArticleIds}
              onExpandedChange={setMapExpanded}
              onFocusArticle={handleMapFocusArticle}
              links={{
                approvedGraph: linksApprovedGraph,
                workingCopy: linksWorkingCopy,
                scenario: linksScenario,
                selectedNodeId: linksSelectedNodeId,
                nodeDisplay: linkNodeDisplay,
                selectedEdgeId: linksSelectedEdgeId,
                onScenarioChange: setLinksScenario,
                onFocusNode: setLinksSelectedNodeId,
                onFocusEdge: setLinksSelectedEdgeId,
                onCreateEdge: (sourceNodeId, targetNodeId) => { void handleCreateLinkEdge(sourceNodeId, targetNodeId); },
              }}
              onStateChange={handleMapStateChange}
              onScenarioChange={handleMapScenarioChange}
            />
          </div>
        </div>
        {canonicalBootstrapError ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center text-danger">
            <span className="text-base">Não foi possível carregar os dados do Arquiteto.</span>
            <span className="text-sm text-danger/80">
              Tente novamente mais tarde. O estado anterior foi preservado.
            </span>
          </div>
        ) : canonicalBootstrapStatus === "LOADING" ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-module-accent" />
          </div>
        ) : workspaceMode !== "silos" && filteredArticles.length === 0 && !visiblePipelineRows.length ? (
          // O vazio de Article não pode apagar a mesa territorial: no modo Silos
          // quem responde pelo estado vazio é a própria superfície territorial.
          // Nem pode apagar as keywords que aguardam decisão de Silo: enquanto
          // houver linha de pipeline, a mesa continua na tela.
          <div
            className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center text-text-muted"
            data-testid="architect-articles-empty"
            data-pipeline-rows={visiblePipelineRows.length}
          >
            <span className="text-base">
              {masterList.length === 0
                ? "Nenhum artigo disponível. Use Importar do Minerador."
                : "Nenhum artigo corresponde aos filtros."}
            </span>
          </div>
        ) : (
          <div ref={articleTableRef} className="architect-scrollbar w-full overflow-x-auto">
            <table data-architect-table="articles" className="w-full table-fixed border-collapse text-left text-sm tracking-wide">
              <colgroup>
                {architectColumnIds.map(columnId => <col key={columnId} data-architect-table-column={columnId} style={{ width: articleColumnWidths[columnId] }} />)}
              </colgroup>
              <thead className="sticky top-0 z-30 border-b border-divider bg-surface-elevated">
                {/* Uma mesa só: o modo Silos tem colunas próprias (Território →
                    KeywordDNA); Artigos e Links mantêm os cabeçalhos deles. */}
                {workspaceMode === "silos"
                  ? (siloView === "sitemap" ? <SitemapViewHeader /> : <TerritorialWorkspaceHeader />)
                  : (
                <tr className="text-xs font-semibold text-text-muted">
                  <th className="sticky left-0 z-40 border-r border-divider bg-surface-elevated px-2 py-2 text-right">#<KeywordTableColumnResizeHandle columnId="index" label="número" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-2 py-2">
                    <div className="relative flex items-center gap-1" ref={selectionMenuRef}>
                      <input
                        type="checkbox"
                        role="checkbox"
                        ref={headerSelectionRef}
                        checked={allVisibleArticlesSelected}
                        aria-checked={someVisibleArticlesSelected ? "mixed" : allVisibleArticlesSelected}
                        onChange={() => {
                          markSelectionInteraction("visible-toggle");
                          setSelectedArticleIds(current => toggleVisibleArticleSelection(current, visibleArticleIds));
                          setSelectionMenuOpen(false);
                        }}
                        className="h-4 w-4 cursor-pointer rounded border-slate-700 bg-slate-950 accent-blue-500"
                        aria-label="Selecionar ou desmarcar todos os artigos visíveis"
                        title="Selecionar tudo que esta visivel"
                      />
                      <button
                        onClick={() => setSelectionMenuOpen(v => !v)}
                        className={`${ARCHITECT_UI.iconButton} min-h-8 min-w-8 border-transparent`}
                        title="Opcoes de selecao"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                      {selectionMenuOpen && (
                        <div className="absolute left-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl normal-case tracking-normal">
                          <button
                            onClick={() => selectArticles(filteredArticles.map(art => art.id))}
                            className="w-full cursor-pointer px-4 py-3 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800"
                          >
                            Selecionar Tudo
                          </button>
                          <button
                            onClick={() => selectArticles(filteredArticles.filter(art => !art.isPublished).map(art => art.id))}
                            className="w-full cursor-pointer px-4 py-3 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800"
                          >
                            Selecionar Apenas Novos (Aprovados)
                          </button>
                          <div className="border-y border-slate-800 py-2">
                            <span className="block px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                              Selecionar Grupo/Cor Especifico
                            </span>
                            {groupedArticles.map(group => (
                              <button
                                key={group.key}
                                onClick={() => selectGroup(group.articles.map(art => art.id))}
                                className="w-full cursor-pointer truncate px-4 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
                              >
                                 {group.siloName} ({group.articles.length})
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => selectArticles([])}
                            className="w-full cursor-pointer px-4 py-3 text-left text-sm text-slate-400 transition-colors hover:bg-slate-800"
                          >
                            Desmarcar Tudo
                          </button>
                        </div>
                      )}
                    </div>
                    <KeywordTableColumnResizeHandle columnId="selection" label="seleção" onStart={columnResize.startResize} />
                  </th>
                  <th className="relative border-r border-divider px-2 py-2">{/* chevron */}<KeywordTableColumnResizeHandle columnId="expand" label="expandir" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-3 py-2">Artigo<KeywordTableColumnResizeHandle columnId="article" label="Artigo" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-3 py-2">Keyword principal<KeywordTableColumnResizeHandle columnId="keyword" label="Keyword principal" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-2 py-2 text-center">Quantidade de keywords<KeywordTableColumnResizeHandle columnId="keywordCount" label="Quantidade de keywords" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-2 py-2 text-center">Revisão IA<KeywordTableColumnResizeHandle columnId="aiReview" label="Revisão IA" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-2 py-2 text-center">Definição do artigo<KeywordTableColumnResizeHandle columnId="articleDefinition" label="Definição do artigo" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-2 py-2">Silo<KeywordTableColumnResizeHandle columnId="silo" label="Silo" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-2 py-2 text-right">Ações<KeywordTableColumnResizeHandle columnId="actions" label="Ações" onStart={columnResize.startResize} /></th>
                  <th className="relative border-r border-divider px-2 py-2">Aprovação<KeywordTableColumnResizeHandle columnId="approval" label="Aprovação" onStart={columnResize.startResize} /></th>
                  <th className="relative px-2 py-2">Status<KeywordTableColumnResizeHandle columnId="status" label="Status" onStart={columnResize.startResize} /></th>
                </tr>
                )}
              </thead>

              <tbody>
                {/* Modo Silos projeta Territory → KeywordDNA; a linha de Article
                    pertence ao modo Artigos e não é requisito desta aba. */}
                {workspaceMode === "silos" && siloView === "sitemap" && (
                  <SitemapViewRows
                    view={sitemapView}
                    busyUrl={siteStructureBusyUrl}
                    onUseAsSilo={normalizedUrl => { void promoteSiteStructureToSilo(normalizedUrl); }}
                  />
                )}
                {workspaceMode === "silos" && siloView === "architecture" && (
                  <TerritorialWorkspaceRows
                    processingByRef={siloRowProjections.processing}
                    decisionByRef={siloRowProjections.decision}
                    detailsByRef={siloRowProjections.details}
                    confirmControls={{
                      busyRef: siloConfirmBusyRef,
                      onConfirm: territoryRef => { void confirmSiloCandidate(territoryRef); },
                      onDefineContext: openSiloContextEditor,
                    }}
                    siteControls={{
                      busyUrl: siteStructureBusyUrl,
                      onUseAsSilo: normalizedUrl => { void promoteSiteStructureToSilo(normalizedUrl); },
                    }}
                    controls={{
                      // Só entra na lista o que aceita keyword agora; consolidado
                      // e arquivado ficam de fora em vez de falhar no writer.
                      // O rótulo diz de onde o silo veio: manual, site ou já existente.
                      territories: [...territorialSurface.landscape.candidateTerritories, ...territorialSurface.landscape.confirmedTerritories]
                        .map(territory => ({
                          territoryRef: territory.territoryRef,
                          label: `${territory.name || territory.centralEntity || "Silo sem nome"} · ${territory.publishedStructureRef ? "Site" : territory.architecturalOrigin === "manual_strategic" ? "Manual" : "Existente"}`,
                        })),
                      // Estrutura sem registro interno: escolher uma ancora antes.
                      structures: territorialSurface.landscape.existingStructures
                        .filter(structure => !structure.anchoredByTerritoryRef && structure.versionId && structure.contentHash)
                        .map(structure => ({ siloId: structure.siloId, label: structure.name || structure.siloId })),
                      busyKeywordId: siloDecisionBusyKeywordId,
                      onAssign: (keywordId, target) => { void applySiloDecision(keywordId, target); },
                      onCreateSilo: () => { setNewListName(""); setNewSiloSlug(""); setSlugManuallyEdited(false); setIsListModalOpen(true); },
                    }}
                    surface={scopedTerritorialSurface}
                    keywordLabelFor={keywordId => masterList.find(item => String(item.id) === keywordId)?.keyword || keywordId}
                  />
                )}
                {/* A MESMA linha de Article de sempre, agora ordenada e
                    encabeçada pela SiloPage a que pertence. */}
                {(workspaceMode === "silos" ? [] : groupedArticles).map((group, groupIndex) => {
                  const siloPaletteSize = SILO_COLORS.length;
                  const siloColor = SILO_COLORS[groupIndex % siloPaletteSize];
                  const groupArticleIds = group.articles.map(art => art.id);
                  const groupHasPublished = group.articles.some(art => art.isPublished);
                  const allGroupSelected = groupArticleIds.length > 0 && groupArticleIds.every(id => selectedArticleIds.has(id));
                  const someGroupSelected = !allGroupSelected && groupArticleIds.some(id => selectedArticleIds.has(id));
                   const hasCanonicalSilo = !articleMode && Boolean(group.siloId);

                  return (
                    <React.Fragment key={group.key}>
                      {!articleMode && <>
                      {/* Cabeçalho do Silo — somente informações, ações ficam no rodapé */}
                      <tr className={`border-l-2 ${siloColor.border} border-y border-slate-800/70 bg-slate-900/45`}>
                        <td colSpan={12} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                              {/* Checkbox da Página do Silo (teal) — sempre visível, disabled sem SiloDNA */}
                              {hasCanonicalSilo && (() => {
                                const pageEntityId = `silo-page:${group.siloId}`;
                                const siloDnaExists = Boolean(acceptedSiloDnas[String(group.siloId)]);
                                return (
                                  <input
                                    type="checkbox"
                                    role="checkbox"
                                    checked={selectedSiloPageIds.has(pageEntityId)}
                                    aria-checked={selectedSiloPageIds.has(pageEntityId)}
                                    aria-label={`Selecionar Página do Silo ${group.siloName}`}
                                    data-silo-page-selection-id={pageEntityId}
                                    onClick={event => event.stopPropagation()}
                                    onChange={event => { event.stopPropagation(); toggleSiloPageSelection(pageEntityId); }}
                                    disabled={!siloDnaExists}
                                    className="h-3.5 w-3.5 cursor-pointer rounded border-divider bg-surface-subtle accent-module-accent disabled:cursor-not-allowed disabled:opacity-30"
                                    title={siloDnaExists ? "Selecionar Página do Silo" : "Gere a arquitetura do silo primeiro para trabalhar a página do silo"}
                                  />
                                );
                              })()}
                              {/* Expand/collapse do Silo */}
                              {hasCanonicalSilo && (
                                <button onClick={() => toggleSiloExpand(String(group.siloId))}
                                  className="text-slate-500 hover:text-teal-300 transition-colors cursor-pointer p-0.5"
                                  title="Ver/editar detalhes do Silo">
                                  {expandedSiloIds.has(String(group.siloId)) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {/* Checkbox dos artigos (azul) — selecionar todos do silo */}
                              <input
                                type="checkbox"
                                role="checkbox"
                                checked={allGroupSelected}
                                ref={input => { if (input) input.indeterminate = someGroupSelected; }}
                                aria-checked={someGroupSelected ? "mixed" : allGroupSelected}
                                 aria-label={group.siloRef || hasCanonicalSilo ? `Selecionar artigos visíveis do silo ${group.siloName}` : articleMode ? "Selecionar artigos em formação" : "Selecionar artigos visíveis sem silo"}
                                data-article-group-selection-id={group.key}
                                onClick={event => event.stopPropagation()}
                                onChange={event => { event.stopPropagation(); toggleVisibleSiloArticleSelection(groupArticleIds, "group"); }}
                                className="h-3.5 w-3.5 cursor-pointer rounded border-divider bg-surface-subtle accent-module-accent"
                                 title={group.siloRef || hasCanonicalSilo ? "Selecionar artigos visíveis deste silo" : articleMode ? "Selecionar artigos em formação" : "Selecionar artigos visíveis sem silo"}
                              />
                              <div className="min-w-0 flex items-center gap-2">
                                <span className={`text-sm font-semibold ${siloColor.headerText}`}>
                                   {group.siloName}
                                </span>
                                {hasCanonicalSilo && <span className="truncate font-mono text-sm text-blue-200 select-all">/{group.siloSlug}</span>}
                                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium text-slate-300 ${siloColor.countBg} ${siloColor.countBorder}`}>
                                  {group.articles.length} {group.articles.length === 1 ? "artigo" : "artigos"}
                                </span>
                                {/* SiloDNA badge */}
                                {hasCanonicalSilo && (() => {
                                  const sdna = acceptedSiloDnas[String(group.siloId)];
                                  if (!sdna) return null;
                                  return <span className="shrink-0 rounded border border-emerald-900/60 bg-emerald-950/30 px-1.5 py-0.5 text-[8px] font-bold text-emerald-300" title={`Arquitetura do silo: ${sdna.versionId}`}>Silo ID · v{sdna.versionNumber}</span>;
                                })()}
                                {/* SiloPage badge — sempre visível */}
                                {hasCanonicalSilo && (() => {
                                  const pageEntityId = `silo-page:${group.siloId}`;
                                  const pv = acceptedSiloPages[pageEntityId];
                                  if (!pv) return <span className="shrink-0 rounded border border-slate-800 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">Pagina Pendente</span>;
                                  return (
                                    <span className="shrink-0 rounded border border-teal-900/60 bg-teal-950/30 px-1.5 py-0.5 text-[8px] font-bold text-teal-300" title={`Página do Silo: ${pv.versionId}`}>
                                      Pagina ID . v{pv.versionNumber}
                                    </span>
                                  );
                                })()}

                                {groupHasPublished && (
                                  <span className="shrink-0 rounded border border-slate-700/70 bg-slate-950 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                                    Publicados protegidos
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Lado direito: somente status badges em somente leitura */}
                            <div className="flex items-center gap-2">
                              {hasCanonicalSilo && (() => {
                                const ps = siloPageStatus(String(group.siloId));
                                if (ps === "none") return null;
                                return <WorkflowStatusBadge status={ps} density="comfortable" />;
                              })()}
                              {hasCanonicalSilo && String(group.siloId).startsWith("tmp-") && !groupHasPublished && (
                                <button
                                  onClick={() => handleDeleteSiloGroup(group)}
                                  className="shrink-0 text-slate-600 hover:text-rose-400 transition-colors cursor-pointer p-1"
                                  title="Apagar Silo novo e devolver artigos para Sem Grupo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Painel expansível — somente leitura, status controlado pelo rodapé */}
                      {hasCanonicalSilo && expandedSiloIds.has(String(group.siloId)) && (() => {
                        const pageEntityId = `silo-page:${group.siloId}`;
                        const pageVersion = acceptedSiloPages[pageEntityId];
                        const siloDnaVersion = acceptedSiloDnas[String(group.siloId)];
                        return (
                          <tr className="border-b border-divider bg-surface">
                            <td colSpan={12} className="border-l-2 border-l-module-accent px-6 py-6 lg:px-10">
                              <div className="rounded-lg border border-teal-800/50 bg-teal-950/20 p-5">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2 mb-3">
                                  <div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-teal-400">Página do Silo</span>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Página publicável do silo — diferente da arquitetura estratégica do silo.</p>
                                  </div>
                                  {pageVersion && (
                                    <span className="rounded border border-teal-900/60 bg-teal-950/30 px-2 py-0.5 text-[9px] font-bold text-teal-300">
                                      ID · v{pageVersion.versionNumber}
                                    </span>
                                  )}
                                </div>
                                {pageVersion ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Slug</dt><dd className="mt-0.5 text-teal-300 font-mono">/{pageVersion.payload.slug}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Publicação</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.publicationStatus === "published" ? "Publicado" : "Novo"} · verificação {pageVersion.payload.publicationVerification.status}</dd>{pageVersion.payload.publishedUrl && <a href={pageVersion.payload.publishedUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-teal-300 hover:text-teal-200" title={pageVersion.payload.publishedUrl}>{pageVersion.payload.publishedUrl}</a>}{pageVersion.payload.publicationStatus === "published" && pageVersion.payload.publishedUrl && <button type="button" onClick={() => void handleVerifySiloPage(pageVersion)} disabled={verifyingSiloPageId === pageVersion.payload.siloPageId} className="mt-1 rounded border border-teal-900/70 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-teal-300 hover:border-teal-700 disabled:opacity-40">{verifyingSiloPageId === pageVersion.payload.siloPageId ? "Conferindo…" : "Conferir identidade"}</button>}</div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">H1</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.h1}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">SEO Title</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.seoTitle}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Meta Description</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.metaDescription}</dd></div>
                                    <div className="sm:col-span-2"><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Introdução</dt><dd className="mt-0.5 text-slate-300 leading-relaxed">{pageVersion.payload.intro}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">CTA</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.cta}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Indexação</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.indexationStatus}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Seções</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.sections.length} seção(ões)</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Pilar</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.pillarArticleId || "—"}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Suportes</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.supportArticleIds.join(", ") || "—"}</dd></div>
                                    {pageVersion.payload.humanPendingDecisions.length > 0 && (
                                      <div className="sm:col-span-2 rounded border border-amber-900/40 bg-amber-950/20 p-2">
                                        <dt className="text-[8px] font-bold uppercase tracking-wider text-amber-400">Pendências humanas</dt>
                                        <dd className="mt-0.5 text-amber-300">{pageVersion.payload.humanPendingDecisions.join(" · ")}</dd>
                                      </div>
                                    )}
                                  </div>
                                ) : siloDnaVersion ? (
                                  <p className="text-[10px] text-slate-400">A arquitetura do silo existe (ID · v{siloDnaVersion.versionNumber}) mas a Página do Silo ainda não foi gerada. Use o rodapé para gerar.</p>
                                ) : (
                                  <p className="text-[10px] text-slate-500">Gere a arquitetura do silo primeiro para poder criar a página do silo.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}

                      </>}

                      {/* Modo Artigos: a SiloPage é a page raiz do grupo e o
                          patrimônio publicado vem logo abaixo. As duas são
                          rows selecionáveis, não decoração. */}
                      {articleMode && group.siloRef && (() => {
                        const view = articleSiloViews.find(item => item.siloRef === group.siloRef);
                        if (!view) return null;
                        const pageId = `silo-page:${view.siloRef}`;
                        return (
                          <ArticleSiloPageRow
                            view={view}
                            selected={selectedSiloPageIds.has(pageId)}
                            expanded={expandedArticleRefs.has(view.siloRef)}
                            onToggleSelected={() => toggleSiloPageSelection(pageId)}
                            onToggleExpanded={() => toggleArticleUnitExpansion(view.siloRef)}
                          />
                        );
                      })()}
                      {/* A folha do sitemap não entra como Article: o Site
                          conhece a URL, não o DNA editorial dela. A evidência
                          continua no catálogo e serve para reconciliar. */}

                      {group.articles.map((art) => (
                        <MemoizedArticleRow
                          key={art.id}
                          articleId={art.id}
                          processTab={expandedProcessTabs[art.id] || "logic"}
                          revision={articleTableRenderRevision}
                          selected={selectedArticleIds.has(art.id)}
                          render={() => {
                  const isExpanded = expandedIds.has(art.id);
                   const currentSlug = customSlugs[art.id] ?? art.slug;
                   const workflowStatus = articleWorkflowStatus(art);
                   const approvalStatus = articleApprovalStatus(art);
                   const articleEntityId = art.isPublished
                     ? art.mainKeywordObj?.id
                     : art.mainKeywordObj?.provisionalGroupId || art.briefingId;
                   const provisionalGroup = provisionalGroups.find(group => group.id === (art.mainKeywordObj?.provisionalGroupId || art.briefingId));
                   const articleDnaVersion = articleDnaForGrid(articleEntityId, art.candidateRef);
                   const articleIdentityContext = articleSerpIdentityFor(art);
                   const kgrBoundSlug = articleDnaVersion?.payload.kgrIdentity?.boundSlug || art.mainKeywordObj?.kgrIdentity?.boundSlug || null;
                   const siloDnaVersion = art.siloId ? acceptedSiloDnas[String(art.siloId)] : undefined;
                   const articleDnaStatus = articleDnaVersion ? effectiveVersionStatus(articleDnaVersion.versionId, versionEvents) : null;
                    const articleProcess = articleProcessReadModelFor(art);
                    const pendingAiReview = articleProcess.review.state === "PENDING";
                    const pendingArticleDecisions = (pendingKeywordReview?.review.decisions || []).filter(decision => [art.mainKeywordObj, ...art.supportKeywords].some(keyword => String(keyword?.id) === String(decision.keywordId)));
                    const expandedPanelSummary = art.mainKeywordObj
                      ? summarizeArticleExpandedPanel(art.mainKeywordObj, art.supportKeywords)
                      : null;
                    const articleKgr = articleKgrDecisionFor(art);
                    const { classification: articleClassification } = articleClassificationFor(art);
                    const articleSiloReadiness = articleSiloReadinessFor(art, articleProcess, articleKgr);
                    const articleRadarReadiness = articleRadarReadinessFor(art, articleSiloReadiness);
                    const articleAiReadout = articleAiReadoutFor(art);
                    const expandedProcessTab = expandedProcessTabs[art.id] || "logic";
                    const articleSerpVerdict = articleSerpVerdictFor(art);
                    const expandedUnitSuggestion: EditorialUnitClassification | null = articleDnaVersion
                      ? articleDnaVersion.payload.unitClassification || suggestEditorialUnitClassification({ principal: art.mainKeywordObj, article: articleDnaVersion.payload, published: art.isPublished })
                      : null;
                    const expandedUnitDraft = expandedUnitSuggestion
                      ? unitDrafts[art.id] || { type: expandedUnitSuggestion.type, landingPagePurpose: expandedUnitSuggestion.landingPagePurpose || "unknown" }
                      : null;
                    const articleReview = articleReviewChecklistFor(art, articleKgr, expandedUnitSuggestion);

                  return (
                    <React.Fragment key={art.id}>
                      {/* Linha do Artigo */}
                      <tr
                        id={`article-row-${art.id}`}
                        data-article-selection-id={art.id}
                        data-article-expanded={isExpanded ? "true" : "false"}
                        className={`border-b border-divider transition-colors ${isExpanded ? "border-l-2 border-l-module-accent bg-surface-elevated hover:bg-surface-elevated" : art.isPublished ? "border-l-2 border-l-danger" : ""} ${pendingAiReview ? "border-l-2 border-l-warning" : ""} ${isExpanded ? "" : selectedArticleIds.has(art.id) ? "bg-selected hover:bg-surface-elevated" : art.isPublished ? "bg-danger-soft hover:bg-surface-elevated" : "hover:bg-surface-elevated"}`}
                      >

                        <td className="sticky left-0 z-10 w-9 border-r border-slate-800/60 bg-slate-950 px-2 py-1 text-right font-mono text-[11px] tabular-nums text-slate-500">
                          {filteredArticles.findIndex(candidate => candidate.id === art.id) + 1}
                        </td>

                        <MemoizedArticleSelectionCell
                          id={art.id}
                          isPublished={art.isPublished}
                          selected={selectedArticleIds.has(art.id)}
                          onClick={handleArticleSelectionClick}
                          onPointerDown={handleSelectionPointerDown}
                          onPointerMove={handleSelectionPointerMove}
                          onPointerUp={handleSelectionPointerUp}
                          onPointerCancel={handleSelectionPointerCancel}
                          onLostPointerCapture={handleSelectionLostPointerCapture}
                        />

                        <MemoizedArticleSubtree revision={articleTableRenderRevision} processTab={expandedProcessTab} render={() => (
                          <>
                        {/* Seta Chevron */}
                        <td className="w-10 border-r border-slate-800/60 px-2 py-1 text-center">
                          <button onClick={() => toggleExpand(art.id)}
                            className={`${ARCHITECT_UI.iconButton} min-h-7 min-w-7 border-transparent ${isExpanded ? "text-module-accent" : ""}`}>
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        </td>

                        {/* Artigo */}
                        <td className="border-r border-slate-800/60 px-3 py-2">{/* O rótulo diz o que a unidade É: com ArticleDNA canônico ela deixou de estar "em formação". */}<p className={`text-sm font-semibold uppercase tracking-wider ${art.isPublished ? "text-success" : articleDnaVersion ? "text-positive-soft" : "text-module-accent"}`}>{art.isPublished ? "ARTICLE · PUBLICADO" : articleDnaVersion ? "ARTICLE" : "CANDIDATO"}</p><p className="mt-0.5 text-xs text-text-muted">{art.isPublished ? "canonical protegido" : articleDnaVersion ? `v${articleDnaVersion.versionNumber}` : "ainda não confirmado"}</p></td>
                        {/* Keyword principal */}
                        <td className="min-w-0 border-r border-slate-800/60 px-3 py-2"><p className="break-words text-sm font-semibold text-keyword" title={art.keywordPrincipal}>{art.keywordPrincipal}</p>{art.isPublished ? (publicationUrlFor(art) ? <a href={publicationUrlFor(art)!} target="_blank" rel="noopener noreferrer" className="mt-1 block max-w-[280px] truncate font-mono text-xs text-identity-published underline decoration-identity-published/50 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus select-all">{publicationUrlFor(art)}</a> : <span className="mt-1 block truncate font-mono text-xs text-identity-published">URL não recebida · /{art.slug}</span>) : <input type="text" value={articleIdentityContext.slugProtected && kgrBoundSlug ? kgrBoundSlug : currentSlug} onFocus={() => pushMasterHistory(masterList, `Editar slug de ${art.keywordPrincipal}`)} onChange={e => { if (!articleIdentityContext.slugProtected) setCustomSlugs(prev => ({ ...prev, [art.id]: e.target.value })); }} onBlur={e => { if (!articleIdentityContext.slugProtected) persistArticleIdentityField(art, "computedSlug", e.target.value); }} disabled={articleIdentityContext.slugProtected} className={`${ARCHITECT_UI.control} mt-1 h-7 w-full max-w-[280px] font-mono text-xs text-identity-new disabled:cursor-not-allowed disabled:opacity-70`} />}</td>
                        <td className="border-r border-slate-800/60 px-2 py-2 text-center text-sm text-foreground">{art.supportKeywords.length + 1} {art.supportKeywords.length === 0 ? "keyword" : "keywords"}</td>
<td className="border-r border-slate-800/60 px-2 py-2 text-center">{articleProcess.ai.state === "NOT_RUN" ? <span className="text-xs text-text-muted">Não executada</span> : articleProcess.ai.state === "STALE" ? <button type="button" onClick={() => { setExpandedIds(current => new Set(current).add(art.id)); setExpandedProcessTabs(current => ({ ...current, [art.id]: "ai" })); }} className="min-h-8 rounded-md border border-warning/40 bg-warning-soft px-2 text-xs font-medium text-warning" title="A estrutura mudou depois desta revisão; as propostas anteriores são históricas">Desatualizada</button> : <button type="button" onClick={() => { setExpandedIds(current => new Set(current).add(art.id)); setExpandedProcessTabs(current => ({ ...current, [art.id]: "review" })); }} className={`min-h-8 rounded-md border px-2 text-xs font-medium ${articleProcess.review.state === "PENDING" ? "border-warning/40 bg-warning-soft text-warning" : "border-success/35 bg-success-soft text-success"}`} title="Abrir a revisão humana das propostas da IA">{articleProcess.review.state === "PENDING" ? `${articleProcess.review.pendingCount} pendente(s)` : articleProcess.review.state === "IN_REVIEW" ? "Em revisão" : "Revisada"}</button>}</td>
                        <td className="border-r border-divider px-2 py-2 text-center">{articleDnaVersion ? <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${articleDnaStatus === "approved" ? "border-positive-soft/35 bg-positive-soft/10 text-positive-soft" : "border-context-accent/35 bg-context-accent/10 text-context-accent"}`}>{articleDnaStatus === "approved" ? `Consolidado · v${articleDnaVersion.versionNumber}` : `Em revisão · v${articleDnaVersion.versionNumber}`}</span> : <span className="text-xs text-text-muted">Pendente</span>}</td>
                        <td className="border-r border-divider px-2 py-2">{(() => { const pai = articleParentFor(art); if (!(pai.state === "CANONICAL_SILO" && art.siloId)) return <span className={`text-xs ${pai.hasParent ? "text-foreground" : "text-text-muted"}`} title={pai.hasParent ? "O Silo foi confirmado na fase Silos. Consolidar SiloDNA e SiloPage é a etapa seguinte e não desfaz esse vínculo." : "O artigo não declara a que Silo pertence: não há pai editorial."}>{articleParentLabel(pai)}</span>; return <div className="space-y-1"><p className="break-words text-sm font-medium text-foreground">{pai.label}</p><select value={art.hierarquia || ""} onFocus={() => pushMasterHistory(masterList, `Editar hierarquia de ${art.keywordPrincipal}`)} onChange={e => setCustomHierarquias(prev => ({ ...prev, [art.id]: e.target.value, [art.briefingId]: e.target.value }))} onBlur={e => persistArticleIdentityField(art, "computedHierarquia", e.target.value)} className={`${ARCHITECT_UI.control} h-7 w-full text-xs`}><option value="Pilar" className="bg-surface-elevated">Pilar</option>{Array.from({ length: Math.max(group.articles.length - 1, 1) }, (_, idx) => `Suporte ${idx + 1}`).map(option => <option key={option} value={option} className="bg-surface-elevated">{option}</option>)}</select></div>; })()}</td>
                        <td className="border-r border-divider px-2 py-2">{!art.isPublished ? <div className="flex items-center justify-end gap-1.5"><button onClick={() => handleDetachArticle(art)} className={`${ARCHITECT_UI.iconButton} min-h-8 min-w-8 border-transparent`} title="Remover do Grupo" aria-label={`Remover ${art.keywordPrincipal} do grupo`}><Unlink className="w-3.5 h-3.5" /></button>{articleMode ? <span className="text-xs text-text-muted">Silos pendentes</span> : !art.siloId ? <span className="text-xs text-text-muted" title="O Silo do artigo foi decidido na fase Silos; aqui não se troca de Silo.">Silo definido na fase Silos</span> : <select value={art.siloId || ""} onChange={e => handleMoveArticleToSilo(art, e.target.value)} className={`${ARCHITECT_UI.control} h-8 max-w-[145px] text-xs`} title="Mudar de Silo"><option value="" className="bg-surface-elevated">Sem silo</option>{siloOptions.map(silo => <option key={silo.id} value={silo.id} className="bg-surface-elevated">{silo.nome}</option>)}</select>}</div> : <div className="flex flex-col items-end gap-1"><span className="flex items-center justify-end gap-1 text-right text-xs font-medium text-text-muted"><ShieldCheck className="w-3 h-3" />{articleMode ? "Identidade protegida" : "URL/Silo protegidos"}</span>{publicationUrlFor(art) && <button onClick={() => void handleVerifyPublication(art)} disabled={verificationBusy.has(art.id)} className={`${ARCHITECT_UI.toolbarButton} min-h-8 px-2 text-xs`}>{verificationBusy.has(art.id) ? "Verificando…" : "Verificar identidade"}</button>}</div>}</td>
                        <td className="overflow-hidden border-r border-divider px-2 py-2"><WorkflowStatusBadge status={approvalStatus} density="comfortable" /></td>
                        <td className="overflow-hidden px-2 py-2"><WorkflowStatusBadge status={["published", "sent_radar"].includes(workflowStatus) ? workflowStatus : articleReview.statusBadge} density="comfortable" /></td></>
                        )} />
                       </tr>

                      {/* Acordeão Expandido do Artigo */}
                      {isExpanded && (
                        <MemoizedArticleSubtree revision={articleTableRenderRevision} processTab={expandedProcessTab} render={() => (
                          <tr className="border-b border-divider bg-surface">
                          <td colSpan={12} className="border-l-2 border-l-module-accent px-6 py-6 lg:px-10">
                            <section data-testid="architect-article-expanded-panel" className="border-b border-divider pb-4 pl-4">
                              <header className="border-b border-divider pb-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground">Resumo do artigo</p>
                                    <p className="mt-1 break-words text-base font-semibold text-keyword">{art.keywordPrincipal}</p>
                                  </div>
                                  <span className="rounded-md border border-divider bg-surface-subtle px-2 py-1 text-sm font-medium text-foreground">{art.isPublished ? "Publicado" : "Novo"}</span>
                                </div>
                                {expandedPanelSummary && <dl className="mt-3 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-8">
                                  <div><dt className="text-text-muted">Volume</dt><dd className="mt-0.5 font-medium text-foreground">Principal: {expandedPanelSummary.volume.principal?.toLocaleString("pt-BR") ?? "—"}{expandedPanelSummary.keywordCount > 1 && <span className="block text-text-muted">Σ {expandedPanelSummary.volume.total?.toLocaleString("pt-BR") ?? "—"} · μ {expandedPanelSummary.volume.average?.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) ?? "—"} <InfoHint title="Volume derivado" description="Soma e média são comparações arquiteturais da working copy; não representam previsão de tráfego." /></span>}</dd></div>
                                  <div><dt className="text-text-muted">Resultados</dt><dd className="mt-0.5 font-medium text-foreground">Principal: {expandedPanelSummary.results.principal?.toLocaleString("pt-BR") ?? "—"}{expandedPanelSummary.keywordCount > 1 && <span className="block text-text-muted">Σ {expandedPanelSummary.results.total?.toLocaleString("pt-BR") ?? "—"} · μ {expandedPanelSummary.results.average?.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) ?? "—"} <InfoHint title="Resultados derivados" description="Soma e média são indicadores comparativos; não criam uma dificuldade canônica do artigo." /></span>}</dd></div>
                                {/* ESTADO TERMINAL, SEMPRE. Incerteza tem nome
                                    próprio — Ambígua, Indeterminado, Não
                                    aplicável — e vem com o motivo. "Pendente"
                                    descrevia o processo, e o processo acabou
                                    quando a formação foi concluída. */}
                                <div><dt className="text-text-muted">Intenção</dt><dd className="mt-0.5 font-medium text-foreground" data-testid="article-summary-intent">{ARTICLE_INTENT_LABELS[articleClassification.intent.value]} <InfoHint title="Intenção do artigo" description={`${articleClassification.intent.reason} Origem: ${articleClassification.intent.source}.`} /></dd></div>
                                <div><dt className="text-text-muted">Funil</dt><dd className="mt-0.5 font-medium text-foreground" data-testid="article-summary-funnel">{ARTICLE_FUNNEL_LABELS[articleClassification.funnel.value]} <InfoHint title="Estágio de funil" description={`${articleClassification.funnel.reason} Origem: ${articleClassification.funnel.source}.`} /></dd></div>
                                <div><dt className="text-text-muted">KGR</dt><dd className={`mt-0.5 font-medium ${ARTICLE_KGR_TONE_CLASSES[articleKgr.tone]}`} data-testid="article-summary-kgr">{ARTICLE_KGR_LABELS[articleClassification.kgr.value]} <InfoHint title="KGR do artigo" description={`Classificação do artigo, não o KGR da keyword. ${articleClassification.kgr.reason} Aplicabilidade upstream da Principal: ${articleKgr.principalApplicabilityLabel}. O KGR sai dos fatos do KeywordDNA — a SERP não o define.`} /></dd></div>
                                <div><dt className="text-text-muted">Aplicabilidade</dt><dd className="mt-0.5 font-medium text-foreground" data-testid="article-summary-kgr-applicability">{ARTICLE_KGR_APPLICABILITY_LABELS[articleClassification.kgrApplicability.value]} <InfoHint title="Aplicabilidade do KGR" description={articleClassification.kgrApplicability.reason} /></dd></div>
                                <div><dt className="text-text-muted">Compatibilidade</dt><dd className={`mt-0.5 font-medium ${articleClassification.compatibility.value === "COMPATIBLE" ? "text-foreground" : "text-warning"}`} data-testid="article-summary-compatibility">{ARTICLE_COMPATIBILITY_LABELS[articleClassification.compatibility.value]} <InfoHint title="Compatibilidade da composição" description={articleClassification.compatibility.reason} /></dd></div>
                                  <div><dt className="text-text-muted">Proteção</dt><dd className="mt-0.5 font-medium text-foreground" data-testid="article-summary-protection">{ARTICLE_PROTECTION_LABELS[articleClassification.protection.value]} <InfoHint title="Proteção da identidade" description={articleClassification.protection.reason} /></dd></div>
                                  <div><dt className="text-text-muted">Silo</dt><dd className="mt-0.5 font-medium text-foreground">{articleParentLabel(articleParentFor(art))}{articleSiloReadiness.reasons.length > 0 && <InfoHint title="Pronto para Silos" description={articleSiloReadiness.reasons.join(" ")} />}</dd></div>
                                </dl>}
                              </header>

                              <div className="mt-4 grid items-start gap-6 lg:grid-cols-2">
                                <section className="min-w-0" aria-label="Fatos e definição do artigo">
                                  <p className="text-sm font-semibold text-foreground">Definição e fatos</p>
                                  <p className="mt-1 text-sm text-text-muted">Estado acumulado da working copy; os processos à direita não substituem os dados recebidos do Minerador.</p>
                                  <div className="mt-3 space-y-3">
                                    <ArticleDnaReadonlyPanel definition={{
                                      version: articleDnaVersion,
                                      versionStatus: articleDnaStatus,
                                      principalKeyword: art.keywordPrincipal,
                                      supportKeywords: art.supportKeywords.map(keyword => ({ keyword: keyword.keyword, role: manualKeywordRoleFor(keyword) })),
                                      unitTypeLabel: expandedUnitSuggestion?.status === "human_confirmed" ? EDITORIAL_UNIT_LABELS[expandedUnitSuggestion.type] : null,
                                      kgr: {
                                        label: articleKgr.label,
                                        source: articleKgr.source,
                                        principalScoreLabel: articleKgr.principalKgrScore?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) ?? "—",
                                        applicabilityLabel: articleKgr.principalApplicabilityLabel,
                                        requiresHumanDecision: articleKgr.requiresHumanDecision,
                                      },
                                      serp: {
                                        // Na fase Artigos quem responde pela SERP é o GATE, pela mesma
                                        // chave do painel. Ler o estado de processo aqui fazia o detalhe
                                        // dizer "Não executada" ao lado de um parecer que já existia.
                                        executionLabel: (articleMode && art.candidateRef && articleSerpGates.get(art.candidateRef)?.label)
                                          || (articleProcess.serp.state === "COMPLETED" ? "Concluída" : articleProcess.serp.state === "PROCESSING" ? "Em processamento" : articleProcess.serp.state === "ERROR" ? "Com erro" : "Não executada"),
                                        verdictLabel: articleSerpVerdict.label,
                                        impact: articleSerpVerdict.impact,
                                        divergenceCount: articleSerpVerdict.divergences.length,
                                        registeredDecisions: (latestSerpAssessmentFor(articleEntityIdFor(art))?.recommendations || []).filter(item => item.decision.status !== "pending").length,
                                      },
                                      ai: {
                                        executionLabel: articleAiStateLabel(articleProcess.ai.state),
                                        proposalCount: articleProcess.ai.proposalCount,
                                        pendingCount: articleProcess.review.pendingCount,
                                      },
                                      review: {
                                        statusLabel: articleReview.statusLabel,
                                        requiredCount: articleReview.requiredCount,
                                        resolvedCount: articleReview.resolvedCount,
                                        pendingCount: articleReview.pendingCount,
                                        approved: articleReview.approved,
                                      },
                                      protection: {
                                        publicationLabel: art.isPublished ? "Publicado protegido" : "Novo",
                                        principalPolicy: articleIdentityContext.principalProtected ? "Principal protegida" : "Principal revisável",
                                        slug: articleDnaVersion?.payload.suggestedSlug || currentSlug || null,
                                        canonical: articleDnaVersion?.payload.canonical || null,
                                        url: publicationUrlFor(art) || null,
                                        published: art.isPublished,
                                      },
                                      siloLabel: art.siloId && siloDnaVersion ? `${art.siloName || "Silo"} · v${siloDnaVersion.versionNumber}` : articleSiloReadiness.label,
                                      linksLabel: articleRadarReadiness.state === "sent" ? "Enviado ao Radar" : (linksApprovedGraph ? "InternalLinkGraph aprovado" : linksWorkingCopy ? "Working copy em edição" : "Não iniciados"),
                                    }} />
                                    {art.mainKeywordObj && <KeywordDnaReadonlyPanel
                                      keyword={art.mainKeywordObj}
                                      role="Principal"
                                      presentation={keywordPresentations[String(art.mainKeywordObj.id)] || null}
                                    />}
                                    {art.supportKeywords.length === 0
                                      ? <section className="rounded-md border border-divider bg-surface-subtle p-3"><p className="text-sm font-semibold text-foreground">Secundárias e reforços</p><p className="mt-2 text-sm text-text-muted">Nenhuma keyword de apoio vinculada.</p></section>
                                      : art.supportKeywords.map((keyword, index) => <KeywordDnaReadonlyPanel
                                        key={keyword.id}
                                        keyword={keyword}
                                        role={`${MANUAL_KEYWORD_ROLE_LABELS[manualKeywordRoleFor(keyword)]} ${index + 1}`}
                                        presentation={keywordPresentations[String(keyword.id)] || null}
                                        headerExtra={<select value={manualKeywordRoleFor(keyword)} onChange={event => handleManualKeywordRoleChange(art, keyword, event.target.value as ManualKeywordRole)} disabled={art.isPublished} aria-label={`Definir papel de ${keyword.keyword} no artigo`} className={`${ARCHITECT_UI.control} min-h-8 text-sm disabled:cursor-not-allowed disabled:opacity-50`}>{(Object.keys(MANUAL_KEYWORD_ROLE_LABELS) as ManualKeywordRole[]).filter(role => role !== "principal" || !art.isPublished).map(role => <option key={role} value={role}>{MANUAL_KEYWORD_ROLE_LABELS[role]}</option>)}</select>}
                                      />)}
                                    <section className="rounded-md border border-divider bg-surface-subtle p-3"><p className="text-sm font-semibold text-foreground">Silo</p><p className="mt-1 text-sm text-text-muted">{art.siloId && siloDnaVersion ? `${art.siloName || "Silo"} · ${art.hierarquia} · v${siloDnaVersion.versionNumber}` : articleSiloReadiness.state === "ready" ? "Pronto para Silos; nenhum silo é criado por este painel." : articleSiloReadiness.reasons.join(" ") || "Não iniciado."}</p></section>
                                    {(() => { const graph = linksWorkingCopy || linksApprovedGraph; const node = graph?.nodes.find(item => item.articleDnaVersionRef?.versionId === articleDnaVersion?.versionId); const outgoing = node ? graph?.edges.filter(edge => edge.sourceNodeId === node.nodeId).length || 0 : 0; const incoming = node ? graph?.edges.filter(edge => edge.targetNodeId === node.nodeId).length || 0 : 0; return graph && node ? <section className="rounded-md border border-divider bg-surface-subtle p-3"><p className="text-sm font-semibold text-foreground">Links internos</p><p className="mt-1 text-sm text-text-muted">Saída {outgoing} · Entrada {incoming} · Graph v{"versionNumber" in graph ? graph.versionNumber : graph.baseGraphVersionId || "working"} · {linksWorkingCopy ? "Working copy" : "Aprovado"}</p></section> : null; })()}
                                  </div>
                                    {art.siloId ? <button type="button" onClick={() => { setWorkspaceMode("links"); setLinksSelectedSiloId(String(art.siloId)); setMapExpanded(true); }} className={ARCHITECT_UI.toolbarButton}>Ver arquitetura</button> : null}
                                </section>

                                <section className="min-w-0 border-t border-divider pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" aria-label={articleMode ? "Revisão da formação" : "Processos do artigo"}>
                                  {/* §4/§6 — na fase Artigos os quatro motores deixam de ser abas a
                                      visitar em ordem. Eles continuam existindo: viram evidência
                                      dentro de um painel só, onde a pergunta é editorial e a
                                      consequência aparece ANTES de aplicar. Fora dessa fase o fluxo
                                      por processo continua exatamente como estava. */}
                                  {articleMode ? (() => {
                                    const revisao = formationReviewFor(art.candidateRef);
                                    if (!revisao) return <p className="text-sm leading-6 text-text-muted" data-testid="architect-review-unavailable">Processe os artigos para revisar a formação deste conteúdo.</p>;
                                    const evidencia = (estado: string): EvidenceState => estado === "COMPLETED" ? "ok" : estado === "ERROR" ? "falhou" : estado === "PROCESSING" || estado === "STALE" || estado === "PENDING" ? "pendente" : "nao_necessaria";
                                    return <ArticleFormationReviewPanel
                                      articleLabel={art.keywordPrincipal}
                                      candidateRef={revisao.candidate.candidateRef}
                                      scenario={revisao.scenario}
                                      evidence={{ logic: evidencia(articleProcess.logic.state), ai: evidencia(articleProcess.ai.state) }}
                                      serp={(() => { const gate = articleSerpGates.get(revisao.candidate.candidateRef); const registro = remoteArticleSerp.find(item => item.candidateRef === revisao.candidate.candidateRef)?.payload;
                                                                            // O parecer gravado manda. Quando ele falta — registro anterior ao
                                                                            // campo legível — é derivado dos MESMOS snapshots que já vieram do
                                                                            // remoto: ler o que já está gravado é melhor que cobrar do provider
                                                                            // uma coleta que não traria nada novo.
                                                                            const remoto = registro?.interpretation || (registro ? articleSerpParecerFromAssessment(registro, revisao.candidate, id => formationKeywordLabels.get(id) || id) : null); const parecer = remoto ? { principalVerdict: remoto.principalVerdict, principalAlternative: remoto.principalAlternativeKeywordId ? (formationKeywordLabels.get(remoto.principalAlternativeKeywordId) || remoto.principalAlternativeKeywordId) : null, principalReason: remoto.principalReason, groupVerdict: remoto.groupVerdict, groupReason: remoto.groupReason, outsiders: remoto.outsiders, observedIntent: remoto.observedIntent, dominantType: remoto.dominantType, viabilityText: remoto.viabilityText, distinctDomains: remoto.distinctDomains, recommendation: remoto.recommendation } : null; return gate ? { state: gate.state, label: gate.label, reason: gate.reason, blocksConclusion: gate.blocksConclusion, awaitsHuman: gate.requiresHumanDecision, parecer } : { state: "missing", label: ARTICLE_SERP_STATE_LABELS.missing, reason: "Este artigo ainda não foi confrontado com a SERP.", blocksConclusion: true, awaitsHuman: false, parecer: null }; })()}
                                      materialized={articleDnaVersion ? { versionNumber: articleDnaVersion.versionNumber, statusLabel: serpWasExecutedFor(articleSerpGates.get(revisao.candidate.candidateRef)?.state || "missing") ? (articleDnaStatus === "approved" ? "consolidado" : "em revisão") : "homologação anterior ao gate SERP", siloLabel: siloLabelByRef.get(revisao.candidate.siloRef) || art.siloName || "Silo sem nome", slug: articleDnaVersion.payload.suggestedSlug ?? null, evidence: { logic: evidencia(articleProcess.logic.state), serp: evidencia(articleProcess.serp.state), ai: evidencia(articleProcess.ai.state), human: revisao.candidate.origin === "human" ? 1 : 0 } } : null}
                                      conclusion={revisao.conclusion}
                                      keywords={revisao.keywords}
                                      moveTargets={revisao.moveTargets}
                                      mergeTargets={revisao.mergeTargets}
                                      siloTargets={revisao.siloTargets}
                                      preview={scenarioPreview && candidateRefOfChange(scenarioPreview.change) === revisao.candidate.candidateRef ? scenarioPreview : null}
                                      principalComparison={scenarioPrincipalComparison}
                                      busy={formationBusy}
                                      readOnlyReason={art.isPublished ? "Artigo publicado: identidade protegida. A composição não é recomposta por aqui." : null}
                                      onAcceptSerp={reason => { void acceptSerpForCandidate(revisao.candidate.candidateRef, reason); }}
                                      pendingDecisions={articleReview.decisions.filter(item => !item.resolved).map(item => ({ id: item.id, title: item.title, what: item.what, how: item.how, resolved: item.resolved }))}
                                      unitTypeControl={expandedUnitDraft && articleReview.decisions.some(item => item.kind === "unit_type" && !item.resolved)
                                        ? { value: expandedUnitDraft.type,
                                          options: (Object.keys(EDITORIAL_UNIT_LABELS) as EditorialArticleUnitType[]).map(value => ({ value, label: EDITORIAL_UNIT_LABELS[value] })),
                                          onChange: value => setUnitDrafts(current => ({ ...current, [art.id]: { ...expandedUnitDraft, type: value as EditorialArticleUnitType } })),
                                          onConfirm: () => { void handleEditorialUnitDecision(art, { type: expandedUnitDraft.type, landingPagePurpose: expandedUnitDraft.landingPagePurpose, status: "human_confirmed" }); } }
                                        : null}
                                      closure={{ approved: articleReview.approved, headline: articleReview.headline, revisionPending: articleReview.revisionPending, readyForApproval: articleReview.readyForApproval, statusLabel: articleReview.statusLabel, pendingCount: articleReview.pendingCount, blockers: articleReview.blockers }}
                                      onApproveArticle={() => { void handleConfirmArticleArchitecture(art); }}
                                      onPreview={change => setPendingScenarioChange(change)}
                                      onApply={() => { void applyPendingScenarioChange(); }}
                                      onCancel={() => setPendingScenarioChange(null)}
                                    />;
                                  })() : <>
                                  <div role="tablist" aria-label={`Processos de ${art.keywordPrincipal}`} className="flex flex-wrap gap-2 border-b border-divider pb-3">
                                    {(["logic", "serp", "ai", "review"] as const).map(process => <button key={process} type="button" role="tab" aria-selected={expandedProcessTab === process} onClick={() => setExpandedProcessTabs(current => selectArticlePanelProcessTab(current, art.id, process))} className={`min-h-9 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35 ${expandedProcessTab === process ? "border-module-accent/45 bg-module-accent/10 text-foreground" : "border-divider bg-surface-subtle text-text-muted hover:bg-surface-elevated hover:text-foreground"}`}>{({ logic: "Lógica", serp: "SERP", ai: "IA", review: "Revisão" } as const)[process]}</button>)}
                                  </div>
                                  <div className="pt-4">
                                    {expandedProcessTab === "logic" && <section>
                                      <p className="text-sm font-semibold text-foreground">Lógica · {articleProcess.logic.state === "COMPLETED" ? "Concluída" : articleProcess.logic.state === "PROCESSING" ? "Em processamento" : "Não executada"}</p>
                                      <p className="mt-1 text-sm text-text-muted">Hipótese determinística; não altera os dados do Minerador.</p>
                                      {provisionalGroup?.groupingReasons?.length ? <ul className="mt-3 space-y-2 text-sm text-foreground">{provisionalGroup.groupingReasons.map(reason => <li key={`${reason.code}-${reason.message}`} className="rounded-md border border-divider bg-surface-subtle p-2">{reason.message}</li>)}</ul> : <p className="mt-3 text-sm text-text-muted">Nenhuma razão de agrupamento registrada para esta versão da working copy.</p>}
                                    </section>}
                                    {expandedProcessTab === "serp" && <section>
                                      <p className="text-sm font-semibold text-foreground">SERP de formação · {articleProcess.serp.state === "COMPLETED" ? "Concluída" : articleProcess.serp.state === "PROCESSING" ? "Em processamento" : articleProcess.serp.state === "ERROR" ? "Com erro" : "Não executada"}</p>
                                      <p className="mt-1 text-sm text-text-muted">A SERP observa compatibilidade e conflitos; não movimenta keywords.</p>
                                      {(() => {
                                        const articleId = articleEntityIdFor(art);
                                        const execution = articleId ? serpExecution[articleId] : undefined;
                                        const articleState = resolveSerpArticleState({
                                          currentAssessment: latestSerpAssessmentFor(articleId),
                                          lastAttempt: execution?.lastAttemptFailed
                                            ? { status: "error", message: execution.message, stage: execution.stage, code: execution.code, retryable: execution.retryable }
                                            : null,
                                        });
                                        if (!articleState.lastAttemptFailed) return null;
                                        const retry = execution?.retryable !== false;
                                        // Avaliação vigente e última tentativa são estados distintos: uma
                                        // atualização que falha não invalida o que já foi confirmado.
                                        return articleState.hasCurrentAssessment
                                          ? <section data-testid="architect-serp-refresh-failed" aria-label="Última atualização da SERP falhou" className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3">
                                            <p className="text-sm font-semibold text-warning">Última atualização da SERP falhou</p>
                                            <p className="mt-1 text-sm leading-6 text-foreground">{articleState.attemptMessage}</p>
                                            {execution?.stage && <p className="mt-1 text-sm leading-6 text-text-muted">Estágio: {execution.stage}{execution.code ? ` · código ${execution.code}` : ""}</p>}
                                            <p className="mt-1 text-sm leading-6 text-text-muted">A avaliação vigente deste artigo continua válida e permanece em uso.</p>
                                            {retry && <button type="button" onClick={() => { if (provisionalGroup) void confirmSerpValidation([provisionalGroup]); }} disabled={serpBusy || !provisionalGroup} className={`${ARCHITECT_UI.toolbarButton} mt-3`}>Repetir atualização</button>}
                                          </section>
                                          : <section data-testid="architect-serp-article-error" aria-label="Falha da SERP neste artigo" className="mt-3 rounded-md border border-danger/40 bg-danger-soft p-3">
                                            <p className="text-sm font-semibold text-danger">SERP com erro neste artigo</p>
                                            <p className="mt-1 text-sm leading-6 text-foreground">{articleState.attemptMessage}</p>
                                            {execution?.stage && <p className="mt-1 text-sm leading-6 text-text-muted">Estágio: {execution.stage}{execution.code ? ` · código ${execution.code}` : ""}</p>}
                                            <p className="mt-1 text-sm leading-6 text-text-muted">Os demais artigos do lote mantêm as avaliações válidas.</p>
                                            {retry && <button type="button" onClick={() => { if (provisionalGroup) void confirmSerpValidation([provisionalGroup]); }} disabled={serpBusy || !provisionalGroup} className={`${ARCHITECT_UI.toolbarButton} mt-3`}>Repetir SERP deste artigo</button>}
                                          </section>;
                                      })()}
                                      <section data-testid="architect-serp-verdict" aria-label="Veredito da SERP de formação" className={`mt-3 rounded-md border p-3 ${articleSerpVerdict.kind === "DIVERGENCE" ? "border-warning/40 bg-warning/10" : "border-divider bg-surface-subtle"}`}>
                                        <p className="text-sm font-semibold text-foreground">Resultado · {articleSerpVerdict.label}</p>
                                        <p className="mt-1 text-sm leading-6 text-foreground">{articleSerpVerdict.headline}</p>
                                        <p className="mt-1 text-sm leading-6 text-text-muted">{articleSerpVerdict.explanation}</p>
                                        <p className="mt-1 text-sm leading-6 text-text-muted">Impacto: {articleSerpVerdict.impact}</p>
                                        {articleSerpVerdict.observations.map(observation => <p key={observation} className="mt-1 text-sm leading-6 text-text-muted">• {observation}</p>)}
                                        {articleSerpVerdict.canRefresh && <button type="button" onClick={() => { if (provisionalGroup) void confirmSerpValidation([provisionalGroup]); }} disabled={serpBusy || !provisionalGroup} className={`${ARCHITECT_UI.toolbarButton} mt-3`}>Atualizar SERP</button>}
                                        {articleSerpVerdict.divergences.map(divergence => <article key={divergence.keywordId} data-testid="architect-serp-divergence" className="mt-3 rounded-md border border-divider bg-surface p-3">
                                          <p className="text-sm font-semibold text-keyword">{divergence.keyword}</p>
                                          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                            <div><dt className="text-text-muted">Papel atual</dt><dd className="mt-0.5 font-medium text-foreground">{divergence.currentRole}</dd></div>
                                            <div><dt className="text-text-muted">Fato upstream</dt><dd className="mt-0.5 font-medium text-foreground">{divergence.upstreamFact}</dd></div>
                                            <div><dt className="text-text-muted">Evidência observada</dt><dd className="mt-0.5 font-medium text-foreground">{divergence.observedEvidence}</dd></div>
                                            <div><dt className="text-text-muted">Sobreposição</dt><dd className="mt-0.5 font-medium text-foreground">{divergence.overlapLabel}</dd></div>
                                            <div><dt className="text-text-muted">Página dominante</dt><dd className="mt-0.5 font-medium text-foreground">{divergence.dominantPageType}</dd></div>
                                            <div><dt className="text-text-muted">Força da evidência</dt><dd className="mt-0.5 font-medium text-foreground">{divergence.evidenceStrength}</dd></div>
                                          </dl>
                                          <p className="mt-2 text-sm leading-6 text-foreground">Recomendação: {divergence.recommendation}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">Motivo: {divergence.reason}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">{divergence.impact}</p>
                                          <div className="mt-3 flex flex-wrap gap-2">
                                            <button type="button" onClick={() => void handleSerpRecommendationDecision(art, divergence.keywordId, "ignored")} className={ARCHITECT_UI.toolbarButton}>Manter no artigo</button>
                                            <button type="button" onClick={() => void handleSerpRecommendationDecision(art, divergence.keywordId, "followed")} className={ARCHITECT_UI.importButton}>Aplicar recomendação</button>
                                          </div>
                                        </article>)}
                                      </section>
                                      {(() => {
                                        const kgrReadout = articleKgrSerpReadoutFor(art);
                                        return kgrReadout ? <section data-testid="architect-serp-kgr-readout" aria-label="Evidência SERP para a estratégia KGR" className="mt-3 rounded-md border border-divider bg-surface-subtle p-3">
                                          <dl className="grid gap-2 text-sm sm:grid-cols-2">
                                            <div><dt className="text-text-muted">KGR da Principal</dt><dd className="mt-0.5 font-medium text-foreground">{kgrReadout.principalKgrScore?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) ?? "—"}</dd></div>
                                            <div><dt className="text-text-muted">Aplicabilidade upstream</dt><dd className="mt-0.5 font-medium text-foreground">{kgrReadout.principalApplicabilityLabel}</dd></div>
                                            <div><dt className="text-text-muted">Competição observada</dt><dd className="mt-0.5 font-medium text-foreground">{kgrReadout.competitionLabel}</dd></div>
                                            <div><dt className="text-text-muted">Força da evidência</dt><dd className="mt-0.5 font-medium text-foreground">{kgrReadout.evidenceStrengthLabel}</dd></div>
                                            <div><dt className="text-text-muted">Recomendação para estratégia KGR</dt><dd className="mt-0.5 font-medium text-foreground">{kgrReadout.recommendationLabel}</dd></div>
                                          </dl>
                                          <p className="mt-2 text-sm font-semibold text-foreground">Evidência competitiva</p>
                                          <ul className="mt-1 space-y-1 text-sm text-text-muted">{kgrReadout.competitiveEvidence.map(evidence => <li key={evidence}>• {evidence}</li>)}</ul>
                                          <p className="mt-2 text-sm text-text-muted">{kgrReadout.rationale} A SERP não altera score nem aplicabilidade upstream; a decisão KGR do artigo permanece humana.</p>
                                        </section> : null;
                                      })()}
                                      {articleSerpVerdict.kind !== "DIVERGENCE" && articleSerpVerdict.keywordObservations.length > 0 && <section data-testid="architect-serp-observations" aria-label="Observações da SERP" className="mt-3 rounded-md border border-divider bg-surface-subtle p-3">
                                        <p className="text-sm font-semibold text-foreground">Observações da SERP</p>
                                        <p className="mt-1 text-sm leading-6 text-text-muted">Fatos observados por keyword. Sem evidência suficiente, nada aqui é conflito nem exige decisão.</p>
                                        <div className="mt-2 space-y-3">{articleSerpVerdict.keywordObservations.map(observation => <div key={observation.keywordId} className="border-t border-divider pt-2 first:border-t-0 first:pt-0">
                                          <p className="break-words text-sm font-medium text-keyword">{observation.keyword}</p>
                                          <dl className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                                            <div><dt className="text-text-muted">Intenção upstream</dt><dd className="mt-0.5 text-foreground">{observation.upstreamIntent}</dd></div>
                                            <div><dt className="text-text-muted">Comportamento observado</dt><dd className="mt-0.5 text-foreground">{observation.observedBehaviour}</dd></div>
                                            <div><dt className="text-text-muted">Sobreposição</dt><dd className="mt-0.5 text-foreground">{observation.overlapLabel}</dd></div>
                                            <div><dt className="text-text-muted">Página dominante</dt><dd className="mt-0.5 text-foreground">{observation.dominantPageType}</dd></div>
                                            <div><dt className="text-text-muted">Força da evidência</dt><dd className="mt-0.5 text-foreground">{observation.evidenceStrength}</dd></div>
                                            <div><dt className="text-text-muted">Impacto arquitetural</dt><dd className="mt-0.5 text-foreground">{observation.architecturalImpact}</dd></div>
                                          </dl>
                                        </div>)}</div>
                                      </section>}

                                      {articleSerpVerdict.kind === "DIVERGENCE"
                                        ? <>
                                          <div className="mt-3">{renderSerpRecommendations(art)}</div>
                                          <div className="mt-3 space-y-3">{[art.mainKeywordObj, ...art.supportKeywords].filter((keyword): keyword is NonNullable<typeof art.mainKeywordObj> => Boolean(keyword)).map(keyword => <React.Fragment key={keyword.id}>{renderSerpRecommendationForKeyword(art, keyword.id, keyword.keyword)}</React.Fragment>)}</div>
                                        </>
                                        : articleSerpVerdict.kind === "NOT_RUN"
                                          ? <p className="mt-3 rounded-md border border-divider bg-surface-subtle p-3 text-sm text-text-muted">Ainda não há avaliação SERP para este artigo.</p>
                                          : <details data-testid="architect-serp-technical" className="mt-3 rounded-md border border-divider bg-surface-subtle p-3">
                                            <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Detalhes técnicos da SERP</summary>
                                            <p className="mt-2 text-sm leading-6 text-text-muted">Sinais brutos do assessment e histórico das recomendações. Não governam a decisão humana quando o veredito é compatível ou inconclusivo.</p>
                                            <div className="mt-3">{renderSerpRecommendations(art)}</div>
                                            <div className="mt-3 space-y-3">{[art.mainKeywordObj, ...art.supportKeywords].filter((keyword): keyword is NonNullable<typeof art.mainKeywordObj> => Boolean(keyword)).map(keyword => <React.Fragment key={keyword.id}>{renderSerpRecommendationForKeyword(art, keyword.id, keyword.keyword)}</React.Fragment>)}</div>
                                          </details>}
                                    </section>}
                                    {expandedProcessTab === "ai" && <section data-testid="architect-ai-readout">
                                      <p className="text-sm font-semibold text-foreground">IA · {articleAiStateLabel(articleProcess.ai.state)}</p>
                                      <p className="mt-1 text-sm leading-6 text-text-muted">Segunda leitura arquitetural da formação: pertencimento das keywords, escolha da Principal, papéis, canibalização e coerência com a SERP. A IA não altera a KeywordDNA nem aprova o ArticleDNA.</p>
                                      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                        <div><dt className="text-text-muted">Propostas da IA</dt><dd className="mt-0.5 font-medium text-foreground">{articleAiReadout.materialCount}</dd></div>
                                        <div><dt className="text-text-muted">Decisões pendentes do artigo</dt><dd className="mt-0.5 font-medium text-foreground">{articleReview.pendingCount}</dd></div>
                                      </dl>
                                      {articleAiReviewReadoutFor(articleEntityIdFor(art)).stale && <p className="mt-1 text-sm leading-6 text-warning" data-testid="architect-ai-stale">A estrutura do artigo mudou depois desta revisão. A revisão anterior permanece no histórico e não vale como leitura atual; execute a IA novamente quando quiser reavaliar. A aprovação do ArticleDNA não fica bloqueada por isso.</p>}
                                      {articleProcess.ai.state === "STALE" && <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="architect-ai-historical-proposals">{articleProcess.ai.historicalProposalCount} proposta(s) da revisão anterior ficam como histórico e não podem ser aplicadas à estrutura atual.</p>}
                                      {articleReview.pendingCount > articleAiReadout.materialCount && <p className="mt-1 text-sm leading-6 text-text-muted">Nem toda decisão pendente veio da IA: a aba Revisão lista também KGR do artigo, tipo de unidade, divergências da SERP e conflitos.</p>}
                                      {articleAiReadout.proposals.length > 0 && <div className="mt-3 space-y-2">
                                        {articleAiReadout.proposals.map((proposal, index) => <article key={proposal.keywordId} data-testid="architect-ai-proposal" className="rounded-md border border-warning/35 bg-warning-soft p-3">
                                          <p className="text-sm font-semibold text-foreground">Proposta {index + 1} · <span className="text-keyword">{proposal.keyword}</span></p>
                                          <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                            <div><dt className="text-text-muted">Estado atual</dt><dd className="mt-0.5 font-medium text-foreground">{proposal.currentState}</dd></div>
                                            <div><dt className="text-text-muted">Proposta</dt><dd className="mt-0.5 font-medium text-foreground">{proposal.proposal}</dd></div>
                                          </dl>
                                          <p className="mt-2 text-sm leading-6 text-text-muted">Motivo: {proposal.reason}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">Evidência considerada: {proposal.evidence}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">Impacto: {proposal.impact}</p>
                                        </article>)}
                                      </div>}
                                      {art.aiReviewAnnotations.length > 0 && <div className="mt-3 space-y-2">
                                        {art.aiReviewAnnotations.map(annotation => <article key={annotation.id} className="rounded-md border border-divider bg-surface-subtle p-3">
                                          <p className="text-sm font-semibold text-foreground">{annotation.structuralChange === false ? "Execução sem alteração estrutural" : "Proposta aplicada à working copy"} · {String(annotation.action).replaceAll("_", " ")}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">{annotation.summary}</p>
                                          {annotation.details.map(detail => <p key={detail} className="mt-1 text-sm leading-6 text-text-muted">• {detail}</p>)}
                                          <p className="mt-2 text-sm leading-6 text-text-muted">{annotation.reviewState === "pending_fine_review" ? "Aguardando confirmação humana." : "Revisão humana registrada."}</p>
                                        </article>)}
                                        {articleProcess.review.state === "PENDING" && art.aiReviewAnnotations.some(annotation => annotation.reviewState === "pending_fine_review") && <button type="button" onClick={() => markAiReviewChecked(art)} className={ARCHITECT_UI.toolbarButton}>Concluir pente-fino humano</button>}
                                      </div>}
                                      {articleAiReadout.noOp && <section data-testid="architect-ai-noop" className="mt-3 rounded-md border border-divider bg-surface-subtle p-3">
                                        <p className="text-sm font-semibold text-foreground">Nenhuma alteração estrutural recomendada</p>
                                        <ul className="mt-1 space-y-1 text-sm leading-6 text-text-muted">
                                          {articleAiReadout.summary.map(item => <li key={item}>• {item}</li>)}
                                        </ul>
                                      </section>}
                                      {!articleAiReadout.executed && <p className="mt-3 rounded-md border border-divider bg-surface-subtle p-3 text-sm leading-6 text-text-muted">Use o controle canônico “Revisar com IA” depois de selecionar este artigo na planilha.</p>}
                                    </section>}
                                    {expandedProcessTab === "review" && <section data-testid="architect-review-checklist">
                                      <p className="text-sm font-semibold text-foreground">Revisão humana · {articleReview.statusLabel}</p>
                                      <p className="mt-1 text-sm leading-6 text-text-muted">{articleReview.pendingCount === 0 ? "Nenhuma decisão pendente." : `${articleReview.pendingCount} decisão(ões) pendente(s)`} · {articleReview.resolvedCount} de {articleReview.requiredCount} resolvida(s). Esta aba concentra tudo que depende de decisão humana no artigo.</p>
                                      <div className="mt-4 rounded-md border border-divider bg-surface-subtle p-3" data-testid="architect-review-architecture">
                                        <p className="text-sm font-semibold text-foreground">Arquitetura do artigo</p>
                                        <p className="mt-1 text-sm leading-6 text-text-muted">Decisão humana sobre a cópia de trabalho: papel, pertencimento e composição. A KeywordDNA continua somente leitura e o Silo pertence à etapa seguinte.</p>
                                        {art.isPublished && <p className="mt-1 text-sm leading-6 text-warning">Artigo publicado: identidade, Principal e keywords estão protegidas.</p>}
                                        <ul className="mt-2 space-y-2">
                                          {[art.mainKeywordObj, ...art.supportKeywords].filter(Boolean).map((keywordItem: ArchitectReviewKeyword) => {
                                            const role = manualKeywordRoleFor(keywordItem);
                                            const isPrincipal = String(art.mainKeywordObj?.id) === String(keywordItem.id) || role === "principal";
                                            const moveTargets = manualMoveTargetsFor(art);
                                            return (
                                              <li key={String(keywordItem.id)} data-testid="architect-review-architecture-keyword" className="rounded-md border border-divider bg-surface p-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                  <span className="text-sm font-medium text-keyword">{keywordItem.keyword}</span>
                                                  <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${isPrincipal ? "border-success/40 text-success" : "border-divider text-text-muted"}`}>{MANUAL_KEYWORD_ROLE_LABELS[role]}</span>
                                                </div>
                                                {!art.isPublished && <div className="mt-2 flex flex-wrap items-center gap-2">
                                                  {!isPrincipal && <button type="button" onClick={() => requestManualArchitectureAction({ kind: "principal", article: art, keyword: keywordItem })} className={`${ARCHITECT_UI.control} px-2 py-1 text-xs`}>Definir como Principal</button>}
                                                  {!isPrincipal && <select aria-label={`Papel de ${keywordItem.keyword}`} value={role} onChange={event => { if (event.target.value === "secundaria" || event.target.value === "reforco_narrativo") void handleManualSupportRole(art, keywordItem, event.target.value); }} className={`${ARCHITECT_UI.control} px-2 py-1 text-xs`}>
                                                    <option value="secundaria">Secundária</option>
                                                    <option value="reforco_narrativo">Reforço narrativo</option>
                                                  </select>}
                                                  <select aria-label={`Mover ${keywordItem.keyword} para outro artigo`} value="" onChange={event => { const target = moveTargets.find(candidate => candidate.id === event.target.value); if (target) requestManualArchitectureAction({ kind: "move", article: art, keyword: keywordItem, target }); }} className={`${ARCHITECT_UI.control} px-2 py-1 text-xs`}>
                                                    <option value="">Mover para outro artigo</option>
                                                    {moveTargets.map(target => <option key={target.id} value={target.id} disabled={target.full}>{target.label} · {target.keywordCount}/{MAX_KEYWORDS_PER_ARTICLE}{target.full ? " · cheio" : ""}</option>)}
                                                  </select>
                                                  <button type="button" onClick={() => requestManualArchitectureAction({ kind: "ungroup", article: art, keyword: keywordItem })} className={`${ARCHITECT_UI.control} px-2 py-1 text-xs`}>Retirar do artigo</button>
                                                  {[art.mainKeywordObj, ...art.supportKeywords].filter(Boolean).length > 1 && <button type="button" onClick={() => requestManualArchitectureAction({ kind: "split", article: art, keyword: keywordItem })} className={`${ARCHITECT_UI.control} px-2 py-1 text-xs`}>Criar novo artigo</button>}
                                                </div>}
                                              </li>
                                            );
                                          })}
                                        </ul>
                                        {pendingManualArchitecture && pendingManualArchitecture.articleKey === manualArticleKeyFor(art) && <div className="mt-3 rounded-md border border-warning/40 bg-warning-soft p-3" data-testid="architect-review-architecture-confirm">
                                          <p className="text-sm font-semibold text-warning">Confirmar mudança estrutural</p>
                                          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                                            <div><dt className="text-text-muted">Antes</dt><dd className="mt-0.5 text-foreground">{pendingManualArchitecture.before}</dd></div>
                                            <div><dt className="text-text-muted">Depois</dt><dd className="mt-0.5 text-foreground">{pendingManualArchitecture.after}</dd></div>
                                          </dl>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">Impacto: {pendingManualArchitecture.impact}</p>
                                          {pendingManualArchitecture.requiresNextPrincipal && <label className="mt-2 block text-sm font-medium text-foreground">Nova Principal do artigo de origem
                                            <select aria-label="Nova Principal do artigo de origem" value={pendingManualArchitecture.nextPrincipalKeywordId || ""} onChange={event => setPendingManualArchitecture(current => current ? { ...current, nextPrincipalKeywordId: event.target.value } : current)} className={`${ARCHITECT_UI.control} mt-1 w-full max-w-xs text-sm`}>
                                              {pendingManualArchitecture.nextPrincipalOptions.map(option => <option key={option.id} value={option.id}>{option.keyword}</option>)}
                                            </select>
                                          </label>}
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            <button type="button" onClick={() => void confirmManualArchitecture()} className={`${ARCHITECT_UI.control} px-2 py-1 text-xs font-semibold`}>Confirmar</button>
                                            <button type="button" onClick={() => setPendingManualArchitecture(null)} className={`${ARCHITECT_UI.control} px-2 py-1 text-xs`}>Cancelar</button>
                                          </div>
                                        </div>}
                                      </div>
                                      <div className="mt-3 space-y-2">
                                        {articleReview.decisions.map((decision, index) => <article key={decision.id} data-testid="architect-review-decision" className={`rounded-md border p-3 ${decision.resolved ? "border-divider bg-surface-subtle" : "border-warning/35 bg-warning-soft"}`}>
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <p className="text-sm font-semibold text-foreground">{index + 1}. {decision.title}</p>
                                            <span className={`rounded-md border px-2 py-0.5 text-sm font-medium ${decision.resolved ? "border-success/40 text-success" : "border-warning/45 text-warning"}`}>{decision.resolved ? "Resolvida" : "Pendente"}</span>
                                          </div>
                                          <p className="mt-1 text-sm leading-6 text-foreground">{decision.state}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">O que falta: {decision.what}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">Por quê: {decision.why}</p>
                                          <p className="mt-1 text-sm leading-6 text-text-muted">Como resolver: {decision.how}</p>
                                          {decision.kind === "article_kgr" && <div className="mt-2" data-testid="architect-review-kgr-decision">
                                            <p className={`text-sm font-semibold ${ARTICLE_KGR_TONE_CLASSES[articleKgr.tone]}`}>KGR do artigo · {articleKgr.label}</p>
                                            {articleKgr.notes.map(note => <p key={note} className="mt-1 text-sm leading-6 text-text-muted">• {note}</p>)}
                                            {articleKgr.requiresHumanDecision && <label className="mt-2 block text-sm font-medium text-foreground">Decisão do artigo
                                              <select aria-label={`Decisão KGR do artigo ${art.keywordPrincipal}`} value="" onChange={event => { if (event.target.value === "YES" || event.target.value === "NO") void handleArticleKgrDecision(art, event.target.value); }} className={`${ARCHITECT_UI.control} mt-1 w-full max-w-xs text-sm`}>
                                                <option value="">A decidir</option>
                                                <option value="YES">Sim</option>
                                                <option value="NO">Não</option>
                                              </select>
                                            </label>}
                                            <p className="mt-1 text-sm leading-6 text-text-muted">Decisão do artigo; não substitui nem reutiliza o select de aplicabilidade do KeywordDNA.</p>
                                          </div>}
                                          {decision.kind === "unit_type" && expandedUnitSuggestion && expandedUnitDraft && <div className="mt-2">
                                            <div className="grid gap-3 sm:grid-cols-2">
                                              <label className="text-sm font-medium text-foreground">Tipo
                                                <select value={expandedUnitDraft.type} onChange={event => setUnitDrafts(current => ({ ...current, [art.id]: { ...expandedUnitDraft, type: event.target.value as EditorialArticleUnitType, landingPagePurpose: event.target.value === "landing_page" ? expandedUnitDraft.landingPagePurpose : "unknown" } }))} className={`${ARCHITECT_UI.control} mt-1 w-full text-sm`}>{ARTICLE_PHASE_UNIT_TYPES.map(type => <option key={type} value={type}>{EDITORIAL_UNIT_LABELS[type]}</option>)}</select>
                                              </label>
                                              {expandedUnitDraft.type === "landing_page" && <label className="text-sm font-medium text-foreground">Finalidade
                                                <select value={expandedUnitDraft.landingPagePurpose} onChange={event => setUnitDrafts(current => ({ ...current, [art.id]: { ...expandedUnitDraft, landingPagePurpose: event.target.value as LandingPagePurpose } }))} className={`${ARCHITECT_UI.control} mt-1 w-full text-sm`}>{(Object.keys(LANDING_PURPOSE_LABELS) as LandingPagePurpose[]).map(purpose => <option key={purpose} value={purpose}>{LANDING_PURPOSE_LABELS[purpose]}</option>)}</select>
                                              </label>}
                                            </div>
                                            <p className="mt-1 text-sm leading-6 text-text-muted">Página de categoria é decisão de cluster e pertence à etapa Silos.</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <button type="button" onClick={() => void handleEditorialUnitDecision(art, { type: expandedUnitDraft.type, landingPagePurpose: expandedUnitDraft.landingPagePurpose, status: expandedUnitDraft.type === "other" ? "unknown" : "human_confirmed" })} className={ARCHITECT_UI.importButton}>Registrar decisão</button>
                                              <button type="button" onClick={() => void handleEditorialUnitDecision(art, { type: expandedUnitDraft.type, landingPagePurpose: expandedUnitDraft.landingPagePurpose, status: "conflict" })} className={ARCHITECT_UI.toolbarButton}>Marcar conflito</button>
                                            </div>
                                          </div>}
                                          {decision.kind === "serp_divergence" && <button type="button" onClick={() => setExpandedProcessTabs(current => selectArticlePanelProcessTab(current, art.id, "serp"))} className={`${ARCHITECT_UI.toolbarButton} mt-2`}>Abrir a divergência na aba SERP</button>}
                                          {decision.kind === "ai_proposal" && !decision.resolved && art.aiReviewAnnotations.some(annotation => annotation.reviewState === "pending_fine_review") && <button type="button" onClick={() => markAiReviewChecked(art)} className={`${ARCHITECT_UI.toolbarButton} mt-2`}>Concluir pente-fino humano</button>}
                                        </article>)}
                                      </div>
                                      <section data-testid="architect-article-approval" aria-label="Fechamento do artigo" className="mt-4 rounded-md border border-divider bg-surface-subtle p-3">
                                        <p className="text-sm font-semibold text-foreground">Fechamento do artigo</p>
                                        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                          <div><dt className="text-text-muted">Principal</dt><dd className="mt-0.5 font-medium text-keyword">{art.keywordPrincipal}</dd></div>
                                          <div><dt className="text-text-muted">Keywords</dt><dd className="mt-0.5 font-medium text-foreground">{1 + art.supportKeywords.length}</dd></div>
                                          <div><dt className="text-text-muted">KGR do artigo</dt><dd className="mt-0.5 font-medium text-foreground">{articleKgr.label}</dd></div>
                                          <div><dt className="text-text-muted">SERP</dt><dd className="mt-0.5 font-medium text-foreground">{articleSerpVerdict.label}</dd></div>
                                          <div><dt className="text-text-muted">Pendências</dt><dd className="mt-0.5 font-medium text-foreground">{articleReview.pendingCount}</dd></div>
                                          <div><dt className="text-text-muted">Status</dt><dd className="mt-0.5 font-medium text-foreground">{articleReview.statusLabel}</dd></div>
                                        </dl>
                                        {articleReview.approved
                                          ? <p className="mt-3 text-sm leading-6 text-success">ArticleDNA aprovado. O artigo segue para a etapa Silos.</p>
                                          : <>
                                            <button type="button" disabled={!articleReview.readyForApproval} onClick={() => void handleConfirmArticleArchitecture(art)} className={`${ARCHITECT_UI.importButton} mt-3`}>Aprovar ArticleDNA</button>
                                            {!articleReview.readyForApproval && <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted">{articleReview.blockers.map(blocker => <li key={blocker}>• {blocker}</li>)}</ul>}
                                          </>}
                                        <p className="mt-2 text-sm leading-6 text-text-muted">A aprovação exige as decisões desta aba; Silo, categoria, CTA e briefing do Planejador não são exigidos aqui.</p>
                                      </section>
                                    </section>}
                                  </div>
                                  </>}
                                </section>
                              </div>
                            </section>
                          </td>
                          </tr>
                        )} />
                      )}
                    </React.Fragment>
                  );
                          }}
                        />
                      ))}
                    </React.Fragment>
                  );
                })}

              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Ações que dependem da seleção ficam sempre no rodapé, fora do scroll da planilha. */}
      {(selectedArticleIds.size > 0 || selectedSiloPageIds.size > 0) && (
        <footer className="architect-scrollbar flex min-h-10 shrink-0 items-center justify-between gap-3 overflow-x-auto border-t border-divider bg-surface-elevated px-3 py-2">
          {/* Contadores separados */}
          <div className="flex shrink-0 items-center gap-3">
            {selectedArticleIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded border border-module-accent/35 bg-module-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-module-accent">{selectedArticleIds.size}</span>
                <span className="text-sm text-text-muted">
                  {hiddenSelectedArticleCount > 0
                    ? `${selectedArticleIds.size} selecionados · ${visibleSelectedArticleCount} visíveis`
                    : selectedArticleIds.size === 1 ? "artigo selecionado" : "artigos selecionados"}
                </span>
              </div>
            )}
            {selectedSiloPageIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded border border-module-accent/35 bg-module-accent/10 px-1.5 py-0.5 text-sm font-semibold text-module-accent">{selectedSiloPageIds.size}</span>
                <span className="text-sm text-module-accent">{selectedSiloPageIds.size === 1 ? "página de silo selecionada" : "páginas de silo selecionadas"}</span>
              </div>
            )}
          </div>

          {/* Ações contextuais */}
          <div className="flex shrink-0 items-center gap-2">
            {/*
              * A FRONTEIRA ENTRE AS ABAS.
              *
              * Artigos fecha composição e pertencimento ao Silo. Links internos
              * trabalha relações e âncoras SOBRE essa arquitetura — ele pode
              * apontar problema, nunca mover keyword de Silo.
              *
              * As duas condições estavam invertidas: o seletor de Silo aparecia
              * fora de Artigos e o envio ao Radar aparecia dentro dela. A pessoa
              * trocava o Silo de um artigo na aba de âncoras.
              */}
             {articleMode && selectedArticleIds.size > 0 && selectedSiloPageIds.size === 0 && (
              <>
                <select
                  aria-label="Mover selecionados para Silo"
                  defaultValue=""
                  onChange={event => { void handleMoveSelectedArticlesToSilo(event.target.value); event.currentTarget.value = ""; }}
                  disabled={generatingStrategic}
                  className={`${ARCHITECT_UI.footerButton} max-w-52 cursor-pointer text-text-muted`}
                  title="Mover somente os artigos selecionados para um silo canônico"
                >
                  <option value="" className="bg-surface-elevated">Mover selecionados para Silo</option>
                  {siloOptions.map(silo => <option key={silo.id} value={silo.id} className="bg-surface-elevated">{silo.nome}</option>)}
                </select>
              </>
            )}

             {/* Superseded malformed title retained only as source history. */}
             {/*
             {articleMode && selectedArticleIds.size > 0 && selectedSiloPageIds.size === 0 && <button type="button" onClick={() => void requestSelectedKeywordDeletion()} disabled={updating} className={`${ARCHITECT_UI.footerButton} border-danger/45 text-danger hover:border-danger disabled:cursor-not-allowed disabled:opacity-40`} title="Excluir somente as KeywordDNAs dos artigos selecionados pelo ciclo de vida canônico"><Trash2 className="h-3 w-3" aria-hidden="true"/>Excluir</button>}
             */}
             {articleMode && selectedArticleIds.size > 0 && selectedSiloPageIds.size === 0 && <button type="button" onClick={() => void requestSelectedKeywordDeletion()} disabled={updating} className={`${ARCHITECT_UI.footerButton} border-danger/45 text-danger hover:border-danger disabled:cursor-not-allowed disabled:opacity-40`} title="Excluir somente as KeywordDNAs dos artigos selecionados pelo ciclo de vida canonico"><Trash2 className="h-3 w-3" aria-hidden="true"/>Excluir</button>}
             {/* Transferência não é status editorial: ela fecha a passada em
                 Links internos, depois do grafo, não no meio da formação. */}
             {workspaceMode === "links" && selectedArticleIds.size > 0 && selectedSiloPageIds.size === 0 && <button onClick={() => { void sendSelectedToRadar(); }} disabled={!canSendSelectedArticlesToRadar} title={canSendSelectedArticlesToRadar ? "Enviar ArticleDNAs aprovados e avaliações SERP completas ao Radar" : selectedArticleRadarGateIssues.join(" ")} className={`${ARCHITECT_UI.footerButton} border-context-accent/45 text-context-accent hover:border-context-accent disabled:cursor-not-allowed disabled:opacity-40`}><ArrowRight className="h-3 w-3"/>Enviar ao Radar</button>}
            <button onClick={() => { markSelectionInteraction("clear-selection"); setSelectedArticleIds(new Set()); setSelectedSiloPageIds(new Set()); lastSelectionAnchorId.current = null; }} className={ARCHITECT_UI.footerButton}>Limpar seleção</button>
          </div>
        </footer>
      )}

      <BackgroundTaskNotice tasks={architectTasks.slice(-4)} onDismiss={dismissBackgroundTask}/>

      <WorkflowImportDialog
        open={keywordImportOpen}
        title="Importar keywords do Minerador"
        description="A elegibilidade é verificada no estado canônico da Brand. Keywords aprovadas e publicadas protegidas podem entrar uma única vez no novo fluxo."
        rows={keywordImportPool}
        label={keyword => keyword.keyword}
        details={keyword => <span className="mt-1 block text-slate-500">{keyword.intent || "Intenção não informada"} · volume {keyword.volume_search == null ? "—" : keyword.volume_search.toLocaleString("pt-BR")} · {keyword.siloName || "Sem silo/categoria"}{(keyword.importability === CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED || !canEnterCanonicalArchitectWorkflow(keyword)) && <span className="mt-1 block text-amber-300">{importabilityReason(keyword)}</span>}</span>}
        disabled={keyword => !canEnterCanonicalArchitectWorkflow(keyword)}
        disabledReason={keyword => importabilityReason(keyword)}
        status={keyword => importabilityStatus(keyword)}
        loading={loadingKeywords}
        error={keywordImportError}
        onRetry={() => fetchMasterList()}
        onClose={() => setKeywordImportOpen(false)}
        onImport={importApprovedKeywords}
      />
      <DeleteConfirmation open={keywordDeleteSimpleOpen} title="Excluir keywords não publicadas?"
        description="Esta ação excluirá definitivamente as KeywordDNAs selecionadas e os dados operacionais não publicados que pertencem a elas. Versões e eventos canônicos permanecem preservados."
        confirmationName={keywordDeleteReview?.confirmationName || ""} impact={keywordDeleteReview?.impact || []} confirmLabel="Excluir definitivamente"
        onCancel={() => { setKeywordDeleteSimpleOpen(false); setKeywordDeleteReview(null); }} onConfirm={confirmSelectedKeywordDeletion}/>

      <PublishedDeleteConfirmation open={keywordDeletePublishedOpen} title="Remover keywords publicadas por 24 horas"
        description={`Esta ação removerá ${keywordDeleteReview?.publishedIds.length || 0} KeywordDNA(s) publicada(s) da operação e permitirá restauração durante 24 horas.`}
        confirmationName={keywordDeleteReview?.confirmationName || ""} impact={keywordDeleteReview?.impact || []}
        onCancel={() => { setKeywordDeletePublishedOpen(false); setKeywordDeleteReview(null); }} onConfirm={confirmSelectedKeywordDeletion}/>

      {dangerApproval && <DangerApprovalDialog open title={dangerApproval.title} description={dangerApproval.description}
        impact={dangerApproval.impact} verificationPhrase={dangerApproval.phrase} confirmLabel={dangerApproval.label}
        onCancel={() => setPendingDangerAction(null)} onConfirm={confirmDangerAction}/>}

      {isListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4">
          <div className="w-full max-w-sm rounded border border-divider bg-surface-elevated shadow-2xl">
              <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-foreground">Criar Novo Silo</span>
              <button type="button" onClick={closeNewSiloModal} className="cursor-pointer text-text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateList} className="p-4 flex flex-col gap-4">
              <section className="flex flex-col gap-3 rounded border border-divider bg-surface-subtle p-3">
                <div><p className="text-sm font-semibold uppercase tracking-wider text-context-accent">Estratégia do silo</p><p className="mt-1 text-sm leading-6 text-text-muted">Crie a estrutura inicial do silo. As keywords e a entidade central serão definidas posteriormente pelos processos do Arquiteto.</p></div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold uppercase tracking-wider text-text-muted">NOME DO SILO</label>
                  <input type="text" required placeholder="Ex.: Manicure" value={newListName} onChange={e => handleNewSiloNameChange(e.target.value)} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-text-muted focus:border-module-accent/45 focus:ring-2 focus:ring-module-accent/20" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold uppercase tracking-wider text-text-muted">SLUG</label>
                  <input type="text" required placeholder="Ex.: /manicure" value={newSiloSlug} onChange={e => { setSlugManuallyEdited(true); setNewSiloSlug(e.target.value); }} onBlur={() => { if (newSiloSlug.trim().length === 0) return; try { setNewSiloSlug(normalizeManualSiloPageSlug(newSiloSlug)); } catch { /* a validação final informa o problema sem bloquear a digitação */ } }} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 font-mono text-sm text-foreground outline-none placeholder:text-text-muted focus:border-module-accent/45 focus:ring-2 focus:ring-module-accent/20" />
                  <p className="text-sm text-text-muted">Gerado automaticamente. Você pode editar.</p>
                </div>
              </section>
              <div className="flex justify-end gap-2 mt-1">
                <button type="button" onClick={closeNewSiloModal}
                  className="inline-flex min-h-8 items-center rounded border border-divider bg-surface-subtle px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground cursor-pointer">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-action-accent/60 bg-action-accent px-4 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/35 disabled:opacity-40 cursor-pointer">
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />} Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {siloContextRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="architect-silo-context-modal">
          <div className="w-full max-w-lg overflow-hidden rounded-lg border border-divider bg-surface-elevated">
            <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-foreground">Contexto do Silo</span>
              <button type="button" onClick={() => setSiloContextRef(null)} className="cursor-pointer text-text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={event => { event.preventDefault(); void saveSiloContext(); }} className="flex flex-col gap-4 p-4">
              <p className="text-sm leading-6 text-text-muted">
                Sem estes campos o silo não pode ser confirmado. Nada é preenchido por inferência: o que você não escrever continua em aberto.
              </p>
              <div className="flex flex-col gap-1">
                <label htmlFor="silo-context-name" className="text-sm font-semibold uppercase tracking-wider text-text-muted">Nome do silo</label>
                <input type="text" id="silo-context-name" value={siloContextDraft.name} onChange={event => setSiloContextDraft(previous => ({ ...previous, name: event.target.value }))} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-module-accent/45" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="silo-context-entity" className="text-sm font-semibold uppercase tracking-wider text-text-muted">Entidade central</label>
                <input type="text" required placeholder="Ex.: protetor solar" id="silo-context-entity" value={siloContextDraft.centralEntity} onChange={event => setSiloContextDraft(previous => ({ ...previous, centralEntity: event.target.value }))} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-text-muted focus:border-module-accent/45" />
                <p className="text-sm text-text-muted">O assunto que sustenta o universo inteiro.</p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="silo-context-intent" className="text-sm font-semibold uppercase tracking-wider text-text-muted">Intenção macro</label>
                <input type="text" required placeholder="Ex.: informacional" id="silo-context-intent" value={siloContextDraft.macroIntent} onChange={event => setSiloContextDraft(previous => ({ ...previous, macroIntent: event.target.value }))} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-text-muted focus:border-module-accent/45" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="silo-context-includes" className="text-sm font-semibold uppercase tracking-wider text-text-muted">Fronteira · entra</label>
                <input type="text" required placeholder="Ex.: fps, resenha, pós-sol" id="silo-context-includes" value={siloContextDraft.includes} onChange={event => setSiloContextDraft(previous => ({ ...previous, includes: event.target.value }))} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-text-muted focus:border-module-accent/45" />
                <p className="text-sm text-text-muted">Separe por vírgula.</p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="silo-context-excludes" className="text-sm font-semibold uppercase tracking-wider text-text-muted">Fronteira · não entra</label>
                <input type="text" placeholder="Opcional" id="silo-context-excludes" value={siloContextDraft.excludes} onChange={event => setSiloContextDraft(previous => ({ ...previous, excludes: event.target.value }))} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-text-muted focus:border-module-accent/45" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="silo-context-statement" className="text-sm font-semibold uppercase tracking-wider text-text-muted">Narrativa</label>
                <input type="text" placeholder="Por que estes conteúdos pertencem juntos" id="silo-context-statement" value={siloContextDraft.statement} onChange={event => setSiloContextDraft(previous => ({ ...previous, statement: event.target.value }))} className="w-full rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-text-muted focus:border-module-accent/45" />
              </div>
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1 text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Continuidade
                  <select aria-label="Continuidade da narrativa do silo" value={siloContextDraft.continuity} onChange={event => setSiloContextDraft(previous => ({ ...previous, continuity: event.target.value }))} className="rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground">
                    <option value="coherent">Coerente</option>
                    <option value="partial">Parcial</option>
                    <option value="fragmented">Fragmentada</option>
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Alinhamento com a marca
                  <select aria-label="Alinhamento do silo com a marca" value={siloContextDraft.brandAlignment} onChange={event => setSiloContextDraft(previous => ({ ...previous, brandAlignment: event.target.value }))} className="rounded-md border border-divider bg-surface-subtle px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-foreground">
                    <option value="aligned">Alinhado</option>
                    <option value="adjacent">Adjacente</option>
                    <option value="off_strategy">Fora da estratégia</option>
                  </select>
                </label>
              </div>
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={() => setSiloContextRef(null)} className="inline-flex min-h-8 items-center rounded border border-divider bg-surface-subtle px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:text-foreground cursor-pointer">Cancelar</button>
                <button type="submit" disabled={siloContextSaving} data-testid="architect-save-silo-context" className="inline-flex min-h-8 items-center gap-1 rounded-md border border-action-accent/60 bg-action-accent px-4 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-context-accent disabled:opacity-40 cursor-pointer">
                  {siloContextSaving && <Loader2 className="w-3 h-3 animate-spin" />} Registrar contexto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
