import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyDiscoveryFilters, buildDiscoveryCandidateRows, buildDiscoveryRunRow } from "../lib/minerador/discovery-persistence.ts";
import type { DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";
import type { DiscoverySearchDraft } from "../modules/minerador/discovery/discovery-types.ts";

const draft: DiscoverySearchDraft = {
  seed: "marketing para clínicas",
  relationshipMode: "Todas as palavras-chave",
  preliminaryIntent: "Comercial investigativa",
  preliminaryFunnel: "MOFU",
  language: "Português",
  countryCode: "BR",
  selectedStates: ["Todos os estados"],
  volumeFilter: "Todos",
  cpcFilter: "Todos",
  includeTerms: "",
  excludeTerms: "curso",
  includeAdultKeywords: false,
};

function candidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    candidateId: "operation:1",
    keyword: "marketing para clínicas de estética",
    canonicalKeyword: "marketing para clinicas de estetica",
    averageMonthlySearches: 240,
    monthlySearchVolumes: [],
    competition: "MEDIUM",
    competitionIndex: 40,
    lowTopOfPageBidMicros: "1000000",
    highTopOfPageBidMicros: "2000000",
    averageCpcMicros: "500000",
    currencyCode: "BRL",
    timeZone: "America/Sao_Paulo",
    targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    source: "google_ads",
    sourceData: null,
    provider: "google_ads",
    providerVersion: "v25",
    measuredAt: "2026-08-03T00:00:00.000Z",
    existingKeywordId: null,
    ...overrides,
  };
}

test("persistência mantém todas as candidatas e classifica aprovadas e filtradas", () => {
  const candidates = [candidate(), candidate({ candidateId: "operation:2", keyword: "curso de marketing para clínicas", canonicalKeyword: "curso de marketing para clinicas" })];
  const applied = applyDiscoveryFilters(candidates, draft);
  assert.equal(applied.acceptedCandidates.length, 1);
  assert.equal(applied.decisions.length, 2);
  assert.equal(applied.decisions[1].decision.outcome, "excluded_term");
  const rows = buildDiscoveryCandidateRows({ brandId: "00000000-0000-0000-0000-000000000001", runId: "00000000-0000-0000-0000-000000000002", draft, candidates, decisions: applied.decisions });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].filter_outcome, "approved");
  assert.equal(rows[1].filter_outcome, "excluded_term");
  assert.equal(rows[0].brand_id, "00000000-0000-0000-0000-000000000001");
});

test("run preserva tenant, operação, targeting, filtros e proveniência", () => {
  const row = buildDiscoveryRunRow({
    id: "00000000-0000-0000-0000-000000000002",
    brandId: "00000000-0000-0000-0000-000000000001",
    actorUserId: "00000000-0000-0000-0000-000000000003",
    operationRequestId: "00000000-0000-0000-0000-000000000004",
    draft,
    targeting: { countryCode: "BR", countryLabel: "Brasil", selectedStates: [], stateLabels: [], geoTargetConstants: ["geoTargetConstants/2076"], language: "languageConstants/1014", keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    providerVersion: "v25",
    currencyCode: "BRL",
    timeZone: "America/Sao_Paulo",
    status: "completed",
    receivedCount: 2,
    normalizedCount: 2,
    approvedCount: 1,
    filteredCount: 1,
    responseTruncated: false,
    executedAt: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(row.brand_id, "00000000-0000-0000-0000-000000000001");
  assert.equal(row.operation_request_id, "00000000-0000-0000-0000-000000000004");
  assert.equal(row.provider_version, "v25");
  assert.equal(row.language_constant, "languageConstants/1014");
  assert.equal(row.filtered_count, 1);
});

test("run partial finalizado preserva completed_at para importacao elegivel", () => {
  const row = buildDiscoveryRunRow({
    id: "00000000-0000-0000-0000-000000000010",
    brandId: "00000000-0000-0000-0000-000000000001",
    actorUserId: "00000000-0000-0000-0000-000000000003",
    operationRequestId: "00000000-0000-0000-0000-000000000011",
    draft,
    targeting: { countryCode: "BR", countryLabel: "Brasil", selectedStates: [], stateLabels: [], geoTargetConstants: ["geoTargetConstants/2076"], language: "languageConstants/1014", keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    providerVersion: "v25",
    currencyCode: "BRL",
    timeZone: "America/Sao_Paulo",
    status: "partial",
    receivedCount: 1000,
    normalizedCount: 1000,
    approvedCount: 10,
    filteredCount: 990,
    responseTruncated: true,
    executedAt: "2026-08-04T00:00:00.000Z",
  });
  assert.equal(row.status, "partial");
  assert.equal(row.completed_at, "2026-08-04T00:00:00.000Z");
});

test("migration e rota preservam idempotência, reload e proteção tenantizada", () => {
  const migration = readFileSync(new URL("../supabase/migrations/0009_minerador_discovery_persistence.sql", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url), "utf8");
  for (const token of ["minerador_discovery_runs", "minerador_discovery_candidates", "brand_id", "operation_request_id", "ROW LEVEL SECURITY", "ON DELETE RESTRICT", "persist_minerador_discovery_run", "tenant_actor_has_permission"]) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(route, /export async function GET/);
  assert.match(route, /operation_request_id/);
  assert.match(route, /persist_minerador_discovery_run/);
  assert.match(route, /DISCOVERY_PERSISTENCE_UNAVAILABLE/);
  assert.match(route, /apiRequestStarted/);
  const getHandler = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.doesNotMatch(getHandler, /createGoogleAdsRestClient|generateGoogleAdsKeywordIdeas|fetch\s*\(/);
});
