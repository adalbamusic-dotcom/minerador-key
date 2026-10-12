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

/**
 * GRUPOS NO MINERADOR (F1) — leitura, filtro ativo e ações da tela.
 *
 * - Disponibilidade: `GET /api/editorial/groups`. `409 GROUPS_NOT_AVAILABLE`
 *   (M1 não aplicada) ou qualquer falha = recurso escondido; o Minerador lê
 *   como antes. `ready` fica verdadeiro nos dois casos, para a planilha
 *   esperar UMA decisão e não carregar duas vezes.
 * - Grupo ativo (D12): a URL (`?grupo=`) é a fonte; o último usado na marca
 *   fica no `localStorage` só como conveniência (try/catch, nunca limpo daqui).
 * - Etiquetar: `POST /api/minerador/marcas/[brandId]/keywords/group`; a tela
 *   só muda a linha depois da resposta relida pelo servidor.
 *
 * O estado é sempre "desta marca": cada registro guarda o `brandId` a que
 * pertence, e o que é de outra marca é ignorado (nunca vaza na troca de
 * marca, nem por resposta atrasada).
 */

const ALL_GROUPS_FILTER: EditorialGroupFilter = { kind: "all" };

export type GroupsStatus = "idle" | "loading" | "available" | "unavailable";

export type KeywordGroupAssignResponse =
  | { ok: true; moved: string[]; unchanged: string[]; refused: Array<{ id: string; code: string; message: string }>; notConfirmed: string[]; groupId: string | null }
  | { ok: false; code: string; message: string };

type Loaded = {
  brandId: string;
  available: boolean;
  groups: EditorialGroupSummary[];
  ungroupedCount: number;
};

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
    /* URL é conveniência de compartilhamento; o estado da tela continua valendo. */
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
    /* Sem armazenamento local (aba privada, bloqueio): só não lembra. */
  }
}

async function lerGrupos(brandId: string): Promise<Omit<Loaded, "brandId">> {
  const response = await fetch(`/api/editorial/groups?marcaId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) : {};
  if (!response || !response.ok || body?.success !== true || !Array.isArray(body.groups)) {
    return { available: false, groups: [], ungroupedCount: 0 };
  }
  return {
    available: true,
    groups: body.groups as EditorialGroupSummary[],
    ungroupedCount: typeof body.ungroupedKeywordCount === "number" ? body.ungroupedKeywordCount : 0,
  };
}

export function useMineradorGroups({ brandId, enabled }: { brandId: string | null; enabled: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [chosen, setChosen] = useState<{ brandId: string; filter: EditorialGroupFilter } | null>(null);
  const brandRef = useRef<string | null>(brandId);
  useEffect(() => {
    brandRef.current = brandId;
  }, [brandId]);

  useEffect(() => {
    if (!enabled || !brandId) return;
    let vigente = true;
    void lerGrupos(brandId).then(resultado => {
      if (!vigente) return;
      setLoaded({ brandId, ...resultado });
      const inicial = resultado.available
        ? resolveEditorialGroupFilter({ fromUrl: lerUrl(), remembered: lerLembranca(brandId), groups: resultado.groups }).filter
        : ALL_GROUPS_FILTER;
      setChosen({ brandId, filter: inicial });
      if (resultado.available) gravarUrl(inicial);
    });
    return () => { vigente = false; };
  }, [brandId, enabled]);

  const atual = loaded && loaded.brandId === brandId ? loaded : null;
  const status: GroupsStatus = !enabled || !brandId ? "idle" : !atual ? "loading" : atual.available ? "available" : "unavailable";
  const available = status === "available";
  const filter = available && chosen && chosen.brandId === brandId ? chosen.filter : ALL_GROUPS_FILTER;
  const groups = useMemo(() => (atual?.available ? atual.groups : []), [atual]);

  const refresh = useCallback(async () => {
    const alvo = brandRef.current;
    if (!alvo) return;
    const resultado = await lerGrupos(alvo);
    if (brandRef.current !== alvo || !resultado.available) return;
    setLoaded({ brandId: alvo, ...resultado });
  }, []);

  const setFilter = useCallback((next: EditorialGroupFilter) => {
    const alvo = brandRef.current;
    if (!alvo) return;
    setChosen(current => (current && current.brandId === alvo && sameEditorialGroupFilter(current.filter, next) ? current : { brandId: alvo, filter: next }));
    gravarUrl(next);
    gravarLembranca(alvo, next);
  }, []);

  /** A listagem descobriu que a coluna não existe: esconde o recurso e volta a ler tudo. */
  const markUnavailable = useCallback(() => {
    const alvo = brandRef.current;
    if (!alvo) return;
    setLoaded({ brandId: alvo, available: false, groups: [], ungroupedCount: 0 });
  }, []);

  const createGroup = useCallback(async (name: string, color: EditorialGroupColor): Promise<{ ok: true; group: EditorialGroupSummary } | { ok: false; message: string }> => {
    const alvo = brandRef.current;
    if (!alvo) return { ok: false, message: "Marca ativa ausente." };
    const response = await fetch("/api/editorial/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marcaId: alvo, name, color }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok || body?.success !== true || !body.group) {
      return { ok: false, message: typeof body?.message === "string" ? body.message : "Não foi possível criar o grupo." };
    }
    await refresh();
    return { ok: true, group: body.group as EditorialGroupSummary };
  }, [refresh]);

  const assignKeywords = useCallback(async (keywordIds: readonly string[], groupId: string | null): Promise<KeywordGroupAssignResponse> => {
    const alvo = brandRef.current;
    if (!alvo) return { ok: false, code: "BRAND_REQUIRED", message: "Marca ativa ausente." };
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(alvo)}/keywords/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keywordIds, groupId }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok || body?.success !== true) {
      return { ok: false, code: typeof body?.code === "string" ? body.code : "KEYWORD_GROUP_FAILED", message: typeof body?.message === "string" ? body.message : "Não foi possível gravar o grupo das keywords." };
    }
    await refresh();
    return {
      ok: true,
      moved: Array.isArray(body.moved) ? body.moved : [],
      unchanged: Array.isArray(body.unchanged) ? body.unchanged : [],
      refused: Array.isArray(body.refused) ? body.refused : [],
      notConfirmed: Array.isArray(body.notConfirmed) ? body.notConfirmed : [],
      groupId: typeof body.groupId === "string" ? body.groupId : null,
    };
  }, [refresh]);

  const activeGroups = useMemo(() => groups.filter(group => group.status === "active"), [groups]);
  const groupById = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  /** A planilha pode carregar: a decisão sobre grupos desta marca já saiu. */
  const ready = status === "idle" || status === "available" || status === "unavailable";

  return {
    status,
    available,
    ready,
    groups,
    activeGroups,
    groupById,
    ungroupedCount: atual?.available ? atual.ungroupedCount : 0,
    filter,
    filterKey: available ? serializeEditorialGroupFilter(filter) ?? "todos" : "todos",
    setFilter,
    refresh,
    markUnavailable,
    createGroup,
    assignKeywords,
  };
}
