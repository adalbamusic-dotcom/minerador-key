import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalServiceClient } from "./canonical-authorization";
import { getOperationalClient } from "./editorial-db";
import { runKeywordLogicWithCore } from "./minerador-keyword-decision-core";
import {
  SUBJECT_SEARCH_RECEIPT_COLUMNS,
  SUBJECT_SEARCH_RECEIPT_TABLE,
  isSubjectSearchReceiptTableMissing,
  readSubjectSearchReceiptRow,
  subjectSearchReceiptInsertRow,
  subjectSearchVolumeDecision,
  type SubjectSearchReceipt,
  type SubjectSearchReceiptDraft,
  type SubjectSearchReceiptOutcome,
} from "@/lib/minerador/subject-search-receipt";
import type { SubjectDiscoveryImportLogicPort, SubjectDiscoveryImportVolumePort } from "@/lib/minerador/subject-discovery-import";

/**
 * RECIBOS DA PESQUISA POR ASSUNTO NO SERVIDOR (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, itens 7 e 8;
 * migration M-A `20261014120000_recibos_da_pesquisa_por_assunto.sql`).
 *
 * - `recordSubjectSearchReceipt`: a execução da pesquisa (tela e MCP, pelas
 *   MESMAS portas de `subject-discovery-runtime.ts`) inclui o recibo com o
 *   service_role. A marca é a da rota; o ator, o autenticado. Só INSERT.
 * - `subjectDiscoveryImportPorts`: o import (rota e MCP) lê o recibo pela marca
 *   da rota e pelo `searchId`, e recebe a porta do Volume e a porta da Lógica
 *   (`runKeywordLogicWithCore`, o MESMO núcleo do MCP `run_keyword_logic`).
 *
 * Sem a tabela (M-A ainda não aplicada: `42P01`/`PGRST205`), nada quebra: a
 * pesquisa responde com `receipt.status = "unavailable"` e o import entra sem
 * volume, como antes. Nenhuma chamada a provider aqui.
 */

type Client = SupabaseClient | ReturnType<typeof getOperationalClient>;

function safeCode(error: unknown, fallback: string) {
  const value = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return /^[A-Za-z0-9_.-]{1,40}$/.test(value) ? value : fallback;
}

export async function recordSubjectSearchReceipt(input: {
  brandId: string;
  actorId: string;
  draft: SubjectSearchReceiptDraft;
  client?: Client;
}): Promise<SubjectSearchReceiptOutcome> {
  const receipt: SubjectSearchReceipt = { ...input.draft, brandId: input.brandId, actorId: input.actorId, candidateCount: Object.keys(input.draft.candidates).length };
  try {
    const client = input.client ?? createCanonicalServiceClient();
    const { error } = await client.from(SUBJECT_SEARCH_RECEIPT_TABLE).insert(subjectSearchReceiptInsertRow(receipt));
    if (!error) return { status: "recorded" };
    if (isSubjectSearchReceiptTableMissing(error)) return { status: "unavailable", reason: "receipts_table_missing" };
    // A mesma operação repetida: o primeiro recibo vale (só inclusões).
    if (safeCode(error, "") === "23505") return { status: "recorded" };
    return { status: "failed", reason: safeCode(error, "SUBJECT_SEARCH_RECEIPT_INSERT_FAILED") };
  } catch (error) {
    if (isSubjectSearchReceiptTableMissing(error)) return { status: "unavailable", reason: "receipts_table_missing" };
    return { status: "failed", reason: safeCode(error, "SUBJECT_SEARCH_RECEIPT_FAILED") };
  }
}

export type SubjectSearchReceiptRead =
  | { status: "found"; receipt: SubjectSearchReceipt }
  | { status: "not_found" | "unavailable" | "failed" };

/** Lê o recibo DESTA marca. Recibo de outra marca não é encontrado (mesma resposta de inexistente). */
export async function readSubjectSearchReceipt(input: { brandId: string; operationRequestId: string; client?: Client }): Promise<SubjectSearchReceiptRead> {
  try {
    const client = input.client ?? createCanonicalServiceClient();
    const { data, error } = await client
      .from(SUBJECT_SEARCH_RECEIPT_TABLE)
      .select(SUBJECT_SEARCH_RECEIPT_COLUMNS)
      .eq("marca_id", input.brandId)
      .eq("operation_request_id", input.operationRequestId)
      .maybeSingle();
    if (error) return { status: isSubjectSearchReceiptTableMissing(error) ? "unavailable" : "failed" };
    const receipt = readSubjectSearchReceiptRow(data);
    if (!receipt || receipt.brandId !== input.brandId || receipt.operationRequestId !== input.operationRequestId) return { status: "not_found" };
    return { status: "found", receipt };
  } catch (error) {
    return { status: isSubjectSearchReceiptTableMissing(error) ? "unavailable" : "failed" };
  }
}

/**
 * F3 · LER ANTES DE BUSCAR (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 3, regra 8): as pesquisas anteriores do MESMO Assunto (pela keyword do
 * Assunto, ou pela frase quando não há keyword), mais novas primeiro, em
 * colunas estreitas (nunca as candidatas). Só leitura; tabela ausente ou falha
 * = lista vazia (a prévia segue como antes).
 */
export async function listPreviousSubjectSearches(input: { brandId: string; subjectKeywordId: string | null; phrase: string; limit?: number; client?: Client }): Promise<Array<{ operationRequestId: string; executedAt: string; candidateCount: number; phrase: string }>> {
  try {
    const client = input.client ?? createCanonicalServiceClient();
    const base = client
      .from(SUBJECT_SEARCH_RECEIPT_TABLE)
      .select("operation_request_id,executed_at,candidate_count,phrase")
      .eq("marca_id", input.brandId);
    const filtrada = input.subjectKeywordId ? base.eq("subject_keyword_id", input.subjectKeywordId) : base.eq("phrase", input.phrase);
    const { data, error } = await filtrada.order("executed_at", { ascending: false }).limit(Math.max(1, Math.min(10, input.limit ?? 5)));
    if (error || !Array.isArray(data)) return [];
    return (data as Array<Record<string, unknown>>).flatMap(row => typeof row.operation_request_id === "string" && typeof row.executed_at === "string"
      ? [{ operationRequestId: row.operation_request_id, executedAt: row.executed_at, candidateCount: typeof row.candidate_count === "number" ? row.candidate_count : 0, phrase: typeof row.phrase === "string" ? row.phrase : input.phrase }]
      : []);
  } catch {
    return [];
  }
}

/** A porta do Volume a partir da leitura do recibo. Sem recibo, `decide` nunca é chamado pelo núcleo. */
export function subjectSearchVolumePort(read: SubjectSearchReceiptRead): SubjectDiscoveryImportVolumePort {
  const receipt = read.status === "found" ? read.receipt : null;
  return {
    receipt: read.status,
    decide: (normalizedKeyword, existing) => receipt
      ? subjectSearchVolumeDecision(receipt, normalizedKeyword, existing)
      : { ok: false, code: "no_receipt", reason: "Sem recibo da pesquisa: o Volume é medido pelo botão \"Volume\"." },
    verified: normalizedKeyword => Boolean(receipt && receipt.candidates[normalizedKeyword]),
  };
}

/**
 * As portas do import (rota e MCP): o Volume do recibo e a Lógica. `db` é o
 * cliente com que o import escreve (a rota usa o da sessão; o MCP, o
 * operacional), para a Lógica gravar pelo mesmo caminho.
 */
export async function subjectDiscoveryImportPorts(input: { brandId: string; searchId: string; db: Client }): Promise<{ volume: SubjectDiscoveryImportVolumePort; runLogic: SubjectDiscoveryImportLogicPort }> {
  const read = await readSubjectSearchReceipt({ brandId: input.brandId, operationRequestId: input.searchId });
  return {
    volume: subjectSearchVolumePort(read),
    runLogic: async keywordIds => {
      const result = await runKeywordLogicWithCore({ brandId: input.brandId, keywordIds, db: input.db });
      return { applied: result.applied, unchanged: result.unchanged, failed: result.failed };
    },
  };
}
