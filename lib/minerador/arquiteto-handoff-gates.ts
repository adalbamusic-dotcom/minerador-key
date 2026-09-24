import { deriveProcessorRevalidation } from "./processor-revalidation.ts";
import { isHumanReviewCompleted } from "./human-review.ts";
import { hasCompleteLogicalOutputContract } from "./logical-processor.ts";
import { resolveMineradorProcessState } from "./process-state.ts";
import { isFullyConsolidatedQualification, type KeywordSemanticQualification } from "./keyword-semantic-qualification.ts";
import { resolveHandoffApprovalGate, type HandoffApprovalGate } from "./approved-package.ts";

export type MineradorHandoffKeyword = {
  id: string;
  keyword?: string;
  brand_id?: string | null;
  status?: string | null;
  /** Intenção da coluna: a Lógica completa a considera, como na aprovação. */
  intent?: string | null;
  volume_search?: number | null;
  results_allintitle?: number | null;
  analise_semantica?: Record<string, unknown> | null;
};

export type MineradorArquitetoHandoffGate = {
  keywordId: string;
  ok: boolean;
  reason?: string;
  logicProcessed: boolean;
  volumeValidated: boolean;
  resultsValidated: boolean;
  kgrReady: boolean;
  humanReviewCompleted: boolean;
  /** Evidência SERP persistida; working copy de sessão não conta. */
  serpEvidencePersisted: boolean;
  /** Intenção e Funil fechados por evidência conclusiva persistida. */
  semanticAxesConsolidated: boolean;
  statusAllowed: boolean;
  /**
   * Trava de aprovação no envio (SDD 2026-09-24, F1.7), o MESMO veredito do
   * servidor. `null` quando o status ou a marca já impedem o envio.
   */
  approvalGate: HandoffApprovalGate | null;
};

export type MineradorArquitetoHandoffBatchGate = {
  ok: boolean;
  reason: string;
  evaluations: MineradorArquitetoHandoffGate[];
  blocked: MineradorArquitetoHandoffGate[];
  /** Passam, mas a trava de aprovação tem o que dizer (anteriores à ativação ou já recebidas). */
  approvalAlerts?: MineradorArquitetoHandoffGate[];
};

function normalizedStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("pt-BR") : "";
}

/**
 * Estado de processo é informação: Revisão e a conclusividade da SERP seguem
 * no read-model para leitura e proveniência, sem vetar o envio.
 *
 * EMENDA (SDD 2026-09-24, F1.7): a trava de APROVAÇÃO — Lógica, Volume,
 * Resultados e KGR, ou só a Lógica para Assunto declarado — passa a valer no
 * envio para aprovações registradas a partir de `SERVER_APPROVAL_GATE_SINCE`.
 * As anteriores passam com alerta; a já recebida pelo Arquiteto também. O
 * veredito sai de `resolveHandoffApprovalGate`, o mesmo do servidor.
 *
 * Fora isso, resta integridade técnica: a keyword pertence à Brand ativa e o
 * status editorial permite o envio.
 */
function gateReason(input: Omit<MineradorArquitetoHandoffGate, "keywordId" | "ok" | "reason">): string | undefined {
  if (!input.statusAllowed) return "O status precisa permitir o envio ao Arquiteto.";
  if (input.approvalGate?.verdict === "refuse") return input.approvalGate.reason || undefined;
  return undefined;
}

export function evaluateMineradorArquitetoHandoff(
  keyword: MineradorHandoffKeyword,
  brandId: string | null | undefined,
  qualification?: KeywordSemanticQualification | null,
  options: { alreadyReceived?: boolean } = {},
): MineradorArquitetoHandoffGate {
  const semantic = keyword.analise_semantica || {};
  const processor = deriveProcessorRevalidation({
    semantic,
    volumeSearch: keyword.volume_search,
    resultsAllintitle: keyword.results_allintitle,
  });
  const logicProcessed = semantic.dna_origem === "logico_deterministico"
    && hasCompleteLogicalOutputContract({ semantic });
  const volumeValidated = processor.volume.validated;
  const resultsValidated = processor.results.validated;
  const quantitativeEvidenceReady = volumeValidated && resultsValidated;
  // A zero volume is a valid provider result but makes the ratio undefined.
  // It is not a reason to reject a human-approved keyword by itself.
  const kgrReady = quantitativeEvidenceReady && (processor.kgr.ready || processor.kgr.score === null);
  const currentProcess = typeof keyword.keyword === "string" && keyword.keyword.trim()
    ? resolveMineradorProcessState({
        id: keyword.id,
        keyword: keyword.keyword,
        volume_search: keyword.volume_search,
        results_allintitle: keyword.results_allintitle,
        analise_semantica: semantic,
      })
    : null;
  const humanReviewCompleted = currentProcess
    ? currentProcess.review.complete
    : isHumanReviewCompleted(semantic);
  const status = normalizedStatus(keyword.status);
  const statusAllowed = status === "aprovado" || status === "publicado";
  const brandMatches = Boolean(brandId && keyword.brand_id && keyword.brand_id === brandId);
  const base = {
    logicProcessed,
    volumeValidated,
    resultsValidated,
    kgrReady,
    humanReviewCompleted,
    // Fonte única: o artifact remoto. Não existe mais atalho por blob de sessão.
    serpEvidencePersisted: Boolean(qualification),
    semanticAxesConsolidated: isFullyConsolidatedQualification(qualification),
    statusAllowed: statusAllowed && brandMatches,
    approvalGate: statusAllowed && brandMatches
      ? resolveHandoffApprovalGate({
        semantic,
        intent: keyword.intent,
        volumeSearch: keyword.volume_search,
        resultsAllintitle: keyword.results_allintitle,
        alreadyReceived: options.alreadyReceived === true,
      })
      : null,
  };
  const reason = !brandMatches
    ? "A keyword não pertence à Brand ativa."
    : gateReason(base);
  return {
    keywordId: keyword.id,
    ok: !reason,
    reason,
    ...base,
  };
}

export function evaluateMineradorArquitetoHandoffBatch(input: {
  keywords: readonly MineradorHandoffKeyword[];
  brandId: string | null | undefined;
  qualifications?: Readonly<Record<string, KeywordSemanticQualification>>;
  /** Ids que o Arquiteto já recebeu, quando a tela os conhece: só alerta. */
  alreadyReceivedKeywordIds?: ReadonlySet<string>;
}): MineradorArquitetoHandoffBatchGate {
  if (!input.brandId) {
    return { ok: false, reason: "A Brand ativa é necessária para enviar ao Arquiteto.", evaluations: [], blocked: [] };
  }
  if (!input.keywords.length) {
    return { ok: false, reason: "Selecione ao menos uma keyword para enviar ao Arquiteto.", evaluations: [], blocked: [] };
  }
  const evaluations = input.keywords.map(keyword => evaluateMineradorArquitetoHandoff(keyword, input.brandId, input.qualifications?.[keyword.id] || null, {
    alreadyReceived: input.alreadyReceivedKeywordIds?.has(keyword.id) === true,
  }));
  const blocked = evaluations.filter(evaluation => !evaluation.ok);
  const alerts = evaluations.filter(evaluation => evaluation.ok && evaluation.approvalGate?.verdict === "alert");
  // Aditivo: só aparece quando há alerta, para o objeto de hoje não mudar.
  const approvalAlerts = alerts.length ? { approvalAlerts: alerts } : {};
  if (blocked.length === 0) return { ok: true, reason: "Pronto para enviar ao Arquiteto.", evaluations, blocked, ...approvalAlerts };
  const firstReason = blocked.find(evaluation => evaluation.reason)?.reason || "O envio exige status aprovado na Brand ativa.";
  return {
    ok: false,
    reason: blocked.length === 1 ? firstReason : `${blocked.length} keyword(s) ainda não podem ser enviadas. ${firstReason}`,
    evaluations,
    blocked,
    ...approvalAlerts,
  };
}
