import type { ArchitectSuggestionItem, ArchitectSuggestionStoredMeasurement } from "../arquiteto/minerador-suggestions.ts";
import { normalizeKeyword } from "../arquiteto/minerador-suggestions.ts";
import {
  architectSuggestionDecisionInput,
  buildArchitectSuggestionLines,
  type ArchitectSuggestionFacts,
  type ArchitectSuggestionLine,
  type ArchitectSuggestionRecordRead,
} from "./architect-suggestions-view.ts";

/**
 * "SUGESTÕES DO ARQUITETO" — PRÉVIA E APLICAR, NO MINERADOR (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, F4; D3).
 *
 * Orquestração sobre portas: quem grava são os núcleos do Minerador
 * (`importSubjectDiscoveryWithCore` com a Lógica; `measureKeywordVolume` com a
 * medição guardada; `runKeywordLogicWithCore`), montados pela rota do
 * Minerador com a permissão de quem clicou. A prévia não grava e devolve o
 * `decisionHash`; aplicar refaz a prévia (hash diferente = nada gravado),
 * grava e relê. Aprovar e enviar NÃO acontece aqui: as linhas que ficam
 * "aprovar e enviar" voltam em `approveAndSendIds`, para o "Aprovar e enviar"
 * de sempre.
 */

export type ArchitectSuggestionImportRequest = {
  importRequestId: string;
  searchId: string;
  subjectKeywordId: string | null;
  subjectPhrase: string;
  items: Array<{ keyword: string; origins: string[]; evidence: string[] }>;
};

export type ArchitectSuggestionPorts = {
  readRecords: () => Promise<ArchitectSuggestionRecordRead[]>;
  readFacts: (records: readonly ArchitectSuggestionRecordRead[]) => Promise<ArchitectSuggestionFacts>;
  /** A medição guardada (só no servidor) por registro e item. */
  readMeasurements: (recordKeys: readonly string[]) => Promise<Map<string, Record<string, ArchitectSuggestionStoredMeasurement>>>;
  /** O import da Pesquisa por Assunto do Minerador, com a Lógica nas keywords do envio. */
  importKeywords: (request: ArchitectSuggestionImportRequest) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** O "Medir volume" do Minerador gravando a medição guardada (nenhuma consulta nova ao Google Ads). */
  recordMeasurements: (entries: ReadonlyArray<{ keywordId: string; measurement: ArchitectSuggestionStoredMeasurement }>) => Promise<{ failed: Array<{ keywordId: string; reason: string }> }>;
  /** A Lógica do botão do Minerador. */
  runLogic: (keywordIds: readonly string[]) => Promise<{ failedIds: string[] }>;
  hash: (value: unknown) => string;
  /** Um UUID estável a partir das partes (idempotência do import). */
  stableUuid: (...parts: string[]) => string;
};

export type ArchitectSuggestionPreview = {
  lines: ArchitectSuggestionLine[];
  selected: ArchitectSuggestionLine[];
  notApplicable: ArchitectSuggestionLine[];
  unknownKeys: string[];
  decisionHash: string;
};

export class ArchitectSuggestionStaleError extends Error {
  readonly code = "ARCHITECT_SUGGESTIONS_STALE";
  constructor() { super("As sugestões ou as keywords mudaram desde a prévia. Gere a prévia de novo; nada foi gravado."); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function previewArchitectSuggestions(ports: ArchitectSuggestionPorts, input: { brandId: string; keys: readonly string[] }): Promise<ArchitectSuggestionPreview & { records: ArchitectSuggestionRecordRead[] }> {
  const records = await ports.readRecords();
  const facts = await ports.readFacts(records);
  const lines = buildArchitectSuggestionLines(records, facts);
  const pedidas = [...new Set(input.keys)];
  const porChave = new Map(lines.map(line => [line.key, line]));
  const escolhidas = pedidas.map(key => porChave.get(key)).filter((line): line is ArchitectSuggestionLine => Boolean(line));
  const selected = escolhidas.filter(line => line.applicable);
  const notApplicable = escolhidas.filter(line => !line.applicable);
  return {
    records,
    lines,
    selected,
    notApplicable,
    unknownKeys: pedidas.filter(key => !porChave.has(key)),
    decisionHash: ports.hash(architectSuggestionDecisionInput(input.brandId, escolhidas)),
  };
}

export type ArchitectSuggestionApplyOutcome = {
  key: string;
  keyword: string;
  outcome: "imported" | "measurement_recorded" | "logic_applied" | "failed" | "skipped";
  reason: string | null;
};

export type ArchitectSuggestionApplyResult = {
  results: ArchitectSuggestionApplyOutcome[];
  /** Depois da releitura: as que agora esperam o "Aprovar e enviar" de sempre. */
  approveAndSendIds: string[];
  /** As que pedem o botão "Volume" de sempre (sem medição guardada). */
  measureInMineradorIds: string[];
  lines: ArchitectSuggestionLine[];
  readbackConfirmed: boolean;
};

export async function applyArchitectSuggestions(ports: ArchitectSuggestionPorts, input: { brandId: string; keys: readonly string[]; decisionHash: string }): Promise<ArchitectSuggestionApplyResult> {
  const previa = await previewArchitectSuggestions(ports, input);
  if (previa.decisionHash !== input.decisionHash) throw new ArchitectSuggestionStaleError();
  const results: ArchitectSuggestionApplyOutcome[] = [];
  const itemDe = (line: ArchitectSuggestionLine): ArchitectSuggestionItem | null => previa.records.find(record => record.recordKey === line.recordKey)?.items.find(item => item.id === line.itemId) ?? null;
  for (const line of previa.notApplicable) results.push({ key: line.key, keyword: line.keyword, outcome: "skipped", reason: line.stateLabel });

  const importar = previa.selected.filter(line => line.state === "import");
  const medir = previa.selected.filter(line => line.state === "record_measurement");
  const logica = previa.selected.filter(line => line.state === "run_logic");
  const medicoes = await ports.readMeasurements([...new Set([...importar, ...medir].map(line => line.recordKey))]);
  const medicaoDe = (line: ArchitectSuggestionLine) => medicoes.get(line.recordKey)?.[line.itemId] ?? null;

  /* 1 · importar (o núcleo da Pesquisa por Assunto do Minerador, com a Lógica), por busca e destino. */
  const lotes = new Map<string, { request: ArchitectSuggestionImportRequest; lines: ArchitectSuggestionLine[] }>();
  for (const line of importar) {
    const item = itemDe(line);
    if (!item) { results.push({ key: line.key, keyword: line.keyword, outcome: "failed", reason: "a sugestão não foi relida" }); continue; }
    const searchId = item.searchId && UUID.test(item.searchId) ? item.searchId : ports.stableUuid(line.recordKey, "search");
    const chave = `${searchId}|${item.subjectKeywordId ?? "-"}|${item.targetTheme}`;
    const lote = lotes.get(chave) ?? { request: { importRequestId: "", searchId, subjectKeywordId: item.subjectKeywordId, subjectPhrase: item.targetTheme.slice(0, 200), items: [] }, lines: [] };
    lote.request.items.push({ keyword: item.keyword, origins: item.origins.length ? item.origins : ["ads_keyword_seed"], evidence: item.evidence });
    lote.lines.push(line);
    lotes.set(chave, lote);
  }
  const importadas: ArchitectSuggestionLine[] = [];
  for (const lote of lotes.values()) {
    lote.request.importRequestId = ports.stableUuid(input.brandId, input.decisionHash, lote.request.searchId, lote.request.subjectKeywordId ?? "-", lote.request.subjectPhrase);
    const feito = await ports.importKeywords(lote.request);
    for (const line of lote.lines) {
      if (feito.ok) importadas.push(line);
      else results.push({ key: line.key, keyword: line.keyword, outcome: "failed", reason: feito.reason });
    }
  }

  /* 2 · a medição guardada das importadas e das pendentes, pelo "Medir volume" do Minerador (sem consulta nova). */
  const depoisDoImport = importadas.length ? await ports.readFacts(previa.records) : null;
  const aGravar: Array<{ line: ArchitectSuggestionLine; keywordId: string; measurement: ArchitectSuggestionStoredMeasurement }> = [];
  for (const line of importadas) {
    const id = depoisDoImport?.keywordsByNormalized.get(normalizeKeyword(line.keyword))?.id ?? null;
    const medicao = medicaoDe(line);
    if (id && medicao) aGravar.push({ line, keywordId: id, measurement: medicao });
  }
  for (const line of medir) {
    const medicao = medicaoDe(line);
    if (!line.keywordId || !medicao) { results.push({ key: line.key, keyword: line.keyword, outcome: "failed", reason: "a medição guardada não foi relida: use o botão Volume do Minerador" }); continue; }
    aGravar.push({ line, keywordId: line.keywordId, measurement: medicao });
  }
  const falhasDaMedicao = aGravar.length ? (await ports.recordMeasurements(aGravar.map(entry => ({ keywordId: entry.keywordId, measurement: entry.measurement })))).failed : [];
  const motivoDaMedicao = new Map(falhasDaMedicao.map(item => [item.keywordId, item.reason]));
  for (const line of importadas) {
    const gravada = aGravar.find(entry => entry.line === line);
    results.push({ key: line.key, keyword: line.keyword, outcome: "imported", reason: gravada && motivoDaMedicao.has(gravada.keywordId) ? `importada; a medição não foi gravada (${motivoDaMedicao.get(gravada.keywordId)})` : null });
  }
  for (const line of medir) {
    const gravada = aGravar.find(entry => entry.line === line);
    if (!gravada) continue;
    results.push({ key: line.key, keyword: line.keyword, outcome: motivoDaMedicao.has(gravada.keywordId) ? "failed" : "measurement_recorded", reason: motivoDaMedicao.get(gravada.keywordId) ?? null });
  }

  /* 3 · a Lógica do Minerador. */
  const logicaIds = logica.map(line => line.keywordId).filter((id): id is string => Boolean(id));
  const falhasDaLogica = new Set(logicaIds.length ? (await ports.runLogic(logicaIds)).failedIds : []);
  for (const line of logica) results.push({ key: line.key, keyword: line.keyword, outcome: line.keywordId && !falhasDaLogica.has(line.keywordId) ? "logic_applied" : "failed", reason: line.keywordId && !falhasDaLogica.has(line.keywordId) ? null : "a Lógica não foi confirmada na releitura" });

  /* 4 · releitura: o que agora espera o "Aprovar e enviar" de sempre. */
  const relidas = buildArchitectSuggestionLines(previa.records, await ports.readFacts(previa.records));
  const porChave = new Map(relidas.map(line => [line.key, line]));
  const tocadas = [...importadas, ...medir, ...logica];
  const readbackConfirmed = tocadas.every(line => {
    const relida = porChave.get(line.key);
    const resultado = results.find(item => item.key === line.key);
    if (!relida || resultado?.outcome === "failed") return true;
    return line.state === "import" ? relida.state !== "import" : relida.state === "done";
  });
  const pedidas = new Set([...previa.selected, ...previa.notApplicable].map(line => line.key));
  return {
    results,
    approveAndSendIds: [...new Set(relidas.filter(line => pedidas.has(line.key) && line.state === "approve_and_send" && line.keywordId).map(line => line.keywordId!))],
    measureInMineradorIds: [...new Set(relidas.filter(line => pedidas.has(line.key) && line.state === "measure_in_minerador" && line.keywordId).map(line => line.keywordId!))],
    lines: relidas,
    readbackConfirmed,
  };
}
