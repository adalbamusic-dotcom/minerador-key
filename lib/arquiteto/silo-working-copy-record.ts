import { z } from "zod";
import { TerritoryRefSchema, type TerritoryRef } from "./territory-ref.ts";

/**
 * REGISTRO CANÔNICO REMOTO DA WORKING COPY DE SILO — Fase 2C.3.
 *
 * A auditoria 2C.2 provou que `SiloWorkingCopy` existe só em memória: nenhuma
 * rota persiste o resultado de `formSiloWorkingCopies`, e um reload perde Pilar,
 * Suportes e exclusões. Este módulo dá autoridade remota a essas decisões,
 * reusando `editorial_workflow_items` — mesma tabela, mesmo stage e mesma
 * disciplina de lock que o registro territorial já usa. Nenhuma coluna nova.
 *
 * O que NÃO muda de dono: a membership Keyword → Território continua vindo do
 * item de workflow da keyword. Este registro referencia Articles já fechados;
 * não guarda coleção capaz de remapear keyword para outro território.
 */

export const SILO_WORKING_COPY_SUBJECT_TYPE = "silo_working_copy" as const;
export const SILO_WORKING_COPY_STAGE = "architect" as const;
export const SILO_WORKING_COPY_CONTRACT_VERSION = "silo-working-copy-v1" as const;
export const SILO_WORKING_COPY_REF_PREFIX = "silo-working-copy:";

/**
 * Identidade PRÓPRIA da working copy, DERIVADA do território.
 *
 * `SiloWorkingCopy.id` de hoje NÃO serve: para cópias novas ele é
 * `working-silo:<n>`, com `n` derivado da POSIÇÃO no laço de formação
 * (silo-formation.ts), e para cópias existentes é o `siloId` — que pode ser um
 * UUID cru vindo de `lista_id`. Nenhum dos dois é estável nem opaco.
 *
 * Um UUID aleatório também não serve, e este foi o defeito da 2C.3: duas
 * requisições de criação para o MESMO território geravam refs diferentes, dois
 * `subject_id` diferentes e duas linhas — a UNIQUE não participava de nada.
 * Derivar do `territoryRef` inteiro faz as duas requisições colidirem na UNIQUE
 * canônica, que é onde a garantia precisa morar.
 *
 * Derivado NÃO é sinônimo: `workingCopyRef` continua um espaço de identidade
 * distinto de `territoryRef`, de `siloId` e de `SiloWorkingCopy.id`.
 *
 * O prefixo protege `source_entity_id`: as RPCs de purga 0046/0047 apagam itens
 * de workflow por `source_entity_id = keyword.id::text`, e em 0047 esse DELETE
 * não filtra `subject_type`. Nada aqui é UUID cru.
 *
 * Comprimento: 18 + 10 + 36 = 64 caracteres. `subject_id` e `source_entity_id`
 * são `text` com CHECK apenas de `> 0` — sem máximo. Nada é truncado.
 */
export const SiloWorkingCopyRefSchema = z.string().refine(
  value => value.startsWith(SILO_WORKING_COPY_REF_PREFIX)
    && TerritoryRefSchema.safeParse(value.slice(SILO_WORKING_COPY_REF_PREFIX.length)).success,
  { message: "workingCopyRef precisa ser silo-working-copy:territory:<uuid>." },
);
export type SiloWorkingCopyRef = z.infer<typeof SiloWorkingCopyRefSchema>;

/**
 * DETERMINÍSTICO e server-side. O mesmo território devolve sempre o mesmo ref —
 * é isso que torna a criação idempotente na UNIQUE já materializada.
 */
export function buildSiloWorkingCopyRef(territoryRef: string): SiloWorkingCopyRef {
  const parsed = TerritoryRefSchema.safeParse(territoryRef);
  if (!parsed.success) throw new Error("workingCopyRef exige um territoryRef canônico.");
  return `${SILO_WORKING_COPY_REF_PREFIX}${parsed.data}`;
}

/** Território que originou o ref. Leitura inversa, para provar a derivação. */
export function territoryRefOfWorkingCopy(ref: string): string | null {
  if (!isSiloWorkingCopyRef(ref)) return null;
  return ref.slice(SILO_WORKING_COPY_REF_PREFIX.length);
}

export const isSiloWorkingCopyRef = (value: unknown): value is SiloWorkingCopyRef =>
  typeof value === "string" && SiloWorkingCopyRefSchema.safeParse(value).success;

/* ------------------------------- decisões -------------------------------- */

/**
 * §14/§15 — CANDIDATO ≠ SELECIONADO.
 *
 * `pillarCandidateArticleId` da working copy legada é SUGESTÃO: nasce de
 * `pillarScores[0]` em `silo-formation.ts` e é reescrito por propostas de IA.
 * O Pilar que a consolidação usa é ESTE registro, que só existe com ator,
 * momento, motivo e a composição sobre a qual se decidiu.
 */
export const HumanPillarSelectionSchema = z.object({
  articleId: z.string().min(1),
  actorUserId: z.string().min(1),
  decidedAt: z.string().min(1),
  reason: z.string().min(1),
  /** Composição vigente no momento da decisão — evita aprovar A e gravar B. */
  decidedOverArticleIds: z.array(z.string().min(1)).min(1),
}).strict();
export type HumanPillarSelection = z.infer<typeof HumanPillarSelectionSchema>;

export const SiloWorkingCopyExclusionSchema = z.object({
  articleId: z.string().min(1),
  actorUserId: z.string().min(1),
  decidedAt: z.string().min(1),
  reason: z.string().min(1),
}).strict();
export type SiloWorkingCopyExclusion = z.infer<typeof SiloWorkingCopyExclusionSchema>;

export const SiloWorkingCopyArticleRefSchema = z.object({
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  articleDnaContentHash: z.string().min(1),
}).strict();

/**
 * Estado mutável da working copy. `formationStatus` é o ÚNICO lifecycle daqui e
 * espelha `row.state`. Não existe `consumed`/`consolidated`/`published` nesta
 * linha: consolidação é representada pelo Território e pelos artefatos
 * versionados, e duplicar isso criaria duas fontes de ciclo de vida.
 */
export const SILO_WORKING_COPY_FORMATION_STATUSES = ["draft", "ready_for_review"] as const;

export const SiloWorkingCopyStateSchema = z.object({
  workingCopyRef: SiloWorkingCopyRefSchema,
  brandId: z.string().min(1),
  territoryRef: TerritoryRefSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  formationStatus: z.enum(SILO_WORKING_COPY_FORMATION_STATUSES),
  /** Silo canônico de origem, quando o território reconcilia com um existente. */
  existingSiloId: z.string().min(1).nullable(),
  /** Articles já fechados: referência VERSIONADA, nunca workingArticleId. */
  articleRefs: z.array(SiloWorkingCopyArticleRefSchema),
  /** Sugestão da Lógica/IA. NUNCA vira Pilar sozinha. */
  pillarSuggestionArticleId: z.string().min(1).nullable(),
  /** Decisão humana. É esta que a consolidação lê. */
  pillarSelection: HumanPillarSelectionSchema.nullable(),
  supportArticleIds: z.array(z.string().min(1)),
  exclusions: z.array(SiloWorkingCopyExclusionSchema),
  reasons: z.array(z.string().min(1)),
  conflicts: z.array(z.string().min(1)),
}).strict();
export type SiloWorkingCopyState = z.infer<typeof SiloWorkingCopyStateSchema>;

export const SiloWorkingCopyPayloadSchema = z.object({
  contractVersion: z.literal(SILO_WORKING_COPY_CONTRACT_VERSION),
  /**
   * Identidade no envelope, além de dentro do estado. A leitura exige que os
   * quatro lugares concordem — `subject_id`, `source_entity_id`, este campo e o
   * ref derivado de `workingCopy.territoryRef`.
   */
  workingCopyRef: SiloWorkingCopyRefSchema,
  workingCopy: SiloWorkingCopyStateSchema,
}).strict();
export type SiloWorkingCopyPayload = z.infer<typeof SiloWorkingCopyPayloadSchema>;

/* --------------------------------- linha --------------------------------- */

export type SiloWorkingCopyRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

export const SILO_WORKING_COPY_RECORD_ISSUES = [
  "SUBJECT_TYPE_MISMATCH",
  "STAGE_MISMATCH",
  "SUBJECT_ID_IS_NOT_WORKING_COPY_REF",
  "SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD",
  "SOURCE_ENTITY_ID_MISMATCH",
  "REF_NOT_DERIVED_FROM_TERRITORY",
  "STATE_DOES_NOT_MATCH_FORMATION_STATUS",
  "ARTICLE_ID_PRESENT",
  "PAYLOAD_INVALID",
  "CROSS_BRAND_RECORD",
] as const;
export type SiloWorkingCopyRecordIssue = (typeof SILO_WORKING_COPY_RECORD_ISSUES)[number];

export type SiloWorkingCopyReadResult =
  | { ok: true; workingCopy: SiloWorkingCopyState; issues: [] }
  | { ok: false; workingCopy: null; issues: SiloWorkingCopyRecordIssue[] };

export function buildSiloWorkingCopyRow(workingCopy: SiloWorkingCopyState) {
  const derived = buildSiloWorkingCopyRef(workingCopy.territoryRef);
  if (workingCopy.workingCopyRef !== derived) {
    throw new Error("workingCopyRef precisa ser derivado do territoryRef desta working copy.");
  }
  return {
    subjectType: SILO_WORKING_COPY_SUBJECT_TYPE,
    subjectId: derived,
    stage: SILO_WORKING_COPY_STAGE,
    state: workingCopy.formationStatus,
    // Igual ao subject_id, pelo mesmo motivo do registro territorial.
    sourceEntityId: derived,
    articleId: null as string | null,
    payload: SiloWorkingCopyPayloadSchema.parse({
      contractVersion: SILO_WORKING_COPY_CONTRACT_VERSION,
      workingCopyRef: derived,
      workingCopy,
    }) as SiloWorkingCopyPayload,
  };
}

/** Readback estrito: a linha precisa concordar consigo mesma e com a Brand. */
export function parseSiloWorkingCopyRow(row: SiloWorkingCopyRowInput, brandId: string): SiloWorkingCopyReadResult {
  const issues: SiloWorkingCopyRecordIssue[] = [];
  if (row.subjectType !== SILO_WORKING_COPY_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== SILO_WORKING_COPY_STAGE) issues.push("STAGE_MISMATCH");
  if (!isSiloWorkingCopyRef(row.subjectId)) issues.push("SUBJECT_ID_IS_NOT_WORKING_COPY_REF");
  if (row.sourceEntityId !== row.subjectId) issues.push("SOURCE_ENTITY_ID_MISMATCH");
  if (row.articleId !== null && row.articleId !== undefined) issues.push("ARTICLE_ID_PRESENT");

  const parsed = SiloWorkingCopyPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, workingCopy: null, issues };
  }
  const workingCopy = parsed.data.workingCopy;
  // Os QUATRO lugares da identidade precisam concordar.
  if (workingCopy.workingCopyRef !== row.subjectId || parsed.data.workingCopyRef !== row.subjectId) {
    issues.push("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD");
  }
  if (buildSiloWorkingCopyRef(workingCopy.territoryRef) !== row.subjectId) {
    issues.push("REF_NOT_DERIVED_FROM_TERRITORY");
  }
  if (workingCopy.brandId !== brandId) issues.push("CROSS_BRAND_RECORD");
  if (row.state !== workingCopy.formationStatus) issues.push("STATE_DOES_NOT_MATCH_FORMATION_STATUS");

  if (issues.length) return { ok: false, workingCopy: null, issues };
  return { ok: true, workingCopy, issues: [] };
}

/* ------------------------------ gates de escrita ------------------------- */

export const SILO_WORKING_COPY_WRITE_REFUSALS = [
  "TERRITORY_NOT_FOUND",
  "TERRITORY_RECORD_INCOHERENT",
  "TERRITORY_BRAND_MISMATCH",
  "TERRITORY_NOT_EDITABLE",
  "WORKING_COPY_ALREADY_CONSUMED",
  "BRAND_MISMATCH",
  "TERRITORY_REF_MISMATCH",
  "PILLAR_NOT_HUMAN_DECIDED",
  "PILLAR_DECISION_STALE",
  "IDENTITY_IS_IMMUTABLE",
] as const;
export type SiloWorkingCopyWriteRefusal = (typeof SILO_WORKING_COPY_WRITE_REFUSALS)[number];

/** Território como o writer precisa vê-lo, já lido do registro canônico. */
export type TerritoryGuardInput = {
  found: boolean;
  subjectType: string;
  stage: string;
  subjectId: string;
  sourceEntityId: string;
  articleId: string | null;
  contractVersion: string | null;
  brandId: string | null;
  territoryRef: string | null;
  lifecycleStatus: string | null;
};

/**
 * §12 — o Território precisa existir, ser coerente e estar editável. Território
 * `consolidated` não aceita mais escrita na working copy: a autoridade passou
 * para SiloDNA/SiloPage versionados e `Territory.consolidation`. Mudança
 * estrutural posterior é sucessora, não edição desta cópia.
 */
export function refuseSiloWorkingCopyWrite(input: {
  brandId: string;
  territoryRef: TerritoryRef;
  territory: TerritoryGuardInput;
  workingCopy: Pick<SiloWorkingCopyState, "brandId" | "territoryRef">;
}): SiloWorkingCopyWriteRefusal[] {
  const refusals: SiloWorkingCopyWriteRefusal[] = [];
  const { territory } = input;

  if (input.workingCopy.brandId !== input.brandId) refusals.push("BRAND_MISMATCH");
  if (input.workingCopy.territoryRef !== input.territoryRef) refusals.push("TERRITORY_REF_MISMATCH");

  if (!territory.found) {
    refusals.push("TERRITORY_NOT_FOUND");
    return refusals;
  }
  if (territory.subjectType !== "territory"
    || territory.stage !== "architect"
    || territory.subjectId !== input.territoryRef
    || territory.sourceEntityId !== input.territoryRef
    || territory.articleId !== null
    || territory.contractVersion !== "territory-record-v1"
    || territory.territoryRef !== input.territoryRef) {
    refusals.push("TERRITORY_RECORD_INCOHERENT");
  }
  if (territory.brandId !== input.brandId) refusals.push("TERRITORY_BRAND_MISMATCH");

  if (territory.lifecycleStatus === "consolidated") {
    refusals.push("WORKING_COPY_ALREADY_CONSUMED");
  } else if (territory.lifecycleStatus && ["rejected", "superseded", "archived"].includes(territory.lifecycleStatus)) {
    refusals.push("TERRITORY_NOT_EDITABLE");
  }

  return refusals;
}

/**
 * §14/§15 — só decisão humana grava Pilar, e ela precisa ter sido tomada sobre a
 * composição vigente. Trocar a composição depois invalida a decisão anterior.
 */
export function refusePillarSelection(input: {
  selection: HumanPillarSelection | null;
  actor: "human" | "ai" | "logic" | "serp" | "system";
  currentArticleIds: readonly string[];
}): SiloWorkingCopyWriteRefusal[] {
  const refusals: SiloWorkingCopyWriteRefusal[] = [];
  if (input.actor !== "human") {
    refusals.push("PILLAR_NOT_HUMAN_DECIDED");
    return refusals;
  }
  if (!input.selection) return refusals;
  if (!input.currentArticleIds.includes(input.selection.articleId)) {
    refusals.push("PILLAR_DECISION_STALE");
    return refusals;
  }
  const decided = [...new Set(input.selection.decidedOverArticleIds)].sort();
  const current = [...new Set(input.currentArticleIds)].sort();
  if (JSON.stringify(decided) !== JSON.stringify(current)) refusals.push("PILLAR_DECISION_STALE");
  return refusals;
}

/**
 * A sugestão automática NUNCA vira seleção. Existe para tornar a recusa legível
 * em código e provável em teste.
 */
export function pillarSuggestionIsNotSelection(
  workingCopy: Pick<SiloWorkingCopyState, "pillarSuggestionArticleId" | "pillarSelection">,
): string | null {
  return workingCopy.pillarSelection ? workingCopy.pillarSelection.articleId : null;
}

/**
 * Códigos de recusa das RPCs transacionais, preservados como domínio.
 *
 * Colapsar tudo em "PERSISTENCE_FAILED" apagaria a diferença entre "outra pessoa
 * editou" (recarregar), "o território foi consolidado" (virou histórico) e "a
 * proveniência não bate" (bug ou ataque). São reações diferentes.
 */
export const SILO_WORKING_COPY_RPC_ERRORS = [
  "STALE_WORKING_COPY",
  "PROVENANCE_MISSING",
  "PROVENANCE_MISMATCH",
  "WORKING_COPY_ALREADY_EXISTS",
  "WORKING_COPY_ALREADY_CONSUMED",
  "WORKING_COPY_NOT_FOUND",
  "TERRITORY_NOT_EDITABLE",
  "TERRITORY_REF_MISMATCH",
  "BRAND_MISMATCH",
  "IDENTITY_IS_IMMUTABLE",
  "INCOHERENT_TERRITORY_RECORD",
  "SILO_WORKING_COPY_RECORD_INCOHERENT",
  "STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR",
  "REPLAY_CONFLICT",
] as const;
export type SiloWorkingCopyRpcError = (typeof SILO_WORKING_COPY_RPC_ERRORS)[number];

/** Extrai o código de domínio da mensagem da RPC, sem achatar o resto. */
export function readRpcDomainError(error: unknown): SiloWorkingCopyRpcError | null {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  return SILO_WORKING_COPY_RPC_ERRORS.find(code => message.includes(code)) ?? null;
}
