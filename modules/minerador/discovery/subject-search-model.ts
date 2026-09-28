import type {
  SubjectDiscoveryCandidate,
  SubjectDiscoveryExecuteResponse,
  SubjectDiscoverySerpLensOutcome,
  SubjectDiscoverySourceStatus,
} from "../../../lib/minerador/subject-discovery-search.ts";
import {
  SUBJECT_DISCOVERY_ACTIVE_SOURCES,
  SUBJECT_DISCOVERY_NOTICES,
  SUBJECT_DISCOVERY_SOURCE_LABELS,
  SUBJECT_DISCOVERY_SOURCES,
  type SubjectDiscoverySource,
} from "../../../lib/minerador/subject-discovery-plan.ts";
import { resolveKeywordSubject } from "../../../lib/minerador/keyword-subject.ts";
import { resolveKeywordVinculo } from "../../../lib/minerador/keyword-vinculo.ts";
import { compareSubjectDiscoveryByVolume, subjectDiscoveryHasVolume } from "../../../lib/minerador/subject-discovery-volume.ts";

/**
 * PESQUISA POR ASSUNTO — regras puras da tela (SDD 2026-09-24, F1b.1, F1b.5,
 * F1b.6 e F1b.7).
 *
 * Aqui não há rede, banco nem armazenamento: só o que a tela decide sozinha e
 * que precisa ser igual toda vez — os textos fixos, o padrão da opção
 * "Declarar também como Assunto" (Q14), o corpo dos pedidos (sem métrica), o
 * filtro "Só com volume" (D2.3, ligado por padrão) e o link "Buscar sustentação" (só o UUID).
 */

/* ---------------------------------- textos --------------------------------- */

/** A regra do modo, a mesma frase do servidor. */
export const SUBJECT_SEARCH_RULE_TEXT = SUBJECT_DISCOVERY_NOTICES.sourceRule;
export const SUBJECT_SEARCH_LOCALE_TEXT = SUBJECT_DISCOVERY_NOTICES.locale;
/** O select de Idioma continua visível no modo: ele vale para o Google Ads, a única fonte. */
export const SUBJECT_SEARCH_LANGUAGE_TEXT = "A pesquisa não consulta o DataForSEO: não tem custo por pesquisa, só usa a cota do Google Ads.";
export const SUBJECT_SEARCH_ENTER_HELP = "Enter mostra o plano antes de pesquisar.";
export const SUBJECT_SEARCH_NOTE_HELP = "A nota não muda a pesquisa; ela acompanha o Assunto, se você o declarar no envio.";
export const SUBJECT_SEARCH_DESTINATION_HELP = "Opcional. Só uma página https do site da marca entra no Google Ads, junto com a frase.";
export const SUBJECT_SEARCH_DECLARED_HELP = "Com um Assunto declarado, o servidor relê a frase, a nota e a página gravadas na marca.";
export const SUBJECT_SEARCH_LOCAL_LIST_TEXT = "Lista guardada só neste navegador. Só o envio ao Processador salva no banco. Limpar os dados do navegador apaga a lista. Repetir a pesquisa consulta o Google Ads de novo, sem custo.";
export const SUBJECT_SEARCH_LOCAL_POLICY_TEXT = "Cada busca vale 30 dias neste navegador, e ficam no máximo 10 por marca. A vencida e a mais antiga saem sozinhas.";
export const SUBJECT_SEARCH_MEMORY_ONLY_TEXT = "O armazenamento deste navegador não respondeu: a lista está só na memória e não sobrevive ao recarregar a página.";
export const SUBJECT_SEARCH_VOLUME_REMEASURE_TEXT = "O volume será medido de novo no Processador, pelo Google Ads, sem custo.";
export const SUBJECT_SEARCH_UNDECLARED_TEXT = "Para ligar estas keywords a um Assunto, declare-o antes, aqui ou no Processador.";
export const SUBJECT_SEARCH_PLAN_TEXT = "Nada é consultado antes de você confirmar. O plano é confirmado inteiro: a frase, a página de destino e a segmentação do Google Ads que você vê são as que a pesquisa usa.";
/** O resumo do plano sem chamada paga (o de hoje, só Google Ads). */
export const SUBJECT_SEARCH_FREE_PLAN_TEXT = "Sem custo no DataForSEO; usa a cota do Google Ads";
/** Coluna de buscas antigas (antes de 2026-09-28): só aparece quando alguma candidata tem estimativa. */
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

export type SubjectSearchFilters = {
  /** D2.3: ligado por padrão. Esconde a candidata sem média do Google Ads (e, em buscas antigas, sem estimativa DataForSEO). */
  onlyWithVolume: boolean;
  origin: SubjectDiscoverySource | "all";
  hideExisting: boolean;
  text: string;
};

export const SUBJECT_SEARCH_DEFAULT_FILTERS: SubjectSearchFilters = { onlyWithVolume: true, origin: "all", hideExisting: false, text: "" };

/**
 * Com volume: média do Google Ads > 0 (D2.3). Buscas antigas (antes de
 * 2026-09-28) também contam a estimativa DataForSEO > 0, a regra com que foram
 * feitas; nas novas a estimativa não existe. A estimativa não vira Volume.
 */
export function subjectCandidateHasVolume(candidate: Pick<SubjectDiscoveryCandidate, "googleAds" | "dataForSeoEstimate">): boolean {
  return subjectDiscoveryHasVolume(candidate);
}

/** A busca tem estimativa DataForSEO (busca antiga)? Só então a coluna Estimativa aparece. */
export function subjectSearchHasEstimate(candidates: ReadonlyArray<Pick<SubjectDiscoveryCandidate, "dataForSeoEstimate">>): boolean {
  return candidates.some(candidate => typeof candidate.dataForSeoEstimate?.searchVolume === "number");
}

/**
 * As origens do filtro: as fontes de hoje (Google Ads) e, numa busca antiga,
 * as que ela trouxe (`labs_*`), na ordem das fontes. Uma origem desconhecida
 * não entra no filtro; continua na coluna Origens, com o rótulo de desconhecida.
 */
export function subjectSearchOriginFilterOptions(candidates: ReadonlyArray<Pick<SubjectDiscoveryCandidate, "origins">>): SubjectDiscoverySource[] {
  const present = new Set<string>(candidates.flatMap(candidate => candidate.origins));
  return SUBJECT_DISCOVERY_SOURCES.filter(source => (SUBJECT_DISCOVERY_ACTIVE_SOURCES as readonly string[]).includes(source) || present.has(source));
}

export const SUBJECT_SEARCH_ONLY_WITH_VOLUME_LABEL = "Só com volume";
export const SUBJECT_SEARCH_ONLY_WITH_VOLUME_HELP = "Esconde as candidatas sem média do Google Ads (em buscas antigas, também sem estimativa DataForSEO). Sem volume, a keyword não reforça artigo. Filtrar não chama provider.";

export function subjectSearchHiddenWithoutVolumeText(count: number): string {
  return count === 1 ? "1 candidata sem volume escondida." : `${count} candidatas sem volume escondidas.`;
}

export function subjectSearchShowHiddenLabel(count: number): string {
  return count === 1 ? "Mostrar a sem volume" : `Mostrar as ${count}`;
}

/** O aviso do envio: quantas selecionadas estão sem volume. Não bloqueia; quem decide é o dono. */
export function subjectSearchSelectedWithoutVolumeText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 selecionada está sem volume: sem média do Google Ads. Sem volume, ela não reforça artigo."
    : `${count} selecionadas estão sem volume: sem média do Google Ads. Sem volume, elas não reforçam artigo.`;
}

function foldText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();
}

type FilterableCandidate = Pick<SubjectDiscoveryCandidate, "keyword" | "googleAds" | "dataForSeoEstimate" | "origins" | "existingKeywordId">;

function matchesOtherFilters<T extends FilterableCandidate>(candidate: T, filters: SubjectSearchFilters, text: string, importedKeys?: ReadonlySet<string> | null, keyOf?: (candidate: T) => string): boolean {
  if (filters.origin !== "all" && !candidate.origins.includes(filters.origin)) return false;
  if (filters.hideExisting && (candidate.existingKeywordId || (importedKeys && keyOf && importedKeys.has(keyOf(candidate))))) return false;
  if (text && !foldText(candidate.keyword).includes(text)) return false;
  return true;
}

/**
 * Filtros locais: nunca chamam provider nem banco. "Só com volume" (padrão)
 * esconde a sem volume (D2.3). O resultado sai ordenado por volume, com
 * empate na ordem recebida: vale também para buscas antigas desta lista.
 */
export function filterSubjectCandidates<T extends FilterableCandidate>(candidates: readonly T[], filters: SubjectSearchFilters, importedKeys?: ReadonlySet<string> | null, keyOf?: (candidate: T) => string): T[] {
  const text = foldText(filters.text || "");
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => (!filters.onlyWithVolume || subjectDiscoveryHasVolume(candidate)) && matchesOtherFilters(candidate, filters, text, importedKeys, keyOf))
    .sort((a, b) => compareSubjectDiscoveryByVolume(a.candidate, b.candidate) || a.index - b.index)
    .map(({ candidate }) => candidate);
}

/** Quantas o filtro "Só com volume" escondeu, entre as que passam nos outros filtros. Desligado, 0. */
export function countSubjectCandidatesHiddenWithoutVolume<T extends FilterableCandidate>(candidates: readonly T[], filters: SubjectSearchFilters, importedKeys?: ReadonlySet<string> | null, keyOf?: (candidate: T) => string): number {
  if (!filters.onlyWithVolume) return 0;
  const text = foldText(filters.text || "");
  return candidates.filter(candidate => !subjectDiscoveryHasVolume(candidate) && matchesOtherFilters(candidate, filters, text, importedKeys, keyOf)).length;
}

/** Selecionadas sem volume, fora a própria frase do Assunto (que não entra no envio). */
export function countSelectedWithoutVolume(candidates: readonly SubjectDiscoveryCandidate[], selectedKeys: ReadonlySet<string>): number {
  return candidates.filter(candidate => selectedKeys.has(candidate.normalizedKeyword) && !candidate.isSubjectPhrase && !subjectDiscoveryHasVolume(candidate)).length;
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

/* ------------------------- "Buscar reforço" do Arquiteto ------------------------- */

/**
 * D2.2 — o Arquiteto abre esta página com `?modo=assunto&reforco=<uuid>` quando
 * nenhuma keyword do lote trata do mesmo assunto que um artigo PUBLICADO. Como
 * em "Buscar sustentação", só o id viaja na URL: a frase (a principal
 * publicada) e a página de destino (a URL do artigo) são lidas da marca.
 * Não mexe em `parseSubjectSearchLink`: o link de Assunto continua igual.
 */
export function parseReinforcementSearchLink(search: string): { reinforcementKeywordId: string | null } {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { reinforcementKeywordId: null };
  }
  const id = params.get("reforco");
  return { reinforcementKeywordId: params.get("modo") === "assunto" && isSubjectSearchUuid(id) ? id : null };
}

/** A nota que acompanha a busca de reforço de um publicado (editável antes de pesquisar). */
export const REINFORCEMENT_SEARCH_NOTE = "Reforço do artigo publicado: keywords com volume que tratem do mesmo assunto no Google (páginas em comum no top 10). URL e slug do artigo não mudam.";

/**
 * Os campos da Pesquisa por Assunto a partir da linha publicada, lida com as
 * colunas estreitas (`id,keyword,status,site_origin,primary_keyword_policy`).
 * Sem publicação declarada no Vínculo, devolve `null`: o link não inventa URL.
 */
export function reinforcementSearchFields(row: { id?: unknown; keyword?: unknown; status?: unknown; site_origin?: unknown; primary_keyword_policy?: unknown } | null | undefined): { keywordId: string; phrase: string; destinationUrl: string; note: string } | null {
  if (!row || !isSubjectSearchUuid(row.id) || typeof row.keyword !== "string" || !row.keyword.trim()) return null;
  const semantic: Record<string, unknown> = {};
  if (row.site_origin !== undefined && row.site_origin !== null) semantic.site_origin = row.site_origin;
  if (typeof row.primary_keyword_policy === "string") semantic.primary_keyword_policy = row.primary_keyword_policy;
  const vinculo = resolveKeywordVinculo({ status: typeof row.status === "string" ? row.status : null, semantic });
  const destino = vinculo.canonicalUrl || vinculo.url;
  if (!destino) return null;
  return { keywordId: row.id, phrase: row.keyword.replace(/\s+/g, " ").trim(), destinationUrl: destino, note: REINFORCEMENT_SEARCH_NOTE };
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
