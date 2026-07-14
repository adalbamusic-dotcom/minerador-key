import { ArticleDNASchema, type ArchitectKeyword, type ArticleDNA, type ArticleKeywordReference, type KeywordDNA, type ProvisionalArticleGroup, type VersionEnvelope, type VersionReference } from "./contracts.ts";
import { deepFreeze, legacyVersionReference } from "./versioning.ts";

const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const bool = (value: unknown) => value === true || value === "sim" || value === "true";
const confidence = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
};
const searchIntent = (value: unknown): KeywordDNA["searchIntent"] => {
  const normalized = text(value, "").toLowerCase();
  if (normalized.includes("local")) return "local";
  if (normalized.includes("venda") || normalized.includes("transac")) return "transactional";
  if (normalized.includes("comercial")) return "commercial_investigation";
  if (normalized.includes("navega")) return "navigational";
  return "informational";
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
  return {
    schemaVersion: 1, keywordId: keyword.id, searchIntent: searchIntent(semantic.intencao_principal || keyword.intent), likelyEditorialType: editorialType(semantic.tipo_editorial || semantic.formato_esperado),
    centralEntity: text(semantic.entidade_central, keyword.keyword), modifiers: text(semantic.modificadores, "").split(",").map(item => item.trim()).filter(Boolean), audience: text(semantic.publico, "A confirmar"),
    perceivedProblem: text(semantic.problema_percebido, "A confirmar"), desiredResult: text(semantic.resultado_desejado, "A confirmar"),
    awarenessLevel: text(semantic.nivel_consciencia, "A confirmar"), journeyStage: text(semantic.etapa_jornada, "A confirmar"),
    objections: [text(semantic.objecao_implicita, "")].filter(Boolean), dominantEmotion: text(semantic.emocao_dominante, "A confirmar"), commercialPotential: commercial(semantic.potencial_comercial),
    affiliatePotential: affiliate(semantic.potencial_afiliado), reviewCandidate: bool(semantic.candidato_review), productResearchRequired: bool(semantic.pesquisa_produto_necessaria),
    stampOrigin: semantic.dna_origem === "logico_deterministico" ? "system" : "import", confidence: confidence(semantic.dna_confianca), humanConfirmed: semantic.dna_revisao_humana === "aprovado",
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

export function articleKeywordReference(keyword: ArchitectKeyword, role: ArticleKeywordReference["role"]): ArticleKeywordReference {
  const reference = keyword.keywordDnaRef ?? legacyKeywordDnaReference(keyword);
  return {
    keywordId: keyword.id, keywordDnaVersionId: reference.versionId, keywordDnaContentHash: reference.contentHash, role,
    strategicContribution: role === "principal" ? "Define o contrato editorial do artigo." : "Amplia a cobertura sem criar outra URL.",
    coveredIntentions: [keyword.intent || "A confirmar"], requiredTopics: [], excludedTopics: [],
    classificationOrigin: keyword.analise_semantica?.dna_origem === "logico_deterministico" ? "system" : reference.versionId.startsWith("legacy:") ? "legacy" : "ai",
    confidence: confidence(keyword.analise_semantica?.dna_confianca), humanConfirmed: keyword.analise_semantica?.dna_revisao_humana === "aprovado",
  };
}

const stringList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim())
  : typeof value === "string" ? value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean) : [];

/** Cria a base auditável do ArticleDNA apenas com sinais já presentes no grupo e nos KeywordDNAs. */
export function deterministicArticleDnaPayload(group: ProvisionalArticleGroup, brandId: string): ArticleDNA {
  const principalId = group.principalSuggestion.keywordId;
  const principal = group.keywords.find(keyword => keyword.id === principalId) || group.keywords[0];
  const semantic = principal.analise_semantica || {};
  const references = group.keywords.map(keyword => articleKeywordReference(keyword,
    keyword.id === principalId ? "principal" : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria"));
  const secondaryKeywordIds = references.filter(reference => reference.role === "secundaria").map(reference => reference.keywordId);
  const narrativeReinforcementIds = references.filter(reference => reference.role === "reforco_narrativo").map(reference => reference.keywordId);
  const pending = "Pendente de enriquecimento e revisão humana";
  const entities = [...new Set(group.keywords.flatMap(keyword => stringList(keyword.analise_semantica?.entidade_central)))];
  return ArticleDNASchema.parse({
    schemaVersion: 1, articleId: group.publishedAnchorId || group.id, brandId, principalKeywordId: principalId,
    secondaryKeywordIds, narrativeReinforcementIds, keywordReferences: references, siloId: group.suggestedSiloId,
    hierarchy: group.suggestedHierarchy, suggestedSlug: principal.slug_sugerido || principal.keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), canonical: null,
    mainIntent: principal.intent || text(semantic.intencao_principal, pending),
    auxiliaryIntents: [...new Set(group.keywords.filter(keyword => keyword.id !== principalId).map(keyword => keyword.intent).filter(Boolean))],
    audience: text(semantic.publico, pending), problem: text(semantic.problema_percebido, pending), desiredResult: text(semantic.resultado_desejado, pending),
    journeyStage: text(semantic.etapa_jornada, pending), brandObjective: text(semantic.objetivo_marca, pending),
    promise: text(semantic.promessa, `Cobrir com clareza o tema “${principal.keyword}”.`), angle: text(semantic.angulo, pending), cta: text(semantic.cta, pending),
    coverage: group.keywords.map(keyword => keyword.keyword), excludedSubjects: stringList(semantic.assuntos_excluidos),
    antiCannibalizationBoundary: text(semantic.fronteira_anti_canibalizacao, `Manter a cobertura centrada em “${principal.keyword}” e revisar sobreposições antes da publicação.`),
    nearbyArticleIds: [], differentiation: [], entities, requiredTopics: group.keywords.map(keyword => keyword.keyword),
    questions: stringList(semantic.perguntas), objections: stringList(semantic.objecoes || semantic.objecao_implicita), evidenceNeeded: stringList(semantic.evidencias_necessarias),
    sourcesNeeded: stringList(semantic.fontes_necessarias), internalLinks: [], alerts: [...group.alerts, "ArticleDNA-base criado pela lógica determinística, sem IA."],
    confidence: group.confidence, humanPendingDecisions: ["Enriquecer estratégia, promessa, CTA e fronteira com IA ou revisão humana antes do planejamento final."],
  });
}
