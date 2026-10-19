"use client";

import type { KeywordDeleteColorView, KeywordDeleteOut } from "@/lib/minerador/keyword-delete-core";

/**
 * O que a prévia da exclusão de sempre diz além do impacto (2026-10-17; SDD da
 * linha única do Minerador, P-4): o efeito (apagada de vez × lixeira de 24 h),
 * o plano do Silo de cada cor tocada — os Assuntos que saem do plano, o plano
 * depois, se a cor fica livre e o que acontece no Arquiteto (o mesmo aviso de
 * "Excluir tudo da cor") — e o que fica fora, com o motivo e o caminho. Só
 * mostra: não grava, não chama o servidor. Entra no diálogo de sempre
 * (`DeleteConfirmation` / `PublishedDeleteConfirmation`) pela prop `details`.
 */
export function KeywordDeleteDetails({ effects, out, colors, unavailableMessage }: {
  effects: readonly string[];
  out: readonly KeywordDeleteOut[];
  colors: readonly Pick<KeywordDeleteColorView, "groupId" | "colorLabel" | "preview">[];
  unavailableMessage: string | null;
}) {
  const comPlano = colors.filter(cor => cor.preview.releasedSubjects.length > 0);
  if (!effects.length && !out.length && !comPlano.length && !unavailableMessage) return null;
  return (
    <div className="space-y-3" data-keyword-delete-details>
      {unavailableMessage ? <p className="rounded-md border border-warning/40 p-3 text-sm leading-5 text-warning" role="status" data-keyword-delete-unavailable>{unavailableMessage}</p> : null}
      {effects.length ? <ul className="list-disc space-y-1 pl-5 text-sm leading-5 text-text-muted" data-keyword-delete-effects>{effects.map(efeito => <li key={efeito}>{efeito}</li>)}</ul> : null}
      {comPlano.map(cor => (
        <details key={cor.groupId} className="rounded-md border border-divider" data-keyword-delete-plan={cor.groupId}>
          <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/40">
            <span>Saem do plano do Silo · cor {cor.colorLabel}</span>
            <span className="tabular-nums text-text-muted">{cor.preview.releasedSubjects.length}</span>
          </summary>
          <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-divider px-3 py-2 text-sm">
            {cor.preview.releasedSubjects.map(item => (
              <li key={item.keywordId} className="break-words">{item.order ? <span className="tabular-nums text-text-muted">{item.order}º · </span> : null}{item.role ? <span className="text-text-muted">{item.role} · </span> : null}{item.title}</li>
            ))}
          </ul>
        </details>
      ))}
      {out.length ? (
        <details open={out.length <= 5} className="rounded-md border border-divider" data-keyword-delete-out>
          <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent/40">
            <span>Ficam fora (com o motivo)</span>
            <span className="tabular-nums text-text-muted">{out.length}</span>
          </summary>
          <ul className="max-h-48 space-y-2 overflow-y-auto border-t border-divider px-3 py-2">
            {out.map(item => (
              <li key={`${item.id}:${item.reason}`} className="text-sm" data-keyword-delete-out-reason={item.reason}>
                <span className="break-words font-medium text-keyword">{item.keyword}</span>
                <span className="block text-text-muted">{item.message}</span>
                {item.path ? <span className="block text-text-muted">Caminho: {item.path}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
