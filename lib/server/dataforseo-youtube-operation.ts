import { DataForSeoSerpError, type DataForSeoSerpConfig } from "../minerador/dataforseo-serp-core.ts";
import { RadarYoutubeSearchResultSchema, type RadarYoutubeSearchResult } from "../radar/youtube-search-model.ts";
import { RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH, RADAR_YOUTUBE_MAX_BLOCK_DEPTH, RADAR_YOUTUBE_PROVIDER_ENDPOINT } from "../radar/youtube-search-run.ts";

/**
 * A SERP DO YOUTUBE, DE VERDADE — YOUTUBE_SEARCH_1 · §4.
 *
 * ===================== POR QUE NÃO O BLOCO DE VÍDEOS DO GOOGLE =====================
 *
 * Até aqui o modo YouTube do Radar lia o bloco de vídeos da SERP do Google:
 * dava para saber QUE vídeo aparece ali, e nada além disso — sem duração, sem
 * visualizações, sem canal confiável. É outra pergunta: aquilo é "que vídeo o
 * Google mostra", e o que este gate precisa é "quem compete DENTRO do YouTube".
 *
 * A DataForSEO tem a família `/v3/serp/youtube/...`, e é ela que responde.
 *
 * ========================= E NÃO É A BIBLIOTECA VÍDEOS =========================
 *
 * O §4 proíbe usar a área Vídeos como substituta da SERP, e a razão é de
 * método: a biblioteca é o que a marca ESCOLHEU: usá-la como universo
 * competitivo faria o benchmark comparar a marca com ela mesma.
 *
 * ============================ ZERO CHAMADA EM TESTE ============================
 *
 * `fetchImpl` é injetável e a normalização é uma função pura separada da
 * requisição. Os testes exercitam `normalizeDataForSeoYoutubeResponse` com
 * payload gravado; nenhum deles alcança a rede.
 */

/**
 * O ADAPTADOR LÊ A POLÍTICA; ELE NÃO A DEFINE — 1.3 · §4.
 *
 * Endereço e profundidade passaram a morar no domínio (`youtube-search-run`)
 * porque a corrida é gravada ANTES da chamada, pela tela, e ela precisa
 * declarar com que política começou. Duas definições da mesma constante é como
 * a proveniência passa a descrever uma coleta que não foi a que aconteceu.
 *
 * VINTE, NÃO CEM, continua valendo: a coleta real com `block_depth=100`
 * devolveu 114 itens cuja cauda era derivação lateral do assunto. Expandir é
 * ação explícita de um gate futuro; o teto impede pedir 100 por engano.
 */
export const DATAFORSEO_YOUTUBE_ENDPOINT = RADAR_YOUTUBE_PROVIDER_ENDPOINT;
export { RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH, RADAR_YOUTUBE_MAX_BLOCK_DEPTH };

export type DataForSeoYoutubeOperationInput = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  resultLimit: number;
  operationRequestId: string;
};

export function buildDataForSeoYoutubeRequest(input: DataForSeoYoutubeOperationInput) {
  const keyword = input.keyword.trim();
  if (!keyword) throw new DataForSeoSerpError("dataforseo_invalid_response", "A consulta de YouTube é inválida.", 400);
  if (!Number.isSafeInteger(input.locationCode) || input.locationCode < 1) throw new DataForSeoSerpError("dataforseo_invalid_response", "A localidade da consulta de YouTube é inválida.", 400);
  if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(input.languageCode.trim())) throw new DataForSeoSerpError("dataforseo_invalid_response", "O idioma da consulta de YouTube é inválido.", 400);
  if (!Number.isSafeInteger(input.resultLimit) || input.resultLimit < 1 || input.resultLimit > RADAR_YOUTUBE_MAX_BLOCK_DEPTH) throw new DataForSeoSerpError("dataforseo_invalid_response", "O limite da consulta de YouTube é inválido.", 400);
  if (!input.operationRequestId.trim()) throw new DataForSeoSerpError("dataforseo_invalid_response", "A operação de YouTube não possui identificador válido.", 400);

  return {
    query: keyword,
    body: [{
      keyword,
      location_code: input.locationCode,
      /*
       * ============ O IDIOMA VAI EM BCP-47 — 2.1 · §3 ============
       *
       * A configuração canônica minusculiza tudo (`pt-br`), porque foi escrita
       * para a SERP do Google. A chamada de YouTube que o usuário confirmou à
       * mão usou `pt-BR`, e o provider ECOOU `pt-BR`.
       *
       * Mandar a subtag de região em minúscula é uma transformação NOSSA que a
       * chamada boa não tinha. Se a lista de idiomas do YouTube for sensível a
       * caixa, ela sozinha explica uma tarefa que volta sem resultado.
       */
      language_code: normalizarIdiomaBcp47(input.languageCode),
      /*
       * ============ `block_depth`, NÃO `depth` — 2.1 · §2 ============
       *
       * ESTE É O SHAPE HERDADO DO GOOGLE QUE O §2 PROÍBE.
       *
       * `depth` é o parâmetro do `/v3/serp/google/organic/...` — está em
       * `dataforseo-serp-operation.ts` e foi copiado para cá. O endpoint de
       * YouTube ecoa `block_depth`, e foi `block_depth` que a chamada manual
       * confirmada usou. Um campo desconhecido não é ignorado em silêncio pela
       * DataForSEO: a tarefa volta com status de campo inválido e `result`
       * nulo — HTTP 200, zero item, "coleta concluída".
       */
      block_depth: input.resultLimit,
      tag: input.operationRequestId.trim(),
    }],
  };
}

/**
 * `pt-br` → `pt-BR`. Língua em minúscula, região em maiúscula — BCP-47.
 *
 * Sem região, devolve como está: `pt` continua `pt`.
 */
export function normalizarIdiomaBcp47(valor: string): string {
  const [lingua, regiao] = valor.trim().split("-");
  return regiao ? `${lingua.toLowerCase()}-${regiao.toUpperCase()}` : lingua.toLowerCase();
}

/* ============================== a normalização ============================ */

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

const inteiro = (valor: unknown): number | null =>
  typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : null;

/**
 * O `videoId` É A IDENTIDADE — e ela vem da URL quando o provider não a nomeia.
 *
 * Sem ele não há dedupe: o mesmo vídeo encontrado por quatro consultas viraria
 * quatro concorrentes. Um item sem id e sem URL reconhecível é descartado, e a
 * contagem de descartados vai para a proveniência — nunca some em silêncio.
 */
export function radarYoutubeVideoIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const endereco = new URL(url);
    if (/(^|\.)youtu\.be$/.test(endereco.hostname)) {
      const caminho = endereco.pathname.replace(/^\//, "").trim();
      return caminho || null;
    }
    if (!/(^|\.)youtube\.com$/.test(endereco.hostname)) return null;
    const parametro = endereco.searchParams.get("v");
    if (parametro && parametro.trim()) return parametro.trim();
    const curto = endereco.pathname.match(/^\/(?:shorts|embed|v)\/([^/]+)/);
    return curto ? curto[1] : null;
  } catch {
    return null;
  }
}

/**
 * A DURAÇÃO EM SEGUNDOS — e `null` quando o formato não é reconhecível.
 *
 * O provider devolve `"12:34"` ou `"1:02:03"`. Estimar um número a partir de
 * algo que não casa faria a separação entre Short e tutorial mentir, que é
 * justamente o critério do universo competitivo.
 */
export function radarYoutubeDurationSeconds(valor: unknown): number | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  if (!/^\d{1,2}(?::\d{2}){1,2}$/.test(bruto)) return null;
  const partes = bruto.split(":").map(Number);
  if (partes.some(parte => !Number.isFinite(parte))) return null;
  return partes.reduce((total, parte) => total * 60 + parte, 0);
}

/**
 * O QUE O PROVIDER DISSE SOBRE O FORMATO — e `null` quando não disse nada.
 *
 * `is_shorts` chega como booleano de verdade no payload real. Tratar ausência
 * como `false` afirmaria "este vídeo NÃO é Short", e um item sem o campo iria
 * para a coorte de long-form por omissão — exatamente o erro que o §4 proíbe.
 */
const booleano = (valor: unknown): boolean | null => typeof valor === "boolean" ? valor : null;

/**
 * O QUE O PROVIDER DIZ SOBRE A PRÓPRIA COLETA — §3.
 *
 * `device`, `os` e `block_depth` não são escolha nossa que a gente repete de
 * memória: são o ECO do que a DataForSEO executou. Guardar o eco é o que
 * permite dizer "esta coleta foi mobile/android com profundidade 20" meses
 * depois, em vez de deduzir a partir do que achamos ter pedido.
 *
 * `checkUrl` é o endereço em que a busca pode ser conferida à mão, e
 * `seResultsCount` é o tamanho do universo que o YouTube declara existir — útil
 * justamente para dizer que 20 itens NÃO são "tudo o que existe".
 */
export type RadarYoutubeQuerySearchMetadata = {
  keyword: string | null;
  locationCode: number | null;
  languageCode: string | null;
  device: string | null;
  os: string | null;
  blockDepth: number | null;
  checkUrl: string | null;
  seResultsCount: number | null;
  itemsCount: number | null;
  /** O custo que o provider cobrou por esta tarefa, verbatim. Nunca estimado. */
  cost: number | null;
};

/**
 * ============ A MEDIÇÃO POR CONSULTA — 2.1 · §1 ============
 *
 * PROVIDER RAW → PARSER → NORMALIZER → DEDUPE → UNIVERSE, com número em cada
 * seta. Sem isto, "0 vídeos" cobria pelo menos três histórias diferentes: o
 * provider não devolveu nada, a tarefa dele falhou, ou nós não soubemos ler o
 * que ele devolveu — e as três pedem ações opostas.
 *
 * Não vai para a tela normal (§1). Vive na proveniência técnica.
 */
export type RadarYoutubeQueryDiagnostics = {
  /** O status da TAREFA, dentro do corpo. HTTP 200 com tarefa 40501 é falha. */
  providerStatusCode: number | null;
  providerStatusMessage: string | null;
  taskCount: number;
  resultCount: number;
  /** O que o provider DIZ que devolveu, no cabeçalho do resultado. */
  declaredItemsCount: number | null;
  itemTypes: string[];
  /** O que veio de verdade no array. Divergir de `declaredItemsCount` é sinal. */
  rawItems: number;
  rawYoutubeVideos: number;
  /*
   * ======== §13 · A CONTAGEM DE SHORTS EM CADA ELO DA CORRENTE ========
   *
   * Uma coleta real devolveu 47 vídeos e 0 Shorts, e a SERP manual da mesma
   * keyword estava cheia deles. "0 Short(s)" na tela cobre duas histórias
   * opostas: o provider não marcou nenhum, ou marcou e a gente perdeu no
   * caminho. A primeira é resposta dele; a segunda é defeito nosso.
   *
   * Com os dois números lado a lado a pergunta deixa de precisar de palpite.
   */
  rawShorts: number;
  normalizedShorts: number;
  normalized: number;
  discarded: number;
  /** Por que cada item foi descartado, contado. Descarte sem motivo não existe. */
  discardReasons: Record<string, number>;
};

export type RadarYoutubeNormalization = {
  results: RadarYoutubeSearchResult[];
  /** Itens que vieram e não puderam virar resultado. Declarado, nunca omitido. */
  discarded: number;
  search: RadarYoutubeQuerySearchMetadata;
  diagnostics: RadarYoutubeQueryDiagnostics;
};

/**
 * ============ 2.1 · §4 · SUCESSO FALSO NÃO EXISTE ============
 *
 * Se o provider devolveu `youtube_video` e a normalização produziu zero, o
 * defeito é NOSSO — e chamar isso de "coleta concluída" esconde um bug de
 * adapter atrás de uma tela que parece correta.
 *
 * Se a tarefa do provider falhou, também não houve coleta: houve recusa.
 */
export class DataForSeoYoutubeReadError extends Error {
  readonly code: string;
  readonly diagnostics: RadarYoutubeQueryDiagnostics;
  constructor(code: string, message: string, diagnostics: RadarYoutubeQueryDiagnostics) {
    super(message);
    this.name = "DataForSeoYoutubeReadError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

const METADADO_VAZIO: RadarYoutubeQuerySearchMetadata = {
  keyword: null, locationCode: null, languageCode: null, device: null, os: null,
  blockDepth: null, checkUrl: null, seResultsCount: null, itemsCount: null, cost: null,
};

/**
 * O QUE VEIO, TRADUZIDO — e nada além disso.
 *
 * Campo ausente vira `null`, nunca zero nem string vazia: o §5 é explícito
 * sobre não inventar campo ausente. Um `views: 0` afirmaria que ninguém viu o
 * vídeo, quando o que aconteceu foi o provider não ter informado.
 */
export function normalizeDataForSeoYoutubeResponse(body: unknown, queryId: string): RadarYoutubeNormalization {
  const raiz = objeto(body);
  /*
   * A RESPOSTA CHEGA EM DOIS FORMATOS, E OS DOIS SÃO REAIS.
   *
   * A API devolve `{ tasks: [...] }`; o payload que o usuário inspecionou à mão
   * é UMA tarefa já desembrulhada — `{ data, result }` na raiz. Aceitar só o
   * primeiro faria a fixture real ser lida como resposta vazia, e a suíte
   * validaria o normalizador contra um payload que ninguém recebe.
   */
  const tarefas = Array.isArray(raiz?.tasks) ? raiz.tasks : raiz ? [raiz] : [];
  const resultados: RadarYoutubeSearchResult[] = [];
  let discarded = 0;
  let posicao = 0;
  let search = METADADO_VAZIO;

  /* §1 · a medição, contada enquanto se lê — nunca reconstruída depois. */
  const diagnostics: RadarYoutubeQueryDiagnostics = {
    providerStatusCode: null, providerStatusMessage: null,
    taskCount: tarefas.length, resultCount: 0,
    declaredItemsCount: null, itemTypes: [],
    rawItems: 0, rawYoutubeVideos: 0, rawShorts: 0, normalizedShorts: 0, normalized: 0, discarded: 0, discardReasons: {},
  };
  const descartar = (motivo: string) => {
    discarded += 1;
    diagnostics.discardReasons[motivo] = (diagnostics.discardReasons[motivo] || 0) + 1;
  };

  for (const tarefa of tarefas) {
    const dadosDaTarefa = objeto(tarefa);
    const pedido = objeto(dadosDaTarefa?.data);
    /*
     * O STATUS DA TAREFA — §4, e ele mora DENTRO do corpo.
     *
     * A DataForSEO devolve HTTP 200 e reporta o problema da tarefa aqui: campo
     * inválido, idioma desconhecido, cota. Sem ler isto, toda recusa dela virava
     * "coleta concluída com zero vídeos" na nossa tela.
     */
    if (diagnostics.providerStatusCode === null && typeof dadosDaTarefa?.status_code === "number") {
      diagnostics.providerStatusCode = dadosDaTarefa.status_code;
      diagnostics.providerStatusMessage = texto(dadosDaTarefa?.status_message);
    }
    diagnostics.resultCount += Array.isArray(dadosDaTarefa?.result) ? dadosDaTarefa.result.length : 0;
    for (const resultado of (Array.isArray(dadosDaTarefa?.result) ? dadosDaTarefa.result : [])) {
      const dados = objeto(resultado);
      /* O eco do que o provider executou — §3, e é dele, não nosso. */
      if (search === METADADO_VAZIO) {
        search = {
          keyword: texto(dados?.keyword) || texto(pedido?.keyword),
          locationCode: inteiro(dados?.location_code) ?? inteiro(pedido?.location_code),
          languageCode: texto(dados?.language_code) || texto(pedido?.language_code),
          device: texto(pedido?.device),
          os: texto(pedido?.os),
          blockDepth: inteiro(pedido?.block_depth) ?? inteiro(pedido?.depth),
          checkUrl: texto(dados?.check_url),
          seResultsCount: inteiro(dados?.se_results_count),
          itemsCount: inteiro(dados?.items_count),
          cost: typeof dadosDaTarefa?.cost === "number" && Number.isFinite(dadosDaTarefa.cost) ? dadosDaTarefa.cost : null,
        };
        /*
         * §1 · O QUE O PROVIDER DIZ QUE DEVOLVEU, ao lado do que veio de fato.
         *
         * `items_count` divergindo de `items.length` é o sinal de que a leitura
         * parou no meio — e sem os dois lado a lado ninguém nota.
         */
        diagnostics.declaredItemsCount = inteiro(dados?.items_count);
        diagnostics.itemTypes = Array.isArray(dados?.item_types) ? dados.item_types.map(String) : [];
      }
      for (const item of (Array.isArray(dados?.items) ? dados.items : [])) {
        diagnostics.rawItems += 1;
        const registro = objeto(item);
        if (!registro) { descartar("item_nao_e_objeto"); continue; }
        /* §1 · quantos itens o provider marcou como vídeo, ANTES de qualquer leitura nossa. */
        if (texto(registro.type) === "youtube_video") diagnostics.rawYoutubeVideos += 1;
        /* §13 · quantos o PROVIDER marcou como Short, antes de qualquer leitura nossa. */
        if (registro.is_shorts === true) diagnostics.rawShorts += 1;

        const url = texto(registro.url);
        const videoId = texto(registro.video_id) || radarYoutubeVideoIdFromUrl(url);
        const title = texto(registro.title);
        if (!videoId || !url || !title) {
          descartar(!videoId ? "sem_video_id" : !url ? "sem_url" : "sem_titulo");
          continue;
        }

        posicao += 1;
        const selos: string[] = [];
        for (const chave of ["badges", "features"]) {
          const lista = registro[chave];
          if (Array.isArray(lista)) for (const selo of lista) { const limpo = texto(selo); if (limpo) selos.push(limpo); }
        }
        /* O tipo do item é um selo como outro qualquer: "video", "video_shorts". */
        const tipo = texto(registro.type);
        if (tipo && tipo !== "youtube_video") selos.push(tipo);

        const rankAbsolute = inteiro(registro.rank_absolute);
        const rankGroup = inteiro(registro.rank_group);

        resultados.push(RadarYoutubeSearchResultSchema.parse({
          videoId,
          url,
          title,
          channelName: texto(registro.channel_name) || texto(registro.author),
          channelId: texto(registro.channel_id),
          channelUrl: texto(registro.channel_url),
          channelLogo: texto(registro.channel_logo),
          rank: rankAbsolute || rankGroup || posicao,
          rankGroup,
          rankAbsolute,
          blockRank: inteiro(registro.block_rank),
          /*
           * `publication_date` É RÓTULO ("há 7 meses"); `timestamp` É O INSTANTE.
           *
           * Antes desta correção o rótulo caía em `publishedAt`, e qualquer
           * conta de recência lia "há 7 meses" como data inválida — silenciosa,
           * porque o campo é string dos dois lados.
           */
          publishedAt: texto(registro.timestamp),
          publishedAtLabel: texto(registro.publication_date),
          /*
           * A DURAÇÃO JÁ VEM EM SEGUNDOS — e o número do provider ganha do
           * rótulo que a gente reparsearia. `duration_time` fica como rótulo.
           */
          durationSeconds: inteiro(registro.duration_time_seconds) ?? radarYoutubeDurationSeconds(registro.duration_time) ?? inteiro(registro.duration),
          durationLabel: texto(registro.duration_time),
          views: inteiro(registro.views_count),
          description: texto(registro.description) || texto(registro.snippet),
          thumbnailUrl: texto(registro.thumbnail_url),
          isShorts: booleano(registro.is_shorts),
          isLive: booleano(registro.is_live),
          isMovie: booleano(registro.is_movie),
          badges: [...new Set(selos)],
          queryId,
        }));
      }
    }
  }

  diagnostics.normalized = resultados.length;
  /* §13 · e quantos atravessaram. `rawShorts > 0` com isto em 0 é defeito NOSSO. */
  diagnostics.normalizedShorts = resultados.filter(item => item.isShorts === true).length;
  diagnostics.discarded = discarded;
  return { results: resultados, discarded, search, diagnostics };
}

/* =============================== a execução ============================== */

export async function executeDataForSeoYoutubeQuery(
  input: DataForSeoYoutubeOperationInput & { queryId: string },
  options: { config: DataForSeoSerpConfig; fetchImpl?: typeof fetch },
): Promise<RadarYoutubeNormalization> {
  const config = options.config;
  const fetchImpl = options.fetchImpl ?? fetch;
  const montada = buildDataForSeoYoutubeRequest(input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    const credenciais = Buffer.from(`${config.login}:${config.password}`, "utf8").toString("base64");
    response = await fetchImpl(`${config.baseUrl}${DATAFORSEO_YOUTUBE_ENDPOINT}`, {
      method: "POST",
      headers: { Authorization: `Basic ${credenciais}`, "Content-Type": "application/json" },
      body: JSON.stringify(montada.body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new DataForSeoSerpError("dataforseo_timeout", "A DataForSEO não respondeu dentro do limite configurado.", 504);
    throw new DataForSeoSerpError("dataforseo_http", "Não foi possível conectar à DataForSEO.", 502);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new DataForSeoSerpError("dataforseo_http", `A DataForSEO retornou HTTP ${response.status}.`, response.status >= 500 ? 502 : response.status);
  let body: unknown;
  try { body = await response.json(); } catch { throw new DataForSeoSerpError("dataforseo_invalid_response", "A resposta da DataForSEO não é um JSON válido."); }

  const normalizada = normalizeDataForSeoYoutubeResponse(body, input.queryId);
  assertRadarYoutubeReadable(normalizada);
  return normalizada;
}

/**
 * ============ 2.1 · §4 · OS DOIS ZEROS NÃO SÃO O MESMO ZERO ============
 *
 * "O YouTube não devolveu vídeo para esta consulta" é um resultado.
 * "A tarefa do provider falhou" e "não soubemos ler o que ele devolveu" são
 * DEFEITOS, e chamá-los de coleta concluída foi o que escondeu este bug atrás
 * de uma tela que parecia certa.
 *
 * `DATAFORSEO_STATUS_OK` é 20000; a família 2xxxx é sucesso. Qualquer outra
 * coisa é recusa da tarefa, mesmo com HTTP 200.
 */
export const DATAFORSEO_TASK_OK_MIN = 20000;
export const DATAFORSEO_TASK_OK_MAX = 29999;

export function assertRadarYoutubeReadable(normalizada: RadarYoutubeNormalization): void {
  const diagnostico = normalizada.diagnostics;

  const status = diagnostico.providerStatusCode;
  if (status !== null && (status < DATAFORSEO_TASK_OK_MIN || status > DATAFORSEO_TASK_OK_MAX)) {
    throw new DataForSeoYoutubeReadError(
      "YOUTUBE_PROVIDER_TASK_FAILED",
      `A DataForSEO recusou a tarefa (${status}): ${diagnostico.providerStatusMessage || "sem mensagem"}.`,
      diagnostico,
    );
  }

  /*
   * O PROVIDER MANDOU VÍDEO E NÓS PRODUZIMOS ZERO — o bug é do adapter.
   *
   * Este é exatamente o estado que o §4 nomeia: não anunciar "coleta
   * concluída" quando a falha é de leitura nossa.
   */
  if (diagnostico.rawYoutubeVideos > 0 && diagnostico.normalized === 0) {
    const motivos = Object.entries(diagnostico.discardReasons).map(([motivo, quantos]) => `${motivo}=${quantos}`).join(", ");
    throw new DataForSeoYoutubeReadError(
      "YOUTUBE_NORMALIZATION_EMPTY",
      `O provider devolveu ${diagnostico.rawYoutubeVideos} vídeo(s) e a normalização produziu zero${motivos ? ` (${motivos})` : ""}.`,
      diagnostico,
    );
  }
}
