import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sendRadarToPlanner, type RadarPlannerHandoffPorts } from "../lib/server/radar-planner-send.ts";
import {
  radarCanonicalEvidenceIndex,
  resolveRadarCanonicalDossier,
  type RadarCanonicalDossier,
} from "../lib/server/radar-canonical-dossier.ts";
import {
  radarSpecialistLayerIsWorthDelivering,
  radarVideoLayerIsWorthDelivering,
  type RadarCanonicalAuthorities,
} from "../lib/server/radar-canonical-authorities.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarSpecialistEvidenceLayer } from "../lib/radar/specialist-evidence.ts";
import { buildRadarVideoEvidenceLayer } from "../lib/radar/video-evidence.ts";
import { radarSpecialistExtraction } from "../lib/radar/specialist-contribution-review.ts";
import { radarPortableSpecialistContext, radarPortableVideoContext, radarSpecialistContextMarkdown } from "../lib/radar/portable-annex-context.ts";
import { buildRadarPortableExportRow } from "../lib/radar/portable-export.ts";
import { radarPortableFlatSections, radarPortableEditorialOf } from "../lib/radar/portable-read-model.ts";
import { RADAR_EVIDENCE_BUNDLE_VERSION } from "../lib/radar/evidence-bundle.ts";
import type { RadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarYoutubeSearchRunSchema, type RadarYoutubeSearchRun } from "../lib/radar/youtube-search-run.ts";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ===== RADAR_CANONICAL_DOSSIER_PARITY_1 · A ÚLTIMA DIVERGÊNCIA =====
 *
 * ==================== O QUE ESTA SUÍTE PROVA ====================
 *
 * O export portátil aprendeu a ler a fotografia do Google, a biblioteca de
 * vídeos e as contribuições do especialista. O envio ao Planejador não.
 *
 * O resultado era o oposto do que o dossiê canônico existe para garantir: o
 * MESMO artigo saía completo num CSV que vai para FORA da plataforma e
 * incompleto no pacote que alimenta o módulo seguinte DELA.
 *
 * ==================== §1 · PARIDADE SEMÂNTICA, NÃO DE FORMATAÇÃO ====================
 *
 * O Planejador não recebe `writer_brief_md` nem `competitive_radiography_md` —
 * eles são READ MODELS portáteis. O que ele precisa receber são as mesmas
 * EVIDÊNCIAS que permitem ao export construí-los.
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

/* ==================== a investigação real do Google ==================== */

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
  article: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 41000, kgrScore: 0.589, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU", semanticState: "QUALIFIED" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const vistaDoGoogle = () => buildRadarDeepResearchView({
  context: contexto(),
  snapshot: { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-10T12:00:00.000Z",
});

/* ==================== §13 · a contribuição e o vídeo reais ==================== */

const CONTRIBUICAO = "Quem tem pele oleosa não precisa evitar hidratante: precisa de textura leve, sem óleo.";
const TRECHO = "A ordem certa é limpeza, depois o ativo, e o hidratante por último.";

const camadaDoEspecialista = () => buildRadarSpecialistEvidenceLayer({
  binding: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc" },
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

const SEM_AUTORIDADES: RadarCanonicalAuthorities = {
  google: null, video: null, specialist: null, researchContext: null,
};

/* ============================== o mundo do envio ============================== */

/*
 * ===== O ENVIO ACONTECE SOBRE O PERFIL DE VÍDEO — e é deliberado =====
 *
 * O caminho do GOOGLE exige um  com hash íntegro,
 * que é uma fixtura de outra suíte. O que este gate precisa provar é que as
 * CAMADAS atravessam a fronteira — e elas atravessam igual nos três perfis,
 * porque quem as carrega é o dossiê, não o perfil.
 *
 * A fotografia do Google continua exercitada acima, onde §6 e §7 pedem o
 * modelo observado.
 */
const corridaYoutube = (): RadarYoutubeSearchRun => RadarYoutubeSearchRunSchema.parse({
  researchMode: "YOUTUBE", runId: "run-yt-1", runVersion: 1,
  startedAt: "2026-09-14T09:00:00.000Z", startedBy: "user-1", state: "COLLECTED",
  fingerprint: {
    articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
    queryIds: ["ytq:1"], signature: "assinatura-yt",
  },
  provenance: {
    provider: "dataforseo", endpoint: "/v3/serp/youtube/organic/live/advanced",
    queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    collectedAt: "2026-09-14T09:00:00.000Z",
  },
  queries: [], results: [], universe: [],
  limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
});

const congeladaYoutube = () => ({
  frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "user-1",
  runRef: {
    runId: "run-yt-1", runVersion: 1, runFingerprint: "assinatura-yt",
    collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo",
    endpoint: "/v3/serp/youtube/organic/live/advanced",
    queriesExecuted: 3, universeSize: 38, selectedVideoIds: [],
  },
  run: null,
  blueprint: buildRadarYoutubeBlueprint({
    run: corridaYoutube(), declaredIntent: "informacional",
    editorialTopics: [], generatedAt: "2026-09-14T10:00:00.000Z",
  }),
  multimodal: null,
  limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
});

const FUNDAMENTO = {
  brandId: "marca-1", articleId: "artigo-1",
  articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
};

const analiseDoArtigo = (perfil: "GOOGLE" | "YOUTUBE" = "GOOGLE") => {
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
    researchTransport: "FULL", mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "approved", humanNotes: [], approvedAt: null, approvedBy: null,
  });

  const payload = (perfil === "YOUTUBE"
    ? { ...base, youtubeFrozenInvestigation: congeladaYoutube() }
    : {
      ...base,
      finalizedBundle: {
        frozenAt: "2026-09-10T13:00:00.000Z", frozenBy: "user-1",
        limitations: ["Nenhuma página de concorrente foi visitada além da extração."],
      },
    }) as typeof base;

  return {
    versionId: "analysis-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
    previousVersionId: null, contentHash: "sha256:analysis", origin: "human" as const,
    changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
    payload,
  };
};

const dossieCanonico = (autoridades: RadarCanonicalAuthorities, perfil: "GOOGLE" | "YOUTUBE" = "GOOGLE"): RadarCanonicalDossier => {
  const resultado = resolveRadarCanonicalDossier({
    analysis: analiseDoArtigo(perfil) as never,
    article: FUNDAMENTO,
    observedAt: "2026-09-17T12:00:00.000Z",
    authorities: autoridades,
  });
  assert.equal(resultado.ok, true, "a bancada precisa resolver um dossiê");
  if (!resultado.ok) throw new Error("dossiê não resolvido");
  return resultado.dossier;
};

/**
 * O ENVIO REAL, CONTRA PORTAS — e o que ele GRAVA fica capturado.
 *
 * O que interessa não é a resposta do serviço: é o `plannerBundle` que ele
 * persiste, porque é ele que o Planejador lê depois.
 */
async function enviar(autoridades: RadarCanonicalAuthorities) {
  const analises = [analiseDoArtigo("YOUTUBE")];
  const itemRadar = {
    id: "wf-radar-1", marca_id: "marca-1", article_id: "artigo-1", stage: "radar",
    state: "approved", lock_version: 1,
    payload: {
      title: "Artigo", slug: "artigo", siloId: "silo-1", hierarchy: "pilar",
      principalKeywordId: "kw-1", format: "artigo", intent: "informacional", unitType: "article",
      articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
    },
    source_version_id: "dna-v3", source_content_hash: "sha256:abc",
    created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
  };

  let gravada: { payload: { plannerBundle: unknown } } | null = null;
  let destino: typeof itemRadar | null = null;
  const chamadas: string[] = [];

  const portas: RadarPlannerHandoffPorts = {
    loadCanonicalAuthorities: async () => { chamadas.push("loadCanonicalAuthorities"); return autoridades; },
    loadRadarState: async () => {
      chamadas.push("loadRadarState");
      return { lockVersion: 1, analyses: (gravada ? [...analises, gravada] : analises) as never };
    },
    appendAnalysis: async ({ analysis }) => {
      chamadas.push("appendAnalysis");
      gravada = analysis as never;
    },
    loadArticleFoundation: async () => FUNDAMENTO,
    /* O destino nasce ausente e passa a existir depois da importação. */
    findWorkflowItem: async ({ stage }) => (stage === "radar" ? itemRadar : destino) as never,
    importPlannerItem: async () => {
      chamadas.push("importPlannerItem");
      destino = { ...itemRadar, id: "wf-planner-1", stage: "planner", state: "draft" };
      return { id: destino.id };
    },
    transitionRadar: async () => { chamadas.push("transitionRadar"); },
    appendDecision: async () => { chamadas.push("appendDecision"); },
  };

  const resultado = await sendRadarToPlanner(
    { brandId: "marca-1", articleId: "artigo-1", actorId: "user-1", sentAt: "2026-09-17T12:00:00.000Z" },
    portas,
  );

  /*
   * O campo do bundle é declarado como desconhecido no contrato de propósito: o
   * registro é o ENVELOPE, e a validação do conteúdo é do V3. Aqui a leitura
   * é tipada porque o teste sabe o que acabou de mandar gravar.
   */
  const plannerBundle = resultado.record as typeof resultado.record & { bundle: RadarEvidenceBundle };
  return { resultado, chamadas, plannerBundle };
}

/* ================================ §2 · a auditoria ================================ */

test("§2 · a auditoria: toda autoridade factual nasce no dossiê canônico", async () => {
  const dossie = dossieCanonico(autoridadesCheias());

  /*
   * ===== A TABELA QUE ESTE GATE EXISTE PARA FECHAR =====
   *
   * Cada linha é uma autoridade e onde ela está. Antes do PARITY_1, as três
   * últimas eram `IN_EXPORT` e nada mais — e era isso que fazia do export uma
   * segunda autoridade.
   */
  const auditoria = {
    ARTICLE_DNA: Boolean(dossie.bundle.binding.articleDnaVersionId),
    GOOGLE: Boolean(dossie.bundle.observed),
    YOUTUBE_SERP: dossie.profile !== "YOUTUBE" || Boolean(dossie.bundle.research.youtube),
    VIDEO_LIBRARY: Boolean(dossie.bundle.video),
    SPECIALIST: Boolean(dossie.bundle.specialist),
    AMAZON: dossie.profile !== "AMAZON" || Boolean(dossie.bundle.research.amazon),
    BLUEPRINT: Boolean(dossie.bundle.competitiveBlueprint),
    INTERNAL_LINKS: Boolean(dossie.bundle.observed?.internalLinkPlan),
    LIMITATIONS: dossie.bundle.limitations.length > 0,
  };

  for (const [autoridade, presente] of Object.entries(auditoria)) {
    assert.equal(presente, true, `§2 · ${autoridade} não está no dossiê canônico`);
  }

  /*
   * §8 · O DNA DAS KEYWORDS ATRAVESSA POR REFERÊNCIA, e isso é deliberado.
   *
   * Volume, KGR, intenção e contribuição estratégica vivem no ArticleDNA, que o
   * dossiê identifica por versão e hash. Copiá-los para o bundle duplicaria o
   * Minerador dentro do handoff — que é exatamente o que §8 proíbe.
   */
  assert.equal(dossie.bundle.binding.articleDnaVersionId, "dna-v3");
  assert.equal(dossie.bundle.binding.articleDnaContentHash, "sha256:abc");

  /* §9 · e o export não tem mais leitura própria de autoridade nenhuma. */
  const anexos = await readFile(new URL("../lib/radar/portable-annex-context.ts", import.meta.url), "utf8");
  const semComentarios = anexos.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.equal(/from\(|supabase|\.select\(|fetch\(/.test(semComentarios), false,
    "§9 · a projeção portátil voltou a ler autoridade por conta própria");
});

/* ================================ §3, §4 e §13 ================================ */

test("§13 · o especialista e o vídeo chegam ao dossiê, ao Planejador e ao export", async () => {
  const autoridades = autoridadesCheias();
  const dossie = dossieCanonico(autoridades);

  /* 1 · o dossiê canônico. */
  assert.ok(dossie.bundle.specialist, "§4 · o especialista não chegou ao dossiê");
  assert.ok(dossie.bundle.video, "§3 · o vídeo não chegou ao dossiê");
  assert.equal(dossie.bundle.specialist!.items[0].originalText, CONTRIBUICAO);
  assert.equal(dossie.bundle.video!.results[0].extracts[0].originalText, TRECHO);

  /* 2 · o que o envio GRAVA — é isto que o Planejador lê depois. */
  const { plannerBundle } = await enviar(autoridades);
  assert.ok(plannerBundle.bundle.specialist, "§4 · o Planejador recebeu o dossiê sem especialista");
  assert.ok(plannerBundle.bundle.video, "§3 · o Planejador recebeu o dossiê sem a biblioteca de vídeos");
  assert.equal(plannerBundle.bundle.specialist!.items[0].extractedSummary, dossie.bundle.specialist!.items[0].extractedSummary);
  assert.equal(plannerBundle.bundle.video!.summary.extracts, dossie.bundle.video!.summary.extracts);

  /* 3 · e o export DERIVA os dois da mesma camada. */
  const projecaoDoVideo = radarPortableVideoContext(dossie.bundle.video);
  const projecaoDoEspecialista = radarPortableSpecialistContext(dossie.bundle.specialist);
  assert.equal(projecaoDoVideo.state, "MATCHED");
  assert.equal(projecaoDoVideo.briefs[0].extracts[0].text, TRECHO);
  assert.equal(projecaoDoEspecialista.state, "RECEIVED");
  assert.ok(projecaoDoEspecialista.items[0].contribution.includes("textura leve"));
});

test("§3 e §4 · a camada canônica não carrega infra nem canal privado", () => {
  const dossie = dossieCanonico(autoridadesCheias());
  const especialista = dossie.bundle.specialist!;

  /*
   * O CANAL É OMITIDO NA ORIGEM — §4.
   *
   * `externalUpdateId` é o id da mensagem no Telegram; `originalAssetUri` é o
   * `gs://` do áudio. Nenhum dos dois diz nada sobre o conteúdo editorial.
   */
  assert.equal(especialista.items[0].provenance.externalUpdateId, null);
  assert.equal(especialista.items[0].provenance.originalAssetUri, null);
  assert.equal(especialista.items[0].provenance.checksum, null);

  /* E a projeção que sai da plataforma não leva nem a identidade de domínio. */
  const fora = JSON.stringify(radarPortableSpecialistContext(especialista));
  for (const proibido of ["expertId", "contributionId", "briefId", "requirementId", "telegram"]) {
    assert.equal(fora.toLowerCase().includes(proibido.toLowerCase()), false, `§4 · ${proibido} saiu da plataforma`);
  }

  const foraDoVideo = JSON.stringify(radarPortableVideoContext(dossie.bundle.video));
  for (const proibido of ["videoSourceId", "matchingRunId", "inputFingerprint", "gs://", "segmentIndexes"]) {
    assert.equal(foraDoVideo.includes(proibido), false, `§3 · ${proibido} saiu da plataforma`);
  }
});

/* ================================ §6 ================================ */

test("§6 · todo evidenceRef do blueprint resolve no dossiê entregue", () => {
  const dossie = dossieCanonico(autoridadesCheias());
  const indice = radarCanonicalEvidenceIndex(dossie);

  const editorial = radarPortableEditorialOf({
    profile: dossie.profile,
    principalKeyword: "skincare para pele oleosa",
    articleModel: dossie.authorities?.google?.articleModel ?? null,
  });

  const refs = (dossie.authorities?.google?.articleModel.sections || [])
    .flatMap(function achatar(secao): string[] {
      return [...secao.evidenceRefs, ...secao.childSections.flatMap(achatar)];
    });

  assert.ok(refs.length > 0, "§6 · a bancada precisa referenciar evidência");
  assert.ok(radarPortableFlatSections(editorial.sections).length > 0);

  for (const ref of refs) {
    const resolvido = indice.get(ref);
    assert.ok(resolvido, `§6 · evidenceRef inalcançável no dossiê entregue: ${ref}`);
    /*
     * E A RESOLUÇÃO APONTA PARA DENTRO DO BUNDLE, não para um índice paralelo.
     *
     * Um índice que resolvesse a partir de algo que o Planejador não recebe
     * responderia "sim" à pergunta errada.
     */
    assert.match(resolvido!.locator, /^observed\./);
    assert.ok(resolvido!.evidence.length > 0);
  }
});

/* ================================ §7 ================================ */

test("§7 · a relação seção → evidência é recuperável do dossiê, não só do CSV", () => {
  const dossie = dossieCanonico(autoridadesCheias());

  /*
   * §7 · A ASSOCIAÇÃO NÃO PODE SER CONVENIÊNCIA DO CSV.
   *
   * Tudo o que o `section_evidence_json` monta sai de três campos que o
   * Planejador recebe: as seções do artigo-modelo (com `evidenceRefs`), a pauta
   * de vídeo (com `relatedSectionTitle`) e a contribuição (com `editorialUse`).
   */
  const secoes = dossie.authorities?.google?.articleModel.sections || [];
  assert.ok(secoes.some(item => item.evidenceRefs.length > 0), "§7 · seção sem referência de evidência");
  assert.ok(secoes.some(item => item.factualRequirement || item.specialistRequirement || item.evidenceStrength),
    "§7 · seção sem necessidade de fonte declarada");

  assert.equal(dossie.bundle.video!.results[0].relatedSectionTitle, "Rotina de cuidados para pele oleosa");
  assert.match(dossie.bundle.specialist!.items[0].editorialUse, /pele fica oleosa/);

  /* E as limitações da seção continuam sendo as do dossiê, não uma lista nova. */
  assert.ok(dossie.bundle.limitations.length > 0);
});

/* ================================ §15 ================================ */

test("§15 · paridade semântica entre canônico, Planejador e export", async () => {
  const autoridades = autoridadesCheias();
  /* A comparação é sobre a MESMA análise: o envio roda sobre o perfil de vídeo. */
  const dossie = dossieCanonico(autoridades, "YOUTUBE");
  const { plannerBundle } = await enviar(autoridades);

  const projecao = buildRadarPortableExportRow({
    profile: dossie.profile,
    blueprintView: dossie.blueprintView,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "skincare para pele oleosa",
      secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Informacional", funnel: "Topo", siloName: "skincare", articleRole: "SUPORTE",
      slug: "skincare-pele-oleosa", mustCover: ["identificação da pele oleosa"],
    },
    articleModel: autoridades.google?.articleModel ?? null,
    googleObserved: autoridades.google?.observed ?? null,
    researchContext: autoridades.researchContext,
    videoContext: radarPortableVideoContext(dossie.bundle.video),
    specialistContext: radarPortableSpecialistContext(dossie.bundle.specialist),
    researchLimitations: dossie.bundle.limitations,
  });

  /*
   * §15 · A COMPARAÇÃO É SEMÂNTICA, e é de propósito.
   *
   * Exigir que o Planejador receba Markdown transformaria um read model em
   * contrato. O que precisa coincidir é a EVIDÊNCIA: identidade do fundamento,
   * identidade do dossiê, perfil, limitações e as camadas quando existem.
   */
  assert.equal(plannerBundle.binding.articleDnaVersionId, dossie.bundle.binding.articleDnaVersionId);
  assert.equal(plannerBundle.binding.articleDnaContentHash, dossie.bundle.binding.articleDnaContentHash);
  assert.equal(plannerBundle.bundleId, dossie.bundle.bundleId);
  assert.equal(plannerBundle.bundleHash, dossie.bundle.bundleHash);
  assert.equal(plannerBundle.primaryResearchProfile, dossie.profile);

  assert.deepEqual(plannerBundle.bundle.limitations, dossie.bundle.limitations);
  assert.equal(plannerBundle.bundle.competitiveBlueprint?.articleId, dossie.bundle.competitiveBlueprint?.articleId);

  /* O export leva as MESMAS limitações, com a formatação dele. */
  for (const limitacao of dossie.bundle.limitations) {
    assert.ok(projecao.limitations_md.includes(limitacao), `§15 · limitação perdida no export: ${limitacao}`);
  }

  /* E as duas camadas aparecem nos dois lados. */
  assert.ok(plannerBundle.bundle.video && projecao.video_context_md.includes(TRECHO));
  assert.ok(plannerBundle.bundle.specialist && projecao.specialist_context_md.includes(CONTRIBUICAO));

  /* §1 · o Planejador NÃO recebe read model portátil. */
  const pacote = JSON.stringify(plannerBundle);
  for (const readModel of ["writer_brief_md", "writer_context_md", "competitive_radiography_md", "# MISSÃO"]) {
    assert.equal(pacote.includes(readModel), false, `§1 · read model portátil no handoff: ${readModel}`);
  }
});

/* ================================ §14 ================================ */

test("§14 · artigo sem vídeo e sem especialista continua válido", async () => {
  const dossie = dossieCanonico(SEM_AUTORIDADES);

  /*
   * §14 · AUSÊNCIA NÃO VIRA CAMADA VAZIA.
   *
   * `null` diz "não houve". Uma camada com `items: []` diria "houve e ninguém
   * decidiu" — e chegaria ao Planejador com o peso de um resultado.
   */
  assert.equal(dossie.bundle.video, null);
  assert.equal(dossie.bundle.specialist, null);

  const { plannerBundle } = await enviar(SEM_AUTORIDADES);
  assert.equal(plannerBundle.bundle.video, null);
  assert.equal(plannerBundle.bundle.specialist, null);

  /* E o export diz isso em voz alta, em vez de deixar a célula vazia. */
  assert.match(radarPortableVideoContext(null).note, /Nenhum vídeo da biblioteca/);
  assert.match(radarPortableSpecialistContext(null).note, /Nenhuma contribuição especializada recebida/);
});

/* ================================ §10 e §11 ================================ */

test("§10 e §11 · nenhum contrato novo, nenhuma segunda rota de envio", async () => {
  /* O envelope do Planejador continua o V3 — só que agora preenchido. */
  assert.equal(RADAR_EVIDENCE_BUNDLE_VERSION, 3);

  const dossie = dossieCanonico(autoridadesCheias());
  assert.equal(dossie.bundle.bundleVersion, 3);

  const envio = await readFile(new URL("../lib/server/radar-planner-send.ts", import.meta.url), "utf8");
  const semComentarios = envio.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  /* §11 · a ordem do envio continua a mesma, com uma leitura a mais no começo. */
  assert.match(semComentarios, /portas\.loadCanonicalAuthorities\(\{/);
  assert.match(semComentarios, /resolveRadarCanonicalDossier\(\{[^}]*authorities: autoridades/);
  assert.equal(/RadarEvidenceBundleV4|bundleVersion: 4/.test(semComentarios), false, "§10 · contrato novo");

  /* E o envio continua sendo a ÚNICA autoridade de envio. */
  assert.match(semComentarios, /export async function sendRadarToPlanner/);
});

test("§11 · a ordem dos passos do envio não mudou", async () => {
  const { chamadas } = await enviar(autoridadesCheias());

  /*
   * A LEITURA DAS AUTORIDADES ACONTECE ANTES DA RESOLUÇÃO, e a gravação
   * continua depois dela. Inverter qualquer um dos dois produziria um dossiê
   * gravado sem as camadas — que é o defeito que este gate fecha.
   */
  assert.ok(chamadas.indexOf("loadCanonicalAuthorities") < chamadas.indexOf("appendAnalysis"));
  assert.ok(chamadas.indexOf("appendAnalysis") < chamadas.indexOf("transitionRadar"));
  assert.ok(chamadas.indexOf("transitionRadar") < chamadas.indexOf("appendDecision"));
});

/* ================================ §17 ================================ */

test("§17 · nada aqui coleta, chama IA, grava fundamento ou migra", async () => {
  for (const caminho of [
    "../lib/server/radar-canonical-authorities.ts",
    "../lib/server/radar-canonical-dossier.ts",
    "../lib/radar/portable-annex-context.ts",
  ]) {
    const fonte = await readFile(new URL(caminho, import.meta.url), "utf8");
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    assert.equal(/dataforseo|openai|anthropic|executeDataForSeo/i.test(semComentarios), false, `§17 · ${caminho} chama provider ou IA`);
    assert.equal(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(semComentarios), false, `§17 · ${caminho} grava`);
  }

  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(/canonical-authorities|portable-annex/.test(arquiteto), false, "§17 · ARTICLE_DNA_MUTATED");
});

/* ============================== a sentinela ============================== */

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});

/* ==================== os sobreviventes da bateria, fechados ==================== */

test("§14 · a decisão de ausência é pura, e ela é o que impede a camada vazia", () => {
  /*
   * As duas decisões vivem fora do leitor de banco de propósito: regra de
   * negócio escondida atrás de I/O é regra que ninguém protege.
   */
  assert.equal(radarVideoLayerIsWorthDelivering({ briefs: [], run: null, frozenBundleId: null }), false);
  assert.equal(radarVideoLayerIsWorthDelivering({ briefs: [{}], run: null, frozenBundleId: "fb1" }), false,
    "§14 · pauta sem execução de casamento não é camada");
  assert.equal(radarVideoLayerIsWorthDelivering({ briefs: [{}], run: {}, frozenBundleId: null }), false);
  assert.equal(radarVideoLayerIsWorthDelivering({ briefs: [{}], run: {}, frozenBundleId: "fb1" }), true);

  assert.equal(radarSpecialistLayerIsWorthDelivering({ items: [], notApproved: 0, rejected: 0 }), false);
  /*
   * ESTA É A DISTINÇÃO QUE IMPORTA.
   *
   * Nenhum item ativo com três respostas não decididas diz "houve resposta e
   * ninguém decidiu" — informação de planejamento. Tudo zerado diz "não houve".
   */
  assert.equal(radarSpecialistLayerIsWorthDelivering({ items: [], notApproved: 3, rejected: 0 }), true);
  assert.equal(radarSpecialistLayerIsWorthDelivering({ items: [], notApproved: 0, rejected: 2 }), true);
  assert.equal(radarSpecialistLayerIsWorthDelivering({ items: [{}], notApproved: 0, rejected: 0 }), true);
});

test("§6 · a resolução alcança o conceito, e não só a pergunta", () => {
  const dossie = dossieCanonico(autoridadesCheias());
  const resolvidos = [...radarCanonicalEvidenceIndex(dossie).values()];

  assert.ok(resolvidos.length > 0, "§6 · o índice ficou vazio");

  /*
   * O ÍNDICE PRECISA ALCANÇAR AS PORTAS DA FOTOGRAFIA.
   *
   * Um índice que só resolvesse perguntas responderia "sim" a metade dos refs
   * e "não" à outra metade — e o teste de alcançabilidade continuaria verde
   * enquanto a metade que importa ficasse fora.
   */
  const portas = new Set(resolvidos.map(item => item.locator));
  assert.ok(portas.has("observed.concepts"), `§6 · nenhum ref resolveu por conceito; portas: ${[...portas].join(", ")}`);

  /* E cada resolução aponta para algo que está MESMO dentro do bundle. */
  const rotulos = new Set([
    ...dossie.bundle.observed!.concepts.all.map(item => item.canonicalLabel),
    ...dossie.bundle.observed!.questions.map(item => item.canonicalQuestion),
    ...dossie.bundle.observed!.gaps.map(item => item.subject),
  ]);
  for (const item of resolvidos) {
    assert.ok(rotulos.has(item.label), `§6 · a resolução aponta para fora do bundle: ${item.label}`);
  }
});

test("§4 · a contribuição de APOIO chega com a ressalva que ela exige", () => {
  const apoio = buildRadarSpecialistEvidenceLayer({
    binding: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc" },
    preparedRequirements: 1,
    sources: [{
      extraction: radarSpecialistExtraction({
        contributionId: "c2", expertId: "e1", briefId: "bf1", requirementId: "req-2",
        sourceType: "TEXT", originalText: "Costumo sugerir textura em gel.", transcriptText: null,
        externalUpdateId: null, originalAssetUri: null, checksum: null,
        receivedAt: "2026-09-16T10:00:00.000Z", decision: "SUPPORT_ONLY",
      }),
      requirementQuestion: "Que textura funciona?", requirementKind: "CLAIM",
      sentQuestions: [], expertDisplayName: null,
    }],
  });

  const projecao = radarPortableSpecialistContext(apoio);

  /*
   * "APOIO" NÃO SUSTENTA AFIRMAÇÃO FACTUAL, e isso precisa viajar.
   *
   * Quem marcou a contribuição como apoio decidiu que ela ORIENTA o texto. Sem
   * a ressalva, ela chega lá fora com o mesmo peso de uma evidência aceita — e
   * vira afirmação atribuída a um profissional.
   */
  assert.equal(projecao.items.length, 1);
  assert.match(projecao.items[0].limitations[0], /APOIO/);
  assert.match(radarSpecialistContextMarkdown(projecao), /Limitações:/);
});

test("§14 · casamento sem trecho nenhum não se apresenta como casado", () => {
  const semTrecho = buildRadarVideoEvidenceLayer({
    identity: {
      frozenBundleId: "fb1", frozenBundleHash: null,
      matchingRunId: "run-2", inputFingerprint: "m4:vs1@v1",
      matcherVersion: 4, matchedAt: "2026-09-16T13:00:00.000Z",
    },
    briefs: [{
      briefId: "vb9", topic: "Tempo de espera",
      narrativePurpose: "Mostrar o intervalo entre os passos.",
      whatToLookFor: ["tempo entre camadas"],
      relatedSectionId: null, relatedSectionTitle: null,
      questions: [], entities: [], evidenceNeeded: "Intervalo declarado.", priority: "HIGH",
    }],
    coverage: [],
    sources: [],
  });

  /*
   * "CASOU E NÃO ACHOU NADA" É UM RESULTADO — e ele não pode se apresentar
   * como "há material disponível". Quem lê age diferente em cada caso: um pede
   * outra fonte, o outro pede outra execução.
   */
  const projecao = radarPortableVideoContext(semTrecho);
  assert.equal(projecao.state, "NO_MATCHING");
  assert.match(projecao.note, /nenhum trecho sustentou/);
  assert.equal(projecao.briefs[0].coverage, "Não encontrada no material disponível");
});

test("§9 e §10 · a projeção lê o bundle, e o contrato não ganhou versão nova", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  /*
   * §9 · A PROJEÇÃO SAI DO QUE O PLANEJADOR RECEBE.
   *
   * Projetar a partir das autoridades dá o mesmo resultado HOJE — e deixaria de
   * dar no dia em que a resolução filtrasse alguma coisa. O CSV passaria a
   * mostrar o que o Planejador não recebeu, que é a divergência inteira deste
   * gate voltando pela porta dos fundos.
   */
  assert.match(semComentarios, /radarPortableVideoContext\(bundle\.video\)/);
  assert.match(semComentarios, /radarPortableSpecialistContext\(bundle\.specialist\)/);

  /* §10 · e o envelope do Planejador continua sendo um só. */
  const contrato = await readFile(new URL("../lib/radar/evidence-bundle.ts", import.meta.url), "utf8");
  const versoes = [...contrato.matchAll(/RADAR_EVIDENCE_BUNDLE[A-Z_]*_VERSION|RADAR_EVIDENCE_BUNDLE_V\d/g)].map(item => item[0]);
  assert.deepEqual([...new Set(versoes)], ["RADAR_EVIDENCE_BUNDLE_VERSION"], "§10 · apareceu uma segunda versão de contrato");
});
