import assert from "node:assert/strict";
import test from "node:test";
import { applyFunnelQualification, classifyKeywordFunnel, extensionFunnelHints } from "../lib/minerador/keyword-qualification.ts";

test("qualificação de Funil usa intenção e sinais da keyword, não volume ou KGR", () => {
  const result = classifyKeywordFunnel({
    keyword: "como escolher uma clínica de estética",
    intent: "Comercial",
    niche: "Estética",
    semantic: { etapa_jornada: "Consideração", volume_search: 0, kgr_score: 0.01 },
  });
  assert.equal(result.proposed, "MOFU");
  assert.equal(result.conflict, false);
  assert.ok(result.evidence.length > 0);
});

test("hint da Extensão é preservado como evidência e conflito não vira aprovação", () => {
  const semantic = { extension_import: { funnelHints: ["TOFU"] } };
  const result = classifyKeywordFunnel({ keyword: "contratar clínica de estética", intent: "Vendas", semantic });
  assert.deepEqual(extensionFunnelHints(semantic), ["TOFU"]);
  assert.equal(result.proposed, "BOFU");
  assert.equal(result.conflict, true);
  assert.equal(applyFunnelQualification(semantic, result).funnel, "BOFU");
  assert.equal(applyFunnelQualification(semantic, result).funnel_review_required, "sim");
});

test("decisão humana de Funil não é sobrescrita", () => {
  const semantic = { funnel: "MOFU", funnel_source: "human", funnel_confidence: "0.9", extension_import: { funnelHints: ["TOFU"] } };
  const result = classifyKeywordFunnel({ keyword: "comprar serviço", intent: "Vendas", semantic });
  assert.equal(result.proposed, "MOFU");
  assert.equal(result.humanConfirmed, true);
  assert.deepEqual(applyFunnelQualification(semantic, result), semantic);
});

test("keyword sem qualificação continua sem Funil final", () => {
  const result = classifyKeywordFunnel({ keyword: "tema amplo", semantic: {} });
  assert.equal(result.proposed, "TOFU");
  assert.equal(Object.prototype.hasOwnProperty.call({}, "funnel"), false);
});
