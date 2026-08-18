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

export type ArquitetoArtifactType = "article_dna" | "silo_dna" | "silo_page";
export type ArquitetoArtifactVersion =
  | VersionEnvelope<ArticleDNA>
  | VersionEnvelope<SiloDNA>
  | VersionEnvelope<SiloPage>;

const PersistenceResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    persistence: z.enum(["PERSISTED", "UNCHANGED"]),
    version: z.unknown(),
    source: z.literal("CANONICAL_REMOTE"),
  }),
});

const ListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    articleDnas: z.array(z.unknown()),
    siloDnas: z.array(z.unknown()),
    siloPages: z.array(z.unknown()),
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

export async function loadCanonicalArquitetoArtifacts(brandId: string) {
  const response = await fetch(`/api/arquiteto/artifacts?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
  const body = ListResponseSchema.parse(await readResponse(response));
  return {
    source: body.data.source,
    articleDnas: body.data.articleDnas.map(item => VersionedArticleDNASchema.parse(item)),
    siloDnas: body.data.siloDnas.map(item => VersionedSiloDNASchema.parse(item)),
    siloPages: body.data.siloPages.map(item => VersionedSiloPageSchema.parse(item)),
    statuses: body.data.statuses,
  };
}
