import "server-only";
import { createHash } from "node:crypto";
import { applyApproveAndSend, previewApproveAndSend } from "@/lib/minerador/approve-and-send-core";
import {
  applyArquitetoImportGate,
  classifyArquitetoImportPool,
  withoutArquitetoApproval,
  type ArquitetoImportItem,
  type ArquitetoImportPoolRow,
} from "@/lib/arquiteto/minerador-import";
import { readArticleKeywordIndex } from "@/lib/editorial/article-groups-store";
import { createMineradorArquitetoHandoff, previewMineradorArquitetoHandoff } from "./arquiteto-workspace";
import { keywordDecisionEntries, readDecisionKeywords } from "./minerador-keyword-decision-core";
import { PipelineRuntimeError, pipelineErrorFromSupabase, resolvePipelineContext, type PipelineContext } from "./pipeline-runtime";

/**
 * IMPORTAR DO MINERADOR, PELO ARQUITETO — SÓ O QUE JÁ ESTÁ APROVADO
 * (SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, itens
 * 1, 2 e 6; F4 da SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, D2).
 *
 * - Lista leve: só `id,keyword,status,group_id` das keywords, `subject_id,state`
 *   dos itens do Arquiteto e o índice do ArticleDNA vigente por caminho JSON.
 *   Nada de `analise_semantica`, pacote aprovado, ArticleDNA ou parecer de SERP
 *   vai para o navegador. As que ainda não estão no Arquiteto passam pelo
 *   portão do "Aprovar e enviar" (`previewApproveAndSend`), lido com o
 *   cliente DA SESSÃO (RLS de sempre; nada de service role).
 * - F4 (D2): a etapa de aprovar fica SEMPRE fechada (`withoutArquitetoApproval`).
 *   A que precisa de aprovação fica "precisa aprovar no Minerador" (o botão
 *   "Aprovar no Minerador (N)" abre o "Aprovar e enviar" de lá); aplicar só
 *   envia as já aprovadas, pelo handoff do Arquiteto em modo parcial (recusa
 *   por item e o Silo do plano preparado depois da releitura, item 1). O
 *   Arquiteto não escreve em `minerador_keywords` por aqui.
 */

const PAGE = 1000;
const ID_BATCH = 100;

type Db = PipelineContext["supabase"];

async function paginate<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw pipelineErrorFromSupabase(error);
    const page = (Array.isArray(data) ? data : []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function readPoolKeywords(db: Db, brandId: string): Promise<ArquitetoImportPoolRow[]> {
  // 2026-10-14: só o TEXTO do hash da aprovação, por caminho JSON (nada do DNA viaja).
  const rows = await paginate<Record<string, unknown>>((from, to) => db.from("minerador_keywords")
    .select(POOL_KEYWORD_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).order("id").range(from, to));
  return rows.flatMap(row => typeof row.id === "string" && typeof row.keyword === "string"
    ? [{ id: row.id, keyword: row.keyword, status: typeof row.status === "string" ? row.status : null, group_id: typeof row.group_id === "string" ? row.group_id : null, approval_hash: typeof row.approval_hash === "string" ? row.approval_hash : null }]
    : []);
}

/** A lista leve: id, nome, status, grupo e o hash da aprovação (texto). */
export const POOL_KEYWORD_COLUMNS = "id,keyword,status,group_id,approval_hash:analise_semantica->aprovacao->>contentHash";
/** O item do Arquiteto: estado e o hash do pacote que ele guarda (texto). */
export const POOL_WORKFLOW_COLUMNS = "subject_id,state,received_hash:payload->approvedDna->>contentHash";

async function readWorkflowStates(db: Db, brandId: string): Promise<{ states: Map<string, string>; receivedHashes: Map<string, string | null> }> {
  const rows = await paginate<Record<string, unknown>>((from, to) => db.from("editorial_workflow_items")
    .select(POOL_WORKFLOW_COLUMNS).eq("marca_id", brandId).eq("subject_type", "keyword").eq("stage", "architect").order("subject_id").range(from, to));
  const states = new Map<string, string>();
  const receivedHashes = new Map<string, string | null>();
  for (const row of rows) {
    if (typeof row.subject_id === "string" && typeof row.state === "string" && !states.has(row.subject_id)) {
      states.set(row.subject_id, row.state);
      if (row.state === "received") receivedHashes.set(row.subject_id, typeof row.received_hash === "string" ? row.received_hash : null);
    }
  }
  return { states, receivedHashes };
}

async function readIncorporatedKeywordIds(db: Db, brandId: string): Promise<Set<string>> {
  const index = await readArticleKeywordIndex(db, brandId);
  return new Set(index.flatMap(article => [...article.keywordIds, ...(article.subjectKeywordId ? [article.subjectKeywordId] : [])]));
}

async function actorCan(context: PipelineContext, module: string, action: string): Promise<boolean> {
  try {
    await resolvePipelineContext({ brandId: context.brandId, module, action }, { requireActorUserId: async () => context.actorUserId });
    return true;
  } catch (error) {
    if (error instanceof PipelineRuntimeError && error.status === 403) return false;
    throw error;
  }
}

/** O motivo das linhas quando quem abre a lista só pode VER o Arquiteto. */
export const ARQUITETO_IMPORT_NO_CREATE_REASON = "importar exige a permissão arquiteto:create";

const canonicalJson = (value: unknown): unknown => Array.isArray(value) ? value.map(canonicalJson) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonicalJson(item)]))
  : value;

/**
 * O portão do "Aprovar e enviar" PELO ARQUITETO (F4, D2): a leitura do
 * Minerador com o cliente da sessão, em lotes; a prévia da decisão de sempre
 * (`keywordDecisionEntries`, pura); a aprovação SEMPRE fechada; o envio pelo
 * handoff do Arquiteto (`createMineradorArquitetoHandoff`, modo parcial), com o
 * contexto autorizado de quem pediu. Nenhuma escrita em `minerador_keywords`.
 */
export function arquitetoImportDeps(context: PipelineContext) {
  return withoutArquitetoApproval({
    // O MESMO leitor (`readDecisionKeywords`), em lotes (a URL do PostgREST tem limite), com o cliente da sessão.
    readRows: async (ids: readonly string[]) => {
      const unique = [...new Set(ids)];
      const rows: Awaited<ReturnType<typeof readDecisionKeywords>>["rows"] = [];
      for (let start = 0; start < unique.length; start += ID_BATCH) {
        rows.push(...(await readDecisionKeywords(context.brandId, unique.slice(start, start + ID_BATCH), context.supabase)).rows);
      }
      const found = new Set(rows.map(row => row.id));
      return { rows, missingIds: unique.filter(id => !found.has(id)) };
    },
    entries: rows => keywordDecisionEntries(rows, "approve"),
    approve: async () => { throw new Error("O Arquiteto não aprova keyword: aprove no Minerador."); },
    previewSend: async (ids: readonly string[]) => {
      const preview = await previewMineradorArquitetoHandoff(context, ids);
      return { eligibleKeywordIds: preview.eligibleKeywordIds, existingKeywordIds: preview.existingKeywordIds, refreshKeywordIds: preview.refreshKeywordIds, refused: preview.refused };
    },
    send: (ids: readonly string[]) => createMineradorArquitetoHandoff(context, ids, { partial: true }),
    hash: (value: unknown) => createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex"),
  });
}

export type ArquitetoImportPool = {
  items: ArquitetoImportItem[];
  /** F4 (D2): o modal nunca aprova (sempre `false`; o campo fica para a tela antiga). */
  canApprove: false;
  canCreate: boolean;
  /** Quantas passaram pelo portão do "Aprovar e enviar" nesta leitura. */
  checked: number;
  readAt: string;
};

export async function loadArquitetoImportPool(context: PipelineContext): Promise<ArquitetoImportPool> {
  const [keywords, workflow, incorporatedKeywordIds, canCreate] = await Promise.all([
    readPoolKeywords(context.supabase, context.brandId),
    readWorkflowStates(context.supabase, context.brandId),
    readIncorporatedKeywordIds(context.supabase, context.brandId),
    context.action === "create" ? Promise.resolve(true) : actorCan(context, "arquiteto", "create"),
  ]);
  const pool = classifyArquitetoImportPool({ keywords, workflowStateByKeywordId: workflow.states, incorporatedKeywordIds, receivedPackageHashByKeywordId: workflow.receivedHashes });
  let items = pool.items;
  if (pool.gateIds.length && !canCreate) {
    // Sem permissão de criar: a nova fica fora; a já recebida continua "já no Arquiteto".
    const fora = new Set(pool.gateIds.filter(id => !pool.refreshCandidateIds.includes(id)));
    items = items.map(item => fora.has(item.id) ? { ...item, state: "out" as const, reason: ARQUITETO_IMPORT_NO_CREATE_REASON, detail: null } : item);
  } else if (pool.gateIds.length) {
    const preview = await previewApproveAndSend(
      { brandId: context.brandId, actorId: context.actorUserId, keywordIds: pool.gateIds, send: true },
      arquitetoImportDeps(context),
    );
    items = applyArquitetoImportGate(pool.items, pool.gateIds, preview.lines, pool.refreshCandidateIds);
  }
  const ordem = { send: 0, refresh: 1, approve_in_minerador: 2, out: 3, in_arquiteto: 4 } as const;
  items = [...items].sort((a, b) => ordem[a.state] - ordem[b.state] || a.keyword.localeCompare(b.keyword, "pt-BR"));
  return { items, canApprove: false, canCreate, checked: canCreate ? pool.gateIds.length : 0, readAt: new Date().toISOString() };
}

export async function previewArquitetoImport(context: PipelineContext, keywordIds: readonly string[]) {
  const { rows: _rows, entries: _entries, ...preview } = await previewApproveAndSend(
    { brandId: context.brandId, actorId: context.actorUserId, keywordIds, send: true },
    arquitetoImportDeps(context),
  );
  void _rows; void _entries;
  return { ...preview, canApprove: false as const };
}

export async function applyArquitetoImport(context: PipelineContext, input: { keywordIds: readonly string[]; decisionHash: string; excludedIds?: readonly string[] }) {
  const result = await applyApproveAndSend(
    { brandId: context.brandId, actorId: context.actorUserId, keywordIds: input.keywordIds, send: true, decisionHash: input.decisionHash, excludedIds: input.excludedIds ?? [] },
    arquitetoImportDeps(context),
  );
  return { ...result, canApprove: false as const };
}
