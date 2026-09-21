import { z } from "zod";

/**
 * REGISTRO CANÔNICO REMOTO DA SERP POR KEYWORD.
 *
 * A SERP da etapa Silos sempre consultou o TEXTO do `centralEntity` sob um
 * pseudo-id `territory:<ref>`, no máximo duas consultas por pergunta, e a rota
 * descartava os snapshots crus — só o parecer era persistido. Por isso as
 * candidatas nunca foram comparadas entre si: o dado para compará-las não
 * existia naquele momento.
 *
 * Este registro é o que faltava. Ele guarda a OBSERVAÇÃO COMPETITIVA de cada
 * keyword em cada lente (dispositivo + sistema) — domínios do universo,
 * perguntas do PAA, formatos entregues — que é exatamente o insumo da eleição
 * por SERP e da proposta de reforço das páginas publicadas.
 *
 * Mesmo caminho já provado por `territorial-serp-record`: um item de
 * `editorial_workflow_items` com `subject_type` próprio. NENHUMA migration,
 * nenhum artifact_type novo, nenhuma mudança de RLS.
 *
 * O snapshot INTEIRO não é guardado de propósito: ele é grande, tem URL, título
 * e trecho de terceiros, e nada disso participa da decisão. O que decide é o
 * conjunto de domínios e de blocos — e é só isso que fica.
 *
 * Domínio puro: sem storage, sem fetch. Este módulo só define o contrato.
 */

export const KEYWORD_SERP_SUBJECT_TYPE = "keyword_serp_observations" as const;
export const KEYWORD_SERP_WORKFLOW_STAGE = "architect" as const;
export const KEYWORD_SERP_CONTRACT_VERSION = "keyword-serp-record-v1" as const;

export const SerpLensSchema = z.object({
  device: z.enum(["desktop", "mobile"]),
  operatingSystem: z.enum(["windows", "macos", "android", "ios"]).nullable(),
}).strict();
export type SerpLens = z.infer<typeof SerpLensSchema>;

/**
 * As quatro lentes que o produto pediu.
 *
 * Elas não são variações cosméticas: o Google entrega universos diferentes por
 * dispositivo, e é essa diferença que a medição de divergência lê. Coletar só
 * o desktop faria toda keyword parecer ter um universo só.
 */
export const DEFAULT_SERP_LENSES: SerpLens[] = [
  { device: "desktop", operatingSystem: "windows" },
  { device: "desktop", operatingSystem: "macos" },
  { device: "mobile", operatingSystem: "android" },
  { device: "mobile", operatingSystem: "ios" },
];


export const SerpCompetitiveObservationSchema = z.object({
  keywordId: z.string().min(1),
  lens: z.string().min(1),
  competitorDomains: z.array(z.string().min(1)),
  organicCount: z.number().int().nonnegative(),
  itemTypes: z.array(z.string().min(1)),
  questions: z.array(z.string().min(1)),
  commercialSignals: z.boolean(),
}).strict();

export const KeywordSerpPayloadSchema = z.object({
  contractVersion: z.literal(KEYWORD_SERP_CONTRACT_VERSION),
  /** O grupo observado: território, artigo publicado ou lote avulso. */
  scopeId: z.string().min(1),
  territoryRef: z.string().min(1).nullable(),
  /** As keywords consultadas, em ordem estável. */
  keywordIds: z.array(z.string().min(1)).min(1),
  lenses: z.array(SerpLensSchema).min(1),
  observations: z.array(SerpCompetitiveObservationSchema),
  /** Lentes ou keywords que o provider não devolveu, declaradas. */
  gaps: z.array(z.object({
    keywordId: z.string().min(1),
    lens: z.string().min(1),
    reason: z.string().min(1),
  }).strict()),
  provenance: z.object({
    operationRequestId: z.string().min(1),
    collectedAt: z.string().min(1),
  }).strict(),
}).strict();
export type KeywordSerpPayload = z.infer<typeof KeywordSerpPayloadSchema>;

/**
 * Estado da linha: projeção da cobertura, para o índice remoto.
 *
 * `complete` só quando toda keyword tem toda lente. Parcial é dito como
 * parcial — uma coleta com buraco que se anuncia completa faria a eleição
 * parecer decidida sobre evidência que não foi observada.
 */
export function keywordSerpWorkflowState(payload: Pick<KeywordSerpPayload, "observations" | "keywordIds" | "lenses" | "gaps">): string {
  if (!payload.observations.length) return "empty";
  const esperadas = payload.keywordIds.length * payload.lenses.length;
  return payload.gaps.length || payload.observations.length < esperadas ? "partial" : "complete";
}

export type KeywordSerpRecordIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"
  | "STATE_DOES_NOT_MATCH_COVERAGE"
  | "PAYLOAD_INVALID"
  | "ARTICLE_ID_PRESENT";

export type KeywordSerpRecordReadResult =
  | { ok: true; payload: KeywordSerpPayload; issues: [] }
  | { ok: false; payload: null; issues: KeywordSerpRecordIssue[] };

export type KeywordSerpRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

/** Monta a linha remota. `subject_id` É o `scopeId`. */
export function buildKeywordSerpWorkflowRow(input: {
  payload: Omit<KeywordSerpPayload, "contractVersion">;
}): KeywordSerpRowInput {
  const payload = KeywordSerpPayloadSchema.parse({
    contractVersion: KEYWORD_SERP_CONTRACT_VERSION,
    ...input.payload,
  });
  return {
    subjectType: KEYWORD_SERP_SUBJECT_TYPE,
    subjectId: payload.scopeId,
    stage: KEYWORD_SERP_WORKFLOW_STAGE,
    state: keywordSerpWorkflowState(payload),
    // A coleta é a origem de si mesma; não há artefato anterior a citar.
    sourceEntityId: payload.scopeId,
    // Observação de universo NÃO pertence a um Article.
    articleId: null,
    payload,
  };
}

/** Lê a linha remota recusando incoerência em vez de reconciliar em silêncio. */
export function parseKeywordSerpWorkflowRow(row: KeywordSerpRowInput): KeywordSerpRecordReadResult {
  const issues: KeywordSerpRecordIssue[] = [];
  if (row.subjectType !== KEYWORD_SERP_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== KEYWORD_SERP_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (row.articleId) issues.push("ARTICLE_ID_PRESENT");

  const parsed = KeywordSerpPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, payload: null, issues };
  }
  if (parsed.data.scopeId !== row.subjectId) issues.push("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD");
  if (row.state !== keywordSerpWorkflowState(parsed.data)) issues.push("STATE_DOES_NOT_MATCH_COVERAGE");

  return issues.length ? { ok: false, payload: null, issues } : { ok: true, payload: parsed.data, issues: [] };
}
