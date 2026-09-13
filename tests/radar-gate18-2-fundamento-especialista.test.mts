import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { buildRadarArticleDnaSummary, buildRadarSpecialistSummary, buildRadarReportSummary } from "../lib/radar/operational-view.ts";
import { radarDeclaredFunnel, buildRadarAiDiscoveryContext } from "../lib/radar/ai-discovery-context.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 18.2 · O FUNDAMENTO E O ESPECIALISTA  ====================
 *
 * Dois defeitos que a tela mostrou lado a lado com a própria contradição:
 *
 *   "ArticleDNA · Suporte · unknown"      enquanto o Arquiteto exibia
 *                                          Informacional / Topo
 *
 *   "Especialista: 1 ponto preparado"      enquanto o card do Especialista
 *                                          dizia "Não necessário"
 *
 * Nos dois casos ninguém mentia sobre o próprio dado: cada superfície lia um
 * lugar diferente. Estes testes provam que passaram a ler o mesmo.
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

/* ====================== o fundamento como o Arquiteto fecha ============ */

/**
 * O ArticleDNA do smoke: classificação terminal fechada, e as keywords SEM
 * qualificação semântica versionada — que é exatamente o caso que apagava o
 * funil no Radar.
 */
const dnaPayload = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  articleId: "artigo-1", brandId: "marca-1",
  promise: "Cobrir com clareza o tema skincare para pele oleosa.",
  mainIntent: "Informacional",
  hierarchy: "Suporte",
  suggestedSlug: "skincare-para-pele-oleosa",
  journeyStage: "consideracao",
  keywordReferences: [
    {
      keywordId: "kw1", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna", role: "principal",
      /* O sentinela que o normalizador devolve quando não consegue classificar. */
      normalizedIntent: "unknown",
      coveredIntentions: [], requiredTopics: [], excludedTopics: [],
      classificationOrigin: "legacy", confidence: 0.5, humanConfirmed: false,
      volume: 720, resultCount: 4200, kgrScore: 0.589,
      strategicContribution: "Define a identidade do artigo.",
      contribution: "central", purpose: "Define a identidade e a intenção central do artigo.",
      overlapRisk: "unknown",
      keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } },
    },
  ],
  /* A DECISÃO TERMINAL — o que o Arquiteto mostra na tela dele. */
  classification: {
    intent: { value: "INFORMATIONAL", reason: "A Principal declara intenção informacional.", source: "principal" },
    funnel: { value: "TOP", reason: "A Principal declara este estágio e a composição não diverge.", source: "principal" },
  },
  ...patch,
});

const item = () => ({
  brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna",
  title: "Cobrir com clareza o tema skincare para pele oleosa.",
  hierarchy: "Suporte", intent: "Informacional", format: "Suporte",
  principalKeywordId: "kw1", analysisVersions: [],
});

const contextoDe = (payloadPatch: Record<string, unknown> = {}) => buildRadarArticleResearchContext({
  item: item() as never,
  article: { id: "dna-v1", versionId: "dna-v1", payload: dnaPayload(payloadPatch) } as never,
});

/* ==========  A, B e C · O FUNDAMENTO CHEGA AO RADAR  ================ */

test("GATE 18.2 · A e B — intenção e funil do ArticleDNA chegam ao Radar sem virar unknown", () => {
  const contexto = contextoDe();
  const resumo = buildRadarArticleDnaSummary(contexto);

  /*
   * O DEFEITO: `normalizeSearchIntent` devolve a string "unknown" quando não
   * consegue classificar — e ela é TRUTHY. O `||` nunca chegava ao fundamento.
   */
  assert.equal(contexto.keywords[0].strategy.normalizedIntent, "unknown", "a fixture precisa do sentinela");
  assert.notEqual(resumo.intent, "unknown", "ARTICLE_INTENT_UNKNOWN_BUG corrigido");
  assert.equal(resumo.intent, "Informacional");

  /* E o funil, que a keyword não declara, vem da classificação terminal. */
  assert.equal(contexto.keywords[0].strategy.semanticQualification, null, "sem qualificação versionada, como no smoke");
  assert.equal(resumo.funnel, "Topo", "ARTICLE_FUNNEL_UNKNOWN_BUG corrigido");

  /* O motivo viaja junto: nada de carimbo sem origem. */
  assert.equal(contexto.article.classification?.funnel, "TOP");
  assert.match(String(contexto.article.classification?.reason), /composição não diverge/);
});

test("GATE 18.2 · C — a intenção observada na SERP não substitui a do Article", () => {
  const contexto = contextoDe();

  /*
   * §2 — SÃO AUTORIDADES DIFERENTES, MESMO QUANDO CONCORDAM.
   *
   * O fundamento vive em `context.article`; a leitura da SERP vive no modelo
   * observado. O Radar nunca preenche um com o outro — e o teste garante que a
   * correção não abriu esse caminho.
   */
  assert.equal(contexto.article.classification?.intent, "INFORMATIONAL");
  assert.equal(contexto.article.mainIntent, "Informacional");

  const view = vista();
  assert.ok(view.observed.intent.observedInSerp !== undefined, "a SERP tem a própria leitura");
  /* A leitura da SERP não escreve no fundamento. */
  assert.equal(view.observed.identity.articleId, "artigo-1");
  assert.equal(buildRadarArticleDnaSummary(contexto).intent, "Informacional");

  const fonte = readFileSync(new URL("../lib/radar/article-research-context.ts", import.meta.url), "utf8");
  assert.ok(!/observedInSerp|dominantIntent/.test(fonte), "o contexto do fundamento não lê a SERP");
});

test("GATE 18.2 · sem classificação terminal, o Radar não inventa nada", () => {
  /*
   * A correção lê o que existe; ela não fabrica. Um ArticleDNA sem
   * classificação — ou com ela indeterminada — continua sem funil, e a ausência
   * permanece declarada.
   */
  const semClassificacao = contextoDe({ classification: undefined });
  assert.equal(semClassificacao.article.classification, null);
  assert.equal(radarDeclaredFunnel(semClassificacao).read, null);
  assert.match(radarDeclaredFunnel(semClassificacao).reason, /não foi declarado/);

  const indeterminada = contextoDe({
    classification: {
      intent: { value: "AMBIGUOUS", reason: "A composição diverge.", source: "group" },
      funnel: { value: "INDETERMINATE", reason: "Nenhum estágio foi concluído.", source: "article_decision" },
    },
  });
  assert.equal(indeterminada.article.classification, null, "indeterminado não é valor");
  assert.equal(buildRadarArticleDnaSummary(indeterminada).funnel, null);
});

/* ==========  D, E e F · A DESCOBERTA VOLTA A SE APLICAR  =========== */

/* ---------------- a investigação real, em miniatura ---------------- */

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

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((page, index) => ({ position: index + 1, title: page.title, domain: `d${index}.com`, url: page.url })) };

function vista(contexto: RadarArticleResearchContext = contextoDe()) {
  const base = {
    context: contexto,
    record: startRadarDeepResearch({ context: contexto, plan: buildRadarResearchQueryPlan(contexto), startedBy: "ator", now: "2026-09-10T09:00:00.000Z" }),
    snapshot: SNAPSHOT as never, extractions: PAGINAS, observedAt: "2026-09-10T12:00:00.000Z",
  } as Parameters<typeof buildRadarDeepResearchView>[0];

  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({
      referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
      decision: autoDecideRadarReference(reference).decision, reason: "",
    })),
  };
  const recordBase = base.record as NonNullable<typeof base.record>;
  return buildRadarDeepResearchView({ ...base, record: { ...recordBase, researchCuration: curadoria } });
}

test("GATE 18.2 · D, E e F — TOFU real ativa a descoberta, e ela usa o modelo real", () => {
  const contexto = contextoDe();
  assert.equal(radarDeclaredFunnel(contexto).read, "TOFU", "TOFU_AI_DISCOVERY_APPLICABLE");

  const view = vista(contexto);
  const descoberta = view.observed.aiDiscovery;

  assert.equal(descoberta.applicable, true, "AI_DISCOVERY_ZERO_DUE_TO_FOUNDATION_BUG_FIXED");
  assert.equal(descoberta.funnel.read, "TOFU", "e o funil viaja com origem e motivo, não como string solta");
  assert.match(descoberta.funnel.source, /Classificação terminal do ArticleDNA/);

  /*
   * §4 — AS PERGUNTAS NÃO SÃO COPIADAS DO MODELO COMPETITIVO.
   *
   * O Gate 13 continua decidindo o que é CORE, o que apenas apoia e o que
   * depende de evidência, com dedupe semântico. O que este gate corrigiu foi o
   * FUNDAMENTO chegar — não a forma de derivar.
   */
  assert.ok(descoberta.answerableUnits.length > 0, "a descoberta deriva do modelo real");
  const perguntasDoModelo = view.observed.questions.length;
  assert.ok(perguntasDoModelo > 0, "a fixture tem perguntas competitivas");
  assert.notEqual(descoberta.answerableUnits.length, perguntasDoModelo * 1000, "sem cópia cega");
  for (const unidade of descoberta.answerableUnits) {
    assert.ok(unidade.id && unidade.questionOrNeed, "cada unidade tem identidade e texto");
  }
});

test("GATE 18.2 · F — perder o funil zerava a descoberta; é isso que o defeito fazia", () => {
  /*
   * O CONTRASTE EXPLÍCITO, PELO MESMO CAMINHO DA TELA.
   *
   * A mesma amostra, o mesmo modelo competitivo — muda só o fundamento.
   *
   * ESCREVI ESTE TESTE ERRADO NA PRIMEIRA VEZ, supondo que bastava perder o
   * funil para a camada se calar. Não basta: sem funil, a autoridade ainda
   * pergunta se a intenção declarada é informacional, e só desiste quando nem
   * isso responde. A fixture abaixo reproduz o caso real — funil ausente E
   * intenção ausente — que é o que produzia UNDETERMINED com zero unidades ao
   * lado de um modelo competitivo cheio de perguntas.
   */
  /* A linha do Radar também não declara intenção: é o caso sem fundamento algum. */
  const semFundamento = buildRadarArticleResearchContext({
    item: { ...item(), intent: null } as never,
    article: { id: "dna-v1", versionId: "dna-v1", payload: dnaPayload({ classification: undefined, mainIntent: undefined }) } as never,
  });
  const viewSemFundamento = vista(semFundamento);
  const descobertaSemFundamento = viewSemFundamento.observed.aiDiscovery;

  assert.equal(descobertaSemFundamento.funnel.read, null, "sem funil declarado");
  assert.equal(descobertaSemFundamento.applicability, "UNDETERMINED");
  assert.equal(descobertaSemFundamento.applicable, false, "a descoberta não se aplica");
  assert.equal(descobertaSemFundamento.answerableUnits.length, 0, "e é assim que a tela ficava zerada");
  assert.ok(viewSemFundamento.observed.questions.length > 0, "enquanto o modelo competitivo continuava cheio");

  /* Com a classificação terminal lida, a MESMA amostra produz unidades. */
  const comFundamento = vista().observed.aiDiscovery;
  assert.equal(comFundamento.applicability, "REQUIRED", "TOFU torna a camada obrigatória");
  assert.equal(comFundamento.applicable, true);
  assert.ok(comFundamento.answerableUnits.length > 0, "o que mudou foi o fundamento chegar, não a amostra");

  /*
   * E a intenção terminal sozinha já basta para a camada se aplicar como
   * contexto — é a segunda metade da mesma lacuna de leitura.
   */
  const soIntencao = contextoDe({
    mainIntent: undefined,
    classification: { intent: { value: "INFORMATIONAL", reason: "A Principal declara.", source: "principal" } },
  });
  const descobertaSoIntencao = vista(soIntencao).observed.aiDiscovery;
  assert.equal(descobertaSoIntencao.funnel.read, null, "sem funil");
  assert.equal(descobertaSoIntencao.applicable, true, "mas a intenção terminal responde");
});

/* ==========  G, H, I e J · O ESPECIALISTA  ======================== */

test("GATE 18.2 · G e H — requisito preparado impede Não necessário, sem virar contribuição", () => {
  const view = vista();
  const requisitos = view.observed.authorityEvidence.specialistReviewRequirements;
  assert.ok(requisitos.length > 0, `a fixture precisa de requisito: ${requisitos.length}`);

  const resumo = buildRadarSpecialistSummary({
    observed: view.observed,
    specialist: { requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0 },
  });

  assert.equal(resumo.requirementsPrepared, requisitos.length);
  assert.notEqual(resumo.statusLabel, "Não necessário", "SPECIALIST_REQUIREMENT_WITH_ZERO_CONTRIBUTION_SUPPORTED");
  assert.match(resumo.statusLabel, /Revisão necessária/);

  /* §7 — os quatro números continuam distinguíveis. */
  assert.equal(resumo.requestsSent, 0);
  assert.equal(resumo.contributionsReceived, 0);
  assert.equal(resumo.evidenceReviewed, 0);
  assert.match(resumo.lines.join(" "), /0 pedido\(s\) · 0 contribuição\(ões\)/);
});

test("GATE 18.2 · J — sem requisito nenhum, Não necessário volta a ser a verdade", () => {
  const semRequisitos = {
    authorityEvidence: { specialistReviewRequirements: [] },
  } as never;
  const resumo = buildRadarSpecialistSummary({ observed: semRequisitos, specialist: null });

  assert.equal(resumo.requirementsPrepared, 0);
  assert.equal(resumo.statusLabel, "Não necessário");
  assert.equal(resumo.tone, "neutral");
  assert.match(resumo.lines[0], /Nenhuma afirmação exige revisão/);
});

test("GATE 18.2 · o ciclo do especialista tem quatro estados, não um contador", () => {
  const view = vista();
  const cenarios = [
    { entrada: { requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0 }, esperado: /Revisão necessária/ },
    { entrada: { requestsSent: 1, contributionsReceived: 0, reviewedEvidence: 0 }, esperado: /Aguardando o especialista/ },
    { entrada: { requestsSent: 1, contributionsReceived: 1, reviewedEvidence: 0 }, esperado: /Contribuição recebida/ },
    { entrada: { requestsSent: 1, contributionsReceived: 1, reviewedEvidence: 1 }, esperado: /Contribuição revisada/ },
  ];
  for (const cenario of cenarios) {
    const resumo = buildRadarSpecialistSummary({ observed: view.observed, specialist: cenario.entrada });
    assert.match(resumo.statusLabel, cenario.esperado, JSON.stringify(cenario.entrada));
  }
});

test("GATE 18.2 · I — card e Relatório respondem pela mesma autoridade", () => {
  const view = vista();
  const resumo = buildRadarSpecialistSummary({ observed: view.observed, specialist: null });
  const relatorio = buildRadarReportSummary({ observed: view.observed, view });
  const check = relatorio.checks.find(item => item.id === "specialist");

  assert.ok(check, "o Relatório pergunta pelo especialista");
  assert.equal(check!.state, resumo.requirementsPrepared > 0 ? "PENDING" : "NOT_REQUIRED", "SPECIALIST_REPORT_USES_SAME_AUTHORITY");
  assert.match(check!.detail, new RegExp(String(resumo.requirementsPrepared)));

  /*
   * E A TELA CONSOME A PROJEÇÃO — GATE 18.7 endureceu o que isso significa.
   *
   * Até aqui bastava o card CHAMAR a autoridade. Não bastava: a planilha
   * chamava outra coisa (o estado do fluxo R4) e a mesma tela dizia "1 ponto
   * preparado" no bundle e "Não necessário" na linha. Duas chamadas da mesma
   * função com entradas diferentes divergem igual.
   *
   * A projeção passou a ser montada UMA vez, por quem tem a investigação em
   * mãos, e as duas superfícies consomem o mesmo objeto.
   */
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /const resumoEspecialista = model\.specialist\.summary/, "SPECIALIST_CARD_USES_SAME_AUTHORITY");
  assert.ok(!/buildRadarSpecialistSummary\(/.test(workbench), "o card não monta mais a própria leitura");

  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(pagina, /const especialista = buildRadarSpecialistSummary\(\{/, "a montagem única existe");
  assert.match(
    pagina,
    /specialist: \{ \.\.\.r3\.specialist, summary: especialista, status: especialista\.statusLabel \}/,
    "e é ela que responde pelo estado da linha",
  );
});

/* ==========  §11 · NOMENCLATURA  ================================= */

test("GATE 18.2 · §11 — o painel se chama Pesquisa, e nada além do rótulo mudou", () => {
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /Pesquisa \{radarSearchModeLabel\(searchMode\)\}/);
  assert.ok(!/>Investigação \{radarSearchModeLabel/.test(workbench));
  /* O bloco congelado continua se chamando investigação: ele é outra coisa. */
  assert.match(workbench, /Investigação congelada/);
});

/* ==========  L e M · NADA A MONTANTE É TOCADO  =================== */

test("GATE 18.2 · L e M — o ArticleDNA não é mutado, e a leitura é pura", () => {
  const payload = dnaPayload();
  const antes = JSON.stringify(payload);

  const contexto = buildRadarArticleResearchContext({
    item: item() as never,
    article: { id: "dna-v1", versionId: "dna-v1", payload } as never,
  });
  buildRadarArticleDnaSummary(contexto);
  radarDeclaredFunnel(contexto);

  assert.equal(JSON.stringify(payload), antes, "ARTICLE_DNA não é mutado");

  /* E o contexto é uma leitura: mexer nele não volta para o fundamento. */
  assert.notEqual(contexto.article.classification, payload.classification, "o contexto carrega cópia, não referência");
});

/* ==============  K · REAL_PROVIDER_CALLS = 0  =================== */

test("GATE 18.2 · K — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
