import {
  ArticleKgrIdentitySchema,
  PrimaryKeywordPolicyHistoryEntrySchema,
  type ArticleArchitectureStatus,
  type ArticleKgrIdentity,
  type ArchitectKeyword,
  type PrimaryKeywordEffectivePolicy,
  type PrimaryKeywordPolicy,
  type KeywordUrlRelationship,
} from "./contracts.ts";

type RecordLike = Record<string, unknown>;

const asRecord = (value: unknown): RecordLike | null => value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;
const first = (records: Array<RecordLike | null>, keys: string[]) => {
  for (const record of records) for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

const normalizeLabel = (value: unknown) => text(value)?.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");

export function normalizePrimaryKeywordPolicy(value: unknown): PrimaryKeywordEffectivePolicy | undefined {
  const normalized = normalizeLabel(value);
  if (normalized === "locked" || normalized === "travada" || normalized === "principal_travada") return "locked";
  if (normalized === "reviewable" || normalized === "revisable" || normalized === "revisivel" || normalized === "principal_revisavel") return "revisable";
  if (normalized === "free" || normalized === "livre" || normalized === "principal_livre") return "free";
  if (normalized === "conflict" || normalized === "conflito") return "conflict";
  if (normalized === "unknown" || normalized === "desconhecida" || normalized === "desconhecido") return "unknown";
  return undefined;
}

function sourcePolicy(value: unknown): PrimaryKeywordPolicy | undefined {
  const normalized = normalizePrimaryKeywordPolicy(value);
  if (normalized === "revisable") return "reviewable";
  return normalized;
}

function parsePolicyHistory(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return []; } })() : [];
  return Array.isArray(values) ? values.map(item => PrimaryKeywordPolicyHistoryEntrySchema.safeParse(item)).filter(result => result.success).map(result => result.data) : [];
}

const relationAliases: Record<string, KeywordUrlRelationship> = {
  confirmed_primary: "confirmed_primary", principal_confirmada: "confirmed_primary", principal_confirmado: "confirmed_primary",
  candidate_primary: "candidate_primary", principal_candidata: "candidate_primary", principal_candidato: "candidate_primary",
  likely_support: "likely_support", apoio_provavel: "likely_support", apoio_provável: "likely_support",
  mentioned_in_content: "mentioned_in_content", mencionada_no_conteudo: "mentioned_in_content",
  undefined: "undefined", sem_relacao_definida: "undefined", nao_definida: "undefined", indefinida: "undefined",
};

const architectureAliases: Record<string, ArticleArchitectureStatus> = {
  unstructured: "unstructured", nao_estruturado: "unstructured", nao_estruturada: "unstructured",
  awaiting_architecture: "awaiting_architecture", aguardando_arquitetura: "awaiting_architecture",
  in_review: "in_review", em_revisao: "in_review",
  architecture_confirmed: "architecture_confirmed", arquitetura_confirmada: "architecture_confirmed",
  conflict: "conflict", com_conflito: "conflict", conflituoso: "conflict",
  structural_review_required: "structural_review_required", revisao_arquitetural_necessaria: "structural_review_required", revisao_estrutural_necessaria: "structural_review_required",
};

function normalizedRelation(value: unknown): KeywordUrlRelationship | undefined {
  const normalized = normalizeLabel(value);
  return normalized ? relationAliases[normalized] : undefined;
}

function normalizedArchitectureStatus(value: unknown): ArticleArchitectureStatus | undefined {
  const normalized = normalizeLabel(value);
  return normalized ? architectureAliases[normalized] : undefined;
}

const kgrSource = (value: unknown) => {
  const normalized = normalizeLabel(value);
  if (normalized === "minerador") return "minerador" as const;
  if (normalized === "confirmed_import" || normalized === "importacao_confirmada") return "confirmed_import" as const;
  if (normalized === "human_confirmation" || normalized === "confirmacao_humana") return "human_confirmation" as const;
  if (normalized === "legacy") return "legacy" as const;
  return "unknown" as const;
};

const kgrBinding = (value: unknown) => {
  const normalized = normalizeLabel(value);
  if (normalized === "confirmed" || normalized === "confirmado" || normalized === "confirmada") return "confirmed" as const;
  if (normalized === "candidate" || normalized === "candidato" || normalized === "candidata") return "candidate" as const;
  if (normalized === "conflict" || normalized === "conflito") return "conflict" as const;
  return "not_applicable" as const;
};

function explicitKgrIdentity(source: RecordLike, semantic: RecordLike | null): ArticleKgrIdentity | undefined {
  const nested = asRecord(first([source, semantic], ["kgrIdentity", "kgr_identity", "kgrDesignation", "kgr_designation"]));
  const kgrDecisionOrigin = normalizeLabel(first([source, semantic], ["kgrDecisionOrigin", "kgr_decision_origin", "kgr_decisao_origem"]));
  const automatedKgrDecision = ["ai", "ia", "automatic", "automatico", "provider"].includes(kgrDecisionOrigin ?? "");
  const applicability = automatedKgrDecision ? undefined : normalizeLabel(first([source, semantic], ["kgrApplicability", "kgr_applicability", "kgr_aplicabilidade"]));
  const decision = automatedKgrDecision ? undefined : normalizeLabel(first([source, semantic], ["kgrDecision", "kgr_decision", "kgr_decisao"]));
  const explicitApplicability = applicability === "applicable" || applicability === "not_applicable" || applicability === "pending"
    ? applicability
    : decision === "sim" || decision === "nao" || decision === "pendente" ? decision === "sim" ? "applicable" : decision === "nao" ? "not_applicable" : "pending" : undefined;
  const hasExplicitFields = Boolean(nested)
    || ["isKgrArticle", "is_kgr_article", "kgrBindingStatus", "kgr_binding_status", "boundSlug", "kgr_bound_slug", "principalKeywordDnaId", "principal_keyword_dna_id"]
      .some(key => source[key] !== undefined || semantic?.[key] !== undefined)
    || Boolean(explicitApplicability);
  if (!hasExplicitFields) return undefined;
  if (!nested && explicitApplicability && explicitApplicability !== "pending") {
    const notKgr = explicitApplicability === "not_applicable";
    return ArticleKgrIdentitySchema.parse({
      isKgrArticle: !notKgr,
      source: "minerador",
      bindingStatus: notKgr ? "not_applicable" : "candidate",
      status: notKgr ? "not_kgr" : "candidate",
      primaryKeywordId: text(source.id),
      primaryVolume: typeof source.volume_search === "number" ? source.volume_search : null,
      resultCount: typeof source.results_allintitle === "number" ? source.results_allintitle : null,
      kgrValue: typeof source.kgr_score === "number" ? source.kgr_score : null,
      evidence: [{ applicability: explicitApplicability, decision: first([source, semantic], ["kgr_decisao", "kgrDecision"]), sourceVersion: first([source, semantic], ["kgr_decisao_versao", "kgrDecisionVersion"]) }],
    });
  }
  const records = [nested, source, semantic];
  const raw = {
    isKgrArticle: first(records, ["isKgrArticle", "is_kgr_article"]) === true || first(records, ["isKgrArticle", "is_kgr_article"]) === "true" || first(records, ["isKgrArticle", "is_kgr_article"]) === "sim",
    source: kgrSource(first(records, ["source", "origin", "origem"])),
    principalKeywordDnaId: text(first(records, ["principalKeywordDnaId", "principal_keyword_dna_id"])),
    boundSlug: text(first(records, ["boundSlug", "bound_slug", "kgrBoundSlug", "kgr_bound_slug"])),
    bindingStatus: kgrBinding(first(records, ["bindingStatus", "binding_status", "kgrBindingStatus", "kgr_binding_status"])),
    evidenceKeywordDnaIds: Array.isArray(first(records, ["evidenceKeywordDnaIds", "evidence_keyword_dna_ids"])) ? first(records, ["evidenceKeywordDnaIds", "evidence_keyword_dna_ids"]) : undefined,
    kgrValue: typeof first(records, ["kgrValue", "kgr_value"]) === "number" ? first(records, ["kgrValue", "kgr_value"]) : typeof source.kgr_score === "number" ? source.kgr_score : null,
    kgrTier: text(first(records, ["kgrTier", "kgr_tier", "tier"])),
    confirmedAt: text(first(records, ["confirmedAt", "confirmed_at"])),
    confirmedBy: text(first(records, ["confirmedBy", "confirmed_by"])),
    sourceVersion: text(first(records, ["sourceVersion", "source_version", "evidenceVersion", "evidence_version"])),
    sourceHash: text(first(records, ["sourceHash", "source_hash", "evidenceHash", "evidence_hash"])),
    evidence: Array.isArray(first(records, ["evidence", "evidencias"])) ? first(records, ["evidence", "evidencias"]) : undefined,
    humanDecision: asRecord(first(records, ["humanDecision", "human_decision", "decisao_humana"])) || undefined,
  };
  const parsed = ArticleKgrIdentitySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Converte aliases legados/propostos em um único contexto do Arquiteto. */
export function adaptKeywordIdentityContext(source: RecordLike): Pick<ArchitectKeyword, "keywordUrlRelation" | "architectureStatus" | "urlEvidence" | "kgrIdentity" | "primaryKeywordPolicy" | "primaryKeywordPolicyContext"> {
  const semantic = asRecord(source.analise_semantica);
  const records = [source, semantic];
  const explicitRelation = normalizedRelation(first(records, ["keywordUrlRelation", "keyword_url_relation", "urlRelation", "url_relation", "relacaoUrl", "relacao_url"]));
  const architectureStatus = normalizedArchitectureStatus(first(records, ["architectureStatus", "architecture_status", "situacaoArquitetural", "situacao_arquitetural"]));
  const evidence = asRecord(first(records, ["urlEvidence", "url_evidence", "site_origin", "siteOrigin"]));
  const kgrIdentity = explicitKgrIdentity(source, semantic);
  const rawPolicy = first(records, ["primaryKeywordPolicy", "primary_keyword_policy"]);
  const primaryKeywordPolicy = sourcePolicy(rawPolicy) || (String(source.status || "").toLowerCase() === "publicado" ? "unknown" : "free");
  const relation = explicitRelation || (primaryKeywordPolicy === "locked" ? "confirmed_primary" : primaryKeywordPolicy === "reviewable" ? "candidate_primary" : undefined);
  const sourcePolicyPresent = rawPolicy !== undefined && rawPolicy !== null && rawPolicy !== "";
  const policySource = sourcePolicyPresent ? "minerador" as const : "legacy" as const;
  const sourceVersion = first(records, ["primaryKeywordPolicyVersion", "primary_keyword_policy_version"]);
  const sourceHash = first(records, ["primaryKeywordPolicyHash", "primary_keyword_policy_hash"]);
  const history = parsePolicyHistory(first(records, ["primaryKeywordPolicyHistory", "primary_keyword_policy_history"]));
  const policyContext = {
    policy: primaryKeywordPolicy,
    currentKeyword: text(first(records, ["primaryKeywordCurrent", "primary_keyword_current"])) || text(source.keyword) || "unknown",
    publishedOriginalKeyword: text(first(records, ["primaryKeywordPublishedOriginal", "primary_keyword_published_original"])),
    reason: text(first(records, ["primaryKeywordPolicyReason", "primary_keyword_policy_reason"])),
    actorId: text(first(records, ["primaryKeywordPolicyActor", "primary_keyword_policy_actor"])),
    decidedAt: text(first(records, ["primaryKeywordPolicyAt", "primary_keyword_policy_at"])),
    version: typeof first(records, ["primaryKeywordPolicyVersion", "primary_keyword_policy_version"]) === "number" ? first(records, ["primaryKeywordPolicyVersion", "primary_keyword_policy_version"]) as number : undefined,
    reviewRequired: first(records, ["primaryKeywordReviewRequired", "primary_keyword_review_required"]) === true || undefined,
    sourcePolicy: text(rawPolicy), source: policySource,
    ...(sourceVersion !== undefined && sourceVersion !== null ? { sourceVersion: String(sourceVersion) } : {}),
    ...(sourceHash !== undefined && sourceHash !== null ? { sourceHash: String(sourceHash) } : {}),
    ...(history.length ? { history } : {}),
  };
  return {
    ...(relation ? { keywordUrlRelation: relation } : {}),
    ...(architectureStatus ? { architectureStatus } : {}),
    ...(evidence ? { urlEvidence: evidence } : {}),
    ...(kgrIdentity ? { kgrIdentity } : {}),
    primaryKeywordPolicy,
    primaryKeywordPolicyContext: policyContext,
  };
}

export interface ArticleSerpIdentityContext {
  mode: "formacao" | "arquitetura_publicado" | "fortalecimento";
  publishedIdentityProtected: boolean;
  principalProtected: boolean;
  kgrIdentityProtected: boolean;
  slugProtected: boolean;
  canonicalProtected: boolean;
  brandProtected: boolean;
}

export function resolvePrimaryKeywordPolicy(input: {
  published: boolean;
  sourcePolicy?: PrimaryKeywordPolicy;
  principalKeywordId: string;
  keywordUrlRelation?: KeywordUrlRelationship;
  architectureStatus?: ArticleArchitectureStatus;
  kgrIdentity?: ArticleKgrIdentity;
  slug?: string | null;
}): { policy: PrimaryKeywordEffectivePolicy; protected: boolean; protectionReason: "kgr_binding_confirmed" | "architecture_confirmed" | "minerador_locked" | "published_revisable" | "new_unit" | "conflict" | "unknown" } {
  if (!input.published) {
    return { policy: input.sourcePolicy === "conflict" ? "conflict" : "free", protected: false, protectionReason: input.sourcePolicy === "conflict" ? "conflict" : "new_unit" };
  }
  if (isConfirmedKgrIdentity(input.kgrIdentity, input.principalKeywordId, input.slug)) return { policy: "locked", protected: true, protectionReason: "kgr_binding_confirmed" };
  if (input.keywordUrlRelation === "confirmed_primary" && input.architectureStatus === "architecture_confirmed") return { policy: "locked", protected: true, protectionReason: "architecture_confirmed" };
  if (input.sourcePolicy === "locked") return { policy: "locked", protected: true, protectionReason: "minerador_locked" };
  if (input.sourcePolicy === "reviewable" || input.sourcePolicy === "revisable") return { policy: "revisable", protected: false, protectionReason: "published_revisable" };
  if (input.sourcePolicy === "free") return { policy: "conflict", protected: false, protectionReason: "conflict" };
  if (input.sourcePolicy === "conflict") return { policy: "conflict", protected: false, protectionReason: "conflict" };
  return { policy: "unknown", protected: false, protectionReason: "unknown" };
}

export function isConfirmedKgrIdentity(identity: ArticleKgrIdentity | undefined, principalKeywordId: string, slug: string | null | undefined): boolean {
  return Boolean(identity?.isKgrArticle && identity.bindingStatus === "confirmed"
    && (identity.primaryKeywordId === principalKeywordId || identity.principalKeywordDnaId === principalKeywordId) && identity.boundSlug
    && (!slug || identity.boundSlug === slug));
}

export function resolveArticleSerpIdentityContext(input: {
  published: boolean;
  principalKeywordId: string;
  primaryKeywordPolicy?: PrimaryKeywordPolicy;
  keywordUrlRelation?: KeywordUrlRelationship;
  architectureStatus?: ArticleArchitectureStatus;
  kgrIdentity?: ArticleKgrIdentity;
  slug?: string | null;
}): ArticleSerpIdentityContext {
  const kgrIdentityProtected = isConfirmedKgrIdentity(input.kgrIdentity, input.principalKeywordId, input.slug);
  const confirmedArchitecturalPrincipal = input.keywordUrlRelation === "confirmed_primary"
    && ["architecture_confirmed", "conflict", "structural_review_required"].includes(input.architectureStatus || "");
  const policy = resolvePrimaryKeywordPolicy({ ...input, sourcePolicy: input.primaryKeywordPolicy });
  const principalProtected = kgrIdentityProtected || (input.published && confirmedArchitecturalPrincipal) || policy.protected;
  const publishedIdentityProtected = input.published;
  const mode = !input.published ? "formacao" : principalProtected ? "fortalecimento" : "arquitetura_publicado";
  return {
    mode,
    publishedIdentityProtected,
    principalProtected,
    kgrIdentityProtected,
    slugProtected: publishedIdentityProtected || kgrIdentityProtected,
    canonicalProtected: publishedIdentityProtected,
    brandProtected: publishedIdentityProtected,
  };
}

export function serpAssessmentModeLabel(mode: ArticleSerpIdentityContext["mode"]): string {
  if (mode === "formacao") return "SERP de formação";
  if (mode === "arquitetura_publicado") return "SERP de arquitetura do publicado";
  return "SERP de fortalecimento";
}
