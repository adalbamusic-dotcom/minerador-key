"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, X } from "lucide-react";
import { internalButton, internalButtonPrimary } from "@/components/editorial/internal-page-visual";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { EditorialGroupDot } from "@/components/editorial/group-tag";
import { EDITORIAL_GROUP_COLOR_LABELS, type EditorialGroupColor } from "@/lib/editorial/editorial-groups";
import { ARCHITECT_SUGGESTIONS_LABEL } from "@/lib/arquiteto/minerador-suggestions";
import type { ArchitectSuggestionColorSummary, ArchitectSuggestionLine } from "@/lib/minerador/architect-suggestions-view";
import type { ArchitectSuggestionApplyResult } from "@/lib/minerador/architect-suggestions-apply";

/**
 * "SUGESTÕES DO ARQUITETO · COR X" — A CAIXA (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, F4; D3).
 *
 * O Arquiteto só lê keyword: o que a melhoria, o reforço ou a diferenciação
 * precisariam do Minerador (keyword nova, medição a gravar, Lógica) chega
 * aqui como sugestão. A caixa lê a lista leve, filtrada pela cor; "Trazer para
 * o Minerador" passa por uma prévia do servidor e por uma confirmação e grava
 * pelos núcleos do Minerador (importar com a Lógica, gravar a medição guardada
 * sem consultar de novo, rodar a Lógica). Aprovar e enviar é o "Aprovar e
 * enviar" de sempre, aberto daqui com as keywords certas.
 * Fala só com `/api/minerador/marcas/[brandId]/architect-suggestions`.
 */

const ROUTE = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/architect-suggestions`;

type Listing = { lines: ArchitectSuggestionLine[]; colors: ArchitectSuggestionColorSummary[]; readAt: string };
type Preview = { lines: ArchitectSuggestionLine[]; selected: ArchitectSuggestionLine[]; notApplicable: ArchitectSuggestionLine[]; unknownKeys: string[]; decisionHash: string };
type Refusal = { code: string; message: string };

const OUTCOME_LABEL: Record<ArchitectSuggestionApplyResult["results"][number]["outcome"], string> = {
  imported: "importada (com a Lógica)",
  measurement_recorded: "medição gravada",
  logic_applied: "Lógica aplicada",
  failed: "não gravada",
  skipped: "fora desta ação",
};

async function call<T>(brandId: string, init?: { body: Record<string, unknown> }): Promise<{ ok: true; data: T } | { ok: false; refusal: Refusal }> {
  const response = await (init
    ? fetch(ROUTE(brandId), { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) })
    : fetch(ROUTE(brandId), { cache: "no-store" })).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || body.success !== true) {
    return { ok: false, refusal: { code: typeof body.code === "string" ? body.code : response ? `HTTP_${response.status}` : "NETWORK_ERROR", message: typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : response ? "As sugestões do Arquiteto não puderam ser lidas agora." : "Sem conexão com o servidor. Nada foi gravado." } };
  }
  return { ok: true, data: body.data as T };
}

/** O botão da barra do Processador: abre a caixa. */
export function ArchitectSuggestionsButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} onClick={onClick} aria-label={ARCHITECT_SUGGESTIONS_LABEL} title={`${ARCHITECT_SUGGESTIONS_LABEL}: keywords novas, medições e Lógica que o Arquiteto precisaria — você decide aqui`} data-minerador-architect-suggestions>
      <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{ARCHITECT_SUGGESTIONS_LABEL}</span>
    </button>
  );
}

export function ArchitectSuggestionsDialog({ brandId, initialColor, onClose, onOpenApproveAndSend, onSelectInSheet, onApplied }: {
  brandId: string;
  initialColor: EditorialGroupColor | null;
  onClose: () => void;
  /** O "Aprovar e enviar" de sempre, com as keywords certas. */
  onOpenApproveAndSend: (keywordIds: string[], scopeLabel: string) => void;
  /** Filtra a planilha pela cor e marca as linhas (para o botão "Volume" de sempre). */
  onSelectInSheet: (input: { color: EditorialGroupColor | null; keywordIds: string[] }) => void;
  /** Relê na planilha as keywords tocadas. */
  onApplied: (keywordIds: string[]) => Promise<void> | void;
}) {
  const ids = { title: useId() };
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<Refusal | null>(null);
  const [color, setColor] = useState<EditorialGroupColor | null | "all">(initialColor ?? "all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ArchitectSuggestionApplyResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [phase, setPhase] = useState<"loading" | "idle" | "previewing" | "applying">("loading");
  const busyRef = useRef(false);
  const busy = phase !== "idle";

  const ler = useCallback(async () => {
    setPhase("loading");
    const answer = await call<Listing>(brandId);
    if (!answer.ok) { setLoadError(answer.refusal); setPhase("idle"); return null; }
    setLoadError(null);
    setListing(answer.data);
    setPhase("idle");
    return answer.data;
  }, [brandId]);

  useEffect(() => {
    // Leitura na montagem: o estado só muda quando a resposta chega.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void ler();
  }, [ler]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busyRef.current) onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const linhas = useMemo(() => listing?.lines ?? [], [listing]);
  const visiveis = useMemo(() => color === "all" ? linhas : linhas.filter(line => line.color === color), [linhas, color]);
  const aplicaveis = visiveis.filter(line => line.applicable);
  const marcadas = aplicaveis.filter(line => selected.has(line.key));
  const aAprovar = [...new Set(visiveis.filter(line => line.state === "approve_and_send" && line.keywordId).map(line => line.keywordId!))];
  const aMedir = [...new Set(visiveis.filter(line => line.state === "measure_in_minerador" && line.keywordId).map(line => line.keywordId!))];
  const rotuloCor = color === "all" ? "todas as cores" : color ? `cor ${EDITORIAL_GROUP_COLOR_LABELS[color]}` : "sem cor";

  const escolherCor = (next: EditorialGroupColor | null | "all") => {
    setColor(next);
    setSelected(new Set());
    setPreview(null);
  };

  const gerarPrevia = async () => {
    if (busyRef.current || !marcadas.length) return;
    busyRef.current = true;
    setPhase("previewing");
    setRefusal(null);
    try {
      const answer = await call<Preview>(brandId, { body: { mode: "preview", keys: marcadas.map(line => line.key) } });
      if (!answer.ok) { setRefusal(answer.refusal); setPreview(null); return; }
      setPreview(answer.data);
    } finally {
      busyRef.current = false;
      setPhase("idle");
    }
  };

  const confirmar = async () => {
    if (busyRef.current || !preview) return;
    busyRef.current = true;
    setPhase("applying");
    setRefusal(null);
    try {
      const answer = await call<ArchitectSuggestionApplyResult>(brandId, { body: { mode: "apply", keys: [...preview.selected, ...preview.notApplicable].map(line => line.key), decisionHash: preview.decisionHash } });
      if (!answer.ok) { setRefusal(answer.refusal); return; }
      setResult(answer.data);
      setPreview(null);
      setSelected(new Set());
      setListing(current => current ? { ...current, lines: answer.data.lines } : current);
      const tocadas = [...new Set(answer.data.lines.filter(line => line.keywordId && answer.data.results.some(item => item.key === line.key && item.outcome !== "failed" && item.outcome !== "skipped")).map(line => line.keywordId!))];
      await onApplied(tocadas);
    } finally {
      busyRef.current = false;
      setPhase("idle");
    }
  };

  const alternar = (key: string, marcar: boolean) => setSelected(current => { const next = new Set(current); if (marcar) next.add(key); else next.delete(key); return next; });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby={ids.title} data-minerador-architect-suggestions-dialog>
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <h2 id={ids.title} className="text-base font-semibold text-foreground">{ARCHITECT_SUGGESTIONS_LABEL} · {rotuloCor}</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">O Arquiteto só lê keyword. O que ele precisaria do Minerador — keyword nova, medição a gravar, Lógica — chega aqui. Você decide: “Trazer para o Minerador” importa, grava a medição já feita (sem consultar o Google Ads de novo) e roda a Lógica; aprovar e enviar é o “Aprovar e enviar” de sempre. Nada é pago; nada é excluído.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy && phase !== "loading"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar" title="Fechar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sugestões por cor" data-architect-suggestions-colors>
              <button type="button" onClick={() => escolherCor("all")} disabled={busy} aria-pressed={color === "all"} className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 ${color === "all" ? "border-module-accent bg-surface-subtle" : "border-divider hover:border-module-accent/40"}`}>
                Todas <span className="tabular-nums text-text-muted">{linhas.length}</span>
              </button>
              {(listing?.colors ?? []).map(summary => (
                <button key={summary.color ?? "sem-cor"} type="button" onClick={() => escolherCor(summary.color)} disabled={busy} aria-pressed={color === summary.color}
                  title={`${summary.pending} a decidir · ${summary.total} no total`} data-architect-suggestions-color={summary.color ?? "sem-cor"}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 ${color === summary.color ? "border-module-accent bg-surface-subtle" : "border-divider hover:border-module-accent/40"}`}>
                  {summary.color ? <EditorialGroupDot color={summary.color} /> : null}
                  {summary.color ? EDITORIAL_GROUP_COLOR_LABELS[summary.color] : "Sem cor"}
                  <span className="tabular-nums text-text-muted">{summary.pending}</span>
                </button>
              ))}
            </div>

            {phase === "loading" && !listing ? <p className="flex items-center gap-2 text-sm text-text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Lendo as sugestões…</p> : null}
            {loadError ? (
              <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6 text-danger">
                Não foi possível ler as sugestões: {loadError.message}
                <button type="button" onClick={() => void ler()} className={`${internalButton} ml-2`}>Tentar de novo</button>
              </div>
            ) : null}
            {listing && !visiveis.length ? <p className="text-sm text-text-muted">Nenhuma sugestão do Arquiteto em {rotuloCor} (últimos 30 dias).</p> : null}

            {refusal ? (
              <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-architect-suggestions-refusal>
                <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Nada foi gravado: {refusal.message}</p>
                {refusal.code === "ARCHITECT_SUGGESTIONS_STALE" ? <button type="button" onClick={() => { setRefusal(null); setPreview(null); void ler(); }} className={`${internalButton} mt-2`}>Reler as sugestões</button> : null}
              </div>
            ) : null}

            {result ? (
              <div role="status" className={`rounded-md border px-3 py-2 text-sm leading-6 ${result.readbackConfirmed && !result.results.some(item => item.outcome === "failed") ? "border-success/40" : "border-warning/40"}`} data-architect-suggestions-result>
                <p className={`flex items-center gap-2 font-semibold ${result.readbackConfirmed ? "text-success" : "text-warning"}`}>
                  {result.readbackConfirmed ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {result.readbackConfirmed ? "Gravado no Minerador e conferido na releitura." : "Gravado em parte: confira as linhas abaixo."}
                </p>
                <ul className="mt-2 divide-y divide-divider">
                  {result.results.map(item => <li key={item.key} className="py-1"><span className="text-keyword">{item.keyword}</span> — {OUTCOME_LABEL[item.outcome]}{item.reason ? <span className="text-text-muted"> · {item.reason}</span> : null}</li>)}
                </ul>
                {result.approveAndSendIds.length ? <p className="mt-2 text-foreground">Próximo passo: {result.approveAndSendIds.length} keyword(s) esperam o “Aprovar e enviar”.</p> : null}
              </div>
            ) : null}

            {preview ? (
              <section className="flex flex-col gap-2 rounded-md border border-divider p-3" data-architect-suggestions-preview>
                <h3 className="text-sm font-semibold text-foreground">Trazer para o Minerador ({preview.selected.length})</h3>
                <ul className="grid gap-1 text-sm leading-6">
                  {preview.selected.map(line => <li key={line.key}><span className="text-keyword">{line.keyword}</span> · {line.stateLabel} · destino “{line.targetTheme}”</li>)}
                </ul>
                {preview.notApplicable.length ? <p className="text-sm text-text-muted">Fora desta ação ({preview.notApplicable.length}): {preview.notApplicable.map(line => `“${line.keyword}” (${line.stateLabel})`).join("; ")}.</p> : null}
                <p className="text-sm text-text-muted">Grava no Minerador pelos núcleos de sempre e relê. Nenhuma keyword é aprovada nem enviada neste passo.</p>
              </section>
            ) : null}

            {visiveis.length ? (
              <ul className="divide-y divide-divider rounded-md border border-divider" data-architect-suggestions-list>
                {visiveis.map(line => (
                  <li key={line.key} className="flex items-start gap-3 px-3 py-2 text-sm leading-6" data-architect-suggestion-state={line.state}>
                    {line.applicable
                      ? <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.has(line.key)} disabled={busy || Boolean(preview)} onChange={event => alternar(line.key, event.target.checked)} aria-label={`Selecionar ${line.keyword}`} />
                      : <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    {line.color ? <EditorialGroupDot color={line.color} className="mt-2" /> : <span className="mt-2 inline-block h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="text-keyword">{line.keyword}</span>
                      <span className="text-text-muted"> · {line.kindLabel} · {line.volumeLabel}</span>
                      <span className="block text-foreground/85">Destino: “{line.targetTheme}” ({line.targetKind === "subject" ? "Assunto" : "publicado"}) · {line.stateLabel}</span>
                      <span className="block text-text-muted">{line.reason} <span className="text-text-muted">· {line.sourceLabel}</span></span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-divider px-4 py-3">
          <span className="mr-auto text-sm text-text-muted">{marcadas.length} marcada(s) de {aplicaveis.length} que esta caixa resolve</span>
          <button type="button" onClick={onClose} disabled={busy && phase !== "loading"} className={internalButton}>Fechar</button>
          {aMedir.length ? <button type="button" disabled={busy} onClick={() => onSelectInSheet({ color: color === "all" ? null : color, keywordIds: aMedir })} className={internalButton} title="Marca na planilha as keywords sem medição guardada: use o botão Volume de sempre (mostra a cota antes).">Marcar para medir ({aMedir.length})</button> : null}
          {aAprovar.length ? <button type="button" disabled={busy} onClick={() => onOpenApproveAndSend(aAprovar, `${ARCHITECT_SUGGESTIONS_LABEL} · ${rotuloCor} · ${aAprovar.length} keyword(s)`)} className={internalButton} data-architect-suggestions-approve>Aprovar e enviar ({aAprovar.length})</button> : null}
          {preview ? (
            <>
              <button type="button" onClick={() => setPreview(null)} disabled={busy} className={internalButton}>Voltar</button>
              <button type="button" onClick={() => void confirmar()} disabled={busy || !preview.selected.length} className={internalButtonPrimary} data-architect-suggestions-confirm>
                {phase === "applying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Confirmar e trazer ({preview.selected.length})
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void gerarPrevia()} disabled={busy || !marcadas.length} className={internalButtonPrimary} data-architect-suggestions-preview-button>
              {phase === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Trazer para o Minerador ({marcadas.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
