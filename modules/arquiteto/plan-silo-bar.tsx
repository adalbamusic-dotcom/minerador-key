"use client";
import { EditorialGroupTag } from "@/components/editorial/group-tag";
import { PLAN_SILO_CONSOLIDATE_LABEL } from "@/lib/arquiteto/plan-article-sheet";
import type { PlanSiloStatus } from "@/lib/arquiteto/declared-plan-silo";
import type { EditorialGroupColor } from "@/lib/editorial/editorial-groups";
import type { PlanArticleSheetController } from "./plan-article-sheet";

/**
 * A BARRA DO SILO DO PLANO, NA ABA SILOS (2026-10-15, pedido do dono: "a
 * definição do silo já tem que estar na aba do Silo e não nos artigos").
 *
 * Uma linha por grupo com plano no recorte: o Silo do plano pela identidade do
 * plano (nome, slug), a keyword do Silo (opcional — ausente é normal), onde
 * ele está e UM botão: "Consolidar o Silo do plano" (prévia grátis → uma
 * confirmação, pelo núcleo `scope: "silo"`), ou "Recriar o Silo do plano"
 * quando alguém o desfez. Sem nada a fazer, o botão fica desabilitado com o
 * motivo no `title`. A prévia e o andamento aparecem logo abaixo
 * (`PlanSheetOperations`, o mesmo lugar das outras ações do plano).
 * Marca sem plano: a barra não aparece.
 */
export type PlanSiloBarEntry = {
  groupId: string;
  colorLabel: string;
  color: EditorialGroupColor | null;
  siloName: string;
  siloSlug: string | null;
  status: PlanSiloStatus;
  headSentence: string;
};

export function PlanSiloBar({ entries, sheet, onRecreate, recreateBusy = false, buttonClassName, primaryButtonClassName }: {
  entries: readonly PlanSiloBarEntry[];
  sheet: Pick<PlanArticleSheetController, "ocupado" | "consolidateSilo">;
  onRecreate: (groupId: string, label: string) => void;
  recreateBusy?: boolean;
  buttonClassName: string;
  primaryButtonClassName: string;
}) {
  if (!entries.length) return null;
  return <section className="border-b border-divider bg-surface-subtle px-4 py-3" data-testid="architect-plan-silo-bar" aria-label="Silo do plano">
    <ul className="grid gap-2">
      {entries.map(entry => {
        const desfeito = entry.status.stage === "rejected";
        return <li key={entry.groupId} className="flex flex-wrap items-center gap-2" data-testid="architect-plan-silo-row" data-group-id={entry.groupId} data-stage={entry.status.stage}>
          <span className="text-sm font-semibold text-foreground">Silo do plano</span>
          {entry.color ? <EditorialGroupTag name={entry.colorLabel} color={entry.color} /> : <span className="text-sm text-text-muted">{entry.colorLabel}</span>}
          <span className="text-sm text-foreground" title={entry.headSentence}>“{entry.siloName}”{entry.siloSlug ? <span className="text-text-muted"> · /{entry.siloSlug}</span> : null}</span>
          {desfeito
            ? <button type="button" disabled={recreateBusy || sheet.ocupado} onClick={() => onRecreate(entry.groupId, entry.colorLabel)} className={primaryButtonClassName} data-testid="architect-plan-silo-recreate" title={entry.status.sentence}>{`Recriar o Silo do plano · ${entry.colorLabel}`}</button>
            : <button type="button" disabled={sheet.ocupado || !entry.status.actionable} onClick={() => sheet.consolidateSilo(entry.groupId)} className={entry.status.actionable ? primaryButtonClassName : buttonClassName} data-testid="architect-plan-silo-consolidate" title={entry.status.sentence}>{PLAN_SILO_CONSOLIDATE_LABEL}</button>}
          <span className="min-w-0 flex-1 truncate text-sm text-text-muted" title={`${entry.status.sentence}\n${entry.headSentence}`} data-testid="architect-plan-silo-line">{entry.status.sentence}</span>
        </li>;
      })}
    </ul>
  </section>;
}
