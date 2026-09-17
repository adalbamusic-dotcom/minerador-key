import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { radarAmazonEligibleCandidates } from "../lib/radar/amazon-eligibility.ts";
import { radarAmazonSelectCandidates } from "../lib/radar/amazon-candidate-selection.ts";
import {
  RADAR_AMAZON_PRODUCT_CLASS_ISSUE,
  RadarAmazonEditorialIntentSchema,
  RadarAmazonResearchTargetSchema,
  radarAmazonSetupMatchesRun,
  radarAmazonSetupSignature,
  radarAmazonValidateSetup,
  type RadarAmazonEditorialIntentType,
} from "../lib/radar/amazon-editorial-target.ts";
import type { RadarAmazonUniverseEntry } from "../lib/radar/amazon-search-model.ts";

/*
 * ===== AMAZON_EDITORIAL_TARGET_1.1 · AS TRÊS CAMADAS, COM A COLETA REAL =====
 *
 * ==================== ESTA FIXTURE NÃO FOI INVENTADA ====================
 *
 * Os dois universos vêm das coletas reais já persistidas, lidas do banco:
 *
 *     TOP_VALUE · "Serum Nivea" · 59 produtos · desiredCount 6
 *     TOP_BEST  · "Nivea"       · 56 produtos · desiredCount 4
 *
 * Nenhuma chamada nova foi feita para escrever este arquivo (§1), e nenhuma é
 * feita para rodá-lo. É a mesma evidência que produziu o defeito.
 *
 * ==================== O DEFEITO, EM UMA LINHA ====================
 *
 * `rawUniverse === comparableProducts`. O ranking de custo-benefício rodou
 * sobre os 59, comparando sérum Nivea com sérum Dove e creme de mãos Nivea.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const requerer = createRequire(import.meta.url);
const REAIS = requerer("./fixtures/radar-amazon-runs-reais.json") as {
  serumNivea: RadarAmazonUniverseEntry[];
  nivea: RadarAmazonUniverseEntry[];
};

const intencao = (type: RadarAmazonEditorialIntentType, patch: Record<string, unknown> = {}) =>
  RadarAmazonEditorialIntentSchema.parse({ type, ...patch });

const alvo = (patch: Record<string, unknown> = {}) =>
  RadarAmazonResearchTargetSchema.parse({ type: "CATEGORY_DISCOVERY", ...patch });

/* ============ FIXTURE A · TOP_VALUE "Serum Nivea" · 59 ============ */

test("Fixture A · o universo bruto é preservado inteiro, e não é o conjunto comparável", () => {
  assert.equal(REAIS.serumNivea.length, 59, "REAL_FIXTURE_SERUM_NIVEA_RAW");

  const resultado = radarAmazonEligibleCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  });

  /* §3 e §28 · nada do bruto se perde: elegíveis + excluídos fecham os 59. */
  assert.equal(resultado.rawCount, 59);
  assert.equal(resultado.eligible.length + resultado.excluded.length, 59, "nenhum produto some");
  assert.ok(resultado.eligible.length < 59, "ELIGIBLE < RAW — este é o gate inteiro");
  assert.equal(resultado.eligible.length, 9, "REAL_FIXTURE_SERUM_NIVEA_ELIGIBLE");

  const titulos = resultado.eligible.map(item => item.title.toLowerCase());
  for (const titulo of titulos) {
    assert.ok(titulo.includes("nivea"), `marca errada entrou: ${titulo.slice(0, 60)}`);
    assert.ok(/s(é|e)rum/i.test(titulo), `classe errada entrou: ${titulo.slice(0, 60)}`);
  }
});

test("§7 · o tipo de produto casa por TODAS as raízes, não por alguma", () => {
  /*
   * "sérum facial" precisa dizer as duas coisas.
   *
   * Com "alguma raiz basta", `productClass = "sérum facial"` aceitaria qualquer
   * coisa FACIAL — creme facial, tônico facial, protetor facial — e a lista
   * voltaria a ser a vizinhança da busca. A coleta real tem exatamente esses
   * produtos esperando para entrar.
   */
  const facial = radarAmazonEligibleCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum facial", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  });
  const amplo = radarAmazonEligibleCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  });

  assert.ok(facial.eligible.length < amplo.eligible.length, "o termo mais preciso precisa filtrar mais");
  for (const item of facial.eligible) {
    const titulo = item.title.toLowerCase();
    assert.ok(/s(é|e)rum/.test(titulo) && /facial/.test(titulo), `entrou sem dizer as duas coisas: ${item.title.slice(0, 60)}`);
  }

  /*
   * O CASO CONCRETO: o sérum CORPORAL da Nivea está no universo real e não é
   * um sérum facial. Com "alguma raiz", ele entraria pela palavra "sérum".
   */
  const corporal = REAIS.serumNivea.find(item => /S(é|e)rum (Ó|O)leo Corporal/i.test(item.title));
  assert.ok(corporal, "a coleta real tem um sérum corporal da Nivea");
  assert.equal(facial.eligible.some(item => item.asin === corporal!.asin), false, "sérum corporal entrou num ranking de sérum facial");

  /* E um creme facial Nivea nunca entra num ranking de sérum facial. */
  const cremeFacial = REAIS.serumNivea.find(item => /Creme Facial/i.test(item.title));
  assert.ok(cremeFacial, "a coleta real tem creme facial Nivea");
  assert.equal(facial.eligible.some(item => item.asin === cremeFacial!.asin), false);
  assert.equal(amplo.eligible.some(item => item.asin === cremeFacial!.asin), false);
});

test("Fixture A · sérum de outra marca e Nivea de outra classe não viram candidatos", () => {
  const resultado = radarAmazonEligibleCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  });

  const excluidos = resultado.excluded.map(item => item.title);
  const elegiveis = resultado.eligible.map(item => item.title);

  /*
   * OS QUATRO CASOS QUE A COLETA REAL TROUXE, e que o ranking comparava.
   */
  const seruMDeOutraMarca = ["Dove Sérum Hidratante Corporal", "Garnier Uniform & Matte Sérum", "La Roche-Posay", "Neutrogena Sérum"];
  for (const marca of seruMDeOutraMarca) {
    const achado = REAIS.serumNivea.find(item => item.title.includes(marca.split(" ")[0]));
    if (!achado) continue;
    assert.ok(excluidos.includes(achado.title), `sérum de outra marca entrou: ${achado.title.slice(0, 50)}`);
  }

  const niveaDeOutraClasse = ["Creme para Mãos", "Tônico Facial", "Hidratante Labial", "Sabonete"];
  for (const classe of niveaDeOutraClasse) {
    const achado = REAIS.serumNivea.find(item => item.title.includes(classe));
    if (!achado) continue;
    assert.ok(excluidos.includes(achado.title), `Nivea de outra classe entrou: ${achado.title.slice(0, 50)}`);
    assert.equal(elegiveis.includes(achado.title), false);
  }

  /* §28 · e cada exclusão explica a si mesma. */
  for (const item of resultado.excluded) assert.ok(item.reason.length > 15, item.title);
});

test("Fixture A e §10 · desiredCount corta a shortlist, nunca a coleta", () => {
  const elegiveis = radarAmazonEligibleCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  });

  const selecao = radarAmazonSelectCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }),
    universe: elegiveis.eligible,
    observedCount: elegiveis.rawCount,
    queryCount: 1,
  });

  /* §16 · os três números, e eles são diferentes entre si. */
  assert.equal(selecao.observedCount, 59);
  assert.equal(selecao.eligibleCount, 9);
  assert.equal(selecao.candidates.length, 6, "REAL_FIXTURE_SERUM_NIVEA_SHORTLIST");
  assert.ok(selecao.candidates.length <= 6, "shortlist <= desiredCount");

  /*
   * §10 · O BRUTO NÃO ENCOLHEU. Um `slice(0, 6)` sobre a coleta daria 6
   * "produtos comparáveis" e apagaria 53 evidências pagas.
   */
  assert.equal(elegiveis.rawCount, 59);
  assert.equal(elegiveis.eligible.length + elegiveis.excluded.length, 59);
});

/* ============ FIXTURE B · TOP_BEST "Nivea" · 56 ============ */

test("Fixture B e §5 · marca sozinha não sustenta ranking — CONFIG_NEEDS_PRODUCT_CLASS", () => {
  assert.equal(REAIS.nivea.length, 56, "REAL_FIXTURE_NIVEA_RAW");

  /*
   * A CONFIGURAÇÃO REAL que produziu o defeito: `TOP_BEST`, consulta "Nivea",
   * quatro produtos pretendidos e nenhum tipo declarado. O universo trouxe
   * hidratante labial, sabonete íntimo, creme de mãos e sérum antissinais — e o
   * artigo prometia "os 4 melhores". Melhores para quê?
   */
  const semClasse = radarAmazonValidateSetup({
    intent: intencao("TOP_BEST", { desiredCount: 4 }),
    target: alvo({ categoryQuery: "Nivea" }),
  });
  assert.equal(semClasse.valid, false, "BRAND_ONLY_TOP_ALLOWED = NO");
  assert.ok(semClasse.issues.includes(RADAR_AMAZON_PRODUCT_CLASS_ISSUE), semClasse.issues.join(" | "));

  /* Com o tipo declarado, a mesma consulta passa — e compara o que deve. */
  const comClasse = radarAmazonValidateSetup({
    intent: intencao("TOP_BEST", { desiredCount: 4 }),
    target: alvo({ categoryQuery: "Nivea", productClass: "sérum", brandFilter: "Nivea" }),
  });
  assert.equal(comClasse.valid, true, comClasse.issues.join(" | "));
});

test("Fixture B e §6 · brand-wide tem tipo próprio, e ele não promete ranking", () => {
  /*
   * §6 · "melhores produtos Nivea em geral" é um pedido legítimo, e não é um
   * TOP comum. `BRAND_LINE_REVIEW` existe para ele: analisa a família e não
   * compara hidratante labial com sabonete íntimo como se concorressem.
   */
  const linha = radarAmazonValidateSetup({
    intent: intencao("BRAND_LINE_REVIEW"),
    target: RadarAmazonResearchTargetSchema.parse({ type: "BRAND_LINE", brand: "Nivea" }),
  });
  assert.equal(linha.valid, true, linha.issues.join(" | "));
  assert.equal(linha.issues.includes(RADAR_AMAZON_PRODUCT_CLASS_ISSUE), false, "BRAND_WIDE_BEHAVIOR");

  /* E o guia de compra também não exige tipo: ele mapeia critérios, não ranqueia. */
  const guia = radarAmazonValidateSetup({
    intent: intencao("BUYING_GUIDE"),
    target: alvo({ categoryQuery: "hidratante corporal" }),
  });
  assert.equal(guia.valid, true, guia.issues.join(" | "));
});

/* ============ §9 · SPONSORED NÃO É INELEGÍVEL ============ */

test("§9 · a elegibilidade é por produto, nunca por placement", () => {
  const resultado = radarAmazonEligibleCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  });

  /*
   * O universo real tem um ASIN que aparece como ORGANIC e SPONSORED ao mesmo
   * tempo. Ele é UM produto — descartá-lo por causa de onde apareceu jogaria
   * fora um produto real por um dado de vitrine.
   */
  const hibridos = REAIS.serumNivea.filter(item => item.placements.length > 1);
  assert.ok(hibridos.length >= 1, "a coleta real tem produto em dois placements");

  const soPatrocinados = REAIS.serumNivea.filter(item =>
    item.placements.length === 1 && item.placements[0] === "SPONSORED");
  assert.ok(soPatrocinados.length >= 1, "e tem produto só patrocinado");

  /* Um patrocinado que bate classe e marca é elegível como qualquer outro. */
  const patrocinadoCompativel = soPatrocinados.find(item =>
    /nivea/i.test(item.title) && /s(é|e)rum/i.test(item.title));
  if (patrocinadoCompativel) {
    assert.ok(
      resultado.eligible.some(item => item.asin === patrocinadoCompativel.asin),
      "produto patrocinado compatível foi descartado por causa do placement",
    );
  }

  /* E nenhuma exclusão cita placement como motivo. */
  for (const item of resultado.excluded) {
    assert.equal(/patrocinad|sponsored|an(ú|u)ncio/i.test(item.reason), false, item.reason);
  }
});

/* ============ §13, §14 e §15 · QUANDO A PESSOA JÁ ESCOLHEU ============ */

test("§13, §14 e §15 · alvo com ASINs escolhidos: o resto é contexto, não candidato", () => {
  const doisPrimeiros = REAIS.serumNivea.slice(0, 2);
  const produtos = doisPrimeiros.map(item => ({
    input: item.title, inputType: "ASIN" as const,
    resolvedAsin: item.asin, resolvedTitle: item.title, resolvedImageUrl: null,
  }));

  const resultado = radarAmazonEligibleCandidates({
    intent: intencao("PRODUCT_VS_PRODUCT"),
    target: RadarAmazonResearchTargetSchema.parse({ type: "PRODUCT_PAIR", products: produtos }),
    universe: REAIS.serumNivea,
  });

  assert.equal(resultado.method, "TARGET_PRODUCTS");
  assert.equal(resultado.eligible.length, 2, "exatamente os dois escolhidos");
  assert.deepEqual(resultado.eligible.map(item => item.asin).sort(), doisPrimeiros.map(item => item.asin).sort());

  /* §15 · a SERP não acrescenta um terceiro produto por conta própria. */
  assert.equal(resultado.excluded.length, 57);
  assert.ok(resultado.excluded.every(item => /contexto competitivo/i.test(item.reason)));
  assert.equal(resultado.rawCount, 59, "e o bruto continua inteiro");
});

/* ============ §27 · O INTENT MUDA A SHORTLIST DE VERDADE ============ */

test("§27 · o MESMO conjunto elegível produz shortlists diferentes por critério", () => {
  const elegiveis = radarAmazonEligibleCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 4 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  }).eligible;

  const melhores = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 4 }), universe: elegiveis, queryCount: 1,
  });
  const valor = radarAmazonSelectCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 4 }), universe: elegiveis, queryCount: 1,
  });

  assert.equal(melhores.criteria, "BEST_OVERALL");
  assert.equal(valor.criteria, "VALUE_FOR_MONEY");

  /*
   * O TESTE TEM DE FLIPAR DE VERDADE (§27).
   *
   * Com a evidência real, "melhores" e "custo-benefício" não podem devolver a
   * mesma lista na mesma ordem — se devolvessem, o critério seria decoração.
   */
  assert.notDeepEqual(
    melhores.candidates.map(item => item.asin),
    valor.candidates.map(item => item.asin),
    "critério diferente produziu exatamente a mesma shortlist",
  );
});

test("§11 e §12 · o ranking nunca vê o universo bruto", () => {
  /*
   * A PROVA DIRETA: ordenar os 59 e ordenar os 9 dão listas diferentes, e é a
   * dos 9 que o artigo usa. Rodar sobre os 59 colocava sérum Dove e creme de
   * mãos Nivea na disputa por "melhor sérum Nivea".
   */
  const bruto = radarAmazonSelectCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }), universe: REAIS.serumNivea, queryCount: 1,
  });
  const elegiveis = radarAmazonEligibleCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
    universe: REAIS.serumNivea,
  }).eligible;
  const comFiltro = radarAmazonSelectCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 6 }), universe: elegiveis, queryCount: 1,
  });

  assert.notDeepEqual(
    bruto.candidates.map(item => item.asin),
    comFiltro.candidates.map(item => item.asin),
    "o filtro de elegibilidade não mudou nada — ele não está sendo aplicado",
  );
  for (const candidato of comFiltro.candidates) {
    const produto = REAIS.serumNivea.find(item => item.asin === candidato.asin)!;
    assert.ok(/nivea/i.test(produto.title) && /s(é|e)rum/i.test(produto.title), produto.title);
  }

  assert.equal(comFiltro.eligibleCount, 9);
});

test("§11 · a PÁGINA alimenta o ranking com os elegíveis, não com a corrida", async () => {
  /*
   * A função pode estar certa e não ser usada assim.
   *
   * O defeito nasce exatamente aqui: alguém passa `corrida.universe` para o
   * seletor porque é o campo que está à mão, e o filtro de elegibilidade fica
   * calculado e ignorado. A fiação é o que este teste protege.
   */
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  const chamadas = [...pagina.matchAll(/radarAmazonSelectCandidates\(\{[\s\S]{0,400}?\}\)/g)].map(item => item[0]);
  assert.ok(chamadas.length >= 2, `o seletor é chamado ${chamadas.length} vez(es)`);

  for (const chamada of chamadas) {
    assert.match(chamada, /universe: elegiveis\.eligible/, `o ranking recebeu o universo bruto: ${chamada.slice(0, 120)}`);
    assert.equal(/universe: corrida(Amazon)?\.universe/.test(chamada), false, "RAW_AS_RANKING_INPUT = NO");
  }

  /* E a elegibilidade é calculada a partir do alvo gravado, antes disso. */
  assert.match(pagina, /radarAmazonEligibleCandidates\(\{/);
  assert.match(pagina, /universe: corrida(Amazon)?\.universe,/, "o filtro é quem recebe o bruto");
});

/* ============ §18 e §19 · A CONFIGURAÇÃO CONGELA COM A COLETA ============ */

test("§18 e §19 · trocar o intent invalida a correspondência com a corrida", () => {
  const gravado = {
    intent: intencao("TOP_VALUE", { desiredCount: 6 }),
    target: alvo({ categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea" }),
  };

  assert.equal(radarAmazonSetupMatchesRun(gravado, gravado), true, "a mesma configuração corresponde");

  /*
   * TROCAR `TOP_VALUE` POR `TOP_BEST` sobre a MESMA coleta produzia um
   * blueprint novo sobre evidência velha — com a aparência de ter sido
   * pesquisado assim.
   */
  const outroIntent = { ...gravado, intent: intencao("TOP_BEST", { desiredCount: 6 }) };
  assert.equal(radarAmazonSetupMatchesRun(gravado, outroIntent), false, "CONFIG_FROZEN_AFTER_START");

  /* Mudar a classe comparada também muda a investigação. */
  const outraClasse = { ...gravado, target: alvo({ categoryQuery: "Serum Nivea", productClass: "creme", brandFilter: "Nivea" }) };
  assert.equal(radarAmazonSetupMatchesRun(gravado, outraClasse), false);

  /*
   * `desiredCount` NÃO É MATERIAL — e isso é uma decisão, não um esquecimento.
   *
   * Ele corta a shortlist e não muda nem a coleta nem a ordem. Invalidar a
   * corrida por causa dele cobraria uma coleta nova para encurtar uma lista.
   */
  const outraQuantidade = { ...gravado, intent: intencao("TOP_VALUE", { desiredCount: 10 }) };
  assert.equal(radarAmazonSetupMatchesRun(gravado, outraQuantidade), true, "quantidade não invalida evidência");

  /*
   * O INTENT VALE POR SI, e não só pelo critério que ele implica.
   *
   * "Top melhores, ordenado por custo-benefício" e "Top custo-benefício" podem
   * ranquear igual e produzem ARTIGOS diferentes (§30: promessa e estrutura
   * mudam). Se a assinatura olhasse só o critério, trocar um pelo outro
   * passaria batido e a tela mostraria outro artigo sobre a mesma evidência.
   */
  const melhoresPorValor = {
    intent: intencao("TOP_BEST", { desiredCount: 6, rankingCriteria: "VALUE_FOR_MONEY" }),
    target: gravado.target,
  };
  const valorPorValor = {
    intent: intencao("TOP_VALUE", { desiredCount: 6, rankingCriteria: "VALUE_FOR_MONEY" }),
    target: gravado.target,
  };
  assert.equal(
    radarAmazonSetupMatchesRun(melhoresPorValor, valorPorValor),
    false,
    "mesmo critério e intenção diferente continuam sendo investigações diferentes",
  );

  /* A assinatura é estável entre execuções. */
  assert.equal(radarAmazonSetupSignature(gravado), radarAmazonSetupSignature(gravado));
});

test("§18 · a UI congela a configuração quando existe coleta gravada", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const setup = await readFile(new URL("../modules/radar/radar-amazon-target-setup.tsx", import.meta.url), "utf8");

  assert.match(pagina, /const travado = Boolean\(gravado && corrida\)/, "o travamento vem da evidência gravada");
  assert.match(pagina, /if \(travado\) return doGravado/, "e o rascunho não vence a evidência");
  assert.match(setup, /if \(props\.locked && intent\)/, "a tela vira leitura");
  assert.match(setup, /data-testid="radar-amazon-setup-locked"/);
});

/* ============ §20 a §24 · O APOIO DO GOOGLE ============ */

test("§20 e §21 · o apoio usa o resumo canônico, e não monta um snapshot falso", async () => {
  const apoio = await readFile(new URL("../lib/server/radar-support-research.ts", import.meta.url), "utf8");
  const rota = await readFile(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");

  /*
   * O ERRO REAL, lido do banco:
   *
   *     snapshot.schemaVersion  Invalid input: expected 1
   *     snapshot.keyword        expected string, received undefined
   *     snapshot.location       expected string, received undefined
   *
   * O apoio montava `{ query, resultCount }` — plausível e inválido. O `parse`
   * estourava DEPOIS da chamada paga e do registro de uso, e ia inteiro para o
   * `catch` como "apoio falhou". O retry pagava de novo.
   */
  assert.equal(/snapshot: \{ query:/.test(apoio), false, "GOOGLE_SUPPORT_REQUEST_FIXED");
  assert.match(apoio, /snapshot: radarSerpSnapshotSummary\(research\)/);

  /* E é a MESMA função que a rota canônica do Google usa — não uma cópia. */
  assert.match(rota, /radarSerpSnapshotSummary/);
  const compartilhado = await readFile(new URL("../lib/radar/serp-snapshot-summary.ts", import.meta.url), "utf8");
  assert.match(compartilhado, /schemaVersion: 1/);
  assert.match(compartilhado, /keyword: research\.query/);
  assert.match(compartilhado, /location: research\.location/);
});

test("§22 · o retry do apoio pergunta o que o alvo manda, e não toca a Amazon", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8");
  /*
   * O CORPO DA FUNÇÃO, e não daqui até o fim do arquivo.
   *
   * `resolverProduto` vive logo abaixo e chama o provider legitimamente — uma
   * fatia aberta acusaria o retry pelo que o vizinho faz.
   */
  const inicio = rota.indexOf("async function repetirApoio");
  const proxima = rota.indexOf("\nasync function ", inicio + 1);
  const corpo = rota.slice(inicio, proxima > inicio ? proxima : undefined);

  /* §22 · GOOGLE_SUPPORT_RETRY_AMAZON_CALLS = 0. */
  assert.equal(/consultarProdutosAmazon\(/.test(corpo), false, "o retry não chama a Amazon");
  assert.equal(/startRadarAmazonRun\(/.test(corpo), false, "e não abre corrida");

  /*
   * E ele repete a MESMA pergunta: a consulta de apoio derivada do alvo
   * gravado. Cair nas `queries` faria o retry perguntar ao Google pela consulta
   * de prateleira ("Serum Nivea"), que é a pergunta da Amazon.
   */
  assert.match(corpo, /const consultaDeApoio = configuracaoGravada/);
  assert.match(corpo, /radarAmazonSupportQuery\(\{/);

  /* §22 · a consulta sobrevive à falha, para o retry não ficar cego. */
  assert.match(rota, /entrada\.apoio\?\.status === "FAILED" \? entrada\.apoio\.keyword : null/);
});

test("§23 e §24 · sucesso pago não vira falha, e há UM retry", async () => {
  /*
   * A VARREDURA IGNORA COMENTÁRIOS: descrever o defeito que foi corrigido é o
   * oposto de tê-lo de volta, e um teste que confundisse os dois empurraria a
   * explicação para fora do arquivo que ela explica.
   */
  const semComentarios = (fonte: string) =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  const painel = semComentarios(await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8"));
  const projecao = semComentarios(await readFile(new URL("../lib/radar/research-profile-state.ts", import.meta.url), "utf8"));
  const pacote = semComentarios(await readFile(new URL("../lib/radar/research-profile.ts", import.meta.url), "utf8"));

  /*
   * §23 · A coleta da Amazon aconteceu, custou e trouxe 59 produtos. A tela
   * dizia "apoio falhou" e a leitura foi que a pesquisa inteira falhou — o que
   * convida a um START novo, que cobra a prateleira outra vez.
   */
  assert.match(projecao, /PARTIAL_SUPPORT_FAILED: "Concluída · apoio pendente"/);
  assert.match(pacote, /PARTIAL_SUPPORT_FAILED: "Principal concluída · apoio pendente"/);
  assert.equal(/apoio falhou/.test(projecao), false, "PRIMARY_SUCCESS_SHOWN_AS_FAILURE = NO");

  /* §24 · DUPLICATE_SUPPORT_RETRY = NO. */
  const botoes = (painel.match(/onClick=\{\(\) => onRetrySupport\?\.\(\)\}/g) || []).length;
  assert.equal(botoes, 1, "uma ação de retry, e só uma");
});

/* ============ §16 · A UI DIZ OS TRÊS NÚMEROS ============ */

test("§16 e §17 · a tela para de chamar o universo bruto de comparável", async () => {
  const bruto = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
  /* De novo: o comentário que explica o defeito cita a frase por necessidade. */
  const painel = bruto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  assert.equal(/produto\(s\) compar(á|a)vel\(is\)/.test(painel), false, "a frase falsa não volta");
  assert.match(painel, /resultado\(s\) observado\(s\)/);
  assert.match(painel, /compat(í|i)vel\(is\) com o alvo/);
  assert.match(painel, /selecionado\(s\) para o artigo/);

  /* §17 · e a amostra grande é nomeada pelo que ela é: evidência. */
  assert.match(painel, /Universo observado na Amazon/);
});

test("PROVIDER_CALLS_DURING_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
