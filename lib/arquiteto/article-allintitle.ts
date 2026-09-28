/*
 * ALLINTITLE DA PRINCIPAL DO ARTIGO — domínio puro, sem rede e sem banco.
 *
 * SDD `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`,
 * fatia A4. Desde 2026-09-28 o Minerador não mede mais o allintitle de toda
 * keyword: o Arquiteto mede UMA consulta por artigo, só da Principal, com o
 * mesmo núcleo de pedido do Minerador (`allintitle:` sem aspas, desktop,
 * profundidade 10). Antes de pagar, reaproveita, nesta ordem:
 *
 *   1. a medição do próprio Arquiteto guardada em `kgrIdentity.evidence`
 *      (mesma Principal, até 30 dias);
 *   2. a medição do Minerador (`results_allintitle` com
 *      `allintitle_measurement.measuredAt` de até 30 dias).
 *
 * "Recalcular" paga de novo, só quando o humano pede, com confirmação.
 *
 * O resultado vai para `kgrIdentity` do item de workflow da Principal — campos
 * que já existem (`resultCount`, `kgrValue`, `primaryVolume`, `evaluatedAt`,
 * `evaluatedBy`, `evidence`). O Arquiteto NUNCA escreve `results_allintitle`
 * nem `kgr_score` na linha do Minerador: seria alterar outro módulo em
 * silêncio.
 */

import { ArticleKgrIdentitySchema, type ArticleKgrIdentity } from "./contracts.ts";
import {
  ARTICLE_ALLINTITLE_EVIDENCE_KIND,
  ARTICLE_ALLINTITLE_MAX_AGE_DAYS,
  defaultNotApplicableKgrIdentity,
  isAllintitleMeasurementFresh,
  readArticleAllintitleEvidence,
} from "./article-kgr-decision.ts";
import { SERP_PAID_QUERY_COST_USD, type SerpPaidPlan } from "./serp-lens-plan.ts";
import { calculateKgrFromMetrics } from "../minerador/kgr-applicability.ts";

/** Teto de artigos por pedido na rota do allintitle (o mesmo dos blocos da formação). */
export const ARTICLE_ALLINTITLE_BLOCK_SIZE = 20;

/** Rótulo da "lente" do allintitle no plano de chamadas pagas. */
export const ARTICLE_ALLINTITLE_PLAN_LABEL = "Allintitle da Principal (desktop)";

/** Quantas medições de allintitle a identidade guarda (as mais novas). */
export const ARTICLE_ALLINTITLE_EVIDENCE_LIMIT = 5;

export type ArticleAllintitleReuse =
  | { kind: "arquiteto"; resultCount: number; measuredAt: string }
  | { kind: "minerador"; resultCount: number; measuredAt: string }
  | { kind: "to_pay"; reason: string };

export type ArticleAllintitleTarget = {
  principalKeywordId: string;
  kgrIdentity: ArticleKgrIdentity | null | undefined;
  /** `results_allintitle` da linha do Minerador (lido, nunca escrito). */
  mineradorResultCount: number | null | undefined;
  /** `analise_semantica.allintitle_measurement.measuredAt` do Minerador. */
  mineradorMeasuredAt: string | null | undefined;
};

const finiteNonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Cache primeiro: o que já foi medido nos últimos 30 dias atende sem custo.
 * `recollect` (o "Recalcular" humano) ignora o reaproveitamento.
 */
export function resolveArticleAllintitleReuse(target: ArticleAllintitleTarget, options: { now: Date; recollect?: boolean }): ArticleAllintitleReuse {
  if (options.recollect) return { kind: "to_pay", reason: "Recalcular pedido pela pessoa: a medição é paga de novo." };
  const arquiteto = readArticleAllintitleEvidence(target.kgrIdentity, target.principalKeywordId);
  if (arquiteto && isAllintitleMeasurementFresh(arquiteto.measuredAt, options.now)) {
    return { kind: "arquiteto", resultCount: arquiteto.resultCount, measuredAt: arquiteto.measuredAt };
  }
  if (finiteNonNegativeInteger(target.mineradorResultCount) && isAllintitleMeasurementFresh(target.mineradorMeasuredAt, options.now)) {
    return { kind: "minerador", resultCount: target.mineradorResultCount, measuredAt: String(target.mineradorMeasuredAt) };
  }
  return {
    kind: "to_pay",
    reason: arquiteto || finiteNonNegativeInteger(target.mineradorResultCount)
      ? `A medição de allintitle tem mais de ${ARTICLE_ALLINTITLE_MAX_AGE_DAYS} dias.`
      : "A Principal não tem allintitle medido.",
  };
}

/**
 * O plano de chamadas pagas do allintitle, no formato do plano da SERP: é o
 * mesmo diálogo, a mesma autorização (`authorizeSerpPaidPlan`) e o mesmo
 * orçamento. Preço: faixa de outra lente (US$ 0,002 a 0,0035), ESTIMADO até o
 * primeiro evento real no ledger (SDD §7.1).
 */
export function buildArticleAllintitlePlan(reuses: readonly ArticleAllintitleReuse[]): SerpPaidPlan {
  const pagas = reuses.filter(item => item.kind === "to_pay").length;
  const reaproveitadas = reuses.length - pagas;
  const arredondar = (valor: number) => Math.round(valor * 10000) / 10000;
  return {
    lenses: [ARTICLE_ALLINTITLE_PLAN_LABEL],
    perLens: [{ lens: ARTICLE_ALLINTITLE_PLAN_LABEL, hits: reaproveitadas, misses: pagas, conditionalMisses: 0, unpaidMisses: 0, staleByDate: 0 }],
    paidQueries: pagas,
    primaryPaidQueries: pagas,
    extraPaidQueries: 0,
    conditionalPaidQueries: 0,
    recollectableQueries: 0,
    estimatedCostUsd: {
      min: arredondar(pagas * SERP_PAID_QUERY_COST_USD.otherLensMin),
      max: arredondar(pagas * SERP_PAID_QUERY_COST_USD.otherLensMax),
    },
    collectedAtSpreadDays: 0,
    datesDiverge: false,
    payMissingExtraLenses: false,
    recollectStaleLenses: false,
    digestChecked: false,
  };
}

export type ArticleAllintitleMeasurementRecord = {
  resultCount: number;
  measuredAt: string;
  query: string;
  locationCode: number;
  languageCode: string;
  provider: string;
  endpoint: string;
  providerRequestId: string | null;
  operationRequestId: string;
};

/**
 * A identidade KGR com a medição nova. Guarda a medição em `evidence` (as
 * `ARTICLE_ALLINTITLE_EVIDENCE_LIMIT` mais novas desta Principal; medições de
 * outra Principal ficam como estão) e atualiza `resultCount`, `kgrValue`,
 * `primaryVolume`, `evaluatedAt` e `evaluatedBy`. A decisão ("Aplicar KGR")
 * NÃO muda: medir não decide.
 *
 * Identidade de outra Principal: a nova nasce no padrão "não aplicável",
 * levando o histórico de decisões.
 */
export function withArticleAllintitleMeasurement(input: {
  identity: ArticleKgrIdentity | null | undefined;
  principalKeywordId: string;
  principalKeywordDnaId?: string;
  principalKeywordDnaVersionId?: string;
  principalKeywordDnaContentHash?: ArticleKgrIdentity["principalKeywordDnaContentHash"];
  brandId: string;
  workflowItemId: string;
  articleId?: string | null;
  principalVolume: number | null;
  measurement: ArticleAllintitleMeasurementRecord;
  actorUserId: string;
  evaluatedAt: string;
}): ArticleKgrIdentity {
  const current = input.identity || null;
  const samePrincipal = Boolean(current) && (!current?.primaryKeywordId || current.primaryKeywordId === input.principalKeywordId);
  const base: ArticleKgrIdentity = current && samePrincipal
    ? current
    : defaultNotApplicableKgrIdentity({
      principalKeywordId: input.principalKeywordId,
      principalKeywordDnaId: input.principalKeywordDnaId,
      principalKeywordDnaVersionId: input.principalKeywordDnaVersionId,
      principalKeywordDnaContentHash: input.principalKeywordDnaContentHash,
      primaryVolume: input.principalVolume,
      decisionHistory: current?.decisionHistory,
    });
  const entrada: Record<string, unknown> = {
    kind: ARTICLE_ALLINTITLE_EVIDENCE_KIND,
    source: "arquiteto",
    keywordId: input.principalKeywordId,
    resultCount: input.measurement.resultCount,
    measuredAt: input.measurement.measuredAt,
    query: input.measurement.query,
    locationCode: input.measurement.locationCode,
    languageCode: input.measurement.languageCode,
    provider: input.measurement.provider,
    endpoint: input.measurement.endpoint,
    providerRequestId: input.measurement.providerRequestId,
    operationRequestId: input.measurement.operationRequestId,
    actorUserId: input.actorUserId,
  };
  const anteriores = base.evidence || [];
  const desta = anteriores.filter(item => item?.kind === ARTICLE_ALLINTITLE_EVIDENCE_KIND && item.keywordId === input.principalKeywordId);
  const outras = anteriores.filter(item => !(item?.kind === ARTICLE_ALLINTITLE_EVIDENCE_KIND && item.keywordId === input.principalKeywordId));
  const mantidas = [...desta, entrada]
    .sort((left, right) => Date.parse(String(left.measuredAt)) - Date.parse(String(right.measuredAt)))
    .slice(-ARTICLE_ALLINTITLE_EVIDENCE_LIMIT);
  const volume = typeof input.principalVolume === "number" && Number.isFinite(input.principalVolume) && input.principalVolume > 0
    ? input.principalVolume
    : typeof base.primaryVolume === "number" && Number.isFinite(base.primaryVolume) && base.primaryVolume > 0 ? base.primaryVolume : null;
  return ArticleKgrIdentitySchema.parse({
    ...base,
    brandId: base.brandId || input.brandId,
    workflowItemId: base.workflowItemId || input.workflowItemId,
    ...(base.articleId || input.articleId ? { articleId: base.articleId || input.articleId || undefined } : {}),
    primaryKeywordId: input.principalKeywordId,
    primaryVolume: volume,
    resultCount: input.measurement.resultCount,
    kgrValue: calculateKgrFromMetrics(volume, input.measurement.resultCount),
    evidence: [...outras, ...mantidas],
    evaluatedAt: input.evaluatedAt,
    evaluatedBy: input.actorUserId,
  });
}

/** Texto curto da origem da medição, para a tela. */
export function describeArticleAllintitleReuse(reuse: ArticleAllintitleReuse): string {
  const data = (valor: string) => {
    const tempo = Date.parse(valor);
    return Number.isFinite(tempo) ? new Date(tempo).toLocaleDateString("pt-BR") : valor;
  };
  if (reuse.kind === "arquiteto") return `${reuse.resultCount.toLocaleString("pt-BR")} resultados · medido pelo Arquiteto em ${data(reuse.measuredAt)}`;
  if (reuse.kind === "minerador") return `${reuse.resultCount.toLocaleString("pt-BR")} resultados · medido pelo Minerador em ${data(reuse.measuredAt)}`;
  return reuse.reason;
}

/**
 * As colunas estreitas que a rota lê da linha do Minerador — nunca a
 * `analise_semantica` inteira. Só leitura: o Arquiteto não escreve ali.
 */
export const ARTICLE_ALLINTITLE_KEYWORD_COLUMNS = "id,keyword,volume_search,results_allintitle,allintitle_measured_at:analise_semantica->allintitle_measurement->>measuredAt";
