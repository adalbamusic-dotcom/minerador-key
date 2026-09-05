import { contentHash } from "../arquiteto/versioning.ts";

/**
 * Apresentação Contextual persistida da keyword.
 *
 * Artifact keyword-scoped gravado em `editorial_artifact_versions` com
 * `artifact_type = keyword_contextual_presentation` e `entity_id = keywordId`.
 *
 * Persistir não amplia autoridade: a IA continua sem decidir Intenção, Funil,
 * SERP, KGR ou status. Este contrato **não** é o `ai_review` R5 — o legado não
 * é lido nem escrito por aqui.
 */

export const KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE = "keyword_contextual_presentation";

export type ContextualPresentationSkillRef = {
  definitionKey: string;
  versionId: string | null;
  versionNumber: number;
  contentHash: string;
  lifecycleStatus: string | null;
};

export type KeywordContextualPresentation = {
  schemaVersion: "v1";
  id: string;
  brandId: string;
  keywordId: string;
  input: {
    keyword: string;
    inputKeywordDnaRef: { entityId: string; versionId: string; contentHash: string } | null;
    brandDnaVersionRef: { versionId: string; contentHash: string } | null;
    appliedSkillRefs: ContextualPresentationSkillRef[];
  };
  output: {
    text: string;
  };
  provenance: {
    provider: string;
    model: string;
    operationRequestId: string;
    executionRequestId: string | null;
    generatedAt: string;
    actorUserId: string;
  };
  lifecycle: {
    version: number;
    contentHash: string;
    createdAt: string;
    createdBy: string;
    supersedesVersionId: string | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function skillRefs(value: unknown): ContextualPresentationSkillRef[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)).map(item => ({
      definitionKey: text(item.definitionKey),
      versionId: text(item.versionId) || null,
      versionNumber: typeof item.versionNumber === "number" ? item.versionNumber : 0,
      contentHash: text(item.contentHash),
      lifecycleStatus: text(item.lifecycleStatus) || null,
    })).filter(item => item.definitionKey)
    : [];
}

function versionRef(value: unknown): { versionId: string; contentHash: string } | null {
  const item = asRecord(value);
  if (!item) return null;
  const versionId = text(item.versionId);
  const hash = text(item.contentHash);
  return versionId || hash ? { versionId, contentHash: hash } : null;
}

export function keywordContextualPresentationVersionId(brandId: string, keywordId: string, version: number): string {
  return `${KEYWORD_CONTEXTUAL_PRESENTATION_ARTIFACT_TYPE}:${brandId}:${keywordId}:v${version}`;
}

export async function buildKeywordContextualPresentation(input: {
  brandId: string;
  keywordId: string;
  keyword: string;
  presentation: {
    text: string;
    generatedAt: string;
    provider: string;
    model: string;
    inputKeywordDnaRef?: { entityId?: string; versionId?: string; contentHash?: string } | null;
    appliedSkillRefs?: unknown;
  };
  brandDnaVersionRef?: { versionId?: string; contentHash?: string } | null;
  operationRequestId: string;
  executionRequestId?: string | null;
  actorUserId: string;
  previous?: KeywordContextualPresentation | null;
}): Promise<KeywordContextualPresentation> {
  const version = (input.previous?.lifecycle.version || 0) + 1;
  const draft: Omit<KeywordContextualPresentation, "lifecycle"> & { lifecycle: Omit<KeywordContextualPresentation["lifecycle"], "contentHash"> } = {
    schemaVersion: "v1",
    id: keywordContextualPresentationVersionId(input.brandId, input.keywordId, version),
    brandId: input.brandId,
    keywordId: input.keywordId,
    input: {
      keyword: input.keyword,
      inputKeywordDnaRef: input.presentation.inputKeywordDnaRef
        ? {
          entityId: text(input.presentation.inputKeywordDnaRef.entityId),
          versionId: text(input.presentation.inputKeywordDnaRef.versionId),
          contentHash: text(input.presentation.inputKeywordDnaRef.contentHash),
        }
        : null,
      brandDnaVersionRef: versionRef(input.brandDnaVersionRef),
      appliedSkillRefs: skillRefs(input.presentation.appliedSkillRefs),
    },
    output: { text: input.presentation.text },
    provenance: {
      provider: input.presentation.provider,
      model: input.presentation.model,
      operationRequestId: input.operationRequestId,
      executionRequestId: input.executionRequestId || null,
      generatedAt: input.presentation.generatedAt,
      actorUserId: input.actorUserId,
    },
    lifecycle: {
      version,
      createdAt: input.presentation.generatedAt,
      createdBy: input.actorUserId,
      supersedesVersionId: input.previous?.id || null,
    },
  };
  return { ...draft, lifecycle: { ...draft.lifecycle, contentHash: await contentHash(draft) } };
}

/** Leitura defensiva do payload persistido. */
export function parseKeywordContextualPresentation(value: unknown): KeywordContextualPresentation | null {
  const item = asRecord(value);
  if (!item || item.schemaVersion !== "v1") return null;
  const inputRecord = asRecord(item.input);
  const output = asRecord(item.output);
  const provenance = asRecord(item.provenance);
  const lifecycle = asRecord(item.lifecycle);
  if (!inputRecord || !output || !provenance || !lifecycle) return null;
  if (!text(item.brandId) || !text(item.keywordId) || !text(output.text)) return null;
  const dnaRef = asRecord(inputRecord.inputKeywordDnaRef);
  return {
    schemaVersion: "v1",
    id: text(item.id),
    brandId: text(item.brandId),
    keywordId: text(item.keywordId),
    input: {
      keyword: text(inputRecord.keyword),
      inputKeywordDnaRef: dnaRef
        ? { entityId: text(dnaRef.entityId), versionId: text(dnaRef.versionId), contentHash: text(dnaRef.contentHash) }
        : null,
      brandDnaVersionRef: versionRef(inputRecord.brandDnaVersionRef),
      appliedSkillRefs: skillRefs(inputRecord.appliedSkillRefs),
    },
    output: { text: text(output.text) },
    provenance: {
      provider: text(provenance.provider),
      model: text(provenance.model),
      operationRequestId: text(provenance.operationRequestId),
      executionRequestId: text(provenance.executionRequestId) || null,
      generatedAt: text(provenance.generatedAt),
      actorUserId: text(provenance.actorUserId),
    },
    lifecycle: {
      version: typeof lifecycle.version === "number" && lifecycle.version > 0 ? lifecycle.version : 1,
      contentHash: text(lifecycle.contentHash),
      createdAt: text(lifecycle.createdAt) || text(provenance.generatedAt),
      createdBy: text(lifecycle.createdBy),
      supersedesVersionId: text(lifecycle.supersedesVersionId) || null,
    },
  };
}

export function contextualPresentationVersionLabel(presentation: KeywordContextualPresentation): string {
  return `Apresentação persistida · v${presentation.lifecycle.version}`;
}

export function brandVoiceAppliedInPresentation(presentation: KeywordContextualPresentation | null | undefined): boolean {
  return Boolean(presentation?.input.appliedSkillRefs.some(ref => ref.definitionKey === "brand_voice"));
}
