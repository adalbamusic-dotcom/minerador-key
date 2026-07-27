import assert from "node:assert/strict";
import test from "node:test";
import { compareStrategyWithSerp, normalizeIntent, resolveRadarPublication } from "../lib/radar/editorial-identity.ts";

test("publicado mostra proteção e conserva a URL publicada", () => {
  const publication = resolveRadarPublication({ keywordPublished: true, operational: { state: "published", updateRequested: false, destinationUrl: "https://site.test/artigo", publishedAt: "2026-07-20T12:00:00.000Z" } as never });
  assert.equal(publication.published, true);
  assert.equal(publication.label, "Publicado e protegido");
  assert.equal(publication.destinationUrl, "https://site.test/artigo");
});

test("artigo novo não recebe selo de publicado", () => {
  const publication = resolveRadarPublication({ keywordPublished: false, operational: { state: "draft", updateRequested: false, destinationUrl: "https://site.test/rascunho", publishedAt: null } as never });
  assert.equal(publication.published, false);
  assert.equal(publication.label, "Ainda não publicado");
  assert.equal(publication.destinationUrl, null);
});

test("intenções informativo e informacional são normalizadas", () => {
  assert.equal(normalizeIntent("Informativo"), "Informativa");
  assert.equal(normalizeIntent("informacional"), "Informativa");
});

test("ausência no snippet não vira conflito definitivo", () => {
  const comparison = compareStrategyWithSerp({ expectedIntent: "informacional", observedIntent: "informativo", expectedTopics: ["fundamentos", "execução"], observedTopics: ["fundamentos"], hasOrganicEvidence: true });
  assert.equal(comparison.intent.status, "Alinhado");
  assert.equal(comparison.topics.status, "Parcialmente alinhado");
  assert.deepEqual(comparison.topics.missing, ["execução"]);
  assert.notEqual(comparison.overall, "Atenção");
});

test("sem SERP a comparação é evidência insuficiente", () => {
  const comparison = compareStrategyWithSerp({ expectedIntent: "informacional", observedIntent: null, expectedTopics: ["fundamentos"], observedTopics: [], hasOrganicEvidence: false });
  assert.equal(comparison.overall, "Evidência insuficiente");
});
