import { z } from "zod";
import {
  TerritoryCandidateSchema,
  TerritoryRefSchema,
  isPartialMembershipOperation,
  type TerritoryCandidate,
  type TerritoryRef,
} from "./territory.ts";

/**
 * REGISTRO CANÔNICO REMOTO DO TERRITÓRIO.
 *
 * O território vive como UM item de `editorial_workflow_items` por território,
 * na mesma tabela genérica e no mesmo `stage` que a membership da keyword já
 * usa. Nenhuma coluna nova, nenhuma migration: a tabela aceita `subject_type`
 * e `state` como texto livre (CHECK de comprimento 1..80), `article_id` é
 * anulável, `payload` é jsonb de objeto e `lock_version` já dá concorrência
 * otimista por item.
 *
 * A alternativa recusada foi replicar o TerritoryCandidate dentro do payload de
 * cada keyword do território: N cópias mutáveis do mesmo objeto, sem dono e sem
 * regra de desempate quando divergissem.
 */
export const TERRITORY_SUBJECT_TYPE = "territory" as const;
export const TERRITORY_WORKFLOW_STAGE = "architect" as const;
export const TERRITORY_RECORD_CONTRACT_VERSION = "territory-record-v1" as const;

/**
 * `subject_id` É o `territoryRef`. Com a UNIQUE já existente
 * (marca_id, subject_type, subject_id, stage), o banco passa a garantir
 * um único registro por território por Brand — sem DDL.
 */
export const TerritoryWorkflowPayloadSchema = z.object({
  contractVersion: z.literal(TERRITORY_RECORD_CONTRACT_VERSION),
  territory: TerritoryCandidateSchema,
}).strict();
export type TerritoryWorkflowPayload = z.infer<typeof TerritoryWorkflowPayloadSchema>;

export type TerritoryWorkflowRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

export type TerritoryRecordIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "SUBJECT_ID_IS_NOT_TERRITORY_REF"
  | "SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"
  | "STATE_DOES_NOT_MATCH_LIFECYCLE"
  | "PAYLOAD_INVALID"
  | "CROSS_BRAND_RECORD"
  | "ARTICLE_ID_PRESENT";

export type TerritoryRecordReadResult =
  | { ok: true; territory: TerritoryCandidate; issues: [] }
  | { ok: false; territory: null; issues: TerritoryRecordIssue[] };

/**
 * `state` da linha espelha o `lifecycleStatus` do payload para que o índice
 * (marca_id, stage, state, updated_at) sirva o filtro territorial. Espelho é
 * projeção, não segunda fonte: divergência entre os dois é RECUSADA na leitura,
 * nunca reconciliada em silêncio.
 */
export function territoryWorkflowState(territory: TerritoryCandidate): string {
  return territory.lifecycleStatus;
}

/**
 * `source_entity_id` SEMPRE é o próprio `territoryRef`.
 *
 * A coluna significa, nos consumers existentes, "id da entidade canônica de
 * ORIGEM da qual este item foi derivado" — `version.entityId` de um artefato,
 * um `articleId`, ou o id de uma keyword — e viaja acompanhada de
 * `source_version_id` (FK para editorial_artifact_versions) e
 * `source_content_hash`. NULL não é opção: a coluna é NOT NULL com CHECK de
 * comprimento > 0.
 *
 * Por que NÃO usar `existingSiloRef.siloId`, apesar de parecer a proveniência
 * natural. Dois motivos materiais:
 *
 * 1. As RPCs de purga de keyword (migrations 0046 e 0047) apagam itens de
 *    workflow com `source_entity_id = keyword.id::text`. Em 0047 esse DELETE
 *    NÃO filtra por `subject_type`. Qualquer valor que possa coincidir com um
 *    UUID de keyword faz o território ser apagado junto com uma keyword sem
 *    relação com ele.
 * 2. `siloId` pode originar-se de `lista_id` (engine.ts), que é UUID cru do
 *    Minerador — exatamente o formato que colide com aquele predicado, e
 *    exatamente a identidade que C4 proíbe misturar com território.
 *
 * `territory:<uuid>` tem prefixo e por isso NUNCA é igual a `keyword.id::text`.
 * A escolha é estrutural, não estética. O Silo de origem continua registrado
 * onde tem significado: `payload.territory.existingSiloRef`.
 */
export function territorySourceEntityId(territory: TerritoryCandidate): string {
  return territory.territoryRef;
}

export function buildTerritoryWorkflowRow(territory: TerritoryCandidate) {
  return {
    subjectType: TERRITORY_SUBJECT_TYPE,
    subjectId: territory.territoryRef,
    stage: TERRITORY_WORKFLOW_STAGE,
    state: territoryWorkflowState(territory),
    sourceEntityId: territorySourceEntityId(territory),
    // Território não é artigo. `article_id` fica nulo por contrato, não por acaso.
    articleId: null as string | null,
    payload: TerritoryWorkflowPayloadSchema.parse({
      contractVersion: TERRITORY_RECORD_CONTRACT_VERSION,
      territory,
    }) as TerritoryWorkflowPayload,
  };
}

/** Readback estrito: a linha precisa concordar consigo mesma e com a Brand. */
export function parseTerritoryWorkflowRow(row: TerritoryWorkflowRowInput, brandId: string): TerritoryRecordReadResult {
  const issues: TerritoryRecordIssue[] = [];
  if (row.subjectType !== TERRITORY_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== TERRITORY_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (!TerritoryRefSchema.safeParse(row.subjectId).success) issues.push("SUBJECT_ID_IS_NOT_TERRITORY_REF");
  if (row.articleId !== null && row.articleId !== undefined) issues.push("ARTICLE_ID_PRESENT");

  const parsed = TerritoryWorkflowPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, territory: null, issues };
  }
  const territory = parsed.data.territory;
  if (territory.territoryRef !== row.subjectId) issues.push("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD");
  if (territory.brandId !== brandId) issues.push("CROSS_BRAND_RECORD");
  if (row.state !== territoryWorkflowState(territory)) issues.push("STATE_DOES_NOT_MATCH_LIFECYCLE");

  if (issues.length) return { ok: false, territory: null, issues };
  return { ok: true, territory, issues: [] };
}

/**
 * A operação parcial mora DENTRO do território (`pendingOperation`), portanto no
 * mesmo registro remoto e sob o mesmo `lock_version`. Ela não é duplicada nas
 * keywords participantes: cada keyword guarda a própria membership e nada mais.
 */
export const PARTIAL_OPERATION_CANONICAL_LOCATION =
  "editorial_workflow_items[subject_type=territory].payload.territory.pendingOperation" as const;

export function territoryHasPersistedPartialOperation(territory: TerritoryCandidate): boolean {
  return isPartialMembershipOperation(territory.pendingOperation);
}

export type TerritoryPersistencePlan =
  | { intent: "create"; territoryRef: TerritoryRef; expectedLock: null; row: ReturnType<typeof buildTerritoryWorkflowRow> }
  | { intent: "update"; territoryRef: TerritoryRef; expectedLock: number; row: ReturnType<typeof buildTerritoryWorkflowRow> };

export function planTerritoryPersistence(
  territory: TerritoryCandidate,
  expectedLock: number | null,
): TerritoryPersistencePlan {
  const row = buildTerritoryWorkflowRow(territory);
  return expectedLock === null
    ? { intent: "create", territoryRef: territory.territoryRef, expectedLock: null, row }
    : { intent: "update", territoryRef: territory.territoryRef, expectedLock, row };
}

/**
 * CLASSIFICAÇÃO HONESTA DA PERSISTÊNCIA.
 *
 * O caminho de código remoto existe (store + rota + readback tipado), mas
 * nenhuma escrita remota foi executada. Round-trip de serialização em memória
 * NÃO é prova de persistência: não exercita RLS, CHECK, UNIQUE, o gatilho de
 * `lock_version`, a coerção jsonb do Postgres nem o readback real.
 *
 * Esta constante só muda depois do smoke do usuário: write remoto confirmado →
 * GET remoto → comparação → `lock_version` conferido.
 */
export const TERRITORY_REMOTE_PERSISTENCE_CLASSIFICATION = "UNPROVEN_UNTIL_USER_SMOKE" as const;
