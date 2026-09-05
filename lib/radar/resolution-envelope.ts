import { z } from "zod";
import type { ArticleDNA, SiloDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import { contentHash } from "../arquiteto/versioning.ts";
import type { RadarItem } from "../editorial/operational-flow.ts";
import {
  createRadarHydrationSnapshot,
  RadarHydrationKeywordSchema,
  RadarHydrationSiloSchema,
  type RadarHydrationSnapshot,
  type RadarHydrationSourceKeyword,
} from "./hydration.ts";
import { isTechnicalKeyword, normalizeKeyword } from "./keyword-resolver.ts";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const RadarSerpResolutionEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  radarItemId: z.string().min(1),
  articleId: z.string().min(1),
  articleDna: z.object({
    versionId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    contentHash: z.string().min(1),
    publicationState: z.enum(["published", "approved", "draft", "unknown"]),
  }).strict(),
  principalKeyword: RadarHydrationKeywordSchema.extend({ role: z.literal("principal") }),
  silo: RadarHydrationSiloSchema.nullable(),
  transfer: z.object({
    sourceModule: z.literal("arquiteto"),
    targetModule: z.literal("radar"),
    source: z.literal("browser_hydration"),
    transferredAt: z.string().datetime(),
    importKey: z.string().min(1),
  }).strict(),
  snapshotHash: Sha256Schema,
}).strict();

export type RadarSerpResolutionEnvelope = z.infer<typeof RadarSerpResolutionEnvelopeSchema>;
type RadarSerpResolutionEnvelopeUnsigned = Omit<RadarSerpResolutionEnvelope, "snapshotHash">;

export class RadarResolutionEnvelopeError extends Error {
  readonly code: "invalid_transfer" | "transfer_conflict";
  readonly status = 409;

  constructor(code: "invalid_transfer" | "transfer_conflict", message: string) {
    super(message);
    this.name = "RadarResolutionEnvelopeError";
    this.code = code;
  }
}

function hashInput(envelope: RadarSerpResolutionEnvelopeUnsigned) {
  return {
    schemaVersion: envelope.schemaVersion,
    brandId: envelope.brandId,
    radarItemId: envelope.radarItemId,
    articleId: envelope.articleId,
    articleDna: envelope.articleDna,
    principalKeyword: envelope.principalKeyword,
    silo: envelope.silo,
    transfer: {
      sourceModule: envelope.transfer.sourceModule,
      targetModule: envelope.transfer.targetModule,
      source: envelope.transfer.source,
      importKey: envelope.transfer.importKey,
    },
  };
}

export async function hashRadarSerpResolutionEnvelope(envelope: RadarSerpResolutionEnvelopeUnsigned) {
  return contentHash(hashInput(envelope));
}

export async function validateRadarSerpResolutionEnvelope(input: unknown) {
  const envelope = RadarSerpResolutionEnvelopeSchema.parse(input);
  const expectedHash = await hashRadarSerpResolutionEnvelope(envelope);
  if (expectedHash !== envelope.snapshotHash) {
    throw new RadarResolutionEnvelopeError("invalid_transfer", "A transferência editorial do Radar foi alterada ou está com hash inválido.");
  }
  if (isTechnicalKeyword(envelope.principalKeyword.keyword)) {
    throw new RadarResolutionEnvelopeError("invalid_transfer", "A transferência editorial não contém o texto da keyword principal.");
  }
  return envelope;
}

export function assertRadarEnvelopeMatchesArticle(
  envelope: RadarSerpResolutionEnvelope,
  input: { brandId: string; articleId: string; radarItemId?: string; article: VersionEnvelope<ArticleDNA> },
) {
  const { article } = input;
  const principal = article.payload.keywordReferences.find(reference => reference.role === "principal" && reference.keywordId === article.payload.principalKeywordId);
  if (!principal) throw new RadarResolutionEnvelopeError("transfer_conflict", "ArticleDNA sem vínculo coerente com a keyword principal.");
  const conflicts: string[] = [];
  if (envelope.brandId !== input.brandId) conflicts.push("marca");
  if (envelope.articleId !== input.articleId || envelope.articleId !== article.payload.articleId) conflicts.push("artigo");
  if (input.radarItemId && envelope.radarItemId !== input.radarItemId) conflicts.push("item do Radar");
  if (envelope.articleDna.versionId !== input.article.versionId || envelope.articleDna.versionNumber !== input.article.versionNumber || envelope.articleDna.contentHash !== input.article.contentHash) conflicts.push("versão do ArticleDNA");
  if (envelope.principalKeyword.referenceKeywordId !== principal.keywordId || envelope.principalKeyword.keywordDnaVersionId !== principal.keywordDnaVersionId) conflicts.push("vínculo da keyword principal");
  if (envelope.principalKeyword.brandId !== input.brandId) conflicts.push("marca da keyword principal");
  if (article.payload.siloId && envelope.silo?.id !== article.payload.siloId) conflicts.push("silo");
  if (conflicts.length) {
    throw new RadarResolutionEnvelopeError("transfer_conflict", `A transferência editorial diverge do ArticleDNA atual em: ${conflicts.join(", ")}.`);
  }
}

type RadarWorkflowIdentityInput = {
  workflowId: string;
  workflowBrandId: string;
  workflowArticleId: string;
  workflowSourceVersionId?: string | null;
  workflowPayload: unknown;
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  resolutionEnvelope: Pick<RadarSerpResolutionEnvelope, "radarItemId">;
};

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

/**
 * A persisted workflow row and a recovered browser item can expose the same
 * Radar item through different technical IDs. The UUID from the workflow row
 * is canonical; the older `radar:<articleId>` payload ID is accepted only
 * when every editorial identity still matches the current row.
 */
export function isRadarWorkflowIdentityCompatible(input: RadarWorkflowIdentityInput): boolean {
  if (!input.workflowId || input.workflowBrandId !== input.brandId || input.workflowArticleId !== input.articleId) return false;
  if (input.workflowSourceVersionId && input.workflowSourceVersionId !== input.articleDnaVersionId) return false;
  if (input.resolutionEnvelope.radarItemId === input.workflowId) return true;
  const payload = recordFromUnknown(input.workflowPayload);
  return payload?.id === input.resolutionEnvelope.radarItemId
    && payload.brandId === input.brandId
    && payload.articleId === input.articleId
    && payload.articleDnaVersionId === input.articleDnaVersionId;
}

export function assertRadarWorkflowIdentityMatchesEnvelope(input: RadarWorkflowIdentityInput) {
  if (isRadarWorkflowIdentityCompatible(input)) return;
  throw new RadarResolutionEnvelopeError("transfer_conflict", "A transferência editorial não corresponde ao item atual do Radar.");
}

export function assertRemoteKeywordMatchesEnvelope(envelope: RadarSerpResolutionEnvelope, keyword: string) {
  if (normalizeKeyword(keyword).toLocaleLowerCase() !== normalizeKeyword(envelope.principalKeyword.keyword).toLocaleLowerCase()) {
    throw new RadarResolutionEnvelopeError("transfer_conflict", "A keyword canônica remota diverge do texto transferido pelo Arquiteto; a coleta foi bloqueada.");
  }
}

function publicationState(article: VersionEnvelope<ArticleDNA>, principal: RadarHydrationSnapshot["principalKeyword"]) {
  return article.payload.articleId.startsWith("pub-b-") || principal?.isPublished ? "published" as const : "approved" as const;
}

export async function createRadarSerpResolutionEnvelope(input: {
  brandId: string;
  radarItem: RadarItem;
  article: VersionEnvelope<ArticleDNA>;
  articleDnaVersionId: string;
  hydration?: RadarHydrationSnapshot | null;
  sourceKeywords?: RadarHydrationSourceKeyword[];
  silo?: VersionEnvelope<SiloDNA>;
  transferredAt?: string;
}): Promise<RadarSerpResolutionEnvelope> {
  const articleDnaVersionId = typeof input.articleDnaVersionId === "string" ? input.articleDnaVersionId.trim() : "";
  if (!articleDnaVersionId) {
    throw new RadarResolutionEnvelopeError("invalid_transfer", "A versão do ArticleDNA deste item do Radar não está disponível.");
  }
  if (input.radarItem.articleDnaVersionId && input.radarItem.articleDnaVersionId !== articleDnaVersionId) {
    throw new RadarResolutionEnvelopeError("transfer_conflict", "O item do Radar diverge da versão do ArticleDNA selecionada.");
  }
  if (input.article.versionId && input.article.versionId !== articleDnaVersionId) {
    throw new RadarResolutionEnvelopeError("transfer_conflict", "A versão do ArticleDNA local diverge da versão transportada pelo item do Radar.");
  }
  const derived = !input.hydration?.principalKeyword?.keyword && input.sourceKeywords?.length
    ? createRadarHydrationSnapshot({ brandId: input.brandId, article: input.article, sourceKeywords: input.sourceKeywords, silo: input.silo, source: "reconciled" })
    : null;
  const hydration = input.hydration?.principalKeyword?.keyword ? input.hydration : derived;
  const principal = hydration?.principalKeyword;
  if (!principal || principal.role !== "principal") {
    throw new RadarResolutionEnvelopeError("invalid_transfer", "Os dados editoriais deste artigo ainda não foram reconciliados para o Radar.");
  }
  const unsigned: RadarSerpResolutionEnvelopeUnsigned = {
    schemaVersion: 1,
    brandId: input.brandId,
    radarItemId: input.radarItem.id,
    articleId: input.article.payload.articleId,
    articleDna: {
      versionId: articleDnaVersionId,
      versionNumber: input.article.versionNumber,
      contentHash: input.article.contentHash,
      publicationState: publicationState(input.article, principal),
    },
    principalKeyword: RadarSerpResolutionEnvelopeSchema.shape.principalKeyword.parse({ ...principal, role: "principal" }),
    silo: hydration?.silo || (input.article.payload.siloId ? RadarHydrationSiloSchema.parse({ id: input.article.payload.siloId, name: null, siloDnaVersionId: input.silo?.versionId || null, siloDnaContentHash: input.silo?.contentHash || null }) : null),
    transfer: {
      sourceModule: "arquiteto",
      targetModule: "radar",
      source: "browser_hydration",
      transferredAt: input.transferredAt || new Date().toISOString(),
      importKey: `radar:${input.article.payload.articleId}:${articleDnaVersionId}:${input.radarItem.id}`,
    },
  };
  return RadarSerpResolutionEnvelopeSchema.parse({ ...unsigned, snapshotHash: await hashRadarSerpResolutionEnvelope(unsigned) });
}
