import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertRadarFrozenBundleIntegrity, freezeRadarEvidenceBundle, radarFinalizationReadiness,
  radarFrozenBundleHash, radarFrozenBundleMatchesArticle, RadarFrozenEvidenceBundleSchema,
} from "../lib/radar/investigation-finalization.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarResearchCardSummary } from "../lib/radar/operational-view.ts";
import { radarActionOutcome } from "../lib/radar/operational-actions.ts";
import { startRadarDeepResearch, finalizeRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarInvestigationSufficiency } from "../lib/radar/investigation-sufficiency.ts";

/*
 * ==========  GATE 15 · FINALIZAR É CONGELAR  ==============================
 *
 * "Finalizada" era um carimbo: quem clicou e quando. A leitura competitiva
 * continuava sendo recalculada a cada abertura — e o motor mudou seis vezes nos
 * últimos seis Gates. Um Planejador abrindo a investigação depois de uma
 * melhoria no agrupamento semântico veria outros conceitos sob o mesmo carimbo.
 *
 * O que este arquivo guarda:
 *
 *   o bundle tem identidade e hash PRÓPRIOS, não os do ArticleDNA;
 *   insuficiência consciente é diferente de investigação inexistente;
 *   falha de extração não bloqueia, vira limitação;
 *   nada congela sozinho, e nada congela sem readback;
 *   e o congelado não muda em silêncio.
 *
 * Nenhum teste chama rede: finalizar não pesquisa.
 */

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
  if (index < 7) headings.push("Riscos do ácido salicílico para pele oleosa na gravidez");
  return pagina(`A${index}`, headings);
});

const contexto = (patch: { versionId?: string; hash?: string | null } = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "b", articleId: "a",
    articleDnaVersionId: patch.versionId ?? "dna-v15",
    articleDnaContentHash: patch.hash === undefined ? "hash-v15" : patch.hash,
    promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Pilar",
  },
  /*
   * TRÊS PAPÉIS, DE PROPÓSITO.
   *
   * Com uma keyword só, a distinção entre SERP canônica e auxiliares nunca
   * seria exercitada: haveria uma consulta, e ela seria a canônica por
   * ausência de alternativa. O teste O precisa de auxiliares reais para provar
   * que elas não viram snapshot do artigo ao congelar.
   */
  keywords: [
    {
      identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
      strategy: { volume: 720, kgrScore: 0.589, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU" } },
      resolution: "FULL",
    },
    {
      identity: { keywordId: "kw2", text: "skin care pele oleosa", role: "secundaria" },
      strategy: { volume: 1300, kgrScore: 0.325, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: null, semanticQualification: null },
      resolution: "FULL",
    },
    {
      identity: { keywordId: "kw3", text: "pele oleosa e acne", role: "reforco_narrativo" },
      strategy: { volume: 480, kgrScore: null, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: null, semanticQualification: null },
      resolution: "FULL",
    },
  ],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "skin care pele oleosa", "pele oleosa e acne"],
  silo: null, formationSerp: null,
  /* Uma arquitetura aprovada de verdade: sem ela, o plano de links é vazio. */
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v15", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["skincare para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:este", targetNodeId: "silo-page:skincare", relationType: "ARTICLE_TO_SILO_PAGE", anchorConcepts: ["guia de skincare"], reason: "O suporte devolve à raiz do Silo", priority: "MEDIUM", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = {
  query: "skincare para pele oleosa",
  organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `dominio-a${index}.com.br`, url: item.url })),
};

const registro = (context = contexto()) => startRadarDeepResearch({
  context, plan: buildRadarResearchQueryPlan(context), startedBy: "ator-1", now: "2026-09-10T09:00:00.000Z",
});

const vista = (patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) =>
  buildRadarDeepResearchView({
    context: contexto(),
    record: registro(),
    snapshot: SNAPSHOT as never,
    extractions: PAGINAS,
    selectedReferences: PAGINAS.length,
    observedAt: "2026-09-10T12:00:00.000Z",
    ...patch,
  });

const suficiencia = (level: RadarInvestigationSufficiency["level"], headline = "Amostra competitiva parcial", reasons: string[] = ["Apenas 3 páginas comparáveis."]) =>
  ({ level, headline, reasons });

const prontidao = (patch: Partial<Parameters<typeof radarFinalizationReadiness>[0]> = {}) =>
  radarFinalizationReadiness({
    started: true, stale: false, alreadyFinalized: false,
    pending: 0, analyzed: 12, failed: 0,
    sufficiency: suficiencia("PARTIAL_BUT_USABLE"),
    ...patch,
  });

const congelar = (patch: Partial<Parameters<typeof freezeRadarEvidenceBundle>[0]> = {}) => {
  const view = vista();
  return freezeRadarEvidenceBundle({
    readiness: prontidao(),
    observed: view.observed,
    record: registro(),
    mode: "WEB",
    sufficiency: suficiencia("PARTIAL_BUT_USABLE"),
    frozenBy: "ator-1",
    frozenAt: "2026-09-10T13:00:00.000Z",
    ...patch,
  });
};

/* ==========  A, B, C e D · QUANDO FINALIZAR FICA DISPONÍVEL  =========== */

test("GATE 15 · A e B — antes de iniciar, e sem análise, finalizar não existe", () => {
  const naoIniciada = prontidao({ started: false, analyzed: 0 });
  assert.equal(naoIniciada.state, "TECHNICALLY_NOT_COMPLETED");
  assert.equal(naoIniciada.canFinalize, false);
  assert.match(naoIniciada.reason, /ainda não foi iniciada/);

  /* A autoridade da fase 1 concorda: antes de começar, a ação é começar. */
  const acao = radarPhase1Action({
    state: "NOT_STARTED", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 0, pending: 0, failed: 0, analyzed: 0,
  });
  assert.equal(acao.id, "START_RESEARCH");
  assert.notEqual(acao.id, "FINALIZE_SERP");
});

test("GATE 15 · C — com páginas pendentes, finalizar não fica disponível", () => {
  const comPendentes = prontidao({ pending: 4, analyzed: 8 });
  assert.equal(comPendentes.state, "TECHNICALLY_NOT_COMPLETED");
  assert.equal(comPendentes.canFinalize, false);
  assert.match(comPendentes.reason, /ainda não foram analisadas/);

  const acao = radarPhase1Action({
    state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 12, pending: 4, failed: 0, analyzed: 8,
  });
  assert.equal(acao.id, "ANALYZE_COMPETITION", "a ação continua sendo analisar");
});

test("GATE 15 · D — sem pendências e com análise utilizável, finalizar fica disponível", () => {
  const pronta = prontidao();
  assert.equal(pronta.state, "FINALIZABLE");
  assert.equal(pronta.canFinalize, true);
  assert.equal(pronta.acknowledgedInsufficiency, null);

  const acao = radarPhase1Action({
    state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 12, pending: 0, failed: 0, analyzed: 12, sufficiency: suficiencia("PARTIAL_BUT_USABLE"),
  });
  assert.equal(acao.id, "FINALIZE_SERP");
  assert.equal(acao.enabled, true);
});

/* ==========  E, F e G · FALHA, INSUFICIÊNCIA E AUSÊNCIA  =============== */

test("GATE 15 · E — falha definitiva não bloqueia; ela vira limitação declarada", () => {
  const comFalhas = prontidao({ analyzed: 15, failed: 3 });

  assert.equal(comFalhas.canFinalize, true, "FAILED_FINAL_BLOCKS = NO");
  assert.equal(comFalhas.state, "FINALIZABLE");
  assert.match(comFalhas.reason, /3 sem acesso/);

  /* E a perda entra no congelado, escrita, em vez de sumir. */
  const view = vista({ extractions: PAGINAS.slice(0, 9), extractionFailureUrls: PAGINAS.slice(9).map(item => item.url) });
  const congelado = freezeRadarEvidenceBundle({
    readiness: prontidao({ analyzed: 9, failed: 3 }),
    observed: view.observed, record: registro(), mode: "WEB",
    sufficiency: suficiencia("PARTIAL_BUT_USABLE"), frozenBy: "ator-1", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congelado.ok, true);
  if (congelado.ok) {
    assert.ok(congelado.bundle.sample.failedFinal >= 0);
    assert.ok(congelado.bundle.limitations.length > 0, "a perda é declarada");
  }
});

test("GATE 15 · F — insuficiência com material lido é encerramento consciente", () => {
  const consciente = prontidao({ analyzed: 4, sufficiency: suficiencia("INSUFFICIENT", "Amostra competitiva insuficiente", ["Apenas 1 página comparável."]) });

  assert.equal(consciente.state, "INSUFFICIENT_BUT_FINALIZABLE");
  assert.equal(consciente.canFinalize, true);
  assert.equal(consciente.acknowledgedInsufficiency, "Apenas 1 página comparável.");
  assert.match(consciente.reason, /insuficiência declarada/);

  /* A insuficiência viaja no congelado — não some ao virar conclusão. */
  const congelado = congelar({ readiness: consciente, sufficiency: suficiencia("INSUFFICIENT", "Amostra competitiva insuficiente", ["Apenas 1 página comparável."]) });
  assert.equal(congelado.ok, true);
  if (congelado.ok) {
    assert.equal(congelado.bundle.conclusion, "INSUFFICIENT_BUT_FINALIZABLE");
    assert.equal(congelado.bundle.acknowledgedInsufficiency, "Apenas 1 página comparável.");
    assert.ok(congelado.bundle.limitations.includes("Apenas 1 página comparável."));
  }
});

test("GATE 15 · G — sem material analisado não há investigação para congelar", () => {
  const semNada = prontidao({ analyzed: 0, failed: 12, sufficiency: suficiencia("INSUFFICIENT", "Amostra competitiva insuficiente", []) });

  assert.equal(semNada.state, "TECHNICALLY_NOT_COMPLETED");
  assert.equal(semNada.canFinalize, false);
  assert.match(semNada.reason, /não existe investigação material/);
  assert.match(semNada.reason, /12 página/, "e o motivo nomeia o que aconteceu");

  const recusado = congelar({ readiness: semNada });
  assert.equal(recusado.ok, false, "congelar recusa o que a prontidão recusou");

  /* Bloqueada por falta de snapshot ou curadoria também não congela. */
  assert.equal(prontidao({ sufficiency: suficiencia("BLOCKED", "Análise não iniciada", []) }).canFinalize, false);
});

/* =============  H e I · O FUNDAMENTO PRECISA SER O MESMO  ============== */

test("GATE 15 · H e I — versão ou hash do ArticleDNA mudados impedem congelar como corrente", () => {
  const desatualizada = prontidao({ stale: true });
  assert.equal(desatualizada.state, "TECHNICALLY_NOT_COMPLETED");
  assert.equal(desatualizada.canFinalize, false);
  assert.match(desatualizada.reason, /fundamento do artigo mudou/);

  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  /* Versão diferente: o dossiê descreve outro contrato. */
  const outraVersao = radarFrozenBundleMatchesArticle(congelado.bundle, { articleId: "a", articleDnaVersionId: "dna-v16", articleDnaContentHash: "hash-v15" });
  assert.equal(outraVersao.matches, false);
  assert.match(outraVersao.reason, /dna-v16/);

  /* Mesma versão, conteúdo mudado por baixo: o caso que só o hash pega. */
  const outroHash = radarFrozenBundleMatchesArticle(congelado.bundle, { articleId: "a", articleDnaVersionId: "dna-v15", articleDnaContentHash: "hash-outro" });
  assert.equal(outroHash.matches, false);
  assert.match(outroHash.reason, /conteúdo do ArticleDNA mudou/);

  assert.equal(radarFrozenBundleMatchesArticle(congelado.bundle, { articleId: "a", articleDnaVersionId: "dna-v15", articleDnaContentHash: "hash-v15" }).matches, true);
});

/* ==============  J e K · VÍNCULO E IDENTIDADE DO BUNDLE  ============== */

test("GATE 15 · J — o bundle carrega artigo, versão e hash do fundamento", () => {
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  assert.equal(congelado.bundle.binding.brandId, "b");
  assert.equal(congelado.bundle.binding.articleId, "a");
  assert.equal(congelado.bundle.binding.articleDnaVersionId, "dna-v15");
  assert.equal(congelado.bundle.binding.articleDnaContentHash, "hash-v15");
  assert.ok(congelado.bundle.foundationFingerprint.length > 0, "e o fingerprint do fundamento congelado");
});

test("GATE 15 · K — o bundle tem identidade própria, distinta da do ArticleDNA", () => {
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;
  const bundle = congelado.bundle;

  assert.match(bundle.bundleId, /^bundle:/);
  assert.ok(bundle.bundleHash.length >= 8);

  /*
   * O HASH DO PACOTE NÃO É O DO FUNDAMENTO.
   *
   * Um responde "qual artigo?", o outro "quais evidências?". Duas investigações
   * do mesmo artigo têm o mesmo hash de fundamento e evidências diferentes — e
   * é essa diferença que precisa ser provável depois.
   */
  assert.notEqual(bundle.bundleHash, bundle.binding.articleDnaContentHash);
  assert.notEqual(bundle.bundleHash, bundle.foundationFingerprint);
  assert.notEqual(bundle.bundleId, bundle.binding.articleDnaVersionId);

  /* Mesmo conteúdo, mesmo hash: a identidade é do que foi congelado. */
  const { bundleHash, ...conteudo } = bundle;
  assert.equal(radarFrozenBundleHash(conteudo), bundleHash);

  /* Conteúdo diferente, hash diferente — senão não provaria nada. */
  assert.notEqual(radarFrozenBundleHash({ ...conteudo, limitations: [...conteudo.limitations, "outra"] }), bundleHash);
});

/* ======  L, M, N e O · O QUE PRECISA SOBREVIVER AO CONGELAMENTO  ====== */

test("GATE 15 · L — relação sem aplicação continua sem aplicação, e a relação permanece", () => {
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  const aplicacoes = [...congelado.bundle.links.outgoing, ...congelado.bundle.links.incoming];
  assert.ok(aplicacoes.length >= 3, "a fixture tem arquitetura aprovada de verdade");
  for (const aplicacao of aplicacoes) {
    assert.equal(aplicacao.structuralRequirement, "REQUIRED", "a relação aprovada não muda por falta de evidência");
    assert.ok(["RESOLVED", "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT"].includes(aplicacao.applicationStatus));
    assert.equal(typeof aplicacao.recommendedOccurrences, "number");
  }

  /*
   * O CASO QUE INTERESSA: relação exigida, aplicação não resolvida.
   *
   * Ela é o que uma leitura descuidada apagaria — "zero ocorrências, então
   * remove". Congelada, ela continua exigida pelo grafo e sem lugar provado.
   */
  const semAplicacao = aplicacoes.find(item => item.applicationStatus === "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT");
  assert.ok(semAplicacao, "há relação sem aplicação nesta amostra");
  assert.equal(semAplicacao?.structuralRequirement, "REQUIRED");
  assert.equal(semAplicacao?.recommendedOccurrences, 0);
  assert.equal(congelado.bundle.links.unresolvedRelations >= 1, true);
  /* Zero ocorrências jamais vira remoção: os dois campos viajam separados. */
  const fonte = readFileSync(new URL("../lib/radar/investigation-finalization.ts", import.meta.url), "utf8");
  assert.match(fonte, /structuralRequirement/);
  assert.match(fonte, /applicationStatus/);
  assert.equal(/REMOVE_RELATION|REJECT_GRAPH/.test(fonte), false);
});

test("GATE 15 · M — o requisito do especialista continua requisito, não contribuição", () => {
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  for (const requisito of congelado.bundle.authority.specialistRequirements) {
    assert.match(requisito.requirementId, /^specialist:/, "o identificador é o do Gate 12");
    assert.ok(requisito.specificQuestion.length > 20, "a pergunta chega contextualizada");
    assert.ok(["RESOLVE_CONFLICT", "RESOLVE_FACTUAL_UNCERTAINTY", "VERIFY_AND_ADD_EXPERIENCE"].includes(requisito.kind));
  }

  /* Congelar a pesquisa não inventa contribuição recebida. */
  const fonte = readFileSync(new URL("../lib/radar/investigation-finalization.ts", import.meta.url), "utf8");
  assert.equal(/contributionReceived|expertContribution|ExpertEvidence/.test(fonte), false);
});

test("GATE 15 · N — a camada de descoberta é preservada no congelado", () => {
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;
  const descoberta = congelado.bundle.discovery;

  assert.equal(descoberta.applicable, true);
  assert.equal(descoberta.funnel, "TOFU", "o funil declarado pelo fundamento viaja junto");
  assert.ok(descoberta.answerableUnits.length > 0);
  for (const unidade of descoberta.answerableUnits) {
    assert.ok(["CORE", "SUPPORTING", "PERIPHERAL"].includes(unidade.importance));
    assert.ok(["READY", "NOT_READY"].includes(unidade.readiness));
  }
  assert.equal(typeof descoberta.matrix.shared, "number");
});

test("GATE 15 · O — canônica e auxiliar continuam distintas depois de congelar", () => {
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;
  const busca = congelado.bundle.search;

  assert.equal(busca.queries.length, 3, "principal, secundária e reforço");
  const canonicas = busca.queries.filter(item => item.serpClass === "canonical");
  assert.equal(canonicas.length, 1, "só a principal produz a SERP do artigo");
  assert.equal(canonicas[0].role, "principal");

  const auxiliares = busca.queries.filter(item => item.role !== "principal");
  assert.equal(auxiliares.length, 2, "e há auxiliares de verdade para distinguir");
  for (const query of auxiliares) {
    assert.equal(query.serpClass, "auxiliary", "auxiliar não vira snapshot canônico");
  }
  assert.equal(busca.mode, "WEB", "o modo da pesquisa fica congelado com ela");
});

/* ==========  P, Q e R · PERSISTÊNCIA, F5 E AUSÊNCIA DE PROVIDER  ====== */

test("GATE 15 · P — finalizar só declara sucesso depois do readback remoto", () => {
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const handler = page.slice(page.indexOf("const finalizeInvestigation"), page.indexOf("const confirmResearchCuration"));

  assert.match(handler, /freezeRadarEvidenceBundle/, "congela antes de gravar");
  assert.match(handler, /pipeline\.saveRadarAnalysis/);
  /*
   * GATE 15.1 · a regra do readback virou autoridade testável.
   *
   * Ela era uma condicional dentro do handler; agora é `radarActionOutcome`,
   * que distingue concluído, não persistido e falhou — e é o próprio Gate 15.1
   * que prova que FINALIZE sem readback não avança.
   */
  assert.match(handler, /radarActionOutcome\(\{\s*action: "FINALIZE"/);
  assert.equal(
    radarActionOutcome({ action: "FINALIZE", persistence: { persistenceMode: "remote", readbackConfirmed: false } }).advances,
    false,
    "sem readback, o aviso não arredonda",
  );
  /* O bundle entra na versão sucessora — append-only, nunca edição no lugar. */
  assert.match(handler, /createRadarAnalysisSuccessor\([^)]*finalizedBundle/);
});

test("GATE 15 · Q e R — o F5 devolve a finalização gravada, sem chamar provider", () => {
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  /*
   * O QUE VOLTA DEPOIS DO F5 É O QUE FOI GRAVADO.
   *
   * A leitura viva continua sendo calculada ao lado — mas quem responde pelo
   * que já foi finalizado é o bundle lido de volta do payload.
   */
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15",
    serpSnapshotId: "snap-1", serpSnapshotVersion: 1, serpSnapshotHash: "h",
    mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [],
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    extractionFailures: [], plannerPackage: null, status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
    finalizedBundle: congelado.bundle,
  });
  assert.equal(payload.finalizedBundle?.bundleHash, congelado.bundle.bundleHash, "SURVIVES_F5");

  const view = vista({ finalizedBundle: payload.finalizedBundle });
  assert.equal(view.finalizedBundle?.bundleId, congelado.bundle.bundleId);

  /*
   * CONGELAR SÓ SIGNIFICA ALGO SE A TELA LER O CONGELADO.
   *
   * O card da Pesquisa passa a responder pelo bundle: se a leitura viva mudar
   * amanhã — outro agrupamento, outra régua —, a investigação encerrada
   * continua mostrando os números com que foi encerrada.
   */
  const cardCongelado = buildRadarResearchCardSummary({ view, mode: "WEB" });
  const cardVivo = buildRadarResearchCardSummary({ view: vista(), mode: "WEB" });
  assert.equal(cardCongelado.counts.analyzed, congelado.bundle.sample.analyzedSuccess);
  assert.equal(cardCongelado.counts.references, congelado.bundle.search.uniqueReferences);
  assert.equal(cardVivo.counts.analyzed, cardCongelado.counts.analyzed, "com a mesma evidência, os dois concordam");

  /* E com o congelado divergindo da leitura viva, quem vale é o congelado. */
  const divergente = vista({ finalizedBundle: { ...congelado.bundle, sample: { ...congelado.bundle.sample, analyzedSuccess: 7, comparablePages: 7 } } });
  assert.equal(buildRadarResearchCardSummary({ view: divergente, mode: "WEB" }).counts.analyzed, 7);

  /* Nem a leitura nem o congelamento conhecem rede. */
  for (const caminho of ["../lib/radar/investigation-finalization.ts", "../lib/radar/deep-research-view.ts"]) {
    const fonte = readFileSync(new URL(caminho, import.meta.url), "utf8");
    assert.equal(/\bfetch\(|serper|dataforseo|openai|anthropic/i.test(fonte), false, caminho);
  }
});

test("GATE 15 · S — congelar não pesquisa: nenhum provider é tocado", () => {
  const fonte = readFileSync(new URL("../lib/radar/investigation-finalization.ts", import.meta.url), "utf8");

  assert.equal(/\bfetch\(|axios|node-fetch|https?:\/\//.test(fonte), false, "FINALIZE_PROVIDER_CALLS = 0");
  assert.equal(/verifyRadarSources|extractCompetitorPage|collectSerp/.test(fonte), false, "não recoleta nem reverifica");
  assert.equal(/useState|useEffect/.test(fonte), false, "domínio puro");
});

/* ==========  T, U, V e W · AUTORIDADE, TELA E IMUTABILIDADE  ========== */

test("GATE 15 · T — nenhum efeito finaliza: só o clique", () => {
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(workbench, /useEffect/);
  /* RADAR 18.8: a corrente do clique ficou com dois elos, e os dois são exigidos. */
  assert.match(workbench, /onTrigger=\{disparar\}/, "a ação primária nasce de um clique");
  assert.match(workbench, /onClick=\{onTrigger\}/, "e o clique é o único caminho até ela");
  assert.equal(/useEffect\([^)]*finalizeInvestigation/.test(page), false);
  assert.match(page, /onFinalizeInvestigation=\{\(\) => void finalizeInvestigation\(\)\}/);

  /* Terminar o ANALYZE não encadeia o FINALIZE. */
  const analyze = page.slice(page.indexOf("const analyzeSerpSelection"), page.indexOf("const finalizeInvestigation"));
  assert.equal(analyze.includes("finalizeInvestigation("), false, "ANALYZE terminar ≠ FINALIZAR");
});

test("GATE 15 · U — investigação finalizada não oferece Finalizar de novo", () => {
  const acao = radarPhase1Action({
    state: "FINALIZED", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 12, pending: 0, failed: 0, analyzed: 12, sufficiency: suficiencia("PARTIAL_BUT_USABLE"),
  });
  assert.equal(acao.id, "NONE");
  assert.equal(acao.enabled, false);
  assert.equal(acao.label, "Pesquisa finalizada");

  /* E a tela não renderiza botão morto: sem ação, sem botão. */
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  /* RADAR 18.8: mesma condição, agora sobre o componente único do botão primário. */
  assert.match(workbench, /acao\.id !== "NONE" && <Phase1Button acao=\{acao\}/);
  assert.equal((workbench.match(/acao\.id !== "NONE" && <Phase1Button/g) || []).length, 2, "os dois lugares de render usam a mesma condição");
  assert.match(workbench, /data-testid="radar-frozen-bundle"/, "no lugar dele, a investigação congelada");

  /* Já finalizada, a prontidão recusa uma segunda finalização. */
  const denovo = prontidao({ alreadyFinalized: true });
  assert.equal(denovo.canFinalize, false);
  assert.match(denovo.reason, /já foi finalizada/);
});

test("GATE 15 · V e W — o fundamento não é tocado, e o congelado não muda em silêncio", () => {
  const antes = JSON.parse(JSON.stringify(contexto()));
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  assert.deepEqual(JSON.parse(JSON.stringify(contexto())), antes, "ARTICLE_UPSTREAM_MUTATED = NO");

  const fonte = readFileSync(new URL("../lib/radar/investigation-finalization.ts", import.meta.url), "utf8");
  assert.equal(/context\.article\.\w+\s*=|articleDna\w*\s*=\s*"/.test(fonte), false);

  /* O congelado é verificável: uma edição silenciosa vira erro. */
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(congelado.bundle));
  assert.throws(
    () => assertRadarFrozenBundleIntegrity({ ...congelado.bundle, limitations: [] }),
    /RADAR_FROZEN_BUNDLE_MUTATED/,
  );
  assert.throws(
    () => assertRadarFrozenBundleIntegrity({ ...congelado.bundle, sample: { ...congelado.bundle.sample, comparablePages: 99 } }),
    /RADAR_FROZEN_BUNDLE_MUTATED/,
  );

  /* E o schema recusa campo desconhecido: o congelado tem forma fechada. */
  assert.throws(() => RadarFrozenEvidenceBundleSchema.parse({ ...congelado.bundle, extra: 1 }));
});

/* ==============  §16 · ZERAR DESCARTA O ATUAL, NÃO O PASSADO  ========= */

test("GATE 15 · zerar descarta a investigação congelada atual sem reescrever o passado", async () => {
  const { buildRadarResetPayload } = await import("../lib/radar/radar-reset.ts");
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15",
    serpSnapshotId: "snap-1", serpSnapshotVersion: 1, serpSnapshotHash: "h",
    mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: PAGINAS,
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    extractionFailures: [], plannerPackage: null, status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
    finalizedBundle: congelado.bundle,
    verifiedSources: [{ domain: "aad.org", url: "https://aad.org/x", sourceType: "PROFESSIONAL_ORGANIZATION", classificationReason: "r", confidence: "HIGH", provenance: "p", observedAt: "2026-09-10T13:00:00.000Z" }],
  });
  assert.equal(payload.finalizedBundle?.bundleHash, congelado.bundle.bundleHash);

  /*
   * A LINHA ZERADA NÃO PODE EXIBIR "CONGELADA".
   *
   * O bundle e as fontes verificadas descrevem extrações que o reset acabou de
   * descartar. Mantê-los deixaria a tela afirmando uma investigação que já não
   * existe — com hash, data e tudo, o que é pior do que não afirmar nada.
   */
  const zerado = buildRadarResetPayload(payload);
  assert.equal(zerado.finalizedBundle, null);
  assert.deepEqual(zerado.verifiedSources, []);
  assert.deepEqual(zerado.extractions, []);
  assert.equal(zerado.deepResearch, null);

  /* E a versão anterior continua intacta: o reset cria versão, não reescreve. */
  assert.equal(payload.finalizedBundle?.bundleHash, congelado.bundle.bundleHash, "FINALIZED_BUNDLE_MUTATED = NO");
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(payload.finalizedBundle!));
});

/* ==============  §21 · O RELATÓRIO LÊ A INVESTIGAÇÃO CONGELADA  ======= */

test("GATE 15 · o relatório passa a responder pela evidência congelada", async () => {
  const { buildRadarReportSummary } = await import("../lib/radar/operational-view.ts");
  const congelado = congelar();
  assert.equal(congelado.ok, true);
  if (!congelado.ok) return;

  const aberta = vista();
  const semCongelamento = buildRadarReportSummary({ observed: aberta.observed, view: aberta });
  const checkAberto = semCongelamento.checks.find(item => item.id === "frozen");
  assert.ok(checkAberto);
  assert.notEqual(checkAberto?.state, "READY", "enquanto não congela, a pergunta segue aberta");

  const fechada = vista({ finalizedBundle: congelado.bundle });
  const comCongelamento = buildRadarReportSummary({ observed: fechada.observed, view: fechada });
  const checkFechado = comCongelamento.checks.find(item => item.id === "frozen");
  assert.equal(checkFechado?.state, "READY");
  assert.match(checkFechado?.detail || "", new RegExp(congelado.bundle.bundleHash), "com o endereço da evidência usada");
});
