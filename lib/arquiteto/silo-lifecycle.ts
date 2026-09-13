/**
 * O SILO TEM DOIS ESTADOS, NÃO UM.
 *
 * "Confirmar arquitetura" foi tratado, numa passada anterior, como se fosse
 * "SiloDNA final e imutável" — e o código chegou a criar o par canônico ali
 * mesmo, só para calar o aviso que a fase Artigos mostrava. Era a resposta
 * errada para a queixa certa.
 *
 * Confirmar arquitetura fecha a arquitetura de TRABALHO:
 *
 *   ARCHITECTURE_WORKING_CONFIRMED = YES
 *   ARTICLE_FORMATION_ALLOWED      = YES
 *
 * A fronteira do Silo ainda pode ser contestada pela SERP durante
 * `Processar artigos`. Consolidar o par canônico antes disso seria gravar como
 * contrato uma fronteira que a evidência ainda pode mudar — e desfazer custa
 * uma sucessora em cada artefato.
 *
 * Por isso "consolidação canônica pendente" NÃO é erro: é o estado normal e
 * esperado entre confirmar a arquitetura e concluir a formação.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export const SILO_WORKING_STATES = ["NOT_CONFIRMED", "WORKING_CONFIRMED"] as const;
export type SiloWorkingState = (typeof SILO_WORKING_STATES)[number];

export const SILO_CANONICAL_STATES = [
  /** Ainda não há arquitetura de trabalho confirmada: nem se pergunta. */
  "NOT_APPLICABLE",
  /** Normal e esperado: a fronteira ainda pode ser contestada pela SERP. */
  "CANONICAL_CONSOLIDATION_PENDING",
  "CANONICAL_CONSOLIDATED",
] as const;
export type SiloCanonicalState = (typeof SILO_CANONICAL_STATES)[number];

export type SiloLifecycleReading = {
  working: SiloWorkingState;
  canonical: SiloCanonicalState;
  /** Rótulo curto de cada eixo, para a tela mostrar os dois separados. */
  workingLabel: string;
  canonicalLabel: string;
  /**
   * A pendência é o estado ESPERADO deste momento do fluxo?
   *
   * Existe para a tela não pintar de vermelho o que é normal. Quando `true`, a
   * pendência é informação; quando `false`, é algo que alguém precisa resolver.
   */
  pendingIsExpected: boolean;
  /** O que ainda vai acontecer, em uma frase. `null` quando nada falta. */
  note: string | null;
  /** A formação de Articles já pode começar? */
  articleFormationAllowed: boolean;
};

/**
 * Lê os dois eixos a partir do que EXISTE — nunca do que se pretende.
 *
 * `canonicalSiloId` é a prova de que o par canônico foi gravado. Território
 * confirmado sem ele é exatamente o meio do caminho, e dizer isso é diferente
 * de acusar falta.
 */
export function readSiloLifecycle(input: {
  /** O território passou por decisão humana de confirmação? */
  territoryConfirmed: boolean;
  /** SiloDNA canônico gravado para este território, quando existe. */
  canonicalSiloId: string | null;
  /** Há contestação de fronteira aberta, vinda da SERP dos Articles? */
  openBoundaryChallenges?: number;
}): SiloLifecycleReading {
  const contestacoes = input.openBoundaryChallenges ?? 0;

  if (!input.territoryConfirmed) {
    return {
      working: "NOT_CONFIRMED",
      canonical: "NOT_APPLICABLE",
      workingLabel: "Não confirmada",
      canonicalLabel: "—",
      pendingIsExpected: false,
      note: "Confirme a arquitetura na fase Silos antes de formar Articles.",
      articleFormationAllowed: false,
    };
  }

  if (input.canonicalSiloId) {
    return {
      working: "WORKING_CONFIRMED",
      canonical: "CANONICAL_CONSOLIDATED",
      workingLabel: "Confirmada",
      canonicalLabel: "Consolidado",
      pendingIsExpected: false,
      note: null,
      articleFormationAllowed: true,
    };
  }

  return {
    working: "WORKING_CONFIRMED",
    canonical: "CANONICAL_CONSOLIDATION_PENDING",
    workingLabel: "Confirmada",
    canonicalLabel: "Pendente",
    // Este é o estado normal entre confirmar e concluir a formação.
    pendingIsExpected: true,
    note: contestacoes
      ? `${contestacoes} contestação(ões) de fronteira aberta(s): a decisão volta para a fase Silos.`
      : "Arquitetura de trabalho confirmada; a fronteira ainda pode ser revisada por evidência SERP.",
    articleFormationAllowed: true,
  };
}
