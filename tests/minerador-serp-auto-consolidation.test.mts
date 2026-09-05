import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applySerpSemanticEvidence, createSemanticConsolidationDraft, resolveSemanticAxis } from "../lib/minerador/semantic-consolidation-draft.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";
import { readKgrApplicability, calculateKgrFromMetrics } from "../lib/minerador/kgr-applicability.ts";

/**
 * SERP conclusiva consolida Intenção e Funil automaticamente. Não existe
 * confirmação humana semântica, a IA não participa e a Lógica não vira
 * canônica por fallback. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const consolidation = panel.slice(panel.indexOf("function SemanticConsolidationPanel"), panel.indexOf("function HumanReviewPanel"));
const humanReview = panel.slice(panel.indexOf("function HumanReviewPanel"));

function evidenceFrom(items: Array<{ title: string; description?: string }>, keyword = "skin care noturno") {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-serp-1",
        status_code: 20000,
        result: [{
          keyword,
          location_code: 2076,
          language_code: "pt",
          items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, ...item })),
        }],
      }],
    },
    keyword,
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-serp-1",
    operationRequestId: "11111111-1111-4111-8111-111111111111",
    collectedAt: "2026-08-28T18:00:00.000Z",
  })!;
}

const informational = Array.from({ length: 8 }, (_, index) => ({
  title: `O que é rotina noturna de skin care ${index + 1}`,
  description: "Guia passo a passo para entender a rotina.",
}));

function draftWith(items: Array<{ title: string; description?: string }>, logic = { intent: "Comercial", funnel: "MOFU" }) {
  return applySerpSemanticEvidence(
    createSemanticConsolidationDraft({ keywordId: "k1", brandId: "brand-a", intent: { logic: logic.intent, ai: "Transacional" }, funnel: { logic: logic.funnel, ai: "BOFU" } }),
    evidenceFrom(items),
  );
}

test("A · SERP conclusiva consolida a Intenção automaticamente e sem botão humano", () => {
  const resolution = resolveSemanticAxis(draftWith(informational).intent);
  assert.equal(resolution.status, "serp_consolidated");
  assert.equal(resolution.value, "Informativa");
  for (const control of ["Seguir SERP", "Manter atual", ">Editar<", "Decisão humana local", "Proposta:", "Justificativa", "Valor humano"]) {
    assert.ok(!consolidation.includes(control), `a Qualificação Semântica não pode oferecer "${control}"`);
  }
  assert.ok(!consolidation.includes("<button"), "não existe ação humana nesta camada");
  assert.ok(!consolidation.includes("<input"), "não existe edição semântica nesta camada");
  assert.ok(!consolidation.includes("<textarea"));
});

test("B · SERP conclusiva consolida o Funil pelo próprio eixo", () => {
  const draft = draftWith(informational);
  assert.equal(resolveSemanticAxis(draft.funnel).status, "serp_consolidated");
  assert.equal(resolveSemanticAxis(draft.funnel).value, "TOFU");
  // Leitura consolidada explícita na UI, sem alegar aprovação humana.
  assert.ok(consolidation.includes("Resultado consolidado"));
  assert.ok(consolidation.includes("✓ Consolidado pela SERP"));
  assert.ok(!consolidation.includes("Aprovado pelo humano"));
  assert.ok(consolidation.includes("Lógica · hipótese"));
});

test("C · Lógica divergente perde para a evidência conclusiva, sem 'Manter atual'", () => {
  const draft = draftWith(informational, { intent: "Comercial", funnel: "BOFU" });
  assert.equal(draft.intent.logic, "Comercial");
  assert.equal(resolveSemanticAxis(draft.intent).value, "Informativa");
  assert.equal(resolveSemanticAxis(draft.funnel).value, "TOFU");
  assert.ok(!consolidation.includes("keep_current"));
  assert.ok(!consolidation.includes("follow_serp"));
});

test("D/E · SERP mista, fraca ou insuficiente não consolida e o humano não escolhe valor", () => {
  const mixed = draftWith([
    { title: "Comprar sérum noturno", description: "preco" },
    { title: "Melhor sérum noturno", description: "comparativo" },
    { title: "O que é sérum noturno", description: "guia" },
    { title: "Clinica perto de mim", description: "agendar" },
    { title: "Kit noturno com desconto", description: "cupom" },
  ]);
  const scarce = draftWith(informational.slice(0, 3));
  for (const resolution of [resolveSemanticAxis(mixed.intent), resolveSemanticAxis(scarce.intent)]) {
    assert.equal(resolution.status, "serp_inconclusive");
    assert.equal(resolution.value, null, "sem consolidação não existe valor");
    assert.ok(resolution.reason, "o motivo é declarado");
  }
  // A UI mostra "Não consolidado" com motivo, e nunca uma escolha humana.
  assert.ok(consolidation.includes('"Não consolidado"'));
  assert.ok(consolidation.includes("Motivo: "));
});

test("F · o sinal Labs não altera o valor consolidado", () => {
  const draft = draftWith(informational);
  // O read-model semântico não conhece main_intent, então nenhum sinal Labs entra.
  const evidenceSource = readFileSync(new URL("../lib/minerador/serp-semantic-evidence.ts", import.meta.url), "utf8");
  assert.ok(!evidenceSource.split("*/").slice(1).join("*/").includes("main_intent"));
  const draftSource = readFileSync(new URL("../lib/minerador/semantic-consolidation-draft.ts", import.meta.url), "utf8");
  assert.ok(!draftSource.includes("main_intent") && !draftSource.includes("externalIntent"));
  assert.equal(resolveSemanticAxis(draft.intent).value, "Informativa");
});

test("G · a IA não altera Intenção nem Funil, presente ou ausente", () => {
  const withAi = applySerpSemanticEvidence(
    createSemanticConsolidationDraft({ keywordId: "k2", intent: { logic: "Comercial", ai: "Transacional" }, funnel: { logic: "MOFU", ai: "BOFU" } }),
    evidenceFrom(informational),
  );
  const withoutAi = applySerpSemanticEvidence(
    createSemanticConsolidationDraft({ keywordId: "k3", intent: { logic: "Comercial", ai: null }, funnel: { logic: "MOFU", ai: null } }),
    evidenceFrom(informational),
  );
  assert.deepEqual(resolveSemanticAxis(withAi.intent), resolveSemanticAxis(withoutAi.intent));
  assert.deepEqual(resolveSemanticAxis(withAi.funnel), resolveSemanticAxis(withoutAi.funnel));
  const draftSource = readFileSync(new URL("../lib/minerador/semantic-consolidation-draft.ts", import.meta.url), "utf8");
  const resolver = draftSource.slice(draftSource.indexOf("export function resolveSemanticAxis"), draftSource.indexOf("export function updateSemanticConsolidationAxis"));
  assert.ok(!resolver.includes("axis.ai"), "a IA não entra na resolução");
  assert.ok(!resolver.includes("axis.logic"), "a Lógica não vira canônica por fallback");
});

test("H · a Revisão Humana não confirma semântica, mas mantém a decisão de KGR", () => {
  // O R5 segue neutralizado: nenhum bloco de confirmação de Intenção/Funil.
  assert.ok(humanReview.includes("const aiReview: ProfileRecord | null = null"));
  assert.ok(humanReview.includes("const strategicUnknownRows = aiReview"), "as linhas estratégicas dependem do R5 desligado");
  // A aplicabilidade do KGR continua sendo decisão humana própria.
  assert.ok(humanReview.includes('aria-label="Aplicabilidade do KGR na revisão humana"'));
  assert.ok(humanReview.includes('onAction?.({ type: "kgr"'));
  assert.equal(readKgrApplicability({}), "pending");
  assert.equal(calculateKgrFromMetrics(720, 388), 0.5389);
});

test("I · a working copy continua de sessão e nunca se apresenta como persistida", () => {
  assert.ok(consolidation.includes("Prévia local · ainda não persistida"));
  assert.ok(!consolidation.includes("KeywordDNA persistido"));
  assert.ok(consolidation.includes("working copy local"));
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.ok(!workspace.includes('localStorage.setItem("semanticConsolidationDrafts'), "F5 descarta a working copy");
  assert.match(workspace, /const \[semanticConsolidationDrafts, setSemanticConsolidationDrafts\] = useState/);
});

test("J · nenhuma chamada de provider nos testes", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("REAL_PROVIDER_CALL"); }) as typeof fetch;
  try {
    assert.equal(resolveSemanticAxis(draftWith(informational).intent).value, "Informativa");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(!consolidation.includes("fetch("));
});
