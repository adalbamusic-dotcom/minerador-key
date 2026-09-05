"use client";

import { useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { ChevronDown, Filter, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { AnchoredPopover } from "@/components/editorial/anchored-popover";
import { InfoHint } from "@/components/info-hint";
import { DISCOVERY_KEYWORD_DIFFICULTY_PRESETS, DISCOVERY_RESULT_PRESETS, type DiscoveryKeywordDifficultyPreset, type DiscoveryResultPreset } from "@/lib/minerador/discovery-seo-filters";
import { DISCOVERY_CPC_FILTERS, DISCOVERY_VOLUME_RANGES, type DiscoveryCpcFilter, type DiscoveryMode, type DiscoveryVolumeRange } from "./discovery-types";

type DiscoveryFilterPopover = "result" | "volume" | "keywordDifficulty" | "cpc" | "include" | "exclude" | null;

const filterButton = "inline-flex h-9 items-center gap-2 rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground/80 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40 disabled:cursor-not-allowed disabled:opacity-45";
const popoverOption = "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground/80 hover:bg-surface-subtle";
const control = "mt-2 w-full rounded border border-divider bg-surface-subtle px-3 py-2 text-sm text-foreground outline-none focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40";

export function DiscoveryFilterRow({ discoveryMode, volume, setVolume, cpc, setCpc, resultPreset, setResultPreset, resultMin, setResultMin, resultMax, setResultMax, keywordDifficultyPreset, setKeywordDifficultyPreset, keywordDifficultyMin, setKeywordDifficultyMin, keywordDifficultyMax, setKeywordDifficultyMax, hasSeoData, includeTerms, setIncludeTerms, excludeTerms, setExcludeTerms, includeAdultKeywords, setIncludeAdultKeywords, activeFilterPopover, setActiveFilterPopover, onDiscover, onClear, loading, canSubmit }: { discoveryMode: DiscoveryMode; volume: DiscoveryVolumeRange; setVolume: Dispatch<SetStateAction<DiscoveryVolumeRange>>; cpc: DiscoveryCpcFilter; setCpc: Dispatch<SetStateAction<DiscoveryCpcFilter>>; resultPreset: DiscoveryResultPreset; setResultPreset: Dispatch<SetStateAction<DiscoveryResultPreset>>; resultMin: string; setResultMin: Dispatch<SetStateAction<string>>; resultMax: string; setResultMax: Dispatch<SetStateAction<string>>; keywordDifficultyPreset: DiscoveryKeywordDifficultyPreset; setKeywordDifficultyPreset: Dispatch<SetStateAction<DiscoveryKeywordDifficultyPreset>>; keywordDifficultyMin: string; setKeywordDifficultyMin: Dispatch<SetStateAction<string>>; keywordDifficultyMax: string; setKeywordDifficultyMax: Dispatch<SetStateAction<string>>; hasSeoData: boolean; includeTerms: string; setIncludeTerms: Dispatch<SetStateAction<string>>; excludeTerms: string; setExcludeTerms: Dispatch<SetStateAction<string>>; includeAdultKeywords: boolean; setIncludeAdultKeywords: Dispatch<SetStateAction<boolean>>; activeFilterPopover: DiscoveryFilterPopover; setActiveFilterPopover: Dispatch<SetStateAction<DiscoveryFilterPopover>>; onDiscover: () => void | Promise<void>; onClear: () => void; loading: boolean; canSubmit: boolean; }) {
  const volumeTriggerRef = useRef<HTMLButtonElement>(null);
  const cpcTriggerRef = useRef<HTMLButtonElement>(null);
  const resultTriggerRef = useRef<HTMLButtonElement>(null);
  const keywordDifficultyTriggerRef = useRef<HTMLButtonElement>(null);
  const includeTriggerRef = useRef<HTMLButtonElement>(null);
  const excludeTriggerRef = useRef<HTMLButtonElement>(null);
  const closePopover = () => setActiveFilterPopover(null);
  const togglePopover = (popover: Exclude<DiscoveryFilterPopover, null>) => setActiveFilterPopover(current => current === popover ? null : popover);

  return <section className="flex flex-wrap gap-2 border-b border-divider px-3 py-4 sm:px-4 xl:px-6" aria-label="Filtros da pesquisa e do enriquecimento SEO">
      <NumericRangeFilter label="Resultado" name="discovery-result" preset={resultPreset} setPreset={setResultPreset} presets={DISCOVERY_RESULT_PRESETS} min={resultMin} max={resultMax} setMin={setResultMin} setMax={setResultMax} hasData={hasSeoData} triggerRef={resultTriggerRef} open={activeFilterPopover === "result"} onToggle={() => togglePopover("result")} onClose={closePopover} />
      <InfoHint title="Filtro de volume" description="Filtra localmente pela média de pesquisas mensais já disponível; alterar o filtro não consulta o provedor.">
        <button ref={volumeTriggerRef} type="button" onClick={() => togglePopover("volume")} aria-expanded={activeFilterPopover === "volume"} className={filterButton}>
          <Filter className="h-4 w-4 text-text-muted" aria-hidden="true" />Volume · {volume}<ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" />
        </button>
      </InfoHint>
      <AnchoredPopover open={activeFilterPopover === "volume"} onClose={closePopover} triggerRef={volumeTriggerRef} ariaLabel="Faixa de volume">
        <p className="mb-2 text-sm font-medium text-foreground">Faixa de volume</p>
        <div className="grid gap-1 sm:grid-cols-2">{DISCOVERY_VOLUME_RANGES.map(option => <label key={option} className={popoverOption}><input type="radio" name="discovery-volume" checked={volume === option} onChange={() => { setVolume(option); closePopover(); }} />{option}</label>)}</div>
      </AnchoredPopover>
      <NumericRangeFilter label="KD" name="discovery-keyword-difficulty" preset={keywordDifficultyPreset} setPreset={setKeywordDifficultyPreset} presets={DISCOVERY_KEYWORD_DIFFICULTY_PRESETS} min={keywordDifficultyMin} max={keywordDifficultyMax} setMin={setKeywordDifficultyMin} setMax={setKeywordDifficultyMax} maxBound={100} helperText="Quanto menor o KD, menor a dificuldade relativa estimada para disputar o top 10." hasData={hasSeoData} triggerRef={keywordDifficultyTriggerRef} open={activeFilterPopover === "keywordDifficulty"} onToggle={() => togglePopover("keywordDifficulty")} onClose={closePopover} />
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
      <button type="button" onClick={onDiscover} disabled={loading || !canSubmit} aria-busy={loading} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-action-accent bg-action-accent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-action-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-accent/50 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:w-auto">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}{loading ? (discoveryMode === "customer_discovery" ? "Descobrindo..." : "Buscando...") : (discoveryMode === "customer_discovery" ? "Descobrir formas de procura" : "Buscar Keywords")}</button>
    </section>;
}

function NumericRangeFilter<P extends string>({ label, name, preset, setPreset, presets, min, max, setMin, setMax, maxBound, helperText, hasData, triggerRef, open, onToggle, onClose }: { label: string; name: string; preset: P; setPreset: Dispatch<SetStateAction<P>>; presets: readonly { key: P; label: string }[]; min: string; max: string; setMin: Dispatch<SetStateAction<string>>; setMax: Dispatch<SetStateAction<string>>; maxBound?: number; helperText?: string; hasData: boolean; triggerRef: RefObject<HTMLButtonElement | null>; open: boolean; onToggle: () => void; onClose: () => void }) {
  const selectedLabel = presets.find(option => option.key === preset)?.label || "Todos";
  const customSelected = preset === "custom";
  return <>
    <button ref={triggerRef} type="button" onClick={onToggle} aria-expanded={open} className={filterButton} title={hasData ? `Filtrar ${label} localmente sobre dados SEO já medidos` : "Meça os dados SEO para usar este filtro"}>{label} · {selectedLabel}<ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" /></button>
    <AnchoredPopover open={open} onClose={onClose} triggerRef={triggerRef} ariaLabel={`Filtro de ${label}`}>
      <div className="grid gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-sm leading-5 text-text-muted">{hasData ? "Filtro local sobre dados já medidos." : "Meça os dados SEO para usar este filtro."}</p>
          {helperText && <p className="mt-1 text-sm leading-5 text-text-muted">{helperText}</p>}
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {presets.map(option => <label key={option.key} className={popoverOption}>
            <input type="radio" name={name} checked={preset === option.key} onChange={() => { setPreset(option.key); if (option.key !== "custom") onClose(); }} />
            {option.label}
          </label>)}
        </div>
        {customSelected && <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-foreground/80">Mín.<input type="number" min="0" max={maxBound} step="1" inputMode="numeric" value={min} onChange={event => setMin(event.target.value)} className={control} /></label>
          <label className="text-sm text-foreground/80">Máx.<input type="number" min="0" max={maxBound} step="1" inputMode="numeric" value={max} onChange={event => setMax(event.target.value)} className={control} /></label>
        </div>}
        <p className="text-sm leading-5 text-text-muted">Alterar o filtro não chama a DataForSEO. Candidatas sem medição ficam fora quando uma faixa está ativa.</p>
      </div>
    </AnchoredPopover>
  </>;
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
