import { z } from "zod";
import type { ArticleDNA, SiloDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { RadarItem } from "../editorial/operational-flow.ts";

export const RadarHydrationKeywordSchema = z.object({
  referenceKeywordId: z.string().min(1),
  canonicalKeywordId: z.string().min(1).nullable(),
  sourceKeywordId: z.string().min(1).nullable(),
  originalKeywordId: z.string().min(1).nullable(),
  aliases: z.array(z.string().min(1)),
  keywordDnaVersionId: z.string().min(1),
  keyword: z.string().trim().min(1),
  role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  brandId: z.string().min(1),
  siloId: z.string().min(1).nullable(),
  siloName: z.string().trim().min(1).nullable(),
  isPublished: z.boolean(),
}).strict();

export const RadarHydrationSiloSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).nullable(),
  siloDnaVersionId: z.string().min(1).nullable(),
  siloDnaContentHash: z.string().min(1).nullable(),
}).strict();

export const RadarHydrationSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  source: z.enum(["arquiteto_import", "reconciled"]),
  capturedAt: z.string().datetime(),
  principalKeywordId: z.string().min(1),
  principalKeyword: RadarHydrationKeywordSchema.nullable(),
  keywordSnapshots: z.array(RadarHydrationKeywordSchema),
  silo: RadarHydrationSiloSchema.nullable(),
}).strict();

export type RadarHydrationSnapshot = z.infer<typeof RadarHydrationSnapshotSchema>;
export type RadarHydrationSourceKeyword = Record<string, unknown>;

const stringOf = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))];
const sourceIds = (source: RadarHydrationSourceKeyword) => unique([
  stringOf(source.id), stringOf(source.keywordId), stringOf(source.sourceKeywordId), stringOf(source.originalKeywordId),
]);
const publishedAlias = (value: string) => value.match(/^pub-k-(.+)$/i)?.[1] || null;

function sourceMatches(source: RadarHydrationSourceKeyword, referenceId: string) {
  const ids = sourceIds(source);
  return ids.includes(referenceId) || ids.some(id => publishedAlias(id) === referenceId || publishedAlias(referenceId) === id);
}

function snapshotForReference(
  article: ArticleDNA,
  reference: ArticleDNA["keywordReferences"][number],
  sourceKeywords: RadarHydrationSourceKeyword[],
  brandId: string,
) {
  const source = sourceKeywords.find(candidate => sourceMatches(candidate, reference.keywordId));
  const keyword = stringOf(source?.keyword);
  if (!source || !keyword) return null;
  const ids = sourceIds(source);
  const canonicalKeywordId = stringOf(source.canonicalKeywordId) || stringOf(source.keywordId) || stringOf(source.sourceKeywordId) || stringOf(source.originalKeywordId) || stringOf(source.id);
  const sourceKeywordId = stringOf(source.sourceKeywordId) || stringOf(source.keywordId);
  const originalKeywordId = stringOf(source.originalKeywordId) || sourceKeywordId;
  const siloId = stringOf(source.siloId) || stringOf(source.silo_id) || stringOf(source.lista_id) || article.siloId;
  const siloName = stringOf(source.siloName) || stringOf(source.silo_name);
  return RadarHydrationKeywordSchema.parse({
    referenceKeywordId: reference.keywordId, canonicalKeywordId, sourceKeywordId, originalKeywordId,
    aliases: ids.filter(id => id !== canonicalKeywordId), keywordDnaVersionId: reference.keywordDnaVersionId, keyword,
    role: reference.role, brandId, siloId, siloName, isPublished: source.isPublished === true || String(source.status || "").toLowerCase() === "publicado",
  });
}

export function createRadarHydrationSnapshot(input: {
  brandId: string;
  article: VersionEnvelope<ArticleDNA>;
  sourceKeywords?: RadarHydrationSourceKeyword[];
  silo?: VersionEnvelope<SiloDNA>;
  source: "arquiteto_import" | "reconciled";
  capturedAt?: string;
}): RadarHydrationSnapshot | null {
  const sourceKeywords = input.sourceKeywords || [];
  const snapshots = input.article.payload.keywordReferences.map(reference => snapshotForReference(input.article.payload, reference, sourceKeywords, input.brandId)).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const principal = snapshots.find(snapshot => snapshot.role === "principal") || null;
  const principalSource = principal || snapshots[0] || null;
  if (!principalSource) return null;
  const siloId = input.article.payload.siloId || principalSource.siloId;
  const siloName = principalSource.siloName || null;
  const silo = siloId ? RadarHydrationSiloSchema.parse({ id: siloId, name: siloName, siloDnaVersionId: input.silo?.versionId || null, siloDnaContentHash: input.silo?.contentHash || null }) : null;
  return RadarHydrationSnapshotSchema.parse({ schemaVersion: 1, brandId: input.brandId, articleId: input.article.payload.articleId, articleDnaVersionId: input.article.versionId, source: input.source, capturedAt: input.capturedAt || new Date().toISOString(), principalKeywordId: input.article.payload.principalKeywordId, principalKeyword: principal, keywordSnapshots: snapshots, silo });
}

export function reconcileRadarItems(
  items: RadarItem[],
  articleVersions: Record<string, VersionEnvelope<ArticleDNA>>,
  brandId: string,
  sourceKeywords: RadarHydrationSourceKeyword[],
  siloVersions: Record<string, VersionEnvelope<SiloDNA>> = {},
) {
  return items.map(item => {
    if (item.brandId !== brandId || item.hydration?.principalKeyword?.keyword) return item;
    const article = articleVersions[item.articleId];
    if (!article || article.payload.brandId !== brandId) return item;
    const hydration = createRadarHydrationSnapshot({ brandId, article, sourceKeywords, silo: article.payload.siloId ? siloVersions[article.payload.siloId] : undefined, source: "reconciled" });
    return hydration ? { ...item, hydration } : item;
  });
}
