import { GOOGLE_ADS_DISCOVERY_COUNTRY } from "./google-ads-discovery-catalog.ts";

export const DATAFORSEO_TARGETING_CATALOG_VERSION = "2026-08-04-br-country" as const;
export const DATAFORSEO_BRAZIL_LOCATION = { countryCode: "BR", locationCode: 2076, label: "Brasil" } as const;

export type DataForSeoTargeting = {
  countryCode: "BR";
  locationCode: number;
  locationLabel: string;
  languageCode: string;
  catalogVersion: string;
  sourceGeoTargetConstants: string[];
};

export class DataForSeoTargetingError extends Error {
  readonly code = "dataforseo_location_unsupported" as const;
  readonly selectedGeoTargets: string[];
  constructor(message: string, selectedGeoTargets: string[]) {
    super(message);
    this.name = "DataForSeoTargetingError";
    this.selectedGeoTargets = selectedGeoTargets;
  }
}

function resolveLanguageCode(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized || normalized === "pt" || normalized === "pt-br" || normalized === "português" || normalized === "portugues") return "pt";
  if (normalized === "languageconstants/1014") return "pt";
  if (normalized === "languageconstants/1000") return "en";
  if (normalized === "languageconstants/1003") return "es";
  return normalized;
}

export function resolveDataForSeoTargeting(input: { geoTargetConstants?: unknown; languageCode?: string | null; location?: string | null; locationCode?: number }): DataForSeoTargeting {
  const geoTargetConstants = Array.isArray(input.geoTargetConstants) ? input.geoTargetConstants.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map(value => value.trim()) : [];
  const location = typeof input.location === "string" ? input.location.trim().toLowerCase() : "";
  const isBrazil = !geoTargetConstants.length || geoTargetConstants.length === 1 && geoTargetConstants[0] === GOOGLE_ADS_DISCOVERY_COUNTRY.geoTargetConstant || location === "brasil" || location === "br";
  if (!isBrazil) throw new DataForSeoTargetingError("A localidade selecionada ainda não possui resolução DataForSEO validada para o allintitle.", geoTargetConstants);
  const locationCode = input.locationCode || DATAFORSEO_BRAZIL_LOCATION.locationCode;
  if (locationCode !== DATAFORSEO_BRAZIL_LOCATION.locationCode) throw new DataForSeoTargetingError("O cÃ³digo de localidade DataForSEO configurado ainda nÃ£o possui resoluÃ§Ã£o validada para o allintitle.", geoTargetConstants);
  return { countryCode: "BR", locationCode, locationLabel: DATAFORSEO_BRAZIL_LOCATION.label, languageCode: resolveLanguageCode(input.languageCode), catalogVersion: DATAFORSEO_TARGETING_CATALOG_VERSION, sourceGeoTargetConstants: geoTargetConstants.length ? geoTargetConstants : [GOOGLE_ADS_DISCOVERY_COUNTRY.geoTargetConstant] };
}
