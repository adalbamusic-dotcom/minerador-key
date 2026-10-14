import type { GoogleAdsHistoricalMetric } from "../google/ads/contracts.ts";

/**
 * A MESMA normalização do Minerador (`normalizeKeyword` de
 * `lib/minerador/keyword-import-core.ts`), sem trazer o núcleo de importação
 * para o navegador (a caixa do Minerador usa este arquivo). Teste de paridade
 * em `tests/arquiteto-so-le-keyword-2026-10-13.test.mts`.
 */
export function normalizeKeyword(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ")
    : "";
}

/**
 * "SUGESTÕES DO ARQUITETO" — O CONTRATO (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, F4; D3).
 *
 * O Arquiteto só LÊ keyword: ele não importa, não mede, não roda a Lógica,
 * não aprova nem envia nada no Minerador. Quando uma melhoria, um reforço de
 * publicado ou uma diferenciação precisaria de uma keyword nova, de uma
 * medição de volume ou da Lógica numa keyword, o Arquiteto grava ESTA
 * sugestão — um artefato dele, um item de workflow
 * (`editorial_workflow_items`, `subject_type = "architect_minerador_suggestions"`,
 * etapa `architect`), escrito a partir da execução que a gerou (a melhoria
 * pela `runId`, o reforço pelo `operationRequestId`, a diferenciação pelo
 * grupo e pela rodada). O Minerador lê as sugestões em projeção leve
 * ("Sugestões do Arquiteto · cor X") e só o clique do dono lá importa, grava
 * a medição e roda a Lógica, pelos núcleos do Minerador; aprovar e enviar
 * continua sendo o "Aprovar e enviar" de sempre.
 *
 * Domínio puro, sem `node:crypto` (o Minerador usa os rótulos no navegador).
 */

export const ARCHITECT_SUGGESTIONS_SUBJECT_TYPE = "architect_minerador_suggestions" as const;
export const ARCHITECT_SUGGESTIONS_CONTRACT = "architect-minerador-suggestions@1" as const;
/** Quantos itens um registro guarda (o resto é dito no aviso da origem). */
export const ARCHITECT_SUGGESTIONS_MAX_ITEMS = 200;
/** O nome que o dono vê nas duas áreas. */
export const ARCHITECT_SUGGESTIONS_LABEL = "Sugestões do Arquiteto";

export type ArchitectSuggestionKind = "new_keyword" | "measure" | "logic";
export type ArchitectSuggestionSource = "improvement" | "reinforcement" | "differentiation";

export type ArchitectSuggestionItem = {
  /** Único dentro do registro: `${kind}:${normalizedKeyword}:${targetKeywordId}`. */
  id: string;
  kind: ArchitectSuggestionKind;
  keyword: string;
  normalizedKeyword: string;
  /** A keyword do Minerador (medir, Lógica, ou a ideia que já existe lá); `null` = keyword nova. */
  keywordId: string | null;
  /** A keyword que ancora o artigo de destino (o Assunto ou a página publicada): dá a cor no Minerador. */
  targetKeywordId: string | null;
  targetTheme: string;
  targetKind: "published" | "subject";
  /** Destino Assunto: o import do Minerador liga a keyword nova a ele (e ao grupo dele). */
  subjectKeywordId: string | null;
  volume: number | null;
  volumeSource: "google_ads" | "google_ads_ideas" | null;
  measuredAt: string | null;
  /** Há medição do Google Ads guardada no servidor: gravar não consulta de novo. */
  hasStoredMeasurement: boolean;
  reason: string;
  origins: string[];
  evidence: string[];
  /** A busca de onde a ideia veio (proveniência do import do Minerador). */
  searchId: string | null;
};

/** A medição guardada (só no servidor; nunca vai ao navegador nem ao MCP). */
export type ArchitectSuggestionStoredMeasurement = { metric: GoogleAdsHistoricalMetric; requestId: string | null };

export type ArchitectSuggestionRecord = {
  contract: typeof ARCHITECT_SUGGESTIONS_CONTRACT;
  brandId: string;
  source: ArchitectSuggestionSource;
  sourceId: string;
  createdAt: string;
  actorId: string;
  items: ArchitectSuggestionItem[];
  /** Quantos ficaram de fora do teto do registro. */
  truncated: number;
  measurements?: Record<string, ArchitectSuggestionStoredMeasurement>;
};

export const ARCHITECT_SUGGESTION_KIND_LABELS: Record<ArchitectSuggestionKind, string> = {
  new_keyword: "keyword nova",
  measure: "medir volume",
  logic: "rodar a Lógica",
};

export const ARCHITECT_SUGGESTION_SOURCE_LABELS: Record<ArchitectSuggestionSource, string> = {
  improvement: "Melhorar publicados e formar Assuntos",
  reinforcement: "Reforçar publicados",
  differentiation: "Diferenciar publicados",
};

/** A chave do registro (o `subject_id` do item de workflow). */
export function architectSuggestionRecordKey(source: ArchitectSuggestionSource, sourceId: string): string {
  return `${source}:${sourceId}`;
}

export function architectSuggestionItemId(kind: ArchitectSuggestionKind, normalizedKeyword: string, targetKeywordId: string | null): string {
  return `${kind}:${normalizedKeyword}:${targetKeywordId ?? "-"}`;
}

/** A seleção na caixa do Minerador: registro + item. */
export function architectSuggestionSelectionKey(recordKey: string, itemId: string): string {
  return `${recordKey}#${itemId}`;
}

export type ArchitectSuggestionDraft = Omit<ArchitectSuggestionItem, "id" | "normalizedKeyword" | "evidence" | "origins" | "reason" | "hasStoredMeasurement"> & {
  reason: string; origins?: readonly string[]; evidence?: readonly string[]; measurement?: ArchitectSuggestionStoredMeasurement | null;
};

const cortar = (valor: string, maximo: number) => valor.length > maximo ? `${valor.slice(0, maximo - 1).trimEnd()}…` : valor;

/**
 * Monta o registro: itens únicos por (tipo, keyword, destino), a medição
 * guardada só para quem tem, e o teto. `null` quando não há o que sugerir.
 */
export function buildArchitectSuggestionRecord(input: {
  brandId: string; source: ArchitectSuggestionSource; sourceId: string; createdAt: string; actorId: string;
  drafts: readonly ArchitectSuggestionDraft[];
}): ArchitectSuggestionRecord | null {
  const vistos = new Map<string, ArchitectSuggestionItem>();
  const measurements: Record<string, ArchitectSuggestionStoredMeasurement> = {};
  for (const draft of input.drafts) {
    const normalizedKeyword = normalizeKeyword(draft.keyword);
    if (!normalizedKeyword) continue;
    const id = architectSuggestionItemId(draft.kind, normalizedKeyword, draft.targetKeywordId);
    if (vistos.has(id)) continue;
    const { measurement, ...resto } = draft;
    vistos.set(id, {
      ...resto,
      id,
      normalizedKeyword,
      reason: cortar(draft.reason.trim() || "Sugestão do Arquiteto.", 300),
      origins: [...new Set((draft.origins ?? []).map(String))].slice(0, 6),
      evidence: (draft.evidence ?? []).map(texto => cortar(String(texto), 160)).slice(0, 3),
      hasStoredMeasurement: Boolean(measurement),
    });
    if (measurement) measurements[id] = measurement;
  }
  const todos = [...vistos.values()];
  if (!todos.length) return null;
  const items = todos.slice(0, ARCHITECT_SUGGESTIONS_MAX_ITEMS);
  const guardadas = Object.fromEntries(Object.entries(measurements).filter(([id]) => items.some(item => item.id === id)));
  return {
    contract: ARCHITECT_SUGGESTIONS_CONTRACT,
    brandId: input.brandId,
    source: input.source,
    sourceId: input.sourceId,
    createdAt: input.createdAt,
    actorId: input.actorId,
    items,
    truncated: todos.length - items.length,
    ...(Object.keys(guardadas).length ? { measurements: guardadas } : {}),
  };
}

/** O que sai para o navegador e para o MCP: tudo menos a medição guardada. */
export function projectArchitectSuggestionRecord(record: ArchitectSuggestionRecord): Omit<ArchitectSuggestionRecord, "measurements"> {
  const { measurements: _guardadas, ...resto } = record;
  void _guardadas;
  return resto;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const textOrNull = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const KINDS: readonly ArchitectSuggestionKind[] = ["new_keyword", "measure", "logic"];
const SOURCES: readonly ArchitectSuggestionSource[] = ["improvement", "reinforcement", "differentiation"];

/** Lê um item gravado; o que não passa no contrato fica de fora (nunca é inventado). */
export function readArchitectSuggestionItem(value: unknown): ArchitectSuggestionItem | null {
  const raw = asRecord(value);
  const kind = KINDS.find(item => item === raw.kind);
  const keyword = textOrNull(raw.keyword);
  const id = textOrNull(raw.id);
  if (!kind || !keyword || !id) return null;
  return {
    id,
    kind,
    keyword,
    normalizedKeyword: textOrNull(raw.normalizedKeyword) ?? normalizeKeyword(keyword),
    keywordId: textOrNull(raw.keywordId),
    targetKeywordId: textOrNull(raw.targetKeywordId),
    targetTheme: textOrNull(raw.targetTheme) ?? keyword,
    targetKind: raw.targetKind === "subject" ? "subject" : "published",
    subjectKeywordId: textOrNull(raw.subjectKeywordId),
    volume: typeof raw.volume === "number" && Number.isFinite(raw.volume) ? raw.volume : null,
    volumeSource: raw.volumeSource === "google_ads" || raw.volumeSource === "google_ads_ideas" ? raw.volumeSource : null,
    measuredAt: textOrNull(raw.measuredAt),
    hasStoredMeasurement: raw.hasStoredMeasurement === true,
    reason: textOrNull(raw.reason) ?? "Sugestão do Arquiteto.",
    origins: Array.isArray(raw.origins) ? raw.origins.map(String).slice(0, 6) : [],
    evidence: Array.isArray(raw.evidence) ? raw.evidence.map(String).slice(0, 3) : [],
    searchId: textOrNull(raw.searchId),
  };
}

export function readArchitectSuggestionSource(value: unknown): ArchitectSuggestionSource | null {
  return SOURCES.find(item => item === value) ?? null;
}

/* ----------------------------- links para o Minerador ----------------------------- */

/**
 * O Arquiteto leva ao Minerador (nunca grava lá): a ação no Minerador é do
 * dono, pelo caminho de sempre. `aprovar` abre o "Aprovar e enviar" com as
 * keywords; `selecionar` filtra pela cor e marca as linhas (excluir, medir,
 * Lógica — os botões de sempre do Minerador); `sugestoes` abre a caixa.
 */
export const MINERADOR_HANDOFF_PARAM = "arquiteto" as const;
export type MineradorHandoffAction = "aprovar" | "selecionar" | "sugestoes";
/** Teto de ids num link (o mesmo teto do "Aprovar e enviar"). */
export const MINERADOR_HANDOFF_MAX_IDS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mineradorHandoffHref(brandRef: string, input: { action: MineradorHandoffAction; ids?: readonly string[]; color?: string | null }): string {
  const params = new URLSearchParams();
  params.set(MINERADOR_HANDOFF_PARAM, input.action);
  const ids = [...new Set((input.ids ?? []).filter(id => UUID.test(id)))].slice(0, MINERADOR_HANDOFF_MAX_IDS);
  if (ids.length) params.set("ids", ids.join(","));
  if (input.color) params.set("cor", input.color);
  return `/${brandRef}/minerador?${params.toString()}`;
}

export function readMineradorHandoff(search: URLSearchParams): { action: MineradorHandoffAction; ids: string[]; color: string | null } | null {
  const action = search.get(MINERADOR_HANDOFF_PARAM);
  if (action !== "aprovar" && action !== "selecionar" && action !== "sugestoes") return null;
  const ids = [...new Set((search.get("ids") ?? "").split(",").map(id => id.trim()).filter(id => UUID.test(id)))].slice(0, MINERADOR_HANDOFF_MAX_IDS);
  const color = textOrNull(search.get("cor"));
  return { action, ids, color };
}
