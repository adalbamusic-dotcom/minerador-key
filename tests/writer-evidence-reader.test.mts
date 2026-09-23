import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

/*
 * O LEITOR DE EVIDÊNCIAS DO REDATOR CONTRA UM POSTGREST FALSO.
 *
 * SDD docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md §9
 * e adendo de decisões §5. O cliente Supabase é real; o `fetch` dele é
 * injetado e responde como o PostgREST: seletores de caminho, filtros, ordem,
 * `range`, contagem e RPC. Cada consulta fica registrada com a tabela, as
 * colunas, os filtros e o tamanho da resposta. Nada sai da máquina e o
 * `fetch` global não é tocado.
 *
 * As duas funções SQL existem em dois modos: `pendente` (PGRST202, como hoje
 * no remoto) e `aplicada` (implementação independente, escrita aqui, da
 * semântica da migration 20260923150000).
 */

const { readWriterEvidence, readWriterEvidenceManifest, readWriterFoundations, WriterEvidenceError } = await import("../lib/server/writer-evidence-reader.ts");
const { WRITER_EVIDENCE_HEAD_SELECT } = await import("../lib/server/writer-evidence-document.ts");
const { writerEvidenceJsonBytes, WRITER_EVIDENCE_LIMITS } = await import("../lib/redator/writer-evidence-catalog.ts");
const { buildKeywordSemanticQualification } = await import("../lib/minerador/keyword-semantic-qualification.ts");
const { deriveSerpSemanticEvidence } = await import("../lib/minerador/serp-semantic-evidence.ts");
const { resolveCanonicalKeywordSnapshot } = await import("../lib/minerador/canonical-keyword-snapshot.ts");
const { ArticleDNASchema, ContentDocumentV2Schema } = await import("../lib/arquiteto/contracts.ts");
const { SERP_CACHE_LENSES, serpCacheLensLabel, serpCacheSubjectId, normalizeSerpCacheKeyword } = await import("../lib/editorial/serp-cache.ts");
const { mockSerpProvider, createMockPlanAndDocument } = await import("../lib/editorial/providers.ts");
const { RADAR_WRITER_MAY_NOT } = await import("../lib/redator/writer-handoff.ts");

type Linha = Record<string, unknown>;
type Envelope = Awaited<ReturnType<typeof readWriterEvidence>>;

/* ================================ identidades ================================ */

const brandA = "aaaaaaaa-0000-4000-8000-000000000001";
const brandB = "bbbbbbbb-0000-4000-8000-000000000002";
const articleId = "artigo-leitor";
const documentId = "writer:doc-leitor";
const documentYoutube = "writer:doc-youtube";
const documentV1 = "writer:doc-v1";
const radarItemId = "11111111-1111-4111-8111-111111111111";
const analysisVersionId = "analise-v3";
const snapshotEntregue = "22222222-2222-4222-8222-222222222221";
const snapshotRecente = "22222222-2222-4222-8222-222222222222";
const kw1 = "44444444-4444-4444-8444-444444444441";
const kw2 = "44444444-4444-4444-8444-444444444442";
const articleVersion = "55555555-5555-4555-8555-555555555555";
const graphVersion = "graph:silo-1:v2";
const graphVersionNova = "graph:silo-1:v3";
const video1 = "77777777-7777-4777-8777-777777777771";
const video2 = "77777777-7777-4777-8777-777777777772";
const video3 = "77777777-7777-4777-8777-777777777773";
const skillVersion = "88888888-8888-4888-8888-888888888888";
const candidateRef = "candidate:leitor";
const territoryRef = "territory:99999999-9999-4999-8999-999999999999";
const HASH = (letra: string) => `sha256:${letra.repeat(64)}`;
const qualificationVersion = (keyword: string, versao: number) => `keyword_semantic_qualification:${brandA}:${keyword}:v${versao}`;

const atorMcp = "12345678-1234-4234-8234-123456789012";
const grantAtivo = "99999999-0000-4000-8000-000000000001";
const grantSoLeitura = "99999999-0000-4000-8000-000000000002";
const grantOutraMarca = "99999999-0000-4000-8000-000000000003";

const PESO_EXTERNO = "PESO-DE-LINK-EXTERNO-NAO-LIDO";
const PESO_DA_CORRIDA = "PESO-DA-CORRIDA-NAO-LIDO";
const OBSERVADO_EM = "2026-09-14T23:49:44.887Z";

/* ================================== fixtures ================================= */

async function qualificacao(keywordId: string, versao: number, keyword: string) {
  const base = await buildKeywordSemanticQualification({
    brandId: brandA, keywordId, createdBy: "user-1",
    evidence: deriveSerpSemanticEvidence({
      body: { tasks: [{ id: "task-1", status_code: 20000, result: [{ keyword, location_code: 2076, language_code: "pt-BR",
        items: Array.from({ length: 8 }, (_, indice) => ({ type: "organic", rank_group: indice + 1, domain: `site${indice + 1}.com.br`, title: `Guia de ${keyword} ${indice + 1}`, description: "Passo a passo." })) }] }] },
      keyword, locationCode: 2076, languageCode: "pt-BR", providerRequestId: "task-1",
      operationRequestId: "33333333-3333-4333-8333-333333333333", collectedAt: "2026-08-28T18:00:00.000Z",
    })!,
  });
  return JSON.parse(JSON.stringify({ ...base, id: qualificationVersion(keywordId, versao), lifecycle: { ...base.lifecycle, version: versao } })) as Linha;
}

const qualificacoes = {
  [kw1]: await qualificacao(kw1, 2, "rotina pele oleosa"),
  [kw2]: await qualificacao(kw2, 1, "hidratante pele oleosa"),
};

const referenciaDeKeyword = (keywordId: string, versao: number) => ({
  keywordId, keywordDnaVersionId: qualificationVersion(keywordId, versao), keywordDnaContentHash: HASH(keywordId === kw1 ? "1" : "2"),
  role: keywordId === kw1 ? "principal" as const : "secundaria" as const, strategicContribution: "Cobertura.", coveredIntentions: ["informacional"],
  requiredTopics: [], excludedTopics: [], classificationOrigin: "human" as const, confidence: 0.8, humanConfirmed: true,
});

const articleDna = ArticleDNASchema.parse({
  schemaVersion: 1, articleId, brandId: brandA, principalKeywordId: kw1, secondaryKeywordIds: [kw2], narrativeReinforcementIds: [],
  keywordReferences: [referenciaDeKeyword(kw1, 2), referenciaDeKeyword(kw2, 1)], siloId: null, territoryRef,
  hierarchy: "Suporte", suggestedSlug: "rotina-pele-oleosa", canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
  audience: "Pessoas com pele oleosa", problem: "Brilho excessivo", desiredResult: "Pele equilibrada", journeyStage: "consideração",
  brandObjective: "Autoridade", promise: "Rotina simples para pele oleosa", angle: "Passo a passo", cta: "Conheça a linha",
  coverage: ["limpeza", "hidratação"], excludedSubjects: ["acne grave"], antiCannibalizationBoundary: "Não tratar de acne",
  nearbyArticleIds: [], differentiation: ["experiência da marca"], entities: ["niacinamida"], requiredTopics: ["ordem da rotina"],
  questions: ["posso usar à noite?"], objections: [], evidenceNeeded: ["estudo sobre niacinamida"], sourcesNeeded: [], internalLinks: [],
  alerts: [], confidence: 0.7, humanPendingDecisions: [],
  serpAssessmentRef: { entityId: "assessment-1", versionId: "formation-v1", contentHash: HASH("e") },
});

function bundleGoogle() {
  const semantic = { concepts: Array.from({ length: 80 }, (_, indice) => ({ id: `c${indice}`, label: `conceito ${indice}`, apoio: "s".repeat(600) })) };
  return {
    bundleVersion: 3, bundleId: "bundle:leitor", bundleHash: "bundle-hash:leitor",
    binding: { brandId: brandA, articleId, articleDnaVersionId: articleVersion, articleDnaContentHash: HASH("a") },
    observedAt: OBSERVADO_EM, primaryResearchProfile: "GOOGLE", researchSources: ["GOOGLE_SERP"],
    research: { google: { role: "PRIMARY", frozenAt: OBSERVADO_EM, refs: [], counts: { queries: 3, items: 20 }, limitations: [] }, youtube: null, amazon: null },
    competitiveBlueprint: { profile: "GOOGLE", observed: { comparablePages: 10 }, recommended: { mustAnswer: ["Qual a ordem?"], mustCover: ["niacinamida"] }, detalhe: "b".repeat(36_000) },
    crossSerp: null,
    editorialOutputs: [{ output: "ARTICLE", objective: "Cobrir a intenção.", reason: "SERP de texto.", sourceSignals: ["10 orgânicos"] }],
    observed: {
      identity: { articleId, articleDnaVersionId: articleVersion, articleDnaContentHash: HASH("a") },
      sample: { comparablePages: 10, observedResults: 20 },
      intent: { dominant: "informacional" },
      formats: { dominant: null, distribution: [] },
      structure: { measures: Array.from({ length: 40 }, (_, indice) => ({ id: `m${indice}`, valor: "e".repeat(900) })), presences: [], patterns: [] },
      concepts: { recurrent: [{ id: "c1", canonicalLabel: "niacinamida" }], all: [] },
      questions: Array.from({ length: 14 }, (_, indice) => ({ id: `q${indice}`, canonicalQuestion: `Pergunta observada ${indice}?`, variants: [], conceptId: "c1", conceptLabel: "x", pages: 14 - indice, sampleSize: 10, queryCoverage: 1, sourceUrls: [], status: "RECURRENT", declaredByArticle: indice === 0, evidence: "ev" })),
      entities: { article: ["niacinamida"], shared: [] },
      gaps: [{ id: "g1", gap: "sem estudo citado" }],
      differentiations: [],
      conflicts: [],
      competitors: Array.from({ length: 18 }, (_, indice) => ({ referenceId: null, url: `https://concorrente.test/${indice}`, domain: `concorrente${indice}.test`, title: `Título concorrente ${indice}`, classification: "EDITORIAL", origin: "CANONICAL", queries: [], queryRecurrence: 1, ranks: [{ keyword: "rotina pele oleosa", role: "principal", rank: 18 - indice }], extractionStatus: "success", format: null, comparable: true, structure: null, conceptsCovered: [], questionsCovered: [], limitations: [] })),
      internalLinks: { graphVersionId: graphVersion, graphContentHash: HASH("g"), relatedInternalPages: [], observedCompetitorLinks: Array.from({ length: 300 }, (_, indice) => ({ url: `https://c.test/${indice}`, texto: PESO_EXTERNO })) },
      internalLinkPlan: { opportunities: [] },
      externalSources: { observedLinks: Array.from({ length: 900 }, (_, indice) => ({ url: `https://fonte.test/${indice}`, anchor: `âncora ${indice}`, trecho: `${PESO_EXTERNO} ${"z".repeat(indice % 7 === 0 ? 700 : 120)}` })) },
      authorityEvidence: { claims: [] },
      aiDiscovery: { binding: {}, requirements: [] },
      sufficiency: { level: "GOOD", reasons: [] },
      limitations: ["amostra de 10 páginas"],
      evidence: { semantic, comparison: { itens: [] }, structural: { semantic, outros: { tamanho: 3 } } },
    },
    serpStanding: { authoritative: true, current: true, sufficient: true, valid: true, reason: "SERP vigente e suficiente." },
    conflicts: [{ id: "k1", descricao: "fonte factual × recorrência de mercado" }],
    limitations: ["Nenhum vídeo foi assistido por inteiro."],
    video: {
      identity: { frozenBundleId: "bundle:leitor", frozenBundleHash: null, matchingRunId: "m1", inputFingerprint: "m4:x", matcherVersion: 1, matchedAt: OBSERVADO_EM },
      briefs: [], results: [{ videoBriefId: "vb1", topic: "Ordem da rotina", whatToLookFor: [], narrativePurpose: "x", relatedSectionId: null, relatedSectionTitle: "Passo a passo", provenance: [], state: "SUPPORTED", reason: "ok", matchedCriteria: [], missingCriteria: [], usefulSourceIds: [video1], extracts: [{ texto: "trecho" }] }],
      sources: [
        { videoSourceId: video1, displayName: "Canal dermatologia", languageCode: "pt", processingVersion: 2 },
        { videoSourceId: video2, displayName: "Vídeo removido", languageCode: "pt", processingVersion: 1 },
        { videoSourceId: video3, displayName: "Vídeo reprocessado", languageCode: "pt", processingVersion: 3 },
      ],
      summary: { briefs: 1, supported: 1, partial: 0, notFound: 0, extracts: 1, sources: 3 },
    },
    specialist: { binding: { brandId: brandA, articleId, articleDnaVersionId: articleVersion }, preparedRequirements: 2, items: [{ requirementId: "r1", originalText: "Use niacinamida à noite.", humanDecision: "ACCEPTED" }], notApproved: 0, rejected: 0 },
    keywordContext: { principal: "rotina pele oleosa", secondary: ["hidratante pele oleosa"], narrativeReinforcements: [], resolution: "resolvida" },
  };
}

const refs = {
  brandDnaRef: { entityId: `brand:${brandA}`, versionId: `legacy:brand:${brandA}:v1`, contentHash: "legacy:abc" },
  keywordDnaRefs: [
    { entityId: kw1, versionId: qualificationVersion(kw1, 2), contentHash: HASH("1") },
    { entityId: kw2, versionId: qualificationVersion(kw2, 1), contentHash: HASH("2") },
  ],
  siloDnaRef: { entityId: "silo:artigo-leitor", versionId: "legacy:silo:artigo-leitor:v1", contentHash: "legacy:def" },
  articleDnaRef: { entityId: articleId, versionId: articleVersion, contentHash: HASH("a") },
};

function documentoV2(id: string, bundle: Linha, perfil: "GOOGLE" | "YOUTUBE") {
  return ContentDocumentV2Schema.parse({
    schemaVersion: 2, id, title: "Rotina para pele oleosa", status: "escrevendo", ...refs,
    serpSnapshotRefs: [], evidenceRefs: [], sourceIds: [], linkMap: [], instructions: [],
    blocks: [{ id: "b1", type: "paragraph", text: "Primeiro, limpe a pele.", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } }],
    editorContent: null,
    metadata: { slug: "rotina-pele-oleosa", principalKeyword: "rotina pele oleosa", metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "", canonical: null, indexationStatus: "noindex", plannedImages: [] },
    radarOrigin: {
      radarItemId, articleId, analysisVersionId, analysisVersionNumber: 3, evidenceBundleHash: "bundle-hash:leitor",
      articleDnaVersionId: articleVersion, articleDnaContentHash: HASH("a"), siloDnaVersionId: null,
      importedAt: "2026-09-19T03:20:09.000Z", importedBy: "ator-1",
    },
    importedContext: {
      source: "radar", capturedAt: "2026-09-19T03:20:09.000Z",
      dossier: {
        bundleId: "bundle:leitor", bundleHash: "bundle-hash:leitor", researchProfile: perfil,
        keywordContext: { principal: "rotina pele oleosa", secondary: ["hidratante pele oleosa"], narrativeReinforcements: [], resolution: "resolvida" },
        writerMayNot: [...RADAR_WRITER_MAY_NOT], bundle,
      },
      editorialContext: [], visualGuidance: [],
      pendingDecisions: [{ id: "p1", label: "Imagem de capa", blocking: false, reason: "Sem banco de imagens." }],
    },
  });
}

/* Muitos concorrentes e perguntas: os fundamentos precisam cortar e dizer onde ler o resto. */
function bundleGrande() {
  const base = bundleGoogle();
  const competidores = Array.from({ length: 400 }, (_, indice) => ({ ...base.observed.competitors[0], url: `https://concorrente.test/grande/${indice}`, title: `Título longo de concorrente número ${indice} ${"t".repeat(140)}`, ranks: [{ keyword: "x", role: "principal", rank: indice + 1 }] }));
  const perguntas = Array.from({ length: 300 }, (_, indice) => ({ ...base.observed.questions[0], id: `qg${indice}`, canonicalQuestion: `Pergunta observada longa número ${indice} ${"p".repeat(180)}?` }));
  return { ...base, observed: { ...base.observed, competitors: competidores, questions: perguntas } };
}

/* Dossiê gravado fora do contrato: nenhuma evidência é servida sobre ele. */
function dossieCorrompido() {
  const documento = JSON.parse(JSON.stringify(documentoV2("writer:doc-corrompido", bundleGoogle(), "GOOGLE"))) as Linha;
  const dossie = (documento.importedContext as Linha).dossier as Linha;
  dossie.keywordContext = { principal: 42 };
  return documento;
}

const bundleYoutube = () => ({ ...bundleGoogle(), primaryResearchProfile: "YOUTUBE", observed: null, video: null, specialist: null });
const { document: documentoPlanejador } = await createMockPlanAndDocument(brandA);

const corpoCanonico = {
  status_code: 20000,
  tasks: [{ id: "t", status_code: 20000, result: [{ keyword: "rotina pele oleosa", items: [
    ...Array.from({ length: 12 }, (_, indice) => ({ type: "organic", rank_group: indice + 1, domain: `d${indice}.test`, url: `https://d${indice}.test/`, title: `Orgânico ${indice}`, description: "d".repeat(indice === 0 ? 500 : 80) })),
    { type: "people_also_ask", items: [{ title: "Posso usar à noite?" }] },
    { type: "ai_overview", references: [{ domain: "citado.test" }] },
  ] }] }],
};

function entradaDeCache(keywordId: string, keyword: string, lente: (typeof SERP_CACHE_LENSES)[number], coletaEm: string) {
  const canonica = serpCacheLensLabel(lente) === "desktop-windows";
  const query = { keyword, locationCode: 2076, languageCode: "pt-BR", lens: lente, endpoint: "advanced" as const };
  return {
    id: `cache-${keywordId}-${serpCacheLensLabel(lente)}`, marca_id: brandA, subject_type: "serp_cache_entry", subject_id: serpCacheSubjectId(query),
    stage: "minerador", article_id: null, state: "collected", updated_at: coletaEm,
    payload: {
      contractVersion: "serp-cache-v1",
      meta: { keyword, normalizedKeyword: normalizeSerpCacheKeyword(keyword), locationCode: 2076, languageCode: "pt-BR", lens: lente, endpoint: "advanced", depth: canonica ? 20 : 10, collectedAt: coletaEm, providerRequestId: `prov-${serpCacheLensLabel(lente)}`, keywordId, collectedBy: "minerador" },
      observation: { lens: serpCacheLensLabel(lente), depth: 10, competitorDomains: ["d0.test", "citado.test"], organicCount: 10, itemTypes: ["organic", "people_also_ask", "ai_overview"], questions: ["Posso usar à noite?"], relatedSearches: ["rotina noturna"], aiOverviewDomains: ["citado.test"], commercialSignals: false },
      ...(canonica ? { body: corpoCanonico } : { digest: { version: "organic-digest-v1", keyword, depth: 10, organic: [{ rank_group: 1, domain: "d0.test", title: "Orgânico 0" }], blocks: [{ type: "people_also_ask", count: 1 }], sellers: [] } }),
    },
  };
}

/* O id do registro no payload NÃO é o uuid da linha — como no remoto (medido em 2026-09-23). */
const registroDeSnapshot = async (id: string) => ({ ...(await mockSerpProvider.collectSnapshot({ keyword: "rotina pele oleosa", articleId, location: "Brasil", language: "pt", device: "desktop" })), id });
const ID_DO_REGISTRO: Record<string, string> = { [snapshotEntregue]: "registro-entregue", [snapshotRecente]: "registro-recente" };

const skillPayload = {
  schemaVersion: 1, brandId: brandA, definitionKey: "voz", name: "Voz da marca", originalMarkdown: "# Voz\n\nTexto original longo.",
  normalizedContent: { definitionKey: "voz", title: "Voz", sections: Array.from({ length: 12 }, (_, indice) => ({ heading: `Seção ${indice}`, key: `s${indice}`, body: "Regra de voz. ".repeat(160) })), sectionDiagnostics: [], extraSections: [] },
  structureDiagnostics: [], sourceFilename: "voz.md", contentHash: HASH("s"), version: 1, status: "active",
  provenance: { importedBy: "user-1", importedAt: "2026-09-10T10:00:00.000Z", sourceByteSize: 100, previousContentHash: null, previousVersion: null },
};

function formacaoPayload() {
  return {
    contractVersion: "article-formation-serp-record-v1", candidateRef, territoryRef, formationBaseHash: "base:1", verdict: "COMPATIBLE",
    assessment: { id: "assessment-1", contentHash: HASH("e"), createdAt: "2026-09-10T10:00:00.000Z", snapshots: [{ id: "snap-1", corpo: "p".repeat(20_000) }] },
    snapshotIds: ["snap-1"], interpretation: null, humanResolution: null,
    provenance: { operationRequestId: "op-1", collectedAt: "2026-09-10T10:00:00.000Z" },
  };
}

const TRANSCRICAO = "Na rotina da noite, a niacinamida entra depois da limpeza — é o que eu recomendo. ".repeat(500);

function tabelas(): Record<string, Linha[]> {
  return {
    content_documents: [
      { id: documentId, marca_id: brandA, article_id: articleId, content_hash: "hash-doc", status: "escrevendo", updated_at: "2026-09-19T03:20:09+00:00", article_dna_version_id: articleVersion, lock_version: 3, payload: documentoV2(documentId, bundleGoogle(), "GOOGLE") },
      { id: documentYoutube, marca_id: brandA, article_id: "artigo-youtube", content_hash: "hash-yt", status: "escrevendo", updated_at: "2026-09-19T03:20:09+00:00", article_dna_version_id: articleVersion, lock_version: 1, payload: documentoV2(documentYoutube, bundleYoutube(), "YOUTUBE") },
      { id: documentV1, marca_id: brandA, article_id: "artigo-v1", content_hash: "hash-v1", status: "planejado", updated_at: "2026-09-19T03:20:09+00:00", article_dna_version_id: null, lock_version: 1, payload: { ...documentoPlanejador, id: documentV1 } },
      { id: "writer:doc-grande", marca_id: brandA, article_id: articleId, content_hash: "hash-grande", status: "escrevendo", updated_at: "2026-09-19T03:20:09+00:00", article_dna_version_id: articleVersion, lock_version: 1, payload: documentoV2("writer:doc-grande", bundleGrande(), "GOOGLE") },
      { id: "writer:doc-corrompido", marca_id: brandA, article_id: articleId, content_hash: "hash-corrompido", status: "escrevendo", updated_at: "2026-09-19T03:20:09+00:00", article_dna_version_id: articleVersion, lock_version: 1, payload: dossieCorrompido() },
      { id: "writer:doc-marca-b", marca_id: brandB, article_id: articleId, content_hash: "hash-b", status: "escrevendo", updated_at: "2026-09-19T03:20:09+00:00", article_dna_version_id: articleVersion, lock_version: 1, payload: documentoV2("writer:doc-marca-b", bundleGoogle(), "GOOGLE") },
    ],
    editorial_workflow_items: [
      { id: radarItemId, marca_id: brandA, subject_type: "article", subject_id: articleId, article_id: articleId, stage: "radar", state: "sent_writer", updated_at: "2026-09-19T03:20:09+00:00",
        payload: { analysisVersions: [
          { versionId: "analise-v1", versionNumber: 1, payload: { status: "draft", serpSnapshotId: "registro-recente" } },
          { versionId: analysisVersionId, versionNumber: 3, payload: { status: "approved", serpSnapshotId: "registro-entregue" } },
        ] } },
      { id: "f0000000-0000-4000-8000-000000000001", marca_id: brandA, subject_type: "article_formation_serp_assessment", subject_id: candidateRef, article_id: null, stage: "architect", state: "supported", updated_at: "2026-09-10T10:00:00+00:00", payload: formacaoPayload() },
      { id: "f0000000-0000-4000-8000-000000000002", marca_id: brandB, subject_type: "article_formation_serp_assessment", subject_id: candidateRef, article_id: null, stage: "architect", state: "supported", updated_at: "2026-09-10T10:00:00+00:00", payload: { ...formacaoPayload(), verdict: "DIVERGENCE" } },
      ...SERP_CACHE_LENSES.map(lente => entradaDeCache(kw1, "rotina pele oleosa", lente, "2026-09-20T10:00:00+00:00")),
      { ...entradaDeCache(kw1, "rotina pele oleosa", SERP_CACHE_LENSES[1], "2026-09-20T10:00:00+00:00"), id: "cache-outra-marca", marca_id: brandB },
    ],
    radar_analysis_runs: [
      { workflow_item_id: radarItemId, version_id: analysisVersionId, marca_id: brandA, article_id: articleId, updated_at: "2026-09-18T10:00:00+00:00",
        payload: {
          extractions: Array.from({ length: 12 }, (_, indice) => ({ id: `e${indice}`, url: `https://concorrente.test/${indice}`, status: "success", title: `Página ${indice}`, metaDescription: "m".repeat(400), wordCount: 1500, text: PESO_DA_CORRIDA.repeat(200), observedLinks: Array.from({ length: 50 }, () => ({ url: "https://x.test", texto: PESO_DA_CORRIDA })) })),
          competitiveReport: { resumo: "Relatório.", observedCompetitiveModel: { peso: PESO_DA_CORRIDA.repeat(500) } },
          youtubeSearch: { universe: Array.from({ length: 30 }, (_, indice) => ({ videoId: `v${indice}`, url: `https://youtube.test/${indice}`, title: `Vídeo ${indice}`, channelName: "Canal", views: 1000 + indice, description: "d".repeat(900), thumbnailUrl: "https://img.test/x.jpg", bestRank: indice + 1, queriesFoundIn: ["q1"] })), results: [] },
          amazonSearch: null,
        } },
    ],
    editorial_serp_snapshots: [
      { id: snapshotEntregue, marca_id: brandA, article_id: articleId, source_version_id: null, snapshot_version: 1, content_hash: "snap-hash-1", status: "needs_review", created_at: "2026-09-12T10:00:00+00:00", payload: null },
      { id: snapshotRecente, marca_id: brandA, article_id: articleId, source_version_id: null, snapshot_version: 2, content_hash: "snap-hash-2", status: "needs_review", created_at: "2026-09-21T10:00:00+00:00", payload: null },
      { id: "22222222-2222-4222-8222-222222222229", marca_id: brandB, article_id: articleId, source_version_id: null, snapshot_version: 9, content_hash: "snap-b", status: "approved", created_at: "2026-09-22T10:00:00+00:00", payload: null },
    ],
    editorial_serp_reviews: [
      { id: "r1", marca_id: brandA, article_id: articleId, snapshot_id: snapshotEntregue, status: "approved", created_at: "2026-09-13T10:00:00+00:00" },
    ],
    editorial_artifact_versions: [
      { version_id: articleVersion, entity_id: articleId, marca_id: brandA, artifact_type: "article_dna", version_number: 2, status: "approved", content_hash: HASH("a"), created_at: "2026-09-01T10:00:00+00:00", payload: articleDna },
      { version_id: "article-v3-mais-nova", entity_id: articleId, marca_id: brandA, artifact_type: "article_dna", version_number: 3, status: "approved", content_hash: HASH("b"), created_at: "2026-09-21T10:00:00+00:00", payload: articleDna },
      { version_id: qualificationVersion(kw1, 2), entity_id: kw1, marca_id: brandA, artifact_type: "keyword_semantic_qualification", version_number: 2, status: "collected", content_hash: HASH("1"), created_at: "2026-08-28T18:00:00+00:00", payload: qualificacoes[kw1] },
      { version_id: qualificationVersion(kw1, 3), entity_id: kw1, marca_id: brandA, artifact_type: "keyword_semantic_qualification", version_number: 3, status: "collected", content_hash: HASH("3"), created_at: "2026-09-22T18:00:00+00:00", payload: qualificacoes[kw1] },
      { version_id: qualificationVersion(kw2, 1), entity_id: kw2, marca_id: brandA, artifact_type: "keyword_semantic_qualification", version_number: 1, status: "collected", content_hash: HASH("2"), created_at: "2026-08-28T18:00:00+00:00", payload: qualificacoes[kw2] },
      { version_id: skillVersion, entity_id: "skill:voz", marca_id: brandA, artifact_type: "brand_skill", version_number: 1, status: "draft", content_hash: HASH("s"), created_at: "2026-09-10T10:00:00+00:00", payload: skillPayload },
      { version_id: "skill-outra-marca", entity_id: "skill:voz", marca_id: brandB, artifact_type: "brand_skill", version_number: 5, status: "approved", content_hash: HASH("t"), created_at: "2026-09-10T10:00:00+00:00", payload: { ...skillPayload, brandId: brandB } },
    ],
    editorial_version_status_events: [
      { id: "ev1", version_id: skillVersion, status: "approved", occurred_at: "2026-09-10T11:00:00+00:00" },
    ],
    minerador_keywords: [
      { id: kw1, brand_id: brandA, keyword: "rotina pele oleosa", status: "aprovado", intent: "informacional", results_allintitle: 30, volume_search: 1200, kgr_score: 0.025, volume_source: "google_ads", analise_semantica: {}, deleted_at: null },
      { id: kw2, brand_id: brandA, keyword: "hidratante pele oleosa", status: "aprovado", intent: "comercial", results_allintitle: 80, volume_search: 900, kgr_score: 0.09, volume_source: "google_ads", analise_semantica: {}, deleted_at: null },
      { id: kw1, brand_id: brandB, keyword: "outra marca", status: "aprovado", intent: null, results_allintitle: 1, volume_search: 1, kgr_score: 1, volume_source: null, analise_semantica: {}, deleted_at: null },
    ],
    internal_link_graphs: [
      { graph_version_id: graphVersion, graph_id: "graph:silo-1", marca_id: brandA, version_number: 2, workflow_status: "approved", content_hash: HASH("g"), created_at: "2026-09-05T10:00:00+00:00" },
      { graph_version_id: graphVersionNova, graph_id: "graph:silo-1", marca_id: brandA, version_number: 3, workflow_status: "proposed", content_hash: HASH("h"), created_at: "2026-09-21T10:00:00+00:00" },
    ],
    internal_link_graph_nodes: [
      { graph_version_id: graphVersion, node_id: "n-artigo", marca_id: brandA, node_type: "ARTICLE_DNA", article_dna_version_id: articleVersion, silo_page_version_id: null, architectural_role: "SUPORTE", snapshot: { label: "Rotina", siloId: "silo-1" } },
      { graph_version_id: graphVersion, node_id: "n-pilar", marca_id: brandA, node_type: "ARTICLE_DNA", article_dna_version_id: "pilar-v1", silo_page_version_id: null, architectural_role: "PILAR", snapshot: { label: "Pele oleosa", siloId: "silo-1" } },
    ],
    internal_link_graph_edges: [
      { graph_version_id: graphVersion, edge_id: "e1", marca_id: brandA, source_node_id: "n-artigo", target_node_id: "n-pilar", relation_type: "SUPPORT_TO_PILLAR", reason: "suporte aponta ao pilar", priority: "HIGH", anchor_concepts: ["pele oleosa"] },
      { graph_version_id: graphVersion, edge_id: "e2", marca_id: brandA, source_node_id: "n-pilar", target_node_id: "n-artigo", relation_type: "PILLAR_TO_SUPPORT", reason: "pilar distribui", priority: "MEDIUM", anchor_concepts: ["rotina"] },
    ],
    brand_site_catalog_entries: [
      ...Array.from({ length: 45 }, (_, indice) => ({ id: `site-${indice}`, marca_id: brandA, normalized_url: `https://marca.test/p/${String(indice).padStart(3, "0")}`, normalized_canonical_url: null, title: `Página ${indice}`, h1: `H1 ${indice}`, page_type: "article", indexability: "indexable", verification_status: "accessible", presence_state: "present", last_seen_at: "2026-09-20T10:00:00+00:00", meta_description: "não pedida" })),
      { id: "site-b", marca_id: brandB, normalized_url: "https://outra.test/", title: "Outra marca", h1: null, page_type: "page", indexability: "indexable", verification_status: "accessible", presence_state: "present", last_seen_at: null },
    ],
    publication_records: [
      { id: "pub-1", marca_id: brandA, article_id: articleId, document_id: documentId, status: "published_locked", slug: "rotina-pele-oleosa", canonical: "https://marca.test/rotina", published_url: "https://marca.test/rotina", content_hash: "pub-hash", updated_at: "2026-09-21T10:00:00+00:00", payload: { pesado: "não pedido" } },
      { id: "pub-2", marca_id: brandA, article_id: "outro", document_id: null, status: "published", slug: "outro", canonical: null, published_url: "https://marca.test/outro", content_hash: "h2", updated_at: "2026-09-01T10:00:00+00:00", payload: {} },
      { id: "pub-b", marca_id: brandB, article_id: articleId, document_id: null, status: "published", slug: "b", canonical: null, published_url: null, content_hash: "hb", updated_at: "2026-09-01T10:00:00+00:00", payload: {} },
    ],
    radar_article_video_sources: [
      { brand_id: brandA, article_id: articleId, video_source_id: video1, status: "ACTIVE" },
      { brand_id: brandA, article_id: articleId, video_source_id: video2, status: "REMOVED" },
      { brand_id: brandA, article_id: articleId, video_source_id: video3, status: "ACTIVE" },
    ],
    radar_video_source_texts: [
      { brand_id: brandA, video_source_id: video1, content_kind: "ORIGINAL_TRANSCRIPT", processing_version: 2, content_hash: "texto-hash-1", language_code: "pt", created_at: "2026-09-10T10:00:00+00:00", transcript_text: TRANSCRICAO, segments: [] },
      { brand_id: brandA, video_source_id: video3, content_kind: "ORIGINAL_TRANSCRIPT", processing_version: 4, content_hash: "texto-hash-3", language_code: "pt", created_at: "2026-09-20T10:00:00+00:00", transcript_text: "reprocessado", segments: [] },
    ],
    expert_briefs: [{ id: "cccccccc-0000-4000-8000-000000000001", brand_id: brandA, article_id: articleId }],
    expert_contributions: [
      { id: "c1", brand_id: brandA, brief_id: "cccccccc-0000-4000-8000-000000000001", received_at: "2026-09-10T10:00:00+00:00" },
      { id: "c2", brand_id: brandA, brief_id: "cccccccc-0000-4000-8000-000000000001", received_at: "2026-09-20T10:00:00+00:00" },
      { id: "c3", brand_id: brandA, brief_id: "cccccccc-0000-4000-8000-000000000001", received_at: "2026-09-21T10:00:00+00:00" },
    ],
    writer_mcp_grants: [
      { id: grantAtivo, marca_id: brandA, actor_user_id: atorMcp, status: "active", scopes: ["writer.read", "writer.draft.write"] },
      { id: grantSoLeitura, marca_id: brandA, actor_user_id: atorMcp, status: "active", scopes: ["writer.read"] },
      { id: grantOutraMarca, marca_id: brandB, actor_user_id: atorMcp, status: "active", scopes: ["writer.read", "writer.draft.write"] },
    ],
    writer_evidence_divergences: [],
  };
}

let banco = tabelas();
for (const snapshot of banco.editorial_serp_snapshots) snapshot.payload = await registroDeSnapshot(ID_DO_REGISTRO[String(snapshot.id)] ?? "registro-outra-marca");

/* =============================== PostgREST falso ============================== */

type Registro = { table: string; method: string; select: string | null; params: URLSearchParams; body: Linha | null; responseBytes: number };
const registros: Registro[] = [];
let modoDasFuncoes: "pendente" | "aplicada" = "pendente";
/* Um passo entre consultas, para simular o Radar trocando o pacote no meio da leitura. */
let depoisDaConsulta: ((tabela: string, select: string | null) => void) | null = null;

function extrair(linha: Linha, expressao: string): unknown {
  const partes = expressao.split(/(->>|->)/);
  let valor: unknown = linha[partes[0]];
  let comoTexto = false;
  for (let indice = 1; indice < partes.length; indice += 2) {
    const chave = partes[indice + 1];
    if (valor && typeof valor === "object") valor = Array.isArray(valor) ? (/^\d+$/.test(chave) ? valor[Number(chave)] : undefined) : (valor as Linha)[chave];
    else valor = undefined;
    comoTexto = partes[indice] === "->>";
  }
  if (valor === undefined) return null;
  if (comoTexto && valor !== null) return typeof valor === "object" ? JSON.stringify(valor) : String(valor);
  return valor;
}

function projetar(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return linha;
  return Object.fromEntries(select.split(",").map(coluna => {
    const [apelido, expressao] = coluna.includes(":") ? [coluna.slice(0, coluna.indexOf(":")), coluna.slice(coluna.indexOf(":") + 1)] : [coluna, coluna];
    return [apelido, extrair(linha, expressao)];
  }));
}

const listaDoIn = (valor: string) => {
  const dentro = valor.slice(1, -1);
  const saida: string[] = [];
  let atual = "";
  let aspas = false;
  for (const caractere of dentro) {
    if (caractere === "\"") { aspas = !aspas; continue; }
    if (caractere === "," && !aspas) { saida.push(atual); atual = ""; continue; }
    atual += caractere;
  }
  saida.push(atual);
  return saida;
};

function filtrar(linhas: Linha[], params: URLSearchParams): Linha[] {
  let saida = linhas;
  for (const [chave, valor] of params.entries()) {
    if (["select", "order", "limit", "offset"].includes(chave)) continue;
    const ponto = valor.indexOf(".");
    const operador = valor.slice(0, ponto);
    const alvo = valor.slice(ponto + 1);
    saida = saida.filter(linha => {
      const atual = extrair(linha, chave);
      if (operador === "eq") return atual !== null && String(atual) === alvo;
      if (operador === "in") return atual !== null && listaDoIn(alvo).includes(String(atual));
      if (operador === "is") return alvo === "null" ? atual === null : false;
      if (operador === "gt") return atual !== null && Date.parse(String(atual)) > Date.parse(alvo);
      throw new Error(`operador não suportado no falso: ${operador}`);
    });
  }
  const ordem = params.get("order");
  if (ordem) {
    const chaves = ordem.split(",").map(parte => { const [coluna, direcao] = parte.split("."); return { coluna, desc: direcao === "desc" }; });
    saida = [...saida].sort((a, b) => {
      for (const { coluna, desc } of chaves) {
        const [x, y] = [a[coluna] as string | number, b[coluna] as string | number];
        if (x === y) continue;
        return (x < y ? -1 : 1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }
  return saida;
}

const resposta = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...cabecalhos } });

const bytes = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor ?? null));

/* ---- a migration, reimplementada aqui de forma independente ---- */

function documentoDaMarca(marca: unknown, documento: unknown) {
  return banco.content_documents.find(linha => linha.marca_id === marca && linha.id === documento) ?? null;
}

const tipo = (valor: unknown) => (valor === undefined ? "absent" : valor === null ? "null" : Array.isArray(valor) ? "array" : typeof valor === "object" ? "object" : typeof valor);

function manifestoSql(corpo: Linha): Linha[] {
  const doc = documentoDaMarca(corpo.p_brand_id, corpo.p_document_id);
  if (!doc) return [];
  const payload = doc.payload as Linha;
  const linhas: Linha[] = [];
  const linha = (source: string, ref_id: unknown, kind: string, json_path: string[], valor: unknown, extra: Linha = {}) => linhas.push({
    source, ref_id, kind, json_path, value_type: tipo(valor), bytes: bytes(valor),
    items: Array.isArray(valor) ? valor.length : valor && typeof valor === "object" ? Object.keys(valor).length : null,
    content_hash: null, version_number: null, observed_at: null, status: null, note: null, ...extra,
  });
  const bundle = (payload.importedContext as Linha | undefined)?.dossier ? ((payload.importedContext as Linha).dossier as Linha).bundle as Linha : null;
  if (bundle) {
    const raiz = ["importedContext", "dossier", "bundle"];
    linha("document", doc.id, "bundle", raiz, bundle, { status: "frozen" });
    for (const [k1, v1] of Object.entries(bundle)) {
      linha("document", doc.id, "bundle", [...raiz, k1], v1);
      if (v1 && typeof v1 === "object" && !Array.isArray(v1)) for (const [k2, v2] of Object.entries(v1)) linha("document", doc.id, "bundle", [...raiz, k1, k2], v2);
    }
    const observado = bundle.observed as Linha | null;
    if (observado) for (const [k2, v2] of Object.entries(observado)) {
      if (v2 && typeof v2 === "object" && !Array.isArray(v2)) for (const [k3, v3] of Object.entries(v2)) linha("document", doc.id, "bundle", [...raiz, "observed", k2, k3], v3);
    }
  }
  const origem = payload.radarOrigin as Linha | undefined;
  const item = origem ? banco.editorial_workflow_items.find(linhaItem => linhaItem.marca_id === corpo.p_brand_id && linhaItem.stage === "radar" && linhaItem.id === origem.radarItemId && linhaItem.article_id === doc.article_id) : null;
  const versao = item ? ((item.payload as Linha).analysisVersions as Linha[]).filter(elemento => elemento.versionId === origem!.analysisVersionId).pop() : null;
  if (versao) linha("analysis_version", versao.versionId, "version", [], versao, { note: (versao.payload as Linha).serpSnapshotId });
  const corrida = item ? banco.radar_analysis_runs.find(linhaCorrida => linhaCorrida.marca_id === corpo.p_brand_id && linhaCorrida.workflow_item_id === item.id && linhaCorrida.version_id === origem!.analysisVersionId && linhaCorrida.article_id === doc.article_id) : null;
  if (corrida) {
    linha("radar_run", corrida.version_id, "run", [], corrida.payload, { observed_at: corrida.updated_at });
    for (const [k1, v1] of Object.entries(corrida.payload as Linha)) {
      linha("radar_run", corrida.version_id, "run", [k1], v1, { observed_at: corrida.updated_at });
      if (v1 && typeof v1 === "object" && !Array.isArray(v1)) for (const [k2, v2] of Object.entries(v1)) linha("radar_run", corrida.version_id, "run", [k1, k2], v2, { observed_at: corrida.updated_at });
    }
  }
  const referenciaEntregue = (versao?.payload as Linha | undefined)?.serpSnapshotId;
  const casaComEntregue = (snapshot: Linha) => snapshot.id === referenciaEntregue || (snapshot.payload as Linha).id === referenciaEntregue || ((snapshot.payload as Linha).research as Linha | null)?.id === referenciaEntregue;
  for (const snapshot of banco.editorial_serp_snapshots.filter(linhaSnap => linhaSnap.marca_id === corpo.p_brand_id && linhaSnap.article_id === doc.article_id)) {
    linha("serp_snapshot", snapshot.id, casaComEntregue(snapshot) ? "delivered" : "latest", [], snapshot.payload, { content_hash: snapshot.content_hash });
  }
  const referencias = [payload.articleDnaRef, ...(payload.keywordDnaRefs as Linha[])].map(referencia => (referencia as Linha).versionId);
  for (const versaoDna of banco.editorial_artifact_versions.filter(linhaDna => linhaDna.marca_id === corpo.p_brand_id && referencias.includes(linhaDna.version_id))) {
    linha("artifact_version", versaoDna.version_id, String(versaoDna.artifact_type), [], versaoDna.payload, { content_hash: versaoDna.content_hash });
  }
  const formacao = banco.editorial_workflow_items.find(linhaF => linhaF.marca_id === corpo.p_brand_id && linhaF.subject_type === "article_formation_serp_assessment"
    && ((linhaF.payload as Linha).assessment as Linha).id === ((banco.editorial_artifact_versions.find(dna => dna.marca_id === corpo.p_brand_id && dna.version_id === (payload.articleDnaRef as Linha).versionId)?.payload as Linha | undefined)?.serpAssessmentRef as Linha | undefined)?.entityId);
  if (formacao) {
    linha("architect_formation", formacao.id, "formation", [], formacao.payload);
    for (const [k1, v1] of Object.entries(formacao.payload as Linha)) linha("architect_formation", formacao.id, "formation", [k1], v1);
  }
  for (const fonte of (bundle?.video as Linha | null)?.sources as Linha[] ?? []) {
    const texto = banco.radar_video_source_texts.find(linhaT => linhaT.brand_id === corpo.p_brand_id && linhaT.video_source_id === fonte.videoSourceId && linhaT.processing_version === fonte.processingVersion);
    const vinculo = banco.radar_article_video_sources.find(linhaV => linhaV.brand_id === corpo.p_brand_id && linhaV.video_source_id === fonte.videoSourceId && linhaV.article_id === doc.article_id);
    if (texto && vinculo?.status === "ACTIVE") linha("video_text", fonte.videoSourceId, "transcript_text", ["transcript_text"], texto.transcript_text, { status: "available", value_type: "text", bytes: Buffer.byteLength(String(texto.transcript_text)) });
  }
  return linhas;
}

function paginaSql(base: unknown, corpo: Linha, ref: string): Linha[] {
  const offset = Math.max(Number(corpo.p_offset ?? 0), 0);
  const limite = Math.min(Math.max(Number(corpo.p_limit ?? 20), 1), 200);
  const teto = Math.min(Math.max(Number(corpo.p_max_bytes ?? 16_384), 1_024), 32_768);
  const campos = corpo.p_fields as string[] | null;
  const excluidas = (corpo.p_exclude_keys as string[] | null) ?? [];
  const comum = { source: corpo.p_source, ref_id: ref, json_path: corpo.p_path };
  const t = tipo(base);
  if (t === "absent") return [{ ...comum, container_type: "absent", total: 0, ordinal: offset, span: 0, item_key: null, value_type: null, bytes: 0, omitted: false, value: null }];
  if (t === "array") {
    let acumulado = 0;
    return (base as unknown[]).slice(offset, offset + limite).map((item, indice) => {
      let valor = item;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        valor = Object.fromEntries(Object.entries(item).filter(([chave]) => (!campos || campos.includes(chave)) && !excluidas.includes(chave)));
      }
      acumulado += bytes(valor);
      return { ...comum, container_type: "array", total: (base as unknown[]).length, ordinal: offset + indice, span: 1, item_key: null, value_type: tipo(valor), bytes: bytes(valor), omitted: acumulado > teto, value: acumulado > teto ? null : valor };
    });
  }
  if (t === "object") {
    const chaves = Object.keys(base as Linha).filter(chave => (!campos || campos.includes(chave)) && !excluidas.includes(chave)).sort();
    let acumulado = 0;
    return chaves.slice(offset, offset + limite).map((chave, indice) => {
      const valor = (base as Linha)[chave];
      acumulado += bytes(valor);
      return { ...comum, container_type: "object", total: chaves.length, ordinal: offset + indice, span: 1, item_key: chave, value_type: tipo(valor), bytes: bytes(valor), omitted: acumulado > teto, value: acumulado > teto ? null : valor };
    });
  }
  if (t === "string") {
    const texto = [...(base as string)];
    let tamanho = Math.min(teto, Math.max(texto.length - offset, 0));
    while (tamanho > 1 && bytes(texto.slice(offset, offset + tamanho).join("")) > teto) tamanho -= Math.ceil(tamanho / 10);
    const pedaco = texto.slice(offset, offset + tamanho).join("");
    return [{ ...comum, container_type: "string", total: texto.length, ordinal: offset, span: tamanho, item_key: null, value_type: "string", bytes: bytes(pedaco), omitted: false, value: pedaco }];
  }
  return [{ ...comum, container_type: t, total: 1, ordinal: 0, span: 1, item_key: null, value_type: t, bytes: bytes(base), omitted: bytes(base) > teto, value: bytes(base) > teto ? null : base }];
}

function navegarSql(valor: unknown, caminho: string[]): unknown {
  let atual = valor;
  for (const parte of caminho) {
    if (atual === null || typeof atual !== "object") return undefined;
    atual = Array.isArray(atual) ? atual[Number(parte)] : (atual as Linha)[parte];
    if (atual === undefined) return undefined;
  }
  return atual;
}

function fatiaSql(corpo: Linha): Linha[] {
  const doc = documentoDaMarca(corpo.p_brand_id, corpo.p_document_id);
  if (!doc) return [];
  const payload = doc.payload as Linha;
  const caminho = corpo.p_path as string[];
  const origem = payload.radarOrigin as Linha | undefined;
  if (corpo.p_source === "document") return paginaSql(navegarSql(payload, caminho), corpo, String(doc.id));
  if (corpo.p_source === "analysis_version" || corpo.p_source === "radar_run") {
    if (!origem) return [];
    const item = banco.editorial_workflow_items.find(linha => linha.marca_id === corpo.p_brand_id && linha.id === origem.radarItemId && linha.stage === "radar" && linha.article_id === doc.article_id);
    if (!item) return [];
    if (corpo.p_source === "analysis_version") {
      const versao = ((item.payload as Linha).analysisVersions as Linha[]).filter(elemento => elemento.versionId === origem.analysisVersionId).pop();
      return versao ? paginaSql(navegarSql(versao, caminho), corpo, String(origem.analysisVersionId)) : [];
    }
    const corrida = banco.radar_analysis_runs.find(linha => linha.marca_id === corpo.p_brand_id && linha.workflow_item_id === item.id && linha.version_id === origem.analysisVersionId && linha.article_id === doc.article_id);
    return corrida ? paginaSql(navegarSql(corrida.payload, caminho), corpo, String(origem.analysisVersionId)) : [];
  }
  if (corpo.p_source === "video_text") {
    const fontes = ((((payload.importedContext as Linha).dossier as Linha).bundle as Linha).video as Linha | null)?.sources as Linha[] ?? [];
    const fonte = fontes.find(item => String(item.videoSourceId).toLowerCase() === String(corpo.p_ref).toLowerCase());
    const vinculo = banco.radar_article_video_sources.find(linha => linha.brand_id === corpo.p_brand_id && linha.article_id === doc.article_id && linha.video_source_id === corpo.p_ref && linha.status === "ACTIVE");
    const texto = fonte ? banco.radar_video_source_texts.find(linha => linha.brand_id === corpo.p_brand_id && linha.video_source_id === corpo.p_ref && linha.processing_version === fonte.processingVersion) : null;
    if (!fonte || !vinculo || !texto) return [];
    return paginaSql(caminho[0] === "transcript_text" ? texto.transcript_text : navegarSql(texto.segments, caminho.slice(1)), corpo, String(corpo.p_ref));
  }
  return [];
}

/*
 * ---- a tabela de divergências (etapa B2), reimplementada aqui de forma
 * independente dos gatilhos e CHECKs da migration: nasce aberta, sem decisão;
 * grant só com ia_mcp, da mesma Marca, ativo, do mesmo ator e com escopo de
 * escrita; o documento é da Marca e do artigo; o alvo é referência do
 * documento; fora do dossiê nunca SERP vigente; dedupe único. ----
 */
let divergenciasAplicadas = false;
const NIVEIS_FORA_DO_PACOTE = new Set(["OTHER_RADAR_EVIDENCE", "ARTICLE_DNA_HYPOTHESIS", "AI_INTERPRETATION", "DETERMINISTIC_HEURISTIC", "GENERIC_EDITORIAL_SUGGESTION"]);

function recusaDoBanco(code: string, message: string) {
  return resposta({ code, message: `writer_evidence_divergences: ${message}`, details: null, hint: null }, code === "23505" ? 409 : 400);
}

function inserirDivergencia(corpo: Linha, select: string | null, objeto: boolean): Response {
  if (corpo.status !== "aberta" || corpo.severity === "bloqueante" || corpo.blocking_marked_by || corpo.status_changed_by) return recusaDoBanco("23514", "registro nasce aberto, sem decisao");
  if ((corpo.origin === "ia_mcp") !== Boolean(corpo.mcp_grant_id)) return recusaDoBanco("23514", "grant MCP so com origem ia_mcp");
  if (corpo.mcp_grant_id) {
    const grant = banco.writer_mcp_grants.find(linha => linha.id === corpo.mcp_grant_id);
    const valido = grant && grant.marca_id === corpo.marca_id && grant.status === "active" && (grant.scopes as string[]).includes("writer.draft.write") && grant.actor_user_id === corpo.created_by;
    if (!valido) return recusaDoBanco("42501", "grant MCP invalido para esta marca, ator ou escopo");
  }
  if (!corpo.evidence_frozen && !NIVEIS_FORA_DO_PACOTE.has(String(corpo.evidence_hierarchy_level))) return recusaDoBanco("23514", "hierarquia fora do pacote");
  if (corpo.evidence_frozen && (!String(corpo.evidence_source_key).startsWith("radar.bundle.") || corpo.evidence_posterior_ao_pacote)) return recusaDoBanco("23514", "congelado so no dossie");
  const doc = documentoDaMarca(corpo.marca_id, corpo.document_id);
  if (!doc) return recusaDoBanco("23503", "documento nao pertence a marca");
  if (doc.article_id !== corpo.article_id) return recusaDoBanco("23514", "artigo diferente do documento");
  const payload = doc.payload as Linha;
  const casa = (referencia: unknown) => {
    const ref = referencia as Linha | undefined;
    return Boolean(ref) && ref!.versionId === corpo.target_version_id && ref!.entityId === corpo.target_entity_id && (corpo.target_content_hash === null || corpo.target_content_hash === ref!.contentHash);
  };
  const dossie = ((payload.importedContext as Linha | undefined)?.dossier ?? null) as Linha | null;
  const alvoValido = corpo.target_kind === "article_dna" ? casa(payload.articleDnaRef)
    : corpo.target_kind === "silo_dna" ? casa(payload.siloDnaRef)
    : corpo.target_kind === "keyword_dna" ? (payload.keywordDnaRefs as Linha[]).some(casa)
    : corpo.target_kind === "radar_bundle" ? Boolean(dossie) && corpo.target_version_id === dossie!.bundleId && corpo.target_content_hash === dossie!.bundleHash
    : corpo.target_kind === "brand_dna" ? banco.editorial_artifact_versions.some(linha => linha.marca_id === corpo.marca_id && ["brand_dna", "brand_skill"].includes(String(linha.artifact_type)) && linha.version_id === corpo.target_version_id)
    : false;
  if (!alvoValido) return recusaDoBanco("23514", "o alvo nao e referencia do documento");
  if (banco.writer_evidence_divergences.some(linha => linha.marca_id === corpo.marca_id && linha.document_id === corpo.document_id && linha.dedupe_key === corpo.dedupe_key)) {
    return recusaDoBanco("23505", "duplicate key value violates unique constraint \"writer_evidence_divergences_dedupe_unique\"");
  }
  const gravada = { ...corpo, id: `dddddddd-0000-4000-8000-${String(banco.writer_evidence_divergences.length + 1).padStart(12, "0")}`, created_at: "2026-09-23T12:00:00+00:00", updated_at: "2026-09-23T12:00:00+00:00" };
  banco.writer_evidence_divergences.push(gravada);
  const projetada = projetar(gravada, select);
  return resposta(objeto ? projetada : [projetada], 201);
}

async function falso(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const pedido = entrada instanceof Request ? entrada : new Request(entrada, init);
  const url = new URL(pedido.url);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  const metodo = pedido.method.toUpperCase();
  if (tabela === "writer_evidence_divergences") {
    if (!divergenciasAplicadas) {
      const corpo = metodo === "POST" ? JSON.parse(await pedido.text()) as Linha : null;
      registros.push({ table: tabela, method: metodo, select: url.searchParams.get("select"), params: url.searchParams, body: corpo, responseBytes: 0 });
      return resposta({ code: "PGRST205", message: "Could not find the table 'public.writer_evidence_divergences' in the schema cache", details: null, hint: null }, 404);
    }
    if (metodo === "POST") {
      const corpo = JSON.parse(await pedido.text()) as Linha | Linha[];
      const linha = Array.isArray(corpo) ? corpo[0] : corpo;
      registros.push({ table: tabela, method: metodo, select: url.searchParams.get("select"), params: url.searchParams, body: linha, responseBytes: 0 });
      return inserirDivergencia(linha, url.searchParams.get("select"), (pedido.headers.get("accept") || "").includes("vnd.pgrst.object"));
    }
  }
  if (metodo === "POST" && tabela.startsWith("rpc/")) {
    const corpo = JSON.parse(await pedido.text()) as Linha;
    const registro: Registro = { table: tabela, method: metodo, select: null, params: url.searchParams, body: corpo, responseBytes: 0 };
    registros.push(registro);
    if (modoDasFuncoes === "pendente") return resposta({ code: "PGRST202", message: `Could not find the function public.${tabela.slice(4)}`, details: null, hint: null }, 404);
    const linhas = tabela === "rpc/writer_evidence_manifest" ? manifestoSql(corpo) : tabela === "rpc/writer_evidence_slice" ? fatiaSql(corpo) : null;
    if (!linhas) return resposta({ code: "PGRST202", message: "função desconhecida" }, 404);
    registro.responseBytes = bytes(linhas);
    return resposta(linhas);
  }
  if (metodo !== "GET" && metodo !== "HEAD") throw new Error(`o leitor não pode escrever: ${metodo} ${tabela}`);
  const select = url.searchParams.get("select");
  const registro: Registro = { table: tabela, method: metodo, select, params: url.searchParams, body: null, responseBytes: 0 };
  registros.push(registro);
  const todas = filtrar(banco[tabela] ?? [], url.searchParams);
  if (depoisDaConsulta) queueMicrotask(() => depoisDaConsulta?.(tabela, select));
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limite = url.searchParams.get("limit");
  const pagina = todas.slice(offset, limite ? offset + Number(limite) : undefined).map(linha => projetar(linha, select));
  const cabecalhos: Record<string, string> = {};
  if ((pedido.headers.get("prefer") || "").includes("count=exact")) cabecalhos["Content-Range"] = pagina.length ? `${offset}-${offset + pagina.length - 1}/${todas.length}` : `*/${todas.length}`;
  if (metodo === "HEAD") return new Response(null, { status: 200, headers: cabecalhos });
  if ((pedido.headers.get("accept") || "").includes("vnd.pgrst.object")) {
    if (pagina.length !== 1) return resposta({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${pagina.length} rows`, hint: null }, 406);
    registro.responseBytes = bytes(pagina[0]);
    return resposta(pagina[0], 200, cabecalhos);
  }
  registro.responseBytes = bytes(pagina);
  return resposta(pagina, 200, cabecalhos);
}

const cliente = createClient("http://supabase.test", "chave-de-teste", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: falso as typeof fetch } });
const contexto = (brandId = brandA) => ({ brandId, client: cliente, now: () => new Date("2026-09-23T12:00:00.000Z") });
const reiniciar = (modo: "pendente" | "aplicada") => { registros.length = 0; modoDasFuncoes = modo; depoisDaConsulta = null; };

async function erroDe(promessa: Promise<unknown>): Promise<InstanceType<typeof WriterEvidenceError>> {
  try { await promessa; } catch (erro) { if (erro instanceof WriterEvidenceError) return erro; throw erro; }
  throw new Error("esperava WriterEvidenceError");
}

const envelope = (resultado: Envelope) => {
  assert.ok(!("notModified" in resultado), "esperava envelope, veio not_modified");
  return resultado as Exclude<Envelope, { notModified: true }>;
};

/** R4: toda consulta filtra a Marca; o único leitor sem Marca é o de eventos, que filtra pelos ids já filtrados. */
function conferirMarca(marca: string) {
  for (const registro of registros) {
    if (registro.table.startsWith("rpc/")) { assert.equal(registro.body?.p_brand_id, marca, `${registro.table} sem a Marca`); continue; }
    if (registro.method === "POST" && registro.table === "writer_evidence_divergences") { assert.equal(registro.body?.marca_id, marca, "divergência gravada fora da Marca"); continue; }
    if (registro.table === "editorial_version_status_events") { assert.ok(registro.params.get("version_id")?.startsWith("in."), "eventos só por ids"); continue; }
    const filtro = registro.params.get("marca_id") ?? registro.params.get("brand_id");
    assert.ok(filtro === `eq.${marca}` || filtro === `in.(${marca})`, `${registro.table} sem filtro de Marca: ${registro.params.toString()}`);
  }
}

function conferirFormaDaLeitura() {
  for (const registro of registros) {
    assert.notEqual(registro.select, "*", `${registro.table} com select *`);
    assert.notEqual(registro.table, "radar_analysis_runs", "corrida só pela função SQL, por version_id");
    if (registro.table === "content_documents") {
      const colunas = (registro.select || "").split(",");
      assert.ok(!colunas.includes("payload"), `documento lido inteiro: ${registro.select}`);
      assert.equal(registro.params.get("marca_id"), `eq.${brandA}`);
      assert.ok(registro.params.get("id")?.startsWith("eq."));
    }
  }
}

/*
 * Manifesto e fundamentos são as chamadas mais frequentes: nenhuma tabela
 * devolve `payload` nu nem o `assessment` bruto do parecer, e o cache de SERP
 * sai só no modo `meta`.
 */
function conferirLeituraEstreita() {
  const proibidas = new Set(["payload", "payload->payload", "payload->assessment"]);
  for (const registro of registros) {
    if (registro.table.startsWith("rpc/")) continue;
    for (const coluna of (registro.select || "").split(",")) {
      const expressao = coluna.includes(":") ? coluna.slice(coluna.indexOf(":") + 1) : coluna;
      assert.ok(!proibidas.has(expressao), `${registro.table} leu ${coluna}: ${registro.select}`);
    }
    if (registro.table === "editorial_workflow_items" && (registro.select || "").startsWith("subject_id,meta:")) {
      assert.equal(registro.select, "subject_id,meta:payload->meta", "o cache de SERP no manifesto só em modo meta");
    }
  }
}

const ORCAMENTO_DO_MANIFESTO: Record<string, number> = {
  content_documents: 4_096, editorial_artifact_versions: 4_096, editorial_workflow_items: 2_560, editorial_serp_snapshots: 1_024,
  editorial_serp_reviews: 512, editorial_version_status_events: 512, radar_article_video_sources: 1_024, radar_video_source_texts: 1_024,
  internal_link_graphs: 1_024, publication_records: 1_024, brand_site_catalog_entries: 512, expert_briefs: 512, expert_contributions: 512,
};

const bytesPorTabela = () => registros.reduce((mapa, registro) => mapa.set(registro.table, (mapa.get(registro.table) ?? 0) + registro.responseBytes), new Map<string, number>());

/* ==================================== testes ================================== */

test("isolamento · documento de outra Marca é document_not_found no manifesto, nos fundamentos e na fatia", async () => {
  for (const modo of ["pendente", "aplicada"] as const) {
    reiniciar(modo);
    for (const chamada of [
      () => readWriterEvidenceManifest(contexto(brandB), documentId),
      () => readWriterFoundations(contexto(brandB), documentId),
      () => readWriterEvidence(contexto(brandB), documentId, { sourceKey: "radar.bundle.observed.questions" }),
      () => readWriterEvidence(contexto(brandB), documentId, { sourceKey: `dna.article/${articleVersion}` }),
    ]) {
      const erro = await erroDe(chamada());
      assert.equal(erro.code, "document_not_found");
      assert.equal(erro.status, 404);
    }
    conferirMarca(brandB);
    assert.ok(registros.every(registro => registro.table === "content_documents"), "nada além do cabeçalho é consultado");
    assert.ok(registros.every(registro => registro.responseBytes <= 2), "nenhum byte do documento da outra Marca sai do banco: só a lista vazia");
  }
});

test("isolamento · a função SQL recebe a Marca do contexto e devolve vazio para outra Marca", async () => {
  reiniciar("aplicada");
  const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
  assert.equal(manifesto.sizes, "measured");
  conferirMarca(brandA);
  assert.deepEqual(manifestoSql({ p_brand_id: brandB, p_document_id: documentId }), []);
  assert.deepEqual(fatiaSql({ p_brand_id: brandB, p_document_id: documentId, p_source: "document", p_path: ["importedContext"] }), []);
});

test("manifesto sem a migration · ≤ 8 kB, tamanhos desconhecidos, nada baixado para medir, ausências declaradas", async () => {
  reiniciar("pendente");
  const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
  const tamanho = writerEvidenceJsonBytes(manifesto);
  assert.ok(tamanho <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes, `${tamanho} B`);
  assert.equal(manifesto.sizes, "unknown_migration_pending");
  assert.ok(manifesto.notices.some(aviso => /migration_pendente/.test(aviso)));
  assert.ok(manifesto.bundle!.entries.every(([, bytesDaEntrada]) => bytesDaEntrada === null), "sem a função, bytes desconhecidos");
  const chaves = manifesto.sources.map(linha => linha[0]);
  for (const esperada of [`dna.article/${articleVersion}`, `dna.keyword/${kw1}`, `dna.keyword/${kw2}`, "dna.keyword.metrics", `serp.cache/${kw1}`,
    `graph.article/${graphVersion}`, "serp.architect.formation", "brand.site.catalog", "publication.self", "publication.brand", `brand.skill/${skillVersion}`,
    `video.transcript/${video1}`, "serp.radar.snapshot.latest"]) assert.ok(chaves.includes(esperada), `faltou ${esperada}`);
  const ausentes = new Map(manifesto.absent.map(([chave, , motivo]) => [chave, motivo]));
  assert.match(ausentes.get("serp.radar.snapshot") ?? "", /migration_pendente/);
  assert.match(ausentes.get("dna.silo") ?? "", /legada/);
  assert.match(ausentes.get("dna.siloPage") ?? "", /vínculo determinístico/);
  assert.match(ausentes.get("dna.keyword.presentation/*") ?? "", /vínculo determinístico/);
  assert.match(ausentes.get(`video.transcript/${video2}`) ?? "", /removido/);
  assert.match(ausentes.get(`video.transcript/${video3}`) ?? "", /versão do texto/);
  assert.match(ausentes.get(`serp.cache/${kw2}`) ?? "", /nunca coleta/);
  assert.match(ausentes.get("serp.architect.territorial") ?? "", /territorial/);
  assert.match(ausentes.get("specialist.posterior") ?? "", /só contagem: 2/);
  assert.ok(manifesto.notices.some(aviso => /2 contribuição/.test(aviso) && /reenvio do Radar/.test(aviso)));
  const linhaDoCache = manifesto.sources.find(linha => linha[0] === `serp.cache/${kw1}`)!;
  assert.equal(linhaDoCache[9], true, "cache coletado depois do pacote é posterior");
  assert.equal(manifesto.levels[linhaDoCache[3] - 1], "OTHER_RADAR_EVIDENCE");
  assert.match(String(manifesto.sources.find(linha => linha[0] === `dna.keyword/${kw1}`)![10]), /há v3 mais nova/);
  assert.match(String(manifesto.sources.find(linha => linha[0] === `dna.article/${articleVersion}`)![10]), /há v3 mais nova/);
  assert.ok(manifesto.sources.every(linha => manifesto.levels[linha[3] - 1] !== "CURRENT_SUFFICIENT_SERP"), "fonte fora do pacote nunca é SERP vigente e suficiente");
  assert.ok(manifesto.sources.every(linha => linha[3] >= 1 && linha[3] <= 9));
  assert.equal(manifesto.bundle!.level, "CURRENT_SUFFICIENT_SERP", "o pacote congelado declarado autoritativo pelo Radar");
  conferirMarca(brandA);
  conferirFormaDaLeitura();
  const documentos = registros.filter(registro => registro.table === "content_documents");
  assert.equal(documentos.length, 2, "cabeçalho e uma consulta de caminhos pequenos");
  assert.ok(documentos.every(registro => registro.responseBytes < 4_096), `documento: ${documentos.map(registro => registro.responseBytes)}`);
  conferirLeituraEstreita();
  const porTabela = bytesPorTabela();
  for (const [tabela, teto] of Object.entries(ORCAMENTO_DO_MANIFESTO)) {
    assert.ok((porTabela.get(tabela) ?? 0) <= teto, `${tabela}: ${porTabela.get(tabela)} B > ${teto} B`);
  }
  const total = registros.reduce((soma, registro) => soma + registro.responseBytes, 0);
  assert.ok(total < 12_000, `o manifesto inteiro custou ${total} B de banco`);
});

test("manifesto com a migration · tamanhos medidos no banco, corridas e snapshot entregue listados, ≤ 8 kB", async () => {
  reiniciar("aplicada");
  const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
  assert.ok(writerEvidenceJsonBytes(manifesto) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes, `${writerEvidenceJsonBytes(manifesto)} B`);
  assert.equal(manifesto.sizes, "measured");
  const doPacote = new Map(manifesto.bundle!.entries.map(([caminho, bytesDaEntrada]) => [`${manifesto.bundle!.keyPrefix}${caminho}`, bytesDaEntrada]));
  assert.ok((doPacote.get("radar.bundle.observed") ?? 0) > 400_000, "o manifesto mede o que não baixa");
  assert.ok(!doPacote.has("radar.bundle.bundleHash"), "identidade do pacote fica no cabeçalho");
  assert.equal(manifesto.bundle!.aliases["radar.bundle.observed.evidence.structural.semantic"], "radar.bundle.observed.evidence.semantic");
  const chaves = manifesto.sources.map(linha => linha[0]);
  for (const esperada of ["serp.radar.snapshot", "serp.radar.snapshot.latest", "run.extractions", "run.competitiveReport", "run.youtube.universe"]) {
    assert.ok(chaves.includes(esperada), `faltou ${esperada}`);
  }
  const recente = manifesto.sources.find(linha => linha[0] === "serp.radar.snapshot.latest")!;
  assert.equal(recente[9], true, "snapshot mais novo que o pacote é posterior");
  const entregue = manifesto.sources.find(linha => linha[0] === "serp.radar.snapshot")!;
  assert.equal(entregue[9], false);
  assert.equal(entregue[2], "needs_review");
  assert.match(String(entregue[10]), /revisão humana: approved/);
  const transcricao = manifesto.sources.find(linha => linha[0] === `video.transcript/${video1}`)!;
  assert.equal(transcricao[4], Buffer.byteLength(TRANSCRICAO));
  conferirMarca(brandA);
  conferirFormaDaLeitura();
  conferirLeituraEstreita();
  const porTabela = bytesPorTabela();
  for (const [tabela, teto] of Object.entries(ORCAMENTO_DO_MANIFESTO)) {
    assert.ok((porTabela.get(tabela) ?? 0) <= teto, `${tabela}: ${porTabela.get(tabela)} B > ${teto} B`);
  }
});

test("fundamentos · ≤ 24 kB, com guardas, o que não pode redefinir, projeção do ArticleDNA e resumos — antes da migration", async () => {
  reiniciar("pendente");
  const fundamentos = await readWriterFoundations(contexto(), documentId);
  assert.ok(writerEvidenceJsonBytes(fundamentos) <= WRITER_EVIDENCE_LIMITS.foundationsMaxBytes, `${writerEvidenceJsonBytes(fundamentos)} B`);
  assert.ok(fundamentos.guards.some(guarda => /Não gerar nem sugerir FAQ/.test(guarda)));
  assert.match(fundamentos.next, /nunca uma seção de FAQ/);
  assert.deepEqual([...fundamentos.writerMayNot], [...RADAR_WRITER_MAY_NOT]);
  assert.equal(fundamentos.article?.fields.promise, "Rotina simples para pele oleosa");
  assert.deepEqual(fundamentos.article?.fields.requiredTopics, ["ordem da rotina"]);
  assert.deepEqual(fundamentos.article?.invalidFields, []);
  assert.equal(fundamentos.competitors[0].bestRank, 1, "concorrentes pela melhor posição");
  assert.ok(fundamentos.questions.length > 0);
  assert.equal(fundamentos.video?.sources.length, 3);
  assert.equal(fundamentos.bundle?.bundleHash, "bundle-hash:leitor");
  assert.equal(fundamentos.documentRefs.articleDnaRef.versionId, articleVersion);
  assert.deepEqual(fundamentos.pendingDecisions.map(item => (item as Linha).id), ["p1"]);
  assert.equal(JSON.stringify(fundamentos).includes(PESO_EXTERNO), false, "nada do peso observado");
  conferirMarca(brandA);
  conferirFormaDaLeitura();
  conferirLeituraEstreita();
  assert.ok(registros.every(registro => !registro.table.startsWith("rpc/")), "fundamentos não dependem da migration");
  const caminhosDoPacote = registros.filter(registro => registro.table === "content_documents").flatMap(registro => (registro.select || "").split(",")).filter(coluna => coluna.includes("->bundle->"));
  assert.ok(caminhosDoPacote.length <= 8, `${caminhosDoPacote.length} caminhos do pacote`);
  const consultasDoPacote = registros.filter(registro => registro.table === "content_documents" && (registro.select || "").includes("->bundle->") && !(registro.select || "").includes("h_schemaVersion"));
  assert.ok(consultasDoPacote.every(registro => (registro.select || "").split(",").filter(coluna => coluna.startsWith("p_")).length <= 5), "no máximo 5 caminhos por consulta");
});

test("fatia · sourceKey fora do manifesto ou id inventado é recusado antes de qualquer leitura de conteúdo", async () => {
  reiniciar("aplicada");
  const recusadas = [
    "dna.article/versao-inventada", `dna.keyword/${"4".repeat(8)}-4444-4444-8444-444444444449`, "video.transcript/77777777-7777-4777-8777-777777777779",
    "graph.article/graph:silo-1:v3", "dna.brand/v-qualquer", "brand.skill/skill-outra-marca", "run.inexistente", "radar.bundle", "texto livre", "dna.silo/legacy:silo:artigo-leitor:v1",
  ];
  for (const sourceKey of recusadas) {
    registros.length = 0;
    const erro = await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey }));
    assert.equal(erro.code, "source_not_in_manifest", sourceKey);
    assert.ok(!registros.some(registro => registro.table === "rpc/writer_evidence_slice"), `${sourceKey} não chegou à fatia`);
    assert.ok(!registros.some(registro => (registro.select || "").split(",").includes("payload")), `${sourceKey} não leu payload`);
  }
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions", cursor: "-1" }))).code, "invalid_request");
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions", fields: ["a.b"] }))).code, "invalid_request");
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentYoutube, { sourceKey: "radar.bundle.observed.questions" }))).code, "source_not_in_manifest");
});

async function lerTudo(sourceKey: string, opcoes: { maxBytes?: number; fields?: string[] } = {}) {
  const itens: unknown[] = [];
  const paginas: Array<Exclude<Envelope, { notModified: true }>> = [];
  let cursor: string | null = null;
  for (let volta = 0; volta < 400; volta += 1) {
    const pagina = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey, cursor, ...opcoes }));
    paginas.push(pagina);
    if (Array.isArray(pagina.data)) itens.push(...(pagina.data as Array<{ value: unknown }>).map(item => item.value));
    cursor = pagina.page?.next ?? null;
    if (!cursor) break;
  }
  return { itens, paginas };
}

test("fatia com a migration · páginas ≤ 16 kB por padrão e ≤ 32 kB no máximo; concatenadas = seção congelada", async () => {
  reiniciar("aplicada");
  const secao = (bundleGoogle().observed.externalSources as Linha).observedLinks as Linha[];
  for (const maxBytes of [undefined, 32_768]) {
    const { itens, paginas } = await lerTudo("radar.bundle.observed.externalSources#observedLinks", { maxBytes });
    const teto = maxBytes ?? WRITER_EVIDENCE_LIMITS.sliceDefaultBytes;
    for (const pagina of paginas) {
      assert.ok(writerEvidenceJsonBytes(pagina) <= teto, `página de ${writerEvidenceJsonBytes(pagina)} B com teto ${teto}`);
      assert.equal(pagina.frozen, true);
      assert.equal(pagina.hierarchyLevel, "CURRENT_SUFFICIENT_SERP");
      assert.equal(pagina.usage, "research_only");
    }
    const inteiros = itens.map((item, indice) => ((item as Linha).trecho as string).endsWith("…") ? secao[indice] : item);
    assert.deepEqual(inteiros.map(item => (item as Linha).url), secao.map(item => item.url), "ordem estável, nada pulado");
    assert.ok(itens.some(item => ((item as Linha).trecho as string).endsWith("…")), "trecho de terceiro longo cortado na listagem");
    assert.ok(paginas.length > 3);
  }
  const primeira = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.externalSources#observedLinks" }));
  const repetida = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.externalSources#observedLinks" }));
  assert.equal(primeira.page?.next, repetida.page?.next, "cursor determinístico");
  assert.equal(primeira.etag, repetida.etag);
  const item = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.externalSources#observedLinks.7" }));
  assert.equal(((item.data as Linha).trecho as string), secao[7].trecho, "a página do item traz o texto integral");
  conferirMarca(brandA);
  conferirFormaDaLeitura();
  assert.ok(registros.filter(registro => registro.table === "rpc/writer_evidence_slice").every(registro => Number(registro.body?.p_max_bytes) <= 32_768));
});

test("fatia · objeto maior que a página é cortado por chave; structural sai sem a cópia de semantic, com alias", async () => {
  reiniciar("aplicada");
  const estrutura = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.structure" }));
  assert.equal(estrutura.page?.container, "object");
  assert.ok(writerEvidenceJsonBytes(estrutura) <= WRITER_EVIDENCE_LIMITS.sliceDefaultBytes);
  const estrutural = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.evidence.structural" }));
  assert.ok(!Object.keys(estrutural.data as Linha).includes("semantic"));
  assert.equal(estrutural.page?.total, 1, "a chave semantic nem é contada: é cópia");
  assert.ok(!estrutural.page?.omitted.some(item => item.at === "semantic"), "nem como item grande demais");
  assert.match(estrutural.notice ?? "", /cópia de radar\.bundle\.observed\.evidence\.semantic/);
  registros.length = 0;
  const alias = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.evidence.structural.semantic" }));
  assert.equal(alias.data, null);
  assert.match(alias.notice ?? "", /Cópia idêntica de radar\.bundle\.observed\.evidence\.semantic/);
  assert.ok(!registros.some(registro => registro.table === "rpc/writer_evidence_slice"), "alias não lê nada");
});

test("fatia sem a migration · seção medida pequena sai por caminho; seção grande, corrida e transcrição respondem migration_pendente sem baixar", async () => {
  reiniciar("pendente");
  const perguntas = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions" }));
  assert.equal(perguntas.page?.total, 14);
  assert.ok(writerEvidenceJsonBytes(perguntas) <= WRITER_EVIDENCE_LIMITS.sliceDefaultBytes);
  const pergunta = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions#3" }));
  assert.equal((pergunta.data as Linha).canonicalQuestion, "Pergunta observada 3?");
  for (const sourceKey of ["radar.bundle.observed.externalSources", "radar.bundle.observed.evidence.semantic", "radar.bundle.observed.structure", "run.extractions", `video.transcript/${video1}`, "serp.radar.snapshot"]) {
    registros.length = 0;
    const erro = await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey }));
    assert.equal(erro.code, "migration_pendente", sourceKey);
    assert.equal(erro.details.migration, "20260923150000_writer_evidence_reader");
    if (sourceKey === "serp.radar.snapshot") {
      assert.doesNotMatch(erro.message, /\bUse serp\.radar\.snapshot\.latest\b/, "a mensagem não pode mandar trocar a SERP congelada pela posterior");
      assert.match(erro.message, /posterior ao pacote e não substitui o snapshot entregue/);
      assert.match(erro.message, /confronto datado/);
    }
    const baixado = registros.filter(registro => !registro.table.startsWith("rpc/")).reduce((soma, registro) => soma + registro.responseBytes, 0);
    assert.ok(baixado < 4_096, `${sourceKey} baixou ${baixado} B`);
    assert.ok(!registros.some(registro => /externalSources|->evidence|->structure|extractions/.test(registro.select || "")), `${sourceKey} tentou ler por caminho`);
  }
  conferirMarca(brandA);
  conferirFormaDaLeitura();
});

test("ifNoneMatch · etag igual responde not_modified sem ler o conteúdo", async () => {
  reiniciar("aplicada");
  const primeira = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions" }));
  registros.length = 0;
  const denovo = await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions", ifNoneMatch: primeira.etag });
  assert.deepEqual(denovo, { sourceKey: "radar.bundle.observed.questions", notModified: true, etag: primeira.etag });
  assert.ok(writerEvidenceJsonBytes(denovo) < 300);
  assert.deepEqual(registros.map(registro => registro.table), ["content_documents"], "só o cabeçalho");
  const dna = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `dna.article/${articleVersion}` }));
  registros.length = 0;
  assert.equal((await readWriterEvidence(contexto(), documentId, { sourceKey: `dna.article/${articleVersion}`, ifNoneMatch: dna.etag }) as { notModified?: boolean }).notModified, true);
  assert.ok(!registros.some(registro => registro.table === "editorial_artifact_versions"), "versão imutável: nem a versão é relida");
  const outraPagina = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions", cursor: "5", ifNoneMatch: primeira.etag }));
  assert.notEqual(outraPagina.etag, primeira.etag, "o etag é da página");
});

test("DNAs · pela regra de parse do dono; métricas pelo resolver do Minerador; nada de DNA muda", async () => {
  reiniciar("pendente");
  const artigo = await lerTudo(`dna.article/${articleVersion}`);
  const chaves = artigo.paginas.flatMap(pagina => Object.keys(pagina.data as Linha));
  assert.deepEqual([...chaves].sort(), Object.keys(articleDna).sort(), "todas as chaves do ArticleDNA, por página");
  assert.ok(artigo.paginas.every(pagina => pagina.hierarchyLevel === "ARTICLE_DNA_HYPOTHESIS" && pagina.origin.module === "arquiteto"));
  const qualificacaoLida = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `dna.keyword/${kw1}` }));
  const completa = Object.assign({}, qualificacaoLida.data as Linha);
  assert.equal(completa.keywordId, kw1);
  assert.equal(completa.id, qualificationVersion(kw1, 2), "a versão FIXADA, não a vigente");
  assert.deepEqual(completa.query, qualificacoes[kw1].query);
  assert.equal(qualificacaoLida.origin.module, "minerador");
  const metricas = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "dna.keyword.metrics" }));
  const lidas = (metricas.data as Array<{ value: Linha }>).map(item => item.value);
  assert.deepEqual(lidas.map(item => item.keywordId), [kw1, kw2]);
  const oraculo = resolveCanonicalKeywordSnapshot(banco.minerador_keywords[0] as Parameters<typeof resolveCanonicalKeywordSnapshot>[0]);
  assert.deepEqual(lidas[0].metrics, JSON.parse(JSON.stringify(oraculo.metrics)), "o mesmo snapshot canônico do Minerador");
  const skill = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `brand.skill/${skillVersion}` }));
  assert.equal(skill.origin.status, "approved");
  assert.match(skill.notice ?? "", /não fixada no documento/);
  assert.ok(!JSON.stringify(skill.data).includes("Texto original longo"), "o Markdown original não sai: repete as seções");
  const marca = await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: "dna.brand/current" }));
  assert.equal(marca.code, "source_absent");
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: "dna.siloPage" }))).code, "source_absent");
  conferirMarca(brandA);
  conferirFormaDaLeitura();
});

test("frescor · cache de SERP posterior sai datado, supersedes false, nunca SERP vigente; o pacote não muda", async () => {
  reiniciar("pendente");
  const antes = await readWriterFoundations(contexto(), documentId);
  const lente = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `serp.cache/mobile-ios/${kw1}` }));
  assert.equal(lente.posteriorAoPacote, true);
  assert.equal(lente.supersedes, false);
  assert.equal(lente.hierarchyLevel, "OTHER_RADAR_EVIDENCE");
  assert.match(lente.hierarchyNote ?? "", /não revisada pelo Radar/);
  assert.deepEqual(((lente.data as Linha).observation as Linha).aiOverviewDomains, ["citado.test"]);
  assert.ok((lente.data as Linha).digest, "lente não canônica traz o digest");
  const todas = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `serp.cache/${kw1}` }));
  assert.deepEqual(Object.keys(todas.data as Linha).sort(), SERP_CACHE_LENSES.map(serpCacheLensLabel).sort());
  const corpo = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `serp.cache/${kw1}#body` }));
  assert.equal(corpo.page?.total, 14);
  assert.ok(((corpo.data as Array<{ value: Linha }>)[0].value.description as string).endsWith("…"), "descrição longa cortada na listagem");
  const recente = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "serp.radar.snapshot.latest" }));
  assert.equal(recente.posteriorAoPacote, true);
  assert.equal(recente.hierarchyLevel, "OTHER_RADAR_EVIDENCE");
  assert.match(String(recente.origin.status), /needs_review/);
  const depois = await readWriterFoundations(contexto(), documentId);
  assert.equal(depois.bundle?.bundleHash, antes.bundle?.bundleHash);
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: `serp.cache/${kw2}` }))).code, "source_absent");
  conferirMarca(brandA);
  conferirFormaDaLeitura();
});

test("vídeos · transcrição só com vínculo ativo e na versão do pacote; removido ou reprocessado é ausência", async () => {
  reiniciar("aplicada");
  const { paginas } = await lerTudo(`video.transcript/${video1}`);
  assert.equal(paginas.map(pagina => pagina.data as string).join(""), TRANSCRICAO, "concatenadas = texto integral");
  assert.ok(paginas.every(pagina => writerEvidenceJsonBytes(pagina) <= WRITER_EVIDENCE_LIMITS.sliceDefaultBytes));
  assert.equal(paginas[0].origin.versionId, "2");
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: `video.transcript/${video2}` }))).details.situation, "removed_after_delivery");
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: `video.transcript/${video3}` }))).details.situation, "text_version_missing");
  conferirMarca(brandA);
});

test("especialista posterior só como contagem; shortlist Amazon não congelada; corrida sem os links observados", async () => {
  reiniciar("aplicada");
  const contagem = await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: "specialist.posterior" }));
  assert.equal(contagem.code, "count_only");
  assert.equal(contagem.details.count, 2);
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: "run.amazon.shortlist" }))).code, "source_absent");
  const extracoes = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "run.extractions" }));
  assert.ok(!JSON.stringify(extracoes).includes(PESO_DA_CORRIDA), "listagem sem texto nem links observados");
  const extracao = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "run.extractions#2" }));
  assert.ok(!Object.keys(extracao.data as Linha).includes("observedLinks"));
  const relatorio = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "run.competitiveReport" }));
  assert.deepEqual(Object.keys(relatorio.data as Linha), ["resumo"]);
  const universo = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "run.youtube.universe" }));
  assert.ok((universo.data as Array<{ value: Linha }>).every(item => !("thumbnailUrl" in item.value)), "projeção editorial do universo");
  assert.equal(universo.hierarchyLevel, "OTHER_RADAR_EVIDENCE");
  const chamadas = registros.filter(registro => registro.table === "rpc/writer_evidence_slice" && registro.body?.p_source === "radar_run");
  assert.ok(chamadas.length >= 4);
  assert.ok(!registros.some(registro => registro.table === "radar_analysis_runs"));
});

test("Arquiteto e Publicações · parecer sem o assessment bruto, grafo congelado, catálogo e publicações paginados", async () => {
  reiniciar("pendente");
  const formacao = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "serp.architect.formation" }));
  assert.equal((formacao.data as Linha).verdict, "COMPATIBLE", "a formação da Marca A, não a da B");
  assert.ok(!("assessment" in (formacao.data as Linha)));
  const colunasDosPareceres = registros.filter(registro => registro.table === "editorial_workflow_items").flatMap(registro => (registro.select || "").split(","));
  assert.ok(!colunasDosPareceres.some(coluna => /payload->assessment$/.test(coluna)), "o assessment bruto não vem junto");
  assert.ok(registros.some(registro => registro.table === "editorial_workflow_items" && registro.params.get("payload->assessment->>id") === "eq.assessment-1"), "o parecer é achado pelo id do assessment, não pelo subject_id");
  assert.equal((formacao.data as Linha).hashMatchesArticleDnaRef, true);
  const bruto = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "serp.architect.formation#assessment" }));
  assert.equal(bruto.page?.container, "object");
  assert.ok(writerEvidenceJsonBytes(bruto) <= WRITER_EVIDENCE_LIMITS.sliceDefaultBytes);
  const grafo = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `graph.article/${graphVersion}` }));
  assert.deepEqual(((grafo.data as Linha).outbound as Linha[]).map(aresta => aresta.edge_id), ["e1"]);
  assert.deepEqual(((grafo.data as Linha).inbound as Linha[]).map(aresta => aresta.edge_id), ["e2"]);
  assert.match(grafo.notice ?? "", /posterior ao pacote/);
  const catalogo = await lerTudo("brand.site.catalog", { maxBytes: 4_096 });
  assert.equal(catalogo.itens.length, 45);
  assert.ok(catalogo.itens.every(item => !("meta_description" in (item as Linha))));
  assert.equal(catalogo.paginas[0].page?.total, 45);
  const propria = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "publication.self" }));
  assert.equal((propria.data as Linha).slug, "rotina-pele-oleosa");
  assert.match(propria.notice ?? "", /protegidos/);
  const publicacoes = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "publication.brand" }));
  assert.equal(publicacoes.page?.total, 2);
  conferirMarca(brandA);
  conferirFormaDaLeitura();
});

test("legado · v1 do Planejador e perfil YOUTUBE declaram a ausência, nunca lista vazia", async () => {
  reiniciar("pendente");
  const v1 = await readWriterFoundations(contexto(), documentV1);
  assert.equal(v1.bundle, null);
  assert.ok(v1.absent.some(item => item.field === "bundle" && /Planejador/.test(item.reason)));
  assert.equal(v1.article, null);
  const manifestoV1 = await readWriterEvidenceManifest(contexto(), documentV1);
  assert.ok(manifestoV1.absent.some(([chave, , motivo]) => chave === "radar.bundle" && /v1/.test(motivo)));
  assert.equal(manifestoV1.bundle, null);
  const youtube = await readWriterEvidenceManifest(contexto(), documentYoutube);
  assert.ok(youtube.absent.some(([chave, , motivo]) => chave === "radar.bundle.observed" && /YOUTUBE/.test(motivo)));
  assert.ok(youtube.bundle!.entries.every(([caminho]) => caminho !== "observed" && !caminho.startsWith("observed.")));
  const fundamentosYoutube = await readWriterFoundations(contexto(), documentYoutube);
  assert.ok(fundamentosYoutube.absent.some(item => /YOUTUBE/.test(item.reason)));
  conferirMarca(brandA);
  conferirFormaDaLeitura();
});

test("snapshot entregue · resolvido pelo id do registro no payload, como no remoto; teto mínimo da resposta é 4 kB", async () => {
  reiniciar("aplicada");
  const entregue = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "serp.radar.snapshot" }));
  assert.equal(entregue.origin.entityId, snapshotEntregue);
  assert.equal(entregue.posteriorAoPacote, false);
  assert.match(String(entregue.origin.status), /revisão: approved/);
  assert.equal(entregue.hierarchyLevel, "OTHER_RADAR_EVIDENCE");
  assert.ok(registros.some(registro => registro.table === "editorial_serp_snapshots" && registro.params.get("payload->>id") === "eq.registro-entregue"));
  assert.ok(registros.filter(registro => registro.table === "editorial_serp_snapshots").every(registro => registro.params.get("article_id") === `eq.${articleId}`));
  const pequeno = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions", maxBytes: 1_024 }));
  assert.ok(writerEvidenceJsonBytes(pequeno) <= 4_096, `${writerEvidenceJsonBytes(pequeno)} B`);
  assert.ok((pequeno.data as unknown[]).length >= 1);
  conferirMarca(brandA);
});

test("pacote trocado no meio da leitura é document_changed; dossiê fora do contrato é document_incompatible", async () => {
  reiniciar("pendente");
  let trocado = false;
  depoisDaConsulta = (tabela, select) => {
    if (trocado || tabela !== "content_documents" || !(select || "").includes("h_schemaVersion")) return;
    trocado = true;
    const linha = banco.content_documents.find(item => item.id === documentId)!;
    ((((linha.payload as Linha).importedContext as Linha).dossier as Linha)).bundleHash = "bundle-hash:outro";
  };
  try {
    const erro = await erroDe(readWriterFoundations(contexto(), documentId));
    assert.equal(erro.code, "document_changed");
    assert.equal(erro.status, 409);
  } finally {
    depoisDaConsulta = null;
    const linha = banco.content_documents.find(item => item.id === documentId)!;
    ((((linha.payload as Linha).importedContext as Linha).dossier as Linha)).bundleHash = "bundle-hash:leitor";
  }
  registros.length = 0;
  for (const chamada of [
    () => readWriterFoundations(contexto(), "writer:doc-corrompido"),
    () => readWriterEvidenceManifest(contexto(), "writer:doc-corrompido"),
    () => readWriterEvidence(contexto(), "writer:doc-corrompido", { sourceKey: "radar.bundle.observed.questions" }),
  ]) assert.equal((await erroDe(chamada())).code, "document_incompatible");
  assert.ok(registros.every(registro => registro.table === "content_documents" && (registro.select || "").includes("h_schemaVersion")), "só o cabeçalho foi lido");
});

test("fundamentos grandes · cortam concorrentes e perguntas e dizem quantos ficaram e onde ler o resto", async () => {
  reiniciar("pendente");
  const fundamentos = await readWriterFoundations(contexto(), "writer:doc-grande");
  assert.ok(writerEvidenceJsonBytes(fundamentos) <= WRITER_EVIDENCE_LIMITS.foundationsMaxBytes, `${writerEvidenceJsonBytes(fundamentos)} B`);
  const cortes = new Map((fundamentos.trimmed ?? []).map(corte => [corte.field, corte]));
  assert.equal(cortes.get("competitors")?.total, 400);
  assert.equal(cortes.get("competitors")?.kept, fundamentos.competitors.length);
  assert.equal(cortes.get("competitors")?.readAt, "radar.bundle.observed.competitors");
  assert.ok(fundamentos.competitors.every((item, indice, lista) => indice === 0 || (lista[indice - 1].bestRank ?? 0) <= (item.bestRank ?? 0)), "os melhores posicionados ficam");
  assert.ok(fundamentos.guards.length > 0 && fundamentos.writerMayNot.length > 0 && fundamentos.article, "o fixo nunca é cortado");
});

test("ESTRUTURAL · o leitor não seleciona payload de documento, não lê corrida por tabela nem por findByArticle, e toda consulta filtra a Marca", () => {
  const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const fontes = ["../lib/server/writer-evidence-reader.ts", "../lib/server/writer-evidence-sources.ts", "../lib/server/writer-evidence-document.ts"]
    .map(caminho => semComentarios(readFileSync(new URL(caminho, import.meta.url), "utf8")));
  const juntas = fontes.join("\n");
  assert.doesNotMatch(juntas, /select\(\s*["']\*["']/);
  assert.doesNotMatch(juntas, /findByArticle|WorkflowRepository|loadRadarState|ArtifactRepository/);
  assert.doesNotMatch(juntas, /from\(\s*["']radar_analysis_runs["']/);
  assert.doesNotMatch(juntas, /\.(insert|update|upsert|delete)\(/, "o leitor nunca escreve");
  const consultas = juntas.split(/\.from\(/).slice(1);
  for (const consulta of consultas) {
    const tabela = consulta.match(/^\s*["']([a-z_]+)["']/)?.[1];
    if (!tabela || tabela === "editorial_version_status_events") continue;
    assert.match(consulta.slice(0, 600), /\.eq\(\s*["'](marca_id|brand_id)["']\s*,\s*context\.brandId\s*\)/, `${tabela} sem o filtro de Marca na própria consulta`);
  }
  assert.ok(!WRITER_EVIDENCE_HEAD_SELECT.split(",").includes("payload"));
  assert.match(WRITER_EVIDENCE_HEAD_SELECT, /x_bundleHash:payload->importedContext->dossier->bundleHash/);
});

/* ============================ correções da revisão B1 ============================ */

/** Altera o banco falso só dentro do teste e devolve o original depois, mesmo se falhar. */
async function comBancoAlterado(alterar: (atual: Record<string, Linha[]>) => void, corpo: () => Promise<void>) {
  const original = structuredClone(banco);
  try {
    alterar(banco);
    await corpo();
  } finally {
    banco = original;
    depoisDaConsulta = null;
  }
}

const POSTERIOR = "2026-09-22T10:00:00+00:00";
const brandDnaVersion = "99999999-0000-4000-8000-00000000d0a1";
const skillTomVersion = "88888888-8888-4888-8888-88888888a0a2";
const formacaoDaMarcaA = (atual: Record<string, Linha[]>) =>
  atual.editorial_workflow_items.find(item => item.subject_type === "article_formation_serp_assessment" && item.marca_id === brandA)!;

test("frescor · posteriorAoPacote da fatia é o mesmo do manifesto em toda fonte vigente fora do pacote", async () => {
  await comBancoAlterado(atual => {
    atual.editorial_artifact_versions.push(
      { version_id: brandDnaVersion, entity_id: `brand:${brandA}`, marca_id: brandA, artifact_type: "brand_dna", version_number: 1, status: "draft", content_hash: HASH("d"), created_at: POSTERIOR,
        payload: { schemaVersion: 1, brandId: brandA, positioning: "Cuidado simples", audience: ["pele oleosa"], voice: ["direta"], businessObjectives: ["autoridade"], differentiators: [], prohibitedClaims: [], editorialPrinciples: [] } },
      { version_id: skillTomVersion, entity_id: "skill:tom", marca_id: brandA, artifact_type: "brand_skill", version_number: 1, status: "draft", content_hash: HASH("u"), created_at: POSTERIOR, payload: { ...skillPayload, definitionKey: "tom", contentHash: HASH("u") } },
    );
    atual.editorial_version_status_events.push({ id: "ev-dna", version_id: brandDnaVersion, status: "approved", occurred_at: POSTERIOR });
    atual.editorial_workflow_items.push({ id: "t0000000-0000-4000-8000-000000000001", marca_id: brandA, subject_type: "territorial_serp_assessment", subject_id: "questao-1", article_id: null, stage: "architect", state: "supported", updated_at: POSTERIOR, payload: { base: { territoryRef } } });
    formacaoDaMarcaA(atual).updated_at = POSTERIOR;
  }, async () => {
    reiniciar("pendente");
    const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
    const doManifesto = new Map(manifesto.sources.map(linha => [linha[0], linha[9]]));
    const esperado: Record<string, boolean> = {
      "dna.brand/current": true, [`brand.skill/${skillTomVersion}`]: true, [`brand.skill/${skillVersion}`]: false,
      "serp.architect.formation": true, "serp.architect.territorial": true, "publication.self": true,
      [`serp.cache/${kw1}`]: true, "serp.radar.snapshot.latest": true,
    };
    for (const [sourceKey, posterior] of Object.entries(esperado)) {
      assert.equal(doManifesto.get(sourceKey), posterior, `manifesto: ${sourceKey}`);
      const fatia = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey }));
      assert.equal(fatia.posteriorAoPacote, posterior, `fatia: ${sourceKey}`);
      assert.equal(fatia.supersedes, false, sourceKey);
      assert.notEqual(fatia.hierarchyLevel, "CURRENT_SUFFICIENT_SERP", sourceKey);
    }
    const dna = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "dna.brand/current" }));
    assert.equal(dna.origin.collectedAt, POSTERIOR, "a fonte vigente sai datada");
    const fixado = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: `dna.article/${articleVersion}` }));
    assert.equal(fixado.posteriorAoPacote, false, "DNA fixado é a base, nunca posterior");
    conferirMarca(brandA);
  });
});

test("parecer de formação substituído (mesmo id, outro hash) é ausência no manifesto e na fatia, inclusive em #assessment", async () => {
  await comBancoAlterado(atual => {
    ((formacaoDaMarcaA(atual).payload as Linha).assessment as Linha).contentHash = HASH("f");
  }, async () => {
    reiniciar("pendente");
    const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
    assert.ok(!manifesto.sources.some(linha => linha[0] === "serp.architect.formation"), "não é listado como fonte");
    assert.match(new Map(manifesto.absent.map(([chave, , motivo]) => [chave, motivo])).get("serp.architect.formation") ?? "", /substituído/);
    for (const sourceKey of ["serp.architect.formation", "serp.architect.formation#assessment", "serp.architect.formation#verdict"]) {
      registros.length = 0;
      const erro = await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey }));
      assert.equal(erro.code, "source_absent", sourceKey);
      assert.equal(erro.details.reason, "hash_mismatch", sourceKey);
      assert.ok(!registros.some(registro => /assessment:payload->assessment$|f_verdict/.test(registro.select || "")), `${sourceKey} não leu o parecer trocado`);
    }
  });
  const META_DO_PARECER = "id,subject_id,state,updated_at,a_hash:payload->assessment->>contentHash";
  for (const sourceKey of ["serp.architect.formation#assessment", "serp.architect.formation"]) {
    await comBancoAlterado(() => undefined, async () => {
      reiniciar("pendente");
      depoisDaConsulta = (tabela, select) => {
        if (tabela !== "editorial_workflow_items" || select !== META_DO_PARECER) return;
        ((formacaoDaMarcaA(banco).payload as Linha).assessment as Linha).contentHash = HASH("f");
      };
      const erro = await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey }));
      assert.equal(erro.code, "source_absent", `trocado no meio da leitura: ${sourceKey}`);
      assert.equal(erro.details.reason, "hash_mismatch", sourceKey);
    });
  }
});

test("contexto da Marca · a Skill segue a regra do dono: versão mais nova recusada tira a definição, e a anterior não volta", async () => {
  const skillV2 = "88888888-8888-4888-8888-88888888b0b2";
  const versao2 = { version_id: skillV2, entity_id: "skill:voz", marca_id: brandA, artifact_type: "brand_skill", version_number: 2, status: "draft", content_hash: HASH("v"), created_at: "2026-09-11T10:00:00+00:00", payload: { ...skillPayload, version: 2, contentHash: HASH("v") } };
  await comBancoAlterado(atual => {
    atual.editorial_artifact_versions.push(versao2);
    atual.editorial_version_status_events.push({ id: "ev-v2", version_id: skillV2, status: "rejected", occurred_at: "2026-09-11T11:00:00+00:00" });
  }, async () => {
    reiniciar("pendente");
    const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
    assert.ok(!manifesto.sources.some(linha => linha[0].startsWith("brand.skill/")), "a Skill recusada não é oferecida, nem a v1");
    for (const versao of [skillVersion, skillV2]) {
      assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: `brand.skill/${versao}` }))).code, "source_not_in_manifest", versao);
    }
  });
  await comBancoAlterado(atual => {
    atual.editorial_artifact_versions.push(versao2);
  }, async () => {
    reiniciar("pendente");
    const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
    const skills = manifesto.sources.filter(linha => linha[0].startsWith("brand.skill/"));
    assert.deepEqual(skills.map(linha => linha[0]), [`brand.skill/${skillV2}`], "o rascunho mais novo é o corrente, como no dono");
    assert.equal(skills[0][2], "draft", "o status do rascunho vai junto");
  });
});

test("contexto da Marca · BrandDNA e Skills em consultas separadas; passar do teto é declarado, nunca cortado em silêncio", async () => {
  reiniciar("pendente");
  await readWriterEvidenceManifest(contexto(), documentId);
  const daMarca = registros.filter(registro => registro.table === "editorial_artifact_versions" && ["eq.brand_dna", "eq.brand_skill"].includes(registro.params.get("artifact_type") ?? ""));
  assert.deepEqual(daMarca.map(registro => registro.params.get("artifact_type")).sort(), ["eq.brand_dna", "eq.brand_skill"]);
  assert.ok(daMarca.every(registro => registro.params.get("limit") === "101" && registro.params.get("marca_id") === `eq.${brandA}`));
  assert.ok(!registros.some(registro => (registro.params.get("artifact_type") ?? "").startsWith("in.")), "os dois tipos não disputam o mesmo corte");

  await comBancoAlterado(atual => {
    for (let versao = 1; versao <= 101; versao += 1) {
      const numero = String(versao).padStart(3, "0");
      atual.editorial_artifact_versions.push(
        { version_id: `massa-${numero}`, entity_id: "skill:massa", marca_id: brandA, artifact_type: "brand_skill", version_number: versao, status: "draft", content_hash: HASH("m"), created_at: "2026-09-01T10:00:00+00:00", payload: null },
        { version_id: `dna-${numero}`, entity_id: `brand:${brandA}`, marca_id: brandA, artifact_type: "brand_dna", version_number: versao, status: "draft", content_hash: HASH("n"), created_at: "2026-09-01T10:00:00+00:00", payload: null },
      );
    }
  }, async () => {
    reiniciar("pendente");
    const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
    assert.ok(writerEvidenceJsonBytes(manifesto) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes);
    const ausentes = new Map(manifesto.absent.map(([chave, , motivo]) => [chave, motivo]));
    assert.match(ausentes.get("brand.skill/*") ?? "", /mais de 100 versões de Skill/);
    assert.match(ausentes.get("dna.brand/current") ?? "", /100 versões mais novas/);
    const eventos = registros.filter(registro => registro.table === "editorial_version_status_events");
    assert.ok(eventos.every(registro => listaDoIn((registro.params.get("version_id") ?? "in.()").slice(3)).length <= 100), "eventos só das versões lidas");
  });
});

test("limites · o teto pedido chega ao envelope e o limite de itens chega às leituras (RPC, catálogo e publicações)", async () => {
  reiniciar("aplicada");
  for (const [maxBytes, fields] of [[8_192, ["url"]], [undefined, ["url", "anchor"]]] as const) {
    const pagina = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.externalSources#observedLinks", limit: 200, maxBytes, fields: [...fields] }));
    const teto = maxBytes ?? WRITER_EVIDENCE_LIMITS.sliceDefaultBytes;
    assert.ok(writerEvidenceJsonBytes(pagina) <= teto, `${writerEvidenceJsonBytes(pagina)} B com teto ${teto}`);
    assert.ok((pagina.data as unknown[]).length > 50, "muitos itens pequenos na mesma página");
    assert.ok(pagina.page?.next, "o que não coube continua no cursor");
  }
  registros.length = 0;
  await readWriterEvidence(contexto(), documentId, { sourceKey: "run.youtube.universe", limit: 100_000 });
  await readWriterEvidence(contexto(), documentId, { sourceKey: "radar.bundle.observed.questions", limit: 100_000, maxBytes: 1e9 });
  const rpc = registros.filter(registro => registro.table === "rpc/writer_evidence_slice");
  assert.ok(rpc.length >= 2);
  assert.ok(rpc.every(registro => Number(registro.body?.p_limit) <= 200 && Number(registro.body?.p_max_bytes) <= 32_768), JSON.stringify(rpc.map(registro => [registro.body?.p_limit, registro.body?.p_max_bytes])));

  reiniciar("pendente");
  for (const [sourceKey, tabela] of [["brand.site.catalog", "brand_site_catalog_entries"], ["publication.brand", "publication_records"]] as const) {
    registros.length = 0;
    const dez = envelope(await readWriterEvidence(contexto(), documentId, { sourceKey, limit: 10 }));
    const lida = registros.filter(registro => registro.table === tabela);
    assert.equal(lida.length, 1, sourceKey);
    assert.equal(lida[0].params.get("limit"), "10", `${sourceKey}: o limite pedido chega à consulta`);
    assert.ok((dez.data as unknown[]).length <= 10);
    registros.length = 0;
    await readWriterEvidence(contexto(), documentId, { sourceKey, limit: 100_000 });
    const grande = registros.find(registro => registro.table === tabela)!;
    assert.ok(Number(grande.params.get("limit")) <= 200, `${sourceKey}: limite de ${grande.params.get("limit")} linhas`);
  }
  conferirMarca(brandA);
});

/* ============ etapa B2 · o mesmo falso, para os consumidores do leitor ============ */

/** `true`: a tabela de divergências existe (migration aplicada), vazia; `false`: PGRST205. */
function prepararDivergencias(aplicada: boolean) {
  divergenciasAplicadas = aplicada;
  banco.writer_evidence_divergences = [];
}

const tabelasDoFalso = () => banco;

export {
  articleId, articleVersion, atorMcp, brandA, brandB, bundleGoogle, cliente, conferirFormaDaLeitura, conferirMarca, contexto,
  documentId, documentoV2, documentV1, documentYoutube, erroDe, grantAtivo, grantOutraMarca, grantSoLeitura, kw1, kw2,
  prepararDivergencias, registros, reiniciar, skillVersion, tabelasDoFalso,
};
