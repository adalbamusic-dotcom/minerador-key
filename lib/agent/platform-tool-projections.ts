/**
 * Projeções das respostas das ferramentas MCP da F1 (SDD MCP ponta a ponta).
 *
 * Domínio puro: sem fetch, sem storage, sem provider. A resposta de uma
 * ferramenta cabe no teto de bytes das fatias do Redator; o que não couber
 * vai declarado em `trimmed`, nunca em silêncio.
 */

/** Teto por chamada de `measure_keywords`: um lote grande vira várias chamadas, cada uma com o próprio aceite. */
export const VOLUME_MEASURE_MAX_KEYWORDS = 500;

type VolumeOutcome = { keywordId: string; keyword: string | null; outcome: "confirmed" | "confirmed_empty" | "empty" | "failed"; volume: number | null; reason?: string };

const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * O resultado de `measure_keywords`, compacto: primeiro as falhas (com o
 * motivo), depois as sem média, depois as medidas com o volume. Se não couber,
 * ficam as primeiras de cada grupo e o corte vai em `trimmed`.
 */
export function projectVolumeResultForAgent(result: {
  requested: number; measured: number; withoutAverage: number; failed: number;
  quotaReached: boolean; stoppedReason: string | null; outcomes: readonly VolumeOutcome[];
}, maxBytes: number) {
  const header = {
    requested: result.requested,
    measured: result.measured,
    withoutAverage: result.withoutAverage,
    failed: result.failed,
    quotaReached: result.quotaReached,
    stoppedReason: result.stoppedReason,
    readbackConfirmed: true,
    note: "Sem média é processo executado (processada, sem dado), não falha. Só o que a releitura confirmou conta como medido.",
  };
  const ordered = [
    ...result.outcomes.filter(item => item.outcome === "failed"),
    ...result.outcomes.filter(item => item.outcome === "confirmed_empty" || item.outcome === "empty"),
    ...result.outcomes.filter(item => item.outcome === "confirmed"),
  ].map(item => ({
    keywordId: item.keywordId,
    ...(item.keyword ? { keyword: item.keyword } : {}),
    outcome: item.outcome === "confirmed" ? "medida" : item.outcome === "failed" ? "falhou" : "sem_media",
    ...(item.outcome === "confirmed" ? { volume: item.volume } : {}),
    ...(item.reason && item.outcome === "failed" ? { reason: item.reason } : {}),
  }));
  let kept = ordered.length;
  while (kept > 0 && bytesOf({ ...header, keywords: ordered.slice(0, kept), trimmed: { kept, dropped: ordered.length - kept } }) > maxBytes) kept = Math.floor(kept * 0.9);
  return { ...header, keywords: ordered.slice(0, kept), ...(kept < ordered.length ? { trimmed: { kept, dropped: ordered.length - kept, note: "A lista completa está no Processador do Minerador." } } : {}) };
}

/**
 * O CSV "Para escrever" de um artigo, em partes. A IA pede `part` 1, 2, … até
 * `parts` e junta os pedaços na ordem: o texto final é byte a byte o arquivo
 * que a tela baixa. O corte é por caracteres, com folga para o escape do JSON.
 */
export function sliceWritingCsv(csv: string, part: number, maxChars: number) {
  const parts = Math.max(1, Math.ceil(csv.length / maxChars));
  const index = Math.min(Math.max(1, Math.floor(part)), parts);
  return { part: index, parts, csv: csv.slice((index - 1) * maxChars, index * maxChars), complete: index === parts };
}
