import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildArticleReviewBatches,
  compactKeywordForReview,
  materialKeywordArticleDecisions,
} from "../lib/arquiteto/keyword-article-review.ts";
import {
  AI_STRATEGIC_PAYLOAD_LIMIT,
  measureStrategicPayload,
  projectKeywordForStrategicReview,
  projectSerpAssessmentForStrategicReview,
  projectSiloForStrategicReview,
  projectStrategicSemantic,
  summarizeArticleAiExecutions,
  type ArticleAiExecutionOutcome,
} from "../lib/arquiteto/ai-strategic-payload.ts";
import type { ArchitectKeyword, KeywordArticleDecision, KeywordArticleReview, ProvisionalArticleGroup } from "../lib/arquiteto/contracts.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const workspaceRoute = readFileSync("app/api/arquiteto/workspace/route.ts", "utf8");

/** Keyword recebida do Minerador, com o peso técnico real do registro. */
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
    // Peso técnico que existe na UI lossless e não decide arquitetura.
    provider_payload: "x".repeat(4000),
    historico_mensal: Array.from({ length: 24 }, (_, month) => ({ month, volume: 700 + month })),
    provenance_hash: "b".repeat(64),
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

const decisionFixture = (overrides: Partial<KeywordArticleDecision> = {}): KeywordArticleDecision => ({
  keywordId: "a-kw-1",
  sourceGroupId: "a",
  action: "manter_no_artigo",
  targetGroupId: null,
  newArticleKey: null,
  siloPlacement: { action: "manter_silo", siloId: "silo-1", siloName: "Sérum facial", newSiloKey: null },
  suggestedRole: "principal",
  justification: "Cobertura já coerente com o artigo atual.",
  confidence: 0.9,
  humanDecisionPoints: [],
  ...overrides,
} as KeywordArticleDecision);

const reviewFixture = (decisions: KeywordArticleDecision[], conflicts: KeywordArticleReview["conflicts"] = []): KeywordArticleReview => ({
  decisions,
  conflicts,
  summary: "Revisão arquitetural.",
} as KeywordArticleReview);

/** Payload por Article, na mesma forma montada pelo handler da IA. */
const strategicPayloadFor = (group: ProvisionalArticleGroup) => ({
  focusGroups: buildArticleReviewBatches([group])[0],
  articleCatalog: [{ groupId: group.id, articleId: group.id, principalKeywordId: group.principalSuggestion.keywordId }],
  logicalRecommendations: [],
  brand: { id: "brand-1", name: "Principia" },
  serpAssessments: [projectSerpAssessmentForStrategicReview(serpAssessmentFixture(group))],
  silos: [projectSiloForStrategicReview(siloFixture())],
  publishedProtections: [],
});

const serpAssessmentFixture = (group: ProvisionalArticleGroup) => ({
  articleId: group.id,
  version: 2,
  assessmentMode: "formacao",
  intentCompatibility: "coerente",
  competitionLevel: "media",
  dominantResultTypes: ["blog"],
  recommendations: group.keywords.map(keyword => ({ id: `rec-${keyword.id}`, keywordId: keyword.id, action: "manter_no_artigo", reason: "coerente" })),
  conflicts: [],
  notes: [],
  // Evidência crua: existe para leitura humana, não para a decisão da IA.
  snapshots: group.keywords.map(keyword => ({
    id: `snap-${keyword.id}`,
    keywordId: keyword.id,
    query: keyword.keyword,
    organicResults: Array.from({ length: 20 }, (_, position) => ({
      position, title: "y".repeat(120), url: `https://exemplo.com/${position}`, snippet: "z".repeat(600),
    })),
    peopleAlsoAsk: Array.from({ length: 8 }, (_, index) => ({ question: "w".repeat(120), answer: "v".repeat(400), index })),
    relatedSearches: Array.from({ length: 8 }, (_, index) => ({ query: "u".repeat(60), index })),
    knowledgeGraph: { title: "t".repeat(200), description: "s".repeat(800) },
  })),
  keywordDnaReferences: group.keywords.map(keyword => ({ keywordId: keyword.id, versionId: "v1", contentHash: `sha256:${"a".repeat(64)}` })),
  formationEvidence: { raw: "r".repeat(5000) },
});

const siloFixture = () => ({
  siloId: "silo-1",
  name: "Sérum facial",
  centralEntity: "sérum facial",
  dominantIntent: "Informacional",
  boundary: "Cuidados com sérum",
  includedTopics: ["sérum"],
  excludedTopics: ["maquiagem"],
  pillarArticleId: "a",
  supportArticleIds: ["b"],
  articleReferences: Array.from({ length: 30 }, (_, index) => ({ articleId: `art-${index}`, versionId: "v1", contentHash: `sha256:${"c".repeat(64)}`, payload: "q".repeat(400) })),
  linkMap: Array.from({ length: 30 }, (_, index) => ({ fromArticleId: `art-${index}`, toArticleId: "a", reason: "p".repeat(200) })),
});

/** Orquestração sequencial equivalente à do handler: um Article por vez. */
async function runArticleBatches(
  groups: ProvisionalArticleGroup[],
  execute: (articleId: string) => Promise<KeywordArticleReview>,
) {
  const batches = buildArticleReviewBatches(groups);
  const outcomes: ArticleAiExecutionOutcome<KeywordArticleReview>[] = [];
  const requests: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  for (const batch of batches) {
    const articleId = batch[0].articleId;
    requests.push(articleId);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      outcomes.push({ articleId, status: "completed", result: await execute(articleId) });
    } catch (error) {
      outcomes.push({ articleId, status: "error", message: (error as Error).message });
    }
    inFlight -= 1;
  }
  return { batches, outcomes, requests, maxInFlight, summary: summarizeArticleAiExecutions(outcomes) };
}

test("5 Articles produzem 5 execuções independentes, não um request gigante", async () => {
  const groups = ["a", "b", "c", "d", "e"].map(id => groupFixture(id, 4));
  const result = await runArticleBatches(groups, async articleId => reviewFixture([decisionFixture({ keywordId: `${articleId}-kw-1`, sourceGroupId: articleId })]));

  assert.equal(result.batches.length, 5);
  assert.equal(result.requests.length, 5);
  assert.deepEqual(result.requests, ["a", "b", "c", "d", "e"]);
  // Cada request carrega um único Article.
  assert.ok(result.batches.every(batch => batch.length === 1));
});

test("a orquestração roda com concurrency = 1", async () => {
  const groups = ["a", "b", "c"].map(id => groupFixture(id, 3));
  const result = await runArticleBatches(groups, async articleId => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return reviewFixture([decisionFixture({ keywordId: `${articleId}-kw-1`, sourceGroupId: articleId })]);
  });

  assert.equal(result.maxInFlight, 1);
  assert.match(workspace, /for \(let index = 0; index < batches\.length; index \+= 1\) \{/);
  assert.doesNotMatch(workspace, /Promise\.all\(batches/);
});

test("Article de 1, 5 e 6 keywords continua sendo um request por Article", () => {
  for (const keywordCount of [1, 5, 6]) {
    const batches = buildArticleReviewBatches([groupFixture(`grupo-${keywordCount}`, keywordCount)]);

    assert.equal(batches.length, 1, `keywords=${keywordCount}`);
    assert.equal(batches[0].length, 1, `keywords=${keywordCount}`);
    // Nenhuma keyword do artigo é descartada ao montar o lote.
    assert.equal(batches[0][0].keywords.length, keywordCount);
  }
});

test("o payload por Article fica dentro do limite mesmo no artigo cheio", () => {
  const payload = strategicPayloadFor(groupFixture("a", 6));
  const measurement = measureStrategicPayload(payload);

  assert.equal(measurement.limit, AI_STRATEGIC_PAYLOAD_LIMIT);
  assert.equal(measurement.withinLimit, true);
  assert.ok(measurement.bytes < AI_STRATEGIC_PAYLOAD_LIMIT);
  assert.ok(measurement.topContributors.length > 0);
});

test("a projeção estratégica descarta o peso técnico sem perder o fato arquitetural", () => {
  const keyword = keywordFixture("a-kw-1", 1);
  const projected = projectKeywordForStrategicReview(keyword as ArchitectKeyword & Record<string, unknown>);
  const semantic = projectStrategicSemantic(keyword.analise_semantica);
  const candidate = compactKeywordForReview(keyword);
  const serialized = JSON.stringify(candidate);

  assert.equal(projected.keyword, "principia serum 1");
  assert.equal(projected.intent, "Informacional");
  assert.equal(projected.funnel, "Topo");
  assert.equal(projected.centralEntity, "sérum facial");
  assert.equal(projected.volume, 880);
  assert.equal(projected.results, 12);
  assert.equal(projected.kgrScore, 0.013);
  assert.equal(projected.kgrApplicability, "aplicavel");
  assert.equal(semantic.provider_payload, undefined);
  assert.equal(semantic.historico_mensal, undefined);
  assert.equal(semantic.provenance_hash, undefined);
  // O blob do provider deixou de viajar no payload.
  assert.equal(serialized.includes("x".repeat(200)), false);
  assert.ok(serialized.length < 2000);
});

test("a SERP entra como veredito e observações, não como snapshot cru", () => {
  const group = groupFixture("a", 4);
  const projected = projectSerpAssessmentForStrategicReview(serpAssessmentFixture(group) as unknown as Record<string, unknown>);
  const serialized = JSON.stringify(projected);

  assert.equal(projected?.intentCompatibility, "coerente");
  assert.equal(projected?.competitionLevel, "media");
  assert.equal(Array.isArray(projected?.recommendations), true);
  assert.equal(projected?.queriedKeywords.length, 4);
  assert.equal(serialized.includes("organicResults"), false);
  assert.equal(serialized.includes("peopleAlsoAsk"), false);
  assert.equal(serialized.includes("formationEvidence"), false);
});

test("o silo viaja como fronteira, não como grafo completo", () => {
  const projected = projectSiloForStrategicReview(siloFixture());
  const serialized = JSON.stringify(projected);

  assert.equal(projected?.siloId, "silo-1");
  assert.equal(projected?.boundary, "Cuidados com sérum");
  assert.equal(serialized.includes("articleReferences"), false);
  assert.equal(serialized.includes("linkMap"), false);
});

test("erro em um Article não cancela os demais", async () => {
  const groups = ["a", "b", "c", "d", "e"].map(id => groupFixture(id, 3));
  const result = await runArticleBatches(groups, async articleId => {
    if (articleId === "c") throw new Error("Contexto estratégico excede o limite permitido.");
    return reviewFixture([decisionFixture({ keywordId: `${articleId}-kw-1`, sourceGroupId: articleId })]);
  });

  assert.equal(result.summary.requestedArticles, 5);
  assert.equal(result.summary.completedArticles, 4);
  assert.equal(result.summary.failedArticles, 1);
  assert.deepEqual(result.outcomes.filter(outcome => outcome.status === "completed").map(outcome => outcome.articleId), ["a", "b", "d", "e"]);
  const failed = result.outcomes.find(outcome => outcome.articleId === "c");
  assert.equal(failed?.status, "error");
  assert.match(failed?.status === "error" ? failed.message : "", /excede o limite/);
});

test("o guard de tamanho falha só o Article que excede, com motivo específico", () => {
  const oversized = measureStrategicPayload({ focusGroups: "k".repeat(AI_STRATEGIC_PAYLOAD_LIMIT + 10), brand: "principia" });

  assert.equal(oversized.withinLimit, false);
  assert.equal(oversized.topContributors[0].key, "focusGroups");
  // O handler transforma isso em falha daquele artigo e segue para o próximo.
  assert.match(workspace, /if \(!measurement\.withinLimit\) \{/);
  assert.match(workspace, /Contexto estratégico de \$\{measurement\.bytes\} caracteres excede o limite/);
  assert.match(workspace, /executionStates\.push\(\{ articleId: batchArticleId, state: "ERROR" \}\);\r?\n\s*continue;/);
});

test("no-op não vira proposta: zero material em Workbench e no Article", () => {
  const review = reviewFixture([decisionFixture()]);
  const material = materialKeywordArticleDecisions(review, () => "principal");

  assert.equal(review.decisions.length, 1);
  assert.equal(material.length, 0);
});

test("Workbench e Article contam a mesma proposta material", () => {
  const review = reviewFixture([
    decisionFixture(),
    decisionFixture({ keywordId: "a-kw-2", action: "mover_para_artigo", targetGroupId: "b", suggestedRole: "secundaria" }),
  ]);
  const roles = new Map([["a-kw-1", "principal" as const], ["a-kw-2", "secundaria" as const]]);
  const material = materialKeywordArticleDecisions(review, keywordId => roles.get(keywordId));

  assert.equal(material.length, 1);
  assert.equal(material[0].keywordId, "a-kw-2");
  // A bancada e o banner leem o mesmo classificador que a aba do Article.
  assert.match(workspace, /\$\{materialKeywordArticleDecisions\(pendingKeywordReview\.review, keywordId => masterList\.find/);
  assert.doesNotMatch(workspace, /\$\{pendingKeywordReview\.review\.decisions\.length\} proposta\(s\) gerada\(s\)/);
});

test("a proposta material aparece no Article de origem e não cruza artigos", async () => {
  const groups = ["a", "b"].map(id => groupFixture(id, 3));
  const result = await runArticleBatches(groups, async articleId => reviewFixture([
    decisionFixture({ keywordId: `${articleId}-kw-1`, sourceGroupId: articleId }),
    decisionFixture({ keywordId: `${articleId}-kw-2`, sourceGroupId: articleId, action: "criar_novo_artigo", newArticleKey: `${articleId}-novo`, suggestedRole: "principal" }),
  ]));

  for (const outcome of result.outcomes) {
    assert.equal(outcome.status, "completed");
    if (outcome.status !== "completed") continue;
    // Toda decisão devolvida pertence ao Article que originou o request.
    assert.ok(outcome.result.decisions.every(decision => decision.sourceGroupId === outcome.articleId));
    assert.ok(outcome.result.decisions.every(decision => decision.keywordId.startsWith(`${outcome.articleId}-kw-`)));
  }
  const crossArticle = result.outcomes.flatMap(outcome => outcome.status === "completed" ? outcome.result.decisions : [])
    .filter(decision => !decision.keywordId.startsWith(`${decision.sourceGroupId}-kw-`));
  assert.equal(crossArticle.length, 0);
});

test("o estado por Article distingue no-op, proposta e erro", () => {
  assert.match(workspace, /state: material\.length \? "COMPLETED_WITH_PROPOSALS" : "COMPLETED_NO_PROPOSALS"/);
  assert.match(workspace, /executionStates\.push\(\{ articleId: batchArticleId, state: "ERROR" \}\);/);
  assert.match(workspace, /data-testid="architect-ai-article-states"/);
  assert.match(workspace, /sem alteração estrutural/);
  // O fechamento do lote conta pelos estados por Article, não por batchCount menos falhas.
  assert.match(workspace, /summarizeArticleAiExecutionStates\(result\.aiExecutionStates \|\| \[\]\)/);
  assert.doesNotMatch(workspace, /result\.batchCount - failedArticles/);
});

test("sem storage canônico da revisão, o lote não inventa fallback local", () => {
  // A cópia de trabalho canônica é estrita e não aceita anotação de IA.
  assert.match(workspaceRoute, /const AssignmentSchema = z\.object\(\{/);
  assert.match(workspaceRoute, /\}\)\.strict\(\);/);
  assert.doesNotMatch(workspaceRoute, /aiReviewAnnotation/);
  // Nenhuma persistência local foi criada como fonte da revisão.
  assert.doesNotMatch(workspace, /localStorage\.setItem\([^)]*keyword_?[Rr]eview/);
  assert.doesNotMatch(workspace, /localStorage\.setItem\([^)]*aiReview/);
  // O estado da IA continua vivendo apenas na sessão, sem fingir durabilidade.
  assert.match(workspace, /const \[pendingKeywordReview, setPendingKeywordReview\] = useState<PendingKeywordReview \| null>\(null\);/);
});

test("o pedido estrutural de persistência da revisão está registrado", () => {
  const request = readFileSync("docs/04-arquiteto/propostas/2026-08-29-pedido-estrutural-persistencia-revisao-ia.md", "utf8");

  assert.match(request, /STRUCTURAL_AI_REVIEW_PERSISTENCE_REQUIRED = YES/);
  // O pedido descreve o que precisa sobreviver ao F5, incluindo o NO-OP.
  const normalized = request.toLowerCase();
  for (const requirement of ["execução", "articleid", "contenthash", "no_op", "proveniência", "decisão humana"]) {
    assert.ok(normalized.includes(requirement), `requisito ausente: ${requirement}`);
  }
});
