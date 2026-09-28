/*
 * RESULTADOS NO MINERADOR — ação manual, opcional e paga.
 *
 * Decisão do dono de 2026-09-28 (SDD
 * `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`): a
 * SERP saiu da sequência de processos do Minerador e a primeira coleta
 * acontece no Arquiteto, aba Artigos. "Resultados" continua existindo como
 * ação manual. Como toda chamada paga da plataforma, ele mostra o plano de
 * custo antes e pede uma confirmação; e, como no Arquiteto, keyword sem volume
 * nunca é coletada: sem volume não há KGR, e a SERP dela seria dado inútil.
 *
 * Domínio puro: sem rede, sem banco.
 */

/** Custo ESTIMADO por keyword (allintitle + KD + SERP nas 4 lentes, cache primeiro). */
export const MINERADOR_RESULTS_COST_PER_KEYWORD_USD = { min: 0.025, max: 0.036 } as const;

/** Com volume = média do Google Ads finita e maior que zero (o mesmo predicado do Arquiteto). */
export function mineradorResultsHasVolume(volume: unknown): volume is number {
  return typeof volume === "number" && Number.isFinite(volume) && volume > 0;
}

export type MineradorResultsBatchPlan = {
  /** As keywords que vão ao provider (só as com volume). */
  targetIds: string[];
  /** As que ficam fora por não terem volume (nulo, zero ou ainda não medido). */
  withoutVolumeIds: string[];
  /** Teto ESTIMADO; o cache válido reduz o custo real. */
  estimatedCostUsd: { min: number; max: number };
};

export function planMineradorResultsBatch(rows: ReadonlyArray<{ id: string; volume_search?: unknown }>): MineradorResultsBatchPlan {
  const targetIds: string[] = [];
  const withoutVolumeIds: string[] = [];
  for (const row of rows) {
    if (mineradorResultsHasVolume(row.volume_search)) targetIds.push(row.id);
    else withoutVolumeIds.push(row.id);
  }
  const arredondar = (valor: number) => Math.round(valor * 1000) / 1000;
  return {
    targetIds,
    withoutVolumeIds,
    estimatedCostUsd: {
      min: arredondar(targetIds.length * MINERADOR_RESULTS_COST_PER_KEYWORD_USD.min),
      max: arredondar(targetIds.length * MINERADOR_RESULTS_COST_PER_KEYWORD_USD.max),
    },
  };
}

const dolar = (valor: number) => `US$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** O texto da confirmação: o que será pago, o custo estimado e o que fica fora. */
export function describeMineradorResultsBatchPlan(plan: MineradorResultsBatchPlan): string {
  const partes = [
    `Resultados (opcional · pago): ${plan.targetIds.length} keyword(s) com volume vão ao DataForSEO (allintitle, KD e SERP nas 4 lentes, cache primeiro).`,
    `Custo estimado: ${dolar(plan.estimatedCostUsd.min)} a ${dolar(plan.estimatedCostUsd.max)}; o cache válido reduz o valor.`,
  ];
  if (plan.withoutVolumeIds.length) {
    partes.push(`${plan.withoutVolumeIds.length} keyword(s) sem volume no Google Ads ficam fora: keyword sem volume nunca é coletada.`);
  }
  partes.push("Não é exigido para aprovar nem para enviar ao Arquiteto, que faz a primeira coleta da SERP. Confirmar a chamada paga?");
  return partes.join("\n\n");
}
