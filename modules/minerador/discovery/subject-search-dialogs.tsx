"use client";

import { useEffect, useRef, type RefObject } from "react";
import { LoaderCircle } from "lucide-react";
import { SUBJECT_DISCOVERY_NOTICES, SUBJECT_DISCOVERY_SERP_LABEL } from "@/lib/minerador/subject-discovery-plan";
import {
  SUBJECT_SEARCH_FREE_PLAN_TEXT,
  SUBJECT_SEARCH_PLAN_TEXT,
  SUBJECT_SEARCH_VOLUME_REMEASURE_TEXT,
  formatSubjectSearchUsd,
  subjectSearchLensName,
  subjectSearchOriginLabel,
  subjectSearchSelectedWithoutVolumeText,
} from "./subject-search-model";
import type { SubjectSearchController } from "./use-subject-search";

/**
 * Diálogos da Pesquisa por Assunto (SDD 2026-09-24, F1b.4 e F1b.7).
 *
 * O plano do Arquiteto (`SerpPaidPlanDialog`) é por lente e oferece pagar só
 * parte; aqui o plano é por FONTE e é confirmado inteiro. Por isso o diálogo é
 * próprio, com a mesma superfície: sobreposição, `surface-elevated`, borda
 * `divider`, tabela compacta e os botões do Minerador.
 *
 * Desde 2026-09-28 o plano é só do Google Ads (frase e frase + página) e não
 * tem custo no DataForSEO: o diálogo mostra "Sem custo" e esconde as colunas
 * de preço e a SERP da frase, que só um plano antigo teria.
 */

const button = "inline-flex h-9 items-center justify-center gap-2 rounded border px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${button} border-action-accent bg-action-accent text-foreground hover:bg-action-accent/90`;
const neutralButton = `${button} border-border bg-surface text-text hover:border-text-muted hover:bg-surface-elevated`;

function useEscape(onEscape: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onEscape(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape, enabled]);
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Foco do diálogo modal (sistema visual: fechamento explícito e retorno ao
 * gatilho). Ao abrir, o foco entra no diálogo e o leitor de tela o anuncia; o
 * Tab fica contido nele, sem percorrer a página por trás; ao fechar, o foco
 * volta ao elemento que o abriu (o campo Assunto, o botão Pesquisar ou a
 * barra de envio).
 */
function useDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const active = document.activeElement;
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const outside = !(active instanceof Node) || !dialog.contains(active);
      if (event.shiftKey && (outside || active === first || active === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (outside || active === last)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, dialogRef]);
}

export function SubjectSearchPlanDialog({ controller }: { controller: SubjectSearchController }) {
  const state = controller.planState;
  const dialogRef = useRef<HTMLElement | null>(null);
  useEscape(controller.cancelPlan, Boolean(state) && !controller.executing);
  useDialogFocus(Boolean(state), dialogRef);
  if (!state) return null;
  const { plan } = state;
  const ledgerNotice = (notice: string) => !plan.ledgerRecording && notice.startsWith("Este custo não será registrado");
  // Plano v2 (só Google Ads): sem chamada paga. As colunas de preço e a SERP da
  // frase só aparecem num plano que ainda as tenha.
  const paid = plan.paidCalls > 0;
  const hasSerp = plan.serp.lenses.length > 0 || Boolean(plan.serp.readFailed);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="subject-search-plan-title" aria-describedby="subject-search-plan-summary" data-subject-search-plan className="flex max-h-[86vh] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none">
      <div className="min-w-0">
        <h2 id="subject-search-plan-title" className="text-base font-semibold text-foreground">{paid ? "Custo da Pesquisa por Assunto" : "Plano da Pesquisa por Assunto"}</h2>
        <p className="mt-1 text-sm leading-6 text-foreground">Assunto: <span className="font-semibold">{plan.phrase}</span></p>
        <p id="subject-search-plan-summary" className="text-sm leading-6 text-foreground" data-subject-search-plan-total>
          {paid
            ? <>Custo máximo: <strong>{formatSubjectSearchUsd(plan.maxCostUsd)}</strong> · {plan.paidCalls} chamada(s) paga(s) · teto por pesquisa {formatSubjectSearchUsd(plan.hardCapUsd)}</>
            : <><strong>{SUBJECT_SEARCH_FREE_PLAN_TEXT}</strong> · {plan.lines.length} consulta(s) ao Google Ads</>}
        </p>
        {state.message && <p className="mt-1 text-sm leading-6 text-warning" role="status">{state.message}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-divider">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-text-muted">
            <tr>
              <th scope="col" className="px-2 py-1 font-semibold">Fonte</th>
              <th scope="col" className="px-2 py-1 font-semibold">Consultas</th>
              {paid && <th scope="col" className="px-2 py-1 font-semibold">Por chamada</th>}
              {paid && <th scope="col" className="px-2 py-1 font-semibold">Por item</th>}
              <th scope="col" className="px-2 py-1 font-semibold">Itens máx.</th>
              <th scope="col" className="px-2 py-1 font-semibold">{paid ? "Custo máximo" : "Custo"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider/70">
            {plan.lines.map(line => <tr key={line.kind}>
              <td className="px-2 py-1 text-foreground">{line.kind === "serp_phrase" ? SUBJECT_DISCOVERY_SERP_LABEL : subjectSearchOriginLabel(line.kind)}</td>
              <td className="px-2 py-1 text-foreground/85">{line.kind === "labs_ranked" ? `até ${line.calls}` : line.calls}</td>
              {paid && <td className="px-2 py-1 text-foreground/85">{line.free ? "Grátis" : formatSubjectSearchUsd(line.pricePerTaskUsd)}</td>}
              {paid && <td className="px-2 py-1 text-foreground/85">{line.free || !line.pricePerItemUsd ? "—" : formatSubjectSearchUsd(line.pricePerItemUsd)}</td>}
              <td className="px-2 py-1 text-foreground/85">{line.maxItemsPerCall}</td>
              <td className="px-2 py-1 text-foreground">{line.free ? "Sem custo (só roda depois de confirmar)" : formatSubjectSearchUsd(line.maxCostUsd)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 text-sm leading-6">
        {hasSerp && <p className="text-foreground/85" data-subject-search-plan-serp>
          {plan.serp.readFailed
            ? "Resultados do Google para a frase: o cache não pôde ser lido. A SERP não é paga e a fonte das páginas do topo fica de fora."
            : `Resultados do Google para a frase: ${plan.serp.cachedLenses.length} de 4 lentes no cache (0 pagas)${plan.serp.missingLenses.length ? ` · a pagar: ${plan.serp.missingLenses.map(subjectSearchLensName).join(", ")}` : ""}.`}
        </p>}
        {plan.notApplicable.map(item => <p key={item.kind} className="text-text-muted">Fora desta pesquisa · {item.kind === "serp_phrase" ? SUBJECT_DISCOVERY_SERP_LABEL : subjectSearchOriginLabel(item.kind)}: {item.reason}</p>)}
        {/* O resumo acima já diz "sem custo no DataForSEO": o aviso igual do plano não se repete aqui. */}
        {plan.notices.filter(notice => paid || notice !== SUBJECT_DISCOVERY_NOTICES.free).map(notice => <p key={notice} className={ledgerNotice(notice) ? "text-warning" : "text-text-muted"}>{notice}</p>)}
        {paid && <p className="text-text-muted">Preços do DataForSEO consultados em {plan.prices.consultedAt.split("-").reverse().join("/")}; o custo real vem de cada consulta e nunca passa do máximo confirmado.</p>}
        <p className="text-foreground/85">{SUBJECT_SEARCH_PLAN_TEXT}</p>
      </div>

      {controller.planError && <p className="rounded border border-danger/45 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger" role="alert">{controller.planError}</p>}

      <div className="flex shrink-0 flex-col-reverse justify-end gap-2 sm:flex-row">
        <button type="button" onClick={controller.cancelPlan} disabled={controller.executing} className={`${neutralButton} w-full sm:w-auto`}>Cancelar</button>
        <button type="button" onClick={() => void controller.confirmPlan()} disabled={controller.executing || state.blocked} aria-busy={controller.executing} className={`${primaryButton} w-full sm:w-auto`}>
          {controller.executing && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {controller.executing ? "Pesquisando..." : "Confirmar e pesquisar"}
        </button>
      </div>
    </section>
  </div>;
}

/**
 * 2026-10-13 · cadastro único (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`):
 * a Pesquisa por Assunto não declara mais a frase pesquisada. Sem Assunto
 * cadastrado, as keywords entram sem vínculo — e a tela diz isso. O ramo de
 * declaração (inalcançável desde então) saiu na F1 da linha única (2026-10-16).
 */
export const SUBJECT_SEARCH_CADASTRO_HINT = "Esta frase não é um Assunto cadastrado: as keywords entram sem vínculo com Assunto. Para ligá-las a um Assunto, cadastre-o em \"Cadastrar Assuntos\" (o Assunto mora na keyword) e pesquise a partir dele." as const;

export function SubjectSearchImportDialog({ controller, selectedKeys, selectedItemCount, selectedWithoutVolume = 0, subjectPhraseSelected }: { controller: SubjectSearchController; selectedKeys: ReadonlySet<string>; selectedItemCount: number; selectedWithoutVolume?: number; subjectPhraseSelected: boolean }) {
  const dialog = controller.importDialog;
  const record = controller.activeRecord;
  const dialogRef = useRef<HTMLElement | null>(null);
  useEscape(controller.closeImport, Boolean(dialog) && !dialog?.submitting);
  useDialogFocus(Boolean(dialog && record), dialogRef);
  if (!dialog || !record) return null;
  const subject = record.result.subject;
  const done = Boolean(dialog.result);
  // D2.3: avisa, sem bloquear. Quem decide o envio é o dono.
  const withoutVolumeText = subjectSearchSelectedWithoutVolumeText(selectedWithoutVolume);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="subject-search-import-title" data-subject-search-import className="flex max-h-[86vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none">
      <div className="min-w-0">
        <h2 id="subject-search-import-title" className="text-base font-semibold text-foreground">Enviar ao Processador</h2>
        <p className="mt-1 text-sm leading-6 text-foreground">{selectedItemCount} keyword(s) de sustentação selecionada(s) para o Assunto <span className="font-semibold">{subject.phrase}</span>.</p>
        {subjectPhraseSelected && <p className="text-sm leading-6 text-text-muted">A própria frase do Assunto não entra como keyword de sustentação.</p>}
        {withoutVolumeText && <p className="mt-1 text-sm leading-6 text-warning" role="status" data-subject-search-import-without-volume>{withoutVolumeText}</p>}
      </div>

      {subject.subjectKeywordId
        ? <p className="text-sm leading-6 text-foreground/85">As keywords entram ligadas a este Assunto declarado.</p>
        : dialog.declaredId
          ? <p className="text-sm leading-6 text-foreground/85">A frase já foi declarada como Assunto num envio anterior desta busca: as keywords entram ligadas a ela.</p>
          : <p className="text-sm leading-6 text-text-muted" data-subject-search-cadastro-hint>{SUBJECT_SEARCH_CADASTRO_HINT}</p>}

      <div className="space-y-1 text-sm leading-6 text-text-muted">
        <p className="text-foreground/85">{SUBJECT_SEARCH_VOLUME_REMEASURE_TEXT}</p>
        <p>Nenhuma métrica desta lista vai ao banco: nem o volume do Google Ads nem, em buscas antigas, a estimativa DataForSEO.</p>
        <p>Keywords que já existem e têm registro de aprovação não recebem a origem desta pesquisa, para não sair da aprovação.</p>
      </div>

      {dialog.error && <p className="rounded border border-danger/45 bg-danger-soft px-3 py-2 text-sm leading-6 text-danger" role="alert">{dialog.error}</p>}

      {dialog.result && <div className="space-y-2 rounded border border-divider bg-surface-subtle p-3 text-sm leading-6" role="status" data-subject-search-import-result>
        <p className="text-foreground">
          {dialog.result.counts.created} criada(s) · {dialog.result.counts.recorded} já existia(m) e receberam a origem · {dialog.result.counts.alreadyRecorded} já tinha(m) esta busca · {dialog.result.counts.notAffected} sem a origem gravada · {dialog.result.counts.failed} falha(s).
        </p>
        {dialog.result.declaredSubjectKeywordId && !subject.subjectKeywordId && <p className="text-foreground/85">A frase está declarada como Assunto, e as keywords enviadas estão ligadas a ela.</p>}
        {dialog.result.subject.reason && <p className="text-warning">{dialog.result.subject.reason}</p>}
        {dialog.result.notAffected.length > 0 && <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-text-muted">
          {dialog.result.notAffected.map(row => <li key={`${row.index}-${row.normalizedKeyword}`}><span className="text-keyword">{row.keyword}</span>: {row.reason}</li>)}
        </ul>}
      </div>}

      <div className="flex shrink-0 flex-col-reverse justify-end gap-2 sm:flex-row">
        <button type="button" onClick={controller.closeImport} disabled={dialog.submitting} className={`${neutralButton} w-full sm:w-auto`}>{done ? "Fechar" : "Cancelar"}</button>
        {!done && <button type="button" onClick={() => void controller.confirmImport(selectedKeys)} disabled={dialog.submitting || !selectedItemCount} aria-busy={dialog.submitting} className={`${primaryButton} w-full sm:w-auto`}>
          {dialog.submitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {dialog.submitting ? "Enviando..." : "Confirmar envio"}
        </button>}
      </div>
    </section>
  </div>;
}
