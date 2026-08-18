import assert from "node:assert/strict";
import test from "node:test";
import {
  getGoogleAdsPlatformConfig,
  GoogleAdsPlatformConfigError,
} from "../lib/google/ads/config.ts";
import {
  createGoogleAdsCanonicalClient,
  resolveGoogleAdsCanonicalContext,
} from "../lib/server/google-ads-canonical.ts";

const ENV = {
  GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
  GOOGLE_ADS_CLIENT_ID: "client-id",
  GOOGLE_ADS_CLIENT_SECRET: "client-secret",
  GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: "111-222-3333",
  GOOGLE_ADS_RESEARCH_CUSTOMER_ID: "444 555 6666",
  GOOGLE_ADS_API_VERSION: "invalid-version",
};

test("platform resolver requires all six env variables and normalizes both customer IDs", () => {
  const config = getGoogleAdsPlatformConfig(ENV);
  assert.equal(config.loginCustomerId, "1112223333");
  assert.equal(config.researchCustomerId, "4445556666");
  assert.equal(config.apiVersion, "v25");
  assert.equal(config.developerToken, ENV.GOOGLE_ADS_DEVELOPER_TOKEN);
});

test("platform resolver reports missing and invalid Research Customer ID without exposing secrets", () => {
  const missing: Partial<typeof ENV> = { ...ENV };
  delete missing.GOOGLE_ADS_RESEARCH_CUSTOMER_ID;
  assert.throws(() => getGoogleAdsPlatformConfig(missing), (error: unknown) => error instanceof GoogleAdsPlatformConfigError && error.code === "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_MISSING");

  assert.throws(() => getGoogleAdsPlatformConfig({ ...ENV, GOOGLE_ADS_RESEARCH_CUSTOMER_ID: "123" }), (error: unknown) => error instanceof GoogleAdsPlatformConfigError && error.code === "GOOGLE_ADS_PLATFORM_RESEARCH_CUSTOMER_INVALID");
  assert.doesNotMatch(JSON.stringify(new GoogleAdsPlatformConfigError("GOOGLE_ADS_PLATFORM_ENV_MISSING", "safe")), /developer-token|client-secret|refresh-token/i);
});

test("canonical context carries actor, agency and brand while resolving account only from platform env", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    const context = await resolveGoogleAdsCanonicalContext({ actorUserId: "actor", agencyId: "agency", brandId: "brand", operation: "metrics" });
    assert.equal(context.actorUserId, "actor");
    assert.equal(context.agencyId, "agency");
    assert.equal(context.brandId, "brand");
    assert.equal(context.customerId, "4445556666");
    assert.equal(context.managerCustomerId, "1112223333");
    assert.equal(context.config.researchCustomerId, "4445556666");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("canonical client uses the resolved platform config and has no secret resolver input", async () => {
  const result = await createGoogleAdsCanonicalClient({
    context: {
      actorUserId: "actor",
      agencyId: null,
      brandId: "brand",
      operation: "discovery",
      config: getGoogleAdsPlatformConfig(ENV),
      customerId: "4445556666",
      managerCustomerId: "1112223333",
      targeting: null,
      accountState: null,
    },
  });
  assert.equal(result.config.researchCustomerId, "4445556666");
  assert.equal("secretRef" in result.config, false);
});
