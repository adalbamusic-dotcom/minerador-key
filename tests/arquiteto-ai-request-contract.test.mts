import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildArticleReviewBatches,
  buildLogicalKeywordRecommendations,
  buildRelevantArticleCatalog,
} from "../lib/arquiteto/keyword-article-review.ts";
import {
  AI_STRATEGIC_PAYLOAD_LIMIT,
  StrategicSerpAssessmentSchema,
  StructureReviewRequestSchema,
  logicalCoverageGate,
  measureStrategicPayload,
  missingStrategicSerpArticleIds,
  parseStructureReviewRequest,
  projectSerpAssessmentForStrategicReview,
  projectSiloForStrategicReview,
  strategicSerpGate,
} from "../lib/arquiteto/ai-strategic-payload.ts";
import type { ArchitectKeyword, ProvisionalArticleGroup } from "../lib/arquiteto/contracts.ts";
import type { SerpFormationAssessment } from "../lib/arquiteto/serp-formation.ts";

const route = readFileSync("app/api/revalidate-structure/route.ts", "utf8");
const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const BRAND = { id: "brand-1", name: "Principia", niche: "skincare", guidelines: null };

/** Keyword com o peso técnico real do registro recebido do Minerador. */
const keywordFixture = (id: string, index: number): ArchitectKeyword => ({
  id,
  keyword: `principia serum ${index}`,
  intent: "Informacional",
  volume_search: 880,
  results_allintitle: 12,
  kgr_score: 0.013,
  status: "aprovado",
  analise_semantica: {
    intencao_principal: "Informacional",
    funil: "Topo",
    entidade_central: "sérum facial",
    modificadores: "para pele oleosa",
    publico: "consumidor final",
    problema_percebido: "não sabe escolher o sérum",
    resultado_desejado: "escolher o sérum correto",
    tipo_editorial: "guia",
    kgr_aplicabilidade: "aplicavel",
    provider_payload: "x".repeat(4000),
    historico_mensal: Array.from({ length: 24 }, (_, month) => ({ month, volume: 700 + month })),
  },
} as unknown as ArchitectKeyword);

const groupFixture = (id: string, keywordCount: number, published = false): ProvisionalArticleGroup => {
  const keywords = Array.from({ length: keywordCount }, (_, index) => keywordFixture(`${id}-kw-${index + 1}`, index + 1));
  return {
    id,
    keywordIds: keywords.map(keyword => keyword.id),
    keywords,
    publishedAnchorId: published ? `${id}-published` : null,
    suggestedSiloId: "silo-1",
    suggestedSiloName: "Sérum facial",
    evidence: {},
    confidence: 0.8,
    alerts: [],
    principalSuggestion: { keywordId: keywords[0].id, reason: "maior volume", confidence: 0.8 },
    roles: {},
    suggestedHierarchy: "Pilar",
  } as unknown as ProvisionalArticleGroup;
};

/** Assessment integral, como `latestSerpAssessmentFor` devolve da working copy. */
const serpAssessmentFixture = (group: ProvisionalArticleGroup, overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: `serp-${group.id}`,
  brandId: BRAND.id,
  articleId: group.publishedAnchorId || group.id,
  articleDnaVersionId: `adna-${group.id}`,
  version: 2,
  previousVersionId: null,
  contentHash: `sha256:${"a".repeat(64)}`,
  createdAt: "2026-08-29T12:00:00.000Z",
  createdBy: "user-1",
  mode: "keyword_individual",
  assessmentMode: "formacao",
  validationProfile: "standard",
  queryCount: group.keywords.length,
  keywordDnaReferences: [],
  intentCompatibility: "coerente",
  competitionLevel: "media",
  dominantResultTypes: ["blog"],
  conflicts: [],
  notes: [],
  evaluationStatus: "active",
  outdatedReason: null,
  recommendations: group.keywords.map(keyword => ({
    id: `rec-${keyword.id}`,
    keywordId: keyword.id,
    keywordDnaVersionId: "kdna-v1",
    snapshotIds: [`snap-${keyword.id}`],
    currentRole: "secundaria",
    suggestedRole: "secundaria",
    action: "manter_secundaria",
    confidence: "alta",
    reason: "SERP coerente com o artigo atual.",
    conflicts: [],
    decision: { status: "pending", actorId: null, decidedAt: null, workCopyVersion: null, note: null },
  })),
  // Evidência crua: existe para leitura humana, nunca para o payload da IA.
  snapshots: group.keywords.map(keyword => ({
    id: `snap-${keyword.id}`,
    keywordId: keyword.id,
    query: keyword.keyword,
    organicResults: Array.from({ length: 20 }, (_, position) => ({
      position, title: "y".repeat(120), url: `https://exemplo.com/${position}`, snippet: "z".repeat(600),
    })),
    peopleAlsoAsk: Array.from({ length: 8 }, (_, index) => ({ question: "w".repeat(120), answer: "v".repeat(400), index })),
    knowledgeGraph: { title: "t".repeat(200), description: "s".repeat(800) },
  })),
  formationEvidence: { raw: "r".repeat(5000) },
  ...overrides,
} as unknown as SerpFormationAssessment);

const siloFixture = () => ({
  siloId: "silo-1", name: "Sérum facial", centralEntity: "sérum facial",
  dominantIntent: "Informacional", boundary: "Cuidados com sérum",
  includedTopics: ["sérum"], excludedTopics: ["maquiagem"],
  pillarArticleId: "a", supportArticleIds: ["b"],
  articleReferences: Array.from({ length: 30 }, (_, index) => ({ articleId: `art-${index}`, payload: "q".repeat(400) })),
});

/**
 * Reproduz `handleRevalidateStructure`: mesmos builders, mesmas projeções,
 * mesma montagem. É o payload que sai do cliente, não uma aproximação.
 */
function strategicPayloadForArticle(
  group: ProvisionalArticleGroup,
  allGroups: ProvisionalArticleGroup[],
  assessment = serpAssessmentFixture(group),
) {
  const batch = buildArticleReviewBatches([group])[0];
  const articleCatalog = buildRelevantArticleCatalog(allGroups, batch);
  const catalogGroupIds = new Set(articleCatalog.map(article => article.groupId));
  const logicalRecommendations = buildLogicalKeywordRecommendations(allGroups, batch).map(recommendation => {
    if (!recommendation.bestTargetGroupId || catalogGroupIds.has(recommendation.bestTargetGroupId)) return recommendation;
    return { ...recommendation, bestTargetGroupId: null, bestTargetFit: null, bestTargetPublished: false, recommendation: "avaliar_novo_artigo" as const, reason: `${recommendation.reason} O artigo-alvo ficou fora do catalogo enviado a IA.` };
  });
  return {
    focusGroups: batch,
    articleCatalog,
    logicalRecommendations,
    brand: BRAND,
    serpAssessments: [projectSerpAssessmentForStrategicReview(assessment)].filter(Boolean),
    silos: [projectSiloForStrategicReview(siloFixture())],
    publishedProtections: [],
  };
}

/** O payload atravessa a serialização HTTP antes de chegar ao validador. */
const overTheWire = (payload: unknown) => JSON.parse(JSON.stringify(payload));

/** Parse pelo contrato real da rota; falhar aqui é falha do teste, não do caso. */
function acceptedRequest(payload: unknown) {
  const parsed = parseStructureReviewRequest(overTheWire(payload));
  if (!parsed.ok) assert.fail(`o lote deveria ser aceito: ${JSON.stringify(parsed.rejection.issues ?? parsed.rejection.error)}`);
  return parsed.data;
}

const KEYWORD_COUNTS = [1, 5, 6] as const;

for (const keywordCount of KEYWORD_COUNTS) {
  test(`Article de ${keywordCount} keyword(s) passa no contrato real da rota`, () => {
    const group = groupFixture(`artigo-${keywordCount}`, keywordCount);
    const payload = strategicPayloadForArticle(group, [group, groupFixture("vizinho", 3)]);

    const parsed = StructureReviewRequestSchema.safeParse(overTheWire(payload));

    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 5), null, 2));
  });
}

test("o payload por Article continua abaixo do guard depois de restaurar o catálogo", () => {
  const catalogo = ["b", "c", "d", "e", "f", "g"].map(id => groupFixture(id, 6));
  const medidas = KEYWORD_COUNTS.map(keywordCount => {
    const group = groupFixture(`artigo-${keywordCount}`, keywordCount);
    return measureStrategicPayload(strategicPayloadForArticle(group, [group, ...catalogo]));
  });

  for (const medida of medidas) {
    assert.equal(medida.limit, AI_STRATEGIC_PAYLOAD_LIMIT);
    assert.equal(medida.withinLimit, true);
  }
  // Reserva confortável: o guard existe para casos extremos, não para o caso comum.
  assert.ok(medidas.every(medida => medida.bytes < AI_STRATEGIC_PAYLOAD_LIMIT / 4));
});

test("a SERP estratégica não carrega chave inesperada nem snapshot cru", () => {
  const group = groupFixture("a", 6);
  const projected = projectSerpAssessmentForStrategicReview(serpAssessmentFixture(group))!;

  const parsed = StrategicSerpAssessmentSchema.safeParse(projected);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2));
  // `.strict()` dos dois lados: nem a projeção inventa campo, nem o schema tolera extra.
  assert.equal(StrategicSerpAssessmentSchema.safeParse({ ...projected, queriedKeywords2: [] }).success, false);

  const serialized = JSON.stringify(projected);
  for (const cru of ["organicResults", "peopleAlsoAsk", "knowledgeGraph", "formationEvidence", "snapshotIds", "decision"]) {
    assert.equal(serialized.includes(cru), false, `projeção não deve transportar ${cru}`);
  }
  // Identidade e proveniência mínimas sobrevivem à compactação.
  assert.equal(projected.id, "serp-a");
  assert.equal(projected.brandId, BRAND.id);
  assert.equal(projected.articleId, "a");
  assert.equal(projected.articleDnaVersionId, "adna-a");
  assert.equal(projected.contentHash, `sha256:${"a".repeat(64)}`);
  assert.equal(projected.version, 2);
  assert.equal(projected.evaluationStatus, "active");
});

test("snapshotCount preserva a semântica de snapshots.length", () => {
  const group = groupFixture("a", 5);
  const assessment = serpAssessmentFixture(group);

  const projected = projectSerpAssessmentForStrategicReview(assessment)!;

  assert.equal(projected.snapshotCount, assessment.snapshots.length);
  assert.equal(projected.snapshotCount, 5);
  assert.equal(projected.queriedKeywords.length, 5);
  // Cobertura vazia não pode virar cobertura implícita.
  const vazio = projectSerpAssessmentForStrategicReview(serpAssessmentFixture(group, { snapshots: [] }))!;
  assert.equal(vazio.snapshotCount, 0);
  // O gate lê o escalar, nunca as keywords consultadas.
  assert.match(route, /strategicSerpGate\(parsed\.data\)/);
  assert.doesNotMatch(route, /snapshots\.length/);
});

test("o gate aceita a SERP vigente da própria Marca realmente avaliada", () => {
  const group = groupFixture("a", 6);
  const data = acceptedRequest(strategicPayloadForArticle(group, [group]));

  assert.deepEqual(missingStrategicSerpArticleIds(data), []);
  assert.equal(strategicSerpGate(data).ok, true);
});

test("o gate rejeita SERP de outra Marca antes do provider", () => {
  const group = groupFixture("a", 6);
  const data = acceptedRequest(strategicPayloadForArticle(group, [group], serpAssessmentFixture(group, { brandId: "brand-outra" })));

  const gate = strategicSerpGate(data);

  assert.equal(gate.ok, false);
  assert.equal(gate.ok ? null : gate.rejection.status, 409);
  assert.equal(gate.ok ? null : gate.rejection.code, "SERP_REQUIRED");
});

test("o gate rejeita SERP desatualizada e SERP sem cobertura", () => {
  const group = groupFixture("a", 6);
  for (const override of [{ evaluationStatus: "outdated" }, { snapshots: [] }]) {
    const data = acceptedRequest(strategicPayloadForArticle(group, [group], serpAssessmentFixture(group, override)));

    const gate = strategicSerpGate(data);

    assert.equal(gate.ok, false, JSON.stringify(override));
    assert.equal(gate.ok ? null : gate.rejection.code, "SERP_REQUIRED");
    assert.deepEqual(missingStrategicSerpArticleIds(data), ["a"]);
  }
});

test("o catálogo preserva candidatos relevantes, inclusive o publicado", () => {
  const focus = groupFixture("a", 4);
  const relevante = groupFixture("b", 4);
  const publicado = groupFixture("c", 4, true);
  const payload = strategicPayloadForArticle(focus, [focus, relevante, publicado]);

  // Foco continua sendo um único Article; o catálogo é contexto de leitura.
  assert.equal(payload.focusGroups.length, 1);
  assert.equal(payload.focusGroups[0].groupId, "a");
  assert.ok(payload.articleCatalog.length > 1, "catálogo não pode colapsar no próprio Article");
  const catalogGroupIds = payload.articleCatalog.map(article => article.groupId);
  assert.deepEqual([...catalogGroupIds].sort(), ["a", "b", "c"]);
  assert.equal(payload.articleCatalog.some(article => article.isPublished), true);
  // Regressão de origem: filtrar o catálogo pelo próprio lote deixava a IA sem destino.
  assert.doesNotMatch(workspace, /buildRelevantArticleCatalog\([^)]*\)\.filter\(article => batchGroupIds/);
});

test("um destino proposto pode referenciar candidato do catálogo", () => {
  const focus = groupFixture("a", 4);
  const publicado = groupFixture("c", 4, true);
  const data = acceptedRequest(strategicPayloadForArticle(focus, [focus, publicado]));

  // A rota resolve targetGroupId contra o catálogo recebido; sem candidato,
  // `mover_para_artigo` e `reforcar_publicado` são estruturalmente impossíveis.
  const alvos = data.articleCatalog.filter(article => article.groupId !== "a");
  assert.ok(alvos.length > 0);
  assert.equal(alvos.some(article => article.isPublished), true);
  const alvoLogico = data.logicalRecommendations.find(recommendation => recommendation.bestTargetGroupId);
  assert.ok(alvoLogico, "a pré-análise precisa poder apontar um destino alternativo");
  assert.ok(data.articleCatalog.some(article => article.groupId === alvoLogico.bestTargetGroupId));
});

test("nenhuma keyword de outro Article entra no lote em foco", () => {
  const focus = groupFixture("a", 6);
  const vizinho = groupFixture("b", 6);
  const payload = strategicPayloadForArticle(focus, [focus, vizinho]);

  const focusKeywordIds = payload.focusGroups.flatMap(group => group.keywords.map(keyword => keyword.keywordId));

  assert.deepEqual(focusKeywordIds, focus.keywords.map(keyword => keyword.id));
  assert.equal(focusKeywordIds.some(id => id.startsWith("b-")), false);
  // A pré-análise cobre exatamente as keywords do lote, nem mais nem menos.
  assert.equal(logicalCoverageGate(acceptedRequest(payload)).ok, true);
});

test("1 Article com 6 keywords continua sendo 1 request", () => {
  const batches = buildArticleReviewBatches([groupFixture("a", 6)]);

  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 1);
  assert.equal(batches[0][0].keywords.length, 6);
});

/** Ordem real da rota: os três gates rodam antes de qualquer chamada ao provider. */
function runPreProviderPipeline(raw: unknown, callProvider: () => void) {
  const parsed = parseStructureReviewRequest(raw);
  if (!parsed.ok) return parsed.rejection;
  const serp = strategicSerpGate(parsed.data);
  if (!serp.ok) return serp.rejection;
  const coverage = logicalCoverageGate(parsed.data);
  if (!coverage.ok) return coverage.rejection;
  callProvider();
  return null;
}

test("request inválido não chega ao provider", () => {
  const group = groupFixture("a", 6);
  const payload = strategicPayloadForArticle(group, [group]);
  const invalidos: Array<[string, unknown]> = [
    ["serp integral (a regressão do HTTP 400)", { ...payload, serpAssessments: [serpAssessmentFixture(group)] }],
    ["serp de outra Marca", { ...payload, serpAssessments: [projectSerpAssessmentForStrategicReview(serpAssessmentFixture(group, { brandId: "outra" }))] }],
    ["sem pré-análise lógica", { ...payload, logicalRecommendations: [payload.logicalRecommendations[0]] }],
    ["chave desconhecida no lote", { ...payload, extra: true }],
  ];

  for (const [caso, invalido] of invalidos) {
    let chamadas = 0;
    const rejeicao = runPreProviderPipeline(overTheWire(invalido), () => { chamadas += 1; });

    assert.equal(chamadas, 0, `${caso} não pode consumir o provider`);
    assert.ok(rejeicao, caso);
    assert.ok(rejeicao!.status === 400 || rejeicao!.status === 409, `${caso} → ${rejeicao!.status}`);
  }
});

test("request válido atravessa os gates e alcança o provider", () => {
  const group = groupFixture("a", 6);
  const payload = strategicPayloadForArticle(group, [group, groupFixture("b", 4)]);
  let chamadas = 0;

  const rejeicao = runPreProviderPipeline(overTheWire(payload), () => { chamadas += 1; });

  assert.equal(rejeicao, null);
  assert.equal(chamadas, 1);
  // A rota mantém essa ordem no corpo do POST: parse → SERP → cobertura → provider.
  const handler = route.slice(route.indexOf("export async function POST"));
  assert.ok(handler.indexOf("parseStructureReviewRequest") < handler.indexOf("strategicSerpGate"));
  assert.ok(handler.indexOf("strategicSerpGate") < handler.indexOf("logicalCoverageGate"));
  assert.ok(handler.indexOf("logicalCoverageGate") < handler.indexOf("generateStructuredAI"));
});

test("rota e cliente compartilham o mesmo contrato, sem redeclarar schema", () => {
  assert.match(route, /from "@\/lib\/arquiteto\/ai-strategic-payload"/);
  assert.doesNotMatch(route, /SerpFormationAssessmentSchema/);
  assert.doesNotMatch(route, /const RequestSchema = z\.object/);
});
