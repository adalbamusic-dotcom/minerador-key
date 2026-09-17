import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { radarAmazonEligibleCandidates } from "../lib/radar/amazon-eligibility.ts";
import { radarAmazonSelectCandidates } from "../lib/radar/amazon-candidate-selection.ts";
import { buildRadarEditorialCommercialModel } from "../lib/radar/editorial-profile-model.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";
import {
  RADAR_AMAZON_PRODUCT_CLASS_ISSUE,
  RadarAmazonEditorialIntentSchema,
  RadarAmazonResearchTargetSchema,
  radarAmazonSetupSignature,
  radarAmazonValidateSetup,
  type RadarAmazonEditorialIntentType,
} from "../lib/radar/amazon-editorial-target.ts";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { RadarProfileBlueprintSection } from "../modules/radar/radar-profile-blueprint.tsx";
import type { RadarAmazonUniverseEntry } from "../lib/radar/amazon-search-model.ts";

/*
 * ===== AMAZON_EDITORIAL_TARGET_1.2 · FIDELIDADE DE INTENÇÃO =====
 *
 * ==================== O DEFEITO, PELA TERCEIRA VEZ ====================
 *
 * O gerador do blueprint comercial escreve INSTRUÇÕES:
 *
 *     Incluir a coluna "Faixa de preço" na comparação.
 *     Reservar seção comercial explícita, separada da parte informativa.
 *
 * Elas eram coladas como H2 do artigo e como faceta do título, produzindo:
 *
 *     Sérum nivea: incluir a coluna "faixa de preço" na comparação
 *
 * É a MESMA classe de defeito que o Google corrigiu no 1.1 (telemetria como
 * objetivo) e o YouTube no 2.1 (nome de bloco no título): mostrar a engenharia
 * da decisão no lugar do produto dela.
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
  RadarAmazonResearchTargetSchema.parse({
    type: "CATEGORY_DISCOVERY",
    categoryQuery: "Serum Nivea", productClass: "sérum", brandFilter: "Nivea",
    ...patch,
  });

const contexto = () => ({
  state: "COMPLETE",
  article: {
    brandId: "m", articleId: "artigo-1", articleDnaVersionId: "dna-v1", articleDnaContentHash: "h",
    promise: "Sérum Nivea", mainIntent: "comercial", hierarchy: "Suporte",
    classification: { intent: "COMMERCIAL_INVESTIGATION", intentLabel: "Investigação comercial", funnel: "MIDDLE", funnelLabel: "Meio", reason: "r" },
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "sérum nivea" } }],
  editorialTopics: ["tipos de sérum"],
  resolvedKeywordTexts: ["sérum nivea"],
  silo: { siloId: "s", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
}) as unknown as Parameters<typeof buildRadarEditorialCommercialModel>[0]["context"];

/**
 * O BLUEPRINT COM AS INSTRUÇÕES REAIS DO GERADOR.
 *
 * `amazon-editorial.ts` produz literalmente `Incluir a coluna "..." na
 * comparação.` — uma fixture com frases simpáticas não provaria nada.
 */
const blueprintComercial = () => ({
  schemaVersion: 1, profile: "AMAZON", articleId: "artigo-1", articleDnaVersionId: "dna-v1",
  limitations: ["A coleta da prateleira não traz texto de avaliação."],
  observed: {
    products: 59, placementSignals: [], priceSignals: [], ratingSignals: [], purchaseSignals: [],
    offerTextSignals: [], relatedSearchSignals: [], googleSupport: [], priceBands: [],
    sufficiency: "Amostra suficiente",
  },
  recommended: {
    offerDirection: [], positioning: null, priceBandDirection: "INTERMEDIARIO",
    comparisonStructure: [
      { id: "amz-comp-price_band", statement: 'Incluir a coluna "Faixa de preço" na comparação.', objective: "Situar cada opção na prateleira.", sourceSignal: "amz-preco-faixa" },
      { id: "amz-comp-rating", statement: 'Incluir a coluna "Nota de avaliação" na comparação.', objective: "Mostrar como compradores avaliaram.", sourceSignal: "amz-nota" },
    ],
    buyingGuideStructure: [
      { id: "amz-guia", statement: "Abrir com critério de escolha antes de apresentar opções.", objective: "Entregar decisão, não catálogo.", sourceSignal: "amz-preco-faixa" },
    ],
    commercialArticleStructure: [
      { id: "amz-comercial", statement: "Reservar seção comercial explícita, separada da parte informativa.", objective: "Atender a intenção de compra.", sourceSignal: "amz-saida" },
    ],
    ctaDirection: { id: "cta1", statement: "Levar o leitor a comparar", objective: "Fechar", sourceSignal: "Intenção" },
    googleSeoSupport: [], supportState: "APPLIED",
    /* A análise acha que a prateleira parece um comparativo — §7 em ação. */
    recommendedOutputs: [{ output: "COMPARISON", objective: "o", reason: "r", sourceSignals: ["s"] }],
    editorialAngle: { id: "ea1", statement: "Explicar antes de recomendar", objective: "o", sourceSignal: "s" },
    commercialAngle: { id: "ca1", statement: "Dar critério", objective: "o", sourceSignal: "s" },
    differentiationDirection: [], titleDirections: [{ pattern: "Nomear o critério", objective: "o", sourceSignals: ["s"] }],
  },
}) as unknown as Parameters<typeof buildRadarEditorialCommercialModel>[0]["blueprint"];

function modelo(tipo: RadarAmazonEditorialIntentType, desiredCount: number | null, patchAlvo: Record<string, unknown> = {}, universo = REAIS.serumNivea) {
  const intent = intencao(tipo, { desiredCount });
  const target = patchAlvo.type ? RadarAmazonResearchTargetSchema.parse(patchAlvo) : alvo(patchAlvo);
  const eligibility = radarAmazonEligibleCandidates({ intent, target, universe: universo });
  const selection = radarAmazonSelectCandidates({
    intent, universe: eligibility.eligible, observedCount: eligibility.rawCount, queryCount: 1,
  });

  return buildRadarEditorialCommercialModel({
    context: contexto(),
    blueprint: blueprintComercial(),
    setup: { intent, target, declaredAt: "2026-09-16T10:00:00.000Z", declaredBy: "ator" },
    selection, eligibility, universe: universo,
  });
}

/* ============ A e B · A VALIDAÇÃO DO ALVO ============ */

test("A e B · TOP_BEST com marca sozinha é inválido; com tipo de produto passa", () => {
  const soMarca = radarAmazonValidateSetup({
    intent: intencao("TOP_BEST", { desiredCount: 10 }),
    target: alvo({ productClass: null, brandFilter: "Nivea" }),
  });
  assert.equal(soMarca.valid, false, "A · marca sozinha não satisfaz productClass");
  assert.ok(soMarca.issues.includes(RADAR_AMAZON_PRODUCT_CLASS_ISSUE));

  const completo = radarAmazonValidateSetup({
    intent: intencao("TOP_BEST", { desiredCount: 10 }),
    target: alvo({ productClass: "sérum", brandFilter: "Nivea" }),
  });
  assert.equal(completo.valid, true, completo.issues.join(" | "));
});

/* ============ C e D · A SHORTLIST SUFICIENTE ============ */

test("C · sem candidato compatível, o ranking é BLOQUEADO e diz como corrigir", () => {
  /*
   * A CONFIGURAÇÃO QUE NÃO ENCONTRA NADA: o universo real é de sérum Nivea, e o
   * alvo pede "shampoo". Zero compatíveis — e "desodorante" NÃO serve para este
   * teste: o universo real tem "NIVEA Hidratante Desodorante Beleza Radiante".
   */
  const model = modelo("TOP_BEST", 10, { productClass: "shampoo", brandFilter: "Nivea" });

  assert.equal(model.shortlistStatus.state, "BLOCKED");
  assert.equal(model.shortlistStatus.available, 0);
  assert.ok(model.shortlistStatus.message, "o bloqueio é dito");
  assert.ok(model.shortlistStatus.fixHint, "e ele diz o que fazer");
  assert.match(model.shortlistStatus.fixHint!, /tipo de produto|marca|alvo/i);

  /*
   * §12 · e sem shortlist válida não há link de afiliado nenhum.
   *
   * Isto é estrutural, não um guarda: o plano nasce da shortlist, e `BLOCKED`
   * só existe quando ela está vazia.
   */
  assert.equal(model.promotionLinks.length, 0, "links para um ranking vazio apontariam para nada");
  assert.equal(model.affiliateDisclosureRequired, false);

  /* E um PARCIAL continua gerando links: o artigo é menor, e ele existe. */
  const parcial = modelo("TOP_BEST", 20);
  assert.equal(parcial.shortlistStatus.state, "PARTIAL");
  assert.ok(parcial.promotionLinks.length > 0, "o parcial não é um bloqueio");
});

test("§5 · o SERVIDOR recusa analisar um ranking sem candidato compatível", async () => {
  /*
   * A recusa da tela é conforto; o que protege o dado é o servidor.
   *
   * Sem esta guarda, ANALYZE gravaria um blueprint de ranking com lista vazia —
   * e ele ficaria com a mesma aparência de um completo, pronto para FINALIZE.
   */
  const analise = await readFile(new URL("../lib/server/radar-amazon-analyze.ts", import.meta.url), "utf8");

  assert.match(analise, /radarAmazonEligibleCandidates\(\{/, "a análise conhece a elegibilidade");
  assert.match(analise, /code: "amazon_no_eligible_candidates"|"amazon_no_eligible_candidates"/);
  assert.match(analise, /if \(!compativeis\.eligible\.length\) \{/, "e o vazio é recusado");

  /* A recusa acontece ANTES de qualquer gravação. */
  const ondeRecusa = analise.indexOf("amazon_no_eligible_candidates");
  const ondeGrava = analise.indexOf("createRadarAnalysisSuccessor", ondeRecusa);
  assert.ok(ondeRecusa > 0 && ondeGrava > ondeRecusa, "recusar depois de gravar não recusa nada");

  /* E as formas que não prometem ranking passam — um guia não tem shortlist. */
  assert.match(analise, /exigeRanking = intencao === "TOP_BEST" \|\| intencao === "TOP_VALUE" \|\| intencao === "BEST_FOR_USE_CASE"/);
});

test("D · com menos compatíveis do que o pretendido, o parcial é explícito", () => {
  /*
   * O universo real sustenta 9 sérum Nivea. Pedir 20 não inventa 20.
   */
  const model = modelo("TOP_BEST", 20);

  assert.equal(model.shortlistStatus.state, "PARTIAL");
  assert.equal(model.shortlistStatus.desired, 20);
  assert.ok(model.shortlistStatus.available > 0 && model.shortlistStatus.available < 20);
  assert.match(model.shortlistStatus.message!, /Apenas \d+ produto\(s\) compat/i);

  /* §4 · e o parcial sobe para as limitações, onde quem assina o artigo lê. */
  assert.ok(
    model.limitations.some(item => /apenas \d+ produto/i.test(item)),
    model.limitations.join(" | "),
  );

  /* Pedir o que a evidência sustenta continua OK. */
  assert.equal(modelo("TOP_BEST", 5).shortlistStatus.state, "OK");
});

/* ============ E · A INTENÇÃO SOBREVIVE ============ */

test("E e §7 · a intenção declarada não vira COMPARISON porque a análise achou", () => {
  /*
   * A fixture do blueprint traz `recommendedOutputs: [PRODUCT_COMPARISON]` de
   * propósito — é a análise discordando da pessoa. Quem manda é a pessoa.
   */
  assert.equal(modelo("TOP_BEST", 5).editorialOutput, "TOP_BEST");
  assert.equal(modelo("TOP_VALUE", 5).editorialOutput, "TOP_VALUE");
  assert.equal(modelo("BUYING_GUIDE", null).editorialOutput, "BUYING_GUIDE");

  /* Sem intenção declarada, a análise continua respondendo — comportamento antigo. */
  const semAlvo = buildRadarEditorialCommercialModel({
    context: contexto(), blueprint: blueprintComercial(),
  });
  assert.equal(semAlvo.editorialOutput, "COMPARISON");
});

test("E e §6 · a intenção original é congelada com a fotografia", () => {
  const intent = intencao("TOP_VALUE", { desiredCount: 6 });
  const target = alvo();
  const corrida = {
    runId: "run-1", runVersion: 1, state: "COLLECTED" as const,
    fingerprint: { articleId: "artigo-1", articleDnaVersionId: "dna-v1", queryIds: ["q"], signature: "amzf:abc" },
    provenance: { provider: "dataforseo", endpoint: "/e", collectedAt: "2026-09-15T00:00:00.000Z", languageCode: "pt_BR", queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [], locationCode: 2076, seDomain: "amazon.com.br", depth: 20 },
    queries: [{ queryId: "q", text: "Serum Nivea", origin: "PRIMARY_KEYWORD", reason: "r", executed: true, resultCount: 59, failureReason: null, checkUrl: null, seResultsCount: null, itemsCount: null }],
    results: [], universe: REAIS.serumNivea, relatedSearches: [], limitations: [],
  } as never;

  /* O congelamento valida o blueprint inteiro: ele precisa da proveniência. */
  const blueprintCompleto = {
    ...blueprintComercial(),
    researchRefs: [],
    provenance: { generatedAt: "2026-09-15T12:00:00.000Z", frozenAt: null },
  } as never;

  const fotografia = freezeRadarAmazonInvestigation({
    run: corrida,
    blueprint: blueprintCompleto,
    finalizedBy: "ator",
    finalizedAt: "2026-09-16T00:00:00.000Z",
    setup: { intent, target },
  });

  assert.ok(fotografia.originalEditorialIntent, "a fotografia sabe que artigo ela sustenta");
  assert.equal(fotografia.originalEditorialIntent!.type, "TOP_VALUE");
  assert.equal(fotografia.originalEditorialIntent!.desiredCount, 6);
  assert.equal(fotografia.originalEditorialIntent!.productClass, "sérum");
  assert.equal(fotografia.originalEditorialIntent!.brandFilter, "Nivea");
  assert.equal(fotografia.originalEditorialIntent!.setupSignature, radarAmazonSetupSignature({ intent, target }));

  /* Sem configuração, a ausência é a verdade — não uma intenção inventada. */
  const legado = freezeRadarAmazonInvestigation({
    run: corrida, blueprint: blueprintCompleto,
    finalizedBy: "ator", finalizedAt: "2026-09-16T00:00:00.000Z",
  });
  assert.equal(legado.originalEditorialIntent, null);
});

/* ============ F e G · TÍTULO E CABEÇALHOS ============ */

test("F e §9 · o título é de artigo, nunca uma instrução de montagem", () => {
  const proibidas = [/incluir a coluna/i, /^comparar por/i, /adicionar/i, /reservar se(ç|c)(ã|a)o/i, /abrir com crit(é|e)rio/i];

  for (const tipo of ["TOP_BEST", "TOP_VALUE", "BEST_FOR_USE_CASE", "PRODUCT_COMPARISON", "BUYING_GUIDE", "BRAND_LINE_REVIEW"] as const) {
    const model = modelo(tipo, tipo.startsWith("TOP") || tipo === "BEST_FOR_USE_CASE" ? 5 : null, tipo === "BEST_FOR_USE_CASE" ? { } : {});
    for (const padrao of proibidas) {
      assert.equal(padrao.test(model.workingTitle), false, `${tipo}: título operacional — ${model.workingTitle}`);
    }
    assert.equal(model.workingTitle.includes('"'), false, `${tipo}: aspas de instrução no título — ${model.workingTitle}`);
    assert.ok(model.workingTitle.length > 5);
  }

  /* E o título diz o que o artigo é. */
  assert.match(modelo("TOP_VALUE", 6).workingTitle, /custo-benef(í|i)cio/i);
  assert.match(modelo("BUYING_GUIDE", null).workingTitle, /como escolher/i);
});

test("G e §10 · critério de comparação é metadado, e não vira cabeçalho", () => {
  const model = modelo("TOP_BEST", 5);

  /* §10 · o critério existe, como metadado da comparação. */
  assert.deepEqual(model.comparisonCriteria, ["Faixa de preço", "Nota de avaliação"]);

  /* E nenhum cabeçalho é a instrução que o gerou. */
  for (const bloco of model.blocks) {
    assert.equal(/incluir a coluna/i.test(bloco.heading), false, `instrução como H2: ${bloco.heading}`);
    assert.equal(/reservar se(ç|c)(ã|a)o/i.test(bloco.heading), false, bloco.heading);
    assert.equal(/abrir com crit(é|e)rio/i.test(bloco.heading), false, bloco.heading);
  }

  /*
   * A INSTRUÇÃO NÃO SUMIU: ela virou OBJETIVO, que é o campo dela.
   */
  const objetivos = model.blocks.map(bloco => bloco.objective).join(" | ");
  assert.ok(objetivos.length > 40, "os blocos continuam dizendo o que resolver");
});

test("§10 · uma instrução SEM aspas também não vira critério", () => {
  /*
   * O gerador não promete aspas para sempre. Uma instrução sem elas —
   * "Comparar por faixa de preço antes de listar" — precisa ser recusada pelo
   * que ela É, e não pela ausência do delimitador.
   *
   * Sem esta guarda, a tabela do artigo ganharia uma coluna chamada
   * "Comparar por faixa de preço antes de listar".
   */
  const semAspas = {
    ...blueprintComercial(),
    recommended: {
      ...blueprintComercial().recommended,
      comparisonStructure: [
        { id: "a", statement: "Comparar por faixa de preço antes de listar.", objective: "o", sourceSignal: "s" },
        { id: "b", statement: "Adicionar a nota de avaliação na tabela.", objective: "o", sourceSignal: "s" },
        /* Este JÁ é um rótulo: curto, sem verbo de instrução. Ele passa. */
        { id: "c", statement: "Volume de avaliações", objective: "o", sourceSignal: "s" },
      ],
    },
  } as unknown as Parameters<typeof buildRadarEditorialCommercialModel>[0]["blueprint"];

  const intent = intencao("TOP_BEST", { desiredCount: 5 });
  const target = alvo();
  const eligibility = radarAmazonEligibleCandidates({ intent, target, universe: REAIS.serumNivea });
  const model = buildRadarEditorialCommercialModel({
    context: contexto(), blueprint: semAspas,
    setup: { intent, target, declaredAt: "2026-09-16T10:00:00.000Z", declaredBy: "ator" },
    selection: radarAmazonSelectCandidates({ intent, universe: eligibility.eligible, observedCount: eligibility.rawCount, queryCount: 1 }),
    eligibility, universe: REAIS.serumNivea,
  });

  assert.deepEqual(model.comparisonCriteria, ["Volume de avaliações"], `critérios: ${model.comparisonCriteria.join(" | ")}`);
  for (const criterio of model.comparisonCriteria) {
    assert.equal(/^(comparar|adicionar|incluir|reservar|abrir)/i.test(criterio), false, `instrução como critério: ${criterio}`);
  }
});

/* ============ §11 · A ESTRUTURA DEPENDE DA INTENÇÃO ============ */

test("§11 · cada intenção produz as seções que ela promete", () => {
  const cabecalhos = (tipo: RadarAmazonEditorialIntentType, count: number | null) =>
    modelo(tipo, count).blocks.map(bloco => bloco.heading.toLowerCase()).join(" | ");

  const top = cabecalhos("TOP_BEST", 5);
  assert.match(top, /como selecionamos/);
  assert.match(top, /compara(ç|c)(ã|a)o resumida/);
  assert.match(top, /op(ç|c)(õ|o)es selecionadas/);
  assert.match(top, /para quem cada op(ç|c)(ã|a)o faz sentido/);
  assert.match(top, /conclus(ã|a)o/);

  const valor = cabecalhos("TOP_VALUE", 5);
  assert.match(valor, /como avaliamos custo-benef(í|i)cio/);
  assert.match(valor, /faixas de pre(ç|c)o/);

  /* E as duas formas NÃO produzem a mesma estrutura. */
  assert.notEqual(top, valor);

  const versus = modelo("PRODUCT_VS_PRODUCT", null, {
    type: "PRODUCT_PAIR",
    products: REAIS.serumNivea.slice(0, 2).map(item => ({
      input: item.title, inputType: "ASIN" as const,
      resolvedAsin: item.asin, resolvedTitle: item.title, resolvedImageUrl: null,
    })),
  }).blocks.map(bloco => bloco.heading.toLowerCase()).join(" | ");
  assert.match(versus, /compara(ç|c)(ã|a)o por crit(é|e)rios/);
  assert.match(versus, /para quem cada um faz sentido/);
  assert.match(versus, /nivea/, "os dois lados são os produtos escolhidos");
});

/* ============ §8 · A PROMESSA RECUA; A FORMA NÃO ============ */

test("§8 · sem reputação suficiente, o título recua sem trocar a intenção", () => {
  const semReputacao = REAIS.serumNivea.map(item => ({ ...item, ratingValue: null, ratingVotes: null }));
  const model = modelo("TOP_BEST", 5, {}, semReputacao as RadarAmazonUniverseEntry[]);

  /* §7 · a intenção continua sendo a declarada. */
  assert.equal(model.editorialOutput, "TOP_BEST");
  /* §8 · e a palavra recua. */
  assert.equal(/melhores/i.test(model.workingTitle), false, `título superlativo sem evidência: ${model.workingTitle}`);
  assert.match(model.workingTitle, /comparar|destaque/i);

  /* Com reputação real, o superlativo volta. */
  assert.match(modelo("TOP_BEST", 5).workingTitle, /melhores/i);
});

/* ============ H · LINKS ============ */

test("H · shortlist válida de 6 produz 6 links", () => {
  const model = modelo("TOP_VALUE", 6);
  assert.equal(model.shortlistStatus.state, "OK");
  assert.equal(model.promotionLinks.length, 6);
});

/* ============ I e J · A LEITURA DA TELA ============ */

test("I · o bruto é dito como observado, nunca como comparável", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
  const semComentarios = painel.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  assert.match(semComentarios, /resultado\(s\) observado\(s\)/);
  assert.equal(/produto\(s\) compar(á|a)vel\(is\)/.test(semComentarios), false);
});

test("J e §14 · o painel legado não mostra 0/0 do Google sobre um apoio que funcionou", async () => {
  const detalhes = await readFile(new URL("../modules/radar/radar-r3-research-details.tsx", import.meta.url), "utf8");

  /*
   * Estes números descrevem o PIPELINE do Google — consultas canônicas,
   * auxiliares, referências curadas. Num perfil Amazon eles são zero por
   * construção: o Google entra como APOIO, uma consulta só, sem curadoria.
   *
   * A tela dizia "0 consultas · 0 referências" dentro da evidência de uma
   * investigação cujo apoio do Google tinha acabado de funcionar.
   */
  assert.match(detalhes, /\{houvePipelineDoGoogle && <div className=\{bloco\} data-testid="radar-research-details-collection">/);

  /*
   * A CONDIÇÃO PRECISA REALMENTE CONDICIONAR.
   *
   * `const houvePipelineDoGoogle = true || ...` satisfaz qualquer varredura por
   * nome e não muda nada na tela. O que este teste lê é a EXPRESSÃO: ela
   * consulta os três contadores e não tem curto-circuito constante.
   */
  const inicio = detalhes.indexOf("const houvePipelineDoGoogle =");
  assert.ok(inicio > 0, "a condição existe");
  const expressao = detalhes.slice(inicio, detalhes.indexOf(";", inicio));
  assert.equal(/\btrue\b|\bfalse\b/.test(expressao), false, `curto-circuito constante: ${expressao}`);
  assert.match(expressao, /queriesExecuted > 0/);
  assert.match(expressao, /uniqueReferences > 0/);
  assert.match(expressao, /selectedReferences > 0/);
});

test("§4, §5 e §10 · a tela mostra o parcial, o bloqueio e os critérios", async () => {
  const bloqueado = modelo("TOP_BEST", 10, { productClass: "shampoo", brandFilter: "Nivea" });
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarProfileBlueprintSection, { model: bloqueado }));

  const aviso = tela.get("radar-profile-shortlist-status");
  assert.ok(aviso, "o bloqueio aparece na tela");
  assert.equal(aviso.getAttribute("data-state"), "BLOCKED");
  assert.ok(tela.get("radar-profile-shortlist-fix"), "e a tela diz como corrigir");
  tela.destroy();

  const parcial = modelo("TOP_BEST", 20);
  const tela2 = await montarRadar();
  await tela2.render(React.createElement(RadarProfileBlueprintSection, { model: parcial }));
  assert.equal(tela2.get("radar-profile-shortlist-status").getAttribute("data-state"), "PARTIAL");
  assert.match(tela2.get("radar-profile-shortlist-status").textContent || "", /Apenas \d+/);

  /* §10 · e os critérios aparecem como critérios, não como seção. */
  const criterios = tela2.get("radar-profile-comparison-criteria");
  assert.match(criterios.textContent || "", /Faixa de preço/);
  assert.equal(/incluir a coluna/i.test(criterios.textContent || ""), false);
  tela2.destroy();
});

test("GOOGLE_CHANGED = NO e ARTICLE_DNA_MUTATED = NO", async () => {
  /*
   * A MARCA PRECISA SER DESTE GATE, e não "1.2" solto: o próprio Google teve um
   * gate 1.2 (RADAR_EDITORIAL_BLUEPRINT_1.2), e as marcas dele estão lá por
   * direito. Uma varredura frouxa acusaria o arquivo pela própria história.
   */
  const google = await readFile(new URL("../lib/radar/editorial-article-model.ts", import.meta.url), "utf8");
  assert.equal(/AMAZON_EDITORIAL_TARGET|amazonEditorialSetup|productClass/.test(google), false,
    "a síntese do Google não recebeu ajuste deste gate");

  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(
    /originalEditorialIntent|comparisonCriteria|shortlistStatus|productClass|brandFilter/.test(arquiteto),
    false,
    "ARTICLE_DNA_MUTATED = NO",
  );
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
