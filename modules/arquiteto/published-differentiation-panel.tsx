"use client";

import React, { useId, useRef, useState } from "react";
import { useSubjectDialogFocus } from "./subject-panels";
import { SERP_SUBJECT_TONE_CLASSES } from "./serp-subject-model";
import {
  DIFFERENTIATION_ACCEPT_ACTION,
  DIFFERENTIATION_AI_OPTION,
  DIFFERENTIATION_INCLUDE_OPTION,
  DIFFERENTIATION_KEEP_ACTION,
  DIFFERENTIATION_PANEL_TITLE,
  DIFFERENTIATION_PLAN_ACTION,
  DIFFERENTIATION_REACCEPT_ACTION,
  DIFFERENTIATION_REPLAN_ACTION,
  DIFFERENTIATION_RUN_STATUS_LABELS,
  acceptPreviewLines,
  costRangeLabel,
  differentiationApplyView,
  differentiationEvaluationView,
  differentiationGroupRowView,
  differentiationHeadline,
  differentiationPlanView,
  formatUsd,
  keepPreviewLines,
  runActionLabel,
  type DifferentiationEvaluationView,
} from "./published-differentiation-model";
import {
  usePublishedDifferentiation,
  type DifferentiationAddToArticle,
  type DifferentiationGroupEntry,
  type PublishedDifferentiationController,
} from "./use-published-differentiation";
import type { CompactDifferentiationGroup } from "@/lib/arquiteto/published-differentiation";
import { DIFFERENTIATION_MAX_COST_USD } from "@/lib/arquiteto/published-differentiation-run";

/**
 * PUBLICADOS QUE DISPUTAM O MESMO ASSUNTO — O PAINEL (SDD 2026-09-27 §3 e §5).
 *
 * Uma linha por grupo (publicados, páginas em comum, Posto e quem ranqueia),
 * checkbox por grupo, "Planejar diferenciação" (grátis) com os ângulos e a
 * faixa de custo, "Buscar e validar (US$ x a y)" com UMA confirmação para os
 * grupos marcados e o progresso de cada um, a proposta por página e, por
 * grupo, "Aceitar grupo" (confirmação e releitura, só as páginas marcadas em
 * "Incluir no aceite") ou "Manter como está" (confirmação). Grupo já avaliado
 * reabre o resultado gravado sem cobrar; "Planejar nova rodada" pede outra.
 *
 * O painel não chama rede: as chamadas moram no hook. As classes de botão
 * chegam por prop, como nos outros painéis do Arquiteto.
 */

type ButtonClasses = { buttonClassName: string; primaryButtonClassName: string };

const badgeBase = "inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-sm font-medium";

function ConfirmDialog({ title, lines, confirmLabel, busy, onConfirm, onClose, buttonClassName, primaryButtonClassName, testId }: {
  title: string;
  lines: readonly string[];
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  testId: string;
} & ButtonClasses) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useSubjectDialogFocus(true, dialogRef, onClose, !busy);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} data-testid={testId} className="flex max-h-[86vh] w-full max-w-xl flex-col gap-3 overflow-auto rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <ul className="grid gap-1 text-sm leading-6 text-foreground/85">
          {lines.map(line => <li key={line}>{line}</li>)}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={buttonClassName}>Cancelar</button>
          <button type="button" disabled={busy} onClick={onConfirm} className={primaryButtonClassName} data-testid={`${testId}-confirm`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function EvaluationBlock({ view, locked, onToggle }: { view: DifferentiationEvaluationView; locked: boolean; onToggle: (pageKeywordId: string) => void }) {
  return (
    <div className="mt-2 grid gap-2" data-testid="architect-differentiation-evaluation">
      <p className="flex flex-wrap items-center gap-2 text-sm leading-6">
        <span className={`${badgeBase} ${SERP_SUBJECT_TONE_CLASSES[view.tone].badge}`}>{view.stateLabel}</span>
        <span className="text-foreground/85">{view.reason}</span>
      </p>
      <p className="text-sm text-text-muted">{view.costLabel}</p>
      <ul className="grid gap-2">
        {view.pages.map(page => (
          <li key={page.keywordId} className={`border-l-2 pl-2 text-sm leading-6 ${SERP_SUBJECT_TONE_CLASSES[page.tone].accent}`}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-keyword">{page.keyword}</span>
              <span className={`${badgeBase} ${SERP_SUBJECT_TONE_CLASSES[page.tone].badge}`}>{page.stateLabel}</span>
              <label className="inline-flex cursor-pointer items-center gap-2 text-foreground/85">
                <input type="checkbox" checked={page.included} disabled={locked} onChange={() => onToggle(page.keywordId)} className="h-4 w-4 shrink-0" data-testid="architect-differentiation-include" />
                {DIFFERENTIATION_INCLUDE_OPTION}{page.noteOnly ? " (só a nota)" : ""}
              </label>
            </p>
            <p className="text-foreground/85">Ângulo: {page.angle}. {page.reason}</p>
            {page.newPrincipal ? (
              <p className="text-foreground/85">Principal nova: <span className="text-keyword">{page.newPrincipal.keyword}</span> ({page.newPrincipal.volumeLabel})</p>
            ) : page.principalNote ? <p className="text-text-muted">{page.principalNote}</p> : null}
            {page.secondaries.length > 0 && (
              <p className="text-foreground/85">
                Secundárias:{" "}
                {page.secondaries.map((item, index) => (
                  <span key={item.keyword}>{index > 0 ? ", " : ""}<span className="text-keyword">{item.keyword}</span> ({item.volumeLabel})</span>
                ))}
              </p>
            )}
            {page.siblings.map(sibling => (
              <p key={sibling.keyword} className="text-text-muted">
                Páginas em comum com &quot;{sibling.keyword}&quot;: {sibling.before} → {sibling.after ?? "sem medida"}
              </p>
            ))}
            {page.bestEffort && <p className="text-text-muted">Melhor possível, só como evidência (não entra no aceite): <span className="text-keyword">{page.bestEffort.keyword}</span> ({page.bestEffort.volumeLabel})</p>}
            {page.warning && <p className="text-warning">{page.warning}</p>}
          </li>
        ))}
      </ul>
      {view.notices.map(notice => <p key={notice} className="text-sm text-text-muted">{notice}</p>)}
    </div>
  );
}

function AppliedBlock({ controller, group, entry, buttonClassName, onReaccept }: { controller: PublishedDifferentiationController; group: CompactDifferentiationGroup; entry: DifferentiationGroupEntry; buttonClassName: string; onReaccept: (groupId: string) => void }) {
  if (!entry.accepted) return null;
  const view = differentiationApplyView(entry.accepted);
  return (
    <div className="mt-2 grid gap-1 rounded border border-divider p-2 text-sm leading-6" data-testid="architect-differentiation-applied">
      <p className={view.tone === "success" ? "text-success" : view.tone === "warning" ? "text-warning" : "text-foreground/85"}>{view.headline}</p>
      {view.lines.map(line => <p key={line} className="text-text-muted">{line}</p>)}
      {view.ingestCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground/85">{view.ingestCount} keyword(s) nova(s) precisam passar pelo Minerador.</span>
          <button type="button" disabled={controller.busy || entry.ingest.status === "done"} onClick={() => void controller.sendIngest(group.groupId)} className={buttonClassName} data-testid="architect-differentiation-ingest">
            {entry.ingest.status === "sending" ? "Enviando…" : "Enviar ao Minerador"}
          </button>
        </div>
      )}
      {entry.ingest.message && <p className={entry.ingest.status === "failed" ? "text-warning" : "text-text-muted"}>{entry.ingest.message}</p>}
      {view.formation.map(step => {
        const estado = entry.formation[step.pageKeywordId];
        return (
          <div key={step.pageKeywordId} className="flex flex-wrap items-center gap-2">
            <span className="text-foreground/85">
              Colocar em &quot;{step.pageKeyword}&quot;: {step.keywords.map((keyword, index) => <span key={keyword}>{index > 0 ? ", " : ""}<span className="text-keyword">{keyword}</span></span>)}
            </span>
            {controller.canAddToArticle && (
              <button type="button" disabled={controller.busy || estado?.status === "done"} onClick={() => void controller.addToArticle(group.groupId, step.pageKeywordId, step.keywordIds)} className={buttonClassName} data-testid="architect-differentiation-formation">
                {estado?.status === "sending" ? "Gravando…" : "Colocar no artigo"}
              </button>
            )}
            {estado?.message && <span className={estado.status === "failed" ? "text-warning" : "text-text-muted"}>{estado.message}</span>}
          </div>
        );
      })}
      {view.needsSecondAccept && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-muted">Depois desses passos, use &quot;{DIFFERENTIATION_REACCEPT_ACTION}&quot;: a troca da principal só grava com a keyword já no artigo. Nada é pago de novo.</span>
          <button type="button" disabled={controller.busy} onClick={() => onReaccept(group.groupId)} className={buttonClassName} data-testid="architect-differentiation-reaccept">
            {DIFFERENTIATION_REACCEPT_ACTION}
          </button>
        </div>
      )}
    </div>
  );
}

function GroupRow({ controller, group, onAccept, onKeep, buttonClassName, primaryButtonClassName }: { controller: PublishedDifferentiationController; group: CompactDifferentiationGroup; onAccept: (groupId: string) => void; onKeep: (groupId: string) => void } & ButtonClasses) {
  const id = useId();
  const row = differentiationGroupRowView(group);
  const entry = controller.entries[group.groupId];
  const checked = controller.selected.includes(group.groupId);
  const plan = entry?.plan ? differentiationPlanView(entry.plan) : null;
  const evaluation = entry?.run ? differentiationEvaluationView(entry.run, group, entry.acceptPages) : null;
  // A prévia já foi usada (avaliação gravada ou rodada em andamento): só uma nova rodada, pedida aqui.
  const usada = Boolean(entry?.run) || Boolean(entry?.plan && entry.plan.proposal.state !== "planned");
  const avaliado = group.proposal?.hasRun || group.proposal?.state === "running";
  const status = entry?.runStatus && entry.runStatus !== "idle" ? DIFFERENTIATION_RUN_STATUS_LABELS[entry.runStatus] : null;
  return (
    <li className="border-t border-divider/70 pt-3" data-testid="architect-differentiation-group">
      <div className="flex flex-wrap items-start gap-2">
        <input id={id} type="checkbox" checked={checked} disabled={controller.busy} onChange={() => controller.toggle(group.groupId)} className="mt-1 h-4 w-4 shrink-0" />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm leading-6">
          <span className="font-semibold text-foreground">{row.title}</span>
          <span className="text-text-muted"> · {row.sharedLabel}</span>
        </label>
        {status && <span className={`${badgeBase} ${entry?.runStatus === "failed" ? SERP_SUBJECT_TONE_CLASSES.warning.badge : entry?.runStatus === "done" ? SERP_SUBJECT_TONE_CLASSES.success.badge : SERP_SUBJECT_TONE_CLASSES.info.badge}`} aria-live="polite">{status}</span>}
        {!entry?.plan && avaliado && <span className={`${badgeBase} ${SERP_SUBJECT_TONE_CLASSES.info.badge}`}>{group.proposal?.state === "running" ? "Busca em andamento" : "Já buscado: planejar reabre o resultado, sem custo"}</span>}
      </div>
      <ul className="mt-1 grid gap-1 pl-6 text-sm leading-6">
        {row.members.map(member => (
          <li key={member.keywordId} className="flex flex-wrap items-center gap-x-2">
            <span className="text-keyword">{member.keyword}</span>
            <span className="text-text-muted">· {member.volumeLabel} · Posto {member.postLabel} ·</span>
            <span className={member.ranks ? "text-warning" : "text-text-muted"}>{member.rankingLabel}</span>
            {!member.hasArticle && <span className="text-text-muted">· sem DNA do artigo</span>}
          </li>
        ))}
      </ul>
      {row.pairs.length > 1 && <p className="pl-6 text-sm text-text-muted">{row.pairs.join(" · ")}</p>}
      {row.note && <p className="pl-6 text-sm text-text-muted">{row.note}</p>}
      {entry?.planning && <p className="pl-6 text-sm text-text-muted">Planejando…</p>}
      {entry?.planError && <p className="pl-6 text-sm text-warning">{entry.planError}</p>}
      {entry?.plan?.stale && <p className="pl-6 text-sm text-warning">A SERP do grupo mudou desde esta prévia: para buscar de novo, use &quot;{DIFFERENTIATION_REPLAN_ACTION}&quot;.</p>}
      {entry?.run?.replayed && <p className="pl-6 text-sm text-text-muted">Resultado gravado da última busca, relido sem custo.</p>}

      {plan && !evaluation && (
        <div className="mt-2 grid gap-1 pl-6 text-sm leading-6" data-testid="architect-differentiation-plan">
          {plan.angles.map(angle => (
            <p key={angle.keywordId} className={angle.inRound ? "text-foreground/85" : "text-text-muted"}>
              <span className="text-keyword">{angle.keyword}</span> → ângulo: {angle.angle}
              <span className="text-text-muted"> ({angle.sources})</span>
              {!angle.inRound ? " · fora desta rodada pelo teto" : ""}
            </p>
          ))}
          <p className={plan.withinCap ? "text-foreground/85" : "text-warning"}>Custo: {plan.costLabel}. {plan.capLabel} Cache válido não cobra.</p>
          {plan.cuts.map(cut => <p key={cut} className="text-text-muted">Corte: {cut}</p>)}
          {plan.notices.map(notice => <p key={notice} className="text-text-muted">{notice}</p>)}
          {plan.aiNotes.map(note => <p key={note} className="text-text-muted">IA: {note}</p>)}
        </div>
      )}
      {entry?.runError && (
        <div className="flex flex-wrap items-center gap-2 pl-6 text-sm">
          <span className="text-warning">{entry.runError}</span>
          {entry.retryOperationId && (
            <button type="button" disabled={controller.busy} onClick={() => void controller.retryRun(group.groupId)} className={buttonClassName}>Tentar de novo</button>
          )}
        </div>
      )}

      {evaluation && (
        <div className="pl-6">
          <EvaluationBlock view={evaluation} locked={controller.busy || Boolean(entry?.accepted)} onToggle={pageKeywordId => controller.toggleAcceptPage(group.groupId, pageKeywordId)} />
          {!entry?.accepted && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" disabled={controller.busy || !evaluation.canAccept} onClick={() => onAccept(group.groupId)} className={primaryButtonClassName} data-testid="architect-differentiation-accept">
                {DIFFERENTIATION_ACCEPT_ACTION}
              </button>
              <button type="button" disabled={controller.busy} onClick={() => onKeep(group.groupId)} className={buttonClassName} data-testid="architect-differentiation-keep">
                {DIFFERENTIATION_KEEP_ACTION}
              </button>
              {evaluation.acceptBlockedReason && <span className="text-sm text-text-muted">{evaluation.acceptBlockedReason}</span>}
            </div>
          )}
        </div>
      )}
      {!evaluation && (
        <div className="mt-2 pl-6">
          <button type="button" disabled={controller.busy} onClick={() => onKeep(group.groupId)} className={buttonClassName} data-testid="architect-differentiation-keep">
            {DIFFERENTIATION_KEEP_ACTION}
          </button>
        </div>
      )}
      {usada && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          <button type="button" disabled={controller.busy} onClick={() => void controller.replan(group.groupId)} className={buttonClassName} data-testid="architect-differentiation-replan">
            {DIFFERENTIATION_REPLAN_ACTION}
          </button>
          <span className="text-sm text-text-muted">Prévia nova, grátis; a busca paga pede outra confirmação. A avaliação atual fica no histórico.</span>
        </div>
      )}
      {entry?.applying && <p className="pl-6 text-sm text-text-muted">Gravando e relendo…</p>}
      {entry?.applyError && <p className="pl-6 text-sm text-warning">{entry.applyError}</p>}
      <div className="pl-6">
        <AppliedBlock controller={controller} group={group} entry={entry || ({} as DifferentiationGroupEntry)} buttonClassName={buttonClassName} onReaccept={onAccept} />
      </div>
    </li>
  );
}

export function PublishedDifferentiationPanel({ controller, buttonClassName, primaryButtonClassName }: { controller: PublishedDifferentiationController } & ButtonClasses) {
  const aiId = useId();
  const [confirmRun, setConfirmRun] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState<string | null>(null);
  const [confirmKeep, setConfirmKeep] = useState<string | null>(null);
  const { detection, groups } = controller;

  if (detection.state === "idle") return null;
  if (detection.state === "loading" && !detection.data) {
    return <p className="border-b border-divider bg-surface-subtle px-4 py-3 text-sm text-text-muted" data-testid="architect-differentiation-loading">Procurando publicados que disputam o mesmo assunto (só o cache, sem custo)…</p>;
  }
  if (detection.state === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-divider bg-surface-subtle px-4 py-3 text-sm" data-testid="architect-differentiation-failed">
        <span className="text-warning">{DIFFERENTIATION_PANEL_TITLE}: {detection.error}</span>
        <button type="button" onClick={controller.reread} className={buttonClassName}>Tentar de novo</button>
      </div>
    );
  }
  if (!detection.data || (!groups.length && !detection.data.withoutSerp.length)) return null;

  const planosMarcados = controller.selected.map(id => ({ id, entry: controller.entries[id] })).filter(item => item.entry?.plan);
  const acceptEntry = confirmAccept ? controller.entries[confirmAccept] : null;
  const acceptGroup = confirmAccept ? groups.find(group => group.groupId === confirmAccept) : null;
  const acceptView = acceptEntry?.run && acceptGroup ? differentiationEvaluationView(acceptEntry.run, acceptGroup, acceptEntry.acceptPages) : null;
  const keepGroup = confirmKeep ? groups.find(group => group.groupId === confirmKeep) : null;

  return (
    <section className="border-b border-divider bg-surface-subtle px-4 py-4" data-testid="architect-published-differentiation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold uppercase tracking-widest text-text-muted">{DIFFERENTIATION_PANEL_TITLE} · {groups.length}</span>
        <button type="button" disabled={controller.busy || detection.state === "loading"} onClick={controller.reread} className={buttonClassName}>Reler</button>
      </div>
      <p className="mt-1 text-sm leading-6 text-text-muted">{differentiationHeadline(detection.data)}</p>

      {groups.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={controller.busy || !controller.selected.length} onClick={() => void controller.planSelected()} className={buttonClassName} data-testid="architect-differentiation-plan-action">
              {DIFFERENTIATION_PLAN_ACTION} (grátis)
            </button>
            <button type="button" disabled={!controller.readiness.ready} onClick={() => setConfirmRun(true)} className={primaryButtonClassName} data-testid="architect-differentiation-run-action">
              {runActionLabel(controller.selectedCost)}
            </button>
            <span className="inline-flex items-center gap-2 text-sm text-foreground/85">
              <input id={aiId} type="checkbox" checked={controller.useAi} disabled={controller.busy} onChange={event => controller.setUseAi(event.target.checked)} className="h-4 w-4 shrink-0" />
              <label htmlFor={aiId} className="cursor-pointer">{DIFFERENTIATION_AI_OPTION}</label>
            </span>
          </div>
          {controller.readiness.reason && controller.selected.length > 0 && <p className="mt-1 text-sm text-text-muted">{controller.readiness.reason}</p>}
          <ul className="mt-3 grid gap-3">
            {groups.map(group => (
              <GroupRow key={group.groupId} controller={controller} group={group} onAccept={setConfirmAccept} onKeep={setConfirmKeep} buttonClassName={buttonClassName} primaryButtonClassName={primaryButtonClassName} />
            ))}
          </ul>
        </>
      )}

      {confirmRun && controller.selectedCost && (
        <ConfirmDialog
          testId="architect-differentiation-run-dialog"
          title={`Buscar e validar ${planosMarcados.length} grupo(s)?`}
          lines={[
            ...planosMarcados.map(item => `${differentiationGroupRowView(groups.find(group => group.groupId === item.id) ?? item.entry!.plan!.group).title}: ${costRangeLabel(item.entry!.plan!.plan.costRange)}.`),
            `Total: ${costRangeLabel(controller.selectedCost)}. Teto de US$ ${formatUsd(DIFFERENTIATION_MAX_COST_USD)} por grupo, conferido no servidor.`,
            "As keywords novas vêm do Google Ads, sem custo. A parte paga é a SERP das candidatas (DataForSEO): o que já está no cache não é pago de novo. Keyword sem volume nunca é proposta.",
            "Nada é gravado nos artigos: depois você aceita ou mantém cada grupo.",
          ]}
          confirmLabel={`Confirmar ${costRangeLabel(controller.selectedCost)}`}
          busy={controller.busy}
          onClose={() => setConfirmRun(false)}
          onConfirm={() => { setConfirmRun(false); void controller.runConfirmed(); }}
          buttonClassName={buttonClassName}
          primaryButtonClassName={primaryButtonClassName}
        />
      )}
      {confirmAccept && acceptView && (
        <ConfirmDialog
          testId="architect-differentiation-accept-dialog"
          title={`${DIFFERENTIATION_ACCEPT_ACTION}?`}
          lines={acceptPreviewLines(acceptView)}
          confirmLabel="Gravar e reler"
          busy={controller.busy}
          onClose={() => setConfirmAccept(null)}
          onConfirm={() => { const alvo = confirmAccept; setConfirmAccept(null); void controller.accept(alvo); }}
          buttonClassName={buttonClassName}
          primaryButtonClassName={primaryButtonClassName}
        />
      )}
      {confirmKeep && keepGroup && (
        <ConfirmDialog
          testId="architect-differentiation-keep-dialog"
          title={`${DIFFERENTIATION_KEEP_ACTION}?`}
          lines={keepPreviewLines(keepGroup)}
          confirmLabel={DIFFERENTIATION_KEEP_ACTION}
          busy={controller.busy}
          onClose={() => setConfirmKeep(null)}
          onConfirm={() => { const alvo = confirmKeep; setConfirmKeep(null); void controller.keep(alvo); }}
          buttonClassName={buttonClassName}
          primaryButtonClassName={primaryButtonClassName}
        />
      )}
    </section>
  );
}

/** O painel com as chamadas: a mesa só passa a marca ativa e os dois atos que ela já sabe fazer. */
export function PublishedDifferentiationSection({ brandId, enabled, onApplied, onAddToArticle, buttonClassName, primaryButtonClassName }: {
  brandId: string | null;
  enabled: boolean;
  onApplied?: () => void;
  onAddToArticle?: DifferentiationAddToArticle;
} & ButtonClasses) {
  const controller = usePublishedDifferentiation({ brandId, enabled, onApplied, onAddToArticle });
  return <PublishedDifferentiationPanel controller={controller} buttonClassName={buttonClassName} primaryButtonClassName={primaryButtonClassName} />;
}
