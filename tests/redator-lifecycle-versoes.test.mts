/**
 * ===== CORTE 3 · LIFECYCLE DE VERSÕES DO REDATOR =====
 *
 * Duas naturezas de prova, e o nome de cada teste diz qual é:
 *
 * COMPORTAMENTAL — exercita `planSupersede` e `recoveryWindowEnd`, que são as
 * regras de verdade. Rodam sem banco porque foram escritas sem I/O.
 *
 * ESTRUTURAL — lê o SQL da M2 e o código do save como TEXTO. Prova que a regra
 * está DECLARADA onde precisa estar; não prova que o Postgres a executa, porque
 * a M2 ainda não foi aplicada. O nome do teste carrega essa diferença para que
 * ninguém leia "verde" como "homologado".
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RECOVERY_WINDOW_HOURS, canMarkWithAuthority, planSupersede, recoveryWindowEnd,
} from "../lib/redator/version-lifecycle.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const M2 = "../supabase/migrations/20260918190100_m2_writer_version_lifecycle.sql";

const base = { unchanged: false, successorVersionId: "v2", currentVersionId: "v2", predecessorVersionId: "v1" };

/* ======================= COMPORTAMENTAL ======================= */

test("01 · COMPORTAMENTAL · readback correto permite marcar o predecessor", () => {
  const decisao = planSupersede(base);
  assert.deepEqual(decisao, { action: "mark", predecessorVersionId: "v1", successorVersionId: "v2" });
});

test("02 · COMPORTAMENTAL · readback falho NÃO marca predecessor", () => {
  /*
   * "Readback falho" tem duas formas, e as duas precisam recusar: a corrente
   * divergir do sucessor, e não haver sucessor nenhum.
   */
  assert.deepEqual(planSupersede({ ...base, currentVersionId: "outra" }),
    { action: "skip", reason: "successor_not_current" });
  assert.deepEqual(planSupersede({ ...base, currentVersionId: null }),
    { action: "skip", reason: "successor_not_current" });
  assert.deepEqual(planSupersede({ ...base, successorVersionId: null }),
    { action: "skip", reason: "successor_not_current" });
});

test("03 · COMPORTAMENTAL · conteúdo idêntico não produz sucessora, então nada é marcado", () => {
  assert.deepEqual(planSupersede({ ...base, unchanged: true }),
    { action: "skip", reason: "unchanged_save" });
  /* `unchanged` vence até com o resto coerente: sem versão nova, não houve substituição. */
  assert.deepEqual(planSupersede({ unchanged: true, successorVersionId: "v2", currentVersionId: "v2", predecessorVersionId: "v1" }),
    { action: "skip", reason: "unchanged_save" });
});

test("04 · COMPORTAMENTAL · a versão CORRENTE nunca é marcada para purga", () => {
  /* Predecessor igual à corrente: recusa. Marcar abriria janela sobre a única cópia viva. */
  assert.deepEqual(planSupersede({ ...base, predecessorVersionId: "v2" }),
    { action: "skip", reason: "predecessor_is_current" });
});

test("05 · COMPORTAMENTAL · primeira versão não tem predecessor", () => {
  assert.deepEqual(planSupersede({ ...base, predecessorVersionId: null }),
    { action: "skip", reason: "no_predecessor" });
  assert.deepEqual(planSupersede({ ...base, predecessorVersionId: undefined }),
    { action: "skip", reason: "no_predecessor" });
});

test("06 · COMPORTAMENTAL · a janela é de 48h a partir de superseded_at, nunca de created_at", () => {
  assert.equal(RECOVERY_WINDOW_HOURS, 48);
  const supersededAt = "2026-09-18T12:00:00.000Z";
  assert.equal(recoveryWindowEnd(supersededAt), "2026-09-20T12:00:00.000Z");
  const diff = new Date(recoveryWindowEnd(supersededAt)).getTime() - new Date(supersededAt).getTime();
  assert.equal(diff, 48 * 3600_000);
  assert.throws(() => recoveryWindowEnd("não é data"), /retention_invalid_superseded_at/);
});

test("07 · COMPORTAMENTAL · autoridade deduzida não autoriza marcação", () => {
  /*
   * Antes da M2 a corrente de roteiro/carrossel sai de `max(version_number)`.
   * Deduzir a corrente é justamente o que não pode governar a operação que
   * apaga as outras.
   */
  assert.equal(canMarkWithAuthority("max_version_number"), false);
  assert.equal(canMarkWithAuthority("column"), true);
});

/* ======================= ESTRUTURAL — SQL DA M2 ======================= */

test("08 · ESTRUTURAL · o CHECK da M2 amarra purge_after a superseded_at + 48h", async () => {
  const sql = await fonte(M2);
  for (const tabela of ["content_document_versions", "writer_deliverable_versions"]) {
    const bloco = sql.slice(sql.indexOf(`ALTER TABLE public.${tabela}\n  ADD CONSTRAINT ${tabela}_retention_check`));
    assert.ok(bloco.includes("purge_after = superseded_at + interval '48 hours'"),
      `${tabela}: a janela precisa ser derivada de superseded_at`);
    assert.ok(bloco.includes("superseded_at IS NULL AND superseded_by_version_id IS NULL AND purge_after IS NULL"),
      `${tabela}: sem substituição declarada não pode existir purge_after`);
  }
  /* Idade sozinha não aparece em lugar nenhum como critério. */
  assert.equal(/purge_after\s*=\s*created_at/.test(sql), false, "purge_after nunca deriva de created_at");
});

test("09 · ESTRUTURAL · a RPC de marcação exige marca, sucessor corrente e predecessor distinto", async () => {
  const sql = await fonte(M2);
  for (const fn of ["writer_mark_document_version_superseded", "writer_mark_deliverable_version_superseded"]) {
    const corpo = sql.slice(sql.indexOf(`CREATE FUNCTION public.${fn}`), sql.indexOf("$$;", sql.indexOf(`CREATE FUNCTION public.${fn}`)));
    assert.ok(corpo.includes("marca_id = p_brand_id"), `${fn}: isolamento por marca`);
    assert.ok(corpo.includes("retention_successor_not_current"), `${fn}: sucessor precisa ser a corrente`);
    assert.ok(corpo.includes("retention_self_supersede"), `${fn}: predecessor não pode ser o sucessor`);
    assert.ok(corpo.includes("retention_already_superseded_by_other"), `${fn}: par divergente é recusado`);
    /* Idempotência: repetir com o MESMO par devolve o estado sem mover a janela. */
    assert.ok(corpo.includes("'unchanged', true"), `${fn}: repetição não pode mover purge_after`);
  }
});

test("10 · ESTRUTURAL · a purga nunca alcança a versão corrente", async () => {
  const sql = await fonte(M2);
  const purga = sql.slice(sql.indexOf("CREATE FUNCTION public.lifecycle_purge_editorial_history"));
  assert.ok(purga.includes("d.current_version_id IS DISTINCT FROM v.version_id"));
  assert.ok(purga.includes("e.current_version_id IS DISTINCT FROM v.version_id"));
  assert.ok(purga.includes("v.purge_after <= now()"), "só o que já venceu a janela");
  assert.ok(purga.includes("v.purge_after IS NOT NULL"), "sem janela, não é elegível");
});

test("11 · ESTRUTURAL · a M2 não afrouxa a proteção append-only do DNA", async () => {
  const sql = await fonte(M2);
  /* A função nova é OUTRA; a antiga não é recriada nem alterada. */
  assert.ok(sql.includes("CREATE FUNCTION public.pipeline_editorial_protect_retention_aware"));
  assert.equal(/CREATE OR REPLACE FUNCTION public\.pipeline_editorial_protect_append_only/.test(sql), false,
    "a função compartilhada com editorial_artifact_versions não pode ser tocada");
  assert.equal(/ALTER TABLE public\.editorial_artifact_versions/.test(sql), false,
    "editorial_artifact_versions está fora desta reforma");
  /* E o gatilho novo só entra nas duas tabelas do Redator. */
  for (const t of ["content_document_versions", "writer_deliverable_versions"]) {
    assert.ok(sql.includes(`DROP TRIGGER ${t}_append_only_trg ON public.${t};`));
  }
});

test("12 · ESTRUTURAL · writer_deliverables ganha current_version_id explícito", async () => {
  const sql = await fonte(M2);
  assert.ok(sql.includes("ALTER TABLE public.writer_deliverables\n  ADD COLUMN current_version_id uuid;"));
  assert.ok(sql.includes("writer_deliverables_current_version_fk"));
  assert.ok(sql.includes("ON DELETE RESTRICT"), "a corrente nunca é apagada");
  /* E a RPC de gravação passa a mantê-la. */
  assert.ok(sql.includes("current_version_id = v_version_id"));
});

/* ======================= ESTRUTURAL — CÓDIGO DO SAVE ======================= */

test("13 · ESTRUTURAL · artigo: a marcação vem DEPOIS do readback, e não lança", async () => {
  const save = await fonte("../lib/server/writer-deliverables.ts");
  const artigo = save.slice(save.indexOf("export async function saveWriterArticleDraft"),
    save.indexOf("export async function listWriterDeliverables"));
  const posReadback = artigo.indexOf("readback_mismatch");
  const posMarcacao = artigo.indexOf("markArticlePredecessorSuperseded");
  assert.ok(posReadback > 0 && posMarcacao > posReadback,
    "marcar antes do readback abriria a janela sobre a única cópia boa");
  /* O readback do artigo já confere a corrente — autoridade que já existia. */
  assert.ok(artigo.includes("readback.data.current_version_id !== receipt.versionId"));
});

test("14 · ESTRUTURAL · roteiro e carrossel: mesma ordem, autoridade própria", async () => {
  const save = await fonte("../lib/server/writer-deliverables.ts");
  const entregavel = save.slice(save.indexOf("export async function saveWriterDeliverable"),
    save.indexOf("export async function listWriterMedia"));
  const posReadback = entregavel.indexOf("readback_mismatch");
  const posMarcacao = entregavel.indexOf("markDeliverablePredecessorSuperseded");
  assert.ok(posReadback > 0 && posMarcacao > posReadback);
  /* Depois da M2 a corrente é conferida; dedução não entra como substituto. */
  assert.ok(entregavel.includes("currentVersionId !== result.versionId"));
  /*
   * A asserção olha a CHAMADA, não a palavra: a primeira versão deste teste
   * casava com o próprio comentário que explica por que a dedução saiu, e
   * "falhou" sobre um texto em vez de sobre o código.
   */
  const semComentarios = entregavel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/\.order\(\s*"version_number"/.test(semComentarios), false,
    "o save do entregável não pode deduzir a corrente por ordenação");
});

test("15 · ESTRUTURAL · os dois tipos de entregável passam pelo mesmo caminho", async () => {
  const contratos = await fonte("../lib/redator/multiformat-contracts.ts");
  assert.ok(contratos.includes('z.literal("video_script")'));
  assert.ok(contratos.includes('z.literal("carousel")'));
  const sql = await fonte(M2);
  /* A RPC de entregável é uma só, e discrimina por `kind` — roteiro e carrossel
   * não têm caminhos separados que possam divergir. */
  assert.ok(sql.includes("p_kind NOT IN ('video_script', 'carousel')"));
  assert.ok(sql.includes("AND kind = p_kind FOR UPDATE"));
});

test("16 · ESTRUTURAL · antes da M2 o código não pede a coluna nem chama a RPC", async () => {
  const save = await fonte("../lib/server/writer-deliverables.ts");
  const retencao = await fonte("../lib/server/writer-retention.ts");
  /* A coluna só entra no SELECT quando a capacidade foi detectada. */
  assert.ok(save.includes("const comColuna = await writerRetentionAvailable()"));
  assert.ok(save.includes('comColuna\n    ? await client.from("writer_deliverables").select("id,content_hash,lock_version,payload,current_version_id")'));
  /* E a marcação devolve `unavailable` em vez de explodir. */
  assert.ok(retencao.includes('if (!(await writerRetentionAvailable())) return { status: "unavailable" };'));
  assert.ok(retencao.includes('return { status: "unavailable" };'));
});

test("17 · ESTRUTURAL · nenhum id de versão vem do cliente", async () => {
  const retencao = await fonte("../lib/server/writer-retention.ts");
  /* O predecessor é LIDO do servidor, do previous_version_id do sucessor. */
  assert.ok(retencao.includes("async function predecessorOfDocumentVersion"));
  assert.ok(retencao.includes("async function predecessorOfDeliverableVersion"));
  assert.ok(retencao.includes('.select("previous_version_id")'));
  /* E a marca é sempre repassada à RPC. */
  assert.ok(retencao.includes("p_brand_id: input.brandId"));
});

test("18 · ESTRUTURAL · o purge NÃO é executado neste corte", async () => {
  const retencao = await fonte("../lib/server/writer-retention.ts");
  const save = await fonte("../lib/server/writer-deliverables.ts");
  for (const arquivo of [retencao, save]) {
    assert.equal(/lifecycle_purge_editorial_history|lifecycle_claim_writer_media_purge|pg_cron/.test(arquivo), false,
      "nenhuma chamada de purga entra no caminho de gravação");
  }
});
