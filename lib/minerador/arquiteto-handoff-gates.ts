import { deriveProcessorRevalidation } from "./processor-revalidation.ts";
import { isCompletedSemanticReview } from "./semantic-review.ts";
import { isHumanReviewCompleted } from "./human-review.ts";
import { hasCompleteLogicalOutputContract } from "./logical-processor.ts";
import { resolveMineradorProcessState } from "./process-state.ts";
import { isFullyConsolidatedQualification, type KeywordSemanticQualification } from "./keyword-semantic-qualification.ts";

export type MineradorHandoffKeyword = {
  id: string;
  keyword?: string;
  brand_id?: string | null;
  status?: string | null;
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
  aiCompleted: boolean;
  humanReviewCompleted: boolean;
  /** Evidência SERP persistida; working copy de sessão não conta. */
  serpEvidencePersisted: boolean;
  /** Intenção e Funil fechados por evidência conclusiva persistida. */
  semanticAxesConsolidated: boolean;
  statusAllowed: boolean;
};

export type MineradorArquitetoHandoffBatchGate = {
  ok: boolean;
  reason: string;
  evaluations: MineradorArquitetoHandoffGate[];
  blocked: MineradorArquitetoHandoffGate[];
};

function normalizedStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("pt-BR") : "";
}

/**
 * Estado de processo é informação, nunca veto editorial. Lógica, Volume,
 * Resultados, KGR, IA, Revisão e a conclusividade da SERP continuam no
 * read-model para leitura e proveniência, mas não bloqueiam o envio: quem
 * decide enviar é o humano, sobre o estado que a keyword tem hoje.
 *
 * Resta apenas integridade técnica: a keyword pertence à Brand ativa e o
 * status editorial permite o envio.
 */
function gateReason(input: Omit<MineradorArquitetoHandoffGate, "keywordId" | "ok" | "reason">): string | undefined {
  if (!input.statusAllowed) return "O status precisa permitir o envio ao Arquiteto.";
  return undefined;
}

export function evaluateMineradorArquitetoHandoff(
  keyword: MineradorHandoffKeyword,
  brandId: string | null | undefined,
  qualification?: KeywordSemanticQualification | null,
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
  const aiCompleted = currentProcess
    ? currentProcess.ai.complete
    : isCompletedSemanticReview(semantic.ai_review)
      || isCompletedSemanticReview(semantic.ia_revisao)
      || isCompletedSemanticReview(semantic.revisao_ia)
      || isCompletedSemanticReview(semantic.semantic_review);
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
    aiCompleted,
    humanReviewCompleted,
    // Fonte única: o artifact remoto. Não existe mais atalho por blob de sessão.
    serpEvidencePersisted: Boolean(qualification),
    semanticAxesConsolidated: isFullyConsolidatedQualification(qualification),
    statusAllowed: statusAllowed && brandMatches,
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
}): MineradorArquitetoHandoffBatchGate {
  if (!input.brandId) {
    return { ok: false, reason: "A Brand ativa é necessária para enviar ao Arquiteto.", evaluations: [], blocked: [] };
  }
  if (!input.keywords.length) {
    return { ok: false, reason: "Selecione ao menos uma keyword para enviar ao Arquiteto.", evaluations: [], blocked: [] };
  }
  const evaluations = input.keywords.map(keyword => evaluateMineradorArquitetoHandoff(keyword, input.brandId, input.qualifications?.[keyword.id] || null));
  const blocked = evaluations.filter(evaluation => !evaluation.ok);
  if (blocked.length === 0) return { ok: true, reason: "Pronto para enviar ao Arquiteto.", evaluations, blocked };
  const firstReason = blocked.find(evaluation => evaluation.reason)?.reason || "O envio exige status aprovado na Brand ativa.";
  return {
    ok: false,
    reason: blocked.length === 1 ? firstReason : `${blocked.length} keyword(s) ainda não podem ser enviadas. ${firstReason}`,
    evaluations,
    blocked,
  };
}
