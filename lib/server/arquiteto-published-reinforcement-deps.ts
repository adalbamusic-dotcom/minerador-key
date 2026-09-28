import "server-only";

import type { PublishedReinforcementDeps } from "@/lib/server/arquiteto-published-reinforcement";
import { listArticleFormationSerpAssessments } from "@/lib/server/arquiteto-article-serp-store";
import { loadCanonicalArquitetoWorkspace } from "@/lib/server/arquiteto-workspace";
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
    })),
  };
}
