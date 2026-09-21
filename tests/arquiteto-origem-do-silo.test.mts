import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  readEditorialUnitDeclaration,
  declaresPublishedSilo,
  suggestsSiloPotential,
  describeEditorialUnitDeclaration,
} from "../lib/arquiteto/editorial-unit-declaration.ts";
import {
  serpLensOf,
  observationFromSnapshot,
  measureKeywordAffinity,
  aggregateUniverseCoverage,
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
import { DEFAULT_SERP_LENSES, keywordSerpWorkflowState, parseKeywordSerpWorkflowRow } from "../lib/arquiteto/keyword-serp-record.ts";
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
  type SerpCompetitiveObservation,
} from "../lib/arquiteto/silo-primary-keyword.ts";
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

test("A1 · publicada com siteRole de Silo vira declaração de fato, com endereço", () => {
  const declaracao = readEditorialUnitDeclaration({
    siteRole: "silo",
    url: "https://marca.com.br/skincare-facial",
    canonical: "https://marca.com.br/skincare-facial",
    observedAt: NOW,
    published: true,
  });

  assert.equal(declaracao?.source, "published");
  assert.equal(declaracao?.source === "published" ? declaracao.unit : null, "silo");
  assert.equal(declaracao?.source === "published" ? declaracao.url : null, "https://marca.com.br/skincare-facial");
  assert.equal(declaresPublishedSilo(declaracao), true);
  // Fato observado não é previsão, e o produto pediu para não confundir os dois.
  assert.equal(suggestsSiloPotential(declaracao), false);
});

test("A2 · papel publicado desconhecido vira 'other', não vira 'article' por conveniência", () => {
  const declaracao = readEditorialUnitDeclaration({ siteRole: "hub_editorial", published: true });
  assert.equal(declaracao?.source === "published" ? declaracao.unit : null, "other");
});

test("A3 · sem siteRole e sem potencial não há declaração — o acervo antigo não fica declarado", () => {
  assert.equal(readEditorialUnitDeclaration({}), undefined);
  assert.equal(readEditorialUnitDeclaration({ siteRole: "   " }), undefined);
  assert.equal(describeEditorialUnitDeclaration(undefined), "O Minerador ainda não declarou a natureza desta keyword.");
});

test("A4 · potencial declarado sobre keyword publicada é ignorado: o fato vence a previsão", () => {
  const ignorado = readEditorialUnitDeclaration({ potentialUnit: "silo", published: true });
  assert.equal(ignorado, undefined);

  const valido = readEditorialUnitDeclaration({ potentialUnit: "silo", potentialConfidence: 0.8, potentialReasons: ["volume alto"], published: false });
  assert.equal(valido?.source, "potential");
  assert.equal(suggestsSiloPotential(valido), true);
  assert.equal(declaresPublishedSilo(valido), false);
});

test("A5 · a declaração publicada tem precedência sobre o potencial quando as duas chegam", () => {
  const declaracao = readEditorialUnitDeclaration({
    siteRole: "article",
    potentialUnit: "silo",
    url: "https://marca.com.br/serum",
    published: true,
  });
  assert.equal(declaracao?.source, "published");
  assert.equal(declaracao?.source === "published" ? declaracao.unit : null, "article");
});

test("A6 · o Arquiteto passa a LER o siteRole que o handoff já transportava", () => {
  /*
   * O campo existia em readPublicationLink e não aparecia uma vez sequer em
   * lib/arquiteto. Esta é a ponte: o contexto de identidade agora carrega a
   * declaração para quem elege a primária.
   */
  const contexto = adaptKeywordIdentityContext({
    id: "kw-publicada",
    status: "publicado",
    siteRole: "silo",
    publishedUrl: "https://marca.com.br/skincare-facial",
    canonicalUrl: "https://marca.com.br/skincare-facial",
  } as unknown as Parameters<typeof adaptKeywordIdentityContext>[0]);

  assert.equal(contexto.editorialUnitDeclaration?.source, "published");
  assert.equal(declaresPublishedSilo(contexto.editorialUnitDeclaration), true);
});

test("A7 · keyword sem declaração não ganha o campo — ausência não vira dado", () => {
  const contexto = adaptKeywordIdentityContext({ id: "kw-nova" } as unknown as Parameters<typeof adaptKeywordIdentityContext>[0]);
  assert.equal("editorialUnitDeclaration" in contexto, false);
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

test("G3 · duas publicadas declaradas Silo no mesmo grupo não elegem nenhuma", () => {
  const declarada = (url: string) => EditorialUnitDeclarationSchema.parse({
    source: "published", unit: "silo", url, canonical: null, observedAt: NOW,
  });
  const proposta = propostaCom(new Map([
    ["kw-publicada", declarada("https://marca.com.br/a")],
    ["kw-apoio", declarada("https://marca.com.br/b")],
  ]));
  const silo = proposta.silos.find(item => item.source === "proposed");
  // São dois Silos, e a proposta não escolhe qual página do ar apagar.
  assert.equal(silo?.primaryKeywordDeclaration, null);
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
   */
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
  assert.equal(a.devicesAgreeing, 1);
  assert.ok(a.lensDivergence >= DEFAULT_SILO_STRENGTH.minLensDivergenceToCount);
  assert.equal(a.divergentLensesHolding, 1);
  // Uma lente que sustenta + o crédito da divergência alcançam o mínimo de duas.
  assert.equal(a.strong, true);
  assert.match(a.lensNote, /MUDA entre dispositivos/);
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
  assert.ok(afinidade.lensDivergence >= DEFAULT_AFFINITY.minLensDivergenceToCount);
  assert.equal(afinidade.supportsGrouping, true);
  assert.match(afinidade.reason, /universo mudando entre dispositivos/);
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

test("K2 · a cobertura da coleta é declarada: parcial não se anuncia completa", () => {
  const base = {
    scopeId: "territory:1",
    territoryRef: "territory:1",
    keywordIds: ["kw-a", "kw-b"],
    lenses: DEFAULT_SERP_LENSES,
    gaps: [],
    provenance: { operationRequestId: "op-1", collectedAt: NOW },
  };

  assert.equal(keywordSerpWorkflowState({ ...base, observations: [] }), "empty");

  const duasDeOito = [
    { keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com"], organicCount: 10, itemTypes: [], questions: [], commercialSignals: false },
    { keywordId: "kw-b", lens: "desktop-windows", competitorDomains: ["x.com"], organicCount: 10, itemTypes: [], questions: [], commercialSignals: false },
  ];
  assert.equal(keywordSerpWorkflowState({ ...base, observations: duasDeOito }), "partial");

  const todas = base.keywordIds.flatMap(keywordId => DEFAULT_SERP_LENSES.map(lens => ({
    keywordId, lens: serpLensOf(lens), competitorDomains: ["x.com"], organicCount: 10, itemTypes: [], questions: [], commercialSignals: false,
  })));
  assert.equal(keywordSerpWorkflowState({ ...base, observations: todas }), "complete");
  // Buraco declarado mantém a coleta parcial mesmo com o número fechando.
  assert.equal(keywordSerpWorkflowState({ ...base, observations: todas, gaps: [{ keywordId: "kw-a", lens: "mobile-ios", reason: "timeout" }] }), "partial");
});

test("K3 · a linha remota é recusada quando não concorda consigo mesma", () => {
  const payload = {
    contractVersion: "keyword-serp-record-v1",
    scopeId: "territory:1",
    territoryRef: "territory:1",
    keywordIds: ["kw-a"],
    lenses: [{ device: "desktop", operatingSystem: "windows" }],
    observations: [{ keywordId: "kw-a", lens: "desktop-windows", competitorDomains: ["x.com"], organicCount: 10, itemTypes: [], questions: [], commercialSignals: false }],
    gaps: [],
    provenance: { operationRequestId: "op-1", collectedAt: NOW },
  };
  const linha = {
    subjectType: "keyword_serp_observations",
    subjectId: "territory:1",
    stage: "architect",
    state: "complete",
    sourceEntityId: "territory:1",
    articleId: null,
    payload,
  };

  assert.equal(parseKeywordSerpWorkflowRow(linha).ok, true);

  // Estado que não bate com a cobertura não é normalizado em silêncio.
  const estadoErrado = parseKeywordSerpWorkflowRow({ ...linha, state: "partial" });
  assert.equal(estadoErrado.ok, false);
  assert.ok(!estadoErrado.ok && estadoErrado.issues.includes("STATE_DOES_NOT_MATCH_COVERAGE"));

  // Observação de universo não pertence a um Article.
  const comArtigo = parseKeywordSerpWorkflowRow({ ...linha, articleId: "article-1" });
  assert.ok(!comArtigo.ok && comArtigo.issues.includes("ARTICLE_ID_PRESENT"));
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

test("K6 · a rota coleta por keyword POR LENTE e só declara sucesso depois do readback", () => {
  const rota = semComentarios("../app/api/arquiteto/keyword-serp/route.ts");

  // O produto cartesiano keyword × lente é o que sustenta a medição de divergência.
  assert.match(rota, /keywords\.flatMap/);
  assert.match(rota, /lenses\.map/);
  assert.match(rota, /operatingSystem: alvo\.lens\.operatingSystem/);
  // Persistir e reler: provider OK não é sucesso.
  assert.match(rota, /saveKeywordSerpObservations/);
  assert.match(rota, /readbackKeywordSerpObservations/);
  // O buraco é declarado em vez de virar silêncio.
  assert.match(rota, /gaps\.push/);
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
  assert.match(rota, /payloadDepth: "advanced"/);

  // Quem não pede continua no `regular`: o pedido do Radar não muda.
  const { body } = buildDataForSeoSerpOperationRequest(pedidoBase);
  assert.equal("os" in body[0], false);
});
