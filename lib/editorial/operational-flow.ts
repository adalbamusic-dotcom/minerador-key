import { z } from "zod";
import type { ArticleDNA, ContentDocument, SiloDNA, SiloPage, VersionEnvelope, VersionStatusEvent } from "../arquiteto/contracts.ts";
import { ArticleArchitectureStatusSchema, ArticleControlContextSchema, ArticleKeywordReferenceSchema, ArticleKgrIdentitySchema, EditorialUnitTypeSchema, KeywordUrlRelationshipSchema, VersionedContentPlanSchema, VersionedSiloPageSchema } from "../arquiteto/contracts.ts";
import { SerpFormationAssessmentSchema } from "../arquiteto/serp-formation.ts";
import type { ArticleInternalLinks, ResolvedSiloContext } from "../arquiteto/radar-handoff-context.ts";
import type { ArchitectSerpProvenance } from "../arquiteto/radar-handoff-gate.ts";
import { isArticleKeywordCountValid } from "../arquiteto/domain-rules.ts";
/*
 * ===== CORTE 2 · O NÚCLEO DO PIPELINE NÃO IMPORTA MAIS `lib/planejador` =====
 *
 * `createDefinitiveContentPlan` saiu junto com `createOperationalPlan`. E
 * `contentPlanApprovalIssues` deixou de ser re-exportada daqui: quem ainda a
 * usa — o cockpit, para VALIDAR e exibir, nunca para gravar — passou a
 * importá-la do módulo dono. Era o último fio da dependência.
 */
import { RadarHydrationSnapshotSchema, createRadarHydrationSnapshot, type RadarHydrationSnapshot, type RadarHydrationSourceKeyword } from "../radar/hydration.ts";
import { RadarPlannerHandoffSchema, VersionedRadarAnalysisSchema, type RadarPlannerHandoff } from "../radar/analysis-contracts.ts";
import { buildArticleControlContext } from "../arquiteto/strategic-context.ts";

export const WorkflowOriginSchema = z.enum(["real", "local"]);
export const ArchitectWorkflowStateSchema = z.enum(["draft", "analyzing", "conflicts", "awaiting_approval", "approved", "blocked", "sent_radar"]);
/*
 * ===== RADAR_TO_WRITER_HANDOFF_1 · §18 · O DESTINO MUDOU DE NOME =====
 *
 * `sent_writer` entra ao lado de `sent_planner`, e não no lugar dele. Itens
 * enviados ao Planejador antes deste gate existem no banco com aquele estado;
 * retirá-lo do enum faria a leitura recusar a linha inteira e o artigo sumiria
 * da planilha de quem opera.
 *
 * O fluxo NOVO nunca produz `sent_planner`: ele é histórico legível, não
 * destino disponível.
 */
export const RadarWorkflowStateSchema = z.enum(["imported", "research_pending", "researching", "needs_review", "conflicts", "awaiting_approval", "approved", "sent_planner", "sent_writer"]);
export const PlannerWorkflowStateSchema = z.enum(["draft", "planning", "pending", "awaiting_review", "approved", "sent_writer"]);
export const PublicationWorkflowStateSchema = z.enum(["draft", "writing", "awaiting_review", "in_review", "approved", "ready_to_export", "queued", "exported", "published", "update_due", "blocked", "archived"]);
export const PublicationHistoryEntrySchema = z.object({
  id: z.string(),
  action: z.enum(["received", "queued", "exported", "published", "update_requested", "reedited", "destination_registered"]),
  actorId: z.string(),
  occurredAt: z.string().datetime(),
  fromState: PublicationWorkflowStateSchema,
  toState: PublicationWorkflowStateSchema,
  note: z.string().nullable().default(null),
  exportFileName: z.string().nullable().default(null),
  exportFormat: z.enum(["markdown", "json", "csv"]).nullable().default(null),
  destinationUrl: z.string().url().nullable().default(null),
});
export type PublicationHistoryEntry = z.infer<typeof PublicationHistoryEntrySchema>;

export const RadarItemSchema = z.object({
  id: z.string(), brandId: z.string(), articleId: z.string(), articleDnaVersionId: z.string(), articleDnaContentHash: z.string(),
  // O Radar só recebe unidade estruturalmente completa: Silo é obrigatório no
  // handoff, que é posterior a Silos e Links Internos.
  title: z.string(), slug: z.string(), siloId: z.string(), hierarchy: z.string(), principalKeywordId: z.string(), format: z.string(),
  intent: z.string(), state: RadarWorkflowStateSchema, importedAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }), origin: WorkflowOriginSchema, lockVersion: z.number().int().positive().default(1),
  unitType: EditorialUnitTypeSchema.default("article"), hydration: RadarHydrationSnapshotSchema.nullable().default(null), analysisVersions: z.array(VersionedRadarAnalysisSchema).default([]),
  arquitetoKeywordDnaReferences: z.array(ArticleKeywordReferenceSchema).optional(),
  arquitetoKeywordUrlRelations: z.record(z.string(), KeywordUrlRelationshipSchema).optional(),
  arquitetoArchitectureStatus: ArticleArchitectureStatusSchema.optional(),
  arquitetoKgrIdentity: ArticleKgrIdentitySchema.optional(),
  arquitetoStrategyContext: ArticleControlContextSchema.optional(),
  arquitetoSerpAssessment: SerpFormationAssessmentSchema.nullable().optional(),
  /**
   * A proveniência da SERP da FORMAÇÃO — o parecer e a decisão humana.
   *
   * Sem isto o Radar recomeça a conversa do zero e pode "descobrir" a mesma
   * divergência que uma pessoa já viu e decidiu seguir assim.
   */
  arquitetoSerpProvenance: z.object({
    assessmentId: z.string().min(1),
    formationBaseHash: z.string().min(1),
    verdict: z.enum(["COMPATIBLE", "INCONCLUSIVE", "DIVERGENCE"]),
    humanResolution: z.object({
      decision: z.string().min(1), reason: z.string().min(1),
      decidedBy: z.string().min(1), decidedAt: z.string().min(1),
    }).strict().nullable(),
  }).strict().nullable().optional(),
  /**
   * As relações internas APROVADAS que envolvem este Article.
   *
   * `anchorConcepts` é universo permitido de formulação, nunca a âncora final
   * nem quantidade ou posição de link: essas três são pergunta do Radar.
   */
  arquitetoInternalLinks: z.object({
    graphId: z.string().min(1),
    graphVersionId: z.string().min(1),
    graphContentHash: z.string().min(1),
    edges: z.array(z.object({
      sourceNodeId: z.string().min(1), targetNodeId: z.string().min(1),
      relationType: z.string().min(1), anchorConcepts: z.array(z.string().min(1)),
      reason: z.string().min(1), priority: z.string().min(1),
      direction: z.enum(["outbound", "inbound"]),
    }).strict()),
  }).strict().nullable().optional(),
});
export const PlannerItemSchema = z.object({
  id: z.string(), brandId: z.string(), articleId: z.string(), radarItemId: z.string(), title: z.string(), slug: z.string(), siloId: z.string(),
  format: z.string(), intent: z.string(), state: PlannerWorkflowStateSchema, contentPlanVersionId: z.string().nullable(), importedAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }), origin: WorkflowOriginSchema, lockVersion: z.number().int().positive().default(1),
  unitType: EditorialUnitTypeSchema.default("article"), radarHandoff: RadarPlannerHandoffSchema.optional(),
});
export const OperationalPublicationSchema = z.object({
  id: z.string(), brandId: z.string(), articleId: z.string(),
  /**
   * ORIGEM PLANEJADOR — nula quando o documento veio do Radar.
   *
   * Eram obrigatorios, e isso impedia documento de origem Radar de entrar em
   * Publicacoes. O banco ja aceitava nulo (`content_plan_version_id` nulavel,
   * e `planner_item_id` nem existe como coluna): o bloqueio era so aqui.
   *
   * Aditivo: registro antigo com os dois preenchidos continua valido.
   */
  plannerItemId: z.string().nullable().default(null),
  contentPlanVersionId: z.string().nullable().default(null),
  /** ORIGEM RADAR — a analise que produziu o documento, quando for o caso. */
  radarOrigin: z.object({
    analysisVersionId: z.string().min(1),
    evidenceBundleHash: z.string().min(1),
  }).strict().nullable().default(null),
  /**
   * CORTE 2 · OBRIGATÓRIO NO CONTRATO, mesmo com a coluna nulável no banco.
   *
   * O preflight mostrou `publication_records.document_id` nulável no schema
   * efetivo: um registro órfão passa no banco. Ele não passa aqui. Publicação
   * sem documento não tem o que exportar nem o que revisar, e ninguém saberia
   * que conteúdo ela representa. `.min(1)` é aditivo — não há linha existente
   * com o campo vazio.
   */
  documentId: z.string().min(1),
  title: z.string(), slug: z.string(), siloId: z.string(), hierarchy: z.string(), state: PublicationWorkflowStateSchema,
  responsible: z.string().nullable(), destination: z.string().nullable(), createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }), origin: WorkflowOriginSchema,
  lockVersion: z.number().int().positive().default(1),
  unitType: EditorialUnitTypeSchema.default("article"),
  destinationUrl: z.string().url().nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
  publishedDocumentHash: z.string().nullable().default(null),
  lastExportDocumentHash: z.string().nullable().default(null),
  lastExportedAt: z.string().datetime().nullable().default(null),
  lastExportFileName: z.string().nullable().default(null),
  lastExportFormat: z.enum(["markdown", "json", "csv"]).nullable().default(null),
  updateRequested: z.boolean().default(false),
  updateRequestedAt: z.string().datetime().nullable().default(null),
  history: z.array(PublicationHistoryEntrySchema).default([]),
}).superRefine((publication, context) => {
  /*
   * TODO REGISTRO DECLARA UMA ORIGEM.
   *
   * A obrigatoriedade do plano garantia isso por acidente. Removida ela, o
   * que sustenta a garantia e esta regra: plano OU Radar. Nenhuma das duas e
   * registro orfao — ninguem saberia de onde o conteudo veio.
   */
  if (!publication.contentPlanVersionId && !publication.radarOrigin) {
    context.addIssue({
      code: "custom",
      path: ["radarOrigin"],
      message: "O registro precisa declarar uma origem: plano editorial ou pacote do Radar.",
    });
  }
});
/**
 * O que o Arquiteto resolveu para este Article antes de entregá-lo.
 *
 * Chega pronto do lado do Arquiteto: aqui não se descobre Silo, não se lê
 * grafo e não se consulta nada. O importador só hidrata.
 */
export type RadarArticleHandoffContext = {
  silo: ResolvedSiloContext;
  internalLinks: ArticleInternalLinks | null;
  serpProvenance: ArchitectSerpProvenance | null;
};

export type RadarItem = z.infer<typeof RadarItemSchema>;
export type PlannerItem = z.infer<typeof PlannerItemSchema>;
export type OperationalPublication = z.infer<typeof OperationalPublicationSchema>;

export const PermissionModuleSchema = z.enum(["marca", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes", "administracao"]);
export const PermissionActionSchema = z.enum(["view", "comment", "create", "edit", "review", "approve", "export", "publish", "manage"]);
export const CollaboratorRoleSchema = z.enum(["owner", "brand_admin", "strategist", "analyst", "planner", "writer", "editor", "reviewer", "eeat_specialist", "medical_reviewer", "publisher", "viewer", "external_collaborator"]);
export const ModulePermissionSchema = z.object({ module: PermissionModuleSchema, actions: z.array(PermissionActionSchema) });
/*
 * DATA DE COLUNA ACEITA DESLOCAMENTO — e não só "Z".
 *
 * O PostgREST devolve `timestamptz` como `2026-09-18T03:51:49.236599+00:00`.
 * `z.string().datetime()` recusa esse formato, e a recusa não ficava no campo:
 * derrubava a validação da mesa inteira, apagando da tela o Radar que estava
 * íntegro. A normalização acontece no leitor (`isoDate`); isto aqui é a rede
 * para quem ler uma coluna nova e esquecer dela.
 */
export const BrandInvitationSchema = z.object({
  id: z.string(), brandId: z.string(), email: z.string().email(), role: CollaboratorRoleSchema, permissions: z.array(ModulePermissionSchema),
  status: z.enum(["pending", "accepted", "expired", "cancelled", "suspended", "revoked"]), expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }), createdBy: z.string(), delivery: z.enum(["development_adapter", "provider_sent", "not_sent"]), tokenId: z.string(),
});
export type BrandInvitation = z.infer<typeof BrandInvitationSchema>;

export function effectiveVersionStatus(versionId: string, events: VersionStatusEvent[]) {
  return events.filter(event => event.versionId === versionId).at(-1)?.status || null;
}

export function mergeVersionEvents(current: VersionStatusEvent[], incoming: VersionStatusEvent[]) {
  const indexed = new Map<string, { event: VersionStatusEvent; order: number }>();
  [...current, ...incoming].forEach((event, order) => indexed.set(event.eventId, { event, order }));
  return [...indexed.values()].sort((left, right) => {
    const byDate = left.event.occurredAt.localeCompare(right.event.occurredAt);
    return byDate || left.order - right.order;
  }).map(item => item.event);
}

export function hasHumanApproval(versionId: string, events: VersionStatusEvent[]) {
  return effectiveVersionStatus(versionId, events) === "approved";
}

export function articleApprovalIssues(version: VersionEnvelope<ArticleDNA>, events: VersionStatusEvent[], blockingConflicts = 0) {
  const article = version.payload; const issues: string[] = [];
  const principal = article.keywordReferences.filter(reference => reference.role === "principal");
  if (principal.length !== 1) issues.push("O artigo precisa de exatamente uma keyword principal.");
  if (!isArticleKeywordCountValid(article.keywordReferences.length)) issues.push("O artigo precisa ter entre 1 e 6 keywords.");
  // Silo e hierarquia Pilar/Suporte pertencem à etapa Silos, posterior a
  // Artigos. Exigi-los aqui criava dependência circular: o artigo não fechava
  // sem Silo e o Silo só nasce depois do ArticleDNA aprovado.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.suggestedSlug)) issues.push("O slug precisa ser válido.");
  if (blockingConflicts > 0) issues.push("Existem conflitos bloqueadores.");
  if (!hasHumanApproval(version.versionId, events)) issues.push("A versão ainda não recebeu aprovação humana.");
  return issues;
}

export function approvedArticleVersions(versions: Record<string, VersionEnvelope<ArticleDNA>>, events: VersionStatusEvent[]) {
  return Object.values(versions).filter(version => articleApprovalIssues(version, events).length === 0);
}

/**
 * Preflight para geracao de SiloDNA.
 *
 * Nao exige que cada ArticleDNA possua status separado de "aceite" ou
 * "approved". Exige apenas:
 * - ArticleDNA existente;
 * - contrato valido (ja garantido por VersionEnvelope<ArticleDNA>);
 * - marca correta;
 * - silo definido (sem-silo bloqueia);
 * - artigos agrupados por silo.
 *
 * Retorna os silos validos e a lista de issues especificos por artigo.
 */
export function siloDnaPreflight(
  articleVersions: Record<string, VersionEnvelope<ArticleDNA>>,
  groups: Array<{
    id: string;
    publishedAnchorId: string | null;
    suggestedSiloId: string | null;
    suggestedSiloName: string | null;
    keywords: Array<{ id: string; keyword: string }>;
  }>,
  brandId: string,
): { silos: Array<{ id: string; name: string; articleVersions: VersionEnvelope<ArticleDNA>[] }>; issues: string[] } {
  const siloMap = new Map<string, { id: string; name: string; articleVersions: VersionEnvelope<ArticleDNA>[] }>();
  const issues: string[] = [];
  for (const group of groups) {
    const entityId = group.publishedAnchorId || group.id;
    const articleVersion = articleVersions[entityId];
    if (!articleVersion) {
      issues.push(`ArticleDNA ausente para "${group.keywords[0]?.keyword || entityId}".`);
      continue;
    }
    if (articleVersion.payload.brandId !== brandId) {
      issues.push(`Marca incorreta para "${articleVersion.payload.promise}".`);
      continue;
    }
    const siloId = group.suggestedSiloId;
    if (!siloId) {
      issues.push(`Sem silo definido para "${articleVersion.payload.promise}".`);
      continue;
    }
    const id = String(siloId);
    const current = siloMap.get(id) || { id, name: group.suggestedSiloName || "Silo", articleVersions: [] };
    current.articleVersions.push(articleVersion);
    siloMap.set(id, current);
  }
  return { silos: [...siloMap.values()], issues };
}

/**
 * O Silo do RadarItem é RESOLVIDO, não exigido do ArticleDNA.
 *
 * Filtrar por `payload.siloId` descartava em silêncio todo Article cujo Silo
 * canônico nasce da consolidação — ou seja, todos eles: o `siloId` mora no
 * SiloDNA, e o que liga os dois é o `territoryRef` que ambos declaram.
 * Preencher o campo no ArticleDNA para o importador enxergar seria alterar o
 * artefato de cima por conveniência de quem lê embaixo.
 */
export function importArticlesToRadar(existing: RadarItem[], versions: VersionEnvelope<ArticleDNA>[], brandId: string, now = new Date().toISOString(), sourceKeywords: RadarHydrationSourceKeyword[] = [], siloVersions: Record<string, VersionEnvelope<SiloDNA>> = {}, hydrationByArticleId: Record<string, RadarHydrationSnapshot> = {}, serpAssessments: Record<string, unknown> = {}, handoffContext: Record<string, RadarArticleHandoffContext> = {}) {
  const existingIds = new Set(existing.map(item => item.articleId));
  const siloIdOf = (version: VersionEnvelope<ArticleDNA>) =>
    handoffContext[version.payload.articleId]?.silo.siloId || version.payload.siloId || null;
  const additions = versions.filter(version => version.payload.brandId === brandId && !existingIds.has(version.payload.articleId) && Boolean(siloIdOf(version))).map(version => RadarItemSchema.parse({
    id: `radar:${version.payload.articleId}`, brandId, articleId: version.payload.articleId, articleDnaVersionId: version.versionId,
    articleDnaContentHash: version.contentHash, title: version.payload.promise, slug: version.payload.suggestedSlug, siloId: siloIdOf(version)!,
    hierarchy: version.payload.hierarchy, principalKeywordId: version.payload.principalKeywordId, format: version.payload.hierarchy,
    intent: version.payload.mainIntent, state: "research_pending", importedAt: now, updatedAt: now, origin: "local", lockVersion: 1,
    hydration: hydrationByArticleId[version.payload.articleId] || createRadarHydrationSnapshot({ brandId, article: version, sourceKeywords, silo: siloIdOf(version) ? siloVersions[siloIdOf(version)!] : undefined, resolvedSilo: handoffContext[version.payload.articleId]?.silo ?? null, source: "arquiteto_import", capturedAt: now }),
    arquitetoKeywordDnaReferences: version.payload.keywordReferences,
    arquitetoKeywordUrlRelations: Object.fromEntries(version.payload.keywordReferences.filter(reference => reference.keywordUrlRelation).map(reference => [reference.keywordId, reference.keywordUrlRelation])),
    arquitetoArchitectureStatus: version.payload.architectureStatus,
    arquitetoKgrIdentity: version.payload.kgrIdentity,
    arquitetoStrategyContext: buildArticleControlContext(version.payload, { published: Boolean(version.payload.publishedIdentityRef) }),
    arquitetoSerpAssessment: serpAssessments[version.payload.articleId] || null,
    arquitetoSerpProvenance: handoffContext[version.payload.articleId]?.serpProvenance ?? null,
    arquitetoInternalLinks: handoffContext[version.payload.articleId]?.internalLinks ?? null,
  }));
  return [...existing, ...additions];
}

export function setRadarState(items: RadarItem[], ids: string[], target: RadarItem["state"], now = new Date().toISOString()) {
  const allowed: Record<RadarItem["state"], RadarItem["state"][]> = {
    imported: ["research_pending"], research_pending: ["researching", "awaiting_approval"], researching: ["needs_review", "conflicts"],
    needs_review: ["awaiting_approval", "conflicts"], conflicts: ["needs_review"], awaiting_approval: ["approved", "needs_review"],
    /*
     * §18 · `approved → sent_writer` é a transição do fluxo vigente.
     *
     * CORTE 2 · `approved → sent_planner` SAIU. O valor continua no enum
     * porque linha antiga precisa fazer parse, e `sent_planner → approved`
     * continua existindo pela mesma razão: um artigo entregue ao Planejador no
     * fluxo antigo precisa conseguir seguir pelo novo. O que deixou de existir
     * é o caminho de ENTRADA — nada mais chega a `sent_planner`.
     */
    approved: ["sent_writer", "needs_review"],
    sent_planner: ["approved"],
    sent_writer: ["approved"],
  };
  return items.map(item => ids.includes(item.id) && allowed[item.state].includes(target) ? { ...item, state: target, updatedAt: now, lockVersion: item.lockVersion + 1 } : item);
}

function approvedHandoffForRadarItem(item: RadarItem, brandId: string): RadarPlannerHandoff | undefined {
  const versions = item.analysisVersions.filter(version => version.payload.status === "approved").sort((left, right) => right.versionNumber - left.versionNumber);
  for (const version of versions) {
    const parsed = RadarPlannerHandoffSchema.safeParse(version.payload.plannerPackage);
    if (parsed.success && parsed.data.status === "APPROVED" && parsed.data.brandId === brandId && parsed.data.radarItemId === item.id && parsed.data.articleId === item.articleId && parsed.data.articleDnaVersionId === item.articleDnaVersionId) return parsed.data;
  }
  return undefined;
}

export function importRadarToPlanner(existing: PlannerItem[], radarItems: RadarItem[], brandId: string, now = new Date().toISOString(), handoffs: Record<string, RadarPlannerHandoff> = {}) {
  const existingIds = new Set(existing.map(item => item.articleId));
  const additions = radarItems.filter(item => item.brandId === brandId && item.state === "approved" && !existingIds.has(item.articleId)).map(item => PlannerItemSchema.parse({
    id: `planner:${item.articleId}`, brandId, articleId: item.articleId, radarItemId: item.id, title: item.title, slug: item.slug,
    siloId: item.siloId, format: item.format, intent: item.intent, state: "draft", contentPlanVersionId: null,
    importedAt: now, updatedAt: now, origin: "local", lockVersion: 1, radarHandoff: handoffs[item.id] || approvedHandoffForRadarItem(item, brandId),
  }));
  return [...existing, ...additions];
}

/**
 * ===== CORTE 2 · A PUBLICAÇÃO NASCE DO DOCUMENTO =====
 *
 * `createOperationalPlan`, `createOperationalDocument` e `createPublicationDraft`
 * saíram juntas. As três pediam `PlannerItem` e as duas últimas fabricavam
 * artefato v1: documento com `contentPlanRef` obrigatório e registro de
 * publicação amarrado a um plano. Nenhuma tinha dado a preservar — o banco real
 * mostrou zero `content_plan`, zero `planner` e zero `publication_records`.
 *
 * A autoridade agora é ContentDocument + origem Radar + estado atual.
 *
 * `plannerItemId` e `contentPlanVersionId` continuam no schema, **nulos**. Eles
 * descrevem registro antigo; não são exigência de registro novo. A invariante
 * "todo registro declara alguma origem" continua valendo — pelo `radarOrigin`.
 *
 * O v2 é EXIGIDO, não assumido: um documento v1 chegando aqui significaria que
 * alguém reabriu o caminho do Planejador, e o erro precisa dizer isso em vez de
 * fabricar uma publicação sem origem declarável.
 */
export function createWriterPublication(input: { brandId: string; document: ContentDocument; article: VersionEnvelope<ArticleDNA> }, now = new Date().toISOString()) {
  const { brandId, document, article } = input;
  if (document.schemaVersion !== 2) throw new Error("Publicação nova exige documento v2 de origem Radar.");
  const articleId = document.articleDnaRef.entityId;
  return OperationalPublicationSchema.parse({
    id: `publication:${articleId}`, brandId, articleId,
    plannerItemId: null, contentPlanVersionId: null,
    /*
     * PROJEÇÃO, e não repasse do objeto inteiro.
     *
     * `RadarDocumentOrigin` tem dez campos; `OperationalPublication.radarOrigin`
     * é `.strict()` e quer dois. Passar o objeto todo parece inofensivo e é
     * recusado no parse — e seria pior se passasse: o registro de publicação
     * viraria uma segunda cópia da origem, livre para divergir do documento.
     */
    radarOrigin: { analysisVersionId: document.radarOrigin.analysisVersionId, evidenceBundleHash: document.radarOrigin.evidenceBundleHash },
    documentId: document.id, title: document.title,
    slug: document.metadata.slug || article.payload.suggestedSlug,
    siloId: document.siloDnaRef.entityId, hierarchy: article.payload.hierarchy,
    state: "draft", responsible: null, destination: null,
    createdAt: now, updatedAt: now, origin: "local", lockVersion: 1,
  });
}

export function importApprovedWriterItems(items: OperationalPublication[], ids: string[], now = new Date().toISOString()) {
  return items.map(item => ids.includes(item.id) && item.state === "approved"
    ? { ...item, state: "ready_to_export" as const, updatedAt: now, lockVersion: item.lockVersion + 1 }
    : item);
}

export function validateInvitationAccess(invitation: BrandInvitation, module: z.infer<typeof PermissionModuleSchema>, action: z.infer<typeof PermissionActionSchema>, now = new Date()) {
  if (["cancelled", "suspended", "revoked", "expired"].includes(invitation.status)) return false;
  if (new Date(invitation.expiresAt) <= now) return false;
  return invitation.permissions.some(permission => permission.module === module && permission.actions.includes(action));
}

export function createDevelopmentInvitation(input: Omit<BrandInvitation, "id" | "createdAt" | "delivery" | "tokenId" | "status">, now = new Date()) {
  return BrandInvitationSchema.parse({ ...input, id: crypto.randomUUID(), createdAt: now.toISOString(), status: "pending", delivery: "development_adapter", tokenId: crypto.randomUUID() });
}

export function parseOperationalPlan(value: unknown) { return VersionedContentPlanSchema.parse(value); }

// --- Reconciliacao do workspace do Arquiteto ---
import { ArchitectArticleDnaRecoverySchema, architectArticleDnaRecoveryKey } from "./architect-recovery.ts";
import { readBrowserArtifactReadOnly } from "./browser-artifact-store.ts";

interface ReconcileInput {
  storedImportedKeywordIds: string[];
  articleDnasFromMemory: Record<string, VersionEnvelope<ArticleDNA>>;
  brandId: string;
  actorUserId?: string;
}

interface ReconcileOutput {
  effectiveKeywordIds: Set<string>;
  source: "localStorage" | "memory_dnas" | "indexeddb_dnas" | "empty";
  counts: { localStorage: number; memoryDnas: number; indexedDbDnas: number };
}

export async function reconcileArchitectWorkspace(input: ReconcileInput): Promise<ReconcileOutput> {
  const counts = { localStorage: 0, memoryDnas: 0, indexedDbDnas: 0 };

  const fromLocalStorage = new Set(input.storedImportedKeywordIds);
  counts.localStorage = fromLocalStorage.size;

  const fromMemoryDnas = new Set<string>();
  for (const version of Object.values(input.articleDnasFromMemory)) {
    for (const ref of version.payload.keywordReferences) {
      fromMemoryDnas.add(ref.keywordId);
    }
  }
  counts.memoryDnas = fromMemoryDnas.size;

  const fromIndexedDbDnas = new Set<string>();
  if (fromLocalStorage.size === 0 && fromMemoryDnas.size === 0 && input.actorUserId) {
    try {
      const raw = await readBrowserArtifactReadOnly(architectArticleDnaRecoveryKey(input.actorUserId, input.brandId));
      if (raw) {
        const recovered = ArchitectArticleDnaRecoverySchema.parse(raw);
        for (const version of Object.values(recovered.versions)) {
          const typed = version as VersionEnvelope<ArticleDNA>;
          for (const ref of typed.payload.keywordReferences) {
            fromIndexedDbDnas.add(ref.keywordId);
          }
        }
      }
    } catch {
      // IndexedDB invalido nao impede o carregamento
    }
  }
  counts.indexedDbDnas = fromIndexedDbDnas.size;

  const effectiveKeywordIds = new Set([...fromLocalStorage, ...fromMemoryDnas, ...fromIndexedDbDnas]);

  const source: ReconcileOutput["source"] =
    fromLocalStorage.size > 0 ? "localStorage"
    : fromMemoryDnas.size > 0 ? "memory_dnas"
    : fromIndexedDbDnas.size > 0 ? "indexeddb_dnas"
    : "empty";

  return { effectiveKeywordIds, source, counts };
}

// ─── SiloPage: fluxo pipeline como unidade editorial ─────────────────────────

export function siloPageApprovalIssues(version: VersionEnvelope<SiloPage>, events: VersionStatusEvent[]) {
  const page = version.payload; const issues: string[] = [];
  if (!page.slug) issues.push("A página do silo precisa de um slug válido.");
  if (!page.h1) issues.push("A página do silo precisa de um H1.");
  if (!page.seoTitle) issues.push("A página do silo precisa de um título SEO.");
  if (!page.metaDescription) issues.push("A página do silo precisa de uma meta description.");
  if (!page.intro) issues.push("A página do silo precisa de um texto introdutório.");
  if (!page.siloDnaRef.versionId) issues.push("A página do silo precisa de um SiloDNA referenciado.");
  if (!hasHumanApproval(version.versionId, events)) issues.push("A versão ainda não recebeu aprovação humana.");
  return issues;
}

export function approvedSiloPageVersions(versions: Record<string, VersionEnvelope<SiloPage>>, events: VersionStatusEvent[]) {
  return Object.values(versions).filter(version => siloPageApprovalIssues(version, events).length === 0);
}

export function importSiloPagesToRadar(existing: RadarItem[], versions: VersionEnvelope<SiloPage>[], brandId: string, now = new Date().toISOString()) {
  const existingIds = new Set(existing.map(item => item.articleId));
  const additions = versions.filter(version => version.payload.brandId === brandId && !existingIds.has(version.payload.siloPageId)).map(version => RadarItemSchema.parse({
    id: `radar:${version.payload.siloPageId}`, brandId, articleId: version.payload.siloPageId, articleDnaVersionId: version.versionId,
    articleDnaContentHash: version.contentHash, title: version.payload.h1, slug: version.payload.slug, siloId: version.payload.siloId,
    hierarchy: "SiloPage", principalKeywordId: version.payload.siloId, format: "silo_page", intent: "navigacional",
    state: "research_pending", importedAt: now, updatedAt: now, origin: "local" as const, lockVersion: 1, unitType: "silo_page" as const,
  }));
  return [...existing, ...additions];
}

export function parseSiloPageVersion(value: unknown) { return VersionedSiloPageSchema.parse(value); }
