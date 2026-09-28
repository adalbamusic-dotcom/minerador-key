import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  applyApproval,
  approvedPackageDiverged,
  resolveApprovalReadiness,
  resolveHandoffApprovalGate,
  SERVER_APPROVAL_GATE_SINCE,
} from "../lib/minerador/approved-package.ts";
import { buildDataForSeoKeywordMeasurementPatch } from "../lib/minerador/dataforseo-allintitle.ts";
import type { DataForSeoAllintitleMeasurement } from "../lib/minerador/dataforseo-serp-core.ts";
import { deriveDnaMaturity } from "../lib/minerador/dna-maturity.ts";
import { resolveCanonicalKeywordSnapshot } from "../lib/minerador/canonical-keyword-snapshot.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { buildLogicalOutputContract, buildLogicalProcessorMetadata } from "../lib/minerador/logical-processor.ts";
import {
  isInKgrInterestVolumeRange,
  KGR_INTEREST_VOLUME_RANGE,
  readKgrApplicability,
} from "../lib/minerador/kgr-applicability.ts";
import { deriveMineradorTableRows, type MineradorTableFilters } from "../lib/minerador/table-view.ts";

/**
 * SDD "SERP no artigo e KGR opcional" (2026-09-28), fatias M1 a M4 do
 * Minerador. A SERP (Resultados) sai da sequência e da trava; a keyword fica
 * pronta com Google Ads e Lógica; o KGR tem padrão "não aplicável"; nada do que
 * foi coletado é apagado. Tudo com fixtures: nenhuma chamada de provider.
 */

const INTENT = "Comercial investigativa";
const AFTER = "2026-09-28T15:00:00+00:00";

function comLogicaEVolume(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: INTENT,
    nicho: "Estética",
    funnel: "MOFU",
    ...buildLogicalProcessorMetadata({ keywordId: "kw-3", keyword: "sérum facial", location: null, niche: "Estética" }, "2026-09-28T09:00:00.000Z"),
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 320, measuredAt: "2026-09-28T10:00:00.000Z" },
    ...overrides,
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const measurement: DataForSeoAllintitleMeasurement = {
  keyword: "sérum facial",
  query: "allintitle:sérum facial",
  resultsAllintitle: 40,
  locationCode: 2076,
  languageCode: "pt",
  measuredAt: "2026-09-28T12:00:00.000Z",
  provider: "dataforseo",
  providerVersion: "v3",
  endpoint: "/v3/serp/google/organic/live/regular",
  providerRequestId: "task-1",
  cost: 0.003,
  checkUrl: null,
};

test("M1 · pronta para aprovar com Google Ads e Lógica, sem Resultados e sem decisão de KGR", () => {
  const readiness = resolveApprovalReadiness({ semantic: comLogicaEVolume(), intent: INTENT, volumeSearch: 320, resultsAllintitle: null });
  assert.deepEqual(readiness, { ok: true, missing: [], reason: null });
  // Com Resultados medidos e KGR calculável sem decisão, também não trava.
  const medida = comLogicaEVolume({ allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 40, measuredAt: "2026-09-28T11:00:00.000Z" } });
  assert.equal(resolveApprovalReadiness({ semantic: medida, intent: INTENT, volumeSearch: 320, resultsAllintitle: 40 }).ok, true);
  // Nunca emite "results" nem "kgr".
  const nada = resolveApprovalReadiness({ semantic: {}, volumeSearch: null, resultsAllintitle: null });
  assert.deepEqual(nada.missing, ["logic", "volume"]);
});

test("M1 · o gate de envio passa depois da ativação sem SERP; a data da ativação não mudou", async () => {
  assert.equal(SERVER_APPROVAL_GATE_SINCE, "2026-09-24T00:00:00-03:00");
  const semantic = comLogicaEVolume();
  const aprovada = await applyApproval({ keywordId: "kw-1", brandId: "brand-1", keyword: "sérum facial", intent: INTENT, volumeSearch: 320, resultsAllintitle: null, kgrScore: null, listaId: null, semantic, approvedAt: AFTER, approvedBy: "human-1" });
  const gate = resolveHandoffApprovalGate({ semantic: aprovada, intent: INTENT, volumeSearch: 320, resultsAllintitle: null });
  assert.equal(gate.verdict, "pass");
  assert.equal(gate.scope, "gated");
});

test("M1/M2 · aprovada com \"pending\" legado continua sem divergência: a assinatura cobre o dado bruto, não a leitura", async () => {
  const semantic = comLogicaEVolume({ kgr_aplicabilidade: "pending", kgr_decisao: "PENDENTE" });
  const input = { keywordId: "kw-2", brandId: "brand-1", keyword: "sérum facial", intent: INTENT, volumeSearch: 320, resultsAllintitle: null, kgrScore: null, listaId: null };
  const aprovada = await applyApproval({ ...input, semantic, approvedAt: AFTER, approvedBy: "human-1" });
  assert.equal(approvedPackageDiverged({ ...input, semantic: aprovada }), false);
  assert.equal(aprovada.kgr_aplicabilidade, "pending", "o valor legado segue gravado");
  const source = stripComments(readFileSync(new URL("../lib/minerador/approved-package.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /readKgrApplicability/, "a assinatura não pode depender do padrão de leitura do KGR");
});

test("M2 · nova medição grava o kgr_score com qualquer aplicabilidade (score é fato técnico)", () => {
  for (const kgr_aplicabilidade of [undefined, "pending", "not_applicable", "applicable"]) {
    const patch = buildDataForSeoKeywordMeasurementPatch({
      existing: { results_allintitle: null, volume_search: 320, kgr_score: 0.9, analise_semantica: kgr_aplicabilidade ? { kgr_aplicabilidade } : {} },
      measurement,
      operationRequestId: "10000000-0000-4000-8000-000000000099",
      targeting: { locationCode: 2076, languageCode: "pt" },
    });
    assert.equal(patch.kgr_score, 0.125, String(kgr_aplicabilidade));
    // A medição não escreve a aplicabilidade: decisão é humana.
    assert.equal(patch.analise_semantica.kgr_aplicabilidade, kgr_aplicabilidade);
  }
});

test("M2 · faixa de interesse 150–550 é informativa: não aplica o KGR nem trava", () => {
  assert.deepEqual(KGR_INTEREST_VOLUME_RANGE, { min: 150, max: 550 });
  assert.equal(isInKgrInterestVolumeRange(320), true);
  const semantic = comLogicaEVolume();
  assert.equal(readKgrApplicability(semantic), "not_applicable");
  assert.equal(resolveApprovalReadiness({ semantic, intent: INTENT, volumeSearch: 320 }).ok, true);
});

test("M3 · Resultados e KGR são processos opcionais e a maturidade fecha sem SERP", () => {
  const row = { id: "kw-3", keyword: "sérum facial", location: null, intent: INTENT, volume_search: 320, results_allintitle: null, analise_semantica: comLogicaEVolume() };
  const process = resolveMineradorProcessState(row);
  assert.equal(process.results.optional, true);
  assert.equal(process.kgr.optional, true);
  assert.equal(process.logic.optional, undefined);
  assert.equal(process.volume.optional, undefined);
  assert.equal(process.results.complete, false);
  assert.match(process.results.reason, /Opcional e pago/);
  const snapshot = resolveCanonicalKeywordSnapshot(row);
  assert.equal(snapshot.maturity, "COMPLETA PARA REVISÃO");
  assert.equal(snapshot.metrics.kgr.applicability, "not_applicable");
  assert.equal(snapshot.metrics.kgr.applicabilityLabel, "Não aplicável");
  assert.equal(deriveDnaMaturity({ logicalProcessed: true, googleAdsValid: true, dataForSeoValid: false, kgrTreated: false, humanConfirmed: false }), "COMPLETA PARA REVISÃO");
  assert.equal(deriveDnaMaturity({ logicalProcessed: true, googleAdsValid: false, dataForSeoValid: true, kgrTreated: true, humanConfirmed: true }), "PARCIAL");
  assert.equal(deriveDnaMaturity({ logicalProcessed: false, googleAdsValid: true, dataForSeoValid: true, kgrTreated: true, humanConfirmed: true }), "INSUFICIENTE");
});

test("M3 · resposta do Google Ads sem média conta como Volume processado na maturidade", () => {
  const semantic = comLogicaEVolume({
    volume_measurement: undefined,
    volume_eligibility: { status: "unavailable", provider: "google_ads", checkedAt: "2026-09-28T10:00:00.000Z", measuredAt: "2026-09-28T10:00:00.000Z" },
  });
  const readiness = resolveApprovalReadiness({ semantic, intent: INTENT, volumeSearch: null, resultsAllintitle: null });
  const snapshot = resolveCanonicalKeywordSnapshot({ id: "kw-3", keyword: "sérum facial", intent: INTENT, volume_search: null, results_allintitle: null, analise_semantica: semantic });
  // A maturidade segue a mesma regra de Volume processado da trava de aprovação.
  assert.equal(readiness.ok, true);
  assert.equal(snapshot.maturity, "COMPLETA PARA REVISÃO");
});

test("M2 · o filtro \"Pendente\" mostra só o valor legado gravado", () => {
  const rows = [
    { id: "legado", keyword: "a", intent: INTENT, status: "bruto", volume_search: 200, results_allintitle: null, kgr_score: null, lista_id: null, analise_semantica: { kgr_aplicabilidade: "pending" } },
    { id: "padrao", keyword: "b", intent: INTENT, status: "bruto", volume_search: 200, results_allintitle: null, kgr_score: null, lista_id: null, analise_semantica: {} },
    { id: "aplicavel", keyword: "c", intent: INTENT, status: "bruto", volume_search: 200, results_allintitle: null, kgr_score: null, lista_id: null, analise_semantica: { kgr_aplicabilidade: "applicable", kgr_decisao_origem: "human" } },
  ];
  const base: MineradorTableFilters = { status: "Todos", intent: "Todos", listId: "Todos", siteRelation: "Todos", siteArchitecture: "Todos", sitePublication: "Todos", kgrApplicability: "Todos", kgrMeasurement: "Todos", searchQuery: "", sortColumn: "keyword", sortDirection: "asc" };
  const ids = (kgrApplicability: string) => deriveMineradorTableRows(rows.map(row => ({ ...row, location: null })), [], { ...base, kgrApplicability }).map(row => row.id);
  assert.deepEqual(ids("pending"), ["legado"]);
  assert.deepEqual(ids("not_applicable").sort(), ["legado", "padrao"]);
  assert.deepEqual(ids("applicable"), ["aplicavel"]);
});

test("M4 · tela: Resultados é ação manual opcional e paga; KGR sem \"Pendente\" como escolha", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  assert.match(workspace, /title="Medir concorrência orgânica \(opcional · pago\)"/);
  assert.match(workspace, /não é exigida para aprovar nem para enviar ao Arquiteto/);
  assert.match(workspace, /US\$ 0,025 a 0,036 por keyword \(estimativa\)/);
  assert.doesNotMatch(workspace, /<option value="pending">Pendente<\/option>/);
  assert.equal((workspace.match(/<option value="pending" disabled>Pendente \(legado\)<\/option>/g) || []).length, 1);
  assert.doesNotMatch(panels, /<option value="pending">Pendente<\/option>/);
  assert.match(panels, /<option value="pending" disabled>Pendente \(legado\)<\/option>/);
  assert.match(panels, /Opcional: o padrão é não aplicável e aplicar é escolha sua\./);
  assert.match(panels, /optionalIdle/);
  assert.doesNotMatch(panels, /Execute o processo Resultados/);
  // Export CSV: valor efetivo e bytes do trecho com mojibake preservados.
  assert.match(workspace, /"KGR Aplicabilidade": canonicalSnapshot\.metrics\.kgr\.applicability,/);
  assert.ok(workspace.includes("\"IntenÃ§Ã£o\": canonicalSnapshot.semantic.intentLabel"));
});

/* ---------- correção · Resultados fora da sequência, com plano de custo ---------- */

test("correção · Resultados só coleta keyword com volume e descreve o custo antes de pagar", async () => {
  const { planMineradorResultsBatch, describeMineradorResultsBatchPlan, MINERADOR_RESULTS_COST_PER_KEYWORD_USD } = await import("../lib/minerador/results-batch-plan.ts");
  const plano = planMineradorResultsBatch([
    { id: "com", volume_search: 320 },
    { id: "zero", volume_search: 0 },
    { id: "nulo", volume_search: null },
    { id: "nao-medido" },
    { id: "com-2", volume_search: 90 },
  ]);
  assert.deepEqual(plano.targetIds, ["com", "com-2"]);
  assert.deepEqual(plano.withoutVolumeIds, ["zero", "nulo", "nao-medido"]);
  assert.deepEqual(plano.estimatedCostUsd, { min: 2 * MINERADOR_RESULTS_COST_PER_KEYWORD_USD.min, max: 2 * MINERADOR_RESULTS_COST_PER_KEYWORD_USD.max });
  const texto = describeMineradorResultsBatchPlan(plano);
  assert.match(texto, /Resultados \(opcional · pago\): 2 keyword\(s\) com volume/);
  assert.match(texto, /US\$ 0,05 a US\$ 0,07/);
  assert.match(texto, /3 keyword\(s\) sem volume no Google Ads ficam fora/);
  assert.match(texto, /Confirmar a chamada paga\?/);
});

test("correção · a barra tira Resultados da sequência e o clique confirma o plano antes do primeiro bloco", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const barra = workspace.slice(workspace.indexOf("{/* FOOTER BATCH ACTIONS BAR */}"));
  const core = barra.slice(barra.indexOf("data-bulk-workflow-core"), barra.indexOf("data-bulk-workflow-secondary"));
  assert.ok(!core.includes("handleBatchAllintitle"), "Resultados não é passo da sequência");
  assert.match(barra, /label="Resultados \(opcional · pago\)"/);
  const handler = workspace.slice(workspace.indexOf("const handleBatchAllintitle = async"), workspace.indexOf("const handleBatchQualify = async"));
  const confirmar = handler.indexOf("window.confirm(describeMineradorResultsBatchPlan(plano))");
  assert.ok(confirmar > 0, "o plano de custo é confirmado");
  assert.ok(confirmar < handler.indexOf("startBulkProgress(\"results\""), "confirma antes de iniciar o lote");
  assert.ok(confirmar < handler.indexOf("await fetch("), "confirma antes de qualquer chamada paga");
  assert.match(handler, /const keywordIds = plano\.targetIds;/);
  assert.doesNotMatch(workspace, /Exige a Aplicabilidade do KGR decidida/);
});
