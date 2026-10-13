import { mergeSerpPaidPlans, type SerpPaidPlan, type SerpPaidPlanChoice } from "./serp-lens-plan.ts";

/**
 * "PROCESSAR ARTIGOS" NUM CLIQUE E NUM DIÁLOGO DE CUSTO (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 3, F1).
 *
 * Antes, um clique podia abrir até três diálogos pagos em sequência — SERP do
 * lote, validação e allintitle — e, quando a SERP do lote era paga, terminava
 * pedindo "clique em Processar artigos de novo". Aqui ficam as duas regras
 * puras que a tela usa:
 *
 *   1. allintitle só para o artigo com "Aplicar KGR: Sim" (ADR-020, adendo,
 *      item 5); com "não aplicável" (o padrão) nada é medido nem perguntado;
 *   2. um diálogo por clique: o primeiro plano com custo leva o allintitle
 *      junto (somado por `mergeSerpPaidPlans`); depois dele, nenhum passo do
 *      mesmo clique abre outro diálogo — o que ainda faltar (lacuna do
 *      provider) segue pelo cache e aparece no resultado. Recoletar falhas
 *      continua sendo ato separado.
 */

export type ProcessingCostAsk = (title: string, plan: SerpPaidPlan, allowPrimaryOnly?: boolean, allowCacheOnly?: boolean) => Promise<SerpPaidPlanChoice | null>;

/** O plano pede a escolha da pessoa? Sem nada a pagar nem a recoletar, não. */
export function planNeedsCostDialog(plan: Pick<SerpPaidPlan, "paidQueries" | "recollectableQueries">): boolean {
  return plan.paidQueries > 0 || plan.recollectableQueries > 0;
}

/**
 * As principais que medem allintitle neste clique: só a do artigo que aplica
 * KGR, uma vez cada, na ordem do escopo.
 */
export function allintitlePrincipalsOfProcessing<T extends { principalKeywordId: string }>(
  candidates: readonly T[],
  appliesKgr: (candidate: T) => boolean,
): string[] {
  const vistas = new Set<string>();
  const principais: string[] = [];
  for (const candidate of candidates) {
    const id = candidate.principalKeywordId;
    if (!id || vistas.has(id) || !appliesKgr(candidate)) continue;
    vistas.add(id);
    principais.push(id);
  }
  return principais;
}

const CACHE_ONLY: SerpPaidPlanChoice = { authorizedPaidQueries: 0, payMissingExtraLenses: false, recollectStaleLenses: false, cacheOnly: true };

/**
 * O diálogo único do clique. `ask` é o diálogo de sempre (`askSerpPaidPlan`);
 * `extra` é o allintitle planejado no início do clique (ou `null`).
 *
 * - o PRIMEIRO plano com custo mostra a soma com o allintitle e decide os dois;
 * - depois dessa decisão, plano com custo não abre diálogo: segue pelo cache
 *   (`cacheOnly`) quando o passo aceita, ou é cancelado sem pagar, e as
 *   consultas ficam contadas em `deferredPaidQueries` para o resultado dizer;
 * - "tentar ler o cache de novo" não conta como decisão.
 *
 * `extraChoice()` devolve a autorização do allintitle: a do diálogo somado,
 * ou — quando nenhum diálogo aconteceu — o próprio diálogo do allintitle, que
 * passa a ser o único do clique.
 */
export function createProcessingCostDialog(input: { ask: ProcessingCostAsk; extra: { title: string; plan: SerpPaidPlan } | null }) {
  let decided = false;
  let extraDecision: SerpPaidPlanChoice | null | undefined = undefined;
  let deferredPaidQueries = 0;
  const ask: ProcessingCostAsk = async (title, plan, allowPrimaryOnly = true, allowCacheOnly = false) => {
    if (decided) {
      if (!planNeedsCostDialog(plan)) return { authorizedPaidQueries: 0, payMissingExtraLenses: plan.payMissingExtraLenses, recollectStaleLenses: false };
      deferredPaidQueries += plan.paidQueries;
      return allowCacheOnly ? CACHE_ONLY : null;
    }
    const extra = input.extra && extraDecision === undefined && planNeedsCostDialog(input.extra.plan) ? input.extra : null;
    const plano = extra ? mergeSerpPaidPlans([plan, extra.plan]) : plan;
    const choice = await input.ask(extra ? `${title} + ${extra.title}` : title, plano, allowPrimaryOnly, allowCacheOnly);
    if (choice?.retryCacheRead) return choice;
    if (planNeedsCostDialog(plano)) {
      decided = true;
      if (extra) extraDecision = choice && !choice.cacheOnly ? choice : null;
    }
    return choice;
  };
  return {
    ask,
    async extraChoice(): Promise<SerpPaidPlanChoice | null> {
      if (!input.extra) return null;
      if (extraDecision !== undefined) return extraDecision;
      if (!planNeedsCostDialog(input.extra.plan)) return { authorizedPaidQueries: 0, payMissingExtraLenses: false, recollectStaleLenses: false };
      if (decided) {
        deferredPaidQueries += input.extra.plan.paidQueries;
        return null;
      }
      const choice = await input.ask(input.extra.title, input.extra.plan, false, false);
      decided = true;
      extraDecision = choice && !choice.cacheOnly ? choice : null;
      return extraDecision;
    },
    get decided() { return decided; },
    get deferredPaidQueries() { return deferredPaidQueries; },
  };
}

/**
 * O que um clique leva quando a formação muda no meio dele (a SERP do lote foi
 * paga): o allintitle já planejado e o diálogo já decidido seguem para a
 * formação refeita, sem planejar nem perguntar de novo.
 */
export type ProcessingClickContinuation = {
  principaisComKgr: string[];
  planoDoAllintitle: { title: string; plan: SerpPaidPlan } | null;
  dialogo: ReturnType<typeof createProcessingCostDialog>;
};

/** Teto do allintitle de um bloco: o que o bloco pede, nunca além do que a pessoa viu somado. */
export function allintitleBlockAuthorization(blockPaid: number, remainingCeiling: number): number {
  return Math.max(0, Math.min(blockPaid, remainingCeiling));
}
