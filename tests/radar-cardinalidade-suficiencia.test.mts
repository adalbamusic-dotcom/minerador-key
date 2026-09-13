import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { resolveRadarInvestigationSufficiency, radarSufficiencyLabel, RADAR_MIN_COMPARABLE_SUFFICIENT } from "../lib/radar/investigation-sufficiency.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarSerpSynthesis } from "../lib/radar/serp-synthesis.ts";
import { RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import type { SerpSearchInput } from "../lib/radar/serp/contracts.ts";

/*
 * A SERP DE "CREMES SKIN CARE" NÃO TINHA DO QUE CONCLUIR — E CONCLUIU.
 *
 * 7 referências confirmadas, 4 analisadas, 3 falhas, ZERO páginas comparáveis;
 * mesmo assim saíram relatório com 49 necessidades, revisão e aprovação. Estes
 * testes fixam duas coisas: a cardinalidade tem explicação, e amostra vazia não
 * fecha investigação.
 */
const entrada: SerpSearchInput = {
  brandId: "09762023-d0d4-4c24-b34e-d0fdfd43f891",
  articleId: "article-cremes-skin-care",
  articleDnaVersionId: "article-dna-v7",
  keywordId: "kw-1",
  keywordDnaVersionId: "kwdna-1",
  keyword: "cremes skin care",
  language: "pt",
  location: "Brasil",
  device: "desktop",
  resultLimit: 10,
  version: 1,
  previousSnapshotId: null,
  requiredTopics: [],
  articleEntities: [],
} as unknown as SerpSearchInput;

const item = (type: string, rank: number, extra: Record<string, unknown> = {}) => ({
  type, rank_absolute: rank, rank_group: rank,
  title: `Item ${rank}`, url: `https://exemplo-${rank}.com.br/pagina`, description: "trecho observado",
  ...extra,
});

/** Uma resposta como a real: mais itens do que resultados orgânicos. */
const resposta = (items: unknown[]) => ({
  status_code: 20000,
  tasks: [{ id: "task-1", status_code: 20000, result: [{ items }] }],
});

/* ------------------------------- A e B ----------------------------------- */

test("A · oito orgânicos reais chegam como oito, e a distribuição bruta fica registrada", () => {
  /*
   * Treze itens na resposta, oito deles organic/video. Foi exatamente por isso
   * que as posições vieram 5,6,7,8,9,11,12,13 — não por corte artificial.
   */
  const items = [
    item("paid", 1), item("shopping", 2), item("featured_snippet", 3), item("people_also_ask", 4),
    item("organic", 5), item("organic", 6), item("organic", 7), item("organic", 8), item("organic", 9),
    item("related_searches", 10),
    item("organic", 11), item("video", 12), item("organic", 13),
  ];
  const snapshot = normalizeDataForSeoSerpResponse(resposta(items), entrada, { locationCode: 2076, languageCode: "pt" });

  assert.equal(snapshot.organicResults.length, 8, "oito itens organic/video sobreviveram ao filtro de tipo");
  assert.deepEqual(snapshot.organicResults.map(result => result.position), [5, 6, 7, 8, 9, 11, 12, 13]);
  assert.equal(snapshot.diagnostic.rawItemTypeCounts.organic, 7);
  assert.equal(snapshot.diagnostic.rawItemTypeCounts.video, 1);
  assert.equal(snapshot.diagnostic.rawItemTypeCounts.paid, 1);
  assert.equal(Object.values(snapshot.diagnostic.rawItemTypeCounts).reduce((total, valor) => total + valor, 0), items.length);
});

test("B · não existe teto de 8: o único corte é o resultLimit pedido", () => {
  const fonte = readFileSync(new URL("../lib/server/dataforseo-serp-normalizer.ts", import.meta.url), "utf8");
  assert.match(fonte, /\.slice\(0, input\.resultLimit\)/);
  /*
   * O arquivo TEM um `slice(0, 8)` — mas ele corta `missingTopics` do
   * diagnóstico, não os resultados. A verificação olha a derivação dos
   * orgânicos, e só ela.
   */
  const derivacao = fonte.slice(fonte.indexOf("const organic = rawItems.map"), fonte.indexOf("const paa = rawItems.flatMap"));
  for (const cap of ["slice(0, 8)", "slice(0,8)", "Math.min(8", "take(8)"]) {
    assert.equal(derivacao.includes(cap), false, `nenhum corte artificial em ${cap}`);
  }
  assert.equal(derivacao.split(".slice(").length - 1, 1, "um único corte na derivação dos orgânicos");

  // Com dez orgânicos e limite dez, chegam dez.
  const dez = Array.from({ length: 10 }, (_, index) => item("organic", index + 1));
  assert.equal(normalizeDataForSeoSerpResponse(resposta(dez), entrada, { locationCode: 2076, languageCode: "pt" }).organicResults.length, 10);

  // O limite pedido é respeitado, e é o único.
  const comLimite = { ...entrada, resultLimit: 5 } as SerpSearchInput;
  assert.equal(normalizeDataForSeoSerpResponse(resposta(dez), comLimite, { locationCode: 2076, languageCode: "pt" }).organicResults.length, 5);
});

/* ------------------------------ C, D e E --------------------------------- */

test("C, D e E · a seleção confirmada é exatamente a que a pessoa marcou", () => {
  for (const quantas of [3, 5, 8]) {
    const suficiencia = resolveRadarInvestigationSufficiency({
      hasSnapshot: true, curationConfirmed: true,
      selected: quantas, analyzed: quantas, failed: 0, comparable: quantas,
    });
    assert.equal(suficiencia.selected, quantas, `${quantas} selecionadas continuam ${quantas}`);
  }

  /*
   * Oito incluídas com apenas quatro elegíveis para benchmark: os dois números
   * coexistem. A seleção humana não encolhe porque metade não é comparável.
   */
  const misto = resolveRadarInvestigationSufficiency({
    hasSnapshot: true, curationConfirmed: true, selected: 8, analyzed: 8, failed: 0, comparable: 4,
  });
  assert.equal(misto.selected, 8);
  assert.equal(misto.comparable, 4);
  assert.equal(misto.level, "SUFFICIENT");
});

/* -------------------------------- F e J ---------------------------------- */

test("F · 7 selecionadas, 4 analisadas, 3 falhas e 0 comparáveis é INSUFFICIENT", () => {
  const suficiencia = resolveRadarInvestigationSufficiency({
    hasSnapshot: true, curationConfirmed: true, selected: 7, analyzed: 4, failed: 3, comparable: 0,
  });
  assert.equal(suficiencia.level, "INSUFFICIENT");
  assert.equal(radarSufficiencyLabel(suficiencia.level), "Análise insuficiente");
  assert.equal(suficiencia.canBuildCompetitiveModel, false);
  assert.equal(suficiencia.canDeriveCompetitiveNeeds, false);
  assert.equal(suficiencia.canApprove, false);
  assert.match(suficiencia.reasons[0], /amostra editorial comparável/i);
  assert.ok(suficiencia.reasons.some(item => /4 página\(s\) foram analisadas/.test(item)));
  assert.ok(suficiencia.reasons.some(item => /3 página\(s\).*não puderam ser extraídas/.test(item)));
});

test("J · sem snapshot ou sem seleção a investigação está bloqueada, não insuficiente", () => {
  assert.equal(resolveRadarInvestigationSufficiency({ hasSnapshot: false, curationConfirmed: false, selected: 0, analyzed: 0, failed: 0, comparable: 0 }).level, "BLOCKED");
  assert.equal(resolveRadarInvestigationSufficiency({ hasSnapshot: true, curationConfirmed: false, selected: 0, analyzed: 0, failed: 0, comparable: 0 }).level, "BLOCKED");
  assert.equal(resolveRadarInvestigationSufficiency({ hasSnapshot: true, curationConfirmed: true, selected: 0, analyzed: 0, failed: 0, comparable: 0 }).level, "BLOCKED");

  // Uma comparável já sustenta leitura — com a limitação declarada.
  const parcial = resolveRadarInvestigationSufficiency({ hasSnapshot: true, curationConfirmed: true, selected: 5, analyzed: 5, failed: 0, comparable: 1 });
  assert.equal(parcial.level, "PARTIAL_BUT_USABLE");
  assert.equal(parcial.canApprove, true);
  assert.match(parcial.reasons[0], /não o mercado/);
  assert.equal(RADAR_MIN_COMPARABLE_SUFFICIENT, 3);
});

/* ------------------------------ G, H e I --------------------------------- */

const paginaComercial = (position: number) => RadarExtractionPageSchema.parse({
  id: `page-${position}`, url: `https://loja-${position}.com.br/produto`, status: "success",
  fetchedAt: "2026-09-07T17:00:00.000Z", title: `Produto ${position}`, metaDescription: "", canonical: null,
  h1: ["Produto"], h2: ["Buscar produtos"], h3: [], wordCount: 120, internalLinkCount: 40, externalLinkCount: 0,
  listCount: 0, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: false, author: null, structuredDataTypes: ["Product"], recurringTerms: [], boldCount: 0,
  italicCount: 0, error: "", headingOutline: [{ level: 2, text: "Buscar produtos" }],
});

test("G e H · com zero comparáveis não existe modelo final nem necessidade competitiva", () => {
  const pages = [1, 2, 3, 4].map(paginaComercial);
  const model = buildRadarCompetitiveModel({ pages, query: "cremes skin care", observedIntent: "informacional", principal: "cremes skin care" });

  assert.equal(model.sample.analyzed, 4);
  assert.equal(model.sample.comparable, 0, "vitrine de produto não forma amostra editorial");
  assert.deepEqual(model.gaps, [], "sem amostra não há lacuna competitiva");
  assert.deepEqual(model.opportunities, [], "sem lacuna não há oportunidade");
  assert.ok(model.structure.every(item => item.kind === "absent"), "não há faixa nem mediana a observar");

  const resumo = buildRadarSerpSynthesis(model);
  assert.deepEqual(resumo.recurringTopics, []);
  assert.deepEqual(resumo.underCovered, []);
  assert.deepEqual(resumo.opportunities, []);
});

test("H · o relatório não deriva necessidade competitiva sem amostra comparável", () => {
  const fonte = readFileSync(new URL("../lib/radar/competitive-report.ts", import.meta.url), "utf8");
  assert.match(fonte, /const amostraSustentaLeitura = comparable\.length > 0;/);
  assert.match(fonte, /amostraSustentaLeitura && observedTopics\.length/);
  assert.match(fonte, /amostraSustentaLeitura && payload\.benchmark/);
  assert.match(fonte, /nenhuma necessidade competitiva foi derivada/);
});

test("I · as limitações continuam preservadas e visíveis", () => {
  const model = buildRadarCompetitiveModel({ pages: [1, 2].map(paginaComercial), query: "cremes skin care" });
  assert.ok(model.limitations.some(item => /Nenhuma página comparável/i.test(item)));

  const resumo = buildRadarSerpSynthesis(model);
  assert.ok(resumo.limitations.length > 0, "a leitura declara o que não pôde afirmar");
});

/* -------------------------------- K e L ---------------------------------- */

test("K · SERP dominada por produto aparece como descoberta, sem inventar artigo editorial", () => {
  const painel = readFileSync(new URL("../modules/radar/radar-r3-serp-panel.tsx", import.meta.url), "utf8");
  assert.match(painel, /data-testid="radar-insufficient-sample"/);
  assert.match(painel, /Uma consulta dominada por produto ou vídeo é uma descoberta sobre a consulta/);
  // Intenção e formato deixam de compartilhar rótulo: cada um diz de onde vem.
  assert.match(painel, /Intenção observada na SERP/);
  assert.match(painel, /Formatos observados na SERP/);
  assert.match(painel, /radarSufficiencyLabel\(suficiencia\.level\)/);
});

test("L · a aprovação recusa investigação insuficiente sem apagar histórico", () => {
  const gate = readFileSync(new URL("../lib/radar/report-approval.ts", import.meta.url), "utf8");
  assert.match(gate, /resolveRadarInvestigationSufficiency/);
  assert.match(gate, /Não há amostra competitiva suficiente para concluir esta investigação/);
  // O portão recusa; ele não escreve, não apaga e não toca em versão anterior.
  const inicio = gate.indexOf("export function radarReportApprovalIssues");
  const corpo = gate.slice(inicio, gate.indexOf("/* ------------------------------ a aprovação"));
  for (const proibido of ["delete", "createRadarAnalysisSuccessor", "persist"]) {
    assert.equal(corpo.includes(proibido), false, `o portão não pode ${proibido}`);
  }
});

test("as falhas de extração são dado por página, não um número solto", () => {
  const painel = readFileSync(new URL("../modules/radar/radar-r3-serp-panel.tsx", import.meta.url), "utf8");
  assert.match(painel, /data-testid="radar-extraction-failures"/);
  assert.match(painel, /Ver detalhe por página/);
  assert.match(painel, /item\.code/);

  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(page, /extractionFailures: falhas/);
  assert.match(page, /code: registro\.error\.code \|\| "fetch_failed"/);
});
