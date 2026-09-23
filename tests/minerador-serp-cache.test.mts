import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SERP_CACHE_CANONICAL_LENS, pruneSerpBody } from "../lib/editorial/serp-cache.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";
import { buildKeywordSemanticQualification, predatesCurrentSemanticQualification, repeatsCurrentSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";

/**
 * CALL 3 DO MINERADOR COM CACHE DE SERP — a SERP semântica do processo
 * Resultados consulta o cache da marca antes de pagar o provider.
 *
 * Nenhum teste chama provider: a rota é lida como texto (ela importa módulos
 * `server-only`) e o comportamento de um acerto é provado com o corpo REAL do
 * fixture `advanced` desktop-windows de 2026-09-23.
 *
 * O texto da rota é lido SEM comentários: senão uma guarda casaria com a
 * própria explicação escrita ao lado do código.
 */

const ROUTE_SOURCE = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");

function semComentarios(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith("//"))
    .join("\n");
}

const route = semComentarios(ROUTE_SOURCE);
const collect = route.slice(route.indexOf("async function collectSemanticSerp("), route.indexOf("async function recordTargetUsage("));
const post = route.slice(route.indexOf("export async function POST("), route.indexOf("async function persistSuccess("));

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));

test("os recortes existem: a guarda não pode passar por texto vazio", () => {
  assert.ok(collect.length > 500, "collectSemanticSerp foi encontrada");
  assert.ok(post.length > 500, "o handler POST foi encontrado");
  assert.ok(!route.includes("Leitura do cache: banco fora"), "os comentários foram removidos antes de casar");
});

test("collectSemanticSerp consulta o cache ANTES do provider", () => {
  const leitura = collect.indexOf("await lookupSerpCache(");
  const coleta = collect.indexOf("await collectAndCacheSerp(");
  assert.ok(leitura > 0, "a CALL 3 lê o cache");
  assert.ok(coleta > leitura, "só paga depois de consultar o cache");
  // O corpo é lido porque a evidência semântica normaliza o corpo inteiro.
  assert.match(collect, /lookupSerpCache\(input\.serpCache, \[request\], \{ mode: "body", now: input\.now, refresh: input\.refresh \}\)/);
  assert.equal(collect.split("await lookupSerpCache(").length - 1, 1);
  // Mudou em 2026-09-23 (decisão do usuário, quatro lentes): a CALL 3 continua
  // com UMA chamada paga, a da lente canônica; as outras três lentes do alvo
  // são pagas por `minerador-serp-lens-coverage` (testes "quatro lentes" abaixo).
  assert.equal(collect.split("await collectAndCacheSerp(").length - 1, 1, "uma única chamada paga da lente canônica por alvo");
});

test("o pedido do cache é a lente canônica, endpoint advanced e profundidade 20", () => {
  assert.match(collect, /lens: SERP_CACHE_CANONICAL_LENS/);
  assert.match(collect, /endpoint: "advanced"/);
  assert.match(route, /const SEMANTIC_SERP_DEPTH = 20;/);
  assert.match(collect, /depth: SEMANTIC_SERP_DEPTH/);
  // A localidade e o idioma da chave são os do targeting — os mesmos enviados.
  assert.match(collect, /locationCode: input\.locationCode,\s*languageCode: input\.languageCode,\s*lens:/);
  assert.match(collect, /keywordId: input\.keywordId/);
  assert.deepEqual(SERP_CACHE_CANONICAL_LENS, { device: "desktop", operatingSystem: "windows" });
});

test("a falta usa collectAndCacheSerp com o corpo CRU; nenhum provider direto sobra", () => {
  assert.ok(!route.includes("executeDataForSeoSerpOperation"), "nem import nem chamada direta do provider SERP na rota");
  assert.match(collect, /collectedBy: "minerador"/);
  assert.match(collect, /provider: \{ onRequestStarted: input\.onRequestStarted \}/);
  assert.match(collect, /body: collected\.body,/, "a evidência da falta lê o corpo cru devolvido pela coleta");
  assert.match(collect, /providerRequestId: collected\.providerRequestId,/);
  assert.match(collect, /serpSource: "COLLECTED"/);
});

test("existe fallback quando a leitura do cache lança", () => {
  const leitura = collect.indexOf("await lookupSerpCache(");
  const coleta = collect.indexOf("await collectAndCacheSerp(");
  const trecho = collect.slice(leitura, coleta);
  assert.match(trecho, /\} catch \(error\) \{/, "a leitura está protegida");
  assert.ok(!/\bthrow\b/.test(trecho), "a falha da leitura não é relançada");
  const antes = collect.slice(0, leitura);
  assert.ok(antes.lastIndexOf("try {") > antes.lastIndexOf("}"), "a leitura começa dentro de um try");
  // Entrada gravada que não vira evidência também não bloqueia: cai na coleta.
  // Mudou em 2026-09-23 (adendo das 4 lentes): o acerto devolve também a canônica
  // como entrada da leitura nas quatro lentes — o corpo relido e a proveniência dele.
  assert.match(trecho, /if \(evidence\) return \{ evidence, error: null, providerRequestId: null, cost: 0, serpSource: "REUSED", canonical: \{ lens: serpCacheLensLabel\(SERP_CACHE_CANONICAL_LENS\), body: reused\.body, collectedAt: reused\.collectedAt, providerRequestId: reused\.providerRequestId, collectedBy: reused\.collectedBy \} \};/);
});

test("acerto: proveniência da entrada, custo zero e nenhuma referência de consumo", () => {
  assert.match(collect, /collectedAt: lookup\.hit\.meta\.collectedAt/);
  assert.match(collect, /providerRequestId: lookup\.hit\.meta\.providerRequestId/);
  assert.match(collect, /body: reused\.body,/);
  assert.match(collect, /collectedAt: reused\.collectedAt,/);
  assert.match(collect, /providerRequestId: reused\.providerRequestId,/);
});

test("contexto do cache: service role da Qualificação, marca da rota e usuário do perfil", () => {
  assert.match(post, /get supabase\(\) \{ return getOperationalClient\(\); \}/);
  assert.match(post, /brandId: context\.brandId,\s*actorUserId: profile\.userId,/);
  // Um único instante por requisição, passado às duas chamadas.
  assert.equal(post.split("const now = new Date();").length - 1, 1);
  assert.equal(post.split("serpCache, now, refresh: serpEvidenceInvalidated(target) });").length - 1, 2, "os dois pontos de coleta passam cache, instante e a recoleta da evidência invalidada");
  // Mudou em 2026-09-23 (quatro lentes): uma unidade por alvo continua cobrindo
  // allintitle, KD e a lente canônica; cada lente extra que falta soma uma.
  assert.match(post, /await resolveConfig\(targets\.length \+ lensPlan\.missingQueries\)/);
  assert.equal(post.split("resolveDataForSeoCanonicalConfig(").length - 1, 1, "um único ponto de resolução da credencial");
});

test("serpSource chega ao resultado por alvo e à resposta", () => {
  assert.match(route, /serpSource: "COLLECTED" \| "REUSED" \| null;/);
  assert.match(post, /keywordOverview, keywordOverviewError, serpSource, serpEvidence, serpError \}\);/);
  assert.match(post, /serpSource: semanticSerpAfterFailure\.serpSource/);
  assert.match(post, /serpReusedCount: semanticEvidences\.filter\(item => item\.serpSource === "REUSED"\)\.length/);
});

test("acerto real: corpo podado gera a mesma evidência, com a proveniência da coleta original", async () => {
  const base = {
    keyword: "skincare facial",
    locationCode: 2076,
    languageCode: "pt",
    device: "desktop" as const,
    operationRequestId: "22222222-2222-4222-8222-222222222222",
  };
  const coletada = deriveSerpSemanticEvidence({ ...base, body: CRU, providerRequestId: "task-original", collectedAt: "2026-09-23T09:00:00.000Z" });
  const reaproveitada = deriveSerpSemanticEvidence({ ...base, body: pruneSerpBody(CRU), providerRequestId: "task-original", collectedAt: "2026-09-23T09:00:00.000Z" });
  assert.ok(coletada && reaproveitada);
  assert.deepEqual(reaproveitada, coletada);
  assert.equal(reaproveitada.providerRequestId, "task-original");
  assert.equal(reaproveitada.collectedAt, "2026-09-23T09:00:00.000Z");
});

test("fato medido: o contentHash da Qualificação NÃO ignora collectedAt nem a operação", async () => {
  /*
   * O que um acerto faz com o versionamento: `buildKeywordSemanticQualification`
   * sempre monta a versão seguinte (previous.version + 1) e o contentHash cobre
   * o rascunho inteiro — source.collectedAt, operationRequestId, versão. O
   * evidenceHash, por outro lado, só cobre consulta, resultados, amostra e
   * eixos. Então um acerto do cache GERARIA versão nova, com evidenceHash
   * igual ao da coleta original. Por isso a rota pergunta a
   * `repeatsCurrentSemanticQualification` antes de gravar (testes abaixo).
   */
  const base = { keyword: "skincare facial", locationCode: 2076, languageCode: "pt", device: "desktop" as const, providerRequestId: "task-original", collectedAt: "2026-09-23T09:00:00.000Z" };
  const original = deriveSerpSemanticEvidence({ ...base, body: CRU, operationRequestId: "33333333-3333-4333-8333-333333333333" })!;
  const relida = deriveSerpSemanticEvidence({ ...base, body: pruneSerpBody(CRU), operationRequestId: "44444444-4444-4444-8444-444444444444" })!;
  const v1 = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: original, createdBy: "user-1" });
  const v2 = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: relida, createdBy: "user-1", previous: v1 });
  assert.equal(v2.lifecycle.version, 2, "o acerto produz a versão seguinte");
  assert.equal(v2.evidence.evidenceHash, v1.evidence.evidenceHash, "a evidência em si é idêntica");
  assert.notEqual(v2.lifecycle.contentHash, v1.lifecycle.contentHash, "o contentHash muda com operação e versão");
  assert.equal(v2.source.collectedAt, v1.source.collectedAt, "a data de observação é a da coleta original");
});

/* ------------------ acerto não vira versão nova (AGENTS §9) ------------------ */

const EVIDENCIA = { keyword: "skincare facial", locationCode: 2076, languageCode: "pt", device: "desktop" as const };

test("acerto da MESMA coleta que a versão vigente registrou não é mudança real", async () => {
  // A coleta paga grava a versão com a data do cache; o acerto relê a mesma entrada.
  const coleta = deriveSerpSemanticEvidence({ ...EVIDENCIA, body: CRU, providerRequestId: "task-1", collectedAt: "2026-09-23T09:00:00.000Z", operationRequestId: "33333333-3333-4333-8333-333333333333" })!;
  const acerto = deriveSerpSemanticEvidence({ ...EVIDENCIA, body: pruneSerpBody(CRU), providerRequestId: "task-1", collectedAt: "2026-09-23T09:00:00.000Z", operationRequestId: "44444444-4444-4444-8444-444444444444" })!;
  const v1 = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: coleta, createdBy: "user-1" });
  const v2 = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: acerto, createdBy: "user-1", previous: v1 });
  assert.equal(repeatsCurrentSemanticQualification(v1, v2), true);
});

test("outra coleta, outra data, outra derivação ou outro conteúdo SÃO mudança real", async () => {
  const base = { ...EVIDENCIA, body: CRU, operationRequestId: "33333333-3333-4333-8333-333333333333" };
  const v1 = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, providerRequestId: "task-1", collectedAt: "2026-09-23T09:00:00.000Z" })!, createdBy: "user-1" });
  const outraTask = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, providerRequestId: "task-2", collectedAt: "2026-09-23T09:00:00.000Z" })!, createdBy: "user-1", previous: v1 });
  const outraData = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, providerRequestId: "task-1", collectedAt: "2026-09-24T09:00:00.000Z" })!, createdBy: "user-1", previous: v1 });
  assert.equal(repeatsCurrentSemanticQualification(v1, outraTask), false);
  assert.equal(repeatsCurrentSemanticQualification(v1, outraData), false);
  // Mesma coleta com outra derivação, outros limiares, outro conteúdo ou outro mercado.
  const mesmaColeta = { ...outraTask, source: v1.source } as typeof v1;
  assert.equal(repeatsCurrentSemanticQualification(v1, mesmaColeta), true, "a base do caso: tudo igual");
  assert.equal(repeatsCurrentSemanticQualification(v1, { ...mesmaColeta, derivation: { ...v1.derivation, derivationVersion: "outra" } }), false);
  assert.equal(repeatsCurrentSemanticQualification(v1, { ...mesmaColeta, derivation: { ...v1.derivation, thresholdsVersion: "outra" } }), false);
  assert.equal(repeatsCurrentSemanticQualification(v1, { ...mesmaColeta, evidence: { ...v1.evidence, serpFeatures: [{ type: "video", count: 9 }] } }), false);
  assert.equal(repeatsCurrentSemanticQualification(v1, { ...mesmaColeta, evidence: { ...v1.evidence, sample: v1.evidence.sample.slice(1) } }), false);
  assert.equal(repeatsCurrentSemanticQualification(v1, { ...mesmaColeta, intent: { ...v1.intent, strength: "weak" } }), false);
  assert.equal(repeatsCurrentSemanticQualification(v1, { ...mesmaColeta, query: { ...v1.query, locationCode: 2840 } }), false);
  assert.equal(repeatsCurrentSemanticQualification(v1, { ...mesmaColeta, query: { ...v1.query, device: "mobile" } }), false);
});

test("a caixa do texto não é mudança real: keyword e candidata dividem a mesma entrada do cache", async () => {
  const base = { ...EVIDENCIA, body: CRU, providerRequestId: "task-1", collectedAt: "2026-09-23T09:00:00.000Z" };
  const daTabela = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, keyword: "skincare facial", operationRequestId: "33333333-3333-4333-8333-333333333333" })!, createdBy: "user-1" });
  const daDescoberta = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, keyword: "Skincare Facial", operationRequestId: "44444444-4444-4444-8444-444444444444" })!, createdBy: "user-1", previous: daTabela });
  // O evidenceHash cobre a caixa — por isso ele não é a régua.
  assert.notEqual(daDescoberta.evidence.evidenceHash, daTabela.evidence.evidenceHash);
  assert.equal(repeatsCurrentSemanticQualification(daTabela, daDescoberta), true);
});

test("a vigente relida do jsonb (chaves reordenadas) continua sendo reconhecida", async () => {
  const evidencia = deriveSerpSemanticEvidence({ ...EVIDENCIA, body: CRU, providerRequestId: "task-1", collectedAt: "2026-09-23T09:00:00.000Z", operationRequestId: "33333333-3333-4333-8333-333333333333" })!;
  const v1 = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: evidencia, createdBy: "user-1" });
  // O Postgres devolve jsonb com as chaves em outra ordem.
  const reordenar = (valor: unknown): unknown => Array.isArray(valor)
    ? valor.map(reordenar)
    : valor && typeof valor === "object"
      ? Object.fromEntries(Object.entries(valor as Record<string, unknown>).reverse().map(([chave, item]) => [chave, reordenar(item)]))
      : valor;
  const relida = reordenar(v1) as typeof v1;
  assert.notEqual(JSON.stringify(relida), JSON.stringify(v1), "a ordem mudou de fato");
  const acerto = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: evidencia, createdBy: "user-1", previous: relida });
  assert.equal(repeatsCurrentSemanticQualification(relida, acerto), true);
});

test("coleta MAIS VELHA que a vigente é reconhecida — o tempo não anda para trás", async () => {
  const base = { ...EVIDENCIA, body: CRU, operationRequestId: "33333333-3333-4333-8333-333333333333" };
  const vigente = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, providerRequestId: "task-2", collectedAt: "2026-09-24T09:00:00.000Z" })!, createdBy: "user-1" });
  const maisVelha = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, providerRequestId: "task-1", collectedAt: "2026-09-23T09:00:00.000Z" })!, createdBy: "user-1", previous: vigente });
  const maisNova = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: deriveSerpSemanticEvidence({ ...base, providerRequestId: "task-3", collectedAt: "2026-09-25T09:00:00.000Z" })!, createdBy: "user-1", previous: vigente });
  assert.equal(predatesCurrentSemanticQualification(vigente, maisVelha), true);
  assert.equal(predatesCurrentSemanticQualification(vigente, maisNova), false);
  assert.equal(predatesCurrentSemanticQualification(vigente, vigente), false, "a mesma data não é mais velha");
  // Data ilegível não decide nada sozinha.
  assert.equal(predatesCurrentSemanticQualification(vigente, { ...maisVelha, source: { ...maisVelha.source, collectedAt: "ontem" } }), false);
});

test("a rota não versiona o acerto que repete ou precede a vigente — e corrige a projeção", () => {
  const inicio = post.indexOf("const persistQualification = async (");
  const persistir = post.slice(inicio, post.indexOf("} catch (error) {", inicio));
  assert.ok(persistir.length > 200, "persistQualification foi encontrada");
  assert.match(persistir, /if \(serpSource === "REUSED" && previous && \(repeatsCurrentSemanticQualification\(previous, qualification\) \|\| predatesCurrentSemanticQualification\(previous, qualification\)\)\) \{/);
  // O ramo termina em `return;` — sem ele o acerto marcaria `unchanged` E gravaria versão nova.
  assert.match(persistir, /persisted: true, unchanged: true, error: null, failure: null \}\);\n\s+return;\n\s+\}/);
  // O pulo vem ANTES de gravar a versão.
  const pulo = persistir.indexOf("repeatsCurrentSemanticQualification(previous, qualification)");
  assert.ok(pulo > -1 && pulo < persistir.indexOf("await persistKeywordSemanticQualification("));
  // Mas a projeção na keyword é conferida: vigente gravada pela Descoberta, ou
  // projeção que falhou, se corrige aqui — sem esperar o cache vencer.
  const ramo = persistir.slice(pulo, persistir.indexOf("return;", pulo));
  assert.match(ramo, /if \(readSerpEvidenceRecord\(asObject\(target\.keywordRow\?\.analise_semantica\)\)\?\.versionId !== previous\.id\) await projectSerpEvidenceRecord\(target, previous\);/);
  assert.ok(ramo.indexOf("projectSerpEvidenceRecord(") < ramo.indexOf("semanticQualifications.push("), "projeta antes de anunciar");
  // A vigente continua sendo a resposta: o cliente relê a Qualificação dela.
  assert.match(persistir, /versionId: previous\.id, version: previous\.lifecycle\.version, persisted: true, unchanged: true,/);
  // Acerto que muda a versão diz de onde veio a SERP.
  assert.match(persistir, /serpSource === "REUSED"\n?\s*\? `SERP orgânica reaproveitada do cache da marca/);
  assert.match(post, /semanticQualificationUnchangedCount: semanticQualifications\.filter\(item => item\.unchanged\)\.length/);
  // A projeção é uma só, para keyword, relendo a linha — usada pelos dois caminhos.
  const projetar = post.slice(post.indexOf("const projectSerpEvidenceRecord = async ("), inicio);
  assert.match(projetar, /if \(target\.targetKind !== "keyword" \|\| !target\.keywordId\) return;/);
  assert.match(projetar, /applySerpEvidenceRecord\(asObject\(latestRow\.data\.analise_semantica\), qualification\)/);
  assert.match(persistir, /await projectSerpEvidenceRecord\(target, qualification\);/);
});

test("a coleta paga grava a Qualificação com a data do cache, não com a hora da normalização", () => {
  assert.match(collect, /collectedAt: collected\.meta\.collectedAt,/);
  assert.doesNotMatch(collect, /collectedAt: new Date\(\)\.toISOString\(\)/);
});

/* ---------------- quatro lentes (decisão do usuário, 2026-09-23) --------------- */

/*
 * A rota de Resultados serve o botão do Processador e o "Medir resultados" da
 * Descoberta. Toda vez que ela aciona a SERP de um alvo, garante as QUATRO
 * lentes no cache. O comportamento das lentes roda de verdade em
 * `tests/serp-cache-runtime.test.mts` (banco em memória, provider falso); aqui
 * se prova a fiação na rota.
 */

const planoDasLentes = route.slice(route.indexOf("function lensCoverageTargets("), route.indexOf("async function recordTargetUsage("));
const laco = post.slice(post.indexOf("for (const target of targets) {"), post.indexOf("const lensOutcomesAll = "));
const liquidar = post.slice(post.indexOf("const settleLensCoverage = async ("), post.indexOf("for (const target of targets) {"));

test("quatro lentes: os recortes existem", () => {
  assert.ok(planoDasLentes.length > 200, "lensCoverageTargets foi encontrada");
  assert.ok(laco.length > 1000, "o laço dos alvos foi encontrado");
  assert.ok(liquidar.length > 300, "settleLensCoverage foi encontrada");
});

test("quatro lentes: o plano das três extras vem ANTES da credencial, e a quota conta as que faltam", () => {
  const plano = post.indexOf("await planSerpLensCoverage(serpCache, lensCoverageTargets(targets), { now });");
  const credencial = post.indexOf("await resolveConfig(");
  assert.ok(plano > 0, "o plano é feito");
  assert.ok(credencial > plano, "credencial e quota só depois de separar acertos de faltas");
  assert.ok(post.indexOf("const now = new Date();") < plano, "o mesmo instante da requisição vale para o plano");
  // Quota que não cobre as lentes extras não derruba Resultado nem KD: elas viram lacuna.
  assert.match(post, /if \(!lensPlan\.missingQueries \|\| !\(error instanceof IntegrationRuntimeError\) \|\| error\.code !== "INTEGRATION_QUOTA_EXHAUSTED"\) throw error;\s*lensQuotaCovered = false;/);
  assert.match(post, /return resolveConfig\(targets\.length\);/);
  // Quota parcial: o saldo além dos alvos paga as lentes que couberem (nunca mais que as faltantes).
  assert.match(post, /const lensQuota = canonicalDataForSeo\.resource\?\.quota;/);
  assert.match(post, /\? Math\.max\(0, Math\.min\(lensPlan\.missingQueries, Math\.floor\(lensQuota\.remainingUnits\) - targets\.length\)\)\s*: 0;/);
  assert.match(post, /createSerpLensCoverage\(serpCache, lensPlan, \{\s*config,\s*operationRequestId: input\.operationRequestId,\s*now,\s*quotaCovered: lensQuotaCovered,\s*quotaBudget: lensQuotaBudget,\s*provider: \{ onRequestStarted: \(\) => \{ apiRequestStarted = true; \} \},\s*\}\)/);
});

test("quatro lentes: o plano usa o MESMO targeting do laço, e a candidata sem keyword entra com null", () => {
  assert.match(planoDasLentes, /locationCode = readDataForSeoTargetCodes\(\)\.locationCode;/);
  assert.match(planoDasLentes, /resolveDataForSeoTargeting\(\{ \.\.\.targetingInput\(carregado\), locationCode \}\)/);
  assert.match(laco, /resolveDataForSeoTargeting\(\{ \.\.\.targetingInput\(target\), locationCode: config\.locationCode \}\)/);
  assert.match(planoDasLentes, /keyword: carregado\.keyword, keywordId: carregado\.keywordId, locationCode: targeting\.locationCode, languageCode: targeting\.languageCode/);
  // O laço do POST continua sendo o único "for (const target of targets)" da rota.
  assert.equal(route.split("for (const target of targets)").length - 1, 1);
  // Os dois tipos de alvo — keyword do Processador e candidata da Descoberta — passam pelo plano.
  assert.match(post, /lensCoverageTargets\(targets\)/);
  assert.doesNotMatch(planoDasLentes, /targetKind/, "nenhum tipo de alvo é filtrado");
});

test("quatro lentes: as extras correm com a cadeia do alvo, depois do targeting e do stale, e são esperadas no finally", () => {
  assert.equal(laco.split("lensCoverage.ensure(").length - 1, 1, "um único ponto por alvo");
  const inicio = laco.indexOf("const lensOutcomes = lensCoverage.ensure(target.targetId, { locationCode: targeting.locationCode, languageCode: targeting.languageCode });");
  assert.ok(inicio > laco.indexOf("if (isStale(target, startedAt, input.operationRequestId)) {"), "alvo atrasado não aciona SERP nenhuma");
  assert.ok(inicio < laco.indexOf("await measureDataForSeoAllintitle("), "começa antes da cadeia e corre junto com ela");
  assert.match(laco, /\} finally \{\n\s+await settleLensCoverage\(target, await lensOutcomes\);\n\s+\}\n\s+\}\s*$/);
  // Nenhum `await` da cobertura no meio da cadeia: ela não atrasa allintitle, KD nem a CALL 3.
  assert.equal(laco.split("await lensOutcomes").length - 1, 1);
});

/*
 * Mudou em 2026-09-23 (adendo das 4 lentes, §3): a intenção e o funil passaram
 * a ser lidos NAS QUATRO LENTES. A regra deixou de ser "só a canônica" e virou:
 * a Qualificação sai da leitura das quatro lentes, derivada DEPOIS que as
 * extras assentam; e as extras chegam à leitura só pelo digest, nunca pela
 * liquidação do uso.
 */
const lerNasLentes = post.slice(post.indexOf("const readAcrossLenses = async ("), post.indexOf("const lensOperationRequestId = "));

test("quatro lentes: a Qualificação sai da leitura das quatro lentes, depois que elas assentam", () => {
  assert.ok(lerNasLentes.length > 200, "readAcrossLenses foi encontrada");
  // A leitura espera as lentes, mapeia cada uma para digest ou falta, e deriva pela canônica + extras.
  assert.match(lerNasLentes, /if \(!semantic\.evidence \|\| !semantic\.canonical\) return semantic;/);
  assert.match(lerNasLentes, /const outcomes = await lensOutcomes;/);
  assert.match(lerNasLentes, /extras: serpLensDerivationInputs\(outcomes, \{ invalidatedBefore: evidenceInvalidated \? startedAt : null \}\),/);
  assert.match(lerNasLentes, /canonical: semantic\.canonical,/);
  assert.equal(route.split("deriveSerpSemanticEvidenceAcrossLenses(").length - 1, 1, "um único ponto de leitura nas quatro lentes");
  // Os dois caminhos que gravam Qualificação passam por ela, logo depois da CALL 3.
  for (const [canonica, lida] of [["canonicalSerp", "semanticSerp"], ["canonicalSerpAfterFailure", "semanticSerpAfterFailure"]]) {
    const coleta = laco.indexOf(`const ${canonica} = await collectSemanticSerp(`);
    const leitura = laco.indexOf(`const ${lida} = await readAcrossLenses(${canonica}, lensOutcomes, serpEvidenceInvalidated(target));`);
    assert.ok(coleta > 0 && leitura > coleta, `${lida}: a leitura vem depois da CALL 3`);
    const grava = laco.indexOf(`persistQualification(target, ${lida}.evidence, ${lida}.serpSource, ${lida}.lensesCollectedNow)`, leitura);
    const ou = laco.indexOf(`persistQualification(target, serpEvidence, serpSource, ${lida}.lensesCollectedNow)`, leitura);
    assert.ok(grava > leitura || ou > leitura, `${lida}: a Qualificação é gravada depois da leitura das lentes, com as lentes pagas agora`);
  }
  assert.match(laco, /const serpEvidence = semanticSerp\.evidence;/);
  // A liquidação só registra: não toca a keyword, a Qualificação nem o pacote aprovado.
  assert.doesNotMatch(liquidar, /analise_semantica|minerador_keywords|persistQualification|semanticEvidences|semanticQualifications|evidencia_serp|digest/);
  // A canônica continua sendo validada pela derivação de uma lente (acerto e falta).
  assert.equal(route.split("deriveSerpSemanticEvidence(").length - 1, 2, "acerto e falta da lente canônica");
});

test("quatro lentes: a leitura das lentes é PROTEGIDA — falhar nela volta à leitura da canônica e o alvo pago segue", () => {
  const protegida = lerNasLentes.slice(lerNasLentes.indexOf("try {"), lerNasLentes.lastIndexOf("};"));
  assert.ok(protegida.length > 200, "o try da leitura foi encontrado");
  const tenta = protegida.indexOf("try {");
  const captura = protegida.indexOf("} catch (error) {");
  assert.ok(tenta === 0 && captura > protegida.indexOf("deriveSerpSemanticEvidenceAcrossLenses("), "a derivação e a espera pelas lentes ficam dentro do try");
  assert.ok(protegida.indexOf("await lensOutcomes") > tenta && protegida.indexOf("await lensOutcomes") < captura);
  const ramo = protegida.slice(captura);
  assert.match(ramo, /console\.warn\("\[minerador\] serp_lens_derivation_failed", \{/);
  assert.match(ramo, /return semantic;\n\s+\}/, "na falha, a leitura de uma lente da canônica — que já existia — é a resposta");
  assert.doesNotMatch(ramo, /\bthrow\b/);
});

test("quatro lentes: o motivo da versão diz quando lentes extras foram pagas agora, mesmo com a canônica do cache", () => {
  const inicio = post.indexOf("const persistQualification = async (");
  const persistir = post.slice(inicio, post.indexOf("} catch (error) {", inicio));
  assert.match(persistir, /const persistQualification = async \(target: LoadedTarget, evidence: SerpSemanticEvidence, serpSource: SemanticSerpOutcome\["serpSource"\], lensesCollectedNow = 0\) => \{/);
  assert.match(persistir, /\(coleta de \$\{evidence\.collectedAt\}\)\$\{lensesCollectedNow \? `, com \$\{lensesCollectedNow\} lente\(s\) extra\(s\) coletada\(s\) agora,` : ""\} pelo processo Resultados/);
  // Contam só as extras LIDAS e pagas nesta requisição.
  assert.match(lerNasLentes, /const lidas = new Set\(\(evidence\.lensEvidence\?\.readings \|\| \[\]\)\.map\(reading => reading\.lens\)\);/);
  assert.match(lerNasLentes, /lensesCollectedNow: outcomes\.filter\(outcome => outcome\.source === "collected" && lidas\.has\(outcome\.lens\)\)\.length/);
});

test("quatro lentes: uso de cada chamada paga num registro por alvo; falhar ao registrar não derruba o alvo", () => {
  assert.match(liquidar, /const pagas = outcomes\.filter\(item => item\.paid\);\s*if \(!pagas\.length\) return;/);
  // A quota soma só o uso `succeeded`: nele entram só as lentes que voltaram como SERP;
  // as que falharam não contam (vão em metadata.failed), como o registro `failed` do alvo.
  assert.match(liquidar, /units: coletadas\.length \? coletadas\.length : pagas\.length,/);
  assert.doesNotMatch(liquidar, /units: pagas\.length,/);
  assert.match(liquidar, /const coletadas = pagas\.filter\(item => item\.source === "collected"\);/);
  assert.match(liquidar, /failed: pagas\.length - coletadas\.length,/);
  assert.match(liquidar, /idempotencyKey: `\$\{usageKey\(lensOperationRequestId, target\)\}:serp-lenses`,/);
  assert.match(liquidar, /resultStatus: coletadas\.length \? "succeeded" : "failed",/);
  assert.match(liquidar, /\} catch \(error\) \{\s*lensUsageRecordFailedCount \+= 1;/);
  assert.doesNotMatch(liquidar, /\bthrow\b/);
  // O registro do alvo (allintitle + KD + canônica) continua o mesmo.
  assert.match(route, /units: 1,\n\s+costAmount: input\.costAmount \?\? null,/);
});

test("quatro lentes: a resposta ganha contagens aditivas por lente e mantém os campos anteriores", () => {
  assert.match(post, /serpReusedCount: semanticEvidences\.filter\(item => item\.serpSource === "REUSED"\)\.length, serpLensCoverage, diagnostic: \{/);
  assert.match(post, /serpFailedCount: semanticEvidences\.filter\(item => item\.serpError\)\.length/);
  const resumo = post.slice(post.indexOf("const serpLensCoverage = {"), post.indexOf("const partial = failures.length > 0;"));
  assert.match(resumo, /lenses: SERP_CACHE_LENSES\.map\(serpCacheLensLabel\),/);
  assert.match(resumo, /depth: \{ canonical: SEMANTIC_SERP_DEPTH, others: SERP_LENS_COVERAGE_DEPTH \},/);
  assert.match(resumo, /\[serpCacheLensLabel\(SERP_CACHE_CANONICAL_LENS\)\]: \{/);
  assert.match(resumo, /\.\.\.countSerpLensOutcomes\(lensOutcomesAll\),/);
  assert.match(resumo, /quotaCovered: lensQuotaCovered,/);
  assert.match(resumo, /quotaBudget: lensQuotaBudget,/);
});

test("evidência SERP invalidada por decisão humana pula o cache", () => {
  // O cache devolveria justamente a SERP recusada — e a gravação limparia a invalidação.
  assert.match(post, /const serpEvidenceInvalidated = \(target: LoadedTarget\) => Boolean\(readSerpEvidenceRecord\(asObject\(target\.keywordRow\?\.analise_semantica\)\)\?\.invalidada\);/);
  assert.match(collect, /refresh: boolean;/);
  // As lentes extras também: a do cache anterior à requisição é da coleta recusada
  // (`evidence_invalidated`, comportamento em serp-cache-runtime.test). Os dois caminhos passam a invalidação.
  assert.equal(laco.split("lensOutcomes, serpEvidenceInvalidated(target));").length - 1, 2);
  assert.match(post, /const startedAt = now\.toISOString\(\);/);
});
