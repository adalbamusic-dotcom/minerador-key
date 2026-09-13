/**
 * A FRONTEIRA DA RODADA DE HOMOLOGAÇÃO.
 *
 * `Reiniciar homologação` limpa a cópia de trabalho e PRESERVA os artefatos
 * versionados — é o que rastreabilidade exige. Só que preservar não pode
 * significar continuar valendo: `canonical-version-authority` resolve "a última
 * aprovada", e sem uma fronteira ela encontraria o SiloDNA e o ArticleDNA da
 * rodada anterior e os apresentaria como estado corrente da rodada nova. A
 * cópia de trabalho estaria limpa e o cenário, não.
 *
 * A fronteira é um MARCADOR, não um filtro embutido: a rodada ativa declara
 * quando começou, e o que nasceu antes disso é histórico consultável.
 *
 * TRÊS COISAS QUE ELA NÃO FAZ:
 *
 *  - não apaga nada. O histórico continua no acervo e continua auditável;
 *  - não muda a regra de `canonical-version-authority`. Ela continua sendo
 *    "a última aprovada" — o que muda é o UNIVERSO sobre o qual ela responde;
 *  - não existe em produção. Sem modo de homologação e sem rodada ativa, tudo
 *    passa e o produto se comporta exatamente como hoje.
 *
 * A SERP é exceção intencional e NÃO passa por aqui: parecer histórico pode
 * ser reaproveitado entre rodadas, mas só por identidade forte
 * (`formationBaseHash` idêntico). Estado canônico não atravessa; evidência sim.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const HOMOLOGATION_ROUND_SUBJECT_TYPE = "arquiteto_homologation_round" as const;

export type HomologationRound = {
  roundId: string;
  /** Instante em que a rodada passou a valer. É ele que separa os universos. */
  startedAt: string;
  startedBy: string;
  reason: "FRESH";
  previousRoundId: string | null;
};

export function buildHomologationRoundMarker(input: {
  roundId: string;
  startedBy: string;
  previousRoundId?: string | null;
  startedAt?: string;
}): HomologationRound {
  return {
    roundId: input.roundId,
    startedAt: input.startedAt || new Date().toISOString(),
    startedBy: input.startedBy,
    reason: "FRESH",
    previousRoundId: input.previousRoundId ?? null,
  };
}

/** A rodada que vale agora: a de `startedAt` mais recente. */
export function activeHomologationRound(
  markers: readonly HomologationRound[],
): HomologationRound | null {
  return [...markers].sort((left, right) => left.startedAt.localeCompare(right.startedAt)).at(-1) ?? null;
}

export type RoundScopedArtifact = { createdAt: string };

export type RoundScope<T extends RoundScopedArtifact> = {
  /** O que pertence à rodada ativa — o estado corrente. */
  active: T[];
  /** O que nasceu antes dela — histórico, consultável, não corrente. */
  historical: T[];
  /** Há fronteira valendo? `false` em produção e antes do primeiro fresh. */
  bounded: boolean;
};

/**
 * Separa corrente de histórico pela fronteira da rodada.
 *
 * Sem modo de homologação ou sem rodada ativa, NADA é separado: tudo continua
 * corrente, que é o comportamento do produto. A fronteira é aditiva.
 *
 * O critério é `createdAt >= startedAt`. Artefato não carrega `roundId`, e
 * carimbar um exigiria mexer no schema de todos eles — o instante em que a
 * rodada começou já responde a mesma pergunta com o que existe.
 */
export function scopeArtifactsToActiveRound<T extends RoundScopedArtifact>(input: {
  artifacts: readonly T[];
  round: HomologationRound | null;
  homologationMode: boolean;
}): RoundScope<T> {
  if (!input.homologationMode || !input.round) {
    return { active: [...input.artifacts], historical: [], bounded: false };
  }
  const inicio = input.round.startedAt;
  const active: T[] = [];
  const historical: T[] = [];
  for (const artifact of input.artifacts) {
    if (artifact.createdAt >= inicio) active.push(artifact);
    else historical.push(artifact);
  }
  return { active, historical, bounded: true };
}

/**
 * A pergunta que o audit precisa responder depois do fresh.
 *
 * `true` significa que artefato de rodada anterior ainda apareceria como
 * corrente — exatamente o que a fronteira existe para impedir.
 */
export function oldApprovedArtifactsVisibleAsCurrent(input: {
  round: HomologationRound | null;
  homologationMode: boolean;
  /** Artefatos aprovados que os read models tratariam como correntes. */
  currentApproved: readonly RoundScopedArtifact[];
}): boolean {
  if (!input.homologationMode || !input.round) return false;
  return input.currentApproved.some(artifact => artifact.createdAt < input.round!.startedAt);
}
