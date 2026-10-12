import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EDITORIAL_GROUP_REFUSAL_MESSAGES,
  KEYWORD_GROUP_ASSIGN_MAX,
  isEditorialGroupsSchemaMissing,
  planKeywordGroupAssignment,
  type EditorialGroupRefusalCode,
  type KeywordGroupRefusalCode,
  type KeywordGroupRow,
} from "../editorial/editorial-groups.ts";
import { appendEditorialGroupEvents, groupsUnavailable, readEditorialGroup, type EditorialGroupEventInput, type GroupsUnavailable } from "../editorial/editorial-groups-store.ts";

/**
 * ===== ETIQUETAR KEYWORDS COM UM GRUPO — O ESCRITOR ÚNICO DE `group_id` =====
 *
 * SDD 2026-10-12 §6.1, item 5. É a única função que grava
 * `minerador_keywords.group_id` (teste estrutural de chamadores em
 * `tests/minerador-grupos-f1.test.mts`): rota da tela hoje; MCP e import do
 * plano (F4/F6) chamarão esta mesma função.
 *
 * - Isolamento: o grupo é lido NA MARCA da rota; keyword de outra marca é
 *   "não encontrada"; o banco repete a regra com a FK composta
 *   (group_id, brand_id).
 * - `keywordsClient` é o cliente do usuário (RLS de `minerador_keywords`,
 *   como os imports); `groupsClient` é o operacional (as tabelas de grupo só
 *   aceitam escrita do servidor).
 * - Sucesso só com releitura: a linha só conta como movida se o UPDATE a
 *   devolveu com o `group_id` pedido.
 * - Mexe só em `group_id`: `analise_semantica`, status e aprovação ficam
 *   intactos (o grupo não entra no hash do pacote aprovado).
 */

type Client = Pick<SupabaseClient, "from">;

/** Ids viajam na URL do PostgREST: blocos de 200, como o resto do Minerador. */
export const KEYWORD_GROUP_ID_CHUNK = 200;

export type AssignKeywordGroupRefusalCode =
  | "ACTOR_REQUIRED"
  | "KEYWORDS_REQUIRED"
  | "TOO_MANY_KEYWORDS"
  | Extract<EditorialGroupRefusalCode, "GROUP_NOT_FOUND" | "GROUP_ARCHIVED">;

export type AssignKeywordGroupResult =
  | {
      ok: true;
      groupId: string | null;
      moved: string[];
      unchanged: string[];
      refused: Array<{ id: string; code: KeywordGroupRefusalCode; message: string }>;
      /** Pedidas e não confirmadas pela releitura (RLS, lixeira concorrente). */
      notConfirmed: string[];
      eventsRecorded: boolean;
    }
  | { ok: false; code: AssignKeywordGroupRefusalCode; message: string }
  | GroupsUnavailable;

const ROW_COLUMNS = "id,brand_id,group_id,deleted_at,keyword,subject_plan:analise_semantica->keyword_subject->plan,declared_principal:analise_semantica->keyword_declared_principal";

function blocos<T>(lista: readonly T[], tamanho = KEYWORD_GROUP_ID_CHUNK): T[][] {
  const saida: T[][] = [];
  for (let inicio = 0; inicio < lista.length; inicio += tamanho) saida.push(lista.slice(inicio, inicio + tamanho));
  return saida;
}

export async function assignKeywordGroupWithCore(input: {
  brandId: string;
  actorUserId: string;
  keywordIds: readonly string[];
  /** `null` = tirar do grupo ("Sem grupo"). */
  groupId: string | null;
  keywordsClient: Client;
  groupsClient: Client;
}): Promise<AssignKeywordGroupResult> {
  if (!input.actorUserId) return { ok: false, code: "ACTOR_REQUIRED", message: "Ator autenticado ausente." };
  const ids = [...new Set(input.keywordIds.filter(id => typeof id === "string" && id.trim()))];
  if (!ids.length) return { ok: false, code: "KEYWORDS_REQUIRED", message: "Selecione pelo menos uma keyword." };
  if (ids.length > KEYWORD_GROUP_ASSIGN_MAX) return { ok: false, code: "TOO_MANY_KEYWORDS", message: `No máximo ${KEYWORD_GROUP_ASSIGN_MAX} keywords por vez.` };

  if (input.groupId) {
    const lido = await readEditorialGroup(input.groupsClient, input.brandId, input.groupId);
    if (!lido.ok) return lido;
    if (!lido.group) return { ok: false, code: "GROUP_NOT_FOUND", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_NOT_FOUND };
    if (lido.group.status !== "active") return { ok: false, code: "GROUP_ARCHIVED", message: EDITORIAL_GROUP_REFUSAL_MESSAGES.GROUP_ARCHIVED };
  }

  const rows: KeywordGroupRow[] = [];
  for (const bloco of blocos(ids)) {
    const { data, error } = await input.keywordsClient.from("minerador_keywords").select(ROW_COLUMNS).eq("brand_id", input.brandId).in("id", bloco);
    if (error) {
      if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
      throw Object.assign(new Error("Falha ao ler as keywords para etiquetar."), { code: typeof error.code === "string" ? error.code : "database_error" });
    }
    rows.push(...((data || []) as unknown as KeywordGroupRow[]));
  }

  const plano = planKeywordGroupAssignment({ brandId: input.brandId, keywordIds: ids, targetGroupId: input.groupId, rows });
  const moved: string[] = [];
  const confirmadosDe = new Map<string, string | null>();
  for (const bloco of blocos(plano.toMove.map(item => item.id))) {
    const { data, error } = await input.keywordsClient
      .from("minerador_keywords")
      .update({ group_id: input.groupId })
      .eq("brand_id", input.brandId)
      .is("deleted_at", null)
      .in("id", bloco)
      .select("id,group_id");
    if (error) {
      if (isEditorialGroupsSchemaMissing(error)) return groupsUnavailable();
      throw Object.assign(new Error("Falha ao gravar o grupo das keywords."), { code: typeof error.code === "string" ? error.code : "database_error" });
    }
    for (const linha of (data || []) as Array<{ id?: unknown; group_id?: unknown }>) {
      if (typeof linha.id === "string") confirmadosDe.set(linha.id, typeof linha.group_id === "string" ? linha.group_id : null);
    }
  }
  const notConfirmed: string[] = [];
  for (const item of plano.toMove) {
    if (confirmadosDe.has(item.id) && confirmadosDe.get(item.id) === input.groupId) moved.push(item.id);
    else notConfirmed.push(item.id);
  }

  // Histórico: o grupo de destino recebe, cada grupo de origem perde.
  const origemDe = new Map(plano.toMove.map(item => [item.id, item.fromGroupId]));
  const events: EditorialGroupEventInput[] = [];
  if (input.groupId && moved.length) {
    events.push({ groupId: input.groupId, eventType: "keywords_assigned", payload: { count: moved.length, keywordIds: moved.slice(0, 200) } });
  }
  const porOrigem = new Map<string, string[]>();
  for (const id of moved) {
    const origem = origemDe.get(id);
    if (origem) porOrigem.set(origem, [...(porOrigem.get(origem) || []), id]);
  }
  for (const [origem, saidas] of porOrigem) {
    events.push({ groupId: origem, eventType: "keywords_unassigned", payload: { count: saidas.length, keywordIds: saidas.slice(0, 200), toGroupId: input.groupId } });
  }
  const eventsRecorded = await appendEditorialGroupEvents(input.groupsClient, { brandId: input.brandId, actorUserId: input.actorUserId, events });

  return { ok: true, groupId: input.groupId, moved, unchanged: plano.unchanged, refused: plano.refused, notConfirmed, eventsRecorded };
}
