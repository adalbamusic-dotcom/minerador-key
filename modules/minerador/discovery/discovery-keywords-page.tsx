"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import { useNoticeCenter } from "@/components/global-notice-center";
import { applyDiscoveryFilters, type DiscoveryFilterSummary } from "@/lib/minerador/discovery-persistence";
import type { DiscoveryCandidate } from "@/lib/minerador/discovery-keywords";
import { DiscoveryFilterRow } from "./discovery-filter-row";
import { DiscoverySearchRow } from "./discovery-search-row";
import { DiscoverySourceControls, type DiscoverySourceControlsHandle, type DiscoverySourceResponse } from "./discovery-source-controls";
import { DiscoverySourceTopbarActions } from "./discovery-source-topbar-actions";
import { DiscoveryTablePlaceholder } from "./discovery-table-placeholder";
import { MineradorSectionTabs } from "../minerador-section-tabs";
import { DISCOVERY_FUNNELS, DISCOVERY_INTENTS, type DiscoveryCpcFilter, type DiscoveryFunnel, type DiscoveryIntent, type DiscoveryRelation, type DiscoverySearchDraft, type DiscoveryVolumeRange } from "./discovery-types";

type DiscoveryNotice = string | null;
type ExecutedTargeting = { countryCode: "BR"; countryLabel: string; selectedStates: string[]; stateLabels: string[]; language: string; keywordPlanNetwork: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS"; includeAdultKeywords: boolean };
type ExecutedDiscoverySearch = { source: "google_ads" | "manual" | "csv"; operationRequestId: string; executedAt: string; config: DiscoverySearchDraft; targeting: ExecutedTargeting | null; rawCandidates: DiscoveryCandidate[]; acceptedCandidates: DiscoveryCandidate[]; summary: DiscoveryFilterSummary };

const initialDraft: DiscoverySearchDraft = {
  seed: "",
  relationshipMode: "Todas as palavras-chave",
  preliminaryIntent: DISCOVERY_INTENTS[0],
  preliminaryFunnel: DISCOVERY_FUNNELS[0],
  language: "Português",
  countryCode: "BR",
  selectedStates: ["Todos os estados"],
  volumeFilter: "Todos",
  cpcFilter: "Todos",
  includeTerms: "",
  excludeTerms: "",
  includeAdultKeywords: false,
};

function brandIdFromRef(brandRef: string) { return brandRef.split("--").at(-1) || ""; }

function discoverySourceLabel(source: ExecutedDiscoverySearch["source"]) {
  return source === "google_ads" ? "Google Ads" : source === "csv" ? "CSV" : "Manual";
}

function discoveryTargetingLabel(targeting: ExecutedTargeting | null) {
  if (!targeting) return "ausente";
  if (!targeting.stateLabels.length) return targeting.countryLabel;
  return targeting.stateLabels.length > 3 ? `${targeting.stateLabels.length} estados selecionados` : targeting.stateLabels.join(", ");
}

function discoverySummaryText(rawCount: number, acceptedCount: number, summary: DiscoveryFilterSummary) {
  return `${rawCount} encontradas · ${acceptedCount} aprovadas${Object.entries(summary).filter(([, count]) => count > 0).map(([key, count]) => ` · ${count} ${key === "volume" ? "fora do volume" : key === "cpc" ? "fora do CPC" : key === "include" ? "fora dos termos incluídos" : key === "exclude" ? "excluídas por termos" : "fora da relação selecionada"}`).join("")}`;
}

function discoveryProviderDiagnostic(diagnostic: Record<string, unknown> | undefined) {
  if (!diagnostic) return undefined;
  const details = [
    typeof diagnostic.detail === "string" ? diagnostic.detail : "",
    typeof diagnostic.providerErrorMessage === "string" ? `Erro: ${diagnostic.providerErrorMessage}` : "",
    typeof diagnostic.providerErrorCode === "string" ? `Código: ${diagnostic.providerErrorCode}` : "",
    typeof diagnostic.failedField === "string" ? `Campo: ${diagnostic.failedField}` : "",
    typeof diagnostic.httpStatus === "number" ? `HTTP: ${diagnostic.httpStatus}` : "",
    typeof diagnostic.providerRequestId === "string" ? `Request-id: ${diagnostic.providerRequestId}` : "",
  ].filter(Boolean);
  return details.length ? details.join(" · ") : undefined;
}

export function DiscoveryKeywordsPage({ brandRef }: { brandRef: string }) {
  const { registerControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  const { publishNotice } = useNoticeCenter();
  const sourceControlsRef = useRef<DiscoverySourceControlsHandle>(null);
  const [seed, setSeed] = useState(initialDraft.seed);
  const [preliminaryIntent, setPreliminaryIntent] = useState<DiscoveryIntent>(initialDraft.preliminaryIntent);
  const [preliminaryFunnel, setPreliminaryFunnel] = useState<DiscoveryFunnel>(initialDraft.preliminaryFunnel);
  const [states, setStates] = useState<string[]>(initialDraft.selectedStates);
  const [relation, setRelation] = useState<DiscoveryRelation>(initialDraft.relationshipMode);
  const [language, setLanguage] = useState(initialDraft.language);
  const [includeAdultKeywords, setIncludeAdultKeywords] = useState(initialDraft.includeAdultKeywords);
  const [volume, setVolume] = useState<DiscoveryVolumeRange>(initialDraft.volumeFilter);
  const [cpc, setCpc] = useState<DiscoveryCpcFilter>(initialDraft.cpcFilter);
  const [includeTerms, setIncludeTerms] = useState(initialDraft.includeTerms);
  const [excludeTerms, setExcludeTerms] = useState(initialDraft.excludeTerms);
  const [activeFilterPopover, setActiveFilterPopover] = useState<"volume" | "cpc" | "include" | "exclude" | null>(null);
  const [notice, setNotice] = useState<DiscoveryNotice>(null);
  const [executedSearch, setExecutedSearch] = useState<ExecutedDiscoverySearch | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const searchDraft = useMemo<DiscoverySearchDraft>(() => ({ seed, relationshipMode: relation, preliminaryIntent, preliminaryFunnel, language, countryCode: "BR", selectedStates: states, volumeFilter: volume, cpcFilter: cpc, includeTerms, excludeTerms, includeAdultKeywords }), [seed, relation, preliminaryIntent, preliminaryFunnel, language, states, volume, cpc, includeTerms, excludeTerms, includeAdultKeywords]);
  const sourceActions = useMemo(() => <DiscoverySourceTopbarActions onManual={() => sourceControlsRef.current?.openManual()} onCsv={() => sourceControlsRef.current?.openCsv()} />, []);

  useEffect(() => {
    const globalTopbarControls: GlobalTopbarModuleControls = {
      moduleId: "minerador",
      actions: sourceActions,
      tabs: <MineradorSectionTabs brandRef={brandRef} />,
    };
    registerControls(globalTopbarControls);
    return () => unregisterControls(globalTopbarControls.moduleId);
  }, [brandRef, registerControls, sourceActions, unregisterControls]);

  useEffect(() => {
    let active = true;
    const restoreLatestSearch = async () => {
      try {
        const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandIdFromRef(brandRef))}/google-ads/descobrir-keywords`, { cache: "no-store" });
        const payload = await response.json() as { success?: boolean; restored?: boolean; source?: "google_ads" | "manual" | "csv"; operationRequestId?: string; executedAt?: string; draft?: DiscoverySearchDraft; candidates?: DiscoveryCandidate[]; targeting?: ExecutedTargeting | null };
        if (!active || !response.ok || !payload.success || !payload.restored || !payload.draft || !Array.isArray(payload.candidates) || payload.targeting === undefined) return;
        const draft = payload.draft;
        setSeed(draft.seed); setRelation(draft.relationshipMode); setPreliminaryIntent(draft.preliminaryIntent); setPreliminaryFunnel(draft.preliminaryFunnel); setLanguage(draft.language); setStates(draft.selectedStates); setVolume(draft.volumeFilter); setCpc(draft.cpcFilter); setIncludeTerms(draft.includeTerms); setExcludeTerms(draft.excludeTerms); setIncludeAdultKeywords(draft.includeAdultKeywords);
        const applied = applyDiscoveryFilters(payload.candidates, draft);
        setExecutedSearch({ source: payload.source || "google_ads", operationRequestId: payload.operationRequestId || crypto.randomUUID(), executedAt: payload.executedAt || new Date().toISOString(), config: draft, targeting: payload.targeting, rawCandidates: payload.candidates, acceptedCandidates: applied.acceptedCandidates, summary: applied.summary });
      } catch {
        // A migration or a previous failed run must not block opening the page.
      }
    };
    void restoreLatestSearch();
    return () => { active = false; };
  }, [brandRef]);

  const discover = async () => {
    setActiveFilterPopover(null);
    if (loading || loadingRef.current) return;
    const normalizedSeed = searchDraft.seed.trim();
    if (normalizedSeed.length < 2) { setNotice(normalizedSeed ? "Informe pelo menos 2 caracteres para iniciar a busca." : null); return; }
    loadingRef.current = true;
    setLoading(true); setNotice(null);
    publishNotice({ severity: "PENDING", title: "Descoberta de keywords", message: "Consultando ideias e métricas oficiais no Google Ads…", source: "workflow" });
    const operationRequestId = crypto.randomUUID();
    const requestDraft = { ...searchDraft, seed: normalizedSeed };
    try {
      const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandIdFromRef(brandRef))}/google-ads/descobrir-keywords`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationRequestId, seed: normalizedSeed, draft: requestDraft, targeting: { language: requestDraft.language === "Português" ? "languageConstants/1014" : requestDraft.language === "Inglês" ? "languageConstants/1000" : "languageConstants/1003", countryCode: requestDraft.countryCode, selectedStates: requestDraft.selectedStates, keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: requestDraft.includeAdultKeywords } }) });
      const payload = await response.json() as { success?: boolean; candidates?: DiscoveryCandidate[]; message?: string; targeting?: ExecutedTargeting; diagnostic?: Record<string, unknown> };
      if (!response.ok || !payload.success || !Array.isArray(payload.candidates) || !payload.targeting) {
        const failure = new Error(payload.message || "Não foi possível concluir a nova pesquisa no Google Ads.") as Error & { diagnostic?: typeof payload.diagnostic };
        failure.diagnostic = payload.diagnostic;
        throw failure;
      }
      const applied = applyDiscoveryFilters(payload.candidates, requestDraft);
      const executedAt = new Date().toISOString();
      setExecutedSearch({ source: "google_ads", operationRequestId, executedAt, config: requestDraft, targeting: payload.targeting, rawCandidates: payload.candidates, acceptedCandidates: applied.acceptedCandidates, summary: applied.summary });
      publishNotice({ severity: "SUCCESS", title: "Descoberta concluída", message: `${applied.acceptedCandidates.length} keywords aprovadas na Descoberta.`, metadata: { summary: discoverySummaryText(payload.candidates.length, applied.acceptedCandidates.length, applied.summary), source: "Google Ads", executedAt, targeting: discoveryTargetingLabel(payload.targeting), providerMetrics: "confirmadas por Google Ads" }, source: "persistence", confirmed: true });
    } catch (error) {
      const failure = error as Error & { diagnostic?: Record<string, unknown> };
      publishNotice({ severity: "ERROR", title: "Descoberta de keywords", message: executedSearch ? "A nova pesquisa não foi concluída. A tabela continua exibindo a última pesquisa válida." : (error instanceof Error ? error.message : "Não foi possível concluir a pesquisa no Google Ads."), details: discoveryProviderDiagnostic(failure.diagnostic), source: "persistence", copyPayload: failure.diagnostic });
    } finally { loadingRef.current = false; setLoading(false); }
  };

  const acceptSourceResult = (payload: DiscoverySourceResponse) => {
    const config = { ...initialDraft, seed: "", preliminaryIntent, preliminaryFunnel };
    setSeed(""); setRelation(config.relationshipMode); setPreliminaryIntent(config.preliminaryIntent); setPreliminaryFunnel(config.preliminaryFunnel); setLanguage(config.language); setStates(config.selectedStates); setVolume(config.volumeFilter); setCpc(config.cpcFilter); setIncludeTerms(config.includeTerms); setExcludeTerms(config.excludeTerms); setIncludeAdultKeywords(config.includeAdultKeywords);
    setExecutedSearch({ source: payload.source, operationRequestId: payload.operationRequestId, executedAt: payload.executedAt, config, targeting: null, rawCandidates: payload.candidates, acceptedCandidates: payload.candidates, summary: { relation: 0, volume: 0, cpc: 0, include: 0, exclude: 0 } });
    const count = payload.summary.approved;
    const noun = count === 1 ? "keyword" : "keywords";
    const verb = count === 1 ? (payload.source === "csv" ? "importada" : "adicionada") : (payload.source === "csv" ? "importadas" : "adicionadas");
    publishNotice({ severity: "SUCCESS", title: "Descoberta concluída", message: `${count} ${noun} ${verb} ${payload.source === "csv" ? "para" : "à"} Descoberta.`, metadata: { summary: `${payload.candidates.length} encontradas · ${count} aprovadas`, source: discoverySourceLabel(payload.source), executedAt: payload.executedAt, targeting: "ausente", providerMetrics: "não confirmadas por provider" }, source: "persistence", confirmed: true });
  };

  const clearFilters = () => { setSeed(initialDraft.seed); setRelation(initialDraft.relationshipMode); setPreliminaryIntent(initialDraft.preliminaryIntent); setPreliminaryFunnel(initialDraft.preliminaryFunnel); setLanguage(initialDraft.language); setStates(initialDraft.selectedStates); setVolume(initialDraft.volumeFilter); setCpc(initialDraft.cpcFilter); setIncludeTerms(initialDraft.includeTerms); setExcludeTerms(initialDraft.excludeTerms); setIncludeAdultKeywords(initialDraft.includeAdultKeywords); setNotice(null); };

  return <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip px-0 py-5" aria-label="Descobrir Keywords" aria-busy={loading}>
    <DiscoverySourceControls ref={sourceControlsRef} brandRef={brandRef} preliminaryIntent={preliminaryIntent} preliminaryFunnel={preliminaryFunnel} onComplete={acceptSourceResult} />
    <DiscoverySearchRow seed={seed} setSeed={setSeed} relation={relation} setRelation={setRelation} intent={preliminaryIntent} setIntent={setPreliminaryIntent} funnel={preliminaryFunnel} setFunnel={setPreliminaryFunnel} language={language} setLanguage={setLanguage} states={states} setStates={setStates} onSubmit={discover} />
    <DiscoveryFilterRow volume={volume} setVolume={setVolume} cpc={cpc} setCpc={setCpc} includeTerms={includeTerms} setIncludeTerms={setIncludeTerms} excludeTerms={excludeTerms} setExcludeTerms={setExcludeTerms} includeAdultKeywords={includeAdultKeywords} setIncludeAdultKeywords={setIncludeAdultKeywords} activeFilterPopover={activeFilterPopover} setActiveFilterPopover={setActiveFilterPopover} onDiscover={discover} onClear={clearFilters} loading={loading} canSubmit={seed.trim().length >= 2} />
    {notice && <p className="mt-3 rounded border border-danger/45 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger" role="alert">{notice}</p>}
    <DiscoveryTablePlaceholder candidates={executedSearch?.acceptedCandidates || []} seed={executedSearch?.config.seed || ""} intent={executedSearch?.config.preliminaryIntent} funnel={executedSearch?.config.preliminaryFunnel} brandRef={brandRef} />
  </main>;
}
