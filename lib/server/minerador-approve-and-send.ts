import "server-only";
import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/arquiteto/versioning";
import {
  applyApproveAndSend,
  previewApproveAndSend,
  type ApproveAndSendDeps,
} from "@/lib/minerador/approve-and-send-core";
import {
  applyKeywordDecisionEntries,
  keywordDecisionEntries,
  readDecisionKeywords,
  type DecisionKeywordRow,
  type KeywordDecisionEntry,
} from "./minerador-keyword-decision-core";
import { createMineradorArquitetoHandoff, previewMineradorArquitetoHandoff } from "./arquiteto-workspace";
import { resolvePipelineContext } from "./pipeline-runtime";

/**
 * O ENCADEAMENTO DE SERVIDOR "APROVAR → ENVIAR AO ARQUITETO" — UM SÓ (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 2).
 *
 * Extraído do follow-up da conversão do Assunto (`minerador-subject-conversion.ts`),
 * que passou a chamar estas mesmas funções, e generalizado para qualquer
 * keyword, com recusa por item. Aprovar = o núcleo do MCP `decide_keywords`
 * (`keywordDecisionEntries` + `applyKeywordDecisionEntries`: readiness,
 * `applyApproval`, compare-and-swap, releitura, ator autenticado). Enviar = o
 * handoff de sempre (`createMineradorArquitetoHandoff`) em modo parcial. Quem
 * chama já conferiu as permissões (`minerador:approve` e, para enviar,
 * `arquiteto:create`, que o contexto do pipeline confere de novo).
 */

/** Aprovar no servidor, devolvendo também as linhas lidas (nome da keyword para o desfecho). */
export async function approveKeywordsWithRowsOnServer(brandId: string, actorId: string, keywordIds: readonly string[]) {
  const { rows } = await readDecisionKeywords(brandId, keywordIds);
  const entries = keywordDecisionEntries(rows, "approve");
  const results = await applyKeywordDecisionEntries({ brandId, actorId, action: "approve", rows, entries });
  return { rows, results };
}

export async function approveKeywordsOnServer(brandId: string, actorId: string, keywordIds: readonly string[]) {
  return (await approveKeywordsWithRowsOnServer(brandId, actorId, keywordIds)).results;
}

async function arquitetoContext(brandId: string, actorId: string) {
  return resolvePipelineContext({ brandId, module: "arquiteto", action: "create" }, { requireActorUserId: async () => actorId });
}

export async function sendKeywordsToArquitetoOnServer(brandId: string, actorId: string, keywordIds: readonly string[]) {
  return createMineradorArquitetoHandoff(await arquitetoContext(brandId, actorId), keywordIds, { partial: true });
}

export function approveAndSendDeps(brandId: string, actorId: string): ApproveAndSendDeps<DecisionKeywordRow, KeywordDecisionEntry> {
  return {
    readRows: async ids => {
      const { rows } = await readDecisionKeywords(brandId, ids);
      const found = new Set(rows.map(row => row.id));
      return { rows, missingIds: [...new Set(ids)].filter(id => !found.has(id)) };
    },
    entries: rows => keywordDecisionEntries(rows, "approve"),
    approve: (rows, entries) => applyKeywordDecisionEntries({ brandId, actorId, action: "approve", rows, entries }),
    previewSend: async ids => {
      const preview = await previewMineradorArquitetoHandoff(await arquitetoContext(brandId, actorId), ids);
      return { eligibleKeywordIds: preview.eligibleKeywordIds, existingKeywordIds: preview.existingKeywordIds, refused: preview.refused };
    },
    send: ids => sendKeywordsToArquitetoOnServer(brandId, actorId, ids),
    hash: value => createHash("sha256").update(canonicalJson(value)).digest("hex"),
  };
}

export async function previewApproveAndSendOnServer(input: { brandId: string; actorId: string; keywordIds: readonly string[]; send: boolean }) {
  const { rows: _rows, entries: _entries, ...preview } = await previewApproveAndSend(input, approveAndSendDeps(input.brandId, input.actorId));
  void _rows; void _entries;
  return preview;
}

export async function applyApproveAndSendOnServer(input: { brandId: string; actorId: string; keywordIds: readonly string[]; send: boolean; decisionHash: string; excludedIds?: readonly string[] }) {
  return applyApproveAndSend(input, approveAndSendDeps(input.brandId, input.actorId));
}
