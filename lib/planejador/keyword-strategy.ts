import type {
  ArticleDNA,
  ArticleKeywordReference,
  ContentPlanDetails,
  ContentPlanKeywordCoverage,
  ContentPlanKeywordStrategy,
} from "../arquiteto/contracts.ts";
import { normalizeSearchIntent } from "../arquiteto/intent-profile.ts";

type PublicationState = "new" | "published" | "unknown" | "conflict";

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (value: string | null | undefined) => new Set(normalized(value || "").split(" ").filter(token => token.length > 2));
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

function sourceText(reference: ArticleKeywordReference): string | null {
  const value = reference.keywordDnaSnapshot?.sourceKeywordSnapshot.keyword;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceTailLength(reference: ArticleKeywordReference): number | null {
  const source = reference.keywordDnaSnapshot?.sourceKeywordSnapshot;
  if (!source) return null;
  for (const key of ["tailLength", "tail_length", "kgrTailLength", "kgr_tail_length"]) {
    const value = finite(source[key]);
    if (value !== null) return Math.trunc(value);
  }
  return null;
}

function dnaId(reference: ArticleKeywordReference) {
  return reference.keywordDnaSnapshot?.keywordId || reference.keywordDnaVersionId || reference.keywordId;
}

function sectionText(section: ContentPlanDetails["structure"]["sections"][number]) {
  return [section.heading, section.objective, ...(section.topics || []), ...(section.questions || []), ...(section.instructions || []), ...(section.restrictions || [])].join(" ");
}

function sectionMatch(text: string | null, section: ContentPlanDetails["structure"]["sections"][number]) {
  const phrase = tokens(text);
  if (!phrase.size) return 0;
  const target = tokens(sectionText(section));
  return [...phrase].filter(token => target.has(token)).length / phrase.size;
}

function coverageFor(reference: ArticleKeywordReference, details: ContentPlanDetails, role: ContentPlanKeywordCoverage["role"], primary: boolean, textOverride?: string | null): ContentPlanKeywordCoverage {
  const text = textOverride || sourceText(reference);
  const excluded = details.structure.sections.flatMap(section => section.excludedTopics);
  const excludedOverlap = text && tokens(text).size ? [...tokens(text)].filter(token => tokens(excluded.join(" ")).has(token)).length : 0;
  const matches = details.structure.sections.filter(section => section.level === 2 && sectionMatch(text, section) >= 0.4);
  const fallback = details.structure.sections.find(section => section.level === 2);
  const sectionIds = matches.length ? matches.map(section => section.id) : primary && fallback ? [fallback.id] : [];
  const conflicts: string[] = [];
  if (excludedOverlap) conflicts.push("A expressão se aproxima de um tópico explicitamente excluído.");
  const status: ContentPlanKeywordCoverage["status"] = excludedOverlap
    ? "outside_boundary"
    : reference.overlapRisk === "high" && !primary
      ? "conflict"
      : primary
        ? details.structure.h1.trim() && fallback ? "covered" : "upstream_review"
        : matches.some(section => sectionMatch(text, section) >= 0.7) ? "covered" : matches.length ? "partial" : "unassigned";
  if (status === "conflict") conflicts.push("Sobreposição lexical alta recebida do ArticleDNA; requer revisão upstream.");
  return {
    keywordId: reference.keywordId,
    keywordDnaId: dnaId(reference),
    role,
    status,
    sectionIds,
    target: primary ? "H1, objetivo e resposta principal" : reference.contribution === "entity_support" ? "Entidade ou objeção" : reference.contribution === "semantic_coverage" ? "Tópico ou narrativa" : "Seção, pergunta ou instrução compatível",
    contributions: [reference.contribution || (primary ? "central" : "semantic_coverage")],
    conflicts,
    origin: "article_dna",
    humanDecision: null,
  };
}

function compatibility(article: ArticleDNA, references: ArticleKeywordReference[]) {
  const primary = references.find(reference => reference.role === "principal");
  if (!primary) return "conflict" as const;
  const dominant = normalizeSearchIntent(article.mainIntent);
  const allowed = new Set([dominant, ...article.auxiliaryIntents.map(normalizeSearchIntent)]);
  const incompatible = references.filter(reference => reference.role !== "principal" && reference.normalizedIntent && !allowed.has(reference.normalizedIntent));
  return incompatible.length ? "conflict" as const : references.some(reference => reference.role !== "principal" && !reference.normalizedIntent) ? "unknown" as const : "compatible" as const;
}

function kgrStatus(article: ArticleDNA): ContentPlanKeywordStrategy["kgr"]["status"] {
  const identity = article.kgrIdentity;
  if (identity?.bindingStatus === "conflict" || identity?.status === "conflict") return "conflict";
  if (article.keywordStrategy?.principalKgrStatus) return article.keywordStrategy.principalKgrStatus;
  if (!identity) return "unknown";
  return identity.isKgrArticle ? identity.bindingStatus === "confirmed" ? "qualified" : "unknown" : "not_qualified";
}

function volumeFor(article: ArticleDNA, references: ArticleKeywordReference[]) {
  const strategy = article.volumeStrategy;
  const values = references.map(reference => finite(strategy?.contributions.find(item => item.keywordId === reference.keywordId)?.volume ?? reference.volume));
  const knownCount = values.filter((value): value is number => value !== null).length;
  const knownValues = values.filter((value): value is number => value !== null);
  const combined = strategy?.grossCombinedVolume ?? (knownCount ? knownValues.reduce((sum, value) => sum + value, 0) : null);
  const secondarySum = strategy?.secondaryKeywordVolumeSum ?? (knownCount ? values.slice(1).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0) : null);
  const coverage = knownCount === values.length ? "complete" : knownCount === 0 ? "unavailable" : "partial";
  return {
    principal: finite(strategy?.primaryKeywordVolume ?? values[0]), secondarySum: finite(secondarySum), combined: finite(combined), knownCount, totalCount: values.length, coverage,
    label: coverage === "complete" ? "Potencial de volume combinado" : coverage === "partial" ? "Potencial de volume combinado parcial" : "Potencial de volume combinado indisponível",
    purpose: "Soma dos volumes conhecidos das keywords deste ArticleDNA; não representa tráfego garantido.", overlapRisk: strategy?.overlapRisk || "unknown",
  } satisfies ContentPlanKeywordStrategy["volume"];
}

export function buildKeywordStrategySnapshot(input: { article: ArticleDNA; details: ContentPlanDetails; publicationState?: PublicationState; keywordLabels?: Record<string, string | null> }): ContentPlanKeywordStrategy {
  const references = input.article.keywordReferences;
  const primary = references.find(reference => reference.role === "principal") || references[0];
  const supports = references.filter(reference => reference !== primary).slice(0, 5);
  const publicationState = input.publicationState || (input.article.publishedIdentityRef ? "published" : "new");
  const published = publicationState === "published" || Boolean(input.article.publishedIdentityRef);
  const articleStrategy = input.article.keywordStrategy;
  const identity = input.article.kgrIdentity;
  const volume = volumeFor(input.article, references);
  const kgr = {
    status: kgrStatus(input.article), score: finite(identity?.kgrValue), resultCount: identity?.resultCount ?? null, tailLength: sourceTailLength(primary),
    source: identity?.source || (articleStrategy ? "ArticleDNA.keywordStrategy" : "não disponível"), boundSlug: identity?.boundSlug || null, keywordDnaVersionId: primary.keywordDnaVersionId,
  } satisfies ContentPlanKeywordStrategy["kgr"];
  const secondary = supports.map(reference => ({
    keywordId: reference.keywordId, keywordDnaId: dnaId(reference), keywordDnaVersionId: reference.keywordDnaVersionId, role: reference.role as "secundaria" | "reforco_narrativo",
    text: input.keywordLabels?.[reference.keywordId] || sourceText(reference), intent: reference.normalizedIntent || reference.originalIntentLabel || null, volume: finite(input.article.volumeStrategy?.contributions.find(item => item.keywordId === reference.keywordId)?.volume ?? reference.volume), incrementalVolume: finite(reference.incrementalVolume),
    contribution: reference.contribution || (reference.role === "reforco_narrativo" ? "semantic_coverage" : "incremental_volume"), rationale: reference.purposeRationale || reference.purpose || "Contribuição recebida do ArticleDNA.", conflicts: [], origin: reference.classificationOrigin,
  }));
  const coverage = [coverageFor(primary, input.details, "principal", true, input.keywordLabels?.[primary.keywordId]), ...supports.map(reference => coverageFor(reference, input.details, reference.role, false, input.keywordLabels?.[reference.keywordId]))];
  const alerts = [...coverage.flatMap(item => item.conflicts), ...(kgr.status === "conflict" ? ["A identidade KGR recebida está em conflito; não altere o ArticleDNA no Planejador."] : []), ...(input.article.keywordStrategy?.slugCoherence === "low" && !published ? ["A coerência entre a keyword KGR e o slug precisa de decisão humana antes da aprovação."] : [])];
  return {
    version: "planner-keyword-strategy-v1", primary: {
    keywordId: primary.keywordId, keywordDnaId: dnaId(primary), keywordDnaVersionId: primary.keywordDnaVersionId, text: input.keywordLabels?.[primary.keywordId] || sourceText(primary), intent: primary.normalizedIntent || normalizeSearchIntent(input.article.mainIntent), volume: volume.principal, kgrScore: kgr.score, resultCount: kgr.resultCount, tailLength: kgr.tailLength,
    }, secondary, keywordCount: references.length, maxKeywords: 6, volume, kgr,
    slugCoherence: published ? "protected_published" : articleStrategy?.slugCoherence || "unknown", hierarchy: {
      role: input.article.hierarchyStrategy?.role || input.article.hierarchy, rank: input.article.hierarchyStrategy?.rank || null, status: input.article.hierarchyStrategy?.status || "suggested", rationale: input.article.hierarchyStrategy?.rationale || ["Papel recebido do ArticleDNA; não recalculado no Planejador."],
    }, compatibility: compatibility(input.article, references), overlapRisk: input.article.volumeStrategy?.overlapRisk || "unknown", groupingRationale: articleStrategy?.groupingRationale || "Agrupamento recebido do ArticleDNA; o Planejador apenas interpreta a formação.", semanticNarrative: articleStrategy?.semanticNarrative || ["A principal orienta a resposta e as keywords de apoio ampliam a cobertura compatível."], coverage, publicationProtection: { isPublished: published, protectedFields: published ? ["slug", "canonical", "url", "brand", "principal"] : [] }, alerts: [...new Set(alerts)],
  };
}

export function keywordStrategyIssues(strategy: ContentPlanKeywordStrategy, article?: ArticleDNA | null): string[] {
  const issues: string[] = [];
  if (strategy.keywordCount < 1 || strategy.keywordCount > 6 || strategy.secondary.length > 5) issues.push("A estratégia precisa ter uma principal e no máximo cinco keywords de apoio.");
  if (strategy.compatibility === "conflict") issues.push("Existe keyword de apoio com intenção incompatível; revise a decisão no Arquiteto.");
  if (strategy.coverage.find(item => item.role === "principal")?.status !== "covered") issues.push("A keyword principal precisa estar associada ao H1, ao objetivo e a uma seção principal.");
  if (strategy.coverage.some(item => item.role !== "principal" && ["conflict", "outside_boundary", "upstream_review"].includes(item.status))) issues.push("Existe keyword de apoio fora da fronteira ou aguardando revisão upstream.");
  if (article && strategy.hierarchy.role !== article.hierarchy) issues.push("O papel hierárquico do plano diverge do ArticleDNA recebido.");
  if (strategy.kgr.status === "conflict") issues.push("A identidade KGR está em conflito e não pode ser alterada pelo Planejador.");
  if (strategy.slugCoherence === "low" && !strategy.publicationProtection.isPublished) issues.push("A coerência do slug para a estratégia KGR exige decisão humana.");
  return [...new Set(issues)];
}
