"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReinforcementPageResult } from "@/lib/arquiteto/published-reinforcement-search";
import type { SerpSubjectCardView } from "./serp-subject-model";
import {
  buildReinforcementRequest,
  reinforcementDefaultPicks,
  reinforcementDefaultSearchPicks,
  reinforcementSuggestionOwners,
  reinforcementApplyRequest,
  reinforcementErrorMessage,
  reinforcementOutcomeLines,
  reinforcementPreviewRequest,
  searchRunRequest,
  type ReinforcementApplyData,
  type ReinforcementPreviewData,
  type ReinforcementRequestPage,
  type ReinforcementSearchPlanData,
  type ReinforcementSearchRunData,
} from "./published-reinforcement-model";

/**
 * REFORÇAR PUBLICADOS — AS CHAMADAS DA TELA (SDD 2026-09-28).
 *
 * As rotas do núcleo resolvem marca e ator no servidor; daqui só vai o
 * `brandId` da marca ativa.
 *
 *   prévia    grátis, a cada abertura da confirmação e a cada publicado
 *             tirado ou posto de volta nela (o hash cobre o conjunto);
 *   gravar    humano, com o hash da prévia e um `operationRequestId` novo;
 *             estado mudou (409) → a prévia nova aparece e nada foi gravado;
 *             sucesso só com a releitura do servidor;
 *   buscar    a prévia da busca em lote é grátis; a rodada paga só sai da
 *             confirmação única, com o hash e o custo confirmados; "Tentar
 *             de novo" só reusa o id quando a resposta não chegou (o servidor
 *             devolve o resultado gravado, sem pagar de novo). Resultado já
 *             pago é RELIDO, nunca refeito em silêncio.
 *
 * As marcações (sugestões, keywords da busca, troca aceita) são estado de
 * apresentação: nada aqui é fonte de autorização nem de persistência.
 */

type Json = Record<string, unknown>;
type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null; message: string; responded: boolean; body: Json | null };

async function postJson<T>(url: string, body: Json): Promise<CallResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, code: null, message: reinforcementErrorMessage(0, null), responded: false, body: null };
  }
  const parsed = await response.json().catch(() => null) as Json | null;
  if (!response.ok || !parsed || parsed.success !== true) {
    return { ok: false, status: response.status, code: typeof parsed?.code === "string" ? parsed.code : null, message: reinforcementErrorMessage(response.status, parsed), responded: true, body: parsed };
  }
  return { ok: true, data: (parsed.data ?? parsed) as T };
}

export type ReinforcementNotify = (tone: "success" | "info" | "warning" | "error", message: string) => void;

export type ReinforcementDialogState = {
  open: boolean;
  status: "idle" | "loading" | "ready" | "applying" | "failed";
  /** O pedido inteiro (todos os publicados que entraram na confirmação). */
  requested: ReinforcementRequestPage[];
  /** Publicados que o dono tirou nesta confirmação. */
  excluded: string[];
  data: ReinforcementPreviewData | null;
  error: string | null;
  /** Keyword marcada em mais de um publicado: onde ela entrou e de onde saiu (a confirmação segue). */
  notices: string[];
  left: string[];
};

export type ReinforcementSearchState = {
  status: "idle" | "planning" | "confirming" | "running" | "done" | "failed";
  plan: ReinforcementSearchPlanData | null;
  run: ReinforcementSearchRunData | null;
  error: string | null;
  message: string | null;
  retryOperationId: string | null;
};

const dialogoFechado = (): ReinforcementDialogState => ({ open: false, status: "idle", requested: [], excluded: [], data: null, error: null, notices: [], left: [] });
const buscaVazia = (): ReinforcementSearchState => ({ status: "idle", plan: null, run: null, error: null, message: null, retryOperationId: null });

export function usePublishedReinforcement(input: {
  brandId: string | null;
  enabled: boolean;
  /** Os publicados "Sem par no lote", como a mesa os mostra: a busca gravada é relida para eles (grátis). */
  noPairPageIds: readonly string[];
  /**
   * Os cartões da mesa (publicados e Assuntos): decidem de qual publicado é
   * cada keyword sugerida (um artigo só, o de mais páginas em comum) e, com
   * isso, a pré-marcação da tabela.
   */
  cards?: readonly SerpSubjectCardView[];
  onWritten?: () => void;
  onNotify?: ReinforcementNotify;
}) {
  const { brandId, enabled, noPairPageIds, cards, onWritten, onNotify } = input;
  const [suggestionPicks, setSuggestionPicks] = useState<Record<string, string[]>>({});
  const [searchPicks, setSearchPicks] = useState<Record<string, string[]>>({});
  const [swapPicks, setSwapPicks] = useState<string[]>([]);
  const [dialog, setDialog] = useState<ReinforcementDialogState>(dialogoFechado);
  const [search, setSearch] = useState<ReinforcementSearchState>(buscaVazia);
  const [outcome, setOutcome] = useState<{ tone: ReinforcementApplyData["tone"]; message: string; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  /** Os publicados gravados e relidos na última confirmação: a tabela mostra o total novo deles. */
  const [writtenPageIds, setWrittenPageIds] = useState<ReadonlySet<string>>(() => new Set());
  /** Os publicados em que a última confirmação gravou a mesa e deixou o ArticleDNA para depois (com o motivo). */
  const [deferredPageIds, setDeferredPageIds] = useState<ReadonlyMap<string, string>>(() => new Map());
  const relido = useRef("");

  // Outra marca: nada da anterior fica na tela.
  useEffect(() => {
    const limpar = async () => {
      await Promise.resolve();
      setSuggestionPicks({});
      setSearchPicks({});
      setSwapPicks([]);
      setDialog(dialogoFechado());
      setSearch(buscaVazia());
      setOutcome(null);
      setWrittenPageIds(new Set());
      setDeferredPageIds(new Map());
    };
    void limpar();
  }, [brandId]);

  // A busca já paga destes publicados volta sem custo (só leitura da prévia gravada).
  const assinatura = enabled && brandId && noPairPageIds.length ? `${brandId}#${[...noPairPageIds].sort().join("|")}` : "";
  useEffect(() => {
    if (!assinatura || !brandId || relido.current === assinatura) return;
    relido.current = assinatura;
    const ids = assinatura.slice(assinatura.indexOf("#") + 1).split("|").filter(Boolean);
    let ativo = true;
    const reler = async () => {
      const result = await postJson<ReinforcementSearchPlanData>("/api/arquiteto/published-reinforcement/search/plan", { brandId, pageKeywordIds: ids.slice(0, 30), resume: true });
      if (!ativo || !result.ok || !result.data.run) return;
      const run = result.data.run;
      setSearch(current => current.status === "idle" ? { ...current, status: "done", plan: result.data, run, message: `Resultado da última busca, relido sem custo. ${run.message}` } : current);
    };
    void reler();
    return () => {
      ativo = false;
      if (relido.current === assinatura) relido.current = "";
    };
  }, [assinatura, brandId]);

  const results = useMemo(() => new Map<string, ReinforcementPageResult>((search.run?.pages || []).map(page => [page.keywordId, page])), [search.run]);
  const owners = useMemo(() => reinforcementSuggestionOwners(cards || [], results), [cards, results]);

  /* ------------------------------ marcações ------------------------------ */

  const suggestionPicksOf = useCallback((card: SerpSubjectCardView): ReadonlySet<string> => {
    const explicitas = suggestionPicks[card.key];
    return explicitas ? new Set(explicitas) : reinforcementDefaultPicks(card, owners);
  }, [suggestionPicks, owners]);

  const toggleSuggestion = useCallback((card: SerpSubjectCardView, keywordId: string) => {
    setSuggestionPicks(current => {
      const atuais = new Set(current[card.key] ?? [...reinforcementDefaultPicks(card, owners)]);
      if (atuais.has(keywordId)) atuais.delete(keywordId); else atuais.add(keywordId);
      return { ...current, [card.key]: [...atuais] };
    });
  }, [owners]);

  const searchPicksOf = useCallback((pageId: string): readonly string[] => searchPicks[pageId] ?? reinforcementDefaultSearchPicks(pageId, results.get(pageId), owners), [searchPicks, results, owners]);

  const toggleSearchPick = useCallback((pageId: string, keyword: string) => {
    setSearchPicks(current => {
      const atuais = new Set(current[pageId] ?? reinforcementDefaultSearchPicks(pageId, results.get(pageId), owners));
      if (atuais.has(keyword)) atuais.delete(keyword); else atuais.add(keyword);
      return { ...current, [pageId]: [...atuais] };
    });
  }, [results, owners]);

  const swapAccepted = useCallback((pageId: string) => swapPicks.includes(pageId), [swapPicks]);
  const toggleSwap = useCallback((pageId: string) => {
    setSwapPicks(current => current.includes(pageId) ? current.filter(id => id !== pageId) : [...current, pageId]);
  }, []);

  /* ------------------------------ a confirmação ------------------------------ */

  const preview = useCallback(async (requested: ReinforcementRequestPage[], excluded: readonly string[]) => {
    if (!brandId) return;
    const pages = requested.filter(page => !excluded.includes(page.publishedKeywordId));
    if (!pages.length) {
      setDialog(current => ({ ...current, status: "ready", data: null, error: "Nenhum publicado marcado nesta confirmação." }));
      return;
    }
    setDialog(current => ({ ...current, status: "loading", error: null }));
    const result = await postJson<ReinforcementPreviewData>("/api/arquiteto/published-reinforcement", reinforcementPreviewRequest(brandId, pages));
    setDialog(current => result.ok
      ? { ...current, status: "ready", data: result.data, error: null }
      : { ...current, status: "failed", data: null, error: result.message });
  }, [brandId]);

  /**
   * Abre a confirmação com a prévia do servidor. `only` = o botão de um
   * cartão; `acceptSwapOf` = "Aplicar troca" num publicado sem ArticleDNA.
   */
  const openReinforcement = useCallback(async (cards: readonly SerpSubjectCardView[], options: { only?: ReadonlySet<string> | null; acceptSwapOf?: string | null; swaps?: ReadonlySet<string>; includeRecorded?: boolean } = {}) => {
    if (!brandId || busy) return;
    const trocas = new Set(options.swaps ?? swapPicks);
    if (options.acceptSwapOf) {
      trocas.add(options.acceptSwapOf);
      setSwapPicks(current => current.includes(options.acceptSwapOf!) ? current : [...current, options.acceptSwapOf!]);
    }
    const pedido = buildReinforcementRequest({ cards, suggestionPicks: suggestionPicksOf, searchPicks: searchPicksOf, swapPicks: trocas, only: options.only ?? null, includeRecorded: options.includeRecorded === true });
    setOutcome(null);
    if (!pedido.pages.length) {
      setDialog({ ...dialogoFechado(), open: true, status: "failed", notices: pedido.reassigned, error: "Nenhum publicado com algo a gravar: todos já têm o ArticleDNA com as keywords do cartão." });
      return;
    }
    // Keyword marcada em dois publicados já foi para o de mais páginas em comum: a prévia segue com todos.
    setDialog({ ...dialogoFechado(), open: true, status: "loading", requested: pedido.pages, left: pedido.left, notices: pedido.reassigned });
    await preview(pedido.pages, []);
  }, [brandId, busy, swapPicks, suggestionPicksOf, searchPicksOf, preview]);

  /** Tirar ou pôr de volta um publicado: a prévia é refeita (grátis), o hash acompanha. */
  const toggleDialogPage = useCallback(async (pageId: string) => {
    const excluded = dialog.excluded.includes(pageId) ? dialog.excluded.filter(id => id !== pageId) : [...dialog.excluded, pageId];
    setDialog(current => ({ ...current, excluded }));
    await preview(dialog.requested, excluded);
  }, [dialog.excluded, dialog.requested, preview]);

  /** Aceitar ou não a troca de um publicado dentro da confirmação: o pedido e a prévia são refeitos. */
  const toggleDialogSwap = useCallback(async (cards: readonly SerpSubjectCardView[], pageId: string) => {
    const trocas = new Set(swapPicks);
    if (trocas.has(pageId)) trocas.delete(pageId); else trocas.add(pageId);
    setSwapPicks([...trocas]);
    const only = new Set(dialog.requested.map(page => page.publishedKeywordId).filter(id => !dialog.excluded.includes(id)));
    // Os publicados que já estão na confirmação ficam nela, mesmo sem nada marcado (o servidor diz se falta algo).
    await openReinforcement(cards, { only, swaps: trocas, includeRecorded: true });
  }, [swapPicks, dialog.requested, dialog.excluded, openReinforcement]);

  const closeReinforcement = useCallback(() => {
    if (dialog.status === "applying") return;
    setDialog(dialogoFechado());
  }, [dialog.status]);

  /** Só pela confirmação: o hash da prévia vista e, com keyword nova, o aceite do dono. */
  const applyReinforcement = useCallback(async (approveNewKeywords: boolean) => {
    const data = dialog.data;
    if (!brandId || !data || busy) return;
    const pages = dialog.requested.filter(page => !dialog.excluded.includes(page.publishedKeywordId));
    setBusy(true);
    setDialog(current => ({ ...current, status: "applying", error: null }));
    try {
      const result = await postJson<ReinforcementApplyData>("/api/arquiteto/published-reinforcement", reinforcementApplyRequest({
        brandId,
        pages,
        decisionHash: data.decisionHash,
        operationRequestId: crypto.randomUUID(),
        approveNewKeywords,
      }));
      if (!result.ok) {
        const nova = result.code === "PREVIEW_CHANGED" && result.body?.preview && typeof result.body.preview === "object" ? result.body.preview as ReinforcementPreviewData : null;
        setDialog(current => ({ ...current, status: nova ? "ready" : "failed", data: nova ?? current.data, error: result.message }));
        return;
      }
      const desfecho = { tone: result.data.tone, message: result.data.message, lines: reinforcementOutcomeLines(result.data) };
      setOutcome(desfecho);
      setDialog(dialogoFechado());
      onNotify?.(desfecho.tone, desfecho.message);
      setWrittenPageIds(new Set(result.data.pages.filter(page => page.written).map(page => page.publishedKeywordId)));
      setDeferredPageIds(new Map(result.data.pages.filter(page => !page.written && page.dnaDeferred).map(page => [page.publishedKeywordId, page.dnaDeferred!] as const)));
      /*
       * Qualquer coisa gravada — ArticleDNA, ou só a mesa (Minerador, composição,
       * Silo, papéis da troca), inclusive quando o ArticleDNA ficou para depois —
       * relê a mesa e limpa as marcações dessas páginas (corretor 2026-09-28).
       */
      const gravadas = result.data.pages.filter(page => page.written || Boolean(page.partial?.length) || Boolean(page.dnaDeferred));
      if (result.data.written || gravadas.length) {
        setSuggestionPicks({});
        setSwapPicks([]);
        setSearchPicks(current => Object.fromEntries(Object.entries(current).filter(([pageId]) => !gravadas.some(page => page.publishedKeywordId === pageId))));
        onWritten?.();
      }
    } finally {
      setBusy(false);
    }
  }, [brandId, busy, dialog.data, dialog.requested, dialog.excluded, onNotify, onWritten]);

  /* ------------------------------ a busca em lote ------------------------------ */

  const planSearch = useCallback(async (pageIds: readonly string[], mode: "plan" | "replace" = "plan") => {
    if (!brandId || busy || !pageIds.length) return;
    setBusy(true);
    setSearch(current => ({ ...current, status: "planning", error: null, message: null, retryOperationId: null }));
    try {
      const corpo = { brandId, pageKeywordIds: [...pageIds].slice(0, 30), ...(mode === "replace" ? { replaceResult: true } : {}) };
      let result = await postJson<ReinforcementSearchPlanData>("/api/arquiteto/published-reinforcement/search/plan", corpo);
      // Rodada paga já gravada para estes publicados: relê (grátis) em vez de refazer.
      if (!result.ok && result.code === "REINFORCEMENT_RESULT_PENDING") {
        const aviso = result.message;
        result = await postJson<ReinforcementSearchPlanData>("/api/arquiteto/published-reinforcement/search/plan", { brandId, pageKeywordIds: [...pageIds].slice(0, 30), resume: true });
        if (result.ok) {
          const lido = result.data;
          setSearch({ status: lido.run ? "done" : "failed", plan: lido, run: lido.run, error: lido.run ? null : aviso, message: lido.run ? `${aviso} ${lido.run.message}` : null, retryOperationId: null });
          return;
        }
      }
      if (!result.ok) {
        setSearch(current => ({ ...current, status: "failed", error: result.message }));
        return;
      }
      const dados = result.data;
      if (!dados.plan) {
        setSearch(current => ({ ...current, status: "failed", plan: dados, error: dados.message || "Nenhum publicado para buscar." }));
        return;
      }
      setSearch(current => ({ ...current, status: "confirming", plan: dados, error: null, message: null }));
    } finally {
      setBusy(false);
    }
  }, [brandId, busy]);

  const cancelSearch = useCallback(() => {
    setSearch(current => ({ ...current, status: current.run ? "done" : "idle" }));
  }, []);

  const runOnce = useCallback(async (operationRequestId: string) => {
    const dados = search.plan;
    if (!brandId || !dados?.plan || !dados.searchId) return;
    setSearch(current => ({ ...current, status: "running", error: null }));
    const result = await postJson<ReinforcementSearchRunData>("/api/arquiteto/published-reinforcement/search/run", searchRunRequest({ brandId, searchId: dados.searchId, plan: dados.plan, operationRequestId }));
    if (!result.ok) {
      // Sem resposta, ou a MESMA rodada ainda rodando: o mesmo id devolve o gravado, sem pagar de novo.
      setSearch(current => ({ ...current, status: "failed", error: result.message, retryOperationId: !result.responded || result.code === "OPERATION_IN_PROGRESS" ? operationRequestId : null }));
      return;
    }
    const run = result.data;
    setSearchPicks({});
    setSearch(current => ({ ...current, status: "done", run, error: null, retryOperationId: null, message: [run.message, run.persistWarning, run.ledgerWarning].filter(Boolean).join(" ") }));
    // Erro do Google Ads numa página é aviso, nunca "nada achado" em tom neutro.
    onNotify?.(run.pages.some(page => page.state === "ads_error") ? "warning" : "info", run.message);
  }, [brandId, search.plan, onNotify]);

  /** Só depois da confirmação única do custo: um id novo por rodada. */
  const runSearchConfirmed = useCallback(async () => {
    if (busy || search.status !== "confirming") return;
    setBusy(true);
    try {
      await runOnce(crypto.randomUUID());
    } finally {
      setBusy(false);
    }
  }, [busy, search.status, runOnce]);

  const retrySearch = useCallback(async () => {
    const id = search.retryOperationId;
    if (!id || busy) return;
    setBusy(true);
    try {
      await runOnce(id);
    } finally {
      setBusy(false);
    }
  }, [search.retryOperationId, busy, runOnce]);

  return {
    busy,
    dialog,
    search,
    results,
    owners,
    outcome,
    writtenPageIds,
    deferredPageIds,
    suggestionPicksOf,
    toggleSuggestion,
    searchPicksOf,
    toggleSearchPick,
    swapAccepted,
    toggleSwap,
    openReinforcement,
    toggleDialogPage,
    toggleDialogSwap,
    closeReinforcement,
    applyReinforcement,
    planSearch,
    cancelSearch,
    runSearchConfirmed,
    retrySearch,
    dismissOutcome: () => setOutcome(null),
  };
}

export type PublishedReinforcementController = ReturnType<typeof usePublishedReinforcement>;
