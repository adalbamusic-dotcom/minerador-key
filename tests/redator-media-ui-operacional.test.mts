/**
 * ===== CORTE 4 · A MÍDIA PRECISA SER OPERÁVEL, NÃO SÓ CORRETA =====
 *
 * COMPORTAMENTAL (01-09) — exercita as regras de estado e rótulo, sem banco.
 * ESTRUTURAL (10-16) — lê o código e prova que a fiação da tela é essa.
 *
 * O defeito que estes testes travam: o painel mostrava o seletor de posição e
 * mandava "registrar o prompt e anexar a imagem" apontando para controles que
 * não existiam naquele ambiente. As duas metades do fluxo estavam em telas
 * diferentes, e o resultado foi zero linha em `writer_media_assets`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  actionsFor, anchorStateFor, articleAnchorTargets, carouselAnchorTargets, labelForBlock,
  mediaRowsToPanelAssets, scriptAnchorTargets, type PanelAsset,
} from "../lib/redator/media-anchor-targets.ts";
import { MEDIA_ANCHOR_KINDS } from "../lib/redator/media-anchor.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");

const ativo = (o: Partial<PanelAsset> = {}): PanelAsset => ({
  id: "a1", status: "uploaded", anchorKind: null, anchorRef: null,
  fileHash: "hash", altText: "", objective: "obj", prompt: "prompt", supersededAt: null, ...o,
});

const alvoBloco = { kind: "article_block" as const, ref: "bloco-7", label: "Parágrafo · x", group: "Blocos do artigo" };

/* ======================= COMPORTAMENTAL ======================= */

test("01 · posição vazia oferece registrar briefing e anexar imagem", () => {
  const estado = anchorStateFor(alvoBloco, []);
  assert.equal(estado.current, null);
  assert.deepEqual(actionsFor(estado), ["registrar_briefing", "anexar_imagem"]);
});

test("02 · posição ocupada oferece substituir, alt e briefing — nunca anexar", () => {
  const atual = ativo({ id: "atual", anchorKind: "article_block", anchorRef: "bloco-7" });
  const estado = anchorStateFor(alvoBloco, [atual]);
  assert.equal(estado.current?.id, "atual");
  assert.deepEqual(actionsFor(estado), ["substituir_imagem", "editar_alt", "editar_briefing"]);
  assert.ok(!actionsFor(estado).includes("anexar_imagem"),
    "com imagem no lugar, a ação é substituir — anexar sugeriria acumular duas");
});

test("03 · upload confirmado é o que cria imagem atual; prompt sozinho não", () => {
  /* Briefing sem arquivo ocupa a posição? Não. Ele é intenção, não imagem. */
  const soPrompt = ativo({ id: "p", status: "prompt_ready", fileHash: null,
    anchorKind: "article_block", anchorRef: "bloco-7" });
  assert.equal(anchorStateFor(alvoBloco, [soPrompt]).current, null);

  const comArquivo = ativo({ id: "p", status: "uploaded", fileHash: "h",
    anchorKind: "article_block", anchorRef: "bloco-7" });
  assert.equal(anchorStateFor(alvoBloco, [comArquivo]).current?.id, "p");
});

test("04 · o sucessor nasce sem âncora e aparece como candidato", () => {
  const atual = ativo({ id: "atual", anchorKind: "article_block", anchorRef: "bloco-7" });
  const sucessor = ativo({ id: "novo" });
  const estado = anchorStateFor(alvoBloco, [atual, sucessor]);

  assert.equal(estado.current?.id, "atual");
  assert.deepEqual(estado.candidates.map(c => c.id), ["novo"]);
  assert.equal(sucessor.anchorKind, null, "o sucessor não carrega âncora");
});

test("05 · o predecessor é histórico, nunca segunda imagem atual", () => {
  /*
   * O predecessor MANTÉM a âncora — é o registro de onde ele vivia. Se o painel
   * filtrasse só por âncora, ele apareceria como segundo "atual" da posição.
   */
  const predecessor = ativo({ id: "velho", anchorKind: "article_block", anchorRef: "bloco-7",
    supersededAt: "2026-09-19T00:00:00.000Z" });
  const atual = ativo({ id: "novo", anchorKind: "article_block", anchorRef: "bloco-7" });

  const estado = anchorStateFor(alvoBloco, [predecessor, atual]);
  assert.equal(estado.current?.id, "novo");
  assert.deepEqual(estado.superseded.map(a => a.id), ["velho"]);
  assert.equal(estado.candidates.length, 0, "substituído não é candidato a nada");
});

test("06 · exatamente um asset atual por âncora", () => {
  const a = ativo({ id: "a", anchorKind: "article_block", anchorRef: "bloco-7" });
  const b = ativo({ id: "b", anchorKind: "article_block", anchorRef: "bloco-7", supersededAt: "2026-09-19T00:00:00.000Z" });
  const c = ativo({ id: "c", anchorKind: "article_block", anchorRef: "bloco-9" });

  const estado = anchorStateFor(alvoBloco, [a, b, c]);
  assert.equal(estado.current?.id, "a");
  assert.equal(anchorStateFor({ ...alvoBloco, ref: "bloco-9" }, [a, b, c]).current?.id, "c",
    "outra posição tem outro atual");
});

test("07 · artigo, cena e slide são posições isoladas", () => {
  const daCena = ativo({ id: "cena", anchorKind: "script_scene", anchorRef: "x" });
  const doSlide = ativo({ id: "slide", anchorKind: "carousel_slide", anchorRef: "x" });
  const doBloco = ativo({ id: "bloco", anchorKind: "article_block", anchorRef: "x" });
  const todos = [daCena, doSlide, doBloco];

  /* Mesma `ref`, tipos diferentes: substituir um não pode afetar os outros. */
  assert.equal(anchorStateFor({ kind: "script_scene", ref: "x", label: "", group: "" }, todos).current?.id, "cena");
  assert.equal(anchorStateFor({ kind: "carousel_slide", ref: "x", label: "", group: "" }, todos).current?.id, "slide");
  assert.equal(anchorStateFor({ kind: "article_block", ref: "x", label: "", group: "" }, todos).current?.id, "bloco");

  /* E dois slides diferentes não se enxergam. */
  const slide1 = ativo({ id: "s1", anchorKind: "carousel_slide", anchorRef: "slide-1" });
  const slide2 = ativo({ id: "s2", anchorKind: "carousel_slide", anchorRef: "slide-2" });
  assert.equal(anchorStateFor({ kind: "carousel_slide", ref: "slide-1", label: "", group: "" }, [slide1, slide2]).current?.id, "s1");
  assert.equal(anchorStateFor({ kind: "carousel_slide", ref: "slide-2", label: "", group: "" }, [slide1, slide2]).current?.id, "s2");
});

test("08 · rótulos humanos, id técnico só por dentro", () => {
  const targets = articleAnchorTargets({
    documentId: "doc-1", title: "Artigo",
    blocks: [
      { id: "b1", type: "heading", level: 2, text: "Como escolher protetor solar" },
      { id: "b2", type: "paragraph", text: "A pele oleosa pede textura leve." },
      { id: "b3", type: "image_brief", objective: "mostrar a textura do produto" },
      { id: "b4", type: "CTA", text: "Veja a linha completa" },
    ],
  });

  assert.equal(targets[0].label, "Capa do artigo");
  assert.equal(targets[0].ref, "doc-1", "a capa ancora no documento");
  assert.equal(targets[1].label, "H2 · Como escolher protetor solar");
  assert.match(targets[2].label, /^Parágrafo · A pele oleosa/);
  assert.match(targets[3].label, /^Imagem planejada · mostrar a textura/);
  assert.match(targets[4].label, /^Chamada · Veja a linha/);

  /* Nenhum tipo técnico aparece como rótulo. */
  for (const t of targets) {
    assert.doesNotMatch(t.label, /\b(image_brief|paragraph|heading|CTA|product_block|internal_link)\b/);
  }
  /* Mas o id continua existindo, como referência. */
  assert.deepEqual(targets.map(t => t.ref), ["doc-1", "b1", "b2", "b3", "b4"]);

  assert.equal(labelForBlock({ id: "x", type: "heading", level: 1, text: "" }), "H1 · sem título");
});

test("09 · cenas e slides viram posições numeradas, na ordem declarada", () => {
  const cenas = scriptAnchorTargets([
    { id: "c2", order: 1, narration: "Segunda cena" },
    { id: "c1", order: 0, narration: "Primeira cena" },
  ]);
  assert.deepEqual(cenas.map(c => c.ref), ["c1", "c2"], "a ordem declarada manda");
  assert.equal(cenas[0].label, "Cena 1 · Primeira cena");
  assert.equal(cenas[0].kind, "script_scene");

  const slides = carouselAnchorTargets([{ id: "s1", order: 0, heading: "Abertura" }]);
  assert.equal(slides[0].label, "Slide 1 · Abertura");
  assert.equal(slides[0].kind, "carousel_slide");

  /* Sem id estável não vira posição — não se inventa referência. */
  assert.equal(scriptAnchorTargets([{ order: 0, narration: "sem id" }]).length, 0);
});

test("10 · o mapeador de linhas preserva o que decide o estado", () => {
  const [linha] = mediaRowsToPanelAssets([{
    id: "a", status: "uploaded", anchor_kind: "article_block", anchor_ref: "b1",
    file_hash: "h", alt_text: "alt", objective: "obj", prompt: "p", superseded_at: "2026-09-19T00:00:00.000Z",
  }]);
  assert.deepEqual(linha, {
    id: "a", status: "uploaded", anchorKind: "article_block", anchorRef: "b1",
    fileHash: "h", altText: "alt", objective: "obj", prompt: "p", supersededAt: "2026-09-19T00:00:00.000Z",
  });
  assert.deepEqual(mediaRowsToPanelAssets(null), []);
});

/* ======================= ESTRUTURAL ======================= */

test("11 · o painel executa a ordem do servidor, sem pular passo", async () => {
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");
  const codigo = painel.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Briefing antes do upload, upload antes de ocupar posição. */
  const iBriefing = codigo.indexOf("registrarBriefingInterno");
  const iUpload = codigo.indexOf("/api/redator/media-upload");
  const iHash = codigo.indexOf("recibo.fileHash");
  const iAncora = codigo.indexOf('action: "replace"');
  assert.ok(iBriefing > 0 && iUpload > iBriefing, "o briefing vem antes do upload");
  assert.ok(iHash > iUpload, "o hash é conferido depois do upload");
  assert.ok(iAncora > iHash, "a posição só é tocada depois do hash confirmado");

  /* Upload sem hash confirmado NÃO troca imagem. */
  assert.match(codigo, /if \(!recibo\.fileHash\) throw new Error/);

  /* Posição ocupada → replace; vazia → anchor. Nunca sobrescreve arquivo. */
  assert.match(codigo, /if \(estado\?\.current\) \{[\s\S]{0,200}action: "replace"/);
  assert.match(codigo, /action: "anchor"/);
  assert.doesNotMatch(codigo, /upsert/);
});

test("12 · o preview é privado: URL assinada curta, caminho vindo do banco", async () => {
  const io = await fonte("../lib/server/writer-media-lifecycle.ts");
  const rota = await fonte("../app/api/redator/media-anchor/route.ts");
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");

  assert.match(io, /createSignedUrl\(asset\.storagePath, PREVIEW_URL_TTL_SECONDS\)/);
  assert.match(io, /PREVIEW_URL_TTL_SECONDS = 60/);
  /* O caminho vem de `readAssetState`, escopado pela marca — nunca do cliente. */
  assert.match(io, /const asset = await readAssetState\(input\.brandId, input\.assetId\)/);
  /* Bucket não vira público, e nenhuma URL pública é emitida. */
  assert.doesNotMatch(io, /getPublicUrl|public:\s*true/);
  /* A URL assinada não pode ser cacheada. */
  assert.match(rota, /"Cache-Control": "no-store, private"/);
  /* Nenhum segredo vai ao navegador. */
  const codigoPainel = painel.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(codigoPainel, /SERVICE_ROLE|service_role|SUPABASE_[A-Z_]*KEY|createSignedUrl/);
  assert.match(codigoPainel, /action: "preview"/);
});

test("13 · o painel é lateral e contextual: sem seção global, sem barra nova", async () => {
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");
  const derivado = await fonte("../modules/redator/writer-derived-environment.tsx");
  const writer = await fonte("../components/editorial/professional-writer.tsx");

  assert.match(painel, /data-writer-media-anchor-panel/);
  assert.match(painel, /if \(!brandId \|\| !documentId \|\| targets\.length === 0\) return null;/);
  /*
   * O painel não cria faixa alguma. No ambiente derivado existe UM `<header>`,
   * que é o cabeçalho de título da tela e já existia — não é barra de ações, e
   * a regra é não criar barra NOVA. O teste trava a contagem para que um
   * segundo cabeçalho não entre sem ser notado.
   */
  assert.doesNotMatch(painel.replace(/\/\*[\s\S]*?\*\//g, ""), /<header|<footer/, "o painel não cria faixa");
  assert.equal((derivado.match(/<header/g) || []).length, 1, "o ambiente derivado não ganhou cabeçalho novo");
  assert.equal((derivado.match(/<footer/g) || []).length, 0);
  /* A seção global "Prompts e imagens" saiu do ambiente derivado. */
  assert.doesNotMatch(derivado.replace(/\/\*[\s\S]*?\*\//g, ""), /Prompts e imagens/);

  /* Um painel só, montado nos dois ambientes. */
  assert.equal((writer.match(/<WriterMediaAnchorPanel/g) || []).length, 1);
  assert.equal((derivado.match(/<WriterMediaAnchorPanel/g) || []).length, 1);
  assert.equal((painel.match(/data-writer-media-anchor-panel/g) || []).length, 1);
});

test("14 · os quatro anchors têm upload; article_break não aparece", async () => {
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");
  const alvos = await fonte("../lib/redator/media-anchor-targets.ts");
  const writer = await fonte("../components/editorial/professional-writer.tsx");
  const derivado = await fonte("../modules/redator/writer-derived-environment.tsx");

  /* Cada anchor tem papel declarado, então cada um consegue criar briefing. */
  for (const kind of MEDIA_ANCHOR_KINDS) {
    assert.match(painel, new RegExp(`${kind}:`), `${kind} precisa de papel no painel`);
  }
  /* E cada ambiente fornece as posições do seu tipo. */
  assert.match(writer, /articleAnchorTargets\(/);
  assert.match(derivado, /scriptAnchorTargets\(/);
  assert.match(derivado, /carouselAnchorTargets\(/);
  /* Um input de arquivo, servindo os quatro. */
  assert.match(painel, /type="file" accept="image\/png,image\/jpeg,image\/webp"/);

  for (const arquivo of [painel, alvos, writer, derivado]) {
    assert.doesNotMatch(arquivo.replace(/\/\*[\s\S]*?\*\//g, ""), /article_break/);
  }
});

test("15 · alt text e briefing persistem pelo servidor, com readback", async () => {
  const io = await fonte("../lib/server/writer-media-lifecycle.ts");
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");

  assert.match(io, /export async function updateWriterMediaBrief/);
  /* Readback: o que voltou tem que ser o que se pediu. */
  assert.match(io, /lido\.alt_text !== input\.altText/);
  assert.match(io, /readback_divergente/);
  /* Histórico em janela não se reescreve. */
  assert.match(io, /if \(asset\.supersededAt\) return \{ status: "refused", refusal: "superseded" \}/);
  assert.match(io, /\.is\("superseded_at", null\)/);
  assert.match(painel, /action: "update_brief"/);
});

test("16 · conflito e falha de readback chegam como frase, não como código", async () => {
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");
  const codigo = painel.replace(/\/\*[\s\S]*?\*\//g, "");

  /* As duas recusas de conflito têm texto próprio: são situações diferentes. */
  assert.match(codigo, /anchor_taken[\s\S]{0,120}Conflito/);
  assert.match(codigo, /predecessor_not_current[\s\S]{0,140}Conflito/);
  /* Falha de releitura diz o que continua valendo. */
  assert.match(codigo, /readback[\s\S]{0,160}imagem anterior continua no lugar/);
  /* E há estado de progresso durante o envio. */
  assert.match(codigo, /data-media-progresso/);
  assert.match(codigo, /Conferindo formato, hash e releitura/);
});
