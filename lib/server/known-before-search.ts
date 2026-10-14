import "server-only";
import { readKnownVolume, type KnownVolume } from "@/lib/editorial/known-before-search";

/*
 * LER ANTES DE BUSCAR — o leitor do servidor (F3, SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 3).
 *
 * Lê do BANCO, por id e em projeção estreita (nunca do pedido do navegador e
 * nunca o `analise_semantica` inteiro), o que decide se uma busca paga é
 * necessária: o volume da coluna, a fonte, a medição gravada (só data, média e
 * provider) e a elegibilidade ("sem média" do Google Ads). Só leitura: nenhum
 * caminho daqui escreve.
 */

export const KNOWN_BEFORE_SEARCH_COLUMNS = [
  "id",
  "keyword",
  "volume_search",
  "volume_source",
  "volume_eligibility:analise_semantica->volume_eligibility",
  "volume_measured_at:analise_semantica->volume_measurement->>measuredAt",
  "volume_measured_average:analise_semantica->volume_measurement->averageMonthlySearches",
  "volume_measured_provider:analise_semantica->volume_measurement->>provider",
].join(",");

const LOTE = 200;

export type KnownKeyword = {
  id: string;
  keyword: string;
  /** A coluna `volume_search` como está no banco (`undefined` = a leitura não trouxe a coluna). */
  volumeSearch: number | null | undefined;
  volumeSource: string | null;
  volume: KnownVolume;
};

type Linha = Record<string, unknown>;
type ClienteLeitura = { from: (table: string) => unknown };

/** A linha estreita volta a ter a forma que `readKnownVolume` lê. */
export function knownKeywordFromRow(linha: Linha, now: Date): KnownKeyword | null {
  const id = typeof linha.id === "string" ? linha.id : null;
  if (!id) return null;
  const volumeSearch = "volume_search" in linha ? (typeof linha.volume_search === "number" && Number.isFinite(linha.volume_search) ? linha.volume_search : null) : undefined;
  const volumeSource = typeof linha.volume_source === "string" ? linha.volume_source : null;
  const medicao = linha.volume_measured_at !== undefined || linha.volume_measured_average !== undefined || linha.volume_measured_provider !== undefined
    ? { measuredAt: linha.volume_measured_at ?? null, averageMonthlySearches: linha.volume_measured_average ?? null, provider: linha.volume_measured_provider ?? null }
    : undefined;
  const semantic: Record<string, unknown> = {};
  if (linha.volume_eligibility && typeof linha.volume_eligibility === "object") semantic.volume_eligibility = linha.volume_eligibility;
  if (medicao) semantic.volume_measurement = medicao;
  return {
    id,
    keyword: typeof linha.keyword === "string" ? linha.keyword : "",
    volumeSearch,
    volumeSource,
    volume: readKnownVolume({ volume_search: volumeSearch ?? null, volume_source: volumeSource, analise_semantica: semantic }, now),
  };
}

/**
 * Normalizada → volume que já temos (número medido, ou `null` para "sem média"
 * há menos de 30 dias). A keyword que falta medir fica FORA do mapa: só ela vai
 * ao Google Ads.
 */
export function knownVolumesByNormalized(brand: ReadonlyMap<string, { keywordId: string; known: KnownVolume }> | null | undefined): Map<string, number | null> {
  const mapa = new Map<string, number | null>();
  for (const [normalizada, { known }] of brand ?? []) {
    if (known.state === "measured") mapa.set(normalizada, known.volume);
    else if (known.state === "no_average") mapa.set(normalizada, null);
  }
  return mapa;
}

/**
 * As keywords da marca ativa, pelos ids pedidos, com o que já sabemos de cada
 * uma. `readFailed` = o banco não respondeu: quem chama decide (nunca paga às
 * cegas pelo que não conseguiu conferir).
 */
export async function readKnownBeforeSearch(client: ClienteLeitura, brandId: string, keywordIds: readonly string[], now: Date = new Date()): Promise<{ keywords: Map<string, KnownKeyword>; readFailed: boolean }> {
  const keywords = new Map<string, KnownKeyword>();
  const ids = [...new Set(keywordIds.filter(id => typeof id === "string" && id.trim() && !id.startsWith("territory:")))];
  if (!ids.length) return { keywords, readFailed: false };
  try {
    for (let inicio = 0; inicio < ids.length; inicio += LOTE) {
      const lote = ids.slice(inicio, inicio + LOTE);
      const consulta = (client.from("minerador_keywords") as { select: (c: string) => { eq: (k: string, v: string) => { is: (k: string, v: null) => { in: (k: string, v: string[]) => PromiseLike<{ data: unknown; error: unknown }> } } } })
        .select(KNOWN_BEFORE_SEARCH_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).in("id", lote);
      const resultado = await consulta;
      if (resultado.error) throw new Error("falha na leitura do que já sabemos");
      for (const linha of (Array.isArray(resultado.data) ? resultado.data : []) as Linha[]) {
        const lida = knownKeywordFromRow(linha, now);
        if (lida) keywords.set(lida.id, lida);
      }
    }
    return { keywords, readFailed: false };
  } catch {
    return { keywords: new Map(), readFailed: true };
  }
}
