import "server-only";
import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/arquiteto/versioning";
import {
  applyApproveAndSend,
  approveAndSendErrorText,
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
import { principalSubjectStanding } from "@/lib/minerador/keyword-subject";
import { importDeclaredPlanWithCore } from "@/lib/minerador/declared-plan-import-core";
import { getOperationalClient } from "./editorial-db";
import { editorialGroupsClient } from "./editorial-groups";

/**
 * 2026-10-18 · O ASSUNTO PELO VOLUME 0 (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.2-b, F4). O
 * gravador é o MESMO núcleo do card (`importDeclaredPlanWithCore`, destino "Keyword (sem Silo)", origem "zero"), uma
 * keyword por vez, com compare-and-swap e releitura; quem chama já conferiu `minerador:approve`. O Volume só mede.
 */
export async function writeSubjectFromVolumeOnServer(brandId: string, actorId: string, rows: readonly DecisionKeywordRow[]) {
  const client = getOperationalClient();
  const out: Array<{ id: string; outcome: "declared" | "unchanged" | "failed"; reason: string | null }> = [];
  for (const row of rows) {
    // 2026-10-19 · erro de uma keyword não derruba as outras: vira "failed" com o motivo (o núcleo só grava com a releitura).
    let result: Awaited<ReturnType<typeof importDeclaredPlanWithCore>>;
    try {
      result = await importDeclaredPlanWithCore({
        brandId, actorUserId: actorId, keywordsClient: client, groupsClient: editorialGroupsClient(), mode: "apply",
        plan: { silo: null, articles: [{ order: 1, subject: "", principal: row.keyword, role: "Suporte", scope: "" }] },
        group: { mode: "new", name: null, color: "" },
        destination: { kind: "keyword", keywordId: row.id, basis: "zero" },
        importRequestId: crypto.randomUUID(),
      });
    } catch (error) {
      console.error("[approve-and-send:subject]", row.id, approveAndSendErrorText(error));
      out.push({ id: row.id, outcome: "failed", reason: `o banco recusou agora: ${approveAndSendErrorText(error)}` });
      continue;
    }
    if (!result.ok || result.mode !== "apply") { out.push({ id: row.id, outcome: "failed", reason: result.ok ? "A prévia não grava." : [result.reason, ...(result.blockers ?? [])].join(" ") }); continue; }
    const artigo = result.articles[0];
    out.push({ id: row.id, outcome: artigo?.outcome === "declared" ? "declared" : artigo?.outcome === "unchanged" ? "unchanged" : "failed", reason: artigo?.reason ?? null });
  }
  return out;
}

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
      return { eligibleKeywordIds: preview.eligibleKeywordIds, existingKeywordIds: preview.existingKeywordIds, refreshKeywordIds: preview.refreshKeywordIds, refused: preview.refused };
    },
    send: ids => sendKeywordsToArquitetoOnServer(brandId, actorId, ids),
    hash: value => createHash("sha256").update(canonicalJson(value)).digest("hex"),
    subjectByVolume: {
      standing: row => principalSubjectStanding({ volume_search: row.volume_search, volume_source: row.volume_source ?? null, analise_semantica: row.analise_semantica }, new Date()),
      write: rows => writeSubjectFromVolumeOnServer(brandId, actorId, rows),
    },
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
