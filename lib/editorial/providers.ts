import type { ContentDocument, ProductEvidenceDNA, SerpSnapshot, VersionEnvelope } from "../arquiteto/contracts.ts";
import { ContentDocumentSchema, ProductEvidenceDNASchema, SerpSnapshotSchema } from "../arquiteto/contracts.ts";
import { contentHash, createVersionEnvelope, legacyVersionReference, toVersionReference } from "../arquiteto/versioning.ts";
import { ExternalSimilarityInputSchema, ExternalSimilarityResultSchema, ProductEvidenceInputSchema, SerpCollectionRecordSchema, SerpQueryInputSchema, type SerpCollectionRecord, type SerpQueryInput } from "./contracts.ts";
import type { ContentPlan } from "../arquiteto/contracts.ts";
import { ExternalSourceSuggestionSchema, GuardianFindingSchema, InternalLinkAssignmentSchema, PublicationRecordSchema } from "./operational-contracts.ts";

export interface SerpProvider { collectSnapshot(input: SerpQueryInput): Promise<SerpCollectionRecord> }
export interface ExternalSimilarityProvider { compare(input: unknown): Promise<unknown> }
export interface ProductEvidenceProvider { collect(input: unknown): Promise<ProductEvidenceDNA> }

export const mockSerpProvider: SerpProvider = {
  async collectSnapshot(rawInput) {
    const input = SerpQueryInputSchema.parse(rawInput);
    const snapshot: SerpSnapshot = SerpSnapshotSchema.parse({
      schemaVersion: 1, keyword: input.keyword, location: input.location, capturedAt: new Date().toISOString(),
      results: [
        { position: 1, title: `Guia completo sobre ${input.keyword}`, url: "https://example.com/guia", pageType: "artigo", format: "guia", entities: [input.keyword] },
        { position: 2, title: `${input.keyword}: dúvidas frequentes`, url: "https://example.org/perguntas", pageType: "artigo", format: "faq", entities: [input.keyword] },
      ], dominantIntent: "informational", formats: ["guia", "faq"], entities: [input.keyword],
      questions: [`Como funciona ${input.keyword}?`], patterns: ["Guias introdutórios dominam o exemplo simulado."],
      gaps: ["Poucas evidências próprias."], opportunities: ["Adicionar experiência e exemplos da marca."],
    });
    return SerpCollectionRecordSchema.parse({ id: `mock-serp-${input.articleId}`, input, status: "needs_review", provider: "mock-local",
      origin: "mock", isMock: true, snapshot, cost: 0, error: null, dnaIntent: null,
      conflictReason: "Snapshot simulado: validar intenção com fonte real antes de qualquer decisão.", humanDecisionRequired: true });
  },
};

export const mockExternalSimilarityProvider: ExternalSimilarityProvider = {
  async compare(rawInput) {
    ExternalSimilarityInputSchema.parse(rawInput);
    return ExternalSimilarityResultSchema.parse({ score: 0.18, phraseMatches: [], headingMatches: [],
      structuralRisks: ["Resultado demonstrativo; conteúdo externo não foi coletado."], humanDecisionRequired: true });
  },
};

export const mockProductEvidenceProvider: ProductEvidenceProvider = {
  async collect(rawInput) {
    const input = ProductEvidenceInputSchema.parse(rawInput);
    return ProductEvidenceDNASchema.parse({ schemaVersion: 1, evidenceId: `mock-product-${input.articleId}`,
      product: { name: input.productQuery, brand: "Marca simulada", model: null, category: "Demonstração", marketplace: input.marketplace,
        sourceUrl: "https://example.com/produto-simulado", collectedAt: new Date().toISOString() },
      rating: { average: 4.2, reviewCount: 25, distribution: { "5": 16, "4": 5, "3": 2, "2": 1, "1": 1 } },
      recurringPraise: [{ pattern: "Facilidade de uso", frequency: 8, confidence: 0.5 }],
      recurringComplaints: [{ pattern: "Instruções limitadas", frequency: 3, severity: "moderada", confidence: 0.4 }],
      objections: ["Resultado não verificado"], expectations: ["Validar com fonte real"], usageContexts: ["Demonstração da interface"],
      buyerProfile: "Perfil simulado", perceivedBenefits: ["Exemplo visual"], perceivedLimitations: ["Não é evidência real"],
      sources: [{ sourceId: "mock-source-product", url: "https://example.com/produto-simulado", evidenceType: "consumer_opinion", sampleSize: 25 }],
      confidence: 0.3, verificationPending: ["Substituir por coleta real após escolha do provedor."],
    });
  },
};

export async function createMockPlanAndDocument(brandId: string) {
  const brandRef = legacyVersionReference(`mock-brand-${brandId}`, { mock: true });
  const keywordRef = legacyVersionReference(`mock-keyword-${brandId}`, { mock: true });
  const articleRef = legacyVersionReference(`mock-article-${brandId}`, { mock: true });
  const siloRef = legacyVersionReference(`mock-silo-${brandId}`, { mock: true });
  const serpHash = await contentHash({ mock: "serp" });
  const planPayload: ContentPlan = {
    schemaVersion: 1, planId: `mock-plan-${brandId}`, brandDnaRef: brandRef, keywordDnaRefs: [keywordRef], articleDnaRef: articleRef,
    siloDnaRef: siloRef, serpEvidenceRefs: [{ artifactId: `mock-serp-${brandId}`, artifactType: "serp_snapshot", contentHash: serpHash }],
    productEvidenceRefs: [], originalityReportRef: null,
    approvedOutline: [{ id: "mock-section-1", heading: "Introdução", objective: "Apresentar o problema sem promessas genéricas.", keywordDnaRefs: [keywordRef] }],
    writingInstructions: ["Demonstração local; não utilizar como planejamento aprovado."], humanPendingDecisions: ["Executar SERP real."],
  };
  const plan = await createVersionEnvelope({ entityId: planPayload.planId, versionNumber: 1, origin: "system", changeReason: "Demonstração local sob demanda.", createdBy: "mock-provider", payload: planPayload });
  const provenance = { keywordDnaRefs: [keywordRef], evidenceRefs: planPayload.serpEvidenceRefs, sourceIds: ["mock-source"] };
  const document: ContentDocument = ContentDocumentSchema.parse({ schemaVersion: 1, id: `mock-document-${brandId}`, title: "Documento editorial simulado",
    status: "planejado", contentPlanRef: toVersionReference(plan), brandDnaRef: brandRef, keywordDnaRefs: [keywordRef], siloDnaRef: siloRef,
    articleDnaRef: articleRef, serpSnapshotRefs: planPayload.serpEvidenceRefs, evidenceRefs: [], sourceIds: ["mock-source"], linkMap: [],
    instructions: planPayload.writingInstructions,
    blocks: [
      { id: "mock-h1", type: "heading", level: 1, text: "Título demonstrativo", provenance },
      { id: "mock-p1", type: "paragraph", text: "Este bloco mostra como o futuro documento preservará proveniência.", provenance },
      { id: "mock-product", type: "product_block", productEvidenceId: "mock-product", title: "Evidência de produto", summary: "Espaço reservado para evidência validada.", provenance },
      { id: "mock-comparison", type: "comparison", title: "Comparação editorial", columns: ["Critério", "Direção"], rows: [["Originalidade", "Adicionar experiência própria"]], provenance },
    ] });
  return { plan: plan as VersionEnvelope<ContentPlan>, document };
}

export function createMockOperationalBundle(brandId: string, articleId = "mock-article", targetArticleId = "mock-target") {
  const internalLink = InternalLinkAssignmentSchema.parse({ id: `mock-link-${articleId}`, sourceArticleId: articleId, targetArticleId,
    targetSlug: "artigo-destino", strategicReason: "Conectar a explicação ao aprofundamento planejado.", recommendedContext: "Após apresentar o conceito central.",
    relatedTopic: "Escolha e comparação", linkIntent: "aprofundamento", suggestedPosition: "primeiro H2 relevante",
    candidates: [
      { id: "anchor-1", text: "escolher a opção adequada", semanticReason: "Natural no contexto e evita keyword exata.", naturalness: 0.9, repetitionRisk: "low", overOptimizationRisk: "low", approved: false },
      { id: "anchor-2", text: "comparar alternativas para este caso", semanticReason: "Variação semântica ligada ao destino.", naturalness: 0.82, repetitionRisk: "low", overOptimizationRisk: "low", approved: false },
    ], previouslyUsedAnchors: [], required: true, status: "suggested", humanApproved: false });
  const externalSource = ExternalSourceSuggestionSchema.parse({ id: `mock-source-${articleId}`, articleId,
    claim: "Esta afirmação técnica precisa de comprovação externa.", entity: "Entidade técnica relacionada", sourceType: "official_documentation",
    candidateUrl: null, domain: null, title: null, reason: "Comprovar a especificação sem inventar estudo ou URL.", relationToArticle: "Evidência para tópico obrigatório.",
    confidence: 0.6, authority: "unknown", checkedAt: null, stalenessRisk: "medium", status: "needs_source", humanApproved: false });
  const finding = GuardianFindingSchema.parse({ id: `mock-finding-${articleId}`, documentId: `mock-document-${brandId}`, sectionId: "mock-section-1",
    category: "anchor", severity: "warning", message: "A âncora usada está genérica demais.", suggestion: internalLink.candidates[0].text, humanDecisionRequired: true });
  const publication = PublicationRecordSchema.parse({ id: `mock-publication-${articleId}`, articleId, brandId, title: "Conteúdo demonstrativo",
    slug: "conteudo-demonstrativo", siloId: null, documentRef: null, responsible: null, status: "queue", seoScore: null,
    originalityScore: null, ymylStatus: "pending", linkCount: 0, sourceCount: 0, imageCount: 0, destination: null,
    lastEditedAt: new Date().toISOString(), publishedAt: null, origin: "mock" });
  return { internalLink, externalSource, finding, publication };
}
