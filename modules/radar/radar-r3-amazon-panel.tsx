"use client";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import type { RadarR3Model } from "@/lib/radar/r3-workbench";
import type { RadarR4AmazonState } from "@/lib/radar/r4-queue";

type RadarR3AmazonPanelProps = {
  model: RadarR3Model["amazon"];
  state?: RadarR4AmazonState;
  onStateChange?: (state: RadarR4AmazonState) => void;
};

type AmazonView = "not_applicable" | "fixture";

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const inset = "rounded-md border border-divider bg-surface-subtle p-3";

const fixture = {
  products: "Nenhum produto associado",
  reviews: "Nenhuma avaliação carregada",
  recurring: "Nenhuma reclamação recorrente observada",
  criteria: "Critérios ainda não definidos",
  questions: "Quais necessidades de produto exigiriam validação?",
  gaps: "Sem lacunas Amazon nesta investigação",
};

export function RadarR3AmazonPanel({ model, state = "AMAZON_NOT_APPLICABLE", onStateChange }: RadarR3AmazonPanelProps) {
  const [localState, setLocalState] = useState<RadarR4AmazonState>(state);
  const [view, setView] = useState<AmazonView>(state === "AMAZON_APPLICABLE" || state === "AMAZON_REVIEWED" ? "fixture" : "not_applicable");
  const isFixture = view === "fixture";
  const stateLabel = localState === "AMAZON_PENDING" ? "Aguardando decisão" : localState === "AMAZON_REVIEWED" ? "Critérios revisados localmente" : localState === "AMAZON_APPLICABLE" ? "Aplicável · aguardando revisão" : model.label;
  const changeState = (next: RadarR4AmazonState) => { setLocalState(next); setView(next === "AMAZON_APPLICABLE" || next === "AMAZON_REVIEWED" ? "fixture" : "not_applicable"); onStateChange?.(next); };
  return <section className="space-y-4" aria-label="Área Amazon do Radar">
    <div className="rounded-md border border-warning/50 bg-warning-soft/30 p-3 text-sm text-foreground">
      <div className="flex items-start gap-2"><ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true"/><div><p className="font-semibold">Área reservada · sem coleta externa</p><p className="mt-1 text-text-muted">Amazon é opcional nesta fase. Não há provider, chamada de API ou persistência ProductEvidence neste fluxo.</p></div></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className={inset}><p className="text-xs text-text-muted">Produtos</p><p className="mt-1 text-sm font-semibold text-foreground">{isFixture ? fixture.products : "Não aplicável"}</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Avaliações</p><p className="mt-1 text-sm font-semibold text-foreground">{isFixture ? fixture.reviews : "Não aplicável"}</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Estado</p><p className="mt-1 text-sm font-semibold text-foreground">{stateLabel}</p></div>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <section className={inset}><h3 className="text-sm font-semibold text-foreground">Reviews e recorrências</h3><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-text-muted">Prós</dt><dd className="text-foreground">{isFixture ? "Nenhum dado carregado" : "Não aplicável"}</dd></div><div><dt className="text-text-muted">Contras</dt><dd className="text-foreground">{isFixture ? "Nenhum dado carregado" : "Não aplicável"}</dd></div><div><dt className="text-text-muted">Reclamações recorrentes</dt><dd className="text-foreground">{isFixture ? fixture.recurring : "Não aplicável"}</dd></div></dl></section>
      <section className={inset}><h3 className="text-sm font-semibold text-foreground">Critérios, perguntas e lacunas</h3><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-text-muted">Critérios</dt><dd className="text-foreground">{isFixture ? fixture.criteria : "Não definidos"}</dd></div><div><dt className="text-text-muted">Perguntas</dt><dd className="text-foreground">{isFixture ? fixture.questions : "Nenhuma pergunta Amazon"}</dd></div><div><dt className="text-text-muted">Lacunas</dt><dd className="text-foreground">{isFixture ? fixture.gaps : "Nenhuma lacuna registrada"}</dd></div></dl></section>
    </div>
    <div className="flex flex-wrap gap-2"><button type="button" className={view === "not_applicable" ? `${button} border-context-accent bg-selected` : button} onClick={() => changeState("AMAZON_NOT_APPLICABLE")}>Marcar como não aplicável</button><button type="button" className={view === "fixture" ? `${button} border-context-accent bg-selected` : button} onClick={() => changeState("AMAZON_APPLICABLE")}>Marcar como aplicável</button>{isFixture && <button type="button" className={localState === "AMAZON_REVIEWED" ? `${button} border-context-accent bg-selected` : button} onClick={() => changeState("AMAZON_REVIEWED")}>Marcar critérios revisados</button>}</div>
    <p className="text-sm text-text-muted">A decisão acima é somente de apresentação local; a fixture demonstrativa local não cria versão, registro remoto ou evidência editorial.</p>
  </section>;
}
