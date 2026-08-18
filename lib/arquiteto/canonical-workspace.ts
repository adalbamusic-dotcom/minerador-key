import { z } from "zod";
import { VersionedArticleDNASchema, VersionedSiloDNASchema, VersionedSiloPageSchema, type ArticleDNA, type SiloDNA, type SiloPage, type VersionEnvelope } from "./contracts.ts";
import { adaptKeywordIdentityContext } from "./identity-context.ts";
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
  articleDnas: VersionEnvelope<ArticleDNA>[];
  siloDnas: VersionEnvelope<SiloDNA>[];
  siloPages: VersionEnvelope<SiloPage>[];
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
    articleDnas: z.array(z.unknown()),
    siloDnas: z.array(z.unknown()),
    siloPages: z.array(z.unknown()),
    statuses: z.array(z.object({ versionId: z.string().min(1), status: z.string().min(1) })),
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
    articleDnas: body.data.articleDnas.map(item => VersionedArticleDNASchema.parse(item)) as VersionEnvelope<ArticleDNA>[],
    siloDnas: body.data.siloDnas.map(item => VersionedSiloDNASchema.parse(item)) as VersionEnvelope<SiloDNA>[],
    siloPages: body.data.siloPages.map(item => VersionedSiloPageSchema.parse(item)) as VersionEnvelope<SiloPage>[],
    statuses: body.data.statuses,
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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function keywordStatus(keyword: CanonicalWorkspaceKeyword) {
  return stringValue(keyword.status)?.toLocaleLowerCase("pt-BR") || "aprovado";
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
    return [{
      ...keyword,
      id: keyword.id,
      keywordId: keyword.id,
      keyword: keyword.keyword,
      volume_search: numberValue(keyword.volume_search),
      results_allintitle: numberValue(keyword.results_allintitle),
      kgr_score: numberValue(keyword.kgr_score) ?? numberValue(keyword.kgr),
      intent,
      status,
      silo_id: stringValue(keyword.lista_id),
      siloId: stringValue(keyword.lista_id),
      siloName: null,
      clusterId: null,
      provisionalGroupId: null,
      briefingId: null,
      isPublished: status === "publicado",
      source: "CANONICAL_REMOTE" as const,
      canonicalWorkflow: item,
      ...adaptKeywordIdentityContext(keyword),
    }];
  });
}
