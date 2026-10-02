import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RadarArticleBlueprintPayload } from "@/lib/radar/article-blueprint";

/**
 * O EXPORT LÊ O APROVADO EM LOTE — uma consulta, filtrada pela marca.
 *
 * A leitura é contexto, não condição: se a tabela não existir ainda (migration
 * não aplicada) ou o banco recusar, o CSV sai como antes, sem artigo-modelo.
 */
export async function readApprovedRadarArticleBlueprints(
  client: SupabaseClient,
  brandId: string,
  articles: ReadonlyArray<{ articleId: string; bundleHash: string | null | undefined }>,
): Promise<Map<string, RadarArticleBlueprintPayload>> {
  const saida = new Map<string, RadarArticleBlueprintPayload>();
  const comHash = articles.filter(item => item.bundleHash);
  if (!comHash.length) return saida;
  try {
    const leitura = await client.from("radar_article_blueprints").select("article_id,bundle_hash,version_number,payload")
      .eq("brand_id", brandId).eq("state", "APPROVED").in("article_id", comHash.map(item => item.articleId))
      .order("version_number", { ascending: false });
    if (leitura.error) {
      console.warn("[radar-article-blueprint] approved_read_failed", { message: leitura.error.message.slice(0, 240) });
      return saida;
    }
    const hashDe = new Map(comHash.map(item => [item.articleId, item.bundleHash]));
    for (const linha of (leitura.data || []) as unknown as Array<Record<string, unknown>>) {
      const articleId = String(linha.article_id);
      if (saida.has(articleId) || hashDe.get(articleId) !== String(linha.bundle_hash)) continue;
      saida.set(articleId, linha.payload as RadarArticleBlueprintPayload);
    }
  } catch (erro) {
    console.warn("[radar-article-blueprint] approved_read_failed", { message: erro instanceof Error ? erro.message.slice(0, 240) : "falha desconhecida" });
  }
  return saida;
}
