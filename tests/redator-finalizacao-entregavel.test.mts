/**
 * ===== CORTE 6A.1 · FINALIZAR E REABRIR ROTEIRO E CARROSSEL =====
 *
 * Duas naturezas de prova, e o nome de cada teste diz qual é:
 *
 * COMPORTAMENTAL — exercita as regras puras que o wrapper server-side CONSULTA
 *                  para decidir. Provam a decisão de verdade, sem banco.
 * ESTRUTURAL     — lê `lib/server`, a rota e a tela como TEXTO. Provam que o
 *                  wrapper delega a essas regras e na ordem certa; não provam
 *                  que o Postgres executou.
 *
 * O smoke de banco da M4 (relatório pós-aplicação de 2026-09-19) já exercitou
 * o fluxo remoto inteiro. O que nenhum teste deste arquivo prova é a homologação
 * pela tela — essa é do usuário.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  applyDraftSave, finalizationCreatesPublicationRecord, finalizationDecisionFromReceipt,
  planDraftSave, planFinalization, planRetentionAfterFinalization, planReopen,
  verifyFinalizationReadback, verifyReopenReadback,
  type DeliverableState,
} from "../lib/redator/deliverable-lifecycle.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const SERVIDOR = "../lib/server/writer-deliverables.ts";
const ROTA = "../app/api/redator/deliverables/route.ts";
const AMBIENTE = "../modules/redator/writer-derived-environment.tsx";
const BARRA = "../components/editorial/professional-writer.tsx";
const M5 = "../supabase/migrations/20260919043000_m5_writer_deliverable_finalize_idempotency.sql";

/**
 * Comentário que EXPLICA uma ausência casa com a busca pela ausência. Já custou
 * três falsos negativos neste projeto, então some antes de qualquer procura.
 */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const trecho = (src: string, de: string, ate?: string) => {
  const inicio = src.indexOf(de);
  assert.notEqual(inicio, -1, `trecho não encontrado: ${de}`);
  const fim = ate ? src.indexOf(ate, inicio) : -1;
  return fim === -1 ? src.slice(inicio) : src.slice(inicio, fim);
};

const estado = (o: Partial<DeliverableState> = {}): DeliverableState => ({
  status: "draft", contentHash: "hash-1", currentVersionId: null,
  currentVersionHash: null, lockVersion: 1, ...o,
});

/* ======================= COMPORTAMENTAL ======================= */

test("01 · COMPORTAMENTAL · save com corrente = A não versiona nem move a corrente", () => {
  /*
   * Este é o caso que motivou o corte: depois de FINAL_A + reopen, a corrente
   * continua A. Se o save tratasse A como "sucessor confirmado", a marcação
   * abriria a janela de 48h sobre o predecessor de A por causa de um autosave.
   */
  const reaberto = estado({ status: "draft", contentHash: "hash-A", currentVersionId: "A", currentVersionHash: "hash-A" });
  const decisao = planDraftSave({ state: reaberto, nextContentHash: "hash-B", expectedLock: 1 });
  assert.equal(decisao.allowed, true);
  assert.equal(decisao.allowed && decisao.createsVersion, false);
  assert.equal(decisao.allowed && decisao.movesCurrentVersion, false);

  const r = applyDraftSave({ state: reaberto, nextContentHash: "hash-B", expectedLock: 1 });
  assert.equal(r.saved, true);
  assert.deepEqual(r.saved && r.createdVersionIds, []);
  assert.equal(r.saved && r.next.currentVersionId, "A");
});

test("02 · COMPORTAMENTAL · primeira finalização: A, approved, sem predecessor a reter", () => {
  const recibo = { versionId: "A", previousVersionId: null, contentHash: "hash-A", status: "approved", unchanged: false };
  const decisao = finalizationDecisionFromReceipt(recibo);
  assert.deepEqual(decisao, { action: "create_version", previousVersionId: null });

  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "approved", currentVersionId: "A", contentHash: "hash-A" }, receipt: recibo,
  }), { ok: true });

  assert.deepEqual(planRetentionAfterFinalization({
    decision: decisao, readbackCurrentVersionId: "A", createdVersionId: "A",
  }), { mark: false, reason: "no_predecessor" }, "não existe predecessor para reter");
});

test("03 · COMPORTAMENTAL · refinalizar já finalizado devolve A e não retém ninguém", () => {
  const recibo = { versionId: "A", previousVersionId: null, contentHash: "hash-A", status: "approved", unchanged: true };
  const decisao = finalizationDecisionFromReceipt(recibo);
  assert.deepEqual(decisao, { action: "unchanged", versionId: "A" });
  assert.deepEqual(planRetentionAfterFinalization({
    decision: decisao, readbackCurrentVersionId: "A", createdVersionId: null,
  }), { mark: false, reason: "unchanged_finalization" });

  /* E a regra de finalização concorda, partindo do estado. */
  assert.deepEqual(planFinalization({
    state: estado({ status: "approved", contentHash: "hash-A", currentVersionId: "A", currentVersionHash: "hash-A" }),
    expectedLock: 1,
  }), { action: "unchanged", versionId: "A" });
});

test("04 · COMPORTAMENTAL · reabrir volta a draft e não pode perder a última final", () => {
  assert.deepEqual(planReopen(estado({ status: "approved", currentVersionId: "A" })), { action: "reopen" });
  assert.deepEqual(planReopen(estado({ status: "draft" })), { action: "unchanged", status: "draft" });

  assert.deepEqual(verifyReopenReadback({
    readback: { status: "draft", currentVersionId: "A" }, currentVersionIdBefore: "A",
  }), { ok: true });

  /* Voltar draft com a corrente trocada é perda silenciosa: recusa. */
  assert.deepEqual(verifyReopenReadback({
    readback: { status: "draft", currentVersionId: null }, currentVersionIdBefore: "A",
  }), { ok: false, reason: "lost_last_final" });
  assert.deepEqual(verifyReopenReadback({
    readback: { status: "approved", currentVersionId: "A" }, currentVersionIdBefore: "A",
  }), { ok: false, reason: "status_not_draft" });
  assert.deepEqual(verifyReopenReadback({ readback: null, currentVersionIdBefore: "A" }),
    { ok: false, reason: "not_found" });
});

test("05 · COMPORTAMENTAL · N saves depois do reopen: corrente continua A, zero versões", () => {
  let atual = estado({ status: "draft", contentHash: "hash-A", currentVersionId: "A", currentVersionHash: "hash-A" });
  for (const hash of ["hash-B1", "hash-B2", "hash-B3"]) {
    const r = applyDraftSave({ state: atual, nextContentHash: hash, expectedLock: atual.lockVersion });
    assert.equal(r.saved, true, `save de ${hash}`);
    if (!r.saved) return;
    assert.deepEqual(r.createdVersionIds, []);
    assert.equal(r.next.currentVersionId, "A");
    atual = r.next;
  }
  /* A continua sendo a última finalização canônica, e não foi substituída. */
  assert.equal(atual.currentVersionId, "A");
  assert.deepEqual(planFinalization({ state: atual, expectedLock: atual.lockVersion }),
    { action: "create_version", previousVersionId: "A" });
});

test("06 · COMPORTAMENTAL · M5 · reopen → finalizar sem editar reusa A, sem retenção", () => {
  /*
   * A M5 devolve o status a `approved` reusando a versão corrente e diz
   * `unchanged: true` — o MESMO campo que o ramo já-aprovado usa. O wrapper não
   * precisa de `if` novo: a decisão de retenção já recusa marcar quem não foi
   * substituído.
   */
  const recibo = { versionId: "A", previousVersionId: null, contentHash: "hash-A",
    status: "approved", unchanged: true };

  assert.deepEqual(finalizationDecisionFromReceipt(recibo), { action: "unchanged", versionId: "A" });

  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "approved", currentVersionId: "A", contentHash: "hash-A" }, receipt: recibo,
  }), { ok: true }, "o readback confirma approved com A ainda corrente");

  assert.deepEqual(planRetentionAfterFinalization({
    decision: { action: "unchanged", versionId: "A" },
    readbackCurrentVersionId: "A", createdVersionId: null,
  }), { mark: false, reason: "unchanged_finalization" }, "A não pode entrar em retenção");
});

test("07 · COMPORTAMENTAL · reopen → editar → finalizar: B.previous = A, e só então A é retida", () => {
  const recibo = { versionId: "B", previousVersionId: "A", contentHash: "hash-B", status: "approved", unchanged: false };
  const decisao = finalizationDecisionFromReceipt(recibo);
  assert.deepEqual(decisao, { action: "create_version", previousVersionId: "A" });

  assert.deepEqual(verifyFinalizationReadback({
    readback: { status: "approved", currentVersionId: "B", contentHash: "hash-B" }, receipt: recibo,
  }), { ok: true }, "o readback confirma B como corrente");

  assert.deepEqual(planRetentionAfterFinalization({
    decision: decisao, readbackCurrentVersionId: "B", createdVersionId: "B",
  }), { mark: true, predecessorVersionId: "A", successorVersionId: "B" });
});

test("08 · COMPORTAMENTAL · readback falho em qualquer das três perguntas → A não é retida", () => {
  const recibo = { versionId: "B", previousVersionId: "A", contentHash: "hash-B", unchanged: false };

  const falhas = [
    [{ status: "draft", currentVersionId: "B", contentHash: "hash-B" }, "status_not_approved"],
    [{ status: "approved", currentVersionId: "A", contentHash: "hash-B" }, "current_version_mismatch"],
    [{ status: "approved", currentVersionId: "B", contentHash: "outro" }, "hash_mismatch"],
  ] as const;
  for (const [readback, motivo] of falhas) {
    assert.deepEqual(verifyFinalizationReadback({ readback, receipt: recibo }), { ok: false, reason: motivo });
  }
  assert.deepEqual(verifyFinalizationReadback({ readback: null, receipt: recibo }), { ok: false, reason: "not_found" });

  /* E a decisão de retenção também recusa quando a corrente não é a criada. */
  assert.deepEqual(planRetentionAfterFinalization({
    decision: { action: "create_version", previousVersionId: "A" },
    readbackCurrentVersionId: "A", createdVersionId: "B",
  }), { mark: false, reason: "readback_failed" });
});

test("09 · COMPORTAMENTAL · a marcação é o ÚLTIMO passo: falhar nela não desfaz B", async () => {
  /* A decisão já foi tomada e carrega os dois ids; nada nela fala em desfazer. */
  const passo = planRetentionAfterFinalization({
    decision: { action: "create_version", previousVersionId: "A" },
    readbackCurrentVersionId: "B", createdVersionId: "B",
  });
  assert.deepEqual(passo, { mark: true, predecessorVersionId: "A", successorVersionId: "B" });

  /* E a função de marcação NUNCA lança: ela devolve desfecho. */
  const retencao = semComentarios(await fonte("../lib/server/writer-retention.ts"));
  const marcar = trecho(retencao, "export async function markDeliverablePredecessorSuperseded");
  assert.match(marcar, /catch \(erro\)[\s\S]{0,200}return outcomeFromRpcError/);
  assert.doesNotMatch(marcar, /\bthrow\b/, "marcar não pode derrubar uma finalização já confirmada");
});

test("10 · COMPORTAMENTAL · finalizar não cria PublicationRecord", () => {
  assert.equal(finalizationCreatesPublicationRecord(), false);
});

/* ======================= ESTRUTURAL ======================= */

test("11 · ESTRUTURAL · o save não chama mais a marcação de retenção", async () => {
  const src = semComentarios(await fonte(SERVIDOR));
  const save = trecho(src, "export async function saveWriterDeliverable", "export type WriterDeliverableKind");

  assert.doesNotMatch(save, /markDeliverablePredecessorSuperseded/,
    "salvar rascunho não pode iniciar retenção");
  assert.doesNotMatch(save, /writer_finalize_deliverable|writer_reopen_deliverable/,
    "o save não finaliza nem reabre por atalho");
  /* O que o save preserva: readback e a conferência de que a corrente não moveu. */
  assert.match(save, /readback_mismatch/);
  assert.match(save, /currentVersionId !== result\.versionId/);
});

test("12 · ESTRUTURAL · a finalização confere o readback ANTES de marcar", async () => {
  const src = semComentarios(await fonte(SERVIDOR));
  const finalize = trecho(src, "export async function finalizeWriterDeliverable",
    "export async function reopenWriterDeliverable");

  const passos = ["writer_finalize_deliverable", "verifyFinalizationReadback",
                  "planRetentionAfterFinalization", "markDeliverablePredecessorSuperseded"];
  for (const passo of passos) {
    assert.match(finalize, new RegExp(passo), `falta o passo ${passo}`);
  }

  /*
   * M5 · a recusa por "nada mudou" saiu, e não pode voltar: ela IMPEDIRIA o
   * caminho B da RPC, que é justamente o certo.
   */
  assert.doesNotMatch(finalize, /precheckFinalization|finalization_without_change/,
    "a autoridade sobre finalizar sem mudança é da RPC, não do wrapper");

  /* A ordem é a garantia, não a presença. */
  const ordem = passos.map(nome => finalize.indexOf(nome));
  for (let i = 1; i < ordem.length; i++) {
    assert.ok(ordem[i] > ordem[i - 1], "readback e plano vêm antes da marcação");
  }

  /* Readback reprovado interrompe antes de qualquer marcação. */
  assert.ok(finalize.indexOf("conferencia.ok") < finalize.indexOf("markDeliverablePredecessorSuperseded"));
  assert.match(finalize, /if \(!conferencia\.ok\)[\s\S]{0,200}throw new WriterDeliverableError\("readback_mismatch"/);

  /* Nunca se compensa apagando a versão nova. */
  assert.doesNotMatch(finalize, /\.delete\(|DELETE|rollback/i);
  /* E finalizar não toca em Publicações. */
  assert.doesNotMatch(finalize, /publication/i);
});

test("13 · ESTRUTURAL · reabrir não cria versão nem inicia retenção", async () => {
  const src = semComentarios(await fonte(SERVIDOR));
  const reopen = trecho(src, "export async function reopenWriterDeliverable");

  assert.match(reopen, /writer_reopen_deliverable/);
  assert.match(reopen, /verifyReopenReadback/);
  assert.doesNotMatch(reopen, /markDeliverablePredecessorSuperseded|planRetentionAfterFinalization/);
  assert.doesNotMatch(reopen, /writer_deliverable_versions(?!")/);
  /* A corrente de antes é lida para poder ser cobrada depois. */
  assert.match(reopen, /currentVersionIdBefore: anterior\.current_version_id/);
});

test("14 · ESTRUTURAL · uma rota discriminada; roteiro e carrossel na mesma autoridade", async () => {
  const src = semComentarios(await fonte(ROTA));

  assert.match(src, /z\.discriminatedUnion\("action"/);
  assert.match(src, /z\.enum\(\["video_script", "carousel"\]\)/);
  /* Uma chamada de cada autoridade, escolhida por ação — não por tipo. */
  assert.equal((src.match(/finalizeWriterDeliverable\(/g) || []).length, 1);
  assert.equal((src.match(/reopenWriterDeliverable\(/g) || []).length, 1);
  assert.match(src, /input\.action === "finalize"/);
  assert.doesNotMatch(src, /finalizeScript|finalizeCarousel|\/finalize\b/);

  /* O ator vem da sessão canônica, nunca do corpo. */
  assert.match(src, /actorId: profile\.userId/);
  const acoes = trecho(src, "export async function PATCH", "export async function POST");
  assert.match(acoes, /requireCanonicalSessionProfile\(\)/);
  assert.match(acoes, /assertEditorialPermission\(profile, input\.brandId, "redator", "edit"\)/);
  assert.doesNotMatch(acoes, /input\.actorId/);
  /* `.strict()` recusa um actorId enfiado no corpo. */
  assert.equal((src.match(/\}\)\.strict\(\)/g) || []).length, 3);
});

test("15 · ESTRUTURAL · os controles moram na GlobalTopbar e não se repetem no corpo", async () => {
  const ambiente = semComentarios(await fonte(AMBIENTE));
  const barra = semComentarios(await fonte(BARRA));

  /*
   * O corpo do ambiente não ACIONA mais salvar, finalizar ou reabrir. A prova é
   * o gatilho, não a palavra: o aviso de "finalizado" cita "Reabrir para edição"
   * em prosa para dizer onde o botão está, e isso é orientação, não controle.
   */
  const jsx = ambiente.slice(ambiente.indexOf("return <main"));
  assert.doesNotMatch(jsx, /onClick=\{\(\) => void (save|acao)\(/,
    "nenhum controle do corpo dispara salvar, finalizar ou reabrir");
  assert.doesNotMatch(jsx, /Salvar rascunho/, "o botão de salvar saiu do corpo");
  /* E a única menção a reabrir está dentro do aviso, apontando para a barra. */
  assert.match(jsx, /data-finalizado-aviso[\s\S]{0,400}Reabrir para edição[\s\S]{0,60}barra superior/);
  assert.equal((jsx.match(/Reabrir para edição/g) || []).length, 1);
  /* Ele publica estado e gatilhos para quem desenha. */
  assert.match(ambiente, /onBarChange\?\.\(barra\)/);
  assert.match(ambiente, /estado: !stored \? "none" : stored\.status === "approved" \? "approved" : "draft"/);
  /*
   * Finalizado é somente leitura na tela, como já é no servidor.
   *
   * ATUALIZADO no Corte 6A.7. Esta asserção exigia `<fieldset disabled>`, e
   * isso ERA o defeito: desabilitar o fieldset apagava os eventos de foco das
   * cenas, `cenaSelecionada` nunca era preenchida, e o painel de mídia — que
   * vive fora dele — ficava inalcançável. Um teste pedindo o defeito é pior que
   * teste nenhum.
   *
   * A leitura-somente agora vem de `readOnly` no conteúdo (que continua focável,
   * selecionável e copiável) e `disabled` nos botões que mudam ESTRUTURA. É
   * isso que este teste cobra.
   */
  assert.doesNotMatch(ambiente, /<fieldset[^>]*disabled=/,
    "desabilitar o fieldset torna a cena inalcançável");
  assert.ok(ambiente.split("readOnly={finalizado}").length - 1 >= 13,
    "todo campo de conteúdo em somente leitura");
  assert.ok(ambiente.split("disabled={finalizado").length - 1 >= 6,
    "botões que mudam estrutura desabilitados");

  /* A barra desenha os três, e não cria faixa nova. */
  assert.match(barra, /data-redator-deliverable-actions/);
  assert.match(barra, /Finalizar roteiro/);
  assert.match(barra, /Finalizar carrossel/);
  assert.match(barra, /Reabrir para edição/);
  assert.doesNotMatch(barra, /<header|role="toolbar"/);
});

test("16 · ESTRUTURAL · a entrega a Publicações continua separada e é do artigo", async () => {
  const barra = semComentarios(await fonte(BARRA));
  const servidor = semComentarios(await fonte(SERVIDOR));

  /* Finalizar não dispara entrega: nenhuma chamada de publicação no wrapper. */
  assert.doesNotMatch(servidor, /sendToPublications|sendWriterToPublications/);

  /* Na barra, o botão existe, é o de sempre, e o rótulo diz o que ele entrega. */
  assert.match(barra, /Enviar artigo a Publicações/);
  assert.match(barra, /selected\?\.status === "aprovado" && <button/,
    "a entrega depende do ARTIGO finalizado, não do entregável");
  assert.equal((barra.match(/void sendToPublications\(\)/g) || []).length, 2,
    "o mesmo gatilho do artigo, sem segunda autoridade");
});

test("17 · ESTRUTURAL · M5 · os três caminhos, e só um insere versão", async () => {
  const sql = (await fonte(M5)).replace(/^\s*--.*$/gm, "");

  /*
   * O marcador do caminho B aparece DUAS vezes no arquivo — ramo já-aprovado e
   * caminho B. A busca é pela ÚLTIMA. Um `indexOf` aqui acharia o ramo de cima
   * e a conferência de ordem lá embaixo passaria por acidente.
   *
   * A contagem é por `split`, não por regex: o marcador tem pontos e
   * parênteses, e escapá-lo seria pedir um defeito de escape para provar um
   * ponto sobre ordem.
   */
  const marcadorB = "IF v_corrente.version_id IS NOT NULL AND v_corrente.content_hash = v_current.content_hash THEN";
  assert.equal(sql.split(marcadorB).length - 1, 2,
    "o marcador é ambíguo de propósito: ramo aprovado e caminho B");
  const inicioB = sql.lastIndexOf(marcadorB);

  /* CAMINHO B: volta a approved SEM tocar na corrente e SEM inserir versão. */
  const caminhoB = sql.slice(inicioB, sql.indexOf("SELECT coalesce(max(version_number), 0) + 1"));
  assert.ok(caminhoB.length > 0, "o caminho B precisa existir");
  assert.match(caminhoB, /SET status = 'approved', updated_by = p_actor_id/);
  assert.doesNotMatch(caminhoB, /current_version_id/, "reusar não move a corrente");
  assert.doesNotMatch(caminhoB, /INSERT INTO/, "reusar não cria versão");
  assert.match(caminhoB, /'unchanged', true/, "o recibo reusa o campo que já existia");
  assert.doesNotMatch(caminhoB, /reused|reutilizada/, "sem contrato paralelo no recibo");

  /* Uma única inserção de versão em toda a migration: caminhos A e C. */
  assert.equal(sql.split("INSERT INTO public.writer_deliverable_versions").length - 1, 1);
  assert.match(sql, /VALUES \(v_current\.id, v_version_number, v_current\.current_version_id,/);

  /*
   * A guarda de predecessor protege o caminho B: vem ANTES dele.
   *
   * A existência vem primeiro de propósito: sem ela, `indexOf` devolveria -1,
   * que é menor que qualquer índice, e a conferência de ordem aprovaria uma
   * migration SEM guarda nenhuma.
   */
  assert.ok(sql.includes("writer_predecessor_nao_e_final"), "a guarda precisa existir");
  assert.ok(sql.indexOf("writer_predecessor_nao_e_final") < inicioB,
    "reusar uma versão que não é final seria promover rascunho a finalização");
});

test("18 · ESTRUTURAL · M5 · substitui uma função e não toca em mais nada", async () => {
  const bruto = await fonte(M5);
  const sql = bruto.replace(/^\s*--.*$/gm, "");

  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
  assert.doesNotMatch(sql, /ALTER TABLE|ADD COLUMN|DROP COLUMN|CREATE TABLE|CREATE INDEX|CREATE TRIGGER|CREATE TYPE/i);
  assert.doesNotMatch(sql, /writer_save_deliverable|writer_reopen_deliverable/);
  for (const fora of ["minerador", "arquiteto", "radar", "writer_media_assets",
                      "content_document", "publication", "pg_cron"]) {
    assert.ok(!new RegExp(fora, "i").test(sql), `a M5 não pode tocar em ${fora}`);
  }

  /* Segurança inalterada e reafirmada. */
  assert.match(sql, /SECURITY DEFINER SET search_path = public, pg_temp/);
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) FROM PUBLIC, anon, authenticated, service_role;"));
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) TO service_role;"));

  /* Pré-flight que recusa um mundo diferente do auditado. */
  assert.match(sql, /m5_preflight_m4_ausente/);
  assert.match(sql, /m5_preflight_corrente_nao_e_final/);
  assert.match(bruto, /^BEGIN;/m);
  assert.match(bruto, /^COMMIT;/m);
});

test("19 · ESTRUTURAL · M5 · o rollback existe, é o corpo da M4 e avisa do wrapper", async () => {
  const rb = (await fonte("../supabase/scripts/2026-09-19-m5-rollback-writer-finalize-deliverable.sql"));
  const sem = rb.replace(/^\s*--.*$/gm, "");

  /* O corpo da M4 tem UMA comparação de hash; o da M5 tem duas. */
  assert.equal((sem.match(/v_corrente\.content_hash = v_current\.content_hash/g) || []).length, 1);
  assert.match(sem, /writer_predecessor_nao_e_final/);
  assert.match(sem, /INSERT INTO public\.writer_deliverable_versions/);

  /*
   * Reverter a M5 sem reverter o wrapper reabre a duplicação. O arquivo precisa
   * dizer isso — um rollback que omite a metade do caminho é armadilha.
   */
  assert.match(rb, /lib\/server\/writer-deliverables\.ts/);
  assert.match(rb, /A M5 não escreve dado nenhum/);

  /* E a M5 aponta para ele. */
  assert.match(await fonte(M5), /2026-09-19-m5-rollback-writer-finalize-deliverable\.sql/);
});
