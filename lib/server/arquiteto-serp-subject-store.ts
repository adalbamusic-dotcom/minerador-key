import "server-only";

import {
  SERP_CACHE_LENSES,
  SERP_CACHE_OBSERVATION_DEPTH,
  SERP_CACHE_STAGE,
  SERP_CACHE_SUBJECT_TYPE,
  SerpCacheMetaSchema,
  serpCacheEntryServes,
  serpCacheLensLabel,
  serpCacheSubjectId,
  type SerpCacheLens,
  type SerpCacheQuery,
} from "@/lib/editorial/serp-cache";
import { SERP_CACHE_READ_CHUNK, type SerpCacheContext } from "@/lib/server/serp-cache-store";
import type { KeywordSerpFootprint, SerpSubjectLensReading } from "@/lib/arquiteto/serp-subject-overlap";

/**
 * A PEGADA DA SERP DAS KEYWORDS DA MESA — LEITURA ESTREITA DO CACHE, POR LOTE.
 *
 * D2.2: "mesmo assunto" é medido pelas páginas em comum no top 10 nas 4
 * lentes, LIDAS DO CACHE JÁ PAGO. Nada aqui paga, coleta ou grava: é só
 * leitura, e só do que a medida usa (SDD de egress, R4/R5/R8):
 *
 *   meta         ~0,4 KB  confere a consulta e a validade (30 dias);
 *   u0..u9       ~0,8 KB  as 10 URLs orgânicas do digest, pelo caminho
 *                         \`payload->digest->organic->N->>url\` — sem título,
 *                         descrição nem blocos (o digest inteiro tem ~5 KB);
 *   domains      ~0,3 KB  os domínios da observação — é o que a lente
 *                         canônica oferece sem ler o corpo (~26 KB).
 *
 * ≈ 1,5 KB por keyword × lente. A mesa da AdalbaPro (159 keywords com SERP,
 * 4 lentes) sai por ≈ 0,95 MB, contra ≈ 6,5 MB lendo digest e corpo.
 * O custo lido volta na resposta (\`egress\`) para a tela e o registro dizerem.
 *
 * O corpo da lente canônica NÃO é lido: ela entra pelos domínios. Quando uma
 * entrada canônica tiver digest (gravação com \`storeDigest\`), as URLs dela
 * também entram — o mesmo caminho serve às quatro.
 */

/** Quantas posições do digest são lidas: o top 10 da medida. */
export const SERP_SUBJECT_URL_SLOTS = SERP_CACHE_OBSERVATION_DEPTH;

/** As colunas da leitura estreita, em uma constante: o teste prova que nada além disso trafega. */
export const SERP_SUBJECT_READ_COLUMNS = [
  "subject_id",
  "meta:payload->meta",
  "domains:payload->observation->competitorDomains",
  ...Array.from({ length: SERP_SUBJECT_URL_SLOTS }, (_, indice) => `u${indice}:payload->digest->organic->${indice}->>url`),
].join(",");

/** O teto por chamada da rota: a mesa inteira de uma marca grande, em lotes de 100 ids. */
export const SERP_SUBJECT_MAX_KEYWORDS = 600;

export type SerpSubjectReadTarget = {
  keywordId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
};

export type SerpSubjectReadEgress = {
  /** Consultas ao banco (lotes de até 100 ids). */
  queries: number;
  /** Entradas devolvidas pelo banco. */
  entriesRead: number;
  /** Bytes aproximados das linhas devolvidas (JSON), o que trafegou. */
  approxBytes: number;
};

export type SerpSubjectReadResult = {
  footprints: KeywordSerpFootprint[];
  /** Keywords sem nenhuma lente válida no cache — a tela diz, não vira zero. */
  withoutSerp: string[];
  /**
   * Lentes que faltam por keyword (ausente, vencida, outra consulta). Na
   * entrada que existe mas não serve (vencida, por exemplo), `collectedAt`
   * diz quando ela foi coletada: a tela separa "venceu há N dias" de "nunca
   * coletada" (aditivo; ausente quando não há entrada).
   */
  missingLenses: Array<{ keywordId: string; lens: string; reason: string; collectedAt?: string | null }>;
  egress: SerpSubjectReadEgress;
};

type Linha = Record<string, unknown>;

const texto = (valor: unknown) => typeof valor === "string" && valor.trim() ? valor.trim() : null;

/**
 * Lê a pegada da SERP de cada keyword, nas 4 lentes, só do cache.
 *
 * Endpoint \`advanced\` e profundidade 10: é a chave que todo coletor da
 * plataforma grava (Minerador, Arquiteto e Radar). Entrada vencida, de outra
 * consulta ou ilegível é FALTA, com o motivo.
 */
export async function readSerpSubjectFootprints(
  context: SerpCacheContext,
  targets: readonly SerpSubjectReadTarget[],
  options: { now: Date; maxAgeMs?: number; lenses?: readonly SerpCacheLens[] },
): Promise<SerpSubjectReadResult> {
  const lentes = options.lenses?.length ? options.lenses : SERP_CACHE_LENSES;
  type Pedido = { target: SerpSubjectReadTarget; lens: SerpCacheLens; query: SerpCacheQuery; subjectId: string };
  const pedidos: Pedido[] = [];
  const vistos = new Set<string>();
  for (const target of targets) {
    if (vistos.has(target.keywordId)) continue;
    vistos.add(target.keywordId);
    for (const lens of lentes) {
      const query: SerpCacheQuery = { keyword: target.keyword, locationCode: target.locationCode, languageCode: target.languageCode, lens, endpoint: "advanced" };
      pedidos.push({ target, lens, query, subjectId: serpCacheSubjectId(query) });
    }
  }

  const ids = [...new Set(pedidos.map(pedido => pedido.subjectId))];
  const linhas = new Map<string, Linha>();
  const egress: SerpSubjectReadEgress = { queries: 0, entriesRead: 0, approxBytes: 0 };
  for (let inicio = 0; inicio < ids.length; inicio += SERP_CACHE_READ_CHUNK) {
    const lote = ids.slice(inicio, inicio + SERP_CACHE_READ_CHUNK);
    const resultado = await context.supabase
      .from("editorial_workflow_items")
      .select(SERP_SUBJECT_READ_COLUMNS)
      .eq("marca_id", context.brandId)
      .eq("subject_type", SERP_CACHE_SUBJECT_TYPE)
      .eq("stage", SERP_CACHE_STAGE)
      .in("subject_id", lote);
    egress.queries += 1;
    if (resultado.error) throw new Error(`Leitura da SERP da mesa no cache: ${resultado.error.message || "falha desconhecida"}`);
    for (const linha of (resultado.data || []) as unknown as Linha[]) {
      egress.entriesRead += 1;
      egress.approxBytes += JSON.stringify(linha).length;
      const subjectId = texto(linha.subject_id);
      if (subjectId) linhas.set(subjectId, linha);
    }
  }

  const porKeyword = new Map<string, { target: SerpSubjectReadTarget; lenses: SerpSubjectLensReading[] }>();
  const missingLenses: SerpSubjectReadResult["missingLenses"] = [];
  for (const pedido of pedidos) {
    const entrada = porKeyword.get(pedido.target.keywordId) || { target: pedido.target, lenses: [] };
    porKeyword.set(pedido.target.keywordId, entrada);
    const rotulo = serpCacheLensLabel(pedido.lens);
    const linha = linhas.get(pedido.subjectId);
    if (!linha) { missingLenses.push({ keywordId: pedido.target.keywordId, lens: rotulo, reason: "sem entrada no cache" }); continue; }
    const meta = SerpCacheMetaSchema.safeParse(linha.meta);
    if (!meta.success) { missingLenses.push({ keywordId: pedido.target.keywordId, lens: rotulo, reason: "entrada ilegível" }); continue; }
    const atende = serpCacheEntryServes(meta.data, { query: pedido.query, depth: SERP_SUBJECT_URL_SLOTS, now: options.now, maxAgeMs: options.maxAgeMs });
    if (!atende.serves) { missingLenses.push({ keywordId: pedido.target.keywordId, lens: rotulo, reason: atende.reason, collectedAt: meta.data.collectedAt }); continue; }
    const urls = Array.from({ length: SERP_SUBJECT_URL_SLOTS }, (_, indice) => texto(linha[`u${indice}`])).filter((url): url is string => Boolean(url));
    const dominios = Array.isArray(linha.domains) ? (linha.domains as unknown[]).map(texto).filter((item): item is string => Boolean(item)) : [];
    if (!urls.length && !dominios.length) { missingLenses.push({ keywordId: pedido.target.keywordId, lens: rotulo, reason: "entrada sem URLs nem domínios" }); continue; }
    entrada.lenses.push({ lens: rotulo, urls: urls.length ? urls : null, domains: dominios.length ? dominios : null, collectedAt: meta.data.collectedAt });
  }

  const footprints: KeywordSerpFootprint[] = [];
  const withoutSerp: string[] = [];
  for (const [keywordId, entrada] of porKeyword) {
    footprints.push({ keywordId, keyword: entrada.target.keyword, lenses: entrada.lenses });
    if (!entrada.lenses.some(leitura => leitura.urls?.length)) withoutSerp.push(keywordId);
  }
  return { footprints, withoutSerp, missingLenses, egress };
}
