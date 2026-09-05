import assert from "node:assert/strict";
import test from "node:test";
import { applySerpSemanticEvidence, createSemanticConsolidationDraft, resolveSemanticAxis, semanticConsolidationBySerp, updateSemanticConsolidationAxis } from "../lib/minerador/semantic-consolidation-draft.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";

/**
 * Working copy da Qualificação Semântica sob a regra canônica de autoridade:
 * a Lógica é hipótese, a SERP real é evidência e só evidência conclusiva
 * fecha o eixo. Não existe decisão humana semântica nesta camada.
 */

function draft() {
  return createSemanticConsolidationDraft({
    keywordId: "keyword-1",
    brandId: "brand-1",
    intent: { logic: "Comercial", ai: "Comercial" },
    funnel: { logic: "MOFU", ai: "MOFU" },
  });
}

function evidenceFrom(items: Array<{ title: string; description?: string }>) {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-serp-1",
        status_code: 20000,
        result: [{
          keyword: "skin care noturno",
          location_code: 2076,
          language_code: "pt",
          items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, ...item })),
        }],
      }],
    },
    keyword: "skin care noturno",
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

test("evidência conclusiva fecha o eixo sem qualquer confirmação humana", () => {
  const result = applySerpSemanticEvidence(draft(), evidenceFrom(informational));
  assert.deepEqual(resolveSemanticAxis(result.intent), { value: "Informativa", status: "serp_consolidated", reason: null });
  assert.deepEqual(resolveSemanticAxis(result.funnel), { value: "TOFU", status: "serp_consolidated", reason: null });
  assert.equal(semanticConsolidationBySerp(result), true);
  assert.equal(result.localOnly, false);
  assert.equal(result.serpSnapshotRef?.source, "dataforseo_organic");
});

test("a Lógica divergente não sobrevive à evidência conclusiva", () => {
  const result = applySerpSemanticEvidence(draft(), evidenceFrom(informational));
  assert.equal(result.intent.logic, "Comercial");
  assert.equal(resolveSemanticAxis(result.intent).value, "Informativa");
  assert.equal(resolveSemanticAxis(result.funnel).value, "TOFU");
});

test("SERP mista não consolida e não deixa a Lógica virar canônica", () => {
  const mixed = applySerpSemanticEvidence(draft(), evidenceFrom([
    { title: "Comprar sérum noturno", description: "preco" },
    { title: "Melhor sérum noturno", description: "comparativo" },
    { title: "O que é sérum noturno", description: "guia" },
    { title: "Clinica perto de mim", description: "agendar" },
    { title: "Kit noturno com desconto", description: "cupom" },
  ]));
  const resolution = resolveSemanticAxis(mixed.intent);
  assert.equal(resolution.status, "serp_inconclusive");
  assert.equal(resolution.value, null);
  assert.match(resolution.reason || "", /SERP mista/);
  // Os eixos são independentes: o Funil pode fechar sozinho na mesma coleta.
  assert.notEqual(resolveSemanticAxis(mixed.funnel).status, "awaiting_serp");
  assert.equal(semanticConsolidationBySerp(mixed), resolveSemanticAxis(mixed.funnel).status === "serp_consolidated");
});

test("SERP insuficiente é declarada como insuficiente, não como não coletada", () => {
  const scarce = applySerpSemanticEvidence(draft(), evidenceFrom(informational.slice(0, 3)));
  assert.equal(scarce.intent.serpStrength, "insufficient");
  const resolution = resolveSemanticAxis(scarce.intent);
  assert.equal(resolution.status, "serp_inconclusive");
  assert.equal(resolution.value, null);
  assert.match(resolution.reason || "", /insuficiente/);
});

test("sem coleta o eixo fica aguardando evidência, sem valor consolidado", () => {
  const resolution = resolveSemanticAxis(draft().intent);
  assert.equal(resolution.status, "awaiting_serp");
  assert.equal(resolution.value, null);
  assert.equal(semanticConsolidationBySerp(draft()), false);
});

test("a working copy só aceita patch da leitura observada", () => {
  const patched = updateSemanticConsolidationAxis(draft(), "intent", { serp: "Informativa", serpStrength: "conclusive" });
  assert.equal(resolveSemanticAxis(patched.intent).value, "Informativa");
  // Não existe mais campo de decisão humana no eixo.
  assert.deepEqual(Object.keys(patched.intent).sort(), ["ai", "logic", "serp", "serpStrength"]);
});

test("a leitura lógica posterior não altera a working copy já coletada", () => {
  const consolidated = applySerpSemanticEvidence(draft(), evidenceFrom(informational));
  assert.equal(consolidated.intent.logic, "Comercial");
  assert.notEqual(consolidated.intent.logic, "Transacional");
});
