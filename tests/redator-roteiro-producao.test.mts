/**
 * ===== CORTE 6A · ROTEIRO COMO DOCUMENTO PRODUZIDO =====
 *
 * COMPORTAMENTAL (01-10) — operações de cena, sem React e sem banco.
 * ESTRUTURAL (11-17) — lê a tela e o contrato e prova que a fiação é essa.
 *
 * O que estes testes protegem acima de tudo: `sceneId` é a âncora da mídia
 * (`anchor_kind = script_scene`, `anchor_ref = sceneId`). Um id trocado numa
 * reordenação deixaria a imagem ancorada numa posição que não existe mais.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  adicionarCena, cenasEmOrdem, duplicarCena, editarCena, idsEmOrdem, moverCena, novaCena, removerCena,
} from "../lib/redator/script-scenes.ts";
import { VideoScriptPayloadSchema, WriterDeliverablePayloadSchema, newWriterDeliverable } from "../lib/redator/multiformat-contracts.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");

const roteiro = (scenes: unknown[] = []) => VideoScriptPayloadSchema.parse({
  schemaVersion: 1, kind: "video_script", documentId: "doc-1", title: "Roteiro",
  objective: "", audience: "", sourceDocumentHash: "hash", notes: [],
  channel: "", durationSeconds: 0, openingHook: "", closingCta: "", scenes,
});

const tres = () => [novaCena("A", 0), novaCena("B", 1), novaCena("C", 2)];

/* ======================= COMPORTAMENTAL ======================= */

test("01 · roteiro salva com Canal vazio", () => {
  const payload = roteiro([novaCena("A", 0)]);
  assert.equal(payload.channel, "", "canal vazio é válido");
  const novo = newWriterDeliverable("video_script", { documentId: "d", title: "t", sourceDocumentHash: "h" });
  assert.equal(novo.kind === "video_script" && novo.channel, "", "nasce sem canal, e não com um destino inventado");
  /* E o contrato aceita o payload inteiro sem canal. */
  assert.equal(WriterDeliverablePayloadSchema.safeParse(payload).success, true);
});

test("02 · a primeira cena entra num roteiro vazio", () => {
  const vazio = roteiro();
  assert.equal(vazio.scenes.length, 0);
  const comUma = adicionarCena(vazio.scenes, novaCena("A", 0) as never);
  assert.equal(comUma.length, 1);
  assert.equal(comUma[0].id, "A");
  assert.equal(comUma[0].order, 0);
});

test("03 · várias cenas entram e ficam numeradas em sequência", () => {
  /* O tipo explícito evita `never[]` da lista vazia literal. */
  let cenas: ReturnType<typeof novaCena>[] = adicionarCena([], novaCena("A", 0));
  cenas = adicionarCena(cenas, novaCena("B", 9) as never);
  cenas = adicionarCena(cenas, novaCena("C", 99) as never);
  assert.deepEqual(cenas.map(c => c.order), [0, 1, 2], "a ordem é recalculada, não confiada na entrada");
  assert.deepEqual(idsEmOrdem(cenas), ["A", "B", "C"]);
});

test("04 · editar uma cena não toca no id dela nem nas outras", () => {
  const cenas = tres();
  const editadas = editarCena(cenas, "B", { narration: "nova fala", title: "Abertura" } as never);

  assert.deepEqual(idsEmOrdem(editadas), ["A", "B", "C"]);
  const b = editadas.find(c => c.id === "B") as Record<string, unknown>;
  assert.equal(b.narration, "nova fala");
  assert.equal(b.title, "Abertura");
  /* As não editadas saem pela MESMA referência: nada nelas mudou. */
  assert.equal(editadas[0], cenas[0]);
  assert.equal(editadas[2], cenas[2]);
});

test("05 · editar não consegue trocar o id nem por acidente", () => {
  const cenas = tres();
  const tentativa = editarCena(cenas, "B", { id: "OUTRO" } as never);
  assert.deepEqual(idsEmOrdem(tentativa), ["A", "B", "C"], "o id é preservado mesmo se vier no patch");
});

test("06 · reordenar preserva TODOS os ids — a âncora da mídia depende disso", () => {
  const cenas = tres();

  const descendo = moverCena(cenas, "A", 1);
  assert.deepEqual(idsEmOrdem(descendo), ["B", "A", "C"]);
  assert.deepEqual(descendo.map(c => c.order), [0, 1, 2]);

  const subindo = moverCena(cenas, "C", -1);
  assert.deepEqual(idsEmOrdem(subindo), ["A", "C", "B"]);

  /* O conjunto de ids é o mesmo antes e depois: nenhum nasceu, nenhum morreu. */
  assert.deepEqual([...idsEmOrdem(descendo)].sort(), ["A", "B", "C"]);
  assert.deepEqual([...idsEmOrdem(subindo)].sort(), ["A", "B", "C"]);

  /* Nas bordas, nada acontece. */
  assert.deepEqual(idsEmOrdem(moverCena(cenas, "A", -1)), ["A", "B", "C"]);
  assert.deepEqual(idsEmOrdem(moverCena(cenas, "C", 1)), ["A", "B", "C"]);
});

test("07 · duplicar gera id NOVO e não leva o storyboard da original", () => {
  /*
   * Id novo é obrigatório: duas cenas com o mesmo id disputariam a mesma
   * âncora, e o índice único da M3 recusaria a segunda imagem sem explicar.
   */
  const comStoryboard = editarCena(tres(), "B", {
    storyboard: { objective: "o", prompt: "p", aspectRatio: "16:9", altText: "", assetId: "asset-1" },
  } as never);

  const duplicadas = duplicarCena(comStoryboard, "B", () => "NOVO");
  assert.deepEqual(idsEmOrdem(duplicadas), ["A", "B", "NOVO", "C"], "a cópia entra logo abaixo");
  const copia = duplicadas.find(c => c.id === "NOVO") as Record<string, unknown>;
  assert.equal(copia.storyboard, null, "a cópia não herda a imagem: ela não tem imagem");
  const original = duplicadas.find(c => c.id === "B") as Record<string, unknown>;
  assert.ok(original.storyboard, "a original mantém a dela");
});

test("08 · excluir não altera os ids das demais", () => {
  const cenas = tres();
  const semB = removerCena(cenas, "B");

  assert.deepEqual(idsEmOrdem(semB), ["A", "C"], "A e C continuam sendo A e C");
  assert.deepEqual(semB.map(c => c.order), [0, 1], "só a ordem se ajusta");
  /* É isso que impede a mídia de C passar a apontar para o lugar errado. */
  assert.equal(semB[1].id, "C");
});

test("09 · a mídia segue a cena depois da reordenação", () => {
  /*
   * A âncora é o id, não a posição. Reordenar muda `order`; o `anchor_ref`
   * continua o mesmo, então a imagem continua da mesma cena.
   */
  const cenas = tres();
  const ancoraDeB = "B";
  const depois = moverCena(cenas, "B", -1);

  assert.equal(depois[0].id, ancoraDeB, "B foi para o topo levando o próprio id");
  assert.ok(depois.some(c => c.id === ancoraDeB), "a âncora continua resolvendo");
  assert.equal(cenasEmOrdem(depois).findIndex(c => c.id === "B"), 0);
});

test("10 · mexer numa cena não altera outra", () => {
  const cenas = tres();
  const editada = editarCena(cenas, "A", { narration: "só A" } as never);
  const b = editada.find(c => c.id === "B") as Record<string, unknown>;
  const c = editada.find(c => c.id === "C") as Record<string, unknown>;
  assert.equal(b.narration, "");
  assert.equal(c.narration, "");

  const duplicada = duplicarCena(cenas, "A", () => "A2");
  assert.deepEqual(idsEmOrdem(duplicada).filter(id => id === "B" || id === "C"), ["B", "C"]);
});

/* ======================= ESTRUTURAL ======================= */

test("11 · o contrato da cena representa o mínimo de um roteiro", () => {
  const cena = novaCena("X", 0);
  for (const campo of ["id", "order", "title", "narration", "onScreenText", "visualDirection", "technicalDirection"]) {
    assert.ok(campo in cena, `a cena precisa de ${campo}`);
  }
  /* E o schema aceita esses campos — sem eles o save recusaria. */
  const payload = roteiro([{ ...cena, title: "Abertura", onScreenText: "TEXTO NA TELA" }]);
  assert.equal(payload.scenes[0].title, "Abertura");
  assert.equal(payload.scenes[0].onScreenText, "TEXTO NA TELA");
});

test("12 · os campos novos são retrocompatíveis com o que já está gravado", () => {
  /*
   * As duas cenas gravadas antes do Corte 6A não têm `title` nem
   * `onScreenText`. Com `.default("")` elas continuam validando — se fossem
   * obrigatórias, o roteiro existente deixaria de abrir.
   */
  const antiga = {
    id: "velha", order: 0, durationSeconds: 0, narration: "n",
    visualDirection: "v", technicalDirection: "t", storyboard: null, sourceRefs: [],
  };
  const parsed = roteiro([antiga]);
  assert.equal(parsed.scenes[0].title, "");
  assert.equal(parsed.scenes[0].onScreenText, "");
  assert.equal(parsed.scenes[0].id, "velha", "o id sobrevive ao parse");
});

test("13 · a tela é documento vertical, não ficha de briefing", async () => {
  const ui = await fonte("../modules/redator/writer-derived-environment.tsx");
  const codigo = ui.replace(/\/\*[\s\S]*?\*\//g, "");

  /* A cena é a unidade principal e delimitada. */
  assert.match(codigo, /data-cena=\{parte\.id\}/);
  assert.match(codigo, /Fala ou narração/);
  assert.match(codigo, /Texto na tela/);
  assert.match(codigo, /Direção visual/);

  /* Os metadados existem, mas recolhidos e fora do caminho. */
  assert.match(codigo, /data-metadados-opcionais/);
  assert.match(codigo, /<details[^>]*data-metadados-opcionais|data-metadados-opcionais[\s\S]{0,80}<summary/);
  assert.match(codigo, /Metadados opcionais/);

  /* Nenhum deles é obrigatório, e o canal é explicitamente opcional. */
  assert.match(codigo, /Canal <span className="text-text-muted">\(opcional\)<\/span>/);
  assert.doesNotMatch(codigo, /placeholder="YouTube/);
  assert.doesNotMatch(codigo, /required/);
});

test("14 · as seis operações de cena existem e passam pelo módulo puro", async () => {
  const ui = await fonte("../modules/redator/writer-derived-environment.tsx");
  const codigo = ui.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const operacao of ["adicionarCena", "editarCena", "removerCena", "duplicarCena", "moverCena"]) {
    assert.ok(codigo.includes(operacao), `a tela precisa usar ${operacao}`);
  }
  /* Nenhuma reordenação à mão dentro do componente. */
  assert.doesNotMatch(codigo, /\.sort\(\(a, b\) =>/);
  assert.doesNotMatch(codigo, /crypto\.randomUUID\(\)[\s\S]{0,40}order: current\.scenes\.length,[\s\S]{0,200}narration/);

  /* Os controles de cada cena estão lá, com rótulo acessível. */
  for (const rotulo of ["para cima", "para baixo", "Duplicar", "Excluir"]) {
    assert.ok(codigo.includes(rotulo), `falta o controle: ${rotulo}`);
  }
});

test("15 · o storyboard é da cena aberta, e não há galeria global", async () => {
  const ui = await fonte("../modules/redator/writer-derived-environment.tsx");
  const codigo = ui.replace(/\/\*[\s\S]*?\*\//g, "");

  /* O painel recebe SÓ a âncora da cena selecionada. */
  assert.match(codigo, /targets=\{alvos\.filter\(alvo => alvo\.ref === cenaSelecionada\)\}/);
  assert.match(codigo, /data-storyboard-lateral/);
  /* Sem cena aberta, não há painel — logo, não há galeria solta. */
  assert.match(codigo, /cenaSelecionada[\s\S]{0,120}: <p className="rounded border border-dashed/);
  assert.doesNotMatch(codigo, /Prompts e imagens/);
});

test("16 · nenhuma barra horizontal nova, e nenhuma integração social", async () => {
  const ui = await fonte("../modules/redator/writer-derived-environment.tsx");
  const codigo = ui.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.equal((ui.match(/<header/g) || []).length, 1, "só o cabeçalho de título do documento");
  assert.doesNotMatch(codigo, /<footer/);
  assert.doesNotMatch(codigo, /Conectar IA|Tela cheia|fullscreen/i);
  /* Destino externo não é assunto do Redator. */
  assert.doesNotMatch(codigo, /YouTube|Instagram|TikTok|Meta Ads|publicar no/i);
});

test("17 · o roteiro não inventa geração nem finalização que não existem", async () => {
  const ui = await fonte("../modules/redator/writer-derived-environment.tsx");
  const codigo = ui.replace(/\/\*[\s\S]*?\*\//g, "");

  /*
   * Não existe autoridade server-side de geração de roteiro nem de finalização
   * de entregável — `writer_save_deliverable` não recebe status e não há RPC de
   * finalização. Botão sem back-end é promessa falsa, então não há botão.
   */
  assert.doesNotMatch(codigo, /Gerar estrutura inicial|Gerar roteiro|Reescrever cena/);
  assert.doesNotMatch(codigo, /Finalizar roteiro|Finalizar carrossel/);
  /* E enviar a Publicações continua sendo ato separado, fora desta tela. */
  assert.doesNotMatch(codigo, /sendWriterToPublications|Enviar a Publicações/);
});
