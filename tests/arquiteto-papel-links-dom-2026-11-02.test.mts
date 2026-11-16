import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { React, montarRadar, type RadarDomScreen } from "./radar-dom-harness.mts";
import { SiloRoleCell } from "../modules/arquiteto/silo-role-cell.tsx";

let screen: RadarDomScreen;
test.beforeEach(async () => { screen = await montarRadar(); });
test.afterEach(() => screen.destroy());

test("Links mostra o papel declarado enquanto o Silo ainda não está consolidado", async () => {
  await screen.render(React.createElement(SiloRoleCell, { role: undefined, plan: { role: "Pilar", order: 9 }, linksMode: true }));
  assert.match(screen.get("architect-silo-role-cell").textContent!, /Pilar.*previsto no plano/);
  assert.match(screen.get("architect-silo-role-cell").getAttribute("title")!, /aguarda a consolidação/);
  await screen.render(React.createElement(SiloRoleCell, { role: undefined, plan: { role: "Suporte", order: 10 }, linksMode: true }));
  assert.match(screen.get("architect-silo-role-cell").textContent!, /Suporte.*previsto no plano/);
});

test("Links dá prioridade ao SiloDNA aprovado e não inventa papel sem fonte", async () => {
  await screen.render(React.createElement(SiloRoleCell, { role: "SUPORTE", plan: { role: "Pilar", order: 9 }, linksMode: true }));
  assert.equal(screen.get("architect-silo-role-cell").textContent, "SUPORTE");
  await screen.render(React.createElement(SiloRoleCell, { role: undefined, plan: null, linksMode: true }));
  assert.equal(screen.query("architect-silo-role-cell"), null);
  assert.match(screen.text(), /—/);
});

test("a aba Links carrega a mesma leitura do plano e atualiza a linha memoizada", () => {
  const source = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /workspaceMode === "articles" \|\| workspaceMode === "links" \? buildPlanSheetRows/);
  assert.match(source, /const linhaDoPlanoDaLinha = articleMode \|\| linksMode \? planRowOfArticle\(art\) : null/);
  assert.match(source, /declaredPlanSealsFor, planRowOfArticle \}\)/);
  assert.match(source, /<SiloRoleCell role=\{papel\} plan=\{linhaDoPlanoDaLinha\} linksMode=\{linksMode\}/);
});
