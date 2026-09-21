/**
 * O QUE A SERP DIZ SOBRE UM GRUPO JÁ PUBLICADO.
 *
 * Uma leitura só, para uma pergunta só: dado o que o Google devolveu para cada
 * keyword do grupo, nas lentes coletadas, quais secundárias reforçam a página
 * e alguma delas deveria substituir a primária.
 *
 * Aqui não se coleta nada e não se decide nada. As observações já vieram
 * gravadas; a saída é evidência traduzida e proposta pendente. Trocar a
 * primária de uma página no ar continua sendo ato humano.
 *
 * Por que um módulo só: a afinidade, o reforço e a substituição respondem à
 * MESMA pergunta — "este grupo se sustenta junto?" — e três leituras separadas
 * do mesmo conjunto de observações é exatamente como duas telas passam a
 * discordar sobre a mesma página.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import {
  measureKeywordAffinity,
  aggregateUniverseCoverage,
  type AffinityThresholds,
  type KeywordAffinity,
} from "./serp-competitive-evidence.ts";
import type { SerpCompetitiveObservation } from "./silo-primary-keyword.ts";
import {
  proposePrimarySubstitution,
  planPublishedReinforcement,
  type PublishedPrimary,
  type SubstitutionChallenger,
  type SubstitutionThresholds,
  type PrimarySubstitutionProposal,
  type ReinforcementPlan,
} from "./primary-substitution.ts";

export type PublishedGroupSecondary = {
  keywordId: string;
  keywordDnaId: string | null;
  keyword: string;
  /** Volume do KeywordDNA. `null` quando o acervo não mediu. */
  volumeSearch: number | null;
};

export type PublishedKeywordReadout = {
  /** A afinidade de cada secundária com a primária, medida na SERP. */
  affinities: Array<{ keywordId: string; keyword: string; affinity: KeywordAffinity }>;
  reinforcement: ReinforcementPlan;
  substitution: PrimarySubstitutionProposal;
  /** As lentes que produziram esta leitura. Vazio = nada coletado. */
  lenses: string[];
  /** Perguntas e formatos que o universo exige, segundo a própria SERP. */
  coverage: ReturnType<typeof aggregateUniverseCoverage>;
  /** O estado da leitura em uma frase, para a mesa. */
  note: string;
};

/**
 * Lê o grupo publicado à luz da SERP coletada.
 *
 * Sem observação da primária não há leitura: comparar as secundárias entre si
 * responderia outra pergunta. Isso é dito em vez de virar uma leitura vazia
 * que parece conclusiva.
 */
export function readPublishedGroupFromSerp(input: {
  primary: PublishedPrimary;
  secondaries: readonly PublishedGroupSecondary[];
  observations: readonly SerpCompetitiveObservation[];
  /** Quantas keywords o artigo já usa, para o teto do reforço. */
  currentKeywordCount: number;
  affinityThresholds?: AffinityThresholds;
  substitutionThresholds?: SubstitutionThresholds;
}): PublishedKeywordReadout {
  const porKeyword = new Map<string, SerpCompetitiveObservation[]>();
  for (const observation of input.observations) {
    porKeyword.set(observation.keywordId, [...(porKeyword.get(observation.keywordId) || []), observation]);
  }

  const daPrimaria = porKeyword.get(input.primary.keywordId) || [];
  const lenses = [...new Set(input.observations.map(item => item.lens))];
  const coverage = aggregateUniverseCoverage(input.observations);

  const affinities = input.secondaries.map(secundaria => ({
    keywordId: secundaria.keywordId,
    keyword: secundaria.keyword,
    affinity: measureKeywordAffinity({
      left: daPrimaria,
      right: porKeyword.get(secundaria.keywordId) || [],
      thresholds: input.affinityThresholds,
    }),
  }));

  /*
   * Cada secundária vira desafiante com a evidência DELA — nunca com a do
   * grupo. Uma frase de afinidade emprestada de outra keyword faria a recusa
   * citar um número que não é sobre ela.
   */
  const desafiantes: SubstitutionChallenger[] = input.secondaries.map(secundaria => {
    const medida = affinities.find(item => item.keywordId === secundaria.keywordId)?.affinity;
    return {
      keywordId: secundaria.keywordId,
      keywordDnaId: secundaria.keywordDnaId,
      keyword: secundaria.keyword,
      volumeSearch: secundaria.volumeSearch,
      serpSupportsSameUniverse: Boolean(medida?.supportsGrouping),
      serpNote: medida?.reason,
    };
  });

  const semPrimaria = !daPrimaria.length;

  return {
    affinities,
    reinforcement: planPublishedReinforcement({
      currentKeywordCount: input.currentKeywordCount,
      // Sem SERP da primária ninguém entra: o reforço passaria a ser palpite.
      secondaries: semPrimaria ? [] : desafiantes,
    }),
    substitution: semPrimaria
      ? {
        state: "NONE",
        candidates: [],
        decision: null,
        blockers: ["NO_SERP_FOR_CURRENT_PRIMARY"],
        note: `Sem SERP coletada para a primária "${input.primary.keyword}": não há com o que comparar as secundárias.`,
      }
      : proposePrimarySubstitution({
        current: input.primary,
        challengers: desafiantes,
        thresholds: input.substitutionThresholds,
      }),
    lenses,
    coverage,
    note: semPrimaria
      ? `Colete a SERP de "${input.primary.keyword}" para esta leitura fazer sentido.`
      : `${lenses.length} lente(s) lidas para ${porKeyword.size} keyword(s) do grupo publicado.`,
  };
}
