import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  blockedByIncompleteDependencies,
  firstIssueMessage,
  loadStateSummary,
  rejectedPaths,
  resolveLoadState,
  type IncompatibleRecord,
} from "../lib/editorial/partial-read.ts";

/**
 * LEITURA PARCIAL — um registro incompatível não pode esconder os demais.
 *
 * O defeito real: `Schema.parse()` dentro do laço de `WorkflowRepository.list`.
 * Uma linha em formato anterior derrubava a consulta inteira, e junto iam os
 * artigos bons e os itens do Planejador da MESMA marca.
 */

const read = (relative: string) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");
const REPOS = "lib/server/editorial-repositories.ts";
const ROUTE = "app/api/editorial/workspace/route.ts";
const CLIENT = "components/editorial-pipeline-context.tsx";

const executable = (source: string) =>
  source.split("\n").filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
  }).join("\n");

const incompativel = (overrides: Partial<IncompatibleRecord> = {}): IncompatibleRecord => ({
  kind: "workflow_item",
  id: "row-1",
  articleId: "art-A",
  stage: "radar",
  paths: ["hydration.principalKeyword"],
  message: "hydration.principalKeyword: obrigatório",
  ...overrides,
});

/* ---- os cinco desfechos que antes chegavam como lista vazia ------------- */

test("01 · vazio confirmado, parcial e falha de leitura são estados distintos", () => {
  assert.equal(resolveLoadState({ loadedCount: 3, incompatibleCount: 0 }), "complete");
  assert.equal(resolveLoadState({ loadedCount: 0, incompatibleCount: 0 }), "empty_confirmed");
  assert.equal(resolveLoadState({ loadedCount: 2, incompatibleCount: 1 }), "partial");
  assert.equal(resolveLoadState({ loadedCount: 0, incompatibleCount: 0, queryFailed: true }), "read_failure");
  assert.equal(resolveLoadState({ loadedCount: 0, incompatibleCount: 0, accessDenied: true }), "access_denied");
});

test("02 · zero itens COM incompatíveis é parcial, nunca vazio confirmado", () => {
  // A marca tem trabalho; ele é que não está legível. Chamar isso de vazio
  // faria a tela convidar a importar por cima do que já existe.
  assert.equal(resolveLoadState({ loadedCount: 0, incompatibleCount: 2 }), "partial");
});

test("03 · falha de leitura não pode ser apresentada como marca vazia", () => {
  const falha = loadStateSummary({ state: "read_failure", loadedCount: 0, incompatible: [], message: null });
  const vazio = loadStateSummary({ state: "empty_confirmed", loadedCount: 0, incompatible: [], message: null });
  assert.notEqual(falha, vazio);
  assert.match(falha, /novamente/i, "falha pede nova tentativa");
  assert.doesNotMatch(vazio, /novamente/i, "vazio confirmado não pede");
});

test("04 · o parcial conta os dois lados: carregados e incompatíveis", () => {
  const resumo = loadStateSummary({
    state: "partial",
    loadedCount: 5,
    incompatible: [incompativel(), incompativel({ id: "row-2" })],
    message: null,
  });
  assert.match(resumo, /5 item/);
  assert.match(resumo, /2 registro/);
});

/* ---- o leitor: isolamento por linha, sem afrouxar schema ---------------- */

test("05 · o leitor do workflow valida POR LINHA e continua o laço", () => {
  const fonte = executable(read(REPOS));
  const inicio = fonte.indexOf("async list(marcaId: string) {");
  const corpo = fonte.slice(inicio, fonte.indexOf("async find(id: string)", inicio));

  assert.match(corpo, /safeParse\(base\)/, "valida por linha");
  assert.match(corpo, /if \(!parsed\.success\)/);
  assert.match(corpo, /continue;/, "linha ruim não interrompe o laço");
  assert.match(corpo, /incompatible\.push\(\{/, "e é nomeada, não descartada");
  // O schema NÃO foi afrouxado: sem passthrough, sem default inventado.
  assert.ok(!corpo.includes("passthrough"), "não afrouxa o schema");
  assert.ok(!corpo.includes("RadarItemSchema.parse("), "não sobrou parse estrito no laço");
});

test("06 · o leitor de artefatos e o de eventos têm a mesma proteção", () => {
  const fonte = executable(read(REPOS));
  assert.ok(!fonte.includes("VersionedArticleDNASchema.parse(versionPayload"), "artefato sem parse estrito no laço");
  assert.match(fonte, /parsedArtifact\.success/);
  // Evento inválido não pode derrubar artefatos já lidos.
  assert.match(fonte, /parsedEvent\.success/);
  assert.ok(!fonte.includes("VersionStatusEventSchema.parse({ eventId"), "evento sem map com parse estrito");
});

test("07 · um item inválido do Radar não pode ocultar os do Planejador", () => {
  // Os dois saem do MESMO laço e da mesma consulta. A prova é estrutural: a
  // recusa da linha precede o preenchimento dos dois estágios.
  const fonte = executable(read(REPOS));
  const inicio = fonte.indexOf("async list(marcaId: string) {");
  const corpo = fonte.slice(inicio, fonte.indexOf("async find(id: string)", inicio));
  const guarda = corpo.indexOf("continue;");
  const empurraRadar = corpo.indexOf("radar.push(");
  const empurraPlanner = corpo.indexOf("planner.push(");
  assert.ok(guarda > 0 && guarda < empurraRadar && guarda < empurraPlanner);
  assert.match(corpo, /return \{ radar, planner, incompatible \}/);
});

/* ---- propagação até a tela --------------------------------------------- */

test("08 · a rota devolve os incompatíveis dos dois leitores", () => {
  const rota = executable(read(ROUTE));
  assert.match(rota, /loadDiagnostics: \{/);
  assert.match(rota, /workflow\.incompatible, \.\.\.artifacts\.incompatible/);
  assert.match(rota, /resolveLoadState\(\{/);
});

test("09 · o cliente preserva falha como falha, e 401/403 como acesso negado", () => {
  const cliente = executable(read(CLIENT));
  assert.match(cliente, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(cliente, /"access_denied" : "read_failure"/);
  assert.match(cliente, /state: "read_failure"/, "o catch de rede também declara falha");
});

/* ---- dependências incompletas bloqueiam -------------------------------- */

test("10 · artigo com dependência incompatível não é transferido", () => {
  const bloqueios = blockedByIncompleteDependencies({
    articleIds: ["art-A", "art-B"],
    incompatible: [incompativel({ articleId: "art-A" })],
  });
  assert.equal(bloqueios.length, 1);
  assert.equal(bloqueios[0].articleId, "art-A");
  assert.equal(bloqueios[0].reason, "DEPENDENCIA_INCOMPATIVEL");
  assert.match(bloqueios[0].detail, /hydration\.principalKeyword/, "o motivo nomeia o caminho");
});

test("11 · incompatível de outro artigo não bloqueia quem está íntegro", () => {
  const bloqueios = blockedByIncompleteDependencies({
    articleIds: ["art-B"],
    incompatible: [incompativel({ articleId: "art-A" })],
  });
  assert.deepEqual(bloqueios, [], "a recusa é por artigo, não por lote");
});

test("12 · dependência ausente também bloqueia, com motivo próprio", () => {
  const bloqueios = blockedByIncompleteDependencies({
    articleIds: ["art-C"],
    incompatible: [],
    missingArticleIds: ["art-C"],
  });
  assert.equal(bloqueios[0].reason, "DEPENDENCIA_AUSENTE");
});

test("13 · o importador consulta o bloqueio antes de escrever", () => {
  const cliente = executable(read(CLIENT));
  const inicio = cliente.indexOf("importApprovedToRadar: async");
  const corpo = cliente.slice(inicio, cliente.indexOf("importApprovedSiloPagesToRadar", inicio));
  const bloqueio = corpo.indexOf("blockedByIncompleteDependencies");
  const envio = corpo.indexOf("sendWorkflowCommand");
  assert.ok(bloqueio > 0 && bloqueio < envio, "o bloqueio precede o envio");
});

/* ---- utilitários de diagnóstico ---------------------------------------- */

test("14 · caminhos e mensagem do Zod chegam legíveis", () => {
  const issues = [
    { path: ["hydration", "principalKeyword"], message: "obrigatório" },
    { path: [], message: "raiz inválida" },
    { path: ["silo", 0, "id"], message: "esperado string" },
  ];
  assert.deepEqual(rejectedPaths(issues), ["hydration.principalKeyword", "silo.0.id"]);
  assert.equal(firstIssueMessage(issues, "fallback"), "hydration.principalKeyword: obrigatório");
  assert.equal(firstIssueMessage([], "fallback"), "fallback");
});
