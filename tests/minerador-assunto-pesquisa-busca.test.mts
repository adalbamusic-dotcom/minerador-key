import assert from "node:assert/strict";
import test from "node:test";
import {
  SubjectDiscoverySearchRequestSchema,
  mergeSubjectDiscoveryCandidates,
  runSubjectDiscoverySearch,
  selectSubjectDiscoveryTopUrls,
  type SubjectDiscoveryExecuteResponse,
  type SubjectDiscoveryExecutionPorts,
  type SubjectDiscoveryOpenExecutionOptions,
  type SubjectDiscoveryPlanResponse,
  type SubjectDiscoveryPorts,
} from "../lib/minerador/subject-discovery-search.ts";

/*
 * F1b.11 e SDD 2026-09-28 §3.2 — plano e execução da Pesquisa por Assunto,
 * só com o Google Ads, com portas falsas. Nenhuma rede: o fetch global falha o
 * teste. Nenhuma credencial: a porta de execução falha o teste quando o plano
 * a abre. Nenhuma porta DataForSEO pode ser chamada: todas falham o teste.
 */

globalThis.fetch = (async () => { throw new Error("Rede proibida no teste da Pesquisa por Assunto."); }) as typeof fetch;

const BRAND = "50000000-0000-4000-8000-00000000000a";
const SUBJECT_ID = "50000000-0000-4000-8000-0000000000a1";
const OTHER_BRAND_SUBJECT_ID = "50000000-0000-4000-8000-0000000000b1";
const WITHDRAWN_ID = "50000000-0000-4000-8000-0000000000a2";
const MOVED_DESTINATION_ID = "50000000-0000-4000-8000-0000000000a3";
const SITE = "https://adalba.com.br";
const NOW = new Date("2026-09-28T12:00:00+00:00");
const LENSES = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];

const declared = (note: string, destinationUrl: string | null) => ({ declared: true, note, destinationUrl, destinationCheck: destinationUrl ? { hostMatchesBrand: true, catalogPageType: null, catalogTitle: null, checkedAt: "2026-09-20T10:00:00+00:00" } : null });

const SUBJECTS: Record<string, { id: string; keyword: string; keywordSubject: unknown }> = {
  [SUBJECT_ID]: { id: SUBJECT_ID, keyword: "SEO para clínicas", keywordSubject: declared("Para donos de clínica", `${SITE}/seo-clinicas`) },
  [WITHDRAWN_ID]: { id: WITHDRAWN_ID, keyword: "SEO antigo", keywordSubject: null },
  [MOVED_DESTINATION_ID]: { id: MOVED_DESTINATION_ID, keyword: "SEO para dentistas", keywordSubject: declared("Para dentistas", "https://site-antigo.com.br/seo") },
};

function digest(urls: Array<[string, number]>) {
  return { version: "organic-digest-v1" as const, keyword: "seo para clinicas", depth: 10, organic: urls.map(([url, rank]) => ({ rank_group: rank, url })), blocks: [], sellers: [] };
}

const SERP_URLS: Record<string, Array<[string, number]>> = {
  "desktop-windows": [["https://a.com/1", 1], ["https://b.com/2", 2], ["https://c.com/3", 3]],
  "desktop-macos": [["https://b.com/2", 1], ["https://d.com/4", 4]],
  "mobile-android": [["https://e.com/5", 2], ["https://f.com/6", 6]],
  "mobile-ios": [["https://g.com/7", 5], ["https://a.com/1", 1]],
};

type Options = {
  siteUrl?: string | null;
  existing?: Array<{ id: string; keyword: string }>;
  existingFails?: boolean;
  adsIdeas?: Record<string, string[]>;
  /** A semente que falha no Google Ads. */
  adsFails?: "keyword" | "keyword_and_url";
  /** A gravação do uso do Google Ads no ledger falha. */
  adsUsageFails?: boolean;
  holdAds?: Promise<void>;
  /** A marca não tem Connection DataForSEO: abrir COM o DataForSEO falha. */
  noDataForSeo?: boolean;
  /** Abrir a execução falha de todo jeito. */
  openFails?: boolean;
};

function harness(options: Options = {}) {
  const log = {
    lookups: [] as string[],
    ledgerCatalogReads: 0,
    opened: 0,
    openOptions: [] as Array<SubjectDiscoveryOpenExecutionOptions | undefined>,
    ads: [] as Array<{ kind: string; url?: string; geo: string[]; keywords: string[] }>,
    adsUsage: [] as Array<{ suffix: string; resultStatus: string }>,
  };
  const forbidden = (name: string) => async () => assert.fail(`A Pesquisa por Assunto chamou o DataForSEO (${name}).`);
  const exec: SubjectDiscoveryExecutionPorts = {
    ledgerCapability: false,
    findUsage: forbidden("findUsage"),
    collectSerp: forbidden("collectSerp"),
    recordDataForSeoUsage: forbidden("recordDataForSeoUsage"),
    async googleAdsIdeas(seed, targeting) {
      if (options.holdAds) await options.holdAds;
      log.ads.push({ kind: seed.kind, url: seed.kind === "keyword_and_url" ? seed.url : undefined, geo: targeting.geoTargetConstants, keywords: seed.keywords });
      if (options.adsFails === seed.kind) throw Object.assign(new Error("Google Ads fora"), { code: "GOOGLE_ADS_DISCOVERY_ERROR" });
      const keywords = (options.adsIdeas || { keyword: ["marketing para clínicas", "agência de marketing médico", "SEO para clínicas"], keyword_and_url: ["seo médico", "Marketing para Clinicas"] })[seed.kind] || [];
      return { requestId: `ads-${seed.kind}`, ideas: keywords.map((keyword, index) => ({ keyword, averageMonthlySearches: index === 1 ? null : 1300 - index, competition: "HIGH", competitionIndex: 80, averageCpcMicros: "2500000", lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: "BRL" })) };
    },
    async recordGoogleAdsUsage(event) {
      log.adsUsage.push({ suffix: event.suffix, resultStatus: event.resultStatus });
      if (options.adsUsageFails) throw Object.assign(new Error("ledger fora"), { code: "GOOGLE_ADS_USAGE_RECORDING_FAILED" });
    },
  };
  let executionAllowed = false;
  const ports: SubjectDiscoveryPorts = {
    now: () => NOW,
    readBrandSiteUrl: async () => (options.siteUrl === undefined ? SITE : options.siteUrl),
    // A porta real filtra brand_id = marca da rota; aqui só existem as da marca A.
    readSubjectKeyword: async id => SUBJECTS[id] ?? null,
    async lookupSerp(requests, mode) {
      log.lookups.push(mode);
      return requests.map(() => null);
    },
    async findLedgerCapability() { log.ledgerCatalogReads += 1; return true; },
    async readExistingKeywords() {
      if (options.existingFails) throw new Error("banco fora");
      return options.existing || [];
    },
    async openExecution(openOptions) {
      log.opened += 1;
      log.openOptions.push(openOptions);
      if (!executionAllowed) assert.fail("O plano abriu credencial (Connection/Secret Store).");
      if (options.openFails) throw Object.assign(new Error("sem Secret Store"), { code: "GOOGLE_ADS_CONTEXT_UNAVAILABLE" });
      if (options.noDataForSeo && openOptions?.dataForSeo !== false) throw Object.assign(new Error("sem Connection DataForSEO"), { code: "DATAFORSEO_CONNECTION_MISSING" });
      return exec;
    },
  };
  return { ports, log, allowExecution: () => { executionAllowed = true; } };
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

test("plan: não abre credencial, não lê cache de SERP nem o ledger DataForSEO e não chama provider", async () => {
  const h = harness();
  const plan = await planFor(h);
  assert.equal(h.log.opened, 0);
  assert.deepEqual(h.log.lookups, [], "a SERP da frase não é lida: a 1ª coleta é no Arquiteto");
  assert.equal(h.log.ledgerCatalogReads, 0);
  assert.equal(h.log.ads.length, 0);
  assert.equal(plan.destinationUrl, `${SITE}/seo-clinicas`);
  assert.equal(plan.maxCostUsd, 0);
  assert.equal(plan.paidCalls, 0);
  assert.deepEqual(plan.lines.map(line => line.kind), ["ads_keyword_seed", "ads_url_seed"]);
});

test("Assunto declarado: outra marca e inexistente dão o mesmo 404; retirado dá 409; nada é consultado", async () => {
  for (const mode of ["plan", "execute"]) {
    const h = harness();
    h.allowExecution();
    const extra = mode === "execute" ? { operationRequestId: OP, authorizedPlan: { planHash: "sha256:x", maxCostUsd: 0 } } : {};
    const other = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode, subjectKeywordId: OTHER_BRAND_SUBJECT_ID, ...extra }) }, h.ports);
    const missing = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode, subjectKeywordId: "50000000-0000-4000-8000-0000000000ff", ...extra }) }, h.ports);
    assert.equal(other.status, 404);
    assert.deepEqual(other.body, missing.body);
    const withdrawn = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode, subjectKeywordId: WITHDRAWN_ID, ...extra }) }, h.ports);
    assert.equal(withdrawn.status, 409);
    assert.equal(!withdrawn.body.success && withdrawn.body.code, "SUBJECT_NOT_DECLARED");
    assert.equal(h.log.opened + h.log.ads.length, 0);
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

test("sem confirmação, ou com plano diferente, nada é aberto nem consultado", async () => {
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

  // Uma aba aberta antes do deploy confirma o hash do plano v1: recusado, nada consultado.
  const legacy = await runSubjectDiscoverySearch({ brandId: BRAND, request: request({ mode: "execute", operationRequestId: OP, authorizedPlan: { planHash: "sha256:plano-v1", maxCostUsd: 0.182 } }) }, h.ports);
  assert.equal(!legacy.body.success && legacy.body.code, "PAID_PLAN_CHANGED");
  assert.equal(h.log.opened + h.log.ads.length, 0);
  assert.deepEqual(h.log.lookups, []);
});

test("execute: só as duas sementes do Google Ads, sem DataForSEO, custo zero e origens só do Ads", async () => {
  const h = harness({ existing: [{ id: "50000000-0000-4000-8000-0000000000e1", keyword: "Agência de Marketing Médico" }] });
  const outcome = await executeWith(h, { targeting: { ...targeting, selectedStates: ["SP"] } });
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  const response = outcome.body as SubjectDiscoveryExecuteResponse;

  // Abre SEM o DataForSEO; as portas DataForSEO do harness falhariam o teste.
  assert.deepEqual(h.log.openOptions, [{ dataForSeo: false }]);
  assert.deepEqual(h.log.lookups, []);
  // UF e frase só no Google Ads; a página só na semente com URL.
  assert.deepEqual(h.log.ads, [
    { kind: "keyword", url: undefined, geo: ["geoTargetConstants/20106"], keywords: ["SEO para clínicas"] },
    { kind: "keyword_and_url", url: `${SITE}/seo-clinicas`, geo: ["geoTargetConstants/20106"], keywords: ["SEO para clínicas"] },
  ]);
  assert.deepEqual(h.log.adsUsage, [{ suffix: "keyword_seed", resultStatus: "succeeded" }, { suffix: "url_seed", resultStatus: "succeeded" }]);

  assert.deepEqual(response.sources.map(source => [source.source, source.status]), [["ads_keyword_seed", "ok"], ["ads_url_seed", "ok"]]);
  assert.deepEqual(response.serp, { lenses: [], topUrls: [], readFailed: null });
  assert.equal(response.reportedCostUsd, 0);
  assert.equal(response.budgetSpentUsd, 0);
  assert.equal(response.plan.maxCostUsd, 0);
  assert.equal(response.ledgerRecording, true);
  assert.equal(response.ledgerWarning, null);

  const byKey = new Map(response.candidates.map(candidate => [candidate.normalizedKeyword, candidate]));
  const marketing = byKey.get("marketing para clinicas");
  assert.ok(marketing);
  assert.deepEqual(marketing.origins, ["ads_keyword_seed", "ads_url_seed"], "a mesma ideia pelas duas sementes guarda as duas origens");
  assert.equal(marketing.googleAds?.averageMonthlySearches, 1300);
  assert.equal(response.candidates[0].normalizedKeyword, "marketing para clinicas");
  assert.equal(byKey.get("seo para clinicas")?.isSubjectPhrase, true);
  assert.equal(byKey.get("agencia de marketing medico")?.existingKeywordId, "50000000-0000-4000-8000-0000000000e1");
  assert.equal(byKey.get("seo medico")?.existingKeywordId, null);
  for (const candidate of response.candidates) {
    assert.ok(candidate.origins.every(origin => origin === "ads_keyword_seed" || origin === "ads_url_seed"), candidate.keyword);
    assert.equal(candidate.dataForSeoEstimate, null, "pesquisa nova não tem estimativa DataForSEO");
    assert.deepEqual(candidate.ranked, []);
  }
  assert.ok(response.notices.some(notice => /Sem custo no DataForSEO/.test(notice)));
});

test("marca sem DataForSEO pesquisa normalmente: só o Google Ads é aberto", async () => {
  const h = harness({ noDataForSeo: true });
  const outcome = await executeWith(h);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  assert.ok((outcome.body as SubjectDiscoveryExecuteResponse).candidates.length > 0);
});

test("execução que não abre: GOOGLE_ADS_UNAVAILABLE, nada consultado", async () => {
  const h = harness({ openFails: true });
  const outcome = await executeWith(h);
  assert.equal(outcome.status, 503);
  assert.equal(!outcome.body.success && outcome.body.code, "GOOGLE_ADS_UNAVAILABLE");
  assert.match(!outcome.body.success ? outcome.body.message : "", /Google Ads/);
  assert.equal(h.log.ads.length, 0);
});

test("volume: candidata sem média do Google Ads fica sem volume; nenhuma métrica vira campo 'volume'", async () => {
  const response = (await executeWith(harness())).body as SubjectDiscoveryExecuteResponse;
  const semMedia = response.candidates.find(candidate => candidate.normalizedKeyword === "agencia de marketing medico");
  assert.ok(semMedia);
  assert.equal(semMedia.googleAds?.averageMonthlySearches, null);
  assert.equal(response.candidates.at(-1)?.normalizedKeyword, "agencia de marketing medico", "sem volume vai para o fim");
  assert.doesNotMatch(JSON.stringify(response.candidates), /"volume"|"volume_search"/);
});

test("uma semente que falha não derruba a outra", async () => {
  const h = harness({ adsFails: "keyword_and_url" });
  const response = (await executeWith(h)).body as SubjectDiscoveryExecuteResponse;
  const status = Object.fromEntries(response.sources.map(source => [source.source, source.status]));
  assert.equal(status.ads_keyword_seed, "ok");
  assert.equal(status.ads_url_seed, "failed");
  assert.deepEqual(h.log.adsUsage, [{ suffix: "keyword_seed", resultStatus: "succeeded" }, { suffix: "url_seed", resultStatus: "failed" }]);
  assert.ok(response.candidates.length > 0);
});

test("falha ao gravar o uso do Google Ads devolve as candidatas com ledgerWarning", async () => {
  const response = (await executeWith(harness({ adsUsageFails: true }))).body as SubjectDiscoveryExecuteResponse;
  assert.ok(response.candidates.length > 0);
  assert.equal(response.ledgerRecording, false);
  assert.match(response.ledgerWarning || "", /GOOGLE_ADS_USAGE_RECORDING_FAILED/);
  assert.match(response.ledgerWarning || "", /Google Ads/);
});

test("repetir a MESMA operação consulta só o Google Ads de novo: nada de DataForSEO nem custo", async () => {
  const h = harness();
  const first = await executeWith(h);
  assert.equal(first.status, 200);
  const again = await executeWith(h);
  assert.equal(again.status, 200);
  assert.equal(h.log.ads.length, 4);
  // As chaves do Google Ads são as mesmas nas duas: o ledger não duplica o uso.
  assert.deepEqual(h.log.adsUsage.map(item => item.suffix), ["keyword_seed", "url_seed", "keyword_seed", "url_seed"]);
  assert.equal((again.body as SubjectDiscoveryExecuteResponse).reportedCostUsd, 0);
});

test("mesma operação em curso na instância é recusada", async () => {
  let release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ holdAds: hold });
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

test("\"já existe\" indisponível não descarta o resultado", async () => {
  const response = (await executeWith(harness({ existingFails: true }))).body as SubjectDiscoveryExecuteResponse;
  assert.equal(response.existingCheckFailed, true);
  assert.ok(response.candidates.length > 0);
  assert.ok(response.candidates.every(candidate => candidate.existingKeywordId === null));
});

test("junção: uma candidata antiga só do Labs mantém a origem (nunca some do envio)", () => {
  const merged = mergeSubjectDiscoveryCandidates({
    contributions: [
      { source: "labs_related", keyword: "captar pacientes", estimate: { searchVolume: 480, label: "Estimativa DataForSEO" }, relatedDepth: 1 },
      { source: "labs_ranked", keyword: "seo local", ranked: { url: "https://exemplo.com/pagina", rankGroup: 3 } },
    ],
    normalizedPhrase: "seo",
  });
  assert.deepEqual(merged.candidates.map(item => item.origins), [["labs_related"], ["labs_ranked"]]);
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

test("URLs do topo: união das 4 lentes, no máximo 5; extra antiga sem digest fica fora", () => {
  const top = selectSubjectDiscoveryTopUrls(LENSES.map(lens => ({ lens, digest: digest(SERP_URLS[lens]) })));
  assert.deepEqual(top.map(item => item.url), ["https://a.com/1", "https://b.com/2", "https://e.com/5", "https://c.com/3", "https://d.com/4"]);
  assert.equal(top[0].lensCount, 2);
  const withoutOld = selectSubjectDiscoveryTopUrls([{ lens: "desktop-windows", digest: digest([["https://a.com/1", 1]]) }, { lens: "mobile-ios", digest: null }]);
  assert.deepEqual(withoutOld.map(item => item.url), ["https://a.com/1"]);
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

test("D2.3: volume primeiro — Google Ads maior, depois a estimativa, e o corte das 600 cai nas sem volume", () => {
  const ads = (averageMonthlySearches: number | null) => ({ averageMonthlySearches, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null });
  const merged = mergeSubjectDiscoveryCandidates({
    contributions: [
      // Três fontes e sem volume nenhum: antes vinha primeiro; agora vai para o fim.
      { source: "ads_keyword_seed", keyword: "marketing sem busca", googleAds: ads(null) },
      { source: "labs_related", keyword: "marketing sem busca", estimate: { searchVolume: 0, label: "Estimativa DataForSEO" } },
      { source: "labs_category", keyword: "marketing sem busca" },
      { source: "labs_related", keyword: "so estimativa", estimate: { searchVolume: 5000, label: "Estimativa DataForSEO" } },
      { source: "ads_keyword_seed", keyword: "como atrair clientes", googleAds: ads(720) },
      { source: "ads_keyword_seed", keyword: "agencia de marketing", googleAds: ads(18100) },
    ],
    normalizedPhrase: "marketing",
  });
  assert.deepEqual(merged.candidates.map(item => item.keyword), ["agencia de marketing", "como atrair clientes", "so estimativa", "marketing sem busca"]);
  assert.equal(merged.candidates.find(item => item.keyword === "so estimativa")?.googleAds, null, "a estimativa nunca vira Volume");

  const many = mergeSubjectDiscoveryCandidates({
    contributions: [
      ...Array.from({ length: 640 }, (_, index) => ({ source: "labs_related" as const, keyword: "sem volume " + index })),
      { source: "ads_keyword_seed" as const, keyword: "trafego pago", googleAds: ads(5400) },
    ],
    normalizedPhrase: "x",
  });
  assert.equal(many.truncated, true);
  assert.equal(many.candidates[0].keyword, "trafego pago", "a com volume nunca é cortada pelas sem volume");
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
