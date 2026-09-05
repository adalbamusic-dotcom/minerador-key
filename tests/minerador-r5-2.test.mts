import assert from "node:assert/strict";
import test from "node:test";
import { runKeywordSemanticReview } from "../lib/minerador/semantic-review-orchestrator.ts";
import type { SemanticReviewContext } from "../lib/minerador/semantic-review.ts";

const context: SemanticReviewContext = {
  keyword: "campanha de trafego pago",
  logical: { processed: true, dnaOrigin: "logico_deterministico", fields: { intent: "Comercial investigativa", niche: "Marketing" } },
  googleAds: {
    valid: true, validationState: "validated", source: "processor", volume: 90, history: [], trend: "estável",
    measurement: { averageMonthlySearches: 90, competitionIndex: 42 }, eligibility: "eligible", measuredAt: "2026-08-19T00:00:00.000Z", targeting: { countryCode: "BR" },
  },
  dataForSeo: {
    valid: true, validationState: "validated", source: "processor", allintitle: 336, keywordDifficulty: 42,
    measurement: { resultsAllintitle: 336, overview: { keywordDifficulty: 42 } }, query: "allintitle:campanha", measuredAt: "2026-08-19T00:01:00.000Z", targeting: { countryCode: "BR" },
  },
  kgr: {
    volumeUsed: 90, allintitleUsed: 336, score: 3.733, persistedScore: 3.733, calculable: true, calculationState: "calculable",
    inputSource: "processor", applicability: "applicable", applicabilityLabel: "Aplicável", decision: "Pendente", treated: true,
  },
  evidenceReferences: { logical: [], googleAds: [], dataForSeo: [], kgr: [] },
};

const phase1 = { agreementFields: ["intent"], divergences: [], semanticEnrichments: [], remainingAmbiguities: null };
const phase2 = { supportingEvidence: ["volume"], contradictingEvidence: [], quantitativeWarnings: [], opportunitySignals: [], insufficientEvidence: [] };
const phase3 = { reviewStatus: "completed", overallVerdict: "CONCORDA", divergences: [], enrichments: [], remainingAmbiguities: null, humanReviewNotes: [] };
const invalidPhase3SchemaShape = {
  reviewStatus: "completed",
  overallVerdict: "DIVERGE",
  divergences: [{ suggestion: { value: "Comercial investigativa" }, evidenceUsed: ["phase1"] }],
  enrichments: ["Necessidade implícita"],
  remainingAmbiguities: [],
  humanReviewNotes: [],
};
const repairedPhase3 = {
  reviewStatus: "completed",
  overallVerdict: "DIVERGE",
  divergences: [{ field: "intent", suggestion: "Informativa", rationale: "A síntese mantém a divergência semântica.", evidenceUsed: ["campanha de trafego pago"] }],
  enrichments: [{ type: "searchNeed", value: "Comparar alternativas.", rationale: "A sugestão é útil para a revisão humana." }],
  remainingAmbiguities: [],
  humanReviewNotes: [],
};
const nearLimitPhase1 = {
  agreementFields: Array.from({ length: 30 }, (_, index) => `field_${index}`),
  divergences: Array.from({ length: 3 }, (_, index) => ({
    field: `field_${index}`,
    suggestion: "sugestão curta",
    rationale: "x".repeat(160),
    evidenceUsed: ["logical.fields.keyword", "logical.fields.intent"],
  })),
  semanticEnrichments: Array.from({ length: 3 }, (_, index) => ({
    type: `enrichment_${index}`,
    value: "enriquecimento curto",
    rationale: "x".repeat(160),
  })),
  remainingAmbiguities: ["x".repeat(160), "y".repeat(160), "z".repeat(160)],
};

function response(payload: unknown, finishReason = "stop") {
  return new Response(JSON.stringify({
    id: "deepseek-r5-phase",
    model: "deepseek-v4-pro",
    choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("R5.2 preserva as três fases e usa somente DeepSeek com budgets suficientes", async () => {
  const outputs = [phase1, phase2, phase3];
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let index = 0;
  const result = await runKeywordSemanticReview({
    context,
    provider: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "fixture-secret",
      model: "deepseek-v4-pro",
      thinkingMode: "disabled",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return response(outputs[index++]);
      },
    },
  });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.body.max_tokens), [1100, 1100, 600]);
  assert.deepEqual(calls.map((call) => call.body.response_format), [{ type: "json_object" }, { type: "json_object" }, { type: "json_object" }]);
  assert.deepEqual(calls.map((call) => call.body.thinking), [{ type: "disabled" }, { type: "disabled" }, { type: "disabled" }]);
  const phase1Messages = calls[0]?.body.messages as Array<{ role?: string; content?: string }>;
  assert.match(phase1Messages?.[0]?.content || "", /"evidenceUsed": \[\"logical\.fields\.intent\"/);
  assert.match(phase1Messages?.[0]?.content || "", /array não vazio de strings curtas/);
  assert.doesNotMatch(phase1Messages?.[1]?.content || "", /90|336|CPC|KGR|KD|Google Ads|DataForSEO/);
  const phase3Messages = calls[2]?.body.messages as Array<{ role?: string; content?: string }>;
  assert.match(phase3Messages?.[0]?.content || "", /divergences deve ser um array de objetos/);
  assert.match(phase3Messages?.[0]?.content || "", /field.*suggestion.*rationale.*evidenceUsed/);
  assert.match(phase3Messages?.[0]?.content || "", /enrichments deve ser um array de objetos, nunca array de strings/);
  assert.match(phase3Messages?.[0]?.content || "", /\"type\":\"searchNeed\"/);
  assert.equal(calls.every((call) => call.url === "https://api.deepseek.com/chat/completions"), true);
  assert.equal(result.output.overallVerdict, "CONCORDA");
  assert.deepEqual(result.humanReviewNotes, []);
  assert.equal(result.phaseDiagnostics.every((diagnostic) => diagnostic.provider === "deepseek"), true);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.requestedMaxTokens), [1100, 1100, 600]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.reasoningMode), ["disabled", "disabled", "disabled"]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.thinkingExplicitlyConfigured), [true, true, true]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.reasoningEffort), [null, null, null]);
});

test("R5 mantém dez execuções determinísticas sem chamadas extras ou falso sucesso", async () => {
  for (let execution = 0; execution < 10; execution += 1) {
    let index = 0;
    let calls = 0;
    const result = await runKeywordSemanticReview({
      context,
      provider: {
        apiUrl: "https://api.deepseek.com/chat/completions",
        apiKey: "fixture-secret",
        model: "deepseek-v4-pro",
        fetchImpl: async () => {
          calls += 1;
          return response([phase1, phase2, phase3][index++]);
        },
      },
    });
    assert.equal(calls, 3);
    assert.equal(result.output.reviewStatus, "completed");
    assert.equal(result.output.overallVerdict, "CONCORDA");
  }
});

test("R5 aceita Phase 1 no limite compacto sem expandir a responsabilidade da fase", async () => {
  const outputs = [nearLimitPhase1, phase2, phase3];
  let index = 0;
  const result = await runKeywordSemanticReview({
    context,
    provider: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "fixture-secret",
      model: "deepseek-v4-pro",
      fetchImpl: async () => response(outputs[index++]),
    },
  });
  assert.equal(result.output.overallVerdict, "CONCORDA");
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.requestedMaxTokens), [1100, 1100, 600]);
});

test("R5.2 força thinking disabled nas três fases, mesmo quando a Connection informa default", async () => {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  let index = 0;
  const outputs = [phase1, phase2, phase3];
  const result = await runKeywordSemanticReview({
    context,
    provider: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "fixture-secret",
      model: "deepseek-v4-pro",
      thinkingMode: "provider_default",
      fetchImpl: async (_url, init) => {
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return response(outputs[index++]);
      },
    },
  });
  assert.deepEqual(calls.map((call) => call.body.max_tokens), [1100, 1100, 600]);
  assert.deepEqual(calls.map((call) => call.body.thinking), [{ type: "disabled" }, { type: "disabled" }, { type: "disabled" }]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.reasoningMode), ["disabled", "disabled", "disabled"]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.thinkingExplicitlyConfigured), [true, true, true]);
});

test("R5 ignora thinking enabled recebido da Connection somente dentro da operação R5", async () => {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  let index = 0;
  const outputs = [phase1, phase2, phase3];
  const result = await runKeywordSemanticReview({
    context,
    provider: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "fixture-secret",
      model: "deepseek-v4-pro",
      thinkingMode: "enabled",
      fetchImpl: async (_url, init) => {
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return response(outputs[index++]);
      },
    },
  });
  assert.deepEqual(calls.map((call) => call.body.thinking), [{ type: "disabled" }, { type: "disabled" }, { type: "disabled" }]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.reasoningMode), ["disabled", "disabled", "disabled"]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.thinkingExplicitlyConfigured), [true, true, true]);
});

test("R5.2 repete uma única vez a Phase 2 truncada somente em ação explícita DeepSeek", async () => {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  const progress: Array<{ phaseNumber: number; attempt: number; retry?: boolean; label: string }> = [];
  let index = 0;
  const outputs = [phase1, phase2, phase3];
  const result = await runKeywordSemanticReview({
    context,
    userInitiated: true,
    provider: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "fixture-secret",
      model: "deepseek-v4-pro",
      fetchImpl: async (_url, init) => {
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        const currentCall = index++;
        if (currentCall === 1) return response("", "length");
        return response(outputs[currentCall === 0 ? 0 : currentCall - 1]);
      },
    },
    onPhaseStarted: (event) => { progress.push(event); },
  });

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.body.max_tokens), [1100, 1100, 1100, 600]);
  assert.equal(progress.some((event) => event.phaseNumber === 2 && event.retry === true && event.attempt === 2 && /repetindo/.test(event.label)), true);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.requestedMaxTokens), [1100, 1100, 600]);
});

test("R5.2 recupera truncamento da Phase 1 sem repetir fases já válidas", async () => {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  const progress: Array<{ phaseNumber: number; attempt: number; retry?: boolean; label: string }> = [];
  let index = 0;
  const result = await runKeywordSemanticReview({
    context,
    userInitiated: true,
    provider: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "fixture-secret",
      model: "deepseek-v4-pro",
      fetchImpl: async (_url, init) => {
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        const currentCall = index++;
        if (currentCall === 0) return response("", "length");
        return response([phase1, phase2, phase3][currentCall - 1]);
      },
    },
    onPhaseStarted: (event) => { progress.push(event); },
  });

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.body.max_tokens), [1100, 1100, 1100, 600]);
  assert.equal(progress.some((event) => event.phaseNumber === 1 && event.retry === true && event.attempt === 2 && /repetindo/.test(event.label)), true);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.phase), [1, 2, 3]);
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.requestedMaxTokens), [1100, 1100, 600]);
  assert.equal(result.output.overallVerdict, "CONCORDA");
});

test("R5.3 repara uma única vez o schema inválido da Phase 3 sem repetir Phase 1/2", async () => {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  const usage: Array<{ phaseNumber: number; attempt: number; retry?: boolean; diagnostic: Record<string, unknown> }> = [];
  const progress: Array<{ phaseNumber: number; attempt: number; retry?: boolean; label: string }> = [];
  const outputs = [phase1, phase2, invalidPhase3SchemaShape, repairedPhase3];
  let index = 0;
  const result = await runKeywordSemanticReview({
    context,
    userInitiated: true,
    provider: {
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "fixture-secret",
      model: "deepseek-v4-pro",
      fetchImpl: async (_url, init) => {
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return response(outputs[index++]);
      },
    },
    onPhaseStarted: (event) => { progress.push(event); },
    onPhaseUsage: (event) => { usage.push(event as unknown as typeof usage[number]); },
  });

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.body.max_tokens), [1100, 1100, 600, 600]);
  assert.deepEqual(calls.map((call) => call.body.thinking), [{ type: "disabled" }, { type: "disabled" }, { type: "disabled" }, { type: "disabled" }]);
  assert.equal(progress.some((event) => event.phaseNumber === 3 && event.retry === true && event.attempt === 2 && /Ajustando resposta/.test(event.label)), true);
  assert.equal(usage.length, 4);
  assert.equal(usage[2]?.diagnostic.schemaValidation, "fail");
  assert.deepEqual(usage[2]?.diagnostic.responseShape, {
    topLevelKeys: ["reviewStatus", "overallVerdict", "divergences", "enrichments", "remainingAmbiguities", "humanReviewNotes"],
    divergencesType: "array",
    divergenceKeys: [["suggestion", "evidenceUsed"]],
    enrichmentsType: "array",
    enrichmentItemTypes: ["string"],
  });
  assert.equal(usage[3]?.phaseNumber, 3);
  assert.equal(usage[3]?.attempt, 2);
  assert.equal(usage[3]?.retry, true);
  const repairMessages = calls[3]?.body.messages as Array<{ role?: string; content?: string }>;
  assert.match(repairMessages?.[0]?.content || "", /corrige somente o formato/i);
  assert.match(repairMessages?.[1]?.content || "", /JSON anterior/);
  assert.match(repairMessages?.[1]?.content || "", /rationale/);
  assert.equal(result.output.fieldReviews[0]?.field, "intent");
  assert.equal(result.output.fieldReviews[0]?.rationale, "A síntese mantém a divergência semântica.");
  assert.equal(typeof result.output.enrichmentDetails?.[0], "object");
  assert.deepEqual(result.phaseDiagnostics.map((diagnostic) => diagnostic.phase), [1, 2, 3]);
});

test("R5.3 não repete schema inválido sem ação explícita e não tenta reparar truncamento", async () => {
  const outputs = [phase1, phase2, invalidPhase3SchemaShape];
  let index = 0;
  const calls: Array<{ body: Record<string, unknown> }> = [];
  await assert.rejects(
    runKeywordSemanticReview({
      context,
      provider: {
        apiUrl: "https://api.deepseek.com/chat/completions",
        apiKey: "fixture-secret",
        model: "deepseek-v4-pro",
        fetchImpl: async (_url, init) => {
          calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
          return response(outputs[index++]);
        },
      },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "AI_PHASE_3_SCHEMA_INVALID");
      return true;
    },
  );
  assert.equal(calls.length, 3);

  index = 0;
  calls.length = 0;
  await assert.rejects(
    runKeywordSemanticReview({
      context,
      userInitiated: true,
      provider: {
        apiUrl: "https://api.deepseek.com/chat/completions",
        apiKey: "fixture-secret",
        model: "deepseek-v4-pro",
        fetchImpl: async (_url, init) => {
          calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
          const current = index++;
          return current < 2 ? response(outputs[current]) : response("", "length");
        },
      },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "AI_PHASE_3_TRUNCATED");
      return true;
    },
  );
  assert.equal(calls.length, 4);
});

test("R5.3 encerra após uma única repair inválida sem novo loop", async () => {
  const outputs = [phase1, phase2, invalidPhase3SchemaShape, invalidPhase3SchemaShape];
  let index = 0;
  const calls: Array<{ body: Record<string, unknown> }> = [];
  await assert.rejects(
    runKeywordSemanticReview({
      context,
      userInitiated: true,
      provider: {
        apiUrl: "https://api.deepseek.com/chat/completions",
        apiKey: "fixture-secret",
        model: "deepseek-v4-pro",
        fetchImpl: async (_url, init) => {
          calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
          return response(outputs[index++]);
        },
      },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "AI_PHASE_3_SCHEMA_INVALID");
      return true;
    },
  );
  assert.equal(calls.length, 4);
});

test("falha truncada na phase_1 interrompe phase_2/phase_3 antes de qualquer persistência da revisão", async () => {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  await assert.rejects(
    runKeywordSemanticReview({
      context,
      provider: {
        apiUrl: "https://api.deepseek.com/chat/completions",
        apiKey: "fixture-secret",
        model: "deepseek-v4-pro",
        thinkingMode: "provider_default",
        fetchImpl: async (_url, init) => {
          calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
          return response("", "length");
        },
      },
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "AI_PHASE_1_TRUNCATED");
      const diagnostic = (error as { diagnostic?: Record<string, unknown> }).diagnostic;
      assert.equal(diagnostic?.reasoningMode, "disabled");
      assert.equal(diagnostic?.requestedMaxTokens, 1100);
      assert.equal(diagnostic?.thinkingExplicitlyConfigured, true);
      return true;
    },
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.body.thinking, { type: "disabled" });
  assert.equal("openrouter" in (calls[0]?.body || {}), false);
});
