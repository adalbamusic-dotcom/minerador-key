import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateMineradorArquitetoHandoff,
  evaluateMineradorArquitetoHandoffBatch,
} from "../lib/minerador/arquiteto-handoff-gates.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import type { KeywordSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";

const validAiReview = {
  schemaVersion: "r5",
  status: "completed",
  reviewStatus: "completed",
  overallVerdict: "CONCORDA",
  fieldReviews: [],
  semanticEnrichment: {},
};

const validSemantic: Record<string, unknown> = {
  dna_origem: "logico_deterministico",
  intencao_principal: "Comercial investigativa",
  nicho: "Marketing",
  funnel: "MOFU",
  volume_measurement: {
    provider: "google_ads",
    averageMonthlySearches: 90,
    measuredAt: "2026-08-18T12:00:00.000Z",
  },
  allintitle_measurement: {
    provider: "dataforseo",
    status: "success",
    resultsAllintitle: 336,
    measuredAt: "2026-08-18T12:05:00.000Z",
  },
  ai_review: validAiReview,
  human_review: {
    status: "completed",
    kgrDecisionReviewed: true,
  },
  dna_revisao_humana: "aprovado",
};

/** Qualificação Semântica persistida e conclusiva (ver minerador-serp-canonical-gate). */
const persistedQualification: KeywordSemanticQualification = {
  schemaVersion: "v1",
  id: "keyword_semantic_qualification:brand-1:kw-1:v1",
  brandId: "brand-1",
  keywordId: "kw-1",
  source: { provider: "dataforseo", operationRequestId: "11111111-1111-4111-8111-111111111111", providerRequestId: "task-1", collectedAt: "2026-08-18T12:06:00.000Z" },
  query: { keyword: "ferramenta de seo", locationCode: 2076, languageCode: "pt", device: "desktop" },
  evidence: { observedResults: 8, serpFeatures: [], sample: [], evidenceHash: "sha256:fixture" },
  intent: { observedValue: "Comercial investigativa", strength: "conclusive", supporting: 6, observed: 8, classified: 8, coverage: 1, dominance: 0.75, distribution: [], structuralSignals: [] },
  funnel: { observedValue: "MOFU", strength: "conclusive", supporting: 6, observed: 8, classified: 8, coverage: 1, dominance: 0.75, distribution: [], structuralSignals: [] },
  derivation: { derivationVersion: "serp-semantic-derivation-v1", thresholdsVersion: "provisional-heuristic-2026-08-28", thresholdsStatus: "provisional_heuristic" },
  lifecycle: { version: 1, contentHash: "sha256:fixture", createdAt: "2026-08-18T12:06:00.000Z", createdBy: "user-1", supersedesVersionId: null },
};

validSemantic.logical_output_contract = buildLogicalOutputContract({
  semantic: validSemantic,
  intent: "Comercial investigativa",
  niche: "Marketing",
  funnel: "MOFU",
});

function keyword(semantic: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: "kw-1",
    brand_id: "brand-1",
    status: "aprovado",
    volume_search: 90,
    results_allintitle: 336,
    analise_semantica: { ...validSemantic, ...semantic },
    ...overrides,
  };
}

test("keyword apenas importada é enviável: processo pendente é informação, não veto", () => {
  const gate = evaluateMineradorArquitetoHandoff({
    id: "kw-importada",
    brand_id: "brand-1",
    status: "aprovado",
    volume_search: 90,
    results_allintitle: 336,
    analise_semantica: {
      dna_origem: "logico_deterministico",
      intencao_principal: "Comercial investigativa",
      nicho: "Marketing",
      funnel: "MOFU",
      logical_output_contract: buildLogicalOutputContract({
        semantic: { intencao_principal: "Comercial investigativa", nicho: "Marketing", funnel: "MOFU" },
        intent: "Comercial investigativa",
        niche: "Marketing",
        funnel: "MOFU",
      }),
      discovery_import: {
        source: "google_ads_discovery",
        lastMeasurement: {
          volume: 90,
          resultsAllintitle: 336,
          volumeMeasuredAt: "2026-08-18T10:00:00.000Z",
          resultsMeasuredAt: "2026-08-18T10:01:00.000Z",
        },
      },
    },
  }, "brand-1");

  // Estado de processo é informação: a importação sem revalidação aparece no
  // read-model, mas não veta o envio de uma keyword que o humano aprovou.
  assert.equal(gate.volumeValidated, false);
  assert.equal(gate.resultsValidated, false);
  assert.equal(gate.ok, true);
  assert.equal(gate.reason, undefined);
});

test("keyword revisada e aprovada libera o handoff canônico", () => {
  const gate = evaluateMineradorArquitetoHandoff(keyword(), "brand-1", persistedQualification);

  assert.equal(gate.ok, true);
  assert.equal(gate.logicProcessed, true);
  assert.equal(gate.volumeValidated, true);
  assert.equal(gate.resultsValidated, true);
  assert.equal(gate.kgrReady, true);
  assert.equal(gate.aiCompleted, true);
  assert.equal(gate.humanReviewCompleted, true);
  assert.equal(gate.serpEvidencePersisted, true);
  assert.equal(gate.statusAllowed, true);
});

test("sem evidência SERP persistida o handoff segue disponível", () => {
  const semantic = { ...validSemantic };
  const gate = evaluateMineradorArquitetoHandoff({
    id: "kw-sem-serp",
    brand_id: "brand-1",
    status: "aprovado",
    volume_search: 90,
    results_allintitle: 336,
    analise_semantica: semantic,
  }, "brand-1");

  assert.equal(gate.humanReviewCompleted, true);
  assert.equal(gate.serpEvidencePersisted, false);
  assert.equal(gate.ok, true, "SERP ausente não é impedimento de envio");
  assert.equal(gate.reason, undefined);
});

test("KGR não aplicável ou desfavorável não bloqueia uma keyword aprovada pelo humano", () => {
  const notApplicable = evaluateMineradorArquitetoHandoff(keyword({
    kgr_aplicabilidade: "not_applicable",
  }), "brand-1", persistedQualification);
  const unfavorableScore = evaluateMineradorArquitetoHandoff(keyword({
    kgr_aplicabilidade: "applicable",
    kgr_score: 99,
  }), "brand-1", persistedQualification);

  assert.equal(notApplicable.ok, true);
  assert.equal(unfavorableScore.ok, true);
});

test("status incompatível e Brand diferente continuam bloqueados no preflight", () => {
  const wrongStatus = evaluateMineradorArquitetoHandoff(keyword({}, { status: "bruto" }), "brand-1", persistedQualification);
  const wrongBrand = evaluateMineradorArquitetoHandoff(keyword(), "brand-2", persistedQualification);

  assert.equal(wrongStatus.ok, false);
  assert.equal(wrongStatus.statusAllowed, false);
  assert.match(wrongStatus.reason || "", /status/i);
  assert.equal(wrongBrand.ok, false);
  assert.match(wrongBrand.reason || "", /Brand ativa/);
});

test("uma seleção mista permanece bloqueada sem esconder o motivo", () => {
  const gate = evaluateMineradorArquitetoHandoffBatch({
    brandId: "brand-1",
    keywords: [
      keyword(),
      keyword({}, { id: "kw-2", status: "bruto" }),
    ],
    qualifications: { "kw-1": persistedQualification, "kw-2": persistedQualification },
  });

  assert.equal(gate.ok, false);
  assert.equal(gate.evaluations.length, 2);
  assert.equal(gate.blocked.length, 1);
  assert.match(gate.reason, /status/i);
});

test("o menu secundário expõe apenas o handoff canônico, sem a ação semântica legada", async () => {
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const menuStart = workspace.indexOf('id="minerador-more-actions-menu"');
  const menuEnd = workspace.indexOf("{/* Excluir */}", menuStart);
  const primaryBar = workspace.slice(workspace.indexOf("FOOTER BATCH ACTIONS BAR"), menuStart);
  const menu = workspace.slice(menuStart, menuEnd);

  assert.ok(menuStart >= 0, "menu secundário deve existir");
  assert.ok(menuEnd > menuStart, "limite do menu secundário deve existir");
  assert.match(menu, /Mover para Silo/);
  assert.doesNotMatch(menu, /Marcar como publicado/);
  assert.match(menu, /Enviar ao Arquiteto/);
  assert.match(menu, /handleBatchSendToArchitect/);
  assert.match(menu, /architectHandoffGate\.ok/);
  assert.doesNotMatch(menu, /Análise semântica legada/);
  assert.doesNotMatch(menu, /\/api\/analyze/);
  assert.doesNotMatch(primaryBar, /Enviar ao Arquiteto/);

  // O código legado permanece por compatibilidade, mas já não é uma ação visível do menu.
  assert.match(workspace, /const handleBatchAnalyze = async/);
  assert.match(workspace, /fetch\("\/api\/analyze"/);
  assert.match(workspace, /persistMineradorArquitetoHandoff/);
});
