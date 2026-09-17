import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  RADAR_AMAZON_REL_POLICY,
  buildRadarAmazonPromotionPlan,
  radarAmazonCleanProductUrl,
} from "../lib/radar/amazon-promotion-links.ts";
import { radarAmazonEligibleCandidates } from "../lib/radar/amazon-eligibility.ts";
import { radarAmazonSelectCandidates } from "../lib/radar/amazon-candidate-selection.ts";
import {
  RadarAmazonEditorialIntentSchema,
  RadarAmazonResearchTargetSchema,
  type RadarAmazonEditorialIntentType,
} from "../lib/radar/amazon-editorial-target.ts";
import { buildRadarEditorialCommercialModel } from "../lib/radar/editorial-profile-model.ts";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { RadarProfileBlueprintSection } from "../modules/radar/radar-profile-blueprint.tsx";
import type { RadarAmazonUniverseEntry } from "../lib/radar/amazon-search-model.ts";

/*
 * ===== AMAZON_PROMOTION_LINK_PLAN_1 · OS LINKS SAEM DA SHORTLIST =====
 *
 * ==================== A COLETA REAL, DE NOVO ====================
 *
 * O mesmo universo de 59 produtos lido do banco. Cada URL veio com ~700
 * caracteres de rastreamento de busca, e doze delas nem são URLs de produto —
 * são `sspa/click`, o redirecionador de anúncio.
 *
 * Publicar isso amarraria o link do artigo à sessão de busca que o encontrou:
 * `qid` é um timestamp e `sr=8-7` é a posição daquele dia.
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

const alvoDescoberta = (patch: Record<string, unknown> = {}) =>
  RadarAmazonResearchTargetSchema.parse({
    type: "CATEGORY_DISCOVERY",
    categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea",
    ...patch,
  });

/** A cadeia inteira: bruto → elegíveis → shortlist → plano de links. */
function planoDe(tipo: RadarAmazonEditorialIntentType, desiredCount: number | null, patchAlvo: Record<string, unknown> = {}) {
  const intent = intencao(tipo, { desiredCount });
  const target = patchAlvo.type ? RadarAmazonResearchTargetSchema.parse(patchAlvo) : alvoDescoberta(patchAlvo);

  const elegiveis = radarAmazonEligibleCandidates({ intent, target, universe: REAIS.serumNivea });
  const selection = radarAmazonSelectCandidates({
    intent, universe: elegiveis.eligible, observedCount: elegiveis.rawCount, queryCount: 1,
  });

  return {
    elegiveis,
    selection,
    plano: buildRadarAmazonPromotionPlan({ intent: tipo, selection, universe: REAIS.serumNivea }),
  };
}

/* ============ A, B e E · A QUANTIDADE VEM DA SHORTLIST ============ */

test("A, B e E · o número de links é o da shortlist, nunca o do universo bruto", () => {
  /*
   * O NÚMERO QUE IMPORTA. Gerar link para o bruto produziria 59 endereços de
   * afiliado num artigo que apresenta 6 produtos — e 53 apontariam para coisas
   * que o texto não menciona.
   */
  const seis = planoDe("TOP_VALUE", 6);
  assert.equal(seis.elegiveis.rawCount, 59);
  assert.equal(seis.selection.candidates.length, 6);
  assert.equal(seis.plano.links.length, 6, "E · raw 59 / shortlist 6 → 6 links");
  assert.notEqual(seis.plano.links.length, 59);

  /* A · TOP 10 pede dez — e só entrega o que a evidência sustenta. */
  const dez = planoDe("TOP_BEST", 10);
  assert.equal(dez.plano.links.length, dez.selection.candidates.length);
  assert.ok(dez.plano.links.length <= 10, `links: ${dez.plano.links.length}`);

  /* B · TOP 5 entrega cinco. */
  const cinco = planoDe("TOP_BEST", 5);
  assert.equal(cinco.selection.candidates.length, 5);
  assert.equal(cinco.plano.links.length, 5, "B · TOP 5 → 5 links");

  /* §3 · e o plano diz de onde veio, com os três números. */
  assert.deepEqual(seis.plano.source, { observed: 59, eligible: 9, shortlist: 6 });
});

test("C e D · review pede um link, X vs Y pede dois", () => {
  const produtos = REAIS.serumNivea.slice(0, 2).map(item => ({
    input: item.title, inputType: "ASIN" as const,
    resolvedAsin: item.asin, resolvedTitle: item.title, resolvedImageUrl: null,
  }));

  /* D · review: exatamente 1. */
  const review = planoDe("PRODUCT_REVIEW", null, { type: "SPECIFIC_PRODUCT", products: [produtos[0]] });
  assert.equal(review.plano.links.length, 1, "D · review → 1 link");
  assert.equal(review.plano.links[0].asin, produtos[0].resolvedAsin);

  /* C · X vs Y: exatamente 2, um por lado. */
  const versus = planoDe("PRODUCT_VS_PRODUCT", null, { type: "PRODUCT_PAIR", products: produtos });
  assert.equal(versus.plano.links.length, 2, "C · X vs Y → 2 links");
  assert.match(versus.plano.links[0].placement, /lado A/i);
  assert.match(versus.plano.links[1].placement, /lado B/i);

  /*
   * §2 · O TETO DA FORMA VALE MESMO COM SHORTLIST MAIOR.
   *
   * Um review cuja seleção trouxesse contexto competitivo continua sendo um
   * review de UM produto: o segundo link prometeria um artigo que não existe.
   */
  const seleçãoGrande = radarAmazonSelectCandidates({
    intent: intencao("TOP_BEST", { desiredCount: 6 }),
    universe: radarAmazonEligibleCandidates({
      intent: intencao("TOP_BEST", { desiredCount: 6 }), target: alvoDescoberta(), universe: REAIS.serumNivea,
    }).eligible,
    queryCount: 1,
  });
  const forcado = buildRadarAmazonPromotionPlan({
    intent: "PRODUCT_REVIEW", selection: seleçãoGrande, universe: REAIS.serumNivea,
  });
  assert.equal(forcado.links.length, 1, "o review não vira lista de compras");

  /* §2 · o guia de compra indica poucos: até cinco. */
  const guia = buildRadarAmazonPromotionPlan({
    intent: "BUYING_GUIDE", selection: seleçãoGrande, universe: REAIS.serumNivea,
  });
  assert.ok(guia.links.length <= 5, `guia entregou ${guia.links.length} links`);
});

/* ============ F e G · CADA LINK APONTA PARA UM SELECIONADO ============ */

test("F e G · todo link é de um ASIN selecionado, e o excluído não recebe nenhum", () => {
  const { elegiveis, selection, plano } = planoDe("TOP_VALUE", 6);

  const selecionados = new Set(selection.candidates.map(item => item.asin));
  for (const link of plano.links) {
    assert.ok(selecionados.has(link.asin), `F · link para ASIN fora da shortlist: ${link.asin}`);
  }

  /*
   * G · O PRODUTO EXCLUÍDO NÃO RECEBE LINK.
   *
   * Dove Sérum e NIVEA Creme para Mãos estão no universo real e ficaram fora da
   * elegibilidade. Um link para eles venderia o que o artigo não avaliou.
   */
  const excluidos = new Set(elegiveis.excluded.map(item => item.asin));
  for (const link of plano.links) {
    assert.equal(excluidos.has(link.asin), false, `G · link para produto excluído: ${link.productName}`);
  }

  const dove = REAIS.serumNivea.find(item => /^Dove/i.test(item.title));
  const cremeMaos = REAIS.serumNivea.find(item => /Creme para M(ã|a)os/i.test(item.title));
  assert.ok(dove && cremeMaos, "a coleta real tem os dois casos");
  for (const fora of [dove!, cremeMaos!]) {
    assert.equal(plano.links.some(link => link.asin === fora.asin), false, fora.title.slice(0, 50));
  }

  /* E todo link carrega nome de produto legível. */
  for (const link of plano.links) {
    assert.ok(link.productName.length > 5);
    assert.ok(link.suggestedAnchor.length > 5);
    assert.ok(link.suggestedAnchor.length <= 80, `âncora longa demais: ${link.suggestedAnchor}`);
  }
});

test("§7 · a âncora é o nome do produto, e não a ficha técnica", () => {
  const { plano } = planoDe("TOP_VALUE", 6);

  /*
   * OS TÍTULOS REAIS DA AMAZON carregam a ficha inteira depois da vírgula:
   *
   *   "NIVEA Q10 Sérum Antissinais Expert Dupla Ação 30ml, Previne e Reduz
   *    Rugas, Renova a Pele"
   *
   * Nada depois da primeira vírgula é âncora. Truncar em 80 caracteres o título
   * inteiro daria "…30ml, Previne e Reduz" — metade de uma frase de marketing
   * no meio do texto do artigo.
   */
  const comFicha = plano.links.filter(link => link.productName.includes(","));
  assert.ok(comFicha.length >= 3, `a coleta real tem títulos com ficha: ${comFicha.length}`);

  for (const link of comFicha) {
    const antesDaVirgula = link.productName.split(",")[0].trim();
    assert.equal(link.suggestedAnchor, antesDaVirgula, `a ficha técnica vazou para a âncora: ${link.suggestedAnchor}`);
    assert.equal(link.suggestedAnchor.includes(","), false, "a âncora não carrega vírgula de ficha");
  }
});

/* ============ H e I · A URL ============ */

test("H · a URL de busca e o sspa/click não atravessam; a URL limpa é construída do ASIN", () => {
  /*
   * A URL REAL, verbatim da coleta: ~700 caracteres de rastreamento de sessão.
   */
  const comRastreamento = REAIS.serumNivea.find(item => /ref=sr_1_/.test(item.url || ""));
  assert.ok(comRastreamento, "a coleta real tem URL de busca");
  assert.ok((comRastreamento!.url || "").length > 300, "e ela é enorme");

  const limpa = radarAmazonCleanProductUrl(comRastreamento!.asin, comRastreamento!.url);
  assert.equal(limpa, `https://www.amazon.com.br/dp/${comRastreamento!.asin}`);
  for (const lixo of ["ref=sr_", "crid=", "dib=", "qid=", "sprefix", "&sr=", "keywords="]) {
    assert.equal(limpa.includes(lixo), false, `${lixo} atravessou`);
  }

  /* E o redirecionador de anúncio também não atravessa. */
  const sspa = REAIS.serumNivea.find(item => /sspa\/click/.test(item.url || ""));
  assert.ok(sspa, "a coleta real tem sspa/click");
  const limpaSspa = radarAmazonCleanProductUrl(sspa!.asin, sspa!.url);
  assert.equal(limpaSspa.includes("sspa/click"), false, "H · sspa/click não é preferida");
  assert.equal(limpaSspa, `https://www.amazon.com.br/dp/${sspa!.asin}`);

  /* O domínio observado é preservado: um `.com` fixo mandaria para outra loja. */
  assert.match(radarAmazonCleanProductUrl("B0TESTE123", "https://www.amazon.com/dp/B0TESTE123?ref=x"), /^https:\/\/www\.amazon\.com\/dp\//);
  /* URL ilegível não impede o link — o ASIN basta. */
  assert.equal(radarAmazonCleanProductUrl("B0TESTE123", "nao-e-url"), "https://www.amazon.com.br/dp/B0TESTE123");

  /* E o plano inteiro só carrega URL limpa. */
  const { plano } = planoDe("TOP_VALUE", 6);
  for (const link of plano.links) {
    assert.match(link.amazonUrl, /^https:\/\/[^/]*amazon\.[^/]+\/dp\/[A-Z0-9]{10}$/, link.amazonUrl);
  }
});

test("I e J · o Radar não cria tag de afiliado, e a política de rel viaja pronta", () => {
  const { plano } = planoDe("TOP_VALUE", 6);

  for (const link of plano.links) {
    /*
     * I · AFFILIATE_TAG_CREATED_IN_RADAR = NO.
     *
     * O Radar guarda o endereço normal do produto. Quem troca por URL de
     * afiliado é o Redator — e o ASIN atravessa a troca intacto, que é o que
     * torna a substituição segura.
     */
    for (const marca of ["tag=", "linkCode", "linkId", "associate", "ascsubtag", "_encoding=UTF8&tag"]) {
      assert.equal(link.amazonUrl.includes(marca), false, `${marca} apareceu na URL`);
    }
    assert.equal(link.affiliateReady, true, "AFFILIATE_READY = YES");

    /* J · REL_POLICY. */
    assert.equal(link.relPolicy, "sponsored nofollow");
    assert.equal(link.relPolicy, RADAR_AMAZON_REL_POLICY);
    assert.equal(/\bugc\b/.test(link.relPolicy), false, "ugc mentiria sobre a origem do link");
    assert.equal(/^follow$/.test(link.relPolicy), false, "follow puro passaria autoridade a destino pago");
  }

  /* §9 · e a exigência de divulgação viaja com o plano. */
  assert.equal(plano.affiliateDisclosureRequired, true, "AFFILIATE_DISCLOSURE_REQUIRED = YES");

  /* Sem link nenhum, não há exigência: carimbá-la ensinaria a ignorá-la. */
  const vazio = buildRadarAmazonPromotionPlan({
    intent: "TOP_BEST",
    selection: { ...planoDe("TOP_BEST", 5).selection, candidates: [] },
    universe: REAIS.serumNivea,
  });
  assert.equal(vazio.links.length, 0);
  assert.equal(vazio.affiliateDisclosureRequired, false);
});

test("§1 e §5 · o Radar não guarda tag em lugar nenhum do módulo", async () => {
  const fonte = await readFile(new URL("../lib/radar/amazon-promotion-links.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  assert.equal(/tag=|linkCode|associate|affiliateUrl\s*=/.test(semComentarios), false, "nenhuma tag de afiliado no código");
  assert.match(fonte, /affiliateReady: z\.literal\(true\)/);
  assert.match(fonte, /relPolicy: z\.literal\(RADAR_AMAZON_REL_POLICY\)/);
});

/* ============ §7 · FORMATO ============ */

test("§7 · o formato recomendado acompanha a forma do artigo", () => {
  const ranking = planoDe("TOP_BEST", 5);
  for (const link of ranking.plano.links) {
    assert.equal(link.linkFormat, "BUTTON", "numa lista, dez âncoras viram parágrafo azul");
    assert.equal(link.suggestedButtonLabel, "Ver preço na Amazon");
  }

  const produtos = REAIS.serumNivea.slice(0, 1).map(item => ({
    input: item.title, inputType: "ASIN" as const,
    resolvedAsin: item.asin, resolvedTitle: item.title, resolvedImageUrl: null,
  }));
  const review = planoDe("PRODUCT_REVIEW", null, { type: "SPECIFIC_PRODUCT", products: produtos });
  assert.equal(review.plano.links[0].linkFormat, "TEXT_LINK", "no corpo do review, o nome lê melhor que um botão");

  /* As duas aplicações são sempre recomendadas: quem compõe é o Planejador. */
  for (const link of [...ranking.plano.links, ...review.plano.links]) {
    assert.ok(link.suggestedAnchor.length > 0 && link.suggestedButtonLabel.length > 0);
  }
});

/* ============ §6 e K · A LEITURA E O ARTICLEDNA ============ */

test("§6 · a tela mostra produto, lugar e sugestão — sem parâmetro técnico", async () => {
  const tela = await readFile(new URL("../modules/radar/radar-profile-blueprint.tsx", import.meta.url), "utf8");

  assert.match(tela, /data-testid="radar-profile-promotion-links"/);
  assert.match(tela, /Links de produtos/);
  assert.match(tela, /link\.placement/);
  assert.match(tela, /link\.suggestedAnchor/);

  /* §6 · a URL e o ASIN existem no dado e não competem com a leitura. */
  const bloco = tela.slice(tela.indexOf("radar-profile-promotion-links"), tela.indexOf("radar-profile-seo"));
  assert.equal(/link\.amazonUrl/.test(bloco), false, "a URL não é mostrada na leitura normal");
  assert.equal(/link\.asin[^)]/.test(bloco.replace(/key=\{link\.asin\}/g, "")), false, "o ASIN é chave de render, não conteúdo");

  /* §9 · e o aviso de afiliado é declarado, sem ser redigido aqui. */
  assert.match(tela, /data-testid="radar-profile-affiliate-disclosure"/);
  assert.match(tela, /sponsored nofollow/);
});

/* ============ A FIAÇÃO REAL: MODELO COMERCIAL E TELA ============ */

const contexto = () => ({
  state: "COMPLETE",
  article: {
    brandId: "m", articleId: "artigo-1", articleDnaVersionId: "dna-v1", articleDnaContentHash: "h",
    promise: "Sérum Nivea", mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "COMMERCIAL_INVESTIGATION", intentLabel: "Investigação comercial", funnel: "MIDDLE", funnelLabel: "Meio", reason: "r" },
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "sérum nivea" } }],
  editorialTopics: ["tipos de sérum"],
  resolvedKeywordTexts: ["sérum nivea"],
  silo: { siloId: "s", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
}) as unknown as Parameters<typeof buildRadarEditorialCommercialModel>[0]["context"];

const sinal = (id: string, statement: string, evidence: string) =>
  ({ id, statement, grade: "OBSERVED_SERP" as const, evidence, count: null });

const blueprintComercial = () => ({
  schemaVersion: 1, profile: "AMAZON", articleId: "artigo-1", articleDnaVersionId: "dna-v1",
  limitations: ["A coleta da prateleira não traz texto de avaliação."],
  observed: {
    products: 59, placementSignals: [], priceSignals: [], ratingSignals: [], purchaseSignals: [],
    offerTextSignals: [], relatedSearchSignals: [], googleSupport: [], priceBands: [],
    sufficiency: "Amostra suficiente",
  },
  recommended: {
    offerDirection: [], positioning: null, priceBandDirection: "INTERMEDIARIA",
    comparisonStructure: [{ id: "c1", statement: "Comparar por faixa de preço", objective: "Critério de orçamento", sourceSignal: "Bandas" }],
    buyingGuideStructure: [{ id: "g1", statement: "Como escolher um sérum", objective: "Organizar a decisão", sourceSignal: "Intenção" }],
    commercialArticleStructure: [{ id: "a1", statement: "Faixas observadas", objective: "Situar o leitor", sourceSignal: "Bandas" }],
    ctaDirection: { id: "cta1", statement: "Levar o leitor a comparar", objective: "Fechar", sourceSignal: "Intenção" },
    googleSeoSupport: [], supportState: "SUPPORT_OK",
    recommendedOutputs: [{ output: "ARTICLE_WITH_COMMERCIAL_SECTION", objective: "o", reason: "r", sourceSignals: ["s"] }],
    editorialAngle: { id: "ea1", statement: "Explicar antes de recomendar", objective: "o", sourceSignal: "s" },
    commercialAngle: { id: "ca1", statement: "Dar critério", objective: "o", sourceSignal: "s" },
    differentiationDirection: [], titleDirections: [{ pattern: "Nomear o critério", objective: "o", sourceSignals: ["s"] }],
  },
  ...{},
}) as unknown as Parameters<typeof buildRadarEditorialCommercialModel>[0]["blueprint"];

function modeloComercialReal(desiredCount = 6) {
  const intent = intencao("TOP_VALUE", { desiredCount });
  const target = alvoDescoberta();
  const elegiveis = radarAmazonEligibleCandidates({ intent, target, universe: REAIS.serumNivea });
  const selection = radarAmazonSelectCandidates({
    intent, universe: elegiveis.eligible, observedCount: elegiveis.rawCount, queryCount: 1,
  });

  return buildRadarEditorialCommercialModel({
    context: contexto(),
    blueprint: blueprintComercial(),
    setup: { intent, target, declaredAt: "2026-09-16T10:00:00.000Z", declaredBy: "ator" },
    selection,
    eligibility: elegiveis,
    universe: REAIS.serumNivea,
  });
}

test("§1 · o MODELO COMERCIAL carrega o plano — não só a função avulsa", () => {
  /*
   * A função pode estar certa e não ser chamada.
   *
   * Este é o caminho que a tela realmente usa: `buildRadarEditorialCommercialModel`
   * monta o plano a partir da seleção que recebeu. Sem esta verificação, o
   * módulo inteiro poderia estar correto e desligado.
   */
  const model = modeloComercialReal(6);

  assert.equal(model.promotionLinks.length, 6, "PROMOTION_LINK_COUNT");
  assert.equal(model.affiliateDisclosureRequired, true);
  for (const link of model.promotionLinks) {
    assert.match(link.amazonUrl, /^https:\/\/www\.amazon\.com\.br\/dp\/[A-Z0-9]{10}$/);
    assert.equal(link.relPolicy, "sponsored nofollow");
  }

  /* E a quantidade acompanha a shortlist, não um número fixo. */
  assert.equal(modeloComercialReal(3).promotionLinks.length, 3);
});

test("§6 · a seção de links RENDERIZA, e sem parâmetro técnico na tela", async () => {
  const model = modeloComercialReal(6);
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarProfileBlueprintSection, { model }));

  const secao = tela.get("radar-profile-promotion-links");
  assert.ok(secao, "a seção existe na tela");

  const texto = secao.textContent || "";
  assert.match(texto, /Links de produtos · 6/);
  for (const link of model.promotionLinks) {
    assert.ok(texto.includes(link.suggestedAnchor), `faltou o produto: ${link.suggestedAnchor}`);
  }

  /* §6 · a URL e o ASIN não competem com a leitura. */
  assert.equal(/amazon\.com\.br\/dp\//.test(texto), false, "a URL apareceu na leitura normal");
  for (const link of model.promotionLinks) {
    assert.equal(texto.includes(link.asin), false, `o ASIN apareceu na tela: ${link.asin}`);
  }

  /* §9 · e a exigência de aviso é dita. */
  assert.ok(tela.get("radar-profile-affiliate-disclosure"), "o aviso de afiliado é declarado");

  tela.destroy();
});

test("K · o ArticleDNA não é alterado por nada disto", async () => {
  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(
    /promotionLinks|affiliateReady|affiliateUrl|relPolicy|amazonUrl/.test(arquiteto),
    false,
    "ARTICLE_DNA_MUTATED = NO",
  );

  /* §9 · o handoff carrega a exigência, e ele não é o ArticleDNA. */
  const handoff = await readFile(new URL("../lib/radar/planner-handoff.ts", import.meta.url), "utf8");
  assert.match(handoff, /affiliateDisclosureRequired: boolean;/);
});

test("§3 · o perfil de VÍDEO não ganha links de prateleira", async () => {
  const modelo = await readFile(new URL("../lib/radar/editorial-profile-model.ts", import.meta.url), "utf8");
  assert.match(modelo, /O roteiro de v(í|i)deo não leva o leitor à prateleira/);
  assert.match(modelo, /promotionLinks: \[\],/);
});

test("PROVIDER_CALLS_DURING_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
