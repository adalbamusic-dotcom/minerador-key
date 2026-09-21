/**
 * REFORÇAR O QUE JÁ ESTÁ PUBLICADO — SEM TROCAR NADA SOZINHO.
 *
 * O produto pediu duas coisas para o acervo publicado: reforçar as páginas com
 * keywords secundárias, e trocar a primária quando o volume justificar. A
 * segunda é o ponto delicado: uma página no ar tem URL, canonical e histórico.
 * Trocar a primária dela por conta própria seria reescrever identidade viva a
 * partir de uma medição.
 *
 * Então aqui nada é aplicado. O que sai é PROPOSTA, no vocabulário que o
 * acervo já fala — `PrimaryKeywordCandidate` e `PrimaryKeywordDecision` com
 * `status: "pending"`, os mesmos contratos que `adapters.ts` já emite para
 * principal revisável e que `architecture-confirmation.ts` já sabe confirmar.
 * Nenhum contrato novo: a decisão humana entra pela porta que já existe.
 *
 * As duas exigências para um desafiante, e as duas precisam ser verdadeiras:
 *
 *   SERP     ele disputa o mesmo universo da página. Volume alto em busca
 *            vizinha não é motivo para trocar a identidade de uma página — é
 *            motivo para outro artigo.
 *   VOLUME   ele supera a primária vigente com folga declarada. Empate técnico
 *            não justifica mexer no que está publicado e indexado.
 *
 * Volume ausente de um dos lados não vira zero: sem os dois números não há
 * comparação, e a ausência é dita em vez de virar argumento.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import {
  PrimaryKeywordCandidateSchema,
  PrimaryKeywordDecisionSchema,
  type PrimaryKeywordCandidate,
  type PrimaryKeywordDecision,
  type PrimaryKeywordEffectivePolicy,
  type PrimaryKeywordPolicy,
} from "./contracts.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "./domain-rules.ts";

/* -------------------------------- entrada -------------------------------- */

export type PublishedPrimary = {
  keywordId: string;
  keywordDnaId: string | null;
  keyword: string;
  /** Volume do KeywordDNA. `null` quando o acervo não mediu. */
  volumeSearch: number | null;
  policy: PrimaryKeywordPolicy | PrimaryKeywordEffectivePolicy;
};

export type SubstitutionChallenger = {
  keywordId: string;
  keywordDnaId: string | null;
  keyword: string;
  volumeSearch: number | null;
  /** A SERP sustenta que esta keyword disputa o mesmo universo da página? */
  serpSupportsSameUniverse: boolean;
  /** A frase da evidência de SERP, para o motivo não virar número solto. */
  serpNote?: string;
};

export type SubstitutionThresholds = {
  /**
   * Quanto o volume do desafiante precisa superar o da primária vigente.
   *
   * 1,5 não vem de teoria: é a folga mínima para que a diferença não seja
   * ruído de estimativa do provedor. Fica nomeado aqui para ser calibrado
   * contra a homologação em vez de virar número mágico espalhado pelo motor.
   */
  minVolumeRatio: number;
};

export const DEFAULT_SUBSTITUTION: SubstitutionThresholds = { minVolumeRatio: 1.5 };

/* -------------------------------- a proposta ------------------------------ */

export type PrimarySubstitutionProposal = {
  /** `PROPOSED` quando há desafiante qualificado; `NONE` quando não há. */
  state: "PROPOSED" | "NONE";
  /** A vigente e os desafiantes, no contrato que o acervo já grava. */
  candidates: PrimaryKeywordCandidate[];
  /** Sempre `pending`, ou `null`. Este módulo não confirma nada. */
  decision: PrimaryKeywordDecision | null;
  /** O que impede aplicar — `locked` é o principal deles. */
  blockers: string[];
  /** O que aconteceu, em uma frase, para quem lê a mesa. */
  note: string;
};

const POLITICAS_QUE_BLOQUEIAM = new Map<string, string>([
  ["locked", "PRIMARY_POLICY_LOCKED"],
  ["conflict", "PRIMARY_POLICY_CONFLICT"],
  ["unknown", "PRIMARY_POLICY_UNKNOWN"],
]);

/**
 * Propõe a troca da primária de uma página publicada. Não troca.
 *
 * A política vigente NÃO decide se a proposta existe — decide se ela pode ser
 * aplicada. Uma primária travada com desafiante legítimo continua produzindo a
 * proposta, com o bloqueio dito: esconder a evidência porque a política
 * protege a página deixaria o humano sem o que decidir.
 */
export function proposePrimarySubstitution(input: {
  current: PublishedPrimary;
  challengers: readonly SubstitutionChallenger[];
  thresholds?: SubstitutionThresholds;
}): PrimarySubstitutionProposal {
  const limiares = input.thresholds || DEFAULT_SUBSTITUTION;
  const { current } = input;

  const vigente = PrimaryKeywordCandidateSchema.safeParse({
    keywordId: current.keywordId,
    keywordDnaId: current.keywordDnaId || current.keywordId,
    keyword: current.keyword,
    status: "current",
    source: "minerador",
    reason: current.volumeSearch === null
      ? "Primária vigente da página publicada; o acervo não registrou volume para ela."
      : `Primária vigente da página publicada, com ${current.volumeSearch} de volume.`,
  });
  const candidates: PrimaryKeywordCandidate[] = vigente.success ? [vigente.data] : [];

  const blockers = [...POLITICAS_QUE_BLOQUEIAM.entries()]
    .filter(([politica]) => politica === current.policy)
    .map(([, codigo]) => codigo);

  if (current.volumeSearch === null) {
    return {
      state: "NONE",
      candidates,
      decision: null,
      blockers,
      /*
       * Ausência não é divergência: sem o volume da vigente não há comparação,
       * e tratar `null` como zero faria qualquer desafiante parecer vencedor.
       */
      note: `A primária vigente "${current.keyword}" não tem volume medido no KeywordDNA: sem os dois números não há comparação a propor.`,
    };
  }

  const qualificados = input.challengers
    .filter(item => item.keywordId !== current.keywordId)
    .map(item => {
      const semDna = !item.keywordDnaId;
      const semVolume = item.volumeSearch === null;
      const semSerp = !item.serpSupportsSameUniverse;
      const semFolga = !semVolume && item.volumeSearch! < current.volumeSearch! * limiares.minVolumeRatio;
      return { item, semDna, semVolume, semSerp, semFolga, apto: !semDna && !semVolume && !semSerp && !semFolga };
    });

  for (const { item, semDna, semVolume, semSerp, semFolga, apto } of qualificados) {
    if (semDna) continue; // Sem KeywordDNA não há candidata registrável, e inventar id seria identidade falsa.
    const motivo = apto
      ? `Supera "${current.keyword}" em volume (${item.volumeSearch} contra ${current.volumeSearch}) e a SERP a põe no mesmo universo. ${item.serpNote || ""}`.trim()
      : semSerp
        ? "A SERP não sustenta que esta keyword dispute o mesmo universo da página publicada."
        : semVolume
          ? "Sem volume medido no KeywordDNA: não há como comparar com a primária vigente."
          : semFolga
            ? `Volume ${item.volumeSearch} não supera ${current.volumeSearch} com a folga mínima de ${limiares.minVolumeRatio}x exigida para mexer em página publicada.`
            : "Não qualificada.";

    const candidata = PrimaryKeywordCandidateSchema.safeParse({
      keywordId: item.keywordId,
      keywordDnaId: item.keywordDnaId,
      keyword: item.keyword,
      status: apto ? "candidate" : "rejected",
      // A origem é a SERP quando foi ela que sustentou; senão é o acervo.
      source: apto ? "serp" : "minerador",
      reason: motivo,
    });
    if (candidata.success) candidates.push(candidata.data);
  }

  const aptos = qualificados.filter(entry => entry.apto)
    .sort((esquerda, direita) => (direita.item.volumeSearch || 0) - (esquerda.item.volumeSearch || 0));
  const vencedor = aptos[0];

  if (!vencedor) {
    return {
      state: "NONE",
      candidates,
      decision: null,
      blockers,
      note: input.challengers.length
        ? `Nenhuma secundária reúne SERP do mesmo universo E volume ${limiares.minVolumeRatio}x acima de "${current.keyword}": a primária publicada permanece.`
        : `Nenhuma secundária apresentada para "${current.keyword}".`,
    };
  }

  const decisao = PrimaryKeywordDecisionSchema.safeParse({
    // Pendente, sempre. Confirmar é ato humano, e ele já tem porta própria.
    status: "pending",
    previousKeywordId: current.keywordId,
    selectedKeywordId: vencedor.item.keywordId,
    reason: `Proposta de troca: "${vencedor.item.keyword}" tem ${vencedor.item.volumeSearch} de volume contra ${current.volumeSearch} de "${current.keyword}", e a SERP as coloca no mesmo universo.`,
  });

  return {
    state: "PROPOSED",
    candidates,
    decision: decisao.success ? decisao.data : null,
    blockers,
    note: blockers.includes("PRIMARY_POLICY_LOCKED")
      ? `"${vencedor.item.keyword}" qualifica para substituir a primária, mas a política da página está TRAVADA: a troca só acontece se uma pessoa liberar a política.`
      : `"${vencedor.item.keyword}" qualifica para substituir "${current.keyword}". A decisão fica pendente de confirmação humana.`,
  };
}

/* ------------------------ o reforço com secundárias ----------------------- */

export type ReinforcementPlan = {
  /** Secundárias que a SERP sustenta e que cabem no teto. */
  admitted: SubstitutionChallenger[];
  /** As recusadas, cada uma com o motivo dela. */
  refused: Array<{ keywordId: string; keyword: string; reason: string }>;
  /** O teto vigente do domínio, nunca redefinido aqui. */
  ceiling: number;
  note: string;
};

/**
 * Quais secundárias reforçam a página publicada — e quais não entram.
 *
 * O teto vem de `MAX_KEYWORDS_PER_ARTICLE`: uma segunda definição de "quantas
 * cabem" é como duas telas passam a discordar sobre o mesmo artigo. A ordem de
 * corte é por volume, e quem fica de fora fica com o motivo escrito: "sobrou
 * do teto" é diferente de "a SERP não sustenta", e a mesa precisa saber qual
 * dos dois aconteceu.
 */
export function planPublishedReinforcement(input: {
  currentKeywordCount: number;
  secondaries: readonly SubstitutionChallenger[];
  ceiling?: number;
}): ReinforcementPlan {
  const ceiling = input.ceiling ?? MAX_KEYWORDS_PER_ARTICLE;
  const vagas = Math.max(0, ceiling - input.currentKeywordCount);

  const refused: ReinforcementPlan["refused"] = [];
  const sustentadas = input.secondaries.filter(item => {
    if (item.serpSupportsSameUniverse) return true;
    refused.push({
      keywordId: item.keywordId,
      keyword: item.keyword,
      reason: "A SERP não sustenta que esta keyword pertença ao mesmo universo da página.",
    });
    return false;
  });

  const ordenadas = [...sustentadas].sort((esquerda, direita) => (direita.volumeSearch || 0) - (esquerda.volumeSearch || 0));
  const admitted = ordenadas.slice(0, vagas);
  for (const sobra of ordenadas.slice(vagas)) {
    refused.push({
      keywordId: sobra.keywordId,
      keyword: sobra.keyword,
      reason: `O artigo já usa ${input.currentKeywordCount} de ${ceiling} keywords: não há vaga para esta.`,
    });
  }

  return {
    admitted,
    refused,
    ceiling,
    note: !vagas
      ? `A página já está no teto de ${ceiling} keywords: nenhum reforço cabe sem tirar outra.`
      : admitted.length
        ? `${admitted.length} secundária(s) com evidência de SERP entram no reforço; restam ${vagas - admitted.length} vaga(s).`
        : "Nenhuma secundária apresentada tem evidência de SERP para reforçar esta página.",
  };
}
