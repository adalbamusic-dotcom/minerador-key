"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ensureEditorialColorGroup,
  markBrandEditorialGroupsUnavailable,
  refreshBrandEditorialGroups,
  useAreaGroupFilter,
} from "@/components/editorial/editorial-group-area-store";
import {
  EDITORIAL_GROUP_CHOICE_ALL,
  EDITORIAL_GROUP_COLOR_LABELS,
  type EditorialGroupArea,
  type EditorialGroupColor,
  type EditorialGroupScreenFilter,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";
import type { ArticleGroupOrigin } from "@/lib/editorial/article-groups";
import type { ArticleGroupPreviewEntry } from "@/lib/editorial/article-group-core";

/**
 * GRUPOS NO ARQUITETO E NO RADAR (F2) — o mesmo comportamento do Minerador.
 *
 * 2026-10-12 · cores fixas e "não atrapalhar o carregamento" (adendo do §9.1):
 *
 * - A escolha (a cor, "todos" ou "sem-grupo") é DESTA ÁREA e vem do estado leve
 *   compartilhado com a etiqueta da topbar (`editorial-group-area-store`); a
 *   lista de grupos da marca é a mesma das três áreas (cache local na hora,
 *   servidor em segundo plano, uma leitura por sessão).
 * - O grupo EFETIVO de cada artigo (e, no Arquiteto, de cada keyword com grupo)
 *   vem de `GET /api/editorial/groups/articles`, que é PESADO (varre as versões
 *   de ArticleDNA da marca). Ele só começa DEPOIS que a mesa principal da área
 *   carregou (`mainReady`) — ou na hora, quando há uma cor ou "sem-grupo"
 *   escolhidos. Nunca em paralelo ao carregamento inicial com "todos".
 * - O filtro é de TELA: a mesa continua lida inteira e a lista de origem nunca
 *   é trocada pelo recorte (SDD §8). Enquanto os artigos não chegam, um recorte
 *   escolhido não mostra nada (não mostra "tudo" por engano).
 * - Mover e etiquetar: `POST`/`PATCH /api/editorial/groups/articles` — o mesmo
 *   núcleo da formação e da importação. Mover para uma cor garante antes o
 *   grupo dela no servidor. A tela só muda depois da releitura.
 *
 * Tudo é "desta marca": resposta de outra marca (troca no meio da leitura) é
 * descartada.
 */

export type EditorialArticleGroup = { groupId: string | null; origin: ArticleGroupOrigin | null; persisted: boolean; conflict: boolean };

type LoadedArticles = {
  brandId: string;
  includeKeywords: boolean;
  articles: Map<string, EditorialArticleGroup>;
  keywords: Map<string, string>;
};

const SEM_ARTIGOS = new Map<string, EditorialArticleGroup>();
const SEM_KEYWORDS = new Map<string, string>();
const NADA_AINDA: EditorialGroupScreenFilter = { kind: "groups", color: null, groupIds: [] };
const TODOS: EditorialGroupScreenFilter = { kind: "all" };

async function lerJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init }).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) : {};
  return { ok: Boolean(response && response.ok && body?.success === true), status: response?.status ?? 0, body: body as Record<string, unknown> };
}

async function lerArtigos(brandId: string, includeKeywords: boolean): Promise<LoadedArticles | "unavailable" | null> {
  const marca = encodeURIComponent(brandId);
  const artigos = await lerJson(`/api/editorial/groups/articles?marcaId=${marca}${includeKeywords ? "&include=keywords" : ""}`);
  if (!artigos.ok) return artigos.status === 409 && artigos.body.code === "GROUPS_NOT_AVAILABLE" ? "unavailable" : null;
  if (!Array.isArray(artigos.body.articles)) return null;
  const articles = new Map<string, EditorialArticleGroup>();
  for (const item of artigos.body.articles as Array<Record<string, unknown>>) {
    if (typeof item.articleId !== "string") continue;
    articles.set(item.articleId, {
      groupId: typeof item.groupId === "string" ? item.groupId : null,
      origin: typeof item.origin === "string" ? item.origin as ArticleGroupOrigin : null,
      persisted: item.persisted === true,
      conflict: item.conflict === true,
    });
  }
  const keywords = new Map<string, string>();
  for (const item of (Array.isArray(artigos.body.keywords) ? artigos.body.keywords : []) as Array<Record<string, unknown>>) {
    if (typeof item.id === "string" && typeof item.groupId === "string") keywords.set(item.id, item.groupId);
  }
  return { brandId, includeKeywords, articles, keywords };
}

export type ArticleGroupTagPreviewResponse = { ok: true; entries: ArticleGroupPreviewEntry[]; willTagCount: number } | { ok: false; message: string };
export type ArticleGroupTagApplyResponse = { ok: true; tagged: number; notConfirmed: number; skipped: number } | { ok: false; message: string };
export type ArticleGroupMoveResponse =
  | { ok: true; moved: string[]; returnedToKeywords: string[]; unchanged: string[]; refused: Array<{ articleId: string; message: string }>; notConfirmed: string[] }
  | { ok: false; message: string };

const mensagem = (body: Record<string, unknown>, padrao: string) => typeof body.message === "string" ? body.message : padrao;

export function useEditorialGroups({ brandId, enabled, includeKeywords = false, area, mainReady = true }: {
  brandId: string | null;
  enabled: boolean;
  includeKeywords?: boolean;
  /** A área dona da escolha (cada área lembra a sua). */
  area: EditorialGroupArea;
  /** A mesa principal da área já carregou: só então a leitura pesada dos artigos começa com "todos". */
  mainReady?: boolean;
}) {
  const alvo = enabled && brandId ? brandId : null;
  const recorte = useAreaGroupFilter(alvo, area);
  const [loaded, setLoaded] = useState<LoadedArticles | null>(null);
  const [leituraFalhou, setLeituraFalhou] = useState<string | null>(null);
  const brandRef = useRef<string | null>(alvo);
  useEffect(() => {
    brandRef.current = alvo;
  }, [alvo]);

  const available = Boolean(alvo) && recorte.available;
  const precisaDosArtigos = available && (mainReady || recorte.choice !== EDITORIAL_GROUP_CHOICE_ALL || recorte.pending);
  const atual = loaded && loaded.brandId === alvo && loaded.includeKeywords === includeKeywords ? loaded : null;
  const jaTentou = leituraFalhou === `${alvo}:${includeKeywords}`;

  useEffect(() => {
    if (!precisaDosArtigos || !alvo || atual || jaTentou) return;
    let vigente = true;
    void lerArtigos(alvo, includeKeywords).then(resultado => {
      if (!vigente || brandRef.current !== alvo) return;
      if (resultado === "unavailable") { markBrandEditorialGroupsUnavailable(alvo); return; }
      if (!resultado) { setLeituraFalhou(`${alvo}:${includeKeywords}`); return; }
      setLoaded(resultado);
    });
    return () => { vigente = false; };
  }, [precisaDosArtigos, alvo, includeKeywords, atual, jaTentou]);

  const groups = useMemo(() => (available ? recorte.groups.groups : []), [available, recorte.groups.groups]);
  const groupById = useMemo(() => new Map<string, EditorialGroupSummary>(groups.map(group => [group.id, group])), [groups]);
  const articleGroupById = available && atual ? atual.articles : SEM_ARTIGOS;
  const keywordGroupById = available && atual ? atual.keywords : SEM_KEYWORDS;
  /** Um recorte escolhido sem os artigos ainda não mostra nada (nunca "tudo" por engano). */
  const filterKey = !available || recorte.filter.kind === "all" ? "todos" : atual ? recorte.filterKey : "pendente";
  const recorteDaArea = recorte.filter;
  const filter = useMemo<EditorialGroupScreenFilter>(() => (filterKey === "todos" ? TODOS : filterKey === "pendente" ? NADA_AINDA : recorteDaArea), [filterKey, recorteDaArea]);

  const refresh = useCallback(async () => {
    const marca = brandRef.current;
    if (!marca) return;
    void refreshBrandEditorialGroups(marca);
    const resultado = await lerArtigos(marca, includeKeywords);
    if (brandRef.current !== marca || !resultado || resultado === "unavailable") return;
    setLoaded(resultado);
  }, [includeKeywords]);

  const previewTagging = useCallback(async (articleIds?: readonly string[]): Promise<ArticleGroupTagPreviewResponse> => {
    const marca = brandRef.current;
    if (!marca) return { ok: false, message: "Marca ativa ausente." };
    const { ok, body } = await lerJson("/api/editorial/groups/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marcaId: marca, mode: "preview", ...(articleIds ? { articleIds } : {}) }) });
    if (!ok || !Array.isArray(body.entries)) return { ok: false, message: mensagem(body, "Não foi possível montar a prévia.") };
    return { ok: true, entries: body.entries as ArticleGroupPreviewEntry[], willTagCount: typeof body.willTagCount === "number" ? body.willTagCount : 0 };
  }, []);

  const applyTagging = useCallback(async (articleIds: readonly string[]): Promise<ArticleGroupTagApplyResponse> => {
    const marca = brandRef.current;
    if (!marca) return { ok: false, message: "Marca ativa ausente." };
    const { ok, body } = await lerJson("/api/editorial/groups/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marcaId: marca, mode: "apply", articleIds }) });
    if (!ok) return { ok: false, message: mensagem(body, "Não foi possível gravar o grupo dos artigos.") };
    await refresh();
    const contar = (value: unknown) => (Array.isArray(value) ? value.length : 0);
    return { ok: true, tagged: contar(body.tagged), notConfirmed: contar(body.notConfirmed), skipped: contar(body.skipped) };
  }, [refresh]);

  const moveArticles = useCallback(async (articleIds: readonly string[], groupId: string | null): Promise<ArticleGroupMoveResponse> => {
    const marca = brandRef.current;
    if (!marca) return { ok: false, message: "Marca ativa ausente." };
    const { ok, body } = await lerJson("/api/editorial/groups/articles", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ marcaId: marca, articleIds, groupId }) });
    if (!ok) return { ok: false, message: mensagem(body, "Não foi possível mover os artigos de grupo.") };
    await refresh();
    const lista = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
    return {
      ok: true,
      moved: lista(body.moved),
      returnedToKeywords: lista(body.returnedToKeywords),
      unchanged: lista(body.unchanged),
      refused: Array.isArray(body.refused) ? (body.refused as Array<{ articleId: string; message: string }>) : [],
      notConfirmed: lista(body.notConfirmed),
    };
  }, [refresh]);

  /**
   * Rodapé · "Mover para <cor>" (garante o grupo da cor no servidor antes) ou
   * "Voltar ao grupo das keywords" (`null`). Devolve também o rótulo do destino.
   */
  const moveArticlesToColor = useCallback(async (articleIds: readonly string[], color: EditorialGroupColor | null): Promise<{ result: ArticleGroupMoveResponse; destino: string | null }> => {
    const marca = brandRef.current;
    if (!marca) return { result: { ok: false, message: "Marca ativa ausente." }, destino: null };
    if (!color) return { result: await moveArticles(articleIds, null), destino: null };
    const garantido = await ensureEditorialColorGroup(marca, color);
    if (!garantido.ok) return { result: { ok: false, message: garantido.message }, destino: null };
    const rotulo = EDITORIAL_GROUP_COLOR_LABELS[color];
    const destino = garantido.group.name === rotulo ? rotulo : `${rotulo} (${garantido.group.name})`;
    return { result: await moveArticles(articleIds, garantido.group.id), destino };
  }, [moveArticles]);

  /** Artigos com grupo herdado ainda sem etiqueta gravada (o atalho do menu mostra o número). */
  const untaggedInheritedCount = useMemo(() => [...articleGroupById.values()].filter(item => !item.persisted && item.groupId).length, [articleGroupById]);

  return {
    available,
    /** O grupo efetivo dos artigos já chegou (a leitura pesada terminou). */
    articlesReady: Boolean(atual),
    groups,
    groupById,
    ungroupedKeywordCount: available ? recorte.groups.ungroupedKeywordCount ?? 0 : 0,
    choice: recorte.choice,
    setChoice: recorte.setChoice,
    filter,
    filterKey,
    refresh,
    articleGroupById,
    keywordGroupById,
    untaggedInheritedCount,
    previewTagging,
    applyTagging,
    moveArticles,
    moveArticlesToColor,
  };
}

export type EditorialGroupsApi = ReturnType<typeof useEditorialGroups>;
