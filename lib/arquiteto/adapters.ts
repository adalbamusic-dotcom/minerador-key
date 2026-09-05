import { ArticleDNASchema, KeywordDnaProvenanceSnapshotSchema, SiloDNASchema, SiloPageSchema, VersionReferenceSchema, type ArchitectKeyword, type ArticleDNA, type ArticleKeywordReference, type KeywordDNA, type ProvisionalArticleGroup, type SiloDNA, type SiloPage, type VersionEnvelope, type VersionReference, type KeywordDnaProvenanceSnapshot } from "./contracts.ts";
import { deepFreeze, legacyVersionReference, toVersionReference } from "./versioning.ts";
import { resolvePublishedIdentity } from "./serp-formation.ts";
import { adaptKeywordIdentityContext, resolvePrimaryKeywordPolicy } from "./identity-context.ts";
import { buildArticleIntentProfile, normalizeSearchIntent } from "./intent-profile.ts";
import { calculateArticleHierarchyStrategy, calculateArticleKeywordStrategy, calculateArticleStrategicPurpose, calculateArticleVolumeStrategy, deriveArticleKgrIdentity } from "./strategic-context.ts";
import { resolveArticleSerpStrategy, resolveEditorialUnitPurpose, suggestEditorialUnitClassification } from "./unit-strategy.ts";
import { assertArticleFormation } from "./article-formation-rules.ts";
import { normalizeKeywordDemandEvidence, sanitizeKeywordProvenanceSnapshot } from "./demand-evidence.ts";

const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const bool = (value: unknown) => value === true || value === "sim" || value === "true";
const confidence = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
};
const searchIntent = (value: unknown): KeywordDNA["searchIntent"] => {
  const normalized = normalizeSearchIntent(value);
  return normalized === "local" || normalized === "transactional" || normalized === "commercial_investigation" || normalized === "navigational" ? normalized : "informational";
};
const editorialType = (value: unknown): KeywordDNA["likelyEditorialType"] => {
  const allowed: KeywordDNA["likelyEditorialType"][] = ["guide", "tutorial", "review", "comparison", "best_list", "individual_product", "category", "problem_solution", "question"];
  const normalized = text(value, "guide") as KeywordDNA["likelyEditorialType"];
  return allowed.includes(normalized) ? normalized : "guide";
};
const commercial = (value: unknown): KeywordDNA["commercialPotential"] => {
  const normalized = text(value, "medium");
  return normalized === "low" || normalized === "high" ? normalized : "medium";
};
const affiliate = (value: unknown): KeywordDNA["affiliatePotential"] => {
  const normalized = text(value, "none");
  return normalized === "low" || normalized === "medium" || normalized === "high" ? normalized : "none";
};

export function legacyKeywordDnaPayload(keyword: ArchitectKeyword): KeywordDNA {
  const semantic = keyword.analise_semantica ?? {};
  const siteOrigin = semantic.site_origin && typeof semantic.site_origin === "object" ? semantic.site_origin as Record<string, unknown> : null;
  const siteEvidence = siteOrigin && typeof siteOrigin.sourceUrl === "string" && typeof siteOrigin.catalogEntryId === "string" && Array.isArray(siteOrigin.sourceFields)
    ? { siteEvidence: { brandId: String(siteOrigin.brandId || "legacy"), sourceUrl: siteOrigin.sourceUrl, catalogEntryId: siteOrigin.catalogEntryId, sourceFields: siteOrigin.sourceFields.filter((value): value is string => typeof value === "string"), slugCoherence: (["high", "medium", "low", "unknown"].includes(String(siteOrigin.slugCoherence)) ? String(siteOrigin.slugCoherence) : "unknown") as "high" | "medium" | "low" | "unknown", confidence: (["high", "medium", "low"].includes(String(siteOrigin.confidence)) ? String(siteOrigin.confidence) : "low") as "high" | "medium" | "low", qualificationStatus: (["awaiting_minerador", "sent", "existing", "ignored"].includes(String(siteOrigin.qualificationStatus)) ? String(siteOrigin.qualificationStatus) : "sent") as "awaiting_minerador" | "sent" | "existing" | "ignored", isKgr: false as const } }
    : {};
  return {
    schemaVersion: 1, keywordId: keyword.id, searchIntent: searchIntent(keyword.intent || semantic.intencao_principal), originalIntentLabel: text(keyword.intent || semantic.intencao_principal, "A confirmar"), likelyEditorialType: editorialType(semantic.tipo_editorial || semantic.formato_esperado),
    centralEntity: text(semantic.entidade_central, keyword.keyword), modifiers: text(semantic.modificadores, "").split(",").map(item => item.trim()).filter(Boolean), audience: text(semantic.publico, "A confirmar"),
    perceivedProblem: text(semantic.problema_percebido, "A confirmar"), desiredResult: text(semantic.resultado_desejado, "A confirmar"),
    awarenessLevel: text(semantic.nivel_consciencia, "A confirmar"), journeyStage: text(semantic.etapa_jornada, "A confirmar"),
    objections: [text(semantic.objecao_implicita, "")].filter(Boolean), dominantEmotion: text(semantic.emocao_dominante, "A confirmar"), commercialPotential: commercial(semantic.potencial_comercial),
    affiliatePotential: affiliate(semantic.potencial_afiliado), reviewCandidate: bool(semantic.candidato_review), productResearchRequired: bool(semantic.pesquisa_produto_necessaria),
    volumeSearch: typeof keyword.volume_search === "number" ? keyword.volume_search : null,
    resultCount: typeof (keyword as Record<string, unknown>).results_allintitle === "number" ? (keyword as Record<string, unknown>).results_allintitle as number : null,
    kgrScore: typeof keyword.kgr_score === "number" ? keyword.kgr_score : null,
    stampOrigin: semantic.dna_origem === "logico_deterministico" ? "system" : "import", confidence: confidence(semantic.dna_confianca), humanConfirmed: semantic.dna_revisao_humana === "aprovado",
    ...siteEvidence,
    demandEvidence: normalizeKeywordDemandEvidence(keyword),
    ...(() => {
      const context = adaptKeywordIdentityContext(keyword);
      return { ...(context.keywordUrlRelation ? { keywordUrlRelation: context.keywordUrlRelation } : {}), ...(context.architectureStatus ? { architectureStatus: context.architectureStatus } : {}), ...(context.kgrIdentity ? { kgrIdentity: context.kgrIdentity } : {}), primaryKeywordPolicy: context.primaryKeywordPolicy, primaryKeywordPolicyContext: context.primaryKeywordPolicyContext };
    })(),
  };
}

export function legacyKeywordDnaReference(keyword: ArchitectKeyword): VersionReference {
  return legacyVersionReference(keyword.id, legacyKeywordDnaPayload(keyword));
}

export function withLegacyKeywordDnaReference(keyword: ArchitectKeyword): ArchitectKeyword {
  return keyword.keywordDnaRef ? keyword : { ...keyword, keywordDnaRef: legacyKeywordDnaReference(keyword) };
}

export function legacyKeywordDnaEnvelope(keyword: ArchitectKeyword): VersionEnvelope<KeywordDNA> {
  const payload = legacyKeywordDnaPayload(keyword);
  const reference = legacyVersionReference(keyword.id, payload);
  return deepFreeze({ versionId: reference.versionId, entityId: keyword.id, versionNumber: 1, previousVersionId: null,
    contentHash: reference.contentHash, origin: "legacy", changeReason: "Adaptacao explicita de registro anterior ao pipeline versionado.",
    createdAt: new Date(0).toISOString(), createdBy: "legacy-adapter", payload });
}

function provenanceCapturedAt(keyword: ArchitectKeyword, explicit?: string) {
  const candidate = explicit
    || (keyword as Record<string, unknown>).updated_at
    || (keyword as Record<string, unknown>).updatedAt
    || (keyword as Record<string, unknown>).created_at
    || (keyword as Record<string, unknown>).createdAt;
  if (typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))) return new Date(candidate).toISOString();
  return new Date(0).toISOString();
}

function explicitKeywordDnaReference(keyword: ArchitectKeyword, sourceVersionId?: string | null, sourceContentHash?: string | null): VersionReference | null {
  const existing = VersionReferenceSchema.safeParse(keyword.keywordDnaRef);
  if (existing.success) return existing.data;
  const candidate = VersionReferenceSchema.safeParse({
    entityId: keyword.id,
    versionId: sourceVersionId,
    contentHash: sourceContentHash,
  });
  return candidate.success ? candidate.data : null;
}

function sourceKeywordSnapshot(keyword: ArchitectKeyword) {
  const source = Object.fromEntries(
    Object.entries(keyword as ArchitectKeyword & { keywordDnaSnapshot?: unknown })
      .filter(([key]) => key !== "keywordDnaSnapshot"),
  );
  return sanitizeKeywordProvenanceSnapshot(source) as Record<string, unknown>;
}

/**
 * Materializa a referência individual sem reduzir a origem a texto/métrica.
 * O payload normalizado atende ao contrato histórico; sourceKeywordSnapshot
 * conserva o registro recebido, inclusive nulls, refs, decisões e evidências.
 */
export function buildKeywordDnaProvenanceSnapshot(
  keyword: ArchitectKeyword,
  options: { brandId?: string; capturedAt?: string; sourceVersionId?: string | null; sourceContentHash?: string | null } = {},
): KeywordDnaProvenanceSnapshot {
  const reference = explicitKeywordDnaReference(keyword, options.sourceVersionId, options.sourceContentHash) || legacyKeywordDnaReference(keyword);
  return KeywordDnaProvenanceSnapshotSchema.parse({
    brandId: options.brandId || String((keyword as Record<string, unknown>).brand_id || "legacy"),
    keywordId: keyword.id,
    capturedAt: provenanceCapturedAt(keyword, options.capturedAt),
    versionReference: reference,
    payload: legacyKeywordDnaPayload(keyword),
    sourceKeywordSnapshot: sourceKeywordSnapshot(keyword),
  });
}

export function articleKeywordReference(keyword: ArchitectKeyword, role: ArticleKeywordReference["role"], brandId = "legacy"): ArticleKeywordReference {
  const suppliedSnapshot = KeywordDnaProvenanceSnapshotSchema.safeParse(keyword.keywordDnaSnapshot);
  const snapshot = suppliedSnapshot.success ? suppliedSnapshot.data : buildKeywordDnaProvenanceSnapshot(keyword, { brandId });
  const reference = snapshot.versionReference;
  const volume = typeof keyword.volume_search === "number" && Number.isFinite(keyword.volume_search) && keyword.volume_search >= 0 ? keyword.volume_search : null;
  const contribution = role === "principal" ? "central" : role === "secundaria" ? "incremental_volume" : "semantic_coverage";
  const purpose = role === "principal" ? "Define a identidade e a intenção central do artigo."
    : role === "secundaria" ? "Amplia alcance e volume compatível sem criar outra URL."
      : "Completa entidades, subtemas e a narrativa sem criar volume artificial.";
  return {
    keywordId: keyword.id, keywordDnaVersionId: reference.versionId, keywordDnaContentHash: reference.contentHash, role,
    strategicContribution: purpose,
    coveredIntentions: [keyword.intent || "A confirmar"], requiredTopics: [], excludedTopics: [],
    classificationOrigin: keyword.analise_semantica?.dna_origem === "logico_deterministico" ? "system" : reference.versionId.startsWith("legacy:") ? "legacy" : "ai",
    confidence: confidence(keyword.analise_semantica?.dna_confianca), humanConfirmed: keyword.analise_semantica?.dna_revisao_humana === "aprovado",
    originalIntentLabel: keyword.intent || (typeof keyword.analise_semantica?.intencao_principal === "string" ? keyword.analise_semantica.intencao_principal : undefined),
    normalizedIntent: normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal),
    volume,
    resultCount: typeof (keyword as Record<string, unknown>).results_allintitle === "number" ? (keyword as Record<string, unknown>).results_allintitle as number : null,
    kgrScore: typeof keyword.kgr_score === "number" ? keyword.kgr_score : null,
    incrementalVolume: role === "secundaria" ? volume : null,
    contribution,
    purpose,
    purposeRationale: role === "principal" ? "A intenção do artigo é herdada desta keyword." : role === "secundaria" ? "A consulta é tratada como expansão compatível da principal." : "A consulta cobre contexto sem alterar a principal.",
    overlapRisk: "unknown",
    ...(keyword.keywordUrlRelation ? { keywordUrlRelation: keyword.keywordUrlRelation } : {}),
    ...(keyword.urlEvidence ? { urlEvidence: keyword.urlEvidence } : {}),
    keywordDnaSnapshot: snapshot,
    demandEvidence: normalizeKeywordDemandEvidence(keyword),
  };
}

const stringList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim())
  : typeof value === "string" ? value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) : [];

/** Cria a base auditável do ArticleDNA apenas com sinais já presentes no grupo e nos KeywordDNAs. */
export function deterministicArticleDnaPayload(group: ProvisionalArticleGroup, brandId: string): ArticleDNA {
  assertArticleFormation(group, brandId);
  const principalId = group.principalSuggestion.keywordId;
  const principal = group.keywords.find(keyword => keyword.id === principalId) || group.keywords[0];
  const semantic = principal.analise_semantica || {};
  const references = group.keywords.map(keyword => articleKeywordReference(keyword,
    keyword.id === principalId ? "principal" : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria", brandId));
  const secondaryKeywordIds = references.filter(reference => reference.role === "secundaria").map(reference => reference.keywordId);
  const narrativeReinforcementIds = references.filter(reference => reference.role === "reforco_narrativo").map(reference => reference.keywordId);
  const pending = "Pendente de enriquecimento e revisão humana";
  const entities = [...new Set(group.keywords.flatMap(keyword => stringList(keyword.analise_semantica?.entidade_central)))];
  const architectureStatus = group.architectureStatus || principal.architectureStatus;
  const suggestedSlug = principal.slug_sugerido || principal.keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const volumeStrategy = calculateArticleVolumeStrategy(group);
  const enrichedReferences = references.map(reference => {
    const contribution = volumeStrategy.contributions.find(item => item.keywordId === reference.keywordId);
    return contribution ? { ...reference, incrementalVolume: contribution.incrementalVolume, contribution: contribution.contribution, overlapRisk: volumeStrategy.overlapRisk, purpose: contribution.rationale } : reference;
  });
  const hierarchyStrategy = calculateArticleHierarchyStrategy(group);
  const intentProfile = buildArticleIntentProfile({ principal, principalReference: enrichedReferences.find(reference => reference.keywordId === principalId)!, references: enrichedReferences });
  const strategicPurpose = calculateArticleStrategicPurpose(group, intentProfile.primaryIntent, volumeStrategy, hierarchyStrategy);
  const keywordStrategy = calculateArticleKeywordStrategy({ group, principalIntent: intentProfile.primaryIntent, volume: volumeStrategy, published: Boolean(group.publishedAnchorId) });
  const resolvedKgrIdentity = deriveArticleKgrIdentity(group, principal, suggestedSlug);
  const primaryPolicy = resolvePrimaryKeywordPolicy({
    published: Boolean(group.publishedAnchorId), sourcePolicy: principal.primaryKeywordPolicy,
    principalKeywordId: principalId, keywordUrlRelation: principal.keywordUrlRelation,
    architectureStatus, kgrIdentity: resolvedKgrIdentity, slug: suggestedSlug,
  });
  const unitClassification = suggestEditorialUnitClassification({ principal, published: Boolean(group.publishedAnchorId) });
  const serpStrategy = resolveArticleSerpStrategy({
    unit: unitClassification, primaryIntent: intentProfile.primaryIntent, published: Boolean(group.publishedAnchorId),
    principalKeywordId: principalId, slug: suggestedSlug, primaryKeywordPolicy: primaryPolicy.policy, keywordUrlRelation: principal.keywordUrlRelation,
    architectureStatus, kgrIdentity: resolvedKgrIdentity,
  });
  const primaryCandidates = group.keywords.filter(keyword => keyword.id !== principalId).map(keyword => ({
    keywordId: keyword.id, keywordDnaId: keyword.keywordDnaRef?.entityId || keyword.id, keyword: keyword.keyword,
    status: "candidate" as const, source: "system" as const,
    reason: "Candidata preservada para comparação SERP e decisão humana; volume sozinho não confirma principal.",
  }));
  const unitPurpose = resolveEditorialUnitPurpose({ unit: unitClassification, primaryIntent: intentProfile.primaryIntent, published: Boolean(group.publishedAnchorId), lifecycleMode: serpStrategy.lifecycleMode, audience: text(semantic.publico, pending), searchNeed: text(semantic.problema_percebido, `entender ${principal.keyword}`) });
  const publicationIdentity = group.publishedAnchorId ? resolvePublishedIdentity(group.keywords.map(keyword => ({ keywordDnaId: keyword.id, publishedUrl: keyword.publishedUrl || keyword.url, canonical: keyword.canonical, slug: keyword.slug_sugerido }))) : null;
  const identityRef = publicationIdentity?.status === "coherent" ? {
    publicationStatus: "published_protected" as const, publishedUrl: publicationIdentity.publishedUrl, canonical: publicationIdentity.canonical,
    slug: principal.slug_sugerido || "published-identity", source: "keyword_dna" as const, sourceKeywordDnaIds: publicationIdentity.sourceKeywordDnaIds,
    verification: { status: "not_checked" as const, checkedAt: null, requestedUrl: publicationIdentity.publishedUrl, resolvedUrl: null, declaredCanonical: null, httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: "URL preservada da KeywordDNA; verificação online pendente." },
  } : undefined;
  return ArticleDNASchema.parse({
    schemaVersion: 1, articleId: group.publishedAnchorId || group.id, brandId, principalKeywordId: principalId,
    secondaryKeywordIds, narrativeReinforcementIds, keywordReferences: enrichedReferences, siloId: group.suggestedSiloId,
    // O pai estrutural do fluxo Silo-first viaja com o grupo e precisa CHEGAR
    // ao payload. Sem ele o ArticleDNA só descobre o próprio Silo pelo consenso
    // das keywords — e passa a mudar de pai sempre que uma delas se mover.
    ...(group.territoryRef ? { territoryRef: group.territoryRef } : {}),
    hierarchy: group.suggestedHierarchy, suggestedSlug, canonical: publicationIdentity?.status === "coherent" ? publicationIdentity.canonical || null : null,
    mainIntent: intentProfile.primaryIntent,
    intentProfile, volumeStrategy, hierarchyStrategy, strategicPurpose, keywordStrategy, unitClassification, unitPurpose, serpStrategy,
    auxiliaryIntents: [...new Set(group.keywords.filter(keyword => keyword.id !== principalId).map(keyword => keyword.intent).filter(Boolean))],
    audience: text(semantic.publico, pending), problem: text(semantic.problema_percebido, pending), desiredResult: text(semantic.resultado_desejado, pending),
    journeyStage: text(semantic.etapa_jornada, pending), brandObjective: text(semantic.objetivo_marca, pending),
    promise: text(semantic.promessa, `Cobrir com clareza o tema “${principal.keyword}”.`), angle: text(semantic.angulo, pending), cta: text(semantic.cta, pending),
    coverage: group.keywords.map(keyword => keyword.keyword), excludedSubjects: stringList(semantic.assuntos_excluidos),
    antiCannibalizationBoundary: text(semantic.fronteira_anti_canibalizacao, `Manter a cobertura centrada em “${principal.keyword}” e revisar sobreposições antes da publicação.`),
    nearbyArticleIds: [], differentiation: [], entities, requiredTopics: group.keywords.map(keyword => keyword.keyword),
    questions: stringList(semantic.perguntas), objections: stringList(semantic.objecoes || semantic.objecao_implicita), evidenceNeeded: stringList(semantic.evidencias_necessarias),
    sourcesNeeded: stringList(semantic.fontes_necessarias), internalLinks: [],
    // Promessa, CTA e enriquecimento editorial pertencem ao Planejador/Redator:
    // seguem como alerta informativo e não bloqueiam a aprovação estrutural.
    alerts: [
      ...group.alerts,
      "ArticleDNA-base criado pela lógica determinística, sem IA.",
      "Estratégia, promessa, CTA e fronteira serão enriquecidas no Planejador/Redator; não bloqueiam a arquitetura.",
    ],
    confidence: group.confidence, humanPendingDecisions: [...(publicationIdentity?.status === "conflict" ? ["Resolver conflito entre URLs/canonicals de origem antes de confirmar a identidade publicada."] : [])],
    ...(architectureStatus ? { architectureStatus } : {}),
    ...(resolvedKgrIdentity ? { kgrIdentity: resolvedKgrIdentity } : {}),
    primaryKeywordMetrics: { volumeSearch: typeof principal.volume_search === "number" ? principal.volume_search : null, resultCount: typeof (principal as Record<string, unknown>).results_allintitle === "number" ? (principal as Record<string, unknown>).results_allintitle as number : null, kgrScore: typeof principal.kgr_score === "number" ? principal.kgr_score : null },
    primaryKeywordPolicy: primaryPolicy.policy,
    ...(principal.primaryKeywordPolicyContext ? { primaryKeywordPolicyContext: principal.primaryKeywordPolicyContext } : {}),
    ...(primaryCandidates.length ? { primaryKeywordCandidates: primaryCandidates } : {}),
    ...(primaryPolicy.policy === "revisable" ? { primaryKeywordDecision: { status: "pending" as const, previousKeywordId: principalId, selectedKeywordId: principalId, reason: "Principal publicada recebida como revisável; comparação e confirmação humana pendentes." } } : {}),
    ...(identityRef ? { publishedIdentityRef: identityRef } : {}),
  });
}

/** Cria a base auditável do SiloDNA apenas com sinais já presentes no nome do silo e nos ArticleDNAs. */
export function deterministicSiloDnaPayload(
  siloId: string,
  siloName: string,
  articleVersions: VersionEnvelope<ArticleDNA>[],
  options: { brandId?: string; centralEntity?: string; centralKeywordDnaRef?: VersionReference } = {},
): SiloDNA {
  const centralEntity = options.centralEntity?.trim() || siloName;
  const pending = "Pendente de enriquecimento e revisão humana";
  const articleReferences = articleVersions.map(version => ({
    articleId: version.payload.articleId,
    articleDnaVersionId: version.versionId,
    articleDnaContentHash: version.contentHash,
    role: version.payload.hierarchy === "Pilar" ? "Pilar" as const : "Suporte" as const,
  }));
  const pillar = articleReferences.find(ref => ref.role === "Pilar")?.articleId ?? null;
  const supportArticleIds = articleReferences.filter(ref => ref.articleId !== pillar).map(ref => ref.articleId);
  const articleRoles = articleVersions.map(version => ({
    articleId: version.payload.articleId,
    role: version.payload.hierarchy,
    reason: version.payload.promise,
  }));
  const narrativeOrder = articleVersions.map(version => version.payload.articleId);
  const linkMap = supportArticleIds.map(supportId => ({
    fromArticleId: supportId,
    toArticleId: pillar || supportId,
    reason: "Aprofunda e retorna ao Pilar.",
  }));
  const includedTopics = [...new Set(articleVersions.flatMap(version => version.payload.coverage))];
  const dominantIntent = articleVersions[0]?.payload.mainIntent || pending;
  const audience = articleVersions[0]?.payload.audience || pending;
  const hierarchySignals = articleVersions.map((version, index) => ({
    articleDnaId: version.payload.articleId,
    principalVolume: version.payload.keywordStrategy?.principalVolume ?? version.payload.volumeStrategy?.primaryKeywordVolume ?? null,
    combinedVolume: version.payload.keywordStrategy?.combinedVolume ?? version.payload.volumeStrategy?.grossCombinedVolume ?? null,
    tailLength: version.payload.keywordStrategy?.principalKeywordDnaId.split(/[-_\s]+/).filter(Boolean).length || 0,
    kgrScore: version.payload.kgrIdentity?.kgrValue ?? null,
    semanticCentrality: version.payload.hierarchyStrategy?.components.semanticCentrality ?? version.payload.confidence,
    intentBreadth: new Set(version.payload.keywordReferences.map(reference => reference.normalizedIntent).filter(Boolean)).size,
    suggestedRole: index === 0 ? "pillar" as const : "support" as const,
    supportOrder: index === 0 ? null : index,
    rationale: index === 0 ? "Pilar sugerido por centralidade editorial; confirmação humana obrigatória." : "Suporte ordenado por papel narrativo e cobertura do silo; confirmação humana obrigatória.",
  }));
  return SiloDNASchema.parse({
    schemaVersion: 1, siloId, ...(options.brandId ? { brandId: options.brandId } : {}), name: siloName, centralEntity,
    ...(options.centralKeywordDnaRef ? { centralEntitySource: "keyword_dna" as const, centralKeywordDnaRef: options.centralKeywordDnaRef } : { centralEntitySource: "manual" as const }),
    objective: `Construir autoridade em ${centralEntity.toLowerCase()}.`,
    audience, macroProblem: `Dificuldade em ${centralEntity.toLowerCase()} para ${audience.toLowerCase()}.`,
    dominantIntent, pillarArticleId: pillar, supportArticleIds, articleReferences,
    articleRoles, narrativeOrder, linkMap,
    boundary: `Manter a cobertura centrada em ${siloName.toLowerCase()} e revisar sobreposições antes da publicação.`,
    includedTopics, excludedTopics: [], nearbySiloIds: [], possibleConflicts: [],
    gaps: [], nextContents: [],
    confidence: 0.5,
    hierarchySignals,
    humanPendingDecisions: ["Enriquecer estratégia, links, lacunas e fronteira com IA ou revisão humana antes do planejamento final."],
  });
}

/**
 * Cria apenas o registro estrutural mínimo de um silo manual.
 *
 * Este payload não inventa entidade central, intenção, público ou artigo.
 * Esses campos ficam explicitamente pendentes até o processamento lógico e a
 * confirmação humana da arquitetura.
 */
export function manualSiloDnaDraftPayload(
  siloId: string,
  siloName: string,
  brandId: string,
): SiloDNA {
  const pending = "Pendente de formação editorial";
  return SiloDNASchema.parse({
    schemaVersion: 1,
    formationStatus: "draft",
    siloId,
    brandId,
    name: siloName.trim(),
    centralEntity: "",
    centralEntitySource: "manual",
    objective: "",
    audience: "",
    macroProblem: "",
    dominantIntent: "",
    pillarArticleId: null,
    supportArticleIds: [],
    articleReferences: [],
    articleRoles: [],
    narrativeOrder: [],
    linkMap: [],
    boundary: "",
    includedTopics: [],
    excludedTopics: [],
    nearbySiloIds: [],
    possibleConflicts: [],
    gaps: [],
    nextContents: [],
    confidence: 0,
    hierarchySignals: [],
    humanPendingDecisions: [pending, "Definir entidade central, intenção dominante e fronteira do silo."],
  });
}

/** Cria a base determinística da Página do Silo a partir do SiloDNA e seus artigos. */
export function deterministicSiloPagePayload(
  siloDnaVersion: VersionEnvelope<SiloDNA>,
  brandId: string,
  slug: string,
  options: { publicationStatus?: "new" | "published"; publishedUrl?: string | null; publicationVerification?: SiloPage["publicationVerification"] } = {},
): SiloPage {
  const silo = siloDnaVersion.payload;
  const siloDnaRef = toVersionReference(siloDnaVersion);
  const h1 = silo.centralEntity;
  const seoTitle = `${silo.centralEntity} | Guia completo`;
  const metaDescription = silo.objective;
  const intro = `${silo.objective} Este conteúdo organiza os principais temas sobre ${silo.centralEntity.toLowerCase()} para ${silo.audience.toLowerCase()}.`;
  const sections = silo.narrativeOrder.map((articleId, index) => ({
    id: `section:${index + 1}`,
    // O título da seção nomeia o RECORTE, não a justificativa interna.
    //
    // `reason` explica por que aquele artigo tem aquele papel — é registro de
    // decisão, não texto de página. Usá-lo como heading punha "unidade
    // editorial principal confirmada pelo humano" na frente do leitor, e daí
    // ele ainda virava candidato a texto de link.
    heading: silo.articleRoles.find(role => role.articleId === articleId)?.role === "Pilar"
      ? `${silo.centralEntity}: visão geral`
      : `${silo.centralEntity}: aprofundamento ${index}`,
    objective: `Conectar o leitor ao tema ${silo.centralEntity.toLowerCase()}.`,
    linkedArticleIds: [articleId],
  }));
  const breadcrumbs = [{ label: "Início", slug: "/" }, { label: silo.centralEntity, slug }];
  return SiloPageSchema.parse({
    schemaVersion: 1, siloPageId: `silo-page:${silo.siloId}`, brandId, siloDnaRef, siloId: silo.siloId,
    slug, publicationStatus: options.publicationStatus || "new", publishedUrl: options.publishedUrl ?? null,
    publicationVerification: options.publicationVerification || {
      status: options.publicationStatus === "published" ? "not_checked" as const : "not_applicable" as const,
      checkedAt: null, requestedUrl: options.publishedUrl ?? null, resolvedUrl: null, declaredCanonical: null,
      httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null,
    },
    h1, seoTitle, metaDescription, canonical: null, intro, sections,
    cta: `Conheça todos os conteúdos sobre ${silo.centralEntity.toLowerCase()}.`,
    coverImageBrief: `Imagem representativa de ${silo.centralEntity}.`,
    visualBriefing: `Layout de landing page com hero, seções em ordem narrativa e CTA final.`,
    breadcrumbs, pillarArticleId: silo.pillarArticleId, supportArticleIds: silo.supportArticleIds,
    indexationStatus: "noindex" as const, alerts: ["Página do Silo criada pela lógica determinística, sem IA."],
    confidence: silo.confidence, humanPendingDecisions: ["Revisar H1, SEO, intro, seções e CTA antes da publicação."],
  });
}

/** Cria a página pareada em estado novo, sem fabricar texto publicável. */
export function manualSiloPageDraftPayload(
  siloDnaVersion: VersionEnvelope<SiloDNA>,
  brandId: string,
  slug: string,
): SiloPage {
  const silo = siloDnaVersion.payload;
  return SiloPageSchema.parse({
    schemaVersion: 1,
    formationStatus: "draft",
    siloPageId: `silo-page:${silo.siloId}`,
    brandId,
    siloDnaRef: toVersionReference(siloDnaVersion),
    siloId: silo.siloId,
    slug,
    publicationStatus: "new",
    publishedUrl: null,
    publicationVerification: {
      status: "not_applicable",
      checkedAt: null,
      requestedUrl: null,
      resolvedUrl: null,
      declaredCanonical: null,
      httpStatus: null,
      sitemapUrl: null,
      sitemapMatch: null,
      message: null,
    },
    h1: "",
    seoTitle: "",
    metaDescription: "",
    canonical: null,
    intro: "",
    sections: [],
    cta: "",
    coverImageBrief: "",
    visualBriefing: "",
    breadcrumbs: [],
    pillarArticleId: null,
    supportArticleIds: [],
    indexationStatus: "noindex",
    alerts: ["Página do Silo criada como rascunho estrutural; conteúdo publicável ainda não foi formado."],
    confidence: 0,
    humanPendingDecisions: ["Formar a arquitetura do silo antes de preencher a página."],
  });
}
