/**
 * ===== CORTE 6A.3 · SALVAR RASCUNHO DE ARTIGO NÃO CRIA HISTÓRICO =====
 *
 * A invariante canônica do projeto:
 *
 *   AUTOSAVE_CREATES_HISTORY = NO
 *   SAVE_DRAFT_CREATES_HISTORY = NO
 *   FINALIZATION_CREATES_HISTORY = YES
 *
 * O Artigo tem DOIS caminhos de gravação, e até a M6 eles discordavam:
 *
 *   TELA  PATCH /api/editorial/documents  → só versiona com createVersion=true
 *   MCP   save_writer_draft               → versionava SEMPRE, e retinha
 *
 * Duas naturezas de prova:
 *
 * COMPORTAMENTAL — exercita o contrato de entrada da rota da tela, que é código
 *                  puro e importável.
 * ESTRUTURAL     — lê a rota, o componente, a M6 e o wrapper como TEXTO. Prova
 *                  o que está escrito; a execução remota foi conferida por
 *                  readback e smoke, registrados no relatório do Corte 6A.3.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DocumentSaveInputSchema } from "../lib/editorial/persistence-contracts.ts";
import {
  finalizationDecisionFromReceipt, planRetentionAfterFinalization, verifyFinalizationReadback,
} from "../lib/redator/deliverable-lifecycle.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const ROTA_TELA = "../app/api/editorial/documents/route.ts";
const COMPONENTE = "../components/editorial/professional-writer.tsx";
const SERVIDOR = "../lib/server/writer-deliverables.ts";
const M6 = "../supabase/migrations/20260919050000_m6_writer_mcp_article_draft_no_history.sql";
const ORQUESTRACAO = "../lib/server/article-finalization.ts";

/** Comentário que explica uma ausência casa com a busca pela ausência. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const semComentariosSql = (src: string) => src.replace(/^\s*--.*$/gm, "");

const trecho = (src: string, de: string, ate?: string) => {
  const inicio = src.indexOf(de);
  assert.notEqual(inicio, -1, `trecho não encontrado: ${de}`);
  const fim = ate ? src.indexOf(ate, inicio) : -1;
  return fim === -1 ? src.slice(inicio) : src.slice(inicio, fim);
};

/* ======================= COMPORTAMENTAL ======================= */

test("01 · COMPORTAMENTAL · o contrato da rota da tela nasce sem versionar", () => {
  /*
   * A asserção é sobre o CAMPO, não sobre um documento inteiro montado à mão:
   * um fixture completo de `ContentDocumentSchema` envelheceria a cada campo
   * novo do contrato editorial e quebraria este teste por um motivo que não tem
   * nada a ver com versionar.
   *
   * O que importa: quem simplesmente salva — autosave ou botão — não menciona
   * `createVersion`, e o padrão precisa ser NÃO versionar.
   */
  assert.equal(DocumentSaveInputSchema.shape.createVersion.parse(undefined), false,
    "o padrão é NÃO versionar");
  assert.equal(DocumentSaveInputSchema.shape.changeReason.parse(undefined), "Autosave editorial.");

  /* Versionar exige pedir explicitamente. */
  assert.equal(DocumentSaveInputSchema.shape.createVersion.parse(true), true);
});

/* ======================= ESTRUTURAL ======================= */

test("02 · ESTRUTURAL · a rota da tela só versiona quando pedem", async () => {
  const src = semComentarios(await fonte(ROTA_TELA));

  /*
   * A rota não chama mais `repository.createVersion` direto: quem orquestra
   * versão + ponteiro + readback + retenção é `finalizeArticleVersion`. O que
   * não mudou, e é o que este teste guarda, é o CONDICIONAL.
   */
  assert.match(src, /const version = input\.createVersion\s*\?\s*await finalizeArticleVersion\(/,
    "sem o pedido explícito, nenhuma versão");
  assert.match(src, /:\s*null;/, "o ramo sem versão devolve null");
  assert.doesNotMatch(src, /repository\.createVersion\(/,
    "a criação de versão passa pela orquestração, não pela rota");
  /* E a rota da tela não inicia retenção de jeito nenhum. */
  assert.doesNotMatch(src, /markArticlePredecessorSuperseded|superseded|purge_after/);
});

test("03 · ESTRUTURAL · autosave e Salvar rascunho mandam false; só finalizar liga", async () => {
  const src = semComentarios(await fonte(COMPONENTE));

  /* O corpo da requisição carrega o flag, e o flag é um ref. */
  assert.match(src, /createVersion: createVersionRef\.current/);

  /*
   * O flag é ligado em UM lugar só: `requestStatus`, que é o que
   * `finalizeArticle` chama. Se aparecer um segundo, alguma outra ação passou a
   * criar histórico sem dizer.
   */
  assert.equal(src.split("createVersionRef.current = true").length - 1, 1,
    "só a mudança de estado pode ligar o versionamento");
  assert.match(src, /const requestStatus = \([\s\S]{0,600}?createVersionRef\.current = true/);
  assert.match(src, /const finalizeArticle = \(\) => requestStatus\("aprovado"\)/);

  /* `Salvar rascunho` desliga explicitamente antes de gravar. */
  assert.match(src, /flushRef\.current = true; createVersionRef\.current = false;/);
});

test("04 · ESTRUTURAL · M6 · o save do MCP não versiona e não move o ponteiro", async () => {
  const sql = semComentariosSql(await fonte(M6));
  const corpo = trecho(sql, "CREATE OR REPLACE FUNCTION public.writer_save_article_draft", "REVOKE ALL");

  assert.doesNotMatch(corpo, /INSERT INTO public\.content_document_versions/,
    "salvar rascunho não pode criar versão");
  assert.doesNotMatch(corpo, /current_version_id = v_version_id/,
    "salvar rascunho não pode mover o ponteiro");
  assert.doesNotMatch(corpo, /content_document_versions/,
    "o save não lê nem escreve a tabela de versões");
  assert.doesNotMatch(corpo, /superseded_at|purge_after/,
    "salvar rascunho não inicia retenção");

  /* O recibo devolve a corrente que JÁ existia. */
  assert.equal(corpo.split("'versionId', v_current.current_version_id").length - 1, 2,
    "os dois retornos devolvem a corrente existente");

  /* O UPDATE toca só estado corrente. */
  assert.match(corpo, /SET payload = p_payload, content_hash = p_content_hash,\s*status = 'writing', updated_by = p_actor_id/);

  /* Nada do que protegia foi enfraquecido. */
  for (const guarda of ["writer_document_not_found", "writer_approved_immutable",
                        "writer_draft_scope_invalid", "writer_lock_conflict"]) {
    assert.match(corpo, new RegExp(guarda), `a guarda ${guarda} não pode sumir`);
  }
  /* Escopo: o MCP só mexe em blocks, editorContent e status. */
  assert.match(corpo, /p_payload - 'blocks' - 'editorContent' - 'status'/);
});

test("05 · ESTRUTURAL · M6 · save_writer_draft não vira finalize implícito", async () => {
  const sql = semComentariosSql(await fonte(M6));
  const corpo = trecho(sql, "CREATE OR REPLACE FUNCTION public.writer_save_article_draft", "REVOKE ALL");

  /* O payload precisa declarar 'escrevendo'; aprovar por aqui é impossível. */
  assert.match(corpo, /p_payload->>'status' IS DISTINCT FROM 'escrevendo'/);

  /*
   * A prova de que o MCP não aprova é o que o UPDATE ESCREVE, não a ausência da
   * palavra: 'approved' aparece de propósito na GUARDA que recusa editar
   * documento já finalizado. Procurar a palavra solta reprovaria a guarda.
   */
  const inicioSet = corpo.indexOf("SET payload");
  /*
   * O `WHERE id = p_document_id` aparece ANTES, no SELECT ... FOR UPDATE. Buscar
   * a partir do SET é o que delimita o UPDATE; um `indexOf` do zero devolveria
   * um índice menor que o início e a fatia sairia vazia — aprovando qualquer
   * coisa por fatia vazia.
   */
  const clausulaSet = corpo.slice(inicioSet, corpo.indexOf("WHERE id = p_document_id", inicioSet));
  assert.ok(clausulaSet.includes("updated_by"), "a cláusula SET precisa ter sido encontrada");
  assert.match(clausulaSet, /status = 'writing'/, "o único status que o save escreve é 'writing'");
  assert.doesNotMatch(clausulaSet, /approved|aprovado/, "o MCP não aprova documento");

  /* E a guarda de aprovado continua recusando editar o que já foi finalizado. */
  assert.match(corpo, /v_current\.status = 'approved' OR v_current\.payload->>'status' = 'aprovado'/);
});

test("06 · ESTRUTURAL · o wrapper do MCP não marca retenção", async () => {
  const src = semComentarios(await fonte(SERVIDOR));
  const save = trecho(src, "export async function saveWriterArticleDraft",
    "export async function saveWriterDeliverable");

  assert.doesNotMatch(save, /markArticlePredecessorSuperseded/,
    "salvar rascunho pelo MCP não inicia retenção");
  assert.doesNotMatch(save, /superseded|purge_after|retention/i);

  /* O que ficou: o readback, que agora afirma que o ponteiro não se moveu. */
  assert.match(save, /readback\.data\.current_version_id !== receipt\.versionId/);
  assert.match(save, /readback_mismatch/);

  /* E o módulo inteiro deixou de importar a marcação do artigo. */
  assert.doesNotMatch(src, /import \{[^}]*markArticlePredecessorSuperseded/);
});

test("07 · ESTRUTURAL · M6 · substitui uma função e não toca em mais nada", async () => {
  const bruto = await fonte(M6);
  const sql = semComentariosSql(bruto);

  assert.equal(sql.split("CREATE OR REPLACE FUNCTION").length - 1, 1);
  assert.doesNotMatch(sql, /ALTER TABLE|ADD COLUMN|DROP COLUMN|CREATE TABLE|CREATE INDEX|CREATE TRIGGER|CREATE TYPE/i);
  /* Não toca a finalização do Artigo nem o lifecycle do entregável. */
  assert.doesNotMatch(sql, /writer_finalize_deliverable|writer_save_deliverable|writer_reopen_deliverable/);
  assert.doesNotMatch(sql, /createVersion|ContentDocumentRepository/);
  for (const fora of ["minerador", "arquiteto", "radar", "writer_media_assets",
                      "publication", "pg_cron"]) {
    assert.ok(!new RegExp(fora, "i").test(sql), `a M6 não pode tocar em ${fora}`);
  }

  /* Segurança reafirmada. */
  assert.match(sql, /SECURITY DEFINER SET search_path = public, pg_temp/);
  assert.ok(sql.includes("FROM PUBLIC, anon, authenticated, service_role;"));
  assert.ok(sql.includes("TO service_role;"));

  /* Pré-flight que recusa um mundo diferente do auditado. */
  assert.match(sql, /m6_preflight_funcao_ausente/);
  assert.match(sql, /m6_preflight_ha_historico_de_mcp/);
  assert.match(bruto, /^BEGIN;/m);
  assert.match(bruto, /^COMMIT;/m);
});

test("08 · ESTRUTURAL · o rollback repõe o versionamento e avisa do wrapper", async () => {
  const rb = await fonte("../supabase/scripts/2026-09-19-m6-rollback-writer-save-article-draft.sql");
  const sem = semComentariosSql(rb);

  /* Ele traz de volta exatamente o que a M6 tira. */
  assert.match(sem, /INSERT INTO public\.content_document_versions/);
  assert.match(sem, /current_version_id = v_version_id/);
  assert.match(sem, /'Rascunho salvo via MCP\.'/);
  /* E preserva as guardas, que a M6 também preservou. */
  assert.match(sem, /writer_draft_scope_invalid/);

  /* Reverter só o SQL reabre o defeito pela metade: o arquivo precisa dizer. */
  assert.match(rb, /lib\/server\/writer-deliverables\.ts/);
  assert.match(rb, /REVERTER SIGNIFICA REPOR O DEFEITO/);

  /* E a M6 aponta para ele. */
  assert.match(await fonte(M6), /2026-09-19-m6-rollback-writer-save-article-draft\.sql/);
});

/* =============================================================================
 * CORTE 6A.4 · A RETENÇÃO M2 NA FINALIZAÇÃO DO ARTIGO
 *
 * O defeito não era a chamada faltando: `content_documents.current_version_id`
 * não era escrito por ninguém, e a guarda `retention_successor_not_current` da
 * RPC da M2 nunca podia passar.
 * ========================================================================== */

test("09 · COMPORTAMENTAL · primeira finalização do artigo: A, sem predecessora a reter", () => {
  const recibo = { versionId: "A", previousVersionId: null, contentHash: "hash-A", unchanged: false };

  assert.deepEqual(finalizationDecisionFromReceipt(recibo), { action: "create_version", previousVersionId: null });
  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "approved", currentVersionId: "A", contentHash: "hash-A" }, receipt: recibo,
  }), { ok: true });
  assert.deepEqual(planRetentionAfterFinalization({
    decision: { action: "create_version", previousVersionId: null },
    readbackCurrentVersionId: "A", createdVersionId: "A",
  }), { mark: false, reason: "no_predecessor" });
});

test("10 · COMPORTAMENTAL · refinalização com mudança: readback confirma B, e só então A", () => {
  const recibo = { versionId: "B", previousVersionId: "A", contentHash: "hash-B", unchanged: false };

  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "approved", currentVersionId: "B", contentHash: "hash-B" }, receipt: recibo,
  }), { ok: true }, "o ponteiro tem que ter ido para B");

  assert.deepEqual(planRetentionAfterFinalization({
    decision: { action: "create_version", previousVersionId: "A" },
    readbackCurrentVersionId: "B", createdVersionId: "B",
  }), { mark: true, predecessorVersionId: "A", successorVersionId: "B" });
});

test("11 · COMPORTAMENTAL · readback falho → A não entra em retenção", () => {
  const recibo = { versionId: "B", previousVersionId: "A", contentHash: "hash-B", unchanged: false };

  /* O caso que motivou a rodada: o ponteiro não se moveu. */
  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "approved", currentVersionId: null, contentHash: "hash-B" }, receipt: recibo,
  }), { ok: false, reason: "current_version_mismatch" });

  for (const [readback, motivo] of [
    [{ status: "writing", currentVersionId: "B", contentHash: "hash-B" }, "status_not_approved"],
    [{ status: "approved", currentVersionId: "A", contentHash: "hash-B" }, "current_version_mismatch"],
    [{ status: "approved", currentVersionId: "B", contentHash: "outro" }, "hash_mismatch"],
  ] as const) {
    assert.deepEqual(verifyFinalizationReadback({ readback, receipt: recibo }), { ok: false, reason: motivo });
  }
  assert.deepEqual(verifyFinalizationReadback({ readback: null, receipt: recibo }), { ok: false, reason: "not_found" });

  /* E a decisão de retenção recusa quando a corrente não é a criada. */
  assert.deepEqual(planRetentionAfterFinalization({
    decision: { action: "create_version", previousVersionId: "A" },
    readbackCurrentVersionId: null, createdVersionId: "B",
  }), { mark: false, reason: "readback_failed" });
});

test("12 · COMPORTAMENTAL · enviar para revisão também grava versão, e o readback aceita", () => {
  /*
   * `requestStatus("em_revisao")` liga `createVersion` igual à aprovação, e a
   * coluna guarda `in_review`. Exigir `approved` ali reprovaria uma gravação
   * correta, e a retenção seria pulada por um motivo inventado.
   */
  const recibo = { versionId: "B", previousVersionId: "A", contentHash: "hash-B", unchanged: false };

  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "in_review", currentVersionId: "B", contentHash: "hash-B" },
    receipt: recibo, expectedStatus: "in_review",
  }), { ok: true });

  /* O padrão continua `approved`: nada foi afrouxado para o entregável. */
  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "in_review", currentVersionId: "B", contentHash: "hash-B" }, receipt: recibo,
  }), { ok: false, reason: "status_not_approved" });
});

test("13 · ESTRUTURAL · a ordem da finalização do artigo", async () => {
  /*
   * A busca é no CORPO da função, não no arquivo: os nomes também aparecem no
   * bloco de `import` do topo, e um `indexOf` do arquivo inteiro acharia lá —
   * reprovando uma ordem correta, ou pior, aprovando uma errada.
   */
  const src = trecho(semComentarios(await fonte(ORQUESTRACAO)),
    "export async function finalizeArticleVersion");

  const passos = ["createVersion", "promoteVersionToCurrent", "readFinalizationState",
                  "verifyFinalizationReadback", "planRetentionAfterFinalization",
                  "markArticlePredecessorSuperseded"];
  for (const passo of passos) {
    assert.match(src, new RegExp(passo), `falta o passo ${passo}`);
  }
  const ordem = passos.map(nome => src.indexOf(nome));
  for (let i = 1; i < ordem.length; i++) {
    assert.ok(ordem[i] > ordem[i - 1], `${passos[i]} tem que vir depois de ${passos[i - 1]}`);
  }

  /* Readback reprovado devolve ANTES de qualquer marcação. */
  assert.match(src, /if \(!conferencia\.ok\)[\s\S]{0,200}return[\s\S]{0,120}readback_failed/);
  assert.ok(src.indexOf("readback_failed") < src.indexOf("markArticlePredecessorSuperseded"));

  /* Nunca se compensa apagando a versão nova. */
  assert.doesNotMatch(src, /\.delete\(|DELETE|rollback/i);
  /* E finalizar não entrega. */
  assert.doesNotMatch(src, /publication/i);
});

test("14 · ESTRUTURAL · só a finalização marca; o save não", async () => {
  const rota = semComentarios(await fonte(ROTA_TELA));
  const servidor = semComentarios(await fonte(SERVIDOR));

  /* A orquestração só roda sob `createVersion`. */
  assert.match(rota, /const version = input\.createVersion\s*\?\s*await finalizeArticleVersion\(/);
  assert.equal(rota.split("finalizeArticleVersion(").length - 1, 1, "chamada em um lugar só");
  assert.match(rota, /import \{ finalizeArticleVersion \} from "@\/lib\/server\/article-finalization";/);
  /* A rota em si não conhece retenção. */
  assert.doesNotMatch(rota, /markArticlePredecessorSuperseded|superseded|purge_after/);

  /* E o save do MCP continua sem marcar (a M6 vale). */
  const save = trecho(servidor, "export async function saveWriterArticleDraft",
    "export async function saveWriterDeliverable");
  assert.doesNotMatch(save, /markArticlePredecessorSuperseded|finalizeArticleVersion/);
});

test("15 · ESTRUTURAL · finalizar sem mudança material não retém a predecessora", async () => {
  /* Corpo da função, pelo mesmo motivo do teste 13. */
  const src = trecho(semComentarios(await fonte(ORQUESTRACAO)),
    "export async function finalizeArticleVersion");

  /*
   * A rota não recusa uma segunda finalização com o mesmo conteúdo — gap
   * registrado, não corrigido aqui. O que NÃO pode acontecer é ela condenar uma
   * versão boa à exclusão: se a predecessora tem hash idêntico, não se marca.
   */
  assert.match(src, /versionContentHash\(input\.documentId, passo\.predecessorVersionId\)/);
  assert.match(src, /predecessorHash === input\.contentHash/);
  assert.match(src, /no_material_change/);
  assert.ok(src.indexOf("no_material_change") < src.indexOf("markArticlePredecessorSuperseded"),
    "a guarda vem antes da marcação");
});
