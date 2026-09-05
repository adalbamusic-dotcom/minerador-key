"use client";

import type { RadarActivityModel } from "@/lib/radar/workbench";

const section = "rounded-md border border-divider bg-surface-subtle p-4";

function formatDate(value: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export function RadarActivitySummary({ activity }: { activity: RadarActivityModel }) {
  return <section className={section} aria-label="Atividade do artigo"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Atividade</h2><p className="mt-1 text-sm text-text-muted">Resumo do estado operacional do artigo selecionado.</p></div><span className="text-sm text-text-muted">Atualizado em {formatDate(activity.lastUpdatedAt)}</span></div><dl className="mt-4 grid gap-3 sm:grid-cols-3"><div><dt className="text-sm text-text-muted">Solicitações enviadas</dt><dd className="mt-1 text-xl font-semibold text-foreground">{activity.requestsSent}</dd></div><div><dt className="text-sm text-text-muted">Contribuições recebidas</dt><dd className="mt-1 text-xl font-semibold text-foreground">{activity.contributionsReceived}</dd></div><div><dt className="text-sm text-text-muted">Pendências</dt><dd className="mt-1 text-xl font-semibold text-foreground">{activity.pending}</dd></div></dl><div className="mt-4 border-t border-divider pt-3"><p className="text-sm font-medium text-foreground">Eventos recentes</p>{activity.events.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{activity.events.slice(0, 6).map((event, index) => <li className="text-sm text-text-muted" key={`${event.label}:${event.at}:${index}`}><span className="font-medium text-foreground">{event.label}</span><span className="ml-2">{event.detail}</span></li>)}</ul> : <p className="mt-2 text-sm text-text-muted">Nenhum evento operacional registrado.</p>}</div><p className="mt-3 text-xs text-text-muted">Fonte: {activity.sourceLabel}</p></section>;
}
