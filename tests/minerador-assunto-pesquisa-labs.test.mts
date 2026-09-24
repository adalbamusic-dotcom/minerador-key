import assert from "node:assert/strict";
import test from "node:test";
import {
  DATAFORSEO_ESTIMATE_LABEL,
  DATAFORSEO_LABS_RESEARCH_ENDPOINTS,
  DataForSeoLabsResearchError,
  buildDataForSeoLabsResearchRequest,
  executeDataForSeoLabsResearch,
  normalizeDataForSeoLabsResearchResponse,
} from "../lib/minerador/dataforseo-labs-keyword-research-core.ts";

/*
 * F1b.11 — normalizadores e pedidos dos três endpoints Labs. Nenhuma rede: o
 * `fetch` real nunca é chamado, e o falso devolve fixtures.
 */

const TAG = "30000000-0000-4000-8000-000000000001";
const locale = { locationCode: 2076, languageCode: "pt" };

function envelope(result: unknown, overrides: Record<string, unknown> = {}) {
  return {
    version: "0.1.20260901",
    status_code: 20000,
    cost: 0.0204,
    tasks_count: 1,
    tasks: [{ id: "09241200-1535-0612-0000-labs0001", status_code: 20000, status_message: "Ok.", cost: 0.0204, result: result === undefined ? null : [result], ...overrides }],
  };
}

const relatedResult = {
  se_type: "google",
  seed_keyword: "SEO para clínicas",
  location_code: 2076,
  language_code: "pt",
  total_count: 3,
  items_count: 3,
  items: [
    { se_type: "google", depth: 0, keyword_data: { keyword: "seo para clinicas", location_code: 2076, language_code: "pt", keyword_info: { search_volume: 90 } } },
    { se_type: "google", depth: 1, keyword_data: { keyword: "marketing para clínicas", location_code: 2076, language_code: "pt", keyword_info: { search_volume: 1300 } } },
    { se_type: "google", depth: 2, keyword_data: { keyword: "como captar pacientes", location_code: 2076, language_code: "pt", keyword_info: { search_volume: null } } },
  ],
};

const ideasResult = {
  se_type: "google",
  seed_keywords: ["SEO para clínicas"],
  location_code: 2076,
  language_code: "pt",
  total_count: 2,
  items_count: 2,
  items: [
    { se_type: "google", keyword: "agência de marketing médico", location_code: 2076, language_code: "pt", keyword_info: { search_volume: 480 } },
    { se_type: "google", keyword: "site para clínica", location_code: 2076, language_code: "pt", keyword_info: { search_volume: 720 } },
  ],
};

const rankedResult = {
  se_type: "google",
  target: "https://exemplo.com.br/seo-clinicas",
  location_code: 2076,
  language_code: "pt",
  total_count: 3,
  items_count: 3,
  items: [
    { se_type: "google", keyword_data: { keyword: "seo médico", location_code: 2076, language_code: "pt", keyword_info: { search_volume: 210 } }, ranked_serp_element: { serp_item: { type: "organic", rank_group: 7, url: "https://exemplo.com.br/seo-clinicas" } } },
    { se_type: "google", keyword_data: { keyword: "seo odontológico", location_code: 2076, language_code: "pt", keyword_info: { search_volume: 90 } }, ranked_serp_element: { serp_item: { type: "organic", rank_group: 34, url: "https://exemplo.com.br/seo-clinicas" } } },
    { se_type: "google", keyword_data: { keyword: "seo clínica estética", location_code: 2076, language_code: "pt", keyword_info: { search_volume: 50 } }, ranked_serp_element: { serp_item: { type: "featured_snippet", rank_group: 1, url: "https://exemplo.com.br/seo-clinicas" } } },
  ],
};

test("pedidos: 2076 e \"pt\", depth 2, limit 100 e o filtro do ranked", () => {
  const related = buildDataForSeoLabsResearchRequest({ kind: "related_keywords", keyword: "  SEO para clínicas ", tag: TAG, ...locale });
  assert.equal(related.endpoint, DATAFORSEO_LABS_RESEARCH_ENDPOINTS.related_keywords);
  assert.deepEqual(related.body, [{ keyword: "SEO para clínicas", location_code: 2076, language_code: "pt", limit: 100, tag: TAG, depth: 2, include_serp_info: false, include_clickstream_data: false }]);

  const ideas = buildDataForSeoLabsResearchRequest({ kind: "keyword_ideas", keyword: "SEO para clínicas", tag: TAG, ...locale });
  assert.equal(ideas.endpoint, DATAFORSEO_LABS_RESEARCH_ENDPOINTS.keyword_ideas);
  assert.deepEqual(ideas.body[0].keywords, ["SEO para clínicas"]);
  assert.equal(ideas.body[0].limit, 100);

  const ranked = buildDataForSeoLabsResearchRequest({ kind: "ranked_keywords", targetUrl: "https://exemplo.com.br/seo-clinicas", tag: TAG, ...locale });
  assert.equal(ranked.endpoint, DATAFORSEO_LABS_RESEARCH_ENDPOINTS.ranked_keywords);
  assert.equal(ranked.body[0].target, "https://exemplo.com.br/seo-clinicas");
  assert.deepEqual(ranked.body[0].item_types, ["organic"]);
  assert.deepEqual(ranked.body[0].filters, [["ranked_serp_element.serp_item.rank_group", "<=", 20]]);
  assert.equal(ranked.body[0].limit, 100);
});

test("UF, outro país ou outro idioma são recusados no Labs antes de montar o pedido", () => {
  for (const bad of [{ locationCode: 20106, languageCode: "pt" }, { locationCode: 2840, languageCode: "pt" }, { locationCode: 2076, languageCode: "en" }]) {
    assert.throws(
      () => buildDataForSeoLabsResearchRequest({ kind: "related_keywords", keyword: "seo", tag: TAG, ...bad }),
      (error: unknown) => error instanceof DataForSeoLabsResearchError && error.code === "dataforseo_location_unsupported",
    );
  }
  assert.throws(() => buildDataForSeoLabsResearchRequest({ kind: "ranked_keywords", targetUrl: "exemplo.com.br", tag: TAG, ...locale }), DataForSeoLabsResearchError);
});

test("related_keywords vira lista com a estimativa rotulada e o custo da task", () => {
  const request = { kind: "related_keywords" as const, keyword: "SEO para clínicas", tag: TAG, ...locale };
  const result = normalizeDataForSeoLabsResearchResponse(envelope(relatedResult), request);
  assert.equal(result.cost, 0.0204);
  assert.equal(result.providerRequestId, "09241200-1535-0612-0000-labs0001");
  assert.deepEqual(result.keywords.map(item => item.keyword), ["seo para clinicas", "marketing para clínicas", "como captar pacientes"]);
  assert.deepEqual(result.keywords[1].estimate, { searchVolume: 1300, label: DATAFORSEO_ESTIMATE_LABEL });
  assert.equal(result.keywords[2].estimate.searchVolume, null);
  assert.equal(result.keywords[1].relatedDepth, 1);
  for (const item of result.keywords) assert.equal("volume" in item, false);
});

test("keyword_ideas vira lista; o item fora do local pedido é recusado", () => {
  const request = { kind: "keyword_ideas" as const, keyword: "SEO para clínicas", tag: TAG, ...locale };
  const result = normalizeDataForSeoLabsResearchResponse(envelope(ideasResult), request);
  assert.deepEqual(result.keywords.map(item => [item.keyword, item.estimate.searchVolume]), [["agência de marketing médico", 480], ["site para clínica", 720]]);

  const foreign = { ...ideasResult, items: [{ ...ideasResult.items[0], location_code: 2840 }] };
  assert.throws(() => normalizeDataForSeoLabsResearchResponse(envelope(foreign), request), (error: unknown) => error instanceof DataForSeoLabsResearchError && error.code === "dataforseo_result_mismatch");
});

test("ranked_keywords aplica rank_group <= 20 e só orgânico também na normalização", () => {
  const request = { kind: "ranked_keywords" as const, targetUrl: "https://exemplo.com.br/seo-clinicas", tag: TAG, ...locale };
  const result = normalizeDataForSeoLabsResearchResponse(envelope(rankedResult), request);
  assert.deepEqual(result.keywords.map(item => item.keyword), ["seo médico"]);
  assert.deepEqual(result.keywords[0].ranked, { url: "https://exemplo.com.br/seo-clinicas", rankGroup: 7 });
  assert.equal(result.droppedByRank, 2);
});

test("task diferente de 20000 é recusada, com o custo que ela informou", () => {
  const request = { kind: "related_keywords" as const, keyword: "SEO para clínicas", tag: TAG, ...locale };
  assert.throws(
    () => normalizeDataForSeoLabsResearchResponse(envelope(relatedResult, { status_code: 40501, status_message: "Invalid Field", cost: 0 }), request),
    (error: unknown) => error instanceof DataForSeoLabsResearchError && error.code === "dataforseo_task_failed" && error.cost === 0,
  );
});

test("eco de local ou idioma diferente do pedido → result_mismatch", () => {
  const request = { kind: "related_keywords" as const, keyword: "SEO para clínicas", tag: TAG, ...locale };
  for (const echo of [{ location_code: 2840 }, { language_code: "en" }, { location_code: null }]) {
    assert.throws(
      () => normalizeDataForSeoLabsResearchResponse(envelope({ ...relatedResult, ...echo }), request),
      (error: unknown) => error instanceof DataForSeoLabsResearchError && error.code === "dataforseo_result_mismatch",
    );
  }
  assert.throws(
    () => normalizeDataForSeoLabsResearchResponse(envelope({ ...relatedResult, seed_keyword: "outra frase" }), request),
    (error: unknown) => error instanceof DataForSeoLabsResearchError && error.code === "dataforseo_result_mismatch",
  );
});

test("items vazio ou nulo, e resultado nulo, viram lista vazia — a task cobra mesmo assim", () => {
  const request = { kind: "keyword_ideas" as const, keyword: "estratégias tráfego pago clínica estética 2026 leads qualificados", tag: TAG, ...locale };
  for (const body of [envelope({ ...ideasResult, items: [], items_count: 0 }), envelope({ ...ideasResult, items: null, items_count: 0 }), envelope(undefined)]) {
    const result = normalizeDataForSeoLabsResearchResponse(body, request);
    assert.deepEqual(result.keywords, []);
    assert.equal(result.cost, 0.0204);
  }
});

test("executor usa o fetch injetado, no endpoint certo, e nunca a rede", async () => {
  const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
    return new Response(JSON.stringify(envelope(relatedResult)), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  let started = false;
  const result = await executeDataForSeoLabsResearch(
    { kind: "related_keywords", keyword: "SEO para clínicas", tag: TAG, ...locale },
    { config: { login: "fixture-login", password: "fixture-pass", baseUrl: "https://dataforseo.invalid", timeoutMs: 1000 }, fetchImpl: fakeFetch, onRequestStarted: () => { started = true; } },
  );
  assert.equal(started, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://dataforseo.invalid${DATAFORSEO_LABS_RESEARCH_ENDPOINTS.related_keywords}`);
  assert.match(calls[0].auth || "", /^Basic /);
  assert.equal(result.keywords.length, 3);
});

test("executor recusa HTTP de erro sem inventar lista", async () => {
  const fakeFetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(
    () => executeDataForSeoLabsResearch({ kind: "keyword_ideas", keyword: "seo", tag: TAG, ...locale }, { config: { login: "l", password: "p", baseUrl: "https://dataforseo.invalid", timeoutMs: 1000 }, fetchImpl: fakeFetch }),
    (error: unknown) => error instanceof DataForSeoLabsResearchError && error.code === "dataforseo_http",
  );
});
