"use client";

import { useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { ChevronDown, Filter, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { AnchoredPopover } from "@/components/editorial/anchored-popover";
import { DISCOVERY_CPC_FILTERS, DISCOVERY_VOLUME_RANGES, type DiscoveryCpcFilter, type DiscoveryVolumeRange } from "./discovery-types";

type DiscoveryFilterPopover = "volume" | "cpc" | "include" | "exclude" | null;

const filterButton = "inline-flex h-9 items-center gap-2 rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground/80 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40 disabled:cursor-not-allowed disabled:opacity-45";
const popoverOption = "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground/80 hover:bg-surface-subtle";
const control = "mt-2 w-full rounded border border-divider bg-surface-subtle px-3 py-2 text-sm text-foreground outline-none focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40";

export function DiscoveryFilterRow({ volume, setVolume, cpc, setCpc, includeTerms, setIncludeTerms, excludeTerms, setExcludeTerms, includeAdultKeywords, setIncludeAdultKeywords, activeFilterPopover, setActiveFilterPopover, onDiscover, onClear, loading, canSubmit }: { volume: DiscoveryVolumeRange; setVolume: Dispatch<SetStateAction<DiscoveryVolumeRange>>; cpc: DiscoveryCpcFilter; setCpc: Dispatch<SetStateAction<DiscoveryCpcFilter>>; includeTerms: string; setIncludeTerms: Dispatch<SetStateAction<string>>; excludeTerms: string; setExcludeTerms: Dispatch<SetStateAction<string>>; includeAdultKeywords: boolean; setIncludeAdultKeywords: Dispatch<SetStateAction<boolean>>; activeFilterPopover: DiscoveryFilterPopover; setActiveFilterPopover: Dispatch<SetStateAction<DiscoveryFilterPopover>>; onDiscover: () => void | Promise<void>; onClear: () => void; loading: boolean; canSubmit: boolean; }) {
  const volumeTriggerRef = useRef<HTMLButtonElement>(null);
  const cpcTriggerRef = useRef<HTMLButtonElement>(null);
  const includeTriggerRef = useRef<HTMLButtonElement>(null);
  const excludeTriggerRef = useRef<HTMLButtonElement>(null);
  const closePopover = () => setActiveFilterPopover(null);
  const togglePopover = (popover: Exclude<DiscoveryFilterPopover, null>) => setActiveFilterPopover(current => current === popover ? null : popover);

  return <section className="flex flex-wrap gap-2 border-b border-divider py-4" aria-label="Filtros da próxima pesquisa">
      <DisabledFutureControl label="Resultados · em breve" tooltip="Dependerá de evidências orgânicas via Serper." />
      <button ref={volumeTriggerRef} type="button" onClick={() => togglePopover("volume")} aria-expanded={activeFilterPopover === "volume"} className={filterButton}>
        <Filter className="h-4 w-4 text-text-muted" aria-hidden="true" />Volume · {volume}<ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" />
      </button>
      <AnchoredPopover open={activeFilterPopover === "volume"} onClose={closePopover} triggerRef={volumeTriggerRef} ariaLabel="Faixa de volume">
        <p className="mb-2 text-sm font-medium text-foreground">Faixa de volume</p>
        <div className="grid gap-1 sm:grid-cols-2">{DISCOVERY_VOLUME_RANGES.map(option => <label key={option} className={popoverOption}><input type="radio" name="discovery-volume" checked={volume === option} onChange={() => { setVolume(option); closePopover(); }} />{option}</label>)}</div>
      </AnchoredPopover>
      <DisabledFutureControl label="KD · em breve" tooltip="Dificuldade orgânica futura. Concorrência Ads não será usada como KD." />
      <button ref={cpcTriggerRef} type="button" onClick={() => togglePopover("cpc")} aria-expanded={activeFilterPopover === "cpc"} className={filterButton}>CPC · {cpc}<ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" /></button>
      <AnchoredPopover open={activeFilterPopover === "cpc"} onClose={closePopover} triggerRef={cpcTriggerRef} ariaLabel="Filtro de CPC">
        <p className="mb-2 text-sm font-medium text-foreground">CPC</p>
        {DISCOVERY_CPC_FILTERS.map(option => <label key={option} className={popoverOption}><input type="radio" name="discovery-cpc" checked={cpc === option} onChange={() => { setCpc(option); closePopover(); }} />{option}</label>)}
      </AnchoredPopover>
      <TermFilter label="Incluir palavras-chave" popover="include" value={includeTerms} onChange={setIncludeTerms} activeFilterPopover={activeFilterPopover} setActiveFilterPopover={setActiveFilterPopover} triggerRef={includeTriggerRef} />
      <TermFilter label="Excluir palavras-chave" popover="exclude" value={excludeTerms} onChange={setExcludeTerms} activeFilterPopover={activeFilterPopover} setActiveFilterPopover={setActiveFilterPopover} triggerRef={excludeTriggerRef} />
      <label className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground/80" title="Incluir palavras-chave adultas na próxima pesquisa">
        <input type="checkbox" checked={includeAdultKeywords} onChange={event => setIncludeAdultKeywords(event.target.checked)} aria-label="Incluir palavras-chave adultas" />
        <span className="whitespace-nowrap"><span className="hidden sm:inline">Incluir palavras-chave adultas</span><span className="sm:hidden">Incluir adultas</span></span>
      </label>
      <button type="button" onClick={() => { closePopover(); onClear(); }} className={filterButton}><RotateCcw className="h-4 w-4" aria-hidden="true" />Limpar filtros</button>
      <button type="button" onClick={onDiscover} disabled={loading || !canSubmit} aria-busy={loading} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-action-accent bg-action-accent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-action-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-accent/50 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:w-auto">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}{loading ? "Buscando..." : "Buscar Keywords"}</button>
    </section>;
}

function DisabledFutureControl({ label, tooltip }: { label: string; tooltip: string }) {
  return <span className="inline-flex cursor-not-allowed" title={tooltip}><button type="button" disabled aria-label={`${label}. ${tooltip}`} className={filterButton}>{label}</button></span>;
}

function TermFilter({ label, popover, value, onChange, activeFilterPopover, setActiveFilterPopover, triggerRef }: { label: string; popover: Exclude<DiscoveryFilterPopover, null>; value: string; onChange: (value: string) => void; activeFilterPopover: DiscoveryFilterPopover; setActiveFilterPopover: Dispatch<SetStateAction<DiscoveryFilterPopover>>; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const open = activeFilterPopover === popover;
  const closePopover = () => setActiveFilterPopover(null);
  return <>
    <button ref={triggerRef} type="button" onClick={() => setActiveFilterPopover(current => current === popover ? null : popover)} aria-expanded={open} className={filterButton}>{label}<ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" /></button>
    <AnchoredPopover open={open} onClose={closePopover} triggerRef={triggerRef} ariaLabel={label}>
      <label className="block text-sm font-medium text-foreground">{label}<textarea value={value} onChange={event => onChange(event.target.value)} rows={5} className={control} placeholder="Uma por linha ou separadas por vírgula" /></label>
      <p className="mt-2 text-sm leading-5 text-text-muted">Aplicado somente ao clicar em Descobrir Keywords.</p>
    </AnchoredPopover>
  </>;
}
