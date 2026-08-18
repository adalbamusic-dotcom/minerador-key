import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GoogleAdsConnectionSetupSchema, buildValidatedGoogleAdsConnection, maskGoogleAdsConnectionId } from "../lib/minerador/google-ads-connection.ts";

const setup = { customerId: "1234567890", loginCustomerId: "1112223333", targeting: { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH" as const, includeAdultKeywords: false } };

test("rejeita customerId mascarado e exige IDs completos na configuração", () => {
  assert.throws(() => GoogleAdsConnectionSetupSchema.parse({ ...setup, customerId: "******1497" }));
  assert.throws(() => GoogleAdsConnectionSetupSchema.parse({ ...setup, loginCustomerId: "111-222-3333" }));
  assert.deepEqual(GoogleAdsConnectionSetupSchema.parse(setup), setup);
  assert.equal(GoogleAdsConnectionSetupSchema.parse({ ...setup, loginCustomerId: undefined }).loginCustomerId, undefined);
});

test("conexão só é marcada como validada a partir da conta resolvida server-side", () => {
  const connection = buildValidatedGoogleAdsConnection({ brandId: "95bef1bb-0a3d-4218-a01f-ac7281c55e45", setup, account: { customerId: setup.customerId, loginCustomerId: setup.loginCustomerId, currencyCode: "BRL", timeZone: "America/Sao_Paulo" }, validatedAt: "2026-08-03T12:00:00.000Z" });
  assert.equal(connection.status, "validated");
  assert.equal(connection.currency_code, "BRL");
  assert.equal(connection.time_zone, "America/Sao_Paulo");
  assert.equal(maskGoogleAdsConnectionId(connection.customer_id), "******7890");
  assert.throws(() => buildValidatedGoogleAdsConnection({ brandId: connection.brand_id, setup, account: { customerId: "9999999999", loginCustomerId: setup.loginCustomerId, currencyCode: "BRL", timeZone: "America/Sao_Paulo" } }));
});

test("rota de métricas não aceita customerId e rota de conexão expõe somente o status env", async () => {
  const metricsRoute = await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url), "utf8");
  const connectionRoute = await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts", import.meta.url), "utf8");
  assert.match(metricsRoute, /GoogleAdsVolumeRequestSchema/);
  assert.doesNotMatch(metricsRoute, /customerId:\s*input\./);
  assert.match(connectionRoute, /module: "minerador", action: "view"/);
  assert.doesNotMatch(connectionRoute, /ensureConnectionManager/);
  assert.match(connectionRoute, /resolveGoogleAdsCanonicalContext/);
  assert.doesNotMatch(connectionRoute, /minerador_google_ads_connections/);
  assert.match(connectionRoute, /source: "platform_env"/);
  assert.match(connectionRoute, /GOOGLE_ADS_PLATFORM_READ_ONLY/);
  assert.doesNotMatch(connectionRoute, /resolveGoogleAdsAdvertiserAccount/);
  assert.doesNotMatch(connectionRoute, /developerToken|clientSecret|refreshToken/);
  const getHandler = connectionRoute.slice(connectionRoute.indexOf("export async function GET"), connectionRoute.indexOf("export async function POST"));
  assert.doesNotMatch(getHandler, /createGoogleAdsRestClient|resolveGoogleAdsAdvertiserAccount/);
});
