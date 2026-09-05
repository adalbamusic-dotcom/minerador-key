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

test("keyword semanticamente incompreensível resolve Funil como desconhecido explícito", () => {
  const result = classifyKeywordFunnel({ keyword: "tema amplo", semantic: {} });
  assert.equal(result.proposed, null);
  assert.equal(result.resolution, "explicit_unknown");
  assert.equal(result.determinable, true);
  assert.equal(Object.prototype.hasOwnProperty.call({}, "funnel"), false);
  assert.equal(applyFunnelQualification({}, result).funnel, undefined);
  assert.equal(applyFunnelQualification({}, result).funnel_review_required, "não");
});

test("termo incompreensível não recebe TOFU por fallback, mas relação específica recebe Funil canônico", () => {
  const generic = classifyKeywordFunnel({ keyword: "fragmento zzqv 8842", intent: "Pendente", semantic: { intencao_ambigua: "sim" } });
  const specific = classifyKeywordFunnel({ keyword: "portaria remota para condomínio pequeno", intent: "Comercial", semantic: { etapa_jornada: "Consideração", potencial_comercial: "medium", publico: "Responsável por condomínio pequeno" } });

  assert.equal(generic.resolution, "explicit_unknown");
  assert.equal(generic.determinable, true);
  assert.equal(applyFunnelQualification({ intencao_ambigua: "sim" }, generic).funnel, undefined);
  assert.equal(specific.proposed, "MOFU");
  assert.equal(specific.determinable, true);
  assert.equal(applyFunnelQualification({}, specific).funnel, "MOFU");
});

test("keywords amplas ou ambíguas recebem TOFU quando o termo é reconhecível", () => {
  const result = classifyKeywordFunnel({
    keyword: "unhas em acrilico",
    intent: "Pendente",
    niche: "Estética",
    semantic: { intencao_ambigua: "sim", entidade_central: "unhas", modificadores: "em acrilico" },
  });

  assert.equal(result.proposed, "TOFU");
  assert.equal(result.resolution, "value");
  assert.equal(result.determinable, true);
  assert.equal(applyFunnelQualification({}, result).funnel, "TOFU");
});

test("comparação e ação resolvem MOFU e BOFU mesmo quando a intenção é ambígua", () => {
  const comparison = classifyKeywordFunnel({ keyword: "gel ou acrilico qual é melhor", intent: "Comercial", semantic: { intencao_ambigua: "sim" } });
  const price = classifyKeywordFunnel({ keyword: "unhas de gel preço", intent: "Pendente", semantic: { intencao_ambigua: "sim" } });
  const local = classifyKeywordFunnel({ keyword: "manicure perto de mim", intent: "Pendente", semantic: { intencao_ambigua: "sim" } });

  assert.equal(comparison.proposed, "MOFU");
  assert.equal(price.proposed, "BOFU");
  assert.equal(local.proposed, "BOFU");
});
