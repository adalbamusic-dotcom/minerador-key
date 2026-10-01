import "server-only";

import type { PublishedReinforcementDeps, PublishedSerpBinding } from "@/lib/server/arquiteto-published-reinforcement";
import { listArticleFormationSerpAssessments, readbackArticleFormationSerpAssessment, resolveArticleFormationSerpAssessment, saveArticleFormationSerpAssessment } from "@/lib/server/arquiteto-article-serp-store";
import { readArticleFormationMarker, readbackArticleFormationMarker, saveArticleFormationMarker } from "@/lib/server/arquiteto-article-formation-marker-store";
import { listTerritoryWorkflowItems } from "@/lib/server/arquiteto-territory-store";
import { articleSerpBaseHash } from "@/lib/arquiteto/article-serp-gate";
import { siloIsHumanDecided } from "@/lib/arquiteto/territory";
import type { SerpFormationAssessment } from "@/lib/arquiteto/serp-formation";
import { loadCanonicalArquitetoWorkspace } from "@/lib/server/arquiteto-workspace";
import { serpAssessmentComposition } from "@/lib/arquiteto/published-formation-serp";
import type { PipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * AS LEITURAS DO "REFORÇAR PUBLICADOS" — as mesmas na rota da tela e na
 * ferramenta MCP da prévia, para a prévia (e o `decisionHash`) sair igual pelos
 * dois caminhos. Só leitura: as escritas são montadas pela rota, no Aplicar.
 */
export function publishedReinforcementReadDeps(context: PipelineContext): Pick<PublishedReinforcementDeps, "store" | "now" | "readWorkspace" | "readArticleSerpReferences"> {
  return {
    store: context,
    now: () => new Date(),
    readWorkspace: async () => {
      const workspace = await loadCanonicalArquitetoWorkspace(context);
      return { workflowItems: workspace.workflowItems, keywords: workspace.keywords, siloDnas: workspace.siloDnas, articleDnas: workspace.articleDnas };
    },
    readArticleSerpReferences: async () => (await listArticleFormationSerpAssessments(context)).map(item => ({
      candidateRef: item.candidateRef,
      territoryRef: item.payload.territoryRef,
      // A mesma referência que a mesa grava no "Concluir formação" (canonicalSerpReferenceFor).
      reference: { entityId: item.payload.assessment.id, versionId: `${item.payload.assessment.id}:${item.payload.formationBaseHash}`, contentHash: item.payload.assessment.contentHash },
      // A composição que o parecer observou: o Reforçar só aprova o DNA com o parecer DESTA composição.
      // Papéis das consultadas, as 4 lentes e se o parecer ainda vale (corretor 2026-09-28).
      composition: serpAssessmentComposition(item.payload.assessment, (item.payload.interpretation as { lenses?: unknown } | undefined)?.lenses),
    })),
  };
}

/**
 * O PARECER DA SERP NA FORMAÇÃO DA MESA, COM ACEITE E MARCADOR (2026-10-01).
 *
 * O mesmo vínculo do "Gravar melhorias": o parecer que a aprovação usou é
 * gravado sob a `formationRef` com o hash que a mesa espera (território,
 * principal, papéis, slug nulo do publicado, intenções e tema do Silo
 * decidido), recebe o aceite humano e a formação entra no marcador como
 * concluída — tudo relido. `approve` é o contexto com a permissão de aprovar.
 */
export function publishedReinforcementSerpBinding(context: PipelineContext, approve: PipelineContext): (input: PublishedSerpBinding) => Promise<void> {
  return async input => {
    const pareceres = await listArticleFormationSerpAssessments(context);
    const origem = pareceres.find(item => `${item.payload.assessment.id}:${item.payload.formationBaseHash}` === input.sourceVersionId);
    if (!origem) throw new Error("o parecer usado na aprovação não foi encontrado");
    const territorio = (await listTerritoryWorkflowItems(context)).find(item => item.territoryRef === input.territoryRef)?.territory;
    const decidido = territorio && siloIsHumanDecided(territorio.lifecycleStatus);
    const hash = articleSerpBaseHash({
      territoryRef: input.territoryRef,
      principalKeywordId: input.principalKeywordId,
      roles: input.members,
      // Publicado: a mesa não pergunta slug (a identidade publicada é fixa).
      suggestedSlug: null,
      intents: input.intents,
      siloContext: { centralEntity: decidido ? territorio!.centralEntity ?? null : null, macroIntent: decidido ? territorio!.macroIntent ?? null : null },
    });
    if (origem.candidateRef !== input.formationRef || origem.payload.formationBaseHash !== hash) {
      await saveArticleFormationSerpAssessment(context, {
        candidateRef: input.formationRef,
        territoryRef: input.territoryRef,
        formationBaseHash: hash,
        verdict: origem.payload.verdict,
        assessment: origem.payload.assessment as SerpFormationAssessment,
        interpretation: origem.payload.interpretation,
        operationRequestId: `reforco:${input.formationRef}:${hash}`,
      });
    }
    const agora = new Date().toISOString();
    await resolveArticleFormationSerpAssessment(approve, { candidateRef: input.formationRef, resolution: {
      decision: "accept_current_composition",
      reason: "Reforçar publicados: composição do artigo publicado aprovada por humano.",
      source: "human", decidedAt: agora, decidedBy: context.actorUserId,
      assessmentId: origem.payload.assessment.id, formationBaseHash: hash,
    } });
    const relido = await readbackArticleFormationSerpAssessment(context, input.formationRef);
    if (relido.payload.formationBaseHash !== hash || relido.payload.humanResolution?.decidedBy !== context.actorUserId) throw new Error("a releitura do parecer não confirmou o vínculo");

    const marcador = await readArticleFormationMarker(context);
    const concluida = { candidateRef: input.formationRef, territoryRef: input.territoryRef, principalKeywordId: input.principalKeywordId, members: input.members, formationBaseHash: hash, slug: null, fullPath: input.fullPath, concludedAt: agora, concludedBy: context.actorUserId, materializedArticleId: input.articleId };
    const formacoes = [...(marcador?.payload.concludedFormations ?? []).filter(item => item.materializedArticleId !== input.articleId && item.candidateRef !== input.formationRef), concluida];
    await saveArticleFormationMarker(context, { contractVersion: "article-formation-marker-v1", baseHash: marcador?.payload.baseHash ?? hash, processedAt: agora, confirmation: { status: "partial", confirmedAt: agora, confirmedArticleCount: formacoes.length, coveredKeywordCount: new Set(formacoes.flatMap(item => item.members.map(membro => membro.keywordId))).size, pendingSiloCount: marcador?.payload.confirmation.pendingSiloCount ?? 0, failedCount: marcador?.payload.confirmation.failedCount ?? 0 }, concludedFormations: formacoes });
    const marcadorRelido = await readbackArticleFormationMarker(context);
    if (!marcadorRelido.payload.concludedFormations.some(item => item.candidateRef === input.formationRef && item.materializedArticleId === input.articleId)) throw new Error("a releitura do marcador não confirmou a conclusão");
  };
}
