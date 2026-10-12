"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EDITORIAL_GROUP_URL_PARAM,
  editorialGroupLastUsedStorageKey,
  resolveEditorialGroupFilter,
  sameEditorialGroupFilter,
  serializeEditorialGroupFilter,
  type EditorialGroupColor,
  type EditorialGroupFilter,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";
import type { ArticleGroupOrigin } from "@/lib/editorial/article-groups";
import type { ArticleGroupPreviewEntry } from "@/lib/editorial/article-group-core";

/**
 * GRUPOS NO ARQUITETO E NO RADAR (F2) — o mesmo comportamento do Minerador.
 *
 * - Grupos: `GET /api/editorial/groups`; grupo EFETIVO de cada artigo (e, no
 *   Arquiteto, de cada keyword com grupo): `GET /api/editorial/groups/articles`.
 *   `409 GROUPS_NOT_AVAILABLE` (M1 não aplicada) ou qualquer falha = recurso
 *   escondido; a planilha continua como antes.
 * - Grupo ativo (D12): a URL (`?grupo=`) é a fonte; o último usado na marca
 *   fica no `localStorage` (a MESMA chave do Minerador, para as três planilhas
 *   abrirem no mesmo grupo) só como conveniência, com try/catch. Nada é limpo.
 * - O filtro é de TELA: a mesa continua lida inteira e a lista de origem
 *   nunca é trocada pelo recorte (SDD §8: leitura parcial nunca substitui a
 *   lista inteira).
 * - Etiquetar e mover: `POST`/`PATCH /api/editorial/groups/articles` — o mesmo
 *   núcleo da formação e da importação. A tela só muda depois da releitura.
 *
 * Tudo é "desta marca": resposta de outra marca (troca no meio da leitura) é
 * descartada.
 */

const TODOS: EditorialGroupFilter = { kind: "all" };

export type EditorialArticleGroup = { groupId: string | null; origin: ArticleGroupOrigin | null; persisted: boolean; conflict: boolean };

type Loaded = {
  brandId: string;
  available: boolean;
  groups: EditorialGroupSummary[];
  ungroupedKeywordCount: number;
  articles: Map<string, EditorialArticleGroup>;
  keywords: Map<string, string>;
};

const vazio = (brandId: string): Loaded => ({ brandId, available: false, groups: [], ungroupedKeywordCount: 0, articles: new Map(), keywords: new Map() });

function lerUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(window.location.href).searchParams.get(EDITORIAL_GROUP_URL_PARAM);
  } catch {
    return null;
  }
}

function gravarUrl(filter: EditorialGroupFilter) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const valor = serializeEditorialGroupFilter(filter);
    if (valor) url.searchParams.set(EDITORIAL_GROUP_URL_PARAM, valor);
    else url.searchParams.delete(EDITORIAL_GROUP_URL_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* A URL é conveniência de compartilhamento; o estado da tela continua valendo. */
  }
}

function lerLembranca(brandId: string): string | null {
  try {
    return window.localStorage.getItem(editorialGroupLastUsedStorageKey(brandId));
  } catch {
    return null;
  }
}

function gravarLembranca(brandId: string, filter: EditorialGroupFilter) {
  try {
    window.localStorage.setItem(editorialGroupLastUsedStorageKey(brandId), serializeEditorialGroupFilter(filter) ?? "todos");
  } catch {
    /* Sem armazenamento local: só não lembra. */
  }
}

async function lerJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init }).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) : {};
  return { ok: Boolean(response && response.ok && body?.success === true), body: body as Record<string, unknown> };
}

async function lerTudo(brandId: string, includeKeywords: boolean): Promise<Loaded> {
  const marca = encodeURIComponent(brandId);
  const [grupos, artigos] = await Promise.all([
    lerJson(`/api/editorial/groups?marcaId=${marca}`),
    lerJson(`/api/editorial/groups/articles?marcaId=${marca}${includeKeywords ? "&include=keywords" : ""}`),
  ]);
  if (!grupos.ok || !artigos.ok || !Array.isArray(grupos.body.groups) || !Array.isArray(artigos.body.articles)) return vazio(brandId);
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
  return {
    brandId,
    available: true,
    groups: grupos.body.groups as EditorialGroupSummary[],
    ungroupedKeywordCount: typeof grupos.body.ungroupedKeywordCount === "number" ? grupos.body.ungroupedKeywordCount : 0,
    articles,
    keywords,
  };
}

export type ArticleGroupTagPreviewResponse = { ok: true; entries: ArticleGroupPreviewEntry[]; willTagCount: number } | { ok: false; message: string };
export type ArticleGroupTagApplyResponse = { ok: true; tagged: number; notConfirmed: number; skipped: number } | { ok: false; message: string };
export type ArticleGroupMoveResponse =
  | { ok: true; moved: string[]; returnedToKeywords: string[]; unchanged: string[]; refused: Array<{ articleId: string; message: string }>; notConfirmed: string[] }
  | { ok: false; message: string };

const mensagem = (body: Record<string, unknown>, padrao: string) => typeof body.message === "string" ? body.message : padrao;

export function useEditorialGroups({ brandId, enabled, includeKeywords = false }: { brandId: string | null; enabled: boolean; includeKeywords?: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [chosen, setChosen] = useState<{ brandId: string; filter: EditorialGroupFilter } | null>(null);
  const brandRef = useRef<string | null>(brandId);
  useEffect(() => {
    brandRef.current = brandId;
  }, [brandId]);

  useEffect(() => {
    if (!enabled || !brandId) return;
    let vigente = true;
    void lerTudo(brandId, includeKeywords).then(resultado => {
      if (!vigente) return;
      setLoaded(resultado);
      const inicial = resultado.available
        ? resolveEditorialGroupFilter({ fromUrl: lerUrl(), remembered: lerLembranca(brandId), groups: resultado.groups }).filter
        : TODOS;
      setChosen({ brandId, filter: inicial });
      if (resultado.available) gravarUrl(inicial);
    });
    return () => { vigente = false; };
  }, [brandId, enabled, includeKeywords]);

  const atual = loaded && loaded.brandId === brandId ? loaded : null;
  const available = Boolean(enabled && brandId && atual?.available);
  const filter = available && chosen && chosen.brandId === brandId ? chosen.filter : TODOS;
  const groups = useMemo(() => (available && atual ? atual.groups : []), [available, atual]);
  const groupById = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  const articleGroupById = useMemo(() => (available && atual ? atual.articles : new Map<string, EditorialArticleGroup>()), [available, atual]);
  const keywordGroupById = useMemo(() => (available && atual ? atual.keywords : new Map<string, string>()), [available, atual]);

  const refresh = useCallback(async () => {
    const alvo = brandRef.current;
    if (!alvo) return;
    const resultado = await lerTudo(alvo, includeKeywords);
    if (brandRef.current !== alvo || !resultado.available) return;
    setLoaded(resultado);
  }, [includeKeywords]);

  const setFilter = useCallback((next: EditorialGroupFilter) => {
    const alvo = brandRef.current;
    if (!alvo) return;
    setChosen(current => (current && current.brandId === alvo && sameEditorialGroupFilter(current.filter, next) ? current : { brandId: alvo, filter: next }));
    gravarUrl(next);
    gravarLembranca(alvo, next);
  }, []);

  const createGroup = useCallback(async (name: string, color: EditorialGroupColor): Promise<{ ok: true; group: EditorialGroupSummary } | { ok: false; message: string }> => {
    const alvo = brandRef.current;
    if (!alvo) return { ok: false, message: "Marca ativa ausente." };
    const { ok, body } = await lerJson("/api/editorial/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marcaId: alvo, name, color }) });
    if (!ok || !body.group) return { ok: false, message: mensagem(body, "Não foi possível criar o grupo.") };
    await refresh();
    return { ok: true, group: body.group as EditorialGroupSummary };
  }, [refresh]);

  const previewTagging = useCallback(async (articleIds?: readonly string[]): Promise<ArticleGroupTagPreviewResponse> => {
    const alvo = brandRef.current;
    if (!alvo) return { ok: false, message: "Marca ativa ausente." };
    const { ok, body } = await lerJson("/api/editorial/groups/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marcaId: alvo, mode: "preview", ...(articleIds ? { articleIds } : {}) }) });
    if (!ok || !Array.isArray(body.entries)) return { ok: false, message: mensagem(body, "Não foi possível montar a prévia.") };
    return { ok: true, entries: body.entries as ArticleGroupPreviewEntry[], willTagCount: typeof body.willTagCount === "number" ? body.willTagCount : 0 };
  }, []);

  const applyTagging = useCallback(async (articleIds: readonly string[]): Promise<ArticleGroupTagApplyResponse> => {
    const alvo = brandRef.current;
    if (!alvo) return { ok: false, message: "Marca ativa ausente." };
    const { ok, body } = await lerJson("/api/editorial/groups/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ marcaId: alvo, mode: "apply", articleIds }) });
    if (!ok) return { ok: false, message: mensagem(body, "Não foi possível gravar o grupo dos artigos.") };
    await refresh();
    const contar = (value: unknown) => (Array.isArray(value) ? value.length : 0);
    return { ok: true, tagged: contar(body.tagged), notConfirmed: contar(body.notConfirmed), skipped: contar(body.skipped) };
  }, [refresh]);

  const moveArticles = useCallback(async (articleIds: readonly string[], groupId: string | null): Promise<ArticleGroupMoveResponse> => {
    const alvo = brandRef.current;
    if (!alvo) return { ok: false, message: "Marca ativa ausente." };
    const { ok, body } = await lerJson("/api/editorial/groups/articles", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ marcaId: alvo, articleIds, groupId }) });
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

  /** Artigos com grupo herdado ainda sem etiqueta gravada (o atalho do menu mostra o número). */
  const untaggedInheritedCount = useMemo(() => [...articleGroupById.values()].filter(item => !item.persisted && item.groupId).length, [articleGroupById]);

  return {
    available,
    groups,
    groupById,
    ungroupedKeywordCount: available && atual ? atual.ungroupedKeywordCount : 0,
    filter,
    filterKey: available ? serializeEditorialGroupFilter(filter) ?? "todos" : "todos",
    setFilter,
    refresh,
    createGroup,
    articleGroupById,
    keywordGroupById,
    untaggedInheritedCount,
    previewTagging,
    applyTagging,
    moveArticles,
  };
}

export type EditorialGroupsApi = ReturnType<typeof useEditorialGroups>;
