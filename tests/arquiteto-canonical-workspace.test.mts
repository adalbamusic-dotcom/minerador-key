import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalArticleWorkspaceItems } from "../lib/arquiteto/canonical-bootstrap.ts";
import { buildCanonicalWorkflowWorkspaceItems, type CanonicalWorkflowItem } from "../lib/arquiteto/canonical-workspace.ts";
import { applyManualKeywordRole, manualKeywordRoleFor } from "../lib/arquiteto/manual-architecture.ts";
import { compactKeywordForReview } from "../lib/arquiteto/keyword-article-review.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { describeProvisionalGroup } from "../lib/arquiteto/engine.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArchitectKeyword } from "../lib/arquiteto/contracts.ts";

const brandId = "550e8400-e29b-41d4-a716-446655440001";
const keywordId = "550e8400-e29b-41d4-a716-446655440002";

function workflow(payload: Record<string, unknown>, sourceVersionId: string | null = null, sourceContentHash: string | null = null): CanonicalWorkflowItem {
  return {
    id: "550e8400-e29b-41d4-a716-446655440003",
    marcaId: brandId,
    subjectType: "keyword",
    subjectId: keywordId,
    articleId: null,
    stage: "architect",
    state: "received",
    sourceEntityId: keywordId,
    sourceVersionId,
    sourceContentHash,
    payload,
    lockVersion: 1,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

test("cópia de trabalho canônica preserva desanexação explícita do silo original", () => {
  const [item] = buildCanonicalWorkflowWorkspaceItems(
    [workflow({ siloId: null, silo_id: null, siloName: null, clusterId: "manual-1" })],
    [{ id: keywordId, brand_id: brandId, keyword: "keyword de teste", lista_id: "silo-original", status: "aprovado" }],
    brandId,
  );

  assert.equal(item.siloId, null);
  assert.equal(item.silo_id, null);
  assert.equal(item.siloName, null);
  assert.equal(item.clusterId, "manual-1");
  assert.equal(item.workingArticleId, `workflow:${workflow({}).id}`);
});

test("handoff novo não converte lista_id do Minerador em atribuição de Silo", () => {
  const [item] = buildCanonicalWorkflowWorkspaceItems(
    [workflow({})],
    [{ id: keywordId, brand_id: brandId, keyword: "keyword nova", lista_id: "lista-de-origem", status: "aprovado" }],
    brandId,
  );

  assert.equal(item.siloId, null);
  assert.equal(item.silo_id, null);
  assert.equal(item.siloName, null);
  assert.equal((item as Record<string, unknown>).lista_id, "lista-de-origem");
});

test("workingArticleId persistido vence clusterId e permanece após mudança de keyword", () => {
  const [item] = buildCanonicalWorkflowWorkspaceItems(
    [workflow({ workingArticleId: "working-article-1", clusterId: "cluster-mutavel" })],
    [{ id: keywordId, brand_id: brandId, keyword: "keyword nova", lista_id: null, status: "aprovado" }],
    brandId,
  );

  assert.equal(item.workingArticleId, "working-article-1");
  assert.notEqual(item.workingArticleId, item.clusterId);
});

test("troca manual de principal demove a principal anterior e preserva outros clusters", () => {
  const items = [
    { id: "a", clusterId: "article-1", reviewRole: "principal" as const, keyword: "principal atual" },
    { id: "b", clusterId: "article-1", reviewRole: "secundaria" as const, keyword: "candidata" },
    { id: "c", clusterId: "article-2", reviewRole: "principal" as const, keyword: "outro artigo" },
  ];

  const next = applyManualKeywordRole(items, { clusterId: "article-1", keywordId: "b", role: "principal" });

  assert.deepEqual(next.map(item => [item.id, item.reviewRole]), [
    ["a", "secundaria"],
    ["b", "principal"],
    ["c", "principal"],
  ]);
  assert.equal(manualKeywordRoleFor(next[0]), "secundaria");
  assert.equal(manualKeywordRoleFor(next[1]), "principal");
});

test("papel de reforço é uma decisão manual distinta da hierarquia do artigo", () => {
  const next = applyManualKeywordRole(
    [{ id: "a", clusterId: "article-1", reviewRole: "secundaria" as const }],
    { clusterId: "article-1", keywordId: "a", role: "reforco_narrativo" },
  );

  assert.equal(next[0].reviewRole, "reforco_narrativo");
  assert.equal(manualKeywordRoleFor(next[0]), "reforco_narrativo");
});

test("revisão IA recebe projeção estratégica do KeywordDNA, sem blob técnico", () => {
  const keyword = {
    id: keywordId,
    keyword: "marketing para clínicas",
    intent: "Informativo",
    volume_search: null,
    results_allintitle: null,
    kgr_score: null,
    lista_id: null,
    silo_id: null,
    siloName: null,
    status: "aprovado",
    analise_semantica: { entidade_central: "captação", dna_origem: "minerador" },
    demandEvidence: { googleAds: { averageMonthlySearches: null, metricStatus: "not_measured" } },
  } as unknown as ArchitectKeyword;

  const candidate = compactKeywordForReview(keyword);

  const snapshot = candidate.keywordDnaSnapshot as Record<string, unknown>;

  // O fato arquitetural continua íntegro na projeção.
  assert.equal(snapshot.keywordId, keywordId);
  assert.equal(snapshot.keyword, "marketing para clínicas");
  assert.equal(snapshot.intent, "Informativo");
  assert.equal(snapshot.centralEntity, "captação");
  assert.equal(snapshot.upstreamStatus, "aprovado");
  // Dimensão indeterminada permanece nula; nunca vira zero.
  assert.equal(snapshot.volume, null);
  assert.equal(snapshot.results, null);
  assert.equal(snapshot.kgrScore, null);
  assert.equal(snapshot.averageMonthlySearches, null);
  // Proveniência e blobs técnicos ficam na UI lossless, fora do payload.
  assert.equal((snapshot.analise_semantica as Record<string, unknown>).dna_origem, undefined);
  assert.equal(snapshot.demandEvidence, undefined);
});

test("proveniência completa atravessa bootstrap, working copy, ArticleDNA e readback local", async () => {
  const contentHash = `sha256:${"a".repeat(64)}`;
  const sourceVersionId = "keyword-dna:kw-rich:v7";
  const sourceKeyword = {
    id: keywordId,
    brand_id: brandId,
    keyword: "tratamento facial para acne",
    keyword_original: "Tratamento facial para acne",
    keyword_normalized: "tratamento facial acne",
    intent: "Informativo",
    volume_search: null,
    results_allintitle: 0,
    kgr_score: 0,
    content_hash: contentHash,
    status: "publicado",
    isPublished: true,
    publishedUrl: "https://example.com/tratamento-facial-acne",
    slug_sugerido: "tratamento-facial-acne",
    canonical: "https://example.com/tratamento-facial-acne",
    primaryKeywordPolicy: "locked",
    provider: "dataforseo",
    measurementRef: "measurement-kw-rich",
    analise_semantica: {
      intencao_principal: "informacional",
      entidade_central: "tratamento facial",
      modificadores: ["para acne"],
      nicho_override: "estética",
      funnel: "TOFU",
      dna_origem: "human",
      dna_revisao_humana: "aprovado",
      dna_confianca: 0.91,
      human_review: { status: "completed", decision: "approved", actorId: "human-1" },
      trend: "crescente",
      seasonality: { type: "seasonal" },
      peakMonths: [5, 6],
      allintitle_measurement: { measuredAt: "2026-08-20T10:00:00.000Z", provider: "dataforseo", measurementRef: "measurement-kw-rich" },
      allintitle_measurement_history: [{ measuredAt: "2026-07-20T10:00:00.000Z", results: 0 }],
    },
  };

  const [workingItem] = buildCanonicalWorkflowWorkspaceItems(
    [workflow({ role: "principal" }, sourceVersionId, contentHash)],
    [sourceKeyword],
    brandId,
  );
  assert.ok(workingItem);
  const snapshot = workingItem.keywordDnaSnapshot as { brandId: string; keywordId: string; capturedAt: string; versionReference: { versionId: string; contentHash: string }; sourceKeywordSnapshot: Record<string, unknown> };
  assert.equal(snapshot.brandId, brandId);
  assert.equal(snapshot.keywordId, keywordId);
  assert.equal(snapshot.capturedAt, "2026-08-24T00:00:00.000Z");
  assert.deepEqual(snapshot.versionReference, { entityId: keywordId, versionId: sourceVersionId, contentHash });
  assert.equal(snapshot.sourceKeywordSnapshot.keyword_original, sourceKeyword.keyword_original);
  assert.equal(snapshot.sourceKeywordSnapshot.keyword_normalized, sourceKeyword.keyword_normalized);
  assert.equal(snapshot.sourceKeywordSnapshot.volume_search, null);
  assert.equal(snapshot.sourceKeywordSnapshot.results_allintitle, 0);
  assert.equal(snapshot.sourceKeywordSnapshot.kgr_score, 0);
  assert.equal((snapshot.sourceKeywordSnapshot.analise_semantica as Record<string, unknown>).dna_revisao_humana, "aprovado");
  assert.equal(snapshot.sourceKeywordSnapshot.provider, "dataforseo");
  assert.equal(snapshot.sourceKeywordSnapshot.measurementRef, "measurement-kw-rich");

  const group = describeProvisionalGroup([workingItem as unknown as ArchitectKeyword], "article-rich");
  const article = deterministicArticleDnaPayload(group, brandId);
  const reference = article.keywordReferences[0]!;
  assert.equal(reference.keywordDnaVersionId, sourceVersionId);
  assert.equal(reference.keywordDnaContentHash, contentHash);
  assert.equal(reference.volume, null);
  assert.equal(reference.resultCount, 0);
  assert.equal(reference.kgrScore, 0);
  assert.deepEqual(reference.keywordDnaSnapshot, snapshot);
  assert.equal(article.publishedIdentityRef?.slug, sourceKeyword.slug_sugerido);
  assert.equal(article.publishedIdentityRef?.canonical, sourceKeyword.canonical);

  const version = await createVersionEnvelope({ entityId: article.articleId, versionNumber: 1, origin: "system", changeReason: "proveniência", createdBy: "human-1", payload: article });
  const readback = buildCanonicalArticleWorkspaceItems([version], brandId);
  assert.equal(readback.contractGaps.length, 0);
  assert.deepEqual(readback.items[0]?.keywordDnaSnapshot, snapshot);
  assert.deepEqual(readback.items[0]?.keywordDnaRef, snapshot.versionReference);
  assert.deepEqual(buildCanonicalWorkflowWorkspaceItems([workflow({}, sourceVersionId, contentHash)], [sourceKeyword], "550e8400-e29b-41d4-a716-446655440099"), []);
});
