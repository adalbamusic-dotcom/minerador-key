import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionProfile, authzErrorResponse, AuthzError } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ArtifactRepository, ContentDocumentRepository, DecisionEventRepository, PublicationRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { WorkflowCommandSchema } from "@/lib/editorial/persistence-contracts";
import { articleApprovalIssues, contentPlanApprovalIssues, importArticlesToRadar, importRadarToPlanner, RadarItemSchema } from "@/lib/editorial/operational-flow";
import { contentHash } from "@/lib/arquiteto/versioning";

const allowedRadar: Record<string, string[]> = { research_pending: ["researching", "awaiting_approval"], researching: ["needs_review", "conflicts"], needs_review: ["awaiting_approval", "conflicts"], conflicts: ["needs_review"], awaiting_approval: ["approved", "needs_review"], approved: ["sent_planner", "needs_review"], sent_planner: ["approved"] };

export async function POST(request: NextRequest) {
  try {
    const profile = await requireSessionProfile(); const command = WorkflowCommandSchema.parse(await request.json());
    const workflow = new WorkflowRepository(); const artifacts = new ArtifactRepository(); const decisions = new DecisionEventRepository();
    if (command.action === "import_radar") {
      await assertEditorialPermission(profile, command.brandId, "arquiteto", "approve"); await assertEditorialPermission(profile, command.brandId, "radar", "create");
      for (const version of command.articleVersions) {
        if (articleApprovalIssues(version, command.versionEvents).length) throw new AuthzError(409, "ArticleDNA não atende aos gates de aprovação.");
        await artifacts.save(command.brandId, "article_dna", version, profile.userId); await artifacts.appendEvents(command.brandId, command.versionEvents.filter(event => event.versionId === version.versionId), profile.userId);
        const item = importArticlesToRadar([], [version], command.brandId, undefined, [], {}, command.hydrationByArticleId)[0]; const row = await workflow.importItem({ marcaId: command.brandId, articleId: version.payload.articleId, stage: "radar", state: item.state,
          sourceEntityId: version.entityId, sourceVersionId: version.versionId, sourceContentHash: version.contentHash, payload: item, actorId: profile.userId });
        await decisions.append({ marcaId: command.brandId, workflowItemId: row.id, articleId: version.payload.articleId, eventType: "import_radar", toState: item.state, sourceVersionId: version.versionId, actorId: profile.userId });
      }
    }
    if (command.action === "transition_radar") {
      await assertEditorialPermission(profile, command.brandId, "radar", command.target === "approved" ? "approve" : "edit");
      for (const id of command.itemIds) { const current = await workflow.find(id); if (!current || current.marca_id !== command.brandId || current.stage !== "radar") throw new AuthzError(404, "Item do Radar não encontrado.");
        if (!allowedRadar[current.state]?.includes(command.target)) throw new AuthzError(409, `Transição ${current.state} → ${command.target} inválida.`);
        await workflow.transition(id, command.expectedLocks[id], command.target, current.payload, profile.userId); await decisions.append({ marcaId: command.brandId, workflowItemId: id, articleId: current.article_id, eventType: "transition_radar", fromState: current.state, toState: command.target, actorId: profile.userId }); }
    }
    if (command.action === "import_planner") {
      await assertEditorialPermission(profile, command.brandId, "planejador", "create");
      for (const id of command.radarItemIds) { const current = await workflow.find(id); if (!current || current.marca_id !== command.brandId || current.stage !== "radar" || current.state !== "approved") throw new AuthzError(409, "Somente Radar aprovado pode entrar no Planejador.");
        const radar = RadarItemSchema.parse({ ...(current.payload as object), id: current.id, brandId: current.marca_id, articleId: current.article_id, state: current.state, lockVersion: current.lock_version, importedAt: current.created_at, updatedAt: current.updated_at, origin: "real" });
        const planner = importRadarToPlanner([], [radar], command.brandId)[0]; const inserted = await workflow.importItem({ marcaId: command.brandId, articleId: radar.articleId, stage: "planner", state: "draft", sourceEntityId: radar.articleId, sourceVersionId: current.source_version_id, sourceContentHash: current.source_content_hash, payload: planner, actorId: profile.userId });
        await workflow.transition(id, command.expectedLocks[id], "sent_planner", current.payload, profile.userId); await decisions.append({ marcaId: command.brandId, workflowItemId: inserted.id, articleId: radar.articleId, eventType: "import_planner", fromState: "approved", toState: "draft", actorId: profile.userId }); }
    }
    if (command.action === "prepare_plan") {
      await assertEditorialPermission(profile, command.brandId, "planejador", "edit"); const current = await workflow.find(command.plannerItemId);
      if (!current || current.marca_id !== command.brandId || current.stage !== "planner" || !["draft", "planning", "pending", "awaiting_review", "approved"].includes(current.state)) throw new AuthzError(409, "Item não pode ser planejado neste estado.");
      await artifacts.save(command.brandId, "content_plan", command.plan, profile.userId); const payload = { ...(current.payload as object), contentPlanVersionId: command.plan.versionId };
      await workflow.transition(current.id, command.expectedLock, "awaiting_review", payload, profile.userId); await decisions.append({ marcaId: command.brandId, workflowItemId: current.id, articleId: current.article_id, eventType: "prepare_plan", fromState: current.state, toState: "awaiting_review", sourceVersionId: command.plan.versionId, actorId: profile.userId });
    }
    if (command.action === "approve_plan") {
      await assertEditorialPermission(profile, command.brandId, "planejador", "approve"); const stored = await artifacts.list(command.brandId); for (const id of command.plannerItemIds) { const current = await workflow.find(id);
        if (!current || current.marca_id !== command.brandId || current.stage !== "planner" || current.state !== "awaiting_review") throw new AuthzError(409, "ContentPlan não está aguardando aprovação.");
        const planVersionId = (current.payload as { contentPlanVersionId?: string }).contentPlanVersionId; const plan = stored.plans.find(candidate => candidate.versionId === planVersionId);
        if (!plan || contentPlanApprovalIssues(plan, command.brandId).length) throw new AuthzError(409, "ContentPlan não atende aos gates editoriais.");
        await workflow.transition(id, command.expectedLocks[id], "approved", current.payload, profile.userId); await decisions.append({ marcaId: command.brandId, workflowItemId: id, articleId: current.article_id, eventType: "approve_plan", fromState: current.state, toState: "approved", actorId: profile.userId }); }
      await artifacts.appendEvents(command.brandId, command.versionEvents, profile.userId);
    }
    if (command.action === "start_writing") {
      await assertEditorialPermission(profile, command.brandId, "redator", "create"); const current = await workflow.find(command.plannerItemId);
      if (!current || current.marca_id !== command.brandId || current.stage !== "planner" || !["approved", "sent_writer"].includes(current.state)) throw new AuthzError(409, "Somente ContentPlan aprovado pode abrir o Redator.");
      if ((current.payload as { contentPlanVersionId?: string }).contentPlanVersionId !== command.plan.versionId || contentPlanApprovalIssues(command.plan, command.brandId).length) throw new AuthzError(409, "O ContentPlan enviado não é a versão aprovada ou não atende aos gates editoriais.");
      await artifacts.save(command.brandId, "article_dna", command.articleVersion, profile.userId); await artifacts.save(command.brandId, "content_plan", command.plan, profile.userId);
      const documents = new ContentDocumentRepository(); const hash = await contentHash(command.document); await documents.create(command.brandId, command.document, command.articleVersion.payload.articleId, command.plan.versionId, command.articleVersion.versionId, command.articleVersion.payload.suggestedSlug, hash, profile.userId);
      await new PublicationRepository().create(command.brandId, command.publication, profile.userId);
      if (current.state === "approved") await workflow.transition(current.id, command.expectedLock, "sent_writer", current.payload, profile.userId);
      await decisions.append({ marcaId: command.brandId, workflowItemId: current.id, articleId: current.article_id, eventType: "start_writing", fromState: current.state, toState: "sent_writer", sourceVersionId: command.plan.versionId, actorId: profile.userId });
    }
    if (command.action === "import_publications") {
      await assertEditorialPermission(profile, command.brandId, "redator", "approve");
      await assertEditorialPermission(profile, command.brandId, "publicacoes", "create");
      const publications = new PublicationRepository();
      for (const articleId of command.publicationIds) {
        const imported = await publications.importApproved(articleId, command.brandId, command.expectedLocks[articleId], profile.userId);
        if (!imported) throw new AuthzError(409, "Somente artigos aprovados no Redator podem entrar em Publicações.");
        await decisions.append({ marcaId: command.brandId, articleId: imported.articleId, eventType: "import_publications", fromState: "approved", toState: "ready_to_export", actorId: profile.userId });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Comando editorial inválido.", details: error.issues }, { status: 400 });
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
