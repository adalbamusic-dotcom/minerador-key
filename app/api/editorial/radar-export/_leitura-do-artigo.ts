import "server-only";
import { WorkflowRepository } from "@/lib/server/editorial-repositories";
import { radarStartPorts } from "@/lib/server/radar-youtube-start";
import {
  radarPortableExportCurrentAnalysisOfRow,
  radarPortableExportCurrentVersionPick,
  radarPortableExportLatestAnalysis,
} from "@/lib/radar/portable-export-reading";
import type { RadarAnalysisVersion } from "@/lib/radar/analysis-contracts";

/**
 * ===== A ANÁLISE CORRENTE DO ARTIGO, PARA O EXPORT (E4 da SDD de egress) =====
 *
 * Arquivo do próprio export, ao lado da rota: não é rota (só `route.ts` é
 * público) e não é leitura compartilhada.
 *
 * A rota lia o item com `radarStartPorts.loadRadarState`, que reidrata as
 * corridas de TODAS as versões, e usava só a de maior número. Aqui a mesma
 * linha é lida com só a corrida dessa versão. A regra de escolha e a prova de
 * que ela é a antiga estão em `lib/radar/portable-export-reading.ts`.
 *
 * Quando a versão escolhida não passa no contrato, a leitura antiga responde,
 * inteira. É o único caso com duas leituras da linha.
 *
 * Qualquer erro da leitura estreita também cai na leitura antiga. O repositório
 * compartilhado não trata do mesmo jeito uma versão `null` no array: a leitura
 * estreita lança antes de consultar as corridas, e a antiga, sem corrida
 * nenhuma no item, devolve a linha intacta e ignora o elemento. Um erro real de
 * persistência volta a lançar na leitura antiga, exatamente como antes.
 *
 * Só leitura: nada aqui grava, e nada daqui volta ao banco. A escrita do Radar
 * continua lendo a linha crua por conta própria (R10 da SDD).
 *
 * É um objeto, como `radarStartPorts`, para que o teste troque a leitura pela
 * antiga e compare os dois CSVs byte a byte.
 */
export const radarExportArticleReads = {
  async currentAnalysis(input: { brandId: string; articleId: string }): Promise<RadarAnalysisVersion | null> {
    let leitura: ReturnType<typeof radarPortableExportCurrentAnalysisOfRow>;
    try {
      const linha = await new WorkflowRepository().findByArticleHydratingVersions(
        input.brandId,
        input.articleId,
        "radar",
        radarPortableExportCurrentVersionPick,
      );
      leitura = radarPortableExportCurrentAnalysisOfRow({ row: linha, brandId: input.brandId, articleId: input.articleId });
    } catch {
      leitura = { kind: "reread" };
    }
    if (leitura.kind === "current") return leitura.analysis;
    if (leitura.kind === "none") return null;
    const estado = await radarStartPorts.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
    return radarPortableExportLatestAnalysis(estado?.analyses);
  },
};
