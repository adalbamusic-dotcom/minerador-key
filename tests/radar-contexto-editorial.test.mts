import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarEditorialContext, radarPrincipalHydrated, radarRowIsLegacy } from "../lib/radar/editorial-context.ts";
import { RadarCompetitiveModelSchema, buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { RadarExtractionPageSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarItemSchema, type RadarItem } from "../lib/editorial/operational-flow.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

const brandId = "11111111-1111-4111-8111-111111111111";
const articleId = "article-1";
const articleDnaVersionId = "22222222-2222-4222-8222-222222222222";

const envelope = (payload: Record<string, unknown>): VersionEnvelope<ArticleDNA> => ({
  versionId: articleDnaVersionId, entityId: articleId, versionNumber: 7, previousVersionId: null,
  contentHash: "sha256:" + "b".repeat(64), origin: "human", changeReason: "fixture",
  createdAt: "2026-09-06T09:00:00.000Z", createdBy: "fixture",
  payload: payload as unknown as ArticleDNA,
} as VersionEnvelope<ArticleDNA>);

const dnaCompleto = {
  articleId, brandId, promise: "Cobrir máscara de skincare", suggestedSlug: "mascara-de-skincare",
  mainIntent: "informacional", hierarchy: "Pilar", siloId: "silo-1",
  requiredTopics: ["tipos de máscara"], coverage: ["máscara facial"], entities: ["argila"],
  questions: ["quantas vezes usar?"], secondaryKeywordIds: ["kw-2"], narrativeReinforcementIds: [],
  keywordReferences: [{ keywordId: "kw-1", keywordDnaVersionId: "kwdna-1", role: "principal" }],
  principalKeywordId: "kw-1", publishedIdentityRef: null,
};

const dnaLegado = { ...dnaCompleto, mainIntent: "informacional", requiredTopics: [], questions: [], entities: [], secondaryKeywordIds: [], siloId: null };

const linhaBase = () => RadarItemSchema.parse({
  id: "radar:article-1", brandId, articleId, articleDnaVersionId, articleDnaContentHash: "sha256:" + "b".repeat(64),
  title: "Cobrir máscara de skincare", slug: "mascara-de-skincare", siloId: "silo-1", hierarchy: "Pilar",
  principalKeywordId: "kw-1", format: "Pilar", intent: "informacional", state: "research_pending",
  importedAt: "2026-09-06T09:00:00.000Z", updatedAt: "2026-09-06T09:00:00.000Z", origin: "real",
});

const hydration = {
  schemaVersion: 1 as const, brandId, articleId, articleDnaVersionId, source: "arquiteto_import" as const,
  capturedAt: "2026-09-06T09:00:00.000Z", principalKeywordId: "kw-1",
  principalKeyword: { referenceKeywordId: "kw-1", canonicalKeywordId: "kw-1", sourceKeywordId: "kw-1", originalKeywordId: "kw-1", aliases: [], keywordDnaVersionId: "kwdna-1", keyword: "máscara de skincare", role: "principal" as const, brandId, siloId: "silo-1", siloName: "Skincare", isPublished: false },
  keywordSnapshots: [
    { referenceKeywordId: "kw-1", canonicalKeywordId: "kw-1", sourceKeywordId: "kw-1", originalKeywordId: "kw-1", aliases: [], keywordDnaVersionId: "kwdna-1", keyword: "máscara de skincare", role: "principal" as const, brandId, siloId: "silo-1", siloName: "Skincare", isPublished: false },
    { referenceKeywordId: "kw-2", canonicalKeywordId: "kw-2", sourceKeywordId: "kw-2", originalKeywordId: "kw-2", aliases: [], keywordDnaVersionId: "kwdna-2", keyword: "máscara de argila", role: "secundaria" as const, brandId, siloId: "silo-1", siloName: "Skincare", isPublished: false },
  ],
  silo: { id: "silo-1", name: "Skincare", siloDnaVersionId: "silodna-1", siloDnaContentHash: "sha256:" + "c".repeat(64), territoryRef: "territorio-1", siloPageId: "silopage-1", siloPageVersionId: "silopage-v1", siloPageSlug: "/skincare", siloPageCanonical: null, siloPagePublicationStatus: "published", articleRole: "pillar" as const },
};

/** A linha nova traz os blocos que só existem depois do transporte atual. */
const linhaAtual = (patch: Partial<RadarItem> = {}): RadarItem => ({
  ...linhaBase(),
  hydration,
  arquitetoKeywordDnaReferences: [
    { keywordId: "kw-1", keywordDnaVersionId: "kwdna-1", role: "principal" },
    { keywordId: "kw-2", keywordDnaVersionId: "kwdna-2", role: "secundaria" },
  ],
  arquitetoStrategyContext: { articleId, brandId, publicationStatus: "published", primaryKeyword: { keyword: "máscara de skincare", text: "máscara de skincare" } },
  arquitetoSerpProvenance: {
    assessmentId: "assessment-1", formationBaseHash: "sha256:" + "d".repeat(64), verdict: "COMPATIBLE",
    humanResolution: { decision: "seguir", reason: "a divergência foi avaliada e aceita", decidedBy: "ator-1", decidedAt: "2026-09-06T09:00:00.000Z" },
  },
  arquitetoInternalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v1", graphContentHash: "sha256:" + "e".repeat(64),
    edges: [{ sourceNodeId: "n1", targetNodeId: "n2", relationType: "suporta", anchorConcepts: ["máscara"], reason: "silo", priority: "alta", direction: "outbound" }],
  },
  ...patch,
} as RadarItem);

/** A linha antiga não tem nenhum dos três blocos — essa é a assinatura dela. */
const linhaLegada = (): RadarItem => linhaBase();

const campo = (context: ReturnType<typeof buildRadarEditorialContext>, key: string) =>
  context.fields.find(item => item.key === key)!;

/* ----------------------------- classe da linha ---------------------------- */

test("linha nova completa não abre painel", () => {
  const context = buildRadarEditorialContext({ item: linhaAtual(), article: envelope(dnaCompleto), keyword: "máscara de skincare" });
  assert.equal(context.state, "CURRENT_COMPLETE");
  assert.deepEqual(context.missing, []);
  assert.ok(context.fields.every(field => field.classification === "AVAILABLE"));
});

test("linha legada e linha nova incompleta são classificadas de formas diferentes", () => {
  const legada = buildRadarEditorialContext({ item: linhaLegada(), article: envelope(dnaLegado), keyword: "máscara de skincare" });
  const nova = buildRadarEditorialContext({ item: linhaAtual(), article: envelope(dnaLegado), keyword: "máscara de skincare" });

  assert.equal(legada.state, "LEGACY_INCOMPLETE");
  assert.equal(legada.headline, "CONTEXTO EDITORIAL LEGADO");
  assert.match(legada.summary, /antes do transporte atual/);

  assert.equal(nova.state, "CURRENT_INCOMPLETE");
  assert.equal(nova.headline, "CONTEXTO EDITORIAL INCOMPLETO");
  assert.match(nova.summary, /transporte atual e mesmo assim faltam campos/);

  assert.notEqual(legada.state, nova.state);
  assert.equal(radarRowIsLegacy(linhaLegada()), true);
  assert.equal(radarRowIsLegacy(linhaAtual()), false);
  assert.equal(radarRowIsLegacy(null), true);
});

/* --------------------------- projeção da UI ------------------------------- */

test("o que a linha do Radar transporta chega à tela: nada mais fica invisível", () => {
  const context = buildRadarEditorialContext({ item: linhaAtual(), article: envelope(dnaCompleto), keyword: "máscara de skincare" });

  assert.equal(campo(context, "keywordReferences").source, "HYDRATION");
  assert.equal(campo(context, "secundarias").value, "máscara de argila");
  assert.equal(campo(context, "siloPage").source, "HYDRATION");
  assert.equal(campo(context, "decisoesHumanas").source, "RADAR_ITEM");
  assert.match(String(campo(context, "decisoesHumanas").value), /seguir/);
  assert.equal(campo(context, "serpProvenance").value, "Parecer COMPATIBLE");
  assert.equal(campo(context, "internalLinkGraph").value, "1 relação(ões) aprovada(s)");
  assert.equal(campo(context, "publicationContext").value, "published");
  assert.equal(campo(context, "siloPage").value, "/skincare · published");

  // A classe UI_NOT_RENDERED some quando a projeção deixa de ser o gargalo.
  assert.ok(context.fields.every(field => field.classification !== "UI_NOT_RENDERED"));
});

test("campo presente na linha do Radar nunca é classificado como ausente", () => {
  const context = buildRadarEditorialContext({ item: linhaAtual(), article: null, keyword: "máscara de skincare" });
  for (const key of ["articleDnaVersionId", "principal", "keywordReferences", "siloDna", "siloPage", "funcao", "decisoesHumanas", "serpProvenance", "internalLinkGraph"]) {
    assert.equal(campo(context, key).classification, "AVAILABLE", key);
  }
});

/* ------------------------- dono de cada ausência -------------------------- */

test("ausência declarada no ArticleDNA e sumida na linha é queda de transporte", () => {
  const semIntencao = { ...linhaAtual(), intent: "" } as RadarItem;
  const context = buildRadarEditorialContext({ item: semIntencao, article: envelope(dnaCompleto), keyword: "máscara de skincare" });
  const intencao = campo(context, "mainIntent");
  // A origem declarou; a linha não trouxe. O valor ainda aparece pela origem.
  assert.equal(intencao.classification, "AVAILABLE");
  assert.equal(intencao.source, "ARQUITETO");
});

test("ausência que nunca existiu na origem tem dono ARQUITETO, não SHARED_TRANSPORT", () => {
  const context = buildRadarEditorialContext({ item: linhaAtual(), article: envelope(dnaLegado), keyword: "máscara de skincare" });
  const topicos = campo(context, "requiredTopics");
  assert.equal(topicos.classification, "LEGACY_SOURCE_MISSING");
  assert.equal(topicos.owner, "ARQUITETO");
  assert.match(topicos.detail, /Não foi declarado no ArticleDNA desta versão/);
  assert.ok(context.owners.includes("ARQUITETO"));
});

test("referências declaradas sem nenhuma hidratação são queda de hidratação", () => {
  const semHidratacao = { ...linhaAtual(), hydration: { ...hydration, keywordSnapshots: [], principalKeyword: null, silo: null } } as RadarItem;
  const context = buildRadarEditorialContext({ item: semHidratacao, article: envelope({ ...dnaCompleto, siloId: null }), keyword: "kw-1" });
  const referencias = campo(context, "keywordReferences");
  assert.equal(referencias.source, "RADAR_ITEM");
  const secundarias = campo(context, "secundarias");
  assert.equal(secundarias.source, "RADAR_ITEM");
  const siloPage = campo(context, "siloPage");
  assert.equal(siloPage.classification, "HYDRATION_DROPPED");
  assert.equal(siloPage.owner, "SHARED_TRANSPORT");
});

test("SERVER_DISCARDED não é emitido por dedução", () => {
  for (const contexto of [
    buildRadarEditorialContext({ item: linhaAtual(), article: envelope(dnaCompleto), keyword: "máscara de skincare" }),
    buildRadarEditorialContext({ item: linhaLegada(), article: envelope(dnaLegado), keyword: "kw-1" }),
    buildRadarEditorialContext({ item: null, article: envelope(dnaLegado), keyword: "kw-1" }),
  ]) {
    assert.ok(contexto.fields.every(field => field.classification !== "SERVER_DISCARDED"));
  }
});

/* ------------------------------- principal -------------------------------- */

test("principal não hidratada é lacuna de contexto, não resultado da SERP", () => {
  assert.equal(radarPrincipalHydrated("máscara de skincare"), true);
  assert.equal(radarPrincipalHydrated("kw-1"), false);
  assert.equal(radarPrincipalHydrated("pub-k-123"), false);
  assert.equal(radarPrincipalHydrated("09762023-d0d4-4c24-b34e-d0fdfd43f891"), false);
  assert.equal(radarPrincipalHydrated("Não hidratada"), false);
  assert.equal(radarPrincipalHydrated(""), false);
});

test("nem ArticleDNA nem linha carregados vira NOT_LOADED, sem inventar campos", () => {
  const context = buildRadarEditorialContext({ item: null, article: null, keyword: "máscara de skincare" });
  assert.equal(context.state, "NOT_LOADED");
  assert.deepEqual(context.fields, []);
  assert.deepEqual(context.missing, ["ArticleDNA"]);
});

/* ------------------- o modelo como dado que sobrevive --------------------- */

const pagina = (patch: Record<string, unknown>) => RadarExtractionPageSchema.parse({
  id: "page-1", url: "https://exemplo.com/a", status: "success", fetchedAt: "2026-09-07T10:00:00.000Z",
  title: "Título", metaDescription: "", canonical: null, h1: ["H1"], h2: ["Como usar", "Benefícios"], h3: [],
  wordCount: 1000, internalLinkCount: 5, externalLinkCount: 2, listCount: 3, tableCount: 0, faqCount: 0,
  imageCount: 4, blockquoteCount: 0, comparisonCount: 0, hasDates: true, author: null,
  structuredDataTypes: ["Article"], recurringTerms: [], boldCount: 10, italicCount: 0, error: "",
  ...patch,
});

test("o modelo competitivo é gravável: o schema aceita exatamente o que o builder produz", () => {
  const pages = [
    pagina({ id: "p1", url: "https://exemplo-1.com/a", headingOutline: [{ level: 2, text: "Como usar" }], paragraphCount: 12, paragraphWordCounts: [80, 60], introWordCount: 80, closingWordCount: 60, hasClosing: true }),
    pagina({ id: "p2", url: "https://exemplo-2.com/a", wordCount: 1200, headingOutline: [{ level: 2, text: "Como usar" }], paragraphCount: 14, paragraphWordCounts: [90, 70], introWordCount: 90, closingWordCount: 70, hasClosing: true }),
    pagina({ id: "p3", url: "https://exemplo-3.com/a", wordCount: 900, headingOutline: [{ level: 2, text: "Benefícios" }], paragraphCount: 10, paragraphWordCounts: [70, 50], introWordCount: 70, closingWordCount: 50, hasClosing: true }),
  ];
  const model = buildRadarCompetitiveModel({ pages, query: "máscara de skincare", observedIntent: "informacional" });
  const gravado = RadarCompetitiveModelSchema.parse(model);
  assert.deepEqual(gravado, model);
  assert.equal(gravado.sample.analyzed, 3);
});

test("amostra extraída sem a principal declara a limitação em vez de silenciar a medição", () => {
  const model = buildRadarCompetitiveModel({
    pages: [pagina({ id: "p1" }), pagina({ id: "p2", url: "https://exemplo-2.com/a" })],
    query: "máscara de skincare",
    observedIntent: "informacional",
  });
  assert.equal(model.keyword, null);
  assert.ok(model.limitations.some(item => /reanalisar as referências/i.test(item)));
});
