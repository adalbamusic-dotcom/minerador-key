/**
 * O ENCADEAMENTO DAS AÇÕES — quem pode agir, e quando o resultado é sucesso.
 *
 * As quatro ações operacionais do Radar são START, ANALYZE, FINALIZE e RESET.
 * Todas nascem de um clique, todas gravam, e todas podem falhar no meio. As
 * regras de quando uma delas pode começar e de quando ela terminou de verdade
 * viviam espalhadas em refs e condicionais dentro do componente de tela — o
 * lugar mais difícil de provar que existe.
 *
 * TRÊS REGRAS QUE ESTE MÓDULO EXISTE PARA TORNAR VERIFICÁVEIS:
 *
 *   1. UMA OPERAÇÃO POR VEZ, E O SEGUNDO CLIQUE NÃO ENTRA. O guarda fecha a
 *      porta ANTES do primeiro `await`: estado de render chega tarde demais, e
 *      dois cliques rápidos produziriam duas coletas, dois snapshots e dois
 *      avisos de sucesso.
 *
 *   2. LOCAL NÃO É PERSISTIDO. "Finalizada" com gravação remota não confirmada
 *      é uma tela mentindo para a próxima máquina que abrir o artigo. O
 *      resultado nomeia os três casos — concluído, não persistido, falhou — em
 *      vez de arredondar dois deles para o mesmo verde.
 *
 *   3. ERRO TÉCNICO NÃO É MENSAGEM DE PRIMEIRA CAMADA. Quem opera precisa
 *      saber o que fazer; `ZodError: expected string, received null` não diz.
 *      O detalhe continua inteiro, ao lado, para quem for investigar.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import type { RadarPhase1ActionId } from "./serp-phase1.ts";

/* ============================== as ações ================================ */

export type RadarOperationalActionId = "START" | "ANALYZE" | "FINALIZE" | "RESET";

export const RADAR_OPERATIONAL_ACTION_LABEL: Record<RadarOperationalActionId, string> = {
  START: "iniciar a pesquisa",
  ANALYZE: "analisar a concorrência",
  FINALIZE: "finalizar a investigação",
  RESET: "zerar a investigação",
};

/**
 * A LIGAÇÃO ENTRE A AÇÃO RESOLVIDA E O HANDLER QUE A EXECUTA.
 *
 * A autoridade da Fase 1 decide QUAL é a ação; este mapa decide QUEM a executa.
 * Ele existe como dado — e não como uma cadeia de `if` dentro do componente —
 * porque um `if` a mais no lugar errado faz o botão "Finalizar" chamar a
 * análise, e nada no teste de string perceberia.
 */
export const RADAR_PHASE1_HANDLER: Record<RadarPhase1ActionId, RadarOperationalActionId | null> = {
  START_RESEARCH: "START",
  ANALYZE_COMPETITION: "ANALYZE",
  FINALIZE_SERP: "FINALIZE",
  NONE: null,
};

/* ========================== o guarda de concorrência ==================== */

export type RadarActionClaim = { articleId: string; action: RadarOperationalActionId } | null;

export type RadarClaimDecision = {
  granted: boolean;
  claim: RadarActionClaim;
  /** Por que o segundo clique não entrou. `null` quando entrou. */
  refusal: string | null;
};

/**
 * UMA OPERAÇÃO POR VEZ — inclusive a mesma, clicada duas vezes.
 *
 * O guarda é deliberadamente cego ao artigo: duas operações concorrentes em
 * artigos diferentes disputariam o mesmo pipeline de persistência, e a segunda
 * gravaria por cima de uma versão que a primeira ainda estava montando.
 */
export function radarClaimAction(current: RadarActionClaim, next: { articleId: string; action: RadarOperationalActionId }): RadarClaimDecision {
  if (!current) return { granted: true, claim: next, refusal: null };

  const mesma = current.articleId === next.articleId && current.action === next.action;
  return {
    granted: false,
    claim: current,
    refusal: mesma
      ? `A ação de ${RADAR_OPERATIONAL_ACTION_LABEL[next.action]} já está em andamento neste artigo.`
      : `Outra ação ainda está em andamento (${RADAR_OPERATIONAL_ACTION_LABEL[current.action]}). Aguarde a conclusão.`,
  };
}

/** Só quem tomou a posse a devolve: liberar por engano reabriria a porta. */
export function radarReleaseAction(current: RadarActionClaim, done: { articleId: string; action: RadarOperationalActionId }): RadarActionClaim {
  if (!current) return null;
  return current.articleId === done.articleId && current.action === done.action ? null : current;
}

/** A operação em voo bloqueia o botão dela — e todos os outros. */
export const radarActionInFlight = (claim: RadarActionClaim, action?: RadarOperationalActionId) =>
  Boolean(claim && (action === undefined || claim.action === action));

/* ============================== o resultado ============================= */

export type RadarPersistenceOutcome = { persistenceMode: "remote" | "local"; readbackConfirmed: boolean };

export type RadarActionStatus = "SUCCEEDED" | "NOT_PERSISTED" | "FAILED";

export type RadarActionResult = {
  status: RadarActionStatus;
  /** A tela pode apresentar a operação como concluída? */
  advances: boolean;
  message: string;
  /** O que aconteceu por baixo, para o expansível e o log. Nunca o título. */
  detail: string | null;
};

/*
 * O QUE NÃO PODE SER A FRASE PRINCIPAL.
 *
 * Erro de schema, hash, payload, stack e status HTTP cru descrevem a máquina.
 * Eles continuam inteiros no detalhe; o que muda é quem lê primeiro.
 */
const TECNICO = /ZodError|schema|invalid_type|expected .* received|contentHash|hash mismatch|payload|at Object\.|at async|\bstack\b|HTTP \d{3}|\b(4\d{2}|5\d{2})\b|Internal Server Error|fetch failed|ECONN|undefined is not/i;

const textoDoErro = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "";

/**
 * O RESULTADO DE UMA AÇÃO, EM TRÊS ESTADOS — não em dois.
 *
 * "Deu certo" e "deu errado" não descrevem o caso mais perigoso: a operação
 * aconteceu, o estado local mudou, e a gravação remota não foi confirmada. Sem
 * o terceiro estado, essa situação vira verde na tela e some.
 */
export function radarActionOutcome(input: {
  action: RadarOperationalActionId;
  persistence?: RadarPersistenceOutcome | null;
  error?: unknown;
  /** O que dizer quando tudo deu certo. Uma frase de quem opera. */
  successMessage?: string;
}): RadarActionResult {
  const verbo = RADAR_OPERATIONAL_ACTION_LABEL[input.action];

  if (input.error !== undefined && input.error !== null) {
    const bruto = textoDoErro(input.error);
    const tecnico = !bruto || TECNICO.test(bruto);
    return {
      status: "FAILED",
      advances: false,
      message: tecnico ? `O Radar não conseguiu ${verbo}. Tente novamente.` : bruto,
      detail: bruto || null,
    };
  }

  if (!input.persistence) {
    return { status: "FAILED", advances: false, message: `O Radar não conseguiu ${verbo}. Tente novamente.`, detail: "A operação terminou sem resultado de persistência." };
  }

  const confirmada = input.persistence.persistenceMode === "remote" && input.persistence.readbackConfirmed;
  if (!confirmada) {
    /*
     * FINALIZAR SEM READBACK NÃO É FINALIZAR.
     *
     * Nas demais ações o trabalho local continua útil e a limitação é dita.
     * Na finalização não existe meio-termo: ela é a promessa de que aquela
     * versão não muda mais, e uma promessa não confirmada não vale.
     */
    return {
      status: "NOT_PERSISTED",
      advances: false,
      message: input.action === "FINALIZE"
        ? "A investigação NÃO foi finalizada: a gravação remota não pôde ser confirmada por readback. Tente novamente."
        : `A ação foi concluída localmente, mas a persistência remota não foi confirmada. Repita antes de seguir.`,
      detail: `persistência ${input.persistence.persistenceMode} · readback ${input.persistence.readbackConfirmed ? "confirmado" : "não confirmado"}`,
    };
  }

  return {
    status: "SUCCEEDED",
    advances: true,
    message: input.successMessage || "Ação concluída. Persistência remota e readback confirmados.",
    detail: null,
  };
}

/* ========================= o que cada ação preserva ===================== */

/**
 * OS FUNDAMENTOS QUE NENHUMA AÇÃO DO RADAR TOCA.
 *
 * Zerar a investigação descarta o que o Radar produziu. Ele não descarta o que
 * o Arquiteto formou — e essa fronteira precisa estar escrita em algum lugar
 * verificável, não apenas respeitada por hábito.
 */
export const RADAR_UPSTREAM_UNTOUCHED: readonly string[] = [
  "ArticleDNA",
  "KeywordDNA",
  "SiloDNA",
  "SiloPage",
  "InternalLinkGraph",
];
