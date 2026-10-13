import type { SupabaseClient } from "@supabase/supabase-js";
import { readArticleGroupMemberships } from "./article-groups-store.ts";
import { isEditorialGroupColor } from "./editorial-groups.ts";
import { editorialGroupLabelOf, type EditorialGroupLabel } from "./editorial-group-scope.ts";

/**
 * ===== F6 · O RÓTULO DO GRUPO DE CADA ARTIGO (só leitura) =====
 *
 * Para os entregáveis do Radar (CSV "Para escrever" e o MCP
 * `get_article_for_writing`, pela MESMA montagem): o grupo EFETIVO do artigo
 * (etiqueta gravada ou herança viva das keywords, `readArticleGroupMemberships`
 * — o ponto único da rota de grupos, da mesa e do Arquiteto) e o nome/cor do
 * grupo. Só os artigos pedidos, leitura estreita, filtrada pela marca.
 *
 * Nunca derruba o entregável: banco sem a M1, falha de leitura ou grupo
 * sumido = o artigo sai sem a linha do grupo (o grupo é organização, não
 * fundamento do artigo). Nada é gravado.
 */

type Client = Pick<SupabaseClient, "from">;

const ID_CHUNK = 100;

export async function readArticleGroupLabels(client: Client, brandId: string, articleIds: readonly string[]): Promise<Map<string, EditorialGroupLabel>> {
  const saida = new Map<string, EditorialGroupLabel>();
  const ids = [...new Set(articleIds.filter(id => typeof id === "string" && id.length > 0))];
  if (!brandId || !ids.length) return saida;
  try {
    const lidas = await readArticleGroupMemberships(client, brandId, { articleIds: ids });
    if (!lidas.ok) return saida;
    const grupoDoArtigo = new Map<string, string>();
    for (const membro of lidas.memberships.values()) if (membro.groupId && ids.includes(membro.articleId)) grupoDoArtigo.set(membro.articleId, membro.groupId);
    const grupos = [...new Set(grupoDoArtigo.values())];
    const rotulos = new Map<string, EditorialGroupLabel>();
    for (let i = 0; i < grupos.length; i += ID_CHUNK) {
      const { data, error } = await client.from("editorial_groups").select("id,marca_id,name,color,origin").eq("marca_id", brandId).in("id", grupos.slice(i, i + ID_CHUNK));
      if (error) return saida;
      for (const linha of (data || []) as Array<Record<string, unknown>>) {
        if (linha.marca_id !== brandId || typeof linha.id !== "string" || typeof linha.name !== "string" || !isEditorialGroupColor(linha.color)) continue;
        rotulos.set(linha.id, editorialGroupLabelOf({ id: linha.id, name: linha.name, color: linha.color, origin: linha.origin === "declared_plan" ? "declared_plan" : "manual" }));
      }
    }
    for (const [articleId, groupId] of grupoDoArtigo) {
      const rotulo = rotulos.get(groupId);
      if (rotulo) saida.set(articleId, rotulo);
    }
    return saida;
  } catch {
    return new Map();
  }
}
