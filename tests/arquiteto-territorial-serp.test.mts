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
  /*
   * Em 2026-09-23 o produto decidiu que a primeira etapa da aba Silos é só
   * lógica: `Processar arquitetura` deixou de chamar a SERP. A guarda antiga
   * exigia `validateTerritorialSerp(true)` no workspace; a nova exige que
   * ninguém a chame assim — a SERP roda quando a pessoa pede, como etapa.
   */
  const semComentarios = workspace.split("\n").filter(linha => !/^\s*(\/\/|\*|\/\*)/.test(linha)).join("\n");
  assert.equal(semComentarios.includes("validateTerritorialSerp(true)"), false, "o processamento voltou a disparar a SERP sozinho");
});

/* ------------------------------ cache de SERP ---------------------------- */

/*
 * Em 2026-09-23 a rota passou a consultar o cache de SERP antes de pagar, e
 * trocou `regular` por `advanced` com lente explícita. As guardas abaixo
 * fixam essa forma; comentários são removidos antes de casar, senão a
 * explicação da própria rota satisfaria a guarda.
 */
const rotaSemComentarios = () => readFileSync("app/api/arquiteto/territorial-serp/route.ts", "utf8")
  .split(/\r?\n/).filter(linha => !/^\s*(\/\/|\*|\/\*)/.test(linha)).join("\n");

test("o cache é consultado antes de resolver credencial e quota", () => {
  const rota = rotaSemComentarios();
  const consulta = rota.indexOf("lookupSerpCache(pipelineContext");
  const resolve = rota.indexOf("await resolveDataForSeoCompatibilityConfig(");

  assert.ok(consulta > 0, "a rota não consulta o cache");
  assert.ok(resolve > 0, "a rota não resolve mais a Connection");
  assert.ok(consulta < resolve, "a credencial é lida antes de saber o que falta");
  // Corpo inteiro: toda consulta é normalizada, a observação não basta (R8).
  assert.match(rota, /lookupSerpCache\(pipelineContext, pedidos, \{ mode: "body", now \}\)/);
});

test("a quota é pedida só para as faltantes, e sem falta nem é pedida", () => {
  const rota = rotaSemComentarios();

  // A quota recusa zero unidade: com tudo em cache o resolve não pode rodar.
  assert.match(rota, /faltantes > 0\s*\?\s*await resolveDataForSeoCompatibilityConfig\(/);
  assert.match(rota, /quotaUnits: faltantes/);
  assert.doesNotMatch(rota, /quotaUnits: totalQueries/);
  // O uso registrado é o que foi pago nesta pergunta, nunca o total de consultas.
  assert.doesNotMatch(rota, /units: question\.queries\.length/);
  assert.equal((rota.match(/units: pagas/g) || []).length, 2, "sucesso e falha registram só o que foi pago");
  assert.equal((rota.match(/if \(pagas > 0 && dataForSeo\)/g) || []).length, 2, "acerto de cache não pode registrar uso");
  // A falta paga grava como Arquiteto; o caminho antigo, sem lente e sem cache, saiu.
  assert.match(rota, /collectedBy: "arquiteto"/);
  assert.doesNotMatch(rota, /collectDataForSeoSerpSnapshot/);
});

test("pseudo-id de território vira keywordId null na entrada de cache", () => {
  const rota = rotaSemComentarios();
  const prefixo = /const PSEUDO_ID_DE_TERRITORIO = "([^"]+)"/.exec(rota)?.[1];

  assert.equal(prefixo, "territory:");
  assert.match(rota, /keywordId: keywordIdDoAcervo\(query\.keywordId\)/);
  assert.match(rota, /startsWith\(PSEUDO_ID_DE_TERRITORIO\) \? null : keywordId/);

  // O prefixo da rota é o que o domínio de fato gera para um silo; uma
  // cabeceira do universo leva o id real da keyword e não é afetada.
  const questions = buildTerritorialSerpQuestions({
    territories: [
      territory(REF_A, { architecturalOrigin: "discovered" }),
      territory(REF_B, { lifecycleStatus: "confirmed", centralEntity: "skincare facial" }),
    ],
    keywordTexts: new Map(),
    heads: [{ keywordId: "k-real", keyword: "vitamina c", ambiguous: true, coherence: 0.8 }],
  });
  const ids = questions.flatMap(pergunta => pergunta.queries.map(query => query.keywordId));
  assert.ok(ids.filter(id => id !== "k-real").length >= 2);
  assert.ok(ids.filter(id => id !== "k-real").every(id => id.startsWith(prefixo!)));
  assert.ok(ids.includes("k-real"));
  assert.equal("k-real".startsWith(prefixo!), false);
});

test("a consulta é advanced e a lente enviada é explícita", () => {
  const rota = rotaSemComentarios();

  assert.match(rota, /endpoint: "advanced" as const/);
  assert.doesNotMatch(rota, /"regular"/);
  /*
   * Mudou em 2026-09-23 (adendo das 4 lentes, A4): o mapa local de
   * dispositivo virou `resolveRequestedSerpLenses`, que mantém o legado —
   * `desktop` é a canônica e `mobile` é android — e, sem `device`, pede as
   * quatro lentes. A regra é provada no teste do módulo de lentes.
   */
  assert.match(rota, /const requested = resolveRequestedSerpLenses\(\{ lenses: parsed\.data\.lenses, device: parsed\.data\.device \}\);/);
  assert.match(rota, /const lens = requested\.primary;/);
  // O snapshot rotula a lente que foi enviada — nunca uma suposta.
  assert.match(rota, /operatingSystem: lens\.operatingSystem/);
  // Os códigos da chave são os mesmos que a config terá, lidos sem credencial.
  assert.match(rota, /const alvo = readDataForSeoTargetCodes\(\)/);
  assert.match(rota, /if \(codigosDivergem\)/);
});

test("acerto normaliza com a proveniência da entrada; falta com o corpo cru", () => {
  const rota = rotaSemComentarios();

  assert.match(rota, /collectedAt: entrada\.meta\.collectedAt/);
  assert.match(rota, /providerRequestId: entrada\.meta\.providerRequestId/);
  // Mudou em 2026-09-23 (A2): a canônica é paga com 20 e o corpo cru volta recortado ao pedido, como o acerto.
  assert.match(rota, /body: serpBodyAtRequestedDepth\(coleta\.body, coleta\.meta\.depth, lookup\.request\.depth\), providerRequestId: coleta\.providerRequestId, collectedAt: coleta\.meta\.collectedAt/);
  // Um único instante por requisição.
  assert.equal((rota.match(/new Date\(/g) || []).length, 1);
});

test("cache fora do ar não derruba a SERP: tudo vira falta", () => {
  const rota = rotaSemComentarios();
  const inicio = rota.indexOf("let lookups: SerpCacheLookup[];");
  const trecho = rota.slice(inicio, rota.indexOf("const faltantes", inicio));

  assert.ok(inicio > 0);
  assert.match(trecho, /try \{\s*lookups = await lookupSerpCache\(/);
  assert.match(trecho, /catch \(error\)/);
  assert.match(trecho, /hit: null/);
});

/*
 * MUDANÇA DE COMPORTAMENTO dita: com `advanced`, o PAA chega e
 * `diagnostic.questions` deixa de ser zero — `breadthOf` passa a contar esse
 * sinal. Medido no corpo REAL `advanced` de "skincare facial": 4 perguntas.
 * O acerto de cache (corpo podado e cortado para a profundidade pedida) tem de
 * produzir o mesmo parecer que a coleta ao vivo.
 */
test("com advanced o PAA chega ao parecer, e o acerto de cache dá o mesmo parecer", async () => {
  const { normalizeDataForSeoSerpResponse } = await import("../lib/server/dataforseo-serp-normalizer.ts");
  const { pruneSerpBody, trimSerpBodyToDepth } = await import("../lib/editorial/serp-cache.ts");
  const cru = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
  const entrada = {
    brandId: "b", articleId: "serp:manual_silo:t1", articleDnaVersionId: "territorial:serp:manual_silo:t1",
    keywordId: REF_A, keywordDnaVersionId: `territorial:${REF_A}`, keyword: "skincare facial",
    location: "Brasil", language: "pt-br", device: "desktop" as const, operatingSystem: "windows" as const,
    expectedIntent: "", expectedFormat: "", requiredTopics: ["skincare facial"], articleEntities: [],
    resultLimit: 10, version: 1, previousSnapshotId: null,
  };
  const pergunta = question({ queries: [{ keywordId: REF_A, keyword: "skincare facial", role: "primary" }] });
  const aoVivo = normalizeDataForSeoSerpResponse(cru, entrada, { locationCode: 2076, languageCode: "pt" }, "2026-09-23T12:00:00.000Z", "req-vivo");
  const doCache = normalizeDataForSeoSerpResponse(trimSerpBodyToDepth(pruneSerpBody(cru), 10), entrada, { locationCode: 2076, languageCode: "pt" }, "2026-09-20T08:00:00.000Z", "req-gravado");

  assert.equal(aoVivo.diagnostic.questions.length, 4, "o PAA do advanced não chegou ao diagnóstico");
  assert.equal(aoVivo.operatingSystem, "windows");

  const parecerVivo = assessTerritorialSerp({ question: pergunta, snapshots: [aoVivo] });
  const parecerCache = assessTerritorialSerp({ question: pergunta, snapshots: [doCache] });
  const essencia = (parecer: typeof parecerVivo) => ({
    breadth: parecer.breadth, compatibility: parecer.compatibility, recommendation: parecer.recommendation,
    dominantType: parecer.dominantType, competition: parecer.competition, observedIntent: parecer.observedIntent,
    overlap: parecer.overlap,
  });

  assert.deepEqual(essencia(parecerCache), essencia(parecerVivo));
  assert.equal(parecerVivo.breadth, "broad");
  // Proveniência honesta: o parecer do acerto carrega o instante da observação gravada.
  assert.equal(parecerCache.collectedAt, "2026-09-20T08:00:00.000Z");
});

/* ============ A4 · SERP territorial nas quatro lentes (adendo) ============ */

/*
 * A sobreposição entre os dois silos é votada nas lentes em que as duas
 * consultas foram observadas: `high` só com maioria (e pelo menos duas);
 * alta em alguma lente sem ser maioria é FRONTEIRA para decisão humana —
 * nunca `usar_silo_existente` por uma lente só.
 */
const PARTILHADOS = ["https://a.com/x", "https://b.com/y"];
const DISTINTOS = ["https://c.com/1", "https://d.com/2", "https://e.com/3", "https://f.com/4", "https://g.com/5"];
const comparacao = () => question({ kind: "new_vs_existing", comparedTerritoryRef: REF_B, queries: [
  { keywordId: "territory:a", keyword: "sérum facial", role: "primary" },
  { keywordId: "territory:b", keyword: "sérum vitamina c", role: "comparison" },
] });
const snapshotsDe = (primaria: string[], comparada: string[]) => [
  snapshot("s1", { organicResults: primaria.map((url, i) => organic(i + 1, url, "article")) }),
  snapshot("s2", { organicResults: comparada.map((url, i) => organic(i + 1, url, "article")) }),
];
const leituraExtra = (lens: string, primaria: string[] | null, comparada: string[] | null, blocks: string[] = []) => ({
  lens, primaryUrls: primaria, comparisonUrls: comparada, blocks, collectedAt: ["2026-09-20T08:00:00.000Z"],
});
const contexto = (extras: ReturnType<typeof leituraExtra>[], missing: { lens: string; keywordId: string | null; reason: "não paga" | "sem par" | "sem digest" | "falha" | "sem entrada" | "vencida"; detail?: string }[] = []) => ({
  primaryLens: "desktop-windows", requested: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"],
  primaryBlocks: ["people_also_ask"], extras, missing,
});

test("A4 · `high` em 1 de 4 lentes NÃO recomenda usar o silo existente: vira fronteira humana", () => {
  const parecer = assessTerritorialSerp({
    question: comparacao(),
    snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS),
    lenses: contexto([
      leituraExtra("desktop-macos", PARTILHADOS, DISTINTOS),
      leituraExtra("mobile-android", PARTILHADOS, DISTINTOS),
      leituraExtra("mobile-ios", PARTILHADOS, DISTINTOS),
    ]),
  });
  assert.notEqual(parecer.recommendation, "usar_silo_existente");
  assert.equal(parecer.recommendation, "manter_silo");
  assert.equal(parecer.compatibility, "parcialmente_coerente");
  assert.ok(parecer.conflicts.includes("Sobreposição alta em 1 de 4 lentes."));
  assert.match(parecer.reason, /decisão humana/);
  assert.equal(parecer.overlap, "medium");
  assert.equal(parecer.lenses?.agreement, "0/4");
  assert.deepEqual(parecer.lenses?.perLens.map(linha => linha.verdict), ["high", "low", "low", "low"]);
});

test("A4 · `high` em 3 de 4 lentes recomenda — e a decisão continua humana", () => {
  const parecer = assessTerritorialSerp({
    question: comparacao(),
    snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS),
    lenses: contexto([
      leituraExtra("desktop-macos", PARTILHADOS, PARTILHADOS),
      leituraExtra("mobile-android", PARTILHADOS, PARTILHADOS),
      leituraExtra("mobile-ios", PARTILHADOS, DISTINTOS),
    ]),
  });
  assert.equal(parecer.overlap, "high");
  assert.equal(parecer.recommendation, "usar_silo_existente");
  assert.match(parecer.reason, /maioria das lentes/);
  assert.match(parecer.reason, /decisão continua humana/);
  assert.equal(parecer.lenses?.agreement, "3/4");
});

test("A4 · 2 de 4 não é maioria; lente sem as duas consultas não vota", () => {
  const empate = assessTerritorialSerp({
    question: comparacao(),
    snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS),
    lenses: contexto([
      leituraExtra("desktop-macos", PARTILHADOS, PARTILHADOS),
      leituraExtra("mobile-android", PARTILHADOS, DISTINTOS),
      leituraExtra("mobile-ios", PARTILHADOS, DISTINTOS),
    ]),
  });
  assert.equal(empate.recommendation, "manter_silo");
  assert.ok(empate.conflicts.includes("Sobreposição alta em 2 de 4 lentes."));

  // Só a principal e uma extra com as duas consultas: 2 de 2 é maioria.
  const duas = assessTerritorialSerp({
    question: comparacao(),
    snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS),
    lenses: contexto([leituraExtra("desktop-macos", PARTILHADOS, PARTILHADOS), leituraExtra("mobile-android", PARTILHADOS, null)], [
      { lens: "mobile-android", keywordId: null, reason: "não paga", detail: "Fora do plano de chamadas autorizado." },
      { lens: "mobile-ios", keywordId: null, reason: "falha", detail: "HTTP 500" },
    ]),
  });
  assert.equal(duas.recommendation, "usar_silo_existente");
  assert.equal(duas.lenses?.missing.length, 2);
});

test("A4 · uma lente só dá o parecer de hoje; amplitude e competição continuam da lente principal", () => {
  const hoje = assessTerritorialSerp({ question: comparacao(), snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS) });
  const umaLente = assessTerritorialSerp({ question: comparacao(), snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS), lenses: contexto([]) });
  const essencia = (parecer: typeof hoje) => ({
    compatibility: parecer.compatibility, recommendation: parecer.recommendation, overlap: parecer.overlap, reason: parecer.reason,
    breadth: parecer.breadth, competition: parecer.competition, dominantType: parecer.dominantType, conflicts: parecer.conflicts,
  });
  assert.deepEqual(essencia(umaLente), essencia(hoje));
  assert.equal("lenses" in hoje, false, "sem contexto de lentes, o parecer é o legado");
  // Extras discordantes não mexem em amplitude, competição nem tipo dominante.
  const comExtras = assessTerritorialSerp({
    question: comparacao(), snapshots: snapshotsDe(DISTINTOS, ["https://z.com/9"]),
    lenses: contexto([leituraExtra("desktop-macos", PARTILHADOS, PARTILHADOS), leituraExtra("mobile-ios", PARTILHADOS, PARTILHADOS)]),
  });
  const semExtras = assessTerritorialSerp({ question: comparacao(), snapshots: snapshotsDe(DISTINTOS, ["https://z.com/9"]) });
  assert.equal(comExtras.breadth, semExtras.breadth);
  assert.equal(comExtras.competition, semExtras.competition);
  assert.equal(comExtras.dominantType, semExtras.dominantType);
});

test("A4/A5 · pergunta sem comparação: o marcador traz os formatos por lente, sem voto", () => {
  const parecer = assessTerritorialSerp({
    question: question(),
    snapshots: [snapshot("s1", { organicResults: [organic(1, "https://a.com/x", "article")] })],
    lenses: contexto([leituraExtra("mobile-android", ["https://a.com/x"], null, ["popular_products", "local_pack"])], [
      { lens: "desktop-macos", keywordId: null, reason: "sem par", detail: "Pergunta sem comparação." },
    ]),
  });
  assert.equal(parecer.overlap, null);
  assert.equal(parecer.lenses?.agreement, "sem comparação");
  assert.deepEqual(parecer.lenses?.perLens.find(linha => linha.lens === "mobile-android")?.blocks, ["popular_products", "local_pack"]);
  assert.deepEqual(parecer.lenses?.perLens[0].blocks, ["people_also_ask"]);
  assert.deepEqual(parecer.lenses?.observed, ["desktop-windows", "mobile-android"]);
  assert.ok(parecer.lenses?.note);
});

test("A5 · o registro territorial preserva o marcador; a linha antiga continua válida", async () => {
  const { buildTerritorialSerpWorkflowRow, parseTerritorialSerpWorkflowRow, buildTerritorialSerpBase } = await import("../lib/arquiteto/territorial-serp-record.ts");
  const parecer = assessTerritorialSerp({
    question: comparacao(), snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS),
    lenses: contexto([leituraExtra("desktop-macos", PARTILHADOS, DISTINTOS)]),
  });
  const base = buildTerritorialSerpBase({ question: comparacao(), subjectFacts: ["entity:sérum facial"] });
  const lido = parseTerritorialSerpWorkflowRow(buildTerritorialSerpWorkflowRow({ assessment: parecer, base, operationRequestId: "op-1" }));
  assert.equal(lido.ok, true);
  assert.deepEqual(lido.payload?.assessment.lenses, parecer.lenses);
  const antigo = assessTerritorialSerp({ question: comparacao(), snapshots: snapshotsDe(PARTILHADOS, PARTILHADOS) });
  const lidoAntigo = parseTerritorialSerpWorkflowRow(buildTerritorialSerpWorkflowRow({ assessment: antigo, base, operationRequestId: "op-1" }));
  assert.equal(lidoAntigo.ok, true);
  assert.equal(lidoAntigo.payload && "lenses" in lidoAntigo.payload.assessment, false);
});

test("A4/A6 · a rota: plano antes de pagar, autorização, orçamento, extras pelo digest e só com comparação", () => {
  const rota = rotaSemComentarios();
  const plano = rota.indexOf('if (parsed.data.mode === "plan") {');
  assert.ok(plano > -1);
  assert.ok(plano < rota.indexOf("await resolveDataForSeoCompatibilityConfig("), "o plano não resolve credencial");
  assert.ok(plano < rota.indexOf('{ mode: "body", now }'), "o plano não lê corpo");
  assert.ok(plano < rota.indexOf("await collectAndCacheSerp("), "o plano não paga");
  const retornoDoPlano = rota.slice(plano, rota.indexOf("let lookups: SerpCacheLookup[];"));
  assert.match(retornoDoPlano, /\{ mode: "meta", now \}/);
  assert.match(retornoDoPlano, /return NextResponse\.json\(\{ success: true, data: \{ mode: "plan",/);

  const autorizar = rota.indexOf("const autorizacao = authorizeSerpPaidPlan(plan, parsed.data.authorizedPaidQueries);");
  assert.ok(autorizar > -1 && autorizar < rota.indexOf("await resolveDataForSeoCompatibilityConfig("));
  assert.match(rota, /if \(!autorizacao\.ok\) \{[\s\S]*?status: 409 \}\);/);
  // O orçamento é consumido antes de toda coleta nova — principal e extra.
  assert.match(rota, /if \(!orcamento\.take\(\)\) throw new SerpPaidBudgetExhaustedError\(\);\n\s+pagas \+= 1;/);
  assert.match(rota, /if \(!orcamento\.take\(\)\) \{ naoObservada\("não paga", "Fora do plano de chamadas autorizado\."\); continue; \}/);
  // As extras só pelo digest, e só a pergunta com comparação as paga.
  assert.match(rota, /lookupSerpCache\(pipelineContext, pedidosExtras\.map\(item => item\.request\), \{ mode: "digest", now \}\)/);
  assert.match(rota, /comparison: question\.queries\.length > 1,/);
  // Sem comparação, nunca paga: só reaproveita o que outra pergunta desta requisição já pagou.
  const semComparacao = rota.slice(rota.indexOf("} else if (!pedido.comparison) {"), rota.indexOf("} else if (!parsed.data.payMissingExtraLenses) {"));
  assert.match(semComparacao, /const jaPaga = coletasExtras\.get\(lookup\.subjectId\);\n\s+if \(!jaPaga\) \{\n\s+naoObservada\("sem par",/);
  assert.doesNotMatch(semComparacao, /orcamento\.take\(\)|coletarExtra\(/, "a pergunta sem comparação não paga");
  assert.match(rota, /storeBody: architectSerpStoresBody\(query\.lens\)/);
  // A quota é o plano autorizado.
  assert.match(rota, /const faltantes = plan\.paidQueries;/);
  // O legado continua sem marcador.
  assert.match(rota, /const contexto: TerritorialLensContext \| undefined = requested\.legacy \? undefined : \{/);
  // A cabeceira do universo usa os códigos do Minerador, lidos no servidor.
  assert.match(rota, /await readMineradorKeywordTargetCodes\(pipelineContext\.supabase, pipelineContext\.brandId, idsDoAcervo, alvo\)/);
});

test("correção A2 · o portão de datas territorial é POR CONSULTA: consultas de épocas diferentes não são 'lentes de datas diferentes'", () => {
  // O silo confirmado em cache há 20 dias, com as 4 lentes da mesma época; o novo, pago agora nas 4.
  const velho = "2026-09-03T12:00:00.000Z";
  const novo = "2026-09-23T12:00:00.000Z";
  const leitura = (lens: string, primaria: string, comparada: string) => ({
    lens, primaryUrls: PARTILHADOS, comparisonUrls: PARTILHADOS, blocks: [], collectedAt: [primaria, comparada],
    primaryCollectedAt: primaria, comparisonCollectedAt: comparada,
  });
  const snapshots = [
    snapshot("s1", { collectedAt: novo, organicResults: PARTILHADOS.map((url, i) => organic(i + 1, url, "article")) }),
    snapshot("s2", { collectedAt: velho, organicResults: PARTILHADOS.map((url, i) => organic(i + 1, url, "article")) }),
  ];
  const consistente = assessTerritorialSerp({
    question: comparacao(), snapshots,
    lenses: contexto([leitura("desktop-macos", novo, velho), leitura("mobile-android", novo, velho), leitura("mobile-ios", novo, velho)] as never),
  });
  // O defeito, fixado: antes, as datas das DUAS consultas eram misturadas e davam 20 dias.
  assert.equal(consistente.lenses?.collectedAtSpreadDays, 0);
  assert.equal(consistente.lenses?.datesDiverge, false);

  // Uma lente da comparação 9 dias atrás das outras da MESMA consulta: aí sim, marcada.
  const umaAntiga = assessTerritorialSerp({
    question: comparacao(), snapshots,
    lenses: contexto([leitura("desktop-macos", novo, velho), leitura("mobile-android", novo, "2026-08-25T12:00:00.000Z"), leitura("mobile-ios", novo, velho)] as never),
  });
  assert.equal(umaAntiga.lenses?.collectedAtSpreadDays, 9);
  assert.equal(umaAntiga.lenses?.datesDiverge, true);

  // Leitura sem as datas por consulta (forma anterior): as posições de `collectedAt`, principal primeiro.
  const semCampos = assessTerritorialSerp({
    question: comparacao(), snapshots,
    lenses: contexto([{ lens: "desktop-macos", primaryUrls: PARTILHADOS, comparisonUrls: PARTILHADOS, blocks: [], collectedAt: [novo, velho] }]),
  });
  assert.equal(semCampos.lenses?.datesDiverge, false);
});

test("correção A2 · a rota territorial passa a data de cada consulta à leitura da lente", () => {
  const rota = rotaSemComentarios();
  assert.match(rota, /primaryUrls: urls, blocks: observado\.digest\.blocks\.map\(bloco => bloco\.type\), primaryCollectedAt: snapshot\.collectedAt \}/);
  assert.match(rota, /comparisonUrls: urls, comparisonCollectedAt: snapshot\.collectedAt \}/);
});
