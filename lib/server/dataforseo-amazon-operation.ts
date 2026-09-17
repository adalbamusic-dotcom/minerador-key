import { DataForSeoSerpError, type DataForSeoSerpConfig } from "../minerador/dataforseo-serp-core.ts";
import {
  RadarAmazonRelatedSearchSchema,
  RadarAmazonSerpResultSchema,
  type RadarAmazonRelatedSearch,
  type RadarAmazonSerpResult,
} from "../radar/amazon-search-model.ts";
import { assertRadarProviderLocale, radarMerchantAmazonLocale } from "../radar/provider-locale.ts";

/**
 * ===== A SERP DA AMAZON — AMAZON_SEARCH_1 · §6, §14 e §15 =====
 *
 * ==================== O ENDPOINT VEIO DO CATÁLOGO ====================
 *
 * A documentação de `task_post` sugere fluxo assíncrono. O catálogo da conta
 * (`price.merchant.amazon.products`) expõe `live`, e é ele que vale: existe
 * variante SÍNCRONA, e é a que este adapter usa. Onde doc e catálogo divergem,
 * o catálogo descreve o que ESTA conta pode chamar.
 *
 * ==================== O IDIOMA É `pt_BR`, COM UNDERSCORE ====================
 *
 * A primeira chamada real deste projeto voltou `40501 · Invalid Field:
 * 'language_code'` por mandar `pt-BR`, que é a grafia do YouTube. A tradução
 * mora em `provider-locale`, e este adapter CONFERE o que vai enviar — um
 * `.replace()` local reabriria a mesma divergência em outro arquivo.
 *
 * O MESMO ERRO VOLTOU POR OUTRO MOTIVO — 2.1 · PARTE A. A configuração canônica
 * entrega `"pt"`, sem região, e a Merchant API recusa o idioma sem ela. Quem
 * completa a região é o MERCADO já declarado no pedido (`location_code`), e a
 * regra mora na mesma autoridade — não aqui.
 *
 * ZERO CHAMADA EM TESTE: a normalização é pura e separada da requisição.
 */

export const DATAFORSEO_AMAZON_ENDPOINT = "/v3/merchant/amazon/products/live/advanced";

/**
 * VINTE, NÃO CEM.
 *
 * O padrão do provider é 100 e o teto é 700. A descoberta com 20 devolveu 56
 * itens — a Amazon devolve mais do que se pede, e a cauda é derivação lateral
 * da busca. Expandir é decisão de um gate futuro, com motivo.
 */
export const RADAR_AMAZON_DEFAULT_DEPTH = 20;
export const RADAR_AMAZON_MAX_DEPTH = 100;

export type DataForSeoAmazonOperationInput = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  depth: number;
  operationRequestId: string;
};

export function buildDataForSeoAmazonRequest(input: DataForSeoAmazonOperationInput) {
  const keyword = input.keyword.trim();
  if (!keyword) throw new DataForSeoSerpError("dataforseo_invalid_response", "A consulta da Amazon é inválida.", 400);
  if (!Number.isSafeInteger(input.locationCode) || input.locationCode < 1) {
    throw new DataForSeoSerpError("dataforseo_invalid_response", "A localidade da consulta da Amazon é inválida.", 400);
  }
  if (!Number.isSafeInteger(input.depth) || input.depth < 1 || input.depth > RADAR_AMAZON_MAX_DEPTH) {
    throw new DataForSeoSerpError("dataforseo_invalid_response", "A profundidade da consulta da Amazon é inválida.", 400);
  }
  if (!input.operationRequestId.trim()) {
    throw new DataForSeoSerpError("dataforseo_invalid_response", "A operação da Amazon não possui identificador válido.", 400);
  }

  /*
   * §13 e 2.1 · A GRAFIA É TRADUZIDA, COMPLETADA PELO MERCADO E CONFERIDA.
   *
   * A tradução sozinha não bastava: a configuração canônica entrega `"pt"`, sem
   * região, e a Merchant API recusa a tarefa sem ela. A região vem do
   * `location_code` que este mesmo pedido já declara — não de um palpite.
   *
   * Traduzir sem conferir deixaria passar uma entrada já errada; conferir sem
   * traduzir exigiria que todo chamador soubesse a convenção da Merchant API.
   */
  const languageCode = radarMerchantAmazonLocale(input.languageCode, input.locationCode);
  assertRadarProviderLocale(languageCode, "MERCHANT_AMAZON");

  return {
    query: keyword,
    body: [{
      keyword,
      location_code: input.locationCode,
      language_code: languageCode,
      depth: input.depth,
      tag: input.operationRequestId.trim(),
    }],
  };
}

/* ============================== a normalização ============================== */

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

const numero = (valor: unknown): number | null =>
  typeof valor === "number" && Number.isFinite(valor) ? valor : null;

const inteiro = (valor: unknown): number | null => {
  const bruto = numero(valor);
  return bruto === null || bruto < 0 ? null : Math.round(bruto);
};

/**
 * ============ §15 · A MEDIÇÃO, CONTADA ENQUANTO SE LÊ ============
 *
 * "Zero produtos" cobre três histórias que pedem ações opostas: o provider
 * recusou a tarefa, a busca não tem produto, ou nós não soubemos ler o que
 * veio. Sem os números de cada elo, as três viram a mesma tela.
 */
export type RadarAmazonQueryDiagnostics = {
  providerStatusCode: number | null;
  providerStatusMessage: string | null;
  taskCount: number;
  resultCount: number;
  declaredItemsCount: number | null;
  itemTypes: string[];
  rawItems: number;
  rawOrganic: number;
  rawSponsored: number;
  normalized: number;
  discarded: number;
  discardReasons: Record<string, number>;
};

export type RadarAmazonQuerySearchMetadata = {
  keyword: string | null;
  locationCode: number | null;
  languageCode: string | null;
  seDomain: string | null;
  checkUrl: string | null;
  seResultsCount: number | null;
  itemsCount: number | null;
  cost: number | null;
};

export type RadarAmazonNormalization = {
  results: RadarAmazonSerpResult[];
  relatedSearches: RadarAmazonRelatedSearch[];
  discarded: number;
  search: RadarAmazonQuerySearchMetadata;
  diagnostics: RadarAmazonQueryDiagnostics;
};

const METADADO_VAZIO: RadarAmazonQuerySearchMetadata = {
  keyword: null, locationCode: null, languageCode: null, seDomain: null,
  checkUrl: null, seResultsCount: null, itemsCount: null, cost: null,
};

/**
 * ============ §14 · HTTP 200 NÃO É SUCESSO DA TAREFA ============
 *
 * Já aconteceu: a chamada de descoberta voltou HTTP 200 com
 * `task.status_code = 40501 · Invalid Field: 'language_code'` e custo zero.
 * Tratar isso como SERP vazia esconderia a recusa atrás de uma tela correta —
 * e o Radar pagaria a próxima tentativa sem nunca ver o motivo.
 */
export class DataForSeoAmazonReadError extends Error {
  readonly code: string;
  readonly diagnostics: RadarAmazonQueryDiagnostics;
  constructor(code: string, message: string, diagnostics: RadarAmazonQueryDiagnostics) {
    super(message);
    this.name = "DataForSeoAmazonReadError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export function normalizeDataForSeoAmazonResponse(body: unknown, queryId: string): RadarAmazonNormalization {
  const raiz = objeto(body);
  /* A API devolve `{ tasks: [...] }`; uma tarefa desembrulhada também é real. */
  const tarefas = Array.isArray(raiz?.tasks) ? raiz.tasks : raiz ? [raiz] : [];

  const results: RadarAmazonSerpResult[] = [];
  const relatedSearches: RadarAmazonRelatedSearch[] = [];
  let discarded = 0;

  const diagnostics: RadarAmazonQueryDiagnostics = {
    providerStatusCode: null, providerStatusMessage: null,
    taskCount: tarefas.length, resultCount: 0,
    declaredItemsCount: null, itemTypes: [],
    rawItems: 0, rawOrganic: 0, rawSponsored: 0,
    normalized: 0, discarded: 0, discardReasons: {},
  };
  const descartar = (motivo: string) => {
    discarded += 1;
    diagnostics.discardReasons[motivo] = (diagnostics.discardReasons[motivo] || 0) + 1;
  };

  let search = METADADO_VAZIO;

  for (const bruta of tarefas) {
    const tarefa = objeto(bruta);
    const pedido = objeto(tarefa?.data);

    if (diagnostics.providerStatusCode === null && typeof tarefa?.status_code === "number") {
      diagnostics.providerStatusCode = tarefa.status_code;
      diagnostics.providerStatusMessage = texto(tarefa?.status_message);
    }

    const resultados = Array.isArray(tarefa?.result) ? tarefa.result : [];
    diagnostics.resultCount += resultados.length;

    for (const bruto of resultados) {
      const dados = objeto(bruto);
      if (search === METADADO_VAZIO) {
        search = {
          keyword: texto(dados?.keyword) || texto(pedido?.keyword),
          locationCode: inteiro(dados?.location_code) ?? inteiro(pedido?.location_code),
          languageCode: texto(dados?.language_code) || texto(pedido?.language_code),
          seDomain: texto(dados?.se_domain),
          checkUrl: texto(dados?.check_url),
          seResultsCount: inteiro(dados?.se_results_count),
          itemsCount: inteiro(dados?.items_count),
          cost: numero(tarefa?.cost),
        };
        diagnostics.declaredItemsCount = inteiro(dados?.items_count);
        diagnostics.itemTypes = Array.isArray(dados?.item_types) ? dados.item_types.map(String) : [];
      }

      for (const item of (Array.isArray(dados?.items) ? dados.items : [])) {
        diagnostics.rawItems += 1;
        const registro = objeto(item);
        if (!registro) { descartar("item_nao_e_objeto"); continue; }

        const tipo = texto(registro.type);

        /* §5 · buscas relacionadas são sinal próprio, nunca categoria. */
        if (tipo === "related_searches") {
          for (const termo of (Array.isArray(registro.items) ? registro.items : [])) {
            const entrada = objeto(termo);
            const titulo = texto(entrada?.title);
            if (!titulo) { descartar("related_sem_titulo"); continue; }
            relatedSearches.push(RadarAmazonRelatedSearchSchema.parse({
              term: titulo,
              rankAbsolute: inteiro(registro.rank_absolute),
              queryId,
            }));
          }
          continue;
        }

        /*
         * §8 · O PLACEMENT É O TIPO DO ITEM.
         *
         * Qualquer outro tipo é descartado com motivo em vez de virar orgânico
         * por omissão: um bloco novo do provider entrando como concorrente
         * inflaria a disputa com algo que ninguém conferiu.
         */
        const placement = tipo === "amazon_serp" ? "ORGANIC" : tipo === "amazon_paid" ? "SPONSORED" : null;
        if (!placement) { descartar(`tipo_nao_suportado:${tipo || "sem_tipo"}`); continue; }
        if (placement === "ORGANIC") diagnostics.rawOrganic += 1; else diagnostics.rawSponsored += 1;

        const asin = texto(registro.data_asin);
        const title = texto(registro.title);
        const url = texto(registro.url);
        if (!asin || !title || !url) {
          descartar(!asin ? "sem_asin" : !title ? "sem_titulo" : "sem_url");
          continue;
        }

        const rating = objeto(registro.rating);
        const entrega = objeto(registro.delivery_info);
        const ofertas = Array.isArray(registro.special_offers)
          ? registro.special_offers.map(parte => texto(parte)).filter((parte): parte is string => Boolean(parte))
          : [];

        results.push(RadarAmazonSerpResultSchema.parse({
          asin,
          title,
          url,
          imageUrl: texto(registro.image_url),
          domain: texto(registro.domain),
          placement,
          rankGroup: inteiro(registro.rank_group),
          rankAbsolute: inteiro(registro.rank_absolute),
          /*
           * `price_to` chegou sempre nulo na amostra e não é lido: guardá-lo
           * criaria um campo que descreve faixa sem nunca ter uma.
           */
          priceFrom: numero(registro.price_from),
          currency: texto(registro.currency),
          offerText: ofertas,
          ratingValue: numero(rating?.value),
          ratingVotes: inteiro(rating?.votes_count),
          ratingMax: numero(rating?.rating_max),
          isAmazonChoice: registro.is_amazon_choice === true,
          isBestSeller: registro.is_best_seller === true,
          boughtPastMonth: inteiro(registro.bought_past_month),
          deliveryMessage: texto(entrega?.delivery_message),
          queryId,
        }));
      }
    }
  }

  diagnostics.normalized = results.length;
  diagnostics.discarded = discarded;
  return { results, relatedSearches, discarded, search, diagnostics };
}

/**
 * ============ §15 · TRÊS DESFECHOS, TRÊS NOMES ============
 *
 * Esta função existe para que "nenhum produto" nunca seja a resposta para uma
 * recusa. As três situações pedem ações opostas de quem opera: conferir
 * credencial e parâmetro, escolher outra busca, ou consertar o adapter.
 */
export function assertRadarAmazonReadable(normalizada: RadarAmazonNormalization): void {
  const { diagnostics } = normalizada;

  if (diagnostics.providerStatusCode !== null && diagnostics.providerStatusCode !== 20000) {
    throw new DataForSeoAmazonReadError(
      "AMAZON_PROVIDER_TASK_FAILED",
      `A DataForSEO recusou a tarefa (${diagnostics.providerStatusCode}): ${diagnostics.providerStatusMessage || "sem motivo declarado"}.`,
      diagnostics,
    );
  }

  /*
   * O PROVIDER DEVOLVEU PRODUTO E NÓS PRODUZIMOS ZERO: o defeito é NOSSO, e
   * chamar isso de "coleta concluída" esconderia um bug de adapter atrás de
   * uma tela que parece correta.
   */
  if ((diagnostics.rawOrganic + diagnostics.rawSponsored) > 0 && diagnostics.normalized === 0) {
    throw new DataForSeoAmazonReadError(
      "AMAZON_NORMALIZATION_EMPTY",
      `O provider devolveu ${diagnostics.rawOrganic + diagnostics.rawSponsored} produto(s) e a leitura produziu zero.`,
      diagnostics,
    );
  }
}

/** `AMAZON_EMPTY_RESULT` é a terceira, e ela não é erro: é resposta. */
export const radarAmazonIsEmptyResult = (normalizada: RadarAmazonNormalization) =>
  normalizada.diagnostics.providerStatusCode === 20000
  && normalizada.diagnostics.rawOrganic + normalizada.diagnostics.rawSponsored === 0;

/* ============================== a chamada ============================== */

export async function executeDataForSeoAmazonQuery(
  input: DataForSeoAmazonOperationInput & { queryId: string },
  deps: { config: DataForSeoSerpConfig; fetchImpl?: typeof fetch },
): Promise<RadarAmazonNormalization> {
  const montada = buildDataForSeoAmazonRequest(input);
  const chamar = deps.fetchImpl || fetch;

  const resposta = await chamar(`${deps.config.baseUrl}${DATAFORSEO_AMAZON_ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${deps.config.login}:${deps.config.password}`, "utf8").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(montada.body),
  });

  if (!resposta.ok) {
    throw new DataForSeoSerpError("dataforseo_http", `A DataForSEO respondeu ${resposta.status} na consulta da Amazon.`, resposta.status);
  }

  let corpo: unknown;
  try { corpo = await resposta.json(); } catch {
    throw new DataForSeoSerpError("dataforseo_invalid_response", "A resposta da DataForSEO não é um JSON válido.");
  }

  const normalizada = normalizeDataForSeoAmazonResponse(corpo, input.queryId);
  assertRadarAmazonReadable(normalizada);
  return normalizada;
}
