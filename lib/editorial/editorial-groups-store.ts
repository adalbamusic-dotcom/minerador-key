import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EDITORIAL_GROUP_REFUSAL_MESSAGES,
  GROUPS_NOT_AVAILABLE,
  editorialGroupNameForColor,
  isEditorialGroupColor,
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
  /* `article_assigned` (F2): etiqueta de artigo gravada, movida ou devolvida à herança. */
  eventType: "created" | "renamed" | "recolored" | "keywords_assigned" | "keywords_unassigned" | "article_assigned" | "archived" | "reactivated"
    /* F4 (plano declarado): o plano do Silo gravado no grupo e o vínculo com o Silo consolidado. */
    | "plan_declared" | "plan_changed" | "silo_linked";
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

/* ========================================================================== */
/* 2026-10-12 · CORES FIXAS — cada cor da paleta É o grupo (adendo do §9.1)    */
/* ========================================================================== */

export type EnsureColorGroupOutcome = "existing" | "reactivated" | "created";

type ColorGroupRow = { id: string; status: EditorialGroupStatus; createdAt: string };

/** Os grupos desta marca com a cor, o mais antigo primeiro (`created_at`). */
async function readColorGroupRows(client: Client, brandId: string, color: EditorialGroupColor): Promise<{ ok: true; rows: ColorGroupRow[] } | GroupsUnavailable> {
  const { data, error } = await client.from("editorial_groups").select("id,marca_id,color,status,created_at").eq("marca_id", brandId).eq("color", color);
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "ler a cor dos");
  }
  const rows = ((data || []) as Array<Record<string, unknown>>)
    .filter(row => row.marca_id === brandId && row.color === color && typeof row.id === "string")
    .map(row => ({ id: row.id as string, status: (row.status === "archived" ? "archived" : "active") as EditorialGroupStatus, createdAt: typeof row.created_at === "string" ? row.created_at : "" }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { ok: true, rows };
}

/**
 * 2026-10-12 · F6 · O grupo ATIVO de uma cor nesta marca (vários = o mais antigo
 * por `created_at`, a mesma escolha de `ensureEditorialGroupForColor`), sem
 * escrever nada. Null = a cor ainda não tem grupo ativo.
 */
export async function readActiveEditorialGroupIdForColor(client: Client, brandId: string, color: EditorialGroupColor): Promise<{ ok: true; groupId: string | null } | GroupsUnavailable> {
  const lidos = await readColorGroupRows(client, brandId, color);
  if (!lidos.ok) return lidos;
  return { ok: true, groupId: lidos.rows.find(row => row.status === "active")?.id ?? null };
}

/**
 * Garante o grupo de uma COR nesta marca, para mover/etiquetar por cor:
 *
 *   1. há grupo ATIVO com a cor → devolve (vários = o mais antigo); nada muda;
 *   2. senão, há um ARQUIVADO com a cor → reativa (trava otimista, evento
 *      `reactivated`); se o nome dele colide com outro ativo, reativa com o
 *      nome da cor ("Laranja", "Laranja 2"…);
 *   3. senão, cria o grupo manual com o nome = rótulo da cor.
 *
 * Duas abas garantindo a mesma cor ao mesmo tempo: a segunda cai no índice
 * único do nome (`GROUP_NAME_TAKEN`) e relê — devolve o grupo que a primeira
 * criou, em vez de recusar. Filtrar por uma cor NUNCA chama isto: só mover.
 */
export async function ensureEditorialGroupForColor(client: Client, input: {
  brandId: string;
  actorUserId: string;
  color: unknown;
}): Promise<{ ok: true; group: EditorialGroupSummary; outcome: EnsureColorGroupOutcome; eventRecorded: boolean } | EditorialGroupRefusal | GroupsUnavailable> {
  if (!isEditorialGroupColor(input.color)) return { ok: false, code: "GROUP_COLOR_INVALID", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_COLOR_INVALID };
  const color = input.color;
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const lidos = await readColorGroupRows(client, input.brandId, color);
    if (!lidos.ok) return lidos;
    const ativo = lidos.rows.find(row => row.status === "active");
    if (ativo) {
      const releitura = await readEditorialGroup(client, input.brandId, ativo.id);
      if (!releitura.ok) return releitura;
      if (releitura.group) return { ok: true, group: releitura.group, outcome: "existing", eventRecorded: true };
      continue;
    }
    const listing = await listEditorialGroupSummaries(client, input.brandId);
    if (!listing.ok) return listing;
    const ativos = listing.groups.filter(group => group.status === "active");
    const arquivado = lidos.rows.find(row => row.status === "archived");
    if (arquivado) {
      const resumo = listing.groups.find(group => group.id === arquivado.id);
      if (resumo) {
        let reativado = await updateEditorialGroup(client, { brandId: input.brandId, actorUserId: input.actorUserId, groupId: resumo.id, lockVersion: resumo.lockVersion, status: "active" });
        if (!reativado.ok && reativado.code === "GROUP_NAME_TAKEN") {
          reativado = await updateEditorialGroup(client, { brandId: input.brandId, actorUserId: input.actorUserId, groupId: resumo.id, lockVersion: resumo.lockVersion, status: "active", name: editorialGroupNameForColor(color, ativos) });
        }
        if (reativado.ok) return { ok: true, group: reativado.group, outcome: "reactivated", eventRecorded: reativado.eventRecorded };
        if (reativado.code !== "GROUP_STALE" && reativado.code !== "GROUP_NAME_TAKEN") return reativado;
        continue;
      }
    }
    const criado = await createEditorialGroup(client, { brandId: input.brandId, actorUserId: input.actorUserId, name: editorialGroupNameForColor(color, ativos), color });
    if (criado.ok) return { ok: true, group: criado.group, outcome: "created", eventRecorded: criado.eventRecorded };
    if (criado.code !== "GROUP_NAME_TAKEN") return criado;
    // Corrida: outra aba acabou de criar. Relê a cor uma vez.
  }
  return { ok: false, code: "GROUP_STALE", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_STALE };
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
  /** 2026-10-14 · aditivo (F7): detalhe a mais nos eventos (ex.: `via: "excluir_cor"` no arquivamento). */
  eventPayload?: Record<string, unknown>;
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
    events: plano.events.map(event => ({ groupId: atual.id, eventType: event.eventType, payload: { ...(input.eventPayload ?? {}), ...event.payload } })),
  });
  return { ok: true, group: releitura.group, eventRecorded };
}

/* ========================================================================== */
/* F4 — PLANO DECLARADO NO GRUPO (SDD 2026-10-12 §5.2, §5.3, §6.1-2)            */
/* ========================================================================== */

export type EditorialGroupPlanRow = {
  id: string;
  name: string;
  color: EditorialGroupColor;
  origin: "declared_plan" | "manual";
  status: EditorialGroupStatus;
  plan: Record<string, unknown> | null;
  planVersion: number;
  planHash: string | null;
  siloId: string | null;
  lockVersion: number;
};

const PLAN_COLUMNS = "id,marca_id,name,color,origin,status,plan,plan_version,plan_hash,silo_id,lock_version";

function planRowOf(row: unknown, brandId: string): EditorialGroupPlanRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.marca_id !== brandId || typeof r.id !== "string" || typeof r.name !== "string") return null;
  return {
    id: r.id,
    name: r.name,
    color: r.color as EditorialGroupColor,
    origin: r.origin === "declared_plan" ? "declared_plan" : "manual",
    status: r.status === "archived" ? "archived" : "active",
    plan: r.plan && typeof r.plan === "object" && !Array.isArray(r.plan) ? r.plan as Record<string, unknown> : null,
    planVersion: typeof r.plan_version === "number" ? r.plan_version : 0,
    planHash: typeof r.plan_hash === "string" ? r.plan_hash : null,
    siloId: typeof r.silo_id === "string" ? r.silo_id : null,
    lockVersion: typeof r.lock_version === "number" && r.lock_version > 0 ? r.lock_version : 1,
  };
}

/** O grupo com o plano (a view de resumo não carrega o jsonb). Só desta marca. */
export async function readEditorialGroupPlan(client: Client, brandId: string, groupId: string): Promise<{ ok: true; group: EditorialGroupPlanRow | null } | GroupsUnavailable> {
  const { data, error } = await client.from("editorial_groups").select(PLAN_COLUMNS).eq("marca_id", brandId).eq("id", groupId).maybeSingle();
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "ler o plano dos");
  }
  return { ok: true, group: planRowOf(data, brandId) };
}

/** Os grupos da marca que têm plano declarado (nome, slug e objetivo do Silo). */
export async function listEditorialGroupPlans(client: Client, brandId: string): Promise<{ ok: true; groups: EditorialGroupPlanRow[] } | GroupsUnavailable> {
  const { data, error } = await client.from("editorial_groups").select(PLAN_COLUMNS).eq("marca_id", brandId).not("plan", "is", null);
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "listar os planos dos");
  }
  return { ok: true, groups: ((data || []) as unknown[]).map(row => planRowOf(row, brandId)).filter((row): row is EditorialGroupPlanRow => Boolean(row)) };
}

/**
 * Cria o grupo de um plano declarado (origem `declared_plan`), com o plano já
 * gravado e `plan_version = 1`. Mesmas validações de nome e cor do grupo manual.
 */
export async function createDeclaredPlanGroup(client: Client, input: {
  brandId: string;
  actorUserId: string;
  name: unknown;
  color: unknown;
  plan: Record<string, unknown>;
  planHash: string;
}): Promise<{ ok: true; group: EditorialGroupPlanRow; eventRecorded: boolean } | EditorialGroupRefusal | GroupsUnavailable> {
  const listing = await listEditorialGroupSummaries(client, input.brandId);
  if (!listing.ok) return listing;
  const validado = validateNewEditorialGroup(input, listing.groups.filter(group => group.status === "active"));
  if (!validado.ok) return validado;
  const { data, error } = await client.from("editorial_groups").insert({
    marca_id: input.brandId,
    name: validado.name,
    color: validado.color,
    origin: "declared_plan",
    plan: input.plan,
    plan_version: 1,
    plan_hash: input.planHash,
    created_by: input.actorUserId,
    updated_by: input.actorUserId,
  }).select("id").single();
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    if (error.code === "23505") return { ok: false, code: "GROUP_NAME_TAKEN", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NAME_TAKEN };
    throw new EditorialGroupsPersistenceError(error, "criar o grupo do plano entre os");
  }
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new EditorialGroupsPersistenceError(null, "confirmar a criação do grupo do plano entre os");
  const releitura = await readEditorialGroupPlan(client, input.brandId, id);
  if (!releitura.ok) return releitura;
  if (!releitura.group || releitura.group.planHash !== input.planHash || releitura.group.planVersion !== 1) {
    throw new EditorialGroupsPersistenceError(null, "reler o grupo do plano entre os");
  }
  const eventRecorded = await appendEditorialGroupEvents(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    events: [
      { groupId: id, eventType: "created", payload: { name: validado.name, color: validado.color, origin: "declared_plan" } },
      { groupId: id, eventType: "plan_declared", payload: { planVersion: 1, planHash: input.planHash } },
    ],
  });
  return { ok: true, group: releitura.group, eventRecorded };
}

/**
 * Grava (ou regrava) o plano num grupo EXISTENTE desta marca, com trava
 * otimista. Mesmo `plan_hash` = nada muda (`changed: false`, versão igual).
 * Um grupo manual passa a `declared_plan` (o CHECK do banco exige essa origem
 * para ter plano).
 */
export async function declareEditorialGroupPlan(client: Client, input: {
  brandId: string;
  actorUserId: string;
  groupId: string;
  plan: Record<string, unknown>;
  planHash: string;
  /** 2026-10-12 · aditivo: detalhe a mais no evento (ex.: `withdrawal` do "Tirar do plano"). */
  eventPayload?: Record<string, unknown>;
}): Promise<{ ok: true; group: EditorialGroupPlanRow; changed: boolean; eventRecorded: boolean } | EditorialGroupRefusal | GroupsUnavailable> {
  const lido = await readEditorialGroupPlan(client, input.brandId, input.groupId);
  if (!lido.ok) return lido;
  const atual = lido.group;
  if (!atual) return { ok: false, code: "GROUP_NOT_FOUND", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NOT_FOUND };
  if (atual.status !== "active") return { ok: false, code: "GROUP_ARCHIVED", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_ARCHIVED };
  if (atual.origin === "declared_plan" && atual.planHash === input.planHash && atual.plan) return { ok: true, group: atual, changed: false, eventRecorded: true };
  const proximaVersao = atual.planVersion + 1;
  const { data, error } = await client.from("editorial_groups").update({
    origin: "declared_plan",
    plan: input.plan,
    plan_version: proximaVersao,
    plan_hash: input.planHash,
    lock_version: atual.lockVersion + 1,
    updated_by: input.actorUserId,
    updated_at: new Date().toISOString(),
  }).eq("marca_id", input.brandId).eq("id", atual.id).eq("lock_version", atual.lockVersion).select("id");
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "gravar o plano nos");
  }
  if (!Array.isArray(data) || data.length !== 1) return { ok: false, code: "GROUP_STALE", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_STALE };
  const releitura = await readEditorialGroupPlan(client, input.brandId, atual.id);
  if (!releitura.ok) return releitura;
  if (!releitura.group || releitura.group.planHash !== input.planHash || releitura.group.planVersion !== proximaVersao) {
    throw new EditorialGroupsPersistenceError(null, "reler o plano gravado nos");
  }
  const eventRecorded = await appendEditorialGroupEvents(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    events: [{ groupId: atual.id, eventType: atual.plan ? "plan_changed" : "plan_declared", payload: { ...(input.eventPayload ?? {}), planVersion: proximaVersao, planHash: input.planHash, previousPlanHash: atual.planHash } }],
  });
  return { ok: true, group: releitura.group, changed: true, eventRecorded };
}

/**
 * Liga o grupo ao Silo consolidado (`editorial_groups.silo_id`, 1:1 por marca).
 * Aditivo: já ligado ao mesmo Silo = nada muda; ligado a OUTRO Silo = recusa
 * (desligar é decisão humana, fora desta fase).
 */
export async function linkEditorialGroupSilo(client: Client, input: {
  brandId: string;
  actorUserId: string;
  groupId: string;
  siloId: string;
}): Promise<{ ok: true; changed: boolean } | { ok: false; code: "GROUP_NOT_FOUND" | "GROUP_SILO_TAKEN"; message: string } | GroupsUnavailable> {
  const lido = await readEditorialGroupPlan(client, input.brandId, input.groupId);
  if (!lido.ok) return lido;
  if (!lido.group) return { ok: false, code: "GROUP_NOT_FOUND", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NOT_FOUND };
  if (lido.group.siloId === input.siloId) return { ok: true, changed: false };
  /*
   * 2026-10-15 (caso WifiConecta, azul) · VÍNCULO VELHO. O grupo apontava para
   * `territory:09d9b92d…`, que não existe mais (sem território, sem SiloDNA,
   * sem SiloPage), e cada passada avisava "O grupo já está ligado ao Silo …".
   * Religar é permitido SÓ quando o Silo antigo sumiu de vez; Silo que existe
   * continua não sendo trocado (`GROUP_SILO_TAKEN`).
   */
  const antigo = lido.group.siloId;
  if (antigo && await editorialGroupSiloStillExists(client, input.brandId, antigo)) {
    return { ok: false, code: "GROUP_SILO_TAKEN", message: `O grupo já está ligado ao Silo ${antigo}.` };
  }
  const update = client.from("editorial_groups").update({
    silo_id: input.siloId,
    lock_version: lido.group.lockVersion + 1,
    updated_by: input.actorUserId,
    updated_at: new Date().toISOString(),
  }).eq("marca_id", input.brandId).eq("id", lido.group.id).eq("lock_version", lido.group.lockVersion);
  const { data, error } = await (antigo ? update.eq("silo_id", antigo) : update.is("silo_id", null)).select("id");
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    if (error.code === "23505") return { ok: false, code: "GROUP_SILO_TAKEN", message: "Outro grupo desta marca já está ligado a este Silo." };
    throw new EditorialGroupsPersistenceError(error, "ligar o Silo aos");
  }
  if (!Array.isArray(data) || data.length !== 1) return { ok: false, code: "GROUP_SILO_TAKEN", message: "O grupo mudou em outra sessão; recarregue." };
  await appendEditorialGroupEvents(client, { brandId: input.brandId, actorUserId: input.actorUserId, events: [{ groupId: lido.group.id, eventType: "silo_linked", payload: antigo ? { siloId: input.siloId, replacedMissingSiloId: antigo } : { siloId: input.siloId } }] });
  return { ok: true, changed: true };
}

/**
 * O Silo ligado ao grupo ainda existe? Território (item de workflow), SiloDNA
 * ou SiloPage desta marca — qualquer um basta. Na dúvida (erro de leitura),
 * responde que existe: melhor manter o vínculo do que trocar um Silo vivo.
 */
export async function editorialGroupSiloStillExists(client: Client, brandId: string, siloId: string): Promise<boolean> {
  const territorio = await client.from("editorial_workflow_items").select("id").eq("marca_id", brandId).eq("subject_type", "territory").eq("subject_id", siloId).limit(1);
  if (territorio.error || (Array.isArray(territorio.data) && territorio.data.length)) return true;
  const artefatos = await client.from("editorial_artifact_versions").select("version_id").eq("marca_id", brandId).in("artifact_type", ["silo_dna", "silo_page"]).in("entity_id", [siloId, `silo-page:${siloId}`]).limit(1);
  if (artefatos.error || (Array.isArray(artefatos.data) && artefatos.data.length)) return true;
  return false;
}

/* ========================================================================== */
/* F7 — EXCLUIR TUDO DA COR (SDD 2026-10-13 sdd-arquiteto-so-le-e-listas-leves, */
/* item 6, D7): o plano limpo e o Silo desligado quando nada ficou na cor.     */
/* ========================================================================== */

/**
 * Limpa o plano do grupo (`plan = null`, `plan_hash = null`, `plan_version + 1`,
 * origem de volta a `manual`): um plano sem artigos não existe. Trava otimista,
 * releitura e evento `plan_changed` com `cleared: true`. Sem plano = nada muda.
 * A reativação da cor (`ensureEditorialGroupForColor`) começa, então, sem plano.
 */
export async function clearEditorialGroupPlan(client: Client, input: {
  brandId: string;
  actorUserId: string;
  groupId: string;
  eventPayload?: Record<string, unknown>;
}): Promise<{ ok: true; changed: boolean; planVersion: number; eventRecorded: boolean } | EditorialGroupRefusal | GroupsUnavailable> {
  const lido = await readEditorialGroupPlan(client, input.brandId, input.groupId);
  if (!lido.ok) return lido;
  const atual = lido.group;
  if (!atual) return { ok: false, code: "GROUP_NOT_FOUND", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NOT_FOUND };
  if (!atual.plan) return { ok: true, changed: false, planVersion: atual.planVersion, eventRecorded: true };
  if (atual.status !== "active") return { ok: false, code: "GROUP_ARCHIVED", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_ARCHIVED };
  const proximaVersao = atual.planVersion + 1;
  const { data, error } = await client.from("editorial_groups").update({
    origin: "manual",
    plan: null,
    plan_hash: null,
    plan_version: proximaVersao,
    lock_version: atual.lockVersion + 1,
    updated_by: input.actorUserId,
    updated_at: new Date().toISOString(),
  }).eq("marca_id", input.brandId).eq("id", atual.id).eq("lock_version", atual.lockVersion).select("id");
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "limpar o plano dos");
  }
  if (!Array.isArray(data) || data.length !== 1) return { ok: false, code: "GROUP_STALE", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_STALE };
  const releitura = await readEditorialGroupPlan(client, input.brandId, atual.id);
  if (!releitura.ok) return releitura;
  if (!releitura.group || releitura.group.plan !== null || releitura.group.planVersion !== proximaVersao) {
    throw new EditorialGroupsPersistenceError(null, "reler o plano limpo nos");
  }
  const eventRecorded = await appendEditorialGroupEvents(client, {
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    events: [{ groupId: atual.id, eventType: "plan_changed", payload: { ...(input.eventPayload ?? {}), cleared: true, planVersion: proximaVersao, planHash: null, previousPlanHash: atual.planHash } }],
  });
  return { ok: true, changed: true, planVersion: proximaVersao, eventRecorded };
}

/**
 * Desliga o Silo do grupo (`silo_id = null`), só quando ele é o esperado. Usado
 * pela F7 quando nada ficou na cor e o Silo NÃO tem SiloDNA (nunca foi
 * consolidado). Silo consolidado nunca é desligado por aqui. Trava otimista e
 * releitura; o registro vai no evento de arquivamento (não há tipo de evento próprio).
 */
export async function unlinkEditorialGroupSilo(client: Client, input: {
  brandId: string;
  actorUserId: string;
  groupId: string;
  siloId: string;
}): Promise<{ ok: true; changed: boolean } | EditorialGroupRefusal | GroupsUnavailable> {
  const lido = await readEditorialGroupPlan(client, input.brandId, input.groupId);
  if (!lido.ok) return lido;
  if (!lido.group) return { ok: false, code: "GROUP_NOT_FOUND", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NOT_FOUND };
  if (lido.group.siloId === null) return { ok: true, changed: false };
  if (lido.group.siloId !== input.siloId) return { ok: false, code: "GROUP_STALE", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_STALE };
  const { data, error } = await client.from("editorial_groups").update({
    silo_id: null,
    lock_version: lido.group.lockVersion + 1,
    updated_by: input.actorUserId,
    updated_at: new Date().toISOString(),
  }).eq("marca_id", input.brandId).eq("id", lido.group.id).eq("lock_version", lido.group.lockVersion).eq("silo_id", input.siloId).select("id");
  if (error) {
    if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(error, "desligar o Silo dos");
  }
  if (!Array.isArray(data) || data.length !== 1) return { ok: false, code: "GROUP_STALE", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_STALE };
  const releitura = await readEditorialGroupPlan(client, input.brandId, lido.group.id);
  if (!releitura.ok) return releitura;
  if (!releitura.group || releitura.group.siloId !== null) throw new EditorialGroupsPersistenceError(null, "reler o Silo desligado nos");
  return { ok: true, changed: true };
}
