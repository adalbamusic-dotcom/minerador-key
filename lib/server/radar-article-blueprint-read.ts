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
  const analise = input.analysisPayload as { finalizedBundle?: { bundleId?: unknown; bundleHash?: unknown } | null; amazonFrozenInvestigation?: { finalizedAt?: unknown } | null };
  const congelado = radarPrimaryProfileOfAnalysis(input.analysisPayload) === "GOOGLE" ? analise.finalizedBundle ?? null : null;
  /*
   * 2026-10-09 · A INVESTIGAÇÃO CONSIDERADA NÃO É SÓ A DO GOOGLE. A Amazon
   * congelada (como acréscimo de review ao Google, ou como perfil primário) entra
   * na identidade da planta: o bloco comercial vai ao pedido, e um congelamento
   * NOVO da Amazon desliga a planta para reorganizar. Sem Amazon congelada, null.
   */
  const amazon = analise.amazonFrozenInvestigation && typeof analise.amazonFrozenInvestigation === "object" ? analise.amazonFrozenInvestigation : null;
  const amazonFrozenAt = typeof amazon?.finalizedAt === "string" && amazon.finalizedAt.trim() ? amazon.finalizedAt : null;
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
    amazonFrozenAt,
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
 * ===== 2026-10-09 · A LEITURA DA PLANTA QUE FALHA NÃO VIRA LEGADO EM SILÊNCIO =====
 *
 * Regra do dono (2026-10-09): o artigo-modelo é o fundamento de todo
 * entregável, e o processo antigo não fica como caminho alternativo. Antes, a
 * leitura que falhava (tabela ausente, banco recusando, rede) voltava um mapa
 * vazio e o CSV saía montado pelo modelo editorial legado, sem aviso. Agora a
 * falha é um estado explícito (`blueprint_unavailable`, HTTP 503): a rota e o
 * MCP devolvem o erro claro (`authzErrorResponse` lê o `status`), e nada é
 * montado sem a planta. Planta que não existe continua sendo outra coisa: o
 * artigo fica fora do mapa, e quem entrega devolve `needs_article_blueprint`.
 */
export const RADAR_ARTICLE_BLUEPRINT_UNAVAILABLE = "blueprint_unavailable" as const;

export class RadarArticleBlueprintUnavailableError extends Error {
  readonly code = RADAR_ARTICLE_BLUEPRINT_UNAVAILABLE;
  readonly status = 503;
  /** Os artigos cuja planta não pôde ser lida (todo o lote: a leitura é uma consulta só). */
  readonly articleIds: string[];

  constructor(articleIds: readonly string[], detalhe: string) {
    super(`Não foi possível ler o artigo-modelo de ${articleIds.length === 1 ? "1 artigo" : `${articleIds.length} artigos`} (${detalhe}). Nada foi montado sem a planta: tente de novo em instantes.`);
    this.name = "RadarArticleBlueprintUnavailableError";
    this.articleIds = [...articleIds];
  }
}

/** A falha da leitura: registrada no log e devolvida como estado explícito (nunca um mapa vazio). */
function leituraIndisponivel(evento: string, articleIds: readonly string[], erro: unknown): never {
  const mensagem = erro instanceof Error ? erro.message : typeof erro === "object" && erro && "message" in erro ? String((erro as { message: unknown }).message) : "falha desconhecida";
  console.warn(`[radar-article-blueprint] ${evento}`, { message: mensagem.slice(0, 240), articles: articleIds.length });
  throw new RadarArticleBlueprintUnavailableError(articleIds, "o banco não respondeu à leitura das plantas");
}

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
 * 2026-10-09 · A leitura é CONDIÇÃO (o artigo-modelo é o fundamento): a falha
 * vira `RadarArticleBlueprintUnavailableError` (`blueprint_unavailable`), nunca
 * um mapa vazio que deixaria o entregável sair pelo legado.
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
  let leitura: { data: unknown; error: { message: string } | null };
  try {
    leitura = await client.from("radar_article_blueprints").select(comInvestigacao ? "id,article_id,bundle_hash,version_number,created_at,payload" : "article_id,bundle_hash,version_number,payload")
      .eq("brand_id", brandId).eq("state", "APPROVED").in("article_id", comHash.map(item => item.articleId))
      .order("version_number", { ascending: false });
  } catch (erro) {
    return leituraIndisponivel("approved_read_failed", comHash.map(item => item.articleId), erro);
  }
  if (leitura.error) return leituraIndisponivel("approved_read_failed", comHash.map(item => item.articleId), leitura.error);
  const linhas = (leitura.data || []) as unknown as Array<Record<string, unknown>>;
  const grupos = porArtigo(linhas.map((linha, indice) => ({ ...metaDaLinha(linha, indice, "APPROVED"), linha })));
  for (const item of comHash) {
    const versoes = grupos.get(item.articleId) || [];
    const escolha = radarArticleBlueprintPick(versoes, { bundleHash: item.bundleHash, investigation: item.investigation ?? null });
    const linha = escolha ? versoes.find(versao => versao.id === escolha.id)?.linha : undefined;
    if (!linha) continue;
    saida.set(item.articleId, radarArticleBlueprintWithCurrentNames(linha.payload as RadarArticleBlueprintPayload, keywordsDe.get(item.articleId)));
  }
  return saida;
}

/**
 * 2026-10-02 · QUAL VERSÃO VAI AO CSV, por artigo e para o pacote VIGENTE.
 *
 * 2026-10-09 · SÓ A CONCLUÍDA (regra do dono: o artigo-modelo é o fundamento,
 * e o processo antigo é substituído). A escolha é `radarArticleBlueprintPick`
 * sem rascunho: o hash exato do dossiê ou, senão, a APPROVED mais nova do
 * mesmo congelamento e do mesmo ArticleDNA. O rascunho antigo (anterior a
 * 2026-10-02, quando toda versão passou a nascer concluída) não conta: o artigo
 * fica sem planta, e quem entrega devolve `needs_article_blueprint`. Pura, para
 * a regra ser testada sem banco.
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
    /* Hash exato (a concluída); senão, a concluída da investigação vigente. Rascunho não vale. */
    const escolha = radarArticleBlueprintPick(versoes, { bundleHash: hashes.get(articleId), investigation: investigacoes.get(articleId) ?? null });
    if (escolha) saida.set(articleId, { id: escolha.id, approval: escolha.approval });
  }
  return saida;
}

/**
 * 2026-10-02 · O ARTIGO-MODELO QUE O CSV LEVA.
 *
 * Duas consultas por lote, filtradas pela marca: primeiro os metadados (sem
 * payload), depois só os payloads escolhidos. Cada payload sai com `approval`
 * (o estado, que nunca é gravado).
 *
 * 2026-10-09 · SÓ A CONCLUÍDA, E A FALHA É ESTADO EXPLÍCITO. A proposta em
 * rascunho deixou de ir ao CSV (a regra é a mesma do Redator e do `ifMissing`:
 * `radarArticleBlueprintPick` sem rascunho), e a leitura que falha não devolve
 * mais um mapa vazio — ela levanta `RadarArticleBlueprintUnavailableError`
 * (`blueprint_unavailable`, 503), para nenhum entregável sair pelo legado.
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
  const doLote = [...hashes.keys()];
  let metadados: { data: unknown; error: { message: string } | null };
  try {
    metadados = await client.from("radar_article_blueprints").select(investigacoes.size ? "id,article_id,bundle_hash,version_number,state,created_at,ir:payload->investigationRef" : "id,article_id,bundle_hash,version_number,state")
      .eq("brand_id", brandId).in("article_id", doLote).eq("state", "APPROVED")
      .order("version_number", { ascending: false });
  } catch (erro) {
    return leituraIndisponivel("export_read_failed", doLote, erro);
  }
  if (metadados.error) return leituraIndisponivel("export_read_failed", doLote, metadados.error);
  const linhas = ((metadados.data || []) as unknown as Array<Record<string, unknown>>).map((linha, indice) => metaDaLinha(linha, indice));
  const escolhidas = radarArticleBlueprintExportChoice(linhas, hashes, investigacoes);
  if (!escolhidas.size) return saida;
  let conteudo: { data: unknown; error: { message: string } | null };
  try {
    conteudo = await client.from("radar_article_blueprints").select("id,article_id,payload")
      .eq("brand_id", brandId).in("id", [...escolhidas.values()].map(item => item.id));
  } catch (erro) {
    return leituraIndisponivel("export_read_failed", doLote, erro);
  }
  if (conteudo.error) return leituraIndisponivel("export_read_failed", doLote, conteudo.error);
  for (const linha of (conteudo.data || []) as unknown as Array<Record<string, unknown>>) {
    const articleId = String(linha.article_id);
    const escolha = escolhidas.get(articleId);
    if (!escolha || escolha.id !== String(linha.id) || !linha.payload || typeof linha.payload !== "object") continue;
    saida.set(articleId, {
      ...radarArticleBlueprintWithCurrentNames(linha.payload as RadarArticleBlueprintPayload, keywordsDe.get(articleId)),
      approval: escolha.approval,
    });
  }
  return saida;
}
