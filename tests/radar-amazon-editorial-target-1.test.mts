import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_AMAZON_EDITORIAL_INTENTS,
  RADAR_AMAZON_INTENT_REQUIREMENTS,
  radarAmazonAsinFromUrl,
  radarAmazonDedupeProducts,
  radarAmazonEmptyTargetFor,
  radarAmazonParseTargetInput,
  radarAmazonSupportQuery,
  radarAmazonTargetQueries,
  radarAmazonValidateSetup,
  RadarAmazonEditorialIntentSchema,
  RadarAmazonResearchTargetSchema,
  type RadarAmazonEditorialIntentType,
} from "../lib/radar/amazon-editorial-target.ts";
import { radarAmazonSelectCandidates } from "../lib/radar/amazon-candidate-selection.ts";
import { buildRadarAmazonQueryPlan } from "../lib/radar/amazon-search-run.ts";
import { buildRadarEditorialCommercialModel } from "../lib/radar/editorial-profile-model.ts";
import { buildDataForSeoAmazonRequest } from "../lib/server/dataforseo-amazon-operation.ts";
import type { RadarAmazonUniverseEntry } from "../lib/radar/amazon-search-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarAmazonBlueprint } from "../lib/radar/competitive-blueprint.ts";

/*
 * ===== AMAZON_EDITORIAL_TARGET_1 · O QUE O ARTICLEDNA NÃO RESPONDE =====
 *
 * `skin care nivea` é um território legítimo e uma instrução de pesquisa
 * péssima: cabe num review de um creme, num Nivea contra Neutrogena, num top 10
 * de óleos e num guia de compra. Cada um exige uma pesquisa, uma amostra e um
 * blueprint diferentes.
 *
 * Deixar a Amazon escolher implicitamente significava pagar uma coleta para
 * descobrir, depois, que ela tinha respondido outra pergunta.
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

const intencao = (type: RadarAmazonEditorialIntentType, patch: Record<string, unknown> = {}) =>
  RadarAmazonEditorialIntentSchema.parse({ type, ...patch });

const alvo = (patch: Record<string, unknown> = {}) =>
  RadarAmazonResearchTargetSchema.parse({ type: "SPECIFIC_PRODUCT", ...patch });

const produto = (input: string, asin: string | null, title: string | null = null) => ({
  input, inputType: "NAME" as const, resolvedAsin: asin, resolvedTitle: title, resolvedImageUrl: null,
});

/* ==================== A e B · O LOCALE DA MERCHANT ==================== */

test("A e B · Brazil Merchant recebe pt_BR, e nenhuma outra grafia atravessa", () => {
  /*
   * O DEFEITO REAL não era o separador: a configuração canônica entrega `"pt"`,
   * sem região, e a Merchant API recusa o idioma sem ela. A região vem do
   * `location_code` que o próprio pedido declara.
   */
  for (const entrada of ["pt", "pt-br", "pt-BR", "pt_BR"]) {
    const corpo = buildDataForSeoAmazonRequest({
      keyword: "óleo corporal", locationCode: 2076, languageCode: entrada,
      depth: 20, operationRequestId: "artigo:q1",
    }).body[0] as Record<string, unknown>;

    assert.equal(corpo.language_code, "pt_BR", entrada);
    assert.equal(corpo.location_code, 2076);
    assert.notEqual(corpo.language_code, "pt-BR");
    assert.notEqual(corpo.language_code, "pt-br");
  }
});

/* ============ C a K · A VALIDAÇÃO POR INTENÇÃO ============ */

test("C · PRODUCT_REVIEW exige exatamente 1 produto resolvido", () => {
  const vazio = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_REVIEW"),
    target: alvo({ type: "SPECIFIC_PRODUCT" }),
  });
  assert.equal(vazio.valid, false);
  assert.ok(vazio.blockedReason);

  const um = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_REVIEW"),
    target: alvo({ type: "SPECIFIC_PRODUCT", products: [produto("Nivea Óleo", "B01AAAAAAA")] }),
  });
  assert.equal(um.valid, true, um.issues.join(" | "));

  /* Dois produtos num review não é "mais informação": é outro artigo. */
  const dois = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_REVIEW"),
    target: alvo({ type: "SPECIFIC_PRODUCT", products: [produto("A", "B01AAAAAAA"), produto("B", "B02BBBBBBB")] }),
  });
  assert.equal(dois.valid, false);
});

test("D e E · X vs Y exige DOIS, e recusa o mesmo produto dos dois lados", () => {
  const umSo = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_VS_PRODUCT"),
    target: alvo({ type: "PRODUCT_PAIR", products: [produto("A", "B01AAAAAAA")] }),
  });
  assert.equal(umSo.valid, false, "um lado só não é comparação");

  const dois = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_VS_PRODUCT"),
    target: alvo({ type: "PRODUCT_PAIR", products: [produto("A", "B01AAAAAAA"), produto("B", "B02BBBBBBB")] }),
  });
  assert.equal(dois.valid, true, dois.issues.join(" | "));

  /*
   * E · O MESMO ASIN DOS DOIS LADOS.
   *
   * O dedupe sozinho reduziria a dois iguais a um, e a mensagem seria "falta um
   * produto" — verdadeira e inútil. O aviso olha a lista ORIGINAL para dizer o
   * que de fato aconteceu.
   */
  const repetido = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_VS_PRODUCT"),
    target: alvo({ type: "PRODUCT_PAIR", products: [produto("A", "B01AAAAAAA"), produto("A de novo", "B01AAAAAAA")] }),
  });
  assert.equal(repetido.valid, false);
  assert.ok(repetido.issues.some(item => /mais de uma vez|diferente/i.test(item)), repetido.issues.join(" | "));
});

test("F · PRODUCT_COMPARISON exige três ou mais", () => {
  const dois = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_COMPARISON"),
    target: alvo({ type: "PRODUCT_LIST", products: [produto("A", "B01AAAAAAA"), produto("B", "B02BBBBBBB")] }),
  });
  assert.equal(dois.valid, false, "dois produtos é X vs Y, e ele tem tipo próprio");

  const tres = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_COMPARISON"),
    target: alvo({ type: "PRODUCT_LIST", products: [produto("A", "B01AAAAAAA"), produto("B", "B02BBBBBBB"), produto("C", "B03CCCCCCC")] }),
  });
  assert.equal(tres.valid, true, tres.issues.join(" | "));
});

test("G, H, I, J e K · categoria, quantidade, necessidade e marca", () => {
  /*
   * G e H · os dois TOP pedem categoria, quantidade E tipo de produto.
   *
   * O `productClass` entrou no 1.1 · §5: a coleta real provou que consulta
   * sozinha não define universo comparável.
   */
  for (const tipo of ["TOP_BEST", "TOP_VALUE"] as const) {
    assert.equal(radarAmazonValidateSetup({
      intent: intencao(tipo, { desiredCount: 10 }),
      target: alvo({ type: "CATEGORY_DISCOVERY", productClass: "óleo corporal" }),
    }).valid, false, `${tipo} sem categoria`);

    assert.equal(radarAmazonValidateSetup({
      intent: intencao(tipo),
      target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal", productClass: "óleo corporal" }),
    }).valid, false, `${tipo} sem quantidade`);

    assert.equal(radarAmazonValidateSetup({
      intent: intencao(tipo, { desiredCount: 10 }),
      target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal", productClass: "óleo corporal" }),
    }).valid, true, `${tipo} completo`);
  }

  /* I · a necessidade é o que diferencia este ranking dos outros. */
  assert.equal(radarAmazonValidateSetup({
    intent: intencao("BEST_FOR_USE_CASE", { desiredCount: 10 }),
    target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal", productClass: "óleo corporal" }),
  }).valid, false, "sem necessidade não há 'melhores para'");

  assert.equal(radarAmazonValidateSetup({
    intent: intencao("BEST_FOR_USE_CASE", { desiredCount: 10, useCase: "pele seca" }),
    target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal", productClass: "óleo corporal" }),
  }).valid, true);

  /* J · o guia mapeia critérios: quantidade é opcional nele. */
  assert.equal(radarAmazonValidateSetup({
    intent: intencao("BUYING_GUIDE"),
    target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal" }),
  }).valid, true, "o guia não precisa de ranking");

  /* K · a linha precisa da marca. */
  assert.equal(radarAmazonValidateSetup({
    intent: intencao("BRAND_LINE_REVIEW"),
    target: alvo({ type: "BRAND_LINE" }),
  }).valid, false);
  assert.equal(radarAmazonValidateSetup({
    intent: intencao("BRAND_LINE_REVIEW"),
    target: alvo({ type: "BRAND_LINE", brand: "Nivea", line: "Óleos" }),
  }).valid, true);
});

test("§20 · um nome sem ASIN resolvido TRAVA o START", () => {
  /*
   * O CASO QUE MAIS PARECE PRONTO E NÃO ESTÁ.
   *
   * A pessoa digitou "Nivea óleo corporal" e o campo aceitou. Sem ASIN, a
   * pesquisa não sabe de qual SKU está falando — e deixá-la passar gastaria a
   * coleta sobre o produto que a loja achasse mais relevante, que é exatamente
   * a escolha automática que este gate removeu.
   */
  const soNome = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_REVIEW"),
    target: alvo({ type: "SPECIFIC_PRODUCT", products: [produto("Nivea óleo corporal", null)] }),
  });
  assert.equal(soNome.valid, false, "AMAZON_TARGET_VALIDATED = NO enquanto o nome não vira produto");
  assert.equal(soNome.pendingResolution.length, 1);
  assert.equal(soNome.resolvedProducts.length, 0);
  assert.ok(soNome.issues.some(item => /nome/i.test(item)), soNome.issues.join(" | "));

  /* E resolvido, o MESMO alvo passa. */
  const resolvido = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_REVIEW"),
    target: alvo({ type: "SPECIFIC_PRODUCT", products: [produto("Nivea óleo corporal", "B01AAAAAAA", "NIVEA Óleo Corporal")] }),
  });
  assert.equal(resolvido.valid, true, resolvido.issues.join(" | "));

  /* Num X vs Y, um lado resolvido e outro pendente também trava. */
  const meioResolvido = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_VS_PRODUCT"),
    target: alvo({ type: "PRODUCT_PAIR", products: [produto("A", "B01AAAAAAA"), produto("Neutrogena body oil", null)] }),
  });
  assert.equal(meioResolvido.valid, false);
  assert.equal(meioResolvido.pendingResolution.length, 1);

  /*
   * O CASO QUE O MÍNIMO SOZINHO NÃO PEGA — e é o que importa.
   *
   * Três produtos resolvidos satisfazem o mínimo do comparativo. A quarta linha
   * continua sendo um nome que não virou produto, e a pessoa acha que ela está
   * na comparação. Sem esta guarda, o START sairia com três — e o artigo
   * prometeria quatro.
   */
  const minimoAtingidoComPendente = radarAmazonValidateSetup({
    intent: intencao("PRODUCT_COMPARISON"),
    target: alvo({
      type: "PRODUCT_LIST",
      products: [
        produto("A", "B01AAAAAAA"), produto("B", "B02BBBBBBB"), produto("C", "B03CCCCCCC"),
        produto("Nivea óleo amêndoas", null),
      ],
    }),
  });
  assert.equal(minimoAtingidoComPendente.valid, false, "o mínimo foi atingido e ainda assim falta resolver uma linha");
  assert.equal(minimoAtingidoComPendente.resolvedProducts.length, 3);
  assert.equal(minimoAtingidoComPendente.pendingResolution.length, 1);
  assert.ok(
    minimoAtingidoComPendente.issues.some(item => /nome/i.test(item)),
    minimoAtingidoComPendente.issues.join(" | "),
  );
});

test("§17 · toda intenção tem exigência declarada, e o alvo vazio a respeita", () => {
  for (const tipo of RADAR_AMAZON_EDITORIAL_INTENTS) {
    const exigencia = RADAR_AMAZON_INTENT_REQUIREMENTS[tipo];
    assert.ok(exigencia, `${tipo} sem exigência declarada`);
    assert.equal(radarAmazonEmptyTargetFor(tipo).type, exigencia.target, `${tipo} monta o alvo dele`);
    /* E nenhuma começa válida: START desabilitado até a configuração fechar. */
    assert.equal(radarAmazonValidateSetup({
      intent: intencao(tipo), target: radarAmazonEmptyTargetFor(tipo),
    }).valid, false, `${tipo} nasceu válida sem ninguém configurar nada`);
  }
});

/* ============ L e M · A ENTRADA ============ */

test("L · a URL da Amazon resolve para ASIN, sem rede", () => {
  const formas = [
    "https://www.amazon.com.br/NIVEA-Oleo/dp/B08XYZ1234",
    "https://www.amazon.com.br/dp/B08XYZ1234?ref=sr_1_3",
    "https://www.amazon.com.br/gp/product/B08XYZ1234/",
    "https://www.amazon.com.br/gp/aw/d/B08XYZ1234",
  ];
  for (const url of formas) assert.equal(radarAmazonAsinFromUrl(url), "B08XYZ1234", url);

  /*
   * O QUE NÃO É ASIN NÃO VIRA ASIN.
   *
   * Uma varredura genérica por dez alfanuméricos pegaria o id de campanha do
   * `?ref=` e devolveria uma identidade que não existe — pior do que não
   * resolver, porque parece resolvida.
   */
  assert.equal(radarAmazonAsinFromUrl("https://www.amazon.com.br/s?k=oleo+nivea&ref=ABCDEFGHIJ"), null);
  assert.equal(radarAmazonAsinFromUrl("https://exemplo.com.br/produto"), null);

  const lidas = radarAmazonParseTargetInput(formas[0]);
  assert.equal(lidas[0].inputType, "URL");
  assert.equal(lidas[0].resolvedAsin, "B08XYZ1234");
});

test("M · a lista aceita URL, ASIN e nome, e deduplica por ASIN", () => {
  const entrada = [
    "https://www.amazon.com.br/x/dp/B08XYZ1234",
    "B08XYZ1234",
    "B09AAA5678",
    "NIVEA Óleo Corporal Firmador 200 ml",
    "",
    "NIVEA Óleo Corporal Firmador 200 ml",
  ].join("\n");

  const lidas = radarAmazonParseTargetInput(entrada);
  assert.equal(lidas.length, 3, `leu: ${lidas.map(item => item.input).join(" | ")}`);
  assert.deepEqual(lidas.map(item => item.inputType), ["URL", "ASIN", "NAME"]);
  assert.equal(lidas[0].resolvedAsin, "B08XYZ1234", "a URL e o ASIN dela são o MESMO produto");

  /*
   * UM NOME DE DEZ LETRAS NÃO É UM ASIN.
   *
   * Sem a exigência de dígito, "HIDRATANTE" entraria como identidade canônica
   * de um produto que ninguém escolheu.
   */
  assert.equal(radarAmazonParseTargetInput("HIDRATANTE")[0].inputType, "NAME");

  /* E o dedupe pós-resolução não deixa o mesmo ASIN ocupar duas vagas. */
  assert.equal(radarAmazonDedupeProducts([produto("A", "B01AAAAAAA"), produto("B", "B01AAAAAAA")]).length, 1);
});

/* ============ §21 e T · O PLANO E O APOIO SEGUEM O ALVO ============ */

test("§21 · a consulta sai do ALVO, não da keyword do artigo", () => {
  const review = buildRadarAmazonQueryPlan({
    articleId: "a", articleDnaVersionId: "v",
    primaryKeyword: "skin care nivea",
    setup: {
      intent: intencao("PRODUCT_REVIEW"),
      target: alvo({ type: "SPECIFIC_PRODUCT", products: [produto("Nivea Óleo Firmador", "B01AAAAAAA", "NIVEA Óleo Corporal Firmador 200ml")] }),
    },
  });
  assert.equal(review.queries.length, 1);
  assert.match(review.queries[0].text, /Firmador/, "o review pesquisa o produto, não a prateleira da marca");
  assert.equal(review.queries[0].text, "NIVEA Óleo Corporal Firmador 200ml");

  const top = buildRadarAmazonQueryPlan({
    articleId: "a", articleDnaVersionId: "v",
    primaryKeyword: "skin care nivea",
    setup: {
      intent: intencao("TOP_BEST", { desiredCount: 10 }),
      target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal nivea" }),
    },
  });
  assert.equal(top.queries[0].text, "óleo corporal nivea");

  /*
   * ALVO DECLARADO E INCOMPLETO NÃO CAI NA KEYWORD EM SILÊNCIO.
   *
   * Cair seria pesquisar outra coisa com a aparência de ter pesquisado a
   * pedida — e a pessoa só descobriria depois de pagar.
   */
  const incompleto = buildRadarAmazonQueryPlan({
    articleId: "a", articleDnaVersionId: "v",
    primaryKeyword: "skin care nivea",
    setup: { intent: intencao("TOP_BEST", { desiredCount: 10 }), target: alvo({ type: "CATEGORY_DISCOVERY" }) },
  });
  assert.equal(incompleto.queries.length, 0);
  assert.ok(incompleto.limitations.length);

  /* E sem alvo declarado, o comportamento anterior continua igual. */
  const legado = buildRadarAmazonQueryPlan({ articleId: "a", articleDnaVersionId: "v", primaryKeyword: "skin care nivea" });
  assert.equal(legado.queries[0].text, "skin care nivea");
});

test("T e §22 · o apoio do Google continua SUPPORT, e olha o mesmo alvo", () => {
  const vs = radarAmazonSupportQuery({
    intent: intencao("PRODUCT_VS_PRODUCT"),
    target: alvo({
      type: "PRODUCT_PAIR",
      products: [produto("A", "B01AAAAAAA", "Nivea Óleo"), produto("B", "B02BBBBBBB", "Neutrogena Body Oil")],
    }),
    primaryKeyword: "skin care nivea",
  });
  assert.equal(vs, "Nivea Óleo vs Neutrogena Body Oil", "é literalmente o que as pessoas digitam");

  assert.match(radarAmazonSupportQuery({
    intent: intencao("TOP_VALUE", { desiredCount: 10 }),
    target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal" }),
    primaryKeyword: "skin care nivea",
  })!, /custo benef/i);

  assert.match(radarAmazonSupportQuery({
    intent: intencao("BUYING_GUIDE"),
    target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal" }),
    primaryKeyword: "skin care nivea",
  })!, /como escolher/i);

  /* A keyword principal é a RESERVA — é a única coisa que sempre existe. */
  assert.equal(radarAmazonSupportQuery({
    intent: intencao("TOP_BEST", { desiredCount: 10 }),
    target: alvo({ type: "CATEGORY_DISCOVERY" }),
    primaryKeyword: "skin care nivea",
  }), "skin care nivea");

  /* E a derivação é DETERMINÍSTICA: a mesma configuração, a mesma consulta. */
  const config = {
    intent: intencao("BEST_FOR_USE_CASE", { desiredCount: 10, useCase: "pele seca" }),
    target: alvo({ type: "CATEGORY_DISCOVERY", categoryQuery: "óleo corporal" }),
    primaryKeyword: "x",
  };
  assert.equal(radarAmazonSupportQuery(config), radarAmazonSupportQuery(config));
});

/* ============ P e Q · TOP NÃO É "OS PRIMEIROS N" ============ */

const universo = (): RadarAmazonUniverseEntry[] => ([
  /* O primeiro da loja: barato, sem reputação nenhuma. */
  { asin: "B001", title: "Genérico barato", url: "u", imageUrl: null, domain: null, priceFrom: 12, currency: "BRL", offerText: [], ratingValue: 2.8, ratingVotes: 4, ratingMax: 5, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: null, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 1, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 },
  /* O sétimo: caro, bem avaliado, muito vendido. */
  { asin: "B007", title: "Premium consagrado", url: "u", imageUrl: null, domain: null, priceFrom: 189, currency: "BRL", offerText: [], ratingValue: 4.8, ratingVotes: 5200, ratingMax: 5, isAmazonChoice: true, isBestSeller: true, boughtPastMonth: 3000, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 7, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1", "q2"], occurrenceCount: 2 },
  /* O quarto: preço médio, reputação boa — o custo-benefício da prateleira. */
  { asin: "B004", title: "Intermediário equilibrado", url: "u", imageUrl: null, domain: null, priceFrom: 49, currency: "BRL", offerText: [], ratingValue: 4.6, ratingVotes: 1800, ratingMax: 5, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: 900, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 4, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 },
  /* Só patrocinado: pagou o slot, não ranqueou. */
  { asin: "B009", title: "Só anúncio", url: "u", imageUrl: null, domain: null, priceFrom: 30, currency: "BRL", offerText: [], ratingValue: null, ratingVotes: null, ratingMax: null, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: null, deliveryMessage: null, placements: ["SPONSORED"], bestOrganicRank: null, bestSponsoredRank: 1, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 },
] as unknown as RadarAmazonUniverseEntry[]);

test("P · TOP_BEST não é 'os primeiros N da Amazon'", () => {
  const selecao = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 3 }),
    universe: universo(),
    queryCount: 2,
  });

  const ordem = selecao.candidates.map(item => item.asin);
  assert.notDeepEqual(ordem, ["B001", "B007", "B004"], "a ordem da loja não é a ordem editorial");
  assert.notEqual(ordem[0], "B001", "o primeiro da loja tem nota 2,8 com 4 avaliações");
  assert.equal(ordem[0], "B007", "quem lidera é quem a evidência sustenta");

  /* E cada candidato diz POR QUE entrou — §24. */
  for (const candidato of selecao.candidates) assert.ok(candidato.supportingSignals.length, candidato.asin);
  assert.ok(selecao.criteriaStatements.length, "os critérios são declarados");
});

test("Q · TOP_VALUE não é 'os mais baratos'", () => {
  const selecao = radarAmazonSelectCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 3 }),
    universe: universo(),
    queryCount: 2,
  });

  assert.equal(selecao.criteria, "VALUE_FOR_MONEY");
  assert.notEqual(selecao.candidates[0]?.asin, "B001", "o mais barato tem nota 2,8 — não é custo-benefício");
  assert.equal(selecao.candidates[0]?.asin, "B004", "o equilíbrio entre preço e reputação lidera");

  /*
   * E O CRITÉRIO REALMENTE MUDA A LISTA.
   *
   * Sem isto, "melhores" e "custo-benefício" produziriam o mesmo artigo com
   * dois títulos diferentes.
   */
  const melhores = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 3 }), universe: universo(), queryCount: 2,
  });
  assert.notDeepEqual(
    selecao.candidates.map(item => item.asin),
    melhores.candidates.map(item => item.asin),
    "critério diferente, seleção diferente",
  );
});

test("§25 · a nota sozinha não é reputação, e o preço não zera o resto", () => {
  /*
   * CINCO ESTRELAS DE TRÊS AVALIAÇÕES vs 4,5 DE OITO MIL.
   *
   * A nota crua favorece sistematicamente o lançamento sem histórico. O volume
   * entra como PESO da nota, e não como desempate — se fosse desempate, o
   * primeiro só perderia em caso de empate exato, que nunca acontece.
   */
  const comVolume = [
    { asin: "B100", title: "Cinco estrelas de três pessoas", url: "u", imageUrl: null, domain: null, priceFrom: 50, currency: "BRL", offerText: [], ratingValue: 5, ratingVotes: 3, ratingMax: 5, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: null, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 2, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 },
    { asin: "B200", title: "Quatro e meio de oito mil", url: "u", imageUrl: null, domain: null, priceFrom: 50, currency: "BRL", offerText: [], ratingValue: 4.5, ratingVotes: 8000, ratingMax: 5, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: null, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 2, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 },
  ] as unknown as RadarAmazonUniverseEntry[];

  const porReputacao = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 2, rankingCriteria: "REPUTATION" }),
    universe: comVolume, queryCount: 1,
  });
  assert.equal(porReputacao.candidates[0]?.asin, "B200", "oito mil avaliações valem mais que três");

  /*
   * §25 · E O PREÇO NÃO PODE ZERAR A REPUTAÇÃO.
   *
   * Com custo-benefício valendo sozinho, o produto ruim e barato ganharia de
   * um excelente que custa um pouco mais — e o artigo recomendaria o item de
   * R$ 12 com nota 2,8, que é o defeito que §25 nomeia.
   */
  const precoContraNota = [
    { asin: "B300", title: "Ruim e barato", url: "u", imageUrl: null, domain: null, priceFrom: 10, currency: "BRL", offerText: [], ratingValue: 2.6, ratingVotes: 400, ratingMax: 5, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: 20, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 9, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 },
    { asin: "B400", title: "Ótimo e um pouco mais caro", url: "u", imageUrl: null, domain: null, priceFrom: 30, currency: "BRL", offerText: [], ratingValue: 4.8, ratingVotes: 4000, ratingMax: 5, isAmazonChoice: true, isBestSeller: true, boughtPastMonth: 2500, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 1, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1", "q2"], occurrenceCount: 2 },
  ] as unknown as RadarAmazonUniverseEntry[];

  const valor = radarAmazonSelectCandidates({
    intent: intencao("TOP_VALUE", { desiredCount: 2 }), universe: precoContraNota, queryCount: 2,
  });
  assert.equal(valor.candidates[0]?.asin, "B400", "custo-benefício não é 'o mais barato que existe'");
});

test("§23 · sinal ausente SAI da conta — ele não vira zero", () => {
  /*
   * TRATAR AUSÊNCIA COMO ZERO COROA DE GRAÇA o produto sobre o qual menos se
   * sabe: ele "perde" em tudo que não tem e, com peso renormalizado, o pouco
   * que tem passa a valer tudo.
   *
   * O inverso — somar o peso e deixar o valor zerado — rebaixa o produto por
   * uma informação que a loja não deu, e não por uma qualidade dele.
   */
  /*
   * O CRITÉRIO É POPULARIDADE, e é ele que torna a diferença observável: o
   * sinal ausente é justamente o de maior peso.
   *
   * EXCELENTE, sem sinal de compra informado — a loja não disse, e isso não é
   * um defeito do produto.
   */
  const excelenteSemCompra = { asin: "B500", title: "Excelente sem sinal de compra", url: "u", imageUrl: null, domain: null, priceFrom: 50, currency: "BRL", offerText: [], ratingValue: 4.9, ratingVotes: 9000, ratingMax: 5, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: null, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 1, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 };
  /* MEDIANO em tudo, e com todos os sinais presentes. */
  const medianoCompleto = { asin: "B600", title: "Mediano completo", url: "u", imageUrl: null, domain: null, priceFrom: 50, currency: "BRL", offerText: [], ratingValue: 3.5, ratingVotes: 100, ratingMax: 5, isAmazonChoice: false, isBestSeller: false, boughtPastMonth: 400, deliveryMessage: null, placements: ["ORGANIC"], bestOrganicRank: 5, bestSponsoredRank: null, occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1 };

  const selecao = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 2, rankingCriteria: "POPULARITY" }),
    universe: [excelenteSemCompra, medianoCompleto] as unknown as RadarAmazonUniverseEntry[],
    queryCount: 1,
  });

  /*
   * SE A AUSÊNCIA VIRASSE ZERO, o excelente perderia 55% do score por uma
   * informação que a loja não deu — e o mediano lideraria a lista.
   */
  assert.equal(selecao.candidates[0]?.asin, "B500", "o produto não é rebaixado por um dado que a loja não informou");

  const sem = selecao.candidates.find(item => item.asin === "B500")!;
  assert.ok(sem.missingSignals.length, "e o que faltou é DITO, não escondido");
  assert.ok(sem.supportingSignals.length >= 2, "o que ele TEM continua contando integralmente");
});

test("§23 e §24 · quem não trouxe sinal fica de fora, e 'melhores' exige evidência", () => {
  const selecao = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 10 }), universe: universo(), queryCount: 2,
  });

  /* O slot patrocinado sem nota não ocupa vaga de "selecionado por critério". */
  const soAnuncio = selecao.candidates.find(item => item.asin === "B009");
  assert.ok(!soAnuncio || soAnuncio.missingSignals.length, "o que só pagou o slot não entra como se tivesse ranqueado");

  /* Pediu 10 e a evidência deu menos: isso é dito, não preenchido. */
  assert.ok(selecao.limitations.some(item => /sustenta/i.test(item)), selecao.limitations.join(" | "));

  /*
   * §24 · "OS MELHORES" PRECISA DE REPUTAÇÃO REAL NA MAIORIA.
   *
   * Uma seleção sustentada por posição orgânica e nada mais está descrevendo a
   * vitrine da loja — e chamá-la de "as melhores" empresta ao algoritmo da
   * Amazon uma autoridade editorial que ele não tem.
   */
  const semReputacao = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 3 }),
    universe: universo().map(item => ({ ...item, ratingValue: null, ratingVotes: null })),
    queryCount: 2,
  });
  assert.equal(semReputacao.supportsSuperlative, false);
  assert.match(semReputacao.recommendedWording, /em destaque para comparar/i);
  assert.equal(/melhores/i.test(semReputacao.recommendedWording), false);
});

/* ============ N, O, R e S · O BLUEPRINT ============ */

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "m", articleId: "artigo-1", articleDnaVersionId: "dna-v1", articleDnaContentHash: "h",
    promise: "Skin care Nivea", mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "r" },
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "óleo corporal nivea" } }],
  editorialTopics: ["tipos de óleo corporal"],
  resolvedKeywordTexts: ["óleo corporal nivea"],
  silo: { siloId: "s", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const sinal = (id: string, statement: string, evidence: string) => ({
  id, statement, grade: "OBSERVED_SERP" as const, evidence, count: null,
});

const blueprintAmazon = (): RadarAmazonBlueprint => ({
  schemaVersion: 1, profile: "AMAZON", articleId: "artigo-1", articleDnaVersionId: "dna-v1",
  limitations: [
    "A coleta da prateleira não traz texto de avaliação: elogios e reclamações não foram observados.",
    "Benefícios e atributos do PDP não foram lidos nesta investigação.",
  ],
  observed: {
    products: 51,
    placementSignals: [sinal("p1", "Um produto aparece em orgânico e patrocinado", "3 posições")],
    priceSignals: [sinal("pr1", "Preço observado em 12/09/2026", "R$ 89,90")],
    ratingSignals: [sinal("r1", "Nota média 4,5 com 2.300 avaliações", "agregado")],
    purchaseSignals: [sinal("b1", "Amazon Choice em 3 produtos", "selo")],
    offerTextSignals: [], relatedSearchSignals: [sinal("s1", "sabonete", "relacionada")],
    googleSupport: [sinal("gs1", "comparações entre marcas", "3 resultados")],
    priceBands: [{ band: "ECONOMICA", observedValue: 39.9, currency: "BRL", observedAt: "2026-09-12", source: "listagem", sampleSize: 17, method: "Tercil inferior" }],
    sufficiency: "Amostra suficiente",
  },
  recommended: {
    offerDirection: [], positioning: null, priceBandDirection: "INTERMEDIARIA",
    comparisonStructure: [{ id: "c1", statement: "Comparar por faixa de preço", objective: "Dar critério de orçamento", sourceSignal: "Bandas" }],
    buyingGuideStructure: [{ id: "g1", statement: "Como escolher um óleo corporal", objective: "Organizar a decisão", sourceSignal: "Intenção" }],
    commercialArticleStructure: [{ id: "a1", statement: "Faixas de preço observadas", objective: "Situar o leitor", sourceSignal: "Bandas" }],
    ctaDirection: { id: "cta1", statement: "Levar o leitor a comparar", objective: "Fechar sem empurrar", sourceSignal: "Intenção" },
    googleSeoSupport: [{ id: "seo1", statement: "Cobrir buscas relacionadas", objective: "Cauda comercial", sourceSignal: "Relacionadas" }],
    supportState: "SUPPORT_OK",
    recommendedOutputs: [{ output: "ARTICLE_WITH_COMMERCIAL_SECTION", objective: "o", reason: "r", sourceSignals: ["s"] }],
    editorialAngle: { id: "ea1", statement: "Explicar antes de recomendar", objective: "o", sourceSignal: "s" },
    commercialAngle: { id: "ca1", statement: "Dar critério sem eleger vencedor", objective: "o", sourceSignal: "s" },
    differentiationDirection: [],
    titleDirections: [{ pattern: "Nomear o critério", objective: "o", sourceSignals: ["s"] }],
  },
} as unknown as RadarAmazonBlueprint);

const modelo = (tipo: RadarAmazonEditorialIntentType | null) => buildRadarEditorialCommercialModel({
  context: contexto(),
  blueprint: blueprintAmazon(),
  setup: tipo ? {
    intent: intencao(tipo, { desiredCount: tipo.startsWith("TOP") ? 10 : null, useCase: tipo === "BEST_FOR_USE_CASE" ? "pele seca" : null }),
    target: radarAmazonEmptyTargetFor(tipo),
    declaredAt: "2026-09-16T10:00:00.000Z",
    declaredBy: "ator",
  } : null,
});

test("O e §30 · a MESMA evidência com intents diferentes produz blueprints diferentes", () => {
  const formas = RADAR_AMAZON_EDITORIAL_INTENTS.map(tipo => ({
    tipo,
    assinatura: JSON.stringify({
      promessa: modelo(tipo).promise,
      blocos: modelo(tipo).blocks.map(bloco => bloco.heading),
    }),
  }));

  /*
   * O DEFEITO QUE ISTO FECHA: o modelo comercial concatenava guia, comparação e
   * artigo comercial na mesma ordem para qualquer artigo, porque nada lhe dizia
   * qual dos quatro estava sendo construído.
   */
  const distintas = new Set(formas.map(item => item.assinatura));
  assert.ok(distintas.size >= 4, `oito intenções produziram ${distintas.size} formas distintas`);

  const review = modelo("PRODUCT_REVIEW");
  const guia = modelo("BUYING_GUIDE");
  assert.notEqual(review.promise, guia.promise);
  assert.notDeepEqual(review.blocks.map(b => b.heading), guia.blocks.map(b => b.heading));

  /* E sem intenção declarada o modelo genérico continua existindo. */
  assert.ok(modelo(null).blocks.length, "investigação anterior ao gate continua legível");
});

test("R e S · nada de texto de review inventado, nem marca ou categoria fabricadas", () => {
  for (const tipo of RADAR_AMAZON_EDITORIAL_INTENTS) {
    const model = modelo(tipo);
    const texto = [
      model.promise, model.objective, model.workingTitle,
      ...model.blocks.map(bloco => `${bloco.heading} ${bloco.objective}`),
      ...model.derived.map(item => `${item.label} ${item.detail}`),
    ].join(" ").toLowerCase();

    /* R · a SERP da Amazon não tem texto de avaliação. */
    assert.equal(/opini(ã|a)o dos compradores|os compradores dizem|elogiam|reclamam/.test(texto), false, `${tipo}: ${texto.slice(0, 200)}`);
    /* S · nem ficha de marca nem taxonomia de categoria. */
    assert.equal(/fabricado por|marca oficial|categoria oficial/.test(texto), false, tipo);

    /* E a limitação continua VISÍVEL, não de rodapé. */
    assert.ok(model.limitations.some(item => /avalia(ç|c)(ã|a)o/i.test(item)), `${tipo} perdeu a limitação de review`);
  }
});

test("N e §29 · o ArticleDNA é o núcleo, e o intent não o redefine", () => {
  for (const tipo of RADAR_AMAZON_EDITORIAL_INTENTS) {
    const model = modelo(tipo);
    assert.equal(model.articleIdentity.articleId, "artigo-1");
    assert.equal(model.articleIdentity.articleDnaVersionId, "dna-v1");
    assert.equal(model.articleIdentity.principalKeyword, "óleo corporal nivea", `${tipo} mexeu na keyword principal`);
    assert.equal(model.articleIdentity.intentLabel, "Informacional", `${tipo} mexeu na intenção do Arquiteto`);
    assert.equal(model.articleIdentity.siloRole, "SUPORTE");
  }

  /*
   * E MUDAR A INTENÇÃO NÃO MUDA A IDENTIDADE — só a forma comercial.
   *
   * É a diferença entre "que artigo estamos construindo" e "qual artigo existe".
   * A segunda pergunta continua sendo do Arquiteto.
   */
  const identidades = RADAR_AMAZON_EDITORIAL_INTENTS.map(tipo => JSON.stringify(modelo(tipo).articleIdentity));
  assert.equal(new Set(identidades).size, 1, "oito formas comerciais, uma identidade de artigo");
});

test("§0 e §29 · o contrato do Arquiteto não conhece o alvo da Amazon", async () => {
  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(
    /amazonEditorialSetup|AmazonEditorialIntent|AmazonResearchTarget|resolvedAsin/.test(arquiteto),
    false,
    "ARTICLE_DNA_MUTATED = NO",
  );

  /* E o alvo vive no payload da análise do Radar, que é jsonb — sem DDL. */
  const contratos = await readFile(new URL("../lib/radar/analysis-contracts.ts", import.meta.url), "utf8");
  assert.match(contratos, /amazonEditorialSetup: RadarAmazonEditorialSetupSchema\.nullable\(\)\.default\(null\)/);
});

/* ============ U, V e W · O GASTO ============ */

test("U e V · primária falha não roda apoio, e o retry do apoio não repaga a Amazon", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8");

  assert.match(rota, /const primariaOk = gravada\.run\.state === "COLLECTED"/);
  assert.match(rota, /const apoio = primariaOk\s*\r?\n?\s*\?\s*await collectRadarGoogleSupport/);

  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const inicio = pagina.indexOf("const retryAmazonSupport");
  const corpo = pagina.slice(inicio, inicio + 2500);
  assert.match(corpo, /action: "retry-support"/);
  assert.equal(/action: "collect"/.test(corpo), false, "o retry nunca manda a intenção de coletar");

  /*
   * §22 · E O APOIO OLHA O ALVO — no caminho REAL, não só na função pura.
   *
   * `radarAmazonSupportQuery` pode estar perfeita e não ser chamada por
   * ninguém: foi assim que o apoio passou a perguntar pela keyword do artigo
   * numa investigação sobre outro produto. A fiação é o que este teste protege.
   */
  assert.match(rota, /const principal = input\.editorialSetup\s*\r?\n?\s*\?\s*radarAmazonSupportQuery\(\{/,
    "GOOGLE_SUPPORT_TARGET_AWARE = SIM");
  assert.equal((rota.match(/collectRadarGoogleSupport\(/g) || []).length, 2, "uma no START, uma no retry — GOOGLE_SUPPORT_CALLS = 1 por pacote");
});

test("§2, §17 e §20 · quem recusa a configuração incompleta é o SERVIDOR", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8");

  /*
   * O BOTÃO DESABILITADO É CONFORTO DE TELA.
   *
   * Um pedido montado à mão — ou uma aba com estado velho — continuaria
   * pagando uma coleta sobre um `X vs Y` com um produto só. A regra do §17
   * roda no servidor, e roda ANTES do START: antes da corrida `COLLECTING`,
   * antes da reserva de cota e muito antes do provider.
   */
  const ondeValida = rota.indexOf("radarAmazonValidateSetup(input.editorialSetup)");
  const ondeStart = rota.indexOf("await startRadarAmazonRun({");
  const ondeProvider = rota.indexOf("consultarProdutosAmazon(");

  assert.ok(ondeValida > 0, "o servidor valida a configuração");
  assert.ok(ondeValida < ondeStart, "e valida ANTES de abrir a corrida");
  assert.ok(ondeStart < ondeProvider, "que por sua vez vem antes do provider");
  assert.match(rota, /code: "radar_amazon_target_invalid"/);
  assert.match(rota, /\{ status: 422, headers: noStoreHeaders \}/, "recusa com código próprio, não com 500");

  /* §18 · e a configuração aceita é gravada junto da corrida que ela originou. */
  const start = await readFile(new URL("../lib/server/radar-amazon-start.ts", import.meta.url), "utf8");
  assert.match(start, /amazonEditorialSetup: \{/, "INTENT_PERSISTED e TARGET_PERSISTED");
  const ondeCorrida = start.indexOf("amazonSearch: run,");
  const ondeSetup = start.indexOf("amazonEditorialSetup: {");
  const ondeGrava = start.indexOf("ports.appendAnalysis(");
  assert.ok(ondeCorrida < ondeSetup && ondeSetup < ondeGrava, "na MESMA versão, numa escrita só");
});

test("W e §20 · nenhum provider dispara no mount, no F5 ou ao digitar", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const setup = await readFile(new URL("../modules/radar/radar-amazon-target-setup.tsx", import.meta.url), "utf8");

  /*
   * A RESOLUÇÃO POR NOME CUSTA UMA CONSULTA, e ela sai porque alguém clicou.
   *
   * Um `useEffect` que resolvesse ao digitar cobraria uma busca por tecla — e o
   * usuário descobriria na fatura.
   */
  assert.equal(/useEffect[\s\S]{0,400}resolve-product/.test(pagina), false, "PROVIDER_AUTO_RUNS = 0");
  assert.equal(/fetch\(/.test(setup), false, "o componente de configuração não fala com a rede");
  assert.match(setup, /onResolveName/, "a resolução é uma ação com botão próprio");
  assert.match(pagina, /const resolverProdutoAmazon = async/, "e ela é explícita");

  /* A leitura de URL e ASIN é de FORMA: ela não precisa de rede nenhuma. */
  assert.match(setup, /radarAmazonParseTargetInput/);
});

test("X · o rótulo 'em construção' saiu com a engine construída", async () => {
  const modos = await readFile(new URL("../lib/radar/search-mode.ts", import.meta.url), "utf8");
  assert.match(modos, /AMAZON: "available"/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
