import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RadarLocaleError,
  assertRadarProviderLocale,
  radarProviderLocale,
} from "../lib/radar/provider-locale.ts";
import {
  DataForSeoAmazonReadError,
  DATAFORSEO_AMAZON_ENDPOINT,
  assertRadarAmazonReadable,
  buildDataForSeoAmazonRequest,
  normalizeDataForSeoAmazonResponse,
  radarAmazonIsEmptyResult,
} from "../lib/server/dataforseo-amazon-operation.ts";
import {
  buildRadarAmazonUniverse,
  radarAmazonUniverseCounts,
} from "../lib/radar/amazon-search-model.ts";
import {
  buildRadarAmazonQueryPlan,
  buildRadarAmazonSearchRun,
  buildRadarAmazonRunFingerprint,
  radarAmazonQueryId,
  radarAmazonRunSummary,
} from "../lib/radar/amazon-search-run.ts";
import { RadarCompetitiveBlueprintSchema } from "../lib/radar/competitive-blueprint.ts";
import { radarResearchProfileStateOfAnalysis } from "../lib/radar/research-profile-state.ts";

/*
 * ===== AMAZON_SEARCH_1 · O COLETOR PRIMÁRIO DA AMAZON =====
 *
 * Toda a suíte roda contra o payload REAL coletado no AMAZON_SEARCH_0.
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

/* As fontes lidas pelas auditorias de código, carregadas junto da fixture. */
const fonteDoAdapter = await readFile(new URL("../lib/server/dataforseo-amazon-operation.ts", import.meta.url), "utf8");
const fonteDoModelo = await readFile(new URL("../lib/radar/amazon-search-model.ts", import.meta.url), "utf8");

const normalizada = () => normalizeDataForSeoAmazonResponse(payloadReal, "amzq:1");
const universo = () => buildRadarAmazonUniverse(normalizada().results);

/* ================= A e B · o idioma de cada provider ================= */

test("A · `pt_BR` é o que a Merchant API aceita, e é o que o adapter envia", () => {
  assert.equal(radarProviderLocale("pt-br", "MERCHANT_AMAZON"), "pt_BR");
  assert.equal(radarProviderLocale("pt-BR", "MERCHANT_AMAZON"), "pt_BR");
  assert.equal(radarProviderLocale("pt_BR", "MERCHANT_AMAZON"), "pt_BR");

  const pedido = buildDataForSeoAmazonRequest({
    keyword: "protetor solar facial", locationCode: 2076,
    languageCode: "pt-br", depth: 20, operationRequestId: "op:1",
  });
  assert.equal(pedido.body[0].language_code, "pt_BR");
  assert.equal(pedido.body[0].location_code, 2076);
  assert.equal(pedido.body[0].depth, 20);
});

test("B · a grafia do YouTube NUNCA chega à Merchant, e vice-versa", () => {
  /*
   * As DUAS direções do mesmo engano. `pt-BR` na Amazon foi a recusa real
   * (`40501 · Invalid Field`); `pt_BR` no YouTube seria a mesma coisa do outro
   * lado, e voltaria como SERP vazia.
   */
  assert.equal(radarProviderLocale("pt-br", "YOUTUBE_SERP"), "pt-BR");
  assert.equal(radarProviderLocale("pt_BR", "YOUTUBE_SERP"), "pt-BR");
  assert.equal(radarProviderLocale("pt-BR", "GOOGLE_SERP"), "pt-br");

  assert.throws(
    () => assertRadarProviderLocale("pt-BR", "MERCHANT_AMAZON"),
    (erro: unknown) => erro instanceof RadarLocaleError && erro.code === "locale_wrong_provider_spelling",
  );
  assert.throws(
    () => assertRadarProviderLocale("pt_BR", "YOUTUBE_SERP"),
    (erro: unknown) => erro instanceof RadarLocaleError && erro.code === "locale_wrong_provider_spelling",
  );

  /*
   * SEM REGIÃO, SEM SEPARADOR — e isso não é erro. Inventar `pt_BR` a partir
   * de `pt` escolheria um país que ninguém pediu.
   */
  assert.equal(radarProviderLocale("pt", "MERCHANT_AMAZON"), "pt");
  assert.throws(() => radarProviderLocale("", "MERCHANT_AMAZON"), (erro: unknown) => erro instanceof RadarLocaleError);
});

test("B · o adapter da Amazon não tem replace próprio — ele usa a autoridade", async () => {
  const fonte = semComentarios(await readFile(new URL("../lib/server/dataforseo-amazon-operation.ts", import.meta.url), "utf8"));
  assert.equal(/replace\(["']-["']/.test(fonte), false, "nenhuma tradução local de separador");
  /*
   * 2.1 · PARTE A · A AUTORIDADE GANHOU A REGRA DO MERCADO.
   *
   * Continua sendo ela — o que mudou é que a chamada passa também o
   * `location_code`, porque a região que falta no idioma está declarada ali. A
   * asserção protege a mesma coisa: nenhuma convenção de provider mora aqui.
   */
  assert.ok(fonte.includes("radarMerchantAmazonLocale(input.languageCode, input.locationCode)"));
  assert.ok(fonte.includes("assertRadarProviderLocale(languageCode, \"MERCHANT_AMAZON\")"), "traduz E confere");
  assert.equal(/2076|"BR"/.test(fonte), false, "nenhum mercado ou região codificado no adapter");
});

/* ============ C · HTTP 200 com tarefa recusada ============ */

test("C · tarefa 40501 é FAILED, nunca EMPTY", () => {
  /*
   * O caso real: HTTP 200, `task.status_code = 40501 · Invalid Field:
   * 'language_code'`, custo zero. Chamar isso de SERP vazia esconderia a
   * recusa atrás de uma tela correta.
   */
  const recusada = normalizeDataForSeoAmazonResponse({
    status_code: 20000,
    tasks: [{ status_code: 40501, status_message: "Invalid Field: 'language_code'.", result: null }],
  }, "amzq:1");

  assert.equal(recusada.diagnostics.providerStatusCode, 40501);
  assert.throws(
    () => assertRadarAmazonReadable(recusada),
    (erro: unknown) => erro instanceof DataForSeoAmazonReadError && erro.code === "AMAZON_PROVIDER_TASK_FAILED",
  );
  assert.equal(radarAmazonIsEmptyResult(recusada), false, "recusa não é resultado vazio");
});

test("C · as três situações têm nomes diferentes", () => {
  /* EMPTY: a tarefa foi bem e a busca não tem produto. */
  const vazia = normalizeDataForSeoAmazonResponse({
    tasks: [{ status_code: 20000, status_message: "Ok.", result: [{ keyword: "x", items: [], items_count: 0, item_types: [] }] }],
  }, "amzq:1");
  assert.doesNotThrow(() => assertRadarAmazonReadable(vazia));
  assert.equal(radarAmazonIsEmptyResult(vazia), true);

  /* NORMALIZATION_EMPTY: o provider deu produto e nós produzimos zero. */
  const perdida = normalizeDataForSeoAmazonResponse({
    tasks: [{
      status_code: 20000, status_message: "Ok.",
      result: [{ keyword: "x", items_count: 1, item_types: ["amazon_serp"], items: [{ type: "amazon_serp", title: "sem asin", url: "https://x" }] }],
    }],
  }, "amzq:1");
  assert.equal(perdida.diagnostics.rawOrganic, 1);
  assert.equal(perdida.diagnostics.normalized, 0);
  assert.throws(
    () => assertRadarAmazonReadable(perdida),
    (erro: unknown) => erro instanceof DataForSeoAmazonReadError && erro.code === "AMAZON_NORMALIZATION_EMPTY",
  );
  assert.equal(perdida.diagnostics.discardReasons.sem_asin, 1, "o descarte é contado com motivo");
});

/* ============ o payload real ============ */

test("§6 · o payload real normaliza os três tipos que a fonte tem", () => {
  const leitura = normalizada();
  assert.equal(leitura.diagnostics.providerStatusCode, 20000);
  assert.deepEqual(leitura.diagnostics.itemTypes, ["amazon_serp", "amazon_paid", "related_searches"]);
  assert.equal(leitura.diagnostics.rawOrganic, 53);
  assert.equal(leitura.diagnostics.rawSponsored, 2);
  assert.equal(leitura.results.length, 55, "53 orgânicos + 2 patrocinados");
  assert.equal(leitura.discarded, 0, "nenhum item da amostra real foi perdido");

  /* E os campos que a fonte não tem não existem no resultado normalizado. */
  const primeiro = leitura.results[0];
  for (const campo of ["brand", "seller", "description", "attributes", "category", "reviewText", "originalPrice", "discountPercent", "priceTo"]) {
    assert.equal(campo in primeiro, false, `campo sem lastro no modelo: ${campo}`);
  }
});

/* ============ D e E · identidade por ASIN ============ */

test("D e E · a identidade é o ASIN — URL diferente, mesmo produto", () => {
  const leitura = normalizada();
  const alvo = leitura.results[0];

  /*
   * A URL da Amazon carrega `crid`, `qid` e `dib`, que mudam a cada coleta.
   * Deduplicar por ela faria o mesmo produto contar duas vezes entre duas
   * consultas — e "esta marca aparece três vezes" passaria a medir quantas
   * buscas foram feitas.
   */
  const outraConsulta = {
    ...alvo,
    url: `${alvo.url}&qid=999&crid=OUTRO`,
    queryId: "amzq:2",
  };

  const deduplicado = buildRadarAmazonUniverse([alvo, outraConsulta]);
  assert.equal(deduplicado.length, 1, "um ASIN, uma identidade");
  assert.equal(deduplicado[0].asin, alvo.asin);
  assert.equal(deduplicado[0].occurrenceCount, 2, "e as duas ocorrências ficam");
  assert.deepEqual(deduplicado[0].queriesFoundIn, ["amzq:1", "amzq:2"]);

  /* O universo real também deduplica: 55 itens de página viram 51 produtos. */
  assert.equal(leitura.results.length, 55);
  assert.equal(universo().length, 51);
  const asins = universo().map(item => item.asin);
  assert.equal(new Set(asins).size, asins.length, "nenhum ASIN repetido no universo");
});

/* ============ F · orgânico × patrocinado ============ */

test("F · orgânico e patrocinado ficam separados, e o tipo é a fonte do sinal", () => {
  const contagem = radarAmazonUniverseCounts(universo());

  /*
   * ====== O QUE A AMOSTRA REAL REVELOU ======
   *
   * O provider devolveu 53 itens orgânicos e 2 patrocinados. Mas os DOIS
   * patrocinados são o MESMO ASIN — e esse ASIN também ranqueia organicamente.
   *
   * O universo conta PRODUTO, não item de página: 51 ASINs únicos, 1 deles
   * comprando dois espaços de anúncio para a busca em que já aparece. Contar
   * itens diria "2 patrocinados" e descreveria slots de anúncio, não
   * concorrentes.
   */
  assert.equal(contagem.total, 51, "51 produtos distintos");
  assert.equal(contagem.organic, 51);
  assert.equal(contagem.sponsored, 1, "um produto patrocinado, em dois slots");
  assert.equal(contagem.both, 1, "e ele ranqueia E compra anúncio para a mesma busca");
  assert.equal(contagem.organic + contagem.sponsored - contagem.both, contagem.total);

  /*
   * NESTA AMOSTRA `organic` E `total` COINCIDEM — todo patrocinado também
   * ranqueia. Um universo com produto SÓ patrocinado é o que separa as duas
   * contagens, e é onde "patrocinado conta como orgânico" apareceria.
   */
  const leitura = normalizada();
  const soPago = { ...leitura.results[0], asin: "SO-PAGO-1", placement: "SPONSORED" as const, rankAbsolute: 3 };
  const misto = radarAmazonUniverseCounts(buildRadarAmazonUniverse([...leitura.results, soPago]));
  assert.equal(misto.total, 52, "o produto só patrocinado entra no universo");
  assert.equal(misto.organic, 51, "e NÃO entra na contagem orgânica");
  assert.equal(misto.sponsored, 2);
  assert.equal(misto.both, 1);

  /* O placement veio do TIPO do item — não há booleano inferido de texto. */
  const fonte = semComentarios(fonteDoAdapter);
  assert.ok(fonte.includes('tipo === "amazon_serp" ? "ORGANIC" : tipo === "amazon_paid" ? "SPONSORED" : null'));
  assert.equal(/Patrocinado|sponsored.*title|title.*sponsored/i.test(fonte), false, "nada de inferir por texto");
});

test("F · o MESMO ASIN orgânico e patrocinado preserva os dois", () => {
  /*
   * Escolher um dos dois apagaria metade do que a página mostra: uma marca que
   * ranqueia E compra anúncio para a mesma busca está dizendo algo que nenhuma
   * das metades diz sozinha.
   */
  const leitura = normalizada();
  const organico = leitura.results.find(item => item.placement === "ORGANIC")!;
  const comoPago = { ...organico, placement: "SPONSORED" as const, rankAbsolute: 1, queryId: "amzq:2" };

  const entrada = buildRadarAmazonUniverse([organico, comoPago])[0];
  assert.deepEqual(entrada.placements, ["ORGANIC", "SPONSORED"]);
  assert.equal(entrada.bestOrganicRank, organico.rankAbsolute);
  assert.equal(entrada.bestSponsoredRank, 1);
  assert.equal(radarAmazonUniverseCounts([entrada]).both, 1);
});

/* ============ G · related_searches não é categoria ============ */

test("G · related_searches vira relatedSearchSignals, nunca categoria", () => {
  const leitura = normalizada();
  assert.ok(leitura.relatedSearches.length > 0);
  for (const termo of leitura.relatedSearches) {
    assert.ok(termo.term.length > 1);
    assert.equal(termo.queryId, "amzq:1");
  }

  /*
   * "protetor solar" ao lado de "protetor solar facial" é reformulação de
   * busca, não departamento da loja. Chamá-la de categoria daria a ela uma
   * autoridade taxonômica que ela não tem.
   */
  const modelo = semComentarios(fonteDoModelo);
  assert.equal(/categor/i.test(modelo.replace(/relatedSearch\w*/g, "")), false, "nenhuma categoria no modelo");

  /* E o resultado normalizado não tem campo de categoria. */
  assert.equal("category" in leitura.results[0], false);
});

/* ============ H · marca não é inferida ============ */

test("H · a marca NÃO é derivada do título, e não existe como fato", () => {
  const leitura = normalizada();

  /*
   * O primeiro título real começa com "EUCERIN". Parsear isso produziria marca
   * com cara de identidade coletada — e o Planejador a trataria como tal.
   */
  assert.match(leitura.results[0].title, /^EUCERIN/);
  assert.equal("brand" in leitura.results[0], false);
  assert.equal("brandCandidate" in leitura.results[0], false);

  const modelo = semComentarios(fonteDoModelo);
  assert.equal(/parseTitle|extractBrand|brandFrom|split\(" "\)\[0\]/.test(modelo), false, "nenhuma heurística de marca");

  /* E o contrato canônico também perdeu o campo. */
  const amazon = RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1, profile: "AMAZON", articleId: "a1", articleDnaVersionId: "d1",
    observed: { products: 0, sufficiency: "sem coleta" }, recommended: {},
    provenance: { generatedAt: "2026-09-14T20:00:00.000Z" },
  });
  assert.equal(amazon.profile === "AMAZON" && "brands" in amazon.observed, false);
  assert.equal(amazon.profile === "AMAZON" && "categories" in amazon.observed, false);
});

/* ============ I e J · reputação, sem texto ============ */

test("I · texto de review não é fabricado em lugar nenhum", () => {
  const leitura = normalizada();
  for (const campo of ["reviewText", "reviews", "buyerPraise", "buyerComplaints", "objections"]) {
    assert.equal(campo in leitura.results[0], false, `campo fabricado: ${campo}`);
  }
  assert.equal(JSON.stringify(leitura.results).includes("review"), false);

  /* E o contrato perdeu os campos que prometiam texto. */
  const amazon = RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1, profile: "AMAZON", articleId: "a1", articleDnaVersionId: "d1",
    observed: { products: 0, sufficiency: "sem coleta" }, recommended: {},
    provenance: { generatedAt: "2026-09-14T20:00:00.000Z" },
  });
  if (amazon.profile !== "AMAZON") throw new Error("perfil");
  for (const campo of ["complaintPatterns", "objectionPatterns", "frustratedExpectations", "benefitPatterns", "attributes", "buyingCriteria"]) {
    assert.equal(campo in amazon.observed, false, `contrato ainda promete: ${campo}`);
  }
  assert.equal("reviewStructure" in amazon.recommended, false);
});

test("J · nota e votos são sinais de REPUTAÇÃO, e vêm completos", () => {
  const leitura = normalizada();
  const comNota = leitura.results.filter(item => item.ratingValue !== null);
  assert.equal(comNota.length, 55, "todo item da amostra real trouxe nota");
  for (const item of comNota) {
    assert.ok(item.ratingValue! > 0 && item.ratingValue! <= 5);
    assert.equal(typeof item.ratingVotes, "number");
    assert.equal(item.ratingMax, 5);
  }

  /* §12 · os sinais de compra também — e eles não afirmam qualidade. */
  const contagem = radarAmazonUniverseCounts(universo());
  assert.equal(contagem.amazonChoice, 1);
  assert.equal(contagem.bestSeller, 2);
  assert.ok(universo().filter(item => item.boughtPastMonth !== null).length > 40);
});

/* ============ §9 · preço ============ */

test("§9 · só preço atual; desconto fica como texto observado", () => {
  const leitura = normalizada();
  const comPreco = leitura.results.filter(item => item.priceFrom !== null);
  assert.ok(comPreco.length > 40);
  assert.ok(comPreco.every(item => item.currency === "BRL"));

  /* `offerText` preserva as strings do provider, sem interpretá-las. */
  const comOferta = leitura.results.filter(item => item.offerText.length > 0);
  assert.ok(comOferta.length > 0);
  assert.ok(comOferta.every(item => item.offerText.every(parte => typeof parte === "string")));
  assert.ok(comOferta.some(item => item.offerText.some(parte => /R\$/.test(parte))));

  /* E nada de desconto calculado sem preço anterior. */
  const modelo = semComentarios(fonteDoModelo);
  assert.equal(/discountPercent|originalPrice|priceTo/.test(modelo), false);
});

/* ============ §16 · o plano de consultas ============ */

test("§16 · o plano é determinístico e pequeno; sem keyword não há consulta", () => {
  const plano = buildRadarAmazonQueryPlan({
    articleId: "a1", articleDnaVersionId: "d1", primaryKeyword: "protetor solar facial",
  });
  assert.equal(plano.queries.length, 1);
  assert.equal(plano.queries[0].origin, "PRIMARY_KEYWORD");
  assert.equal(plano.queries[0].queryId, radarAmazonQueryId("protetor solar facial"));
  assert.deepEqual(plano.limitations, []);

  /*
   * §17 · SEM KEYWORD, NADA — e o título não entra como reserva silenciosa.
   * Ele é promessa editorial, não formulação de busca.
   */
  const semKeyword = buildRadarAmazonQueryPlan({ articleId: "a1", articleDnaVersionId: "d1", primaryKeyword: null });
  assert.deepEqual(semKeyword.queries, []);
  assert.ok(semKeyword.limitations[0].includes("keyword principal"));

  /* O id é estável entre execuções. */
  assert.equal(radarAmazonQueryId("Protetor Solar Facial"), radarAmazonQueryId("protetor solar  facial"));
});

/* ============ §18 · a corrida e o resumo ============ */

test("§18 · a corrida grava o que foi pedido e o que respondeu", () => {
  const leitura = normalizada();
  const run = buildRadarAmazonSearchRun({
    runId: "run-1", runVersion: 1, startedAt: "2026-09-14T18:00:00.000Z", startedBy: "u",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ["amzq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: DATAFORSEO_AMAZON_ENDPOINT,
      locationCode: 2076, languageCode: "pt_BR", seDomain: "amazon.com.br", depth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [],
      collectedAt: "2026-09-14T18:00:07.000Z",
    },
    queries: [{ queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: leitura.results.length }],
    results: leitura.results,
    universe: buildRadarAmazonUniverse(leitura.results),
    relatedSearches: leitura.relatedSearches,
  });

  assert.equal(run.state, "COLLECTED");
  /* §13 · a grafia GRAVADA é a que foi enviada, não a que a config guarda. */
  assert.equal(run.provenance.languageCode, "pt_BR");
  assert.equal(run.provenance.seDomain, "amazon.com.br");

  const resumo = radarAmazonRunSummary(run)!;
  assert.match(resumo.headline, /produto\(s\)/);
  assert.match(resumo.headline, /patrocinado\(s\)/);
  assert.equal(/vídeo/.test(resumo.headline), false, "vocabulário de vídeo não vaza para produto");

  /* §15 · nenhuma consulta respondida = falhou, não vazia. */
  const semResposta = buildRadarAmazonSearchRun({
    ...{ runId: "run-2", runVersion: 1, startedAt: "x", startedBy: "u" },
    fingerprint: run.fingerprint,
    provenance: { ...run.provenance, queriesSucceeded: 0, queriesFailed: 1 },
    queries: run.queries, results: [], universe: [],
  });
  assert.equal(semResposta.state, "COLLECTION_FAILED");
});

/* ============ §22 · a projeção lê a corrida do PERFIL ============ */

test("§22 · o perfil Amazon lê a corrida dele, e conta produtos", () => {
  const corrida = {
    state: "COLLECTED",
    queries: [{ queryId: "amzq:1", executed: true }],
    universe: Array.from({ length: 41 }, (_, indice) => ({ asin: `A${indice}` })),
  };

  const projecao = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: corrida, supportResearch: { collectedAt: "2026-09-14T20:00:00.000Z", failureReason: null } },
    profile: "AMAZON",
  });
  assert.equal(projecao.state, "READY");
  assert.equal(projecao.counts.videos, 41, "o universo é contado");
  assert.ok(projecao.lines.some(linha => linha.includes("produto(s)")), `linhas: ${projecao.lines.join(" | ")}`);
  assert.equal(projecao.lines.some(linha => linha.includes("vídeo(s)")), false);

  /*
   * A CORRIDA ERRADA FARIA A TELA NEGAR UMA COLETA QUE ACONTECEU.
   *
   * Antes deste gate isto lia `youtubeSearch` para qualquer perfil não-Google.
   */
  const soYoutube = radarResearchProfileStateOfAnalysis({
    payload: { youtubeSearch: corrida }, profile: "AMAZON",
  });
  assert.equal(soYoutube.state, "NOT_STARTED", "a corrida de vídeo não conta como coleta de produto");
});

/* ============ §19, §20 e §21 · o START ============ */

test("§20 · o START grava e relê ANTES de qualquer chamada paga", async () => {
  const fonte = semComentarios(await readFile(new URL("../lib/server/radar-amazon-start.ts", import.meta.url), "utf8"));

  const ordem = [
    "ports.loadArticle(",
    "ensureRadarAnalysisContext(",
    "radarDecideResearchSource(",
    "ports.appendAnalysis(",
    "ports.loadRadarState(",
  ].map(marca => fonte.indexOf(marca));
  assert.ok(ordem.every(indice => indice > 0), "todos os passos existem");
  for (let indice = 1; indice < ordem.length; indice += 1) {
    assert.ok(ordem[indice] > ordem[indice - 1], "os passos estão na ordem que impede gasto antes do compromisso");
  }

  /* O módulo do START não fala com provider nenhum. */
  assert.equal(/fetch\(|dataforseo-amazon-operation|executeDataForSeo/.test(fonte), false);

  /*
   * O READBACK VIVE DENTRO DO START — e conferir só a ORDEM das strings no
   * arquivo não prova isso: `ports.loadRadarState` também existe no finish, e
   * um start sem releitura passaria pela conferência de ordem.
   */
  const corpoDoStart = fonte.slice(
    fonte.indexOf("export async function startRadarAmazonRun"),
    fonte.indexOf("export async function finishRadarAmazonRun"),
  );
  assert.ok(corpoDoStart.includes("await ports.loadRadarState("), "o start relê o que gravou");
  assert.ok(corpoDoStart.includes("radar_run_readback_failed"), "e recusa quando o banco não confirma");
  assert.ok(
    corpoDoStart.indexOf("await ports.appendAnalysis(") < corpoDoStart.indexOf("await ports.loadRadarState("),
    "grava antes de reler",
  );
});

test("N · dois STARTs concorrentes: quem perde para ANTES do provider", async () => {
  const fonte = semComentarios(await readFile(new URL("../lib/server/radar-amazon-start.ts", import.meta.url), "utf8"));
  assert.ok(fonte.includes("radar_start_contended"));
  assert.ok(fonte.includes("OptimisticLockError"));

  /*
   * A trava NÃO é retentada. Dois cliques leriam o mesmo estado e gravariam
   * duas corridas equivalentes — e as duas cobrariam.
   */
  const trecho = fonte.slice(fonte.indexOf("ports.appendAnalysis("), fonte.indexOf("readback"));
  assert.equal(/retry|for \(|while \(/.test(trecho), false, "a disputa não é retentada");

  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8"));
  assert.ok(rota.indexOf("startRadarAmazonRun(") < rota.indexOf("resolveDataForSeoCanonicalSerpCompatibilityConfig("), "o START vem antes da cota");
  assert.ok(rota.indexOf("startRadarAmazonRun(") < rota.indexOf("executeDataForSeoAmazonQuery("), "e antes do provider");
});

test("K e L · o apoio do Google roda no servidor, e não abre o pipeline do Google", async () => {
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8"));

  /*
   * ====== A REGRA MUDOU EM AMAZON_SEARCH_1.1 · §3 ======
   *
   * No gate 1 esta rota NÃO coletava o Google: o apoio seria encadeado pelo
   * navegador, como no YouTube. O 1.1 desfez isso — aquele desenho exigia que
   * a aba sobrevivesse entre as duas chamadas, e fechá-la deixava a coleta
   * principal paga com o apoio nunca feito.
   *
   * O que continua proibido é o apoio ABRIR o pipeline do Google.
   */
  assert.ok(rota.includes("collectRadarGoogleSupport({"), "o apoio acontece no servidor");
  assert.equal((rota.match(/collectRadarGoogleSupport\(/g) || []).length, 2, "uma vez no START, uma no retry");

  const apoio = semComentarios(await readFile(new URL("../lib/server/radar-support-research.ts", import.meta.url), "utf8"));
  assert.equal(
    /curationVersionFor|startSerpAnalysis|selectedCompetitorIds|deepResearch|finalizedBundle|persistSerpAnalysis/.test(apoio),
    false,
    "o apoio não abre curadoria, nem seleção de concorrentes, nem FINALIZE",
  );

  /* E o adapter da Amazon continua com uma porta só. */
  assert.equal((rota.match(/executeDataForSeoAmazonQuery\(/g) || []).length, 1, "uma porta ao provider da Amazon");
  assert.equal(/\bfetch\(/.test(rota), false, "nenhuma chamada de rede direta na rota");
});

test("L · o retry do apoio não toca a corrida da Amazon", async () => {
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8"));
  const retry = rota.slice(rota.indexOf("async function repetirApoio"), rota.indexOf("async function gravarPacote"));

  /*
   * Refazer a primária para corrigir o apoio cobraria de novo a coleta cara
   * para arrumar a barata.
   */
  assert.equal(/startRadarAmazonRun|finishRadarAmazonRun|executeDataForSeoAmazonQuery/.test(retry), false, "Amazon calls = 0 no retry");
  assert.ok(retry.includes("collectRadarGoogleSupport({"), "e o Google é chamado uma vez");
  assert.ok(retry.includes("radarPackageNeedsSupportRetry(pacoteAtual)"), "§2 · quem decide se há retry é o estado gravado");
  assert.ok(retry.includes("radar_support_retry_not_applicable"), "e recusa quando não há o que repetir");
});

test("M e §21 · nenhum caminho automático até o provider", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8");
  /* Só POST. Um GET que coletasse seria alcançável por navegação e por F5. */
  assert.equal(/export async function GET/.test(rota), false);
  assert.ok(rota.includes("export async function POST"));

  const modelo = semComentarios(fonteDoModelo);
  const run = semComentarios(await readFile(new URL("../lib/radar/amazon-search-run.ts", import.meta.url), "utf8"));
  for (const fonte of [modelo, run]) {
    assert.equal(/fetch\(|useEffect|from ["']\.\.\/server\//.test(fonte), false, "domínio puro, sem caminho até a rede");
  }
  assert.deepEqual(tentativasDeRede, []);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
