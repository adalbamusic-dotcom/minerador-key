import { articleSerpLensesComplete, resolveArticleFormationSerpState, type ArticleSerpGateState } from "./article-serp-gate.ts";
import { serpAssessmentComposition, serpCompositionMismatch, type SerpArticleRole } from "./published-formation-serp.ts";

/**
 * A SERP QUE VALE PARA O RADAR É A DO ARTICLEDNA APROVADO (2026-10-01).
 *
 * O portão do Radar perguntava à mesa: a SERP do candidato da tabela. Quando
 * a tabela tem mudança pendente (keyword acrescentada pelo "Reforçar", troca
 * registrada só na mesa, duas principais), o candidato deixa de ser o artigo
 * aprovado, e o portão recusava um ArticleDNA aprovado com parecer completo
 * nas 4 lentes e aceito pelo dono ("a composição mudou depois desta coleta",
 * "faltam lentes"). O que vai ao Radar é o ArticleDNA aprovado — então a
 * evidência que conta é a dele: o parecer que a aprovação gravou em
 * `serpAssessmentRef`, desde que descreva exatamente a composição do DNA.
 *
 * Devolve `null` quando o DNA não aponta um parecer, o parecer não está no
 * acervo ou descreve outra composição: aí vale o portão da mesa, como antes.
 */
export type ApprovedSerpRecord = {
  candidateRef: string;
  payload: {
    formationBaseHash: string;
    verdict: string;
    assessment: { id: string } & Record<string, unknown>;
    interpretation?: { lenses?: unknown } | null;
    humanResolution?: { formationBaseHash: string } | null;
  };
};

export function resolveApprovedArticleSerpGate(input: {
  articleId: string;
  dna: {
    serpAssessmentRef?: { versionId: string } | null;
    principalKeywordId: string;
    keywordReferences: readonly { keywordId: string; role: string }[];
  };
  records: readonly ApprovedSerpRecord[];
}): ArticleSerpGateState | null {
  const alvo = input.dna.serpAssessmentRef?.versionId;
  if (!alvo) return null;
  const registro = input.records.find(item => `${item.payload.assessment.id}:${item.payload.formationBaseHash}` === alvo);
  if (!registro) return null;
  const lentes = (registro.payload.interpretation as { lenses?: { requested: string[]; observed: string[]; missing: unknown[] } } | null | undefined)?.lenses;
  const ids = input.dna.keywordReferences.map(reference => String(reference.keywordId));
  const papeis: Record<string, SerpArticleRole> = Object.fromEntries(input.dna.keywordReferences.map(reference => [
    String(reference.keywordId),
    reference.keywordId === input.dna.principalKeywordId ? "principal" : reference.role === "reforco_narrativo" ? "reforco_narrativo" : "secundaria",
  ]));
  const divergencia = serpCompositionMismatch(serpAssessmentComposition(registro.payload.assessment, lentes), {
    keywordIds: ids,
    principalKeywordId: input.dna.principalKeywordId,
    roles: papeis,
  });
  if (divergencia) return null;
  return resolveArticleFormationSerpState({
    candidateRef: input.articleId,
    expectedBaseHash: registro.payload.formationBaseHash,
    observed: {
      formationBaseHash: registro.payload.formationBaseHash,
      verdict: registro.payload.verdict as never,
      lensesComplete: articleSerpLensesComplete(lentes),
      humanDecisionBaseHash: registro.payload.humanResolution?.formationBaseHash ?? null,
    },
  });
}
