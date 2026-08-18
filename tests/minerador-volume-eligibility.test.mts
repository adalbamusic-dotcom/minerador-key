import assert from "node:assert/strict";
import test from "node:test";
import { deriveMineradorTableRows } from "../lib/minerador/table-view.ts";
import { MINIMUM_OFFICIAL_MONTHLY_VOLUME, readVolumeEligibility, setVolumeEligibility, volumeEligibilityFromOfficialMeasurement } from "../lib/minerador/volume-eligibility.ts";

const base = { results_allintitle: null, kgr_score: null, intent: null, lista_id: null, location: "Brasil", volume_source: "google_ads" };
const eligibility = (status: "pending" | "eligible" | "below_threshold" | "unavailable" | "measurement_failed", volume: number | null) => setVolumeEligibility({}, { status, measuredAt: "2026-08-03T12:00:00.000Z", provider: "google_ads", providerVersion: "v25", averageMonthlySearches: volume, googleAdsRequestId: "request" });

test("corte oficial de volume separa elegível, abaixo do corte e média indisponível", () => {
  assert.equal(MINIMUM_OFFICIAL_MONTHLY_VOLUME, 120);
  assert.equal(volumeEligibilityFromOfficialMeasurement(120), "eligible");
  assert.equal(volumeEligibilityFromOfficialMeasurement(119), "below_threshold");
  assert.equal(volumeEligibilityFromOfficialMeasurement(0), "below_threshold");
  assert.equal(volumeEligibilityFromOfficialMeasurement(null), "unavailable");
});

test("ausência de decisão permanece pendente e não é transformada em zero", () => {
  assert.equal(readVolumeEligibility({ status: "bruto", volume_search: null, analise_semantica: {} }), "pending");
});

test("visão operacional mostra elegíveis e preserva keywords publicadas", () => {
  const rows = [
    { ...base, id: "eligible", keyword: "volume confirmado", status: "bruto", volume_search: 120, analise_semantica: eligibility("eligible", 120) },
    { ...base, id: "below", keyword: "abaixo", status: "bruto", volume_search: 119, analise_semantica: eligibility("below_threshold", 119) },
    { ...base, id: "unavailable", keyword: "sem média", status: "bruto", volume_search: null, analise_semantica: eligibility("unavailable", null) },
    { ...base, id: "pending", keyword: "pendente", status: "bruto", volume_search: null, analise_semantica: {} },
    { ...base, id: "published", keyword: "publicada", status: "publicado", volume_search: 0, analise_semantica: {} },
  ];
  const filters = { searchQuery: "", status: "Todos", intent: "Todos", listId: "Todos", siteRelation: "Todos", siteArchitecture: "Todos", sitePublication: "Todos", kgrApplicability: "Todos", kgrMeasurement: "Todos", volumeEligibility: "operational" as const, sortColumn: "keyword" as const, sortDirection: "asc" as const };
  assert.deepEqual(deriveMineradorTableRows(rows, [], filters).map(row => row.id), ["published", "eligible"]);
});
