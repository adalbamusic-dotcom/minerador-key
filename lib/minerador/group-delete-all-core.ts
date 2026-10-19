import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "../arquiteto/versioning.ts";
import { editorialGroupReleaseBlockers } from "../editorial/editorial-group-manage.ts";
import { readEditorialGroupOccupancy } from "../editorial/editorial-group-manage-store.ts";
import { isEditorialGroupsSchemaMissing } from "../editorial/editorial-groups.ts";
import {
  appendEditorialGroupEvents,
  listEditorialGroupSummaries,
  readEditorialGroupPlan,
  unlinkEditorialGroupSilo,
  updateEditorialGroup,
} from "../editorial/editorial-groups-store.ts";
import { readDeclaredPrincipalMark } from "./declared-plan.ts";
import { syncDeclaredPlanAfterColorDeletionWithCore, type PlanAfterColorDeletionResult } from "./declared-plan-withdraw-core.ts";
import {
  buildGroupDeleteAllPreview,
  checkGroupDeleteAllConfirmation,
  GROUP_DELETE_ALL_BLOCK_SIZE,
  GROUP_DELETE_ALL_CONTRACT_RPC,
  GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE,
  GROUP_DELETE_ALL_RELEASE_VIA,
  GROUP_DELETE_ALL_RPC,
  groupDeleteAllEventPayload,
  groupDeleteOperationLabel,
  type GroupDeleteAllBlockOutcome,
  type GroupDeleteAllInput,
  type GroupDeleteAllKeyword,
  type GroupDeleteAllLifecycleMode,
  type GroupDeleteAllOut,
  type GroupDeleteAllPreview,
  type GroupDeleteAllTyped,
} from "./group-delete-all.ts";
import { isKeywordSubjectActorId, resolveKeywordSubject } from "./keyword-subject.ts";
import { architectDismantleFailureMessage, EMPTY_ARCHITECT_DISMANTLE, type ArchitectDismantlePort } from "./architect-dismantle.ts";

/**
 * ===== EXCLUIR TUDO DA COR X — O NÚCLEO (F7, 2026-10-14) =====
 *
 * SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 6 (§10.2) e D6/D7/D8. Dono: Minerador. Cliente INJETADO (a rota passa o
 * operacional depois de `requireTenantPermission(minerador:manage)`; os testes,
 * um banco de mentira). Toda leitura filtra pela marca.
 *
 * `preview` (grátis, só leitura) lê a cor em colunas estreitas — keywords vivas
 * (Assunto e marca por caminho JSON), o impacto do ciclo de vida de sempre
 * (`lifecycle_preview_minerador_keywords`), o ArticleDNA VIGENTE que cita cada
 * keyword, as etiquetas de artigo, as etapas posteriores, a lixeira e o Silo —
 * e devolve a prévia do domínio com o `decisionHash`.
 *
 * `apply` só executa a decisão tomada sobre a prévia VIGENTE (mesmo
 * `decisionHash`) e com a confirmação forte conferida AQUI também:
 *   1. blocos de até 100 pela RPC `lifecycle_delete_group_keywords` (M-E):
 *      libera o Assunto e exclui na mesma transação; cada bloco tudo-ou-nada;
 *      um bloco recusado não desfaz os anteriores (recusa por bloco, com o código);
 *   2. releitura de cada id (apagada some; publicada fica na lixeira);
 *   3. o plano do grupo acompanha o que ficou (`syncDeclaredPlanAfterColorDeletionWithCore`);
 *   4. registro no histórico do grupo (`keywords_unassigned`, append-only);
 *   5. D7: se nada ficou, a cor é liberada (Silo não consolidado desligado e
 *      grupo arquivado), pelos repositórios de sempre, com releitura.
 * Sucesso só depois das releituras. Sem a M-E, a prévia funciona e o apply
 * recusa com `GROUP_DELETE_NOT_AVAILABLE` (nada é escrito).
 *
 * O MCP NÃO chama isto (`AGENTS.md` §17.1: exclusão fora do MCP).
 *
 * 2026-10-17 · A EXCLUSÃO COMUM CHAMA ESTE MESMO NÚCLEO para as keywords
 * selecionadas que carregam o plano (`lib/minerador/keyword-delete-core.ts`),
 * com `keywordIds` = as selecionadas desta cor: a mesma prévia (restrita), a
 * mesma RPC que libera o Assunto e exclui na mesma transação, o mesmo plano
 * acompanhando, o mesmo histórico e a mesma D7 (a cor só fica livre quando
 * nada dela ficou). Sem `keywordIds`, a cor inteira, como sempre.
 */

export type GroupDeleteAllClient = Pick<SupabaseClient, "from" | "rpc">;

export type GroupDeleteAllRefusalCode =
  | "BRAND_REQUIRED"
  | "ACTOR_REQUIRED"
  | "GROUP_NOT_FOUND"
  | "GROUP_ARCHIVED"
  | "GROUPS_NOT_AVAILABLE"
  | "READ_FAILED"
  | "DECISION_REQUIRED"
  | "DECISION_STALE"
  | "CONFIRMATION_REQUIRED"
  | "GROUP_DELETE_NOT_AVAILABLE"
  | "NOTHING_TO_DELETE"
  | "DELETE_IN_PROGRESS"
  /** 2026-10-18 · o desmonte do Arquiteto (antes das keywords) não fechou: nenhuma keyword foi excluída. */
  | "ARCHITECT_DISMANTLE_FAILED";

export type GroupDeleteAllRefusal = {
  ok: false;
  code: GroupDeleteAllRefusalCode;
  message: string;
  /** Em `DECISION_STALE`: a prévia nova, para o dono decidir de novo. */
  preview?: GroupDeleteAllPreview;
  decisionHash?: string;
  missing?: string[];
};

export const GROUP_DELETE_ALL_REFUSAL_STATUS: Record<GroupDeleteAllRefusalCode, number> = {
  BRAND_REQUIRED: 400,
  ACTOR_REQUIRED: 401,
  GROUP_NOT_FOUND: 404,
  GROUP_ARCHIVED: 409,
  GROUPS_NOT_AVAILABLE: 409,
  READ_FAILED: 503,
  DECISION_REQUIRED: 400,
  DECISION_STALE: 409,
  CONFIRMATION_REQUIRED: 400,
  GROUP_DELETE_NOT_AVAILABLE: 409,
  NOTHING_TO_DELETE: 409,
  DELETE_IN_PROGRESS: 409,
  ARCHITECT_DISMANTLE_FAILED: 409,
};

export type GroupDeleteAllPreviewResult = { ok: true; mode: "preview"; preview: GroupDeleteAllPreview; decisionHash: string };

export type GroupDeleteAllApplyResult = {
  ok: true;
  mode: "apply";
  decisionHash: string;
  blocks: GroupDeleteAllBlockOutcome[];
  hardDeletedIds: string[];
  recoverableIds: string[];
  releasedSubjectIds: string[];
  /** O que ficou fora já na prévia (com o motivo). */
  out: GroupDeleteAllOut[];
  plan: PlanAfterColorDeletionResult | null;
  color: { freed: boolean; archived: boolean; siloUnlinked: boolean; keptBecause: string[] };
  historyRecorded: boolean;
  readback: { confirmed: boolean; divergences: string[] };
  /** Tudo o que a prévia pôs para sair saiu, e tudo foi relido. */
  complete: boolean;
  notices: string[];
  /** 2026-10-18 · o que o desmonte do Arquiteto fez antes das keywords (vazio quando não havia o que desmontar). */
  architect: { applied: string[] };
};

const PAGE = 1000;
const inFlight = new Set<string>();
const DOWNSTREAM_STAGES = ["radar", "writer", "publications"] as const;

const refuse = (code: GroupDeleteAllRefusalCode, message: string, extra: Partial<GroupDeleteAllRefusal> = {}): GroupDeleteAllRefusal => ({ ok: false, code, message, ...extra });

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : []);
const chunks = <T,>(items: readonly T[], size: number): T[][] => {
  const saida: T[][] = [];
  for (let inicio = 0; inicio < items.length; inicio += size) saida.push(items.slice(inicio, inicio + size));
  return saida;
};

/** A função não existe no banco (PostgREST/Postgres). */
export function isGroupDeleteFunctionMissing(error: unknown): boolean {
  const e = asRecord(error);
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : "";
  return code === "PGRST202" || code === "42883" || /could not find the function/i.test(message);
}

const RPC_REFUSAL_MESSAGES: Record<string, string> = {
  GROUP_DELETE_INVALID: "O bloco foi recusado: seleção inválida (de 1 a 100 keywords).",
  GROUP_DELETE_OUTSIDE_GROUP: "O bloco foi recusado: alguma keyword não está mais viva nesta cor (mudou de cor, foi excluída ou foi para a lixeira em outra sessão).",
  KEYWORD_DELETE_UNAUTHORIZED: "O bloco foi recusado: sem permissão de gerenciar keywords nesta marca (minerador:manage).",
  KEYWORD_DELETE_NOT_FOUND: "O bloco foi recusado: alguma keyword não foi encontrada nesta marca.",
  KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: "O bloco foi recusado: há publicada sem a declaração da lixeira de 24 h.",
  KEYWORD_DELETE_SUBJECT_PROTECTED: "O bloco foi recusado: uma keyword ainda carrega o Assunto do plano (a liberação não passou).",
  LIFECYCLE_DRAFT_DESCENDANT_REQUIRES_OWNER: "O bloco foi recusado: alguma keyword ganhou documento no Redator depois da prévia.",
  PUBLICADO_PROTEGIDO: "O bloco foi recusado: campo estrutural de publicada protegido.",
  KEYWORD_DELETE_TRANSACTION_FAILED: "O bloco não foi confirmado pelo banco; nenhuma alteração parcial dele ficou.",
  GROUP_DELETE_NOT_AVAILABLE: GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE,
};

/** A frase de cada recusa de bloco (a exclusão comum usa as mesmas). */
export function groupDeleteRefusalMessage(code: string): string {
  return RPC_REFUSAL_MESSAGES[code] ?? RPC_REFUSAL_MESSAGES.KEYWORD_DELETE_TRANSACTION_FAILED;
}

/** O código da recusa do banco (a mensagem do RAISE começa por ele). */
export function groupDeleteRpcErrorCode(error: unknown): string {
  if (isGroupDeleteFunctionMissing(error)) return "GROUP_DELETE_NOT_AVAILABLE";
  const e = asRecord(error);
  const candidato = `${typeof e?.message === "string" ? e.message : ""} ${typeof e?.details === "string" ? e.details : ""}`;
  return Object.keys(RPC_REFUSAL_MESSAGES).find(code => candidato.includes(code)) ?? "KEYWORD_DELETE_TRANSACTION_FAILED";
}

/** A M-E está no banco? Só leitura (a função de contrato). */
export async function readGroupDeleteAvailability(client: Pick<SupabaseClient, "rpc">): Promise<{ available: boolean; message: string | null }> {
  try {
    const { data, error } = await client.rpc(GROUP_DELETE_ALL_CONTRACT_RPC);
    if (error) {
      if (isGroupDeleteFunctionMissing(error)) return { available: false, message: GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE };
      return { available: false, message: "A disponibilidade de “Excluir tudo da cor” não pôde ser conferida agora. Gere a prévia de novo." };
    }
    const contrato = asRecord(data);
    return contrato?.operation === GROUP_DELETE_ALL_RPC ? { available: true, message: null } : { available: false, message: GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE };
  } catch {
    return { available: false, message: "A disponibilidade de “Excluir tudo da cor” não pôde ser conferida agora. Gere a prévia de novo." };
  }
}

type GroupRead = { id: string; name: string; color: GroupDeleteAllPreview["group"]["color"]; planVersion: number; lockVersion: number; siloId: string | null; hasPlan: boolean };

/** As keywords VIVAS da cor, em colunas estreitas. */
async function readGroupKeywords(client: GroupDeleteAllClient, brandId: string, groupId: string) {
  const rows: Array<{ id: string; keyword: string; status: string | null; ks: unknown; dp: unknown }> = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords")
      .select("id,keyword,status,group_id,ks:analise_semantica->keyword_subject,dp:analise_semantica->keyword_declared_principal")
      .eq("brand_id", brandId).eq("group_id", groupId).is("deleted_at", null)
      .order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<Record<string, unknown>>;
    for (const row of data) {
      if (typeof row.id !== "string" || row.group_id !== groupId) continue;
      rows.push({ id: row.id, keyword: typeof row.keyword === "string" ? row.keyword : "", status: typeof row.status === "string" ? row.status : null, ks: row.ks, dp: row.dp });
    }
    if (data.length < PAGE) return rows;
  }
}

/** O impacto do ciclo de vida de sempre, por id (blocos de 100). */
async function readLifecycleModes(client: GroupDeleteAllClient, brandId: string, actorUserId: string, ids: readonly string[]) {
  const modos = new Map<string, GroupDeleteAllLifecycleMode>();
  for (const bloco of chunks(ids, GROUP_DELETE_ALL_BLOCK_SIZE)) {
    const { data, error } = await client.rpc("lifecycle_preview_minerador_keywords", { p_brand_id: brandId, p_keyword_ids: bloco, p_actor_user_id: actorUserId });
    if (error) throw error;
    const itens = Array.isArray(asRecord(data)?.items) ? asRecord(data)!.items as unknown[] : [];
    for (const item of itens) {
      const impacto = asRecord(item);
      const id = text(asRecord(impacto?.root)?.id);
      const modo = impacto?.mode;
      if (id && (modo === "hard" || modo === "recoverable" || modo === "blocked")) modos.set(id, modo);
    }
  }
  return modos;
}

/** ArticleDNA VIGENTE (não retirado) por keyword desta cor, com o rótulo; e o rótulo de cada artigo. */
async function readArchitectReferences(client: GroupDeleteAllClient, brandId: string, keywordIds: ReadonlySet<string>) {
  type Meta = { versionId: string; entityId: string; versionNumber: number; status: string; articleId: string | null; label: string | null; keywordIds: string[] };
  const vigente = new Map<string, Meta>();
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("editorial_artifact_versions")
      .select("version_id,entity_id,version_number,status,aid:payload->>articleId,principal:payload->>principalKeywordId,secondary:payload->secondaryKeywordIds,reinforcement:payload->narrativeReinforcementIds,subject:payload->subject->>keywordId,phrase:payload->subject->>phrase,slug:payload->>suggestedSlug")
      .eq("marca_id", brandId).eq("artifact_type", "article_dna")
      .order("version_number", { ascending: true }).order("version_id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<Record<string, unknown>>;
    for (const row of data) {
      const versionId = text(row.version_id);
      const entityId = text(row.entity_id);
      if (!versionId || !entityId) continue;
      const meta: Meta = {
        versionId,
        entityId,
        versionNumber: Number(row.version_number) || 0,
        status: text(row.status) ?? "",
        articleId: text(row.aid),
        label: text(row.phrase) ?? text(row.slug),
        keywordIds: [...new Set([text(row.principal), ...texts(row.secondary), ...texts(row.reinforcement), text(row.subject)].filter((id): id is string => Boolean(id)))],
      };
      const atual = vigente.get(entityId);
      if (!atual || meta.versionNumber > atual.versionNumber) vigente.set(entityId, meta);
    }
    if (data.length < PAGE) break;
  }
  const citam = [...vigente.values()].filter(meta => meta.keywordIds.some(id => keywordIds.has(id)));
  // O status vigente: o último evento da versão; sem evento, o da linha. Retirado ("rejected") ou substituído não cita mais.
  const ultimo = new Map<string, { status: string; at: string }>();
  for (const bloco of chunks(citam.map(meta => meta.versionId), 100)) {
    const { data, error } = await client.from("editorial_version_status_events").select("version_id,status,occurred_at").in("version_id", bloco);
    if (error) throw error;
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const versionId = text(row.version_id);
      const status = text(row.status);
      const at = text(row.occurred_at) ?? "";
      if (!versionId || !status) continue;
      const atual = ultimo.get(versionId);
      if (!atual || at > atual.at) ultimo.set(versionId, { status, at });
    }
  }
  const porKeyword = new Map<string, Array<{ articleId: string; label: string | null }>>();
  const artigos = new Map<string, { articleId: string; label: string | null }>();
  for (const meta of vigente.values()) {
    if (meta.articleId) artigos.set(meta.articleId, { articleId: meta.articleId, label: meta.label });
  }
  for (const meta of citam) {
    const status = ultimo.get(meta.versionId)?.status ?? meta.status;
    if (status === "rejected" || status === "superseded") continue;
    const ref = { articleId: meta.articleId ?? meta.entityId, label: meta.label };
    for (const id of meta.keywordIds) {
      if (!keywordIds.has(id)) continue;
      porKeyword.set(id, [...(porKeyword.get(id) ?? []), ref]);
    }
  }
  return { porKeyword, artigos };
}

async function readTaggedArticleIds(client: GroupDeleteAllClient, brandId: string, groupId: string): Promise<string[]> {
  const { data, error } = await client.from("editorial_group_articles").select("article_id,group_id").eq("marca_id", brandId).eq("group_id", groupId);
  if (error) throw error;
  return [...new Set(((data || []) as Array<Record<string, unknown>>).filter(row => row.group_id === groupId).map(row => text(row.article_id)).filter((id): id is string => Boolean(id)))];
}

async function readDownstreamStages(client: GroupDeleteAllClient, brandId: string, articleIds: readonly string[]) {
  const etapas = new Map<string, Set<string>>();
  for (const bloco of chunks([...new Set(articleIds)], 100)) {
    const { data, error } = await client.from("editorial_workflow_items").select("article_id,stage").eq("marca_id", brandId).in("article_id", bloco).in("stage", [...DOWNSTREAM_STAGES]);
    if (error) throw error;
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const id = text(row.article_id);
      const stage = text(row.stage);
      if (!id || !stage) continue;
      etapas.set(id, (etapas.get(id) ?? new Set()).add(stage));
    }
  }
  return etapas;
}

async function readTrashedCount(client: GroupDeleteAllClient, brandId: string, groupId: string): Promise<number> {
  const lixeira = await client.from("minerador_keywords").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("group_id", groupId).not("deleted_at", "is", null);
  if (lixeira.error) throw lixeira.error;
  return typeof lixeira.count === "number" ? lixeira.count : 0;
}

/** O Silo ligado tem SiloDNA (foi consolidado)? Então não é desligado aqui. */
async function readSiloConsolidated(client: GroupDeleteAllClient, brandId: string, siloId: string | null): Promise<boolean> {
  if (!siloId) return false;
  const { data, error } = await client.from("editorial_artifact_versions").select("version_id").eq("marca_id", brandId).eq("artifact_type", "silo_dna").eq("payload->>siloId", siloId).limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

type Loaded = { group: GroupRead; preview: GroupDeleteAllPreview; decisionHash: string; architectRequest: { keywordIds: string[]; linkedTerritoryRef: string | null; basis: Record<string, unknown> } | null };

async function loadPreview(input: { client: GroupDeleteAllClient; brandId: string; actorUserId: string; groupId: string; includePublished: boolean; keywordIds?: readonly string[] | null; architect?: ArchitectDismantlePort | null }): Promise<Loaded | GroupDeleteAllRefusal> {
  const { client, brandId, actorUserId, groupId } = input;
  const lido = await readEditorialGroupPlan(client, brandId, groupId);
  if (!lido.ok) return refuse("GROUPS_NOT_AVAILABLE", lido.message);
  if (!lido.group) return refuse("GROUP_NOT_FOUND", "Esta cor não tem grupo nesta marca.");
  if (lido.group.status !== "active") return refuse("GROUP_ARCHIVED", "Esta cor já foi liberada (grupo arquivado): não há o que excluir.");
  const group: GroupRead = {
    id: lido.group.id,
    name: lido.group.name,
    color: lido.group.color,
    planVersion: lido.group.planVersion,
    lockVersion: lido.group.lockVersion,
    siloId: lido.group.siloId,
    hasPlan: Boolean(lido.group.plan),
  };
  const linhas = await readGroupKeywords(client, brandId, groupId);
  // A exclusão comum: o impacto e o Arquiteto só das selecionadas; o resto da cor entra como contexto.
  const selecao = input.keywordIds ? new Set(input.keywordIds) : null;
  const ids = linhas.map(row => row.id).filter(id => !selecao || selecao.has(id));
  const [modos, referencias, etiquetados, lixeira, siloConsolidado, disponibilidade] = await Promise.all([
    readLifecycleModes(client, brandId, actorUserId, ids),
    readArchitectReferences(client, brandId, new Set(ids)),
    readTaggedArticleIds(client, brandId, groupId),
    readTrashedCount(client, brandId, groupId),
    readSiloConsolidated(client, brandId, group.siloId),
    readGroupDeleteAvailability(client),
  ]);
  const keywords: GroupDeleteAllKeyword[] = linhas.map(row => {
    const assunto = resolveKeywordSubject({ keyword_subject: row.ks });
    return {
      id: row.id,
      keyword: row.keyword,
      status: row.status,
      subjectDeclared: assunto.declared,
      plan: assunto.plan,
      entryTitle: assunto.entry?.title ?? null,
      principalMark: readDeclaredPrincipalMark(row.dp),
      lifecycle: modos.get(row.id) ?? "unknown",
      architectRefs: referencias.porKeyword.get(row.id) ?? [],
    };
  });
  const artigosDoArquiteto = [...new Map([...referencias.porKeyword.values()].flat().map(ref => [ref.articleId, ref])).values()];
  /*
   * 2026-10-18 · O DESMONTE DO ARQUITETO (decisão do dono "tem que poder apagar … não interessa qual seja o estado"):
   * as keywords com artigo vigente e — na cor inteira — o Silo ligado ao grupo saem lá ANTES, pelo mesmo núcleo do
   * "Desfazer Silo". A prévia dele entra nesta (o alerta, por área). Sem porta, fica fora com o porquê.
   */
  const comArtigo = ids.filter(id => (referencias.porKeyword.get(id) ?? []).length > 0);
  const etapas = await readDownstreamStages(client, brandId, [...etiquetados, ...artigosDoArquiteto.map(ref => ref.articleId)]);
  const entrada: GroupDeleteAllInput = {
    group,
    keywords,
    trashedCount: lixeira,
    taggedArticles: etiquetados.map(articleId => ({ articleId, label: referencias.artigos.get(articleId)?.label ?? null, stages: [...(etapas.get(articleId) ?? [])] })),
    architectArticles: artigosDoArquiteto.map(ref => ({ articleId: ref.articleId, label: ref.label, stages: [...(etapas.get(ref.articleId) ?? [])] })),
    siloConsolidated: siloConsolidado,
    includePublished: input.includePublished,
    available: disponibilidade.available,
    selectedIds: selecao ? ids : null,
  };
  // 1ª passada: o que fica fora por OUTRO motivo (publicada sem a marcação, documento do Redator…) não vai ao Arquiteto.
  const primeira = buildGroupDeleteAllPreview({ ...entrada, architectDismantle: { ok: true, preview: EMPTY_ARCHITECT_DISMANTLE } });
  const foraPorOutroMotivo = new Set(primeira.out.map(item => item.id));
  const vaoSair = ids.filter(id => !foraPorOutroMotivo.has(id));
  // O Silo ligado ao grupo sai inteiro só quando a cor inteira sai (nada fica fora).
  const siloLigado = !selecao && group.siloId && foraPorOutroMotivo.size === 0 ? group.siloId : null;
  const precisa = vaoSair.some(id => comArtigo.includes(id)) || Boolean(siloLigado);
  let architectDismantle: GroupDeleteAllInput["architectDismantle"] = precisa ? null : { ok: true, preview: EMPTY_ARCHITECT_DISMANTLE };
  if (precisa && input.architect) architectDismantle = await input.architect.preview({ keywordIds: vaoSair, linkedTerritoryRef: siloLigado });
  const architectRequest = architectDismantle && architectDismantle.ok && architectDismantle.preview.lines.length
    ? { keywordIds: vaoSair, linkedTerritoryRef: siloLigado, basis: architectDismantle.preview.basis }
    : null;
  const preview = buildGroupDeleteAllPreview({ ...entrada, architectDismantle });
  if (!disponibilidade.available && disponibilidade.message) preview.unavailableMessage = disponibilidade.message;
  const decisionHash = await contentHash(preview.decisionBasis);
  return { group, preview, decisionHash, architectRequest };
}

function baseChecks(input: { brandId: unknown; actorUserId: unknown }): GroupDeleteAllRefusal | null {
  if (typeof input.brandId !== "string" || !input.brandId.trim()) return refuse("BRAND_REQUIRED", "A marca ativa é necessária.");
  if (!isKeywordSubjectActorId(input.actorUserId)) return refuse("ACTOR_REQUIRED", "Excluir tudo da cor exige o usuário autenticado (auth.users.id).");
  return null;
}

/** Prévia grátis (só leitura). */
export async function previewGroupDeleteAllWithCore(input: {
  client: GroupDeleteAllClient;
  brandId: string;
  actorUserId: string;
  groupId: string;
  includePublished?: boolean;
  /** 2026-10-17 · a exclusão comum: só estas keywords da cor. Ausente = a cor inteira. */
  keywordIds?: readonly string[] | null;
  /** 2026-10-18 · o desmonte do Arquiteto (a rota liga a porta do servidor do Arquiteto). */
  architect?: ArchitectDismantlePort | null;
}): Promise<GroupDeleteAllPreviewResult | GroupDeleteAllRefusal> {
  const base = baseChecks(input);
  if (base) return base;
  try {
    const lido = await loadPreview({ client: input.client, brandId: input.brandId.trim(), actorUserId: input.actorUserId.trim(), groupId: input.groupId, includePublished: input.includePublished === true, keywordIds: input.keywordIds ?? null, architect: input.architect ?? null });
    if ("ok" in lido) return lido;
    return { ok: true, mode: "preview", preview: lido.preview, decisionHash: lido.decisionHash };
  } catch (error) {
    if (isEditorialGroupsSchemaMissing(error)) return refuse("GROUPS_NOT_AVAILABLE", "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada).");
    return refuse("READ_FAILED", "A prévia não pôde ser lida agora. Nada foi excluído. Tente de novo.");
  }
}

/** Executa a decisão tomada sobre a prévia vigente, com a confirmação forte. */
export async function applyGroupDeleteAllWithCore(input: {
  client: GroupDeleteAllClient;
  brandId: string;
  actorUserId: string;
  groupId: string;
  includePublished?: boolean;
  decisionHash?: string | null;
  typed: GroupDeleteAllTyped;
  /** Para testes: o id de cada bloco (a RPC exige um uuid por chamada). */
  requestId?: () => string;
  /** 2026-10-17 · a exclusão comum: só estas keywords da cor. Ausente = a cor inteira. */
  keywordIds?: readonly string[] | null;
  /** 2026-10-18 · o desmonte do Arquiteto (a rota liga a porta do servidor do Arquiteto). */
  architect?: ArchitectDismantlePort | null;
}): Promise<GroupDeleteAllApplyResult | GroupDeleteAllRefusal> {
  const base = baseChecks(input);
  if (base) return base;
  const brandId = input.brandId.trim();
  const actorUserId = input.actorUserId.trim();
  const lockKey = `${brandId}:${input.groupId}`;
  if (inFlight.has(lockKey)) return refuse("DELETE_IN_PROGRESS", "Esta cor já está sendo excluída. Aguarde o resultado.");
  inFlight.add(lockKey);
  try {
    let lido: Loaded | GroupDeleteAllRefusal;
    try {
      lido = await loadPreview({ client: input.client, brandId, actorUserId, groupId: input.groupId, includePublished: input.includePublished === true, keywordIds: input.keywordIds ?? null, architect: input.architect ?? null });
    } catch (error) {
      if (isEditorialGroupsSchemaMissing(error)) return refuse("GROUPS_NOT_AVAILABLE", "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada).");
      return refuse("READ_FAILED", "A prévia não pôde ser relida agora. Nada foi excluído. Tente de novo.");
    }
    if ("ok" in lido) return lido;
    const { preview, decisionHash } = lido;
    if (!input.decisionHash) return refuse("DECISION_REQUIRED", "Gere a prévia e confirme sobre ela.");
    if (input.decisionHash !== decisionHash) return refuse("DECISION_STALE", "A cor mudou desde a prévia (ou a marcação das publicadas mudou). Nada foi excluído: confira a prévia nova e confirme de novo.", { preview, decisionHash });
    if (!preview.available) return refuse("GROUP_DELETE_NOT_AVAILABLE", preview.unavailableMessage ?? GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE);
    const confirmacao = checkGroupDeleteAllConfirmation(preview, input.typed);
    if (!confirmacao.ok) return refuse("CONFIRMATION_REQUIRED", confirmacao.message, { missing: confirmacao.missing });
    if (!preview.blocks.length && !lido.architectRequest) return refuse("NOTHING_TO_DELETE", "Nada desta cor pode ser excluído agora: tudo ficou fora (veja os motivos na prévia).");

    // 0. 2026-10-18 · o desmonte do Arquiteto ANTES das keywords; não fechou = nenhuma keyword é excluída (o resultado diz o que foi feito).
    let architectApplied: string[] = [];
    if (lido.architectRequest) {
      if (!input.architect) return refuse("ARCHITECT_DISMANTLE_FAILED", "Nada foi excluído: o desmonte do Arquiteto não está ligado nesta exclusão.");
      const desmonte = await input.architect.apply(lido.architectRequest);
      if (!desmonte.ok) return refuse("ARCHITECT_DISMANTLE_FAILED", architectDismantleFailureMessage(desmonte));
      architectApplied = desmonte.applied;
    }

    // 1. Os blocos, cada um tudo-ou-nada; um recusado não desfaz os anteriores.
    const novoId = input.requestId ?? (() => crypto.randomUUID());
    const blocks: GroupDeleteAllBlockOutcome[] = [];
    for (const bloco of preview.blocks) {
      const { data, error } = await input.client.rpc(GROUP_DELETE_ALL_RPC, {
        p_brand_id: brandId,
        p_group_id: input.groupId,
        p_keyword_ids: bloco.ids,
        p_actor_user_id: actorUserId,
        p_request_id: novoId(),
        p_allow_recoverable: bloco.allowRecoverable,
      });
      if (error) {
        const code = groupDeleteRpcErrorCode(error);
        blocks.push({ ids: bloco.ids, allowRecoverable: bloco.allowRecoverable, outcome: code === "KEYWORD_DELETE_TRANSACTION_FAILED" ? "failed" : "refused", hardDeletedIds: [], recoverableIds: [], releasedSubjectIds: [], code, message: RPC_REFUSAL_MESSAGES[code] ?? RPC_REFUSAL_MESSAGES.KEYWORD_DELETE_TRANSACTION_FAILED });
        if (code === "GROUP_DELETE_NOT_AVAILABLE") break;
        continue;
      }
      const resposta = asRecord(data) ?? {};
      blocks.push({
        ids: bloco.ids,
        allowRecoverable: bloco.allowRecoverable,
        outcome: "done",
        hardDeletedIds: texts(resposta.hardDeletedIds),
        recoverableIds: texts(resposta.recoverableIds),
        releasedSubjectIds: texts(resposta.releasedSubjectIds),
        code: null,
        message: null,
      });
    }
    // Blocos não tentados (a operação sumiu do banco no meio): ficam como recusados, sem chamada.
    for (const bloco of preview.blocks.slice(blocks.length)) {
      blocks.push({ ids: bloco.ids, allowRecoverable: bloco.allowRecoverable, outcome: "refused", hardDeletedIds: [], recoverableIds: [], releasedSubjectIds: [], code: "GROUP_DELETE_NOT_AVAILABLE", message: RPC_REFUSAL_MESSAGES.GROUP_DELETE_NOT_AVAILABLE });
    }

    // 2. Releitura de cada id (sucesso só depois dela).
    const divergences: string[] = [];
    const todos = preview.blocks.flatMap(bloco => bloco.ids);
    const estado = new Map<string, { deletedAt: string | null }>();
    for (const bloco of chunks(todos, 100)) {
      const { data, error } = await input.client.from("minerador_keywords").select("id,deleted_at").eq("brand_id", brandId).in("id", bloco);
      if (error) { divergences.push("A releitura das keywords não pôde ser feita agora; recarregue o Minerador para conferir."); break; }
      for (const row of (data || []) as Array<Record<string, unknown>>) if (typeof row.id === "string") estado.set(row.id, { deletedAt: text(row.deleted_at) });
    }
    const hardDeletedIds: string[] = [];
    const recoverableIds: string[] = [];
    const releasedSubjectIds: string[] = [];
    for (const bloco of blocks) {
      if (bloco.outcome !== "done") {
        if (bloco.ids.some(id => !estado.has(id) || estado.get(id)!.deletedAt)) divergences.push("Um bloco recusado aparece alterado na releitura; recarregue o Minerador.");
        continue;
      }
      for (const id of bloco.hardDeletedIds) {
        if (estado.has(id)) divergences.push(`A keyword ${id} ainda aparece na releitura.`);
        else hardDeletedIds.push(id);
      }
      for (const id of bloco.recoverableIds) {
        if (!estado.get(id)?.deletedAt) divergences.push(`A publicada ${id} não aparece na lixeira na releitura.`);
        else recoverableIds.push(id);
      }
      const confirmadas = new Set([...bloco.hardDeletedIds, ...bloco.recoverableIds]);
      for (const id of bloco.ids) if (!confirmadas.has(id)) divergences.push(`A keyword ${id} não voltou como excluída pelo banco.`);
      releasedSubjectIds.push(...bloco.releasedSubjectIds.filter(id => confirmadas.has(id)));
    }
    const saiu = new Set([...hardDeletedIds, ...recoverableIds]);
    const notices: string[] = [];

    // 3. O plano do grupo acompanha o que ficou.
    let plan: PlanAfterColorDeletionResult | null = null;
    const assuntosQueSairam = preview.releasedSubjects.filter(item => item.planOfThisColor && saiu.has(item.keywordId));
    if (assuntosQueSairam.length) {
      plan = await syncDeclaredPlanAfterColorDeletionWithCore({
        brandId,
        actorUserId,
        keywordsClient: input.client,
        groupsClient: input.client,
        groupId: input.groupId,
        removedSubjects: assuntosQueSairam,
        eventPayload: { via: GROUP_DELETE_ALL_RELEASE_VIA, decisionHash, ...(preview.selection ? { operation: groupDeleteOperationLabel(preview) } : {}) },
      });
      if (!plan.ok) notices.push(`As keywords saíram, mas o plano do grupo não foi atualizado: ${plan.reason} Gere a prévia de novo (é seguro).`);
    }

    // 4. O histórico do grupo (o registro sobrevive às keywords apagadas).
    let historyRecorded = true;
    if (saiu.size) {
      historyRecorded = await appendEditorialGroupEvents(input.client, {
        brandId,
        actorUserId,
        events: [{
          groupId: input.groupId,
          eventType: "keywords_unassigned",
          payload: {
            ...groupDeleteAllEventPayload({ preview, decisionHash, blocks }),
            plan: plan && plan.ok ? { outcome: plan.outcome, planVersion: plan.planVersion, remaining: plan.remaining } : null,
          },
        }],
      });
      if (!historyRecorded) notices.push("As keywords saíram, mas o registro no histórico do grupo não foi gravado.");
    }

    // 5. D7: a cor é liberada se nada ficou.
    const color = { freed: false, archived: false, siloUnlinked: false, keptBecause: [] as string[] };
    const tudoSaiu = blocks.every(bloco => bloco.outcome === "done") && !divergences.length && (!plan || plan.ok);
    if (tudoSaiu && preview.color.freedAtEnd) {
      const lista = await listEditorialGroupSummaries(input.client, brandId);
      const resumo = lista.ok ? lista.groups.find(item => item.id === input.groupId) ?? null : null;
      if (!resumo) {
        color.keptBecause.push("A releitura do grupo não foi possível; a cor continua como está.");
      } else {
        let ocupacao = await readEditorialGroupOccupancy(input.client, brandId, resumo);
        if (ocupacao.ok && ocupacao.occupancy.siloId && !await readSiloConsolidated(input.client, brandId, ocupacao.occupancy.siloId)) {
          const desligado = await unlinkEditorialGroupSilo(input.client, { brandId, actorUserId, groupId: input.groupId, siloId: ocupacao.occupancy.siloId });
          color.siloUnlinked = desligado.ok && desligado.changed;
          ocupacao = await readEditorialGroupOccupancy(input.client, brandId, resumo);
        }
        const bloqueios = ocupacao.ok ? editorialGroupReleaseBlockers(ocupacao.occupancy) : ["a ocupação do grupo não pôde ser relida"];
        if (bloqueios.length) {
          color.keptBecause.push(`A cor continua ocupada: ${bloqueios.join(", ")}.`);
        } else {
          const relista = await listEditorialGroupSummaries(input.client, brandId);
          const atual = relista.ok ? relista.groups.find(item => item.id === input.groupId) ?? null : null;
          const arquivado = atual ? await updateEditorialGroup(input.client, {
            brandId,
            actorUserId,
            groupId: input.groupId,
            lockVersion: atual.lockVersion,
            status: "archived",
            eventPayload: { via: GROUP_DELETE_ALL_RELEASE_VIA, decisionHash, siloUnlinked: color.siloUnlinked, ...(preview.selection ? { operation: groupDeleteOperationLabel(preview) } : {}) },
          }) : null;
          if (arquivado && arquivado.ok && arquivado.group.status === "archived") {
            color.freed = true;
            color.archived = true;
          } else {
            color.keptBecause.push(`A cor não foi liberada: ${arquivado && !arquivado.ok ? arquivado.message : "o grupo não pôde ser relido"}.`);
          }
        }
      }
    } else if (!preview.color.freedAtEnd) {
      color.keptBecause.push(...preview.color.keptBecause);
    } else {
      color.keptBecause.push("Parte da operação não foi confirmada: a cor continua ocupada.");
    }

    const complete = tudoSaiu && historyRecorded;
    return {
      ok: true,
      mode: "apply",
      decisionHash,
      blocks,
      hardDeletedIds,
      recoverableIds,
      releasedSubjectIds,
      out: preview.out,
      plan,
      color,
      historyRecorded,
      readback: { confirmed: !divergences.length, divergences },
      complete,
      notices,
      architect: { applied: architectApplied },
    };
  } finally {
    inFlight.delete(lockKey);
  }
}
