import type { GuardianReport } from "./contracts.ts";

/**
 * O RESUMO DO GUARDIÃO NO PAINEL DE QUEM REDIGE.
 *
 * O painel roda sempre uma prévia local (`runGuardian(documento, "local")`),
 * que não lê o Assunto nem as divergências. Quando o servidor devolve o seu
 * relatório, é ELE que responde "quantos bloqueios, quantos avisos": a lista
 * de achados já vinha dele, e as contagens vinham da prévia, que não conhece
 * a virada nem o link para o destino. Daí o painel dizer "0 aviso(s)" com os
 * avisos do Assunto listados logo abaixo.
 *
 * Os `notices` são o que o servidor NÃO conseguiu conferir (por exemplo, o
 * Assunto que não pôde ser lido). Eles vêm com um código na frente, feito
 * para o MCP; aqui viram frase para gente. Sem relatório do servidor não há
 * `notices`, e o resumo é o de antes: "Prévia local" e as contagens locais.
 *
 * Domínio puro: sem fetch, sem storage, sem React.
 */

type ContagemDoGuardiao = Pick<GuardianReport, "blockingCount" | "warningCount"> & { notices?: readonly string[] };

export type WriterGuardianPanelNotice = {
  /** O texto que a pessoa lê. */
  text: string;
  /** O texto do servidor, sem tradução, para quem precisar diagnosticar. */
  raw: string;
};

export type WriterGuardianPanelSummary = {
  source: "server" | "local";
  label: "Análise atual" | "Prévia local";
  blockingCount: number;
  warningCount: number;
  notices: WriterGuardianPanelNotice[];
};

export const WRITER_GUARDIAN_SUBJECT_NOT_READ_NOTICE =
  "Não foi possível ler o Assunto; a virada e o link para o destino não foram conferidos.";

const CODIGO_NA_FRENTE = /^[a-z][a-z0-9_]*(?:\s\([^)]*\))?:\s+/;

/** O aviso do servidor em frase para quem redige; o código técnico sai. */
export function writerGuardianNoticeText(notice: string): string {
  const bruto = notice.trim();
  if (/^assunto_nao_lido\b/.test(bruto)) return WRITER_GUARDIAN_SUBJECT_NOT_READ_NOTICE;
  const semCodigo = bruto.replace(CODIGO_NA_FRENTE, "");
  return semCodigo ? semCodigo.charAt(0).toUpperCase() + semCodigo.slice(1) : bruto;
}

export function writerGuardianPanelSummary(
  serverReport: ContagemDoGuardiao | null | undefined,
  localReport: ContagemDoGuardiao | null | undefined,
): WriterGuardianPanelSummary {
  if (serverReport) {
    return {
      source: "server",
      label: "Análise atual",
      blockingCount: serverReport.blockingCount,
      warningCount: serverReport.warningCount,
      notices: (serverReport.notices ?? [])
        .filter(notice => notice.trim())
        .map(notice => ({ text: writerGuardianNoticeText(notice), raw: notice })),
    };
  }
  return {
    source: "local",
    label: "Prévia local",
    blockingCount: localReport?.blockingCount || 0,
    warningCount: localReport?.warningCount || 0,
    notices: [],
  };
}

/**
 * Quantos bloqueios impedem aprovar pelo painel: o maior entre a prévia local
 * e o resumo mostrado. Um bloqueio que só o servidor viu (uma divergência, por
 * exemplo) não pode aparecer no resumo e deixar aprovar. Sem relatório do
 * servidor, o resumo é a própria prévia e o número é o de antes.
 */
export function writerGuardianApprovalBlockingCount(
  summary: Pick<WriterGuardianPanelSummary, "blockingCount">,
  localReport: Pick<ContagemDoGuardiao, "blockingCount"> | null | undefined,
): number {
  return Math.max(localReport?.blockingCount || 0, summary.blockingCount || 0);
}
