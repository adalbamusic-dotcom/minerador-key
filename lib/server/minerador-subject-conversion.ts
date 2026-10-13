import "server-only";
import type { ConversionFollowUp } from "@/lib/minerador/subject-conversion-core";
import { runKeywordLogicWithCore } from "./minerador-keyword-decision-core";
import { approveKeywordsOnServer, sendKeywordsToArquitetoOnServer } from "./minerador-approve-and-send";

/**
 * O QUE VEM DEPOIS DE CONVERTER (SDD `sdd-conversao-assunto-legado-2026-10-13.md` §5.2,
 * passos 4 e 5): os MESMOS núcleos do botão do Minerador e do MCP — a Lógica
 * determinística (`runKeywordLogicWithCore`, grátis), a aprovação
 * (`keywordDecisionEntries` + `applyKeywordDecisionEntries`, com a D2-bis: só a
 * Lógica) e o envio ao Arquiteto (`createMineradorArquitetoHandoff`). O ator é o
 * autenticado de quem chama; quem chama já conferiu as permissões.
 *
 * 2026-10-13 · SDD acelerar, item 2: aprovar e enviar saem do encadeamento
 * único `lib/server/minerador-approve-and-send.ts` (o mesmo de "Aprovar e
 * enviar ao Arquiteto"); o envio é parcial — a keyword recusada fica fora com
 * o motivo e as outras seguem.
 */
export function serverConversionFollowUp(brandId: string, actorId: string): ConversionFollowUp {
  return {
    runLogic: async keywordIds => {
      const result = await runKeywordLogicWithCore({ brandId, keywordIds });
      return { applied: result.applied, failed: result.failed };
    },
    approve: keywordIds => approveKeywordsOnServer(brandId, actorId, keywordIds),
    send: keywordIds => sendKeywordsToArquitetoOnServer(brandId, actorId, keywordIds),
  };
}
