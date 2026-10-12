import type { SupabaseClient } from "@supabase/supabase-js";
import { appendEditorialGroupEvents, type GroupsUnavailable } from "./editorial-groups-store.ts";
import {
  ARTICLE_GROUP_TAGGING_LABELS,
  planArticleGroupMove,
  planArticleGroupTagging,
  type ArticleGroupMoveRefusalCode,
  type ArticleGroupOrigin,
  type ArticleGroupTaggingEntry,
  type ArticleKeywordIndex,
} from "./article-groups.ts";
import {
  deleteArticleGroupRows,
  readArticleGroupMemberships,
  readGroupStatuses,
  readKeywordGroupInfo,
  writeArticleGroupRows,
  type KeywordGroupInfo,
} from "./article-groups-store.ts";

/**
 * ===== NÚCLEO DO GRUPO DO ARTIGO (F2) — UM SÓ =====
 *
 * Tudo o que grava `editorial_group_articles` passa por aqui: a ação
 * "Etiquetar artigos pelo grupo das keywords" (prévia e aplicação), a
 * etiqueta ADITIVA ao formar o ArticleDNA e ao importar no Radar, e o
 * "Mover para o grupo" do rodapé. A tela chama pela rota
 * `/api/editorial/groups/articles`; o MCP, quando ganhar a ferramenta (F6),
 * chama estas mesmas funções. Nenhum caminho paralelo.
 *
 * Nada aqui mexe em ArticleDNA, SiloDNA, item do Radar, status, versão ou
 * aprovação (princípio 3 da SDD). Nenhuma chamada paga.
 */

type Client = Pick<SupabaseClient, "from">;

export type ArticleGroupPreviewEntry = ArticleGroupTaggingEntry & {
  /** A principal do ArticleDNA, para a pessoa reconhecer o artigo. */
  label: string | null;
  statusLabel: string;
};

export type ArticleGroupTaggingPreview = {
  ok: true;
  entries: ArticleGroupPreviewEntry[];
  willTagCount: number;
};

async function planoDeEtiquetas(client: Client, brandId: string, articleIds?: readonly string[] | null, articles?: readonly ArticleKeywordIndex[], keywordInfo?: ReadonlyMap<string, KeywordGroupInfo>) {
  const [leitura, grupos] = await Promise.all([
    readArticleGroupMemberships(client, brandId, { articleIds: articleIds ?? undefined, articles, keywordInfo }),
    readGroupStatuses(client, brandId),
  ]);
  if (!leitura.ok) return leitura;
  if (!grupos.ok) return grupos;
  const plano = planArticleGroupTagging({ memberships: leitura.memberships, groupStatusById: grupos.statuses, articleIds });
  const principalDe = new Map(leitura.articles.map(article => [article.articleId, article.principalKeywordId]));
  const entries: ArticleGroupPreviewEntry[] = plano.entries.map(entry => {
    const principal = principalDe.get(entry.articleId) || null;
    return { ...entry, label: principal ? leitura.keywordInfo.get(principal)?.keyword ?? null : null, statusLabel: ARTICLE_GROUP_TAGGING_LABELS[entry.status] };
  });
  return { ok: true as const, entries, willTag: plano.willTag };
}

/** Prévia: o que cada artigo vai receber. Nada é gravado. */
export async function previewArticleGroupTaggingWithCore(client: Client, input: { brandId: string; articleIds?: readonly string[] | null }): Promise<ArticleGroupTaggingPreview | GroupsUnavailable> {
  const plano = await planoDeEtiquetas(client, input.brandId, input.articleIds);
  if (!plano.ok) return plano;
  return { ok: true, entries: plano.entries, willTagCount: plano.willTag.length };
}

export type ArticleGroupTaggingResult = {
  ok: true;
  tagged: Array<{ articleId: string; groupId: string; origin: ArticleGroupOrigin }>;
  notConfirmed: string[];
  skipped: ArticleGroupPreviewEntry[];
  eventRecorded: boolean;
};

/**
 * Grava a etiqueta dos artigos SEM etiqueta, pelo grupo das keywords
 * (aditivo: `if_missing`). O servidor recalcula o plano — a lista da tela só
 * restringe o escopo; o que mudou desde a prévia volta em `skipped`.
 */
export async function applyArticleGroupTaggingWithCore(client: Client, input: {
  brandId: string;
  actorUserId: string;
  articleIds?: readonly string[] | null;
  /** Formação e importação já têm o índice do artigo em mãos (sem reler o ArticleDNA). */
  articles?: readonly ArticleKeywordIndex[];
  /** E o grupo das keywords dele, já lido (sem reler). */
  keywordInfo?: ReadonlyMap<string, KeywordGroupInfo>;
  trigger: "explicit" | "formation" | "radar_import";
}): Promise<ArticleGroupTaggingResult | GroupsUnavailable> {
  const plano = await planoDeEtiquetas(client, input.brandId, input.articleIds, input.articles, input.keywordInfo);
  if (!plano.ok) return plano;
  const escrita = await writeArticleGroupRows(client, { brandId: input.brandId, actorUserId: input.actorUserId, rows: plano.willTag, mode: "if_missing" });
  if (!escrita.ok) return escrita;
  const confirmadas = new Set(escrita.confirmed.map(row => row.articleId));
  const tagged = plano.willTag.filter(row => confirmadas.has(row.articleId));
  const porGrupo = new Map<string, string[]>();
  for (const row of tagged) porGrupo.set(row.groupId, [...(porGrupo.get(row.groupId) || []), row.articleId]);
  const eventRecorded = await appendEditorialGroupEvents(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    events: [...porGrupo.entries()].map(([groupId, articleIds]) => ({ groupId, eventType: "article_assigned" as const, payload: { articleIds, mode: "inherited", trigger: input.trigger } })),
  });
  return {
    ok: true,
    tagged,
    notConfirmed: escrita.notConfirmed,
    skipped: plano.entries.filter(entry => entry.status !== "will_tag"),
    eventRecorded,
  };
}

/**
 * ADITIVO E SILENCIOSO: chamado ao formar o ArticleDNA e ao importar no
 * Radar. Nunca lança e nunca muda o resultado da operação que o chamou — a
 * etiqueta é organização. Sem a M1, não faz nada.
 */
export async function ensureArticleGroupsFromKeywordsWithCore(client: Client, input: {
  brandId: string;
  actorUserId: string;
  articles: readonly ArticleKeywordIndex[];
  trigger: "formation" | "radar_import";
}): Promise<{ status: "tagged" | "nothing_to_tag" | "unavailable" | "failed"; tagged: number }> {
  try {
    if (!input.articles.length) return { status: "nothing_to_tag", tagged: 0 };
    // Caminho curto: uma leitura só (o grupo das keywords do artigo). Marca sem grupo nas
    // keywords dele não paga mais nada — nem etiqueta, nem status de grupo.
    const keywords = await readKeywordGroupInfo(client, input.brandId, input.articles.flatMap(article => [...article.keywordIds, ...(article.subjectKeywordId ? [article.subjectKeywordId] : [])]));
    if (!keywords.ok) return { status: "unavailable", tagged: 0 };
    if (![...keywords.info.values()].some(info => info.groupId)) return { status: "nothing_to_tag", tagged: 0 };
    const resultado = await applyArticleGroupTaggingWithCore(client, {
      brandId: input.brandId,
      actorUserId: input.actorUserId,
      articleIds: input.articles.map(article => article.articleId),
      articles: input.articles,
      keywordInfo: keywords.info,
      trigger: input.trigger,
    });
    if (!resultado.ok) return { status: "unavailable", tagged: 0 };
    return { status: resultado.tagged.length ? "tagged" : "nothing_to_tag", tagged: resultado.tagged.length };
  } catch {
    return { status: "failed", tagged: 0 };
  }
}

export type ArticleGroupMoveResult = {
  ok: true;
  groupId: string | null;
  moved: string[];
  returnedToKeywords: string[];
  unchanged: string[];
  refused: Array<{ articleId: string; code: ArticleGroupMoveRefusalCode; message: string }>;
  notConfirmed: string[];
  eventRecorded: boolean;
};

/** Rodapé: "Mover para <grupo>" (humano) ou "Voltar ao grupo das keywords" (null). */
export async function moveArticlesToGroupWithCore(client: Client, input: {
  brandId: string;
  actorUserId: string;
  articleIds: readonly string[];
  groupId: string | null;
}): Promise<ArticleGroupMoveResult | GroupsUnavailable> {
  const [leitura, grupos] = await Promise.all([
    readArticleGroupMemberships(client, input.brandId, { articleIds: input.articleIds }),
    readGroupStatuses(client, input.brandId),
  ]);
  if (!leitura.ok) return leitura;
  if (!grupos.ok) return grupos;
  const plano = planArticleGroupMove({ articleIds: input.articleIds, targetGroupId: input.groupId, memberships: leitura.memberships, groupStatusById: grupos.statuses });
  const escrita = await writeArticleGroupRows(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    rows: plano.toUpsert.map(row => ({ articleId: row.articleId, groupId: row.groupId, origin: "human" as const })),
    mode: "replace",
  });
  if (!escrita.ok) return escrita;
  const apagadas = await deleteArticleGroupRows(client, { brandId: input.brandId, articleIds: plano.toDelete.map(row => row.articleId) });
  if (!apagadas.ok) return apagadas;
  const movidas = new Set(escrita.confirmed.map(row => row.articleId));
  const devolvidas = new Set(apagadas.confirmed);
  const eventos = [
    ...(input.groupId && movidas.size ? [{ groupId: input.groupId, eventType: "article_assigned" as const, payload: { articleIds: [...movidas], mode: "human" } }] : []),
    ...[...new Set(plano.toDelete.filter(row => devolvidas.has(row.articleId)).map(row => row.fromGroupId))].map(groupId => ({
      groupId,
      eventType: "article_assigned" as const,
      payload: { articleIds: plano.toDelete.filter(row => row.fromGroupId === groupId && devolvidas.has(row.articleId)).map(row => row.articleId), mode: "returned_to_keywords" },
    })),
  ];
  const eventRecorded = await appendEditorialGroupEvents(client, { brandId: input.brandId, actorUserId: input.actorUserId, events: eventos });
  return {
    ok: true,
    groupId: input.groupId,
    moved: [...movidas],
    returnedToKeywords: [...devolvidas],
    unchanged: plano.unchanged,
    refused: plano.refused,
    notConfirmed: [...escrita.notConfirmed, ...apagadas.notConfirmed],
    eventRecorded,
  };
}
