/**
 * ===== REMOÇÃO LÓGICA DO PLANEJADOR · TRAVA DE REGRESSÃO =====
 *
 * Este arquivo existe para que o Planejador não volte ao pipeline por acidente.
 * Ele trava o que o corte de 2026-09-18 JÁ entregou e deixa como `todo`, com
 * nome, o que ainda falta — porque teste vermelho não protege nada e teste
 * ausente não avisa que o trabalho ficou pela metade.
 *
 * A remoção é LÓGICA: a rota `/planejador` continua respondendo e o vocabulário
 * de leitura (`ContentPlan`, `PlannerItem`, `sent_planner`) continua legível.
 * O que precisa deixar de existir é ESCRITA NOVA pelo caminho antigo.
 *
 * Base: docs/00-produto/auditorias/auditoria-remocao-planejador-2026-09-18.md
 *       docs/00-produto/propostas/sdd-remocao-planejador-e-retencao-48h-2026-09-18.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  MODULE_STAGE, PRODUCT_FLOW, PRODUCT_MODULES, derivePipelineStates, menuEntriesForRole,
} from "../lib/editorial/navigation.ts";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("01 · com o Planejador aposentado, o Redator é o estágio 5", () => {
  assert.equal(Object.hasOwn(MODULE_STAGE, "planejador"), false, "o Planejador voltou à árvore");
  assert.equal(MODULE_STAGE.radar, 4);
  assert.equal(MODULE_STAGE.redator, 5, "REDACTOR_STAGE = 5");
  assert.equal(MODULE_STAGE.publicacoes, 6, "PUBLICACOES_STAGE = 6");
  assert.equal(MODULE_STAGE.conta, 7, "CONTA_STAGE = 7");
});

test("02 · o Planejador saiu do menu e do registro (2026-10-01)", () => {
  assert.equal(menuEntriesForRole("cliente").some(item => (item.id as string) === "planejador"), false);
  assert.equal(menuEntriesForRole("admin").some(item => (item.id as string) === "planejador"), false);
  /* A rota antiga redireciona para o Radar; o registro não a conhece mais. */
  assert.equal(Object.hasOwn(PRODUCT_MODULES, "planejador"), false);
});

test("03 · o fluxo editorial vai do Radar direto ao Redator", () => {
  assert.equal((PRODUCT_FLOW as string[]).includes("planejador"), false, "o Planejador voltou à esteira");
  assert.equal(PRODUCT_FLOW.indexOf("redator") - PRODUCT_FLOW.indexOf("radar"), 1,
    "o Radar precisa entregar direto ao Redator");
  assert.equal(PRODUCT_FLOW.at(-1), "publicacoes", "Publicações é o fim do pipeline editorial");
  /* Conta é estágio 7 da plataforma, não etapa de produção: não entra na esteira. */
  assert.equal(PRODUCT_FLOW.includes("conta"), false);
});

test("04 · o Planejador não tem estado de pipeline, nem mesmo bloqueado", () => {
  const states = derivePipelineStates({ hasBrand: true, legacyKeywordCount: 1, articleApproved: 0,
    articleProposed: 0, siloApproved: 0, conflicts: 0 });
  assert.equal(Object.hasOwn(states, "planejador"), false,
    "um estado ainda desenharia o Planejador na esteira");
  assert.equal(states.redator, "blocked");
  assert.equal(states.publicacoes, "not_started");
});

test("05 · a documentação canônica descreve Radar → Redator → Publicações", async () => {
  const fluxo = await source("../docs/00-produto/fluxo-oficial.md");
  assert.match(fluxo, /Marca → Minerador → Arquiteto → Radar → Redator → Publicações/);
  // Aposentado em 2026-10-01 (SDD sdd-aposentar-planejador-2026-10-01).
  assert.match(fluxo, /Planejador foi aposentado em 2026-10-01/);
  assert.match(fluxo, /REDACTOR_STAGE = 6/);
  assert.equal(/Radar → Planejador|Planejador → Redator/.test(fluxo), false,
    "a documentação voltou a descrever o fluxo antigo");

  const invariantes = await source("../docs/00-produto/invariantes.md");
  for (const marca of ["PLANEJADOR_STAGE = NONE", "PURGE_BY_AGE_ONLY = NO",
    "ONLY_AFTER_CONFIRMED_REPLACEMENT = YES", "RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H",
    "DNA_AND_RADAR_RETENTION = OUT_OF_SCOPE"]) {
    assert.ok(invariantes.includes(marca), `invariante ausente: ${marca}`);
  }
});

test("06 · nenhuma tela do pipeline oferece caminho de escrita pelo Planejador", async () => {
  const telas = ["../modules/radar/radar-r3-workbench.tsx", "../modules/radar/radar-r4-bulk-operations-bar.tsx",
    "../modules/radar/radar-analysis-page.tsx", "../modules/redator/writer-page.tsx"];
  for (const tela of telas) {
    const fonte = await source(tela);
    assert.equal(/Enviar ao Planejador|Enviado ao Planejador|Abrir Planejador/.test(fonte), false,
      `${tela} ainda oferece o Planejador`);
  }
});

test("07 · o vocabulário do Planejador saiu do contrato (preflight = 0)", async () => {
  const fluxo = await source("../lib/editorial/operational-flow.ts");
  assert.equal(/"sent_planner"/.test(fluxo), false, "sent_planner voltou ao enum");
  assert.equal(/plannerItemId: z\./.test(fluxo), false, "plannerItemId voltou ao contrato");
  assert.equal(/contentPlanVersionId: z\./.test(fluxo), false, "contentPlanVersionId voltou ao contrato");
});

test("08 · documento novo nasce v2; as fábricas v1 seguem isoladas no caminho histórico", async () => {
  const importacao = await source("../lib/redator/radar-import.ts");
  assert.match(importacao, /schemaVersion: 2/, "o documento vindo do Radar precisa nascer v2");
  assert.equal(/schemaVersion: 1/.test(importacao), false,
    "o caminho novo não pode fabricar ContentDocument v1");
});

/* ===== CORTE 2 · os quatro comandos de escrita não existem mais ===== */

test("09 · `import_planner`, `prepare_plan`, `approve_plan` e `start_writing` saíram do contrato", async () => {
  const contrato = await source("../lib/editorial/persistence-contracts.ts");
  const uniao = contrato.slice(contrato.indexOf("export const WorkflowCommandSchema"), contrato.indexOf("export type WorkflowCommand"));
  for (const acao of ["import_planner", "prepare_plan", "approve_plan", "start_writing"]) {
    assert.equal(uniao.includes(`z.literal("${acao}")`), false, `${acao} voltou ao contrato de comando`);
  }
  /* E os que continuam existindo seguem existindo — a remoção foi cirúrgica. */
  for (const acao of ["import_radar", "transition_radar"]) {
    assert.ok(uniao.includes(`z.literal("${acao}")`), `${acao} foi removido sem necessidade`);
  }
  /*
   * CORTE 3.5 · `import_publications` saiu depois, com o caminho local-first
   * de Publicações. Não era do Planejador, mas era a mesma classe de defeito:
   * estado de tela gravado antes da confirmação do servidor.
   */
  assert.equal(uniao.includes(`z.literal("import_publications")`), false);
});

test("10 · a rota ativa não executa mais nenhum dos quatro", async () => {
  const rota = await source("../app/api/editorial/workflow/route.ts");
  for (const acao of ["import_planner", "prepare_plan", "approve_plan", "start_writing"]) {
    assert.equal(new RegExp(`command\\.action === "${acao}"`).test(rota), false, `${acao} ainda é executado na rota`);
  }
  /* A permissão do Planejador não é mais exigida em lugar nenhum da rota. */
  assert.equal(/"planejador"/.test(rota), false, "a rota ainda pede permissão do Planejador");
  /* E `approved → sent_planner` deixou de ser transição possível. */
  assert.equal(/approved: \[[^\]]*sent_planner/.test(rota), false, "a transição para sent_planner voltou");
});

test("11 · nenhuma tela chama os métodos removidos do contexto", async () => {
  const telas = await Promise.all([
    source("../components/editorial-pipeline-context.tsx"),
    source("../components/editorial/professional-writer.tsx"),
  ]);
  for (const fonte of telas) {
    for (const metodo of ["preparePlannerItems(", "savePlannerPlan(", "approvePlannerItems(", "startWriting("]) {
      assert.equal(fonte.includes(metodo), false, `${metodo} ainda é chamado`);
    }
  }
});

test("12 · o módulo do Planejador foi apagado (2026-10-01)", async () => {
  for (const caminho of [
    "../modules/planejador/planner-page.tsx",
    "../modules/planejador/planner-cockpit-workspace.tsx",
    "../lib/planejador/content-plan.ts",
    "../app/(brand)/[brandRef]/planejador/page.tsx",
  ]) await assert.rejects(source(caminho), /ENOENT/, `${caminho} voltou`);
});

test("13 · a publicação nasce do documento, sem PlannerItem e sem ContentPlan", async () => {
  const fluxo = await source("../lib/editorial/operational-flow.ts");
  assert.equal(/export function createPublicationDraft/.test(fluxo), false, "a fábrica antiga voltou");
  assert.equal(/export function createOperationalDocument/.test(fluxo), false, "a fábrica de documento v1 voltou");
  assert.equal(/export async function createOperationalPlan/.test(fluxo), false, "a fábrica de ContentPlan voltou");
  assert.match(fluxo, /export function createWriterPublication/);
  /* A origem declarada é o Radar; plano e item ficam nulos, não fabricados. */
  assert.equal(/plannerItemId|contentPlanVersionId/.test(fluxo.slice(fluxo.indexOf("export function createWriterPublication"))), false, "a publicação nova não cita plano");
  assert.match(fluxo, /schemaVersion !== 2/, "o v2 precisa ser exigido, não assumido");
});

test("14 · `documentId` é obrigatório no contrato novo de Publicações", async () => {
  const rota = await source("../app/api/redator/publication-handoff/route.ts");
  assert.match(rota, /documentId: z\.string\(\)\.trim\(\)\.min\(1\)/,
    "o contrato precisa exigir documentId mesmo com a coluna nulável no banco");
  /* E a ordem do handoff é a que protege a fronteira. */
  const servico = await source("../lib/server/writer-publication-handoff.ts");
  for (const passo of ["VALIDAR MARCA", "VALIDAR ORIGEM RADAR", "PERSISTIR", "RELER DO SERVIDOR"]) {
    assert.ok(servico.includes(passo), `o serviço não declara o passo ${passo}`);
  }
  /* Readback falho é ERRO, nunca sucesso. */
  assert.match(servico, /writer_publication_readback_failed/);
  assert.match(servico, /writer_publication_readback_mismatch/);
});

test("15 · a tela só aceita sucesso depois do readback do servidor", async () => {
  const contexto = await source("../components/editorial-pipeline-context.tsx");
  assert.match(contexto, /corpo\?\.readbackConfirmed !== true/,
    "o cliente precisa recusar resposta sem confirmação de leitura remota");
  assert.match(contexto, /sendToPublications: async documentId/);
});

test("16 · o botão do Redator chama a mesma autoridade, sem handoff próprio", async () => {
  const writer = await source("../components/editorial/professional-writer.tsx");
  assert.match(writer, /Importar do Radar/);
  assert.match(writer, /postRadarWriterHandoffBatch/, "precisa usar o cliente único do handoff");
  /* Nada de rota própria, montagem de documento ou decisão de prontidão aqui. */
  assert.equal(/radar-writer-handoff"/.test(writer), false, "a tela não pode chamar a rota diretamente");
  assert.equal(/buildRadarDocument|resolveRadarImportEligibility/.test(writer), false,
    "a tela não pode montar documento nem decidir elegibilidade");
  /*
   * Elegível é o que o Radar FINALIZOU — RADAR_MULTI_PROFILE_HANDOFF_1.
   * O estado da esteira não move com a finalização; filtrar por ele escondia
   * YouTube e Amazon do diálogo.
   */
  assert.match(writer, /radarWriterImportable\(item, radarPrimaryProfileOfAnalysis\)/);
  assert.equal(/\["approved", "sent_writer"\]\.includes\(item\.state\)/.test(writer), false, "a esteira voltou a decidir o diálogo");
});
