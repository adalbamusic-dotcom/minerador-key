/**
 * F5 · D6 (decisão do dono, SDD 2026-10-12 §17): a keyword LIBERADA por
 * "Retirar artigo do Silo" (artigo rejeitado) fica presa em "Keywords não
 * agrupadas" do grupo dela — a formação automática não a reagrupa sozinha;
 * só a decisão humana (formação humana posterior à rejeição) a põe num
 * artigo. A marca é de LEITURA (projeção da mesa); nada é gravado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { releaseRejectedArticles, rejectedArticleReleaseHold, REJECTED_ARTICLE_RELEASE_KEY } from "../lib/arquiteto/rejected-article-release.ts";
import { planSiloArticleFormation } from "../lib/arquiteto/article-formation-priority.ts";
import type { ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";

const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";

async function artigoRejeitado() {
  const payload = deterministicArticleDnaPayload(buildProvisionalGroups([{
    id: "pvc", keyword: "plano vivo controle", intent: "Transacional", volume_search: 49500, results_allintitle: null, kgr_score: null, lista_id: null,
    siloName: null, status: "aprovado", analise_semantica: { entidade_central: "plano movel", publico: "clientes", problema_percebido: "plano de celular" },
  }])[0], MARCA);
  return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: ATOR, payload });
}

test("F5-D6-1 · a keyword liberada pelo artigo rejeitado ganha a marca de leitura e o motivo para ficar em não agrupadas", async () => {
  const versao = await artigoRejeitado();
  const leitura = releaseRejectedArticles({
    articleDnas: [versao],
    statuses: [{ versionId: versao.versionId, status: "approved" }],
    events: [{ versionId: versao.versionId, status: "rejected", occurredAt: "2026-10-12T21:00:00+00:00", reason: "fora do plano declarado" }],
    workflowItems: [{ subjectType: "keyword", subjectId: "pvc", payload: { clusterId: versao.payload.articleId, articleFormationRef: "formation:solto", articleFormationDecision: { role: "principal", source: "human", decidedAt: "2026-10-12T18:00:00+00:00" } } }],
  });
  const item = leitura.workflowItems[0];
  assert.equal(item.payload.articleFormationRef, null);
  assert.deepEqual((item.payload as Record<string, unknown>)[REJECTED_ARTICLE_RELEASE_KEY], { articleId: versao.payload.articleId, versionId: versao.versionId, rejectedAt: "2026-10-12T21:00:00+00:00", reason: "fora do plano declarado" });
  const motivo = rejectedArticleReleaseHold(item.payload);
  assert.match(motivo ?? "", /^liberada do artigo retirado do Silo em 12\/10 \(“fora do plano declarado”\): fica em “Keywords não agrupadas” do grupo dela até decisão humana — a formação automática não a reagrupa \(D6\)$/);
});

test("F5-D6-2 · decisão humana posterior à rejeição tira a marca (a keyword já está num artigo por decisão humana)", async () => {
  const versao = await artigoRejeitado();
  const leitura = releaseRejectedArticles({
    articleDnas: [versao],
    statuses: [{ versionId: versao.versionId, status: "approved" }],
    events: [{ versionId: versao.versionId, status: "rejected", occurredAt: "2026-10-12T21:00:00+00:00", reason: "fora do plano declarado" }],
    workflowItems: [{ subjectType: "keyword", subjectId: "pvc", payload: { articleFormationRef: "formation:humana-depois", articleFormationDecision: { role: "secundaria", source: "human", decidedAt: "2026-10-12T22:00:00+00:00" } } }],
  });
  assert.equal((leitura.workflowItems[0].payload as Record<string, unknown>)[REJECTED_ARTICLE_RELEASE_KEY], undefined);
  assert.equal(rejectedArticleReleaseHold(leitura.workflowItems[0].payload), null);
  assert.equal(rejectedArticleReleaseHold({ [REJECTED_ARTICLE_RELEASE_KEY]: { reason: "x" }, articleFormationRef: "formation:nova" }), null, "formação nova = decisão humana; a marca não vale");
  assert.equal(rejectedArticleReleaseHold(null), null);
});

const kw = (keywordId: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId, keyword, intent: "transacional", volume: 1000, kgr: null, entity: "plano movel", problem: "plano de celular", isPublished: false, ...overrides,
});

test("F5-D6-3 · a formação automática não reagrupa a liberada; com decisão humana ela entra", () => {
  const motivo = "liberada do artigo retirado do Silo em 12/10 (“fora do plano declarado”): fica em “Keywords não agrupadas” do grupo dela até decisão humana — a formação automática não a reagrupa (D6)";
  const keywords = [
    kw("pvc", "plano vivo controle", { volume: 49500, releasedHold: motivo }),
    kw("pvc2", "plano vivo controle preço", { volume: 2400 }),
    kw("pvc3", "vivo controle plano", { volume: 1900 }),
  ];
  const plano = planSiloArticleFormation({ siloRef: "territory:wifi", siloLabel: "Planos", siloSlug: "/planos", siloTokens: new Set<string>(), keywords, batchObjective: "new" });
  const emArtigo = new Set(plano.universe.candidates.flatMap(candidate => candidate.keywords.map(item => item.keywordId)));
  assert.equal(emArtigo.has("pvc"), false, "a liberada não vira artigo nem membro sozinha");
  assert.ok(plano.universe.ungroupedKeywordIds.includes("pvc"), "fica em não agrupadas");
  assert.equal(plano.universe.deferredKeywords?.find(item => item.keywordId === "pvc")?.reason, motivo);
  // Sem a marca, a mesma formação a usaria (o teste não é vazio).
  const semMarca = planSiloArticleFormation({ siloRef: "territory:wifi", siloLabel: "Planos", siloSlug: "/planos", siloTokens: new Set<string>(), keywords: keywords.map(item => ({ ...item, releasedHold: null })), batchObjective: "new" });
  assert.ok(semMarca.universe.candidates.some(candidate => candidate.keywords.some(item => item.keywordId === "pvc")));
  // Decisão humana: entra no artigo que o humano formou.
  const humana = planSiloArticleFormation({ siloRef: "territory:wifi", siloLabel: "Planos", siloSlug: "/planos", siloTokens: new Set<string>(), keywords: keywords.map(item => item.keywordId === "pvc" ? { ...item, humanFormationRef: "formation:humana", humanRole: "principal" as const } : item), batchObjective: "new" });
  assert.ok(humana.universe.candidates.some(candidate => candidate.keywords.some(item => item.keywordId === "pvc")));
});
