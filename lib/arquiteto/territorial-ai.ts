/**
 * IA da etapa Silos — proposta arquitetural, nunca decisão.
 *
 * Caminho territorial PRÓPRIO. O `SiloReviewProposal` legado analisa working
 * copies formadas a partir de ArticleDNA: outro estágio do pipeline. Fabricar
 * ArticleDNA falso para caber ali produziria uma proposta sobre um objeto que
 * não existe.
 *
 * Três limites duros, verificados por teste:
 *   1. A IA NÃO emite identidade (`territoryRef`, `siloId`, `siloPageId`,
 *      `articleId`) — ela referencia o que já existe.
 *   2. A IA NÃO move keyword, não confirma silo e não escreve nada.
 *   3. Identidade publicada é CONTEXTO. Arquitetura publicada ruim vira
 *      restrição a acomodar, não proposta de trocar URL.
 *
 * Domínio puro: sem provider, sem fetch, sem storage, sem UI.
 */

import { z } from "zod";

export const TerritorialAiRecommendationSchema = z.enum([
  "maintain",
  "use_existing_silo",
  "create_new_silo",
  "merge",
  "split",
  "move_keywords",
  "change_head",
  "update_context",
  "reject_shallow_hypothesis",
  "no_op",
]);
export type TerritorialAiRecommendation = z.infer<typeof TerritorialAiRecommendationSchema>;

/**
 * Como a arquitetura publicada é tratada quando a IA a considera ruim.
 *
 * Nunca "trocar a URL": o patrimônio publicado é restrição herdada, e o que se
 * adapta é o conteúdo novo.
 */
export const TerritorialAiLegacyStanceSchema = z.enum(["none", "legacy_constraint", "adapt_new_content"]);

/**
 * Lista de texto tolerante à FORMA, não ao conteúdo.
 *
 * Modelos alternam entre devolver "uma frase" e ["uma frase"] no mesmo campo.
 * Recusar por isso descartaria análise boa por causa de formatação; aceitar
 * qualquer coisa esconderia erro real. Aqui só a forma é normalizada.
 */
const stringList = z.preprocess(
  value => (typeof value === "string" ? (value.trim() ? [value] : []) : value),
  z.array(z.string()),
);

export const TerritorialAiProposalSchema = z.object({
  questionId: z.string().min(1),
  recommendation: TerritorialAiRecommendationSchema,
  /** Silos/estruturas citados. Validados contra o snapshot de entrada. */
  targetRefs: stringList.default([]),
  /** Keywords citadas. Também validadas contra a entrada. */
  keywordRefs: stringList.default([]),
  reason: z.string().min(1),
  supportingEvidence: stringList.default([]),
  conflicts: stringList.default([]),
  limitations: stringList.default([]),
  /** Postura diante de identidade publicada protegida. */
  legacyStance: TerritorialAiLegacyStanceSchema.default("none"),
}).strict();
export type TerritorialAiProposal = z.infer<typeof TerritorialAiProposalSchema>;

/** O que a IA devolve; a rota valida refs antes de aceitar. */
export const TerritorialAiResponseSchema = z.object({
  proposals: z.array(TerritorialAiProposalSchema).max(10),
  summary: z.string().min(1),
}).strict();

/* --------------------------- pode rodar a IA? ---------------------------- */

export const TerritorialAiAvailabilitySchema = z.enum([
  /** Executável agora. */
  "ready",
  /** A dúvida exige SERP e ela ainda não foi validada. */
  "awaiting_serp",
  /** A SERP existe mas validava outra arquitetura. */
  "serp_stale",
]);
export type TerritorialAiAvailability = z.infer<typeof TerritorialAiAvailabilitySchema>;

const AVAILABILITY_REASONS: Record<TerritorialAiAvailability, string> = {
  ready: "Pronta para revisão com IA.",
  awaiting_serp: "Atualize a validação SERP antes da revisão com IA.",
  serp_stale: "A SERP desta dúvida validava outra arquitetura; revalide antes da IA.",
};

/**
 * Decide, POR PERGUNTA, se a IA pode rodar.
 *
 * Quando a dúvida pede SERP, a IA só usa evidência vigente — parecer ausente ou
 * desatualizado bloqueia com motivo funcional. Quando o motor `evidence-on-
 * demand` concluiu que aquela decisão NÃO precisa de SERP, a IA roda sem ela:
 * consultar o provider só para destravar a IA seria gasto sem pergunta.
 */
export function territorialAiAvailabilityOf(input: {
  questionId: string;
  /** A dúvida está na lista de perguntas que merecem SERP? */
  serpRequired: boolean;
  /** Parecer vigente da MESMA pergunta, se houver. */
  serpAssessmentBaseHash: string | null;
  /** Hash da arquitetura de agora para a mesma pergunta. */
  currentSerpBaseHash: string | null;
}): { availability: TerritorialAiAvailability; reason: string } {
  if (!input.serpRequired) return { availability: "ready", reason: AVAILABILITY_REASONS.ready };
  if (!input.serpAssessmentBaseHash) return { availability: "awaiting_serp", reason: AVAILABILITY_REASONS.awaiting_serp };
  if (input.currentSerpBaseHash && input.serpAssessmentBaseHash !== input.currentSerpBaseHash) {
    return { availability: "serp_stale", reason: AVAILABILITY_REASONS.serp_stale };
  }
  return { availability: "ready", reason: AVAILABILITY_REASONS.ready };
}

/* ------------------------- refs inventadas não passam --------------------- */

export type TerritorialAiRefIssue = {
  code: "UNKNOWN_TARGET_REF" | "UNKNOWN_KEYWORD_REF" | "QUESTION_MISMATCH" | "IDENTITY_EMITTED";
  detail: string;
};

/** Formatos de identidade que SÓ o servidor emite; a IA nunca os cria. */
const EMITTED_IDENTITY = /^(territory|silo|silo-page|article):/i;

/**
 * Recusa proposta que cita o que não existe no snapshot enviado.
 *
 * Um `targetRef` inventado viraria decisão sobre um objeto imaginário. E uma
 * identidade nova saída da IA seria autoridade que ela não tem.
 */
export function validateTerritorialAiProposal(input: {
  proposal: TerritorialAiProposal;
  questionId: string;
  knownTargetRefs: ReadonlySet<string>;
  knownKeywordIds: ReadonlySet<string>;
}): TerritorialAiRefIssue[] {
  const issues: TerritorialAiRefIssue[] = [];
  if (input.proposal.questionId !== input.questionId) {
    issues.push({ code: "QUESTION_MISMATCH", detail: `A proposta responde a ${input.proposal.questionId}, não a ${input.questionId}.` });
  }
  for (const ref of input.proposal.targetRefs) {
    if (input.knownTargetRefs.has(ref)) continue;
    // Ref desconhecida que PARECE identidade emitida é o caso grave: a IA
    // tentou criar entidade em vez de citar uma.
    issues.push(EMITTED_IDENTITY.test(ref)
      ? { code: "IDENTITY_EMITTED", detail: `A IA não pode emitir identidade: ${ref}.` }
      : { code: "UNKNOWN_TARGET_REF", detail: `Alvo fora do universo enviado: ${ref}.` });
  }
  for (const keywordId of input.proposal.keywordRefs) {
    if (!input.knownKeywordIds.has(keywordId)) {
      issues.push({ code: "UNKNOWN_KEYWORD_REF", detail: `Keyword fora do universo enviado: ${keywordId}.` });
    }
  }
  return issues;
}

/**
 * Remove das propostas o que não sobrevive à validação de refs.
 *
 * Descartar a proposta inteira por causa de uma ref inventada seria perder
 * análise boa; manter a ref seria aceitar objeto imaginário. Aqui a proposta
 * some e o motivo fica registrado.
 */
export function keepValidTerritorialAiProposals(input: {
  proposals: readonly TerritorialAiProposal[];
  questionId: string;
  knownTargetRefs: ReadonlySet<string>;
  knownKeywordIds: ReadonlySet<string>;
}): { accepted: TerritorialAiProposal[]; rejected: { proposal: TerritorialAiProposal; issues: TerritorialAiRefIssue[] }[] } {
  const accepted: TerritorialAiProposal[] = [];
  const rejected: { proposal: TerritorialAiProposal; issues: TerritorialAiRefIssue[] }[] = [];
  for (const proposal of input.proposals) {
    const issues = validateTerritorialAiProposal({ ...input, proposal });
    if (issues.length) rejected.push({ proposal, issues });
    else accepted.push(proposal);
  }
  return { accepted, rejected };
}

/**
 * `no_op` é resultado VÁLIDO: a arquitetura está coerente e nada muda.
 *
 * Transformar isso em erro ou em pendência humana artificial inventaria
 * trabalho que a análise concluiu não existir.
 */
export function isNoOpProposal(proposal: TerritorialAiProposal): boolean {
  return proposal.recommendation === "no_op" || proposal.recommendation === "maintain";
}
