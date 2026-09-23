import type { SupabaseClient } from "@supabase/supabase-js";
import type { SerpResearchSnapshot, SerpSearchInput } from "../radar/serp/contracts";
import { collectDataForSeoSerpSnapshot, inspectDataForSeoSerpResponse, type DataForSeoSerpProviderDiagnostic } from "../server/dataforseo-serp-operation.ts";
import type { IntegrationEnvironment, IntegrationRuntimeDependencies, IntegrationResolvedResource } from "../server/integrations-runtime.ts";
import type { IntegrationSecretStore } from "../server/integration-secret-store.ts";
import type { DataForSeoSerpConfig } from "../minerador/dataforseo-serp-core.ts";
import { normalizeDataForSeoSerpResponse } from "../server/dataforseo-serp-normalizer.ts";
import { SERP_CACHE_CANONICAL_LENS, sameSerpCacheLens, trimSerpBodyToDepth, type SerpCacheLens, type SerpCacheMeta, type SerpOrganicDigest } from "../editorial/serp-cache.ts";
import type { SerpCacheRequest } from "../server/serp-cache.ts";

export const DATAFORSEO_SERP_COMPATIBILITY_STATUS = "AVAILABLE_FROM_GLOBAL_DATAFORSEO" as const;

/* ------------------------- SERP da formação × cache ------------------------ */

/**
 * O endpoint da SERP de formação: `advanced`, o mesmo que o Minerador paga.
 *
 * Antes a formação pagava o `regular`. Medido em 2026-09-20 para "skincare
 * facial", mesma lente: o `regular` anunciou `people_also_ask` em `item_types`
 * e entregou ZERO perguntas e 8 domínios; o `advanced` entregou 4 perguntas,
 * 13 domínios e as citações do AI Overview. Trocar é também o que permite
 * reaproveitar a SERP que o Minerador já pagou — a chave inclui o endpoint.
 */
export const FORMATION_SERP_ENDPOINT = "advanced" as const;

/**
 * A lente mobile da formação. O pedido `mobile` nunca levou `os`, e o eco só
 * foi medido para desktop; aqui o sistema é enviado explicitamente (`android`,
 * uma das quatro lentes do produto) para que o snapshot e o cache registrem o
 * sistema que foi de fato pedido, nunca um suposto.
 */
export const FORMATION_SERP_MOBILE_LENS: SerpCacheLens = { device: "mobile", operatingSystem: "android" };

/**
 * A lente de cada dispositivo pedido pela formação.
 *
 * Desktop é a lente canônica `desktop-windows`: o eco da DataForSEO provou
 * (tests/fixtures/dataforseo-eco-desktop-sem-os.json) que `desktop` sem `os`
 * já era `windows`. Declarar o sistema não muda a SERP de desktop — só para de
 * deixá-lo implícito, e faz a chave bater com a entrada que o Minerador gravou.
 */
export function formationSerpLens(device: "desktop" | "mobile"): SerpCacheLens {
  return device === "mobile" ? FORMATION_SERP_MOBILE_LENS : SERP_CACHE_CANONICAL_LENS;
}

/**
 * O pedido ao cache de UMA keyword da formação, com os códigos que vão ao provider.
 *
 * `lens` (adendo das 4 lentes, A3) escolhe a lente diretamente; `device` é a
 * forma legada de uma lente só e continua valendo para quem a usa.
 */
export function formationSerpCacheRequest(input: {
  keyword: string;
  keywordId: string;
  depth: number;
  device?: "desktop" | "mobile";
  lens?: SerpCacheLens;
  codes: { locationCode: number; languageCode: string };
}): SerpCacheRequest {
  return {
    query: {
      keyword: input.keyword,
      locationCode: input.codes.locationCode,
      languageCode: input.codes.languageCode,
      lens: input.lens ?? formationSerpLens(input.device ?? "desktop"),
      endpoint: FORMATION_SERP_ENDPOINT,
    },
    depth: input.depth,
    keywordId: input.keywordId,
  };
}

/* ------------------- o que o Arquiteto paga e o que grava ------------------ */

/**
 * A profundidade com que o Arquiteto PAGA a lente canônica (desktop-windows).
 *
 * É a mesma da CALL 3 do Minerador (`SEMANTIC_SERP_DEPTH`, constante local de
 * `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts`); um
 * teste estrutural confere que as duas continuam iguais.
 *
 * A chave do cache não inclui profundidade. Uma canônica paga aqui com 10
 * substituía a entrada ausente ou vencida do Minerador, e depois a CALL 3, que
 * pede 20, recusava a entrada mais rasa, pagava de novo e regravava. Pagar 20
 * na canônica custa uma página a mais do provider e evita essa segunda chamada.
 * A LEITURA continua pedindo o que o leitor usa: a entrada de 20 atende um
 * pedido de 10, recortada por `trimSerpBodyToDepth`.
 */
export const ARCHITECT_CANONICAL_SERP_COLLECTION_DEPTH = 20;

/**
 * O pedido que vai ao provider numa FALTA do Arquiteto.
 *
 * Só a canônica sobe para `ARCHITECT_CANONICAL_SERP_COLLECTION_DEPTH`. As
 * outras lentes continuam na profundidade pedida: nenhum leitor delas pede
 * mais que o top 10 (`SERP_LENS_COVERAGE_DEPTH` do Minerador).
 */
export function architectSerpCollectionRequest(request: SerpCacheRequest): SerpCacheRequest {
  if (!sameSerpCacheLens(request.query.lens, SERP_CACHE_CANONICAL_LENS)) return request;
  if (request.depth >= ARCHITECT_CANONICAL_SERP_COLLECTION_DEPTH) return request;
  return { ...request, depth: ARCHITECT_CANONICAL_SERP_COLLECTION_DEPTH };
}

/**
 * O corpo CRU de uma falta na profundidade que o leitor pediu.
 *
 * Mesma regra do acerto (`lookupSerpCache` recorta a entrada mais funda que o
 * pedido): acerto e falta chegam à normalização com o mesmo corpo, e o parecer
 * não muda por a canônica ter sido paga mais funda. Coleta na profundidade do
 * pedido passa intacta — exatamente o corpo de antes.
 */
export function serpBodyAtRequestedDepth(body: unknown, collectedDepth: number, requestedDepth: number): unknown {
  return collectedDepth > requestedDepth ? trimSerpBodyToDepth(body, requestedDepth) : body;
}

/**
 * O diagnóstico do provider de uma falta, contado sobre o corpo que o leitor
 * recebe.
 *
 * O status HTTP, os códigos da task e o id da task são os da resposta real.
 * `resultCount` e `itemsCount` passam a ser os do corpo recortado: é o que o
 * acerto conta (`inspectDataForSeoSerpResponse` sobre o corpo em cache, já
 * recortado ao pedido). Sem isso, a mesma consulta mostrava contagens de 20 na
 * falta e de 10 no acerto. Coleta na profundidade do pedido passa intacta.
 */
export function providerDiagnosticAtRequestedDepth(
  providerDiagnostic: DataForSeoSerpProviderDiagnostic,
  collectedBody: unknown,
  requestedBody: unknown,
): DataForSeoSerpProviderDiagnostic {
  if (requestedBody === collectedBody) return providerDiagnostic;
  const recortado = inspectDataForSeoSerpResponse(requestedBody, providerDiagnostic.httpStatus, providerDiagnostic.providerRequestId);
  return { ...providerDiagnostic, resultCount: recortado.resultCount, itemsCount: recortado.itemsCount };
}

/**
 * A lente paga pelo Arquiteto grava o CORPO?
 *
 * Só a canônica: ela tem leitores de corpo (a CALL 3 do Minerador, a formação
 * de artigos, a SERP territorial). As outras três, pagas pela SERP por
 * keyword, só são lidas pela observação e pelo digest — o digest o núcleo já
 * grava em toda lente não canônica. Gravar ~26 KB de corpo que ninguém relê
 * custaria banco sem servir ninguém. Quem um dia precisar do corpo de uma
 * lente extra lê em modo `body`, vê falta, e paga a entrada completa.
 */
export function architectSerpStoresBody(lens: SerpCacheLens): boolean {
  return sameSerpCacheLens(lens, SERP_CACHE_CANONICAL_LENS);
}

/**
 * Os códigos da chave batem com os que a config resolvida mandaria?
 *
 * A chave é montada ANTES de resolver a config (a quota depende de quantas
 * faltam). Se a config trouxer outra localidade ou outro idioma, a entrada
 * lida descreve uma SERP que esta rota não pediria — e não pode servir.
 */
export function formationSerpCodesMatch(
  key: { locationCode: number; languageCode: string },
  config: { locationCode: number; languageCode: string },
): boolean {
  return key.locationCode === config.locationCode
    && key.languageCode.trim().toLowerCase() === config.languageCode.trim().toLowerCase();
}

/**
 * Normaliza um ACERTO do cache com a proveniência da coleta original.
 *
 * `collectedAt` e `providerRequestId` são os da entrada: o snapshot diz quando
 * a SERP foi observada, não quando foi relida. A data passa por `toISOString`
 * porque o snapshot exige o formato com `Z` e o cache só garante texto legível
 * — um `+00:00` derrubaria o parecer inteiro no `parse`.
 */
export function normalizeCachedFormationSerp(
  body: unknown,
  input: SerpSearchInput,
  meta: Pick<SerpCacheMeta, "locationCode" | "languageCode" | "collectedAt" | "providerRequestId">,
): SerpResearchSnapshot {
  return normalizeDataForSeoSerpResponse(
    body,
    input,
    { locationCode: meta.locationCode, languageCode: meta.languageCode },
    new Date(meta.collectedAt).toISOString(),
    meta.providerRequestId,
  );
}

/* --------------------- lentes extras: o digest orgânico --------------------- */

/**
 * O corpo mínimo que o normalizador lê, montado do DIGEST orgânico de uma lente
 * extra (adendo das 4 lentes, A3).
 *
 * As lentes extras não guardam corpo: guardam o digest (top 10 orgânico com os
 * campos do provider). Para classificar cada resultado pela MESMA regra da
 * lente principal — `classifyResult`, privada no normalizador —, o digest vira
 * um corpo de uma task com os mesmos itens, e passa pelo MESMO
 * `normalizeDataForSeoSerpResponse`. Duplicar a classificação aqui faria a
 * canônica e as extras divergirem em silêncio.
 *
 * O que o digest não traz fica de fora e é declarado no marcador de lentes:
 * vídeo, People Also Ask, blocos, e a posição é `rank_group`.
 */
export function serpBodyFromOrganicDigest(digest: SerpOrganicDigest): Record<string, unknown> {
  return {
    status_code: 20000,
    tasks: [{
      status_code: 20000,
      result: [{
        keyword: digest.keyword,
        items: digest.organic.map(item => ({ ...item, type: "organic" })),
      }],
    }],
  };
}

/**
 * Normaliza o digest de uma lente extra com a proveniência da coleta que o
 * gravou (ou que acabou de pagá-lo). Mesma regra de data de
 * `normalizeCachedFormationSerp`: o snapshot exige o formato com `Z`.
 */
export function normalizeOrganicDigestSerp(
  digest: SerpOrganicDigest,
  input: SerpSearchInput,
  meta: Pick<SerpCacheMeta, "locationCode" | "languageCode" | "collectedAt" | "providerRequestId">,
): SerpResearchSnapshot {
  return normalizeDataForSeoSerpResponse(
    serpBodyFromOrganicDigest(digest),
    input,
    { locationCode: meta.locationCode, languageCode: meta.languageCode },
    new Date(meta.collectedAt).toISOString(),
    meta.providerRequestId,
  );
}

/**
 * A quota das chamadas pagas da formação, reavaliada quando as faltas crescem.
 *
 * A rota avalia a quota depois da leitura `meta` do cache, só com as faltas.
 * Mas um acerto pode degradar em falta depois disso: a leitura em lote dos
 * corpos lança (um lote inteiro — todas as principais — vira pago de uma vez),
 * a entrada some, ou o corpo gravado não normaliza. Pagar esses acertos com a
 * quota avaliada para 0 ou 1 unidade deixaria a rota passar do limite em até
 * N−1 chamadas: `evaluateQuotaForResource` só confere `usedUnits + units <=
 * limitUnits` antes, não reserva nada.
 *
 * Regra: toda falta prevista é somada; se a previsão passar do que já foi
 * avaliado, a quota é avaliada de novo ANTES de pagar, para o que ainda não
 * virou uso `succeeded` (o único que a quota soma em `usedUnits`). As
 * reavaliações são serializadas: chamadas paralelas esperam a mesma.
 */
export function createFormationSerpQuotaLedger<R>(resolve: (quotaUnits: number) => Promise<R>) {
  let expectedMisses = 0;
  let coveredMisses = 0;
  let succeededUsage = 0;
  let resolution: R | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    get resolution() { return resolution; },
    get expectedMisses() { return expectedMisses; },
    get coveredMisses() { return coveredMisses; },
    /** Mais `count` chamadas pagas previstas (faltas da leitura meta ou acertos degradados). */
    expectMisses(count: number) {
      if (count > 0) expectedMisses += count;
    },
    /** A previsão passa a ser pelo menos `count` — ex.: a config descartou todos os acertos. */
    expectAtLeast(count: number) {
      expectedMisses = Math.max(expectedMisses, count);
    },
    /** Um uso `succeeded` registrado: já entra em `usedUnits` na próxima avaliação. */
    recordSucceeded() {
      succeededUsage += 1;
    },
    /** Garante uma resolução cuja quota cobre toda falta prevista até agora. */
    ensureCovered(): Promise<R> {
      const run = queue.then(async () => {
        // `resolve` pode aumentar a previsão (códigos divergentes): repete até cobrir.
        while (resolution === null || expectedMisses > coveredMisses) {
          const target = Math.max(expectedMisses, 1);
          resolution = await resolve(Math.max(1, target - succeededUsage));
          coveredMisses = target;
        }
        return resolution;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

type CanonicalClient = Pick<SupabaseClient, "from" | "rpc">;

export type DataForSeoCompatibilityOptions = {
  actorUserId: string;
  agencyId?: string | null;
  brandId?: string;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
  operationRequestId?: string;
  resolution?: { resource: IntegrationResolvedResource; config: DataForSeoSerpConfig; environment: IntegrationEnvironment; credentialSource: "connection" };
  fetchImpl?: typeof fetch;
  onRequestBuilt?: () => void;
  onRequestStarted?: () => void;
  onHttpResponse?: (status: number) => void;
  onProviderResponse?: (diagnostic: DataForSeoSerpProviderDiagnostic) => void;
  onNormalizationSucceeded?: () => void;
};

export async function resolveDataForSeoCompatibilityConfig(input: Omit<DataForSeoCompatibilityOptions, "resolution" | "operationRequestId" | "fetchImpl" | "onRequestStarted"> & { brandId: string }) {
  // A consulta de formação usa uma SERP normal. Este resolvedor somente
  // reutiliza a Connection global DataForSEO READY já exposta pela Plataforma;
  // ele não pede uma capability específica de SERP do Arquiteto.
  const { resolveDataForSeoCanonicalConfig } = await import("../server/dataforseo-canonical.ts");
  return resolveDataForSeoCanonicalConfig({
    actorUserId: input.actorUserId,
    agencyId: input.agencyId,
    brandId: input.brandId,
    client: input.client,
    secretStore: input.secretStore,
    runtimeDependencies: input.runtimeDependencies,
    environment: input.environment,
    technicalEnvironment: input.technicalEnvironment,
    quotaUnits: input.quotaUnits,
  });
}

export async function collectDataForSeoCompatibilitySnapshot(
  input: SerpSearchInput,
  options: DataForSeoCompatibilityOptions,
): Promise<SerpResearchSnapshot> {
  const resolution = options.resolution || await resolveDataForSeoCompatibilityConfig({
    actorUserId: options.actorUserId,
    agencyId: options.agencyId,
    brandId: options.brandId || input.brandId,
    client: options.client,
    secretStore: options.secretStore,
    runtimeDependencies: options.runtimeDependencies,
    environment: options.environment,
    technicalEnvironment: options.technicalEnvironment,
    quotaUnits: options.quotaUnits,
  });

  return collectDataForSeoSerpSnapshot(input, {
    config: resolution.config,
    operationRequestId: options.operationRequestId || crypto.randomUUID(),
    fetchImpl: options.fetchImpl,
    onRequestBuilt: options.onRequestBuilt,
    onRequestStarted: options.onRequestStarted,
    onHttpResponse: options.onHttpResponse,
    onProviderResponse: options.onProviderResponse,
    onNormalizationSucceeded: options.onNormalizationSucceeded,
  });
}
