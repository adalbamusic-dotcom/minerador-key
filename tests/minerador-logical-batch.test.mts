import assert from "node:assert/strict";
import test from "node:test";
import { deriveLogicalKeywordBatchItem } from "../lib/minerador/logical-batch.ts";

test("a Lógica compartilhada fecha o contrato determinístico sem provider", () => {
  const result = deriveLogicalKeywordBatchItem({
    id: "keyword-1",
    keyword: "marketing digital para dentistas",
    intent: null,
    analise_semantica: null,
  }, { id: "list-1", nicho: "odontologia" }, "2026-09-26T12:00:00.000Z");

  assert.ok(result.update.intent);
  assert.equal(result.update.analise_semantica.nicho, "odontologia");
  assert.ok(result.update.analise_semantica.logical_output_contract);
  assert.ok(result.update.analise_semantica.logicProcessorVersion);
  assert.equal(result.needsWrite, true);
});

test("decisões humanas já gravadas de intenção, nicho e funil são preservadas", () => {
  const result = deriveLogicalKeywordBatchItem({
    id: "keyword-2",
    keyword: "consultoria de marketing para clínica",
    intent: "Comercial",
    analise_semantica: {
      intencao_principal: "Comercial",
      intencao_origem: "human",
      nicho_override: "Clínicas odontológicas",
      nicho_origem: "human",
      funnel: "MOFU",
      funnel_source: "human",
      funnel_human_confirmed: true,
    },
  }, { id: "list-2", nicho: "Marketing genérico" }, "2026-09-26T12:00:00.000Z");

  assert.equal(result.update.intent, "Comercial");
  assert.equal(result.update.analise_semantica.nicho, "Clínicas odontológicas");
  assert.equal(result.update.analise_semantica.funnel, "MOFU");
  assert.equal(result.update.analise_semantica.funnel_source, "human");
});
