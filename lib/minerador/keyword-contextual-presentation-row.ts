import { KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE, type KeywordContextualPresentation } from "./keyword-contextual-presentation.ts";

/**
 * Linha de `editorial_artifact_versions` para a Apresentação Contextual.
 *
 * Mesmo contrato de tabela da Qualificação Semântica: `status`, `content_hash`,
 * `origin`, `change_reason` e `created_by` são NOT NULL e `payload` precisa ser
 * objeto JSON. Camada pura, testável sem banco e sem provider.
 */

/** Apresentação é orientação editorial gerada, não rascunho em aprovação. */
export const KEYWORD_CONTEXTUAL_PRESENTATION_STATUS = "generated";
export const KEYWORD_CONTEXTUAL_PRESENTATION_ORIGIN = "ai_contextual_presentation";

export { classifyQualificationPersistenceError as classifyArtifactPersistenceError } from "./keyword-semantic-qualification-row.ts";
export type { QualificationPersistenceClassification as ArtifactPersistenceClassification, QualificationPersistenceDiagnostic as ArtifactPersistenceDiagnostic } from "./keyword-semantic-qualification-row.ts";

export type KeywordContextualPresentationRow = {
  version_id: string;
  entity_id: string;
  marca_id: string;
  artifact_type: string;
  version_number: number;
  previous_version_id: string | null;
  source_version_id: string | null;
  status: string;
  content_hash: string;
  payload: KeywordContextualPresentation;
  origin: string;
  change_reason: string;
  created_by: string;
  created_at: string;
};

export function buildKeywordContextualPresentationRow(input: {
  presentation: KeywordContextualPresentation;
  changeReason: string;
}): KeywordContextualPresentationRow {
  const { presentation } = input;
  const changeReason = input.changeReason.trim();
  if (!presentation.brandId || !presentation.keywordId) throw new Error("A Apresentação Contextual exige brandId e keywordId.");
  if (!presentation.output.text.trim()) throw new Error("A Apresentação Contextual exige texto gerado.");
  if (!presentation.lifecycle.contentHash) throw new Error("A Apresentação Contextual exige contentHash.");
  if (!presentation.lifecycle.createdBy) throw new Error("A Apresentação Contextual exige o autor da geração.");
  if (!changeReason) throw new Error("A Apresentação Contextual exige um motivo de mudança.");
  return {
    version_id: presentation.id,
    entity_id: presentation.keywordId,
    marca_id: presentation.brandId,
    artifact_type: KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE,
    version_number: presentation.lifecycle.version,
    previous_version_id: presentation.lifecycle.supersedesVersionId,
    // A apresentação não deriva de outro artifact versionado do store.
    source_version_id: null,
    status: KEYWORD_CONTEXTUAL_PRESENTATION_STATUS,
    content_hash: presentation.lifecycle.contentHash,
    payload: presentation,
    origin: KEYWORD_CONTEXTUAL_PRESENTATION_ORIGIN,
    change_reason: changeReason,
    created_by: presentation.lifecycle.createdBy,
    created_at: presentation.lifecycle.createdAt,
  };
}
