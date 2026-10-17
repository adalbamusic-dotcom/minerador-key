import type { ImprovementKeyword } from "./article-improvement.ts";
import type { ImprovementEditorialAi } from "./article-improvement-ai.ts";
import type { ReworkPrevious } from "../editorial/rework-guard.ts";

/*
 * MELHORIA SEM RETRABALHO (WifiConecta, 2026-10-12).
 *
 * Cada "Buscar keywords" criava uma execução nova, chamava a IA editorial de
 * novo e rodava a busca nova no Google Ads de novo — nove vezes numa tarde,
 * uma delas com 575 keywords de fora da lista. O dono chamou isso de
 * retrabalho e de "ignorar o que já foi feito".
 *
 * Três regras, sem schema novo (tudo no payload da execução, que já é JSONB):
 *
 * 1. Os INSUMOS de uma preparação (alvos, a fonte de cada alvo e a lista da
 *    marca como estava antes de medir) viram uma impressão digital. Preparar
 *    de novo com a mesma impressão reaproveita a leitura da IA, as medições e
 *    a busca da execução anterior: zero chamada nova de IA e de Google Ads. O
 *    cache da SERP (grátis) é relido, para "Buscar de novo" continuar valendo.
 * 2. A busca nova no Google Ads (keyword ideas) só roda quando o dono pede,
 *    com o custo dito antes do clique.
 * 3. A IA e a busca entram em `integration_usage_events`, pelo mesmo caminho
 *    do DataForSEO (IA) e da Descoberta do Minerador (Google Ads).
 */

/** Janela em que uma preparação com os mesmos insumos é reaproveitada. */
export const IMPROVEMENT_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Teto de chamadas da busca nova numa preparação (uma ou duas por alvo sem proposta). */
export const IMPROVEMENT_DISCOVERY_REQUEST_LIMIT = 40;

/**
 * O que entra na impressão digital: só o que muda a leitura. A lista vai
 * como estava no banco (antes da medição de volume antigo), em ordem estável.
 */
export function improvementInputsFingerprint(input: {
  version: number;
  brandId: string;
  sourceHashes: Record<string, string>;
  keywords: readonly ImprovementKeyword[];
}): unknown {
  return {
    version: input.version,
    brandId: input.brandId,
    targets: Object.keys(input.sourceHashes).sort().map(id => [id, input.sourceHashes[id]]),
    keywords: [...input.keywords]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(k => [k.id, k.keyword, k.volume ?? null, k.volumeValidated, k.ownerId ?? null, k.published, k.territoryRef ?? null, k.googleAdsMeasured === true]),
  };
}

export type ImprovementReusableRun = {
  version: number;
  runId: string;
  brandId: string;
  createdAt: string;
  inputsHash?: string;
  keywords: ImprovementKeyword[];
  editorialAi?: ImprovementEditorialAi;
  /* F5 — o que a guarda mostra da execução anterior (todos já estão no payload da execução). */
  actorId?: string;
  state?: string;
  decisionHash?: string;
  targets?: readonly unknown[];
  costs?: { paidQueries?: number };
  discovery?: { requested?: boolean; requests?: number };
};

/**
 * F5 — A EXECUÇÃO ANTERIOR COMO REGISTRO DA GUARDA (SDD 2026-10-12 §10.1).
 *
 * A melhoria tem registro próprio (`article_improvement_run`, com `inputsHash`):
 * a guarda o lê e não grava linha `operation_ledger`. O resumo é o do aviso
 * "Já feito com os mesmos insumos em 12/10 às 17:30 — 8 alvos, IA leu a lista,
 * 0 consultas pagas".
 */
export function improvementReworkPrevious(previous: ImprovementReusableRun | null | undefined): ReworkPrevious | null {
  if (!previous?.inputsHash || !previous.createdAt) return null;
  const alvos = previous.targets?.length ?? 0;
  const ia = previous.editorialAi?.status === "answered" ? "IA leu a lista" : previous.editorialAi?.status === "failed" ? "a leitura da IA falhou" : "sem leitura da IA";
  const busca = previous.discovery?.requested ? `, ${previous.discovery.requests ?? 0} chamada(s) da busca nova no Google Ads` : "";
  const pagas = previous.costs?.paidQueries ?? 0;
  return {
    kind: "article_improvement_prepare",
    fingerprint: previous.inputsHash,
    at: previous.createdAt,
    actorId: previous.actorId ?? "",
    outcome: "succeeded",
    outcomeCode: previous.state ? `RUN_${previous.state.toUpperCase()}` : null,
    resultRef: previous.runId,
    costUsd: null,
    message: null,
    attempts: 1,
    source: "article_improvement_run",
    summary: `${alvos} alvo(s), ${ia}${busca}, ${pagas} consulta(s) paga(s) no plano`,
  };
}

export type ImprovementReuseSeed = {
  fromRunId: string;
  keywords: ImprovementKeyword[];
  /** Ausente quando a leitura anterior falhou: só ela é refeita. */
  editorialAi: ImprovementEditorialAi | null;
  notice: string;
};

/**
 * A execução anterior serve de semente quando é da mesma marca e versão, tem
 * a mesma impressão digital e está dentro da janela. A leitura da IA que
 * FALHOU não é semente: não houve resposta para reaproveitar.
 */
export function improvementReuseSeed(previous: ImprovementReusableRun | null | undefined, expected: {
  version: number;
  brandId: string;
  inputsHash: string;
  now: Date;
}): ImprovementReuseSeed | null {
  if (!previous || previous.version !== expected.version || previous.brandId !== expected.brandId) return null;
  if (!previous.inputsHash || previous.inputsHash !== expected.inputsHash) return null;
  const age = expected.now.getTime() - Date.parse(previous.createdAt);
  if (!Number.isFinite(age) || age < 0 || age > IMPROVEMENT_REUSE_WINDOW_MS) return null;
  const editorialAi = previous.editorialAi && previous.editorialAi.status !== "failed" ? structuredClone(previous.editorialAi) : null;
  const externas = previous.keywords.filter(k => k.external).length;
  const partes = [
    editorialAi?.status === "answered" ? "a leitura da IA" : null,
    "as medições de volume",
    externas ? `${externas} keyword(s) da busca no Google Ads` : null,
  ].filter((parte): parte is string => Boolean(parte));
  return {
    fromRunId: previous.runId,
    keywords: structuredClone(previous.keywords),
    editorialAi,
    notice: `Mesmos alvos e mesma lista da preparação anterior: reaproveitei ${partes.join(", ")}, sem chamada nova de IA nem de Google Ads. Só o cache da SERP (grátis) foi relido.${previous.editorialAi?.status === "failed" ? " A leitura da IA tinha falhado e foi tentada de novo." : ""}`,
  };
}

/** Quantas chamadas a busca nova pode fazer, dito antes do clique. */
export function improvementDiscoveryMaxRequests(gapCount: number): number {
  return Math.max(0, Math.min(IMPROVEMENT_DISCOVERY_REQUEST_LIMIT, Math.floor(gapCount) * 2));
}

/** A frase de custo da busca nova, a mesma na tela e no MCP. */
export function improvementDiscoveryCostSentence(gapCount: number): string {
  const max = improvementDiscoveryMaxRequests(gapCount);
  return `Busca nova no Google Ads para ${gapCount} publicado(s) ou Assunto(s) sem proposta: até ${max} chamada(s) de ideias de keywords. Grátis (cota do Google Ads): cada chamada conta 1 unidade na cota de Descoberta da marca e fica no registro de uso. Traz keywords de fora da lista: só entram as do mesmo assunto, com volume medido. A ideia que já existe no Minerador é só lida (usa o volume dele, sem medir de novo; o Arquiteto não a altera); só a nova vai às métricas do Google Ads, grátis (cota do Google Ads), e, se você confirmar, entra no Minerador e no artigo na mesma confirmação de “Gravar melhorias”, que grava essa medição sem consultar outra vez.`;
}

/** Chave idempotente do registro de uso da leitura da IA desta execução. */
export function improvementAiUsageKey(provider: string, runId: string, resultStatus: "succeeded" | "failed"): string {
  return `${provider}:article_improvement_ai:${runId}${resultStatus === "failed" ? ":failed" : ""}`;
}
