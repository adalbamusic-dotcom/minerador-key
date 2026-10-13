import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvalBlockerLabel, groupApprovalBlockers, summarizeApprovalBlockers } from "../lib/minerador/approval-blockers.ts";

/*
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 12
 * (F1): aprovar em lote diz TODOS os motivos, agrupados — não só o da primeira
 * keyword. O mesmo agrupamento serve à prévia do item 2.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");

test("item 12 · cada keyword entra em cada motivo que tem; o resumo conta por motivo", () => {
  const grupos = groupApprovalBlockers([
    { keyword: "a", missing: ["logic"] },
    { keyword: "b", missing: ["logic", "volume"] },
    { keyword: "c", missing: ["volume"] },
    { keyword: "d", missing: ["logic"] },
    { keyword: "e", reasons: ["publicada"] },
  ]);
  assert.equal(summarizeApprovalBlockers(grupos), "falta a Lógica: 3 · falta o Volume: 2 · publicada: 1");
  assert.deepEqual(grupos[0].keywords, ["a", "b", "d"]);
  assert.equal(approvalBlockerLabel("kgr"), "falta aplicabilidade do KGR");
});

test("item 12 · keyword repetida conta uma vez; sem motivo informado não some", () => {
  const grupos = groupApprovalBlockers([{ keyword: "a", missing: ["logic"] }, { keyword: "a", missing: ["logic"] }, { keyword: "z" }]);
  assert.equal(summarizeApprovalBlockers(grupos), "falta a Lógica: 1 · sem motivo informado: 1");
});

test("item 12 · os motivos do lote inteiro aparecem agrupados (desde a F2, na prévia do servidor)", () => {
  // F2 (item 2): a aprovação em lote saiu do navegador; o agrupamento vive na prévia do servidor e no diálogo.
  const nucleo = semComentarios(readFileSync("lib/minerador/approve-and-send-core.ts", "utf8"));
  assert.match(nucleo, /const blockedGroups = groupApprovalBlockers\(/);
  assert.match(nucleo, /blockedSummary: summarizeApprovalBlockers\(blockedGroups\)/);
  const dialogo = semComentarios(readFileSync("modules/minerador/approve-and-send-dialog.tsx", "utf8"));
  assert.match(dialogo, /\{preview\.blockedSummary\}/);
});
