/**
 * A INVESTIGAÇÃO PROFUNDA — começa e termina por decisão humana.
 *
 * Duas regras que este módulo existe para garantir:
 *
 *   1. NADA começa sozinho. Abrir o artigo não coleta, não consulta provider,
 *      não analisa. A pesquisa só arranca em `Iniciar pesquisa profunda`.
 *   2. NADA termina sozinho. O automático executa as etapas mecânicas, mas quem
 *      declara a investigação encerrada é uma pessoa, em `Finalizar
 *      investigação` — depois de revisar.
 *
 * E uma terceira, que protege o resultado: a investigação CONGELA o fundamento
 * que a originou. Se o ArticleDNA, as keywords, o Silo, a SERP de formação ou o
 * grafo mudarem depois, a investigação anterior fica `STALE` — nunca é
 * atualizada em silêncio, nunca é descartada em silêncio.
 *
 * Cada consulta planejada carrega o que aconteceu com ela: `EXECUTED`,
 * `NOT_EXECUTED` ou `REUSED_FORMATION_EVIDENCE`, sempre com motivo legível. Uma
 * consulta que não rodou não desaparece do registro.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarCompetitorUniverse } from "./competitor-universe.ts";
import type { RadarQueryDisposition, RadarResearchQueryPlan } from "./research-query-plan.ts";
import type { RadarInvestigationSufficiency } from "./investigation-sufficiency.ts";
import { RadarResearchCurationSchema } from "./research-curation.ts";
import { RADAR_DEFAULT_SEARCH_MODE, RadarPrimarySearchModeSchema, type RadarPrimarySearchMode } from "./search-mode.ts";

/* ------------------------------ a impressão ----------------------------- */

export const RadarResearchFingerprintSchema = z.object({
  articleDnaVersionId: z.string().min(1),
  articleDnaContentHash: z.string().nullable(),
  keywordRefs: z.array(z.object({
    keywordId: z.string().min(1),
    keywordDnaVersionId: z.string().nullable(),
    semanticQualificationVersionId: z.string().nullable(),
  }).strict()),
  siloDnaVersionId: z.string().nullable(),
  siloPageId: z.string().nullable(),
  formationAssessmentId: z.string().nullable(),
  formationBaseHash: z.string().nullable(),
  internalLinkGraphVersionId: z.string().nullable(),
  /** A string determinística que compara duas investigações. */
  value: z.string().min(1),
}).strict();

export type RadarResearchFingerprint = z.infer<typeof RadarResearchFingerprintSchema>;

export function buildRadarResearchFingerprint(context: RadarArticleResearchContext): RadarResearchFingerprint {
  const keywordRefs = context.keywords
    .map(keyword => ({
      keywordId: keyword.identity.keywordId,
      keywordDnaVersionId: keyword.identity.keywordDnaVersionId,
      semanticQualificationVersionId: keyword.strategy.semanticQualification?.versionId || null,
    }))
    .sort((left, right) => left.keywordId.localeCompare(right.keywordId));

  const partes = [
    context.article.articleDnaVersionId,
    context.article.articleDnaContentHash || "",
    ...keywordRefs.map(item => `${item.keywordId}:${item.keywordDnaVersionId || ""}:${item.semanticQualificationVersionId || ""}`),
    context.silo?.siloDnaVersionId || "",
    context.silo?.siloPageId || "",
    context.formationSerp?.assessmentId || "",
    context.formationSerp?.formationBaseHash || "",
    context.internalLinks?.graphVersionId || "",
  ];

  return {
    articleDnaVersionId: context.article.articleDnaVersionId,
    articleDnaContentHash: context.article.articleDnaContentHash,
    keywordRefs,
    siloDnaVersionId: context.silo?.siloDnaVersionId || null,
    siloPageId: context.silo?.siloPageId || null,
    formationAssessmentId: context.formationSerp?.assessmentId || null,
    formationBaseHash: context.formationSerp?.formationBaseHash || null,
    internalLinkGraphVersionId: context.internalLinks?.graphVersionId || null,
    value: partes.join("|"),
  };
}

/** Mudou algum fundamento desde a investigação? Então ela não descreve o agora. */
export const radarResearchIsStale = (
  saved: { value: string } | null | undefined,
  current: { value: string },
) => Boolean(saved && saved.value !== current.value);

/* ------------------------------- o registro ------------------------------ */

const DispositionSchema = z.enum(["EXECUTE", "REUSE_FORMATION_EVIDENCE", "CONTEXT_ONLY", "NOT_EXECUTABLE"]);
/** Trava de compilação: o plano e o registro falam a mesma língua. */
const _dispositionsAlinhadas: z.infer<typeof DispositionSchema> = "EXECUTE" satisfies RadarQueryDisposition;
void _dispositionsAlinhadas;

export const RadarQueryExecutionSchema = z.enum(["PLANNED", "EXECUTED", "NOT_EXECUTED", "REUSED_FORMATION_EVIDENCE"]);
export type RadarQueryExecution = z.infer<typeof RadarQueryExecutionSchema>;

/**
 * DUAS CLASSES DE SERP, E ELAS NÃO SE MISTURAM.
 *
 *   `canonical` — a SERP da principal. É A SERP DO ARTIGO: tem snapshot na
 *     cadeia de versões, revisão e aprovação humana.
 *
 *   `auxiliary` — a SERP de uma secundária ou do reforço. É EVIDÊNCIA DE
 *     PESQUISA: alimenta o universo competitivo, e só. Não vira snapshot do
 *     artigo, não entra na cadeia de versões, não recebe revisão nem aprovação.
 */
export const RadarSerpClassSchema = z.enum(["canonical", "auxiliary"]);
export type RadarSerpClass = z.infer<typeof RadarSerpClassSchema>;

/**
 * O que a consulta observou, guardado na versão da análise.
 *
 * A SERP canônica já vive no snapshot do artigo; aqui fica a referência. A
 * auxiliar não tem outro lugar — sem migração, ela é evidência da investigação,
 * e é aqui que ela persiste, com o que o universo competitivo precisa ler.
 */
export const RadarQueryEvidenceSchema = z.object({
  serpClass: RadarSerpClassSchema,
  snapshotId: z.string().min(1),
  collectedAt: z.string().min(1),
  contentHash: z.string().min(1),
  resultCount: z.number().int().nonnegative(),
  observedIntent: z.string().nullable().default(null),
  results: z.array(z.object({
    position: z.number().int().positive(),
    url: z.string().min(1),
    title: z.string(),
    domain: z.string(),
    inferredType: z.string().nullable().default(null),
  }).strict()).default([]),
}).strict();
export type RadarQueryEvidence = z.infer<typeof RadarQueryEvidenceSchema>;

export const RadarDeepResearchQuerySchema = z.object({
  queryId: z.string().min(1),
  keywordId: z.string().min(1),
  keyword: z.string().nullable(),
  role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  disposition: DispositionSchema,
  execution: RadarQueryExecutionSchema,
  /** Que SERP esta consulta produz, se executada. Decidido pelo papel. */
  serpClass: RadarSerpClassSchema,
  evidence: RadarQueryEvidenceSchema.nullable().default(null),
  reason: z.string(),
}).strict();
export type RadarDeepResearchQuery = z.infer<typeof RadarDeepResearchQuerySchema>;

export const RadarDeepResearchSummarySchema = z.object({
  articleKeywords: z.number().int().nonnegative(),
  queriesPlanned: z.number().int().nonnegative(),
  queriesExecuted: z.number().int().nonnegative(),
  /** Quantas das executadas foram SERPs auxiliares de pesquisa. */
  auxiliaryQueriesExecuted: z.number().int().nonnegative().default(0),
  queriesContextOnly: z.number().int().nonnegative(),
  resultsObserved: z.number().int().nonnegative(),
  uniqueDomains: z.number().int().nonnegative(),
  editorialCompetitors: z.number().int().nonnegative(),
  commercialCompetitors: z.number().int().nonnegative(),
  formatReferences: z.number().int().nonnegative(),
  authoritySources: z.number().int().nonnegative(),
  lateralReferences: z.number().int().nonnegative(),
  pagesAnalyzed: z.number().int().nonnegative(),
  pagesFailed: z.number().int().nonnegative(),
  recurringTopics: z.number().int().nonnegative(),
  relevantGaps: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  relatedInternalPages: z.number().int().nonnegative(),
  externalSourceCandidates: z.number().int().nonnegative(),
  limitations: z.array(z.string()),
}).strict();
export type RadarDeepResearchSummary = z.infer<typeof RadarDeepResearchSummarySchema>;

/**
 * O registro persistido da investigação. Aditivo no payload da análise, com
 * `.default(null)`: versões anteriores continuam legíveis.
 */
export const RadarDeepResearchRecordSchema = z.object({
  startedAt: z.string().min(1),
  startedBy: z.string().min(1),
  /*
   * O MODO DA PESQUISA PRINCIPAL — congelado com a investigação.
   *
   * Web e YouTube respondem perguntas diferentes e produzem benchmarks
   * diferentes. Gravar o modo é o que impede ler um resultado de vídeo com
   * a régua de artigo depois. Aditivo com .
   */
  primarySearchMode: RadarPrimarySearchModeSchema.default("WEB"),
  fingerprint: RadarResearchFingerprintSchema,
  queries: z.array(RadarDeepResearchQuerySchema),
  summary: RadarDeepResearchSummarySchema.nullable().default(null),
  /*
   * A CURADORIA DO UNIVERSO PESQUISÁVEL.
   *
   * Decisão humana sobre as referências que a pesquisa multi-query descobriu —
   * separada da curadoria da SERP canônica, que continua onde sempre esteve.
   * Aditiva com `.default(null)`: item antigo sem ela parseia normalmente.
   */
  researchCuration: RadarResearchCurationSchema.nullable().default(null),
  finalizedAt: z.string().nullable().default(null),
  finalizedBy: z.string().nullable().default(null),
  /** O nível de suficiência com que a pessoa fechou a investigação. */
  conclusion: z.string().nullable().default(null),
}).strict();
export type RadarDeepResearchRecord = z.infer<typeof RadarDeepResearchRecordSchema>;

/* -------------------------------- o início ------------------------------- */

/**
 * O que a coleta consegue fazer.
 *
 * `app/api/editorial/serp` passou a aceitar `collect_auxiliary`: a keyword vai
 * por ID, o texto é resolvido no servidor pela composição do próprio
 * ArticleDNA, e o resultado **não** vira snapshot do artigo. Quando a
 * capacidade estiver desligada, a consulta fica planejada com motivo no
 * registro — nunca some.
 */
export type RadarResearchCapabilities = { perKeywordCollection: boolean };

export const RADAR_DEFAULT_RESEARCH_CAPABILITIES: RadarResearchCapabilities = { perKeywordCollection: true };

const MOTIVO_SEM_COLETA_POR_KEYWORD =
  "A coleta por keyword está indisponível nesta sessão; esta consulta ficou planejada e não executada nesta versão.";

export function startRadarDeepResearch(input: {
  context: RadarArticleResearchContext;
  plan: RadarResearchQueryPlan;
  startedBy: string;
  now?: string;
  capabilities?: RadarResearchCapabilities;
  primarySearchMode?: RadarPrimarySearchMode;
}): RadarDeepResearchRecord {
  const capacidades = input.capabilities || RADAR_DEFAULT_RESEARCH_CAPABILITIES;

  const queries: RadarDeepResearchQuery[] = input.plan.queries.map(candidata => {
    const comum = {
      queryId: candidata.queryId,
      keywordId: candidata.keywordId,
      keyword: candidata.keyword,
      role: candidata.role,
      disposition: candidata.disposition,
      /* O papel decide a classe: só a principal produz a SERP do artigo. */
      serpClass: candidata.role === "principal" ? "canonical" as const : "auxiliary" as const,
      evidence: null,
    };

    if (candidata.disposition === "REUSE_FORMATION_EVIDENCE") {
      return { ...comum, execution: "REUSED_FORMATION_EVIDENCE" as const, reason: candidata.reason };
    }
    if (candidata.disposition !== "EXECUTE") {
      return { ...comum, execution: "NOT_EXECUTED" as const, reason: candidata.reason };
    }
    if (candidata.role !== "principal" && !capacidades.perKeywordCollection) {
      return { ...comum, execution: "NOT_EXECUTED" as const, reason: `${candidata.reason} ${MOTIVO_SEM_COLETA_POR_KEYWORD}`.trim() };
    }
    return { ...comum, execution: "PLANNED" as const, reason: candidata.reason };
  });

  return {
    startedAt: input.now || new Date().toISOString(),
    startedBy: input.startedBy,
    primarySearchMode: input.primarySearchMode || RADAR_DEFAULT_SEARCH_MODE,
    fingerprint: buildRadarResearchFingerprint(input.context),
    queries,
    summary: null,
    researchCuration: null,
    finalizedAt: null,
    finalizedBy: null,
    conclusion: null,
  };
}

/** O que de fato aconteceu com uma consulta, depois que a coleta respondeu. */
export function settleRadarDeepResearchQuery(
  record: RadarDeepResearchRecord,
  queryId: string,
  outcome: { execution: RadarQueryExecution; reason: string; evidence?: RadarQueryEvidence | null },
): RadarDeepResearchRecord {
  return {
    ...record,
    queries: record.queries.map(query => query.queryId === queryId
      ? { ...query, execution: outcome.execution, reason: outcome.reason, evidence: outcome.evidence ?? query.evidence }
      : query),
  };
}

/** Quantos resultados por consulta a investigação guarda como evidência. */
export const RADAR_QUERY_EVIDENCE_LIMIT = 10;

/**
 * A evidência de uma consulta, no formato que o universo competitivo lê.
 *
 * Guarda o essencial — posição, URL, título, domínio e tipo — e nada mais: o
 * registro da investigação não é cópia do snapshot.
 */
export function radarQueryEvidenceFrom(input: {
  serpClass: RadarSerpClass;
  research: {
    id: string;
    collectedAt: string;
    contentHash: string;
    organicResults: ReadonlyArray<{ position: number; url: string; title: string; domain: string; inferredType?: string | null; manualType?: string | null }>;
    diagnostic?: { dominantIntent: string | null };
  };
  limit?: number;
}): RadarQueryEvidence {
  const resultados = [...input.research.organicResults]
    .sort((left, right) => left.position - right.position)
    .slice(0, input.limit || RADAR_QUERY_EVIDENCE_LIMIT);

  return RadarQueryEvidenceSchema.parse({
    serpClass: input.serpClass,
    snapshotId: input.research.id,
    collectedAt: input.research.collectedAt,
    contentHash: input.research.contentHash,
    resultCount: input.research.organicResults.length,
    observedIntent: input.research.diagnostic?.dominantIntent ?? null,
    results: resultados.map(result => ({
      position: result.position,
      url: result.url,
      title: result.title,
      domain: result.domain,
      inferredType: result.manualType || result.inferredType || null,
    })),
  });
}

/* -------------------------------- o estado ------------------------------- */

export type RadarDeepResearchState = "NOT_STARTED" | "RUNNING" | "AWAITING_REVIEW" | "FINALIZED" | "STALE";

export function radarDeepResearchState(input: {
  record: RadarDeepResearchRecord | null;
  currentFingerprint: { value: string } | null;
  running: boolean;
}): RadarDeepResearchState {
  if (!input.record) return "NOT_STARTED";
  if (input.running) return "RUNNING";
  if (input.currentFingerprint && radarResearchIsStale(input.record.fingerprint, input.currentFingerprint)) return "STALE";
  return input.record.finalizedAt ? "FINALIZED" : "AWAITING_REVIEW";
}

export type RadarDeepResearchAction = {
  id: "START_DEEP_RESEARCH" | "FINALIZE_INVESTIGATION" | "RESTART_DEEP_RESEARCH" | "NONE";
  label: string;
  enabled: boolean;
  blockedReason: string | null;
};

export function radarDeepResearchAction(input: {
  state: RadarDeepResearchState;
  contextReady: boolean;
  hasPrimaryQuery: boolean;
  /** Só chega aqui o que a suficiência já disse sobre concluir. */
  canConclude?: boolean;
  concludeBlockedReason?: string | null;
}): RadarDeepResearchAction {
  if (!input.contextReady) {
    return { id: "NONE", label: "Investigação indisponível", enabled: false, blockedReason: "O contexto do artigo ainda não foi resolvido." };
  }
  if (!input.hasPrimaryQuery) {
    return { id: "NONE", label: "Investigação indisponível", enabled: false, blockedReason: "A composição não tem principal com texto resolvido; não há consulta central." };
  }
  if (input.state === "RUNNING") {
    return { id: "NONE", label: "Pesquisando…", enabled: false, blockedReason: null };
  }
  if (input.state === "STALE") {
    return { id: "RESTART_DEEP_RESEARCH", label: "Refazer pesquisa profunda", enabled: true, blockedReason: "O fundamento do artigo mudou depois desta investigação." };
  }
  if (input.state === "AWAITING_REVIEW") {
    return {
      id: "FINALIZE_INVESTIGATION",
      label: "Finalizar investigação",
      enabled: input.canConclude !== false,
      blockedReason: input.canConclude === false ? (input.concludeBlockedReason || "A investigação ainda não tem do que concluir.") : null,
    };
  }
  if (input.state === "FINALIZED") {
    return { id: "NONE", label: "Investigação finalizada", enabled: false, blockedReason: null };
  }
  return { id: "START_DEEP_RESEARCH", label: "Iniciar pesquisa profunda", enabled: true, blockedReason: null };
}

/* ------------------------------- o resumo ------------------------------- */

export function buildRadarDeepResearchSummary(input: {
  context: RadarArticleResearchContext;
  plan: RadarResearchQueryPlan;
  universe: RadarCompetitorUniverse | null;
  record?: RadarDeepResearchRecord | null;
  pagesAnalyzed: number;
  pagesFailed: number;
  recurringTopics: number;
  relevantGaps: number;
  conflicts: number;
  relatedInternalPages: number;
  externalSourceCandidates: number;
  extraLimitations?: readonly string[];
}): RadarDeepResearchSummary {
  const universe = input.universe;
  const contagem = (chave: keyof RadarCompetitorUniverse["byClass"]) => universe?.byClass[chave] || 0;
  const executadas = input.record
    ? input.record.queries.filter(query => query.execution === "EXECUTED")
    : [];
  const total = input.record ? executadas.length : universe?.queriesUsed.length || 0;

  return {
    articleKeywords: input.context.keywords.length,
    queriesPlanned: input.plan.queries.length,
    queriesExecuted: total,
    auxiliaryQueriesExecuted: executadas.filter(query => query.serpClass === "auxiliary").length,
    queriesContextOnly: input.plan.contextOnly.length,
    resultsObserved: universe?.candidates.length || 0,
    uniqueDomains: universe?.uniqueDomains || 0,
    editorialCompetitors: contagem("EDITORIAL_COMPETITOR"),
    commercialCompetitors: contagem("COMMERCIAL_COMPETITOR"),
    formatReferences: contagem("FORMAT_REFERENCE"),
    authoritySources: contagem("AUTHORITY_SOURCE"),
    lateralReferences: contagem("LATERAL_REFERENCE"),
    pagesAnalyzed: input.pagesAnalyzed,
    pagesFailed: input.pagesFailed,
    recurringTopics: input.recurringTopics,
    relevantGaps: input.relevantGaps,
    conflicts: input.conflicts,
    relatedInternalPages: input.relatedInternalPages,
    externalSourceCandidates: input.externalSourceCandidates,
    limitations: [...new Set([
      ...input.context.limitations,
      ...input.plan.limitations,
      ...(universe?.limitations || []),
      ...(input.extraLimitations || []),
    ])],
  };
}

/* ------------------------------ o encerramento --------------------------- */

export type RadarFinalizeResult =
  | { ok: true; record: RadarDeepResearchRecord }
  | { ok: false; reason: string };

/**
 * Encerrar não é aprovar.
 *
 * A aprovação do relatório continua com o portão de `report-approval`. Aqui a
 * pessoa apenas declara que a investigação chegou a uma conclusão — e nem isso
 * é possível quando não há do que concluir.
 *
 * INSUFICIÊNCIA DEIXOU DE SER IMPEDIMENTO ABSOLUTO.
 *
 * Quinze páginas lidas com amostra fraca são uma leitura fraca, não a ausência
 * de leitura: recusar o encerramento obrigava a refazer uma pesquisa que talvez
 * não melhorasse, e deixava a investigação num limbo permanente. Quem decide se
 * vale encerrar assim é o USER — e a insuficiência fica declarada no registro.
 * Quem continua impedindo é o que não tem material nenhum: `BLOCKED`, ou
 * insuficiência sem uma única página analisada.
 */
export function finalizeRadarDeepResearch(input: {
  record: RadarDeepResearchRecord | null;
  currentFingerprint: { value: string } | null;
  sufficiency: Pick<RadarInvestigationSufficiency, "level" | "headline" | "reasons">;
  summary: RadarDeepResearchSummary;
  finalizedBy: string;
  /** Páginas realmente na amostra. Sem elas não há investigação material. */
  analyzed?: number;
  now?: string;
}): RadarFinalizeResult {
  if (!input.record) return { ok: false, reason: "Não existe investigação iniciada para finalizar." };
  if (input.record.finalizedAt) return { ok: false, reason: "Esta investigação já foi finalizada." };
  if (input.currentFingerprint && radarResearchIsStale(input.record.fingerprint, input.currentFingerprint)) {
    return { ok: false, reason: "O fundamento do artigo mudou depois desta investigação; refaça a pesquisa antes de finalizar." };
  }
  if (input.sufficiency.level === "BLOCKED") {
    return { ok: false, reason: `${input.sufficiency.headline}. ${input.sufficiency.reasons[0] || ""}`.trim() };
  }
  const analisadas = input.analyzed ?? input.summary.pagesAnalyzed;
  if (!analisadas) {
    return { ok: false, reason: "Nenhuma página foi analisada: não existe investigação material para finalizar." };
  }

  return {
    ok: true,
    record: {
      ...input.record,
      summary: input.summary,
      finalizedAt: input.now || new Date().toISOString(),
      finalizedBy: input.finalizedBy,
      conclusion: input.sufficiency.level,
    },
  };
}

export const radarQueryExecutionLabel = (execution: RadarQueryExecution) => ({
  PLANNED: "Planejada",
  EXECUTED: "Executada",
  NOT_EXECUTED: "Não executada",
  REUSED_FORMATION_EVIDENCE: "Evidência da formação reaproveitada",
}[execution]);
