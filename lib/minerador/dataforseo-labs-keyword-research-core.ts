/**
 * DATAFORSEO LABS — as três chamadas da Pesquisa por Assunto
 * (SDD `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F1b.2).
 *
 *   fonte 3  related_keywords/live  keyword = frase, depth 2, limit 100   → labs_related
 *   fonte 4  keyword_ideas/live     keywords = [frase], limit 100          → labs_category
 *   fonte 5  ranked_keywords/live   target = URL do topo, orgânico,        → labs_ranked
 *                                   rank_group <= 20, limit 100
 *
 * O normalizador do `keyword_overview` lê só `items[0]` e não serve: aqui cada
 * resposta vira uma LISTA de keywords. O padrão de erros e de conferência de
 * eco é o dele: task diferente de 20000 é recusada, e local ou idioma do
 * resultado diferentes do pedido viram `dataforseo_result_mismatch`.
 *
 * Local e idioma: sempre 2076 + "pt". O DataForSEO não resolve UF; a UF vale
 * só para o Google Ads e é recusada aqui.
 *
 * A `search_volume` do Labs é ESTIMATIVA DataForSEO e sai rotulada como tal.
 * Ela nunca vira Volume (spec do Minerador §47): nenhum campo daqui se chama
 * `volume`, e o import não aceita métrica.
 *
 * Domínio puro, mais um executor com `fetch` injetável. Este arquivo nunca lê
 * credencial: login e senha chegam prontos na `config`, resolvidos no servidor.
 */

export const DATAFORSEO_LABS_PROVIDER = "dataforseo" as const;
export const DATAFORSEO_LABS_PROVIDER_VERSION = "v3" as const;

/** Brasil inteiro. É o único local que o Labs recebe nesta pesquisa. */
export const DATAFORSEO_LABS_LOCATION_CODE = 2076;
export const DATAFORSEO_LABS_LANGUAGE_CODE = "pt";

export const DATAFORSEO_LABS_RESEARCH_ENDPOINTS = {
  related_keywords: "/v3/dataforseo_labs/google/related_keywords/live",
  keyword_ideas: "/v3/dataforseo_labs/google/keyword_ideas/live",
  ranked_keywords: "/v3/dataforseo_labs/google/ranked_keywords/live",
} as const;

export type DataForSeoLabsResearchKind = keyof typeof DATAFORSEO_LABS_RESEARCH_ENDPOINTS;
export const DATAFORSEO_LABS_RESEARCH_KINDS = Object.keys(DATAFORSEO_LABS_RESEARCH_ENDPOINTS) as DataForSeoLabsResearchKind[];

/** Profundidade das pesquisas relacionadas: a frase, as relacionadas dela e as relacionadas destas. */
export const DATAFORSEO_LABS_RELATED_DEPTH = 2;
/** Itens por task. É o teto que o plano de custo usa (F1b.10). */
export const DATAFORSEO_LABS_RESEARCH_LIMIT = 100;
/** No `ranked_keywords`, só o que a página ranqueia até a posição 20. */
export const DATAFORSEO_LABS_RANKED_MAX_RANK_GROUP = 20;

export const DATAFORSEO_ESTIMATE_LABEL = "Estimativa DataForSEO" as const;

type JsonObject = Record<string, unknown>;

export type DataForSeoLabsLocale = { locationCode: number; languageCode: string };

export type DataForSeoLabsResearchRequest =
  | ({ kind: "related_keywords"; keyword: string; tag: string } & DataForSeoLabsLocale)
  | ({ kind: "keyword_ideas"; keyword: string; tag: string } & DataForSeoLabsLocale)
  | ({ kind: "ranked_keywords"; targetUrl: string; tag: string } & DataForSeoLabsLocale);

/** A estimativa do Labs, sempre com o rótulo. Nunca é Volume. */
export type DataForSeoLabsEstimate = {
  searchVolume: number | null;
  label: typeof DATAFORSEO_ESTIMATE_LABEL;
};

export type DataForSeoLabsKeyword = {
  keyword: string;
  estimate: DataForSeoLabsEstimate;
  /** Só no `related_keywords`: 0 é a própria frase, 1 e 2 são os níveis. */
  relatedDepth: number | null;
  /** Só no `ranked_keywords`: a página e a posição em que ela aparece. */
  ranked: { url: string; rankGroup: number } | null;
};

export type DataForSeoLabsResearchResult = {
  kind: DataForSeoLabsResearchKind;
  endpoint: string;
  provider: typeof DATAFORSEO_LABS_PROVIDER;
  providerVersion: typeof DATAFORSEO_LABS_PROVIDER_VERSION;
  providerRequestId: string | null;
  /** O `cost` que a task informou, em US$. Toda task cobra, mesmo sem item. */
  cost: number | null;
  /** O `total_count` do resultado, quando veio. */
  totalCount: number | null;
  keywords: DataForSeoLabsKeyword[];
  /** Itens do `ranked_keywords` descartados por estarem acima da posição 20 ou fora do orgânico. */
  droppedByRank: number;
};

export type DataForSeoLabsResearchErrorCode =
  | "dataforseo_configuration"
  | "dataforseo_location_unsupported"
  | "dataforseo_invalid_request"
  | "dataforseo_timeout"
  | "dataforseo_http"
  | "dataforseo_invalid_response"
  | "dataforseo_task_failed"
  | "dataforseo_result_mismatch";

export class DataForSeoLabsResearchError extends Error {
  readonly code: DataForSeoLabsResearchErrorCode;
  readonly status: number;
  readonly providerRequestId: string | null;
  /** Custo que a task informou mesmo recusada, quando informou. */
  readonly cost: number | null;

  constructor(code: DataForSeoLabsResearchErrorCode, message: string, status = 502, providerRequestId: string | null = null, cost: number | null = null) {
    super(message);
    this.name = "DataForSeoLabsResearchError";
    this.code = code;
    this.status = status;
    this.providerRequestId = providerRequestId;
    this.cost = cost;
  }
}

function asRecord(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A mesma régua do `keyword_overview`: sem acento, sem caixa, espaços únicos. */
function comparable(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * O Labs desta pesquisa só aceita Brasil (2076) e português ("pt"). UF,
 * município ou outro país são recusados antes de montar o pedido.
 */
export function assertDataForSeoLabsLocale(locale: DataForSeoLabsLocale): DataForSeoLabsLocale {
  if (locale.locationCode !== DATAFORSEO_LABS_LOCATION_CODE) {
    throw new DataForSeoLabsResearchError("dataforseo_location_unsupported", "O DataForSEO Labs desta pesquisa recebe só o Brasil inteiro (2076). A UF vale apenas para o Google Ads.", 400);
  }
  const language = typeof locale.languageCode === "string" ? locale.languageCode.trim().toLowerCase() : "";
  if (language !== DATAFORSEO_LABS_LANGUAGE_CODE) {
    throw new DataForSeoLabsResearchError("dataforseo_location_unsupported", "O DataForSEO Labs desta pesquisa usa o idioma \"pt\".", 400);
  }
  return { locationCode: DATAFORSEO_LABS_LOCATION_CODE, languageCode: DATAFORSEO_LABS_LANGUAGE_CODE };
}

function requireKeyword(value: unknown): string {
  const keyword = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!keyword || keyword.length > 200) throw new DataForSeoLabsResearchError("dataforseo_invalid_request", "A frase da pesquisa Labs precisa ter de 1 a 200 caracteres.", 400);
  return keyword;
}

function requireTargetUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  let url: URL | null = null;
  try {
    url = raw ? new URL(raw) : null;
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname || url.username || url.password) {
    throw new DataForSeoLabsResearchError("dataforseo_invalid_request", "O ranked_keywords recebe o endereço completo de uma página do topo da SERP.", 400);
  }
  return raw;
}

function requireTag(value: unknown): string {
  const tag = typeof value === "string" ? value.trim() : "";
  if (!tag || tag.length > 255) throw new DataForSeoLabsResearchError("dataforseo_invalid_request", "O pedido Labs precisa do identificador da operação.", 400);
  return tag;
}

/** Monta o corpo exato de uma task Labs. Uma task por pedido. */
export function buildDataForSeoLabsResearchRequest(request: DataForSeoLabsResearchRequest): { endpoint: string; body: JsonObject[] } {
  const locale = assertDataForSeoLabsLocale(request);
  const tag = requireTag(request.tag);
  const common = { location_code: locale.locationCode, language_code: locale.languageCode, limit: DATAFORSEO_LABS_RESEARCH_LIMIT, tag };
  if (request.kind === "related_keywords") {
    return {
      endpoint: DATAFORSEO_LABS_RESEARCH_ENDPOINTS.related_keywords,
      body: [{ keyword: requireKeyword(request.keyword), ...common, depth: DATAFORSEO_LABS_RELATED_DEPTH, include_serp_info: false, include_clickstream_data: false }],
    };
  }
  if (request.kind === "keyword_ideas") {
    return {
      endpoint: DATAFORSEO_LABS_RESEARCH_ENDPOINTS.keyword_ideas,
      body: [{ keywords: [requireKeyword(request.keyword)], ...common, include_serp_info: false, include_clickstream_data: false }],
    };
  }
  if (request.kind === "ranked_keywords") {
    return {
      endpoint: DATAFORSEO_LABS_RESEARCH_ENDPOINTS.ranked_keywords,
      body: [{
        target: requireTargetUrl(request.targetUrl),
        ...common,
        item_types: ["organic"],
        filters: [["ranked_serp_element.serp_item.rank_group", "<=", DATAFORSEO_LABS_RANKED_MAX_RANK_GROUP]],
        include_clickstream_data: false,
      }],
    };
  }
  throw new DataForSeoLabsResearchError("dataforseo_invalid_request", "Tipo de pesquisa Labs desconhecido.", 400);
}

function estimateFrom(keywordInfo: unknown): DataForSeoLabsEstimate {
  const info = asRecord(keywordInfo);
  return { searchVolume: nonNegativeInteger(info?.search_volume), label: DATAFORSEO_ESTIMATE_LABEL };
}

function echoMismatch(record: JsonObject | null, locale: DataForSeoLabsLocale): boolean {
  if (!record) return false;
  const location = nonNegativeInteger(record.location_code);
  const language = text(record.language_code)?.toLowerCase() || null;
  return (location !== null && location !== locale.locationCode) || (language !== null && language !== locale.languageCode);
}

/**
 * Normaliza a resposta de UMA task Labs em lista de keywords.
 *
 * - task diferente de 20000 → `dataforseo_task_failed`;
 * - resultado com local ou idioma diferente do pedido (ou sem eco) → `dataforseo_result_mismatch`;
 * - `items` vazio ou nulo → lista vazia, não erro (a task cobra mesmo assim);
 * - `ranked_keywords`: só orgânico com `rank_group <= 20`, também aqui, além do filtro do pedido.
 */
export function normalizeDataForSeoLabsResearchResponse(body: unknown, request: DataForSeoLabsResearchRequest): DataForSeoLabsResearchResult {
  const locale = assertDataForSeoLabsLocale(request);
  const endpoint = DATAFORSEO_LABS_RESEARCH_ENDPOINTS[request.kind];
  const root = asRecord(body);
  const tasks = root?.tasks;
  if (!Array.isArray(tasks) || tasks.length !== 1) throw new DataForSeoLabsResearchError("dataforseo_invalid_response", "A DataForSEO retornou uma resposta Labs sem uma task única.");
  const task = asRecord(tasks[0]);
  const providerRequestId = typeof task?.id === "string" ? task.id : null;
  if (!task) throw new DataForSeoLabsResearchError("dataforseo_invalid_response", "A task Labs retornada pela DataForSEO é inválida.", 502, providerRequestId);
  const cost = nonNegativeNumber(task.cost) ?? nonNegativeNumber(root?.cost);
  if (nonNegativeInteger(task.status_code) !== 20000) {
    throw new DataForSeoLabsResearchError("dataforseo_task_failed", "A task Labs da DataForSEO não foi concluída com sucesso.", 502, providerRequestId, cost);
  }
  const base: DataForSeoLabsResearchResult = {
    kind: request.kind,
    endpoint,
    provider: DATAFORSEO_LABS_PROVIDER,
    providerVersion: DATAFORSEO_LABS_PROVIDER_VERSION,
    providerRequestId,
    cost,
    totalCount: null,
    keywords: [],
    droppedByRank: 0,
  };
  const results = Array.isArray(task.result) ? task.result : [];
  // Sem resultado: a base não tem dado para a frase. Lista vazia, e a task já cobrou.
  if (!results.length) return base;
  if (results.length !== 1) throw new DataForSeoLabsResearchError("dataforseo_invalid_response", "A DataForSEO retornou mais de um resultado para uma task Labs.", 502, providerRequestId, cost);
  const result = asRecord(results[0]);
  if (!result) throw new DataForSeoLabsResearchError("dataforseo_invalid_response", "O resultado Labs da DataForSEO é inválido.", 502, providerRequestId, cost);

  const resultLocation = nonNegativeInteger(result.location_code);
  const resultLanguage = text(result.language_code)?.toLowerCase() || null;
  if (resultLocation !== locale.locationCode || resultLanguage !== locale.languageCode) {
    throw new DataForSeoLabsResearchError("dataforseo_result_mismatch", "O resultado Labs não corresponde à localidade ou ao idioma solicitados.", 502, providerRequestId, cost);
  }
  if (request.kind === "related_keywords") {
    const seed = text(result.seed_keyword);
    if (seed && comparable(seed) !== comparable(request.keyword)) {
      throw new DataForSeoLabsResearchError("dataforseo_result_mismatch", "O resultado Labs não corresponde à frase pesquisada.", 502, providerRequestId, cost);
    }
  }

  const items = Array.isArray(result.items) ? result.items : [];
  const keywords: DataForSeoLabsKeyword[] = [];
  let droppedByRank = 0;
  for (const raw of items) {
    if (keywords.length >= DATAFORSEO_LABS_RESEARCH_LIMIT) break;
    const item = asRecord(raw);
    if (!item) continue;
    if (request.kind === "keyword_ideas") {
      if (echoMismatch(item, locale)) throw new DataForSeoLabsResearchError("dataforseo_result_mismatch", "Um item Labs não corresponde à localidade ou ao idioma solicitados.", 502, providerRequestId, cost);
      const keyword = text(item.keyword);
      if (!keyword) continue;
      keywords.push({ keyword, estimate: estimateFrom(item.keyword_info), relatedDepth: null, ranked: null });
      continue;
    }
    const data = asRecord(item.keyword_data);
    if (echoMismatch(data, locale)) throw new DataForSeoLabsResearchError("dataforseo_result_mismatch", "Um item Labs não corresponde à localidade ou ao idioma solicitados.", 502, providerRequestId, cost);
    const keyword = text(data?.keyword);
    if (!keyword) continue;
    if (request.kind === "related_keywords") {
      keywords.push({ keyword, estimate: estimateFrom(data?.keyword_info), relatedDepth: nonNegativeInteger(item.depth), ranked: null });
      continue;
    }
    const serpItem = asRecord(asRecord(item.ranked_serp_element)?.serp_item);
    const rankGroup = nonNegativeInteger(serpItem?.rank_group);
    const type = text(serpItem?.type);
    const url = text(serpItem?.url);
    if (rankGroup === null || rankGroup < 1 || rankGroup > DATAFORSEO_LABS_RANKED_MAX_RANK_GROUP || (type !== null && type !== "organic") || !url) {
      droppedByRank += 1;
      continue;
    }
    keywords.push({ keyword, estimate: estimateFrom(data?.keyword_info), relatedDepth: null, ranked: { url, rankGroup } });
  }
  return { ...base, totalCount: nonNegativeInteger(result.total_count), keywords, droppedByRank };
}

export type DataForSeoLabsExecutionConfig = {
  login: string;
  password: string;
  baseUrl: string;
  timeoutMs: number;
};

/**
 * Faz UMA chamada Labs. `fetchImpl` permite testar sem rede e sem crédito.
 * `onRequestStarted` diz a quem chama que o pedido saiu: daí em diante a task
 * pode ter cobrado, mesmo que a resposta falhe.
 */
export async function executeDataForSeoLabsResearch(
  request: DataForSeoLabsResearchRequest,
  options: { config: DataForSeoLabsExecutionConfig; fetchImpl?: typeof fetch; onRequestStarted?: () => void },
): Promise<DataForSeoLabsResearchResult> {
  const built = buildDataForSeoLabsResearchRequest(request);
  if (!options.config?.login || !options.config?.password || !options.config?.baseUrl) {
    throw new DataForSeoLabsResearchError("dataforseo_configuration", "A credencial DataForSEO não foi resolvida no servidor.", 503);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.config.timeoutMs);
  let response: Response;
  try {
    const credentials = Buffer.from(`${options.config.login}:${options.config.password}`, "utf8").toString("base64");
    options.onRequestStarted?.();
    response = await fetchImpl(`${options.config.baseUrl}${built.endpoint}`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new DataForSeoLabsResearchError("dataforseo_timeout", "A DataForSEO não respondeu dentro do limite configurado.", 504);
    throw new DataForSeoLabsResearchError("dataforseo_http", "Não foi possível conectar à DataForSEO.", 502);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new DataForSeoLabsResearchError("dataforseo_http", `A DataForSEO retornou HTTP ${response.status}.`, response.status >= 500 ? 502 : response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DataForSeoLabsResearchError("dataforseo_invalid_response", "A resposta Labs da DataForSEO não é um JSON válido.");
  }
  return normalizeDataForSeoLabsResearchResponse(body, request);
}
