import { readPublicationLink, readSiteOrigin, type PublicationLinkEvidence } from "./publication-link.ts";
import { resolveCanonicalPublication } from "../lifecycle/publication.ts";

export type KeywordLifecycleReferenceKind =
  | "google_ads_measurement"
  | "dataforseo_measurement"
  | "discovery_provenance"
  | "discovery_metric_current"
  | "discovery_metric_history"
  | "keyword_dna"
  | "workflow_handoff"
  | "publication_history";

export type KeywordLifecycleReference = {
  kind: KeywordLifecycleReferenceKind;
  count: number;
};

export type KeywordLifecycleDependencyErrorCategory =
  | "TABLE_NOT_FOUND"
  | "COLUMN_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "RLS_DENIED"
  | "INVALID_QUERY"
  | "WRONG_SCHEMA"
  | "LEGACY_TABLE"
  | "OTHER";

export type KeywordLifecycleDependencyDescriptor = {
  readonly key: string;
  readonly schema: "public";
  readonly table: string;
  readonly tenantColumn: "brand_id" | "marca_id";
  readonly referenceColumn: string;
  readonly kind: KeywordLifecycleReferenceKind;
  readonly filters?: readonly { column: string; value: string }[];
  readonly required: boolean;
  readonly applicability: "current_contract" | "optional_current_contract";
  readonly blockingPolicy: "cleanup_on_hard_delete" | "preserve_shared_reference";
};

export type KeywordLifecycleDependencyAuditDiagnostic = {
  dependencyKey: string;
  table: string;
  referenceColumn: string | null;
  errorCode: string;
  errorCategory: KeywordLifecycleDependencyErrorCategory;
  message: string;
};

/**
 * Only tables in the current Minerador contract belong in this active catalog.
 * The 0004 site catalog is a prepared/legacy Marca proposal and is deliberately
 * not queried by normal keyword deletion until that contract is applied and
 * adopted by a real consumer.
 */
export const KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES: readonly KeywordLifecycleDependencyDescriptor[] = [
  {
    key: "minerador_keyword_metric_measurements.keyword_id",
    schema: "public",
    table: "minerador_keyword_metric_measurements",
    tenantColumn: "brand_id",
    referenceColumn: "keyword_id",
    kind: "google_ads_measurement",
    required: true,
    applicability: "current_contract",
    blockingPolicy: "cleanup_on_hard_delete",
  },
  {
    key: "minerador_discovery_keyword_origins.keyword_id",
    schema: "public",
    table: "minerador_discovery_keyword_origins",
    tenantColumn: "brand_id",
    referenceColumn: "keyword_id",
    kind: "discovery_provenance",
    required: true,
    applicability: "current_contract",
    blockingPolicy: "cleanup_on_hard_delete",
  },
  {
    key: "minerador_discovery_candidate_current_metrics.keyword_id",
    schema: "public",
    table: "minerador_discovery_candidate_current_metrics",
    tenantColumn: "brand_id",
    referenceColumn: "keyword_id",
    kind: "discovery_metric_current",
    required: true,
    applicability: "current_contract",
    blockingPolicy: "cleanup_on_hard_delete",
  },
  {
    key: "minerador_discovery_candidate_metric_history.keyword_id",
    schema: "public",
    table: "minerador_discovery_candidate_metric_history",
    tenantColumn: "brand_id",
    referenceColumn: "keyword_id",
    kind: "discovery_metric_history",
    required: true,
    applicability: "current_contract",
    blockingPolicy: "cleanup_on_hard_delete",
  },
  {
    key: "minerador_discovery_candidates.existing_keyword_id",
    schema: "public",
    table: "minerador_discovery_candidates",
    tenantColumn: "brand_id",
    referenceColumn: "existing_keyword_id",
    kind: "discovery_provenance",
    required: true,
    applicability: "current_contract",
    blockingPolicy: "preserve_shared_reference",
  },
  {
    key: "minerador_discovery_candidates.imported_keyword_id",
    schema: "public",
    table: "minerador_discovery_candidates",
    tenantColumn: "brand_id",
    referenceColumn: "imported_keyword_id",
    kind: "discovery_provenance",
    required: true,
    applicability: "current_contract",
    blockingPolicy: "preserve_shared_reference",
  },
  {
    key: "editorial_artifact_versions.keyword_dna.entity_id",
    schema: "public",
    table: "editorial_artifact_versions",
    tenantColumn: "marca_id",
    referenceColumn: "entity_id",
    kind: "keyword_dna",
    filters: [{ column: "artifact_type", value: "keyword_dna" }],
    required: false,
    applicability: "optional_current_contract",
    blockingPolicy: "preserve_shared_reference",
  },
  {
    key: "editorial_workflow_items.keyword.subject_id",
    schema: "public",
    table: "editorial_workflow_items",
    tenantColumn: "marca_id",
    referenceColumn: "subject_id",
    kind: "workflow_handoff",
    filters: [{ column: "subject_type", value: "keyword" }],
    required: true,
    applicability: "current_contract",
    blockingPolicy: "cleanup_on_hard_delete",
  },
  {
    key: "editorial_workflow_items.keyword.source_entity_id",
    schema: "public",
    table: "editorial_workflow_items",
    tenantColumn: "marca_id",
    referenceColumn: "source_entity_id",
    kind: "workflow_handoff",
    filters: [{ column: "subject_type", value: "keyword" }],
    required: true,
    applicability: "current_contract",
    blockingPolicy: "cleanup_on_hard_delete",
  },
];

type DependencyErrorLike = {
  code?: unknown;
  message?: unknown;
};

function dependencyErrorLike(error: unknown): DependencyErrorLike {
  return error && typeof error === "object" ? error as DependencyErrorLike : {};
}

function dependencyErrorCode(error: unknown): string {
  const code = dependencyErrorLike(error).code;
  return typeof code === "string" && code.trim() ? code.trim() : "UNKNOWN";
}

function sanitizeDependencyErrorMessage(error: unknown): string {
  const message = dependencyErrorLike(error).message;
  const raw = typeof message === "string" && message.trim() ? message : "Falha não especificada na consulta de dependência.";
  return raw
    .replace(/bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|password|authorization)\s*[:=]\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 240);
}

export function classifyKeywordLifecycleDependencyError(error: unknown): KeywordLifecycleDependencyErrorCategory {
  const code = dependencyErrorCode(error).toUpperCase();
  const message = String(dependencyErrorLike(error).message || "").toLowerCase();

  if (code === "42P01" || code === "PGRST205" || /relation .* does not exist|table .* does not exist|could not find the .* relation|schema cache.*relation/.test(message)) return "TABLE_NOT_FOUND";
  if (code === "42703" || code === "PGRST204" || /column .* does not exist|could not find the .* column|schema cache.*column/.test(message)) return "COLUMN_NOT_FOUND";
  if (/row[- ]level security|rls|policy .* denied|new row violates row-level/.test(message)) return "RLS_DENIED";
  if (code === "42501" || /permission denied|insufficient privilege|not authorized|not allowed/.test(message)) return "PERMISSION_DENIED";
  if (code === "42601" || code === "22P02" || /syntax error|invalid query|malformed/.test(message)) return "INVALID_QUERY";
  if (/schema .* does not exist|unknown schema|wrong schema/.test(message)) return "WRONG_SCHEMA";
  if (/legacy|historical|deprecated/.test(message)) return "LEGACY_TABLE";
  return "OTHER";
}

export class KeywordLifecycleDependencyAuditError extends Error {
  readonly code = "KEYWORD_DEPENDENCY_AUDIT_FAILED";
  readonly diagnostic: KeywordLifecycleDependencyAuditDiagnostic;

  constructor(
    subject: Pick<KeywordLifecycleDependencyDescriptor, "key" | "table" | "referenceColumn">,
    cause?: unknown,
  ) {
    super(`Não foi possível auditar a dependência da keyword em ${subject.table}.`);
    this.name = "KeywordLifecycleDependencyAuditError";
    this.diagnostic = {
      dependencyKey: subject.key,
      table: subject.table,
      referenceColumn: subject.referenceColumn,
      errorCode: dependencyErrorCode(cause),
      errorCategory: classifyKeywordLifecycleDependencyError(cause),
      message: sanitizeDependencyErrorMessage(cause),
    };
    if (cause) this.cause = cause;
  }
}

export const KEYWORD_RECOVERABLE_WINDOW_HOURS = 24;
export const KEYWORD_RECOVERABLE_WINDOW_MS = KEYWORD_RECOVERABLE_WINDOW_HOURS * 60 * 60 * 1000;

export type KeywordLifecycleAssessmentInput = {
  keywordId: string;
  /** This value is resolved by the server/RPC; the browser cannot override it. */
  publicationProtected: boolean;
  semantic?: Record<string, unknown> | null;
  volumeSearch?: number | null;
  resultsAllintitle?: number | null;
  volumeSource?: string | null;
  references?: readonly KeywordLifecycleReference[];
};

export type KeywordPublicationResolution = {
  isPublished: boolean;
  source: "formal_site_link" | "legacy_unverified" | "none";
};

export type KeywordHardDeleteDecision =
  | { allowed: true; keywordId: string; reason: "not_published" }
  | { allowed: false; keywordId: string; reason: "published" };

export type KeywordLifecycleTombstone = {
  deleted_at?: string | null;
  purge_after?: string | null;
};

/**
 * The browser can only provide a hint. The server/RPC is authoritative and
 * resolves PublicationRecord/lineage. A legacy status is diagnostic only and
 * never activates the recoverable delete path.
 */
export function resolveKeywordPublication(input: {
  status?: string | null;
  semantic?: Record<string, unknown> | null;
}): KeywordPublicationResolution {
  const evidence = readSiteOrigin(input.semantic || null);
  const view = readPublicationLink({ status: input.status, evidence });
  const resolution = resolveCanonicalPublication({ formalSite: evidence, legacyStatus: input.status });
  if (resolution.isPublished && view.state === "published") return { isPublished: true, source: "formal_site_link" };
  if (resolution.source === "legacy_unverified") return { isPublished: false, source: "legacy_unverified" };
  return { isPublished: false, source: "none" };
}

export function isKeywordPublished(input: { status?: string | null; semantic?: Record<string, unknown> | null }): boolean {
  return resolveKeywordPublication(input).isPublished;
}

export function assessKeywordHardDelete(input: KeywordLifecycleAssessmentInput): KeywordHardDeleteDecision {
  if (input.publicationProtected) {
    return { allowed: false, keywordId: input.keywordId, reason: "published" };
  }

  // Measurements, Discovery links, DNA and workflow rows are cleaned by the
  // single server-side transaction. They never turn a non-published keyword
  // into an immortal record or a recoverable tombstone.
  return { allowed: true, keywordId: input.keywordId, reason: "not_published" };
}

export function keywordHardDeleteBlockMessage(decision: Exclude<KeywordHardDeleteDecision, { allowed: true }>): string {
  return decision.reason === "published"
    ? "Esta keyword está vinculada a conteúdo publicado. Ela será removida da operação e poderá ser restaurada durante 24 horas."
    : "A exclusão não pôde ser concluída.";
}

export function keywordLifecycleReferenceLabel(kind: KeywordLifecycleReferenceKind): string {
  const labels: Record<KeywordLifecycleReferenceKind, string> = {
    google_ads_measurement: "medições Google Ads",
    dataforseo_measurement: "medições DataForSEO",
    discovery_provenance: "proveniência da Descoberta",
    discovery_metric_current: "métricas atuais da Descoberta",
    discovery_metric_history: "histórico de métricas",
    keyword_dna: "DNA/análise semântica",
    workflow_handoff: "histórico de workflow",
    publication_history: "histórico de publicação",
  };
  return labels[kind];
}

export function recoverablePurgeAfter(deletedAt: string | Date): string {
  const base = deletedAt instanceof Date ? deletedAt.getTime() : Date.parse(deletedAt);
  if (!Number.isFinite(base)) throw new Error("deleted_at inválido");
  return new Date(base + KEYWORD_RECOVERABLE_WINDOW_MS).toISOString();
}

export function isKeywordRecoverable(row: KeywordLifecycleTombstone): boolean {
  return Boolean(row.deleted_at && row.purge_after);
}

export function canRestoreKeyword(row: KeywordLifecycleTombstone, now = new Date()): boolean {
  if (!row.deleted_at || !row.purge_after) return false;
  const purgeAt = Date.parse(row.purge_after);
  return Number.isFinite(purgeAt) && now.getTime() < purgeAt;
}

export function keywordRecoveryRemainingLabel(row: KeywordLifecycleTombstone, now = new Date()): string {
  if (!row.purge_after) return "Janela de recuperação indisponível";
  const remainingMs = Date.parse(row.purge_after) - now.getTime();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "Janela encerrada";
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h restantes`;
  return `${Math.max(1, minutes)}min restantes`;
}

export function publicationEvidenceForLifecycle(semantic: Record<string, unknown> | null | undefined): PublicationLinkEvidence | null {
  return readSiteOrigin(semantic || null);
}
