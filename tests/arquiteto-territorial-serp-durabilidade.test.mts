import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TERRITORIAL_SERP_SUBJECT_TYPE,
  TERRITORIAL_SERP_WORKFLOW_STAGE,
  buildTerritorialSerpBase,
  buildTerritorialSerpWorkflowRow,
  parseTerritorialSerpWorkflowRow,
  territorialSerpBaseHash,
  territorialSerpIsStale,
  territorialSerpWorkflowState,
} from "../lib/arquiteto/territorial-serp-record.ts";
import type { TerritorialSerpAssessment, TerritorialSerpQuestion } from "../lib/arquiteto/territorial-serp.ts";

const REF_A = "territory:11111111-1111-4111-8111-111111111111";

const question: TerritorialSerpQuestion = {
  questionId: "serp:manual_silo:t1",
  kind: "manual_silo",
  territoryRef: REF_A,
  queries: [{ keywordId: "k1", keyword: "Sérum Facial", role: "primary" }],
  comparedTerritoryRef: null,
  reason: "teste",
};

const assessment: TerritorialSerpAssessment = {
  questionId: "serp:manual_silo:t1",
  kind: "manual_silo",
  territoryRef: REF_A,
  comparedTerritoryRef: null,
  compatibility: "coerente",
  observedIntent: "informacional",
  dominantType: "category",
  overlap: null,
  breadth: "broad",
  competition: "low",
  conflicts: [],
  recommendation: "manter_silo",
  reason: "A evidência externa não contradiz a hipótese interna deste silo.",
  snapshotIds: ["s1"],
  collectedAt: "2026-09-03T12:00:00.000Z",
};

const base = (facts: string[] = ["entity:sérum facial", "intent:informacional"]) =>
  buildTerritorialSerpBase({ question, subjectFacts: facts });

/* ------------------------------- identidade ------------------------------ */

test("a pergunta vira UMA linha por marca, sem tabela nem artifact_type novo", () => {
  const row = buildTerritorialSerpWorkflowRow({ assessment, base: base(), operationRequestId: "op-1" });

  assert.equal(row.subjectType, TERRITORIAL_SERP_SUBJECT_TYPE);
  assert.equal(row.stage, TERRITORIAL_SERP_WORKFLOW_STAGE);
  // `subject_id` É o questionId: a UNIQUE (marca, subject_type, subject_id,
  // stage) faz o banco garantir uma linha por pergunta.
  assert.equal(row.subjectId, assessment.questionId);
  // Pergunta arquitetural não pertence a um Article.
  assert.equal(row.articleId, null);
  assert.equal(row.state, "manter_silo");
});

test("a identidade não depende de existir território", () => {
  const semTerritorio: TerritorialSerpQuestion = {
    ...question, questionId: "serp:head_candidate:k9", kind: "head_candidate", territoryRef: null,
  };
  const row = buildTerritorialSerpWorkflowRow({
    assessment: { ...assessment, questionId: "serp:head_candidate:k9", kind: "head_candidate", territoryRef: null },
    base: buildTerritorialSerpBase({ question: semTerritorio, subjectFacts: [] }),
    operationRequestId: "op-1",
  });

  assert.equal(row.subjectId, "serp:head_candidate:k9");
  // Nenhum território é fabricado só para poder persistir a evidência.
  assert.doesNotMatch(row.subjectId, /territory:/);
});

/* --------------------------------- stale --------------------------------- */

test("mesma base, mesmo hash — ordem dos fatos não muda o resultado", () => {
  const a = territorialSerpBaseHash(base(["b", "a", "c"]));
  const b = territorialSerpBaseHash(base(["c", "b", "a"]));

  assert.equal(a, b);
  assert.match(a, /^base:[0-9a-f]{16}$/);
});

test("mudar o que define a pergunta desatualiza o parecer", () => {
  const gravado = territorialSerpBaseHash(base(["entity:sérum facial", "intent:informacional"]));

  assert.equal(territorialSerpIsStale({
    storedBaseHash: gravado,
    currentBase: base(["entity:sérum facial", "intent:informacional"]),
  }), false);
  assert.equal(territorialSerpIsStale({
    storedBaseHash: gravado,
    currentBase: base(["entity:protetor solar", "intent:informacional"]),
  }), true);
});

test("a base ignora ruído visual e normaliza a consulta", () => {
  const construida = base();

  assert.deepEqual(construida.queries, ["sérum facial"], "a consulta entra normalizada, não como digitada");
  // Só o código: o comentário explica justamente o que NÃO entra na base.
  const source = readFileSync("lib/arquiteto/territorial-serp-record.ts", "utf8")
    .split("\n")
    .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
    .join("\n");
  assert.doesNotMatch(source, /zoom|scrollTop|selectedIds|Date\.now\(\)/);
});

test("stale não apaga: o parecer continua legível", () => {
  const row = buildTerritorialSerpWorkflowRow({ assessment, base: base(), operationRequestId: "op-1" });
  const lido = parseTerritorialSerpWorkflowRow(row);

  assert.equal(lido.ok, true);
  // Mesmo desatualizado, o payload segue íntegro e recuperável.
  assert.equal(lido.payload!.assessment.recommendation, "manter_silo");
  assert.equal(territorialSerpIsStale({
    storedBaseHash: lido.payload!.baseHash,
    currentBase: base(["entity:outra coisa"]),
  }), true);
});

/* ------------------------------ leitura dura ----------------------------- */

test("linha incoerente é recusada, nunca reconciliada em silêncio", () => {
  const row = buildTerritorialSerpWorkflowRow({ assessment, base: base(), operationRequestId: "op-1" });

  const idTrocado = parseTerritorialSerpWorkflowRow({ ...row, subjectId: "outro" });
  assert.equal(idTrocado.ok, false);
  assert.ok(idTrocado.issues.includes("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"));

  const estadoTrocado = parseTerritorialSerpWorkflowRow({ ...row, state: "usar_silo_existente" });
  assert.equal(estadoTrocado.ok, false);
  assert.ok(estadoTrocado.issues.includes("STATE_DOES_NOT_MATCH_RECOMMENDATION"));

  const comArticle = parseTerritorialSerpWorkflowRow({ ...row, articleId: "article-1" });
  assert.equal(comArticle.ok, false);
  assert.ok(comArticle.issues.includes("ARTICLE_ID_PRESENT"));
});

test("o estado da linha espelha a recomendação, e só ela", () => {
  assert.equal(territorialSerpWorkflowState({ ...assessment, recommendation: "usar_silo_existente" }), "usar_silo_existente");
  assert.equal(territorialSerpWorkflowState({ ...assessment, recommendation: "evidencia_insuficiente" }), "evidencia_insuficiente");
});

/* --------------------------- contrato de storage ------------------------- */

test("a persistência reusa a tabela genérica: nenhuma DDL nova", () => {
  const store = readFileSync("lib/server/arquiteto-territorial-serp-store.ts", "utf8");

  assert.match(store, /editorial_workflow_items/);
  assert.doesNotMatch(store, /CREATE TABLE|ALTER TABLE|editorial_artifact_versions|editorial_serp_snapshots/);
  // Toda leitura e escrita é escopada pela marca do contexto autenticado.
  const consultas = store.match(/\.eq\("marca_id", context\.brandId\)/g) || [];
  assert.ok(consultas.length >= 2, "leitura e busca precisam filtrar por marca");
});

test("provider OK não é sucesso: a rota persiste E relê", () => {
  const route = readFileSync("app/api/arquiteto/territorial-serp/route.ts", "utf8");

  const ordem = ["assessTerritorialSerp(", "saveTerritorialSerpAssessment(", "readbackTerritorialSerpAssessment("];
  let anterior = -1;
  for (const marca of ordem) {
    const posicao = route.indexOf(marca);
    assert.ok(posicao > anterior, `${marca} precisa vir depois do passo anterior`);
    anterior = posicao;
  }
  // O que a UI recebe é o que voltou do remoto, não o que foi calculado.
  assert.match(route, /assessments\.push\(readback\.payload\.assessment\)/);
});

test("o boot hidrata por leitura e nunca chama provider", () => {
  const route = readFileSync("app/api/arquiteto/workspace/route.ts", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(route, /listTerritorialSerpAssessments/);
  // O GET do workspace não fala com provider algum.
  assert.doesNotMatch(route, /dataforseo|collectDataForSeoSerpSnapshot/i);
  assert.doesNotMatch(route, /fetch\(/, "o GET não chama rota de provider");
  // A hidratação do cliente vem do snapshot canônico.
  assert.match(workspace, /setTerritorialSerpAssessments\(canonical\.territorialSerp/);
  // A chamada ao provider mora só no handler de ação humana.
  const inicio = workspace.indexOf("const validateTerritorialSerp");
  assert.match(workspace.slice(inicio, inicio + 900), /fetch\("\/api\/arquiteto\/territorial-serp"/);
});

test("falha de consulta preserva o parecer válido anterior", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const inicio = workspace.indexOf("setTerritorialSerpBaseHashes(previous =>");
  const trecho = workspace.slice(inicio, inicio + 520);

  // Só entra hash de quem voltou; nada é removido por causa da falha.
  assert.match(trecho, /assessments\.some/);
  assert.doesNotMatch(trecho, /\.delete\(|new Map\(\)/);
});
