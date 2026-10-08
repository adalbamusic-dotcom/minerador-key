/**
 * O PEDIDO DE VERIFICAÇÃO — e por que ele não tem campo de URL.
 *
 * A tentação natural seria o cliente enviar a lista de endereços a verificar:
 * ele já os tem na tela. Seria também a maneira mais direta de transformar o
 * servidor num proxy para qualquer destino que alguém quisesse alcançar de
 * dentro da nossa rede.
 *
 * Então o pedido carrega DOMÍNIO, e o endereço é resolvido no servidor a
 * partir da análise persistida: os links observados nas páginas gravadas
 * produzem as candidatas, as candidatas produzem o plano, e o plano produz o
 * destino. Um domínio que não esteja no plano é recusado — não porque a URL
 * esteja errada, mas porque não existe caminho por onde ela entre.
 *
 * A mesma regra que protege a extração de concorrentes desde o R10.2D.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";

export const RADAR_SOURCE_VERIFICATION_ERROR = {
  REQUEST_INVALID: "SOURCE_REQUEST_INVALID",
  ANALYSIS_UNKNOWN: "SOURCE_ANALYSIS_UNKNOWN",
  ARTICLE_DNA_MISMATCH: "SOURCE_ARTICLE_DNA_MISMATCH",
  SOURCE_UNKNOWN: "SOURCE_UNKNOWN",
  PERSISTENCE_UNAVAILABLE: "SOURCE_PERSISTENCE_UNAVAILABLE",
} as const;

/**
 * Quantos domínios cabem num pedido.
 *
 * O teto é do servidor e existe para o lote ser previsível, não para limitar a
 * evidência: o cliente envia em lotes, como já faz na extração.
 */
export const RADAR_SOURCE_VERIFICATION_BATCH = 12;

export const RadarSourceVerificationRequestSchema = z.object({
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  /** A versão da análise sobre a qual o plano foi montado. */
  analysisVersionId: z.string().min(1),
  /** O fundamento: se mudou, esta verificação descreveria outro artigo. */
  articleDnaVersionId: z.string().min(1),
  /*
   * IDENTIDADES DE FONTE, NÃO ENDEREÇOS.
   *
   * `.strict()` fecha o objeto: um `url` enviado a mais não é ignorado em
   * silêncio, é recusado na porta.
   */
  sourceIds: z.array(z.string().min(1)).min(1).max(RADAR_SOURCE_VERIFICATION_BATCH),
  /** As keywords resolvidas do artigo, para priorizar por afirmação sensível. */
  keywordTexts: z.array(z.string().min(1)).max(20).default([]),
  centralEntities: z.array(z.string().min(1)).max(20).default([]),
}).strict();

export type RadarSourceVerificationRequest = z.infer<typeof RadarSourceVerificationRequestSchema>;

/** As identidades de fonte em lotes do tamanho que o contrato aceita. */
export function radarSourceVerificationBatches(sourceIds: readonly string[], size = RADAR_SOURCE_VERIFICATION_BATCH): string[][] {
  const lotes: string[][] = [];
  for (let index = 0; index < sourceIds.length; index += size) lotes.push([...sourceIds.slice(index, index + size)]);
  return lotes;
}

/** 2026-10-08 · A falha de fonte no formato que a versão da análise grava (`sourceVerificationFailures`). */
export type RadarSourceVerificationFailureRecord = {
  sourceId: string;
  domain: string;
  url: string;
  code: string;
  message: string;
  status: number | null;
  observedAt: string;
};

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

function hostDe(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * 2026-10-08 · A FALHA DA ROTA VIRA REGISTRO VÁLIDO, SEMPRE.
 *
 * A rota devolvia a fonte que falhou sem `sourceId` (e, na repetição, sem
 * domínio), e o contrato da versão exige os dois: uma fonte bloqueada recusava a
 * gravação da análise inteira ("expected string, received undefined") e a
 * pesquisa Google não fechava. Aqui o id vem da própria falha; sem ele, do plano
 * pelo endereço, ou pelo domínio quando só uma fonte do lote o tem, ou do lote
 * de uma fonte só. Sem como resolver, a falha fica registrada com um id próprio
 * (`resolved: false`) e NÃO volta à fila — repetir um id fora do plano faria a
 * rota recusar o lote inteiro.
 */
export function radarSourceVerificationFailureRecords(input: {
  failures: unknown;
  batch: readonly string[];
  plan: ReadonlyArray<{ sourceId: string; domain: string; candidateUrl: string }>;
  observedAt: string;
}): Array<RadarSourceVerificationFailureRecord & { resolved: boolean }> {
  const lista = Array.isArray(input.failures) ? input.failures : [];
  const doLote = input.plan.filter(item => input.batch.includes(item.sourceId));
  const porId = new Map(input.plan.map(item => [item.sourceId, item]));
  return lista.flatMap((bruto, indice) => {
    if (!bruto || typeof bruto !== "object") return [];
    const falha = bruto as Record<string, unknown>;
    const url = texto(falha.url);
    const dominio = texto(falha.domain);
    const declarado = texto(falha.sourceId);
    const doDominio = dominio ? doLote.filter(item => item.domain === dominio) : [];
    const alvo = (declarado && porId.get(declarado))
      || (url ? doLote.find(item => item.candidateUrl === url) : undefined)
      || (doDominio.length === 1 ? doDominio[0] : undefined)
      || (doLote.length === 1 ? doLote[0] : undefined)
      || null;
    const enderecoFinal = url || alvo?.candidateUrl || "";
    const status = typeof falha.status === "number" && Number.isInteger(falha.status) && falha.status >= 0 ? falha.status : null;
    return [{
      sourceId: alvo?.sourceId || declarado || `source:sem-id-${indice + 1}`,
      domain: dominio || alvo?.domain || hostDe(enderecoFinal) || enderecoFinal || "fonte sem endereço",
      url: enderecoFinal,
      code: texto(falha.code) || "verification_failed",
      message: texto(falha.message) || "A fonte não pôde ser verificada.",
      status,
      observedAt: texto(falha.observedAt) || input.observedAt,
      resolved: Boolean(alvo),
    }];
  });
}

export function radarSourceVerificationErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case RADAR_SOURCE_VERIFICATION_ERROR.ANALYSIS_UNKNOWN:
      return "A análise desta investigação não pôde ser lida do servidor; nenhuma fonte foi verificada.";
    case RADAR_SOURCE_VERIFICATION_ERROR.ARTICLE_DNA_MISMATCH:
      return "Os fundamentos do artigo mudaram desde esta análise; a verificação de fontes descreveria outra versão.";
    case RADAR_SOURCE_VERIFICATION_ERROR.SOURCE_UNKNOWN:
      return "Uma das fontes pedidas não está no plano de verificação desta investigação.";
    case RADAR_SOURCE_VERIFICATION_ERROR.PERSISTENCE_UNAVAILABLE:
      return "A leitura remota da investigação não está disponível; nenhuma fonte foi verificada.";
    default:
      return fallback;
  }
}
