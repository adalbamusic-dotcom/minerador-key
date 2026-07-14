import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  ArticleDNASchema,
  ContentPlanSchema,
  ContentDocumentSchema,
  OriginalityReportSchema,
  SerpArchitectureImpactSchema,
  SerpSnapshotSchema,
  SiloDNASchema,
  StrategicReviewSchema,
  KeywordArticleReviewSchema,
  ProductEvidenceDNASchema,
} from "../lib/arquiteto/contracts.ts";
import { buildProvisionalGroups, describeAssignedGroups, suggestPrincipal } from "../lib/arquiteto/engine.ts";
import { applyKeywordArticleReview, buildKeywordArticleCatalog, buildKeywordReviewBatches, buildLogicalKeywordRecommendations, buildRelevantArticleCatalog } from "../lib/arquiteto/keyword-article-review.ts";
import { detectArchitectureConflicts } from "../lib/arquiteto/conflicts.ts";
import { contentDocumentToTiptapSeed } from "../lib/arquiteto/document.ts";
import { buildOriginalityReport } from "../lib/arquiteto/originality.ts";
import { parseStructuredOutput, StructuredOutputError } from "../lib/arquiteto/structured-output.ts";
import { ProviderRequestError, requestProviderContent } from "../lib/arquiteto/provider-client.ts";
import { guardPublishedArticleProposal } from "../lib/arquiteto/published-guard.ts";
import { deterministicArticleDnaPayload, legacyKeywordDnaEnvelope, legacyKeywordDnaReference } from "../lib/arquiteto/adapters.ts";
import { proposeKeywordDnaRevision } from "../lib/arquiteto/revisions.ts";
import { approveSuccessor, canonicalJson, contentHash, createStatusEvent, createVersionEnvelope, hydrateExactVersionGraph, hydrateVersionGraph, InMemoryVersionRepository, toVersionReference, VersioningError } from "../lib/arquiteto/versioning.ts";
import { deriveLogicalKeywordDna, mergeLogicalKeywordSemantic } from "../lib/arquiteto/keyword-dna-engine.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "../lib/arquiteto/domain-rules.ts";
import { CompactProviderResponseSchema } from "../lib/arquiteto/keyword-review-provider.ts";
import { normalizeArticleDnaProviderPayload } from "../lib/arquiteto/article-dna-provider.ts";

const ref = (entityId: string) => ({ entityId, versionId: `legacy:${entityId}:v1`, contentHash: `legacy:${entityId}` });

const kw = (id: string, keyword: string, overrides = {}) => ({
  id,
  keyword,
  intent: "Informativo",
  volume_search: 100,
  kgr_score: 0.2,
  lista_id: "silo-1",
  siloName: "SEO para clinicas",
  status: "aprovado",
  analise_semantica: { entidade_central: "clinica" },
  ...overrides,
});

test("aprovação lógica cria ArticleDNA-base sem depender de IA", () => {
  const group = buildProvisionalGroups([
    kw("kw-1", "seo para clinicas", { analise_semantica: { entidade_central: "SEO", publico: "Gestores de clínicas", problema_percebido: "Baixa visibilidade" } }),
    kw("kw-2", "seo para clinicas de estetica", { analise_semantica: { entidade_central: "SEO", publico: "Gestores de clínicas" } }),
  ])[0];
  const payload = deterministicArticleDnaPayload(group, "brand-1");
  assert.equal(ArticleDNASchema.safeParse(payload).success, true);
  assert.equal(payload.keywordReferences.length, 2);
  assert.match(payload.alerts.join(" "), /lógica determinística/);
});

test("processo lógico prioriza artigo publicado como âncora", () => {
  const groups = buildProvisionalGroups([
    kw("pub-1", "seo para clinicas", { status: "publicado", isPublished: true, slug_sugerido: "seo-para-clinicas" }),
    kw("new-1", "seo para clinicas de estetica"),
  ]);
  const anchored = groups.find(group => group.publishedAnchorId === "pub-1");
  assert.ok(anchored);
  assert.deepEqual(new Set(anchored.keywordIds), new Set(["pub-1", "new-1"]));
  assert.equal(anchored.principalSuggestion.keywordId, "pub-1");
});

test("revisão de keywords usa lotes compactos e catálogo com publicados primeiro", () => {
  const groups = buildProvisionalGroups([
    kw("pub-1", "seo para clinicas", { status: "publicado", isPublished: true }),
    kw("new-1", "seo para clinicas de estetica"),
    kw("new-2", "marketing para dentistas", { lista_id: "silo-2", siloName: "Marketing" }),
  ]);
  const batches = buildKeywordReviewBatches(groups, 1, 1);
  assert.ok(batches.length >= 2);
  assert.ok(batches.every(batch => batch.length === 1 && batch[0].keywords.length === 1));
  const catalog = buildKeywordArticleCatalog(groups);
  assert.equal(catalog[0].isPublished, true);
  assert.ok(catalog[0].keywordTerms.length > 0);
});

test("pré-análise lógica reduz candidatos antes de chamar a IA", () => {
  const groups = buildProvisionalGroups([
    kw("pub-1", "seo para clinicas", { status: "publicado", isPublished: true }),
    kw("new-1", "seo para clinicas esteticas"),
    ...Array.from({ length: 18 }, (_, index) => kw(`other-${index}`, `tema distante ${index}`, { lista_id: `silo-${index + 2}`, siloName: `Silo ${index + 2}` })),
  ]);
  const focus = buildKeywordReviewBatches(groups.filter(group => group.keywordIds.includes("new-1")))[0];
  const relevant = buildRelevantArticleCatalog(groups, focus);
  const logical = buildLogicalKeywordRecommendations(groups, focus);
  assert.ok(relevant.length <= 12);
  assert.ok(relevant.some(article => article.isPublished));
  assert.equal(logical.length, focus.flatMap(group => group.keywords).length);
  assert.ok(logical.every(item => item.reason && item.currentFit >= 0 && item.currentFit <= 1));
});

test("revisão da IA move somente keyword nova e preserva a âncora publicada", () => {
  const current = [
    { ...kw("pub-1", "seo para clinicas", { status: "publicado", isPublished: true }), clusterId: 1, provisionalGroupId: "group-pub", siloId: "silo-1", computedSlug: "seo-para-clinicas" },
    { ...kw("new-1", "seo para clinicas de estetica"), clusterId: 2, provisionalGroupId: "group-new", siloId: "silo-1", computedSlug: "seo-clinicas-estetica" },
    { ...kw("new-2", "estrategia seo clinicas"), clusterId: 3, provisionalGroupId: "group-new-2", siloId: "silo-1", computedSlug: "estrategia-seo-clinicas" },
  ];
  const review = KeywordArticleReviewSchema.parse({
    decisions: [
      { keywordId: "new-1", sourceGroupId: "group-new", action: "reforcar_publicado", targetGroupId: "group-pub", newArticleKey: null,
        siloPlacement: { action: "manter_silo", siloId: null, siloName: null, newSiloKey: null },
        suggestedRole: "reforco_narrativo", justification: "A busca amplia o artigo publicado sem justificar outra URL.", confidence: 0.9, humanDecisionPoints: [] },
      { keywordId: "new-2", sourceGroupId: "group-new-2", action: "mover_para_artigo", targetGroupId: "group-pub", newArticleKey: null,
        siloPlacement: { action: "manter_silo", siloId: null, siloName: null, newSiloKey: null },
        suggestedRole: "secundaria", justification: "A keyword participa da cobertura principal.", confidence: 0.8, humanDecisionPoints: [] },
    ],
    conflicts: [],
    summary: "Fortalecer o publicado.",
  });
  const next = applyKeywordArticleReview(current, review, "2026-07-14T12:00:00.000Z");
  assert.equal(next.find(item => item.id === "pub-1")?.provisionalGroupId, "group-pub");
  assert.equal(next.find(item => item.id === "new-1")?.provisionalGroupId, "group-pub");
  assert.equal(next.find(item => item.id === "new-1")?.reviewRole, "reforco_narrativo");
  assert.equal(next.find(item => item.id === "new-2")?.reviewRole, "secundaria");
  assert.equal(next.find(item => item.id === "new-1")?.aiReviewAnnotation?.reviewState, "pending_fine_review");
  assert.equal(next.find(item => item.id === "new-1")?.aiReviewAnnotation?.appliedLocally, true);
  assert.equal(next.find(item => item.id === "pub-1")?.aiReviewAnnotation, undefined);
  assert.equal(describeAssignedGroups(next)[0].principalSuggestion.keywordId, "pub-1");
});

test("repartição de keywords pode propor novo artigo e novo silo sem persistir", () => {
  const current = [{ ...kw("new-3", "marketing odontologico para implantes"), clusterId: 4, provisionalGroupId: "group-source", siloId: "silo-1" }];
  const review = KeywordArticleReviewSchema.parse({
    decisions: [{ keywordId: "new-3", sourceGroupId: "group-source", action: "criar_novo_artigo", targetGroupId: null, newArticleKey: "implantes",
      siloPlacement: { action: "propor_novo_silo", siloId: null, siloName: "Marketing para Implantes", newSiloKey: "marketing-implantes" },
      suggestedRole: "principal", justification: "A intenção exige fronteira própria.", confidence: 0.78, humanDecisionPoints: ["Confirmar novo silo"] }],
    conflicts: [], summary: "Proposta local de nova repartição.",
  });
  const next = applyKeywordArticleReview(current, review, "2026-07-14T12:00:00.000Z");
  assert.equal(next[0].provisionalGroupId, "ai-group-group-source-implantes");
  assert.equal(next[0].siloId, "tmp-ai-silo-marketing-implantes");
  assert.equal(next[0].siloName, "Marketing para Implantes");
  assert.deepEqual(next[0].aiReviewAnnotation?.details, ["Confirmar novo silo"]);
});

test("primeiro processo lógico preenche o KeywordDNA completo sem IA", () => {
  const result = deriveLogicalKeywordDna({
    keywordId: "kw-logical",
    keyword: "melhor clínica de estética perto de mim",
    niche: "Estética",
    location: "Brasil",
  });
  assert.equal(result.dna.stampOrigin, "system");
  assert.equal(result.dna.searchIntent, "local");
  assert.equal(result.dna.humanConfirmed, false);
  for (const field of [
    "intencao_principal", "intencao_secundaria", "tipo_editorial", "entidade_central", "modificadores",
    "publico", "problema_percebido", "resultado_desejado", "job_to_be_done", "nivel_consciencia",
    "etapa_jornada", "potencial_comercial", "urgencia_tempo", "intencao_local", "formato_esperado",
    "objecao_implicita", "emocao_dominante", "risco_canibalizacao", "dna_confianca", "evidencias_logicas",
  ]) assert.ok(result.semantic[field], `campo lógico ausente: ${field}`);
});

test("KeywordDNA lógico é determinístico para a mesma entrada", () => {
  const input = { keywordId: "kw-1", keyword: "como captar pacientes para clínica", niche: "Estética" };
  assert.deepEqual(deriveLogicalKeywordDna(input), deriveLogicalKeywordDna(input));
});

test("atualização lógica preserva classificação humana e renova somente seus próprios campos", () => {
  const first = deriveLogicalKeywordDna({ keywordId: "kw-1", keyword: "seo para clínicas" });
  const mixed = mergeLogicalKeywordSemantic({ publico: "Gestoras de clínicas", dna_revisao_humana: "aprovado" }, first.semantic);
  assert.equal(mixed.publico, "Gestoras de clínicas");
  assert.equal(mixed.dna_revisao_humana, "aprovado");
  const second = deriveLogicalKeywordDna({ keywordId: "kw-1", keyword: "seo para clínicas", niche: "Marketing" });
  const refreshed = mergeLogicalKeywordSemantic(mixed, second.semantic);
  assert.equal(refreshed.publico, "Gestoras de clínicas");
  assert.equal(refreshed.dna_revisao_humana, "aprovado");
  assert.equal(refreshed.dna_modelo, second.semantic.dna_modelo);
});

test("Minerador executa DNA lógico ao carregar e oferece atualização manual sem chamar IA", async () => {
  const source = await readFile(new URL("../app/(workspace)/minerador/page.tsx", import.meta.url), "utf8");
  assert.match(source, /processLogicalKeywordDna\(eligibleKeywords, loadedLists/);
  assert.match(source, /onClick=\{handleRefreshLogicalDna\}/);
  assert.match(source, /"Detectar viés · KeywordDNA"/);
  assert.match(source, /onWorkflowStatusChange=\{\(status\) => handleUpdateStatus\(item\.id, status\)\}/);
  const panel = await readFile(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  assert.match(panel, /Status da keyword/);
  assert.match(panel, /option value="aprovado"/);
  const engine = await readFile(new URL("../lib/arquiteto/keyword-dna-engine.ts", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /fetch\(|DEEPSEEK|OPENROUTER|chat\/completions/i);
});

const articleDna = {
  schemaVersion: 1 as const,
  articleId: "article-1",
  brandId: "brand-1",
  principalKeywordId: "kw-1",
  secondaryKeywordIds: ["kw-2"],
  narrativeReinforcementIds: [],
  keywordReferences: [
    { keywordId: "kw-1", keywordDnaVersionId: "legacy:kw-1:v1", keywordDnaContentHash: "legacy:kw-1", role: "principal" as const, strategicContribution: "Tema central", coveredIntentions: ["informativa"], requiredTopics: [], excludedTopics: [], classificationOrigin: "legacy" as const, confidence: 0.8, humanConfirmed: true },
    { keywordId: "kw-2", keywordDnaVersionId: "legacy:kw-2:v1", keywordDnaContentHash: "legacy:kw-2", role: "secundaria" as const, strategicContribution: "Aprofundamento", coveredIntentions: ["informativa"], requiredTopics: [], excludedTopics: [], classificationOrigin: "legacy" as const, confidence: 0.7, humanConfirmed: false },
  ],
  siloId: "silo-1",
  hierarchy: "Pilar" as const,
  suggestedSlug: "seo-para-clinicas",
  canonical: null,
  mainIntent: "Aprender como captar pacientes com SEO",
  auxiliaryIntents: ["Comparar abordagens"],
  audience: "Gestores de clinicas",
  problem: "Dependencia de anuncios",
  desiredResult: "Captacao organica previsivel",
  journeyStage: "consideracao",
  brandObjective: "Gerar demanda propria",
  promise: "Construir uma base organica para a clinica",
  angle: "SEO como ativo da clinica",
  cta: "Avaliar a estrutura atual",
  coverage: ["fundamentos", "processo", "medicao"],
  excludedSubjects: ["gestao de anuncios"],
  antiCannibalizationBoundary: "Nao ensinar campanhas pagas",
  nearbyArticleIds: [],
  differentiation: ["Exemplos especificos de clinicas"],
  entities: ["SEO", "clinica"],
  requiredTopics: ["SEO tecnico", "conteudo", "SEO local"],
  questions: ["Quanto tempo leva?"],
  objections: ["SEO demora"],
  evidenceNeeded: ["Caso real"],
  sourcesNeeded: ["Google Search Central"],
  internalLinks: [],
  alerts: [],
  confidence: 0.82,
  humanPendingDecisions: ["Validar pela SERP"],
};

const siloDna = {
  schemaVersion: 1 as const,
  siloId: "silo-1",
  centralEntity: "SEO para clinicas",
  objective: "Construir autoridade organica",
  audience: "Gestores de clinicas",
  macroProblem: "Baixa previsibilidade de captacao",
  dominantIntent: "Informativo-comercial",
  pillarArticleId: "article-1",
  supportArticleIds: ["article-2"],
  articleReferences: [
    { articleId: "article-1", articleDnaVersionId: "article-v1", articleDnaContentHash: "legacy:article-1", role: "Pilar" as const },
    { articleId: "article-2", articleDnaVersionId: "article-v2", articleDnaContentHash: "legacy:article-2", role: "Suporte" as const },
  ],
  articleRoles: [{ articleId: "article-1", role: "Pilar", reason: "Tema central" }],
  narrativeOrder: ["article-1", "article-2"],
  linkMap: [{ fromArticleId: "article-2", toArticleId: "article-1", reason: "Aprofunda e retorna ao macro" }],
  boundary: "SEO organico para clinicas",
  includedTopics: ["SEO tecnico"],
  excludedTopics: ["midia paga"],
  nearbySiloIds: [],
  possibleConflicts: [],
  gaps: ["mensuracao"],
  nextContents: ["Google Business Profile"],
  confidence: 0.8,
  humanPendingDecisions: ["Confirmar ordem"],
};

test("agrupamento deterministico produz IDs estaveis", () => {
  const input = [kw("1", "seo para clinicas"), kw("2", "seo clinicas")];
  assert.deepEqual(buildProvisionalGroups(input).map(group => group.id), buildProvisionalGroups(input).map(group => group.id));
});

test("motor nao altera as keywords de entrada", () => {
  const input = [kw("1", "seo para clinicas"), kw("2", "seo clinicas")];
  const snapshot = structuredClone(input);
  buildProvisionalGroups(input);
  assert.deepEqual(input, snapshot);
});

test("artigo publicado permanece ancora e principal", () => {
  const groups = buildProvisionalGroups([
    kw("pub", "seo para clinicas", { status: "publicado", isPublished: true }),
    kw("new", "seo clinicas locais"),
  ]);
  const group = groups.find(item => item.publishedAnchorId === "pub");
  assert.equal(group?.principalSuggestion.keywordId, "pub");
  assert.equal(group?.roles.new, "reforco_narrativo");
});

test("intencoes incompatíveis nao sao agrupadas automaticamente", () => {
  const groups = buildProvisionalGroups([
    kw("info", "como funciona seo clinica", { intent: "Informativo" }),
    kw("buy", "comprar seo clinica", { intent: "Vendas" }),
  ]);
  assert.equal(groups.length, 2);
});

test("volume nao escolhe sozinho a keyword principal", () => {
  const suggestion = suggestPrincipal([
    kw("central", "seo para clinicas", { volume_search: 80 }),
    kw("specific", "como fazer seo para clinicas", { volume_search: 40 }),
    kw("volume", "marketing digital", { volume_search: 5000, analise_semantica: { entidade_central: "marketing" } }),
  ]);
  assert.notEqual(suggestion.keywordId, "volume");
  assert.ok(suggestion.breakdown.cobertura >= 0);
});

test("grupo amplo com tres keywords sugere Pilar", () => {
  const groups = buildProvisionalGroups([
    kw("1", "seo para clinicas"),
    kw("2", "seo clinicas"),
    kw("3", "seo de clinicas"),
  ]);
  assert.equal(groups[0].suggestedHierarchy, "Pilar");
});

test("motor detecta keywords quase identicas", () => {
  const groups = buildProvisionalGroups([kw("1", "seo para clinicas"), kw("2", "seo para clinicas")]);
  assert.ok(detectArchitectureConflicts(groups).some(conflict => conflict.type === "keyword_quase_identica"));
});

test("ArticleDNA completo passa e incompleto falha", () => {
  assert.equal(ArticleDNASchema.safeParse(articleDna).success, true);
  assert.equal(ArticleDNASchema.safeParse({ ...articleDna, promise: "" }).success, false);
});

test("adaptador ArticleDNA aceita envelope articleDna e nomes em português", () => {
  const result = normalizeArticleDnaProviderPayload({ articleDna: {
    schemaVersion: "1",
    intencao_principal: "Informativa",
    intencoes_auxiliares: "Comercial; local",
    publico: "Gestores de clínicas",
    problema: "Baixa captação",
    resultado_desejado: "Demanda orgânica",
    promessa: "Explicar o caminho",
    angulo: "Ativo próprio",
    cobertura: ["Fundamentos", "Aplicação"],
    confianca: "86%",
  } });
  assert.equal(result.payload.mainIntent, "Informativa");
  assert.deepEqual(result.payload.auxiliaryIntents, ["Comercial", "local"]);
  assert.equal(result.payload.confidence, 0.86);
  assert.match(result.warnings.join(" "), /articleDna/);
});

test("adaptador ArticleDNA ignora identidade e organização propostas pela IA", () => {
  const result = normalizeArticleDnaProviderPayload({ articleDna: {
    articleId: "artigo-inventado",
    brandId: "marca-inventada",
    principalKeywordId: "keyword-inventada",
    siloId: "silo-inventado",
    hierarchy: "Pilar",
    keywordReferences: [{ keywordId: "inventada" }],
    mainIntent: "Informativa",
  } });
  assert.equal(result.payload.mainIntent, "Informativa");
  for (const key of ["articleId", "brandId", "principalKeywordId", "siloId", "hierarchy", "keywordReferences"]) {
    assert.equal(key in result.payload, false);
  }
});

test("SiloDNA completo passa e sem fronteira falha", () => {
  assert.equal(SiloDNASchema.safeParse(siloDna).success, true);
  assert.equal(SiloDNASchema.safeParse({ ...siloDna, boundary: "" }).success, false);
});

test("SerpSnapshot valida evidencias sem executar scraping", () => {
  assert.equal(SerpSnapshotSchema.safeParse({
    schemaVersion: 1,
    keyword: "seo para clinicas",
    location: "Brasil",
    capturedAt: new Date().toISOString(),
    results: [{ position: 1, title: "Guia", url: "https://example.com/guia", pageType: "artigo", format: "guia", entities: ["SEO"] }],
    dominantIntent: "Informativo",
    formats: ["guia"], entities: ["SEO"], questions: [], patterns: [], gaps: [], opportunities: [],
  }).success, true);
});

test("impacto SERP sempre exige decisao humana", () => {
  assert.equal(SerpArchitectureImpactSchema.safeParse({
    action: "trocar_principal", groupIds: ["g1"], keywordIds: ["k2"], reason: "SERP mais abrangente", confidence: 0.8, humanDecisionRequired: true,
  }).success, true);
});

test("relatorio de originalidade nasce aguardando SERP externa", () => {
  const report = buildOriginalityReport(articleDna, []);
  assert.equal(OriginalityReportSchema.safeParse(report).success, true);
  assert.equal(report.externalSimilarity.status, "aguardando_serp");
});

test("ContentDocument converte blocos para semente Tiptap", () => {
  const document = {
    schemaVersion: 1 as const, id: "doc-1", title: "SEO", status: "planejado" as const,
    contentPlanRef: ref("plan-1"), brandDnaRef: ref("brand-1"), keywordDnaRefs: [ref("kw-1")],
    siloDnaRef: ref("silo-1"), articleDnaRef: ref("article-1"),
    serpSnapshotRefs: [], evidenceRefs: [], sourceIds: [], linkMap: [], instructions: [],
    blocks: [
      { id: "h1", type: "heading" as const, level: 1, text: "SEO para clinicas", provenance: { keywordDnaRefs: [ref("kw-1")], evidenceRefs: [], sourceIds: [] } },
      { id: "p1", type: "paragraph" as const, text: "Introducao", provenance: { keywordDnaRefs: [ref("kw-1")], evidenceRefs: [], sourceIds: [] } },
      { id: "img1", type: "image_brief" as const, objective: "Comparar Pilar e Suporte", format: "diagrama", requiredElements: ["nucleo"], avoid: ["texto excessivo"], provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } },
    ],
  };
  assert.equal(ContentDocumentSchema.safeParse(document).success, true);
  const tiptap = contentDocumentToTiptapSeed(document);
  assert.equal(tiptap.type, "doc");
  assert.equal(tiptap.content?.length, 3);
});

test("JSON invalido ou fora do contrato e rejeitado", () => {
  assert.throws(() => parseStructuredOutput("nao-json", StrategicReviewSchema), StructuredOutputError);
  assert.throws(() => parseStructuredOutput("{}", StrategicReviewSchema), StructuredOutputError);
});

test("erro do provedor e propagado sem aceitar resposta parcial", async () => {
  const fakeFetch = async () => new Response("quota excedida", { status: 429 });
  await assert.rejects(
    () => requestProviderContent({
      apiUrl: "https://provider.invalid", apiKey: "test", model: "test", system: "system", user: "user", fetchImpl: fakeFetch as typeof fetch,
    }),
    error => error instanceof ProviderRequestError && /429/.test(error.message),
  );
});

test("servicos estrategicos nao possuem escrita Supabase", async () => {
  const files = [
    "app/api/revalidate-structure/route.ts",
    "app/api/arquiteto/article-dna/route.ts",
    "app/api/arquiteto/silo-dna/route.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/);
  }
});

const keywordDna = {
  schemaVersion: 1 as const, keywordId: "kw-1", searchIntent: "informational" as const, likelyEditorialType: "guide" as const,
  centralEntity: "SEO", modifiers: ["clinicas"], audience: "Gestores", perceivedProblem: "Pouca demanda", desiredResult: "Captacao organica",
  awarenessLevel: "consciente do problema", journeyStage: "consideracao", objections: ["demora"], dominantEmotion: "inseguranca",
  commercialPotential: "high" as const, affiliatePotential: "none" as const, reviewCandidate: false, productResearchRequired: false,
  stampOrigin: "human" as const, confidence: 0.9, humanConfirmed: true,
};

test("JSON semanticamente igual produz hash canonico igual", async () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(await contentHash({ b: 2, a: 1 }), await contentHash({ a: 1, b: 2 }));
});

test("versoes sao imutaveis e alteracao cria sucessora ligada", async () => {
  const first = await createVersionEnvelope({ entityId: "kw-1", versionNumber: 1, origin: "human", changeReason: "Inicial", createdBy: "u1", payload: keywordDna });
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.payload), true);
  assert.throws(() => Object.assign(first.payload, { audience: "Alterado" }), TypeError);
  const second = await createVersionEnvelope({ entityId: "kw-1", versionNumber: 2, previousVersionId: first.versionId, origin: "human", changeReason: "Novo publico", createdBy: "u1", payload: { ...keywordDna, audience: "Proprietarios" } });
  assert.equal(second.previousVersionId, first.versionId);
  assert.notEqual(second.contentHash, first.contentHash);
});

test("proposta, rejeicao e aprovacao preservam a versao aprovada vigente", async () => {
  const repository = new InMemoryVersionRepository();
  const first = await createVersionEnvelope({ entityId: "kw-1", versionNumber: 1, origin: "human", changeReason: "Inicial", createdBy: "u1", payload: keywordDna });
  repository.addVersion(first);
  repository.appendStatusEvent(createStatusEvent(first.versionId, "proposed", "u1", "Revisar"));
  repository.appendStatusEvent(createStatusEvent(first.versionId, "approved", "u1", "Aprovado"));
  const rejected = await createVersionEnvelope({ entityId: "kw-1", versionNumber: 2, previousVersionId: first.versionId, origin: "ai", changeReason: "Teste", createdBy: "ai", payload: { ...keywordDna, audience: "Outro" } });
  repository.addVersion(rejected);
  repository.appendStatusEvent(createStatusEvent(rejected.versionId, "proposed", "ai", "Proposta"));
  assert.equal(repository.approvedForEntity("kw-1")[0]?.versionId, first.versionId);
  repository.appendStatusEvent(createStatusEvent(rejected.versionId, "rejected", "u1", "Rejeitada"));
  assert.equal(repository.approvedForEntity("kw-1")[0]?.versionId, first.versionId);
  const successor = await createVersionEnvelope({ entityId: "kw-1", versionNumber: 3, previousVersionId: rejected.versionId, origin: "human", changeReason: "Correcao", createdBy: "u1", payload: { ...keywordDna, audience: "Diretores" } });
  repository.addVersion(successor);
  repository.appendStatusEvent(createStatusEvent(successor.versionId, "proposed", "u1", "Proposta"));
  approveSuccessor(repository, toVersionReference(successor), toVersionReference(first), "u1", "Aprovada");
  assert.equal(repository.effectiveStatus(first.versionId), "superseded");
  assert.equal(repository.effectiveStatus(successor.versionId), "approved");
});

test("ArticleDNA e SiloDNA exigem referencias exatas", () => {
  assert.equal(ArticleDNASchema.safeParse({ ...articleDna, keywordReferences: articleDna.keywordReferences.slice(0, 1) }).success, false);
  assert.equal(SiloDNASchema.safeParse({ ...siloDna, articleReferences: siloDna.articleReferences.slice(0, 1) }).success, false);
});

test("ContentPlan registra todas as versoes e ContentDocument mantem proveniencia compacta", () => {
  const plan = { schemaVersion: 1, planId: "plan-1", brandDnaRef: ref("brand-1"), keywordDnaRefs: [ref("kw-1"), ref("kw-2")],
    articleDnaRef: ref("article-1"), siloDnaRef: ref("silo-1"), serpEvidenceRefs: [{ artifactId: "serp-1", artifactType: "serp_snapshot", contentHash: "legacy:serp" }],
    productEvidenceRefs: [], originalityReportRef: null, approvedOutline: [{ id: "s1", heading: "Introducao", objective: "Contextualizar", keywordDnaRefs: [ref("kw-1")] }],
    writingInstructions: [], humanPendingDecisions: [] };
  assert.equal(ContentPlanSchema.safeParse(plan).success, true);
  assert.doesNotMatch(JSON.stringify(plan), /perceivedProblem|desiredResult/);
});

test("hidratacao detecta referencia ausente, hash divergente, desatualizada e ciclo", async () => {
  const repository = new InMemoryVersionRepository();
  const first = await createVersionEnvelope({ entityId: "a", versionNumber: 1, origin: "human", changeReason: "Inicial", createdBy: "u", payload: { dependencies: [] } });
  repository.addVersion(first);
  repository.appendStatusEvent(createStatusEvent(first.versionId, "proposed", "u", "Proposta"));
  repository.appendStatusEvent(createStatusEvent(first.versionId, "approved", "u", "Aprovado"));
  assert.throws(() => repository.resolve({ entityId: "a", versionId: "missing", contentHash: first.contentHash }), (error: unknown) => error instanceof VersioningError && error.code === "missing_reference");
  assert.throws(() => repository.resolve({ ...toVersionReference(first), contentHash: "legacy:wrong" }), (error: unknown) => error instanceof VersioningError && error.code === "hash_mismatch");
  const second = await createVersionEnvelope({ entityId: "a", versionNumber: 2, previousVersionId: first.versionId, origin: "human", changeReason: "Nova", createdBy: "u", payload: { dependencies: [] } });
  repository.addVersion(second); repository.appendStatusEvent(createStatusEvent(second.versionId, "proposed", "u", "Proposta"));
  approveSuccessor(repository, toVersionReference(second), toVersionReference(first), "u", "Aprovado");
  assert.equal(repository.isStale(toVersionReference(first)), true);
  assert.throws(() => hydrateVersionGraph(toVersionReference(second), repository, () => [toVersionReference(second)]), (error: unknown) => error instanceof VersioningError && error.code === "reference_cycle");
});

test("hidratacao exata recalcula hash e detecta conteudo adulterado", async () => {
  const original = await createVersionEnvelope({ entityId: "tampered", versionNumber: 1, origin: "human", changeReason: "Inicial", createdBy: "u", payload: { value: "original" } });
  const repository = new InMemoryVersionRepository();
  repository.addVersion({ ...original, payload: { value: "alterado" } });
  await assert.rejects(() => hydrateExactVersionGraph(toVersionReference(original), repository, () => []),
    (error: unknown) => error instanceof VersioningError && error.code === "tampered_payload");
});

test("SERP cria proposta rastreavel e nunca altera classificacao humana", async () => {
  const current = await createVersionEnvelope({ entityId: "kw-1", versionNumber: 1, origin: "human", changeReason: "Humana", createdBy: "u", payload: keywordDna });
  const result = await proposeKeywordDnaRevision({ current, changes: { searchIntent: "commercial_investigation" }, evidenceRefs: [{ artifactId: "serp-1", artifactType: "serp_snapshot", contentHash: "legacy:serp" }], actorId: "serp", reason: "SERP divergente" });
  assert.equal(current.payload.searchIntent, "informational");
  assert.equal(result.version.previousVersionId, current.versionId);
  assert.equal(result.event.status, "proposed");
  assert.equal(result.conflict.humanDecisionRequired, true);
});

test("mudanca estrutural de publicado vira alerta e nao operacao", () => {
  const guarded = guardPublishedArticleProposal({ articleId: "article-1", isPublished: true, brandId: "brand-1", siloId: "silo-1", principalKeywordId: "kw-1", slug: "slug-publicado", canonical: "https://example.com/slug-publicado" },
    { ...articleDna, brandId: "brand-2", siloId: "silo-2", principalKeywordId: "kw-2", secondaryKeywordIds: ["kw-1"],
      keywordReferences: articleDna.keywordReferences.map(reference => ({ ...reference, role: reference.keywordId === "kw-2" ? "principal" as const : "secundaria" as const })),
      suggestedSlug: "novo", canonical: "https://example.com/novo" });
  assert.equal(guarded.alerts.every(alert => alert.type === "published_immutable_field"), true);
  assert.equal(guarded.proposal.suggestedSlug, "slug-publicado");
  assert.equal(guarded.proposal.principalKeywordId, "kw-1");
});

test("ProductEvidenceDNA exige fonte e confianca validas", () => {
  const evidence = { schemaVersion: 1, evidenceId: "p1", product: { name: "Produto", brand: "Marca", model: null, category: "Categoria", marketplace: "Loja", sourceUrl: "https://example.com/p", collectedAt: new Date().toISOString() },
    rating: { average: 4.5, reviewCount: 10, distribution: { "5": 8 } }, recurringPraise: [], recurringComplaints: [], objections: [], expectations: [], usageContexts: [], buyerProfile: "Compradores", perceivedBenefits: [], perceivedLimitations: [],
    sources: [{ sourceId: "s1", url: "https://example.com/p", evidenceType: "consumer_opinion" }], confidence: 0.8, verificationPending: [] };
  assert.equal(ProductEvidenceDNASchema.safeParse(evidence).success, true);
  assert.equal(ProductEvidenceDNASchema.safeParse({ ...evidence, sources: [] }).success, false);
  assert.equal(ProductEvidenceDNASchema.safeParse({ ...evidence, confidence: 2 }).success, false);
});

test("proveniencia compacta rejeita DNA integral duplicado", () => {
  assert.equal(ContentPlanSchema.safeParse({ schemaVersion: 1, planId: "p", brandDnaRef: { ...ref("brand"), payload: { positioning: "duplicado" } },
    keywordDnaRefs: [ref("kw")], articleDnaRef: ref("article"), siloDnaRef: ref("silo"), serpEvidenceRefs: [], productEvidenceRefs: [],
    originalityReportRef: null, approvedOutline: [{ id: "s", heading: "H", objective: "O", keywordDnaRefs: [ref("kw")] }], writingInstructions: [], humanPendingDecisions: [] }).success, false);
});

test("adaptador legado cria referencia explicita sem fingir persistencia", () => {
  const keyword = kw("legacy-1", "seo legado");
  const reference = legacyKeywordDnaReference(keyword);
  const envelope = legacyKeywordDnaEnvelope(keyword);
  assert.match(reference.versionId, /^legacy:/);
  assert.equal(envelope.origin, "legacy");
  assert.equal(envelope.versionId, reference.versionId);
});

test("processo logico limita cada artigo a seis keywords e abre suportes no silo publicado", () => {
  const groups = buildProvisionalGroups([
    kw("pub-limit", "plano de marketing para clinica estetica", {
      status: "publicado", isPublished: true, lista_id: "silo-publicado", siloName: "Crescimento de clinicas",
    }),
    ...Array.from({ length: 17 }, (_, index) => kw(`limit-${index + 1}`, `plano marketing clinica estetica estrategia ${index + 1}`, {
      lista_id: null, siloName: null,
    })),
  ]);
  const publishedGroup = groups.find(group => group.publishedAnchorId === "pub-limit");
  const overflow = groups.filter(group => group.id !== publishedGroup?.id);

  assert.ok(groups.length >= 3);
  assert.ok(groups.every(group => group.keywordIds.length <= MAX_KEYWORDS_PER_ARTICLE));
  assert.equal(publishedGroup?.principalSuggestion.keywordId, "pub-limit");
  assert.equal(publishedGroup?.keywordIds.length, MAX_KEYWORDS_PER_ARTICLE);
  assert.ok(overflow.every(group => group.suggestedSiloId === "silo-publicado"));
  assert.ok(overflow.every(group => group.suggestedHierarchy === "Suporte"));
  assert.ok(overflow.some(group => group.alerts.some(alert => /limite de 6 keywords/.test(alert))));
});

test("revisao da IA nao consegue concentrar mais de seis keywords em um artigo", () => {
  const current = [
    { ...kw("pub-cap", "seo para clinicas", { status: "publicado", isPublished: true }), clusterId: 1, provisionalGroupId: "group-cap", siloId: "silo-1" },
    ...Array.from({ length: 7 }, (_, index) => ({
      ...kw(`ai-cap-${index + 1}`, `seo para clinicas estrategia ${index + 1}`),
      clusterId: index + 2,
      provisionalGroupId: `source-cap-${index + 1}`,
      siloId: "silo-1",
    })),
  ];
  const review = KeywordArticleReviewSchema.parse({
    decisions: current.slice(1).map(keyword => ({
      keywordId: keyword.id,
      sourceGroupId: keyword.provisionalGroupId,
      action: "mover_para_artigo",
      targetGroupId: "group-cap",
      newArticleKey: null,
      siloPlacement: { action: "manter_silo", siloId: null, siloName: null, newSiloKey: null },
      suggestedRole: "secundaria",
      justification: "A IA sugeriu concentrar a cobertura.",
      confidence: 0.8,
      humanDecisionPoints: [],
    })),
    conflicts: [],
    summary: "Tentativa de concentracao.",
  });
  const nextGroups = describeAssignedGroups(applyKeywordArticleReview(current, review));
  const anchored = nextGroups.find(group => group.publishedAnchorId === "pub-cap");

  assert.ok(nextGroups.every(group => group.keywordIds.length <= MAX_KEYWORDS_PER_ARTICLE));
  assert.equal(anchored?.principalSuggestion.keywordId, "pub-cap");
  assert.ok(nextGroups.some(group => !group.publishedAnchorId && group.suggestedSiloId === "silo-1"));
});

test("adaptador da revisao aceita variacoes cosmeticas sem afrouxar decisoes", () => {
  const result = CompactProviderResponseSchema.parse({
    data: {
      decisoes: [{
        keyword_id: "kw-1",
        source_group_id: "group-1",
        action: "manter_no_artigo",
        target_group_id: null,
        new_article_key: null,
        suggested_role: "principal",
        silo_placement: { action: "manter_silo", siloName: null },
        justificativa: "A keyword representa o artigo atual.",
        confianca: "0.91",
        humanDecisionPoints: ["Confirmar manualmente"],
        campo_extra: "ignorado",
      }],
      conflitos: [],
      resumo: "Distribuicao validada.",
    },
  });

  assert.equal(result.decisions[0].keywordId, "kw-1");
  assert.equal(result.decisions[0].confidence, 0.91);
  assert.equal(result.decisions[0].siloPlacement, undefined);
  assert.equal(result.decisions[0].humanDecision, "Confirmar manualmente");
});

test("adaptador da revisao transforma acao desconhecida em manutencao segura e anotada", () => {
  const base = {
    decisions: [{ keywordId: "kw-1", sourceGroupId: "group-1", action: "apagar_artigo", suggestedRole: "principal", justification: "Invalido", confidence: 0.8 }],
    conflicts: [],
    summary: "Resposta invalida.",
  };
  const result = CompactProviderResponseSchema.parse(base);
  assert.equal(result.decisions[0].action, "manter_no_artigo");
  assert.match(result.decisions[0].providerWarning || "", /nao reconhecida.*mantida por seguranca/);
});

test("adaptador reconhece sinonimos seguros usados pela IA", () => {
  const result = CompactProviderResponseSchema.parse({
    decisions: [
      { keywordId: "kw-1", action: "mover para outro artigo" },
      { keywordId: "kw-2", action: "fortalecer publicado" },
      { keywordId: "kw-3", action: "separar em novo artigo" },
    ],
    conflicts: [],
    summary: "Revisao concluida.",
  });
  assert.deepEqual(result.decisions.map(decision => decision.action), ["mover_para_artigo", "reforcar_publicado", "criar_novo_artigo"]);
});

test("adaptador recupera mapa de decisoes, aliases e confianca percentual", () => {
  const result = CompactProviderResponseSchema.parse({
    recommendations: {
      "kw-map": {
        decision: "manter_silo",
        role: "secondary",
        reason: "Permanece semanticamente aderente.",
        score: "87%",
        targetGroupId: "",
      },
    },
    summary: "Resposta compacta.",
  });
  assert.equal(result.decisions[0].keywordId, "kw-map");
  assert.equal(result.decisions[0].action, "manter_no_artigo");
  assert.equal(result.decisions[0].suggestedRole, "secundaria");
  assert.equal(result.decisions[0].confidence, 0.87);
  assert.equal(result.decisions[0].targetGroupId, null);
});
