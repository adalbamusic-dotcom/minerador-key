import { NextResponse } from "next/server";
import { z } from "zod";
import { loadCanonicalArquitetoWorkspace } from "@/lib/server/arquiteto-workspace";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext, PipelineRuntimeError } from "@/lib/server/pipeline-runtime";
import { WorkflowRepository } from "@/lib/server/pipeline-repositories";
import { ArticleKgrIdentitySchema, SiloCandidateMarkSchema } from "@/lib/arquiteto/contracts";
import { KeywordTerritoryDecisionSchema, TerritoryRefSchema } from "@/lib/arquiteto/territory";
import { ArticleFormationDecisionSchema, ArticleFormationRefSchema } from "@/lib/arquiteto/article-formation-decision";
import { createTerritoryWorkflowItem, listTerritoryWorkflowItems, updateTerritoryWorkflowItem } from "@/lib/server/arquiteto-territory-store";
import { listTerritorialSerpAssessments } from "@/lib/server/arquiteto-territorial-serp-store";
import { listArticleFormationSerpAssessments } from "@/lib/server/arquiteto-article-serp-store";
import { listTerritorialAiProposals } from "@/lib/server/arquiteto-territorial-ai-store";
import { readArticleFormationMarker } from "@/lib/server/arquiteto-article-formation-marker-store";
import { readArchitectureMarker } from "@/lib/server/arquiteto-architecture-marker-store";
import { createSiloWorkingCopy, listSiloWorkingCopies, updateSiloWorkingCopy } from "@/lib/server/arquiteto-silo-working-copy-store";
import { SiloWorkingCopyRefSchema } from "@/lib/arquiteto/silo-working-copy-record";
import { readArticleKgrDecision } from "@/lib/arquiteto/article-kgr-decision";

const QuerySchema = z.object({ brandId: z.string().uuid() });
const AssignmentSchema = z.object({
  workingArticleId: z.string().min(1).nullable().optional(),
  clusterId: z.string().min(1).nullable().optional(),
  provisionalGroupId: z.string().min(1).nullable().optional(),
  siloId: z.string().min(1).nullable().optional(),
  silo_id: z.string().min(1).nullable().optional(),
  siloName: z.string().nullable().optional(),
  computedSlug: z.string().nullable().optional(),
  slug_sugerido: z.string().nullable().optional(),
  computedHierarquia: z.string().min(1).nullable().optional(),
  hierarquia: z.string().min(1).nullable().optional(),
  role: z.string().min(1).nullable().optional(),
  principalKeywordId: z.string().min(1).nullable().optional(),
  siloCandidate: SiloCandidateMarkSchema.nullable().optional(),
  articleKgrDecision: z.enum(["YES", "NO"]).optional(),
  manualEdit: z.boolean().optional(),
  // Membership territorial canônica (SDD Silo-first). Aditiva no payload jsonb
  // que já existe: nenhuma coluna, nenhuma migration. `territoryRef` é a ÚNICA
  // fonte mutável — `TerritoryProjection.keywordRefs` é derivada na leitura.
  // Não se confunde com `siloId`, que continua significando Silo canônico
  // consolidado ou publicado, nem com `lista_id`, que é proveniência do Minerador.
  territoryRef: TerritoryRefSchema.nullable().optional(),
  // Decisão SEM territoryRef: o ponteiro é o campo acima e só ele. Guardar a
  // referência dentro da decisão criaria uma segunda fonte capaz de divergir da
  // primeira, sem regra de desempate.
  territoryAssignment: KeywordTerritoryDecisionSchema.nullable().optional(),
  // Formação de Artigo revisada por humano. Mesma forma da membership
  // territorial: o ponteiro é este campo e só ele, e a decisão ao lado não
  // repete a referência — duas fontes divergiriam sem regra de desempate.
  // Aditivo no mesmo payload jsonb: nenhuma coluna, nenhuma migration.
  articleFormationRef: ArticleFormationRefSchema.nullable().optional(),
  articleFormationDecision: ArticleFormationDecisionSchema.nullable().optional(),
}).strict();
// O draft territorial NÃO declara identidade nem tenant: `territoryRef` é
// emitido pelo servidor e `brandId` vem do contexto autenticado. O
// TerritoryCandidateSchema valida o conteúdo dentro do store, depois de os dois
// serem impostos.
const TerritoryDraftSchema = z.record(z.string(), z.unknown());
const PatchSchema = z.object({
  brandId: z.string().uuid(),
  updates: z.array(z.object({
    workflowItemId: z.string().uuid(),
    expectedLock: z.number().int().positive(),
    assignment: AssignmentSchema,
  }).strict()).max(500).optional(),
  territoryCreates: z.array(z.object({
    territory: TerritoryDraftSchema,
  }).strict()).max(100).optional(),
  territoryUpdates: z.array(z.object({
    territoryRef: TerritoryRefSchema,
    expectedLock: z.number().int().positive(),
    territory: TerritoryDraftSchema,
  }).strict()).max(100).optional(),
  // Working copy de Silo: operações de EDIÇÃO da cópia de trabalho. Consolidar
  // o Silo é outro ato, e não passa por aqui.
  siloWorkingCopyCreates: z.array(z.object({
    workingCopy: TerritoryDraftSchema,
  }).strict()).max(100).optional(),
  siloWorkingCopyUpdates: z.array(z.object({
    workingCopyRef: SiloWorkingCopyRefSchema,
    expectedLock: z.number().int().positive(),
    workingCopy: TerritoryDraftSchema,
  }).strict()).max(100).optional(),
}).strict().refine(
  body => Boolean(
    body.updates?.length
    || body.territoryCreates?.length
    || body.territoryUpdates?.length
    || body.siloWorkingCopyCreates?.length
    || body.siloWorkingCopyUpdates?.length,
  ),
  { message: "A edição precisa conter ao menos uma alteração." },
);

export async function GET(request: Request) {
  try {
    const query = QuerySchema.parse({ brandId: new URL(request.url).searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    // Hidratação é LEITURA: o boot devolve o parecer já gravado e nunca
    // dispara consulta nova ao provider.
    const [workspace, territories, siloWorkingCopies, territorialSerp, articleFormationSerp, territorialAi, architectureMarker, articleFormationMarker] = await Promise.all([
      loadCanonicalArquitetoWorkspace(context),
      listTerritoryWorkflowItems(context),
      listSiloWorkingCopies(context),
      listTerritorialSerpAssessments(context),
      // A evidência SERP da formação vem do REMOTO: o navegador é cache, não
      // autoridade. Sem isto o F5 dependeria da memória daquela aba.
      listArticleFormationSerpAssessments(context),
      listTerritorialAiProposals(context),
      readArchitectureMarker(context),
      readArticleFormationMarker(context),
    ]);
    return NextResponse.json({ success: true, data: { ...workspace, territories, siloWorkingCopies, territorialSerp, articleFormationSerp, territorialAi, architectureMarker: architectureMarker?.payload ?? null, articleFormationMarker: articleFormationMarker?.payload ?? null } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "brandId é obrigatório e deve ser válido.", code: "INVALID_CONTEXT" }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = PatchSchema.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: "edit" });
    const repository = new WorkflowRepository(context);
    const keywordResult = await context.supabase.from("minerador_keywords").select("id,status,kgr_score,analise_semantica").eq("brand_id", context.brandId);
    if (keywordResult.error) throw keywordResult.error;
    const keywordById = new Map((keywordResult.data || []).map(row => [String(row.id), row]));
    const protectedKeys = new Set(["clusterId", "provisionalGroupId", "siloId", "silo_id", "siloName", "computedSlug", "slug_sugerido", "principalKeywordId", "role"]);
    const updated = [];
    for (const update of parsed.updates || []) {
      const currentResult = await repository.find(update.workflowItemId);
      if (currentResult.status !== "READY" || !currentResult.data) throw new PipelineRuntimeError("NOT_AUTHORIZED", "O item de workflow não pertence à Brand ativa.", 403);
      const current = currentResult.data;
      if (current.subject_type !== "keyword" || current.stage !== "architect" || current.state !== "received") {
        throw new PipelineRuntimeError("CONFLICT", "Somente itens recebidos pelo Arquiteto podem ser editados nesta cópia de trabalho.", 409);
      }
      const keyword = keywordById.get(String(current.subject_id));
      const isPublished = String(keyword?.status || "").toLowerCase() === "publicado";
      if (isPublished && Object.keys(update.assignment).some(key => protectedKeys.has(key))) {
        throw new PipelineRuntimeError("CONFLICT", "A identidade publicada deste artigo está protegida contra alteração manual.", 409);
      }
      const currentPayload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) ? current.payload as Record<string, unknown> : {};
      const { articleKgrDecision, ...assignment } = update.assignment;
      const parsedKgrIdentity = ArticleKgrIdentitySchema.safeParse(currentPayload.kgrIdentity);
      let kgrIdentity = parsedKgrIdentity.success ? parsedKgrIdentity.data : undefined;
      if (articleKgrDecision) {
        const currentDecision = readArticleKgrDecision({ principal: { kgr_score: keyword?.kgr_score ?? null, analise_semantica: keyword?.analise_semantica as never }, principalKeywordId: String(current.subject_id) });
        if (!currentDecision.requiresHumanDecision || currentDecision.principalKgrScore === null) throw new PipelineRuntimeError("CONFLICT", "Decisão humana KGR inválida para a Principal atual.", 409);
        const decidedAt = new Date().toISOString();
        const yes = articleKgrDecision === "YES";
        kgrIdentity = ArticleKgrIdentitySchema.parse({ ...(kgrIdentity || {}), isKgrArticle: yes, source: "human_confirmation", brandId: context.brandId, articleId: assignment.workingArticleId || current.article_id || kgrIdentity?.articleId, workflowItemId: current.id, principalKeywordDnaId: current.source_entity_id, principalKeywordDnaVersionId: current.source_version_id || undefined, principalKeywordDnaContentHash: current.source_content_hash || undefined, sourceVersion: current.source_version_id || undefined, sourceHash: current.source_content_hash || undefined, primaryKeywordId: String(current.subject_id), primaryVolume: kgrIdentity?.primaryVolume ?? null, kgrValue: currentDecision.principalKgrScore, principalKgrApplicability: currentDecision.principalApplicability, bindingStatus: yes ? "candidate" : "not_applicable", status: yes ? "candidate" : "not_kgr", decision: articleKgrDecision, decisionSource: "HUMAN_DECISION", decisionReason: "Decisão humana explícita do KGR do artigo na working copy.", decisionContractVersion: "article-kgr-decision-v1", decisionHistory: [...(kgrIdentity?.decisionHistory || []), { decision: articleKgrDecision, source: "HUMAN_DECISION", principalKeywordId: String(current.subject_id), principalKeywordDnaId: current.source_entity_id, principalKeywordDnaVersionId: current.source_version_id || undefined, principalKeywordDnaContentHash: current.source_content_hash || undefined, principalKgrScore: currentDecision.principalKgrScore, principalKgrApplicability: currentDecision.principalApplicability, actorUserId: context.actorUserId, decidedAt, reason: "Decisão humana explícita do KGR do artigo na working copy." }], decidedBy: context.actorUserId, decidedAt, evaluatedAt: decidedAt, evaluatedBy: context.actorUserId, humanDecision: { decision: articleKgrDecision, actorUserId: context.actorUserId, decidedAt, scope: "article_kgr_decision" } });
      }
      const nextPayload = { ...currentPayload, ...assignment, ...(kgrIdentity ? { kgrIdentity } : {}), manualEdit: true, manualEditAt: new Date().toISOString() };
      const result = await repository.update(update.workflowItemId, update.expectedLock, { payload: nextPayload });
      updated.push(result.data);
    }
    const territories = [];
    for (const create of parsed.territoryCreates || []) {
      // Identidade nunca chega do cliente. Um draft que já traz territoryRef é
      // recusado: aceitá-lo deixaria o browser emitir identidade canônica.
      if ("territoryRef" in create.territory) {
        throw new PipelineRuntimeError("CONFLICT", "O territoryRef é emitido pelo servidor e não pode ser declarado na criação.", 409);
      }
      territories.push(await createTerritoryWorkflowItem(context, create.territory));
    }
    for (const update of parsed.territoryUpdates || []) {
      const declaredRef = update.territory.territoryRef;
      if (declaredRef !== undefined && declaredRef !== update.territoryRef) {
        throw new PipelineRuntimeError("CONFLICT", "A identidade do território é imutável.", 409);
      }
      territories.push(await updateTerritoryWorkflowItem(context, update.territoryRef, update.expectedLock, update.territory));
    }
    const siloWorkingCopies = [];
    for (const create of parsed.siloWorkingCopyCreates || []) {
      // Identidade nunca chega do cliente — o servidor emite o workingCopyRef.
      if ("workingCopyRef" in create.workingCopy) {
        throw new PipelineRuntimeError("CONFLICT", "O workingCopyRef é emitido pelo servidor e não pode ser declarado na criação.", 409);
      }
      siloWorkingCopies.push(await createSiloWorkingCopy(context, create.workingCopy));
    }
    for (const update of parsed.siloWorkingCopyUpdates || []) {
      const declaredRef = update.workingCopy.workingCopyRef;
      if (declaredRef !== undefined && declaredRef !== update.workingCopyRef) {
        throw new PipelineRuntimeError("CONFLICT", "A identidade da working copy de Silo é imutável.", 409);
      }
      siloWorkingCopies.push(await updateSiloWorkingCopy(context, update.workingCopyRef, update.expectedLock, update.workingCopy));
    }
    return NextResponse.json({ success: true, data: { persistence: "PERSISTED", source: "CANONICAL_REMOTE", items: updated, territories, siloWorkingCopies } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "A edição da cópia de trabalho é inválida.", code: "INVALID_CONTEXT" }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
