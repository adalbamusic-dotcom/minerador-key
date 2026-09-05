import { KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE, type KeywordSemanticQualification } from "./keyword-semantic-qualification.ts";

/**
 * Linha de `editorial_artifact_versions` para a Qualificação Semântica.
 *
 * O contrato da tabela (migration 0027) exige `status`, `content_hash`,
 * `origin`, `change_reason` e `created_by` NOT NULL, além de `payload` como
 * objeto JSON. Esta camada é pura para poder ser testada sem banco e sem
 * provider.
 */

/** A Qualificação é evidência factual coletada, não um rascunho em aprovação. */
export const KEYWORD_SEMANTIC_QUALIFICATION_STATUS = "collected";
export const KEYWORD_SEMANTIC_QUALIFICATION_ORIGIN = "dataforseo_serp";

export type KeywordSemanticQualificationRow = {
  version_id: string;
  entity_id: string;
  marca_id: string;
  artifact_type: string;
  version_number: number;
  previous_version_id: string | null;
  source_version_id: string | null;
  status: string;
  content_hash: string;
  payload: KeywordSemanticQualification;
  origin: string;
  change_reason: string;
  created_by: string;
  created_at: string;
};

export function buildKeywordSemanticQualificationRow(input: {
  qualification: KeywordSemanticQualification;
  changeReason: string;
}): KeywordSemanticQualificationRow {
  const { qualification } = input;
  const changeReason = input.changeReason.trim();
  if (!qualification.brandId || !qualification.keywordId) throw new Error("A Qualificação Semântica exige brandId e keywordId.");
  if (!qualification.lifecycle.contentHash) throw new Error("A Qualificação Semântica exige contentHash.");
  if (!qualification.lifecycle.createdBy) throw new Error("A Qualificação Semântica exige o autor da coleta.");
  if (!changeReason) throw new Error("A Qualificação Semântica exige um motivo de mudança.");
  return {
    version_id: qualification.id,
    entity_id: qualification.keywordId,
    marca_id: qualification.brandId,
    artifact_type: KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE,
    version_number: qualification.lifecycle.version,
    previous_version_id: qualification.lifecycle.supersedesVersionId,
    // Esta evidência não deriva de outro artifact versionado.
    source_version_id: null,
    status: KEYWORD_SEMANTIC_QUALIFICATION_STATUS,
    content_hash: qualification.lifecycle.contentHash,
    payload: qualification,
    origin: KEYWORD_SEMANTIC_QUALIFICATION_ORIGIN,
    change_reason: changeReason,
    created_by: qualification.lifecycle.createdBy,
    created_at: qualification.lifecycle.createdAt,
  };
}

export type QualificationPersistenceClassification =
  | "DB_CONSTRAINT_VIOLATION"
  | "DB_RLS_DENIED"
  | "DB_FOREIGN_KEY"
  | "DB_UNIQUE_CONFLICT"
  | "DB_INVALID_PAYLOAD"
  | "DB_UNKNOWN";

export type QualificationPersistenceDiagnostic = {
  classification: QualificationPersistenceClassification;
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
  constraint: string | null;
  column: string | null;
};

const SENSITIVE = /(token|secret|password|authorization|apikey|api_key|bearer)(?:\s*[:=]?\s*[^\s,;]+){1,2}/gi;

function sanitize(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.replace(SENSITIVE, "$1=[redacted]").slice(0, 300);
}

/**
 * Classifica a falha real do banco sem esconder a causa técnica do diagnóstico
 * interno. A mensagem ao usuário continua genérica em outra camada.
 */
export function classifyQualificationPersistenceError(error: unknown): QualificationPersistenceDiagnostic {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = sanitize(record.code) || "";
  const message = sanitize(record.message) || "A persistência não retornou mensagem.";
  const details = sanitize(record.details);
  const hint = sanitize(record.hint);
  const haystack = `${message} ${details || ""}`;
  const constraint = sanitize(record.constraint)
    || haystack.match(/constraint "([^"]+)"/)?.[1]
    || null;
  const column = sanitize(record.column)
    || haystack.match(/column "([^"]+)"/)?.[1]
    || haystack.match(/null value in column "([^"]+)"/)?.[1]
    || null;
  const classification: QualificationPersistenceClassification =
    code === "23514" ? "DB_CONSTRAINT_VIOLATION"
      : code === "23502" ? "DB_INVALID_PAYLOAD"
        : code === "23503" ? "DB_FOREIGN_KEY"
          : code === "23505" ? "DB_UNIQUE_CONFLICT"
            : code === "42501" || code === "PGRST301" || /row-level security/i.test(haystack) ? "DB_RLS_DENIED"
              : code === "22P02" || code === "PGRST102" ? "DB_INVALID_PAYLOAD"
                : "DB_UNKNOWN";
  return { classification, code: code || "unknown", message, details, hint, constraint, column };
}
