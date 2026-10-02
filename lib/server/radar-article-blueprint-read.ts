import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RadarArticleBlueprintApproval, RadarArticleBlueprintPayload } from "@/lib/radar/article-blueprint";

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

/**
 * 2026-10-02 · QUAL VERSÃO VAI AO CSV, por artigo e para o pacote VIGENTE.
 *
 * A aprovada mais nova; sem aprovada, a proposta mais nova da IA (ou a edição
 * do dono ainda não aprovada). Pura, para a regra ser testada sem banco.
 */
export function radarArticleBlueprintExportChoice(
  linhas: ReadonlyArray<{ id: string; articleId: string; bundleHash: string; versionNumber: number; state: string }>,
  hashes: ReadonlyMap<string, string>,
): Map<string, { id: string; approval: RadarArticleBlueprintApproval }> {
  const ordem = [...linhas].sort((a, b) => b.versionNumber - a.versionNumber);
  const saida = new Map<string, { id: string; approval: RadarArticleBlueprintApproval }>();
  for (const estado of ["APPROVED", "DRAFT"] as const) {
    for (const linha of ordem) {
      if (linha.state !== estado || saida.has(linha.articleId) || hashes.get(linha.articleId) !== linha.bundleHash) continue;
      saida.set(linha.articleId, { id: linha.id, approval: estado });
    }
  }
  return saida;
}

/**
 * 2026-10-02 · O ARTIGO-MODELO QUE O CSV LEVA: aprovado ou, sem ele, a proposta.
 *
 * Decisão do dono: enquanto ele não aprova, o CSV JÁ SAI com a estrutura
 * organizada, marcada como proposta da IA. Duas consultas por lote, filtradas
 * pela marca: primeiro os metadados (sem payload), depois só os payloads
 * escolhidos — um Silo com muitas versões de rascunho não traz todas elas.
 * Cada payload sai com `approval` (o estado, que nunca é gravado).
 *
 * Tolerante como a leitura do aprovado: sem tabela ou com o banco recusando,
 * o CSV sai sem artigo-modelo. O Redator continua lendo só o APROVADO
 * (`readWriterApprovedArticleBlueprint`), por outro caminho.
 *
 * 2026-10-02 · A PROPOSTA LEVA AS PENDÊNCIAS. Junto do payload escolhido vêm a
 * `validation` da versão (o que o servidor achou ao conferir a resposta da IA)
 * e a `origin` (IA ou edição do dono) — colunas que já existem; nada novo é
 * gravado. Só a proposta as recebe, no objeto que passa (como `approval`); a
 * aprovada sai como antes.
 */
export async function readRadarArticleBlueprintsForExport(
  client: SupabaseClient,
  brandId: string,
  articles: ReadonlyArray<{ articleId: string; bundleHash: string | null | undefined }>,
): Promise<Map<string, RadarArticleBlueprintPayload>> {
  const saida = new Map<string, RadarArticleBlueprintPayload>();
  const hashes = new Map(articles.filter(item => item.bundleHash).map(item => [item.articleId, String(item.bundleHash)]));
  if (!hashes.size) return saida;
  try {
    const metadados = await client.from("radar_article_blueprints").select("id,article_id,bundle_hash,version_number,state")
      .eq("brand_id", brandId).in("article_id", [...hashes.keys()]).in("state", ["APPROVED", "DRAFT"])
      .order("version_number", { ascending: false });
    if (metadados.error) {
      console.warn("[radar-article-blueprint] export_read_failed", { message: metadados.error.message.slice(0, 240) });
      return saida;
    }
    const linhas = ((metadados.data || []) as unknown as Array<Record<string, unknown>>).map(linha => ({
      id: String(linha.id),
      articleId: String(linha.article_id),
      bundleHash: String(linha.bundle_hash),
      versionNumber: Number(linha.version_number),
      state: String(linha.state),
    }));
    const escolhidas = radarArticleBlueprintExportChoice(linhas, hashes);
    if (!escolhidas.size) return saida;
    const conteudo = await client.from("radar_article_blueprints").select("id,article_id,payload,validation,origin")
      .eq("brand_id", brandId).in("id", [...escolhidas.values()].map(item => item.id));
    if (conteudo.error) {
      console.warn("[radar-article-blueprint] export_read_failed", { message: conteudo.error.message.slice(0, 240) });
      return saida;
    }
    for (const linha of (conteudo.data || []) as unknown as Array<Record<string, unknown>>) {
      const articleId = String(linha.article_id);
      const escolha = escolhidas.get(articleId);
      if (!escolha || escolha.id !== String(linha.id) || !linha.payload || typeof linha.payload !== "object") continue;
      const validation = escolha.approval === "DRAFT" && Array.isArray(linha.validation)
        ? (linha.validation as unknown[]).filter((nota): nota is string => typeof nota === "string" && Boolean(nota.trim()))
        : [];
      saida.set(articleId, {
        ...(linha.payload as RadarArticleBlueprintPayload),
        approval: escolha.approval,
        /* 2026-10-02 · só a proposta leva as pendências e a origem (não gravadas no payload). */
        ...(validation.length ? { validation } : {}),
        ...(escolha.approval === "DRAFT" && (linha.origin === "ai" || linha.origin === "human_edit") ? { origin: linha.origin } : {}),
      });
    }
  } catch (erro) {
    console.warn("[radar-article-blueprint] export_read_failed", { message: erro instanceof Error ? erro.message.slice(0, 240) : "falha desconhecida" });
  }
  return saida;
}
