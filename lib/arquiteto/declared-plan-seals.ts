import type { ArchitectSubjectStanding } from "./declared-subject.ts";

/**
 * ===== SELOS DO PLANO DECLARADO NO ARQUITETO (SDD 2026-10-12 §9, item 6) =====
 *
 * "No cartão do Silo, selo 'Plano declarado' com o Pilar declarado; na linha do
 * artigo, 'Principal declarada' ao lado da keyword; divergência entre proposta
 * e plano aparece como aviso, nunca como troca."
 *
 * Os selos só LEEM o que o Arquiteto já obedece: o plano do PACOTE APROVADO de
 * cada Assunto (`ArchitectSubjectStanding.plan` / `.declaredPrincipal`). A linha
 * viva do Minerador nunca vale como plano. Selo é texto (cor nunca sozinha) e
 * não decide nada: não troca principal, papel nem Silo.
 *
 * Domínio puro: sem React, sem rede.
 */

export type DeclaredPlanSealKind =
  | "declared_principal"
  | "principal_diverges"
  | "plan_pillar"
  | "plan_support"
  | "outside_plan"
  | "silo_plan";

export type DeclaredPlanSeal = {
  kind: DeclaredPlanSealKind;
  /** O texto do selo (sempre escrito). */
  label: string;
  /** A explicação (tooltip e nome acessível). */
  title: string;
  /** Tom do texto: neutro para fato, atenção para divergência. */
  tone: "neutral" | "warning";
};

type Standing = Pick<ArchitectSubjectStanding, "plan" | "declaredPrincipal">;

/**
 * Os selos da linha do ARTIGO.
 *
 * - Assunto do artigo com plano → papel e posição ("Pilar do plano · 1º",
 *   "Suporte do plano · 3º"); se a principal do artigo é a declarada,
 *   "Principal declarada"; se não é, "Principal ≠ declarada" (aviso).
 * - Sem plano no Assunto, mas a principal do artigo é principal declarada de
 *   algum Assunto → "Principal declarada".
 * - Artigo de grupo que tem plano, sem plano no Assunto → "Fora do plano".
 * - Grupo sem plano → nenhum selo.
 */
export function articleDeclaredPlanSeals(input: {
  subjectKeywordId: string | null;
  principalKeywordId: string | null;
  standingOf: (keywordId: string) => Standing | null | undefined;
  /** O grupo efetivo do artigo tem plano declarado (`origin = declared_plan`). */
  groupHasPlan: boolean;
}): DeclaredPlanSeal[] {
  const plan = input.subjectKeywordId ? input.standingOf(input.subjectKeywordId)?.plan ?? null : null;
  const selos: DeclaredPlanSeal[] = [];
  if (plan) {
    selos.push(plan.role === "Pilar"
      ? { kind: "plan_pillar", label: `Pilar do plano · ${plan.order}º`, title: `Pilar declarado no plano do Silo (posição ${plan.order} do plano v${plan.planVersion}).`, tone: "neutral" }
      : { kind: "plan_support", label: `Suporte do plano · ${plan.order}º`, title: `Suporte declarado no plano do Silo (posição ${plan.order} do plano v${plan.planVersion}).`, tone: "neutral" });
    const declarada = plan.declaredPrincipal;
    if (declarada) {
      if (input.principalKeywordId === declarada.keywordId) {
        selos.push({ kind: "declared_principal", label: "Principal declarada", title: `“${declarada.phrase}” é a principal declarada no plano: cabeceira fixa (D1-bis). O Arquiteto não troca o que foi declarado.`, tone: "neutral" });
      } else {
        selos.push({ kind: "principal_diverges", label: "Principal ≠ declarada", title: `O plano declara “${declarada.phrase}” como principal, e este artigo está com outra. Nada é trocado sozinho: grave a melhoria do artigo ou mude o plano no Minerador.`, tone: "warning" });
      }
    }
    return selos;
  }
  const marca = input.principalKeywordId ? input.standingOf(input.principalKeywordId)?.declaredPrincipal ?? null : null;
  if (marca) selos.push({ kind: "declared_principal", label: "Principal declarada", title: "A principal deste artigo é a principal declarada de um Assunto do plano.", tone: "neutral" });
  if (input.groupHasPlan) selos.push({ kind: "outside_plan", label: "Fora do plano", title: "O grupo deste artigo tem plano declarado, mas este artigo não é um dos artigos do plano. Nada é apagado; para tirá-lo do Silo, use “Retirar artigo do Silo”.", tone: "warning" });
  return selos;
}

/**
 * O selo do cartão do SILO: "Plano declarado · Pilar: …" quando o grupo do
 * Silo tem plano. O Pilar vem do Assunto com `role = Pilar` no plano aprovado.
 */
export function siloDeclaredPlanSeal(input: {
  groupHasPlan: boolean;
  planVersion: number;
  /** A frase da principal declarada (ou do Assunto) do Pilar do plano, quando conhecida. */
  pillarLabel: string | null;
}): DeclaredPlanSeal | null {
  if (!input.groupHasPlan) return null;
  const versao = input.planVersion > 0 ? ` (v${input.planVersion})` : "";
  return input.pillarLabel
    ? { kind: "silo_plan", label: `Plano declarado · Pilar: ${input.pillarLabel}`, title: `Este Silo é de um grupo com plano declarado${versao}. O Pilar declarado é “${input.pillarLabel}”; aplicar o plano ao Silo é decisão humana (“Aplicar o plano declarado ao Silo”).`, tone: "neutral" }
    : { kind: "silo_plan", label: "Plano declarado", title: `Este Silo é de um grupo com plano declarado${versao}. O Pilar declarado ainda não chegou ao Arquiteto pelo pacote aprovado.`, tone: "neutral" };
}

/** O Pilar do plano entre os Assuntos com plano deste grupo (pacote aprovado). */
export function declaredPlanPillarLabel(standings: Iterable<Pick<ArchitectSubjectStanding, "plan" | "phrase">>, groupId: string): string | null {
  for (const standing of standings) {
    if (standing.plan && standing.plan.groupId === groupId && standing.plan.role === "Pilar") {
      return standing.plan.declaredPrincipal?.phrase || standing.phrase || null;
    }
  }
  return null;
}
