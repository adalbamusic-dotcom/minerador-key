/**
 * A CURADORIA DA PESQUISA PROFUNDA.
 *
 * Ela NÃO substitui a curadoria da SERP canônica: a canônica continua sendo a
 * lista do artigo, com `organic:<position>`, snapshot, revisão e aprovação. Esta
 * é outra decisão, sobre outro conjunto — o universo pesquisável inteiro.
 *
 * O VOCABULÁRIO É O MESMO, por escolha: `primary`, `support`, `format`,
 * `excluded` e `pending` já existem na curadoria canônica e significam a mesma
 * coisa aqui. Só `authority` é novo, porque o universo enxerga fonte de
 * autoridade e a SERP canônica nunca precisou nomear isso. Uma taxonomia, com um
 * valor a mais — não duas taxonomias.
 *
 * TRÊS REGRAS:
 *
 *   1. Recorrência SUGERE, nunca decide. Uma URL em quatro consultas chega
 *      pré-classificada e continua `pending` até uma pessoa dizer o contrário.
 *   2. Marcar é rascunho. Só `Confirmar seleção (N)` grava, uma vez.
 *   3. Curadoria descreve UM universo. Se o universo muda, a decisão anterior
 *      fica `STALE` — preservada, nunca reaplicada em silêncio.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import type { RadarResearchReference } from "./research-reference.ts";
import type { RadarCompetitorClass } from "./competitor-universe.ts";

/** O mesmo vocabulário da curadoria canônica, mais `authority`. */
export const RadarResearchDecisionSchema = z.enum(["primary", "support", "format", "authority", "excluded", "pending"]);
export type RadarResearchDecision = z.infer<typeof RadarResearchDecisionSchema>;

export const RadarResearchCurationEntrySchema = z.object({
  referenceId: z.string().min(1),
  /** A URL normalizada — a identidade que o servidor resolve na extração. */
  normalizedUrl: z.string().min(1),
  /** A URL buscável. Guardada aqui porque o servidor NÃO aceita URL do cliente. */
  url: z.string().min(1),
  decision: RadarResearchDecisionSchema,
  reason: z.string().max(1000).default(""),
}).strict();
export type RadarResearchCurationEntry = z.infer<typeof RadarResearchCurationEntrySchema>;

export const RadarResearchCurationSchema = z.object({
  /** A impressão do universo que esta curadoria descreve. */
  universeFingerprint: z.string().min(1),
  confirmedAt: z.string().min(1),
  confirmedBy: z.string().min(1),
  references: z.array(RadarResearchCurationEntrySchema),
}).strict();
export type RadarResearchCuration = z.infer<typeof RadarResearchCurationSchema>;

/**
 * A impressão do universo.
 *
 * Referências e recorrência. Se uma URL entra, sai, ou passa a aparecer em outra
 * consulta, a impressão muda — e a curadoria anterior deixa de descrever o que
 * está na tela.
 */
export function radarResearchUniverseFingerprint(references: readonly Pick<RadarResearchReference, "referenceId" | "queryCount">[]): string {
  return references
    .map(reference => `${reference.referenceId}:${reference.queryCount}`)
    .sort()
    .join("|") || "universo-vazio";
}

/**
 * A pré-classificação: o que o universo observou, oferecido como sugestão.
 *
 * Nunca é a decisão. `decision` continua `pending` até a pessoa marcar.
 */
export function radarSuggestedResearchDecision(classification: RadarCompetitorClass): RadarResearchDecision {
  return ({
    EDITORIAL_COMPETITOR: "primary",
    COMMERCIAL_COMPETITOR: "support",
    PRODUCT_REFERENCE: "support",
    FORMAT_REFERENCE: "format",
    AUTHORITY_SOURCE: "authority",
    SERP_FEATURE: "excluded",
    LATERAL_REFERENCE: "pending",
    NOT_RELEVANT: "pending",
  } as Record<RadarCompetitorClass, RadarResearchDecision>)[classification];
}

/**
 * Quais decisões colocam a página na amostra analisável.
 *
 * `authority` entra: uma fonte oficial ou um estudo citado pela busca é
 * evidência que o artigo vai precisar, e nada do que a pesquisa encontrou pode
 * ser desperdiçado. `format` fica de fora porque vídeo e rede social não rendem
 * texto para extrair — o formato já foi observado na própria SERP.
 */
export const radarResearchDecisionIsAnalyzable = (decision: RadarResearchDecision) =>
  decision === "primary" || decision === "support" || decision === "authority";

export type RadarResearchCurationRow = {
  reference: RadarResearchReference;
  /** A decisão vigente: rascunho, se houver; senão a confirmada; senão pendente. */
  decision: RadarResearchDecision;
  confirmedDecision: RadarResearchDecision | null;
  suggestedDecision: RadarResearchDecision;
  reason: string;
  /** Marcada na tela e ainda não gravada. */
  dirty: boolean;
  analyzable: boolean;
};

export type RadarResearchCurationView = {
  /** Existe curadoria confirmada para ESTE universo? */
  confirmed: boolean;
  /** Existe curadoria confirmada, porém de outro universo? */
  stale: boolean;
  universeFingerprint: string;
  confirmedFingerprint: string | null;
  confirmedAt: string | null;
  rows: RadarResearchCurationRow[];
  /** Todas as referências curáveis — o universo inteiro, não a SERP canônica. */
  availableCount: number;
  selectedRows: RadarResearchCurationRow[];
  selectedCount: number;
  pendingCount: number;
  /** Quantas marcações aguardam confirmação. */
  dirtyCount: number;
};

export function buildRadarResearchCurationView(input: {
  references: readonly RadarResearchReference[];
  curation?: RadarResearchCuration | null;
  /** Marcações locais, por referenceId. Não persistidas até confirmar. */
  draft?: Record<string, { decision: RadarResearchDecision; reason?: string }>;
}): RadarResearchCurationView {
  const universeFingerprint = radarResearchUniverseFingerprint(input.references);
  const curation = input.curation || null;
  const stale = Boolean(curation && curation.universeFingerprint !== universeFingerprint);
  const confirmadas = new Map((curation && !stale ? curation.references : []).map(entry => [entry.referenceId, entry]));
  const draft = input.draft || {};

  const rows: RadarResearchCurationRow[] = input.references.map(reference => {
    const confirmada = confirmadas.get(reference.referenceId) || null;
    const rascunho = draft[reference.referenceId];
    const suggested = radarSuggestedResearchDecision(reference.classification);
    const decision = rascunho?.decision || confirmada?.decision || "pending";
    return {
      reference,
      decision,
      confirmedDecision: confirmada?.decision || null,
      suggestedDecision: suggested,
      reason: rascunho?.reason ?? confirmada?.reason ?? "",
      dirty: Boolean(rascunho && rascunho.decision !== (confirmada?.decision || "pending")),
      analyzable: radarResearchDecisionIsAnalyzable(decision),
    };
  });

  const selectedRows = rows.filter(row => row.analyzable);
  return {
    confirmed: Boolean(curation && !stale),
    stale,
    universeFingerprint,
    confirmedFingerprint: curation?.universeFingerprint || null,
    confirmedAt: curation?.confirmedAt || null,
    rows,
    availableCount: rows.length,
    selectedRows,
    selectedCount: selectedRows.length,
    pendingCount: rows.filter(row => row.decision === "pending").length,
    dirtyCount: rows.filter(row => row.dirty).length,
  };
}

/**
 * A curadoria a gravar — uma escrita, com o universo que ela descreve.
 *
 * Guarda a URL de cada referência decidida: é dela que o servidor resolve o
 * destino da extração, sem nunca aceitar URL do cliente.
 */
export function buildRadarResearchCuration(input: {
  view: RadarResearchCurationView;
  confirmedBy: string;
  now?: string;
}): RadarResearchCuration {
  return RadarResearchCurationSchema.parse({
    universeFingerprint: input.view.universeFingerprint,
    confirmedAt: input.now || new Date().toISOString(),
    confirmedBy: input.confirmedBy,
    references: input.view.rows
      .filter(row => row.decision !== "pending")
      .map(row => ({
        referenceId: row.reference.referenceId,
        normalizedUrl: row.reference.normalizedUrl,
        url: row.reference.url,
        decision: row.decision,
        reason: row.reason,
      })),
  });
}

/**
 * O SERVIDOR É A AUTORIDADE SOBRE O PAR referenceId ↔ URL.
 *
 * Esta função é a única fonte da URL de uma referência na extração. O cliente
 * manda o id; a URL sai daqui, da curadoria confirmada e persistida. Um id
 * legítimo com URL trocada deixa de ser possível porque a URL do pedido não é
 * lida em lugar nenhum.
 */
export function resolveRadarResearchReferenceUrl(
  curation: RadarResearchCuration | null | undefined,
  referenceId: string,
): { url: string; normalizedUrl: string; decision: RadarResearchDecision } | null {
  const entry = curation?.references.find(item => item.referenceId === referenceId);
  return entry ? { url: entry.url, normalizedUrl: entry.normalizedUrl, decision: entry.decision } : null;
}

export const radarResearchDecisionLabel = (decision: RadarResearchDecision) => ({
  primary: "Concorrente",
  support: "Apoio",
  format: "Formato",
  authority: "Fonte de autoridade",
  excluded: "Ignorada",
  pending: "Aguardando decisão",
}[decision]);
