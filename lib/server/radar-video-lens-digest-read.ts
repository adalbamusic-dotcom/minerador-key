import "server-only";
import { lookupSerpCache, type SerpCacheLookup, type SerpCacheRequest } from "@/lib/server/serp-cache";
import type { SerpCacheContext } from "@/lib/server/serp-cache-store";
import { radarVideoLensDigestRequests } from "@/lib/radar/video-competitive";

/**
 * ===== 2026-10-07 · O RESUMO ORGÂNICO DAS LENTES EXTRAS, SÓ PARA O CSV DE VÍDEO =====
 *
 * Pedido do dono: "caprichar na pesquisa competitiva" dos cortes e do
 * carrossel. Reels, posts e carrosséis do Instagram, TikTok, Shorts e LinkedIn
 * que ranqueiam no orgânico das lentes desktop · macOS, mobile · Android e
 * mobile · iOS só existem no resumo orgânico que o cache já grava (o mesmo que
 * o Minerador lê para classificar a lente). A lente da investigação sai do
 * snapshot que o pacote referencia — ela não é pedida aqui.
 *
 * A ÚNICA LEITURA NOVA da Parte 1 do desenho competitivo:
 *   - grátis: lê o cache, nunca o provider (PROVIDER_CALLS = 0);
 *   - em modo `digest` (`meta` + o resumo, ~5 KB por lente, colunas explícitas
 *     e filtro pela marca no store — R4/R5 da SDD de egress);
 *   - UMA vez por lote, com os MESMOS pedidos que a leitura das lentes já
 *     montou (sem outra leitura de alvo), só a keyword principal de cada artigo
 *     e só as três lentes que não são a canônica;
 *   - ligada só no modo vídeo da exportação (`videoLensDigests`): o CSV "Para
 *     escrever" e o MCP `get_article_for_writing` não a fazem.
 *
 * Contexto, não condição: se o banco recusar, o arquivo sai do mesmo jeito e a
 * coluna diz que a leitura falhou nesta exportação. Nada é gravado.
 */
export async function readRadarVideoLensDigestsForExport(input: {
  context: SerpCacheContext;
  /** Os pedidos que a leitura das lentes do lote já montou (keyword × lente, códigos do alvo). */
  pedidos: readonly SerpCacheRequest[];
  /** A keyword principal de cada artigo do lote. */
  principais: ReadonlyArray<string | null | undefined>;
  now: Date;
  /** A leitura das lentes do lote falhou: não há pedidos confiáveis, e nada é lido. */
  lensReadFailed: boolean;
}): Promise<{ lookups: SerpCacheLookup[]; readFailed: boolean }> {
  if (input.lensReadFailed) return { lookups: [], readFailed: true };
  const pedidos = radarVideoLensDigestRequests(input.pedidos, input.principais);
  if (!pedidos.length) return { lookups: [], readFailed: false };
  try {
    return { lookups: await lookupSerpCache(input.context, pedidos, { mode: "digest", now: input.now }), readFailed: false };
  } catch (erro) {
    console.warn("[radar-export] serp_cache_digest_read_failed", {
      message: erro instanceof Error ? erro.message.slice(0, 240) : "falha desconhecida",
    });
    return { lookups: [], readFailed: true };
  }
}
