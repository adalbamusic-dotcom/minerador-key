import assert from "node:assert/strict";
import test from "node:test";
import { configurePlatformGoogleAdsConnection, updatePlatformGoogleAdsResearchCustomerId } from "../lib/server/platform-integrations-admin.ts";

test("Google Ads admin mutation is read-only after the platform env cutover", async () => {
  const forbiddenClient = new Proxy({}, { get() { throw new Error("database must not be touched"); } }) as never;
  await assert.rejects(
    () => configurePlatformGoogleAdsConnection(forbiddenClient, { connectionId: "connection", managerCustomerId: "1112223333", researchCustomerId: "4445556666", secretPayload: "secret" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY",
  );
  await assert.rejects(
    () => updatePlatformGoogleAdsResearchCustomerId(forbiddenClient, { connectionId: "connection", researchCustomerId: "4445556666" }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "GOOGLE_ADS_PLATFORM_ENV_READ_ONLY",
  );
});
