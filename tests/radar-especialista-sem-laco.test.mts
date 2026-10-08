import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { radarArticleDataUpdate, radarExpertEvidenceChanged, radarSameData } from "../lib/radar/expert-evidence-change.ts";

/*
 * ====== 2026-10-08 · A ÁREA ESPECIALISTA ABERTA NÃO PRENDE A TELA ======
 *
 * O dono: "o selector e o scroll estão muito lentos … parece um computador
 * dos anos 80". Medido na bancada do scratchpad: com a área Especialista
 * aberta num artigo não finalizado, 6 s parado = 6 a 11 renders completos do
 * RadarPage e ~98% da thread ocupada. O laço:
 *
 *   render → `requirements` chega como array novo → o efeito do painel avisa
 *   `onExpertEvidenceChange` → o Radar grava três mapas com objetos novos e
 *   o MESMO conteúdo → render → …
 *
 * Aqui: a regra (aviso igual não vira estado novo; aviso diferente vira) e a
 * fiação nas duas telas que hospedam o painel. O laço de verdade, com o
 * painel real montado, está em `radar-especialista-sem-laco-dom.test.mts`.
 */

const semComentarios = (texto: string) => texto.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
const fonte = async (caminho: string) => semComentarios(await readFile(new URL(caminho, import.meta.url), "utf8"));

const contadores = () => ({ prepared: 2, sent: 1, waiting: 1, responded: 0, accepted: 0, drafts: 0 });
const evidencia = () => [{ id: "c1", contributionId: "c1", summary: "Síntese do parecer.", reviewed: false, decision: "pending", classification: null, need: "req-1", sourceType: "TEXT" }];
const canonica = () => [{ id: "ev-1", contributionId: "c1", expertId: "e1", summary: "Síntese.", decision: "accepted" }];
const resumo = () => ({ contributionCount: 1, pendingCount: 1, blockedEvidenceCount: 0, remote: true, articleDnaVersionId: "dna-v1", counters: contadores() });
const aviso = () => ({ articleId: "artigo-1", evidence: evidencia(), summary: { ...resumo(), canonicalEvidence: canonica() } });

test("dado puro: conteúdo igual é igual; qualquer diferença real é diferença", () => {
  assert.equal(radarSameData(aviso(), aviso()), true, "dois avisos montados do zero, mesmo conteúdo");
  assert.equal(radarSameData([], []), true);
  assert.equal(radarSameData({}, {}), true);
  assert.equal(radarSameData(Number.NaN, Number.NaN), true);
  const casos: Array<[string, unknown, unknown]> = [
    ["número", { a: 1 }, { a: 2 }],
    ["texto", { a: "x" }, { a: "y" }],
    ["booleano", { a: true }, { a: false }],
    ["null × objeto", { a: null }, { a: {} }],
    ["undefined × ausente", { a: undefined }, {}],
    ["chave a mais", { a: 1 }, { a: 1, b: 1 }],
    ["chave trocada", { a: 1 }, { b: 1 }],
    ["ordem da lista", [1, 2], [2, 1]],
    ["tamanho da lista", [1], [1, 1]],
    ["lista × objeto", [], {}],
    ["profundo", { a: { b: [{ c: 1 }] } }, { a: { b: [{ c: 2 }] } }],
    ["Date só é igual a si mesmo", new Date(0), new Date(0)],
    ["Map só é igual a si mesmo", new Map(), new Map()],
  ];
  for (const [nome, esquerda, direita] of casos) {
    assert.equal(radarSameData(esquerda, direita), false, nome);
  }
  const data = new Date(0);
  assert.equal(radarSameData(data, data), true, "a mesma instância continua igual");
});

test("o redutor devolve O MESMO mapa quando o artigo chega com o mesmo conteúdo", () => {
  const inicial: Record<string, ReturnType<typeof resumo>> = {};
  const primeiro = radarArticleDataUpdate(inicial, "artigo-1", resumo());
  assert.notEqual(primeiro, inicial, "o primeiro aviso sempre grava");
  assert.deepEqual(primeiro, { "artigo-1": resumo() });
  const repetido = radarArticleDataUpdate(primeiro, "artigo-1", resumo());
  assert.equal(repetido, primeiro, "mesmo conteúdo, mesma referência: o React descarta o render");

  /* Cada campo do resumo, sozinho, é mudança de verdade. */
  const mudancas: Array<[string, ReturnType<typeof resumo>]> = [
    ["contributionCount", { ...resumo(), contributionCount: 2 }],
    ["pendingCount", { ...resumo(), pendingCount: 0 }],
    ["blockedEvidenceCount", { ...resumo(), blockedEvidenceCount: 1 }],
    ["articleDnaVersionId", { ...resumo(), articleDnaVersionId: "dna-v2" }],
    ["counters.sent", { ...resumo(), counters: { ...contadores(), sent: 2 } }],
    ["counters.accepted", { ...resumo(), counters: { ...contadores(), accepted: 1 } }],
  ];
  for (const [campo, novo] of mudancas) {
    const proximo: Record<string, ReturnType<typeof resumo>> = radarArticleDataUpdate(primeiro, "artigo-1", novo);
    assert.notEqual(proximo, primeiro, `${campo} mudou e o mapa não`);
    assert.deepEqual(proximo["artigo-1"], novo, campo);
  }

  /* Outro artigo é sempre entrada nova, e o artigo anterior fica intacto. */
  const outro = radarArticleDataUpdate(primeiro, "artigo-2", resumo());
  assert.notEqual(outro, primeiro);
  assert.equal(outro["artigo-1"], primeiro["artigo-1"]);
  /* Lista vazia contra ausência: o primeiro aviso de um artigo sem contribuição também grava. */
  const vazio: Record<string, unknown[]> = {};
  assert.notEqual(radarArticleDataUpdate(vazio, "artigo-1", []), vazio);
});

test("aviso do painel: o primeiro conta; o repetido não; cada campo diferente conta", () => {
  assert.equal(radarExpertEvidenceChanged(null, aviso()), true);
  assert.equal(radarExpertEvidenceChanged(undefined, aviso()), true);
  assert.equal(radarExpertEvidenceChanged(aviso(), aviso()), false);
  const base = aviso();
  const variantes: Array<[string, ReturnType<typeof aviso>]> = [
    ["artigo", { ...base, articleId: "artigo-2" }],
    ["decisão da evidência", { ...base, evidence: [{ ...evidencia()[0], decision: "accepted" }] }],
    ["evidência a mais", { ...base, evidence: [...evidencia(), { ...evidencia()[0], id: "c2", contributionId: "c2" }] }],
    ["evidência canônica", { ...base, summary: { ...base.summary, canonicalEvidence: [] } }],
    ["contador", { ...base, summary: { ...base.summary, counters: { ...contadores(), waiting: 0 } } }],
    ["bloqueadas", { ...base, summary: { ...base.summary, blockedEvidenceCount: 1 } }],
  ];
  for (const [nome, variante] of variantes) {
    assert.equal(radarExpertEvidenceChanged(base, variante), true, nome);
  }
});

test("a tela do Radar grava os três mapas pelo redutor com bail-out", async () => {
  const pagina = await fonte("../modules/radar/radar-page.tsx");
  const inicio = pagina.indexOf("const handleExpertEvidenceChange = useCallback(");
  assert.ok(inicio > 0, "handleExpertEvidenceChange sumiu");
  const corpo = pagina.slice(inicio, pagina.indexOf("}, []);", inicio));
  for (const setter of ["setExpertEvidenceByArticle", "setCanonicalExpertEvidenceByArticle", "setExpertContributionSummaryByArticle"]) {
    assert.match(corpo, new RegExp(`${setter}\\(current => radarArticleDataUpdate\\(current, articleId, `), `${setter} voltou a gravar objeto novo a cada aviso`);
  }
  assert.doesNotMatch(corpo, /\(\{ \.\.\.current, \[articleId\]/, "sobrou gravação sem comparação de conteúdo");
});

test("a rota de detalhe não recria os pontos a cada render e só relê o especialista quando o aviso muda", async () => {
  const pagina = await fonte("../modules/radar/radar-analysis-page.tsx");
  const painel = pagina.slice(pagina.indexOf("<RadarExpertBriefPanel"), pagina.indexOf("/>", pagina.indexOf("<RadarExpertBriefPanel")));
  assert.ok(painel.length > 0, "o painel do especialista saiu da rota de detalhe");
  assert.doesNotMatch(painel, /requirements=\{[^}]*\|\|\s*\[\]\s*\}/, "`|| []` inline cria um array novo por render e reabre o laço");
  assert.match(painel, /requirements=\{analysis\?\.payload\.finalizedBundle\?\.authority\.specialistRequirements \|\| SEM_PONTOS_DE_REVISAO\}/);
  assert.match(pagina, /const SEM_PONTOS_DE_REVISAO: readonly RadarFrozenSpecialistRequirement\[\] = Object\.freeze\(\[\]\);/);
  const refresh = pagina.slice(pagina.indexOf("const refreshRemoteExpertEvidence = useCallback("), pagina.indexOf("}, []);", pagina.indexOf("const refreshRemoteExpertEvidence = useCallback(")));
  assert.match(refresh, /if \(!radarExpertEvidenceChanged\(ultimoAvisoDoEspecialista\.current, aviso\)\) return;/);
  assert.match(refresh, /setRemoteExpertEvidenceReviewRevision\(current => current \+ 1\);/);
});
