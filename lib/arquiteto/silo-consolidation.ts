import { z } from "zod";
import {
  SiloDNASchema,
  SiloPageSchema,
  VersionReferenceSchema,
  type ArticleDNA,
  type SiloDNA,
  type SiloPage,
  type VersionEnvelope,
  type VersionReference,
} from "./contracts.ts";
import { deterministicSiloDnaPayload, deterministicSiloPagePayload } from "./adapters.ts";
import { createVersionEnvelope, toVersionReference } from "./versioning.ts";
import { chooseSiloWorkingCopyPillar, shortSiloSlug, SHALLOW_SILO_REASON, type SiloWorkingCopy } from "./silo-formation.ts";
import type { SerpFormationAssessment } from "./serp-formation.ts";
import type { TerritoryNarrative } from "./territory-narrative.ts";

export const SiloReviewActionSchema = z.enum([
  "join",
  "split",
  "move_article",
  "eliminate_shallow",
  "rename",
  "suggest_slug",
  "select_pillar",
  "revise_supports",
  "verify_verticality",
]);
export type SiloReviewAction = z.infer<typeof SiloReviewActionSchema>;

export const SiloReviewOperationSchema = z.object({
  operationId: z.string().min(1),
  action: SiloReviewActionSchema,
  sourceSiloId: z.string().min(1),
  targetSiloId: z.string().min(1).nullable().optional(),
  articleId: z.string().min(1).nullable().optional(),
  articleIds: z.array(z.string().min(1)).optional(),
  name: z.string().trim().min(1).max(120).nullable().optional(),
  slug: z.string().trim().min(1).max(180).nullable().optional(),
  pillarArticleId: z.string().min(1).nullable().optional(),
  supportArticleIds: z.array(z.string().min(1)).optional(),
  justification: z.string().min(1),
  confidence: z.number().min(0).max(1),
  humanDecisionRequired: z.literal(true).default(true),
}).strict();
export type SiloReviewOperation = z.infer<typeof SiloReviewOperationSchema>;

export const SiloReviewProposalSchema = z.object({
  proposalId: z.string().min(1),
  source: z.literal("ai"),
  approvalStatus: z.literal("pending_human"),
  operations: z.array(SiloReviewOperationSchema),
  summary: z.string().min(1),
}).strict();
export type SiloReviewProposal = z.infer<typeof SiloReviewProposalSchema>;

export type SiloSerpGuideline = {
  articleId: string;
  reference: VersionReference | null;
  guideline: string;
};

export type SiloConsolidationInput = {
  copy: SiloWorkingCopy;
  /**
   * O Silo confirmado que este par materializa.
   *
   * A estrutura do SiloDNA é a do SILO, não a dos artigos que ele reúne:
   * entidade central, intenção macro, fronteira e narrativa vieram de uma
   * decisão humana. Derivá-las do conteúdo faria o Silo mudar de definição
   * toda vez que a composição mudasse — e é exatamente isso que a portaria
   * territorial recusa ao comparar os dois lados.
   *
   * SiloDNA e SiloPage também precisam DIZER a que Silo pertencem: artefato
   * canônico sem pai é órfão no acervo, e ninguém consegue provar depois de
   * qual decisão ele nasceu.
   */
  /**
   * A cópia de trabalho de onde esta consolidação nasceu.
   *
   * O SiloDNA carrega a referência e o lock lidos: é assim que se prova, no
   * acervo, sobre QUAL estado da cópia a decisão foi tomada. Sem isso o
   * artefato existe sem dizer de onde veio, e a portaria recusa — porque um
   * Silo que não aponta para a decisão que o gerou não é auditável.
   */
  workingCopy?: { workingCopyRef: string; lockVersion: number } | null;
  territory?: {
    territoryRef: string;
    centralEntity: string;
    macroIntent: string;
    boundary: { includes: readonly string[]; excludes: readonly string[] };
    narrative: TerritoryNarrative;
  } | null;
  articleVersions: readonly VersionEnvelope<ArticleDNA>[];
  existingSiloDna?: VersionEnvelope<SiloDNA>;
  existingSiloPage?: VersionEnvelope<SiloPage>;
  articleStatuses?: Record<string, string>;
  pendingAiOperations?: number;
  serpAssessments?: readonly SerpFormationAssessment[];
  /**
   * Identidade publicada herdada de um Silo nascido do Site/Sitemap.
   *
   * Existe porque o candidato pode ter página no ar SEM SiloPage canônica
   * anterior: nesse caso a consolidação ADOTA a página existente em vez de
   * criar outra. Opcional — o caminho manual segue idêntico.
   */
  /**
   * O Silo já foi confirmado por decisão humana?
   *
   * Muda o que a rasura significa: sem confirmação, um único Article é
   * tentativa de inventar estrutura e a consolidação recusa; com Silo
   * confirmado, é profundidade ausente — fica registrada como dívida e a
   * consolidação segue. A primeira passada valida o pipeline; fabricar
   * suporte inexistente para passar no portão seria mentir na arquitetura.
   */
  humanConfirmedSilo?: boolean;
  publishedIdentity?: {
    publishedSlug: string | null;
    publishedUrl: string | null;
    publishedCanonical: string | null;
    /** Referência estável à linha do catálogo remoto que originou o Silo. */
    publishedStructureRef: { source: string; catalogEntryId: string; normalizedUrl: string } | null;
  } | null;
  /**
   * Canonical e verificação de publicação já resolvidos pelo chamador a
   * partir do catálogo do site da Brand. Opcional: sem isto o comportamento
   * anterior é preservado inteiro.
   */
  resolvedIdentity?: SiloPageResolvedIdentity | null;
};

export type SiloPairReadback = {
  siloDnas: Array<VersionEnvelope<SiloDNA>>;
  siloPages: Array<VersionEnvelope<SiloPage>>;
  statuses: Array<{ versionId: string; status: string }>;
};

export type SiloConsolidationResult = {
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
  serpGuidelines: SiloSerpGuideline[];
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function sameIds(left: string[], right: string[]) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function contentHashIsValid(value: unknown): value is string {
  return typeof value === "string" && /^(sha256:[a-f0-9]{64}|legacy:[a-z0-9-]+)$/.test(value);
}

function existingSerpReference(article: ArticleDNA, assessments: readonly SerpFormationAssessment[]) {
  if (article.serpAssessmentRef) return article.serpAssessmentRef;
  const assessment = assessments.find(item => item.articleId === article.articleId && item.evaluationStatus === "active");
  if (!assessment || !contentHashIsValid(assessment.contentHash)) return null;
  const reference = { entityId: assessment.id, versionId: `${assessment.id}:v${assessment.version}`, contentHash: assessment.contentHash };
  return VersionReferenceSchema.safeParse(reference).success ? reference : null;
}

export function collectSiloSerpGuidelines(
  articles: readonly VersionEnvelope<ArticleDNA>[],
  assessments: readonly SerpFormationAssessment[] = [],
): SiloSerpGuideline[] {
  return articles.map(version => {
    const assessment = assessments.find(item => item.articleId === version.payload.articleId && item.evaluationStatus === "active");
    const reference = existingSerpReference(version.payload, assessments);
    if (!assessment) return { articleId: version.payload.articleId, reference, guideline: "Nenhuma diretriz SERP nova; preservar a evidência disponível ou registrar insuficiência." };
    const types = assessment.dominantResultTypes.length ? assessment.dominantResultTypes.join(", ") : "tipo de página não definido";
    return {
      articleId: version.payload.articleId,
      reference,
      guideline: `Intenção observada: ${assessment.intentCompatibility}; competição: ${assessment.competitionLevel}; tipos dominantes: ${types}. SERP orienta a arquitetura, não movimenta artigos.`,
    };
  });
}

function refsForCopy(copy: SiloWorkingCopy) {
  return copy.articleReferences.map(reference => ({
    articleId: reference.articleId,
    articleDnaVersionId: reference.articleDnaVersionId,
    articleDnaContentHash: reference.articleDnaContentHash,
    role: reference.role === "pillar_candidate" ? "Pilar" as const : "Suporte" as const,
  }));
}

export function siloConsolidationIssues(input: SiloConsolidationInput): string[] {
  const issues: string[] = [];
  const copy = input.copy;
  const articles = [...input.articleVersions];
  const articleById = new Map(articles.map(version => [version.payload.articleId, version]));
  const copyArticleIds = copy.articleReferences.map(reference => reference.articleId);
  const pillarRefs = copy.articleReferences.filter(reference => reference.role === "pillar_candidate");

  if (!copy.brandId || articles.some(version => version.payload.brandId !== copy.brandId)) issues.push("Todos os ArticleDNAs precisam pertencer à Brand da working copy.");
  if (!copyArticleIds.length) issues.push("O Silo precisa possuir ao menos um ArticleDNA.");
  if (new Set(copyArticleIds).size !== copyArticleIds.length) issues.push("O Silo possui ArticleDNA duplicado.");
  if (pillarRefs.length !== 1 || !copy.pillarCandidateArticleId || pillarRefs[0]?.articleId !== copy.pillarCandidateArticleId) issues.push("O Silo precisa ter exatamente um Pilar definido.");
  if (copy.supportArticleIds.includes(copy.pillarCandidateArticleId || "")) issues.push("O Pilar não pode permanecer também como Suporte.");
  if (!sameIds([...copyArticleIds].filter(id => id !== copy.pillarCandidateArticleId), copy.supportArticleIds)) issues.push("Suportes não cobrem exatamente os ArticleDNAs não-Pilar.");
  if (copy.articleReferences.some(reference => !articleById.has(reference.articleId))) issues.push("A working copy referencia ArticleDNA ausente.");
  if (copy.articleReferences.some(reference => {
    const article = articleById.get(reference.articleId);
    return !article || article.versionId !== reference.articleDnaVersionId || article.contentHash !== reference.articleDnaContentHash;
  })) issues.push("Existe ref de ArticleDNA com versão ou hash divergente.");
  // A rasura não é conflito de arquitetura: ela é ausência de profundidade,
  // e some da lista de conflitos quando o Silo já foi confirmado.
  const conflitosReais = copy.conflicts.filter(reason => reason !== SHALLOW_SILO_REASON || !input.humanConfirmedSilo);
  if (conflitosReais.length || copy.siloPage.collisionReasons.length) issues.push("Há conflitos de arquitetura ou colisão SiloPage/Pilar pendentes.");
  if (copy.source === "insufficient_architecture" && !input.humanConfirmedSilo) issues.push("A arquitetura ainda é insuficiente para consolidar um novo Silo.");
  if (input.pendingAiOperations && input.pendingAiOperations > 0) issues.push("Existem propostas da IA aguardando decisão humana.");
  if (input.existingSiloDna && input.existingSiloDna.payload.brandId !== copy.brandId) issues.push("SiloDNA existente pertence a outra Brand.");
  if (input.existingSiloPage && input.existingSiloPage.payload.brandId !== copy.brandId) issues.push("SiloPage existente pertence a outra Brand.");
  for (const articleId of copyArticleIds) {
    const status = input.articleStatuses?.[articleId];
    if (status && status !== "approved") issues.push(`ArticleDNA ${articleId} ainda não está aprovado.`);
  }
  if (input.existingSiloPage?.payload.publicationStatus === "published" && copy.slug !== input.existingSiloPage.payload.slug) issues.push("Slug da SiloPage publicada não pode ser alterado.");
  return unique(issues);
}

export function buildConsolidatedSiloDnaPayload(input: SiloConsolidationInput): SiloDNA {
  const articles = [...input.articleVersions];
  const firstArticle = articles[0]?.payload;
  const centralEntity = input.territory?.centralEntity?.trim()
    || input.existingSiloDna?.payload.centralEntity?.trim()
    || firstArticle?.entities.find(entity => entity.trim())
    || input.copy.name;
  const base = deterministicSiloDnaPayload(input.copy.id, input.copy.name, articles, { brandId: input.copy.brandId, centralEntity });
  const articleReferences = refsForCopy(input.copy);
  const pillarArticleId = input.copy.pillarCandidateArticleId;
  const supportArticleIds = input.copy.supportArticleIds;
  const articleRoles = articleReferences.map(reference => ({
    articleId: reference.articleId,
    role: reference.role,
    reason: reference.role === "Pilar" ? "Unidade editorial principal confirmada pelo humano." : "Suporte vertical do universo confirmado pelo humano.",
  }));
  const narrativeOrder = [pillarArticleId, ...supportArticleIds].filter((id): id is string => Boolean(id));
  const linkMap = supportArticleIds.map(articleId => ({ fromArticleId: articleId, toArticleId: pillarArticleId || articleId, reason: "Suporte aprofunda o universo e retorna ao Pilar." }));
  const guidelines = collectSiloSerpGuidelines(articles, input.serpAssessments);
  const serpAssessmentRefs = unique(guidelines.map(item => item.reference).filter((reference): reference is VersionReference => Boolean(reference)).map(reference => JSON.stringify(reference))).map(value => JSON.parse(value) as VersionReference);
  const previous = input.existingSiloDna?.payload;
  return SiloDNASchema.parse({
    ...base,
    ...previous,
    schemaVersion: 1,
    formationStatus: "formed",
    siloId: input.copy.id,
    brandId: input.copy.brandId,
    ...(input.territory ? { territoryRef: input.territory.territoryRef, territoryNarrative: input.territory.narrative } : {}),
    ...(input.workingCopy
      ? { workingCopyRef: input.workingCopy.workingCopyRef, workingCopyLockVersion: input.workingCopy.lockVersion }
      : {}),
    name: input.copy.name,
    centralEntity,
    centralEntitySource: previous?.centralEntitySource || "keyword_dna",
    objective: previous?.objective?.trim() || base.objective,
    audience: previous?.audience?.trim() || base.audience,
    macroProblem: previous?.macroProblem?.trim() || base.macroProblem,
    dominantIntent: input.territory?.macroIntent?.trim() || previous?.dominantIntent?.trim() || base.dominantIntent,
    pillarArticleId,
    supportArticleIds,
    articleReferences,
    articleRoles,
    narrativeOrder,
    linkMap,
    boundary: previous?.boundary?.trim() || base.boundary,
    // A fronteira é a do Silo confirmado, não a soma dos assuntos dos artigos.
    includedTopics: input.territory
      ? [...input.territory.boundary.includes]
      : unique([...base.includedTopics, ...(previous?.includedTopics || [])]),
    excludedTopics: input.territory ? [...input.territory.boundary.excludes] : (previous?.excludedTopics || []),
    nearbySiloIds: previous?.nearbySiloIds || [],
    possibleConflicts: [],
    // A rasura fica ESCRITA no artefato, não só no portão que a deixou passar.
    // Um Silo sem suporte consolidado na primeira passada é dívida declarada;
    // sem isso, a segunda passada teria de redescobrir sozinha o que já se
    // sabia no dia da consolidação.
    gaps: unique([
      ...(previous?.gaps || []),
      "InternalLinkGraph ainda não foi consolidado neste lote.",
      ...(supportArticleIds.length ? [] : ["Silo raso: nenhum Article de suporte na composição consolidada."]),
    ]),
    nextContents: previous?.nextContents || [],
    confidence: input.copy.pillarScores.find(score => score.articleId === pillarArticleId)?.total ?? previous?.confidence ?? base.confidence,
    humanPendingDecisions: unique([
      ...(previous?.humanPendingDecisions || []),
      ...(supportArticleIds.length
        ? []
        : ["Revisão de segunda passada: definir os Articles de suporte que dão profundidade a este Silo."]),
    ]),
    hierarchySignals: input.copy.pillarScores.map((score, index) => ({
      articleDnaId: score.articleId,
      principalVolume: articles.find(article => article.payload.articleId === score.articleId)?.payload.primaryKeywordMetrics?.volumeSearch ?? null,
      combinedVolume: articles.find(article => article.payload.articleId === score.articleId)?.payload.keywordStrategy?.combinedVolume ?? null,
      tailLength: score.shortTerm === null ? 0 : Math.round(4 / Math.max(score.shortTerm, 0.25)),
      kgrScore: articles.find(article => article.payload.articleId === score.articleId)?.payload.kgrIdentity?.kgrValue ?? null,
      semanticCentrality: score.centrality ?? 0,
      intentBreadth: articles.find(article => article.payload.articleId === score.articleId)?.payload.keywordReferences.length || 0,
      suggestedRole: index === 0 || score.articleId === pillarArticleId ? "pillar" as const : "support" as const,
      supportOrder: score.articleId === pillarArticleId ? null : supportArticleIds.indexOf(score.articleId) + 1,
      rationale: score.reasons.join(" "),
    })),
    ...(serpAssessmentRefs.length ? { serpAssessmentRefs } : {}),
    ...(guidelines.length ? { serpGuidelines: guidelines.map(item => `${item.articleId}: ${item.guideline}`) } : {}),
  });
}

/**
 * Identidade publicável resolvida a partir do catálogo do site da Brand.
 *
 * Entra como INSUMO já resolvido: este módulo não vai à rede nem lê o
 * catálogo. Ele apenas deixa de emitir `canonical: null` e verificação
 * `not_checked` quando a evidência já existe — que era o motivo de três
 * SiloPages consolidadas ficarem eternamente não aprováveis.
 */
export type SiloPageResolvedIdentity = {
  canonical: string | null;
  publicationStatus: "new" | "published";
  publishedUrl: string | null;
  publicationVerification: SiloPage["publicationVerification"];
};

export function buildConsolidatedSiloPagePayload(
  siloDnaVersion: VersionEnvelope<SiloDNA>,
  input: SiloConsolidationInput,
): SiloPage {
  const existing = input.existingSiloPage?.payload;
  // Silo nascido de página publicada adota a identidade que já está no ar,
  // mesmo sem SiloPage canônica anterior: criar outra URL duplicaria a página.
  const publishedOrigin = input.publishedIdentity ?? null;
  const resolvedIdentity = input.resolvedIdentity ?? null;
  const slug = existing?.publicationStatus === "published"
    ? existing.slug
    : publishedOrigin?.publishedSlug || input.copy.slug;
  const base = deterministicSiloPagePayload(siloDnaVersion, input.copy.brandId, slug, existing?.publicationStatus === "published" ? {
    publicationStatus: "published",
    publishedUrl: existing.publishedUrl,
    publicationVerification: existing.publicationVerification,
  } : undefined);
  const content = existing && existing.formationStatus === "formed" ? existing : base;
  return SiloPageSchema.parse({
    ...base,
    ...content,
    schemaVersion: 1,
    formationStatus: "formed",
    siloPageId: `silo-page:${input.copy.id}`,
    brandId: input.copy.brandId,
    siloDnaRef: toVersionReference(siloDnaVersion),
    siloId: input.copy.id,
    ...(input.territory ? { territoryRef: input.territory.territoryRef } : {}),
    slug,
    /*
     * Canonical verificado da página existente continua PROTEGIDO — a
     * identidade resolvida só PREENCHE o que estava vazio. Para uma página
     * nova ela traz o canonical planejado; para uma publicada, o canonical
     * que o catálogo observou. Em nenhum caso ela reescreve endereço que a
     * página já declarava.
     */
    canonical: existing?.canonical ?? publishedOrigin?.publishedCanonical ?? resolvedIdentity?.canonical ?? null,
    // A página já está no ar: consolidar não a torna "nova".
    publicationStatus: existing?.publicationStatus || (publishedOrigin?.publishedUrl ? "published" : resolvedIdentity?.publicationStatus || "new"),
    publishedUrl: existing?.publishedUrl ?? publishedOrigin?.publishedUrl ?? resolvedIdentity?.publishedUrl ?? null,
    /*
     * A VERIFICAÇÃO RESOLVIDA PREVALECE sobre a gravada.
     *
     * A gravada é o retrato do momento em que a SiloPage foi criada — quando
     * ninguém tinha ido ao catálogo ainda, e por isso vale `not_checked`. A
     * resolvida é a leitura vigente do mesmo site. Preferir a antiga seria
     * manter a página bloqueada por falta de uma informação que já existe.
     */
    publicationVerification: resolvedIdentity?.publicationVerification ?? existing?.publicationVerification ?? base.publicationVerification,
    pillarArticleId: input.copy.pillarCandidateArticleId,
    supportArticleIds: input.copy.supportArticleIds,
  });
}

export async function createSiloConsolidationVersions(input: SiloConsolidationInput, actorId: string): Promise<SiloConsolidationResult> {
  const issues = siloConsolidationIssues(input);
  if (issues.length) throw new Error(issues.join(" "));
  const payload = buildConsolidatedSiloDnaPayload(input);
  const siloDna = await createVersionEnvelope({
    entityId: payload.siloId,
    versionNumber: (input.existingSiloDna?.versionNumber || 0) + 1,
    previousVersionId: input.existingSiloDna?.versionId || null,
    origin: "human",
    changeReason: "Consolidação humana da arquitetura do Silo.",
    createdBy: actorId,
    payload,
  });
  const pagePayload = buildConsolidatedSiloPagePayload(siloDna, input);
  const siloPage = await createVersionEnvelope({
    entityId: pagePayload.siloPageId,
    versionNumber: (input.existingSiloPage?.versionNumber || 0) + 1,
    previousVersionId: input.existingSiloPage?.versionId || null,
    origin: "human",
    changeReason: "SiloPage correspondente à consolidação humana do Silo.",
    createdBy: actorId,
    payload: pagePayload,
  });
  return { siloDna, siloPage, serpGuidelines: collectSiloSerpGuidelines(input.articleVersions, input.serpAssessments) };
}

export function siloDnaReadbackIssues(expected: VersionEnvelope<SiloDNA>, readback: SiloPairReadback) {
  const issues: string[] = [];
  const actual = readback.siloDnas.find(version => version.payload.siloId === expected.payload.siloId && version.versionId === expected.versionId);
  if (!actual) return [`SiloDNA ${expected.payload.siloId} não retornou no readback.`];
  if (actual.contentHash !== expected.contentHash) issues.push("Hash do SiloDNA divergente no readback.");
  if (actual.payload.brandId !== expected.payload.brandId) issues.push("brandId do SiloDNA divergente no readback.");
  if (actual.payload.pillarArticleId !== expected.payload.pillarArticleId) issues.push("Pilar divergente no readback do SiloDNA.");
  if (!sameIds(actual.payload.supportArticleIds, expected.payload.supportArticleIds)) issues.push("Suportes divergentes no readback do SiloDNA.");
  const expectedRefs = expected.payload.articleReferences.map(reference => `${reference.articleId}:${reference.articleDnaVersionId}:${reference.articleDnaContentHash}`).sort();
  const actualRefs = actual.payload.articleReferences.map(reference => `${reference.articleId}:${reference.articleDnaVersionId}:${reference.articleDnaContentHash}`).sort();
  if (JSON.stringify(actualRefs) !== JSON.stringify(expectedRefs)) issues.push("Refs de ArticleDNA divergentes no readback do SiloDNA.");
  const status = readback.statuses.filter(item => item.versionId === expected.versionId).at(-1)?.status;
  if (status !== "approved") issues.push("SiloDNA consolidado retornou sem status approved.");
  return issues;
}

export function siloPageReadbackIssues(expected: VersionEnvelope<SiloPage>, readback: SiloPairReadback) {
  const issues: string[] = [];
  const actual = readback.siloPages.find(version => version.payload.siloPageId === expected.payload.siloPageId && version.versionId === expected.versionId);
  if (!actual) return [`SiloPage ${expected.payload.siloPageId} não retornou no readback.`];
  if (actual.contentHash !== expected.contentHash) issues.push("Hash da SiloPage divergente no readback.");
  if (actual.payload.brandId !== expected.payload.brandId) issues.push("brandId da SiloPage divergente no readback.");
  if (actual.payload.siloDnaRef.versionId !== expected.payload.siloDnaRef.versionId || actual.payload.siloDnaRef.contentHash !== expected.payload.siloDnaRef.contentHash) issues.push("Ref de SiloDNA divergente no readback da SiloPage.");
  if (actual.payload.slug !== expected.payload.slug) issues.push("Slug divergente no readback da SiloPage.");
  if (expected.payload.publicationStatus === "published" && (actual.payload.publishedUrl !== expected.payload.publishedUrl || actual.payload.canonical !== expected.payload.canonical)) issues.push("Identidade publicada divergente no readback da SiloPage.");
  return issues;
}

export type SiloReviewApplyResult = { workingCopies: SiloWorkingCopy[]; applied: string[]; rejected: Array<{ operationId: string; reason: string }> };

function copyArticleIds(copy: SiloWorkingCopy) { return copy.articleReferences.map(reference => reference.articleId); }

function withRoles(copy: SiloWorkingCopy, pillarArticleId: string): SiloWorkingCopy {
  const next = chooseSiloWorkingCopyPillar(copy, pillarArticleId);
  return {
    ...next,
    siloPage: {
      ...next.siloPage,
      pillarArticleId: null,
      supportArticleIds: [...next.supportArticleIds],
    },
  };
}

export function applySiloAiProposal(
  copies: readonly SiloWorkingCopy[],
  proposal: SiloReviewProposal,
  rejectedOperationIds: readonly string[] = [],
): SiloReviewApplyResult {
  let workingCopies = [...copies];
  const applied: string[] = [];
  const rejected: Array<{ operationId: string; reason: string }> = [];
  const rejectedSet = new Set(rejectedOperationIds);
  for (const operation of proposal.operations) {
    if (rejectedSet.has(operation.operationId)) { rejected.push({ operationId: operation.operationId, reason: "Rejeitada pelo humano antes da aplicação." }); continue; }
    const sourceIndex = workingCopies.findIndex(copy => copy.id === operation.sourceSiloId);
    if (sourceIndex < 0) { rejected.push({ operationId: operation.operationId, reason: "Silo de origem não existe na working copy." }); continue; }
    const source = workingCopies[sourceIndex];
    const targetIndex = operation.targetSiloId ? workingCopies.findIndex(copy => copy.id === operation.targetSiloId) : -1;
    const target = targetIndex >= 0 ? workingCopies[targetIndex] : null;
    const published = source.publishedProtection.protected;
    if (operation.action === "join") {
      if (!target) { rejected.push({ operationId: operation.operationId, reason: "Juntar exige Silo de destino existente." }); continue; }
      if (published) { rejected.push({ operationId: operation.operationId, reason: "Silo publicado não pode ser eliminado pela proposta." }); continue; }
      const ids = unique([...copyArticleIds(target), ...copyArticleIds(source)]);
      const refs = [...target.articleReferences, ...source.articleReferences].filter((reference, index, all) => all.findIndex(candidate => candidate.articleId === reference.articleId) === index);
      const merged = withRoles({ ...target, articleReferences: refs, supportArticleIds: ids.filter(id => id !== target.pillarCandidateArticleId), reasons: [...target.reasons, `IA propôs juntar ${source.name}: ${operation.justification}`] }, target.pillarCandidateArticleId || ids[0]);
      workingCopies = workingCopies.filter((_, index) => index !== sourceIndex).map(copy => copy.id === target.id ? merged : copy);
      applied.push(operation.operationId); continue;
    }
    if (operation.action === "move_article") {
      if (!target || !operation.articleId) { rejected.push({ operationId: operation.operationId, reason: "Mover exige destino e ArticleDNA." }); continue; }
      const moved = source.articleReferences.find(reference => reference.articleId === operation.articleId);
      if (!moved) { rejected.push({ operationId: operation.operationId, reason: "ArticleDNA não pertence ao Silo de origem." }); continue; }
      const nextSourceRefs = source.articleReferences.filter(reference => reference.articleId !== operation.articleId);
      if (!nextSourceRefs.length) { rejected.push({ operationId: operation.operationId, reason: "Mover não pode deixar o Silo de origem sem ArticleDNA." }); continue; }
      const nextTargetRefs = [...target.articleReferences, moved].filter((reference, index, all) => all.findIndex(candidate => candidate.articleId === reference.articleId) === index);
      const nextSource = withRoles({ ...source, articleReferences: nextSourceRefs, supportArticleIds: nextSourceRefs.map(reference => reference.articleId).filter(id => id !== source.pillarCandidateArticleId), reasons: [...source.reasons, `IA propôs mover ${operation.articleId}: ${operation.justification}`] }, nextSourceRefs.some(reference => reference.articleId === source.pillarCandidateArticleId) ? source.pillarCandidateArticleId! : nextSourceRefs[0].articleId);
      const nextTarget = withRoles({ ...target, articleReferences: nextTargetRefs, supportArticleIds: nextTargetRefs.map(reference => reference.articleId).filter(id => id !== target.pillarCandidateArticleId), reasons: [...target.reasons, `IA recebeu ${operation.articleId}: ${operation.justification}`] }, target.pillarCandidateArticleId || operation.articleId);
      workingCopies = workingCopies.map(copy => copy.id === source.id ? nextSource : copy.id === target.id ? nextTarget : copy);
      applied.push(operation.operationId); continue;
    }
    if (operation.action === "split") {
      const selectedIds = unique(operation.articleIds || (operation.articleId ? [operation.articleId] : []));
      if (!selectedIds.length || selectedIds.length >= source.articleReferences.length) { rejected.push({ operationId: operation.operationId, reason: "Divisão precisa separar parte dos ArticleDNAs e manter origem." }); continue; }
      const selected = source.articleReferences.filter(reference => selectedIds.includes(reference.articleId));
      if (selected.length !== selectedIds.length) { rejected.push({ operationId: operation.operationId, reason: "A divisão referencia ArticleDNA inexistente." }); continue; }
      const newId = `working-silo:split:${source.id}:${selectedIds.sort().join("-")}`;
      if (workingCopies.some(copy => copy.id === newId)) { rejected.push({ operationId: operation.operationId, reason: "A divisão já existe na working copy." }); continue; }
      const remaining = source.articleReferences.filter(reference => !selectedIds.includes(reference.articleId));
      const nextSource = withRoles({ ...source, articleReferences: remaining, supportArticleIds: remaining.map(reference => reference.articleId).filter(id => id !== source.pillarCandidateArticleId), reasons: [...source.reasons, `IA propôs separar ${selectedIds.join(", ")}: ${operation.justification}`] }, remaining.some(reference => reference.articleId === source.pillarCandidateArticleId) ? source.pillarCandidateArticleId! : remaining[0].articleId);
      // A IA propõe a divisão; NÃO escolhe o Pilar da parte nova. A versão
      // anterior usava `selectedIds[0]` — Pilar por ordem do array, decidido por
      // uma proposta de IA. A cópia nasce sem Pilar e sem Suportes atribuídos:
      // todos os artigos ficam como candidatos até uma decisão humana explícita.
      const newCopy: SiloWorkingCopy = {
        ...source,
        id: newId,
        existingSiloId: null,
        source: "new_candidate",
        name: operation.name || `${source.name} suporte`,
        slug: shortSiloSlug(operation.name || `${source.name} suporte`),
        articleReferences: selected.map(reference => ({ ...reference, role: "support", rationale: "Aguardando escolha humana de Pilar." })),
        supportArticleIds: [],
        pillarCandidateArticleId: null,
        reasons: [`Working copy criada pela proposta de divisão da IA: ${operation.justification}`, "Pilar não selecionado: a divisão veio da IA e a escolha do Pilar é humana."],
        conflicts: [],
        publishedProtection: { protected: false, siloPageIds: [], articleIds: [], protectedFields: ["brand", "url", "slug", "canonical"] },
      };
      workingCopies = workingCopies.map(copy => copy.id === source.id ? nextSource : copy).concat(newCopy);
      applied.push(operation.operationId); continue;
    }
    if (["rename", "suggest_slug"].includes(operation.action)) {
      if (published) { rejected.push({ operationId: operation.operationId, reason: "Silo publicado mantém nome/slug estrutural; identidade não pode ser alterada." }); continue; }
      const name = operation.name || source.name;
      const slug = operation.slug ? shortSiloSlug(operation.slug) : source.slug;
      workingCopies[sourceIndex] = { ...source, name, slug, siloPage: { ...source.siloPage, slug }, reasons: [...source.reasons, `Sugestão de nome/slug da IA: ${operation.justification}`] };
      applied.push(operation.operationId); continue;
    }
    if (operation.action === "select_pillar") {
      const pillar = operation.pillarArticleId || operation.articleId;
      if (!pillar || !copyArticleIds(source).includes(pillar)) { rejected.push({ operationId: operation.operationId, reason: "Pilar proposto não pertence ao Silo." }); continue; }
      workingCopies[sourceIndex] = withRoles({ ...source, reasons: [...source.reasons, `IA sugeriu revisar o Pilar: ${operation.justification}`] }, pillar);
      applied.push(operation.operationId); continue;
    }
    if (operation.action === "revise_supports") {
      const pillar = operation.pillarArticleId || source.pillarCandidateArticleId;
      const supports = operation.supportArticleIds || source.supportArticleIds;
      if (!pillar || !copyArticleIds(source).includes(pillar) || !sameIds(supports, copyArticleIds(source).filter(id => id !== pillar))) { rejected.push({ operationId: operation.operationId, reason: "Suportes propostos não cobrem exatamente o Silo." }); continue; }
      workingCopies[sourceIndex] = withRoles({ ...source, reasons: [...source.reasons, `IA sugeriu revisar os Suportes: ${operation.justification}`] }, pillar);
      applied.push(operation.operationId); continue;
    }
    if (operation.action === "eliminate_shallow") {
      if (published || !target) { rejected.push({ operationId: operation.operationId, reason: published ? "Silo publicado não pode ser eliminado." : "Eliminar Silo raso exige destino para preservar os ArticleDNAs." }); continue; }
      const moved = applySiloAiProposal(workingCopies, { ...proposal, operations: [{ ...operation, action: "join" }] }, []).workingCopies;
      workingCopies = moved;
      applied.push(operation.operationId); continue;
    }
    if (operation.action === "verify_verticality") {
      workingCopies[sourceIndex] = { ...source, reasons: [...source.reasons, `Verticalidade revisada pela IA: ${operation.justification}`] };
      applied.push(operation.operationId); continue;
    }
    rejected.push({ operationId: operation.operationId, reason: "Operação não reconhecida." });
  }
  return { workingCopies, applied, rejected };
}
