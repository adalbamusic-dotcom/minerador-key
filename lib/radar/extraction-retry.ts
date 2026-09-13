/**
 * FALHA RECUPERÁVEL NÃO É FALHA DEFINITIVA.
 *
 * Um timeout, uma queda de conexão ou um 502 do outro lado dizem "tente de
 * novo". Um 403, um robots que recusa, uma URL inválida ou um destino privado
 * dizem "não insista". Tratar os dois do mesmo jeito produzia o pior dos
 * mundos: a investigação parava por causa de uma página que voltaria na
 * segunda tentativa, e insistia em outra que nunca vai abrir.
 *
 * Depois da rodada, `PENDING = 0`: cada selecionada termina como página na
 * amostra ou como limitação declarada. Nenhuma fica esperando para sempre.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/** Quantas vezes uma falha recuperável é tentada, contando a primeira. */
export const RADAR_EXTRACTION_MAX_ATTEMPTS = 3;

/*
 * OS CÓDIGOS SÃO OS QUE A EXTRAÇÃO REALMENTE EMITE.
 *
 * A lista anterior carregava `network_error`, `blocked` e `unsupported` —
 * nomes que nenhum caminho produzia. Código fantasma numa lista de recuperáveis
 * dá falsa impressão de cobertura: parece que o caso está tratado, e ninguém
 * descobre que não está até a página sumir da amostra sem explicação.
 *
 * Estes treze são o contrato de `CompetitorExtractionError`, inteiro.
 */

/** O problema é do momento: tentar de novo pode dar certo. */
const RECUPERAVEIS = new Set(["fetch_failed", "timeout", "too_many_requests", "http_server_error"]);

/** A recusa é estável: repetir não muda o resultado. */
const DEFINITIVOS = new Set([
  "invalid_url", "private_destination", "invalid_html", "invalid_content_type", "redirect_limit",
  "not_found", "gone", "access_blocked", "http_client_error",
]);

export function radarExtractionFailureIsRecoverable(input: { code: string; status?: number | null }): boolean {
  if (DEFINITIVOS.has(input.code)) return false;
  if (RECUPERAVEIS.has(input.code)) return true;
  /*
   * Sem código conhecido, o status manda: 5xx e 429 são do servidor e passam;
   * 4xx é recusa dele a nós e não passa. Nada de retry às cegas.
   */
  const status = input.status ?? null;
  if (status === null) return false;
  if (status === 429) return true;
  return status >= 500 && status < 600;
}

export type RadarExtractionAttempt = { key: string; code: string; status: number | null; attempts: number };

/** Quais falhas ainda merecem outra tentativa nesta rodada. */
export function radarExtractionRetryQueue(
  failures: readonly RadarExtractionAttempt[],
  maxAttempts = RADAR_EXTRACTION_MAX_ATTEMPTS,
): RadarExtractionAttempt[] {
  return failures.filter(failure =>
    failure.attempts < maxAttempts
    && radarExtractionFailureIsRecoverable({ code: failure.code, status: failure.status }));
}

/** A limitação que uma falha definitiva vira no relatório. */
export function radarExtractionLimitation(input: { url: string; code: string; status: number | null; attempts: number }): string {
  const tentativas = input.attempts > 1 ? ` após ${input.attempts} tentativas` : "";
  const codigo = input.status ? `${input.code} · HTTP ${input.status}` : input.code;
  return `${input.url} não pôde ser lida${tentativas} (${codigo}); ela fica fora da amostra e o que ela cobriria não foi observado.`;
}
