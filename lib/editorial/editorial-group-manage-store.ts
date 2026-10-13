import type { SupabaseClient } from "@supabase/supabase-js";
import { isEditorialGroupsSchemaMissing, type EditorialGroupSummary } from "./editorial-groups.ts";
import {
  EditorialGroupsPersistenceError,
  groupsUnavailable,
  listEditorialGroupSummaries,
  readEditorialGroupPlan,
  updateEditorialGroup,
  type GroupsUnavailable,
} from "./editorial-groups-store.ts";
import {
  planEditorialGroupManage,
  type EditorialGroupManageRefusal,
  type EditorialGroupManageRequest,
  type EditorialGroupOccupancy,
} from "./editorial-group-manage.ts";

/**
 * ===== GERENCIAR A COR — REPOSITÓRIO (2026-10-12) =====
 *
 * Cliente INJETADO (rota: operacional, depois da autorização; testes:
 * fixture). Lê o grupo, o que ele ainda carrega e os outros grupos ativos da
 * marca, decide pelo domínio puro (`planEditorialGroupManage`) e grava pelo
 * `updateEditorialGroup` de sempre — trava otimista (`lock_version`), releitura
 * e evento em `editorial_group_events` (`renamed`, `recolored`, `archived`).
 * Nada é apagado; nenhum hash, aprovação ou versão muda.
 */

type Client = Pick<SupabaseClient, "from">;

/** O que o grupo ainda carrega: keywords vivas e na lixeira, artigos etiquetados, plano e Silo. */
export async function readEditorialGroupOccupancy(client: Client, brandId: string, group: Pick<EditorialGroupSummary, "id" | "keywordCount" | "articleCount">): Promise<{ ok: true; occupancy: EditorialGroupOccupancy } | GroupsUnavailable> {
  const plano = await readEditorialGroupPlan(client, brandId, group.id);
  if (!plano.ok) return plano;
  const lixeira = await client
    .from("minerador_keywords")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("group_id", group.id)
    .not("deleted_at", "is", null);
  if (lixeira.error) {
    if (isEditorialGroupsSchemaMissing(lixeira.error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(lixeira.error, "contar as keywords na lixeira dos");
  }
  return {
    ok: true,
    occupancy: {
      keywordCount: group.keywordCount,
      trashedKeywordCount: typeof lixeira.count === "number" ? lixeira.count : 0,
      articleCount: group.articleCount,
      hasPlan: Boolean(plano.group?.plan),
      planVersion: plano.group?.planVersion ?? 0,
      siloId: plano.group?.siloId ?? null,
    },
  };
}

export type ManageEditorialGroupResult =
  | { ok: true; action: "edit" | "release"; group: EditorialGroupSummary; summary: string[]; eventRecorded: boolean }
  | EditorialGroupManageRefusal
  | GroupsUnavailable;

/**
 * "Gerenciar" uma cor: nome (opcional), trocar para uma cor LIVRE ou liberar
 * a cor (arquivar, só sem itens). Sucesso só depois da releitura feita pelo
 * `updateEditorialGroup`.
 */
export async function manageEditorialGroup(client: Client, input: {
  brandId: string;
  actorUserId: string;
  groupId: string;
  lockVersion: number;
} & EditorialGroupManageRequest): Promise<ManageEditorialGroupResult> {
  const listing = await listEditorialGroupSummaries(client, input.brandId);
  if (!listing.ok) return listing;
  const atual = listing.groups.find(group => group.id === input.groupId);
  if (!atual) return { ok: false, code: "GROUP_NOT_FOUND", message: "Grupo não encontrado nesta marca." };
  if (atual.lockVersion !== input.lockVersion) return { ok: false, code: "GROUP_STALE", message: "O grupo foi alterado em outra sessão. Recarregue e tente de novo." };
  let occupancy: EditorialGroupOccupancy | null = null;
  if (input.release) {
    const lido = await readEditorialGroupOccupancy(client, input.brandId, atual);
    if (!lido.ok) return lido;
    occupancy = lido.occupancy;
  }
  const plano = planEditorialGroupManage({
    group: atual,
    request: { name: input.name, color: input.color, release: input.release },
    activeGroups: listing.groups.filter(group => group.status === "active"),
    occupancy,
  });
  if (!plano.ok) return plano;
  const gravado = await updateEditorialGroup(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    groupId: atual.id,
    lockVersion: atual.lockVersion,
    ...(plano.change.name !== undefined ? { name: plano.change.name } : {}),
    ...(plano.change.color !== undefined ? { color: plano.change.color } : {}),
    ...(plano.change.status !== undefined ? { status: plano.change.status } : {}),
  });
  if (!gravado.ok) {
    if (gravado.code === "GROUPS_NOT_AVAILABLE") return gravado;
    // As recusas do repositório de sempre têm o mesmo código e texto.
    return { ok: false, code: gravado.code === "GROUP_NOTHING_TO_CHANGE" ? "GROUP_NOTHING_TO_CHANGE" : gravado.code === "GROUP_COLOR_INVALID" ? "GROUP_COLOR_INVALID" : gravado.code === "GROUP_NAME_INVALID" ? "GROUP_NAME_INVALID" : gravado.code === "GROUP_NAME_TAKEN" ? "GROUP_NAME_TAKEN" : gravado.code === "GROUP_NOT_FOUND" ? "GROUP_NOT_FOUND" : "GROUP_STALE", message: gravado.message };
  }
  return { ok: true, action: plano.action, group: gravado.group, summary: plano.summary, eventRecorded: gravado.eventRecorded };
}
