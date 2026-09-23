import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  readEditorialUnitDeclaration,
  readArchitectKeywordVinculo,
  editorialUnitDeclarationFromVinculo,
  declaresPublishedSilo,
  suggestsSiloPotential,
  describeEditorialUnitDeclaration,
  headsSilo,
  declaredNotSilo,
} from "../lib/arquiteto/editorial-unit-declaration.ts";
import {
  serpLensOf,
  observationFromSnapshot,
  measureKeywordAffinity,
  aggregateUniverseCoverage,
  competitiveObservationFromCache,
  DEFAULT_AFFINITY,
} from "../lib/arquiteto/serp-competitive-evidence.ts";
import {
  proposePrimarySubstitution,
  planPublishedReinforcement,
  DEFAULT_SUBSTITUTION,
  type PublishedPrimary,
  type SubstitutionChallenger,
} from "../lib/arquiteto/primary-substitution.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "../lib/arquiteto/domain-rules.ts";
import { readPublishedGroupFromSerp } from "../lib/arquiteto/published-keyword-readout.ts";
import * as keywordSerpRecord from "../lib/arquiteto/keyword-serp-record.ts";
import { DEFAULT_SERP_LENSES, SerpLensSchema } from "../lib/arquiteto/keyword-serp-record.ts";
import { SERP_CACHE_LENSES, SerpCacheLensSchema } from "../lib/editorial/serp-cache.ts";
import { PrimaryKeywordCandidateSchema, PrimaryKeywordDecisionSchema } from "../lib/arquiteto/contracts.ts";
import {
  measureCompetitiveStrength,
  electPrimaryFromPublishedDeclaration,
  electPrimaryFromSerp,
  electPrimaryByHuman,
  electSiloPrimaryKeyword,
  lensDivergenceOf,
  selectPublishedSiloDeclaration,
  stampPublishedPrimary,
  describeSiloPrimaryKeyword,
  DEFAULT_SILO_STRENGTH,
  proposeSiloPrimaryFromSerp,
  serpPrimaryAcceptanceOf,
  type SerpCompetitiveObservation,
} from "../lib/arquiteto/silo-primary-keyword.ts";
import {
  SerpPrimaryAcceptanceSchema,
  TERRITORY_PRIMARY_COLUMNS,
  KEYWORD_TERRITORY_REF_COLUMNS,
  acceptSerpPrimaryProposal,
  readKeywordTerritoryRef,
  readTerritoryPrimaryKeyword,
  samePrimaryKeyword,
  serpPrimaryOriginRefusal,
  territoryCreatePrimaryRefusal,
  territoryPrimaryChangeRefusal,
} from "../lib/arquiteto/silo-primary-acceptance.ts";
import { describeQualificationLenses, describeSerpLensesMissing, SerpLensesMarkerSchema } from "../lib/arquiteto/serp-lens-plan.ts";
import { adaptKeywordIdentityContext } from "../lib/arquiteto/identity-context.ts";
import { EditorialUnitDeclarationSchema, ArchitectKeywordSchema } from "../lib/arquiteto/contracts.ts";
import { TerritoryPrimaryKeywordSchema, TerritoryCandidateSchema, buildTerritoryRef, emptyTerritoryDiscovery, emptyTerritoryLineage } from "../lib/arquiteto/territory.ts";
import { buildArchitectureWorkingProposal } from "../lib/arquiteto/architecture-working-proposal.ts";
import { buildTerritorialReviewView } from "../lib/arquiteto/territorial-review.ts";
import { manualSiloCandidateDraft } from "../lib/arquiteto/silo-assignment.ts";
import type { ArchitectureAnalysis, ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import type { KeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import type { EditorialUnitDeclaration } from "../lib/arquiteto/contracts.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { buildDataForSeoSerpOperationRequest } from "../lib/server/dataforseo-serp-operation.ts";
import { SerpResearchSnapshotSchema, type SerpSearchInput } from "../lib/radar/serp/contracts.ts";

/**
 * A ORIGEM DECIDE COMO SE ELEGE A PRIMÁRIA DO SILO.
 *
 * O produto separou quatro origens e disse que o CONCEITO de escolha é
 * diferente em cada uma. Estes testes fixam essa diferença:
 *
 *   ORIGEM 1 · lista nova    a SERP elege entre as candidatas, e recusa quando
 *                            nenhuma compete de verdade;
 *   ORIGEM 2 · publicados    a declaração do [Vínculo] já decidiu — só se lê;
 *   ORIGEM 3 · manual        a pessoa elege e o motivo fica registrado.
 *
 * E fixam a doutrina por trás: a SERP está acima da lógica e da IA, mas abaixo
 * do fato publicado. Nada de grupo sem evidência.
 */

const NOW = "2026-09-20T12:00:00.000Z";

/* ======================= A · a declaração do [Vínculo] ==================== */

/*
 * As linhas abaixo têm o FORMATO REAL do Minerador — `analise_semantica` com
 * `keyword_page_type`, `primary_keyword_policy` e `site_origin`. A primeira
 * versão destes testes usava nomes paralelos (`siteRole` solto na linha,
 * `potentialUnit`) que o Minerador nunca grava: passavam, e o dado real teria
 * chegado vazio.
 */
const URL_PUBLICADA = "https://marca.com.br/skincare-facial";

/** A evidência que `readPublicationLink` exige para dizer "publicada". */
const evidenciaPublicada = (over: Record<string, unknown> = {}) => ({
  publicationStatus: "published",
  sourceUrl: URL_PUBLICADA,
  resolvedUrl: URL_PUBLICADA,
  canonicalUrl: URL_PUBLICADA,
  urlSituation: "canonical_confirmed",
  lastCheckedAt: NOW,
  publicationConfirmedBy: "user-1",
  publicationConfirmedAt: NOW,
  ...over,
});

const linhaDoMinerador = (input: {
  id?: string;
  status?: string;
  semantic?: Record<string, unknown> | string;
  aprovado?: Record<string, unknown>;
} = {}) => ({
  id: input.id ?? "kw-1",
  status: input.status ?? "aprovado",
  analise_semantica: input.semantic ?? {},
  ...(input.aprovado ? { canonicalWorkflow: { payload: { approvedDna: { analiseSemantica: input.aprovado } } } } : {}),
});

test("A1 · Silo publicado: o tipo marcado + a publicação conferida viram DECLARAÇÃO, com endereço", () => {
  const declaracao = readEditorialUnitDeclaration(linhaDoMinerador({
    semantic: { keyword_page_type: "silo", site_origin: evidenciaPublicada({ siteRole: "silo" }) },
  }));

  assert.equal(declaracao?.source, "published");
  assert.equal(declaracao?.source === "published" ? declaracao.unit : null, "silo");
  assert.equal(declaracao?.source === "published" ? declaracao.url : null, URL_PUBLICADA);
  assert.equal(declaresPublishedSilo(declaracao), true);
  // Fato observado não é previsão, e o produto pediu para não confundir os dois.
  assert.equal(suggestsSiloPotential(declaracao), false);
});

test("A2 · papel de site desconhecido não vira declaração nenhuma — nem 'other', nem 'article'", () => {
  /*
   * O Minerador só reconhece `silo` e `article` como papel observado. Um papel
   * que ele não reconhece não é promovido a declaração por este lado: o
   * Arquiteto repete a resposta do Minerador em vez de ter opinião própria.
   */
  const declaracao = readEditorialUnitDeclaration(linhaDoMinerador({
    semantic: { site_origin: evidenciaPublicada({ siteRole: "hub_editorial" }) },
  }));
  assert.equal(declaracao, undefined);
});

test("A3 · sem nada marcado não há declaração — o acervo antigo não fica declarado", () => {
  assert.equal(readEditorialUnitDeclaration(linhaDoMinerador()), undefined);
  assert.equal(describeEditorialUnitDeclaration(undefined), "O Minerador ainda não declarou a natureza desta keyword.");
});

test("A4 · o MESMO valor muda de peso com a publicação: potencial na nova, declaração na publicada", () => {
  /*
   * O Minerador guarda um enum só. Antes da publicação ele é aposta; depois,
   * é o que a página É. Inventar dois campos faria a declaração se perder no
   * dia em que a keyword fosse publicada — e o Arquiteto não pode reinventar.
   */
  const nova = readEditorialUnitDeclaration(linhaDoMinerador({ semantic: { keyword_page_type: "silo" } }));
  assert.equal(nova?.source, "potential");
  assert.equal(suggestsSiloPotential(nova), true);
  assert.equal(declaresPublishedSilo(nova), false);

  const publicada = readEditorialUnitDeclaration(linhaDoMinerador({
    semantic: { keyword_page_type: "silo", site_origin: evidenciaPublicada() },
  }));
  assert.equal(publicada?.source, "published");
  assert.equal(declaresPublishedSilo(publicada), true);
});

test("A5 · o humano vence o papel observado no site", () => {
  const declaracao = readEditorialUnitDeclaration(linhaDoMinerador({
    semantic: { keyword_page_type: "article", site_origin: evidenciaPublicada({ siteRole: "silo" }) },
  }));
  assert.equal(declaracao?.source, "published");
  assert.equal(declaracao?.source === "published" ? declaracao.unit : null, "article");
});

test("A6 · site_origin gravado como TEXTO JSON continua sendo lido", () => {
  /*
   * Registrado no próprio Minerador: em 2026-09-21 descobriu-se que
   * "Processar lógica" gravava `site_origin` como string JSON. O leitor
   * paralelo antigo do Arquiteto só aceitava objeto — a publicação caía, e
   * com ela a declaração de Silo publicado.
   */
  const contexto = adaptKeywordIdentityContext(linhaDoMinerador({
    id: "kw-publicada",
    semantic: { keyword_page_type: "silo", site_origin: JSON.stringify(evidenciaPublicada({ siteRole: "silo" })) },
  }) as unknown as Parameters<typeof adaptKeywordIdentityContext>[0]);

  assert.equal(contexto.editorialUnitDeclaration?.source, "published");
  assert.equal(declaresPublishedSilo(contexto.editorialUnitDeclaration), true);
});

test("A7 · keyword sem declaração não ganha o campo — ausência não vira dado", () => {
  const contexto = adaptKeywordIdentityContext(linhaDoMinerador({ id: "kw-nova" }) as unknown as Parameters<typeof adaptKeywordIdentityContext>[0]);
  assert.equal("editorialUnitDeclaration" in contexto, false);
});

test("A8 · o PACOTE APROVADO vale mais que a linha viva", () => {
  /*
   * A linha viva diz Silo; o que o humano aprovou diz Artigo. Uma edição no
   * Minerador depois da aprovação não vaza para o Arquiteto sem aprovação nova.
   */
  const declaracao = readEditorialUnitDeclaration(linhaDoMinerador({
    semantic: { keyword_page_type: "silo" },
    aprovado: { keyword_page_type: "article" },
  }));
  assert.equal(declaracao?.unit, "article");
});

test("A9 · o padrão 'article' do Minerador NÃO é declaração", () => {
  /*
   * Toda keyword que ninguém marcou sai do Minerador como `article` — é o
   * padrão, não uma decisão. Tratar isso como "o humano disse que é artigo"
   * faria o acervo inteiro parecer declarado e a lógica pararia de propor Silo
   * onde o léxico ainda sustentaria um.
   */
  const vinculo = readArchitectKeywordVinculo(linhaDoMinerador());
  assert.equal(vinculo.pageType, "article");
  assert.equal(vinculo.pageTypeDetermined, false);

  const declaracao = editorialUnitDeclarationFromVinculo(vinculo);
  assert.equal(declaracao, undefined);
  assert.equal(headsSilo(declaracao), false);
  assert.equal(declaredNotSilo(declaracao), false);
});

test("A10 · o posto vem do Minerador: travado, revisável ou livre", () => {
  const travado = readArchitectKeywordVinculo(linhaDoMinerador({ semantic: { primary_keyword_policy: "locked" } }));
  assert.equal(travado.post, "locked");
  assert.equal(travado.postLockedToSlug, true);

  // Publicada sem posto explícito: o padrão do Minerador é travar ao slug.
  const publicada = readArchitectKeywordVinculo(linhaDoMinerador({ semantic: { site_origin: evidenciaPublicada() } }));
  assert.equal(publicada.publicationDeclared, true);
  assert.equal(publicada.post, "locked");

  // Nova sem publicação: livre para ser primária ou secundária.
  const nova = readArchitectKeywordVinculo(linhaDoMinerador());
  assert.equal(nova.post, "free");
  assert.equal(nova.postLockedToSlug, false);

  // A frase é a do Minerador, repetida, nunca recalculada aqui.
  assert.match(travado.summary, /Travado ao slug/);
});

test("A11 · landing page e página de serviço também chegam como potencial", () => {
  const landing = readEditorialUnitDeclaration(linhaDoMinerador({ semantic: { keyword_page_type: "landing_page" } }));
  assert.equal(landing?.source, "potential");
  assert.equal(landing?.unit, "landing_page");
  // Não-Silo declarado: nunca vira semente de Silo.
  assert.equal(declaredNotSilo(landing), true);
  assert.equal(headsSilo(landing), false);
});

/* ==================== B · a SERP traduzida em evidência =================== */

const observacao = (over: Partial<SerpCompetitiveObservation> & { keywordId: string; lens: string }): SerpCompetitiveObservation => ({
  competitorDomains: [],
  organicCount: 10,
  itemTypes: [],
  questions: [],
  commercialSignals: false,
  ...over,
});

test("B1 · a lente é dispositivo + sistema, e sem sistema declarado ela diz só o dispositivo", () => {
  assert.equal(serpLensOf({ device: "desktop", operatingSystem: "windows" }), "desktop-windows");
  assert.equal(serpLensOf({ device: "mobile", operatingSystem: "ios" }), "mobile-ios");
  // Não inventa "windows" para fingir uma coleta que não houve.
  assert.equal(serpLensOf({ device: "desktop", operatingSystem: null }), "desktop");
});

test("B2 · os domínios citados pelo AI Overview entram como concorrência", () => {
  const observada = observationFromSnapshot({
    keywordId: "kw-1",
    device: "desktop",
    operatingSystem: "windows",
    organicResults: [{ domain: "a.com" }, { domain: "b.com" }],
    serpFeatures: { aiOverview: { present: true, references: [{ domain: "c.com" }, { domain: "a.com" }] } },
  });

  assert.deepEqual([...observada.competitorDomains].sort(), ["a.com", "b.com", "c.com"]);
  // organicCount continua sendo só o orgânico: citação não é posição azul.
  assert.equal(observada.organicCount, 2);
  assert.equal(observada.lens, "desktop-windows");
});

test("B3 · os blocos entregues juntam o que a feature declara e o que a contagem bruta registrou", () => {
  const observada = observationFromSnapshot({
    keywordId: "kw-1",
    device: "mobile",
    operatingSystem: "android",
    organicResults: [],
    peopleAlsoAsk: [{ question: "como usar?" }],
    serpFeatures: { itemTypes: ["video"], questionMap: [{ question: "qual a ordem?" }], commercialSignals: { present: true } },
    diagnostic: { rawItemTypeCounts: { video: 2, popular_products: 1 } },
  });

  assert.deepEqual([...observada.itemTypes].sort(), ["popular_products", "video"]);
  assert.deepEqual([...observada.questions].sort(), ["como usar?", "qual a ordem?"]);
  assert.equal(observada.commercialSignals, true);
});

test("B4 · com as lentes concordando entre si, sobreposição em uma lente só não basta", () => {
  /*
   * A concordância continua sendo medida POR LENTE: somar lentes diferentes
   * faria uma keyword forte no desktop parecer afim de outra forte no mobile.
   * Aqui as duas lentes devolvem o mesmo universo, então não há divergência a
   * creditar — e uma lente sozinha não sustenta o agrupamento.
   */
  const afinidade = measureKeywordAffinity({
    left: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-android", competitorDomains: ["x.com", "y.com"] }),
    ],
    right: [
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
    ],
  });

  assert.equal(afinidade.sharedDomains, 2);
  assert.equal(afinidade.lensesAgreeing, 1);
  assert.equal(afinidade.lensDivergence, 0);
  assert.equal(afinidade.supportsGrouping, false);
  assert.match(afinidade.reason, /1 lente/);
});

test("B5 · um domínio em comum não sustenta agrupamento, e a recusa diz o mínimo exigido", () => {
  const afinidade = measureKeywordAffinity({
    left: [observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com"] })],
    right: [observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com"] })],
  });

  assert.equal(afinidade.supportsGrouping, false);
  assert.match(afinidade.reason, new RegExp(String(DEFAULT_AFFINITY.minSharedDomains)));
});

test("B6 · com sobreposição nas duas lentes a SERP sustenta o agrupamento", () => {
  const afinidade = measureKeywordAffinity({
    left: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], questions: ["como usar?"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
    ],
    right: [
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], questions: ["como usar?"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["y.com"] }),
    ],
  });

  assert.equal(afinidade.lensesAgreeing, 2);
  assert.equal(afinidade.sharedQuestions, 1);
  assert.equal(afinidade.supportsGrouping, true);
});

test("B7 · a cobertura do universo agrega perguntas e lentes observadas", () => {
  const cobertura = aggregateUniverseCoverage([
    observacao({ keywordId: "kw-a", lens: "desktop-windows", questions: ["como usar?"], itemTypes: ["video"] }),
    observacao({ keywordId: "kw-a", lens: "mobile-ios", questions: ["como usar?", "qual a ordem?"], commercialSignals: true }),
  ]);

  assert.deepEqual([...cobertura.questions].sort(), ["como usar?", "qual a ordem?"]);
  assert.deepEqual(cobertura.lenses, ["desktop-windows", "mobile-ios"]);
  assert.equal(cobertura.commercial, true);
  assert.match(cobertura.summary, /2 pergunta/);
});

/* ======================= C · a força competitiva ========================= */

test("C1 · sobreposição é contra as OUTRAS candidatas: sozinha, nenhuma keyword é forte", () => {
  const [forca] = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
    ],
  });

  assert.equal(forca.competitorOverlap, 0);
  assert.equal(forca.strong, false);
  assert.match(forca.reasons.join(" "), /demais candidatas/);
});

test("C2 · forte numa lente só não passa — evidência de um dispositivo é evidência fraca", () => {
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
    ],
  });

  for (const forca of forcas) {
    assert.equal(forca.devicesAgreeing, 1);
    assert.equal(forca.strong, false);
    assert.match(forca.reasons.join(" "), new RegExp(`mínimo é ${DEFAULT_SILO_STRENGTH.minDevicesAgreeing}`));
  }
});

test("C3 · lente com orgânico abaixo do piso não conta como concordância", () => {
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], organicCount: 10 }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"], organicCount: 1 }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], organicCount: 10 }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"], organicCount: 10 }),
    ],
  });

  const a = forcas.find(item => item.keywordId === "kw-a");
  const b = forcas.find(item => item.keywordId === "kw-b");
  assert.equal(a?.devicesObserved, 2);
  assert.equal(a?.devicesAgreeing, 1);
  assert.equal(a?.strong, false);
  assert.equal(b?.devicesAgreeing, 2);
  assert.equal(b?.strong, true);
});

test("C4 · a ordenação segue a nota, e a nota é soma declarada — não peso oculto", () => {
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-fraca", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-fraca", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-forte", lens: "desktop-windows", competitorDomains: ["x.com", "y.com", "z.com"], itemTypes: ["video", "ai_overview"] }),
      observacao({ keywordId: "kw-forte", lens: "mobile-ios", competitorDomains: ["x.com", "y.com", "z.com"] }),
      observacao({ keywordId: "kw-meio", lens: "desktop-windows", competitorDomains: ["z.com", "y.com"] }),
      observacao({ keywordId: "kw-meio", lens: "mobile-ios", competitorDomains: ["z.com", "y.com"] }),
    ],
  });

  assert.equal(forcas[0].keywordId, "kw-forte");
  const forte = forcas[0];
  assert.equal(
    forte.score,
    forte.competitorOverlap * 3 + forte.devicesAgreeing * 2 + forte.divergentLensesHolding * 2 + forte.featureBreadth,
  );
  assert.equal(forte.strong, true);
});

/* ==================== D · a eleição, origem por origem ==================== */

const publicada = (keywordId: string, unit: "silo" | "article", url: string | null = null) => ({
  keywordId,
  label: keywordId,
  declaration: EditorialUnitDeclarationSchema.parse({ source: "published", unit, url, canonical: url, observedAt: NOW }),
});

test("D1 · ORIGEM 2 · a declaração publicada elege sem SERP e traz o endereço junto", () => {
  const eleicao = electPrimaryFromPublishedDeclaration({
    keywords: [publicada("kw-silo", "silo", "https://marca.com.br/skincare"), publicada("kw-artigo", "article", "https://marca.com.br/serum")],
    electedAt: NOW,
  });

  assert.equal(eleicao.state, "ELECTED");
  if (eleicao.state !== "ELECTED") return;
  assert.equal(eleicao.primary.electedBy, "published_declaration");
  assert.equal(eleicao.primary.keywordId, "kw-silo");
  assert.equal(eleicao.primary.electedBy === "published_declaration" ? eleicao.primary.url : null, "https://marca.com.br/skincare");
});

test("D2 · sem nenhuma publicada declarada Silo a origem 2 RECUSA — não elege a mais parecida", () => {
  const eleicao = electPrimaryFromPublishedDeclaration({
    keywords: [publicada("kw-artigo", "article", "https://marca.com.br/serum")],
    electedAt: NOW,
  });

  assert.equal(eleicao.state, "REFUSED");
  if (eleicao.state !== "REFUSED") return;
  assert.deepEqual(eleicao.blockers, ["NO_PUBLISHED_SILO_DECLARATION"]);
});

test("D3 · duas publicadas declaradas Silo são DOIS Silos, e a recusa diz isso", () => {
  const eleicao = electPrimaryFromPublishedDeclaration({
    keywords: [publicada("kw-um", "silo", "https://marca.com.br/a"), publicada("kw-dois", "silo", "https://marca.com.br/b")],
    electedAt: NOW,
  });

  assert.equal(eleicao.state, "REFUSED");
  if (eleicao.state !== "REFUSED") return;
  assert.equal(eleicao.blockers.length, 2);
  assert.match(eleicao.reason, /cada uma é um Silo próprio/);
});

test("D4 · ORIGEM 1 · a SERP elege a mais competitiva e a evidência fica gravada", () => {
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-forte", lens: "desktop-windows", competitorDomains: ["x.com", "y.com", "z.com"] }),
      observacao({ keywordId: "kw-forte", lens: "mobile-ios", competitorDomains: ["x.com", "y.com", "z.com"] }),
      observacao({ keywordId: "kw-outra", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-outra", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
    ],
  });

  const eleicao = electPrimaryFromSerp({ strengths: forcas, labels: new Map([["kw-forte", "skincare facial"]]), electedAt: NOW });
  assert.equal(eleicao.state, "ELECTED");
  if (eleicao.state !== "ELECTED") return;
  assert.equal(eleicao.primary.electedBy, "serp");
  assert.equal(eleicao.primary.keywordId, "kw-forte");
  assert.equal(eleicao.primary.electedBy === "serp" ? eleicao.primary.evidence.devicesAgreeing : 0, 2);
  assert.match(eleicao.reason, /skincare facial/);
});

test("D5 · sem candidata forte a SERP RECUSA, e o motivo de cada uma fica visível", () => {
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com"] }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com"] }),
    ],
  });

  const eleicao = electPrimaryFromSerp({ strengths: forcas, electedAt: NOW });
  assert.equal(eleicao.state, "REFUSED");
  if (eleicao.state !== "REFUSED") return;
  assert.equal(eleicao.blockers.length, 2);
  assert.match(eleicao.reason, /evidência de SERP suficiente/);
});

test("D6 · ORIGEM 3 · a eleição manual exige motivo, ator e keyword", () => {
  const completa = electPrimaryByHuman({ keywordId: "kw-a", actorUserId: "user-1", reason: "decisão editorial", electedAt: NOW });
  assert.equal(completa.state, "ELECTED");
  if (completa.state === "ELECTED") assert.equal(completa.primary.electedBy, "human");

  const incompleta = electPrimaryByHuman({ keywordId: "kw-a", actorUserId: "user-1", reason: "   ", electedAt: NOW });
  assert.equal(incompleta.state, "REFUSED");
  if (incompleta.state === "REFUSED") assert.deepEqual(incompleta.blockers, ["INCOMPLETE_HUMAN_ELECTION"]);
});

test("D7 · a precedência é humano > publicado > SERP, e o fato vence a evidência", () => {
  const publicado = electPrimaryFromPublishedDeclaration({ keywords: [publicada("kw-publicada", "silo", "https://marca.com.br/a")], electedAt: NOW });
  const serp = electPrimaryFromSerp({
    strengths: measureCompetitiveStrength({
      observations: [
        observacao({ keywordId: "kw-serp", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
        observacao({ keywordId: "kw-serp", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
        observacao({ keywordId: "kw-outra", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
        observacao({ keywordId: "kw-outra", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
      ],
    }),
    electedAt: NOW,
  });
  const humano = electPrimaryByHuman({ keywordId: "kw-humana", actorUserId: "user-1", reason: "decisão editorial", electedAt: NOW });

  const semHumano = electSiloPrimaryKeyword({ published: publicado, serp, human: null });
  assert.equal(semHumano.state === "ELECTED" ? semHumano.primary.keywordId : null, "kw-publicada");

  const comHumano = electSiloPrimaryKeyword({ published: publicado, serp, human: humano });
  assert.equal(comHumano.state === "ELECTED" ? comHumano.primary.keywordId : null, "kw-humana");

  const soSerp = electSiloPrimaryKeyword({ published: null, serp, human: null });
  assert.equal(soSerp.state === "ELECTED" ? soSerp.primary.electedBy : null, "serp");
});

test("D8 · todas as origens recusando produz uma recusa só, com todos os bloqueios", () => {
  const publicado = electPrimaryFromPublishedDeclaration({ keywords: [], electedAt: NOW });
  const serp = electPrimaryFromSerp({ strengths: measureCompetitiveStrength({ observations: [] }), electedAt: NOW });
  const consolidada = electSiloPrimaryKeyword({ published: publicado, serp, human: null });

  assert.equal(consolidada.state, "REFUSED");
  if (consolidada.state !== "REFUSED") return;
  assert.ok(consolidada.blockers.includes("NO_PUBLISHED_SILO_DECLARATION"));
});

/* ========================== E · os contratos ============================= */

test("E1 · cada origem carrega SÓ a evidência que produz — misturar é recusado", () => {
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse({
    electedBy: "published_declaration", keywordId: "kw-a", url: null, canonical: null, electedAt: NOW,
  }).success, true);

  // Uma primária "publicada" não pode fingir evidência de SERP.
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse({
    electedBy: "published_declaration", keywordId: "kw-a", url: null, canonical: null, electedAt: NOW,
    evidence: { competitorOverlap: 3, devicesAgreeing: 2, devicesObserved: 2, score: 13 },
  }).success, false);

  // Nem uma manual pode existir sem o motivo de quem decidiu.
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse({
    electedBy: "human", keywordId: "kw-a", actorUserId: "user-1", electedAt: NOW,
  }).success, false);
});

test("E2 · o território aceita a primária e continua aceitando a ausência dela", () => {
  const base = {
    schemaVersion: 1,
    territoryRef: buildTerritoryRef("11111111-1111-4111-8111-111111111111"),
    brandId: "brand-1",
    existingSiloRef: null,
    name: "Skincare facial",
    centralEntity: "skincare facial",
    macroIntent: "sustentar autoridade sobre skincare facial",
    boundary: { includes: ["skincare facial"], excludes: [] },
    narrative: { statement: "Do básico ao ritual.", continuity: "coherent", brandAlignment: "aligned", rationale: ["Sustenta."] },
    discovery: emptyTerritoryDiscovery(),
    territoryKind: "new",
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "ui",
    lifecycleStatus: "candidate",
    decisionState: "pending",
    publicationProtection: "unpublished",
    slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
    lineage: emptyTerritoryLineage(),
    consolidation: null,
    pendingOperation: null,
    conflicts: [],
    reasons: ["Proposto."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
  };

  // Todo território anterior continua válido: o campo é aditivo num payload jsonb.
  const semPrimaria = TerritoryCandidateSchema.safeParse(base);
  assert.equal(semPrimaria.success, true);
  assert.equal(semPrimaria.success ? semPrimaria.data.primaryKeyword : "faltou", undefined);

  const comPrimaria = TerritoryCandidateSchema.safeParse({
    ...base,
    primaryKeyword: { electedBy: "serp", keywordId: "kw-a", evidence: { competitorOverlap: 3, devicesAgreeing: 2, devicesObserved: 2, score: 14 }, electedAt: NOW },
  });
  assert.equal(comPrimaria.success, true);
  assert.equal(comPrimaria.success ? comPrimaria.data.primaryKeyword?.keywordId : null, "kw-a");
});

test("E3 · a keyword do Arquiteto aceita a declaração e continua válida sem ela", () => {
  const sem = ArchitectKeywordSchema.safeParse({ id: "kw-a", keyword: "skincare facial" });
  assert.equal(sem.success, true);

  const com = ArchitectKeywordSchema.safeParse({
    id: "kw-a",
    keyword: "skincare facial",
    editorialUnitDeclaration: { source: "published", unit: "silo", url: "https://marca.com.br/a", canonical: null, observedAt: NOW },
  });
  assert.equal(com.success, true);
  assert.equal(com.success ? com.data.editorialUnitDeclaration?.source : null, "published");
});

/* ============ F · a matriz de dispositivos e a SERP inteira ============== */

const entradaSerp = {
  brandId: "brand-1",
  articleId: "article-1",
  articleDnaVersionId: "dna-v1",
  keywordId: "kw-1",
  keywordDnaVersionId: "kwdna-1",
  keyword: "skincare facial",
  language: "pt",
  location: "Brasil",
  device: "desktop",
  resultLimit: 10,
  version: 1,
  previousSnapshotId: null,
  requiredTopics: [],
  articleEntities: [],
} as unknown as SerpSearchInput;

const resposta = (items: unknown[]) => ({ status_code: 20000, tasks: [{ id: "task-1", status_code: 20000, result: [{ items }] }] });

test("F1 · o sistema operacional é opcional e nulo por padrão: coleta antiga continua válida", () => {
  const snapshot = SerpResearchSnapshotSchema.parse(
    normalizeDataForSeoSerpResponse(resposta([{ type: "organic", rank_absolute: 1, rank_group: 1, title: "T", url: "https://a.com/p", description: "d" }]), entradaSerp, { locationCode: 2076, languageCode: "pt-BR" }),
  );
  assert.equal(snapshot.operatingSystem, null);

  const comSistema = normalizeDataForSeoSerpResponse(
    resposta([{ type: "organic", rank_absolute: 1, rank_group: 1, title: "T", url: "https://a.com/p", description: "d" }]),
    { ...entradaSerp, device: "mobile", operatingSystem: "ios" },
    { locationCode: 2076, languageCode: "pt-BR" },
  );
  assert.equal(comSistema.operatingSystem, "ios");
  assert.equal(serpLensOf(comSistema), "mobile-ios");
});

test("F2 · os termos do related_searches moram em items[]: o bloco deixa de chegar vazio", () => {
  /*
   * O bloco real da DataForSEO traz os termos como STRINGS dentro de `items`,
   * e o normalizador lia `item.title` do bloco — que vem nulo. Resultado: um
   * sinal legítimo do Google chegava vazio ao Arquiteto.
   */
  const snapshot = normalizeDataForSeoSerpResponse(
    resposta([
      { type: "organic", rank_absolute: 1, rank_group: 1, title: "T", url: "https://a.com/p", description: "d" },
      { type: "related_searches", rank_absolute: 2, rank_group: 2, title: null, items: ["skincare coreano", "rotina de skincare"] },
    ]),
    entradaSerp,
    { locationCode: 2076, languageCode: "pt-BR" },
  );

  assert.deepEqual(snapshot.relatedSearches.map(item => item.term).sort(), ["rotina de skincare", "skincare coreano"]);
});

test("F3 · o mesmo bloco em formato de objeto também é lido", () => {
  const snapshot = normalizeDataForSeoSerpResponse(
    resposta([
      { type: "organic", rank_absolute: 1, rank_group: 1, title: "T", url: "https://a.com/p", description: "d" },
      { type: "related_searches", rank_absolute: 2, rank_group: 2, items: [{ title: "ácido hialurônico" }, { keyword: "niacinamida" }] },
    ]),
    entradaSerp,
    { locationCode: 2076, languageCode: "pt-BR" },
  );

  assert.deepEqual(snapshot.relatedSearches.map(item => item.term).sort(), ["niacinamida", "ácido hialurônico"]);
});

/* ============ G · a origem 2 ligada de ponta a ponta na proposta ========== */

const clusterDe = (clusterRef: string, memberKeywordIds: string[]): ClusterAnalysis => ({
  clusterRef,
  memberKeywordIds,
  label: clusterRef,
  headKeywordId: memberKeywordIds[0],
  ambiguousHeadKeywordIds: [],
  destination: "new_silo_candidate",
  suggestedTerritoryRef: null,
  suggestedTerritoryLabel: null,
  alternativeTerritoryRefs: [],
  scores: {
    coherence: { value: 0.8, reasons: [] },
    siloFit: { value: 0.8, reasons: [] },
    depth: { value: 0.8, reasons: [] },
    publishedEvidence: { value: 0, reasons: [] },
  },
  confidence: "alta",
  reason: "profundidade suficiente para silo próprio",
});

const sinalDe = (keywordId: string, text: string): KeywordDnaSignals => ({
  keywordId,
  text,
  intent: "Informativa",
  funnel: "TOFU",
  semanticState: "conclusive",
  confidence: "alta",
  centralEntity: "skincare",
  modifiers: [],
  secondaryIntent: null,
  perceivedProblem: null,
  audience: null,
  desiredResult: null,
  editorialType: null,
  awarenessLevel: null,
  journeyStage: null,
  cannibalizationNote: null,
  dnaVersionId: `dna:${keywordId}:v1`,
  dnaContentHash: `sha256:${keywordId}`,
});

const analiseDe = (clusters: ClusterAnalysis[]): ArchitectureAnalysis => ({
  clusters,
  summary: {
    keywords: clusters.reduce((total, item) => total + item.memberKeywordIds.length, 0),
    clusters: clusters.length,
    strengthening: 0,
    newSilos: clusters.length,
    insufficient: 0,
    ambiguous: 0,
    confidence: "alta",
  },
  narrative: [],
  baseHash: "base:origem-do-silo",
});

const slugSimples = (value: string) => value.toLocaleLowerCase("pt-BR").trim().split(" ").join("-");

const CLUSTER = clusterDe("skincare facial", ["kw-cabeca", "kw-publicada", "kw-apoio"]);
const SINAIS = [
  sinalDe("kw-cabeca", "skincare"),
  sinalDe("kw-publicada", "skincare facial"),
  sinalDe("kw-apoio", "skincare facial em casa"),
];

const propostaCom = (declarations?: Map<string, EditorialUnitDeclaration>) => buildArchitectureWorkingProposal({
  analysis: analiseDe([{ ...CLUSTER, memberKeywordIds: ["kw-cabeca", "kw-publicada", "kw-apoio"] }]),
  existingSilos: [],
  keywords: SINAIS,
  declarations,
  slugOf: slugSimples,
});

test("G1 · a keyword publicada declarada Silo vira a primária E a semente, no lugar da cabeça léxica", () => {
  /*
   * A cabeça do cluster é escolhida por proximidade de texto. Quando o site já
   * tem uma página no ar declarada Silo, quem manda é o fato publicado — o
   * léxico não sabe o que está no ar.
   */
  const semDeclaracao = propostaCom();
  const siloSem = semDeclaracao.silos.find(item => item.source === "proposed");
  assert.equal(siloSem?.seedKeywordId, "kw-cabeca");
  assert.equal(siloSem?.primaryKeywordDeclaration, null);

  const comDeclaracao = propostaCom(new Map([
    ["kw-publicada", EditorialUnitDeclarationSchema.parse({
      source: "published", unit: "silo", url: "https://marca.com.br/skincare-facial", canonical: null, observedAt: NOW,
    })],
  ]));
  const siloCom = comDeclaracao.silos.find(item => item.source === "proposed");
  assert.equal(siloCom?.primaryKeywordDeclaration?.keywordId, "kw-publicada");
  assert.equal(siloCom?.seedKeywordId, "kw-publicada");
  assert.match(siloCom?.reason || "", /skincare facial/);
});

test("G2 · uma publicada declarada ARTIGO não vira primária de Silo", () => {
  const proposta = propostaCom(new Map([
    ["kw-publicada", EditorialUnitDeclarationSchema.parse({
      source: "published", unit: "article", url: "https://marca.com.br/serum", canonical: null, observedAt: NOW,
    })],
  ]));
  const silo = proposta.silos.find(item => item.source === "proposed");
  assert.equal(silo?.primaryKeywordDeclaration, null);
  assert.equal(silo?.seedKeywordId, "kw-cabeca");
});

test("G3 · duas publicadas declaradas Silo no mesmo grupo viram DOIS Silos, cada um com a sua primária", () => {
  /*
   * Antes a proposta recusava eleger — não fundia, mas também não resolvia.
   * Agora cada página no ar declarada Silo ganha o próprio Silo, com a
   * primária dela: é a estrutura que já existe, lida como está. Fundir as
   * duas num território só apagaria uma página publicada.
   */
  const declarada = (url: string) => EditorialUnitDeclarationSchema.parse({
    source: "published", unit: "silo", url, canonical: null, observedAt: NOW,
  });
  const proposta = propostaCom(new Map([
    ["kw-publicada", declarada("https://marca.com.br/a")],
    ["kw-apoio", declarada("https://marca.com.br/b")],
  ]));

  const declarados = proposta.silos.filter(item => item.primaryKeywordDeclaration);
  assert.deepEqual(declarados.map(item => item.primaryKeywordDeclaration?.keywordId).sort(), ["kw-apoio", "kw-publicada"]);
  assert.deepEqual(declarados.map(item => item.primaryKeywordDeclaration?.declaration.url).sort(), ["https://marca.com.br/a", "https://marca.com.br/b"]);
});

test("G4 · a proposta continua determinística: nenhum carimbo de tempo entra nela", () => {
  const declarations = new Map([
    ["kw-publicada", EditorialUnitDeclarationSchema.parse({
      source: "published", unit: "silo", url: "https://marca.com.br/skincare-facial", canonical: null, observedAt: NOW,
    })],
  ]);
  /*
   * Recalcular o mesmo cenário precisa dar exatamente a mesma proposta: é isso
   * que faz o F5 não perder o que foi processado. Por isso o `electedAt` é
   * carimbado na materialização, não aqui.
   */
  assert.deepEqual(propostaCom(declarations).silos, propostaCom(declarations).silos);
});

test("G5 · o draft do Silo carrega a primária eleita — e segue sem ela quando não houve eleição", () => {
  const selecionada = selectPublishedSiloDeclaration([{
    keywordId: "kw-publicada",
    label: "skincare facial",
    declaration: EditorialUnitDeclarationSchema.parse({
      source: "published", unit: "silo", url: "https://marca.com.br/skincare-facial", canonical: null, observedAt: NOW,
    }),
  }]);
  assert.equal(selecionada.state, "FOUND");
  if (selecionada.state !== "FOUND") return;

  const draft = manualSiloCandidateDraft({
    name: "Skincare facial",
    slug: "skincare-facial",
    primaryKeyword: stampPublishedPrimary(selecionada, NOW),
  });
  const primaria = (draft as { primaryKeyword?: unknown }).primaryKeyword;
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse(primaria).success, true);

  // O draft continua sendo o mínimo válido: nada de entidade ou intenção inventada.
  assert.equal(draft.centralEntity, "");
  assert.equal(draft.macroIntent, "");
  assert.equal("primaryKeyword" in manualSiloCandidateDraft({ name: "Sem primária", slug: null }), false);
});

/* ========= H · a primária aparece na mesa, com a origem sempre dita ======= */

const REF_H = "territory:33333333-3333-4333-8333-333333333333";

const revisaoCom = (over: Record<string, unknown> = {}) => buildTerritorialReviewView({
  territory: {
    territoryRef: REF_H,
    name: "Skincare facial",
    centralEntity: "skincare facial",
    lifecycleStatus: "candidate",
    isPublished: false,
    slug: null,
    canonical: null,
    confirmationBlockers: [],
    confirmationReady: true,
    ...over,
  },
  keywords: [],
  logic: { presence: "not_executed", state: null, targetTerritoryRef: null, reason: null },
  serp: { presence: "not_required", assessment: null },
  ai: { presence: "not_required", proposal: null },
});

test("H1 · sem eleição a mesa DIZ a ausência — não mostra a entidade central no lugar", () => {
  const view = revisaoCom();
  assert.equal(view.current.primaryKeyword, null);
  assert.equal(describeSiloPrimaryKeyword(null), "Este Silo ainda não tem keyword primária eleita.");
});

test("H2 · a primária publicada chega à mesa com a origem e o endereço", () => {
  const view = revisaoCom({
    primaryKeyword: {
      electedBy: "published_declaration",
      keywordId: "kw-publicada",
      url: "https://marca.com.br/skincare-facial",
      canonical: null,
      electedAt: NOW,
    },
    primaryKeywordLabel: "skincare facial",
  });

  assert.equal(view.current.primaryKeyword?.keywordId, "kw-publicada");
  assert.equal(view.current.primaryKeyword?.electedBy, "published_declaration");
  assert.match(view.current.primaryKeyword?.note || "", /declarada Silo pelo site/);
  assert.match(view.current.primaryKeyword?.note || "", /skincare facial/);
});

test("H3 · cada origem tem a sua frase: SERP mostra evidência, humano mostra motivo", () => {
  const porSerp = describeSiloPrimaryKeyword({
    electedBy: "serp",
    keywordId: "kw-a",
    evidence: { competitorOverlap: 3, devicesAgreeing: 2, devicesObserved: 4, score: 15 },
    electedAt: NOW,
  }, "skincare facial");
  assert.match(porSerp, /eleita pela SERP/);
  assert.match(porSerp, /2\/4 lente/);

  const porHumano = describeSiloPrimaryKeyword({
    electedBy: "human", keywordId: "kw-a", actorUserId: "user-1", reason: "cabeça da linha editorial", electedAt: NOW,
  }, "skincare facial");
  assert.match(porHumano, /decisão humana: cabeça da linha editorial/);

  // Sem o texto da keyword a mesa mostra o id, e não finge um nome.
  assert.match(describeSiloPrimaryKeyword({
    electedBy: "published_declaration", keywordId: "kw-a", url: null, canonical: null, electedAt: NOW,
  }), /"kw-a"/);
});

test("H4 · o painel de revisão renderiza a primária do Silo", () => {
  const fonte = readFileSync(new URL("../modules/arquiteto/territorial-review-panel.tsx", import.meta.url), "utf8")
    // Comentário não é comportamento: um teste que casa com o próprio comentário
    // do arquivo dá falso positivo. Só o código renderizado vale.
    .split("\n").filter(linha => !linha.trim().startsWith("//") && !linha.trim().startsWith("{/*")).join("\n");

  assert.match(fonte, /current\.primaryKeyword/);
  assert.match(fonte, /architect-review-primary-keyword/);
});

/* ====== I · matriz de dispositivos: um universo só, divergência medida ===== */

test("I1 · a divergência é 0 quando as lentes devolvem o mesmo universo, e 1 quando não dividem nada", () => {
  const iguais = lensDivergenceOf([
    observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
    observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
  ]);
  assert.equal(iguais, 0);

  const opostas = lensDivergenceOf([
    observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
    observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["z.com", "w.com"] }),
  ]);
  assert.equal(opostas, 1);

  // Uma lente só não tem com o que discordar: fingir divergência aí seria inventar evidência.
  assert.equal(lensDivergenceOf([observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com"] })]), 0);
});

test("I2 · sustentar-se numa lente divergente conta como robustez, não como fraqueza", () => {
  /*
   * O caso real: o mobile troca o topo por vídeo e devolve outro universo. As
   * duas keywords continuam disputando entre si no desktop. Exigir concordância
   * em duas lentes aqui reprovaria justamente a busca mais sensível a contexto
   * — e partiria em quatro um universo que é um só.
   *
   * Mudou em 2026-09-23 (A7.4 do adendo das 4 lentes do Arquiteto): a dobra
   * exige 3 lentes observadas. O caso é o mesmo, observado em 3 lentes; com 2
   * lentes, ver I2b.
   */
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["m1.com", "m2.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-android", competitorDomains: ["m5.com", "m6.com"] }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["m3.com", "m4.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-android", competitorDomains: ["m7.com", "m8.com"] }),
    ],
  });

  const a = forcas.find(item => item.keywordId === "kw-a");
  assert.ok(a);
  assert.equal(a.devicesObserved, 3);
  assert.equal(a.devicesAgreeing, 1);
  assert.ok(a.lensDivergence >= DEFAULT_SILO_STRENGTH.minLensDivergenceToCount);
  assert.equal(a.divergentLensesHolding, 1);
  // Uma lente que sustenta + o crédito da divergência alcançam o mínimo de duas.
  assert.equal(a.strong, true);
  assert.match(a.lensNote, /MUDA entre dispositivos/);
  assert.doesNotMatch(a.lensNote, /não conta em dobro/);
});

test("I2b · com só 2 lentes observadas, a divergência NÃO conta em dobro: uma lente não decide sozinha", () => {
  // O mesmo universo que muda entre dispositivos, visto em 2 lentes só.
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["m1.com", "m2.com"] }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["m3.com", "m4.com"] }),
    ],
  });

  const a = forcas.find(item => item.keywordId === "kw-a");
  assert.ok(a);
  assert.equal(a.devicesObserved, 2);
  assert.equal(a.devicesAgreeing, 1);
  assert.ok(a.lensDivergence >= DEFAULT_SILO_STRENGTH.minLensDivergenceToCount, "a divergência continua medida");
  assert.equal(a.divergentLensesHolding, 0);
  assert.equal(a.strong, false);
  assert.match(a.lensNote, /MUDA entre dispositivos/);
  assert.match(a.lensNote, /Com 2 lentes observadas a divergência não conta em dobro: o mínimo é 3\./);

  // O mínimo é limiar visível: devolvê-lo a 2 restaura a regra de 2026-09-20.
  const antiga = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["m1.com", "m2.com"] }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["m3.com", "m4.com"] }),
    ],
    thresholds: { ...DEFAULT_SILO_STRENGTH, minLensesForDivergenceCredit: 2 },
  }).find(item => item.keywordId === "kw-a");
  assert.equal(antiga?.divergentLensesHolding, 1);
  assert.equal(antiga?.strong, true);
});

test("I3 · com as lentes concordando, o crédito não existe e uma lente só continua reprovando", () => {
  const forcas = measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
    ],
  });

  for (const forca of forcas) {
    assert.equal(forca.lensDivergence, 0);
    assert.equal(forca.divergentLensesHolding, 0);
    assert.equal(forca.strong, false);
    assert.match(forca.lensNote, /Uma lente só observada/);
  }
});

test("I4 · quando o universo muda entre dispositivos, o par se mantém pela lente que resistiu", () => {
  // Mudou em 2026-09-23 (A7.4): a dobra exige 3 lentes em que as duas foram observadas; com 2, ver I4b.
  const afinidade = measureKeywordAffinity({
    left: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-android", competitorDomains: ["m1.com", "m2.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["m5.com", "m6.com"] }),
    ],
    right: [
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-android", competitorDomains: ["m3.com", "m4.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["m7.com", "m8.com"] }),
    ],
  });

  assert.equal(afinidade.lensesAgreeing, 1);
  assert.equal(afinidade.lensesCompared, 3);
  assert.ok(afinidade.lensDivergence >= DEFAULT_AFFINITY.minLensDivergenceToCount);
  assert.equal(afinidade.supportsGrouping, true);
  assert.match(afinidade.reason, /universo mudando entre dispositivos/);
});

test("I4b · 2 lentes com divergência alta e 1 concordante NÃO sustentam o agrupamento", () => {
  const afinidade = measureKeywordAffinity({
    left: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-android", competitorDomains: ["m1.com", "m2.com"] }),
    ],
    right: [
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-android", competitorDomains: ["m3.com", "m4.com"] }),
    ],
  });

  assert.equal(afinidade.lensesAgreeing, 1);
  assert.equal(afinidade.lensesCompared, 2);
  assert.ok(afinidade.lensDivergence >= DEFAULT_AFFINITY.minLensDivergenceToCount);
  assert.equal(afinidade.supportsGrouping, false);
  assert.match(afinidade.reason, /com 2 lente\(s\) comparável\(is\) a divergência não conta em dobro: o mínimo é 3\./);
});

test("I4c · as lentes COMPARÁVEIS são as observadas dos dois lados: 4 de um lado e 2 do outro não dobram", () => {
  const afinidade = measureKeywordAffinity({
    left: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-a", lens: "desktop-macos", competitorDomains: ["d1.com", "d2.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-android", competitorDomains: ["m1.com", "m2.com"] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["i1.com", "i2.com"] }),
    ],
    right: [
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
      observacao({ keywordId: "kw-b", lens: "mobile-android", competitorDomains: ["m3.com", "m4.com"] }),
    ],
  });

  assert.equal(afinidade.lensesCompared, 2);
  assert.equal(afinidade.lensesAgreeing, 1);
  assert.equal(afinidade.supportsGrouping, false);
});

/*
 * PORTÃO DE DATAS NA SERP POR KEYWORD (correção da A2, 2026-09-23). A
 * "Consultar nas 4 lentes" não recoleta: lentes de datas diferentes chegavam
 * à afinidade e à força sem marca, e a divergência entre elas — que pode ser
 * só o tempo — contava em dobro.
 */
const DIA = 24 * 60 * 60 * 1000;
const hoje = "2026-09-23T12:00:00.000Z";
const haDias = (dias: number) => new Date(Date.parse(hoje) - dias * DIA).toISOString();

test("I4d · lentes da mesma keyword com mais de 7 dias de diferença: a divergência NÃO conta em dobro, e é dito", () => {
  const par = (datasDaEsquerda: readonly string[]) => measureKeywordAffinity({
    left: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], collectedAt: datasDaEsquerda[0] }),
      observacao({ keywordId: "kw-a", lens: "mobile-android", competitorDomains: ["m1.com", "m2.com"], collectedAt: datasDaEsquerda[1] }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["m5.com", "m6.com"], collectedAt: datasDaEsquerda[2] }),
    ],
    right: [
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], collectedAt: hoje }),
      observacao({ keywordId: "kw-b", lens: "mobile-android", competitorDomains: ["m3.com", "m4.com"], collectedAt: hoje }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["m7.com", "m8.com"], collectedAt: hoje }),
    ],
  });

  // Mesma época (7 dias exatos não marcam): o caso de I4, que sustenta.
  const mesmaEpoca = par([hoje, haDias(7), hoje]);
  assert.equal(mesmaEpoca.lensDatesSpreadDays, 7);
  assert.equal(mesmaEpoca.supportsGrouping, true);
  assert.doesNotMatch(mesmaEpoca.reason, /datas diferentes/);

  // A macOS/android da esquerda 9 dias mais velha: a dobra cai e a razão diz por quê.
  const datasDiferentes = par([hoje, haDias(9), hoje]);
  assert.equal(datasDiferentes.lensDatesSpreadDays, 9);
  assert.equal(datasDiferentes.lensesCompared, 3);
  assert.equal(datasDiferentes.supportsGrouping, false);
  assert.match(datasDiferentes.reason, /Lentes de datas diferentes \(9 dias entre as lentes da mesma keyword\)/);

  // Datas de keywords DIFERENTES não se comparam: cada busca tem a sua coleta.
  const cadaUmaNaSuaEpoca = par([haDias(20), haDias(20), haDias(20)]);
  assert.equal(cadaUmaNaSuaEpoca.lensDatesSpreadDays, 0);
  assert.equal(cadaUmaNaSuaEpoca.supportsGrouping, true);
});

test("I2c · a força também não credita a divergência entre lentes de datas diferentes", () => {
  const forcas = (dataAntiga: string) => measureCompetitiveStrength({
    observations: [
      observacao({ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], collectedAt: hoje }),
      observacao({ keywordId: "kw-a", lens: "mobile-ios", competitorDomains: ["m1.com", "m2.com"], collectedAt: dataAntiga }),
      observacao({ keywordId: "kw-a", lens: "mobile-android", competitorDomains: ["m5.com", "m6.com"], collectedAt: hoje }),
      observacao({ keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], collectedAt: hoje }),
      observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["m3.com", "m4.com"], collectedAt: hoje }),
      observacao({ keywordId: "kw-b", lens: "mobile-android", competitorDomains: ["m7.com", "m8.com"], collectedAt: hoje }),
    ],
  }).find(item => item.keywordId === "kw-a");

  const mesmaEpoca = forcas(haDias(2));
  assert.equal(mesmaEpoca?.divergentLensesHolding, 1);
  assert.equal(mesmaEpoca?.strong, true);

  const antiga = forcas(haDias(10));
  assert.equal(antiga?.lensDatesSpreadDays, 10);
  assert.equal(antiga?.divergentLensesHolding, 0);
  assert.equal(antiga?.strong, false);
  assert.match(antiga?.lensNote || "", /Lentes de datas diferentes \(10 dias\): a divergência pode ser só o tempo e não conta em dobro\./);
});

test("K6e · a observação da SERP por keyword leva a data da lente; o plano lê só `meta` e não oferece recoleta", () => {
  const doCache = {
    lens: "mobile-ios", depth: 10, competitorDomains: ["a.com"], organicCount: 3, itemTypes: [], questions: [],
    relatedSearches: [], aiOverviewDomains: [], commercialSignals: false,
  };
  const comData = competitiveObservationFromCache("kw", { device: "mobile", operatingSystem: "ios" }, doCache, hoje);
  assert.equal(comData.collectedAt, hoje);
  assert.equal("collectedAt" in competitiveObservationFromCache("kw", { device: "mobile", operatingSystem: "ios" }, doCache), false);

  const rotaKw = readFileSync(new URL("../app/api/arquiteto/keyword-serp/route.ts", import.meta.url), "utf8")
    .replace(/\r\n/g, "\n").split("\n").filter(linha => !/^\s*(\/\/|\*|\/\*)/.test(linha)).join("\n");
  // A recoleta não existe nesta rota: o plano não a oferece.
  assert.match(rotaKw, /buildSerpPaidPlan\(\{ lenses: parsed\.data\.lenses, slots, payMissingExtraLenses: true, recollectStaleLenses: false, recollectAvailable: false \}\)/);
  // O plano lê `meta`; a execução, `observation`.
  assert.match(rotaKw, /\{ mode: soPlano \? "meta" : "observation", now \}/);
  // Acerto e coleta nova levam a data da lente.
  assert.match(rotaKw, /paraObservacao\(item\.alvo, consulta\.hit\.observation, consulta\.hit\.meta\.collectedAt\)/);
  assert.match(rotaKw, /paraObservacao\(item\.alvo, coleta\.observation, coleta\.meta\.collectedAt\)/);
});

test("I5 · a discordância entre origens não some: vira registro para a decisão humana", () => {
  const publicado = electPrimaryFromPublishedDeclaration({
    keywords: [publicada("kw-publicada", "silo", "https://marca.com.br/a")],
    electedAt: NOW,
  });
  const serp = electPrimaryFromSerp({
    strengths: measureCompetitiveStrength({
      observations: [
        // A vencedora da SERP é a de universo mais amplo, não a primeira da ordem alfabética.
        observacao({ keywordId: "kw-serp", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"], itemTypes: ["video", "ai_overview"] }),
        observacao({ keywordId: "kw-serp", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"], itemTypes: ["video"] }),
        observacao({ keywordId: "kw-outra", lens: "desktop-windows", competitorDomains: ["x.com", "y.com"] }),
        observacao({ keywordId: "kw-outra", lens: "mobile-ios", competitorDomains: ["x.com", "y.com"] }),
      ],
    }),
    electedAt: NOW,
  });
  assert.equal(serp.state === "ELECTED" ? serp.primary.keywordId : null, "kw-serp");

  const eleicao = electSiloPrimaryKeyword({ published: publicado, serp, human: null });
  assert.equal(eleicao.state, "ELECTED");
  if (eleicao.state !== "ELECTED") return;

  // O fato publicado continua vencendo...
  assert.equal(eleicao.primary.keywordId, "kw-publicada");
  // ...e a evidência que discordou fica registrada em vez de ser descartada.
  assert.equal(eleicao.dissent?.electedBy, "serp");
  assert.equal(eleicao.dissent?.keywordId, "kw-serp");

  // Concordando, não há discordância a registrar.
  const soPublicado = electSiloPrimaryKeyword({ published: publicado, serp: null, human: null });
  assert.equal(soPublicado.state === "ELECTED" ? soPublicado.dissent : "faltou", undefined);
});

/* ===== J · publicado: reforço com secundárias e troca como pendência ====== */

const desafiante = (over: Partial<SubstitutionChallenger> & { keywordId: string }): SubstitutionChallenger => ({
  keywordDnaId: `dna:${over.keywordId}`,
  keyword: over.keywordId,
  volumeSearch: 1000,
  serpSupportsSameUniverse: true,
  ...over,
});

const vigente = (over: Partial<PublishedPrimary> = {}): PublishedPrimary => ({
  keywordId: "kw-atual",
  keywordDnaId: "dna:kw-atual",
  keyword: "skincare facial",
  volumeSearch: 500,
  policy: "free",
  ...over,
});

test("J1 · volume alto com SERP do mesmo universo vira PROPOSTA pendente, nunca troca aplicada", () => {
  const proposta = proposePrimarySubstitution({
    current: vigente(),
    challengers: [desafiante({ keywordId: "kw-nova", keyword: "rotina de skincare", volumeSearch: 2000 })],
  });

  assert.equal(proposta.state, "PROPOSED");
  // Pendente é o único status que este módulo emite: confirmar é ato humano.
  assert.equal(proposta.decision?.status, "pending");
  assert.equal(proposta.decision?.previousKeywordId, "kw-atual");
  assert.equal(proposta.decision?.selectedKeywordId, "kw-nova");
  assert.equal(proposta.decision?.decidedAt, undefined);
  assert.deepEqual(proposta.blockers, []);
});

test("J2 · primária TRAVADA continua produzindo a proposta, com o bloqueio dito", () => {
  const proposta = proposePrimarySubstitution({
    current: vigente({ policy: "locked" }),
    challengers: [desafiante({ keywordId: "kw-nova", volumeSearch: 2000 })],
  });

  assert.equal(proposta.state, "PROPOSED");
  assert.equal(proposta.decision?.status, "pending");
  assert.ok(proposta.blockers.includes("PRIMARY_POLICY_LOCKED"));
  assert.match(proposta.note, /TRAVADA/);
  assert.match(proposta.note, /liberar a política/);
});

test("J3 · sem SERP do mesmo universo, volume sozinho não troca primária de página publicada", () => {
  const proposta = proposePrimarySubstitution({
    current: vigente(),
    challengers: [desafiante({ keywordId: "kw-vizinha", volumeSearch: 9000, serpSupportsSameUniverse: false })],
  });

  assert.equal(proposta.state, "NONE");
  assert.equal(proposta.decision, null);
  const recusada = proposta.candidates.find(item => item.keywordId === "kw-vizinha");
  assert.equal(recusada?.status, "rejected");
  assert.match(recusada?.reason || "", /não sustenta/);
});

test("J4 · empate técnico não mexe no que está publicado e indexado", () => {
  const proposta = proposePrimarySubstitution({
    current: vigente({ volumeSearch: 1000 }),
    challengers: [desafiante({ keywordId: "kw-quase", volumeSearch: 1200 })],
  });

  assert.equal(proposta.state, "NONE");
  const recusada = proposta.candidates.find(item => item.keywordId === "kw-quase");
  assert.match(recusada?.reason || "", new RegExp(String(DEFAULT_SUBSTITUTION.minVolumeRatio) + "x"));
});

test("J5 · volume ausente não vira zero: sem os dois números não há comparação", () => {
  const semVigente = proposePrimarySubstitution({
    current: vigente({ volumeSearch: null }),
    challengers: [desafiante({ keywordId: "kw-nova", volumeSearch: 9000 })],
  });
  assert.equal(semVigente.state, "NONE");
  assert.match(semVigente.note, /não tem volume medido/);

  const semDesafiante = proposePrimarySubstitution({
    current: vigente(),
    challengers: [desafiante({ keywordId: "kw-nova", volumeSearch: null })],
  });
  assert.equal(semDesafiante.state, "NONE");
});

test("J6 · a proposta fala o vocabulário que o acervo já grava", () => {
  const proposta = proposePrimarySubstitution({
    current: vigente(),
    challengers: [desafiante({ keywordId: "kw-nova", volumeSearch: 2000 })],
  });

  // Nenhum contrato novo: são os mesmos schemas que adapters e confirmação usam.
  for (const candidata of proposta.candidates) {
    assert.equal(PrimaryKeywordCandidateSchema.safeParse(candidata).success, true);
  }
  assert.equal(PrimaryKeywordDecisionSchema.safeParse(proposta.decision).success, true);
  assert.equal(proposta.candidates.find(item => item.keywordId === "kw-atual")?.status, "current");
  assert.equal(proposta.candidates.find(item => item.keywordId === "kw-nova")?.source, "serp");
});

test("J7 · o reforço respeita o teto do domínio e diz por que cada uma ficou de fora", () => {
  const plano = planPublishedReinforcement({
    currentKeywordCount: 4,
    secondaries: [
      desafiante({ keywordId: "kw-1", volumeSearch: 900 }),
      desafiante({ keywordId: "kw-2", volumeSearch: 800 }),
      desafiante({ keywordId: "kw-3", volumeSearch: 700 }),
      desafiante({ keywordId: "kw-sem-serp", volumeSearch: 5000, serpSupportsSameUniverse: false }),
    ],
  });

  // O teto vem do domínio, não de um número redigitado aqui.
  assert.equal(plano.ceiling, MAX_KEYWORDS_PER_ARTICLE);
  assert.deepEqual(plano.admitted.map(item => item.keywordId), ["kw-1", "kw-2"]);

  // "Sobrou do teto" e "a SERP não sustenta" são recusas diferentes, e a mesa vê qual foi.
  assert.match(plano.refused.find(item => item.keywordId === "kw-3")?.reason || "", /não há vaga/);
  assert.match(plano.refused.find(item => item.keywordId === "kw-sem-serp")?.reason || "", /não sustenta/);
});

test("J8 · página no teto não recebe reforço nenhum", () => {
  const plano = planPublishedReinforcement({
    currentKeywordCount: MAX_KEYWORDS_PER_ARTICLE,
    secondaries: [desafiante({ keywordId: "kw-1" })],
  });

  assert.deepEqual(plano.admitted, []);
  assert.match(plano.note, /já está no teto/);
});

/* ===== K · a coleta por keyword e a leitura do grupo publicado ============ */

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  // Comentário não é comportamento: casar com o próprio comentário do arquivo
  // dá falso positivo. Só o código vale.
  .split("\n")
  .filter(linha => {
    const limpa = linha.trim();
    return !limpa.startsWith("//") && !limpa.startsWith("*") && !limpa.startsWith("/*") && !limpa.startsWith("{/*");
  })
  .join("\n");

test("K1 · as quatro lentes do produto são o padrão da coleta", () => {
  assert.deepEqual(
    DEFAULT_SERP_LENSES.map(lens => serpLensOf(lens)),
    ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"],
  );
});

test("K2 · as lentes do Arquiteto SÃO as do cache de SERP — uma autoridade só", () => {
  /*
   * Antes K2 fixava o estado do registro por escopo (empty/partial/complete).
   * Esse registro deixou de existir em 2026-09-23: a persistência da SERP por
   * keyword passou a ser o cache, uma entrada por keyword × lente. A
   * cobertura parcial continua declarada — pelas `gaps` da resposta (K6).
   *
   * O que precisa ficar preso agora: a lista de lentes do Arquiteto é a MESMA
   * referência do cache. Uma lente escrita diferente aqui viraria outra chave,
   * falta de cache e chamada paga repetida.
   */
  assert.equal(DEFAULT_SERP_LENSES, SERP_CACHE_LENSES);
  assert.equal(SerpLensSchema, SerpCacheLensSchema);

  // Sistema operacional deixou de ser anulável: `desktop` sem `os` é servido
  // como `windows` pelo provider, e lente sem sistema rotularia outra SERP.
  assert.equal(SerpLensSchema.safeParse({ device: "desktop", operatingSystem: null }).success, false);
  for (const lens of DEFAULT_SERP_LENSES) assert.equal(SerpLensSchema.safeParse(lens).success, true);
});

test("K3 · o registro por escopo não é mais escrito: o cache é a persistência", () => {
  /*
   * Antes K3 provava que a linha `keyword_serp_observations` era recusada
   * quando não concordava consigo mesma. A linha deixou de ser gravada — ela
   * duplicava o cache e obrigava a rota a reler e regravar o Silo inteiro a
   * cada lote. A guarda agora é que ela não volte por engano.
   */
  const exportados = Object.keys(keywordSerpRecord).sort();
  assert.deepEqual(exportados, ["DEFAULT_SERP_LENSES", "SerpLensSchema"]);

  assert.throws(
    () => readFileSync(new URL("../lib/server/arquiteto-keyword-serp-store.ts", import.meta.url), "utf8"),
    /ENOENT/,
    "o store do registro por escopo voltou a existir",
  );

  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");
  assert.doesNotMatch(rota, /keyword_serp_observations|saveKeywordSerpObservations|readbackKeywordSerpObservations/);
  assert.doesNotMatch(rota, /arquiteto-keyword-serp-store/);
});

const obsDe = (keywordId: string, lens: string, dominios: string[]) => ({
  keywordId, lens, competitorDomains: dominios, organicCount: 10, itemTypes: [], questions: [], commercialSignals: false,
});

test("K4 · sem SERP da primária a leitura RECUSA em vez de comparar as secundárias entre si", () => {
  const leitura = readPublishedGroupFromSerp({
    primary: { keywordId: "kw-atual", keywordDnaId: "dna:atual", keyword: "skincare facial", volumeSearch: 500, policy: "locked" },
    secondaries: [{ keywordId: "kw-b", keywordDnaId: "dna:b", keyword: "rotina de skincare", volumeSearch: 9000 }],
    observations: [obsDe("kw-b", "desktop-windows", ["x.com", "y.com"])],
    currentKeywordCount: 2,
  });

  assert.equal(leitura.substitution.state, "NONE");
  assert.ok(leitura.substitution.blockers.includes("NO_SERP_FOR_CURRENT_PRIMARY"));
  // Nada entra no reforço: sem a primária observada, o reforço seria palpite.
  assert.deepEqual(leitura.reinforcement.admitted, []);
});

test("K5 · com a SERP coletada, a secundária do mesmo universo reforça e pode desafiar a primária", () => {
  const leitura = readPublishedGroupFromSerp({
    primary: { keywordId: "kw-atual", keywordDnaId: "dna:atual", keyword: "skincare facial", volumeSearch: 500, policy: "locked" },
    secondaries: [
      { keywordId: "kw-junto", keywordDnaId: "dna:junto", keyword: "rotina de skincare", volumeSearch: 2000 },
      { keywordId: "kw-fora", keywordDnaId: "dna:fora", keyword: "maquiagem", volumeSearch: 8000 },
    ],
    observations: [
      obsDe("kw-atual", "desktop-windows", ["x.com", "y.com"]),
      obsDe("kw-atual", "mobile-ios", ["x.com", "y.com"]),
      obsDe("kw-junto", "desktop-windows", ["x.com", "y.com"]),
      obsDe("kw-junto", "mobile-ios", ["x.com", "y.com"]),
      obsDe("kw-fora", "desktop-windows", ["z1.com", "z2.com"]),
      obsDe("kw-fora", "mobile-ios", ["z3.com", "z4.com"]),
    ],
    currentKeywordCount: 3,
  });

  const junto = leitura.affinities.find(item => item.keywordId === "kw-junto");
  const fora = leitura.affinities.find(item => item.keywordId === "kw-fora");
  assert.equal(junto?.affinity.supportsGrouping, true);
  assert.equal(fora?.affinity.supportsGrouping, false);

  assert.deepEqual(leitura.reinforcement.admitted.map(item => item.keywordId), ["kw-junto"]);
  assert.match(leitura.reinforcement.refused.find(item => item.keywordId === "kw-fora")?.reason || "", /não sustenta/);

  // Volume 4x acima e SERP do mesmo universo: qualifica — e a política travada
  // não esconde a proposta, só impede aplicá-la.
  assert.equal(leitura.substitution.state, "PROPOSED");
  assert.equal(leitura.substitution.decision?.selectedKeywordId, "kw-junto");
  assert.ok(leitura.substitution.blockers.includes("PRIMARY_POLICY_LOCKED"));

  assert.deepEqual(leitura.lenses, ["desktop-windows", "mobile-ios"]);
});

test("K6 · a rota consulta o CACHE antes da credencial e só paga as lentes que faltam", () => {
  /*
   * Antes K6 exigia `saveKeywordSerpObservations` + `readbackKeywordSerpObservations`
   * e a lente passada ao snapshot. Com o cache, a ordem é o que protege o
   * crédito: cache primeiro (em modo `observation`, sem corpo — R8 da SDD de
   * egress), credencial e quota só com faltantes, uso só do que foi pago.
   */
  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");

  // O produto cartesiano keyword × lente continua sustentando a divergência.
  assert.match(rota, /keywords\.flatMap/);
  assert.match(rota, /lenses\.map/);
  // A lente enviada é a lente da chave: nada é suposto.
  assert.match(rota, /lens: alvo\.lens, endpoint: "advanced"/);
  assert.match(rota, /readDataForSeoTargetCodes\(\)/);

  // 1. Cache primeiro, só a observação compacta, com um relógio por requisição.
  const consulta = rota.indexOf("await lookupSerpCache(");
  const resolucao = rota.indexOf("await resolveDataForSeoCompatibilityConfig(");
  assert.ok(consulta >= 0, "a rota não consulta o cache");
  assert.ok(resolucao >= 0, "a rota não resolve a credencial");
  assert.ok(consulta < resolucao, "o cache precisa ser consultado ANTES de resolver credencial e quota");
  // Mudou em 2026-09-23 (correção da A2): o plano lê só `meta`; a execução, `observation`.
  assert.match(rota, /lookupSerpCache\(pipelineContext, .*\{ mode: soPlano \? "meta" : "observation", now \}\)/);
  assert.doesNotMatch(rota, /mode: "body"/);
  assert.equal((rota.match(/new Date\(\)/g) || []).length, 1, "um único relógio por requisição");

  // Banco fora não derruba a coleta: a leitura do cache está num try próprio.
  const tryAntes = rota.lastIndexOf("try {", consulta);
  const tryDaRota = rota.indexOf("try {");
  assert.ok(tryAntes > tryDaRota, "a leitura do cache precisa de um try próprio, que não aborte a rota");

  // 2. Só resolve com faltantes, e a quota é o número de faltantes.
  const guarda = rota.indexOf("if (faltantes.length) {");
  assert.ok(guarda >= 0 && guarda < resolucao, "a credencial só pode ser resolvida quando há faltantes");
  assert.match(rota, /let quotaResolvida = faltantes\.length;/);
  assert.match(rota, /quotaUnits: quotaResolvida/);
  assert.doesNotMatch(rota, /quotaUnits: alvos\.length/);

  // 3. Só os faltantes são pagos, com concorrência limitada, e ficam no cache.
  assert.match(rota, /runBounded\(faltantes, CONCURRENCY,/);
  assert.match(rota, /collectedBy: "arquiteto"/);
  assert.match(rota, /coleta\.observation/);
  /*
   * Mudou em 2026-09-23 (adendo das 4 lentes, A6): cada lente paga consome o
   * plano autorizado, e o uso registrado é o que foi PAGO (`pagasAgora`) — uma
   * lente fora do plano vira lacuna e não conta.
   */
  assert.match(rota, /units: pagasAgora/);
  assert.match(rota, /if \(!orcamento\.take\(\)\) throw new SerpPaidBudgetExhaustedError\(/);
  assert.doesNotMatch(rota, /units: alvos\.length/);

  // Os códigos da config precisam bater com os da chave; se não, nada do cache vale.
  assert.match(rota, /keyword_serp_cache_codes_diverge/);

  // O buraco continua declarado, e a resposta diz o que veio de onde.
  assert.match(rota, /gaps\.push/);
  assert.match(rota, /requested: alvos\.length/);
  assert.match(rota, /reused,/);
  assert.match(rota, /collected: coletadas/);
});

test("K6b · lente paga e recusada pelo provider vira LACUNA com o motivo dele, nunca some", () => {
  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");
  // O núcleo não lança numa task recusada: devolve `observation: null`. Sem esta
  // guarda a lente não entraria nem em observações nem em lacunas — um buraco
  // não declarado, e com todas recusadas um 502 sem motivo nenhum.
  const worker = rota.slice(rota.indexOf("await runBounded(faltantes, CONCURRENCY,"), rota.indexOf("gaps.push({") + "gaps.push({".length);
  assert.ok(worker.length > 200, "o worker da coleta foi encontrado");
  assert.match(worker, /if \(!coleta\.observation\) \{[\s\S]*?throw new Error\(`\$\{coleta\.observationError/);
  // A recusa lança DENTRO do try do worker, antes de virar observação, e o catch declara a lacuna.
  const tentativa = worker.indexOf("try {");
  const guarda = worker.indexOf("if (!coleta.observation) {");
  assert.ok(tentativa > -1 && tentativa < guarda, "a guarda fica dentro do try do worker");
  // Mudou em 2026-09-23 (correção da A2): a observação leva a data da coleta.
  assert.ok(guarda < worker.indexOf("observacoes[item.indice] = paraObservacao(item.alvo, coleta.observation, coleta.meta.collectedAt);"), "a guarda vem antes de usar a observação");
  assert.ok(guarda < worker.indexOf("} catch (error) {"), "o throw cai no catch que declara a lacuna");
  // O motivo leva o código e a mensagem da task: 40501 diz que o defeito foi o pedido.
  assert.match(worker, /const \{ taskStatusCode, taskStatusMessage \} = coleta\.diagnostic;/);
});

test("K6c · a observação devolvida leva os citados pelo AI Overview e as buscas relacionadas, sem somar de novo", () => {
  /*
   * A observação do cache já trazia `aiOverviewDomains` e `relatedSearches`;
   * a rota os descartava. Agora chegam em campos PRÓPRIOS. `competitorDomains`
   * não muda de significado nesta etapa (orgânicos + citados, como o cache
   * grava): separar os dois é a decisão D5 do adendo.
   */
  const doCache = {
    lens: "mobile-ios", depth: 10,
    competitorDomains: ["a.com", "b.com", "c.com"],
    organicCount: 2,
    itemTypes: ["ai_overview", "organic"],
    questions: ["como usar?"],
    relatedSearches: ["rotina de skincare", " rotina de skincare ", "skincare coreano"],
    aiOverviewDomains: ["c.com", "www.c.com", "a.com"],
    commercialSignals: false,
  };
  const obs = competitiveObservationFromCache("kw-pedido", { device: "mobile", operatingSystem: "ios" }, doCache);

  assert.equal(obs.keywordId, "kw-pedido");
  assert.equal(obs.lens, "mobile-ios");
  assert.deepEqual(obs.competitorDomains, ["a.com", "b.com", "c.com"], "competitorDomains é o do cache, sem os citados somados de novo");
  assert.deepEqual(obs.aiOverviewDomains, ["c.com", "a.com"], "só os citados, sem duplicar domínio");
  assert.deepEqual(obs.relatedSearches, ["rotina de skincare", "skincare coreano"]);
  // O objeto do cache não é compartilhado com a resposta.
  assert.notEqual(obs.competitorDomains, doCache.competitorDomains);

  // Consumidor anterior: a afinidade ignora os campos novos.
  const semCampos = { ...obs, aiOverviewDomains: undefined, relatedSearches: undefined };
  const direita = [observacao({ keywordId: "kw-b", lens: "mobile-ios", competitorDomains: ["a.com", "b.com"] })];
  assert.deepEqual(measureKeywordAffinity({ left: [obs], right: direita }), measureKeywordAffinity({ left: [semCampos], right: direita }));

  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");
  // Mudou em 2026-09-23 (correção da A2): a data da lente vai junto.
  assert.match(rota, /const paraObservacao = \(alvo: Alvo, observacao: SerpCacheObservation, collectedAt: string\): SerpCompetitiveObservation =>\n\s+competitiveObservationFromCache\(alvo\.keyword\.keywordId, alvo\.lens, observacao, collectedAt\);/);
});

test("K6d · SERP por keyword: extras gravam SEM corpo e a canônica é paga com 20, com corpo", () => {
  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");
  const worker = rota.slice(rota.indexOf("await runBounded(faltantes, CONCURRENCY,"), rota.indexOf("gaps.push({"));
  assert.match(worker, /collectAndCacheSerp\(pipelineContext, architectSerpCollectionRequest\(item\.pedido\), \{/);
  assert.match(worker, /storeBody: architectSerpStoresBody\(item\.alvo\.lens\),/);
  // A leitura da execução continua em modo observation, na profundidade pedida (o plano, em meta).
  assert.match(rota, /depth: parsed\.data\.resultLimit,/);
  assert.match(rota, /\{ mode: soPlano \? "meta" : "observation", now \}/);
});

test("K7 · a mesa tem a porta da coleta e o painel da leitura", () => {
  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(workspace, /api\/arquiteto\/keyword-serp/);
  assert.match(workspace, /PublishedSerpPanel/);
  assert.match(workspace, /readPublishedGroupFromSerp/);

  const painel = semComentarios("../modules/arquiteto/published-serp-panel.tsx");
  assert.match(painel, /architect-collect-keyword-serp/);
  assert.match(painel, /architect-serp-substitution/);
  assert.match(painel, /architect-serp-reinforcement/);
});

/* ====== L · a lente precisa chegar ao provider, senão ela é decorativa ==== */

const pedidoBase = {
  keyword: "skincare facial",
  locationCode: 2076,
  languageCode: "pt-BR",
  device: "desktop" as const,
  resultLimit: 10,
  operationRequestId: "op-1",
};

test("L1 · sem lente declarada o pedido continua exatamente o de antes", () => {
  const { body } = buildDataForSeoSerpOperationRequest(pedidoBase);
  assert.equal("os" in body[0], false);
  assert.equal(body[0].device, "desktop");
});

test("L2 · a lente entra no CORPO do pedido: duas lentes do mesmo dispositivo não podem ser a mesma consulta", () => {
  /*
   * Este é o teste que impede a matriz de dispositivos de ser decorativa. Sem
   * `os` no pedido, desktop-windows e desktop-macos seriam a MESMA consulta, a
   * divergência daria zero por construção e o snapshot registraria um sistema
   * que ninguém observou.
   */
  const windows = buildDataForSeoSerpOperationRequest({ ...pedidoBase, operatingSystem: "windows" });
  const macos = buildDataForSeoSerpOperationRequest({ ...pedidoBase, operatingSystem: "macos" });

  assert.equal((windows.body[0] as { os?: string }).os, "windows");
  assert.equal((macos.body[0] as { os?: string }).os, "macos");
  assert.notDeepEqual(windows.body[0], macos.body[0]);

  const android = buildDataForSeoSerpOperationRequest({ ...pedidoBase, device: "mobile", operatingSystem: "android" });
  assert.equal((android.body[0] as { os?: string }).os, "android");
  assert.equal(android.body[0].device, "mobile");
});

test("L3 · par dispositivo/sistema inválido é RECUSADO, não corrigido em silêncio", () => {
  assert.throws(
    () => buildDataForSeoSerpOperationRequest({ ...pedidoBase, device: "mobile", operatingSystem: "windows" }),
    /não existe/,
  );
  assert.throws(
    () => buildDataForSeoSerpOperationRequest({ ...pedidoBase, device: "desktop", operatingSystem: "ios" }),
    /não existe/,
  );
});

test("L4 · as quatro lentes do produto são pares válidos", () => {
  for (const lens of DEFAULT_SERP_LENSES) {
    const { body } = buildDataForSeoSerpOperationRequest({
      ...pedidoBase,
      device: lens.device,
      operatingSystem: lens.operatingSystem,
    });
    assert.equal((body[0] as { os?: string }).os, lens.operatingSystem);
  }
});

/* ====== M · o que a coleta real ensinou (medido em 2026-09-20) =========== */

test("M1 · o mesmo concorrente não conta duas vezes por causa do www.", () => {
  /*
   * Medido no provider: a MESMA SERP devolveu `sephora.com.br` no orgânico e
   * `www.sephora.com.br` nas citações do AI Overview. Sem normalizar, o
   * universo parece maior e a sobreposição entre keywords parece menor — que é
   * o erro que recusa um grupo legítimo por "pouca sobreposição".
   */
  const observada = observationFromSnapshot({
    keywordId: "kw-1",
    device: "desktop",
    operatingSystem: "windows",
    organicResults: [{ domain: "sephora.com.br" }, { domain: "Natura.com.BR" }],
    serpFeatures: { aiOverview: { present: true, references: [{ domain: "www.sephora.com.br" }] } },
  });

  assert.deepEqual([...observada.competitorDomains].sort(), ["natura.com.br", "sephora.com.br"]);
});

test("M2 · o formato que só uma lente entrega é dito — é ele que muda a página", () => {
  /*
   * Medido em "clinica de estetica perto de mim": os quatro universos de
   * domínios eram quase o mesmo, mas o desktop entregou `google_reviews` e o
   * mobile entregou `people_also_search` e nenhuma pergunta. A diferença entre
   * dispositivos aparece no FORMATO, não na lista de concorrentes.
   */
  const cobertura = aggregateUniverseCoverage([
    observacao({ keywordId: "kw-a", lens: "desktop-windows", itemTypes: ["organic", "people_also_ask", "google_reviews"] }),
    observacao({ keywordId: "kw-a", lens: "mobile-android", itemTypes: ["organic", "people_also_search"] }),
  ]);

  const desktop = cobertura.formatsExclusiveToLens.find(item => item.lens === "desktop-windows");
  const mobile = cobertura.formatsExclusiveToLens.find(item => item.lens === "mobile-android");
  assert.deepEqual(desktop?.only.sort(), ["google_reviews", "people_also_ask"]);
  assert.deepEqual(mobile?.only, ["people_also_search"]);

  // `organic` está nas duas: comum não é exclusivo.
  assert.equal(cobertura.formatsExclusiveToLens.some(item => item.only.includes("organic")), false);
});

test("M3 · lentes iguais não produzem exclusividade nenhuma", () => {
  const cobertura = aggregateUniverseCoverage([
    observacao({ keywordId: "kw-a", lens: "desktop-windows", itemTypes: ["organic", "video"] }),
    observacao({ keywordId: "kw-a", lens: "mobile-ios", itemTypes: ["video", "organic"] }),
  ]);
  assert.deepEqual(cobertura.formatsExclusiveToLens, []);
});

test("M4 · o payload completo é opt-in e a coleta por keyword o exige", () => {
  /*
   * Medido no provider, mesma keyword e mesma lente: `regular` devolveu 8
   * domínios e ZERO perguntas com `people_also_ask` listado em `item_types`;
   * `advanced` devolveu 13 domínios e 4 perguntas.
   */
  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");
  // Antes: `payloadDepth: "advanced"` no snapshot. Com o cache, o endpoint é
  // parte da CHAVE — pedir `regular` leria outra entrada e perderia o PAA.
  assert.match(rota, /endpoint: "advanced"/);
  assert.doesNotMatch(rota, /endpoint: "regular"/);

  // Quem não pede continua no `regular`: o pedido do Radar não muda.
  const { body } = buildDataForSeoSerpOperationRequest(pedidoBase);
  assert.equal("os" in body[0], false);
});

/* ====== N · a lógica da aba Silos começa pelo que o Minerador declarou ==== */

const potencial = (unit: "silo" | "article" | "landing_page" | "service_page") =>
  EditorialUnitDeclarationSchema.parse({ source: "potential", unit, confidence: null, reasons: ["Declarado pelo humano no Minerador."] });

const propostaDe = (input: {
  clusters: ClusterAnalysis[];
  sinais: KeywordDnaSignals[];
  declarations?: Map<string, EditorialUnitDeclaration>;
  existingSilos?: Parameters<typeof buildArchitectureWorkingProposal>[0]["existingSilos"];
}) => buildArchitectureWorkingProposal({
  analysis: analiseDe(input.clusters),
  existingSilos: input.existingSilos ?? [],
  keywords: input.sinais,
  declarations: input.declarations,
  slugOf: slugSimples,
});

test("N1 · potencial de Silo vira cabeça do próprio Silo, com a primária PROVISÓRIA", () => {
  /*
   * Keyword nova que o humano marcou Silo no Minerador. A lógica já sabe que
   * ela lidera um Silo — sem provider. O que ela não sabe é se a SERP
   * sustenta: por isso a primária não é carimbada aqui. Quem confirma é a
   * etapa seguinte.
   */
  const proposta = propostaDe({
    clusters: [clusterDe("serum", ["kw-serum", "kw-serum-noite"])],
    sinais: [sinalDe("kw-serum", "serum facial"), sinalDe("kw-serum-noite", "serum facial noturno")],
    declarations: new Map([["kw-serum", potencial("silo")]]),
  });

  const silo = proposta.silos.find(item => item.seedKeywordId === "kw-serum");
  assert.ok(silo, "a keyword marcada Silo precisa liderar um Silo");
  assert.equal(silo.name, "serum facial");
  assert.equal(silo.primaryKeywordDeclaration, null);
  assert.match(silo.reason, /potencial de Silo/);
  assert.match(silo.reason, /SERP confirmar/);

  // O vizinho de grupo vem junto, como membro.
  const vizinho = proposta.assignments.find(item => item.keywordId === "kw-serum-noite");
  assert.equal(vizinho?.siloKey, silo.key);
});

test("N2 · o Silo declarado atrai os vizinhos mesmo quando o léxico sugeria outro Silo", () => {
  const existente = { territoryRef: "territory:velho", name: "cuidados", centralEntity: "cuidados", slug: "cuidados", intent: null };
  const cluster: ClusterAnalysis = {
    ...clusterDe("retinol", ["kw-retinol", "kw-retinol-noite"]),
    destination: "strengthen_existing_silo",
    suggestedTerritoryRef: "territory:velho",
    suggestedTerritoryLabel: "cuidados",
  };
  const proposta = propostaDe({
    clusters: [cluster],
    sinais: [sinalDe("kw-retinol", "retinol"), sinalDe("kw-retinol-noite", "retinol noturno")],
    declarations: new Map([["kw-retinol", potencial("silo")]]),
    existingSilos: [existente],
  });

  const doRetinol = proposta.silos.find(item => item.seedKeywordId === "kw-retinol");
  assert.ok(doRetinol);
  const vizinho = proposta.assignments.find(item => item.keywordId === "kw-retinol-noite");
  // O humano disse que "retinol" é Silo; o grupo dele é o universo dele.
  assert.equal(vizinho?.siloKey, doRetinol.key);
  assert.match(vizinho?.reason || "", /Silo declarado no Minerador/);
});

test("N3 · keyword declarada Artigo nunca vira semente de Silo, mesmo sendo a cabeça do grupo", () => {
  const proposta = propostaDe({
    clusters: [clusterDe("antes e depois", ["kw-artigo", "kw-livre", "kw-outra"])],
    sinais: [
      sinalDe("kw-artigo", "retinol antes e depois"),
      sinalDe("kw-livre", "retinol"),
      sinalDe("kw-outra", "retinol para rugas"),
    ],
    declarations: new Map([["kw-artigo", potencial("article")]]),
  });

  const silo = proposta.silos.find(item => item.source === "proposed");
  assert.ok(silo);
  // A cabeça léxica era o artigo: a semente passa para a primeira sem declaração.
  assert.equal(silo.seedKeywordId, "kw-livre");
  // E o Silo não leva o nome de uma keyword que o humano disse ser artigo.
  assert.equal(silo.name, "retinol");

  // O artigo continua no grupo — como membro, não como identidade.
  assert.equal(proposta.assignments.find(item => item.keywordId === "kw-artigo")?.siloKey, silo.key);
});

test("N4 · grupo inteiro declarado não-Silo não inventa Silo nenhum", () => {
  const proposta = propostaDe({
    clusters: [clusterDe("promo", ["kw-a", "kw-b"])],
    sinais: [sinalDe("kw-a", "creme promo"), sinalDe("kw-b", "creme promo barato")],
    declarations: new Map([["kw-a", potencial("article")], ["kw-b", potencial("landing_page")]]),
  });

  // O léxico via profundidade; o Minerador diz que são artigo e landing.
  assert.equal(proposta.silos.filter(item => item.source === "proposed").length, 0);
  const destinos = new Set([...proposta.assignments, ...proposta.unassigned].map(item => item.keywordId));
  assert.deepEqual([...destinos].sort(), ["kw-a", "kw-b"], "nenhuma keyword pode sumir do plano");
});

test("N5 · Silo declarado que já existe no acervo não é duplicado", () => {
  const existente = { territoryRef: "territory:skincare", name: "skincare", centralEntity: "skincare", slug: "skincare", intent: null };
  const proposta = propostaDe({
    clusters: [clusterDe("skincare", ["kw-skincare"])],
    sinais: [sinalDe("kw-skincare", "skincare")],
    declarations: new Map([["kw-skincare", potencial("silo")]]),
    existingSilos: [existente],
  });

  assert.equal(proposta.silos.filter(item => item.source === "proposed").length, 0);
  assert.equal(proposta.assignments.find(item => item.keywordId === "kw-skincare")?.siloKey, "territory:skincare");
});

test("N6 · lote sem declaração nenhuma produz exatamente a proposta de antes", () => {
  /*
   * A declaração INFORMA a lógica; ela não é obrigatória. Lote que ninguém
   * marcou continua sendo decidido pelo léxico, sem mudança nenhuma.
   */
  const clusters = [clusterDe("skincare facial", ["kw-cabeca", "kw-publicada", "kw-apoio"])];
  const sinais = [
    sinalDe("kw-cabeca", "skincare"),
    sinalDe("kw-publicada", "skincare facial"),
    sinalDe("kw-apoio", "skincare facial em casa"),
  ];
  const sem = propostaDe({ clusters, sinais });
  const vazio = propostaDe({ clusters, sinais, declarations: new Map() });
  assert.deepEqual(vazio.silos, sem.silos);
  assert.deepEqual(vazio.assignments, sem.assignments);
  assert.equal(vazio.proposalHash, sem.proposalHash);
});

test("N7 · a primeira etapa é LÓGICA: nenhum provider no caminho da separação Silo × Artigo", () => {
  /*
   * A lógica recebe o DNA inteiro e separa sem chamar ninguém. SERP e IA são
   * as etapas seguintes. Estes módulos não podem importar servidor, provider
   * ou rede — se um dia importarem, a primeira etapa passou a gastar crédito.
   */
  for (const arquivo of [
    "../lib/arquiteto/architecture-working-proposal.ts",
    "../lib/arquiteto/editorial-unit-declaration.ts",
    "../lib/minerador/keyword-vinculo.ts",
  ]) {
    const fonte = semComentarios(arquivo);
    assert.doesNotMatch(fonte, /from ["'][^"']*\/server\//, `${arquivo} não pode importar servidor`);
    assert.doesNotMatch(fonte, /\bfetch\(/, `${arquivo} não pode chamar rede`);
    assert.doesNotMatch(fonte, /dataforseo|openai|anthropic/i, `${arquivo} não pode tocar provider`);
  }
});

test("N8 · 200 keywords: toda keyword sai com destino, e a lógica responde rápido", () => {
  /*
   * O produto vai operar listas de ~200 keywords em sequência. Aqui a lógica
   * roda sobre 200 keywords em 40 grupos, com 8 Silos declarados, e precisa
   * devolver destino para TODAS — e sem virar gargalo da tela.
   */
  const clusters: ClusterAnalysis[] = [];
  const sinais: KeywordDnaSignals[] = [];
  const declarations = new Map<string, EditorialUnitDeclaration>();
  for (let grupo = 0; grupo < 40; grupo += 1) {
    const ids = Array.from({ length: 5 }, (_, indice) => `kw-${grupo}-${indice}`);
    clusters.push(clusterDe(`tema ${grupo}`, ids));
    ids.forEach((id, indice) => sinais.push(sinalDe(id, `tema${grupo} variacao${indice}`)));
    if (grupo % 5 === 0) declarations.set(ids[0], potencial("silo"));
    if (grupo % 3 === 0) declarations.set(ids[1], potencial("article"));
  }

  const inicio = performance.now();
  const proposta = propostaDe({ clusters, sinais, declarations });
  const duracao = performance.now() - inicio;

  const destinos = new Set([...proposta.assignments, ...proposta.unassigned].map(item => item.keywordId));
  assert.equal(destinos.size, 200, "nenhuma das 200 pode ficar sem destino");
  assert.equal(proposta.counters.KEYWORDS_ANALYZED, 200);
  // Os 8 declarados lideram o próprio Silo.
  assert.equal(proposta.silos.filter(item => item.reason.includes("potencial de Silo")).length, 8);
  assert.ok(duracao < 500, `a lógica levou ${duracao.toFixed(0)}ms para 200 keywords`);
});

/* ===== P · volume: a coleta de SERP não corta o Silo em 12 keywords ======= */

test("P1 · o cliente envia o Silo inteiro em lotes, sem cortar em 12", () => {
  /*
   * Antes: `slice(0, 12)`. Num Silo de 20 keywords, oito ficavam sem coleta
   * e a tela não dizia nada. Com listas de ~200 keywords em ~10 Silos, isso
   * era o caso comum, não a exceção.
   */
  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  const inicio = workspace.indexOf("const collectKeywordSerp = async");
  assert.ok(inicio >= 0, "collectKeywordSerp não foi encontrado");
  const corpo = workspace.slice(inicio, workspace.indexOf("\n  };\n", inicio));

  assert.equal(/slice\(0,\s*12\)/.test(corpo), false, "a coleta voltou a cortar o Silo em 12 keywords");
  assert.match(corpo, /LOTE_DE_KEYWORDS/);
  assert.match(corpo, /for \(let inicio = 0; inicio < todas\.length; inicio \+= LOTE_DE_KEYWORDS\)/);
});

test("P2 · o CLIENTE mescla os lotes do mesmo Silo por keyword + lente", () => {
  /*
   * Antes a rota relia o registro do escopo e o mesclava com o lote, e o
   * cliente só substituía o estado pelo que voltava. Com o cache como
   * persistência não há registro do Silo para reler: a rota devolve só o
   * lote, e a mescla passou para a tela. Sem ela o segundo lote apagaria o
   * primeiro e o Silo terminaria com só as últimas 6 keywords observadas.
   */
  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");
  assert.doesNotMatch(rota, /desteLote|preservadas|lacunasPreservadas/, "a rota não mescla mais: devolve só o lote");

  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  const inicio = workspace.indexOf("const collectKeywordSerp = async");
  assert.ok(inicio >= 0, "collectKeywordSerp não foi encontrado");
  const corpo = workspace.slice(inicio, workspace.indexOf("\n  };\n", inicio));

  // A identidade da observação é keyword + lente.
  assert.match(corpo, /`\$\{item\.keywordId\}.*\$\{item\.lens\}`/);
  // Parte do que já estava na tela para este Silo.
  assert.match(corpo, /previous\.get\(territoryRef\)/);
  assert.match(corpo, /observacoes\.set\(par\(item\), item\)/);
  // Observação fecha a lacuna do mesmo par; lacuna não apaga observação.
  assert.match(corpo, /lacunas\.delete\(chave\)/);
  // O estado não é mais substituído pelo que a resposta trouxe.
  assert.doesNotMatch(corpo, /observations: Array\.isArray\(body\.data\?\.observations\)/);
  // A origem de cada lente aparece: cache ou coleta agora.
  assert.match(corpo, /origem\.reused \+=/);
  assert.match(corpo, /origem\.collected \+=/);
});

/* ====== A6 · "Consultar nas 4 lentes": o plano aparece antes de pagar ====== */

test("A6 · SERP por keyword: `plan` só lê o cache; `execute` paga até o autorizado", () => {
  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");
  assert.match(rota, /mode: z\.enum\(\["plan", "execute"\]\)\.default\("execute"\),/);
  const plano = rota.indexOf('if (parsed.data.mode === "plan") {');
  assert.ok(plano > rota.indexOf('{ mode: "observation", now }'), "o plano sai da mesma leitura do cache");
  assert.ok(plano < rota.indexOf("await resolveDataForSeoCompatibilityConfig("), "o plano não resolve credencial");
  assert.ok(plano < rota.indexOf("await collectAndCacheSerp("), "o plano não paga");
  const autorizar = rota.indexOf("const autorizacao = authorizeSerpPaidPlan(plan, parsed.data.authorizedPaidQueries);");
  assert.ok(autorizar > plano && autorizar < rota.indexOf("await resolveDataForSeoCompatibilityConfig("));
  assert.match(rota, /if \(!autorizacao\.ok\) \{[\s\S]*?status: 409 \}\);/);
  // A chave usa os códigos do Minerador para a keyword; a divergência da config só atinge as do ambiente.
  assert.match(rota, /await readMineradorKeywordTargetCodes\(pipelineContext\.supabase, pipelineContext\.brandId,/);
  assert.match(rota, /alvos\.forEach\(\(alvo, indice\) => \{ if \(usaCodigosDoAmbiente\(alvo\)\) observacoes\[indice\] = null; \}\);/);
  assert.doesNotMatch(rota, /observacoes\.fill\(null\)/);
});

test("A6 · a mesa: plano primeiro, uma confirmação para os lotes, cada lote com o número do seu plano", () => {
  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  const inicio = workspace.indexOf("const collectKeywordSerp = async");
  const corpo = workspace.slice(inicio, workspace.indexOf("\n  };\n", inicio));
  const plano = corpo.indexOf('pedirLote(keywords, { mode: "plan" })');
  const confirmacao = corpo.indexOf("await askSerpPaidPlan(");
  const execucao = corpo.indexOf('pedirLote(lote.keywords, { mode: "execute", authorizedPaidQueries: lote.plan.paidQueries })');
  assert.ok(plano > -1 && confirmacao > plano && execucao > confirmacao, "plano → confirmação → execução");
  assert.match(corpo, /mergeSerpPaidPlans\(lotes\.map\(lote => lote\.plan\)\), false\)/);
  assert.match(corpo, /if \(!escolha\) \{[\s\S]*?nenhuma chamada foi paga[\s\S]*?return;/);
});

/* ===== Q · A9 — a primária do Silo pela SERP é PROPOSTA, nunca aplicada ===== */

const QUATRO_LENTES = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"];

/** Três candidatas nas quatro lentes: "skincare facial" divide mais e tem blocos mais ricos. */
const observacoesDaListaNova = (lentes: readonly string[] = QUATRO_LENTES) => lentes.flatMap(lens => [
  observacao({ keywordId: "kw-forte", lens, competitorDomains: ["x.com", "y.com", "z.com"], itemTypes: ["video", "ai_overview"] }),
  observacao({ keywordId: "kw-b", lens, competitorDomains: ["x.com", "y.com"] }),
  observacao({ keywordId: "kw-c", lens, competitorDomains: ["x.com", "y.com"] }),
]);
const candidatasDaListaNova = [
  { keywordId: "kw-forte", label: "skincare facial" },
  { keywordId: "kw-b", label: "rotina de skincare" },
  { keywordId: "kw-c", label: "skincare noturno" },
];
/*
 * Mudou em 2026-09-23 (correção da A3): a proposta e o aceite passaram a
 * receber a origem do Silo e, no aceite, o Silo gravado na keyword. Os casos
 * Q1 a Q10 são de LISTA NOVA; os helpers declaram isso uma vez.
 */
const LISTA_NOVA = { publicationProtection: "unpublished", territoryKind: "new" };
const REF_DO_SILO = "territory:11111111-1111-4111-8111-111111111111";
type EntradaDaProposta = Parameters<typeof proposeSiloPrimaryFromSerp>[0];
type EntradaDoAceite = Parameters<typeof acceptSerpPrimaryProposal>[0];
const proporReal = proposeSiloPrimaryFromSerp;
const aceitarReal = acceptSerpPrimaryProposal;
const propor = (input: Omit<EntradaDaProposta, "territory"> & { territory?: EntradaDaProposta["territory"] }) =>
  proporReal({ territory: LISTA_NOVA, ...input });
const aceitarNaListaNova = (input: Omit<EntradaDoAceite, "territoryRef" | "territory" | "keywordTerritoryRef">) =>
  aceitarReal({ territoryRef: REF_DO_SILO, territory: LISTA_NOVA, keywordTerritoryRef: REF_DO_SILO, ...input });
const primariaSerpAceita = (keywordId: string) => TerritoryPrimaryKeywordSchema.parse({
  electedBy: "serp",
  keywordId,
  evidence: { competitorOverlap: 2, devicesAgreeing: 4, devicesObserved: 4, score: 14 },
  electedAt: NOW,
  confirmedBy: { actorUserId: "user-1", confirmedAt: NOW },
});

test("Q1 · lista nova sem primária: a SERP das 4 lentes PROPÕE — decisão pendente, sem carimbo, nada gravável sozinho", () => {
  const observacoes = observacoesDaListaNova();
  const antes = JSON.stringify(observacoes);
  const proposta = propor({ current: null, candidates: candidatasDaListaNova, observations: observacoes });

  assert.equal(proposta.state, "PROPOSED");
  assert.equal(proposta.canAccept, true);
  assert.equal(proposta.proposed?.keywordId, "kw-forte");
  assert.equal(proposta.proposed?.label, "skincare facial");
  // A decisão é do acervo, e é PENDENTE: quem confirma é uma pessoa.
  assert.equal(proposta.decision?.status, "pending");
  assert.equal(proposta.decision?.selectedKeywordId, "kw-forte");
  assert.equal(proposta.decision?.previousKeywordId, undefined);
  assert.equal(PrimaryKeywordDecisionSchema.safeParse(proposta.decision).success, true);
  // A proposta NÃO é uma primária: não tem origem, carimbo nem ator.
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse(proposta.proposed).success, false);
  assert.doesNotMatch(JSON.stringify(proposta), /electedAt|confirmedBy|actorUserId|decidedAt|proposta-sem-carimbo/);
  // As quatro lentes aparecem, e a sustentação da proposta é dita.
  assert.deepEqual(proposta.lenses.observed, QUATRO_LENTES);
  assert.equal(proposta.summary, 'SERP · 4 lentes · "skincare facial" se sustenta em 4/4 lente(s)');
  assert.match(proposta.reason, /só vira primária se você aceitar/);
  assert.equal(proposta.ranking[0].label, "skincare facial");
  // Derivada: o mesmo cenário dá a mesma proposta, e a entrada não é tocada.
  assert.deepEqual(propor({ current: null, candidates: candidatasDaListaNova, observations: observacoes }), proposta);
  assert.equal(JSON.stringify(observacoes), antes);
  // O que vai ao servidor não carrega ator nem hora — e o schema recusa quem tentar.
  const aceite = serpPrimaryAcceptanceOf(proposta);
  assert.deepEqual(aceite, { keywordId: "kw-forte", previousKeywordId: null, evidence: proposta.proposed?.evidence });
  assert.equal(SerpPrimaryAcceptanceSchema.safeParse(aceite).success, true);
  assert.equal(SerpPrimaryAcceptanceSchema.safeParse({ ...aceite, actorUserId: "user-forjado" }).success, false);
  assert.equal(SerpPrimaryAcceptanceSchema.safeParse({ ...aceite, confirmedAt: NOW }).success, false);
});

test("Q2 · uma lente só: a SERP RECUSA, nada é proposto e nada pode ser aceito", () => {
  const proposta = propor({
    current: null,
    candidates: candidatasDaListaNova,
    observations: observacoesDaListaNova(["desktop-windows"]),
  });
  assert.equal(proposta.state, "REFUSED");
  assert.equal(proposta.decision, null);
  assert.equal(proposta.proposed, null);
  assert.equal(proposta.canAccept, false);
  assert.equal(serpPrimaryAcceptanceOf(proposta), null);
  // O que faltou em cada candidata fica visível, pelo nome.
  assert.equal(proposta.blockers.length, 3);
  assert.match(proposta.blockers.join(" "), /skincare facial: .*lente/);
  assert.match(proposta.reason, /Nenhuma primária é eleita por falta de concorrente melhor/);
  assert.equal(proposta.summary, "SERP · 1 de 4 lentes");
});

test("Q3 · sem SERP das candidatas não há proposta — a mesa não inventa primária", () => {
  const proposta = propor({ current: null, candidates: candidatasDaListaNova, observations: [] });
  assert.equal(proposta.state, "NO_EVIDENCE");
  assert.equal(proposta.canAccept, false);
  assert.equal(proposta.decision, null);
  assert.deepEqual(proposta.lenses.candidatesWithoutSerp, ["skincare facial", "rotina de skincare", "skincare noturno"]);
});

test("Q4 · precedência: primária HUMANA vence a SERP — a discordância aparece e nada se aplica", () => {
  const humana = TerritoryPrimaryKeywordSchema.parse({ electedBy: "human", keywordId: "kw-c", actorUserId: "user-1", reason: "linha editorial", electedAt: NOW });
  const proposta = propor({ current: humana, candidates: candidatasDaListaNova, observations: observacoesDaListaNova() });

  assert.equal(proposta.state, "DISSENT_ONLY");
  assert.equal(proposta.canAccept, false);
  assert.deepEqual(proposta.blockers, ["HUMAN_PRIMARY_PREVAILS"]);
  assert.equal(proposta.decision?.status, "pending");
  assert.equal(proposta.decision?.previousKeywordId, "kw-c");
  assert.equal(proposta.decision?.selectedKeywordId, "kw-forte");
  assert.match(proposta.reason, /a decisão humana prevalece/);
  assert.equal(serpPrimaryAcceptanceOf(proposta), null);
  assert.equal(proposta.current?.label, "skincare noturno");
});

test("Q5 · precedência: publicada vence a SERP; travada, a proposta aparece com o bloqueio dito", () => {
  const publicadaPrimaria = TerritoryPrimaryKeywordSchema.parse({
    electedBy: "published_declaration", keywordId: "kw-b", url: "https://marca.com.br/rotina", canonical: "https://marca.com.br/rotina", electedAt: NOW,
  });
  // Mudou em 2026-09-23 (correção da A3): desafiante de página publicada
  // precisa também de volume 1,5x acima; aqui 3000 contra 1000.
  const comVolume = candidatasDaListaNova.map(item => ({ ...item, volumeSearch: item.keywordId === "kw-forte" ? 3000 : 1000 }));
  const travada = propor({
    current: publicadaPrimaria, candidates: comVolume, observations: observacoesDaListaNova(), currentPolicy: "locked",
  });
  assert.equal(travada.state, "DISSENT_ONLY");
  assert.equal(travada.canAccept, false);
  assert.deepEqual(travada.blockers, ["PUBLISHED_PRIMARY_PREVAILS", "PRIMARY_POLICY_LOCKED"]);
  // A proposta EXISTE mesmo travada: a política decide se aplica, não se aparece.
  assert.equal(travada.decision?.status, "pending");
  assert.equal(travada.proposed?.keywordId, "kw-forte");
  assert.match(travada.reason, /vem da página publicada/);

  const revisavel = propor({
    current: publicadaPrimaria, candidates: comVolume, observations: observacoesDaListaNova(), currentPolicy: "revisable",
  });
  assert.deepEqual(revisavel.blockers, ["PUBLISHED_PRIMARY_PREVAILS"]);
  assert.equal(revisavel.canAccept, false, "a SERP nunca troca a primária publicada por esta porta");
});

test("Q16 · correção A3 · publicada: liderar a SERP sem a folga de volume NÃO abre decisão (regra de 2026-09-20)", () => {
  const publicadaPrimaria = TerritoryPrimaryKeywordSchema.parse({
    electedBy: "published_declaration", keywordId: "kw-b", url: "https://marca.com.br/rotina", canonical: "https://marca.com.br/rotina", electedAt: NOW,
  });
  const comVolumes = (forte: number | null, atual: number | null) => candidatasDaListaNova.map(item => ({
    ...item, volumeSearch: item.keywordId === "kw-forte" ? forte : item.keywordId === "kw-b" ? atual : 10,
  }));

  // O defeito: antes, sem olhar o volume, a decisão abria como pendente.
  const semFolga = propor({ current: publicadaPrimaria, candidates: comVolumes(1400, 1000), observations: observacoesDaListaNova(), currentPolicy: "locked" });
  assert.equal(semFolga.state, "DISSENT_ONLY");
  assert.equal(semFolga.decision, null, "sem desafiante legítimo, nenhuma decisão");
  assert.equal(semFolga.canAccept, false);
  assert.equal(semFolga.proposed?.keywordId, "kw-forte", "a leitura da SERP continua visível");
  assert.deepEqual(semFolga.blockers, ["PUBLISHED_PRIMARY_PREVAILS", "SUBSTITUTION_VOLUME_NOT_MET", "PRIMARY_POLICY_LOCKED"]);
  assert.match(semFolga.reason, /não supera .*\(1000\) com a folga de 1\.5x/);
  assert.match(semFolga.reason, /a primária publicada permanece/);

  // No limite exato da folga, é desafiante.
  const limite = propor({ current: publicadaPrimaria, candidates: comVolumes(1500, 1000), observations: observacoesDaListaNova() });
  assert.equal(limite.decision?.status, "pending");
  assert.deepEqual(limite.blockers, ["PUBLISHED_PRIMARY_PREVAILS"]);

  // Volume ausente de qualquer lado não vira zero: não há comparação.
  for (const [forte, atual] of [[null, 1000], [3000, null]] as const) {
    const semVolume = propor({ current: publicadaPrimaria, candidates: comVolumes(forte, atual), observations: observacoesDaListaNova() });
    assert.equal(semVolume.decision, null);
    assert.deepEqual(semVolume.blockers, ["PUBLISHED_PRIMARY_PREVAILS", "SUBSTITUTION_VOLUME_MISSING"]);
  }

  // A folga é a mesma de primary-substitution, e pode ser calibrada por parâmetro.
  assert.equal(propor({ current: publicadaPrimaria, candidates: comVolumes(1400, 1000), observations: observacoesDaListaNova(), minVolumeRatio: 1.2 }).decision?.status, "pending");

  // Primária HUMANA não depende de volume: a discordância continua pendente.
  const humana = TerritoryPrimaryKeywordSchema.parse({ electedBy: "human", keywordId: "kw-b", actorUserId: "user-1", reason: "linha editorial", electedAt: NOW });
  assert.equal(propor({ current: humana, candidates: comVolumes(null, null), observations: observacoesDaListaNova() }).decision?.status, "pending");
});

test("Q17 · correção A3 · Silo publicado, existente ou de origem desconhecida SEM primária: a SERP só informa, nada se aceita", () => {
  const casos = [
    [{ publicationProtection: "protected", territoryKind: "existing" }, "PUBLISHED_SILO_WITHOUT_DECLARATION"],
    [{ publicationProtection: "protected", territoryKind: "new" }, "PUBLISHED_SILO_WITHOUT_DECLARATION"],
    [{ publicationProtection: "unpublished", territoryKind: "existing" }, "EXISTING_SILO_NOT_LIST_ORIGIN"],
    [{ publicationProtection: "unknown", territoryKind: "new" }, "TERRITORY_ORIGIN_UNKNOWN"],
    [{ publicationProtection: "unpublished", territoryKind: null }, "TERRITORY_ORIGIN_UNKNOWN"],
    [null, "TERRITORY_ORIGIN_UNKNOWN"],
  ] as const;
  for (const [territory, codigo] of casos) {
    // O defeito: antes, sem primária, a SERP saía PROPOSED e aceitável em qualquer Silo.
    const proposta = propor({ current: null, candidates: candidatasDaListaNova, observations: observacoesDaListaNova(), territory });
    assert.equal(proposta.state, "OUT_OF_ORIGIN", codigo);
    assert.equal(proposta.canAccept, false);
    assert.equal(proposta.decision, null);
    assert.deepEqual(proposta.blockers, [codigo]);
    assert.equal(proposta.proposed?.keywordId, "kw-forte", "a leitura da SERP continua visível");
    assert.equal(serpPrimaryAcceptanceOf(proposta), null);
    assert.equal(serpPrimaryOriginRefusal(territory)?.code, codigo);

    // E o servidor recusa, com a origem lida do banco, mesmo que o navegador mande o aceite.
    const aceite = aceitarReal({
      current: null,
      acceptance: { keywordId: "kw-forte", previousKeywordId: null, evidence: { competitorOverlap: 2, devicesAgreeing: 4, devicesObserved: 4, score: 16 } },
      actorUserId: "user-1", confirmedAt: NOW, territoryRef: REF_DO_SILO, territory, keywordTerritoryRef: REF_DO_SILO,
    });
    assert.equal(aceite.ok ? "OK" : aceite.code, codigo);
  }
  // Lista nova e expansão continuam elegendo.
  assert.equal(serpPrimaryOriginRefusal({ publicationProtection: "unpublished", territoryKind: "new" }), null);
  assert.equal(serpPrimaryOriginRefusal({ publicationProtection: "unpublished", territoryKind: "expansion" }), null);
  // A precedência vem antes da origem: primária publicada continua sendo DISSENT_ONLY.
  const publicadaPrimaria = TerritoryPrimaryKeywordSchema.parse({ electedBy: "published_declaration", keywordId: "kw-b", url: null, canonical: null, electedAt: NOW });
  assert.equal(propor({ current: publicadaPrimaria, candidates: candidatasDaListaNova, observations: observacoesDaListaNova(), territory: { publicationProtection: "protected", territoryKind: "existing" } }).state, "DISSENT_ONLY");
});

test("Q18 · correção A3 · o aceite só vale para keyword DESTE Silo, na marca ativa (lido do banco)", () => {
  const evidencia = { competitorOverlap: 2, devicesAgreeing: 4, devicesObserved: 4, score: 16 };
  const aceitar = (keywordTerritoryRef: string | null, territoryRef = REF_DO_SILO) => aceitarReal({
    current: null, acceptance: { keywordId: "kw-forte", previousKeywordId: null, evidence: evidencia }, actorUserId: "user-1", confirmedAt: NOW,
    territoryRef, territory: LISTA_NOVA, keywordTerritoryRef,
  });
  const codigo = (resultado: ReturnType<typeof acceptSerpPrimaryProposal>) => resultado.ok ? "OK" : resultado.code;
  assert.equal(codigo(aceitar(REF_DO_SILO)), "OK");
  // Keyword de outro Silo, sem Silo, ou não achada na marca ativa (outra marca): recusado.
  assert.equal(codigo(aceitar("territory:22222222-2222-4222-8222-222222222222")), "KEYWORD_NOT_IN_SILO");
  assert.equal(codigo(aceitar(null)), "KEYWORD_NOT_IN_SILO");
  assert.equal(codigo(aceitar("", "")), "KEYWORD_NOT_IN_SILO");
});

test("Q19 · correção A3 · a criação de território não faz nascer primária de SERP nem humana", () => {
  const serpForjada = {
    electedBy: "serp", keywordId: "kw-de-outra-marca", evidence: { competitorOverlap: 2, devicesAgreeing: 4, devicesObserved: 4, score: 16 },
    electedAt: NOW, confirmedBy: { actorUserId: "ator-forjado", confirmedAt: "2020-01-01T00:00:00Z" },
  };
  // O defeito: o schema do território aceita a primária serp com confirmedBy vindo do navegador.
  const rascunho = manualSiloCandidateDraft({ name: "Skincare", slug: "skincare", primaryKeyword: TerritoryPrimaryKeywordSchema.parse(serpForjada) });
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse(rascunho.primaryKeyword).success, true);
  assert.match(territoryCreatePrimaryRefusal(rascunho) || "", /só entra pelo aceite explícito/);
  const { confirmedBy: _semAceite, ...serpSemAceite } = serpForjada;
  void _semAceite;
  assert.ok(territoryCreatePrimaryRefusal({ primaryKeyword: serpSemAceite }));
  assert.ok(territoryCreatePrimaryRefusal({ primaryKeyword: { electedBy: "human", keywordId: "kw-a", actorUserId: "u", reason: "r", electedAt: NOW } }));
  assert.ok(territoryCreatePrimaryRefusal({ primaryKeyword: "kw-a" }), "forma desconhecida também é recusada");
  // A origem 2 (declaração publicada) e a ausência continuam passando.
  assert.equal(territoryCreatePrimaryRefusal(manualSiloCandidateDraft({
    name: "Skincare", slug: "skincare",
    primaryKeyword: stampPublishedPrimary({ keywordId: "kw-b", declaration: { url: "https://marca.com.br/rotina", canonical: null } } as never, NOW),
  })), null);
  assert.equal(territoryCreatePrimaryRefusal(manualSiloCandidateDraft({ name: "Skincare", slug: "skincare" })), null);
  assert.equal(territoryCreatePrimaryRefusal({ primaryKeyword: null }), null);

  // A rota aplica a trava na criação, antes de gravar.
  const rota = semComentarios("../app/api/arquiteto/workspace/route.ts");
  const criacao = rota.slice(rota.indexOf("for (const create of parsed.territoryCreates || [])"), rota.indexOf("const territorioVigente"));
  const trava = criacao.indexOf("territoryCreatePrimaryRefusal(create.territory)");
  assert.ok(trava > 0 && trava < criacao.indexOf("createTerritoryWorkflowItem("), "a trava vem antes da criação");
  assert.match(criacao, /if \(primariaNaCriacao\) throw new PipelineRuntimeError\("CONFLICT", primariaNaCriacao, 409\);/);
});

test("Q6 · a SERP que confirma a primária atual não abre decisão nenhuma (§9: sem mudança real, nada novo)", () => {
  const proposta = propor({ current: primariaSerpAceita("kw-forte"), candidates: candidatasDaListaNova, observations: observacoesDaListaNova() });
  assert.equal(proposta.state, "CONCURS");
  assert.equal(proposta.decision, null);
  assert.equal(proposta.canAccept, false);
  assert.equal(serpPrimaryAcceptanceOf(proposta), null);
});

test("Q7 · primária de SERP já aceita e a SERP de agora aponta outra: nova PROPOSTA sobre a atual, que continua até o aceite", () => {
  const proposta = propor({ current: primariaSerpAceita("kw-b"), candidates: candidatasDaListaNova, observations: observacoesDaListaNova() });
  assert.equal(proposta.state, "PROPOSED");
  assert.equal(proposta.decision?.previousKeywordId, "kw-b");
  assert.match(proposta.reason, /no lugar de "rotina de skincare"\. A troca só acontece se você aceitar/);
  assert.equal(serpPrimaryAcceptanceOf(proposta)?.previousKeywordId, "kw-b");
});

test("Q8 · só as candidatas do Silo votam; candidata sem SERP é dita, não some", () => {
  const proposta = propor({
    current: null,
    candidates: [...candidatasDaListaNova, { keywordId: "kw-sem-serp", label: "skincare coreano" }],
    observations: [
      ...observacoesDaListaNova(),
      // Keyword de fora do Silo, com o universo inteiro: não pode puxar a eleição.
      ...QUATRO_LENTES.map(lens => observacao({ keywordId: "kw-de-fora", lens, competitorDomains: ["x.com", "y.com", "z.com", "w.com"], itemTypes: ["a", "b", "c"] })),
    ],
  });
  assert.equal(proposta.proposed?.keywordId, "kw-forte");
  assert.equal(proposta.ranking.some(item => item.keywordId === "kw-de-fora"), false);
  assert.deepEqual(proposta.lenses.candidatesWithoutSerp, ["skincare coreano"]);
  assert.match(proposta.reason, /1 candidata\(s\) sem SERP lida não entram na eleição: "skincare coreano"/);
});

test("Q9 · o ACEITE grava a primária com o ator e a hora do servidor; território antigo continua válido", () => {
  const proposta = propor({ current: null, candidates: candidatasDaListaNova, observations: observacoesDaListaNova() });
  const aceite = aceitarNaListaNova({
    current: null, acceptance: serpPrimaryAcceptanceOf(proposta)!, actorUserId: "user-da-sessao", confirmedAt: "2026-09-23T15:00:00.000Z",
  });
  assert.equal(aceite.ok, true);
  if (!aceite.ok) return;
  assert.equal(aceite.primary.electedBy, "serp");
  assert.equal(aceite.primary.keywordId, "kw-forte");
  if (aceite.primary.electedBy !== "serp") return;
  assert.deepEqual(aceite.primary.confirmedBy, { actorUserId: "user-da-sessao", confirmedAt: "2026-09-23T15:00:00.000Z" });
  // O carimbo nasce no aceite: a proposta era derivada, sem hora.
  assert.equal(aceite.primary.electedAt, "2026-09-23T15:00:00.000Z");
  assert.match(describeSiloPrimaryKeyword(aceite.primary, "skincare facial"), /eleita pela SERP.*Proposta aceita por decisão humana\./);

  // Trocar uma primária já aceita guarda a anterior.
  const troca = aceitarNaListaNova({
    current: primariaSerpAceita("kw-b"),
    acceptance: { keywordId: "kw-forte", previousKeywordId: "kw-b", evidence: proposta.proposed!.evidence },
    actorUserId: "user-2", confirmedAt: NOW,
  });
  assert.equal(troca.ok && troca.primary.electedBy === "serp" ? troca.primary.confirmedBy?.replacedKeywordId : null, "kw-b");

  // Primária de SERP antiga, sem `confirmedBy`, continua válida e com a frase de antes.
  const antiga = { electedBy: "serp", keywordId: "kw-a", evidence: { competitorOverlap: 3, devicesAgreeing: 2, devicesObserved: 2, score: 14 }, electedAt: NOW };
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse(antiga).success, true);
  assert.doesNotMatch(describeSiloPrimaryKeyword(TerritoryPrimaryKeywordSchema.parse(antiga)), /aceita/);
  // `confirmedBy` só existe na variante de SERP, e é estrito.
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse({ ...antiga, confirmedBy: { actorUserId: "u", confirmedAt: NOW, extra: 1 } }).success, false);
  assert.equal(TerritoryPrimaryKeywordSchema.safeParse({
    electedBy: "human", keywordId: "kw-a", actorUserId: "u", reason: "r", electedAt: NOW, confirmedBy: { actorUserId: "u", confirmedAt: NOW },
  }).success, false);
});

test("Q10 · o aceite é RECUSADO sobre primária humana ou publicada, sobre proposta vencida e sem mudança real", () => {
  const evidencia = { competitorOverlap: 2, devicesAgreeing: 4, devicesObserved: 4, score: 16 };
  const aceitar = (current: Parameters<typeof acceptSerpPrimaryProposal>[0]["current"], previousKeywordId: string | null, keywordId = "kw-forte", actorUserId = "user-1") =>
    aceitarNaListaNova({ current, acceptance: { keywordId, previousKeywordId, evidence: evidencia }, actorUserId, confirmedAt: NOW });
  const codigo = (resultado: ReturnType<typeof acceptSerpPrimaryProposal>) => resultado.ok ? "OK" : resultado.code;

  const humana = TerritoryPrimaryKeywordSchema.parse({ electedBy: "human", keywordId: "kw-c", actorUserId: "user-1", reason: "linha editorial", electedAt: NOW });
  const publicadaPrimaria = TerritoryPrimaryKeywordSchema.parse({ electedBy: "published_declaration", keywordId: "kw-b", url: null, canonical: null, electedAt: NOW });
  assert.equal(codigo(aceitar(humana, "kw-c")), "HUMAN_PRIMARY_PREVAILS");
  assert.equal(codigo(aceitar(publicadaPrimaria, "kw-b")), "PUBLISHED_PRIMARY_PREVAILS");
  // A proposta foi calculada sem primária; alguém aceitou outra no meio tempo.
  assert.equal(codigo(aceitar(primariaSerpAceita("kw-b"), null)), "PRIMARY_CHANGED_SINCE_PROPOSAL");
  assert.equal(codigo(aceitar(primariaSerpAceita("kw-forte"), "kw-forte")), "NO_CHANGE");
  assert.equal(codigo(aceitar(null, null, "kw-forte", "   ")), "INCOMPLETE_ACCEPTANCE");
  assert.equal(codigo(aceitarNaListaNova({
    current: null, acceptance: { keywordId: "kw-forte", previousKeywordId: null, evidence: { ...evidencia, devicesAgreeing: 5 } }, actorUserId: "user-1", confirmedAt: NOW,
  })), "INVALID_EVIDENCE");
  assert.equal(codigo(aceitar(null, null)), "OK");
});

test("Q11 · a edição genérica do território não troca nem apaga a primária", () => {
  const atual = primariaSerpAceita("kw-b");
  // O jsonb devolve as chaves em outra ordem: a comparação é por conteúdo.
  const reordenada = JSON.parse(JSON.stringify({ confirmedBy: atual.electedBy === "serp" ? atual.confirmedBy : null, electedAt: NOW, evidence: atual.electedBy === "serp" ? atual.evidence : null, keywordId: "kw-b", electedBy: "serp" }));
  assert.equal(samePrimaryKeyword(atual, reordenada), true);
  assert.equal(territoryPrimaryChangeRefusal(atual, { name: "Skincare", primaryKeyword: reordenada }), null);
  assert.match(territoryPrimaryChangeRefusal(atual, { primaryKeyword: { ...reordenada, keywordId: "kw-forte" } }) || "", /só muda pelo aceite explícito/);
  // Omitir a primária a apagaria: também é recusado.
  assert.ok(territoryPrimaryChangeRefusal(atual, { name: "Skincare" }));
  // Sem primária dos dois lados, nada muda.
  assert.equal(territoryPrimaryChangeRefusal(null, { name: "Skincare" }), null);
  assert.equal(territoryPrimaryChangeRefusal(null, { primaryKeyword: null }), null);
  assert.ok(territoryPrimaryChangeRefusal(null, { primaryKeyword: reordenada }), "a porta genérica não cria primária");
});

test("Q12 · a leitura da primária vigente é estreita, filtrada pela marca, e falha FECHADA", async () => {
  const chamadas: unknown[][] = [];
  const cliente = (resposta: { data: unknown; error: unknown } | Error) => ({
    from(tabela: string) {
      chamadas.push(["from", tabela]);
      const cadeia = {
        select(colunas: string) { chamadas.push(["select", colunas]); return cadeia; },
        eq(coluna: string, valor: unknown) { chamadas.push(["eq", coluna, valor]); return cadeia; },
        async maybeSingle() { if (resposta instanceof Error) throw resposta; return resposta; },
      };
      return cadeia;
    },
  }) as never;
  const REF = "territory:11111111-1111-4111-8111-111111111111";

  const achada = await readTerritoryPrimaryKeyword(cliente({ data: { subject_id: REF, primaryKeyword: primariaSerpAceita("kw-b") }, error: null }), "brand-1", REF);
  assert.equal(achada.state === "found" ? achada.primaryKeyword?.keywordId : null, "kw-b");
  assert.deepEqual(chamadas, [
    ["from", "editorial_workflow_items"],
    ["select", TERRITORY_PRIMARY_COLUMNS],
    ["eq", "marca_id", "brand-1"],
    ["eq", "subject_type", "territory"],
    ["eq", "stage", "architect"],
    ["eq", "subject_id", REF],
  ]);
  // Mudou em 2026-09-23 (correção da A3): a mesma leitura estreita traz a
  // origem do Silo (publicado? existente?), que decide se a SERP pode eleger.
  assert.equal(TERRITORY_PRIMARY_COLUMNS, "subject_id,primaryKeyword:payload->territory->primaryKeyword,publicationProtection:payload->territory->publicationProtection,territoryKind:payload->territory->territoryKind");
  assert.doesNotMatch(TERRITORY_PRIMARY_COLUMNS, /(^|,)payload(,|$)|\*/);

  const semPrimaria = await readTerritoryPrimaryKeyword(cliente({ data: { subject_id: REF, primaryKeyword: null, publicationProtection: "protected", territoryKind: "existing" }, error: null }), "brand-1", REF);
  assert.deepEqual(semPrimaria, { state: "found", primaryKeyword: null, origin: { publicationProtection: "protected", territoryKind: "existing" } });
  // Origem ausente vira null — e null fecha a eleição pela SERP.
  const semOrigem = await readTerritoryPrimaryKeyword(cliente({ data: { subject_id: REF, primaryKeyword: null }, error: null }), "brand-1", REF);
  assert.deepEqual(semOrigem, { state: "found", primaryKeyword: null, origin: { publicationProtection: null, territoryKind: null } });
  assert.equal(serpPrimaryOriginRefusal(semOrigem.state === "found" ? semOrigem.origin : null)?.code, "TERRITORY_ORIGIN_UNKNOWN");
  assert.deepEqual(await readTerritoryPrimaryKeyword(cliente({ data: null, error: null }), "brand-1", REF), { state: "missing" });
  assert.equal((await readTerritoryPrimaryKeyword(cliente({ data: null, error: { message: "rls" } }), "brand-1", REF)).state, "read_failed");
  assert.equal((await readTerritoryPrimaryKeyword(cliente(new Error("rede")), "brand-1", REF)).state, "read_failed");
  assert.equal((await readTerritoryPrimaryKeyword(cliente({ data: { subject_id: REF, primaryKeyword: { electedBy: "serp" } }, error: null }), "brand-1", REF)).state, "read_failed");

  // Correção A3: a membership da keyword aceita, lida estreita e pela marca.
  chamadas.length = 0;
  const daKeyword = await readKeywordTerritoryRef(cliente({ data: { subject_id: "kw-forte", territoryRef: REF }, error: null }), "brand-1", "kw-forte");
  assert.deepEqual(daKeyword, { state: "found", territoryRef: REF });
  assert.deepEqual(chamadas, [
    ["from", "editorial_workflow_items"],
    ["select", KEYWORD_TERRITORY_REF_COLUMNS],
    ["eq", "marca_id", "brand-1"],
    ["eq", "subject_type", "keyword"],
    ["eq", "stage", "architect"],
    ["eq", "subject_id", "kw-forte"],
  ]);
  assert.equal(KEYWORD_TERRITORY_REF_COLUMNS, "subject_id,territoryRef:payload->territoryRef");
  assert.deepEqual(await readKeywordTerritoryRef(cliente({ data: { subject_id: "kw-forte", territoryRef: null }, error: null }), "brand-1", "kw-forte"), { state: "found", territoryRef: null });
  // Keyword de outra marca não é achada pelo filtro da marca: missing, e o aceite recusa.
  assert.deepEqual(await readKeywordTerritoryRef(cliente({ data: null, error: null }), "brand-1", "kw-de-outra-marca"), { state: "missing" });
  assert.equal((await readKeywordTerritoryRef(cliente({ data: null, error: { message: "rls" } }), "brand-1", "kw-forte")).state, "read_failed");
  assert.equal((await readKeywordTerritoryRef(cliente(new Error("rede")), "brand-1", "kw-forte")).state, "read_failed");
});

test("Q13 · a rota: aceite só com ator e hora do servidor, e a porta genérica passa pela trava da primária", () => {
  const rota = semComentarios("../app/api/arquiteto/workspace/route.ts");
  assert.match(rota, /territoryPrimaryAcceptances: z\.array\(z\.object\(\{[\s\S]*?acceptance: SerpPrimaryAcceptanceSchema,[\s\S]*?\}\)\.strict\(\)\)\.max\(20\)\.optional\(\),/);
  assert.match(rota, /\|\| body\.territoryPrimaryAcceptances\?\.length/);
  assert.match(rota, /readTerritoryPrimaryKeyword\(context\.supabase, context\.brandId, territoryRef\)/);
  assert.match(rota, /if \(lida\.state === "read_failed"\) throw new PipelineRuntimeError\("QUERY_FAILURE"/);

  const generica = rota.slice(rota.indexOf("for (const update of parsed.territoryUpdates || [])"), rota.indexOf("for (const acceptance of parsed.territoryPrimaryAcceptances || [])"));
  const trava = generica.indexOf("territoryPrimaryChangeRefusal(await primariaVigente(update.territoryRef), update.territory)");
  assert.ok(trava > 0 && trava < generica.indexOf("updateTerritoryWorkflowItem("), "a trava vem antes da gravação");

  const aceite = rota.slice(rota.indexOf("for (const acceptance of parsed.territoryPrimaryAcceptances || [])"), rota.indexOf("const siloWorkingCopies = [];"));
  // Mudou em 2026-09-23 (correção da A3): a primária, a origem do Silo e o
  // Silo da keyword aceita vêm todos do banco, antes do aceite.
  assert.match(aceite, /const vigente = await territorioVigente\(acceptance\.territoryRef\);/);
  assert.match(aceite, /const daKeyword = await readKeywordTerritoryRef\(context\.supabase, context\.brandId, acceptance\.acceptance\.keywordId\);/);
  assert.match(aceite, /if \(daKeyword\.state === "read_failed"\) throw new PipelineRuntimeError\("QUERY_FAILURE"/);
  assert.match(aceite, /current: vigente\.primaryKeyword,/);
  assert.match(aceite, /territoryRef: acceptance\.territoryRef,\s*territory: vigente\.origin,\s*keywordTerritoryRef: daKeyword\.state === "found" \? daKeyword\.territoryRef : null,/);
  assert.doesNotMatch(aceite, /territory: acceptance\.territory[,\s]|acceptance\.acceptance\.territory/);
  assert.ok(aceite.indexOf("readKeywordTerritoryRef(") < aceite.indexOf("acceptSerpPrimaryProposal("));
  assert.match(aceite, /actorUserId: context\.actorUserId,/);
  assert.match(aceite, /confirmedAt: new Date\(\)\.toISOString\(\),/);
  assert.match(aceite, /if \(!aceite\.ok\) throw new PipelineRuntimeError\("CONFLICT", aceite\.reason, 409\);/);
  assert.match(aceite, /\.\.\.acceptance\.territory,\s*primaryKeyword: aceite\.primary,/);
  assert.ok(aceite.indexOf("acceptSerpPrimaryProposal(") < aceite.indexOf("updateTerritoryWorkflowItem("));
  assert.doesNotMatch(aceite, /acceptance\.acceptance\.actorUserId|body\.actorUserId/);
});

test("Q14 · o cliente só aceita pela porta própria e só dá sucesso com o readback da primária aceita", () => {
  const cliente = semComentarios("../lib/arquiteto/canonical-workspace.ts");
  const inicio = cliente.indexOf("export async function acceptRemoteSiloPrimaryProposal");
  // O arquivo é CRLF e a assinatura também fecha com "}": o corpo vai até o retorno.
  const corpo = cliente.slice(inicio, cliente.indexOf("return updated;", inicio));
  assert.ok(inicio > -1 && corpo.length > 0);
  assert.match(corpo, /territoryPrimaryAcceptances: \[\{/);
  assert.doesNotMatch(corpo, /territoryUpdates|actorUserId|confirmedAt/);
  assert.match(corpo, /primaria\?\.electedBy !== "serp" \|\| primaria\.keywordId !== input\.acceptance\.keywordId \|\| !primaria\.confirmedBy/);
});

test("Q15 · a mesa: a proposta é derivada, o aceite é um clique humano em dois passos, e a coleta vale sem primária", () => {
  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  // A proposta nasce num useMemo das observações coletadas — leitura, não escrita.
  const memo = workspace.slice(workspace.indexOf("const siloPrimaryProposals = useMemo("), workspace.indexOf("const [siloPrimaryBusyRef"));
  assert.match(memo, /proposeSiloPrimaryFromSerp\(\{/);
  assert.match(memo, /keywordSerpByScope\.get\(territoryRef\)/);
  assert.doesNotMatch(memo, /fetch\(|accept|update|create|persist/i);
  // Uma porta de escrita só, dentro do handler do clique.
  assert.equal(workspace.split("acceptRemoteSiloPrimaryProposal(").length - 1, 1);
  const handler = workspace.slice(workspace.indexOf("const acceptSiloPrimaryProposal = async"), workspace.indexOf("\n  };\n", workspace.indexOf("const acceptSiloPrimaryProposal = async")));
  assert.match(handler, /serpPrimaryAcceptanceOf\(proposta\)/);
  assert.match(handler, /await acceptRemoteSiloPrimaryProposal\(/);
  assert.ok(handler.indexOf('showNotification("success"') > handler.indexOf("await acceptRemoteSiloPrimaryProposal("), "sucesso só depois do readback");
  // A coleta não chama o aceite; o processamento não grava primária de SERP.
  const coleta = workspace.slice(workspace.indexOf("const collectKeywordSerp = async"), workspace.indexOf("const publishedSerpReadouts"));
  assert.doesNotMatch(coleta, /acceptSiloPrimaryProposal|acceptRemoteSiloPrimaryProposal/);
  assert.doesNotMatch(workspace, /electPrimaryFromSerp\(/);
  // O painel é renderizado com o aceite ligado ao handler.
  assert.match(workspace, /<SiloPrimaryProposalPanel[\s\S]*?onAccept=\{\(\) => \{ void acceptSiloPrimaryProposal\(view\.current\.territoryRef!\); \}\}/);
  // Sem primária, a coleta não fica mais bloqueada: é ela que alimenta a proposta.
  assert.doesNotMatch(workspace, /sem ela não há com o que comparar as secundárias/);

  const painel = semComentarios("../modules/arquiteto/silo-primary-proposal-panel.tsx");
  assert.match(painel, /proposal\.canAccept && proposal\.proposed && !confirmando/);
  // Dois passos: o primeiro botão só abre o antes/depois; quem chama onAccept é o segundo.
  assert.match(painel, /data-testid="architect-silo-primary-accept"/);
  assert.match(painel, /onClick=\{\(\) => setConfirmando\(true\)\}/);
  assert.equal(painel.split("onAccept()").length - 1, 1);
  assert.match(painel, /onClick=\{\(\) => \{ setConfirmando\(false\); onAccept\(\); \}\}/);
  assert.match(painel, /architect-silo-primary-accept-impact/);
  // Sistema visual: tokens, keyword com a cor dela, nada abaixo de 14px, sem cor crua.
  assert.match(painel, /text-keyword/);
  assert.match(painel, /text-pending/);
  assert.doesNotMatch(painel, /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|text-xs|text-\[1[0-3]px\]|purple|violet|indigo/);
});

test("Q20 · correção A3 · a mesa passa a origem gravada do Silo e o volume; o painel diz por que nada se aceita", () => {
  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  const memo = workspace.slice(workspace.indexOf("const siloPrimaryProposals = useMemo("), workspace.indexOf("const [siloPrimaryBusyRef"));
  assert.match(memo, /const territorio = remoteTerritories\.find\(item => item\.territoryRef === territoryRef\)\?\.territory \?\? null;/);
  assert.match(memo, /territory: territorio\s*\?\s*\{ publicationProtection: territorio\.publicationProtection, territoryKind: territorio\.territoryKind \}\s*:\s*null,/);
  assert.match(memo, /volumeSearch: typeof kw\.volume_search === "number" \? kw\.volume_search : null,/);

  const painel = semComentarios("../modules/arquiteto/silo-primary-proposal-panel.tsx");
  assert.match(painel, /OUT_OF_ORIGIN: \{ label: "Silo fora da lista nova: a SERP só informa"/);
  for (const codigo of ["SUBSTITUTION_VOLUME_NOT_MET", "SUBSTITUTION_VOLUME_MISSING", "PUBLISHED_SILO_WITHOUT_DECLARATION", "EXISTING_SILO_NOT_LIST_ORIGIN", "TERRITORY_ORIGIN_UNKNOWN"]) {
    assert.match(painel, new RegExp(`${codigo}: "`), codigo);
  }
  // Sem decisão aberta, a leitura da SERP não se chama "Proposta".
  assert.match(painel, /\{proposal\.decision \? "Proposta" : "A SERP aponta"\}:/);
});

/* ======== R · as lentes que chegam do Minerador e as que faltaram ========= */

test("R1 · as lentes da Qualificação do Minerador viram uma linha — e a legada não mostra nada", () => {
  assert.equal(describeQualificationLenses({ intent: "informacional", lenses: { observadas: 4, concordancia: { intent: 3, funnel: 2 } } }), "4 lentes · intenção 3/4 · funil 2/4");
  assert.equal(describeQualificationLenses({ lenses: { observadas: 3, concordancia: { intent: 3, funnel: 1 } } }), "3 de 4 lentes · intenção 3/3 · funil 1/3");
  // Legada, ausente ou malformada: nada aparece, e nada é inventado.
  assert.equal(describeQualificationLenses({ intent: "informacional" }), null);
  assert.equal(describeQualificationLenses(null), null);
  assert.equal(describeQualificationLenses({ lenses: { observadas: 2, concordancia: { intent: 3, funnel: 1 } } }), null);
  assert.equal(describeQualificationLenses({ lenses: { observadas: 0, concordancia: { intent: 0, funnel: 0 } } }), null);
  assert.equal(describeQualificationLenses({ lenses: { observadas: "4", concordancia: { intent: 3, funnel: 2 } } }), null);
});

test("R2 · a mesa mostra as lentes do handoff onde já mostra a intenção recebida", () => {
  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  const estrategia = workspace.slice(workspace.indexOf("estrategia: ["), workspace.indexOf("semantica: [", workspace.indexOf("estrategia: [")));
  assert.ok(estrategia.indexOf('linha("Intenção"') < estrategia.indexOf('linha("Lentes da SERP", describeQualificationLenses(qualificacao))'));
});

test("R3 · o parecer diz quais lentes ficaram de fora e por quê, uma vez por lente e motivo", () => {
  const marcador = SerpLensesMarkerSchema.parse({
    requested: QUATRO_LENTES,
    observed: ["desktop-windows", "mobile-android"],
    missing: [
      { lens: "desktop-macos", keywordId: "kw-a", reason: "sem digest" },
      { lens: "mobile-ios", keywordId: "kw-a", reason: "não paga" },
      { lens: "mobile-ios", keywordId: "kw-b", reason: "não paga" },
    ],
    perLens: [],
    agreement: "2/2",
    collectedAtSpreadDays: 0,
    datesDiverge: false,
  });
  assert.equal(describeSerpLensesMissing(marcador), "Lentes fora do parecer: desktop-macos (sem digest) · mobile-ios (não paga).");
  assert.equal(describeSerpLensesMissing({ ...marcador, missing: [] }), null);
  assert.equal(describeSerpLensesMissing(null), null);

  const formacao = semComentarios("../modules/arquiteto/article-formation-review.tsx");
  assert.match(formacao, /data-testid="architect-review-serp-lenses-missing"/);
  const territorial = semComentarios("../modules/arquiteto/territorial-review-panel.tsx");
  assert.match(territorial, /describeSerpLensesMissing\(view\.serp\.assessment\.lenses\)/);
  const workspace = semComentarios("../modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(workspace, /lensesMissing: "lenses" in remoto \? describeSerpLensesMissing\(remoto\.lenses\) : null/);
});
