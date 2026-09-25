import { isValidDataForSeoAllintitleMeasurement } from "./dataforseo-competition.ts";
import { isValidGoogleAdsDemandMeasurement } from "./google-ads-demand.ts";
import { readGoogleAdsEmptyVolumeResponse } from "./volume-eligibility.ts";
import { readDataForSeoKeywordOverview } from "./dataforseo-keyword-overview-core.ts";
import { resolveMineradorProcessState, type MineradorProcessAttempt, type MineradorProcessName } from "./process-state.ts";

/**
 * LEITURA DAS CÉLULAS DE MÉTRICA DA PLANILHA DO PROCESSADOR.
 *
 * O "—" misturava três situações diferentes. Agora:
 *
 *   value            — há dado; a tela formata o número como antes.
 *   processed_empty  — o processo rodou e não trouxe dado. A tela mostra "0"
 *                      apagado com a dica "Processado, sem dado". É SÓ
 *                      apresentação: o dado continua vazio no banco (ADR-020,
 *                      volume ausente nunca é zero implícito), e KGR, filtros,
 *                      ordenação e elegibilidade seguem tratando como ausente.
 *   not_processed    — nunca passou pelo processo; continua "—".
 *   error            — o processo falhou; aparece na cor de erro, com o motivo.
 *   pending          — o processo está rodando agora nesta sessão.
 *
 * Só lê o que a tela já carrega (`analise_semantica` e as tentativas locais):
 * nenhuma leitura nova do banco.
 */
export type ProcessorCellTone = "value" | "processed_empty" | "not_processed" | "error" | "pending";
export type ProcessorCellState = { tone: ProcessorCellTone; text: string | null; hint: string | null };
export type ProcessorCellAttempts = Partial<Record<MineradorProcessName, MineradorProcessAttempt>> | undefined;

export const PROCESSOR_PROCESSED_EMPTY_TEXT = "0";
export const PROCESSOR_PROCESSED_EMPTY_HINT = "Processado, sem dado";
export const PROCESSOR_NOT_PROCESSED_TEXT = "—";
export const PROCESSOR_NOT_PROCESSED_HINT = "Ainda não processado";

type Semantic = Record<string, unknown>;

function record(value: unknown): Semantic | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function hasErrorEvidence(value: unknown): boolean {
  const item = record(value);
  return Boolean(item && ["errorCode", "code", "message", "failedAt"].some(key => item[key] !== null && item[key] !== undefined && item[key] !== ""));
}

function errorMessage(value: unknown): string | null {
  const item = record(value);
  return text(item?.message) || text(item?.errorCode) || text(item?.code);
}

const FAILURE_STATUSES = new Set(["error", "failed", "failure", "timeout", "unavailable", "captcha", "blocked", "cancelled", "measurement_failed"]);

const value = (): ProcessorCellState => ({ tone: "value", text: null, hint: null });
const valueWithHint = (hint: string | null): ProcessorCellState => ({ tone: "value", text: null, hint });
const processedEmpty = (): ProcessorCellState => ({ tone: "processed_empty", text: PROCESSOR_PROCESSED_EMPTY_TEXT, hint: PROCESSOR_PROCESSED_EMPTY_HINT });
const notProcessed = (): ProcessorCellState => ({ tone: "not_processed", text: PROCESSOR_NOT_PROCESSED_TEXT, hint: PROCESSOR_NOT_PROCESSED_HINT });
const pending = (processLabel: string): ProcessorCellState => ({ tone: "pending", text: "Medindo…", hint: `${processLabel} em andamento.` });
const failed = (processLabel: string, reason: string | null): ProcessorCellState => ({
  tone: "error",
  text: "Erro",
  hint: reason ? `Falha no processo de ${processLabel}: ${reason}` : `Falha no processo de ${processLabel}. Rode o processo de novo.`,
});

/* ---------- Volume (Google Ads) ---------- */

function volumeEligibilityRecord(semantic: Semantic): Semantic | null {
  return record(semantic.volume_eligibility);
}

/** O Volume respondeu (com ou sem número) e isso ficou gravado na linha. */
export function volumeProcessRecorded(semantic: Semantic | null | undefined): boolean {
  const source = semantic || {};
  if (isValidGoogleAdsDemandMeasurement(source.volume_measurement)) return true;
  const eligibility = volumeEligibilityRecord(source);
  const status = text(eligibility?.status);
  // "Sem média" só conta pela mesma leitura da aprovação (provider Google Ads
  // e data legível): a célula não mostra "processado" onde a trava não vê.
  if (status === "unavailable") return Boolean(readGoogleAdsEmptyVolumeResponse(source));
  return Boolean(status && status !== "pending" && status !== "measurement_failed" && validTimestamp(eligibility?.measuredAt));
}

function volumeProcessFailed(semantic: Semantic): boolean {
  return text(volumeEligibilityRecord(semantic)?.status) === "measurement_failed";
}

export function processorVolumeCell(input: { semantic?: Semantic | null; value: number | null; attempts?: ProcessorCellAttempts }): ProcessorCellState {
  const semantic = input.semantic || {};
  if (input.value !== null) return value();
  if (input.attempts?.volume?.state === "running") return pending("Volume");
  if (input.attempts?.volume?.state === "failed") return failed("Volume", null);
  // Terminou nesta sessão sem número (ex.: o Google Ads não devolveu média
  // para a keyword): passou pelo processo.
  if (input.attempts?.volume?.state === "success") return processedEmpty();
  // Desde 2026-09-25 a rota grava a resposta sem média (`volume_eligibility`
  // `unavailable` com data), também para keyword que o Google Ads não
  // devolveu: o "0" apagado sobrevive ao recarregar, sem gravação nova.
  if (volumeProcessRecorded(semantic)) return processedEmpty();
  if (volumeProcessFailed(semantic)) return failed("Volume", null);
  return notProcessed();
}

/** O CPC viaja na mesma resposta do Volume: herda o processo do Volume. */
export function processorCpcCell(input: { semantic?: Semantic | null; value: number | null; attempts?: ProcessorCellAttempts }): ProcessorCellState {
  return processorVolumeCell(input);
}

/* ---------- Resultados (DataForSEO) ---------- */

/** Resultados respondeu e isso ficou gravado na linha. */
export function resultsProcessRecorded(semantic: Semantic | null | undefined): boolean {
  const measurement = record((semantic || {}).allintitle_measurement);
  if (!measurement) return false;
  if (isValidDataForSeoAllintitleMeasurement(measurement)) return true;
  const provider = text(measurement.provider) || text(measurement.source);
  const status = text(measurement.status)?.toLocaleLowerCase("en-US") || "";
  return provider?.toLocaleLowerCase("en-US") === "dataforseo"
    && validTimestamp(measurement.measuredAt ?? measurement.measured_at)
    && !FAILURE_STATUSES.has(status);
}

function resultsFailureReason(semantic: Semantic): { failed: boolean; reason: string | null } {
  const lastError = semantic.allintitle_last_error;
  if (hasErrorEvidence(lastError)) return { failed: true, reason: errorMessage(lastError) };
  const measurement = record(semantic.allintitle_measurement);
  const status = text(measurement?.status)?.toLocaleLowerCase("en-US") || "";
  if (measurement && FAILURE_STATUSES.has(status)) return { failed: true, reason: errorMessage(measurement) || status };
  return { failed: false, reason: null };
}

export function processorResultsCell(input: { semantic?: Semantic | null; value: number | null; attempts?: ProcessorCellAttempts }): ProcessorCellState {
  const semantic = input.semantic || {};
  const failure = resultsFailureReason(semantic);
  if (input.value !== null) {
    return failure.failed
      ? valueWithHint(`Última atualização falhou${failure.reason ? `: ${failure.reason}` : ""}. Mostrando a medição anterior.`)
      : value();
  }
  if (input.attempts?.results?.state === "running") return pending("Resultados");
  if (input.attempts?.results?.state === "failed") return failed("Resultados", failure.reason);
  if (failure.failed) return failed("Resultados", failure.reason);
  if (resultsProcessRecorded(semantic)) return processedEmpty();
  return notProcessed();
}

/** O KD vem do Keyword Overview, pedido junto com Resultados. */
export function processorKdCell(input: { semantic?: Semantic | null; value: number | null; attempts?: ProcessorCellAttempts }): ProcessorCellState {
  const semantic = input.semantic || {};
  if (input.value !== null) return value();
  if (input.attempts?.results?.state === "running") return pending("Resultados");
  const overview = readDataForSeoKeywordOverview(semantic.dataforseo_keyword_overview)
    || readDataForSeoKeywordOverview(semantic.dataforseo_keyword_overview_measurement)
    || readDataForSeoKeywordOverview(semantic.keyword_overview_measurement);
  const overviewError = semantic.dataforseo_keyword_overview_last_error;
  if (input.attempts?.results?.state === "failed") return failed("Resultados", errorMessage(overviewError));
  if (overview) return processedEmpty();
  if (hasErrorEvidence(overviewError)) return failed("Resultados", errorMessage(overviewError));
  if (resultsProcessRecorded(semantic)) return processedEmpty();
  return notProcessed();
}

/* ---------- Filtro "Com processo / Sem processo" ---------- */

export type ProcessorRunFilter = "Todos" | "with_process" | "without_process";

export type ProcessorRunInput = {
  id?: string;
  keyword?: string;
  location?: string | null;
  intent?: string | null;
  status?: string | null;
  volume_search?: unknown;
  results_allintitle?: unknown;
  analise_semantica?: Semantic | null;
};

/**
 * A keyword passou por algum processo do Processador (Lógica, Volume ou
 * Resultados), com dado, sem dado ou com erro. Valor só importado do
 * Descobrir NÃO conta: ainda não foi processado aqui.
 */
export function keywordHasProcessorRun(row: ProcessorRunInput): boolean {
  const semantic = row.analise_semantica || {};
  if (volumeProcessRecorded(semantic) || resultsProcessRecorded(semantic)) return true;
  if (volumeProcessFailed(semantic)) return true;
  if (resultsFailureReason(semantic).failed) return true;
  if (typeof row.keyword !== "string" || !row.keyword.trim()) return false;
  const process = resolveMineradorProcessState({
    id: row.id,
    keyword: row.keyword,
    location: row.location ?? null,
    intent: row.intent ?? null,
    status: row.status ?? null,
    volume_search: row.volume_search,
    results_allintitle: row.results_allintitle,
    analise_semantica: semantic,
  });
  return process.logic.artifactState !== "missing";
}

export function matchesProcessorRunFilter(row: ProcessorRunInput, filter: ProcessorRunFilter | string | undefined): boolean {
  if (filter === "with_process") return keywordHasProcessorRun(row);
  if (filter === "without_process") return !keywordHasProcessorRun(row);
  return true;
}
