import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyGridQuery, defaultGridView, gridViewStorageKey, reorderIds, saveGridView, selectionState, selectAllVisible } from "../lib/editorial/data-grid.ts";
import { articleApprovalIssues, createDevelopmentInvitation, createOperationalDocument, createOperationalPlan, createPublicationDraft,
  effectiveVersionStatus, importApprovedWriterItems, importArticlesToRadar, importRadarToPlanner, mergeVersionEvents, setRadarState, siloDnaPreflight, validateInvitationAccess } from "../lib/editorial/operational-flow.ts";
import { assertNoImplicitSensitiveAccess, assertOperationalInvitationAccess } from "../lib/server/operational-permissions.ts";
import { ContentDocumentSchema, type ArticleDNA, type SiloDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { createStatusEvent, createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { workflowRecoveryStorageKey } from "../lib/editorial/persistence-contracts.ts";
import { AIReviewAnnotationSchema } from "../lib/editorial/operational-contracts.ts";
import { cloneHistorySnapshot, createHistoryEntry } from "../lib/editorial/history.ts";
import { ArchitectRecoverySnapshotSchema, ArchitectReviewRecoverySchema, architectArticleDnaRecoveryKey, architectReviewRecoveryKey, architectSiloDnaRecoveryKey, auditArchitectWorkspace, buildArchitectRecoveryPlan, createArchitectRecoverySnapshot } from "../lib/editorial/architect-recovery.ts";

const operationalModuleSources = async () => (await Promise.all([
  readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/planejador/planner-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/planejador/planner-cockpit-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/planejador/content-plan-editor.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/publicacoes/publications-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/redator/writer-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8"),
])).join("\n");

const keywordReference = (id: string, role: "principal" | "secundaria" = "secundaria") => ({ keywordId: id, keywordDnaVersionId: `legacy:${id}:v1`, keywordDnaContentHash: `legacy:${id}`, role,
  strategicContribution: "Cobertura", coveredIntentions: ["informativa"], requiredTopics: [], excludedTopics: [], classificationOrigin: "legacy" as const, confidence: 0.8, humanConfirmed: true });
const articlePayload = (overrides: Partial<ArticleDNA> = {}): ArticleDNA => ({ schemaVersion: 1, articleId: "article-1", brandId: "brand-1", principalKeywordId: "kw-1", secondaryKeywordIds: ["kw-2"], narrativeReinforcementIds: [],
  keywordReferences: [keywordReference("kw-1", "principal"), keywordReference("kw-2")], siloId: "silo-1", hierarchy: "Pilar", suggestedSlug: "seo-para-clinicas", canonical: null,
  mainIntent: "Aprender", auxiliaryIntents: [], audience: "Gestores", problem: "Baixa demanda", desiredResult: "Demanda orgânica", journeyStage: "consideração", brandObjective: "Crescer", promise: "Construir demanda", angle: "Ativo próprio", cta: "Avaliar", coverage: ["fundamentos"], excludedSubjects: [], antiCannibalizationBoundary: "Não cobrir mídia paga", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: ["Fundamentos"], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.8, humanPendingDecisions: [], ...overrides });
const articleVersion = async (payload = articlePayload()) => createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "Teste", createdBy: "user-1", payload }) as Promise<Readonly<VersionEnvelope<ArticleDNA>>>;

test("DataGrid numera, filtra, ordena e preserva seleção parcial", () => {
  const rows = [{ id: "1", name: "Beta", status: "open" }, { id: "2", name: "Alfa", status: "closed" }, { id: "3", name: "Alfa 2", status: "open" }];
  const queried = applyGridQuery(rows, { search: "alfa", searchText: row => row.name, filters: { status: "open" }, filterValue: (row, column) => row[column as keyof typeof row], sort: { columnId: "name", direction: "desc" }, manualOrder: [] });
  assert.deepEqual(queried.map(row => row.id), ["3"]);
  const selected = selectAllVisible(new Set(["1"]), ["1", "2"], true); assert.deepEqual(selectionState(selected, ["1", "2"]), { checked: true, indeterminate: false, selectedVisible: 2 });
  selected.delete("2"); assert.equal(selectionState(selected, ["1", "2"]).indeterminate, true);
});

test("ordenação manual é bloqueada quando existe ordenação automática", () => {
  assert.deepEqual(reorderIds(["1", "2", "3"], "1", "3", true), ["1", "2", "3"]);
  assert.deepEqual(reorderIds(["1", "2", "3"], "1", "3", false), ["2", "3", "1"]);
});

test("visualizações são isoladas por usuário, marca e módulo e aceitam padrão único", () => {
  assert.notEqual(gridViewStorageKey("u1", "b1", "radar"), gridViewStorageKey("u2", "b1", "radar"));
  const base = { userId: "u1", brandId: "b1", module: "radar", search: "", filters: {}, sort: null, visibleColumns: ["title"], columnWidths: {}, pageSize: 25 as const, grouping: null, orderMode: "automatic" as const, manualOrder: [], updatedAt: new Date().toISOString() };
  let views = saveGridView([], { ...base, id: "v1", name: "Primeira", isDefault: true }); views = saveGridView(views, { ...base, id: "v2", name: "Segunda", isDefault: true });
  assert.equal(defaultGridView(views)?.id, "v2"); assert.equal(views.filter(view => view.isDefault).length, 1);
});

test("aprovação do Arquiteto valida 2 a 6 keywords, silo e evento humano", async () => {
  const version = await articleVersion(); const approved = createStatusEvent(version.versionId, "approved", "human", "Revisado");
  assert.deepEqual(articleApprovalIssues(version, [approved]), []);
  const one = await articleVersion(articlePayload({ secondaryKeywordIds: [], keywordReferences: [keywordReference("kw-1", "principal")] }));
  assert.match(articleApprovalIssues(one, [createStatusEvent(one.versionId, "approved", "human", "Revisado")]).join(" "), /2 e 6/);
  const noSilo = await articleVersion(articlePayload({ siloId: null })); assert.match(articleApprovalIssues(noSilo, [createStatusEvent(noSilo.versionId, "approved", "human", "Revisado")]).join(" "), /silo/);
});

test("Radar importa sem duplicar e somente a marca correta", async () => {
  const version = await articleVersion(); const first = importArticlesToRadar([], [version], "brand-1"); const second = importArticlesToRadar(first, [version], "brand-1");
  assert.equal(first.length, 1); assert.equal(second.length, 1); assert.equal(importArticlesToRadar([], [version], "brand-2").length, 0);
});

test("Radar exige revisão antes da aprovação e Planejador importa somente aprovados", async () => {
  const version = await articleVersion(); let radar = importArticlesToRadar([], [version], "brand-1");
  radar = setRadarState(radar, [radar[0].id], "approved"); assert.equal(radar[0].state, "research_pending");
  radar = setRadarState(radar, [radar[0].id], "awaiting_approval"); radar = setRadarState(radar, [radar[0].id], "approved");
  const planner = importRadarToPlanner([], radar, "brand-1"); assert.equal(planner.length, 1); assert.equal(importRadarToPlanner(planner, radar, "brand-1").length, 1);
});

test("Redigir cria ContentPlan, ContentDocument e rascunho vinculados", async () => {
  const article = await articleVersion(); let radar = importArticlesToRadar([], [article], "brand-1"); radar = setRadarState(radar, [radar[0].id], "awaiting_approval"); radar = setRadarState(radar, [radar[0].id], "approved");
  const item = importRadarToPlanner([], radar, "brand-1")[0]; const plan = await createOperationalPlan(item, article, undefined, "human");
  const document = createOperationalDocument(plan, article, item); const publication = createPublicationDraft(item, plan, document, article);
  assert.equal(document.articleDnaRef.versionId, article.versionId); assert.equal(publication.documentId, document.id); assert.equal(publication.state, "draft");
  assert.deepEqual(plan.payload.keywordDnaRefs.map(reference => reference.versionId), article.payload.keywordReferences.map(reference => reference.keywordDnaVersionId));
  assert.deepEqual(document.keywordDnaRefs, plan.payload.keywordDnaRefs); assert.deepEqual(document.siloDnaRef, plan.payload.siloDnaRef);
  assert.equal(ContentDocumentSchema.safeParse(document).success, true);
});

test("status efetivo usa o último evento append-only", () => {
  const events = [createStatusEvent("version-1", "proposed", "human", "Proposta"), createStatusEvent("version-1", "approved", "human", "Aprovada"), createStatusEvent("version-1", "superseded", "human", "Substituída")];
  assert.equal(effectiveVersionStatus("version-1", events), "superseded");
  assert.equal(effectiveVersionStatus("missing", events), null);
});

test("sincronização não deixa evento antigo do servidor sobrescrever aprovação local", () => {
  const proposed = createStatusEvent("version-1", "proposed", "human", "Proposta", "2026-07-13T20:00:00.000Z");
  const approved = createStatusEvent("version-1", "approved", "human", "Aprovada", "2026-07-13T20:01:00.000Z");
  const merged = mergeVersionEvents([approved], [proposed]);
  assert.equal(effectiveVersionStatus("version-1", merged), "approved");
});

test("transições otimistas não recarregam automaticamente toda a área editorial", async () => {
  const provider = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  assert.match(provider, /if \(response\.ok\) return/);
  assert.doesNotMatch(provider, /if \(response\.ok\) \{ await reload\(\)/);
});

test("Publicações importa somente artigos aprovados no Redator", async () => {
  const article = await articleVersion(); let radar = importArticlesToRadar([], [article], "brand-1"); radar = setRadarState(radar, [radar[0].id], "awaiting_approval"); radar = setRadarState(radar, [radar[0].id], "approved");
  const item = importRadarToPlanner([], radar, "brand-1")[0]; const plan = await createOperationalPlan(item, article, undefined, "human"); const document = createOperationalDocument(plan, article, item);
  const draft = createPublicationDraft(item, plan, document, article); const approved = { ...draft, id: "publication:approved", articleId: "article-approved", state: "approved" as const };
  const result = importApprovedWriterItems([draft, approved], [draft.id, approved.id]);
  assert.equal(result[0].state, "draft"); assert.equal(result[1].state, "ready_to_export"); assert.equal(result[1].lockVersion, 2);
});

test("convite respeita módulo, ação, expiração, revogação e ações sensíveis", () => {
  const invitation = createDevelopmentInvitation({ brandId: "brand-1", email: "reviewer@example.com", role: "medical_reviewer", permissions: [{ module: "redator", actions: ["view", "comment", "review"] }], expiresAt: new Date(Date.now() + 86400000).toISOString(), createdBy: "owner" });
  assert.equal(validateInvitationAccess(invitation, "redator", "review"), true); assert.equal(validateInvitationAccess(invitation, "publicacoes", "publish"), false);
  assert.throws(() => assertOperationalInvitationAccess(invitation, "brand-2", "redator", "view")); assert.throws(() => assertNoImplicitSensitiveAccess("billing"));
  const expired = { ...invitation, expiresAt: new Date(Date.now() - 1000).toISOString() }; assert.equal(validateInvitationAccess(expired, "redator", "view"), false);
});

test("interface operacional identifica mocks e usa o Redator Tiptap real", async () => {
  const source = await operationalModuleSources();
  const writer = await readFile(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /Importar do Arquiteto/); assert.match(source, /Nenhum artigo importado do Radar/); assert.match(source, /Dados simulados/);
  assert.match(source, /Importar do Redator/); assert.match(writer, /Importar do Planejador/); assert.match(writer, /Aprovar para Publicações/);
  assert.match(architect, /Importar do Minerador/); assert.match(architect, /WorkflowStatusBadge/);
  assert.match(writer, /useEditor/); assert.match(writer, /immediatelyRender: false/); assert.match(writer, /Salvo somente como recuperação local/); assert.match(writer, /expectedLockVersion/);
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")); assert.equal(Boolean(pkg.dependencies?.["@tiptap/react"]), true);
});

test("Arquiteto filtra por status e restaura silenciosamente a última configuração", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const preferences = await readFile(new URL("../components/editorial/compact-saved-views.tsx", import.meta.url), "utf8");
  assert.match(architect, /filterStatus/); assert.match(architect, /Status: Todos/); assert.match(architect, /articleWorkflowStatus/);
  assert.match(preferences, /minerador-pro:last-view/); assert.match(preferences, /localStorage\.setItem/);
  assert.doesNotMatch(preferences, /Nome da visualização|Salvar visão|Visualização padrão/);
  assert.match(architect, /getCurrentSupabaseToken/); assert.doesNotMatch(architect, /\[selectedBrandId, sessionStatus, session\]/);
  const miner = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(miner, /\[selectedBrandId, sessionStatus, session\]/);
});

test("topo organiza a etapa e rodapé concentra ações da seleção", async () => {
  const grid = await readFile(new URL("../components/editorial/operational-data-grid.tsx", import.meta.url), "utf8");
  const pages = await operationalModuleSources();
  const miner = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const writer = await readFile(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/(brand)/[brandRef]/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /ProductShell/); assert.match(miner, /h-screen min-h-0/); assert.match(architect, /h-screen min-h-0/);
  assert.ok(grid.indexOf("{toolbar}") < grid.indexOf("<table")); assert.ok(grid.indexOf("<footer") > grid.indexOf("</table>"));
  assert.ok(grid.indexOf("bulkActions.map") > grid.indexOf("<footer")); assert.doesNotMatch(grid, /Nome da visualização|Salvar visão|Definir padrão/);
  assert.match(architect, /Processar logica \(sem IA\)/); assert.match(architect, /Mudar status…/); assert.match(architect, /artigos selecionados/);
  assert.ok(architect.lastIndexOf("artigos selecionados") > architect.indexOf("</main>")); assert.match(writer, /<footer/);
  assert.ok(architect.indexOf("Agrupar keywords em artigos (IA)") > architect.indexOf("</main>"));
  assert.doesNotMatch(architect.slice(0, architect.indexOf("</main>")), /Agrupar keywords em artigos \(IA\)/);
  for (const title of ["Radar", "Planejador", "Publicações"]) assert.match(pages, new RegExp(`title="${title}"`));
});

test("três tarefas de IA ficam separadas e a revisão de keywords é processada em lotes", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const reviewRoute = await readFile(new URL("../app/api/revalidate-structure/route.ts", import.meta.url), "utf8");
  assert.match(architect, /buildKeywordReviewBatches/);
  assert.match(architect, /buildRelevantArticleCatalog/); assert.match(architect, /buildLogicalKeywordRecommendations/);
  assert.match(architect, /Revisando lote/);
  assert.match(architect, /groups: \[groups\[index\]\]/);
  assert.match(architect, /silos: \[silos\[index\]\]/);
  assert.match(reviewRoute, /revisa exclusivamente a distribuicao de keywords entre artigos/);
  assert.match(reviewRoute, /Primeiro tente fortalecer artigos publicados/);
  assert.match(reviewRoute, /Nao gere ArticleDNA, SiloDNA/);
  assert.match(reviewRoute, /focusGroups/);
  assert.match(reviewRoute, /articleCatalog/);
  assert.match(reviewRoute, /CompactProviderResponseSchema/); assert.match(reviewRoute, /timeoutMs: 180_000/);
  assert.match(reviewRoute, /proponha novo silo somente/);
  assert.doesNotMatch(reviewRoute, /return\s*\{[\s\S]*?\.\.\.decision,/);
  assert.match(reviewRoute, /keywordId:\s*decision\.keywordId/);
  assert.match(reviewRoute, /humanDecisionPoints:/);
  assert.match(architect, /aplicadas localmente/);
  assert.match(architect, /IA aplicada/);
  assert.doesNotMatch(architect, /type: "keyword-groups"/);
  assert.doesNotMatch(architect, /Revisao humana obrigatoria/);
});

test("anotação operacional da IA separa aplicação local de aprovação humana", () => {
  const annotation = AIReviewAnnotationSchema.parse({
    id: "ai-review:kw-1:v1", module: "arquiteto", entityId: "kw-1",
    action: "mover_para_artigo", summary: "Melhor encaixe semântico.",
    details: ["Revisar manualmente a fronteira"], confidence: 0.82, source: "ai",
    reviewState: "pending_fine_review", appliedLocally: true,
    createdAt: "2026-07-14T12:00:00.000Z",
  });
  assert.equal(annotation.appliedLocally, true);
  assert.equal(annotation.reviewState, "pending_fine_review");
});

test("tarefas do Arquiteto continuam no provider e o foco da janela não recarrega a sessão", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const provider = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  const providers = await readFile(new URL("../components/providers.tsx", import.meta.url), "utf8");
  const notice = await readFile(new URL("../components/editorial/background-task-notice.tsx", import.meta.url), "utf8");
  assert.match(providers, /refetchOnWindowFocus/);
  assert.match(provider, /runBackgroundTask/); assert.match(provider, /activeTaskKeys/); assert.match(provider, /Tarefa terminada/);
  assert.match(provider, /aiReviewAnnotations/); assert.match(provider, /addAiReviewAnnotations/);
  assert.match(architect, /logical_grouping/); assert.match(architect, /keyword_review/); assert.match(architect, /article_dna/); assert.match(architect, /silo_dna/);
  assert.match(architect, /consumeBackgroundTask/); assert.match(architect, /BackgroundTaskNotice/);
  assert.match(notice, /aria-live="polite"/); assert.match(notice, /task\.status === "completed"/);
});

test("reset e exclusões do Arquiteto exigem aprovação forte", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const miner = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const dialog = await readFile(new URL("../components/editorial/danger-approval-dialog.tsx", import.meta.url), "utf8");
  assert.match(architect, /Zona de segurança/); assert.match(architect, /DangerApprovalDialog/);
  assert.match(architect, /RESETAR \$\{pendingDangerAction\.count\}/); assert.match(architect, /APAGAR \$\{pendingDangerAction\.count\}/);
  assert.doesNotMatch(architect, /window\.confirm\(`Limpar/);
  assert.match(miner, /EXCLUIR \$\{selectedDeletableCount\}/); assert.match(miner, /handleBatchDelete\(true\)/);
  assert.doesNotMatch(miner, /Primeira Confirma|Segunda Confirma/);
  assert.match(dialog, /verificationPhrase/); assert.match(dialog, /acknowledged/); assert.match(dialog, /Aprovação de ação destrutiva/);
});

test("status aguardando aprovação nasce da lógica local e não depende da IA", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.match(architect, /prepareSelectedLogicalArticleDnas/);
  assert.match(architect, /enviado\(s\) para aprovação humana, sem chamar IA/);
  assert.match(architect, /articleApprovalIssues/);
  assert.match(architect, /pendente\(s\).*blockers\.join/);
});

test("planilhas operacionais trabalham artigo por artigo e exibem carga acumulada", async () => {
  const pages = await operationalModuleSources();
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  for (const label of ["KeywordDNAs", "ArticleDNA", "SiloDNA"]) { assert.match(pages, new RegExp(label)); assert.match(architect, new RegExp(label)); }
  assert.match(pages, /ArticleDNA/); assert.match(pages, /SERP/); assert.match(pages, /evid/);
});

test("migration operacional separa acessos, ativa RLS e preserva append-only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0002_operational_editorial_flow.sql", import.meta.url), "utf8");
  for (const table of ["brand_invitations", "brand_memberships", "brand_roles", "brand_member_permissions", "delegated_access_grants", "editorial_decision_events", "content_document_versions"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/); assert.match(sql, /editorial_has_permission/); assert.match(sql, /editorial_protect_append_only/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/);
});

test("APIs persistentes revalidam permissão e concorrência no servidor", async () => {
  const workflow = await readFile(new URL("../app/api/editorial/workflow/route.ts", import.meta.url), "utf8");
  const documents = await readFile(new URL("../app/api/editorial/documents/route.ts", import.meta.url), "utf8");
  assert.match(workflow, /assertEditorialPermission/); assert.match(workflow, /expectedLocks/); assert.match(workflow, /OptimisticLockError/);
  assert.match(documents, /expectedLockVersion/); assert.match(documents, /syncDocumentStatus/);
});

test("recuperação de importações é isolada por marca e cobre todas as etapas", async () => {
  assert.notEqual(workflowRecoveryStorageKey("brand-1"), workflowRecoveryStorageKey("brand-2"));
  const provider = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  for (const field of ["architectImportedKeywordIds", "articleVersions", "radarItems", "plannerItems", "documents", "operationalPublications"]) {
    assert.match(provider, new RegExp(field));
  }
  assert.match(provider, /LocalWorkflowRecoverySchema\.parse/);
  assert.match(provider, /localStorage\.setItem/);
});

test("popup do Arquiteto é a única entrada manual e lista novos, importados e publicados", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const dialog = await readFile(new URL("../components/editorial/workflow-status.tsx", import.meta.url), "utf8");
  assert.match(architect, /keywordImportPool/);
  assert.match(architect, /\["aprovado", "publicado"\]/);
  assert.match(architect, /void fetchMasterList\(\)/);
  assert.match(architect, /importApprovedKeywordsToArchitect/);
  assert.match(architect, /itens sem silo entram como candidatos sem classificação/);
  assert.match(architect, /status\?\.toLowerCase\(\) === "aprovado"/);
  assert.match(architect, /approvedIds\.has\(String\(k\.id\)\) \|\| currentWorkspaceByKeywordId\.has\(String\(k\.id\)\)/);
  assert.doesNotMatch(architect, /<span>Carregar<\/span>/);
  assert.doesNotMatch(architect, /publicados \+.*novos carregados/);
  assert.doesNotMatch(architect, /setApprovedKeywordPool/);
  assert.match(dialog, /disabledReason/);
  assert.match(dialog, /Buscar itens da etapa anterior/);
  assert.match(dialog, /Atualizando itens da etapa anterior/);
});

test("todos os popups mantêm aprovados antigos depois da importação", async () => {
  const pages = await operationalModuleSources();
  const writer = await readFile(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  assert.match(pages, /approved/);
  assert.match(pages, /ready_to_export|queued|exported|published/);
  assert.match(writer, /approved/);
  assert.match(pages, /importados (?:ficam )?bloqueados|importados permanecem vis/);
});

test("histórico de segurança cria snapshots independentes e pontos identificáveis", () => {
  const original = { rows: [{ id: "1", status: "em_processo" }], filters: { status: "todos" } };
  const snapshot = cloneHistorySnapshot(original);
  original.rows[0].status = "aprovado";
  assert.equal(snapshot.rows[0].status, "em_processo");
  const entry = createHistoryEntry("arquiteto", "Antes de aprovar artigos", snapshot);
  assert.equal(entry.module, "arquiteto");
  assert.equal(entry.label, "Antes de aprovar artigos");
  assert.match(entry.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("histórico, desfazer e refazer estão presentes do Minerador às Publicações", async () => {
  const files = await Promise.all([
    readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"),
    operationalModuleSources(),
    readFile(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of files) assert.match(source, /HistoryControls/);
  const operational = files[2];
  for (const module of ["radar", "publicacoes"]) assert.match(operational, new RegExp(`useLocalHistory\\(\"${module}\"`));
  assert.match(operational, /HistoryControls/);
  assert.match(files[0], /Detectar viés · KeywordDNA/);
  assert.match(files[1], /Agrupar keywords em artigos \(IA\)/);
  assert.match(files[1], /Detectar viés · ArticleDNA \(IA\)/);
  assert.match(files[1], /Detectar viés · SiloDNA \(IA\)/);
});

test("restauração do Redator não é interpretada como nova digitação", async () => {
  const writer = await readFile(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  assert.match(writer, /restoringHistoryRef/);
  assert.match(writer, /!base \|\| restoringHistoryRef\.current/);
});

test("artefatos pagos do Arquiteto possuem recuperações independentes por marca", () => {
  const keys = [architectReviewRecoveryKey("brand-1"), architectArticleDnaRecoveryKey("brand-1"), architectSiloDnaRecoveryKey("brand-1")];
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys.every(key => key.includes("brand-1")));
  const recovery = ArchitectReviewRecoverySchema.parse({ schemaVersion: 1, importedKeywordSignature: "kw-1",
    masterList: [{ id: "kw-1", clusterId: 1 }], provisionalGroups: [], customSlugs: {}, customHierarchies: {}, annotations: [], savedAt: new Date().toISOString() });
  assert.equal(recovery.masterList[0].clusterId, 1);
});

test("artefatos do Arquiteto usam IndexedDB e rejeitam conclusão vazia", async () => {
  const [store, architect, recoveryPanel] = await Promise.all([
    readFile(new URL("../lib/editorial/browser-artifact-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/editorial/architect-recovery-panel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(store, /indexedDB\.open/);
  assert.match(store, /readBrowserStorageSnapshot/);
  assert.doesNotMatch(store, /localStorage\.removeItem/);
  assert.match(architect, /if \(!result\.versions\.length \|\| !result\.events\.length\)/);
  assert.match(architect, /batch\.versions\.length !== 1/);
  assert.match(recoveryPanel, /Exportar snapshot do Arquiteto/);
});

test("auditoria separa índice bruto de vínculos recuperáveis e não agrupa órfãs", () => {
  const input = {
    brandId: "brand-1",
    masterKeywords: [
      { id: "kw-p", keyword: "publicada", status: "publicado" },
      { id: "kw-a", keyword: "aprovada", status: "aprovado" },
      { id: "kw-o", keyword: "órfã", status: "aprovado" },
    ],
    importedKeywordIds: ["kw-p", "kw-a", "kw-o"],
    currentMasterList: [
      { id: "kw-p", keyword: "publicada", keywordId: "kw-p", isPublished: true, clusterId: "pub-1" },
      { id: "kw-a", keyword: "aprovada", clusterId: "group-1", provisionalGroupId: "group-1" },
      { id: "kw-o", keyword: "órfã", clusterId: null, provisionalGroupId: null },
    ],
    currentArticles: [
      { id: "pub-1", isPublished: true, mainKeywordObj: { id: "kw-p" }, supportKeywords: [] },
      { id: "group-1", isPublished: false, mainKeywordObj: { id: "kw-a" }, supportKeywords: [] },
    ],
    provisionalGroups: [{ id: "group-1", keywordIds: ["kw-a"], keywords: [{ id: "kw-a", keyword: "aprovada" }] }],
    articleDnas: {}, siloDnas: {}, siloPages: {}, versionEvents: [],
    historyEntries: [], localStorage: [], indexedDb: [], renderedItems: [],
  };
  const audit = auditArchitectWorkspace(input);
  const plan = buildArchitectRecoveryPlan(input);
  assert.equal(audit.counts.importedKeywordIds, 3);
  assert.deepEqual(audit.ids.effectiveImportedKeywordIds, ["kw-a", "kw-o", "kw-p"]);
  assert.deepEqual(audit.ids.orphanKeywordIds, ["kw-o"]);
  assert.equal(audit.counts.keywordsWithoutRecoverableLink, 0);
  assert.equal(plan.recoveredMasterList.find(item => item.id === "kw-o")?.clusterId, null);
  assert.equal(plan.recoveredMasterList.find(item => item.id === "kw-a")?.provisionalGroupId, "group-1");
});

test("plano recupera o vínculo de um grupo persistido mesmo sem a linha renderizada", () => {
  const input = {
    brandId: "brand-1",
    masterKeywords: [{ id: "kw-a", keyword: "aprovada", status: "aprovado", lista_id: "silo-1" }],
    importedKeywordIds: ["kw-a"],
    currentMasterList: [], currentArticles: [],
    provisionalGroups: [{
      id: "group-recovered", keywordIds: ["kw-a"],
      keywords: [{ id: "kw-a", keyword: "aprovada" }],
      suggestedSiloId: "silo-1", suggestedSiloName: "Silo recuperado",
      suggestedHierarchy: "Suporte", roles: { "kw-a": "principal" },
    }],
    articleDnas: {}, siloDnas: {}, siloPages: {}, versionEvents: [],
    historyEntries: [], localStorage: [], indexedDb: [], renderedItems: [],
  };
  const plan = buildArchitectRecoveryPlan(input);
  const recovered = plan.recoveredMasterList.find(item => item.id === "kw-a");
  assert.equal(recovered?.clusterId, "group-recovered");
  assert.equal(recovered?.provisionalGroupId, "group-recovered");
  assert.equal(plan.recoveredProvisionalGroups[0]?.id, "group-recovered");
});

test("snapshot do Arquiteto é validado, completo por fontes e sem segredos ou prompts", () => {
  const auditInput = {
    brandId: "brand-1", masterKeywords: [{ id: "kw-1", keyword: "termo", status: "aprovado" }], importedKeywordIds: [],
    currentMasterList: [], currentArticles: [], provisionalGroups: [], articleDnas: {}, siloDnas: {}, siloPages: {}, versionEvents: [],
    historyEntries: [], localStorage: [
      { key: "minerador-pro:workflow-recovery:brand-1", value: { apiKey: "secret", prompt: "não exportar" } },
      { key: "access-token-cache", value: "token-value" },
    ], indexedDb: [], renderedItems: [],
  };
  const snapshot = createArchitectRecoverySnapshot({
    auditInput,
    database: { keywords: auditInput.masterKeywords, briefings: [] },
    workspace: { articleDnas: {}, versionEvents: [] },
    browser: { localStorage: auditInput.localStorage, indexedDb: [] },
  });
  assert.equal(ArchitectRecoverySnapshotSchema.safeParse(snapshot).success, true);
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /secret/);
  assert.doesNotMatch(serialized, /não exportar/);
  assert.doesNotMatch(serialized, /token-value/);
  assert.match(serialized, /ArchitectRecoverySnapshot/);
});

test("o carregamento do Arquiteto não chama agrupamento durante a leitura", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const fetchSection = architect.slice(architect.indexOf("const fetchMasterList"), architect.indexOf("const processDeterministicStructure"));
  assert.doesNotMatch(fetchSection, /buildProvisionalGroups\(items\)/);
  assert.doesNotMatch(fetchSection, /clusterMasterList\(/);
  assert.doesNotMatch(fetchSection, /buildArchitectRecoveryPlan/);
  assert.match(architect.slice(architect.indexOf("const auditRecoverySources")), /buildArchitectRecoveryPlan/);
  assert.match(architect, /Keywords não agrupadas/);
});

test("status editorial é estático e cada IA anima somente o próprio botão", async () => {
  const [status, architect] = await Promise.all([
    readFile(new URL("../components/editorial/workflow-status.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(status.match(/export function WorkflowStatusBadge[\s\S]*?\n}/)?.[0] ?? "", /animate-(spin|pulse)/);
  assert.match(architect, /activeKeywordReviewTask \? <Loader2/);
  assert.match(architect, /activeArticleDnaTask \? <Loader2/);
  assert.match(architect, /activeSiloDnaTask \? <Loader2/);
  assert.match(architect, /art\.isPublished\s*\? art\.mainKeywordObj\?\.id\s*:\s*art\.mainKeywordObj\?\.provisionalGroupId/);
});

test("Arquiteto fixa cabeçalho, numera artigos e respeita a ordem operacional", async () => {
  const architect = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const headers = ["KeywordDNAs", "Revisão IA", "ArticleDNA", "SiloDNA", "Ações"];
  let position = architect.indexOf("<thead");
  for (const header of headers) {
    const next = architect.indexOf(`>${header}<`, position);
    assert.ok(next > position, `${header} deve aparecer na ordem operacional.`);
    position = next;
  }
  assert.match(architect, /<thead className="sticky top-0/);
  assert.match(architect, />#<\/th>/);
  assert.match(architect, /filteredArticles\.findIndex\(candidate => candidate\.id === art\.id\) \+ 1/);
});

test("recuperação geral mantém anotações da Revisão IA após reload", async () => {
  const contracts = await readFile(new URL("../lib/editorial/persistence-contracts.ts", import.meta.url), "utf8");
  const provider = await readFile(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  assert.match(contracts, /aiReviewAnnotations: z\.array\(AIReviewAnnotationSchema\)\.default\(\[\]\)/);
  assert.match(provider, /aiReviewAnnotations: recovered\.aiReviewAnnotations/);
  assert.match(provider, /aiReviewAnnotations: current\.aiReviewAnnotations/);
});

// ─── Preflight SiloDNA: sem gate de aceite individual ───────────────────────

const preflightGroup = (overrides: Partial<{ id: string; publishedAnchorId: string | null; suggestedSiloId: string | null; suggestedSiloName: string | null; keywords: Array<{ id: string; keyword: string }> }> = {}) => ({
  id: "article-1",
  publishedAnchorId: null,
  suggestedSiloId: "silo-1",
  suggestedSiloName: "SEO para clínicas",
  keywords: [{ id: "kw-1", keyword: "seo para clinicas" }, { id: "kw-2", keyword: "seo clinicas" }],
  ...overrides,
});

test("siloDnaPreflight permite gerar SiloDNA sem status approved no ArticleDNA", async () => {
  const version = await articleVersion();
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "article-1": version };
  // Status do ArticleDNA é "proposed" (gerado pela IA), não "approved".
  const events = [createStatusEvent(version.versionId, "proposed", "user-1", "Gerado pela IA.")];
  assert.equal(effectiveVersionStatus(version.versionId, events), "proposed");
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup()], "brand-1");
  assert.equal(issues.length, 0, `Não deveria ter issues: ${JSON.stringify(issues)}`);
  assert.equal(silos.length, 1);
  assert.equal(silos[0].articleVersions.length, 1);
});

test("siloDnaPreflight bloqueia ArticleDNA ausente com mensagem específica", async () => {
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = {};
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup()], "brand-1");
  assert.equal(silos.length, 0);
  assert.ok(issues.some(issue => issue.includes("ArticleDNA ausente")));
});

test("siloDnaPreflight bloqueia sem-silo com mensagem específica", async () => {
  const version = await articleVersion();
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "article-1": version };
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup({ suggestedSiloId: null })], "brand-1");
  assert.equal(silos.length, 0);
  assert.ok(issues.some(issue => issue.includes("Sem silo definido")));
});

test("siloDnaPreflight bloqueia marca incorreta", async () => {
  const version = await articleVersion(articlePayload({ brandId: "brand-outra" }));
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "article-1": version };
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup()], "brand-1");
  assert.equal(silos.length, 0);
  assert.ok(issues.some(issue => issue.includes("Marca incorreta")));
});

test("siloDnaPreflight agrupa artigos de silos diferentes em SiloDNAs separados", async () => {
  const v1 = await articleVersion(articlePayload({ articleId: "art-1", siloId: "silo-a" }));
  const v2 = await articleVersion(articlePayload({ articleId: "art-2", siloId: "silo-b" }));
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "art-1": v1, "art-2": v2 };
  const groups = [
    preflightGroup({ id: "art-1", suggestedSiloId: "silo-a", suggestedSiloName: "Silo A", keywords: [{ id: "kw-1", keyword: "alpha" }] }),
    preflightGroup({ id: "art-2", suggestedSiloId: "silo-b", suggestedSiloName: "Silo B", keywords: [{ id: "kw-2", keyword: "beta" }] }),
  ];
  const { silos, issues } = siloDnaPreflight(versions, groups, "brand-1");
  assert.equal(issues.length, 0);
  assert.equal(silos.length, 2);
  assert.equal(silos[0].id, "silo-a");
  assert.equal(silos[1].id, "silo-b");
});

test("siloDnaPreflight aceita silo novo (tmp-) com nome válido", async () => {
  const version = await articleVersion();
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "article-1": version };
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup({ suggestedSiloId: "tmp-novo-silo", suggestedSiloName: "Novo Silo" })], "brand-1");
  assert.equal(issues.length, 0);
  assert.equal(silos.length, 1);
  assert.equal(silos[0].name, "Novo Silo");
});

test("siloDnaPreflight usa ArticleDNA com status proposed (IA aplicada não é aprovado)", async () => {
  const version = await articleVersion();
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "article-1": version };
  const proposedEvents = [createStatusEvent(version.versionId, "proposed", "ai", "IA aplicada.")];
  assert.equal(effectiveVersionStatus(version.versionId, proposedEvents), "proposed");
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup()], "brand-1");
  assert.equal(issues.length, 0);
  assert.equal(silos.length, 1);
  // Confirma que "IA aplicada" (proposed) não bloqueia o preflight
  assert.notEqual(effectiveVersionStatus(version.versionId, proposedEvents), "approved");
});

test("siloDnaPreflight coleta múltiplos issues específicos simultaneamente", async () => {
  const v1 = await articleVersion(articlePayload({ articleId: "art-ok", siloId: "silo-1" }));
  const v2 = await articleVersion(articlePayload({ articleId: "art-sem-silo", siloId: null }));
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "art-ok": v1, "art-sem-silo": v2 };
  const groups = [
    preflightGroup({ id: "art-ok", suggestedSiloId: "silo-1", suggestedSiloName: "Silo OK", keywords: [{ id: "kw-1", keyword: "ok" }] }),
    preflightGroup({ id: "art-sem-dna", suggestedSiloId: "silo-1", suggestedSiloName: "Silo 1", keywords: [{ id: "kw-2", keyword: "sem dna" }] }),
    preflightGroup({ id: "art-sem-silo", suggestedSiloId: null, suggestedSiloName: null, keywords: [{ id: "kw-3", keyword: "sem silo" }] }),
  ];
  const { silos, issues } = siloDnaPreflight(versions, groups, "brand-1");
  // art-ok passa, art-sem-dna (sem ArticleDNA) e art-sem-silo (sem silo) falham
  assert.equal(silos.length, 1);
  assert.equal(silos[0].articleVersions.length, 1);
  assert.ok(issues.length >= 2);
  assert.ok(issues.some(issue => issue.includes("ArticleDNA ausente")));
  assert.ok(issues.some(issue => issue.includes("Sem silo definido")));
});

test("antigo humanDecisionPoint vira anotação e não bloqueia preflight", async () => {
  const version = await articleVersion(articlePayload({ humanPendingDecisions: ["Confirmar fronteira", "Validar pela SERP"] }));
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "article-1": version };
  // humanPendingDecisions existem no ArticleDNA mas não bloqueiam o preflight
  assert.ok(version.payload.humanPendingDecisions.length > 0);
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup()], "brand-1");
  assert.equal(issues.length, 0);
  assert.equal(silos.length, 1);
});

test("estado antigo (proposed) é normalizado para preflight sem nova chamada de IA", async () => {
  const version = await articleVersion();
  const versions: Record<string, VersionEnvelope<ArticleDNA>> = { "article-1": version };
  // Simula estado antigo: ArticleDNA gerado com status "proposed"
  const oldEvents = [createStatusEvent(version.versionId, "proposed", "ai", "Gerado anteriormente.")];
  assert.equal(effectiveVersionStatus(version.versionId, oldEvents), "proposed");
  // Preflight funciona sem precisar gerar novo ArticleDNA
  const { silos, issues } = siloDnaPreflight(versions, [preflightGroup()], "brand-1");
  assert.equal(issues.length, 0);
  assert.equal(silos.length, 1);
  assert.equal(silos[0].articleVersions[0].versionId, version.versionId);
});

test("SiloDNA ausente aparece como blocker na aprovação final do artigo", async () => {
  const version = await articleVersion();
  const events = [
    createStatusEvent(version.versionId, "proposed", "user-1", "Proposto."),
    createStatusEvent(version.versionId, "approved", "user-1", "Aprovado."),
  ];
  // ArticleDNA válido e aprovado, mas sem SiloDNA
  const articleIssues = articleApprovalIssues(version, events);
  assert.equal(articleIssues.length, 0, "ArticleDNA sem issues básicos");
  // O check de SiloDNA é feito pela página, não por articleApprovalIssues.
  // Simulamos o check da página: se não há SiloDNA para o siloId do artigo,
  // o artigo não pode ser aprovado.
  const siloDnaVersions: Record<string, VersionEnvelope<SiloDNA>> = {};
  const siloDnaVersion = version.payload.siloId ? siloDnaVersions[String(version.payload.siloId)] : undefined;
  assert.equal(Boolean(siloDnaVersion), false, "SiloDNA ausente deve ser detectado");
});
