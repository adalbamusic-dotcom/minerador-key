import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { RadarItemSchema, type RadarItem } from "../lib/editorial/operational-flow.ts";
import { buildRadarArticleResearchContext, type RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { RADAR_FOUNDATION_USAGE_MAP, radarFoundationUsageFor, radarUnmappedFoundationFields } from "../lib/radar/foundation-usage-map.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { buildRadarYoutubeQueryPlan, RADAR_YOUTUBE_MAX_QUERIES, RADAR_YOUTUBE_QUERY_ORIGINS } from "../lib/radar/youtube-search-queries.ts";
import { buildExpertTopicContext, RadarR6ExpertTopicContextSchema } from "../lib/radar/r6-sequential.ts";
import { parseRadarR7TopicResponse, radarR7SubjectTopic } from "../lib/radar/r7-sequential.ts";
import { buildRadarEditorialArticleModel, type RadarEditorialArticleModel, type RadarEditorialSection } from "../lib/radar/editorial-article-model.ts";
import { buildRadarBlueprintSummary, type RadarEditorialBlueprint, type RadarSectionCandidate } from "../lib/radar/editorial-blueprint.ts";
import type { RadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import { radarPortableEditorialOf } from "../lib/radar/portable-read-model.ts";
import {
  RADAR_SUBJECT_MUST_COVER_REASON,
  RADAR_SUBJECT_NO_SIGNAL,
  RADAR_SUBJECT_NO_TOUCH_ALERT,
  radarIsSubjectTurnSection,
  radarSubjectTurnSectionId,
  readRadarDeclaredSubjectInPages,
} from "../lib/radar/declared-subject.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import {
  freezeRadarEvidenceBundle,
  radarFinalizationReadiness,
  RadarFrozenEvidenceBundleSchema,
  assertRadarFrozenBundleIntegrity,
} from "../lib/radar/investigation-finalization.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * ===== SDD do Assunto · F3 · o Radar investiga em torno do tronco =====
 *
 * O Assunto é declarado pelo humano no Minerador e fixado pelo Arquiteto no
 * ArticleDNA. O Radar LÊ: a pauta pede para aprofundá-lo, o YouTube o procura
 * dentro do teto, o modelo editorial exige a virada e a SERP das sustentações
 * diz, por palavras, onde ela cabe. O Radar nunca troca, promove ou rebaixa o
 * Assunto, e as consultas do Google não mudam.
 *
 * Tudo com fixture. Nenhuma rede: o fetch global falha o teste.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

/* ======================== o artigo real, com e sem Assunto ======================== */

const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const articleId = "article-skincare-pele-oleosa";
const articleDnaVersionId = "8f2b1c44-1111-4d50-8797-5d387adb4849";
const HASH = "sha256:" + "d".repeat(64);

type Kw = { id: string; texto: string; role: "principal" | "secundaria" | "reforco_narrativo" };
const KEYWORDS: Kw[] = [
  { id: "bbbbbbbb-0000-4000-8000-000000000001", texto: "skincare para pele oleosa", role: "principal" },
  { id: "bbbbbbbb-0000-4000-8000-000000000002", texto: "melhor sabonete para pele oleosa", role: "secundaria" },
  { id: "bbbbbbbb-0000-4000-8000-000000000003", texto: "skincare pele oleosa", role: "secundaria" },
  { id: "bbbbbbbb-0000-4000-8000-000000000004", texto: "ácido salicílico", role: "reforco_narrativo" },
];
const principal = KEYWORDS[0];

const ASSUNTO = {
  keywordId: "cccccccc-0000-4000-8000-000000000009",
  approvedPackageRef: { versionId: "pacote-v3", contentHash: HASH },
  phrase: "Consulta dermatológica online",
  note: "atendimento com dermatologista sem sair de casa",
  destinationUrl: "https://marca-exemplo.com.br/consulta-online",
  attachedBy: "7d1c2b3a-0000-4000-8000-000000000001",
  attachedAt: "2026-09-24T12:00:00+00:00",
};

const referencia = (kw: Kw) => ({
  keywordId: kw.id, keywordDnaVersionId: `kwdna-${kw.id}`, keywordDnaContentHash: HASH, role: kw.role,
  strategicContribution: `Contribuição de ${kw.texto}`, coveredIntentions: ["informational"],
  requiredTopics: [kw.texto], excludedTopics: [], classificationOrigin: "human" as const, confidence: 0.8,
  humanConfirmed: true, normalizedIntent: "informational" as const,
  volume: 1000, resultCount: 210, kgrScore: 0.1,
});

const hidratada = (kw: Kw) => ({
  referenceKeywordId: kw.id, canonicalKeywordId: kw.id, sourceKeywordId: kw.id, originalKeywordId: kw.id,
  aliases: [], keywordDnaVersionId: `kwdna-${kw.id}`, keyword: kw.texto, role: kw.role,
  brandId, siloId: "silo-skincare", siloName: "Skincare", isPublished: false,
});

const radarItem = (): RadarItem => RadarItemSchema.parse({
  id: `radar:${articleId}`, brandId, articleId, articleDnaVersionId, articleDnaContentHash: HASH,
  title: "Skincare para pele oleosa", slug: "skincare-para-pele-oleosa",
  siloId: "silo-skincare", hierarchy: "Pilar", principalKeywordId: principal.id, format: "Pilar",
  intent: "informacional", state: "research_pending", importedAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z", origin: "local", lockVersion: 1,
  hydration: {
    schemaVersion: 1, brandId, articleId, articleDnaVersionId, source: "arquiteto_import",
    capturedAt: "2026-09-07T10:00:00.000Z", principalKeywordId: principal.id,
    principalKeyword: hidratada(principal), keywordSnapshots: KEYWORDS.map(hidratada),
    silo: {
      id: "silo-skincare", name: "Skincare", siloDnaVersionId: "silodna-skincare-v2",
      siloDnaContentHash: HASH, territoryRef: "territorio-skincare", siloPageId: "silopage-skincare",
      siloPageVersionId: "silopage-skincare-v1", siloPageSlug: "/skincare",
      siloPageCanonical: "https://marca-exemplo.com.br/skincare",
      siloPagePublicationStatus: "published", articleRole: "pillar",
    },
  },
  arquitetoKeywordDnaReferences: KEYWORDS.map(referencia),
});

const articleDna = (comAssunto: boolean): ArticleDNA => ({
  schemaVersion: 1, articleId, brandId, principalKeywordId: principal.id,
  secondaryKeywordIds: KEYWORDS.filter(kw => kw.role === "secundaria").map(kw => kw.id),
  narrativeReinforcementIds: KEYWORDS.filter(kw => kw.role === "reforco_narrativo").map(kw => kw.id),
  keywordReferences: KEYWORDS.map(referencia), siloId: "silo-skincare", hierarchy: "Pilar",
  suggestedSlug: "skincare-para-pele-oleosa", canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
  audience: "Pele oleosa", problem: "Brilho e poros", desiredResult: "Rotina estável",
  journeyStage: "consideracao", brandObjective: "Autoridade",
  promise: "Rotina de skincare que controla a oleosidade sem ressecar", angle: "Prático", cta: "Conhecer",
  coverage: ["limpeza facial", "hidratação para pele oleosa"], excludedSubjects: [],
  antiCannibalizationBoundary: "Sem maquiagem", nearbyArticleIds: [], differentiation: ["Passo a passo"],
  entities: ["skincare"], requiredTopics: ["protetor solar para pele oleosa"], questions: ["quantas vezes lavar o rosto?"],
  objections: ["preço"], evidenceNeeded: ["exemplo prático"], sourcesNeeded: ["referência técnica"], internalLinks: [], alerts: [],
  confidence: 0.75, humanPendingDecisions: [],
  ...(comAssunto ? { subject: { ...ASSUNTO, approvedPackageRef: { ...ASSUNTO.approvedPackageRef } } } : {}),
} as unknown as ArticleDNA);

const envelope = (comAssunto: boolean): VersionEnvelope<ArticleDNA> => ({
  versionId: articleDnaVersionId, entityId: articleId, versionNumber: 4, previousVersionId: null,
  contentHash: HASH, origin: "human", changeReason: "fixture", createdAt: "2026-09-07T09:00:00.000Z",
  createdBy: "auditor", payload: articleDna(comAssunto),
} as VersionEnvelope<ArticleDNA>);

const contextoReal = (comAssunto: boolean) => buildRadarArticleResearchContext({ item: radarItem(), article: envelope(comAssunto) });

/** Congela em profundidade: qualquer escrita no fundamento vira erro. */
function congelarFundo<T>(valor: T): T {
  if (valor && typeof valor === "object") {
    for (const chave of Object.keys(valor as Record<string, unknown>)) congelarFundo((valor as Record<string, unknown>)[chave]);
    Object.freeze(valor);
  }
  return valor;
}

/* ============================== F3.1 · o contexto ============================== */

test("F3 · contexto: sem Assunto a chave não existe; com Assunto só frase, nota e destino", () => {
  const sem = contextoReal(false);
  assert.equal(Object.keys(sem.article).includes("subject"), false, "nem null, nem chave vazia");

  const com = contextoReal(true);
  assert.deepEqual(com.article.subject, {
    phrase: ASSUNTO.phrase, note: ASSUNTO.note, destinationUrl: ASSUNTO.destinationUrl,
  });
  assert.equal(JSON.stringify(com.article.subject).includes(ASSUNTO.keywordId), false, "o id da keyword do Assunto não viaja");

  const { subject, ...resto } = com.article;
  assert.ok(subject);
  assert.deepEqual(resto, sem.article, "o resto do artigo é o mesmo");
  assert.deepEqual(com.keywords, sem.keywords, "principal, papéis e textos não mudam");
});

test("F3 · mapa de uso: article.subject tem categoria e consumidores nomeados", () => {
  const com = contextoReal(true);
  const observados = Object.keys(com.article).filter(chave => chave === "subject").map(chave => `article.${chave}`);
  assert.deepEqual(observados, ["article.subject"]);
  assert.deepEqual(radarUnmappedFoundationFields(observados), []);

  const linha = radarFoundationUsageFor("article.subject");
  assert.ok(linha, "sem a linha nova o mapa deixa o Assunto sem uso declarado");
  assert.ok(linha.usage.length > 0);
  for (const consumidor of ["editorial-article-model", "editorial-blueprint", "competitive-observed-model", "youtube-search-queries", "r6-sequential", "portable-read-model"]) {
    assert.ok(linha.consumers.some(item => item.startsWith(consumidor)), `consumidor ${consumidor}`);
  }
  assert.equal(RADAR_FOUNDATION_USAGE_MAP.filter(item => item.field === "article.subject").length, 1);
});

test("F3 · consultas Google: o plano é idêntico com e sem Assunto", () => {
  const sem = buildRadarResearchQueryPlan(contextoReal(false));
  const com = buildRadarResearchQueryPlan(contextoReal(true));
  assert.deepEqual(com, sem);
  assert.equal(com.queries.some(query => query.keyword === ASSUNTO.phrase), false, "o Assunto não vira consulta do Google");
});

/* ============================== F3.1 · o YouTube ============================== */

test("F3 · YouTube: DECLARED_SUBJECT só com Assunto, logo depois da principal, e a última da fila sai", () => {
  assert.equal(RADAR_YOUTUBE_QUERY_ORIGINS[1], "DECLARED_SUBJECT");

  const sem = buildRadarYoutubeQueryPlan({ context: contextoReal(false) });
  const com = buildRadarYoutubeQueryPlan({ context: contextoReal(true) });

  assert.equal(sem.queries.some(query => query.origin === "DECLARED_SUBJECT"), false);
  assert.equal(sem.queries.length, RADAR_YOUTUBE_MAX_QUERIES, "o fixture enche o teto");
  assert.equal(com.queries.length, sem.queries.length, "nenhuma consulta a mais");
  assert.ok(com.queries.length <= RADAR_YOUTUBE_MAX_QUERIES);

  assert.equal(com.queries[0].origin, "PRIMARY_KEYWORD");
  assert.equal(com.queries[1].origin, "DECLARED_SUBJECT");
  assert.equal(com.queries[1].text, ASSUNTO.phrase);

  const ultima = sem.queries[sem.queries.length - 1];
  assert.deepEqual(com.queries.slice(2), sem.queries.slice(1, -1), "a ordem das demais não muda");
  assert.equal(com.queries.some(query => query.queryId === ultima.queryId), false, "a que sai é a última da fila");
  assert.ok(com.limitations.some(item => item.includes(ultima.text)), "o deslocamento é dito");
  assert.deepEqual(sem.limitations, com.limitations.filter(item => !item.includes("Assunto")));
});

test("F3 · YouTube: com fila curta o plano também não cresce", () => {
  const curto = (comAssunto: boolean) => ({
    ...contextoReal(comAssunto),
    keywords: contextoReal(comAssunto).keywords.filter(item => item.identity.role === "principal"),
    editorialTopics: [],
  }) as RadarArticleResearchContext;
  const sem = buildRadarYoutubeQueryPlan({ context: curto(false) });
  const com = buildRadarYoutubeQueryPlan({ context: curto(true) });
  assert.equal(sem.queries.length, 3, "principal e dois enquadramentos");
  assert.equal(com.queries.length, 3);
  assert.deepEqual(com.queries.map(query => query.origin), ["PRIMARY_KEYWORD", "DECLARED_SUBJECT", "AUDIOVISUAL_FRAMING"]);
});

/* ============================== F3.1 · o especialista ============================== */

test("F3 · especialista: a pauta pede para aprofundar o Assunto; a principal continua a promessa", () => {
  const sem = buildExpertTopicContext(articleId, { brandId, article: envelope(false) });
  const com = buildExpertTopicContext(articleId, { brandId, article: envelope(true) });

  assert.equal(Object.keys(sem.articleDna).includes("subject"), false);
  assert.equal(com.articleDna.principal, articleDna(true).promise);
  assert.equal(com.articleDna.principal, sem.articleDna.principal);
  assert.equal(com.articleDna.subject?.phrase, ASSUNTO.phrase);
  assert.equal(com.articleDna.subject?.destinationUrl, ASSUNTO.destinationUrl);
  assert.match(com.articleDna.subject?.request || "", /aprofundar o Assunto e a virada: o que o leitor desta busca precisa entender para chegar a Consulta dermatológica online/i);
  assert.doesNotThrow(() => RadarR6ExpertTopicContextSchema.parse(com));

  const { subject, ...restoCom } = com.articleDna;
  assert.ok(subject);
  assert.deepEqual(restoCom, sem.articleDna);
});

/* ============================== F3.1 · o modelo editorial ============================== */

const AMOSTRA = 10;
let sequencia = 0;

function candidato(titulo: string, paginas: number): RadarSectionCandidate {
  sequencia += 1;
  return {
    id: `candidate-${sequencia}`, conceptId: `concept-${sequencia}`, workingTitle: titulo,
    conceptTypeLabel: "Assunto", purpose: `Cobrir "${titulo}".`,
    priority: paginas >= 5 ? "ESSENTIAL" : "RECOMMENDED", placement: "FLEXIBLE", placementReason: "",
    questions: [{ id: `q-${sequencia}`, text: titulo, priority: "RECOMMENDED", answerRequirement: "", marketStatement: "", factualSupport: "NOT_REQUIRED" }],
    definitions: [], entities: { primary: null, related: [] },
    marketEvidence: { pages: paginas, sampleSize: AMOSTRA, statement: `${paginas} de ${AMOSTRA}` },
    factualStatus: "NOT_REQUIRED", factualNote: "", specialistRequirementIds: [], internalLinks: [],
    videoOpportunityId: null, differentiation: null, limitations: [], provenance: [], confidence: "MEDIUM",
  } as unknown as RadarSectionCandidate;
}

const candidatosBase = (extra: RadarSectionCandidate[] = []) => {
  sequencia = 0;
  return [
    candidato("O que é a pele oleosa?", 7),
    candidato("Como cuidar de pele oleosa?", 6),
    candidato("Como controlar o brilho da pele oleosa?", 4),
    candidato("Pele oleosa precisa de hidratação?", 5),
    candidato("Proteção solar para pele oleosa", 1),
    ...extra,
  ];
};

const contextoDoModelo = (comAssunto: boolean, patch: Partial<RadarArticleResearchContext["article"]> = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado." },
    ...(comAssunto ? { subject: { phrase: ASSUNTO.phrase, note: ASSUNTO.note, destinationUrl: ASSUNTO.destinationUrl } } : {}),
    ...patch,
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "skincare para pele oleosa" } }],
  editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "proteção solar"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "como cuidar de pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const observadoFalso = (declaredSubject?: RadarCompetitiveObservedModel["declaredSubject"]): RadarCompetitiveObservedModel => ({
  sample: { comparablePages: AMOSTRA, uniqueReferences: 12, analyzedSuccess: AMOSTRA, failedFinal: 0 },
  concepts: { all: [], recurrent: [], confirmed: [], undercovered: [], isolated: [] },
  structure: { measures: [], presences: [], patterns: [] },
  questions: [], entities: { primary: [], related: [] }, gaps: [], differentiations: [], conflicts: [], competitors: [],
  internalLinkPlan: { outgoing: [], siloPage: null },
  authorityEvidence: { specialistReviewRequirements: [] },
  aiDiscovery: { answerableUnits: [], definitionRequirements: [] },
  intent: { declared: "informacional", observedInSerp: "informacional" },
  ...(declaredSubject ? { declaredSubject } : {}),
} as unknown as RadarCompetitiveObservedModel);

const blueprintFalso = (sections: RadarSectionCandidate[]): RadarEditorialBlueprint => ({
  article: { title: null, principal: "skincare para pele oleosa", objective: "Cobrir o tema.", intent: "Informacional", funnel: "Topo", siloRole: "SUPORTE" },
  opening: { directives: ["Responder cedo."], evidence: "7 de 10 páginas." },
  sections,
  closing: null, essentialQuestions: [], entities: { primary: [], related: [] },
  differentiation: { marketCovers: [], underCovered: [], ownOpportunities: [] },
  unresolvedLinks: [], specialistBriefs: [], videoBriefs: [], limitations: [],
  readiness: { state: "READY", reason: "" },
} as unknown as RadarEditorialBlueprint);

const paginaDeTitulo = (indice: number, titulo: string, h2: string[] = []) => ({
  url: `https://dominio-${indice}.com.br/pagina`, title: titulo, h1: [titulo], h2, h3: [],
});

const modelo = (input: { comAssunto: boolean; candidatos?: RadarSectionCandidate[]; paginas?: ReturnType<typeof paginaDeTitulo>[]; patch?: Partial<RadarArticleResearchContext["article"]> }) => {
  const context = contextoDoModelo(input.comAssunto, input.patch);
  const leitura = input.comAssunto ? readRadarDeclaredSubjectInPages({ context, pages: input.paginas || [] }) : null;
  return buildRadarEditorialArticleModel({
    context,
    observed: observadoFalso(leitura || undefined),
    blueprint: blueprintFalso(input.candidatos || candidatosBase()),
  });
};

const arvoreToda = (model: RadarEditorialArticleModel): RadarEditorialSection[] =>
  model.sections.flatMap(secao => [secao, ...secao.childSections]);

test("F3 · modelo sem Assunto: nenhum campo novo, nada muda", () => {
  const sem = modelo({ comAssunto: false });
  assert.equal(Object.keys(sem).includes("declaredSubject"), false);
  assert.equal(Object.keys(sem.conclusion).includes("destinationDirection"), false);
  assert.equal(arvoreToda(sem).some(secao => radarIsSubjectTurnSection(secao.id)), false);
  assert.equal(arvoreToda(sem).some(secao => secao.mustCoverReasons.includes(RADAR_SUBJECT_MUST_COVER_REASON)), false);
});

test("F3 · virada com 0 páginas: a seção exigida existe, DNA_REQUIRED, motivo próprio, e não é H2 por decreto", () => {
  const paginas = [paginaDeTitulo(1, "Skincare para pele oleosa"), paginaDeTitulo(2, "Rotina para pele oleosa", ["Quando procurar um dermatologista?"])];
  const model = modelo({
    comAssunto: true,
    candidatos: candidatosBase([candidato("Quando procurar um dermatologista para pele oleosa?", 2)]),
    paginas,
  });

  const idDaVirada = radarSubjectTurnSectionId(ASSUNTO.phrase);
  assert.equal(model.sections.some(secao => secao.id === idDaVirada), false, "nunca H2 por decreto");

  const virada = arvoreToda(model).find(secao => secao.id === idDaVirada);
  assert.ok(virada, "a seção da virada existe mesmo sem candidato observado");
  assert.equal(virada.level, 3);
  assert.equal(virada.evidenceStrength, "DNA_REQUIRED");
  assert.deepEqual(virada.evidenceRefs, []);
  assert.deepEqual(virada.mustCoverReasons, [RADAR_SUBJECT_MUST_COVER_REASON]);
  assert.equal(virada.headingSuggestion, `Virada para ${ASSUNTO.phrase}`);

  const assunto = model.declaredSubject;
  assert.ok(assunto);
  assert.equal(assunto.turnSection.source, "SYNTHETIC");
  assert.equal(assunto.turnSection.pages, 0);
  assert.equal(assunto.turnSection.placement, "H3");
  assert.equal(assunto.turnSection.hostSectionId, virada.parentId);
});

test("F3 · virada com 0 páginas e sem tema em comum vira ponto a cobrir do eixo, não H2", () => {
  const model = modelo({ comAssunto: true, candidatos: candidatosBase(), paginas: [paginaDeTitulo(1, "Skincare para pele oleosa")] });
  const idDaVirada = radarSubjectTurnSectionId(ASSUNTO.phrase);
  assert.equal(arvoreToda(model).some(secao => secao.id === idDaVirada), false);

  const assunto = model.declaredSubject;
  assert.ok(assunto);
  assert.equal(assunto.turnSection.placement, "COVERAGE_POINT");
  const anfitriao = model.sections.find(secao => secao.id === assunto.turnSection.hostSectionId);
  assert.ok(anfitriao);
  assert.ok(anfitriao.mustCoverReasons.includes(RADAR_SUBJECT_MUST_COVER_REASON));
  assert.ok(anfitriao.coveragePoints.includes(`virada para ${ASSUNTO.phrase}`));
  assert.equal(assunto.suggestedPosition, null);
  assert.equal(assunto.suggestedPositionLabel, RADAR_SUBJECT_NO_SIGNAL);
});

test("F3 · virada com menos de três seções também não vira H2", () => {
  sequencia = 0;
  const model = modelo({
    comAssunto: true,
    candidatos: [candidato("Como cuidar de pele oleosa?", 6), candidato("Quando procurar um dermatologista para pele oleosa?", 2)],
    paginas: [paginaDeTitulo(1, "Skincare")],
  });
  const idDaVirada = radarSubjectTurnSectionId(ASSUNTO.phrase);
  assert.equal(model.sections.some(secao => secao.id === idDaVirada), false);
  assert.ok(arvoreToda(model).some(secao => secao.id === idDaVirada));
});

test("F3 · grupo observado que cobre o Assunto ganha dnaRequired e o motivo próprio, sem seção duplicada", () => {
  const model = modelo({
    comAssunto: true,
    candidatos: candidatosBase([candidato("Consulta dermatológica online vale a pena?", 3)]),
    paginas: [paginaDeTitulo(1, "Consulta dermatológica online para pele oleosa")],
  });

  assert.equal(arvoreToda(model).some(secao => radarIsSubjectTurnSection(secao.id)), false, "nenhuma virada sintética");
  const doAssunto = model.candidates.find(item => item.observedLabel === "Consulta dermatológica online vale a pena?");
  assert.ok(doAssunto);
  assert.equal(doAssunto.dnaRequired, true);

  const assunto = model.declaredSubject;
  assert.ok(assunto);
  assert.equal(assunto.turnSection.source, "OBSERVED_GROUP");
  assert.equal(assunto.turnSection.pages, 3);
  const carregando = arvoreToda(model).filter(secao => secao.mustCoverReasons.includes(RADAR_SUBJECT_MUST_COVER_REASON));
  assert.equal(carregando.length, 1, "uma seção carrega a virada");
  const esperado = assunto.turnSection.placement === "COVERAGE_POINT" ? assunto.turnSection.hostSectionId : assunto.turnSection.id;
  assert.equal(carregando[0].id, esperado);
});

test("F3 · a virada proposta no blueprint não é candidato observado nem duplica", () => {
  const idDaVirada = radarSubjectTurnSectionId(ASSUNTO.phrase);
  const model = modelo({ comAssunto: true, candidatos: [...candidatosBase(), { ...candidato("Virada para Consulta dermatológica online", 0), id: idDaVirada }] });
  assert.equal(model.candidates.some(item => radarIsSubjectTurnSection(item.id)), false, "a virada proposta não é candidato observado");
  assert.equal(model.declaredSubject?.turnSection.source, "SYNTHETIC");
  assert.ok(arvoreToda(model).filter(secao => secao.id === idDaVirada).length <= 1);
});

test("F3 · posição sugerida e contagem quando a amostra toca as raízes", () => {
  const paginas = [
    paginaDeTitulo(1, "Skincare para pele oleosa", ["Quando procurar um dermatologista?"]),
    paginaDeTitulo(2, "Pele oleosa: guia", ["Quando procurar um dermatologista?"]),
    paginaDeTitulo(3, "Pele oleosa sem mistério"),
  ];
  const model = modelo({ comAssunto: true, candidatos: candidatosBase([candidato("Quando procurar um dermatologista para pele oleosa?", 2)]), paginas });
  const assunto = model.declaredSubject;
  assert.ok(assunto);
  assert.ok(assunto.suggestedPosition);
  assert.equal(assunto.suggestedPosition.pages, 2);
  assert.match(assunto.suggestedPositionLabel, /^Depois de ".+": a seção da amostra que mais traz palavras do Assunto \(aparece em 2 de 10 página\(s\)\)\.$/);
  assert.equal(assunto.sampleLabel, "Palavras do Assunto aparecem em 2 de 3 página(s) da amostra (títulos e subtítulos).");
  assert.equal(assunto.alert, null);
  assert.equal(assunto.criterion, "LEXICAL_STEMS");
  assert.equal(assunto.h1Complement.suggested, false, "nenhum título toca o Assunto");
  assert.equal(assunto.h1Complement.label, "Assunto em H2/H3 — o H1 é da principal: palavras do Assunto aparecem em H2/H3 de 2 de 3 página(s).");
  assert.notEqual(assunto.h1Complement.label, RADAR_SUBJECT_NO_SIGNAL, "com sinal em H2/H3, não é \"sem sinal\"");
  assert.equal(assunto.h1Complement.titlePages, 0);
  assert.equal(assunto.h1Complement.headingPages, 2, "as duas páginas o tratam em H2: é o sinal de \"Assunto em H2/H3\"");
});

test("F3 · complemento do H1 sugerido quando os títulos do topo tocam as raízes, com contagem", () => {
  const paginas = [
    paginaDeTitulo(1, "Consulta online com dermatologista para pele oleosa"),
    paginaDeTitulo(2, "Dermatologista online: vale para pele oleosa?"),
    paginaDeTitulo(3, "Skincare para pele oleosa"),
  ];
  const model = modelo({ comAssunto: true, paginas });
  const h1 = model.declaredSubject?.h1Complement;
  assert.ok(h1);
  assert.equal(h1.suggested, true);
  assert.equal(h1.complement, ASSUNTO.phrase);
  assert.equal(h1.titlePages, 2);
  assert.equal(h1.sampleSize, 3);
  assert.match(h1.label, /aparecem no título de 2 de 3 página\(s\)/);
  assert.equal(model.articleIdentity.principalKeyword, "skincare para pele oleosa", "o H1 continua da principal");
});

test("F3 · sem toque na amostra: alerta com o critério em limitations, sem mexer em principal nem papéis", () => {
  const context = contextoDoModelo(true);
  const antes = JSON.stringify(context);
  congelarFundo(context);
  const paginas = [paginaDeTitulo(1, "Skincare para pele oleosa", ["Como cuidar"]), paginaDeTitulo(2, "Rotina diária", ["Hidratação"])];
  const leitura = readRadarDeclaredSubjectInPages({ context, pages: paginas });
  assert.ok(leitura);
  assert.equal(leitura.pagesTouching, 0);
  assert.equal(leitura.headingPagesTouching, 0);
  assert.equal(leitura.alert, RADAR_SUBJECT_NO_TOUCH_ALERT);
  assert.match(leitura.alert, /critério por palavras/);

  const model = buildRadarEditorialArticleModel({ context, observed: observadoFalso(leitura), blueprint: blueprintFalso(candidatosBase()) });
  assert.ok(model.limitations.includes(RADAR_SUBJECT_NO_TOUCH_ALERT));
  assert.equal(model.declaredSubject?.alert, RADAR_SUBJECT_NO_TOUCH_ALERT);
  assert.equal(JSON.stringify(context), antes, "o contexto não foi alterado");
  assert.equal(model.articleIdentity.principalKeyword, "skincare para pele oleosa");
});

test("F3 · Assunto sem termo próprio pelo critério (sigla curta): a virada é exigida e o limite é dito", () => {
  const model = modelo({ comAssunto: true, patch: { subject: { phrase: "SEO para pele oleosa", note: null, destinationUrl: null } } });
  const assunto = model.declaredSubject;
  assert.ok(assunto);
  assert.equal(assunto.turnSection.source, "SYNTHETIC");
  assert.ok(assunto.alert && /siglas curtas não contam/.test(assunto.alert));
  assert.ok(model.limitations.includes(assunto.alert));
  assert.equal(model.candidates.filter(item => item.dnaRequired).length <= candidatosBase().length, true);
});

test("F3 · CTA: a direção para o destino fica ao lado da chamada observada", () => {
  const sem = modelo({ comAssunto: false });
  const com = modelo({ comAssunto: true });
  assert.equal(com.conclusion.callToAction, sem.conclusion.callToAction, "a chamada observada não é substituída");
  assert.equal(com.conclusion.destinationDirection, `Levar o leitor a ${ASSUNTO.destinationUrl}.`);
  assert.equal(com.declaredSubject?.ctaDirection, `Levar o leitor a ${ASSUNTO.destinationUrl}.`);

  const portatilCom = radarPortableEditorialOf({ profile: "GOOGLE", principalKeyword: "skincare para pele oleosa", articleModel: com });
  const portatilSem = radarPortableEditorialOf({ profile: "GOOGLE", principalKeyword: "skincare para pele oleosa", articleModel: sem });
  assert.equal(portatilCom.cta, portatilSem.cta);
  assert.equal(portatilCom.ctaDestination, `Levar o leitor a ${ASSUNTO.destinationUrl}.`);
  assert.equal(portatilCom.subjectTurn?.phrase, ASSUNTO.phrase);
  assert.equal(Object.keys(portatilSem).includes("ctaDestination"), false);
  assert.equal(Object.keys(portatilSem).includes("subjectTurn"), false);

  const semDestino = modelo({ comAssunto: true, patch: { subject: { phrase: ASSUNTO.phrase, note: null, destinationUrl: null } } });
  assert.equal(Object.keys(semDestino.conclusion).includes("destinationDirection"), false);
});

/* ============================== F3.1 · o FINALIZE ============================== */

const H2_REAIS = [
  "O QUE É A PELE OLEOSA?",
  "Como cuidar de pele oleosa?",
  "Como controlar o brilho da pele oleosa?",
  "Pele oleosa precisa de hidratação?",
  "Qual é a relação entre pele oleosa e acne?",
  "Como escolher produtos para pele oleosa?",
];

const paginaReal = (indice: number, headings: string[]): RadarExtractionPage => ({
  id: `competitor:page-${indice}`,
  url: `https://dominio-${indice}.com.br/skincare-pele-oleosa`,
  status: "success", fetchedAt: "2026-09-10T10:00:00.000Z",
  title: `Concorrente ${indice}`, metaDescription: "", canonical: null,
  h1: ["Skincare para pele oleosa"], h2: headings, h3: [], wordCount: 1700,
  internalLinkCount: 4, externalLinkCount: 2, listCount: 2, tableCount: 0, faqCount: 1,
  imageCount: 3, blockquoteCount: 0, comparisonCount: 0, hasDates: true,
  author: "Redação", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 4, italicCount: 0, paragraphCount: 14, paragraphWordCounts: [80],
  headingOutline: [{ level: 1, text: "Skincare para pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 70, introText: "A pele oleosa produz mais sebo do que precisa.", closingWordCount: 50,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [], error: null,
} as unknown as RadarExtractionPage);

const PAGINAS = Array.from({ length: 10 }, (_, indice) => paginaReal(indice + 1, H2_REAIS));
const SNAPSHOT = {
  query: "skincare para pele oleosa",
  organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com.br`, url: item.url })),
};

const contextoDaPesquisa = (comAssunto: boolean): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado." },
    ...(comAssunto ? { subject: { phrase: ASSUNTO.phrase, note: ASSUNTO.note, destinationUrl: ASSUNTO.destinationUrl } } : {}),
  },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: null, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

function vistaCongelavel(comAssunto: boolean, paginas: RadarExtractionPage[] = PAGINAS) {
  const context = contextoDaPesquisa(comAssunto);
  const snapshot = {
    query: SNAPSHOT.query,
    organicResults: paginas.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com.br`, url: item.url })),
  };
  const base = startRadarDeepResearch({ context, plan: buildRadarResearchQueryPlan(context), startedBy: "ator", now: "2026-09-10T09:00:00.000Z" });
  const universo = buildRadarDeepResearchView({
    context, record: base, snapshot: snapshot as never, extractions: paginas, observedAt: "2026-09-11T12:00:00.000Z",
  } as Parameters<typeof buildRadarDeepResearchView>[0]);
  const record = {
    ...base,
    researchCuration: {
      universeFingerprint: radarResearchUniverseFingerprint(universo.references),
      confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
      references: universo.references.map(reference => ({
        referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
        decision: autoDecideRadarReference(reference).decision, reason: "",
      })),
    },
  };
  const view = buildRadarDeepResearchView({
    context, record, snapshot: snapshot as never, extractions: paginas,
    observedAt: "2026-09-11T12:00:00.000Z", selectedReferences: 10, curationConfirmed: true,
  } as Parameters<typeof buildRadarDeepResearchView>[0]);
  return { view, record };
}

const congelar = (comAssunto: boolean) => {
  const { view, record } = vistaCongelavel(comAssunto);
  const resultado = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false, pending: 0,
      analyzed: view.observed.sample.analyzedSuccess, failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record, mode: "WEB", sufficiency: view.sufficiency,
    blueprint: view.blueprint,
    frozenBy: "ator", frozenAt: "2026-09-11T08:00:00.000Z",
  });
  if (!resultado.ok) throw new Error(`a fixture não congelou: ${resultado.reason}`);
  return { view, bundle: resultado.bundle };
};

test("F3 · FINALIZE: a seção da virada entra em blueprint.sections e o alerta em limitations, no schema atual", () => {
  const { view, bundle } = congelar(true);

  const idDaVirada = radarSubjectTurnSectionId(ASSUNTO.phrase);
  assert.ok(view.blueprint.sections.some(secao => secao.id === idDaVirada), "a virada é bloco do blueprint");
  assert.equal(view.blueprint.sections.filter(secao => secao.id === idDaVirada).length, 1);

  const congelada = bundle.blueprint?.sections.find(secao => secao.id === idDaVirada);
  assert.ok(congelada, "a virada congela como qualquer seção");
  assert.equal(congelada.workingTitle, `Virada para ${ASSUNTO.phrase}`);
  assert.equal(congelada.priority, "ESSENTIAL");
  assert.deepEqual(congelada.questionIds, []);

  assert.ok(view.observed.declaredSubject, "a amostra foi lida por raízes");
  assert.equal(view.observed.declaredSubject.basis, "PAGES");
  assert.ok(bundle.limitations.includes(RADAR_SUBJECT_NO_TOUCH_ALERT), "o alerta congela em limitations");

  assert.equal(JSON.stringify(bundle).includes(ASSUNTO.note), false, "o subject não é copiado para o bundle");
  assert.equal(Object.keys(bundle).includes("subject"), false);
  const relido = RadarFrozenEvidenceBundleSchema.parse(JSON.parse(JSON.stringify(bundle)));
  assert.doesNotThrow(() => assertRadarFrozenBundleIntegrity(relido));

  const modeloDaVista = view.articleModel;
  assert.ok(modeloDaVista.declaredSubject);
  assert.equal(modeloDaVista.declaredSubject.turnSection.id, idDaVirada);
  assert.notEqual(modeloDaVista.declaredSubject.turnSection.placement, "ALONE");
  assert.equal(modeloDaVista.sections.some(secao => secao.id === idDaVirada), false, "nunca H2 por decreto");
});

test("F3 · FINALIZE sem Assunto: nada da virada, nenhum campo novo", () => {
  const { view, bundle } = congelar(false);
  assert.equal(Object.keys(view.observed).includes("declaredSubject"), false);
  assert.equal(Object.keys(view.articleModel).includes("declaredSubject"), false);
  assert.equal(view.blueprint.sections.some(secao => radarIsSubjectTurnSection(secao.id)), false);
  assert.equal(bundle.blueprint?.sections.some(secao => radarIsSubjectTurnSection(secao.id)), false);
  assert.equal(bundle.limitations.includes(RADAR_SUBJECT_NO_TOUCH_ALERT), false);

  const { bundle: comAssunto } = congelar(true);
  const semVirada = {
    ...comAssunto.blueprint,
    sections: comAssunto.blueprint?.sections.filter(secao => !radarIsSubjectTurnSection(secao.id)),
  };
  assert.deepEqual(semVirada.sections, bundle.blueprint?.sections, "fora a virada, os blocos são os mesmos");
});

test("F3 · amostra que cobre o Assunto: o bloco observado carrega a virada e nenhuma seção sintética nasce", () => {
  const paginas = Array.from({ length: 10 }, (_, indice) =>
    paginaReal(indice + 1, indice < 6 ? [...H2_REAIS, "Consulta dermatológica online para pele oleosa vale a pena?"] : H2_REAIS));
  const { view } = vistaCongelavel(true, paginas);

  const cobre = view.blueprint.sections.filter(secao => !radarIsSubjectTurnSection(secao.id) && /consulta dermatol/i.test(secao.workingTitle));
  assert.ok(cobre.length > 0, "a amostra trouxe o bloco do Assunto");
  assert.equal(view.blueprint.sections.some(secao => radarIsSubjectTurnSection(secao.id)), false, "sem duplicata no blueprint");

  const modelo = view.articleModel;
  assert.equal(arvoreToda(modelo).some(secao => radarIsSubjectTurnSection(secao.id)), false, "sem duplicata no modelo");
  assert.equal(modelo.declaredSubject?.turnSection.source, "OBSERVED_GROUP");
  assert.ok(arvoreToda(modelo).some(secao => secao.mustCoverReasons.includes(RADAR_SUBJECT_MUST_COVER_REASON)));
  assert.equal(view.observed.declaredSubject?.pagesTouching, 6);
  assert.equal(view.observed.declaredSubject?.alert, null);
  assert.equal(view.observed.limitations.includes(RADAR_SUBJECT_NO_TOUCH_ALERT), false);
});

test("F3 · o Assunto aparece nas páginas sem virar candidato: virada exigida, posição pela ordem da amostra", () => {
  const paginas = Array.from({ length: 10 }, (_, indice) =>
    paginaReal(indice + 1, indice < 6 ? [...H2_REAIS, "Consulta dermatológica online vale a pena?"] : H2_REAIS));
  const { view } = vistaCongelavel(true, paginas);

  const idDaVirada = radarSubjectTurnSectionId(ASSUNTO.phrase);
  assert.ok(view.blueprint.sections.some(secao => secao.id === idDaVirada), "nenhum candidato cobre: a virada é exigida");

  const leitura = view.observed.declaredSubject;
  assert.ok(leitura);
  assert.equal(leitura.pagesTouching, 6);
  assert.deepEqual(leitura.placementSignal, { precedingHeading: H2_REAIS[H2_REAIS.length - 1], pages: 6 });

  const assunto = view.articleModel.declaredSubject;
  assert.ok(assunto);
  assert.equal(assunto.turnSection.source, "SYNTHETIC");
  assert.ok(assunto.suggestedPosition);
  assert.equal(assunto.suggestedPosition.basis, "SAMPLE_ORDER");
  assert.equal(assunto.suggestedPosition.pages, 6);
  assert.match(assunto.suggestedPositionLabel, /em 6 de 10 página\(s\)/);
  assert.notEqual(assunto.suggestedPosition.afterHeading, H2_REAIS[H2_REAIS.length - 1], "a formulação do concorrente não vira cabeçalho");
  assert.equal(assunto.turnSection.placement, "H3");
  assert.equal(view.articleModel.sections.some(secao => secao.id === idDaVirada), false);
});

/* ============================== correções da F3 ============================== */

const pautaDaIa = (text: string, need: string) => ({
  text, origin: "ArticleDNA" as const, origins: ["ArticleDNA" as const],
  justification: "O ArticleDNA pede uma rotina estável.", need, reference: "ArticleDNA 4",
});
const pautasSemAssunto = () => [
  pautaDaIa("Qual rotina mínima funciona para pele oleosa?", "Rotina estável para pele oleosa"),
  pautaDaIa("Como reduzir o brilho ao longo do dia?", "Brilho e poros"),
  pautaDaIa("O que muda com o protetor solar na oleosidade?", "Protetor solar para pele oleosa"),
];

test("F3 · especialista: o pedido de aprofundar é instrução, não necessidade — pauta genérica sobre o leitor continua recusada", () => {
  const com = buildExpertTopicContext(articleId, { brandId, article: envelope(true) });
  const generica = [...pautasSemAssunto().slice(0, 2), pautaDaIa("O que o leitor desta busca precisa entender?", "Aprofundar o que o leitor desta busca precisa entender")];
  assert.throws(() => parseRadarR7TopicResponse(com, { topics: generica }), /relacionada/i,
    "as palavras do request (leitor, busca, precisa, entender) não abrem o filtro");
  const doAssunto = [...pautasSemAssunto().slice(0, 2), pautaDaIa("Quando a consulta dermatológica online resolve?", "Consulta dermatológica online")];
  assert.doesNotThrow(() => parseRadarR7TopicResponse(com, { topics: doAssunto }), "a frase do Assunto continua sendo necessidade real");
});

test("F3 · especialista: sem pauta da IA sobre o Assunto, a pauta de aprofundá-lo entra no fim; com ela, nada é acrescentado", () => {
  const sem = buildExpertTopicContext(articleId, { brandId, article: envelope(false) });
  const com = buildExpertTopicContext(articleId, { brandId, article: envelope(true) });

  assert.equal(radarR7SubjectTopic(sem), null);
  assert.deepEqual(parseRadarR7TopicResponse(sem, { topics: pautasSemAssunto() }), pautasSemAssunto(), "sem Assunto, nada muda");

  const garantida = radarR7SubjectTopic(com);
  assert.ok(garantida);
  assert.equal(garantida.text, `O que o leitor desta busca precisa entender para chegar a ${ASSUNTO.phrase}?`, "o texto vai ao especialista sem edição: pergunta simples");
  assert.equal(/Assunto|virada|tronco|ArticleDNA/i.test(garantida.text), false, "sem jargão da casa no texto da pauta");
  assert.notEqual(garantida.text, com.articleDna.subject?.request, "o pedido interno da SDD não vira texto da pauta");
  assert.equal(garantida.origin, "ArticleDNA");
  assert.equal(garantida.reference, "ArticleDNA 4", "a referência vem da proveniência recebida");
  assert.equal(garantida.need, `${ASSUNTO.phrase}: ${ASSUNTO.note}`);

  const semPautaDoAssunto = parseRadarR7TopicResponse(com, { topics: pautasSemAssunto() });
  assert.equal(semPautaDoAssunto.length, 4);
  assert.deepEqual(semPautaDoAssunto.slice(0, 3), pautasSemAssunto(), "as pautas da IA ficam como vieram");
  assert.deepEqual(semPautaDoAssunto[3], garantida);

  const comPautaDoAssunto = [...pautasSemAssunto().slice(0, 2), pautaDaIa("Quando a consulta dermatológica online resolve?", "Consulta dermatológica online")];
  assert.equal(parseRadarR7TopicResponse(com, { topics: comPautaDoAssunto }).length, 3, "a IA já cobriu o Assunto");
});

test("F3 · resumo do blueprint: a seção da virada não conta como bloco da amostra", () => {
  const idDaVirada = radarSubjectTurnSectionId(ASSUNTO.phrase);
  const base = candidatosBase();
  const semVirada = buildRadarBlueprintSummary(blueprintFalso(base));
  const comVirada = buildRadarBlueprintSummary(blueprintFalso([...candidatosBase(), { ...candidato("Virada para Consulta dermatológica online", 0), id: idDaVirada }]));
  assert.equal(comVirada.sections, semVirada.sections);
  assert.equal(comVirada.sections, base.length);
  const soVirada = buildRadarBlueprintSummary(blueprintFalso([{ ...candidato("Virada para Consulta dermatológica online", 0), id: idDaVirada }]));
  assert.equal(soVirada.sections, 0, "amostra vazia: zero blocos observados, como a prontidão diz");
});

/* ============================== F3.3 · estrutural ============================== */

const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function arquivosDe(diretorio: string, filtro: (nome: string) => boolean): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(diretorio)) {
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDe(caminho, filtro));
    else if (filtro(caminho)) saida.push(caminho);
  }
  return saida;
}

test("F3 · estrutural: o bundle congelado não ganhou campo de Assunto", () => {
  const fonte = semComentarios(readFileSync("lib/radar/investigation-finalization.ts", "utf8"));
  assert.doesNotMatch(fonte, /subject/i);
  assert.deepEqual(Object.keys(RadarFrozenEvidenceBundleSchema.shape).sort(), [
    "acknowledgedInsufficiency", "authority", "binding", "blueprint", "bundleHash", "bundleId", "conclusion",
    "discovery", "foundationFingerprint", "frozenAt", "frozenBy", "limitations", "links", "model", "sample",
    "search", "serpStanding",
  ]);
});

test("F3 · estrutural: nenhum caminho do Radar escreve subject no ArticleDNA", () => {
  const radar = [
    ...arquivosDe("lib/radar", nome => nome.endsWith(".ts")),
    ...arquivosDe("app/api/editorial", nome => /radar-/.test(nome) && nome.endsWith(".ts")),
    ...readdirSync("lib/server").filter(nome => nome.startsWith("radar-") && nome.endsWith(".ts")).map(nome => join("lib/server", nome)),
    ...readdirSync("modules/radar").filter(nome => nome.endsWith(".tsx") || nome.endsWith(".ts")).map(nome => join("modules/radar", nome)),
  ];
  assert.ok(radar.length > 50, "a varredura alcança o Radar inteiro");

  for (const caminho of radar) {
    const fonte = semComentarios(readFileSync(caminho, "utf8"));
    assert.doesNotMatch(fonte, /\.subject\s*=(?!=)/, `${caminho} atribui subject`);
    assert.doesNotMatch(fonte, /DeclaredSubjectSchema|ArticleDNASchema/, `${caminho} monta ou valida ArticleDNA`);
    assert.doesNotMatch(fonte, /arquiteto-persistence/, `${caminho} importa a escrita do Arquiteto`);
    assert.doesNotMatch(fonte, /from\(\s*["'`]editorial_artifact_versions["'`]\s*\)\s*\.\s*(insert|update|upsert)/, `${caminho} grava versão de artefato`);
  }
});

test("F3 · o fundamento entra congelado e sai intacto por todos os leitores", () => {
  const dna = congelarFundo(envelope(true));
  const antes = JSON.stringify(dna);
  const context = buildRadarArticleResearchContext({ item: radarItem(), article: dna });
  buildRadarYoutubeQueryPlan({ context });
  buildRadarResearchQueryPlan(context);
  buildExpertTopicContext(articleId, { brandId, article: dna });
  assert.equal(JSON.stringify(dna), antes);
});

test("F3 · nenhuma chamada de rede", () => {
  assert.deepEqual(idasAoServidor, []);
});
