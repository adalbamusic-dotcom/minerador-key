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
  hydration?: RadarHydrationSnapshot | null;
  sourceKeywords?: RadarHydrationSourceKeyword[];
  silo?: VersionEnvelope<SiloDNA>;
  transferredAt?: string;
}): Promise<RadarSerpResolutionEnvelope> {
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
      versionId: input.article.versionId,
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
      importKey: `radar:${input.article.payload.articleId}:${input.article.versionId}:${input.radarItem.id}`,
    },
  };
  return RadarSerpResolutionEnvelopeSchema.parse({ ...unsigned, snapshotHash: await hashRadarSerpResolutionEnvelope(unsigned) });
}
