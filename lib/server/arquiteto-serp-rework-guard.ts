import "server-only";

/**
 * ===== GUARDA DE RETRABALHO NA COLETA PAGA DA SERP DO ARTIGO (F5) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §10.3.
 * Módulo próprio (só domínio da guarda + linha do guarda) para a rota da SERP
 * não carregar as leituras do Assunto e dos grupos.
 */

import { assessRework, decideRework, operationFingerprint, reworkView, type ReworkAssessment, type ReworkOverride } from "@/lib/editorial/rework-guard";
import { readReworkLedgerRows, recordOperation } from "./rework-guard";
import type { PipelineContext } from "./pipeline-runtime";

/* ------------------------------------------------------------------------ */
/* Coleta paga da SERP do artigo (`/api/arquiteto/serp`)                     */
/* ------------------------------------------------------------------------ */

export type SerpReworkGroup = {
  id: string;
  publishedAnchorId?: string | null;
  keywordIds: readonly string[];
  principalSuggestion: { keywordId: string };
};

export type SerpReworkGate = {
  /** Impressão digital de cada artigo do pedido (articleId → fingerprint). */
  fingerprints: Map<string, string>;
  /** Artigos cuja coleta paga da MESMA composição já terminou inconclusiva. */
  refused: Array<{ articleId: string; assessment: ReworkAssessment }>;
  /** O motivo do "Refazer mesmo assim", quando aceito. */
  overrideReason: string | null;
};

const serpArticleId = (group: SerpReworkGroup) => group.publishedAnchorId || group.id;

/**
 * A GUARDA DA COLETA PAGA (§10.3): o cache por lente continua; a guarda só
 * impede RECOLETAR a mesma composição (artigo + base + membros + principal +
 * lentes) que já foi paga e deu parecer inconclusivo, sem nada ter mudado. O
 * artigo barrado sai do plano pago e da execução (nada é pago por ele); os
 * outros seguem. "Refazer mesmo assim" com motivo (D11) passa.
 */
export async function serpFormationReworkGate(context: PipelineContext, input: {
  groups: readonly SerpReworkGroup[];
  formationBaseHashes?: Record<string, string>;
  lenses: readonly string[];
  resultLimit: number;
  location: string;
  language: string;
  override?: ReworkOverride;
}): Promise<SerpReworkGate> {
  const fingerprints = new Map<string, string>();
  for (const group of input.groups) {
    const articleId = serpArticleId(group);
    fingerprints.set(articleId, await operationFingerprint("serp_formation_collect", {
      articleId,
      formationBaseHash: input.formationBaseHashes?.[articleId] ?? null,
      principalKeywordId: group.principalSuggestion.keywordId,
      keywordIds: [...group.keywordIds].sort(),
      lenses: [...input.lenses].sort(),
      resultLimit: input.resultLimit,
      location: input.location,
      language: input.language,
    }));
  }
  const previous = await readReworkLedgerRows(context, "serp_formation_collect", [...fingerprints.values()]);
  const refused: SerpReworkGate["refused"] = [];
  let overrideReason: string | null = null;
  for (const [articleId, fingerprint] of fingerprints) {
    const assessment = assessRework({ kind: "serp_formation_collect", fingerprint, previous: previous.get(fingerprint) ?? null, policy: { sameInputs: "ignore", sameRefusal: "block" } });
    const decision = decideRework(assessment, input.override);
    if (!decision.proceed) refused.push({ articleId, assessment });
    else if (decision.overridden) overrideReason = decision.overrideReason;
  }
  return { fingerprints, refused, overrideReason };
}

/** A projeção do que a guarda barrou, para a prévia e a resposta. */
export function serpReworkView(gate: SerpReworkGate) {
  return gate.refused.map(item => ({ articleId: item.articleId, ...reworkView(item.assessment)! }));
}

/**
 * Registra a coleta PAGA de cada artigo: inconclusiva = recusa (a próxima
 * recoleta igual é barrada); com parecer = sucesso. Melhor esforço.
 */
export async function recordSerpFormationOutcomes(context: PipelineContext, gate: SerpReworkGate, outcomes: ReadonlyArray<{ articleId: string; verdict: string; recommendation?: string | null; workflowItemId?: string | null }>): Promise<void> {
  for (const outcome of outcomes) {
    const fingerprint = gate.fingerprints.get(outcome.articleId);
    if (!fingerprint) continue;
    const inconclusivo = outcome.verdict === "INCONCLUSIVE";
    await recordOperation(context, {
      kind: "serp_formation_collect",
      fingerprint,
      inputsSummary: `Coleta paga da SERP do artigo ${outcome.articleId}.`,
    }, {
      outcome: inconclusivo ? "refused" : "succeeded",
      outcomeCode: inconclusivo ? "SERP_INCONCLUSIVE" : `SERP_${outcome.verdict}`,
      message: inconclusivo
        ? `a SERP paga desta composição deu parecer inconclusivo${outcome.recommendation ? ` (${outcome.recommendation.replace(/[.\s]+$/, "")})` : ""}; pagar de novo a mesma composição repetiria o resultado — mude a composição ou decida "Manter" com motivo`
        : null,
      resultRef: outcome.workflowItemId ?? outcome.articleId,
      costUsd: null,
      ...(gate.overrideReason ? { overrideReason: gate.overrideReason } : {}),
    });
  }
}
