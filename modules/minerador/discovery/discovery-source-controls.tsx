"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Papa from "papaparse";
import { X } from "lucide-react";
import type { DiscoveryCandidate } from "@/lib/minerador/discovery-keywords";
import { normalizeDiscoverySourceEntries, parseDiscoveryCsvRows, parseManualKeywords, parseManualSubjects, type DiscoverySourceEntryInput } from "@/lib/minerador/discovery-sources";
import type { SubjectImportClassification, SubjectImportCounts, SubjectImportOutcome, SubjectImportRow } from "@/lib/minerador/keyword-import-core";
import { useNoticeBridge } from "@/components/global-notice-center";

type SourceKind = "manual" | "csv";
/** "Esta lista é" (SDD 2026-09-24, F1.3). Só existe com `subjectEntry`. */
type EntryKind = "subject" | "keyword";
type SubjectImportEntry = { keyword: string; note: string | null; destinationUrl: string | null; listaReference: string | null };
type SubjectPreview = { importRequestId: string; source: SourceKind; entries: SubjectImportEntry[]; defaultListaId: string | null; rows: SubjectImportRow[]; counts: SubjectImportCounts; notices: string[] };
type SubjectImportResponse = { success?: boolean; message?: string; mode?: "preview" | "apply"; rows?: SubjectImportRow[]; counts?: SubjectImportCounts; createdIds?: string[]; declaredIds?: string[]; failed?: number; notices?: string[] };

const SUBJECT_CLASSIFICATION_LABELS: Record<SubjectImportClassification, string> = {
  new: "Nova",
  existing_without_subject: "Já existe sem Assunto",
  existing_subject_same: "Já é Assunto",
  existing_subject_different: "Já é Assunto, com nota ou destino diferentes",
  published: "Publicada",
  invalid: "Inválida",
};
const SUBJECT_CLASSIFICATION_TONE: Record<SubjectImportClassification, string> = {
  new: "text-text",
  existing_without_subject: "text-text",
  existing_subject_same: "text-text-muted",
  existing_subject_different: "text-warning",
  published: "text-warning",
  invalid: "text-danger",
};
/** Linhas que o humano pode marcar. Existente já declarada e inválida não têm o que aplicar. */
function subjectRowSelectable(row: SubjectImportRow) {
  return row.classification === "new" || row.classification === "existing_without_subject" || row.classification === "published";
}

/** Cabeçalho "Assunto" numa lista de uma coluna: o parser não o reconhece e ele vira a primeira linha. */
function looksLikeSubjectHeader(row: SubjectImportRow) {
  return row.index === 0 && (row.normalizedKeyword === "assunto" || row.normalizedKeyword === "assuntos");
}

/** Nova vem marcada; frase que já existe na marca vem desmarcada (Q2); o provável cabeçalho também. */
function subjectRowDefaultSelected(row: SubjectImportRow) {
  return row.classification === "new" && !looksLikeSubjectHeader(row);
}

function subjectEntryText(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toSubjectEntries(entries: DiscoverySourceEntryInput[]): SubjectImportEntry[] {
  return entries.map(entry => ({
    keyword: typeof entry.keyword === "string" ? entry.keyword : entry.keyword === undefined || entry.keyword === null ? "" : String(entry.keyword),
    note: subjectEntryText(entry.note),
    destinationUrl: subjectEntryText(entry.destinationUrl),
    listaReference: subjectEntryText(entry.listaReference),
  }));
}

function subjectRowDetail(row: SubjectImportRow) {
  const parts: string[] = [];
  if (row.reason) parts.push(row.reason);
  if (row.keywordId && (row.status || row.originLabel)) parts.push([row.status ? `Status: ${row.status}` : "", row.originLabel ? `origem: ${row.originLabel}` : ""].filter(Boolean).join(" · "));
  if (row.approvalWarning) parts.push(row.approvalWarning);
  if (row.recorded && row.classification === "existing_subject_different") {
    parts.push(`Gravado: nota ${row.recorded.note || "(sem nota)"} · destino ${row.recorded.destinationUrl || "(sem destino)"}.`);
    parts.push(`No arquivo: nota ${row.note || "(sem nota)"} · destino ${row.destinationUrl || "(sem destino)"}.`);
  } else if (row.classification !== "invalid" && (row.note || row.destinationUrl)) {
    parts.push([row.note ? `Nota: ${row.note}` : "", row.destinationUrl ? `Destino: ${row.destinationUrl}` : ""].filter(Boolean).join(" · "));
  }
  parts.push(...row.notices);
  return parts.filter(Boolean);
}

function subjectResultText(response: SubjectImportResponse) {
  const rows = response.rows || [];
  const count = (outcome: SubjectImportOutcome) => rows.filter(row => row.outcome === outcome).length;
  const created = response.createdIds?.length || 0;
  const declared = response.declaredIds?.length || 0;
  const parts = [`${created} criada(s)`, `${declared} declarada(s)`];
  if (count("unchanged")) parts.push(`${count("unchanged")} sem mudança`);
  if (count("kept")) parts.push(`${count("kept")} mantida(s) como estavam`);
  if (count("not_marked")) parts.push(`${count("not_marked")} não marcada(s)`);
  if (count("invalid")) parts.push(`${count("invalid")} inválida(s)`);
  if (response.failed) parts.push(`${response.failed} com falha`);
  const failures = rows.filter(row => row.outcome === "failed").slice(0, 3).map(row => `${row.keyword}: ${row.reason || "falha sem motivo"}`);
  return `Assuntos aplicados: ${parts.join(", ")}.${failures.length ? ` Falhas: ${failures.join("; ")}` : ""}`;
}
export type DiscoverySourceControlsHandle = {
  openManual: () => void;
  openCsv: () => void;
};
type CsvPreview = { entries: DiscoverySourceEntryInput[]; rows: number; validRows: number; duplicateRows: number; rejectedRows: number; importedMetricRows: number; fields: string[]; ignoredFields: string[] };
export type DiscoverySourceResponse = {
  source: SourceKind;
  runId: string;
  operationRequestId: string;
  executedAt: string;
  draft: Record<string, unknown>;
  targeting: null;
  candidates: DiscoveryCandidate[];
  foundCount: number;
  returnedCount: number;
  summary: { found: number; approved: number; filtered: number; duplicates: number; rejected: number; unresolvedListReferences: number };
};

const button = "inline-flex h-9 items-center justify-center gap-2 rounded border px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${button} border-action-accent bg-action-accent text-foreground hover:bg-action-accent/90`;
const neutralButton = `${button} border-border bg-surface text-text hover:border-text-muted hover:bg-surface-elevated`;
const control = "mt-1 h-10 w-full rounded border border-border bg-surface-subtle px-3 text-sm text-text outline-none scheme-dark in-[.light]:scheme-light in-data-[theme=light]:scheme-light focus:border-focus focus-visible:ring-2 focus-visible:ring-focus";

function brandIdFromRef(brandRef: string) { return brandRef.split("--").at(-1)?.trim() || ""; }
function normalizeListLabel(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " "); }
function sourceRequestIssueText(diagnostic: unknown) {
  if (!diagnostic || typeof diagnostic !== "object" || !Array.isArray((diagnostic as { issues?: unknown }).issues)) return "";
  const issues = (diagnostic as { issues: unknown[] }).issues
    .map(issue => {
      if (!issue || typeof issue !== "object") return "";
      const value = issue as { path?: unknown; code?: unknown };
      const path = Array.isArray(value.path) ? value.path.map(part => String(part)).join(".") : "payload";
      const code = typeof value.code === "string" ? value.code : "invalid";
      return `${path}: ${code}`;
    })
    .filter(Boolean)
    .slice(0, 4);
  return issues.length ? ` Detalhe: ${issues.join("; ")}.` : "";
}

function buildCsvPreview(rows: unknown[][], subjectColumns: boolean): CsvPreview { const parsed = subjectColumns ? parseDiscoveryCsvRows(rows, { subjectColumns: true }) : parseDiscoveryCsvRows(rows); const normalized = normalizeDiscoverySourceEntries({ source: "csv", entries: parsed.entries }); const importedMetricRows = parsed.entries.filter(entry => Object.values(entry.importedMetrics || {}).some(value => value !== null && value !== undefined && String(value).trim() !== "")).length; return { entries: parsed.entries, rows: parsed.rowCount, validRows: normalized.accepted.length, duplicateRows: normalized.duplicateCount, rejectedRows: normalized.rejectedCount, importedMetricRows, fields: parsed.recognizedFields, ignoredFields: parsed.ignoredFields }; }

function previewFields(fields: string[]) {
  return fields.length ? fields.join(", ") : "nenhum";
}

export const DiscoverySourceControls = forwardRef<DiscoverySourceControlsHandle, {
  brandRef: string;
  preliminaryIntent: string;
  preliminaryFunnel: string;
  onComplete: (response: DiscoverySourceResponse) => void;
  /** Só o Processador passa: mostra "Esta lista é" (Assunto / Keyword). O Descobrir não passa e nada muda lá. */
  subjectEntry?: boolean;
  /** Chamado depois de aplicar um import de Assuntos, com o que foi criado e o que foi declarado. */
  onSubjectsImported?: (result: { createdIds: string[]; declaredIds: string[] }) => void;
}>(function DiscoverySourceControls({ brandRef, preliminaryIntent, preliminaryFunnel, onComplete, subjectEntry, onSubjectsImported }, ref) {
  const [open, setOpen] = useState<SourceKind | null>(null);
  const [entryKind, setEntryKind] = useState<EntryKind>("subject");
  const [csvRows, setCsvRows] = useState<unknown[][] | null>(null);
  const [subjectPreview, setSubjectPreview] = useState<SubjectPreview | null>(null);
  const [subjectSelected, setSubjectSelected] = useState<Set<number>>(() => new Set());
  const [subjectResult, setSubjectResult] = useState<{ text: string; failed: boolean } | null>(null);
  const subjectMode = Boolean(subjectEntry) && entryKind === "subject";
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualListId, setManualListId] = useState("");
  const [csvDefaultListId, setCsvDefaultListId] = useState("");
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useNoticeBridge({ notice: error || listsError, module: "minerador", area: "Importação de fontes", title: "Minerador · Importação", fallbackSeverity: "ERROR" });
  const fileRef = useRef<HTMLInputElement>(null);
  const listsFetchStarted = useRef(false);

  useEffect(() => {
    if (!open || lists.length || listsFetchStarted.current) return;
    let active = true;
    listsFetchStarted.current = true;
    fetch(`/api/minerador/marcas/${encodeURIComponent(brandIdFromRef(brandRef))}/discovery/sources`, { cache: "no-store" })
      .then(async response => ({ response, payload: await response.json() as { success?: boolean; lists?: Array<{ id: string; name: string }>; message?: string } }))
      .then(({ response, payload }) => { if (!active) return; if (!response.ok || !payload.success) throw new Error(payload.message || "Não foi possível carregar as listas."); setLists(payload.lists || []); })
      .catch(reason => { if (active) setListsError(reason instanceof Error ? reason.message : "Não foi possível carregar as listas."); })
      .finally(() => { listsFetchStarted.current = false; if (active) setListsLoading(false); });
    return () => { active = false; };
  }, [brandRef, lists.length, open]);

  const resetSubject = () => { setSubjectPreview(null); setSubjectSelected(new Set()); setSubjectResult(null); };
  const close = () => { if (!submitting) { setOpen(null); setError(""); resetSubject(); } };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setOpen(null);
        setError("");
        setSubjectPreview(null);
        setSubjectSelected(new Set());
        setSubjectResult(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  const openSource = useCallback((source: SourceKind) => {
    setOpen(source);
    setError("");
    setListsError("");
    if (subjectEntry) {
      // "Esta lista é" volta ao padrão Assunto a cada abertura; um CSV já lido é relido com as colunas do Assunto.
      setEntryKind("subject");
      if (csvRows) setCsvPreview(buildCsvPreview(csvRows, true));
    }
    if (!lists.length && !listsFetchStarted.current) setListsLoading(true);
    if (source === "csv") setTimeout(() => fileRef.current?.focus(), 0);
  }, [lists.length, subjectEntry, csvRows]);
  useImperativeHandle(ref, () => ({
    openManual: () => openSource("manual"),
    openCsv: () => openSource("csv"),
  }), [openSource]);
  const postSource = async (source: SourceKind, entries: DiscoverySourceEntryInput[]) => {
    if (!entries.length) { setError(source === "manual" ? "Cole pelo menos uma keyword." : "O CSV não contém keywords reconhecidas."); return; }
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandIdFromRef(brandRef))}/discovery/sources`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationRequestId: crypto.randomUUID(), source, entries, preliminaryIntent, preliminaryFunnel }) });
      const payload = await response.json() as DiscoverySourceResponse & { success?: boolean; message?: string; diagnostic?: { migration?: string; issues?: unknown[] } };
      if (!response.ok || !payload.success) {
        const message = payload.message || (payload.diagnostic?.migration ? `A migration ${payload.diagnostic.migration} ainda não foi aplicada.` : "A origem não pôde ser persistida.");
        throw new Error(`${message}${sourceRequestIssueText(payload.diagnostic)}`);
      }
      onComplete(payload); setOpen(null); setManualText(""); setCsvPreview(null); setFileName("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A origem não pôde ser persistida."); }
    finally { setSubmitting(false); }
  };

  const parseFile = (file: File) => {
    setFileName(file.name); setCsvPreview(null); setCsvRows(null); setError(""); resetSubject();
    Papa.parse<unknown[]>(file, { header: false, skipEmptyLines: true, complete: result => { setCsvRows(result.data); setCsvPreview(buildCsvPreview(result.data, subjectMode)); }, error: reason => setError(reason.message || "Não foi possível ler o CSV.") });
  };
  const changeEntryKind = (next: EntryKind) => {
    setEntryKind(next); setError(""); resetSubject();
    // O mesmo arquivo é relido com ou sem as colunas nota e página.
    if (csvRows) setCsvPreview(buildCsvPreview(csvRows, next === "subject"));
  };

  const postSubjects = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandIdFromRef(brandRef))}/subjects/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as SubjectImportResponse & { diagnostic?: unknown };
    if (!response.ok || !payload.success) throw new Error(`${payload.message || "O import de Assuntos não pôde ser concluído."}${sourceRequestIssueText(payload.diagnostic)}`);
    return payload;
  };
  const previewSubjects = async (source: SourceKind, entries: SubjectImportEntry[], defaultListaId: string | null) => {
    if (!entries.length) { setError(source === "manual" ? "Cole pelo menos um Assunto." : "O CSV não contém frases reconhecidas."); return; }
    setSubmitting(true); setError(""); resetSubject();
    try {
      // Prévia: nada é escrito. O id do envio nasce aqui e se repete se o humano reenviar a mesma prévia.
      const importRequestId = crypto.randomUUID();
      const payload = await postSubjects({ mode: "preview", source, entries, defaultListaId });
      const rows = payload.rows || [];
      setSubjectPreview({ importRequestId, source, entries, defaultListaId, rows, counts: payload.counts as SubjectImportCounts, notices: payload.notices || [] });
      setSubjectSelected(new Set(rows.filter(subjectRowDefaultSelected).map(row => row.index)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A prévia dos Assuntos não pôde ser montada."); }
    finally { setSubmitting(false); }
  };
  const applySubjects = async () => {
    if (!subjectPreview) return;
    const chosen = subjectPreview.rows.filter(row => subjectRowSelectable(row) && subjectSelected.has(row.index));
    if (!chosen.length) { setError("Marque pelo menos uma frase para aplicar."); return; }
    setSubmitting(true); setError("");
    try {
      const payload = await postSubjects({
        mode: "apply",
        importRequestId: subjectPreview.importRequestId,
        source: subjectPreview.source,
        entries: chosen.map(row => subjectPreview.entries[row.index]),
        defaultListaId: subjectPreview.defaultListaId,
        declareExistingIds: chosen.filter(row => row.classification !== "new" && row.keywordId).map(row => row.keywordId as string),
      });
      const createdIds = payload.createdIds || [];
      const declaredIds = payload.declaredIds || [];
      setSubjectResult({ text: subjectResultText(payload), failed: Boolean(payload.failed) });
      setSubjectPreview(null); setSubjectSelected(new Set()); setManualText(""); setCsvPreview(null); setCsvRows(null); setFileName("");
      onSubjectsImported?.({ createdIds, declaredIds });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "O import de Assuntos não pôde ser concluído."); }
    finally { setSubmitting(false); }
  };
  const toggleSubjectRow = (index: number, checked: boolean) => setSubjectSelected(current => { const next = new Set(current); if (checked) next.add(index); else next.delete(index); return next; });

  const unresolvedListReferences = csvPreview
    ? csvPreview.entries.filter(entry => { const reference = typeof entry.listaReference === "string" ? entry.listaReference.trim() : ""; if (!reference) return false; return !lists.some(list => list.id === reference || normalizeListLabel(list.name) === normalizeListLabel(reference)); }).length
    : 0;

  return <>
    {open && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/75 px-4 py-8" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="discovery-source-title" className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-surface-elevated text-text shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {subjectMode ? <>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">Processar Keywords</p>
              <h2 id="discovery-source-title" className="mt-1 text-lg font-semibold text-text">{open === "manual" ? "Colar Assuntos" : "Importar CSV de Assuntos"}</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">Os Assuntos entram direto na tabela do Processador, declarados por você. Frases que já existem nesta marca vêm desmarcadas.</p>
            </> : <>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">Descobrir Keywords</p>
              <h2 id="discovery-source-title" className="mt-1 text-lg font-semibold text-text">{open === "manual" ? "Colar keywords" : "Importar CSV"}</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">A origem será revisada na Descoberta. Nenhuma keyword oficial é criada nesta etapa.</p>
            </>}
          </div>
          <button type="button" className="shrink-0 rounded border border-border p-1.5 text-text-muted transition-colors hover:bg-surface-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={close} aria-label="Fechar"><X className="h-4 w-4"/></button>
        </header>

        <div className="space-y-5 p-5">
          {subjectEntry && <label className="block text-sm font-medium text-text">Esta lista é
            <select value={entryKind} onChange={event => changeEntryKind(event.target.value === "keyword" ? "keyword" : "subject")} className={control} disabled={submitting}>
              <option value="subject">Assunto</option>
              <option value="keyword">Keyword</option>
            </select>
            <span className="mt-1 block text-sm font-normal leading-6 text-text-muted">{entryKind === "subject" ? "Assunto: frases que você declara como tronco de artigos. Entram direto no Processador, sem medir antes." : "Keyword: segue para a Descoberta medir, como hoje."}</span>
          </label>}
          {subjectResult && <p className={`rounded border px-3 py-2 text-sm leading-6 ${subjectResult.failed ? "border-warning/45 bg-warning-soft text-warning" : "border-success/45 bg-success-soft text-success"}`} role="status">{subjectResult.text}</p>}
          {open === "manual" ? <>
            <label className="block text-sm font-medium text-text">
              {subjectMode ? "Assuntos" : "Palavras-chave"}
              <textarea value={manualText} onChange={event => setManualText(event.target.value)} className="mt-1 min-h-40 w-full resize-y rounded border border-border bg-surface-subtle p-3 text-sm leading-6 text-text outline-none placeholder:text-text-muted focus:border-focus focus-visible:ring-2 focus-visible:ring-focus" placeholder={subjectMode ? "Um Assunto por linha" : "Uma keyword por linha"} autoFocus/>
              <span className="mt-1 block text-sm text-text-muted">{subjectMode ? "Cole um por linha; vírgulas fazem parte da frase. Linhas vazias serão ignoradas." : "Cole uma por linha; linhas vazias serão ignoradas."}</span>
            </label>

            <label className="block text-sm font-medium text-text">Lista opcional
              <select value={manualListId} onChange={event => setManualListId(event.target.value)} className={control} disabled={listsLoading}>
                <option value="">Sem lista</option>
                {lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
              </select>
            </label>
            {!listsLoading && !lists.length && <p className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm leading-6 text-text-muted">Nenhuma lista disponível. As keywords serão adicionadas sem lista.</p>}
            {listsError && <p className="text-sm leading-6 text-warning">{listsError} Você ainda pode importar sem lista.</p>}
            {subjectMode
              ? <p className="text-sm leading-6 text-text-muted">A lista é opcional. Nota e página de destino entram depois, na Revisão Humana, ou pelas colunas do CSV.</p>
              : <p className="text-sm leading-6 text-text-muted">Silo não é necessário para a Descoberta. A lista é opcional e referências não encontradas não invalidam a keyword.</p>}

            {subjectMode ? subjectPreview ? null : <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" className={`${neutralButton} w-full sm:w-auto`} onClick={close}>{subjectResult ? "Concluir" : "Cancelar"}</button>
              <button type="button" className={`${primaryButton} w-full sm:w-auto`} disabled={submitting} onClick={() => void previewSubjects("manual", toSubjectEntries(parseManualSubjects(manualText)), manualListId || null)}>{submitting ? "Conferindo..." : "Pré-visualizar"}</button>
            </div> : <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" className={`${neutralButton} w-full sm:w-auto`} onClick={close}>Cancelar</button>
              <button type="button" className={`${primaryButton} w-full sm:w-auto`} disabled={submitting} onClick={() => void postSource("manual", parseManualKeywords(manualText).map(entry => ({ ...entry, listaId: manualListId || undefined })))}>{submitting ? "Enviando..." : "Adicionar à Descoberta"}</button>
            </div>}
          </> : <>
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="discovery-csv-file">Arquivo CSV</label>
              <input id="discovery-csv-file" ref={fileRef} type="file" accept=".csv,text/csv" className="mt-1 block w-full rounded border border-border bg-surface-subtle p-2 text-sm text-text file:mr-3 file:rounded file:border-0 file:bg-surface-elevated file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text hover:file:bg-surface" onChange={event => { const file = event.target.files?.[0]; if (file) parseFile(file); }}/>
              <p className="mt-1 text-sm leading-6 text-text-muted">{subjectMode ? "A coluna da frase precisa se chamar Keyword (ou Termo); um cabeçalho Assunto não é reconhecido. Uma lista de uma coluna também pode vir sem cabeçalho. Nota e Página (destino) são opcionais. Métricas não são aproveitadas: quem mede é o Processador." : "A coluna Keyword é obrigatória; uma lista de uma coluna também pode vir sem cabeçalho. Volume e Resultados são aproveitados quando presentes."}</p>
            </div>

            <label className="block text-sm font-medium text-text">Lista padrão para linhas sem lista
              <select value={csvDefaultListId} onChange={event => setCsvDefaultListId(event.target.value)} className={control} disabled={listsLoading}>
                <option value="">Sem lista</option>
                {lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
              </select>
            </label>

            {fileName && csvPreview && <div className="space-y-4 rounded-lg border border-border bg-surface-subtle p-4" aria-label="Prévia do CSV">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-text" title={fileName}>{fileName}</p>
                <span className="text-sm text-text-muted">Prévia</span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Encontradas", csvPreview.rows],
                  ["Válidas", csvPreview.validRows],
                  ["Duplicadas", csvPreview.duplicateRows],
                  ["Rejeitadas", csvPreview.rejectedRows],
                ].map(([label, value]) => <div key={String(label)} className="rounded border border-border bg-surface-elevated px-3 py-2"><p className="text-sm text-text-muted">{label}</p><p className="mt-1 text-base font-semibold text-text">{value}</p></div>)}
              </div>

              <div className="space-y-1 text-sm leading-6">
                <p className="text-text"><span className="font-semibold">Dados aproveitados:</span> {previewFields(csvPreview.fields)}</p>
                {!subjectMode && <p className="text-text"><span className="font-semibold">Linhas com métricas:</span> {csvPreview.importedMetricRows}</p>}
                <p className="text-warning"><span className="font-semibold">Campos adicionais ignorados:</span> {csvPreview.ignoredFields.length}</p>
                <p className="text-warning"><span className="font-semibold">Referências de lista não resolvidas:</span> {listsLoading ? "validando…" : unresolvedListReferences}</p>
              </div>

              {csvPreview.ignoredFields.length > 0 && <details className="rounded border border-border bg-surface-elevated px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-text">Ver campos ignorados ({csvPreview.ignoredFields.length})</summary>
                <p className="mt-2 leading-6 text-text-muted">{csvPreview.ignoredFields.slice(0, 32).join(", ")}{csvPreview.ignoredFields.length > 32 ? ` e mais ${csvPreview.ignoredFields.length - 32}.` : ""}</p>
              </details>}

              <details className="rounded border border-border bg-surface-elevated px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-text">{subjectMode ? "Ver amostra de Assuntos" : "Ver amostra de keywords"} ({csvPreview.entries.length})</summary>
                <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5 leading-6 text-text-muted">{csvPreview.entries.slice(0, 8).map((entry, index) => <li key={`${String(entry.keyword)}-${index}`}>{String(entry.keyword || "(vazia)")}</li>)}</ul>
              </details>
            </div>}

            {subjectMode ? subjectPreview ? null : <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" className={`${neutralButton} w-full sm:w-auto`} onClick={close}>{subjectResult ? "Concluir" : "Cancelar"}</button>
              <button type="button" className={`${primaryButton} w-full sm:w-auto`} disabled={submitting || !csvPreview?.validRows} onClick={() => void previewSubjects("csv", toSubjectEntries(csvPreview?.entries || []), csvDefaultListId || null)}>{submitting ? "Conferindo..." : "Pré-visualizar"}</button>
            </div> : <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" className={`${neutralButton} w-full sm:w-auto`} onClick={close}>Cancelar</button>
              <button type="button" className={`${primaryButton} w-full sm:w-auto`} disabled={submitting || !csvPreview?.validRows} onClick={() => void postSource("csv", (csvPreview?.entries || []).map(entry => ({ ...entry, listaId: entry.listaReference ? undefined : (entry.listaId || csvDefaultListId || undefined) })))}>{submitting ? "Enviando..." : "Confirmar CSV"}</button>
            </div>}
          </>}
          {subjectMode && subjectPreview && <div className="space-y-4" aria-label="Prévia dos Assuntos">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Novas", subjectPreview.counts.new],
                ["Já existem", subjectPreview.counts.existingWithoutSubject + subjectPreview.counts.published],
                ["Já são Assunto", subjectPreview.counts.existingSubjectSame + subjectPreview.counts.existingSubjectDifferent],
                ["Inválidas", subjectPreview.counts.invalid],
              ].map(([label, value]) => <div key={String(label)} className="rounded border border-border bg-surface-subtle px-3 py-2"><p className="text-sm text-text-muted">{label}</p><p className="mt-1 text-base font-semibold text-text">{value}</p></div>)}
            </div>
            {subjectPreview.notices.map(notice => <p key={notice} className="text-sm leading-6 text-warning">{notice}</p>)}
            <div className="max-h-80 overflow-auto rounded border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-surface-subtle text-text-muted">
                  <tr>
                    <th scope="col" className="w-10 border-b border-border px-3 py-2 font-semibold"><span className="sr-only">Aplicar</span></th>
                    <th scope="col" className="border-b border-border px-3 py-2 font-semibold">Frase</th>
                    <th scope="col" className="border-b border-border px-3 py-2 font-semibold">Classificação</th>
                    <th scope="col" className="border-b border-border px-3 py-2 font-semibold">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectPreview.rows.map(row => <tr key={row.index} className={`border-b border-border last:border-b-0 ${subjectSelected.has(row.index) ? "bg-surface-subtle" : ""}`}>
                    <td className="px-3 py-2.5 align-top"><input type="checkbox" className="h-4 w-4" checked={subjectRowSelectable(row) && subjectSelected.has(row.index)} disabled={submitting || !subjectRowSelectable(row)} onChange={event => toggleSubjectRow(row.index, event.target.checked)} aria-label={`Aplicar ${row.keyword || "linha vazia"}`}/></td>
                    <td className="px-3 py-2.5 align-top font-medium text-text">{row.keyword || "(vazia)"}</td>
                    <td className={`px-3 py-2.5 align-top ${SUBJECT_CLASSIFICATION_TONE[row.classification]}`}>{SUBJECT_CLASSIFICATION_LABELS[row.classification]}</td>
                    <td className="px-3 py-2.5 align-top leading-6 text-text-muted">{subjectRowDetail(row).map((line, index) => <span key={index} className="block">{line}</span>)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <p className="text-sm leading-6 text-text-muted">Frases que já existem só são declaradas se você marcar. Declarar uma aprovada a leva para Em revisão. Nenhuma frase já declarada é regravada por aqui.</p>
            <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" className={`${neutralButton} w-full sm:w-auto`} disabled={submitting} onClick={resetSubject}>Voltar</button>
              <button type="button" className={`${primaryButton} w-full sm:w-auto`} disabled={submitting || !subjectPreview.rows.some(row => subjectRowSelectable(row) && subjectSelected.has(row.index))} onClick={() => void applySubjects()}>{submitting ? "Aplicando..." : `Aplicar ${subjectPreview.rows.filter(row => subjectRowSelectable(row) && subjectSelected.has(row.index)).length} Assunto(s)`}</button>
            </div>
          </div>}
          {error && <p className="rounded border border-danger/45 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger" role="alert">{error}</p>}
        </div>
      </section>
    </div>}
  </>;
});
