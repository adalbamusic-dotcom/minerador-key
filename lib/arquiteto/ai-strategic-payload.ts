import { z } from "zod";
import {
  ContentHashSchema,
  KeywordArticleCatalogEntrySchema,
  KeywordReviewFocusGroupSchema,
  LogicalKeywordRecommendationSchema,
  type ArchitectKeyword,
} from "./contracts.ts";
import {
  SerpAssessmentModeSchema,
  SerpFormationEvidenceCompatibilitySchema,
  SerpFormationModeSchema,
  SerpRecommendationActionSchema,
  SerpRecommendationConfidenceSchema,
  type SerpFormationAssessment,
} from "./serp-formation.ts";

/**
 * Projeção estratégica da keyword para a IA arquitetural.
 *
 * A UI do Arquiteto é lossless por contrato; o payload da IA não precisa ser.
 * A segunda leitura arquitetural decide pertencimento, Principal, papéis e
 * canibalização — para isso bastam fatos estratégicos. Enviar o registro cru da
 * keyword (blobs de provider, histórico mensal, proveniência técnica) estourava
 * o limite do provider com poucos artigos selecionados.
 */
export const AI_STRATEGIC_PAYLOAD_LIMIT = 180_000;

/** Chaves semânticas que participam da decisão arquitetural. */
const STRATEGIC_SEMANTIC_KEYS = [
  "intencao_principal",
  "intencao_secundaria",
  "funil",
  "entidade_central",
  "modificadores",
  "publico",
  "problema_percebido",
  "resultado_desejado",
  "tipo_editorial",
  "kgr_aplicabilidade",
  "ambiguidade",
  "nicho",
  "confianca",
  "leitura_logica",
  "leitura_canonica",
] as const;

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type StrategicKeywordProjection = {
  keywordId: string;
  keyword: string;
  role: string | null;
  intent: string | null;
  funnel: string | null;
  centralEntity: string | null;
  modifiers: string | null;
  audience: string | null;
  volume: number | null;
  results: number | null;
  kgrScore: number | null;
  kgrApplicability: string | null;
  cpcMicros: string | null;
  keywordDifficulty: number | null;
  trend: number | string | null;
  competitionAds: string | null;
  averageMonthlySearches: number | null;
  primaryKeywordPolicy: string | null;
  upstreamStatus: string | null;
  published: boolean;
};

/** Reduz a keyword aos fatos que a decisão arquitetural realmente usa. */
export function projectKeywordForStrategicReview(
  keyword: ArchitectKeyword & Record<string, unknown>,
  role?: string | null,
): StrategicKeywordProjection {
  const semantic = (keyword.analise_semantica || {}) as Record<string, unknown>;
  // Fatos de demanda/competição: escalares do Google Ads, sem histórico mensal.
  const ads = ((keyword.demandEvidence as { googleAds?: Record<string, unknown> } | undefined)?.googleAds || {}) as Record<string, unknown>;
  return {
    keywordId: String(keyword.id),
    keyword: String(keyword.keyword || ""),
    role: role || textValue(keyword.reviewRole) || null,
    intent: textValue(keyword.intent) || textValue(semantic.intencao_principal),
    funnel: textValue(semantic.funil) || textValue(semantic.funnel),
    centralEntity: textValue(semantic.entidade_central),
    modifiers: textValue(semantic.modificadores),
    audience: textValue(semantic.publico),
    volume: numberValue(keyword.volume_search),
    results: numberValue(keyword.results_allintitle),
    kgrScore: numberValue(keyword.kgr_score) ?? numberValue((keyword as { kgr?: unknown }).kgr),
    kgrApplicability: textValue(semantic.kgr_aplicabilidade),
    cpcMicros: textValue(ads.averageCpcMicros),
    keywordDifficulty: numberValue(semantic.kd) ?? numberValue(semantic.keyword_difficulty),
    trend: typeof ads.trend === "number" || typeof ads.trend === "string" ? ads.trend : null,
    competitionAds: textValue(ads.competitionAds),
    averageMonthlySearches: numberValue(ads.averageMonthlySearches),
    primaryKeywordPolicy: textValue(keyword.primaryKeywordPolicy),
    upstreamStatus: textValue(keyword.status),
    published: Boolean(keyword.isPublished || String(keyword.status || "").toLowerCase() === "publicado"),
  };
}

/** Mantém apenas as chaves semânticas estratégicas do registro recebido. */
export function projectStrategicSemantic(semantic: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!semantic) return {};
  return Object.fromEntries(STRATEGIC_SEMANTIC_KEYS
    .map(key => [key, semantic[key]])
    .filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export const StrategicSerpCompetitionSchema = z.enum(["baixa", "media", "alta", "desconhecida"]);

/**
 * Recomendação da SERP reduzida ao que decide arquitetura.
 *
 * `id`, `keywordDnaVersionId`, `snapshotIds` e `decision` são proveniência e
 * rastro de decisão humana: existem na leitura da UI e não participam da
 * segunda leitura arquitetural.
 */
export const StrategicSerpRecommendationSchema = z.object({
  keywordId: z.string().min(1),
  currentRole: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  suggestedRole: z.enum(["principal", "secundaria", "reforco_narrativo", "fora_do_artigo"]),
  action: SerpRecommendationActionSchema,
  confidence: SerpRecommendationConfidenceSchema,
  reason: z.string().min(1),
  conflicts: z.array(z.string()),
}).strict();
export type StrategicSerpRecommendation = z.infer<typeof StrategicSerpRecommendationSchema>;

/**
 * Contrato da SERP compacta enviada à IA arquitetural.
 *
 * Deliberadamente não é o assessment integral: `organicResults`,
 * `peopleAlsoAsk`, `knowledgeGraph` e `formationEvidence` são evidência de
 * leitura humana e respondiam pela maior parte do payload. O que fica é
 * identidade/proveniência suficiente para referenciar e validar o assessment,
 * mais o veredito que decide arquitetura. `snapshotCount` preserva, como
 * escalar, a semântica que o gate lia em `snapshots.length`.
 */
export const StrategicSerpAssessmentSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1).optional(),
  version: z.number().int().positive(),
  contentHash: ContentHashSchema,
  evaluationStatus: z.enum(["active", "outdated"]),
  mode: SerpFormationModeSchema,
  assessmentMode: SerpAssessmentModeSchema,
  snapshotCount: z.number().int().nonnegative(),
  intentCompatibility: SerpFormationEvidenceCompatibilitySchema,
  competitionLevel: StrategicSerpCompetitionSchema,
  dominantResultTypes: z.array(z.string()),
  recommendations: z.array(StrategicSerpRecommendationSchema),
  conflicts: z.array(z.string()),
  notes: z.array(z.string()),
  queriedKeywords: z.array(z.object({ keywordId: z.string().min(1), query: z.string().min(1) }).strict()),
}).strict();
export type StrategicSerpAssessment = z.infer<typeof StrategicSerpAssessmentSchema>;

type StrategicSerpSource = SerpFormationAssessment | Record<string, unknown>;

/** Veredito e observações da SERP, sem os snapshots crus do provider. */
export function projectSerpAssessmentForStrategicReview(
  assessment: StrategicSerpSource | null | undefined,
): StrategicSerpAssessment | null {
  if (!assessment) return null;
  const source = assessment as Partial<SerpFormationAssessment>;
  const snapshots = Array.isArray(source.snapshots) ? source.snapshots : [];
  return {
    id: String(source.id ?? ""),
    brandId: String(source.brandId ?? ""),
    articleId: String(source.articleId ?? ""),
    // Base sem ArticleDNA consolidado ainda não tem versão a referenciar.
    ...(source.articleDnaVersionId ? { articleDnaVersionId: source.articleDnaVersionId } : {}),
    version: Number(source.version ?? 0),
    contentHash: String(source.contentHash ?? ""),
    evaluationStatus: source.evaluationStatus ?? "active",
    mode: source.mode ?? "keyword_individual",
    assessmentMode: source.assessmentMode ?? "formacao",
    // Escalar de cobertura: substitui `snapshots.length` sem transportar snapshot.
    snapshotCount: snapshots.length,
    intentCompatibility: source.intentCompatibility ?? "insuficiente",
    competitionLevel: source.competitionLevel ?? "desconhecida",
    dominantResultTypes: source.dominantResultTypes ?? [],
    recommendations: (source.recommendations ?? []).map(recommendation => ({
      keywordId: recommendation.keywordId,
      currentRole: recommendation.currentRole,
      suggestedRole: recommendation.suggestedRole,
      action: recommendation.action,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      conflicts: recommendation.conflicts ?? [],
    })),
    conflicts: source.conflicts ?? [],
    notes: source.notes ?? [],
    queriedKeywords: snapshots.map(snapshot => ({ keywordId: snapshot.keywordId, query: snapshot.query })),
  };
}

/** Identidade e fronteira do Silo: o suficiente para decidir permanência. */
export function projectSiloForStrategicReview(silo: Record<string, unknown> | null | undefined) {
  if (!silo) return null;
  return {
    siloId: silo.siloId,
    name: silo.name,
    centralEntity: silo.centralEntity,
    dominantIntent: silo.dominantIntent,
    boundary: silo.boundary,
    includedTopics: silo.includedTopics,
    excludedTopics: silo.excludedTopics,
    pillarArticleId: silo.pillarArticleId,
    supportArticleIds: silo.supportArticleIds,
  };
}

/**
 * Contrato do request de `/api/revalidate-structure`.
 *
 * Vive aqui, ao lado das projeções, para que rota, cliente e testes usem o
 * mesmo schema. A regressão do HTTP 400 nasceu de a rota validar `serpAssessments`
 * com o assessment integral enquanto o cliente já enviava a projeção compacta.
 */
export const StructureReviewRequestSchema = z.object({
  focusGroups: z.array(KeywordReviewFocusGroupSchema).min(1).max(4),
  articleCatalog: z.array(KeywordArticleCatalogEntrySchema).min(1).max(16),
  logicalRecommendations: z.array(LogicalKeywordRecommendationSchema).min(1).max(40),
  brand: z.object({
    id: z.string(),
    name: z.string(),
    niche: z.string().nullable().optional(),
    /** Fonte já existente em Marca; é contexto selecionado, não um novo armazenamento. */
    guidelines: z.string().nullable().optional(),
  }).optional(),
  serpAssessments: z.array(StrategicSerpAssessmentSchema).max(20).default([]),
  silos: z.array(z.unknown()).max(100).optional(),
  publishedProtections: z.array(z.unknown()).max(40).optional(),
}).strict();
export type StructureReviewRequest = z.infer<typeof StructureReviewRequestSchema>;
/** Após o parse a Marca é certa: o gate de brandId roda antes de qualquer consumidor. */
export type BrandedStructureReviewRequest = StructureReviewRequest & { brand: NonNullable<StructureReviewRequest["brand"]> };

export type StructureReviewRejection = { status: number; error: string; code?: string; issues?: unknown };
export type StructureReviewGate<T> = { ok: true; data: T } | { ok: false; rejection: StructureReviewRejection };

/** Contrato do lote compacto. Falhar aqui nunca deve consumir o provider. */
export function parseStructureReviewRequest(raw: unknown): StructureReviewGate<BrandedStructureReviewRequest> {
  const parsed = StructureReviewRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, rejection: { status: 400, error: "Lote compacto de keywords invalido.", issues: parsed.error.flatten() } };
  }
  if (!parsed.data.brand?.id) {
    return { ok: false, rejection: { status: 400, error: "brandId é obrigatório para a revisão de estrutura." } };
  }
  return { ok: true, data: parsed.data as BrandedStructureReviewRequest };
}

/** Articles do lote sem SERP vigente da própria Marca realmente avaliada. */
export function missingStrategicSerpArticleIds(data: StructureReviewRequest): string[] {
  const requiredArticleIds = new Set(data.focusGroups.map(group => group.articleId));
  const validSerpArticleIds = new Set(data.serpAssessments
    .filter(assessment => assessment.brandId === data.brand?.id
      && assessment.evaluationStatus === "active"
      && assessment.snapshotCount > 0)
    .map(assessment => assessment.articleId));
  return [...requiredArticleIds].filter(articleId => !validSerpArticleIds.has(articleId));
}

/** A compactação reduz o transporte da SERP; não relaxa o gate. */
export function strategicSerpGate(data: StructureReviewRequest): StructureReviewGate<StructureReviewRequest> {
  if (missingStrategicSerpArticleIds(data).length) {
    return { ok: false, rejection: { status: 409, error: "Valide a SERP antes de revisar com IA.", code: "SERP_REQUIRED" } };
  }
  return { ok: true, data };
}

/** A pré-análise lógica precisa cobrir exatamente as keywords do lote. */
export function logicalCoverageGate(data: StructureReviewRequest): StructureReviewGate<StructureReviewRequest> {
  const requestedKeywordIds = new Set(data.focusGroups.flatMap(group => group.keywords.map(keyword => keyword.keywordId)));
  const recommendationIds = new Set(data.logicalRecommendations.map(recommendation => recommendation.keywordId));
  if (requestedKeywordIds.size !== recommendationIds.size || [...requestedKeywordIds].some(id => !recommendationIds.has(id))) {
    return { ok: false, rejection: { status: 400, error: "A pre-analise logica nao cobre exatamente as keywords do lote." } };
  }
  return { ok: true, data };
}

/** Estados de execução por Article observados pela orquestração. */
export type ArticleAiExecutionState =
  | "COMPLETED_NO_PROPOSALS"
  | "COMPLETED_WITH_PROPOSALS"
  | "ERROR";

export type StrategicPayloadMeasurement = {
  bytes: number;
  limit: number;
  withinLimit: boolean;
  topContributors: Array<{ key: string; bytes: number }>;
};

/**
 * Mede o payload antes da chamada: exceder o limite vira erro específico
 * daquele Article, nunca uma falha genérica do lote.
 */
export function measureStrategicPayload(payload: unknown, limit = AI_STRATEGIC_PAYLOAD_LIMIT): StrategicPayloadMeasurement {
  const serialized = JSON.stringify(payload ?? null) ?? "";
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const topContributors = record
    ? Object.entries(record)
      .map(([key, value]) => ({ key, bytes: (JSON.stringify(value ?? null) ?? "").length }))
      .sort((left, right) => right.bytes - left.bytes)
      .slice(0, 5)
    : [];
  return { bytes: serialized.length, limit, withinLimit: serialized.length <= limit, topContributors };
}

export type ArticleAiExecutionOutcome<T> =
  | { articleId: string; status: "completed"; result: T }
  | { articleId: string; status: "error"; message: string; payloadBytes?: number };

export type ArticleAiBatchSummary = {
  requestedArticles: number;
  completedArticles: number;
  failedArticles: number;
};

/** Consolida execuções por Article preservando o que deu certo. */
export function summarizeArticleAiExecutions<T>(outcomes: readonly ArticleAiExecutionOutcome<T>[]): ArticleAiBatchSummary {
  return {
    requestedArticles: outcomes.length,
    completedArticles: outcomes.filter(outcome => outcome.status === "completed").length,
    failedArticles: outcomes.filter(outcome => outcome.status === "error").length,
  };
}

export type ArticleAiExecutionStateEntry = { articleId: string; state: ArticleAiExecutionState };

/**
 * Contabiliza a execução por Article.
 *
 * Um Article está concluído quando o request chegou ao provider, a resposta foi
 * normalizada e o resultado passou no contrato local. `COMPLETED_NO_PROPOSALS` e
 * `COMPLETED_WITH_PROPOSALS` são os dois desfechos concluídos: ter proposta
 * pendente é trabalho para o humano, nunca falha de execução. Só `ERROR` conta
 * como falha.
 */
export function summarizeArticleAiExecutionStates(
  states: readonly ArticleAiExecutionStateEntry[],
): ArticleAiBatchSummary {
  return {
    requestedArticles: states.length,
    completedArticles: states.filter(entry => entry.state !== "ERROR").length,
    failedArticles: states.filter(entry => entry.state === "ERROR").length,
  };
}

export type ArticleAiBatchSeverity = "success" | "warning" | "error";
export type ArticleAiBatchOutcome = { severity: ArticleAiBatchSeverity; message: string };

const plural = (count: number, singular: string, many: string) => (count === 1 ? singular : many);

/**
 * Fecha o lote da IA separando três dimensões que antes eram uma só:
 * execução (chegou ao provider e voltou válida), decisão humana (propostas
 * pendentes) e registro canônico (durabilidade). Só a primeira decide se o
 * Article foi concluído; a terceira nunca deixa o lote virar SUCCESS silencioso.
 */
export function describeArticleAiBatchOutcome(input: {
  summary: ArticleAiBatchSummary;
  materialProposalCount: number;
  registrationFailureCount?: number;
}): ArticleAiBatchOutcome {
  const { requestedArticles, completedArticles, failedArticles } = input.summary;
  const registrationFailures = input.registrationFailureCount || 0;
  const proposals = input.materialProposalCount;

  const proposalClause = proposals
    ? `${proposals} ${plural(proposals, "proposta", "propostas")} de arquitetura ${plural(proposals, "pronta", "prontas")} para revisão humana.`
    : "Nenhuma alteração estrutural foi recomendada.";
  // A IA propõe; aplicar continua sendo decisão humana explícita.
  const untouched = "Nada foi alterado.";
  const registrationClause = registrationFailures
    ? ` ${registrationFailures} ${plural(registrationFailures, "artigo revisado não teve", "artigos revisados não tiveram")} o registro canônico confirmado; o resultado pode não sobreviver ao F5.`
    : "";

  if (!requestedArticles || (completedArticles === 0 && failedArticles > 0)) {
    return {
      severity: "error",
      message: `IA não concluída: 0 de ${requestedArticles} ${plural(requestedArticles, "artigo revisado", "artigos revisados")}. ${failedArticles} ${plural(failedArticles, "artigo com erro", "artigos com erro")}.`,
    };
  }
  if (completedArticles < requestedArticles) {
    return {
      severity: "warning",
      message: `IA · Parcial ${completedArticles}/${requestedArticles} ${plural(requestedArticles, "artigo", "artigos")}. ${proposalClause} ${failedArticles} ${plural(failedArticles, "artigo com erro", "artigos com erro")}. ${untouched}${registrationClause}`,
    };
  }
  return {
    severity: registrationFailures ? "warning" : "success",
    message: `IA concluída: ${completedArticles} de ${requestedArticles} ${plural(requestedArticles, "artigo revisado", "artigos revisados")}. ${proposalClause} ${untouched}${registrationClause}`,
  };
}
