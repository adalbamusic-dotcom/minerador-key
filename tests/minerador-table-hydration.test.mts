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

test("Todos mantém keyword manual/CSV sem volume e o filtro operacional continua explícito", () => {
  assert.deepEqual(
    deriveMineradorTableRows(hydratedRows, [], filters({ volumeEligibility: "Todos" })).map(row => row.id),
    ["approved", "raw", "published"],
  );
  assert.deepEqual(
    deriveMineradorTableRows(hydratedRows, [], filters({ volumeEligibility: "operational" })).map(row => row.id),
    ["published"],
  );
});

test("CPC ordena pelo valor numérico e mantém ausentes no fim em ambas as direções", () => {
  const measurement = (averageCpcMicros: number | null) => ({
    provider: "google_ads",
    averageMonthlySearches: 90,
    averageCpcMicros,
    currencyCode: "BRL",
    targeting: { countryCode: "BR" },
    measuredAt: "2026-08-18T12:00:00.000Z",
  });
  const rows: MineradorTableRow[] = [
    { id: "cpc-100", keyword: "cpc 100", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { volume_measurement: measurement(100000000) } },
    { id: "cpc-9", keyword: "cpc 9", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { volume_measurement: measurement(9500000) } },
    { id: "cpc-20", keyword: "cpc 20", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { volume_measurement: measurement(20000000) } },
    { id: "cpc-null", keyword: "cpc ausente", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { volume_measurement: measurement(null) } },
  ];
  assert.deepEqual(
    deriveMineradorTableRows(rows, [], filters({ sortColumn: "cpc", sortDirection: "asc" })).map(row => row.id),
    ["cpc-9", "cpc-20", "cpc-100", "cpc-null"],
  );
  assert.deepEqual(
    deriveMineradorTableRows(rows, [], filters({ sortColumn: "cpc", sortDirection: "desc" })).map(row => row.id),
    ["cpc-100", "cpc-20", "cpc-9", "cpc-null"],
  );
});

test("KD ordena pelo valor numérico, preserva zero e mantém ausentes no fim", () => {
  const overview = (keywordDifficulty: number | null) => ({
    provider: "dataforseo",
    executor: "minerador_server",
    operationRequestId: "10000000-0000-4000-8000-000000000097",
    keywordDifficulty,
  });
  const rows: MineradorTableRow[] = [
    { id: "kd-42", keyword: "kd 42", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { dataforseo_keyword_overview: overview(42) } },
    { id: "kd-9", keyword: "kd 9", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { dataforseo_keyword_overview: overview(9) } },
    { id: "kd-0", keyword: "kd 0", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { dataforseo_keyword_overview: overview(0) } },
    { id: "kd-null", keyword: "kd ausente", location: "Brasil", results_allintitle: 10, volume_search: 90, kgr_score: 0.1, intent: null, status: "bruto", lista_id: null, analise_semantica: { dataforseo_keyword_overview: overview(null) } },
  ];
  assert.deepEqual(deriveMineradorTableRows(rows, [], filters({ sortColumn: "keyword_difficulty", sortDirection: "asc" })).map(row => row.id), ["kd-0", "kd-9", "kd-42", "kd-null"]);
  assert.deepEqual(deriveMineradorTableRows(rows, [], filters({ sortColumn: "keyword_difficulty", sortDirection: "desc" })).map(row => row.id), ["kd-42", "kd-9", "kd-0", "kd-null"]);
});

test("página não mantém filteredKeywords em estado e Organizar não participa da derivação", () => {
  assert.equal(page.includes("setFilteredKeywords"), false);
  assert.equal(page.includes("const [filteredKeywords"), false);
  assert.match(page, /const filteredKeywords = useMemo\(\(\) => deriveMineradorTableRows/);
  const projection = page.slice(page.indexOf("const filteredKeywords = useMemo"), page.indexOf("const handleSort"));
  assert.equal(projection.includes("organizeOpen"), false);
  assert.match(page, /const \[filterStatus, setFilterStatus\] = useState\("Todos"\)/);
  assert.match(page, /<MineradorLastOrganizationRestorer/);
  assert.match(page, /handleSort\("cpc"\)/);
  assert.match(page, /handleSort\("keyword_difficulty"\)/);
  assert.ok(page.indexOf("<MineradorLastOrganizationRestorer") < page.indexOf("{organizeOpen && ("));
});

test("barra inferior é única e oferece Status e Aplicabilidade do KGR em lote", () => {
  assert.equal((page.match(/FOOTER BATCH ACTIONS BAR/g) || []).length, 1);
  assert.match(page, /<span className="font-semibold text-foreground">\{selectedIds\.size\}<\/span>/);
  assert.match(page, /aria-label="Status"/);
  assert.match(page, /handleBatchStatus/);
  assert.match(page, /aria-label="Aplicabilidade do KGR das selecionadas"/);
  assert.match(page, /handleBatchKgrApplicability\(nextApplicability as KgrApplicability\)/);
  assert.match(page, /onClick=\{handleOpenHumanReview\}/);
  // A decisão em lote usa o mesmo vocabulário da Revisão Humana, sem ações paralelas.
  assert.doesNotMatch(page, /aria-label="Decisão KGR"/);
  assert.doesNotMatch(page, /Aprovar como KGR/);
});
