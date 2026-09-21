import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pruneRadarAnalysisHistory } from "../lib/radar/analysis-history-pruning.ts";
import {
  ANALYSIS_RUN_FIELD_NAMES,
  ANALYSIS_RUN_FIELDS,
  hasInlineAnalysisRun,
  mergeAnalysisRun,
  splitAnalysisRun,
} from "../lib/radar/analysis-run-storage.ts";

/**
 * As corridas brutas saem da linha do workflow.
 *
 * Medido em 2026-09-21: a maior linha tem 8032 kB. `appendRadarAnalysis` lê
 * a linha inteira, acrescenta UMA versão e regrava tudo — ~8 MB de descida
 * mais ~8 MB de subida por análise nova, crescendo a cada rodada.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const migration = readFileSync(
  new URL("../supabase/migrations/20260921080000_corridas_radar_em_tabela_propria.sql", import.meta.url),
  "utf8",
).replace(/^[ \t]*--.*$/gm, "");

function versaoCheia() {
  return {
    versionId: "v7",
    versionNumber: 7,
    payload: {
      status: "draft",
      extractions: [{ url: "https://exemplo.test/1", body: "peso" }],
      competitiveReport: { resumo: "peso" },
      youtubeSearch: { items: ["peso"] },
      amazonSearch: { items: ["peso"] },
      observedSummary: { total: 51 },
    },
  };
}

test("move exatamente os campos que a poda já tratava como descartáveis", () => {
  // Não é critério novo: é o que o sistema já usava para separar transporte
  // de conteúdo. Um quinto campo pesado na poda acusa este módulo atrasado.
  const antes = versaoCheia();
  const podada = pruneRadarAnalysisHistory([antes, { ...antes, versionId: "v8", versionNumber: 8 }] as never);
  const original = antes.payload as Record<string, unknown>;
  const depois = (podada[0] as { payload: Record<string, unknown> }).payload;
  const esvaziadosPelaPoda = Object.keys(original).filter(
    campo => JSON.stringify(original[campo]) !== JSON.stringify(depois[campo]),
  );

  assert.deepEqual([...ANALYSIS_RUN_FIELD_NAMES].sort(), esvaziadosPelaPoda.sort());

  // O valor vazio importa tanto quanto o nome: uma versão SEM a chave
  // falharia a validação do schema em vez de carregar leve.
  for (const campo of ANALYSIS_RUN_FIELD_NAMES) {
    assert.deepEqual(
      ANALYSIS_RUN_FIELDS[campo],
      depois[campo],
      `o vazio de ${campo} tem de ser o mesmo que a poda grava`,
    );
  }
});

test("separar e reidratar devolve a versão idêntica", () => {
  const original = versaoCheia();
  const { light, run, hasRun } = splitAnalysisRun(original as never);

  assert.equal(hasRun, true);
  assert.equal(hasInlineAnalysisRun(light), false, "a parte leve não carrega corrida");
  assert.deepEqual((light.payload as Record<string, unknown>).extractions, []);
  assert.equal((light.payload as Record<string, unknown>).amazonSearch, null);
  assert.deepEqual(
    (light.payload as Record<string, unknown>).observedSummary,
    original.payload.observedSummary,
    "o resumo fica: é dele que sai a contagem sem reabrir a corrida",
  );

  assert.deepEqual(mergeAnalysisRun(light, run), original, "a ida e a volta não perdem nada");
});

test("versão já vazia não gera linha na tabela lateral", () => {
  const vazia = {
    versionId: "v1",
    versionNumber: 1,
    payload: { status: "draft", extractions: [], competitiveReport: null, youtubeSearch: null, amazonSearch: null },
  };
  const { run, hasRun, light } = splitAnalysisRun(vazia as never);

  assert.equal(hasRun, false, "nada a separar");
  assert.deepEqual(run, {});
  // Igual em conteúdo, e cópia: separar não pode mutar o objeto de quem chamou.
  assert.deepEqual(light, vazia);
  assert.notEqual(light, vazia as never, "devolve cópia, não a mesma referência");

  // E reidratar com corrida vazia não inventa conteúdo.
  assert.deepEqual(mergeAnalysisRun(vazia as never, {}), vazia);
  assert.deepEqual(mergeAnalysisRun(vazia as never, { extractions: [] }), vazia);
});

test("reidratar não ressuscita decisão que mudou na versão", () => {
  const { light, run } = splitAnalysisRun(versaoCheia() as never);

  // Entre guardar a corrida e reidratar, o status mudou.
  const atual = { ...light, payload: { ...(light.payload as Record<string, unknown>), status: "approved" } };
  const completa = mergeAnalysisRun(atual, run);

  assert.equal((completa.payload as Record<string, unknown>).status, "approved", "a versão é quem manda");
  assert.deepEqual(
    (completa.payload as Record<string, unknown>).extractions,
    versaoCheia().payload.extractions,
    "e a corrida volta",
  );
});

test("a tabela guarda a corrida por item e versão, com a RLS do workflow", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.radar_analysis_runs/);
  assert.match(migration, /PRIMARY KEY \(workflow_item_id, version_id\)/, "a corrida pertence a um item e a uma versão");
  assert.match(migration, /REFERENCES public\.editorial_workflow_items\(id\) ON DELETE CASCADE/, "não sobra corrida órfã");

  // Mesma porta de acesso da tabela de origem: a corrida não pode ser mais
  // visível que o item de que saiu.
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /canonical_actor_can_access_brand\(marca_id, auth\.uid\(\)\)/);

  // Busca por versão sem o item em mão: uma rota recebe o versionId e procura
  // dentro do artigo.
  assert.match(migration, /radar_analysis_runs_version_idx/);
});

/* ============ a fronteira do repositório ============ */

const repositorio = readFileSync(
  new URL("../lib/server/editorial-repositories.ts", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("acrescentar uma versão não relê as corridas antigas", () => {
  // O ganho desta etapa está aqui. A linha inteira descia (8032 kB na maior),
  // uma versão era acrescentada, e tudo subia de volta — crescendo a cada
  // rodada. Acrescentar não precisa das corridas das versões antigas.
  const append = repositorio.slice(repositorio.indexOf("async appendRadarAnalysis"));
  assert.match(append, /findByArticleRaw\(marcaId, articleId, "radar"\)/, "lê cru, sem reidratar");
  assert.ok(
    !append.slice(0, append.indexOf("async ", 10)).includes("this.findByArticle("),
    "não usa a leitura que reidrata",
  );
});

test("a corrida é gravada ANTES do payload", () => {
  // A ordem inversa seria perda: payload leve gravado sem a corrida ter
  // chegado deixaria a versão sem conteúdo e sem como reconstruí-lo.
  const append = repositorio.slice(repositorio.indexOf("async appendRadarAnalysis"));
  const guarda = append.indexOf("this.guardarCorridas(");
  const grava = append.indexOf('.update({ payload,');
  assert.ok(guarda > 0 && grava > 0, "os dois passos existem");
  assert.ok(guarda < grava, "a corrida vai primeiro");
});

test("quem lê recebe a versão inteira; quem grava não devolve a corrida à linha", () => {
  // Os ~20 módulos que leem amazonSearch e companhia não sabem da tabela.
  assert.match(repositorio, /async find\(id: string\)[\s\S]{0,240}this\.reidratarCorridas\(/, "find reidrata");
  assert.match(repositorio, /async findByArticle\([\s\S]{0,240}this\.reidratarCorridas\(/, "findByArticle reidrata");

  // E a volta: um payload reidratado gravado como está devolveria as corridas
  // para dentro da linha, desfazendo a arrumação uma transição por vez.
  const transition = repositorio.slice(repositorio.indexOf("async transition("));
  const desidrata = transition.indexOf("this.desidratarPayload(");
  const grava = transition.indexOf(".update({ state, payload: aGravar");
  assert.ok(desidrata > 0 && grava > 0, "transition desidrata e grava");
  assert.ok(desidrata < grava, "desidrata antes de gravar");
});

test("o script move em dois passos, e o readback confere a fusão", () => {
  const script = readFileSync(
    new URL("../scripts/radar-mover-corridas-para-tabela.mts", import.meta.url),
    "utf8",
  );

  // Copiar e esvaziar são passos separados: entre os dois o dado fica nos
  // dois lugares, e a reidratação vira no-op. Reversível por construção.
  assert.match(script, /if \(APPLY && ESVAZIAR\) throw/, "os dois passos nunca rodam juntos");

  // O readback não confere se gravou: confere se a FUSÃO devolve a versão
  // idêntica. Copiar sem conseguir reconstruir seria pior que não copiar.
  assert.match(script, /JSON\.stringify\(refeita\) !== JSON\.stringify\(item\.original\)/);

  // E esvaziar só alcança o que já está guardado.
  assert.match(script, /corrida no payload SEM linha na tabela/);
});
