import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessTerritorialSerp,
  buildTerritorialSerpQuestions,
  territorialSerpBlockedReason,
  type TerritorialSerpQuestion,
} from "../lib/arquiteto/territorial-serp.ts";

const REF_A = "territory:11111111-1111-4111-8111-111111111111";
const REF_B = "territory:22222222-2222-4222-8222-222222222222";
const REF_C = "territory:33333333-3333-4333-8333-333333333333";

const territory = (territoryRef: string, overrides: Record<string, unknown> = {}) => ({
  territoryRef,
  name: "Sérum facial",
  centralEntity: "sérum facial",
  lifecycleStatus: "candidate",
  architecturalOrigin: "manual_strategic",
  publishedStructureRef: null,
  conflicts: [] as unknown[],
  ...overrides,
});

const organic = (position: number, url: string, inferredType: string) => ({
  position, title: `Resultado ${position}`, url, domain: new URL(url).hostname,
  snippet: "", sitelinks: [], date: null, inferredType, confidence: "high",
  manualType: null, notes: "",
});

const snapshot = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, brandId: "brand-1", articleId: "q1", articleDnaVersionId: "v1",
  keywordId: "k1", keywordDnaVersionId: "kv1", query: "sérum facial",
  country: "BR", language: "pt", location: "Brasil", device: "desktop",
  resultLimit: 10, provider: "interno", providerEndpoint: "/search",
  origin: "real", isMock: false, collectedAt: "2026-09-03T12:00:00.000Z",
  version: 1, previousSnapshotId: null, contentHash: "a".repeat(64),
  persistenceMode: "remote", resolutionMode: "remote_canonical",
  canonicalRemoteVerified: true, status: "needs_review",
  organicResults: [organic(1, "https://a.com/x", "article")],
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: {
    dominantIntent: "informacional", secondaryIntents: [], confidence: "high",
    dominantFormats: [], resultTypeCounts: {}, pageTypes: [],
    recurringTitlePatterns: [], recurringSnippetPatterns: [], frequentEntities: [],
    frequentDomains: [], localSignals: [], questions: [], relatedSearches: [],
    possibleConflicts: [], opportunities: [], limitations: [],
  },
  ...overrides,
}) as never;

/* ---------------------------- quais perguntas ---------------------------- */

test("silo confirmado e sem conflito não gasta consulta", () => {
  const questions = buildTerritorialSerpQuestions({
    territories: [territory(REF_A, { lifecycleStatus: "confirmed" })],
    keywordTexts: new Map(),
  });

  assert.deepEqual(questions, []);
  assert.match(territorialSerpBlockedReason({ questions, hasBrand: true })!,
    /Nenhuma dúvida arquitetural requer SERP/);
});

test("silo confirmado COM conflito volta a ser pergunta", () => {
  const questions = buildTerritorialSerpQuestions({
    territories: [territory(REF_A, { lifecycleStatus: "confirmed", conflicts: ["conflito aberto"] })],
    keywordTexts: new Map(),
  });

  assert.equal(questions.length, 1);
});

test("cada origem de silo vira a pergunta certa", () => {
  const questions = buildTerritorialSerpQuestions({
    territories: [
      territory(REF_A),
      territory(REF_B, { publishedStructureRef: { normalizedUrl: "site.com/x" }, architecturalOrigin: "discovered" }),
      territory(REF_C, { architecturalOrigin: "discovered", centralEntity: "protetor solar" }),
    ],
    keywordTexts: new Map(),
  });

  const por = (ref: string) => questions.find(question => question.territoryRef === ref)!;
  assert.equal(por(REF_A).kind, "manual_silo");
  assert.equal(por(REF_B).kind, "site_silo");
  assert.equal(por(REF_C).kind, "new_vs_existing");
  assert.match(por(REF_B).reason, /universo, não como artigo/);
});

test("a consulta é o texto real da entidade, nunca o identificador", () => {
  const questions = buildTerritorialSerpQuestions({
    territories: [territory(REF_A, { centralEntity: "protetor solar mineral" })],
    keywordTexts: new Map(),
  });

  assert.equal(questions[0].queries[0].keyword, "protetor solar mineral");
  assert.doesNotMatch(questions[0].queries[0].keyword, /territory:/);
});

test("silo novo é comparado a um confirmado, quando existe", () => {
  const questions = buildTerritorialSerpQuestions({
    territories: [
      territory(REF_A, { architecturalOrigin: "discovered" }),
      territory(REF_B, { lifecycleStatus: "confirmed", centralEntity: "skincare facial" }),
    ],
    keywordTexts: new Map(),
  });

  const nova = questions.find(question => question.territoryRef === REF_A)!;
  assert.equal(nova.comparedTerritoryRef, REF_B);
  assert.equal(nova.queries.length, 2);
  assert.equal(nova.queries[1].role, "comparison");
  assert.equal(nova.queries[1].keyword, "skincare facial");
});

test("cabeceira clara e coerente não vira consulta; ambígua vira", () => {
  const questions = buildTerritorialSerpQuestions({
    territories: [],
    keywordTexts: new Map(),
    heads: [
      { keywordId: "k1", keyword: "retinol", ambiguous: false, coherence: 0.8 },
      { keywordId: "k2", keyword: "vitamina c", ambiguous: true, coherence: 0.8 },
      { keywordId: "k3", keyword: "niacinamida", ambiguous: false, coherence: 0.2 },
    ],
  });

  assert.deepEqual(questions.map(question => question.questionId), [
    "serp:head_candidate:k2", "serp:head_candidate:k3",
  ]);
  assert.match(questions[0].reason, /mais de uma cabeceira plausível/);
});

test("a seleção humana restringe o escopo da consulta", () => {
  const questions = buildTerritorialSerpQuestions({
    territories: [territory(REF_A), territory(REF_B, { centralEntity: "outro" })],
    keywordTexts: new Map(),
    selectedTerritoryRefs: new Set([REF_B]),
  });

  assert.deepEqual(questions.map(question => question.territoryRef), [REF_B]);
});

/* ----------------------------- como interpreta --------------------------- */

const question = (overrides: Partial<TerritorialSerpQuestion> = {}): TerritorialSerpQuestion => ({
  questionId: "serp:manual_silo:t1",
  kind: "manual_silo",
  territoryRef: REF_A,
  queries: [{ keywordId: "k1", keyword: "sérum facial", role: "primary" }],
  comparedTerritoryRef: null,
  reason: "teste",
  ...overrides,
});

test("SERP vazia declara evidência insuficiente em vez de arriscar", () => {
  const assessment = assessTerritorialSerp({
    question: question(),
    snapshots: [snapshot("s1", { organicResults: [] })],
  });

  assert.equal(assessment.compatibility, "insuficiente");
  assert.equal(assessment.recommendation, "evidencia_insuficiente");
  assert.equal(assessment.breadth, "unknown");
});

test("sobreposição alta recomenda usar o silo existente, sem executar nada", () => {
  const partilhados = [organic(1, "https://a.com/x", "article"), organic(2, "https://b.com/y", "article")];
  const assessment = assessTerritorialSerp({
    question: question({ kind: "new_vs_existing", comparedTerritoryRef: REF_B }),
    snapshots: [snapshot("s1", { organicResults: partilhados }), snapshot("s2", { organicResults: partilhados })],
  });

  assert.equal(assessment.overlap, "high");
  assert.equal(assessment.compatibility, "incompativel");
  assert.equal(assessment.recommendation, "usar_silo_existente");
  assert.match(assessment.reason, /decisão continua humana/);
  assert.equal(assessment.comparedTerritoryRef, REF_B);
});

test("SERP estreita de artigo diz que a cabeceira é assunto, não universo", () => {
  const assessment = assessTerritorialSerp({
    question: question({ kind: "head_candidate", territoryRef: null }),
    snapshots: [snapshot("s1", { organicResults: [organic(1, "https://a.com/x", "article"), organic(2, "https://b.com/y", "article")] })],
  });

  assert.equal(assessment.breadth, "narrow");
  assert.equal(assessment.dominantType, "article");
  assert.equal(assessment.recommendation, "revisar_cabeceira");
});

test("SERP ampla com páginas de organização sustenta o universo", () => {
  const assessment = assessTerritorialSerp({
    question: question({ kind: "site_silo" }),
    snapshots: [snapshot("s1", {
      organicResults: [
        organic(1, "https://a.com/x", "category"),
        organic(2, "https://b.com/y", "category"),
        organic(3, "https://c.com/z", "list"),
      ],
      diagnostic: { ...(snapshot("tmp") as never as { diagnostic: Record<string, unknown> }).diagnostic, secondaryIntents: ["comercial", "navegacional"] },
    })],
  });

  assert.equal(assessment.breadth, "broad");
  assert.equal(assessment.compatibility, "coerente");
  assert.equal(assessment.recommendation, "manter_silo");
});

test("o parecer guarda os snapshots que o sustentam", () => {
  const assessment = assessTerritorialSerp({
    question: question(),
    snapshots: [snapshot("s1"), snapshot("s2")],
  });

  assert.deepEqual(assessment.snapshotIds, ["s1", "s2"]);
  assert.equal(assessment.collectedAt, "2026-09-03T12:00:00.000Z");
});

/* ------------------------------ contrato duro ---------------------------- */

test("o domínio é puro e a SERP nunca aplica decisão", () => {
  const source = readFileSync("lib/arquiteto/territorial-serp.ts", "utf8")
    .split("\n").filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*")).join("\n");

  assert.doesNotMatch(source, /fetch\(|supabase|localStorage/i);
  // Nenhum nome de provider vaza do domínio para a UI.
  assert.doesNotMatch(source, /DataForSeo|dataforseo|DeepSeek|Serper|RapidAPI/i);
  // Evidência não escreve território: comparar `lifecycleStatus` é leitura;
  // atribuir é que seria decisão aplicada.
  assert.doesNotMatch(source, /territoryUpdates|territoryCreates/);
  assert.doesNotMatch(source, /lifecycleStatus\s*=\s*["']/);
});

test("a rota usa a Connection global e não expõe provider na resposta", () => {
  const route = readFileSync("app/api/arquiteto/territorial-serp/route.ts", "utf8");

  assert.match(route, /resolveDataForSeoCompatibilityConfig/);
  assert.match(route, /assertEditorialPermission/);
  // A resposta devolve parecer, não credencial nem detalhe de provider.
  const resposta = route.slice(route.indexOf("return NextResponse.json({\n      success: true"));
  assert.doesNotMatch(resposta, /login|password|baseUrl|config/);
  // Nenhuma escrita de território na rota de evidência.
  assert.doesNotMatch(route, /territoryUpdates|territoryCreates/);
});

test("a UI fala de SERP, nunca do provider", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const inicio = workspace.indexOf("const validateTerritorialSerp");
  const handler = workspace.slice(inicio, inicio + 2200);

  assert.match(handler, /Validar SERP|SERP dos silos|parecer/i);
  assert.doesNotMatch(handler, /DataForSeo|dataforseo|DeepSeek|token|crédito|Connection/i);
  /*
   * "Nada foi aplicado" continua verdadeiro quando a SERP roda SOZINHA — ela
   * de fato só produz pareceres. O que mudou é que, chamada de dentro de
   * `Processar arquitetura`, ela não anuncia mais "prontos para revisão
   * humana": ali a evidência vira insumo da proposta, e abrir revisão criava
   * uma terceira etapa que o fluxo de dois botões não tem.
   */
  const completo = workspace.slice(inicio, inicio + 4000);
  assert.match(completo, /Nada foi aplicado/);
  assert.ok(completo.includes("dentroDoProcessamento"), "a SERP precisa saber de onde foi chamada");
  assert.ok(workspace.includes("validateTerritorialSerp(true)"), "o processamento precisa marcar a SERP como insumo");
});
