/**
 * ===== CORTE 6A.8 · UMA AÇÃO QUE FALHA PRECISA PARECER QUE FALHOU =====
 *
 * A linha de estado do entregável usava SEMPRE `text-text-muted`. Um 409, um 401
 * ou um 500 em "Reabrir para edição" apareciam na mesma cor e no mesmo lugar que
 * "Sem alterações pendentes", truncados em `max-w-64`.
 *
 * COMPORTAMENTAL — a tabela de tom, a tradução da falha e o rótulo em curso.
 * ESTRUTURAL     — a barra e o ambiente, lidos como texto, com uma asserção que
 *                  impede o `muted` fixo de voltar.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  FEEDBACK_TEXT_CLASS, actionButtonLabel, describeActionFailure, feedbackClass,
  feedbackWidthClass, progressMessage, toneForHttpStatus, toneForSaveState,
} from "../lib/redator/action-feedback.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const BARRA = "../components/editorial/professional-writer.tsx";
const AMBIENTE = "../modules/redator/writer-derived-environment.tsx";

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

test("01 · COMPORTAMENTAL · a semântica do Artigo vale para os dois", () => {
  assert.equal(toneForSaveState("idle"), "neutro");
  assert.equal(toneForSaveState("dirty"), "neutro");
  assert.equal(toneForSaveState("saving"), "progresso");
  assert.equal(toneForSaveState("saved_server"), "sucesso");
  assert.equal(toneForSaveState("saved_local"), "sucesso");
  assert.equal(toneForSaveState("conflict"), "erro");
  assert.equal(toneForSaveState("error"), "erro");

  /* Cada tom tem UMA classe, e erro e sucesso não podem colidir com neutro. */
  assert.equal(FEEDBACK_TEXT_CLASS.neutro, "text-text-muted");
  assert.notEqual(FEEDBACK_TEXT_CLASS.erro, FEEDBACK_TEXT_CLASS.neutro);
  assert.notEqual(FEEDBACK_TEXT_CLASS.sucesso, FEEDBACK_TEXT_CLASS.neutro);
  assert.notEqual(FEEDBACK_TEXT_CLASS.progresso, FEEDBACK_TEXT_CLASS.neutro);
  assert.equal(new Set(Object.values(FEEDBACK_TEXT_CLASS)).size, 4, "quatro tons distinguíveis");
});

test("02 · COMPORTAMENTAL · o tom vem do código HTTP", () => {
  for (const ok of [200, 201, 204, 299]) assert.equal(toneForHttpStatus(ok), "sucesso");

  /*
   * A faixa 3xx entra aqui de propósito. Sem ela, mover a fronteira de 300 para
   * 400 passaria despercebido — e um 302 para a tela de login viraria "sucesso",
   * que é justamente o tipo de falha silenciosa que este corte veio fechar.
   */
  for (const ruim of [300, 302, 307, 400, 401, 403, 404, 409, 500, 502, 503]) {
    assert.equal(toneForHttpStatus(ruim), "erro", `${ruim} precisa pintar de erro`);
  }
});

test("03 · COMPORTAMENTAL · a mensagem do servidor não é engolida", () => {
  /* 409 com motivo real: é ele que aparece, não um texto genérico. */
  const conflito = describeActionFailure({
    status: 409, body: { error: "O entregável aprovado não pode ser sobrescrito." },
  });
  assert.deepEqual(conflito, {
    tone: "erro", conflito: true,
    mensagem: "O entregável aprovado não pode ser sobrescrito.",
  });

  /* Sem `error`, o `code` serve — melhor que inventar. */
  assert.equal(describeActionFailure({ status: 409, body: { code: "writer_lock_conflict" } }).mensagem,
    "writer_lock_conflict");

  /* Sem corpo legível, o mapa por status dá algo acionável. */
  assert.match(describeActionFailure({ status: 401, body: null }).mensagem, /Sessão expirada/);
  assert.match(describeActionFailure({ status: 403, body: null }).mensagem, /Sem permissão/);
  assert.match(describeActionFailure({ status: 503, body: null }).mensagem, /indisponível/);

  /* E um 500 sem corpo ainda diz o que houve, com o código. */
  const quinhentos = describeActionFailure({ status: 500, body: null });
  assert.equal(quinhentos.tone, "erro");
  assert.equal(quinhentos.conflito, false);
  assert.match(quinhentos.mensagem, /HTTP 500/);

  /* Conflito é distinguível de falha genérica — mesmo tom, dado separado. */
  assert.equal(describeActionFailure({ status: 409, body: null }).conflito, true);
  assert.equal(describeActionFailure({ status: 401, body: null }).conflito, false);

  /* Corpo com campo vazio não vira mensagem vazia. */
  assert.match(describeActionFailure({ status: 500, body: { error: "   " } }).mensagem, /HTTP 500/);
});

test("04 · COMPORTAMENTAL · erro não desaparece em reticências", () => {
  /* Neutro pode truncar curto; erro precisa de espaço. */
  assert.equal(feedbackWidthClass("neutro"), "max-w-64");
  assert.equal(feedbackWidthClass("sucesso"), "max-w-64");
  assert.equal(feedbackWidthClass("progresso"), "max-w-64");
  assert.notEqual(feedbackWidthClass("erro"), "max-w-64");

  /* A classe montada carrega tom e largura juntos. */
  assert.match(feedbackClass("erro"), /text-danger/);
  assert.match(feedbackClass("erro"), /max-w-md/);
  assert.match(feedbackClass("neutro"), /text-text-muted/);
});

test("05 · COMPORTAMENTAL · o botão em curso diz o que está fazendo", () => {
  assert.equal(progressMessage("salvar"), "Salvando…");
  assert.equal(progressMessage("finalizar"), "Finalizando…");
  assert.equal(progressMessage("reabrir"), "Reabrindo…");

  /* Só o botão da ação em curso muda de rótulo. */
  assert.equal(actionButtonLabel({ action: "reabrir", emCurso: "reabrir", rotuloParado: "Reabrir para edição" }),
    "Reabrindo…");
  assert.equal(actionButtonLabel({ action: "reabrir", emCurso: "finalizar", rotuloParado: "Reabrir para edição" }),
    "Reabrir para edição");
  assert.equal(actionButtonLabel({ action: "finalizar", emCurso: null, rotuloParado: "Finalizar roteiro" }),
    "Finalizar roteiro");
});

/* ======================= ESTRUTURAL ======================= */

test("06 · ESTRUTURAL · a linha do entregável não pode voltar a ser sempre muted", async () => {
  const src = semComentarios(await fonte(BARRA));
  const acoes = trecho(src, "data-redator-deliverable-actions", "data-redator-document-actions");

  /*
   * ESTA é a asserção que guarda o defeito de três readbacks. Se alguém fixar a
   * cor de novo, ela reprova.
   */
  assert.doesNotMatch(acoes, /truncate text-text-muted/,
    "a cor da mensagem do entregável não pode ser fixa");
  assert.match(acoes, /feedbackClass\(deliverableBar\.tom\)/);

  /* O texto inteiro fica acessível mesmo quando a barra trunca. */
  assert.match(acoes, /title=\{deliverableBar\.mensagem \|\| undefined\}/);
  /* E o erro é anunciado, não só colorido. */
  assert.match(acoes, /role=\{deliverableBar\.tom === "erro" \? "alert" : "status"\}/);
  assert.match(acoes, /data-deliverable-feedback=\{deliverableBar\.tom\}/);
});

test("07 · ESTRUTURAL · uma convenção só: o Artigo usa a mesma tabela", async () => {
  const src = semComentarios(await fonte(BARRA));

  /* O ternário de cor escrito à mão saiu — era a fonte da duplicação. */
  assert.doesNotMatch(src, /saveState === "conflict" \|\| saveState === "error" \? "text-danger"/,
    "a convenção do artigo precisa vir do módulo, não do JSX");
  assert.match(src, /feedbackClass\(toneForSaveState\(saveState\)\)/);

  /* Os dois lados chamam a MESMA função. */
  assert.equal(src.split("feedbackClass(").length - 1, 2);
});

test("08 · ESTRUTURAL · toda ação produz estado, e a falha não vira sucesso", async () => {
  const src = semComentarios(await fonte(AMBIENTE));

  /*
   * As ações que a tela dispara. `semear` entrou no corte da semeadura e passou
   * a contar aqui — as contagens abaixo são POR AÇÃO, então elas se derivam
   * desta lista em vez de repetir um número solto que ninguém sabe de onde veio.
   */
  const ACOES = ["salvar", "finalizar", "reabrir", "semear"] as const;
  /** `salvar`, `acao` e `semear` — três blocos com o mesmo par de linhas. */
  const BLOCOS_COM_FALHA = 3;

  /* Progresso antes de sair, tom e mensagem em cada desfecho. */
  for (const acao of ACOES) {
    assert.ok(src.includes(`progressMessage("${acao}")`) || src.includes("progressMessage(qual)"),
      `${acao} precisa anunciar progresso`);
  }
  assert.match(src, /setTom\("progresso"\)/);
  assert.match(src, /setTom\("sucesso"\)/);

  /*
   * O ponto crítico: numa resposta não-2xx o código RETORNA antes de `load()` e
   * antes de qualquer mensagem de sucesso. Um `throw` genérico apagaria o motivo
   * do servidor; um `load()` sobrescreveria o rascunho que a pessoa ainda tem.
   */
  /*
   * CONTAR, não casar. `save` e `acao` têm o mesmo par de linhas, e um
   * `assert.match` encontraria o do `save` mesmo com o da `acao` quebrado —
   * foi exatamente o mutante que sobreviveu à primeira versão deste teste.
   */
  const falhas = src.split("describeActionFailure({ status: response.status, body });").length - 1;
  assert.equal(falhas, BLOCOS_COM_FALHA, "toda ação traduz a falha do servidor");

  const retornosAposFalha =
    src.split(/setTom\(falha\.tone\); setMessage\(falha\.mensagem\);\s*\n\s*return;/).length - 1;
  assert.equal(retornosAposFalha, BLOCOS_COM_FALHA,
    "TODOS os caminhos precisam retornar antes de load() e de qualquer sucesso");

  /* O corpo de erro é lido sem derrubar a tela se não for JSON. */
  assert.equal(src.split("await response.json().catch(() => null)").length - 1, BLOCOS_COM_FALHA);

  /* Trava de clique duplo nos dois caminhos, não em um. */
  assert.equal(src.split("finally { setBusy(false); setAcaoEmCurso(null); }").length - 1, BLOCOS_COM_FALHA,
    "toda ação precisa liberar a trava");
  assert.equal(src.split("setAcaoEmCurso(").length - 1, BLOCOS_COM_FALHA * 2,
    "cada ação marca o início e libera no finally");
});

test("09 · ESTRUTURAL · o motivo inteiro aparece sem DevTools", async () => {
  const src = semComentarios(await fonte(AMBIENTE));

  /* Bloco contextual no corpo, onde há largura e quebra de linha. */
  assert.match(src, /\{tom === "erro" && message && <div role="alert" data-deliverable-erro/);
  assert.match(src, /break-words/);
  assert.match(src, /A ação não foi concluída\./);

  /* E ele fica FORA do trecho travado por finalizado: erro precisa aparecer sempre. */
  const corpo = trecho(src, "data-deliverable-erro", "<header");
  assert.doesNotMatch(corpo, /disabled=/);
});
