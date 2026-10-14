import {
  ARCHITECT_SUGGESTION_KIND_LABELS,
  ARCHITECT_SUGGESTION_SOURCE_LABELS,
  architectSuggestionSelectionKey,
  type ArchitectSuggestionItem,
  type ArchitectSuggestionKind,
  type ArchitectSuggestionSource,
} from "../arquiteto/minerador-suggestions.ts";
import { EDITORIAL_GROUP_COLORS, type EditorialGroupColor } from "../editorial/editorial-groups.ts";

/**
 * "SUGESTÕES DO ARQUITETO · COR X" — A CAIXA DO MINERADOR (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, F4; D3).
 *
 * O Minerador LÊ as sugestões que o Arquiteto gravou (keyword nova, medição a
 * gravar, Lógica a rodar) e as cruza com o estado ATUAL das keywords dele:
 * cada linha diz o que falta e quem faz. Nada aqui grava. Os três atos que a
 * caixa oferece são do Minerador, pelos núcleos do Minerador, no clique do
 * dono:
 *
 *   importar        → `importSubjectDiscoveryWithCore` (+ Lógica + medição guardada, sem nova consulta);
 *   gravar medição  → `measureKeywordVolume` com a medição guardada (replay);
 *   rodar a Lógica  → `runKeywordLogicWithCore`.
 *
 * Aprovar e enviar continua sendo o "Aprovar e enviar" de sempre.
 *
 * Domínio puro (o navegador também usa os rótulos).
 */

export type ArchitectSuggestionLineState =
  | "import"
  | "approve_and_send"
  | "record_measurement"
  | "measure_in_minerador"
  | "run_logic"
  | "done"
  | "rejected"
  | "missing";

export const ARCHITECT_SUGGESTION_STATE_LABELS: Record<ArchitectSuggestionLineState, string> = {
  import: "importar no Minerador",
  approve_and_send: "aprovar e enviar",
  record_measurement: "gravar a medição (sem consultar de novo)",
  measure_in_minerador: "medir no Minerador (botão Volume)",
  run_logic: "rodar a Lógica",
  done: "resolvida",
  rejected: "rejeitada no Minerador (decisão sua; não volta sozinha)",
  missing: "a keyword não existe mais nesta marca",
};

/** Os estados que o "Aplicar no Minerador" da caixa resolve (os outros têm o caminho de sempre). */
export const ARCHITECT_SUGGESTION_APPLY_STATES: readonly ArchitectSuggestionLineState[] = ["import", "record_measurement", "run_logic"];

export type ArchitectSuggestionKeywordFact = {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  status: string | null;
  intent: string | null;
  volumeSource: string | null;
  volume: number | null;
  groupId: string | null;
};

export type ArchitectSuggestionFacts = {
  keywordsById: ReadonlyMap<string, ArchitectSuggestionKeywordFact>;
  keywordsByNormalized: ReadonlyMap<string, ArchitectSuggestionKeywordFact>;
  /** Keywords com item recebido no Arquiteto. */
  receivedInArquiteto: ReadonlySet<string>;
  colorOfGroup: (groupId: string | null) => EditorialGroupColor | null;
};

export type ArchitectSuggestionRecordRead = {
  recordKey: string;
  source: ArchitectSuggestionSource;
  createdAt: string;
  items: readonly ArchitectSuggestionItem[];
};

export type ArchitectSuggestionLine = {
  key: string;
  recordKey: string;
  itemId: string;
  kind: ArchitectSuggestionKind;
  kindLabel: string;
  keyword: string;
  /** A keyword do Minerador hoje (a nova, depois de importada). */
  keywordId: string | null;
  targetTheme: string;
  targetKind: "published" | "subject";
  color: EditorialGroupColor | null;
  volume: number | null;
  volumeLabel: string;
  reason: string;
  source: ArchitectSuggestionSource;
  sourceLabel: string;
  createdAt: string;
  state: ArchitectSuggestionLineState;
  stateLabel: string;
  /** O "Aplicar no Minerador" desta caixa resolve. */
  applicable: boolean;
};

const volumeLabel = (item: Pick<ArchitectSuggestionItem, "volume" | "volumeSource">) => item.volume === null
  ? "sem volume medido"
  : `${Math.round(item.volume).toLocaleString("pt-BR")}${item.volumeSource === "google_ads_ideas" ? " (ideia do Google Ads)" : " (Google Ads)"}`;

function stateOf(item: ArchitectSuggestionItem, facts: ArchitectSuggestionFacts): { state: ArchitectSuggestionLineState; keywordId: string | null } {
  if (item.kind === "new_keyword") {
    const atual = (item.keywordId ? facts.keywordsById.get(item.keywordId) : undefined) ?? facts.keywordsByNormalized.get(item.normalizedKeyword);
    if (!atual) return { state: "import", keywordId: null };
    if ((atual.status ?? "").toLocaleLowerCase("pt-BR") === "rejeitado") return { state: "rejected", keywordId: atual.id };
    if (facts.receivedInArquiteto.has(atual.id)) return { state: "done", keywordId: atual.id };
    return { state: "approve_and_send", keywordId: atual.id };
  }
  const atual = item.keywordId ? facts.keywordsById.get(item.keywordId) : undefined;
  if (!atual) return { state: "missing", keywordId: item.keywordId };
  if (item.kind === "measure") {
    if ((atual.volumeSource ?? "").toLowerCase() === "google_ads" && (atual.volume ?? 0) > 0) return { state: "done", keywordId: atual.id };
    return { state: item.hasStoredMeasurement ? "record_measurement" : "measure_in_minerador", keywordId: atual.id };
  }
  return { state: atual.intent ? "done" : "run_logic", keywordId: atual.id };
}

/**
 * As linhas da caixa: a sugestão mais nova vence por (tipo, keyword, destino);
 * a cor é a do grupo da keyword que ancora o artigo de destino. Ordem: cor,
 * depois o que falta fazer, depois a mais nova.
 */
export function buildArchitectSuggestionLines(records: readonly ArchitectSuggestionRecordRead[], facts: ArchitectSuggestionFacts): ArchitectSuggestionLine[] {
  const maisNovas = [...records].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const vistas = new Set<string>();
  const linhas: ArchitectSuggestionLine[] = [];
  for (const record of maisNovas) {
    for (const item of record.items) {
      const unica = `${item.kind}|${item.normalizedKeyword}|${item.targetKeywordId ?? "-"}`;
      if (vistas.has(unica)) continue;
      vistas.add(unica);
      const { state, keywordId } = stateOf(item, facts);
      const alvo = item.targetKeywordId ? facts.keywordsById.get(item.targetKeywordId) : undefined;
      linhas.push({
        key: architectSuggestionSelectionKey(record.recordKey, item.id),
        recordKey: record.recordKey,
        itemId: item.id,
        kind: item.kind,
        kindLabel: ARCHITECT_SUGGESTION_KIND_LABELS[item.kind],
        keyword: item.keyword,
        keywordId,
        targetTheme: item.targetTheme,
        targetKind: item.targetKind,
        color: facts.colorOfGroup(alvo?.groupId ?? null),
        volume: item.volume,
        volumeLabel: volumeLabel(item),
        reason: item.reason,
        source: record.source,
        sourceLabel: ARCHITECT_SUGGESTION_SOURCE_LABELS[record.source],
        createdAt: record.createdAt,
        state,
        stateLabel: ARCHITECT_SUGGESTION_STATE_LABELS[state],
        applicable: ARCHITECT_SUGGESTION_APPLY_STATES.includes(state),
      });
    }
  }
  const ordemCor = (cor: EditorialGroupColor | null) => cor ? EDITORIAL_GROUP_COLORS.indexOf(cor) : EDITORIAL_GROUP_COLORS.length;
  const ordemEstado = (linha: ArchitectSuggestionLine) => linha.applicable ? 0 : linha.state === "approve_and_send" || linha.state === "measure_in_minerador" ? 1 : 2;
  return linhas.sort((a, b) => ordemCor(a.color) - ordemCor(b.color) || ordemEstado(a) - ordemEstado(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export type ArchitectSuggestionColorSummary = { color: EditorialGroupColor | null; total: number; pending: number };

/** As contagens por cor ("Sugestões do Arquiteto · cor X (N)"): N = o que ainda falta fazer. */
export function summarizeArchitectSuggestions(lines: readonly ArchitectSuggestionLine[]): ArchitectSuggestionColorSummary[] {
  const cores: Array<EditorialGroupColor | null> = [...EDITORIAL_GROUP_COLORS, null];
  return cores.map(color => {
    const daCor = lines.filter(line => line.color === color);
    return { color, total: daCor.length, pending: daCor.filter(line => line.state !== "done" && line.state !== "rejected" && line.state !== "missing").length };
  }).filter(summary => summary.total > 0);
}

/** O que o hash da prévia cobre: as linhas pedidas e o estado lido agora. */
export function architectSuggestionDecisionInput(brandId: string, lines: readonly Pick<ArchitectSuggestionLine, "key" | "state" | "keywordId">[]) {
  return { contract: "architect-suggestions-apply@1", brandId, lines: [...lines].map(line => ({ key: line.key, state: line.state, keywordId: line.keywordId })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) };
}
