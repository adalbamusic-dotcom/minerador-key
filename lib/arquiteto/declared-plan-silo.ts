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
  /** Opcional: o nome reconhece o Silo do plano desfeito quando o slug não foi gravado. */
  name?: string | null;
};

export type PlanSiloChoice =
  | { kind: "linked" | "slug"; territoryRef: string; lifecycleStatus: string }
  /**
   * 2026-10-14 (caso WifiConecta, azul): o Silo do plano foi DESFEITO por
   * alguém. Ele não recebe membros e não nasce duplicado em silêncio: volta
   * só por "Recriar o Silo do plano" (decisão humana, com prévia).
   */
  | { kind: "rejected_by_human"; territoryRef: string }
  | { kind: "create" };

/** Territórios que ainda recebem membros (os mesmos da decisão de Silo). */
export const PLAN_SILO_ASSIGNABLE = new Set(["candidate", "confirmed"]);

/** A marca que o Silo do plano carrega desde que nasce (`declaredPlanSiloDraft`). */
export const DECLARED_PLAN_SILO_REASON_PREFIX = "Silo do plano declarado:";
export const DECLARED_PLAN_SILO_NOTE_PREFIX = "Plano declarado no cadastro:";

const nomeNormalizado = (valor: string | null | undefined) => String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
  // Um Silo vivo vence; só então o que a pessoa desfez (ligado ao grupo, mesmo slug ou mesmo nome).
  const desfeito = input.territories.filter(territory => territory.lifecycleStatus === "rejected").find(territory =>
    territory.territoryRef === input.linkedTerritoryRef
    || territory.slugs.some(item => item && item === slug)
    || (territory.name !== undefined && nomeNormalizado(territory.name) !== "" && nomeNormalizado(territory.name) === nomeNormalizado(input.plan.siloName)));
  if (desfeito) return { kind: "rejected_by_human", territoryRef: desfeito.territoryRef };
  return { kind: "create" };
}

/** O que a regra precisa do grupo com plano. */
export type DeclaredPlanGroupView = { groupId: string; groupLabel: string; siloName: string; siloSlug: string | null; linkedTerritoryRef: string | null };

/** O que ela lê do território. */
export type DeclaredPlanTerritoryView = PlanSiloTerritoryView & {
  name?: string | null;
  reasons?: readonly string[] | null;
  provenanceNote?: string | null;
};

/** A vista do território (como gravado) para a regra do Silo do plano — a mesma na tela e no servidor. */
export function declaredPlanViewOfTerritory(territory: {
  territoryRef: string;
  lifecycleStatus: string;
  name?: string | null;
  reasons?: readonly string[] | null;
  provenance?: { note?: string | null } | null;
  slugState?: { publishedSlug?: string | null; confirmed?: string | null; proposals?: ReadonlyArray<{ slug: string }> | null } | null;
}): DeclaredPlanTerritoryView {
  return {
    territoryRef: territory.territoryRef,
    lifecycleStatus: territory.lifecycleStatus,
    slugs: [territory.slugState?.publishedSlug, territory.slugState?.confirmed, ...(territory.slugState?.proposals ?? []).map(proposal => proposal.slug)],
    name: territory.name ?? null,
    reasons: territory.reasons ?? [],
    provenanceNote: territory.provenance?.note ?? null,
  };
}

/** O território nasceu como Silo do plano (marca gravada no rascunho do plano)? */
export function territoryCarriesDeclaredPlanMark(territory: Pick<DeclaredPlanTerritoryView, "reasons" | "provenanceNote">): boolean {
  return (territory.reasons ?? []).some(reason => typeof reason === "string" && reason.startsWith(DECLARED_PLAN_SILO_REASON_PREFIX))
    || (typeof territory.provenanceNote === "string" && territory.provenanceNote.startsWith(DECLARED_PLAN_SILO_NOTE_PREFIX));
}

/**
 * DE QUAL GRUPO COM PLANO ESTE É O SILO? A MESMA regra que acha o Silo do
 * plano no envio (`choosePlanSiloTerritory`): ligado ao grupo, mesmo slug do
 * plano, ou a marca do plano com o mesmo nome. `plans === null` (os planos
 * ainda não foram lidos): a marca do plano basta — melhor recusar desfazer do
 * que desfazer o plano por falta de leitura.
 */
export function declaredPlanSiloGroupFor(
  territory: DeclaredPlanTerritoryView,
  plans: readonly DeclaredPlanGroupView[] | null,
  slugOf: (text: string) => string,
): { groupId: string | null; groupLabel: string; siloName: string } | null {
  const marcado = territoryCarriesDeclaredPlanMark(territory);
  if (plans === null) return marcado ? { groupId: null, groupLabel: "do cadastro", siloName: territory.name || "Silo do plano" } : null;
  for (const plan of plans) {
    const slug = plan.siloSlug || slugOf(plan.siloName);
    const ligado = plan.linkedTerritoryRef === territory.territoryRef;
    const mesmoSlug = territory.slugs.some(item => item && item === slug);
    const mesmoNome = marcado && nomeNormalizado(territory.name) !== "" && nomeNormalizado(territory.name) === nomeNormalizado(plan.siloName);
    if (ligado || mesmoSlug || mesmoNome) return { groupId: plan.groupId, groupLabel: plan.groupLabel, siloName: plan.siloName };
  }
  return null;
}

/**
 * "RECRIAR O SILO DO PLANO" — a prévia por keyword (decisão humana; nada é
 * apagado). Cada keyword do grupo recebida no Arquiteto: entra no Silo do
 * plano, já está nele, ou fica onde está com o motivo (publicada; num artigo
 * — mexer nela é revisão do artigo, não decisão de Silo).
 */
export type RecreatePlanSiloLine = {
  keywordId: string;
  keyword: string;
  outcome: "enters" | "already" | "stays_in_article" | "stays_published" | "not_received";
  reason: string;
};

export function planRecreatePlanSiloLines(input: {
  territoryRef: string;
  keywords: ReadonlyArray<{ keywordId: string; keyword: string; received: boolean; territoryRef: string | null; territoryLabel?: string | null; isPublished: boolean; articleLabel?: string | null; previousDecision?: string | null }>;
}): RecreatePlanSiloLine[] {
  return input.keywords.map(item => {
    const base = { keywordId: item.keywordId, keyword: item.keyword };
    if (!item.received) return { ...base, outcome: "not_received" as const, reason: "Ainda não está no Arquiteto: aprove e envie no Minerador; ela entra no Silo do plano ao chegar." };
    if (item.territoryRef === input.territoryRef) return { ...base, outcome: "already" as const, reason: "Já está no Silo do plano." };
    if (item.isPublished) return { ...base, outcome: "stays_published" as const, reason: "Publicada: fica no Silo que o site declara (URL, slug e canonical intocados)." };
    if (item.articleLabel) return { ...base, outcome: "stays_in_article" as const, reason: `Está no artigo “${item.articleLabel}”${item.territoryLabel ? ` (Silo ${item.territoryLabel})` : ""}: fica lá. Para trazê-la, use “Retirar artigo do Silo” nesse artigo e recrie de novo; mexer nela é revisão do artigo, não decisão de Silo.` };
    return { ...base, outcome: "enters" as const, reason: item.territoryRef
      ? `Sai de ${item.territoryLabel ? `“${item.territoryLabel}”` : "outro Silo"} (sem artigo) e entra no Silo do plano.`
      : `Entra no Silo do plano${item.previousDecision ? ` (antes: ${item.previousDecision})` : ""}.` };
  });
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
