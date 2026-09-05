import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveGoogleAdsDemandTrend,
  formatGoogleAdsCpcMicros,
  formatGoogleAdsCpcTableValue,
  googleAdsDisplayCurrencyCode,
  googleAdsDemandTrendLabel,
  hasGoogleAdsDemandEvidence,
  isValidGoogleAdsDemandMeasurement,
  readGoogleAdsCpcEvidence,
} from "../lib/minerador/google-ads-demand.ts";

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const volumeRoute = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url), "utf8");

test("R2 deriva tendência determinística do histórico mensal", () => {
  const history = (values: number[]) => values.map((searches, index) => ({ year: 2026, month: index + 1, searches }));
  assert.equal(deriveGoogleAdsDemandTrend(history([100, 120, 140, 160])), "crescente");
  assert.equal(deriveGoogleAdsDemandTrend(history([160, 140, 120, 100])), "decrescente");
  assert.equal(deriveGoogleAdsDemandTrend(history([100, 104, 98, 102])), "estável");
  assert.equal(deriveGoogleAdsDemandTrend(history([100, 120])), "dados_insuficientes");
  assert.equal(googleAdsDemandTrendLabel("dados_insuficientes"), "Dados insuficientes");
});

test("R2 distingue medição Google Ads válida de volume legado ou nulo", () => {
  const valid = { provider: "google_ads", averageMonthlySearches: 0, measuredAt: "2026-08-18T12:00:00.000Z" };
  assert.equal(isValidGoogleAdsDemandMeasurement(valid), true);
  assert.equal(isValidGoogleAdsDemandMeasurement({ ...valid, averageMonthlySearches: null }), false);
  assert.equal(isValidGoogleAdsDemandMeasurement({ ...valid, provider: "seo-keyword-research8" }), false);
  assert.equal(hasGoogleAdsDemandEvidence({ measurement: null, eligibility: { provider: "google_ads", status: "measurement_failed", measuredAt: "2026-08-18T12:00:00.000Z" } }), true);
  assert.equal(hasGoogleAdsDemandEvidence({ volumeSource: "google_ads", volumeSearch: null }), false);
});

test("Perfil apresenta R2 como demanda operacional e preserva targeting técnico nos detalhes", () => {
  assert.match(panel, /googleAdsDemandTrendLabel\(googleAdsTrend\)/);
  assert.match(panel, /<MonthlyHistoryDetails value=\{googleAdsDisplayMeasurement\?\.monthlySearchVolumes\} \/>/);
  assert.match(panel, /Concorrência Ads/);
  assert.match(panel, /Elegibilidade por volume/);
  assert.match(panel, /formatGoogleAdsCpcMicros\(/);
  assert.match(panel, /googleAdsStageComplete/);
  assert.match(panel, /JSON\.parse\(value\)/);
  assert.doesNotMatch(panel, /profileMonthlyHistory/);
});

test("R7 humaniza CPC brasileiro sem alterar a moeda bruta", () => {
  assert.equal(googleAdsDisplayCurrencyCode("BRL", { countryCode: "BR" }), "BRL");
  assert.equal(googleAdsDisplayCurrencyCode("USD", { countryCode: "BR" }), "USD");
  assert.equal(googleAdsDisplayCurrencyCode(null, { countryCode: "BR" }), "BRL");
  assert.equal(googleAdsDisplayCurrencyCode(null, { countryCode: "US" }), null);
  assert.match(formatGoogleAdsCpcMicros(1200000, null, { countryCode: "BR" }) || "", /R\$/);
  assert.match(formatGoogleAdsCpcMicros(1200000, "USD", { countryCode: "BR" }) || "", /US\$/);
  assert.equal(formatGoogleAdsCpcMicros(1200000, null, { countryCode: "US" }), "Moeda não informada");
});

test("CPC da medição do Processador é a fonte numérica da coluna e preserva zero", () => {
  const semantic = {
    volume_measurement: {
      provider: "google_ads",
      averageMonthlySearches: 90,
      averageCpcMicros: 20490000,
      currencyCode: "BRL",
      targeting: { countryCode: "BR" },
      measuredAt: "2026-08-18T12:00:00.000Z",
    },
  };
  const evidence = readGoogleAdsCpcEvidence(semantic);
  assert.equal(evidence.source, "processor");
  assert.equal(evidence.sortValue, 20.49);
  assert.match(formatGoogleAdsCpcTableValue(evidence), /R\$\s?20,49/);

  const zeroEvidence = readGoogleAdsCpcEvidence({
    volume_measurement: { ...semantic.volume_measurement, averageCpcMicros: 0 },
  });
  assert.equal(zeroEvidence.sortValue, 0);
  assert.match(formatGoogleAdsCpcTableValue(zeroEvidence), /R\$\s?0,00/);
});

test("CPC revalidado nulo aparece como ausência e não como zero", () => {
  const evidence = readGoogleAdsCpcEvidence({
    volume_measurement: {
      provider: "google_ads",
      averageMonthlySearches: 90,
      averageCpcMicros: null,
      currencyCode: "BRL",
      targeting: { countryCode: "BR" },
      measuredAt: "2026-08-18T12:00:00.000Z",
    },
  });
  assert.equal(evidence.source, "processor");
  assert.equal(evidence.sortValue, null);
  assert.equal(formatGoogleAdsCpcTableValue(evidence), "—");
});

test("moeda real tem precedência e Brasil só completa moeda ausente", () => {
  const usd = readGoogleAdsCpcEvidence({
    volume_measurement: {
      provider: "google_ads", averageMonthlySearches: 90, averageCpcMicros: 20490000,
      currencyCode: "USD", targeting: { countryCode: "BR" }, measuredAt: "2026-08-18T12:00:00.000Z",
    },
  });
  assert.match(formatGoogleAdsCpcTableValue(usd), /US\$\s?20,49/);

  const brazilWithoutCode = readGoogleAdsCpcEvidence({
    volume_measurement: {
      provider: "google_ads", averageMonthlySearches: 90, averageCpcMicros: 20490000,
      currencyCode: null, targeting: { countryCode: "BR" }, measuredAt: "2026-08-18T12:00:00.000Z",
    },
  });
  assert.match(formatGoogleAdsCpcTableValue(brazilWithoutCode), /R\$\s?20,49/);

  const unknownCurrency = readGoogleAdsCpcEvidence({
    volume_measurement: {
      provider: "google_ads", averageMonthlySearches: 90, averageCpcMicros: 20490000,
      currencyCode: null, targeting: { countryCode: "US" }, measuredAt: "2026-08-18T12:00:00.000Z",
    },
  });
  assert.equal(formatGoogleAdsCpcTableValue(unknownCurrency), "20,49");
  assert.doesNotMatch(formatGoogleAdsCpcTableValue(unknownCurrency), /Moeda não informada/);
});

test("CPC da Discovery permanece importado até a medição do Processador", () => {
  const googleSnapshot = readGoogleAdsCpcEvidence({
    discovery_import: {
      sourceSnapshot: {
        metrics: {
          averageCpcMicros: "20490000",
          currencyCode: "BRL",
          targeting: { countryCode: "BR" },
        },
      },
    },
  });
  assert.equal(googleSnapshot.source, "imported");
  assert.equal(googleSnapshot.sortValue, 20.49);
  assert.match(formatGoogleAdsCpcTableValue(googleSnapshot), /R\$\s?20,49/);

  const csvSnapshot = readGoogleAdsCpcEvidence({
    discovery_import: { sourceSnapshot: { sourceData: { importedMetrics: { cpc: "R$ 2,50" } } } },
  });
  assert.equal(csvSnapshot.source, "imported");
  assert.equal(csvSnapshot.sortValue, 2.5);
  assert.equal(formatGoogleAdsCpcTableValue(csvSnapshot), "R$ 2,50");
});

test("Volume continua sendo a única etapa e relê a medição persistida para refletir CPC", () => {
  assert.match(volumeRoute, /includeAverageCpc:\s*true/);
  assert.match(volumeRoute, /average_cpc_micros/);
  assert.match(workspace, /select\("id,volume_search,kgr_score,volume_source,analise_semantica"\)/);
  assert.match(workspace, /const persisted = persistedByKeywordId\.get\(item\.id\)/);
  assert.doesNotMatch(workspace, /api\/minerador\/.*cpc/);
});
