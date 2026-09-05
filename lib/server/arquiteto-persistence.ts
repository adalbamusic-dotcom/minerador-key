import "server-only";

import type {
  ArticleDNA,
  SiloDNA,
  SiloPage,
  VersionEnvelope,
} from "@/lib/arquiteto/contracts";
import type { ArticleArchitectureAiReview } from "@/lib/arquiteto/article-ai-review";
import {
  ARTICLE_AI_REVIEW_ARTIFACT_TYPE,
  ArticleArchitectureAiReviewSchema,
  VersionedArticleArchitectureAiReviewSchema,
} from "@/lib/arquiteto/article-ai-review";
import {
  ArticleDNASchema,
  SiloDNASchema,
  SiloPageSchema,
  VersionedArticleDNASchema,
  VersionedSiloDNASchema,
  VersionedSiloPageSchema,
} from "@/lib/arquiteto/contracts";
import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import {
  ArtifactVersionRepository,
  type ArtifactType,
  type PipelineJsonObject,
} from "./pipeline-repositories";

export type ArquitetoArtifactType = Extract<ArtifactType, "article_dna" | "silo_dna" | "silo_page" | "article_architecture_ai_review">;
export type ArquitetoArtifactVersion =
  | VersionEnvelope<ArticleDNA>
  | VersionEnvelope<SiloDNA>
  | VersionEnvelope<SiloPage>
  | VersionEnvelope<ArticleArchitectureAiReview>;

export type ArquitetoPersistenceResult = {
  status: "PERSISTED" | "UNCHANGED";
  version: ArquitetoArtifactVersion;
  source: "CANONICAL_REMOTE";
};

export type SiloPairPersistenceResult = {
  status: "PERSISTED";
  atomicity: "TRANSACTIONAL_RPC";
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
  source: "CANONICAL_REMOTE";
};

function unauthorizedArtifact(message: string): never {
  throw new PipelineRuntimeError("NOT_AUTHORIZED", message, 403);
}

function conflictArtifact(message: string): never {
  throw new PipelineRuntimeError("CONFLICT", message, 409);
}

function artifactEntityId(type: ArquitetoArtifactType, payload: ArticleDNA | SiloDNA | SiloPage | ArticleArchitectureAiReview) {
  if (type === "article_dna") return (payload as ArticleDNA).articleId;
  if (type === "silo_dna") return (payload as SiloDNA).siloId;
  // A revisão da IA é escopada pelo próprio Article revisado.
  if (type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE) return (payload as ArticleArchitectureAiReview).articleId;
  return (payload as SiloPage).siloPageId;
}

type CanonicalReadbackDiagnostic = {
  rowIndex: number | null;
  artifactType: ArquitetoArtifactType;
  versionNumber: number | null;
  payloadType: string;
  schemaName: string;
  issuePath: string;
  issueCode: string;
  issueMessage: string;
};

function schemaName(type: ArquitetoArtifactType) {
  if (type === "article_dna") return "VersionedArticleDNASchema";
  if (type === "silo_dna") return "VersionedSiloDNASchema";
  if (type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE) return "VersionedArticleArchitectureAiReviewSchema";
  return "VersionedSiloPageSchema";
}

function schemaForType(type: ArquitetoArtifactType) {
  if (type === "article_dna") return VersionedArticleDNASchema;
  if (type === "silo_dna") return VersionedSiloDNASchema;
  if (type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE) return VersionedArticleArchitectureAiReviewSchema;
  return VersionedSiloPageSchema;
}

function payloadType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * O timestamp do banco vira ISO 8601.
 *
 * Postgres devolve `2026-09-05 00:29:13.332+00`: separador espaço e fuso de
 * DOIS dígitos. O contrato pede ISO com `T` e fuso completo — e o fuso curto
 * escapava do padrão anterior, então a linha gravada com sucesso voltava
 * reprovada na própria leitura.
 */
export function normalizeDatabaseTimestamp(value: unknown) {
  if (typeof value !== "string") return value;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value)) return value;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function sanitizeIssueMessage(message: string) {
  return message
    .replace(/[\r\n]+/g, " ")
    .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}/g, "[redacted-id]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .slice(0, 160);
}

function canonicalReadbackError(diagnostic: CanonicalReadbackDiagnostic): never {
  const row = diagnostic.rowIndex == null ? "mutation" : `row=${diagnostic.rowIndex}`;
  throw new PipelineRuntimeError(
    "INVALID_ARTIFACT",
    `O artefato canônico retornado pelo banco é inválido. [${row}; artifactType=${diagnostic.artifactType}; versionNumber=${diagnostic.versionNumber ?? "null"}; payloadType=${diagnostic.payloadType}; schema=${diagnostic.schemaName}; issuePath=${diagnostic.issuePath || "<root>"}; issueCode=${diagnostic.issueCode}; issueMessage=${diagnostic.issueMessage}]`,
    503,
  );
}

function canonicalReadbackDiagnostic(
  type: ArquitetoArtifactType,
  version: ArquitetoArtifactVersion,
  rowIndex: number | null,
  issuePath: string,
  issueCode: string,
  issueMessage: string,
): never {
  return canonicalReadbackError({
    rowIndex,
    artifactType: type,
    versionNumber: version.versionNumber,
    payloadType: payloadType(version.payload),
    schemaName: schemaName(type),
    issuePath,
    issueCode,
    issueMessage: sanitizeIssueMessage(issueMessage),
  });
}

function assertCanonicalReadback(
  context: PipelineContext,
  type: ArquitetoArtifactType,
  row: Record<string, unknown>,
  version: ArquitetoArtifactVersion,
  rowIndex: number | null,
) {
  if (String(row.marca_id) !== context.brandId) {
    canonicalReadbackDiagnostic(type, version, rowIndex, "marca_id", "custom", "Brand canônica divergente");
  }
  const payload = version.payload as ArticleDNA | SiloDNA | SiloPage | ArticleArchitectureAiReview;
  const payloadBrandId = "brandId" in payload ? payload.brandId : undefined;
  if (payloadBrandId !== context.brandId) {
    canonicalReadbackDiagnostic(type, version, rowIndex, "payload.brandId", "custom", "Payload fora da Brand canônica");
  }
  if (version.entityId !== artifactEntityId(type, payload)) {
    canonicalReadbackDiagnostic(type, version, rowIndex, "entityId", "custom", "Identidade do artifact divergente");
  }
}

function validatePayload(
  context: PipelineContext,
  type: ArquitetoArtifactType,
  version: ArquitetoArtifactVersion,
) {
  const payload = type === "article_dna"
    ? ArticleDNASchema.parse(version.payload)
    : type === "silo_dna"
      ? SiloDNASchema.parse(version.payload)
      : type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE
        ? ArticleArchitectureAiReviewSchema.parse(version.payload)
        : SiloPageSchema.parse(version.payload);

  const payloadBrandId = "brandId" in payload ? payload.brandId : undefined;
  if (payloadBrandId !== context.brandId) {
    unauthorizedArtifact("O artefato não pertence à Brand canônica informada.");
  }
  const expectedEntityId = artifactEntityId(type, payload);
  if (version.entityId !== expectedEntityId) {
    conflictArtifact("A identidade do artefato não corresponde ao entity_id canônico.");
  }
  return payload;
}

/**
 * A linha do banco vira envelope canônico.
 *
 * O banco guarda snake_case; o contrato do Arquiteto fala camelCase. Devolver
 * a linha crua a quem espera um VersionEnvelope faz o cliente receber um objeto
 * sem versionId, sem contentHash e sem createdAt — e a escrita, que já
 * commitou, aparece como falha.
 */
export function canonicalVersionFromRow(type: ArquitetoArtifactType, row: Record<string, unknown>, rowIndex: number | null = null): ArquitetoArtifactVersion {
  const candidate = {
    versionId: row.version_id,
    entityId: row.entity_id,
    versionNumber: row.version_number,
    previousVersionId: row.previous_version_id ?? null,
    contentHash: row.content_hash,
    origin: row.origin,
    changeReason: row.change_reason,
    createdAt: normalizeDatabaseTimestamp(row.created_at),
    createdBy: row.created_by,
    payload: row.payload,
  };
  const result = schemaForType(type).safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    const diagnostic: CanonicalReadbackDiagnostic = {
      rowIndex,
      artifactType: type,
      versionNumber: typeof row.version_number === "number" && Number.isFinite(row.version_number) ? row.version_number : null,
      payloadType: payloadType(row.payload),
      schemaName: schemaName(type),
      issuePath: issue?.path.join(".") || "",
      issueCode: issue?.code || "unknown",
      issueMessage: sanitizeIssueMessage(issue?.message || "validation failed"),
    };
    console.error("[arquiteto] canonical artifact readback validation failed", diagnostic);
    canonicalReadbackError(diagnostic);
  }
  return result.data;
}

async function assertCanonicalSiloDnaSource(
  repository: ArtifactVersionRepository,
  context: PipelineContext,
  page: SiloPage,
) {
  if (page.siloDnaRef.entityId !== page.siloId) {
    conflictArtifact("A SiloPage referencia um SiloDNA de outra entidade.");
  }
  const sourceResult = await repository.list(page.siloDnaRef.entityId, "silo_dna");
  if (sourceResult.status === "NO_DATA") {
    conflictArtifact("A SiloPage exige um SiloDNA canônico persistido na mesma Brand.");
  }
  const sourceRow = sourceResult.data.find(row =>
    row.version_id === page.siloDnaRef.versionId &&
    row.content_hash === page.siloDnaRef.contentHash,
  );
  if (!sourceRow || sourceRow.marca_id !== context.brandId) {
    conflictArtifact("A referência da SiloPage não corresponde a um SiloDNA canônico da mesma Brand.");
  }
  return String(sourceRow.version_id);
}

/**
 * Article em formação não tem ArticleDNA consolidado, então `source_version_id`
 * é opcional. Quando a revisão declara a versão base, ela precisa existir como
 * ArticleDNA canônico da mesma Brand e do mesmo Article.
 */
async function resolveAiReviewSourceVersionId(
  repository: ArtifactVersionRepository,
  context: PipelineContext,
  review: ArticleArchitectureAiReview,
) {
  const baseVersionId = review.base.articleVersionId;
  if (!baseVersionId) return null;
  const sourceResult = await repository.list(review.articleId, "article_dna");
  if (sourceResult.status === "NO_DATA") {
    conflictArtifact("A revisão declara uma versão base de ArticleDNA que não existe na Brand canônica.");
  }
  const sourceRow = sourceResult.data.find(row => row.version_id === baseVersionId);
  if (!sourceRow || sourceRow.marca_id !== context.brandId) {
    conflictArtifact("A versão base da revisão não corresponde a um ArticleDNA canônico da mesma Brand.");
  }
  if (review.base.articleContentHash !== sourceRow.content_hash) {
    conflictArtifact("O hash da base revisada não corresponde à versão de ArticleDNA declarada.");
  }
  return baseVersionId;
}

export async function appendArquitetoArtifact(
  context: PipelineContext,
  type: ArquitetoArtifactType,
  version: ArquitetoArtifactVersion,
  status = "proposed",
): Promise<ArquitetoPersistenceResult> {
  const payload = validatePayload(context, type, version);
  const repository = new ArtifactVersionRepository(context);
  const sourceVersionId = type === "silo_page"
    ? await assertCanonicalSiloDnaSource(repository, context, payload as SiloPage)
    : type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE
      ? await resolveAiReviewSourceVersionId(repository, context, payload as ArticleArchitectureAiReview)
      : null;

  const result = await repository.append({
    versionId: version.versionId,
    entityId: version.entityId,
    artifactType: type,
    previousVersionId: version.previousVersionId,
    sourceVersionId,
    status,
    contentHash: version.contentHash,
    payload: payload as unknown as PipelineJsonObject,
    origin: version.origin,
    changeReason: version.changeReason,
    createdAt: version.createdAt,
  });

  return {
    status: result.status,
    version: canonicalVersionFromRow(type, result.data),
    source: "CANONICAL_REMOTE",
  };
}

/**
 * Persists the two distinct canonical artifacts through one PostgreSQL RPC.
 * The RPC is intentionally called only after the normal server context has
 * authenticated the actor and Brand; it also repeats those checks inside the
 * transaction and returns both rows for readback validation.
 */
export async function persistSiloPairAtomic(
  context: PipelineContext,
  siloDna: VersionEnvelope<SiloDNA>,
  siloPage: VersionEnvelope<SiloPage>,
  statuses: { siloDna: string; siloPage: string },
): Promise<SiloPairPersistenceResult> {
  const dnaPayload = validatePayload(context, "silo_dna", siloDna) as SiloDNA;
  const pagePayload = validatePayload(context, "silo_page", siloPage) as SiloPage;
  if (pagePayload.siloId !== dnaPayload.siloId || pagePayload.siloPageId !== `silo-page:${dnaPayload.siloId}`) {
    conflictArtifact("SiloDNA e SiloPage precisam pertencer ao mesmo Silo.");
  }
  if (
    pagePayload.siloDnaRef.entityId !== siloDna.entityId
    || pagePayload.siloDnaRef.versionId !== siloDna.versionId
    || pagePayload.siloDnaRef.contentHash !== siloDna.contentHash
  ) {
    conflictArtifact("A SiloPage precisa referenciar exatamente a versão de SiloDNA deste lote.");
  }
  if (siloDna.createdBy !== context.actorUserId || siloPage.createdBy !== context.actorUserId) {
    unauthorizedArtifact("O ator da sessão precisa ser o criador dos dois artefatos pareados.");
  }

  const result = await context.supabase.rpc("persist_silo_pair_atomic", {
    p_marca_id: context.brandId,
    p_actor_user_id: context.actorUserId,
    p_action: context.action,
    p_silo_dna: { ...siloDna, payload: dnaPayload },
    p_silo_page: { ...siloPage, payload: pagePayload },
    p_silo_dna_status: statuses.siloDna,
    p_silo_page_status: statuses.siloPage,
  });
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "A transação pareada não retornou readback canônico.", 503);
  }
  const data = result.data as Record<string, unknown>;
  const dnaRow = data.siloDna;
  const pageRow = data.siloPage;
  if (!dnaRow || typeof dnaRow !== "object" || Array.isArray(dnaRow) || !pageRow || typeof pageRow !== "object" || Array.isArray(pageRow)) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "O readback do par SiloDNA/SiloPage está incompleto.", 503);
  }
  const canonicalDna = canonicalVersionFromRow("silo_dna", dnaRow as Record<string, unknown>) as VersionEnvelope<SiloDNA>;
  const canonicalPage = canonicalVersionFromRow("silo_page", pageRow as Record<string, unknown>) as VersionEnvelope<SiloPage>;
  assertCanonicalReadback(context, "silo_dna", dnaRow as Record<string, unknown>, canonicalDna, null);
  assertCanonicalReadback(context, "silo_page", pageRow as Record<string, unknown>, canonicalPage, null);
  if (
    canonicalDna.versionId !== siloDna.versionId
    || canonicalDna.versionNumber !== siloDna.versionNumber
    || canonicalDna.contentHash !== siloDna.contentHash
    || canonicalPage.versionId !== siloPage.versionId
    || canonicalPage.versionNumber !== siloPage.versionNumber
    || canonicalPage.contentHash !== siloPage.contentHash
    || String((dnaRow as Record<string, unknown>).status) !== statuses.siloDna
    || String((pageRow as Record<string, unknown>).status) !== statuses.siloPage
  ) {
    throw new PipelineRuntimeError("INVALID_ARTIFACT", "O readback do par pareado diverge do lote solicitado.", 503);
  }
  if (
    canonicalPage.payload.siloDnaRef.versionId !== canonicalDna.versionId
    || canonicalPage.payload.siloDnaRef.contentHash !== canonicalDna.contentHash
  ) {
    throw new PipelineRuntimeError("INVALID_ARTIFACT", "A referência da SiloPage não corresponde ao SiloDNA retornado.", 503);
  }
  return { status: "PERSISTED", atomicity: "TRANSACTIONAL_RPC", siloDna: canonicalDna as VersionEnvelope<SiloDNA>, siloPage: canonicalPage as VersionEnvelope<SiloPage>, source: "CANONICAL_REMOTE" };
}

export async function listArquitetoArtifacts(context: PipelineContext) {
  const repository = new ArtifactVersionRepository(context);
  const result = await repository.list();
  if (result.status === "NO_DATA") {
    return { articleDnas: [], siloDnas: [], siloPages: [], aiReviews: [], statuses: [], source: "CANONICAL_REMOTE" as const };
  }

  const articleDnas: VersionEnvelope<ArticleDNA>[] = [];
  const siloDnas: VersionEnvelope<SiloDNA>[] = [];
  const siloPages: VersionEnvelope<SiloPage>[] = [];
  const aiReviews: VersionEnvelope<ArticleArchitectureAiReview>[] = [];
  const statuses: Array<{ versionId: string; status: string }> = [];
  for (const [rowIndex, row] of result.data.entries()) {
    const type = row.artifact_type;
    if (type === "article_dna") {
      const version = canonicalVersionFromRow(type, row, rowIndex) as VersionEnvelope<ArticleDNA>;
      assertCanonicalReadback(context, type, row, version, rowIndex);
      articleDnas.push(version);
    } else if (type === "silo_dna") {
      const version = canonicalVersionFromRow(type, row, rowIndex) as VersionEnvelope<SiloDNA>;
      assertCanonicalReadback(context, type, row, version, rowIndex);
      siloDnas.push(version);
    } else if (type === "silo_page") {
      const version = canonicalVersionFromRow(type, row, rowIndex) as VersionEnvelope<SiloPage>;
      assertCanonicalReadback(context, type, row, version, rowIndex);
      siloPages.push(version);
    } else if (type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE) {
      const version = canonicalVersionFromRow(type, row, rowIndex) as VersionEnvelope<ArticleArchitectureAiReview>;
      assertCanonicalReadback(context, type, row, version, rowIndex);
      aiReviews.push(version);
    }
    if (type === "article_dna" || type === "silo_dna" || type === "silo_page" || type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE) {
      statuses.push({ versionId: String(row.version_id), status: String(row.status) });
    }
  }
  return { articleDnas, siloDnas, siloPages, aiReviews, statuses, source: "CANONICAL_REMOTE" as const };
}

export function pipelineArtifactErrorResponse(error: unknown) {
  if (error instanceof PipelineRuntimeError) {
    return { status: error.status, body: { success: false, error: error.message, code: error.code } };
  }
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const candidate = error as { code?: unknown; message?: unknown };
    const mapped = pipelineErrorFromSupabase(candidate);
    return { status: mapped.status, body: { success: false, error: mapped.message, code: mapped.code } };
  }
  return { status: 503, body: { success: false, error: "Não foi possível concluir a operação canônica do Arquiteto.", code: "QUERY_FAILURE" as const } };
}
