import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import { buildRadarPortableExportRow, radarPortableExportCsv, type RadarPortableExportRow } from "../lib/radar/portable-export.ts";
import { radarPortableSpecialistContext, radarPortableVideoContext } from "../lib/radar/portable-annex-context.ts";
import { buildRadarSpecialistEvidenceLayer, type RadarSpecialistEvidenceLayer } from "../lib/radar/specialist-evidence.ts";
import { buildRadarVideoEvidenceLayer, type RadarVideoEvidenceLayer } from "../lib/radar/video-evidence.ts";
import { radarSpecialistExtraction } from "../lib/radar/specialist-contribution-review.ts";
import { radarPortableAltText } from "../lib/radar/portable-identity.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarEditorialProfileModel } from "../lib/radar/editorial-profile-model.ts";

/*
 * ===== RADAR_PORTABLE_EXPORT_1.2 · CONTEXTO COMPLETO DE ESCRITA =====
 *
 * ==================== A PERGUNTA QUE ESTA SUÍTE FAZ ====================
 *
 * "Se o banco do Minerador Key ficasse inacessível depois da exportação, este
 * dossiê ainda teria contexto editorial suficiente para redigir o conteúdo
 * corretamente?" (§19)
 *
 * O 1.1 entregou a SÍNTESE. O 1.2 acrescenta o EVIDENCE PACK — e §1 é explícito:
 * não se escolhe entre resumo e evidência, precisamos dos dois.
 *
 * COMPLETUDE NÃO É RAW (§20): o pack leva evidência JÁ NORMALIZADA, nunca o
 * payload do provider, HTML de concorrente ou identificador privado.
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ==================== a bancada do Google: uma investigação real ==================== */

const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
});

const PAGINAS = Array.from({ length: 12 }, (_, indice) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (indice < 9) headings.push("Por que a pele fica oleosa?");
  if (indice < 8) headings.push("Rotina de cuidados para pele oleosa");
  return pagina(`A${indice}`, headings);
});

const contextoDoGoogle = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [
    {
      identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
      strategy: { volume: 720, resultCount: 41000, kgrScore: 0.589, incrementalVolume: null, normalizedIntent: "unknown", coveredIntentions: ["informacional", "unknown"], strategicContribution: "Abre o território de skincare para pele oleosa.", purpose: "Responder a dúvida de entrada.", overlapRisk: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU", semanticState: "QUALIFIED" } },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    },
    {
      identity: { keywordId: "kw2", text: "cuidados pele oleosa", role: "secundaria" },
      strategy: { volume: 210, resultCount: null, kgrScore: null, incrementalVolume: 190, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: "Cobre a faceta de rotina.", purpose: null, overlapRisk: null, semanticQualification: null },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    },
  ],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "g1", graphVersionId: "gv1", graphContentHash: "gh1",
    edges: [{
      sourceNodeId: "a1", targetNodeId: "a9", relationType: "SUPPORTS",
      anchorConcepts: ["rotina de skincare"], reason: "O pilar recebe apoio deste suporte.",
      priority: "HIGH", direction: "outbound",
    }],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const vistaDoGoogle = () => buildRadarDeepResearchView({
  context: contextoDoGoogle(),
  snapshot: { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-10T12:00:00.000Z",
});

const vistaCompetitiva = () => radarCompetitiveBlueprintViewOfAnalysis({
  profile: "GOOGLE", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash",
  frozen: null, liveBlueprint: null, liveMultimodal: null, primaryKeyword: "skincare para pele oleosa",
  googleObserved: vistaDoGoogle().observed,
  googleFrozenAt: "2026-09-10T13:00:00.000Z",
  serpSnapshotId: "serp-9",
  generatedAt: "2026-09-17T12:00:00.000Z",
});

/* ==================== os anexos: as CAMADAS CANÔNICAS ==================== */

/*
 * ===== PARITY_1 · §13 · A BANCADA MONTA O QUE O PLANEJADOR RECEBE =====
 *
 * Até o 1.2 esta suíte construía a projeção portátil direto. Isso escondia a
 * divergência que este gate fecha: a projeção existia sem que a camada canônica
 * existisse, e era exatamente por isso que o Planejador recebia `null`.
 *
 * Agora a bancada monta as camadas do bundle V3, e a projeção é derivada delas.
 */

const CONTRIBUICAO = "Na prática, quem tem pele oleosa não precisa evitar hidratante: precisa escolher um de textura leve, sem óleo.";

const camadaDoEspecialista = (): RadarSpecialistEvidenceLayer => buildRadarSpecialistEvidenceLayer({
  binding: { brandId: "b", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash" },
  preparedRequirements: 3,
  sources: [
    {
      extraction: radarSpecialistExtraction({
        contributionId: "c1", expertId: "e1", briefId: "bf1",
        requirementId: "req-1", requirementKind: "CLAIM",
        requirementQuestion: "Por que a pele fica oleosa?",
        sourceType: "TEXT",
        originalText: `${CONTRIBUICAO} Vejo isso todo dia no consultório.`,
        transcriptText: null,
        /* §4 · o canal não atravessa: os três campos entram nulos na ORIGEM. */
        externalUpdateId: null, originalAssetUri: null, checksum: null,
        receivedAt: "2026-09-16T10:00:00.000Z",
        decision: "ACCEPTED_EVIDENCE",
        classification: "EXPERIENCIA_PRATICA",
      }),
      requirementQuestion: "Pele oleosa precisa de hidratante?",
      requirementKind: "CLAIM",
      sentQuestions: ["Pele oleosa precisa de hidratante?", "Que textura você recomenda?"],
      expertDisplayName: null,
    },
    /* Uma aguardando decisão e duas recusadas — §14 · a ausência é contada. */
    ...["p1"].map(id => ({
      extraction: radarSpecialistExtraction({
        contributionId: id, expertId: "e1", briefId: "bf1", requirementId: "req-2",
        sourceType: "TEXT", originalText: "Ainda vou responder.", transcriptText: null,
        externalUpdateId: null, originalAssetUri: null, checksum: null,
        receivedAt: "2026-09-16T11:00:00.000Z", decision: "NOT_APPROVED",
      }),
      requirementQuestion: "Outro ponto", requirementKind: "CLAIM",
      sentQuestions: [], expertDisplayName: null,
    })),
    ...["r1", "r2"].map(id => ({
      extraction: radarSpecialistExtraction({
        contributionId: id, expertId: "e1", briefId: "bf1", requirementId: "req-3",
        sourceType: "TEXT", originalText: "Fora do assunto.", transcriptText: null,
        externalUpdateId: null, originalAssetUri: null, checksum: null,
        receivedAt: "2026-09-16T12:00:00.000Z", decision: "REJECTED",
      }),
      requirementQuestion: "Terceiro ponto", requirementKind: "CLAIM",
      sentQuestions: [], expertDisplayName: null,
    })),
  ],
});

const TRECHO_DE_VIDEO = "A ordem certa é limpeza, depois o ativo, e o hidratante por último.";

const camadaDeVideo = (): RadarVideoEvidenceLayer => buildRadarVideoEvidenceLayer({
  identity: {
    frozenBundleId: "fb1", frozenBundleHash: "sha256:fb1",
    matchingRunId: "run-1", inputFingerprint: "m4:vs1@v1",
    matcherVersion: 4, matchedAt: "2026-09-16T13:00:00.000Z",
  },
  briefs: [{
    briefId: "vb1", topic: "Ordem da rotina noturna",
    narrativePurpose: "Mostrar a sequência correta.",
    whatToLookFor: ["ordem dos passos", "tempo de espera"],
    relatedSectionId: "sec-1",
    relatedSectionTitle: "Rotina de cuidados para pele oleosa",
    questions: [], entities: [], evidenceNeeded: "Sequência declarada em vídeo.", priority: "HIGH",
  }],
  coverage: [{
    videoBriefId: "vb1", state: "PARTIAL",
    reason: "Um trecho cobre a ordem; o tempo de espera não apareceu.",
    criteria: ["ordem dos passos", "tempo de espera"],
    matchedCriteria: ["ordem dos passos"], missingCriteria: ["tempo de espera"],
    usefulSourceIds: ["vs1"],
    extracts: [{
      videoBriefId: "vb1", videoSourceId: "vs1",
      segmentIndexes: [12, 13], startMs: 62000, endMs: 79000,
      originalText: TRECHO_DE_VIDEO,
      sourceLanguage: "pt-BR",
      reasonForRelevance: "Enuncia a sequência que a pauta pediu.",
      matchedCriteria: ["ordem dos passos"], answersTitle: true,
      matchedQuestions: [], matchedEntities: [],
      supportType: "COVERS_TOPIC", confidence: 0.82, limitations: [],
      provenance: { processingVersion: 1, anchoredToSegments: true },
    }],
  }],
  sources: [{ videoSourceId: "vs1", displayName: "Rotina noturna explicada", languageCode: "pt-BR", processingVersion: 1 }],
});

const especialistaCheio = () => radarPortableSpecialistContext(camadaDoEspecialista());
const videoCheio = () => radarPortableVideoContext(camadaDeVideo());

/* ============================== as três linhas ============================== */

const linhaDoGoogle = (patch: Record<string, unknown> = {}): RadarPortableExportRow => {
  const vista = vistaDoGoogle();
  return buildRadarPortableExportRow({
    profile: "GOOGLE",
    blueprintView: vistaCompetitiva(),
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "skincare para pele oleosa",
      secondaryKeywords: ["cuidados pele oleosa"],
      narrativeReinforcements: [],
      intent: "Informacional",
      funnel: "Topo",
      siloName: "skincare",
      articleRole: "SUPORTE",
      slug: "skincare-pele-oleosa",
      canonical: "https://marca.com.br/skincare-pele-oleosa",
      contentType: "article",
      audience: "Quem convive com oleosidade e não sabe por onde começar.",
      promise: "Skincare para pele oleosa",
      mustCover: ["identificação da pele oleosa"],
    },
    articleModel: vista.articleModel,
    googleObserved: vista.observed,
    researchContext: contextoDoGoogle(),
    videoContext: videoCheio(),
    specialistContext: especialistaCheio(),
    researchLimitations: vista.observed.limitations,
    ...patch,
  });
};

const modeloDePerfil = (patch: Partial<RadarEditorialProfileModel> = {}): RadarEditorialProfileModel => ({
  kind: "COMMERCIAL", profile: "AMAZON",
  articleIdentity: { articleId: "a2", articleDnaVersionId: "d2", principalKeyword: "skin care nivea", intentLabel: "Investigação comercial", siloRole: "SUPORTE" },
  editorialOutput: "TOP_VALUE",
  workingTitle: "Os 6 skin care nivea com melhor custo-benefício",
  alternateTitleDirections: [],
  objective: "Dar critério de escolha",
  promise: "Ao final, o leitor sabe o que se ganha em cada faixa.",
  hook: null,
  blocks: [{
    id: "b1", order: 1, heading: "Como avaliamos custo-benefício",
    objective: "Explicar a relação preço/reputação.",
    coveragePoints: ["relação entre preço e nota"],
    function: "Bloco comercial", evidenceStrength: "MODERATE",
    mustCoverReasons: [], sourceNeeded: null, specialistRequired: null, visualOpportunity: null,
    sourceSignal: "Bandas derivadas do universo observado.",
  }],
  conclusion: "Fechar indicando o que compensa.", cta: "Comparar antes de decidir",
  derived: [], derivedLabel: "Candidatos selecionados",
  articleApplication: [], seoApplication: [], evidenceNeeds: [], specialistNeeds: [],
  limitations: ["Benefícios e atributos do PDP não foram lidos nesta investigação."],
  readiness: { state: "READY", label: "Pronto", reasons: [] },
  promotionLinks: [{
    asin: "B0DBRR5BP4", productName: "NIVEA Q10 Sérum",
    amazonUrl: "https://www.amazon.com.br/dp/B0DBRR5BP4",
    suggestedAnchor: "NIVEA Q10 Sérum", suggestedButtonLabel: "Ver preço na Amazon",
    placement: "Na posição 1 da lista.", linkFormat: "BUTTON",
    affiliateReady: true, relPolicy: "sponsored nofollow",
  }],
  affiliateDisclosureRequired: true,
  comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
  shortlistStatus: { state: "OK", desired: 6, available: 6, message: null, fixHint: null },
  ...patch,
} as RadarEditorialProfileModel);

const UNIVERSO_AMAZON = [{
  asin: "B0DBRR5BP4", title: "NIVEA Q10 Sérum Antissinais", url: "https://www.amazon.com.br/dp/B0DBRR5BP4?ref=sspa_dk&dib=xyz",
  imageUrl: null, domain: "www.amazon.com.br",
  priceFrom: 59.9, currency: "BRL", offerText: ["R$ 10,00 off"],
  ratingValue: 4.8, ratingVotes: 835, ratingMax: 5,
  isAmazonChoice: true, isBestSeller: false, boughtPastMonth: 500,
  deliveryMessage: null,
  placements: ["organic"], bestOrganicRank: 1, bestSponsoredRank: null,
  occurrences: [], queriesFoundIn: ["q1"], occurrenceCount: 1,
}] as never;

const SETUP_AMAZON = {
  intent: { type: "TOP_VALUE", desiredCount: 6, useCase: null, rankingCriteria: "melhor custo-benefício" },
  target: { type: "CATEGORY", categoryQuery: "skin care nivea", productClass: "sérum", brandFilter: "nivea", brand: null, line: null, products: [] },
  declaredAt: "2026-09-16T10:00:00.000Z", declaredBy: "user-1",
} as never;

const linhaDaAmazon = (patch: Record<string, unknown> = {}): RadarPortableExportRow =>
  buildRadarPortableExportRow({
    profile: "AMAZON",
    blueprintView: { blueprint: null, sample: { label: "produto(s)", count: 59 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "skin care nivea", secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Investigação comercial", funnel: "Meio", siloName: "skincare", articleRole: "SUPORTE",
      slug: "skin-care-nivea", mustCover: [],
    },
    profileModel: modeloDePerfil(),
    amazon: { setup: SETUP_AMAZON, universe: UNIVERSO_AMAZON },
    commercial: {
      setup: SETUP_AMAZON,
      counts: { observed: 59, eligible: 9, shortlist: 6 },
      products: modeloDePerfil().promotionLinks.map(item => ({ asin: item.asin, productName: item.productName })),
      links: modeloDePerfil().promotionLinks,
      comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
      disclosureRequired: true,
      shortlistStatus: { state: "OK", desired: 6, available: 6, message: null, fixHint: null },
    },
    researchLimitations: ["A coleta da prateleira não traz texto de avaliação."],
    ...patch,
  });

const VIDEOS_YOUTUBE = Array.from({ length: 38 }, (_, indice) => ({
  videoId: `vid${indice}`, url: `https://www.youtube.com/watch?v=vid${indice}`,
  title: `Skin care noturno ${indice}`, channelName: `Canal ${indice % 5}`, channelId: null, channelUrl: null, channelLogo: null,
  publishedAt: "2026-05-01", publishedAtLabel: "há 4 meses",
  durationSeconds: 600, durationLabel: "10:00", views: 1000 + indice, description: null, thumbnailUrl: null,
  isShorts: indice % 7 === 0, isLive: false, isMovie: false, badges: [],
  queriesFoundIn: ["q1"], bestRank: indice + 1,
  allRanks: [{ queryId: "q1", rank: indice + 1 }], occurrenceCount: 1,
  universeClass: "COMPARABLE", universeReason: "Vídeo comparável da consulta canônica.",
})) as never;

const linhaDoYoutube = (patch: Record<string, unknown> = {}): RadarPortableExportRow =>
  buildRadarPortableExportRow({
    profile: "YOUTUBE",
    blueprintView: { blueprint: null, sample: { label: "vídeo(s)", count: 38 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "skin care noturno", secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Informacional", funnel: "Topo", siloName: "skincare", articleRole: "SUPORTE",
      slug: "skin-care-noturno", mustCover: ["ordem da rotina noturna"],
    },
    profileModel: modeloDePerfil({
      kind: "VIDEO", profile: "YOUTUBE",
      workingTitle: "Skin care noturno: a ordem que evita irritação",
      promise: "Ao final, o espectador sabe a ordem certa dos passos.",
      hook: "Abra pela dúvida de quem já tem produto em casa.",
      promotionLinks: [], affiliateDisclosureRequired: false,
    }),
    youtubeUniverse: VIDEOS_YOUTUBE,
    videoContext: videoCheio(),
    researchLimitations: [],
    ...patch,
  });

/* ================================ §28 ================================ */

const NOVAS = [
  "keywords_dna_json", "keywords_context_md",
  "serp_evidence_json", "serp_sources_json", "section_evidence_json",
  "video_context_json", "video_context_md",
  "specialist_context_json", "specialist_context_md",
  "external_sources_json", "internal_links_resolved_json",
  "writer_context_md",
  "article_identity_json", "article_identity_md",
  "seo_metadata_json", "seo_metadata_md",
  "visual_identity_md", "visual_plan_md",
  "cover_image_plan_json", "respite_images_plan_json", "visual_evidence_json",
];

test("§28 · as colunas do contexto completo existem em todo perfil", () => {
  for (const [perfil, linha] of [["GOOGLE", linhaDoGoogle()], ["YOUTUBE", linhaDoYoutube()], ["AMAZON", linhaDaAmazon()]] as const) {
    for (const coluna of NOVAS) {
      assert.ok(coluna in linha, `§28 · ${perfil} sem a coluna ${coluna}`);
    }
  }

  /* E as colunas condicionais aparecem só onde a evidência existe. */
  assert.ok("video_evidence_json" in linhaDoYoutube(), "§8 · o perfil de vídeo sem a evidência da SERP de vídeo");
  assert.equal("video_evidence_json" in linhaDoGoogle(), false, "§8 · evidência de YouTube num artigo de texto");
  assert.ok("amazon_evidence_json" in linhaDaAmazon());
  assert.equal("amazon_evidence_json" in linhaDoGoogle(), false);
});

/* ============================== §2, §3 e §4 ============================== */

test("§3 e §4 · o DNA das keywords carrega o que a autoridade tem, e nada mais", () => {
  const keywords = JSON.parse(linhaDoGoogle().keywords_dna_json);
  assert.equal(keywords.length, 2);

  const principal = keywords.find((item: { isPrincipal: boolean }) => item.isPrincipal);
  assert.ok(principal, "§3 · a keyword principal não está marcada");
  assert.equal(principal.keyword, "skincare para pele oleosa");
  assert.equal(principal.role, "PRIMARY");
  assert.equal(principal.volume, 720);
  assert.equal(principal.kgrScore, 0.589);
  assert.equal(principal.resultCount, 41000);
  assert.equal(principal.intent, "informacional");

  /*
   * §3 · O SENTINELA DA AUTORIDADE NÃO ATRAVESSA.
   *
   * `coveredIntentions` trazia "unknown" junto de "informacional". Exportá-lo
   * faria uma ferramenta externa tratar "desconhecida" como uma intenção que o
   * artigo cobre.
   */
  assert.deepEqual(principal.conclusiveIntentions, ["informacional"]);

  /* §3 · e nenhuma métrica inventada: `competition` não existe upstream. */
  assert.equal("competition" in principal, false, "§3 · métrica que ninguém mediu");
  assert.equal(/keywordId|versionId|contentHash/.test(JSON.stringify(keywords)), false, "§2 · id técnico no DNA das keywords");

  /* §4 · e o mesmo dado em prosa, com a instrução de uso. */
  const md = linhaDoGoogle().keywords_context_md;
  assert.match(md, /^# Keywords/);
  assert.match(md, /## Principal/);
  assert.match(md, /## Secundárias/);
  assert.match(md, /Como usar: é a keyword do artigo/);
  assert.ok(md.includes("720 busca(s)/mês"));
});

/* ============================ §5, §6 e §7 ============================ */

test("§5 e §6 · a evidência da SERP chega inteira e normalizada", () => {
  const pack = JSON.parse(linhaDoGoogle().serp_evidence_json);

  assert.ok(pack.sample.comparablePages > 0, "§6 · páginas comparáveis");
  assert.ok(pack.queries.length > 0, "§6 · consultas realizadas");
  assert.ok(pack.concepts.length > 0, "§6 · conceitos recorrentes");
  assert.ok(pack.questions.length > 0, "§6 · perguntas observadas");
  assert.ok(pack.structuralPatterns.length > 0, "§6 · padrões de headings");
  assert.ok(pack.gaps.length > 0, "§6 · lacunas");
  assert.ok(pack.editorialCandidates.length > 0, "§26 · candidatos referenciáveis");
  assert.ok(pack.intent.declared || pack.intent.observedInSerp, "§6 · intenção");
  assert.ok(pack.sufficiency.level, "§6 · suficiência");

  /* §7 · as fontes competitivas, com endereço e sem conteúdo. */
  const fontes = JSON.parse(linhaDoGoogle().serp_sources_json);
  assert.ok(fontes.length > 0);
  assert.equal(fontes[0].type, "WEB_PAGE");
  assert.ok(fontes[0].url.startsWith("https://"));
  assert.ok(["COMPARABLE", "REFERENCE", "SUPPORT"].includes(fontes[0].role));
});

test("§20 · completude não é raw — nada do provider atravessa", () => {
  const csv = radarPortableExportCsv([linhaDoGoogle(), linhaDoYoutube(), linhaDaAmazon()]);

  /*
   * A LINHA QUE SEPARA O 1.2 DE UM BACKUP.
   *
   * Evidência normalizada: "o Google encontrou a pergunta X"; "10 de 10 páginas
   * usam imagem". Raw: o JSON do endpoint, com `check_url`, `se_results_count`
   * e o rastro de clique da Amazon.
   */
  for (const proibido of ["status_code", "<html", "se_results_count", "check_url", "items_count", "sspa/click", "dib=", "?ref=sspa"]) {
    assert.equal(csv.includes(proibido), false, `§20 · payload cru no CSV: ${proibido}`);
  }

  /* E o texto integral de concorrente continua fora. */
  assert.equal(csv.includes("Na prática, testamos a rotina por oito semanas"), false, "§7 · introdução de concorrente exportada");
});

/* ================================ §12 e §26 ================================ */

test("§12 e §26 · toda evidência do blueprint é alcançável, e ela sabe a que seção pertence", () => {
  const linha = linhaDoGoogle();
  const secoes = JSON.parse(linha.section_evidence_json);
  const pack = JSON.parse(linha.serp_evidence_json);

  assert.ok(secoes.length > 0, "§12 · nenhuma seção com evidência");
  assert.ok(secoes.some((item: { serpEvidence: string[] }) => item.serpEvidence.length > 0), "§12 · nenhuma seção resolveu evidência");

  /*
   * ===== §26 · NENHUMA DECISÃO EDITORIAL FICA SEM CONTEXTO =====
   *
   * O blueprint referencia os candidatos por id INTERNO. Para fora, a relação
   * atravessa pelo RÓTULO observado — e ele precisa existir no pack, senão quem
   * consome encontra uma seção que diz "sustentada por evidência" e não tem
   * como ver qual.
   */
  const alcancaveis = new Set(pack.editorialCandidates.map((item: { observedLabel: string }) => item.observedLabel));
  const referenciados = secoes.flatMap((item: { evidenceLabels: string[] }) => item.evidenceLabels ?? []);
  assert.ok(referenciados.length > 0, "§26 · a bancada precisa referenciar evidência");
  for (const rotulo of referenciados) {
    assert.equal(typeof rotulo, "string", "§26 · a seção referenciou algo que não é rótulo");
    assert.ok(alcancaveis.has(rotulo), `§26 · rótulo inalcançável no dossiê: ${rotulo}`);
  }

  /* §12 · e vídeo e especialista entram pela seção que eles sustentam. */
  const comVideo = secoes.find((item: { videoEvidence: string[] }) => item.videoEvidence.length > 0);
  assert.ok(comVideo, "§12 · o trecho de vídeo não chegou a nenhuma seção");
  assert.ok(comVideo.videoEvidence[0].includes(TRECHO_DE_VIDEO));

  const comEspecialista = secoes.find((item: { specialistEvidence: string[] }) => item.specialistEvidence.length > 0);
  assert.ok(comEspecialista, "§12 · a contribuição não chegou a nenhuma seção");
  assert.match(comEspecialista.section, /oleosa/, "§12 · a contribuição caiu na seção errada");

  /*
   * ===== O ASSUNTO DO ARTIGO NÃO CASA COM SEÇÃO NENHUMA =====
   *
   * "pele oleosa" está em todo cabeçalho deste artigo. Uma contribuição que só
   * nomeia o assunto não diz onde se aplica — e pendurá-la na primeira seção
   * seria decidir editorialmente no lugar de quem escreve.
   */
  const generica = JSON.parse(linhaDoGoogle({
    specialistContext: radarPortableSpecialistContext(buildRadarSpecialistEvidenceLayer({
      binding: { brandId: "b", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash" },
      preparedRequirements: 1,
      sources: [{
        extraction: radarSpecialistExtraction({
          contributionId: "c9", expertId: "e1", briefId: "bf9", requirementId: "req-9",
          sourceType: "TEXT", originalText: "Uma observação geral.", transcriptText: null,
          externalUpdateId: null, originalAssetUri: null, checksum: null,
          receivedAt: "2026-09-16T10:00:00.000Z", decision: "ACCEPTED_EVIDENCE",
        }),
        requirementQuestion: "Sobre pele oleosa", requirementKind: "CLAIM",
        sentQuestions: [], expertDisplayName: null,
      }],
    })),
  }).section_evidence_json);

  assert.equal(
    generica.some((item: { specialistEvidence: string[] }) => item.specialistEvidence.length > 0),
    false,
    "§12 · uma contribuição que só nomeia o assunto foi pendurada numa seção",
  );
});

/* ================================ §13 e §14 ================================ */

test("§13 · o destino do link interno é o nome da página, nunca o id do nó", () => {
  const linha = linhaDoGoogle();

  /*
   * `article:article-candidate:territory:…` não vira `href` e não diz de que
   * artigo se trata. Quem escreve precisa do NOME.
   */
  assert.equal(/article:article-candidate|:territory:/.test(linha.internal_links_resolved_json), false);
  assert.equal(/article:article-candidate|:territory:/.test(linha.internal_links_md), false);

  const links = JSON.parse(linha.internal_links_resolved_json);
  assert.ok(links.length > 0, "§13 · a bancada tem grafo interno e nenhum link atravessou");

  /*
   * O DESTINO SAI DO VOCABULÁRIO DO GRAFO, NÃO DO ENDEREÇAMENTO DELE.
   *
   * A relação da bancada aponta para um nó cujo conceito de âncora aprovado é
   * "rotina de skincare". O identificador daquele nó — `a9` — é como o sistema
   * encontra a página, e não diz a ninguém que página é.
   */
  assert.match(links[0].targetTitle, /rotina/i,
    `§13 · o destino não veio do vocabulário do grafo: ${links[0].targetTitle}`);

  for (const item of links) {
    assert.equal(/^article:|:territory:/.test(item.targetTitle), false,
      `§13 · o destino saiu como id do nó: ${item.targetTitle}`);
    assert.ok("targetTitle" in item && "relationship" in item && "suggestedAnchor" in item && "placement" in item);
    /* §13 · quando a página ainda não existe, isso é dito — não inventado. */
    if (!item.targetUrl) assert.equal(item.targetPublished, false);
  }
});

test("§14 · as fontes externas saem separadas das competitivas", () => {
  const externas = JSON.parse(linhaDoGoogle().external_sources_json);

  /*
   * A AMOSTRA CITA A AAD DENTRO DO CONTEÚDO — é uma candidata a evidência.
   *
   * Lê-la de `observedLinks` traria menu e rodapé junto; lê-la de
   * `commercialLinks` não traria nada. O que serve a quem escreve é a citação
   * feita no corpo do texto, com âncora e seção.
   */
  assert.ok(externas.length > 0, "§14 · nenhuma fonte externa atravessou");
  assert.ok(externas.some((item: { domain: string }) => item.domain === "www.aad.org"),
    "§14 · a fonte citada pela amostra não chegou ao dossiê");

  for (const item of externas) {
    assert.ok(item.url.startsWith("http"), "§14 · fonte externa sem endereço");
    assert.ok("authorityClass" in item && "supports" in item);
  }
  assert.match(linhaDoGoogle().writer_context_md, /# FONTES/);
});

/* ================================ §8 e §9 ================================ */

test("§8 · os 38 vídeos da pesquisa chegam ao pack — e nada afirma o conteúdo deles", () => {
  const pack = JSON.parse(linhaDoYoutube().video_evidence_json);

  assert.equal(pack.videos.length, 38, "§23 · os 38 vídeos precisam estar representados");
  assert.ok(pack.videos[0].videoId && pack.videos[0].url && pack.videos[0].title);
  assert.ok(pack.videos[0].observedSignals.length > 0);

  /*
   * §8 · O QUE A COLETA OBSERVA É A BUSCA, e a limitação viaja junto.
   *
   * Sem esta frase, "padrão de título" seria lido como observação sobre o que
   * os vídeos ensinam — e nenhum deles foi assistido.
   */
  assert.ok(pack.limitations.some((item: string) => /assistido ou transcrito/.test(item)), "§8 · falta a limitação SERP-only");
  for (const sinal of pack.videos.flatMap((item: { observedSignals: string[] }) => item.observedSignals)) {
    assert.equal(/ensina|explica que|afirma que/.test(sinal), false, `§8 · sinal afirma conteúdo de vídeo: ${sinal}`);
  }
});

test("§9 · a biblioteca de vídeos é outra coisa, e ela vem com trechos ancorados", () => {
  const linha = linhaDoYoutube();
  const biblioteca = JSON.parse(linha.video_context_json);
  const pesquisa = JSON.parse(linha.video_evidence_json);

  /* As duas não se confundem: uma tem conteúdo, a outra só a busca. */
  assert.equal(biblioteca.state, "MATCHED");
  assert.equal(biblioteca.briefs[0].extracts[0].text, TRECHO_DE_VIDEO);
  assert.equal(biblioteca.briefs[0].extracts[0].startLabel, "01:02");
  assert.equal(pesquisa.videos.some((item: { title: string }) => item.title === TRECHO_DE_VIDEO), false);

  assert.match(linha.video_context_md, /# Vídeos da biblioteca/);
  assert.ok(linha.video_context_md.includes(TRECHO_DE_VIDEO));
  /* E a pauta parcialmente coberta declara o que falta. */
  assert.match(linha.video_context_md, /Ainda não encontrado:/);
});

test("§25 · o contexto de vídeo leva conteúdo editorial, e nenhum identificador de máquina", () => {
  const linha = linhaDoYoutube();
  const tudo = `${linha.video_context_json} ${linha.video_context_md}`;

  assert.ok(tudo.includes(TRECHO_DE_VIDEO), "§25 · o conteúdo editorial precisa aparecer");
  for (const proibido of ["vs1", "videoSourceId", "gs://", "processingVersion", "jobId", "worker", "segmentIndexes", "briefId"]) {
    assert.equal(tudo.includes(proibido), false, `§25 · identificador de máquina no contexto de vídeo: ${proibido}`);
  }
});

/* ================================ §10, §11 e §24 ================================ */

test("§10 · o especialista chega com pergunta, resposta, aplicação e estado", () => {
  const linha = linhaDoGoogle();
  const contexto = JSON.parse(linha.specialist_context_json);

  assert.equal(contexto.state, "RECEIVED");
  assert.equal(contexto.items[0].requirementQuestion, "Pele oleosa precisa de hidratante?");
  assert.ok(contexto.items[0].contribution.includes("textura leve"));
  assert.ok(contexto.items[0].appliesTo);
  assert.equal(contexto.items[0].status, "Aceita como evidência");

  /* §22 · o que voltou e não virou evidência é DECLARADO, não omitido. */
  assert.equal(contexto.pending, 1);
  assert.equal(contexto.rejected, 2);
  assert.match(linha.specialist_context_md, /# Especialista/);
  assert.ok(linha.specialist_context_md.includes(CONTRIBUICAO));
  assert.match(linha.specialist_context_md, /1 resposta\(s\) aguardando decisão e 2 recusada\(s\)/);
});

test("§24 · nenhum identificador privado do especialista atravessa", async () => {
  const linha = linhaDoGoogle();
  const tudo = Object.values(linha).join(" ");

  for (const proibido of ["telegram", "chatId", "chat_id", "expertId", "externalUpdateId", "contributionId", "originalAssetUri", "checksum"]) {
    assert.equal(tudo.toLowerCase().includes(proibido.toLowerCase()), false, `§11 · identificador privado no dossiê: ${proibido}`);
  }

  /*
   * A TRAVA TAMBÉM É NA ORIGEM: o leitor do servidor não pode projetar o que a
   * linha promete não ter. Filtrar só na saída deixaria a próxima coluna nova
   * levar o campo junto sem ninguém notar.
   */
  const projecao = await readFile(new URL("../lib/radar/portable-annex-context.ts", import.meta.url), "utf8");
  const corpo = projecao.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  for (const proibido of ["expertId", "contributionId", "briefId", "externalUpdateId", "originalAssetUri", "checksum", "requirementId"]) {
    assert.equal(corpo.includes(proibido), false, `§11 · a projeção leva ${proibido}`);
  }

  /*
   * PARITY_1 · §4 · E O CANAL É OMITIDO NA ORIGEM, não filtrado na saída.
   *
   * A camada canônica é montada uma vez e alimenta o Planejador E o export. Se
   * o id da mensagem do Telegram entrasse nela, filtrá-lo só no CSV deixaria a
   * próxima projeção levá-lo junto sem ninguém notar.
   */
  const autoridades = await readFile(new URL("../lib/server/radar-canonical-authorities.ts", import.meta.url), "utf8");
  for (const campo of ["externalUpdateId: null", "originalAssetUri: null", "checksum: null"]) {
    assert.ok(autoridades.includes(campo), `§4 · a camada canônica não zera ${campo}`);
  }
});

test("§22 · ausência é declarada, e ela é distinguível de esquecimento", () => {
  const semAnexos = linhaDoGoogle({ videoContext: undefined, specialistContext: undefined });

  assert.match(semAnexos.specialist_context_md, /Nenhuma contribuição especializada recebida/);
  assert.match(semAnexos.video_context_md, /Nenhum vídeo da biblioteca foi selecionado/);
  assert.equal(JSON.parse(semAnexos.specialist_context_json).items.length, 0);
  assert.equal(JSON.parse(semAnexos.video_context_json).briefs.length, 0);

  /* E o contexto completo traduz a ausência em proibição. */
  assert.match(semAnexos.writer_context_md, /Não atribua opinião, recomendação ou ressalva a um profissional/);
  assert.match(semAnexos.writer_context_md, /Não cite trecho de vídeo/);
});

/* ================================ §16 e §17 ================================ */

test("§16 · a Amazon exporta a prateleira normalizada, e ela é evidência", () => {
  const pack = JSON.parse(linhaDaAmazon().amazon_evidence_json);

  assert.equal(pack.editorialIntent, "TOP_VALUE");
  assert.equal(pack.desiredCount, 6);
  assert.equal(pack.target.productClass, "sérum");
  assert.equal(pack.observedCount, 59);
  assert.equal(pack.eligibleCount, 9);
  assert.equal(pack.shortlistCount, 6);

  const produto = pack.products[0];
  assert.equal(produto.asin, "B0DBRR5BP4");
  assert.equal(produto.price, 59.9);
  assert.equal(produto.rating, 4.8);
  assert.equal(produto.votes, 835);
  assert.deepEqual(produto.badges, ["Amazon's Choice"]);
  assert.ok(produto.purchaseSignals.some((item: string) => item.includes("500")));

  /* §16 · a URL do produto sai LIMPA — o rastro de clique fica no provider. */
  assert.equal(produto.cleanUrl, "https://www.amazon.com.br/dp/B0DBRR5BP4");

  /* §17 · e os links promocionais continuam sem tag criada pelo Radar. */
  const links = JSON.parse(linhaDaAmazon().promotion_links_json);
  assert.equal(links.length, 1);
  assert.equal(links[0].relPolicy, "sponsored nofollow");
  assert.equal(/tag=|linkCode|ascsubtag/.test(linhaDaAmazon().promotion_links_json), false);
});

/* ================================ §18 e §27 ================================ */

test("§18 e §27 · o contexto completo é a célula que se cola em outra IA", () => {
  const contexto = linhaDoGoogle().writer_context_md;

  for (const secao of [
    /# IDENTIDADE DO ARTIGO/, /# METADADOS SEO/, /# ARTICLE DNA/, /# KEYWORD DNA/,
    /# BLUEPRINT/, /# RADIOGRAFIA COMPETITIVA/, /# EVIDÊNCIAS/, /# EVIDÊNCIA POR SEÇÃO/,
    /# FONTES/, /# LINKS INTERNOS/, /# PLANO VISUAL/, /# VÍDEOS/, /# ESPECIALISTA/,
    /# LIMITAÇÕES/, /# O QUE NÃO PODE SER AFIRMADO/, /# REGRAS DE REDAÇÃO/,
  ]) {
    assert.match(contexto, secao, `§18 · seção ausente do contexto completo: ${secao}`);
  }

  /* §27 · e o conteúdo, não só os títulos. */
  assert.ok(contexto.includes("skincare para pele oleosa"), "§27 · keyword principal");
  assert.ok(contexto.includes("identificação da pele oleosa"), "§27 · MUST_COVER");
  assert.ok(contexto.includes(CONTRIBUICAO), "§27 · a contribuição do especialista");
  assert.ok(contexto.includes(TRECHO_DE_VIDEO), "§27 · o trecho de vídeo");
  assert.ok(contexto.length > 6000, `§18 · contexto de ${contexto.length} caracteres não é o dossiê inteiro`);

  /* §27 · e o comercial entra quando existe. */
  assert.match(linhaDaAmazon().writer_context_md, /# COMERCIAL/);
  assert.ok(linhaDaAmazon().writer_context_md.includes("amazon.com.br/dp/B0DBRR5BP4"));
});

test("§18 · o brief continua condensado, e o contexto é que é completo", () => {
  const linha = linhaDoGoogle();
  /*
   * As duas colunas têm propósitos diferentes: uma cabe numa leitura, a outra
   * carrega a evidência atrás. Se o brief crescesse até o tamanho do contexto,
   * o gate 1.1 teria sido desfeito sem que ninguém percebesse.
   */
  assert.ok(linha.writer_brief_md.length < linha.writer_context_md.length,
    "§18 · o brief deixou de ser a decisão condensada");
});

/* ============================== ADDENDUM 1.2A ============================== */

test("A e B · o SEO metadata existe, e o H1 não vira o SEO title", () => {
  const seo = JSON.parse(linhaDoGoogle().seo_metadata_json);

  assert.ok(seo.h1, "A · sem H1 recomendado");
  assert.equal(seo.slug, "skincare-pele-oleosa");
  assert.equal(seo.canonical, "https://marca.com.br/skincare-pele-oleosa");

  /*
   * §3 do addendum · NÃO COLAPSAR OS DOIS.
   *
   * O Radar produz a formulação editorial (H1) e a DIREÇÃO de titulação. O
   * título de busca é decisão do Planejador — e preenchê-lo aqui faria a
   * decisão chegar tomada lá.
   */
  assert.equal(seo.seoTitle, null, "B · o SEO title foi inventado nesta fase");
  assert.ok(seo.seoTitleDirection, "B · falta a direção de titulação, que o Radar tem");
  assert.notEqual(seo.h1, seo.seoTitle);

  /* §4 · a meta description vem como direção, com o que ela precisa refletir. */
  assert.equal(seo.metaDescription, null);
  assert.ok(seo.metaDescriptionDirection.mustReflectIntent);
  assert.ok(seo.metaDescriptionDirection.constraints.length >= 2);

  /* §2 · e o que não existe é NOMEADO, para ninguém achar que sumiu. */
  assert.ok(seo.notDefinedAtThisStage.includes("metaDescription"));
  assert.match(linhaDoGoogle().seo_metadata_md, /Ainda não definidos nesta fase/);
});

test("C e D · slug e canonical protegidos saem marcados como travados", () => {
  const protegido = JSON.parse(linhaDoGoogle({
    article: {
      principalKeyword: "skincare para pele oleosa", secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Informacional", funnel: "Topo", siloName: "skincare", articleRole: "SUPORTE",
      slug: "skincare-pele-oleosa", canonical: "https://marca.com.br/skincare-pele-oleosa",
      publishedProtected: true, protectedFields: ["slug", "canonical"], mustCover: [],
    },
  }).seo_metadata_json);

  assert.equal(protegido.slugProtectionState, "PROTECTED");
  assert.equal(protegido.canonicalProtectionState, "PROTECTED");
  /* E o valor continua o que está no ar — não uma versão recalculada. */
  assert.equal(protegido.slug, "skincare-pele-oleosa");

  const livre = JSON.parse(linhaDoGoogle().seo_metadata_json);
  assert.equal(livre.slugProtectionState, "EDITABLE");
});

test("E, F, G e I · uma capa, dois a três respiros, nenhum em FAQ", () => {
  const linha = linhaDoGoogle();
  const capa = JSON.parse(linha.cover_image_plan_json);
  const respiros = JSON.parse(linha.respite_images_plan_json);

  /* E · a capa existe e ela representa a promessa. */
  assert.ok(capa, "E · sem plano de capa");
  assert.equal(capa.imageRole, "COVER");
  assert.match(capa.purpose, /promessa/);
  assert.ok(capa.filenameSuggestion.endsWith(".webp"));
  assert.ok(capa.generationPrompt.length > 20);

  /* F · dois a três respiros. */
  assert.ok(respiros.length >= 2 && respiros.length <= 3, `F · ${respiros.length} imagem(ns) de respiro`);

  /* I · cada respiro aponta para uma seção e para uma função. */
  for (const imagem of respiros) {
    assert.ok(imagem.section, "I · imagem de respiro sem seção");
    assert.ok(imagem.purpose, "I · imagem de respiro sem função");
    assert.ok(imagem.evidenceBasis, "§12 · imagem sem origem da necessidade");
    assert.ok(imagem.negativeGuidance.some((item: string) => /não repetir o conceito da capa/.test(item)));
  }

  /* G · FAQ não entra. */
  assert.equal(respiros.some((item: { section: string }) => /faq|perguntas frequentes/i.test(item.section)), false);
  assert.equal(capa.section, null);
});

test("G · uma seção de FAQ não ganha imagem", () => {
  const vista = vistaDoGoogle();
  const comFaq = {
    ...vista.articleModel,
    sections: [
      ...vista.articleModel.sections,
      {
        ...vista.articleModel.sections[0],
        id: "faq", headingSuggestion: "Perguntas frequentes sobre pele oleosa",
        editorialFunction: "COVERAGE", childSections: [],
      },
    ],
  };

  const respiros = JSON.parse(linhaDoGoogle({ articleModel: comFaq }).respite_images_plan_json);
  assert.equal(respiros.some((item: { section: string }) => /Perguntas frequentes/.test(item.section)), false,
    "G · a seção de FAQ recebeu imagem");
});

test("H · o ALT descreve a imagem e não empilha a keyword", () => {
  /* A segunda ocorrência sai, e sai aqui — ninguém revisa alt depois. */
  assert.equal(
    radarPortableAltText({ concept: "rotina de skincare para pele oleosa em pele oleosa", principalKeyword: "pele oleosa" }),
    "Rotina de skincare para pele oleosa em",
  );
  assert.equal(radarPortableAltText({ concept: "ordem dos passos", principalKeyword: "pele oleosa" }), "Ordem dos passos");

  const linha = linhaDoGoogle();
  for (const imagem of [JSON.parse(linha.cover_image_plan_json), ...JSON.parse(linha.respite_images_plan_json)]) {
    const ocorrencias = (imagem.altTextSuggestion.toLowerCase().match(/pele oleosa/g) || []).length;
    assert.ok(ocorrencias <= 1, `H · a keyword aparece ${ocorrencias} vezes no ALT: ${imagem.altTextSuggestion}`);
    assert.ok(imagem.altTextSuggestion.length <= 125);
  }
});

test("J, K e L · o contexto completo carrega SEO, capa e respiros", () => {
  const contexto = linhaDoGoogle().writer_context_md;

  assert.match(contexto, /# METADADOS SEO/, "J · SEO ausente do contexto");
  assert.match(contexto, /## Capa/, "K · plano de capa ausente do contexto");
  assert.match(contexto, /## Imagem de respiro 1/, "L · plano de respiro ausente do contexto");
  assert.match(contexto, /# IDENTIDADE VISUAL/);
  assert.match(contexto, /Prompt de imagem:/);
});

test("M · imagem e vídeo não duplicam função sem indicação", () => {
  const todas = [
    ...JSON.parse(linhaDoYoutube().respite_images_plan_json),
    ...JSON.parse(linhaDoGoogle().respite_images_plan_json),
  ] as Array<{ mediaFit: string; section: string; purpose: string }>;

  for (const imagem of todas) {
    assert.ok(["IMAGE", "VIDEO", "BOTH"].includes(imagem.mediaFit));
    /*
     * §13 · `BOTH` SÓ QUANDO AS DUAS MÍDIAS TÊM FUNÇÕES DISTINTAS.
     *
     * Aplicação prática é o caso em que vídeo mostra a execução e a imagem
     * resume a sequência. Fora disso, marcar as duas duplicaria mídia pelo
     * prazer de ter as duas — que é exatamente o que o gate proíbe.
     */
    if (imagem.mediaFit === "BOTH") {
      assert.match(imagem.purpose, /ORDEM|processo/i, `M · BOTH sem função distinta em "${imagem.section}"`);
    }
  }
});

test("N · sem estrutura editorial, o plano visual não é inventado", () => {
  const semModelo = linhaDoGoogle({ articleModel: null, googleObserved: null });

  assert.equal(semModelo.cover_image_plan_json, "null");
  assert.equal(JSON.parse(semModelo.respite_images_plan_json).length, 0);
  assert.match(semModelo.visual_plan_md, /não produziu estrutura editorial/);
});

test("O · o ArticleDNA não é mutado por nada deste caminho", async () => {
  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(/writer_context_md|portable-export|portable-identity/.test(arquiteto), false, "O · ARTICLE_DNA_MUTATED");

  for (const caminho of [
    "../lib/radar/portable-evidence-pack.ts",
    "../lib/radar/portable-identity.ts",
    "../lib/radar/portable-annex-context.ts",
    "../lib/radar/portable-writer-context.ts",
  ]) {
    const fonte = await readFile(new URL(caminho, import.meta.url), "utf8");
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    /* §21 · nada aqui coleta, chama IA ou grava. */
    assert.equal(/fetch\(|dataforseo|openai|anthropic|\.insert\(|\.update\(/i.test(semComentarios), false,
      `§21 · ${caminho} sai da leitura pura`);
  }
});

/* ============================== §29 · a UI ============================== */

test("§29 · continua um único botão Exportar, com os dois produtos dentro", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const barra = pagina.slice(pagina.indexOf("const renderTopbarActions"), pagina.indexOf("const openDetail"));

  const botoes = [...barra.matchAll(/data-testid="radar-export-[a-z-]+"/g)].map(item => item[0]);
  assert.equal(botoes.length, 3, "§29 · a barra voltou a ter mais de um caminho de export");
  assert.match(barra, /Planilha atual/);
  assert.match(barra, /Dossiês editoriais finalizados \(CSV\)/);
});

/* ============================== a sentinela ============================== */

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
