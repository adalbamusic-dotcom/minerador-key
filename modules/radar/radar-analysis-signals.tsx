"use client";

type RadarAnalysisSignalsProps = {
  needs: string[];
  gaps: string[];
  conflicts: string[];
  opportunities: string[];
  sources: string[];
};

const section = "rounded-lg border border-divider bg-surface p-5";

function SignalGroup({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  return <div><h3 className="text-base font-semibold text-foreground">{title}</h3>{uniqueValues.length ? <ul className="mt-2 space-y-2 text-base leading-6 text-text-muted">{uniqueValues.slice(0, 8).map((value, index) => <li className="border-b border-divider pb-2 last:border-0 last:pb-0" key={`${title}:${value}:${index}`}>{value}</li>)}</ul> : <p className="mt-2 text-base text-text-muted">{empty}</p>}</div>;
}

export function RadarAnalysisSignals({ needs, gaps, conflicts, opportunities, sources }: RadarAnalysisSignalsProps) {
  return <section className={section} aria-label="Sinais operacionais da análise SERP"><div><h2 className="text-xl font-semibold text-foreground">Necessidades, lacunas e oportunidades</h2><p className="mt-2 max-w-3xl text-base leading-6 text-text-muted">Resumo real da amostra para o Workbench e para o relatório. Esses sinais orientam revisão humana; não definem outline, metas ou ContentPlan.</p></div><div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4"><SignalGroup title="Necessidades" values={needs} empty="Nenhuma necessidade consolidada."/><SignalGroup title="Lacunas" values={gaps} empty="Nenhuma lacuna observada."/><SignalGroup title="Conflitos" values={conflicts} empty="Nenhum conflito registrado."/><SignalGroup title="Oportunidades" values={opportunities} empty="Nenhuma oportunidade registrada."/></div><div className="mt-5 border-t border-divider pt-4"><h3 className="text-base font-semibold text-foreground">Fontes da amostra</h3>{sources.length ? <ul className="mt-2 grid gap-2 text-sm text-text-muted sm:grid-cols-2">{[...new Set(sources)].slice(0, 10).map((source, index) => <li className="break-all" key={`${source}:${index}`}>{source}</li>)}</ul> : <p className="mt-2 text-base text-text-muted">Nenhuma página analisada ainda.</p>}</div></section>;
}
