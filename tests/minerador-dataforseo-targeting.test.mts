import test from "node:test";
import assert from "node:assert/strict";
import { DataForSeoTargetingError, resolveDataForSeoTargeting } from "../lib/minerador/dataforseo-targeting.ts";

test("resolve Brasil para o catálogo DataForSEO e converte idioma Google Ads", () => {
  const targeting = resolveDataForSeoTargeting({ geoTargetConstants: ["geoTargetConstants/2076"], languageCode: "languageConstants/1014", locationCode: 2076 });
  assert.deepEqual(targeting, { countryCode: "BR", locationCode: 2076, locationLabel: "Brasil", languageCode: "pt", catalogVersion: "2026-08-04-br-country", sourceGeoTargetConstants: ["geoTargetConstants/2076"] });
});

test("não assume que UFs Google Ads são localidades DataForSEO", () => {
  assert.throws(() => resolveDataForSeoTargeting({ geoTargetConstants: ["geoTargetConstants/2076", "geoTargetConstants/1003"], languageCode: "languageConstants/1014", locationCode: 2076 }), (error: unknown) => error instanceof DataForSeoTargetingError && error.code === "dataforseo_location_unsupported");
});

