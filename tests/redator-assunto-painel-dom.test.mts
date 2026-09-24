import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * ===== SDD do Assunto, F4.2 · o painel de fundamentos RENDERIZADO =====
 *
 * O `WriterRadarFoundationsPanel` real, no DOM, com o documento do envio:
 *
 *   1. com Assunto, o primeiro bloco depois do cabeçalho é o tronco, com a
 *      nota, onde virar, a seção (e o aviso de título de trabalho), o H1, o
 *      destino e o alerta — o texto é o das linhas do envio;
 *   2. seção observada: sem o aviso de título de trabalho;
 *   3. sem Assunto (chave ausente, `[]` ou linha sem tronco), o HTML é o
 *      mesmo, byte a byte;
 *   4. a cópia de listagem (sem o bundle) mostra o mesmo bloco.
 *
 * Fixtures, sem rede.
 */

const { WriterRadarFoundationsPanel } = await import("../modules/redator/writer-radar-foundations-panel.tsx");
const { ContentDocumentSchema } = await import("../lib/arquiteto/contracts.ts");
const { toListingForm } = await import("../lib/editorial/content-document-listing.ts");
const { ASSUNTO, documentoDoPainel, linhasDoAssunto, viradaObservada } = await import("./redator-assunto-painel-fixtures.mts");

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => { tela = await montarRadar(); });
test.afterEach(() => { tela?.destroy(); tela = null; });

const painel = (documento: unknown) => React.createElement(WriterRadarFoundationsPanel, { document: documento as never });
const bloco = () => tela!.container.querySelector<HTMLElement>('[data-radar-foundations-section="subject"]');
const campo = (nome: string) => tela!.container.querySelector<HTMLElement>(`[data-radar-subject-field="${nome}"]`);

test("01 · com Assunto, o tronco abre o painel com a virada, o H1, o destino e o alerta", async () => {
  await tela!.render(painel(documentoDoPainel(linhasDoAssunto())));
  const assunto = bloco();
  assert.ok(assunto, "o bloco do Assunto existe");
  const secoes = [...tela!.container.querySelectorAll<HTMLElement>("[data-radar-foundations-section]")].map(item => item.dataset.radarFoundationsSection);
  assert.equal(secoes[0], "subject", "é o primeiro bloco, antes da recomendação");
  assert.equal(secoes[1], "recommendation");

  assert.equal(assunto.querySelector("h3")?.textContent, `Assunto (tronco): ${ASSUNTO.phrase}`);
  assert.equal(campo("note")?.textContent, `${ASSUNTO.note}.`);
  assert.match(campo("turn")?.textContent || "", /^Onde fazer a virada.*levar o leitor de rotina de skincare a sérum de vitamina C/);
  assert.match(campo("section")?.textContent || "", /^Seção da virada"Virada para sérum de vitamina C"/);
  assert.ok(assunto.querySelector("[data-radar-subject-working-title]"), "seção sintética: o aviso de reescrever aparece");
  assert.match(assunto.querySelector("[data-radar-subject-working-title]")?.textContent || "", /título é de trabalho do Radar: reescreva-o para o leitor/);
  assert.match(campo("h1")?.textContent || "", /^Direção do H1rotina de skincare \+ complemento "com sérum de vitamina C"/);
  assert.equal(campo("destination")?.textContent, `Destino da chamadaLevar o leitor a ${ASSUNTO.destinationUrl}.`);
  assert.equal(campo("alert")?.textContent, "Alerta do Radar: Só 2 de 8 páginas tocam o Assunto: a sustentação é fraca.");
  assert.equal(campo("others"), null);
  assert.match(assunto.textContent || "", /a decisão é de quem redige/);
  assert.match(assunto.className, /text-sm/);
});

test("02 · seção observada: sem o aviso de título de trabalho", async () => {
  await tela!.render(painel(documentoDoPainel(linhasDoAssunto(viradaObservada()))));
  assert.ok(bloco());
  assert.match(campo("section")?.textContent || "", /"Onde entra o sérum", como H2/);
  assert.equal(bloco()!.querySelector("[data-radar-subject-working-title]"), null);
});

test("03 · sem Assunto, o painel é o mesmo, byte a byte", async () => {
  await tela!.render(painel(documentoDoPainel()));
  const semChave = tela!.container.innerHTML;
  assert.equal(bloco(), null);
  await tela!.render(painel(documentoDoPainel([])));
  assert.equal(tela!.container.innerHTML, semChave, "editorialContext vazio");
  const semTronco = documentoDoPainel([]) as unknown as { importedContext: Record<string, unknown> };
  semTronco.importedContext.editorialContext = ["Contexto editorial."];
  await tela!.render(painel(semTronco));
  assert.equal(tela!.container.innerHTML, semChave, "linha sem tronco não vira Assunto na tela");
  assert.ok(semChave.includes('data-radar-foundations="presente"'));
});

test("04 · a cópia de listagem, sem o bundle, mostra o mesmo Assunto", async () => {
  const listado = toListingForm(ContentDocumentSchema.parse(documentoDoPainel(linhasDoAssunto())));
  await tela!.render(painel(listado));
  assert.equal(bloco()?.querySelector("h3")?.textContent, `Assunto (tronco): ${ASSUNTO.phrase}`);
});

test("05 · nenhuma chamada de rede", () => {
  assert.equal(chamadasDeRede, 0);
});
