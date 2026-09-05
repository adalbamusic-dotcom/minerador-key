import assert from "node:assert/strict";
import test from "node:test";
import { applyHumanReviewField, isHumanReviewConfirmationValid } from "../lib/minerador/human-review.ts";
import { resolveCanonicalKeywordSnapshot } from "../lib/minerador/canonical-keyword-snapshot.ts";
import { buildLogicalOutputContract, buildLogicalProcessorMetadata } from "../lib/minerador/logical-processor.ts";
import { buildSemanticReviewContext, semanticReviewInputHash } from "../lib/minerador/semantic-review.ts";

const completedAiReview = {
  schemaVersion: "r5",
  status: "completed",
  reviewStatus: "completed",
  overallVerdict: "CONCORDA",
  fieldReviews: [],
  semanticEnrichment: {},
};

function measuredSemantic(metadataInput?: { keywordId: string; keyword: string; location?: string | null; niche?: string | null }) {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Comercial investigativa",
    nicho: "Estética",
    funnel: "BOFU",
    volume_measurement: {
      provider: "google_ads",
      averageMonthlySearches: 260,
      rawVolume: 260,
      averageCpcMicros: 2_490_000,
      currencyCode: "BRL",
      targeting: { countryCode: "BR", languageCode: "pt" },
      measuredAt: "2026-08-20T10:00:00.000Z",
    },
    allintitle_measurement: {
      provider: "dataforseo",
      resultsAllintitle: 336,
      measuredAt: "2026-08-20T10:01:00.000Z",
      status: "success",
    },
    dataforseo_keyword_overview: {
      provider: "dataforseo",
      executor: "minerador_server",
      operationRequestId: "overview-1",
      keywordDifficulty: 0,
      externalIntent: "transactional",
    },
    kgr_aplicabilidade: "not_applicable",
    ai_review: completedAiReview,
    human_review: {
      schemaVersion: "r6",
      status: "completed",
      decision: "completed",
      fieldDecisions: [],
      kgrApplicability: "not_applicable",
      kgrDecisionReviewed: true,
    },
    dna_revisao_humana: "aprovado",
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: "Comercial investigativa", niche: "Estética", funnel: "BOFU" });
  if (metadataInput) {
    Object.assign(semantic, buildLogicalProcessorMetadata(metadataInput, "2026-08-20T09:59:00.000Z"));
    const inputHash = semanticReviewInputHash(buildSemanticReviewContext({
      keyword: metadataInput.keyword,
      intent: "Comercial investigativa",
      volume_search: 260,
      results_allintitle: 336,
      kgr_score: null,
      analise_semantica: semantic,
    }));
    semantic.ai_review = { ...completedAiReview, inputHash };
    semantic.human_review = { ...(semantic.human_review as Record<string, unknown>), aiInputHash: inputHash };
  }
  return semantic;
}

test("o snapshot canônico entrega o mesmo KGR para tabela, perfil, revisão e decisão", () => {
  const snapshot = resolveCanonicalKeywordSnapshot({
    id: "keyword-1",
    keyword: "manicure e pedicure a domicilio",
    intent: "Comercial investigativa",
    status: "aprovado",
    analise_semantica: measuredSemantic({ keywordId: "keyword-1", keyword: "manicure e pedicure a domicilio", location: null, niche: "Estética" }),
  });

  assert.equal(snapshot.metrics.volume.value, 260);
  assert.equal(snapshot.metrics.result.value, 336);
  assert.equal(snapshot.metrics.kgr.score, 1.2923);
  assert.equal(snapshot.metrics.kgr.applicability, "not_applicable");
  assert.equal(snapshot.metrics.cpc.sortValue, 2.49);
  assert.equal(snapshot.metrics.kd.value, 0);
  assert.equal(snapshot.semantic.intentLabel, "Comercial investigativa");
  assert.equal(snapshot.semantic.nicheLabel, "Estética");
  assert.equal(snapshot.semantic.funnelLabel, "BOFU");
  assert.equal(snapshot.semantic.externalIntentLabel, "Transacional");
  assert.equal(snapshot.humanReview.confirmationValid, true);
  assert.equal(snapshot.maturity, "CONFIRMADA");
});

test("campo estratégico sem evidência permanece não resolvido, mas a conclusão segue acionável", () => {
  const snapshot = resolveCanonicalKeywordSnapshot({
    id: "keyword-2",
    keyword: "termo ambíguo",
    status: "bruto",
    analise_semantica: {
      dna_origem: "logico_deterministico",
      ai_review: completedAiReview,
    },
  });

  assert.equal(snapshot.semantic.intentState, "unresolved");
  assert.equal(snapshot.semantic.nicheState, "unresolved");
  assert.equal(snapshot.semantic.funnelState, "unresolved");
  assert.equal(snapshot.humanReview.canComplete.ok, true);
  assert.deepEqual(snapshot.humanReview.canComplete.pendingFields, ["Intenção (confirmar desconhecido)", "Nicho (confirmar desconhecido)", "Funil (confirmar desconhecido)"]);
  assert.equal(snapshot.humanReview.confirmationValid, false);
});

test("indeterminado explicitamente confirmado é estado resolvido sem inventar valor", () => {
  const base = {
    dna_origem: "logico_deterministico",
    ai_review: completedAiReview,
  };
  const intent = applyHumanReviewField({ semantic: base, intent: null, field: "intent", logicalValue: null, aiSuggestion: null, decision: "keep_logic", actorId: "human-1", decidedAt: "2026-08-20T11:00:00.000Z" }).semantic;
  const niche = applyHumanReviewField({ semantic: intent, intent: null, field: "niche", logicalValue: null, aiSuggestion: null, decision: "keep_logic", actorId: "human-1", decidedAt: "2026-08-20T11:00:01.000Z" }).semantic;
  const resolved = applyHumanReviewField({ semantic: niche, intent: null, field: "funnel", logicalValue: null, aiSuggestion: null, decision: "keep_logic", actorId: "human-1", decidedAt: "2026-08-20T11:00:02.000Z" }).semantic;
  const snapshot = resolveCanonicalKeywordSnapshot({ intent: null, analise_semantica: resolved });

  assert.equal(snapshot.semantic.intentState, "confirmed_unknown");
  assert.equal(snapshot.semantic.nicheState, "confirmed_unknown");
  assert.equal(snapshot.semantic.funnelState, "confirmed_unknown");
  assert.equal(snapshot.semantic.funnel, null);
  assert.equal(snapshot.semantic.funnelLabel, "Indeterminado");
  assert.equal(snapshot.humanReview.canComplete.ok, true);
});

test("alteração posterior invalida a confirmação anterior e permite reabrir a revisão", () => {
  const original = measuredSemantic();
  const changed = applyHumanReviewField({
    semantic: original,
    intent: "Comercial investigativa",
    field: "nicho",
    logicalValue: "Estética",
    aiSuggestion: "Beleza",
    decision: "accept_ai",
    actorId: "human-2",
    decidedAt: "2026-08-20T11:10:00.000Z",
  }).semantic;

  assert.equal(changed.dna_revisao_humana, "pendente");
  assert.equal(isHumanReviewConfirmationValid(changed, "Comercial investigativa"), false);
  assert.equal((changed.human_review as { status: string }).status, "in_progress");
  assert.equal((changed.volume_measurement as { averageMonthlySearches: number }).averageMonthlySearches, 260);
});
