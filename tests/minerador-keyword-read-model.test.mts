import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyHumanReviewField } from "../lib/minerador/human-review.ts";
import { readCanonicalKeywordDna } from "../lib/minerador/logical-read-model.ts";

test("tabela, perfil e decisão compartilham intenção, nicho e funil canônicos", () => {
  const model = readCanonicalKeywordDna({
    intent: "Informativa",
    analise_semantica: {
      intencao_principal: "Informativa",
      nicho_override: "Estética",
      funnel: "TOFU",
      dataforseo_keyword_overview: { externalIntent: "transactional" },
    },
  });

  assert.equal(model.intent, "Informativa");
  assert.equal(model.intentLabel, "Informativa");
  assert.equal(model.niche, "Estética");
  assert.equal(model.funnel, "TOFU");
  assert.equal(model.externalIntent, "transactional");
  assert.equal(model.externalIntentLabel, "Transacional");
});

test("intenção externa permanece evidência independente e não substitui a intenção canônica", () => {
  const model = readCanonicalKeywordDna({
    intent: "Informativa",
    analise_semantica: {
      intencao_principal: "Informativa",
      dataforseo_keyword_overview: { externalIntent: "transactional" },
    },
  });

  assert.equal(model.intentLabel, "Informativa");
  assert.equal(model.externalIntentLabel, "Transacional");
});

test("decisão humana de intenção, nicho e funil vira a projeção atual sem apagar a proposta lógica", () => {
  const original = {
    intencao_principal: "Informativa",
    nicho: "Serviços",
    funnel: "TOFU",
  };
  const intent = applyHumanReviewField({
    semantic: original,
    intent: "Informativa",
    field: "intenção",
    logicalValue: "Informativa",
    aiSuggestion: "Comercial investigativa",
    decision: "accept_ai",
    actorId: "human-1",
    decidedAt: "2026-08-19T12:00:00.000Z",
  }).semantic;
  const niche = applyHumanReviewField({
    semantic: intent,
    intent: "Comercial investigativa",
    field: "nicho",
    logicalValue: "Serviços",
    aiSuggestion: "Estética",
    decision: "accept_ai",
    actorId: "human-1",
    decidedAt: "2026-08-19T12:00:01.000Z",
  }).semantic;
  const consolidated = applyHumanReviewField({
    semantic: niche,
    intent: "Comercial investigativa",
    field: "funil",
    logicalValue: "TOFU",
    aiSuggestion: "BOFU",
    decision: "accept_ai",
    actorId: "human-1",
    decidedAt: "2026-08-19T12:00:02.000Z",
  }).semantic;

  const model = readCanonicalKeywordDna({ intent: "Comercial investigativa", analise_semantica: consolidated });
  assert.equal(model.intentLabel, "Comercial investigativa");
  assert.equal(model.niche, "Estética");
  assert.equal(model.funnel, "BOFU");
  const readbackModel = readCanonicalKeywordDna({ intent: "Comercial investigativa", analise_semantica: JSON.parse(JSON.stringify(consolidated)) as Record<string, unknown> });
  assert.equal(readbackModel.intentLabel, "Comercial investigativa");
  assert.equal(readbackModel.niche, "Estética");
  assert.equal(readbackModel.funnel, "BOFU");
  assert.equal((consolidated.ai_review as unknown) ?? null, null);
  assert.equal((consolidated as Record<string, unknown>).intencao_principal, "Informativa");
});

test("a linha não oferece editor para intenção, nicho ou funil; somente silo/status continuam graváveis", async () => {
  const page = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /handleUpdateNiche/);
  assert.doesNotMatch(page, /<option value="">Não informado<\/option>/);
  assert.match(page, /handleUpdateKeywordList/);
  assert.match(page, /handleUpdateStatus/);
  const semanticReadOnlySlice = page.slice(page.indexOf("Nicho de mercado —"), page.indexOf("Silo\/Categoria (Lista Pertencente)"));
  assert.doesNotMatch(semanticReadOnlySlice, /<select|onChange=/);
});
