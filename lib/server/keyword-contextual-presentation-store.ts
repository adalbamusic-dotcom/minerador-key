import "server-only";

import { getOperationalClient } from "./editorial-db";
import {
  KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE,
  parseKeywordContextualPresentation,
  type KeywordContextualPresentation,
} from "@/lib/minerador/keyword-contextual-presentation";
import {
  buildKeywordContextualPresentationRow,
  classifyArtifactPersistenceError,
  type ArtifactPersistenceDiagnostic,
} from "@/lib/minerador/keyword-contextual-presentation-row";

/**
 * Escrita e leitura server-side do artifact de Apresentação Contextual.
 *
 * Mesmo padrão da Qualificação Semântica: INSERT apenas por service_role,
 * leitura filtrada por `marca_id` + `entity_id` e payload revalidado contra a
 * linha. Nenhuma resolução por nome, slug ou owner; nenhuma leitura de
 * `ai_review` R5.
 */

export class KeywordContextualPresentationPersistenceError extends Error {
  public readonly diagnostic: ArtifactPersistenceDiagnostic;

  constructor(diagnostic: ArtifactPersistenceDiagnostic) {
    super(diagnostic.message);
    this.name = "KeywordContextualPresentationPersistenceError";
    this.diagnostic = diagnostic;
  }
}

export async function readCurrentKeywordContextualPresentations(input: {
  brandId: string;
  keywordIds: readonly string[];
}): Promise<Map<string, KeywordContextualPresentation>> {
  const ids = [...new Set(input.keywordIds.filter(Boolean))];
  if (!input.brandId || ids.length === 0) return new Map();
  const result = await getOperationalClient()
    .from("editorial_artifact_versions")
    .select("version_id,entity_id,version_number,payload")
    .eq("marca_id", input.brandId)
    .eq("artifact_type", KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE)
    .in("entity_id", ids)
    .order("version_number", { ascending: false });
  if (result.error) throw result.error;
  const current = new Map<string, KeywordContextualPresentation>();
  for (const row of result.data || []) {
    const entityId = typeof row.entity_id === "string" ? row.entity_id : "";
    if (!entityId || current.has(entityId)) continue;
    const parsed = parseKeywordContextualPresentation(row.payload);
    if (!parsed || parsed.brandId !== input.brandId || parsed.keywordId !== entityId) continue;
    current.set(entityId, parsed);
  }
  return current;
}

export type PersistedPresentationResult = {
  presentation: KeywordContextualPresentation;
  versionId: string;
  /** true quando a mesma versão já existia com o mesmo conteúdo. */
  alreadyPersisted: boolean;
};

export async function persistKeywordContextualPresentation(input: {
  brandId: string;
  keywordId: string;
  presentation: KeywordContextualPresentation;
  changeReason: string;
}): Promise<PersistedPresentationResult> {
  if (input.presentation.brandId !== input.brandId || input.presentation.keywordId !== input.keywordId) {
    throw new KeywordContextualPresentationPersistenceError({
      classification: "DB_INVALID_PAYLOAD",
      code: "tenant_mismatch",
      message: "A Apresentação Contextual não pertence à Marca/keyword do write.",
      details: null,
      hint: null,
      constraint: null,
      column: null,
    });
  }
  const row = buildKeywordContextualPresentationRow({ presentation: input.presentation, changeReason: input.changeReason });
  const inserted = await getOperationalClient()
    .from("editorial_artifact_versions")
    .insert(row)
    .select("version_id")
    .single();
  if (!inserted.error) {
    return { presentation: input.presentation, versionId: input.presentation.id, alreadyPersisted: false };
  }
  const diagnostic = classifyArtifactPersistenceError(inserted.error);
  if (diagnostic.classification === "DB_UNIQUE_CONFLICT") {
    // Retry da mesma operação: o write já aconteceu, nada é duplicado.
    const existing = await readCurrentKeywordContextualPresentations({ brandId: input.brandId, keywordIds: [input.keywordId] });
    const current = existing.get(input.keywordId);
    if (current && current.id === input.presentation.id && current.lifecycle.contentHash === input.presentation.lifecycle.contentHash) {
      return { presentation: current, versionId: current.id, alreadyPersisted: true };
    }
  }
  throw new KeywordContextualPresentationPersistenceError(diagnostic);
}
