import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBJECT_SEARCH_LOCAL_DATABASE,
  SUBJECT_SEARCH_LOCAL_MAX_SEARCHES,
  SUBJECT_SEARCH_LOCAL_TTL_DAYS,
  createIndexedDbSubjectSearchStorage,
  discardSubjectSearch,
  isSubjectSearchExpired,
  loadSubjectSearches,
  planSubjectSearchRetention,
  readSubjectSearchLocalRecord,
  saveSubjectSearch,
  subjectSearchLocalKey,
  subjectSearchLocalScope,
} from "../modules/minerador/discovery/subject-search-local-store.ts";
import {
  SUBJECT_SEARCH_ENTER_HELP,
  SUBJECT_SEARCH_RULE_TEXT,
  SUBJECT_SEARCH_UNDECLARED_TEXT,
  SUBJECT_SEARCH_VOLUME_REMEASURE_TEXT,
  buildSubjectDiscoveryImportItems,
  buildSubjectSearchRequest,
  declarePhraseAsSubjectLabel,
  declaredSubjectOptions,
  defaultDeclarePhraseAsSubject,
  filterSubjectCandidates,
  parseSubjectSearchLink,
  subjectCandidateGoogleAdsVolume,
  subjectIdFromApply,
  subjectPhraseDeclarationPlan,
  subjectSearchLinkHref,
  subjectSearchOriginLabel,
  formatSubjectSearchUsd,
  subjectSearchLensName,
  SUBJECT_SEARCH_DEFAULT_FILTERS,
} from "../modules/minerador/discovery/subject-search-model.ts";
import { SUBJECT_DISCOVERY_SOURCES, SUBJECT_DISCOVERY_NOTICES } from "../lib/minerador/subject-discovery-plan.ts";
import { SubjectDiscoverySearchRequestSchema } from "../lib/minerador/subject-discovery-search.ts";
import { SubjectDiscoveryImportRequestSchema } from "../lib/minerador/subject-discovery-import.ts";

/**
 * PESQUISA POR ASSUNTO — TELA, regras puras (SDD 2026-09-24, F1b.5, F1b.6,
 * F1b.7 e Q12/Q14). Sem DOM, sem rede, sem IndexedDB real: o armazenamento é
 * um Map em memória, e o `fetch` global falha o teste se for chamado.
 * Timestamps com +00:00. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const ACTOR = "11111111-1111-4111-8111-111111111111";
const OTHER_ACTOR = "22222222-2222-4222-8222-222222222222";
const BRAND = "33333333-3333-4333-8333-333333333333";
const OTHER_BRAND = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-09-24T12:00:00+00:00");

globalThis.fetch = (() => { throw new Error("fetch não pode ser chamado nos testes da tela"); }) as typeof fetch;

function searchId(n: number) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
}

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString().replace("Z", "+00:00");
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    keyword: "seo para clinicas",
    normalizedKeyword: "seo para clinicas",
    origins: ["labs_related"],
    evidence: ["Pesquisa relacionada, nível 1"],
    googleAds: null,
    dataForSeoEstimate: null,
    ranked: [],
    bestRankGroup: null,
    isSubjectPhrase: false,
    existingKeywordId: null,
    ...overrides,
  };
}

function record(input: { actor?: string; brand?: string; id: string; savedAt: string; phrase?: string }) {
  const actor = input.actor ?? ACTOR;
  const brand = input.brand ?? BRAND;
  return {
    format: 1,
    actorUserId: actor,
    brandId: brand,
    searchId: input.id,
    savedAt: input.savedAt,
    updatedAt: input.savedAt,
    config: { phrase: input.phrase ?? "SEO para clínicas", note: "", destinationUrl: "", subjectKeywordId: null, language: "Português", selectedStates: ["Todos os estados"], includeAdultKeywords: false },
    result: {
      success: true,
      mode: "execute",
      operationRequestId: input.id,
      executedAt: input.savedAt,
      subject: { phrase: input.phrase ?? "SEO para clínicas", normalizedPhrase: "seo para clinicas", note: null, subjectKeywordId: null, destination: { status: "EMPTY", url: null, reason: null }, phraseExistingKeywordId: null },
      plan: {},
      sources: [],
      serp: { lenses: [], topUrls: [], readFailed: null },
      candidates: [candidate()],
      totalCandidates: 1,
      returnedCandidates: 1,
      truncated: false,
      reportedCostUsd: 0.1,
      budgetSpentUsd: 0.1,
      ledgerRecording: true,
      ledgerWarning: null,
      existingCheckFailed: false,
      notices: [],
    },
    marks: {},
    declaredSubjectKeywordId: null,
  };
}

function memoryStorage(initial: Array<[string, unknown]> = []) {
  const map = new Map<string, unknown>(initial);
  const deleted: string[] = [];
  return {
    map,
    deleted,
    async list(prefix: string) { return [...map.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })); },
    async put(key: string, value: unknown) { map.set(key, value); },
    async deleteMany(keys: readonly string[]) { for (const key of keys) { deleted.push(key); map.delete(key); } },
  };
}

/* ------------------------------- lista local ------------------------------- */

test("lista local: banco próprio, 30 dias e 10 buscas", () => {
  assert.equal(SUBJECT_SEARCH_LOCAL_DATABASE, "minerador-pesquisa-assunto");
  assert.equal(SUBJECT_SEARCH_LOCAL_TTL_DAYS, 30);
  assert.equal(SUBJECT_SEARCH_LOCAL_MAX_SEARCHES, 10);
});

test("lista local: chave actorUserId:brandId:searchId; sem identidade não há escopo", () => {
  const scope = subjectSearchLocalScope(ACTOR, BRAND);
  assert.equal(scope, `${ACTOR}:${BRAND}:`);
  assert.equal(subjectSearchLocalKey(scope as string, searchId(1)), `${ACTOR}:${BRAND}:${searchId(1)}`);
  assert.equal(subjectSearchLocalScope(null, BRAND), null);
  assert.equal(subjectSearchLocalScope(ACTOR, ""), null);
});

test("lista local: registro de outro ator, de outra marca ou adulterado é ignorado e nunca apagado", async () => {
  const mine = record({ id: searchId(1), savedAt: daysAgo(1) });
  const otherBrand = record({ brand: OTHER_BRAND, id: searchId(2), savedAt: daysAgo(40) });
  const otherActor = record({ actor: OTHER_ACTOR, id: searchId(3), savedAt: daysAgo(40) });
  // Registro de outra marca gravado sob a chave desta marca: não vale como desta marca.
  const tampered = { ...record({ brand: OTHER_BRAND, id: searchId(4), savedAt: daysAgo(40) }) };
  const malformed = { format: 99 };
  const storage = memoryStorage([
    [`${ACTOR}:${BRAND}:${searchId(1)}`, mine],
    [`${ACTOR}:${OTHER_BRAND}:${searchId(2)}`, otherBrand],
    [`${OTHER_ACTOR}:${BRAND}:${searchId(3)}`, otherActor],
    [`${ACTOR}:${BRAND}:${searchId(4)}`, tampered],
    [`${ACTOR}:${BRAND}:${searchId(5)}`, malformed],
  ]);
  const loaded = await loadSubjectSearches({ storage, actorUserId: ACTOR, brandId: BRAND, now: NOW });
  assert.equal(loaded.available, true);
  assert.deepEqual(loaded.records.map(item => item.searchId), [searchId(1)]);
  assert.deepEqual(storage.deleted, [], "nada fora da política é apagado");
  assert.equal(storage.map.size, 5);
});

test("lista local: a vencida (30 dias) sai sozinha; a de 29 dias fica", async () => {
  assert.equal(isSubjectSearchExpired(daysAgo(30), NOW), true);
  assert.equal(isSubjectSearchExpired(daysAgo(29), NOW), false);
  const storage = memoryStorage([
    [`${ACTOR}:${BRAND}:${searchId(1)}`, record({ id: searchId(1), savedAt: daysAgo(31) })],
    [`${ACTOR}:${BRAND}:${searchId(2)}`, record({ id: searchId(2), savedAt: daysAgo(29) })],
  ]);
  const loaded = await loadSubjectSearches({ storage, actorUserId: ACTOR, brandId: BRAND, now: NOW });
  assert.deepEqual(loaded.records.map(item => item.searchId), [searchId(2)]);
  assert.deepEqual(storage.deleted, [`${ACTOR}:${BRAND}:${searchId(1)}`]);
  assert.equal(loaded.removed, 1);
});

test("lista local: acima de 10 buscas, a mais antiga sai; a nova gravada fica", async () => {
  const initial: Array<[string, unknown]> = [];
  for (let n = 1; n <= 10; n += 1) initial.push([`${ACTOR}:${BRAND}:${searchId(n)}`, record({ id: searchId(n), savedAt: daysAgo(20 - n) })]);
  const storage = memoryStorage(initial);
  const fresh = record({ id: searchId(11), savedAt: NOW.toISOString().replace("Z", "+00:00") });
  const saved = await saveSubjectSearch({ storage, record: fresh as never, now: NOW });
  assert.equal(saved.persisted, true);
  assert.equal(saved.records?.length, 10);
  assert.equal(saved.records?.[0].searchId, searchId(11), "a mais nova primeiro");
  assert.deepEqual(storage.deleted, [`${ACTOR}:${BRAND}:${searchId(1)}`], "só a mais antiga saiu");
});

test("lista local: a política pura separa vencidas e excedentes sem tocar outro escopo", () => {
  const entries = [];
  for (let n = 1; n <= 12; n += 1) entries.push({ key: `k${n}`, record: record({ id: searchId(n), savedAt: daysAgo(n) }) as never });
  entries.push({ key: "velha", record: record({ id: searchId(40), savedAt: daysAgo(45) }) as never });
  const plan = planSubjectSearchRetention(entries, NOW);
  assert.deepEqual(plan.expired, ["velha"]);
  assert.deepEqual(plan.overflow, ["k11", "k12"]);
  assert.equal(plan.keep.length, 10);
  assert.equal(plan.keep[0].key, "k1");
});

test("lista local: falha ou demora do armazenamento vira memória, sem derrubar a tela", async () => {
  const broken = { list: async () => { throw new Error("quota"); }, put: async () => { throw new Error("quota"); }, deleteMany: async () => undefined };
  const loaded = await loadSubjectSearches({ storage: broken, actorUserId: ACTOR, brandId: BRAND, now: NOW });
  assert.equal(loaded.available, false);
  assert.deepEqual(loaded.records, []);
  const saved = await saveSubjectSearch({ storage: broken, record: record({ id: searchId(1), savedAt: daysAgo(1) }) as never, now: NOW });
  assert.equal(saved.persisted, false);
  const hanging = { list: () => new Promise<never>(() => undefined), put: () => new Promise<never>(() => undefined), deleteMany: async () => undefined };
  const slow = await loadSubjectSearches({ storage: hanging, actorUserId: ACTOR, brandId: BRAND, now: NOW, timeoutMs: 5 });
  assert.equal(slow.available, false);
  const noActor = await loadSubjectSearches({ storage: memoryStorage(), actorUserId: null, brandId: BRAND, now: NOW });
  assert.equal(noActor.available, false, "sem ator, a lista fica só em memória");
});

test("lista local: descartar é uma busca, do próprio ator e marca", async () => {
  const storage = memoryStorage([
    [`${ACTOR}:${BRAND}:${searchId(1)}`, record({ id: searchId(1), savedAt: daysAgo(1) })],
    [`${ACTOR}:${BRAND}:${searchId(2)}`, record({ id: searchId(2), savedAt: daysAgo(1) })],
    [`${ACTOR}:${OTHER_BRAND}:${searchId(1)}`, record({ brand: OTHER_BRAND, id: searchId(1), savedAt: daysAgo(1) })],
  ]);
  const result = await discardSubjectSearch({ storage, actorUserId: ACTOR, brandId: BRAND, searchId: searchId(1) });
  assert.equal(result.ok, true);
  assert.deepEqual(storage.deleted, [`${ACTOR}:${BRAND}:${searchId(1)}`]);
  assert.ok(storage.map.has(`${ACTOR}:${OTHER_BRAND}:${searchId(1)}`));
});

test("lista local: o adaptador IndexedDB não toca indexedDB ao ser criado", async () => {
  const storage = createIndexedDbSubjectSearchStorage();
  await assert.rejects(() => storage.list(`${ACTOR}:${BRAND}:`), /IndexedDB indisponível/);
});

test("lista local: registro de outra chave não é aceito", () => {
  const value = record({ id: searchId(1), savedAt: daysAgo(1) });
  assert.ok(readSubjectSearchLocalRecord(value, { actorUserId: ACTOR, brandId: BRAND, key: `${ACTOR}:${BRAND}:${searchId(1)}` }));
  assert.equal(readSubjectSearchLocalRecord(value, { actorUserId: ACTOR, brandId: BRAND, key: `${ACTOR}:${BRAND}:${searchId(2)}` }), null);
  assert.equal(readSubjectSearchLocalRecord(value, { actorUserId: ACTOR, brandId: OTHER_BRAND, key: `${ACTOR}:${OTHER_BRAND}:${searchId(1)}` }), null);
});

/* --------------------------- Q14: declarar a frase --------------------------- */

test("Q14: frase nova vem MARCADA; frase que já existe vem DESMARCADA; Assunto declarado não oferece", () => {
  assert.deepEqual(defaultDeclarePhraseAsSubject({ subjectKeywordId: null, phraseExistingKeywordId: null }), { offered: true, checked: true });
  assert.deepEqual(defaultDeclarePhraseAsSubject({ subjectKeywordId: null, phraseExistingKeywordId: "55555555-5555-4555-8555-555555555555" }), { offered: true, checked: false });
  assert.deepEqual(defaultDeclarePhraseAsSubject({ subjectKeywordId: "55555555-5555-4555-8555-555555555555", phraseExistingKeywordId: "55555555-5555-4555-8555-555555555555" }), { offered: false, checked: false });
  assert.equal(declarePhraseAsSubjectLabel("SEO para clínicas"), "Declarar também \"SEO para clínicas\" como Assunto, com a nota e a página informadas");
});

test("declaração da frase pela prévia da F1.3: criar, declarar a existente, usar a já declarada ou parar", () => {
  const id = "66666666-6666-4666-8666-666666666666";
  assert.deepEqual(subjectPhraseDeclarationPlan({ classification: "new", keywordId: null, approvalWarning: null, reason: null }), { action: "create" });
  assert.deepEqual(subjectPhraseDeclarationPlan({ classification: "existing_without_subject", keywordId: id, approvalWarning: "vai para Em revisão", reason: null }), { action: "declare_existing", keywordId: id, warning: "vai para Em revisão" });
  assert.deepEqual(subjectPhraseDeclarationPlan({ classification: "published", keywordId: id, approvalWarning: null, reason: null }), { action: "declare_existing", keywordId: id, warning: null });
  assert.deepEqual(subjectPhraseDeclarationPlan({ classification: "existing_subject_same", keywordId: id, approvalWarning: null, reason: null }), { action: "already_subject", keywordId: id });
  assert.equal(subjectPhraseDeclarationPlan({ classification: "invalid", keywordId: null, approvalWarning: null, reason: "Frase vazia." }).action, "refuse");
  assert.equal(subjectPhraseDeclarationPlan(null).action, "refuse");
  assert.equal(subjectIdFromApply({ classification: "new", keywordId: id, approvalWarning: null, reason: null, outcome: "created" }), id);
  assert.equal(subjectIdFromApply({ classification: "existing_without_subject", keywordId: id, approvalWarning: null, reason: null, outcome: "declared" }), id);
  assert.equal(subjectIdFromApply({ classification: "new", keywordId: null, approvalWarning: null, reason: "falhou", outcome: "failed" }), null);
  assert.equal(subjectIdFromApply({ classification: "existing_without_subject", keywordId: id, approvalWarning: null, reason: null, outcome: "not_marked" }), null, "não marcada não é declarada");
});

/* ------------------------- envio: sem métrica, sem a frase ------------------------- */

test("envio: só keyword, origens e evidência; a frase do Assunto fica fora; o corpo passa no schema estrito", () => {
  const candidates = [
    candidate({ keyword: "SEO para clínicas", normalizedKeyword: "seo para clinicas", isSubjectPhrase: true }),
    candidate({ keyword: "marketing para clínicas", normalizedKeyword: "marketing para clinicas", origins: ["ads_keyword_seed", "labs_ranked"], evidence: ["Ideia do Google Ads para a frase", "ranqueia em #7 em exemplo.com/pagina"], googleAds: { averageMonthlySearches: 880, competition: "LOW", competitionIndex: 10, averageCpcMicros: "1000000", lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: "BRL" }, dataForSeoEstimate: { searchVolume: 1000, label: "Estimativa DataForSEO" } }),
    candidate({ keyword: "fora da seleção", normalizedKeyword: "fora da selecao" }),
  ];
  const selected = new Set(["seo para clinicas", "marketing para clinicas"]);
  const { items, skippedSubjectPhrase } = buildSubjectDiscoveryImportItems(candidates as never, selected, "seo para clinicas");
  assert.equal(skippedSubjectPhrase, 1);
  assert.deepEqual(items, [{ keyword: "marketing para clínicas", origins: ["ads_keyword_seed", "labs_ranked"], evidence: ["Ideia do Google Ads para a frase", "ranqueia em #7 em exemplo.com/pagina"] }]);
  for (const item of items) assert.deepEqual(Object.keys(item).sort(), ["evidence", "keyword", "origins"]);
  const body = { importRequestId: "77777777-7777-4777-8777-777777777777", searchId: searchId(1), subjectKeywordId: null, subjectPhrase: "SEO para clínicas", items };
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse(body).success, true);
  assert.equal(SubjectDiscoveryImportRequestSchema.safeParse({ ...body, items: [{ ...items[0], volume: 880 }] }).success, false, "métrica é recusada");
});

test("pedido de plano e de execução: só os campos do schema estrito, sem métrica", () => {
  const base = { phrase: "  SEO   para clínicas ", note: "", destinationUrl: "", subjectKeywordId: null, language: "Português", selectedStates: ["SP"], includeAdultKeywords: false };
  const plan = buildSubjectSearchRequest({ mode: "plan", ...base });
  assert.equal(plan.phrase, "SEO para clínicas");
  assert.equal(plan.note, null);
  assert.equal("operationRequestId" in plan, false, "o plano não leva operação");
  assert.equal("authorizedPlan" in plan, false);
  assert.equal(SubjectDiscoverySearchRequestSchema.safeParse(plan).success, true);
  const execute = buildSubjectSearchRequest({ mode: "execute", ...base, operationRequestId: "88888888-8888-4888-8888-888888888888", authorizedPlan: { planHash: "sha256:abc", maxCostUsd: 0.182 } });
  assert.deepEqual(execute.authorizedPlan, { planHash: "sha256:abc", maxCostUsd: 0.182 });
  assert.equal(SubjectDiscoverySearchRequestSchema.safeParse(execute).success, true);
  assert.doesNotMatch(JSON.stringify(execute), /volume|cpc|estimate|brandId|actor/i);
});

/* ----------------------------- volume (§47) ----------------------------- */

test("'Com volume' lê só o Google Ads: a estimativa DataForSEO nunca vira volume", () => {
  const onlyEstimate = candidate({ keyword: "a", normalizedKeyword: "a", dataForSeoEstimate: { searchVolume: 5000, label: "Estimativa DataForSEO" } });
  const withAds = candidate({ keyword: "b", normalizedKeyword: "b", googleAds: { averageMonthlySearches: 10, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null } });
  assert.equal(subjectCandidateGoogleAdsVolume(onlyEstimate as never), null);
  assert.equal(subjectCandidateGoogleAdsVolume(withAds as never), 10);
  const withVolume = filterSubjectCandidates([onlyEstimate, withAds] as never[], { ...SUBJECT_SEARCH_DEFAULT_FILTERS, volume: "Com volume" });
  assert.deepEqual(withVolume.map(item => (item as { keyword: string }).keyword), ["b"]);
  const without = filterSubjectCandidates([onlyEstimate, withAds] as never[], { ...SUBJECT_SEARCH_DEFAULT_FILTERS, volume: "Sem volume do Google Ads" });
  assert.deepEqual(without.map(item => (item as { keyword: string }).keyword), ["a"]);
});

test("filtros locais: origem, já existe e texto sem acento", () => {
  const list = [
    candidate({ keyword: "Clínica estética", normalizedKeyword: "clinica estetica", origins: ["labs_ranked"] }),
    candidate({ keyword: "outra", normalizedKeyword: "outra", origins: ["ads_keyword_seed"], existingKeywordId: "99999999-9999-4999-8999-999999999999" }),
  ];
  assert.equal(filterSubjectCandidates(list as never[], { ...SUBJECT_SEARCH_DEFAULT_FILTERS, origin: "labs_ranked" }).length, 1);
  assert.equal(filterSubjectCandidates(list as never[], { ...SUBJECT_SEARCH_DEFAULT_FILTERS, hideExisting: true }).length, 1);
  assert.equal(filterSubjectCandidates(list as never[], { ...SUBJECT_SEARCH_DEFAULT_FILTERS, text: "clinica" }).length, 1);
});

/* ------------------------------- rótulos e textos ------------------------------- */

test("cada origem tem rótulo próprio e nenhuma cai em 'Google Ads' genérico", () => {
  const labels = SUBJECT_DISCOVERY_SOURCES.map(source => subjectSearchOriginLabel(source));
  assert.equal(new Set(labels).size, SUBJECT_DISCOVERY_SOURCES.length);
  for (const label of labels) assert.notEqual(label, "Google Ads");
  assert.equal(subjectSearchOriginLabel("serpapi"), "Origem desconhecida (serpapi)");
});

test("textos fixos da tela", () => {
  assert.equal(SUBJECT_SEARCH_RULE_TEXT, "O Google Ads e o DataForSEO Labs devolvem as candidatas; o Minerador não fabrica termos.");
  assert.equal(SUBJECT_SEARCH_RULE_TEXT, SUBJECT_DISCOVERY_NOTICES.sourceRule);
  assert.equal(SUBJECT_SEARCH_ENTER_HELP, "Enter mostra o custo antes de pesquisar.");
  assert.equal(SUBJECT_SEARCH_VOLUME_REMEASURE_TEXT, "O volume será medido de novo no Processador, pelo Google Ads, sem custo.");
  assert.equal(SUBJECT_SEARCH_UNDECLARED_TEXT, "Para ligar estas keywords a um Assunto, declare-o antes, aqui ou no Processador.");
});

/* ---------------------------- Buscar sustentação ---------------------------- */

test("'Buscar sustentação': a URL leva só o UUID; frase ou id inválido não entram", () => {
  const id = "12345678-1234-4234-8234-123456789012";
  const href = subjectSearchLinkHref("adalba--33333333-3333-4333-8333-333333333333", id);
  assert.equal(href, `/adalba--33333333-3333-4333-8333-333333333333/minerador/descobrir?modo=assunto&assunto=${id}`);
  assert.deepEqual(parseSubjectSearchLink(`?modo=assunto&assunto=${id}`), { subjectMode: true, subjectKeywordId: id });
  assert.deepEqual(parseSubjectSearchLink("?modo=assunto&assunto=SEO%20para%20cl%C3%ADnicas"), { subjectMode: true, subjectKeywordId: null });
  assert.deepEqual(parseSubjectSearchLink(`?assunto=${id}`), { subjectMode: false, subjectKeywordId: null });
});

test("Assuntos declarados: só os declarados viram opção; retirado e malformado ficam fora", () => {
  const options = declaredSubjectOptions([
    { id: "12345678-1234-4234-8234-123456789012", keyword: "SEO para clínicas", keyword_subject: { declared: true, note: "para donos", destinationUrl: "https://exemplo.com/seo" } },
    { id: "12345678-1234-4234-8234-123456789013", keyword: "retirado", keyword_subject: null },
    { id: "12345678-1234-4234-8234-123456789014", keyword: "malformado", keyword_subject: { declared: "sim" } },
    { id: "nao-e-uuid", keyword: "x", keyword_subject: { declared: true } },
  ]);
  assert.deepEqual(options, [{ id: "12345678-1234-4234-8234-123456789012", keyword: "SEO para clínicas", note: "para donos", destinationUrl: "https://exemplo.com/seo" }]);
});

test("diálogo de custo: preço por item e totais aparecem sem arredondar para baixo", () => {
  assert.equal(formatSubjectSearchUsd(0.00012), "US$ 0,00012");
  assert.equal(formatSubjectSearchUsd(0.012), "US$ 0,012");
  assert.equal(formatSubjectSearchUsd(0.0035), "US$ 0,0035");
  assert.equal(formatSubjectSearchUsd(0.182), "US$ 0,182");
  assert.equal(formatSubjectSearchUsd(0.2), "US$ 0,200");
  assert.equal(formatSubjectSearchUsd(null), "—");
});

test("lentes da SERP pelo nome do aparelho, nunca o id técnico", () => {
  assert.equal(subjectSearchLensName("desktop-windows"), "Desktop · Windows");
  assert.equal(subjectSearchLensName("desktop-macos"), "Desktop · macOS");
  assert.equal(subjectSearchLensName("mobile-android"), "Celular · Android");
  assert.equal(subjectSearchLensName("mobile-ios"), "Celular · iOS");
  assert.equal(subjectSearchLensName("outra"), "outra");
});
