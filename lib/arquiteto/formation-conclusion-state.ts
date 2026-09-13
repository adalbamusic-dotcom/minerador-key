/**
 * O QUE A LINHA DA MESA SABE SOBRE A FORMAÇÃO.
 *
 * A conclusão passou a ser gravada em `concludedFormations` do marcador, e o
 * remoto confirmou — mas a mesa continuava derivando o estado de duas coisas
 * que não sabem nada sobre isso:
 *
 *   `articleDnaVersion`   existe ArticleDNA?
 *   `isFormationCandidate` o lote já foi processado?
 *
 * Com o ArticleDNA ainda ausente — que é o estado NORMAL entre concluir a
 * formação e o Silo consolidar — as duas respondiam "não", e a linha exibia
 * "ainda não confirmado · Pendente · Em processo" sobre uma formação que a
 * pessoa tinha acabado de fechar.
 *
 * Aqui os dois fatos ficam separados e nomeados:
 *
 *   FORMATION_CONCLUDED       decisão humana, gravada no marcador
 *   ARTICLE_DNA_MATERIALIZED  artefato canônico, que espera o Silo
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export const FORMATION_CONCLUSION_STATES = [
  /** O lote nunca foi processado: não há candidato a falar sobre. */
  "NOT_PROCESSED",
  /** Processado, formação ainda aberta — o estado de trabalho normal. */
  "IN_FORMATION",
  /** Fechada por decisão humana; o ArticleDNA espera o Silo canônico. */
  "CONCLUDED_AWAITING_SILO",
  /** Fechada e materializada: o ArticleDNA existe. */
  "MATERIALIZED",
] as const;
export type FormationConclusionState = (typeof FORMATION_CONCLUSION_STATES)[number];

export type FormationConclusionReading = {
  state: FormationConclusionState;
  /** Rótulo da unidade: o que ela É agora. */
  unitLabel: string;
  /** Linha de apoio sob o rótulo. */
  unitDetail: string;
  /** Coluna "Definição do artigo". */
  definitionLabel: string;
  /** Coluna de status operacional. */
  statusLabel: string;
  /**
   * A formação está fechada?
   *
   * Separado de `articleDnaMaterialized` de propósito: enquanto o Silo não
   * consolida, a primeira é `true` e a segunda é `false`, e mostrar as duas
   * como a mesma coisa é justamente o defeito que isto corrige.
   */
  formationConcluded: boolean;
  articleDnaMaterialized: boolean;
  /** A conclusão ainda descreve a composição de agora? */
  stale: boolean;
};

/**
 * A leitura, na ordem em que os fatos mandam.
 *
 * ArticleDNA existente responde primeiro porque é o fato mais forte: se o
 * artefato canônico está no acervo, a formação fechou e materializou, e
 * nenhuma contagem de marcador contradiz isso.
 */
export function readFormationConclusionState(input: {
  candidateRef: string | null;
  /** ArticleDNA canônico deste candidato, quando existe. */
  articleDnaVersionNumber: number | null;
  /** O lote foi processado — existe marcador de formação. */
  processed: boolean;
  /** As formações congeladas no marcador, vindas do remoto. */
  concludedFormations: readonly { candidateRef: string; formationBaseHash: string }[];
  /** A composição corrente; conclusão de outra composição é histórico. */
  currentFormationBaseHash?: string | null;
  published?: boolean;
}): FormationConclusionReading {
  if (input.published) {
    return {
      state: "MATERIALIZED",
      unitLabel: "ARTICLE · PUBLICADO",
      unitDetail: "canonical protegido",
      definitionLabel: "Publicado",
      statusLabel: "Publicado",
      formationConcluded: true,
      articleDnaMaterialized: true,
      stale: false,
    };
  }

  if (input.articleDnaVersionNumber !== null) {
    return {
      state: "MATERIALIZED",
      unitLabel: "ARTICLE",
      unitDetail: `v${input.articleDnaVersionNumber}`,
      definitionLabel: `Consolidado · v${input.articleDnaVersionNumber}`,
      statusLabel: "Formação concluída",
      formationConcluded: true,
      articleDnaMaterialized: true,
      stale: false,
    };
  }

  const congelada = input.candidateRef
    ? input.concludedFormations.find(item => item.candidateRef === input.candidateRef)
    : undefined;

  if (congelada) {
    /*
     * A conclusão fala de UMA composição.
     *
     * Se o cenário foi reprocessado e a composição mudou, o que a pessoa
     * fechou não é o que está na tela — e dizer "concluída" ali esconderia
     * que a decisão precisa ser refeita.
     */
    const stale = Boolean(input.currentFormationBaseHash)
      && congelada.formationBaseHash !== input.currentFormationBaseHash;
    return stale
      ? {
        state: "IN_FORMATION",
        unitLabel: "CANDIDATO",
        unitDetail: "composição mudou depois da conclusão",
        definitionLabel: "Reprocessar e concluir de novo",
        statusLabel: "Conclusão desatualizada",
        formationConcluded: false,
        articleDnaMaterialized: false,
        stale: true,
      }
      : {
        state: "CONCLUDED_AWAITING_SILO",
        unitLabel: "CANDIDATO",
        unitDetail: "formação concluída",
        definitionLabel: "Formação concluída",
        // §2 — o processo humano daquela formação terminou; o que falta é o
        // Silo, e isso é dito pelo nome em vez de "Em processo".
        statusLabel: "Aguardando consolidação do Silo",
        formationConcluded: true,
        // §3 — ArticleDNA continua sendo 0, e a tela não finge o contrário.
        articleDnaMaterialized: false,
        stale: false,
      };
  }

  return input.processed
    ? {
      state: "IN_FORMATION",
      unitLabel: "CANDIDATO",
      unitDetail: "ainda não concluído",
      definitionLabel: "Pendente",
      statusLabel: "Em processo",
      formationConcluded: false,
      articleDnaMaterialized: false,
      stale: false,
    }
    : {
      state: "NOT_PROCESSED",
      unitLabel: "CANDIDATO",
      unitDetail: "aguardando processamento",
      definitionLabel: "Pendente",
      statusLabel: "Em processo",
      formationConcluded: false,
      articleDnaMaterialized: false,
      stale: false,
    };
}
