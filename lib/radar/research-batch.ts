/**
 * ===== 2026-10-13 · "PESQUISAR E FINALIZAR (N ARTIGOS)" — O BOTÃO DO ARTIGO, EM LOTE =====
 *
 * Achado da auditoria do fluxo: a investigação era por artigo — abrir,
 * "Iniciar Pesquisa Google", "Analisar concorrência · e finaliza" — cerca de
 * três cliques por artigo, vinte e quatro num Silo de oito. E a barra de lote
 * ainda oferecia o processo antigo (pautas, relatório local, revisão de SERP um
 * a um, especialista por Telegram).
 *
 * Regra do piloto (dono, 2026-10-09): um caminho só, sem processo paralelo. Por
 * isso este módulo NÃO pesquisa nada. Ele decide, para cada artigo da seleção,
 * qual é a próxima ação da Fase 1 — a MESMA autoridade que monta o botão do
 * artigo (`radarPhase1Action`, entregue pronta em `phase1`) e o MESMO mapa que
 * escolhe o handler (`RADAR_PHASE1_HANDLER`) — e manda a tela executar o
 * handler do botão. O que o lote acrescenta é só o que a pessoa fazia à mão:
 * abrir o próximo artigo e clicar de novo.
 *
 * TRÊS TRAVAS QUE O LOTE TEM E O CLIQUE NÃO PRECISA:
 *
 *   1. CUSTO DITO ANTES, UMA VEZ. A prévia soma o teto do lote — chamadas
 *      DataForSEO (cache primeiro; SERP principal já gravada é reaproveitada) e
 *      chamadas de IA do artigo-modelo — e nada roda sem `confirmed`.
 *   2. NADA É PAGO DUAS VEZES NO MESMO LOTE. Um artigo inicia a pesquisa no
 *      máximo uma vez; se a Fase 1 voltar a pedir pesquisa (refazer, completar
 *      de novo), o lote para naquele artigo e diz por quê.
 *   3. O QUE É DECISÃO HUMANA NÃO É TOMADO EM LOTE. Intenção da SERP em
 *      conflito com a declarada pede a decisão da pessoa antes de congelar (a
 *      mesma parada do automático do Google); "Refazer" depois de uma pesquisa
 *      que não achou página analisável é pesquisa paga nova — decisão do artigo.
 *
 * A recusa de um artigo nunca aborta o lote: o artigo seguinte segue.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import type { RadarPhase1Action } from "./serp-phase1.ts";
import { RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS, RADAR_PHASE1_HANDLER, type RadarOperationalActionId } from "./operational-actions.ts";
import { RADAR_SERP_RECOLLECT_CALLS } from "./serp/lens-set.ts";

/** A Fase 1 como a tela a resolveu para o artigo — o que monta o botão. */
export type RadarResearchBatchPhase1 = Pick<RadarPhase1Action, "id" | "enabled" | "label" | "blockedReason" | "hint">;

/** O que a tela sabe de um artigo da seleção, na hora da prévia. */
export type RadarResearchBatchCandidate = {
  articleId: string;
  title: string;
  /** A investigação do Google já está congelada (finalizada). */
  finalized: boolean;
  /** O modo efetivo do artigo. O lote é do Google, a base de todo artigo. */
  mode: string;
  /** A Fase 1 do artigo; nula quando o contexto dele não foi resolvido. */
  phase1: RadarResearchBatchPhase1 | null;
  /** A SERP principal já está paga e gravada (`radarCanonicalReusePlan`). */
  canonicalReusable: boolean;
  /** Consultas auxiliares que a pesquisa executaria (as que faltam, ou as do plano). */
  auxiliaryToRun: number;
  /** Nível da suficiência: CONFLICTING_SEARCH_INTENT é decisão humana. */
  sufficiencyLevel?: string | null;
  sufficiencyHeadline?: string | null;
  /**
   * 2026-10-18 · O artigo-modelo da investigação vigente, quando a tela já
   * sabe: "APPROVED" (concluído nesta sessão) ou "MISSING" (o envio recusou
   * por falta dele). Ausente/nulo: a tela não sabe, e quem decide é o servidor
   * ("só se faltar" — quem já tem não paga).
   */
  articleBlueprint?: "APPROVED" | "MISSING" | null;
};

export type RadarResearchBatchPlanItem =
  | {
    kind: "RUN";
    articleId: string;
    title: string;
    /** O primeiro passo — o handler do botão que a tela mostra agora. */
    firstStep: RadarOperationalActionId;
    /** O lote pode iniciar (pagar) a pesquisa deste artigo uma vez. */
    startsResearch: boolean;
    /** Teto DataForSEO deste artigo: 4 lentes por consulta, cache primeiro. */
    serpCallsCeiling: number;
    /** Teto de IA do artigo-modelo (só se faltar). */
    aiCallsCeiling: number;
  }
  /**
   * 2026-10-18 · Já finalizado, sem artigo-modelo concluído conhecido: o lote
   * NÃO pesquisa (nada pago no DataForSEO) e só organiza o artigo-modelo, pelo
   * mesmo pedido "só se faltar" do botão do artigo.
   */
  | { kind: "BLUEPRINT"; articleId: string; title: string; aiCallsCeiling: number }
  | { kind: "SKIP_FINALIZED"; articleId: string; title: string; reason: string }
  | { kind: "REFUSED"; articleId: string; title: string; reason: string };

export type RadarResearchBatchPlan = {
  items: RadarResearchBatchPlanItem[];
  run: Array<Extract<RadarResearchBatchPlanItem, { kind: "RUN" }>>;
  /** 2026-10-18 · Os finalizados que só organizam o artigo-modelo. */
  blueprint: Array<Extract<RadarResearchBatchPlanItem, { kind: "BLUEPRINT" }>>;
  skipped: Array<Extract<RadarResearchBatchPlanItem, { kind: "SKIP_FINALIZED" }>>;
  refused: Array<Extract<RadarResearchBatchPlanItem, { kind: "REFUSED" }>>;
  serpCallsCeiling: number;
  aiCallsCeiling: number;
};

const CONFLITO_DE_INTENCAO = "CONFLICTING_SEARCH_INTENT";

export const RADAR_RESEARCH_BATCH_FINALIZED_REASON = "Já finalizado e com o artigo-modelo concluído: não é pesquisado nem pago de novo.";

function conflitoDeIntencao(headline: string | null | undefined): string {
  return `${headline || "Intenção da SERP em conflito com a declarada"}: a intenção observada na SERP pede a sua decisão antes de congelar. Abra o artigo e decida em Pesquisa.`;
}

/**
 * A PRÉVIA DO LOTE — quem roda, quem é pulado, quem é recusado, e o teto.
 *
 * Nenhum número fixo: o teto de cada artigo vem do plano dele (consulta
 * central só quando não está gravada; auxiliares que faltam), vezes as quatro
 * lentes que cada consulta pode pagar no pior caso.
 */
export function planRadarResearchBatch(candidates: readonly RadarResearchBatchCandidate[]): RadarResearchBatchPlan {
  const vistos = new Set<string>();
  const items: RadarResearchBatchPlanItem[] = [];
  for (const artigo of candidates) {
    if (!artigo.articleId || vistos.has(artigo.articleId)) continue;
    vistos.add(artigo.articleId);
    const base = { articleId: artigo.articleId, title: artigo.title };
    /*
     * 2026-10-18 (dono) · o "Organizar o artigo-modelo (N)" que era botão solto
     * da barra entrou aqui: o finalizado sem artigo-modelo concluído conhecido
     * não é mais pulado — só o artigo-modelo é organizado, sem pesquisa paga.
     */
    if (artigo.finalized) {
      items.push(artigo.articleBlueprint === "APPROVED"
        ? { kind: "SKIP_FINALIZED", ...base, reason: RADAR_RESEARCH_BATCH_FINALIZED_REASON }
        : { kind: "BLUEPRINT", ...base, aiCallsCeiling: RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS });
      continue;
    }
    if (artigo.mode !== "WEB") {
      items.push({ kind: "REFUSED", ...base, reason: "Este artigo está numa pesquisa de YouTube ou Amazon: o lote é da pesquisa Google. Siga pelo botão do artigo." });
      continue;
    }
    const fase = artigo.phase1;
    if (!fase) { items.push({ kind: "REFUSED", ...base, reason: "O contexto do artigo ainda não foi resolvido; não há o que pesquisar." }); continue; }
    const passo = RADAR_PHASE1_HANDLER[fase.id];
    if (!passo || !fase.enabled) {
      items.push({ kind: "REFUSED", ...base, reason: fase.blockedReason || fase.hint || `"${fase.label}" não está disponível agora.` });
      continue;
    }
    if (fase.blockedReason) {
      items.push({ kind: "REFUSED", ...base, reason: `${fase.blockedReason} "${fase.label}" é pesquisa paga nova: decisão do artigo, pelo botão dele.` });
      continue;
    }
    if (passo === "FINALIZE" && artigo.sufficiencyLevel === CONFLITO_DE_INTENCAO) {
      items.push({ kind: "REFUSED", ...base, reason: conflitoDeIntencao(artigo.sufficiencyHeadline) });
      continue;
    }
    const iniciaPesquisa = passo === "START";
    const consultas = iniciaPesquisa ? (artigo.canonicalReusable ? 0 : 1) + Math.max(0, Math.trunc(artigo.auxiliaryToRun)) : 0;
    items.push({
      kind: "RUN",
      ...base,
      firstStep: passo,
      startsResearch: iniciaPesquisa,
      serpCallsCeiling: consultas * RADAR_SERP_RECOLLECT_CALLS,
      aiCallsCeiling: RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS,
    });
  }
  const run = items.filter((item): item is Extract<RadarResearchBatchPlanItem, { kind: "RUN" }> => item.kind === "RUN");
  const blueprint = items.filter((item): item is Extract<RadarResearchBatchPlanItem, { kind: "BLUEPRINT" }> => item.kind === "BLUEPRINT");
  return {
    items,
    run,
    blueprint,
    skipped: items.filter((item): item is Extract<RadarResearchBatchPlanItem, { kind: "SKIP_FINALIZED" }> => item.kind === "SKIP_FINALIZED"),
    refused: items.filter((item): item is Extract<RadarResearchBatchPlanItem, { kind: "REFUSED" }> => item.kind === "REFUSED"),
    serpCallsCeiling: run.reduce((soma, item) => soma + item.serpCallsCeiling, 0),
    aiCallsCeiling: [...run, ...blueprint].reduce((soma, item) => soma + item.aiCallsCeiling, 0),
  };
}

/** 2026-10-18 · O "i" ao lado do botão: para que serve e como usar. */
export const RADAR_RESEARCH_BATCH_HINT = "Para os artigos selecionados, em série e um por vez: pesquisa no Google o que falta (cache primeiro), analisa a concorrência e finaliza; e organiza o artigo-modelo da SERP que faltar — inclusive dos já finalizados, sem pesquisar de novo. O custo (DataForSEO e IA) é dito na prévia, e nada roda antes de \"Confirmar e pesquisar\". Quem já está finalizado e com o artigo-modelo concluído é pulado, sem custo.";

/** O rótulo do botão da barra de lote: a ação e quantos artigos ela vai pesquisar. */
export function radarResearchBatchButtonLabel(plan: Pick<RadarResearchBatchPlan, "run"> & Partial<Pick<RadarResearchBatchPlan, "blueprint">>): string {
  const n = plan.run.length + (plan.blueprint?.length || 0);
  return `Pesquisar e finalizar (${n} artigo${n === 1 ? "" : "s"})`;
}

/** A prévia que a pessoa confirma: o que roda, o que é pulado, o que é recusado e o teto. */
export function radarResearchBatchConfirmation(plan: RadarResearchBatchPlan): string[] {
  const linhas: string[] = [];
  const n = plan.run.length;
  linhas.push(`${n} artigo(s) seguem, em série, um por vez, pela MESMA sequência do botão do artigo: "Iniciar Pesquisa Google" (quando falta) e "Analisar concorrência · e finaliza". Cada artigo termina finalizado e com o artigo-modelo da SERP organizado.`);
  linhas.push(`DataForSEO: no pior caso, até ${plan.serpCallsCeiling} chamada(s) — cache primeiro, nas 4 lentes: lente válida no cache não é paga, e a SERP principal já gravada é reaproveitada sem nova cobrança.`);
  linhas.push(`IA: até ${plan.aiCallsCeiling} chamada(s) para organizar o artigo-modelo (até ${RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS} por artigo, só se faltar; um artigo por vez). A leitura das páginas da concorrência não consulta o buscador.`);
  if (plan.blueprint.length) linhas.push(`${plan.blueprint.length} já finalizado(s) sem artigo-modelo: só o artigo-modelo é organizado (+ até ${RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS} chamadas de IA cada), sem pesquisa paga de novo; quem já tiver o da investigação vigente não paga.`);
  if (plan.skipped.length) linhas.push(`${plan.skipped.length} já finalizado(s) com o artigo-modelo concluído: pulado(s), sem custo.`);
  for (const item of plan.refused) linhas.push(`Fora do lote — "${item.title}": ${item.reason}`);
  linhas.push("Um artigo que parar não para os outros: o motivo fica escrito, e no fim a plataforma relê cada artigo no servidor para confirmar o que ficou finalizado.");
  return linhas;
}

/* ================================ a execução ================================ */

/** O que a tela mostra do artigo agora (depois do último passo). */
export type RadarResearchBatchRead = {
  finalized: boolean;
  phase1: RadarResearchBatchPhase1 | null;
  sufficiencyLevel?: string | null;
  sufficiencyHeadline?: string | null;
};

export type RadarResearchBatchItemStatus = "QUEUED" | "RUNNING" | "FINALIZED" | "SKIPPED" | "REFUSED";

export type RadarResearchBatchItemProgress = {
  articleId: string;
  title: string;
  status: RadarResearchBatchItemStatus;
  /** O passo em curso ou o último executado. */
  step: RadarOperationalActionId | null;
  reason: string | null;
  steps: RadarOperationalActionId[];
};

export type RadarResearchBatchProgress = {
  active: boolean;
  items: RadarResearchBatchItemProgress[];
  /** Posição do artigo em curso entre os que rodam (1-based); 0 fora do laço. */
  position: number;
  total: number;
};

export type RadarResearchBatchResult = {
  started: boolean;
  items: RadarResearchBatchItemProgress[];
};

export const RADAR_RESEARCH_BATCH_STEP_LABEL: Record<RadarOperationalActionId, string> = {
  START: "pesquisando no Google",
  ANALYZE: "analisando a concorrência e finalizando",
  FINALIZE: "finalizando",
  RESET: "zerando",
};

const PASSOS_POR_ARTIGO = 6;

/**
 * O LAÇO DO LOTE.
 *
 * `open` abre o artigo na tela e espera o render dele; `read` devolve a Fase 1
 * que a tela resolveu depois do último passo; `run` dispara o handler do botão
 * (o mesmo que o clique dispara). Sem `confirmed`, nada é aberto nem executado.
 */
export async function runRadarResearchBatch(input: {
  plan: RadarResearchBatchPlan;
  confirmed: boolean;
  open: (articleId: string) => Promise<boolean>;
  read: (articleId: string) => RadarResearchBatchRead | null;
  run: (articleId: string, step: RadarOperationalActionId) => Promise<void>;
  /** A última frase que a tela disse — o motivo quando um passo não avançou. */
  lastMessage?: () => string | null;
  onProgress?: (progress: RadarResearchBatchProgress) => void;
  maxStepsPerArticle?: number;
  /**
   * 2026-10-18 · Organiza o artigo-modelo dos finalizados que só precisam dele
   * (`plan.blueprint`), em série, pelo mesmo pedido do botão do artigo ("só se
   * faltar"). Sem ele, esses artigos param com o motivo.
   */
  organizeBlueprints?: (articleIds: string[]) => Promise<{ done: readonly string[]; failed: ReadonlyArray<{ articleId: string; message: string }> }>;
}): Promise<RadarResearchBatchResult> {
  const itens: RadarResearchBatchItemProgress[] = input.plan.items.map(item => ({
    articleId: item.articleId,
    title: item.title,
    status: item.kind === "RUN" || item.kind === "BLUEPRINT" ? "QUEUED" : item.kind === "SKIP_FINALIZED" ? "SKIPPED" : "REFUSED",
    step: null,
    reason: item.kind === "RUN" || item.kind === "BLUEPRINT" ? null : item.reason,
    steps: [],
  }));
  const soArtigoModelo = input.plan.blueprint || [];
  if (!input.confirmed || (!input.plan.run.length && !soArtigoModelo.length)) return { started: false, items: itens };

  const limite = input.maxStepsPerArticle ?? PASSOS_POR_ARTIGO;
  const total = input.plan.run.length + soArtigoModelo.length;
  let posicao = 0;
  const emitir = (ativo: boolean) => input.onProgress?.({ active: ativo, items: itens.map(item => ({ ...item, steps: [...item.steps] })), position: ativo ? posicao : 0, total });
  const ultimaFrase = () => (input.lastMessage?.() || "").trim();

  for (const planejado of input.plan.run) {
    posicao += 1;
    const item = itens.find(atual => atual.articleId === planejado.articleId)!;
    const recusar = (motivo: string) => { item.status = "REFUSED"; item.reason = motivo; };
    item.status = "RUNNING";
    emitir(true);
    try {
      if (!(await input.open(planejado.articleId))) {
        recusar("O artigo não abriu na tela a tempo; nada foi executado nele.");
        continue;
      }
      const assinaturas = new Set<string>();
      let iniciou = false;
      let decidido = false;
      for (let passoNumero = 0; passoNumero < limite && !decidido; passoNumero += 1) {
        const lido = input.read(planejado.articleId);
        if (!lido) { recusar("O artigo saiu da tela ou o contexto dele não foi resolvido."); decidido = true; break; }
        if (lido.finalized) { item.status = "FINALIZED"; item.reason = null; decidido = true; break; }
        const fase = lido.phase1;
        const passo = fase ? RADAR_PHASE1_HANDLER[fase.id] : null;
        if (!fase || !passo || !fase.enabled) {
          recusar([ultimaFrase(), fase?.blockedReason || fase?.hint || "A Fase 1 não oferece ação agora."].filter(Boolean).join(" "));
          decidido = true; break;
        }
        if (fase.blockedReason) {
          recusar(`${fase.blockedReason} "${fase.label}" é pesquisa paga nova: decisão do artigo, pelo botão dele.`);
          decidido = true; break;
        }
        if (passo === "START" && (iniciou || !planejado.startsResearch)) {
          recusar(`A Fase 1 voltou a pedir "${fase.label}". No lote, nenhum artigo é pesquisado (pago) duas vezes: continue pelo botão do artigo.${ultimaFrase() ? ` Última mensagem: ${ultimaFrase()}` : ""}`);
          decidido = true; break;
        }
        if (passo === "FINALIZE" && lido.sufficiencyLevel === CONFLITO_DE_INTENCAO) {
          recusar(conflitoDeIntencao(lido.sufficiencyHeadline));
          decidido = true; break;
        }
        const assinatura = [fase.id, fase.label, fase.hint || ""].join("|");
        if (assinaturas.has(assinatura)) {
          recusar(`"${fase.label}" não avançou.${ultimaFrase() ? ` ${ultimaFrase()}` : ""}`);
          decidido = true; break;
        }
        assinaturas.add(assinatura);
        if (passo === "START") iniciou = true;
        item.step = passo;
        item.steps.push(passo);
        emitir(true);
        await input.run(planejado.articleId, passo);
      }
      if (!decidido) {
        const lido = input.read(planejado.articleId);
        if (lido?.finalized) { item.status = "FINALIZED"; item.reason = null; }
        else recusar(`O artigo não chegou a finalizar em ${limite} passos.${ultimaFrase() ? ` ${ultimaFrase()}` : ""}`);
      }
    } catch (error) {
      recusar(error instanceof Error && error.message ? error.message : "O passo falhou sem mensagem.");
    } finally {
      emitir(true);
    }
  }
  /* 2026-10-18 · Depois das pesquisas, os finalizados que só precisam do artigo-modelo. */
  if (soArtigoModelo.length) {
    const ids = soArtigoModelo.map(item => item.articleId);
    const desteGrupo = itens.filter(item => ids.includes(item.articleId));
    for (const item of desteGrupo) item.status = "RUNNING";
    posicao = total;
    emitir(true);
    try {
      if (!input.organizeBlueprints) throw new Error("O artigo-modelo não pôde ser organizado por este lote.");
      const resultado = await input.organizeBlueprints(ids);
      for (const item of desteGrupo) {
        const falha = resultado.failed.find(atual => atual.articleId === item.articleId);
        if (falha) { item.status = "REFUSED"; item.reason = `Artigo-modelo: ${falha.message}`; }
        else if (resultado.done.includes(item.articleId)) { item.status = "FINALIZED"; item.reason = null; }
        else { item.status = "REFUSED"; item.reason = "O artigo-modelo não foi confirmado."; }
      }
    } catch (error) {
      for (const item of desteGrupo) { item.status = "REFUSED"; item.reason = error instanceof Error && error.message ? error.message : "O artigo-modelo falhou sem mensagem."; }
    }
  }
  emitir(false);
  return { started: true, items: itens };
}

/**
 * A RELEITURA DO FIM — "finalizado" só com o servidor dizendo.
 *
 * O laço decide pelo que a tela mostra; o resumo decide pelo que o servidor
 * devolveu na releitura. O artigo que a tela deu como finalizado e a releitura
 * não confirmou volta como recusado, com o motivo.
 */
export function radarResearchBatchConfirmReadback(
  items: readonly RadarResearchBatchItemProgress[],
  readback: Readonly<Record<string, { confirmed: boolean; finalized: boolean; reason?: string | null }>>,
): RadarResearchBatchItemProgress[] {
  return items.map(item => {
    if (item.status !== "FINALIZED") return item;
    const lido = readback[item.articleId];
    if (lido?.confirmed && lido.finalized) return item;
    return {
      ...item,
      status: "REFUSED" as const,
      reason: lido?.confirmed
        ? "A tela mostrou finalizado, mas a releitura do servidor não encontrou a investigação congelada."
        : `A releitura do servidor não foi confirmada${lido?.reason ? ` (${lido.reason})` : ""}: abra o artigo para conferir.`,
    };
  });
}

/** O aviso do fim do lote. */
export function radarResearchBatchSummary(
  items: readonly RadarResearchBatchItemProgress[],
  blueprint: { done: number; failed: number } | null = null,
): string {
  const finalizados = items.filter(item => item.status === "FINALIZED").length;
  const pulados = items.filter(item => item.status === "SKIPPED").length;
  const recusados = items.filter(item => item.status === "REFUSED");
  const partes = [`Pesquisar e finalizar: ${finalizados} finalizado(s) e confirmado(s) na releitura do servidor`];
  if (pulados) partes.push(`${pulados} já finalizado(s), pulado(s) sem custo`);
  if (recusados.length) partes.push(`${recusados.length} parado(s) — ${recusados.slice(0, 3).map(item => `"${item.title}": ${item.reason || "sem motivo informado"}`).join(" · ")}${recusados.length > 3 ? ` · e mais ${recusados.length - 3}` : ""}`);
  if (blueprint && (blueprint.done || blueprint.failed)) {
    partes.push(blueprint.failed
      ? `artigo-modelo: ${blueprint.done} concluído(s) e ${blueprint.failed} com falha (a investigação continua finalizada; "Pesquisar e finalizar" na barra de lote organiza só os que faltam)`
      : `artigo-modelo: ${blueprint.done} concluído(s)`);
  }
  return `${partes.join("; ")}.`;
}
