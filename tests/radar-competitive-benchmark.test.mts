import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractCompetitorPage } from "../lib/radar/competitor-extractor.ts";
import { buildRadarCompetitiveBenchmark, radarMeasureLabel, radarPresenceLabel } from "../lib/radar/competitive-benchmark.ts";
import { RadarExtractionPageSchema, type RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/* ------------------------- fixtures HTML locais -------------------------- */

const IMG = "<img src=\"x.png\">";

const artigo = (opcoes: { h2: string[]; h3: string[]; paragrafos: string[]; strong: string[]; listas: number; imagens: number }) => `<html><body>
<h1>Mascara de skincare caseira</h1>
${opcoes.h2.map((texto, index) => `<h2>${texto}</h2>${opcoes.h3[index] ? `<h3>${opcoes.h3[index]}</h3>` : ""}`).join("")}
${opcoes.paragrafos.map(texto => `<p>${texto}</p>`).join("")}
${opcoes.strong.map(texto => `<strong>${texto}</strong>`).join("")}
${"<ul><li>item um aqui</li></ul>".repeat(opcoes.listas)}
${IMG.repeat(opcoes.imagens)}
</body></html>`;

const respostaHtml = (html: string) => ({
  ok: true, status: 200, url: "https://exemplo.com/artigo",
  headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
  text: async () => html,
  arrayBuffer: async () => new TextEncoder().encode(html).buffer,
}) as unknown as Response;

async function extrair(html: string, keyword?: string) {
  return extractCompetitorPage("https://exemplo.com/artigo", {
    fetchImpl: (async () => respostaHtml(html)) as unknown as typeof fetch,
    lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never,
    keyword,
    now: "2026-09-07T10:00:00.000Z",
  });
}

/* ------------------------- extração por página --------------------------- */

test("a extração observa parágrafos, abertura, fechamento, hierarquia e destaques", async () => {
  const page = await extrair(artigo({
    h2: ["O que é", "Como aplicar", "Cuidados"],
    h3: ["Passo a passo"],
    paragrafos: [
      "A mascara de skincare caseira responde direto a quem procura o tema hoje.",
      "Este bloco intermediario explica o preparo com mais detalhe e contexto.",
      "Para fechar, confira as recomendacoes finais e saiba mais no nosso guia.",
    ],
    strong: ["pele oleosa", "argila verde"],
    listas: 2, imagens: 3,
  }), "mascara de skincare");

  assert.equal(page.paragraphCount, 3);
  assert.equal(page.paragraphWordCounts.length, 3);
  assert.ok(page.introWordCount > 0);
  assert.match(page.introText, /responde direto/);
  assert.equal(page.hasClosing, true);
  assert.match(page.closingText, /recomendacoes finais/);

  // A hierarquia preserva a ordem do documento, não a contagem por nível.
  assert.deepEqual(page.headingOutline.map(item => item.level), [1, 2, 3, 2, 2]);
  assert.equal(page.headingOutline[0].text, "Mascara de skincare caseira");

  assert.deepEqual(page.emphasizedTerms, ["pele oleosa", "argila verde"]);

  assert.ok(page.keywordPlacement);
  assert.equal(page.keywordPlacement!.h1, true);
  assert.equal(page.keywordPlacement!.intro, true);
  assert.equal(page.keywordPlacement!.body, true);
  assert.ok(page.keywordPlacement!.occurrences >= 2);
});

test("sem keyword informada, a presença fica declarada como ausente de dado", async () => {
  const page = await extrair(artigo({ h2: ["Um"], h3: [], paragrafos: ["Texto suficiente para contar como paragrafo aqui."], strong: [], listas: 0, imagens: 0 }));
  assert.equal(page.keywordPlacement, null);
});

/* ----------------------------- benchmark --------------------------------- */

const paginaComparavel = (overrides: Partial<RadarExtractionPage>): RadarExtractionPage => RadarExtractionPageSchema.parse({
  id: "p", url: "https://exemplo.com/a", status: "success", fetchedAt: "2026-09-07T10:00:00.000Z",
  title: "Titulo", metaDescription: "", canonical: null, h1: ["H1"], h2: [], h3: [], wordCount: 1000,
  internalLinkCount: 3, externalLinkCount: 1, listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2,
  blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null, structuredDataTypes: ["Article"],
  recurringTerms: [], boldCount: 4, italicCount: 0, error: null, ...overrides,
});

test("uma página comparável vira valor observado, nunca média de mercado", () => {
  const benchmark = buildRadarCompetitiveBenchmark([paginaComparavel({ id: "p1", wordCount: 1800, h2: ["a", "b"] })]);
  assert.equal(benchmark.sample.comparable, 1);
  assert.equal(benchmark.structure.words.kind, "single_page");
  assert.equal(benchmark.structure.words.observed, 1800);
  assert.equal(benchmark.structure.words.median, null);
  assert.match(radarMeasureLabel(benchmark.structure.words), /Valor observado: 1800/);
  assert.ok(benchmark.limitations.some(item => /não faixa de mercado/.test(item)));
});

test("múltiplas páginas produzem min, mediana, máximo e média", () => {
  const benchmark = buildRadarCompetitiveBenchmark([
    paginaComparavel({ id: "p1", wordCount: 1000, h2: ["a"] }),
    paginaComparavel({ id: "p2", wordCount: 2000, h2: ["a", "b"] }),
    paginaComparavel({ id: "p3", wordCount: 3000, h2: ["a", "b", "c"] }),
  ]);
  const words = benchmark.structure.words;
  assert.equal(words.kind, "distribution");
  assert.equal(words.min, 1000);
  assert.equal(words.median, 2000);
  assert.equal(words.max, 3000);
  assert.equal(words.average, 2000);
  assert.equal(words.sampleSize, 3);
  assert.equal(benchmark.structure.h2.median, 2);
  assert.match(radarMeasureLabel(words), /Mediana 2000/);
});

test("páginas não comparáveis ficam fora das métricas e continuam visíveis", () => {
  const benchmark = buildRadarCompetitiveBenchmark([
    paginaComparavel({ id: "p1", wordCount: 2000 }),
    paginaComparavel({ id: "p2", wordCount: 2200 }),
    paginaComparavel({ id: "bloqueada", url: "https://exemplo.com/x", status: "blocked", wordCount: 99999 }),
  ]);
  assert.equal(benchmark.sample.analyzed, 3);
  assert.equal(benchmark.sample.comparable, 2);
  assert.equal(benchmark.structure.words.max, 2200, "a página bloqueada não pode contaminar a faixa");
  assert.equal(benchmark.sample.nonComparable.length, 1);
});

test("padrões de heading e destaques são proporção observada, não obrigação", () => {
  const outline = (topicos: string[]) => topicos.map(text => ({ level: 2 as const, text }));
  const benchmark = buildRadarCompetitiveBenchmark([
    paginaComparavel({ id: "p1", headingOutline: outline(["O que é", "Como aplicar"]), emphasizedTerms: ["pele oleosa"] }),
    paginaComparavel({ id: "p2", headingOutline: outline(["O que é", "Cuidados"]), emphasizedTerms: ["pele oleosa"] }),
    paginaComparavel({ id: "p3", headingOutline: outline(["O que é"]), emphasizedTerms: [] }),
  ]);
  const recorrente = benchmark.headingPatterns.find(item => item.text === "O que é");
  assert.ok(recorrente);
  assert.equal(recorrente!.pages, 3);
  assert.equal(recorrente!.sampleSize, 3);
  assert.equal(recorrente!.asH2, 3);
  assert.equal(benchmark.emphasizedTerms[0].term, "pele oleosa");
  assert.equal(benchmark.emphasizedTerms[0].pages, 2);
  assert.equal(radarPresenceLabel({ label: "x", present: 2, sampleSize: 3 }), "2/3");
});

test("presença da principal é contada por localização, sem virar densidade", () => {
  const placement = (patch: Record<string, unknown>) => ({ keyword: "mascara de skincare", title: false, h1: false, h2: false, h3: false, intro: false, body: false, occurrences: 0, ...patch });
  const benchmark = buildRadarCompetitiveBenchmark([
    paginaComparavel({ id: "p1", keywordPlacement: placement({ title: true, h1: true, intro: true, body: true, occurrences: 6 }) as never }),
    paginaComparavel({ id: "p2", keywordPlacement: placement({ title: true, h1: true, body: true, occurrences: 4 }) as never }),
  ]);
  assert.ok(benchmark.keyword);
  const title = benchmark.keyword!.placements.find(item => item.label === "Title");
  assert.equal(title!.present, 2);
  assert.equal(title!.sampleSize, 2);
  const intro = benchmark.keyword!.placements.find(item => item.label === "Abertura");
  assert.equal(intro!.present, 1);
  assert.equal(benchmark.keyword!.occurrences.median, 5);
  assert.match(benchmark.keyword!.occurrences.label, /Ocorrências observadas/);
});

/* ---------------------------- fronteira ---------------------------------- */

test("o Radar não emite outline final, meta de H2/H3, palavras ou densidade", () => {
  const proibidos = [/finalOutline/, /requiredH2Count/, /requiredH3Count/, /requiredWordCount/, /requiredKeywordDensity/, /densidade recomendada/i];
  for (const arquivo of [
    "lib/radar/competitive-benchmark.ts",
    "lib/radar/competitor-extractor.ts",
    "lib/radar/evidence-package.ts",
    "lib/radar/planner-handoff.ts",
    "lib/radar/competitive-report.ts",
  ]) {
    const fonte = readFileSync(arquivo, "utf8");
    for (const proibido of proibidos) {
      assert.equal(proibido.test(fonte), false, `${arquivo} não pode produzir ${proibido}`);
    }
  }
  const benchmark = buildRadarCompetitiveBenchmark([paginaComparavel({ id: "p1" }), paginaComparavel({ id: "p2" })]);
  const serializado = JSON.stringify(benchmark);
  for (const proibido of ["finalOutline", "requiredH2Count", "requiredWordCount", "requiredKeywordDensity"]) {
    assert.equal(serializado.includes(proibido), false, `o pacote não pode conter ${proibido}`);
  }
});

test("a extração só acontece por ação explícita e a keyword viaja com ela", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const chamadas = workbench.match(/radar-analysis\/extract/g) || [];
  assert.equal(chamadas.length, 1, "a extração tem um único ponto de chamada");
  // A principal viaja com o pedido, e só quando está hidratada de verdade.
  assert.match(workbench, /radarPrincipalHydrated\(data\.r3\.keyword\)/);
  assert.match(workbench, /keyword: principal/);
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  // Os rótulos migraram para o domínio; o painel continua exigindo um clique.
  const estado = readFileSync("lib/radar/investigation-state.ts", "utf8");
  assert.match(estado, /Analisar páginas selecionadas/);
  assert.match(estado, /Analisar páginas pendentes/);
  assert.match(painel, /onRun={runTabAction}/);
  assert.equal(/useEffect\([^)]*onAnalyzeSelected/.test(painel), false, "nenhum efeito dispara a extração");
});

test("a próxima ação nomeia as páginas selecionadas, não um conceito novo", () => {
  const fonte = readFileSync("lib/radar/r3-workbench.ts", "utf8");
  assert.match(fonte, /Analise as \$\{input\.analysisQueue\} página\(s\) selecionada\(s\)/);
  assert.doesNotMatch(fonte, /análise competitiva/i);
});
