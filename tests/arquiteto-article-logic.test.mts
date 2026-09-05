import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDeterministicArticleArchitecture, buildProvisionalGroups } from "../lib/arquiteto/engine.ts";

const keyword = (id: string, value: string, overrides: Record<string, unknown> = {}) => ({
  id,
  keyword: value,
  intent: "Informativo",
  volume_search: 100,
  results_allintitle: 100,
  kgr_score: null,
  lista_id: null,
  siloName: null,
  status: "aprovado",
  analise_semantica: { entidade_central: "clinica" },
  ...overrides,
});

test("volume alto sozinho não cria candidata a Silo", () => {
  const result = buildDeterministicArticleArchitecture([
    keyword("wide", "marketing", { volume_search: 5000, results_allintitle: null, analise_semantica: { entidade_central: "marketing" } }),
  ]);
  assert.equal(result.siloCandidates.length, 0);
  const wide = result.groups.flatMap(group => group.keywords).find(item => item.id === "wide");
  assert.equal(wide?.siloCandidate?.status, "not_candidate");
});

test("termo específico não vira candidata apenas por volume", () => {
  const result = buildDeterministicArticleArchitecture([
    keyword("specific", "como fazer marketing para dentistas especializados", { volume_search: 5000, results_allintitle: 20, analise_semantica: { entidade_central: "marketing para dentistas", modificadores: ["especializados", "passo a passo"], tipo_editorial: "tutorial" } }),
    keyword("support-1", "marketing para dentistas", { volume_search: 200, results_allintitle: 30, analise_semantica: { entidade_central: "marketing para dentistas" } }),
    keyword("support-2", "marketing odontologico", { volume_search: 180, results_allintitle: 25, analise_semantica: { entidade_central: "marketing para dentistas" } }),
  ]);
  assert.equal(result.siloCandidates.some(item => item.id === "specific"), false);
  const specific = [...result.groups.flatMap(group => group.keywords), ...result.ungrouped].find(item => item.id === "specific");
  assert.match(specific?.siloCandidate?.reasons.join(" ") || "", /específica/);
});

test("termo curto e amplo pode ser reservado como candidata forte", () => {
  const result = buildDeterministicArticleArchitecture([
    keyword("broad", "clinica", { volume_search: 500, results_allintitle: 800 }),
    keyword("support-1", "clinica estetica", { volume_search: 150, results_allintitle: 220 }),
    keyword("support-2", "clinica odontologica", { volume_search: 120, results_allintitle: 180 }),
  ]);
  const candidate = result.siloCandidates.find(item => item.id === "broad");
  assert.ok(candidate);
  assert.equal(candidate.siloCandidate?.status, "candidate");
  assert.equal(result.groups.flatMap(group => group.keywordIds).includes("broad"), false);
  assert.ok(candidate.siloCandidate?.reasons.some(reason => /curto|ampla|relacionadas/.test(reason)));
});

test("oportunidade KGR é evidência secundária e não cria Pilar nem ArticleDNA", () => {
  const result = buildDeterministicArticleArchitecture([
    keyword("kgr", "clinica", { volume_search: 500, results_allintitle: 20 }),
    keyword("support-1", "clinica estetica", { volume_search: 150, results_allintitle: 80 }),
    keyword("support-2", "clinica odontologica", { volume_search: 120, results_allintitle: 70 }),
  ]);
  const candidate = result.siloCandidates.find(item => item.id === "kgr");
  assert.equal(candidate?.siloCandidate?.signals.kgrOpportunity, true);
  assert.equal(result.groups.some(group => group.suggestedHierarchy === "Pilar" && group.keywordIds.includes("kgr")), false);
  assert.equal("articleDna" in result, false);
});

test("nenhuma keyword é descartada e refs individuais permanecem nos grupos", () => {
  const input = [
    keyword("broad", "clinica", { volume_search: 500, results_allintitle: 800, keywordDnaRef: { entityId: "broad", versionId: "legacy:broad:v1", contentHash: "legacy:broad" } }),
    keyword("support-1", "clinica estetica", { keywordDnaRef: { entityId: "support-1", versionId: "legacy:support-1:v1", contentHash: "legacy:support-1" } }),
    keyword("support-2", "clinica odontologica", { keywordDnaRef: { entityId: "support-2", versionId: "legacy:support-2:v1", contentHash: "legacy:support-2" } }),
    keyword("separate", "contabilidade", { volume_search: null, results_allintitle: null, analise_semantica: { entidade_central: "contabilidade" } }),
  ];
  const result = buildDeterministicArticleArchitecture(input);
  const returnedIds = new Set([...result.groups.flatMap(group => group.keywordIds), ...result.siloCandidates.map(item => item.id), ...result.ungrouped.map(item => item.id)]);
  assert.deepEqual(returnedIds, new Set(input.map(item => item.id)));
  const grouped = result.groups.flatMap(group => group.keywords);
  assert.ok(grouped.every(item => item.keywordDnaRef?.entityId === item.id));
  assert.ok(result.groups.every(group => (group.groupingReasons || []).length > 0));
});

test("null permanece null, zero real permanece zero e decisão humana não é sobrescrita", () => {
  const humanMark = {
    status: "not_candidate" as const,
    origin: "human" as const,
    score: null,
    reasons: ["Humano decidiu manter na arquitetura de artigos."],
    signals: { volumeRank: null, volumeHigh: false, resultsPresent: false, shortTerm: true, broadEntity: true, capacityPotential: true, kgrOpportunity: false, commercialSecondary: false, specificNeed: false, relatedKeywordCount: 2 },
  };
  const result = buildDeterministicArticleArchitecture([
    keyword("zero", "clinica", { volume_search: 0, results_allintitle: 0, siloCandidate: humanMark }),
    keyword("null", "clinica estetica", { volume_search: null, results_allintitle: null }),
    keyword("other", "clinica odontologica", { volume_search: 100, results_allintitle: 20 }),
  ]);
  const zero = [...result.groups.flatMap(group => group.keywords), ...result.ungrouped].find(item => item.id === "zero");
  const missing = [...result.groups.flatMap(group => group.keywords), ...result.ungrouped].find(item => item.id === "null");
  assert.equal(zero?.volume_search, 0);
  assert.equal(zero?.results_allintitle, 0);
  assert.equal(zero?.siloCandidate?.origin, "human");
  assert.equal(zero?.siloCandidate?.status, "not_candidate");
  assert.equal(missing?.volume_search, null);
  assert.equal(missing?.results_allintitle, null);
});

test("motor do Lote 3 é determinístico e não consulta SERP ou IA", async () => {
  const source = await readFile("lib/arquiteto/engine.ts", "utf8");
  assert.doesNotMatch(source, /fetch\(|callStrategicApi|DataForSEO|DeepSeek|OpenAI/);
  const input = [keyword("a", "clinica"), keyword("b", "clinica estetica"), keyword("c", "clinica odontologica")];
  const first = buildDeterministicArticleArchitecture(input);
  const second = buildDeterministicArticleArchitecture(input);
  assert.deepEqual(first.groups.map(group => group.id), second.groups.map(group => group.id));
  assert.deepEqual(first.siloCandidates.map(item => item.id), second.siloCandidates.map(item => item.id));
});

test("grupos explicam a hipótese com razões determinísticas", () => {
  const group = buildProvisionalGroups([
    keyword("a", "seo para clinicas"),
    keyword("b", "seo para clinicas estetica"),
  ])[0]!;
  const codes = new Set((group.groupingReasons || []).map(reason => reason.code));
  assert.ok(codes.has("same_intent"));
  assert.ok(codes.has("same_entity"));
  assert.ok((group.groupingReasons || []).every(reason => reason.message.length > 0));
});

test("working copy expõe reserva e decisão humana sem criar Silo ou ArticleDNA", async () => {
  const workspace = await readFile("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const route = await readFile("app/api/arquiteto/workspace/route.ts", "utf8");
  const canonical = await readFile("lib/arquiteto/canonical-workspace.ts", "utf8");
  assert.match(workspace, /Candidatas provisórias a Silo/);
  assert.match(workspace, /Usar em artigo/);
  assert.match(workspace, /Remover marcação/);
  assert.match(workspace, /Nenhum ArticleDNA foi criado/);
  assert.match(route, /siloCandidate/);
  assert.match(canonical, /assignedSiloCandidate/);
});
