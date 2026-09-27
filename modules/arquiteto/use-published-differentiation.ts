"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultAcceptPageIds,
  differentiationErrorMessage,
  differentiationIngestRequest,
  differentiationRunRequest,
  runReadiness,
  sumDifferentiationCost,
  visibleDifferentiationGroups,
  type DifferentiationAcceptData,
  type DifferentiationApplyData,
  type DifferentiationDetectData,
  type DifferentiationPlanData,
  type DifferentiationRunData,
  type DifferentiationRunStatus,
} from "./published-differentiation-model";

/**
 * PUBLICADOS QUE DISPUTAM O MESMO ASSUNTO — AS CHAMADAS DA TELA.
 *
 * As três rotas do núcleo (`/api/arquiteto/cannibalization/plan|run|apply`)
 * resolvem marca e ator no servidor; aqui só vai o `brandId` da marca ativa.
 *
 *   detectar  grátis, uma vez por marca e por abertura da aba (ou "Reler");
 *   planejar  grátis, só por clique, para os grupos marcados. Grupo que já
 *             tem avaliação paga gravada é RELIDO (`resume`), nunca
 *             replanejado: só "Planejar nova rodada" pede outra prévia;
 *   buscar    pago, só depois da confirmação única da rodada: um
 *             `operationRequestId` novo por grupo e por rodada; a prévia
 *             vale UMA rodada; "Tentar de novo" só reusa o id quando a
 *             resposta não chegou (o servidor devolve o resultado gravado);
 *   aceitar   humano, com o hash da avaliação e as páginas marcadas (padrão:
 *             só as "Diferenciado"); sucesso só com a releitura;
 *   manter    registra a decisão até a SERP do grupo mudar.
 *
 * Estado de apresentação: nada aqui é fonte de autorização nem de persistência.
 */

type Json = Record<string, unknown>;

type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null; message: string; responded: boolean };

async function postJson<T>(url: string, body: Json): Promise<CallResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, code: null, message: differentiationErrorMessage(0, null), responded: false };
  }
  const parsed = await response.json().catch(() => null) as Json | null;
  if (!response.ok || !parsed || parsed.success !== true) return { ok: false, status: response.status, code: typeof parsed?.code === "string" ? parsed.code : null, message: differentiationErrorMessage(response.status, parsed), responded: true };
  return { ok: true, data: (parsed.data ?? parsed) as T };
}

export type DifferentiationGroupEntry = {
  plan: DifferentiationPlanData | null;
  planning: boolean;
  planError: string | null;
  runStatus: DifferentiationRunStatus;
  run: DifferentiationRunData | null;
  runError: string | null;
  /** Só para "Tentar de novo" da MESMA rodada quando a resposta não chegou. */
  retryOperationId: string | null;
  applying: boolean;
  applyError: string | null;
  /** As páginas marcadas para o aceite; `null` = o padrão (só as "Diferenciado"). */
  acceptPages: string[] | null;
  accepted: DifferentiationAcceptData | null;
  keptMessage: string | null;
  ingest: { status: "idle" | "sending" | "done" | "failed"; message: string | null };
  formation: Record<string, { status: "idle" | "sending" | "done" | "failed"; message: string | null }>;
};

const vazia = (): DifferentiationGroupEntry => ({
  plan: null, planning: false, planError: null,
  runStatus: "idle", run: null, runError: null, retryOperationId: null,
  applying: false, applyError: null, acceptPages: null, accepted: null, keptMessage: null,
  ingest: { status: "idle", message: null }, formation: {},
});

export type DifferentiationAddToArticle = (pageKeywordId: string, keywordIds: readonly string[]) => Promise<{ ok: boolean; message: string }>;

export function usePublishedDifferentiation(input: {
  brandId: string | null;
  enabled: boolean;
  onApplied?: () => void;
  onAddToArticle?: DifferentiationAddToArticle;
}) {
  const { brandId, enabled, onApplied, onAddToArticle } = input;
  const [reload, setReload] = useState(0);
  const [detection, setDetection] = useState<{ brandId: string | null; state: "idle" | "loading" | "ready" | "failed"; data: DifferentiationDetectData | null; error: string | null }>({ brandId: null, state: "idle", data: null, error: null });
  const [entries, setEntries] = useState<Record<string, DifferentiationGroupEntry>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const requested = useRef("");

  const key = enabled && brandId ? `${brandId}#${reload}` : "";
  useEffect(() => {
    if (!key || !brandId || requested.current === key) return;
    requested.current = key;
    let ativo = true;
    const ler = async () => {
      await Promise.resolve();
      if (!ativo) return;
      setDetection(current => ({ brandId, state: "loading", error: null, data: current.brandId === brandId ? current.data : null }));
      const result = await postJson<DifferentiationDetectData>("/api/arquiteto/cannibalization/plan", { brandId });
      if (!ativo) return;
      if (result.ok) setDetection({ brandId, state: "ready", data: result.data, error: null });
      else setDetection({ brandId, state: "failed", data: null, error: result.message });
    };
    void ler();
    return () => {
      ativo = false;
      if (requested.current === key) requested.current = "";
    };
  }, [key, brandId]);

  // Outra marca: nada da anterior fica na tela.
  useEffect(() => {
    const limpar = async () => {
      await Promise.resolve();
      setEntries({});
      setSelected([]);
    };
    void limpar();
  }, [brandId]);

  const data = detection.brandId === brandId ? detection.data : null;
  const groups = useMemo(() => visibleDifferentiationGroups(data), [data]);
  const patch = useCallback((groupId: string, change: (entry: DifferentiationGroupEntry) => Partial<DifferentiationGroupEntry>) => {
    setEntries(current => {
      const atual = current[groupId] || vazia();
      return { ...current, [groupId]: { ...atual, ...change(atual) } };
    });
  }, []);

  const toggle = useCallback((groupId: string) => {
    setSelected(current => current.includes(groupId) ? current.filter(id => id !== groupId) : [...current, groupId]);
  }, []);

  /** Grupo com avaliação gravada (ou rodada em andamento): reler, nunca replanejar em silêncio. */
  const temAvaliacao = useCallback((groupId: string) => {
    const entry = entries[groupId];
    if (entry?.run || (entry?.plan && entry.plan.proposal.state !== "planned")) return true;
    const proposta = groups.find(group => group.groupId === groupId)?.proposal;
    return Boolean(proposta && (proposta.hasRun || proposta.state === "running"));
  }, [groups, entries]);

  const planOne = useCallback(async (groupId: string, mode: "plan" | "resume" | "replace") => {
    if (!brandId) return;
    patch(groupId, () => ({ planning: true, planError: null, run: null, runStatus: "idle", runError: null, retryOperationId: null, accepted: null, applyError: null, acceptPages: null }));
    const corpo = mode === "resume" ? { brandId, groupId, resume: true } : { brandId, groupId, ai: useAi, ...(mode === "replace" ? { replaceEvaluation: true } : {}) };
    let result = await postJson<DifferentiationPlanData>("/api/arquiteto/cannibalization/plan", corpo);
    // Outra aba já rodou este grupo: relê o resultado gravado em vez de insistir.
    if (!result.ok && mode === "plan" && result.code === "DIFFERENTIATION_EVALUATION_PENDING") {
      result = await postJson<DifferentiationPlanData>("/api/arquiteto/cannibalization/plan", { brandId, groupId, resume: true });
    }
    patch(groupId, () => result.ok
      ? { planning: false, plan: result.data, run: result.data.run ?? null, runStatus: result.data.run ? "done" : "idle" }
      : { planning: false, plan: null, planError: result.message });
  }, [brandId, useAi, patch]);

  const planSelected = useCallback(async () => {
    if (!brandId || busy || !selected.length) return;
    setBusy(true);
    try {
      for (const groupId of selected) await planOne(groupId, temAvaliacao(groupId) ? "resume" : "plan");
    } finally {
      setBusy(false);
    }
  }, [brandId, busy, selected, planOne, temAvaliacao]);

  /** "Planejar nova rodada": pedido explícito; a avaliação anterior vai ao histórico da proposta. */
  const replan = useCallback(async (groupId: string) => {
    if (!brandId || busy) return;
    setBusy(true);
    try {
      await planOne(groupId, "replace");
    } finally {
      setBusy(false);
    }
  }, [brandId, busy, planOne]);

  const plans = useMemo(() => new Map(selected.map(id => [id, entries[id]?.plan?.plan ?? null] as const)), [selected, entries]);
  // A prévia vale UMA rodada: grupo já buscado (ou rodando) não entra em "Buscar e validar".
  const used = useMemo(() => new Set(selected.filter(id => {
    const entry = entries[id];
    return Boolean(entry?.run) || (entry?.plan ? entry.plan.proposal.state !== "planned" : false);
  })), [selected, entries]);
  const readiness = runReadiness({ selected, plans, busy, used });
  const selectedCost = useMemo(() => {
    const lista = selected.map(id => entries[id]?.plan?.plan).filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
    return lista.length ? sumDifferentiationCost(lista) : null;
  }, [selected, entries]);

  const runOne = useCallback(async (groupId: string, operationRequestId: string) => {
    const plan = entries[groupId]?.plan?.plan;
    if (!brandId || !plan) return;
    patch(groupId, () => ({ runStatus: "running", runError: null }));
    const result = await postJson<DifferentiationRunData>("/api/arquiteto/cannibalization/run", differentiationRunRequest({ brandId, plan, operationRequestId }));
    patch(groupId, () => result.ok
      ? { runStatus: "done", run: result.data, runError: null, retryOperationId: null, accepted: null, acceptPages: null }
      // Sem resposta, ou a MESMA rodada ainda rodando: o mesmo id devolve o resultado gravado, sem pagar de novo.
      : { runStatus: "failed", runError: result.message, retryOperationId: !result.responded || result.code === "OPERATION_IN_PROGRESS" ? operationRequestId : null });
  }, [brandId, entries, patch]);

  /** Só depois da confirmação única: um id novo por grupo nesta rodada. */
  const runConfirmed = useCallback(async () => {
    if (!readiness.ready) return;
    const fila = selected.map(groupId => ({ groupId, operationRequestId: crypto.randomUUID() }));
    setBusy(true);
    try {
      for (const item of fila) patch(item.groupId, () => ({ runStatus: "queued", runError: null, retryOperationId: null }));
      for (const item of fila) await runOne(item.groupId, item.operationRequestId);
    } finally {
      setBusy(false);
    }
  }, [readiness.ready, selected, patch, runOne]);

  const retryRun = useCallback(async (groupId: string) => {
    const id = entries[groupId]?.retryOperationId;
    if (!id || busy) return;
    setBusy(true);
    try {
      await runOne(groupId, id);
    } finally {
      setBusy(false);
    }
  }, [entries, busy, runOne]);

  /** Marca ou desmarca uma página para o aceite (padrão: só as "Diferenciado"). */
  const toggleAcceptPage = useCallback((groupId: string, pageKeywordId: string) => {
    patch(groupId, entry => {
      if (!entry.run) return {};
      const atuais = entry.acceptPages ?? defaultAcceptPageIds(entry.run);
      return { acceptPages: atuais.includes(pageKeywordId) ? atuais.filter(id => id !== pageKeywordId) : [...atuais, pageKeywordId] };
    });
  }, [patch]);

  const accept = useCallback(async (groupId: string) => {
    const entry = entries[groupId];
    const run = entry?.run;
    if (!brandId || !run || busy) return;
    const paginas = entry.acceptPages ?? defaultAcceptPageIds(run);
    if (!paginas.length) return;
    setBusy(true);
    patch(groupId, () => ({ applying: true, applyError: null }));
    try {
      const result = await postJson<DifferentiationApplyData>("/api/arquiteto/cannibalization/apply", { brandId, groupId, decision: "accept", evaluationHash: run.evaluationHash, pageKeywordIds: paginas });
      if (!result.ok) patch(groupId, () => ({ applying: false, applyError: result.message }));
      else if (result.data.decision !== "accept") patch(groupId, () => ({ applying: false, applyError: "Resposta inesperada do servidor." }));
      else {
        const aceito = result.data;
        patch(groupId, () => ({ applying: false, accepted: aceito }));
        if (aceito.pages.some(page => page.written)) onApplied?.();
      }
    } finally {
      setBusy(false);
    }
  }, [brandId, entries, busy, patch, onApplied]);

  const keep = useCallback(async (groupId: string) => {
    if (!brandId || busy) return;
    setBusy(true);
    patch(groupId, () => ({ applying: true, applyError: null }));
    try {
      const result = await postJson<DifferentiationApplyData>("/api/arquiteto/cannibalization/apply", { brandId, groupId, decision: "keep" });
      if (!result.ok) patch(groupId, () => ({ applying: false, applyError: result.message }));
      else if (result.data.decision !== "keep" || !result.data.readbackConfirmed) patch(groupId, () => ({ applying: false, applyError: "A decisão não foi confirmada na releitura." }));
      else {
        patch(groupId, () => ({ applying: false, keptMessage: "Mantido como está. O grupo volta se a SERP mudar." }));
        setSelected(current => current.filter(id => id !== groupId));
        setDetection(current => current.data ? { ...current, data: { ...current.data, groups: current.data.groups.map(group => group.groupId === groupId ? { ...group, kept: true } : group) } } : current);
      }
    } finally {
      setBusy(false);
    }
  }, [brandId, busy, patch]);

  /** Passo seguinte do aceite: as keywords novas vão ao Processador do Minerador. */
  const sendIngest = useCallback(async (groupId: string) => {
    const lotes = entries[groupId]?.accepted?.ingestBatches || [];
    if (!brandId || !lotes.length || busy) return;
    setBusy(true);
    patch(groupId, () => ({ ingest: { status: "sending", message: null } }));
    try {
      let criadas = 0;
      let existentes = 0;
      const falhas: string[] = [];
      for (const lote of lotes) {
        const result = await postJson<{ counts?: { created?: number; recorded?: number; alreadyRecorded?: number; failed?: number } }>(
          `/api/minerador/marcas/${encodeURIComponent(brandId)}/subject-discovery/import`,
          differentiationIngestRequest(lote, crypto.randomUUID()),
        );
        if (!result.ok) { falhas.push(result.message); continue; }
        criadas += result.data.counts?.created ?? 0;
        existentes += (result.data.counts?.recorded ?? 0) + (result.data.counts?.alreadyRecorded ?? 0);
        if (result.data.counts?.failed) falhas.push(`${result.data.counts.failed} não entraram`);
      }
      const resumo = `${criadas} nova(s) no Processador, ${existentes} já existia(m). Meça e aprove no Minerador; depois coloque no artigo e aceite de novo.`;
      patch(groupId, () => ({ ingest: falhas.length ? { status: "failed", message: `${resumo} Falhas: ${falhas.join("; ")}.` } : { status: "done", message: resumo } }));
    } finally {
      setBusy(false);
    }
  }, [brandId, entries, busy, patch]);

  /** Passo seguinte do aceite: keyword do Minerador que ainda não está no artigo, pela formação. */
  const addToArticle = useCallback(async (groupId: string, pageKeywordId: string, keywordIds: readonly string[]) => {
    if (!onAddToArticle || busy) return;
    setBusy(true);
    patch(groupId, entry => ({ formation: { ...entry.formation, [pageKeywordId]: { status: "sending", message: null } } }));
    try {
      const result = await onAddToArticle(pageKeywordId, keywordIds);
      patch(groupId, entry => ({ formation: { ...entry.formation, [pageKeywordId]: { status: result.ok ? "done" : "failed", message: result.message } } }));
    } catch (error) {
      patch(groupId, entry => ({ formation: { ...entry.formation, [pageKeywordId]: { status: "failed", message: error instanceof Error ? error.message : "A gravação falhou." } } }));
    } finally {
      setBusy(false);
    }
  }, [onAddToArticle, busy, patch]);

  return {
    detection: { state: detection.brandId === brandId ? detection.state : "idle", error: detection.brandId === brandId ? detection.error : null, data },
    groups,
    entries,
    selected,
    useAi,
    busy,
    readiness,
    selectedCost,
    canAddToArticle: Boolean(onAddToArticle),
    setUseAi,
    toggle,
    toggleAcceptPage,
    reread: () => setReload(current => current + 1),
    planSelected,
    replan,
    runConfirmed,
    retryRun,
    accept,
    keep,
    sendIngest,
    addToArticle,
  };
}

export type PublishedDifferentiationController = ReturnType<typeof usePublishedDifferentiation>;
