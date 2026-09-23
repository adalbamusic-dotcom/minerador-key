/**
 * AS QUATRO LENTES NA SERP DO ARQUITETO — pedido, plano de chamadas pagas,
 * portão de datas e marcador de lentes.
 *
 * Adendo `docs/04-arquiteto/propostas/adendo-quatro-lentes-arquiteto-2026-09-23.md`,
 * itens A3 a A6 e A8. Diretriz do usuário (2026-09-23): "utilizar as 4 lentes em
 * todas as áreas e em todos os processos da plataforma", "processar de maneira
 * inteligente, com o fim de obter dados precisos"; depois: "pode continuar em
 * todas, Arquiteto, radar, e redator".
 *
 * Três regras que este arquivo sustenta:
 *
 *   1. CHAMADA PAGA É EXPLÍCITA (AGENTS.md §7). Antes de pagar, a rota devolve
 *      o PLANO — quantas consultas faltam em cada lente e quanto isso custa — e
 *      só paga até o número que a pessoa autorizou. Se o cache mudou entre o
 *      plano e a execução e o plano cresceu, nada é pago.
 *   2. NENHUMA RECOLETA AUTOMÁTICA. Lentes coletadas com mais de
 *      `SERP_LENS_DATES_DIVERGE_DAYS` dias de diferença ficam MARCADAS; a
 *      recoleta das mais antigas só acontece quando a pessoa pede.
 *   3. O MARCADOR DIZ O QUE FOI OBSERVADO. Um parecer sem o campo `lenses` é
 *      legado de uma lente só. Com o campo, ele diz quais lentes foram pedidas,
 *      quais chegaram, por que as outras faltaram e se as datas divergem.
 *
 * Domínio puro: sem storage, sem fetch, sem provider.
 */

import { z } from "zod";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  sameSerpCacheLens,
  serpCacheLensLabel,
  type SerpCacheLens,
} from "../editorial/serp-cache.ts";

/* --------------------------------- pedido --------------------------------- */

/** Os rótulos das quatro lentes do produto, na ordem de `SERP_CACHE_LENSES`. */
export const SERP_LENS_LABELS = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"] as const;
export const SerpLensLabelSchema = z.enum(SERP_LENS_LABELS);
export type SerpLensLabel = z.infer<typeof SerpLensLabelSchema>;

export function serpLensFromLabel(label: SerpLensLabel): SerpCacheLens {
  const lens = SERP_CACHE_LENSES.find(item => serpCacheLensLabel(item) === label);
  if (!lens) throw new Error(`Lente desconhecida: ${label}.`);
  return lens;
}

/** A lente mobile do pedido legado `device: "mobile"`: android, declarado. */
const LEGACY_MOBILE_LENS: SerpCacheLens = { device: "mobile", operatingSystem: "android" };

export type RequestedSerpLenses = {
  /** Todas as lentes desta execução, na ordem do produto. */
  lenses: SerpCacheLens[];
  /**
   * A lente lida em CORPO: gera os snapshots do parecer (e do ArticleDNA),
   * como antes das quatro lentes. É a canônica sempre que ela foi pedida.
   */
  primary: SerpCacheLens;
  /** As outras, lidas pelo digest orgânico — nunca em corpo. */
  extras: SerpCacheLens[];
  /** O pedido veio no formato antigo (`device`): uma lente só. */
  legacy: boolean;
};

/**
 * As lentes de um pedido.
 *
 * `lenses` é o formato atual; ausente, valem as quatro do produto. `device`
 * continua aceito como forma LEGADA de uma lente só, para cliente antigo:
 * `desktop` é a canônica (o eco do provider provou que desktop sem `os` já era
 * windows) e `mobile` é android. Com os dois, vale `lenses`.
 */
export function resolveRequestedSerpLenses(input: { lenses?: readonly SerpLensLabel[] | null; device?: "desktop" | "mobile" | null }): RequestedSerpLenses {
  if (input.lenses && input.lenses.length) {
    const pedidas = new Set(input.lenses);
    const lenses = SERP_CACHE_LENSES.filter(lens => pedidas.has(serpCacheLensLabel(lens) as SerpLensLabel));
    const primary = lenses.find(lens => sameSerpCacheLens(lens, SERP_CACHE_CANONICAL_LENS)) ?? lenses[0];
    return { lenses, primary, extras: lenses.filter(lens => !sameSerpCacheLens(lens, primary)), legacy: false };
  }
  if (input.device) {
    const primary = input.device === "mobile" ? LEGACY_MOBILE_LENS : SERP_CACHE_CANONICAL_LENS;
    return { lenses: [primary], primary, extras: [], legacy: true };
  }
  const lenses = [...SERP_CACHE_LENSES];
  return { lenses, primary: SERP_CACHE_CANONICAL_LENS, extras: lenses.slice(1), legacy: false };
}

/* -------------------------------- custo ---------------------------------- */

/**
 * Preço por consulta paga, em US$.
 *
 * `advanced` com profundidade 20: 0,0035, MEDIDO no campo `cost` da fixture
 * real (`tests/fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json`).
 * Profundidade 10: NÃO MEDIDO. A faixa vai de 0,002 (inferido: 0,002 + 0,75 ×
 * 0,002 = 0,0035 bate com o preço por página) a 0,0035. Por isso o plano mostra
 * faixa, nunca um valor só.
 */
export const SERP_PAID_QUERY_COST_USD = {
  canonicalDepth20: 0.0035,
  otherLensMin: 0.002,
  otherLensMax: 0.0035,
} as const;

/* ------------------------------- datas ----------------------------------- */

/**
 * Diferença máxima, em dias, entre as lentes de uma mesma keyword antes de o
 * parecer marcar "lentes de datas diferentes". Sugestão do adendo (D3): 7.
 */
export const SERP_LENS_DATES_DIVERGE_DAYS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Diferença, em dias (uma casa), entre a coleta mais antiga e a mais nova. */
export function collectedAtSpreadDays(dates: readonly (string | null | undefined)[]): number {
  const tempos = dates.map(date => Date.parse(String(date ?? ""))).filter(Number.isFinite);
  if (tempos.length < 2) return 0;
  return Math.round(((Math.max(...tempos) - Math.min(...tempos)) / DIA_MS) * 10) / 10;
}

/**
 * As coletas "antigas" de um grupo de lentes: mais de
 * `SERP_LENS_DATES_DIVERGE_DAYS` dias antes da mais nova. São as únicas que a
 * recoleta pedida pela pessoa paga de novo.
 */
export function staleByDateIndexes(dates: readonly (string | null | undefined)[]): number[] {
  const tempos = dates.map(date => Date.parse(String(date ?? "")));
  const validos = tempos.filter(Number.isFinite);
  if (validos.length < 2) return [];
  const maisNova = Math.max(...validos);
  return tempos
    .map((tempo, indice) => (Number.isFinite(tempo) && maisNova - tempo > SERP_LENS_DATES_DIVERGE_DAYS * DIA_MS ? indice : -1))
    .filter(indice => indice >= 0);
}

/* --------------------------------- plano ---------------------------------- */

/**
 * Uma consulta possível desta execução: keyword (ou texto) × lente.
 *
 * `payKey` identifica o que seria pago. A formação paga cada ocorrência (a
 * mesma keyword em dois grupos são duas chamadas, como antes do cache); a
 * territorial paga cada consulta distinta uma vez por requisição.
 */
export type SerpPlanSlot = {
  payKey: string;
  /** Agrupa as lentes da MESMA consulta para o portão de datas. */
  dateGroup: string;
  lens: SerpCacheLens;
  /** A lente lida em corpo nesta execução. */
  primary: boolean;
  /**
   * Só é paga se a Principal for ambígua (KGR leve) — entra no plano como
   * TETO, dita como condicional.
   */
  conditional: boolean;
  /**
   * `false` quando pagar não mudaria o parecer (artigo com uma busca só,
   * pergunta territorial sem comparação): a lente é lida do cache, se houver,
   * e nunca paga.
   */
  payable: boolean;
  /** A entrada que atende, pela leitura `meta`; `null` quando falta. */
  hitCollectedAt: string | null;
  missReason: string | null;
};

export type SerpPaidPlanLens = {
  lens: string;
  /** Consultas atendidas pelo cache nesta lente. */
  hits: number;
  /** Faltas que esta execução pagaria (inclui as condicionais). */
  misses: number;
  /** Das faltas, as que só são pagas se a Principal for ambígua. */
  conditionalMisses: number;
  /** Faltas que NÃO seriam pagas (sem par a comparar, ou a pessoa escolheu só o cache). */
  unpaidMisses: number;
  /** Acertos mais de 7 dias mais velhos que a lente mais nova da mesma consulta. */
  staleByDate: number;
};

export type SerpPaidPlan = {
  lenses: string[];
  perLens: SerpPaidPlanLens[];
  /** Teto de chamadas pagas desta execução. É o número que a pessoa autoriza. */
  paidQueries: number;
  primaryPaidQueries: number;
  extraPaidQueries: number;
  conditionalPaidQueries: number;
  /** Lentes antigas pelo portão de datas: só pagas se a pessoa pedir a recoleta. */
  recollectableQueries: number;
  /** Faixa ESTIMADA em US$ (profundidade 10 não medida). */
  estimatedCostUsd: { min: number; max: number };
  collectedAtSpreadDays: number;
  datesDiverge: boolean;
  payMissingExtraLenses: boolean;
  recollectStaleLenses: boolean;
  /**
   * O plano lê só `meta`: uma entrada extra gravada antes do digest aparece
   * como acerto aqui e só na execução vira "sem digest" — sem pagar nada.
   */
  digestChecked: false;
};

const arredondar = (valor: number) => Math.round(valor * 10000) / 10000;

/**
 * O plano de chamadas pagas, a partir da leitura `meta` de cada consulta.
 *
 * Não paga, não resolve credencial, não lê corpo. A mesma função roda no modo
 * `plan` e de novo na execução: é a comparação das duas que impede pagar mais
 * do que foi autorizado.
 */
export type SerpPaidPlanInput = {
  lenses: readonly SerpCacheLens[];
  slots: readonly SerpPlanSlot[];
  payMissingExtraLenses: boolean;
  recollectStaleLenses: boolean;
  /**
   * `false` quando a rota NÃO sabe recoletar (a SERP por keyword): as lentes
   * antigas continuam contadas e marcadas, mas o plano não as oferece como
   * recoletáveis — senão a prévia ofereceria um botão pago que nada faz.
   * Ausente = `true`.
   */
  recollectAvailable?: boolean;
};

/** As consultas que o plano paga, por `payKey`, e as recoletáveis. */
function selectPaidSlots(input: SerpPaidPlanInput) {
  const staleKeys = staleSlotKeys(input.slots);
  const recoletaDisponivel = input.recollectAvailable ?? true;
  const pagas = new Map<string, SerpPlanSlot>();
  const recoletaveis = new Set<string>();
  const perLens = new Map<string, SerpPaidPlanLens>(input.lenses.map(lens => [serpCacheLensLabel(lens), {
    lens: serpCacheLensLabel(lens), hits: 0, misses: 0, conditionalMisses: 0, unpaidMisses: 0, staleByDate: 0,
  }]));

  for (const slot of input.slots) {
    const linha = perLens.get(serpCacheLensLabel(slot.lens));
    if (!linha) continue;
    const pagavel = slot.payable && (slot.primary || input.payMissingExtraLenses);
    if (slot.hitCollectedAt) {
      linha.hits += 1;
      if (staleKeys.has(slot.payKey)) {
        linha.staleByDate += 1;
        if (pagavel && recoletaDisponivel) recoletaveis.add(slot.payKey);
        if (pagavel && recoletaDisponivel && input.recollectStaleLenses && !pagas.has(slot.payKey)) pagas.set(slot.payKey, slot);
      }
      continue;
    }
    if (!pagavel) {
      linha.unpaidMisses += 1;
      continue;
    }
    const jaPlanejada = pagas.get(slot.payKey);
    if (jaPlanejada) {
      /*
       * A mesma consulta em dois artigos (a lente extra é paga uma vez por
       * requisição): basta um deles precisar dela sem condição para ela deixar
       * de ser condicional.
       */
      if (jaPlanejada.conditional && !slot.conditional) {
        pagas.set(slot.payKey, slot);
        const linhaDaPlanejada = perLens.get(serpCacheLensLabel(jaPlanejada.lens));
        if (linhaDaPlanejada) linhaDaPlanejada.conditionalMisses -= 1;
      }
      continue;
    }
    pagas.set(slot.payKey, slot);
    linha.misses += 1;
    if (slot.conditional) linha.conditionalMisses += 1;
  }
  return { pagas, recoletaveis, perLens };
}

/**
 * As `payKey` que o plano paga. É a reserva do orçamento da execução: uma
 * falta PLANEJADA nunca fica sem vaga porque um acerto degradou em falta
 * noutro artigo que corre em paralelo.
 */
export function serpPaidPlanKeys(input: SerpPaidPlanInput): Set<string> {
  return new Set(selectPaidSlots(input).pagas.keys());
}

export function buildSerpPaidPlan(input: SerpPaidPlanInput): SerpPaidPlan {
  const { pagas, recoletaveis, perLens } = selectPaidSlots(input);

  const lista = [...pagas.values()];
  const primarias = lista.filter(slot => slot.primary);
  const canonicas = lista.filter(slot => sameSerpCacheLens(slot.lens, SERP_CACHE_CANONICAL_LENS));
  const outras = lista.length - canonicas.length;
  const spread = maxSpreadDays(input.slots);
  return {
    lenses: input.lenses.map(serpCacheLensLabel),
    perLens: [...perLens.values()],
    paidQueries: lista.length,
    primaryPaidQueries: primarias.length,
    extraPaidQueries: lista.length - primarias.length,
    conditionalPaidQueries: lista.filter(slot => slot.conditional).length,
    recollectableQueries: recoletaveis.size,
    estimatedCostUsd: {
      min: arredondar(canonicas.length * SERP_PAID_QUERY_COST_USD.canonicalDepth20 + outras * SERP_PAID_QUERY_COST_USD.otherLensMin),
      max: arredondar(canonicas.length * SERP_PAID_QUERY_COST_USD.canonicalDepth20 + outras * SERP_PAID_QUERY_COST_USD.otherLensMax),
    },
    collectedAtSpreadDays: spread,
    datesDiverge: spread > SERP_LENS_DATES_DIVERGE_DAYS,
    payMissingExtraLenses: input.payMissingExtraLenses,
    recollectStaleLenses: input.recollectStaleLenses,
    digestChecked: false,
  };
}

/**
 * Soma planos de lotes da mesma operação (a SERP por keyword vai em lotes de
 * keywords): uma confirmação só, com o total exato de chamadas.
 */
export function mergeSerpPaidPlans(plans: readonly SerpPaidPlan[]): SerpPaidPlan {
  if (!plans.length) throw new Error("Nenhum plano a somar.");
  const [primeiro] = plans;
  const perLens = new Map<string, SerpPaidPlanLens>();
  for (const plan of plans) {
    for (const linha of plan.perLens) {
      const atual = perLens.get(linha.lens) ?? { lens: linha.lens, hits: 0, misses: 0, conditionalMisses: 0, unpaidMisses: 0, staleByDate: 0 };
      perLens.set(linha.lens, {
        lens: linha.lens,
        hits: atual.hits + linha.hits,
        misses: atual.misses + linha.misses,
        conditionalMisses: atual.conditionalMisses + linha.conditionalMisses,
        unpaidMisses: atual.unpaidMisses + linha.unpaidMisses,
        staleByDate: atual.staleByDate + linha.staleByDate,
      });
    }
  }
  const soma = (campo: "paidQueries" | "primaryPaidQueries" | "extraPaidQueries" | "conditionalPaidQueries" | "recollectableQueries") =>
    plans.reduce((total, plan) => total + plan[campo], 0);
  const spread = Math.max(...plans.map(plan => plan.collectedAtSpreadDays));
  return {
    lenses: [...primeiro.lenses],
    perLens: [...perLens.values()],
    paidQueries: soma("paidQueries"),
    primaryPaidQueries: soma("primaryPaidQueries"),
    extraPaidQueries: soma("extraPaidQueries"),
    conditionalPaidQueries: soma("conditionalPaidQueries"),
    recollectableQueries: soma("recollectableQueries"),
    estimatedCostUsd: {
      min: arredondar(plans.reduce((total, plan) => total + plan.estimatedCostUsd.min, 0)),
      max: arredondar(plans.reduce((total, plan) => total + plan.estimatedCostUsd.max, 0)),
    },
    collectedAtSpreadDays: spread,
    datesDiverge: spread > SERP_LENS_DATES_DIVERGE_DAYS,
    payMissingExtraLenses: primeiro.payMissingExtraLenses,
    recollectStaleLenses: primeiro.recollectStaleLenses,
    digestChecked: false,
  };
}

/** As consultas cujos acertos estão mais de 7 dias atrás da lente mais nova da mesma consulta. */
export function staleSlotKeys(slots: readonly SerpPlanSlot[]): Set<string> {
  const porGrupo = new Map<string, SerpPlanSlot[]>();
  for (const slot of slots) {
    if (!slot.hitCollectedAt) continue;
    porGrupo.set(slot.dateGroup, [...(porGrupo.get(slot.dateGroup) || []), slot]);
  }
  const antigas = new Set<string>();
  for (const grupo of porGrupo.values()) {
    for (const indice of staleByDateIndexes(grupo.map(slot => slot.hitCollectedAt))) antigas.add(grupo[indice].payKey);
  }
  return antigas;
}

function maxSpreadDays(slots: readonly SerpPlanSlot[]): number {
  const porGrupo = new Map<string, string[]>();
  for (const slot of slots) {
    if (!slot.hitCollectedAt) continue;
    porGrupo.set(slot.dateGroup, [...(porGrupo.get(slot.dateGroup) || []), slot.hitCollectedAt]);
  }
  let maior = 0;
  for (const datas of porGrupo.values()) maior = Math.max(maior, collectedAtSpreadDays(datas));
  return maior;
}

/* --------------------------- o plano na tela ----------------------------- */

/** O que a pessoa escolhe ao ver o plano: é isto que vai no pedido de execução. */
export type SerpPaidPlanChoice = {
  authorizedPaidQueries: number;
  payMissingExtraLenses: boolean;
  recollectStaleLenses: boolean;
};

export type SerpPaidPlanOption = { id: "all" | "primary_only" | "recollect"; label: string; choice: SerpPaidPlanChoice };

const dolares = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * As saídas do plano, sempre com o número exato que a execução pode pagar.
 *
 *   all          — paga as faltas de todas as lentes (o teto do plano);
 *   primary_only — paga só a lente principal; as extras ficam com o cache;
 *   recollect    — paga também as lentes antigas pelo portão de datas.
 *
 * Com nada a pagar, `all` é "Validar sem pagar" e autoriza zero.
 */
export function serpPaidPlanOptions(plan: SerpPaidPlan, options: { allowPrimaryOnly?: boolean } = {}): SerpPaidPlanOption[] {
  const saidas: SerpPaidPlanOption[] = [{
    id: "all",
    label: plan.paidQueries > 0 ? `Pagar ${plan.paidQueries} chamada(s) e validar` : "Validar sem pagar",
    choice: { authorizedPaidQueries: plan.paidQueries, payMissingExtraLenses: plan.payMissingExtraLenses, recollectStaleLenses: false },
  }];
  if ((options.allowPrimaryOnly ?? true) && plan.extraPaidQueries > 0) {
    saidas.push({
      id: "primary_only",
      label: plan.primaryPaidQueries > 0 ? `Pagar só a lente principal (${plan.primaryPaidQueries})` : "Validar só com as lentes em cache",
      choice: { authorizedPaidQueries: plan.primaryPaidQueries, payMissingExtraLenses: false, recollectStaleLenses: false },
    });
  }
  if (plan.recollectableQueries > 0) {
    saidas.push({
      id: "recollect",
      label: `Recoletar as lentes antigas (pago, ${plan.paidQueries + plan.recollectableQueries})`,
      choice: { authorizedPaidQueries: plan.paidQueries + plan.recollectableQueries, payMissingExtraLenses: true, recollectStaleLenses: true },
    });
  }
  return saidas;
}

/** As frases do plano: número de chamadas, custo em faixa e datas. */
export function describeSerpPaidPlan(plan: SerpPaidPlan): { headline: string; cost: string | null; dates: string | null; conditional: string | null } {
  const headline = plan.paidQueries > 0
    ? `Até ${plan.paidQueries} chamada(s) paga(s): ${plan.primaryPaidQueries} na lente principal e ${plan.extraPaidQueries} nas lentes extras.`
    : "Nenhuma chamada paga: tudo o que esta validação lê já está no cache.";
  const cost = plan.paidQueries > 0
    ? `≈ US$ ${dolares(plan.estimatedCostUsd.min)} a ${dolares(plan.estimatedCostUsd.max)} (estimado; o preço com 10 resultados não foi medido).`
    : null;
  const conditional = plan.conditionalPaidQueries > 0
    ? `${plan.conditionalPaidQueries} delas só são pagas se a Principal de um artigo KGR leve for ambígua.`
    : null;
  const dates = plan.datesDiverge
    ? plan.recollectableQueries > 0
      ? `Lentes de datas diferentes: até ${plan.collectedAtSpreadDays} dias entre as lentes da mesma consulta. ${plan.recollectableQueries} lente(s) antiga(s) podem ser recoletadas, só se você pedir.`
      : `Lentes de datas diferentes: até ${plan.collectedAtSpreadDays} dias entre as lentes da mesma consulta. Esta ação não recoleta lentes antigas; a diferença fica marcada no que ela devolve.`
    : null;
  return { headline, cost, dates, conditional };
}

/* ----------------------------- autorização ------------------------------- */

export type SerpPaidPlanAuthorization =
  | { ok: true }
  | { ok: false; code: "PAID_PLAN_REQUIRED" | "PAID_PLAN_CHANGED"; message: string };

/**
 * A execução só paga o que foi autorizado.
 *
 * Com tudo em cache, nada é exigido. Sem autorização e com faltas, a rota
 * devolve o plano e não paga (`PAID_PLAN_REQUIRED`). Com autorização menor que
 * o plano de agora — o cache mudou entre o plano e o clique —, também não paga
 * nada (`PAID_PLAN_CHANGED`) e devolve o plano novo.
 */
export function authorizeSerpPaidPlan(plan: Pick<SerpPaidPlan, "paidQueries">, authorizedPaidQueries: number): SerpPaidPlanAuthorization {
  if (plan.paidQueries <= 0) return { ok: true };
  if (authorizedPaidQueries >= plan.paidQueries) return { ok: true };
  if (authorizedPaidQueries <= 0) {
    return { ok: false, code: "PAID_PLAN_REQUIRED", message: `Esta validação faria até ${plan.paidQueries} chamada(s) paga(s). Confirme o plano antes de pagar; nada foi pago.` };
  }
  return {
    ok: false,
    code: "PAID_PLAN_CHANGED",
    message: `O plano mudou: agora são até ${plan.paidQueries} chamada(s) paga(s), e ${authorizedPaidQueries} foram autorizadas. Nada foi pago; confira o plano novo.`,
  };
}

/**
 * O orçamento da execução: cada chamada paga consome uma unidade. Esgotado, a
 * consulta não é paga — mesmo que um acerto tenha degradado em falta depois do
 * plano. É o que garante que a rota nunca paga além do autorizado.
 */
export function createPaidQueryBudget(authorized: number, plannedKeys?: ReadonlySet<string>) {
  let usadas = 0;
  const limite = Math.max(0, Math.floor(authorized));
  /*
   * RESERVA (2026-09-23): com `plannedKeys`, cada falta planejada tem a sua
   * vaga. Uma consulta fora do plano — um acerto que degradou em falta — só
   * usa a SOBRA (autorizado menos as reservas ainda não usadas). Sem isso, num
   * lote com artigos em paralelo, a degradação de um artigo consumia a vaga
   * da falta planejada de outro, e era este que falhava.
   */
  const reservadas = new Set(plannedKeys ?? []);
  return {
    get used() { return usadas; },
    get remaining() { return limite - usadas; },
    take(payKey?: string): boolean {
      if (usadas >= limite) return false;
      if (payKey !== undefined && reservadas.has(payKey)) {
        reservadas.delete(payKey);
        usadas += 1;
        return true;
      }
      if (limite - usadas - reservadas.size <= 0) return false;
      usadas += 1;
      return true;
    },
  };
}

export class SerpPaidBudgetExhaustedError extends Error {
  readonly code = "SERP_PAID_NOT_AUTHORIZED" as const;
  constructor(message = "A consulta paga não estava no plano autorizado; nada foi pago por ela.") {
    super(message);
    this.name = "SerpPaidBudgetExhaustedError";
  }
}

/* ------------------------------- marcador -------------------------------- */

/**
 * Por que uma lente não entrou no parecer.
 *
 * `sem digest`: entrada extra gravada antes do digest; não é paga de novo sem
 * pedido. `não paga`: faltava e não foi paga — a pessoa escolheu só o cache,
 * ou o plano autorizado acabou. `sem par`: não foi lida nem paga porque só uma
 * consulta foi observada (artigo de uma busca, pergunta sem comparação) e
 * outra lente não mudaria o parecer. `falha`: paga e recusada pelo provider,
 * ou ilegível.
 */
export const SERP_LENS_MISSING_REASONS = ["sem entrada", "sem digest", "vencida", "falha", "não paga", "sem par"] as const;
export const SerpLensMissingReasonSchema = z.enum(SERP_LENS_MISSING_REASONS);
export type SerpLensMissingReason = z.infer<typeof SerpLensMissingReasonSchema>;

const PairLevelSchema = z.object({
  left: z.string().min(1),
  right: z.string().min(1),
  level: z.string().min(1),
}).strict();

export const SerpLensesMarkerSchema = z.object({
  /** Rótulos `serpCacheLensLabel`, na ordem do produto. */
  requested: z.array(z.string().min(1)).min(1),
  /** As lentes em que a consulta principal foi observada. */
  observed: z.array(z.string().min(1)),
  missing: z.array(z.object({
    lens: z.string().min(1),
    keywordId: z.string().min(1).nullable(),
    reason: SerpLensMissingReasonSchema,
    detail: z.string().min(1).optional(),
  }).strict()),
  perLens: z.array(z.object({
    lens: z.string().min(1),
    /** Consultas observadas nesta lente. */
    observedQueries: z.number().int().nonnegative(),
    oldestCollectedAt: z.string().min(1).nullable(),
    newestCollectedAt: z.string().min(1).nullable(),
    /** Formação: o veredito que esta lente sozinha daria. Territorial: a sobreposição nela. */
    verdict: z.string().min(1).nullable(),
    pairs: z.array(PairLevelSchema).optional(),
    /** Territorial: os blocos que a SERP desta lente mostrou (formatos por aparelho). */
    blocks: z.array(z.string().min(1)).optional(),
  }).strict()),
  /** "3/4": lentes cujo veredito sozinho coincide com o agregado, sobre as observadas. */
  agreement: z.string().min(1),
  collectedAtSpreadDays: z.number().nonnegative(),
  datesDiverge: z.boolean(),
  /** O que a leitura das lentes extras não vê — declarado, não escondido. */
  note: z.string().min(1).optional(),
}).strict();
export type SerpLensesMarker = z.infer<typeof SerpLensesMarkerSchema>;

/**
 * A assimetria entre a canônica e as extras, declarada no marcador: as extras
 * são lidas do digest orgânico, que não traz vídeo nem People Also Ask, e cuja
 * posição é `rank_group`. Os votos por lente comparam só dentro da mesma lente.
 */
export const SERP_LENS_DIGEST_NOTE = "Lentes extras lidas pelo digest orgânico (top 10, sem vídeo nem PAA, posição rank_group); a lente principal pelo corpo. Cada voto compara só consultas da mesma lente.";

/** "3/4". */
export const lensAgreementLabel = (agreeing: number, observed: number) => `${agreeing}/${observed}`;

/** Um resumo curto para a tela: "SERP · 4 lentes" ou "SERP · 3 de 4 lentes". */
export function describeSerpLensesMarker(marker: SerpLensesMarker | null | undefined): string | null {
  if (!marker) return null;
  const pedidas = marker.requested.length;
  const observadas = marker.observed.length;
  const base = observadas >= pedidas
    ? `SERP · ${pedidas} ${pedidas === 1 ? "lente" : "lentes"}`
    : `SERP · ${observadas} de ${pedidas} lentes`;
  // Sem comparação (pergunta territorial de uma consulta só) não há voto a concordar.
  const concordancia = observadas > 1 && marker.agreement.includes("/") ? ` · concordância ${marker.agreement}` : "";
  const datas = marker.datesDiverge ? ` · lentes de datas diferentes (${marker.collectedAtSpreadDays} dias)` : "";
  return `${base}${concordancia}${datas}`;
}

/**
 * As lentes que faltaram no parecer, com o motivo de cada uma: "mobile-ios
 * (não paga) · desktop-macos (sem digest)". Repetições do mesmo par lente ×
 * motivo (uma por keyword) viram uma entrada só. Nada faltou → `null`.
 */
export function describeSerpLensesMissing(marker: SerpLensesMarker | null | undefined): string | null {
  if (!marker?.missing.length) return null;
  const vistos = new Set<string>();
  const partes: string[] = [];
  for (const item of marker.missing) {
    const chave = `${item.lens}\u0000${item.reason}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    partes.push(`${item.lens} (${item.reason})`);
  }
  return `Lentes fora do parecer: ${partes.join(" · ")}.`;
}

/**
 * AS LENTES DA QUALIFICAÇÃO DO MINERADOR, NA MESA DO ARQUITETO (adendo A10).
 *
 * O handoff leva `lenses { observadas, concordancia }` quando a Qualificação
 * foi lida nas quatro lentes: quantas lentes a leitura usou e quantas
 * concordam, por eixo, com o rótulo que lidera. É registro, nunca força — o
 * Arquiteto não decide nada por ele. Ausente ou malformado → `null`, e a mesa
 * não mostra nada (Qualificação legada de uma lente).
 */
export function describeQualificationLenses(qualification: unknown): string | null {
  const registro = qualification && typeof qualification === "object" ? qualification as Record<string, unknown> : null;
  const lentes = registro?.lenses && typeof registro.lenses === "object" ? registro.lenses as Record<string, unknown> : null;
  const concordancia = lentes?.concordancia && typeof lentes.concordancia === "object" ? lentes.concordancia as Record<string, unknown> : null;
  const inteiro = (valor: unknown) => typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : null;
  const observadas = inteiro(lentes?.observadas);
  const intencao = inteiro(concordancia?.intent);
  const funil = inteiro(concordancia?.funnel);
  if (!observadas || intencao === null || funil === null || intencao > observadas || funil > observadas) return null;
  const pedidas = SERP_LENS_LABELS.length;
  const base = observadas >= pedidas ? `${pedidas} lentes` : `${observadas} de ${pedidas} lentes`;
  return `${base} · intenção ${lensAgreementLabel(intencao, observadas)} · funil ${lensAgreementLabel(funil, observadas)}`;
}
