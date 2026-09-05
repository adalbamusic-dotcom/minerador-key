import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildSemanticReviewContext,
  buildSemanticReviewRecord,
  deriveDnaMaturity,
  isCompletedSemanticReview,
  parseSemanticReviewOutput,
  semanticReviewDivergenceCount,
  semanticReviewEnrichmentCount,
} from "../lib/minerador/semantic-review.ts";
import { buildSemanticReviewPhase2Input, normalizePhasedSemanticReviewOutput } from "../lib/minerador/semantic-review-phases.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";

const row: {
  keyword: string;
  intent: string;
  volume_search: number;
  results_allintitle: number;
  kgr_score: number;
  analise_semantica: Record<string, unknown>;
} = {
  keyword: "portaria remota para condomínio pequeno",
  intent: "Informativo",
  volume_search: 90,
  results_allintitle: 336,
  kgr_score: 3.7333,
  analise_semantica: {
    dna_origem: "logico_deterministico",
    dna_confianca: "0.46",
    intencao_principal: "Informativo",
    intencao_secundaria: "Comercial investigativa",
    intencao_ambigua: "não",
    nicho_override: "Serviços condominiais",
    funnel: "MOFU",
    entidade_central: "portaria remota",
    modificadores: "condomínio pequeno",
    publico: "síndicos de condomínios pequenos",
    problema_percebido: "reduzir custo sem perder segurança",
    resultado_desejado: "avaliar uma solução adequada",
    job_to_be_done: "comparar uma solução de portaria remota",
    etapa_jornada: "consideração",
    nivel_consciencia: "solução",
    tipo_editorial: "guia",
    formato_esperado: "comparativo",
    potencial_comercial: "médio",
    intencao_local: "não",
    objecao_implicita: "confiabilidade",
    urgencia_tempo: "planejamento",
    emocao_dominante: "cautela",
    evidencias_logicas: "serviço + contexto + modificador específico",
    volume_measurement: {
      provider: "google_ads",
      providerVersion: "v25",
      averageMonthlySearches: 90,
      monthlySearchVolumes: [
        { year: 2026, month: "MAIO", monthlySearches: 80 },
        { year: 2026, month: "JUNHO", monthlySearches: 90 },
        { year: 2026, month: "JULHO", monthlySearches: 90 },
      ],
      averageCpcMicros: 1200000,
      currencyCode: "BRL",
      competition: "MEDIUM",
      competitionIndex: 42,
      measuredAt: "2026-08-18T12:00:00.000Z",
      targeting: { languageCode: "pt", countryCode: "BR" },
    },
    volume_eligibility: {
      provider: "google_ads",
      status: "eligible",
      measuredAt: "2026-08-18T12:00:00.000Z",
      targeting: { languageCode: "pt", countryCode: "BR" },
    },
    allintitle_measurement: {
      provider: "dataforseo",
      providerVersion: "v3",
      status: "success",
      resultsAllintitle: 336,
      query: "allintitle:\"portaria remota para condomínio pequeno\"",
      measuredAt: "2026-08-18T12:05:00.000Z",
      targeting: { languageCode: "pt", countryCode: "BR", device: "desktop" },
    },
    dataforseo_keyword_overview: {
      provider: "dataforseo",
      providerVersion: "v3",
      endpoint: "/v3/dataforseo_labs/google/keyword_overview/live",
      executor: "minerador_server",
      operationRequestId: "10000000-0000-4000-8000-000000000098",
      keywordDifficulty: 42,
      coreKeyword: "portaria remota",
      externalIntent: "commercial",
      avgReferringDomains: 18,
      avgBacklinks: 120,
      avgMainDomainRank: 44,
    },
    kgr_aplicabilidade: "applicable",
    kgr_decisao_origem: "human",
  },
};

row.analise_semantica = {
  ...row.analise_semantica,
  logical_output_contract: buildLogicalOutputContract({
    semantic: row.analise_semantica,
    intent: row.intent,
    niche: row.analise_semantica.nicho_override,
    funnel: row.analise_semantica.funnel,
  }),
};

test("R5 envia lógica, Ads, DataForSEO e KGR com os fatos persistidos", () => {
  const context = buildSemanticReviewContext(row);
  assert.equal(context.logical.processed, true);
  assert.equal(context.logical.fields.intent, "Informativo");
  assert.equal(context.logical.fields.centralEntity, "portaria remota");
  assert.equal(context.googleAds.volume, 90);
  assert.equal(context.googleAds.measurement.averageMonthlySearches, 90);
  assert.equal(context.googleAds.measurement.competitionIndex, 42);
  assert.equal(context.dataForSeo.allintitle, 336);
  assert.equal(context.dataForSeo.keywordDifficulty, 42);
  assert.equal(context.dataForSeo.measurement.resultsAllintitle, 336);
  assert.equal((context.dataForSeo.measurement.overview as Record<string, unknown>).keywordDifficulty, 42);
  assert.equal(context.kgr.volumeUsed, 90);
  assert.equal(context.kgr.allintitleUsed, 336);
  assert.equal(context.kgr.score, 3.7333);
  assert.equal(context.kgr.persistedScore, 3.7333);
  assert.equal(context.kgr.applicability, "applicable");
  assert.equal(context.kgr.treated, true);
  assert.deepEqual(context.evidenceReferences.kgr, [
    "minerador_keywords.volume_search",
    "minerador_keywords.results_allintitle",
    "calculateKgrFromMetrics",
    "analise_semantica.kgr_aplicabilidade",
  ]);
});

test("R5 mantém o artefato lógico como entrada mesmo quando já existem decisões humanas", () => {
  const context = buildSemanticReviewContext({
    ...row,
    intent: "Comercial",
    analise_semantica: {
      ...row.analise_semantica,
      intencao_humana: "Comercial",
      intencao_revisada: "Comercial",
      nicho_humano: "Varejo",
      funnel_humano: "BOFU",
      human_review: {
        status: "completed",
        fieldDecisions: [
          { canonicalField: "intent", selectedValue: "Comercial" },
          { canonicalField: "niche", selectedValue: "Varejo" },
          { canonicalField: "funnel", selectedValue: "BOFU" },
        ],
      },
    },
  });

  assert.equal(context.logical.fields.intent, "Informativo");
  assert.equal(context.logical.fields.niche, "Serviços condominiais");
  assert.equal(context.logical.fields.funnel, "MOFU");
});

test("R6.2 entrega à Phase 2 os fatos quantitativos reais já normalizados", () => {
  const quantitativeRow = {
    ...row,
    volume_search: 33100,
    results_allintitle: 359,
    analise_semantica: {
      ...row.analise_semantica,
      volume_measurement: {
        ...(row.analise_semantica.volume_measurement as Record<string, unknown>),
        averageMonthlySearches: 33100,
        averageCpcMicros: 340000,
        competition: "HIGH",
        competitionIndex: 97,
      },
      allintitle_measurement: {
        ...(row.analise_semantica.allintitle_measurement as Record<string, unknown>),
        resultsAllintitle: 359,
      },
      dataforseo_keyword_overview: {
        ...(row.analise_semantica.dataforseo_keyword_overview as Record<string, unknown>),
        keywordDifficulty: 0,
        externalIntent: "transactional",
        avgReferringDomains: 0.5,
        avgBacklinks: 1.4,
      },
    },
  };
  const phase2 = buildSemanticReviewPhase2Input(buildSemanticReviewContext(quantitativeRow));
  assert.deepEqual(phase2.googleAds, {
    volume: 33100,
    trend: "Crescente",
    cpc: 0.34,
    currencyCode: "BRL",
    competition: "HIGH",
    competitionIndex: 97,
    volumeEligibility: "eligible",
    validated: true,
  });
  assert.deepEqual(phase2.dataForSeo, {
    result: 359,
    kd: 0,
    externalIntent: "transactional",
    avgReferringDomainsTop10: 0.5,
    avgBacklinksTop10: 1.4,
    avgMainDomainRankTop10: 44,
    coreKeyword: "portaria remota",
    validated: true,
  });
  assert.equal((phase2.kgr as Record<string, unknown>).volume, 33100);
  assert.equal((phase2.kgr as Record<string, unknown>).result, 359);
  assert.equal((phase2.kgr as Record<string, unknown>).calculable, true);
  assert.equal((phase2.kgr as Record<string, unknown>).applicability, "applicable");
  const serialized = JSON.stringify(phase2);
  assert.doesNotMatch(serialized, /averageCpcMicros|providerRequestId|raw_payload|monthlySearchVolumes/);
});

test("R5 normaliza a resposta da IA e mantém a proposta separada do DNA lógico", () => {
  const output = parseSemanticReviewOutput(JSON.stringify({
    reviewStatus: "completed",
    overallVerdict: "DIVERGE",
    fieldReviews: [{
      field: "intenção",
      logicalValue: "Informativo",
      aiSuggestion: "Comercial investigativa",
      verdict: "DIVERGE",
      rationale: "O contexto específico sugere avaliação de solução.",
      evidenceUsed: ["logical.fields.keyword", "googleAds.volume"],
    }],
    semanticEnrichment: {
      searchNeed: "avaliar uma solução adequada",
      remainingAmbiguities: ["serviço pode ter variações locais"],
    },
  }));
  const review = buildSemanticReviewRecord({
    output,
    context: buildSemanticReviewContext(row),
    generatedAt: "2026-08-18T12:10:00.000Z",
    model: "fixture/model",
    operationRequestId: "r5-fixture-1",
  });
  assert.equal(isCompletedSemanticReview(review), true);
  assert.equal(review.overallVerdict, "DIVERGE");
  assert.equal(semanticReviewDivergenceCount(review), 1);
  assert.equal(semanticReviewEnrichmentCount(review), 2);
  assert.equal("intent" in review, false);
  assert.equal("nicho" in review, false);
  assert.equal(review.provider, "deepseek");
});

test("R5 transforma somente divergências semânticas acionáveis e filtra fatos/repetições", () => {
  const context = buildSemanticReviewContext(row);
  const result = normalizePhasedSemanticReviewOutput({
    context,
    phase1: {
      agreementFields: ["intent", "volume", "niche"],
      divergences: [
        { field: "funnel", suggestion: "Pendente", rationale: "estado fraco", evidenceUsed: ["logical.fields.funnel"] },
        { field: "volume", suggestion: 1000, rationale: "volume diferente", evidenceUsed: ["googleAds.volume"] },
        { field: "intent", suggestion: "Comercial investigativa", rationale: "A formulação sugere avaliação.", evidenceUsed: ["logical.fields.keyword"] },
      ],
      semanticEnrichments: [
        { type: "context", value: "Relacionado ao mercado de Serviços condominiais.", rationale: "Repete o nicho." },
        { type: "facts", value: "O volume é 90.", rationale: "Repete a medição." },
        { type: "searchNeed", value: "Comparar alternativas antes de contratar.", rationale: "Ajuda a interpretar a necessidade." },
        { type: "searchNeed", value: "Comparar alternativas antes de contratar.", rationale: "Duplicata." },
      ],
      remainingAmbiguities: [],
    },
    phase3: {
      reviewStatus: "completed",
      overallVerdict: "DIVERGE",
      divergences: [
        { field: "niche", suggestion: "Estética", rationale: "Sugestão não sustentada pelo termo.", evidenceUsed: ["phase1.divergences"] },
      ],
      enrichments: [
        { type: "other", value: "A keyword tem relação com um mercado.", rationale: "Observação genérica." },
      ],
      remainingAmbiguities: [],
      humanReviewNotes: [],
    },
  });

  assert.deepEqual(result.output.fieldReviews.map(field => [field.field, field.verdict]), [
    ["intent", "CONCORDA"],
    ["niche", "CONCORDA"],
  ]);
  assert.equal(result.valueTelemetry.rawDivergencesCount, 4);
  assert.equal(result.valueTelemetry.acceptedDivergencesCount, 0);
  assert.equal(result.valueTelemetry.droppedLowEvidenceCount, 4);
  assert.deepEqual(result.output.enrichmentDetails?.map(item => item.type), ["searchNeed"]);
  assert.doesNotMatch(JSON.stringify(result.output), /volume é 90|Pendente|mercado de Serviços condominiais/i);
});

test("R5 não cria divergência quando a síntese repete o valor lógico", () => {
  const context = buildSemanticReviewContext(row);
  const result = normalizePhasedSemanticReviewOutput({
    context,
    phase1: { agreementFields: ["intent"], divergences: [], semanticEnrichments: [], remainingAmbiguities: [] },
    phase3: {
      reviewStatus: "completed",
      overallVerdict: "DIVERGE",
      divergences: [{ field: "intent", suggestion: "Informativo", rationale: "A leitura permanece coerente.", evidenceUsed: ["phase1"] }],
      enrichments: [],
      remainingAmbiguities: [],
      humanReviewNotes: [],
    },
  });
  assert.equal(result.output.overallVerdict, "CONCORDA");
  assert.equal(result.output.fieldReviews[0]?.verdict, "CONCORDA");
});

test("R5 rejeita resposta sem veredito canônico e não inventa confirmação", () => {
  assert.throws(() => parseSemanticReviewOutput(JSON.stringify({ fieldReviews: [] })), /revisão sem/);
  const review = parseSemanticReviewOutput({
    overallVerdict: "CONCORDA",
    fieldReviews: [],
    semanticEnrichment: {},
  });
  assert.equal(review.overallVerdict, "CONCORDA");
  assert.equal("confirmed" in review, false);
});

test("maturidade só fica completa para revisão depois de todos os gates e nunca confirma pelo R5", () => {
  assert.equal(deriveDnaMaturity({ logicalProcessed: false, googleAdsValid: true, dataForSeoValid: true, kgrTreated: true, aiReviewCompleted: true, humanConfirmed: false }), "INSUFICIENTE");
  assert.equal(deriveDnaMaturity({ logicalProcessed: true, googleAdsValid: true, dataForSeoValid: false, kgrTreated: true, aiReviewCompleted: true, humanConfirmed: false }), "PARCIAL");
  assert.equal(deriveDnaMaturity({ logicalProcessed: true, googleAdsValid: true, dataForSeoValid: true, kgrTreated: true, aiReviewCompleted: true, humanConfirmed: false }), "COMPLETA PARA REVISÃO");
  assert.equal(deriveDnaMaturity({ logicalProcessed: true, googleAdsValid: true, dataForSeoValid: true, kgrTreated: true, aiReviewCompleted: true, humanConfirmed: true }), "CONFIRMADA");
});

test("R5 usa a rota canônica, a ação única e o slot visual existente", async () => {
  const route = await readFile(new URL("../app/api/process-intent-niche/route.ts", import.meta.url), "utf8");
  const orchestrator = await readFile(new URL("../lib/minerador/semantic-review-orchestrator.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const processAction = await readFile(new URL("../modules/minerador/minerador-process-action.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const spec = await readFile(new URL("../docs/03-minerador/spec.md", import.meta.url), "utf8");
  const state = await readFile(new URL("../docs/03-minerador/estado-atual.md", import.meta.url), "utf8");
  assert.match(route, /mode === "semantic_review"/);
  assert.match(route, /runKeywordSemanticReview/);
  assert.match(route, /resolveDeepSeekCanonicalConfig/);
  assert.match(route, /thinkingMode/);
  assert.match(route, /requestedMaxTokens/);
  assert.match(route, /reasoningEffort/);
  assert.match(route, /thinkingExplicitlyConfigured/);
  assert.match(route, /responseShape/);
  assert.match(route, /schemaIssuePaths/);
  assert.match(route, /schemaIssues/);
  assert.match(route, /attemptLabel/);
  assert.match(route, /responseFormatMode/);
  assert.match(orchestrator, /fatos são imutáveis/);
  assert.match(orchestrator, /function thinkingModeForPhase[\s\S]*return "disabled"/);
  assert.match(orchestrator, /executeR5PhaseWithReliability/);
  assert.match(orchestrator, /MAX_CALLS_PER_PHASE = 2/);
  assert.match(orchestrator, /phase1MaxCompletionTokens: 1100/);
  assert.match(orchestrator, /rawKeyword/);
  assert.match(orchestrator, /logicHypothesis/);
  assert.match(orchestrator, /valueTelemetry/);
  assert.match(route, /quotaUnits: 3/);
  assert.match(route, /executionRequestId/);
  assert.match(route, /valueTelemetry/);
  assert.match(route, /application\/x-ndjson/);
  assert.match(route, /update\(\{ analise_semantica: updatedSemantic \}\)/);
  assert.doesNotMatch(route.slice(route.indexOf('if (mode === "semantic_review")'), route.indexOf('canonicalClient = createCanonicalServiceClient();', route.indexOf('if (mode === "semantic_review")'))), /\.update\(\{[\s\S]*\bintent\b/);
  assert.match(workspace, /const handleBatchSemanticReview = async \(\) =>/);
  assert.match(workspace, /mode: "semantic_review"/);
  assert.match(workspace, /const executionRequestId = crypto\.randomUUID\(\)/);
  assert.match(workspace, /ariaLabel="IA"/);
  assert.match(processAction, /aria-label=\{ariaLabel\}/);
  assert.doesNotMatch(workspace.slice(workspace.indexOf("const handleBatchSemanticReview"), workspace.indexOf("const handleBatchSemanticReview") + 7000), /\/api\/analyze/);
  assert.match(panel, /isCompletedSemanticReview/);
  assert.match(panel, /data-keyword-ai-review/);
  assert.match(panel, /Sem correções semânticas relevantes/);
  assert.match(panel, /Ver revisão completa/);
  assert.doesNotMatch(panel.slice(panel.indexOf("data-keyword-ai-review"), panel.indexOf("data-keyword-human-decision")), /Potencial editorial|editorial_potential/);
  assert.match(spec, /Regra permanente do R5 — leitura semântica independente antes da comparação/);
  assert.match(spec, /R5_PRIMARY_OBJECT = RAW_KEYWORD/);
  assert.match(spec, /rawKeyword/);
  assert.match(spec, /logicHypothesis/);
  assert.match(spec, /A IA propõe; o humano decide/);
  assert.match(state, /R5_INDEPENDENT_READING_IMPLEMENTED = YES/);
  assert.match(state, /R5_SEMANTIC_QUALITY_SMOKE = PENDING/);
});
