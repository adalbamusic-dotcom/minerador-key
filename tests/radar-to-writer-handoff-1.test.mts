import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sendRadarToWriter, type RadarWriterHandoffPorts } from "../lib/server/radar-writer-send.ts";
import { resolveRadarCanonicalDossier, type RadarCanonicalDossier } from "../lib/server/radar-canonical-dossier.ts";
import type { RadarCanonicalAuthorities } from "../lib/server/radar-canonical-authorities.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarSpecialistEvidenceLayer } from "../lib/radar/specialist-evidence.ts";
import { buildRadarVideoEvidenceLayer } from "../lib/radar/video-evidence.ts";
import { radarSpecialistExtraction } from "../lib/radar/specialist-contribution-review.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarYoutubeSearchRunSchema } from "../lib/radar/youtube-search-run.ts";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import { amazonCompetitiveBlueprintOfAnalysis } from "../lib/radar/amazon-editorial.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";
import { ContentDocumentV2Schema, type ContentDocument } from "../lib/arquiteto/contracts.ts";
import { RADAR_WRITER_MAY_NOT, radarWriterPhaseOfStatus } from "../lib/redator/writer-handoff.ts";
import { radarDocumentId } from "../lib/redator/radar-import.ts";
import { radarFrozenObservedAtOfAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import type { RadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ===== RADAR_TO_WRITER_HANDOFF_1 · O PLANEJADOR SAIU DO CAMINHO =====
 *
 * ==================== O QUE ESTA SUÍTE PROVA ====================
 *
 * O pipeline passou a ser `Minerador → Arquiteto → Radar → Redator`. O que
 * mudou é DESTINO e RESPONSABILIDADE — não a pesquisa.
 *
 * Por isso quase toda asserção aqui é sobre o que NÃO se perdeu: a fotografia
 * do Google, a SERP de vídeo, a evidência comercial, a biblioteca de vídeos, o
 * especialista, o contexto de keyword, o blueprint e as limitações precisam
 * chegar ao Redator exatamente como chegavam ao Planejador.
 *
 * Um handoff que entregasse menos seria uma simplificação de fluxo paga com
 * evidência — e a conta apareceria num artigo escrito, não num teste.
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

/* ======================= a investigação real do Google ======================= */

const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PRINCIPAL = "skincare para pele oleosa";
const SECUNDARIAS = ["cuidados pele oleosa", "rotina pele oleosa"];
const REFORCOS = ["controle de oleosidade"];
const CONTRIBUICAO = "Quem tem pele oleosa não precisa evitar hidratante: precisa de textura leve, sem óleo.";
const TRECHO = "A ordem certa é limpeza, depois o ativo, e o hidratante por último.";

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

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1",
    articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    promise: "Como cuidar da pele oleosa no dia a dia",
    mainIntent: "informacional", hierarchy: "Suporte",
  },
  keywords: [
    {
      identity: { keywordId: "kw-1", text: PRINCIPAL, role: "principal" },
      strategy: { volume: 720, resultCount: 41000, kgrScore: 0.589, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: null },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    },
    ...SECUNDARIAS.map((texto, indice) => ({
      identity: { keywordId: `kw-s${indice}`, text: texto, role: "secundaria" },
      strategy: { volume: 210, resultCount: null, kgrScore: null, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, semanticQualification: null },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    })),
    ...REFORCOS.map((texto, indice) => ({
      identity: { keywordId: `kw-r${indice}`, text: texto, role: "reforco_narrativo" },
      strategy: { volume: null, resultCount: null, kgrScore: null, incrementalVolume: null, normalizedIntent: null, coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, semanticQualification: null },
      resolution: "FULL",
      provenance: { textSource: "hydration", strategySource: "article_reference" },
    })),
  ],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: [PRINCIPAL, ...SECUNDARIAS],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

/**
 * A MESMA COMPOSIÇÃO, COM A PRINCIPAL SEM TEXTO.
 *
 * O papel continua declarado no ArticleDNA; o que falta é a hidratação daquela
 * versão. É o caso em que cair para a secundária ou para o slug seria mais
 * cômodo — e é exatamente por isso que ele precisa de teste.
 */
const contextoSemPrincipal = (): RadarArticleResearchContext => {
  const base = contexto() as unknown as { keywords: Array<{ identity: { role: string; text: string | null } }> };
  return {
    ...(base as unknown as RadarArticleResearchContext),
    keywords: base.keywords.map(item => item.identity.role === "principal"
      ? { ...item, identity: { ...item.identity, text: null }, resolution: "UNRESOLVED" }
      : item),
  } as unknown as RadarArticleResearchContext;
};

const vistaDoGoogle = (context: RadarArticleResearchContext = contexto()) => buildRadarDeepResearchView({
  context,
  snapshot: { query: PRINCIPAL, organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-10T12:00:00.000Z",
});

const camadaDoEspecialista = () => buildRadarSpecialistEvidenceLayer({
  binding: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  preparedRequirements: 1,
  sources: [{
    extraction: radarSpecialistExtraction({
      contributionId: "c1", expertId: "e1", briefId: "bf1", requirementId: "req-1",
      requirementKind: "CLAIM", requirementQuestion: "Por que a pele fica oleosa?",
      sourceType: "TEXT", originalText: CONTRIBUICAO, transcriptText: null,
      externalUpdateId: null, originalAssetUri: null, checksum: null,
      receivedAt: "2026-09-16T10:00:00.000Z", decision: "ACCEPTED_EVIDENCE",
      classification: "EXPERIENCIA_PRATICA",
    }),
    requirementQuestion: "Pele oleosa precisa de hidratante?",
    requirementKind: "CLAIM",
    sentQuestions: ["Pele oleosa precisa de hidratante?"],
    expertDisplayName: null,
  }],
});

const camadaDeVideo = () => buildRadarVideoEvidenceLayer({
  identity: {
    frozenBundleId: "fb1", frozenBundleHash: "sha256:fb1",
    matchingRunId: "run-1", inputFingerprint: "m4:vs1@v1",
    matcherVersion: 4, matchedAt: "2026-09-16T13:00:00.000Z",
  },
  briefs: [{
    briefId: "vb1", topic: "Ordem da rotina",
    narrativePurpose: "Mostrar a sequência correta.",
    whatToLookFor: ["ordem dos passos"],
    relatedSectionId: "sec-1", relatedSectionTitle: "Rotina de cuidados para pele oleosa",
    questions: [], entities: [], evidenceNeeded: "Sequência declarada em vídeo.", priority: "HIGH",
  }],
  coverage: [{
    videoBriefId: "vb1", state: "SUPPORTED", reason: "O trecho cobre a ordem pedida.",
    criteria: ["ordem dos passos"], matchedCriteria: ["ordem dos passos"], missingCriteria: [],
    usefulSourceIds: ["vs1"],
    extracts: [{
      videoBriefId: "vb1", videoSourceId: "vs1",
      segmentIndexes: [12], startMs: 62000, endMs: 79000,
      originalText: TRECHO, sourceLanguage: "pt-BR",
      reasonForRelevance: "Enuncia a sequência que a pauta pediu.",
      matchedCriteria: ["ordem dos passos"], answersTitle: true,
      matchedQuestions: [], matchedEntities: [],
      supportType: "COVERS_TOPIC", confidence: 0.82, limitations: [],
      provenance: { processingVersion: 1, anchoredToSegments: true },
    }],
  }],
  sources: [{ videoSourceId: "vs1", displayName: "Rotina noturna explicada", languageCode: "pt-BR", processingVersion: 1 }],
});

const autoridadesCheias = (): RadarCanonicalAuthorities => ({
  google: vistaDoGoogle(),
  video: camadaDeVideo(),
  specialist: camadaDoEspecialista(),
  researchContext: contexto(),
});

/* ======================= as três investigações congeladas ======================= */

type Perfil = "GOOGLE" | "YOUTUBE" | "AMAZON";

const FUNDAMENTO = {
  brandId: "marca-1", articleId: "artigo-1",
  articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

const payloadAmazon = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
) as never;

const corridaAmazon = () => {
  const normalizada = normalizeDataForSeoAmazonResponse(payloadAmazon, "amzq:1");
  return buildRadarAmazonSearchRun({
    runId: "run-amz-1", runVersion: 1,
    startedAt: "2026-09-15T12:00:00.000Z", startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-v3", queryIds: ["amzq:1"] }),
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

const congeladaAmazon = () => freezeRadarAmazonInvestigation({
  run: corridaAmazon(),
  blueprint: amazonCompetitiveBlueprintOfAnalysis({
    articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: HASH,
    run: corridaAmazon(), support: null,
    primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
    researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
  }),
  finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
});

const blueprintDoYoutube = () => buildRadarYoutubeBlueprint({
  run: RadarYoutubeSearchRunSchema.parse({
    researchMode: "YOUTUBE", runId: "run-yt-1", runVersion: 1,
    startedAt: "2026-09-14T09:00:00.000Z", startedBy: "user-1", state: "COLLECTED",
    fingerprint: { articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", queryIds: ["ytq:1"], signature: "yt" },
    provenance: { provider: "dataforseo", endpoint: "/yt", queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, collectedAt: "2026-09-14T09:00:00.000Z" },
    queries: [], results: [], universe: [],
    limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
  }),
  declaredIntent: "informacional", editorialTopics: [], generatedAt: "2026-09-14T10:00:00.000Z",
});

const analiseDoArtigo = (perfil: Perfil = "GOOGLE", opcoes: { finalizada?: boolean } = {}) => {
  const base = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3",
    serpSnapshotId: "serp-9", serpSnapshotVersion: 1, serpSnapshotHash: "sha256:serp",
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null,
    writerBundle: null, writerTransfer: null,
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "approved", humanNotes: [], approvedAt: null, approvedBy: null,
  });

  const fotografia = opcoes.finalizada === false
    ? {}
    : perfil === "GOOGLE"
      ? {
        finalizedBundle: {
          frozenAt: "2026-09-10T13:00:00.000Z", frozenBy: "user-1",
          limitations: ["Nenhuma página de concorrente foi visitada além da extração."],
        },
      }
      : perfil === "YOUTUBE"
        ? {
          youtubeFrozenInvestigation: {
            frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "user-1",
            runRef: { runId: "run-yt-1", runVersion: 1, runFingerprint: "yt", collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo", endpoint: "/yt", queriesExecuted: 3, universeSize: 38, selectedVideoIds: [] },
            run: null, blueprint: blueprintDoYoutube(), multimodal: null,
            limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
          },
        }
        : { amazonSearch: corridaAmazon(), amazonFrozenInvestigation: congeladaAmazon() };

  return {
    versionId: "analysis-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
    previousVersionId: null, contentHash: "sha256:analysis", origin: "human" as const,
    changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
    payload: { ...base, ...fotografia } as typeof base,
  };
};

const dossieCanonico = (perfil: Perfil = "GOOGLE"): RadarCanonicalDossier => {
  const resultado = resolveRadarCanonicalDossier({
    analysis: analiseDoArtigo(perfil) as never,
    article: FUNDAMENTO,
    observedAt: "2026-09-17T12:00:00.000Z",
    authorities: autoridadesCheias(),
  });
  assert.equal(resultado.ok, true, `a bancada precisa resolver o dossiê de ${perfil}`);
  if (!resultado.ok) throw new Error("dossiê não resolvido");
  return resultado.dossier;
};

/* ============================== o mundo do envio ============================== */

const ARTICLE_DNA = {
  versionId: "dna-v3", entityId: "artigo-1", versionNumber: 3, previousVersionId: null,
  contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", origin: "human" as const, changeReason: "fixture",
  createdAt: "2026-09-01T10:00:00.000Z", createdBy: "user-1",
  payload: {
    brandId: "marca-1", articleId: "artigo-1", siloId: "silo-1",
    promise: "Como cuidar da pele oleosa no dia a dia",
    suggestedSlug: "cuidados-pele-oleosa",
    mainIntent: "informacional", hierarchy: "Suporte",
    principalKeywordId: "kw-1",
    keywordReferences: [
      { keywordId: "kw-1", role: "principal", keywordDnaVersionId: "kw-v1", keywordDnaContentHash: `sha256:${"1".repeat(64)}` },
      { keywordId: "kw-s0", role: "secundaria", keywordDnaVersionId: "kw-v2", keywordDnaContentHash: `sha256:${"2".repeat(64)}` },
    ],
  },
};

const itemDeRadar = (state = "approved") => ({
  id: "wf-radar-1", marca_id: "marca-1", article_id: "artigo-1", stage: "radar",
  state, lock_version: 1,
  payload: {
    title: "Artigo", slug: "cuidados-pele-oleosa", siloId: "silo-1", hierarchy: "pilar",
    principalKeywordId: "kw-1", format: "artigo", intent: "informacional", unitType: "article",
    articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  source_version_id: "dna-v3", source_content_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
});

/**
 * O ENVIO REAL, CONTRA PORTAS — e o que ele GRAVA fica capturado.
 *
 * O que interessa não é a resposta do serviço: é o `writerBundle` que ele
 * persiste e o DOCUMENTO que ele cria, porque são eles que o Redator lê depois.
 */
async function enviar(opcoes: {
  perfil?: Perfil;
  autoridades?: RadarCanonicalAuthorities;
  estadoDoRadar?: string;
  finalizada?: boolean;
  documentoExistente?: ContentDocument | null;
  reciboAnterior?: unknown;
  criarFalha?: boolean;
  fundamentoDepois?: typeof FUNDAMENTO;
  displayedAnalysisVersionId?: string | null;
  /** A hora do clique. Ela NÃO pode entrar no hash. */
  sentAt?: string;
  /** SDD do Assunto, F4.1 · o ArticleDNA que a identidade devolve (padrão: sem Assunto). */
  artigo?: typeof ARTICLE_DNA;
} = {}) {
  const perfil = opcoes.perfil || "YOUTUBE";
  const inicial = analiseDoArtigo(perfil, { finalizada: opcoes.finalizada });
  const analises = [opcoes.reciboAnterior
    ? { ...inicial, payload: { ...inicial.payload, writerBundle: opcoes.reciboAnterior as never } }
    : inicial];
  /*
   * ===== READINESS_FIX_1 · O PADRÃO DA BANCADA É O ESTADO REAL =====
   *
   * Era "approved", e por isso a suíte inteira passava sobre um mundo que o
   * fluxo operacional nunca produz: uma linha de Radar nasce
   * `research_pending` e a finalização não a move. Foi essa fixtura otimista
   * que deixou a recusa passar por 11 mutantes sem ninguém ver.
   */
  const radar = itemDeRadar(opcoes.estadoDoRadar || "research_pending");
  let documento: ContentDocument | null = opcoes.documentoExistente ?? null;
  const chamadas: string[] = [];
  let leiturasDoFundamento = 0;

  const portas: RadarWriterHandoffPorts = {
    loadCanonicalAuthorities: async () => { chamadas.push("loadCanonicalAuthorities"); return opcoes.autoridades || autoridadesCheias(); },
    loadRadarState: async () => {
      chamadas.push("loadRadarState");
      return { lockVersion: 1, analyses: analises as never };
    },
    loadArticleFoundation: async () => {
      leiturasDoFundamento += 1;
      return leiturasDoFundamento > 1 && opcoes.fundamentoDepois ? opcoes.fundamentoDepois : FUNDAMENTO;
    },
    loadArticleIdentity: async () => ({ article: (opcoes.artigo || ARTICLE_DNA) as never, silo: null }),
    findWorkflowItem: async () => radar as never,
    findDocument: async () => { chamadas.push("findDocument"); return documento; },
    createDocument: async ({ document }) => {
      chamadas.push("createDocument");
      if (opcoes.criarFalha) return;
      documento = document;
    },
    transitionRadar: async () => { chamadas.push("transitionRadar"); },
    appendDecision: async () => { chamadas.push("appendDecision"); },
  };

  const resultado = await sendRadarToWriter({
    brandId: "marca-1", articleId: "artigo-1", actorId: "user-1",
    sentAt: opcoes.sentAt || "2026-09-17T12:00:00.000Z",
    displayedAnalysisVersionId: opcoes.displayedAnalysisVersionId ?? null,
  }, portas);

  const writerBundle = resultado.record as typeof resultado.record & { bundle: RadarEvidenceBundle };
  return { resultado, chamadas, writerBundle, documento: documento as ContentDocument | null };
}

const dossieDoDocumento = (documento: ContentDocument | null) => {
  assert.ok(documento, "nenhum documento foi criado");
  assert.equal(documento!.schemaVersion, 2, "o documento do Radar precisa ser v2");
  const v2 = ContentDocumentV2Schema.parse(documento);
  assert.ok(v2.importedContext.dossier, "o documento chegou ao Redator sem dossiê canônico");
  return v2.importedContext.dossier!;
};

/* ================================= A ================================= */

test("A · Radar finalizado e aprovado entrega ao Redator, na ordem canônica", async () => {
  const { resultado, chamadas, documento } = await enviar();

  assert.equal(resultado.change, "CREATED");
  assert.equal(resultado.documentId, radarDocumentId("marca-1", "artigo-1"));
  assert.ok(documento, "o documento não foi criado");

  /*
   * A ORDEM É A PROVA, e não a presença das chamadas.
   *
   * A esteira não pode se mover antes de o documento existir: um artigo
   * marcado como entregue sem destino confirmado é a mentira que esta ordem
   * existe para impedir.
   */
  const criou = chamadas.indexOf("createDocument");
  const moveu = chamadas.indexOf("transitionRadar");
  assert.ok(criou >= 0, "o documento não foi criado");
  assert.ok(moveu > criou, "a esteira se moveu antes do documento existir");

  /*
   * ===== E NENHUMA VERSÃO DE ANÁLISE FOI CRIADA =====
   *
   * Entregar um Radar finalizado não é analisar de novo. A porta de append
   * nem existe mais no contrato do serviço.
   */
  assert.equal(chamadas.includes("appendAnalysis"), false, "a entrega criou versão de análise");

  /* E o readback do destino acontece DEPOIS da criação. */
  const leiturasDoDestino = chamadas.filter(item => item === "findDocument").length;
  assert.ok(leiturasDoDestino >= 2, "o destino não foi relido depois de criado");
});

/* ================================= B ================================= */

test("B · investigação não finalizada bloqueia, e não cria documento nenhum", async () => {
  await assert.rejects(
    () => enviar({ finalizada: false }),
    (erro: Error & { code?: string }) => {
      assert.equal(erro.code, "radar_research_not_finalized");
      assert.match(erro.message, /Finalize a investigação antes de enviar ao Redator/);
      return true;
    },
  );
});

test("B · o estado da esteira NÃO decide a entrega — a finalização decide", async () => {
  /*
   * ===== READINESS_FIX_1 · A RECUSA QUE ESTE TESTE SUBSTITUI =====
   *
   * Aqui se exigia `state === "approved"`. O fluxo vigente nunca produz esse
   * estado: a linha nasce `research_pending` e nem START, nem ANALYZE, nem
   * FINALIZE a movem. Só o fluxo ANTIGO por abas, com "Aprovar SERP", produzia
   * `approved`.
   *
   * O resultado era a pior recusa possível: o servidor mandava aprovar um
   * Radar já finalizado, apontando para um botão que a tela atual não tem.
   */
  for (const estado of ["research_pending", "researching", "needs_review", "awaiting_approval", "approved", "sent_planner"]) {
    const { resultado, documento } = await enviar({ estadoDoRadar: estado });
    assert.equal(resultado.change, "CREATED", `${estado} não atravessou`);
    assert.ok(documento, `${estado} não gerou documento`);
  }
});

test("B · a esteira segue o fato: ela se move a partir de qualquer estado", async () => {
  for (const estado of ["research_pending", "approved", "sent_planner"]) {
    const { chamadas } = await enviar({ estadoDoRadar: estado });
    assert.ok(chamadas.includes("transitionRadar"), `${estado} deixou a esteira parada`);
    assert.ok(chamadas.includes("appendDecision"), `${estado} não registrou a decisão`);
  }

  /* E quem já está entregue não é transicionado de novo. */
  const repetido = await enviar({ estadoDoRadar: "sent_writer" });
  assert.equal(repetido.chamadas.includes("transitionRadar"), false, "a entrega repetida moveu a esteira de novo");
});

/* ================================ C, D, E ================================ */

test("C · GOOGLE · o dossiê canônico do Google é o que segue para o Redator", async () => {
  /*
   * ===== POR QUE ESTE PERFIL É EXERCITADO PELA RESOLUÇÃO, E NÃO PELO ENVIO =====
   *
   * A prontidão do GOOGLE exige um `RadarFrozenEvidenceBundle` com hash
   * íntegro — fixtura de outra suíte, e reconstruí-la aqui provaria a
   * finalização do Google, não a entrega ao Redator.
   *
   * O que este gate precisa provar é que o CONTEÚDO do Google atravessa. E ele
   * atravessa igual nos três perfis, porque quem o carrega é o dossiê
   * canônico: o serviço de envio não olha o perfil em momento nenhum.
   */
  const dossie = dossieCanonico("GOOGLE");
  assert.equal(dossie.profile, "GOOGLE");
  assert.ok(dossie.bundle.observed, "a fotografia do Google não chegou ao dossiê");
  assert.ok(dossie.bundle.competitiveBlueprint, "o blueprint não chegou ao dossiê");
  assert.equal(dossie.keywordContext.principal, PRINCIPAL);

  /* E o serviço é CEGO AO PERFIL — é isso que estende D e E ao Google. */
  const servico = await readFile(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8");
  const semComentarios = servico.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.equal(/=== "GOOGLE"|=== "YOUTUBE"|=== "AMAZON"/.test(semComentarios), false,
    "o envio passou a decidir por perfil");
});

test("D · YOUTUBE · a SERP de vídeo e o apoio do Google chegam ao Redator", async () => {
  const { writerBundle, documento } = await enviar({ perfil: "YOUTUBE" });

  assert.equal(writerBundle.bundle.primaryResearchProfile, "YOUTUBE");
  assert.ok(writerBundle.bundle.research.youtube, "a investigação de YouTube não atravessou");
  /*
   * O LUGAR DO APOIO DO GOOGLE CONTINUA DECLARADO — e é isso que §26 protege.
   *
   * `research.google` é onde a rodada de apoio mora quando ela existe. Nesta
   * investigação ela não existe, e o campo diz `null` em vez de sumir: a
   * diferença entre "não houve apoio" e "o apoio foi descartado no caminho" é
   * exatamente o que um handoff não pode apagar.
   */
  assert.ok("google" in writerBundle.bundle.research, "o apoio do Google sumiu do dossiê de vídeo");
  assert.equal(writerBundle.bundle.research.google, null);

  const dossie = dossieDoDocumento(documento);
  assert.equal(dossie.researchProfile, "YOUTUBE");
});

test("E · AMAZON · o dossiê comercial chega ao Redator", async () => {
  const { writerBundle, documento } = await enviar({ perfil: "AMAZON" });

  assert.equal(writerBundle.bundle.primaryResearchProfile, "AMAZON");
  assert.ok(writerBundle.bundle.research.amazon, "a investigação da Amazon não atravessou");

  const dossie = dossieDoDocumento(documento);
  assert.equal(dossie.researchProfile, "AMAZON");
});

/* ================================= F e G ================================= */

test("F · a biblioteca de vídeos chega ao Redator, com o trecho ancorado", async () => {
  const { writerBundle, documento } = await enviar();

  assert.ok(writerBundle.bundle.video, "a biblioteca de vídeos não atravessou");
  assert.equal(writerBundle.bundle.video!.results[0].extracts[0].originalText, TRECHO);

  /* E o trecho está no dossiê que o documento carrega — não só no recibo. */
  const dossie = dossieDoDocumento(documento);
  const video = (dossie.bundle as { video?: { results: Array<{ extracts: Array<{ originalText: string }> }> } }).video;
  assert.ok(video, "o documento chegou ao Redator sem a biblioteca de vídeos");
  assert.equal(video!.results[0].extracts[0].originalText, TRECHO);
});

test("G · o especialista chega ao Redator, sem canal privado", async () => {
  const { writerBundle, documento } = await enviar();

  assert.ok(writerBundle.bundle.specialist, "o especialista não atravessou");
  assert.equal(writerBundle.bundle.specialist!.items[0].originalText, CONTRIBUICAO);
  assert.equal(writerBundle.bundle.specialist!.items[0].provenance.externalUpdateId, null);
  assert.equal(writerBundle.bundle.specialist!.items[0].provenance.originalAssetUri, null);

  const dossie = dossieDoDocumento(documento);
  const especialista = (dossie.bundle as { specialist?: { items: Array<{ originalText: string }> } }).specialist;
  assert.ok(especialista, "o documento chegou ao Redator sem o especialista");
  assert.equal(especialista!.items[0].originalText, CONTRIBUICAO);
});

/* ================================= H e I ================================= */

test("H · o contexto de keyword chega ao Redator pelos três perfis", async () => {
  for (const perfil of ["GOOGLE", "YOUTUBE", "AMAZON"] as const) {
    const dossie = perfil === "GOOGLE"
      ? dossieCanonico("GOOGLE")
      : dossieDoDocumento((await enviar({ perfil })).documento);

    assert.equal(dossie.keywordContext.principal, PRINCIPAL, `${perfil} · a principal não chegou`);
    assert.deepEqual(dossie.keywordContext.secondary, SECUNDARIAS, `${perfil} · as secundárias não chegaram`);
    assert.deepEqual(dossie.keywordContext.narrativeReinforcements, REFORCOS, `${perfil} · os reforços não chegaram`);
    assert.equal(dossie.keywordContext.resolution, "ARTICLE_DNA_HYDRATION");

    /*
     * E NUNCA O TÍTULO NEM O SLUG NO LUGAR DA KEYWORD.
     *
     * Os dois existem no ArticleDNA desta bancada e são DIFERENTES da
     * principal justamente para que a troca apareça.
     */
    assert.notEqual(dossie.keywordContext.principal, ARTICLE_DNA.payload.promise);
    assert.notEqual(dossie.keywordContext.principal, ARTICLE_DNA.payload.suggestedSlug);
  }
});

test("H · principal não resolvida chega como `null` — nunca como secundária nem como slug", async () => {
  /*
   * ===== O DEFEITO QUE ESTE TESTE EXISTE PARA IMPEDIR =====
   *
   * Quando a hidratação não resolve o texto da principal, é tentador cair para
   * a primeira secundária ou para o slug do artigo: os dois estão à mão e os
   * dois parecem "a keyword".
   *
   * Nenhum dos dois é. Planejar pela secundária é planejar pelo apoio; planejar
   * pelo slug é planejar pela formulação de quem o escreveu. Ausência declarada
   * é a única resposta honesta — e é ela que faz alguém voltar ao Arquiteto.
   */
  const semPrincipal = {
    ...autoridadesCheias(),
    researchContext: contextoSemPrincipal(),
  };

  const { documento } = await enviar({ autoridades: semPrincipal });
  const dossie = dossieDoDocumento(documento);

  assert.equal(dossie.keywordContext.principal, null, "a principal foi preenchida por outra coisa");
  assert.equal(dossie.keywordContext.resolution, "UNRESOLVED");
  assert.ok(dossie.keywordContext.secondary.length > 0, "a bancada precisa ter secundárias resolvidas");
  assert.equal(dossie.keywordContext.secondary.includes(dossie.keywordContext.principal as never), false);

  /* E o documento não preenche a principal com o slug. */
  assert.equal(documento!.metadata.principalKeyword, "");
  assert.notEqual(documento!.metadata.principalKeyword, documento!.metadata.slug);
});

test("I · o blueprint chega ao Redator", async () => {
  const { writerBundle, documento } = await enviar();
  assert.ok(writerBundle.bundle.competitiveBlueprint, "o blueprint não atravessou o recibo");

  const dossie = dossieDoDocumento(documento);
  assert.ok((dossie.bundle as { competitiveBlueprint?: unknown }).competitiveBlueprint,
    "o documento chegou ao Redator sem blueprint");
});

/* ================================= J e K ================================= */

test("J · as limitações chegam ao Redator, e não são higienizadas no caminho", async () => {
  const { writerBundle, documento } = await enviar();

  assert.ok(writerBundle.bundle.limitations.length > 0, "as limitações sumiram do recibo");

  const dossie = dossieDoDocumento(documento);
  const limitacoes = (dossie.bundle as { limitations?: string[] }).limitations || [];
  assert.deepEqual(limitacoes, writerBundle.bundle.limitations,
    "o documento recebeu outra lista de limitações");
});

test("K · a identidade do ArticleDNA é preservada — e mudança no meio recusa", async () => {
  const { writerBundle, documento } = await enviar();

  assert.equal(writerBundle.binding.articleDnaVersionId, "dna-v3");
  assert.equal(writerBundle.binding.articleDnaContentHash, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

  const v2 = ContentDocumentV2Schema.parse(documento);
  assert.equal(v2.radarOrigin.articleDnaVersionId, "dna-v3");
  assert.equal(v2.radarOrigin.articleDnaContentHash, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(v2.articleDnaRef.versionId, "dna-v3");

  /* E o fundamento que muda ENTRE montar e entregar recusa a entrega. */
  await assert.rejects(
    () => enviar({ fundamentoDepois: { ...FUNDAMENTO, articleDnaVersionId: "dna-v4" } }),
    (erro: Error & { code?: string }) => {
      assert.equal(erro.code, "radar_handoff_blocked_stale");
      return true;
    },
  );
});

/* ================================= L e M ================================= */

test("L · o lote usa a MESMA autoridade do botão individual", async () => {
  const cliente = await readFile(new URL("../lib/radar/writer-handoff-client.ts", import.meta.url), "utf8");

  /*
   * O LOTE É ORQUESTRAÇÃO — ele repete a porta única, não abre outra.
   *
   * Um lote com caminho próprio foi exatamente o defeito que o RADAR_FINAL_1.2
   * fechou: ele movia a esteira sem dossiê, sem prontidão e sem identidade.
   */
  assert.match(cliente, /export async function postRadarWriterHandoffBatch/);
  assert.match(cliente, /resultados\.push\(await postRadarWriterHandoff\(/);

  const semComentarios = cliente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const rotas = [...semComentarios.matchAll(/"\/api\/[^"]+"/g)].map(item => item[0]);
  assert.deepEqual([...new Set(rotas)], ["\"/api/editorial/radar-writer-handoff\""],
    "o cliente fala com mais de uma rota");
});

test("M · nenhum fluxo novo chama sendRadarToPlanner", async () => {
  const alvos = [
    "../modules/radar/radar-page.tsx",
    "../modules/radar/radar-analysis-page.tsx",
    "../modules/radar/radar-r3-workbench.tsx",
    "../lib/radar/writer-handoff-client.ts",
    "../lib/server/radar-writer-send.ts",
  ];

  for (const alvo of alvos) {
    const fonte = await readFile(new URL(alvo, import.meta.url), "utf8");
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    assert.equal(/sendRadarToPlanner|postRadarPlannerHandoff|radar-planner-handoff/.test(semComentarios), false,
      `${alvo} ainda usa o caminho do Planejador`);
  }

  /* E o serviço antigo continua existindo, mas declarado como legado. */
  const legado = await readFile(new URL("../lib/server/radar-planner-send.ts", import.meta.url), "utf8");
  assert.match(legado, /@deprecated Use `sendRadarToWriter`/);
  assert.match(legado, /ESTE CAMINHO NÃO É MAIS OPERACIONAL/);
});

/* ================================= N ================================= */

test("N · nenhuma superfície do Radar oferece “Enviar ao Planejador”", async () => {
  const telas = [
    "../modules/radar/radar-page.tsx",
    "../modules/radar/radar-analysis-page.tsx",
    "../modules/radar/radar-r3-workbench.tsx",
    "../modules/radar/radar-r4-bulk-operations-bar.tsx",
  ];

  for (const tela of telas) {
    const fonte = await readFile(new URL(tela, import.meta.url), "utf8");
    assert.equal(/Enviar ao Planejador|Enviado ao Planejador/.test(fonte), false,
      `${tela} ainda oferece o Planejador`);
  }

  /*
   * §1 e §19 · O PLANEJADOR SAIU DA NAVEGAÇÃO DE WORKFLOW.
   *
   * E SÓ dela: a rota continua registrada em `PRODUCT_MODULES` porque o
   * histórico precisa continuar alcançável. Tirar as duas coisas ao mesmo
   * tempo apagaria os planos já aprovados da vista de quem os aprovou.
   */
  const navegacao = await readFile(new URL("../lib/editorial/navigation.ts", import.meta.url), "utf8");
  const fluxo = navegacao.slice(navegacao.indexOf("export const PRODUCT_FLOW"), navegacao.indexOf("export const LEGACY_REDIRECTS"));
  assert.equal(/"planejador"/.test(fluxo), false, "o Planejador voltou ao fluxo de navegação");
  assert.match(fluxo, /"radar", "redator"/, "o Radar precisa entregar direto ao Redator");
  assert.ok(navegacao.includes(`planejador: { label: "Planejador", href: "/planejador", historical: true }`),
    "a rota do histórico do Planejador não pode sumir");
  /*
   * REMOÇÃO LÓGICA · a rota responde e deixa de ser oferecida.
   *
   * `historical: true` é o que separa as duas coisas. O menu passou a filtrar
   * por essa marca, então o Planejador some da navegação sem que o caminho
   * para os planos já aprovados seja apagado junto.
   */
  assert.match(navegacao, /!item\.historical/, "o menu precisa filtrar rota histórica");
  assert.match(navegacao, /planejador: null, admin: null/, "PLANEJADOR_STAGE = NONE precisa estar declarado");
  assert.match(navegacao, /redator: 6, publicacoes: 7, conta: 8/, "os estágios declarados mudaram");

  /* E nenhuma tela do Redator convida a abrir o Planejador. */
  for (const tela of ["../modules/redator/writer-page.tsx", "../components/editorial/professional-writer.tsx"]) {
    const fonte = await readFile(new URL(tela, import.meta.url), "utf8");
    assert.equal(/Abrir Planejador/.test(fonte), false, tela + " ainda manda abrir o Planejador");
  }

  /* E o botão que existe nomeia o destino certo. */
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /"Enviar ao Redator"/);
  const barra = await readFile(new URL("../modules/radar/radar-r4-bulk-operations-bar.tsx", import.meta.url), "utf8");
  assert.match(barra, /label: "Enviar ao Redator"/);
});

/* ================================= O ================================= */

test("O · o export portátil não mudou por causa deste gate", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");

  /*
   * O EXPORT CONTINUA SENDO A SEGUNDA SAÍDA DA MESMA RESOLUÇÃO.
   *
   * Se ele tivesse aprendido o caminho do Redator, existiriam de novo duas
   * leituras da mesma investigação — o defeito que o PARITY_1 fechou.
   */
  assert.match(rota, /loadRadarCanonicalAuthorities/);
  assert.match(rota, /resolveRadarCanonicalDossier/);
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.equal(/sendRadarToWriter|sendRadarToPlanner|buildRadarDocument/.test(semComentarios), false,
    "o export passou a conhecer o handoff");
});

/* ================================= P e Q ================================= */

test("P · PROVIDER_CALLS = 0 e AI_CALLS = 0 no serviço do handoff", async () => {
  const fonte = await readFile(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  for (const proibido of ["fetch(", "dataforseo", "deepseek", "openai", "anthropic", "youtube.com", "amazon.com"]) {
    assert.equal(semComentarios.toLowerCase().includes(proibido.toLowerCase()), false,
      `o handoff chama ${proibido}`);
  }
});

test("Q · o ArticleDNA não é mutado pela entrega", async () => {
  const antes = JSON.stringify(ARTICLE_DNA);
  await enviar();
  assert.equal(JSON.stringify(ARTICLE_DNA), antes, "a entrega alterou o ArticleDNA da bancada");

  /*
   * E CONTRA O VALOR LITERAL, não só contra si mesmo.
   *
   * Comparar o antes com o depois não pega uma mutação IDEMPOTENTE: um
   * `toUpperCase()` aplicado por um teste anterior já teria envelhecido o
   * "antes", e a segunda aplicação não mudaria nada.
   */
  assert.equal(ARTICLE_DNA.payload.suggestedSlug, "cuidados-pele-oleosa");
  assert.equal(ARTICLE_DNA.payload.promise, "Como cuidar da pele oleosa no dia a dia");
  assert.equal(ARTICLE_DNA.payload.keywordReferences[0].keywordId, "kw-1");

  /* E o serviço não tem porta de escrita de artefato nenhuma. */
  const fonte = await readFile(new URL("../lib/server/radar-writer-send.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.equal(/ArtifactRepository\(\)\.save|saveArticle|updateArticleDna/.test(semComentarios), false,
    "o handoff ganhou escrita sobre o ArticleDNA");
});

/* ================================= R ================================= */

test("R · repetir a entrega não duplica documento nem versão de análise", async () => {
  /*
   * MOUNT E F5 NÃO ENTREGAM — a entrega é POST, e repetir é idempotente.
   *
   * O primeiro envio cria; o segundo, sobre o mesmo dossiê e com o documento
   * já existente, reconhece em vez de criar de novo.
   */
  const primeiro = await enviar();
  assert.equal(primeiro.resultado.change, "CREATED");

  /*
   * O SEGUNDO ENVIO ENCONTRA O MUNDO QUE O PRIMEIRO DEIXOU: recibo gravado na
   * análise e documento criado no Redator. Nada é recriado.
   */
  const segundo = await enviar({ documentoExistente: primeiro.documento });
  assert.equal(segundo.resultado.change, "ALREADY_IMPORTED");
  assert.equal(segundo.resultado.documentId, primeiro.resultado.documentId);
  assert.equal(segundo.chamadas.includes("appendAnalysis"), false, "repetir criou versão de análise");
  assert.equal(segundo.chamadas.includes("transitionRadar"), false, "repetir moveu a esteira de novo");
  assert.equal(segundo.chamadas.includes("createDocument"), false, "repetir recriou o documento");

  /* E a rota é POST: não existe GET que entregue por montagem de tela. */
  const rota = await readFile(new URL("../app/api/editorial/radar-writer-handoff/route.ts", import.meta.url), "utf8");
  assert.match(rota, /export async function POST/);
  assert.equal(/export async function GET/.test(rota), false, "a entrega virou efeito de leitura");
});

test("R · documento já existente com outro pacote não é sobrescrito", async () => {
  const primeiro = await enviar();
  const anterior = ContentDocumentV2Schema.parse(primeiro.documento);
  const comOutroPacote = {
    ...anterior,
    radarOrigin: { ...anterior.radarOrigin, evidenceBundleHash: "sha256:outro-pacote" },
  };

  await assert.rejects(
    () => enviar({ documentoExistente: comOutroPacote as ContentDocument }),
    (erro: Error & { code?: string }) => {
      /*
       * ===== O QUE MUDOU COM O RECIBO SAINDO DA ANÁLISE =====
       *
       * Antes, documento sem recibo era INCONSISTÊNCIA — havia dois registros
       * do mesmo fato e um deles faltava. Agora o documento É o recibo, e um
       * documento com OUTRO pacote é simplesmente uma base anterior: alguém
       * pode ter escrito em cima dela.
       *
       * A recusa continua; o que mudou é que ela deixou de acusar corrupção
       * onde há trabalho de outra pessoa.
       */
      assert.equal(erro.code, "radar_handoff_document_exists");
      assert.match(erro.message, /A base não é substituída aqui/);
      return true;
    },
  );
});

/* ========================= §12 · o que o Redator não pode ========================= */

test("§12 · as invariantes do Redator viajam com o pacote e com o documento", async () => {
  const { writerBundle, documento } = await enviar();

  assert.deepEqual(writerBundle.writerMayNot, [...RADAR_WRITER_MAY_NOT]);

  const dossie = dossieDoDocumento(documento);
  assert.deepEqual(dossie.writerMayNot, [...RADAR_WRITER_MAY_NOT]);

  /* E elas nomeiam o que o gate proíbe, não o que o Planejador proibia. */
  const texto = RADAR_WRITER_MAY_NOT.join(" · ");
  for (const proibicao of ["keyword principal", "Silo", "cobertura obrigatória", "intenção", "slug", "canonical", "secundárias"]) {
    assert.ok(texto.includes(proibicao), `a lista não fala de ${proibicao}`);
  }
});

/* ============== SDD do Assunto, F4.1 · o envio com e sem Assunto ============== */

test("Assunto · o envio GRAVA a proibição do Assunto no recibo e no documento, e as linhas da virada em editorialContext; sem Assunto, nada muda", async () => {
  const ASSUNTO = {
    keywordId: "kw-assunto",
    approvedPackageRef: { version: 3, contentHash: `sha256:${"p".repeat(64)}`, approvedAt: "2026-09-24T10:00:00+00:00" },
    phrase: "Consulta dermatológica online", note: "A marca atende por teleconsulta.", destinationUrl: "https://careglow.com.br/consulta-online",
    attachedBy: "user-1", attachedAt: "2026-09-24T12:00:00+00:00",
  };
  const contextoComAssunto = (): RadarArticleResearchContext => {
    const base = contexto();
    return { ...base, article: { ...base.article, subject: { phrase: ASSUNTO.phrase, note: ASSUNTO.note, destinationUrl: ASSUNTO.destinationUrl } } } as RadarArticleResearchContext;
  };
  const { radarWriterSubjectTurnLines } = await import("../lib/redator/radar-subject-turn.ts");
  const { RADAR_WRITER_MAY_NOT_SUBJECT } = await import("../lib/redator/writer-handoff.ts");

  /*
   * O envio de GOOGLE exige um congelado íntegro que esta bancada não monta (ver C);
   * o serviço é cego ao perfil, então o envio exercitado é o de YOUTUBE, com a
   * fotografia do Google nas autoridades carregando a virada calculada pela F3.
   */
  /* Sem Assunto: a lista de sempre e nenhuma linha. */
  const sem = await enviar();
  assert.deepEqual(sem.writerBundle.writerMayNot, [...RADAR_WRITER_MAY_NOT]);
  assert.deepEqual(dossieDoDocumento(sem.documento).writerMayNot, [...RADAR_WRITER_MAY_NOT]);
  assert.deepEqual(ContentDocumentV2Schema.parse(sem.documento).importedContext.editorialContext, []);

  /* Com Assunto no ArticleDNA fixado e a virada calculada pela F3 sobre a mesma amostra. */
  const autoridades: RadarCanonicalAuthorities = { ...autoridadesCheias(), google: vistaDoGoogle(contextoComAssunto()), researchContext: contextoComAssunto() };
  const artigo = { ...ARTICLE_DNA, payload: { ...ARTICLE_DNA.payload, subject: ASSUNTO } };
  const com = await enviar({ autoridades, artigo: artigo as typeof ARTICLE_DNA });
  const gravada = [...RADAR_WRITER_MAY_NOT, RADAR_WRITER_MAY_NOT_SUBJECT];
  assert.deepEqual(com.writerBundle.writerMayNot, gravada, "o recibo");
  const documento = ContentDocumentV2Schema.parse(com.documento);
  assert.deepEqual(documento.importedContext.dossier?.writerMayNot, gravada, "o documento: a mesma lista do recibo");

  const turn = autoridades.google!.articleModel.declaredSubject;
  assert.ok(turn, "a F3 monta a virada no artigo-modelo");
  const linhas = documento.importedContext.editorialContext;
  assert.deepEqual(linhas, radarWriterSubjectTurnLines({ subject: ASSUNTO, turn, principal: PRINCIPAL }));
  for (const prefixo of ["Tronco (Assunto): ", "Virada: ", "Seção da virada: ", "Destino da chamada: "]) {
    assert.ok(linhas.some(item => item.startsWith(prefixo)), `${prefixo} não chegou ao Redator`);
  }
  assert.ok(linhas.some(item => /^(Direção do H1: |Assunto em H2\/H3|Assunto no H1: )/.test(item)), "a direção do H1 não chegou ao Redator");

  /* O dossiê é o que o Radar congelou: o bundle entregue é o do recibo, sem o artigo-modelo dentro. */
  assert.deepEqual(documento.importedContext.dossier?.bundle, JSON.parse(JSON.stringify(com.writerBundle.bundle)));
  assert.equal("articleModel" in (documento.importedContext.dossier?.bundle || {}), false);
  assert.equal("declaredSubject" in (documento.importedContext.dossier?.bundle || {}), false);

  /* Sem a fotografia do Google (o caso real de YOUTUBE e AMAZON), as linhas devolvem a decisão, sem inventar lugar. */
  const semFoto = await enviar({ autoridades: { ...autoridades, google: null }, artigo: artigo as typeof ARTICLE_DNA });
  const linhasSemFoto = ContentDocumentV2Schema.parse(semFoto.documento).importedContext.editorialContext;
  assert.deepEqual(linhasSemFoto, radarWriterSubjectTurnLines({ subject: ASSUNTO, turn: null, principal: PRINCIPAL }));
  assert.ok(linhasSemFoto.some(item => item.startsWith("Virada: onde quem redige decidir (sem sinal na SERP)")));
  assert.deepEqual(semFoto.writerBundle.writerMayNot, gravada);
});

/* ========================= §9 · estrutura, não markdown ========================= */

test("§9 · o Redator recebe estrutura canônica, e não só markdown", async () => {
  const { documento } = await enviar();
  const dossie = dossieDoDocumento(documento);

  /*
   * O DOSSIÊ CHEGA COMO DADO, e isso é o ponto do §9.
   *
   * Um documento que carregasse apenas `writer_context_md` obrigaria quem
   * escreve a reinterpretar prosa para saber qual evidência sustenta qual
   * seção — e reinterpretar é o que produz afirmação sem lastro.
   */
  assert.equal(typeof dossie.bundle, "object");
  const bundle = dossie.bundle as Record<string, unknown>;
  for (const chave of ["binding", "competitiveBlueprint", "observed", "limitations", "research"]) {
    assert.ok(chave in bundle, `§9 · o dossiê chegou sem ${chave}`);
  }

  const serializado = JSON.stringify(documento);
  assert.equal(/writer_context_md|writer_brief_md|competitive_radiography_md/.test(serializado), false,
    "§9 · o documento recebeu read model portátil no lugar da estrutura");
});

/* ========================= §18 · as fases do Redator ========================= */

test("§18 · o documento nasce em planejamento, com os nomes que já existem", async () => {
  const { documento } = await enviar();
  assert.equal(documento!.status, "planejado");
  assert.equal(radarWriterPhaseOfStatus(documento!.status), "planning");
  assert.equal(radarWriterPhaseOfStatus("escrevendo"), "writing");

  /* E não existe ContentPlan no caminho — §11. */
  const v2 = ContentDocumentV2Schema.parse(documento);
  assert.equal("contentPlanRef" in v2, false, "§11 · o ContentPlan voltou a ser exigido");
});

/* ============================== a sentinela ============================== */

test("PROVIDER_CALLS = 0 · AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `houve rede: ${idasAoServidor.join(" · ")}`);
});

/* ================= S · RADAR_MULTI_PROFILE_HANDOFF_1 · a hora do clique não é o pacote ================= */

const CONGELAMENTO: Record<Perfil, string> = {
  GOOGLE: "2026-09-10T13:00:00.000Z",
  YOUTUBE: "2026-09-14T10:00:00.000Z",
  AMAZON: congeladaAmazon().finalizedAt,
};

for (const perfil of ["YOUTUBE", "AMAZON"] as const) {
  test(`S · ${perfil} · o segundo clique, em outra hora, reconhece o MESMO pacote`, async () => {
    /*
     * O DEFEITO VISTO NA TELA: "Pacote entregue ao Redator." e, no clique
     * seguinte, "Já existe documento deste artigo com pacote anterior" — sobre
     * uma investigação que ninguém tocou. `observedAt` entra no hash, e o
     * serviço resolvia o dossiê com a hora do clique.
     */
    const primeiro = await enviar({ perfil, sentAt: "2026-09-19T01:00:00.000Z" });
    assert.equal(primeiro.resultado.change, "CREATED");
    const segundo = await enviar({ perfil, sentAt: "2026-09-19T02:30:00.000Z", documentoExistente: primeiro.documento });
    assert.equal(segundo.resultado.change, "ALREADY_IMPORTED", "o mesmo Radar virou 'pacote anterior' só porque a hora mudou");
    assert.equal(segundo.resultado.record.bundleHash, primeiro.resultado.record.bundleHash);
    assert.equal(segundo.chamadas.includes("createDocument"), false);
  });

  test(`S · ${perfil} · o instante do pacote é o do congelamento, não o do clique`, async () => {
    const envio = await enviar({ perfil, sentAt: "2026-09-19T01:00:00.000Z" });
    assert.equal(envio.writerBundle.bundle.observedAt, CONGELAMENTO[perfil]);
    assert.notEqual(envio.writerBundle.bundle.observedAt, "2026-09-19T01:00:00.000Z");
  });
}

test("S · GOOGLE · dois cliques em horas diferentes resolvem o MESMO dossiê", () => {
  /*
   * A bancada não envia GOOGLE (o congelado da fixtura é um stub), então a
   * prova é feita onde o hash nasce: a resolução do dossiê com o instante
   * que o serviço passa a usar — o do congelamento.
   */
  const analise = analiseDoArtigo("GOOGLE");
  const congelado = radarFrozenObservedAtOfAnalysis(analise.payload);
  assert.equal(congelado, "2026-09-10T13:00:00.000Z");
  const resolver = () => resolveRadarCanonicalDossier({
    analysis: analise as never, article: FUNDAMENTO, observedAt: congelado!, authorities: autoridadesCheias(),
  });
  const primeiro = resolver(); const segundo = resolver();
  assert.equal(primeiro.ok && segundo.ok, true);
  if (!primeiro.ok || !segundo.ok) return;
  assert.equal(primeiro.dossier.bundle.bundleHash, segundo.dossier.bundle.bundleHash);
  assert.equal(primeiro.dossier.bundle.observedAt, "2026-09-10T13:00:00.000Z");

  /* E com a hora do clique, o hash mudaria — é exatamente o defeito que S fecha. */
  const noClique = resolveRadarCanonicalDossier({
    analysis: analise as never, article: FUNDAMENTO, observedAt: "2026-09-19T02:30:00.000Z", authorities: autoridadesCheias(),
  });
  assert.equal(noClique.ok, true);
  if (noClique.ok) assert.notEqual(noClique.dossier.bundle.bundleHash, primeiro.dossier.bundle.bundleHash, "o instante deixou de entrar no hash? então esta prova perdeu o sentido");
});
