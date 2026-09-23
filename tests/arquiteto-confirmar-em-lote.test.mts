import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  planSiloDecisionBatch,
  chunkBatch,
  resolveSiloBatchOutcome,
  SILO_DECISION_CHUNK_SIZE,
  type BatchSiloDecision,
} from "../lib/arquiteto/silo-decision-batch.ts";
import { buildTerritorialLandscape } from "../lib/arquiteto/territorial-landscape.ts";
import type { SiloAssignmentKeyword } from "../lib/arquiteto/silo-assignment.ts";
import type { TerritoryCandidate } from "../lib/arquiteto/territory.ts";

/**
 * CONFIRMAR EM LOTE — as mesmas garantias, sem 200 idas e voltas.
 *
 * O Confirmar aplicava a membership uma keyword por vez, e cada uma recarregava
 * o workspace inteiro como releitura. Com listas de ~200 keywords isso vira
 * 200 gravações e 200 recargas do lote todo. Estes testes fixam que o lote
 * mantém o plano, o lock por item e a releitura como fonte da verdade.
 */

const BRAND = "brand-1";
const REF = "territory:11111111-1111-4111-8111-111111111111";
const NOW = "2026-09-23T12:00:00.000Z";

const territory = (territoryRef: string): TerritoryCandidate => ({
  schemaVersion: 1,
  territoryRef,
  brandId: BRAND,
  existingSiloRef: null,
  name: "Skincare",
  centralEntity: "skincare",
  macroIntent: "informacional",
  boundary: { includes: ["skincare"], excludes: [] },
  narrative: { statement: "Universo de skincare.", continuity: "coherent", brandAlignment: "aligned", rationale: ["Sustenta."] },
  discovery: { origin: "manual_strategic", evidence: [], detectedAt: NOW },
  territoryKind: "new",
  architecturalOrigin: "manual_strategic",
  ingestionOrigin: "ui",
  publicationProtection: "unpublished",
  lifecycleStatus: "candidate",
  decisionState: "pending",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFrom: null, mergedFrom: [], supersededBy: null },
  consolidation: null,
  conflicts: [],
  pendingOperation: null,
  reasons: [],
  provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
} as unknown as TerritoryCandidate);

const landscapeCom = (keywordIds: string[]) => buildTerritorialLandscape({
  brandId: BRAND,
  keywords: keywordIds.map(id => ({ id, brand_id: BRAND, keyword: `kw ${id}` })),
  territories: [territory(REF)],
  assignments: [],
});

const keywordBase = (keywordId: string, over: Partial<SiloAssignmentKeyword> = {}): SiloAssignmentKeyword => ({
  keywordId,
  brandId: BRAND,
  workflowItemId: `wf-${keywordId}`,
  expectedLock: 3,
  currentTerritoryRef: null,
  isPublished: false,
  ...over,
});

const planejar = (decisions: BatchSiloDecision[], keywordOf: (id: string) => SiloAssignmentKeyword | null = id => keywordBase(id)) =>
  planSiloDecisionBatch({
    brandId: BRAND,
    landscape: landscapeCom(decisions.map(item => item.keywordId)),
    keywordOf,
    decisions,
    decidedAt: NOW,
  });

test("200 keywords viram 8 requisições de 25, não 200 idas e voltas", () => {
  const ids = Array.from({ length: 200 }, (_, indice) => `kw-${indice}`);
  const plano = planejar(ids.map(keywordId => ({ keywordId, target: { kind: "territory", territoryRef: REF } })));

  assert.equal(plano.writes.length, 200);
  assert.equal(plano.refused.length, 0);
  const lotes = chunkBatch(plano.writes);
  assert.equal(SILO_DECISION_CHUNK_SIZE, 25);
  assert.equal(lotes.length, 8);
  assert.ok(lotes.every(lote => lote.length <= 25));
  // Nenhuma keyword se perde no fatiamento.
  assert.equal(lotes.flat().length, 200);
});

test("cada item leva o PRÓPRIO lock: o servidor recusa o vencido, nunca sobrescreve", () => {
  const plano = planejar(
    [{ keywordId: "kw-a", target: { kind: "territory", territoryRef: REF } }, { keywordId: "kw-b", target: { kind: "unassigned" } }],
    id => keywordBase(id, { expectedLock: id === "kw-a" ? 7 : 2 }),
  );
  assert.deepEqual(plano.writes.map(item => [item.keywordId, item.expectedLock]), [["kw-a", 7], ["kw-b", 2]]);
});

test("o que vai ao writer tem o mesmo formato do caminho individual", () => {
  const plano = planejar([{ keywordId: "kw-a", target: { kind: "territory", territoryRef: REF } }]);
  const escrita = plano.writes[0];
  assert.equal(escrita.workflowItemId, "wf-kw-a");
  assert.equal(escrita.assignment.territoryRef, REF);
  assert.ok(escrita.assignment.territoryAssignment, "a decisão territorial precisa ir junto");
});

test("já estar no destino é 'inalterada', não gravação nem falha", () => {
  const plano = planejar(
    [{ keywordId: "kw-a", target: { kind: "territory", territoryRef: REF } }],
    id => keywordBase(id, { currentTerritoryRef: REF }),
  );
  assert.deepEqual(plano.unchanged, ["kw-a"]);
  assert.equal(plano.writes.length, 0);
});

test("sem item de workflow canônico a keyword é recusada com motivo, antes de gravar", () => {
  const plano = planejar([{ keywordId: "kw-sem-item", target: { kind: "unassigned" } }], () => null);
  assert.equal(plano.writes.length, 0);
  assert.match(plano.refused[0]?.reason || "", /item de workflow canônico/);
});

test("keyword publicada continua protegida contra remanejo no lote", () => {
  const plano = planejar(
    [{ keywordId: "kw-publicada", target: { kind: "territory", territoryRef: REF } }],
    id => keywordBase(id, { isPublished: true }),
  );
  assert.equal(plano.writes.length, 0);
  assert.equal(plano.refused[0]?.keywordId, "kw-publicada");
});

test("a mesma keyword duas vezes no lote grava uma vez só", () => {
  /*
   * Duas gravações com o mesmo lock: a segunda falharia por lock vencido e
   * apareceria como falha falsa no resumo.
   */
  const plano = planejar([
    { keywordId: "kw-a", target: { kind: "territory", territoryRef: REF } },
    { keywordId: "kw-a", target: { kind: "territory", territoryRef: REF } },
  ]);
  assert.equal(plano.writes.length, 1);
});

test("o desfecho de cada keyword sai da RELEITURA, não do retorno da gravação", () => {
  /*
   * Um lote que falhou no meio pode ter gravado metade. A resposta da
   * gravação não diz qual metade; a releitura diz.
   */
  const plano = planejar([
    { keywordId: "kw-gravou", target: { kind: "territory", territoryRef: REF } },
    { keywordId: "kw-nao-gravou", target: { kind: "territory", territoryRef: REF } },
    { keywordId: "kw-solta", target: { kind: "unassigned" } },
  ]);
  const veredito = resolveSiloBatchOutcome({
    writes: plano.writes,
    readbackTerritoryRefByKeyword: new Map<string, string | null>([
      ["kw-gravou", REF],
      ["kw-nao-gravou", null],
      ["kw-solta", null],
    ]),
  });
  assert.deepEqual(veredito.applied.sort(), ["kw-gravou", "kw-solta"]);
  assert.deepEqual(veredito.refused, ["kw-nao-gravou"]);
});

test("keyword que não voltou na releitura não é anunciada como aplicada", () => {
  const plano = planejar([{ keywordId: "kw-sumiu", target: { kind: "territory", territoryRef: REF } }]);
  const veredito = resolveSiloBatchOutcome({ writes: plano.writes, readbackTerritoryRefByKeyword: new Map() });
  assert.deepEqual(veredito.applied, []);
  assert.deepEqual(veredito.refused, ["kw-sumiu"]);
});

/* ------------------------- a ligação no workspace ------------------------- */

const workspace = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
const semComentarios = (fonte: string) => fonte.split("\n").filter(linha => !/^\s*(\/\/|\*|\/\*)/.test(linha)).join("\n");

const corpoDe = (assinatura: string) => {
  const inicio = workspace.indexOf(assinatura);
  assert.ok(inicio >= 0, `${assinatura} não foi encontrado`);
  return semComentarios(workspace.slice(inicio, workspace.indexOf("\n  };\n", inicio)));
};

test("o Confirmar usa o lote, e não um await por keyword", () => {
  const corpo = corpoDe("const confirmArchitecture = async");
  assert.match(corpo, /applySiloDecisionsInBatch\(/);
  assert.equal(corpo.includes("await applySiloDecision("), false, "o Confirmar voltou a gravar uma keyword por vez");
});

test("o lote relê o workspace UMA vez, fora do laço de gravação", () => {
  const corpo = corpoDe("const applySiloDecisionsInBatch = async");
  const releituras = corpo.match(/loadCanonicalArquitetoWorkspace\(/g) || [];
  assert.equal(releituras.length, 1, "a releitura precisa ser única para o lote inteiro");
  // A releitura vem depois do laço de gravação.
  assert.ok(corpo.indexOf("loadCanonicalArquitetoWorkspace(") > corpo.indexOf("chunkBatch("));
});
