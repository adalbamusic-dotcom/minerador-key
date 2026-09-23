import { readFileSync } from "node:fs";
import { RadarAnalysisPayloadSchema, RadarExtractionPageSchema, VersionedRadarAnalysisSchema } from "../lib/radar/analysis-contracts.ts";
import { splitAnalysisRun } from "../lib/radar/analysis-run-storage.ts";
import { RadarItemSchema } from "../lib/editorial/operational-flow.ts";
import { VersionedArticleDNASchema, VersionedSiloDNASchema } from "../lib/arquiteto/contracts.ts";
import { SerpCollectionRecordSchema, type SerpCollectionRecord } from "../lib/editorial/contracts.ts";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { buildSerpSnapshotPersistenceRow } from "../lib/server/serp-persistence-adapter.ts";

/*
 * ===== A BANCADA DO EXPORT: a marca inteira num PostgREST simulado =====
 *
 * Usada por `radar-export-leitura-por-artigo.test.mts`. Fica fora do glob
 * `*.test.mts` porque não é suíte: é o banco semeado e o `fetch` que responde
 * por ele.
 *
 * Tudo passa pelos schemas reais (ArticleDNA, SiloDNA, RadarItem, versão de
 * análise, registro de SERP) antes de ir para o banco: uma fixture inventada
 * testaria a fantasia do contrato, e um campo com nome errado passaria verde.
 *
 * Nenhuma rede: o `fetch` simulado recusa qualquer host que não seja o do
 * banco de teste.
 */

export type Linha = Record<string, unknown>;
export type Pedido = { metodo: string; tabela: string; params: URLSearchParams; bytes: number };

export const HOST_DO_BANCO = "supabase-export.teste.invalid";

const uuid = (numero: number) => `6b1e${String(numero).padStart(4, "0")}-2c3d-4e5f-8a9b-${String(numero).padStart(12, "0")}`;
const hash = (numero: number) => `sha256:${numero.toString(16).padStart(64, "0")}`;

export const MARCA = uuid(1);
const SILO = uuid(10);
const ATOR = uuid(99);

/*
 *   artigo   o que ele exercita
 *   F        finalizado no Google; a corrente é a de maior número e NÃO é a última do array
 *   N        investigação aberta (recusado), com corridas
 *   V        item sem nenhuma versão de análise (recusado)
 *   M        ArticleDNA ausente (recusado antes de ler o item)
 *   T        empate no maior número: vale a PRIMEIRA do array, e a segunda é diferente
 *   X        a corrida da maior versão não passa no contrato: a leitura volta à antiga
 *   Z        versão com número em texto e versão sem id: fora da escolha
 */
export const ARTIGO = {
  F: uuid(201), N: uuid(202), V: uuid(203), M: uuid(204), T: uuid(205), X: uuid(206), Z: uuid(207),
} as const;
type Chave = keyof typeof ARTIGO;

const TITULOS: Record<Chave, string> = {
  F: "Skincare facial: a rotina que cabe na manhã",
  N: "Protetor solar para pele oleosa",
  V: "Sérum de vitamina C",
  M: "Hidratante oil free",
  T: "Limpeza facial em dois passos",
  X: "Tônico facial: quando usar",
  Z: "Esfoliação sem irritar",
};

const DNA_VERSAO: Record<Chave, string> = Object.fromEntries(
  (Object.keys(ARTIGO) as Chave[]).map((chave, indice) => [chave, uuid(300 + indice)]),
) as Record<Chave, string>;
const DNA_HASH: Record<Chave, string> = Object.fromEntries(
  (Object.keys(ARTIGO) as Chave[]).map((chave, indice) => [chave, hash(300 + indice)]),
) as Record<Chave, string>;
const KEYWORD: Record<Chave, string> = Object.fromEntries(
  (Object.keys(ARTIGO) as Chave[]).map((chave, indice) => [chave, uuid(400 + indice)]),
) as Record<Chave, string>;
const SECUNDARIA: Record<Chave, string> = Object.fromEntries(
  (Object.keys(ARTIGO) as Chave[]).map((chave, indice) => [chave, uuid(450 + indice)]),
) as Record<Chave, string>;

const textoDaKeyword = (chave: Chave) => (chave === "F" ? "skincare facial" : TITULOS[chave].toLowerCase().split(":")[0]);
const textoDaSecundaria = (chave: Chave) => `${textoDaKeyword(chave)} como fazer`;

/* ============================== ArticleDNA e SiloDNA ============================== */

function referencia(chave: Chave, papel: "principal" | "secundaria") {
  const id = papel === "principal" ? KEYWORD[chave] : SECUNDARIA[chave];
  return {
    keywordId: id, keywordDnaVersionId: `kwdna-${id}`, keywordDnaContentHash: hash(500), role: papel,
    strategicContribution: `Contribuição de ${papel === "principal" ? textoDaKeyword(chave) : textoDaSecundaria(chave)}`,
    coveredIntentions: ["informacional"], requiredTopics: [textoDaKeyword(chave)], excludedTopics: [],
    classificationOrigin: "human" as const, confidence: 0.8, humanConfirmed: true, normalizedIntent: "informational" as const,
    volume: papel === "principal" ? 1900 : 320, resultCount: 190, kgrScore: 0.08,
    incrementalVolume: papel === "principal" ? null : 320,
    contribution: papel === "principal" ? "central" as const : "incremental_volume" as const,
    purpose: "Cobrir a intenção declarada", overlapRisk: "low" as const,
  };
}

function articleDna(chave: Chave, indice: number) {
  const slug = `artigo-${chave.toLowerCase()}-pele-oleosa`;
  return VersionedArticleDNASchema.parse({
    versionId: DNA_VERSAO[chave], entityId: ARTIGO[chave], versionNumber: 1, previousVersionId: null,
    contentHash: DNA_HASH[chave], origin: "human", changeReason: "bancada",
    createdAt: `2026-09-1${indice}T09:00:00.000Z`, createdBy: ATOR,
    payload: {
      schemaVersion: 1, articleId: ARTIGO[chave], brandId: MARCA, principalKeywordId: KEYWORD[chave],
      secondaryKeywordIds: [SECUNDARIA[chave]], narrativeReinforcementIds: [],
      keywordReferences: [referencia(chave, "principal"), referencia(chave, "secundaria")],
      siloId: SILO, hierarchy: chave === "F" ? "Pilar" : "Suporte",
      suggestedSlug: slug, canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
      audience: "Pele oleosa", problem: "Rotina indefinida", desiredResult: "Rotina clara", journeyStage: "consideracao",
      brandObjective: "Autoridade", promise: TITULOS[chave], angle: "Prático",
      cta: "Conhecer", coverage: ["rotina de skincare", "pele oleosa"], excludedSubjects: [],
      antiCannibalizationBoundary: "Sem maquiagem", nearbyArticleIds: [], differentiation: ["Passo a passo"],
      entities: ["pele oleosa"], requiredTopics: ["rotina de skincare"], questions: ["quantas vezes usar?"],
      objections: ["preço"], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [],
      confidence: 0.7, humanPendingDecisions: [],
    },
  });
}

const ORDEM: Chave[] = ["F", "N", "V", "M", "T", "X", "Z"];
const DNAS = ORDEM.filter(chave => chave !== "M").map((chave, indice) => articleDna(chave, indice));

const SILO_DNA = VersionedSiloDNASchema.parse({
  versionId: uuid(20), entityId: SILO, versionNumber: 1, previousVersionId: null,
  contentHash: hash(20), origin: "human", changeReason: "bancada",
  createdAt: "2026-09-10T08:00:00.000Z", createdBy: ATOR,
  payload: {
    schemaVersion: 1, formationStatus: "formed", siloId: SILO, brandId: MARCA, name: "Cuidados com a pele oleosa",
    territoryNarrative: { statement: "Quem tem pele oleosa precisa de rotina, e não de produto solto.", continuity: "coherent", brandAlignment: "aligned", rationale: ["bancada"] },
    centralEntity: "pele oleosa",
    objective: "Construir autoridade em cuidados com pele oleosa.",
    audience: "Pessoas com pele oleosa que querem uma rotina simples.",
    macroProblem: "Brilho excessivo e poros obstruídos sem saber por onde começar.",
    dominantIntent: "informacional",
    pillarArticleId: ARTIGO.F,
    supportArticleIds: ORDEM.filter(chave => chave !== "F").map(chave => ARTIGO[chave]),
    articleReferences: ORDEM.map(chave => ({
      articleId: ARTIGO[chave], articleDnaVersionId: DNA_VERSAO[chave], articleDnaContentHash: DNA_HASH[chave],
      role: chave === "F" ? "Pilar" as const : "Suporte" as const,
    })),
    articleRoles: ORDEM.map(chave => ({ articleId: ARTIGO[chave], role: chave === "F" ? "Pilar" : "Suporte", reason: "bancada" })),
    narrativeOrder: ORDEM.map(chave => ARTIGO[chave]),
    linkMap: [],
    boundary: "Pele oleosa no rosto; acne clínica fica fora.",
    includedTopics: ["limpeza", "hidratação leve", "protetor solar oil free"],
    excludedTopics: ["tratamento de acne com medicamento"],
    nearbySiloIds: [], possibleConflicts: [], gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [],
  },
});

/* ============================== a SERP de F ============================== */

const CORPO_DA_SERP = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8")) as Record<string, unknown>;
const OBSERVADA_EM = "2026-09-20T08:00:00.000Z";

function registroDaSerp(chave: Chave, numero: number): SerpCollectionRecord {
  const pesquisa = normalizeDataForSeoSerpResponse(CORPO_DA_SERP, {
    brandId: MARCA, articleId: ARTIGO[chave], articleDnaVersionId: DNA_VERSAO[chave],
    keywordId: KEYWORD[chave], keywordDnaVersionId: `kwdna-${KEYWORD[chave]}`, keyword: textoDaKeyword(chave),
    location: "2076", language: "pt", device: "desktop", operatingSystem: "windows",
    expectedIntent: "informacional", expectedFormat: "Suporte",
    requiredTopics: ["limpeza"], articleEntities: ["pele oleosa"],
    resultLimit: 10, version: 1, previousSnapshotId: null,
  }, { locationCode: 2076, languageCode: "pt" }, OBSERVADA_EM, `tarefa-${numero}`);
  const id = uuid(600 + numero);
  return SerpCollectionRecordSchema.parse({
    id, input: { keyword: pesquisa.query, articleId: ARTIGO[chave], location: pesquisa.location, language: pesquisa.language, device: pesquisa.device },
    status: "collected", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null,
    dnaIntent: null, conflictReason: null, humanDecisionRequired: false,
    research: { ...pesquisa, id, persistenceMode: "remote", status: "approved" },
  });
}

const SERPS: Partial<Record<Chave, SerpCollectionRecord>> = {
  F: registroDaSerp("F", 1),
  N: registroDaSerp("N", 2),
  T: registroDaSerp("T", 3),
  X: registroDaSerp("X", 4),
  Z: registroDaSerp("Z", 5),
};

/* ============================== as versões de análise ============================== */

const link = (patch: Record<string, unknown> = {}) => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org",
  kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Causas da pele oleosa", rel: [], target: null, order: 0,
  ...patch,
});

/* As páginas da concorrência: é o peso da corrida, e é o que muda o CSV quando falta. */
function pagina(marcador: string, indice: number, url: string) {
  return RadarExtractionPageSchema.parse({
    id: `${marcador}-p${indice}`, url, status: "success",
    fetchedAt: "2026-09-20T10:00:00.000Z", title: `Concorrente ${indice} · ${marcador}`, metaDescription: "", canonical: null,
    h1: [`Skincare facial ${marcador}`], h2: [`Passo ${indice} da rotina ${marcador}`, "Pode usar ácido salicílico na gravidez?"], h3: [`Detalhe ${marcador}`], wordCount: 1600 + indice,
    internalLinkCount: 0, externalLinkCount: 1, listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2,
    blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"],
    recurringTerms: [], boldCount: 3, italicCount: 0, observedLinks: [link()], error: null,
    introText: `o corpo pesado da versão ${marcador} `.repeat(10),
  });
}

const FOTOGRAFIA = (chave: Chave, marcador: string, extractionIds: string[]) => ({
  bundleId: `bundle-${chave}`, bundleHash: `hash-${chave}`, frozenAt: "2026-09-21T12:00:00.000Z", frozenBy: ATOR,
  conclusion: "FINALIZABLE", acknowledgedInsufficiency: null,
  binding: { brandId: MARCA, articleId: ARTIGO[chave], articleDnaVersionId: DNA_VERSAO[chave], articleDnaContentHash: DNA_HASH[chave] },
  foundationFingerprint: `fp-${chave}`,
  search: { mode: "kgr_light", canonicalQueries: 1, auxiliaryQueries: 0, queries: [], uniqueReferences: 0, selectedReferences: 0, recurrentReferences: 0, auxiliaryOnlyReferences: 0 },
  sample: { analyzedSuccess: extractionIds.length, comparablePages: extractionIds.length, failedFinal: 0, extractionIds },
  model: { sufficiency: "SUFFICIENT", sufficiencyReasons: [], intent: null, dominantFormat: null, recurrentConcepts: 0, questions: 0, gaps: 0, differentiations: 0, conflicts: 0, conceptIds: [] },
  links: { graphVersionId: null, graphContentHash: null, relatedDestinations: 0, outgoing: [], incoming: [], totalRecommendedLinks: 0, unresolvedRelations: 0 },
  authority: { ymylRelevance: "LOW", claims: [], verifiedSources: [], factualEvidence: [], marketVsFactConflicts: [], specialistRequirements: [] },
  discovery: { applicable: false, applicability: "NOT_APPLICABLE", required: false, funnel: null, answerableUnits: [], coreQuestions: 0, definitionRequirements: 0, entityCoverageRequirements: 0, retrievabilityRequirements: 0, matrix: { shared: 0, search: 0, aiDiscovery: 0 } },
  blueprint: null,
  /* A versão escolhida aparece no CSV por aqui: escolher outra muda a linha. */
  limitations: [`Amostra de ${extractionIds.length} páginas na versão ${marcador}.`],
});

type OpcoesDaVersao = {
  versionId: string;
  versionNumber: unknown;
  corrida: boolean;
  finalizada?: boolean;
  marcador: string;
  status?: "draft" | "approved";
  corridaQuebrada?: boolean;
};

function versao(chave: Chave, opcoes: OpcoesDaVersao): Linha {
  const serp = SERPS[chave] || null;
  const urls = (serp?.research?.organicResults || []).map(resultado => resultado.url);
  const paginas = opcoes.corrida
    ? Array.from({ length: 4 }, (_, indice) => pagina(opcoes.marcador, indice, urls[indice] || `https://concorrente-${indice}.test/${opcoes.marcador}`))
    : [];
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: MARCA, articleId: ARTIGO[chave], articleDnaVersionId: DNA_VERSAO[chave],
    serpSnapshotId: serp?.id ?? null, serpSnapshotVersion: serp?.research?.version ?? null, serpSnapshotHash: serp?.research?.contentHash ?? null,
    serpDecisions: urls.slice(0, 2).map((url, indice) => ({ key: `organic:${indice + 1}`, itemType: "organic", decision: "included", reason: "", note: "", ownDomain: false, url })),
    selectedCompetitorIds: urls.slice(0, 2).map((_, indice) => `organic:${indice + 1}`), extractionIds: paginas.map(item => item.id),
    extractions: paginas, extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: opcoes.finalizada ? FOTOGRAFIA(chave, opcoes.marcador, paginas.map(item => item.id)) : null,
    benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["bancada"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: opcoes.status || "draft", humanNotes: [], approvedAt: null, approvedBy: null,
    analysisCompletedAt: opcoes.corrida ? "2026-09-20T11:00:00.000Z" : null,
  });
  const inteira = VersionedRadarAnalysisSchema.parse({
    versionId: typeof opcoes.versionId === "string" && opcoes.versionId ? opcoes.versionId : "placeholder",
    entityId: `radar-analysis:${ARTIGO[chave]}`, versionNumber: 1, previousVersionId: null,
    contentHash: hash(700), origin: "human", changeReason: `bancada ${opcoes.marcador}`,
    createdAt: "2026-09-20T10:00:00.000Z", createdBy: ATOR, payload,
  }) as unknown as Linha;
  /* O número e o id entram CRUS: é a linha gravada que decide, não a fixture. */
  const crua: Linha = { ...inteira, versionId: opcoes.versionId, versionNumber: opcoes.versionNumber };
  if (opcoes.corridaQuebrada) {
    crua.payload = { ...(crua.payload as Linha), extractions: [{ quebrada: true, marcador: opcoes.marcador }] };
  }
  return crua;
}

/*
 * As versões de cada artigo, NA ORDEM DO ARRAY GRAVADO.
 * `id` é o versionId; o número é o `versionNumber` cru da linha.
 */
function versoesDe(chave: Chave): Linha[] {
  const id = (sufixo: string) => `${chave.toLowerCase()}-${sufixo}`;
  switch (chave) {
    case "F":
      return [
        versao("F", { versionId: id("v1"), versionNumber: 1, corrida: true, marcador: "F1", status: "approved" }),
        versao("F", { versionId: id("v5"), versionNumber: 5, corrida: true, finalizada: true, marcador: "F5" }),
        versao("F", { versionId: id("v2"), versionNumber: 2, corrida: true, marcador: "F2" }),
        versao("F", { versionId: id("v4"), versionNumber: 4, corrida: false, marcador: "F4" }),
      ];
    case "N":
      return [
        versao("N", { versionId: id("v1"), versionNumber: 1, corrida: true, marcador: "N1" }),
        versao("N", { versionId: id("v2"), versionNumber: 2, corrida: true, marcador: "N2" }),
      ];
    case "V":
      return [];
    case "M":
      return [];
    case "T":
      return [
        versao("T", { versionId: id("v1"), versionNumber: 1, corrida: true, marcador: "T1" }),
        versao("T", { versionId: id("v3a"), versionNumber: 3, corrida: true, finalizada: true, marcador: "T3a" }),
        versao("T", { versionId: id("v3b"), versionNumber: 3, corrida: true, finalizada: true, marcador: "T3b" }),
      ];
    case "X":
      return [
        versao("X", { versionId: id("v1"), versionNumber: 1, corrida: true, marcador: "X1" }),
        versao("X", { versionId: id("v2"), versionNumber: 2, corrida: true, finalizada: true, marcador: "X2" }),
        versao("X", { versionId: id("v3"), versionNumber: 3, corrida: true, finalizada: true, marcador: "X3", corridaQuebrada: true }),
      ];
    case "Z":
      return [
        versao("Z", { versionId: id("v1"), versionNumber: 1, corrida: true, marcador: "Z1" }),
        versao("Z", { versionId: id("v2"), versionNumber: 2, corrida: true, finalizada: true, marcador: "Z2" }),
        versao("Z", { versionId: id("v9"), versionNumber: "9", corrida: true, finalizada: true, marcador: "Z9" }),
        versao("Z", { versionId: "", versionNumber: 12, corrida: true, finalizada: true, marcador: "Z12" }),
        versao("Z", { versionId: id("v7"), versionNumber: 7.5, corrida: true, finalizada: true, marcador: "Z7" }),
      ];
  }
}

/* ============================== o item do Radar ============================== */

function snapshotHidratado(chave: Chave, papel: "principal" | "secundaria") {
  const id = papel === "principal" ? KEYWORD[chave] : SECUNDARIA[chave];
  return {
    referenceKeywordId: id, canonicalKeywordId: id, sourceKeywordId: id, originalKeywordId: id,
    aliases: [], keywordDnaVersionId: `kwdna-${id}`, keyword: papel === "principal" ? textoDaKeyword(chave) : textoDaSecundaria(chave), role: papel,
    brandId: MARCA, siloId: SILO, siloName: "Cuidados com a pele oleosa", isPublished: false,
  };
}

function itemDoRadar(chave: Chave, indice: number): Linha {
  const item = RadarItemSchema.parse({
    id: `radar:${ARTIGO[chave]}`, brandId: MARCA, articleId: ARTIGO[chave], articleDnaVersionId: DNA_VERSAO[chave], articleDnaContentHash: DNA_HASH[chave],
    title: TITULOS[chave], slug: `slug-${chave.toLowerCase()}`,
    siloId: SILO, hierarchy: chave === "F" ? "Pilar" : "Suporte", principalKeywordId: KEYWORD[chave], format: "Pilar",
    intent: "informacional", state: "research_pending", importedAt: "2026-09-12T10:00:00.000Z",
    updatedAt: "2026-09-12T10:00:00.000Z", origin: "real", lockVersion: 1,
    hydration: {
      schemaVersion: 1, brandId: MARCA, articleId: ARTIGO[chave], articleDnaVersionId: DNA_VERSAO[chave], source: "arquiteto_import",
      capturedAt: "2026-09-12T10:00:00.000Z", principalKeywordId: KEYWORD[chave],
      principalKeyword: snapshotHidratado(chave, "principal"),
      keywordSnapshots: [snapshotHidratado(chave, "principal"), snapshotHidratado(chave, "secundaria")],
      silo: {
        id: SILO, name: "Cuidados com a pele oleosa", siloDnaVersionId: SILO_DNA.versionId,
        siloDnaContentHash: SILO_DNA.contentHash, territoryRef: "territorio-1", siloPageId: null,
        siloPageVersionId: null, siloPageSlug: null, siloPageCanonical: null,
        siloPagePublicationStatus: null, articleRole: chave === "F" ? "pillar" : "support",
      },
    },
    arquitetoKeywordDnaReferences: [referencia(chave, "principal"), referencia(chave, "secundaria")],
  });
  const { analysisVersions: _descartadas, ...semVersoes } = item as unknown as Linha;
  void _descartadas;
  return {
    id: `wf-${chave.toLowerCase()}`, marca_id: MARCA, article_id: ARTIGO[chave], subject_type: "article", subject_id: ARTIGO[chave],
    stage: "radar", state: "research_pending", lock_version: 3 + indice,
    created_at: "2026-09-12T10:00:00.000000+00:00", updated_at: "2026-09-21T10:00:00.000000+00:00",
    payload: { ...semVersoes },
  };
}

/* ============================== o banco semeado ============================== */

export type Banco = Record<string, Linha[]>;

export function semearBanco(): Banco {
  const itens: Linha[] = [];
  const corridas: Linha[] = [];
  ORDEM.filter(chave => chave !== "M").forEach((chave, indice) => {
    const item = itemDoRadar(chave, indice);
    const leves: Linha[] = [];
    for (const inteira of versoesDe(chave)) {
      /* Como guardarCorridas: versão sem id fica INTEIRA na linha; só as outras têm corrida separada. */
      if (typeof inteira.versionId !== "string" || !inteira.versionId) { leves.push(inteira); continue; }
      const { light, run, hasRun } = splitAnalysisRun(inteira);
      leves.push(light);
      if (hasRun) {
        corridas.push({ workflow_item_id: item.id, version_id: inteira.versionId, marca_id: MARCA, article_id: ARTIGO[chave], payload: run });
      }
    }
    item.payload = { ...(item.payload as Linha), analysisVersions: leves };
    itens.push(item);
  });

  const artefatos: Linha[] = [...DNAS.map(versao => ({ tipo: "article_dna", versao })), { tipo: "silo_dna", versao: SILO_DNA }].map(({ tipo, versao }) => ({
    artifact_type: tipo, payload: versao, version_id: versao.versionId, entity_id: versao.entityId,
    version_number: versao.versionNumber, previous_version_id: versao.previousVersionId, content_hash: versao.contentHash,
    origin: versao.origin, change_reason: versao.changeReason, created_by: versao.createdBy, created_at: versao.createdAt,
    marca_id: MARCA, status: "approved",
  }));

  const snapshots = (Object.values(SERPS) as SerpCollectionRecord[]).map(registro => buildSerpSnapshotPersistenceRow({ brandId: MARCA, record: registro, actorId: ATOR }).row as unknown as Linha);

  return {
    editorial_artifact_versions: artefatos,
    editorial_version_status_events: [],
    editorial_serp_snapshots: snapshots,
    editorial_serp_reviews: [],
    editorial_workflow_items: itens,
    radar_analysis_runs: corridas,
    radar_video_brief_extract_runs: [],
    radar_video_brief_extracts: [],
    radar_video_sources: [],
    expert_briefs: [],
    expert_contributions: [],
    minerador_keywords: [],
  };
}

/* Os artigos que a tela manda no "Silos completos" desta marca: todos, M incluído. */
export const PEDIDO_DO_SILO = ORDEM.map(chave => ARTIGO[chave]);

/* ============================== o PostgREST simulado ============================== */

const PARAMETROS_NAO_FILTRO = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function casa(linha: Linha, params: URLSearchParams): boolean {
  for (const [coluna, filtro] of params) {
    if (PARAMETROS_NAO_FILTRO.has(coluna)) continue;
    const bruto = linha[coluna];
    const valor = bruto === null || bruto === undefined ? "null" : String(bruto);
    if (filtro.startsWith("eq.")) {
      if (valor !== filtro.slice(3)) return false;
      continue;
    }
    if (filtro === "is.null") {
      if (bruto !== null && bruto !== undefined) return false;
      continue;
    }
    if (filtro.startsWith("in.(") && filtro.endsWith(")")) {
      const lista = filtro.slice(4, -1).split(",").map(item => item.replace(/^"|"$/g, ""));
      if (!lista.includes(valor)) return false;
      continue;
    }
    throw new Error(`filtro não simulado: ${coluna}=${filtro}`);
  }
  return true;
}

function caminho(linha: Linha, expressao: string): unknown {
  const partes = expressao.split(/->>?/);
  let atual: unknown = linha[partes[0]];
  for (const chave of partes.slice(1)) {
    atual = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Linha)[chave] : undefined;
  }
  return atual === undefined ? null : atual;
}

function projeta(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return structuredClone(linha);
  const saida: Linha = {};
  for (const item of select.split(",")) {
    const [apelido, expressao] = item.includes(":") ? item.split(":") : [item.split(/->>?/).at(-1) || item, item];
    saida[apelido] = structuredClone(caminho(linha, expressao));
  }
  return saida;
}

/**
 * Instala o `fetch` do banco de teste e devolve o registro de pedidos.
 * Cada pedido guarda os BYTES da resposta: é assim que a economia é medida.
 */
export function instalarPostgrestSimulado(banco: () => Banco): { pedidos: Pedido[]; foraDoBanco: string[] } {
  const pedidos: Pedido[] = [];
  const foraDoBanco: string[] = [];
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    if (url.hostname !== HOST_DO_BANCO) {
      foraDoBanco.push(url.href);
      throw new Error(`rede real proibida neste teste: ${url.href}`);
    }
    const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
    const metodo = String(init?.method || "GET").toUpperCase();
    if (metodo !== "GET") throw new Error(`o export não pode escrever: ${metodo} ${tabela}`);
    const linhas = (banco()[tabela] || []).filter(linha => casa(linha, url.searchParams));
    const corpo = JSON.stringify(linhas.map(linha => projeta(linha, url.searchParams.get("select"))));
    pedidos.push({ metodo, tabela, params: new URLSearchParams(url.searchParams), bytes: Buffer.byteLength(corpo) });
    return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { pedidos, foraDoBanco };
}
