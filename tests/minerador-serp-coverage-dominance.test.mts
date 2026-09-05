import assert from "node:assert/strict";
import test from "node:test";
import {
  SERP_DERIVATION_VERSION,
  deriveSerpSemanticEvidence,
  serpEvidenceRationale,
  serpEvidenceStrengthPresentation,
} from "../lib/minerador/serp-semantic-evidence.ts";

/**
 * Força da evidência = COBERTURA × DOMINÂNCIA × sinais estruturais.
 *
 * Dominância alta sobre cobertura baixa é classificador cego, não conclusão.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

type Item = Record<string, unknown>;

function evidenceFrom(organic: Item[], features: Item[] = []) {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-1",
        result: [{
          keyword: "kw teste",
          location_code: 2076,
          language_code: "pt",
          items: [
            ...organic.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index}.com.br`, ...item })),
            ...features,
          ],
        }],
      }],
    },
    keyword: "kw teste",
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-1",
    operationRequestId: "op-1",
    collectedAt: "2026-08-29T00:00:00.000Z",
  })!;
}

const informational = Array.from({ length: 8 }, (_, index) => ({ title: `O que é rotina ${index}`, description: "guia passo a passo" }));

test("dominância alta sobre cobertura baixa NÃO vira conclusão", () => {
  const evidence = evidenceFrom([
    { title: "O que é sérum", description: "guia" },
    ...Array.from({ length: 5 }, (_, index) => ({ title: `Marca ${index}`, description: "linha" })),
  ]);
  assert.equal(evidence.intent.dominance, 1, "o único item interpretado domina 100%");
  assert.ok(evidence.intent.coverage < 0.3, "mas a cobertura é baixíssima");
  assert.equal(evidence.intent.strength, "insufficient");
  assert.equal(evidence.intent.value, null, "sem certeza artificial por denominador pequeno");
});

test("cobertura e dominância altas fecham o eixo", () => {
  const evidence = evidenceFrom(informational);
  assert.equal(evidence.intent.coverage, 1);
  assert.equal(evidence.intent.dominance, 1);
  assert.equal(evidence.intent.strength, "conclusive");
  assert.equal(evidence.intent.value, "Informativa");
});

test("SERP realmente mista continua mista, e dispersa continua fraca", () => {
  const mixed = evidenceFrom([
    { title: "O que é sérum", description: "guia" },
    { title: "Como aplicar sérum", description: "passo a passo" },
    { title: "Comprar sérum", description: "preco" },
    { title: "Sérum com cupom", description: "desconto" },
    { title: "Marca A", description: "linha" },
    { title: "Marca B", description: "linha" },
  ]);
  assert.equal(mixed.intent.strength, "mixed");
  assert.equal(mixed.intent.value, null);

  const dispersed = evidenceFrom([
    { title: "O que é sérum", description: "guia" },
    { title: "Como aplicar sérum", description: "passo a passo" },
    { title: "Comprar sérum", description: "preco" },
    { title: "Sérum com cupom", description: "desconto" },
    { title: "Melhor sérum", description: "comparativo" },
    { title: "Review do sérum", description: "resenha" },
    { title: "Clinica perto de mim", description: "agendar" },
    { title: "Unidades e endereco", description: "atendimento em SP" },
  ]);
  assert.equal(dispersed.intent.coverage, 1, "tudo foi interpretado");
  assert.ok(dispersed.intent.dominance < 0.4, "mas nenhuma leitura domina");
  assert.equal(dispersed.intent.strength, "weak");
});

test("poucos resultados continuam insuficientes mesmo com cobertura total", () => {
  const evidence = evidenceFrom(informational.slice(0, 3));
  assert.equal(evidence.intent.coverage, 1);
  assert.equal(evidence.intent.strength, "insufficient");
});

test("sinais estruturais do item entram na leitura quando o texto é mudo", () => {
  const evidence = evidenceFrom([
    { title: "MIX-01", description: "sérum com 4 ativos", url: "https://loja.com.br/produto/serum-mix-01", price: { current: 64, currency: "BRL", displayed_price: "R$ 64,00" } },
    { title: "VC-10", description: "sérum de vitamina C", price: { current: 79, currency: "BRL", displayed_price: "R$ 79,00" } },
    { title: "NC-10", description: "sérum de niacinamida", price: { current: 69, currency: "BRL", displayed_price: "R$ 69,00" } },
    { title: "AA-2", description: "sérum renovador", price: { current: 59, currency: "BRL", displayed_price: "R$ 59,00" } },
    { title: "PM-10", description: "sérum antissinais", price: { current: 89, currency: "BRL", displayed_price: "R$ 89,00" } },
    { title: "Dúvidas frequentes", description: "ordem de aplicação", url: "https://loja.com.br/blog/duvidas" },
  ]);
  // Antes, títulos de produto sem marcador viravam "indefinido" e a evidência morria.
  assert.ok(evidence.intent.coverage >= 0.8, "preço e URL de produto passaram a ser lidos");
  assert.equal(evidence.intent.value, "Transacional");
  assert.equal(evidence.intent.strength, "conclusive");
  assert.ok(evidence.sample.some(item => item.signals.includes("preço")));
});

test("blocos de feature reforçam sem inflar a cobertura", () => {
  const withFeatures = evidenceFrom(informational, [
    { type: "people_also_ask", items: [{ question: "Para que serve?" }] },
    { type: "popular_products", items: [{ title: "Kit sérum" }] },
    { type: "ai_overview", items: [{ text: "resumo" }] },
    { type: "related_searches", items: ["sérum barato"] },
  ]);
  assert.equal(withFeatures.intent.observed, informational.length, "features não viram resultados observados");
  assert.deepEqual(
    withFeatures.serpFeatures.map(feature => feature.type).sort(),
    ["ai_overview", "people_also_ask", "popular_products", "related_searches"],
  );
  const reinforcement = withFeatures.intent.structuralSignals.filter(signal => signal.weight > 0).map(signal => signal.signal);
  assert.ok(reinforcement.includes("people_also_ask"));
  assert.ok(reinforcement.includes("popular_products"));
  // O ai_overview é observado, mas nunca decide.
  assert.ok(!reinforcement.includes("ai_overview"));
  assert.ok(withFeatures.intent.structuralSignals.some(signal => signal.signal === "ai_overview" && signal.weight === 0));
});

test("Funil permanece eixo próprio, com a própria cobertura", () => {
  const evidence = evidenceFrom([
    { title: "O que é sérum", description: "guia" },
    { title: "Como aplicar sérum", description: "passo a passo" },
    { title: "Por que usar sérum", description: "guia" },
    { title: "Tudo sobre sérum", description: "guia" },
    { title: "Comprar sérum", description: "preco e frete" },
    { title: "Sérum com cupom", description: "desconto" },
  ]);
  assert.notDeepEqual(evidence.intent.distribution, evidence.funnel.distribution);
  assert.equal(typeof evidence.funnel.coverage, "number");
  assert.equal(typeof evidence.funnel.dominance, "number");
});

test("a força é explicável em uma linha e a versão da derivação é declarada", () => {
  const evidence = evidenceFrom(informational);
  const rationale = serpEvidenceRationale(evidence.intent);
  assert.match(rationale, /100% de cobertura \(8\/8\)/);
  assert.match(rationale, /100% de dominância/);
  assert.equal(SERP_DERIVATION_VERSION, "serp-semantic-derivation-v2");
  assert.equal(serpEvidenceStrengthPresentation("conclusive").label, "Evidência forte");
  assert.equal(serpEvidenceStrengthPresentation("weak").label, "Evidência fraca");
  assert.equal(serpEvidenceStrengthPresentation("insufficient").label, "Evidência insuficiente");
  assert.equal(serpEvidenceStrengthPresentation("mixed").label, "Evidência mista");
});

test("o sinal Labs continua fora da derivação", () => {
  const evidence = evidenceFrom(informational, [{ type: "knowledge_graph", items: [{ title: "principia" }] }]);
  assert.ok(!JSON.stringify(evidence).includes("main_intent"));
  assert.equal(evidence.intent.value, "Informativa");
});
