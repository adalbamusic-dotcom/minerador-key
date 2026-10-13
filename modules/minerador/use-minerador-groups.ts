"use client";

import { useCallback, useMemo } from "react";
import {
  ensureEditorialColorGroup,
  markBrandEditorialGroupsUnavailable,
  refreshBrandEditorialGroups,
  useAreaGroupFilter,
} from "@/components/editorial/editorial-group-area-store";
import {
  EDITORIAL_GROUP_CHOICE_ALL,
  EDITORIAL_GROUP_COLOR_LABELS,
  EDITORIAL_GROUP_URL_NONE,
  editorialGroupChoiceKeeps,
  type EditorialGroupColor,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";

/**
 * GRUPOS NO MINERADOR — leitura, recorte ativo e ações da tela.
 *
 * 2026-10-12 · cores fixas (adendo do §9.1): a escolha é desta ÁREA e vem do
 * estado leve compartilhado com a topbar (`editorial-group-area-store`); a
 * etiqueta mora na topbar global. Para NÃO atrasar a planilha:
 *
 *   · "Todos os grupos" e "Sem grupo" carregam as keywords na hora, sem esperar
 *     a lista de grupos (`ready` já é verdadeiro);
 *   · uma cor resolve os grupos pelo cache local na hora; só espera a lista
 *     quando não há cache nenhum;
 *   · cor sem grupo ainda = planilha vazia com "Nenhuma keyword na cor X ainda",
 *     sem consulta;
 *   · o cache errado (grupo sumiu ou foi arquivado) se corrige sozinho: a lista
 *     do servidor muda a chave do recorte (`filterKey`) e a planilha relê uma vez.
 *
 * Filtrar NUNCA escreve. Mover para uma cor garante o grupo dela no servidor
 * (`ensureColorGroup`) e então etiqueta pela rota
 * `POST /api/minerador/marcas/[brandId]/keywords/group`; a tela só muda a linha
 * depois da resposta relida pelo servidor.
 */

export type GroupsStatus = "idle" | "loading" | "available" | "unavailable";

export type KeywordGroupAssignResponse =
  | { ok: true; moved: string[]; unchanged: string[]; refused: Array<{ id: string; code: string; message: string }>; notConfirmed: string[]; groupId: string | null }
  | { ok: false; code: string; message: string };

export function useMineradorGroups({ brandId, enabled }: { brandId: string | null; enabled: boolean }) {
  const alvo = enabled && brandId ? brandId : null;
  const recorte = useAreaGroupFilter(alvo, "minerador");
  const status: GroupsStatus = !alvo ? "idle" : recorte.groups.status === "unavailable" ? "unavailable" : recorte.groups.status === "ready" ? "available" : "loading";
  const available = Boolean(alvo) && recorte.available;
  const groups = recorte.groups.groups;

  const refresh = useCallback(async () => {
    if (alvo) await refreshBrandEditorialGroups(alvo);
  }, [alvo]);

  /** A listagem descobriu que a coluna não existe: esconde o recurso e volta a ler tudo. */
  const markUnavailable = useCallback(() => {
    if (alvo) markBrandEditorialGroupsUnavailable(alvo);
  }, [alvo]);

  /** Garante (no servidor) o grupo da cor — só ao mover/etiquetar. */
  const ensureColorGroup = useCallback(async (color: EditorialGroupColor) => {
    if (!alvo) return { ok: false as const, code: "BRAND_REQUIRED", message: "Marca ativa ausente." };
    return ensureEditorialColorGroup(alvo, color);
  }, [alvo]);

  const assignKeywords = useCallback(async (keywordIds: readonly string[], groupId: string | null): Promise<KeywordGroupAssignResponse> => {
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
    void refreshBrandEditorialGroups(alvo);
    return {
      ok: true,
      moved: Array.isArray(body.moved) ? body.moved : [],
      unchanged: Array.isArray(body.unchanged) ? body.unchanged : [],
      refused: Array.isArray(body.refused) ? body.refused : [],
      notConfirmed: Array.isArray(body.notConfirmed) ? body.notConfirmed : [],
      groupId: typeof body.groupId === "string" ? body.groupId : null,
    };
  }, [alvo]);

  const activeGroups = useMemo(() => groups.filter(group => group.status === "active"), [groups]);
  const groupById = useMemo(() => new Map<string, EditorialGroupSummary>(groups.map(group => [group.id, group])), [groups]);
  const choice = recorte.choice;
  /** Depois de mover para a cor (null = tirar do grupo), a keyword continua nesta visão? */
  const keepsInView = useCallback((targetColor: EditorialGroupColor | null) => editorialGroupChoiceKeeps(choice, targetColor), [choice]);

  /** O texto do estado vazio do recorte (nulo = "Todos os grupos"). */
  const emptyLabel = choice === EDITORIAL_GROUP_CHOICE_ALL ? null
    : recorte.readFailed ? "Não foi possível ler os grupos agora"
    : choice === EDITORIAL_GROUP_URL_NONE ? "Nenhuma keyword sem grupo"
    : `Nenhuma keyword na cor ${EDITORIAL_GROUP_COLOR_LABELS[choice]} ainda`;

  return {
    status,
    available,
    /** A planilha pode carregar: o recorte desta área já sabe o que ler (nunca espera a lista para "todos"/"sem-grupo"). */
    ready: !alvo || !recorte.pending,
    groups,
    activeGroups,
    groupById,
    ungroupedCount: recorte.groups.ungroupedKeywordCount ?? 0,
    choice,
    filter: recorte.filter,
    filterKey: recorte.filterKey,
    readFailed: recorte.readFailed,
    emptyLabel,
    keepsInView,
    setChoice: recorte.setChoice,
    refresh,
    markUnavailable,
    ensureColorGroup,
    assignKeywords,
  };
}
