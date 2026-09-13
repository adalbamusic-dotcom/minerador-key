import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RADAR_DEFAULT_SEARCH_MODE, RADAR_YOUTUBE_SOURCE_COVERAGE, radarResultBelongsToMode, radarSearchModeAvailability, radarSearchModeChange, radarSearchModeLabel, splitRadarResultsByMode } from "../lib/radar/search-mode.ts";
import { buildRadarVideoCompetitiveModel, radarVideoChannel } from "../lib/radar/video-competitive-model.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { resolveRadarArticlePurpose, resolveRadarDossierPlan } from "../lib/radar/dossier-routing.ts";
import { assessRadarYmylRelevance, readRadarEeatSignals } from "../lib/radar/editorial-policy.ts";
import { radarDeclaredFunnel } from "../lib/radar/ai-discovery-context.ts";
import { RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarResearchReference } from "../lib/radar/research-reference.ts";

/*
 * ======  FASE 1 · MODOS DE PESQUISA, ROTEAMENTO E POLÍTICA EDITORIAL  =====
 *
 * Web e YouTube são universos diferentes e produzem benchmarks diferentes.
 * Nem todo artigo precisa de todo dossiê. E o tema decide a exigência de
 * evidência — não um score inventado.
 */

const contexto = (patch: Record<string, unknown> = {}, keywords: unknown[] = []) => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna", articleDnaContentHash: null, promise: "Rotina de skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Pilar" },
  keywords, editorialTopics: ["limpeza facial"], resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
  ...patch,
} as unknown as RadarArticleResearchContext);

const keyword = (patch: { role?: string; intent?: string; editorialType?: string; reviewCandidate?: boolean; productResearch?: boolean; funnel?: string } = {}) => ({
  identity: { keywordId: "kw", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "v", text: "keyword", role: patch.role || "principal" },
  strategy: {
    volume: null, resultCount: null, kgrScore: null, incrementalVolume: null, contribution: null,
    normalizedIntent: patch.intent || "informational", coveredIntentions: [], strategicContribution: null,
    purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null,
    keywordDnaSnapshot: { payload: { likelyEditorialType: patch.editorialType || "guide", reviewCandidate: patch.reviewCandidate || false, productResearchRequired: patch.productResearch || false } },
    semanticQualification: { versionId: "sq", contentHash: "h", intent: patch.intent || "informacional", funnel: patch.funnel || "consideracao", semanticState: "conclusive", collectedAt: "2026-09-09T10:00:00.000Z" },
  },
  resolution: "FULL",
  provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "v", keywordDnaContentHash: "h" },
});

/* ------------------------ A, B, C · modo de pesquisa --------------------- */

test("A · o modo padrão é WEB", () => {
  assert.equal(RADAR_DEFAULT_SEARCH_MODE, "WEB");
  assert.equal(radarSearchModeLabel("WEB"), "Google");
  assert.equal(radarSearchModeLabel("YOUTUBE"), "YouTube");
  assert.equal(radarSearchModeLabel("AMAZON"), "Amazon");

  /* GATE 2 · a casca reconhece os três, mas só oferece o que tem engine. */
  assert.equal(radarSearchModeAvailability("WEB").canStart, true);
  assert.equal(radarSearchModeAvailability("AMAZON").canStart, false);
  assert.match(radarSearchModeAvailability("AMAZON").reason || "", /ainda não foi construída/);
});

test("B e C · cada modo começa por clique, e trocar com investigação em curso avisa", () => {
  const workbench = readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8");
  assert.ok(workbench.includes('data-testid="radar-search-mode"'), "o seletor existe no painel");
  assert.ok(workbench.includes("radar-search-mode-${modo.toLowerCase()}"), "com um botão por modo");
  assert.ok(workbench.includes('(["WEB", "YOUTUBE", "AMAZON"] as const)'), "os três modos da casca");
  assert.ok(workbench.includes('role="radiogroup"'), "seleção única, nunca checkbox múltiplo");
  /* A troca some depois de iniciar: o modo congela com a investigação. */
  assert.ok(workbench.includes("const congelado = view.state !== \"NOT_STARTED\";"));
  assert.ok(workbench.includes("disabled={busy || congelado}"));

  const semInvestigacao = radarSearchModeChange({ current: "WEB", next: "YOUTUBE", hasInvestigation: false });
  assert.equal(semInvestigacao.requiresReset, false);
  const comInvestigacao = radarSearchModeChange({ current: "WEB", next: "YOUTUBE", hasInvestigation: true });
  assert.equal(comInvestigacao.allowed, true);
  assert.equal(comInvestigacao.requiresReset, true);
  assert.match(comInvestigacao.message || "", /descarta o resultado vigente/);

  /* E a página só inicia por ação humana, com o modo escolhido antes. */
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(page, /const modoDaPesquisa = searchModeByArticle\[target\.articleId\] \|\| RADAR_DEFAULT_SEARCH_MODE/);
  assert.match(page, /primarySearchMode: modoDaPesquisa/);
});

/* --------------------- D e E · os universos não se misturam -------------- */

const referencia = (patch: Partial<RadarResearchReference> & { tipo?: string }): RadarResearchReference => ({
  referenceId: "research:1", normalizedUrl: "exemplo.com/p", url: "https://exemplo.com/p",
  domain: "exemplo.com", title: "Página", queryCount: 1,
  appearances: [{ queryExecutionId: "q1", keywordId: "kw", keyword: "k", keywordRole: "principal", sourceType: "canonical", rank: 1, resultType: patch.tipo || "article" }],
  principalRank: 1, secondaryRanks: [], reinforcementRanks: [],
  classification: "EDITORIAL_COMPETITOR", classificationReason: "motivo",
  intentCompatibility: "unknown", entityCompatibility: "unknown", siloCompatibility: "external",
  formationSerpSeen: false, formationContext: null,
  ...patch,
});

test("D · no modo WEB, vídeo não entra no benchmark editorial", () => {
  assert.equal(radarResultBelongsToMode("WEB", "article"), true);
  assert.equal(radarResultBelongsToMode("WEB", "video"), false);

  const decidida = autoDecideRadarReference(referencia({ tipo: "video" }), "WEB");
  assert.equal(decidida.decision, "format", "vídeo vira formato observado, não página do benchmark");
  assert.match(decidida.reason, /fora do benchmark de texto/);

  const divisao = splitRadarResultsByMode("WEB", [{ inferredType: "article" }, { inferredType: "video" }, { inferredType: "product" }]);
  assert.equal(divisao.sample.length, 2);
  assert.equal(divisao.crossReference.length, 1, "o vídeo continua visível como referência cruzada");
});

test("E · no modo YOUTUBE, artigo não entra no benchmark de vídeo", () => {
  assert.equal(radarResultBelongsToMode("YOUTUBE", "video"), true);
  assert.equal(radarResultBelongsToMode("YOUTUBE", "article"), false);

  const decidida = autoDecideRadarReference(referencia({ tipo: "article" }), "YOUTUBE");
  assert.equal(decidida.decision, "excluded");
  assert.match(decidida.reason, /fora do benchmark audiovisual/);

  const video = autoDecideRadarReference(referencia({ tipo: "video" }), "YOUTUBE");
  assert.equal(video.decision, "primary", "o vídeo é o concorrente no modo vídeo");
});

test("F e G · a principal continua canônica e as auxiliares respeitam o modo", () => {
  const page = readFileSync("modules/radar/radar-page.tsx", "utf8");
  /* O modo entra na seleção automática — que decide amostra de TODAS as consultas. */
  assert.match(page, /mode: modoDaPesquisa/);
  const auto = readFileSync("lib/radar/research-auto-selection.ts", "utf8");
  assert.match(auto, /const mode = input\.mode \|\| input\.record\.primarySearchMode \|\| RADAR_DEFAULT_SEARCH_MODE/);
  assert.match(auto, /autoDecideRadarReference\(reference, mode\)/);
});

/* ----------------------- o modelo competitivo de vídeo ------------------- */

test("o modelo de vídeo descreve canal e recorrência — e declara o que não viu", () => {
  const videos = [
    referencia({ referenceId: "r1", url: "https://www.youtube.com/watch?v=aaa", domain: "youtube.com", title: "Como identificar pele oleosa", tipo: "video" }),
    referencia({ referenceId: "r2", url: "https://www.youtube.com/@dermatoclara/videos", domain: "youtube.com", title: "Rotina de skincare para pele oleosa", tipo: "video", queryCount: 2 }),
  ];
  const modelo = buildRadarVideoCompetitiveModel({ references: videos, observedIntent: "informacional", queries: 2 });

  assert.equal(modelo.sample.videos, 2);
  assert.equal(modelo.observedIntent, "informacional");
  assert.equal(radarVideoChannel(videos[1]), "dermatoclara", "o canal é lido da URL quando o provider não o entrega");
  assert.ok(modelo.questionsAnswered.some(titulo => titulo.startsWith("Como")), "títulos em pergunta viram perguntas respondidas");

  /* O que exigiria a API do YouTube aparece como não observado, nunca como zero. */
  assert.ok(modelo.notObserved.some(item => /duração/.test(item)));
  assert.ok(modelo.notObserved.some(item => /transcrição/.test(item)));
  assert.ok(modelo.limitations.some(item => /API oficial do YouTube/.test(item)));
  assert.ok(RADAR_YOUTUBE_SOURCE_COVERAGE.youtubeApiRequiredFor.includes("visualizações"));
  assert.ok(RADAR_YOUTUBE_SOURCE_COVERAGE.dataForSeoHas.some(item => /título/.test(item)));

  /* E ele NÃO tenta medir vídeo com régua de artigo. */
  const fonte = readFileSync("lib/radar/video-competitive-model.ts", "utf8");
  for (const proibido of ["wordCount", "h2", "headingOutline", "paragraph"]) {
    assert.equal(fonte.includes(proibido), false, `o modelo de vídeo não mede ${proibido}`);
  }
});

/* -------------------- L e M · roteamento por dossiê ---------------------- */

test("L e M · review de produto dispensa a SERP e exige a Amazon", () => {
  const review = contexto({}, [keyword({ editorialType: "review", reviewCandidate: true })]);
  const finalidade = resolveRadarArticlePurpose(review);
  assert.equal(finalidade.purpose, "REVIEW_PRODUCT");

  const plano = resolveRadarDossierPlan({ context: review });
  assert.equal(plano.serp.required, false, "L · SERP editorial não é exigida");
  assert.equal(plano.serp.state, "NOT_REQUIRED");
  assert.match(plano.serp.reason, /a pesquisa central é a da Amazon/);
  assert.equal(plano.amazon.required, true, "M · a Amazon é o dossiê principal");
  assert.equal(plano.amazon.state, "READY");
});

test("artigo editorial exige SERP e dispensa Amazon", () => {
  const plano = resolveRadarDossierPlan({ context: contexto({}, [keyword()]) });
  assert.equal(plano.purpose, "EDITORIAL");
  assert.equal(plano.serp.required, true);
  assert.equal(plano.amazon.required, false);
  assert.equal(plano.amazon.state, "NOT_REQUIRED");
});

test("editorial com secundária comercial mantém SERP e acrescenta Amazon", () => {
  const plano = resolveRadarDossierPlan({
    context: contexto({}, [keyword(), keyword({ role: "secundaria", intent: "transacional", editorialType: "best_list" })]),
  });
  assert.equal(plano.purpose, "EDITORIAL_WITH_PRODUCT");
  assert.equal(plano.serp.required, true, "a principal continua informacional");
  assert.equal(plano.amazon.required, true);
});

/* ------------------------- I e J · YMYL e IA ---------------------------- */

test("J · tema YMYL gera exigência de evidência e revisão de especialista", () => {
  const saude = assessRadarYmylRelevance(contexto({
    article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna", articleDnaContentHash: null, promise: "Tratamento para acne e uso de medicamento", mainIntent: "informacional", hierarchy: "Pilar" },
    resolvedKeywordTexts: ["tratamento para acne"],
  }));
  assert.equal(saude.relevance, "MATERIAL");
  assert.ok(saude.signals.length >= 1);
  assert.ok(saude.evidenceRequirements.some(item => /Fonte primária/.test(item)));
  assert.equal(saude.specialistReviewRequired, true);

  const plano = resolveRadarDossierPlan({ context: contexto({}, [keyword()]), ymylRelevance: saude.relevance });
  assert.equal(plano.specialist.required, true, "K · o especialista entra por necessidade, não por padrão");
  assert.match(plano.specialist.reason, /validação e a assinatura/);

  /* Um tema sem saúde, dinheiro ou segurança não gera exigência nenhuma. */
  const neutro = assessRadarYmylRelevance(contexto({
    article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna", articleDnaContentHash: null, promise: "Como escolher uma caneta esferográfica", mainIntent: "informacional", hierarchy: "Pilar" },
    editorialTopics: [], resolvedKeywordTexts: ["caneta esferográfica"],
  }));
  assert.equal(neutro.relevance, "NONE");
  assert.equal(neutro.specialistReviewRequired, false);
  assert.deepEqual(neutro.evidenceRequirements, []);
});

test("I · o estágio de funil é lido do fundamento, e por uma autoridade só", () => {
  /*
   * A leitura de descoberta nasceu aqui como esboço e virou camada própria no
   * Gate 13. O que a Fase 1 continua guardando é o que era dela desde o começo:
   * o funil vem do fundamento, e ninguém o reclassifica no Radar.
   */
  const tofu = radarDeclaredFunnel(contexto({}, [keyword({ funnel: "tofu" })]));
  assert.equal(tofu.read, "TOFU");
  assert.equal(tofu.declared, "tofu");
  assert.match(tofu.source, /Qualificação semântica/);

  const decisao = radarDeclaredFunnel(contexto({}, [keyword({ funnel: "decisao" })]));
  assert.equal(decisao.read, "BOFU", "\"decisão\" é o vocabulário de fundo de funil");

  /* Vocabulário desconhecido não vira palpite: fica declarado e sem leitura. */
  const estranho = radarDeclaredFunnel(contexto({}, [keyword({ funnel: "indefinido" })]));
  assert.equal(estranho.read, null);
  assert.equal(estranho.declared, "indefinido");
  assert.match(estranho.reason, /não reclassifica/);

  /*
   * DUAS FUNÇÕES HOMÔNIMAS EM MÓDULOS DIFERENTES É ARMADILHA.
   *
   * O esboço saiu da política editorial quando a camada de verdade nasceu com
   * o mesmo nome. O teste guarda a consolidação: quem procurar a descoberta
   * encontra um lugar só.
   */
  const politica = readFileSync("lib/radar/editorial-policy.ts", "utf8");
  assert.equal(/lsiDensity|keywordDensity/.test(politica), false);
  assert.equal(politica.includes("export function buildRadarAiDiscoveryContext"), false, "a política editorial não define uma segunda descoberta");
  assert.equal(politica.includes("export type RadarAiDiscoveryContext"), false);

  const camada = readFileSync("lib/radar/ai-discovery-context.ts", "utf8");
  assert.ok(camada.includes("export function buildRadarAiDiscoveryContext"), "a autoridade única existe");
});

test("E-E-A-T é sinal observado, nunca nota inventada", () => {
  const pagina = (author: string | null, externos: number) => RadarExtractionPageSchema.parse({
    id: `p-${author || "sem"}-${externos}`, url: `https://x-${author || "sem"}-${externos}.com/a`, status: "success",
    fetchedAt: "2026-09-09T11:00:00.000Z", title: "t", metaDescription: "", canonical: null,
    h1: ["h"], h2: [], h3: [], wordCount: 900, internalLinkCount: 3, externalLinkCount: externos,
    listCount: 0, tableCount: 0, faqCount: 0, imageCount: 0, blockquoteCount: 0, comparisonCount: 0,
    hasDates: true, author, structuredDataTypes: ["Article"], recurringTerms: [], boldCount: 0, italicCount: 0, error: null,
  });

  const ymyl = assessRadarYmylRelevance(contexto());
  const sinais = readRadarEeatSignals({ pages: [pagina("Clara", 3), pagina("Ana", 2), pagina(null, 0)], ymyl });
  assert.equal(sinais.sampleSize, 3);
  assert.equal(sinais.withAuthor, 2);
  assert.equal(sinais.withExternalSources, 2);
  assert.ok(sinais.requirements.some(item => /assina o conteúdo/.test(item)));

  const fonte = readFileSync("lib/radar/editorial-policy.ts", "utf8");
  assert.equal(/eeatScore|authorityScore|score:/.test(fonte), false, "não existe nota de E-E-A-T");
});

/* ------------------------ H e N · o que não muda ------------------------ */

test("H · o Radar continua sem modificar nenhum fundamento upstream", () => {
  for (const modulo of [
    "lib/radar/search-mode.ts",
    "lib/radar/video-competitive-model.ts",
    "lib/radar/dossier-routing.ts",
    "lib/radar/editorial-policy.ts",
  ]) {
    const fonte = readFileSync(modulo, "utf8");
    assert.equal(/\basync\b|\bawait\b|fetch\(|supabase/.test(fonte), false, `${modulo} precisa ser domínio puro`);
    for (const upstream of ["editorial_artifact_versions", "minerador_keywords", "createVersionEnvelope", "persistArquiteto"]) {
      assert.equal(fonte.includes(upstream), false, `${modulo} não pode tocar ${upstream}`);
    }
  }
});

test("N · o fluxo continua com três ações, independentemente do modo", () => {
  const fonte = readFileSync("lib/radar/serp-phase1.ts", "utf8");
  const ids = [...new Set([...fonte.matchAll(/id: "([A-Z_]+)"/g)].map(item => item[1]))].sort();
  assert.deepEqual(ids, ["ANALYZE_COMPETITION", "FINALIZE_SERP", "NONE", "START_RESEARCH"]);
  /* Nenhum fluxo extra nasceu para o YouTube. */
  assert.equal(/YOUTUBE|VIDEO/.test(fonte), false, "o modo não cria ação nova");
});
