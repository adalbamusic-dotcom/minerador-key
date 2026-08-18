"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Papa from "papaparse";
import { X } from "lucide-react";
import type { DiscoveryCandidate } from "@/lib/minerador/discovery-keywords";
import { normalizeDiscoverySourceEntries, parseDiscoveryCsvRows, parseManualKeywords, type DiscoverySourceEntryInput } from "@/lib/minerador/discovery-sources";

type SourceKind = "manual" | "csv";
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
const control = "mt-1 h-10 w-full rounded border border-border bg-surface-subtle px-3 text-sm text-text outline-none focus:border-focus focus-visible:ring-2 focus-visible:ring-focus";

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

function previewFields(fields: string[]) {
  return fields.length ? fields.join(", ") : "nenhum";
}

export const DiscoverySourceControls = forwardRef<DiscoverySourceControlsHandle, {
  brandRef: string;
  preliminaryIntent: string;
  preliminaryFunnel: string;
  onComplete: (response: DiscoverySourceResponse) => void;
}>(function DiscoverySourceControls({ brandRef, preliminaryIntent, preliminaryFunnel, onComplete }, ref) {
  const [open, setOpen] = useState<SourceKind | null>(null);
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

  const close = () => { if (!submitting) { setOpen(null); setError(""); } };
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setOpen(null);
        setError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  const openSource = useCallback((source: SourceKind) => {
    setOpen(source);
    setError("");
    setListsError("");
    if (!lists.length && !listsFetchStarted.current) setListsLoading(true);
    if (source === "csv") setTimeout(() => fileRef.current?.focus(), 0);
  }, [lists.length]);
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
    setFileName(file.name); setCsvPreview(null); setError("");
    Papa.parse<unknown[]>(file, { header: false, skipEmptyLines: true, complete: result => { const parsed = parseDiscoveryCsvRows(result.data); const normalized = normalizeDiscoverySourceEntries({ source: "csv", entries: parsed.entries }); const importedMetricRows = parsed.entries.filter(entry => Object.values(entry.importedMetrics || {}).some(value => value !== null && value !== undefined && String(value).trim() !== "")).length; setCsvPreview({ entries: parsed.entries, rows: parsed.rowCount, validRows: normalized.accepted.length, duplicateRows: normalized.duplicateCount, rejectedRows: normalized.rejectedCount, importedMetricRows, fields: parsed.recognizedFields, ignoredFields: parsed.ignoredFields }); }, error: reason => setError(reason.message || "Não foi possível ler o CSV.") });
  };

  const unresolvedListReferences = csvPreview
    ? csvPreview.entries.filter(entry => { const reference = typeof entry.listaReference === "string" ? entry.listaReference.trim() : ""; if (!reference) return false; return !lists.some(list => list.id === reference || normalizeListLabel(list.name) === normalizeListLabel(reference)); }).length
    : 0;

  return <>
    {open && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/75 px-4 py-8" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="discovery-source-title" className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-surface-elevated text-text shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">Descobrir Keywords</p>
            <h2 id="discovery-source-title" className="mt-1 text-lg font-semibold text-text">{open === "manual" ? "Colar keywords" : "Importar CSV"}</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">A origem será revisada na Descoberta. Nenhuma keyword oficial é criada nesta etapa.</p>
          </div>
          <button type="button" className="shrink-0 rounded border border-border p-1.5 text-text-muted transition-colors hover:bg-surface-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" onClick={close} aria-label="Fechar"><X className="h-4 w-4"/></button>
        </header>

        <div className="space-y-5 p-5">
          {open === "manual" ? <>
            <label className="block text-sm font-medium text-text">
              Palavras-chave
              <textarea value={manualText} onChange={event => setManualText(event.target.value)} className="mt-1 min-h-40 w-full resize-y rounded border border-border bg-surface-subtle p-3 text-sm leading-6 text-text outline-none placeholder:text-text-muted focus:border-focus focus-visible:ring-2 focus-visible:ring-focus" placeholder="Uma keyword por linha" autoFocus/>
              <span className="mt-1 block text-sm text-text-muted">Cole uma por linha; linhas vazias serão ignoradas.</span>
            </label>

            <label className="block text-sm font-medium text-text">Lista opcional
              <select value={manualListId} onChange={event => setManualListId(event.target.value)} className={control} disabled={listsLoading}>
                <option value="">Sem lista</option>
                {lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
              </select>
            </label>
            {!listsLoading && !lists.length && <p className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm leading-6 text-text-muted">Nenhuma lista disponível. As keywords serão adicionadas sem lista.</p>}
            {listsError && <p className="text-sm leading-6 text-warning">{listsError} Você ainda pode importar sem lista.</p>}
            <p className="text-sm leading-6 text-text-muted">Silo não é necessário para a Descoberta. A lista é opcional e referências não encontradas não invalidam a keyword.</p>

            <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" className={`${neutralButton} w-full sm:w-auto`} onClick={close}>Cancelar</button>
              <button type="button" className={`${primaryButton} w-full sm:w-auto`} disabled={submitting} onClick={() => void postSource("manual", parseManualKeywords(manualText).map(entry => ({ ...entry, listaId: manualListId || undefined })))}>{submitting ? "Enviando..." : "Adicionar à Descoberta"}</button>
            </div>
          </> : <>
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="discovery-csv-file">Arquivo CSV</label>
              <input id="discovery-csv-file" ref={fileRef} type="file" accept=".csv,text/csv" className="mt-1 block w-full rounded border border-border bg-surface-subtle p-2 text-sm text-text file:mr-3 file:rounded file:border-0 file:bg-surface-elevated file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text hover:file:bg-surface" onChange={event => { const file = event.target.files?.[0]; if (file) parseFile(file); }}/>
              <p className="mt-1 text-sm leading-6 text-text-muted">A coluna Keyword é obrigatória; uma lista de uma coluna também pode vir sem cabeçalho. Volume e Resultados são aproveitados quando presentes.</p>
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
                <p className="text-text"><span className="font-semibold">Linhas com métricas:</span> {csvPreview.importedMetricRows}</p>
                <p className="text-warning"><span className="font-semibold">Campos adicionais ignorados:</span> {csvPreview.ignoredFields.length}</p>
                <p className="text-warning"><span className="font-semibold">Referências de lista não resolvidas:</span> {listsLoading ? "validando…" : unresolvedListReferences}</p>
              </div>

              {csvPreview.ignoredFields.length > 0 && <details className="rounded border border-border bg-surface-elevated px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-text">Ver campos ignorados ({csvPreview.ignoredFields.length})</summary>
                <p className="mt-2 leading-6 text-text-muted">{csvPreview.ignoredFields.slice(0, 32).join(", ")}{csvPreview.ignoredFields.length > 32 ? ` e mais ${csvPreview.ignoredFields.length - 32}.` : ""}</p>
              </details>}

              <details className="rounded border border-border bg-surface-elevated px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-text">Ver amostra de keywords ({csvPreview.entries.length})</summary>
                <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-y-auto pl-5 leading-6 text-text-muted">{csvPreview.entries.slice(0, 8).map((entry, index) => <li key={`${String(entry.keyword)}-${index}`}>{String(entry.keyword || "(vazia)")}</li>)}</ul>
              </details>
            </div>}

            <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
              <button type="button" className={`${neutralButton} w-full sm:w-auto`} onClick={close}>Cancelar</button>
              <button type="button" className={`${primaryButton} w-full sm:w-auto`} disabled={submitting || !csvPreview?.validRows} onClick={() => void postSource("csv", (csvPreview?.entries || []).map(entry => ({ ...entry, listaId: entry.listaReference ? undefined : (entry.listaId || csvDefaultListId || undefined) })))}>{submitting ? "Enviando..." : "Confirmar CSV"}</button>
            </div>
          </>}
          {error && <p className="rounded border border-danger/45 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger" role="alert">{error}</p>}
        </div>
      </section>
    </div>}
  </>;
});
