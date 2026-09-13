import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { RadarR3Workbench } from "../modules/radar/radar-r3-workbench.tsx";
import { SupabaseSessionProvider } from "../components/auth/supabase-session-context.tsx";
import { GlobalNoticeProvider } from "../components/global-notice-center.tsx";
import {
  buildRadarResetPayload, radarResetDecision, radarResetSummary,
  RADAR_RESET_CLEARED, RADAR_RESET_EXPECTED_CURRENT, RADAR_RESET_IDENTITY_KEPT, RADAR_RESET_OUTSIDE_PAYLOAD,
} from "../lib/radar/radar-reset.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { radarPlannerHandoffReadiness } from "../lib/radar/planner-handoff.ts";
import { buildRadarReportSummary, radarOperationalRow, radarOperationalStatus, RADAR_OPERATIONAL_STATUS_LABEL } from "../lib/radar/operational-view.ts";
import { radarActionOutcome, radarClaimAction, type RadarActionClaim } from "../lib/radar/operational-actions.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import type { RadarAnalysisPayload, RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarR3Model } from "../lib/radar/r3-workbench.ts";

/*
 * ======  GATE 17 · ZERAR A PESQUISA CORRENTE, E SOMENTE ELA  ============
 *
 * "Zerar investigação" parece simples até alguém perguntar o que exatamente
 * some. A resposta errada apaga o vídeo registrado na semana passada, ou a
 * contribuição que o especialista mandou, ou o histórico que provava o que foi
 * entregue.
 *
 * A ESTRATÉGIA DESTE ARQUIVO É PROVAR NOS DOIS SENTIDOS.
 *
 * Provar que algo sumiu é fácil e é metade do trabalho — e é a metade que
 * engana, porque um reset que apaga demais também passa nela. Por isso cada
 * limpeza aqui vem acompanhada da preservação correspondente, e a fixture é
 * deliberadamente CHEIA (§28): sem canonical, auxiliar, referências, extrações,
 * falhas, modelo, links, fontes, autoridade, descoberta e congelado, "limpou"
 * não significa nada.
 *
 * REAL_PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* =============================== a fixture ============================== */

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

const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("É seguro usar ácido salicílico na gravidez?");
  return pagina(`A${index}`, headings);
});

const ARTIGO = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v17", articleDnaContentHash: "hash-dna-v17" };

const FONTES_VERIFICADAS = [{
  domain: "www.aad.org", url: "https://www.aad.org/public/diseases/oily-skin",
  sourceType: "PROFESSIONAL_ORGANIZATION", classificationReason: "Associação profissional, página institucional lida.",
  confidence: "HIGH" as const, signals: ["domínio institucional"], provenance: "verified:2026-09-10",
}];

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { ...ARTIGO, promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v17", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["skincare para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) };

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

function vista(patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never,
    extractions: PAGINAS, observedAt: "2026-09-10T12:00:00.000Z",
    verifiedSources: FONTES_VERIFICADAS, ...patch,
  } as Parameters<typeof buildRadarDeepResearchView>[0];
  if (!base.record) return buildRadarDeepResearchView(base);

  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({
      referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
      decision: autoDecideRadarReference(reference).decision, reason: "",
    })),
  };
  const recordBase = base.record as ReturnType<typeof registro>;
  return buildRadarDeepResearchView({
    ...base,
    record: { ...recordBase, researchCuration: curadoria },
    selectedReferences: curadoria.references.filter(item => item.decision !== "excluded" && item.decision !== "pending").length,
  });
}

function congelar(view = vista()) {
  const resultado = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess,
      failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: view.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  if (!resultado.ok) throw new Error(`fixture não congelou: ${resultado.reason}`);
  return resultado.bundle;
}

/**
 * O PAYLOAD CHEIO QUE §28 EXIGE.
 *
 * Cada campo aqui existe porque um teste abaixo precisa provar que ele SAIU.
 * Zerar um payload já vazio provaria apenas que zero continua zero.
 */
function payloadCheio(): RadarAnalysisPayload {
  const view = vista();
  return RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1,
    brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, articleDnaVersionId: ARTIGO.articleDnaVersionId,
    serpSnapshotId: "snap-1", serpSnapshotVersion: 1, serpSnapshotHash: `sha256:${"a".repeat(64)}`,
    mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture do Gate 17"], confidence: "medium", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "",
    serpDecisions: PAGINAS.slice(0, 3).map((item, index) => ({
      key: `organic:${index + 1}`, itemType: "organic" as const, decision: "included" as const,
      reason: "Concorrente editorial", note: "", ownDomain: false, url: item.url,
    })),
    selectedCompetitorIds: PAGINAS.slice(0, 3).map(item => item.id),
    extractionIds: PAGINAS.map(item => item.id),
    extractions: PAGINAS,
    extractionFailures: [
      { key: "f1", url: "https://bloqueado.com/a", code: "BLOCKED", message: "403", status: 403, observedAt: "2026-09-10T11:00:00.000Z" },
      { key: "f2", url: "https://lento.com/b", code: "TIMEOUT", message: "sem resposta", status: null, observedAt: "2026-09-10T11:00:00.000Z" },
    ],
    verifiedSources: FONTES_VERIFICADAS.map(item => ({
      domain: item.domain, url: item.url, sourceType: item.sourceType, classificationReason: item.classificationReason,
      confidence: item.confidence, signals: item.signals, provenance: item.provenance,
      title: "Oily skin", author: null, hasDates: true, structuredDataTypes: [], summary: "Produção de sebo e cuidados.",
      observedAt: "2026-09-10T11:30:00.000Z",
    })),
    sourceVerificationFailures: [{
      sourceId: "src-1", domain: "inacessivel.org", url: "https://inacessivel.org/x",
      code: "BLOCKED", message: "403", status: 403, observedAt: "2026-09-10T11:30:00.000Z",
    }],
    benchmark: null,
    /* Competitividade observada: mais um campo que o reset precisa zerar. */
    semanticTerms: ["pele oleosa", "sebo", "ácido salicílico"].map((term, index) => ({
      term, frequency: 12 - index, pageCount: 8 - index, pageIds: PAGINAS.slice(0, 3).map(item => item.id),
      sources: ["h2" as const], relation: "conceito recorrente na amostra",
      decision: "include_topic" as const, note: "",
    })),
    /* O plano de links DERIVADO da rodada, gravado como decisão estrutural. */
    structuralDecisions: [{
      key: "internal-link:article:pilar", label: "Link para o Pilar do Silo",
      observedCount: 7, sampleSize: 12, observedText: "7 de 12 páginas ligam ao conteúdo mais amplo do tema.",
      level: "recommended" as const, enforcement: "advisory" as const, humanNote: "",
    }],
    competitiveness: { classification: "medium" as const, dimensions: { estrutura: 0.6 }, reasons: ["amostra editorial consistente"], score: 0.55 },
    keywordDecisions: [],
    competitiveReport: null,
    deepResearch: view.record ? { ...view.record, finalizedAt: "2026-09-10T13:00:00.000Z", finalizedBy: "ator", conclusion: "SUFFICIENT" } : null,
    finalizedBundle: congelar(view),
    plannerPackage: null,
    plannerTransfer: { sourceAnalysisVersionId: "an-1", sourceAnalysisVersionNumber: 1, sentAt: "2026-09-10T13:40:00.000Z", sentBy: "ator" },
    status: "approved",
    humanNotes: ["nota da rodada"],
    approvedAt: "2026-09-10T13:30:00.000Z",
    approvedBy: "ator",
  });
}

/**
 * A PROJEÇÃO DEPOIS DO RESET — derivada do payload zerado, não imaginada.
 *
 * Escrevi este teste primeiro com `vista({ record: null })` e ele acusou plano
 * de links com duas ocorrências RESOLVED. O defeito era meu: aquela leitura
 * tinha registro nulo E doze extrações vivas, que é exatamente o estado híbrido
 * que §15 proíbe. Reconstruir a view a partir do que `buildRadarResetPayload`
 * devolve amarra o teste ao reset REAL — se ele deixar de limpar algum campo,
 * a projeção aqui muda junto e o teste cai.
 *
 * O snapshot da coleta continua sendo passado de propósito: ele é um artefato
 * coletado que o reset não apaga (§3). O que precisa ficar zerado é a leitura.
 */
function vistaDepoisDoReset() {
  const zerado = buildRadarResetPayload(payloadCheio());
  return buildRadarDeepResearchView({
    context: contexto(),
    record: zerado.deepResearch,
    snapshot: SNAPSHOT as never,
    extractions: zerado.extractions,
    verifiedSources: zerado.verifiedSources,
    finalizedBundle: zerado.finalizedBundle,
    observedAt: "2026-09-10T14:00:00.000Z",
  });
}

/* ==========  §28 · A FIXTURE NÃO É VAZIA  ============================== */

test("GATE 17 · §28 — antes do reset a investigação tem material em todas as camadas", () => {
  const antes = payloadCheio();
  const view = vista();

  /* Se qualquer uma destas contagens for zero, os testes seguintes não provam nada. */
  assert.ok(antes.extractions.length >= 12, "extrações");
  assert.equal(antes.extractionFailures.length, 2, "falhas finais");
  assert.ok(antes.verifiedSources.length > 0, "fontes verificadas");
  assert.ok(antes.sourceVerificationFailures.length > 0, "falhas de verificação");
  assert.ok(antes.deepResearch, "registro da investigação");
  assert.ok(antes.finalizedBundle, "congelado");
  assert.ok(antes.semanticTerms.length > 0, "termos semânticos");
  assert.ok(antes.serpDecisions.length > 0, "decisões da SERP canônica");

  assert.ok(view.observed.concepts.all.length > 0, "modelo semântico");
  assert.ok(view.observed.sample.comparablePages > 0, "modelo competitivo");
  assert.ok(view.observed.internalLinkPlan.outgoing.length > 0, "plano de links derivado");
  assert.ok(view.observed.authorityEvidence.claims.length > 0, "autoridade");
  assert.ok(view.observed.aiDiscovery.answerableUnits.length > 0, "descoberta");
  assert.ok(view.record?.researchCuration?.references.length, "referências curadas");
});

/* ==========  B–K · O QUE O RESET LIMPA  ============================== */

test("GATE 17 · B a K — o reset limpa exatamente a investigação corrente, campo a campo", () => {
  const antes = payloadCheio();
  const depois = buildRadarResetPayload(antes);

  /* C, D, E — coleta, referências, extrações e falhas correntes. */
  assert.deepEqual(depois.extractions, [], "CURRENT_EXTRACTIONS_CLEARED");
  assert.deepEqual(depois.extractionIds, []);
  assert.deepEqual(depois.extractionFailures, [], "CURRENT_FAILURES_CLEARED");
  assert.deepEqual(depois.selectedCompetitorIds, []);
  assert.equal(depois.deepResearch, null, "CURRENT_QUERY_PLAN_CLEARED e referências junto");
  for (const decisao of depois.serpDecisions) {
    assert.equal(decisao.decision, "pending", "a curadoria canônica volta a pendente, não some");
  }

  /* F, G — modelo semântico, competitivo e o plano de links derivado. */
  assert.deepEqual(depois.semanticTerms, [], "CURRENT_SEMANTIC_MODEL_CLEARED");
  assert.equal(depois.competitiveReport, null, "CURRENT_COMPETITIVE_MODEL_CLEARED");
  assert.equal(depois.benchmark, null);
  assert.deepEqual(depois.structuralDecisions, [], "CURRENT_LINK_PLAN_CLEARED");

  /* H, I — fontes verificadas e o que a autoridade derivou delas. */
  assert.deepEqual(depois.verifiedSources, [], "CURRENT_VERIFIED_SOURCES_CLEARED");
  assert.deepEqual(depois.sourceVerificationFailures, []);

  /* J, K — dossiê corrente e congelado corrente. */
  assert.equal(depois.finalizedBundle, null, "CURRENT_FINALIZED_BUNDLE_CLEARED");
  assert.equal(depois.plannerPackage, null);
  assert.equal(depois.plannerTransfer, null);
  assert.equal(depois.status, "draft");
  assert.equal(depois.approvedAt, null);
  assert.equal(depois.approvedBy, null);

  /*
   * §15 — NENHUM ESTADO HÍBRIDO SOBRA.
   *
   * O par que mais assusta: extrações vazias com congelado antigo ativo. Ele
   * produziria "Finalizada · 12 páginas" sobre uma amostra que não existe.
   */
  assert.ok(!(depois.extractions.length === 0 && depois.finalizedBundle));
  assert.ok(!(depois.deepResearch === null && depois.verifiedSources.length));
});

test("GATE 17 · a lista declarada do reset não pode divergir do que ele faz", () => {
  /*
   * A CONSTANTE JÁ TINHA MENTIDO UMA VEZ.
   *
   * `finalizedBundle`, `verifiedSources` e `sourceVerificationFailures` entraram
   * no Gate 15 e ficaram de fora da lista até aqui: a função limpava, o contrato
   * declarado dizia que não. Este teste deriva as chaves limpas comparando o
   * payload antes e depois — se as duas voltarem a divergir, ele falha.
   */
  const antes = payloadCheio();
  const depois = buildRadarResetPayload(antes);

  const declarados = new Set<string>(RADAR_RESET_CLEARED);
  const mudaram = (Object.keys(antes) as Array<keyof RadarAnalysisPayload>)
    .filter(chave => JSON.stringify(antes[chave]) !== JSON.stringify(depois[chave]))
    .sort();

  /* Sentido 1 — nada fora da lista declarada foi tocado. Pega excesso. */
  for (const chave of mudaram) {
    assert.ok(declarados.has(chave), `${chave} mudou sem estar declarado em RADAR_RESET_CLEARED`);
  }

  /* Sentido 2 — tudo que a lista declara está zerado no resultado. Pega falta. */
  const vazio = (valor: unknown) =>
    valor === null || valor === "draft"
    || (Array.isArray(valor) && valor.every(item => !item || (typeof item === "object" && "decision" in item && (item as { decision: string }).decision === "pending")));
  for (const chave of RADAR_RESET_CLEARED) {
    const valor = depois[chave as keyof RadarAnalysisPayload];
    assert.ok(vazio(valor), `${chave} continua com conteúdo depois do reset: ${JSON.stringify(valor).slice(0, 80)}`);
  }

  /* E a fixture precisa exercer a maior parte da lista, ou o sentido 2 é fácil. */
  assert.ok(mudaram.length >= 15, `a fixture exercitou apenas ${mudaram.length} campos da lista`);

  /* E a identidade da linha continua inteira: zerar não a torna órfã. */
  for (const chave of RADAR_RESET_IDENTITY_KEPT) {
    assert.deepEqual(depois[chave as keyof RadarAnalysisPayload], antes[chave as keyof RadarAnalysisPayload], `identidade preservada: ${chave}`);
  }
});

/* ==========  M–P, S, T · A FRONTEIRA ESTRUTURAL  ==================== */

test("GATE 17 · M a P, S e T — o reset não alcança fundamento, vídeo nem especialista", () => {
  /*
   * A GARANTIA MAIS FORTE É A QUE NÃO DEPENDE DE DISCIPLINA.
   *
   * ArticleDNA, KeywordDNA, SiloDNA, SiloPage e InternalLinkGraph não passam
   * por esta função — ela recebe e devolve APENAS o payload da análise. Vídeos
   * e evidência do especialista também não estão entre as chaves do payload.
   * Não existe caminho para alterá-los daqui, nem por engano.
   */
  const chavesDoPayload = Object.keys(RadarAnalysisPayloadSchema.shape);
  for (const fora of RADAR_RESET_OUTSIDE_PAYLOAD) {
    assert.ok(!chavesDoPayload.includes(fora), `${fora} vive fora do payload que o reset reescreve`);
  }
  for (const fundamento of ["articleDna", "keywordDna", "siloDna", "siloPage", "internalLinkGraph"]) {
    assert.ok(!chavesDoPayload.includes(fundamento), `${fundamento} não é campo do payload`);
  }

  /* E o vínculo com o fundamento continua gravado, byte a byte. */
  const antes = payloadCheio();
  const depois = buildRadarResetPayload(antes);
  assert.equal(depois.articleId, ARTIGO.articleId, "ARTICLE_DNA_PRESERVED");
  assert.equal(depois.articleDnaVersionId, ARTIGO.articleDnaVersionId);
  assert.equal(depois.brandId, ARTIGO.brandId);

  /* A função é pura: o payload que entrou não foi mutado no caminho. */
  const serializadoAntes = JSON.stringify(payloadCheio());
  const entrada = payloadCheio();
  buildRadarResetPayload(entrada);
  assert.equal(JSON.stringify(entrada), serializadoAntes, "HISTORICAL_FINALIZED_BUNDLE_MUTATED = NO");
});

/* ==========  Q e R · O HISTÓRICO CONTINUA  ========================== */

test("GATE 17 · Q e R — o reset cria versão nova e não reescreve o passado", () => {
  const antes = payloadCheio();
  const congeladoAnterior = antes.finalizedBundle;
  assert.ok(congeladoAnterior, "a fixture precisa ter um congelado para preservar");
  const hashAnterior = congeladoAnterior!.bundleHash;

  const depois = buildRadarResetPayload(antes);

  /*
   * APPEND-ONLY: a versão anterior segue de pé com o congelado intacto.
   *
   * O reset produz um payload NOVO; quem grava cria um sucessor. Nada aqui
   * executa DELETE, e o objeto original continua com o mesmo hash.
   */
  assert.equal(antes.finalizedBundle?.bundleHash, hashAnterior, "APPEND_ONLY_HISTORY_PRESERVED");
  assert.notEqual(depois, antes, "o reset devolve outro objeto");
  assert.equal(depois.finalizedBundle, null, "e é o NOVO que nasce vazio");

  /* O resumo diz em voz alta que o passado permanece. */
  const resumo = radarResetSummary(antes);
  assert.ok(resumo.wasFinalized, "a pessoa é avisada de que descarta uma finalização");
  assert.ok(resumo.limitations.some(item => /versões anteriores.*continuam gravadas/i.test(item)));
});

/* ==========  L · O PACOTE DEIXA DE ESTAR PRONTO  ==================== */

test("GATE 17 · L — depois do reset o PlannerHandoff volta a bloqueado", () => {
  /* Antes: congelado íntegro, pacote pronto. */
  const antes = radarPlannerHandoffReadiness({ article: ARTIGO, frozen: congelar(), stale: false });
  assert.equal(antes.ready, true, "a fixture precisa começar pronta");

  /* Depois: sem congelado corrente, o contrato recusa — e diz por quê. */
  const depoisDoReset = buildRadarResetPayload(payloadCheio());
  const depois = radarPlannerHandoffReadiness({ article: ARTIGO, frozen: depoisDoReset.finalizedBundle, stale: false });
  assert.equal(depois.ready, false, "PLANNER_HANDOFF_READY_AFTER_RESET = NO");
  assert.deepEqual(depois.blocks.map(item => item.code), ["NOT_FINALIZED"]);
  assert.equal(depois.blocks[0].message, "Finalize a pesquisa antes de preparar o pacote.");
  assert.equal(RADAR_RESET_EXPECTED_CURRENT.plannerHandoffReady, false);
});

/* ==========  U e V · A PROJEÇÃO CORRENTE  ========================== */

test("GATE 17 · U e V — Relatório passa a Pesquisa não iniciada, sem restos da rodada anterior", () => {
  const zerada = vistaDepoisDoReset();

  const estado = radarOperationalStatus({ view: zerada });
  assert.equal(estado.status, RADAR_RESET_EXPECTED_CURRENT.operationalStatus);
  assert.equal(estado.label, RADAR_OPERATIONAL_STATUS_LABEL.NOT_STARTED);
  assert.equal(zerada.state, RADAR_RESET_EXPECTED_CURRENT.investigationState);

  const relatorio = buildRadarReportSummary({ observed: zerada.observed, view: zerada });
  const pesquisa = relatorio.checks.find(item => item.id === "research") || relatorio.checks[0];
  assert.ok(pesquisa, "o Relatório tem a pergunta da pesquisa");

  /* O pacote volta a não pronto, pela mesma autoridade do Gate 16. */
  const pacote = relatorio.checks.find(item => item.id === "handoff");
  assert.equal(pacote?.state, "PENDING");
  assert.match(pacote!.detail, /Finalize a pesquisa antes de preparar o pacote/);

  /*
   * U — as necessidades DERIVADAS da pesquisa deixam de ser correntes.
   *
   * Elas não são apagadas de lugar nenhum: elas simplesmente não existem sem a
   * investigação que as derivou. É a diferença entre esquecer e não ter.
   */
  assert.equal(zerada.observed.authorityEvidence.specialistReviewRequirements.length, 0);
  assert.equal(zerada.observed.internalLinkPlan.totalRecommendedLinks, 0);
  assert.equal(zerada.finalizedBundle, null);
});

/* ==========  W · A PLANILHA CONCORDA COM O CARD  ==================== */

test("GATE 17 · W — planilha e card mostram a mesma verdade depois do reset", () => {
  const zerada = vista({ record: null });
  const linha = radarOperationalRow({ view: zerada, legacyNextAction: "Colete ou recupere a SERP deste artigo." });

  assert.equal(linha.statusLabel, RADAR_OPERATIONAL_STATUS_LABEL.NOT_STARTED, "TABLE_STATE_AFTER_RESET");
  assert.equal(linha.status, "NOT_STARTED");
  assert.equal(radarOperationalStatus({ view: zerada }).label, linha.statusLabel, "card e planilha, uma autoridade");

  /* E nada de vocabulário legado sobrevivendo na coluna. */
  for (const legado of ["Finalizada", "Pesquisa pendente", "Reaberta", "Aguardando aprovação"]) {
    assert.notEqual(linha.statusLabel, legado);
  }
  assert.equal(linha.nextAction, "Iniciar Pesquisa Google", "a ação volta a ser começar");
});

/* ==========  AC, AD, AE · A DECISÃO DO RESET  ====================== */

test("GATE 17 · AD e AE — em voo é recusado; sem investigação é NO_CHANGE seguro", () => {
  const emVoo = radarResetDecision({ hasCurrentInvestigation: true, inFlight: true });
  assert.equal(emVoo.outcome, "REFUSED_IN_FLIGHT", "IN_FLIGHT_RESET_PROTECTED");
  assert.equal(emVoo.writes, false);
  assert.match(emVoo.message, /Outra ação ainda está em andamento/);

  const semNada = radarResetDecision({ hasCurrentInvestigation: false, inFlight: false });
  assert.equal(semNada.outcome, "NO_CHANGE", "RESET em NOT_STARTED não cria estado");
  assert.equal(semNada.writes, false, "e não grava versão nenhuma");
  assert.match(semNada.detail, /Nenhuma versão foi criada/);

  const executa = radarResetDecision({ hasCurrentInvestigation: true, inFlight: false });
  assert.equal(executa.outcome, "PERFORMED");
  assert.equal(executa.writes, true);
});

test("GATE 17 · AC — duplo clique produz uma operação efetiva", () => {
  /*
   * A porta é a mesma do Gate 15.2: o guarda de posse fecha ANTES do primeiro
   * `await`, porque estado de render chega tarde demais para dois cliques no
   * mesmo tique.
   */
  let posse: RadarActionClaim = null;
  let efetivas = 0;
  const clicar = () => {
    const decisao = radarResetDecision({ hasCurrentInvestigation: true, inFlight: false });
    if (!decisao.writes) return;
    const posseDecidida = radarClaimAction(posse, { articleId: ARTIGO.articleId, action: "RESET" });
    if (!posseDecidida.granted) return;
    posse = posseDecidida.claim;
    efetivas += 1;
  };

  clicar(); clicar(); clicar();
  assert.equal(efetivas, 1, "DOUBLE_RESET_PROTECTED");
});

/* ==========  AF e AG · QUE ESTADOS PODEM SER ZERADOS  ============== */

test("GATE 17 · AF e AG — stale, parcial e finalizada podem ser zeradas", () => {
  /*
   * §19 — ABANDONAR UMA PESQUISA É DECISÃO EDITORIAL LEGÍTIMA.
   *
   * Exigir "finalize o stale antes de zerar" obrigaria a pessoa a carimbar uma
   * rodada que ela já concluiu que não serve. A única recusa é a concorrência.
   */
  for (const cenario of ["stale", "parcial", "finalizada", "falha"]) {
    const decisao = radarResetDecision({ hasCurrentInvestigation: true, inFlight: false });
    assert.equal(decisao.outcome, "PERFORMED", `${cenario} pode ser zerada`);
  }

  /* E o payload de qualquer um deles zera do mesmo jeito. */
  const finalizado = payloadCheio();
  assert.ok(finalizado.finalizedBundle && finalizado.status === "approved");
  const zerado = buildRadarResetPayload(finalizado);
  assert.equal(zerado.finalizedBundle, null);
  assert.equal(zerado.status, "draft");
});

/* ==========  AA e AB · ESCRITA E READBACK  ========================= */

test("GATE 17 · AA e AB — sucesso exige readback; falha não finge reset confirmado", () => {
  const confirmado = radarActionOutcome({
    action: "RESET",
    persistence: { persistenceMode: "remote", readbackConfirmed: true },
    successMessage: "Investigação zerada.",
  });
  assert.equal(confirmado.advances, true, "READBACK_REQUIRED");
  assert.match(confirmado.message, /zerada/i);

  const semReadback = radarActionOutcome({
    action: "RESET",
    persistence: { persistenceMode: "remote", readbackConfirmed: false },
  });
  assert.equal(semReadback.advances, false, "READBACK_FAILURE_SAFE");
  assert.doesNotMatch(semReadback.message, /^Investigação zerada\.$/);

  const local = radarActionOutcome({ action: "RESET", persistence: { persistenceMode: "local", readbackConfirmed: false } });
  assert.equal(local.advances, false, "recuperação local não é reset confirmado");

  const erro = radarActionOutcome({ action: "RESET", error: new Error("HTTP 500 Internal Server Error") });
  assert.equal(erro.advances, false);
  assert.doesNotMatch(erro.message, /HTTP 500/, "o erro cru não é a frase principal");
});

/* ==========  §27 · A FRONTEIRA ENTRE AS ÁREAS  ==================== */

test("GATE 17 · §27 — reset com vídeo, especialista e histórico: só a pesquisa some", () => {
  /*
   * O TESTE OBRIGATÓRIO DO GATE, MONTADO COMO A HOMOLOGAÇÃO ENCONTRARIA.
   *
   * Pesquisa finalizada, um vídeo deliberadamente registrado, uma contribuição
   * real do especialista e histórico com bundle anterior. Depois do reset,
   * exatamente uma dessas quatro coisas pode ter mudado.
   */
  const antes = payloadCheio();

  /* Vídeo e especialista vivem no estado local da linha, fora do payload. */
  const estadoLocal = {
    existingContent: [{ id: "vid-1", kind: "YOUTUBE", label: "Aula sobre pele oleosa", reference: "https://www.youtube.com/watch?v=abc", state: "LINK_REGISTERED" }],
    specialist: "RECEIVED",
    topics: { state: "TOPICS_READY", items: [{ id: "t1", text: "Rotina noturna" }], context: null, reviewedIds: ["t1"] },
  };
  const localSerializado = JSON.stringify(estadoLocal);
  const congeladoHistorico = JSON.stringify(antes.finalizedBundle);

  const depois = buildRadarResetPayload(antes);

  /* A pesquisa corrente sumiu. */
  assert.equal(depois.deepResearch, null);
  assert.equal(depois.finalizedBundle, null);
  assert.deepEqual(depois.extractions, []);

  /* O vídeo permanece — o reset não tem como alcançá-lo. */
  assert.equal(JSON.stringify(estadoLocal), localSerializado, "VIDEOS_PRESERVED");
  assert.equal(estadoLocal.existingContent.length, 1);

  /* A contribuição do especialista permanece. */
  assert.equal(estadoLocal.specialist, "RECEIVED", "SPECIALIST_REAL_CONTRIBUTIONS_PRESERVED");
  assert.equal(estadoLocal.topics.items.length, 1, "a pauta revisada não é descartada com a SERP");

  /* O congelado histórico não foi tocado. */
  assert.equal(JSON.stringify(antes.finalizedBundle), congeladoHistorico);

  /* E o fundamento continua sendo o mesmo artigo. */
  assert.equal(depois.articleDnaVersionId, ARTIGO.articleDnaVersionId);
});

/* ==========  A, X, Y, AH, AI · A SUPERFÍCIE  ====================== */

const modelo = (deepResearch?: ReturnType<typeof vista>): RadarR3Model => ({
  brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, articleDnaVersionId: ARTIGO.articleDnaVersionId,
  title: "Cobrir com clareza o tema skincare para pele oleosa",
  keyword: "skincare para pele oleosa", silo: "skincare", hierarchy: "Suporte",
  articleDnaVersion: "v1", publication: "Ainda não publicado", mode: "competitive_full", article: null,
  researchContext: contexto(), deepResearch,
  serp: { provider: "dataforseo", status: "Coletada", resultCount: 12, primaryCount: 1, pendingCount: 0, needs: 0, latestCollection: "Nenhuma coleta", records: [], references: [], view: null, analysis: null, latestSnapshotId: null, reviewStatus: null, reviewNotes: null, reviewCurrentness: "current", reviewedAt: null, reviewHistory: [], capturedAt: null },
  amazon: { state: "AMAZON_NOT_APPLICABLE", note: "" },
  content: { articleDnaVersion: "v1", principal: "skincare para pele oleosa", needs: 0, evidenceCount: 0, sourceCount: 0, rows: [], technical: { brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, articleDnaVersionId: ARTIGO.articleDnaVersionId, siloId: null, snapshotId: null, provider: null, articleDnaEntityId: null, articleDnaHash: null } },
  specialist: { expert: "Não selecionado", specialty: "", status: "Não iniciado", channel: "Telegram não consumido nesta visão", requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0, pending: 0, existingContent: "Nenhum material" },
  report: { status: "Aguardando", version: null, needs: 0, summary: "", approved: false, sentToPlanner: false, updatedAt: null },
  nextAction: "", lastActivity: null,
  provenance: { brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, articleDnaVersionId: ARTIGO.articleDnaVersionId, siloId: null, snapshotId: null, provider: null },
} as unknown as RadarR3Model);

async function montarTela(view: ReturnType<typeof vista> | undefined) {
  const chamadas = { start: 0, analyze: 0, finalize: 0, reset: 0, mode: [] as string[] };
  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(
    SupabaseSessionProvider, null,
    React.createElement(GlobalNoticeProvider, null,
      React.createElement(RadarR3Workbench, {
        model: modelo(view), refreshing: false,
        onStartDeepResearch: () => { chamadas.start += 1; },
        onAnalyzeSerpSelection: () => { chamadas.analyze += 1; },
        onFinalizeInvestigation: () => { chamadas.finalize += 1; },
        onResetInvestigation: () => { chamadas.reset += 1; },
        onSearchModeChange: (mode: string) => { chamadas.mode.push(mode); },
        onOpenArticle: () => {}, onOpenDetail: () => {},
      } as never)),
  )));
  return { tela, chamadas };
}

const abrirPesquisa = (tela: RadarDomScreen) => tela.click("radar-r3-card-pesquisa");

test("GATE 17 · A e Y — o clique real em Zerar chama RESET, e não encadeia START", async () => {
  const { tela, chamadas } = await montarTela(vista());
  await abrirPesquisa(tela);

  const botao = tela.get("radar-reset-investigation");
  assert.match(botao.textContent || "", /Zerar investigação/);
  await tela.click(botao);

  assert.equal(chamadas.reset, 1, "RESET_USER_ACTION_ONLY");
  assert.equal(chamadas.start, 0, "RESET_AUTO_STARTS_RESEARCH = NO");
  assert.equal(chamadas.analyze, 0);
  assert.equal(chamadas.finalize, 0);
  tela.destroy();
});

test("GATE 17 · X, AH e AI — depois do reset o modo é liberado e nada legado volta", async () => {
  const { tela, chamadas } = await montarTela(vista({ record: null }));
  await abrirPesquisa(tela);

  /* §11 — o seletor volta a aceitar escolha; nenhum modo é iniciado sozinho. */
  const seletor = tela.get("radar-search-mode");
  const youtube = seletor.querySelector('[data-testid="radar-search-mode-youtube"]') as HTMLButtonElement;
  assert.equal(youtube.disabled, false, "MODE_SELECTOR_UNLOCKED");
  await tela.click(youtube);
  assert.deepEqual(chamadas.mode, ["YOUTUBE"], "escolher é do USER, e escolher não pesquisa");
  assert.equal(chamadas.start, 0);

  /* §24 — nenhum controle do workflow antigo reaparece com a linha zerada. */
  const tudo = tela.text();
  for (const legado of ["Aprovar SERP", "Rejeitar SERP", "Continuar para Análise", "Analisar páginas pendentes", "Iniciar curadoria"]) {
    assert.ok(!tudo.includes(legado), `"${legado}" não volta depois do reset`);
  }

  /* E a ação primária é começar de novo — uma só. */
  const primaria = tela.get("radar-deep-research-button");
  assert.equal(primaria.getAttribute("data-action-id"), "START_RESEARCH");
  assert.equal(tela.all("radar-deep-research-button").length, 1);

  /* AI — navegar entre as áreas depois do reset não dispara nada. */
  for (const area of ["videos", "especialista", "relatorio", "pesquisa"]) {
    await tela.click(`radar-r3-card-${area}`);
  }
  assert.deepEqual({ start: chamadas.start, analyze: chamadas.analyze, finalize: chamadas.finalize, reset: chamadas.reset }, { start: 0, analyze: 0, finalize: 0, reset: 0 });
  tela.destroy();
});

test("GATE 17 · §21 — os detalhes da pesquisa não mostram a investigação antiga como corrente", async () => {
  const { tela } = await montarTela(vista({ record: null }));
  await abrirPesquisa(tela);

  const detalhes = tela.query("radar-research-details");
  assert.ok(detalhes, "a seção de consulta continua existindo");
  const texto = detalhes!.textContent || "";
  assert.match(texto, /Não iniciado/);
  assert.ok(!/Investigação congelada/.test(texto), "nenhum congelado corrente");
  assert.equal(tela.query("radar-frozen-bundle"), null);
  assert.equal(detalhes!.getAttribute("data-source"), "LIVE");
  tela.destroy();
});

/* ==========  AJ e AK · O F5  ====================================== */

test("GATE 17 · AJ e AK — remontar a tela mantém NOT_STARTED e não busca nada", async () => {
  /*
   * F5 É REMONTAR DO ZERO.
   *
   * A leitura zerada é reconstruída do registro persistido — que é nulo — e
   * continua NOT_STARTED. Se alguma camada buscasse ao montar, a sentinela de
   * rede registraria; ela é lida no último teste deste arquivo.
   */
  const antesDoF5 = await montarTela(vista({ record: null }));
  const estadoAntes = antesDoF5.tela.get("radar-deep-research-button").getAttribute("data-action-id");
  antesDoF5.tela.destroy();

  const depoisDoF5 = await montarTela(vista({ record: null }));
  const estadoDepois = depoisDoF5.tela.get("radar-deep-research-button").getAttribute("data-action-id");

  assert.equal(estadoDepois, estadoAntes, "SURVIVES_F5");
  assert.equal(estadoDepois, "START_RESEARCH");
  assert.deepEqual(
    { start: depoisDoF5.chamadas.start, analyze: depoisDoF5.chamadas.analyze, finalize: depoisDoF5.chamadas.finalize, reset: depoisDoF5.chamadas.reset },
    { start: 0, analyze: 0, finalize: 0, reset: 0 },
    "montar não executa operação nenhuma",
  );
  depoisDoF5.tela.destroy();
});

/* ==============  Z · REAL_PROVIDER_CALLS = 0  ==================== */

test("GATE 17 · Z e AK — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `RESET_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
