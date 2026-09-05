import { z } from "zod";
import {
  VersionedArticleDNASchema,
  VersionedSiloDNASchema,
  VersionedSiloPageSchema,
  type ArticleDNA,
  type SiloDNA,
  type SiloPage,
  type VersionEnvelope,
} from "./contracts";
import {
  ARTICLE_AI_REVIEW_ARTIFACT_TYPE,
  VersionedArticleArchitectureAiReviewSchema,
  type VersionedArticleArchitectureAiReview,
} from "./article-ai-review";

export type ArquitetoArtifactType = "article_dna" | "silo_dna" | "silo_page" | typeof ARTICLE_AI_REVIEW_ARTIFACT_TYPE;
export type ArquitetoArtifactVersion =
  | VersionEnvelope<ArticleDNA>
  | VersionEnvelope<SiloDNA>
  | VersionEnvelope<SiloPage>
  | VersionedArticleArchitectureAiReview;

const PersistenceResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.enum(["PERSISTED", "UNCHANGED"]),
    version: z.unknown(),
    source: z.literal("CANONICAL_REMOTE"),
  }),
});

const SiloPairPersistenceResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.literal("PERSISTED"),
    atomicity: z.literal("TRANSACTIONAL_RPC"),
    source: z.literal("CANONICAL_REMOTE"),
    siloDna: z.unknown(),
    siloPage: z.unknown(),
  }),
});

const ListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    articleDnas: z.array(z.unknown()),
    siloDnas: z.array(z.unknown()),
    siloPages: z.array(z.unknown()),
    aiReviews: z.array(z.unknown()).default([]),
    statuses: z.array(z.object({ versionId: z.string().min(1), status: z.string().min(1) })),
    source: z.literal("CANONICAL_REMOTE"),
  }),
});

export class CanonicalPersistenceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CanonicalPersistenceError";
  }
}

function parseVersion(type: ArquitetoArtifactType, value: unknown): ArquitetoArtifactVersion {
  if (type === "article_dna") return VersionedArticleDNASchema.parse(value);
  if (type === "silo_dna") return VersionedSiloDNASchema.parse(value);
  if (type === ARTICLE_AI_REVIEW_ARTIFACT_TYPE) {
    return VersionedArticleArchitectureAiReviewSchema.parse(value) as VersionedArticleArchitectureAiReview;
  }
  return VersionedSiloPageSchema.parse(value);
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
  if (!response.ok || !body || body.error) {
    throw new CanonicalPersistenceError(
      typeof body?.code === "string" && body.code.trim() ? body.code : "QUERY_FAILURE",
      typeof body?.error === "string" ? body.error : "Não foi possível confirmar a persistência canônica.",
    );
  }
  return body;
}

export async function persistArquitetoArtifact(input: {
  brandId: string;
  artifactType: ArquitetoArtifactType;
  action: "create" | "edit";
  version: ArquitetoArtifactVersion;
  status?: string;
}) {
  const response = await fetch("/api/arquiteto/artifacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = PersistenceResponseSchema.parse(await readResponse(response));
  return {
    persistence: body.data.persistence,
    source: body.data.source,
    version: parseVersion(input.artifactType, body.data.version),
  };
}

export async function persistArquitetoSiloPair(input: {
  brandId: string;
  action: "create" | "edit";
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
  siloDnaStatus: "draft" | "proposed" | "approved";
  siloPageStatus: "draft" | "proposed" | "approved";
}) {
  // LEGACY DRAFT-ONLY, e a recusa é do PRÓPRIO helper, não só da rota: confiar
  // apenas no guard do route handler deixaria um import futuro reabrir o bypass
  // de finalização sem Território, working copy nem Pilar humano.
  if (input.siloDnaStatus !== "draft" || input.siloPageStatus !== "draft") {
    throw new Error("LEGACY_SILO_PAIR_FINALIZATION_DISABLED");
  }
  const response = await fetch("/api/arquiteto/silo-pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = SiloPairPersistenceResponseSchema.parse(await readResponse(response));
  return {
    persistence: body.data.persistence,
    atomicity: body.data.atomicity,
    source: body.data.source,
    siloDna: VersionedSiloDNASchema.parse(body.data.siloDna) as VersionEnvelope<SiloDNA>,
    siloPage: VersionedSiloPageSchema.parse(body.data.siloPage) as VersionEnvelope<SiloPage>,
  };
}

export async function loadCanonicalArquitetoArtifacts(brandId: string) {
  const response = await fetch(`/api/arquiteto/artifacts?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
  const body = ListResponseSchema.parse(await readResponse(response));
  return {
    source: body.data.source,
    articleDnas: body.data.articleDnas.map(item => VersionedArticleDNASchema.parse(item)),
    siloDnas: body.data.siloDnas.map(item => VersionedSiloDNASchema.parse(item)),
    siloPages: body.data.siloPages.map(item => VersionedSiloPageSchema.parse(item)),
    aiReviews: body.data.aiReviews.map(item => VersionedArticleArchitectureAiReviewSchema.parse(item)) as VersionedArticleArchitectureAiReview[],
    statuses: body.data.statuses,
  };
}
