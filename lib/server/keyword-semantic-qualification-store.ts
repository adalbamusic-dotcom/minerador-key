import "server-only";

import { getOperationalClient } from "./editorial-db";
import {
  KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE,
  parseKeywordSemanticQualification,
  type KeywordSemanticQualification,
} from "@/lib/minerador/keyword-semantic-qualification";
import {
  buildKeywordSemanticQualificationRow,
  classifyQualificationPersistenceError,
  type QualificationPersistenceDiagnostic,
} from "@/lib/minerador/keyword-semantic-qualification-row";

/**
 * Escrita e leitura server-side do artifact de Qualificação Semântica.
 *
 * `editorial_artifact_versions` concede INSERT somente ao service_role; a
 * leitura pelo cliente autenticado acontece sob RLS por Marca. Toda consulta
 * aqui é filtrada por `marca_id` + `entity_id`: não existe resolução por slug,
 * texto da keyword, owner ou outra Marca.
 */

export type PersistedQualificationResult = {
  qualification: KeywordSemanticQualification;
  versionId: string;
  /** true quando a versão já existia com o mesmo conteúdo (retry idempotente). */
  alreadyPersisted: boolean;
};

export class KeywordSemanticQualificationPersistenceError extends Error {
  public readonly diagnostic: QualificationPersistenceDiagnostic;

  constructor(diagnostic: QualificationPersistenceDiagnostic) {
    super(diagnostic.message);
    this.name = "KeywordSemanticQualificationPersistenceError";
    this.diagnostic = diagnostic;
  }
}

export async function readCurrentKeywordSemanticQualifications(input: {
  brandId: string;
  keywordIds: readonly string[];
}): Promise<Map<string, KeywordSemanticQualification>> {
  const ids = [...new Set(input.keywordIds.filter(Boolean))];
  if (!input.brandId || ids.length === 0) return new Map();
  const result = await getOperationalClient()
    .from("editorial_artifact_versions")
    .select("version_id,entity_id,version_number,payload")
    .eq("marca_id", input.brandId)
    .eq("artifact_type", KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE)
    .in("entity_id", ids)
    .order("version_number", { ascending: false });
  if (result.error) throw result.error;
  const current = new Map<string, KeywordSemanticQualification>();
  for (const row of result.data || []) {
    const entityId = typeof row.entity_id === "string" ? row.entity_id : "";
    if (!entityId || current.has(entityId)) continue;
    const parsed = parseKeywordSemanticQualification(row.payload);
    // Tenant defensivo: o payload precisa concordar com a linha consultada.
    if (!parsed || parsed.brandId !== input.brandId || parsed.keywordId !== entityId) continue;
    current.set(entityId, parsed);
  }
  return current;
}

/**
 * Grava a nova versão. O sucesso só é reportado depois do write confirmado;
 * qualquer falha preserva a versão anterior porque nada é apagado ou mutado.
 * Um retry da mesma versão com o mesmo conteúdo é idempotente.
 */
export async function persistKeywordSemanticQualification(input: {
  brandId: string;
  keywordId: string;
  qualification: KeywordSemanticQualification;
  changeReason: string;
}): Promise<PersistedQualificationResult> {
  if (input.qualification.brandId !== input.brandId || input.qualification.keywordId !== input.keywordId) {
    throw new KeywordSemanticQualificationPersistenceError({
      classification: "DB_INVALID_PAYLOAD",
      code: "tenant_mismatch",
      message: "A Qualificação Semântica não pertence à Marca/keyword do write.",
      details: null,
      hint: null,
      constraint: null,
      column: null,
    });
  }
  const row = buildKeywordSemanticQualificationRow({ qualification: input.qualification, changeReason: input.changeReason });
  const inserted = await getOperationalClient()
    .from("editorial_artifact_versions")
    .insert(row)
    .select("version_id")
    .single();
  if (!inserted.error) {
    return { qualification: input.qualification, versionId: input.qualification.id, alreadyPersisted: false };
  }
  const diagnostic = classifyQualificationPersistenceError(inserted.error);
  if (diagnostic.classification === "DB_UNIQUE_CONFLICT") {
    // Retry da mesma operação: se a versão gravada tem o mesmo conteúdo, o
    // write já aconteceu e nada é duplicado.
    const existing = await readCurrentKeywordSemanticQualifications({ brandId: input.brandId, keywordIds: [input.keywordId] });
    const current = existing.get(input.keywordId);
    if (current && current.id === input.qualification.id && current.lifecycle.contentHash === input.qualification.lifecycle.contentHash) {
      return { qualification: current, versionId: current.id, alreadyPersisted: true };
    }
  }
  throw new KeywordSemanticQualificationPersistenceError(diagnostic);
}
