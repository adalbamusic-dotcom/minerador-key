export const MINERADOR_ARQUITETO_RECEIVED_STATE = "received";

export const CANONICAL_IMPORTABILITY = {
  IMPORTABLE: "IMPORTABLE",
  PUBLISHED_PROTECTED: "PUBLISHED_PROTECTED",
  WORKFLOW_RECEIVED: "WORKFLOW_RECEIVED",
  ARTICLE_DNA_INCORPORATED: "ARTICLE_DNA_INCORPORATED",
  REMOTE_WORKFLOW_BLOCKED: "REMOTE_WORKFLOW_BLOCKED",
  NOT_APPROVED: "NOT_APPROVED",
} as const;

export type CanonicalImportability = typeof CANONICAL_IMPORTABILITY[keyof typeof CANONICAL_IMPORTABILITY];

export type CanonicalMineradorArquitetoImportEligibility = {
  keywordId: string;
  importability: CanonicalImportability;
  workflowState: string | null;
};

export type MineradorKeywordHandoffSource = {
  id: string;
  brandId: string;
  status?: string | null;
  contentHash?: string | null;
};

export type MineradorArquitetoHandoffRow = {
  marca_id: string;
  subject_type: "keyword";
  subject_id: string;
  article_id: null;
  stage: "architect";
  state: "received";
  source_entity_id: string;
  source_version_id: null;
  source_content_hash: string | null;
  payload: {
    brandId: string;
    keywordId: string;
    source: "MINERADOR";
    decision: string | null;
    state: "received";
  };
};

export type MineradorArquitetoHandoffPlan = {
  rows: MineradorArquitetoHandoffRow[];
  importedKeywordIds: string[];
  createdKeywordIds: string[];
  existingKeywordIds: string[];
  status: "PERSISTED" | "UNCHANGED";
};

/**
 * Decide a importabilidade exclusivamente a partir de dados canônicos já
 * carregados no servidor para a mesma Brand. Marcadores de browser não entram
 * nesta decisão e não podem impedir uma nova importação.
 */
export function resolveCanonicalMineradorArquitetoImportEligibility(input: {
  brandId: string;
  keywords: readonly MineradorKeywordHandoffSource[];
  workflowItems: readonly { marcaId: string; subjectType: string; subjectId: string; stage: string; state: string }[];
  articleDnaKeywordIds: ReadonlySet<string>;
}): CanonicalMineradorArquitetoImportEligibility[] {
  const workflowByKeywordId = new Map(
    input.workflowItems
      .filter(item => item.marcaId === input.brandId && item.subjectType === "keyword" && item.stage === "architect")
      .map(item => [item.subjectId, item.state]),
  );

  return input.keywords
    .filter(keyword => keyword.brandId === input.brandId)
    .map(keyword => {
      const workflowState = workflowByKeywordId.get(keyword.id) ?? null;
      const status = keyword.status?.trim().toLocaleLowerCase("pt-BR") || "";
      let importability: CanonicalImportability;

      if (input.articleDnaKeywordIds.has(keyword.id)) importability = CANONICAL_IMPORTABILITY.ARTICLE_DNA_INCORPORATED;
      else if (workflowState === MINERADOR_ARQUITETO_RECEIVED_STATE) importability = CANONICAL_IMPORTABILITY.WORKFLOW_RECEIVED;
      else if (workflowState) importability = CANONICAL_IMPORTABILITY.REMOTE_WORKFLOW_BLOCKED;
      else if (status === "publicado") importability = CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED;
      else if (status === "aprovado") importability = CANONICAL_IMPORTABILITY.IMPORTABLE;
      else importability = CANONICAL_IMPORTABILITY.NOT_APPROVED;

      return { keywordId: keyword.id, importability, workflowState };
    });
}

/**
 * Define o contrato do primeiro handoff sem duplicar o conteúdo da keyword.
 * minerador_keywords continua sendo a origem; o workflow guarda identidade,
 * estado e proveniência do transporte para o Arquiteto.
 */
export function buildMineradorArquitetoHandoffPlan(input: {
  brandId: string;
  keywords: readonly MineradorKeywordHandoffSource[];
  existingKeywordIds: ReadonlySet<string>;
}): MineradorArquitetoHandoffPlan {
  const keywords = [...new Map(
    input.keywords
      .filter(keyword => keyword.brandId === input.brandId && keyword.id.trim())
      .map(keyword => [keyword.id, keyword]),
  ).values()];
  const existingKeywordIds = keywords.filter(keyword => input.existingKeywordIds.has(keyword.id)).map(keyword => keyword.id);
  const newKeywords = keywords.filter(keyword => !input.existingKeywordIds.has(keyword.id));

  return {
    rows: newKeywords.map(keyword => ({
      marca_id: input.brandId,
      subject_type: "keyword",
      subject_id: keyword.id,
      article_id: null,
      stage: "architect",
      state: MINERADOR_ARQUITETO_RECEIVED_STATE,
      source_entity_id: keyword.id,
      source_version_id: null,
      source_content_hash: keyword.contentHash ?? null,
      payload: {
        brandId: input.brandId,
        keywordId: keyword.id,
        source: "MINERADOR",
        decision: keyword.status ?? null,
        state: MINERADOR_ARQUITETO_RECEIVED_STATE,
      },
    })),
    importedKeywordIds: keywords.map(keyword => keyword.id),
    createdKeywordIds: newKeywords.map(keyword => keyword.id),
    existingKeywordIds,
    status: newKeywords.length ? "PERSISTED" : "UNCHANGED",
  };
}
