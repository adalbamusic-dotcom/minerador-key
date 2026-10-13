import type { SubjectDiscoveryCandidate, SubjectDiscoveryExecuteResponse } from "../../../lib/minerador/subject-discovery-search.ts";
import type { SubjectDiscoveryPlan } from "../../../lib/minerador/subject-discovery-plan.ts";
import { subjectDiscoveryHasVolume } from "../../../lib/minerador/subject-discovery-volume.ts";
import {
  SUBJECT_SEARCH_DEFAULT_FILTERS,
  buildSubjectDiscoveryImportItems,
  buildSubjectSearchRequest,
  filterSubjectCandidates,
  type SubjectSearchImportItem,
} from "./subject-search-model.ts";

/**
 * PESQUISA POR ASSUNTO EM LOTE — regras puras da tela (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 7, D7).
 *
 * Depois do "Cadastrar", o card oferece "Buscar sustentação para os N
 * artigos": a MESMA Pesquisa por Assunto, uma vez por linha, com o MESMO corpo
 * (`buildSubjectSearchRequest`) e o mesmo envio (`buildSubjectDiscoveryImportItems`).
 *
 *   - a semente é a keyword da linha: o pedido leva só o `subjectKeywordId`, e o
 *     servidor relê a keyword, a nota e a página de destino do Assunto (C15);
 *   - um plano de custo só: a soma dos planos das linhas (US$ 0; cota do
 *     Google Ads), confirmado uma vez; cada linha executa com o próprio
 *     `planHash` e o mesmo `batchId`;
 *   - nada pré-selecionado: a tabela abre com "Só com volume" marcado e as
 *     caixas vazias; "Marcar as com volume" por artigo e no lote;
 *   - uma confirmação final de envio ao Processador; o Volume vai pelo recibo
 *     do servidor (item 8), nunca pelo navegador.
 *
 * Sem rede, sem banco, sem armazenamento.
 */

export type SubjectSearchBatchLine = {
  /** O id do Assunto da linha (a keyword que o carrega, no cadastro único). */
  subjectKeywordId: string;
  order: number;
  title: string;
  /** A keyword mostrada na tela; a semente real é relida pelo servidor. */
  keyword: string;
};

/** Português, todos os estados, sem conteúdo adulto: o mesmo padrão da Pesquisa por Assunto. */
export const SUBJECT_SEARCH_BATCH_TARGETING = { language: "Português", selectedStates: ["Todos os estados"], includeAdultKeywords: false } as const;

export const SUBJECT_SEARCH_BATCH_TEXTS = {
  intro: "Uma Pesquisa por Assunto por linha, com a keyword da linha como semente. Nada é consultado antes de você confirmar o plano.",
  planTitle: "Plano da pesquisa em lote",
  planCost: "Sem custo no DataForSEO; usa a cota do Google Ads",
  planRule: "O servidor relê a keyword, a nota e a página de destino de cada Assunto. Uma confirmação vale para todas as linhas do plano; cada linha roda o plano dela.",
  localNote: "A lista de candidatas fica só nesta janela até o envio; fechar o card descarta a lista (repetir consulta o Google Ads de novo, sem custo). O Volume medido fica guardado no recibo do servidor.",
  onlyWithVolume: "Só com volume",
  onlyWithVolumeHelp: "Esconde as candidatas sem média do Google Ads. Sem volume, a keyword não reforça artigo.",
  sendTitle: "Enviar ao Processador",
  sendRule: "Vão só as keywords marcadas, ligadas ao Assunto de cada artigo. O Volume que a pesquisa mediu vai pelo recibo do servidor (sem medir de novo) e a Lógica roda sozinha. Nada é pago.",
  noReceipt: "Sem recibo desta pesquisa no servidor: estas keywords entram sem volume; meça pelo botão \"Volume\" do Processador.",
} as const;

export function subjectSearchBatchButtonLabel(count: number) {
  return count === 1 ? "Buscar sustentação para o artigo" : `Buscar sustentação para os ${count} artigos`;
}

export function subjectSearchBatchConfirmLabel(count: number) {
  return count === 1 ? "Confirmar e pesquisar a linha" : `Confirmar e pesquisar as ${count} linhas`;
}

/** As linhas do lote a partir do resultado do cadastro: uma por Assunto gravado, na ordem, sem repetir. */
export function subjectSearchBatchLines(articles: ReadonlyArray<{ order: number; title?: string | null; keyword?: string | null; subjectKeywordId: string | null; outcome: string }>): SubjectSearchBatchLine[] {
  const seen = new Set<string>();
  const lines: SubjectSearchBatchLine[] = [];
  for (const article of [...articles].sort((a, b) => a.order - b.order)) {
    if (article.outcome === "failed" || !article.subjectKeywordId || seen.has(article.subjectKeywordId)) continue;
    seen.add(article.subjectKeywordId);
    lines.push({ subjectKeywordId: article.subjectKeywordId, order: article.order, title: (article.title || "").trim(), keyword: (article.keyword || "").trim() });
  }
  return lines;
}

/** O corpo do plano de uma linha: só o id do Assunto (o servidor relê a keyword). */
export function subjectSearchBatchPlanRequest(line: SubjectSearchBatchLine) {
  return buildSubjectSearchRequest({ mode: "plan", phrase: "", note: "", destinationUrl: "", subjectKeywordId: line.subjectKeywordId, ...SUBJECT_SEARCH_BATCH_TARGETING });
}

/** O corpo da execução de uma linha: o plano DELA, uma operação nova e o `batchId` do lote. */
export function subjectSearchBatchExecuteRequest(line: SubjectSearchBatchLine, plan: Pick<SubjectDiscoveryPlan, "planHash" | "maxCostUsd">, operationRequestId: string, batchId: string): Record<string, unknown> {
  return {
    ...buildSubjectSearchRequest({ mode: "execute", phrase: "", note: "", destinationUrl: "", subjectKeywordId: line.subjectKeywordId, ...SUBJECT_SEARCH_BATCH_TARGETING, operationRequestId, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd } }),
    batchId,
  };
}

export type SubjectSearchBatchPlanLine = {
  line: SubjectSearchBatchLine;
  plan: SubjectDiscoveryPlan | null;
  /** A semente que o servidor leu (a keyword da linha). */
  seed: string | null;
  error: string | null;
};

export type SubjectSearchBatchPlanSummary = {
  ready: number;
  refused: number;
  /** Consultas máximas ao Google Ads (frase e, com página aceita, frase + página). */
  adsCalls: number;
  /** Custo em dinheiro: a soma dos planos (zero no plano só do Google Ads). */
  maxCostUsd: number;
  paidCalls: number;
};

export function summarizeSubjectSearchBatchPlan(lines: readonly SubjectSearchBatchPlanLine[]): SubjectSearchBatchPlanSummary {
  const ready = lines.filter(item => item.plan && !item.error);
  return {
    ready: ready.length,
    refused: lines.length - ready.length,
    adsCalls: ready.reduce((total, item) => total + (item.plan?.lines.filter(line => line.provider === "google_ads").length ?? 0), 0),
    maxCostUsd: ready.reduce((total, item) => total + (item.plan?.maxCostUsd ?? 0), 0),
    paidCalls: ready.reduce((total, item) => total + (item.plan?.paidCalls ?? 0), 0),
  };
}

/** As candidatas que a tabela mostra: "Só com volume" e a ordem por volume da Pesquisa por Assunto. A frase do Assunto não entra. */
export function subjectSearchBatchVisibleCandidates(result: Pick<SubjectDiscoveryExecuteResponse, "candidates" | "subject">, onlyWithVolume: boolean): SubjectDiscoveryCandidate[] {
  return filterSubjectCandidates(result.candidates, { ...SUBJECT_SEARCH_DEFAULT_FILTERS, onlyWithVolume })
    .filter(candidate => !candidate.isSubjectPhrase && candidate.normalizedKeyword !== result.subject.normalizedPhrase);
}

/** "Marcar as com volume": as candidatas com média do Google Ads, fora a frase do Assunto. */
export function subjectSearchBatchWithVolumeKeys(result: Pick<SubjectDiscoveryExecuteResponse, "candidates" | "subject">): Set<string> {
  return new Set(result.candidates
    .filter(candidate => !candidate.isSubjectPhrase && candidate.normalizedKeyword !== result.subject.normalizedPhrase && subjectDiscoveryHasVolume(candidate))
    .map(candidate => candidate.normalizedKeyword));
}

export type SubjectSearchBatchImportLine = {
  line: SubjectSearchBatchLine;
  searchId: string;
  subjectPhrase: string;
  items: SubjectSearchImportItem[];
  withVolume: number;
  receiptRecorded: boolean;
};

/** O envio por linha: só as marcadas, pelo mesmo `buildSubjectDiscoveryImportItems` da Pesquisa por Assunto. Linha sem marcada não vai. */
export function subjectSearchBatchImportPlan(entries: ReadonlyArray<{ line: SubjectSearchBatchLine; result: SubjectDiscoveryExecuteResponse; selected: ReadonlySet<string> }>): { lines: SubjectSearchBatchImportLine[]; items: number; withVolume: number } {
  const lines: SubjectSearchBatchImportLine[] = [];
  for (const { line, result, selected } of entries) {
    const { items } = buildSubjectDiscoveryImportItems(result.candidates, selected, result.subject.normalizedPhrase);
    if (!items.length) continue;
    const chosen = new Set(items.map(item => item.keyword));
    const withVolume = result.candidates.filter(candidate => selected.has(candidate.normalizedKeyword) && chosen.has(candidate.keyword.replace(/\s+/g, " ").trim().slice(0, 400)) && subjectDiscoveryHasVolume(candidate)).length;
    lines.push({ line, searchId: result.operationRequestId, subjectPhrase: result.subject.phrase, items, withVolume, receiptRecorded: result.receipt?.status === "recorded" });
  }
  return { lines, items: lines.reduce((total, item) => total + item.items.length, 0), withVolume: lines.reduce((total, item) => total + item.withVolume, 0) };
}
