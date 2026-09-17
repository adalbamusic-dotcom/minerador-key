import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import {
  buildRadarAmazonObservedView,
  radarAmazonPlacementLine,
} from "../lib/radar/amazon-observed.ts";
import {
  RadarResearchPackageRecordSchema,
  radarAmazonPrimaryCounts,
  radarPackageHeadline,
  radarPackageNeedsSupportRetry,
  radarPackageStatus,
} from "../lib/radar/research-package.ts";
import { radarResearchProfileStateOfAnalysis } from "../lib/radar/research-profile-state.ts";

/*
 * ===== AMAZON_SEARCH_1.1 · A TELA DA AMAZON, O APOIO E O PACOTE =====
 *
 * A suíte roda contra o payload REAL do AMAZON_SEARCH_0 — 55 itens de página,
 * 51 produtos, 2 slots pagos do MESMO ASIN. É essa amostra que torna os testes
 * de contagem falseáveis: uma implementação que confunda produto com posição
 * passa em fixture inventada e falha aqui.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const payloadReal = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
);

const fonteDoPainel = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
const fonteDoObservado = await readFile(new URL("../lib/radar/amazon-observed.ts", import.meta.url), "utf8");
const fonteDaWorkbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
const fonteDaPagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const fonteDoEstado = await readFile(new URL("../lib/radar/research-profile-state.ts", import.meta.url), "utf8");

const corridaReal = () => {
  const normalizada = normalizeDataForSeoAmazonResponse(payloadReal, "amzq:1");
  const universo = buildRadarAmazonUniverse(normalizada.results);
  return buildRadarAmazonSearchRun({
    runId: "run-amz-1",
    runVersion: 1,
    startedAt: "2026-09-15T12:00:00.000Z",
    startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({
      articleId: "artigo-1",
      articleDnaVersionId: "dna-1",
      queryIds: ["amzq:1"],
    }),
    provenance: {
      provider: "dataforseo",
      endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z",
      languageCode: "pt_BR",
      depth: 20,
      queriesRequested: 1,
      queriesSucceeded: 1,
      queriesFailed: 0,
    },
    queries: [{ queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true }],
    results: normalizada.results,
    universe: universo,
    relatedSearches: normalizada.relatedSearches,
  });
};

const pacoteDe = (opcoes: {
  primaryStatus?: "COLLECTED" | "FAILED" | "PENDING";
  supportStatus?: "COLLECTED" | "FAILED" | "SKIPPED" | "PENDING" | null;
} = {}) => {
  const run = corridaReal();
  const contagem = radarAmazonPrimaryCounts({
    universe: run.universe,
    queryCount: 1,
    relatedSearchCount: run.relatedSearches.length,
  });
  const primaryStatus = opcoes.primaryStatus || "COLLECTED";
  const supportStatus = opcoes.supportStatus === undefined ? "COLLECTED" : opcoes.supportStatus;

  return RadarResearchPackageRecordSchema.parse({
    profile: "AMAZON",
    packageRunId: run.runId,
    status: radarPackageStatus({ primaryStatus, supportPlanned: supportStatus !== null, supportStatus }),
    startedAt: run.startedAt,
    completedAt: "2026-09-15T12:00:09.000Z",
    primaryResearch: { source: "AMAZON_SERP", status: primaryStatus, runId: run.runId, ...contagem, failureReason: primaryStatus === "FAILED" ? "A Amazon não respondeu." : null },
    supportResearch: supportStatus === null ? null : {
      source: "WEB_SERP",
      role: "SEO_COMMERCIAL_SUPPORT",
      status: supportStatus,
      snapshotId: supportStatus === "COLLECTED" ? "snap-1" : null,
      keyword: "protetor solar facial",
      collectedAt: supportStatus === "COLLECTED" ? "2026-09-15T12:00:08.000Z" : null,
      failureReason: supportStatus === "COLLECTED" ? null : "A SERP do Google não respondeu.",
    },
  });
};

/* ================================ A ================================ */

test("A · a amostra mostra PRODUTOS únicos, não itens de página", () => {
  const run = corridaReal();
  const leitura = buildRadarAmazonObservedView(run);
  assert.ok(leitura);

  /*
   * A COLETA REAL: 55 itens de página, 51 produtos.
   *
   * Uma amostra montada sobre `results` mostraria 55 cards e quatro deles
   * seriam repetição — quem lesse contaria quatro concorrentes que não existem.
   */
  assert.equal(run.results.length, 55);
  assert.equal(leitura.sample.products.length, 51);
  assert.equal(new Set(leitura.sample.products.map(item => item.asin)).size, 51);
  assert.match(leitura.sample.label, /51 produto\(s\)/);
});

/* ================================ B ================================ */

test("B · dois slots pagos do mesmo ASIN viram UM card com '2 posições patrocinadas'", () => {
  const run = corridaReal();
  const pagos = run.results.filter(item => item.placement === "SPONSORED");
  assert.equal(pagos.length, 2, "a coleta real tem dois slots pagos");
  assert.equal(new Set(pagos.map(item => item.asin)).size, 1, "e eles são o MESMO produto");

  const leitura = buildRadarAmazonObservedView(run)!;
  const cards = leitura.sample.products.filter(item => item.asin === pagos[0].asin);
  assert.equal(cards.length, 1, "§11 · um produto, um card");
  assert.match(cards[0].placementLine, /2 posições patrocinadas/);
  /* E ele também ranqueia sozinho — esconder isso apagaria o sinal comercial. */
  assert.match(cards[0].placementLine, /orgânico/);
});

/* ================================ C ================================ */

test("C · a linha de posição não inventa ranking quando o provider não deu", () => {
  const produto = buildRadarAmazonUniverse([{
    asin: "X1", title: "Produto", url: "https://amazon.com.br/x1", placement: "ORGANIC",
    rankAbsolute: null, rankGroup: null, queryId: "q1",
  } as never])[0];

  assert.equal(radarAmazonPlacementLine(produto), "orgânico");
  assert.equal(/posição/.test(radarAmazonPlacementLine(produto)), false);
});

/* ================================ D ================================ */

test("D · os quatro cards são observados e nenhum recomenda", () => {
  const leitura = buildRadarAmazonObservedView(corridaReal())!;
  assert.deepEqual(
    leitura.cards.map(card => card.id),
    ["COMPETITIVE_MODEL", "PRICE_AND_OFFER", "REPUTATION_AND_PURCHASE", "COMMERCIAL_AND_SEO"],
  );

  /*
   * §9 · SÍNTESE OBSERVADA, NÃO BLUEPRINT.
   *
   * Um verbo de recomendação aqui faria o gate 1.1 entregar, com a mesma cara
   * de fato, o palpite que só o gate 2 sabe separar do observado.
   */
  const texto = leitura.cards.flatMap(card => [...card.lines, card.empty || ""]).join(" ");
  assert.equal(
    /\b(recomend|sugerimos|você deve|escreva|posicione|aposte|priorize)/i.test(texto),
    false,
    `nenhum card recomenda: ${texto}`,
  );
});

/* ================================ E ================================ */

test("E · o card de modelo competitivo distingue produto patrocinado de posição paga", () => {
  const leitura = buildRadarAmazonObservedView(corridaReal())!;
  const card = leitura.cards.find(item => item.id === "COMPETITIVE_MODEL")!;
  const texto = card.lines.join(" ");

  assert.match(texto, /51 produto\(s\) distinto\(s\)/);
  /* 1 produto patrocinado ocupando 2 posições — a frase tem de dizer as duas. */
  assert.match(texto, /1 produto\(s\) patrocinado\(s\), ocupando 2 posições pagas/);
  assert.match(texto, /1 aparece\(m\) nas duas formas/);
  assert.equal(/2 produto\(s\) patrocinado/.test(texto), false, "nunca '2 patrocinados' sobre esta busca");
});

/* ================================ F ================================ */

test("F · preço usa mediana e declara quantos produtos exibem preço", () => {
  const leitura = buildRadarAmazonObservedView(corridaReal())!;
  const card = leitura.cards.find(item => item.id === "PRICE_AND_OFFER")!;
  const texto = card.lines.join(" ");

  assert.match(texto, /Mediana:/);
  assert.match(texto, /Faixa observada:/);
  assert.match(texto, /de 51 produto\(s\) exibem preço/);
  /* A média esconderia o produto profissional que puxa a faixa. */
  assert.equal(/média/i.test(texto), false);
});

/* ================================ G ================================ */

test("G · 'Buscas relacionadas' — nunca 'Categorias'", () => {
  const leitura = buildRadarAmazonObservedView(corridaReal())!;
  assert.ok(leitura.relatedSearches.length > 0, "a coleta real trouxe buscas relacionadas");

  const painel = semComentarios(fonteDoPainel);
  assert.ok(painel.includes("Buscas relacionadas"));
  assert.equal(/Categorias?<|>Categorias?/i.test(painel), false, "§12 · a loja não declarou taxonomia nenhuma");

  const observado = semComentarios(fonteDoObservado);
  assert.match(observado, /busca\(s\) relacionada\(s\)/);
});

/* ================================ H ================================ */

test("H · nenhuma heurística de marca — §13", () => {
  for (const [nome, fonte] of [["observado", fonteDoObservado], ["painel", fonteDoPainel]] as const) {
    const limpa = semComentarios(fonte);
    /*
     * Extrair "a primeira palavra do título" como fabricante produziria um
     * concorrente inventado dentro de um relatório que a pessoa vai assinar.
     */
    assert.equal(/\bbrand\b|\bmarcaDoTitulo\b|\bfabricante\b|title\.split\(/i.test(limpa), false, `${nome} infere marca`);
  }
});

/* ================================ I ================================ */

test("I · o pacote é a autoridade da projeção — contagens e estado", () => {
  const pacote = pacoteDe();
  const projecao = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: corridaReal(), researchPackage: pacote },
    profile: "AMAZON",
  });

  assert.equal(projecao.state, "READY");
  /* 51 produtos — e não 55 itens de página nem 0 por ler o campo errado. */
  assert.equal(projecao.counts.videos, 51);
  assert.equal(projecao.counts.queries, 1);
  assert.match(projecao.headline, /produto\(s\)/, "§7 · a unidade da Amazon é produto");
  assert.equal(/vídeo/.test(projecao.headline), false);

  /*
   * ====== A LEITURA É DO PACOTE, NÃO DA CORRIDA AO LADO ======
   *
   * Com a corrida presente as duas contagens coincidem — o universo já vem
   * deduplicado por ASIN — e um recálculo passaria despercebido. O caso que
   * separa uma leitura da outra é o pacote SEM a corrida ao lado: é ele que
   * prova de onde o número sai.
   */
  const soPacote = radarResearchProfileStateOfAnalysis({
    payload: { researchPackage: pacote },
    profile: "AMAZON",
  });
  assert.equal(soPacote.state, "READY");
  assert.equal(soPacote.counts.videos, 51, "o pacote responde sozinho");
  assert.equal(soPacote.counts.queries, 1);
});

/* ================================ J ================================ */

test("J · apoio falho preserva a pesquisa paga e pede só a retomada do apoio", () => {
  const pacote = pacoteDe({ supportStatus: "FAILED" });
  assert.equal(pacote.status, "PARTIAL_SUPPORT_FAILED");
  assert.equal(radarPackageNeedsSupportRetry(pacote), true);

  const projecao = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: corridaReal(), researchPackage: pacote },
    profile: "AMAZON",
  });

  assert.equal(projecao.state, "PARTIAL_SUPPORT_FAILED");
  assert.equal(projecao.nextAction.id, "RETRY_SUPPORT");
  assert.equal(projecao.nextAction.label, "Tentar novamente apoio Google");
  /* A coleta paga continua contada: jogá-la fora cobraria de novo o que já foi pago. */
  assert.equal(projecao.counts.videos, 51);
});

/* ================================ K ================================ */

test("K · §19 · pronta oferece ANALISAR; falha oferece repetir a pesquisa Amazon", () => {
  const pronta = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: corridaReal(), researchPackage: pacoteDe() },
    profile: "AMAZON",
  });
  assert.equal(pronta.nextAction.id, "ANALYZE_RESEARCH");
  assert.equal(pronta.nextAction.label, "Analisar pesquisa Amazon");

  const falhou = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: corridaReal(), researchPackage: pacoteDe({ primaryStatus: "FAILED" }) },
    profile: "AMAZON",
  });
  assert.equal(falhou.state, "FAILED");
  assert.equal(falhou.nextAction.label, "Tentar novamente Pesquisa Amazon");

  /*
   * E o START some quando a pesquisa está pronta: oferecê-lo sobre um pacote
   * READY convidaria a pagar de novo pelo que já está coletado.
   */
  const painel = semComentarios(fonteDoPainel);
  assert.match(painel, /projecao\.canStart && projecao\.state !== "READY"/);
});

/* ================================ L ================================ */

test("L · UM START visível, e o painel não chama provider nem grava", () => {
  const painel = semComentarios(fonteDoPainel);
  assert.equal((painel.match(/data-testid="radar-amazon-start"/g) || []).length, 1, "§1 · um botão só");
  assert.equal(/\bfetch\(/.test(painel), false, "o painel não fala com a rede");
  assert.equal(/appendRadarAnalysis|createRadarAnalysisSuccessor|supabase/i.test(painel), false, "nem com o banco");

  /* E a página tem um caminho só até a rota de coleta. */
  const pagina = semComentarios(fonteDaPagina);
  assert.equal(
    (pagina.match(/action: "collect",\s*\n\s*brandId: target\.brandId,\s*\n\s*articleId: target\.articleId,\s*\n\s*articleDnaVersionId: target\.articleDnaVersionId,\s*\n\s*queries: plano\.queries/g) || []).length,
    2,
    "um START de YouTube e um da Amazon — e nenhum terceiro",
  );
  /*
   * ====== A CONTA MUDOU EM AMAZON_SEARCH_2 · §23 e §25 ======
   *
   * Entraram `analyze` e `finalize`. As duas derivam e congelam o que já foi
   * pago: provider calls = 0. O que este teste protege é que TODA ida ao
   * servidor passe por esta rota — nenhuma porta lateral.
   */
  /*
   * ====== E MUDOU DE NOVO EM AMAZON_EDITORIAL_TARGET_1 · §19 ======
   *
   * Entrou `resolve-product`: uma ação HUMANA que custa uma consulta e serve
   * para a pessoa escolher de qual produto o artigo fala. Ela não abre corrida
   * e não grava análise.
   *
   * O que este teste protege segue igual — toda ida ao servidor passa por esta
   * rota, e nenhuma porta lateral nasce ao lado dela.
   */
  const idas = pagina.match(/"\/api\/editorial\/radar-amazon-search"/g) || [];
  assert.equal(idas.length, 4, "collect, retry-support, resolve-product e o caminho de analyze/finalize");
  assert.equal((pagina.match(/action: "collect"/g) || []).length, 2, "um START de YouTube e um da Amazon");
});

/* ================================ M ================================ */

test("M · §15 · o seletor não troca de perfil durante uma corrida", () => {
  const workbench = semComentarios(fonteDaWorkbench);

  /*
   * `view.state` é o pipeline do GOOGLE, e num artigo de produto ele fica
   * NOT_STARTED por construção — era daí que saía o seletor clicável no meio
   * de uma coleta paga da Amazon.
   */
  assert.match(workbench, /const emCurso = Boolean\(doPerfil && doPerfil\.state !== "NOT_STARTED"\);/);
  assert.match(workbench, /const congelado = travadoPeloPerfil \|\| emCurso \|\| view\.state !== "NOT_STARTED";/);
  assert.match(workbench, /disabled=\{busy \|\| congelado\}/);
});

/* ================================ N ================================ */

test("N · §20 · uma notificação final, e ela vem do pacote", () => {
  const pacote = pacoteDe();
  const frase = radarPackageHeadline(pacote);

  assert.match(frase, /51 produto\(s\) comparável\(is\)/);
  assert.match(frase, /1 patrocinado\(s\) em 2 posições/);
  assert.match(frase, /apoio Google coletado/);

  /*
   * A TELA NÃO MONTA UMA SEGUNDA FRASE.
   *
   * O resumo da corrida conta itens de página; o do pacote conta produtos. Duas
   * frases sobre o mesmo clique é como a tela do 1.1 aprendeu a discordar de si
   * mesma.
   */
  const pagina = semComentarios(fonteDaPagina);
  const fatia = pagina.slice(pagina.indexOf("const startAmazonSearch"), pagina.indexOf("const retryAmazonSupport"));
  /*
   * UM AVISO DE SUCESSO. As demais chamadas são recusas e erro, e nenhuma
   * delas descreve a coleta — contar todas amarraria o teste ao número de
   * guardas, que pode crescer sem que o §20 seja violado.
   */
  assert.equal(
    (fatia.match(/setNotice\(corpo\.headline/g) || []).length,
    1,
    "§20 · um aviso de sucesso, e ele é o do pacote que o servidor gravou",
  );
  assert.equal(
    /radarAmazonRunSummary|buildRadarResearchPackage|radarPackageHeadline/.test(fatia),
    false,
    "a tela não monta uma segunda frase sobre a mesma coleta",
  );

  const painel = semComentarios(fonteDoPainel);
  assert.match(painel, /radarPackageHeadline\(pacote\)/);
});

/* ============================ §10 e §16 ============================ */

test("§10 · a seção se chama 'O que a pesquisa encontrou', não blueprint", () => {
  const painel = semComentarios(fonteDoPainel);
  assert.ok(painel.includes("O que a pesquisa encontrou"));
  assert.equal(/Blueprint competitivo/i.test(painel), false, "o blueprint da Amazon é o gate 2");
  assert.ok(painel.includes("A recomendação editorial ainda não foi produzida."));
});

test("§16 · o painel não deriva estado — ele lê a projeção", () => {
  const painel = semComentarios(fonteDoPainel);
  /*
   * Recalcular estado dentro do componente é o defeito que o 1.1 fechou: quatro
   * leituras da mesma investigação, cada uma defensável isolada.
   */
  assert.equal(/radarPackageStatus\(|radarAmazonUniverseCounts\(/.test(painel), false);
  assert.match(painel, /projecao\.state/);
  assert.match(painel, /projecao\.nextAction\.label/);
});

test("§16 · a projeção lê o pacote antes dos campos soltos", () => {
  const estado = semComentarios(fonteDoEstado);
  assert.match(estado, /const pacote = objeto\(analise\.researchPackage\);/);
  assert.match(estado, /const apoio = apoioDoPacote \|\| objeto\(analise\.supportResearch\);/);

  /* Sem pacote, o perfil YouTube continua respondendo pelos campos soltos. */
  const semPacote = radarResearchProfileStateOfAnalysis({
    payload: { youtubeSearch: { state: "COLLECTED", queries: [{ executed: true }], universe: [{}, {}] }, supportResearch: { collectedAt: "2026-09-15T12:00:00.000Z" } },
    profile: "YOUTUBE",
  });
  assert.equal(semPacote.state, "READY");
  assert.equal(semPacote.counts.videos, 2);
  assert.equal(semPacote.nextAction.id, "FINALIZE", "o YouTube ainda congela — só a Amazon segue para análise");
});

test("sentinela · PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
