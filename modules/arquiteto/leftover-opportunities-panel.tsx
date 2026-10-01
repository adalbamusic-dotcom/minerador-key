"use client";

import React, { useId, useRef, useState } from "react";
import { useSubjectDialogFocus } from "./subject-panels";
import type { LeftoverOpportunitiesView, LeftoverOpportunityGroupView } from "./serp-subject-model";

/**
 * D2.3 — AS SOBRAS COMO OPORTUNIDADES DE ARTIGO NOVO.
 *
 * Pedido do dono (2026-09-27): as sobras aparecem agrupadas por tema, pelo
 * volume somado, com o nome da keyword principal do grupo. Cada grupo tem a
 * ação "Criar artigo novo com este grupo", nunca automática: confirmação,
 * gravação pelo mesmo writer da formação e releitura. Até 6 por grupo. A
 * sobra sem volume fica recolhida no fim, com a contagem.
 *
 * A tela não decide nada: os grupos vêm do domínio
 * (`groupLeftoverOpportunities`) e o texto do modelo. As classes de botão
 * chegam por prop, como nos outros painéis do Arquiteto.
 */

type ButtonClasses = { buttonClassName: string; primaryButtonClassName: string };

/** Quantos grupos aparecem antes de "Ver mais". */
const GRUPOS_VISIVEIS = 10;

function CreateGroupDialog({ group, selected, busy, onConfirm, onClose, buttonClassName, primaryButtonClassName }: {
  group: LeftoverOpportunityGroupView | null;
  selected: ReadonlySet<string>;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
} & ButtonClasses) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useSubjectDialogFocus(Boolean(group), dialogRef, onClose, !busy);
  if (!group) return null;
  const marcadas = group.members.filter(member => selected.has(member.keywordId));
  const principal = marcadas[0] ?? null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="architect-leftover-create-title"
        data-testid="architect-leftover-create-dialog"
        className="flex max-h-[86vh] w-full max-w-xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl outline-none"
      >
        <h2 id="architect-leftover-create-title" className="text-base font-semibold text-foreground">{`${group.actionLabel}: "${group.name}"`}</h2>
        <div className="grid gap-2 overflow-y-auto text-sm leading-6">
          <p className="text-text-muted">{`Silo "${group.siloLabel}". A principal é a de maior volume${principal ? `: "${principal.keyword}"` : ""}. O artigo nasce em revisão, como os outros da mesa.`}</p>
          <ul className="grid gap-1">
            {marcadas.map(member => <li key={member.keywordId} className="text-foreground">{`${member.keyword} · volume ${member.volumeLabel}`}</li>)}
          </ul>
          <p className="text-text-muted">Nada é gravado sem esta confirmação, e só a releitura confirma.</p>
          {!marcadas.length && <p className="text-warning">Marque ao menos uma keyword do grupo.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={buttonClassName}>Cancelar</button>
          <button type="button" disabled={busy || !marcadas.length} onClick={onConfirm} className={primaryButtonClassName} data-testid="architect-leftover-create-confirm">
            {busy ? "Criando…" : `Criar com ${marcadas.length}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function OpportunityGroup({ group, busy, onCreate, primaryButtonClassName }: {
  group: LeftoverOpportunityGroupView;
  busy: boolean;
  onCreate: (group: LeftoverOpportunityGroupView, selected: ReadonlySet<string>) => void;
  primaryButtonClassName: string;
}) {
  /*
   * Guarda só o que a pessoa DESMARCOU. Guardar as marcadas congelava o grupo
   * do primeiro render: keyword que entrava no grupo depois (a SERP do cache
   * chega depois) aparecia desmarcada sem ninguém ter tocado nela.
   */
  const [desmarcadas, setDesmarcadas] = useState<ReadonlySet<string>>(() => new Set());
  const marcadas: ReadonlySet<string> = new Set(group.members.map(member => member.keywordId).filter(id => !desmarcadas.has(id)));
  const grupoId = useId();
  const alternar = (keywordId: string) => setDesmarcadas(atual => {
    const proximo = new Set(atual);
    if (proximo.has(keywordId)) proximo.delete(keywordId); else proximo.add(keywordId);
    return proximo;
  });
  return (
    <li className="rounded-md border border-divider bg-surface p-3" data-testid="architect-leftover-group">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={grupoId} className="text-base font-semibold text-keyword">{group.name}</p>
        <span className="text-sm text-text-muted">{`${group.totalVolumeLabel} · Silo "${group.siloLabel}"`}</span>
      </div>
      <p className="text-sm leading-6 text-text-muted">{group.reason}</p>
      <ul className="mt-1 grid gap-1" aria-labelledby={grupoId}>
        {group.members.map(member => {
          const id = `${grupoId}-${member.keywordId}`;
          return (
            <li key={member.keywordId} className="flex items-start gap-2 text-sm leading-6">
              <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0" disabled={busy} checked={marcadas.has(member.keywordId)} onChange={() => alternar(member.keywordId)} />
              <label htmlFor={id} className="min-w-0">
                <span className="font-medium text-keyword">{member.keyword}</span>
                <span className="text-text-muted">{` · volume ${member.volumeLabel}${member.leader ? " · principal" : ` · ${member.reason}`}`}</span>
                {member.warning && <span className="block text-warning">{member.warning}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <button type="button" disabled={busy || !marcadas.size} onClick={() => onCreate(group, marcadas)} className={primaryButtonClassName} data-testid="architect-leftover-create">
          {group.actionLabel}
        </button>
      </div>
    </li>
  );
}

export function LeftoverOpportunitiesPanel({ view, busy, onCreateArticle, onDismiss, buttonClassName, primaryButtonClassName }: {
  view: LeftoverOpportunitiesView;
  busy: boolean;
  /** Só depois da confirmação: grava pela formação e relê. */
  onCreateArticle: (input: { siloRef: string; keywordIds: string[]; principalKeywordId: string; name: string }) => Promise<void> | void;
  /**
   * "Descartar sobras" (pedido do dono, 2026-09-30): tira as oportunidades da
   * tela. Não apaga nem move keyword: elas seguem em Keywords não agrupadas.
   */
  onDismiss?: () => void;
} & ButtonClasses) {
  const [todos, setTodos] = useState(false);
  const [confirmando, setConfirmando] = useState<{ group: LeftoverOpportunityGroupView; selected: ReadonlySet<string> } | null>(null);
  const tituloId = useId();
  const visiveis = todos ? view.groups : view.groups.slice(0, GRUPOS_VISIVEIS);
  if (!view.groups.length && !view.withoutVolume.length) return null;
  return (
    <section className="border-b border-divider bg-surface-subtle px-4 py-4" data-testid="architect-leftover-opportunities" aria-labelledby={tituloId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={tituloId} className="text-sm font-bold uppercase tracking-widest text-context-accent">Sobras · oportunidades de artigo novo</h2>
        {onDismiss && (
          <button type="button" disabled={busy} onClick={onDismiss} className={buttonClassName} data-testid="architect-leftover-dismiss"
            title="Tira as sobras da tela. Nenhuma keyword é apagada: elas continuam em Keywords não agrupadas.">
            Descartar sobras
          </button>
        )}
      </div>
      <p className="mt-1 text-sm leading-6 text-foreground">{view.headline}</p>
      <p className="mt-0.5 text-sm leading-6 text-text-muted">Agrupadas por tema, pelo volume somado. Nenhum artigo nasce sozinho: você escolhe o grupo e confirma.</p>
      {visiveis.length > 0 && (
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {visiveis.map(group => (
            <OpportunityGroup
              key={group.key}
              group={group}
              busy={busy}
              onCreate={(alvo, selected) => setConfirmando({ group: alvo, selected })}
              primaryButtonClassName={primaryButtonClassName}
            />
          ))}
        </ul>
      )}
      {view.groups.length > GRUPOS_VISIVEIS && (
        <button type="button" onClick={() => setTodos(atual => !atual)} className={`${buttonClassName} mt-2`} aria-expanded={todos}>
          {todos ? "Ver menos" : `Ver todos os temas (${view.groups.length})`}
        </button>
      )}
      {view.withoutVolume.length > 0 && (
        <details className="mt-3 rounded-md border border-divider bg-surface p-3" data-testid="architect-leftover-without-volume">
          <summary className="cursor-pointer text-sm font-semibold text-text-muted">{`Sem volume · ${view.withoutVolume.length}`}</summary>
          <p className="mt-1 text-sm leading-6 text-text-muted">Sem volume não reforça nem forma artigo. Elas continuam aqui, sem sumir.</p>
          <ul className="mt-1 grid gap-0.5 text-sm leading-6 text-text-muted">
            {view.withoutVolume.map(item => <li key={item.keywordId}>{`${item.keyword} · ${item.siloLabel}`}</li>)}
          </ul>
        </details>
      )}
      <CreateGroupDialog
        group={confirmando?.group ?? null}
        selected={confirmando?.selected ?? new Set()}
        busy={busy}
        onClose={() => setConfirmando(null)}
        onConfirm={() => {
          const alvo = confirmando;
          if (!alvo) return;
          const ids = alvo.group.members.filter(member => alvo.selected.has(member.keywordId)).map(member => member.keywordId);
          void (async () => {
            await onCreateArticle({ siloRef: alvo.group.siloRef, keywordIds: ids, principalKeywordId: ids[0], name: alvo.group.name });
            setConfirmando(null);
          })();
        }}
        buttonClassName={buttonClassName}
        primaryButtonClassName={primaryButtonClassName}
      />
    </section>
  );
}
