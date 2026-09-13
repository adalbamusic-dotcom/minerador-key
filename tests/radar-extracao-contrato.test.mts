import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_EXTRACTION_BATCH_LIMIT,
  RADAR_EXTRACTION_ERROR,
  RadarExtractionRequestSchema,
  radarExtractionBatches,
  radarExtractionErrorMessage,
  radarExtractionRefusal,
} from "../lib/radar/extraction-request.ts";
import { RadarAnalysisPayloadSchema, RadarExtractionPageSchema, buildRadarBenchmark } from "../lib/radar/analysis-contracts.ts";

/*
 * O SMOKE PAROU AQUI, E A MENSAGEM NÃO AJUDOU.
 *
 * `mascara de skincare`, snapshot v4 com 8 resultados, 7 referências curadas,
 * write e readback confirmados — e o clique devolvia "Solicitação de extração
 * Radar inválida.". A causa era um teto de cinco páginas por requisição que
 * vivia dentro da rota e a tela nunca conheceu.
 *
 * Estes testes fixam o contrato inteiro: o teto, os lotes, a principal, a
 * curadoria como autoridade e a recusa com código.
 */
const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const articleId = "article-mascara-de-skincare";
const articleDnaVersionId = "4bfca609-0e2e-4d50-8797-5d387adb4849";
const snapshotId = "serp:mascara-de-skincare:v4";
const snapshotHash = "sha256:" + "a".repeat(64);
const SELECIONADAS = 7;

const posicoes = Array.from({ length: SELECIONADAS }, (_, index) => index + 1);
const chave = (position: number) => `organic:${position}`;
const url = (position: number) => `https://exemplo-${position}.com.br/pagina`;

const payload = (patch: Record<string, unknown> = {}) => RadarAnalysisPayloadSchema.parse({
  schemaVersion: 1, brandId, articleId, articleDnaVersionId,
  serpSnapshotId: snapshotId, serpSnapshotVersion: 4, serpSnapshotHash: snapshotHash,
  mode: "competitive_full",
  modeRecommendation: { suggestedMode: "competitive_full", reasons: ["smoke"], confidence: "high", ruleSource: "minerador_kgr_strict" },
  modeHumanReason: "",
  serpDecisions: posicoes.map(position => ({ key: chave(position), itemType: "organic", decision: "included", reason: "Concorrente selecionado pelo usuário.", note: "", ownDomain: false })),
  selectedCompetitorIds: posicoes.map(chave),
  extractionIds: [], extractions: [], benchmark: null, semanticTerms: [], structuralDecisions: [],
  competitiveness: null, keywordDecisions: [], competitiveReport: null, plannerPackage: null,
  plannerTransfer: null, status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  ...patch,
});

const analise = (patch: Record<string, unknown> = {}) => ({
  versionId: "8b2a33d8-0f5f-4db8-8944-ef08c25136f7", entityId: `radar-analysis:${articleId}`,
  versionNumber: 4, previousVersionId: null, contentHash: "sha256:" + "c".repeat(64),
  origin: "human", changeReason: "smoke", createdAt: "2026-09-07T15:29:51.000Z", createdBy: "ator-1",
  payload: payload(patch),
});

const candidatos = (quantas = SELECIONADAS) => posicoes.slice(0, quantas).map(position => ({
  key: chave(position), url: url(position), itemType: "organic" as const, decision: "included" as const,
}));

const pedido = (patch: Record<string, unknown> = {}) => ({
  brandId, articleId, analysis: analise(),
  candidates: candidatos(RADAR_EXTRACTION_BATCH_LIMIT),
  snapshotId, snapshotHash, keyword: "mascara de skincare",
  ...patch,
});

/* ---------------------------------- A ------------------------------------ */

test("A · snapshot v4 com 7 selecionadas: a seleção inteira parseia, em lotes que cabem no contrato", () => {
  const selecao = candidatos();
  assert.equal(selecao.length, 7);

  // O pedido inteiro é o que falhava: sete acima do teto de cinco.
  const inteiro = RadarExtractionRequestSchema.safeParse(pedido({ candidates: selecao }));
  assert.equal(inteiro.success, false);
  const issue = inteiro.success ? null : inteiro.error.issues.find(item => item.path.join(".") === "candidates");
  assert.equal(issue?.code, "too_big");

  const lotes = radarExtractionBatches(selecao);
  assert.deepEqual(lotes.map(lote => lote.length), [5, 2]);
  for (const lote of lotes) {
    const parsed = RadarExtractionRequestSchema.safeParse(pedido({ candidates: lote }));
    assert.equal(parsed.success, true, "cada lote parseia");
    assert.equal(radarExtractionRefusal(parsed.success ? parsed.data : (null as never)), null);
  }
});

/* ---------------------------------- B ------------------------------------ */

test("B · a principal viaja no pedido e chega ao extractor", () => {
  const parsed = RadarExtractionRequestSchema.parse(pedido());
  assert.equal(parsed.keyword, "mascara de skincare");

  const rota = readFileSync(new URL("../app/api/editorial/radar-analysis/extract/route.ts", import.meta.url), "utf8");
  /*
   * O destino deixou de sair do candidato enviado: ele vem de
   * `radarExtractionTargets`, resolvido sobre a análise persistida. A principal
   * continua viajando no pedido — é contexto de leitura, não destino de fetch.
   */
  assert.match(rota, /extractCompetitorPage\(target\.url, \{ keyword: input\.keyword \}\)/);
  assert.match(rota, /radarExtractionTargets\(autoridade, canonicalUrlByKey\)/);

  // Identificador técnico não é principal: o cliente só envia quando hidratada.
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(page, /radarPrincipalHydrated\(data\.r3\.keyword\) \? data\.r3\.keyword : undefined/);
});

/* -------------------------------- C e D ---------------------------------- */

test("C · seleção montada sobre outro snapshot é recusada", () => {
  const recusa = radarExtractionRefusal(RadarExtractionRequestSchema.parse(pedido({ snapshotId: "serp:mascara-de-skincare:v3" })));
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.SNAPSHOT_STALE);
  assert.equal(recusa?.status, 409);
  assert.match(radarExtractionErrorMessage(recusa?.code, "genérica"), /outro snapshot/i);
});

test("D · impressão digital da curadoria defasada é recusada", () => {
  const recusa = radarExtractionRefusal(RadarExtractionRequestSchema.parse(pedido({ snapshotHash: "sha256:" + "b".repeat(64) })));
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.CURATION_STALE);
  assert.match(radarExtractionErrorMessage(recusa?.code, "genérica"), /curadoria mudou/i);
});

/* ---------------------------------- E ------------------------------------ */

test("E · chave fora da curadoria persistida é recusada, mesmo com a tela pedindo", () => {
  const request = RadarExtractionRequestSchema.parse(pedido({
    candidates: [{ key: "organic:99", url: "https://intruso.com.br/pagina", itemType: "organic", decision: "included" }],
  }));
  const recusa = radarExtractionRefusal(request);
  assert.equal(recusa?.code, RADAR_EXTRACTION_ERROR.CURATION_STALE);
  assert.deepEqual(recusa?.details.keys, ["organic:99"]);
});

/* ---------------------------------- F ------------------------------------ */

test("F · marca ou artigo divergente é recusado antes de qualquer fetch", () => {
  const outraMarca = radarExtractionRefusal(RadarExtractionRequestSchema.parse(pedido({ brandId: "11111111-1111-4111-8111-111111111111" })));
  assert.equal(outraMarca?.code, RADAR_EXTRACTION_ERROR.ARTICLE_MISMATCH);

  const outroArtigo = radarExtractionRefusal(RadarExtractionRequestSchema.parse(pedido({ articleId: "article-outro" })));
  assert.equal(outroArtigo?.code, RADAR_EXTRACTION_ERROR.ARTICLE_MISMATCH);
});

/* ---------------------------------- G ------------------------------------ */

test("G · campo desconhecido continua sendo recusado: strict não foi afrouxado", () => {
  const parsed = RadarExtractionRequestSchema.safeParse({ ...pedido(), campoNovo: "qualquer" });
  assert.equal(parsed.success, false);
  assert.equal(parsed.success ? null : parsed.error.issues[0].code, "unrecognized_keys");

  const fonte = readFileSync(new URL("../lib/radar/extraction-request.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /passthrough|z\.unknown\(\)|catchall/);
  assert.match(fonte, /\}\)\.strict\(\)/);
});

/* -------------------------------- H e I ---------------------------------- */

test("H · sete referências válidas chegam inteiras ao extractor, sem perder nem repetir", () => {
  const lotes = radarExtractionBatches(candidatos());
  const enviadas = lotes.flat();
  assert.equal(enviadas.length, SELECIONADAS);
  assert.equal(new Set(enviadas.map(item => item.key)).size, SELECIONADAS);
  assert.deepEqual(enviadas.map(item => item.key), posicoes.map(chave));
});

test("I · uma referência que falha não derruba a amostra", () => {
  const pagina = (position: number) => RadarExtractionPageSchema.parse({
    id: `page-${position}`, url: url(position), status: "success", fetchedAt: "2026-09-07T16:00:00.000Z",
    title: `Página ${position}`, metaDescription: "", canonical: null, h1: ["H1"], h2: ["Como usar", "Benefícios"], h3: [],
    wordCount: 1000 + position * 10, internalLinkCount: 5, externalLinkCount: 2, listCount: 3, tableCount: 0,
    faqCount: 0, imageCount: 4, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
    structuredDataTypes: ["Article"], recurringTerms: [], boldCount: 10, italicCount: 0, error: "",
  });
  // Seis sucessos e uma falha: o benchmark continua existindo sobre os seis.
  const extraidas = posicoes.slice(0, SELECIONADAS - 1).map(pagina);
  const benchmark = buildRadarBenchmark("competitive_full", extraidas);
  assert.equal(benchmark.validPageCount, SELECIONADAS - 1);
  assert.ok(benchmark.metrics.words);

  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  // A falha é registrada, não descartada — e só zero página analisada aborta.
  assert.match(page, /falhas\.push\(/);
  /*
   * GATE 18.10.1 · "zero página LIDA AGORA" deixou de ser sempre abortivo.
   *
   * Numa rodada nova, nenhuma página lida continua abortando — é o que este
   * teste protege. Na RETOMADA da consolidação, porém, zero páginas novas é o
   * caso esperado: as onze já estão gravadas no servidor e o que falta é
   * consolidá-las. Abortar ali deixaria o trabalho pago inalcançável.
   */
  assert.match(page, /if \(!pages\.length && !retomandoConsolidacao\) throw new Error/);
  assert.match(page, /const retomandoConsolidacao = persistencia\?\.state === "ANALYSIS_PARTIALLY_PERSISTED"/, "e a exceção tem uma condição nomeada");
  // O desfecho da falha mudou de nome: "sem acesso" em vez de "não processada".
  assert.ok(page.includes("${falhas.length} sem acesso"), "a falha é dita, com nome de desfecho");

  const rota = readFileSync(new URL("../app/api/editorial/radar-analysis/extract/route.ts", import.meta.url), "utf8");
  assert.match(rota, /errors: pages\.filter\(result => "error" in result\)/);
});

/* ---------------------------------- J ------------------------------------ */

test("J · a análise é persistida com readback antes de a tela declarar sucesso", () => {
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  /*
   * HOTFIX 18.10.3 · a escrita do carimbo saiu do caminho best-effort.
   *
   * `persistSerpAnalysis` continua servindo as escritas que PODEM cair em
   * fallback local. A que carrega `analysisCompletedAt` passou a exigir remoto:
   * era o fallback dela que mantinha o banco na v24 com a tela mostrando
   * relatório pronto. A ordem protegida aqui — sucessora antes da persistência
   * — segue idêntica.
   */
  assert.match(page, /requireRemote: true,/);
  const posSucessora = page.indexOf("{ ...candidatePayload, competitiveReport: report }");
  const posPersist = page.indexOf("const salvo = await pipeline.saveRadarAnalysis(target.articleId, next, {");
  assert.ok(posSucessora > 0 && posPersist > posSucessora, "a sucessora é criada antes da persistência");
  assert.match(page, /saved\.persistenceMode === "remote" && saved\.readbackConfirmed/);
});

/* ------------------------- diagnóstico com código ------------------------- */

test("a recusa carrega código e causa: o log deixa de dizer apenas que é inválida", () => {
  const rota = readFileSync(new URL("../app/api/editorial/radar-analysis/extract/route.ts", import.meta.url), "utf8");
  assert.match(rota, /console\.error\("\[radar:extract\]", code, message/);
  assert.match(rota, /RADAR_EXTRACTION_ERROR\.BATCH_TOO_LARGE/);
  assert.match(rota, /RADAR_EXTRACTION_ERROR\.REQUEST_INVALID/);
  assert.ok(rota.includes('Solicitação de extração Radar inválida.", 400, error.issues)'), "os issues do Zod chegam ao log");

  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(page, /console\.error\("\[radar:extract\]", body\.code/);
  assert.match(page, /radarExtractionErrorMessage\(body\.code/);
});

test("nenhum fetch externo acontece no domínio do contrato", () => {
  const fonte = readFileSync(new URL("../lib/radar/extraction-request.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /fetch\(/);
  assert.doesNotMatch(fonte, /dataforseo/i);
});
