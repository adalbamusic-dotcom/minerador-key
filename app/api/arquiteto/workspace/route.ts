import { NextResponse } from "next/server";
import { z } from "zod";
import { architectPatchKeywordReadInput, loadCanonicalArquitetoWorkspace, readArchitectPatchKeywords } from "@/lib/server/arquiteto-workspace";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext, PipelineRuntimeError } from "@/lib/server/pipeline-runtime";
import { WorkflowRepository } from "@/lib/server/pipeline-repositories";
import { ArticleKgrIdentitySchema, SiloCandidateMarkSchema } from "@/lib/arquiteto/contracts";
import { KeywordTerritoryDecisionSchema, TerritoryRefSchema } from "@/lib/arquiteto/territory";
import { ArticleFormationDecisionSchema, ArticleFormationRefSchema } from "@/lib/arquiteto/article-formation-decision";
import { WorkingSubjectAnchorSchema } from "@/lib/arquiteto/declared-subject-guard";
import { assertWorkingSubjectAnchorAssignment } from "@/lib/server/arquiteto-subject-guard";
import { createTerritoryWorkflowItem, listTerritoryWorkflowItems, updateTerritoryWorkflowItem } from "@/lib/server/arquiteto-territory-store";
import { listTerritorialSerpAssessments } from "@/lib/server/arquiteto-territorial-serp-store";
import { listArticleFormationSerpAssessments } from "@/lib/server/arquiteto-article-serp-store";
import { listTerritorialAiProposals } from "@/lib/server/arquiteto-territorial-ai-store";
import { readArticleFormationMarker } from "@/lib/server/arquiteto-article-formation-marker-store";
import { readArchitectureMarker } from "@/lib/server/arquiteto-architecture-marker-store";
import { createSiloWorkingCopy, listSiloWorkingCopies, updateSiloWorkingCopy } from "@/lib/server/arquiteto-silo-working-copy-store";
import { SiloWorkingCopyRefSchema } from "@/lib/arquiteto/silo-working-copy-record";
import { readArticleKgrDecision } from "@/lib/arquiteto/article-kgr-decision";
import { isArchitectKeywordPublished, publishedIdentityKeysIn } from "@/lib/arquiteto/published-identity";
import {
  SerpPrimaryAcceptanceSchema,
  acceptSerpPrimaryProposal,
  readKeywordTerritoryRef,
  readTerritoryPrimaryKeyword,
  territoryCreatePrimaryRefusal,
  territoryPrimaryChangeRefusal,
} from "@/lib/arquiteto/silo-primary-acceptance";

const QuerySchema = z.object({ brandId: z.string().uuid() });
// Parâmetro aditivo: só "full" tem efeito. Valor desconhecido é ignorado, como
// qualquer outro parâmetro da URL antes dele, e não vira 400.
function keywordDetailOf(searchParams: URLSearchParams) {
  return searchParams.get("keywordDetail") === "full" ? "full" as const : undefined;
}
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
  // Assunto preso numa formação que ainda não tem Definição do artigo (SDD do
  // Assunto, F2 fase B). Opcional e aditivo no mesmo payload jsonb: mora no
  // item da principal da formação, chaveado pelo candidateRef. Sem Assunto o
  // campo não é enviado e o payload fica igual ao de antes.
  articleSubjectAnchor: WorkingSubjectAnchorSchema.nullable().optional(),
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
  // Aceite humano da proposta da SERP para a primária do Silo (adendo das 4
  // lentes, A9). O corpo não traz ator nem hora: os dois são do servidor.
  territoryPrimaryAcceptances: z.array(z.object({
    territoryRef: TerritoryRefSchema,
    expectedLock: z.number().int().positive(),
    territory: TerritoryDraftSchema,
    acceptance: SerpPrimaryAcceptanceSchema,
  }).strict()).max(20).optional(),
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
    || body.territoryPrimaryAcceptances?.length
    || body.siloWorkingCopyCreates?.length
    || body.siloWorkingCopyUpdates?.length,
  ),
  { message: "A edição precisa conter ao menos uma alteração." },
);

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const query = QuerySchema.parse({ brandId: searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    // Hidratação é LEITURA: o boot devolve o parecer já gravado e nunca
    // dispara consulta nova ao provider.
    const [workspace, territories, siloWorkingCopies, territorialSerp, articleFormationSerp, territorialAi, architectureMarker, articleFormationMarker] = await Promise.all([
      loadCanonicalArquitetoWorkspace(context, { keywordDetail: keywordDetailOf(searchParams) }),
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
    // Só as keywords dos itens enviados, lidas antes de qualquer gravação, como
    // antes; a marca é filtrada e `deleted_at` continua sem filtro.
    const keywordById = await readArchitectPatchKeywords(context, architectPatchKeywordReadInput(parsed.updates || []));
    const updated = [];
    for (const update of parsed.updates || []) {
      const currentResult = await repository.find(update.workflowItemId);
      if (currentResult.status !== "READY" || !currentResult.data) throw new PipelineRuntimeError("NOT_AUTHORIZED", "O item de workflow não pertence à Brand ativa.", 403);
      const current = currentResult.data;
      if (current.subject_type !== "keyword" || current.stage !== "architect" || current.state !== "received") {
        throw new PipelineRuntimeError("CONFLICT", "Somente itens recebidos pelo Arquiteto podem ser editados nesta cópia de trabalho.", 409);
      }
      const keyword = keywordById.get(String(current.subject_id));
      const currentPayload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) ? current.payload as Record<string, unknown> : {};
      // Publicada pelo status legado OU pelo Vínculo do pacote aprovado que o
      // próprio item carrega (AGENTS §11): a mesma pergunta da mesa, sem
      // leitura nova do banco. `territoryRef` não é identidade e passa.
      const isPublished = isArchitectKeywordPublished({ status: keyword?.status ?? null, canonicalWorkflow: { payload: currentPayload } });
      if (isPublished && publishedIdentityKeysIn(update.assignment).length) {
        throw new PipelineRuntimeError("CONFLICT", "A identidade publicada deste artigo está protegida contra alteração manual.", 409);
      }
      // Prender o Assunto: ator da requisição e keyword viva, da marca,
      // recebida e declarada no pacote aprovado. Soltar sempre passa.
      await assertWorkingSubjectAnchorAssignment(context, currentPayload, update.assignment);
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
      // Primária de SERP ou humana não nasce na criação: só a declaração publicada.
      const primariaNaCriacao = territoryCreatePrimaryRefusal(create.territory);
      if (primariaNaCriacao) throw new PipelineRuntimeError("CONFLICT", primariaNaCriacao, 409);
      territories.push(await createTerritoryWorkflowItem(context, create.territory));
    }
    // A primária vigente e a origem do Silo, lidas estreitas e filtradas pela
    // marca. Falha fecha: a trava abaixo não escreve sem saber o que está gravado.
    const territorioVigente = async (territoryRef: string) => {
      const lida = await readTerritoryPrimaryKeyword(context.supabase, context.brandId, territoryRef);
      if (lida.state === "read_failed") throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível ler a primária vigente do Silo; nada foi gravado.", 503);
      if (lida.state === "missing") throw new PipelineRuntimeError("CONFLICT", "O território não existe nesta Brand.", 409);
      return lida;
    };
    const primariaVigente = async (territoryRef: string) => (await territorioVigente(territoryRef)).primaryKeyword;
    for (const update of parsed.territoryUpdates || []) {
      const declaredRef = update.territory.territoryRef;
      if (declaredRef !== undefined && declaredRef !== update.territoryRef) {
        throw new PipelineRuntimeError("CONFLICT", "A identidade do território é imutável.", 409);
      }
      // A edição genérica não troca nem apaga a primária do Silo (AGENTS §9, §11).
      const primariaAlterada = territoryPrimaryChangeRefusal(await primariaVigente(update.territoryRef), update.territory);
      if (primariaAlterada) throw new PipelineRuntimeError("CONFLICT", primariaAlterada, 409);
      territories.push(await updateTerritoryWorkflowItem(context, update.territoryRef, update.expectedLock, update.territory));
    }
    for (const acceptance of parsed.territoryPrimaryAcceptances || []) {
      const declaredRef = acceptance.territory.territoryRef;
      if (declaredRef !== undefined && declaredRef !== acceptance.territoryRef) {
        throw new PipelineRuntimeError("CONFLICT", "A identidade do território é imutável.", 409);
      }
      // A SERP propôs; a pessoa da sessão aceita. Ator e hora são do servidor,
      // e a precedência humano > publicado > SERP vale também aqui. A origem
      // do Silo e a membership da keyword vêm do banco, não do corpo.
      const vigente = await territorioVigente(acceptance.territoryRef);
      const daKeyword = await readKeywordTerritoryRef(context.supabase, context.brandId, acceptance.acceptance.keywordId);
      if (daKeyword.state === "read_failed") throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível ler o Silo da keyword aceita; nada foi gravado.", 503);
      const aceite = acceptSerpPrimaryProposal({
        current: vigente.primaryKeyword,
        acceptance: acceptance.acceptance,
        actorUserId: context.actorUserId,
        confirmedAt: new Date().toISOString(),
        territoryRef: acceptance.territoryRef,
        territory: vigente.origin,
        keywordTerritoryRef: daKeyword.state === "found" ? daKeyword.territoryRef : null,
      });
      if (!aceite.ok) throw new PipelineRuntimeError("CONFLICT", aceite.reason, 409);
      territories.push(await updateTerritoryWorkflowItem(context, acceptance.territoryRef, acceptance.expectedLock, {
        ...acceptance.territory,
        primaryKeyword: aceite.primary,
      }));
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
