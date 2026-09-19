/**
 * ===== AS REGRAS DA PURGA, ANTES DE EXISTIR PURGA =====
 *
 * Nenhum teste aqui apaga coisa alguma, e nem poderia: o módulo sob teste não
 * importa banco nem Storage. O que se prova é a DECISÃO — quem pode sair, em
 * que ordem, e o que cada resposta do Storage significa.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  canDeleteRowAfterStorage, classifyStorageRemoval, planAssetPurge, planPurgeQueue,
  referencedByRemaining, summarizePurge, type PurgeCandidate,
} from "../lib/redator/media-purge-plan.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const AGORA = "2026-09-21T12:00:00.000Z";

const candidato = (overrides: Partial<PurgeCandidate> = {}): PurgeCandidate => ({
  assetId: "asset-antigo",
  storagePath: "marca/doc/asset-antigo.png",
  supersededAt: "2026-09-19T00:00:00.000Z",
  purgeAfter: "2026-09-21T00:00:00.000Z",
  replacedByAssetId: "asset-novo",
  ...overrides,
});

/* ======================= ELEGIBILIDADE ======================= */

test("01 · idade sozinha nunca torna um ativo elegível", () => {
  /*
   * Corrente é corrente, tenha nascido hoje ou há um ano. Sem `superseded_at`
   * não há sucessor, e sem sucessor apagar seria perder a única cópia.
   */
  const corrente = candidato({ supersededAt: null, purgeAfter: null, replacedByAssetId: null });
  assert.deepEqual(planAssetPurge(corrente, "2030-01-01T00:00:00.000Z"),
    { eligible: false, assetId: "asset-antigo", refusal: "not_superseded" });
});

test("02 · CURRENT_ASSET_CAN_BE_PURGED = NO, mesmo com purge_after plantado", () => {
  /*
   * Estado que o CHECK do banco impede, mas a regra não pode depender só do
   * CHECK: se alguém escrever `purge_after` numa linha corrente, a decisão
   * aqui continua sendo não.
   */
  const incoerente = candidato({ supersededAt: null, purgeAfter: "2020-01-01T00:00:00.000Z" });
  const decisao = planAssetPurge(incoerente, AGORA);
  assert.equal(decisao.eligible, false);
  assert.equal(decisao.eligible === false && decisao.refusal, "not_superseded");
});

test("03 · a janela precisa ter vencido", () => {
  const aberta = planAssetPurge(candidato({ purgeAfter: "2026-09-21T12:00:01.000Z" }), AGORA);
  assert.deepEqual(aberta, { eligible: false, assetId: "asset-antigo", refusal: "window_open" });

  /* No instante exato do vencimento já vale: `purge_after <= now()`. */
  const noLimite = planAssetPurge(candidato({ purgeAfter: AGORA }), AGORA);
  assert.equal(noLimite.eligible, true);
});

test("04 · substituído sem sucessor ou sem janela não é apagado no escuro", () => {
  const semSucessor = planAssetPurge(candidato({ replacedByAssetId: null }), AGORA);
  assert.equal(semSucessor.eligible === false && semSucessor.refusal, "no_successor");

  const semJanela = planAssetPurge(candidato({ purgeAfter: null }), AGORA);
  assert.equal(semJanela.eligible === false && semJanela.refusal, "no_purge_after");
});

test("05 · linha sem arquivo é elegível, e não tem objeto para remover", () => {
  const decisao = planAssetPurge(candidato({ storagePath: null }), AGORA);
  assert.deepEqual(decisao, { eligible: true, assetId: "asset-antigo", storagePath: null });
});

/* ======================= ORDEM E VÍNCULO ======================= */

test("06 · o sucessor não sai enquanto o predecessor apontar para ele", () => {
  /*
   * `replaced_by_asset_id` é ON DELETE RESTRICT. Apagar o sucessor com o
   * predecessor vivo é 23503 — e chegar nesse erro cru significaria descobrir
   * o vínculo tarde demais.
   */
  const predecessor = candidato({ assetId: "A", replacedByAssetId: "B", purgeAfter: "2026-09-21T00:00:00.000Z" });
  const sucessor = candidato({ assetId: "B", replacedByAssetId: "C", purgeAfter: "2026-09-21T06:00:00.000Z" });

  assert.equal(referencedByRemaining("B", [predecessor]), true);
  assert.equal(referencedByRemaining("A", [predecessor, sucessor]), false);
});

test("07 · a fila sai em ordem cronológica, e o predecessor abre caminho", () => {
  const A = candidato({ assetId: "A", replacedByAssetId: "B", purgeAfter: "2026-09-21T00:00:00.000Z" });
  const B = candidato({ assetId: "B", replacedByAssetId: "C", purgeAfter: "2026-09-21T06:00:00.000Z" });
  const C = candidato({ assetId: "C", supersededAt: null, purgeAfter: null, replacedByAssetId: null });

  /* Propositalmente fora de ordem na entrada. */
  const decisoes = planPurgeQueue({ candidates: [B, A], allRows: [A, B, C], now: AGORA });

  assert.deepEqual(decisoes.map(d => d.assetId), ["A", "B"], "o mais antigo primeiro");
  assert.equal(decisoes[0].eligible, true, "A sai: ninguém aponta para ele");
  assert.equal(decisoes[1].eligible, true, "B sai porque A já saiu nesta passada");
});

test("08 · predecessor pulado adia o sucessor em vez de estourar 23503", () => {
  /* A ainda tem janela aberta, então não sai — e por isso B também não pode. */
  const A = candidato({ assetId: "A", replacedByAssetId: "B", purgeAfter: "2026-09-22T00:00:00.000Z" });
  const B = candidato({ assetId: "B", replacedByAssetId: "C", purgeAfter: "2026-09-21T06:00:00.000Z" });
  const C = candidato({ assetId: "C", supersededAt: null, purgeAfter: null, replacedByAssetId: null });

  const decisoes = planPurgeQueue({ candidates: [A, B], allRows: [A, B, C], now: AGORA });
  const porId = Object.fromEntries(decisoes.map(d => [d.assetId, d]));

  assert.equal(porId.A.eligible === false && porId.A.refusal, "window_open");
  assert.equal(porId.B.eligible === false && porId.B.refusal, "referenced_by_remaining",
    "adiado, não recusado para sempre: quando A sair, B passa");
});

test("09 · o ativo corrente da ponta nunca entra na fila", () => {
  const A = candidato({ assetId: "A", replacedByAssetId: "B", purgeAfter: "2026-09-21T00:00:00.000Z" });
  const B = candidato({ assetId: "B", supersededAt: null, purgeAfter: null, replacedByAssetId: null });

  const decisoes = planPurgeQueue({ candidates: [A, B], allRows: [A, B], now: AGORA });
  const porId = Object.fromEntries(decisoes.map(d => [d.assetId, d]));
  assert.equal(porId.A.eligible, true);
  assert.equal(porId.B.eligible === false && porId.B.refusal, "not_superseded");
});

/* ======================= O QUE O STORAGE DISSE ======================= */

test("10 · objeto ausente conta como removido, e a linha pode sair", () => {
  for (const ausente of [
    { error: { status: 404, message: "Object not found" } },
    { error: { statusCode: "404", message: "" } },
    { error: { message: "The resource was not found" } },
    { error: { message: "NoSuchKey" } },
    { error: { message: "no such file" } },
  ]) {
    assert.equal(classifyStorageRemoval(ausente), "already_absent", JSON.stringify(ausente));
    assert.equal(canDeleteRowAfterStorage(classifyStorageRemoval(ausente)), true);
  }
  assert.equal(classifyStorageRemoval({ error: null }), "removed");
  assert.equal(classifyStorageRemoval({}), "removed");
  assert.equal(canDeleteRowAfterStorage("removed"), true);
});

test("11 · qualquer outro erro NÃO autoriza apagar a linha", () => {
  /*
   * Rede, permissão e bucket errado deixam o arquivo onde está. Apagar a linha
   * aí seria trocar limpeza por perda de rastro: o objeto continuaria no bucket
   * sem dono e sem ninguém para reclamá-lo.
   */
  for (const falha of [
    { error: { status: 500, message: "Internal error" } },
    { error: { status: 403, message: "new row violates row-level security" } },
    { error: { message: "fetch failed" } },
    { error: { statusCode: "400", message: "Invalid bucket" } },
  ]) {
    assert.equal(classifyStorageRemoval(falha), "failed", JSON.stringify(falha));
    assert.equal(canDeleteRowAfterStorage("failed"), false);
  }
});

test("12 · o lote reporta por ativo, nunca um booleano só", () => {
  const resumo = summarizePurge([
    { assetId: "A", result: "purged", storage: "removed" },
    { assetId: "B", result: "purged", storage: "already_absent" },
    { assetId: "C", result: "storage_failed", reason: "fetch failed" },
    { assetId: "D", result: "skipped", refusal: "window_open" },
    { assetId: "E", result: "already_purged" },
    { assetId: "F", result: "referenced" },
  ]);
  assert.deepEqual(resumo, {
    total: 6, purgados: 2, ja_purgados: 1, pulados: 1, nao_elegiveis: 0,
    referenciados: 1, bloqueados_por_predecessor: 0, falhas_de_storage: 1,
  });
});

/* ======================= O QUE O REPOSITÓRIO NÃO TEM ======================= */

test("13 · nada neste módulo consegue apagar arquivo ou linha", () => {
  /*
   * A garantia de que "purga não está ativa" não é uma promessa de relatório:
   * é a ausência de I/O no único lugar que conhece as regras.
   */
  return fonte("../lib/redator/media-purge-plan.ts").then(regras => {
    const codigo = regras.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    /*
     * `\.storage\.` e não `\.storage`: o segundo casaria com
     * `candidate.storagePath`, que é um CAMPO do candidato e não um cliente.
     * O que precisa estar ausente é o acesso `client.storage.from(...)`.
     */
    assert.doesNotMatch(codigo, /server-only|getOperationalClient|\.storage\.|storage\.from\(|\.rpc\(|\.delete\(|fetch\(/);
    assert.doesNotMatch(codigo, /lifecycle_claim_writer_media_purge|lifecycle_confirm_writer_media_purge/);
  });
});

test("14 · nenhuma rota de purga existe, e nenhum cron foi criado", async () => {
  /*
   * Deixar a ação viva no servidor sem cliente seria arma carregada — o mesmo
   * raciocínio que fechou as quatro ações do Planejador no Corte 2.
   */
  const rotas = await fonte("../package.json").then(() => import("node:fs/promises"))
    .then(fs => fs.readdir(new URL("../app/api/redator/", import.meta.url)));
  assert.ok(!rotas.includes("media-purge"), "a rota de purga ainda não deve existir");

  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");
  assert.doesNotMatch(m3.replace(/^\s*--.*$/gm, ""), /pg_cron|cron\.schedule|CREATE TRIGGER/i);
});
