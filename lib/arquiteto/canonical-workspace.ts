import { z } from "zod";
import { ArticleFormationSerpPayloadSchema } from "./article-serp-record.ts";
import { TerritorialSerpPayloadSchema } from "./territorial-serp-record.ts";
import { TerritorialAiPayloadSchema } from "./territorial-ai-record.ts";
import { ArchitectureMarkerPayloadSchema, type ArchitectureMarkerPayload } from "./architecture-marker-record.ts";
import { ArticleFormationMarkerPayloadSchema, type ArticleFormationMarkerPayload } from "./article-formation-marker.ts";
import { ArticleKgrIdentitySchema, SiloCandidateMarkSchema, VersionedArticleDNASchema, VersionedSiloDNASchema, VersionedSiloPageSchema, type ArticleDNA, type ArchitectKeyword, type SiloDNA, type SiloPage, type VersionEnvelope } from "./contracts.ts";
import { VersionedArticleArchitectureAiReviewSchema, type VersionedArticleArchitectureAiReview } from "./article-ai-review.ts";
import { buildKeywordDnaProvenanceSnapshot } from "./adapters.ts";
import { adaptKeywordIdentityContext } from "./identity-context.ts";
import { parseKeywordContextualPresentation, type KeywordContextualPresentation } from "../minerador/keyword-contextual-presentation.ts";
import { TerritoryCandidateSchema, type TerritoryCandidate } from "./territory.ts";
import { SiloWorkingCopyStateSchema, type SiloWorkingCopyState } from "./silo-working-copy-record.ts";
import type { SiloConsolidationRequestBody } from "./silo-consolidation-operation.ts";
import type { CanonicalImportability } from "./minerador-handoff.ts";

export type CanonicalWorkflowItem = {
  id: string;
  marcaId: string;
  subjectType: string;
  subjectId: string;
  articleId: string | null;
  stage: "architect";
  state: string;
  sourceEntityId: string;
  sourceVersionId: string | null;
  sourceContentHash: string | null;
  payload: Record<string, unknown>;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * WORKING COPY DE SILO REMOTA — a autoridade.
 *
 * `buildCopy`/`formSiloWorkingCopies` continuam existindo, mas só originam a
 * PROPOSTA inicial, antes da primeira persistência. Assim que existe linha
 * remota, é ela que manda: o estado local seria uma segunda fonte capaz de
 * divergir, sem regra de desempate.
 */
/** Território canônico remoto. O `lockVersion` daqui é o expectedLock da consolidação. */
export type CanonicalTerritory = {
  workflowItemId: string;
  territoryRef: string;
  lockVersion: number;
  state: string;
  territory: TerritoryCandidate;
};

export type CanonicalSiloWorkingCopy = {
  workflowItemId: string;
  workingCopyRef: string;
  lockVersion: number;
  state: string;
  workingCopy: SiloWorkingCopyState;
};

export type CanonicalWorkspaceKeyword = Record<string, unknown> & {
  id: string;
  brand_id: string;
  keyword: string;
};

export type CanonicalWorkspaceSnapshot = {
  source: "CANONICAL_REMOTE";
  workflowItems: CanonicalWorkflowItem[];
  importEligibility: Array<{ keywordId: string; importability: CanonicalImportability; workflowState: string | null }>;
  keywords: CanonicalWorkspaceKeyword[];
  availableKeywords: CanonicalWorkspaceKeyword[];
  /** Apresentação Contextual persistida no Minerador; somente leitura. */
  keywordPresentations: KeywordContextualPresentation[];
  articleDnas: VersionEnvelope<ArticleDNA>[];
  siloDnas: VersionEnvelope<SiloDNA>[];
  siloPages: VersionEnvelope<SiloPage>[];
  /** Territórios canônicos remotos, com o lock que a consolidação exige. */
  /** `marcas.silos_existentes` lido pelo servidor; nunca pelo brand context. */
  brandSiloCatalog: Array<{ id: string; nome: string | null; slug: string | null }>;
  territories: CanonicalTerritory[];
  /** Working copies de Silo REMOTAS. Autoridade sobre qualquer estado local. */
  siloWorkingCopies: CanonicalSiloWorkingCopy[];
  /** Pareceres de SERP territorial já gravados. Hidratam o Workbench. */
  territorialSerp: RemoteTerritorialSerp[];
  /** Pareceres de SERP da formação de Article — autoridade do gate. */
  articleFormationSerp: RemoteArticleFormationSerp[];
  /** Propostas de IA territorial já gravadas. */
  territorialAi: RemoteTerritorialAi[];
  /** Marcador do cenário; a análise em si é reconstruída, não persistida. */
  architectureMarker: ArchitectureMarkerPayload | null;
  articleFormationMarker: ArticleFormationMarkerPayload | null;
  /** Revisão arquitetural por IA vigente de cada Article. */
  aiReviews: VersionedArticleArchitectureAiReview[];
  statuses: Array<{ versionId: string; status: string }>;
};

const WorkflowItemSchema = z.object({
  id: z.string().min(1),
  marcaId: z.string().min(1),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  articleId: z.string().nullable(),
  stage: z.literal("architect"),
  state: z.string().min(1),
  sourceEntityId: z.string().min(1),
  sourceVersionId: z.string().nullable(),
  sourceContentHash: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  lockVersion: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const KeywordSchema = z.object({
  id: z.string().min(1),
  brand_id: z.string().min(1),
  keyword: z.string().min(1),
}).passthrough();

const CanonicalImportabilitySchema = z.enum([
  "IMPORTABLE",
  "PUBLISHED_PROTECTED",
  "WORKFLOW_RECEIVED",
  "ARTICLE_DNA_INCORPORATED",
  "REMOTE_WORKFLOW_BLOCKED",
  "NOT_APPROVED",
]);

const RemoteTerritorySchema = z.object({
  workflowItemId: z.string().min(1),
  territoryRef: z.string().min(1),
  lockVersion: z.number().int().positive(),
  state: z.string().min(1),
  territory: TerritoryCandidateSchema,
}).passthrough();

const RemoteSiloWorkingCopySchema = z.object({
  workflowItemId: z.string().min(1),
  workingCopyRef: z.string().min(1),
  lockVersion: z.number().int().positive(),
  state: z.string().min(1),
  workingCopy: SiloWorkingCopyStateSchema,
}).passthrough();

const BrandSiloCatalogEntrySchema = z.object({
  id: z.string().min(1),
  nome: z.string().nullable().default(null),
  slug: z.string().nullable().default(null),
});

/**
 * Parecer de SERP da FORMAÇÃO já gravado no remoto.
 *
 * É esta leitura que torna o navegador dispensável: sem ela o gate
 * dependeria do IndexedDB daquela aba para saber se a evidência existe.
 */
const RemoteArticleFormationSerpSchema = z.object({
  workflowItemId: z.string().min(1),
  candidateRef: z.string().min(1),
  lockVersion: z.number().int().positive(),
  payload: ArticleFormationSerpPayloadSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type RemoteArticleFormationSerp = z.infer<typeof RemoteArticleFormationSerpSchema>;

const RemoteTerritorialSerpSchema = z.object({
  workflowItemId: z.string().min(1),
  questionId: z.string().min(1),
  lockVersion: z.number().int().positive(),
  payload: TerritorialSerpPayloadSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type RemoteTerritorialSerp = z.infer<typeof RemoteTerritorialSerpSchema>;

const RemoteTerritorialAiSchema = z.object({
  workflowItemId: z.string().min(1),
  questionId: z.string().min(1),
  lockVersion: z.number().int().positive(),
  payload: TerritorialAiPayloadSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type RemoteTerritorialAi = z.infer<typeof RemoteTerritorialAiSchema>;

const SnapshotResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    source: z.literal("CANONICAL_REMOTE"),
    workflowItems: z.array(WorkflowItemSchema),
    importEligibility: z.array(z.object({
      keywordId: z.string().min(1),
      importability: CanonicalImportabilitySchema,
      workflowState: z.string().min(1).nullable(),
    })),
    keywords: z.array(KeywordSchema),
    availableKeywords: z.array(KeywordSchema),
    keywordPresentations: z.array(z.unknown()).default([]),
    articleDnas: z.array(z.unknown()),
    siloDnas: z.array(z.unknown()),
    siloPages: z.array(z.unknown()),
    aiReviews: z.array(z.unknown()).default([]),
    statuses: z.array(z.object({ versionId: z.string().min(1), status: z.string().min(1) })),
    brandSiloCatalog: z.array(BrandSiloCatalogEntrySchema).default([]),
    territories: z.array(RemoteTerritorySchema).default([]),
    siloWorkingCopies: z.array(RemoteSiloWorkingCopySchema).default([]),
    /** Pareceres de SERP já gravados; hidratam o Workbench sem novo provider. */
    territorialSerp: z.array(RemoteTerritorialSerpSchema).default([]),
    /** Evidência da formação; o navegador vira cache, não autoridade. */
    articleFormationSerp: z.array(RemoteArticleFormationSerpSchema).default([]),
    /** Propostas de IA já gravadas; hidratam o Workbench sem novo provider. */
    territorialAi: z.array(RemoteTerritorialAiSchema).default([]),
    /** Cenário de arquitetura já processado/confirmado; só o fato humano. */
    architectureMarker: ArchitectureMarkerPayloadSchema.nullable().default(null),
    articleFormationMarker: ArticleFormationMarkerPayloadSchema.nullable().default(null),
  }),
});

const HandoffResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.enum(["PERSISTED", "UNCHANGED"]),
    source: z.literal("CANONICAL_REMOTE"),
    importedKeywordIds: z.array(z.string().min(1)),
    createdKeywordIds: z.array(z.string().min(1)),
    existingKeywordIds: z.array(z.string().min(1)),
  }),
});

const SiloCreationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.literal("PERSISTED"),
    atomicity: z.literal("TRANSACTIONAL_RPC"),
    siloId: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    siloDna: z.unknown(),
    siloPage: z.unknown(),
    source: z.literal("CANONICAL_REMOTE"),
  }),
});

const WorkingCopyResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.literal("PERSISTED"),
    source: z.literal("CANONICAL_REMOTE"),
    items: z.array(z.unknown()),
    territories: z.array(RemoteTerritorySchema).default([]),
    siloWorkingCopies: z.array(RemoteSiloWorkingCopySchema).default([]),
  }),
});

export class CanonicalWorkspaceError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CanonicalWorkspaceError";
  }
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
  if (!response.ok || !body || body.error) {
    throw new CanonicalWorkspaceError(
      typeof body?.code === "string" && body.code.trim() ? body.code : "QUERY_FAILURE",
      typeof body?.error === "string" ? body.error : "Não foi possível carregar o workspace canônico do Arquiteto.",
    );
  }
  return body;
}

export async function loadCanonicalArquitetoWorkspace(brandId: string): Promise<CanonicalWorkspaceSnapshot> {
  const response = await fetch(`/api/arquiteto/workspace?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
  const body = SnapshotResponseSchema.parse(await readResponse(response));
  return {
    source: body.data.source,
    workflowItems: body.data.workflowItems,
    importEligibility: body.data.importEligibility,
    keywords: body.data.keywords,
    availableKeywords: body.data.availableKeywords,
    keywordPresentations: body.data.keywordPresentations
      .map(item => parseKeywordContextualPresentation(item))
      .filter((item): item is KeywordContextualPresentation => Boolean(item)),
    articleDnas: body.data.articleDnas.map(item => VersionedArticleDNASchema.parse(item)) as VersionEnvelope<ArticleDNA>[],
    siloDnas: body.data.siloDnas.map(item => VersionedSiloDNASchema.parse(item)) as VersionEnvelope<SiloDNA>[],
    siloPages: body.data.siloPages.map(item => VersionedSiloPageSchema.parse(item)) as VersionEnvelope<SiloPage>[],
    aiReviews: body.data.aiReviews.map(item => VersionedArticleArchitectureAiReviewSchema.parse(item)) as VersionedArticleArchitectureAiReview[],
    statuses: body.data.statuses,
    brandSiloCatalog: body.data.brandSiloCatalog,
    territories: body.data.territories,
    siloWorkingCopies: body.data.siloWorkingCopies,
    territorialSerp: body.data.territorialSerp,
    articleFormationSerp: body.data.articleFormationSerp,
    territorialAi: body.data.territorialAi,
    architectureMarker: body.data.architectureMarker,
    articleFormationMarker: body.data.articleFormationMarker,
  };
}

export async function persistMineradorArquitetoHandoff(input: { brandId: string; keywordIds: string[] }) {
  const response = await fetch("/api/arquiteto/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = HandoffResponseSchema.parse(await readResponse(response));
  return body.data;
}

export async function createCanonicalManualSilo(input: { brandId: string; name: string; slug: string }) {
  const response = await fetch("/api/arquiteto/silos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = SiloCreationResponseSchema.parse(await readResponse(response));
  return {
    ...body.data,
    siloDna: VersionedSiloDNASchema.parse(body.data.siloDna) as VersionEnvelope<SiloDNA>,
    siloPage: VersionedSiloPageSchema.parse(body.data.siloPage) as VersionEnvelope<SiloPage>,
  };
}

export async function persistArchitectWorkingCopy(input: {
  brandId: string;
  updates: Array<{
    workflowItemId: string;
    expectedLock: number;
    assignment: Record<string, unknown>;
  }>;
}) {
  if (!input.updates.length) return { persistence: "UNCHANGED" as const, source: "CANONICAL_REMOTE" as const, items: [] };
  const response = await fetch("/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = WorkingCopyResponseSchema.parse(await readResponse(response));
  return body.data;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function keywordStatus(keyword: CanonicalWorkspaceKeyword) {
  return stringValue(keyword.status)?.toLocaleLowerCase("pt-BR") || "aprovado";
}

function assignmentString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = stringValue(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

function assignmentStringOrUndefined(payload: Record<string, unknown>, ...keys: string[]): string | null | undefined {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) return stringValue(payload[key]);
  }
  return undefined;
}

/**
 * Projeta apenas keywords que possuem handoff remoto para o Arquiteto.
 * Sem ArticleDNA, a keyword continua visível como não agrupada.
 */
export function buildCanonicalWorkflowWorkspaceItems(
  workflowItems: readonly CanonicalWorkflowItem[],
  keywords: readonly CanonicalWorkspaceKeyword[],
  brandId: string,
) {
  const keywordById = new Map(keywords.filter(keyword => keyword.brand_id === brandId).map(keyword => [keyword.id, keyword]));
  const seen = new Set<string>();

  return workflowItems.flatMap(item => {
    if (item.marcaId !== brandId || item.subjectType !== "keyword" || item.stage !== "architect" || item.state !== "received" || seen.has(item.subjectId)) return [];
    const keyword = keywordById.get(item.subjectId);
    if (!keyword) return [];
    seen.add(item.subjectId);
    const status = keywordStatus(keyword);
    const semantic = keyword.analise_semantica && typeof keyword.analise_semantica === "object" ? keyword.analise_semantica : null;
    const intent = stringValue(keyword.intent) || stringValue(semantic && (semantic as Record<string, unknown>).intencao) || "Informativo";
    const assignment = item.payload || {};
    const assignedSiloId = assignmentStringOrUndefined(assignment, "siloId", "silo_id");
    const assignedSiloName = assignmentStringOrUndefined(assignment, "siloName");
    const assignedClusterId = assignmentStringOrUndefined(assignment, "clusterId", "provisionalGroupId");
    const assignedProvisionalGroupId = assignmentStringOrUndefined(assignment, "provisionalGroupId", "clusterId");
    const assignedSlug = assignmentStringOrUndefined(assignment, "computedSlug", "slug_sugerido");
    const assignedHierarchy = assignmentStringOrUndefined(assignment, "computedHierarquia", "hierarquia");
    const assignedRole = assignmentStringOrUndefined(assignment, "role", "reviewRole");
    const parsedKgrIdentity = ArticleKgrIdentitySchema.safeParse(assignment.kgrIdentity);
    const assignedKgrIdentity = parsedKgrIdentity.success ? parsedKgrIdentity.data : undefined;
    const isPublished = keywordStatus(keyword) === "publicado" || keyword.isPublished === true;
    // lista_id é proveniência da origem do Minerador, não uma atribuição de
    // Silo para keywords novas. Só um publicado pode carregar esse vínculo
    // legado como proteção de identidade; novos vínculos chegam pelo payload
    // explícito da working copy e são nulos quando ainda não existem.
    const protectedSourceSiloId = isPublished
      ? stringValue(keyword.siloId) || stringValue(keyword.silo_id) || stringValue(keyword.lista_id)
      : null;
    const protectedSourceSiloName = isPublished ? stringValue(keyword.siloName) : null;
    const assignedSiloCandidate = SiloCandidateMarkSchema.safeParse(assignment.siloCandidate).success
      ? SiloCandidateMarkSchema.parse(assignment.siloCandidate)
      : undefined;
    const sourceSiloCandidate = SiloCandidateMarkSchema.safeParse(keyword.siloCandidate).success
      ? SiloCandidateMarkSchema.parse(keyword.siloCandidate)
      : undefined;
    const workingArticleId = assignmentString(assignment, "workingArticleId")
      || stringValue(item.articleId)
      || assignmentString(assignment, "provisionalGroupId")
      || `workflow:${item.id}`;
    const volume = numberValue(keyword.volume_search);
    const results = numberValue(keyword.results_allintitle);
    const rawKgr = numberValue(keyword.kgr_score);
    const kgr = rawKgr !== undefined ? rawKgr : numberValue(keyword.kgr);
    const keywordDnaSnapshot = buildKeywordDnaProvenanceSnapshot(keyword as unknown as ArchitectKeyword, {
      brandId,
      capturedAt: item.updatedAt,
      sourceVersionId: item.sourceVersionId,
      sourceContentHash: item.sourceContentHash,
    });
    return [{
      ...keyword,
      id: keyword.id,
      keywordId: keyword.id,
      keyword: keyword.keyword,
      articleId: item.articleId,
      workingArticleId,
      ...(volume !== undefined ? { volume_search: volume } : {}),
      ...(results !== undefined ? { results_allintitle: results } : {}),
      ...(kgr !== undefined ? { kgr_score: kgr } : {}),
      intent,
      status,
       silo_id: assignedSiloId === undefined ? protectedSourceSiloId : assignedSiloId,
       siloId: assignedSiloId === undefined ? protectedSourceSiloId : assignedSiloId,
       siloName: assignedSiloName === undefined ? protectedSourceSiloName : assignedSiloName,
      clusterId: assignedClusterId === undefined ? stringValue(keyword.clusterId) : assignedClusterId,
      provisionalGroupId: assignedProvisionalGroupId === undefined ? stringValue(keyword.provisionalGroupId) : assignedProvisionalGroupId,
      briefingId: null,
       isPublished,
      source: "CANONICAL_REMOTE" as const,
      // Membership territorial: projeção de LEITURA do mesmo payload do item de
      // workflow, que continua sendo a única autoridade. Nada é copiado para o
      // Territory e nenhum storage novo é criado.
      ...(assignment.territoryRef !== undefined ? { territoryRef: assignment.territoryRef } : {}),
      ...(assignment.territoryAssignment !== undefined ? { territoryAssignment: assignment.territoryAssignment } : {}),
      // Formação de Artigo revisada: mesma projeção de LEITURA, mesmo payload,
      // mesma autoridade. É por vir daqui que a decisão humana sobrevive a
      // "Reprocessar artigos" — ela nunca esteve no resultado do cálculo.
      ...(assignment.articleFormationRef !== undefined ? { articleFormationRef: assignment.articleFormationRef } : {}),
      ...(assignment.articleFormationDecision !== undefined ? { articleFormationDecision: assignment.articleFormationDecision } : {}),
      canonicalWorkflow: item,
      ...(assignedKgrIdentity ? { kgrIdentity: assignedKgrIdentity } : {}),
      keywordDnaRef: keywordDnaSnapshot.versionReference,
      keywordDnaSnapshot,
      ...adaptKeywordIdentityContext(keyword),
      computedSlug: assignedSlug === undefined ? stringValue(keyword.computedSlug) || stringValue(keyword.slug_sugerido) || undefined : assignedSlug,
      slug_sugerido: assignedSlug === undefined ? stringValue(keyword.slug_sugerido) : assignedSlug,
      computedHierarquia: assignedHierarchy === undefined ? stringValue(keyword.computedHierarquia) || stringValue(keyword.hierarquia) || undefined : assignedHierarchy,
      hierarquia: assignedHierarchy === undefined ? stringValue(keyword.hierarquia) : assignedHierarchy,
      reviewRole: assignedRole === undefined ? stringValue(keyword.reviewRole) || undefined : assignedRole,
      ...(assignedSiloCandidate === undefined
        ? (sourceSiloCandidate ? { siloCandidate: sourceSiloCandidate } : {})
        : { siloCandidate: assignedSiloCandidate }),
    }];
  });
}

/* ------------------- working copy de Silo — autoridade remota ------------- */

const SiloWorkingCopyMutationSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.literal("PERSISTED"),
    source: z.literal("CANONICAL_REMOTE"),
    siloWorkingCopies: z.array(RemoteSiloWorkingCopySchema),
  }).passthrough(),
});

/**
 * CREATE da working copy remota.
 *
 * A identidade NÃO é declarada pelo cliente: `workingCopyRef` é derivado do
 * territoryRef pelo servidor, e a rota recusa um draft que já o traga. Por isso
 * o que sobe é o estado sem ref.
 *
 * Sucesso é o READBACK: a função só resolve se a linha remota voltou. Estado de
 * React mudando não é persistência, e fallback local não é persistência.
 */
export async function createRemoteSiloWorkingCopy(input: {
  brandId: string;
  workingCopy: Omit<SiloWorkingCopyState, "workingCopyRef">;
}): Promise<CanonicalSiloWorkingCopy> {
  const response = await fetch("/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: input.brandId,
      siloWorkingCopyCreates: [{ workingCopy: input.workingCopy }],
    }),
  });
  const body = SiloWorkingCopyMutationSchema.parse(await readResponse(response));
  const created = body.data.siloWorkingCopies[0];
  if (!created) {
    throw new CanonicalWorkspaceError(
      "QUERY_FAILURE",
      "A working copy de Silo não voltou do servidor; a criação não pode ser dada como concluída.",
    );
  }
  return created;
}

/**
 * UPDATE otimista com `expectedLock` da WC CARREGADA.
 *
 * Sem o lock, duas abas gravam por cima uma da outra em silêncio. Com ele, a
 * segunda recebe `STALE_WORKING_COPY` — que NÃO deve virar retry automático:
 * quem decide o que fazer com a divergência é o humano.
 */
export async function updateRemoteSiloWorkingCopy(input: {
  brandId: string;
  workingCopyRef: string;
  expectedLock: number;
  workingCopy: Partial<SiloWorkingCopyState>;
}): Promise<CanonicalSiloWorkingCopy> {
  const response = await fetch("/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: input.brandId,
      siloWorkingCopyUpdates: [{
        workingCopyRef: input.workingCopyRef,
        expectedLock: input.expectedLock,
        workingCopy: input.workingCopy,
      }],
    }),
  });
  const body = SiloWorkingCopyMutationSchema.parse(await readResponse(response));
  const updated = body.data.siloWorkingCopies[0];
  if (!updated) {
    throw new CanonicalWorkspaceError(
      "QUERY_FAILURE",
      "A working copy de Silo não voltou do servidor; a edição não pode ser dada como concluída.",
    );
  }
  return updated;
}

const SiloConsolidationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.literal("PERSISTED"),
    source: z.literal("CANONICAL_REMOTE"),
    idempotentReplay: z.boolean(),
    territory: z.unknown(),
    siloDna: z.unknown(),
    siloPage: z.unknown(),
    workingCopy: z.unknown(),
  }).passthrough(),
});

/**
 * CAMINHO CANÔNICO ÚNICO da consolidação Silo-first.
 *
 * O corpo chega PRONTO da operação congelada (`silo-consolidation-operation.ts`)
 * e é despachado sem reconstrução: um retry precisa reenviar exatamente o mesmo
 * `versionId`/`createdAt`/`contentHash`, senão a RPC não reconhece o replay.
 *
 * O browser não é autoridade de nenhum gate: readiness, confirmação humana,
 * binding semântico, validação de ArticleDNA e de Território, identidade
 * publicada e proveniência são todos resolvidos server-side.
 */
export async function consolidateRemoteSiloFromWorkingCopy(body: SiloConsolidationRequestBody) {
  const response = await fetch("/api/arquiteto/silo-consolidation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = SiloConsolidationResponseSchema.parse(await readResponse(response));
  return parsed.data;
}

/**
 * Cria o registro territorial interno de um Silo que já existe.
 *
 * Reutiliza `territoryCreates` do PATCH canônico — nenhum endpoint paralelo. O
 * draft vai SEM `territoryRef`: a identidade é emitida pelo servidor, e a rota
 * recusa qualquer draft que já traga uma.
 */
export async function anchorRemoteTerritoryForSilo(input: {
  brandId: string;
  draft: Record<string, unknown>;
}): Promise<CanonicalTerritory> {
  const response = await fetch("/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: input.brandId, territoryCreates: [{ territory: input.draft }] }),
  });
  const body = WorkingCopyResponseSchema.parse(await readResponse(response));
  const created = body.data.territories[0];
  if (!created) throw new CanonicalWorkspaceError("QUERY_FAILURE", "O silo não foi confirmado pelo readback canônico.");
  return created;
}

/**
 * Cria um Silo candidato pela porta canônica Silo-first.
 *
 * Substitui `createCanonicalManualSilo` na UI nova: nenhuma lista de keywords,
 * nenhum SiloDNA, nenhuma SiloPage. Só o registro do candidato, com a
 * identidade emitida pelo servidor e confirmada no retorno.
 */
export async function createRemoteSiloCandidate(input: {
  brandId: string;
  draft: Record<string, unknown>;
}): Promise<CanonicalTerritory> {
  const response = await fetch("/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId: input.brandId, territoryCreates: [{ territory: input.draft }] }),
  });
  const body = WorkingCopyResponseSchema.parse(await readResponse(response));
  const created = body.data.territories[0];
  if (!created) throw new CanonicalWorkspaceError("QUERY_FAILURE", "O silo candidato não foi confirmado pelo readback canônico.");
  return created;
}

/**
 * Confirma um Silo candidato.
 *
 * Reutiliza `territoryUpdates` do PATCH canônico, com `expectedLock`: nenhuma
 * rota nova. Confirmar significa que o universo foi aceito e pode receber
 * formação de Articles — NÃO significa SiloDNA, SiloPage nem Pilar escolhido.
 */
export async function confirmRemoteSiloCandidate(input: {
  brandId: string;
  territoryRef: string;
  expectedLock: number;
  territory: Record<string, unknown>;
}): Promise<CanonicalTerritory> {
  const response = await fetch("/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: input.brandId,
      territoryUpdates: [{
        territoryRef: input.territoryRef,
        expectedLock: input.expectedLock,
        territory: { ...input.territory, lifecycleStatus: "confirmed", decisionState: "confirmed" },
      }],
    }),
  });
  const body = WorkingCopyResponseSchema.parse(await readResponse(response));
  const updated = body.data.territories.find(item => item.territoryRef === input.territoryRef);
  if (!updated) throw new CanonicalWorkspaceError("QUERY_FAILURE", "A confirmação do silo não foi confirmada pelo readback canônico.");
  return updated;
}

/**
 * Contexto humano do Silo — entidade central, intenção macro, fronteira e
 * narrativa.
 *
 * Sem estes campos o Silo não é confirmável: o domínio recusa confirmar um
 * universo que ninguém delimitou. Nada aqui é inferido — o que a pessoa não
 * escrever continua vazio, e o bloqueio continua aparecendo.
 */
export async function updateRemoteTerritoryContext(input: {
  brandId: string;
  territoryRef: string;
  expectedLock: number;
  territory: Record<string, unknown>;
  context: {
    name: string;
    centralEntity: string;
    macroIntent: string;
    includes: string[];
    excludes: string[];
    statement: string | null;
    continuity: "coherent" | "partial" | "fragmented" | "unknown";
    brandAlignment: "aligned" | "adjacent" | "off_strategy" | "unknown";
  };
}): Promise<CanonicalTerritory> {
  const previousNarrative = (input.territory.narrative || {}) as Record<string, unknown>;
  const response = await fetch("/api/arquiteto/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: input.brandId,
      territoryUpdates: [{
        territoryRef: input.territoryRef,
        expectedLock: input.expectedLock,
        territory: {
          ...input.territory,
          name: input.context.name,
          centralEntity: input.context.centralEntity,
          macroIntent: input.context.macroIntent,
          boundary: { includes: input.context.includes, excludes: input.context.excludes },
          narrative: {
            ...previousNarrative,
            statement: input.context.statement,
            continuity: input.context.continuity,
            brandAlignment: input.context.brandAlignment,
            rationale: Array.isArray(previousNarrative.rationale) ? previousNarrative.rationale : [],
          },
        },
      }],
    }),
  });
  const body = WorkingCopyResponseSchema.parse(await readResponse(response));
  const updated = body.data.territories.find(item => item.territoryRef === input.territoryRef);
  if (!updated) throw new CanonicalWorkspaceError("QUERY_FAILURE", "O contexto do silo não foi confirmado pelo readback canônico.");
  return updated;
}

/**
 * Registra o cenário de arquitetura processado/confirmado.
 *
 * Grava só o FATO humano — clusters, pontuações e mapa continuam sendo
 * reconstruídos do read-model a cada boot.
 */
export async function persistArchitectureMarker(
  brandId: string,
  marker: ArchitectureMarkerPayload,
): Promise<ArchitectureMarkerPayload> {
  const response = await fetch("/api/arquiteto/architecture-marker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, marker }),
  });
  const body = await readResponse(response);
  const parsed = z.object({
    success: z.literal(true),
    data: z.object({ marker: ArchitectureMarkerPayloadSchema }),
  }).parse(body);
  return parsed.data.marker;
}

/**
 * Registra o cenário de formação de Artigos processado/confirmado.
 *
 * Grava só o FATO humano. Candidatos, papéis e pontuações continuam sendo
 * reconstruídos do read-model a cada boot, e confirmar formação não cria
 * ArticleDNA.
 */
export async function persistArticleFormationMarker(
  brandId: string,
  marker: ArticleFormationMarkerPayload,
): Promise<ArticleFormationMarkerPayload> {
  const response = await fetch("/api/arquiteto/article-formation-marker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, marker }),
  });
  const body = await readResponse(response);
  const parsed = z.object({
    success: z.literal(true),
    data: z.object({ marker: ArticleFormationMarkerPayloadSchema }),
  }).parse(body);
  return parsed.data.marker;
}
