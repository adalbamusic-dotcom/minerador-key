import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarBlueprintSummary, buildRadarEditorialBlueprint } from "../lib/radar/editorial-blueprint.ts";
import { RADAR_CONCEPT_TYPE_LABEL } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import { buildRadarPlannerEvidenceHandoff } from "../lib/radar/planner-handoff.ts";
import { buildRadarResetPayload } from "../lib/radar/radar-reset.ts";
import { buildRadarReportSummary } from "../lib/radar/operational-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 18.3 · O DOSSIÊ EDITORIAL  ===============================
 *
 * O Radar tinha telemetria boa e nenhuma história. "3 conceitos · 13 perguntas
 * · 45 diferenciações · 19 fontes" é auditável e não responde a única pergunta
 * que quem opera faz: como este artigo deve ser construído?
 *
 * O que estes testes protegem é a fronteira dessa camada. Ela PROPÕE blocos com
 * o porquê ao lado; ela não decide H2, ordem final, título nem contagem de
 * palavras — isso continua sendo do Planejador. E nada aqui é inventado: cada
 * bloco, pauta e oportunidade aponta para a evidência que o sustenta.
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

/*
 * A AMOSTRA PRECISA TER NARRATIVA, NÃO SÓ VOLUME.
 *
 * Os quatro tipos de necessidade estão aqui de propósito: caracterizar (sinal
 * observável), causa, rotina (processo) e segurança (afirmação sensível). É o
 * que permite testar posição, oportunidade de vídeo e pauta de especialista com
 * material real em vez de listas vazias.
 */
const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("É seguro usar ácido salicílico na gravidez?");
  return pagina(`A${index}`, headings);
});

const ARTIGO = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v18", articleDnaContentHash: "hash-dna" };

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    ...ARTIGO,
    promise: "Explicar como identificar, compreender e cuidar da pele oleosa.",
    mainIntent: "Informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "A Principal declara este estágio." },
  },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informational", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v18", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["rotina de cuidados para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((page, index) => ({ position: index + 1, title: page.title, domain: `d${index}.com`, url: page.url })) };

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

function vista(patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never,
    extractions: PAGINAS, observedAt: "2026-09-10T12:00:00.000Z", ...patch,
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
  const recordBase = base.record as NonNullable<typeof base.record>;
  return buildRadarDeepResearchView({ ...base, record: { ...recordBase, researchCuration: curadoria } });
}

const blueprintDe = (view = vista()) => view.blueprint;

/* ==========  A, B e C · O BLUEPRINT NASCE DA INVESTIGAÇÃO  ========== */

test("GATE 18.3 · A e C — o blueprint deriva da investigação real, com proveniência", () => {
  const view = vista();
  const blueprint = blueprintDe(view);

  assert.ok(blueprint.sections.length > 0, `a fixture precisa de blocos: ${blueprint.sections.length}`);
  assert.equal(blueprint.article.intent, "Informacional");
  assert.equal(blueprint.article.funnel, "Topo");
  assert.match(blueprint.article.objective, /identificar, compreender e cuidar/);

  /* C — cada bloco aponta para o que o sustenta. Sem isso, vira opinião. */
  for (const secao of blueprint.sections) {
    assert.ok(secao.provenance.length > 0, `${secao.workingTitle} sem proveniência`);
    assert.ok(secao.purpose.trim().length > 0, `${secao.workingTitle} sem "por que entra"`);
    assert.ok(secao.marketEvidence.sampleSize > 0, `${secao.workingTitle} sem amostra`);
    const fontes = secao.provenance.map(item => item.source);
    assert.ok(fontes.includes("SEMANTIC_CONCEPT") || fontes.includes("AI_DISCOVERY"), "a origem é nomeada");
  }
});

test("GATE 18.3 · B — sem evidência não há bloco proposto", () => {
  /*
   * Propor estrutura sem amostra seria inventar o artigo. Uma investigação
   * vazia produz blueprint vazio, e a readiness diz isso em voz alta.
   */
  const semAmostra = buildRadarDeepResearchView({
    context: contexto(), record: null, snapshot: null, extractions: [],
    observedAt: "2026-09-10T12:00:00.000Z",
  });
  assert.deepEqual(semAmostra.blueprint.sections, []);
  assert.equal(semAmostra.blueprint.readiness.state, "INSUFFICIENT");
  assert.match(semAmostra.blueprint.readiness.reason, /não produziu necessidade suficiente/);
  assert.deepEqual(semAmostra.blueprint.videoBriefs, []);
});

/* ==========  D e E · NÃO É O CONTENTPLAN  ========================== */

test("GATE 18.3 · D e E — nenhum H2 obrigatório, nenhuma contagem de palavras", () => {
  const blueprint = blueprintDe();

  /*
   * A FRONTEIRA QUE NÃO PODE SER ATRAVESSADA.
   *
   * O Radar propõe nome de TRABALHO e tendência de posição. Congelar "H2 final"
   * ou "1800 palavras" aqui tomaria do Planejador uma decisão que depende do
   * Silo inteiro e do calendário — e o faria com menos informação.
   */
  const serializado = JSON.stringify(blueprint);
  for (const proibido of ["wordCount", "minWords", "maxWords", "finalH2", "h2Final", "finalOrder", "finalTitle"]) {
    assert.ok(!serializado.includes(proibido), `o blueprint não decide "${proibido}"`);
  }

  for (const secao of blueprint.sections) {
    assert.ok("workingTitle" in secao, "o nome é de trabalho");
    assert.ok(["EARLY", "MIDDLE", "LATE", "FLEXIBLE"].includes(secao.placement), "posição é tendência, não número");
    assert.ok(!/^SECTION_\d+$/.test(secao.placement), "nunca posição mágica");
    assert.ok(secao.placementReason.trim().length > 0, "e a tendência vem com o motivo");
  }

  /*
   * A fonte confirma que a projeção não define estrutura final — lendo o CÓDIGO.
   * O comentário que explica por que "SECTION_2" seria invenção precisa poder
   * citar o termo; proibir a palavra proibiria também a explicação.
   */
  const fonte = readFileSync(new URL("../lib/radar/editorial-blueprint.ts", import.meta.url), "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/wordCount|SECTION_\d/.test(codigo), "o código não decide estrutura final");
});

/* ==========  F, G e H · O QUE ENTRA EM CADA BLOCO  ================= */

test("GATE 18.3 · F, G e H — necessidades, definições e links entram sem serem recalculados", () => {
  const view = vista();
  const blueprint = blueprintDe(view);

  /* F — as AnswerableUnits do Gate 13 viram as perguntas de cada bloco. */
  const perguntasNoBlueprint = blueprint.sections.flatMap(secao => secao.questions.map(pergunta => pergunta.id)).sort();
  const unidades = view.observed.aiDiscovery.answerableUnits.map(unit => unit.id).sort();
  assert.ok(unidades.length > 0, "a fixture precisa de necessidades");
  assert.deepEqual(perguntasNoBlueprint, unidades, "toda necessidade entrou em algum bloco, sem duplicar");

  for (const secao of blueprint.sections) {
    for (const pergunta of secao.questions) {
      const origem = view.observed.aiDiscovery.answerableUnits.find(unit => unit.id === pergunta.id);
      assert.ok(origem, "a pergunta veio de uma unidade real");
      assert.equal(pergunta.text, origem!.questionOrNeed, "o texto é o da amostra, não reescrito");
      assert.equal(pergunta.answerRequirement, origem!.answerRequirement);
    }
  }

  /* G — definições entram onde o conceito depende delas. */
  const definicoes = blueprint.sections.flatMap(secao => secao.definitions.map(item => item.term));
  for (const termo of definicoes) {
    assert.ok(
      view.observed.aiDiscovery.definitionRequirements.some(item => item.term === termo),
      `a definição "${termo}" veio da autoridade`,
    );
  }

  /* H — os links são os do plano, campo a campo. */
  const plano = view.observed.internalLinkPlan;
  for (const secao of blueprint.sections) {
    for (const linkDoBloco of secao.internalLinks) {
      const original = plano.outgoing.find(item => item.nodeId === linkDoBloco.nodeId);
      assert.ok(original, "o link existe no plano");
      assert.equal(linkDoBloco.occurrences, original!.recommendedOccurrences, "sem recalcular ocorrências");
      assert.equal(linkDoBloco.anchor, original!.anchor.recommendedAnchor, "sem reescrever a âncora");
    }
  }
});

test("GATE 18.3 · I — falta de fonte atravessa como falta, nunca como suficiência", () => {
  const view = vista();
  const blueprint = blueprintDe(view);

  for (const secao of blueprint.sections) {
    assert.ok(
      ["ADEQUATE", "PARTIAL", "MISSING", "CONFLICTED", "NOT_REQUIRED"].includes(secao.factualStatus),
      `estado inválido: ${secao.factualStatus}`,
    );
  }

  /*
   * O CASO QUE IMPORTA, FORÇADO.
   *
   * A fixture natural não produz MISSING em nenhum bloco, e uma mutação que
   * promovia MISSING a ADEQUATE passou despercebida. Aqui a necessidade entra
   * deliberadamente sem fonte: o bloco tem que herdar a falta.
   */
  const unidades = view.observed.aiDiscovery.answerableUnits;
  assert.ok(unidades.length > 0, "a fixture precisa de necessidades");
  const comFalta = buildRadarEditorialBlueprint({
    context: contexto(),
    observed: view.observed,
    discovery: {
      ...view.observed.aiDiscovery,
      answerableUnits: unidades.map((unit, indice) => indice === 0
        ? { ...unit, factualEvidenceRequirement: { ...unit.factualEvidenceRequirement, support: "MISSING" as const, reason: "Nenhuma fonte adequada sustenta esta necessidade." } }
        : unit),
    },
  });

  const bloco = comFalta.sections.find(secao => secao.questions.some(pergunta => pergunta.factualSupport === "MISSING"));
  assert.ok(bloco, "o bloco da necessidade sem fonte existe");
  assert.equal(bloco!.factualStatus, "MISSING", "falta de fonte não se dilui no bloco");
  assert.match(bloco!.factualNote, /Nenhuma fonte adequada/, "e o motivo viaja junto");

  /* Conflito é pior que falta, e continua sendo o que prevalece. */
  const comConflito = buildRadarEditorialBlueprint({
    context: contexto(),
    observed: view.observed,
    discovery: {
      ...view.observed.aiDiscovery,
      answerableUnits: unidades.map((unit, indice) => ({
        ...unit,
        factualEvidenceRequirement: { ...unit.factualEvidenceRequirement, support: indice === 0 ? ("CONFLICTED" as const) : ("ADEQUATE" as const) },
      })),
    },
  });
  const blocoEmConflito = comConflito.sections.find(secao => secao.questions.some(pergunta => pergunta.factualSupport === "CONFLICTED"));
  assert.equal(blocoEmConflito?.factualStatus, "CONFLICTED");
});

/* ==========  §10 do Gate 16 · A RELAÇÃO NÃO RESOLVIDA  ============= */

test("GATE 18.3 · relação exigida sem contexto continua declarada, nunca convertida", () => {
  const view = vista();
  const blueprint = blueprintDe(view);
  const plano = view.observed.internalLinkPlan;

  const naoResolvidasNoPlano = [...plano.outgoing, ...plano.incoming].filter(item => item.applicationStatus !== "RESOLVED").length;
  assert.equal(blueprint.unresolvedLinks.length, naoResolvidasNoPlano, "todas viajam");
  for (const link of blueprint.unresolvedLinks) {
    assert.equal(link.unresolved, true);
    assert.ok(link.reason.trim().length > 0, "com o motivo junto");
  }
});

/* ==========  J e K · A PAUTA DO ESPECIALISTA  ===================== */

test("GATE 18.3 · J — cada requisito vira pauta legível, com o que se espera receber", () => {
  const view = vista();
  const blueprint = blueprintDe(view);
  const requisitos = view.observed.authorityEvidence.specialistReviewRequirements;

  assert.ok(requisitos.length > 0, `a fixture precisa de requisito: ${requisitos.length}`);
  assert.equal(blueprint.specialistBriefs.length, requisitos.length, "um por requisito, sem inventar nem perder");

  for (const brief of blueprint.specialistBriefs) {
    const origem = requisitos.find(item => item.requirementId === brief.requirementId);
    assert.ok(origem, "a pauta veio de um requisito real");
    assert.equal(brief.question, origem!.specificQuestion, "a pergunta é a preparada, não reescrita");
    assert.ok(brief.whyNeeded.trim().length > 0, "o porquê chega ao profissional");
    assert.ok(brief.expectedContribution.length > 0, "e o que se espera receber é explícito");
    for (const tipo of brief.expectedContribution) {
      assert.ok(["VALIDATE", "CORRECT", "QUALIFY", "ADD_EXPERIENCE"].includes(tipo));
    }
  }
});

test("GATE 18.3 · K — zero requisitos produz zero pautas, sem brief obrigatório", () => {
  /*
   * O especialista não é ornamento. Sem afirmação que exija revisão, a pauta é
   * vazia — e a área diz isso em vez de fabricar uma tarefa.
   */
  const view = vista();
  const semRequisitos = buildRadarEditorialBlueprint({
    context: contexto(),
    observed: {
      ...view.observed,
      authorityEvidence: { ...view.observed.authorityEvidence, specialistReviewRequirements: [] },
    },
  });
  assert.deepEqual(semRequisitos.specialistBriefs, []);
  assert.equal(buildRadarBlueprintSummary(semRequisitos).specialistPoints, 0);
});

/* ==========  L e M · A PAUTA DE VÍDEOS  ========================== */

test("GATE 18.3 · L — vídeo só entra quando há razão narrativa, nunca para todo conceito", () => {
  const view = vista();
  const blueprint = blueprintDe(view);

  assert.ok(blueprint.videoBriefs.length > 0, "a fixture tem necessidade demonstrável");

  /*
   * A REGRA, NÃO A CONTAGEM.
   *
   * Escrevi isto primeiro como "menos vídeos que blocos + 1" e uma mutação que
   * dava vídeo a TODO conceito passou tranquila — com três blocos e três
   * vídeos, 3 < 4. Contar não prova critério. O que prova é exigir a razão:
   * um bloco só ganha pauta se a necessidade for demonstrável (processo,
   * comparação, sinal observável) ou se depender de julgamento profissional.
   */
  /* Os rótulos reais do domínio — não uma segunda tabela que envelhece sozinha. */
  const DEMONSTRAVEIS = [
    RADAR_CONCEPT_TYPE_LABEL.PROCESS,
    RADAR_CONCEPT_TYPE_LABEL.COMPARISON,
    RADAR_CONCEPT_TYPE_LABEL.PROBLEM,
    RADAR_CONCEPT_TYPE_LABEL.ATTRIBUTE,
  ];
  for (const brief of blueprint.videoBriefs) {
    const secao = blueprint.sections.find(item => item.id === brief.relatedSectionId);
    assert.ok(secao, "a pauta se liga a um bloco real");
    const temRazao = DEMONSTRAVEIS.includes(secao!.conceptTypeLabel) || secao!.specialistRequirementIds.length > 0;
    assert.ok(temRazao, `"${secao!.workingTitle}" (${secao!.conceptTypeLabel}) ganhou vídeo sem razão narrativa`);
    assert.ok(!/todo artigo|qualquer coisa/i.test(brief.narrativePurpose), "o motivo é específico, não genérico");
    assert.ok(brief.whatToLookFor.length >= 3, "e diz concretamente o que procurar");
  }

  /* E um bloco sem razão demonstrável não pode ter recebido pauta. */
  const semRazao = blueprint.sections.filter(secao =>
    !DEMONSTRAVEIS.includes(secao.conceptTypeLabel) && !secao.specialistRequirementIds.length);
  for (const secao of semRazao) {
    assert.equal(secao.videoOpportunityId, null, `${secao.workingTitle} não devia ter pauta de vídeo`);
  }

  for (const brief of blueprint.videoBriefs) {
    assert.ok(brief.narrativePurpose.trim().length > 0, "o motivo é dito");
    assert.ok(brief.whatToLookFor.length > 0, "e o que procurar no material também");
    assert.ok(brief.relatedSectionId, "cada pauta se liga a um bloco do artigo");
    assert.ok(brief.provenance.length > 0, "com a evidência que a sustenta");
  }

  /* Blocos sem razão demonstrável não ganham pauta de vídeo. */
  const comVideo = new Set(blueprint.videoBriefs.map(brief => brief.relatedSectionId));
  const semVideo = blueprint.sections.filter(secao => !comVideo.has(secao.id));
  for (const secao of semVideo) {
    assert.equal(secao.videoOpportunityId, null, `${secao.workingTitle} não fabricou oportunidade`);
  }
});

test("GATE 18.3 · M — a pauta de vídeos não pesquisa nem transcreve nada", () => {
  const fonte = readFileSync(new URL("../lib/radar/editorial-blueprint.ts", import.meta.url), "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch\\(", "youtube", "transcri", "provider", "await "]) {
    assert.ok(!new RegExp(proibido, "i").test(codigo), `o módulo não menciona "${proibido}" em código`);
  }
  /* E a pauta existe mesmo sem nenhum vídeo cadastrado. */
  assert.ok(blueprintDe().videoBriefs.length > 0, "a pauta não depende de material associado");
});

/* ==========  N, O e P · O FINALIZE CONGELA AS TRÊS  ============== */

test("GATE 18.3 · N, O e P — finalizar congela blueprint, pauta do especialista e pauta de vídeos", () => {
  const view = vista();
  const blueprint = blueprintDe(view);

  const congelamento = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess,
      failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: view.sufficiency,
    blueprint, frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  const congelado = congelamento.bundle.blueprint;
  assert.ok(congelado, "FINALIZE_FREEZES_BLUEPRINT");
  assert.equal(congelado!.sections.length, blueprint.sections.length);
  assert.deepEqual(congelado!.sections.map(item => item.id), blueprint.sections.map(item => item.id));
  assert.deepEqual(congelado!.specialistBriefIds, blueprint.specialistBriefs.map(item => item.requirementId), "FINALIZE_FREEZES_SPECIALIST_BRIEFS");
  assert.deepEqual(congelado!.videoBriefIds, blueprint.videoBriefs.map(item => item.id), "FINALIZE_FREEZES_VIDEO_BRIEFS");

  /* A ordem e a prioridade dos blocos também ficam provadas depois. */
  for (const [indice, secao] of congelado!.sections.entries()) {
    assert.equal(secao.workingTitle, blueprint.sections[indice].workingTitle);
    assert.equal(secao.priority, blueprint.sections[indice].priority);
    assert.equal(secao.placement, blueprint.sections[indice].placement);
  }

  /* Congelar sem blueprint continua possível: o campo é aditivo. */
  const semBlueprint = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess, failed: 0, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: view.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(semBlueprint.ok && semBlueprint.bundle.blueprint, null);
});

/* ==========  Q, R e S · O RESET  ================================= */

test("GATE 18.3 · Q, R e S — o reset limpa as pautas correntes e preserva o resto", () => {
  const view = vista();
  assert.ok(view.blueprint.sections.length > 0, "antes do reset existe dossiê");

  /*
   * As três projeções são DERIVADAS da pesquisa: elas somem porque a
   * investigação que as originou sumiu, não porque alguém as apagou.
   */
  const zerada = buildRadarDeepResearchView({
    context: contexto(), record: null, snapshot: SNAPSHOT as never,
    extractions: [], observedAt: "2026-09-10T14:00:00.000Z",
  });
  assert.deepEqual(zerada.blueprint.sections, [], "currentEditorialBlueprint limpo");
  assert.deepEqual(zerada.blueprint.specialistBriefs, [], "currentSpecialistBriefs limpo");
  assert.deepEqual(zerada.blueprint.videoBriefs, [], "currentVideoBriefs limpo");

  /*
   * R e S — a fronteira do Gate 17 continua valendo: vídeos registrados e
   * contribuições reais não estão no payload que o reset reescreve.
   */
  const fonte = readFileSync(new URL("../lib/radar/radar-reset.ts", import.meta.url), "utf8");
  assert.match(fonte, /RADAR_RESET_OUTSIDE_PAYLOAD/);
  for (const preservado of ["existingContent", "expertEvidence"]) {
    assert.match(fonte, new RegExp(preservado), `${preservado} continua declarado fora do alcance`);
  }
  const payloadZerado = buildRadarResetPayload({
    extractions: [], extractionFailures: [], serpDecisions: [], selectedCompetitorIds: [], extractionIds: [],
    semanticTerms: [], structuralDecisions: [], humanNotes: [], verifiedSources: [], sourceVerificationFailures: [],
  } as never);
  assert.ok(!("existingContent" in payloadZerado), "o reset não tem campo de vídeo para apagar");
  assert.ok(!("expertEvidence" in payloadZerado), "nem de contribuição do especialista");
});

/* ==========  T e U · O PLANEJADOR ENCONTRA PRONTO  ============== */

test("GATE 18.3 · T e U — o handoff expõe o blueprint, e o Planejador não o remonta", () => {
  const view = vista();
  const congelamento = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess,
      failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: view.sufficiency,
    blueprint: view.blueprint, frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  assert.equal(congelamento.ok, true);
  if (!congelamento.ok) return;

  const handoff = buildRadarPlannerEvidenceHandoff({
    article: ARTIGO,
    frozen: congelamento.bundle,
    dossier: buildRadarEvidenceBundle({ observed: view.observed, serp: { current: true, sufficient: true, valid: true } }),
    blueprint: view.blueprint,
    preparedBy: "ator", preparedAt: "2026-09-10T14:00:00.000Z",
  });
  assert.equal(handoff.ok, true);
  if (!handoff.ok) return;

  /* T — está lá, direto, sem o Planejador precisar cavar. */
  assert.deepEqual(handoff.handoff.editorialBlueprint.sections.map(item => item.id), view.blueprint.sections.map(item => item.id));
  assert.deepEqual(handoff.handoff.editorialBlueprint.specialistBriefs, view.blueprint.specialistBriefs);
  assert.deepEqual(handoff.handoff.editorialBlueprint.videoBriefs, view.blueprint.videoBriefs);

  /*
   * U — E A EVIDÊNCIA ORIGINAL CONTINUA VIAJANDO INTEIRA.
   *
   * O blueprint é PROJEÇÃO, não substituição: o Planejador pode conferir
   * qualquer recomendação contra o modelo que a originou.
   */
  assert.ok(handoff.handoff.dossier.observed.concepts.all.length > 0, "o modelo bruto continua junto");
  assert.ok(handoff.handoff.dossier.observed.aiDiscovery.answerableUnits.length > 0);
  assert.deepEqual(
    handoff.handoff.editorialBlueprint.sections.map(item => item.conceptId).sort(),
    [...new Set(view.observed.aiDiscovery.answerableUnits.map(unit => unit.concept.id))].sort(),
    "cada bloco corresponde a um conceito do modelo",
  );
});

/* ==========  §21 e §25 · A LEITURA  ============================= */

test("GATE 18.3 · §21 e §25 — o resumo curto e a linha do Relatório", () => {
  const view = vista();
  const resumo = buildRadarBlueprintSummary(view.blueprint);

  assert.equal(resumo.sections, view.blueprint.sections.length);
  assert.equal(resumo.specialistPoints, view.blueprint.specialistBriefs.length);
  assert.equal(resumo.videoOpportunities, view.blueprint.videoBriefs.length);
  assert.ok(["Pronto", "Parcial", "Sem material suficiente"].includes(resumo.readinessLabel));

  const relatorio = buildRadarReportSummary({ observed: view.observed, view });
  const check = relatorio.checks.find(item => item.id === "blueprint");
  assert.ok(check, "o Relatório pergunta pelo blueprint");
  assert.match(check!.detail, /pauta\(s\) para especialista/);
  assert.match(check!.detail, /oportunidade\(s\) de vídeo/);
});

test("GATE 18.3 · §28 — a primeira leitura não mostra identificador técnico", () => {
  const tela = readFileSync(new URL("../modules/radar/radar-r3-blueprint.tsx", import.meta.url), "utf8");
  const render = tela.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /*
   * O que aparece na tela precisa poder ser lido em voz alta numa reunião.
   * `conceptId`, `claimId` e hash são do domínio — eles viajam no contrato, não
   * no texto que a pessoa lê.
   */
  /*
   * A `key` do React é identidade de reconciliação, não texto renderizado — e
   * o Gate 15.3 exige justamente que ela use o id do domínio. O que não pode
   * aparecer é identificador dentro do conteúdo visível.
   */
  const semKeys = render.replace(/key=\{[^}]*\}/g, "");
  for (const tecnico of ["conceptId", "claimId", "sourceId", "bundleHash", "requirementId"]) {
    assert.ok(!new RegExp(`\\{[^}]*${tecnico}`).test(semKeys), `a tela não imprime ${tecnico}`);
  }
  /* E os enums chegam traduzidos. */
  assert.match(render, /RADAR_SECTION_PRIORITY_LABEL\[/);
  assert.match(render, /RADAR_FACTUAL_STATUS_LABEL\[/);
  assert.match(render, /RADAR_SPECIALIST_CONTRIBUTION_LABEL\[/);
});

/* ==============  V · ZERO PROVIDER  ============================= */

test("GATE 18.3 · V — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
