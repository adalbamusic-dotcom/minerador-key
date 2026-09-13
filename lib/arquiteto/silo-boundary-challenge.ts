/**
 * A SERP CONTESTA A FRONTEIRA. ELA NÃO REATRIBUI.
 *
 * Durante `Processar artigos`, a evidência de mercado pode mostrar que uma
 * busca não pertence ao Silo em que a fase anterior a colocou. Isso é um
 * achado real e não pode ser engolido — mas também não autoriza a fase Artigos
 * a mover keyword entre Silos:
 *
 *   ARTICLE_CAN_DIRECTLY_MOVE_KEYWORD_BETWEEN_SILOS = NO
 *
 * Mudança estrutural pertence à fase Silos, onde ela é vista, comparada e
 * confirmada por uma pessoa. Uma reatribuição silenciosa em Artigos desfaria a
 * decisão humana anterior sem que ninguém soubesse — e foi assim que uma
 * migração inteira já passou despercebida neste projeto.
 *
 * O que este módulo produz é um CHALLENGE: um registro do que a evidência
 * sugere, com o suficiente para a fase Silos reprocessar sabendo o porquê.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export const SILO_CHALLENGE_KINDS = [
  /** A evidência confirma o Silo atual. Não é contestação; é confirmação. */
  "BELONGS_TO_CURRENT",
  /**
   * A evidência não conclui — e isso NÃO é contestação.
   *
   * O defeito que este estado corrige: com um único Silo no lote não existe
   * alvo de comparação, então a ausência de sobreposição virava
   * "AMBIGUOUS_BOUNDARY" e a mesa anunciava que a fronteira dos cinco
   * candidatos tinha sido contestada. Ausência de evidência suficiente não é
   * evidência de Silo errado.
   *
   * Pode represar a consolidação FINAL, se a política exigir. Não pode ser
   * apresentado como "a fronteira foi contestada".
   */
  "BOUNDARY_UNRESOLVED",
  /** A evidência aponta outro Silo como dono mais provável. */
  "BELONGS_ELSEWHERE",
] as const;
export type SiloChallengeKind = (typeof SILO_CHALLENGE_KINDS)[number];

export const SILO_CHALLENGE_CONFIDENCE = ["alta", "media", "baixa"] as const;
export type SiloChallengeConfidence = (typeof SILO_CHALLENGE_CONFIDENCE)[number];

export const SILO_CHALLENGE_STATES = ["open", "incorporated", "dismissed"] as const;
export type SiloChallengeState = (typeof SILO_CHALLENGE_STATES)[number];

export type SiloBoundaryChallenge = {
  /** Identidade estável do achado: mesmo escopo + mesmo destino = mesmo item. */
  challengeRef: string;
  /** O que está sendo contestado: uma busca ou a formação inteira. */
  scope: { kind: "keyword" | "candidate"; id: string; label: string };
  currentSiloRef: string;
  /** `null` quando a evidência não aponta destino, só ambiguidade. */
  suggestedSiloRef: string | null;
  suggestedSiloLabel: string | null;
  kind: SiloChallengeKind;
  /** A evidência que sustenta o achado, referenciada — nunca reescrita. */
  evidence: {
    serpAssessmentRef: string | null;
    sharedUrlsWithCurrent: number;
    sharedUrlsWithSuggested: number;
    observedIntent: string | null;
  };
  reason: string;
  confidence: SiloChallengeConfidence;
  state: SiloChallengeState;
};

export function buildChallengeRef(input: {
  scopeId: string;
  currentSiloRef: string;
  suggestedSiloRef: string | null;
}): string {
  return `silo-challenge:${input.scopeId}:${input.currentSiloRef}→${input.suggestedSiloRef || "ambiguo"}`;
}

/**
 * §3 — a evidência vira achado, com força declarada.
 *
 * A confiança sai da distância entre as duas leituras, não de uma opinião: o
 * achado é forte quando o mercado alcança o Silo sugerido claramente mais que
 * o atual. Empate técnico é ambiguidade, e ambiguidade nunca vira "mude".
 *
 * `BELONGS_TO_CURRENT` também é registrado: saber que a evidência CONFIRMOU a
 * fronteira vale tanto quanto saber que a contestou, e é o que permite fechar
 * a consolidação canônica com tranquilidade.
 */
export function resolveSiloBoundaryChallenge(input: {
  scope: { kind: "keyword" | "candidate"; id: string; label: string };
  currentSiloRef: string;
  currentSiloLabel: string;
  suggestedSiloRef: string | null;
  suggestedSiloLabel: string | null;
  serpAssessmentRef?: string | null;
  /** Quantos resultados do topo o candidato divide com o Silo ATUAL. */
  sharedUrlsWithCurrent: number;
  /** Quantos divide com o Silo sugerido. */
  sharedUrlsWithSuggested: number;
  observedIntent?: string | null;
  /** A partir de quanta diferença o achado deixa de ser ruído. */
  margin?: number;
}): SiloBoundaryChallenge {
  const margem = input.margin ?? 2;
  const diferenca = input.sharedUrlsWithSuggested - input.sharedUrlsWithCurrent;

  let kind: SiloChallengeKind;
  let confidence: SiloChallengeConfidence;
  let reason: string;

  if (!input.suggestedSiloRef || input.suggestedSiloRef === input.currentSiloRef) {
    /*
     * §7/§8 — SEM ALVO NÃO HÁ CONTESTAÇÃO.
     *
     * "Mude para lá" precisa de um lá. Quando não existe outro Silo no lote —
     * o caso desta homologação, com `skincare` sozinho — a única coisa que a
     * SERP pode dizer é se o Silo atual se sustenta. Não poder comparar não é
     * o mesmo que ter comparado e discordado.
     */
    const sustenta = input.sharedUrlsWithCurrent > 0;
    kind = sustenta ? "BELONGS_TO_CURRENT" : "BOUNDARY_UNRESOLVED";
    confidence = sustenta ? "media" : "baixa";
    reason = sustenta
      ? `A SERP devolve ${input.sharedUrlsWithCurrent} resultado(s) do mesmo universo de "${input.currentSiloLabel}".`
      : `A SERP não aproxima "${input.scope.label}" de nenhum outro candidato do Silo, e não há outro Silo no lote `
        + "para comparar: a fronteira fica sem conclusão, o que não é o mesmo que fronteira errada.";
  } else if (diferenca >= margem) {
    kind = "BELONGS_ELSEWHERE";
    confidence = diferenca >= margem * 2 ? "alta" : "media";
    reason = `A SERP aproxima "${input.scope.label}" de "${input.suggestedSiloLabel}" `
      + `(${input.sharedUrlsWithSuggested} resultado(s)) mais que de "${input.currentSiloLabel}" `
      + `(${input.sharedUrlsWithCurrent}).`;
  } else if (Math.abs(diferenca) < margem && input.sharedUrlsWithSuggested > 0) {
    kind = "BOUNDARY_UNRESOLVED";
    confidence = "baixa";
    reason = `A SERP aproxima "${input.scope.label}" dos dois Silos em medida parecida `
      + `(${input.currentSiloLabel}: ${input.sharedUrlsWithCurrent} · ${input.suggestedSiloLabel}: ${input.sharedUrlsWithSuggested}).`;
  } else {
    kind = "BELONGS_TO_CURRENT";
    confidence = diferenca <= -margem ? "alta" : "media";
    reason = `A SERP sustenta "${input.scope.label}" em "${input.currentSiloLabel}" `
      + `(${input.sharedUrlsWithCurrent} resultado(s) contra ${input.sharedUrlsWithSuggested}).`;
  }

  return {
    challengeRef: buildChallengeRef({
      scopeId: input.scope.id,
      currentSiloRef: input.currentSiloRef,
      suggestedSiloRef: kind === "BELONGS_TO_CURRENT" ? null : input.suggestedSiloRef,
    }),
    scope: { ...input.scope },
    currentSiloRef: input.currentSiloRef,
    suggestedSiloRef: kind === "BELONGS_TO_CURRENT" ? null : input.suggestedSiloRef,
    suggestedSiloLabel: kind === "BELONGS_TO_CURRENT" ? null : input.suggestedSiloLabel,
    kind,
    evidence: {
      serpAssessmentRef: input.serpAssessmentRef ?? null,
      sharedUrlsWithCurrent: input.sharedUrlsWithCurrent,
      sharedUrlsWithSuggested: input.sharedUrlsWithSuggested,
      observedIntent: input.observedIntent ?? null,
    },
    reason,
    confidence,
    state: "open",
  };
}

/**
 * §2/§5 — o que exige volta à fase Silos.
 *
 * Só o que MUDA fronteira represa a consolidação: confirmação do Silo atual é
 * evidência a favor, e tratá-la como pendência travaria a fase por um achado
 * que diz "está certo".
 */
export function challengesRequiringSiloReview(
  challenges: readonly SiloBoundaryChallenge[],
): SiloBoundaryChallenge[] {
  /*
   * §5/§6 — SÓ CONTESTAÇÃO DE VERDADE VOLTA PARA SILOS.
   *
   * `BOUNDARY_UNRESOLVED` estava aqui dentro, e por isso a homologação viu os
   * cinco candidatos de um Silo único anunciados como "fronteira contestada":
   * não havia outro Silo para comparar, a evidência não concluía, e a falta de
   * conclusão era lida como discordância.
   *
   * Voltar para a fase Silos custa reprocessar e reconfirmar a arquitetura.
   * Isso se pede quando a evidência aponta OUTRO dono — com alvo e com número
   * —, não quando ela não diz nada.
   */
  return challenges.filter(challenge =>
    challenge.state === "open"
    && challenge.kind === "BELONGS_ELSEWHERE"
    // §7 — sem alvo declarado não existe para onde mandar a decisão.
    && Boolean(challenge.suggestedSiloRef)
    // §7 — e sem número não há o que a fase Silos possa examinar.
    && challenge.evidence.sharedUrlsWithSuggested > 0);
}

/**
 * §6 — o que não conclui, sem acusar ninguém.
 *
 * Serve para a política de consolidação FINAL, que pode exigir fronteira
 * resolvida. Não é contestação e não pode ser apresentado como tal.
 */
export function unresolvedBoundaries(
  challenges: readonly SiloBoundaryChallenge[],
): SiloBoundaryChallenge[] {
  return challenges.filter(challenge =>
    challenge.state === "open" && challenge.kind === "BOUNDARY_UNRESOLVED");
}

/**
 * §4 — o que a fase Silos recebe, pronto para reprocessar.
 *
 * A proposta é DESCRITA, não aplicada: `Reprocessar arquitetura` incorpora a
 * evidência e mostra a mudança; `Confirmar arquitetura` aplica a membership.
 * Nenhuma das duas acontece aqui.
 */
export function describeSiloReconsideration(
  challenges: readonly SiloBoundaryChallenge[],
): {
  required: boolean;
  scopes: number;
  byTargetSilo: Array<{ suggestedSiloRef: string | null; label: string; scopes: string[] }>;
  summary: string;
} {
  const abertos = challengesRequiringSiloReview(challenges);
  if (!abertos.length) {
    return { required: false, scopes: 0, byTargetSilo: [], summary: "Nenhuma contestação de fronteira aberta." };
  }

  const porDestino = new Map<string, { suggestedSiloRef: string | null; label: string; scopes: string[] }>();
  for (const challenge of abertos) {
    const chave = challenge.suggestedSiloRef || "ambiguo";
    const atual = porDestino.get(chave) || {
      suggestedSiloRef: challenge.suggestedSiloRef,
      label: challenge.suggestedSiloLabel || "fronteira ambígua",
      scopes: [],
    };
    atual.scopes.push(challenge.scope.label);
    porDestino.set(chave, atual);
  }

  const byTargetSilo = [...porDestino.values()].sort((a, b) => a.label.localeCompare(b.label));
  return {
    required: true,
    scopes: abertos.length,
    byTargetSilo,
    summary: `${abertos.length} contestação(ões) de fronteira: `
      + byTargetSilo.map(item => `${item.scopes.join(", ")} → ${item.label}`).join(" · ")
      + ". Reprocessar e confirmar a arquitetura na fase Silos aplica a mudança; Artigos não move keyword.",
  };
}
