"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { SubjectDiscoveryExecuteResponse, SubjectDiscoveryPlanResponse } from "@/lib/minerador/subject-discovery-search";
import {
  isSubjectSearchErrorResponse,
  postSubjectDiscoveryImport,
  postSubjectSearch,
  type SubjectDiscoveryImportRouteResponse,
} from "./subject-search-client";
import {
  subjectSearchBatchExecuteRequest,
  subjectSearchBatchImportPlan,
  subjectSearchBatchPlanRequest,
  subjectSearchBatchWithVolumeKeys,
  summarizeSubjectSearchBatchPlan,
  type SubjectSearchBatchLine,
  type SubjectSearchBatchPlanLine,
} from "./subject-search-batch-model";

/**
 * PESQUISA POR ASSUNTO EM LOTE — estado e ações (SDD
 * `sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 7).
 *
 * Ordem, sempre: (1) "Buscar sustentação" monta o plano de cada linha (grátis,
 * nada consultado); (2) UMA confirmação do plano somado executa as linhas, uma
 * por vez, cada uma com o plano dela e o mesmo `batchId` (falha de uma não para
 * as outras); (3) a tabela abre com "Só com volume" marcado e nada selecionado;
 * (4) UMA confirmação final envia ao Processador, linha a linha, pela rota de
 * sempre — o Volume vai pelo recibo do servidor e a Lógica roda no servidor.
 * A marca vem do card (rota); nada aqui fabrica candidata nem volume.
 */

export type SubjectSearchBatchPhase = "idle" | "planning" | "planned" | "executing" | "results" | "importing" | "imported";

export type SubjectSearchBatchLineResult = { result: SubjectDiscoveryExecuteResponse | null; error: string | null };
export type SubjectSearchBatchLineImport = { ok: boolean; payload: SubjectDiscoveryImportRouteResponse | null; error: string | null };

const PLAN_CONCURRENCY = 4;

async function mapLimited<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function useSubjectSearchBatch({ brandId, lines, onImported }: {
  brandId: string;
  lines: readonly SubjectSearchBatchLine[];
  /** Os ids que o envio criou ou registrou, para a planilha reler. */
  onImported?: (keywordIds: string[]) => void;
}) {
  const [phase, setPhase] = useState<SubjectSearchBatchPhase>("idle");
  const [plans, setPlans] = useState<SubjectSearchBatchPlanLine[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Record<string, SubjectSearchBatchLineResult>>({});
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});
  const [onlyWithVolume, setOnlyWithVolume] = useState(true);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [imports, setImports] = useState<Record<string, SubjectSearchBatchLineImport>>({});
  const [error, setError] = useState<string | null>(null);
  const batchIdRef = useRef<string | null>(null);
  const importRequestIdsRef = useRef<Record<string, string>>({});
  const busyRef = useRef(false);

  const summary = useMemo(() => summarizeSubjectSearchBatchPlan(plans), [plans]);

  const requestPlans = useCallback(async () => {
    if (busyRef.current || !lines.length) return;
    busyRef.current = true;
    setPhase("planning"); setError(null); setResults({}); setSelection({}); setImports({});
    try {
      const planned = await mapLimited(lines, PLAN_CONCURRENCY, async (line): Promise<SubjectSearchBatchPlanLine> => {
        try {
          const response = await postSubjectSearch(brandId, subjectSearchBatchPlanRequest(line));
          const payload = response.payload;
          if (response.ok && payload && (payload as SubjectDiscoveryPlanResponse).success === true) {
            const body = payload as SubjectDiscoveryPlanResponse;
            return { line, plan: body.plan, seed: body.subject.phrase, error: null };
          }
          return { line, plan: null, seed: null, error: isSubjectSearchErrorResponse(payload) ? payload.message : "O plano desta linha não pôde ser montado. Nada foi consultado." };
        } catch {
          return { line, plan: null, seed: null, error: "O plano desta linha não respondeu. Nada foi consultado." };
        }
      });
      setPlans(planned);
      setPhase("planned");
    } finally {
      busyRef.current = false;
    }
  }, [brandId, lines]);

  const cancelPlans = useCallback(() => {
    if (busyRef.current) return;
    setPlans([]); setPhase("idle");
  }, []);

  const confirmExecute = useCallback(async () => {
    if (busyRef.current) return;
    const ready = plans.filter(item => item.plan && !item.error);
    if (!ready.length) return;
    busyRef.current = true;
    const batchId = crypto.randomUUID();
    batchIdRef.current = batchId;
    setPhase("executing"); setError(null);
    setProgress({ done: 0, total: ready.length });
    const collected: Record<string, SubjectSearchBatchLineResult> = {};
    try {
      // Uma linha por vez: a cota do Google Ads é da marca, e a falha de uma não para as outras.
      for (const [index, item] of ready.entries()) {
        const key = item.line.subjectKeywordId;
        try {
          const response = await postSubjectSearch(brandId, subjectSearchBatchExecuteRequest(item.line, item.plan!, crypto.randomUUID(), batchId));
          const payload = response.payload;
          if (response.ok && payload && (payload as SubjectDiscoveryExecuteResponse).success === true) {
            collected[key] = { result: payload as SubjectDiscoveryExecuteResponse, error: null };
          } else if (isSubjectSearchErrorResponse(payload)) {
            collected[key] = { result: null, error: payload.code === "PAID_PLAN_CHANGED" ? "O Assunto desta linha mudou desde o plano: nada foi consultado. Gere o plano do lote de novo." : payload.message };
          } else {
            collected[key] = { result: null, error: "A pesquisa desta linha não pôde ser concluída." };
          }
        } catch {
          collected[key] = { result: null, error: "A pesquisa desta linha não respondeu. Confira o controle de gastos antes de repetir." };
        }
        setResults({ ...collected });
        setProgress({ done: index + 1, total: ready.length });
      }
      setPhase("results");
    } finally {
      busyRef.current = false;
    }
  }, [brandId, plans]);

  const toggle = useCallback((lineKey: string, normalizedKeyword: string) => {
    setSelection(current => {
      const next = new Set(current[lineKey] || []);
      if (next.has(normalizedKeyword)) next.delete(normalizedKeyword); else next.add(normalizedKeyword);
      return { ...current, [lineKey]: next };
    });
  }, []);

  /** "Marcar as com volume": de um artigo (`lineKey`) ou do lote inteiro (`null`). */
  const markWithVolume = useCallback((lineKey: string | null) => {
    setSelection(current => {
      const next = { ...current };
      for (const [key, entry] of Object.entries(results)) {
        if (!entry.result || (lineKey && key !== lineKey)) continue;
        next[key] = new Set([...(current[key] || []), ...subjectSearchBatchWithVolumeKeys(entry.result)]);
      }
      return next;
    });
  }, [results]);

  const clearSelection = useCallback((lineKey: string | null) => {
    setSelection(current => lineKey ? { ...current, [lineKey]: new Set() } : {});
  }, []);

  const importPlan = useMemo(() => subjectSearchBatchImportPlan(lines
    .map(line => ({ line, result: results[line.subjectKeywordId]?.result ?? null, selected: selection[line.subjectKeywordId] || new Set<string>() }))
    .filter((entry): entry is { line: SubjectSearchBatchLine; result: SubjectDiscoveryExecuteResponse; selected: Set<string> } => Boolean(entry.result))
    // Linha já enviada com sucesso não vai de novo.
    .filter(entry => !imports[entry.line.subjectKeywordId]?.ok)), [lines, results, selection, imports]);

  const openImportConfirm = useCallback(() => {
    if (!importPlan.lines.length || busyRef.current) return;
    for (const item of importPlan.lines) importRequestIdsRef.current[item.line.subjectKeywordId] ||= crypto.randomUUID();
    setConfirmingImport(true);
  }, [importPlan]);

  const closeImportConfirm = useCallback(() => { if (!busyRef.current) setConfirmingImport(false); }, []);

  const confirmImport = useCallback(async () => {
    if (busyRef.current || !importPlan.lines.length) return;
    busyRef.current = true;
    setPhase("importing"); setError(null);
    const collected: Record<string, SubjectSearchBatchLineImport> = { ...imports };
    const touched: string[] = [];
    try {
      for (const item of importPlan.lines) {
        const key = item.line.subjectKeywordId;
        try {
          const response = await postSubjectDiscoveryImport(brandId, {
            // O mesmo id numa nova tentativa da linha: o servidor não duplica.
            importRequestId: importRequestIdsRef.current[key] ||= crypto.randomUUID(),
            searchId: item.searchId,
            subjectKeywordId: item.line.subjectKeywordId,
            subjectPhrase: item.subjectPhrase,
            items: item.items,
          });
          collected[key] = response.ok
            ? { ok: true, payload: response.payload, error: null }
            : { ok: false, payload: response.payload, error: response.payload?.message || "O envio desta linha não pôde ser concluído." };
          for (const row of response.payload?.rows || []) {
            if (row.keywordId && (row.outcome === "created" || row.outcome === "recorded")) touched.push(row.keywordId);
          }
        } catch {
          collected[key] = { ok: false, payload: null, error: "O envio desta linha não respondeu. Tente de novo: o mesmo envio não duplica." };
        }
        setImports({ ...collected });
      }
      setConfirmingImport(false);
      setPhase("imported");
      if (touched.length) onImported?.([...new Set(touched)]);
    } finally {
      busyRef.current = false;
    }
  }, [brandId, importPlan, imports, onImported]);

  /** Depois do envio, volta à tabela para mandar outra linha (as enviadas não vão de novo). */
  const backToResults = useCallback(() => { if (!busyRef.current) setPhase("results"); }, []);

  return {
    phase,
    busy: phase === "planning" || phase === "executing" || phase === "importing",
    plans, summary, progress,
    results, selection, onlyWithVolume, setOnlyWithVolume,
    importPlan, confirmingImport, imports, error,
    requestPlans, cancelPlans, confirmExecute,
    toggle, markWithVolume, clearSelection,
    openImportConfirm, closeImportConfirm, confirmImport, backToResults,
  };
}

export type SubjectSearchBatchController = ReturnType<typeof useSubjectSearchBatch>;
