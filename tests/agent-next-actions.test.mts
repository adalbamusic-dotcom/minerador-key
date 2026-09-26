import assert from "node:assert/strict";
import test from "node:test";
import { resolveNextActions } from "../lib/agent/next-actions.ts";
import type { PlatformStateSnapshot } from "../lib/agent/platform-state-model.ts";
import { operationById } from "../lib/agent/platform-catalog.ts";

/**
 * PRÓXIMOS PASSOS — o que a IA faz agora, e quem faz. Sem banco.
 * (Separado de tests/agent-platform-domain.test.mts em 2026-09-26 para ter dono próprio.)
 */
/* ============================ próximos passos =========================== */

const vazio = (): PlatformStateSnapshot => ({
  brand: {
    brandId: "b", brandName: "Marca", siteUrl: null, niche: null,
    screens: { marca: "/m", minerador: "/m/minerador", arquiteto: "/m/arquiteto", radar: "/m/radar", redator: "/m/redator", publicacoes: "/m/publicacoes" },
  },
  minerador: { total: 0, byStatus: {}, subjects: [], approvedNotSentIds: [] },
  arquiteto: { receivedKeywords: 0, articles: [], silos: [] },
  radar: { items: [] },
  redator: { documents: [] },
  published: { total: 0, pages: [] },
  truncated: [],
  readAt: "2026-09-26T00:00:00.000Z",
});

test("16 · marca vazia: playbook do silo do zero", () => {
  const { actions, playbook } = resolveNextActions(vazio());
  assert.equal(playbook, "silo_do_zero");
  assert.equal(actions.length, 0);
});

test("17 · site sem catálogo sincronizado: primeiro sincronizar, na tela", () => {
  const estado = vazio();
  estado.brand.siteUrl = "https://careglow.com.br";
  const [primeira] = resolveNextActions(estado).actions;
  assert.equal(primeira.operationId, "marca.site_catalog");
  assert.equal(primeira.who, "human");
  assert.equal(primeira.screen, "/m");
});

test("18 · aprovadas não enviadas: a IA envia, com a ferramenta", () => {
  const estado = vazio();
  estado.minerador = { total: 3, byStatus: { aprovado: 3 }, subjects: [], approvedNotSentIds: ["k1", "k2"] };
  const acao = resolveNextActions(estado).actions.find(item => item.operationId === "minerador.send_to_arquiteto");
  assert.ok(acao);
  assert.equal(acao.who, "agent");
  assert.deepEqual(acao.tools, ["send_keywords_to_arquiteto"]);
  assert.deepEqual(acao.items, ["k1", "k2"]);
});

test("19 · keywords em bruto: Lógica é ferramenta, medição é humana e aprovação exige aceite", () => {
  const estado = vazio();
  estado.minerador = { total: 5, byStatus: { bruto: 5 }, subjects: [], approvedNotSentIds: [] };
  const acoes = resolveNextActions(estado).actions;
  const logica = acoes.find(item => item.operationId === "minerador.run_logic");
  const medir = acoes.find(item => item.operationId === "minerador.measure_keywords");
  const aprovar = acoes.find(item => item.operationId === "minerador.review_and_approve");
  assert.equal(logica?.who, "agent");
  assert.deepEqual(logica?.tools, ["run_keyword_logic"]);
  assert.equal(medir?.who, "human");
  assert.equal(aprovar?.who, "human");
  assert.ok(aprovar?.tools.includes("decide_keywords"));
  assert.equal(aprovar?.screen, "/m/minerador");
});

test("20 · Radar aprovado vira envio ao Redator pela IA; Radar em curso fica com o humano", () => {
  const estado = vazio();
  estado.arquiteto.articles = [{ articleId: "a1", promise: "x", slug: "x", siloId: null, hierarchy: null, siloRole: null, journeyStage: null, mainIntent: null, principalKeyword: null, workflowState: "ENVIADO_AO_RADAR", canonical: null }];
  estado.radar.items = [{ articleId: "a1", state: "approved" }, { articleId: "a2", state: "research_pending" }];
  const acoes = resolveNextActions(estado).actions;
  assert.equal(acoes.find(item => item.operationId === "radar.send_to_writer")?.who, "agent");
  assert.deepEqual(acoes.find(item => item.operationId === "radar.send_to_writer")?.items, ["a1"]);
  assert.equal(acoes.find(item => item.operationId === "radar.investigate")?.who, "human");
});

test("21 · documento planejado: a IA escreve; em revisão: o humano aprova", () => {
  const estado = vazio();
  estado.redator.documents = [
    { documentId: "d1", articleId: "a1", title: "t", status: "planejado" },
    { documentId: "d2", articleId: "a2", title: "t", status: "em_revisao" },
  ];
  const acoes = resolveNextActions(estado).actions;
  assert.deepEqual(acoes.find(item => item.operationId === "redator.write_draft")?.items, ["d1"]);
  assert.equal(acoes.find(item => item.operationId === "redator.approve")?.who, "human");
});

test("22 · toda ação aponta para uma operação real do catálogo", () => {
  const estado = vazio();
  estado.brand.siteUrl = "https://x.com";
  estado.minerador = { total: 4, byStatus: { bruto: 1, em_revisao: 1, aprovado: 2 }, subjects: [], approvedNotSentIds: ["k"] };
  estado.arquiteto = { receivedKeywords: 2, articles: [{ articleId: "a", promise: "p", slug: null, siloId: null, hierarchy: null, siloRole: null, journeyStage: null, mainIntent: null, principalKeyword: null, workflowState: "PRONTO_PARA_RADAR", canonical: null }], silos: [{ siloId: "s", name: "S", pillarArticleId: "a", supportArticleIds: [], formationStatus: "draft", page: null }] };
  for (const acao of resolveNextActions(estado).actions) assert.ok(operationById(acao.operationId), acao.operationId);
});
