import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_DEFAULT_MAX_AGE_MS,
  SERP_CACHE_LENSES,
  SERP_CACHE_OBSERVATION_DEPTH,
  SERP_CACHE_STAGE,
  SERP_CACHE_SUBJECT_TYPE,
  buildSerpCacheRow,
  normalizeSerpCacheKeyword,
  pruneSerpBody,
  serpCacheEntryServes,
  serpCacheFreshness,
  serpCacheSubjectId,
  trimSerpBodyToDepth,
  type SerpCacheMeta,
  type SerpCacheQuery,
} from "../lib/editorial/serp-cache.ts";
import { serpCacheObservationFromBody } from "../lib/server/serp-cache-observation.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { buildRadarSerpFeatureIntelligence } from "../lib/radar/serp-features.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";

/**
 * O CACHE TEMPORÁRIO DE SERP — provado contra um corpo REAL.
 *
 * O fixture é uma resposta `advanced` crua da DataForSEO para "skincare
 * facial", desktop-windows, 20 resultados, coletada em 2026-09-23. Ele é o
 * oráculo: o corpo podado precisa produzir EXATAMENTE o mesmo resultado que o
 * cru nos três leitores reais — senão um acerto de cache devolveria outra
 * coisa que a coleta devolveria.
 */

const CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const ECO_SEM_OS = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-eco-desktop-sem-os.json", import.meta.url), "utf8"));
const NOW = new Date("2026-09-23T12:00:00.000Z");
const bytes = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor));
// O corpo da DataForSEO é JSON livre: os testes o navegam como o provider o entrega.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corpo = (valor: unknown) => valor as any;

const entrada = (resultLimit: number): SerpSearchInput => ({
  brandId: "b", articleId: "a", articleDnaVersionId: "v", keywordId: "k", keywordDnaVersionId: "kv",
  keyword: "skincare facial", location: "Brasil", language: "pt-br", device: "desktop", operatingSystem: "windows",
  expectedIntent: "informacional", expectedFormat: "", requiredTopics: ["skincare facial"], articleEntities: ["pele"],
  resultLimit, version: 1, previousSnapshotId: null,
});

const normalizar = (corpo: unknown, resultLimit = 20) => {
  const { id: _id, ...resto } = normalizeDataForSeoSerpResponse(corpo, entrada(resultLimit), { locationCode: 2076, languageCode: "pt" }, NOW.toISOString(), null);
  return resto;
};
const derivar = (corpo: unknown) => deriveSerpSemanticEvidence({
  body: corpo, keyword: "skincare facial", locationCode: 2076, languageCode: "pt", device: "desktop",
  providerRequestId: null, operationRequestId: "op", collectedAt: NOW.toISOString(),
});

/* ------------------------------- a poda ---------------------------------- */

test("a poda é EQUIVALENTE ao corpo cru nos três leitores reais", () => {
  const podado = pruneSerpBody(CRU);
  // Arquiteto e Radar normalizam; o contentHash cobre orgânicos, PAA, related e diagnóstico.
  assert.deepEqual(normalizar(podado), normalizar(CRU));
  // Blocos do Google: AI Overview, perguntas, produtos, imagens.
  assert.deepEqual(buildRadarSerpFeatureIntelligence(podado), buildRadarSerpFeatureIntelligence(CRU));
  // A qualificação semântica do Minerador.
  assert.deepEqual(derivar(podado), derivar(CRU));
  assert.ok(derivar(CRU), "o fixture precisa produzir evidência de verdade, senão a equivalência é vazia");
});

test("a poda corta o peso: o corpo de ~90 KB cai para uma fração", () => {
  const cru = bytes(CRU);
  const podado = bytes(pruneSerpBody(CRU));
  assert.ok(cru > 80_000, `fixture inesperadamente pequeno: ${cru} bytes`);
  assert.ok(podado < cru * 0.45, `podado ${podado} de ${cru} bytes — a poda não está cortando o suficiente`);
});

test("a poda nunca remove ITEM, só campo: a posição do People Also Ask é o índice", () => {
  const podado = corpo(pruneSerpBody(CRU));
  assert.equal(podado.tasks[0].result[0].items.length, CRU.tasks[0].result[0].items.length);
  assert.deepEqual(
    podado.tasks[0].result[0].items.map((item: { type: string }) => item.type),
    CRU.tasks[0].result[0].items.map((item: { type: string }) => item.type),
  );
});

test("o eco do provider sobrevive à poda: a lente gravada é a que o provider diz ter usado", () => {
  assert.equal(corpo(pruneSerpBody(CRU)).tasks[0].data.os, "windows");
});

test("tipo de item desconhecido passa INTEIRO — gravar a mais é mais barato que devolver a menos", () => {
  const video = { type: "video", rank_group: 1, rank_absolute: 3, title: "Vídeo", url: "https://youtube.com/x", campoFuturo: { algo: 1 }, xpath: "/html" };
  const cru = { tasks: [{ id: "t", status_code: 20000, result: [{ keyword: "k", items: [video] }] }] };
  assert.deepEqual(corpo(pruneSerpBody(cru)).tasks[0].result[0].items[0], video);
});

test("o padrão do provider para desktop sem `os` é windows — provado pelo eco da DataForSEO", () => {
  /*
   * Medido em 2026-09-23: a consulta desktop SEM `os` voltou com
   * `task.data.os = "windows"`. É isso que autoriza a coleta que o Minerador
   * já paga a servir a lente desktop-windows do Arquiteto.
   */
  assert.equal(ECO_SEM_OS.tasks[0].data.device, "desktop");
  assert.equal("os" in ECO_SEM_OS.tasks[0].data, true);
  assert.equal(ECO_SEM_OS.tasks[0].data.os, "windows");
  assert.deepEqual(SERP_CACHE_CANONICAL_LENS, { device: "desktop", operatingSystem: "windows" });
});

/* --------------------------- a profundidade ------------------------------ */

test("recortar para 10 dá o que uma coleta de 10 daria nos orgânicos", () => {
  const recortado = corpo(trimSerpBodyToDepth(CRU, 10));
  const itens = recortado.tasks[0].result[0].items as Array<{ type: string }>;
  assert.equal(itens.filter(item => item.type === "organic").length, 10);
  assert.deepEqual(normalizar(recortado, 10).organicResults, normalizar(CRU, 10).organicResults);
});

test("o recorte recalcula item_types para não anunciar bloco que ficou de fora", () => {
  const recortado = corpo(trimSerpBodyToDepth(CRU, 1));
  const itens = recortado.tasks[0].result[0].items as Array<{ type: string }>;
  const tipos = recortado.tasks[0].result[0].item_types as string[];
  assert.deepEqual(new Set(tipos), new Set(itens.map(item => item.type)));
});

/* ------------------------------- a chave --------------------------------- */

const consulta = (over: Partial<SerpCacheQuery> = {}): SerpCacheQuery => ({
  keyword: "skincare facial", locationCode: 2076, languageCode: "pt", lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced", ...over,
});

test("mesma consulta, mesma entrada — e só com trim e caixa", () => {
  assert.equal(serpCacheSubjectId(consulta()), serpCacheSubjectId(consulta({ keyword: "  Skincare Facial " })));
  assert.equal(serpCacheSubjectId(consulta({ languageCode: "PT" })), serpCacheSubjectId(consulta()));
});

test("acento e espaço interno separam entradas: o Minerador recusaria o acerto", () => {
  /*
   * O Minerador recusa o corpo quando `result.keyword` não bate com a pedida,
   * comparando sem caixa e sem acento, mas COM espaços. Unir aqui dois textos
   * que ele trata como diferentes faria um acerto virar erro.
   */
  assert.notEqual(serpCacheSubjectId(consulta({ keyword: "skincare  facial" })), serpCacheSubjectId(consulta()));
  assert.notEqual(serpCacheSubjectId(consulta({ keyword: "sérum" })), serpCacheSubjectId(consulta({ keyword: "serum" })));
  assert.equal(normalizeSerpCacheKeyword(" Sérum "), "sérum");
});

test("lente, endpoint, idioma e localidade são consultas diferentes", () => {
  const base = serpCacheSubjectId(consulta());
  for (const lens of SERP_CACHE_LENSES.slice(1)) assert.notEqual(serpCacheSubjectId(consulta({ lens })), base);
  assert.notEqual(serpCacheSubjectId(consulta({ endpoint: "regular" })), base);
  assert.notEqual(serpCacheSubjectId(consulta({ languageCode: "en" })), base);
  assert.notEqual(serpCacheSubjectId(consulta({ locationCode: 2840 })), base);
});

test("a chave é hexadecimal: texto com aspas não chega ao filtro .in()", () => {
  assert.match(serpCacheSubjectId(consulta({ keyword: 'creme "anti-idade" (noite)' })), /^serp:v1:[0-9a-f]{16}$/);
});

/* ------------------------------ a validade ------------------------------- */

const meta = (over: Partial<SerpCacheMeta> = {}): SerpCacheMeta => ({
  keyword: "skincare facial", normalizedKeyword: "skincare facial", locationCode: 2076, languageCode: "pt",
  lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced", depth: 20, collectedAt: "2026-09-01T12:00:00.000Z",
  providerRequestId: "p", keywordId: "kw-1", collectedBy: "minerador", ...over,
});

test("a validade padrão é 30 dias, contada da coleta", () => {
  const coletada = new Date(NOW.getTime() - SERP_CACHE_DEFAULT_MAX_AGE_MS).toISOString();
  assert.equal(serpCacheFreshness({ collectedAt: coletada }, { now: NOW }).fresh, true);
  const vencida = new Date(NOW.getTime() - SERP_CACHE_DEFAULT_MAX_AGE_MS - 1).toISOString();
  assert.equal(serpCacheFreshness({ collectedAt: vencida }, { now: NOW }).fresh, false);
});

test("cada consumidor pode exigir SERP mais nova que o padrão", () => {
  const seteDias = 7 * 24 * 60 * 60 * 1000;
  const dezDias = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(serpCacheFreshness({ collectedAt: dezDias }, { now: NOW }).fresh, true);
  assert.equal(serpCacheFreshness({ collectedAt: dezDias }, { now: NOW, maxAgeMs: seteDias }).fresh, false);
});

test("coleta com data no futuro ou ilegível não serve", () => {
  assert.equal(serpCacheFreshness({ collectedAt: "2027-01-01T00:00:00.000Z" }, { now: NOW }).fresh, false);
  assert.equal(serpCacheFreshness({ collectedAt: "ontem" }, { now: NOW }).fresh, false);
});

test("a coleta do Minerador (20) serve o Arquiteto (10); a de 10 não serve quem pede 20", () => {
  assert.deepEqual(serpCacheEntryServes(meta({ depth: 20 }), { query: consulta(), depth: 10, now: NOW }), { serves: true });
  const recusa = serpCacheEntryServes(meta({ depth: 10 }), { query: consulta(), depth: 20, now: NOW });
  assert.equal(recusa.serves, false);
});

test("colisão de hash vira ausência, nunca SERP de outra keyword", () => {
  const outra = serpCacheEntryServes(meta({ normalizedKeyword: "protetor solar" }), { query: consulta(), depth: 10, now: NOW });
  assert.equal(outra.serves, false);
  const outraLente = serpCacheEntryServes(meta({ lens: { device: "mobile", operatingSystem: "ios" } }), { query: consulta(), depth: 10, now: NOW });
  assert.equal(outraLente.serves, false);
});

/* ------------------------------- a linha --------------------------------- */

const payload = (over: Partial<SerpCacheMeta> = {}) => ({
  contractVersion: "serp-cache-v1" as const,
  meta: meta(over),
  observation: serpCacheObservationFromBody(pruneSerpBody(CRU), meta(over)),
  body: pruneSerpBody(CRU),
});

test("a entrada mora no estágio do Minerador, com tipo próprio", () => {
  const linha = buildSerpCacheRow(payload());
  assert.equal(linha.subjectType, SERP_CACHE_SUBJECT_TYPE);
  assert.equal(linha.stage, SERP_CACHE_STAGE);
  assert.equal(linha.stage, "minerador");
  assert.equal(linha.articleId, null);
  assert.equal(linha.subjectId, serpCacheSubjectId(consulta()));
});

test("com keyword do acervo, a entrada some junto com ela na exclusão", () => {
  assert.equal(buildSerpCacheRow(payload({ keywordId: "kw-9" })).sourceEntityId, "kw-9");
  // Sem keyword (consulta territorial por texto), a origem é a própria entrada.
  const semKeyword = buildSerpCacheRow(payload({ keywordId: null }));
  assert.equal(semKeyword.sourceEntityId, semKeyword.subjectId);
});

/* ---------------------------- a observação ------------------------------- */

test("a observação compacta sai do corpo real, no top 10, com a lente dita", () => {
  const observacao = serpCacheObservationFromBody(pruneSerpBody(CRU), meta());
  assert.equal(observacao.depth, SERP_CACHE_OBSERVATION_DEPTH);
  assert.equal(observacao.lens, "desktop-windows");
  assert.equal(observacao.organicCount, 10);
  assert.ok(observacao.questions.length > 0, "o advanced entrega as perguntas do PAA");
  assert.ok(observacao.relatedSearches.length > 0, "as buscas relacionadas moram em items[] e precisam chegar");
  // Os citados pela IA do Google também disputam o universo.
  for (const dominio of observacao.aiOverviewDomains) assert.ok(observacao.competitorDomains.includes(dominio));
  assert.ok(bytes(observacao) < 2_500, `observação com ${bytes(observacao)} bytes — deixou de ser compacta`);
});

test("a observação é a mesma calculada do corpo cru ou do podado", () => {
  assert.deepEqual(serpCacheObservationFromBody(pruneSerpBody(CRU), meta()), serpCacheObservationFromBody(CRU, meta()));
});

test("coleta de 20 e coleta de 10 dão a MESMA observação: a régua é o top 10", () => {
  assert.deepEqual(
    serpCacheObservationFromBody(CRU, meta({ depth: 20 })),
    serpCacheObservationFromBody(trimSerpBodyToDepth(CRU, 10), meta({ depth: 10 })),
  );
});

/* ------------------- a forma das leituras (SDD de egress) ----------------- */

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n")
  .filter(linha => !/^\s*(\/\/|\*|\/\*)/.test(linha))
  .join("\n");

test("R4/R5/R6/R8 — o store filtra a marca, não lê tudo e não devolve a linha", () => {
  const store = semComentarios("../lib/server/serp-cache-store.ts");
  assert.equal(/select\(\s*["']\*["']\s*\)/.test(store), false, "select('*') numa tabela com payload JSON");
  assert.equal((store.match(/\.eq\("marca_id", context\.brandId\)/g) || []).length >= 3, true, "toda consulta precisa filtrar a marca");
  // Quem agrupa lê só meta e observação; o corpo só no modo corpo. A leitura
  // meta é a maior do fluxo (todas as keywords de todos os grupos): se ela
  // trouxesse o corpo, ninguém perceberia.
  assert.match(store, /meta: "subject_id,meta:payload->meta",/);
  assert.match(store, /observation: "subject_id,meta:payload->meta,observation:payload->observation"/);
  assert.match(store, /body: "subject_id,meta:payload->meta,body:payload->body"/);
  assert.match(store, /\.select\(COLUNAS\[mode\]\)/);
  // A escrita devolve só o que o chamador precisa.
  assert.equal((store.match(/\.select\("id,lock_version"\)/g) || []).length, 2);
  // A procura da entrada lê o lock, a keyword presa a ela e a data da coleta — nunca o payload.
  // Mudou em 2026-09-23 (quatro lentes): a escrita SEM corpo acrescenta só um
  // marcador de texto do corpo, para nunca trocar uma entrada com corpo que ainda vale,
  // e a profundidade gravada (texto da meta), para não manter uma entrada mais rasa que o pedido.
  assert.match(store, /const PROCURA = "id,lock_version,source_entity_id,collectedAt:payload->meta->>collectedAt";/);
  assert.match(store, /const PROCURA_SEM_CORPO = `\$\{PROCURA\},bodyStatus:payload->body->>status_code,bodyDepth:payload->meta->>depth`;/);
  assert.match(store, /const colunasDaProcura: string = semCorpo \? PROCURA_SEM_CORPO : PROCURA;/);
  assert.equal((store.match(/\.select\(colunasDaProcura\)/g) || []).length, 1);
});

test("uma coleta sem keyword herda a keyword da entrada que sucede", () => {
  const store = semComentarios("../lib/server/serp-cache-store.ts");
  // Sem herança, a pergunta territorial soltaria a entrada da keyword e ela
  // sobreviveria à exclusão da keyword.
  assert.match(store, /!payload\.meta\.keywordId && typeof anterior === "string" && anterior && anterior !== pedida\.subjectId/);
  assert.match(store, /buildSerpCacheRow\(\{ \.\.\.payload, meta: \{ \.\.\.payload\.meta, keywordId: keywordHerdada \} \}\)/);
  // O insert e o update gravam a linha já com a herança aplicada.
  assert.equal((store.match(/source_entity_id: linha\.sourceEntityId/g) || []).length, 2);
});
