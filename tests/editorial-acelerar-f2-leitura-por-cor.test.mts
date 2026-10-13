import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORKSPACE_GROUP_NONE,
  lightArtifactSelection,
  mergeScopedById,
  scopedRecoveryKey,
  workspaceReadScopeFor,
  workspaceReadUrl,
} from "../lib/editorial/workspace-read-scope.ts";

/*
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 6
 * (F2): o Radar lê só a cor escolhida e a mesa leve. Regras puras + leitura
 * estrutural da rota e do pipeline; sem banco.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");

const G = "11111111-1111-4111-8111-111111111111";

test("item 6 · o recorte: cor de um grupo, sem grupo, todos; cor pendente espera; cor com dois grupos lê tudo", () => {
  assert.deepEqual(workspaceReadScopeFor({ filter: { kind: "groups", groupIds: [G] }, pending: false, detail: "light" }), { ready: true, scope: { groupId: G, detail: "light" } });
  assert.deepEqual(workspaceReadScopeFor({ filter: { kind: "none" }, pending: false }).scope, { groupId: WORKSPACE_GROUP_NONE, detail: "full" });
  assert.deepEqual(workspaceReadScopeFor({ filter: { kind: "all" }, pending: false }).scope, { groupId: null, detail: "full" });
  assert.equal(workspaceReadScopeFor({ filter: { kind: "groups", groupIds: [] }, pending: true }).ready, false, "nunca lê tudo por engano");
  assert.equal(workspaceReadScopeFor({ filter: { kind: "groups", groupIds: [G, "outro"] }, pending: false }).scope.groupId, null);
});

test("item 6 · sem parâmetro a URL é exatamente a de sempre; o recorte e a leve só acrescentam", () => {
  assert.equal(workspaceReadUrl("b1", null), "/api/editorial/workspace?marcaId=b1");
  assert.equal(workspaceReadUrl("b1", { groupId: null, detail: "full" }), "/api/editorial/workspace?marcaId=b1");
  assert.equal(workspaceReadUrl("b1", { groupId: G, detail: "light" }), `/api/editorial/workspace?marcaId=b1&groupId=${G}&detail=light`);
  assert.equal(scopedRecoveryKey("k", null), "k");
  assert.equal(scopedRecoveryKey("k", G), `k:${G}`);
});

test("item 6 · detail=light: só a vigente e a última aprovada, mais as referenciadas, com os eventos delas", () => {
  const v = (articleId: string, n: number) => ({ versionId: `${articleId}-v${n}`, versionNumber: n, payload: { articleId } });
  const s = (siloId: string, n: number) => ({ versionId: `${siloId}-v${n}`, versionNumber: n, payload: { siloId } });
  const articles = [v("a", 1), v("a", 2), v("a", 3), v("a", 4), v("b", 1)];
  const silos = [s("s", 1), s("s", 2)];
  const events = [
    { versionId: "a-v1", status: "approved" }, { versionId: "a-v2", status: "approved" }, { versionId: "a-v3", status: "proposed" },
    { versionId: "b-v1", status: "approved" }, { versionId: "s-v1", status: "approved" }, { versionId: "s-v2", status: "approved" },
  ];
  const leve = lightArtifactSelection({
    articles, silos, events,
    articleOf: x => ({ versionId: x.versionId, versionNumber: x.versionNumber, entityKey: x.payload.articleId }),
    siloOf: x => ({ versionId: x.versionId, versionNumber: x.versionNumber, entityKey: x.payload.siloId }),
    keepVersionIds: new Set(["a-v1"]),
  });
  assert.deepEqual(leve.articles.map(x => x.versionId), ["a-v1", "a-v2", "a-v4", "b-v1"], "a-v4 vigente, a-v2 última aprovada, a-v1 referenciada (item do Radar)");
  assert.deepEqual(leve.silos.map(x => x.versionId), ["s-v2"]);
  assert.deepEqual(leve.events.map(x => x.versionId), ["a-v1", "a-v2", "b-v1", "s-v2"]);
  assert.equal(leve.droppedVersions, 2);
});

test("item 6 · ler um grupo não remove o que a memória tem de outro grupo", () => {
  const atual = [{ id: "p1", articleId: "a" }, { id: "p2", articleId: "b" }];
  const lidas = [{ id: "p1b", articleId: "a" }];
  const doGrupo = new Set(["a"]);
  assert.deepEqual(mergeScopedById(atual, lidas, item => doGrupo.has(item.articleId)).map(item => item.id), ["p2", "p1b"]);
  assert.deepEqual(mergeScopedById(atual, [], item => doGrupo.has(item.articleId)).map(item => item.id), ["p2"], "o grupo lido vazio só esvazia o próprio grupo");
});

test("item 6 · a rota: sem detail, o corpo de sempre; com light, a seleção leve; histórico sob demanda", () => {
  const rota = semComentarios(readFileSync("app/api/editorial/workspace/route.ts", "utf8"));
  assert.match(rota, /const leve = request\.nextUrl\.searchParams\.get\("detail"\) === "light";/);
  assert.match(rota, /const artifacts = leve \? \(\(\) => \{[\s\S]*?lightArtifactSelection\(\{[\s\S]*?\}\)\(\) : artifactsLidos;/);
  assert.match(rota, /\.\.\.workflow\.radar\.map\(item => item\.articleDnaVersionId\)/, "a versão transportada pelo item do Radar nunca sai");
  const historico = semComentarios(readFileSync("app/api/editorial/workspace/versions/route.ts", "utf8"));
  assert.match(historico, /assertEditorialPermission\(profile, parsed\.data\.marcaId, "marca", "view"\)/);
  assert.match(historico, /listScoped\(parsed\.data\.marcaId, \[parsed\.data\.entityId\]\)/);
  assert.doesNotMatch(historico, /\.insert\(|\.update\(|\.delete\(/);
});

test("item 6 · o pipeline: só a rota do Radar recorta; a cor pendente espera; fora do Radar relê inteiro", () => {
  const pipeline = semComentarios(readFileSync("components/editorial-pipeline-context.tsx", "utf8"));
  assert.match(pipeline, /const rotaDoRadar = \/\(\^\|\\\/\)radar\(\\\/\|\$\)\/\.test\(pathname \|\| ""\);/);
  assert.match(pipeline, /useAreaGroupFilter\(rotaDoRadar \? selectedBrandId \|\| null : null, "radar"\)/);
  assert.match(pipeline, /if \(!escopo\.ready\) \{ leituraEsperandoEscopo\.current = \{ pending: true, snapshot: sourceSnapshot \}; return; \}/);
  assert.match(pipeline, /fetch\(workspaceReadUrl\(selectedBrandId, recorte\), \{ cache: "no-store" \}\)/);
  assert.match(pipeline, /mergeScopedById\(current\.operationalPublications, persisted\.publications, publication => artigosDoRecorte\.has\(publication\.articleId\)\)/);
  assert.match(pipeline, /escopoDaMesa\.scope \? ultima === "grupo" : ultima !== "inteira"/);
  assert.match(pipeline, /scopedRecoveryKey\(base, escopoDaMesaRef\.current\.scope\?\.groupId\)/);
});
