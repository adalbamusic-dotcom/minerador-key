import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import { amazonCompetitiveBlueprintOfAnalysis, radarAmazonBlueprintBaseOf, radarAmazonBlueprintNeedsNewBase } from "../lib/radar/amazon-editorial.ts";
import { radarAmazonEligibleCandidates } from "../lib/radar/amazon-eligibility.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";
import { buildRadarAmazonBlueprintCards } from "../lib/radar/amazon-observed.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import { radarAmazonFrozenCommercialBlock, radarPortableCommercialOf } from "../lib/radar/amazon-commercial-block.ts";
import { radarAmazonCommercialSkeleton } from "../lib/radar/editorial-profile-model.ts";

/*
 * ===== 2026-10-09 · AMAZON PELO PROCESSO DO PILOTO =====
 *
 * Regra do dono: o processo antigo é substituído pelo do piloto, e o
 * congelamento é sagrado.
 *
 *   1. a parte comercial (produtos, links, aviso de afiliado, recusa sem
 *      produto) sai da Amazon congelada em QUALQUER perfil — o Google com a
 *      Amazon como review também a recebe; projeção, fora do pacote e do hash;
 *   2. blueprint, cards, faixas e critérios sobre os COMPATÍVEIS com o alvo,
 *      só no congelamento novo — o antigo mantém hash e leitura (valores
 *      dourados medidos ANTES da mudança, com o código de então);
 *   3. o esqueleto genérico da forma comercial vira matéria-prima do gerador do
 *      artigo-modelo, num bloco puro com a Amazon congelada.
 *
 * Fixture real (DataForSEO, "protetor solar facial", 51 produtos); sem rede.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("rede proibida neste teste"));
  },
  writable: true, configurable: true,
});

const sha = (valor: unknown) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

/* Medidos com o código de ANTES desta rodada (2026-10-09), sobre a mesma fixture. */
const DOURADO = {
  blueprint: "4543519c6a8ed01c65d341fb32d2987c361a45053d69e43c04a1e1bf6f6a2cb3",
  congelada: "ec36be5f20a6ea650bf6e316ec67826777d0b0bfece72f9f37e1800244f835fa",
  bundleHash: "bundle-hash:24d35b32",
};

const bruto = JSON.parse(await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"));

const corrida = () => {
  const normalizada = normalizeDataForSeoAmazonResponse(bruto, "amzq:1");
  return buildRadarAmazonSearchRun({
    runId: "run-amz-1", runVersion: 1,
    startedAt: "2026-09-15T12:00:00.000Z", startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["amzq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z", languageCode: "pt_BR", depth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    },
    queries: [{ queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true }],
    results: normalizada.results,
    universe: buildRadarAmazonUniverse(normalizada.results),
    relatedSearches: normalizada.relatedSearches,
  });
};

/* O alvo da descoberta: "protetor solar facial" da Nivea — a prateleira traz 51 produtos de várias marcas. */
const SETUP = {
  intent: { type: "TOP_BEST", desiredCount: 5, useCase: null, rankingCriteria: null },
  target: { type: "CATEGORY_DISCOVERY", products: [], categoryQuery: "protetor solar facial", productClass: "protetor solar facial", brandFilter: "nivea", brand: null, line: null },
} as const;
const SETUP_GRAVADO = { ...SETUP, declaredAt: "2026-09-15T11:00:00.000Z", declaredBy: "user-1" };

const blueprintAntigo = () => amazonCompetitiveBlueprintOfAnalysis({
  articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
  run: corrida(), support: null,
  primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
  researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
});

const elegibilidade = () => radarAmazonEligibleCandidates({ intent: SETUP.intent as never, target: SETUP.target as never, universe: corrida().universe });

const blueprintNovo = () => amazonCompetitiveBlueprintOfAnalysis({
  articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
  run: corrida(), support: null,
  primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
  researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
  eligibility: elegibilidade(),
});

const congelar = (blueprint: ReturnType<typeof blueprintAntigo>) =>
  freezeRadarAmazonInvestigation({ run: corrida(), blueprint, finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z", setup: SETUP as never });

const dossieAmazon = (congelada: ReturnType<typeof congelar>) => {
  const vista = radarCompetitiveBlueprintViewOfAnalysis({
    profile: "AMAZON", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
    frozen: null, liveBlueprint: null, liveMultimodal: null, primaryKeyword: null, googleObserved: null,
    amazonFrozen: congelada, amazonBlueprint: null, amazonUniverseSize: corrida().universe.length,
    supportSnapshotId: null, serpSnapshotId: null, googleFrozenAt: null,
    generatedAt: "2026-09-15T16:00:00.000Z",
  });
  const resultado = buildRadarEvidenceBundleFromAnalysis({
    payload: { amazonSearch: corrida(), amazonFrozenInvestigation: congelada, amazonEditorialSetup: SETUP_GRAVADO } as never,
    googleObserved: null,
    article: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc" },
    competitiveBlueprint: vista.blueprint,
    observedAt: "2026-09-15T14:00:00.000Z",
  } as never);
  assert.equal(resultado.ok, true);
  return resultado.ok ? { vista, bundle: resultado.bundle } : null!;
};

const contexto = () => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
    promise: "Protetor solar facial", mainIntent: "comercial", hierarchy: "Suporte",
    classification: { intent: "COMMERCIAL_INVESTIGATION", intentLabel: "Investigação comercial", funnel: "MIDDLE", funnelLabel: "Meio", reason: "r" },
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "protetor solar facial" } }],
  editorialTopics: [],
  resolvedKeywordTexts: ["protetor solar facial"],
  silo: { siloId: "s", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
}) as never;

/* ===================== 0 · o congelamento antigo não muda ===================== */

test("congelamento sagrado: a análise antiga (sem elegibilidade) sai byte a byte igual, a fotografia e o pacote mantêm o hash medido antes da mudança", () => {
  const antigo = blueprintAntigo();
  assert.equal(sha(antigo), DOURADO.blueprint, "o blueprint da análise de antes mudou");
  const congelada = congelar(antigo);
  assert.equal(sha(congelada), DOURADO.congelada, "a fotografia de antes mudou");
  const { bundle } = dossieAmazon(congelada);
  assert.equal(bundle.bundleHash, DOURADO.bundleHash, "o pacote do congelamento antigo mudou de hash");
  assert.equal(antigo.observed.products, 51, "a análise antiga lia a prateleira inteira");
});

test("congelamento sagrado: a projeção comercial do export não toca o pacote — o hash do dossiê é o mesmo antes e depois de projetar", () => {
  const congelada = congelar(blueprintAntigo());
  const antes = dossieAmazon(congelada).bundle.bundleHash;
  const payload = { amazonSearch: corrida(), amazonFrozenInvestigation: congelada, amazonEditorialSetup: SETUP_GRAVADO };
  radarPortableCommercialOf({ profile: "GOOGLE", payload: payload as never, context: contexto(), profileBlueprint: null });
  radarPortableCommercialOf({ profile: "AMAZON", payload: payload as never, context: contexto(), profileBlueprint: congelada.competitiveBlueprint });
  assert.equal(dossieAmazon(congelada).bundle.bundleHash, antes);
  assert.equal(antes, DOURADO.bundleHash);
});

test("sem filtro de classe e marca a base é a prateleira (byte a byte); produtos escolhidos à mão mantêm a prateleira como contexto", () => {
  const corridaReal = corrida();
  const semFiltro = { eligible: corridaReal.universe, method: "NO_FILTER" };
  const comSemFiltro = amazonCompetitiveBlueprintOfAnalysis({
    articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
    run: corridaReal, support: null, primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
    researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null, eligibility: semFiltro,
  });
  assert.equal(sha(comSemFiltro), DOURADO.blueprint);
  assert.equal(radarAmazonBlueprintBaseOf({ run: corridaReal, eligibility: { eligible: corridaReal.universe.slice(0, 2), method: "TARGET_PRODUCTS" } }).basis, "RAW");
});

/* ===================== 2 · a base nova: os compatíveis ===================== */

test("congelamento novo: blueprint, faixas, critérios e cards sobre os compatíveis com o alvo, dito nas limitações", () => {
  const elegiveis = elegibilidade();
  assert.equal(elegiveis.method, "CLASS_AND_BRAND");
  assert.ok(elegiveis.eligible.length > 0 && elegiveis.eligible.length < 51, `compatíveis: ${elegiveis.eligible.length}`);
  assert.ok(elegiveis.eligible.every(produto => /nivea/i.test(produto.title)), "só Nivea entra");

  const novo = blueprintNovo();
  assert.equal(novo.observed.products, elegiveis.eligible.length, "a leitura conta os compatíveis, não a prateleira");
  assert.notEqual(sha(novo), DOURADO.blueprint, "a base nova muda a leitura");
  const comPreco = elegiveis.eligible.filter(produto => produto.priceFrom !== null).length;
  const amostraDasFaixas = novo.observed.priceBands.reduce((total, faixa) => total + faixa.sampleSize, 0);
  if (comPreco >= 3) assert.equal(amostraDasFaixas, comPreco, "as faixas são dos compatíveis com preço");
  for (const faixa of novo.observed.priceBands) {
    assert.match(faixa.method, new RegExp(`Tercil da amostra de ${comPreco} preço`));
    assert.equal(faixa.source, "Produtos compatíveis com o alvo, desta coleta da Amazon.");
  }
  assert.ok(novo.limitations.some(frase => frase.includes(`considera só os ${elegiveis.eligible.length} produto(s) compatível(is) com o alvo, de 51 observado(s)`)));
  assert.match(novo.observed.sufficiency, /compatível\(is\) com o alvo, de 51 observado\(s\)/);

  const cards = buildRadarAmazonBlueprintCards(novo);
  const modelo = cards.find(card => card.id === "COMPETITIVE_MODEL")!;
  assert.ok(modelo.lines.some(linha => /compatível\(is\) com o alvo/.test(linha)), "o card diz a base");
  const congelada = congelar(novo);
  assert.equal((congelada.competitiveBlueprint as typeof novo).observed.products, elegiveis.eligible.length, "a fotografia nova guarda a leitura dos compatíveis");
  assert.equal(congelada.runRef.universeSize, 51, "a prateleira inteira continua contada como evidência");
  assert.equal(dossieAmazon(congelada).bundle.bundleHash === DOURADO.bundleHash, false, "o congelamento NOVO tem a leitura nova");
});

test("finalizar congela a base nova: o blueprint gravado antes da regra é refeito; o da regra nova, não; sem filtro, nunca", () => {
  const base = radarAmazonBlueprintBaseOf({ run: corrida(), eligibility: elegibilidade() });
  assert.equal(base.basis, "ELIGIBLE");
  assert.equal(radarAmazonBlueprintNeedsNewBase(blueprintAntigo(), base), true);
  assert.equal(radarAmazonBlueprintNeedsNewBase(blueprintNovo(), base), false);
  assert.equal(radarAmazonBlueprintNeedsNewBase(blueprintAntigo(), radarAmazonBlueprintBaseOf({ run: corrida() })), false);
});

test("o servidor: analisar passa a elegibilidade; finalizar refaz pela MESMA montagem quando a base mudou, antes da fotografia; a fotografia antiga não é relida", async () => {
  const servidor = semComentarios(await readFile(new URL("../lib/server/radar-amazon-analyze.ts", import.meta.url), "utf8"));
  const montar = servidor.slice(servidor.indexOf("async function montarBlueprintAmazon"), servidor.indexOf("export async function finalizeRadarAmazonInvestigation"));
  assert.match(montar, /radarAmazonEligibleCandidates\(\{ intent: configuracao\.intent, target: configuracao\.target, universe: corrida\.universe \}\)/);
  assert.match(montar, /eligibility: elegibilidade,/);
  assert.match(montar, /radarCurrentArticleDnaVersion\(\{ versions: artefatos\.articles, events: artefatos\.events/);
  assert.doesNotMatch(montar, /artefatos\.articles\.find\(/, "a versão do ArticleDNA não depende da ordem da leitura");

  const finalizar = servidor.slice(servidor.indexOf("export async function finalizeRadarAmazonInvestigation"), servidor.indexOf("function fotografiaAmazon"));
  const ondeIdempotente = finalizar.indexOf("if (payload.amazonFrozenInvestigation) {");
  const ondeRefaz = finalizar.indexOf("radarAmazonBlueprintNeedsNewBase(blueprint, base)");
  const ondeFotografa = finalizar.indexOf("fotografiaAmazon(payload, corrida, congelavel,");
  assert.ok(ondeIdempotente > 0 && ondeRefaz > ondeIdempotente && ondeFotografa > ondeRefaz, "a fotografia já congelada volta antes de qualquer releitura; a base nova é conferida antes de fotografar");
  assert.match(finalizar, /montarBlueprintAmazon\(\{ \.\.\.entrada, analyzedAt: entrada\.finalizedAt \}, payload, validarColetaAmazon\(payload\)\.pacote, corrida\)/);
  assert.doesNotMatch(servidor, /executeDataForSeo|collectDataForSeoSerpSnapshot|\bfetch\(/, "nenhum provider");
});

/* ===================== 1 · a parte comercial em qualquer perfil ===================== */

test("Google com a Amazon como review: a projeção comercial sai com produtos, links, critérios e aviso de afiliado — a mesma do perfil AMAZON", () => {
  const congelada = congelar(blueprintNovo());
  const payload = { amazonSearch: corrida(), amazonFrozenInvestigation: congelada, amazonEditorialSetup: SETUP_GRAVADO };

  const review = radarPortableCommercialOf({ profile: "GOOGLE", payload: payload as never, context: contexto(), profileBlueprint: null });
  assert.ok(review.commercial, "o Google com review perdeu a parte comercial");
  assert.ok(review.commercial!.links.length > 0, "sem links de produto");
  assert.equal(review.commercial!.products.length, review.commercial!.links.length);
  assert.equal(review.commercial!.disclosureRequired, true, "o aviso de afiliado sumiu");
  assert.ok(review.commercial!.comparisonCriteria.length > 0);
  assert.deepEqual(review.commercial!.counts, { observed: 51, eligible: elegibilidade().eligible.length, shortlist: review.commercial!.links.length });
  assert.equal(review.model?.profile, "AMAZON");
  /* As faixas do gerador (ECONOMICO, INTERMEDIARIO, PREMIUM) saem com o nome, não com o código cru. */
  const faixas = (review.model?.derived || []).filter(item => item.id.startsWith("banda:"));
  assert.ok(faixas.length > 0 && faixas.every(item => /^Faixa (econômica|intermediária|premium)$/.test(item.label)), JSON.stringify(faixas.map(item => item.label)));

  /* A mesma projeção do perfil primário AMAZON sobre o mesmo congelamento. */
  const primario = radarPortableCommercialOf({ profile: "AMAZON", payload: payload as never, context: contexto(), profileBlueprint: congelada.competitiveBlueprint });
  assert.deepEqual(review.commercial, primario.commercial);
});

test("sem Amazon congelada, nada comercial no Google; no AMAZON o plano de sempre continua presente; configuração trocada depois do congelamento não gera produto", () => {
  const nada = radarPortableCommercialOf({ profile: "GOOGLE", payload: { amazonSearch: corrida(), amazonEditorialSetup: SETUP_GRAVADO } as never, context: contexto(), profileBlueprint: null });
  assert.deepEqual(nada, { state: null, model: null, commercial: null });
  assert.equal(radarPortableCommercialOf({ profile: "YOUTUBE", payload: {} as never, context: null, profileBlueprint: null }).commercial, null);

  const semContexto = radarPortableCommercialOf({ profile: "AMAZON", payload: {} as never, context: null, profileBlueprint: null });
  assert.deepEqual(semContexto.commercial, { setup: null, counts: null, products: [], links: [], comparisonCriteria: [], disclosureRequired: false, shortlistStatus: null });

  const congelada = congelar(blueprintNovo());
  const trocada = { ...SETUP_GRAVADO, intent: { ...SETUP_GRAVADO.intent, type: "TOP_VALUE" } };
  const outra = radarPortableCommercialOf({ profile: "GOOGLE", payload: { amazonSearch: corrida(), amazonFrozenInvestigation: congelada, amazonEditorialSetup: trocada } as never, context: contexto(), profileBlueprint: null });
  assert.ok(outra.commercial);
  assert.deepEqual(outra.commercial!.links, [], "a corrida de outra configuração não vira produto");
  assert.equal(outra.commercial!.counts, null);
});

test("o núcleo do export usa a projeção em qualquer perfil; o modelo comercial só vira modelo do perfil no AMAZON", async () => {
  const nucleo = semComentarios(await readFile(new URL("../lib/server/radar-portable-export-core.ts", import.meta.url), "utf8"));
  assert.match(nucleo, /const projecaoComercial = radarPortableCommercialOf\(\{\n\s+profile: perfil,\n\s+payload,\n\s+context: contexto,\n\s+profileBlueprint: blueprintView\.blueprint \?\? null,\n\s+\}\);/);
  assert.match(nucleo, /const planoComercial: RadarPortableCommercial \| null = projecaoComercial\.commercial;/);
  assert.match(nucleo, /perfil === "AMAZON" && blueprintView\.blueprint\.profile === "AMAZON"\n\s+\? projecaoComercial\.model/);
  assert.match(nucleo, /commercial: planoComercial,/);
  assert.doesNotMatch(nucleo, /perfil === "AMAZON" \? estadoComercialCanonico|function estadoComercialCanonico/, "a cópia antiga do estado comercial voltou");
});

/* ===================== 3 · o bloco comercial do artigo-modelo ===================== */

test("o bloco comercial da Amazon congelada para o gerador: intenção da fotografia, shortlist elegível com URL limpa, critérios, faixas, aviso de afiliado e o esqueleto como matéria-prima", () => {
  const congelada = congelar(blueprintNovo());
  const payload = { amazonSearch: corrida(), amazonFrozenInvestigation: congelada, amazonEditorialSetup: SETUP_GRAVADO };
  const bloco = radarAmazonFrozenCommercialBlock({ payload: payload as never, context: contexto() })!;
  assert.ok(bloco);
  assert.equal(bloco.frozenAt, "2026-09-15T14:00:00.000Z");
  assert.deepEqual(bloco.intent, { type: "TOP_BEST", label: "Top melhores produtos", desiredCount: 5, useCase: null, rankingCriteria: null });
  assert.equal(bloco.editorialOutput, "TOP_BEST");
  const compativeis = new Set(elegibilidade().eligible.map(produto => produto.asin));
  assert.ok(bloco.shortlist.length > 0 && bloco.shortlist.every(item => compativeis.has(item.asin)), "só compatíveis entram na shortlist");
  assert.ok(bloco.shortlist.every(item => item.amazonUrl && !/[?&](qid|sr|dib)=/.test(item.amazonUrl)), "a URL é a limpa, sem rastro de busca");
  assert.deepEqual(bloco.shortlist.map(item => item.order), bloco.shortlist.map((_, indice) => indice + 1));
  assert.equal(bloco.affiliateDisclosureRequired, true);
  assert.ok(bloco.rules.some(regra => /aviso de afiliado antes do primeiro link/.test(regra)));
  assert.ok(bloco.comparisonCriteria.length > 0);
  assert.ok(bloco.priceBands.every(faixa => /^Faixa (econômica|intermediária|premium)$/.test(faixa.label)));
  assert.ok(bloco.skeleton.length >= 4, "o esqueleto da forma comercial chega ao gerador");
  assert.equal(bloco.skeleton[0].heading, radarAmazonCommercialSkeleton({
    intent: "TOP_BEST", assunto: "protetor solar facial", criterios: bloco.comparisonCriteria, selecionados: bloco.shortlist.length, produtos: [], necessidade: null,
  })[0].heading);

  /* D10 · nada do bloco manda o redator esperar, preencher ou pedir. */
  const textos = JSON.stringify(bloco);
  assert.doesNotMatch(textos, /pendência|aguardando aprovação|rascunho|fonte a obter|preencher|peça ao Arquiteto|confira se a coleta traz/i);
});

test("o bloco: sem Amazon congelada, nada; sem contexto, os critérios saem dos eixos; a configuração trocada não inventa shortlist", () => {
  assert.equal(radarAmazonFrozenCommercialBlock({ payload: { amazonSearch: corrida() } as never, context: contexto() }), null);
  const congelada = congelar(blueprintNovo());
  const semContexto = radarAmazonFrozenCommercialBlock({ payload: { amazonSearch: corrida(), amazonFrozenInvestigation: congelada, amazonEditorialSetup: SETUP_GRAVADO } as never, context: null })!;
  assert.deepEqual(semContexto.comparisonCriteria, (congelada.competitiveBlueprint as ReturnType<typeof blueprintNovo>).recommended.comparisonAxes.map(eixo => eixo.label));
  assert.equal(semContexto.workingTitle, null);
  const trocada = { ...SETUP_GRAVADO, intent: { ...SETUP_GRAVADO.intent, type: "TOP_VALUE" } };
  const outra = radarAmazonFrozenCommercialBlock({ payload: { amazonSearch: corrida(), amazonFrozenInvestigation: congelada, amazonEditorialSetup: trocada } as never, context: contexto() })!;
  assert.deepEqual(outra.shortlist, []);
  assert.equal(outra.intent?.type, "TOP_BEST", "a intenção é a da fotografia, não a configuração trocada depois");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
