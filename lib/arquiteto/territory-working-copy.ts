import {
  MembershipOperationSchema,
  TerritoryCandidateSchema,
  checkTerritorialConsistency,
  isPartialMembershipOperation,
  projectTerritoryMembership,
  resolveArticleFormationReadiness,
  resolveMembershipOperationStatus,
  resolveTerritoryConfirmationReadiness,
  structuralChangeRefusal,
  type ArticleFormationReadiness,
  type KeywordTerritoryAssignment,
  type KeywordTerritoryDecision,
  type MembershipConsistencyReport,
  type MembershipOperation,
  type TerritoryCandidate,
  type TerritoryMembershipState,
  type TerritoryReadiness,
  type TerritoryRef,
} from "./territory.ts";

/**
 * Working copy territorial do Arquiteto — Fase 2A.
 *
 * A membership canônica vive num lugar só: o payload do item de workflow da
 * KEYWORD (`territoryRef` + `territoryAssignment`). Este módulo nunca inventa
 * uma segunda fonte: ele planeja mutações sobre esses itens e DERIVA a projeção
 * territorial para leitura.
 *
 * As operações são puras e devolvem um PLANO. Quem persiste é o caminho
 * canônico que já existe — `PATCH /api/arquiteto/workspace`, com `expectedLock`
 * por item. Nada aqui fala com banco, rede ou provider.
 */

/* ------------------------------ working copy ----------------------------- */

export type TerritoryWorkingKeyword = {
  keywordId: string;
  brandId: string;
  /** Identidade da linha de workflow; é ela que carrega o lock. */
  workflowItemId: string;
  lockVersion: number;
  isPublished: boolean;
  /** Estado canônico atual. `null` quando a keyword nunca foi endereçada. */
  assignment: KeywordTerritoryAssignment | null;
};

export type TerritoryWorkingCopy = {
  brandId: string;
  territories: readonly TerritoryCandidate[];
  keywords: readonly TerritoryWorkingKeyword[];
};

/** Patch de membership no formato que a rota canônica já aceita. */
export type MembershipPatch = {
  workflowItemId: string;
  expectedLock: number;
  keywordId: string;
  assignment: {
    // `territoryRef` é o ÚNICO ponteiro de membership. A decisão ao lado guarda
    // estado, motivo e proveniência — e nenhuma segunda referência.
    territoryRef: TerritoryRef | null;
    territoryAssignment: KeywordTerritoryDecision;
  };
};

export const MEMBERSHIP_REFUSAL_CODES = [
  "KEYWORD_NOT_IN_WORKING_COPY",
  "KEYWORD_CROSS_BRAND",
  "TERRITORY_NOT_IN_WORKING_COPY",
  "TERRITORY_NOT_ASSIGNABLE",
  "REASON_REQUIRED",
  "ALREADY_IN_TARGET",
  "PUBLISHED_PROTECTION_VIOLATION",
  "SUCCESSOR_REQUIRED",
] as const;
export type MembershipRefusalCode = (typeof MEMBERSHIP_REFUSAL_CODES)[number];

export type MembershipPlan = {
  ok: boolean;
  patches: MembershipPatch[];
  refusals: Array<{ code: MembershipRefusalCode; keywordId?: string; detail: string }>;
  /** Registro do lote, para o gate de operação parcial. */
  operation: MembershipOperation;
};

const ASSIGNABLE_LIFECYCLES = new Set(["candidate", "confirmed"]);

function buildOperation(input: {
  operationId: string;
  kind: MembershipOperation["kind"];
  actorUserId: string;
  decidedAt: string;
  participantTerritoryRefs: readonly (TerritoryRef | null)[];
  intendedKeywordIds: readonly string[];
}): MembershipOperation {
  return MembershipOperationSchema.parse({
    operationId: input.operationId,
    kind: input.kind,
    actorUserId: input.actorUserId,
    startedAt: input.decidedAt,
    participantTerritoryRefs: [...new Set(input.participantTerritoryRefs.filter((ref): ref is TerritoryRef => Boolean(ref)))].sort(),
    intendedKeywordIds: [...new Set(input.intendedKeywordIds)].sort(),
    appliedKeywordIds: [],
    failedKeywordIds: [],
  });
}

/**
 * Planeja a atribuição de N keywords a um território — ou a `null`, que é o
 * estado explícito "sem território". Uma keyword sai de onde estava e entra no
 * destino na MESMA escrita: nunca existe instante em que ela esteja em dois
 * lugares nem em nenhum.
 */
export function planMembershipChange(input: {
  workingCopy: TerritoryWorkingCopy;
  keywordIds: readonly string[];
  targetTerritoryRef: TerritoryRef | null;
  state: TerritoryMembershipState;
  reason: string;
  source: KeywordTerritoryAssignment["source"];
  actorUserId: string;
  decidedAt: string;
  operationId?: string;
  kind?: MembershipOperation["kind"];
}): MembershipPlan {
  const refusals: MembershipPlan["refusals"] = [];
  const patches: MembershipPatch[] = [];
  const byKeywordId = new Map(input.workingCopy.keywords.map(keyword => [keyword.keywordId, keyword]));
  const territoryByRef = new Map(input.workingCopy.territories.map(territory => [territory.territoryRef, territory]));
  const target = input.targetTerritoryRef ? territoryByRef.get(input.targetTerritoryRef) : null;

  if (!input.reason.trim()) {
    refusals.push({ code: "REASON_REQUIRED", detail: "Toda mudança de membership declara o motivo, inclusive sair do território." });
  }
  if (input.targetTerritoryRef && !target) {
    refusals.push({ code: "TERRITORY_NOT_IN_WORKING_COPY", detail: input.targetTerritoryRef });
  }
  if (target && !ASSIGNABLE_LIFECYCLES.has(target.lifecycleStatus)) {
    refusals.push({ code: "TERRITORY_NOT_ASSIGNABLE", detail: `${target.territoryRef}: ${target.lifecycleStatus}` });
  }
  if (target) {
    const structural = structuralChangeRefusal(target);
    if (structural?.code === "SUCCESSOR_REQUIRED") refusals.push({ code: "SUCCESSOR_REQUIRED", detail: structural.reason });
  }

  for (const keywordId of [...new Set(input.keywordIds)]) {
    const keyword = byKeywordId.get(keywordId);
    if (!keyword) {
      refusals.push({ code: "KEYWORD_NOT_IN_WORKING_COPY", keywordId, detail: keywordId });
      continue;
    }
    if (keyword.brandId !== input.workingCopy.brandId) {
      refusals.push({ code: "KEYWORD_CROSS_BRAND", keywordId, detail: keyword.brandId });
      continue;
    }
    if ((keyword.assignment?.territoryRef ?? null) === input.targetTerritoryRef) {
      refusals.push({ code: "ALREADY_IN_TARGET", keywordId, detail: String(input.targetTerritoryRef) });
      continue;
    }
    patches.push({
      workflowItemId: keyword.workflowItemId,
      expectedLock: keyword.lockVersion,
      keywordId,
      assignment: {
        territoryRef: input.targetTerritoryRef,
        territoryAssignment: {
          state: input.targetTerritoryRef ? input.state : "unassigned",
          reason: input.reason.trim(),
          source: input.source,
          decidedAt: input.decidedAt,
        },
      },
    });
  }

  const operation = buildOperation({
    operationId: input.operationId || `membership:${input.decidedAt}`,
    kind: input.kind || (input.targetTerritoryRef ? "assign" : "unassign"),
    actorUserId: input.actorUserId,
    decidedAt: input.decidedAt,
    participantTerritoryRefs: [
      input.targetTerritoryRef,
      ...input.keywordIds.map(keywordId => byKeywordId.get(keywordId)?.assignment?.territoryRef ?? null),
    ],
    intendedKeywordIds: patches.map(patch => patch.keywordId),
  });

  return { ok: refusals.length === 0 && patches.length > 0, patches, refusals, operation };
}

/**
 * Fecha o lote depois do readback. Um lote incompleto NÃO é corrigido nem
 * escondido: o registro fica `partial`, e é ele que bloqueia confirmação e
 * formação de Article nos territórios participantes.
 */
export function settleMembershipOperation(input: {
  operation: MembershipOperation;
  appliedKeywordIds: readonly string[];
  failedKeywordIds: readonly string[];
}): { operation: MembershipOperation; status: ReturnType<typeof resolveMembershipOperationStatus>; blocking: boolean } {
  const operation = MembershipOperationSchema.parse({
    ...input.operation,
    appliedKeywordIds: [...new Set(input.appliedKeywordIds)].sort(),
    failedKeywordIds: [...new Set(input.failedKeywordIds)].sort(),
  });
  const status = resolveMembershipOperationStatus(operation);
  return { operation, status, blocking: status === "partial" };
}

/** Anexa o lote pendente aos territórios participantes, para o gate de §7. */
export function attachPendingOperation(
  territories: readonly TerritoryCandidate[],
  operation: MembershipOperation,
): TerritoryCandidate[] {
  const participants = new Set(operation.participantTerritoryRefs);
  const pending = isPartialMembershipOperation(operation) ? operation : null;
  return territories.map(territory => participants.has(territory.territoryRef)
    ? TerritoryCandidateSchema.parse({ ...territory, pendingOperation: pending })
    : territory);
}

/* ------------------------------- projeção -------------------------------- */

export type TerritoryProjection = TerritoryCandidate & {
  /** DERIVADO da fonte canônica. Nenhuma escrita produz este campo. */
  keywordRefs: string[];
  confirmationReadiness: TerritoryReadiness;
  articleFormationReadiness: ArticleFormationReadiness;
};

export type TerritorialWorkingView = {
  brandId: string;
  territories: TerritoryProjection[];
  unassignedKeywordIds: string[];
  unaddressedKeywordIds: string[];
  consistency: MembershipConsistencyReport;
};

const assignmentsOf = (workingCopy: TerritoryWorkingCopy): KeywordTerritoryAssignment[] =>
  workingCopy.keywords
    .map(keyword => keyword.assignment)
    .filter((assignment): assignment is KeywordTerritoryAssignment => Boolean(assignment));

/**
 * Derivação ÚNICA da leitura territorial. `keywordRefs` sai daqui e de mais
 * lugar nenhum; a UI e o mapa consomem esta projeção, nunca uma lista própria.
 */
export function deriveTerritorialWorkingView(workingCopy: TerritoryWorkingCopy): TerritorialWorkingView {
  const assignments = assignmentsOf(workingCopy);
  const consistency = checkTerritorialConsistency({
    brandId: workingCopy.brandId,
    territories: workingCopy.territories,
    assignments,
  });
  const membership = projectTerritoryMembership(assignments);

  const territories = workingCopy.territories.map(territory => ({
    ...territory,
    keywordRefs: membership.get(territory.territoryRef) || [],
    confirmationReadiness: resolveTerritoryConfirmationReadiness({ territory, report: consistency }),
    articleFormationReadiness: resolveArticleFormationReadiness({ territory, report: consistency, assignments }),
  }));

  return {
    brandId: workingCopy.brandId,
    territories,
    unassignedKeywordIds: assignments
      .filter(assignment => assignment.territoryRef === null)
      .map(assignment => assignment.keywordId)
      .sort(),
    // Keyword que ainda não recebeu decisão nenhuma. Não é "unassigned": é
    // ausência de decisão, e continua visível em vez de sumir.
    unaddressedKeywordIds: workingCopy.keywords
      .filter(keyword => !keyword.assignment)
      .map(keyword => keyword.keywordId)
      .sort(),
    consistency,
  };
}

/* --------------------------------- legado -------------------------------- */

export const LEGACY_RECONCILIATION_CODE = "LEGACY_NEEDS_RECONCILIATION" as const;

export type LegacyArticleEntry = {
  articleId: string;
  brandId: string;
  siloId: string | null;
  code: typeof LEGACY_RECONCILIATION_CODE;
  reason: string;
};

/**
 * ArticleDNA sem Silo vira estado explícito de reconciliação. Nunca é movido,
 * convertido nem associado por heurística — a decisão é humana e posterior.
 */
export function resolveLegacyArticleReconciliation(input: {
  brandId: string;
  articles: ReadonlyArray<{ articleId: string; brandId: string; siloId: string | null }>;
}): LegacyArticleEntry[] {
  return input.articles
    .filter(article => article.brandId === input.brandId && !article.siloId)
    .map(article => ({
      articleId: article.articleId,
      brandId: article.brandId,
      siloId: null,
      code: LEGACY_RECONCILIATION_CODE,
      reason: "ArticleDNA anterior à arquitetura territorial, sem Silo associado.",
    }))
    .sort((left, right) => left.articleId.localeCompare(right.articleId));
}

/**
 * `lista_id` é proveniência do Minerador e NUNCA vira território. Guard
 * explícito para que nenhum caminho futuro o reinterprete como arquitetura.
 */
export function listaIdIsNeverTerritory(listaId: string | null | undefined): null {
  void listaId;
  return null;
}
