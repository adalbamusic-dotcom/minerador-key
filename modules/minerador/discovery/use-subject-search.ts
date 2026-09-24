"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNoticeCenter } from "@/components/global-notice-center";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { createAuthenticatedBrowserClient } from "@/lib/supabase/browser-authenticated-client";
import type {
  SubjectDiscoveryCandidate,
  SubjectDiscoveryErrorResponse,
  SubjectDiscoveryExecuteResponse,
  SubjectDiscoveryPlanResponse,
  SubjectDiscoverySubject,
} from "@/lib/minerador/subject-discovery-search";
import type { SubjectDiscoveryPlan } from "@/lib/minerador/subject-discovery-plan";
import type { SubjectDiscoveryImportCounts, SubjectDiscoveryImportRow, SubjectDiscoverySubjectCheck } from "@/lib/minerador/subject-discovery-import";
import {
  SUBJECT_SEARCH_DEFAULT_FILTERS,
  buildSubjectDiscoveryImportItems,
  buildSubjectSearchRequest,
  declaredSubjectOptions,
  defaultDeclarePhraseAsSubject,
  filterSubjectCandidates,
  subjectIdFromApply,
  subjectPhraseDeclarationPlan,
  type DeclaredSubjectOption,
  type SubjectPhrasePreviewRow,
  type SubjectSearchFilters,
  type SubjectSearchImportMark,
} from "./subject-search-model";
import {
  createIndexedDbSubjectSearchStorage,
  discardSubjectSearch,
  loadSubjectSearches,
  saveSubjectSearch,
  type SubjectSearchLocalConfig,
  type SubjectSearchLocalRecord,
} from "./subject-search-local-store";

/**
 * PESQUISA POR ASSUNTO — estado e ações da tela (SDD 2026-09-24, F1b.1,
 * F1b.4, F1b.5, F1b.6 e F1b.7).
 *
 * Ordem das coisas, sempre:
 *   1. Enter ou Pesquisar monta o PLANO (grátis) e abre o diálogo de custo;
 *   2. só "Confirmar e pesquisar" executa, com o `planHash` e o custo máximo
 *      do plano confirmado e um `operationRequestId` novo por plano;
 *   3. o resultado fica na lista local (IndexedDB próprio), nunca no banco;
 *   4. o envio ao Processador, se o humano marcar, declara a frase pela rota
 *      da F1.3 (prévia e apply) e só depois importa pela rota da F1b.
 *
 * A marca vem da rota (`brandRef`); o ator, da sessão. Nada aqui fabrica
 * candidata: todas vêm da resposta do servidor.
 */

type PlanConfig = SubjectSearchLocalConfig;

export type SubjectSearchPlanState = {
  plan: SubjectDiscoveryPlan;
  /** Ausente quando o servidor só devolveu o plano junto com uma recusa. */
  subject: SubjectDiscoverySubject | null;
  config: PlanConfig;
  /** Um id novo por plano: as chaves do ledger nascem dele. */
  operationRequestId: string;
  /** Motivo do plano ter sido reapresentado (plano mudou, teto, etc.). */
  message: string | null;
  /** Plano acima do teto: não pode ser confirmado. */
  blocked: boolean;
};

export type SubjectSearchImportResult = {
  counts: SubjectDiscoveryImportCounts;
  subject: SubjectDiscoverySubjectCheck;
  notAffected: SubjectDiscoveryImportRow[];
  declaredSubjectKeywordId: string | null;
};

export type SubjectSearchImportDialogState = {
  searchId: string;
  importRequestId: string;
  declareRequestId: string;
  offered: boolean;
  declare: boolean;
  preview: { loading: boolean; row: SubjectPhrasePreviewRow | null; error: string | null; notices: string[] };
  /** Id do Assunto já declarado neste envio (numa tentativa anterior). */
  declaredId: string | null;
  submitting: boolean;
  error: string | null;
  result: SubjectSearchImportResult | null;
};

type SubjectImportRouteResponse = { success?: boolean; message?: string; rows?: Array<SubjectPhrasePreviewRow & { index?: number }>; notices?: string[]; diagnostic?: unknown };
type SubjectDiscoveryImportRouteResponse = { success?: boolean; message?: string; code?: string; subject?: SubjectDiscoverySubjectCheck; rows?: SubjectDiscoveryImportRow[]; notAffected?: SubjectDiscoveryImportRow[]; counts?: SubjectDiscoveryImportCounts };

function brandIdFromRef(brandRef: string) { return brandRef.split("--").at(-1)?.trim() || ""; }

function isErrorResponse(value: unknown): value is SubjectDiscoveryErrorResponse {
  return Boolean(value) && typeof value === "object" && (value as { success?: unknown }).success === false;
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export function useSubjectSearch({ brandRef, active, language, selectedStates, includeAdultKeywords, linkedSubjectKeywordId }: {
  brandRef: string;
  /** Só com o modo "Por Assunto" aberto a tela lê Assuntos e a lista local. */
  active: boolean;
  language: string;
  selectedStates: string[];
  includeAdultKeywords: boolean;
  /** Vindo de "Buscar sustentação": só o UUID; a frase é lida da marca. */
  linkedSubjectKeywordId: string | null;
}) {
  const brandId = brandIdFromRef(brandRef);
  const { publishNotice } = useNoticeCenter();
  const { actorUserId } = useSupabaseSession();
  const storage = useMemo(() => createIndexedDbSubjectSearchStorage(), []);

  const [phrase, setPhrase] = useState("");
  const [note, setNote] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [subjectKeywordId, setSubjectKeywordId] = useState<string | null>(null);
  const [declaredSubjects, setDeclaredSubjects] = useState<DeclaredSubjectOption[]>([]);
  const [declaredState, setDeclaredState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [planState, setPlanState] = useState<SubjectSearchPlanState | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [records, setRecords] = useState<SubjectSearchLocalRecord[]>([]);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<SubjectSearchFilters>(SUBJECT_SEARCH_DEFAULT_FILTERS);
  const [importDialog, setImportDialog] = useState<SubjectSearchImportDialogState | null>(null);
  const busyRef = useRef(false);
  const linkAppliedRef = useRef<string | null>(null);

  /* ------------------------------ leituras ------------------------------ */

  // Uma leitura por marca. Sem guarda de "alive": no modo estrito o efeito roda
  // duas vezes, e a segunda não pode descartar a leitura da primeira.
  const declaredLoadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !brandId || declaredLoadRef.current === brandId) return;
    declaredLoadRef.current = brandId;
    const load = async () => {
      await Promise.resolve();
      setDeclaredState("loading");
      try {
        // Colunas estreitas: id, keyword e só a chave da declaração.
        const { data, error } = await createAuthenticatedBrowserClient()
          .from("minerador_keywords")
          .select("id,keyword,keyword_subject:analise_semantica->keyword_subject")
          .eq("brand_id", brandId)
          .is("deleted_at", null)
          .not("analise_semantica->>keyword_subject", "is", null)
          .order("keyword", { ascending: true })
          .range(0, 999);
        if (error) throw error;
        setDeclaredSubjects(declaredSubjectOptions((data || []) as Array<{ id?: unknown; keyword?: unknown; keyword_subject?: unknown }>));
        setDeclaredState("ready");
      } catch {
        setDeclaredState("failed");
      }
    };
    void load();
  }, [active, brandId]);

  const localLoadKey = active && actorUserId && brandId ? `${actorUserId}:${brandId}` : null;
  const loadedLocalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!localLoadKey || loadedLocalRef.current === localLoadKey) return;
    loadedLocalRef.current = localLoadKey;
    const load = async () => {
      const loaded = await loadSubjectSearches({ storage, actorUserId, brandId });
      setStorageAvailable(loaded.available);
      if (!loaded.available) return;
      setRecords(current => {
        // Buscas feitas nesta página antes da leitura continuam na lista.
        const known = new Set(loaded.records.map(record => record.searchId));
        return [...current.filter(record => !known.has(record.searchId)), ...loaded.records];
      });
      setActiveSearchId(current => current ?? loaded.records[0]?.searchId ?? null);
    };
    void load();
  }, [localLoadKey, storage, actorUserId, brandId]);

  const chooseDeclaredSubject = useCallback((id: string | null) => {
    setFieldError(null);
    if (!id) {
      setSubjectKeywordId(null);
      setPhrase(""); setNote(""); setDestinationUrl("");
      return;
    }
    const option = declaredSubjects.find(item => item.id === id);
    if (!option) return;
    setSubjectKeywordId(option.id);
    setPhrase(option.keyword);
    setNote(option.note || "");
    setDestinationUrl(option.destinationUrl || "");
  }, [declaredSubjects]);

  // "Buscar sustentação": o id do link escolhe o Assunto quando a lista chega.
  // Fora da lista (a leitura falhou, ou o id passou das 1000 linhas lidas),
  // lê só esse id, na marca da rota, com as mesmas colunas estreitas.
  useEffect(() => {
    if (!linkedSubjectKeywordId || (declaredState !== "ready" && declaredState !== "failed") || linkAppliedRef.current === linkedSubjectKeywordId) return;
    linkAppliedRef.current = linkedSubjectKeywordId;
    const apply = async () => {
      await Promise.resolve();
      if (declaredSubjects.some(item => item.id === linkedSubjectKeywordId)) { chooseDeclaredSubject(linkedSubjectKeywordId); return; }
      try {
        const { data, error } = await createAuthenticatedBrowserClient()
          .from("minerador_keywords")
          .select("id,keyword,keyword_subject:analise_semantica->keyword_subject")
          .eq("brand_id", brandId)
          .eq("id", linkedSubjectKeywordId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw error;
        const [option] = declaredSubjectOptions(data ? [data as unknown as { id?: unknown; keyword?: unknown; keyword_subject?: unknown }] : []);
        if (!option) { setFieldError("O Assunto do link não está declarado nesta marca. Escreva o Assunto ou escolha um declarado."); return; }
        setDeclaredSubjects(current => current.some(item => item.id === option.id) ? current : [...current, option].sort((a, b) => a.keyword.localeCompare(b.keyword, "pt-BR")));
        setFieldError(null);
        setSubjectKeywordId(option.id);
        setPhrase(option.keyword);
        setNote(option.note || "");
        setDestinationUrl(option.destinationUrl || "");
      } catch {
        setFieldError("O Assunto do link não pôde ser lido agora. Escreva o Assunto ou recarregue a página para tentar de novo.");
      }
    };
    void apply();
  }, [linkedSubjectKeywordId, declaredState, declaredSubjects, chooseDeclaredSubject, brandId]);

  /* ------------------------------- plano ------------------------------- */

  const currentConfig = useCallback((): PlanConfig => ({
    phrase: phrase.replace(/\s+/g, " ").trim(),
    note: note.trim(),
    destinationUrl: destinationUrl.trim(),
    subjectKeywordId,
    language,
    selectedStates: selectedStates.length ? [...selectedStates] : ["Todos os estados"],
    includeAdultKeywords,
  }), [phrase, note, destinationUrl, subjectKeywordId, language, selectedStates, includeAdultKeywords]);

  const requestPlan = useCallback(async () => {
    if (busyRef.current) return;
    const config = currentConfig();
    if (!config.subjectKeywordId && !config.phrase) { setFieldError("Escreva o Assunto ou escolha um Assunto declarado."); return; }
    if (config.phrase.length > 200) { setFieldError("O Assunto precisa ter de 1 a 200 caracteres."); return; }
    busyRef.current = true;
    setPlanning(true); setFieldError(null); setPlanError(null);
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/subject-discovery/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildSubjectSearchRequest({ mode: "plan", ...config })),
      });
      const payload = await readJson(response);
      if (response.ok && payload && (payload as SubjectDiscoveryPlanResponse).success === true) {
        const body = payload as SubjectDiscoveryPlanResponse;
        setPlanState({ plan: body.plan, subject: body.subject, config, operationRequestId: crypto.randomUUID(), message: null, blocked: false });
        return;
      }
      if (isErrorResponse(payload) && payload.plan) {
        // Teto: o diálogo mostra o plano, sem confirmar. Nada foi pago.
        setPlanState({ plan: payload.plan, subject: null, config, operationRequestId: crypto.randomUUID(), message: payload.message, blocked: payload.code === "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP" });
        return;
      }
      setFieldError(isErrorResponse(payload) ? payload.message : "Não foi possível montar o plano da pesquisa. Nada foi pago.");
    } catch {
      setFieldError("Não foi possível montar o plano da pesquisa. Nada foi pago.");
    } finally {
      busyRef.current = false;
      setPlanning(false);
    }
  }, [brandId, currentConfig]);

  const cancelPlan = useCallback(() => { if (!executing) { setPlanState(null); setPlanError(null); } }, [executing]);

  const persistRecord = useCallback(async (record: SubjectSearchLocalRecord) => {
    const saved = await saveSubjectSearch({ storage, record });
    setStorageAvailable(saved.persisted);
    // Com armazenamento, a lista é a que a política deixou; sem ele, a memória segue.
    if (saved.records) setRecords(saved.records);
  }, [storage]);

  const confirmPlan = useCallback(async () => {
    if (!planState || planState.blocked || busyRef.current) return;
    const { plan, config, operationRequestId } = planState;
    busyRef.current = true;
    setExecuting(true); setPlanError(null);
    publishNotice({ severity: "PENDING", title: "Pesquisa por Assunto", message: "Consultando o Google Ads e o DataForSEO Labs pelo plano confirmado…", source: "workflow", module: "minerador", area: "Descoberta de keywords" });
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/subject-discovery/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildSubjectSearchRequest({ mode: "execute", ...config, operationRequestId, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd } })),
      });
      const payload = await readJson(response);
      if (response.ok && payload && (payload as SubjectDiscoveryExecuteResponse).success === true) {
        const result = payload as SubjectDiscoveryExecuteResponse;
        const now = new Date().toISOString();
        const record: SubjectSearchLocalRecord = {
          format: 1,
          actorUserId: actorUserId || "",
          brandId,
          searchId: result.operationRequestId,
          savedAt: result.executedAt || now,
          updatedAt: now,
          config,
          result,
          marks: {},
          declaredSubjectKeywordId: null,
        };
        setRecords(current => [record, ...current.filter(item => item.searchId !== record.searchId)]);
        setActiveSearchId(record.searchId);
        setFilters(SUBJECT_SEARCH_DEFAULT_FILTERS);
        setPlanState(null);
        if (actorUserId) await persistRecord(record);
        else setStorageAvailable(false);
        publishNotice({
          severity: result.ledgerWarning ? "WARNING" : "SUCCESS",
          title: "Pesquisa por Assunto",
          message: `${result.returnedCandidates} candidata(s) para "${result.subject.phrase}". A lista fica só neste navegador até o envio ao Processador.`,
          details: result.ledgerWarning || undefined,
          source: "workflow",
          module: "minerador",
          area: "Descoberta de keywords",
        });
        return;
      }
      if (isErrorResponse(payload)) {
        if ((payload.code === "PAID_PLAN_CHANGED" || payload.code === "PAID_PLAN_REQUIRED" || payload.code === "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP") && payload.plan) {
          // O plano mudou: confira o novo. Um id novo acompanha o plano novo.
          const nextPlan = payload.plan;
          setPlanState(current => current ? { ...current, plan: nextPlan, operationRequestId: crypto.randomUUID(), message: payload.message, blocked: payload.code === "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP" } : current);
          return;
        }
        if (payload.code === "OPERATION_ALREADY_EXECUTED") {
          setPlanState(null);
          setFieldError(payload.message);
          return;
        }
        setPlanError(payload.message);
        publishNotice({ severity: "ERROR", title: "Pesquisa por Assunto", message: payload.message, source: "workflow", module: "minerador", area: "Descoberta de keywords", copyPayload: payload.diagnostic });
        return;
      }
      setPlanError("A pesquisa não pôde ser concluída. Confira o controle de gastos antes de repetir.");
    } catch {
      setPlanError("A pesquisa não respondeu. Confira o controle de gastos antes de repetir; um plano novo gera outra operação.");
    } finally {
      busyRef.current = false;
      setExecuting(false);
    }
  }, [planState, brandId, actorUserId, persistRecord, publishNotice]);

  /* ---------------------------- lista local ---------------------------- */

  const activeRecord = useMemo(() => records.find(record => record.searchId === activeSearchId) ?? records[0] ?? null, [records, activeSearchId]);

  const chooseSearch = useCallback((searchId: string) => { setActiveSearchId(searchId); setFilters(SUBJECT_SEARCH_DEFAULT_FILTERS); }, []);

  const discardSearch = useCallback(async (searchId: string) => {
    // Ato humano, uma busca. Sem armazenamento, sai só da memória.
    await discardSubjectSearch({ storage, actorUserId, brandId, searchId });
    setRecords(current => current.filter(record => record.searchId !== searchId));
    setActiveSearchId(current => current === searchId ? null : current);
  }, [storage, actorUserId, brandId]);

  const visibleCandidates = useMemo(() => {
    if (!activeRecord) return [] as SubjectDiscoveryCandidate[];
    const imported = new Set(Object.keys(activeRecord.marks));
    return filterSubjectCandidates(activeRecord.result.candidates, filters, imported, candidate => candidate.normalizedKeyword);
  }, [activeRecord, filters]);

  /* ------------------------ envio ao Processador ------------------------ */

  const postSubjects = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/subjects/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await readJson(response) as SubjectImportRouteResponse | null;
    if (!response.ok || !payload || payload.success !== true) throw new Error(payload?.message || "A declaração do Assunto não pôde ser concluída.");
    return payload;
  }, [brandId]);

  const subjectEntry = useCallback((record: SubjectSearchLocalRecord) => ({
    keyword: record.result.subject.phrase,
    note: record.result.subject.note,
    // Só a página ACEITA no site da marca acompanha a declaração.
    destinationUrl: record.result.subject.destination.url,
    listaReference: null,
  }), []);

  const loadDeclarePreview = useCallback(async (record: SubjectSearchLocalRecord) => {
    setImportDialog(current => current ? { ...current, preview: { loading: true, row: null, error: null, notices: [] } } : current);
    try {
      // Prévia da F1.3: não escreve nada.
      const payload = await postSubjects({ mode: "preview", source: "manual", entries: [subjectEntry(record)] });
      const row = payload.rows?.[0] ?? null;
      setImportDialog(current => current ? { ...current, preview: { loading: false, row, error: null, notices: payload.notices || [] } } : current);
    } catch (error) {
      setImportDialog(current => current ? { ...current, preview: { loading: false, row: null, error: error instanceof Error ? error.message : "A prévia da declaração falhou.", notices: [] } } : current);
    }
  }, [postSubjects, subjectEntry]);

  const openImport = useCallback((selectedCount: number) => {
    if (!activeRecord || !selectedCount) return;
    const subject = activeRecord.result.subject;
    const already = activeRecord.declaredSubjectKeywordId;
    const choice = already ? { offered: false, checked: false } : defaultDeclarePhraseAsSubject({ subjectKeywordId: subject.subjectKeywordId, phraseExistingKeywordId: subject.phraseExistingKeywordId });
    setImportDialog({
      searchId: activeRecord.searchId,
      importRequestId: crypto.randomUUID(),
      declareRequestId: crypto.randomUUID(),
      offered: choice.offered,
      declare: choice.checked,
      preview: { loading: false, row: null, error: null, notices: [] },
      declaredId: already,
      submitting: false,
      error: null,
      result: null,
    });
    if (choice.checked) void loadDeclarePreview(activeRecord);
  }, [activeRecord, loadDeclarePreview]);

  const setDeclare = useCallback((checked: boolean) => {
    setImportDialog(current => current ? { ...current, declare: checked, error: null } : current);
    if (checked && activeRecord && importDialog && !importDialog.preview.row && !importDialog.preview.loading) void loadDeclarePreview(activeRecord);
  }, [activeRecord, importDialog, loadDeclarePreview]);

  const closeImport = useCallback(() => { setImportDialog(current => current?.submitting ? current : null); }, []);

  const confirmImport = useCallback(async (selectedKeys: ReadonlySet<string>) => {
    const dialog = importDialog;
    const record = activeRecord;
    if (!dialog || !record || dialog.submitting || record.searchId !== dialog.searchId) return;
    const { items } = buildSubjectDiscoveryImportItems(record.result.candidates, selectedKeys, record.result.subject.normalizedPhrase);
    if (!items.length) { setImportDialog({ ...dialog, error: "Nenhuma keyword de sustentação selecionada: a frase do Assunto não entra como item." }); return; }
    setImportDialog({ ...dialog, submitting: true, error: null });
    let subjectId: string | null = record.result.subject.subjectKeywordId || dialog.declaredId || record.declaredSubjectKeywordId || null;
    try {
      if (dialog.offered && dialog.declare && !dialog.declaredId) {
        const decision = subjectPhraseDeclarationPlan(dialog.preview.row);
        if (decision.action === "refuse") throw new Error(`${decision.reason} Nada foi importado.`);
        if (decision.action === "already_subject") {
          subjectId = decision.keywordId;
        } else {
          const applied = await postSubjects({
            mode: "apply",
            importRequestId: dialog.declareRequestId,
            source: "manual",
            entries: [subjectEntry(record)],
            declareExistingIds: decision.action === "declare_existing" ? [decision.keywordId] : [],
          });
          subjectId = subjectIdFromApply(applied.rows?.[0]);
          if (!subjectId) throw new Error(`A frase não foi declarada como Assunto${applied.rows?.[0]?.reason ? `: ${applied.rows[0].reason}` : "."} Nada foi importado.`);
        }
        const declared = subjectId;
        setImportDialog(current => current ? { ...current, declaredId: declared } : current);
      }
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/subject-discovery/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importRequestId: dialog.importRequestId, searchId: record.searchId, subjectKeywordId: subjectId, subjectPhrase: record.result.subject.phrase, items }),
      });
      const payload = await readJson(response) as SubjectDiscoveryImportRouteResponse | null;
      if (!response.ok || !payload || payload.success !== true || !payload.counts || !payload.subject) throw new Error(payload?.message || "O envio ao Processador não pôde ser concluído.");
      const marks: Record<string, SubjectSearchImportMark> = { ...record.marks };
      for (const row of payload.rows || []) marks[row.normalizedKeyword] = { outcome: row.outcome, keywordId: row.keywordId, reason: row.reason };
      if (subjectId && subjectId !== record.result.subject.subjectKeywordId) marks[record.result.subject.normalizedPhrase] = { outcome: "declared_subject", keywordId: subjectId, reason: null };
      const updated: SubjectSearchLocalRecord = { ...record, marks, updatedAt: new Date().toISOString(), declaredSubjectKeywordId: subjectId && subjectId !== record.result.subject.subjectKeywordId ? subjectId : record.declaredSubjectKeywordId };
      setRecords(current => current.map(item => item.searchId === updated.searchId ? updated : item));
      if (actorUserId) await persistRecord(updated);
      const counts = payload.counts;
      setImportDialog(current => current ? { ...current, submitting: false, error: null, result: { counts, subject: payload.subject as SubjectDiscoverySubjectCheck, notAffected: payload.notAffected || [], declaredSubjectKeywordId: updated.declaredSubjectKeywordId } } : current);
      publishNotice({
        severity: counts.failed ? "WARNING" : "SUCCESS",
        title: "Envio ao Processador",
        message: `${counts.created} criada(s) · ${counts.recorded} já existia(m) e receberam a origem · ${counts.notAffected} sem a origem gravada · ${counts.failed} falha(s).`,
        source: "persistence",
        confirmed: !counts.failed,
        module: "minerador",
        area: "Descoberta de keywords",
      });
    } catch (error) {
      setImportDialog(current => current ? { ...current, submitting: false, error: error instanceof Error ? error.message : "O envio ao Processador não pôde ser concluído." } : current);
    }
  }, [importDialog, activeRecord, brandId, postSubjects, subjectEntry, actorUserId, persistRecord, publishNotice]);

  return {
    brandId,
    actorReady: Boolean(actorUserId),
    phrase, setPhrase,
    note, setNote,
    destinationUrl, setDestinationUrl,
    subjectKeywordId,
    declaredSubjects, declaredState,
    chooseDeclaredSubject,
    fieldError,
    planning, executing,
    planState, planError,
    requestPlan, cancelPlan, confirmPlan,
    records, activeRecord, chooseSearch, discardSearch,
    storageAvailable,
    filters, setFilters,
    visibleCandidates,
    importDialog, openImport, setDeclare, closeImport, confirmImport,
  };
}

export type SubjectSearchController = ReturnType<typeof useSubjectSearch>;
