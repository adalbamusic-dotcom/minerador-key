import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { radarArticleBlueprintWithCurrentNames, type RadarArticleBlueprintApproval, type RadarArticleBlueprintPayload } from "@/lib/radar/article-blueprint";
import {
  radarArticleBlueprintPick,
  type RadarArticleBlueprintCurrentInvestigation,
  type RadarArticleBlueprintVersionMeta,
} from "@/lib/radar/article-blueprint-freeze";
import { radarFrozenObservedAtOfAnalysis, radarPrimaryProfileOfAnalysis } from "@/lib/radar/evidence-bundle-runtime";

/*
 * 2026-10-08 · P0-A · O ARTIGO-MODELO NÃO SOME POR MUDANÇA DE CÓDIGO.
 *
 * As duas leituras do export deixam de exigir só o `bundle_hash` igual ao do
 * dossiê montado ao vivo: com a investigação vigente informada por quem chama
 * (`investigation`, opcional), vale também o CONCLUÍDO mais novo organizado
 * sobre o mesmo congelamento e o mesmo ArticleDNA (regra pura em
 * `lib/radar/article-blueprint-freeze.ts`). Sem `investigation`, a leitura é a
 * de antes, byte a byte — nem as colunas novas são pedidas.
 */

/**
 * 2026-10-08 · P0-A · A INVESTIGAÇÃO VIGENTE DE UM ARTIGO, do que o lote JÁ leu:
 * o instante do congelamento do perfil primário (o `observedAt` do dossiê), o
 * pacote congelado do Google (`finalizedBundle`: id e hash) e a versão do
 * ArticleDNA do dossiê, com a vigência dela (quando passou a valer e quando a
 * seguinte a substituiu). `null` = investigação não congelada.
 */
export function radarArticleBlueprintCurrentInvestigationOf(input: {
  analysisPayload: unknown;
  article: { versionId: string; contentHash?: string | null; createdAt?: string | null; versionNumber?: number | null };
  /** As versões do MESMO ArticleDNA (mesma marca e artigo) que o lote já leu; sem elas, a vigência fica aberta. */
  articleVersions?: ReadonlyArray<{ versionNumber?: number | null; createdAt?: string | null }>;
}): RadarArticleBlueprintCurrentInvestigation | null {
  const frozenAt = radarFrozenObservedAtOfAnalysis(input.analysisPayload);
  if (!frozenAt || !input.article.versionId) return null;
  const analise = input.analysisPayload as { finalizedBundle?: { bundleId?: unknown; bundleHash?: unknown } | null };
  const congelado = radarPrimaryProfileOfAnalysis(input.analysisPayload) === "GOOGLE" ? analise.finalizedBundle ?? null : null;
  const numero = input.article.versionNumber ?? null;
  const seguintes = numero === null ? [] : (input.articleVersions || [])
    .filter(versao => typeof versao.versionNumber === "number" && versao.versionNumber > numero)
    .map(versao => versao.createdAt ? Date.parse(versao.createdAt) : Number.NaN)
    .filter(Number.isFinite);
  return {
    frozenAt,
    frozenBundleId: typeof congelado?.bundleId === "string" ? congelado.bundleId : null,
    frozenBundleHash: typeof congelado?.bundleHash === "string" ? congelado.bundleHash : null,
    articleDnaVersionId: input.article.versionId,
    articleDnaContentHash: input.article.contentHash ?? null,
    articleDnaFrom: input.article.createdAt ?? null,
    articleDnaUntil: seguintes.length ? new Date(Math.min(...seguintes)).toISOString() : null,
  };
}

type ArtigoDoLote = {
  articleId: string;
  bundleHash: string | null | undefined;
  keywords?: readonly string[];
  /** 2026-10-08 · P0-A · a investigação vigente (`radarArticleBlueprintCurrentInvestigationOf`); sem ela, só o hash exato. */
  investigation?: RadarArticleBlueprintCurrentInvestigation | null;
};

/** 2026-10-08 · P0-A · a linha lida, na forma que a regra pura confere (a referência vem do caminho `ir`, nunca do payload inteiro). */
const metaDaLinha = (linha: Record<string, unknown>, indice: number, estado?: string): RadarArticleBlueprintVersionMeta & { articleId: string } => ({
  id: linha.id === undefined || linha.id === null ? `linha-${indice}` : String(linha.id),
  articleId: String(linha.article_id),
  bundleHash: String(linha.bundle_hash),
  versionNumber: Number(linha.version_number),
  state: estado ?? String(linha.state),
  createdAt: typeof linha.created_at === "string" ? linha.created_at : null,
  investigationRef: linha.ir ?? (linha.payload && typeof linha.payload === "object" ? (linha.payload as Record<string, unknown>).investigationRef : undefined),
});

const porArtigo = <T extends { articleId: string }>(linhas: readonly T[]): Map<string, T[]> => {
  const mapa = new Map<string, T[]>();
  for (const linha of linhas) mapa.set(linha.articleId, [...(mapa.get(linha.articleId) || []), linha]);
  return mapa;
};

/*
 * 2026-10-08 · B4 · AS DUAS LEITURAS ENTREGAM A PLANTA COM OS NOMES ATUAIS.
 *
 * O artigo-modelo gravado antes da regra "use os nomes atuais" ainda manda
 * escrever "Google Meu Negócio". A troca é na leitura (a versão no banco é
 * imutável), com as keywords do artigo quando quem chama as passa (`keywords`,
 * opcional): a keyword que traz o nome antigo o preserva.
 */

/**
 * O EXPORT LÊ O APROVADO EM LOTE — uma consulta, filtrada pela marca.
 *
 * A leitura é contexto, não condição: se a tabela não existir ainda (migration
 * não aplicada) ou o banco recusar, o CSV sai como antes, sem artigo-modelo.
 */
export async function readApprovedRadarArticleBlueprints(
  client: SupabaseClient,
  brandId: string,
  articles: ReadonlyArray<ArtigoDoLote>,
): Promise<Map<string, RadarArticleBlueprintPayload>> {
  const saida = new Map<string, RadarArticleBlueprintPayload>();
  const keywordsDe = new Map(articles.map(item => [item.articleId, item.keywords || []]));
  const comHash = articles.filter(item => item.bundleHash);
  if (!comHash.length) return saida;
  /* 2026-10-08 · P0-A · com a investigação vigente, a data e o id entram para a regra do congelamento. */
  const comInvestigacao = comHash.some(item => item.investigation);
  try {
    const leitura = await client.from("radar_article_blueprints").select(comInvestigacao ? "id,article_id,bundle_hash,version_number,created_at,payload" : "article_id,bundle_hash,version_number,payload")
      .eq("brand_id", brandId).eq("state", "APPROVED").in("article_id", comHash.map(item => item.articleId))
      .order("version_number", { ascending: false });
    if (leitura.error) {
      console.warn("[radar-article-blueprint] approved_read_failed", { message: leitura.error.message.slice(0, 240) });
      return saida;
    }
    const linhas = (leitura.data || []) as unknown as Array<Record<string, unknown>>;
    const grupos = porArtigo(linhas.map((linha, indice) => ({ ...metaDaLinha(linha, indice, "APPROVED"), linha })));
    for (const item of comHash) {
      const versoes = grupos.get(item.articleId) || [];
      const escolha = radarArticleBlueprintPick(versoes, { bundleHash: item.bundleHash, investigation: item.investigation ?? null });
      const linha = escolha ? versoes.find(versao => versao.id === escolha.id)?.linha : undefined;
      if (!linha) continue;
      saida.set(item.articleId, radarArticleBlueprintWithCurrentNames(linha.payload as RadarArticleBlueprintPayload, keywordsDe.get(item.articleId)));
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
  linhas: ReadonlyArray<{ id: string; articleId: string; bundleHash: string; versionNumber: number; state: string; createdAt?: string | null; investigationRef?: unknown }>,
  hashes: ReadonlyMap<string, string>,
  /** 2026-10-08 · P0-A · a investigação vigente por artigo (opcional): sem ela, só o hash exato, como antes. */
  investigacoes: ReadonlyMap<string, RadarArticleBlueprintCurrentInvestigation | null> = new Map(),
): Map<string, { id: string; approval: RadarArticleBlueprintApproval }> {
  const saida = new Map<string, { id: string; approval: RadarArticleBlueprintApproval }>();
  for (const [articleId, versoes] of porArtigo(linhas)) {
    if (!hashes.has(articleId)) continue;
    /* Hash exato (a concluída; sem ela, o rascunho antigo); senão, a concluída da investigação vigente. */
    const escolha = radarArticleBlueprintPick(versoes, { bundleHash: hashes.get(articleId), investigation: investigacoes.get(articleId) ?? null }, { drafts: true });
    if (escolha) saida.set(articleId, { id: escolha.id, approval: escolha.approval });
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
  articles: ReadonlyArray<ArtigoDoLote>,
): Promise<Map<string, RadarArticleBlueprintPayload>> {
  const saida = new Map<string, RadarArticleBlueprintPayload>();
  const keywordsDe = new Map(articles.map(item => [item.articleId, item.keywords || []]));
  const hashes = new Map(articles.filter(item => item.bundleHash).map(item => [item.articleId, String(item.bundleHash)]));
  if (!hashes.size) return saida;
  /*
   * 2026-10-08 · P0-A · com a investigação vigente, os metadados trazem também
   * quando a versão nasceu e a referência do congelamento que ela gravou — um
   * caminho pequeno do payload (`ir`), nunca a planta.
   */
  const investigacoes = new Map(articles.filter(item => hashes.has(item.articleId) && item.investigation).map(item => [item.articleId, item.investigation!]));
  try {
    const metadados = await client.from("radar_article_blueprints").select(investigacoes.size ? "id,article_id,bundle_hash,version_number,state,created_at,ir:payload->investigationRef" : "id,article_id,bundle_hash,version_number,state")
      .eq("brand_id", brandId).in("article_id", [...hashes.keys()]).in("state", ["APPROVED", "DRAFT"])
      .order("version_number", { ascending: false });
    if (metadados.error) {
      console.warn("[radar-article-blueprint] export_read_failed", { message: metadados.error.message.slice(0, 240) });
      return saida;
    }
    const linhas = ((metadados.data || []) as unknown as Array<Record<string, unknown>>).map((linha, indice) => metaDaLinha(linha, indice));
    const escolhidas = radarArticleBlueprintExportChoice(linhas, hashes, investigacoes);
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
        ...radarArticleBlueprintWithCurrentNames(linha.payload as RadarArticleBlueprintPayload, keywordsDe.get(articleId)),
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
