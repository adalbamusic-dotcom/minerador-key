import type {
  SubjectDiscoveryCandidate,
  SubjectDiscoveryExecuteResponse,
  SubjectDiscoverySerpLensOutcome,
  SubjectDiscoverySourceStatus,
} from "../../../lib/minerador/subject-discovery-search.ts";
import {
  SUBJECT_DISCOVERY_NOTICES,
  SUBJECT_DISCOVERY_SOURCE_LABELS,
  SUBJECT_DISCOVERY_SOURCES,
  type SubjectDiscoverySource,
} from "../../../lib/minerador/subject-discovery-plan.ts";
import { resolveKeywordSubject } from "../../../lib/minerador/keyword-subject.ts";

/**
 * PESQUISA POR ASSUNTO — regras puras da tela (SDD 2026-09-24, F1b.1, F1b.5,
 * F1b.6 e F1b.7).
 *
 * Aqui não há rede, banco nem armazenamento: só o que a tela decide sozinha e
 * que precisa ser igual toda vez — os textos fixos, o padrão da opção
 * "Declarar também como Assunto" (Q14), o corpo dos pedidos (sem métrica), o
 * filtro "Com volume" (só Google Ads) e o link "Buscar sustentação" (só o UUID).
 */

/* ---------------------------------- textos --------------------------------- */

/** A regra do modo, a mesma frase do servidor. */
export const SUBJECT_SEARCH_RULE_TEXT = SUBJECT_DISCOVERY_NOTICES.sourceRule;
export const SUBJECT_SEARCH_LOCALE_TEXT = SUBJECT_DISCOVERY_NOTICES.locale;
/** O select de Idioma continua visível no modo: ele também vale só para o Google Ads. */
export const SUBJECT_SEARCH_LANGUAGE_TEXT = "O idioma escolhido também vale só para o Google Ads; o DataForSEO e os resultados do Google usam sempre português.";
export const SUBJECT_SEARCH_ENTER_HELP = "Enter mostra o custo antes de pesquisar.";
export const SUBJECT_SEARCH_NOTE_HELP = "A nota não muda a pesquisa; ela acompanha o Assunto, se você o declarar no envio.";
export const SUBJECT_SEARCH_DESTINATION_HELP = "Opcional. Só uma página https do site da marca entra no Google Ads, junto com a frase.";
export const SUBJECT_SEARCH_DECLARED_HELP = "Com um Assunto declarado, o servidor relê a frase, a nota e a página gravadas na marca.";
export const SUBJECT_SEARCH_LOCAL_LIST_TEXT = "Lista guardada só neste navegador. Só o envio ao Processador salva no banco. Limpar os dados do navegador apaga a lista. Os resultados do Google ficam guardados para a marca por 30 dias; os do DataForSEO Labs, não: repetir a pesquisa paga de novo.";
export const SUBJECT_SEARCH_LOCAL_POLICY_TEXT = "Cada busca vale 30 dias neste navegador, e ficam no máximo 10 por marca. A vencida e a mais antiga saem sozinhas.";
export const SUBJECT_SEARCH_MEMORY_ONLY_TEXT = "O armazenamento deste navegador não respondeu: a lista está só na memória e não sobrevive ao recarregar a página.";
export const SUBJECT_SEARCH_VOLUME_REMEASURE_TEXT = "O volume será medido de novo no Processador, pelo Google Ads, sem custo.";
export const SUBJECT_SEARCH_UNDECLARED_TEXT = "Para ligar estas keywords a um Assunto, declare-o antes, aqui ou no Processador.";
export const SUBJECT_SEARCH_PLAN_TEXT = "Nada é pago antes de você confirmar. O plano é confirmado inteiro: nenhuma fonte fica de fora, para o total confirmado ser o total executado.";
export const SUBJECT_SEARCH_ESTIMATE_COLUMN = "Estimativa DataForSEO";

export function declarePhraseAsSubjectLabel(phrase: string) {
  return `Declarar também "${phrase}" como Assunto, com a nota e a página informadas`;
}

/* ------------------------------ origens e estados ------------------------------ */

/** Cada origem com o seu rótulo. Uma origem desconhecida diz que é desconhecida: nunca vira "Google Ads". */
export function subjectSearchOriginLabel(origin: string): string {
  return (SUBJECT_DISCOVERY_SOURCE_LABELS as Record<string, string>)[origin] ?? `Origem desconhecida (${origin})`;
}

const SOURCE_STATUS_LABELS: Record<SubjectDiscoverySourceStatus, string> = {
  ok: "Ok",
  empty: "Vazia",
  failed: "Falhou",
  skipped_budget: "Não executada por orçamento",
  not_applicable: "Não se aplica",
};

export function subjectSearchSourceStatusLabel(status: SubjectDiscoverySourceStatus): string {
  return SOURCE_STATUS_LABELS[status] ?? status;
}

const SERP_LENS_SOURCE_LABELS: Record<SubjectDiscoverySerpLensOutcome["source"], string> = {
  cache: "No cache (0 pagas)",
  collected: "Coletada agora",
  failed: "Falhou",
  skipped_budget: "Não executada por orçamento",
  skipped_read_failed: "Cache ilegível: não paga",
};

export function subjectSearchSerpLensLabel(source: SubjectDiscoverySerpLensOutcome["source"]): string {
  return SERP_LENS_SOURCE_LABELS[source] ?? source;
}

/**
 * Dólares com até 6 casas: o orçamento é contado em micro-dólares, então nada
 * é arredondado — o preço por item de US$ 0,00012 aparece inteiro no diálogo
 * em que o humano autoriza o gasto.
 */
export function formatSubjectSearchUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 6 })}`;
}

/** As lentes da SERP pelo nome do aparelho, como o produto já as mostra. Id desconhecido volta como está. */
const SERP_LENS_NAMES: Record<string, string> = {
  "desktop-windows": "Desktop · Windows",
  "desktop-macos": "Desktop · macOS",
  "mobile-android": "Celular · Android",
  "mobile-ios": "Celular · iOS",
};

export function subjectSearchLensName(lens: string): string {
  return SERP_LENS_NAMES[lens] ?? lens;
}

/* ------------------------------- volume (§47) ------------------------------- */

/** O volume da lista é SÓ o do Google Ads. A estimativa do Labs nunca entra aqui. */
export function subjectCandidateGoogleAdsVolume(candidate: Pick<SubjectDiscoveryCandidate, "googleAds">): number | null {
  const value = candidate.googleAds?.averageMonthlySearches;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const SUBJECT_SEARCH_VOLUME_FILTERS = ["Todos", "Com volume", "Sem volume do Google Ads"] as const;
export type SubjectSearchVolumeFilter = typeof SUBJECT_SEARCH_VOLUME_FILTERS[number];

export type SubjectSearchFilters = {
  volume: SubjectSearchVolumeFilter;
  origin: SubjectDiscoverySource | "all";
  hideExisting: boolean;
  text: string;
};

export const SUBJECT_SEARCH_DEFAULT_FILTERS: SubjectSearchFilters = { volume: "Todos", origin: "all", hideExisting: false, text: "" };

function foldText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();
}

/** Filtros locais: nunca chamam provider nem banco. "Com volume" lê só o Google Ads. */
export function filterSubjectCandidates<T extends Pick<SubjectDiscoveryCandidate, "keyword" | "googleAds" | "origins" | "existingKeywordId">>(candidates: readonly T[], filters: SubjectSearchFilters, importedKeys?: ReadonlySet<string> | null, keyOf?: (candidate: T) => string): T[] {
  const text = foldText(filters.text || "");
  return candidates.filter(candidate => {
    const volume = subjectCandidateGoogleAdsVolume(candidate);
    if (filters.volume === "Com volume" && !(volume !== null && volume > 0)) return false;
    if (filters.volume === "Sem volume do Google Ads" && volume !== null && volume > 0) return false;
    if (filters.origin !== "all" && !candidate.origins.includes(filters.origin)) return false;
    if (filters.hideExisting && (candidate.existingKeywordId || (importedKeys && keyOf && importedKeys.has(keyOf(candidate))))) return false;
    if (text && !foldText(candidate.keyword).includes(text)) return false;
    return true;
  });
}

/* --------------------------------- pedidos --------------------------------- */

export function subjectSearchLanguageConstant(language: string): "languageConstants/1014" | "languageConstants/1000" | "languageConstants/1003" {
  return language === "Inglês" ? "languageConstants/1000" : language === "Espanhol" ? "languageConstants/1003" : "languageConstants/1014";
}

export type SubjectSearchRequestInput = {
  mode: "plan" | "execute";
  phrase: string;
  note: string;
  destinationUrl: string;
  subjectKeywordId: string | null;
  language: string;
  selectedStates: readonly string[];
  includeAdultKeywords: boolean;
  operationRequestId?: string | null;
  authorizedPlan?: { planHash: string; maxCostUsd: number } | null;
};

/**
 * O corpo do plano e da execução. O schema do servidor é `.strict()`: só estes
 * campos, e nenhuma métrica. Com um Assunto declarado, frase, nota e página
 * ainda vão, mas o servidor os ignora e relê a declaração pelo id.
 */
export function buildSubjectSearchRequest(input: SubjectSearchRequestInput) {
  const phrase = input.phrase.replace(/\s+/g, " ").trim().slice(0, 200);
  const note = input.note.trim();
  const destinationUrl = input.destinationUrl.trim();
  const body: Record<string, unknown> = {
    mode: input.mode,
    phrase,
    note: note || null,
    destinationUrl: destinationUrl || null,
    subjectKeywordId: input.subjectKeywordId || null,
    targeting: {
      language: subjectSearchLanguageConstant(input.language),
      selectedStates: input.selectedStates.length ? [...input.selectedStates] : ["Todos os estados"],
      keywordPlanNetwork: "GOOGLE_SEARCH",
      includeAdultKeywords: input.includeAdultKeywords,
    },
  };
  if (input.mode === "execute") {
    body.operationRequestId = input.operationRequestId;
    body.authorizedPlan = input.authorizedPlan ? { planHash: input.authorizedPlan.planHash, maxCostUsd: input.authorizedPlan.maxCostUsd } : null;
  }
  return body;
}

/* ------------------------------ envio (F1b.7) ------------------------------ */

/**
 * Q14: sem Assunto declarado na busca, a opção "Declarar também como Assunto"
 * aparece; vem MARCADA quando a frase ainda não existe na marca e DESMARCADA
 * quando já existe. Com Assunto declarado, a opção não aparece.
 */
export function defaultDeclarePhraseAsSubject(subject: { subjectKeywordId: string | null; phraseExistingKeywordId: string | null }): { offered: boolean; checked: boolean } {
  if (subject.subjectKeywordId) return { offered: false, checked: false };
  return { offered: true, checked: !subject.phraseExistingKeywordId };
}

export type SubjectSearchImportItem = { keyword: string; origins: SubjectDiscoverySource[]; evidence: string[] };

/**
 * Os itens do envio: SÓ keyword, origens e evidência curta. Nenhuma métrica
 * (volume, CPC, estimativa) vai ao servidor. A frase do Assunto fica fora: ela
 * é declarada pela rota da F1.3, nunca importada como sustentação.
 */
export function buildSubjectDiscoveryImportItems(candidates: readonly SubjectDiscoveryCandidate[], selectedKeys: ReadonlySet<string>, normalizedPhrase: string): { items: SubjectSearchImportItem[]; skippedSubjectPhrase: number } {
  const items: SubjectSearchImportItem[] = [];
  let skippedSubjectPhrase = 0;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!selectedKeys.has(candidate.normalizedKeyword)) continue;
    if (candidate.isSubjectPhrase || candidate.normalizedKeyword === normalizedPhrase) { skippedSubjectPhrase += 1; continue; }
    if (seen.has(candidate.normalizedKeyword)) continue;
    const keyword = candidate.keyword.replace(/\s+/g, " ").trim().slice(0, 400);
    const origins = SUBJECT_DISCOVERY_SOURCES.filter(source => candidate.origins.includes(source));
    if (!keyword || !origins.length) continue;
    const evidence: string[] = [];
    for (const text of candidate.evidence) {
      const line = String(text).replace(/\s+/g, " ").trim().slice(0, 160);
      if (line && !evidence.includes(line)) evidence.push(line);
      if (evidence.length === 3) break;
    }
    seen.add(candidate.normalizedKeyword);
    items.push({ keyword, origins, evidence });
  }
  return { items, skippedSubjectPhrase };
}

/** Linha da prévia da F1.3 (subset lido pela tela). */
export type SubjectPhrasePreviewRow = {
  classification: "new" | "existing_without_subject" | "existing_subject_same" | "existing_subject_different" | "published" | "invalid";
  keywordId: string | null;
  approvalWarning: string | null;
  reason: string | null;
  outcome?: string;
};

/**
 * O que fazer com a frase, lida a prévia da F1.3: criar como Assunto, declarar
 * a existente (só porque o humano marcou), usar a que já é Assunto, ou parar.
 */
export function subjectPhraseDeclarationPlan(row: SubjectPhrasePreviewRow | null | undefined):
  | { action: "create" }
  | { action: "declare_existing"; keywordId: string; warning: string | null }
  | { action: "already_subject"; keywordId: string }
  | { action: "refuse"; reason: string } {
  if (!row) return { action: "refuse", reason: "A prévia da declaração não devolveu a frase." };
  if (row.classification === "new") return { action: "create" };
  if ((row.classification === "existing_without_subject" || row.classification === "published") && row.keywordId) {
    return { action: "declare_existing", keywordId: row.keywordId, warning: row.approvalWarning };
  }
  if ((row.classification === "existing_subject_same" || row.classification === "existing_subject_different") && row.keywordId) {
    return { action: "already_subject", keywordId: row.keywordId };
  }
  return { action: "refuse", reason: row.reason || "A frase não pode ser declarada como Assunto." };
}

/** O id do Assunto depois do `apply` da F1.3; `null` quando a declaração não aconteceu. */
export function subjectIdFromApply(row: SubjectPhrasePreviewRow | null | undefined): string | null {
  if (!row || !row.keywordId) return null;
  return row.outcome === "created" || row.outcome === "declared" || row.outcome === "unchanged" || row.outcome === "kept" ? row.keywordId : null;
}

/* ---------------------------- "Buscar sustentação" ---------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSubjectSearchUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** A URL leva SÓ o UUID: nunca a frase nem a nota (F1b.1). */
export function subjectSearchLinkHref(brandRef: string, keywordId: string): string {
  return `/${brandRef}/minerador/descobrir?modo=assunto&assunto=${encodeURIComponent(keywordId)}`;
}

export function parseSubjectSearchLink(search: string): { subjectMode: boolean; subjectKeywordId: string | null } {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { subjectMode: false, subjectKeywordId: null };
  }
  const subjectMode = params.get("modo") === "assunto";
  const id = params.get("assunto");
  return { subjectMode, subjectKeywordId: subjectMode && isSubjectSearchUuid(id) ? id : null };
}

/* ----------------------------- Assuntos declarados ----------------------------- */

export type DeclaredSubjectOption = { id: string; keyword: string; note: string | null; destinationUrl: string | null };

/** As linhas lidas (`id,keyword,keyword_subject`) viram opções só quando a declaração vale. */
export function declaredSubjectOptions(rows: ReadonlyArray<{ id?: unknown; keyword?: unknown; keyword_subject?: unknown }>): DeclaredSubjectOption[] {
  const options: DeclaredSubjectOption[] = [];
  for (const row of rows) {
    if (!isSubjectSearchUuid(row.id) || typeof row.keyword !== "string" || !row.keyword.trim()) continue;
    const resolution = resolveKeywordSubject({ keyword_subject: row.keyword_subject });
    if (!resolution.declared) continue;
    options.push({ id: row.id, keyword: row.keyword.replace(/\s+/g, " ").trim(), note: resolution.note, destinationUrl: resolution.destinationUrl });
  }
  return options.sort((a, b) => a.keyword.localeCompare(b.keyword, "pt-BR"));
}

/* ------------------------------- resultado ------------------------------- */

export type SubjectSearchImportMark = { outcome: string; keywordId: string | null; reason: string | null };

export function subjectSearchSummary(result: Pick<SubjectDiscoveryExecuteResponse, "returnedCandidates" | "totalCandidates" | "truncated">): string {
  return result.truncated
    ? `${result.returnedCandidates} de ${result.totalCandidates} candidatas exibidas.`
    : `${result.returnedCandidates} candidata(s).`;
}
