import { persistGlobalTransition } from "@/lib/server/global-workflow-transition";
import { getOperationalClient } from "@/lib/server/editorial-db";
import { buildCanonicalIndex } from "@/lib/server/global-workflow-canonical";
import { readReadyBase, validateReadyForRadarClaims, WORKFLOW_STATUS_LABELS } from "@/lib/arquiteto/operational-status";
import { radarReadbackMatches } from "@/lib/editorial/global-workflow-status";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse, AuthzError } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { DecisionEventRepository, WorkflowRepository } from "@/lib/server/editorial-repositories";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { WorkflowCommandSchema } from "@/lib/editorial/persistence-contracts";
import { articleApprovalIssues, importArticlesToRadar, RadarItemSchema } from "@/lib/editorial/operational-flow";
import { contentHash } from "@/lib/arquiteto/versioning";

/*
 * CORTE 2 · `approved → sent_planner` saiu, e `sent_planner → approved` também.
 *
 * O VALOR continua no enum de `RadarWorkflowStateSchema` — linha antiga precisa
 * fazer parse. O que deixou de existir é a TRANSIÇÃO que o produzia: sem ela,
 * nenhum item novo pode chegar a `sent_planner` por esta rota.
 */
const allowedRadar: Record<string, string[]> = { research_pending: ["researching", "awaiting_approval"], researching: ["needs_review", "conflicts"], needs_review: ["awaiting_approval", "conflicts"], conflicts: ["needs_review"], awaiting_approval: ["approved", "needs_review"], approved: ["needs_review"] };

/*
 * 2026-10-09 · A IMPORTAÇÃO DO ARQUITETO RESPONDE POR ARTIGO.
 *
 * O laço lançava 409 no PRIMEIRO artigo recusado: os anteriores já estavam
 * gravados, os seguintes nem eram olhados, e o cliente carimbava a mesma frase
 * nos oito ("0 item(ns) enviado(s)"). Visto em produção com o Silo "como atrair
 * clientes": sete artigos Prontos para Radar na versão vigente travados por um
 * ArticleDNA de formação sem status no Arquiteto.
 *
 * Agora a recusa de REGRA (409) é do artigo: ele sai com código e motivo
 * próprios em `refused` (campo aditivo) e os outros seguem. Falha de
 * infraestrutura (readback 502, banco 503) continua parando o lote. O Radar
 * recebe o artigo do jeito que o Arquiteto entregou: a regra de entrada é a
 * mesma (Pronto para Radar na versão enviada), só a resposta ficou honesta.
 */
class RecusaDeImportacao extends AuthzError {
  code: string;
  constructor(code: string, message: string) {
    super(409, message);
    this.code = code;
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile(); const command = WorkflowCommandSchema.parse(await request.json());
    const workflow = new WorkflowRepository(); const decisions = new DecisionEventRepository();
    if (command.action === "import_radar") {
      await assertEditorialPermission(profile, command.brandId, "arquiteto", "approve"); await assertEditorialPermission(profile, command.brandId, "radar", "create");
      const db=getOperationalClient();
      const canonical=await buildCanonicalIndex(db,command.brandId);
      const confirmedRadar=[];
      const refused: Array<{ articleId: string; code: string; reason: string }> = [];
      for (const version of command.articleVersions) {
       try {
        const ready=await db.from("editorial_workflow_items").select("id,state,payload,lock_version").eq("marca_id",command.brandId).eq("stage","architect").eq("subject_type","article").eq("subject_id",version.payload.articleId).maybeSingle();
        if(ready.error) throw ready.error;
        const base=readReadyBase(ready.data?.payload);
        /* A mesma regra de entrada de antes, agora com o motivo de cada caso. */
        if (!ready.data) throw new RecusaDeImportacao("not_delivered", "O Arquiteto não entregou este artigo ao Radar: ele não tem status no Arquiteto.");
        if (ready.data.state === "ENVIADO_AO_RADAR") {
          const jaNoRadar = await db.from("editorial_workflow_items").select("id").eq("marca_id", command.brandId).eq("stage", "radar").eq("article_id", version.payload.articleId).maybeSingle();
          if (jaNoRadar.error) throw jaNoRadar.error;
          if (jaNoRadar.data) throw new RecusaDeImportacao("already_in_radar", "Já está no Radar.");
        }
        if (ready.data.state !== "PRONTO_PARA_RADAR") {
          const estado = WORKFLOW_STATUS_LABELS[ready.data.state as keyof typeof WORKFLOW_STATUS_LABELS] || ready.data.state;
          throw new RecusaDeImportacao("not_ready", `No Arquiteto o artigo está em "${estado}"; o Radar recebe o que está Pronto para Radar.`);
        }
        if (!base) throw new RecusaDeImportacao("ready_base_incomplete", "A marca de Pronto para Radar está sem a base completa (SiloDNA, SiloPage e links internos).");
        if (base.articleDnaVersionId !== version.versionId) throw new RecusaDeImportacao("version_mismatch", `O Arquiteto entregou outra versão deste artigo; a tela enviou a v${version.versionNumber}. Recarregue a lista do Radar e importe de novo.`);
        const context=command.handoffContext[version.payload.articleId]?.silo;
        if(!context || context.siloDnaVersionId!==base.siloDnaVersionId || context.siloPageVersionId!==base.siloPageVersionId) throw new AuthzError(409,"Contexto de envio diverge da base pronta.");
        const gate=validateReadyForRadarClaims({claims:[{articleId:version.payload.articleId,...base}],canonical});
        if(gate.refused.length) throw new AuthzError(409,gate.refused[0].blockers.join(" "));
        const stored=await db.from("editorial_artifact_versions").select("content_hash").eq("marca_id",command.brandId).eq("version_id",version.versionId).single();
        if(stored.error || stored.data?.content_hash!==version.contentHash || await contentHash(version.payload)!==version.contentHash) throw new AuthzError(409,"ArticleDNA diverge da versão remota.");
        if (articleApprovalIssues(version, command.versionEvents).length) throw new AuthzError(409, "ArticleDNA não atende aos gates de aprovação.");
        // Importação consome aprovação remota; nunca aprova artefatos enviados pelo cliente.
        /*
         * O RadarItem é CONSTRUÍDO e VALIDADO antes de qualquer escrita.
         *
         * Sem o contexto do handoff o importador não resolve o Silo — os
         * ArticleDNA não declaram `siloId` por desenho — e devolvia lista
         * vazia. O `[0]` virava `undefined` e seguia para `importItem`, que
         * gravaria uma linha sem payload. Falta de contexto agora é recusa
         * declarada, com o artigo nomeado.
         *
         * O contexto chega do cliente como INSUMO: a validação abaixo confere
         * que o item resultante fecha com a versão e o hash que estão sendo
         * gravados, e o schema recusa o que não fechar.
         */
        const construidos = importArticlesToRadar([], [version], command.brandId, undefined, [], {}, command.hydrationByArticleId, {}, command.handoffContext as never);
        const item = construidos[0];
        if (!item) {
          throw new AuthzError(409, `Sem Silo canônico resolvido para "${version.payload.promise}": o handoff não pode gravar RadarItem sem pai.`);
        }
        const validado = RadarItemSchema.parse(item);
        if (validado.articleId !== version.payload.articleId
          || validado.articleDnaVersionId !== version.versionId
          || validado.articleDnaContentHash !== version.contentHash
          || validado.brandId !== command.brandId) {
          throw new AuthzError(409, "O RadarItem construído não corresponde ao ArticleDNA enviado.");
        }
        const row = await workflow.importItem({ marcaId: command.brandId, articleId: version.payload.articleId, stage: "radar", state: validado.state,
          sourceEntityId: version.entityId, sourceVersionId: version.versionId, sourceContentHash: version.contentHash, payload: validado, actorId: profile.userId });
        await decisions.append({ marcaId: command.brandId, workflowItemId: row.id, articleId: version.payload.articleId, eventType: "import_radar", toState: validado.state, sourceVersionId: version.versionId, actorId: profile.userId });
        const readback=await workflow.find(row.id);
        if(!radarReadbackMatches(readback,command.brandId,version.payload.articleId,version.versionId,version.contentHash)) throw new AuthzError(502,"Radar não confirmado no readback remoto.");
        await persistGlobalTransition(db, {
          brandId: command.brandId, articleId: version.payload.articleId, actorId: profile.userId,
          target: "ENVIADO_AO_RADAR", previous: ready.data, payload: base,
          sourceVersionId: version.versionId,
        });
        confirmedRadar.push(RadarItemSchema.parse({...readback!.payload as object,id:readback!.id,lockVersion:readback!.lock_version,state:readback!.state}));
       } catch (error) {
        /* Recusa de regra (409) é do artigo, não do lote. Infraestrutura (502, 503, banco) continua parando tudo. */
        if (error instanceof AuthzError && error.status === 409) {
          refused.push({ articleId: version.payload.articleId, code: error instanceof RecusaDeImportacao ? error.code : "refused", reason: error.message });
          continue;
        }
        throw error;
       }
      }
      return NextResponse.json({ok:true,radarItems:confirmedRadar,readbackConfirmed:true,refused});
    }
    if (command.action === "transition_radar") {
      await assertEditorialPermission(profile, command.brandId, "radar", command.target === "approved" ? "approve" : "edit");
      for (const id of command.itemIds) { const current = await workflow.find(id); if (!current || current.marca_id !== command.brandId || current.stage !== "radar") throw new AuthzError(404, "Item do Radar não encontrado.");
        if (!allowedRadar[current.state]?.includes(command.target)) throw new AuthzError(409, `Transição ${current.state} → ${command.target} inválida.`);
        await workflow.transition(id, command.expectedLocks[id], command.target, current.payload, profile.userId); await decisions.append({ marcaId: command.brandId, workflowItemId: id, articleId: current.article_id, eventType: "transition_radar", fromState: current.state, toState: command.target, actorId: profile.userId }); }
    }
    /*
     * ===== CORTE 2 · AS QUATRO AÇÕES DO PLANEJADOR SAÍRAM DAQUI =====
     *
     * `import_planner` criava o `PlannerItem` e movia o Radar para
     * `sent_planner`. `prepare_plan` e `approve_plan` faziam o ciclo do
     * `ContentPlan`. `start_writing` era a ÚNICA porta por onde
     * `publication_records` nascia — e exigia plano aprovado no Planejador.
     *
     * Nenhuma delas tinha dado a migrar: o banco real mostrou zero linhas de
     * `content_plan`, zero `stage='planner'` e zero `sent_planner`. O que elas
     * ainda faziam era permitir ESCRITA NOVA pelo caminho antigo.
     *
     * Publicações agora nasce em `/api/redator/publication-handoff`, com
     * autoridade em ContentDocument + origem Radar, e com readback obrigatório
     * antes de responder sucesso.
     */
    /*
     * CORTE 3.5 · `import_publications` saiu. A entrada em Publicações é
     * `sendWriterToPublications`, em /api/redator/publication-handoff, que
     * persiste e relê antes de responder sucesso.
     */
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Codigo proprio + caminho recusado. "Comando editorial invalido" sozinho
    // custou uma rodada inteira de investigacao: o cliente nao tinha como
    // saber QUAL campo o schema recusou.
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        code: "invalid_workflow_command",
        error: "Comando editorial inválido.",
        details: error.issues.map(issue => ({
          path: issue.path.map(part => String(part)),
          code: issue.code,
          message: issue.message,
        })),
      }, { status: 400 });
    }
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
