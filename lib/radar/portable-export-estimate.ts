import { radarSiloExportScopeLimitNotice, type RadarSiloExportScope } from "./portable-silo-scope.ts";

/**
 * ===== O TAMANHO DO EXPORT, ANTES DO CLIQUE (E4 da SDD de egress) =====
 *
 * "Silos completos" sem seleção manda TODOS os artigos do Radar da marca, e
 * cada artigo é lido do banco inteiro: a linha do item e as corridas da
 * investigação. A meta de egress é 100 MB por dia de trabalho. A tela não
 * sabe o tamanho real de cada item, porque as corridas não vêm na listagem.
 * Ela sabe quantos artigos vão e quais estão finalizados, e isso basta para
 * uma estimativa honesta, rotulada como estimativa.
 *
 * ==================== DE ONDE VÊM OS NÚMEROS (MEDIDO em 2026-09-23) ====================
 *
 * Care Glow, por `length(::text)` no remoto, só agregados, já com a leitura da
 * análise corrente estreita (só a corrida dela):
 *
 *   finalizado          11,63 MB = 2,50 (item + corrida corrente)
 *                                + 8,23 (autoridades: item + todas as corridas)
 *                                + 0,90 (camada de vídeo: item)
 *   em investigação     2,73 MB e 1,60 MB (os dois itens abertos), média 2,17
 *   lote                0,30 MB (ArticleDNA, SiloDNA e snapshots da marca)
 *   CSV                 ~133 KB por dossiê exportado (portable-export-response)
 *
 * Os números crescem com o histórico de cada investigação: é uma ordem de
 * grandeza, não uma conta. Por isso a frase diz "estimativa" e o arredondamento
 * é para cima.
 *
 * Domínio puro: sem fetch, sem storage, sem React.
 */

export const RADAR_EXPORT_READ_BYTES_PER_FINALIZED = 11_700_000;
export const RADAR_EXPORT_READ_BYTES_PER_OPEN = 2_200_000;
export const RADAR_EXPORT_READ_BYTES_PER_BATCH = 300_000;
export const RADAR_EXPORT_FILE_BYTES_PER_DOSSIER = 133_000;

/** A meta diária de egress da SDD (seção 1). */
export const RADAR_DAILY_EGRESS_TARGET_BYTES = 100_000_000;

/** A partir daqui a tela avisa: um quinto da meta do dia num clique. */
export const RADAR_EXPORT_LARGE_READ_BYTES = 20_000_000;

export type RadarSiloExportEstimate = {
  /** Artigos do pedido com investigação finalizada: são os que viram linha. */
  finalized: number;
  /** Os outros: também são lidos, e saem como recusados. */
  open: number;
  readBytes: number;
  fileBytes: number;
};

export function radarSiloExportEstimate(input: {
  articleIds: readonly string[];
  finalizedArticleIds: Iterable<string>;
}): RadarSiloExportEstimate {
  const finalizados = new Set(input.finalizedArticleIds);
  const pedidos = [...new Set(input.articleIds)];
  const finalized = pedidos.filter(id => finalizados.has(id)).length;
  const open = pedidos.length - finalized;
  return {
    finalized,
    open,
    readBytes: pedidos.length
      ? RADAR_EXPORT_READ_BYTES_PER_BATCH + finalized * RADAR_EXPORT_READ_BYTES_PER_FINALIZED + open * RADAR_EXPORT_READ_BYTES_PER_OPEN
      : 0,
    fileBytes: finalized * RADAR_EXPORT_FILE_BYTES_PER_DOSSIER,
  };
}

/** Megabytes em português, arredondados para cima: "0,2", "3,5", "28". */
export function radarExportMegabytes(bytes: number): string {
  const megas = Math.max(0, bytes) / 1_000_000;
  if (megas >= 10) return String(Math.ceil(megas));
  return (Math.ceil(megas * 10) / 10).toFixed(1).replace(".", ",");
}

/**
 * A frase da tela, só para "todos os silos" e só quando é grande.
 *
 * Com seleção, quem clicou já escolheu o tamanho. Sem seleção, a marca inteira
 * vai no pedido, e é aí que um clique pode gastar um quinto do dia.
 *
 * Acima do teto de artigos por pedido o clique não pede nada ao servidor
 * (`radarSiloExportScopeLimitNotice`): não há leitura a estimar, e as duas
 * frases se contradiriam.
 *
 * O título vai na cor de atenção e a mensagem no texto do item: o laranja de
 * `warning` sobre `surface-elevated` no tema claro não tem contraste para texto
 * corrido.
 */
export type RadarSiloExportSizeNotice = { title: string; message: string };

export function radarSiloExportSizeNotice(input: {
  scope: Pick<RadarSiloExportScope, "mode" | "articleIds">;
  finalizedArticleIds: Iterable<string>;
}): RadarSiloExportSizeNotice | null {
  if (input.scope.mode !== "all" || !input.scope.articleIds.length) return null;
  if (radarSiloExportScopeLimitNotice(input.scope)) return null;
  const estimativa = radarSiloExportEstimate({ articleIds: input.scope.articleIds, finalizedArticleIds: input.finalizedArticleIds });
  if (estimativa.readBytes < RADAR_EXPORT_LARGE_READ_BYTES) return null;
  return {
    title: "Exportação grande",
    message: [
      `Estimativa de ~${radarExportMegabytes(estimativa.readBytes)} MB lidos do banco`,
      `(a meta de leitura é ${radarExportMegabytes(RADAR_DAILY_EGRESS_TARGET_BYTES)} MB por dia)`,
      `e arquivo de ~${radarExportMegabytes(estimativa.fileBytes)} MB,`,
      `com ${estimativa.finalized} artigo(s) finalizado(s) e ${estimativa.open} ainda em investigação.`,
      "Para ler menos, selecione alguns silos na planilha e exporte em partes.",
    ].join(" "),
  };
}
