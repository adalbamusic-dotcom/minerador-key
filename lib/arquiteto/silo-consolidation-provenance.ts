import { buildSiloWorkingCopyRef, type SiloWorkingCopyState } from "./silo-working-copy-record.ts";

/**
 * ESPELHO DE DOMÍNIO das decisões tomadas dentro das RPCs da 2C.4.
 *
 * Existe porque não há Postgres neste ambiente: sem ele, a única alternativa
 * seria afirmar comportamento SQL com busca de string, o que não é prova. Aqui
 * as mesmas regras são funções puras, testadas de verdade, e o SQL as espelha.
 *
 * Isto NÃO substitui um smoke comportamental contra o banco. O que este módulo
 * garante é que a REGRA está certa e é a mesma dos dois lados.
 */

/**
 * Ordem global de locks — invariante de prevenção de deadlock. Todo writer
 * canônico adquire um prefixo desta sequência, nunca uma permutação.
 */
export const CANONICAL_LOCK_ORDER = ["territory", "silo_working_copy", "silo_advisory", "artifacts"] as const;
export type CanonicalLockStep = (typeof CANONICAL_LOCK_ORDER)[number];

export function lockOrderIsCanonical(steps: readonly CanonicalLockStep[]): boolean {
  let cursor = -1;
  for (const step of steps) {
    const index = CANONICAL_LOCK_ORDER.indexOf(step);
    if (index <= cursor) return false;
    cursor = index;
  }
  return true;
}

/* ------------------------- guard de consolidação ------------------------- */

export const CONSOLIDATION_PROVENANCE_REFUSALS = [
  "STALE_WORKING_COPY",
  "PROVENANCE_MISSING",
  "PROVENANCE_MISMATCH",
  "WORKING_COPY_NOT_FOUND",
  "WORKING_COPY_TERRITORY_MISMATCH",
] as const;
export type ConsolidationProvenanceRefusal = (typeof CONSOLIDATION_PROVENANCE_REFUSALS)[number];

export type LockedWorkingCopy = {
  subjectId: string;
  lockVersion: number;
  territoryRef: string;
  brandId: string;
};

/**
 * Guard da PRIMEIRA consolidação.
 *
 * O que o chamador declarou no payload do SiloDNA precisa CONFERIR com a linha
 * travada. Nada é completado nem corrigido: um SiloDNA que chega sem
 * proveniência no fluxo Silo-first é recusado, não preenchido.
 */
export function refuseConsolidationProvenance(input: {
  workingCopy: LockedWorkingCopy | null;
  territoryRef: string;
  expectedLock: number;
  declaredWorkingCopyRef: string | undefined;
  declaredWorkingCopyLockVersion: number | undefined;
}): ConsolidationProvenanceRefusal[] {
  const refusals: ConsolidationProvenanceRefusal[] = [];
  const { workingCopy } = input;

  if (!workingCopy) {
    refusals.push("WORKING_COPY_NOT_FOUND");
    return refusals;
  }
  const derived = buildSiloWorkingCopyRef(input.territoryRef);
  if (workingCopy.territoryRef !== input.territoryRef || workingCopy.subjectId !== derived) {
    refusals.push("WORKING_COPY_TERRITORY_MISMATCH");
    return refusals;
  }

  // Proveniência é obrigatória no fluxo novo, e é PAR.
  if (input.declaredWorkingCopyRef === undefined || input.declaredWorkingCopyLockVersion === undefined) {
    refusals.push("PROVENANCE_MISSING");
    return refusals;
  }

  // Lock antes de proveniência: se a working copy mudou, o que o chamador
  // declarou descreve uma versão que não existe mais.
  if (workingCopy.lockVersion !== input.expectedLock) {
    refusals.push("STALE_WORKING_COPY");
    return refusals;
  }
  if (input.declaredWorkingCopyRef !== workingCopy.subjectId
    || input.declaredWorkingCopyLockVersion !== workingCopy.lockVersion) {
    refusals.push("PROVENANCE_MISMATCH");
  }
  return refusals;
}

/**
 * Guard do REPLAY — igualdade de TRÊS pontas:
 *
 *     REQUEST = SILODNA PERSISTIDO = WORKING COPY HISTÓRICA TRAVADA
 *
 * `p_working_copy_expected_lock` NÃO participa: um retry chega com o lock que
 * leu antes da primeira execução, e exigi-lo mataria o retry exatamente no caso
 * que a idempotência existe para cobrir. São conceitos diferentes —
 * `expectedLock` é a expectativa do request original; a proveniência persistida
 * é prova durável do snapshot que foi consolidado.
 *
 * Mas a WC travada AGORA precisa ser a mesma que a proveniência descreve. Sem
 * essa terceira perna, um replay passaria sobre uma working copy alterada depois
 * da consolidação — dizendo "é o mesmo" sobre algo que já mudou.
 */
export function refuseConsolidationReplayProvenance(input: {
  workingCopy: LockedWorkingCopy | null;
  territoryRef: string;
  persistedWorkingCopyRef: string | undefined;
  persistedWorkingCopyLockVersion: number | undefined;
  declaredWorkingCopyRef?: string | undefined;
  declaredWorkingCopyLockVersion?: number | undefined;
}): ConsolidationProvenanceRefusal[] {
  const refusals: ConsolidationProvenanceRefusal[] = [];
  if (!input.workingCopy) {
    refusals.push("WORKING_COPY_NOT_FOUND");
    return refusals;
  }
  const derived = buildSiloWorkingCopyRef(input.territoryRef);
  if (input.workingCopy.subjectId !== derived) {
    refusals.push("WORKING_COPY_TERRITORY_MISMATCH");
    return refusals;
  }
  if (input.persistedWorkingCopyRef === undefined || input.persistedWorkingCopyLockVersion === undefined) {
    refusals.push("PROVENANCE_MISSING");
    return refusals;
  }
  if (!Number.isInteger(input.persistedWorkingCopyLockVersion) || input.persistedWorkingCopyLockVersion < 1) {
    refusals.push("PROVENANCE_MISSING");
    return refusals;
  }

  const mismatched =
    // persistido ↔ working copy travada agora
    input.persistedWorkingCopyRef !== input.workingCopy.subjectId
    || input.persistedWorkingCopyLockVersion !== input.workingCopy.lockVersion
    // persistido ↔ request
    || (input.declaredWorkingCopyRef !== undefined && input.declaredWorkingCopyRef !== input.persistedWorkingCopyRef)
    || (input.declaredWorkingCopyLockVersion !== undefined
      && input.declaredWorkingCopyLockVersion !== input.persistedWorkingCopyLockVersion);

  if (mismatched) refusals.push("PROVENANCE_MISMATCH");
  return refusals;
}

/* ---------------------------- create da working copy --------------------- */

export const WORKING_COPY_CREATE_OUTCOMES = ["insert", "idempotent_replay", "create_conflict"] as const;
export type WorkingCopyCreateOutcome = (typeof WORKING_COPY_CREATE_OUTCOMES)[number];

/**
 * Campos materiais da working copy — o que faz duas criações serem "a mesma".
 * `formationStatus` entra: pedir `draft` onde já existe `ready_for_review` é
 * pedir outra coisa.
 */
export function workingCopyMaterialFingerprint(state: SiloWorkingCopyState): string {
  return JSON.stringify({
    territoryRef: state.territoryRef,
    brandId: state.brandId,
    name: state.name,
    slug: state.slug,
    formationStatus: state.formationStatus,
    existingSiloId: state.existingSiloId,
    articleRefs: [...state.articleRefs].sort((left, right) => left.articleId.localeCompare(right.articleId)),
    pillarSuggestionArticleId: state.pillarSuggestionArticleId,
    pillarSelection: state.pillarSelection,
    supportArticleIds: [...state.supportArticleIds].sort(),
    exclusions: [...state.exclusions].sort((left, right) => left.articleId.localeCompare(right.articleId)),
    reasons: state.reasons,
    conflicts: state.conflicts,
  });
}

/**
 * CREATE nunca vira UPDATE.
 *
 * Mesma identidade e mesmo estado material → replay, zero escrita.
 * Mesma identidade e estado material diferente → conflito, zero escrita. Deixar
 * passar como update sobrescreveria decisões humanas de quem chegou primeiro.
 */
export function resolveWorkingCopyCreateOutcome(input: {
  existing: SiloWorkingCopyState | null;
  requested: SiloWorkingCopyState;
}): WorkingCopyCreateOutcome {
  if (!input.existing) return "insert";
  if (input.existing.workingCopyRef !== input.requested.workingCopyRef) return "create_conflict";
  return workingCopyMaterialFingerprint(input.existing) === workingCopyMaterialFingerprint(input.requested)
    ? "idempotent_replay"
    : "create_conflict";
}
