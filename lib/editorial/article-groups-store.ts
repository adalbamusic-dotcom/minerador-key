import type { SupabaseClient } from "@supabase/supabase-js";
import { isEditorialGroupsSchemaMissing, type EditorialGroupFilter } from "./editorial-groups.ts";
import { groupsUnavailable, type GroupsUnavailable } from "./editorial-groups-store.ts";
import {
  articleKeywordIndex,
  isArticleGroupOrigin,
  resolveArticleGroupMemberships,
  type ArticleGroupMembership,
  type ArticleGroupOrigin,
  type ArticleKeywordIndex,
  type PersistedArticleGroup,
} from "./article-groups.ts";

/**
 * ===== GRUPO DO ARTIGO — LEITURA E ESCRITA (F2) =====
 *
 * Cliente INJETADO (rota com o cliente operacional depois da autorização;
 * testes com banco de mentira). Toda consulta filtra pela marca: etiqueta,
 * ArticleDNA e keyword de outra marca nunca entram no cálculo (a FK composta
 * `(group_id, marca_id)` e a RLS repetem a regra no banco).
 *
 * A leitura do ArticleDNA é ESTREITA: só ids por caminho JSON
 * (`principalKeywordId`, `secondaryKeywordIds`, `narrativeReinforcementIds`,
 * `subject.keywordId`), nunca o payload — o mesmo cuidado da listagem dos
 * documentos (2026-10-11). Sem a M1, devolve `GROUPS_NOT_AVAILABLE`.
 */

type Client = Pick<SupabaseClient, "from">;
type DbError = { code?: string; message?: string } | null;

export const ARTICLE_GROUP_ID_CHUNK = 100;
export const ARTICLE_GROUP_PAGE_SIZE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ArticleGroupsPersistenceError extends Error {
  readonly code: string;
  constructor(error: DbError, operation: string) {
    super(`Falha ao ${operation} o grupo dos artigos.`);
    this.name = "ArticleGroupsPersistenceError";
    this.code = typeof error?.code === "string" ? error.code : "database_error";
  }
}

const blocos = <T,>(itens: readonly T[], tamanho = ARTICLE_GROUP_ID_CHUNK) => {
  const saida: T[][] = [];
  for (let indice = 0; indice < itens.length; indice += tamanho) saida.push(itens.slice(indice, indice + tamanho));
  return saida;
};

const textos = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
const texto = (value: unknown) => typeof value === "string" && value.length > 0 ? value : null;

/** Lê todas as páginas (o PostgREST corta em 1000 linhas por padrão). */
async function paginado<T>(ler: (de: number, ate: number) => PromiseLike<{ data: unknown; error: DbError }>): Promise<{ rows: T[]; error: DbError }> {
  const rows: T[] = [];
  for (let de = 0; ; de += ARTICLE_GROUP_PAGE_SIZE) {
    const { data, error } = await ler(de, de + ARTICLE_GROUP_PAGE_SIZE - 1);
    if (error) return { rows, error };
    const pagina = (Array.isArray(data) ? data : []) as T[];
    rows.push(...pagina);
    if (pagina.length < ARTICLE_GROUP_PAGE_SIZE) return { rows, error: null };
  }
}

/* ------------------------------ leituras ------------------------------ */

/** Etiquetas gravadas da marca (ou só dos artigos pedidos). */
export async function readPersistedArticleGroups(client: Client, brandId: string, articleIds?: readonly string[]): Promise<{ ok: true; rows: PersistedArticleGroup[] } | GroupsUnavailable> {
  const linhas: Array<Record<string, unknown>> = [];
  const consultar = async (ids: readonly string[] | null) => {
    let query = client.from("editorial_group_articles").select("article_id,group_id,origin").eq("marca_id", brandId);
    if (ids) query = query.in("article_id", [...ids]);
    return await query;
  };
  if (articleIds) {
    for (const bloco of blocos([...new Set(articleIds)])) {
      const { data, error } = await consultar(bloco);
      if (error) {
        if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
        throw new ArticleGroupsPersistenceError(error, "ler");
      }
      linhas.push(...((data || []) as Array<Record<string, unknown>>));
    }
  } else {
    const { data, error } = await consultar(null);
    if (error) {
      if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
      throw new ArticleGroupsPersistenceError(error, "ler");
    }
    linhas.push(...((data || []) as Array<Record<string, unknown>>));
  }
  const rows: PersistedArticleGroup[] = [];
  for (const linha of linhas) {
    const articleId = texto(linha.article_id);
    const groupId = texto(linha.group_id);
    if (!articleId || !groupId) continue;
    rows.push({ articleId, groupId, origin: isArticleGroupOrigin(linha.origin) ? linha.origin : "human" });
  }
  return { ok: true, rows };
}

const DNA_PATHS = (prefixo: string) => [
  `principal:${prefixo}->>principalKeywordId`,
  `secondary:${prefixo}->secondaryKeywordIds`,
  `reinforcement:${prefixo}->narrativeReinforcementIds`,
  `subject:${prefixo}->subject->>keywordId`,
].join(",");

type DnaRow = { version_id?: unknown; entity_id?: unknown; version_number?: unknown; principal?: unknown; secondary?: unknown; reinforcement?: unknown; subject?: unknown };

/**
 * O índice do ArticleDNA VIGENTE (maior versão) de cada artigo da marca.
 * O payload gravado é o ArticleDNA cru; versão antiga em envelope
 * (`payload.payload`) é lida numa segunda consulta, só para ela.
 */
export async function readArticleKeywordIndex(client: Client, brandId: string, articleIds?: readonly string[]): Promise<ArticleKeywordIndex[]> {
  const linhas: DnaRow[] = [];
  const select = `version_id,entity_id,version_number,${DNA_PATHS("payload")}`;
  const ler = async (ids: readonly string[] | null) => {
    let query = client.from("editorial_artifact_versions").select(select).eq("marca_id", brandId).eq("artifact_type", "article_dna");
    if (ids) query = query.in("entity_id", [...ids]);
    const { data, error } = await query;
    if (error) throw new ArticleGroupsPersistenceError(error, "ler o ArticleDNA para");
    linhas.push(...((data || []) as DnaRow[]));
  };
  if (articleIds) for (const bloco of blocos([...new Set(articleIds)])) await ler(bloco);
  else await ler(null);

  const vigente = new Map<string, DnaRow>();
  for (const linha of linhas) {
    const id = texto(linha.entity_id);
    if (!id) continue;
    const atual = vigente.get(id);
    if (!atual || Number(linha.version_number) > Number(atual.version_number)) vigente.set(id, linha);
  }
  const envelopes = [...vigente.values()].filter(linha => !texto(linha.principal) && texto(linha.version_id));
  if (envelopes.length) {
    for (const bloco of blocos(envelopes.map(linha => String(linha.version_id)))) {
      const { data, error } = await client.from("editorial_artifact_versions").select(`version_id,entity_id,version_number,${DNA_PATHS("payload->payload")}`).eq("marca_id", brandId).in("version_id", bloco);
      if (error) throw new ArticleGroupsPersistenceError(error, "ler o ArticleDNA para");
      for (const linha of (data || []) as DnaRow[]) {
        const id = texto(linha.entity_id);
        if (id && texto(linha.principal)) vigente.set(id, linha);
      }
    }
  }
  return [...vigente.entries()].map(([articleId, linha]) => articleKeywordIndex({
    articleId,
    principalKeywordId: texto(linha.principal),
    subjectKeywordId: texto(linha.subject),
    secondaryKeywordIds: textos(linha.secondary),
    narrativeReinforcementIds: textos(linha.reinforcement),
  }));
}

/**
 * Silos (SiloDNA) que têm algum dos artigos como Pilar ou Suporte, em
 * qualquer versão. Leitura estreita: só os ids por caminho JSON (cru e
 * envelope — os Silos são poucos).
 */
export async function readSiloIdsForArticles(client: Client, brandId: string, articleIds: readonly string[]): Promise<string[]> {
  const alvo = new Set(articleIds);
  if (!alvo.size) return [];
  const { data, error } = await client.from("editorial_artifact_versions")
    .select("entity_id,pillar:payload->>pillarArticleId,supports:payload->supportArticleIds,envelope_pillar:payload->payload->>pillarArticleId,envelope_supports:payload->payload->supportArticleIds")
    .eq("marca_id", brandId).eq("artifact_type", "silo_dna");
  if (error) throw new ArticleGroupsPersistenceError(error, "ler os Silos para");
  const silos = new Set<string>();
  for (const linha of (data || []) as Array<Record<string, unknown>>) {
    const id = texto(linha.entity_id);
    if (!id) continue;
    const artigos = [texto(linha.pillar), ...textos(linha.supports), texto(linha.envelope_pillar), ...textos(linha.envelope_supports)];
    if (artigos.some(artigo => artigo && alvo.has(artigo))) silos.add(id);
  }
  return [...silos];
}

export type KeywordGroupInfo = { keyword: string | null; groupId: string | null };

/** `group_id` (e o texto, para a prévia) das keywords pedidas, só desta marca. */
export async function readKeywordGroupInfo(client: Client, brandId: string, keywordIds: readonly string[]): Promise<{ ok: true; info: Map<string, KeywordGroupInfo> } | GroupsUnavailable> {
  const info = new Map<string, KeywordGroupInfo>();
  const validos = [...new Set(keywordIds)].filter(id => UUID.test(id));
  for (const bloco of blocos(validos)) {
    const { data, error } = await client.from("minerador_keywords").select("id,keyword,group_id").eq("brand_id", brandId).in("id", bloco);
    if (error) {
      if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
      throw new ArticleGroupsPersistenceError(error, "ler as keywords para");
    }
    for (const linha of (data || []) as Array<Record<string, unknown>>) {
      const id = texto(linha.id);
      if (id) info.set(id, { keyword: texto(linha.keyword), groupId: texto(linha.group_id) });
    }
  }
  return { ok: true, info };
}

/** Todas as keywords vivas COM grupo da marca (id → grupo), para a tela. */
export async function readGroupedKeywordIndex(client: Client, brandId: string): Promise<{ ok: true; rows: Array<{ id: string; groupId: string }> } | GroupsUnavailable> {
  const { rows, error } = await paginado<Record<string, unknown>>((de, ate) => client.from("minerador_keywords")
    .select("id,group_id").eq("brand_id", brandId).is("deleted_at", null).not("group_id", "is", null).order("id").range(de, ate));
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new ArticleGroupsPersistenceError(error, "ler as keywords com");
  }
  return { ok: true, rows: rows.flatMap(linha => texto(linha.id) && texto(linha.group_id) ? [{ id: String(linha.id), groupId: String(linha.group_id) }] : []) };
}

/** Ids das keywords vivas do recorte (um grupo, ou "Sem grupo"). */
export async function readKeywordIdsInGroupFilter(client: Client, brandId: string, filter: Exclude<EditorialGroupFilter, { kind: "all" }>): Promise<{ ok: true; ids: string[] } | GroupsUnavailable> {
  const { rows, error } = await paginado<Record<string, unknown>>((de, ate) => {
    const base = client.from("minerador_keywords").select("id").eq("brand_id", brandId).is("deleted_at", null);
    const filtrada = filter.kind === "group" ? base.eq("group_id", filter.groupId) : base.is("group_id", null);
    return filtrada.order("id").range(de, ate);
  });
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new ArticleGroupsPersistenceError(error, "ler as keywords do");
  }
  return { ok: true, ids: rows.flatMap(linha => texto(linha.id) ? [String(linha.id)] : []) };
}

/** Status de cada grupo DESTA marca. */
export async function readGroupStatuses(client: Client, brandId: string): Promise<{ ok: true; statuses: Map<string, "active" | "archived"> } | GroupsUnavailable> {
  const { data, error } = await client.from("editorial_groups").select("id,status").eq("marca_id", brandId);
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new ArticleGroupsPersistenceError(error, "ler os grupos para");
  }
  const statuses = new Map<string, "active" | "archived">();
  for (const linha of (data || []) as Array<Record<string, unknown>>) {
    const id = texto(linha.id);
    if (id && (linha.status === "active" || linha.status === "archived")) statuses.set(id, linha.status);
  }
  return { ok: true, statuses };
}

export type ArticleGroupMembershipsRead = {
  ok: true;
  memberships: Map<string, ArticleGroupMembership>;
  articles: ArticleKeywordIndex[];
  keywordInfo: Map<string, KeywordGroupInfo>;
};

/**
 * O GRUPO EFETIVO DE CADA ARTIGO: etiqueta gravada ou herança viva das
 * keywords. É o ponto único que a rota de grupos, a mesa, o Arquiteto e o
 * núcleo de etiquetar leem.
 */
export async function readArticleGroupMemberships(client: Client, brandId: string, options: { articleIds?: readonly string[]; articles?: readonly ArticleKeywordIndex[]; keywordInfo?: ReadonlyMap<string, KeywordGroupInfo> } = {}): Promise<ArticleGroupMembershipsRead | GroupsUnavailable> {
  const gravadas = await readPersistedArticleGroups(client, brandId, options.articleIds ?? options.articles?.map(article => article.articleId));
  if (!gravadas.ok) return gravadas;
  const articles = options.articles ? [...options.articles] : await readArticleKeywordIndex(client, brandId, options.articleIds);
  const keywordIds = articles.flatMap(article => [...article.keywordIds, ...(article.subjectKeywordId ? [article.subjectKeywordId] : [])]);
  const keywords = options.keywordInfo ? { ok: true as const, info: new Map(options.keywordInfo) } : await readKeywordGroupInfo(client, brandId, keywordIds);
  if (!keywords.ok) return keywords;
  const keywordGroupById = new Map([...keywords.info.entries()].map(([id, info]) => [id, info.groupId]));
  return {
    ok: true,
    memberships: resolveArticleGroupMemberships({ articles, persisted: gravadas.rows, keywordGroupById }),
    articles,
    keywordInfo: keywords.info,
  };
}

/* ------------------------------ escritas ------------------------------ */

/**
 * Grava etiquetas. `if_missing` é ADITIVO (`ignoreDuplicates`: etiqueta que já
 * existe não muda); `replace` é a decisão humana do rodapé. Sucesso só para o
 * que a releitura confirmou.
 */
export async function writeArticleGroupRows(client: Client, input: {
  brandId: string;
  actorUserId: string;
  rows: ReadonlyArray<{ articleId: string; groupId: string; origin: ArticleGroupOrigin }>;
  mode: "if_missing" | "replace";
}): Promise<{ ok: true; confirmed: PersistedArticleGroup[]; notConfirmed: string[] } | GroupsUnavailable> {
  if (!input.rows.length) return { ok: true, confirmed: [], notConfirmed: [] };
  const agora = new Date().toISOString();
  for (const bloco of blocos(input.rows)) {
    const { error } = await client.from("editorial_group_articles").upsert(bloco.map(row => ({
      marca_id: input.brandId,
      article_id: row.articleId,
      group_id: row.groupId,
      origin: row.origin,
      assigned_by: input.actorUserId,
      assigned_at: agora,
    })), input.mode === "if_missing" ? { onConflict: "marca_id,article_id", ignoreDuplicates: true } : { onConflict: "marca_id,article_id" });
    if (error) {
      if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
      throw new ArticleGroupsPersistenceError(error, "gravar");
    }
  }
  const releitura = await readPersistedArticleGroups(client, input.brandId, input.rows.map(row => row.articleId));
  if (!releitura.ok) return releitura;
  const lidas = new Map(releitura.rows.map(row => [row.articleId, row]));
  const confirmed: PersistedArticleGroup[] = [];
  const notConfirmed: string[] = [];
  for (const row of input.rows) {
    const lida = lidas.get(row.articleId);
    // `if_missing` confirma o que ficou com o grupo pedido; quem já tinha outro não é "gravado".
    if (lida && lida.groupId === row.groupId && (input.mode === "replace" ? lida.origin === row.origin : true)) confirmed.push(lida);
    else notConfirmed.push(row.articleId);
  }
  return { ok: true, confirmed, notConfirmed };
}

/** Apaga a etiqueta (o artigo volta a herdar). Confirma pela releitura. */
export async function deleteArticleGroupRows(client: Client, input: { brandId: string; articleIds: readonly string[] }): Promise<{ ok: true; confirmed: string[]; notConfirmed: string[] } | GroupsUnavailable> {
  const ids = [...new Set(input.articleIds)];
  if (!ids.length) return { ok: true, confirmed: [], notConfirmed: [] };
  for (const bloco of blocos(ids)) {
    const { error } = await client.from("editorial_group_articles").delete().eq("marca_id", input.brandId).in("article_id", bloco);
    if (error) {
      if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
      throw new ArticleGroupsPersistenceError(error, "apagar a etiqueta de");
    }
  }
  const releitura = await readPersistedArticleGroups(client, input.brandId, ids);
  if (!releitura.ok) return releitura;
  const restantes = new Set(releitura.rows.map(row => row.articleId));
  return { ok: true, confirmed: ids.filter(id => !restantes.has(id)), notConfirmed: ids.filter(id => restantes.has(id)) };
}
