import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RadarPortableArticleAuthor } from "@/lib/radar/portable-export";

/**
 * QUEM ASSINA O ARTIGO — o especialista da aba Especialista (pedido do dono, 2026-10-02).
 *
 * "O nome de quem assina tem que ser o mesmo que está na aba do Especialista:
 * ele é o E-E-A-T desses assuntos." O pacote congelado guarda o id do
 * especialista de cada contribuição, mas não o nome (o nome entraria no hash);
 * o nome é lido AO VIVO aqui, por lote e filtrado pela marca.
 *
 * Regra: os especialistas das contribuições ACEITAS do artigo. Sem nenhum, e com
 * um único especialista ativo na marca, ele é sugerido — marcado como sugestão.
 * A leitura é contexto: falhou, o entregável diz que a autoria não foi lida.
 */
export async function readRadarArticleAuthors(
  client: SupabaseClient,
  brandId: string,
  articles: ReadonlyArray<{ articleId: string; expertIds: readonly string[] }>,
): Promise<Map<string, RadarPortableArticleAuthor[]> | null> {
  try {
    const leitura = await client.from("brand_experts").select("id,display_name,specialty,status").eq("brand_id", brandId);
    if (leitura.error) {
      console.warn("[radar-article-authors] read_failed", { message: leitura.error.message.slice(0, 240) });
      return null;
    }
    const linhas = (leitura.data || []) as Array<{ id: string; display_name: string; specialty: string | null; status: string }>;
    const porId = new Map(linhas.map(linha => [linha.id, linha]));
    const ativos = linhas.filter(linha => linha.status === "active");
    const saida = new Map<string, RadarPortableArticleAuthor[]>();
    for (const artigo of articles) {
      const dasContribuicoes = artigo.expertIds
        .map(id => porId.get(id))
        .filter((linha): linha is NonNullable<typeof linha> => Boolean(linha?.display_name?.trim()))
        .map(linha => ({ name: linha.display_name.trim(), specialty: linha.specialty?.trim() || null, source: "contribution" as const }));
      const unicos = dasContribuicoes.filter((autor, indice, lista) => lista.findIndex(outro => outro.name === autor.name) === indice);
      saida.set(artigo.articleId, unicos.length
        ? unicos
        : ativos.length === 1
          ? [{ name: ativos[0].display_name.trim(), specialty: ativos[0].specialty?.trim() || null, source: "only_active" as const }]
          : []);
    }
    return saida;
  } catch (erro) {
    console.warn("[radar-article-authors] read_failed", { message: erro instanceof Error ? erro.message.slice(0, 240) : "falha desconhecida" });
    return null;
  }
}
