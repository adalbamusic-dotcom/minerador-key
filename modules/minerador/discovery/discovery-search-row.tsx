"use client";

import { ChevronDown } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AnchoredPopover } from "@/components/editorial/anchored-popover";
import { GOOGLE_ADS_DISCOVERY_STATE_LABELS, GOOGLE_ADS_DISCOVERY_STATE_OPTIONS } from "@/lib/minerador/google-ads-discovery-catalog";
import { DISCOVERY_FUNNELS, DISCOVERY_INTENTS, DISCOVERY_RELATIONS, type DiscoveryFunnel, type DiscoveryIntent, type DiscoveryRelation } from "./discovery-types";

const control = "mt-1 h-10 w-full rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40";
const primarySearchControl = "mt-1 h-10 w-full rounded border border-action-accent/35 bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors hover:border-action-accent/50 focus:border-action-accent/65 focus-visible:ring-2 focus-visible:ring-action-accent/20";
const states = ["Todos os estados", ...GOOGLE_ADS_DISCOVERY_STATE_OPTIONS];

export function DiscoverySearchRow({ seed, setSeed, relation, setRelation, intent, setIntent, funnel, setFunnel, language, setLanguage, states: selectedStates, setStates, onSubmit }: {
  seed: string;
  setSeed: Dispatch<SetStateAction<string>>;
  relation: DiscoveryRelation;
  setRelation: Dispatch<SetStateAction<DiscoveryRelation>>;
  intent: DiscoveryIntent;
  setIntent: Dispatch<SetStateAction<DiscoveryIntent>>;
  funnel: DiscoveryFunnel;
  setFunnel: Dispatch<SetStateAction<DiscoveryFunnel>>;
  language: string;
  setLanguage: Dispatch<SetStateAction<string>>;
  states: string[];
  setStates: Dispatch<SetStateAction<string[]>>;
  onSubmit: () => void | Promise<void>;
}) {
  const [statesPopoverOpen, setStatesPopoverOpen] = useState(false);
  const statesTriggerRef = useRef<HTMLButtonElement>(null);
  const allStates = selectedStates.length === 0 || selectedStates.includes("Todos os estados");
  const toggleState = (state: string) => setStates(current => {
    if (state === "Todos os estados") return [state];
    const withoutAll = current.filter(item => item !== "Todos os estados");
    const next = withoutAll.includes(state) ? withoutAll.filter(item => item !== state) : [...withoutAll, state];
    return next.length ? next : ["Todos os estados"];
  });

  return <section className="min-w-0 w-full max-w-full border-b border-divider py-4" aria-label="Busca de keywords">
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(10rem,max-content)_minmax(9rem,.8fr)_minmax(8rem,.65fr)_minmax(7rem,.6fr)_minmax(6rem,.55fr)_minmax(9rem,.85fr)] xl:items-end">
      <label className="block min-w-0 max-w-[60ch] text-sm font-semibold text-foreground">Palavra-chave principal, serviço ou nicho<input value={seed} onChange={event => setSeed(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void onSubmit(); } }} className={`${primarySearchControl} max-w-[60ch]`} placeholder="Digite uma keyword, serviço, produto ou nicho..." /></label>
      <label className="block min-w-0 text-sm font-medium text-foreground/85">Modo da pesquisa<select value={relation} onChange={event => setRelation(event.target.value as DiscoveryRelation)} aria-describedby="discovery-relation-help" className={control}>{DISCOVERY_RELATIONS.map(option => <option key={option}>{option}</option>)}</select><span id="discovery-relation-help" className="sr-only">Classificação da relação com a semente. Não configura campanhas Google Ads.</span></label>
      <label className="block min-w-0 text-sm font-medium text-foreground/85">Intenção preliminar<select value={intent} onChange={event => setIntent(event.target.value as DiscoveryIntent)} className={control}>{DISCOVERY_INTENTS.map(option => <option key={option}>{option}</option>)}</select></label>
      <label className="block min-w-0 text-sm font-medium text-foreground/85">Etapa do funil<select value={funnel} onChange={event => setFunnel(event.target.value as DiscoveryFunnel)} className={control}>{DISCOVERY_FUNNELS.map(option => <option key={option}>{option}</option>)}</select></label>
      <label className="block min-w-0 text-sm font-medium text-foreground/85">Idioma<select value={language} onChange={event => setLanguage(event.target.value)} className={control}><option>Português</option><option>Inglês</option><option>Espanhol</option></select></label>
      <label className="block min-w-0 text-sm font-medium text-foreground/85">País<select value="Brasil" className={control} aria-label="País da pesquisa" disabled><option>Brasil</option></select></label>
      <div className="block min-w-0 text-sm font-medium text-foreground/85"><p>Estados/UF</p><button ref={statesTriggerRef} type="button" aria-expanded={statesPopoverOpen} onClick={() => setStatesPopoverOpen(current => !current)} className="mt-1 flex h-10 w-full items-center justify-between rounded border border-divider bg-surface-subtle px-3 text-sm font-normal text-foreground outline-none transition-colors hover:border-module-accent/30 focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40"><span className="truncate">{allStates ? "Todos os estados" : `${selectedStates.length} estado(s)`}</span><ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${statesPopoverOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button><AnchoredPopover open={statesPopoverOpen} onClose={() => setStatesPopoverOpen(false)} triggerRef={statesTriggerRef} ariaLabel="Estados e unidades federativas" className="max-h-[min(60vh,26rem)]"><p className="mb-2 text-sm text-text-muted">Estados/UF</p><p className="mb-2 text-xs text-text-muted">Até 10 UFs por pesquisa. As métricas representam o conjunto selecionado.</p>{states.map(state => <label key={state} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-normal text-foreground/80 hover:bg-surface-subtle"><input type="checkbox" checked={state === "Todos os estados" ? allStates : selectedStates.includes(state)} onChange={() => toggleState(state)} />{state === "Todos os estados" ? state : GOOGLE_ADS_DISCOVERY_STATE_LABELS[state as keyof typeof GOOGLE_ADS_DISCOVERY_STATE_LABELS]}</label>)}</AnchoredPopover></div>
    </div>
  </section>;
}
