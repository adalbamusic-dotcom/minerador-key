import assert from "node:assert/strict";
import test from "node:test";
import {
  SubjectDiscoverySearchRequestSchema,
  mergeSubjectDiscoveryCandidates,
  runSubjectDiscoverySearch,
  selectSubjectDiscoveryTopUrls,
  type SubjectDiscoveryExecuteResponse,
  type SubjectDiscoveryExecutionPorts,
  type SubjectDiscoveryPlanResponse,
  type SubjectDiscoveryPorts,
  type SubjectDiscoverySerpRequest,
  type SubjectDiscoveryUsageEvent,
} from "../lib/minerador/subject-discovery-search.ts";
import type { DataForSeoLabsResearchRequest, DataForSeoLabsResearchResult } from "../lib/minerador/dataforseo-labs-keyword-research-core.ts";
import { DataForSeoLabsResearchError } from "../lib/minerador/dataforseo-labs-keyword-research-core.ts";
import { subjectDiscoveryCallId, subjectDiscoveryLedgerKey } from "../lib/minerador/subject-discovery-plan.ts";

/*
 * F1b.11 — plano e execução da Pesquisa por Assunto com portas falsas.
 * Nenhuma rede: o fetch global falha o teste. Nenhuma credencial: a porta de
 * execução falha o teste quando o plano a abre.
 */

globalThis.fetch = (async () => { throw new Error("Rede proibida no teste da Pesquisa por Assunto."); }) as typeof fetch;

const BRAND = "50000000-0000-4000-8000-00000000000a";
const SUBJECT_ID = "50000000-0000-4000-8000-0000000000a1";
const OTHER_BRAND_SUBJECT_ID = "50000000-0000-4000-8000-0000000000b1";
const WITHDRAWN_ID = "50000000-0000-4000-8000-0000000000a2";
const MOVED_DESTINATION_ID = "50000000-0000-4000-8000-0000000000a3";
const SITE = "https://adalba.com.br";
const NOW = new Date("2026-09-24T12:00:00+00:00");
const LENSES = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];

const declared = (note: string, destinationUrl: string | null) => ({ declared: true, note, destinationUrl, destinationCheck: destinationUrl ? { hostMatchesBrand: true, catalogPageType: null, catalogTitle: null, checkedAt: "2026-09-20T10:00:00+00:00" } : null });

const SUBJECTS: Record<string, { id: string; keyword: string; keywordSubject: unknown }> = {
  [SUBJECT_ID]: { id: SUBJECT_ID, keyword: "SEO para clínicas", keywordSubject: declared("Para donos de clínica", `${SITE}/seo-clinicas`) },
  [WITHDRAWN_ID]: { id: WITHDRAWN_ID, keyword: "SEO antigo", keywordSubject: null },
  [MOVED_DESTINATION_ID]: { id: MOVED_DESTINATION_ID, keyword: "SEO para dentistas", keywordSubject: declared("Para dentistas", "https://site-antigo.com.br/seo") },
};

const labelOf = (request: SubjectDiscoverySerpRequest) => `${request.query.lens.device}-${request.query.lens.operatingSystem}`;

function digest(urls: Array<[string, number]>) {
  return { version: "organic-digest-v1" as const, keyword: "seo para clinicas", depth: 10, organic: urls.map(([url, rank]) => ({ rank_group: rank, url })), blocks: [], sellers: [] };
}

function body(urls: Array<[string, number]>) {
  return { tasks: [{ id: "serp-task", status_code: 20000, cost: 0.0035, result: [{ keyword: "seo para clinicas", items: urls.map(([url, rank]) => ({ type: "organic", rank_group: rank, url })) }] }] };
}

const SERP_URLS: Record<string, Array<[string, number]>> = {
  "desktop-windows": [["https://a.com/1", 1], ["https://b.com/2", 2], ["https://c.com/3", 3]],
  "desktop-macos": [["https://b.com/2", 1], ["https://d.com/4", 4]],
  "mobile-android": [["https://e.com/5", 2], ["https://f.com/6", 6]],
  "mobile-ios": [["https://g.com/7", 5], ["https://a.com/1", 1]],
};

type Options = {
  siteUrl?: string | null;
  cachedLenses?: string[];
  oldExtraWithoutDigest?: string[];
  serpReadFails?: boolean;
  ledgerCapability?: boolean;
  ledgerConflict?: boolean;
  existing?: Array<{ id: string; keyword: string }>;
  existingFails?: boolean;
  labs?: (request: DataForSeoLabsResearchRequest) => DataForSeoLabsResearchResult;
  adsIdeas?: Record<string, string[]>;
  holdLabs?: Promise<void>;
  /** A canônica está no cache (meta), mas sem corpo: a leitura em `body` a descarta. */
  canonicalWithoutBody?: boolean;
};

function labsResult(request: DataForSeoLabsResearchRequest, keywords: string[], cost = 0.02): DataForSeoLabsResearchResult {
  return {
    kind: request.kind,
    endpoint: `/v3/dataforseo_labs/google/${request.kind}/live`,
    provider: "dataforseo",
    providerVersion: "v3",
    providerRequestId: `labs-${request.kind}`,
    cost,
    totalCount: keywords.length,
    droppedByRank: 0,
    keywords: keywords.map(keyword => ({
      keyword,
      estimate: { searchVolume: 999, label: "Estimativa DataForSEO" as const },
      relatedDepth: request.kind === "related_keywords" ? 1 : null,
      ranked: request.kind === "ranked_keywords" ? { url: request.targetUrl, rankGroup: 4 } : null,
    })),
  };
}

function harness(options: Options = {}) {
  const log = {
    lookups: [] as string[],
    opened: 0,
    serpCollects: [] as string[],
    labs: [] as DataForSeoLabsResearchRequest[],
    ads: [] as Array<{ kind: string; url?: string; geo: string[] }>,
    adsUsage: [] as Array<{ suffix: string; resultStatus: string }>,
    usageFinds: [] as string[],
  };
  const ledger = new Map<string, SubjectDiscoveryUsageEvent>();
  const cached = new Set(options.cachedLenses || []);
  const exec: SubjectDiscoveryExecutionPorts = {
    ledgerCapability: options.ledgerCapability ?? true,
    async findUsage(key) { log.usageFinds.push(key); return ledger.has(key); },
    async collectSerp(request, hooks) {
      hooks.onRequestStarted();
      const lens = labelOf(request);
      log.serpCollects.push(lens);
      const urls = SERP_URLS[lens];
      return { providerRequestId: `serp-${lens}`, costUsd: lens === "desktop-windows" ? 0.0035 : 0.002, digest: digest(urls), organicCount: urls.length, stored: true, error: null };
    },
    async runLabs(request, hooks) {
      if (options.holdLabs) await options.holdLabs;
      hooks.onRequestStarted();
      log.labs.push(request);
      if (options.labs) return options.labs(request);
      if (request.kind === "related_keywords") return labsResult(request, ["Marketing para Clínicas", "captar pacientes", "SEO para clínicas"]);
      if (request.kind === "keyword_ideas") return labsResult(request, ["marketing para clinicas", "site para clínica"]);
      return labsResult(request, [`ranqueada por ${new URL(request.targetUrl).hostname}`]);
    },
    async recordDataForSeoUsage(event) {
      if (options.ledgerConflict) throw Object.assign(new Error("A idempotency key já foi usada por outra operação."), { code: "INTEGRATION_IDEMPOTENCY_CONFLICT" });
      ledger.set(event.idempotencyKey, event);
      return options.ledgerCapability === false ? "skipped" : "recorded";
    },
    async googleAdsIdeas(seed, targeting) {
      log.ads.push({ kind: seed.kind, url: seed.kind === "keyword_and_url" ? seed.url : undefined, geo: targeting.geoTargetConstants });
      const keywords = (options.adsIdeas || { keyword: ["marketing para clínicas", "agência de marketing médico"], keyword_and_url: ["seo médico"] })[seed.kind] || [];
      return { requestId: `ads-${seed.kind}`, ideas: keywords.map(keyword => ({ keyword, averageMonthlySearches: 1300, competition: "HIGH", competitionIndex: 80, averageCpcMicros: "2500000", lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: "BRL" })) };
    },
    async recordGoogleAdsUsage(event) { log.adsUsage.push({ suffix: event.suffix, resultStatus: event.resultStatus }); },
  };
  let executionAllowed = false;
  const ports: SubjectDiscoveryPorts = {
    now: () => NOW,
    readBrandSiteUrl: async () => (options.siteUrl === undefined ? SITE : options.siteUrl),
    // A porta real filtra brand_id = marca da rota; aqui só existem as da marca A.
    readSubjectKeyword: async id => SUBJECTS[id] ?? null,
    async lookupSerp(requests, mode) {
      log.lookups.push(mode);
      if (options.serpReadFails) throw new Error("banco fora");
      return requests.map(request => {
        const lens = labelOf(request);
        if (!cached.has(lens)) return null;
        if (mode === "meta") return {};
        if (mode === "body") return options.canonicalWithoutBody && lens === "desktop-windows" ? null : { body: body(SERP_URLS[lens]) };
        return { digest: options.oldExtraWithoutDigest?.includes(lens) ? null : digest(SERP_URLS[lens]) };
      });
    },
    findLedgerCapability: async () => options.ledgerCapability ?? true,
    async readExistingKeywords() {
      if (options.existingFails) throw new Error("banco fora");
      return options.existing || [];
    },
    async openExecution() {
      log.opened += 1;
      if (!executionAllowed) assert.fail("O plano abriu credencial (Connection/Secret Store).");
      return exec;
    },
  };
  return { ports, log, ledger, allowExecution: () => { executionAllowed = true; } };
}

const targeting = { language: "languageConstants/1014", selectedStates: ["Todos os estados"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false };
const OP = "50000000-0000-4000-8000-0000000000f1";

function request(overrides: Record<string, unknown> = {}) {
  return SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", phrase: "SEO para clínicas", note: "Para donos de clínica", destinationUrl: `${SITE}/seo-clinicas`, targeting, ...overrides });
}

async function planFor(h: ReturnType<typeof harness>, overrides: Record<string, unknown> = {}) {
  const outcome = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "plan", ...overrides }) }, h.ports);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  return (outcome.body as SubjectDiscoveryPlanResponse).plan;
}

async function executeWith(h: ReturnType<typeof harness>, overrides: Record<string, unknown> = {}, operationRequestId = OP) {
  const plan = await planFor(h, overrides);
  h.allowExecution();
  return runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "execute", operationRequestId, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd }, ...overrides }) }, h.ports);
}

test("plan: não abre credencial, lê o cache só em meta e não chama provider nenhum", async () => {
  const h = harness({ cachedLenses: ["desktop-macos"] });
  const plan = await planFor(h);
  assert.equal(h.log.opened, 0);
  assert.deepEqual(h.log.lookups, ["meta"]);
  assert.equal(h.log.labs.length + h.log.serpCollects.length + h.log.ads.length, 0);
  assert.deepEqual(plan.serp.missingLenses, ["desktop-windows", "mobile-android", "mobile-ios"]);
  assert.equal(plan.destinationUrl, `${SITE}/seo-clinicas`);
  assert.equal(plan.lines.find(line => line.kind === "ads_url_seed")?.maxCostUsd, 0);
});

test("plan: capability nula → ledgerRecording false, com o aviso", async () => {
  const plan = await planFor(harness({ ledgerCapability: false }));
  assert.equal(plan.ledgerRecording, false);
  assert.ok(plan.notices.some(notice => notice.includes("controle de gastos")));
});

test("Assunto declarado: outra marca e inexistente dão o mesmo 404; retirado dá 409; nada é pago", async () => {
  for (const mode of ["plan", "execute"]) {
    const h = harness();
    h.allowExecution();
    const extra = mode === "execute" ? { operationRequestId: OP, authorizedPlan: { planHash: "sha256:x", maxCostUsd: 0.2 } } : {};
    const other = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode, subjectKeywordId: OTHER_BRAND_SUBJECT_ID, ...extra }) }, h.ports);
    const missing = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode, subjectKeywordId: "50000000-0000-4000-8000-0000000000ff", ...extra }) }, h.ports);
    assert.equal(other.status, 404);
    assert.deepEqual(other.body, missing.body);
    const withdrawn = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode, subjectKeywordId: WITHDRAWN_ID, ...extra }) }, h.ports);
    assert.equal(withdrawn.status, 409);
    assert.equal(!withdrawn.body.success && withdrawn.body.code, "SUBJECT_NOT_DECLARED");
    assert.equal(h.log.opened + h.log.labs.length + h.log.serpCollects.length + h.log.ads.length, 0);
  }
});

test("Assunto declarado: o servidor usa a frase e o destino gravados, não o texto da tela", async () => {
  const h = harness();
  const plan = await planFor(h, { subjectKeywordId: SUBJECT_ID, phrase: "texto da tela", destinationUrl: "https://outro.com/x" });
  assert.equal(plan.normalizedPhrase, "seo para clinicas");
  assert.equal(plan.subjectKeywordId, SUBJECT_ID);
  assert.equal(plan.destinationUrl, `${SITE}/seo-clinicas`);
});

test("destino de Assunto declarado que deixou de casar com o site atual → sem url_seed no execute", async () => {
  const h = harness();
  const outcome = await executeWith(h, { subjectKeywordId: MOVED_DESTINATION_ID });
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  const response = outcome.body as SubjectDiscoveryExecuteResponse;
  assert.equal(response.subject.destination.status, "NO_LONGER_ON_BRAND_SITE");
  assert.deepEqual(h.log.ads.map(call => call.kind), ["keyword"]);
  assert.equal(response.sources.find(source => source.source === "ads_url_seed")?.status, "not_applicable");
});

test("sem destino, fora do domínio, EMPTY ou NO_BRAND_SITE → sem url_seed; só ACCEPTED gera url_seed", async () => {
  const cases: Array<[Record<string, unknown>, Options, string]> = [
    [{ destinationUrl: null }, {}, "EMPTY"],
    [{ destinationUrl: "https://outro.com/seo" }, {}, "OUTSIDE_BRAND_SITE"],
    [{ destinationUrl: `${SITE}/seo-clinicas` }, { siteUrl: null }, "NO_BRAND_SITE"],
  ];
  for (const [overrides, options, status] of cases) {
    const h = harness(options);
    const outcome = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "plan", ...overrides }) }, h.ports);
    const response = outcome.body as SubjectDiscoveryPlanResponse;
    assert.equal(response.subject.destination.status, status);
    assert.ok(response.subject.destination.reason);
    assert.equal(response.plan.lines.some(line => line.kind === "ads_url_seed"), false);
    assert.equal(response.plan.notApplicable.some(item => item.kind === "ads_url_seed" && item.reason), true);
  }
  const accepted = await planFor(harness());
  assert.equal(accepted.lines.some(line => line.kind === "ads_url_seed"), true);
});

test("PAID_PLAN_REQUIRED e PAID_PLAN_CHANGED não abrem credencial nem pagam", async () => {
  const h = harness();
  h.allowExecution();
  const required = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "execute", operationRequestId: OP }) }, h.ports);
  assert.equal(required.status, 409);
  assert.equal(!required.body.success && required.body.code, "PAID_PLAN_REQUIRED");
  assert.ok(!required.body.success && required.body.plan);

  const plan = await planFor(h);
  const changed = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "execute", operationRequestId: OP, phrase: "SEO para dentistas", authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd } }) }, h.ports);
  assert.equal(!changed.body.success && changed.body.code, "PAID_PLAN_CHANGED");
  assert.notEqual(!changed.body.success && changed.body.plan?.planHash, plan.planHash);
  assert.equal(h.log.opened + h.log.labs.length + h.log.serpCollects.length + h.log.ads.length, 0);
});

test("execute: as 5 fontes, a SERP das lentes que faltam e as origens todas de cada candidata", async () => {
  const h = harness({ cachedLenses: ["desktop-macos"], existing: [{ id: "50000000-0000-4000-8000-0000000000e1", keyword: "Captar Pacientes" }] });
  const outcome = await executeWith(h, { targeting: { ...targeting, selectedStates: ["SP"] } });
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  const response = outcome.body as SubjectDiscoveryExecuteResponse;

  // SERP: só as 3 que faltavam; a canônica com corpo, as outras sem.
  assert.deepEqual(h.log.serpCollects, ["desktop-windows", "mobile-android", "mobile-ios"]);
  assert.deepEqual(response.serp.lenses.map(lens => lens.source), ["collected", "cache", "collected", "collected"]);
  // UF só no Google Ads; Labs sempre 2076 + "pt".
  assert.deepEqual(h.log.ads.map(call => call.geo), [["geoTargetConstants/20106"], ["geoTargetConstants/20106"]]);
  for (const call of h.log.labs) { assert.equal(call.locationCode, 2076); assert.equal(call.languageCode, "pt"); }
  assert.deepEqual(h.log.labs.map(call => call.kind), ["related_keywords", "keyword_ideas", "ranked_keywords", "ranked_keywords", "ranked_keywords", "ranked_keywords", "ranked_keywords"]);
  assert.deepEqual(h.log.adsUsage, [{ suffix: "keyword_seed", resultStatus: "succeeded" }, { suffix: "url_seed", resultStatus: "succeeded" }]);

  const byKey = new Map(response.candidates.map(candidate => [candidate.normalizedKeyword, candidate]));
  const marketing = byKey.get("marketing para clinicas");
  assert.ok(marketing);
  assert.deepEqual(marketing.origins, ["ads_keyword_seed", "labs_related", "labs_category"]);
  assert.equal(marketing.googleAds?.averageMonthlySearches, 1300);
  assert.equal(response.candidates[0].normalizedKeyword, "marketing para clinicas");
  assert.equal(byKey.get("seo para clinicas")?.isSubjectPhrase, true);
  assert.equal(byKey.get("captar pacientes")?.existingKeywordId, "50000000-0000-4000-8000-0000000000e1");
  assert.equal(byKey.get("site para clinica")?.existingKeywordId, null);
  assert.equal(response.subject.phraseExistingKeywordId, null);
  assert.ok(response.sources.every(source => source.status === "ok"));
  assert.equal(response.ledgerRecording, true);
  assert.equal(response.ledgerWarning, null);
  // Um evento por chamada DataForSEO: 3 lentes + 2 + 5 ranked.
  assert.equal(h.ledger.size, 10);
  assert.ok([...h.ledger.keys()].every(key => key.startsWith(`dataforseo:${OP}:keyword_research:`)));
});

test("volume: a estimativa do Labs nunca vira volume nem métrica do Google Ads", async () => {
  const h = harness();
  const response = (await executeWith(h)).body as SubjectDiscoveryExecuteResponse;
  const onlyLabs = response.candidates.find(candidate => candidate.normalizedKeyword === "site para clinica");
  assert.ok(onlyLabs);
  assert.equal(onlyLabs.googleAds, null);
  assert.deepEqual(onlyLabs.dataForSeoEstimate, { searchVolume: 999, label: "Estimativa DataForSEO" });
  assert.doesNotMatch(JSON.stringify(response.candidates), /"volume"|"volume_search"|"averageMonthlySearches":999/);
});

test("orçamento: a task que informa custo acima da tabela barra as chamadas seguintes", async () => {
  const h = harness({ cachedLenses: LENSES, labs: request => labsResult(request, ["termo"], request.kind === "related_keywords" ? 0.15 : 0.02) });
  const response = (await executeWith(h)).body as SubjectDiscoveryExecuteResponse;
  assert.deepEqual(h.log.labs.map(call => call.kind), ["related_keywords"]);
  const status = Object.fromEntries(response.sources.map(source => [source.source, source.status]));
  assert.equal(status.labs_related, "ok");
  assert.equal(status.labs_category, "skipped_budget");
  assert.equal(status.labs_ranked, "skipped_budget");
  assert.ok(response.budgetSpentUsd <= response.plan.maxCostUsd);
  assert.equal(response.reportedCostUsd, 0.15);
});

test("repetição: evento já no ledger → OPERATION_ALREADY_EXECUTED sem nenhuma chamada", async () => {
  const h = harness();
  const first = await executeWith(h);
  assert.equal(first.status, 200);
  const callsAfterFirst = { labs: h.log.labs.length, serp: h.log.serpCollects.length, ads: h.log.ads.length };
  // O mesmo operationRequestId com um plano novo (agora a SERP da frase está no ledger).
  const again = await executeWith(h);
  assert.equal(again.status, 409);
  assert.equal(!again.body.success && again.body.code, "OPERATION_ALREADY_EXECUTED");
  assert.deepEqual({ labs: h.log.labs.length, serp: h.log.serpCollects.length, ads: h.log.ads.length }, callsAfterFirst);
});

test("repetição: a chave de uma chamada que NÃO é a primeira já no ledger também barra, sem nenhuma chamada", async () => {
  const h = harness({ cachedLenses: LENSES });
  // A primeira chamada paga (related) não foi gravada; a de ideias foi.
  h.ledger.set(subjectDiscoveryLedgerKey(OP, subjectDiscoveryCallId("keyword_ideas", 1)), {} as SubjectDiscoveryUsageEvent);
  const again = await executeWith(h);
  assert.equal(again.status, 409);
  assert.equal(!again.body.success && again.body.code, "OPERATION_ALREADY_EXECUTED");
  assert.equal(h.log.labs.length + h.log.serpCollects.length + h.log.ads.length, 0);
  assert.ok(h.log.usageFinds.length > 1, "todas as chaves planejadas são conferidas");
});

test("execute recusado não lê corpo nem digest do cache: só meta", async () => {
  const h = harness({ cachedLenses: LENSES });
  h.allowExecution();
  const required = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "execute", operationRequestId: OP }) }, h.ports);
  assert.equal(!required.body.success && required.body.code, "PAID_PLAN_REQUIRED");
  const plan = await planFor(h);
  const changed = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "execute", operationRequestId: OP, phrase: "SEO para dentistas", authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd } }) }, h.ports);
  assert.equal(!changed.body.success && changed.body.code, "PAID_PLAN_CHANGED");
  h.ledger.set(subjectDiscoveryLedgerKey(OP, subjectDiscoveryCallId("related_keywords", 1)), {} as SubjectDiscoveryUsageEvent);
  const done = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "execute", operationRequestId: OP, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd } }) }, h.ports);
  assert.equal(!done.body.success && done.body.code, "OPERATION_ALREADY_EXECUTED");
  assert.deepEqual([...new Set(h.log.lookups)], ["meta"]);
});

test("canônica em cache sem corpo: plan e execute dão o mesmo hash, a lente não é paga e fica fora da união", async () => {
  const h = harness({ cachedLenses: LENSES, canonicalWithoutBody: true });
  const outcome = await executeWith(h);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  const response = outcome.body as SubjectDiscoveryExecuteResponse;
  assert.equal(h.log.serpCollects.length, 0);
  assert.equal(response.serp.lenses.find(lens => lens.lens === "desktop-windows")?.source, "cache");
  assert.equal(response.serp.topUrls.some(item => item.url === "https://c.com/3"), false, "URL só da canônica sem corpo fica fora");
  assert.equal(response.serp.topUrls.some(item => item.url === "https://a.com/1"), true, "a mesma URL vinda de outra lente entra");
});

test("evidência: a do ranked vem primeiro e não é cortada pelas outras três", () => {
  const googleAds = { averageMonthlySearches: 10, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null };
  const merged = mergeSubjectDiscoveryCandidates({
    contributions: [
      { source: "ads_keyword_seed", keyword: "seo local", googleAds },
      { source: "ads_url_seed", keyword: "seo local", googleAds },
      { source: "labs_related", keyword: "seo local", relatedDepth: 1 },
      { source: "labs_category", keyword: "seo local" },
      { source: "labs_ranked", keyword: "seo local", ranked: { url: "https://exemplo.com/pagina", rankGroup: 7 } },
    ],
    normalizedPhrase: "seo",
  });
  const evidence = merged.candidates[0].evidence;
  assert.equal(evidence.length, 3);
  assert.equal(evidence[0], "ranqueia em #7 em exemplo.com/pagina");
});

test("conflito do ledger DEPOIS de pagar devolve as candidatas com ledgerWarning", async () => {
  const h = harness({ ledgerConflict: true });
  const outcome = await executeWith(h);
  assert.equal(outcome.status, 200);
  const response = outcome.body as SubjectDiscoveryExecuteResponse;
  assert.ok(response.candidates.length > 0);
  assert.match(response.ledgerWarning || "", /INTEGRATION_IDEMPOTENCY_CONFLICT/);
});

test("mesma operação em curso na instância é recusada", async () => {
  let release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ holdLabs: hold, cachedLenses: LENSES });
  const plan = await planFor(h);
  h.allowExecution();
  const body = request({ mode: "execute", operationRequestId: OP, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd } });
  const first = runSubjectDiscoverySearch({ brandId: BRAND, request: body }, h.ports);
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await runSubjectDiscoverySearch({ brandId: BRAND, request: body }, h.ports);
  assert.equal(!second.body.success && second.body.code, "OPERATION_IN_PROGRESS");
  release();
  assert.equal((await first).status, 200);
});

test("URLs do topo: união das 4 lentes, no máximo 5; extra antiga sem digest fica fora", () => {
  const top = selectSubjectDiscoveryTopUrls(LENSES.map(lens => ({ lens, digest: digest(SERP_URLS[lens]) })));
  assert.deepEqual(top.map(item => item.url), ["https://a.com/1", "https://b.com/2", "https://e.com/5", "https://c.com/3", "https://d.com/4"]);
  assert.equal(top[0].lensCount, 2);
  const withoutOld = selectSubjectDiscoveryTopUrls([{ lens: "desktop-windows", digest: digest([["https://a.com/1", 1]]) }, { lens: "mobile-ios", digest: null }]);
  assert.deepEqual(withoutOld.map(item => item.url), ["https://a.com/1"]);
});

test("execute com extra antiga sem digest: a lente conta como cache e fica fora da união", async () => {
  const h = harness({ cachedLenses: LENSES, oldExtraWithoutDigest: ["mobile-android"] });
  const response = (await executeWith(h)).body as SubjectDiscoveryExecuteResponse;
  assert.equal(h.log.serpCollects.length, 0);
  assert.equal(response.serp.topUrls.some(item => item.url === "https://e.com/5"), false);
  assert.deepEqual(h.log.lookups.slice(-2), ["body", "digest"]);
});

test("sem SERP, não há fonte 5 e as outras seguem", async () => {
  const h = harness({ serpReadFails: true });
  const response = (await executeWith(h)).body as SubjectDiscoveryExecuteResponse;
  assert.equal(h.log.serpCollects.length, 0);
  assert.deepEqual(h.log.labs.map(call => call.kind), ["related_keywords", "keyword_ideas"]);
  assert.equal(response.sources.find(source => source.source === "labs_ranked")?.status, "not_applicable");
  assert.equal(response.sources.find(source => source.source === "labs_related")?.status, "ok");
});

test("falha de uma fonte não derruba as outras", async () => {
  const h = harness({ cachedLenses: LENSES, labs: request => {
    if (request.kind === "keyword_ideas") throw new DataForSeoLabsResearchError("dataforseo_task_failed", "falhou", 502, "task-x", 0.012);
    return labsResult(request, ["termo"]);
  } });
  const response = (await executeWith(h)).body as SubjectDiscoveryExecuteResponse;
  const status = Object.fromEntries(response.sources.map(source => [source.source, source.status]));
  assert.equal(status.labs_category, "failed");
  assert.equal(status.labs_related, "ok");
  assert.equal(status.labs_ranked, "ok");
});

test("\"já existe\" indisponível não descarta o resultado pago", async () => {
  const response = (await executeWith(harness({ existingFails: true }))).body as SubjectDiscoveryExecuteResponse;
  assert.equal(response.existingCheckFailed, true);
  assert.ok(response.candidates.length > 0);
  assert.ok(response.candidates.every(candidate => candidate.existingKeywordId === null));
});

test("dedupe pela normalizeKeyword: acento e caixa juntam; corte em 600 com o total", () => {
  const merged = mergeSubjectDiscoveryCandidates({
    contributions: [
      { source: "labs_related", keyword: "Clínica Estética" },
      { source: "labs_category", keyword: "clinica estetica" },
      { source: "ads_keyword_seed", keyword: "CLÍNICA  ESTÉTICA", googleAds: { averageMonthlySearches: 10, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null } },
    ],
    normalizedPhrase: "clinica estetica",
  });
  assert.equal(merged.candidates.length, 1);
  assert.deepEqual(merged.candidates[0].origins, ["ads_keyword_seed", "labs_related", "labs_category"]);
  assert.equal(merged.candidates[0].isSubjectPhrase, true);

  const many = mergeSubjectDiscoveryCandidates({
    contributions: Array.from({ length: 650 }, (_, index) => ({ source: "labs_related" as const, keyword: `termo ${index}` })),
    normalizedPhrase: "x",
  });
  assert.equal(many.candidates.length, 600);
  assert.equal(many.total, 650);
  assert.equal(many.truncated, true);
});

test("\"já existe\" só casa com as keywords da marca que a porta devolveu", () => {
  const merged = mergeSubjectDiscoveryCandidates({
    contributions: [{ source: "labs_related", keyword: "seo local" }, { source: "labs_related", keyword: "seo técnico" }],
    normalizedPhrase: "seo",
    existingByNormalized: new Map([["seo local", "50000000-0000-4000-8000-0000000000e9"]]),
  });
  assert.equal(merged.candidates.find(item => item.normalizedKeyword === "seo local")?.existingKeywordId, "50000000-0000-4000-8000-0000000000e9");
  assert.equal(merged.candidates.find(item => item.normalizedKeyword === "seo tecnico")?.existingKeywordId, null);
});

test("o pedido recusa campo de métrica e exige a operação no execute", () => {
  assert.throws(() => SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", phrase: "seo", targeting, volume: 10 }));
  assert.throws(() => SubjectDiscoverySearchRequestSchema.parse({ mode: "execute", phrase: "seo", targeting }));
  assert.throws(() => SubjectDiscoverySearchRequestSchema.parse({ mode: "plan", phrase: "", targeting }));
});
