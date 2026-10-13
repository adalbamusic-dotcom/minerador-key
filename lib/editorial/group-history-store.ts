import type { SupabaseClient } from "@supabase/supabase-js";
import { isEditorialGroupsSchemaMissing } from "./editorial-groups.ts";
import { EditorialGroupsPersistenceError, groupsUnavailable, type GroupsUnavailable } from "./editorial-groups-store.ts";
import { mergeGroupHistory, type GroupHistoryEntry } from "./group-history.ts";

/**
 * ===== HISTÓRICO DO GRUPO — LEITURA (SDD 2026-10-12 §10.4) =====
 *
 * Só leitura, sob demanda (a tela chama ao abrir o histórico, nunca no
 * carregamento da área). Cliente INJETADO; tudo filtrado por `marca_id` e pelos
 * grupos DESTA marca — um id de grupo de outra marca é ignorado.
 *
 * O registro do guarda (`operation_ledger`) é lido com tolerância: nenhuma
 * linha, coluna/formato diferente ou erro de leitura dele não derruba o
 * histórico — os eventos do grupo aparecem e a resposta diz que o registro do
 * guarda não pôde ser lido.
 */

type Client = Pick<SupabaseClient, "from">;

export const GROUP_HISTORY_MAX_GROUPS = 10;
export const GROUP_HISTORY_LIMIT = 200;

export type EditorialGroupHistory = {
  ok: true;
  groupIds: string[];
  entries: GroupHistoryEntry[];
  /** O registro do guarda foi lido (mesmo vazio). `false` = falhou e ficou de fora. */
  ledgerRead: boolean;
};

export async function readEditorialGroupHistory(client: Client, brandId: string, requestedGroupIds: readonly string[]): Promise<EditorialGroupHistory | GroupsUnavailable> {
  const pedidos = [...new Set(requestedGroupIds.map(id => id.toLowerCase()))].slice(0, GROUP_HISTORY_MAX_GROUPS);
  if (!pedidos.length) return { ok: true, groupIds: [], entries: [], ledgerRead: true };

  // Só os grupos que existem NESTA marca.
  const grupos = await client.from("editorial_groups").select("id,marca_id").eq("marca_id", brandId).in("id", pedidos);
  if (grupos.error) {
    if (isEditorialGroupsSchemaMissing(grupos.error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(grupos.error, "ler o histórico dos");
  }
  const groupIds = ((grupos.data || []) as Array<{ id?: unknown; marca_id?: unknown }>)
    .filter(row => row.marca_id === brandId && typeof row.id === "string")
    .map(row => row.id as string);
  if (!groupIds.length) return { ok: true, groupIds: [], entries: [], ledgerRead: true };

  const eventos = await client
    .from("editorial_group_events")
    .select("id,marca_id,group_id,event_type,payload,actor_id,occurred_at")
    .eq("marca_id", brandId)
    .in("group_id", groupIds)
    .order("occurred_at", { ascending: false })
    .limit(GROUP_HISTORY_LIMIT);
  if (eventos.error) {
    if (isEditorialGroupsSchemaMissing(eventos.error)) return groupsUnavailable();
    throw new EditorialGroupsPersistenceError(eventos.error, "ler os eventos dos");
  }
  const linhasDeEventos = ((eventos.data || []) as Array<Record<string, unknown>>).filter(row => row.marca_id === brandId);

  let linhasDoRegistro: Array<Record<string, unknown>> = [];
  let ledgerRead = true;
  try {
    const registro = await client
      .from("editorial_workflow_items")
      .select("marca_id,subject_type,subject_id,stage,payload,updated_at")
      .eq("marca_id", brandId)
      .eq("subject_type", "operation_ledger")
      .in("payload->>groupId", groupIds)
      .order("updated_at", { ascending: false })
      .limit(GROUP_HISTORY_LIMIT);
    if (registro.error) ledgerRead = false;
    else linhasDoRegistro = ((registro.data || []) as Array<Record<string, unknown>>).filter(row => row.marca_id === brandId);
  } catch {
    ledgerRead = false;
  }

  return { ok: true, groupIds, entries: mergeGroupHistory(linhasDeEventos, linhasDoRegistro, groupIds, GROUP_HISTORY_LIMIT), ledgerRead };
}
