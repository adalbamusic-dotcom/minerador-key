import { z } from "zod";
import { type ArticleKeywordReference, type ArchitectKeyword, ContentHashSchema, KeywordDnaProvenanceSnapshotSchema, type VersionReference } from "./contracts.ts";
import { contentHash } from "./versioning.ts";
import { SerpResearchSnapshotSchema, type SerpResearchSnapshot } from "../radar/serp/contracts.ts";
import { intentCompatibility, normalizeSearchIntent } from "./intent-profile.ts";

export const SerpFormationModeSchema = z.enum(["keyword_individual", "keyword_individual_comparison"]);
export const SerpAssessmentModeSchema = z.enum(["formacao", "arquitetura_publicado", "fortalecimento"]);
export const SerpRecommendationActionSchema = z.enum([
  "manter_principal", "manter_secundaria", "manter_reforco", "tornar_principal",
  "separar_artigo", "retirar_do_artigo", "revisar_humano", "fortalecer_intencao",
  "revisar_conteudo", "sugerir_artigo_suporte",
]);
export const SerpRecommendationStatusSchema = z.enum(["pending", "followed", "ignored", "superseded"]);
export const SerpRecommendationConfidenceSchema = z.enum(["alta", "media", "baixa", "inconclusiva"]);
export const SerpValidationProfileSchema = z.enum(["standard", "kgr_light", "published_architecture", "published_strengthening"]);
export const SerpFormationEvidenceCompatibilitySchema = z.enum(["coerente", "parcialmente_coerente", "incompativel", "insuficiente"]);
export const SerpFormationOverlapSchema = z.enum(["low", "medium", "high", "unknown"]);
export const SerpFormationCannibalizationSchema = z.enum(["likely", "unlikely", "unknown"]);

export const SerpFormationKeywordEvidenceSchema = z.object({
  keywordId: z.string().min(1),
  keywordDnaVersionId: z.string().min(1),
  snapshotIds: z.array(z.string().min(1)).min(1),
  compatibility: SerpFormationEvidenceCompatibilitySchema,
  overlap: SerpFormationOverlapSchema,
  observedIntent: z.string().nullable(),
  dominantPageType: z.string().nullable(),
  competition: z.enum(["baixa", "media", "alta", "desconhecida"]),
  conflict: z.boolean(),
  conflictReasons: z.array(z.string()),
  likelyCannibalization: SerpFormationCannibalizationSchema,
  needsSeparation: z.boolean().nullable(),
  canJoin: z.boolean().nullable(),
  principalPossiblyInadequate: z.boolean().nullable(),
  insufficientEvidence: z.boolean(),
}).strict();
export type SerpFormationKeywordEvidence = z.infer<typeof SerpFormationKeywordEvidenceSchema>;

export const SerpFormationOverlapEvidenceSchema = z.object({
  leftKeywordId: z.string().min(1),
  leftKeywordDnaVersionId: z.string().min(1),
  rightKeywordId: z.string().min(1),
  rightKeywordDnaVersionId: z.string().min(1),
  sharedResultCount: z.number().int().nonnegative(),
  sharedDomainCount: z.number().int().nonnegative(),
  overlap: SerpFormationOverlapSchema,
}).strict();
export type SerpFormationOverlapEvidence = z.infer<typeof SerpFormationOverlapEvidenceSchema>;

export const SerpFormationEvidenceSchema = z.object({
  keywordObservations: z.array(SerpFormationKeywordEvidenceSchema).min(1),
  overlaps: z.array(SerpFormationOverlapEvidenceSchema),
  guidelines: z.array(z.string().min(1)).min(1),
}).strict();
export type SerpFormationEvidence = z.infer<typeof SerpFormationEvidenceSchema>;

export const SerpSiloCandidateEvidenceSchema = z.object({
  keywordId: z.string().min(1),
  keywordDnaVersionId: z.string().min(1),
  snapshotIds: z.array(z.string().min(1)),
  observedIntent: z.string().nullable(),
  dominantPageTypes: z.array(z.string()),
  categoryHubLike: z.boolean().nullable(),
  broadUniverse: z.boolean().nullable(),
  multipleNeeds: z.boolean().nullable(),
  amplitudeSufficient: z.boolean().nullable(),
  evidenceStatus: z.enum(["observed", "insufficient"]),
  notes: z.array(z.string().min(1)).min(1),
}).strict();
export type SerpSiloCandidateEvidence = z.infer<typeof SerpSiloCandidateEvidenceSchema>;

export const SerpSiloCandidateAssessmentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  brandId: z.string().min(1),
  keywordId: z.string().min(1),
  keywordDnaVersionId: z.string().min(1),
  keywordDnaSnapshot: KeywordDnaProvenanceSnapshotSchema,
  snapshot: SerpResearchSnapshotSchema.nullable(),
  evidence: SerpSiloCandidateEvidenceSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
}).strict();
export type SerpSiloCandidateAssessment = z.infer<typeof SerpSiloCandidateAssessmentSchema>;

export const SerpRecommendationDecisionSchema = z.object({
  status: SerpRecommendationStatusSchema,
  actorId: z.string().min(1).nullable(),
  decidedAt: z.string().datetime().nullable(),
  workCopyVersion: z.string().min(1).nullable(),
  note: z.string().nullable(),
}).strict();

export const SerpKeywordRecommendationSchema = z.object({
  id: z.string().min(1),
  keywordId: z.string().min(1),
  keywordDnaVersionId: z.string().min(1),
  snapshotIds: z.array(z.string().min(1)).min(1),
  currentRole: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  suggestedRole: z.enum(["principal", "secundaria", "reforco_narrativo", "fora_do_artigo"]),
  action: SerpRecommendationActionSchema,
  confidence: SerpRecommendationConfidenceSchema.default("media"),
  reason: z.string().min(1),
  conflicts: z.array(z.string()),
  decision: SerpRecommendationDecisionSchema,
}).strict();
export type SerpKeywordRecommendation = z.infer<typeof SerpKeywordRecommendationSchema>;

export const SerpFormationAssessmentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  version: z.number().int().positive(),
  previousVersionId: z.string().min(1).nullable(),
  contentHash: ContentHashSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  mode: SerpFormationModeSchema,
  assessmentMode: SerpAssessmentModeSchema.default("formacao"),
  validationProfile: SerpValidationProfileSchema.default("standard"),
  queryCount: z.number().int().positive(),
  queriedKeywordDnaIds: z.array(z.string().min(1)).optional(),
  keywordDnaReferences: z.array(KeywordDnaProvenanceSnapshotSchema).min(1),
  snapshots: z.array(SerpResearchSnapshotSchema).min(1),
  intentCompatibility: z.enum(["coerente", "parcialmente_coerente", "incompativel", "insuficiente"]),
  competitionLevel: z.enum(["baixa", "media", "alta", "desconhecida"]),
  dominantResultTypes: z.array(z.string()),
  recommendations: z.array(SerpKeywordRecommendationSchema).min(1),
  conflicts: z.array(z.string()),
  notes: z.array(z.string()),
  formationEvidence: SerpFormationEvidenceSchema.optional(),
  evaluationStatus: z.enum(["active", "outdated"]).default("active"),
  outdatedReason: z.string().nullable().default(null),
  /**
   * Qual composição esta evidência observou.
   *
   * Sem isso não há como provar que a avaliação vigente ainda descreve o
   * artigo de agora: uma SERP excelente de outra composição continuaria
   * exibindo um ✓ verde enquanto autoriza gravar outra coisa.
   *
   * Opcional porque avaliações anteriores ao gate não a declaram — e essas
   * são tratadas como desatualizadas, nunca como atuais.
   */
  formationBaseHash: z.string().min(1).optional(),
}).strict();
export type SerpFormationAssessment = z.infer<typeof SerpFormationAssessmentSchema>;

export const SerpPublicationVerificationSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1).nullable(),
  requestedUrl: z.string().url(),
  resolvedUrl: z.string().url().nullable(),
  declaredCanonical: z.string().url().nullable(),
  httpStatus: z.number().int().nullable(),
  sitemapUrl: z.string().url().nullable(),
  sitemapMatch: z.boolean().nullable(),
  status: z.enum(["verified", "sitemap_match", "canonical_mismatch", "not_in_sitemap", "unreachable", "missing_site_configuration", "conflict", "error"]),
  checkedAt: z.string().datetime(),
  checkedBy: z.string().min(1),
  message: z.string().nullable(),
}).strict();
export type SerpPublicationVerification = z.infer<typeof SerpPublicationVerificationSchema>;

export const SerpFormationRecoverySchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  updatedAt: z.string().datetime(),
  assessments: z.array(SerpFormationAssessmentSchema),
  verifications: z.array(SerpPublicationVerificationSchema).default([]),
  siloCandidateEvidence: z.array(SerpSiloCandidateAssessmentSchema).default([]),
}).strict();
export type SerpFormationRecovery = z.infer<typeof SerpFormationRecoverySchema>;

export const architectSerpFormationKey = (actorUserId: string, brandId: string) => `architect-serp-formation:${actorUserId}:${brandId}`;

export function latestSerpFormationAssessment(
  assessments: SerpFormationAssessment[],
  brandId: string,
  articleId: string,
): SerpFormationAssessment | undefined {
  return assessments
    .filter(assessment => assessment.brandId === brandId && assessment.articleId === articleId)
    .sort((left, right) => right.version - left.version)
    .at(0);
}

export function latestActiveSerpFormationAssessment(
  assessments: SerpFormationAssessment[],
  brandId: string,
  articleId: string,
): SerpFormationAssessment | undefined {
  return assessments
    .filter(assessment => assessment.brandId === brandId && assessment.articleId === articleId && assessment.evaluationStatus === "active")
    .sort((left, right) => right.version - left.version)
    .at(0);
}

export function findSerpRecommendationForKeyword(
  assessment: SerpFormationAssessment,
  keywordDnaId: string,
): SerpKeywordRecommendation | undefined {
  const reference = assessment.keywordDnaReferences.find(item => item.keywordId === keywordDnaId);
  if (!reference) return undefined;
  return assessment.recommendations.find(item => item.keywordId === keywordDnaId && item.keywordDnaVersionId === reference.versionReference.versionId);
}

export function unassociatedSerpRecommendations(assessment: SerpFormationAssessment): SerpKeywordRecommendation[] {
  const expectedVersions = new Map(assessment.keywordDnaReferences.map(reference => [reference.keywordId, reference.versionReference.versionId]));
  const exactCounts = new Map<string, number>();
  for (const recommendation of assessment.recommendations) {
    const key = `${recommendation.keywordId}:${recommendation.keywordDnaVersionId}`;
    exactCounts.set(key, (exactCounts.get(key) || 0) + 1);
  }
  return assessment.recommendations.filter(recommendation => {
    const key = `${recommendation.keywordId}:${recommendation.keywordDnaVersionId}`;
    return expectedVersions.get(recommendation.keywordId) !== recommendation.keywordDnaVersionId || exactCounts.get(key) !== 1;
  });
}

export function assessedKeywordDnaIds(assessment: SerpFormationAssessment): string[] {
  return assessment.queriedKeywordDnaIds?.length ? assessment.queriedKeywordDnaIds : assessment.keywordDnaReferences.map(reference => reference.keywordId);
}

export function markSerpAssessmentOutdated(assessment: SerpFormationAssessment, reason = "Desatualizado por correção do avaliador"): SerpFormationAssessment {
  return SerpFormationAssessmentSchema.parse({ ...assessment, evaluationStatus: "outdated", outdatedReason: reason });
}

export function resolvePublishedIdentity(sources: Array<{ keywordDnaId: string; publishedUrl?: string | null; canonical?: string | null; slug?: string | null }>) {
  const urls = [...new Set(sources.map(source => source.publishedUrl).filter((value): value is string => Boolean(value)))];
  const canonicals = [...new Set(sources.map(source => source.canonical).filter((value): value is string => Boolean(value)))];
  const sourceKeywordDnaIds = sources.map(source => source.keywordDnaId);
  if (urls.length > 1 || canonicals.length > 1) return { status: "conflict" as const, urls, canonicals, sourceKeywordDnaIds };
  if (!urls.length) return { status: "missing" as const, urls: [], canonicals, sourceKeywordDnaIds };
  return { status: "coherent" as const, publishedUrl: urls[0], canonical: canonicals[0], urls, canonicals, sourceKeywordDnaIds };
}

const resultTypes = (snapshots: SerpResearchSnapshot[]) => [...new Set(snapshots.flatMap(snapshot => snapshot.diagnostic.pageTypes))].sort();
const competitionFor = (snapshots: SerpResearchSnapshot[]) => {
  const domains = new Set(snapshots.flatMap(snapshot => snapshot.organicResults.map(result => result.domain)));
  const total = snapshots.reduce((sum, snapshot) => sum + snapshot.organicResults.length, 0);
  if (!total) return "desconhecida" as const;
  if (domains.size >= 8 || total >= 25) return "alta" as const;
  if (domains.size >= 4 || total >= 10) return "media" as const;
  return "baixa" as const;
};

export function resolveSerpValidationProfile(mode: z.infer<typeof SerpAssessmentModeSchema>, kgrConfirmed: boolean): z.infer<typeof SerpValidationProfileSchema> {
  if (kgrConfirmed) return "kgr_light";
  if (mode === "arquitetura_publicado") return "published_architecture";
  if (mode === "fortalecimento") return "published_strengthening";
  return "standard";
}

const weakSnippetEvidence = (value: string) => /snippet/i.test(value) && /(t[oó]pico|ocorr[eê]ncia|aus[eê]ncia|sem ocorr)/i.test(value);
const hierarchyAsFormat = (value: string) => /formato esperado.*\b(pilar|suporte|refor[cç]o)\b/i.test(value);
const equivalentIntentConflict = (value: string) => {
  const match = value.match(/esperada\s*\(([^)]+)\).*aparente\s*\(([^)]+)\)/i);
  return Boolean(match && normalizeSearchIntent(match[1]) !== "unknown" && normalizeSearchIntent(match[1]) === normalizeSearchIntent(match[2]));
};

/** Corrige a semântica no limite proprietário do Arquiteto sem mudar o avaliador/UI do Radar. */
export function normalizeArchitectSerpSnapshot(snapshot: SerpResearchSnapshot): SerpResearchSnapshot {
  const rawConflicts = snapshot.diagnostic.possibleConflicts;
  const weakDetected = rawConflicts.some(weakSnippetEvidence);
  const possibleConflicts = rawConflicts.filter(conflict => !weakSnippetEvidence(conflict) && !hierarchyAsFormat(conflict) && !equivalentIntentConflict(conflict));
  const limitations = [...new Set([
    ...snapshot.diagnostic.limitations,
    ...(weakDetected ? ["Cobertura não observada nos snippets", "Evidência insuficiente para concluir ausência no conteúdo completo."] : []),
  ])];
  const verdict = !snapshot.organicResults.length
    ? "informacao_insuficiente" as const
    : possibleConflicts.length
      ? "possivel_conflito" as const
      : weakDetected || snapshot.diagnostic.verdict === "possivel_conflito" ? "parcialmente_coerente" as const
        : snapshot.diagnostic.verdict;
  return SerpResearchSnapshotSchema.parse({
    ...snapshot,
    diagnostic: {
      ...snapshot.diagnostic,
      dominantIntent: snapshot.diagnostic.dominantIntent ? normalizeSearchIntent(snapshot.diagnostic.dominantIntent) : null,
      secondaryIntents: snapshot.diagnostic.secondaryIntents.map(normalizeSearchIntent),
      possibleConflicts,
      limitations,
      verdict,
      ...(weakDetected ? { confidence: "insufficient" as const } : {}),
    },
  });
}

function recommendationConfidence(snapshot: SerpResearchSnapshot, profile: z.infer<typeof SerpValidationProfileSchema>, hasStrongConflict: boolean): z.infer<typeof SerpRecommendationConfidenceSchema> {
  if (!snapshot.organicResults.length || snapshot.diagnostic.confidence === "insufficient") return "inconclusiva";
  if (profile === "kgr_light" || snapshot.diagnostic.confidence === "low") return hasStrongConflict ? "baixa" : "inconclusiva";
  if (hasStrongConflict && snapshot.diagnostic.confidence === "high") return "alta";
  return snapshot.diagnostic.confidence === "high" ? "alta" : "media";
}

function actionFor(reference: ArticleKeywordReference, snapshot: SerpResearchSnapshot, principalKeywordId: string, profile: z.infer<typeof SerpValidationProfileSchema>): SerpKeywordRecommendation["action"] {
  if (!snapshot.organicResults.length || snapshot.diagnostic.verdict === "informacao_insuficiente") return "revisar_humano";
  if (snapshot.diagnostic.possibleConflicts.length) return reference.keywordId === principalKeywordId || recommendationConfidence(snapshot, profile, true) !== "alta" ? "revisar_humano" : "separar_artigo";
  if (reference.role === "principal") return "manter_principal";
  if (reference.role === "reforco_narrativo") return "manter_reforco";
  return "manter_secundaria";
}

function strengtheningActionFor(reference: ArticleKeywordReference, snapshot: SerpResearchSnapshot, principalKeywordId: string, profile: z.infer<typeof SerpValidationProfileSchema>): SerpKeywordRecommendation["action"] {
  const isPrincipal = reference.keywordId === principalKeywordId || reference.role === "principal";
  if (isPrincipal) return snapshot.diagnostic.verdict === "informacao_insuficiente" ? "revisar_conteudo" : "fortalecer_intencao";
  if (!snapshot.organicResults.length || snapshot.diagnostic.verdict === "informacao_insuficiente") return "revisar_conteudo";
  if (snapshot.diagnostic.possibleConflicts.length) return recommendationConfidence(snapshot, profile, true) === "alta" ? "retirar_do_artigo" : "revisar_humano";
  if (reference.role === "reforco_narrativo") return "manter_reforco";
  return "manter_secundaria";
}

function reasonFor(reference: ArticleKeywordReference, snapshot: SerpResearchSnapshot, assessmentMode: z.infer<typeof SerpAssessmentModeSchema>, action: SerpKeywordRecommendation["action"], confidence: z.infer<typeof SerpRecommendationConfidenceSchema>): string {
  if (assessmentMode === "fortalecimento" && action === "fortalecer_intencao") return "Lacuna de fortalecimento: a SERP observada sugere reforçar a intenção principal no conteúdo da URL publicada.";
  if (confidence === "inconclusiva") return "Evidência insuficiente para recomendar separação; revisar compatibilidade humana e considerar a cobertura além dos snippets.";
  if (snapshot.diagnostic.limitations.some(weakSnippetEvidence)) return "Cobertura não observada nos snippets; evidência insuficiente para concluir ausência. Avaliar a página completa antes de qualquer mudança.";
  if (assessmentMode === "formacao") return snapshot.diagnostic.possibleConflicts[0] || `A SERP sustenta o papel ${reference.role}.`;
  if (assessmentMode === "arquitetura_publicado") return snapshot.diagnostic.possibleConflicts[0] || `A SERP de arquitetura do publicado ajuda a revisar o papel ${reference.role} sem alterar a URL existente.`;
  if (action === "fortalecer_intencao") return "Lacuna de fortalecimento: a SERP observada sugere reforçar a intenção principal no conteúdo da URL publicada.";
  if (action === "revisar_conteudo") return "Oportunidade editorial: revisar o conteúdo ao redor da principal publicada para responder melhor ao formato e às perguntas observadas.";
  if (action === "retirar_do_artigo") return "A SERP apresenta sinais de incompatibilidade para esta secundária; avaliar remoção da cópia de trabalho ou uma unidade editorial complementar.";
  return snapshot.diagnostic.possibleConflicts[0] || `A SERP sustenta o papel ${reference.role} no fortalecimento da URL publicada.`;
}

function compatibilityFor(snapshots: SerpResearchSnapshot[], references: ArticleKeywordReference[], principalKeywordId: string): SerpFormationAssessment["intentCompatibility"] {
  if (!snapshots.length || snapshots.every(snapshot => !snapshot.organicResults.length)) return "insuficiente";
  const principalReference = references.find(reference => reference.keywordId === principalKeywordId);
  const principalSnapshot = snapshots.find(snapshot => snapshot.keywordId === principalKeywordId);
  const expected = normalizeSearchIntent(principalReference?.normalizedIntent || principalReference?.keywordDnaSnapshot?.payload.searchIntent || principalReference?.coveredIntentions[0]);
  const observed = normalizeSearchIntent(principalSnapshot?.diagnostic.dominantIntent);
  if (!principalSnapshot || !principalSnapshot.organicResults.length || expected === "unknown" || observed === "unknown") return "insuficiente";
  if (expected !== observed) return principalSnapshot.diagnostic.confidence === "high" ? "incompativel" : "parcialmente_coerente";
  const outlier = references.some(reference => {
    if (reference.keywordId === principalKeywordId) return false;
    const intent = normalizeSearchIntent(reference.normalizedIntent || reference.keywordDnaSnapshot?.payload.searchIntent || reference.coveredIntentions[0]);
    return intentCompatibility(expected, intent, reference.role) === "outlier";
  });
  return outlier || snapshots.some(snapshot => snapshot.diagnostic.verdict === "parcialmente_coerente") ? "parcialmente_coerente" : "coerente";
}

const sharedUrlCount = (left: SerpResearchSnapshot, right: SerpResearchSnapshot) => {
  const rightUrls = new Set(right.organicResults.map(result => result.url));
  return [...new Set(left.organicResults.map(result => result.url))].filter(url => rightUrls.has(url)).length;
};

const sharedDomainCount = (left: SerpResearchSnapshot, right: SerpResearchSnapshot) => {
  const rightDomains = new Set(right.organicResults.map(result => result.domain));
  return [...new Set(left.organicResults.map(result => result.domain))].filter(domain => rightDomains.has(domain)).length;
};

function overlapFor(sharedResults: number, sharedDomains: number, left: SerpResearchSnapshot, right: SerpResearchSnapshot): SerpFormationOverlapEvidence["overlap"] {
  if (!left.organicResults.length || !right.organicResults.length) return "unknown";
  const denominator = Math.max(1, Math.min(new Set(left.organicResults.map(result => result.url)).size, new Set(right.organicResults.map(result => result.url)).size));
  const ratio = sharedResults / denominator;
  if (ratio >= 0.5 || sharedResults >= 5 || sharedDomains >= 5) return "high";
  if (ratio > 0 || sharedDomains > 0) return "medium";
  return "low";
}

function keywordCompatibilityFor(reference: ArticleKeywordReference, snapshot: SerpResearchSnapshot): SerpFormationKeywordEvidence["compatibility"] {
  if (!snapshot.organicResults.length || snapshot.diagnostic.verdict === "informacao_insuficiente") return "insuficiente";
  const expected = normalizeSearchIntent(reference.normalizedIntent || reference.keywordDnaSnapshot?.payload.searchIntent || reference.coveredIntentions[0]);
  const observed = normalizeSearchIntent(snapshot.diagnostic.dominantIntent);
  if (expected === "unknown" || observed === "unknown") return "insuficiente";
  if (expected !== observed) return snapshot.diagnostic.confidence === "high" ? "incompativel" : "parcialmente_coerente";
  return snapshot.diagnostic.verdict === "parcialmente_coerente" ? "parcialmente_coerente" : "coerente";
}

/**
 * Produz somente evidência observacional. Não recebe a working copy e não
 * possui operação de regrouping, promoção ou consolidação de ArticleDNA.
 */
export function buildSerpFormationEvidence(input: {
  principalKeywordId: string;
  keywordReferences: ArticleKeywordReference[];
  snapshots: SerpResearchSnapshot[];
}): SerpFormationEvidence {
  const normalizedSnapshots = input.snapshots.map(normalizeArchitectSerpSnapshot);
  const referencesByKeyword = new Map(input.keywordReferences.map(reference => [reference.keywordId, reference]));
  const overlaps: SerpFormationOverlapEvidence[] = [];

  for (let leftIndex = 0; leftIndex < normalizedSnapshots.length; leftIndex += 1) {
    const left = normalizedSnapshots[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedSnapshots.length; rightIndex += 1) {
      const right = normalizedSnapshots[rightIndex];
      if (!right) continue;
      const leftReference = referencesByKeyword.get(left.keywordId);
      const rightReference = referencesByKeyword.get(right.keywordId);
      if (!leftReference || !rightReference) continue;
      const sharedResults = sharedUrlCount(left, right);
      const sharedDomains = sharedDomainCount(left, right);
      overlaps.push(SerpFormationOverlapEvidenceSchema.parse({
        leftKeywordId: left.keywordId,
        leftKeywordDnaVersionId: leftReference.keywordDnaVersionId,
        rightKeywordId: right.keywordId,
        rightKeywordDnaVersionId: rightReference.keywordDnaVersionId,
        sharedResultCount: sharedResults,
        sharedDomainCount: sharedDomains,
        overlap: overlapFor(sharedResults, sharedDomains, left, right),
      }));
    }
  }

  const keywordObservations = normalizedSnapshots.map(snapshot => {
    const reference = referencesByKeyword.get(snapshot.keywordId);
    if (!reference) throw new Error(`Referência KeywordDNA ausente para a evidência SERP ${snapshot.keywordId}.`);
    const pairOverlaps = overlaps.filter(overlap => overlap.leftKeywordId === snapshot.keywordId || overlap.rightKeywordId === snapshot.keywordId);
    const overlap = pairOverlaps.length
      ? pairOverlaps.some(item => item.overlap === "high") ? "high" : pairOverlaps.some(item => item.overlap === "medium") ? "medium" : pairOverlaps.every(item => item.overlap === "low") ? "low" : "unknown"
      : "unknown";
    const compatibility = keywordCompatibilityFor(reference, snapshot);
    const insufficientEvidence = compatibility === "insuficiente" || snapshot.diagnostic.confidence === "insufficient";
    const conflict = snapshot.diagnostic.possibleConflicts.length > 0;
    const needsSeparation = insufficientEvidence ? null : compatibility === "incompativel" || conflict;
    const canJoin = insufficientEvidence ? null : compatibility === "coerente" && !conflict;
    const principalPossiblyInadequate = snapshot.keywordId === input.principalKeywordId
      ? insufficientEvidence ? null : compatibility === "incompativel" || conflict
      : null;
    return SerpFormationKeywordEvidenceSchema.parse({
      keywordId: snapshot.keywordId,
      keywordDnaVersionId: reference.keywordDnaVersionId,
      snapshotIds: [snapshot.id],
      compatibility,
      overlap,
      observedIntent: snapshot.diagnostic.dominantIntent || null,
      dominantPageType: snapshot.diagnostic.pageTypes[0] || null,
      competition: competitionFor([snapshot]),
      conflict,
      conflictReasons: snapshot.diagnostic.possibleConflicts,
      likelyCannibalization: overlap === "high" ? "likely" : overlap === "low" ? "unlikely" : "unknown",
      needsSeparation,
      canJoin,
      principalPossiblyInadequate,
      insufficientEvidence,
    });
  });

  return SerpFormationEvidenceSchema.parse({
    keywordObservations,
    overlaps,
    guidelines: [
      "SERP é evidência observacional; não move, divide, junta ou consolida grupos.",
      "Ausência de resultado ou cobertura permanece como evidência insuficiente, não como conflito.",
      "Qualquer separação, junção, troca de principal ou criação de Silo continua dependendo de decisão humana.",
    ],
  });
}

export function buildSiloCandidateSerpEvidence(input: {
  brandId: string;
  createdBy: string;
  createdAt?: string;
  keywordDnaSnapshot: z.infer<typeof KeywordDnaProvenanceSnapshotSchema>;
  snapshot?: SerpResearchSnapshot | null;
}): SerpSiloCandidateAssessment {
  const snapshot = input.snapshot ? normalizeArchitectSerpSnapshot(input.snapshot) : null;
  const createdAt = input.createdAt || new Date().toISOString();
  const evidence = snapshot
    ? SerpSiloCandidateEvidenceSchema.parse({
      keywordId: input.keywordDnaSnapshot.keywordId,
      keywordDnaVersionId: input.keywordDnaSnapshot.versionReference.versionId,
      snapshotIds: [snapshot.id],
      observedIntent: snapshot.diagnostic.dominantIntent || null,
      dominantPageTypes: snapshot.diagnostic.pageTypes,
      categoryHubLike: snapshot.organicResults.length ? snapshot.diagnostic.pageTypes.some(type => /category|local|institutional/i.test(type)) || snapshot.diagnostic.pageTypes.length >= 2 : null,
      broadUniverse: snapshot.organicResults.length ? snapshot.diagnostic.pageTypes.length >= 2 || snapshot.diagnostic.frequentEntities.length >= 2 : null,
      multipleNeeds: snapshot.organicResults.length ? snapshot.diagnostic.secondaryIntents.length > 0 || snapshot.peopleAlsoAsk.length > 1 || snapshot.relatedSearches.length > 1 : null,
      amplitudeSufficient: snapshot.organicResults.length ? snapshot.diagnostic.pageTypes.length >= 2 && (snapshot.diagnostic.secondaryIntents.length > 0 || snapshot.relatedSearches.length > 1) : null,
      evidenceStatus: snapshot.organicResults.length && snapshot.diagnostic.confidence !== "insufficient" ? "observed" : "insufficient",
      notes: snapshot.organicResults.length && snapshot.diagnostic.confidence !== "insufficient"
        ? ["A SERP acrescenta sinais sobre amplitude e tipo de hub; isso não confirma um Silo."]
        : ["Evidência insuficiente; a candidata permanece reservada sem promoção ou criação de Silo."],
    })
    : SerpSiloCandidateEvidenceSchema.parse({
      keywordId: input.keywordDnaSnapshot.keywordId,
      keywordDnaVersionId: input.keywordDnaSnapshot.versionReference.versionId,
      snapshotIds: [], observedIntent: null, dominantPageTypes: [], categoryHubLike: null, broadUniverse: null,
      multipleNeeds: null, amplitudeSufficient: null, evidenceStatus: "insufficient",
      notes: ["SERP indisponível ou não consultada; ausência não confirma conflito nem elimina a candidata."],
    });
  return SerpSiloCandidateAssessmentSchema.parse({
    schemaVersion: 1,
    id: `serp-silo-candidate:${input.brandId}:${input.keywordDnaSnapshot.keywordId}:${input.keywordDnaSnapshot.versionReference.versionId}`,
    brandId: input.brandId,
    keywordId: input.keywordDnaSnapshot.keywordId,
    keywordDnaVersionId: input.keywordDnaSnapshot.versionReference.versionId,
    keywordDnaSnapshot: input.keywordDnaSnapshot,
    snapshot,
    evidence,
    createdAt,
    createdBy: input.createdBy,
  });
}

export function preserveSiloCandidateEvidenceOnFailure(previous: SerpSiloCandidateAssessment[], incoming: SerpSiloCandidateAssessment[]): SerpSiloCandidateAssessment[] {
  const incomingByKey = new Map(incoming.map(item => [`${item.keywordId}:${item.keywordDnaVersionId}`, item]));
  const previousByKey = new Map(previous.map(item => [`${item.keywordId}:${item.keywordDnaVersionId}`, item]));
  return [...new Set([...previousByKey.keys(), ...incomingByKey.keys()])].map(key => {
    const next = incomingByKey.get(key);
    const old = previousByKey.get(key);
    return next?.snapshot || !old?.snapshot ? next || old! : old;
  });
}

export async function buildSerpFormationAssessment(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  createdBy: string;
  previousVersionId?: string | null;
  principalKeywordId: string;
  assessmentMode?: z.infer<typeof SerpAssessmentModeSchema>;
  keywordReferences: ArticleKeywordReference[];
  keywordDnaReferences: Array<z.infer<typeof KeywordDnaProvenanceSnapshotSchema>>;
  snapshots: SerpResearchSnapshot[];
  queriedKeywordDnaIds?: string[];
  validationProfile?: z.infer<typeof SerpValidationProfileSchema>;
  previousVersion?: number;
  createdAt?: string;
  /** Composição observada; viaja com a evidência para provar currency. */
  formationBaseHash?: string | null;
}): Promise<SerpFormationAssessment> {
  const createdAt = input.createdAt || new Date().toISOString();
  const assessmentMode = input.assessmentMode || "formacao";
  const validationProfile = input.validationProfile || resolveSerpValidationProfile(assessmentMode, false);
  const id = `serp-formation:${input.brandId}:${input.articleId}:v${(input.previousVersion || 0) + 1}`;
  const normalizedSnapshots = input.snapshots.map(normalizeArchitectSerpSnapshot);
  const snapshotByKeyword = new Map(normalizedSnapshots.map(snapshot => [snapshot.keywordId, snapshot]));
  const queriedIds = input.queriedKeywordDnaIds?.length ? input.queriedKeywordDnaIds : input.keywordReferences.map(reference => reference.keywordId);
  const recommendations = input.keywordReferences.filter(reference => queriedIds.includes(reference.keywordId)).map(reference => {
    const snapshot = snapshotByKeyword.get(reference.keywordId);
    if (!snapshot) throw new Error(`Snapshot ausente para a keyword ${reference.keywordId}.`);
    const confidence = recommendationConfidence(snapshot, validationProfile, snapshot.diagnostic.possibleConflicts.length > 0);
    const action = assessmentMode === "fortalecimento"
      ? strengtheningActionFor(reference, snapshot, input.principalKeywordId, validationProfile)
      : actionFor(reference, snapshot, input.principalKeywordId, validationProfile);
    return SerpKeywordRecommendationSchema.parse({
      id: `${id}:recommendation:${reference.keywordId}`,
      keywordId: reference.keywordId, keywordDnaVersionId: reference.keywordDnaVersionId,
      snapshotIds: [snapshot.id], currentRole: reference.role,
      suggestedRole: action === "separar_artigo" ? "fora_do_artigo" : action === "tornar_principal" ? "principal" : reference.role,
      action, confidence, reason: reasonFor(reference, snapshot, assessmentMode, action, confidence),
      conflicts: snapshot.diagnostic.possibleConflicts, decision: { status: "pending", actorId: null, decidedAt: null, workCopyVersion: null, note: null },
    });
  });
  const conflicts = [...new Set(normalizedSnapshots.flatMap(snapshot => snapshot.diagnostic.possibleConflicts))];
  const notes = [...new Set(normalizedSnapshots.flatMap(snapshot => snapshot.diagnostic.limitations))];
  const draft = {
    schemaVersion: 1 as const, id, brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId,
    version: (input.previousVersion || 0) + 1, previousVersionId: input.previousVersionId || null, createdAt, createdBy: input.createdBy,
    mode: "keyword_individual" as const, assessmentMode, validationProfile, queryCount: normalizedSnapshots.length, queriedKeywordDnaIds: queriedIds, keywordDnaReferences: input.keywordDnaReferences,
    snapshots: normalizedSnapshots, intentCompatibility: compatibilityFor(normalizedSnapshots, input.keywordReferences, input.principalKeywordId), competitionLevel: competitionFor(normalizedSnapshots),
    formationEvidence: buildSerpFormationEvidence({ principalKeywordId: input.principalKeywordId, keywordReferences: input.keywordReferences, snapshots: normalizedSnapshots }),
    dominantResultTypes: resultTypes(input.snapshots), recommendations, conflicts, notes,
    // A evidência carimba a composição que observou; sem isso não há como
    // provar depois que ela ainda descreve o artigo de agora.
    ...(input.formationBaseHash ? { formationBaseHash: input.formationBaseHash } : {}),
  };
  return SerpFormationAssessmentSchema.parse({ ...draft, contentHash: await contentHash(draft) });
}

export function decideSerpRecommendation(
  assessment: SerpFormationAssessment,
  keywordId: string,
  status: "followed" | "ignored",
  actorId: string,
  workCopyVersion: string,
  note: string | null = null,
): SerpFormationAssessment {
  const found = assessment.recommendations.find(recommendation => recommendation.keywordId === keywordId);
  if (!found) throw new Error(`Recomendação ausente para a keyword ${keywordId}.`);
  const recommendations = assessment.recommendations.map(recommendation => recommendation.keywordId === keywordId
    ? { ...recommendation, decision: { status, actorId, decidedAt: new Date().toISOString(), workCopyVersion, note } }
    : recommendation);
  return SerpFormationAssessmentSchema.parse({ ...assessment, recommendations });
}

export function supersedeRecommendations(previous: SerpFormationAssessment, successorId: string): SerpFormationAssessment {
  return SerpFormationAssessmentSchema.parse({ ...previous, recommendations: previous.recommendations.map(recommendation => ({ ...recommendation, decision: { ...recommendation.decision, status: "superseded", note: `Substituída pelo assessment ${successorId}.` } })) });
}

export function isPublishedStructuralRecommendation(action: SerpKeywordRecommendation["action"], keywordId: string, principalKeywordId: string): boolean {
  return action === "tornar_principal" || keywordId === principalKeywordId && ["separar_artigo", "retirar_do_artigo"].includes(action);
}

export function applySerpRecommendationToWorkCopy<T extends ArchitectKeyword & Record<string, unknown>>(input: {
  keywords: T[];
  keywordId: string;
  recommendation: SerpKeywordRecommendation;
  principalKeywordId: string;
  published: boolean;
  principalProtected?: boolean;
}): { keywords: T[]; changed: boolean; blocked: boolean; reason: string | null } {
  const target = input.keywords.find(keyword => keyword.id === input.keywordId);
  if (!target) return { keywords: input.keywords, changed: false, blocked: true, reason: "Keyword não encontrada na cópia de trabalho." };
  const principalProtected = input.principalProtected ?? input.published;
  if (principalProtected && isPublishedStructuralRecommendation(input.recommendation.action, input.keywordId, input.principalKeywordId)) return { keywords: input.keywords, changed: false, blocked: true, reason: "A principal confirmada e a identidade estrutural permanecem protegidas." };
  if (["manter_principal", "manter_secundaria", "manter_reforco", "revisar_humano", "fortalecer_intencao", "revisar_conteudo", "sugerir_artigo_suporte"].includes(input.recommendation.action)) return { keywords: input.keywords, changed: false, blocked: false, reason: null };
  const next = input.keywords.map(keyword => keyword.id !== input.keywordId ? keyword : {
    ...keyword,
    ...(input.recommendation.action === "tornar_principal" ? { computedHierarquia: "Pilar", reviewRole: "principal" } : {}),
    ...(input.recommendation.action === "separar_artigo" || input.recommendation.action === "retirar_do_artigo" ? { clusterId: null, provisionalGroupId: null, computedHierarquia: undefined, reviewRole: undefined } : {}),
  } as T);
  return { keywords: next, changed: true, blocked: false, reason: null };
}

export type { VersionReference };
