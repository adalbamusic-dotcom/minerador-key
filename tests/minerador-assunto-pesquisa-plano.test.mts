import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBJECT_DISCOVERY_ACTIVE_SOURCES,
  SUBJECT_DISCOVERY_LABS_CALL_MAX_USD,
  SUBJECT_DISCOVERY_LEGACY_PLAN_VERSION,
  SUBJECT_DISCOVERY_MAX_COST_USD,
  SUBJECT_DISCOVERY_NOTICES,
  SUBJECT_DISCOVERY_PLAN_VERSION,
  SUBJECT_DISCOVERY_SOURCE_LABELS,
  SUBJECT_DISCOVERY_SOURCES,
  authorizeSubjectDiscoveryPlan,
  buildSubjectDiscoveryPlan,
  createSubjectDiscoveryBudget,
  listSubjectDiscoveryPaidCalls,
  subjectDiscoveryCallId,
  subjectDiscoveryLedgerKey,
  type BuildSubjectDiscoveryPlanInput,
  type SubjectDiscoveryPaidCall,
  type SubjectDiscoveryPlan,
} from "../lib/minerador/subject-discovery-plan.ts";

/*
 * F1b.11 e SDD 2026-09-28 §3.2 — plano v2 (só Google Ads), planHash,
 * autorização e o orçamento em dólares que a diferenciação ainda usa.
 * Domínio puro.
 */

const BRAND_A = "40000000-0000-4000-8000-00000000000a";
const BRAND_B = "40000000-0000-4000-8000-00000000000b";

function input(overrides: Partial<BuildSubjectDiscoveryPlanInput> = {}): BuildSubjectDiscoveryPlanInput {
  return {
    brandId: BRAND_A,
    phrase: "SEO para clínicas",
    normalizedPhrase: "seo para clinicas",
    subjectKeywordId: null,
    destination: { acceptedUrl: "https://adalba.com.br/seo-clinicas", reason: null },
    adsTargeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    ...overrides,
  };
}

test("plano v2: só as duas linhas do Google Ads, custo zero e nenhuma chamada paga", async () => {
  const plan = await buildSubjectDiscoveryPlan(input());
  assert.equal(plan.version, SUBJECT_DISCOVERY_PLAN_VERSION);
  assert.equal(plan.version, "subject-discovery-plan-v2");
  assert.deepEqual(plan.lines.map(line => line.kind), ["ads_keyword_seed", "ads_url_seed"]);
  for (const line of plan.lines) {
    assert.equal(line.provider, "google_ads");
    assert.equal(line.free, true);
    assert.equal(line.maxCostUsd, 0);
    assert.equal(line.maxItemsPerCall, 300);
  }
  assert.equal(plan.paidCalls, 0);
  assert.equal(plan.maxCostUsd, 0);
  assert.equal(plan.ledgerRecording, true);
  assert.deepEqual(listSubjectDiscoveryPaidCalls(plan), [], "nenhuma chamada DataForSEO");
  assert.ok(plan.notices.includes(SUBJECT_DISCOVERY_NOTICES.free));
  assert.ok(!plan.notices.includes(SUBJECT_DISCOVERY_NOTICES.longPhrase), "o aviso de cobrança por fonte saiu");
  assert.ok(!plan.notices.some(notice => /não será registrado no controle de gastos/.test(notice)), "sem aviso de migration sem linha paga");
});

test("sem SERP da frase nem Labs: nenhuma linha serp_phrase ou labs_*, e o bloco serp vem vazio", async () => {
  const plan = await buildSubjectDiscoveryPlan(input());
  assert.equal(plan.lines.some(line => line.kind === "serp_phrase" || line.kind.startsWith("labs_")), false);
  assert.equal(plan.notApplicable.some(item => item.kind === "serp_phrase" || item.kind.startsWith("labs_")), false);
  assert.deepEqual(plan.serp, { lenses: [], missingLenses: [], cachedLenses: [], readFailed: null });
  assert.equal(plan.lines.some(line => line.provider === "dataforseo"), false);
});

test("sem destino aceito, não há url_seed — e o motivo vai no plano", async () => {
  const plan = await buildSubjectDiscoveryPlan(input({ destination: { acceptedUrl: null, reason: "A página de destino precisa estar no site da marca (adalba.com.br)." } }));
  assert.deepEqual(plan.lines.map(line => line.kind), ["ads_keyword_seed"]);
  assert.equal(plan.destinationUrl, null);
  assert.deepEqual(plan.notApplicable, [{ kind: "ads_url_seed", reason: "A página de destino precisa estar no site da marca (adalba.com.br)." }]);
});

test("planHash é estável e muda com frase, marca, destino, targeting ou Assunto", async () => {
  const base = await buildSubjectDiscoveryPlan(input());
  const again = await buildSubjectDiscoveryPlan(input());
  assert.match(base.planHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(again.planHash, base.planHash);

  const variants = [
    input({ normalizedPhrase: "seo para dentistas", phrase: "SEO para dentistas" }),
    input({ brandId: BRAND_B }),
    input({ destination: { acceptedUrl: "https://adalba.com.br/outra", reason: null } }),
    input({ destination: { acceptedUrl: null, reason: "sem" } }),
    input({ adsTargeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/20106"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false } }),
    input({ adsTargeting: { language: "languageConstants/1000", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false } }),
    input({ subjectKeywordId: "40000000-0000-4000-8000-0000000000cc" }),
  ];
  for (const variant of variants) {
    assert.notEqual((await buildSubjectDiscoveryPlan(variant)).planHash, base.planHash);
  }
});

test("autorização do plano grátis: exige o MESMO planHash, com orçamento 0", async () => {
  const plan = await buildSubjectDiscoveryPlan(input());
  const required = authorizeSubjectDiscoveryPlan(plan, null);
  assert.equal(!required.ok && required.code, "PAID_PLAN_REQUIRED");
  assert.match(!required.ok ? required.message : "", /Nada foi consultado/);

  const otherHash = authorizeSubjectDiscoveryPlan(plan, { planHash: "sha256:outro", maxCostUsd: 0 });
  assert.equal(!otherHash.ok && otherHash.code, "PAID_PLAN_CHANGED");

  assert.deepEqual(authorizeSubjectDiscoveryPlan(plan, { planHash: plan.planHash, maxCostUsd: 0 }), { ok: true, budgetUsd: 0 });
  // Autorização com valor não vira orçamento: o plano não paga nada.
  assert.deepEqual(authorizeSubjectDiscoveryPlan(plan, { planHash: plan.planHash, maxCostUsd: 5 }), { ok: true, budgetUsd: 0 });
});

test("autorização de plano pago (a regra de sempre, que o v1 usava): teto, hash e custo", () => {
  const paid = { planHash: "sha256:pago", maxCostUsd: 0.182, paidCalls: 11 };
  assert.equal(SUBJECT_DISCOVERY_LABS_CALL_MAX_USD, 0.024);
  const required = authorizeSubjectDiscoveryPlan(paid, null);
  assert.equal(!required.ok && required.code, "PAID_PLAN_REQUIRED");
  assert.equal(!authorizeSubjectDiscoveryPlan(paid, { planHash: "sha256:outro", maxCostUsd: 0.2 }).ok, true);
  const lower = authorizeSubjectDiscoveryPlan(paid, { planHash: paid.planHash, maxCostUsd: 0.1 });
  assert.equal(!lower.ok && lower.code, "PAID_PLAN_CHANGED");
  assert.deepEqual(authorizeSubjectDiscoveryPlan(paid, { planHash: paid.planHash, maxCostUsd: 0.182 }), { ok: true, budgetUsd: 0.182 });
  assert.deepEqual(authorizeSubjectDiscoveryPlan(paid, { planHash: paid.planHash, maxCostUsd: 5 }), { ok: true, budgetUsd: SUBJECT_DISCOVERY_MAX_COST_USD });
});

test("plano acima de US$ 0,20 é recusado", () => {
  const refused = authorizeSubjectDiscoveryPlan({ planHash: "sha256:x", maxCostUsd: 0.21, paidCalls: 12 }, { planHash: "sha256:x", maxCostUsd: 0.21 });
  assert.equal(!refused.ok && refused.code, "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP");
});

const PAID_CALLS: SubjectDiscoveryPaidCall[] = [
  ...[1, 2, 3, 4].map(n => ({ callId: subjectDiscoveryCallId("serp", n), endpoint: "serp" as const, n, maxCostUsd: 0.0035, lens: String(n) })),
  { callId: subjectDiscoveryCallId("related_keywords", 1), endpoint: "related_keywords", n: 1, maxCostUsd: 0.024, lens: null },
  { callId: subjectDiscoveryCallId("keyword_ideas", 1), endpoint: "keyword_ideas", n: 1, maxCostUsd: 0.024, lens: null },
];

test("orçamento (usado pela diferenciação): nunca passa do autorizado, em chamadas e em dólares", () => {
  const budget = createSubjectDiscoveryBudget({ maxCostUsd: 0.062, plannedCalls: PAID_CALLS });
  assert.deepEqual(budget.reserve("ranked_keywords:6"), { ok: false, reason: "not_planned" });
  assert.equal(budget.reserveAll(["serp:1", "serp:2", "serp:3", "serp:4"]).ok, true);
  for (const id of ["serp:1", "serp:2", "serp:3", "serp:4"]) budget.settle(id, 0.0035);
  assert.equal(budget.reserve("related_keywords:1").ok, true);
  budget.settle("related_keywords:1", 0.04);
  // 0,014 + 0,04 + 0,024 = 0,078 > 0,062: a próxima não é feita.
  assert.deepEqual(budget.reserve("keyword_ideas:1"), { ok: false, reason: "over_budget" });
  assert.equal(budget.spentUsd, 0.054);
  assert.deepEqual(budget.reserve("serp:1"), { ok: false, reason: "already_used" });
});

test("orçamento: custo não informado conta o máximo; pedido que nunca saiu não conta", () => {
  const budget = createSubjectDiscoveryBudget({ maxCostUsd: 0.2, plannedCalls: PAID_CALLS });
  budget.reserve("related_keywords:1");
  budget.settle("related_keywords:1", null);
  assert.equal(budget.spentUsd, 0.024);
  budget.reserve("keyword_ideas:1");
  budget.settle("keyword_ideas:1", null, false);
  assert.equal(budget.spentUsd, 0.024);
});

test("a chave de idempotência DataForSEO continua a mesma (a diferenciação paga a SERP por ela)", () => {
  const op = "40000000-0000-4000-8000-0000000000dd";
  assert.equal(subjectDiscoveryLedgerKey(op, "serp:1"), `dataforseo:${op}:keyword_research:serp:1`);
  assert.equal(subjectDiscoveryLedgerKey(op, "p2:serp:1:3"), `dataforseo:${op}:keyword_research:p2:serp:1:3`);
});

test("plano v1 antigo continua legível: as chamadas pagas dele saem do jeito de antes", () => {
  const legacy = {
    version: SUBJECT_DISCOVERY_LEGACY_PLAN_VERSION,
    lines: [
      { kind: "serp_phrase" }, { kind: "labs_related" }, { kind: "labs_category" }, { kind: "labs_ranked", calls: 2 },
    ],
    serp: { lenses: [{ lens: "desktop-windows", cached: false }, { lens: "desktop-macos", cached: true }], missingLenses: ["desktop-windows"], cachedLenses: ["desktop-macos"], readFailed: null },
  } as unknown as Pick<SubjectDiscoveryPlan, "lines" | "serp">;
  assert.deepEqual(listSubjectDiscoveryPaidCalls(legacy).map(call => call.callId), ["serp:1", "related_keywords:1", "keyword_ideas:1", "ranked_keywords:1", "ranked_keywords:2"]);
});

test("origens: as 5 continuam legíveis, com rótulo próprio; as ativas são só as do Google Ads", () => {
  for (const source of SUBJECT_DISCOVERY_SOURCES) {
    const label = SUBJECT_DISCOVERY_SOURCE_LABELS[source];
    assert.ok(label && label.trim().length > 0, source);
    assert.notEqual(label, "Google Ads");
  }
  assert.equal(new Set(Object.values(SUBJECT_DISCOVERY_SOURCE_LABELS)).size, SUBJECT_DISCOVERY_SOURCES.length);
  assert.deepEqual([...SUBJECT_DISCOVERY_SOURCES], ["ads_keyword_seed", "ads_url_seed", "labs_related", "labs_category", "labs_ranked"]);
  assert.deepEqual([...SUBJECT_DISCOVERY_ACTIVE_SOURCES], ["ads_keyword_seed", "ads_url_seed"]);
  for (const legacy of ["labs_related", "labs_category", "labs_ranked"] as const) assert.match(SUBJECT_DISCOVERY_SOURCE_LABELS[legacy], /fonte antiga/);
});
