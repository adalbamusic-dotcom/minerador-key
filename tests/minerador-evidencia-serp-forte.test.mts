import assert from "node:assert/strict";
import test from "node:test";
import { applySerpEvidenceRecord, invalidateSerpEvidence, readSerpEvidenceRecord, serpEvidenceRecordFromQualification } from "../lib/minerador/serp-evidence-record.ts";
import { readCanonicalKeywordDna } from "../lib/minerador/logical-read-model.ts";
import { resolveCanonicalKeywordSnapshot } from "../lib/minerador/canonical-keyword-snapshot.ts";
import { applyApproval, buildApprovedPackage } from "../lib/minerador/approved-package.ts";
import { keywordDnaFromPackage, keywordDnaFromRow } from "../lib/minerador/keyword-dna.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import type { KeywordSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";

/**
 * SERP como evidência forte, gravada na keyword (SDD 2026-09-19). A SERP
 * conclusiva muda o que a Lógica responde, sem apagar a hipótese; o humano
 * pode invalidar a evidência, nunca substituí-la. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const LOGICA = "Comercial investigativa";

function semanticLogica(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: LOGICA,
    nicho: "Estética",
    funnel: "MOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-19T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
    ...overrides,
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: LOGICA, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

function qualificacao(input: { intent?: Partial<KeywordSemanticQualification["intent"]>; funnel?: Partial<KeywordSemanticQualification["funnel"]>; version?: number } = {}): KeywordSemanticQualification {
  const axis = (value: string): KeywordSemanticQualification["intent"] => ({
    observedValue: value, strength: "conclusive", supporting: 6, observed: 8, classified: 8, coverage: 1, dominance: 0.75, distribution: [], structuralSignals: [],
  });
  const version = input.version ?? 1;
  return {
    schemaVersion: "v1",
    id: `keyword_semantic_qualification:brand-1:kw-1:v${version}`,
    brandId: "brand-1",
    keywordId: "kw-1",
    source: { provider: "dataforseo", operationRequestId: "11111111-1111-4111-8111-111111111111", providerRequestId: "task-1", collectedAt: "2026-09-19T10:02:00.000Z" },
    query: { keyword: "sérum facial", locationCode: 2076, languageCode: "pt", device: "desktop" },
    evidence: { observedResults: 8, serpFeatures: [], sample: [], evidenceHash: "sha256:fixture" },
    intent: { ...axis("Transacional"), ...input.intent },
    funnel: { ...axis("BOFU"), ...input.funnel },
    derivation: { derivationVersion: "serp-semantic-derivation-v3", thresholdsVersion: "provisional-heuristic-2026-08-28", thresholdsStatus: "provisional_heuristic" },
    lifecycle: { version, contentHash: `sha256:qualificacao-v${version}`, createdAt: "2026-09-19T10:02:00.000Z", createdBy: "user-1", supersedesVersionId: null },
  };
}

function row(semantic: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return { id: "kw-1", brand_id: "brand-1", keyword: "sérum facial", intent: LOGICA, status: "bruto", volume_search: 90, results_allintitle: 336, kgr_score: 3.7333, analise_semantica: semantic, ...overrides };
}

test("a Qualificação vira registro forte na linha, com valor só onde é conclusiva", () => {
  const forte = serpEvidenceRecordFromQualification(qualificacao());
  assert.equal(forte.peso, "forte");
  assert.equal(forte.semanticState, "conclusive");
  assert.deepEqual(forte.intent, { value: "Transacional", strength: "conclusive" });
  assert.deepEqual(forte.funnel, { value: "BOFU", strength: "conclusive" });
  assert.equal(forte.invalidada, null);

  const mista = serpEvidenceRecordFromQualification(qualificacao({ intent: { strength: "mixed" } }));
  assert.equal(mista.semanticState, "non_conclusive");
  assert.deepEqual(mista.intent, { value: null, strength: "mixed" }, "força registrada, valor não inventado");
  assert.deepEqual(mista.funnel, { value: "BOFU", strength: "conclusive" });

  const semantic = applySerpEvidenceRecord(semanticLogica(), qualificacao());
  assert.deepEqual(readSerpEvidenceRecord(semantic), forte, "readback do que foi gravado");
  assert.equal(semantic.intencao_principal, LOGICA, "a hipótese da Lógica não é sobrescrita");
});

test("a SERP conclusiva muda a resposta canônica; a Lógica vira proveniência", () => {
  const semantic = applySerpEvidenceRecord(semanticLogica(), qualificacao());
  const canonico = readCanonicalKeywordDna({ analise_semantica: semantic });
  assert.equal(canonico.intent, "Transacional");
  assert.equal(canonico.intentSource, "serp");
  assert.equal(canonico.funnel, "BOFU");
  assert.equal(canonico.funnelSource, "serp");
  assert.equal(canonico.niche, "Estética");
  assert.equal(canonico.nicheSource, "logic");

  const hipotese = readCanonicalKeywordDna({ analise_semantica: semantic }, { includeSerpEvidence: false });
  assert.equal(hipotese.intent, LOGICA, "a coluna Lógica do painel continua mostrando a hipótese");
  assert.equal(hipotese.intentSource, "logic");

  // A tabela, o Perfil e a Decisão leem pelo snapshot: mesma resposta.
  const snapshot = resolveCanonicalKeywordSnapshot(row(semantic));
  assert.equal(snapshot.semantic.intent, "Transacional");
  assert.equal(snapshot.semantic.intentLabel, "Transacional");
});

test("SERP não conclusiva não muda nada: o eixo fica com quem tinha resposta", () => {
  const semantic = applySerpEvidenceRecord(semanticLogica(), qualificacao({ intent: { strength: "weak" }, funnel: { strength: "insufficient" } }));
  const canonico = readCanonicalKeywordDna({ analise_semantica: semantic });
  assert.equal(canonico.intent, LOGICA);
  assert.equal(canonico.intentSource, "logic");
  assert.equal(canonico.funnel, "MOFU");
  assert.equal(canonico.funnelSource, "logic");
});

test("decisão humana não vence SERP conclusiva; invalidar a evidência devolve a leitura", () => {
  const humana = semanticLogica({ human_review: { status: "completed", kgrDecisionReviewed: true, overrides: { intent: "Informacional" } } });
  const comSerp = applySerpEvidenceRecord(humana, qualificacao());
  assert.equal(readCanonicalKeywordDna({ analise_semantica: comSerp }).intent, "Transacional", "HUMAN_CAN_OVERRIDE_VALID_CONCLUSIVE_SERP = NO");

  assert.throws(() => invalidateSerpEvidence(comSerp, { por: "human-1", em: "2026-09-19T13:00:00.000Z", motivo: "  " }), /exige motivo/);
  const invalidada = invalidateSerpEvidence(comSerp, { por: "human-1", em: "2026-09-19T13:00:00.000Z", motivo: "targeting errado: coleta em en-US" });
  const canonico = readCanonicalKeywordDna({ analise_semantica: invalidada });
  assert.equal(canonico.intent, "Informacional", "sem SERP válida, a decisão humana responde");
  assert.equal(canonico.intentSource, "human");
  assert.equal(readSerpEvidenceRecord(invalidada)?.invalidada?.motivo, "targeting errado: coleta em en-US");

  // Nova coleta substitui o registro inteiro — a invalidação era sobre a coleta antiga.
  const recoletada = applySerpEvidenceRecord(invalidada, qualificacao({ version: 2 }));
  assert.equal(readSerpEvidenceRecord(recoletada)?.invalidada, null);
  assert.equal(readCanonicalKeywordDna({ analise_semantica: recoletada }).intentSource, "serp");
});

test("o KeywordDNA fechado lê a evidência da própria linha, sem serp explícito", () => {
  const semantic = applySerpEvidenceRecord(semanticLogica(), qualificacao());
  const dna = keywordDnaFromRow(row(semantic));
  assert.equal(dna.axes.intent.source, "serp");
  assert.equal(dna.axes.intent.value, "Transacional");
  assert.equal(dna.serp.state, "conclusive");
  assert.equal(dna.serp.versionId, "keyword_semantic_qualification:brand-1:kw-1:v1");

  const invalidada = invalidateSerpEvidence(semantic, { por: "human-1", em: "2026-09-19T13:00:00.000Z", motivo: "coleta defeituosa" });
  const semSerp = keywordDnaFromRow(row(invalidada));
  assert.equal(semSerp.axes.intent.source, "logic");
  assert.equal(semSerp.serp.state, "not_collected", "evidência invalidada não conta como coletada válida");
});

test("nova SERP depois da aprovação rebaixa para em revisão; o pacote reaprovado carrega a evidência", async () => {
  const base = row(semanticLogica(), { status: "aprovado" });
  const input = { keywordId: "kw-1", brandId: "brand-1", keyword: "sérum facial", intent: LOGICA, volumeSearch: 90, resultsAllintitle: 336, kgrScore: 3.7333, listaId: null };
  const aprovadaV1 = await applyApproval({ ...input, semantic: base.analise_semantica, approvedAt: "2026-09-19T12:00:00.000Z", approvedBy: "human-1" });
  assert.equal(keywordDnaFromRow(row(aprovadaV1, { status: "aprovado" })).status.effective, "aprovado");

  const comSerp = applySerpEvidenceRecord(aprovadaV1, qualificacao());
  const emRevisao = keywordDnaFromRow(row(comSerp, { status: "aprovado" }));
  assert.equal(emRevisao.status.effective, "em_revisao", "evidência forte nova exige nova aprovação");
  assert.equal(emRevisao.axes.intent.source, "serp", "mas a leitura já responde com a SERP");
  assert.equal(buildApprovedPackage({ ...input, semantic: comSerp }), null, "sem pacote novo até reaprovar");

  const aprovadaV2 = await applyApproval({ ...input, semantic: comSerp, approvedAt: "2026-09-19T14:00:00.000Z", approvedBy: "human-1" });
  const pacote = buildApprovedPackage({ ...input, semantic: aprovadaV2 });
  assert.ok(pacote);
  assert.equal(pacote.version, 2);
  const doPacote = keywordDnaFromPackage({ approvedDna: pacote });
  assert.equal(doPacote.axes.intent.source, "serp", "o pacote carrega a SERP como dado próprio");
  assert.equal(doPacote.axes.intent.value, "Transacional");
  assert.equal(doPacote.status.effective, "aprovado");
});
