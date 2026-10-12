import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EDITORIAL_GROUP_REFUSAL_MESSAGES,
  GROUPS_NOT_AVAILABLE,
  isEditorialGroupsSchemaMissing,
  parseEditorialGroupSummaryRow,
  planEditorialGroupUpdate,
  validateNewEditorialGroup,
  type EditorialGroupColor,
  type EditorialGroupRefusal,
  type EditorialGroupStatus,
  type EditorialGroupSummary,
} from "./editorial-groups.ts";

/**
 * ===== GRUPOS EDITORIAIS — REPOSITÓRIO (F1) =====
 *
 * Funções com o cliente INJETADO, para a rota (cliente operacional, depois da
 * autorização) e para os testes (fixture). Toda leitura e escrita filtra por
 * `marca_id`: o grupo de uma marca nunca aparece nem muda pela outra (o banco
 * repete a regra com a FK composta e a RLS por `can_access_brand`).
 *
 * Sem a M1 aplicada, toda função devolve `{ ok: false, code:
 * "GROUPS_NOT_AVAILABLE" }` em vez de lançar: a rota responde 409 e a tela
 * esconde o recurso.
 */

type Client = Pick<SupabaseClient, "from">;
type DbError = { code?: string; message?: string } | null;

export type GroupsUnavailable = { ok: false; code: typeof GROUPS_NOT_AVAILABLE; message: string };
export const groupsUnavailable = (): GroupsUnavailable => ({
  ok: false,
  code: GROUPS_NOT_AVAILABLE,
  message: "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada).",
});

export class EditorialGroupsPersistenceError extends Error {
  readonly code: string;
  constructor(error: DbError, operation: string) {
    super(`Falha ao ${operation} grupos editoriais.`);
    this.name = "EditorialGroupsPersistenceError";
    this.code = typeof error?.code === "string" ? error.code : "database_error";
  }
}

const SUMMARY_COLUMNS = "id,marca_id,name,color,origin,status,silo_id,plan_version,lock_version,updated_at,keyword_count,article_count";

export type EditorialGroupsListing = {
  ok: true;
  groups: EditorialGroupSummary[];
  ungroupedKeywordCount: number;
};

/** Grupos da marca com contagens, ativos primeiro e por nome; e o "Sem grupo". */
export async function listEditorialGroupSummaries(client: Client, brandId: string): Promise<EditorialGroupsListing | GroupsUnavailable> {
  const { data, error } = await client.from("editorial_group_summary").select(SUMMARY_COLUMNS).eq("marca_id", brandId);
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "listar");
  }
  const groups = ((data || []) as unknown[])
    .map(parseEditorialGroupSummaryRow)
    .filter((group): group is EditorialGroupSummary => Boolean(group) && (group as EditorialGroupSummary).marcaId === brandId)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || a.name.localeCompare(b.name, "pt-BR"));
  const semGrupo = await client
    .from("minerador_keywords")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .is("group_id", null);
  if (semGrupo.error) {
    if (isEditorialGroupsSchemaMissing(semGrupo.error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(semGrupo.error, "contar as keywords sem");
  }
  return { ok: true, groups, ungroupedKeywordCount: typeof semGrupo.count === "number" ? semGrupo.count : 0 };
}

/** Um grupo da marca (com as contagens), ou null se não existe NESTA marca. */
export async function readEditorialGroup(client: Client, brandId: string, groupId: string): Promise<{ ok: true; group: EditorialGroupSummary | null } | GroupsUnavailable> {
  const { data, error } = await client.from("editorial_group_summary").select(SUMMARY_COLUMNS).eq("marca_id", brandId).eq("id", groupId).maybeSingle();
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "ler");
  }
  const group = parseEditorialGroupSummaryRow(data);
  return { ok: true, group: group && group.marcaId === brandId && group.id === groupId ? group : null };
}

export type EditorialGroupEventInput = {
  groupId: string;
  eventType: "created" | "renamed" | "recolored" | "keywords_assigned" | "keywords_unassigned" | "archived" | "reactivated";
  payload: Record<string, unknown>;
};

/** Histórico append-only. Devolve se gravou; a falha não desfaz a operação que já foi confirmada. */
export async function appendEditorialGroupEvents(client: Client, input: { brandId: string; actorUserId: string; events: readonly EditorialGroupEventInput[] }): Promise<boolean> {
  if (!input.events.length) return true;
  const { error } = await client.from("editorial_group_events").insert(input.events.map(event => ({
    marca_id: input.brandId,
    group_id: event.groupId,
    event_type: event.eventType,
    payload: event.payload,
    actor_id: input.actorUserId,
  })));
  return !error;
}

/** Cria um grupo manual (F1). O de plano declarado (`declared_plan`) é da F4. */
export async function createEditorialGroup(client: Client, input: {
  brandId: string;
  actorUserId: string;
  name: unknown;
  color: unknown;
}): Promise<{ ok: true; group: EditorialGroupSummary; eventRecorded: boolean } | EditorialGroupRefusal | GroupsUnavailable> {
  const listing = await listEditorialGroupSummaries(client, input.brandId);
  if (!listing.ok) return listing;
  const validado = validateNewEditorialGroup(input, listing.groups.filter(group => group.status === "active"));
  if (!validado.ok) return validado;
  const { data, error } = await client.from("editorial_groups").insert({
    marca_id: input.brandId,
    name: validado.name,
    color: validado.color,
    origin: "manual",
    created_by: input.actorUserId,
    updated_by: input.actorUserId,
  }).select("id").single();
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    // A corrida entre duas abas com o mesmo nome cai no índice único.
    if (error.code === "23505") return { ok: false, code: "GROUP_NAME_TAKEN", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NAME_TAKEN };
    throw new EditorialGroupsPersistenceError(error, "criar");
  }
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new EditorialGroupsPersistenceError(null, "confirmar a criação de");
  // Sucesso só depois da releitura.
  const releitura = await readEditorialGroup(client, input.brandId, id);
  if (!releitura.ok) return releitura;
  if (!releitura.group || releitura.group.name !== validado.name || releitura.group.color !== validado.color) {
    throw new EditorialGroupsPersistenceError(null, "reler o grupo criado entre os");
  }
  const eventRecorded = await appendEditorialGroupEvents(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    events: [{ groupId: id, eventType: "created", payload: { name: validado.name, color: validado.color, origin: "manual" } }],
  });
  return { ok: true, group: releitura.group, eventRecorded };
}

/** Renomear, recolorir, arquivar ou reativar, com trava otimista (`lock_version`). */
export async function updateEditorialGroup(client: Client, input: {
  brandId: string;
  actorUserId: string;
  groupId: string;
  lockVersion: number;
  name?: unknown;
  color?: unknown;
  status?: unknown;
}): Promise<{ ok: true; group: EditorialGroupSummary; eventRecorded: boolean } | EditorialGroupRefusal | GroupsUnavailable> {
  const listing = await listEditorialGroupSummaries(client, input.brandId);
  if (!listing.ok) return listing;
  const atual = listing.groups.find(group => group.id === input.groupId);
  if (!atual) return { ok: false, code: "GROUP_NOT_FOUND", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NOT_FOUND };
  if (atual.lockVersion !== input.lockVersion) return { ok: false, code: "GROUP_STALE", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_STALE };
  const plano = planEditorialGroupUpdate(
    { name: atual.name, color: atual.color, status: atual.status },
    { name: input.name, color: input.color, status: input.status },
    listing.groups.filter(group => group.status === "active"),
    atual.id,
  );
  if (!plano.ok) return plano;
  const { data, error } = await client.from("editorial_groups").update({
    ...plano.patch,
    lock_version: atual.lockVersion + 1,
    updated_by: input.actorUserId,
    updated_at: new Date().toISOString(),
  }).eq("marca_id", input.brandId).eq("id", atual.id).eq("lock_version", atual.lockVersion).select("id");
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    if (error.code === "23505") return { ok: false, code: "GROUP_NAME_TAKEN", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NAME_TAKEN };
    throw new EditorialGroupsPersistenceError(error, "atualizar");
  }
  if (!Array.isArray(data) || data.length !== 1) return { ok: false, code: "GROUP_STALE", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_STALE };
  const releitura = await readEditorialGroup(client, input.brandId, atual.id);
  if (!releitura.ok) return releitura;
  const esperado = { name: plano.patch.name ?? atual.name, color: (plano.patch.color ?? atual.color) as EditorialGroupColor, status: (plano.patch.status ?? atual.status) as EditorialGroupStatus };
  if (!releitura.group || releitura.group.name !== esperado.name || releitura.group.color !== esperado.color || releitura.group.status !== esperado.status) {
    throw new EditorialGroupsPersistenceError(null, "reler o grupo alterado entre os");
  }
  const eventRecorded = await appendEditorialGroupEvents(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    events: plano.events.map(event => ({ groupId: atual.id, eventType: event.eventType, payload: event.payload })),
  });
  return { ok: true, group: releitura.group, eventRecorded };
}
