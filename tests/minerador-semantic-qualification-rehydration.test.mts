import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildKeywordSemanticQualification, semanticDraftFromQualification } from "../lib/minerador/keyword-semantic-qualification.ts";
import { createSemanticConsolidationDraft, resolveSemanticAxis } from "../lib/minerador/semantic-consolidation-draft.ts";
import { deriveSerpSemanticEvidence, serpCollectionLabel, serpCollectionUiState } from "../lib/minerador/serp-semantic-evidence.ts";
import { readKgrApplicability, calculateKgrFromMetrics, deriveKgrVisualState } from "../lib/minerador/kgr-applicability.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";

/**
 * Fechamento do fluxo persistido: o Perfil reidrata do artifact remoto, o card
 * é estrutural e estado vazio nunca substitui uma Qualificação válida.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const consolidation = panel.slice(panel.indexOf("function SemanticConsolidationPanel"), panel.indexOf("function HumanReviewPanel"));

const BRAND = "11111111-1111-4111-8111-111111111111";
const KEYWORD = "22222222-2222-4222-8222-222222222222";

function evidenceFrom(items: Array<{ title: string; description?: string }>) {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-serp-1",
        status_code: 20000,
        result: [{
          keyword: "skin care pele oleosa",
          location_code: 2076,
          language_code: "pt",
          items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, ...item })),
        }],
      }],
    },
    keyword: "skin care pele oleosa",
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-serp-1",
    operationRequestId: "33333333-3333-4333-8333-333333333333",
    collectedAt: "2026-08-28T18:00:00.000Z",
  })!;
}

const conclusiveItems = Array.from({ length: 8 }, (_, index) => ({ title: `O que é rotina para pele oleosa ${index + 1}`, description: "Guia passo a passo." }));
const weakItems = [
  { title: "O que é sérum noturno", description: "guia" },
  { title: "Como aplicar sérum noturno", description: "passo a passo" },
  { title: "Comprar sérum noturno", description: "preco e frete" },
  { title: "Sérum noturno com cupom", description: "desconto" },
  { title: "Melhor sérum noturno", description: "comparativo" },
  { title: "Review do sérum noturno", description: "resenha" },
  { title: "Clinica perto de mim", description: "agendar" },
  { title: "Unidades e endereco", description: "atendimento em SP" },
];

const qualificationOf = (items: Array<{ title: string; description?: string }>) =>
  buildKeywordSemanticQualification({ brandId: BRAND, keywordId: KEYWORD, evidence: evidenceFrom(items), createdBy: "user-1" });

test("A · artifact remoto conclusivo reidrata Intenção e Funil no Perfil", async () => {
  const draft = semanticDraftFromQualification(await qualificationOf(conclusiveItems), { intent: "Comercial", funnel: "MOFU" });
  assert.equal(resolveSemanticAxis(draft.intent).status, "serp_consolidated");
  assert.equal(resolveSemanticAxis(draft.intent).value, "Informativa");
  assert.equal(resolveSemanticAxis(draft.funnel).value, "TOFU");
  assert.equal(draft.localOnly, false);
  assert.equal(serpCollectionLabel(serpCollectionUiState({ evidence: evidenceFrom(conclusiveItems) })), "SERP · Analisada");
});

test("B · artifact remoto inconclusivo reidrata 'sem consolidação'", async () => {
  const draft = semanticDraftFromQualification(await qualificationOf(weakItems));
  assert.equal(draft.intent.serpStrength, "weak");
  assert.equal(resolveSemanticAxis(draft.intent).status, "serp_inconclusive");
  assert.equal(serpCollectionLabel(serpCollectionUiState({ evidence: evidenceFrom(weakItems) })), "SERP · Analisada · sem consolidação");
});

test("C · sem artifact o card existe com estado vazio honesto", () => {
  const empty = createSemanticConsolidationDraft({ keywordId: KEYWORD, brandId: BRAND, intent: { logic: "Comercial", ai: null }, funnel: { logic: "MOFU", ai: null } });
  assert.equal(resolveSemanticAxis(empty.intent).status, "awaiting_serp");
  assert.equal(serpCollectionLabel(serpCollectionUiState({})), "SERP · Não coletada");
  // O card é estrutural: nunca condicionado à existência de draft/artifact.
  assert.ok(!panel.includes("semanticConsolidationEnabled &&"));
  assert.ok(panel.includes('data-keyword-profile-stage="semantic-consolidation"'));
  assert.ok(consolidation.includes('{!value.serpStrength ? "Não coletada"'));
});

test("D · estado vazio nunca substitui um artifact remoto válido", () => {
  const fetchBlock = workspace.slice(workspace.indexOf("// A leitura do artifact é tolerante"), workspace.indexOf("setRecoverableKeywords("));
  // Falha de leitura preserva o que já está na tela.
  assert.ok(fetchBlock.includes(".catch(() => null)"));
  assert.ok(fetchBlock.includes("if (persistedQualifications) {"));
  // Merge aditivo: nada é zerado por um retorno parcial.
  assert.ok(fetchBlock.includes("setSemanticQualifications(current => ({ ...current, ...persistedQualifications }))"));
  assert.ok(fetchBlock.includes("const next = { ...current };"));
  assert.ok(!fetchBlock.includes("setSemanticQualifications({})"));
  assert.ok(!fetchBlock.includes("setSemanticConsolidationDrafts({})"));
});

test("E · falha de nova coleta preserva a última versão remota", () => {
  const handler = workspace.slice(workspace.indexOf("const handleBatchAllintitle"), workspace.indexOf("const handleBatchQualify"));
  assert.ok(handler.includes("const persistedQualificationIds = qualificationOutcomes.filter(item => item?.persisted)"));
  assert.ok(handler.includes("if (persistedQualificationIds.length > 0 && selectedBrandId)"));
  assert.ok(!handler.includes("applySerpSemanticEvidence("), "a working copy não substitui o artifact");
  assert.ok(consolidation.includes("A última qualificação válida (v${qualification.lifecycle.version}) continua em uso."));
});

test("N/O · leitura, F5 e mount não acionam provider", () => {
  const loader = workspace.slice(workspace.indexOf("const loadSemanticQualifications"), workspace.indexOf("const readCanonicalKeywordRows"));
  for (const forbidden of ["dataforseo", "/api/minerador", "fetch("]) {
    assert.ok(!loader.includes(forbidden), `a reidratação não pode acionar ${forbidden}`);
  }
  // Nenhum efeito de montagem dispara as chamadas pagas.
  for (const auto of ["useEffect(() => { void handleBatchAllintitle", "useEffect(() => { void handleBatchContextualPresentation", "useEffect(() => { void handleBatchVolume"]) {
    assert.ok(!workspace.includes(auto), `mount não pode chamar ${auto}`);
  }
  assert.ok(!workspace.includes('localStorage.setItem("semanticQualifications'));
  assert.ok(!workspace.includes('sessionStorage.setItem("semanticQualifications'));
});

test("F/G · IA segue opcional e a decisão de KGR segue humana", () => {
  const humanReview = panel.slice(panel.indexOf("function HumanReviewPanel"));
  assert.ok(humanReview.includes("const aiReview: ProfileRecord | null = null"));
  assert.ok(humanReview.includes('aria-label="Aplicabilidade do KGR na revisão humana"'));
  assert.equal(readKgrApplicability({}), "pending");
  // KGR inalterado: fórmula e faixa visual.
  assert.equal(calculateKgrFromMetrics(720, 388), 0.5389);
  assert.equal(deriveKgrVisualState(0.249).favorable, true);
  assert.equal(deriveKgrVisualState(0.25).favorable, false);
});

test("os processos continuam independentes depois de reexecutar Resultados", () => {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    funnel: "TOFU",
    logical_output_contract: buildLogicalOutputContract({ semantic: { intencao_principal: "Informativa", funnel: "TOFU" }, intent: "Informativa", funnel: "TOFU" }),
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-28T10:01:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-28T16:00:00.000Z" },
    dna_revisao_humana: "aprovado",
    human_review: { schemaVersion: "r6", status: "completed", decision: "completed", fieldDecisions: [], completedAt: "2026-08-28T15:05:00.000Z", completedBy: "human-1" },
  };
  const state = resolveMineradorProcessState({ id: KEYWORD, keyword: "skin care pele oleosa", volume_search: 90, results_allintitle: 12, analise_semantica: semantic });
  // Medição de Resultado mais nova que a consolidação humana não a invalida.
  assert.equal(state.review.complete, true);
  assert.notEqual(state.review.artifactState, "stale");
  const processState = readFileSync(new URL("../lib/minerador/process-state.ts", import.meta.url), "utf8");
  assert.ok(!processState.includes("semanticQualification"), "a Qualificação não cria invalidação cross-process");
});
