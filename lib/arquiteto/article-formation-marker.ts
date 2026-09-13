import { z } from "zod";

/**
 * MARCADOR DO CENÁRIO DE FORMAÇÃO DE ARTIGOS.
 *
 * Os candidatos — agrupamento, principal, papéis, pontuações, slug sugerido —
 * são reconstruídos deterministicamente do read-model a cada boot. O que NÃO é
 * reconstruível é o fato humano:
 *
 *     "este lote foi processado"
 *     "esta formação foi confirmada"
 *
 * Só isso é persistido. Guardar uma cópia dos candidatos criaria uma segunda
 * autoridade capaz de divergir da formação vigente, sem regra de desempate.
 *
 * Confirmar formação NÃO cria ArticleDNA: o marcador registra que a revisão
 * humana aconteceu, e a materialização continua sendo ação explícita depois.
 *
 * Mesmo caminho de `architecture_analysis`: um item de
 * `editorial_workflow_items`, sem DDL, sem artifact_type novo, sem tocar RLS.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const ARTICLE_FORMATION_MARKER_SUBJECT_TYPE = "article_formation_analysis" as const;
export const ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE = "architect" as const;
export const ARTICLE_FORMATION_MARKER_CONTRACT_VERSION = "article-formation-marker-v1" as const;
/** Um cenário vigente por marca; a UNIQUE da tabela garante isso. */
export const ARTICLE_FORMATION_MARKER_SUBJECT_ID = "current" as const;

export const ArticleFormationConfirmationStatusSchema = z.enum(["none", "confirmed", "partial", "refused"]);
export type ArticleFormationConfirmationStatus = z.infer<typeof ArticleFormationConfirmationStatusSchema>;

export const ArticleFormationMarkerPayloadSchema = z.object({
  contractVersion: z.literal(ARTICLE_FORMATION_MARKER_CONTRACT_VERSION),
  /** Cenário processado. Muda quando entram keywords, Silos ou páginas. */
  baseHash: z.string().min(1),
  processedAt: z.string().min(1),
  confirmation: z.object({
    status: ArticleFormationConfirmationStatusSchema,
    confirmedAt: z.string().nullable(),
    /** Candidatos que a pessoa aceitou como formação válida. */
    confirmedArticleCount: z.number().int().nonnegative(),
    /** Keywords cobertas por esses candidatos. */
    coveredKeywordCount: z.number().int().nonnegative(),
    /** Silos que ficaram de fora por bloqueio próprio — pendentes, não erro. */
    pendingSiloCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
  }).strict(),
  /**
   * §4 — AS FORMAÇÕES CONGELADAS, UMA A UMA.
   *
   * O ciclo que isto desfaz: `Concluir formação` exigia SiloDNA canônico, e o
   * SiloDNA canônico só nasce depois das formações estabilizadas. Um esperava
   * o outro para sempre.
   *
   * A saída não é inventar um SiloDNA provisório nem gravar ArticleDNA com
   * referência falsa. É separar os dois fatos: a formação FECHA agora — com
   * Principal, membros, papéis e a composição que a SERP observou — e a
   * materialização acontece contra o Silo canônico quando ele existir.
   *
   * Aqui é a única coisa não reconstruível: quais candidatos o humano fechou.
   * A composição vai junto porque ela é o QUE foi fechado; recalculá-la depois
   * do Silo consolidar poderia devolver outra coisa, e aí o que a pessoa
   * aprovou não seria o que foi gravado.
   *
   * Aditivo num payload jsonb que já existe: nenhuma coluna, nenhuma migration.
   */
  concludedFormations: z.array(z.object({
    candidateRef: z.string().min(1),
    territoryRef: z.string().min(1),
    principalKeywordId: z.string().min(1),
    members: z.array(z.object({
      keywordId: z.string().min(1),
      role: z.enum(["principal", "secundaria", "reforco"]),
    })).min(1),
    /** A composição que a evidência observou; muda, a conclusão envelhece. */
    formationBaseHash: z.string().min(1),
    /**
     * §4 — O ENDEREÇO TAMBÉM É PARTE DO QUE FOI FECHADO.
     *
     * A materialização acontece depois, no fechamento do Silo, e pode alcançar
     * formações de execuções anteriores que não estão mais no plano em
     * memória. Sem o slug congelado aqui, o único jeito de materializá-las
     * seria recalcular o endereço — e recalcular é exatamente o que o §4
     * proíbe: o validador já aprovou este, e é este que vai para o acervo.
     *
     * Nulo nos marcadores gravados antes deste corte; o fechamento recorre ao
     * cenário vigente nesse caso, dizendo que o fez.
     */
    slug: z.string().min(1).nullable().default(null),
    fullPath: z.string().min(1).nullable().default(null),
    concludedAt: z.string().min(1),
    concludedBy: z.string().min(1),
    /**
     * O ArticleDNA já materializado contra o Silo canônico.
     *
     * `null` é o estado normal enquanto o Silo não consolidou — não é falha.
     */
    materializedArticleId: z.string().min(1).nullable(),
  }).strict()).default([]),
}).strict();
export type ArticleFormationMarkerPayload = z.infer<typeof ArticleFormationMarkerPayloadSchema>;
/**
 * O que o CHAMADOR precisa passar.
 *
 * `concludedFormations` tem default no schema: um marcador anterior ao corte
 * do ciclo continua valido sem o campo, e quem grava so o informa quando tem
 * formacao a congelar. Tipar a escrita pela saida obrigaria todo call site a
 * repetir uma lista vazia.
 */
export type ArticleFormationMarkerInput = z.input<typeof ArticleFormationMarkerPayloadSchema>;

export function articleFormationMarkerState(payload: ArticleFormationMarkerPayload): string {
  return payload.confirmation.status === "none" ? "processed" : payload.confirmation.status;
}

/**
 * O cenário gravado ainda descreve o lote de agora?
 *
 * `stale` não apaga: o marcador continua legível e diz o que foi confirmado
 * antes da mudança.
 */
export function articleFormationMarkerIsStale(input: {
  storedBaseHash: string;
  currentBaseHash: string;
}): boolean {
  return input.storedBaseHash !== input.currentBaseHash;
}

export type ArticleFormationScenarioState =
  | "not_processed"
  | "processed"
  | "confirmed"
  | "partially_confirmed"
  | "stale";

export function resolveArticleFormationScenarioState(input: {
  marker: ArticleFormationMarkerPayload | null;
  currentBaseHash: string;
}): ArticleFormationScenarioState {
  if (!input.marker) return "not_processed";
  if (articleFormationMarkerIsStale({ storedBaseHash: input.marker.baseHash, currentBaseHash: input.currentBaseHash })) {
    return "stale";
  }
  if (input.marker.confirmation.status === "confirmed") return "confirmed";
  if (input.marker.confirmation.status === "partial") return "partially_confirmed";
  return "processed";
}

export const ARTICLE_FORMATION_SCENARIO_LABELS: Record<ArticleFormationScenarioState, string> = {
  not_processed: "Não processada",
  processed: "Processada",
  confirmed: "Confirmada",
  partially_confirmed: "Parcialmente confirmada",
  stale: "Desatualizada",
};

export type ArticleFormationMarkerRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

export function buildArticleFormationMarkerRow(payload: ArticleFormationMarkerPayload): ArticleFormationMarkerRowInput {
  const parsed = ArticleFormationMarkerPayloadSchema.parse(payload);
  return {
    subjectType: ARTICLE_FORMATION_MARKER_SUBJECT_TYPE,
    subjectId: ARTICLE_FORMATION_MARKER_SUBJECT_ID,
    stage: ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE,
    state: articleFormationMarkerState(parsed),
    sourceEntityId: parsed.baseHash,
    // O cenário do lote não pertence a um Article — e confirmar formação não
    // materializa nenhum. Amarrar a linha a um articleId inventaria a
    // entidade que este corte justamente adia.
    articleId: null,
    payload: parsed,
  };
}

export type ArticleFormationMarkerIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "PAYLOAD_INVALID"
  | "STATE_DOES_NOT_MATCH_PAYLOAD"
  | "ARTICLE_ID_PRESENT";

export type ArticleFormationMarkerReadResult =
  | { ok: true; payload: ArticleFormationMarkerPayload; issues: [] }
  | { ok: false; payload: null; issues: ArticleFormationMarkerIssue[] };

export function parseArticleFormationMarkerRow(row: ArticleFormationMarkerRowInput): ArticleFormationMarkerReadResult {
  const issues: ArticleFormationMarkerIssue[] = [];
  if (row.subjectType !== ARTICLE_FORMATION_MARKER_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (row.articleId) issues.push("ARTICLE_ID_PRESENT");

  const parsed = ArticleFormationMarkerPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, payload: null, issues };
  }
  if (row.state !== articleFormationMarkerState(parsed.data)) issues.push("STATE_DOES_NOT_MATCH_PAYLOAD");

  return issues.length ? { ok: false, payload: null, issues } : { ok: true, payload: parsed.data, issues: [] };
}
