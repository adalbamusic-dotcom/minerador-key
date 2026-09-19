/**
 * ===== M4 · LIFECYCLE DO ENTREGÁVEL — TESTES PRÉ-APLICAÇÃO =====
 *
 * As três categorias estão SEPARADAS de propósito, e a distinção importa porque
 * a M4 ainda não foi aplicada:
 *
 *   PURE_BEHAVIOR_TEST     01-12, 20-22   exercita as regras de verdade, sem
 *                                         banco. Provam a DECISÃO, não a
 *                                         execução remota.
 *   STRUCTURAL_SQL_TEST    13-19, 23-26   lê o arquivo da migration como texto.
 *                                         Provam o que está ESCRITO, não o que
 *                                         roda.
 *   REMOTE_SCHEMA_TEST          NÃO existe aqui: o runner não alcança o banco.
 *                               A leitura remota foi feita pelo script de
 *                               auditoria e está no relatório.
 *
 * Nenhum teste deste arquivo prova que o banco se comporta assim hoje — hoje
 * ele ainda versiona rascunho. Eles provam o desenho.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  applyDraftSave, classifyVersion, finalizationCreatesPublicationRecord,
  mayBePredecessor, planDraftSave, planFinalization,
  planRetentionAfterFinalization, planReopen,
  FINAL_CHANGE_REASON, type DeliverableState, type VersionRow,
} from "../lib/redator/deliverable-lifecycle.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const M4 = "../supabase/migrations/20260919020000_m4_writer_deliverable_finalization.sql";

const estado = (o: Partial<DeliverableState> = {}): DeliverableState => ({
  status: "draft", contentHash: "hash-1", currentVersionId: null,
  currentVersionHash: null, lockVersion: 1, ...o,
});

/* ======================= PURE_BEHAVIOR_TEST ======================= */

test("01 · PURE · save de rascunho 1, 2 e N não cria versão alguma", () => {
  let atual = estado();
  for (const [n, hash] of [[1, "hash-2"], [2, "hash-3"], [3, "hash-4"]] as const) {
    const d = planDraftSave({ state: atual, nextContentHash: hash, expectedLock: atual.lockVersion });
    assert.equal(d.allowed, true, `save ${n} deveria passar`);
    assert.equal(d.allowed && d.createsVersion, false, `save ${n} não pode versionar`);
    assert.equal(d.allowed && d.movesCurrentVersion, false, `save ${n} não pode mover a corrente`);
    /* O trigger incrementa o lock; a corrente continua nula. */
    atual = { ...atual, contentHash: hash, lockVersion: atual.lockVersion + 1 };
    assert.equal(atual.currentVersionId, null, `depois do save ${n} a corrente segue nula`);
  }
});

test("02 · PURE · entregável novo nasce sem versão e sem corrente", () => {
  const d = planDraftSave({ state: null, nextContentHash: "h", expectedLock: null });
  assert.equal(d.allowed, true);
  assert.equal(d.allowed && d.createsVersion, false);
  /* Com lock esperado num entregável que não existe, é conflito. */
  assert.equal(planDraftSave({ state: null, nextContentHash: "h", expectedLock: 1 }).allowed, false);
});

test("03 · PURE · save idêntico é 'nada', não erro nem escrita", () => {
  const d = planDraftSave({ state: estado({ contentHash: "igual" }), nextContentHash: "igual", expectedLock: 999 });
  assert.equal(d.allowed, true);
  assert.equal(d.allowed && d.unchanged, true);
  assert.equal(d.allowed && d.createsVersion, false, "nem o idêntico versiona");
});

test("04 · PURE · lock divergente recusa o save", () => {
  const d = planDraftSave({ state: estado({ lockVersion: 5 }), nextContentHash: "novo", expectedLock: 4 });
  assert.deepEqual(d, { allowed: false, refusal: "lock_conflict" });
});

test("05 · PURE · finalizado não se edita direto", () => {
  const d = planDraftSave({ state: estado({ status: "approved" }), nextContentHash: "novo", expectedLock: 1 });
  assert.deepEqual(d, { allowed: false, refusal: "approved_immutable" });
});

test("06 · PURE · primeira finalização cria versão com previous = NULL", () => {
  const d = planFinalization({ state: estado(), expectedLock: 1 });
  assert.deepEqual(d, { action: "create_version", previousVersionId: null });
});

test("07 · PURE · refinalizar sem mudança devolve a MESMA versão", () => {
  const jaFinalizado = estado({
    status: "approved", contentHash: "hash-A", currentVersionId: "A", currentVersionHash: "hash-A",
  });
  const d = planFinalization({ state: jaFinalizado, expectedLock: 1 });
  assert.deepEqual(d, { action: "unchanged", versionId: "A" }, "nenhuma versão duplicada");
});

test("08 · PURE · aprovado com hash divergente é recusado, não finalizado por cima", () => {
  /*
   * Estado que o save não consegue produzir — ele recusa editar aprovado. Se
   * aparecer, é corrupção, e finalizar por cima esconderia o problema.
   */
  const corrompido = estado({
    status: "approved", contentHash: "hash-NOVO", currentVersionId: "A", currentVersionHash: "hash-A",
  });
  assert.deepEqual(planFinalization({ state: corrompido, expectedLock: 1 }),
    { action: "refuse", refusal: "state_inconsistent" });
});

test("09 · PURE · o ciclo completo: A → reabrir → editar → B", () => {
  /* 1. primeira finalização */
  const antesDeA = estado({ contentHash: "hash-A" });
  assert.deepEqual(planFinalization({ state: antesDeA, expectedLock: 1 }),
    { action: "create_version", previousVersionId: null });

  const comA = estado({ status: "approved", contentHash: "hash-A", currentVersionId: "A", currentVersionHash: "hash-A" });

  /* 2. reabrir: status volta, versões intactas */
  assert.deepEqual(planReopen(comA), { action: "reopen" });
  const reaberto = { ...comA, status: "draft" as const };
  assert.equal(reaberto.currentVersionId, "A", "reabrir não mexe na corrente");

  /* 3. editar: continua sem versionar */
  const edicao = planDraftSave({ state: reaberto, nextContentHash: "hash-B", expectedLock: 1 });
  assert.equal(edicao.allowed && edicao.createsVersion, false);

  /* 4. refinalizar: B com previous = A */
  const antesDeB = { ...reaberto, contentHash: "hash-B", lockVersion: 2 };
  assert.deepEqual(planFinalization({ state: antesDeB, expectedLock: 2 }),
    { action: "create_version", previousVersionId: "A" });
});

test("10 · PURE · A só entra em retenção depois do readback confirmar B", () => {
  const decisao = { action: "create_version" as const, previousVersionId: "A" };

  /* Readback confirma B: marca A. */
  assert.deepEqual(planRetentionAfterFinalization({
    decision: decisao, readbackCurrentVersionId: "B", createdVersionId: "B",
  }), { mark: true, predecessorVersionId: "A", successorVersionId: "B" });

  /* Readback devolve outra coisa: A NÃO entra em retenção. */
  assert.deepEqual(planRetentionAfterFinalization({
    decision: decisao, readbackCurrentVersionId: "A", createdVersionId: "B",
  }), { mark: false, reason: "readback_failed" });

  /* Readback vazio: idem. */
  assert.deepEqual(planRetentionAfterFinalization({
    decision: decisao, readbackCurrentVersionId: null, createdVersionId: "B",
  }), { mark: false, reason: "readback_failed" });
});

test("11 · PURE · primeira finalização e finalização idempotente não marcam ninguém", () => {
  assert.deepEqual(planRetentionAfterFinalization({
    decision: { action: "create_version", previousVersionId: null },
    readbackCurrentVersionId: "A", createdVersionId: "A",
  }), { mark: false, reason: "no_predecessor" });

  assert.deepEqual(planRetentionAfterFinalization({
    decision: { action: "unchanged", versionId: "A" },
    readbackCurrentVersionId: "A", createdVersionId: null,
  }), { mark: false, reason: "unchanged_finalization" });
});

test("12 · PURE · finalizar não cria PublicationRecord", () => {
  assert.equal(finalizationCreatesPublicationRecord(), false);
  /* E o módulo inteiro desconhece Publicações. */
  /*
   * A busca ignora o nome da própria função — que contém "PublicationRecord"
   * justamente para afirmar a ausência. O que não pode existir é a TABELA ou a
   * autoridade de entrega.
   */
  return fonte("../lib/redator/deliverable-lifecycle.ts").then(regras => {
    const codigo = regras.replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/finalizationCreatesPublicationRecord/g, "");
    assert.doesNotMatch(codigo, /publication_record|sendWriterToPublications/);
  });
});

/* ======================= STRUCTURAL_SQL_TEST ======================= */

test("13 · SQL · o save da M4 não versiona e não move a corrente", async () => {
  const sql = await fonte(M4);
  const efetivo = sql.replace(/^\s*--.*$/gm, "");
  const save = efetivo.slice(efetivo.indexOf("FUNCTION public.writer_save_deliverable"),
    efetivo.indexOf("FUNCTION public.writer_finalize_deliverable"));

  assert.doesNotMatch(save, /INSERT INTO public\.writer_deliverable_versions/,
    "o save não pode inserir versão");
  assert.doesNotMatch(save, /current_version_id = v_version_id/,
    "o save não pode mover a corrente");
  /* Na criação, a corrente nasce nula. */
  assert.match(save, /current_version_id, created_by, updated_by\)[\s\S]{0,200}NULL, p_actor_id, p_actor_id/);
  /* O que foi preservado: escopo, guarda de aprovado e lock. */
  assert.match(save, /writer_payload_invalid_or_stale/);
  assert.match(save, /writer_approved_immutable/);
  assert.match(save, /writer_lock_conflict/);
});

test("14 · SQL · a finalização é a única que insere versão", async () => {
  const sql = await fonte(M4);
  const efetivo = sql.replace(/^\s*--.*$/gm, "");

  assert.equal((efetivo.match(/INSERT INTO public\.writer_deliverable_versions/g) || []).length, 1,
    "uma única inserção de versão em toda a migration");
  const finalize = efetivo.slice(efetivo.indexOf("FUNCTION public.writer_finalize_deliverable"));
  assert.match(finalize, /INSERT INTO public\.writer_deliverable_versions/);
  /* previous = a corrente de antes; snapshot do payload gravado. */
  assert.match(finalize, /VALUES \(v_current\.id, v_version_number, v_current\.current_version_id,/);
  assert.match(finalize, /v_current\.payload, v_current\.content_hash, 'Finalização do entregável\.'/);
  assert.match(finalize, /SET status = 'approved', current_version_id = v_version_id/);
  /* Não recebe payload: não há segunda fonte de verdade. */
  assert.doesNotMatch(finalize.slice(0, finalize.indexOf("RETURNS")), /p_payload/);
});

test("15 · SQL · idempotência por content_hash, e estado corrompido é recusado", async () => {
  /* Sem comentários: eles citam a RPC de marcação para explicar por que ela NÃO é chamada aqui. */
  const sql = (await fonte(M4)).replace(/^\s*--.*$/gm, "");
  const finalize = sql.slice(sql.indexOf("FUNCTION public.writer_finalize_deliverable"));

  assert.match(finalize, /v_corrente\.content_hash = v_current\.content_hash[\s\S]{0,400}'unchanged', true/);
  assert.match(finalize, /writer_finalized_state_inconsistent/);
  /* E a marcação do predecessor NÃO acontece dentro da finalização. */
  assert.doesNotMatch(finalize.slice(0, finalize.indexOf("$$;")), /superseded_at\s*=|writer_mark_deliverable_version_superseded/);
});

test("16 · SQL · a reabertura é contrato próprio e não toca em versões", async () => {
  const sql = await fonte(M4);
  const reopen = sql.slice(sql.indexOf("FUNCTION public.writer_reopen_deliverable"),
    sql.indexOf("-- 4. GRANTS"));

  assert.match(reopen, /SET status = 'draft', updated_by = p_actor_id/);
  assert.doesNotMatch(reopen, /current_version_id =/, "reabrir não mexe na corrente");
  assert.doesNotMatch(reopen, /writer_deliverable_versions/, "reabrir não toca em versões");
  /* Reabrir o que já está editável não é erro. */
  assert.match(reopen, /status <> 'approved'[\s\S]{0,200}'unchanged', true/);
});

test("17 · SQL · roteiro e carrossel compartilham a autoridade, e nada novo de status", async () => {
  const sql = await fonte(M4);
  const efetivo = sql.replace(/^\s*--.*$/gm, "");

  /* Uma RPC de finalização só, recebendo `kind`. */
  assert.equal((efetivo.match(/CREATE OR REPLACE FUNCTION public\.writer_finalize/g) || []).length, 1);
  assert.match(efetivo, /p_kind NOT IN \('video_script', 'carousel'\)/);
  assert.doesNotMatch(efetivo, /writer_finalize_script|writer_finalize_carousel/);

  /* `approved` já era o estado final: nenhum status novo, nenhum CHECK alterado. */
  assert.match(efetivo, /status = 'approved'/);
  assert.doesNotMatch(efetivo, /ALTER TABLE[\s\S]{0,200}status_check/);
  assert.doesNotMatch(efetivo, /ADD COLUMN|DROP COLUMN|ALTER COLUMN/);
});

test("18 · SQL · grants, escopo e o que a M4 não toca", async () => {
  const sql = await fonte(M4);
  const efetivo = sql.replace(/^\s*--.*$/gm, "");

  for (const fn of ["writer_save_deliverable(uuid,text,text,jsonb,text,integer,uuid)",
                    "writer_finalize_deliverable(uuid,text,text,integer,uuid)",
                    "writer_reopen_deliverable(uuid,text,text,uuid)"]) {
    assert.ok(efetivo.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated, service_role;`), `falta REVOKE de ${fn}`);
    assert.ok(efetivo.includes(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`), `falta GRANT de ${fn}`);
  }
  /* Todas SECURITY DEFINER com search_path fixo. */
  assert.equal((efetivo.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) || []).length, 3);

  /* Nada fora do escopo do entregável. */
  for (const fora of ["minerador", "arquiteto", "radar", "editorial_artifact_versions",
                      "publication_records", "writer_media_assets", "content_document_versions",
                      "pg_cron", "CREATE TRIGGER"]) {
    assert.ok(!new RegExp(fora, "i").test(efetivo), `M4 não pode tocar em ${fora}`);
  }
  /* E nenhuma linha é apagada ou reescrita. */
  assert.doesNotMatch(efetivo, /DELETE FROM|TRUNCATE|UPDATE public\.writer_deliverable_versions/);
});

test("19 · SQL · o rollback existe e restaura o corpo anterior", async () => {
  const rollback = await fonte("../supabase/scripts/2026-09-19-m4-rollback-writer-save-deliverable.sql");

  /* Ele traz de volta exatamente o que a M4 tira. */
  assert.match(rollback, /INSERT INTO public\.writer_deliverable_versions/);
  assert.match(rollback, /'Revisão do rascunho\.'/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.writer_finalize_deliverable/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.writer_reopen_deliverable/);
  /* E a M4 aponta para ele. */
  const sql = await fonte(M4);
  assert.match(sql, /2026-09-19-m4-rollback-writer-save-deliverable\.sql/);
});

/* =============================================================================
 * NORMALIZAÇÃO DAS VERSÕES LEGADAS DE RASCUNHO — decisão canônica 2026-09-19
 *
 *   DRAFT_IS_HISTORY = NO
 *   FIRST_FINAL_VERSION_PREVIOUS_ID = NULL
 *   LEGACY_DRAFT_VERSION_ENTERS_M2 = NO
 *
 * Os PURE abaixo provam a regra; os SQL provam o que a seção 0 da migration
 * está escrita para fazer. Nenhum deles prova que o banco já normalizou — a M4
 * não foi aplicada.
 * ========================================================================== */

const versao = (o: Partial<VersionRow> = {}): VersionRow => ({
  versionId: "L", deliverableId: "D", changeReason: "Rascunho inicial.", supersededAt: null, ...o,
});

test("20 · PURE · rascunho legado nunca pode ser predecessor de uma final", () => {
  for (const motivo of ["Rascunho inicial.", "Revisão do rascunho."]) {
    assert.equal(classifyVersion(motivo), "LEGACY_DRAFT_VERSION");
    assert.equal(mayBePredecessor({ version: versao({ changeReason: motivo }), deliverableId: "D" }), false,
      `${motivo} não pode virar predecessor`);
  }

  const final = versao({ versionId: "A", changeReason: FINAL_CHANGE_REASON });
  assert.equal(classifyVersion(FINAL_CHANGE_REASON), "FINAL_VERSION");
  assert.equal(mayBePredecessor({ version: final, deliverableId: "D" }), true);

  /* Falha fechada nos três desvios: dono errado, já substituída, motivo que
     ninguém reconhece. */
  assert.equal(mayBePredecessor({ version: final, deliverableId: "OUTRO" }), false);
  assert.equal(mayBePredecessor({
    version: { ...final, supersededAt: "2026-09-19T00:00:00Z" }, deliverableId: "D",
  }), false);
  assert.equal(classifyVersion("Motivo que ninguém escreveu."), "UNKNOWN");
  assert.equal(mayBePredecessor({
    version: { ...final, changeReason: "Motivo que ninguém escreveu." }, deliverableId: "D",
  }), false);
});

test("21 · PURE · depois da normalização, a primeira finalização tem previous = NULL", () => {
  /*
   * O entregável era `draft` apontando para um rascunho legado. A seção 0
   * anulou o ponteiro; a linha legada continua no banco, intocada.
   */
  const normalizado = estado({ status: "draft", contentHash: "hash-A", currentVersionId: null });
  assert.deepEqual(planFinalization({ state: normalizado, expectedLock: 1 }),
    { action: "create_version", previousVersionId: null },
    "a versão legada não entra como predecessora da primeira final");
});

test("22 · PURE · reopen A → N saves → a corrente continua A e nada versiona", () => {
  let atual = estado({
    status: "approved", contentHash: "hash-A", currentVersionId: "A", currentVersionHash: "hash-A",
  });
  assert.deepEqual(planReopen(atual), { action: "reopen" });
  atual = { ...atual, status: "draft" };

  for (const hash of ["hash-B1", "hash-B2", "hash-B3", "hash-B4"]) {
    const r = applyDraftSave({ state: atual, nextContentHash: hash, expectedLock: atual.lockVersion });
    assert.equal(r.saved, true, `o save de ${hash} deveria passar`);
    if (!r.saved) return;
    assert.deepEqual(r.createdVersionIds, [], "nenhuma versão nova");
    assert.equal(r.next.currentVersionId, "A", "o save não move nem zera a corrente");
    atual = r.next;
  }

  /* Save idêntico depois do reopen também não mexe em nada. */
  const igual = applyDraftSave({ state: atual, nextContentHash: atual.contentHash, expectedLock: 999 });
  assert.equal(igual.saved && igual.next.currentVersionId, "A");

  assert.equal(atual.contentHash, "hash-B4");
  assert.equal(atual.currentVersionId, "A",
    "A continua sendo a última finalização canônica enquanto o rascunho é editado");

  /* E aí sim: refinalizar o modificado cria B com previous = A. */
  assert.deepEqual(planFinalization({ state: atual, expectedLock: atual.lockVersion }),
    { action: "create_version", previousVersionId: "A" });
});

test("23 · SQL · a normalização mexe no ponteiro e em nada mais", async () => {
  const efetivo = (await fonte(M4)).replace(/^\s*--.*$/gm, "");
  const secao0 = efetivo.slice(0, efetivo.indexOf("FUNCTION public.writer_save_deliverable"));

  /* Um único UPDATE, num único alvo, com uma única coluna. */
  assert.equal((secao0.match(/UPDATE /g) || []).length, 1, "a seção 0 só pode ter um UPDATE");
  const dml = secao0.slice(secao0.indexOf("UPDATE public.writer_deliverables"));
  const alvo = dml.slice(0, dml.indexOf(";") + 1);

  const clausulaSet = alvo.slice(alvo.indexOf("SET "), alvo.search(/\bWHERE\b/)).trim();
  assert.equal(clausulaSet, "SET current_version_id = NULL", "só o ponteiro muda");

  /*
   * NORMALIZATION_DML_SCOPE = LEGACY_DRAFT_ONLY
   *
   * O critério inteiro mora no WHERE do próprio UPDATE, não nas guardas. Uma
   * guarda que passou é afirmação sobre o passado; o UPDATE escreve no presente.
   */
  for (const criterio of [
    /d\.current_version_id IS NOT NULL/,          /* nunca finalizado: sem ponteiro, nada a fazer */
    /d\.status <> 'approved'/,                    /* status não aprovado */
    /v\.version_id = d\.current_version_id/,      /* é a versão apontada */
    /v\.deliverable_id = d\.id/,                  /* do mesmo entregável */
    /v\.superseded_at IS NULL/,                   /* não substituída */
    /v\.purge_after IS NULL/,                     /* sem janela aberta */
    /v\.change_reason IN \('Rascunho inicial\.', 'Revisão do rascunho\.'\)/, /* rascunho legado */
  ]) {
    assert.match(alvo, criterio, "o UPDATE precisa carregar o critério inteiro");
  }

  /* E não pode voltar a ser o filtro solto que só olhava o status. */
  assert.doesNotMatch(alvo, /WHERE current_version_id IS NOT NULL AND status <> 'approved';/,
    "o UPDATE não pode depender só das guardas anteriores");

  /* Nenhuma linha de versão é criada, movida ou apagada. */
  assert.doesNotMatch(secao0, /UPDATE public\.writer_deliverable_versions|DELETE|INSERT|TRUNCATE/,
    "as linhas legadas ficam exatamente onde estão");
  /* E nenhuma coluna de retenção é escrita: legado não entra no lifecycle M2. */
  assert.doesNotMatch(secao0, /superseded_at =|purge_after =|superseded_by_version_id =/);
});

test("24 · SQL · o pré-flight aborta em qualquer forma diferente da auditada", async () => {
  const sql = await fonte(M4);
  const efetivo = sql.replace(/^\s*--.*$/gm, "");
  const secao0 = efetivo.slice(0, efetivo.indexOf("FUNCTION public.writer_save_deliverable"));

  const guardas = [
    "m4_preflight_ha_entregavel_aprovado",    /* alguém já finalizado por caminho que não existe */
    "m4_preflight_ha_versao_em_retencao",     /* janela de 48h já aberta */
    "m4_preflight_corrente_nao_reconhecida",  /* corrente que não é rascunho legado */
    "m4_preflight_corrente_orfa",             /* ponteiro para versão inexistente ou de outro dono */
    "m4_normalizacao_incompleta",             /* sobrou corrente depois do UPDATE */
    "m4_normalizacao_alterou_versoes",        /* a contagem de versões mudou */
    "m4_normalizacao_iniciou_retencao",       /* alguma versão ganhou janela */
  ];
  for (const guarda of guardas) {
    assert.ok(secao0.includes("RAISE EXCEPTION '" + guarda), `falta a guarda ${guarda}`);
  }

  /* Reconhecer rascunho legado é por `change_reason`, não por adivinhação. */
  assert.match(secao0, /change_reason IN \('Rascunho inicial\.', 'Revisão do rascunho\.'\)/);
  /* Uma guarda que dispara aborta a migration inteira, não só a seção. */
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("25 · SQL · o save não escreve a corrente nem para anulá-la", async () => {
  const efetivo = (await fonte(M4)).replace(/^\s*--.*$/gm, "");
  const save = efetivo.slice(efetivo.indexOf("FUNCTION public.writer_save_deliverable"),
    efetivo.indexOf("FUNCTION public.writer_finalize_deliverable"));

  /*
   * O UPDATE do save — o caminho do entregável que já existe — não pode
   * mencionar a coluna. Se ele a zerasse, um save depois do reopen apagaria a
   * última finalização canônica.
   */
  const atualizacao = save.slice(save.indexOf("UPDATE public.writer_deliverables"), save.indexOf("ELSE"));
  assert.ok(atualizacao.includes("SET title"), "o UPDATE do save deveria existir");
  assert.doesNotMatch(atualizacao, /current_version_id/);

  /* No INSERT de entregável novo ela nasce NULL de propósito: nunca houve final. */
  assert.match(save, /current_version_id, created_by, updated_by\)/);
  assert.match(save, /p_payload, p_content_hash, NULL, p_actor_id, p_actor_id\)/);
});

test("26 · SQL · nem por engano um rascunho legado vira predecessor", async () => {
  const efetivo = (await fonte(M4)).replace(/^\s*--.*$/gm, "");
  const finalize = efetivo.slice(efetivo.indexOf("FUNCTION public.writer_finalize_deliverable"),
    efetivo.indexOf("FUNCTION public.writer_reopen_deliverable"));

  assert.match(finalize, /v_corrente\.change_reason <> 'Finalização do entregável\.'/);
  assert.match(finalize, /v_corrente\.deliverable_id IS DISTINCT FROM v_current\.id/);
  assert.match(finalize, /v_corrente\.superseded_at IS NOT NULL/);
  assert.match(finalize, /RAISE EXCEPTION 'writer_predecessor_nao_e_final'/);

  /* A guarda impede, não conserta depois: ela vem ANTES da inserção. */
  assert.ok(finalize.indexOf("writer_predecessor_nao_e_final")
    < finalize.indexOf("INSERT INTO public.writer_deliverable_versions"),
    "a guarda tem que vir antes do INSERT");
});
