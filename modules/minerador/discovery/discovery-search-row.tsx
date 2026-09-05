"use client";

import { ChevronDown } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AnchoredPopover } from "@/components/editorial/anchored-popover";
import { InfoHint } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";
import { GOOGLE_ADS_DISCOVERY_STATE_LABELS, GOOGLE_ADS_DISCOVERY_STATE_OPTIONS } from "@/lib/minerador/google-ads-discovery-catalog";
import { DISCOVERY_CUSTOMER_FOCUSES, DISCOVERY_FUNNELS, DISCOVERY_INTENTS, DISCOVERY_MODES, DISCOVERY_RELATIONS, type DiscoveryCustomerFocus, type DiscoveryFunnel, type DiscoveryIntent, type DiscoveryMode, type DiscoveryRelation } from "./discovery-types";

const control = "mt-1 h-10 w-full rounded border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40";
const primarySearchControl = "mt-1 h-10 w-full rounded border border-action-accent/35 bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors hover:border-action-accent/50 focus:border-action-accent/65 focus-visible:ring-2 focus-visible:ring-action-accent/20";
const readonlyContext = "mt-1 flex h-10 w-full items-center rounded border border-divider bg-surface-subtle px-3 text-sm font-normal text-foreground";
const states = ["Todos os estados", ...GOOGLE_ADS_DISCOVERY_STATE_OPTIONS];
const discoveryModeLabels: Record<DiscoveryMode, string> = { keyword: "Palavra-chave", customer_discovery: "Como clientes me encontram" };
const discoveryModeHelpers: Record<DiscoveryMode, string> = { keyword: "Expanda um termo conhecido para encontrar palavras-chave relacionadas.", customer_discovery: "Descubra como potenciais clientes procuram seu produto, serviço ou nicho." };
const discoveryCountryCode = "BR" as const;
const discoveryCurrencyByCountry = { BR: { symbol: "R$", code: "BRL" } } as const;

function discoveryCurrencyLabel(countryCode: string) {
  const context = discoveryCurrencyByCountry[countryCode as keyof typeof discoveryCurrencyByCountry];
  return context ? `${context.symbol} · ${context.code}` : "—";
}

export function DiscoverySearchRow({ discoveryMode, setDiscoveryMode, discoveryFocus, setDiscoveryFocus, seed, setSeed, relation, setRelation, intent, setIntent, funnel, setFunnel, language, setLanguage, states: selectedStates, setStates, onSubmit }: {
  discoveryMode: DiscoveryMode;
  setDiscoveryMode: Dispatch<SetStateAction<DiscoveryMode>>;
  discoveryFocus: DiscoveryCustomerFocus;
  setDiscoveryFocus: Dispatch<SetStateAction<DiscoveryCustomerFocus>>;
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
  const customerDiscovery = discoveryMode === "customer_discovery";
  const statesTriggerRef = useRef<HTMLButtonElement>(null);
  const allStates = selectedStates.length === 0 || selectedStates.includes("Todos os estados");
  const toggleState = (state: string) => setStates(current => {
    if (state === "Todos os estados") return [state];
    const withoutAll = current.filter(item => item !== "Todos os estados");
    const next = withoutAll.includes(state) ? withoutAll.filter(item => item !== state) : [...withoutAll, state];
    return next.length ? next : ["Todos os estados"];
  });

  return <section className="min-w-0 w-full max-w-full border-b border-divider px-3 py-4 sm:px-4 xl:px-6" aria-label="Busca de keywords">
    <fieldset className="mb-4 min-w-0 max-w-full">
      <legend className="text-sm font-medium text-foreground/85"><InlineLabelCluster label="Tipo de descoberta" info={<InfoHint title="Descobrir buscas pela perspectiva do cliente" description="Usa o produto, serviço ou nicho informado para encontrar formas reais de busca relacionadas à maneira como potenciais clientes procuram uma solução." />} /></legend>
      <p id="discovery-mode-help" className="mt-1 max-w-[60ch] text-sm font-normal leading-5 text-text-muted">{discoveryModeHelpers[discoveryMode]}</p>
      <div role="radiogroup" aria-label="Tipo de descoberta" aria-describedby="discovery-mode-help" className="mt-3 inline-flex max-w-full overflow-x-auto rounded border border-divider bg-surface-subtle">
        {DISCOVERY_MODES.map(option => {
          const selected = discoveryMode === option;
          return <label key={option} className={`group relative inline-flex min-h-8 shrink-0 items-center border-r border-divider last:border-r-0 ${selected ? "bg-module-accent/10 text-foreground" : "text-text-muted hover:bg-surface-elevated hover:text-foreground"}`}>
            <input type="radio" name="discovery-mode" value={option} checked={selected} onChange={() => setDiscoveryMode(option)} className="peer sr-only" />
            <span className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-module-accent/40">{selected && <span aria-hidden="true" className="text-module-accent">✓</span>}{discoveryModeLabels[option]}</span>
          </label>;
        })}
      </div>
    </fieldset>
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(10rem,max-content)_minmax(9rem,.8fr)_minmax(8rem,.65fr)_minmax(7rem,.6fr)_minmax(6rem,.55fr)_minmax(9rem,.85fr)_minmax(7rem,.55fr)] xl:items-end">
      <label className="block min-w-0 max-w-[60ch] text-sm font-semibold text-foreground"><InlineLabelCluster label={<InfoHint title="Semente da descoberta" description="Informe a palavra-chave, produto, serviço ou nicho que servirá de ponto de partida para a pesquisa. O Google Ads retorna as candidatas; o Minerador não fabrica termos."><span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">{customerDiscovery ? "Produto, serviço ou nicho" : "Palavra-chave principal, serviço ou nicho"}</span></InfoHint>} /><input value={seed} onChange={event => setSeed(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void onSubmit(); } }} className={`${primarySearchControl} max-w-[60ch]`} placeholder={customerDiscovery ? "Ex.: manicure, portaria remota, móveis planejados" : "Digite uma keyword, serviço, produto ou nicho..."} /></label>
      {customerDiscovery ? <label className="block min-w-0 text-sm font-medium text-foreground/85"><InlineLabelCluster label="Enfoque" info={<InfoHint title="Priorizar um comportamento de busca" description="Define qual perspectiva de procura deve receber mais destaque na Descoberta. O filtro organiza os candidatos sem apagar as demais oportunidades encontradas." />} /><select value={discoveryFocus} onChange={event => setDiscoveryFocus(event.target.value as DiscoveryCustomerFocus)} className={control}>{DISCOVERY_CUSTOMER_FOCUSES.map(option => <option key={option} value={option}>{option === "hire" ? "Encontrar / contratar" : "Todos os comportamentos de cliente"}</option>)}</select></label> : <label className="block min-w-0 text-sm font-medium text-foreground/85">Modo da pesquisa<select value={relation} onChange={event => setRelation(event.target.value as DiscoveryRelation)} aria-describedby="discovery-relation-help" className={control}>{DISCOVERY_RELATIONS.map(option => <option key={option}>{option}</option>)}</select><span id="discovery-relation-help" className="sr-only">Classificação da relação com a semente. Não configura campanhas Google Ads.</span></label>}
      <div className="block min-w-0 text-sm font-medium text-foreground/85">
        <InlineLabelCluster label={<label htmlFor="discovery-preliminary-intent"><InfoHint title="Intenção preliminar da descoberta" description="Indica o objetivo provável do usuário ao realizar esta busca. A interpretação canônica acontece depois no Processador."><span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Intenção preliminar</span></InfoHint></label>} />
        <select id="discovery-preliminary-intent" value={intent} onChange={event => setIntent(event.target.value as DiscoveryIntent)} className={control}>{DISCOVERY_INTENTS.map(option => <option key={option}>{option}</option>)}</select>
      </div>
      <div className="block min-w-0 text-sm font-medium text-foreground/85">
        <InlineLabelCluster label={<label htmlFor="discovery-funnel"><InfoHint title="Etapa preliminar da jornada" description="Indica a etapa provável da jornada para esta busca. É contexto inicial, não a decisão final do KeywordDNA."><span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Etapa do funil</span></InfoHint></label>} />
        <select id="discovery-funnel" value={funnel} onChange={event => setFunnel(event.target.value as DiscoveryFunnel)} className={control}>{DISCOVERY_FUNNELS.map(option => <option key={option}>{option}</option>)}</select>
      </div>
      <label className="block min-w-0 text-sm font-medium text-foreground/85">Idioma<select value={language} onChange={event => setLanguage(event.target.value)} className={control}><option>Português</option><option>Inglês</option><option>Espanhol</option></select></label>
      <label className="block min-w-0 text-sm font-medium text-foreground/85">País<select value="Brasil" className={control} aria-label="País da pesquisa" disabled><option>Brasil</option></select></label>
      <div className="block min-w-0 text-sm font-medium text-foreground/85"><p><InlineLabelCluster label={<InfoHint title="Contexto geográfico da pesquisa" description="Define os estados considerados pelo targeting da pesquisa. As métricas representam o conjunto selecionado, não cada UF isoladamente."><span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-module-accent/40">Estados/UF</span></InfoHint>} /></p><button ref={statesTriggerRef} type="button" aria-expanded={statesPopoverOpen} onClick={() => setStatesPopoverOpen(current => !current)} className="mt-1 flex h-10 w-full items-center justify-between rounded border border-divider bg-surface-subtle px-3 text-sm font-normal text-foreground outline-none transition-colors hover:border-module-accent/30 focus:border-module-accent/50 focus-visible:ring-2 focus-visible:ring-module-accent/40"><span className="truncate">{allStates ? "Todos os estados" : `${selectedStates.length} estado(s)`}</span><ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${statesPopoverOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button><AnchoredPopover open={statesPopoverOpen} onClose={() => setStatesPopoverOpen(false)} triggerRef={statesTriggerRef} ariaLabel="Estados e unidades federativas" className="max-h-[min(60vh,26rem)]"><p className="mb-2 text-sm text-text-muted">Estados/UF</p><p className="mb-2 text-xs text-text-muted">Até 10 UFs por pesquisa. As métricas representam o conjunto selecionado.</p>{states.map(state => <label key={state} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-normal text-foreground/80 hover:bg-surface-subtle"><input type="checkbox" checked={state === "Todos os estados" ? allStates : selectedStates.includes(state)} onChange={() => toggleState(state)} />{state === "Todos os estados" ? state : GOOGLE_ADS_DISCOVERY_STATE_LABELS[state as keyof typeof GOOGLE_ADS_DISCOVERY_STATE_LABELS]}</label>)}</AnchoredPopover></div>
      <div className="block min-w-0 text-sm font-medium text-foreground/85"><p>Moeda</p><output data-discovery-currency-context={discoveryCountryCode} aria-label="Moeda da pesquisa" className={readonlyContext}>{discoveryCurrencyLabel(discoveryCountryCode)}</output></div>
    </div>
  </section>;
}
