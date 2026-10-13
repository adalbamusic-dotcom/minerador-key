import { manualSiloCandidateDraft } from "./silo-assignment.ts";

/**
 * O SILO DO PLANO CHEGA AO ARQUITETO JÁ CONFIRMADO — regras puras (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 1, D1).
 *
 * Quando o envio ao Arquiteto recebe keywords de um grupo com plano declarado,
 * o Silo do plano é achado pela MESMA regra de "Processar arquitetura"
 * (`architecture-working-proposal.ts`, `pelaPlano`): o território já ligado ao
 * grupo (`editorial_groups.silo_id`), o existente com o mesmo slug, ou um
 * candidato novo com o nome e o slug do plano. A decisão humana é o cadastro do
 * plano; a proveniência do território diz isso.
 */

export type PlanSiloTerritoryView = {
  territoryRef: string;
  lifecycleStatus: string;
  slugs: ReadonlyArray<string | null | undefined>;
};

export type PlanSiloChoice =
  | { kind: "linked" | "slug"; territoryRef: string; lifecycleStatus: string }
  | { kind: "create" };

/** Territórios que ainda recebem membros (os mesmos da decisão de Silo). */
export const PLAN_SILO_ASSIGNABLE = new Set(["candidate", "confirmed"]);

export function choosePlanSiloTerritory(input: {
  plan: { siloName: string; siloSlug: string | null };
  linkedTerritoryRef: string | null;
  territories: readonly PlanSiloTerritoryView[];
  slugOf: (text: string) => string;
}): PlanSiloChoice {
  const vivos = input.territories.filter(territory => PLAN_SILO_ASSIGNABLE.has(territory.lifecycleStatus));
  if (input.linkedTerritoryRef) {
    const ligado = vivos.find(territory => territory.territoryRef === input.linkedTerritoryRef);
    if (ligado) return { kind: "linked", territoryRef: ligado.territoryRef, lifecycleStatus: ligado.lifecycleStatus };
  }
  const slug = input.plan.siloSlug || input.slugOf(input.plan.siloName);
  const mesmoSlug = vivos.find(territory => territory.slugs.some(item => item && item === slug));
  if (mesmoSlug) return { kind: "slug", territoryRef: mesmoSlug.territoryRef, lifecycleStatus: mesmoSlug.lifecycleStatus };
  return { kind: "create" };
}

/** O texto da proveniência: quem decidiu é o cadastro do plano. */
export function declaredPlanSiloNote(input: { groupLabel: string; planVersion: number; actorUserId: string; at: string }): string {
  return `Plano declarado no cadastro: grupo ${input.groupLabel}, plano v${input.planVersion}, por ${input.actorUserId} em ${input.at.slice(0, 10)}.`;
}

/** O rascunho do território novo: nome e slug do plano, origem humana estratégica, ingestão por import. */
export function declaredPlanSiloDraft(input: {
  plan: { siloName: string; siloSlug: string | null };
  slugOf: (text: string) => string;
  note: string;
}): Record<string, unknown> {
  const base = manualSiloCandidateDraft({ name: input.plan.siloName, slug: input.plan.siloSlug || input.slugOf(input.plan.siloName) });
  return {
    ...base,
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "import",
    reasons: [`Silo do plano declarado: ${input.plan.siloName}.`],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: input.note },
  };
}

/** Confirmar o território: só o estado do ciclo muda (a identidade e o slug ficam). */
export function confirmedTerritoryDraft(territory: Record<string, unknown>): Record<string, unknown> {
  return { ...territory, lifecycleStatus: "confirmed", decisionState: "confirmed" };
}
