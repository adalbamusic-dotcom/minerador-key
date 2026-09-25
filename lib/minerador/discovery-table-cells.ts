import { formatDiscoveryMoney, type DiscoveryCandidate } from "./discovery-keywords.ts";

/**
 * LEITURA DAS CÉLULAS DA PLANILHA DO DESCOBRIR.
 *
 * Três estados que o "—" branco misturava:
 *
 *   value            — há dado medido; mostra o dado.
 *   processed_empty  — o processo rodou e não trouxe dado. A tela mostra "0"
 *                      apagado com a dica "Processado, sem dado". É só leitura:
 *                      o dado continua vazio (ADR-020 — volume ausente nunca é
 *                      zero implícito), e filtros e ordenação seguem tratando
 *                      a célula como ausente.
 *   not_processed    — nunca passou pelo processo; continua "—".
 *   error            — o processo falhou; aparece na cor de alerta.
 *   pending          — medição em andamento.
 */
export type DiscoveryCellTone = "value" | "processed_empty" | "not_processed" | "error" | "pending";
export type DiscoveryCellDisplay = { tone: DiscoveryCellTone; text: string; hint?: string };

export const DISCOVERY_PROCESSED_EMPTY_HINT = "Processado, sem dado";
export const DISCOVERY_NOT_PROCESSED_HINT = "Ainda não processado";

const processedEmpty: DiscoveryCellDisplay = { tone: "processed_empty", text: "0", hint: DISCOVERY_PROCESSED_EMPTY_HINT };
const notProcessed: DiscoveryCellDisplay = { tone: "not_processed", text: "—", hint: DISCOVERY_NOT_PROCESSED_HINT };

const integer = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

/**
 * A leitura Google Ads completa (volume, CPC e concorrência) chegou à
 * candidata: veio da busca Google Ads ou da projeção persistida das métricas.
 */
export function discoveryGoogleAdsMetricsProcessed(candidate: DiscoveryCandidate) {
  if (candidate.provider === "google_ads" && Boolean(candidate.measuredAt)) return true;
  return candidate.currentMetrics?.metricsProvider === "google_ads" && Boolean(candidate.currentMetrics.metricsMeasuredAt);
}

/**
 * Volume também conta como processado depois de "Atualizar métricas" nesta
 * sessão: a resposta só devolve o volume, e ela marca `metricsMeasuredAt`.
 * CPC e concorrência não vêm nessa resposta, então não herdam essa marca.
 */
export function discoveryVolumeProcessed(candidate: DiscoveryCandidate) {
  return discoveryGoogleAdsMetricsProcessed(candidate) || Boolean(candidate.currentMetrics?.metricsMeasuredAt);
}

export function discoveryVolumeCell(candidate: DiscoveryCandidate, session: { answeredWithoutData?: boolean } = {}): DiscoveryCellDisplay {
  if (typeof candidate.averageMonthlySearches === "number") return { tone: "value", text: integer(candidate.averageMonthlySearches) };
  return discoveryVolumeProcessed(candidate) || session.answeredWithoutData === true ? processedEmpty : notProcessed;
}

/**
 * "Atualizar métricas" respondeu com sucesso, mas a rota só devolve em
 * `projections` a candidata com média oficial: a que voltou sem média e a que
 * o Google Ads não devolveu ficam de fora. Essas passaram pelo processo sem
 * dado. Nada é gravado — o dado continua null (ADR-020).
 */
export function candidatesAnsweredWithoutVolume(requestedIds: readonly string[], projections: ReadonlyArray<{ keywordId?: string | null }> | null | undefined): string[] {
  const answered = new Set((projections || []).map(item => item.keywordId).filter((id): id is string => typeof id === "string"));
  return [...new Set(requestedIds)].filter(id => !answered.has(id));
}

export function discoveryCpcCell(candidate: DiscoveryCandidate): DiscoveryCellDisplay {
  if (candidate.averageCpcMicros !== null && candidate.averageCpcMicros !== undefined) return { tone: "value", text: formatDiscoveryMoney(candidate.averageCpcMicros, candidate.currencyCode) };
  return discoveryGoogleAdsMetricsProcessed(candidate) ? processedEmpty : notProcessed;
}

const competitionText = (value: string) => value === "LOW" ? "Baixa" : value === "MEDIUM" ? "Média" : value === "HIGH" ? "Alta" : value;

export function discoveryCompetitionCell(candidate: DiscoveryCandidate): DiscoveryCellDisplay {
  const index = typeof candidate.competitionIndex === "number" ? candidate.competitionIndex : null;
  if (candidate.competition) return { tone: "value", text: index === null ? competitionText(candidate.competition) : `${competitionText(candidate.competition)} · ${index}` };
  if (index !== null) return { tone: "value", text: String(index) };
  return discoveryGoogleAdsMetricsProcessed(candidate) ? processedEmpty : notProcessed;
}

export function discoveryResultsCell(candidate: DiscoveryCandidate): DiscoveryCellDisplay {
  const metrics = candidate.currentMetrics;
  const value = metrics?.resultsAllintitle;
  if (typeof value === "number") return { tone: "value", text: integer(value) };
  const status = metrics?.allintitleStatus;
  if (status === "failed" || status === "captcha") {
    const reason = metrics?.allintitleErrorMessage || metrics?.allintitleErrorCode || "A medição de Resultados falhou.";
    return { tone: "error", text: "Erro", hint: `Falha no processo: ${reason}` };
  }
  if (status === "paused") return { tone: "error", text: "Pausada", hint: "A medição de Resultados foi pausada antes de concluir." };
  if (status === "queued" || status === "measuring") return { tone: "pending", text: "Medindo…", hint: "Medição de Resultados em andamento." };
  if (status === "measured") return processedEmpty;
  return notProcessed;
}

/**
 * A seleção guardada só vale para candidatas que ainda estão na tabela. Uma
 * pesquisa nova troca as candidatas; sem esta poda a barra contava ids antigos
 * e "Enviar selecionadas" recusava o lote com "seleção técnica não
 * reconciliada". Devolve o mesmo Set quando nada muda, para não re-renderizar.
 */
export function reconcileDiscoverySelection(selectedIds: Set<string>, candidateIds: readonly string[]): Set<string> {
  if (!selectedIds.size) return selectedIds;
  const available = new Set(candidateIds);
  let stale = false;
  for (const id of selectedIds) if (!available.has(id)) { stale = true; break; }
  if (!stale) return selectedIds;
  return new Set([...selectedIds].filter(id => available.has(id)));
}

/** Compara duas listas de ids na ordem, para sincronizar a ordem visível sem laço de render. */
export function sameDiscoveryIdOrder(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}
