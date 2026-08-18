import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createGoogleAdsRestClient } from "../lib/google/ads/client.ts";
import { GoogleAdsError } from "../lib/google/ads/errors.ts";
import { discoveryGeoTargetConstants, resolveDiscoveryTargeting } from "../lib/minerador/google-ads-discovery-catalog.ts";

const config = {
  developerToken: "developer-token-fixture",
  clientId: "client-id-fixture",
  clientSecret: "client-secret-fixture",
  refreshToken: "refresh-token-fixture",
  loginCustomerId: null,
  apiVersion: "v25" as const,
};

test("Brasil, uma UF e varias UFs montam somente os resources correspondentes", () => {
  assert.deepEqual(discoveryGeoTargetConstants(["Todos os estados"]), ["geoTargetConstants/2076"]);
  assert.deepEqual(discoveryGeoTargetConstants(["SP"]), ["geoTargetConstants/20106"]);
  assert.deepEqual(discoveryGeoTargetConstants(["SP", "MG"]), ["geoTargetConstants/20106", "geoTargetConstants/20094"]);
  assert.equal(resolveDiscoveryTargeting(["SP", "MG"]).geoTargetConstants.includes("geoTargetConstants/2076"), false);
});

test("entrada vazia, resource livre e mistura nacional falham antes do provider", () => {
  assert.throws(() => resolveDiscoveryTargeting(["SP", ""]), /GOOGLE_ADS_INVALID_GEO_TARGET/);
  assert.throws(() => resolveDiscoveryTargeting(["geoTargetConstants/20106"]), /GOOGLE_ADS_INVALID_GEO_TARGET/);
  assert.throws(() => resolveDiscoveryTargeting(["Todos os estados", "MG"]), /GOOGLE_ADS_MIXED_GEO_TARGETS/);
});

test("erro da Google Ads preserva codigo, campo e requestId sem expor payload bruto", async () => {
  const client = createGoogleAdsRestClient({
    config,
    getAccessToken: async () => "access-token-fixture",
    fetchFn: async () => new Response(JSON.stringify({
      error: {
        status: "INVALID_ARGUMENT",
        details: [{
          errors: [{
            errorCode: { geoTargetConstantError: "INVALID_GEO_TARGET_CONSTANT" },
            location: { fieldPathElements: [{ fieldName: "geo_target_constants", index: 1 }] },
          }],
        }],
      },
    }), { status: 400, headers: { "content-type": "application/json", "request-id": "provider-request-1" } }),
  });
  await assert.rejects(() => client.generateKeywordIdeas("1234567890", { keywordSeed: { keywords: ["teste"] }, geoTargetConstants: ["geoTargetConstants/20106", "geoTargetConstants/20094"] }), (error: unknown) => {
    assert.ok(error instanceof GoogleAdsError);
    assert.equal(error.code, "google_ads_invalid_request");
    assert.equal(error.requestId, "provider-request-1");
    assert.equal(error.providerCode, "geoTargetConstantError:INVALID_GEO_TARGET_CONSTANT");
    assert.equal(error.providerField, "geo_target_constants[1]");
    return true;
  });
});

test("rota preserva a pesquisa valida e so persiste depois do provider", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url), "utf8");
  assert.match(route, /resolvedGeoTargetConstants/);
  assert.match(route, /receivedStateValues/);
  assert.match(route, /providerErrorCode/);
  assert.match(route, /failedField/);
  assert.match(route, /customerIdRef/);
  assert.match(route, /GOOGLE_ADS_GEO_TARGET_INVALID/);
  assert.ok(route.indexOf("generateGoogleAdsKeywordIdeas") < route.indexOf("persist_minerador_discovery_run"));
  assert.doesNotMatch(route, /importar|importação|importacao/i);
});
