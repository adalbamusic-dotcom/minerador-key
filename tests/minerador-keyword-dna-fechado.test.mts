import assert from "node:assert/strict";
import test from "node:test";
import { KeywordDnaSchema, keywordDnaFromPackage, keywordDnaFromRow } from "../lib/minerador/keyword-dna.ts";
import { applyApproval, buildApprovedPackage } from "../lib/minerador/approved-package.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import type { KeywordSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";
// O teste pode olhar para o consumidor; a lib do Minerador não pode.
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";

/**
 * KeywordDNA fechado: uma resposta por pergunta, com a fonte declarada, e os
 * treze campos que o Arquiteto lê normalizados na origem.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const INTENT = "Comercial investigativa";

function semanticLogica(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    dna_modelo: "keyword-dna-engine",
    dna_confianca: "0.44",
    intencao_principal: INTENT,
    intencao_secundaria: "Pendente",
    nicho: "Estética",
    funnel: "MOFU",
    entidade_central: "sérum facial",
    modificadores: "barato, pele oleosa",
    problema_percebido: "Problema não determinado pela keyword",
    publico: "Pessoas com pele oleosa",
    resultado_desejado: "Nenhum resultado explícito",
    tipo_editorial: "Comparativo",
    nivel_consciencia: "Consciente do problema",
    etapa_jornada: "Consideração",
    risco_canibalizacao: "A confirmar",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-19T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
    ...overrides,
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

function row(semantic: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: "kw-1",
    brand_id: "brand-1",
    keyword: "sérum facial",
    intent: INTENT,
    status: "bruto",
    volume_search: 90,
    results_allintitle: 336,
    kgr_score: 3.7333,
    analise_semantica: semantic,
    ...overrides,
  };
}

function qualificacao(overrides: Partial<Record<"intent" | "funnel", Partial<KeywordSemanticQualification["intent"]>>> = {}): KeywordSemanticQualification {
  const axis = (value: string): KeywordSemanticQualification["intent"] => ({
    observedValue: value, strength: "conclusive", supporting: 6, observed: 8, classified: 8, coverage: 1, dominance: 0.75, distribution: [], structuralSignals: [],
  });
  return {
    schemaVersion: "v1",
    id: "keyword_semantic_qualification:brand-1:kw-1:v1",
    brandId: "brand-1",
    keywordId: "kw-1",
    source: { provider: "dataforseo", operationRequestId: "11111111-1111-4111-8111-111111111111", providerRequestId: "task-1", collectedAt: "2026-09-19T10:02:00.000Z" },
    query: { keyword: "sérum facial", locationCode: 2076, languageCode: "pt", device: "desktop" },
    evidence: { observedResults: 8, serpFeatures: [], sample: [], evidenceHash: "sha256:fixture" },
    intent: { ...axis("Transacional"), ...overrides.intent },
    funnel: { ...axis("BOFU"), ...overrides.funnel },
    derivation: { derivationVersion: "serp-semantic-derivation-v3", thresholdsVersion: "provisional-heuristic-2026-08-28", thresholdsStatus: "provisional_heuristic" },
    lifecycle: { version: 1, contentHash: "sha256:qualificacao", createdAt: "2026-09-19T10:02:00.000Z", createdBy: "user-1", supersedesVersionId: null },
  };
}

test("sem SERP, a Lógica responde e declara que é hipótese", () => {
  const dna = keywordDnaFromRow(row(semanticLogica()));
  assert.equal(dna.axes.intent.value, INTENT);
  assert.equal(dna.axes.intent.source, "logic");
  assert.equal(dna.axes.funnel.value, "MOFU");
  assert.equal(dna.axes.funnel.source, "logic");
  assert.equal(dna.axes.niche.value, "Estética");
  assert.equal(dna.serp.state, "not_collected");
});

test("SERP conclusiva fecha o eixo — e a Lógica deixa de responder", () => {
  const dna = keywordDnaFromRow(row(semanticLogica(), { serp: { kind: "qualification", qualification: qualificacao() } }));
  assert.equal(dna.axes.intent.value, "Transacional");
  assert.equal(dna.axes.intent.source, "serp");
  assert.equal(dna.axes.funnel.value, "BOFU");
  assert.equal(dna.axes.funnel.source, "serp");
  assert.equal(dna.serp.state, "conclusive");
  assert.equal(dna.serp.versionId, "keyword_semantic_qualification:brand-1:kw-1:v1");
});

test("SERP não conclusiva não inventa valor: o eixo volta para quem tinha resposta", () => {
  const fraca = qualificacao({ intent: { strength: "weak" } });
  const dna = keywordDnaFromRow(row(semanticLogica(), { serp: { kind: "qualification", qualification: fraca } }));
  assert.equal(dna.serp.state, "non_conclusive");
  assert.equal(dna.serp.intentStrength, "weak");
  assert.equal(dna.axes.intent.value, INTENT, "intenção cai para a Lógica");
  assert.equal(dna.axes.intent.source, "logic");
  assert.equal(dna.axes.funnel.value, "BOFU", "funil continua conclusivo");
  assert.equal(dna.axes.funnel.source, "serp");
});

test("decisão humana vale acima da Lógica, mas não acima da SERP conclusiva", () => {
  const humana = semanticLogica({ human_review: { status: "completed", kgrDecisionReviewed: true, overrides: { intent: "Informacional" } } });
  const semSerp = keywordDnaFromRow(row(humana));
  assert.equal(semSerp.axes.intent.value, "Informacional");
  assert.equal(semSerp.axes.intent.source, "human");

  const comSerp = keywordDnaFromRow(row(humana, { serp: { kind: "qualification", qualification: qualificacao() } }));
  assert.equal(comSerp.axes.intent.value, "Transacional");
  assert.equal(comSerp.axes.intent.source, "serp");
});

test("ausência declarada pelo motor não vira dado", () => {
  const dna = keywordDnaFromRow(row(semanticLogica()));
  assert.equal(dna.logical.secondaryIntent, null, "'Pendente' não é intenção");
  assert.equal(dna.logical.perceivedProblem, null, "'não determinado' no meio da frase");
  assert.equal(dna.logical.desiredResult, null, "'Nenhum ...' é ausência");
  assert.equal(dna.logical.cannibalizationNote, null, "'A confirmar' é ausência");
  assert.deepEqual(dna.logical.modifiers, ["barato", "pele oleosa"]);
  assert.equal(dna.logical.confidence, 0.44);
  assert.equal(dna.logical.audience, "Pessoas com pele oleosa");
});

test("o Arquiteto lê exatamente o que o contrato entrega (equivalência campo a campo)", () => {
  const semantic = semanticLogica();
  const q = qualificacao();
  const referencia = { versionId: q.id, contentHash: q.lifecycle.contentHash, intent: "Transacional", funnel: "BOFU", semanticState: "conclusive" as const, collectedAt: q.source.collectedAt };

  const dna = keywordDnaFromRow(row(semantic, { serp: { kind: "reference", reference: referencia } }));
  const arquiteto = resolveKeywordDnaSignals({ keywordId: "kw-1", text: "sérum facial", semanticQualification: referencia, semantic });

  assert.equal(dna.axes.intent.value, arquiteto.intent);
  assert.equal(dna.axes.funnel.value, arquiteto.funnel);
  assert.equal(dna.serp.state, arquiteto.semanticState);
  assert.equal(dna.serp.versionId, arquiteto.dnaVersionId);
  assert.equal(dna.serp.contentHash, arquiteto.dnaContentHash);
  assert.equal(dna.logical.confidence, Number(arquiteto.confidence));
  assert.equal(dna.logical.centralEntity, arquiteto.centralEntity);
  assert.deepEqual(dna.logical.modifiers, arquiteto.modifiers);
  assert.equal(dna.logical.secondaryIntent, arquiteto.secondaryIntent);
  assert.equal(dna.logical.perceivedProblem, arquiteto.perceivedProblem);
  assert.equal(dna.logical.audience, arquiteto.audience);
  assert.equal(dna.logical.desiredResult, arquiteto.desiredResult);
  assert.equal(dna.logical.editorialType, arquiteto.editorialType);
  assert.equal(dna.logical.awarenessLevel, arquiteto.awarenessLevel);
  assert.equal(dna.logical.journeyStage, arquiteto.journeyStage);
  assert.equal(dna.logical.cannibalizationNote, arquiteto.cannibalizationNote);
});

test("o pacote aprovado reconstrói o mesmo DNA, fechado e nunca 'em revisão'", async () => {
  const base = row(semanticLogica(), { status: "aprovado" });
  const semantic = await applyApproval({
    keywordId: base.id, brandId: base.brand_id, keyword: base.keyword, intent: base.intent,
    volumeSearch: base.volume_search, resultsAllintitle: base.results_allintitle, kgrScore: base.kgr_score, listaId: null,
    semantic: base.analise_semantica, approvedAt: "2026-09-19T12:00:00.000Z", approvedBy: "human-1",
  });
  const pacote = buildApprovedPackage({
    keywordId: base.id, brandId: base.brand_id, keyword: base.keyword, intent: base.intent,
    volumeSearch: base.volume_search, resultsAllintitle: base.results_allintitle, kgrScore: base.kgr_score, listaId: null, semantic,
  });
  assert.ok(pacote);

  const doPacote = keywordDnaFromPackage({ approvedDna: pacote });
  const daLinha = keywordDnaFromRow(row(semantic, { status: "aprovado" }));

  assert.equal(doPacote.status.effective, "aprovado");
  assert.equal(doPacote.status.divergedFromApproval, false);
  assert.equal(doPacote.approval?.version, 1);
  assert.equal(doPacote.approval?.contentHash, pacote.contentHash);
  assert.deepEqual(doPacote.axes, daLinha.axes);
  assert.deepEqual(doPacote.logical, daLinha.logical);
  assert.deepEqual(doPacote.metrics, daLinha.metrics);
  assert.equal(doPacote.maturity, daLinha.maturity);
});

test("linha mexida depois da aprovação não produz pacote com carimbo antigo", async () => {
  const base = row(semanticLogica());
  const input = {
    keywordId: base.id, brandId: base.brand_id, keyword: base.keyword, intent: base.intent,
    volumeSearch: base.volume_search, resultsAllintitle: base.results_allintitle, kgrScore: base.kgr_score, listaId: null,
  };
  const semantic = await applyApproval({ ...input, semantic: base.analise_semantica, approvedAt: "2026-09-19T12:00:00.000Z", approvedBy: "human-1" });
  assert.ok(buildApprovedPackage({ ...input, semantic }), "intacta produz pacote");
  assert.equal(buildApprovedPackage({ ...input, semantic, volumeSearch: 140 }), null, "divergente não produz");

  const dna = keywordDnaFromRow(row(semantic, { status: "aprovado", volume_search: 140 }));
  assert.equal(dna.status.effective, "em_revisao");
  assert.equal(dna.status.divergedFromApproval, true);
  assert.equal(dna.approval?.version, 1, "a aprovação vigente continua declarada");
});

test("o contrato é validado pelo schema: nada sai fora do formato", () => {
  const dna = keywordDnaFromRow(row(semanticLogica()));
  assert.equal(KeywordDnaSchema.safeParse(dna).success, true);
  assert.equal(KeywordDnaSchema.safeParse({ ...dna, extra: 1 }).success, false, "strict: chave desconhecida é recusada");
});
