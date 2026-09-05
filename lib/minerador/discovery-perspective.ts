import { normalizeGoogleAdsKeyword } from "../google/ads/normalizers.ts";
import type { DiscoveryCandidate } from "./discovery-keywords.ts";
import type { DiscoveryCustomerFocus } from "../../modules/minerador/discovery/discovery-types.ts";

export const DISCOVERY_PERSPECTIVE_CLASSIFIER_VERSION = "d1-deterministic-v1" as const;
export const DISCOVERY_PERSPECTIVES = ["customer", "ambiguous", "other"] as const;
export type DiscoveryPerspective = typeof DISCOVERY_PERSPECTIVES[number];
export const DISCOVERY_PERSPECTIVE_FILTERS = ["all", ...DISCOVERY_PERSPECTIVES] as const;
export type DiscoveryPerspectiveFilter = typeof DISCOVERY_PERSPECTIVE_FILTERS[number];

const OTHER_SIGNALS = [
  "curso", "cursos", "vaga", "vagas", "emprego", "salario", "profissao", "carreira", "material", "materiais",
  "fornecedor", "fornecedores", "atacado", "apostila", "aula", "aulas", "treinamento", "workshop", "certificado",
  "faculdade", "formacao", "como ser", "como fazer", "trabalhar com",
];

const GENERAL_CUSTOMER_SIGNALS = [
  "preco", "precos", "valor", "valores", "orcamento", "cotacao", "cotar", "perto de mim", "perto", "proximo",
  "onde", "salon", "salao", "servico", "servicos", "atendimento", "aberto agora", "aberta agora", "telefone",
  "contato", "delivery", "melhor", "avaliacao", "agendar", "agendamento", "marcar", "contratar", "comprar",
];

const HIRE_SIGNALS = [
  "encontrar", "encontre", "contrat", "agend", "marc", "preco", "valor", "perto", "onde", "salao", "servico",
  "profissional", "empresa", "clinica", "loja", "reservar", "reserva",
];

function normalizePerspectiveText(value: string) {
  return normalizeGoogleAdsKeyword(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasSignal(value: string, signals: string[]) {
  return signals.some(signal => value.includes(signal));
}

export function classifyDiscoveryPerspective(keyword: string, seed = "", focus: DiscoveryCustomerFocus = "all_customer"): DiscoveryPerspective {
  const normalizedKeyword = normalizePerspectiveText(keyword);
  const normalizedSeed = normalizePerspectiveText(seed);
  if (!normalizedKeyword) return "ambiguous";
  if (hasSignal(normalizedKeyword, OTHER_SIGNALS)) return "other";
  if (hasSignal(normalizedKeyword, focus === "hire" ? [...GENERAL_CUSTOMER_SIGNALS, ...HIRE_SIGNALS] : GENERAL_CUSTOMER_SIGNALS)) return "customer";
  if (normalizedSeed && normalizedKeyword === normalizedSeed) return "ambiguous";
  return "ambiguous";
}

export function discoveryPerspectiveLabel(value: DiscoveryPerspective) {
  return value === "customer" ? "Cliente provável" : value === "other" ? "Outra perspectiva" : "Ambígua";
}

export function discoveryPerspectivePriority(value: DiscoveryPerspective) {
  return value === "customer" ? 0 : value === "ambiguous" ? 1 : 2;
}

export function candidateDiscoveryPerspective(candidate: DiscoveryCandidate, seed: string, focus: DiscoveryCustomerFocus) {
  return classifyDiscoveryPerspective(candidate.keyword, seed, focus);
}

export function candidateMatchesDiscoveryPerspective(candidate: DiscoveryCandidate, seed: string, focus: DiscoveryCustomerFocus, filter: DiscoveryPerspectiveFilter) {
  return filter === "all" || candidateDiscoveryPerspective(candidate, seed, focus) === filter;
}

export function sortDiscoveryCandidatesByPerspective(candidates: DiscoveryCandidate[], seed: string, focus: DiscoveryCustomerFocus) {
  return candidates
    .map((candidate, index) => ({ candidate, index, priority: discoveryPerspectivePriority(candidateDiscoveryPerspective(candidate, seed, focus)) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(item => item.candidate);
}
