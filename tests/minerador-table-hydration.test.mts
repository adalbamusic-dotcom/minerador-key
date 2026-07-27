import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveMineradorTableRows, type MineradorTableFilters, type MineradorTableRow } from "../lib/minerador/table-view.ts";

const page = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

const filters = (overrides: Partial<MineradorTableFilters> = {}): MineradorTableFilters => ({
  searchQuery: "", status: "Todos", intent: "Todos", listId: "Todos", siteRelation: "Todos", siteArchitecture: "Todos", sitePublication: "Todos", kgrApplicability: "Todos", kgrMeasurement: "Todos", sortColumn: "keyword", sortDirection: "asc", ...overrides,
});

const hydratedRows: MineradorTableRow[] = [
  { id: "raw", keyword: "keyword bruta", location: "Brasil", results_allintitle: null, volume_search: null, kgr_score: null, intent: null, status: "bruto", lista_id: null },
  { id: "approved", keyword: "keyword aprovada", location: "Brasil", results_allintitle: 6, volume_search: 50, kgr_score: 0.12, intent: "informacional", status: "aprovado", lista_id: "silo-1", analise_semantica: { nicho_override: "Estética", site_origin: { sourceUrl: "https://example.com/keyword", declaredCanonicalUrl: "https://example.com/keyword", keywordUrlRelation: "confirmed_primary", publicationStatus: "published" } } },
  { id: "published", keyword: "keyword publicada", location: "Brasil", results_allintitle: 2, volume_search: 100, kgr_score: 0.02, intent: "comercial", status: "publicado", lista_id: "silo-1", analise_semantica: { site_origin: { sourceUrl: "https://example.com/publicada", declaredCanonicalUrl: "https://example.com/publicada", architectureStatus: "architecture_confirmed" } } },
];

test("hidratação posterior exibe imediatamente todos os dados sem abrir Organizar", () => {
  assert.deepEqual(deriveMineradorTableRows([], [{ id: "silo-1", nome: "Silo" }], filters()), []);
  const visible = deriveMineradorTableRows(hydratedRows, [{ id: "silo-1", nome: "Silo" }], filters());
  assert.deepEqual(visible.map(row => row.id), ["approved", "raw", "published"]);
  assert.equal(visible.find(row => row.id === "approved")?.results_allintitle, 6);
  assert.equal(visible.find(row => row.id === "approved")?.volume_search, 50);
  assert.equal(visible.find(row => row.id === "approved")?.kgr_score, 0.12);
  assert.equal(visible.find(row => row.id === "approved")?.analise_semantica?.nicho_override, "Estética");
});

test("abertura de Organizar não participa da projeção nem altera a coleção original", () => {
  const before = structuredClone(hydratedRows);
  const closed = deriveMineradorTableRows(hydratedRows, [{ id: "silo-1", nome: "Silo" }], filters());
  const opened = deriveMineradorTableRows(hydratedRows, [{ id: "silo-1", nome: "Silo" }], filters());
  assert.deepEqual(opened, closed);
  assert.deepEqual(hydratedRows, before);
});

test("filtros recalculam a visão sem ocultar aprovados ou publicados no padrão", () => {
  assert.equal(deriveMineradorTableRows(hydratedRows, [], filters()).length, 3);
  assert.deepEqual(deriveMineradorTableRows(hydratedRows, [], filters({ status: "aprovado" })).map(row => row.id), ["approved"]);
  assert.deepEqual(deriveMineradorTableRows(hydratedRows, [], filters({ searchQuery: "publicada" })).map(row => row.id), ["published"]);
});

test("página não mantém filteredKeywords em estado e Organizar não participa da derivação", () => {
  assert.equal(page.includes("setFilteredKeywords"), false);
  assert.equal(page.includes("const [filteredKeywords"), false);
  assert.match(page, /const filteredKeywords = useMemo\(\(\) => deriveMineradorTableRows/);
  const projection = page.slice(page.indexOf("const filteredKeywords = useMemo"), page.indexOf("const handleSort"));
  assert.equal(projection.includes("organizeOpen"), false);
  assert.match(page, /const \[filterStatus, setFilterStatus\] = useState\("Todos"\)/);
  assert.match(page, /<MineradorLastOrganizationRestorer/);
  assert.ok(page.indexOf("<MineradorLastOrganizationRestorer") < page.indexOf("{organizeOpen && ("));
});

test("barra inferior é única e integra contador e decisão KGR", () => {
  assert.equal((page.match(/FOOTER BATCH ACTIONS BAR/g) || []).length, 1);
  assert.match(page, /\{selectedIds\.size\} selecionada/);
  assert.match(page, /aria-label="Decisão KGR"/);
  assert.match(page, /Decisão KGR/);
});
