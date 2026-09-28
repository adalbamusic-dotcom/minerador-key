import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectiveKeywordStatus } from "@/lib/minerador/editorial-status";
import { applyApproval, approvedPackageDiverged, readApprovalRecord, resolveApprovalReadiness } from "@/lib/minerador/approved-package";
import { isKeywordPublished } from "@/lib/minerador/keyword-lifecycle";
import { deriveLogicalKeywordBatchItem } from "@/lib/minerador/logical-batch";
import { hasCompleteLogicalOutputContract, hasCurrentLogicalProcessorMetadata } from "@/lib/minerador/logical-processor";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";

/**
 * O MINERADOR NO SERVIDOR — LÓGICA E APROVAÇÃO COM COMPARE-AND-SWAP E RELEITURA.
 *
 * Extraído de `platform-mcp-tools.ts` (2026-09-28, SDD
 * `docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md`): a ferramenta MCP
 * `run_keyword_logic` e `decide_keywords` e o "Reforçar publicados" do
 * Arquiteto chamam o MESMO núcleo. Nada mudou no comportamento: a Lógica é a
 * mesma função pura do botão do Minerador (`deriveLogicalKeywordBatchItem`) e
 * a aprovação é o mesmo `resolveApprovalReadiness` + `applyApproval`, gravados
 * com a trava da linha (`constrainKeywordSnapshot`) e confirmados por
 * releitura. O ator é sempre o autenticado de quem chama.
 */

type Db = SupabaseClient | ReturnType<typeof getOperationalClient>;

export type DecisionKeywordRow = {
  id: string;
  brand_id: string;
  keyword: string;
  status: string | null;
  intent: string | null;
  volume_search: number | null;
  results_allintitle: number | null;
  kgr_score: number | null;
  lista_id: string | null;
  analise_semantica: Record<string, unknown> | null;
};

export async function readDecisionKeywords(brandId: string, ids: readonly string[], db: Db = getOperationalClient()) {
  const uniqueIds = [...new Set(ids)];
  const { data, error } = await db.from("minerador_keywords")
    .select("id,brand_id,keyword,status,intent,volume_search,results_allintitle,kgr_score,lista_id,analise_semantica")
    .eq("brand_id", brandId).is("deleted_at", null).in("id", uniqueIds);
  if (error) mapPersistenceError(error);
  const rows = (data || []) as unknown as DecisionKeywordRow[];
  const byId = new Map(rows.map(row => [row.id, row]));
  return {
    rows: uniqueIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []),
    missingCount: uniqueIds.filter(id => !byId.has(id)).length,
  };
}

export function approvalInput(row: DecisionKeywordRow) {
  return {
    keywordId: row.id,
    brandId: row.brand_id,
    keyword: row.keyword,
    intent: row.intent,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
    kgrScore: row.kgr_score,
    listaId: row.lista_id,
    semantic: row.analise_semantica,
  };
}

export function keywordDecisionBase(row: DecisionKeywordRow) {
  const diverged = approvedPackageDiverged(approvalInput(row));
  return {
    id: row.id,
    keyword: row.keyword,
    status: resolveEffectiveKeywordStatus({ status: row.status, diverged }).status ?? "desconhecido",
    intent: row.intent,
    volume: row.volume_search,
    allintitle: row.results_allintitle,
    kgr: row.kgr_score,
    listaId: row.lista_id,
    semantic: row.analise_semantica,
  };
}

/**
 * `minerador_keywords` has no `updated_at`. Compare-and-swap the business
 * snapshot that determines eligibility inside the remote UPDATE, so a write
 * cannot overwrite a concurrent edit between preview and apply.
 */
export function constrainKeywordSnapshot<T extends {
  eq: (column: string, value: unknown) => T;
  is: (column: string, value: null) => T;
  filter: (column: string, operator: string, value: string) => T;
}>(query: T, row: DecisionKeywordRow): T {
  let guarded = query.eq("keyword", row.keyword);
  const nullable: Array<[string, unknown]> = [
    ["status", row.status], ["intent", row.intent], ["volume_search", row.volume_search],
    ["results_allintitle", row.results_allintitle], ["kgr_score", row.kgr_score], ["lista_id", row.lista_id],
  ];
  for (const [column, value] of nullable) guarded = value === null ? guarded.is(column, null) : guarded.eq(column, value);
  guarded = row.analise_semantica === null
    ? guarded.is("analise_semantica", null)
    : guarded.filter("analise_semantica", "eq", JSON.stringify(row.analise_semantica));
  return guarded;
}

/* ---------------------------------- Lógica ---------------------------------- */

export type KeywordLogicResult = {
  processedAt: string;
  requested: number;
  found: number;
  missingIds: string[];
  applied: number;
  unchanged: number;
  failed: number;
  results: Array<{ id: string; keyword: string; outcome: "applied" | "unchanged" | "stale"; reason?: string }>;
  readbackConfirmed: boolean;
};

/**
 * A Lógica determinística do botão do Minerador: intenção, nicho e funil, com
 * as decisões humanas preservadas. Sem provider, sem medir, sem aprovar.
 * Deriva o lote inteiro antes de gravar e confirma cada alteração por releitura.
 */
export async function runKeywordLogicWithCore(input: { brandId: string; keywordIds: readonly string[]; db?: Db; now?: () => Date }): Promise<KeywordLogicResult> {
  const uniqueIds = [...new Set(input.keywordIds)];
  const db = input.db ?? getOperationalClient();
  const selected = await db.from("minerador_keywords")
    .select("id,brand_id,keyword,status,intent,location,volume_search,results_allintitle,kgr_score,lista_id,analise_semantica")
    .eq("brand_id", input.brandId).is("deleted_at", null).in("id", uniqueIds);
  if (selected.error) mapPersistenceError(selected.error);
  const rows = (selected.data || []) as unknown as Array<DecisionKeywordRow & { location: string | null }>;
  const byId = new Map(rows.map(row => [row.id, row]));
  const missingIds = uniqueIds.filter(id => !byId.has(id));
  const listIds = [...new Set(rows.map(row => row.lista_id).filter((id): id is string => Boolean(id)))];
  const listResult = listIds.length
    ? await db.from("minerador_keyword_lists").select("id,nicho").eq("marca_id", input.brandId).in("id", listIds)
    : { data: [], error: null };
  if (listResult.error) mapPersistenceError(listResult.error);
  const listById = new Map(((listResult.data || []) as Array<{ id: string; nicho: string | null }>).map(list => [list.id, list]));
  const processedAt = (input.now ? input.now() : new Date()).toISOString();
  const planned = rows.map(row => ({ row, derived: deriveLogicalKeywordBatchItem(
    { id: row.id, keyword: row.keyword, location: row.location, intent: row.intent, analise_semantica: row.analise_semantica },
    row.lista_id ? listById.get(row.lista_id) || null : null,
    processedAt,
  ) }));
  const results: KeywordLogicResult["results"] = [];
  for (const { row, derived } of planned) {
    if (!derived.needsWrite) { results.push({ id: row.id, keyword: row.keyword, outcome: "unchanged" }); continue; }
    const saved = await constrainKeywordSnapshot(
      db.from("minerador_keywords").update({ intent: derived.update.intent, analise_semantica: derived.update.analise_semantica })
        .eq("id", row.id).eq("brand_id", input.brandId).is("deleted_at", null),
      row,
    ).select("id,intent,analise_semantica").maybeSingle();
    if (saved.error) mapPersistenceError(saved.error);
    const readback = saved.data as { id?: string; intent?: string | null; analise_semantica?: Record<string, unknown> | null } | null;
    const confirmed = Boolean(readback?.id === row.id && readback.intent === derived.update.intent
      && hasCompleteLogicalOutputContract({ semantic: readback.analise_semantica, intent: derived.update.intent })
      && hasCurrentLogicalProcessorMetadata({ keywordId: row.id, keyword: row.keyword, location: row.location, niche: derived.niche, semantic: readback.analise_semantica }));
    results.push(confirmed
      ? { id: row.id, keyword: row.keyword, outcome: "applied" }
      : { id: row.id, keyword: row.keyword, outcome: "stale", reason: "compare_and_swap_or_readback_failed" });
  }
  const applied = results.filter(result => result.outcome === "applied").length;
  const failed = results.filter(result => result.outcome === "stale").length;
  return { processedAt, requested: uniqueIds.length, found: rows.length, missingIds, applied, unchanged: results.length - applied - failed, failed, results, readbackConfirmed: failed === 0 };
}

/* -------------------------------- aprovação -------------------------------- */

export type KeywordDecisionEntry = {
  id: string;
  keyword: string;
  currentStatus: string;
  proposedStatus: "aprovado" | "rejeitado";
  outcome: "unchanged" | "blocked" | "ready";
  blockers: string[];
  readiness: { ok: boolean; missing: unknown; reason: string | null } | null;
  approvalDiverged: boolean | null;
};

/** A prévia da decisão: elegibilidade (Lógica e Volume, desde 2026-09-28), bloqueios e o que muda. */
export function keywordDecisionEntries(rows: readonly DecisionKeywordRow[], action: "approve" | "reject"): KeywordDecisionEntry[] {
  return rows.map(row => {
    const current = keywordDecisionBase(row);
    const published = isKeywordPublished({ status: row.status, semantic: row.analise_semantica });
    const readiness = resolveApprovalReadiness({ semantic: row.analise_semantica, intent: row.intent, volumeSearch: row.volume_search, resultsAllintitle: row.results_allintitle });
    const approval = readApprovalRecord(row.analise_semantica);
    const diverged = approvedPackageDiverged(approvalInput(row));
    const noop = action === "approve"
      ? current.status === "aprovado" && Boolean(approval) && diverged === false
      : current.status === "rejeitado";
    const blocked = published ? "Conteúdo publicado é protegido." : action === "approve" && !readiness.ok ? readiness.reason : null;
    return {
      id: row.id, keyword: row.keyword, currentStatus: current.status,
      proposedStatus: action === "approve" ? "aprovado" as const : "rejeitado" as const,
      outcome: noop ? "unchanged" as const : blocked ? "blocked" as const : "ready" as const,
      blockers: blocked ? [blocked] : [],
      readiness: action === "approve" ? { ok: readiness.ok, missing: readiness.missing, reason: readiness.reason } : null,
      approvalDiverged: diverged,
    };
  });
}

export type KeywordDecisionResult = { id: string; outcome: "applied" | "unchanged" | "blocked" | "stale"; reason?: string };

/**
 * Grava a decisão humana: aprovar assina o pacote (`applyApproval`) com o ator
 * autenticado; a linha só muda se ainda for a lida (compare-and-swap); a
 * releitura confere status, hash, assinatura e quem aprovou.
 */
export async function applyKeywordDecisionEntries(input: {
  brandId: string;
  actorId: string;
  action: "approve" | "reject";
  rows: readonly DecisionKeywordRow[];
  entries: readonly KeywordDecisionEntry[];
  db?: Db;
  now?: () => Date;
}): Promise<KeywordDecisionResult[]> {
  const db = input.db ?? getOperationalClient();
  const results: KeywordDecisionResult[] = [];
  const rowById = new Map(input.rows.map(row => [row.id, row]));
  for (const entry of input.entries) {
    const row = rowById.get(entry.id)!;
    if (entry.outcome === "unchanged") { results.push({ id: row.id, outcome: "unchanged" }); continue; }
    if (entry.outcome === "blocked") { results.push({ id: row.id, outcome: "blocked", reason: entry.blockers[0] }); continue; }
    let semantic = row.analise_semantica || {};
    if (input.action === "approve") semantic = await applyApproval({ ...approvalInput(row), approvedAt: (input.now ? input.now() : new Date()).toISOString(), approvedBy: input.actorId });
    const saved = await constrainKeywordSnapshot(
      db.from("minerador_keywords")
        .update({ status: entry.proposedStatus, ...(input.action === "approve" ? { analise_semantica: semantic } : {}) })
        .eq("id", row.id).eq("brand_id", input.brandId).is("deleted_at", null),
      row,
    )
      .select("id,status,analise_semantica").maybeSingle();
    if (saved.error) mapPersistenceError(saved.error);
    const readback = saved.data as { id?: unknown; status?: unknown; analise_semantica?: Record<string, unknown> | null } | null;
    const expectedApproval = input.action === "approve" ? readApprovalRecord(semantic) : null;
    const actualApproval = input.action === "approve" ? readApprovalRecord(readback?.analise_semantica) : null;
    const confirmed = readback?.id === row.id && readback.status === entry.proposedStatus
      && (input.action === "reject" || Boolean(expectedApproval && actualApproval
        && expectedApproval.contentHash === actualApproval.contentHash
        && expectedApproval.signature === actualApproval.signature
        && expectedApproval.approvedBy === input.actorId));
    results.push(confirmed ? { id: row.id, outcome: "applied" } : { id: row.id, outcome: "stale", reason: "compare_and_swap_or_readback_failed" });
  }
  return results;
}
