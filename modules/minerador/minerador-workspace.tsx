"use client";

import { useState, useEffect, useRef, Fragment, useMemo, useCallback, type DragEvent, type ReactNode } from "react";
import Papa from "papaparse";
import { 
  Loader2, 
  ArrowUpDown,
  Trash2,
  X,
  Plus,
  RefreshCw,
  FolderPlus,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Check,
  FileSpreadsheet,
  Brain,
  Search,
  ChevronDown,
  ChevronRight,
  Building2,
  MoreHorizontal,
  CheckCheck,
} from "lucide-react";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { useBrand } from "@/components/brand-context";
import { AppMenu } from "@/components/app-menu";
import { InfoHint } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";
import { KeywordDnaPanel } from "@/components/editorial/dna-panels";
import { VinculoPageTypeSelect, VinculoPostSelect, VinculoSubjectFields, VinculoSubjectSelect } from "@/components/editorial/vinculo-selects";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import { MineradorLastOrganizationRestorer } from "./last-organization-restorer";
import { DeleteConfirmation, PublishedDeleteConfirmation, RecoveryAction } from "@/components/lifecycle/delete-confirmation";
import type { DeletionImpactEntry } from "@/lib/lifecycle";
import { useSupabaseSession as useSession } from "@/components/auth/supabase-session-context";
import { useNoticeCenter } from "@/components/global-notice-center";
import { useRouter } from "next/navigation";
import {
  autoClassifyIntent,
  autoDetectNiche,
  deriveLogicalKeywordDna,
  mergeLogicalKeywordSemantic,
} from "@/lib/arquiteto/keyword-dna-engine";
import { persistMineradorArquitetoHandoff } from "@/lib/arquiteto/canonical-workspace";
import { buildMineradorSiteSyncPlan, loadMineradorSiteSyncSnapshot, uniqueSiteSyncCandidates, type MineradorSiteSyncCandidate, type MineradorSiteSyncPlan } from "@/lib/minerador/site-sync-adapter";
import { classifyKgrMeasurement, kgrApplicabilityLabel, kgrDecisionLabel, kgrMeasurementLabel, kgrTechnicalTone, readKgrApplicability, type KgrApplicability } from "@/lib/minerador/kgr-applicability";
import { describeKgrApplicabilityBatch, planKgrApplicabilityBatch } from "@/lib/minerador/kgr-applicability-batch";
import { describeHumanReviewCompletionBatch, planHumanReviewCompletionBatch } from "@/lib/minerador/human-review-completion-batch";
import { applyHumanReviewField, applyHumanReviewKgrApplicability, canCompleteHumanReview, completeHumanReview, humanReviewRecord, isHumanReviewCompleted, type HumanReviewAction } from "@/lib/minerador/human-review";
import { evaluateMineradorArquitetoHandoffBatch } from "@/lib/minerador/arquiteto-handoff-gates";
import { canonicalIntentLabel, normalizeIntentKey } from "@/lib/minerador/intent-taxonomy";
import { assessVolumeKgrConsistency, hasExplicitZeroMeasurement, volumeKgrConsistencyLabel, type VolumeKgrConsistency } from "@/lib/minerador/volume-kgr-consistency";
import { combinedKgrFilterValue, combinedVinculoFilterValue, deriveMineradorTableRows, KGR_FILTER_GROUPS, parseCombinedKgrFilter, parseCombinedVinculoFilter, PROCESS_RUN_FILTER_OPTIONS, VINCULO_FILTER_GROUPS } from "@/lib/minerador/table-view";
import { processorCpcCell, processorKdCell, processorResultsCell, processorVolumeCell, type ProcessorCellState, type ProcessorRunFilter } from "@/lib/minerador/processor-table-cells";
import { BATCH_STOPPED_BY_USER_REASON, formatBatchElapsed, formatBatchFailures, formatBatchProgress, formatBatchProgressCompact, formatBatchProgressDetail, formatBatchSummary, reclassifyBatchItemsAsFailed, runProgressiveBatch, type BatchChunkResult, type BatchItemOutcome, type BatchProgressSnapshot, type ProgressiveBatchInput } from "@/lib/ui/batch-progress";
import { NATIVE_SELECT_THEME } from "@/lib/ui/native-select-theme";
import { mineradorLastOrganizationKey, mineradorOrganizationButtonSummary, mineradorOrganizationLabels, type MineradorOrganizationValues } from "@/lib/minerador/last-organization";
import { primaryKeywordPolicyLabel, readPrimaryKeywordPolicy, setPrimaryKeywordPolicy, type PrimaryKeywordPolicy } from "@/lib/minerador/primary-keyword-policy";
import { keywordPageTypeLabel, keywordPageTypeStanding, setKeywordPageType } from "@/lib/minerador/keyword-page-type";
import { KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL, keywordVinculoChoiceLabels, keywordVinculoChoicesSummary, resolveKeywordVinculo } from "@/lib/minerador/keyword-vinculo";
import { isKeywordSubjectActorId, setKeywordSubject, withdrawKeywordSubject } from "@/lib/minerador/keyword-subject";
import { subjectDestinationCatalogKey, validateSubjectDestination, type SubjectDestinationCatalogHit } from "@/lib/minerador/subject-destination";
import { planVinculoBatchChoices, VINCULO_BATCH_READBACK_COLUMNS, type VinculoBatchReadbackRow } from "@/lib/minerador/vinculo-batch";
import {
  chooseVinculoBatchSelect,
  commonVinculoSelectValues,
  describeVinculoBatchChoicesConfirmation,
  describeVinculoBatchChoicesResult,
  EMPTY_VINCULO_BATCH_CHOICES,
  isSubjectDeclareChoice,
  keywordsWithoutLogic,
  describeSubjectSkipped,
  partitionSubjectKeywords,
  pickKeywordSubjectKeys,
  VINCULO_BATCH_POST_DISABLED_BY_SUBJECT,
  VINCULO_MIXED_LABEL,
  vinculoBatchActionsFromChoices,
  vinculoBatchPostDisabled,
  vinculoBatchSelectValue,
  type VinculoBatchChoiceGroupKey,
  type VinculoBatchChoices,
  vinculoReadbackConfirmed,
} from "@/lib/minerador/vinculo-screen";
import { applyFunnelQualification, classifyKeywordFunnel } from "@/lib/minerador/keyword-qualification";
import { classifyVolumeReadback, readVolumeEligibility, volumeEligibilityLabel, type VolumeReadbackOutcome } from "@/lib/minerador/volume-eligibility";
import { formatGoogleAdsCpcTableValue } from "@/lib/minerador/google-ads-demand";
import { buildLogicalOutputContract, buildLogicalProcessorMetadata, hasCompleteLogicalOutputContract, hasCurrentLogicalProcessorMetadata, logicalSemanticRecordsEqual, validateLogicalKeywordOutput } from "@/lib/minerador/logical-processor";
import { MINERADOR_KEYWORDS_TABLE, MINERADOR_LISTING_VIEW, withMeasurementSeries } from "@/lib/minerador/listing-payload";
import { readCanonicalKeywordDna, readLogicalIntentLabel, readLogicalNiche } from "@/lib/minerador/logical-read-model";
import { resolveCanonicalKeywordSnapshot } from "@/lib/minerador/canonical-keyword-snapshot";
import { resolveMineradorProcessState, type MineradorAttemptState, type MineradorProcessAttempt, type MineradorProcessName } from "@/lib/minerador/process-state";
import { type SemanticConsolidationDraft } from "@/lib/minerador/semantic-consolidation-draft";
import { candidateFromCatalogMatch, deriveSitePageStructure, matchKeywordToCatalog, sitePageRoleLabel, type SiteCatalogEntryLike } from "@/lib/minerador/site-catalog-match";
import { isConclusiveSerpEvidence, type SerpSemanticEvidence } from "@/lib/minerador/serp-semantic-evidence";
import { KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE, semanticDraftFromQualification, type KeywordSemanticQualification } from "@/lib/minerador/keyword-semantic-qualification";
import { createIndexedDbQualificationVersionCacheStorage, qualificationVersionCachePruneForListing, resolveCurrentKeywordSemanticQualificationsWithCache, type QualificationVersionCachePrune } from "@/lib/minerador/semantic-qualification-version-cache";
import { applyPublicationLinkAction, readPublicationLink, readSiteOrigin, type PublicationLinkEvidence } from "@/lib/minerador/publication-link";
import {
  keywordRecoveryRemainingLabel,
  resolveKeywordPublication,
} from "@/lib/minerador/keyword-lifecycle";
import { isLegacyPublishedStatus, MINERADOR_EDITORIAL_STATUS_OPTIONS, MINERADOR_EDITORIAL_STATUSES, resolveEditorialKeywordStatus, type EditorialKeywordStatus } from "@/lib/minerador/editorial-status";
import { applyApproval, resolveApprovalReadiness, VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE } from "@/lib/minerador/approved-package";
import type { KeywordTableOrderMode } from "@/lib/minerador/manual-order";
import { manualImportListaId, resolveLegacyCsvSilo } from "@/lib/minerador/legacy-import";
import { KeywordTableBulkBarShell } from "./keyword-table/keyword-table-bulk-bar-shell";
import { KeywordTableEmptyState } from "./keyword-table/keyword-table-empty-state";
import { KeywordTableHeader } from "./keyword-table/keyword-table-header";
import { KeywordTableOrganizeButton } from "./keyword-table/keyword-table-organize-button";
import { KeywordSelectionCell, KeywordSelectionHeader } from "./keyword-table/keyword-table-selection";
import { KeywordTableShell } from "./keyword-table/keyword-table-shell";
import { useKeywordTableSelection } from "./keyword-table/use-keyword-table-selection";
import { keywordTableMinimumWidth, useKeywordTableResponsiveWidths } from "./keyword-table/use-keyword-table-responsive-widths";
import { KeywordTableDragHandle, KeywordTableOrderModeSelect } from "./keyword-table/keyword-table-order";
import { useKeywordTableOrder } from "./keyword-table/use-keyword-table-order";
import { KeywordTableColumnResizeHandle, KeywordTableRowResizeHandle, useKeywordTableColumnResize, useKeywordTableRowResize } from "./keyword-table/keyword-table-resize";
import { MineradorProcessAction } from "./minerador-process-action";
import { DiscoverySourceControls, type DiscoverySourceControlsHandle, type DiscoverySourceResponse } from "./discovery/discovery-source-controls";
import { DiscoverySourceTopbarActions } from "./discovery/discovery-source-topbar-actions";
import { subjectSearchLinkHref } from "./discovery/subject-search-model";
import {
  createAuthenticatedBrowserClient,
  getCurrentSupabaseToken,
  getSupabaseSessionErrorMessage,
  isSupabaseBrowserAuthError,
  isSupabaseTokenExpirationError,
  withSupabaseSelectRetry,
} from "@/lib/supabase/browser-authenticated-client";

interface ListObject {
  id: string;
  nome: string;
  nicho: string | null;
  marca_id: string;
}

type KeywordSemantic = Record<string, unknown> & {
  nicho_override?: string;
  slug_sugerido?: string;
  site_origin?: SiteEvidenceView;
  site_origins?: SiteEvidenceView[];
  primary_keyword_policy?: PrimaryKeywordPolicy;
  allintitle_measurement?: Record<string, unknown>;
  allintitle_measurement_history?: Array<Record<string, unknown>>;
  volume_measurement?: Record<string, unknown>;
  volume_eligibility?: Record<string, unknown>;
  kgr_score_history?: Array<Record<string, unknown>>;
};

type HumanReviewDraft = {
  semantic: KeywordSemantic;
  intent: string | null;
};

interface KeywordItem {
  id: string;
  // Runtime invariant: post-0005 rows always carry brand_id; the optional view type keeps legacy fixtures readable.
  brand_id?: string;
  keyword: string;
  location: string | null;
  results_allintitle: number | null;
  volume_search: number | null;
  kgr_score: number | null;
  intent: string | null;
  status: string;
  lista_id: string | null;
  analise_semantica?: KeywordSemantic | null;
  volume_source?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  purge_after?: string | null;
}

function keywordPublicationProtected(item: Pick<KeywordItem, "status" | "analise_semantica">): boolean {
  return resolveKeywordPublication({ status: item.status, semantic: item.analise_semantica || null }).isPublished;
}

type QualificationResult = {
  id: string;
  keyword: string;
  status: "processada" | "sem_alteracao" | "preservada" | "conflito" | "falha";
  intent: string;
  funnel: string;
  niche: string;
  bias: string;
  confidence: string;
};

type SiteEvidenceView = PublicationLinkEvidence & { source?: string; batchId?: string; siloId?: string; siloName?: string | null; consolidatedAt?: string };
function siteRelationLabel(value?: string) { return ({ confirmed_primary: "Principal confirmada", confirmed_secondary: "Secundária confirmada", candidate_primary: "Principal candidata", supporting: "Apoio provável", mentioned: "Mencionada no conteúdo", undefined: "Sem relação definida" } as Record<string, string>)[value || "undefined"] || value || "Sem relação definida"; }
function siteArchitectureLabel(value?: string) { return ({ not_structured: "Não estruturado", awaiting_architecture: "Aguardando arquitetura", in_review: "Em revisão", architecture_confirmed: "Arquitetura confirmada", architectural_review_required: "Revisão arquitetural necessária", conflict: "Com conflito" } as Record<string, string>)[value || "awaiting_architecture"] || value || "Aguardando arquitetura"; }
function logicalNiche(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.toLocaleLowerCase("pt-BR") !== "geral" ? trimmed : null;
}
function humanSemanticMarker(value: unknown) {
  return ["aprovado", "aprovada", "confirmado", "confirmada", "confirmed", "human", "humano", "manual", "humana"]
    .includes(String(value || "").trim().toLocaleLowerCase("pt-BR"));
}
function humanNicheProtected(semantic: KeywordSemantic | null | undefined) {
  return humanSemanticMarker(semantic?.nicho_origem)
    || humanSemanticMarker(semantic?.dna_origem)
    || humanSemanticMarker(semantic?.dna_revisao_humana)
    || typeof semantic?.nicho_humano === "string";
}
function humanFunnelProtected(semantic: KeywordSemantic | null | undefined) {
  return semantic?.funnel_human_confirmed === true
    || semantic?.funnel_human_confirmed === "true"
    || humanSemanticMarker(semantic?.funnel_source)
    || humanSemanticMarker(semantic?.funnel_decision_origin);
}
function siteSyncOutcomeLabel(value: string) { return ({ new: "Nova keyword", evidence_updated: "Evidência será atualizada", no_change: "Sem alteração", duplicate_in_batch: "Duplicada na prévia", invalid: "Inválida", blocked: "Bloqueada", existing: "Já existente" } as Record<string, string>)[value] || value; }
const siteVerificationStatuses = new Set(["discovered", "unverified", "accessible", "canonical_confirmed", "canonical_missing", "canonical_conflict", "redirect", "noindex", "not_found", "error", "stale"]);
function withSiteVerification(candidate: MineradorSiteSyncCandidate, body: unknown, checkedAt: string): MineradorSiteSyncCandidate {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const verification = record.verification && typeof record.verification === "object" && !Array.isArray(record.verification)
    ? record.verification as Record<string, unknown>
    : null;
  const rawStatus = String(verification?.verificationStatus || record.verificationStatus || "error");
  const urlSituation = siteVerificationStatuses.has(rawStatus) ? rawStatus : "error";
  return {
    ...candidate,
    urlSituation: urlSituation as MineradorSiteSyncCandidate["urlSituation"],
    resolvedUrl: typeof verification?.resolvedUrl === "string" ? verification.resolvedUrl : candidate.resolvedUrl ?? null,
    declaredCanonicalUrl: typeof verification?.canonical === "string" ? verification.canonical : candidate.declaredCanonicalUrl ?? null,
    lastCheckedAt: checkedAt,
    httpStatus: typeof verification?.httpStatus === "number" ? verification.httpStatus : null,
    contentType: typeof verification?.contentType === "string" ? verification.contentType : null,
    pageTitle: typeof verification?.title === "string" ? verification.title : null,
    pageH1: typeof verification?.h1 === "string" ? verification.h1 : null,
  };
}
function candidateFromStoredSiteEvidence(item: KeywordItem, brandId: string): MineradorSiteSyncCandidate | null {
  const evidence = readSiteOrigin(item.analise_semantica);
  const sourceUrl = evidence?.resolvedUrl || evidence?.sourceUrl || evidence?.declaredCanonicalUrl;
  if (!sourceUrl) return null;
  const normalizedText = item.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  return {
    id: crypto.randomUUID(),
    brandId,
    text: item.keyword,
    normalizedText,
    catalogEntryId: typeof evidence.catalogEntryId === "string" ? evidence.catalogEntryId : null,
    sourceKind: evidence.source === "manual_url" ? "manual_url" : "site_sitemap",
    sourceUrl,
    sourceField: "other",
    sourceFields: ["other"],
    suggestedRole: "unclassified",
    slugCoherence: "unknown",
    urlSituation: "unverified",
    publicationStatus: "not_confirmed",
    keywordUrlRelation: "undefined",
    architectureStatus: "awaiting_architecture",
    relationConfirmedBy: null,
    relationConfirmedAt: null,
    confidence: "medium",
    resolvedUrl: evidence.resolvedUrl || null,
    declaredCanonicalUrl: evidence.declaredCanonicalUrl || null,
    lastCheckedAt: evidence.lastCheckedAt || null,
    catalogTitle: null,
    siteRole: typeof evidence.siteRole === "string" ? evidence.siteRole as MineradorSiteSyncCandidate["siteRole"] : undefined,
    siloPath: typeof evidence.siloPath === "string" ? evidence.siloPath : null,
    mineradorKeywordId: item.id,
  };
}
const processorColumnWidths = {
  drag: 32, index: 32, selection: 34, keyword: 460, vinculo: 148, results: 128, volume: 120,
  kgr: 108, cpc: 96, kd: 70, intent: 168, niche: 168, funnel: 80, status: 108,
};
const processorColumnConstraints = {
  drag: { min: 28, max: 48 }, index: { min: 28, max: 56 }, selection: { min: 30, max: 56 }, keyword: { min: 240, max: 1200, fill: true },
  vinculo: { min: 84, max: 320 }, results: { min: 104, max: 260, priority: "protected" as const }, volume: { min: 96, max: 260, priority: "protected" as const }, kgr: { min: 68, max: 200 }, cpc: { min: 72, max: 220 }, kd: { min: 52, max: 180 },
  intent: { min: 80, max: 420, flexible: true }, niche: { min: 80, max: 420, flexible: true }, funnel: { min: 56, max: 200 }, status: { min: 88, max: 280 },
};
/**
 * Só abaixo desta largura a barra horizontal do Processador é necessária. A
 * soma dos mínimos (1106px) mais a folga das bordas cabe num notebook de
 * 1366px com o menu lateral aberto (240px + 1px de borda) e a barra vertical
 * fina da planilha (11px): ali a barra horizontal não liga sozinha. Cederam
 * Intenção e Nicho, que truncam com reticências e têm o texto inteiro no
 * título, e o KD, onde o número ainda cabe. Palavra-Chave, Resultados, Volume,
 * KGR e CPC ficam com os mínimos de antes; a Palavra-Chave quebra linha e
 * nunca é cortada.
 */
const processorTableMinimumWidth = keywordTableMinimumWidth(processorColumnConstraints, Object.keys(processorColumnWidths));
/**
 * Folga que a planilha deixa no contêiner. Com border-collapse, a borda
 * esquerda de 2px da linha expandida e do detalhe (e qualquer borda na
 * lateral da tabela) soma metade à largura da tabela; sem esta folga, colunas
 * que somam exatamente o contêiner ligavam a barra horizontal no fim da lista
 * sem nenhuma coluna alargada. A Palavra-Chave (fill) cede os 2px.
 */
const processorTableWidthOptions = { edgeReserve: 2 } as const;
const mineradorWorkflowStatuses = MINERADOR_EDITORIAL_STATUSES;
type MineradorWorkflowStatus = EditorialKeywordStatus;
function funnelLabelFor(item: KeywordItem): string {
  return readCanonicalKeywordDna(item).funnelLabel;
}

const formatMetricInteger = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

/**
 * Célula de métrica sem número: "—" só quando nunca passou pelo processo;
 * "0" apagado quando passou e não veio dado (o dado continua vazio); "Erro"
 * na cor de alerta quando o processo falhou, com o motivo na dica.
 */
const processorCellToneClass: Record<ProcessorCellState["tone"], string> = {
  value: "",
  processed_empty: "text-text-muted/60",
  not_processed: "",
  error: "font-medium text-warning",
  pending: "text-text-muted",
};
function ProcessorMetricPlaceholder({ cell }: { cell: ProcessorCellState }) {
  return <span data-processor-cell-tone={cell.tone} className={processorCellToneClass[cell.tone]} title={cell.hint || undefined}>{cell.text}</span>;
}

type BulkProgressStep = "site" | "logic" | "volume" | "results" | "review";
type BulkProgressStatus = "idle" | "processing" | "success" | "error";
type BulkProgressFailure = { id: string; label: string; reason: string };
type BulkProgressState = {
  status: BulkProgressStatus;
  step: BulkProgressStep | null;
  current: number;
  total: number | null;
  message: string;
  detail: string;
  /** Lote progressivo (lib/ui/batch-progress): o texto vivo vem do runner. */
  batch: boolean;
  failed: number;
  failures: readonly BulkProgressFailure[];
  stoppable: boolean;
  /** Início do bloco em curso: o cartão mostra "há 40s" para provar que segue vivo. */
  chunkStartedAtMs?: number | null;
};

const initialBulkProgressState: BulkProgressState = {
  status: "idle",
  step: null,
  current: 0,
  total: null,
  message: "",
  detail: "",
  batch: false,
  failed: 0,
  failures: [],
  stoppable: false,
};

/*
 * LOTES PROGRESSIVOS (pedido do dono, 2026-09-24; SDD
 * docs/compartilhado/sdd-padrao-planilha-progresso-notificacoes-2026-09-24.md, 5.5).
 * Rotas pagas andam um bloco por vez; gravações no banco, poucas ao mesmo
 * tempo. O limite de 1.000 alvos de Resultados continua valendo para o lote
 * inteiro, como a rota já exigia.
 */
const RESULTS_BATCH_CHUNK_SIZE = 5;
const RESULTS_BATCH_MAX_TARGETS = 1000;
const VOLUME_BATCH_CHUNK_SIZE = 200;
const BULK_WRITE_CONCURRENCY = 4;
const BATCH_NO_SERVER_CONFIRMATION = "sem confirmação do servidor; confira antes de repetir";

function describeBatchWriteError(error: unknown): string {
  const cause = error as { message?: unknown; code?: unknown; details?: unknown } | null;
  return [cause?.code, cause?.message, cause?.details].filter(Boolean).map(String).join(" · ") || "erro sem mensagem";
}

const bulkProgressStepMeta: Record<BulkProgressStep, {
  label: string;
  processingLabel: string;
  textClass: string;
  barClass: string;
  activeClass: string;
  cardClass: string;
}> = {
  site: {
    label: "Conferir site",
    processingLabel: "Conferindo site...",
    textClass: "text-context-accent",
    barClass: "bg-context-accent",
    activeClass: "border-context-accent bg-context-accent/10 text-context-accent",
    cardClass: "border-context-accent/35 bg-context-accent/10",
  },
  logic: {
    label: "Lógica",
    processingLabel: "Processando lógica...",
    textClass: "text-module-accent",
    barClass: "bg-module-accent",
    activeClass: "border-module-accent bg-module-accent/10 text-module-accent",
    cardClass: "border-module-accent/35 bg-module-accent/10",
  },
  volume: {
    label: "Volume",
    processingLabel: "Medindo volume...",
    textClass: "text-context-accent",
    barClass: "bg-context-accent",
    activeClass: "border-context-accent bg-context-accent/10 text-context-accent",
    cardClass: "border-context-accent/35 bg-context-accent/10",
  },
  results: {
    label: "Resultados",
    processingLabel: "Medindo resultados...",
    textClass: "text-context-accent",
    barClass: "bg-context-accent",
    activeClass: "border-context-accent bg-context-accent/10 text-context-accent",
    cardClass: "border-context-accent/35 bg-context-accent/10",
  },
  review: {
    label: "Revisão",
    processingLabel: "Aplicando revisão...",
    textClass: "text-pending",
    barClass: "bg-pending",
    activeClass: "border-pending bg-pending/10 text-pending",
    cardClass: "border-pending/35 bg-pending/10",
  },
};

// Helper para formatar texto em slug de SEO
const toSlug = (text: string) => {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

/**
 * De onde a listagem lê: a view podada, com recuo para a tabela.
 *
 * O recuo existe porque código e banco não sobem juntos aqui — as migrations
 * são aplicadas à mão. Sem ele, publicar esta tela antes de aplicar a
 * migration deixaria o Minerador sem listagem nenhuma. O recuo é definitivo
 * na sessão: uma vez que a view falte, não se insiste a cada carregamento.
 *
 * Fora do componente de propósito: a decisão vale para a aba inteira, não
 * para uma montagem.
 */
let fonteDaListagem: string = MINERADOR_LISTING_VIEW;

/** Teto de ids por leitura `.in("id", ...)`: a lista vai na URL do PostgREST. */
const KEYWORD_READBACK_ID_CHUNK = 200;

/** Instante fixo da prévia do Vínculo em grupo: a prévia não grava, e a gravação usa o instante real. */
const VINCULO_BATCH_PREVIEW_AT = "1970-01-01T00:00:00+00:00";
/** Chaves do Potencial de página que a revisão aberta precisa receber depois da gravação individual. */
const PAGE_TYPE_DRAFT_KEYS = ["keyword_page_type", "keyword_page_type_stance", "keyword_page_type_actor", "keyword_page_type_at", "keyword_page_type_history"] as const;
const isBatchKgrChoice = (value: string): value is KgrApplicability => value === "pending" || value === "applicable" || value === "not_applicable";

/** A view ainda não existe no banco? (PostgREST não a acha no cache do schema.) */
function viewDeListagemAusente(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  return code === "42P01"
    || code === "PGRST205"
    || String(error.message || "").includes(MINERADOR_LISTING_VIEW);
}

/**
 * Selects nativos do rodapé, de "Mais ações" e do painel Organizar: o tema
 * compartilhado abre a lista de opções no esquema do tema ativo, com as
 * opções (também dentro de optgroup) nos tokens de fundo e texto.
 */
const BULK_SELECT_THEME = NATIVE_SELECT_THEME;
/** Mesma regra para os seletores do painel Organizar, com os tokens da planilha. */
const ORGANIZE_LABEL_CLASS = "flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium text-text-muted";
const ORGANIZE_SELECT_CLASS = `min-h-9 rounded border border-divider bg-background px-2 py-1.5 text-sm text-foreground focus:border-module-accent focus:outline-none ${BULK_SELECT_THEME}`;

/**
 * Painel do seletor "Vínculo" do rodapé: os mesmos três selects do card
 * REVISÃO HUMANA (components/editorial/vinculo-selects.tsx), sem "Não mudar"
 * (pedido do dono, 2026-09-24). Cada select mostra o valor comum das
 * selecionadas ou "Valores diferentes"; a escolha fica aqui até "Aplicar", e
 * só o select que o humano mudou é gravado. Nota e destino só com Assunto
 * Declarado escolhido no painel.
 */
type VinculoBatchDialogState = VinculoBatchChoices & { note: string; destination: string };

export default function Home({ brandRef, sectionTabs }: { brandRef: string; sectionTabs?: ReactNode }) {
  const { data: session, status: sessionStatus, actorUserId } = useSession();
  const { selectedBrandId, brands, userRole } = useBrand();
  const { publishNotice } = useNoticeCenter();
  const router = useRouter();
  const supabase = useMemo(() => createAuthenticatedBrowserClient(), []);
  // Cache das versões imutáveis da Qualificação (E8), em banco IndexedDB próprio.
  const qualificationVersionCache = useMemo(() => createIndexedDbQualificationVersionCacheStorage(), []);
  const activeBrand = brands.find(b => b.id === selectedBrandId) || null;



  const getCanonicalUrl = (item: KeywordItem) => {
    const evidence = readSiteOrigin(item.analise_semantica);
    return evidence?.declaredCanonicalUrl || evidence?.resolvedUrl || evidence?.sourceUrl || "";
  };

  // Estados de Dados
  const [lists, setLists] = useState<ListObject[]>([]);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  
  // Estados de Controle/Status
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [, setImporting] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [, setQueueProgress] = useState(0);
  const [dnaProcessing, setDnaProcessing] = useState(false);
  const [, setDnaProgress] = useState({ current: 0, total: 0 });
  const [bulkProgress, setBulkProgress] = useState<BulkProgressState>(initialBulkProgressState);
  const [bulkProgressNowMs, setBulkProgressNowMs] = useState(() => Date.now());
  const bulkChunkRunning = bulkProgress.status === "processing" && typeof bulkProgress.chunkStartedAtMs === "number";
  // Relógio do bloco em curso: sem ele, um bloco lento da SERP deixava o
  // cartão parado e não dava para saber se o lote travou.
  useEffect(() => {
    if (!bulkChunkRunning) return;
    const timer = window.setInterval(() => setBulkProgressNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [bulkChunkRunning]);
  const bulkChunkElapsed = bulkChunkRunning ? formatBatchElapsed(bulkProgress.chunkStartedAtMs, Math.max(bulkProgressNowMs, bulkProgress.chunkStartedAtMs ?? 0)) : null;
  const [processAttemptsByKeywordId, setProcessAttemptsByKeywordId] = useState<Record<string, Partial<Record<MineradorProcessName, MineradorProcessAttempt>>>>({});
  const [, setQualificationResults] = useState<QualificationResult[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [humanReviewOpenId, setHumanReviewOpenId] = useState<string | null>(null);
  const [humanReviewDrafts, setHumanReviewDrafts] = useState<Record<string, HumanReviewDraft>>({});
  const [semanticConsolidationDrafts, setSemanticConsolidationDrafts] = useState<Record<string, SemanticConsolidationDraft>>({});
  // Catálogo remoto do Site da Marca, lido na última conferência: é contra
  // ele que a URL manual descobre se é Silo ou artigo.
  const siteCatalogRef = useRef<SiteCatalogEntryLike[]>([]);
  const manualSiteCheckRef = useRef<HTMLElement | null>(null);
  // Qualificação Semântica persistida por keyword: fonte canônica reidratada do
  // servidor em todo carregamento (F5, nova aba, outro navegador).
  const [semanticQualifications, setSemanticQualifications] = useState<Record<string, KeywordSemanticQualification>>({});
  // Falha da coleta SERP por keyword: estado honesto, sem apagar Resultado/KGR.
  const [serpCollectionFailures, setSerpCollectionFailures] = useState<Record<string, boolean>>({});
  // Aporte contextual da IA: working copy explícita, nunca persistida no registro
  // canônico e nunca resolvida no carregamento da página.
  // Tentativa gerada mas não persistida: fica separada da versão canônica para
  // nunca substituí-la silenciosamente. F5 descarta a tentativa e mantém vN.
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const discoverySourceControlsRef = useRef<DiscoverySourceControlsHandle>(null);
  const fetchDataInFlightRef = useRef<string | null>(null);
  const fetchDataLoadedKeyRef = useRef<string | null>(null);
  const fetchDataActiveKeyRef = useRef<string | null>(null);
  /** Keywords cujas séries de medição já foram buscadas sob demanda. */
  const hydratedKeywordIdsRef = useRef<Set<string>>(new Set());
  
  // Estados de Filtros e OrdenaÃ§Ã£o
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [filterIntent, setFilterIntent] = useState("Todos");
  // Silo e Arquitetura saíram do painel Organizar (pedido do dono, 2026-09-24):
  // os campos seguem no formato da preferência salva, sempre em "Todos".
  const filterListId = "Todos";
  const [filterSiteRelation, setFilterSiteRelation] = useState("Todos");
  const filterSiteArchitecture = "Todos";
  const [filterSitePublication, setFilterSitePublication] = useState("Todos");
  const [filterKgrApplicability, setFilterKgrApplicability] = useState("Todos");
  const [filterKgrMeasurement, setFilterKgrMeasurement] = useState("Todos");
  const [filterVolumeEligibility, setFilterVolumeEligibility] = useState<"Todos" | "operational" | "pending" | "eligible" | "below_threshold" | "unavailable" | "measurement_failed">("Todos");
  const [filterProcess, setFilterProcess] = useState<ProcessorRunFilter>("Todos");
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [orderMode, setOrderMode] = useState<KeywordTableOrderMode>("auto");
  const [sortColumn, setSortColumn] = useState<"keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "cpc" | "keyword_difficulty" | "nicho" | "lista">("keyword");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [organizationHydratedKey, setOrganizationHydratedKey] = useState<string | null>(null);
  const keywordOrder = useKeywordTableOrder(useMemo(() => keywords.map(item => item.id), [keywords]));
  const columnResize = useKeywordTableColumnResize(processorColumnWidths, processorColumnConstraints);
  const tableRef = useRef<HTMLElement | null>(null);
  const responsiveWidths = useKeywordTableResponsiveWidths(columnResize.widths, processorColumnConstraints, tableRef, columnResize.resizedColumnIds, processorTableWidthOptions);
  const rowResize = useKeywordTableRowResize(36, { min: 32, max: 112 });
  const { manualOrderIds } = keywordOrder;

  const organizationValues = useMemo<MineradorOrganizationValues>(() => ({
    searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture,
    filterSitePublication, filterKgrApplicability, filterKgrMeasurement, filterVolumeEligibility, filterProcess, sortColumn, sortDirection,
  }), [searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture, filterSitePublication, filterKgrApplicability, filterKgrMeasurement, filterVolumeEligibility, filterProcess, sortColumn, sortDirection]);
  const organizationScopeKey = session?.user?.id && selectedBrandId
    ? mineradorLastOrganizationKey(session.user.id, selectedBrandId)
    : null;
  const organizationHydrationPending = Boolean(organizationScopeKey && organizationHydratedKey !== organizationScopeKey);

  const effectiveKeywords = useMemo(() => keywords.map(item => {
    const draft = humanReviewDrafts[item.id];
    return draft
      ? { ...item, analise_semantica: draft.semantic, intent: draft.intent }
      : item;
  }), [keywords, humanReviewDrafts]);

  const filteredKeywords = useMemo(() => deriveMineradorTableRows(effectiveKeywords, lists, {
    searchQuery,
    status: filterStatus,
    intent: filterIntent,
    listId: filterListId,
    siteRelation: filterSiteRelation,
    siteArchitecture: filterSiteArchitecture,
    sitePublication: filterSitePublication,
    kgrApplicability: filterKgrApplicability,
    kgrMeasurement: filterKgrMeasurement,
    volumeEligibility: filterVolumeEligibility,
    processRun: filterProcess,
    orderMode,
    manualOrderIds,
    sortColumn,
    sortDirection,
  }), [effectiveKeywords, lists, searchQuery, filterStatus, filterIntent, filterListId, filterSiteRelation, filterSiteArchitecture, filterSitePublication, filterKgrApplicability, filterKgrMeasurement, filterVolumeEligibility, filterProcess, orderMode, manualOrderIds, sortColumn, sortDirection]);

  const visibleKeywordIds = useMemo(() => filteredKeywords.map(item => item.id), [filteredKeywords]);
  const selection = useKeywordTableSelection(visibleKeywordIds);
  const { selectedIds, setSelectedIds } = selection;
  const someSelectedHaveAllintitle = useMemo(
    () => effectiveKeywords.some(item => selectedIds.has(item.id) && resolveCanonicalKeywordSnapshot({ ...item, attempts: processAttemptsByKeywordId[item.id] }).metrics.result.value !== null),
    [effectiveKeywords, processAttemptsByKeywordId, selectedIds],
  );
  const visibleSelectedCount = useMemo(() => filteredKeywords.reduce((count, item) => count + (selectedIds.has(item.id) ? 1 : 0), 0), [filteredKeywords, selectedIds]);
  const allVisibleSelected = filteredKeywords.length > 0 && visibleSelectedCount === filteredKeywords.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const hiddenSelectedCount = Math.max(0, selectedIds.size - visibleSelectedCount);
  const architectHandoffGate = useMemo(
    () => evaluateMineradorArquitetoHandoffBatch({
      keywords: effectiveKeywords.filter(item => selectedIds.has(item.id)),
      brandId: selectedBrandId,
      qualifications: semanticQualifications,
    }),
    [effectiveKeywords, selectedBrandId, selectedIds, semanticQualifications],
  );
  const [deleteApprovalOpen, setDeleteApprovalOpen] = useState(false);
  const [deleteSimpleOpen, setDeleteSimpleOpen] = useState(false);
  const [deleteReview, setDeleteReview] = useState<{ ids: string[]; publishedIds: string[]; hardDeleteIds: string[]; impact: DeletionImpactEntry[]; confirmationName: string } | null>(null);
  const [recoverableKeywords, setRecoverableKeywords] = useState<KeywordItem[]>([]);
  const restoreKeywordSnapshot = useCallback((snapshot: KeywordItem[]) => {
    setKeywords(snapshot);
    setProcessAttemptsByKeywordId({});
    setHumanReviewDrafts({});
    setSemanticConsolidationDrafts({});
    setSelectedIds(new Set());
  }, [setSelectedIds]);
  const keywordHistory = useLocalHistory("minerador", keywords, restoreKeywordSnapshot, 30, selectedBrandId || "sem-marca");
  const { undo: undoKeywordHistory, redo: redoKeywordHistory } = keywordHistory;

  /**
   * Lê a Qualificação Semântica persistida das próprias keywords da Marca ativa.
   * Nenhuma chamada de provider acontece aqui: é leitura do artifact canônico.
   */
  const loadSemanticQualifications = useCallback(async (brandId: string, keywordIds: readonly string[], cachePrune: QualificationVersionCachePrune = "loaded-entities") => {
    const ids = [...new Set(keywordIds.filter(Boolean))];
    if (!brandId || ids.length === 0) return {} as Record<string, KeywordSemanticQualification>;
    // Etapa 1: só metadados das versões, sem payload (E7, correção 3).
    const metadata = await withSupabaseSelectRetry(async () => {
      const { data, error } = await supabase
        .from("editorial_artifact_versions")
        .select("version_id,entity_id,version_number")
        .eq("marca_id", brandId)
        .eq("artifact_type", KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE)
        .in("entity_id", ids)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data || [];
    });
    // Etapa 2: payload só da versão vigente; a anterior só quando a vigente
    // falhar na validação de parse, Marca e keyword. O payload de uma versão
    // imutável vem do cache do navegador quando válido (E8); a vigente é sempre
    // a dos metadados acima, e qualquer falha do cache cai para o servidor.
    const { qualifications: current, maintenance } = await resolveCurrentKeywordSemanticQualificationsWithCache({
      brandId,
      actorUserId,
      metadata,
      storage: qualificationVersionCache,
      prune: cachePrune,
      readRemotePayloads: versionIds => withSupabaseSelectRetry(async () => {
        const { data, error } = await supabase
          .from("editorial_artifact_versions")
          .select("version_id,payload")
          .eq("marca_id", brandId)
          .eq("artifact_type", KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE)
          .in("version_id", versionIds);
        if (error) throw error;
        return data || [];
      }),
    });
    // Guardar as vigentes lidas do servidor e podar o resto não segura a tela.
    void maintenance;
    return Object.fromEntries(current) as Record<string, KeywordSemanticQualification>;
  }, [supabase, actorUserId, qualificationVersionCache]);

  const readCanonicalKeywordRows = useCallback(async (ids: readonly string[], options: { source?: string } = {}): Promise<Map<string, KeywordItem>> => {
    if (!selectedBrandId) throw new Error("Marca ativa ausente para o readback do Processador.");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return new Map();
    const source = options.source || MINERADOR_KEYWORDS_TABLE;
    const rows: KeywordItem[] = [];
    // Os ids viajam na URL do PostgREST: blocos de 200, como o núcleo do
    // import. A completude continua conferida sobre o total.
    for (let start = 0; start < uniqueIds.length; start += KEYWORD_READBACK_ID_CHUNK) {
      const chunk = uniqueIds.slice(start, start + KEYWORD_READBACK_ID_CHUNK);
      const chunkRows = await withSupabaseSelectRetry(async () => {
        const { data, error } = await supabase
          .from(source)
          .select("*")
          .eq("brand_id", selectedBrandId)
          .is("deleted_at", null)
          .in("id", chunk);
        if (error) throw error;
        return (data || []) as KeywordItem[];
      });
      rows.push(...chunkRows);
    }
    const byId = new Map(rows.map(row => [String(row.id), row]));
    if (byId.size !== uniqueIds.length) {
      throw new Error("O readback canônico do Processador não retornou todas as keywords do lote.");
    }
    return byId;
  }, [selectedBrandId, supabase]);
  // Modal de CriaÃ§Ã£o de Lista
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListNicho, setNewListNicho] = useState("");

  // Modal de ImportaÃ§Ã£o Manual (Copiar e Colar)
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualKeywordsText, setManualKeywordsText] = useState("");
  const [manualListId, setManualListId] = useState("");
  const [manualIntent, setManualIntent] = useState("");
  const [manualNicho, setManualNicho] = useState("");
  const [manualStatus, setManualStatus] = useState("bruto");
  const [manualLocation, setManualLocation] = useState("Brasil");

  // Modal de ExportaÃ§Ã£o
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState("kgr-estrategico-export");

  // Controle do Banner de Palavras Duplicadas
  const [showDuplicateBanner, setShowDuplicateBanner] = useState(true);

  // Estado para a lista alvo da aÃ§Ã£o em lote "Mover para Lista"
  const [targetListId, setTargetListId] = useState("");
  const [siteSyncLoading, setSiteSyncLoading] = useState(false);
  const [siteSyncPersisting, setSiteSyncPersisting] = useState(false);
  const [siteSyncPlan, setSiteSyncPlan] = useState<MineradorSiteSyncPlan | null>(null);
  const [manualSiteCheckKeywordId, setManualSiteCheckKeywordId] = useState<string | null>(null);
  const [manualSiteCheckUrl, setManualSiteCheckUrl] = useState("");
  const [legacyEditorialRecovery, setLegacyEditorialRecovery] = useState<{ keywordId: string; status: EditorialKeywordStatus | "" } | null>(null);
  const [volumeMeasuring, setVolumeMeasuring] = useState(false);
  const [allintitleMeasuring, setAllintitleMeasuring] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  // Vínculo em grupo (SDD 2026-09-24, F1.6): um seletor só no rodapé abre um
  // painel com os mesmos três selects da Revisão Humana (Posto, Potencial,
  // Assunto); nada é gravado antes de "Aplicar". Nota e destino só com o
  // Assunto Declarado escolhido no painel.
  const [vinculoBatchDialog, setVinculoBatchDialog] = useState<VinculoBatchDialogState | null>(null);
  // Canto direito do painel, alinhado ao botão que o abriu (rodapé ou Mais ações).
  const [vinculoBatchPanelRight, setVinculoBatchPanelRight] = useState(8);
  // Foco da confirmação: entra no diálogo ao abrir e volta ao select que a
  // abriu ao fechar; Escape fecha pelo document, como o DeleteConfirmation.
  const vinculoBatchTriggerRef = useRef<HTMLElement | null>(null);
  const vinculoBatchDialogRef = useRef<HTMLElement | null>(null);
  // O select de "Mais ações" some com o menu: o foco volta ao botão do menu.
  const moreActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const vinculoBatchDialogOpen = vinculoBatchDialog !== null;
  const vinculoBatchDeclareOpen = vinculoBatchDialog ? isSubjectDeclareChoice(vinculoBatchDialog.subject) : false;
  // O valor comum das selecionadas em cada select (ou "Valores diferentes"),
  // pelo mesmo resolvedor da coluna, sobre as linhas que o plano grava.
  const vinculoBatchCommon = useMemo(
    () => vinculoBatchDialogOpen ? commonVinculoSelectValues(keywords.filter(item => selectedIds.has(item.id))) : null,
    [vinculoBatchDialogOpen, keywords, selectedIds],
  );
  useEffect(() => {
    if (!vinculoBatchDialogOpen) return;
    // O painel recebe o foco ao abrir; marcar opções não o tira dali.
    vinculoBatchDialogRef.current?.focus();
    return () => {
      const trigger = vinculoBatchTriggerRef.current;
      vinculoBatchTriggerRef.current = null;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [vinculoBatchDialogOpen]);
  useEffect(() => {
    if (!vinculoBatchDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !updating) setVinculoBatchDialog(null);
    };
    // Clique fora fecha sem gravar; o foco fica onde o humano clicou.
    const onPointerDown = (event: PointerEvent) => {
      if (updating || !(event.target instanceof Node)) return;
      if (vinculoBatchDialogRef.current?.contains(event.target) || vinculoBatchTriggerRef.current?.contains(event.target)) return;
      vinculoBatchTriggerRef.current = null;
      setVinculoBatchDialog(null);
    };
    // O painel não prende o foco: Tab para fora dele o fecha sem gravar, e o
    // foco fica onde o humano chegou.
    const onFocusIn = (event: FocusEvent) => {
      if (updating || !(event.target instanceof Node)) return;
      if (vinculoBatchDialogRef.current?.contains(event.target) || vinculoBatchTriggerRef.current?.contains(event.target)) return;
      vinculoBatchTriggerRef.current = null;
      setVinculoBatchDialog(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [vinculoBatchDialogOpen, updating]);
  // Seleção esvaziada por qualquer caminho (teclado, troca de marca, fim de
  // lote): o painel fecha e as escolhas são descartadas, para não reaparecerem
  // numa seleção nova. Nada foi gravado sem Aplicar. Ajuste no próprio
  // render (padrão do React para estado derivado), sem efeito em cascata.
  if (vinculoBatchDialog && selectedIds.size === 0) setVinculoBatchDialog(null);
  const openVinculoBatchPanel = (trigger: HTMLElement | null) => {
    vinculoBatchTriggerRef.current = trigger;
    const rect = trigger?.getBoundingClientRect();
    const panelWidth = Math.min(448, window.innerWidth - 16);
    setVinculoBatchPanelRight(rect ? Math.max(8, Math.min(Math.round(window.innerWidth - rect.right), window.innerWidth - panelWidth - 8)) : 8);
    setVinculoBatchDialog({ ...EMPTY_VINCULO_BATCH_CHOICES, note: "", destination: "" });
  };
  // KGR em grupo também passa por confirmação: no Chrome/Windows a seta num
  // select fechado já dispara o change, e o lote gravaria sem querer.
  const [kgrBatchConfirm, setKgrBatchConfirm] = useState<KgrApplicability | null>(null);
  const kgrBatchTriggerRef = useRef<HTMLElement | null>(null);
  const kgrBatchDialogRef = useRef<HTMLElement | null>(null);
  const kgrBatchDialogOpen = kgrBatchConfirm !== null;
  useEffect(() => {
    if (!kgrBatchDialogOpen) return;
    kgrBatchDialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setKgrBatchConfirm(null); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const trigger = kgrBatchTriggerRef.current;
      kgrBatchTriggerRef.current = null;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [kgrBatchDialogOpen]);
  const [architectHandoffSending, setArchitectHandoffSending] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  const bulkProgressLockRef = useRef(false);
  const bulkProgressResetTimerRef = useRef<number | null>(null);
  const bulkStopRequestRef = useRef<string | null>(null);
  const [bulkFailuresOpen, setBulkFailuresOpen] = useState(false);

  useEffect(() => {
    if (!moreActionsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreActionsRef.current?.contains(event.target)) setMoreActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreActionsOpen]);

  useEffect(() => () => { bulkStopRequestRef.current = "A tela do Processador foi fechada; os blocos que faltavam não foram enviados.";
    if (bulkProgressResetTimerRef.current !== null) {
      window.clearTimeout(bulkProgressResetTimerRef.current);
      bulkProgressResetTimerRef.current = null;
    }
  }, []);

  // Avisos do piloto Minerador usam o contrato global.
  const showNotification = useCallback((type: "success" | "error" | "info" | "warning", message: string, options: { code?: string; stage?: string; persistent?: boolean; diagnostic?: Record<string, unknown>; metadata?: Record<string, unknown>; details?: string } = {}) => {
    publishNotice({
      severity: type === "success" ? "SUCCESS" : type === "error" ? "ERROR" : type === "warning" ? "WARNING" : "INFO",
      title: "Minerador",
      message,
      details: [[options.stage ? `Etapa: ${options.stage}` : "", options.code ? `Código: ${options.code}` : ""].filter(Boolean).join(" · "), options.details || ""].filter(Boolean).join("\n") || undefined,
      metadata: options.metadata,
      copyPayload: options.diagnostic,
      source: type === "success" ? "persistence" : "workflow",
      confirmed: type === "success",
      module: "minerador",
      area: "Minerador",
    });
  }, [publishNotice]);

  const setProcessAttempt = useCallback((keywordIds: readonly string[], step: MineradorProcessName, state: Exclude<MineradorAttemptState, "not_run">, operationId?: string) => {
    const finishedAt = state === "running" ? undefined : new Date().toISOString();
    setProcessAttemptsByKeywordId(previous => {
      const next = { ...previous };
      for (const keywordId of keywordIds) {
        const current = next[keywordId] || {};
        next[keywordId] = {
          ...current,
          [step]: {
            ...(current[step] || {}),
            state,
            ...(operationId ? { operationId } : {}),
            ...(state === "running" ? { startedAt: new Date().toISOString() } : { finishedAt }),
          },
        };
      }
      return next;
    });
  }, []);

  /** Tira a tentativa em curso de quem não chegou a rodar (lote parado). */
  const clearProcessAttempt = useCallback((keywordIds: readonly string[], step: MineradorProcessName) => {
    if (keywordIds.length === 0) return;
    setProcessAttemptsByKeywordId(previous => {
      let changed = false;
      const next = { ...previous };
      for (const keywordId of keywordIds) {
        const current = next[keywordId];
        if (!current?.[step]) continue;
        const rest = { ...current };
        delete rest[step];
        next[keywordId] = rest;
        changed = true;
      }
      return changed ? next : previous;
    });
  }, []);

  const startBulkProgress = useCallback((step: BulkProgressStep, total: number | null = null, keywordIds?: readonly string[], operationId?: string) => {
    if (bulkProgressLockRef.current) return false;
    if (bulkProgressResetTimerRef.current !== null) {
      window.clearTimeout(bulkProgressResetTimerRef.current);
      bulkProgressResetTimerRef.current = null;
    }
    bulkProgressLockRef.current = true;
    bulkStopRequestRef.current = null;
    setBulkFailuresOpen(false);
    setBulkProgress({
      status: "processing",
      step,
      current: 0,
      total: total && total > 0 ? total : null,
      message: "",
      detail: "",
      batch: false,
      failed: 0,
      failures: [],
      stoppable: false,
    });
    setProcessAttempt(keywordIds || [...selectedIds], step, "running", operationId);
    return true;
  }, [selectedIds, setProcessAttempt]);

  const updateBulkProgress = useCallback((current: number, total?: number | null, message?: string, detail?: string) => {
    setBulkProgress(previous => {
      if (previous.status !== "processing") return previous;
      const resolvedTotal = total === undefined ? previous.total : total && total > 0 ? total : null;
      return {
        ...previous,
        current: resolvedTotal === null ? Math.max(0, current) : Math.min(resolvedTotal, Math.max(0, current)),
        total: resolvedTotal,
        ...(message !== undefined ? { message } : {}),
        ...(detail !== undefined ? { detail } : {}),
      };
    });
  }, []);

  /*
   * LOTE PROGRESSIVO (pedido do dono, 2026-09-24). As ações em grupo do
   * Processador andam pelo helper puro `runProgressiveBatch`: a barra avança
   * a cada item que volta, o texto diz "Processando N de T · faltam R", uma
   * falha não para o resto e o fim diz "Concluído: X ok, Y com falha". O
   * andamento não vai para o sino; só o resumo final vira um aviso.
   */
  const reportBatchProgress = useCallback((snapshot: BatchProgressSnapshot) => {
    const stopping = bulkStopRequestRef.current !== null;
    setBulkProgress(previous => previous.status !== "processing" ? previous : {
      ...previous,
      current: snapshot.done,
      total: snapshot.total > 0 ? snapshot.total : null,
      // Primeira linha curta ("5 de 30 · faltam 25"): o cartão estreito não
      // pode cortar justamente o "faltam N". A etapa vai na linha de contexto.
      message: snapshot.status === "running" ? formatBatchProgressCompact(snapshot) : "Conferindo a gravação…",
      chunkStartedAtMs: snapshot.status === "running" ? snapshot.chunkStartedAtMs ?? null : null,
      detail: snapshot.status === "running"
        ? `${formatBatchProgressDetail(snapshot)}${stopping ? " · parando depois do bloco atual" : ""}`
        : formatBatchProgress(snapshot),
      batch: true,
      failed: snapshot.failed,
      stoppable: snapshot.status === "running" && snapshot.chunkCount > 1 && !stopping,
    });
  }, []);

  const runBulkBatch = useCallback(<Item,>(input: Omit<ProgressiveBatchInput<Item>, "onProgress" | "shouldStop">) => runProgressiveBatch<Item>({
    ...input,
    onProgress: reportBatchProgress,
    shouldStop: () => bulkStopRequestRef.current,
  }), [reportBatchProgress]);

  /** Parar: termina o bloco em curso e não começa outro. Nada é desfeito. */
  const requestBulkStop = useCallback(() => {
    bulkStopRequestRef.current = BATCH_STOPPED_BY_USER_REASON;
    setBulkProgress(previous => previous.status === "processing"
      ? { ...previous, stoppable: false, detail: `${previous.detail} · parando depois do bloco atual` }
      : previous);
  }, []);

  const finishBulkProgress = useCallback((status: Exclude<BulkProgressStatus, "idle" | "processing">, message?: string, failures?: readonly BulkProgressFailure[]) => {
    bulkProgressLockRef.current = false;
    bulkStopRequestRef.current = null;
    setBulkProgress(previous => ({
      ...previous,
      status,
      current: status === "success" && previous.total ? previous.total : previous.current,
      message: message || (status === "success" ? "Concluído" : "Falhou"),
      detail: message || (status === "success" ? "Concluído" : "Falhou"),
      failures: failures || [],
      stoppable: false,
    }));
    if (bulkProgressResetTimerRef.current !== null) window.clearTimeout(bulkProgressResetTimerRef.current);
    bulkProgressResetTimerRef.current = null;
    // Com falhas, o resumo e a lista ficam no rodapé até o humano fechar.
    if (failures && failures.length > 0) return;
    bulkProgressResetTimerRef.current = window.setTimeout(() => {
      bulkProgressResetTimerRef.current = null;
      setBulkProgress(initialBulkProgressState);
    }, 1800);
  }, []);

  const dismissBulkProgress = useCallback(() => {
    if (bulkProgressLockRef.current) return;
    if (bulkProgressResetTimerRef.current !== null) {
      window.clearTimeout(bulkProgressResetTimerRef.current);
      bulkProgressResetTimerRef.current = null;
    }
    setBulkFailuresOpen(false);
    setBulkProgress(initialBulkProgressState);
  }, []);

  const batchFailureViews = (snapshot: Pick<BatchProgressSnapshot, "failures">): BulkProgressFailure[] => {
    const nameById = new Map(keywords.map(item => [item.id, item.keyword]));
    return snapshot.failures.map(failure => ({ id: failure.id, label: nameById.get(failure.id) || failure.id, reason: failure.reason }));
  };
  const batchFailureDetails = (snapshot: Pick<BatchProgressSnapshot, "failures">) => (
    formatBatchFailures(snapshot, new Map(keywords.map(item => [item.id, item.keyword]))).join("\n") || undefined
  );

  /** Tentativas no fim de um lote de gravação: confirmada, falha ou não iniciada. */
  const settleBatchAttempts = (step: MineradorProcessName, ids: readonly string[], confirmedIds: readonly string[], batch: BatchProgressSnapshot | null, operationId: string) => {
    const confirmed = new Set(confirmedIds);
    const failedSet = new Set(batch ? batch.failures.map(failure => failure.id) : ids.filter(id => !confirmed.has(id)));
    setProcessAttempt(ids.filter(id => confirmed.has(id)), step, "success", operationId);
    setProcessAttempt(ids.filter(id => !confirmed.has(id) && failedSet.has(id)), step, "failed", operationId);
    clearProcessAttempt(ids.filter(id => !confirmed.has(id) && !failedSet.has(id)), step);
  };

  const handleDiscoverySourceComplete = useCallback((payload: DiscoverySourceResponse) => {
    const count = payload.summary.approved;
    showNotification("success", `${count} keyword(s) ${count === 1 ? "adicionada" : "adicionadas"} à Descoberta. Abra Descobrir Keywords para revisar.`);
  }, [showNotification]);
  const discoverySourceActions = useMemo(() => <DiscoverySourceTopbarActions onManual={() => discoverySourceControlsRef.current?.openManual()} onCsv={() => discoverySourceControlsRef.current?.openCsv()} />, []);

  const pushKeywordsHistory = (snapshot = keywords, label = "Alteração na planilha de keywords") => keywordHistory.capture(label, snapshot);

  const undoKeywords = useCallback(() => {
    undoKeywordHistory();
    showNotification("success", "Voltando uma alteração na lista atual.");
  }, [showNotification, undoKeywordHistory]);

  const redoKeywords = useCallback(() => {
    redoKeywordHistory();
    showNotification("success", "Refazendo alteração na lista atual.");
  }, [redoKeywordHistory, showNotification]);

  const processLogicalKeywordDna = async (
    sourceKeywords: KeywordItem[],
    sourceLists: ListObject[],
    options: { persist: boolean; showProgress: boolean },
  ) => {
    const listById = new Map(sourceLists.map(list => [list.id, list]));
    const updatedItems: KeywordItem[] = [];
    const pendingUpdates: Array<{ id: string; intent: string; analise_semantica: Record<string, unknown> }> = [];
    const logicalChangedIds: string[] = [];
    const processedAt = new Date().toISOString();

    if (options.showProgress) {
      setDnaProcessing(true);
      setDnaProgress({ current: 0, total: sourceKeywords.length });
      updateBulkProgress(0, sourceKeywords.length);
    }

    for (const [index, item] of sourceKeywords.entries()) {
      const list = item.lista_id ? listById.get(item.lista_id) : null;
      const intentOrigin = String(item.analise_semantica?.intencao_origem || item.analise_semantica?.intent_source || "").toLowerCase();
      const semanticDnaOrigin = String(item.analise_semantica?.dna_origem || "").toLowerCase();
      const humanIntentProtected = ["human", "humano", "manual", "humana"].includes(intentOrigin)
        || ["human", "humano", "manual", "humana"].includes(semanticDnaOrigin)
        || ["aprovado", "confirmado", "confirmed"].includes(String(item.analise_semantica?.dna_revisao_humana || "").toLowerCase());
      const nicheProtected = humanNicheProtected(item.analise_semantica);
      const niche = (nicheProtected ? logicalNiche(item.analise_semantica?.nicho_override) : null)
        || logicalNiche(list?.nicho)
        || logicalNiche(autoDetectNiche(item.keyword));
      const existingIntent = item.intent || (typeof item.analise_semantica?.intencao_principal === "string" ? item.analise_semantica.intencao_principal : null);
      // Existing values are context only. The current engine runs again for
      // every explicit selection; only an explicit human decision is protected.
      const intentForDerivation = humanIntentProtected ? existingIntent : null;
      const logical = deriveLogicalKeywordDna({
        keywordId: item.id,
        keyword: item.keyword,
        intent: intentForDerivation,
        niche,
        location: item.location,
        existingSemantic: item.analise_semantica,
      });
      const logicalSemantic = mergeLogicalKeywordSemantic(item.analise_semantica, logical.semantic, { forceLogical: true });
      if (niche) {
        logicalSemantic.nicho_override = niche;
        logicalSemantic.nicho = niche;
        if (!nicheProtected) logicalSemantic.nicho_origem = "logico_deterministico";
      } else if (!nicheProtected) {
        delete logicalSemantic.nicho_override;
        delete logicalSemantic.nicho;
        delete logicalSemantic.nicho_origem;
      }
      const storedIntent = humanIntentProtected && item.intent && normalizeIntentKey(item.intent) !== "unknown" ? item.intent : null;
      const semanticIntent = typeof logicalSemantic.intencao_principal === "string" && normalizeIntentKey(logicalSemantic.intencao_principal) !== "unknown"
        ? logicalSemantic.intencao_principal
        : null;
      const intent = storedIntent || semanticIntent || logical.intentLabel || canonicalIntentLabel(logical.dna.searchIntent);
      const funnelProtected = humanFunnelProtected(item.analise_semantica);
      if (!funnelProtected) {
        delete logicalSemantic.funnel;
        delete logicalSemantic.funnel_source;
        delete logicalSemantic.funnel_confidence;
        delete logicalSemantic.funnel_review_required;
        delete logicalSemantic.funnel_evidence;
      }
      const funnelQualification = classifyKeywordFunnel({
        keyword: item.keyword,
        intent,
        niche,
        location: item.location,
        semantic: logicalSemantic,
      });
      const semantic = applyFunnelQualification(logicalSemantic, funnelQualification);
      semantic.logical_output_contract = buildLogicalOutputContract({
        semantic,
        intent,
        niche,
        funnel: semantic.funnel,
      });
      const logicalOutput = validateLogicalKeywordOutput({ semantic, intent });
      if (!logicalOutput.valid || !hasCompleteLogicalOutputContract({ semantic, intent })) {
        throw new Error(`A leitura lógica não completou o contrato de saída: ${logicalOutput.missingFields.join(", ")}.`);
      }
      Object.assign(semantic, buildLogicalProcessorMetadata({ keywordId: item.id, keyword: item.keyword, location: item.location, niche }, processedAt));
      const next = { ...item, intent, analise_semantica: semantic };
      updatedItems.push(next);

      const logicalChanged = !logicalSemanticRecordsEqual(item.analise_semantica, semantic) || item.intent !== intent;
      if (logicalChanged) logicalChangedIds.push(item.id);
      const metadataCurrent = hasCurrentLogicalProcessorMetadata({
        keywordId: item.id,
        keyword: item.keyword,
        location: item.location,
        niche,
        semantic,
      });
      if (logicalChanged || !metadataCurrent) {
        pendingUpdates.push({ id: item.id, intent, analise_semantica: semantic });
      }
      if (options.showProgress) {
        setDnaProgress({ current: index + 1, total: sourceKeywords.length });
        updateBulkProgress(index + 1, sourceKeywords.length);
        if (index === 0 || (index + 1) % 10 === 0 || index === sourceKeywords.length - 1) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        }
      }
    }

    let failed = 0;
    let stoppedReason: string | null = null;
    const failedIds: string[] = [];
    /*
     * POR QUE A RAZÃO É GUARDADA.
     *
     * Em 2026-09-21 uma falha de `canonical_readback` chegou à tela como
     * "1 falharam ao salvar" e mais nada: nem a keyword, nem se foi a escrita
     * ou a conferência, nem a mensagem do banco. Diagnosticar exigiu tentar
     * reproduzir a escrita por fora, e ainda assim por hipótese.
     *
     * Uma falha que não diz o que falhou custa mais que a falha.
     */
    const failureReasons: Array<{ id: string; keyword: string; stage: "write" | "readback"; reason: string }> = [];
    const keywordNameById = new Map(sourceKeywords.map(item => [item.id, item.keyword]));
    if (options.persist && pendingUpdates.length > 0) {
      // Gravação em lote progressivo: a barra conta cada keyword gravada e
      // uma falha não impede as demais.
      const startedIds = new Set<string>();
      const writeBatch = await runBulkBatch({
        label: "Lógica",
        items: pendingUpdates,
        itemId: update => update.id,
        chunkSize: 1,
        concurrency: BULK_WRITE_CONCURRENCY,
        runChunk: async chunk => Promise.all(chunk.map(async (update): Promise<BatchItemOutcome> => {
          startedIds.add(update.id);
          let reason: string;
          try {
            const { error } = await supabase
              .from("minerador_keywords")
              .update({ intent: update.intent, analise_semantica: update.analise_semantica })
              .eq("id", update.id)
              .eq("brand_id", selectedBrandId)
              .is("deleted_at", null);
            if (!error) return { id: update.id, status: "succeeded" };
            reason = describeBatchWriteError(error);
          } catch (writeError) {
            reason = describeBatchWriteError(writeError);
          }
          failed += 1;
          failedIds.push(update.id);
          failureReasons.push({ id: update.id, keyword: keywordNameById.get(update.id) || update.id, stage: "write", reason });
          return { id: update.id, status: "failed", reason };
        })),
      });
      stoppedReason = writeBatch.stoppedReason;
      for (const update of pendingUpdates) {
        if (startedIds.has(update.id)) continue;
        failed += 1;
        failedIds.push(update.id);
        failureReasons.push({ id: update.id, keyword: keywordNameById.get(update.id) || update.id, stage: "write", reason: `não iniciada: ${stoppedReason || "lote parado"}` });
      }
    }

    if (options.showProgress) setDnaProcessing(false);
    const sourceById = new Map(sourceKeywords.map(item => [item.id, item]));
    let persistedById: Map<string, KeywordItem> | null = null;
    if (options.persist) persistedById = await readCanonicalKeywordRows(sourceKeywords.map(item => item.id));
    if (options.persist && persistedById) {
      const failedIdSet = new Set(failedIds);
      for (const expected of updatedItems) {
        if (failedIdSet.has(expected.id)) continue;
        const source = sourceById.get(expected.id);
        const readback = persistedById.get(expected.id);
        const valid = Boolean(source && readback
          && readback.intent === expected.intent
          && hasCompleteLogicalOutputContract({ semantic: readback.analise_semantica, intent: expected.intent })
          && hasCurrentLogicalProcessorMetadata({
            keywordId: expected.id,
            keyword: source.keyword,
            location: source.location,
            niche: (typeof expected.analise_semantica?.nicho_override === "string" ? logicalNiche(expected.analise_semantica.nicho_override) : null)
              || (typeof expected.analise_semantica?.nicho === "string" ? logicalNiche(expected.analise_semantica.nicho) : null),
            semantic: readback.analise_semantica,
          }));
        if (!valid) {
          failed += 1;
          failedIds.push(expected.id);
          failedIdSet.add(expected.id);
          // Qual das quatro condições caiu — sem isto, "não confere" não diz nada.
          const porque = !source ? "a keyword de origem sumiu do lote"
            : !readback ? "o readback não devolveu a linha"
            : readback.intent !== expected.intent ? `intent divergiu: gravado ${JSON.stringify(readback.intent)}, esperado ${JSON.stringify(expected.intent)}`
            : !hasCompleteLogicalOutputContract({ semantic: readback.analise_semantica, intent: expected.intent }) ? "o contrato de saída voltou incompleto"
            : "o carimbo do processador não voltou atual";
          failureReasons.push({ id: expected.id, keyword: source?.keyword || expected.id, stage: "readback", reason: porque });
        }
      }
    }
    const failedSet = new Set(failedIds);
    const persistedItems = updatedItems.map(item => {
      if (failedSet.has(item.id)) return sourceById.get(item.id) || item;
      return persistedById?.get(item.id) || item;
    });
    return { items: persistedItems, changed: logicalChangedIds.length, failed, failedIds, logicalChangedIds, failureReasons, stoppedReason };
  };

  const handleQualifySelected = async () => {
    const targets = keywords.filter(keyword => selectedIds.has(keyword.id));
    if (targets.length === 0) {
      showNotification("error", "Selecione pelo menos uma keyword para processar a lógica.");
      return;
    }
    await runLogicalProcess(targets);
  };

  /*
   * A ROTINA DO BOTÃO LÓGICA, UMA SÓ.
   *
   * O botão a usa sobre a seleção; a Lógica automática do Assunto (SDD
   * 2026-09-24, F1.7b) a usa sobre as keywords recém-declaradas que ainda não
   * têm Lógica. Mesmo motor (`processLogicalKeywordDna`), mesmo progresso,
   * mesma escrita e mesmo readback: não existe caminho paralelo.
   *
   * Os itens chegam com o `analise_semantica` que está no banco — inclusive a
   * declaração recém-gravada —, porque a Lógica regrava o JSONB inteiro. A
   * rotina nunca aprova nada.
   */
  const runLogicalProcess = async (targets: KeywordItem[], options: { automatic?: boolean } = {}) => {
    if (targets.length === 0) return;
    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("logic", targets.length, targets.map(item => item.id), executionRequestId)) {
      if (options.automatic) showNotification("info", "A Lógica automática não começou porque outro processo está em curso. Use o botão Lógica nas keywords declaradas.");
      return;
    }

    let outcome: "success" | "error" = "success";
    let logicSummary: string | undefined;
    let logicFailures: BulkProgressFailure[] | undefined;
    try {
      pushKeywordsHistory(keywords, `Processar lógica de ${targets.length} keyword(s)`);
      const result = await processLogicalKeywordDna(targets, lists, { persist: true, showProgress: true });
      const byId = new Map(result.items.map(item => [item.id, item]));
      const failedIds = new Set(result.failedIds);
      const logicalChangedIds = new Set(result.logicalChangedIds);
      setProcessAttempt(result.failedIds, "logic", "failed", executionRequestId);
      setProcessAttempt(targets.filter(item => !failedIds.has(item.id)).map(item => item.id), "logic", "success", executionRequestId);
      setQualificationResults(targets.map(item => {
        const updated = byId.get(item.id) || item;
        const semantic = updated.analise_semantica || {};
        const funnel = funnelLabelFor(updated);
        const status: QualificationResult["status"] = failedIds.has(item.id)
          ? "falha"
          : semantic.funnel_source === "human"
          ? "preservada"
          : semantic.funnel_review_required === "sim"
          ? "conflito"
          : !logicalChangedIds.has(item.id) && item.intent === updated.intent
          ? "sem_alteracao"
          : "processada";
        return {
          id: item.id,
          keyword: item.keyword,
          status,
          intent: readLogicalIntentLabel(updated),
          funnel,
          niche: String(readLogicalNiche(updated) || "Não determinado"),
          bias: String(semantic.potencial_comercial || semantic.gatilho_de_conversao || "Não identificado"),
          confidence: String(semantic.funnel_confidence || semantic.dna_confianca || "Pendente"),
        };
      }));
      setKeywords(current => current.map(item => byId.get(item.id) || item));
      logicSummary = formatBatchSummary({ total: targets.length, succeeded: targets.length - result.failed, failed: result.failed, stoppedReason: result.stoppedReason });
      logicFailures = result.failureReasons.map(item => ({ id: item.id, label: item.keyword, reason: item.reason }));
      if (result.failed > 0) {
        outcome = "error";
        const primeira = result.failureReasons[0];
        showNotification(result.failed < targets.length ? "warning" : "error", `${logicSummary}. ${result.changed - result.failed} processadas; ${result.failed} falharam ao salvar.${primeira ? ` [${primeira.keyword}] ${primeira.reason}` : ""}`, {
          code: "LOGIC_PARTIAL_RESULTS",
          stage: result.failureReasons.every(item => item.stage === "write") ? "persist" : "canonical_readback",
          details: result.failureReasons.slice(0, 20).map(item => `${item.keyword}: ${item.reason}`).join("\n") || undefined,
          metadata: { executionRequestId, failures: result.failureReasons },
        });
      } else {
        showNotification("success", options.automatic
          ? `Lógica automática do Assunto: ${targets.length} keyword(s) processadas. Nada foi aprovado; a aprovação continua sendo sua.`
          : `${targets.length} keyword(s) processadas; leitura lógica atualizada para revisão humana.`, {
          metadata: { executionRequestId },
        });
      }
    } catch (error) {
      outcome = "error";
      setProcessAttempt(targets.map(item => item.id), "logic", "failed", executionRequestId);
      console.error("Erro ao processar lógica das keywords:", error);
      setDnaProcessing(false);
      showNotification("error", options.automatic
        ? `A Lógica automática não completou${error instanceof Error && error.message ? `: ${error.message}` : "."} A declaração do Assunto foi mantida; use o botão Lógica para tentar de novo.`
        : "Não foi possível qualificar as keywords selecionadas.", {
        code: "LOGIC_OUTPUT_CONTRACT_FAILED",
        stage: "required_output_contract",
        metadata: { executionRequestId },
      });
    } finally {
      finishBulkProgress(outcome, logicSummary, logicFailures);
    }
  };

  /*
   * ASSUNTO NO PROCESSADOR (SDD 2026-09-24, F1.4, F1.5, F1.6 e F1.7b).
   *
   * Três portas declaram: o import com "Assunto" (rota própria, outra parte),
   * a Revisão Humana e o select "Vínculo" do rodapé. As três gravam pelo
   * domínio (`setKeywordSubject` / `withdrawKeywordSubject` /
   * `planVinculoBatch`) com o `auth.users.id` da sessão — nunca e-mail, nunca
   * "local-user"; sem ele, nada é gravado. A marca é a ativa da rota.
   */

  /** Lógica automática depois de declarar: só nas que ainda não a têm. */
  const runAutomaticSubjectLogic = async (declaredItems: KeywordItem[]) => {
    const targets = keywordsWithoutLogic(declaredItems);
    if (targets.length === 0) return;
    // A barra do rodapé só existe com seleção feita pelo humano (contrato):
    // a Lógica automática nunca seleciona. Sem seleção, o fim chega no sino.
    await runLogicalProcess(targets, { automatic: true });
  };

  /**
   * Catálogo do site, informativo: uma linha, colunas estreitas, pela chave
   * canônica da marca. Falha de leitura não bloqueia a declaração.
   */
  const lookupSubjectDestinationCatalog = async (rawUrl: string | null | undefined): Promise<SubjectDestinationCatalogHit | null> => {
    if (!selectedBrandId) return null;
    const key = subjectDestinationCatalogKey(activeBrand?.site_url || null, rawUrl);
    if (!key) return null;
    try {
      const { data, error } = await supabase
        .from("brand_site_catalog_entries")
        .select("normalized_url,page_type,title,h1")
        .eq("marca_id", selectedBrandId)
        .eq("normalized_url", key)
        .maybeSingle();
      if (error || !data) return null;
      const entry = data as { page_type?: string | null; title?: string | null; h1?: string | null };
      return { pageType: (entry.page_type || null) as SubjectDestinationCatalogHit["pageType"], title: entry.title || entry.h1 || null };
    } catch {
      return null;
    }
  };

  const handleSubjectReviewAction = async (item: KeywordItem, action: Extract<HumanReviewAction, { type: "subject" }>) => {
    if (!selectedBrandId) return;
    const actorId = actorUserId;
    if (!isKeywordSubjectActorId(actorId)) {
      showNotification("error", "Declarar ou retirar o Assunto exige o usuário autenticado. Entre de novo e repita.", { code: "SUBJECT_ACTOR_REQUIRED" });
      return;
    }
    const changedAt = new Date().toISOString();
    let destinationNotice: string | null = null;
    let written;
    if (action.declared) {
      const catalog = await lookupSubjectDestinationCatalog(action.destinationUrl);
      const destination = validateSubjectDestination({ rawUrl: action.destinationUrl, brandSiteUrl: activeBrand?.site_url || null, checkedAt: changedAt, catalog });
      if (!destination.ok) {
        showNotification("error", destination.reason, { code: destination.code });
        return;
      }
      destinationNotice = destination.notice;
      written = setKeywordSubject(item.analise_semantica, {
        note: action.note ?? null,
        destinationUrl: destination.destinationUrl,
        destinationCheck: destination.destinationCheck,
        actorId,
        changedAt,
        origin: "review",
      });
    } else {
      written = withdrawKeywordSubject(item.analise_semantica, { actorId, changedAt, origin: "review" });
    }
    if (!written.ok) {
      showNotification("error", written.reason, { code: written.code });
      return;
    }
    if (!written.changed) {
      showNotification("info", action.declared ? "Nada mudou: o Assunto já está declarado com esta nota e este destino." : "Nada mudou: esta keyword não tem Assunto declarado.");
      return;
    }
    const semantic = written.semantic as KeywordSemantic;
    setUpdating(true);
    let persisted = false;
    try {
      const { error } = await supabase
        .from("minerador_keywords")
        .update({ analise_semantica: semantic })
        .eq("id", item.id)
        .eq("brand_id", selectedBrandId)
        .is("deleted_at", null);
      if (error) throw error;
      // Readback estreito: só as três declarações, nunca a linha inteira.
      const { data: readback, error: readbackError } = await supabase
        .from("minerador_keywords")
        .select(VINCULO_BATCH_READBACK_COLUMNS)
        .eq("id", item.id)
        .eq("brand_id", selectedBrandId)
        .is("deleted_at", null)
        .maybeSingle();
      if (readbackError) throw readbackError;
      const update = { id: item.id, brandId: selectedBrandId, keyword: item.keyword, semantic, demotesApproval: false };
      if (!vinculoReadbackConfirmed(update, readback as VinculoBatchReadbackRow | null)) {
        throw new Error("O Assunto foi enviado, mas o readback não confirmou a declaração nesta marca.");
      }
      persisted = true;
      pushKeywordsHistory(keywords, action.declared ? `Declarar Assunto em ${item.keyword}` : `Retirar Assunto de ${item.keyword}`);
      setKeywords(current => current.map(keyword => keyword.id === item.id ? { ...keyword, analise_semantica: semantic } : keyword));
      // Uma revisão aberta guarda a própria cópia do DNA: leva a declaração
      // para ela, senão concluir a revisão a apagaria.
      setHumanReviewDrafts(current => current[item.id]
        ? { ...current, [item.id]: { ...current[item.id], semantic: { ...current[item.id].semantic, ...pickKeywordSubjectKeys(semantic) } as KeywordSemantic } }
        : current);
      showNotification("success", [
        action.declared ? "Assunto declarado e conferido." : "Assunto retirado; o histórico da declaração foi mantido.",
        destinationNotice,
      ].filter(Boolean).join(" "));
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível gravar o Assunto.", { code: "SUBJECT_REVIEW_WRITE_FAILED" });
    } finally {
      setUpdating(false);
    }
    if (persisted && action.declared) await runAutomaticSubjectLogic([{ ...item, analise_semantica: semantic }]);
  };

  /*
   * VÍNCULO EM GRUPO (F1.6). Mesmo padrão do lote de KGR — plano puro, update
   * por id + brand_id + deleted_at is null, progresso —, mas com readback
   * estreito das três declarações e o ator da sessão. O estado local recebe o
   * `analise_semantica` escrito; o readback só confirma.
   */
  const handleBatchVinculo = async (dialog: VinculoBatchDialogState) => {
    if (!selectedBrandId || selectedIds.size === 0) return;
    const actorId = actorUserId;
    if (!isKeywordSubjectActorId(actorId)) {
      showNotification("error", "Aplicar o Vínculo em grupo exige o usuário autenticado. Entre de novo e repita.", { code: "VINCULO_ACTOR_REQUIRED" });
      return;
    }
    const actions = vinculoBatchActionsFromChoices(dialog, { note: dialog.note, destinationUrl: dialog.destination });
    if (!actions || actions.length === 0) {
      showNotification("error", "Mude ao menos um campo do Vínculo.");
      return;
    }
    const changedAt = new Date().toISOString();
    const subjectDeclare = actions.find(action => action.kind === "subject_declare");
    const destinationCatalog = subjectDeclare?.kind === "subject_declare" && subjectDeclare.destinationUrl
      ? await lookupSubjectDestinationCatalog(subjectDeclare.destinationUrl)
      : null;
    const plan = planVinculoBatchChoices({
      keywords: keywords.filter(item => selectedIds.has(item.id)),
      brandId: selectedBrandId,
      actions,
      actorId,
      changedAt,
      brandSiteUrl: activeBrand?.site_url || null,
      destinationCatalog,
    });
    if (!plan.ok) {
      showNotification("error", plan.reason, { code: plan.code });
      return;
    }
    setVinculoBatchDialog(null);
    if (plan.updates.length === 0) {
      showNotification("info", describeVinculoBatchChoicesConfirmation(plan).summary);
      return;
    }
    const executionRequestId = crypto.randomUUID();
    const targetIds = plan.updates.map(update => update.id);
    if (!startBulkProgress("review", plan.updates.length, targetIds, executionRequestId)) return;
    pushKeywordsHistory(keywords, `${plan.actionLabel} em ${plan.updates.length} keyword(s)`);
    setUpdating(true);
    let outcome: "success" | "error" = "success";
    const persistedIds: string[] = [];
    const confirmedIds: string[] = [];
    let batch: BatchProgressSnapshot | null = null;
    try {
      // Lote progressivo: cada keyword é uma gravação; falha individual é
      // contada e as demais seguem.
      batch = await runBulkBatch({
        label: "Vínculo",
        items: plan.updates,
        itemId: update => update.id,
        chunkSize: 1,
        concurrency: BULK_WRITE_CONCURRENCY,
        runChunk: async chunk => Promise.all(chunk.map(async (update): Promise<BatchItemOutcome> => {
          const { error } = await supabase
            .from("minerador_keywords")
            .update({ analise_semantica: update.semantic })
            .eq("id", update.id)
            .eq("brand_id", update.brandId)
            .is("deleted_at", null);
          if (error) return { id: update.id, status: "failed", reason: describeBatchWriteError(error) };
          persistedIds.push(update.id);
          return { id: update.id, status: "succeeded" };
        })),
      });
      // Readback em blocos de 200 ids: a lista vai na URL do PostgREST.
      const readbackRows: VinculoBatchReadbackRow[] = [];
      for (let start = 0; start < persistedIds.length; start += KEYWORD_READBACK_ID_CHUNK) {
        const readbackChunk = persistedIds.slice(start, start + KEYWORD_READBACK_ID_CHUNK);
        const chunkRows = await withSupabaseSelectRetry(async () => {
          const { data, error } = await supabase
            .from("minerador_keywords")
            .select(VINCULO_BATCH_READBACK_COLUMNS)
            .eq("brand_id", selectedBrandId)
            .is("deleted_at", null)
            .in("id", readbackChunk);
          if (error) throw error;
          return (data || []) as VinculoBatchReadbackRow[];
        });
        readbackRows.push(...chunkRows);
      }
      const rowById = new Map(readbackRows.map(row => [String(row.id), row]));
      for (const update of plan.updates) {
        if (persistedIds.includes(update.id) && vinculoReadbackConfirmed(update, rowById.get(update.id))) confirmedIds.push(update.id);
      }
      const writtenById = new Map(plan.updates.filter(update => persistedIds.includes(update.id)).map(update => [update.id, update.semantic as KeywordSemantic]));
      setKeywords(current => current.map(item => writtenById.has(item.id) ? { ...item, analise_semantica: writtenById.get(item.id) } : item));
      setHumanReviewDrafts(current => {
        let changed = false;
        const next = { ...current };
        for (const [id, semantic] of writtenById) {
          if (!next[id]) continue;
          changed = true;
          next[id] = { ...next[id], semantic: { ...next[id].semantic, ...pickKeywordSubjectKeys(semantic), keyword_page_type: semantic.keyword_page_type, keyword_page_type_stance: semantic.keyword_page_type_stance, primary_keyword_policy: semantic.primary_keyword_policy } as KeywordSemantic };
        }
        return changed ? next : current;
      });
      batch = reclassifyBatchItemsAsFailed(batch, persistedIds.filter(id => !confirmedIds.includes(id)), "gravado, mas o readback não confirmou");
      settleBatchAttempts("review", targetIds, confirmedIds, batch, executionRequestId);
      if (batch.status === "completed") {
        showNotification("success", describeVinculoBatchChoicesResult(plan, confirmedIds.length), { metadata: { executionRequestId } });
      } else {
        outcome = "error";
        showNotification(confirmedIds.length > 0 ? "warning" : "error", `${formatBatchProgress(batch)}. ${confirmedIds.length} de ${plan.updates.length} keyword(s) foram gravadas e conferidas.`, { details: batchFailureDetails(batch), metadata: { executionRequestId, failures: batch.failures } });
      }
    } catch (error) {
      outcome = "error";
      if (batch) batch = reclassifyBatchItemsAsFailed(batch, persistedIds.filter(id => !confirmedIds.includes(id)), "gravado, mas o readback falhou");
      settleBatchAttempts("review", targetIds, confirmedIds, batch, executionRequestId);
      console.error("Erro ao aplicar o Vínculo em grupo:", error);
      showNotification("error", `${error instanceof Error ? error.message : "Não foi possível aplicar o Vínculo."} ${confirmedIds.length} de ${plan.updates.length} keyword(s) foram gravadas e conferidas.`, { metadata: { executionRequestId } });
    } finally {
      setUpdating(false);
      finishBulkProgress(outcome, batch ? formatBatchProgress(batch) : undefined, batch ? batchFailureViews(batch) : undefined);
    }
    const declaredStep = plan.steps.find(step => step.action.kind === "subject_declare");
    if (declaredStep && confirmedIds.length > 0) {
      const byId = new Map(keywords.map(item => [item.id, item]));
      const declaredIds = new Set(declaredStep.updates.map(update => update.id));
      const declaredItems = plan.updates
        .filter(update => declaredIds.has(update.id) && confirmedIds.includes(update.id) && byId.has(update.id))
        .map(update => ({ ...byId.get(update.id)!, analise_semantica: update.semantic as KeywordSemantic }));
      await runAutomaticSubjectLogic(declaredItems);
    }
  };

  /**
   * Import de Assuntos aplicado (a rota grava; esta tela só relê e segue).
   * Lê as linhas criadas e declaradas da marca ativa e roda a Lógica
   * automática nas que ainda não a têm (F1.7b).
   */
  const handleSubjectsImported = async (result: { createdIds: string[]; declaredIds: string[] }) => {
    const ids = [...new Set([...(result.createdIds || []), ...(result.declaredIds || [])].filter(Boolean))];
    if (ids.length === 0 || !selectedBrandId) return;
    let rows: KeywordItem[] = [];
    try {
      // Pela fonte da listagem (a view sem as séries de medição), como a
      // tabela carrega as linhas: a existente declarada não traz ~9,5 kB.
      const byId = await readCanonicalKeywordRows(ids, { source: fonteDaListagem });
      rows = ids.map(id => byId.get(id)).filter((row): row is KeywordItem => Boolean(row));
    } catch (error) {
      showNotification("error", `Os Assuntos foram importados, mas a tabela não conseguiu relê-los: ${error instanceof Error ? error.message : "erro desconhecido"}. Recarregue a página.`, { code: "SUBJECT_IMPORT_READBACK_FAILED" });
      return;
    }
    const rowById = new Map(rows.map(row => [row.id, row]));
    setKeywords(current => {
      const known = new Set(current.map(item => item.id));
      const fresh = rows.filter(row => !known.has(row.id));
      return [...fresh, ...current.map(item => rowById.get(item.id) || item)];
    });
    showNotification("success", `${result.createdIds.length} Assunto(s) criado(s) e ${result.declaredIds.length} keyword(s) existente(s) declarada(s) no Processador.`);
    await runAutomaticSubjectLogic(rows);
  };

  const loadRecoverableKeywords = useCallback(async (brandId: string): Promise<KeywordItem[]> => {
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/keywords/recoverable`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) {
      // The operational grid can remain usable while a pending migration is
      // being reviewed; no local row is treated as recoverable on an error.
      return [];
    }
    return Array.isArray(body.items) ? body.items as KeywordItem[] : [];
  }, []);

  // Carrega listas e keywords iniciais do Supabase
  const fetchData = async () => {
    if (sessionStatus !== "authenticated") return;
    if (!selectedBrandId) {
      fetchDataInFlightRef.current = null;
      fetchDataActiveKeyRef.current = null;
      setLists([]);
      setKeywords([]);
      setHumanReviewDrafts({});
      setTargetListId("");
      setSiteSyncPlan(null);
      fetchDataLoadedKeyRef.current = null;
      setLoading(false);
      return;
    }
    const fetchKey = `${selectedBrandId || "sem-marca"}|${sessionStatus}`;
    if (fetchDataInFlightRef.current === fetchKey || fetchDataLoadedKeyRef.current === fetchKey) return;
    fetchDataInFlightRef.current = fetchKey;
    fetchDataActiveKeyRef.current = fetchKey;
    setSiteSyncPlan(null);
    setLoading(true);
    try {
      await getCurrentSupabaseToken();
      // 1. Carrega todas as listas de KGR (Categorias/Silos) filtradas por marca_id
      const loadedLists = await withSupabaseSelectRetry(async () => {
        const { data: listsData, error: listsError } = await supabase
          .from("minerador_keyword_lists")
          .select("*")
          .eq("marca_id", selectedBrandId)
          .order("nome", { ascending: true });
        if (listsError) throw listsError;
        return listsData || [];
      });
      if (fetchDataActiveKeyRef.current !== fetchKey) return;
      setLists(loadedLists);

      // Define a primeira lista alvo no lote se houver listas
      if (loadedLists.length > 0) {
        setTargetListId(loadedLists[0].id);
      } else {
        setTargetListId("");
      }

      // 2. Carrega as keywords pertencentes a estes silos ou sem silo (lista_id is null)
      const loadedKeywords = await withSupabaseSelectRetry(async () => {
        const allowedListIds = loadedLists.map(l => l.id);
        const lerDe = async (fonte: string) => {
          let query = supabase
            .from(fonte)
             .select("*")
             .eq("brand_id", selectedBrandId)
             .is("deleted_at", null)
             .order("created_at", { ascending: false });

          if (allowedListIds.length > 0) {
            const orFilter = `lista_id.is.null,${allowedListIds.map(id => `lista_id.eq.${id}`).join(",")}`;
            query = query.or(orFilter);
          } else {
            query = query.is("lista_id", null);
          }
          return query;
        };

        let { data: keywordsData, error: keywordsError } = await lerDe(fonteDaListagem);
        if (keywordsError && fonteDaListagem !== MINERADOR_KEYWORDS_TABLE && viewDeListagemAusente(keywordsError)) {
          // Migration ainda não aplicada: a tela funciona, só sem a economia.
          fonteDaListagem = MINERADOR_KEYWORDS_TABLE;
          ({ data: keywordsData, error: keywordsError } = await lerDe(MINERADOR_KEYWORDS_TABLE));
        }
        if (keywordsError) throw keywordsError;
        return keywordsData || [];
      });

      // B. Auto-atribuiÃ§Ã£o de nicho para listas que nÃ£o possuem nicho definido
      const listsWithoutNicho = loadedLists.filter(l => !l.nicho || l.nicho === "Geral" || l.nicho.trim() === "");
      if (listsWithoutNicho.length > 0 && loadedKeywords.length > 0) {
        const listPromises = listsWithoutNicho.map(async (list) => {
          const listKws = loadedKeywords.filter(k => k.lista_id === list.id);
          if (listKws.length > 0) {
            const detectedNicho = autoDetectNiche(listKws[0].keyword);
            await supabase
              .from("minerador_keyword_lists")
              .update({ nicho: detectedNicho })
              .eq("id", list.id)
              .eq("marca_id", selectedBrandId);
            list.nicho = detectedNicho; // atualiza na memÃ³ria
          }
        });
        await Promise.all(listPromises);
        setLists([...loadedLists]);
      }

      if (fetchDataActiveKeyRef.current !== fetchKey) return;
      // A qualificação de keywords é sempre explícita; o carregamento não deriva nem persiste DNA ou Funil.
      setKeywords(loadedKeywords);
      // As linhas voltaram podadas: o que já fora hidratado não vale mais.
      hydratedKeywordIdsRef.current = new Set();
      setProcessAttemptsByKeywordId({});
      setHumanReviewDrafts({});
      // Reidratação server-side: a Qualificação Semântica sobrevive a F5, nova
      // aba e outro navegador, sem nenhuma chamada DataForSEO.
      // A leitura do artifact é tolerante: uma falha de rede não pode apagar da
      // tela uma Qualificação remota válida.
      // A carga do Perfil cobre todas as keywords vivas da Marca: a poda do
      // cache pode tirar tudo que não é vigente deste actor+Marca. Se a
      // listagem bateu no teto de linhas do PostgREST, ela pode ter vindo
      // cortada, e a poda fica restrita às keywords desta carga.
      const persistedQualifications = await loadSemanticQualifications(selectedBrandId, loadedKeywords.map(item => String(item.id)), qualificationVersionCachePruneForListing(loadedKeywords.length))
        .catch(() => null);
      // A Marca pode ter mudado durante a leitura: a Qualificação de uma Marca
      // nunca entra no estado de outra.
      if (fetchDataActiveKeyRef.current !== fetchKey) return;
      if (persistedQualifications) {
        setSemanticQualifications(current => ({ ...current, ...persistedQualifications }));
        setSemanticConsolidationDrafts(current => {
          const next = { ...current };
          for (const [keywordId, qualification] of Object.entries(persistedQualifications)) {
            const keyword = loadedKeywords.find(item => String(item.id) === keywordId);
            // A coluna "Lógica" do painel é a hipótese, não a resposta canônica.
            const logic = keyword ? readCanonicalKeywordDna(keyword, { includeSerpEvidence: false }) : null;
            next[keywordId] = semanticDraftFromQualification(qualification, { intent: logic?.intent ?? null, funnel: logic?.funnel ?? null });
          }
          return next;
        });
      }
      setRecoverableKeywords(await loadRecoverableKeywords(selectedBrandId));

      fetchDataLoadedKeyRef.current = fetchKey;
      setSelectedIds(new Set());
      setQualificationResults([]);
    } catch (err: any) {
      const authError = isSupabaseBrowserAuthError(err);
      console.error("Erro ao carregar dados do Supabase:", {
        code: authError ? err.code : err?.code,
        tokenExpired: authError ? isSupabaseTokenExpirationError(err) : false,
        ...(authError ? err.diagnostic : {}),
        table: "minerador_keyword_lists/minerador_keywords",
        operation: "select",
        message: authError ? undefined : err?.message,
      });
      showNotification(
        "error",
        authError ? getSupabaseSessionErrorMessage(err.code, err.expiresAt) : `Erro: ${err.message || "Erro de rede"}`,
      );
    } finally {
      if (fetchDataInFlightRef.current === fetchKey) fetchDataInFlightRef.current = null;
      if (fetchDataActiveKeyRef.current === fetchKey) setLoading(false);
    }
  };

  /**
   * Abre a conferência por link para UMA keyword.
   *
   * Limpa a prévia aberta de propósito: o formulário era renderizado com
   * `!siteSyncPlan`, então uma prévia anterior escondia o campo e a ação
   * parecia não ter acontecido.
   */
  const openManualSiteCheck = (keyword: KeywordItem) => {
    const evidence = readSiteOrigin(keyword.analise_semantica);
    setSiteSyncPlan(null);
    setManualSiteCheckKeywordId(keyword.id);
    setManualSiteCheckUrl(evidence?.resolvedUrl || evidence?.sourceUrl || evidence?.declaredCanonicalUrl || activeBrand?.site_url || "");
  };

  // O formulário fica acima da tabela; sem isto a ação disparada de uma linha
  // lá embaixo não mostra nada na tela.
  useEffect(() => {
    if (manualSiteCheckKeywordId) manualSiteCheckRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [manualSiteCheckKeywordId]);

  const loadRemoteSiteCatalog = async (brandId: string): Promise<SiteCatalogEntryLike[]> => {
    const response = await fetch(`/api/marca/site/sitemap?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || "Catálogo Site/Sitemap remoto indisponível.");
    const catalog = Array.isArray(body?.snapshot?.catalog) ? body.snapshot.catalog as SiteCatalogEntryLike[] : [];
    siteCatalogRef.current = catalog;
    return catalog;
  };

  const handleCheckWithSite = async (singleKeywordId?: string) => {
    const effectiveSelectedIds = singleKeywordId ? new Set([singleKeywordId]) : selectedIds;
    if (effectiveSelectedIds.size === 0) { showNotification("error", "Selecione pelo menos uma keyword antes de conferir o site."); return; }
    if (!selectedBrandId) { showNotification("error", "Selecione uma marca antes de conferir o site."); return; }
    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("site", effectiveSelectedIds.size, [...effectiveSelectedIds], executionRequestId)) return;
    let outcome: "success" | "error" = "error";
    setSiteSyncLoading(true);
    try {
      if (!session?.user?.id) { showNotification("error", "Sessão não disponível para ler o Site/Sitemap local."); return; }
      // O catálogo canônico é o remoto (brand_site_catalog_entries). A cópia
      // local do navegador é complemento: pode não existir nesta máquina.
      const remoteCatalog = await loadRemoteSiteCatalog(selectedBrandId);
      const snapshot = await loadMineradorSiteSyncSnapshot(session.user.id, selectedBrandId).catch(() => null);
      const selectedItems = keywords.filter(item => effectiveSelectedIds.has(item.id));
      const selectedTexts = new Set(selectedItems.map(item => item.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
      const localCandidates = uniqueSiteSyncCandidates(snapshot?.candidates || []).filter(candidate => selectedTexts.has((candidate.normalizedText || candidate.text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
      // Casamento pelo que a página declara: H1, slug, título.
      const remoteCandidates = selectedItems.flatMap(item => matchKeywordToCatalog(item.keyword, remoteCatalog)
        .slice(0, 1)
        .map(match => candidateFromCatalogMatch({ keyword: item.keyword, brandId: selectedBrandId, match, catalog: remoteCatalog, candidateId: crypto.randomUUID(), mineradorKeywordId: item.id })));
      const storedEvidenceCandidates = selectedItems.map(item => candidateFromStoredSiteEvidence(item, selectedBrandId)).filter((candidate): candidate is MineradorSiteSyncCandidate => Boolean(candidate));
      const candidates = uniqueSiteSyncCandidates([...remoteCandidates, ...localCandidates, ...storedEvidenceCandidates]).map(candidate => {
        if (candidate.siteRole) return candidate;
        const structure = deriveSitePageStructure(candidate.resolvedUrl || candidate.sourceUrl, remoteCatalog);
        return { ...candidate, siteRole: structure.role, siloPath: structure.siloPath };
      });
      if (candidates.length === 0) {
        if (effectiveSelectedIds.size !== 1) {
        showNotification("info", "Para conferir uma URL informada manualmente, selecione somente uma keyword.", { metadata: { executionRequestId } });
          return;
        }
        const keywordId = [...effectiveSelectedIds][0];
        const target = keywords.find(item => item.id === keywordId);
        if (target) openManualSiteCheck(target);
        outcome = "success";
        showNotification("info", `Nenhuma página do catálogo declara "${target?.keyword || "esta keyword"}". Informe o link abaixo para conferir o vínculo.`, { metadata: { executionRequestId } });
        return;
      }
      const checkedAt = new Date().toISOString();
      const verifiedCandidates: typeof candidates = [];
      for (const candidate of candidates) {
        const response = await fetch("/api/marca/site/page/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: selectedBrandId, url: candidate.resolvedUrl || candidate.sourceUrl }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok && !body?.verificationStatus) throw new Error(body?.error || `Não foi possível conferir a página de ${candidate.text}.`);
        verifiedCandidates.push(withSiteVerification(candidate, body, checkedAt));
      }
      const plan = buildMineradorSiteSyncPlan(verifiedCandidates, keywords, targetListId);
      setSiteSyncPlan(plan);
      outcome = "success";
      showNotification("success", `Conferência pronta: ${plan.summary.new} nova(s), ${plan.summary.updated} evidência(s) a atualizar e ${plan.summary.unchanged} sem alteração.`, { metadata: { executionRequestId } });
    } catch (error) {
      console.error("Erro ao conferir Site/Sitemap no Minerador:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível ler o catálogo Site/Sitemap.", { metadata: { executionRequestId } });
    } finally {
      setSiteSyncLoading(false);
      // This action only creates a preview. It is not a completed persisted
      // site-check artifact; promotion happens in the confirmation action.
      // A successful preview is therefore a successful attempt, not a green
      // artifact. A failed preview remains visibly failed without erasing a
      // previously promoted site artifact.
      setProcessAttempt([...effectiveSelectedIds], "site", outcome === "success" ? "success" : "failed", executionRequestId);
      finishBulkProgress(outcome);
    }
  };

  const handleManualSiteCheck = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualSiteCheckKeywordId || !selectedBrandId) return;
    const keyword = keywords.find(item => item.id === manualSiteCheckKeywordId);
    const requestedUrl = manualSiteCheckUrl.trim();
    if (!keyword || !requestedUrl) { showNotification("error", "Informe a URL da página antes de conferir."); return; }
    let parsedUrl: URL;
    try { parsedUrl = new URL(requestedUrl); } catch { showNotification("error", "Informe uma URL válida da página da marca."); return; }
    setSiteSyncLoading(true);
    try {
      const response = await fetch("/api/marca/site/page/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: selectedBrandId, url: parsedUrl.toString() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && !body?.verificationStatus) throw new Error(body?.error || "Não foi possível conferir a URL informada.");
      const normalizedText = keyword.keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
      const candidate = withSiteVerification({
        id: crypto.randomUUID(),
        brandId: selectedBrandId,
        text: keyword.keyword,
        normalizedText,
        catalogEntryId: null,
        sourceKind: "manual_url",
        sourceUrl: parsedUrl.toString(),
        sourceField: "other",
        sourceFields: ["other"],
        suggestedRole: "unclassified",
        slugCoherence: "unknown",
        urlSituation: "unverified",
        publicationStatus: "not_confirmed",
        keywordUrlRelation: "undefined",
        architectureStatus: "awaiting_architecture",
        relationConfirmedBy: null,
        relationConfirmedAt: null,
        confidence: "medium",
        resolvedUrl: null,
        declaredCanonicalUrl: null,
        catalogTitle: null,
      }, body, new Date().toISOString());
      // A URL manual também ganha papel: a página do Silo pode não estar no
      // sitemap, mas os artigos abaixo dela estão — e é isso que a torna Silo.
      const catalogForStructure = siteCatalogRef.current.length ? siteCatalogRef.current : await loadRemoteSiteCatalog(selectedBrandId).catch(() => []);
      const structure = deriveSitePageStructure(candidate.resolvedUrl || candidate.sourceUrl, catalogForStructure);
      const conferida = { ...candidate, siteRole: structure.role, siloPath: structure.siloPath, mineradorKeywordId: keyword.id };
      const plan = buildMineradorSiteSyncPlan([conferida], keywords, targetListId || null);
      const planned = plan.items[0];
      if (!["new", "evidence_updated", "no_change"].includes(planned.outcome)) {
        // Recusa tem motivo: mostrar a prévia é o único jeito de explicá-lo.
        setSiteSyncPlan(plan);
        setManualSiteCheckKeywordId(null);
        showNotification("error", planned.reason || "A conferência não pôde ser aplicada a esta keyword.");
        return;
      }
      // O ato explícito foi colar a URL e conferir. Segurar a evidência atrás
      // de um "Salvar" no topo da tela só escondia o resultado: a linha
      // continuava "Livre" e parecia que nada tinha acontecido.
      const gravada = await persistSiteSyncCandidates([conferida], {
        scopeIds: [keyword.id],
        successMessage: `Página conferida como ${sitePageRoleLabel(structure.role)}.`,
      });
      setManualSiteCheckKeywordId(null);
      if (!gravada) return;
      setSiteSyncPlan(null);
      /*
       * Colar a URL de uma página que está no ar e mandar conferir É a
       * declaração. Exigir um segundo clique dentro do card DECISÃO fazia o
       * humano confirmar duas vezes a mesma coisa — e a linha ficava
       * "Verificada" parecendo que faltava algo.
       */
      const { data: conferido, error: conferidoErro } = await supabase
        .from("minerador_keywords").select("*").eq("id", keyword.id).eq("brand_id", selectedBrandId).is("deleted_at", null).maybeSingle();
      if (conferidoErro || !conferido) {
        showNotification("info", "Página conferida. Declare a publicação pelo card DECISÃO.");
        return;
      }
      await handlePublicationLinkAction(conferido as KeywordItem, "confirm", "", { skipPrompt: true });
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível conferir a URL informada.");
    } finally {
      setSiteSyncLoading(false);
    }
  };

  /**
   * Grava a conferência. Um caminho só: a prévia do catálogo e a URL informada
   * à mão passam por aqui.
   */
  const persistSiteSyncCandidates = async (
    candidates: MineradorSiteSyncCandidate[],
    options: { scopeIds?: string[]; successMessage?: string } = {},
  ): Promise<boolean> => {
    if (!selectedBrandId || !candidates.length) return false;
    const executionRequestId = crypto.randomUUID();
    const scopeIds = options.scopeIds ?? (selectedIds.size ? [...selectedIds] : undefined);
    if (!startBulkProgress("site", candidates.length, scopeIds, executionRequestId)) return false;
    let outcome: "success" | "error" = "error";
    const batchId = crypto.randomUUID();
    setSiteSyncPersisting(true);
    try {
      const response = await fetch("/api/marca/site/import/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, targetListId: targetListId || null, batchId, candidates }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.persisted !== true || !["completed", "partial"].includes(body.status)) throw new Error(body.error || "O Minerador não confirmou a persistência da conferência.");
      outcome = body.status === "partial" ? "error" : "success";
      const resultItems = Array.isArray(body.items) ? body.items as Array<{ candidateId: string; outcome: string; mineradorKeywordId: string | null }> : [];
      const persistedIds = resultItems
        .filter(result => ["imported", "existing_in_minerador", "evidence_updated", "no_change"].includes(result.outcome))
        .map(result => result.mineradorKeywordId)
        .filter((id): id is string => Boolean(id));
      const { data: readbackRows, error: readbackError } = persistedIds.length > 0
        ? await supabase.from("minerador_keywords").select("*").in("id", persistedIds).eq("brand_id", selectedBrandId).is("deleted_at", null)
        : { data: [], error: null };
      if (readbackError) throw readbackError;
      const readbackById = new Map((readbackRows || []).map(row => [String(row.id), row as KeywordItem]));
      if (readbackById.size !== new Set(persistedIds).size) throw new Error("A conferência foi gravada, mas o readback da marca ativa não foi confirmado.");
      setProcessAttempt(persistedIds, "site", "success", executionRequestId);
      setProcessAttempt(resultItems.filter(result => !result.mineradorKeywordId || !readbackById.has(result.mineradorKeywordId)).map(result => result.mineradorKeywordId || "").filter(Boolean), "site", "failed", executionRequestId);
      setKeywords(current => {
        const next = [...current];
        for (const result of resultItems) {
          if (!["imported", "existing_in_minerador", "evidence_updated", "no_change"].includes(result.outcome)) continue;
          if (!result.mineradorKeywordId) continue;
          const readbackItem = readbackById.get(result.mineradorKeywordId);
          if (!readbackItem || readbackItem.brand_id !== selectedBrandId) continue;
          const index = next.findIndex(item => item.id === result.mineradorKeywordId);
          if (index >= 0) next[index] = readbackItem;
          else next.push(readbackItem);
        }
        return next;
      });
      showNotification("success", body.status === "partial" ? "Conferência persistida parcialmente; revise os itens com falha." : options.successMessage || "Conferência Site/Sitemap persistida no Minerador.", { metadata: { executionRequestId } });
      return outcome === "success";
    } catch (error) {
      console.error("Erro ao persistir conferência Site/Sitemap:", error);
      setProcessAttempt(scopeIds || [], "site", "failed", executionRequestId);
      showNotification("error", error instanceof Error ? error.message : "Falha ao persistir a conferência Site/Sitemap.", { metadata: { executionRequestId } });
      return false;
    } finally {
      setSiteSyncPersisting(false);
      finishBulkProgress(outcome);
    }
  };

  const handleConfirmSiteSync = async () => {
    if (!siteSyncPlan) return;
    const candidates = siteSyncPlan.items.filter(item => ["new", "evidence_updated", "no_change"].includes(item.outcome)).map(item => item.candidate);
    if (!candidates.length) { showNotification("error", "A prévia não possui itens válidos para persistir."); return; }
    if (await persistSiteSyncCandidates(candidates)) setSiteSyncPlan(null);
  };

  const handlePublicationLinkAction = async (
    item: KeywordItem,
    action: "confirm" | "correct_legacy" | "unlink",
    requestedEditorialStatus: EditorialKeywordStatus | "" = "",
    // Quem colou a URL e mandou declarar já respondeu à pergunta; repetir o
    // `confirm` do navegador seria pedir a mesma confirmação duas vezes.
    options: { skipPrompt?: boolean } = {},
  ) => {
    if (!selectedBrandId || !session?.user?.id) return;
    const currentView = readPublicationLink({ status: item.status, evidence: readSiteOrigin(item.analise_semantica) });
    if (action === "correct_legacy" && (!requestedEditorialStatus || !mineradorWorkflowStatuses.includes(requestedEditorialStatus))) {
      showNotification("info", "Escolha o estado editorial que deve permanecer depois da correção da marcação.");
      return;
    }
    const requestedStatusLabel = requestedEditorialStatus ? resolveEditorialKeywordStatus(requestedEditorialStatus).label : null;
    const confirmation = action === "confirm"
      ? `Confirmar a página de “${item.keyword}” como publicação da marca?\n\nA confirmação é humana e não altera o status editorial.`
      : action === "correct_legacy"
        ? `Corrigir a marcação legada de “${item.keyword}”?\n\nO status editorial ficará como “${requestedStatusLabel}”. A URL, o canonical e o histórico serão preservados; apenas a promoção não verificada será removida.`
        : `Desvincular a publicação de “${item.keyword}”?\n\nA URL, o canonical e o histórico serão preservados.`;
    if (!options.skipPrompt && !window.confirm(confirmation)) return;
    if (action === "confirm" && currentView.state !== "verified") return;
    if (action === "correct_legacy" && currentView.state !== "legacy_unverified") return;
    if (action === "unlink" && currentView.state !== "published") return;
    const changedAt = new Date().toISOString();
    const result = applyPublicationLinkAction(item.analise_semantica, { action, actorId: session.user.id, changedAt, status: item.status });
    if (!result.changed) { showNotification("error", result.reason || "O vínculo não pôde ser atualizado."); return; }
    setUpdating(true);
    try {
      const payload: Record<string, unknown> = { analise_semantica: result.semantic };
      if (action === "correct_legacy" && requestedEditorialStatus) payload.status = requestedEditorialStatus;
      const { error } = await supabase.from("minerador_keywords").update(payload).eq("id", item.id).eq("brand_id", selectedBrandId).is("deleted_at", null);
      if (error) throw error;
      const { data: readback, error: readbackError } = await supabase.from("minerador_keywords").select("id,brand_id,status,analise_semantica").eq("id", item.id).eq("brand_id", selectedBrandId).is("deleted_at", null).maybeSingle();
      if (readbackError) throw readbackError;
      if (!readback || readback.brand_id !== selectedBrandId) throw new Error("O vínculo não pertence à marca ativa após o salvamento.");
      const readbackView = readPublicationLink({ status: readback.status, evidence: readSiteOrigin(readback.analise_semantica as Record<string, unknown> | null) });
      if (action === "confirm" && readbackView.state !== "published") throw new Error("O readback não confirmou a publicação.");
      if (action === "unlink" && readbackView.state === "published") throw new Error("O readback ainda indica uma publicação ativa.");
      if (action === "correct_legacy" && (String(readback.status || "").toLowerCase() !== requestedEditorialStatus || resolveEditorialKeywordStatus(readback.status).kind !== "resolved" || readbackView.state === "legacy_unverified")) {
        throw new Error("O readback não confirmou o status editorial escolhido e a remoção do vínculo legado.");
      }
      setKeywords(current => current.map(keyword => keyword.id === item.id ? { ...keyword, ...(action === "correct_legacy" ? { status: readback.status } : {}), analise_semantica: readback.analise_semantica as KeywordSemantic } : keyword));
      if (action === "correct_legacy") setLegacyEditorialRecovery(null);
      showNotification("success", action === "confirm" ? "Vínculo confirmado como publicação." : action === "unlink" ? "Publicação desvinculada; histórico preservado." : "Marcação legada corrigida; status editorial e vínculo atualizados.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível atualizar o vínculo de publicação.");
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchData();
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
    }
  }, [selectedBrandId, sessionStatus, supabase]);

  /**
   * Expandir traz as séries de medição desta keyword — e só dela.
   *
   * A listagem chega sem os dois históricos e as duas séries mensais (209 kB
   * na marca inteira). O painel do DNA precisa deles para o gráfico de 12
   * meses e para as listas de histórico, então a linha é completada quando o
   * humano a abre: uma keyword por vez, uma vez por carregamento.
   *
   * A mesclagem é aditiva e o estado corrente da tela é quem manda — hidratar
   * não pode ressuscitar decisão que mudou desde que a lista foi carregada.
   */
  useEffect(() => {
    const keywordId = expandedRowId;
    if (!keywordId || !selectedBrandId) return;
    // Sem poda não há o que hidratar.
    if (fonteDaListagem === MINERADOR_KEYWORDS_TABLE) return;
    if (hydratedKeywordIdsRef.current.has(keywordId)) return;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase
        .from(MINERADOR_KEYWORDS_TABLE)
        .select("id,analise_semantica")
        .eq("id", keywordId)
        .eq("brand_id", selectedBrandId)
        .is("deleted_at", null)
        .maybeSingle();
      // Falha de rede não apaga nada da tela: o painel segue com o que tem.
      if (cancelado || error || !data) return;
      hydratedKeywordIdsRef.current.add(keywordId);
      const completo = (data.analise_semantica || null) as KeywordSemantic | null;
      setKeywords(current => current.map(item => item.id === keywordId
        ? { ...item, analise_semantica: withMeasurementSeries(item.analise_semantica, completo) as KeywordSemantic }
        : item));
    })();
    return () => { cancelado = true; };
  }, [expandedRowId, selectedBrandId, supabase]);

  // Redireciona o Admin para /marcas apenas se NENHUMA marca estiver selecionada
  useEffect(() => {
    if (sessionStatus === "authenticated" && userRole === "admin" && !selectedBrandId) {
      router.push("/marcas");
    }
  }, [sessionStatus, userRole, selectedBrandId, router]);

  // AÃ§Ã£o: Exportar selecionadas para CSV Local
  const exportSelectedToCSV = (fileName: string) => {
    if (selectedIds.size === 0) {
      showNotification("error", "Selecione pelo menos uma palavra-chave para exportar.");
      return;
    }

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));

    // Passo 2: Varre todas as chaves Ãºnicas presentes dentro dos objetos analise_semantica
    const uniqueKeysSet = new Set<string>();
    selectedKeywords.forEach(k => {
      if (k.analise_semantica && typeof k.analise_semantica === "object") {
        Object.keys(k.analise_semantica).forEach(key => {
          uniqueKeysSet.add(key);
        });
      }
    });

    const dynamicKeys = Array.from(uniqueKeysSet).filter(key => !["nicho_override", "site_origin", "site_origins", "kgr_aplicabilidade", "kgr_decisao", "kgr_decisao_origem", "kgr_decidido_por", "kgr_decidido_em", "kgr_decisao_versao", "kgr_decisao_historico", "kgr_justificativa"].includes(key));

    // Mapeamento de rÃ³tulos amigÃ¡veis para chaves conhecidas do cardÃ¡pio
    const formatKeyLabel = (k: string) => {
      const labels: Record<string, string> = {
        urgencia_tempo: "UrgÃªncia Tempo",
        intencao_local: "IntenÃ§Ã£o Local",
        perfil_b2b: "Perfil B2b",
        emocao_dominante: "EmoÃ§Ã£o Dominante",
        nivel_consciencia: "NÃ­vel ConsciÃªncia",
        "objecao_implÃ­cita": "ObjeÃ§Ã£o ImplÃ­cita",
        objecao_implicita: "ObjeÃ§Ã£o ImplÃ­cita",
        poder_aquisitivo: "Poder Aquisitivo",
        gatilho_de_conversao: "Gatilho ConversÃ£o"
      };
      if (labels[k]) return labels[k];
      return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    // Passo 3: Cria os objetos planos achatando as colunas fixas e as chaves dinÃ¢micas
    const flatData = selectedKeywords.map(k => {
      const canonicalSnapshot = resolveCanonicalKeywordSnapshot({ ...k, attempts: processAttemptsByKeywordId[k.id] });
      const automaticKgrScore = canonicalSnapshot.metrics.kgr.score;
      const volumeKgrConsistency = assessVolumeKgrConsistency({ volume: canonicalSnapshot.metrics.volume.value, results: canonicalSnapshot.metrics.result.value, kgrScore: automaticKgrScore, semantic: k.analise_semantica });
      // Colunas fixas obrigatÃ³rias
      const row: Record<string, any> = {
        "Palavra-Chave": k.keyword || "",
        "Resultados": canonicalSnapshot.metrics.result.value !== null ? canonicalSnapshot.metrics.result.value : "",
        "Volume": canonicalSnapshot.metrics.volume.value !== null ? canonicalSnapshot.metrics.volume.value : "",
        "KGR": automaticKgrScore !== null ? automaticKgrScore.toFixed(3) : "",
        "KGR Aplicabilidade": canonicalSnapshot.metrics.kgr.applicability,
        "KGR Decisão": kgrDecisionLabel(canonicalSnapshot.metrics.kgr.applicability),
        "KGR Estado do cálculo": volumeKgrConsistency === "inconsistent" ? "inconsistent" : classifyKgrMeasurement({ kgrScore: automaticKgrScore, volume: canonicalSnapshot.metrics.volume.value, results: canonicalSnapshot.metrics.result.value }),
        "KGR Fonte": k.volume_source || "",
        "KGR Origem da decisão": k.analise_semantica?.kgr_decisao_origem || "",
        "KGR Decidido por": k.analise_semantica?.kgr_decidido_por || "",
        "KGR Decidido em": k.analise_semantica?.kgr_decidido_em || "",
        "KGR Versão": k.analise_semantica?.kgr_decisao_versao || "",
        "KGR Justificativa": k.analise_semantica?.kgr_justificativa || "",
        "IntenÃ§Ã£o": canonicalSnapshot.semantic.intentLabel,
        "Nicho": canonicalSnapshot.semantic.nicheLabel,
        "Status": k.status || "bruto"
      };

      // Adiciona as colunas dinÃ¢micas encontradas
      dynamicKeys.forEach(dk => {
        const columnHeader = formatKeyLabel(dk);
        const val = k.analise_semantica ? k.analise_semantica[dk] : "";
        row[columnHeader] = val || "";
      });

      return row;
    });

    // Passo 4 & 5: Utiliza Papa.unparse com delimitador ';' para gerar o CSV
    const csvContent = Papa.unparse(flatData, {
      delimiter: ";",
      header: true
    });

    // Adiciona o BOM do UTF-8 (\uFEFF) no inÃ­cio da string para o Excel brasileiro ler acentos perfeitamente
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Garante que a extensÃ£o .csv esteja presente e limpa no nome do arquivo
    let finalFileName = fileName.trim();
    if (!finalFileName) finalFileName = "kgr-estrategico-export";
    if (!finalFileName.toLowerCase().endsWith(".csv")) {
      finalFileName += ".csv";
    }

    // Cria link temporÃ¡rio para download
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", finalFileName);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification("success", `Exportadas ${selectedKeywords.length} palavras no arquivo "${finalFileName}"!`);
  };

  // Memo para identificar grupos de palavras-chave duplicadas
  const duplicateGroups = useMemo(() => {
    const counts: Record<string, KeywordItem[]> = {};
    filteredKeywords.forEach(k => {
      const key = k.keyword.toLowerCase().trim();
      if (!counts[key]) counts[key] = [];
      counts[key].push(k);
    });
    return Object.values(counts).filter(group => group.length > 1);
  }, [filteredKeywords]);

  type KeywordDeleteReview = { ids: string[]; publishedIds: string[]; hardDeleteIds: string[]; impact: DeletionImpactEntry[]; confirmationName: string };

  const requestKeywordDeletePreview = useCallback(async (ids: readonly string[]): Promise<KeywordDeleteReview> => {
    if (!selectedBrandId) throw new Error("Marca ativa ausente para a exclusão.");
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/delete/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywordIds: [...new Set(ids)] }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success !== true) {
      const error = new Error(body?.message || "Não foi possível resolver a publicação das keywords.") as Error & { code?: string; diagnostic?: Record<string, unknown> };
      error.code = typeof body?.code === "string" ? body.code : "KEYWORD_DELETE_TRANSACTION_FAILED";
      throw error;
      // O servidor envia a causa tecnica; descarta-la aqui tornava a falha ininvestigavel.
      if (body?.diagnostic && typeof body.diagnostic === "object") error.diagnostic = body.diagnostic as Record<string, unknown>;
      throw error;
    }
    const impact = Array.isArray(body.items) ? body.items.flatMap((item: { impact?: Record<string, unknown> }) => {
      const nested = item?.impact || {};
      return ["ownedChildren", "downstreamDrafts", "sharedReferences", "publishedReferences"].flatMap(key => Array.isArray(nested[key]) ? nested[key] : []);
    }).filter((entry: unknown): entry is DeletionImpactEntry => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Record<string, unknown>;
      return typeof value.key === "string" && typeof value.label === "string" && typeof value.count === "number" && typeof value.classification === "string" && typeof value.behavior === "string";
    }) : [];
    const previewItems = Array.isArray(body.items) ? body.items as Array<{ id?: unknown; keyword?: unknown }> : [];
    const resolvedIds = previewItems.map(item => item.id).filter((id: unknown): id is string => typeof id === "string");
    const resolvedNames = previewItems.map(item => typeof item.keyword === "string" ? item.keyword.trim() : "").filter(Boolean);
    const confirmationName = resolvedNames.length === 1
      ? resolvedNames[0]
      : `${resolvedIds.length || new Set(ids).size} keywords selecionadas`;
    return {
      ids: resolvedIds.length > 0 ? resolvedIds : [...new Set(ids)],
      publishedIds: Array.isArray(body.publishedIds) ? body.publishedIds.filter((id: unknown): id is string => typeof id === "string") : [],
      hardDeleteIds: Array.isArray(body.hardDeleteIds) ? body.hardDeleteIds.filter((id: unknown): id is string => typeof id === "string") : [],
      impact,
      confirmationName,
    };
  }, [selectedBrandId]);

  const executeKeywordDeletion = useCallback(async (review: KeywordDeleteReview) => {
    if (!selectedBrandId) throw new Error("Marca ativa ausente para a exclusão.");
    setUpdating(true);
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A declaracao do fluxo recuperavel: o humano viu o dialogo "Remover
        // keywords publicadas por 24 horas" e digitou o nome. Sem ela o banco
        // recusa o lote — que e o que impede uma publicada sumir sozinha.
        body: JSON.stringify({ keywordIds: review.ids, allowRecoverable: review.publishedIds.length > 0 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) {
        const error = new Error(body?.message || "A exclusão não foi concluída.") as Error & { code?: string };
        error.code = typeof body?.code === "string" ? body.code : "KEYWORD_DELETE_TRANSACTION_FAILED";
        throw error;
      }

      const hardDeletedIds = Array.isArray(body.hardDeletedIds) ? body.hardDeletedIds as string[] : [];
      const recoverableIds = Array.isArray(body.recoverableIds) ? body.recoverableIds as string[] : [];
      // The server/RPC is the timestamp authority. Re-read the tombstones
      // instead of projecting deleted_at/purge_after from the browser clock.
      const recoverableReadback = recoverableIds.length > 0
        ? await loadRecoverableKeywords(selectedBrandId)
        : [];
      const recoveryRows = recoverableReadback.filter(item => recoverableIds.includes(item.id));

      setKeywords(previous => previous.filter(item => !review.ids.includes(item.id)));
      setSelectedIds(current => new Set([...current].filter(id => !review.ids.includes(id))));
      if (recoveryRows.length > 0) {
        setRecoverableKeywords(previous => {
          const byId = new Map(previous.map(item => [item.id, item]));
          recoveryRows.forEach(item => byId.set(item.id, item));
          return [...byId.values()].sort((left, right) => String(left.purge_after || "").localeCompare(String(right.purge_after || "")));
        });
      }

      if (hardDeletedIds.length > 0 && recoverableIds.length > 0) {
        showNotification("success", `${hardDeletedIds.length} keyword(s) excluída(s) definitivamente; ${recoverableIds.length} removida(s) da operação por 24 horas.`);
      } else if (recoverableIds.length > 0) {
        showNotification("success", `${recoverableIds.length} keyword(s) publicada(s) removida(s) da operação e disponível(is) para restauração por 24 horas.`);
      } else {
        showNotification("success", `${hardDeletedIds.length} keyword(s) excluída(s) definitivamente.`);
      }
      if (recoverableIds.length > 0 && recoveryRows.length !== recoverableIds.length) {
        showNotification("info", "A remoção recuperável foi confirmada pelo servidor; recarregue a marca para atualizar a lista de recuperação.", { code: "KEYWORD_RECOVERY_READBACK_PENDING", stage: "delete_readback", persistent: true });
      }
      return true;
    } catch (error) {
      const failure = error && typeof error === "object" ? error as { code?: unknown; diagnostic?: unknown } : {};
        const code = typeof failure.code === "string" ? failure.code : "KEYWORD_DELETE_TRANSACTION_FAILED";
        const diagnostic = failure.diagnostic && typeof failure.diagnostic === "object" && !Array.isArray(failure.diagnostic)
          ? failure.diagnostic as Record<string, unknown>
          : undefined;
      if (code === "KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW") {
        showNotification("error", "A seleção contém uma keyword publicada. Reabra a confirmação reforçada para usar a recuperação de 24 horas.", { code, stage: "publication_recheck", persistent: true });
      } else {
        showNotification("error", "Nada foi apagado: a transação não foi confirmada e nenhuma alteração parcial foi mantida.", { code, stage: "delete_transaction", persistent: true });
      }
      return false;
    } finally {
      setUpdating(false);
    }
  }, [loadRecoverableKeywords, keywords, selectedBrandId, setSelectedIds, showNotification]);

  const handleRestoreKeyword = useCallback(async (keywordId: string) => {
    if (!selectedBrandId) return;
    setUpdating(true);
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/keywords/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds: [keywordId] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) throw new Error(body?.message || "A keyword não pôde ser restaurada.");
      const restored = recoverableKeywords.find(item => item.id === keywordId);
      if (restored) setKeywords(previous => previous.some(item => item.id === restored.id) ? previous : [({ ...restored, deleted_at: null, purge_after: null }), ...previous]);
      setRecoverableKeywords(previous => previous.filter(item => item.id !== keywordId));
      showNotification("success", "Keyword restaurada e devolvida à operação normal.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "A keyword não pôde ser restaurada.", { code: "KEYWORD_RESTORE_FAILED", stage: "restore", persistent: true });
    } finally {
      setUpdating(false);
    }
  }, [recoverableKeywords, selectedBrandId, showNotification]);

  // AÃ§Ã£o: Apaga palavras repetidas na visualizaÃ§Ã£o atual (mantendo apenas 1 cÃ³pia de cada)
  const handleDeleteDuplicates = async () => {
    const idsToDelete: string[] = [];
    duplicateGroups.forEach(group => {
      // MantÃ©m o primeiro registro e manda deletar os outros
      const published = group.filter(keywordPublicationProtected);
      const nonPublished = group.filter(k => !keywordPublicationProtected(k));
      const toDelete = published.length > 0
        ? nonPublished.map(k => k.id)
        : nonPublished.slice(1).map(k => k.id);
      idsToDelete.push(...toDelete);
    });

    if (idsToDelete.length === 0) return;

    // Duplicate cleanup enters the same preview/impact/confirmation flow as
    // the normal delete action; client-side publication hints never bypass it.
    await handleBatchDelete(false, idsToDelete);
  };

  // Importar palavras do arquivo CSV selecionado
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedBrandId) {
      showNotification("error", "Selecione uma marca antes de importar keywords.");
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (rows.length === 0) {
            showNotification("error", "Nenhum dado encontrado no arquivo CSV.");
            setImporting(false);
            e.target.value = "";
            return;
          }

          const parsedKeywords = [];
          
          for (const row of rows) {
            // Procura por Keyword / Palavra
            const keywordKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "keyword" || k.toLowerCase() === "palavra"
            );
            if (!keywordKey || !row[keywordKey]) continue;

            const keyword = row[keywordKey].trim();
            if (!keyword) continue;

            // Procura por Resultados
            const resultsKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "resultados" || k.toLowerCase() === "results_allintitle"
            );
            let resultsVal: number | null = null;
            if (resultsKey && row[resultsKey]) {
              const parsed = parseInt(row[resultsKey], 10);
              if (!isNaN(parsed)) resultsVal = parsed;
            }

            // Procura por Volume
            const volumeKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "volume" || k.toLowerCase() === "volume_search"
            );
            let volumeVal: number | null = null;
            if (volumeKey && row[volumeKey]) {
              const parsed = parseInt(row[volumeKey], 10);
              if (!isNaN(parsed)) volumeVal = parsed;
            }

            // Procura por Intent
            const intentKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "intent" || k.toLowerCase() === "intencao" || k.toLowerCase() === "intenÃ§Ã£o"
            );
            const intentVal = intentKey ? row[intentKey] : null;

            // Procura por Status
            const statusKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "status"
            );
            let statusVal: MineradorWorkflowStatus = "bruto";
            let publicationSignal: "published" | null = null;
            if (statusKey && row[statusKey]) {
              const s = String(row[statusKey]).trim().toLowerCase();
              if (isLegacyPublishedStatus(s)) publicationSignal = "published";
              else if (mineradorWorkflowStatuses.includes(s as MineradorWorkflowStatus)) statusVal = s as MineradorWorkflowStatus;
            }

            // Procura por Silo do CSV
            const siloKey = Object.keys(row).find(
              (k) => ["silo", "lista", "categoria", "silo_slug", "silo_nome"].includes(k.toLowerCase().trim())
            );
            const rowSiloVal = siloKey ? String(row[siloKey]).trim() : "";
            
            const siloResolution = resolveLegacyCsvSilo({ rawReference: rowSiloVal, brandId: selectedBrandId, lists });
            if (siloResolution.issue) {
              showNotification("error", `Referência de silo não encontrada para "${keyword}". A keyword não foi importada.`);
              continue;
            }
            const matchedListId = siloResolution.listaId;

            // Procura por Slug do CSV
            const slugKey = Object.keys(row).find(
              (k) => ["slug", "slug_sugerido", "keyword_slug"].includes(k.toLowerCase().trim())
            );
            const rowSlugVal = slugKey ? String(row[slugKey]).trim().toLowerCase() : "";

            // Calcula o score KGR caso tenha ambos
            let kgrScore: number | null = null;
            if (resultsVal !== null && volumeVal !== null && volumeVal > 0) {
              kgrScore = Number((resultsVal / volumeVal).toFixed(4));
            }

            const resolvedIntent = intentVal ? canonicalIntentLabel(intentVal) : canonicalIntentLabel(autoClassifyIntent(keyword));
            const resolvedNiche = autoDetectNiche(keyword);
            const logicalDna = deriveLogicalKeywordDna({
              keywordId: `import:${toSlug(keyword)}`,
              keyword,
              intent: resolvedIntent,
              niche: resolvedNiche,
            });
            const semanticObj: Record<string, unknown> = mergeLogicalKeywordSemantic(null, {
              ...logicalDna.semantic,
              nicho_override: resolvedNiche,
            });
            if (rowSlugVal) {
              semanticObj.slug_sugerido = toSlug(rowSlugVal);
            }
            if (publicationSignal) {
              semanticObj.publication_signal = publicationSignal;
              semanticObj.publication_signal_source = "csv";
            }

            parsedKeywords.push({
              brand_id: selectedBrandId,
              keyword,
              results_allintitle: resultsVal,
              volume_search: volumeVal,
              kgr_score: kgrScore,
              intent: resolvedIntent,
              lista_id: matchedListId,
              status: statusVal,
              analise_semantica: semanticObj
            });
          }

          if (parsedKeywords.length === 0) {
            showNotification("error", "Nenhuma palavra-chave válida foi encontrada no CSV. Verifique a coluna Keyword e as referências explícitas de silo.");
            setImporting(false);
            e.target.value = "";
            return;
          }

          // Insere dados em lote no Supabase
          const { data: insertedKeywords, error } = await supabase
            .from("minerador_keywords")
            .insert(parsedKeywords)
            .select("*");

          if (error) throw error;

          if (insertedKeywords?.length) setKeywords(current => [...insertedKeywords as KeywordItem[], ...current]);

          showNotification("success", `${parsedKeywords.length} palavras-chave importadas com sucesso!`);
        } catch (err: any) {
          console.error("Erro ao importar CSV:", err);
          showNotification("error", `Erro na importaÃ§Ã£o: ${err.message || "Erro no banco"}`);
        } finally {
          setImporting(false);
          e.target.value = "";
        }
      },
      error: (err) => {
        console.error("Erro no PapaParse:", err);
        showNotification("error", "Falha ao processar a estrutura do arquivo CSV.");
        setImporting(false);
        e.target.value = "";
      }
    });
  };
  // Abre a importação manual sempre sem silo por padrão.
  const openManualModal = () => {
    setManualListId("");
    setManualKeywordsText("");
    setManualIntent("");
    setManualNicho("");
    setManualStatus("bruto");
    setManualLocation("Brasil");
    setIsManualModalOpen(true);
  };

  // Salva palavras importadas de forma manual (copiar/colar) no Supabase em lote
  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrandId) {
      showNotification("error", "Selecione uma marca antes de importar keywords.");
      return;
    }
    if (!manualKeywordsText.trim()) {
      showNotification("error", "Digite ou cole pelo menos uma palavra-chave.");
      return;
    }
    const resolvedManualListId = manualImportListaId({ selectedListId: manualListId, brandId: selectedBrandId, lists });
    if (manualListId && !resolvedManualListId) {
      showNotification("error", "A lista selecionada não pertence à marca ativa.");
      return;
    }

    setUpdating(true);
    try {
      const keywordLines = manualKeywordsText
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (keywordLines.length === 0) {
        showNotification("error", "Nenhuma palavra-chave vÃ¡lida encontrada no texto.");
        setUpdating(false);
        return;
      }

      const payload = keywordLines.map(keyword => {
        const resolvedNiche = manualNicho || autoDetectNiche(keyword);
        const resolvedIntent = manualIntent ? canonicalIntentLabel(manualIntent) : canonicalIntentLabel(autoClassifyIntent(keyword));
        const logicalDna = deriveLogicalKeywordDna({
          keywordId: `manual:${toSlug(keyword)}`,
          keyword,
          intent: resolvedIntent,
          niche: resolvedNiche,
          location: manualLocation.trim() || null,
        });
        const analise = mergeLogicalKeywordSemantic(null, {
          ...logicalDna.semantic,
          nicho_override: resolvedNiche,
        });
        return {
          brand_id: selectedBrandId,
          keyword,
          location: manualLocation.trim() || null,
          results_allintitle: null,
          volume_search: null,
          kgr_score: null,
          intent: resolvedIntent,
          status: manualStatus,
          lista_id: resolvedManualListId,
          analise_semantica: analise
        };
      });

      const { data: insertedKeywords, error } = await supabase
        .from("minerador_keywords")
        .insert(payload)
        .select("*");

      if (error) throw error;

      if (insertedKeywords?.length) setKeywords(current => [...insertedKeywords as KeywordItem[], ...current]);

      showNotification("success", `${payload.length} palavras-chave importadas manualmente com sucesso!`);
      setIsManualModalOpen(false);
    } catch (err: any) {
      console.error("Erro na importaÃ§Ã£o manual:", err);
      showNotification("error", `Erro ao importar: ${err.message || "Erro de conexÃ£o"}`);
    } finally {
      setUpdating(false);
    }
  };

  // FunÃ§Ã£o para lidar com clique de ordenaÃ§Ã£o no cabeÃ§alho
  const handleSort = (column: typeof sortColumn) => {
    setOrderMode("auto");
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Renderiza o indicador de ordenaÃ§Ã£o
  const renderSortIcon = (column: typeof sortColumn) => {
    if (orderMode === "manual" || sortColumn !== column) return <ArrowUpDown className="w-3 h-3 text-slate-650 opacity-40 inline" />;
    return sortDirection === "asc" 
      ? <ArrowUpDown className="w-3 h-3 text-module-accent inline rotate-180 transition-transform" />
      : <ArrowUpDown className="w-3 h-3 text-module-accent inline transition-transform" />;
  };

  const handleKeywordRowDragOver = (event: DragEvent<HTMLTableRowElement>, targetId: string) => {
    if (orderMode !== "manual") return;
    const sourceId = event.dataTransfer.getData("text/plain") || keywordOrder.draggingId;
    if (!sourceId || sourceId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    keywordOrder.moveBefore(sourceId, targetId);
  };

  const handleKeywordRowDrop = (event: DragEvent<HTMLTableRowElement>) => {
    if (orderMode !== "manual") return;
    event.preventDefault();
  };

  // Cria nova lista (Silo/Categoria)
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    if (!selectedBrandId) {
      showNotification("error", "Selecione ou cadastre uma marca primeiro.");
      return;
    }

    try {
      const payload: Record<string, any> = {
        nome: newListName.trim(),
        nicho: newListNicho.trim() || null,
        marca_id: selectedBrandId,
      };

      const { data, error } = await supabase
        .from("minerador_keyword_lists")
        .insert([payload])
        .select();

      if (error) throw error;
      
      showNotification("success", "Lista criada com sucesso!");
      setNewListName("");
      setNewListNicho("");
      setIsListModalOpen(false);
      
      // Recarrega listas do banco filtradas
      let listsQuery = supabase
        .from("minerador_keyword_lists")
        .select("*");
       listsQuery = listsQuery.eq("marca_id", selectedBrandId);
      const { data: listsData } = await listsQuery.order("nome", { ascending: true });
      
      const loadedLists = listsData || [];
      setLists(loadedLists);
      if (loadedLists.length > 0 && !targetListId) {
        setTargetListId(loadedLists[0].id);
      }
    } catch (err: any) {
      console.error(err);
      showNotification("error", `Erro ao criar lista: ${err.message || "Erro no banco"}`);
    }
  };

  // AtualizaÃ§Ã£o direta da lista/grupo pertencente na cÃ©lula (com suporte a aplicaÃ§Ã£o em massa)

  // AtualizaÃ§Ã£o direta do status na cÃ©lula da tabela (com suporte a aplicaÃ§Ã£o em massa)
  const handleUpdateStatus = async (id: string | null, status: string) => {
    try {
      const rawIds = id === null ? Array.from(selectedIds) : selectedIds.has(id) ? Array.from(selectedIds) : [id];
      if (rawIds.length === 0) return;
      const normalizedStatus = status.toLowerCase();
      if (!mineradorWorkflowStatuses.includes(normalizedStatus as MineradorWorkflowStatus)) {
        showNotification("error", "Publicado é um vínculo de publicação, não um status editorial ativo.");
        return;
      }
      const idsToUpdate = rawIds.filter(wordId => {
        const item = keywords.find(k => k.id === wordId);
        return !isLegacyPublishedStatus(item?.status);
      });
      const protectedCount = rawIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        showNotification("error", "Status publicado e bloqueado e nao pode ser rebaixado.");
        return;
      }

      /*
       * APROVAR É FECHAR O PACOTE.
       *
       * O Arquiteto passou a consumir o que foi aprovado, e não a linha viva.
       * Por isso a aprovação exige processo executado — Lógica, Volume,
       * Resultados e a aplicabilidade do KGR quando ele é calculável.
       *
       * O que NÃO entra na trava: Intenção e Funil consolidados. SERP mista é
       * resultado legítimo da análise; exigir conclusão tornaria impossível
       * aprovar uma keyword cuja evidência está genuinamente dividida.
       */
      if (normalizedStatus === "aprovado") {
        const incompletas = idsToUpdate
          .map(wordId => ({ wordId, item: keywords.find(k => k.id === wordId) }))
          .filter(({ item }) => !resolveApprovalReadiness({
            semantic: item?.analise_semantica || null,
            intent: item?.intent,
            volumeSearch: item?.volume_search,
            resultsAllintitle: item?.results_allintitle,
          }).ok);
        if (incompletas.length) {
          const primeira = incompletas[0].item;
          const motivo = resolveApprovalReadiness({
            semantic: primeira?.analise_semantica || null,
            intent: primeira?.intent,
            volumeSearch: primeira?.volume_search,
            resultsAllintitle: primeira?.results_allintitle,
          }).reason;
          showNotification("error", incompletas.length === 1
            ? `"${primeira?.keyword || "keyword"}" ainda não pode ser aprovada. ${motivo}`
            : `${incompletas.length} keyword(s) ainda não podem ser aprovadas. ${motivo}`, {
            code: "APPROVAL_INCOMPLETE",
            stage: "approval_gate",
            persistent: true,
            diagnostic: { pendentes: incompletas.map(({ item }) => item?.keyword).filter(Boolean).slice(0, 10) },
          });
          return;
        }
      }
      pushKeywordsHistory(keywords, `Alterar status de ${idsToUpdate.length} keyword(s) para ${status}`);

      /*
       * Aprovar grava o registro do pacote junto com o status: hash, assinatura,
       * autor, data e versão. É esse registro que distingue depois "mexeram na
       * keyword" de "reexecutaram e deu igual".
       */
      const aprovadoEm = new Date().toISOString();
      const semanticaPorId = new Map<string, KeywordSemantic>();
      if (normalizedStatus === "aprovado") {
        for (const wordId of idsToUpdate) {
          const item = keywords.find(k => k.id === wordId);
          if (!item || !selectedBrandId) continue;
          semanticaPorId.set(wordId, await applyApproval({
            keywordId: wordId,
            brandId: selectedBrandId,
            keyword: item.keyword,
            intent: item.intent,
            volumeSearch: item.volume_search,
            resultsAllintitle: item.results_allintitle,
            kgrScore: item.kgr_score,
            listaId: item.lista_id,
            semantic: item.analise_semantica || null,
            approvedAt: aprovadoEm,
            approvedBy: session?.user?.id || "usuario",
          }) as KeywordSemantic);
        }
        for (const [wordId, semantica] of semanticaPorId) {
          const { error: approvalError } = await supabase
            .from("minerador_keywords")
            .update({ status: normalizedStatus, analise_semantica: semantica })
            .eq("id", wordId)
            .eq("brand_id", selectedBrandId)
            .is("deleted_at", null);
          if (approvalError) throw approvalError;
        }
      } else {
        const { error } = await supabase
            .from("minerador_keywords")
          .update({ status: normalizedStatus })
          .in("id", idsToUpdate)
          .eq("brand_id", selectedBrandId)
          .is("deleted_at", null);

        if (error) throw error;
      }

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id)
        ? { ...k, status: normalizedStatus, ...(semanticaPorId.has(k.id) ? { analise_semantica: semanticaPorId.get(k.id) } : {}) }
        : k));
      // Motivo da aprovação: o Volume valeu pela resposta sem média oficial.
      const semMediaOficial = normalizedStatus === "aprovado"
        ? idsToUpdate.filter(wordId => {
          const item = keywords.find(k => k.id === wordId);
          return resolveApprovalReadiness({
            semantic: item?.analise_semantica || null,
            intent: item?.intent,
            volumeSearch: item?.volume_search,
            resultsAllintitle: item?.results_allintitle,
          }).notes?.includes(VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE);
        }).length
        : 0;
      const notaSemMedia = semMediaOficial > 0 ? ` ${VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE} em ${semMediaOficial} keyword(s).` : "";
      showNotification("success", `Status atualizado para ${idsToUpdate.length} palavra(s). ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}${notaSemMedia}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao salvar status.");
    }
  };

  const handleBatchStatus = async (status: string) => {
    if (selectedIds.size === 0) return;
    await handleUpdateStatus(null, status);
  };

  // Decisão humana de aplicabilidade do KGR sobre a seleção atual. Cada
  // keyword passa pelo mesmo contrato da Revisão Humana usado linha a linha;
  // a decisão nunca altera score, Volume, Resultado nem status editorial.
  const handleBatchKgrApplicability = async (applicability: KgrApplicability) => {
    if (selectedIds.size === 0 || !selectedBrandId) return;
    const actorId = session?.user?.email || session?.user?.id || "local-user";
    const decidedAt = new Date().toISOString();
    // O Assunto anula o KGR: sai do lote antes do plano, e o aviso conta.
    const { eligible, subjects } = partitionSubjectKeywords(keywords.filter(item => selectedIds.has(item.id)));
    const withSubjectNotice = (text: string) => [text, describeSubjectSkipped(subjects.length, "KGR")].filter(Boolean).join(" ");
    const plan = planKgrApplicabilityBatch(
      eligible,
      applicability,
      { actorId, decidedAt, openDraftIds: Object.keys(humanReviewDrafts) },
    );
    if (plan.updates.length === 0) {
      showNotification("info", withSubjectNotice(describeKgrApplicabilityBatch(plan, 0)));
      return;
    }
    const executionRequestId = crypto.randomUUID();
    const targetIds = plan.updates.map(update => update.id);
    if (!startBulkProgress("review", plan.updates.length, targetIds, executionRequestId)) return;
    pushKeywordsHistory(keywords, `Definir aplicabilidade do KGR de ${plan.updates.length} keyword(s) como ${kgrApplicabilityLabel(applicability)}`);
    setUpdating(true);
    let outcome: "success" | "error" = "success";
    const persistedIds: string[] = [];
    let confirmedIds: string[] = [];
    let batch: BatchProgressSnapshot | null = null;
    try {
      batch = await runBulkBatch({
        label: "KGR",
        items: plan.updates,
        itemId: update => update.id,
        chunkSize: 1,
        concurrency: BULK_WRITE_CONCURRENCY,
        runChunk: async chunk => Promise.all(chunk.map(async (update): Promise<BatchItemOutcome> => {
          const { error } = await supabase
            .from("minerador_keywords")
            .update({ analise_semantica: update.semantic })
            .eq("id", update.id)
            .eq("brand_id", selectedBrandId)
            .is("deleted_at", null);
          if (error) return { id: update.id, status: "failed", reason: describeBatchWriteError(error) };
          persistedIds.push(update.id);
          return { id: update.id, status: "succeeded" };
        })),
      });
      const persistedById = persistedIds.length > 0 ? await readCanonicalKeywordRows(persistedIds) : new Map<string, KeywordItem>();
      const unconfirmed = persistedIds.filter(id => {
        const row = persistedById.get(id);
        return !row || readKgrApplicability(row.analise_semantica) !== applicability;
      });
      setKeywords(current => current.map(item => persistedById.get(item.id) || item));
      batch = reclassifyBatchItemsAsFailed(batch, unconfirmed, "gravado, mas o readback canônico não confirmou");
      confirmedIds = persistedIds.filter(id => !unconfirmed.includes(id));
      settleBatchAttempts("review", targetIds, confirmedIds, batch, executionRequestId);
      if (batch.status === "completed") {
        showNotification("success", withSubjectNotice(describeKgrApplicabilityBatch(plan, confirmedIds.length)), { metadata: { executionRequestId } });
      } else {
        outcome = "error";
        showNotification(confirmedIds.length > 0 ? "warning" : "error", withSubjectNotice(`${formatBatchProgress(batch)}. ${confirmedIds.length} de ${plan.updates.length} keyword(s) foram atualizadas.`), { details: batchFailureDetails(batch), metadata: { executionRequestId, failures: batch.failures } });
      }
    } catch (error) {
      outcome = "error";
      if (batch) batch = reclassifyBatchItemsAsFailed(batch, persistedIds.filter(id => !confirmedIds.includes(id)), "gravado, mas o readback falhou");
      settleBatchAttempts("review", targetIds, confirmedIds, batch, executionRequestId);
      console.error("Erro ao definir aplicabilidade do KGR em lote:", error);
      showNotification("error", `${error instanceof Error ? error.message : "Não foi possível salvar a aplicabilidade do KGR."} ${persistedIds.length} de ${plan.updates.length} keyword(s) foram gravadas, sem conferência.`, { metadata: { executionRequestId } });
    } finally {
      setUpdating(false);
      finishBulkProgress(outcome, batch ? formatBatchProgress(batch) : undefined, batch ? batchFailureViews(batch) : undefined);
    }
  };

  // Conclusão da Revisão Humana sobre a seleção atual, com o mesmo contrato da
  // conclusão individual: defaults conservadores para itens sem decisão e
  // aplicabilidade do KGR obrigatória quando o cálculo é possível. Concluir não
  // altera status, aprovação, handoff nem métricas.
  const handleBatchCompleteHumanReview = async () => {
    if (selectedIds.size === 0 || !selectedBrandId) return;
    const actorId = session?.user?.email || session?.user?.id || "local-user";
    const completedAt = new Date().toISOString();
    const plan = planHumanReviewCompletionBatch(
      keywords.filter(item => selectedIds.has(item.id)),
      { actorId, completedAt, openDraftIds: Object.keys(humanReviewDrafts) },
    );
    if (plan.updates.length === 0) {
      showNotification("info", describeHumanReviewCompletionBatch(plan, 0));
      return;
    }
    const executionRequestId = crypto.randomUUID();
    const targetIds = plan.updates.map(update => update.id);
    if (!startBulkProgress("review", plan.updates.length, targetIds, executionRequestId)) return;
    pushKeywordsHistory(keywords, `Concluir revisão humana de ${plan.updates.length} keyword(s)`);
    setUpdating(true);
    let outcome: "success" | "error" = "success";
    const persistedIds: string[] = [];
    let confirmedIds: string[] = [];
    let batch: BatchProgressSnapshot | null = null;
    try {
      batch = await runBulkBatch({
        label: "Revisão",
        items: plan.updates,
        itemId: update => update.id,
        chunkSize: 1,
        concurrency: BULK_WRITE_CONCURRENCY,
        runChunk: async chunk => Promise.all(chunk.map(async (update): Promise<BatchItemOutcome> => {
          const { error } = await supabase
            .from("minerador_keywords")
            .update({ analise_semantica: update.semantic })
            .eq("id", update.id)
            .eq("brand_id", selectedBrandId)
            .is("deleted_at", null);
          if (error) return { id: update.id, status: "failed", reason: describeBatchWriteError(error) };
          persistedIds.push(update.id);
          return { id: update.id, status: "succeeded" };
        })),
      });
      const persistedById = persistedIds.length > 0 ? await readCanonicalKeywordRows(persistedIds) : new Map<string, KeywordItem>();
      const unconfirmed = persistedIds.filter(id => {
        const row = persistedById.get(id);
        return !row || humanReviewRecord(row.analise_semantica).status !== "completed";
      });
      setKeywords(current => current.map(item => persistedById.get(item.id) || item));
      batch = reclassifyBatchItemsAsFailed(batch, unconfirmed, "gravado, mas o readback canônico não confirmou");
      confirmedIds = persistedIds.filter(id => !unconfirmed.includes(id));
      settleBatchAttempts("review", targetIds, confirmedIds, batch, executionRequestId);
      if (batch.status === "completed") {
        showNotification("success", describeHumanReviewCompletionBatch(plan, confirmedIds.length), { metadata: { executionRequestId } });
      } else {
        outcome = "error";
        showNotification(confirmedIds.length > 0 ? "warning" : "error", `${formatBatchProgress(batch)}. ${confirmedIds.length} de ${plan.updates.length} keyword(s) foram concluídas.`, { details: batchFailureDetails(batch), metadata: { executionRequestId, failures: batch.failures } });
      }
    } catch (error) {
      outcome = "error";
      if (batch) batch = reclassifyBatchItemsAsFailed(batch, persistedIds.filter(id => !confirmedIds.includes(id)), "gravado, mas o readback falhou");
      settleBatchAttempts("review", targetIds, confirmedIds, batch, executionRequestId);
      console.error("Erro ao concluir revisão humana em lote:", error);
      showNotification("error", `${error instanceof Error ? error.message : "Não foi possível concluir a revisão humana."} ${persistedIds.length} de ${plan.updates.length} keyword(s) foram gravadas, sem conferência.`, { metadata: { executionRequestId } });
    } finally {
      setUpdating(false);
      finishBulkProgress(outcome, batch ? formatBatchProgress(batch) : undefined, batch ? batchFailureViews(batch) : undefined);
    }
  };

  const handleToggleSelectAll = () => {
    selection.toggleVisible();
    setQualificationResults([]);
  };


  const handleBatchSendToArchitect = async () => {
    if (!selectedBrandId || selectedIds.size === 0) return;
    if (!architectHandoffGate.ok) {
      showNotification("info", architectHandoffGate.reason, {
        code: "ARCHITECT_HANDOFF_GATE",
        stage: "handoff_precondition",
      });
      return;
    }

    setArchitectHandoffSending(true);
    try {
      const result = await persistMineradorArquitetoHandoff({
        brandId: selectedBrandId,
        keywordIds: [...selectedIds],
      });
      // F1.7: aprovação anterior à trava de envio passa, com alerta informativo.
      const approvalAlerts = architectHandoffGate.approvalAlerts || [];
      const approvalAlertText = approvalAlerts.length
        ? ` ${approvalAlerts.length === 1 ? "1 keyword passou" : `${approvalAlerts.length} keywords passaram`} com alerta de aprovação: ${approvalAlerts[0].approvalGate?.reason || "aprovação anterior à trava de envio."}`
        : "";
      if (result.persistence === "UNCHANGED") {
        showNotification("success", `As keywords selecionadas já estavam no workspace canônico do Arquiteto.${approvalAlertText}`);
      } else {
        showNotification("success", `${result.createdKeywordIds.length} keyword(s) enviada(s) ao Arquiteto.${approvalAlertText}`);
      }
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível enviar as keywords ao Arquiteto.", {
        code: "ARCHITECT_HANDOFF_FAILED",
        stage: "handoff",
      });
    } finally {
      setArchitectHandoffSending(false);
    }
  };

  const handlePrimaryKeywordPolicyChange = async (item: KeywordItem, policy: Extract<PrimaryKeywordPolicy, "locked" | "reviewable">) => {
    if (!keywordPublicationProtected(item)) return;
    const currentPolicy = readPrimaryKeywordPolicy({
      publicationDeclared: readPublicationLink({ status: item.status, evidence: readSiteOrigin(item.analise_semantica) }).state === "published",
      status: item.status,
      semantic: item.analise_semantica,
    });
    if (currentPolicy === policy) return;
    const policyLabel = primaryKeywordPolicyLabel(policy);
    if (!window.confirm(`${policyLabel}. A URL, o slug, o canonical e a keyword atual permanecerão protegidos. Confirmar política?`)) return;
    const actorId = session?.user?.email || "local-user";
    const changedAt = new Date().toISOString();
    const formalPublication = readPublicationLink({ status: item.status, evidence: readSiteOrigin(item.analise_semantica) }).state === "published";
    const semantic = setPrimaryKeywordPolicy(item.analise_semantica, { status: item.status, publicationConfirmed: formalPublication, keyword: item.keyword, policy, actorId, changedAt });
    setUpdating(true);
    try {
      const { error } = await supabase.from("minerador_keywords").update({ analise_semantica: semantic }).eq("id", item.id).eq("brand_id", selectedBrandId).is("deleted_at", null);
      if (error) throw error;
      pushKeywordsHistory(keywords, `Alterar política da principal de ${item.keyword}`);
      setKeywords(current => current.map(keyword => keyword.id === item.id ? { ...keyword, analise_semantica: semantic } : keyword));
      showNotification("success", `${policyLabel} registrada; a identidade publicada foi preservada.`);
    } catch (error) {
      console.error("Erro ao salvar política da keyword principal:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar a política da principal.");
    } finally {
      setUpdating(false);
    }
  };

  const handleHumanReviewAction = async (keywordId: string, action: HumanReviewAction) => {
    const item = keywords.find(keyword => keyword.id === keywordId);
    if (!item || !selectedBrandId) return;

    if (action.type === "subject") {
      // Terceira declaração do Vínculo: grava direto, como o tipo de página,
      // com readback estreito e o ator da sessão.
      await handleSubjectReviewAction(item, action);
      return;
    }

    const cloneSemantic =(source: KeywordSemantic): KeywordSemantic => JSON.parse(JSON.stringify(source)) as KeywordSemantic;
    const materialSemantic = (source: KeywordSemantic): KeywordSemantic => {
      const next = cloneSemantic(source);
      delete next.dna_revisao_humana;
      delete next.dna_revisao_humana_por;
      delete next.dna_revisao_humana_em;
      delete next.kgr_decidido_por;
      delete next.kgr_decidido_em;
      const review = next.human_review && typeof next.human_review === "object" && !Array.isArray(next.human_review)
        ? next.human_review as Record<string, unknown>
        : null;
      if (review) {
        delete review.status;
        delete review.decision;
        delete review.pendingFields;
        delete review.completedAt;
        delete review.completedBy;
        if (Array.isArray(review.fieldDecisions)) {
          review.fieldDecisions = review.fieldDecisions.map(entry => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
            const decision = { ...(entry as Record<string, unknown>) };
            delete decision.actorId;
            delete decision.decidedAt;
            return decision;
          });
        }
      }
      return next;
    };
    const draft = humanReviewDrafts[keywordId];
    const baseSemantic = item.analise_semantica || {};

    if (action.type === "page_type") {
      // Declaração livre: informa o Arquiteto, não trava o Minerador. O peso
      // (potencial/declarado) vai junto; o ator é o auth.users.id da sessão.
      const pageTypeActorId = actorUserId;
      if (!isKeywordSubjectActorId(pageTypeActorId)) {
        showNotification("error", "Declarar o Potencial de página exige o usuário autenticado. Entre de novo e repita.", { code: "PAGE_TYPE_ACTOR_REQUIRED" });
        return;
      }
      const evidence = readSiteOrigin(item.analise_semantica);
      const applied = setKeywordPageType(item.analise_semantica, {
        pageType: action.pageType,
        ...(action.stance ? { stance: action.stance } : {}),
        actorId: pageTypeActorId,
        changedAt: new Date().toISOString(),
        siteRole: evidence?.siteRole,
        published: readPublicationLink({ status: item.status, evidence }).state === "published",
      });
      if (!applied.changed) {
        if (applied.reason) showNotification("error", applied.reason);
        return;
      }
      setUpdating(true);
      try {
        const { error } = await supabase.from("minerador_keywords").update({ analise_semantica: applied.semantic }).eq("id", item.id).eq("brand_id", selectedBrandId).is("deleted_at", null);
        if (error) throw error;
        // Readback estreito: só as declarações do Vínculo, nunca a linha inteira.
        const { data: readback, error: readbackError } = await supabase
          .from("minerador_keywords")
          .select(VINCULO_BATCH_READBACK_COLUMNS)
          .eq("id", item.id)
          .eq("brand_id", selectedBrandId)
          .is("deleted_at", null)
          .maybeSingle();
        if (readbackError) throw readbackError;
        const pageTypeUpdate = { id: item.id, brandId: selectedBrandId, keyword: item.keyword, semantic: applied.semantic, demotesApproval: false };
        if (!vinculoReadbackConfirmed(pageTypeUpdate, readback as VinculoBatchReadbackRow | null)) {
          throw new Error("O Potencial de página foi enviado, mas o readback não confirmou a declaração nesta marca.");
        }
        pushKeywordsHistory(keywords, `Potencial de página de ${item.keyword}`);
        setKeywords(current => current.map(keyword => keyword.id === item.id ? { ...keyword, analise_semantica: applied.semantic as KeywordSemantic } : keyword));
        // A revisão aberta guarda a própria cópia do DNA: leva o tipo e o peso
        // para ela, senão "Concluir" gravaria de volta o valor antigo.
        const pageTypeKeys = Object.fromEntries(PAGE_TYPE_DRAFT_KEYS.filter(key => key in applied.semantic).map(key => [key, applied.semantic[key]]));
        setHumanReviewDrafts(current => current[item.id]
          ? { ...current, [item.id]: { ...current[item.id], semantic: { ...current[item.id].semantic, ...pageTypeKeys } as KeywordSemantic } }
          : current);
        showNotification("success", `Potencial de página gravado e conferido:${action.stance ? keywordPageTypeStanding(action.pageType, { declared: action.stance === "declared" }) : keywordPageTypeLabel(action.pageType)}.`);
      } catch (error) {
        showNotification("error", error instanceof Error ? error.message : "Não foi possível declarar o tipo de página.");
      } finally {
        setUpdating(false);
      }
      return;
    }

    if (action.type === "primary_policy") {
      // O posto é declaração sobre a publicação, não campo do DNA: vai pelo
      // mesmo caminho da ação de vínculo, com histórico e readback próprios.
      await handlePrimaryKeywordPolicyChange(item, action.policy);
      return;
    }

    if (action.type === "reopen") {
      setHumanReviewDrafts(current => ({
        ...current,
        [keywordId]: { semantic: cloneSemantic(baseSemantic), intent: item.intent },
      }));
      setExpandedRowId(keywordId);
      setHumanReviewOpenId(keywordId);
      showNotification("info", "Revisão reaberta. Os fatos medidos permanecem somente leitura; conclua ou cancele para sair da edição.");
      return;
    }

    if (action.type === "cancel") {
      setHumanReviewDrafts(current => {
        const next = { ...current };
        delete next[keywordId];
        return next;
      });
      setHumanReviewOpenId(null);
      showNotification("info", "Edição da revisão cancelada. A última consolidação válida foi preservada.");
      return;
    }

    const actorId = session?.user?.email || session?.user?.id || "local-user";
    const now = new Date().toISOString();
    const currentSemantic = draft?.semantic || baseSemantic;
    const currentIntent = draft?.intent ?? item.intent;
    let nextSemantic = currentSemantic;
    let nextIntent = currentIntent;

    if (action.type === "field") {
      const result = applyHumanReviewField({
        semantic: currentSemantic,
        intent: currentIntent,
        field: action.field,
        logicalValue: action.logicalValue,
        decision: action.decision,
        editedValue: action.editedValue,
        actorId,
        decidedAt: now,
      });
      nextSemantic = result.semantic;
      nextIntent = result.intent;
    } else if (action.type === "kgr") {
      nextSemantic = applyHumanReviewKgrApplicability({ semantic: currentSemantic, applicability: action.applicability, actorId, decidedAt: now });
    } else if (action.type === "complete") {
      const completion = canCompleteHumanReview(currentSemantic, { intent: currentIntent });
      if (!completion.ok) {
        showNotification("info", completion.reason || "Há pendências na revisão humana.");
        return;
      }
      // The button stays actionable: when the KGR applicability is still a
      // human decision, the click points to that field instead of inventing
      // "aplicável"/"não aplicável" or blocking the review beforehand.
      if (completion.pendingKgrDecision) {
        setExpandedRowId(keywordId);
        setHumanReviewOpenId(keywordId);
        showNotification("info", "Escolha a Aplicabilidade do KGR no painel de Revisão Humana para concluir.");
        return;
      }
      // A completed and current review is its own artifact: reopening and
      // concluding it without material edits stays a no-op instead of
      // fabricating a new version. A stale review is a different case — the
      // conclusion rebinds the consolidation to the current AI snapshot.
      const wasAlreadyCompleted = resolveMineradorProcessState(item).review.complete;
      const draftHasChanges = JSON.stringify(materialSemantic(currentSemantic)) !== JSON.stringify(materialSemantic(baseSemantic)) || currentIntent !== item.intent;
      if (draft && wasAlreadyCompleted && !draftHasChanges) {
        setHumanReviewDrafts(current => {
          const next = { ...current };
          delete next[keywordId];
          return next;
        });
        showNotification("info", "Nenhuma alteração nova foi encontrada; a consolidação existente foi mantida.");
        return;
      }
      nextSemantic = completeHumanReview({ semantic: currentSemantic, intent: currentIntent, actorId, completedAt: now });
    }

    if (draft && action.type !== "complete") {
      setHumanReviewDrafts(current => ({ ...current, [keywordId]: { semantic: nextSemantic as KeywordSemantic, intent: nextIntent } }));
      showNotification("info", "Alteração mantida na revisão aberta. Conclua a revisão para salvar a nova consolidação.");
      return;
    }

    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("review", 1, [keywordId], executionRequestId)) return;
    let outcome: "success" | "error" = "success";
    setUpdating(true);
    try {
      const payload: Record<string, unknown> = { analise_semantica: nextSemantic };
      if ((action.type === "field" || draft) && nextIntent !== item.intent) payload.intent = nextIntent;
      const { error } = await supabase.from("minerador_keywords").update(payload).eq("id", keywordId).eq("brand_id", selectedBrandId).is("deleted_at", null);
      if (error) throw error;
      const persistedById = await readCanonicalKeywordRows([keywordId]);
      const readbackItem = persistedById.get(keywordId);
      // The readback confirms that the human artifact was persisted for this
      // keyword. Freshness against the current AI snapshot is a separate
      // projection and never turns a persisted consolidation into a failure.
      const persistedReview = readbackItem ? humanReviewRecord(readbackItem.analise_semantica) : null;
      if (!readbackItem || !persistedReview) throw new Error("A decisão humana foi salva, mas o readback canônico não foi confirmado.");
      if (action.type === "complete" && persistedReview.status !== "completed") throw new Error("A revisão humana foi salva, mas não passou pelo gate de confirmação do DNA atual.");
      pushKeywordsHistory(keywords, action.type === "complete" ? `Concluir revisão humana de ${item.keyword}` : `Atualizar revisão humana de ${item.keyword}`);
      setProcessAttempt([keywordId], "review", "success", executionRequestId);
      setKeywords(current => current.map(keyword => keyword.id === keywordId ? readbackItem : keyword));
      if (draft) {
        setHumanReviewDrafts(current => {
          const next = { ...current };
          delete next[keywordId];
          return next;
        });
      }
      showNotification("success", action.type === "complete" ? "Revisão humana concluída; o DNA foi confirmado." : "Decisão humana registrada no DNA.", { metadata: { executionRequestId } });
    } catch (error) {
      outcome = "error";
      setProcessAttempt([keywordId], "review", "failed", executionRequestId);
      console.error("Erro ao salvar revisão humana:", error);
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar a revisão humana.", { metadata: { executionRequestId } });
    } finally {
      setUpdating(false);
      finishBulkProgress(outcome);
    }
  };

  /** Somente por ação explícita do usuário: nunca em mount, F5 ou background. */
  const handleOpenHumanReview = () => {
    const firstSelectedId = Array.from(selectedIds)[0];
    if (!firstSelectedId) return;
    const executionRequestId = crypto.randomUUID();
    if (!startBulkProgress("review", 1, [firstSelectedId], executionRequestId)) return;
    setExpandedRowId(firstSelectedId);
    setHumanReviewOpenId(firstSelectedId);
    bulkProgressResetTimerRef.current = window.setTimeout(() => {
      setProcessAttempt([firstSelectedId], "review", "success", executionRequestId);
      finishBulkProgress("success", "Revisão pronta");
    }, 180);
  };

  // Ação em lote: Resultados (DataForSEO) em blocos progressivos. A rota paga
  // recebe um bloco por vez, cada bloco com o seu operationRequestId; bloco
  // que falha é contado e o lote segue; nada é repetido automaticamente.
  const handleBatchAllintitle = async () => {
    if (allintitleMeasuring || selectedIds.size === 0 || !selectedBrandId) return;
    const brandId = selectedBrandId;
    const operationRequestId = crypto.randomUUID();
    const keywordIds = [...selectedIds];
    if (keywordIds.length > RESULTS_BATCH_MAX_TARGETS) {
      showNotification("error", "O lote de allintitle excede o limite operacional de 1.000 alvos. Selecione menos keywords.", { code: "DATAFORSEO_BATCH_LIMIT" });
      return;
    }
    if (!startBulkProgress("results", keywordIds.length, keywordIds, operationRequestId)) return;
    let outcome: "success" | "error" = "success";
    setAllintitleMeasuring(true);
    setUpdating(true);
    type ResultsSemanticEvidence = { keywordId?: string | null; serpEvidence?: SerpSemanticEvidence | null; serpError?: { code?: string; message?: string } | null };
    const collectedEvidences: ResultsSemanticEvidence[] = [];
    const collectedQualificationOutcomes: Array<{ keywordId?: string | null; persisted?: boolean }> = [];
    const touchedIds = new Set<string>();
    const confirmedAll = new Set<string>();
    const chunkRequestIds: string[] = [];
    const totals: { persisted: number; overviewPartialMessage: string | null; lastFailure: { code: string; stage: string; diagnostic?: Record<string, unknown> } | null } = { persisted: 0, overviewPartialMessage: null, lastFailure: null };
    let batch: BatchProgressSnapshot | null = null;
    try {
      batch = await runBulkBatch({
        label: "Resultados",
        items: keywordIds,
        itemId: id => id,
        chunkSize: RESULTS_BATCH_CHUNK_SIZE,
        concurrency: 1,
        runChunk: async chunkIds => {
          const chunkRequestId = crypto.randomUUID();
          chunkRequestIds.push(chunkRequestId);
          for (const id of chunkIds) touchedIds.add(id);
          const measureChunk = async (): Promise<BatchChunkResult> => {
            // Falha de rede não é repetida: o servidor pode ter medido e cobrado.
            const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/dataforseo/allintitle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywordIds: chunkIds, operationRequestId: chunkRequestId }) }).catch(() => null);
            if (!response) {
              setProcessAttempt(chunkIds, "results", "failed", chunkRequestId);
              return chunkIds.map(id => ({ id, status: "failed" as const, reason: BATCH_NO_SERVER_CONFIRMATION }));
            }
            const data = await response.json().catch(() => null);
            const failureById = new Map<string, string>((Array.isArray(data?.failures) ? data.failures as Array<{ targetId?: unknown; message?: unknown; code?: unknown }> : [])
              .filter(item => typeof item?.targetId === "string")
              .map(item => [String(item.targetId), String(item.message || item.code || "sem medição confirmada")]));
            if (!response.ok || !data?.success) {
              const code = typeof data?.code === "string" ? data.code : "dataforseo_request_failed";
              totals.lastFailure = { code, stage: typeof data?.stage === "string" ? data.stage : "provider_request", diagnostic: data?.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic : undefined };
              setProcessAttempt(chunkIds, "results", "failed", chunkRequestId);
              const reason = typeof data?.message === "string" && data.message ? data.message : "A medição allintitle não foi concluída.";
              const stop = response.status === 401 || response.status === 403 || code === "BRAND_NOT_FOUND" ? reason : null;
              return { outcomes: chunkIds.map(id => ({ id, status: "failed" as const, reason: failureById.get(id) || reason })), stop };
            }
            const projections = Array.isArray(data.projections) ? data.projections as Array<{ keywordId?: string | null; measuredAt?: string | null; serpEvidence?: SerpSemanticEvidence | null; serpError?: { code?: string; message?: string } | null }> : [];
            const byKeywordId = new Map(projections.filter(item => typeof item.keywordId === "string").map(item => [item.keywordId!, item]));
            // The provider projection is feedback only. The table changes only from
            // the tenant-scoped canonical readback after persistence succeeds.
            let confirmedIds: string[] = [];
            if (byKeywordId.size > 0) {
              const persistedByKeywordId = await readCanonicalKeywordRows([...byKeywordId.keys()]);
              confirmedIds = [...persistedByKeywordId.entries()]
                .filter(([id, row]) => {
                  const projectionMeasuredAt = byKeywordId.get(id)?.measuredAt;
                  const measurement = row.analise_semantica?.allintitle_measurement;
                  return resolveMineradorProcessState(row).results.complete
                    && typeof projectionMeasuredAt === "string"
                    && measurement && typeof measurement.measuredAt === "string"
                    && measurement.measuredAt === projectionMeasuredAt;
                })
                .map(([id]) => id);
              setKeywords(current => current.map(item => confirmedIds.includes(item.id) ? persistedByKeywordId.get(item.id)! : item));
            }
            setProcessAttempt(confirmedIds, "results", "success", chunkRequestId);
            setProcessAttempt(chunkIds.filter(id => !confirmedIds.includes(id)), "results", "failed", chunkRequestId);
            for (const id of confirmedIds) confirmedAll.add(id);
            // A evidência da SERP natural é um artefato independente da medição: ela
            // alimenta a working copy da Qualificação Semântica sem tocar Resultado,
            // KGR ou KeywordDNA persistido.
            const semanticEvidences = Array.isArray(data.semanticEvidences) ? data.semanticEvidences as ResultsSemanticEvidence[] : [];
            const serpFailedIds = new Set<string>();
            for (const projection of semanticEvidences) {
              const keywordId = typeof projection.keywordId === "string" ? projection.keywordId : null;
              if (!keywordId) continue;
              if (projection.serpError) serpFailedIds.add(keywordId);
            }
            setSerpCollectionFailures(current => {
              const next = { ...current };
              for (const id of chunkIds) {
                if (serpFailedIds.has(id)) next[id] = true;
                else if (semanticEvidences.some(projection => projection.keywordId === id && projection.serpEvidence)) delete next[id];
              }
              return next;
            });
            collectedEvidences.push(...semanticEvidences);
            if (Array.isArray(data.semanticQualifications)) collectedQualificationOutcomes.push(...data.semanticQualifications as Array<{ keywordId?: string | null; persisted?: boolean }>);
            totals.persisted += typeof data.persistedCount === "number" ? data.persistedCount : byKeywordId.size;
            if (data.code === "DATAFORSEO_OVERVIEW_PARTIAL") totals.overviewPartialMessage = typeof data.message === "string" ? data.message : `${byKeywordId.size} resultado(s) persistidos; alguns KD(s) não foram retornados.`;
            return chunkIds.map(id => confirmedIds.includes(id)
              ? { id, status: "succeeded" as const }
              : { id, status: "failed" as const, reason: failureById.get(id) || (byKeywordId.has(id) ? "medição recebida, mas o readback não confirmou; confira antes de repetir" : "sem medição confirmada") });
          };
          // Exceção inesperada no bloco: as tentativas dele não ficam "rodando".
          return measureChunk().catch((chunkError: unknown) => {
            setProcessAttempt(chunkIds.filter(id => !confirmedAll.has(id)), "results", "failed", chunkRequestId);
            throw chunkError;
          });
        },
      });
      // O read-model só avança para a nova versão depois do write confirmado:
      // a Qualificação vem do artifact persistido, nunca da working copy.
      const qualificationOutcomes = collectedQualificationOutcomes;
      const persistedQualificationIds = qualificationOutcomes.filter(item => item?.persisted).map(item => String(item.keywordId)).filter(Boolean);
      const qualificationFailedCount = qualificationOutcomes.filter(item => item && !item.persisted).length;
      if (persistedQualificationIds.length > 0 && selectedBrandId) {
        const refreshed = await loadSemanticQualifications(selectedBrandId, persistedQualificationIds);
        setSemanticQualifications(current => ({ ...current, ...refreshed }));
        setSemanticConsolidationDrafts(current => {
          const next = { ...current };
          for (const [keywordId, qualification] of Object.entries(refreshed)) {
            const keyword = keywords.find(item => item.id === keywordId);
            const logic = keyword ? readCanonicalKeywordDna(keyword, { includeSerpEvidence: false }) : null;
            next[keywordId] = semanticDraftFromQualification(qualification, { intent: logic?.intent ?? null, funnel: logic?.funnel ?? null });
          }
          return next;
        });
      }
      // Resumo agregado da ação: uma notificação por lote, sem esconder a CALL 3.
      const semanticEvidences = collectedEvidences;
      const serpAnalyzedCount = semanticEvidences.filter(projection => projection.serpEvidence).length;
      const serpConsolidatedCount = semanticEvidences.filter(projection => projection.serpEvidence
        && (isConclusiveSerpEvidence(projection.serpEvidence.intent) || isConclusiveSerpEvidence(projection.serpEvidence.funnel))).length;
      const serpFailedCount = semanticEvidences.filter(projection => projection.serpError).length;
      const persistedCount = totals.persisted;
      const requestedCount = keywordIds.length;
      const batchSummary = formatBatchProgress(batch);
      const metadata = { executionRequestId: operationRequestId, operationRequestId, chunkRequestIds };
      // Resumo dos blocos no mesmo formato da resposta de um bloco.
      const data = {
        code: batch.status !== "completed" ? "DATAFORSEO_PARTIAL_RESULTS" : totals.overviewPartialMessage !== null ? "DATAFORSEO_OVERVIEW_PARTIAL" : null,
        stage: totals.lastFailure?.stage || "response_normalization",
        message: totals.overviewPartialMessage,
        diagnostic: totals.lastFailure?.diagnostic,
      };
      if (data.code === "DATAFORSEO_PARTIAL_RESULTS") {
        outcome = "error";
        showNotification(persistedCount > 0 ? "warning" : "error", `${batchSummary}. ${persistedCount} de ${requestedCount} resultados allintitle foram persistidos; as demais medições foram preservadas.`, { code: totals.lastFailure?.code || data.code, stage: data.stage, diagnostic: data.diagnostic, details: batchFailureDetails(batch), metadata: { ...metadata, failures: batch.failures } });
      }
      else if (data.code === "DATAFORSEO_OVERVIEW_PARTIAL") {
        showNotification("info", data.message || `${persistedCount} resultado(s) persistidos; alguns KD(s) não foram retornados.`, { code: data.code, stage: data.stage, metadata });
      }
      else if (serpFailedCount > 0) {
        // Sucesso parcial honesto: as medições valem, a SERP não.
        showNotification("info", `Resultados atualizados para ${persistedCount} keyword(s); a coleta da SERP falhou para ${serpFailedCount} keyword(s).`, { code: "DATAFORSEO_SERP_PARTIAL", stage: "semantic_serp", metadata });
      }
      else if (qualificationFailedCount > 0) {
        // Provider passou, persistência semântica não: nada de sucesso falso.
        showNotification("info", `Resultados atualizados para ${persistedCount} keyword(s), mas não foi possível persistir a Qualificação Semântica de ${qualificationFailedCount} keyword(s).`, { code: "SEMANTIC_QUALIFICATION_PERSISTENCE_FAILED", stage: "semantic_qualification_persistence", metadata });
      }
      else if (persistedQualificationIds.length > 0) {
        const serpSummary = serpConsolidatedCount > 0
          ? ` SERP consolidada para ${serpConsolidatedCount} keyword(s).`
          : " SERP analisada, mas sem evidência suficiente para consolidar Intenção/Funil.";
        showNotification("success", `Resultados e Qualificação Semântica atualizados para ${persistedCount} keyword(s).${serpSummary}`, { metadata });
      }
      else {
        const serpSummary = serpAnalyzedCount > 0 ? " SERP analisada, mas sem evidência suficiente para consolidar Intenção/Funil." : "";
        showNotification("success", `Resultados atualizados para ${persistedCount} keyword(s).${serpSummary}`, { metadata });
      }
    } catch (err: unknown) {
      outcome = "error";
      setProcessAttempt(keywordIds.filter(id => touchedIds.has(id) && !confirmedAll.has(id)), "results", "failed", operationRequestId);
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "dataforseo_request_failed";
      const stage = err && typeof err === "object" && "stage" in err && typeof (err as { stage?: unknown }).stage === "string" ? (err as { stage: string }).stage : "provider_request";
      const diagnostic = err && typeof err === "object" && "diagnostic" in err && (err as { diagnostic?: unknown }).diagnostic && typeof (err as { diagnostic?: unknown }).diagnostic === "object" ? (err as { diagnostic: Record<string, unknown> }).diagnostic : undefined;
      showNotification("error", `Medição allintitle falhou: ${err instanceof Error ? err.message : "Erro de conexão"}`, { code, stage, diagnostic, metadata: { executionRequestId: operationRequestId, operationRequestId, chunkRequestIds } });
    } finally {
      clearProcessAttempt(keywordIds.filter(id => !touchedIds.has(id)), "results");
      setAllintitleMeasuring(false);
      setUpdating(false);
      finishBulkProgress(outcome, batch ? formatBatchProgress(batch) : undefined, batch ? batchFailureViews(batch) : undefined);
    }
  };

  // Ação em lote: Volume (Google Ads) em blocos progressivos, um por vez.
  // Keyword sem média oficial é "sem dado", não falha; cota atingida para o
  // lote antes do próximo bloco, com o que já voltou gravado.
  const handleBatchQualify = async () => {
    if (selectedIds.size === 0 || volumeMeasuring || !selectedBrandId) return;
    const keywordIds = [...selectedIds];
    const operationRequestId = crypto.randomUUID();
    if (!startBulkProgress("volume", keywordIds.length, keywordIds, operationRequestId)) return;
    let outcome: "success" | "error" = "success";
    setUpdating(true);
    setVolumeMeasuring(true);
    const touchedIds = new Set<string>();
    const confirmedAll = new Set<string>();
    const chunkRequestIds: string[] = [];
    const totals: { persisted: number; quotaReached: boolean; lastFailure: { code: string; stage: string; diagnostic?: Record<string, unknown> } | null } = { persisted: 0, quotaReached: false, lastFailure: null };
    let batch: BatchProgressSnapshot | null = null;
    try {
      batch = await runBulkBatch({
        label: "Volume",
        items: keywordIds,
        itemId: id => id,
        chunkSize: VOLUME_BATCH_CHUNK_SIZE,
        concurrency: 1,
        runChunk: async chunkIds => {
          const chunkRequestId = crypto.randomUUID();
          chunkRequestIds.push(chunkRequestId);
          for (const id of chunkIds) touchedIds.add(id);
          const measureChunk = async (): Promise<BatchChunkResult> => {
            // Falha de rede não é repetida: o servidor pode ter consultado o Google Ads.
            const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(selectedBrandId)}/google-ads/metricas-keywords`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ keywordIds: chunkIds, operationRequestId: chunkRequestId }),
            }).catch(() => null);
            if (!response) {
              setProcessAttempt(chunkIds, "volume", "failed", chunkRequestId);
              return chunkIds.map(id => ({ id, status: "failed" as const, reason: BATCH_NO_SERVER_CONFIRMATION }));
            }
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success) {
              const code = typeof data?.code === "string" ? data.code : "google_ads_volume_request_failed";
              totals.lastFailure = { code, stage: typeof data?.stage === "string" ? data.stage : "volume_provider", diagnostic: data?.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic : undefined };
              setProcessAttempt(chunkIds, "volume", "failed", chunkRequestId);
              if (code === "GOOGLE_ADS_QUOTA") totals.quotaReached = true;
              const reason = code === "GOOGLE_ADS_QUOTA"
                ? "O limite temporário da Google Ads API foi atingido."
                : typeof data?.message === "string" && data.message ? data.message : "Google Ads não retornou uma resposta válida.";
              const stop = code === "GOOGLE_ADS_QUOTA" || response.status === 401 || response.status === 403 ? reason : null;
              return { outcomes: chunkIds.map(id => ({ id, status: "failed" as const, reason })), stop };
            }
            const projections = Array.isArray(data.projections) ? data.projections as Array<{ keywordId?: string; volumeSearch?: number | null; measuredAt?: string | null }> : [];
            const byKeywordId = new Map(projections.filter(item => typeof item.keywordId === "string").map(item => [item.keywordId!, item]));
            const readbackReason = "A medição Google Ads foi recebida, mas o readback canônico não foi confirmado.";
            const persistedByKeywordId = byKeywordId.size > 0
              ? await readCanonicalKeywordRows([...byKeywordId.keys()]).catch((readbackError: unknown) => {
                totals.lastFailure = { code: "PROCESSOR_READBACK_FAILED", stage: "canonical_readback", diagnostic: { cause: readbackError instanceof Error ? readbackError.message : String(readbackError), provider: "google_ads" } };
                return null;
              })
              : new Map<string, KeywordItem>();
            if (!persistedByKeywordId) {
              setProcessAttempt(chunkIds, "volume", "failed", chunkRequestId);
              return chunkIds.map(id => ({ id, status: "failed" as const, reason: readbackReason }));
            }
            const unmatchedIds = new Set(Array.isArray(data.unmatchedKeywordIds) ? (data.unmatchedKeywordIds as unknown[]).map(String) : []);
            // Resposta sem média (projeção com volume null ou keyword que o
            // Google Ads não devolveu) é processo executado, não erro: vira
            // "empty", e a célula lê o "0" apagado do registro gravado.
            const outcomeById = new Map(chunkIds.map(id => {
              const row = persistedByKeywordId.get(id);
              return [id, classifyVolumeReadback({
                projection: byKeywordId.get(id) || null,
                unmatched: unmatchedIds.has(id),
                row: row || null,
                volumeComplete: row ? resolveMineradorProcessState(row).volume.complete : false,
              })] as const;
            }));
            const idsWith = (...outcomes: VolumeReadbackOutcome[]) => chunkIds.filter(id => outcomes.includes(outcomeById.get(id)!));
            const readBackIds = new Set(idsWith("confirmed", "confirmed_empty"));
            setProcessAttempt(idsWith("confirmed", "confirmed_empty", "empty"), "volume", "success", chunkRequestId);
            setProcessAttempt(idsWith("failed"), "volume", "failed", chunkRequestId);
            setKeywords(current => current.map(item => readBackIds.has(item.id) ? persistedByKeywordId.get(item.id)! : item));
            totals.persisted += typeof data.persistedCount === "number" ? data.persistedCount : byKeywordId.size;
            // Sem média também terminou: uma exceção num bloco seguinte não a vira em falha.
            for (const id of idsWith("confirmed", "confirmed_empty", "empty")) confirmedAll.add(id);
            return chunkIds.map(id => {
              const readback = outcomeById.get(id);
              if (readback === "confirmed") return { id, status: "succeeded" as const };
              if (readback === "confirmed_empty" || readback === "empty") return { id, status: "empty" as const, reason: "Google Ads sem média oficial para esta keyword" };
              return { id, status: "failed" as const, reason: byKeywordId.has(id) ? "medição recebida, mas o readback não confirmou" : "sem medição confirmada" };
            });
          };
          // Exceção inesperada no bloco: as tentativas dele não ficam "rodando".
          return measureChunk().catch((chunkError: unknown) => {
            setProcessAttempt(chunkIds.filter(id => !confirmedAll.has(id)), "volume", "failed", chunkRequestId);
            throw chunkError;
          });
        },
      });
      const persistedCount = totals.persisted;
      const requestedCount = keywordIds.length;
      const metadata = { executionRequestId: operationRequestId, operationRequestId, chunkRequestIds };
      if (totals.quotaReached) {
        outcome = "error";
        showNotification("info", `O limite temporário da Google Ads API foi atingido. ${formatBatchProgress(batch)}. Nenhuma métrica anterior foi alterada.`, { code: "GOOGLE_ADS_QUOTA", stage: totals.lastFailure?.stage, diagnostic: totals.lastFailure?.diagnostic, details: batchFailureDetails(batch), metadata });
      } else if (batch.status !== "completed") {
        outcome = "error";
        showNotification(persistedCount > 0 || batch.empty > 0 ? "warning" : "error", `${formatBatchProgress(batch)}. ${batch.succeeded + batch.empty} de ${requestedCount} keywords processadas no Google Ads (${batch.empty} sem média oficial); dados anteriores foram preservados.`, { code: totals.lastFailure?.code || "GOOGLE_ADS_PARTIAL_RESULTS", stage: totals.lastFailure?.stage, diagnostic: totals.lastFailure?.diagnostic, details: batchFailureDetails(batch), metadata: { ...metadata, failures: batch.failures } });
      } else if (batch.empty > 0) {
        // Sem média é processo executado (decisão do dono, 2026-09-25): conta como
        // processada, sem dado, e a keyword segue aprovável. A contagem sai do lote
        // relido, não do persistedCount da rota, que não soma a keyword não devolvida.
        showNotification("info", `${batch.succeeded + batch.empty} de ${requestedCount} keywords processadas no Google Ads; ${batch.empty} sem média oficial ficaram registradas como processadas, sem dado. Dados anteriores foram preservados.`, { code: "GOOGLE_ADS_PARTIAL_RESULTS", stage: "response_normalization", metadata });
      } else {
        showNotification("success", `${persistedCount} métricas Google Ads foram persistidas e refletidas na tabela.`, { metadata });
      }
    } catch (err: unknown) {
      outcome = "error";
      setProcessAttempt(keywordIds.filter(id => touchedIds.has(id) && !confirmedAll.has(id)), "volume", "failed", operationRequestId);
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "google_ads_volume_request_failed";
      const stage = err && typeof err === "object" && "stage" in err && typeof (err as { stage?: unknown }).stage === "string" ? (err as { stage: string }).stage : "volume_provider";
      const diagnostic = err && typeof err === "object" && "diagnostic" in err && (err as { diagnostic?: unknown }).diagnostic && typeof (err as { diagnostic?: unknown }).diagnostic === "object" ? (err as { diagnostic: Record<string, unknown> }).diagnostic : undefined;
      showNotification("error", `Atualização de métricas falhou: ${err instanceof Error ? err.message : "Erro de conexão"}`, { code, stage, diagnostic, metadata: { executionRequestId: operationRequestId, operationRequestId, chunkRequestIds } });
    } finally {
      clearProcessAttempt(keywordIds.filter(id => !touchedIds.has(id)), "volume");
      setVolumeMeasuring(false);
      setUpdating(false);
      finishBulkProgress(outcome, batch ? formatBatchProgress(batch) : undefined, batch ? batchFailureViews(batch) : undefined);
    }
  };

  // Ação em lote: o servidor resolve publicação antes de abrir a confirmação.
  const handleBatchDelete = async (approved = false, requestedIds?: readonly string[]) => {
    if (!selectedBrandId) return false;

    if (approved) {
      if (!deleteReview) return false;
      setDeleteApprovalOpen(false);
      setDeleteSimpleOpen(false);
      const completed = await executeKeywordDeletion(deleteReview);
      if (completed) setDeleteReview(null);
      return completed;
    }

    const ids = requestedIds ? [...new Set(requestedIds)] : [...selectedIds];
    if (ids.length === 0) return false;
    setUpdating(true);
    let review: KeywordDeleteReview;
    try {
      review = await requestKeywordDeletePreview(ids);
    } catch (error) {
      // O servidor devolve a causa tecnica em body.diagnostic; preserva-la aqui e
      // o que permite investigar a falha sem adivinhacao.
      const failure = error && typeof error === "object" ? error as { diagnostic?: unknown } : {};
      const diagnostic = failure.diagnostic && typeof failure.diagnostic === "object" && !Array.isArray(failure.diagnostic)
        ? failure.diagnostic as Record<string, unknown>
        : undefined;
      const code = error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "KEYWORD_DELETE_TRANSACTION_FAILED";
      showNotification("error", "Nada foi apagado: não foi possível confirmar o estado de publicação da seleção.", { code, stage: "publication_resolution", persistent: true, diagnostic });
      return false;
    } finally {
      setUpdating(false);
    }

    setDeleteReview(review);
    if (review.publishedIds.length > 0) {
      setDeleteApprovalOpen(true);
      return false;
    }

    setDeleteSimpleOpen(true);
    return false;
  };

  const organizeFilterLabels = mineradorOrganizationLabels(organizationValues, lists);
  const organizeFilterSummary = mineradorOrganizationButtonSummary(organizeFilterLabels);
  const organizeFilterLabelKey = organizeFilterLabels.join(" · ");
  const organizeFilterTitle = organizeFilterLabels.length > 3 ? organizeFilterLabelKey : undefined;
  const topbarHistoryCount = keywordHistory.entries.length;
  const topbarCanUndo = keywordHistory.canUndo;
  const topbarCanRedo = keywordHistory.canRedo;
  const topbarVisibleKeywordCount = filteredKeywords.length;
  const topbarSelectedCount = selectedIds.size;
  const clearOrganizeFilters = () => {
    setOrderMode("auto");
    setFilterStatus("Todos");
    setFilterIntent("Todos");
    setFilterSiteRelation("Todos");
    setFilterSitePublication("Todos");
    setFilterKgrApplicability("Todos");
    setFilterKgrMeasurement("Todos");
    setFilterVolumeEligibility("Todos");
    setFilterProcess("Todos");
  };

  const { registerControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  useEffect(() => {
    const globalTopbarControls: GlobalTopbarModuleControls = {
      moduleId: "minerador",
      search: {
        getValue: () => searchQuery,
        setValue: (value) => setSearchQuery(value),
      },
      history: {
        getCount: () => keywordHistory.entries.length,
        canUndo: () => topbarCanUndo,
        canRedo: () => topbarCanRedo,
        undo: undoKeywords,
        redo: redoKeywords,
        open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "minerador" } })),
      },
      actions: <div className="flex min-w-0 items-center gap-0.5">
        <KeywordTableOrganizeButton
          className="min-h-8 gap-1 px-2 text-xs font-medium"
          labelClassName="max-xl:hidden"
          aria-expanded={organizeOpen}
          aria-label={organizeFilterSummary}
          onClick={() => setOrganizeOpen(open => !open)}
          title={organizeFilterTitle || "Organizar a planilha"}
        />
        {organizeFilterSummary !== "Organizar" ? <span className="sr-only">{organizeFilterSummary}</span> : null}

        {/* Importar CSV e Colar lista abrem o modal com "Esta lista é"
            (padrão Assunto), o mesmo de antes, agora alcançável pela barra. */}
        {discoverySourceActions}

        <button
          type="button"
          onClick={() => {
            if (topbarSelectedCount === 0) { showNotification("error", "Selecione pelo menos uma palavra-chave para exportar."); return; }
            setExportFileName(`kgr-export-${new Date().toISOString().slice(0, 10)}`);
            setIsExportModalOpen(true);
          }}
          className="flex shrink-0 items-center gap-1 rounded border border-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-500 transition-colors hover:border-emerald-805 hover:text-emerald-450"
          title="Exportar selecionadas para CSV"
        >
          <FileSpreadsheet className="h-3 w-3" />
          <span className="hidden xl:inline">Exportar</span>
        </button>

        <AppMenu active="minerador" countLabel={topbarVisibleKeywordCount > 0 ? `${topbarVisibleKeywordCount} termos` : undefined} />
      </div>,
      tabs: sectionTabs,
    };
    registerControls(globalTopbarControls);
    return () => unregisterControls(globalTopbarControls.moduleId);
  }, [discoverySourceActions, organizeFilterSummary, organizeFilterTitle, organizeOpen, redoKeywords, searchQuery, sectionTabs, showNotification, topbarCanRedo, topbarCanUndo, topbarHistoryCount, topbarSelectedCount, topbarVisibleKeywordCount, undoKeywords, registerControls, unregisterControls, keywordHistory.entries.length]);

  if (sessionStatus === "loading") {
    return (
      <div className="flex h-[calc(100dvh-2.5rem)] items-center justify-center overflow-hidden bg-background font-mono text-foreground">
        <Loader2 className="w-8 h-8 text-context-accent animate-spin" />
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="flex h-[calc(100dvh-2.5rem)] flex-col items-center justify-center overflow-hidden bg-background p-6 text-center font-mono text-foreground">
        <Building2 className="w-12 h-12 text-context-accent mb-3" />
        <h1 className="text-lg font-bold text-foreground uppercase tracking-wider">Minerador KGR</h1>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
          Ãrea restrita. Por favor, faÃ§a login com suas credenciais para acessar a plataforma.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="mt-6 bg-action-accent hover:bg-action-accent/90 text-foreground rounded px-6 py-2.5 font-bold text-sm transition-colors shadow-lg shadow-action-accent/20 cursor-pointer"
        >
          Fazer Login
        </button>
      </div>
    );
  }

  const bulkProgressMeta = bulkProgress.step ? bulkProgressStepMeta[bulkProgress.step] : null;
  const bulkActionProcessing = bulkProgress.status === "processing";
  // Prévia do Vínculo em grupo: o mesmo plano puro que grava, sem escrever
  // nada. O catálogo do destino só é consultado ao confirmar.
  const vinculoBatchDialogActions = vinculoBatchDialog
    ? vinculoBatchActionsFromChoices(vinculoBatchDialog, { note: vinculoBatchDialog.note, destinationUrl: vinculoBatchDialog.destination })
    : null;
  const vinculoBatchPreview = vinculoBatchDialogActions && vinculoBatchDialogActions.length > 0
    ? planVinculoBatchChoices({
      keywords: keywords.filter(item => selectedIds.has(item.id)),
      brandId: selectedBrandId,
      actions: vinculoBatchDialogActions,
      actorId: actorUserId,
      changedAt: VINCULO_BATCH_PREVIEW_AT,
      brandSiteUrl: activeBrand?.site_url || null,
    })
    : null;
  const vinculoBatchPreviewText = vinculoBatchPreview?.ok ? describeVinculoBatchChoicesConfirmation(vinculoBatchPreview, { includeCatalogNotice: false }) : null;
  const vinculoBatchPostLocked = vinculoBatchDialog && vinculoBatchCommon ? vinculoBatchPostDisabled(vinculoBatchDialog, vinculoBatchCommon) : false;
  // O painel lê e grava o que está no banco; a coluna mostra o rascunho de uma
  // Revisão Humana aberta. Com rascunho na seleção, o painel avisa a diferença.
  const vinculoBatchDraftCount = vinculoBatchDialogOpen ? [...selectedIds].filter(id => Boolean(humanReviewDrafts[id])).length : 0;
  const chooseVinculoBatch = (key: VinculoBatchChoiceGroupKey, value: string) => {
    if (!vinculoBatchCommon) return;
    setVinculoBatchDialog(current => current ? chooseVinculoBatchSelect(current, key, value, vinculoBatchCommon) : current);
  };
  // Prévia do KGR em grupo: o mesmo plano puro que grava, sem escrever nada.
  const kgrBatchPreview = kgrBatchConfirm ? (() => {
    const { eligible, subjects } = partitionSubjectKeywords(keywords.filter(item => selectedIds.has(item.id)));
    const plan = planKgrApplicabilityBatch(eligible, kgrBatchConfirm, { actorId: "preview", decidedAt: VINCULO_BATCH_PREVIEW_AT, openDraftIds: Object.keys(humanReviewDrafts) });
    return {
      updates: plan.updates.length,
      summary: plan.updates.length > 0
        ? `${plan.updates.length} keyword(s) terão a Aplicabilidade do KGR definida como ${kgrApplicabilityLabel(kgrBatchConfirm)}.`
        : `Nenhuma keyword selecionada precisa mudar para ${kgrApplicabilityLabel(kgrBatchConfirm)}.`,
      details: [plan.unchangedIds.length > 0 || plan.draftIds.length > 0 ? describeKgrApplicabilityBatch(plan, 0) : null, describeSubjectSkipped(subjects.length, "KGR")].filter((line): line is string => Boolean(line)),
    };
  })() : null;
  const bulkProgressPercentage = bulkProgress.total
    ? Math.min(100, Math.round((bulkProgress.current / bulkProgress.total) * 100))
    : null;
  const bulkProgressDisplayPercentage = bulkProgress.status === "success" ? 100 : bulkProgressPercentage;
  const bulkProgressBarPercentage = bulkProgress.status === "success" ? 100 : bulkProgressPercentage ?? 38;
  const bulkProgressIndeterminate = bulkProgressPercentage === null;
  const bulkProgressAriaValueText = bulkProgressDisplayPercentage === null
    ? bulkProgress.status === "processing" ? "Em andamento" : "Progresso não determinado"
    : `${bulkProgressDisplayPercentage}%`;
  const bulkProgressCardClass = bulkProgress.status === "success"
    ? "border-success/35 bg-success-soft/10"
    : bulkProgress.status === "error"
      ? "border-danger/35 bg-danger-soft/10"
      : bulkProgressMeta?.cardClass || "border-divider bg-surface-subtle";
  const bulkActionStateClass = (step: BulkProgressStep) => bulkProgress.status === "processing" && bulkProgress.step === step
    ? bulkProgressStepMeta[step].activeClass
    : "";
  const manualSiteCheckKeyword = manualSiteCheckKeywordId ? keywords.find(keyword => keyword.id === manualSiteCheckKeywordId) : null;

  return (
    <div data-processor-page className="flex h-[calc(100dvh-2.5rem)] min-h-0 min-w-0 flex-col overflow-hidden bg-background font-mono text-xs text-foreground">
      <MineradorLastOrganizationRestorer
        userId={session?.user?.id || ""}
        brandId={selectedBrandId}
        ready={!loading && sessionStatus === "authenticated"}
        knownListIds={lists.map(list => list.id)}
        values={organizationValues}
        onHydrated={setOrganizationHydratedKey}
        onApply={view => {
          setSearchQuery(view.searchQuery); setFilterStatus(view.filterStatus); setFilterIntent(view.filterIntent);
          setFilterSiteRelation(view.filterSiteRelation); setFilterSitePublication(view.filterSitePublication);
          setFilterKgrApplicability(view.filterKgrApplicability); setFilterKgrMeasurement(view.filterKgrMeasurement); setFilterVolumeEligibility(view.filterVolumeEligibility);
          setFilterProcess(view.filterProcess || "Todos");
          setOrderMode("auto");
          setSortColumn(view.sortColumn); setSortDirection(view.sortDirection);
        }}
      />
      <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />
      <HistoryControls moduleId="minerador" showHistory={false} showUndoRedo={false} entries={keywordHistory.entries} canUndo={keywordHistory.canUndo} canRedo={keywordHistory.canRedo}
        onUndo={undoKeywords} onRedo={redoKeywords} onRestore={keywordHistory.restore} compact presentation="popover"/>
      {/* Só o Processador passa `subjectEntry`: o select "Esta lista é"
          (Assunto / Keyword) não entra no Descobrir (SDD 2026-09-24, F1.3). */}
      <DiscoverySourceControls ref={discoverySourceControlsRef} brandRef={brandRef} preliminaryIntent="Informativa" preliminaryFunnel="TOFU" onComplete={handleDiscoverySourceComplete} subjectEntry onSubjectsImported={result => void handleSubjectsImported(result)} />

      {/* Blocos opcionais acima da planilha (Organizar, prévia do Site,
          conferência manual, recuperação): juntos têm um teto e rolam por
          conta própria só quando passam dele, para a planilha nunca cair
          abaixo da altura mínima nem o fim de um bloco ficar cortado. */}
      <div data-processor-top-blocks className="max-h-[45dvh] shrink-0 overflow-y-auto">
      {organizeOpen && (
        <section className="shrink-0 border-b border-divider bg-surface-subtle px-4 py-3 font-sans" aria-label="Filtros de organização">
          {/* Filtros de visualização (pedido do dono, 2026-09-24): sem Silo;
              Vínculo inclui a Relação com URL; KGR junta aplicabilidade e
              cálculo; Processo separa quem já passou pelo Processador. */}
          <div className="flex flex-wrap items-end gap-2.5">
            <KeywordTableOrderModeSelect value={orderMode} onChange={setOrderMode} />
            <label className={ORGANIZE_LABEL_CLASS}>
              Status
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={ORGANIZE_SELECT_CLASS}>
                <option value="Todos">Todos</option>{MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className={ORGANIZE_LABEL_CLASS}>
              Intenção
              <select value={filterIntent} onChange={(e) => setFilterIntent(e.target.value)} className={ORGANIZE_SELECT_CLASS}>
                <option value="Todos">Todas</option><option value="informational">Informativa</option><option value="commercial_investigation">Comercial investigativa</option><option value="transactional">Transacional</option><option value="navigational">Navegacional</option><option value="local">Local</option><option value="mixed">Mista</option><option value="unknown">Pendente / não classificada</option>
              </select>
            </label>
            <label className={ORGANIZE_LABEL_CLASS}>
              Vínculo
              <select
                data-organize-filter="vinculo"
                value={combinedVinculoFilterValue(filterSitePublication, filterSiteRelation)}
                onChange={(e) => { const next = parseCombinedVinculoFilter(e.target.value); setFilterSitePublication(next.sitePublication); setFilterSiteRelation(next.siteRelation); }}
                className={ORGANIZE_SELECT_CLASS}
              >
                <option value="Todos">Todos</option>
                {VINCULO_FILTER_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
              </select>
            </label>
            <label className={ORGANIZE_LABEL_CLASS}>
              KGR
              <select
                data-organize-filter="kgr"
                value={combinedKgrFilterValue(filterKgrApplicability, filterKgrMeasurement)}
                onChange={(e) => { const next = parseCombinedKgrFilter(e.target.value); setFilterKgrApplicability(next.kgrApplicability); setFilterKgrMeasurement(next.kgrMeasurement); }}
                className={ORGANIZE_SELECT_CLASS}
              >
                <option value="Todos">Todos</option>
                {KGR_FILTER_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
              </select>
            </label>
            <label className={ORGANIZE_LABEL_CLASS}>
              Processo
              <select
                data-organize-filter="processo"
                value={filterProcess}
                onChange={(e) => setFilterProcess(e.target.value as ProcessorRunFilter)}
                title="Com processo: já passou pela Lógica, pelo Volume ou por Resultados, com dado, sem dado ou com erro. Sem processo: nunca foi processada aqui."
                className={ORGANIZE_SELECT_CLASS}
              >
                <option value="Todos">Todas</option>{PROCESS_RUN_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className={ORGANIZE_LABEL_CLASS}>
              Elegibilidade por volume
              <select value={filterVolumeEligibility} onChange={(e) => setFilterVolumeEligibility(e.target.value as typeof filterVolumeEligibility)} className={ORGANIZE_SELECT_CLASS}>
                <option value="operational">Elegíveis para produção</option><option value="Todos">Todas</option><option value="pending">Pendente de medição</option><option value="eligible">Elegível por volume</option><option value="below_threshold">Inelegível · abaixo do corte</option><option value="unavailable">Inelegível · sem volume oficial</option><option value="measurement_failed">Medição falhou</option>
              </select>
            </label>
            <div className="flex items-center gap-2 pb-0.5">
              <button type="button" onClick={clearOrganizeFilters} className="min-h-9 rounded border border-divider px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-module-accent/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Limpar filtros</button>
            </div>
          </div>
        </section>
      )}

      {siteSyncPlan && (
        <section className="shrink-0 border-b border-emerald-950/60 bg-emerald-950/10 px-4 py-3 font-sans">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Prévia da conferência Site/Sitemap</h2>
              <p className="mt-1 text-[11px] text-slate-400">Nada é gravado até a confirmação explícita. {targetListId ? <>A lista de destino é <span className="text-slate-200">{lists.find(list => list.id === targetListId)?.nome || targetListId}</span>.</> : <>Sem Silo/Categoria: somente evidências de keywords existentes serão atualizadas.</>}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
              <span className="rounded border border-slate-800 px-1.5 py-0.5">Recebidas: {siteSyncPlan.summary.received}</span>
              <span className="rounded border border-emerald-900/50 px-1.5 py-0.5 text-emerald-300">Novas: {siteSyncPlan.summary.new}</span>
              <span className="rounded border border-context-accent/50 px-1.5 py-0.5 text-context-accent">Atualizadas: {siteSyncPlan.summary.updated}</span>
              <span className="rounded border border-slate-800 px-1.5 py-0.5">Sem alteração: {siteSyncPlan.summary.unchanged}</span>
              <span className="rounded border border-amber-900/50 px-1.5 py-0.5 text-amber-300">Duplicadas: {siteSyncPlan.summary.duplicateInBatch}</span>
              <span className="rounded border border-rose-900/50 px-1.5 py-0.5 text-rose-300">Inválidas/bloqueadas: {siteSyncPlan.summary.invalid + siteSyncPlan.summary.blocked}</span>
            </div>
          </div>
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-slate-900/80 bg-[#06070a]">
             {siteSyncPlan.items.map(item => (
               <div key={item.candidate.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-900/60 px-3 py-2 text-[11px] last:border-b-0">
                 <span className="min-w-48 font-semibold text-slate-200">{item.candidate.text}</span>
                 <span className="text-context-accent">{readPublicationLink({ status: keywords.find(keyword => keyword.id === item.mineradorKeywordId)?.status, evidence: item.candidate as unknown as PublicationLinkEvidence }).label}</span>
                 <span className="text-slate-500">{siteRelationLabel(item.candidate.keywordUrlRelation)}</span>
                 <span className="text-slate-500">URL: {item.candidate.urlSituation}</span>
                 {item.candidate.lastCheckedAt && <span className="text-slate-500">Conferida: {new Date(item.candidate.lastCheckedAt).toLocaleString("pt-BR")}</span>}
                 <span className="text-slate-500">{siteArchitectureLabel(item.candidate.architectureStatus)}</span>
                 <span className="rounded border border-slate-800 px-1.5 py-0.5 text-slate-300" title={item.candidate.siloPath ? `Silo: ${item.candidate.siloPath}` : undefined}>{sitePageRoleLabel(item.candidate.siteRole)}{item.candidate.siteRole === "article" && item.candidate.siloPath ? ` · ${item.candidate.siloPath}` : ""}</span>
                <span className={item.outcome === "new" ? "text-success" : item.outcome === "evidence_updated" ? "text-context-accent" : item.outcome === "no_change" ? "text-text-muted" : "text-warning"}>{siteSyncOutcomeLabel(item.outcome)}</span>
                {item.mineradorKeywordId && <span className="font-mono text-[10px] text-slate-600">{item.mineradorKeywordId}</span>}
                <a href={item.candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-context-accent hover:text-foreground">Origem</a>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setSiteSyncPlan(null)} disabled={siteSyncPersisting} className="rounded border border-slate-800 px-3 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50">Voltar</button>
            <button onClick={handleConfirmSiteSync} disabled={siteSyncPersisting || !siteSyncPlan.items.some(item => ["new", "evidence_updated", "no_change"].includes(item.outcome))} className="flex items-center gap-1 rounded border border-emerald-700/60 bg-emerald-900/30 px-3 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50">
              {siteSyncPersisting && <Loader2 className="h-3 w-3 animate-spin" />}
               {siteSyncPersisting ? "Persistindo..." : "Salvar conferência"}
             </button>
           </div>
         </section>
       )}

      {manualSiteCheckKeywordId && (
        <section ref={manualSiteCheckRef} className="shrink-0 border-b border-divider bg-surface-subtle px-4 py-3 font-sans" aria-label="Conferir URL manualmente">
          <form onSubmit={handleManualSiteCheck} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="minerador-manual-site-url" className="block text-sm font-semibold text-foreground">URL da página da marca</label>
              <p className="mt-1 text-sm text-text-muted">Keyword: <span className="font-medium text-foreground">{manualSiteCheckKeyword?.keyword || "—"}</span></p>
              <p className="text-sm text-text-muted">Site da Marca: <span className="font-medium text-foreground">{activeBrand?.site_url || "não configurado"}</span></p>
              <p className="mt-1 text-sm text-text-muted">Vale para Silo e para artigo: a página do Silo costuma ficar fora do sitemap, e o link informado aqui é conferido do mesmo jeito. A página é apenas lida no domínio autorizado; nenhuma publicação é criada automaticamente.</p>
              <input id="minerador-manual-site-url" type="url" value={manualSiteCheckUrl} onChange={event => setManualSiteCheckUrl(event.target.value)} placeholder="https://sua-marca.com/pagina" className="mt-2 min-h-9 w-full rounded border border-divider bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-context-accent focus:ring-2 focus:ring-context-accent/30" required />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setManualSiteCheckKeywordId(null)} disabled={siteSyncLoading} className="min-h-9 rounded border border-divider px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-elevated hover:text-foreground disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={siteSyncLoading} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-action-accent px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-action-accent/85 disabled:cursor-wait disabled:opacity-50">
                {siteSyncLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Conferir URL
              </button>
            </div>
          </form>
        </section>
      )}

      {recoverableKeywords.length > 0 && (
        <section className="border-b border-divider bg-surface-subtle px-4 py-3 font-sans" aria-label="Keywords em recuperação">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Keywords removidas — recuperação por 24 horas</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-text-muted">
                Keywords publicadas saem da operação, mas continuam restauráveis neste período. Publicação, URL, canonical e proveniência editorial permanecem preservadas.
              </p>
            </div>
            <span className="shrink-0 rounded border border-divider bg-surface-elevated px-2 py-1 text-sm font-medium text-context-accent">
              {recoverableKeywords.length} em recuperação
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {recoverableKeywords.map(item => (
              <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded border border-divider bg-surface-elevated px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" title={item.keyword}>{item.keyword}</p>
                  <p className="mt-0.5 text-sm text-text-muted">{keywordRecoveryRemainingLabel(item)}</p>
                </div>
                <RecoveryAction onRestore={() => handleRestoreKeyword(item.id)} disabled={updating} />
              </div>
            ))}
          </div>
        </section>
      )}
      </div>


      {/* PLANILHA PRINCIPAL */}
      {/* Uma rolagem vertical só (pedido do dono, 2026-09-24): a página tem a
          altura da tela menos a barra global e não rola; a planilha ocupa a
          sobra (flex-1, com altura mínima) e rola dentro dela, com o
          cabeçalho preso. Com seleção, o espaço do rodapé fixo é um irmão
          depois dela, não padding: as barras de rolagem ficam acima dele. */}
      <KeywordTableShell ref={tableRef} scroll="both" data-processor-table-viewport className="min-h-40">
        {loading || organizationHydrationPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#06070a]/90">
            <Loader2 className="w-6 h-6 text-context-accent animate-spin mb-2" />
            <span className="text-[10px] text-slate-500 font-mono">{loading ? "Buscando do Supabase..." : "Restaurando organização..."}</span>
          </div>
        ) : filteredKeywords.length === 0 ? (
          <KeywordTableEmptyState className="p-16">
            <AlertTriangle className="w-6 h-6 text-slate-655 mx-auto mb-2" />
            <p className="font-bold text-slate-400">
              {keywords.length === 0 ? "Nenhuma palavra-chave encontrada" : "Nenhuma keyword corresponde aos filtros atuais"}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">
              {keywords.length === 0 ? "Insira palavras do banco ou importe candidatas da Descoberta." : `${keywords.length} keyword(s) carregada(s), mas nenhuma corresponde à organização atual.`}
            </p>
          </KeywordTableEmptyState>
        ) : (
          <>
            {duplicateGroups.length > 0 && showDuplicateBanner && (
              <div className="bg-amber-955/20 border-b border-amber-900/60 text-amber-300 px-4 py-2.5 text-[11px] flex items-center justify-between gap-4 animate-in slide-in-from-top-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                  <span>
                    AtenÃ§Ã£o: Existem <strong>{duplicateGroups.length} palavras-chave repetidas</strong> nesta visualizaÃ§Ã£o.
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <button
                    onClick={handleDeleteDuplicates}
                    className="bg-amber-600/90 hover:bg-amber-500 text-white font-bold px-3 py-1 rounded transition-all shrink-0 shadow-lg"
                  >
                    Apagar Duplicadas (Manter apenas 1)
                  </button>
                  <button
                    onClick={() => setShowDuplicateBanner(false)}
                    className="text-slate-400 hover:text-white font-semibold px-2 py-1 shrink-0 transition-colors"
                  >
                    Ignorar Alerta
                  </button>
                </div>
              </div>
            )}
            <table data-keyword-table="processor" style={{ minWidth: processorTableMinimumWidth }} className="w-full table-fixed border-collapse text-left text-[12.5px] font-sans tracking-wide whitespace-nowrap">
             <colgroup>
               {Object.keys(processorColumnWidths).map(columnId => <col key={columnId} data-keyword-table-column={columnId} style={{ width: responsiveWidths[columnId] }} />)}
             </colgroup>
            
            {/* CabeÃ§alho Fixo OrdenÃ¡vel */}
            <KeywordTableHeader className="sticky top-0 z-20 border-b border-divider bg-surface-subtle">
              <tr className="text-text-muted">
                <th className="relative w-8 border-r border-divider/70 px-1 py-2 text-center font-mono text-[10px]" aria-label="Reordenar linhas"><KeywordTableColumnResizeHandle columnId="drag" label="reordenação" onStart={columnResize.startResize} /></th>
                <th className="relative w-8 border-r border-divider/70 px-2 py-2 text-center font-mono text-[10px]">#<KeywordTableColumnResizeHandle columnId="index" label="número" onStart={columnResize.startResize} /></th>
                <KeywordSelectionHeader allSelected={allVisibleSelected} someSelected={someVisibleSelected} onToggle={handleToggleSelectAll} resizeHandle={<KeywordTableColumnResizeHandle columnId="selection" label="seleção" onStart={columnResize.startResize} />}/>
                <th
                  className="relative border-r border-divider/70 px-3 py-2 cursor-pointer whitespace-normal transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("keyword")}
                >
                  <InlineLabelCluster label="Palavra-Chave" trailing={renderSortIcon("keyword")} /><KeywordTableColumnResizeHandle columnId="keyword" label="Palavra-Chave" onStart={columnResize.startResize} />
                </th>
                <th className="relative border-r border-divider/70 px-3 py-2 text-center whitespace-nowrap">
                  <InlineLabelCluster
                    label="Vínculo"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Relação com conteúdo publicado" description="Indica se a keyword está livre, possui uma página candidata, foi verificada ou já está vinculada a uma publicação como principal ou secundária." /></span>}
                  />
                  <KeywordTableColumnResizeHandle columnId="vinculo" label="Vínculo" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[128px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("results_allintitle")}
                >
                  <InlineLabelCluster
                    label="Resultados"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Concorrência encontrada para a busca" description="Mostra a quantidade medida pelo processo de concorrência orgânica usada, junto com o Volume, no cálculo e na avaliação da oportunidade." /></span>}
                    trailing={renderSortIcon("results_allintitle")}
                  />
                  <KeywordTableColumnResizeHandle columnId="results" label="Resultados" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[120px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("volume_search")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Demanda mensal da keyword" description="Demanda mensal medida para a keyword no contexto configurado."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Volume</span></InfoHint>}
                    trailing={renderSortIcon("volume_search")}
                  />
                  <KeywordTableColumnResizeHandle columnId="volume" label="Volume" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[108px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("kgr_score")}
                >
                  <InlineLabelCluster
                    label="KGR"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Relação entre demanda e concorrência" description="Compara Resultado e Volume para ajudar na triagem de oportunidades. É um indicador de apoio e não aprova ou reprova uma keyword automaticamente." /></span>}
                    trailing={renderSortIcon("kgr_score")}
                  />
                  <KeywordTableColumnResizeHandle columnId="kgr" label="KGR" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[96px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("cpc")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Valor comercial do clique" description="Custo médio por clique informado pelo Google Ads; ajuda a perceber valor e competição comercial."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">CPC</span></InfoHint>}
                    trailing={renderSortIcon("cpc")}
                  />
                  <KeywordTableColumnResizeHandle columnId="cpc" label="CPC" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[70px] border-r border-divider/70 px-2 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("keyword_difficulty")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Dificuldade orgânica estimada" description="Estimativa de dificuldade orgânica disponível para a keyword."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">KD</span></InfoHint>}
                    trailing={renderSortIcon("keyword_difficulty")}
                  />
                  <KeywordTableColumnResizeHandle columnId="kd" label="KD" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[168px] border-r border-divider/70 px-3 py-2 text-center whitespace-nowrap">
                  <InlineLabelCluster label={<InfoHint title="Leitura de intenção da busca" description="Intenção canônica atual do KeywordDNA, considerando a lógica e as decisões humanas já consolidadas."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Intenção</span></InfoHint>} />
                  <KeywordTableColumnResizeHandle columnId="intent" label="Intenção" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[168px] border-r border-divider/70 px-3 py-2 text-center cursor-pointer whitespace-nowrap transition-colors hover:bg-surface-elevated"
                  onClick={() => handleSort("nicho")}
                >
                  <InlineLabelCluster
                    label={<InfoHint title="Contexto de mercado" description="Contexto de mercado identificado para a keyword."><span tabIndex={0} onClick={(event) => event.stopPropagation()} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Nicho de mercado</span></InfoHint>}
                    trailing={renderSortIcon("nicho")}
                  />
                  <KeywordTableColumnResizeHandle columnId="niche" label="Nicho de mercado" onStart={columnResize.startResize} />
                </th>
                <th
                  className="relative w-[80px] border-r border-divider/70 px-3 py-2 text-center whitespace-nowrap"
                >
                  <InlineLabelCluster
                    label="Funil"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Etapa provável da jornada" description="TOFU é o topo do funil: descoberta e buscas amplas. MOFU é o meio: consideração e comparação de alternativas. BOFU é o fundo: busca mais próxima de contratar, comprar, agendar ou realizar outra ação." /></span>}
                  />
                  <KeywordTableColumnResizeHandle columnId="funnel" label="Funil" onStart={columnResize.startResize} />
                </th>
                <th className="relative w-[108px] px-3 py-2 text-center whitespace-nowrap">
                  <InlineLabelCluster
                    label="Status"
                    info={<span onClick={(event) => event.stopPropagation()}><InfoHint title="Decisão editorial da keyword" description="Mostra o estado de decisão da keyword no Minerador. Não representa publicação: o vínculo com conteúdo publicado aparece separadamente em Vínculo." /></span>}
                  />
                  <KeywordTableColumnResizeHandle columnId="status" label="Status" onStart={columnResize.startResize} />
                </th>
              </tr>
            </KeywordTableHeader>

            {/* Linhas da Planilha */}
            <tbody className="divide-y divide-divider/70 bg-background">
              {filteredKeywords.map((item, index) => {
                const isSelected = selectedIds.has(item.id);
                const canonicalSnapshot = resolveCanonicalKeywordSnapshot({ ...item, attempts: processAttemptsByKeywordId[item.id] });
                const volumeValue = canonicalSnapshot.metrics.volume.value;
                const resultValue = canonicalSnapshot.metrics.result.value;
                const kgrApplicability = canonicalSnapshot.metrics.kgr.applicability;
                const automaticKgrScore = canonicalSnapshot.metrics.kgr.score;
                const kgrMeasurement = classifyKgrMeasurement({ kgrScore: automaticKgrScore, volume: volumeValue, results: resultValue });
                const volumeKgrConsistency: VolumeKgrConsistency = assessVolumeKgrConsistency({ volume: volumeValue, results: resultValue, kgrScore: automaticKgrScore, semantic: item.analise_semantica });
                const zeroConfirmed = hasExplicitZeroMeasurement(item.analise_semantica);
                const volumeMeasurement = item.analise_semantica?.volume_measurement && typeof item.analise_semantica.volume_measurement === "object" && !Array.isArray(item.analise_semantica.volume_measurement)
                  ? item.analise_semantica.volume_measurement as Record<string, unknown>
                  : null;
                const cpcEvidence = canonicalSnapshot.metrics.cpc;
                const cpcTitle = cpcEvidence.source === "processor"
                  ? cpcEvidence.sortValue === null
                    ? "Medição Google Ads revalidada no Processador; CPC não retornado."
                    : "CPC da medição Google Ads revalidada no Processador."
                  : cpcEvidence.source === "imported"
                    ? "CPC anterior/importado; aguardando revalidação no Processador."
                    : undefined;
                const allintitleMeasurement = item.analise_semantica?.allintitle_measurement && typeof item.analise_semantica.allintitle_measurement === "object" && !Array.isArray(item.analise_semantica.allintitle_measurement)
                  ? item.analise_semantica.allintitle_measurement as Record<string, unknown>
                  : null;
                const allintitleHistory = Array.isArray(item.analise_semantica?.allintitle_measurement_history)
                  ? item.analise_semantica.allintitle_measurement_history
                  : [];
                const keywordDifficultyEvidence = canonicalSnapshot.metrics.kd;
                // Sem número: nunca processado ("—"), processado sem dado ("0"
                // apagado) ou erro de processo (cor de alerta). Só leitura.
                const rowAttempts = processAttemptsByKeywordId[item.id];
                const resultsCell = processorResultsCell({ semantic: item.analise_semantica, value: resultValue, attempts: rowAttempts });
                const volumeCell = processorVolumeCell({ semantic: item.analise_semantica, value: volumeValue, attempts: rowAttempts });
                const cpcCell = processorCpcCell({ semantic: item.analise_semantica, value: cpcEvidence.sortValue, attempts: rowAttempts });
                const kdCell = processorKdCell({ semantic: item.analise_semantica, value: keywordDifficultyEvidence.value, attempts: rowAttempts });
                const keywordDifficultyTitle = keywordDifficultyEvidence.source === "processor"
                  ? keywordDifficultyEvidence.value === null
                    ? "Keyword Overview revalidado no Processador; KD não retornado."
                    : "KD da medição DataForSEO Keyword Overview revalidada no Processador."
                  : keywordDifficultyEvidence.source === "imported"
                    ? "KD anterior/importado; aguardando revalidação no Processador."
                    : keywordDifficultyEvidence.source === "previous"
                      ? "KD de medição anterior; aguardando revalidação no Processador."
                      : undefined;
                const confirmedVolumeMeasurement = Boolean(
                  volumeMeasurement
                  && volumeMeasurement.match === "exact"
                  && ["confirmed", "zero_confirmed"].includes(String(volumeMeasurement.status || ""))
                  && typeof volumeMeasurement.rawVolume === "number"
                  && Number.isFinite(volumeMeasurement.rawVolume)
                  && volumeMeasurement.rawVolume === volumeValue,
                );
                const volumeEligibility = readVolumeEligibility(item);
                const volumeEligibilityClass = volumeEligibility === "eligible"
                  ? "border-success/50 bg-success-soft text-success"
                  : volumeEligibility === "pending"
                    ? "border-divider bg-surface-subtle text-text-muted"
                    : volumeEligibility === "measurement_failed"
                      ? "border-warning/50 bg-warning-soft text-warning"
                      : "border-divider bg-surface-subtle text-foreground/80";
                const siteOrigin = readSiteOrigin(item.analise_semantica);
                const publicationLink = canonicalSnapshot.vinculo;
                const publicationProtected = keywordPublicationProtected(item);
                const editorialStatus = canonicalSnapshot.status;
                const recoveryStatus = legacyEditorialRecovery?.keywordId === item.id ? legacyEditorialRecovery.status : "";
                // A coluna REFLETE o que a Revisão Humana decidiu.
                const vinculo = resolveKeywordVinculo({ status: item.status, semantic: item.analise_semantica });
                const primaryKeywordPolicy = readPrimaryKeywordPolicy({ publicationDeclared: publicationLink.state === "published", status: item.status, semantic: item.analise_semantica });
                const selectedListName = lists.find(list => list.id === item.lista_id)?.nome || "Sem Silo/Categoria";
                const keywordReadModel = canonicalSnapshot.semantic;
                const intentLabel = keywordReadModel.intentLabel;
                const intentIsPending = keywordReadModel.intentState === "unresolved";
                
                // FormataÃ§Ã£o KGR de acordo com a regra estrita de Golden Ratio
                let kgrText = "-";
                let kgrColor = "text-slate-500";
                if (automaticKgrScore !== null) {
                  kgrText = automaticKgrScore.toFixed(3);
                  const score = automaticKgrScore;
                  const vol = volumeValue;
                  const tone = kgrTechnicalTone(score, vol);
                  kgrColor = tone === "success"
                    ? "bg-success-soft text-success border border-success/50 px-1.5 py-0.5 rounded text-[10px] font-bold"
                    : tone === "warning"
                      ? "bg-warning-soft text-warning border border-warning/50 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      : tone === "danger"
                        ? "bg-danger-soft text-danger border border-danger/50 px-1.5 py-0.5 rounded text-[10px] font-bold"
                        : "text-text-muted";
                }
                const kgrTextBadge = "inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold";
                // A aplicabilidade deixou de ser badge: ela aparece no seletor da
                // própria célula. O badge fica só para o estado da medição.
                const kgrState = item.volume_search === 0
                  ? { label: "Não calculável", className: "border-divider bg-surface-subtle text-foreground/80" }
                  : volumeKgrConsistency === "inconsistent"
                    ? { label: "Inconsistente", className: "border-danger/50 bg-danger-soft text-danger" }
                    : kgrMeasurement === "invalid"
                      ? { label: "Inválido", className: "border-danger/50 bg-danger-soft text-danger" }
                      : kgrMeasurement === "without_data" || kgrMeasurement === "partial"
                        ? { label: "Sem medição", className: "border-divider bg-surface-subtle text-foreground/80" }
                        : null;
                const kgrApplicabilityClass = kgrApplicability === "applicable"
                  ? "border-success/50 bg-success-soft text-success"
                  : kgrApplicability === "not_applicable"
                    ? "border-divider bg-surface-subtle text-foreground/80"
                    : "border-pending/50 bg-pending-soft text-pending";

                const isExpanded = expandedRowId === item.id;

                return (
                  <Fragment key={item.id}>
                    <tr
                      data-keyword-table-row-id={item.id}
                      style={{ height: rowResize.getHeight(item.id) }}
                      onDragOver={(event) => handleKeywordRowDragOver(event, item.id)}
                      onDrop={handleKeywordRowDrop}
                      className={`transition-colors ${
                        keywordOrder.draggingId === item.id
                          ? "bg-surface-elevated opacity-70"
                          : isSelected
                          ? "bg-selected hover:bg-surface-elevated"
                          : isExpanded
                          ? "border-l-2 border-l-module-accent bg-selected hover:bg-surface-elevated"
                          : "hover:bg-surface-subtle"
                      }`}
                    >
                      <td className="w-8 border-r border-divider/70 px-0.5 py-1 text-center">
                        <KeywordTableDragHandle
                          id={item.id}
                          label={item.keyword}
                          enabled={orderMode === "manual"}
                           onDragStart={keywordOrder.startDragging}
                           onDragEnd={keywordOrder.endDragging}
                           onPointerDragStart={keywordOrder.startPointerDragging}
                           onMouseDragStart={keywordOrder.startMouseDragging}
                           onKeyboardMove={(_, offset) => keywordOrder.moveByOffset(item.id, offset)}
                        />
                      </td>
                      {/* NÃºmero da Linha */}
                      <td className="w-8 border-r border-divider/70 px-2 py-1 text-center font-mono text-[11px] text-text-muted select-none">
                        {index + 1}
                      </td>

                      {/* Checkbox */}
                      <KeywordSelectionCell id={item.id} keyword={item.keyword} selected={isSelected} onPointerDown={(event) => selection.onSelectionPointerDown(item.id, event)} onClick={(event) => selection.onSelectionClick(item.id, event)}/>

                      {/* Palavra */}
                      <td className={`min-w-0 border-r border-divider/70 px-3 py-1 whitespace-normal select-text ${isExpanded ? "text-module-accent" : "text-foreground/80"}`}>
                        <div className="flex min-w-0 items-start gap-1.5">
                          <button type="button" aria-expanded={isExpanded} aria-controls={`keyword-dna-${item.id}`} aria-label={`${isExpanded ? "Recolher" : "Expandir"} dados da keyword ${item.keyword}`} onClick={() => setExpandedRowId(isExpanded ? null : item.id)} className={`mt-0.5 shrink-0 rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/50 ${isExpanded ? "text-module-accent" : "text-module-accent/70 hover:text-module-accent"}`}>
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div
                              title={item.keyword}
                              data-processor-keyword-text
                              className={`break-words select-text cursor-text text-sm text-keyword ${publicationProtected ? "font-semibold" : "font-medium"}`}
                            >
                              {item.keyword}
                            </div>
                            {/* O endereço mora ao lado da palavra-chave, inteiro e
                                com cor própria: é a identidade da página, não um
                                detalhe do vínculo. Aparece assim que há URL
                                conferida, não só depois de publicada. */}
                            {(publicationLink.url || publicationProtected) && (
                              <a
                                href={publicationLink.canonicalUrl || publicationLink.url || getCanonicalUrl(item) || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-keyword-page-url
                                className={"mt-0.5 block max-w-full break-all select-text font-mono text-sm hover:underline " + (
                                  publicationLink.state === "published" ? "text-identity-published" : "text-identity-new"
                                )}
                                title={publicationLink.canonicalUrl
                                  ? "Canônico declarado na publicação: slug e URL não podem ser alterados ou removidos."
                                  : "Página conferida. Ainda sem canônico declarado."}
                              >
                                {publicationLink.canonicalUrl || publicationLink.url || getCanonicalUrl(item) || "URL publicada não lida"}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Vínculo: as DUAS DECLARAÇÕES do humano — o posto desta keyword
                          numa publicação e o que a página é (ou viria a ser).
                          Conferir e confirmar são dados, não declarações: vivem
                          no card DECISÃO. As duas se declaram na Revisão Humana. */}
                      <td data-keyword-vinculo-cell className="border-r border-divider/70 px-2 py-1 text-center whitespace-nowrap">
                        <div data-keyword-vinculo-choices title={keywordVinculoChoicesSummary(vinculo)} className="flex min-w-0 flex-col items-center gap-0.5">
                          <span
                            className={"inline-flex max-w-full items-center whitespace-normal rounded border px-1 text-sm font-semibold leading-tight " + (
                              vinculo.postLockedToSlug
                                ? "border-context-accent/50 bg-context-accent/10 text-context-accent"
                                : "border-divider bg-surface-subtle text-text-muted"
                            )}
                            title={vinculo.postLockedToSlug
                              ? "Travado ao slug: esta keyword é a primária desta URL e não se solta dela."
                              : "Livre: pode ser primária ou secundária de qualquer página, e pode perder a vaga."}
                          >
                            {vinculo.postLabel}
                          </span>
                          <span
                            className={"inline-flex max-w-full items-center whitespace-normal rounded px-1 text-sm font-semibold leading-tight " + (
                              vinculo.pageType.declared || vinculo.pageType.humanDeclared
                                ? "border border-context-accent/50 bg-context-accent/10 text-context-accent"
                                : "border border-dashed border-divider text-text-muted"
                            )}
                            title={vinculo.pageTypeLabel
                              + (vinculo.pageType.source === "human" ? " — escolhido por alguém desta marca." : vinculo.pageType.source === "site" ? " — veio do papel observado na página." : " — padrão do Minerador.")}
                          >
                            {vinculo.pageTypeLabel}
                          </span>
                          {/* A terceira declaração: o Assunto, só quando
                              declarado, pelo mesmo resolvedor da coluna. */}
                          {vinculo.subjectLabel ? (
                            <span
                              data-keyword-subject-label
                              className="inline-flex max-w-full items-center whitespace-normal rounded border border-context-accent/50 bg-context-accent/10 px-1 py-0.5 text-sm font-semibold leading-tight text-context-accent"
                              title={vinculo.subject?.note
                                ? `${vinculo.subjectLabel}: ${vinculo.subject.note}`
                                : `${vinculo.subjectLabel}: complete a nota na Revisão Humana.`}
                            >
                              {keywordVinculoChoiceLabels(vinculo).subject}
                            </span>
                          ) : (
                            <span
                              data-keyword-vinculo-no-subject
                              className="inline-flex max-w-full items-center whitespace-normal rounded border border-dashed border-divider px-1 text-sm leading-tight text-text-muted"
                              title="Sem Assunto declarado (padrão). Declare na Revisão Humana ou no Vínculo do rodapé."
                            >
                              {keywordVinculoChoiceLabels(vinculo).subject}
                            </span>
                          )}
                          {/* F1b: abre o Descobrir no modo Por Assunto; a URL leva só o id. */}
                          {vinculo.subjectLabel && item.id ? (
                            <button
                              type="button"
                              data-subject-search-link
                              onClick={() => router.push(subjectSearchLinkHref(brandRef, item.id))}
                              className="inline-flex min-h-8 max-w-full items-center rounded border border-divider px-1.5 py-0.5 text-sm font-medium text-text-muted transition-colors hover:border-module-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40"
                              title="Abre o Descobrir no modo Por Assunto com este Assunto. Nada é pago antes de você confirmar o custo."
                            >
                              Buscar sustentação
                            </button>
                          ) : null}
                          {publicationLink.action === "correct_legacy" && item.id && (
                            <button type="button" onClick={() => void handlePublicationLinkAction(item, "correct_legacy", recoveryStatus)} disabled={updating} className="min-h-7 max-w-full rounded border border-divider px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:border-context-accent hover:text-context-accent disabled:cursor-not-allowed disabled:opacity-50">
                              Corrigir marcação
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Resultados — mesma grafia do Volume: a contagem do
                          allintitle é um número grande e sem separador ela é
                          lida errada de relance. */}
                      <td className="w-[128px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        {resultValue !== null
                          ? <span className="text-context-accent" title={resultsCell.hint || "Páginas com todas as palavras no título, medidas pelo provedor."}>{formatMetricInteger(resultValue)}</span>
                          : <ProcessorMetricPlaceholder cell={resultsCell} />}
                      </td>

                      {/* Volume */}
                      <td className="w-[120px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={confirmedVolumeMeasurement && volumeValue !== 0 ? "text-context-accent" : undefined}
                            title={confirmedVolumeMeasurement ? "Volume mensal confirmado pelo provedor para a keyword exata." : undefined}
                          >
                            {volumeValue !== null ? formatMetricInteger(volumeValue) : <ProcessorMetricPlaceholder cell={volumeCell} />}
                          </span>
                          {zeroConfirmed && (
                            <span className="rounded border border-context-accent/50 bg-context-accent/10 px-1 text-[8px] font-bold uppercase tracking-wide text-context-accent" title="Zero mensal explicitamente confirmado pela keyword exata.">
                              0 confirmado
                            </span>
                          )}
                          {!isLegacyPublishedStatus(item.status) && (
                            <span className={`max-w-full truncate rounded border px-1 text-[8px] font-bold ${volumeEligibilityClass}`} title={volumeEligibilityLabel(volumeEligibility)}>
                              {volumeEligibilityLabel(volumeEligibility)}
                            </span>
                          )}
                          {(item.volume_source || "real") === "estimado" && (
                            <span
                              className="rounded border border-warning/50 bg-warning-soft px-1 text-[8px] font-bold uppercase tracking-wide text-warning"
                              title="Volume sem fonte real (API falhou). Não use para decisão editorial sem revisar."
                            >
                              Estimado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* KGR — score técnico + decisão humana de aplicabilidade */}
                      <td className="w-[108px] border-r border-divider/70 px-2 py-0 text-center font-mono">
                        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 whitespace-normal leading-snug">
                          {automaticKgrScore !== null
                            ? <span className={kgrColor}>{kgrText}</span>
                            : kgrState
                              ? <span className={`${kgrTextBadge} ${kgrState.className}`}>{kgrState.label}</span>
                              : <span className="text-text-muted">Não calculável</span>}
                          <select
                            value={kgrApplicability}
                            onChange={(event) => void handleHumanReviewAction(item.id, { type: "kgr", applicability: event.target.value as KgrApplicability })}
                            disabled={updating || bulkActionProcessing}
                            aria-label="Aplicabilidade do KGR"
                            title={`Aplicabilidade do KGR: ${kgrApplicabilityLabel(kgrApplicability)}. A decisão não altera o score nem o status.`}
                            className={`w-full cursor-pointer rounded border px-1 py-0 text-center font-sans text-[10px] font-bold leading-4 focus:border-module-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${kgrApplicabilityClass}`}
                          >
                            <option value="pending">Pendente</option>
                            <option value="applicable">Aplicável</option>
                            <option value="not_applicable">Não aplicável</option>
                          </select>
                        </div>
                      </td>

                      {/* CPC — mesma evidência Google Ads da etapa Volume */}
                      <td className="w-[96px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <span
                          className={cpcEvidence.source === "processor" && cpcEvidence.sortValue !== null ? "text-context-accent" : undefined}
                          title={cpcTitle}
                        >
                          {cpcEvidence.sortValue !== null ? formatGoogleAdsCpcTableValue(cpcEvidence) : <ProcessorMetricPlaceholder cell={cpcCell} />}
                        </span>
                      </td>

                      {/* KD — evidência SEO DataForSEO Keyword Overview */}
                      <td className="w-[70px] border-r border-divider/70 px-2 py-1 text-center font-mono text-text-muted">
                        <span
                          className={keywordDifficultyEvidence.source === "processor" && keywordDifficultyEvidence.value !== null ? "text-context-accent" : undefined}
                          title={keywordDifficultyTitle}
                        >
                          {keywordDifficultyEvidence.value !== null ? keywordDifficultyEvidence.value : <ProcessorMetricPlaceholder cell={kdCell} />}
                        </span>
                      </td>

                      {/* Intenção */}
                      <td className="w-[168px] border-r border-divider/70 px-3 py-1 text-center whitespace-nowrap">
                        <span
                          title={intentLabel}
                          className={`inline-flex max-w-full rounded border px-1.5 py-0.5 text-[9px] font-bold leading-snug ${intentIsPending ? "border-divider bg-surface-subtle text-text-muted" : "border-divider bg-surface-subtle text-foreground/80"}`}
                        >
                          {/* R9: na célula, a forma curta ("Misto: Nav × Trans"); o título mostra o rótulo inteiro. */}
                          <span className="truncate">{keywordReadModel.intentCompactLabel || intentLabel}</span>
                        </span>
                      </td>

                      {/* Nicho de mercado — projeção canônica somente leitura */}
                      <td className="w-[168px] border-r border-divider/70 px-3 py-0.5 text-center">
                        <span title={keywordReadModel.niche || "Nicho ainda não informado"} className="inline-flex max-w-full rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold text-foreground/80">
                          <span className="truncate">{keywordReadModel.nicheLabel}</span>
                        </span>
                      </td>

                      {/* Funil */}
                      <td className="w-[80px] border-r border-divider/70 px-3 py-1 text-center font-mono text-text-muted">
                        <span className="inline-flex min-w-12 max-w-full justify-center rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-[10px] font-bold text-foreground/80" title={keywordReadModel.funnel || (keywordReadModel.funnelLabel !== "—" ? keywordReadModel.funnelLabel : "Funil ainda não informado")}>
                          {/* "Misto na SERP (A × B)" (R9) não cabe na coluna: a célula diz "Misto", e o título mostra inteiro. */}
                          <span className="truncate">{keywordReadModel.funnelCompactLabel || keywordReadModel.funnelLabel}</span>
                        </span>
                      </td>

                      {/* Status — leitura: a classificação atual, escrita na barra e no DNA. */}
                      <td className="relative w-[108px] px-3 py-0.5 text-center">
                        {editorialStatus.kind === "legacyEditorialStatusUnresolved" ? (
                          <div className="flex min-w-0 flex-col items-center gap-1">
                            <span className="inline-flex w-full items-center justify-center rounded border border-divider bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-muted" title="O status legado não é um estado editorial ativo. Escolha um estado para corrigir a marcação.">
                              Status a definir
                            </span>
                            {publicationLink.action === "correct_legacy" && (
                              <select
                                value={recoveryStatus}
                                onChange={(event) => setLegacyEditorialRecovery({ keywordId: item.id, status: event.target.value as EditorialKeywordStatus | "" })}
                                aria-label={`Estado editorial para recuperar ${item.keyword}`}
                                className="w-full rounded border border-divider bg-surface-subtle px-1 py-1 text-center text-[10px] font-medium text-foreground focus:border-module-accent focus:outline-none"
                              >
                                <option value="">Escolher status</option>
                                {MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            )}
                          </div>
                        ) : (
                          /* Informação, não comando: a classificação é escrita
                             na barra do rodapé (em lote ou uma a uma) e no card
                             do DNA. Aqui só se lê o estado atual. */
                          <div className="flex min-w-0 flex-col items-center gap-0.5">
                            <span
                              className={"inline-flex w-full items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-bold " + (
                                editorialStatus.status === "aprovado"
                                  ? "text-success border-success/50 bg-success-soft"
                                  : editorialStatus.status === "em_revisao"
                                  ? "text-warning border-warning/50 bg-warning-soft"
                                  : editorialStatus.status === "rejeitado"
                                  ? "text-danger border-danger/50 bg-danger-soft"
                                  : "border-divider bg-surface-subtle text-text-muted"
                              )}
                              title="Classificação atual. Para alterar, use a barra do rodapé ou o card do DNA."
                            >
                              {editorialStatus.label}
                            </span>
                            {publicationLink.state === "published" && (
                              <span
                                className="inline-flex w-full items-center justify-center rounded border border-danger/50 bg-danger-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-danger"
                                title="Há página declarada no ar. Publicar não aprova: a keyword continua percorrendo os processos até ser aprovada."
                              >
                                Publicado
                              </span>
                            )}
                          </div>
                        )}
                        <KeywordTableRowResizeHandle rowId={item.id} enabled onStart={rowResize.startResize} />
                      </td>
                    </tr>

                    {/* Acordeom ExpansÃ­vel com AnÃ¡lise SemÃ¢ntica DinÃ¢mica em JSONB */}
                    {isExpanded && (
                      <tr className="border-b border-divider bg-surface">
                        <td id={`keyword-dna-${item.id}`} colSpan={14} className="min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere] border-r border-l-2 border-l-module-accent border-divider px-3 py-3">
                          <KeywordDnaPanel
                            keyword={item}
                            visualPosition={index + 1}
                            canonicalUrl={getCanonicalUrl(item) || null}
                            profile={{
                              listName: selectedListName,
                              googleAds: {
                                eligibility: volumeEligibilityLabel(volumeEligibility),
                                eligibilityStatus: String((item.analise_semantica?.volume_eligibility as Record<string, unknown> | undefined)?.status || volumeEligibility),
                                measurement: volumeMeasurement,
                              },
                              dataForSeo: {
                                measurement: allintitleMeasurement,
                                history: allintitleHistory,
                                overview: keywordDifficultyEvidence.measurement,
                              },
                              kgr: {
                                volumeUsed: volumeValue,
                                allintitleUsed: resultValue,
                                score: automaticKgrScore,
                                calculable: automaticKgrScore !== null,
                                applicability: kgrApplicabilityLabel(kgrApplicability),
                                decision: kgrDecisionLabel(kgrApplicability),
                                measurement: kgrMeasurementLabel(kgrMeasurement),
                                consistency: volumeKgrConsistencyLabel(volumeKgrConsistency),
                                history: Array.isArray(item.analise_semantica?.kgr_score_history) ? item.analise_semantica.kgr_score_history : [],
                                justification: typeof item.analise_semantica?.kgr_justificativa === "string" ? item.analise_semantica.kgr_justificativa : null,
                              },
                            }}
                            primaryPolicy={primaryKeywordPolicy}
                            primaryPolicyLabel={primaryKeywordPolicyLabel(primaryKeywordPolicy)}
                            publication={{
                              label: publicationLink.label,
                              url: publicationLink.url,
                              canonicalUrl: publicationLink.canonicalUrl,
                              checkedAt: readSiteOrigin(item.analise_semantica)?.lastCheckedAt ?? null,
                              canConfirm: publicationLink.action === "confirm",
                              canUnlink: publicationLink.action === "unlink",
                            }}
                            onCheckByLink={() => openManualSiteCheck(item)}
                            onSubjectSearch={item.id ? () => router.push(subjectSearchLinkHref(brandRef, item.id)) : undefined}
                            onPublicationAction={(action) => handlePublicationLinkAction(item, action)}
                            allowPublishedWorkflowStatus={false}
                            statusUpdating={updating}
                            onWorkflowStatusChange={(status) => handleUpdateStatus(item.id, status)}
                            onHumanReviewAction={(action) => handleHumanReviewAction(item.id, action)}
                            processAttempts={processAttemptsByKeywordId[item.id]}
                            reviewDraftActive={Boolean(humanReviewDrafts[item.id])}
                            semanticConsolidationDraft={semanticConsolidationDrafts[item.id]}
                            semanticQualification={semanticQualifications[item.id] || null}
                            serpCollecting={allintitleMeasuring && selectedIds.has(item.id)}
                            serpFailed={Boolean(serpCollectionFailures[item.id])}
                            humanReviewOpen={humanReviewOpenId === item.id}
                            onHumanReviewOpenChange={(open) => setHumanReviewOpenId(open ? item.id : null)}
                          />

                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </KeywordTableShell>
      {selectedIds.size > 0 && <div aria-hidden="true" data-bulk-bar-spacer className="h-11 shrink-0" />}

      {/* FOOTER BATCH ACTIONS BAR */}
      {selectedIds.size > 0 && (
        <KeywordTableBulkBarShell className="font-sans">
          
          <div className="flex shrink-0 items-center gap-1 border-r border-divider pr-2 text-sm font-medium text-text-muted sm:gap-1.5 sm:pr-3">
            <span className="font-semibold text-foreground">{selectedIds.size}</span>
            <span>selecionada{selectedIds.size === 1 ? "" : "s"}</span>
            {hiddenSelectedCount > 0 && <span className="hidden text-xs text-text-muted lg:inline">· {visibleSelectedCount} visíveis</span>}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin] sm:gap-2">
            <div className="hidden shrink-0 items-center border-r border-divider pr-2 sm:flex sm:pr-3">
            
            <MineradorProcessAction
              title="Verificar se a keyword já pertence ao site"
              description="Procura ou confirma uma página existente da Marca para identificar vínculo com conteúdo publicado. A conferência não publica nem altera a página."
              label="Conferir site"
              ariaLabel="Conferir site"
              icon={siteSyncLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void handleCheckWithSite()}
              disabled={bulkActionProcessing || updating || siteSyncLoading || siteSyncPersisting || loading || !selectedBrandId}
              activeClassName={bulkActionStateClass("site")}
            />
            </div>

            <div data-bulk-workflow-core className="flex shrink-0 items-center gap-0.5 text-sm font-medium sm:gap-1">
            {/* Qualificação principal: atua somente sobre a seleção atual. */}
            {/* Compatibility marker for the compact process-action contract: <span className="hidden lg:inline">Lógica</span> */}
            <MineradorProcessAction
              title="Interpretar o significado da keyword"
              description="Analisa a keyword de forma determinística para identificar intenção, entidade, modificadores, nicho, funil e outros sinais do KeywordDNA. Não consulta APIs externas."
              label="Lógica"
              ariaLabel="Lógica"
              icon={dnaProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Brain className="h-4 w-4" aria-hidden="true" />}
              onClick={handleQualifySelected}
              disabled={bulkActionProcessing || updating || queueProcessing || dnaProcessing || loading || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("logic")}
            />
            <MineradorProcessAction
              title="Atualizar demanda de busca"
              description="Consulta no Google Ads as métricas disponíveis para as keywords selecionadas, como volume, CPC, tendência e concorrência."
              label="Volume"
              ariaLabel="Volume"
              icon={volumeMeasuring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BarChart3 className="h-4 w-4" aria-hidden="true" />}
              onClick={handleBatchQualify}
              disabled={bulkActionProcessing || updating || volumeMeasuring}
              activeClassName={bulkActionStateClass("volume")}
            />
            <MineradorProcessAction
              title="Medir concorrência orgânica"
              description={`${someSelectedHaveAllintitle ? "Medir/Atualizar resultados" : "Medir/Atualizar resultados"}. Consulta os dados orgânicos usados pelo Minerador para avaliar competição, Resultado, KD e outras evidências disponíveis para a keyword.`}
              label="Resultados"
              ariaLabel="Resultados"
              icon={allintitleMeasuring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              onClick={handleBatchAllintitle}
              disabled={bulkActionProcessing || updating || volumeMeasuring || allintitleMeasuring || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("results")}
            />
            <MineradorProcessAction
              title="Confirmar as decisões do KeywordDNA"
              description="Abre a revisão humana para registrar decisões que só um humano pode tomar. É opcional: não condiciona aprovação, status nem envio ao Arquiteto."
              label="Revisar"
              ariaLabel="Revisar"
              icon={bulkActionProcessing && bulkProgress.step === "review" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              onClick={handleOpenHumanReview}
              disabled={bulkActionProcessing || updating || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("review")}
            />
            </div>

            <div data-bulk-workflow-secondary className="ml-auto flex shrink-0 items-center gap-1 border-l border-divider pl-2 sm:gap-2 sm:pl-3">
            <select
              defaultValue=""
              disabled={bulkActionProcessing || updating}
              aria-label="Aplicabilidade do KGR das selecionadas"
              onChange={(event) => { const nextApplicability = event.target.value; event.currentTarget.value = ""; if (isBatchKgrChoice(nextApplicability)) { kgrBatchTriggerRef.current = event.currentTarget; setKgrBatchConfirm(nextApplicability); } }}
              className={`hidden min-h-9 w-16 shrink-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:border-module-accent/45 hover:bg-surface-subtle focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50 2xl:block sm:w-20 sm:px-2 ${BULK_SELECT_THEME}`}
              title="Definir a aplicabilidade do KGR das keywords selecionadas. A decisão não altera o score nem o status. Keyword com Assunto declarado é pulada."
            >
              <option value="">KGR</option>
              <option value="pending">Pendente</option>
              <option value="applicable">Aplicável</option>
              <option value="not_applicable">Não aplicável</option>
            </select>
            {/* Vínculo em grupo (F1.6): um seletor só, que abre o painel com
                os três grupos. Nada é gravado no clique. Reabrir revisão,
                conferir por link e confirmar publicada ficam fora (Q5). */}
            <button
              type="button"
              data-vinculo-batch-trigger
              onClick={(event) => { if (vinculoBatchDialogOpen) setVinculoBatchDialog(null); else openVinculoBatchPanel(event.currentTarget); }}
              disabled={bulkActionProcessing || updating}
              aria-haspopup="dialog"
              aria-expanded={vinculoBatchDialogOpen}
              aria-controls={vinculoBatchDialogOpen ? "minerador-vinculo-batch-panel" : undefined}
              aria-label="Vínculo das selecionadas"
              title="Vínculo das selecionadas: Posto de principal, Potencial de página e Assunto, os mesmos campos da Revisão Humana. Nada é gravado antes de Aplicar."
              className="hidden min-h-9 shrink-0 items-center gap-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:border-module-accent/45 hover:bg-surface-subtle focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50 2xl:inline-flex sm:px-2"
            >
              Vínculo
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* Ordem do fluxo humano: KGR → Vínculo → concluir revisão → definir status. */}
            <MineradorProcessAction
              title="Concluir a revisão humana das selecionadas"
              description="Conclui a Revisão Humana de cada keyword selecionada com os defaults conservadores: divergências sem decisão mantêm a Lógica, enriquecimentos não selecionados são ignorados e campos sem evidência permanecem desconhecidos. Exige a Aplicabilidade do KGR decidida quando o cálculo é possível. Não altera status, aprovação nem métricas."
              label="Concluir revisão"
              ariaLabel="Concluir revisão das selecionadas"
              icon={bulkActionProcessing && bulkProgress.step === "review" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void handleBatchCompleteHumanReview()}
              disabled={bulkActionProcessing || updating || selectedIds.size === 0}
              activeClassName={bulkActionStateClass("review")}
            />
            <select
              defaultValue=""
              disabled={bulkActionProcessing || updating}
              aria-label="Status"
              onChange={(event) => { const nextStatus = event.target.value; event.currentTarget.value = ""; if (nextStatus) void handleBatchStatus(nextStatus); }}
              className={`hidden min-h-9 w-20 shrink-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:border-module-accent/45 hover:bg-surface-subtle focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50 min-[1800px]:block sm:w-24 sm:px-2 ${BULK_SELECT_THEME}`}
              title="Definir o status operacional das keywords selecionadas"
            >
              <option value="">Status</option>
              {MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>

            <div ref={moreActionsRef} className="relative shrink-0">
              <button
              ref={moreActionsButtonRef}
              type="button"
              onClick={() => setMoreActionsOpen(current => !current)}
                disabled={bulkActionProcessing}
                className="flex min-h-9 min-w-9 items-center justify-center rounded border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-foreground transition-colors hover:border-module-accent/45 hover:bg-surface-subtle hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:cursor-not-allowed disabled:opacity-50"
                aria-expanded={moreActionsOpen}
                aria-haspopup="menu"
                aria-controls="minerador-more-actions-menu"
                aria-label="Mais ações"
                title="Mais ações"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
              {moreActionsOpen && <div id="minerador-more-actions-menu" role="menu" className="fixed bottom-12 right-2 z-50 flex min-w-56 flex-col gap-1 rounded border border-divider bg-surface-elevated p-2 shadow-lg">
                <div role="none" className="flex items-center gap-1 rounded px-2 py-1 sm:hidden">
                  <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleCheckWithSite(); }} disabled={bulkActionProcessing || updating || siteSyncLoading || siteSyncPersisting || loading || !selectedBrandId} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm font-medium text-context-accent transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Conferir site</button>
                  <InfoHint title="Verificar se a keyword já pertence ao site" description="Procura ou confirma uma página existente da Marca para identificar vínculo com conteúdo publicado. A conferência não publica nem altera a página." />
                </div>
                <label className="flex items-center justify-between gap-3 rounded px-3 py-2 text-sm font-medium text-text-muted min-[1800px]:hidden">
                  <span>Status</span>
                  <select
                    defaultValue=""
                    disabled={bulkActionProcessing || updating}
                    aria-label="Status"
                    onChange={(event) => { const nextStatus = event.target.value; event.currentTarget.value = ""; if (nextStatus) void handleBatchStatus(nextStatus); }}
                    className={`min-h-9 min-w-24 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm font-medium text-foreground outline-none focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50 ${BULK_SELECT_THEME}`}
                  >
                    <option value="">Selecionar</option>
                    {MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 rounded px-3 py-2 text-sm font-medium text-text-muted 2xl:hidden">
                  <span>KGR</span>
                  <select
                    defaultValue=""
                    disabled={bulkActionProcessing || updating}
                    aria-label="Aplicabilidade do KGR das selecionadas"
                    onChange={(event) => { const nextApplicability = event.target.value; event.currentTarget.value = ""; if (isBatchKgrChoice(nextApplicability)) { kgrBatchTriggerRef.current = moreActionsButtonRef.current; setMoreActionsOpen(false); setKgrBatchConfirm(nextApplicability); } }}
                    className={`min-h-9 min-w-24 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm font-medium text-foreground outline-none focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:opacity-50 ${BULK_SELECT_THEME}`}
                  >
                    <option value="">Selecionar</option>
                    <option value="pending">Pendente</option>
                    <option value="applicable">Aplicável</option>
                    <option value="not_applicable">Não aplicável</option>
                  </select>
                </label>
                <button
                  type="button"
                  role="menuitem"
                  data-vinculo-batch-trigger
                  onClick={() => { setMoreActionsOpen(false); openVinculoBatchPanel(moreActionsButtonRef.current); }}
                  disabled={bulkActionProcessing || updating}
                  aria-haspopup="dialog"
                  className="flex min-h-9 items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:cursor-not-allowed disabled:opacity-50 2xl:hidden"
                >
                  <span>Vínculo</span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <InfoHint title="Enviar ao Arquiteto" description="Envia as keywords aprovadas para a etapa de formação de artigos.">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMoreActionsOpen(false); void handleBatchSendToArchitect(); }}
                    disabled={bulkActionProcessing || updating || queueProcessing || dnaProcessing || architectHandoffSending || !architectHandoffGate.ok}
                    className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium text-context-accent transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Enviar ao Arquiteto"
                    aria-describedby={architectHandoffGate.ok ? undefined : "minerador-architect-handoff-gate"}
                  >
                    {architectHandoffSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    <span>{architectHandoffSending ? "Enviando ao Arquiteto..." : "Enviar ao Arquiteto"}</span>
                  </button>
                </InfoHint>
                {!architectHandoffGate.ok && (
                  <p id="minerador-architect-handoff-gate" role="note" className="px-3 text-sm leading-5 text-text-muted">
                    {architectHandoffGate.reason}
                  </p>
                )}
                <button type="button" role="menuitem" onClick={() => { setMoreActionsOpen(false); void handleBatchDelete(false); }} disabled={bulkActionProcessing || updating || queueProcessing} className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50 min-[1800px]:hidden"><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir</button>
              </div>}
            </div>

            {/* Excluir */}
            <button
              onClick={() => void handleBatchDelete(false)}
              disabled={bulkActionProcessing || updating || queueProcessing}
              aria-label="Excluir"
              className="hidden min-h-9 shrink-0 items-center gap-1 rounded border border-danger/35 bg-transparent px-1.5 py-1 text-sm font-medium text-danger transition-colors hover:border-danger/60 hover:bg-danger-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-50 min-[1800px]:flex lg:px-2"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden lg:inline">Excluir</span>
            </button>
            </div>
          </div>

          {bulkProgress.status !== "idle" && bulkProgress.step && bulkProgressMeta && (
            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">
              <div
                data-minerador-bulk-progress
                data-progress-state={bulkProgress.status}
                data-progress-step={bulkProgress.step}
                data-progress-failed={bulkProgress.failed}
                aria-live="polite"
                title={bulkProgress.message || bulkProgressMeta.processingLabel}
                className={`min-w-0 w-36 shrink-0 rounded border px-2 py-0.5 sm:w-64 lg:w-80 ${bulkProgressCardClass}`}
              >
                <div className="flex min-w-0 items-center gap-1">
                  <span className={`min-w-0 flex-1 truncate text-sm font-semibold leading-4 ${bulkProgress.status === "success" ? "text-success" : bulkProgress.status === "error" ? "text-danger" : bulkProgressMeta.textClass}`}>
                    {bulkProgress.status === "processing" ? bulkProgress.message || bulkProgressMeta.processingLabel : bulkProgress.batch ? bulkProgress.message : bulkProgress.status === "success" ? "Concluído" : "Falhou"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold leading-4 tabular-nums text-foreground">
                    {bulkProgressDisplayPercentage === null ? "—" : `${bulkProgressDisplayPercentage}%`}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={bulkProgressMeta.processingLabel}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={bulkProgressIndeterminate ? undefined : bulkProgressBarPercentage}
                  aria-valuetext={bulkProgressAriaValueText}
                  className="mt-0.5 h-1 overflow-hidden rounded-full bg-divider"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${bulkProgressMeta.barClass} ${bulkProgress.status === "processing" && bulkProgressIndeterminate ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""}`}
                    style={{ width: `${bulkProgressBarPercentage}%` }}
                  />
                </div>
                <div className="truncate text-sm leading-4 text-text-muted">
                  {bulkProgress.status === "processing" ? `${bulkProgress.detail || (bulkProgress.total ? `${bulkProgress.current} de ${bulkProgress.total} keywords` : "Em andamento")}${bulkChunkElapsed ? ` · ${bulkChunkElapsed}` : ""}` : bulkProgress.batch ? bulkProgressMeta.label : bulkProgress.message}
                </div>
              </div>
              {bulkProgress.status === "processing" && bulkProgress.stoppable && (
                <button
                  type="button"
                  onClick={requestBulkStop}
                  aria-label="Parar o lote depois do bloco atual"
                  className="min-h-9 shrink-0 rounded border border-divider px-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent"
                >
                  Parar
                </button>
              )}
              {bulkProgress.status !== "processing" && bulkProgress.failures.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setBulkFailuresOpen(open => !open)}
                    aria-expanded={bulkFailuresOpen}
                    aria-controls="minerador-bulk-failures"
                    className="min-h-9 shrink-0 rounded border border-warning/40 px-2 text-sm font-medium text-warning transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-warning"
                  >
                    Ver falhas ({bulkProgress.failures.length})
                  </button>
                  <button
                    type="button"
                    onClick={dismissBulkProgress}
                    aria-label="Fechar o resumo do lote"
                    className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-context-accent"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          )}
          {bulkFailuresOpen && bulkProgress.status !== "processing" && bulkProgress.failures.length > 0 && (
            <div
              id="minerador-bulk-failures"
              role="region"
              aria-label="Falhas do lote"
              data-minerador-bulk-failures
              className="fixed bottom-12 right-4 z-40 max-h-72 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-divider bg-surface-elevated p-3 text-sm text-foreground shadow-lg"
            >
              <p className="font-semibold">{bulkProgress.message}</p>
              <ul className="mt-2 space-y-1">
                {bulkProgress.failures.map(failure => (
                  <li key={failure.id} className="leading-5">
                    <span className="font-medium text-keyword">{failure.label}</span>
                    <span className="text-text-muted">: {failure.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </KeywordTableBulkBarShell>
      )}

      {/* Painel do Vínculo em grupo (F1.6): os três selects da Revisão Humana e a
          confirmação no próprio painel — o que será gravado, o que será
          pulado e quantas aprovadas vão para Em revisão. Nada é gravado antes
          de "Aplicar". Some junto com a seleção. */}
      {vinculoBatchDialog && selectedIds.size > 0 && (
        <section
          id="minerador-vinculo-batch-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="minerador-vinculo-batch-title"
          aria-describedby="minerador-vinculo-batch-summary"
          data-vinculo-batch-dialog
          ref={vinculoBatchDialogRef}
          tabIndex={-1}
          style={{ right: vinculoBatchPanelRight }}
          className="fixed bottom-12 z-50 flex max-h-[calc(100dvh-4rem)] w-[min(28rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated font-sans text-foreground shadow-xl outline-none"
        >
          <header className="shrink-0 border-b border-divider px-4 py-3">
            <h2 id="minerador-vinculo-batch-title" className="text-base font-semibold text-foreground">Vínculo das selecionadas</h2>
            <p className="mt-0.5 text-sm text-text-muted">Os mesmos campos da Revisão Humana. Cada um mostra o valor das selecionadas, ou &quot;{VINCULO_MIXED_LABEL}&quot;; só o que você mudar é gravado.</p>
            {vinculoBatchDraftCount > 0 && (
              <p data-vinculo-batch-draft-note className="mt-1 text-sm text-warning">
                {vinculoBatchDraftCount === 1 ? "1 selecionada tem Revisão Humana aberta" : `${vinculoBatchDraftCount} selecionadas têm Revisão Humana aberta`}: aqui aparece o valor gravado, não o do rascunho que a coluna mostra.
              </p>
            )}
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {vinculoBatchCommon && (
              <div data-vinculo-batch-selects className="min-w-0 space-y-1.5">
                <VinculoPostSelect
                  id="minerador-vinculo-batch-post"
                  value={vinculoBatchSelectValue("post", vinculoBatchDialog, vinculoBatchCommon)}
                  disabled={updating || vinculoBatchPostLocked}
                  subjectDeclared={vinculoBatchPostLocked}
                  describedBy={vinculoBatchPostLocked ? "minerador-vinculo-batch-post-disabled" : undefined}
                  onChange={value => chooseVinculoBatch("post", value)}
                />
                {vinculoBatchPostLocked && <p id="minerador-vinculo-batch-post-disabled" className="text-sm text-text-muted">{VINCULO_BATCH_POST_DISABLED_BY_SUBJECT}</p>}
                <VinculoPageTypeSelect
                  id="minerador-vinculo-batch-page-type"
                  value={vinculoBatchSelectValue("page_type", vinculoBatchDialog, vinculoBatchCommon)}
                  published={vinculoBatchCommon.publishedOnly}
                  currentValue={vinculoBatchCommon.page_type}
                  disabled={updating}
                  onChange={value => chooseVinculoBatch("page_type", value)}
                />
                <VinculoSubjectSelect
                  id="minerador-vinculo-batch-subject"
                  value={vinculoBatchSelectValue("subject", vinculoBatchDialog, vinculoBatchCommon)}
                  disabled={updating}
                  onChange={value => chooseVinculoBatch("subject", value)}
                />
              </div>
            )}
            {vinculoBatchDeclareOpen && (
              <div className="min-w-0">
                <VinculoSubjectFields
                  batch
                  note={vinculoBatchDialog.note}
                  destination={vinculoBatchDialog.destination}
                  disabled={updating}
                  onNoteChange={value => setVinculoBatchDialog(current => current ? { ...current, note: value } : current)}
                  onDestinationChange={value => setVinculoBatchDialog(current => current ? { ...current, destination: value } : current)}
                />
                <p className="mt-1 text-sm text-text-muted">Nota em branco: a coluna marca &quot;{KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL}&quot; até você completar na Revisão Humana.</p>
              </div>
            )}
            {vinculoBatchPreview && !vinculoBatchPreview.ok && (
              <p role="alert" className="text-sm leading-6 text-danger">{vinculoBatchPreview.reason}</p>
            )}
            <div id="minerador-vinculo-batch-summary" aria-live="polite" className="space-y-1.5 border-t border-divider pt-3 text-sm leading-6">
              {vinculoBatchPreviewText ? (
                <>
                  <p className="font-semibold text-foreground">{vinculoBatchPreviewText.summary}</p>
                  {vinculoBatchPreviewText.steps.map(step => (
                    <div key={step.summary}>
                      <p className="text-foreground">{step.summary}</p>
                      {step.details.map(detail => <p key={detail} className="text-text-muted">{detail}</p>)}
                    </div>
                  ))}
                  {vinculoBatchPreviewText.warning && (
                    <p role="note" data-vinculo-demotion-warning className="font-semibold text-warning">{vinculoBatchPreviewText.warning}</p>
                  )}
                  {vinculoBatchDeclareOpen && (
                    <p className="text-text-muted">Depois de gravar, a Lógica roda sozinha nas que ainda não a têm. Nada é aprovado.</p>
                  )}
                </>
              ) : !vinculoBatchPreview && (
                <p className="text-text-muted">Mude ao menos um campo para ver o que será gravado.</p>
              )}
            </div>
          </div>
          <footer className="flex shrink-0 flex-col-reverse justify-end gap-2 border-t border-divider px-4 py-3 sm:flex-row">
            <button type="button" onClick={() => setVinculoBatchDialog(null)} disabled={updating} className="inline-flex h-9 items-center justify-center rounded border border-divider bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40 disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
            <button
              type="button"
              data-vinculo-batch-apply
              onClick={() => void handleBatchVinculo(vinculoBatchDialog)}
              disabled={updating || bulkActionProcessing || !vinculoBatchPreview?.ok || vinculoBatchPreview.counts.updates === 0}
              className="inline-flex h-9 items-center justify-center rounded border border-action-accent bg-action-accent px-3 text-sm font-semibold text-foreground transition-colors hover:bg-action-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aplicar
            </button>
          </footer>
        </section>
      )}

      {/* Confirmação do KGR em grupo: nada é gravado antes de Confirmar. */}
      {kgrBatchConfirm && kgrBatchPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/75 px-4 py-8" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setKgrBatchConfirm(null); }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="minerador-kgr-batch-title"
            aria-describedby="minerador-kgr-batch-summary"
            data-kgr-batch-dialog
            ref={kgrBatchDialogRef}
            tabIndex={-1}
            className="w-full max-w-lg overflow-hidden rounded-lg border border-divider bg-surface-elevated text-foreground shadow-xl outline-none"
          >
            <header className="border-b border-divider px-5 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">KGR das selecionadas</p>
              <h2 id="minerador-kgr-batch-title" className="mt-1 text-lg font-semibold text-foreground">Aplicabilidade do KGR: {kgrApplicabilityLabel(kgrBatchConfirm)}</h2>
            </header>
            <div className="space-y-4 p-5">
              <div id="minerador-kgr-batch-summary" className="space-y-1.5 text-sm leading-6">
                <p className="font-semibold text-foreground">{kgrBatchPreview.summary}</p>
                {kgrBatchPreview.details.map(detail => <p key={detail} className="text-text-muted">{detail}</p>)}
                <p className="text-text-muted">A decisão não altera o score nem o status.</p>
              </div>
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-divider pt-4 sm:flex-row">
                <button type="button" onClick={() => setKgrBatchConfirm(null)} className="inline-flex h-9 items-center justify-center rounded border border-divider bg-surface px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Cancelar</button>
                <button
                  type="button"
                  onClick={() => { const nextApplicability = kgrBatchConfirm; setKgrBatchConfirm(null); void handleBatchKgrApplicability(nextApplicability as KgrApplicability); }}
                  disabled={updating || bulkActionProcessing || kgrBatchPreview.updates === 0}
                  className="inline-flex h-9 items-center justify-center rounded border border-action-accent bg-action-accent px-3 text-sm font-semibold text-foreground transition-colors hover:bg-action-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      <DeleteConfirmation open={deleteSimpleOpen} title="Excluir keywords não publicadas?"
        description="Esta ação excluirá definitivamente as keywords selecionadas e os dados operacionais não publicados que pertencem a elas. Versões e eventos canônicos permanecem preservados."
        confirmationName={deleteReview?.confirmationName || ""} impact={deleteReview?.impact || []} confirmLabel="Excluir definitivamente"
        onCancel={() => { setDeleteSimpleOpen(false); setDeleteReview(null); }} onConfirm={() => handleBatchDelete(true)}/>

      <PublishedDeleteConfirmation open={deleteApprovalOpen} title="Remover keywords publicadas por 24 horas"
        description={`Esta ação removerá ${deleteReview?.publishedIds.length || 0} keyword(s) publicada(s) da operação e permitirá restauração durante 24 horas.`}
        confirmationName={deleteReview?.confirmationName || ""} impact={deleteReview?.impact || []}
        onCancel={() => { setDeleteApprovalOpen(false); setDeleteReview(null); }} onConfirm={() => handleBatchDelete(true)}/>

      {/* Modal de criaÃ§Ã£o de Categoria/Silo */}
      {isListModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded overflow-hidden relative shadow-2xl">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-action-accent"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1">
                <FolderPlus className="w-3.5 h-3.5 text-module-accent" /> Criar Silo / Categoria
              </span>
              <button onClick={() => setIsListModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateList} className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome da Categoria/Silo</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: ClÃ­nicas Campinas, Blog Silo RJ"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="w-full rounded border border-divider bg-surface-subtle px-2.5 py-1.5 text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nicho / Setor do Projeto</label>
                <input 
                  type="text" 
                  placeholder="Ex: Odontologia, Advocacia"
                  value={newListNicho}
                  onChange={(e) => setNewListNicho(e.target.value)}
                  className="w-full rounded border border-divider bg-surface-subtle px-2.5 py-1.5 text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <button 
                  type="button" 
                  onClick={() => setIsListModalOpen(false)} 
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                    className="rounded bg-action-accent px-4 py-1.5 font-bold text-foreground transition-colors hover:bg-action-accent/85"
                >
                  Criar Silo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de ImportaÃ§Ã£o Manual (Copy e Cola) */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-lg rounded overflow-hidden relative shadow-2xl">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-action-accent"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-module-accent" /> Importar Lista Manualmente (Copiar & Colar)
              </span>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualImport} className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  Cole as Palavras-Chave (uma por linha)
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Ex:&#10;como fazer seo para dentista&#10;agencia de marketing clinica estetica&#10;dentista em campinas preco"
                  value={manualKeywordsText}
                  onChange={(e) => setManualKeywordsText(e.target.value)}
                    className="min-h-[120px] w-full resize-y rounded border border-divider bg-surface-subtle px-2.5 py-1.5 font-sans text-xs text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Silo opcional */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">
                    Silo (opcional)
                  </label>
                  <select
                    value={manualListId}
                    onChange={(e) => setManualListId(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    <option value="">Sem silo</option>
                    {lists.map(list => (
                      <option key={list.id} value={list.id}>{list.nome}</option>
                    ))}
                  </select>
                  {lists.length === 0 && <p className="text-xs text-slate-500">Nenhum silo disponível. As keywords serão importadas sem silo.</p>}
                </div>

                {/* LocalizaÃ§Ã£o padrÃ£o */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Localidade / RegiÃ£o</label>
                  <input
                    type="text"
                    placeholder="Ex: Brasil, SP, Rio de Janeiro"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    className="w-full rounded border border-divider bg-surface-subtle px-2.5 py-1.5 text-xs font-semibold text-foreground placeholder:text-text-muted focus:border-module-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* IntenÃ§Ã£o Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">IntenÃ§Ã£o Inicial</label>
                  <select
                    value={manualIntent}
                    onChange={(e) => setManualIntent(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    <option value="">AutomÃ¡tico (HeurÃ­stica)</option>
                    <option value="Informativa">Informativa</option>
                    <option value="Comercial investigativa">Comercial investigativa</option>
                    <option value="Transacional">Transacional</option>
                    <option value="Navegacional">Navegacional</option>
                    <option value="Local">Local</option>
                    <option value="Mista">Mista</option>
                  </select>
                </div>

                {/* Nicho Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Nicho Inicial</label>
                  <select
                    value={manualNicho}
                    onChange={(e) => setManualNicho(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    <option value="">AutomÃ¡tico (HeurÃ­stica)</option>
                    <option value="Odontologia">Odontologia</option>
                    <option value="Advocacia">Advocacia</option>
                    <option value="SaÃºde">SaÃºde</option>
                    <option value="EstÃ©tica">EstÃ©tica</option>
                    <option value="Fitness">Fitness</option>
                    <option value="ServiÃ§os">ServiÃ§os</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Status Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Status Inicial</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="w-full cursor-pointer rounded border border-divider bg-surface-subtle px-2 py-1.5 text-xs font-semibold text-text-muted focus:border-module-accent focus:outline-none"
                  >
                    {MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex items-center gap-1.5 rounded bg-action-accent px-4 py-1.5 font-bold text-foreground transition-colors hover:bg-action-accent/85 disabled:opacity-50"
                >
                  {updating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Importar Palavras</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de ExportaÃ§Ã£o com OpÃ§Ã£o de Renomear Arquivo */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded overflow-hidden relative shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 to-teal-600"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Exportar Planilha (CSV)
              </span>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                exportSelectedToCSV(exportFileName);
                setIsExportModalOpen(false);
              }} 
              className="p-4 flex flex-col gap-3.5"
            >
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome do Arquivo CSV</label>
                <input 
                  type="text" 
                  required
                  placeholder="Nome do arquivo..."
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-emerald-600 text-xs font-semibold"
                />
                <span className="text-[8.5px] text-slate-500 italic mt-0.5">Nota: a extensÃ£o .csv serÃ¡ adicionada automaticamente.</span>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 text-xs">
                <button 
                  type="button" 
                  onClick={() => setIsExportModalOpen(false)} 
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-650 hover:bg-emerald-600 text-white font-bold py-1.5 px-4 rounded transition-all"
                >
                  Exportar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
