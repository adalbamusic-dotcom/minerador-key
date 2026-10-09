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
import type { RadarPrimarySearchMode } from "./search-mode.ts";

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

/* ============ 2026-10-02 · D9 · o automático, dito antes do clique ============ */

/**
 * O CUSTO QUE O BOTÃO DE COLETA PASSA A DECLARAR — D9 (dono, 2026-10-02).
 *
 * A coleta já era paga, e o botão já dizia. Agora ela também finaliza sozinha
 * quando termina sem pendência, e finalizar chama a IA uma vez para organizar o
 * artigo-modelo da SERP. O acréscimo é dito no botão, antes do clique — nunca
 * descoberto na fatura.
 */
/*
 * 2026-10-09 (correção) · O TETO REAL, NÃO O CASO FELIZ. Organizar o artigo-modelo
 * faz 1 chamada e, se a resposta vier cortada ou a conferência apontar o que
 * corrigir, mais 1 — nunca as duas (`generateRadarArticleBlueprint`). Os botões de
 * finalizar diziam "+ 1 chamada de IA" enquanto o export, o envio, o 409 e o MCP
 * diziam "até 2 por artigo": agora todos dizem o teto, pela mesma constante.
 */
export const RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS = 2;

export const RADAR_AUTO_FINALIZE_AI_COST = `+ até ${RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS} chamadas de IA para organizar o artigo-modelo`;

/** O rótulo curto do botão que dispara a coleta (ou a análise, no Google). */
export const radarAutoFinalizeButtonLabel = (label: string) => `${label} · e finaliza (+ até ${RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS} chamadas de IA)`;

/**
 * O BOTÃO MANUAL DE FINALIZAR TAMBÉM DIZ A IA — em qualquer perfil.
 *
 * Finalizar inclui organizar o artigo-modelo da SERP (D7). O botão manual de
 * YouTube e Amazon passa a encadear a mesma organização que o do Google, e o
 * rótulo diz isso antes do clique.
 */
export const radarFinalizeWithAiLabel = (label: string) => `${label} · inclui até ${RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS} chamadas de IA`;

/**
 * 2026-10-09 · O QUE O FINALIZAR MANUAL DO YOUTUBE E DA AMAZON FAZ — dito antes do clique.
 *
 * O clique congela pela MESMA rotina do automático, e a regra do Google vale
 * nos dois caminhos: a consulta que falhou e o apoio do Google que falhou ficam
 * escritos na fotografia como limitação. O ⓘ diz isso e o custo da IA.
 */
export function radarProfileFinalizeNote(profile: "YOUTUBE" | "AMAZON"): string {
  const consulta = profile === "AMAZON" ? "consulta da Amazon" : "consulta do YouTube";
  return `Congela a investigação como está: ${consulta} que falhou e apoio do Google que falhou ficam registrados como limitação na fotografia. Em seguida a IA organiza o artigo-modelo da SERP (${RADAR_AUTO_FINALIZE_AI_COST}).`;
}

/**
 * A explicação completa, para o ⓘ ou a linha sob o botão — YouTube e Amazon.
 *
 * 2026-10-02 · "coleta do apoio": repetir o apoio do Google também encadeia o
 * automático (YouTube e Amazon). Todo botão que pode terminar em congelamento e
 * IA diz isso antes do clique, não só o da coleta principal.
 *
 * ====== 2026-10-09 · A REGRA DO GOOGLE, AGORA NOS DOIS PERFIS ======
 *
 * Regra do dono: o processo do piloto substitui o antigo. A nota antiga
 * ("ao terminar sem pendência… com pendência, nada congela") chamava de
 * pendência a consulta que falhou e o apoio que falhou; agora as duas viram
 * limitação registrada e a investigação finaliza assim mesmo. A lista de
 * paradas é a de `radarProfileAutoFinalizeDecision`, não uma versão menor; na
 * Amazon, a coleta também analisa sozinha antes de congelar (sem chamada paga).
 */
export function radarAutoFinalizeStartNote(etapa: "coleta" | "análise" | "coleta do apoio", profile: "YOUTUBE" | "AMAZON"): string {
  const encadeia = profile === "AMAZON" && etapa !== "análise"
    ? `a ${etapa} também segue sozinha: analisa (sem chamada paga), finaliza a investigação e a IA organiza o artigo-modelo da SERP`
    : `a ${etapa} também finaliza a investigação e a IA organiza o artigo-modelo da SERP`;
  const paradas = profile === "AMAZON"
    ? "coleta ainda em andamento ou sem nenhum produto; apoio do Google sem gravação confirmada; nenhum produto da coleta compatível com o alvo declarado (shortlist elegível vazia); configuração do alvo que não corresponde à coleta; gravação ou releitura do servidor não confirmadas"
    : "coleta ainda em andamento ou sem nenhum vídeo; apoio do Google sem gravação confirmada; gravação ou releitura do servidor não confirmadas";
  const consulta = profile === "AMAZON" ? "Consulta da Amazon" : "Consulta do YouTube";
  return `Ao terminar, ${encadeia} (${RADAR_AUTO_FINALIZE_AI_COST}). ${consulta} que falhou e apoio do Google que falhou viram limitação registrada, e a investigação finaliza assim mesmo. Com pendência, nada congela — e pendência é só: ${paradas}. A tela diz por quê e onde continuar.`;
}

/**
 * ====== 2026-10-08 · O GOOGLE TERMINA A FASE 1 SOZINHO — decisão do dono ======
 *
 * "Ele já teria que ter feito isso de forma automática sem importar os
 * custos." A análise do Google deixou de parar por amostra insuficiente e por
 * consulta auxiliar que falhou: as duas viram limitação registrada no pacote
 * congelado, como no botão manual. Página que fica sem desfecho é lida de novo
 * uma vez. Só param o que pede decisão humana ou não tem o que congelar.
 * 2026-10-09 · YouTube e Amazon seguem a mesma regra, com a nota deles
 * (`radarAutoFinalizeStartNote(etapa, perfil)`).
 */
export function radarGoogleAutoFinalizeStartNote(): string {
  /*
   * 2026-10-08 · a lista de paradas é a de `radarGoogleAutoFinalizeDecision` e
   * do automático (`finalizarGoogleSemPendencia`), não uma versão menor: o ⓘ
   * prometia três paradas, e o automático também para no que pede pesquisa
   * nova, na página que segue sem desfecho e na releitura que não veio.
   */
  return `Ao terminar, a análise também finaliza a investigação e a IA organiza o artigo-modelo da SERP (${RADAR_AUTO_FINALIZE_AI_COST}). Página sem acesso, amostra insuficiente e consulta auxiliar que falhou não seguram: a investigação finaliza com a limitação registrada. Página que ficar sem desfecho é lida de novo uma vez antes de decidir. Param: a intenção da SERP em conflito com a declarada; nenhuma página lida; o que pede pesquisa nova (fundamento do artigo mudado, consulta paga ainda faltando); página que segue sem desfecho depois da leitura extra; e a gravação ou a releitura do servidor não confirmadas — e a tela diz por quê e onde continuar.`;
}

/**
 * Quando o automático parou: o motivo e o caminho manual, na mesma frase.
 * `manualLabel` nulo quando a tela não tem, naquele estado, botão que resolva —
 * a frase não promete um botão que não está lá.
 *
 * 2026-10-08 · `area` diz ONDE está o botão. "Revise e use…" deixava o dono
 * perguntando "vou revisar onde?" — e o botão nomeado nem era o da tela.
 */
export function radarAutoFinalizePendingNotice(reason: string, manualLabel: string | null, area?: string): string {
  const motivo = reason.trim().replace(/[.;:]?$/, ".");
  /* "A coleta…" vira "a coleta…" depois dos dois-pontos; sigla ("SERP…") fica como está. */
  const frase = /^[A-ZÀ-Ý][a-zà-ÿ ]/.test(motivo) ? `${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}` : motivo;
  if (manualLabel && area) return `Não finalizou sozinha: ${frase} Para continuar, na área ${area}, botão "${manualLabel}".`;
  return manualLabel
    ? `Não finalizou sozinha: ${frase} Revise e use "${manualLabel}" quando decidir.`
    : `Não finalizou sozinha: ${frase}`;
}

/** Quando congelou: diz que foi sozinha e que a IA vem depois — e que a falha dela não desfaz nada. */
export const RADAR_AUTO_FINALIZE_DONE_NOTICE =
  "Finalizada sozinha, sem pendência. A IA está organizando o artigo-modelo da SERP; se ela falhar, a investigação continua finalizada.";

/**
 * 2026-10-08 · Congelou COM limitação declarada (amostra insuficiente,
 * consulta auxiliar que falhou): a frase diz qual, em vez de "sem pendência".
 * Sem limitação, é exatamente `RADAR_AUTO_FINALIZE_DONE_NOTICE`.
 */
export function radarAutoFinalizeDoneNotice(limitations: readonly string[]): string {
  const ditas = limitations.map(item => item.trim().replace(/[.;:]+$/, "")).filter(Boolean);
  if (!ditas.length) return RADAR_AUTO_FINALIZE_DONE_NOTICE;
  return `Finalizada sozinha com limitação registrada: ${ditas.join("; ")}. A IA está organizando o artigo-modelo da SERP; se ela falhar, a investigação continua finalizada.`;
}

/**
 * O BOTÃO DA FASE 1 QUE ENCADEIA O CONGELAMENTO DIZ ISSO — Google.
 *
 * No Google, quem termina a investigação é a análise da concorrência: é nela
 * que o automático encadeia o FINALIZE. O rótulo e o ⓘ do botão de análise
 * dizem o custo; o do START diz o que vem depois dele. Ação, id e handler não
 * mudam — só o texto.
 */
export function radarPhase1WithAutoFinalize<T extends { id: string; label: string; info: string | null }>(acao: T, mode: RadarPrimarySearchMode = "WEB"): T {
  /*
   * 2026-10-08 · a nota do Google diz a regra dele. O mesmo botão da Fase 1
   * mostra "Iniciar Pesquisa YouTube/Amazon", e lá vale a nota do perfil. O
   * modo é o da ação (o do registro, ou o escolhido); sem ele, Google.
   *
   * 2026-10-09 · YouTube e Amazon deixaram a D9: consulta e apoio que falham
   * viram limitação registrada, como no Google. A nota do perfil diz isso e as
   * paradas próprias dele (na Amazon, shortlist vazia e alvo que não
   * corresponde à coleta).
   */
  const nota = mode === "WEB" ? radarGoogleAutoFinalizeStartNote() : radarAutoFinalizeStartNote("análise", mode);
  if (acao.id === "ANALYZE_COMPETITION") {
    return { ...acao, label: radarAutoFinalizeButtonLabel(acao.label), info: [acao.info, nota].filter(Boolean).join(" ") };
  }
  if (acao.id === "START_RESEARCH") {
    return { ...acao, info: [acao.info, `Depois dela vem a análise da concorrência. ${nota}`].filter(Boolean).join(" ") };
  }
  return acao;
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
