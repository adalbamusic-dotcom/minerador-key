/**
 * O ESTADO DA COLETA — e a diferença entre "tente de novo" e "não adianta".
 *
 * O primeiro smoke real parou aqui. Sem snapshot, a subaba Coleta dizia que a
 * próxima ação era uma coleta explícita e não oferecia ação nenhuma; depois de
 * uma tentativa, um erro de vínculo de Silo virou `Falha SERP · retry
 * disponível`. Repetir o clique não conserta vínculo: o botão convidava a
 * pessoa a bater na mesma parede.
 *
 * Duas regras, então:
 *
 *   1. sem snapshot existe UMA ação primária, explícita, e ela é a única coisa
 *      que fala com o provider;
 *   2. `Tentar novamente` só aparece quando repetir PODE resolver.
 *
 * Falha estrutural — marca, ArticleDNA, keyword, Silo, identidade canônica,
 * permissão, transferência — é bloqueio: a coleta não foi iniciada e não vai
 * ser por insistência. Timeout, 5xx e indisponibilidade de persistência são
 * transitórios.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export const RADAR_SERP_COLLECTION_STATES = [
  "NOT_COLLECTED",
  "VALIDATING",
  "COLLECTING",
  "PERSISTING",
  "SUCCESS",
  "TRANSIENT_FAILURE",
  "STRUCTURAL_BLOCK",
] as const;

export type RadarSerpCollectionState = (typeof RADAR_SERP_COLLECTION_STATES)[number];

export const RADAR_SERP_COLLECTION_LABEL: Record<RadarSerpCollectionState, string> = {
  NOT_COLLECTED: "Iniciar coleta SERP",
  VALIDATING: "Validando artigo…",
  COLLECTING: "Coletando SERP…",
  PERSISTING: "Salvando snapshot…",
  SUCCESS: "Snapshot disponível",
  TRANSIENT_FAILURE: "Tentar novamente",
  STRUCTURAL_BLOCK: "Coleta bloqueada",
};

/** Estados em que uma requisição está em voo — o botão não pode disparar outra. */
export const RADAR_SERP_COLLECTION_IN_FLIGHT: readonly RadarSerpCollectionState[] = ["VALIDATING", "COLLECTING", "PERSISTING"];

export function radarSerpCollectionInFlight(state: RadarSerpCollectionState) {
  return RADAR_SERP_COLLECTION_IN_FLIGHT.includes(state);
}

/*
 * Códigos que o Route Handler devolve ANTES de qualquer chamada paga.
 *
 * Todos descrevem um vínculo que a pessoa precisa corrigir na origem; nenhum
 * melhora por repetição. `persistence_unavailable` fica de fora de propósito:
 * o banco pode voltar.
 */
const STRUCTURAL_CODES = new Set([
  "unauthenticated",
  "permission_denied",
  "authorization_error",
  "not_entitled",
  "invalid_serp_request",
  "invalid_transfer",
  "transfer_conflict",
  "radar_identity_mismatch",
  "schema_missing",
]);

/**
 * Frases que identificam bloqueio estrutural quando só a mensagem chega.
 *
 * O cliente nem sempre recebe `code` — respostas antigas e erros lançados no
 * caminho do envelope trazem só texto. Classificar pelo texto é pior que pelo
 * código, e por isso o código vem primeiro; isto é a rede de segurança.
 */
const STRUCTURAL_MESSAGES = [
  /não pertence à marca/i,
  /não pôde ser comprovado dentro da marca/i,
  /não foi encontrad[ao] para esta marca/i,
  /vínculo canônico/i,
  /identificador técnico/i,
  /Corrija o vínculo no Arquiteto/i,
  /ArticleDNA sem vínculo coerente/i,
  /hidratação local não corresponde/i,
  /transferência editorial/i,
  /diverge da versão canônica/i,
];

export type RadarSerpCollectionFailure = "TRANSIENT_FAILURE" | "STRUCTURAL_BLOCK";

export function classifyRadarSerpCollectionFailure(error: unknown): RadarSerpCollectionFailure {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  if (code && STRUCTURAL_CODES.has(code)) return "STRUCTURAL_BLOCK";
  if (code === "persistence_unavailable") return "TRANSIENT_FAILURE";
  const message = error instanceof Error ? error.message : String(error || "");
  return STRUCTURAL_MESSAGES.some(pattern => pattern.test(message)) ? "STRUCTURAL_BLOCK" : "TRANSIENT_FAILURE";
}

export type RadarSerpCollectionAction = {
  state: RadarSerpCollectionState;
  /** Rótulo da ação primária; `null` quando não há ação a oferecer. */
  actionLabel: string | null;
  /** Habilita o disparo. Falso em voo, em bloqueio e sem contexto. */
  canStart: boolean;
  /** A ação é a PRIMEIRA coleta deste artigo? */
  isFirstCollection: boolean;
  /** Explicação curta do estado, sem UUID. */
  detail: string;
};

/**
 * A ação da subaba Coleta, derivada do estado real — nunca de um clique
 * anterior que ficou preso na sessão.
 */
export function radarSerpCollectionAction(input: {
  hasSnapshot: boolean;
  state: RadarSerpCollectionState;
  contextReady: boolean;
  blockedReason?: string | null;
}): RadarSerpCollectionAction {
  const emVoo = radarSerpCollectionInFlight(input.state);
  if (emVoo) {
    return { state: input.state, actionLabel: RADAR_SERP_COLLECTION_LABEL[input.state], canStart: false, isFirstCollection: !input.hasSnapshot, detail: RADAR_SERP_COLLECTION_LABEL[input.state] };
  }
  if (input.state === "STRUCTURAL_BLOCK") {
    return {
      state: "STRUCTURAL_BLOCK",
      actionLabel: null,
      canStart: false,
      isFirstCollection: !input.hasSnapshot,
      detail: input.blockedReason?.trim()
        || "A keyword principal deste artigo não pôde ser validada dentro da marca atual. A coleta DataForSEO não foi iniciada.",
    };
  }
  if (!input.hasSnapshot) {
    if (!input.contextReady) {
      return { state: "NOT_COLLECTED", actionLabel: null, canStart: false, isFirstCollection: true, detail: "Este artigo ainda não tem contexto suficiente para uma coleta." };
    }
    const retry = input.state === "TRANSIENT_FAILURE";
    return {
      state: retry ? "TRANSIENT_FAILURE" : "NOT_COLLECTED",
      actionLabel: retry ? RADAR_SERP_COLLECTION_LABEL.TRANSIENT_FAILURE : RADAR_SERP_COLLECTION_LABEL.NOT_COLLECTED,
      canStart: true,
      isFirstCollection: true,
      detail: retry
        ? "A coleta anterior falhou por um motivo transitório. Repetir pode resolver."
        : "Nenhum snapshot disponível. A coleta DataForSEO é explícita e só acontece por esta ação.",
    };
  }
  // Com snapshot, a primeira coleta não é oferecida: atualizar é outra decisão.
  const retry = input.state === "TRANSIENT_FAILURE";
  return {
    state: retry ? "TRANSIENT_FAILURE" : "SUCCESS",
    actionLabel: retry ? RADAR_SERP_COLLECTION_LABEL.TRANSIENT_FAILURE : "Atualizar SERP",
    canStart: input.contextReady,
    isFirstCollection: false,
    detail: retry
      ? "A atualização anterior falhou por um motivo transitório. Repetir pode resolver."
      : "Snapshot disponível. Uma nova coleta cria snapshot sucessor e continua sendo ação deliberada.",
  };
}
