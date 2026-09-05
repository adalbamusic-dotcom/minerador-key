import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { articleKeywordReference, deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { ArticleDNASchema, ProvisionalArticleGroupSchema } from "../lib/arquiteto/contracts.ts";
import { adaptKeywordIdentityContext, resolveArticleSerpIdentityContext } from "../lib/arquiteto/identity-context.ts";
import { explicitEditorialFormat, intentCompatibility, normalizeSearchIntent } from "../lib/arquiteto/intent-profile.ts";
import { applySerpRecommendationToWorkCopy, assessedKeywordDnaIds, buildSerpFormationAssessment, buildSerpFormationEvidence, buildSiloCandidateSerpEvidence, decideSerpRecommendation, findSerpRecommendationForKeyword, isPublishedStructuralRecommendation, latestActiveSerpFormationAssessment, markSerpAssessmentOutdated, normalizeArchitectSerpSnapshot, preserveSiloCandidateEvidenceOnFailure, resolvePublishedIdentity, resolveSerpValidationProfile, SerpFormationAssessmentSchema, SerpFormationRecoverySchema, SerpKeywordRecommendationSchema, supersedeRecommendations, unassociatedSerpRecommendations } from "../lib/arquiteto/serp-formation.ts";
import { collectSerperSnapshot } from "../lib/radar/serper-provider-core.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { importArticlesToRadar } from "../lib/editorial/operational-flow.ts";
import { guardPublishedArticleProposal } from "../lib/arquiteto/published-guard.ts";
import { confirmArticleArchitecture } from "../lib/arquiteto/architecture-confirmation.ts";
import { EditorialSnapshotSchema } from "../lib/editorial/contracts.ts";
import { snapshotToArchitectKeywords } from "../lib/editorial/adapters.ts";
import { SerpResearchSnapshotSchema } from "../lib/radar/serp/contracts.ts";
import { buildArticleControlContext } from "../lib/arquiteto/strategic-context.ts";

const originalEnv = { ...process.env };
const keyword = (id: string, text: string, extras: Record<string, unknown> = {}) => ({ id, keyword: text, intent: "informational", volume_search: 100, kgr_score: 0.2, lista_id: "silo-1", silo_id: "silo-1", siloName: "Silo", status: "aprovado", isPublished: false, slug_sugerido: null, hierarquia: null, analise_semantica: { intencao_principal: "informational", entidade_central: text, dna_origem: "humano", dna_confianca: 0.9, campo_extra: "preservar" }, ...extras });
const group = ProvisionalArticleGroupSchema.parse({ id: "group-1", keywordIds: ["kw-1", "kw-2"], keywords: [keyword("kw-1", "captação de pacientes"), keyword("kw-2", "atrair pacientes")], publishedAnchorId: null, suggestedSiloId: "silo-1", suggestedSiloName: "Silo", evidence: { lexical: 0.9, intent: 0.9, entities: 0.9, silo: 1, combined: 0.9 }, confidence: 0.9, alerts: [], principalSuggestion: { keywordId: "kw-1", score: 0.9, breakdown: { cobertura: 0.9, intencao: 0.9, centralidadeSemantica: 0.9, aderenciaMarca: 0.9, potencialComercial: 0.5, volume: 0.8, dificuldade: 0.4, qualidadeSlug: 0.8, ancoraPublicada: 0, serp: null }, justificativa: ["principal"], pendencias: [] }, roles: { "kw-1": "principal", "kw-2": "secundaria" }, suggestedHierarchy: "Pilar" });

function configure() { process.env.SERP_PROVIDER = "serper"; process.env.SERPER_API_KEY = "fixture-only"; process.env.SERPER_API_BASE_URL = "https://google.serper.dev"; process.env.SERP_DEFAULT_COUNTRY = "br"; process.env.SERP_DEFAULT_LANGUAGE = "pt-br"; }
function restore() { for (const key of ["SERP_PROVIDER", "SERPER_API_KEY", "SERPER_API_BASE_URL", "SERP_DEFAULT_COUNTRY", "SERP_DEFAULT_LANGUAGE"]) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; } }
async function snapshots() {
  configure();
  return Promise.all(group.keywords.map((item, index) => collectSerperSnapshot({ brandId: "brand-1", articleId: "group-1", articleDnaVersionId: "work:group-1", keywordId: item.id, keywordDnaVersionId: `legacy:${item.id}:v1`, keyword: item.keyword, location: "Brasil", language: "pt-br", device: "desktop", expectedIntent: "informational", expectedFormat: "Pilar", requiredTopics: [item.keyword], articleEntities: [item.keyword], resultLimit: 10, version: 1, previousSnapshotId: null }, async () => new Response(JSON.stringify({ organic: [{ position: 1, title: item.keyword, link: `https://example.com/${index}`, snippet: "Guia informacional" }], peopleAlsoAsk: [], relatedSearches: [] }), { status: 200 }))));
}
test.afterEach(restore);

test("SERP produz evidência por IDs estáveis sem alterar grupo ou movimentar keywords", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const source = await snapshots();
  const overlapping = SerpResearchSnapshotSchema.parse({ ...source[1], organicResults: source[0]!.organicResults });
  const originalGroup = structuredClone(group);
  const evidence = buildSerpFormationEvidence({ principalKeywordId: "kw-1", keywordReferences: references, snapshots: [source[0]!, overlapping] });
  assert.deepEqual(group, originalGroup);
  assert.equal(evidence.keywordObservations.length, 2);
  assert.equal(evidence.overlaps[0]?.leftKeywordId, "kw-1");
  assert.equal(evidence.overlaps[0]?.rightKeywordId, "kw-2");
  assert.equal(evidence.overlaps[0]?.leftKeywordDnaVersionId, references[0]!.keywordDnaVersionId);
  assert.equal(evidence.keywordObservations.find(item => item.keywordId === "kw-1")?.likelyCannibalization, "likely");
  assert.equal(evidence.keywordObservations.find(item => item.keywordId === "kw-1")?.needsSeparation, false);
  assert.equal(evidence.guidelines.some(item => /não move|não.*grupo/i.test(item)), true);
});

test("ausência de SERP vira insuficiência e não conflito", async () => {
  const references = [articleKeywordReference(group.keywords[0]!, "principal", "brand-1")];
  const empty = SerpResearchSnapshotSchema.parse({ ...(await snapshots())[0]!, organicResults: [], diagnostic: { ...(await snapshots())[0]!.diagnostic, confidence: "insufficient", possibleConflicts: [], verdict: "informacao_insuficiente" } });
  const evidence = buildSerpFormationEvidence({ principalKeywordId: "kw-1", keywordReferences: references, snapshots: [empty] });
  const observation = evidence.keywordObservations[0]!;
  assert.equal(observation.insufficientEvidence, true);
  assert.equal(observation.conflict, false);
  assert.equal(observation.needsSeparation, null);
  assert.equal(observation.canJoin, null);
});

test("candidata a Silo recebe somente evidência e readback preserva assessment", async () => {
  const candidate = { ...group.keywords[0]!, id: "silo-candidate-1", keyword: "tratamento estético", siloCandidate: { status: "candidate" as const, origin: "deterministic" as const, score: 0.8, reasons: ["termo amplo"], signals: { volumeRank: 1, volumeHigh: true, resultsPresent: true, shortTerm: true, broadEntity: true, capacityPotential: true, kgrOpportunity: false, commercialSecondary: false, specificNeed: false, relatedKeywordCount: 2 } } };
  const candidateReference = articleKeywordReference(candidate, "reforco_narrativo", "brand-1");
  const candidateSnapshot = SerpResearchSnapshotSchema.parse({ ...(await snapshots())[0]!, id: "candidate-snapshot", articleId: "silo-candidate:silo-candidate-1", articleDnaVersionId: "work:silo-candidate:silo-candidate-1", keywordId: candidate.id, keywordDnaVersionId: candidateReference.keywordDnaVersionId, diagnostic: { ...(await snapshots())[0]!.diagnostic, pageTypes: ["category", "article"], secondaryIntents: ["commercial_investigation"], relatedSearches: ["tratamento facial"] } });
  const candidateEvidence = buildSiloCandidateSerpEvidence({ brandId: "brand-1", createdBy: "human-1", keywordDnaSnapshot: candidateReference.keywordDnaSnapshot!, snapshot: candidateSnapshot });
  assert.equal(candidateEvidence.evidence.categoryHubLike, true);
  assert.equal(candidateEvidence.evidence.evidenceStatus, "observed");
  assert.equal(candidateEvidence.snapshot?.articleId, "silo-candidate:silo-candidate-1");
  assert.equal(candidateEvidence.keywordDnaSnapshot.keywordId, candidate.id);
  const priorRecovery = SerpFormationRecoverySchema.parse({ schemaVersion: 1, brandId: "brand-1", updatedAt: new Date().toISOString(), assessments: [], siloCandidateEvidence: [candidateEvidence], verifications: [] });
  const readback = SerpFormationRecoverySchema.parse(JSON.parse(JSON.stringify(priorRecovery)));
  assert.equal(readback.siloCandidateEvidence[0]?.evidence.categoryHubLike, true);
  const failed = buildSiloCandidateSerpEvidence({ brandId: "brand-1", createdBy: "human-1", keywordDnaSnapshot: candidateReference.keywordDnaSnapshot!, snapshot: null });
  assert.equal(preserveSiloCandidateEvidenceOnFailure([candidateEvidence], [failed])[0]?.snapshot?.id, "candidate-snapshot");
  assert.equal(preserveSiloCandidateEvidenceOnFailure([], [failed])[0]?.evidence.evidenceStatus, "insufficient");
});

test("preserva KeywordDNA integral, roles e hash no assessment", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const result = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "group-1", articleDnaVersionId: "work:group-1", createdBy: "human-1", principalKeywordId: "kw-1", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: await snapshots() });
  const parsed = SerpFormationAssessmentSchema.parse(result);
  assert.equal(parsed.keywordDnaReferences.length, 2);
  assert.equal(parsed.keywordDnaReferences[0]?.sourceKeywordSnapshot.analise_semantica && typeof parsed.keywordDnaReferences[0].sourceKeywordSnapshot.analise_semantica, "object");
  assert.equal(parsed.recommendations.find(item => item.keywordId === "kw-1")?.currentRole, "principal");
  assert.match(parsed.contentHash, /^sha256:[a-f0-9]{64}$/);
});

test("o gate da IA reconhece somente o assessment SERP ativo persistido", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const assessment = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "group-1", articleDnaVersionId: "work:group-1", createdBy: "human-1", principalKeywordId: "kw-1", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: await snapshots() });
  assert.equal(latestActiveSerpFormationAssessment([assessment], "brand-1", "group-1")?.id, assessment.id);
  const outdated = markSerpAssessmentOutdated(assessment);
  assert.equal(latestActiveSerpFormationAssessment([outdated], "brand-1", "group-1"), undefined);
});

test("decisões humanas persistem e assessment anterior fica superseded", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const first = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "group-1", articleDnaVersionId: "work:group-1", createdBy: "human-1", principalKeywordId: "kw-1", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: await snapshots() });
  const decided = decideSerpRecommendation(first, "kw-2", "ignored", "human-1", "work-copy-2");
  assert.equal(decided.recommendations.find(item => item.keywordId === "kw-2")?.decision.status, "ignored");
  const successor = { ...first, id: `${first.id}:successor`, version: 2, previousVersionId: first.id };
  const old = supersedeRecommendations(decided, successor.id);
  assert.equal(old.recommendations.every(item => item.decision.status === "superseded"), true);
});

test("seguir recomendação altera somente keyword alvo e bloqueia principal publicada", () => {
  const recommendation = SerpKeywordRecommendationSchema.parse({ id: "r", keywordId: "kw-1", keywordDnaVersionId: "kw-v1", snapshotIds: ["s"], currentRole: "secundaria", suggestedRole: "principal", action: "tornar_principal", reason: "SERP", conflicts: [], decision: { status: "pending", actorId: null, decidedAt: null, workCopyVersion: null, note: null } });
  const keywords = [keyword("kw-1", "um"), keyword("kw-2", "dois")];
  const blocked = applySerpRecommendationToWorkCopy({ keywords: keywords as never, keywordId: "kw-1", recommendation, principalKeywordId: "kw-2", published: true });
  assert.equal(blocked.blocked, true);
  const changed = applySerpRecommendationToWorkCopy({ keywords: keywords as never, keywordId: "kw-1", recommendation, principalKeywordId: "kw-2", published: false });
  assert.equal(changed.changed, true);
  assert.equal(changed.keywords.find(item => item.id === "kw-2")?.keyword, "dois");
});

test("identidade publicada preserva URL única, lista fontes e bloqueia divergência", () => {
  const coherent = resolvePublishedIdentity([{ keywordDnaId: "kw-1", publishedUrl: "https://example.com/a", canonical: "https://example.com/a" }, { keywordDnaId: "kw-2", publishedUrl: "https://example.com/a", canonical: "https://example.com/a" }]);
  assert.equal(coherent.status, "coherent");
  if (coherent.status === "coherent") assert.deepEqual(coherent.sourceKeywordDnaIds, ["kw-1", "kw-2"]);
  const conflict = resolvePublishedIdentity([{ keywordDnaId: "kw-1", publishedUrl: "https://example.com/a" }, { keywordDnaId: "kw-2", publishedUrl: "https://example.com/b" }]);
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(conflict.urls, ["https://example.com/a", "https://example.com/b"]);
  assert.equal(resolvePublishedIdentity([{ keywordDnaId: "kw-1" }]).status, "missing");
});

test("ArticleDNA antigo continua válido e novo ArticleDNA carrega snapshot opcional", () => {
  const article = deterministicArticleDnaPayload(group, "brand-1");
  assert.equal(article.serpAssessmentRef, undefined);
  assert.equal(article.keywordReferences[0]?.keywordDnaSnapshot?.sourceKeywordSnapshot.id, "kw-1");
});

test("associa recomendação por keywordId e versão KeywordDNA, sem depender da ordem", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const assessment = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "group-1", articleDnaVersionId: "work:group-1", createdBy: "human-1", principalKeywordId: "kw-1", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: await snapshots() });
  const reordered = SerpFormationAssessmentSchema.parse({ ...assessment, keywordDnaReferences: [...assessment.keywordDnaReferences].reverse(), recommendations: [...assessment.recommendations].reverse() });
  assert.equal(findSerpRecommendationForKeyword(reordered, "kw-1")?.keywordId, "kw-1");
  assert.equal(findSerpRecommendationForKeyword(reordered, "kw-2")?.keywordId, "kw-2");
  assert.equal(unassociatedSerpRecommendations(reordered).length, 0);
  const wrongVersion = SerpFormationAssessmentSchema.parse({ ...reordered, recommendations: reordered.recommendations.map(item => item.keywordId === "kw-1" ? { ...item, keywordDnaVersionId: "different-version" } : item) });
  assert.equal(findSerpRecommendationForKeyword(wrongVersion, "kw-1"), undefined);
  assert.equal(unassociatedSerpRecommendations(wrongVersion).some(item => item.keywordId === "kw-1"), true);
  const duplicated = SerpFormationAssessmentSchema.parse({ ...reordered, recommendations: [...reordered.recommendations, reordered.recommendations.find(item => item.keywordId === "kw-1")] });
  assert.equal(unassociatedSerpRecommendations(duplicated).some(item => item.keywordId === "kw-1"), true);
});

test("artigo publicado usa SERP de fortalecimento e mantém a principal fora das candidatas", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const assessment = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "pub-1", articleDnaVersionId: "article-dna-v1", createdBy: "human-1", principalKeywordId: "kw-1", assessmentMode: "fortalecimento", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: await snapshots() });
  assert.equal(assessment.assessmentMode, "fortalecimento");
  const principalRecommendation = assessment.recommendations.find(item => item.keywordId === "kw-1");
  assert.ok(principalRecommendation);
  assert.equal(isPublishedStructuralRecommendation(principalRecommendation.action, "kw-1", "kw-1"), false);
  assert.equal(["fortalecer_intencao", "revisar_conteudo"].includes(principalRecommendation.action), true);
  assert.match(principalRecommendation.reason, /fortalec|conteúdo/i);
});

test("published guard bloqueia remoção inesperada da principal, mas permite remover suporte na cópia", () => {
  const recommendation = SerpKeywordRecommendationSchema.parse({ id: "r", keywordId: "kw-1", keywordDnaVersionId: "kw-v1", snapshotIds: ["s"], currentRole: "principal", suggestedRole: "principal", action: "retirar_do_artigo", reason: "SERP", conflicts: [], decision: { status: "pending", actorId: null, decidedAt: null, workCopyVersion: null, note: null } });
  const keywords = [keyword("kw-1", "um"), keyword("kw-2", "dois")];
  const blocked = applySerpRecommendationToWorkCopy({ keywords: keywords as never, keywordId: "kw-1", recommendation, principalKeywordId: "kw-1", published: true });
  assert.equal(blocked.blocked, true);
  const supportRecommendation = SerpKeywordRecommendationSchema.parse({ ...recommendation, id: "r-2", keywordId: "kw-2", currentRole: "secundaria" });
  const changed = applySerpRecommendationToWorkCopy({ keywords: keywords as never, keywordId: "kw-2", recommendation: supportRecommendation, principalKeywordId: "kw-1", published: true });
  assert.equal(changed.changed, true);
});

test("planilha torna o resultado SERP descobrível e ligado à keyword", async () => {
  const source = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("article-row-${art.id}"), true);
  assert.equal(source.includes("SERP pronta"), true);
  assert.equal(source.includes("SERP processando"), true);
  assert.equal(source.includes("renderSerpRecommendationForKeyword"), true);
  assert.equal(source.includes("Seguir recomendação"), true);
  assert.equal(source.includes("Recomendação SERP não associada"), true);
  assert.equal(source.includes("SERP de fortalecimento"), true);
  assert.equal(source.includes("Principal protegida"), true);
  assert.equal(/[ÃÂ][§£µ©]|Ãƒ|Â·/.test(source), false);
});

test("fluxo SERP mantém a working copy estrutural intacta e não restaura modal intermediário", async () => {
  const source = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const confirmSerpValidation");
  const end = source.indexOf("const handleSerpRecommendationDecision", start);
  const flow = source.slice(start, end);
  assert.equal(flow.includes("setMasterList"), false);
  assert.equal(flow.includes("setProvisionalGroups"), false);
  assert.equal(flow.includes("persistWorkingCopyAssignments"), false);
  assert.equal(flow.includes("applySerpRecommendationToWorkCopy"), false);
  assert.equal(source.includes("siloCandidates: siloCandidateKeywords"), true);
  assert.equal(source.includes("Validar SERP"), true);
});

test("transferência aprovada preserva referências KeywordDNA e assessment no item Radar", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const assessment = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "group-1", articleDnaVersionId: "work:group-1", createdBy: "human-1", principalKeywordId: "kw-1", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: await snapshots() });
  const article = deterministicArticleDnaPayload(group, "brand-1");
  const version = await createVersionEnvelope({ entityId: article.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "human-1", payload: article });
  const radarItems = importArticlesToRadar([], [version], "brand-1", undefined, [], {}, {}, { [article.articleId]: assessment });
  assert.equal(radarItems[0]?.arquitetoKeywordDnaReferences?.length, 2);
  assert.equal(radarItems[0]?.arquitetoSerpAssessment?.id, assessment.id);
  assert.equal(radarItems[0]?.arquitetoStrategyContext?.articleId, article.articleId);
  assert.equal(radarItems[0]?.arquitetoStrategyContext?.primaryKeyword.keywordId, article.principalKeywordId);
});

test("contexto rico usa aliases do Minerador sem inferir KGR por score ou slug", () => {
  const explicit = adaptKeywordIdentityContext({
    slug_sugerido: "trafego-pago-vs-organico",
    kgr_score: 0.12,
    analise_semantica: {
      relacao_url: "principal_candidata",
      situacao_arquitetural: "aguardando_arquitetura",
      kgr_designation: { is_kgr_article: true, binding_status: "candidate", bound_slug: "trafego-pago-vs-organico", source: "minerador" },
    },
  });
  assert.equal(explicit.keywordUrlRelation, "candidate_primary");
  assert.equal(explicit.architectureStatus, "awaiting_architecture");
  assert.equal(explicit.kgrIdentity?.bindingStatus, "candidate");
  assert.equal(adaptKeywordIdentityContext({ kgr_score: 0.1, slug_sugerido: "mesmo-texto" }).kgrIdentity, undefined);
});

test("os três modos SERP distinguem publicado candidato, arquitetura confirmada e KGR", () => {
  assert.equal(resolveArticleSerpIdentityContext({ published: false, principalKeywordId: "kw-1" }).mode, "formacao");
  assert.equal(resolveArticleSerpIdentityContext({ published: true, principalKeywordId: "kw-1", keywordUrlRelation: "candidate_primary", architectureStatus: "awaiting_architecture" }).mode, "arquitetura_publicado");
  assert.equal(resolveArticleSerpIdentityContext({ published: true, principalKeywordId: "kw-1", keywordUrlRelation: "confirmed_primary", architectureStatus: "architecture_confirmed" }).mode, "fortalecimento");
  assert.equal(resolveArticleSerpIdentityContext({ published: true, principalKeywordId: "kw-1", architectureStatus: "awaiting_architecture", kgrIdentity: { isKgrArticle: true, source: "minerador", principalKeywordDnaId: "kw-1", boundSlug: "kw-1", bindingStatus: "confirmed" } }).mode, "fortalecimento");
  assert.equal(resolveArticleSerpIdentityContext({ published: true, principalKeywordId: "kw-1", keywordUrlRelation: "candidate_primary", architectureStatus: "awaiting_architecture" }).principalProtected, false);
});

test("principal candidata publicada continua editável, mas KGR confirmado bloqueia principal e slug", () => {
  const recommendation = SerpKeywordRecommendationSchema.parse({ id: "candidate-change", keywordId: "kw-1", keywordDnaVersionId: "legacy:kw-1", snapshotIds: ["snapshot-1"], currentRole: "principal", suggestedRole: "principal", action: "tornar_principal", reason: "fixture", conflicts: [], decision: { status: "pending", actorId: null, decidedAt: null, workCopyVersion: null, note: null } });
  const editable = applySerpRecommendationToWorkCopy({ keywords: [keyword("kw-1", "candidata")], keywordId: "kw-1", recommendation, principalKeywordId: "kw-1", published: true, principalProtected: false });
  assert.equal(editable.blocked, false);
  const article = deterministicArticleDnaPayload(group, "brand-1");
  const identity = { isKgrArticle: true as const, source: "minerador" as const, principalKeywordDnaId: article.principalKeywordId, boundSlug: article.suggestedSlug, bindingStatus: "confirmed" as const };
  const guarded = guardPublishedArticleProposal({ articleId: article.articleId, isPublished: false, brandId: "brand-1", siloId: article.siloId, principalKeywordId: article.principalKeywordId, slug: article.suggestedSlug, canonical: null, kgrIdentity: identity }, { ...article, principalKeywordId: "kw-other", suggestedSlug: "outro-slug" });
  assert.deepEqual(guarded.blockedFields.sort(), ["principalKeywordId", "slug"]);
  assert.equal(guarded.proposal.principalKeywordId, article.principalKeywordId);
  assert.equal(guarded.proposal.suggestedSlug, article.suggestedSlug);
});

test("ArticleDNA preserva relação, arquitetura e identidade KGR confirmada", () => {
  const identity = { isKgrArticle: true as const, source: "minerador" as const, principalKeywordDnaId: "kw-kgr", boundSlug: "keyword-kgr", bindingStatus: "confirmed" as const, evidenceKeywordDnaIds: ["kw-kgr"], kgrValue: 0.12, kgrTier: "leve" };
  const kgrGroup = ProvisionalArticleGroupSchema.parse({ ...group, id: "kgr-group", keywordIds: ["kw-kgr", "kw-support"], keywords: [keyword("kw-kgr", "keyword kgr", { isPublished: true, slug_sugerido: "keyword-kgr", keywordUrlRelation: "confirmed_primary", architectureStatus: "architecture_confirmed", kgrIdentity: identity }), keyword("kw-support", "apoio kgr")], publishedAnchorId: "kw-kgr", kgrIdentity: identity, architectureStatus: "architecture_confirmed", principalSuggestion: { ...group.principalSuggestion, keywordId: "kw-kgr" }, roles: { "kw-kgr": "principal", "kw-support": "secundaria" } });
  const article = deterministicArticleDnaPayload(kgrGroup, "brand-1");
  assert.equal(article.architectureStatus, "architecture_confirmed");
  assert.equal(article.kgrIdentity?.boundSlug, "keyword-kgr");
  assert.equal(article.keywordReferences.find(reference => reference.keywordId === "kw-kgr")?.keywordUrlRelation, "confirmed_primary");
  assert.equal(article.keywordReferences.find(reference => reference.keywordId === "kw-kgr")?.keywordDnaSnapshot?.sourceKeywordSnapshot.kgrIdentity !== undefined, true);
});

test("confirmação da arquitetura cria sucessora real e preserva a identidade publicada", async () => {
  const source = deterministicArticleDnaPayload(group, "brand-1");
  const publishedArticle = ArticleDNASchema.parse({ ...source, publishedIdentityRef: { publicationStatus: "published_protected", slug: source.suggestedSlug, publishedUrl: "https://example.com/publicado", canonical: "https://example.com/publicado" } });
  const current = await createVersionEnvelope({ entityId: source.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "system", payload: publishedArticle });
  const successor = await confirmArticleArchitecture(current, "kw-1", "human-1", "2026-07-21T12:00:00.000Z");
  assert.equal(successor.versionNumber, 2);
  assert.equal(successor.previousVersionId, current.versionId);
  assert.equal(successor.payload.architectureStatus, "architecture_confirmed");
  assert.equal(successor.payload.keywordReferences.find(reference => reference.keywordId === "kw-1")?.keywordUrlRelation, "confirmed_primary");
  assert.equal(successor.payload.publishedIdentityRef?.slug, current.payload.publishedIdentityRef?.slug);
});

test("normaliza intenção equivalente, preserva rótulo e ancora o ArticleDNA na principal", () => {
  assert.equal(normalizeSearchIntent("Informativo"), "informational");
  assert.equal(normalizeSearchIntent("informacional"), "informational");
  assert.equal(normalizeSearchIntent("INVESTIGAÇÃO COMERCIAL"), "commercial_investigation");
  assert.equal(intentCompatibility("informational", "commercial_investigation", "secundaria"), "adjacent");
  const intentGroup = ProvisionalArticleGroupSchema.parse({
    ...group, id: "intent-group", keywordIds: ["kw-1", "kw-2"],
    keywords: [keyword("kw-1", "artigo informativo", { intent: "Informativo", analise_semantica: { ...keyword("kw-1", "x").analise_semantica, intencao_principal: "Informacional", cta: "Contratar serviço" } }), keyword("kw-2", "comparar serviços", { intent: "Investigação comercial" })],
  });
  const article = deterministicArticleDnaPayload(intentGroup, "brand-1");
  assert.equal(article.mainIntent, "informational");
  assert.equal(article.intentProfile?.primaryIntent, "informational");
  assert.equal(article.intentProfile?.originalLabel, "Informativo");
  assert.equal(article.intentProfile?.secondaryIntentSignals[0]?.intent, "commercial_investigation");
  assert.equal(article.intentProfile?.secondaryIntentSignals[0]?.compatibility, "adjacent");
});

test("hierarquia não vira formato e ausência no snippet vira evidência fraca", async () => {
  assert.equal(explicitEditorialFormat(keyword("kw-format", "tema", { analise_semantica: { formato_esperado: "Suporte" } })), undefined);
  assert.equal(explicitEditorialFormat(keyword("kw-format", "tema", { analise_semantica: { formato_esperado: "guia" } })), "guia");
  const source = (await snapshots())[0]!;
  const noisy = SerpResearchSnapshotSchema.parse({ ...source, diagnostic: { ...source.diagnostic, possibleConflicts: [...source.diagnostic.possibleConflicts, "Tópicos do ArticleDNA sem ocorrência textual nos snippets: assunto ausente."], verdict: "possivel_conflito" } });
  const normalized = normalizeArchitectSerpSnapshot(noisy);
  assert.equal(normalized.diagnostic.possibleConflicts.length, 0);
  assert.equal(normalized.diagnostic.verdict, "parcialmente_coerente");
  assert.equal(normalized.diagnostic.limitations.some(item => item.includes("Cobertura não observada nos snippets")), true);
});

test("KGR confirmado usa perfil leve, consulta a principal e preserva todas as referências", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const assessment = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "kgr-article", articleDnaVersionId: "article-v1", createdBy: "human-1", principalKeywordId: "kw-1", validationProfile: "kgr_light", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: [(await snapshots())[0]!], queriedKeywordDnaIds: ["kw-1"] });
  assert.equal(resolveSerpValidationProfile("fortalecimento", true), "kgr_light");
  assert.equal(assessment.validationProfile, "kgr_light");
  assert.equal(assessment.queryCount, 1);
  assert.deepEqual(assessedKeywordDnaIds(assessment), ["kw-1"]);
  assert.equal(assessment.keywordDnaReferences.length, 2);
  assert.equal(assessment.recommendations.length, 1);
});

test("evidência KGR fraca não recomenda separação, enquanto conflito forte pode fazê-lo", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const source = await snapshots();
  const weak = SerpResearchSnapshotSchema.parse({ ...source[1], diagnostic: { ...source[1]!.diagnostic, confidence: "low", verdict: "possivel_conflito", possibleConflicts: ["Intenção realmente incompatível após normalização."] } });
  const weakAssessment = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "kgr-weak", articleDnaVersionId: "article-v1", createdBy: "human-1", principalKeywordId: "kw-1", validationProfile: "kgr_light", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: [source[0]!, weak], queriedKeywordDnaIds: ["kw-1", "kw-2"] });
  assert.equal(weakAssessment.recommendations.find(item => item.keywordId === "kw-2")?.action, "revisar_humano");
  assert.equal(weakAssessment.recommendations.find(item => item.keywordId === "kw-2")?.confidence, "baixa");
  const strong = SerpResearchSnapshotSchema.parse({ ...source[1], diagnostic: { ...source[1]!.diagnostic, confidence: "high", verdict: "possivel_conflito", possibleConflicts: ["Intenção realmente incompatível após normalização."] } });
  const strongAssessment = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "strong", articleDnaVersionId: "article-v1", createdBy: "human-1", principalKeywordId: "kw-1", validationProfile: "standard", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: [source[0]!, strong], queriedKeywordDnaIds: ["kw-1", "kw-2"] });
  assert.equal(strongAssessment.recommendations.find(item => item.keywordId === "kw-2")?.action, "separar_artigo");
  assert.equal(strongAssessment.recommendations.find(item => item.keywordId === "kw-2")?.confidence, "alta");
});

test("assessment antigo permanece no histórico e recebe estado explícito de desatualização", async () => {
  const references = group.keywords.map((item, index) => articleKeywordReference(item, index === 0 ? "principal" : "secundaria", "brand-1"));
  const current = await buildSerpFormationAssessment({ brandId: "brand-1", articleId: "history", articleDnaVersionId: "article-v1", createdBy: "human-1", principalKeywordId: "kw-1", keywordReferences: references, keywordDnaReferences: references.map(reference => reference.keywordDnaSnapshot!).filter(Boolean), snapshots: await snapshots() });
  const outdated = markSerpAssessmentOutdated(current);
  assert.equal(outdated.id, current.id);
  assert.equal(outdated.evaluationStatus, "outdated");
  assert.equal(outdated.outdatedReason, "Desatualizado por correção do avaliador");
  assert.equal(outdated.contentHash, current.contentHash);
});

test("ingestão preserva URL, canonical, slug e status publicado do Minerador", () => {
  const snapshot = EditorialSnapshotSchema.parse({
    brand: { id: "brand-1", nome: "Marca", site_url: "https://example.com", nicho: null, localizacao: null, dna_diretrizes: null, silos_existentes: [], created_at: null },
    silos: [],
    keywords: [{ id: "kw-pub", keyword: "artigo publicado", intent: "Informativo", volume_search: 10, kgr_score: null, lista_id: null, status: "publicado", analise_semantica: null, created_at: null, published_url: "https://example.com/artigo", canonical_url: "https://example.com/artigo", slug_sugerido: "artigo-publicado" }],
    briefings: [], loadedAt: "2026-07-21T12:00:00.000Z",
  });
  const imported = snapshotToArchitectKeywords(snapshot)[0]!;
  assert.equal(imported.publishedUrl, "https://example.com/artigo");
  assert.equal(imported.canonical, "https://example.com/artigo");
  assert.equal(imported.slug_sugerido, "artigo-publicado");
  assert.equal(imported.isPublished, true);
});

test("principal mais cinco suportes preservam seis KeywordDNAs no ArticleDNA", () => {
  const keywords = Array.from({ length: 6 }, (_, index) => keyword(`kw-six-${index + 1}`, `tema seis ${index + 1}`));
  const sixGroup = ProvisionalArticleGroupSchema.parse({ ...group, id: "six-group", keywordIds: keywords.map(item => item.id), keywords, principalSuggestion: { ...group.principalSuggestion, keywordId: keywords[0]!.id }, roles: Object.fromEntries(keywords.map((item, index) => [item.id, index === 0 ? "principal" : "secundaria"])) });
  const article = deterministicArticleDnaPayload(sixGroup, "brand-1");
  assert.equal(article.keywordReferences.length, 6);
  assert.equal(article.keywordReferences.some(reference => reference.keywordId === keywords[0]!.id && reference.role === "principal"), true);
  assert.equal(article.secondaryKeywordIds.length, 5);
});

test("ArticleDNA explicita volume, papel e propósito sem inventar volume de reforço", () => {
  const strategicGroup = ProvisionalArticleGroupSchema.parse({
    ...group,
    id: "strategy-group",
    keywordIds: ["kw-1", "kw-2", "kw-3"],
    keywords: [keyword("kw-1", "captação de pacientes", { volume_search: 100 }), keyword("kw-2", "atrair pacientes", { volume_search: 40 }), keyword("kw-3", "jornada do paciente", { volume_search: null })],
    roles: { "kw-1": "principal", "kw-2": "secundaria", "kw-3": "reforco_narrativo" },
    principalSuggestion: { ...group.principalSuggestion, keywordId: "kw-1" },
  });
  const article = deterministicArticleDnaPayload(strategicGroup, "brand-1");
  assert.equal(article.volumeStrategy?.primaryKeywordVolume, 100);
  assert.equal(article.volumeStrategy?.secondaryKeywordVolumeSum, 40);
  assert.equal(article.volumeStrategy?.reinforcementKeywordVolumeSum, null);
  assert.equal(article.volumeStrategy?.grossCombinedVolume, 140);
  assert.equal(article.keywordReferences.find(reference => reference.keywordId === "kw-2")?.contribution, "incremental_volume");
  assert.equal(article.keywordReferences.find(reference => reference.keywordId === "kw-3")?.contribution, "semantic_coverage");
  assert.equal(article.strategicPurpose?.primaryObjective, "answer_central_question");
  assert.match(article.hierarchyStrategy?.rationale.join(" ") || "", /não decide sozinho/);
});

test("KGR novo nasce candidato com slug da principal e divergência vira conflito", () => {
  const candidate = { isKgrArticle: true as const, source: "minerador" as const, bindingStatus: "candidate" as const };
  const candidateGroup = ProvisionalArticleGroupSchema.parse({ ...group, id: "kgr-candidate", kgrIdentity: candidate, keywords: [keyword("kw-1", "captação de pacientes", { slug_sugerido: null, kgrIdentity: candidate }), keyword("kw-2", "atrair pacientes")], principalSuggestion: { ...group.principalSuggestion, keywordId: "kw-1" } });
  const article = deterministicArticleDnaPayload(candidateGroup, "brand-1");
  assert.equal(article.kgrIdentity?.bindingStatus, "candidate");
  assert.equal(article.kgrIdentity?.status, "candidate");
  assert.equal(article.kgrIdentity?.boundSlug, article.suggestedSlug);

  const conflict = { ...candidate, boundSlug: "slug-humano-diferente" };
  const conflictGroup = ProvisionalArticleGroupSchema.parse({ ...candidateGroup, id: "kgr-conflict", kgrIdentity: conflict, keywords: [keyword("kw-1", "captação de pacientes", { kgrIdentity: conflict }), keyword("kw-2", "atrair pacientes")] });
  const conflicted = deterministicArticleDnaPayload(conflictGroup, "brand-1");
  assert.equal(conflicted.kgrIdentity?.bindingStatus, "conflict");
  assert.equal(conflicted.kgrIdentity?.boundSlug, "slug-humano-diferente");
});

test("confirmação humana fixa o par principal–slug KGR na sucessora", async () => {
  const candidate = { isKgrArticle: true as const, source: "minerador" as const, bindingStatus: "candidate" as const };
  const candidateGroup = ProvisionalArticleGroupSchema.parse({ ...group, id: "kgr-confirm", kgrIdentity: candidate, keywords: [keyword("kw-1", "captação de pacientes", { kgrIdentity: candidate }), keyword("kw-2", "atrair pacientes")], principalSuggestion: { ...group.principalSuggestion, keywordId: "kw-1" } });
  const current = await createVersionEnvelope({ entityId: "kgr-confirm", versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "system", payload: deterministicArticleDnaPayload(candidateGroup, "brand-1") });
  const successor = await confirmArticleArchitecture(current, "kw-1", "human-1", "2026-07-21T12:00:00.000Z");
  assert.equal(successor.payload.kgrIdentity?.bindingStatus, "confirmed");
  assert.equal(successor.payload.kgrIdentity?.status, "confirmed");
  assert.equal(successor.payload.kgrIdentity?.boundSlug, current.payload.suggestedSlug);
  assert.equal(successor.payload.kgrIdentity?.source, "human_confirmation");
});

test("contexto publicado candidato protege identidade, mas mantém principal corrigível", () => {
  const candidate = { isKgrArticle: true as const, source: "minerador" as const, bindingStatus: "candidate" as const };
  const candidateGroup = ProvisionalArticleGroupSchema.parse({ ...group, id: "published-candidate", publishedAnchorId: "kw-1", kgrIdentity: candidate, keywords: [keyword("kw-1", "captação de pacientes", { isPublished: true, status: "publicado", slug_sugerido: "captacao-de-pacientes", publishedUrl: "https://example.com/captacao-de-pacientes", canonical: "https://example.com/captacao-de-pacientes", kgrIdentity: candidate }), keyword("kw-2", "atrair pacientes")] });
  const article = deterministicArticleDnaPayload(candidateGroup, "brand-1");
  const context = buildArticleControlContext(article, { published: true });
  assert.equal(context.publicationStatus, "published");
  assert.equal(context.primaryKeyword.protected, false);
  assert.ok(context.protectedActions.includes("preserve_published_slug"));
  assert.ok(context.allowedActions.includes("correct_candidate_principal"));
  assert.ok(context.forbiddenActions.includes("replace_published_identity"));
});
