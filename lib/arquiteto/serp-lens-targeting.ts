import type { SupabaseClient } from "@supabase/supabase-js";
import { DataForSeoTargetingError, resolveDataForSeoTargeting } from "../minerador/dataforseo-targeting.ts";

/**
 * OS MESMOS CÓDIGOS DE LOCAL E IDIOMA DO MINERADOR (adendo das 4 lentes, A8).
 *
 * A chave do cache de SERP inclui localidade e idioma. O Minerador consulta com
 * os códigos do ALVO: `resolveDataForSeoTargeting` sobre o targeting da medição
 * — e, sem targeting, sobre nada, o que dá o Brasil com `pt`. O Arquiteto
 * consultava com os do AMBIENTE (`readDataForSeoTargetCodes`). As duas chaves só
 * batiam quando o ambiente dizia `pt`: com `DATAFORSEO_LANGUAGE_CODE=pt-br`, por
 * exemplo, toda SERP que o Minerador já tinha pago era paga de novo aqui, e
 * gravada numa chave que o Minerador nunca leria (SDD do cache, seção 5).
 *
 * Regra: para keyword DO ACERVO DA MARCA ATIVA, o Arquiteto resolve os códigos
 * pela MESMA função do Minerador, a partir do targeting que a última medição
 * da keyword gravou (`analise_semantica.allintitle_measurement.targeting`). O
 * targeting é lido aqui, no servidor, filtrado pela marca e em coluna estreita —
 * nunca vem do cliente. A localidade entra como o Minerador a passa: a do
 * ambiente. Texto sem keyword (pergunta territorial) e keyword que não é da
 * marca continuam com os códigos do ambiente.
 */

export type SerpTargetCodes = { locationCode: number; languageCode: string };

const registro = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Os códigos que o Minerador usaria para esta keyword, pelo resolvedor dele.
 *
 * `storedTargeting` é o registro gravado pela medição (`languageCode`,
 * `sourceGeoTargetConstants`) ou um targeting de candidata (`language`,
 * `geoTargetConstants`) — o resolvedor aceita os dois. `null` quando a
 * localidade não é resolvível: o Minerador também recusaria, e não há entrada
 * dele a reaproveitar.
 */
export function mineradorSerpTargetCodes(storedTargeting: unknown, environment: SerpTargetCodes): SerpTargetCodes | null {
  const alvo = registro(storedTargeting);
  try {
    const resolvido = resolveDataForSeoTargeting({
      geoTargetConstants: alvo?.sourceGeoTargetConstants ?? alvo?.geoTargetConstants,
      languageCode: texto(alvo?.languageCode) ?? texto(alvo?.language),
      locationCode: environment.locationCode,
    });
    return { locationCode: resolvido.locationCode, languageCode: resolvido.languageCode };
  } catch (error) {
    if (error instanceof DataForSeoTargetingError) return null;
    throw error;
  }
}

/** Só id de keyword do acervo vai ao banco: pseudo-id de território e texto livre ficam fora. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAcervoKeywordId = (keywordId: string) => UUID.test(keywordId);

/** A coluna estreita: só o targeting da última medição, nunca a `analise_semantica` inteira (R5/R8). */
export const MINERADOR_TARGETING_COLUMNS = "id,targeting:analise_semantica->allintitle_measurement->targeting" as const;

const LOTE = 100;

type ClienteLeitura = Pick<SupabaseClient, "from">;

/**
 * Lê o targeting das keywords da MARCA ATIVA e devolve os códigos por keyword.
 *
 * Keyword ausente da resposta (outra marca, excluída, id que não é do acervo)
 * não entra no mapa: quem chama usa os códigos do ambiente. Falha de leitura
 * não derruba a validação — o mapa volta vazio, com `readFailed`, e tudo segue
 * com os códigos do ambiente, como antes desta regra.
 */
export async function readMineradorKeywordTargetCodes(
  client: ClienteLeitura,
  brandId: string,
  keywordIds: readonly string[],
  environment: SerpTargetCodes,
): Promise<{ codes: Map<string, SerpTargetCodes>; readFailed: boolean }> {
  const codes = new Map<string, SerpTargetCodes>();
  const ids = [...new Set(keywordIds.filter(isAcervoKeywordId))];
  try {
    for (let inicio = 0; inicio < ids.length; inicio += LOTE) {
      const lote = ids.slice(inicio, inicio + LOTE);
      const resultado = await client
        .from("minerador_keywords")
        .select(MINERADOR_TARGETING_COLUMNS)
        .eq("brand_id", brandId)
        .is("deleted_at", null)
        .in("id", lote);
      if (resultado.error) throw new Error(resultado.error.message || "falha na leitura do targeting");
      for (const linha of (resultado.data || []) as unknown as Array<Record<string, unknown>>) {
        const id = typeof linha.id === "string" ? linha.id : null;
        if (!id) continue;
        const resolvidos = mineradorSerpTargetCodes(linha.targeting ?? null, environment);
        if (resolvidos) codes.set(id, resolvidos);
      }
    }
    return { codes, readFailed: false };
  } catch {
    return { codes: new Map(), readFailed: true };
  }
}

/** Os códigos que a chave e o provider recebem para esta consulta. */
export const serpTargetCodesFor = (codes: ReadonlyMap<string, SerpTargetCodes>, keywordId: string | null, environment: SerpTargetCodes): SerpTargetCodes =>
  (keywordId ? codes.get(keywordId) : undefined) ?? environment;
