import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveApprovedGraphStaleness } from "../lib/arquiteto/internal-link-graph-staleness.ts";

/**
 * MUDANÇA EM ARTIGOS ENVELHECE O GRAFO — SEM APAGÁ-LO.
 *
 * O grafo aprovado continua sendo o que foi aprovado sobre o que existia
 * então. O que a fase precisa dizer é que ele descreve uma composição
 * anterior, e que o envio ao Radar não passa enquanto isso não for revisto.
 */

const no = (entityId: string, versionId: string, label: string) => ({
  snapshot: { label },
  articleDnaVersionRef: { entityId, versionId, contentHash: `sha256:${versionId}` },
});

const vigentes = (pares: Array<[string, string]>) =>
  new Map(pares.map(([entityId, versionId]) => [entityId, { versionId }]));

test("grafo cujas versões continuam vigentes não está desatualizado", () => {
  const leitura = resolveApprovedGraphStaleness({
    graph: { versionNumber: 2, nodes: [no("article:1", "v5", "skin care rosto"), no("article:2", "v3", "skin care pele oleosa")] },
    currentArticleVersionByEntityId: vigentes([["article:1", "v5"], ["article:2", "v3"]]),
  });
  assert.equal(leitura.stale, false);
  assert.equal(leitura.reason, null);
});

test("sucessora do artigo desatualiza o grafo e o nomeia", () => {
  const leitura = resolveApprovedGraphStaleness({
    graph: { versionNumber: 2, nodes: [no("article:1", "v5", "skin care rosto"), no("article:2", "v3", "skin care pele oleosa")] },
    currentArticleVersionByEntityId: vigentes([["article:1", "v6"], ["article:2", "v3"]]),
  });
  assert.equal(leitura.stale, true);
  assert.deepEqual(leitura.staleArticles.map(item => item.entityId), ["article:1"]);
  assert.equal(leitura.staleArticles[0].currentVersionId, "v6");
  assert.match(leitura.reason!, /skin care rosto/, "a pessoa precisa saber QUAL artigo mudou");
  // O histórico é preservado: a frase precisa dizer o que fazer, não sumir.
  assert.match(leitura.reason!, /grafo aprovado é preservado/);
  assert.match(leitura.reason!, /não passam no gate de envio ao Radar/);
});

test("artigo que saiu do acervo também desatualiza", () => {
  const leitura = resolveApprovedGraphStaleness({
    graph: { versionNumber: 4, nodes: [no("article:1", "v5", "skin care rosto")] },
    currentArticleVersionByEntityId: vigentes([]),
  });
  assert.equal(leitura.stale, true);
  assert.equal(leitura.staleArticles[0].currentVersionId, null, "ausência é defasagem, não ausência de problema");
});

test("o mesmo artigo em vários nós conta uma vez", () => {
  const leitura = resolveApprovedGraphStaleness({
    graph: { versionNumber: 1, nodes: [no("article:1", "v5", "skin care rosto"), no("article:1", "v5", "skin care rosto")] },
    currentArticleVersionByEntityId: vigentes([["article:1", "v6"]]),
  });
  assert.equal(leitura.staleArticles.length, 1, "um problema não vira dois pela contagem de nós");
});

test("sem grafo aprovado não há defasagem a relatar", () => {
  assert.deepEqual(
    resolveApprovedGraphStaleness({ graph: null, currentArticleVersionByEntityId: vigentes([]) }),
    { stale: false, staleArticles: [], reason: null },
  );
});

test("a fase Links mostra a defasagem sem bloquear o processamento da sucessora", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /resolveApprovedGraphStaleness\(\{/, "a fase precisa consultar a defasagem");
  // O motivo entra na lista pela mesma porta dos outros, que ignora repetição:
  // o mesmo fato aparecia duas vezes e quebrava a chave da lista no React.
  assert.match(workspace, /anotar\(defasagem\.reason\);/, "o motivo precisa aparecer na tela");
  assert.match(workspace, /graphStale: defasagem\.stale/);
  // Processar a sucessora é o que resolve: a defasagem convoca a fase, não a trava.
  assert.ok(!/canProcess: !processBlocker && !defasagem\.stale/.test(workspace));
  assert.ok(!/canConfirm: !confirmBlocker && !defasagem\.stale/.test(workspace));
});

test("o gate do Radar continua exigindo a versão exata do artigo no grafo", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // A comparação é com a versão CANÔNICA aprovada: o grafo aponta para ela, e
  // uma proposta em edição não deve bloquear o envio por si só.
  assert.match(
    workspace,
    /internalLinkGraphApproved: Boolean\(linksApprovedGraph\?\.nodes\.some\(node => node\.articleDnaVersionRef\?\.versionId === canonical\?\.versionId\)\)/,
    "é essa comparação que impede a base nova de viajar antes da revisão",
  );
});
