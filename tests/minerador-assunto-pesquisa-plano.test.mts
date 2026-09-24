import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBJECT_DISCOVERY_LABS_CALL_MAX_USD,
  SUBJECT_DISCOVERY_MAX_COST_USD,
  SUBJECT_DISCOVERY_NOTICES,
  SUBJECT_DISCOVERY_SOURCE_LABELS,
  SUBJECT_DISCOVERY_SOURCES,
  authorizeSubjectDiscoveryPlan,
  buildSubjectDiscoveryPlan,
  createSubjectDiscoveryBudget,
  listSubjectDiscoveryPaidCalls,
  subjectDiscoveryLedgerKey,
  type BuildSubjectDiscoveryPlanInput,
} from "../lib/minerador/subject-discovery-plan.ts";

/* F1b.11 — plano, planHash, autorização e orçamento em dólares. Domínio puro. */

const BRAND_A = "40000000-0000-4000-8000-00000000000a";
const BRAND_B = "40000000-0000-4000-8000-00000000000b";
const LENSES = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];

function input(overrides: Partial<BuildSubjectDiscoveryPlanInput> = {}): BuildSubjectDiscoveryPlanInput {
  return {
    brandId: BRAND_A,
    phrase: "SEO para clínicas",
    normalizedPhrase: "seo para clinicas",
    subjectKeywordId: null,
    destination: { acceptedUrl: "https://adalba.com.br/seo-clinicas", reason: null },
    adsTargeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    serpLenses: LENSES.map(lens => ({ lens, cached: false })),
    serpReadFailed: null,
    ledgerRecording: true,
    ...overrides,
  };
}

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

test("totais e tetos batem com a tabela da F1b.10: US$ 0,182 no pior caso, abaixo de US$ 0,20", async () => {
  const plan = await buildSubjectDiscoveryPlan(input());
  assert.equal(SUBJECT_DISCOVERY_LABS_CALL_MAX_USD, 0.024);
  const byKind = Object.fromEntries(plan.lines.map(line => [line.kind, line]));
  assert.equal(byKind.ads_keyword_seed.maxCostUsd, 0);
  assert.equal(byKind.ads_keyword_seed.free, true);
  assert.equal(byKind.ads_keyword_seed.maxItemsPerCall, 300);
  assert.equal(byKind.ads_url_seed.maxCostUsd, 0);
  assert.equal(byKind.serp_phrase.calls, 4);
  assert.equal(round(byKind.serp_phrase.maxCostUsd), 0.014);
  assert.equal(byKind.labs_related.maxCostUsd, 0.024);
  assert.equal(byKind.labs_related.params.depth, 2);
  assert.equal(byKind.labs_category.maxCostUsd, 0.024);
  assert.equal(byKind.labs_ranked.calls, 5);
  assert.equal(round(byKind.labs_ranked.maxCostUsd), 0.12);
  assert.equal(plan.maxCostUsd, 0.182);
  assert.ok(plan.maxCostUsd <= SUBJECT_DISCOVERY_MAX_COST_USD);
  assert.equal(plan.paidCalls, 11);
  assert.equal(plan.hardCapUsd, 0.2);
  assert.ok(plan.notices.includes(SUBJECT_DISCOVERY_NOTICES.longPhrase));
});

test("todas as lentes em cache → nenhuma linha de SERP e 0 lentes a pagar", async () => {
  const plan = await buildSubjectDiscoveryPlan(input({ serpLenses: LENSES.map(lens => ({ lens, cached: true })) }));
  assert.equal(plan.lines.some(line => line.kind === "serp_phrase"), false);
  assert.deepEqual(plan.serp.missingLenses, []);
  assert.deepEqual(plan.serp.cachedLenses, LENSES);
  assert.equal(plan.maxCostUsd, 0.168);
  assert.equal(listSubjectDiscoveryPaidCalls(plan).some(call => call.endpoint === "serp"), false);
});

test("cache de SERP ilegível → nenhuma SERP paga e nenhuma fonte 5; as fontes 1 a 4 seguem", async () => {
  const plan = await buildSubjectDiscoveryPlan(input({ serpReadFailed: "timeout" }));
  assert.deepEqual(plan.lines.map(line => line.kind), ["ads_keyword_seed", "ads_url_seed", "labs_related", "labs_category"]);
  assert.deepEqual(plan.notApplicable.map(item => item.kind), ["serp_phrase", "labs_ranked"]);
  assert.equal(plan.maxCostUsd, 0.048);
});

test("sem destino aceito, não há url_seed — e o motivo vai no plano", async () => {
  const plan = await buildSubjectDiscoveryPlan(input({ destination: { acceptedUrl: null, reason: "A página de destino precisa estar no site da marca (adalba.com.br)." } }));
  assert.equal(plan.lines.some(line => line.kind === "ads_url_seed"), false);
  assert.equal(plan.destinationUrl, null);
  assert.deepEqual(plan.notApplicable, [{ kind: "ads_url_seed", reason: "A página de destino precisa estar no site da marca (adalba.com.br)." }]);
});

test("planHash é estável e muda com frase, marca, destino, lentes em falta ou targeting", async () => {
  const base = await buildSubjectDiscoveryPlan(input());
  const again = await buildSubjectDiscoveryPlan(input());
  assert.match(base.planHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(again.planHash, base.planHash);
  // Aviso de ledger não muda o que se paga: o hash fica.
  assert.equal((await buildSubjectDiscoveryPlan(input({ ledgerRecording: false }))).planHash, base.planHash);

  const variants = [
    input({ normalizedPhrase: "seo para dentistas", phrase: "SEO para dentistas" }),
    input({ brandId: BRAND_B }),
    input({ destination: { acceptedUrl: "https://adalba.com.br/outra", reason: null } }),
    input({ destination: { acceptedUrl: null, reason: "sem" } }),
    input({ serpLenses: LENSES.map((lens, index) => ({ lens, cached: index === 0 })) }),
    input({ adsTargeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/20106"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false } }),
    input({ subjectKeywordId: "40000000-0000-4000-8000-0000000000cc" }),
  ];
  for (const variant of variants) {
    assert.notEqual((await buildSubjectDiscoveryPlan(variant)).planHash, base.planHash);
  }
});

test("PAID_PLAN_REQUIRED e PAID_PLAN_CHANGED não liberam orçamento nenhum", async () => {
  const plan = await buildSubjectDiscoveryPlan(input());
  const required = authorizeSubjectDiscoveryPlan(plan, null);
  assert.equal(required.ok, false);
  assert.equal(!required.ok && required.code, "PAID_PLAN_REQUIRED");

  const otherHash = authorizeSubjectDiscoveryPlan(plan, { planHash: "sha256:outro", maxCostUsd: 0.2 });
  assert.equal(!otherHash.ok && otherHash.code, "PAID_PLAN_CHANGED");

  const lower = authorizeSubjectDiscoveryPlan(plan, { planHash: plan.planHash, maxCostUsd: 0.1 });
  assert.equal(!lower.ok && lower.code, "PAID_PLAN_CHANGED");

  const ok = authorizeSubjectDiscoveryPlan(plan, { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd });
  assert.deepEqual(ok, { ok: true, budgetUsd: 0.182 });
  // Autorização acima do teto rígido nunca vira orçamento acima dele.
  assert.deepEqual(authorizeSubjectDiscoveryPlan(plan, { planHash: plan.planHash, maxCostUsd: 5 }), { ok: true, budgetUsd: 0.2 });
});

test("plano acima de US$ 0,20 é recusado", () => {
  const refused = authorizeSubjectDiscoveryPlan({ planHash: "sha256:x", maxCostUsd: 0.21, paidCalls: 12 }, { planHash: "sha256:x", maxCostUsd: 0.21 });
  assert.equal(!refused.ok && refused.code, "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP");
});

test("orçamento: nunca passa do autorizado, em chamadas e em dólares", async () => {
  const plan = await buildSubjectDiscoveryPlan(input());
  const calls = listSubjectDiscoveryPaidCalls(plan);
  assert.deepEqual(calls.map(call => call.callId), ["serp:1", "serp:2", "serp:3", "serp:4", "related_keywords:1", "keyword_ideas:1", "ranked_keywords:1", "ranked_keywords:2", "ranked_keywords:3", "ranked_keywords:4", "ranked_keywords:5"]);
  const budget = createSubjectDiscoveryBudget({ maxCostUsd: plan.maxCostUsd, plannedCalls: calls });

  // Chamada fora do plano: recusada.
  assert.deepEqual(budget.reserve("ranked_keywords:6"), { ok: false, reason: "not_planned" });
  // SERP como unidade.
  assert.equal(budget.reserveAll(["serp:1", "serp:2", "serp:3", "serp:4"]).ok, true);
  for (const id of ["serp:1", "serp:2", "serp:3", "serp:4"]) budget.settle(id, 0.0035);
  // A task informa custo muito acima da tabela.
  assert.equal(budget.reserve("related_keywords:1").ok, true);
  budget.settle("related_keywords:1", 0.15);
  // 0,014 + 0,15 + 0,024 = 0,188 > 0,182: a próxima não é feita.
  assert.deepEqual(budget.reserve("keyword_ideas:1"), { ok: false, reason: "over_budget" });
  assert.equal(budget.spentUsd, 0.164);
  // A mesma vaga não é usada duas vezes.
  assert.deepEqual(budget.reserve("serp:1"), { ok: false, reason: "already_used" });
});

test("orçamento: custo não informado conta o máximo; pedido que nunca saiu não conta", async () => {
  const plan = await buildSubjectDiscoveryPlan(input({ serpLenses: LENSES.map(lens => ({ lens, cached: true })) }));
  const budget = createSubjectDiscoveryBudget({ maxCostUsd: plan.maxCostUsd, plannedCalls: listSubjectDiscoveryPaidCalls(plan) });
  budget.reserve("related_keywords:1");
  budget.settle("related_keywords:1", null);
  assert.equal(budget.spentUsd, 0.024);
  budget.reserve("keyword_ideas:1");
  budget.settle("keyword_ideas:1", null, false);
  assert.equal(budget.spentUsd, 0.024);
});

test("uma chave de idempotência por chamada DataForSEO", async () => {
  const plan = await buildSubjectDiscoveryPlan(input());
  const op = "40000000-0000-4000-8000-0000000000dd";
  const keys = listSubjectDiscoveryPaidCalls(plan).map(call => subjectDiscoveryLedgerKey(op, call.callId));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], `dataforseo:${op}:keyword_research:serp:1`);
  assert.ok(keys.includes(`dataforseo:${op}:keyword_research:related_keywords:1`));
});

test("capability nula → ledgerRecording false e o aviso da migration", async () => {
  const plan = await buildSubjectDiscoveryPlan(input({ ledgerRecording: false }));
  assert.equal(plan.ledgerRecording, false);
  assert.ok(plan.notices.some(notice => /não será registrado no controle de gastos/.test(notice) && /20260924120000_dataforseo_keyword_research_operation\.sql/.test(notice)));
});

test("cada origem tem rótulo próprio e nenhuma é rotulada \"Google Ads\" sozinha", () => {
  for (const source of SUBJECT_DISCOVERY_SOURCES) {
    const label = SUBJECT_DISCOVERY_SOURCE_LABELS[source];
    assert.ok(label && label.trim().length > 0, source);
    assert.notEqual(label, "Google Ads");
  }
  assert.equal(new Set(Object.values(SUBJECT_DISCOVERY_SOURCE_LABELS)).size, SUBJECT_DISCOVERY_SOURCES.length);
});
