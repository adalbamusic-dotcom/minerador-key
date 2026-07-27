import { z } from "zod";
import type { ArticleControlContext, ArticleDNA, ArticleKgrIdentity, ArticleVolumeStrategy } from "../arquiteto/contracts.ts";

export const RadarKgrClassificationSchema = z.enum(["confirmed_kgr", "not_kgr", "not_available"]);
export const RadarSlugAlignmentSchema = z.enum(["aligned", "partially_aligned", "review_in_architect", "protected_published_identity", "insufficient_evidence"]);

const RadarKeywordRoleSchema = z.object({
  keywordId: z.string().min(1),
  keyword: z.string().min(1),
  role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  volume: z.number().nonnegative().nullable(),
  purpose: z.string().min(1),
}).strict();

export const RadarKgrStrategySchema = z.object({
  classification: RadarKgrClassificationSchema,
  source: z.enum(["minerador", "keyword_dna"]).optional(),
  principalKeyword: z.string().min(1),
  principalVolume: z.number().nonnegative().optional(),
  kgrScore: z.number().nonnegative().optional(),
  slug: z.string().min(1),
  slugAlignment: RadarSlugAlignmentSchema,
  keywordComposition: z.object({
    principalCount: z.literal(1),
    secondaryCount: z.number().int().nonnegative(),
    reinforcementCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    strategicLimit: z.literal(6),
  }).strict(),
  declaredVolumes: z.object({
    principal: z.number().nonnegative().optional(),
    secondaryTotal: z.number().nonnegative().optional(),
    reinforcementTotal: z.number().nonnegative().optional(),
    grossCombinedTotal: z.number().nonnegative().optional(),
    overlapWarning: z.literal(true),
  }).strict(),
  hierarchy: z.object({
    role: z.enum(["pillar", "support"]),
    supportOrder: z.number().int().positive().optional(),
    siloName: z.string().min(1).optional(),
    pillarArticleId: z.string().min(1).optional(),
  }).strict(),
  publicationProtection: z.object({
    isPublished: z.boolean(),
    protectedFields: z.array(z.string().min(1)),
  }).strict(),
  keywordRoles: z.array(RadarKeywordRoleSchema).default([]),
}).strict();
export type RadarKgrStrategy = z.infer<typeof RadarKgrStrategySchema>;

function normalize(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value: string) {
  return new Set(normalize(value).split(/\s+/).filter(word => word.length > 2));
}

function slugAlignment(keyword: string, slug: string, published: boolean): RadarKgrStrategy["slugAlignment"] {
  if (published) return "protected_published_identity";
  const keywordWords = words(keyword);
  const slugWords = words(slug.replace(/[/?#]/g, " "));
  if (!keywordWords.size || !slugWords.size) return "insufficient_evidence";
  const matched = [...keywordWords].filter(word => slugWords.has(word)).length;
  if (matched === keywordWords.size) return "aligned";
  if (matched > 0) return "partially_aligned";
  return "review_in_architect";
}

function classification(kgr: ArticleKgrIdentity | undefined): RadarKgrStrategy["classification"] {
  if (!kgr) return "not_available";
  return kgr.isKgrArticle ? "confirmed_kgr" : "not_kgr";
}

function source(kgr: ArticleKgrIdentity | undefined): RadarKgrStrategy["source"] {
  if (!kgr) return undefined;
  return kgr.source === "minerador" ? "minerador" : "keyword_dna";
}

function referenceKeyword(reference: ArticleDNA["keywordReferences"][number], fallback: string) {
  const snapshot = reference.keywordDnaSnapshot?.sourceKeywordSnapshot;
  return typeof snapshot?.keyword === "string" && snapshot.keyword.trim() ? snapshot.keyword.trim() : fallback;
}

function volumeStrategy(article: ArticleDNA, context: ArticleControlContext | null): ArticleVolumeStrategy | undefined {
  return context?.volume || article.volumeStrategy;
}

export function buildRadarKgrStrategy(input: {
  article: ArticleDNA;
  context?: ArticleControlContext | null;
  published: boolean;
  slug: string;
  siloName?: string | null;
  pillarArticleId?: string | null;
}): RadarKgrStrategy | null {
  const context = input.context || null;
  const kgr = context?.kgr || input.article.kgrIdentity;
  const volume = volumeStrategy(input.article, context);
  const references = input.article.keywordReferences;
  const primary = references.find(reference => reference.keywordId === input.article.principalKeywordId) || references[0];
  if (!primary) return null;
  if (!kgr && references.length <= 1 && !volume) return null;

  const contributions = volume?.contributions || references.map(reference => ({
    keywordId: reference.keywordId,
    keywordDnaId: reference.keywordDnaVersionId,
    role: reference.role,
    volume: reference.volume ?? null,
    incrementalVolume: reference.incrementalVolume ?? null,
    contribution: reference.contribution || "unknown",
    rationale: reference.purposeRationale || reference.purpose || "Papel recebido no ArticleDNA.",
  }));
  const roleFor = (reference: ArticleDNA["keywordReferences"][number]) => contributions.find(item => item.keywordId === reference.keywordId)?.role || reference.role;
  const keywordRoles = references.map(reference => ({
    keywordId: reference.keywordId,
    keyword: referenceKeyword(reference, reference.keywordId === input.article.principalKeywordId ? context?.primaryKeyword.keyword || reference.keywordId : reference.keywordId),
    role: roleFor(reference),
    volume: contributions.find(item => item.keywordId === reference.keywordId)?.volume ?? reference.volume ?? null,
    purpose: contributions.find(item => item.keywordId === reference.keywordId)?.rationale || reference.purposeRationale || reference.purpose || "Papel recebido no ArticleDNA.",
  }));
  const principalContribution = contributions.find(item => item.role === "principal");
  const secondaryContributions = contributions.filter(item => item.role === "secundaria");
  const reinforcementContributions = contributions.filter(item => item.role === "reforco_narrativo");
  const hierarchy = context?.hierarchy || input.article.hierarchyStrategy;
  const hierarchyRole = hierarchy?.role === "Pilar" ? "pillar" as const : "support" as const;
  const supportOrder = hierarchy?.role === "Suporte" && hierarchy.rank ? hierarchy.rank : undefined;
  const protectedFields = input.published ? ["principalKeyword", "slug", "canonical", "brand", "publishedUrl", "structuralUrl"] : [];
  const primaryKeyword = context?.primaryKeyword.keyword || referenceKeyword(primary, input.article.principalKeywordId);
  const primaryVolume = volume?.primaryKeywordVolume ?? principalContribution?.volume ?? undefined;
  const secondaryTotal = volume?.secondaryKeywordVolumeSum ?? sumKnown(secondaryContributions.map(item => item.volume));
  const reinforcementTotal = volume?.reinforcementKeywordVolumeSum ?? sumKnown(reinforcementContributions.map(item => item.volume));
  const grossCombinedTotal = volume?.grossCombinedVolume ?? sumKnown(contributions.map(item => item.volume));

  return RadarKgrStrategySchema.parse({
    classification: classification(kgr),
    ...(source(kgr) ? { source: source(kgr) } : {}),
    principalKeyword: primaryKeyword,
    ...(primaryVolume !== null && primaryVolume !== undefined ? { principalVolume: primaryVolume } : {}),
    ...(kgr?.kgrValue !== null && kgr?.kgrValue !== undefined ? { kgrScore: kgr.kgrValue } : {}),
    slug: input.slug,
    slugAlignment: slugAlignment(primaryKeyword, input.slug, input.published),
    keywordComposition: {
      principalCount: keywordRoles.filter(reference => reference.role === "principal").length === 1 ? 1 : 1,
      secondaryCount: keywordRoles.filter(reference => reference.role === "secundaria").length,
      reinforcementCount: keywordRoles.filter(reference => reference.role === "reforco_narrativo").length,
      totalCount: keywordRoles.length,
      strategicLimit: 6,
    },
    declaredVolumes: {
      ...(primaryVolume !== null && primaryVolume !== undefined ? { principal: primaryVolume } : {}),
      ...(secondaryTotal !== null && secondaryTotal !== undefined ? { secondaryTotal } : {}),
      ...(reinforcementTotal !== null && reinforcementTotal !== undefined ? { reinforcementTotal } : {}),
      ...(grossCombinedTotal !== null && grossCombinedTotal !== undefined ? { grossCombinedTotal } : {}),
      overlapWarning: true,
    },
    hierarchy: {
      role: hierarchyRole,
      ...(supportOrder ? { supportOrder } : {}),
      ...(input.siloName ? { siloName: input.siloName } : {}),
      ...(input.pillarArticleId ? { pillarArticleId: input.pillarArticleId } : {}),
    },
    publicationProtection: { isPublished: input.published, protectedFields },
    keywordRoles,
  });
}

function sumKnown(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function radarKgrClassificationLabel(value: RadarKgrStrategy["classification"], source?: RadarKgrStrategy["source"]) {
  return value === "confirmed_kgr" ? `KGR confirmado pelo ${source === "keyword_dna" ? "KeywordDNA" : "Minerador"}` : value === "not_kgr" ? "Não classificado como KGR" : "Classificação KGR não recebida";
}

export function radarSlugAlignmentLabel(value: RadarKgrStrategy["slugAlignment"]) {
  return value === "aligned" ? "Alinhado" : value === "partially_aligned" ? "Parcialmente alinhado" : value === "review_in_architect" ? "Revisar identidade no Arquiteto" : value === "protected_published_identity" ? "Identidade histórica publicada preservada" : "Evidência insuficiente";
}
