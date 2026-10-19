import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * A EXCLUSÃO DE SEMPRE, RENDERIZADA (2026-10-17; dono: "ele tem que deixar
 * apagar todo o grupo"; P-4 da SDD da linha única do Minerador).
 *
 * Os diálogos de sempre (`DeleteConfirmation` / `PublishedDeleteConfirmation`)
 * com a regra única da confirmação:
 *   1. com keyword do plano: a prévia diz o que sai do plano (por cor) e o que
 *      fica fora; o botão só habilita com o nome da cor e "apaga de vez"; o que
 *      foi digitado vai ao servidor, que confere pela MESMA regra;
 *   2. sem plano e até 10: o nome digitado de sempre;
 *   3. publicada na confirmação forte: o nome de cada uma.
 *
 * Roda em `pnpm run test:minerador:dom`. Fixtures, sem rede.
 */

const { DeleteConfirmation, PublishedDeleteConfirmation } = await import("../components/lifecycle/delete-confirmation.tsx");
const { KeywordDeleteDetails } = await import("../modules/minerador/keyword-delete-details.tsx");
const { deleteConfirmationRequirement } = await import("../lib/lifecycle/typed-confirmation.ts");

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => { tela = await montarRadar(); });
test.afterEach(() => { tela?.destroy(); tela = null; });

const botao = (rotulo: string) => {
  const achado = [...tela!.container.querySelectorAll("button")].find(item => item.textContent === rotulo);
  assert.ok(achado, rotulo);
  return achado as HTMLButtonElement;
};
const campo = (seletor: string) => {
  const achado = tela!.container.querySelector(seletor);
  assert.ok(achado, seletor);
  return achado as HTMLInputElement;
};

const COR_AMARELO = {
  groupId: "a9d5c87b-0000-4000-8000-000000000003",
  colorLabel: "Amarelo",
  preview: {
    releasedSubjects: [
      { keywordId: "k1", title: "Como escolher plano de internet residencial", order: 1, role: "Pilar", planOfThisColor: true },
      { keywordId: "k2", title: "Internet residencial barata", order: 2, role: "Suporte", planOfThisColor: true },
    ],
  },
} as never;

test("keyword do plano: a prévia diz o que sai do plano e o que fica fora; o botão só habilita com a cor e “apaga de vez”; o digitado vai ao servidor", async () => {
  const recebidos: unknown[] = [];
  const requirement = deleteConfirmationRequirement({ selectionName: "8 keywords selecionadas", colorWords: ["amarelo"], hardCount: 4, recoverable: [] });
  await tela!.render(React.createElement(DeleteConfirmation, {
    open: true,
    title: "Excluir keywords não publicadas?",
    description: "Esta ação excluirá definitivamente as keywords selecionadas.",
    confirmationName: "8 keywords selecionadas",
    confirmLabel: "Excluir definitivamente",
    requirement,
    details: React.createElement(KeywordDeleteDetails, {
      effects: ["4 keywords não publicadas são apagadas DE VEZ (com as medições e as origens de descoberta; os eventos de decisão ficam como histórico). Não há como desfazer.", "Cor Amarelo: 2 keywords saem do plano (o Assunto é liberado e apagado na mesma transação); o plano do Silo passa para a v5 com 6 artigos; a cor Amarelo continua ocupada."],
      out: [{ id: "k3", keyword: "claro vivo ou tim internet residencial", reason: "architect_unavailable", message: "Está no ArticleDNA vigente de 1 artigo do Arquiteto: a exclusão desmonta o artigo lá, e o desmonte não pôde ser preparado agora.", path: "Arquiteto → “Desfazer Silo” (o Silo inteiro, Pilar incluído) ou “Retirar artigo do Silo” (um artigo); depois uma prévia nova aqui", groupId: "g" }],
      colors: [COR_AMARELO],
      unavailableMessage: null,
    }),
    onCancel: () => undefined,
    onConfirm: (typed: unknown) => { recebidos.push(typed); },
  }));
  const texto = tela!.text();
  assert.match(texto, /Saem do plano do Silo · cor Amarelo/);
  assert.match(texto, /1º · Pilar · Como escolher plano de internet residencial/);
  assert.match(texto, /Cor Amarelo: 2 keywords saem do plano/);
  assert.match(texto, /Ficam fora \(com o motivo\)/);
  assert.match(texto, /claro vivo ou tim internet residencial/);
  // 2026-10-18 · SUBSTITUÍDO "architect_reference" (o Arquiteto não exclui keyword): só fica fora quando o desmonte não pôde ser preparado.
  assert.ok(texto.includes("Caminho: Arquiteto → “Desfazer Silo” (o Silo inteiro, Pilar incluído) ou “Retirar artigo do Silo”"), texto);
  assert.match(texto, /Digite o nome da cor: amarelo/);
  assert.match(texto, /Há exclusão definitiva\. Digite: apaga de vez/);
  assert.doesNotMatch(texto, /Digite 8 keywords selecionadas/, "a forte substitui o nome digitado de sempre");
  assert.equal(botao("Excluir definitivamente").disabled, true);

  await tela!.type(campo("[data-delete-strong-color=amarelo]"), "Amarelo");
  assert.equal(botao("Excluir definitivamente").disabled, true, "falta “apaga de vez”");
  assert.match(tela!.text(), /Falta: “apaga de vez”\./);
  await tela!.type(campo("[data-delete-strong-phrase]"), "apaga de vez");
  assert.equal(botao("Excluir definitivamente").disabled, false);
  await tela!.click(botao("Excluir definitivamente"));
  assert.deepEqual(recebidos, [{ colors: { amarelo: "Amarelo" }, phrase: "apaga de vez" }]);
  assert.equal(chamadasDeRede, 0, "o diálogo não chama o servidor: quem chama é a tela, com o digitado");
});

test("sem plano e até 10: o nome digitado de sempre", async () => {
  const recebidos: unknown[] = [];
  const requirement = deleteConfirmationRequirement({ selectionName: "wifi lento", colorWords: [], hardCount: 1, recoverable: [] });
  await tela!.render(React.createElement(DeleteConfirmation, {
    open: true, title: "Excluir keywords não publicadas?", description: "d", confirmationName: "wifi lento", confirmLabel: "Excluir definitivamente",
    requirement, onCancel: () => undefined, onConfirm: (typed: unknown) => { recebidos.push(typed); },
  }));
  assert.equal(tela!.container.querySelector("[data-delete-strong-confirmation]"), null);
  assert.match(tela!.text(), /Digite wifi lento para confirmar\./);
  const entrada = tela!.container.querySelector("input") as HTMLInputElement;
  await tela!.type(entrada, "WiFi Lento");
  await tela!.click(botao("Excluir definitivamente"));
  assert.deepEqual(recebidos, [{ selection: "WiFi Lento" }]);
});

test("publicada na confirmação forte: o nome de cada uma, além da cor", async () => {
  const recebidos: unknown[] = [];
  const requirement = deleteConfirmationRequirement({ selectionName: "x", colorWords: ["amarelo"], hardCount: 0, recoverable: [{ id: "p1", keyword: "internet fibra empresarial" }] });
  await tela!.render(React.createElement(PublishedDeleteConfirmation, {
    open: true, title: "Remover keywords publicadas por 24 horas", description: "d", confirmationName: "x",
    requirement, onCancel: () => undefined, onConfirm: (typed: unknown) => { recebidos.push(typed); },
  }));
  assert.match(tela!.text(), /Publicada \(lixeira de 24 h\)\. Digite: internet fibra empresarial/);
  assert.equal(tela!.container.querySelector("[data-delete-strong-phrase]"), null, "sem exclusão definitiva, “apaga de vez” não é pedido");
  await tela!.type(campo("[data-delete-strong-color=amarelo]"), "amarelo");
  assert.equal(botao("Remover por 24 horas").disabled, true);
  await tela!.type(campo("[data-delete-strong-published=p1]"), "Internet fibra empresarial");
  await tela!.click(botao("Remover por 24 horas"));
  assert.deepEqual(recebidos, [{ colors: { amarelo: "amarelo" }, publishedNames: { p1: "Internet fibra empresarial" } }]);
});
