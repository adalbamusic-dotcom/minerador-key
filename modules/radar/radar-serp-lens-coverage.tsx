"use client";

import { useId, useState } from "react";
import { radarSerpRecollectConfirmation, type RadarSerpLensCoverage } from "@/lib/radar/serp-lens-coverage";
import type { RadarFrozenLensView } from "./radar-serp-lens-view";

/**
 * AS QUATRO LENTES NA TELA — adendo R2, §6; adendo R3.
 *
 * Tudo aqui é leitura do que já está gravado: o `lensSet` copiado no snapshot
 * (SERP viva) ou a cópia congelada no bundle. Nenhum componente deste arquivo
 * lê cache ou chama provider; o único que dispara alguma coisa é a recoleta
 * paga, e ela só chama quem a montou DEPOIS da confirmação com o número de
 * chamadas.
 */

const lista = "divide-y divide-divider rounded-md border border-divider";
const linha = "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2";
const botao = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const botaoPago = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-warning px-3 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";

function quando(valor: string | null | undefined) {
  if (!valor) return "Não informado";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
}

function Marca({ observada }: { observada: boolean }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${observada ? "bg-context-accent" : "bg-warning"}`} aria-hidden="true" />;
}

function Linhas({ rows }: { rows: Array<{ lens: string; name: string; observed: boolean; detail: string; collectedAt?: string | null }> }) {
  if (!rows.length) return null;
  return <ul className={lista} aria-label="Uma linha por lente">
    {rows.map(row => <li key={row.lens} className={linha} data-testid="radar-serp-lens-row" data-lens={row.lens} data-observed={row.observed ? "true" : "false"}>
      <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground"><Marca observada={row.observed} />{row.name}</span>
      <span className={`text-sm ${row.observed ? "text-text-muted" : "text-warning"}`}>
        {row.detail}{row.observed && row.collectedAt ? ` · observada em ${quando(row.collectedAt)}` : ""}
      </span>
    </li>)}
  </ul>;
}

function Notas({ notes, testId }: { notes: string[]; testId: string }) {
  if (!notes.length) return null;
  return <ul className="space-y-1 text-sm leading-6 text-text-muted" data-testid={testId}>{notes.map(nota => <li key={nota}>{nota}</li>)}</ul>;
}

/**
 * "SERP · K de 4 lentes", uma linha por lente, o que apareceu num aparelho só
 * e as notas de limitação. A data do topo é a da OBSERVAÇÃO da SERP, não a da
 * versão: com cache, uma versão nova pode trazer SERP mais antiga (R2, §10).
 */
export function RadarSerpLensCoverageView({ coverage }: { coverage: RadarSerpLensCoverage }) {
  if (coverage.state === "none") return null;
  return <div className="space-y-3" data-testid="radar-serp-lens-coverage" data-state={coverage.state}>
    <p className="text-sm font-semibold text-foreground" data-testid="radar-serp-lens-label">{coverage.label}</p>
    <dl className="grid gap-2 sm:grid-cols-2">
      <div><dt className="text-sm text-text-muted">SERP observada em</dt><dd className="mt-0.5 text-sm text-foreground">{quando(coverage.serpObservedAt)}</dd></div>
      {coverage.versionOpenedAt && <div><dt className="text-sm text-text-muted">Versão aberta em</dt><dd className="mt-0.5 text-sm text-foreground">{quando(coverage.versionOpenedAt)}</dd></div>}
    </dl>
    <Linhas rows={coverage.rows} />
    {coverage.exclusive.length > 0 && <div data-testid="radar-serp-lens-exclusive">
      <p className="text-sm font-semibold text-foreground">Apareceu em um aparelho só</p>
      <ul className="mt-1 space-y-1 text-sm leading-6 text-foreground">
        {coverage.exclusive.map(item => <li key={item.lens}>
          <span className="font-medium">{item.name}:</span>{" "}
          {[
            item.domains.length ? `domínios ${item.domains.join(", ")}` : "",
            item.questions.length ? `perguntas ${item.questions.join(" · ")}` : "",
            item.aiOverviewDomains.length ? `citados pelo AI Overview ${item.aiOverviewDomains.join(", ")}` : "",
          ].filter(Boolean).join(" · ")}
        </li>)}
      </ul>
    </div>}
    <Notas notes={coverage.notes} testId="radar-serp-lens-notes" />
  </div>;
}

/** A cópia congelada no FINALIZE — ou, sem ela, a frase que diz por quê. */
export function RadarFrozenLensSummary({ view }: { view: RadarFrozenLensView }) {
  if (view.state !== "frozen") {
    return <p className="text-sm leading-6 text-text-muted" data-testid="radar-frozen-lenses-absent" data-state={view.state}>{view.label}</p>;
  }
  return <div className="space-y-3" data-testid="radar-frozen-lenses" data-state={view.state}>
    <p className="text-sm font-semibold text-foreground" data-testid="radar-frozen-lenses-label">{view.label}</p>
    <Linhas rows={view.rows} />
    {view.auxiliary.length > 0 && <div data-testid="radar-frozen-lenses-auxiliary">
      <p className="text-sm font-semibold text-foreground">Pesquisas auxiliares</p>
      <ul className={`mt-1 ${lista}`}>{view.auxiliary.map(item => <li key={item.queryId} className={linha}>
        <span className="text-sm text-keyword">{item.keyword}</span>
        <span className="text-sm text-text-muted">{item.label}</span>
      </li>)}</ul>
    </div>}
    <Notas notes={view.notes} testId="radar-frozen-lenses-notes" />
  </div>;
}

/**
 * "RECOLETAR AGORA (PAGO)" — O NÚMERO DE CHAMADAS VEM ANTES DO CLIQUE.
 *
 * O primeiro clique só abre a confirmação, com a frase e o teto de chamadas
 * de `radarSerpRecollectConfirmation()`. Quem paga é o segundo, no botão que
 * repete o número. Cancelar fecha sem chamar nada.
 */
export function RadarSerpRecollectAction({ onConfirm, busy, running = busy, blockedReason = null }: {
  onConfirm: () => void;
  /** Qualquer coleta em curso: desabilita o botão. */
  busy: boolean;
  /** Só a recoleta paga em curso: é o único caso que diz "Recoletando…". */
  running?: boolean;
  blockedReason?: string | null;
}) {
  const [aberta, setAberta] = useState(false);
  const titulo = useId();
  const mensagem = useId();
  const confirmacao = radarSerpRecollectConfirmation();
  const bloqueada = Boolean(blockedReason);
  return <div className="flex flex-col items-end gap-2" data-testid="radar-serp-recollect">
    <button type="button" className={botao} disabled={busy || bloqueada || aberta} onClick={() => setAberta(true)} title={blockedReason || undefined} data-testid="radar-serp-recollect-open">
      {running ? "Recoletando…" : confirmacao.title}
    </button>
    {blockedReason && <p className="max-w-md text-right text-sm text-text-muted" data-testid="radar-serp-recollect-blocked">{blockedReason}</p>}
    {aberta && !busy && !bloqueada && <div role="group" aria-labelledby={titulo} aria-describedby={mensagem} className="max-w-md rounded-md border border-warning/40 bg-surface-elevated p-3" data-testid="radar-serp-recollect-confirmation">
      <p id={titulo} className="text-sm font-semibold text-foreground">{confirmacao.title}</p>
      <p id={mensagem} className="mt-1 text-sm leading-6 text-foreground">{confirmacao.message}</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className={botao} onClick={() => setAberta(false)} data-testid="radar-serp-recollect-cancel">Cancelar</button>
        <button type="button" className={botaoPago} onClick={() => { setAberta(false); onConfirm(); }} data-testid="radar-serp-recollect-confirm">{confirmacao.confirmLabel}</button>
      </div>
    </div>}
  </div>;
}
