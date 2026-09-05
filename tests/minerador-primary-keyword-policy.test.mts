import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ArchitectKeywordSchema } from "../lib/arquiteto/contracts.ts";
import { adaptKeywordIdentityContext } from "../lib/arquiteto/identity-context.ts";
import { primaryKeywordPolicyLabel, readPrimaryKeywordPolicy, setPrimaryKeywordPolicy } from "../lib/minerador/primary-keyword-policy.ts";

const page = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const dnaPanel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

test("não publicado permanece com principal livre e publicado legado permanece travado", () => {
  assert.equal(readPrimaryKeywordPolicy({ status: "bruto", semantic: {} }), "free");
  assert.equal(readPrimaryKeywordPolicy({ status: "publicado", semantic: {} }), "locked");
  assert.equal(primaryKeywordPolicyLabel("free"), "Keyword livre");
  assert.equal(primaryKeywordPolicyLabel("reviewable"), "Principal revisável");
});

test("SEO para Clínicas pode tornar-se revisável sem trocar identidade ou métricas", () => {
  const source = { volume_search: 10, results_allintitle: null, kgr_score: null, url: "/servicos/seo-para-clinicas", slug: "seo-para-clinicas", canonical: "https://example.com/servicos/seo-para-clinicas" };
  const semantic = setPrimaryKeywordPolicy({}, { status: "publicado", keyword: "SEO para Clínicas", policy: "reviewable", actorId: "user@example.com", changedAt: "2026-07-22T12:00:00.000Z", reason: "volume anterior incorreto; revisar principal pela SERP" });
  assert.equal(semantic.primary_keyword_policy, "reviewable");
  assert.equal(semantic.primary_keyword_published_original, "SEO para Clínicas");
  assert.equal(semantic.primary_keyword_current, "SEO para Clínicas");
  assert.equal(semantic.primary_keyword_review_required, true);
  assert.equal(source.url, "/servicos/seo-para-clinicas");
  assert.equal(source.slug, "seo-para-clinicas");
  assert.equal(source.canonical, "https://example.com/servicos/seo-para-clinicas");
  assert.equal(source.volume_search, 10);
  assert.equal(source.results_allintitle, null);
});

test("decisões humanas mantêm histórico, ator e versão sem criar versão sem mudança", () => {
  const reviewable = setPrimaryKeywordPolicy({}, { status: "publicado", keyword: "SEO para Clínicas", policy: "reviewable", actorId: "ana", changedAt: "2026-07-22T12:00:00.000Z" });
  const locked = setPrimaryKeywordPolicy(reviewable, { status: "publicado", keyword: "SEO para Clínicas", policy: "locked", actorId: "bia", changedAt: "2026-07-22T13:00:00.000Z" });
  assert.equal(locked.primary_keyword_policy, "locked");
  assert.equal(locked.primary_keyword_policy_actor, "bia");
  assert.equal(locked.primary_keyword_policy_version, 2);
  assert.deepEqual(JSON.parse(String(locked.primary_keyword_policy_history)), [{ previous: "locked", next: "reviewable", actorId: "ana", changedAt: "2026-07-22T12:00:00.000Z" }, { previous: "reviewable", next: "locked", actorId: "bia", changedAt: "2026-07-22T13:00:00.000Z" }]);
  assert.equal(setPrimaryKeywordPolicy(locked, { status: "publicado", keyword: "SEO para Clínicas", policy: "locked", actorId: "bia", changedAt: "2026-07-22T14:00:00.000Z" }), locked);
});

test("publicação formal separada do status editorial mantém a política da principal", () => {
  const semantic = setPrimaryKeywordPolicy({}, { status: "aprovado", publicationConfirmed: true, keyword: "SEO para Clínicas", policy: "reviewable", actorId: "ana", changedAt: "2026-08-20T12:00:00.000Z" });
  assert.equal(semantic.primary_keyword_policy, "reviewable");
  assert.equal(semantic.primary_keyword_current, "SEO para Clínicas");
});

test("contrato aditivo do Arquiteto reconhece política e contexto sem escolher principal", () => {
  const semantic = { primary_keyword_policy: "reviewable", primary_keyword_published_original: "SEO para Clínicas", primary_keyword_current: "SEO para Clínicas", primary_keyword_policy_actor: "user@example.com", primary_keyword_policy_at: "2026-07-22T12:00:00.000Z", primary_keyword_policy_version: 1, primary_keyword_review_required: true };
  const context = adaptKeywordIdentityContext({ status: "publicado", keyword: "SEO para Clínicas", analise_semantica: semantic });
  assert.equal(context.primaryKeywordPolicy, "reviewable");
  assert.equal(context.primaryKeywordPolicyContext?.currentKeyword, "SEO para Clínicas");
  assert.equal(ArchitectKeywordSchema.safeParse({ id: "kw-1", keyword: "SEO para Clínicas", intent: "informational", analise_semantica: semantic, ...context }).success, true);
});

test("interface persiste somente metadado após confirmação e não troca a keyword", () => {
  const handler = page.slice(page.indexOf("const handlePrimaryKeywordPolicyChange"), page.indexOf("const handleBatchMarkKgrNotApplicable"));
  assert.match(handler, /window\.confirm/);
  assert.match(handler, /update\(\{ analise_semantica: semantic \}\)/);
  assert.doesNotMatch(handler, /\.update\(\{[^}]*\bkeyword:/);
  assert.match(dnaPanel, /CONTEXTO PUBLICADO/);
  assert.match(dnaPanel, /onPrimaryPolicyChange/);
  assert.match(dnaPanel, /readPublicationLink/);
  assert.match(dnaPanel, /legacyPublishedStatus/);
  assert.match(page, /primaryKeywordPolicyLabel\(primaryKeywordPolicy\)/);
  assert.match(dnaPanel, /value="reviewable">Revisável/);
});
