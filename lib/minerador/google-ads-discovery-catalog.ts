export const GOOGLE_ADS_DISCOVERY_COUNTRY = {
  code: "BR",
  label: "Brasil",
  geoTargetConstant: "geoTargetConstants/2076",
} as const;

// Pinned from Google's official geo-target CSV (2026-07-16). Resource names
// are resolved only on the server; the browser sends UF codes, never IDs.
export const GOOGLE_ADS_DISCOVERY_GEO_CATALOG_VERSION = "2026-07-16" as const;
export const GOOGLE_ADS_DISCOVERY_GEO_CATALOG_SOURCE = "https://developers.google.com/google-ads/api/data/geotargets" as const;

export const GOOGLE_ADS_DISCOVERY_LANGUAGES = {
  "Português": "languageConstants/1014",
  "Inglês": "languageConstants/1000",
  "Espanhol": "languageConstants/1003",
} as const;

export type GoogleAdsDiscoveryLanguageLabel = keyof typeof GOOGLE_ADS_DISCOVERY_LANGUAGES;

export const GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS = {
  AC: "geoTargetConstants/21232", AL: "geoTargetConstants/20086", AP: "geoTargetConstants/21226", AM: "geoTargetConstants/20087",
  BA: "geoTargetConstants/20088", CE: "geoTargetConstants/20089", DF: "geoTargetConstants/20090", ES: "geoTargetConstants/20091",
  GO: "geoTargetConstants/20092", MA: "geoTargetConstants/20093", MT: "geoTargetConstants/20096", MS: "geoTargetConstants/20095",
  MG: "geoTargetConstants/20094", PA: "geoTargetConstants/20097", PB: "geoTargetConstants/20098", PR: "geoTargetConstants/20101",
  PE: "geoTargetConstants/20099", PI: "geoTargetConstants/20100", RJ: "geoTargetConstants/20102", RN: "geoTargetConstants/20103",
  RS: "geoTargetConstants/20104", RO: "geoTargetConstants/21227", RR: "geoTargetConstants/21228", SC: "geoTargetConstants/20105",
  SP: "geoTargetConstants/20106", SE: "geoTargetConstants/21229", TO: "geoTargetConstants/21230",
} as const;

export type GoogleAdsDiscoveryState = keyof typeof GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS;

export const GOOGLE_ADS_DISCOVERY_STATE_LABELS: Record<GoogleAdsDiscoveryState, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export const GOOGLE_ADS_DISCOVERY_STATE_OPTIONS = Object.keys(GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS) as GoogleAdsDiscoveryState[];

export function resolveDiscoveryTargeting(states: string[]): {
  geoTargetConstants: string[];
  selectedStates: GoogleAdsDiscoveryState[];
  stateLabels: string[];
  countryCode: "BR";
  countryLabel: string;
} {
  const normalizedStates = states.map(state => typeof state === "string" ? state.trim() : "");
  const invalidState = normalizedStates.find(state => !state || (state !== "Todos os estados" && !(state in GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS)));
  if (invalidState !== undefined) throw new Error(`GOOGLE_ADS_INVALID_GEO_TARGET:${invalidState}`);
  const hasCountry = normalizedStates.includes("Todos os estados");
  const specificStates = normalizedStates.filter((state): state is GoogleAdsDiscoveryState => state in GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS);
  if (hasCountry && specificStates.length > 0) throw new Error("GOOGLE_ADS_MIXED_GEO_TARGETS");
  if (new Set(normalizedStates).size !== normalizedStates.length) throw new Error("GOOGLE_ADS_DUPLICATE_GEO_TARGETS");
  if (specificStates.length > 10) throw new Error("GOOGLE_ADS_TOO_MANY_GEO_TARGETS");
  if (specificStates.length === 0) return { geoTargetConstants: [GOOGLE_ADS_DISCOVERY_COUNTRY.geoTargetConstant], selectedStates: [], stateLabels: [], countryCode: "BR" as const, countryLabel: GOOGLE_ADS_DISCOVERY_COUNTRY.label };
  return { geoTargetConstants: specificStates.map(state => GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS[state]), selectedStates: specificStates, stateLabels: specificStates.map(state => GOOGLE_ADS_DISCOVERY_STATE_LABELS[state]), countryCode: "BR" as const, countryLabel: GOOGLE_ADS_DISCOVERY_COUNTRY.label };
}

export function discoveryLanguageConstant(label: string) {
  return GOOGLE_ADS_DISCOVERY_LANGUAGES[label as GoogleAdsDiscoveryLanguageLabel] || GOOGLE_ADS_DISCOVERY_LANGUAGES["Português"];
}

export function discoveryGeoTargetConstants(states: string[]) {
  return resolveDiscoveryTargeting(states).geoTargetConstants;
}

export function discoveryTargetingLabels(rawGeoTargetConstants?: unknown) {
  if (!Array.isArray(rawGeoTargetConstants)) return { label: "Sem targeting", details: ["Targeting não disponível"] };
  const geoTargetConstants = rawGeoTargetConstants.filter((value): value is string => typeof value === "string");
  if (geoTargetConstants.length === 1 && geoTargetConstants[0] === GOOGLE_ADS_DISCOVERY_COUNTRY.geoTargetConstant) return { label: "Brasil", details: ["Brasil"] };
  const details = GOOGLE_ADS_DISCOVERY_STATE_OPTIONS.filter(state => geoTargetConstants.includes(GOOGLE_ADS_DISCOVERY_STATE_GEO_TARGETS[state])).map(state => GOOGLE_ADS_DISCOVERY_STATE_LABELS[state]);
  return { label: `${details.length || geoTargetConstants.length} estado(s)`, details };
}
