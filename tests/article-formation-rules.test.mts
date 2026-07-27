import assert from "node:assert/strict";
import test from "node:test";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { inspectArticleFormation } from "../lib/arquiteto/article-formation-rules.ts";

const keyword = (id: string, value: string, intent = "Informativo") => ({
  id, keyword: value, intent, volume_search: 100, kgr_score: null, lista_id: "silo-1", siloName: "Silo", status: "aprovado",
  analise_semantica: { entidade_central: "tema", publico: "leitor", problema_percebido: "duvida" },
});

test("ArticleDNA registra estrategia de principal, apoios e cobertura de volume", () => {
  const group = buildProvisionalGroups([keyword("principal", "seo para clinicas"), keyword("support", "seo para clinicas estetica")])[0]!;
  const payload = deterministicArticleDnaPayload(group, "brand-1");
  assert.equal(payload.keywordStrategy?.principalKeywordDnaId, "principal");
  assert.deepEqual(payload.keywordStrategy?.secondaryKeywordDnaIds, ["support"]);
  assert.equal(payload.keywordStrategy?.volumeCoverage, "complete");
  assert.equal(payload.keywordStrategy?.principalKgrStatus, "unknown");
});

test("gate bloqueia sete referencias e intenção severamente incompatível", () => {
  const base = buildProvisionalGroups([keyword("principal", "comprar clinica")])[0]!;
  const supports = Array.from({ length: 6 }, (_, index) => keyword(`support-${index}`, `tema da clinica ${index}`));
  const overflow = { ...base, keywords: [base.keywords[0]!, ...supports], keywordIds: [base.principalSuggestion.keywordId, ...supports.map(item => item.id)], roles: Object.fromEntries([base.principalSuggestion.keywordId, ...supports.map(item => item.id)].map(id => [id, id === base.principalSuggestion.keywordId ? "principal" : "secundaria"])) as typeof base.roles };
  assert.ok(inspectArticleFormation(overflow).some(issue => issue.code === "too_many_keywords"));

  const incompatible = { ...base, keywords: [keyword("principal", "comprar clinica", "Transacional"), keyword("support", "como cuidar da clinica", "Informativo")], keywordIds: ["principal", "support"], roles: { principal: "principal", support: "secundaria" } as typeof base.roles, principalSuggestion: { ...base.principalSuggestion, keywordId: "principal" } };
  assert.ok(inspectArticleFormation(incompatible).some(issue => issue.code === "incompatible_intent"));
});
