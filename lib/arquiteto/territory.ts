import { z } from "zod";
import { VersionReferenceSchema } from "./contracts.ts";
import { TERRITORY_REF_PREFIX, TerritoryRefSchema, buildTerritoryRef, isTerritoryRef, territoryRefUuid, type TerritoryRef } from "./territory-ref.ts";
import { TerritoryNarrativeSchema } from "./territory-narrative.ts";

/**
 * Território editorial do Arquiteto — contrato de domínio puro (SDD Silo-first,
 * Fase 1).
 *
 * Território é o estado de TRABALHO da arquitetura territorial: mutável,
 * reversível e com identidade própria. `TerritoryCandidate` não é `SiloDNA`,
 * não é `SiloPage`, não cria lista no Minerador e não cria publicação. SiloDNA
 * só nasce na consolidação, depois dos Articles confirmados.
 *
 * Esta fase é domínio puro: sem storage, sem API, sem UI, sem provider, sem DDL.
 */

/* ------------------------------- identidade ------------------------------ */

// O primitivo de identidade vive em territory-ref.ts para que contracts.ts
// (ArticleDNA) possa referenciar um território sem fechar ciclo de import.
// Reexportado aqui para não quebrar nenhum consumidor existente.
export {
  TERRITORY_REF_PREFIX,
  TerritoryRefSchema,
  buildTerritoryRef,
  isTerritoryRef,
  territoryRefUuid,
  type TerritoryRef,
} from "./territory-ref.ts";

export const TERRITORY_IDENTITY_ISSUE_CODES = [
  "TERRITORY_REF_INVALID",
  "TERRITORY_REF_DERIVED_FROM_SILO_ID",
  "TERRITORY_REF_DERIVED_FROM_LISTA_ID",
] as const;
export type TerritoryIdentityIssueCode = (typeof TERRITORY_IDENTITY_ISSUE_CODES)[number];

/**
 * Guard de C4. `territoryRef = siloId` e `territoryRef = lista_id` são proibidos
 * mesmo quando "dariam certo": a coincidência é justamente o defeito.
 */
export function territoryIdentityIssues(input: {
  territoryRef: string;
  siloId?: string | null;
  listaId?: string | null;
}): TerritoryIdentityIssueCode[] {
  if (!isTerritoryRef(input.territoryRef)) return ["TERRITORY_REF_INVALID"];
  const opaque = territoryRefUuid(input.territoryRef);
  const issues: TerritoryIdentityIssueCode[] = [];
  const matches = (value: string | null | undefined) =>
    typeof value === "string" && Boolean(value.trim())
    && [value.trim().toLowerCase(), `${TERRITORY_REF_PREFIX}${value.trim().toLowerCase()}`]
      .some(candidate => candidate === opaque || candidate === input.territoryRef.toLowerCase());
  if (matches(input.siloId)) issues.push("TERRITORY_REF_DERIVED_FROM_SILO_ID");
  if (matches(input.listaId)) issues.push("TERRITORY_REF_DERIVED_FROM_LISTA_ID");
  return issues;
}

/* -------------------------------- lifecycle ------------------------------ */

export const TERRITORY_LIFECYCLE_STATUSES = [
  "candidate",
  "confirmed",
  "consolidated",
  "rejected",
  "superseded",
  "archived",
] as const;
export const TerritoryLifecycleStatusSchema = z.enum(TERRITORY_LIFECYCLE_STATUSES);
export type TerritoryLifecycleStatus = z.infer<typeof TerritoryLifecycleStatusSchema>;

export const TerritoryDecisionStateSchema = z.enum(["pending", "confirmed", "rejected"]);
export type TerritoryDecisionState = z.infer<typeof TerritoryDecisionStateSchema>;

export const TerritoryKindSchema = z.enum(["existing", "expansion", "new"]);
export const TerritoryArchitecturalOriginSchema = z.enum(["existing", "manual_strategic", "discovered"]);
export const TerritoryIngestionOriginSchema = z.enum(["ui", "csv", "import", "system"]);
export const TerritoryPublicationProtectionSchema = z.enum(["unpublished", "protected", "unknown"]);

export type TerritoryArchitecturalOrigin = z.infer<typeof TerritoryArchitecturalOriginSchema>;

/**
 * Transições permitidas. `consolidated` não volta para `candidate`: o território
 * já produziu SiloDNA/SiloPage e mudança estrutural exige sucessor. `archived` é
 * administrativo e terminal — nunca sinônimo de `superseded` nem de `rejected`.
 */
const ALLOWED_TRANSITIONS: Record<TerritoryLifecycleStatus, readonly TerritoryLifecycleStatus[]> = {
  candidate: ["confirmed", "rejected", "superseded", "archived"],
  confirmed: ["candidate", "consolidated", "rejected", "superseded"],
  consolidated: ["superseded", "archived"],
  rejected: ["candidate", "archived"],
  superseded: ["archived"],
  archived: [],
};

export type TerritoryTransitionResult =
  | { allowed: true }
  | { allowed: false; code: "TRANSITION_NOT_ALLOWED" | "SUCCESSOR_REQUIRED"; reason: string };

export function canTransitionTerritoryLifecycle(
  from: TerritoryLifecycleStatus,
  to: TerritoryLifecycleStatus,
): TerritoryTransitionResult {
  if (from === to) return { allowed: true };
  if (ALLOWED_TRANSITIONS[from].includes(to)) return { allowed: true };
  if (from === "consolidated") {
    return { allowed: false, code: "SUCCESSOR_REQUIRED", reason: "Território consolidado só muda por sucessor versionado." };
  }
  return { allowed: false, code: "TRANSITION_NOT_ALLOWED", reason: `Transição ${from} → ${to} não é permitida.` };
}

/**
 * Alteração estrutural direta (fronteira, split, merge, membership) sobre um
 * território consolidado ou publicado é recusada — o caminho é o sucessor.
 */
export function structuralChangeRefusal(territory: Pick<TerritoryCandidate, "lifecycleStatus" | "publicationProtection">):
  | null
  | { code: "SUCCESSOR_REQUIRED" | "PUBLISHED_PROTECTION_VIOLATION"; reason: string } {
  if (territory.lifecycleStatus === "consolidated") {
    return { code: "SUCCESSOR_REQUIRED", reason: "Território consolidado exige sucessor para mudança estrutural." };
  }
  if (territory.lifecycleStatus === "superseded" || territory.lifecycleStatus === "archived") {
    return { code: "SUCCESSOR_REQUIRED", reason: "Território encerrado não recebe alteração estrutural." };
  }
  if (territory.publicationProtection === "protected") {
    return { code: "PUBLISHED_PROTECTION_VIOLATION", reason: "Identidade publicada protegida contra alteração estrutural destrutiva." };
  }
  return null;
}

/* -------------------------------- linhagem ------------------------------- */

export const TerritoryLineageSchema = z.object({
  /** Preenchido nas partes CRIADAS por um split. */
  splitFromTerritoryRef: TerritoryRefSchema.nullable(),
  /** Preenchido no território que CONTINUOU o split — histórico da origem. */
  splitIntoTerritoryRefs: z.array(TerritoryRefSchema),
  /** Preenchido no território ABSORVIDO por um merge. */
  supersededByTerritoryRef: TerritoryRefSchema.nullable(),
  /** Preenchido no SOBREVIVENTE de um merge. */
  absorbedTerritoryRefs: z.array(TerritoryRefSchema),
}).strict();
export type TerritoryLineage = z.infer<typeof TerritoryLineageSchema>;

export const emptyTerritoryLineage = (): TerritoryLineage => ({
  splitFromTerritoryRef: null,
  splitIntoTerritoryRefs: [],
  supersededByTerritoryRef: null,
  absorbedTerritoryRefs: [],
});

/* -------------------------------- conflitos ------------------------------ */

export const TERRITORY_CONFLICT_CODES = [
  "TERRITORIAL_OVERLAP",
  "BOUNDARY_DISPUTE",
  "CANNIBALIZATION_RISK",
  "SLUG_COLLISION",
  "ARTICLE_TERRITORY_MISMATCH",
] as const;

export const TerritoryConflictSchema = z.object({
  conflictId: z.string().min(1),
  code: z.enum(TERRITORY_CONFLICT_CODES),
  raisedBy: z.enum(["logic", "serp", "ai", "human", "article"]),
  detail: z.string().min(1),
  keywordId: z.string().min(1).nullable(),
  relatedTerritoryRef: TerritoryRefSchema.nullable(),
  openedAt: z.string().min(1),
  resolvedAt: z.string().min(1).nullable(),
}).strict();
export type TerritoryConflict = z.infer<typeof TerritoryConflictSchema>;

export const hasOpenTerritorialConflict = (conflicts: readonly TerritoryConflict[]) =>
  conflicts.some(conflict => conflict.resolvedAt === null);

/* --------------------- operação de membership (E1) ----------------------- */

export const MEMBERSHIP_OPERATION_KINDS = ["assign", "unassign", "move", "split", "merge", "reject"] as const;

/**
 * Registro operacional de um lote de membership. NÃO é membership: nunca diz
 * onde uma keyword está — diz o que um lote PRETENDEU fazer e o que o readback
 * confirmou. A fonte de verdade da membership continua sendo o item da keyword.
 *
 * Existe porque o lote não é transacional: cada keyword continua em exatamente
 * um lugar, mas o CONJUNTO pode ficar a meio caminho, e meio caminho não é
 * arquitetura confirmável (emenda E1).
 */
export const MembershipOperationSchema = z.object({
  operationId: z.string().min(1),
  kind: z.enum(MEMBERSHIP_OPERATION_KINDS),
  actorUserId: z.string().min(1),
  startedAt: z.string().min(1),
  participantTerritoryRefs: z.array(TerritoryRefSchema),
  intendedKeywordIds: z.array(z.string().min(1)),
  appliedKeywordIds: z.array(z.string().min(1)),
  failedKeywordIds: z.array(z.string().min(1)),
}).strict();
export type MembershipOperation = z.infer<typeof MembershipOperationSchema>;

export type MembershipOperationStatus = "in_progress" | "partial" | "applied";

/**
 * `partial` é o estado em que o lote terminou sem cobrir tudo o que pretendia —
 * por falha de lock, recusa de guard ou interrupção. Nada é corrigido
 * automaticamente: o estado fica legível e a confirmação fica bloqueada.
 */
export function resolveMembershipOperationStatus(operation: MembershipOperation): MembershipOperationStatus {
  const intended = new Set(operation.intendedKeywordIds);
  const applied = new Set(operation.appliedKeywordIds);
  const failed = new Set(operation.failedKeywordIds);
  if (failed.size > 0) return "partial";
  if ([...intended].every(keywordId => applied.has(keywordId))) return "applied";
  return "in_progress";
}

export const isPartialMembershipOperation = (operation: MembershipOperation | null | undefined) =>
  Boolean(operation) && resolveMembershipOperationStatus(operation!) === "partial";

/* ------------------------------- território ------------------------------ */

export const TerritorySlugStateSchema = z.object({
  proposals: z.array(z.object({
    slug: z.string().min(1),
    source: z.enum(["logic", "serp", "ai", "human"]),
    rationale: z.string().min(1),
  }).strict()),
  /** Só decisão humana preenche. SERP é evidência, nunca decisão de slug. */
  confirmed: z.string().min(1).nullable(),
  publishedSlug: z.string().min(1).nullable(),
  publishedCanonical: z.string().min(1).nullable(),
}).strict();

/**
 * Referência estável para a estrutura publicada de origem. A identidade é a da
 * linha do catálogo remoto — nunca H1, título ou slug derivado.
 */
export const PublishedStructureRefSchema = z.object({
  source: z.literal("site_catalog"),
  catalogEntryId: z.string().min(1),
  normalizedUrl: z.string().min(1),
  observedAt: z.string().min(1).nullable(),
}).strict();
export type PublishedStructureRef = z.infer<typeof PublishedStructureRefSchema>;

export const ExistingSiloRefSchema = z.object({
  siloId: z.string().min(1),
  siloDnaVersionRef: VersionReferenceSchema,
  siloPageVersionRef: VersionReferenceSchema.nullable(),
}).strict();

/**
 * Referência de versão da consolidação, com `versionNumber`.
 *
 * `VersionReferenceSchema` ({ entityId, versionId, contentHash }) é usado por
 * `existingSiloRef`, `centralKeywordDnaRef` e `serpAssessmentRefs`, todos com
 * dados já persistidos: acrescentar um campo obrigatório lá quebraria a leitura
 * do histórico. Aqui a extensão é segura porque nenhum `consolidation` foi
 * gravado ainda — o caminho que o grava é justamente o que está sendo criado.
 *
 * `versionNumber` importa: `versionId` identifica a linha, mas só o número diz
 * QUAL passo da cadeia de sucessão consolidou o território.
 */
export const ConsolidationVersionReferenceSchema = VersionReferenceSchema.extend({
  versionNumber: z.number().int().positive(),
}).strict();
export type ConsolidationVersionReference = z.infer<typeof ConsolidationVersionReferenceSchema>;

export const TerritoryConsolidationSchema = z.object({
  siloId: z.string().min(1),
  siloDnaVersionRef: ConsolidationVersionReferenceSchema,
  siloPageVersionRef: ConsolidationVersionReferenceSchema,
  consolidatedAt: z.string().min(1),
}).strict();

/**
 * Continuidade narrativa: um território não é um agrupamento lexical. Estes
 * campos existem porque similaridade de texto não distingue "mesmo assunto" de
 * "mesma linha editorial da Marca".
 */
// O primitivo da narrativa vive em territory-narrative.ts para que contracts.ts
// (SiloDNA) possa preservar um snapshot dela sem fechar ciclo de import.
// Reexportado aqui para nao quebrar nenhum consumidor existente.
export {
  TerritoryNarrativeSchema,
  emptyTerritoryNarrative,
  type TerritoryNarrative,
} from "./territory-narrative.ts";

/* -------------------------------- descoberta ----------------------------- */

/**
 * Sugestão de keyword nascida da SERP ou da IA. Ela NÃO é keyword: só vira
 * membership depois de existir como KeywordDNA no Minerador.
 */
export const DiscoveredKeywordSuggestionSchema = z.object({
  suggestionId: z.string().min(1),
  text: z.string().min(1),
  source: z.enum(["serp", "ai"]),
  rationale: z.string().min(1),
  observedAt: z.string().min(1),
  status: z.enum(["pending_minerador", "sent_to_minerador", "rejected"]),
  keywordDnaId: z.string().min(1).nullable(),
}).strict();
export type DiscoveredKeywordSuggestion = z.infer<typeof DiscoveredKeywordSuggestionSchema>;

export const TerritoryDiscoverySchema = z.object({
  discoveredBy: z.enum(["serp", "ai", "human"]).nullable(),
  centralEntityInKeywordUniverse: z.boolean(),
  keywordSuggestions: z.array(DiscoveredKeywordSuggestionSchema),
}).strict();
export type TerritoryDiscovery = z.infer<typeof TerritoryDiscoverySchema>;

export const emptyTerritoryDiscovery = (): TerritoryDiscovery =>
  ({ discoveredBy: null, centralEntityInKeywordUniverse: true, keywordSuggestions: [] });

/**
 * Só uma sugestão já materializada como KeywordDNA pode virar membership. Texto
 * sugerido não é identidade de keyword.
 */
export function suggestionUsableAsKeywordId(suggestion: DiscoveredKeywordSuggestion): string | null {
  return suggestion.status === "sent_to_minerador" && suggestion.keywordDnaId
    ? suggestion.keywordDnaId
    : null;
}

/* ------------------------------- proveniência ---------------------------- */

export const TerritoryProvenanceSchema = z.object({
  producedBy: z.enum(["engine", "serp", "ai", "human", "system"]),
  adoptedFromScenarioType: z.enum(["base", "logic", "serp", "ai", "human", "current"]).nullable(),
  humanAdjustmentCount: z.number().int().nonnegative(),
  note: z.string().min(1).nullable(),
}).strict();
export type TerritoryProvenance = z.infer<typeof TerritoryProvenanceSchema>;

/* -------------------------------- território ----------------------------- */

export const TerritoryCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  territoryRef: TerritoryRefSchema,
  brandId: z.string().min(1),

  existingSiloRef: ExistingSiloRefSchema.nullable(),
  /**
   * Página publicada observada que originou este candidato.
   *
   * NÃO é `existingSiloRef`: aquele significa "Silo canônico já existente" e
   * exige SiloDNA. Uma página do site é patrimônio publicado sem SiloDNA —
   * fabricar um `siloId` para caber no schema criaria identidade falsa.
   *
   * Aditivo e opcional: todo território anterior continua válido, e o payload é
   * jsonb, então nenhuma migration é necessária.
   */
  publishedStructureRef: PublishedStructureRefSchema.nullable().optional(),

  name: z.string().min(1).nullable(),
  centralEntity: z.string(),
  macroIntent: z.string(),
  boundary: z.object({
    includes: z.array(z.string().min(1)),
    excludes: z.array(z.string().min(1)),
  }).strict(),
  narrative: TerritoryNarrativeSchema,
  discovery: TerritoryDiscoverySchema,

  territoryKind: TerritoryKindSchema,
  architecturalOrigin: TerritoryArchitecturalOriginSchema,
  ingestionOrigin: TerritoryIngestionOriginSchema.nullable(),
  lifecycleStatus: TerritoryLifecycleStatusSchema,
  decisionState: TerritoryDecisionStateSchema,
  publicationProtection: TerritoryPublicationProtectionSchema,

  slugState: TerritorySlugStateSchema,
  lineage: TerritoryLineageSchema,
  consolidation: TerritoryConsolidationSchema.nullable(),
  pendingOperation: MembershipOperationSchema.nullable(),

  conflicts: z.array(TerritoryConflictSchema),
  reasons: z.array(z.string().min(1)),
  provenance: TerritoryProvenanceSchema,
}).strict().superRefine((territory, context) => {
  if (territory.architecturalOrigin === "existing" && !territory.existingSiloRef) {
    context.addIssue({ code: "custom", path: ["existingSiloRef"], message: "Território de origem existente precisa referenciar o Silo canônico." });
  }
  if (territory.lifecycleStatus === "consolidated" && !territory.consolidation) {
    context.addIssue({ code: "custom", path: ["consolidation"], message: "Território consolidado precisa registrar SiloDNA e SiloPage resultantes." });
  }
  if (territory.consolidation && territory.lifecycleStatus !== "consolidated" && territory.lifecycleStatus !== "superseded" && territory.lifecycleStatus !== "archived") {
    context.addIssue({ code: "custom", path: ["lifecycleStatus"], message: "Referências de consolidação só existem a partir do estado consolidado." });
  }
  if (territory.lifecycleStatus === "confirmed" && territory.decisionState !== "confirmed") {
    context.addIssue({ code: "custom", path: ["decisionState"], message: "Território confirmado exige decisão humana confirmada." });
  }
  if (territory.lifecycleStatus === "rejected" && territory.decisionState !== "rejected") {
    context.addIssue({ code: "custom", path: ["decisionState"], message: "Território rejeitado exige decisão humana rejeitada." });
  }
});
export type TerritoryCandidate = z.infer<typeof TerritoryCandidateSchema>;

/* ------------------------------- membership ------------------------------ */

export const TERRITORY_MEMBERSHIP_STATES = [
  "existing_silo_match",
  "expand_existing_silo",
  "new_silo_candidate",
  "ambiguous_silo",
  "conflicting_silo",
  "unassigned",
] as const;
export const TerritoryMembershipStateSchema = z.enum(TERRITORY_MEMBERSHIP_STATES);
export type TerritoryMembershipState = z.infer<typeof TerritoryMembershipStateSchema>;

/**
 * FONTE CANÔNICA da membership, gravada no payload do item de workflow da
 * própria keyword. `territoryRef: null` é um estado legível — "sem território" —
 * e exige motivo. Ausência nunca substitui decisão.
 */
export const KeywordTerritoryAssignmentSchema = z.object({
  keywordId: z.string().min(1),
  brandId: z.string().min(1),
  territoryRef: TerritoryRefSchema.nullable(),
  state: TerritoryMembershipStateSchema,
  reason: z.string().min(1),
  source: z.enum(["logic", "serp", "ai", "human", "system"]),
  decidedAt: z.string().min(1),
}).strict().superRefine((assignment, context) => {
  if (assignment.territoryRef === null && assignment.state !== "unassigned") {
    context.addIssue({ code: "custom", path: ["state"], message: "Sem território, o estado precisa ser unassigned." });
  }
  if (assignment.territoryRef !== null && assignment.state === "unassigned") {
    context.addIssue({ code: "custom", path: ["territoryRef"], message: "O estado unassigned não aceita território atribuído." });
  }
});
export type KeywordTerritoryAssignment = z.infer<typeof KeywordTerritoryAssignmentSchema>;

/**
 * SHAPE PERSISTIDO da decisão territorial da keyword, gravado em
 * `payload.territoryAssignment`. Deliberadamente SEM `territoryRef`: o ponteiro
 * de membership é `payload.territoryRef`, e só ele. Guardar a referência aqui
 * também criaria uma segunda fonte capaz de divergir da primeira, sem regra de
 * desempate. Também sem `keywordId`/`brandId` (o item de workflow já é a
 * identidade e o tenant) e sem qualquer lista de keywords.
 */
export const KeywordTerritoryDecisionSchema = z.object({
  state: TerritoryMembershipStateSchema,
  reason: z.string().min(1),
  source: z.enum(["logic", "serp", "ai", "human", "system"]),
  decidedAt: z.string().min(1),
}).strict();
export type KeywordTerritoryDecision = z.infer<typeof KeywordTerritoryDecisionSchema>;

/**
 * Três estados de endereçamento territorial de uma keyword. `unaddressed` NÃO é
 * uma decisão: é a ausência dela. Colapsá-lo em `explicit_unassigned` faria uma
 * keyword nunca examinada parecer uma keyword que um humano decidiu deixar de
 * fora — e some com a pendência de integridade.
 */
export const KEYWORD_TERRITORY_STATES = ["assigned", "explicit_unassigned", "unaddressed"] as const;
export type KeywordTerritoryState = (typeof KEYWORD_TERRITORY_STATES)[number];

export const KEYWORD_TERRITORY_STATE_ISSUE_CODES = [
  "ASSIGNED_WITHOUT_TERRITORY_REF",
  "UNASSIGNED_WITH_TERRITORY_REF",
  "TERRITORY_REF_WITHOUT_DECISION",
  "TERRITORY_REF_INVALID",
  "TERRITORY_DECISION_INVALID",
] as const;
export type KeywordTerritoryStateIssue = (typeof KEYWORD_TERRITORY_STATE_ISSUE_CODES)[number];

export type KeywordTerritoryStateResolution =
  | { state: KeywordTerritoryState; territoryRef: TerritoryRef | null; decision: KeywordTerritoryDecision | null; issues: [] }
  | { state: "incoherent"; territoryRef: null; decision: null; issues: KeywordTerritoryStateIssue[] };

/**
 * Lê o par (`territoryRef`, `territoryAssignment`) de um payload legado ou atual
 * e devolve o estado de endereçamento. Estado incoerente é RECUSADO, nunca
 * normalizado: silenciar a incoerência escolheria um dos dois lados sem
 * autoridade para isso.
 *
 * Payload legado — sem nenhum dos dois campos — resolve `unaddressed`. Nada em
 * `siloId`, `lista_id`, `clusterId` ou `workingArticleId` é lido aqui: nenhuma
 * dessas identidades é território (C4).
 */
export function resolveKeywordTerritoryState(payload: unknown): KeywordTerritoryStateResolution {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const rawRef = record.territoryRef;
  const rawDecision = record.territoryAssignment;
  const hasRef = rawRef !== undefined && rawRef !== null;
  const hasDecision = rawDecision !== undefined && rawDecision !== null;
  const issues: KeywordTerritoryStateIssue[] = [];

  let territoryRef: TerritoryRef | null = null;
  if (hasRef) {
    const parsedRef = TerritoryRefSchema.safeParse(rawRef);
    if (parsedRef.success) territoryRef = parsedRef.data;
    else issues.push("TERRITORY_REF_INVALID");
  }

  let decision: KeywordTerritoryDecision | null = null;
  if (hasDecision) {
    const parsedDecision = KeywordTerritoryDecisionSchema.safeParse(rawDecision);
    if (parsedDecision.success) decision = parsedDecision.data;
    else issues.push("TERRITORY_DECISION_INVALID");
  }

  if (!issues.length) {
    if (territoryRef && decision && decision.state !== "unassigned") {
      return { state: "assigned", territoryRef, decision, issues: [] };
    }
    if (!territoryRef && decision && decision.state === "unassigned") {
      return { state: "explicit_unassigned", territoryRef: null, decision, issues: [] };
    }
    if (!territoryRef && !decision) {
      return { state: "unaddressed", territoryRef: null, decision: null, issues: [] };
    }
    if (territoryRef && decision && decision.state === "unassigned") issues.push("UNASSIGNED_WITH_TERRITORY_REF");
    else if (territoryRef && !decision) issues.push("TERRITORY_REF_WITHOUT_DECISION");
    else if (!territoryRef && decision) issues.push("ASSIGNED_WITHOUT_TERRITORY_REF");
  }
  return { state: "incoherent", territoryRef: null, decision: null, issues };
}

/**
 * PROJEÇÕES DERIVADAS. Não existem como arrays persistidos em lugar nenhum:
 * são recalculadas a cada leitura a partir do payload de cada keyword.
 */
export function projectKeywordTerritoryStates(
  payloads: ReadonlyMap<string, unknown>,
): {
  assignedKeywordIds: string[];
  unassignedKeywordIds: string[];
  unaddressedKeywordIds: string[];
  incoherentKeywordIds: string[];
} {
  const buckets = { assignedKeywordIds: [] as string[], unassignedKeywordIds: [] as string[], unaddressedKeywordIds: [] as string[], incoherentKeywordIds: [] as string[] };
  for (const [keywordId, payload] of payloads) {
    const resolution = resolveKeywordTerritoryState(payload);
    if (resolution.state === "assigned") buckets.assignedKeywordIds.push(keywordId);
    else if (resolution.state === "explicit_unassigned") buckets.unassignedKeywordIds.push(keywordId);
    else if (resolution.state === "unaddressed") buckets.unaddressedKeywordIds.push(keywordId);
    else buckets.incoherentKeywordIds.push(keywordId);
  }
  for (const list of Object.values(buckets)) list.sort();
  return buckets;
}

/**
 * DERIVED_PROJECTION. Calculada na leitura a partir da fonte única; não existe
 * caminho de escrita que produza `keywordRefs`.
 */
export function projectTerritoryMembership(
  assignments: readonly KeywordTerritoryAssignment[],
): Map<string, string[]> {
  const projection = new Map<string, string[]>();
  for (const assignment of assignments) {
    if (!assignment.territoryRef) continue;
    const current = projection.get(assignment.territoryRef) || [];
    if (!current.includes(assignment.keywordId)) current.push(assignment.keywordId);
    projection.set(assignment.territoryRef, current);
  }
  for (const [ref, keywordIds] of projection) projection.set(ref, [...keywordIds].sort());
  return projection;
}

export const unassignedKeywordIds = (assignments: readonly KeywordTerritoryAssignment[]): string[] =>
  assignments.filter(assignment => assignment.territoryRef === null).map(assignment => assignment.keywordId).sort();

export function keywordsBelongToTerritory(
  assignments: readonly KeywordTerritoryAssignment[],
  territoryRef: TerritoryRef,
  keywordIds: readonly string[],
): { ok: boolean; foreignKeywordIds: string[] } {
  const members = new Set(projectTerritoryMembership(assignments).get(territoryRef) || []);
  const foreignKeywordIds = [...new Set(keywordIds)].filter(keywordId => !members.has(keywordId)).sort();
  return { ok: foreignKeywordIds.length === 0, foreignKeywordIds };
}

/* ------------------------------- consistência ---------------------------- */

export const MEMBERSHIP_ISSUE_CODES = [
  "ORPHAN_TERRITORY_REF",
  "EMPTY_TERRITORY",
  "UNASSIGNED_WITHOUT_REASON",
  "TERRITORY_WITHOUT_DECISION",
  "DUPLICATE_EXISTING_SILO_ANCHOR",
  "CROSS_BRAND_MEMBERSHIP",
  "PUBLISHED_PROTECTION_VIOLATION",
  "PARTIAL_MEMBERSHIP_OPERATION",
  "DUPLICATE_KEYWORD_MEMBERSHIP",
  "TERRITORIAL_CONFLICT_OPEN",
] as const;
export type MembershipIssueCode = (typeof MEMBERSHIP_ISSUE_CODES)[number];

export type MembershipIssue = {
  code: MembershipIssueCode;
  territoryRef?: string;
  keywordId?: string;
  detail?: string;
};

export type MembershipConsistencyReport = {
  consistent: boolean;
  issues: MembershipIssue[];
  issuesByTerritory: Map<string, MembershipIssue[]>;
};

const VALID_MEMBERSHIP_TARGET_STATUSES: readonly TerritoryLifecycleStatus[] = ["candidate", "confirmed", "consolidated"];

export function checkTerritorialConsistency(input: {
  brandId: string;
  territories: readonly TerritoryCandidate[];
  assignments: readonly KeywordTerritoryAssignment[];
}): MembershipConsistencyReport {
  const issues: MembershipIssue[] = [];
  const territoryByRef = new Map(input.territories.map(territory => [territory.territoryRef, territory]));

  for (const territory of input.territories) {
    if (territory.brandId !== input.brandId) {
      issues.push({ code: "CROSS_BRAND_MEMBERSHIP", territoryRef: territory.territoryRef, detail: territory.brandId });
    }
    if (territory.decisionState === "pending" && territory.lifecycleStatus !== "candidate") {
      issues.push({ code: "TERRITORY_WITHOUT_DECISION", territoryRef: territory.territoryRef, detail: territory.lifecycleStatus });
    }
    if (isPartialMembershipOperation(territory.pendingOperation)) {
      issues.push({ code: "PARTIAL_MEMBERSHIP_OPERATION", territoryRef: territory.territoryRef, detail: territory.pendingOperation!.operationId });
    }
    if (hasOpenTerritorialConflict(territory.conflicts)) {
      issues.push({ code: "TERRITORIAL_CONFLICT_OPEN", territoryRef: territory.territoryRef });
    }
  }

  // Duas âncoras para o mesmo Silo existente significam que dois territórios
  // reivindicam a mesma identidade canônica.
  const anchorOwners = new Map<string, string[]>();
  for (const territory of input.territories) {
    const siloId = territory.existingSiloRef?.siloId;
    if (!siloId) continue;
    anchorOwners.set(siloId, [...(anchorOwners.get(siloId) || []), territory.territoryRef]);
  }
  for (const [siloId, refs] of anchorOwners) {
    if (refs.length > 1) {
      for (const ref of refs) issues.push({ code: "DUPLICATE_EXISTING_SILO_ANCHOR", territoryRef: ref, detail: siloId });
    }
  }

  const seenKeywordIds = new Map<string, string[]>();
  for (const assignment of input.assignments) {
    seenKeywordIds.set(assignment.keywordId, [
      ...(seenKeywordIds.get(assignment.keywordId) || []),
      assignment.territoryRef || "unassigned",
    ]);
    if (assignment.brandId !== input.brandId) {
      issues.push({ code: "CROSS_BRAND_MEMBERSHIP", keywordId: assignment.keywordId, detail: assignment.brandId });
    }
    if (!assignment.reason.trim()) {
      issues.push({ code: "UNASSIGNED_WITHOUT_REASON", keywordId: assignment.keywordId });
    }
    if (!assignment.territoryRef) continue;
    const territory = territoryByRef.get(assignment.territoryRef);
    if (!territory || !VALID_MEMBERSHIP_TARGET_STATUSES.includes(territory.lifecycleStatus)) {
      issues.push({
        code: "ORPHAN_TERRITORY_REF",
        keywordId: assignment.keywordId,
        territoryRef: assignment.territoryRef,
        detail: territory ? territory.lifecycleStatus : "território inexistente",
      });
    }
  }

  for (const [keywordId, targets] of seenKeywordIds) {
    if (targets.length > 1) {
      issues.push({ code: "DUPLICATE_KEYWORD_MEMBERSHIP", keywordId, detail: targets.join(", ") });
    }
  }

  const membership = projectTerritoryMembership(input.assignments);
  for (const territory of input.territories) {
    if (territory.lifecycleStatus !== "candidate" && territory.lifecycleStatus !== "confirmed") continue;
    if (!(membership.get(territory.territoryRef) || []).length) {
      issues.push({ code: "EMPTY_TERRITORY", territoryRef: territory.territoryRef });
    }
  }

  const issuesByTerritory = new Map<string, MembershipIssue[]>();
  for (const issue of issues) {
    if (!issue.territoryRef) continue;
    issuesByTerritory.set(issue.territoryRef, [...(issuesByTerritory.get(issue.territoryRef) || []), issue]);
  }

  // Território vazio é pendência, não incoerência: ele existe e ainda não
  // recebeu membership.
  const blocking = issues.filter(issue => issue.code !== "EMPTY_TERRITORY");
  return { consistent: blocking.length === 0, issues, issuesByTerritory };
}

/* --------------------------------- readiness ----------------------------- */

export const TERRITORY_CONFIRMATION_BLOCKERS: readonly MembershipIssueCode[] = [
  "ORPHAN_TERRITORY_REF",
  "UNASSIGNED_WITHOUT_REASON",
  "TERRITORY_WITHOUT_DECISION",
  "DUPLICATE_EXISTING_SILO_ANCHOR",
  "CROSS_BRAND_MEMBERSHIP",
  "PUBLISHED_PROTECTION_VIOLATION",
  "PARTIAL_MEMBERSHIP_OPERATION",
  "DUPLICATE_KEYWORD_MEMBERSHIP",
  "TERRITORIAL_CONFLICT_OPEN",
  "EMPTY_TERRITORY",
];

export const TERRITORY_CONTENT_ISSUE_CODES = [
  "TERRITORY_WITHOUT_CENTRAL_ENTITY",
  "TERRITORY_WITHOUT_MACRO_INTENT",
  "TERRITORY_WITHOUT_BOUNDARY",
  "TERRITORY_NARRATIVE_UNRESOLVED",
] as const;
export type TerritoryContentIssueCode = (typeof TERRITORY_CONTENT_ISSUE_CODES)[number];

/**
 * Evidência que depende da Etapa 0 da Marca. Adiada, não fabricada: um território
 * de origem existente só é conferível contra o catálogo publicado, e enquanto
 * ele não existir a ausência de prova não vira prova de ausência.
 */
export const DEFERRED_EXTERNAL_EVIDENCE = "DEFERRED_EXTERNAL_EVIDENCE" as const;

export type TerritoryBlocker = {
  code: MembershipIssueCode | TerritoryContentIssueCode;
  territoryRef?: string;
  keywordId?: string;
  detail?: string;
};

export type TerritoryDeferral = { code: typeof DEFERRED_EXTERNAL_EVIDENCE; detail: string };

export type TerritoryReadiness =
  | { state: "ready"; blockers: []; deferred: TerritoryDeferral[] }
  | { state: "blocked"; blockers: TerritoryBlocker[]; deferred: TerritoryDeferral[] };

function readinessFrom(blockers: TerritoryBlocker[], deferred: TerritoryDeferral[] = []): TerritoryReadiness {
  return blockers.length ? { state: "blocked", blockers, deferred } : { state: "ready", blockers: [], deferred };
}

/**
 * Conteúdo mínimo para um território ser confirmável. Similaridade lexical não
 * sustenta território: sem entidade central, intenção macro, fronteira e
 * narrativa resolvida, o que existe é um agrupamento, não uma área editorial.
 */
export function territoryContentIssues(territory: TerritoryCandidate): TerritoryBlocker[] {
  const issues: TerritoryBlocker[] = [];
  const ref = territory.territoryRef;
  if (!territory.centralEntity.trim()) issues.push({ code: "TERRITORY_WITHOUT_CENTRAL_ENTITY", territoryRef: ref });
  if (!territory.macroIntent.trim()) issues.push({ code: "TERRITORY_WITHOUT_MACRO_INTENT", territoryRef: ref });
  if (!territory.boundary.includes.length) issues.push({ code: "TERRITORY_WITHOUT_BOUNDARY", territoryRef: ref });
  if (territory.narrative.continuity === "unknown" || territory.narrative.brandAlignment === "unknown") {
    issues.push({
      code: "TERRITORY_NARRATIVE_UNRESOLVED",
      territoryRef: ref,
      detail: `continuity=${territory.narrative.continuity} brandAlignment=${territory.narrative.brandAlignment}`,
    });
  }
  return issues;
}

export function resolveTerritoryConfirmationReadiness(input: {
  territory: TerritoryCandidate;
  report: MembershipConsistencyReport;
}): TerritoryReadiness {
  const { territory, report } = input;
  const blockers: TerritoryBlocker[] = [];

  const transition = canTransitionTerritoryLifecycle(territory.lifecycleStatus, "confirmed");
  if (!transition.allowed) {
    blockers.push({ code: "TERRITORY_WITHOUT_DECISION", territoryRef: territory.territoryRef, detail: transition.reason });
  }
  for (const issue of report.issuesByTerritory.get(territory.territoryRef) || []) {
    if (TERRITORY_CONFIRMATION_BLOCKERS.includes(issue.code)) blockers.push(issue);
  }
  // Problemas sem território atrelado que ainda assim impedem confirmar.
  for (const issue of report.issues) {
    if (issue.territoryRef) continue;
    if (issue.code === "DUPLICATE_KEYWORD_MEMBERSHIP" || issue.code === "CROSS_BRAND_MEMBERSHIP") blockers.push(issue);
  }
  blockers.push(...territoryContentIssues(territory));

  const deferred: TerritoryDeferral[] = territory.architecturalOrigin === "existing"
    ? [{ code: DEFERRED_EXTERNAL_EVIDENCE, detail: "Conferência contra o catálogo publicado da Marca depende da Etapa 0." }]
    : [];

  return readinessFrom(blockers, deferred);
}

/* -------------------------- formação de Article -------------------------- */

export const ARTICLE_FORMATION_REFUSAL_CODES = [
  "TERRITORY_NOT_CONFIRMED",
  "TERRITORY_CONSISTENCY_BLOCKED",
  "TERRITORY_WITHOUT_KEYWORDS",
  "KEYWORD_OUTSIDE_TERRITORY",
  "SUCCESSOR_REQUIRED",
] as const;
export type ArticleFormationRefusalCode = (typeof ARTICLE_FORMATION_REFUSAL_CODES)[number];

export type ArticleFormationReadiness =
  | { state: "allowed"; territoryRef: TerritoryRef; keywordIds: string[]; refusals: [] }
  | { state: "blocked"; territoryRef: TerritoryRef; keywordIds: string[]; refusals: Array<{ code: ArticleFormationRefusalCode; detail: string }> };

/**
 * Gate de entrada da formação de Article no fluxo novo: território confirmado,
 * consistência sem bloqueadores e keywords que realmente pertencem a ele.
 * Nunca o universo global da Brand.
 */
export function resolveArticleFormationReadiness(input: {
  territory: TerritoryCandidate;
  report: MembershipConsistencyReport;
  assignments: readonly KeywordTerritoryAssignment[];
  requestedKeywordIds?: readonly string[];
}): ArticleFormationReadiness {
  const { territory, report } = input;
  const members = projectTerritoryMembership(input.assignments).get(territory.territoryRef) || [];
  const keywordIds = input.requestedKeywordIds ? [...new Set(input.requestedKeywordIds)].sort() : members;
  const refusals: Array<{ code: ArticleFormationRefusalCode; detail: string }> = [];

  if (territory.lifecycleStatus === "consolidated") {
    refusals.push({ code: "SUCCESSOR_REQUIRED", detail: "Território consolidado exige sucessor antes de nova formação." });
  } else if (territory.lifecycleStatus !== "confirmed" || territory.decisionState !== "confirmed") {
    refusals.push({ code: "TERRITORY_NOT_CONFIRMED", detail: `lifecycleStatus=${territory.lifecycleStatus}` });
  }

  const blocking = (report.issuesByTerritory.get(territory.territoryRef) || [])
    .filter(issue => TERRITORY_CONFIRMATION_BLOCKERS.includes(issue.code) && issue.code !== "EMPTY_TERRITORY");
  if (blocking.length) {
    refusals.push({ code: "TERRITORY_CONSISTENCY_BLOCKED", detail: blocking.map(issue => issue.code).join(", ") });
  }
  if (!members.length) {
    refusals.push({ code: "TERRITORY_WITHOUT_KEYWORDS", detail: territory.territoryRef });
  }
  const scope = keywordsBelongToTerritory(input.assignments, territory.territoryRef, keywordIds);
  if (!scope.ok) {
    refusals.push({ code: "KEYWORD_OUTSIDE_TERRITORY", detail: scope.foreignKeywordIds.join(", ") });
  }

  return refusals.length
    ? { state: "blocked", territoryRef: territory.territoryRef, keywordIds, refusals }
    : { state: "allowed", territoryRef: territory.territoryRef, keywordIds, refusals: [] };
}

/* --------------------------------- split (E2) ---------------------------- */

export const SPLIT_REFUSAL_CODES = [
  "SPLIT_CONTINUATION_NOT_DECLARED",
  "SPLIT_CONTINUATION_UNKNOWN_PART",
  "SPLIT_REQUIRES_TWO_PARTS",
  "SPLIT_DUPLICATE_KEYWORD",
  "SPLIT_KEYWORD_LOST",
  "SUCCESSOR_REQUIRED",
  "PUBLISHED_PROTECTION_VIOLATION",
] as const;
export type SplitRefusalCode = (typeof SPLIT_REFUSAL_CODES)[number];

export type TerritorySplitRequest = {
  source: TerritoryCandidate;
  parts: ReadonlyArray<{ partId: string; keywordIds: readonly string[] }>;
  /** Escolha HUMANA de qual parte herda a identidade. Nunca inferida. */
  continuingPartId: string | null;
  currentMemberKeywordIds: readonly string[];
  /** Autor da decisão estrutural. O plano é registrado como MembershipOperation. */
  actorUserId: string;
  decidedAt: string;
  refFactory?: () => TerritoryRef;
};

export type TerritorySplitPlan = {
  operationId: string;
  sourceTerritoryRef: TerritoryRef;
  continuingTerritoryRef: TerritoryRef;
  createdTerritoryRefs: TerritoryRef[];
  parts: Array<{ partId: string; territoryRef: TerritoryRef; keywordIds: string[]; isContinuation: boolean }>;
  sourceLineage: TerritoryLineage;
  createdLineageByRef: Map<string, TerritoryLineage>;
};

export type TerritorySplitResult =
  | { ok: true; plan: TerritorySplitPlan }
  | { ok: false; refusals: Array<{ code: SplitRefusalCode; detail: string }> };

/**
 * E2 — a parte que CONTINUA o território precisa ser declarada por um humano.
 * Tamanho, ordem, volume, SERP e IA não elegem continuidade.
 */
export function planTerritorySplit(request: TerritorySplitRequest): TerritorySplitResult {
  const refusals: Array<{ code: SplitRefusalCode; detail: string }> = [];

  const structural = structuralChangeRefusal(request.source);
  if (structural) refusals.push({ code: structural.code, detail: structural.reason });

  if (request.parts.length < 2) {
    refusals.push({ code: "SPLIT_REQUIRES_TWO_PARTS", detail: String(request.parts.length) });
  }
  if (!request.continuingPartId) {
    refusals.push({ code: "SPLIT_CONTINUATION_NOT_DECLARED", detail: "A parte que herda a identidade precisa ser escolhida explicitamente." });
  } else if (!request.parts.some(part => part.partId === request.continuingPartId)) {
    refusals.push({ code: "SPLIT_CONTINUATION_UNKNOWN_PART", detail: request.continuingPartId });
  }

  const seen = new Map<string, number>();
  for (const part of request.parts) {
    for (const keywordId of part.keywordIds) seen.set(keywordId, (seen.get(keywordId) || 0) + 1);
  }
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([keywordId]) => keywordId).sort();
  if (duplicated.length) refusals.push({ code: "SPLIT_DUPLICATE_KEYWORD", detail: duplicated.join(", ") });

  const lost = [...new Set(request.currentMemberKeywordIds)].filter(keywordId => !seen.has(keywordId)).sort();
  if (lost.length) refusals.push({ code: "SPLIT_KEYWORD_LOST", detail: lost.join(", ") });

  if (refusals.length) return { ok: false, refusals };

  const newRef = request.refFactory || (() => buildTerritoryRef());
  const createdTerritoryRefs: TerritoryRef[] = [];
  const createdLineageByRef = new Map<string, TerritoryLineage>();
  const parts = request.parts.map(part => {
    const isContinuation = part.partId === request.continuingPartId;
    const territoryRef = isContinuation ? request.source.territoryRef : newRef();
    if (!isContinuation) {
      createdTerritoryRefs.push(territoryRef);
      createdLineageByRef.set(territoryRef, { ...emptyTerritoryLineage(), splitFromTerritoryRef: request.source.territoryRef });
    }
    return { partId: part.partId, territoryRef, keywordIds: [...new Set(part.keywordIds)].sort(), isContinuation };
  });

  return {
    ok: true,
    plan: {
      operationId: `split:${request.source.territoryRef}:${request.decidedAt}`,
      sourceTerritoryRef: request.source.territoryRef,
      continuingTerritoryRef: request.source.territoryRef,
      createdTerritoryRefs,
      parts,
      sourceLineage: {
        ...request.source.lineage,
        splitIntoTerritoryRefs: [...new Set([...request.source.lineage.splitIntoTerritoryRefs, ...createdTerritoryRefs])].sort(),
      },
      createdLineageByRef,
    },
  };
}

/* --------------------------------- merge (E3) ---------------------------- */

export const MERGE_REFUSAL_CODES = [
  "MERGE_SURVIVOR_NOT_DECLARED",
  "MERGE_SURVIVOR_NOT_PARTICIPANT",
  "MERGE_REQUIRES_TWO_TERRITORIES",
  "MERGE_OF_TWO_EXISTING_ANCHORS",
  "SUCCESSOR_REQUIRED",
  "PUBLISHED_PROTECTION_VIOLATION",
] as const;
export type MergeRefusalCode = (typeof MERGE_REFUSAL_CODES)[number];

export type TerritoryMergeRequest = {
  territories: readonly TerritoryCandidate[];
  /** Escolha HUMANA de qual território sobrevive. Nunca inferida. */
  survivingTerritoryRef: TerritoryRef | null;
  assignments: readonly KeywordTerritoryAssignment[];
  /** Autor da decisão estrutural. O plano é registrado como MembershipOperation. */
  actorUserId: string;
  decidedAt: string;
};

export type TerritoryMergePlan = {
  operationId: string;
  survivingTerritoryRef: TerritoryRef;
  absorbedTerritoryRefs: TerritoryRef[];
  keywordReassignments: Array<{ keywordId: string; fromTerritoryRef: string | null; toTerritoryRef: TerritoryRef }>;
  survivorLineage: TerritoryLineage;
  absorbedLineageByRef: Map<string, TerritoryLineage>;
};

export type TerritoryMergeResult =
  | { ok: true; plan: TerritoryMergePlan }
  | { ok: false; refusals: Array<{ code: MergeRefusalCode; detail: string }> };

/**
 * E3 — fundir dois territórios que já são âncoras de Silos existentes distintos
 * é recusado: seriam duas identidades canônicas publicadas colapsando numa só.
 */
export function planTerritoryMerge(request: TerritoryMergeRequest): TerritoryMergeResult {
  const refusals: Array<{ code: MergeRefusalCode; detail: string }> = [];

  if (request.territories.length < 2) {
    refusals.push({ code: "MERGE_REQUIRES_TWO_TERRITORIES", detail: String(request.territories.length) });
  }
  if (!request.survivingTerritoryRef) {
    refusals.push({ code: "MERGE_SURVIVOR_NOT_DECLARED", detail: "O território sobrevivente precisa ser escolhido explicitamente." });
  } else if (!request.territories.some(territory => territory.territoryRef === request.survivingTerritoryRef)) {
    refusals.push({ code: "MERGE_SURVIVOR_NOT_PARTICIPANT", detail: request.survivingTerritoryRef });
  }

  const distinctAnchors = [...new Set(
    request.territories.map(territory => territory.existingSiloRef?.siloId).filter((siloId): siloId is string => Boolean(siloId)),
  )];
  if (distinctAnchors.length > 1) {
    refusals.push({ code: "MERGE_OF_TWO_EXISTING_ANCHORS", detail: distinctAnchors.sort().join(", ") });
  }

  for (const territory of request.territories) {
    const structural = structuralChangeRefusal(territory);
    if (structural && structural.code === "SUCCESSOR_REQUIRED") {
      refusals.push({ code: "SUCCESSOR_REQUIRED", detail: `${territory.territoryRef}: ${structural.reason}` });
    }
    if (structural?.code === "PUBLISHED_PROTECTION_VIOLATION" && territory.territoryRef !== request.survivingTerritoryRef) {
      refusals.push({ code: "PUBLISHED_PROTECTION_VIOLATION", detail: territory.territoryRef });
    }
  }

  if (refusals.length) return { ok: false, refusals };

  const survivingTerritoryRef = request.survivingTerritoryRef as TerritoryRef;
  const absorbedTerritoryRefs = request.territories
    .map(territory => territory.territoryRef)
    .filter(ref => ref !== survivingTerritoryRef)
    .sort();
  const absorbed = new Set(absorbedTerritoryRefs);

  const keywordReassignments = request.assignments
    .filter(assignment => assignment.territoryRef && absorbed.has(assignment.territoryRef))
    .map(assignment => ({ keywordId: assignment.keywordId, fromTerritoryRef: assignment.territoryRef, toTerritoryRef: survivingTerritoryRef }))
    .sort((left, right) => left.keywordId.localeCompare(right.keywordId));

  const survivor = request.territories.find(territory => territory.territoryRef === survivingTerritoryRef)!;
  const absorbedLineageByRef = new Map<string, TerritoryLineage>();
  for (const territory of request.territories) {
    if (territory.territoryRef === survivingTerritoryRef) continue;
    absorbedLineageByRef.set(territory.territoryRef, { ...territory.lineage, supersededByTerritoryRef: survivingTerritoryRef });
  }

  return {
    ok: true,
    plan: {
      operationId: `merge:${survivingTerritoryRef}:${request.decidedAt}`,
      survivingTerritoryRef,
      absorbedTerritoryRefs,
      keywordReassignments,
      survivorLineage: {
        ...survivor.lineage,
        absorbedTerritoryRefs: [...new Set([...survivor.lineage.absorbedTerritoryRefs, ...absorbedTerritoryRefs])].sort(),
      },
      absorbedLineageByRef,
    },
  };
}

/**
 * ESTE SILO JÁ FOI DECIDIDO POR UM HUMANO?
 *
 * `consolidated` é um estado POSTERIOR a `confirmed`, não um estado diferente
 * dele: consolidar materializa SiloDNA e SiloPage a partir de uma confirmação
 * que continua valendo. Ler apenas `confirmed` fazia o Silo desaparecer do
 * universo da fase Artigos no instante em que era consolidado — a mesa
 * mostrava zero artigos logo depois de dar certo.
 *
 * Quem pergunta "posso confirmar de novo?" NÃO usa isto: essa pergunta é sobre
 * o que ainda falta, e um Silo consolidado já não está à espera.
 */
export function siloIsHumanDecided(lifecycleStatus: string | null | undefined): boolean {
  return lifecycleStatus === "confirmed" || lifecycleStatus === "consolidated";
}
