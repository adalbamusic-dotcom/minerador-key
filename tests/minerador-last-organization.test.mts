import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultMineradorOrganization, mineradorLastOrganizationKey, mineradorOrganizationButtonSummary, mineradorOrganizationLabels, normalizeMineradorLastOrganization, parseMineradorLastOrganization } from "../lib/minerador/last-organization.ts";

const page = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const restorer = readFileSync(new URL("../modules/minerador/last-organization-restorer.tsx", import.meta.url), "utf8");

test("a chave da última organização permanece isolada por usuário e marca", () => {
  assert.equal(mineradorLastOrganizationKey("ana@example.com", "marca-a"), "minerador-pro:last-view:ana@example.com:marca-a:minerador");
  assert.notEqual(mineradorLastOrganizationKey("ana@example.com", "marca-a"), mineradorLastOrganizationKey("ana@example.com", "marca-b"));
  assert.notEqual(mineradorLastOrganizationKey("ana@example.com", "marca-a"), mineradorLastOrganizationKey("bia@example.com", "marca-a"));
});

test("restaura organização válida, adapta status legado e nomeia o critério ativo", () => {
  const restored = normalizeMineradorLastOrganization({ filterStatus: "Publicado", filterIntent: "Todos", filterListId: "Todos", sortColumn: "keyword", sortDirection: "asc" }, []);
  assert.equal(restored.filterStatus, "publicado");
  assert.deepEqual(mineradorOrganizationLabels(restored, []), ["Publicados"]);
});

test("resumo mantém a ordem estável, limita a três nomes e preserva tooltip completo", () => {
  const restored = normalizeMineradorLastOrganization({
    filterStatus: "publicado", filterSitePublication: "published", filterIntent: "informational", filterListId: "silo-1",
    filterKgrApplicability: "applicable", filterSiteRelation: "Todos", filterSiteArchitecture: "Todos", filterKgrMeasurement: "Todos",
  }, ["silo-1"]);
  const labels = mineradorOrganizationLabels(restored, [{ id: "silo-1", nome: "Estética" }]);
  assert.deepEqual(labels, ["Publicados", "Publicação publicada", "Informativa", "Silo: Estética", "KGR aplicável"]);
  assert.equal(mineradorOrganizationButtonSummary(labels), "Publicados · Publicação publicada · Informativa +2");
  assert.equal(mineradorOrganizationButtonSummary([]), "Organizar");
});

test("preferência inválida ou silo inexistente retorna a organização segura sem apagar a chave", () => {
  assert.equal(parseMineradorLastOrganization("{inválido"), null);
  assert.equal(parseMineradorLastOrganization("[]"), null);
  const restored = normalizeMineradorLastOrganization({ filterStatus: "desconhecido", filterListId: "silo-removido", filterSiteRelation: "invalida" }, ["silo-atual"]);
  assert.equal(restored.filterStatus, "Todos");
  assert.equal(restored.filterListId, "Todos");
  assert.equal(restored.filterSiteRelation, "Todos");
  assert.deepEqual(normalizeMineradorLastOrganization(null), defaultMineradorOrganization);
});

test("a página restaura fora de Organizar e não usa o leitor compartilhado destrutivo", () => {
  assert.equal(page.includes("CompactSavedViews"), false);
  assert.match(page, /MineradorLastOrganizationRestorer/);
  assert.ok(page.indexOf("<MineradorLastOrganizationRestorer") < page.indexOf("{organizeOpen && ("));
  assert.match(page, /mineradorOrganizationButtonSummary\(organizeFilterLabels\)/);
  assert.match(page, /organizationHydrationPending/);
  assert.match(page, /title=\{organizeFilterLabels\.length > 3/);
  assert.equal(restorer.includes("removeItem"), false);
  assert.equal(restorer.includes("setTimeout"), false);
  assert.match(restorer, /useLayoutEffect/);
  assert.match(restorer, /hydratedKey\.current === key/);
  assert.match(restorer, /serialized === persistedValueRef\.current/);
});
