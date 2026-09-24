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
/**
 * O arquivo do formato "Para escrever": ~14 kB por artigo (a amostra offline
 * de 2026-09-23 mediu de 4 a 14 mil caracteres por artigo, mais a linha de
 * topo). A LEITURA do banco é a mesma nos dois formatos; só o arquivo muda.
 */
export const RADAR_EXPORT_WRITING_FILE_BYTES_PER_DOSSIER = 14_000;

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
  /** O formato do arquivo. Omitido, é o completo — a conta de antes. */
  exportMode?: RadarExportMode;
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
    fileBytes: finalized * (input.exportMode === "writing" ? RADAR_EXPORT_WRITING_FILE_BYTES_PER_DOSSIER : RADAR_EXPORT_FILE_BYTES_PER_DOSSIER),
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
  /** O formato escolhido na tela. Omitido, o aviso cita o arquivo do formato completo, como antes. */
  exportMode?: RadarExportMode;
}): RadarSiloExportSizeNotice | null {
  if (input.scope.mode !== "all" || !input.scope.articleIds.length) return null;
  if (radarSiloExportScopeLimitNotice(input.scope)) return null;
  const estimativa = radarSiloExportEstimate({ articleIds: input.scope.articleIds, finalizedArticleIds: input.finalizedArticleIds, exportMode: input.exportMode });
  if (estimativa.readBytes < RADAR_EXPORT_LARGE_READ_BYTES) return null;
  return {
    title: "Exportação grande",
    message: [
      `Estimativa de ~${radarExportMegabytes(estimativa.readBytes)} MB lidos do banco`,
      `(a meta de leitura é ${radarExportMegabytes(RADAR_DAILY_EGRESS_TARGET_BYTES)} MB por dia)`,
      `e arquivo de ~${radarExportMegabytes(estimativa.fileBytes)} MB${input.exportMode === "writing" ? " no formato para escrever" : ""},`,
      `com ${estimativa.finalized} artigo(s) finalizado(s) e ${estimativa.open} ainda em investigação.`,
      "Para ler menos, selecione alguns silos na planilha e exporte em partes.",
    ].join(" "),
  };
}

/* ======================= 2026-09-23 · o formato do CSV ======================= */

/**
 * ===== DOIS FORMATOS, UMA ESCOLHA =====
 *
 * "Para escrever" é o padrão da tela: 13 colunas fixas, o que uma IA ou um
 * redator precisa (`lib/radar/portable-writing-export.ts`). "Completo
 * (técnico)" é o formato de antes, sem mudança, para auditoria. A LEITURA do
 * banco é a mesma nos dois — o que muda é o arquivo.
 *
 * Os tamanhos por artigo são os medidos no arquivo real do usuário (formato
 * completo: 180 a 280 mil caracteres por artigo, 61 a 63 colunas) e na amostra
 * offline do formato novo (8 a 14 mil). Estimativa, rotulada como tal.
 */
export type RadarExportMode = "writing" | "full";

export const RADAR_EXPORT_MODE_DEFAULT: RadarExportMode = "writing";

/**
 * Chave de preferência de apresentação no navegador. Nunca fonte de verdade.
 *
 * 2026-09-23 · O card "Exportar para escrever" deixou de ter seletor de
 * formato: o botão principal é sempre "para escrever" e o técnico mora em
 * "Avançado (auditoria)". A tela parou de LER e de GRAVAR esta chave; o valor
 * que já estiver no navegador fica onde está (AGENTS §10: não se limpa
 * armazenamento local sem autorização).
 */
export const RADAR_EXPORT_MODE_STORAGE_KEY = "minerador-key.radar.export-mode";

export const RADAR_EXPORT_MODES: ReadonlyArray<{ mode: RadarExportMode; label: string; helper: string; columns: string; charsPerArticle: string }> = [
  {
    mode: "writing",
    label: "Para escrever (recomendado)",
    helper: "O que a IA ou o redator precisa: 13 colunas, cerca de 10 mil caracteres por artigo.",
    columns: "13 colunas",
    charsPerArticle: "cerca de 10 mil caracteres por artigo",
  },
  {
    mode: "full",
    label: "Completo (técnico)",
    helper: "Tudo o que o Radar gravou, para auditoria. Não use para escrever: 61 a 63 colunas, 180 mil caracteres ou mais por artigo, e o Excel corta células acima de 32.767 caracteres.",
    columns: "61 a 63 colunas",
    charsPerArticle: "180 mil caracteres ou mais por artigo",
  },
];

/** A dica de abertura: o Excel em português separa por ";", e o arquivo usa ",". */
export const RADAR_EXPORT_EXCEL_HINT = "No Excel em português, abra por Dados > De Texto/CSV.";

/** Qualquer valor que não seja "full" é o padrão: preferência gravada corrompida não muda o formato. */
export function radarExportModeOf(valor: unknown): RadarExportMode {
  return valor === "full" ? "full" : RADAR_EXPORT_MODE_DEFAULT;
}

/** O rótulo curto do formato escolhido, para o item do menu. */
export function radarExportModeLabel(mode: RadarExportMode): string {
  return mode === "full" ? "completo (técnico)" : "para escrever";
}
