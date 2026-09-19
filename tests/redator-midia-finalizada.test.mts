/**
 * ===== CORTE 6A.7 · MÍDIA EM ENTREGÁVEL FINALIZADO =====
 *
 * Dois defeitos, dos quais um só era visível:
 *
 * 1. `fieldset disabled={finalizado}` envolvia também o mecanismo de seleção.
 *    Elemento desabilitado não dispara foco, `cenaSelecionada` ficava vazia, e o
 *    painel de mídia — que vive fora do fieldset — nunca recebia alvo. A tela
 *    pedia "selecione uma cena" sem oferecer forma de selecionar.
 *
 * 2. Nenhuma mutação de mídia olhava `writer_deliverables.status`. Um estado de
 *    React preservado, ou uma chamada direta à rota, alterava mídia de um
 *    entregável `approved` sem recusa.
 *
 * COMPORTAMENTAL — as regras puras de propriedade e de portão.
 * ESTRUTURAL     — a UI e os cinco pontos de mutação, lidos como texto.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DELIVERABLE_KIND_BY_ANCHOR, DELIVERABLE_KIND_BY_ROLE,
  deliverableKindForMedia, gateMediaMutation,
} from "../lib/redator/media-anchor.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const AMBIENTE = "../modules/redator/writer-derived-environment.tsx";
const PAINEL = "../modules/redator/writer-media-anchor-panel.tsx";
const GUARDA = "../lib/server/writer-media-guard.ts";
const LIFECYCLE = "../lib/server/writer-media-lifecycle.ts";
const SERVIDOR = "../lib/server/writer-deliverables.ts";
const ROTA = "../app/api/redator/media-anchor/route.ts";

/** Comentário que explica uma ausência casa com a busca pela ausência. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const trecho = (src: string, de: string, ate?: string) => {
  const inicio = src.indexOf(de);
  assert.notEqual(inicio, -1, `trecho não encontrado: ${de}`);
  const fim = ate ? src.indexOf(ate, inicio) : -1;
  return fim === -1 ? src.slice(inicio) : src.slice(inicio, fim);
};

/* ======================= COMPORTAMENTAL ======================= */

test("01 · COMPORTAMENTAL · a âncora diz de quem é a mídia, e o papel também", () => {
  /* A âncora, quando existe. */
  assert.equal(deliverableKindForMedia({ anchorKind: "script_scene" }), "video_script");
  assert.equal(deliverableKindForMedia({ anchorKind: "carousel_slide" }), "carousel");

  /* O papel do briefing, que existe ANTES da âncora — é o que permite guardar
     a criação do briefing, quando âncora nenhuma foi atribuída ainda. */
  assert.equal(deliverableKindForMedia({ role: "storyboard" }), "video_script");
  assert.equal(deliverableKindForMedia({ role: "slide" }), "carousel");

  /* Artigo não resolve entregável: lifecycle próprio, fora desta guarda. */
  for (const anchorKind of ["article_cover", "article_block"]) {
    assert.equal(deliverableKindForMedia({ anchorKind }), null);
  }
  for (const role of ["cover", "breath", "article_block"]) {
    assert.equal(deliverableKindForMedia({ role }), null);
  }
  assert.equal(deliverableKindForMedia({}), null);

  /* A âncora manda quando os dois existem. */
  assert.equal(deliverableKindForMedia({ role: "slide", anchorKind: "script_scene" }), "video_script");

  /* Os mapas são totais sobre os dois tipos que existem no CHECK do banco. */
  assert.deepEqual(Object.values(DELIVERABLE_KIND_BY_ANCHOR).sort(), ["carousel", "video_script"]);
  assert.deepEqual(Object.values(DELIVERABLE_KIND_BY_ROLE).sort(), ["carousel", "video_script"]);
});

test("02 · COMPORTAMENTAL · só finalizado recusa; ler e rascunho seguem", () => {
  assert.deepEqual(gateMediaMutation({ deliverableKind: "video_script", deliverableStatus: "approved" }),
    { allowed: false, refusal: "writer_deliverable_finalized" });
  assert.deepEqual(gateMediaMutation({ deliverableKind: "carousel", deliverableStatus: "approved" }),
    { allowed: false, refusal: "writer_deliverable_finalized" });

  /* Reabrir devolve a permissão — é o caminho de volta. */
  for (const status of ["draft", "in_review"]) {
    assert.deepEqual(gateMediaMutation({ deliverableKind: "video_script", deliverableStatus: status }),
      { allowed: true }, `${status} pode alterar mídia`);
  }

  /* Sem entregável resolvido, não há o que proteger: mídia de artigo segue. */
  assert.deepEqual(gateMediaMutation({ deliverableKind: null, deliverableStatus: "approved" }),
    { allowed: true });
  /* E entregável que ainda não existe não bloqueia o primeiro briefing. */
  assert.deepEqual(gateMediaMutation({ deliverableKind: "carousel", deliverableStatus: null }),
    { allowed: true });
});

/* ======================= ESTRUTURAL ======================= */

test("03 · ESTRUTURAL · a cena continua selecionável com o conteúdo travado", async () => {
  const src = semComentarios(await fonte(AMBIENTE));

  /* O fieldset não desabilita mais nada — era ele que matava a seleção. */
  assert.doesNotMatch(src, /<fieldset[^>]*disabled=/,
    "desabilitar o fieldset apaga os eventos de foco das cenas");

  /* Selecionar por CLIQUE e por FOCO: mouse e teclado. */
  const secao = trecho(src, "return <section key={parte.id} data-cena={parte.id}", "className={`cursor-pointer");
  assert.match(secao, /onPointerDown=\{\(\) => setCenaSelecionada\(parte\.id\)\}/);
  assert.match(secao, /onFocusCapture=\{\(\) => setCenaSelecionada\(parte\.id\)\}/);

  /* Conteúdo em somente leitura, não desabilitado: continua focável e copiável. */
  assert.ok(src.split("readOnly={finalizado}").length - 1 >= 13,
    "todo campo de conteúdo precisa de readOnly");

  /* O que MUDA estrutura fica desabilitado. */
  for (const acao of ["mover", "duplicar", "remover", "adicionar"]) {
    assert.ok(src.includes("disabled={finalizado"), `ações de cena desabilitadas (${acao})`);
  }
  assert.ok(src.split("disabled={finalizado").length - 1 >= 6,
    "botões de estrutura desabilitados quando finalizado");
});

test("04 · ESTRUTURAL · o painel abre em finalizado, sem ações e com explicação", async () => {
  const src = semComentarios(await fonte(PAINEL));
  const ambiente = semComentarios(await fonte(AMBIENTE));

  /* O ambiente informa o estado ao painel. */
  assert.match(ambiente, /<WriterMediaAnchorPanel[\s\S]{0,400}readOnly=\{finalizado\}/);

  /* Consultar continua: preview e estado seguem fora de qualquer condicional. */
  assert.match(src, /data-media-ver/);
  assert.match(src, /data-media-preview/);

  /* As ações somem inteiras, e no lugar fica o que fazer. */
  assert.match(src, /\{!readOnly && <div className="mt-2 flex flex-wrap gap-1">/);
  assert.match(src, /\{readOnly && <p[\s\S]{0,300}data-media-somente-leitura/);
  assert.match(src, /Reabra para edição/);

  /* Campos de briefing e alt em somente leitura. */
  assert.ok(src.split("readOnly={readOnly}").length - 1 >= 4);
});

test("05 · ESTRUTURAL · a guarda resolve o dono sem deliverable_id", async () => {
  const src = semComentarios(await fonte(GUARDA));

  assert.match(src, /deliverableKindForMedia/);
  assert.match(src, /\.eq\("document_id", input\.documentId\)/);
  assert.match(src, /\.eq\("kind", kind\)/);
  /* Não inventa associação e não escreve nada. */
  assert.doesNotMatch(src, /deliverable_id/, "esta rodada não preenche deliverable_id");
  assert.doesNotMatch(src, /\.update\(|\.insert\(|\.delete\(/, "a guarda não muda dado");
  /* Só `approved` recusa. */
  assert.match(src, /!== "approved"\) return \{ editable: true \}/);
});

test("06 · ESTRUTURAL · os cinco pontos de mutação estão guardados", async () => {
  const lifecycle = semComentarios(await fonte(LIFECYCLE));
  const servidor = semComentarios(await fonte(SERVIDOR));

  /*
   * A asserção é sobre o CONDICIONAL, não sobre a presença dos nomes. Um
   * `if (false && !portao.editable)` mantém a chamada e o código de erro no
   * arquivo, e passaria numa busca por palavras — foi exatamente o mutante que
   * sobreviveu à primeira versão deste teste.
   */

  /* Briefing e upload: guarda consultada E o resultado barra, com erro canônico. */
  for (const fn of ["registerWriterMediaBrief", "uploadWriterMediaAsset"]) {
    const corpo = trecho(servidor, `export async function ${fn}`, "\n}\n");
    assert.match(corpo, /check(Media|Asset)TargetEditable/, `${fn} sem guarda`);
    assert.match(corpo, /\n\s*if \(!portao\.editable\) \{\s*\n\s*throw new WriterDeliverableError\("writer_deliverable_finalized"/,
      `${fn}: a guarda precisa barrar, não só ser chamada`);
  }

  /* Ancorar, substituir e editar briefing: idem, devolvendo desfecho. */
  for (const fn of ["anchorWriterMediaAsset", "replaceWriterMediaAsset", "updateWriterMediaBrief"]) {
    const corpo = trecho(lifecycle, `export async function ${fn}`, "\n}\n");
    assert.match(corpo, /checkAssetTargetEditable/, `${fn} sem guarda`);
    assert.match(corpo, /\n\s*if \(!portao\.editable\) return \{ status: "finalized", deliverableKind: portao\.deliverableKind \};/,
      `${fn}: a guarda precisa barrar, não só ser chamada`);
  }

  /*
   * PREVIEW NÃO É MUTAÇÃO. Consultar a imagem de um entregável finalizado é
   * exatamente o que o painel precisa fazer — guardar aqui reabriria o beco sem
   * saída por outro caminho.
   */
  const preview = trecho(lifecycle, "export async function signWriterMediaPreview", "\n}\n");
  assert.doesNotMatch(preview, /checkAssetTargetEditable|checkMediaTargetEditable/,
    "ler continua livre");
});

test("07 · ESTRUTURAL · a rota traduz a recusa, e a UI não é a única barreira", async () => {
  const rota = semComentarios(await fonte(ROTA));
  const guarda = semComentarios(await fonte(GUARDA));

  /* 409: recusa de estado, não erro de servidor. */
  assert.match(rota, /finalized: 409/);

  /*
   * A guarda vive no SERVIDOR. Uma chamada direta à rota, sem passar pela tela,
   * encontra a mesma recusa — é isso que torna a barreira real.
   */
  assert.match(guarda, /import "server-only"/);
  assert.match(guarda, /export async function checkMediaTargetEditable/);
  assert.match(guarda, /export async function checkAssetTargetEditable/);
});
