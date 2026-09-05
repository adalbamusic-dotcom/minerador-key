export const DISCOVERY_INTENTS = [
  "Não definida",
  "Informacional",
  "Comercial investigativa",
  "Transacional",
  "Local",
  "Comparação",
  "Review",
  "Navegacional",
] as const;

export const DISCOVERY_FUNNELS = ["Não definido", "TOFU", "MOFU", "BOFU", "Não aplicável"] as const;
export const DISCOVERY_RELATIONS = ["Todas as palavras-chave", "Concordância ampla", "Concordância de frase", "Concordância exata", "Relacionadas"] as const;
export const DISCOVERY_VOLUME_RANGES = ["Todos", "Com volume", "Sem média disponível", "0–49", "50–99", "100–119", "120–499", "500–999", "1.000+", "Intervalo personalizado"] as const;

export const DISCOVERY_MODES = ["keyword", "customer_discovery"] as const;
export type DiscoveryMode = typeof DISCOVERY_MODES[number];
export const DISCOVERY_CUSTOMER_FOCUSES = ["all_customer", "hire"] as const;
export type DiscoveryCustomerFocus = typeof DISCOVERY_CUSTOMER_FOCUSES[number];

export type DiscoveryIntent = typeof DISCOVERY_INTENTS[number];
export type DiscoveryFunnel = typeof DISCOVERY_FUNNELS[number];
export type DiscoveryRelation = typeof DISCOVERY_RELATIONS[number];
export type DiscoveryVolumeRange = typeof DISCOVERY_VOLUME_RANGES[number];
export const DISCOVERY_CPC_FILTERS = ["Todos", "Com CPC", "Sem CPC"] as const;
export type DiscoveryCpcFilter = typeof DISCOVERY_CPC_FILTERS[number];

export type DiscoverySearchDraft = {
  seed: string;
  relationshipMode: DiscoveryRelation;
  preliminaryIntent: DiscoveryIntent;
  preliminaryFunnel: DiscoveryFunnel;
  language: string;
  countryCode: "BR";
  selectedStates: string[];
  volumeFilter: DiscoveryVolumeRange;
  cpcFilter: DiscoveryCpcFilter;
  includeTerms: string;
  excludeTerms: string;
  includeAdultKeywords: boolean;
  /** D1 read-model context. Optional to keep older persisted drafts compatible. */
  discoveryMode?: DiscoveryMode;
  discoveryFocus?: DiscoveryCustomerFocus;
};
