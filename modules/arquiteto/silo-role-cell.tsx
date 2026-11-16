import { planRowRoleLabel, type PlanSheetRow } from "@/lib/arquiteto/plan-article-sheet";

/** O papel declarado é informativo até o SiloDNA ser aprovado. */
export function SiloRoleCell({ role, plan, linksMode }: {
  role: "PILAR" | "SUPORTE" | "OUTRO" | "SILOPAGE" | undefined;
  plan: Pick<PlanSheetRow, "role" | "order"> | null;
  linksMode: boolean;
}) {
  if (plan && (!linksMode || !role)) {
    return <span data-testid="architect-silo-role-cell" title={linksMode ? "Papel declarado no plano; aguarda a consolidação do Silo para a etapa de links." : "Papel e posição do plano do Minerador (o plano manda na formação)."} className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${plan.role === "Pilar" ? "border-positive-soft/40 bg-positive-soft/10 text-positive-soft" : "border-divider text-text-muted"}`}>{planRowRoleLabel(plan)}{linksMode ? " · previsto no plano" : ""}</span>;
  }
  return role
    ? <span data-testid="architect-silo-role-cell" className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${role === "PILAR" ? "border-positive-soft/40 bg-positive-soft/10 text-positive-soft" : "border-divider text-text-muted"}`}>{role}</span>
    : <span className="text-xs text-text-muted">—</span>;
}
