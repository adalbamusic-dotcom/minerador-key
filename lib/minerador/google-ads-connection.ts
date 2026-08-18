import { z } from "zod";
import { GoogleAdsTargetingSchema, type GoogleAdsAdvertiserAccount, type GoogleAdsTargeting } from "../google/ads/contracts.ts";

const CustomerIdSchema = z.string().regex(/^\d{10}$/, "Informe o ID numérico completo da conta Google Ads, sem hífens.");
const CustomerIdInputSchema = z.string().transform(value => value.replace(/[\s-]/g, "")).pipe(CustomerIdSchema);

export const GoogleAdsBrandCustomerBindingSchema = z.object({
  customerId: CustomerIdInputSchema,
});

export type GoogleAdsBrandCustomerBinding = z.infer<typeof GoogleAdsBrandCustomerBindingSchema>;

export const GoogleAdsConnectionSetupSchema = z.object({
  customerId: CustomerIdSchema,
  loginCustomerId: CustomerIdSchema.optional(),
  targeting: GoogleAdsTargetingSchema,
});

export type GoogleAdsConnectionSetup = z.infer<typeof GoogleAdsConnectionSetupSchema>;

export type GoogleAdsConnectionPersistence = {
  brand_id: string;
  customer_id: string;
  login_customer_id: string | null;
  language_constant: string;
  geo_target_constants: string[];
  keyword_plan_network: GoogleAdsTargeting["keywordPlanNetwork"];
  include_adult_keywords: boolean;
  currency_code: string;
  time_zone: string;
  status: "validated";
  validated_at: string;
};

export function maskGoogleAdsConnectionId(value: string | null | undefined) {
  if (!value || value.length < 4) return null;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export function buildValidatedGoogleAdsConnection(input: { brandId: string; setup: GoogleAdsConnectionSetup; account: GoogleAdsAdvertiserAccount; validatedAt?: string }): GoogleAdsConnectionPersistence {
  if (input.setup.customerId !== input.account.customerId) throw new Error("A conta validada não corresponde ao customerId solicitado.");
  if ((input.setup.loginCustomerId || null) !== input.account.loginCustomerId) throw new Error("A MCC validada não corresponde ao loginCustomerId solicitado.");
  if (!/^[A-Z]{3}$/.test(input.account.currencyCode) || !input.account.timeZone.trim()) throw new Error("A conta Google Ads não retornou moeda ou timezone válidos.");
  return {
    brand_id: input.brandId,
    customer_id: input.account.customerId,
    login_customer_id: input.account.loginCustomerId,
    language_constant: input.setup.targeting.language,
    geo_target_constants: input.setup.targeting.geoTargetConstants,
    keyword_plan_network: input.setup.targeting.keywordPlanNetwork,
    include_adult_keywords: input.setup.targeting.includeAdultKeywords,
    currency_code: input.account.currencyCode,
    time_zone: input.account.timeZone,
    status: "validated",
    validated_at: input.validatedAt || new Date().toISOString(),
  };
}
