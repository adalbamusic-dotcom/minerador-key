import type { ArticleDNA, ContentPlan, ContentPlanDetails, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { PlannerItem } from "../editorial/operational-flow.ts";
import { calculateOutlineMetrics, validateOutline } from "./outline.ts";
import type { PlannerHydration } from "./hydration.ts";
import { isDefinitiveContentPlan } from "./content-plan.ts";
import type { PlannerPublicationIdentity } from "./publication-identity.ts";
import { buildKeywordStrategySnapshot, keywordStrategyIssues } from "./keyword-strategy.ts";

export type CockpitStep = "context" | "strategy" | "structure" | "resources" | "review";
export type CockpitAlertKind = "aviso" | "pendencia" | "conflito" | "bloqueio";
export type CockpitAlert = { kind: CockpitAlertKind; message: string; step: CockpitStep };
export type CockpitCriterion = { id: string; label: string; done: boolean; applicable: boolean; kind: CockpitAlertKind; step: CockpitStep };

const workflowLabels: Record<string, string> = { draft: "Rascunho", planning: "Em planejamento", pending: "Pendente", awaiting_review: "Aguardando revisão", approved: "Aprovado", sent_writer: "Enviado ao Redator" };
const publicationLabels: Record<string, string> = { not_started: "Situação de publicação não confirmada", draft: "Rascunho de publicação", writing: "Em redação", approved: "Aprovado para publicação", published: "Publicado protegido", published_protected: "Publicado protegido", update_due: "Atualização disponível" };
const transferLabels: Record<string, string> = { not_sent: "Não enviado", sent_to_writer: "Enviado ao Redator", update_available: "Atualização disponível", transfer_conflict: "Verificar transferência" };

function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }

export function findDefinitiveContentPlan(plans: Record<string, VersionEnvelope<ContentPlan>>, id: string) {
  const values = Object.values(plans);
  const exact = values.find(plan => plan.versionId === id && isDefinitiveContentPlan(plan));
  if (exact) return exact;
  return values.filter(plan => plan.entityId === id && isDefinitiveContentPlan(plan)).sort((left, right) => right.versionNumber - left.versionNumber)[0] || null;
}

export function outlineOverlapAlerts(details: ContentPlanDetails): string[] {
  const sections = details.structure.sections;
  const alerts: string[] = [];
  for (let index = 0; index < sections.length; index += 1) {
    const current = normalized(sections[index].decidedHeading || sections[index].heading);
    if (!current) continue;
    for (const previous of sections.slice(0, index)) {
      const other = normalized(previous.decidedHeading || previous.heading);
      const currentWords = new Set(current.split(" ")); const otherWords = new Set(other.split(" "));
      const overlap = [...currentWords].filter(word => otherWords.has(word)).length / Math.max(currentWords.size, otherWords.size, 1);
      if (current === other || overlap >= 0.75) alerts.push(`Sobreposição entre “${previous.heading}” e “${sections[index].heading}”.`);
    }
  }
  return [...new Set(alerts)];
}

function sectionCoverage(details: ContentPlanDetails) {
  const sectionIds = new Set(details.structure.sections.map(section => section.id));
  const questions = details.questions || [];
  const entities = details.entities || [];
  const coveredQuestions = questions.filter(item => item.sectionId && sectionIds.has(item.sectionId) && item.status !== "rejected").length;
  const coveredEntities = entities.filter(item => item.sectionId && sectionIds.has(item.sectionId) && item.status !== "rejected").length;
  return { questions, entities, coveredQuestions, coveredEntities };
}

export function buildCockpitViewModel(input: { item: PlannerItem; plan: VersionEnvelope<ContentPlan>; hydration: PlannerHydration; approvalIssues: string[]; documentExists: boolean; article?: VersionEnvelope<ArticleDNA> | null; publicationState?: string | null; publicationIdentity?: PlannerPublicationIdentity | null }) {
  const details = input.plan.payload.planning;
  if (!details) throw new Error("O cockpit exige um ContentPlan definitivo.");
  const metrics = calculateOutlineMetrics(details);
  const outlineValidation = validateOutline(details);
  const coverage = sectionCoverage(details);
  const publicationState = input.publicationIdentity?.state === "published" ? "published" : input.publicationIdentity?.state === "conflict" ? "conflict" : input.publicationIdentity?.state === "unknown" ? "unknown" : "new";
  const keywordStrategy = details.keywordStrategy || (input.article ? buildKeywordStrategySnapshot({ article: input.article.payload, details, publicationState, keywordLabels: { [input.hydration.primaryKeyword.technical.id]: input.hydration.primaryKeyword.label, ...Object.fromEntries(input.hydration.secondaryKeywords.map(reference => [reference.technical.id, reference.label])) } }) : null);
  const sourcePending = details.sources.filter(source => source.status === "needs_source").length;
  const unhydratedLinkReferences = details.structure.sections.flatMap(section => section.internalLinks || []).length;
  const linkReferenceCount = details.internalLinks.length + unhydratedLinkReferences;
  const structuredLinkPending = details.internalLinks.filter(link => link.status !== "approved").length;
  const linkPending = structuredLinkPending + unhydratedLinkReferences;
  const gabaritoInformative = Boolean(details.gabarito && (details.gabarito.globalWords.min !== null || details.gabarito.globalWords.ideal !== null || details.gabarito.globalWords.max !== null || details.gabarito.estimatedParagraphs !== null));
  const radarRequired = details.radar.analysisEnforcement === "required";
  const radarApproved = input.hydration.radar.origin === "real" && input.hydration.radar.review === "approved";
  const workflow = workflowLabels[input.item.state] || "Estado editorial pendente";
  const identity = input.publicationIdentity || null;
  const publication = identity?.label || (input.publicationState && input.publicationState !== "not_started" ? publicationLabels[input.publicationState] : null) || (input.hydration.publicationStatus !== "not_started" ? input.hydration.publicationStatus : publicationLabels.not_started);
  const transferRaw = input.documentExists ? (input.item.state === "sent_writer" ? "sent_to_writer" : "sent_to_writer") : input.hydration.transferStatus;
  const transfer = transferLabels[transferRaw] || "Transferência pendente";
  const alerts: CockpitAlert[] = [];
  if (identity?.state === "conflict") alerts.push({ kind: "bloqueio", message: "Há registros divergentes sobre a publicação. Reconcilie a origem antes de aprovar ou alterar a identidade.", step: "review" });
  if (identity?.state === "unknown") alerts.push({ kind: "pendencia", message: "A situação de publicação não foi confirmada; a identidade permanecerá protegida até a verificação.", step: "resources" });
  if (identity?.protected) {
    if (details.brandId !== identity.brandId) alerts.push({ kind: "bloqueio", message: "A marca do conteúdo publicado não corresponde à origem confirmada.", step: "resources" });
    if (details.articleId !== identity.articleId) alerts.push({ kind: "bloqueio", message: "O artigo vinculado não corresponde à publicação confirmada.", step: "resources" });
    if (identity.siloId && details.siloId !== identity.siloId) alerts.push({ kind: "bloqueio", message: "O silo vinculado à publicação não pode ser trocado.", step: "resources" });
    if (identity.slug && details.metadata.slug !== identity.slug) alerts.push({ kind: "bloqueio", message: "O slug atual diverge do slug publicado e precisa ser reconciliado.", step: "resources" });
    if (identity.canonical && details.metadata.canonical !== identity.canonical) alerts.push({ kind: "bloqueio", message: "O canonical atual diverge do canonical publicado e precisa ser reconciliado.", step: "resources" });
  }
  if (!input.hydration.primaryKeyword.hydrated) alerts.push({ kind: "bloqueio", message: "Hidrate a keyword principal antes da aprovação.", step: "context" });
  if (input.hydration.conflicts.length) alerts.push(...input.hydration.conflicts.map(message => ({ kind: "conflito" as const, message, step: "context" as const })));
  if (input.hydration.radar.origin === "absent") alerts.push({ kind: radarRequired ? "bloqueio" : "aviso", message: radarRequired ? "A SERP exigida pelo fluxo ainda não foi aprovada." : "A SERP ainda não possui aprovação humana.", step: "context" });
  if (outlineValidation.orphanH3.length) alerts.push({ kind: "bloqueio", message: "Existe H3 órfão sem H2 anterior.", step: "structure" });
  if (outlineValidation.emptyH2.length) alerts.push({ kind: "bloqueio", message: "Existe H2 sem título.", step: "structure" });
  if (outlineOverlapAlerts(details).length) alerts.push(...outlineOverlapAlerts(details).map(message => ({ kind: "conflito" as const, message, step: "structure" as const })));
  if (!details.structure.h1.trim()) alerts.push({ kind: "bloqueio", message: "Defina o H1.", step: "structure" });
  if (!details.structure.sections.some(section => section.level === 2)) alerts.push({ kind: "bloqueio", message: "Crie pelo menos uma seção principal H2.", step: "structure" });
  if (details.structure.sections.some(section => !section.objective.trim())) alerts.push({ kind: "bloqueio", message: "Defina o objetivo de todas as seções.", step: "structure" });
  if (coverage.questions.some(item => item.priority === "required" && (!item.sectionId || item.status === "pending"))) alerts.push({ kind: "bloqueio", message: "Associe as perguntas obrigatórias ao outline.", step: "resources" });
  if (sourcePending) alerts.push({ kind: "bloqueio", message: `${sourcePending} fonte(s) necessária(s) antes da aprovação.`, step: "resources" });
  if (structuredLinkPending) alerts.push({ kind: "pendencia", message: `${structuredLinkPending} link(s) estruturado(s) ainda não foram aprovados.`, step: "resources" });
  if (!details.cta.text.trim() || details.cta.text.toLowerCase().includes("pendente")) alerts.push({ kind: "bloqueio", message: "Defina o CTA principal.", step: "strategy" });
  if (!gabaritoInformative) alerts.push({ kind: "bloqueio", message: "Defina uma estimativa de extensão no gabarito.", step: "structure" });
  if (!details.images.length) alerts.push({ kind: "aviso", message: "Nenhuma imagem foi planejada.", step: "resources" });
  if (!details.sources.length) alerts.push({ kind: "aviso", message: "Nenhuma fonte planejada; marque Fonte necessária quando houver claim.", step: "resources" });
  if (!linkReferenceCount) alerts.push({ kind: "aviso", message: "Nenhum link interno planejado.", step: "resources" });
  if (unhydratedLinkReferences) alerts.push({ kind: "pendencia", message: `${unhydratedLinkReferences} referência(s) de link interno aguardam hidratação de destino estruturado.`, step: "resources" });
  if (metrics.estimatedParagraphs === null) alerts.push({ kind: "pendencia", message: "O gabarito ainda não possui estimativa de parágrafos.", step: "structure" });
  if (keywordStrategy) {
    for (const issue of keywordStrategyIssues(keywordStrategy, input.article?.payload || null)) {
      alerts.push({ kind: issue.includes("conflit") || issue.includes("diverge") ? "bloqueio" : "pendencia", message: issue, step: "strategy" });
    }
    if (keywordStrategy.volume.coverage !== "complete") alerts.push({ kind: "pendencia", message: `${keywordStrategy.volume.label}: ${keywordStrategy.volume.knownCount} de ${keywordStrategy.volume.totalCount} volumes conhecidos.`, step: "context" });
    if (keywordStrategy.kgr.status === "unknown") alerts.push({ kind: "aviso", message: "A classificação KGR não foi recebida do Minerador/ArticleDNA; nenhum score foi inferido.", step: "context" });
    if (keywordStrategy.coverage.some(item => item.role !== "principal" && item.status === "unassigned")) alerts.push({ kind: "pendencia", message: "Há keyword(s) de apoio sem associação a seção, tópico, pergunta, entidade ou objeção.", step: "strategy" });
  }
  const criteria: CockpitCriterion[] = [
    { id: "keyword", label: "Keyword principal hidratada", done: input.hydration.primaryKeyword.hydrated, applicable: true, kind: "bloqueio", step: "context" },
    { id: "strategy", label: "Estratégia definida", done: Boolean(details.strategy.primaryIntent && details.strategy.promise && details.strategy.angle), applicable: true, kind: "bloqueio", step: "strategy" },
    { id: "keyword-strategy", label: "Principal e apoios interpretados", done: Boolean(keywordStrategy && keywordStrategyIssues(keywordStrategy, input.article?.payload || null).length === 0), applicable: Boolean(keywordStrategy), kind: "bloqueio", step: "strategy" },
    { id: "outline", label: "H1 e H2 com objetivo", done: Boolean(details.structure.h1.trim() && details.structure.sections.some(section => section.level === 2) && details.structure.sections.every(section => section.objective.trim())), applicable: true, kind: "bloqueio", step: "structure" },
    { id: "gabarito", label: "Gabarito com extensão", done: gabaritoInformative, applicable: true, kind: "bloqueio", step: "structure" },
    { id: "questions", label: "Perguntas obrigatórias cobertas", done: !coverage.questions.some(item => item.priority === "required" && (!item.sectionId || item.status === "pending")), applicable: coverage.questions.some(item => item.priority === "required"), kind: "bloqueio", step: "resources" },
    { id: "sources", label: "Claims com fonte ou necessidade marcada", done: sourcePending === 0, applicable: details.sources.length > 0, kind: "bloqueio", step: "resources" },
    { id: "conflicts", label: "Conflitos resolvidos", done: input.hydration.conflicts.length === 0, applicable: true, kind: "conflito", step: "review" },
    { id: "validated", label: "Gate editorial validado", done: input.approvalIssues.length === 0 && !alerts.some(alert => alert.kind === "bloqueio"), applicable: true, kind: "bloqueio", step: "review" },
  ];
  const applicable = criteria.filter(criterion => criterion.applicable);
  const completed = applicable.filter(criterion => criterion.done).length;
  const progress = applicable.length ? Math.round(completed / applicable.length * 100) : 0;
  const blockingAlerts = alerts.filter(alert => alert.kind === "bloqueio");
  const pendingAlerts = alerts.filter(alert => alert.kind === "pendencia");
  const conflicts = alerts.filter(alert => alert.kind === "conflito");
  const next = blockingAlerts[0] || pendingAlerts[0] || conflicts[0] || (input.item.state === "awaiting_review" ? { kind: "aviso" as const, message: "Plano pronto para aprovação.", step: "review" as const } : input.item.state === "approved" && !input.documentExists ? { kind: "aviso" as const, message: "Envie a versão aprovada ao Redator.", step: "review" as const } : { kind: "aviso" as const, message: "Revise o resumo e valide o plano.", step: "review" as const });
  return {
    details, metrics, coverage, keywordStrategy, alerts: [...new Map(alerts.map(alert => [`${alert.kind}:${alert.message}`, alert])).values()], criteria, progress, publicationIdentity: identity,
    alertCounts: { avisos: alerts.filter(alert => alert.kind === "aviso").length, pendencias: pendingAlerts.length, conflitos: conflicts.length, bloqueios: blockingAlerts.length },
    nextAction: next, canApprove: input.item.state === "awaiting_review" && blockingAlerts.length === 0 && input.approvalIssues.length === 0,
    status: { workflow, publication, transfer, transferRaw },
    radarRequired, radarApproved, linkPending, linkReferenceCount, sourcePending, gabaritoInformative,
  };
}
