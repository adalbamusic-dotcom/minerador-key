/**
 * A AUTORIDADE ÚNICA DE APROVAÇÃO DO RADAR.
 *
 * Existiam duas. O Workbench gravava um flag em `useState` — e a própria
 * mensagem dizia "aprovado localmente; isso não cria uma versão remota nem
 * envia ao Planejador". A rota de detalhe fazia o trabalho inteiro. Duas
 * telas, dois significados para o mesmo verbo, e o pacote final só existia se
 * alguém lembrasse de visitar `/radar/{articleId}`.
 *
 * Aprovar passa a ser UM ato, definido aqui:
 *
 *   1. o portão confere identidade, SERP aprovada e atual, e evidências;
 *   2. o relatório competitivo é consolidado como `approved`;
 *   3. `buildRadarEvidencePackage` monta o pacote;
 *   4. `buildRadarPlannerHandoff` monta o handoff v2;
 *   5. a sucessora é persistida com o handoff em `plannerPackage`;
 *   6. o READBACK encerra — não o POST que não lançou exceção.
 *
 * Os builders NÃO são reimplementados: são os mesmos que a rota de detalhe já
 * usava. Este módulo os orquestra e é o único lugar onde a ordem vive.
 *
 * A persistência entra por PORTA (`persist`), não por import: o domínio não
 * conhece `fetch` nem Supabase, e as duas telas injetam o writer que já têm.
 *
 * O QUE NÃO ENTRA NO PORTÃO: estado de sessão. `REPORT_REVIEWED` e o estado
 * Amazon do Workbench moram em `useState` e não sobrevivem a um F5 — usá-los
 * como autoridade faria a mesma aprovação valer numa aba e não valer na outra.
 * Eles continuam sendo pré-condição de BOTÃO na superfície que os tem; a
 * decisão é desta função.
 *
 * Domínio puro: sem storage, sem fetch, sem provider.
 */

import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import { analysisApprovalIssues, createRadarAnalysisSuccessor, type RadarAnalysisVersion, type RadarExpertEvidence } from "./analysis-contracts.ts";
import { isComparableRadarExtraction } from "./analysis-insights.ts";
import { resolveRadarInvestigationSufficiency } from "./investigation-sufficiency.ts";
import { buildRadarCompetitiveReport } from "./competitive-report.ts";
import { buildRadarEvidencePackage } from "./evidence-package.ts";
import { buildRadarPlannerHandoff, isRadarPlannerHandoff } from "./planner-handoff.ts";
import type { SerpResearchSnapshot } from "./serp/contracts.ts";
import type { RadarKgrStrategy } from "./strategy-context.ts";
import type { RadarSerpReviewCurrentness } from "./serp-review-state.ts";

/* ------------------------------ o contexto ------------------------------- */

/** A identidade editorial exata sobre a qual a aprovação fala. */
export type RadarApprovalIdentity = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  radarItemId: string;
};

/**
 * O que a leitura remota do ExpertBrief respondeu.
 *
 * `contextMatches` existe porque uma resposta que chegou para OUTRO artigo não
 * é evidência deste: sem essa checagem, trocar de linha durante o carregamento
 * aprovaria um artigo com a leitura do anterior.
 */
export type RadarApprovalExpertReadiness = {
  loaded: boolean;
  contextMatches: boolean;
  failed: boolean;
  pendingCount: number;
  blockedCount: number;
};

/** A revisão da SERP como ela foi persistida, com a leitura de atualidade. */
export type RadarApprovalSerpReview = {
  status: "approved" | "rejected" | null;
  currentness: RadarSerpReviewCurrentness;
};

export type RadarApprovalGateInput = {
  identity: RadarApprovalIdentity;
  analysis: RadarAnalysisVersion | null;
  article: VersionEnvelope<ArticleDNA> | null;
  research: SerpResearchSnapshot | null;
  serpReview: RadarApprovalSerpReview;
  expertEvidence: RadarApprovalExpertReadiness;
  kgrStrategy?: RadarKgrStrategy | null;
};

/* ------------------------------- o portão -------------------------------- */

/**
 * O QUE IMPEDE APROVAR — em uma lista, para as duas telas mostrarem o mesmo.
 *
 * Antes, cada tela decidia por conta própria o que "pronto" significava: o
 * Workbench nem consultava o especialista, e a rota de detalhe nem consultava
 * a atualidade da revisão SERP. Uma tela recusando o que a outra aceita é a
 * mesma pergunta com duas respostas.
 */
export function radarReportApprovalIssues(input: RadarApprovalGateInput): string[] {
  const issues: string[] = [];
  const { identity, analysis, article, research } = input;

  if (!identity.brandId) issues.push("Selecione uma marca antes de aprovar.");
  if (!analysis) issues.push("Não há análise para aprovar.");
  if (!article) issues.push("O ArticleDNA deste artigo não está carregado.");
  if (!research) issues.push("A pesquisa da SERP precisa estar carregada.");

  /*
   * Isolamento antes de qualquer regra editorial.
   *
   * Uma análise de outro artigo, marca ou versão do ArticleDNA não é uma
   * aprovação mais fraca: é a aprovação de outra coisa. Recusar aqui evita que
   * o resto do portão avalie um objeto que nem pertence a esta linha.
   */
  if (analysis && (analysis.payload.brandId !== identity.brandId
    || analysis.payload.articleId !== identity.articleId
    || analysis.payload.articleDnaVersionId !== identity.articleDnaVersionId)) {
    issues.push("A análise carregada não pertence a esta marca, artigo e versão do ArticleDNA.");
  }
  if (article && (article.payload.brandId !== identity.brandId
    || article.payload.articleId !== identity.articleId
    || article.versionId !== identity.articleDnaVersionId)) {
    issues.push("O ArticleDNA carregado não corresponde à versão desta linha do Radar.");
  }
  if (analysis && research && analysis.payload.serpSnapshotId !== research.id) {
    issues.push("A análise descreve outro snapshot SERP; recarregue a curadoria antes de aprovar.");
  }

  /*
   * A SERP precisa estar aprovada E atual.
   *
   * `reopened` é aprovação viva de uma curadoria que mudou depois; `unknown` é
   * registro legado sem fingerprint. Nenhum dos dois pode fechar a revisão de
   * agora — herdar essa aprovação é aprovar sobre uma amostra que ninguém mais
   * está vendo.
   */
  if (input.serpReview.status !== "approved") {
    issues.push("A SERP deste artigo precisa estar aprovada antes do relatório.");
  } else if (input.serpReview.currentness === "reopened") {
    issues.push("A curadoria mudou depois da aprovação da SERP; revise e aprove a SERP novamente.");
  } else if (input.serpReview.currentness !== "current") {
    issues.push("A aprovação da SERP não traz o fingerprint da curadoria e não pode ser tratada como atual.");
  }

  const expert = input.expertEvidence;
  if (!expert.loaded || !expert.contextMatches) {
    issues.push("Aguarde a leitura remota do ExpertBrief deste artigo antes de aprovar.");
  } else if (expert.failed) {
    issues.push("A contribuição do especialista não pôde ser lida; a aprovação permanece bloqueada.");
  } else if (expert.pendingCount || expert.blockedCount) {
    issues.push("Revise todas as contribuições remotas do especialista antes de aprovar o relatório.");
  }

  /*
   * APROVAR EXIGE O RELATÓRIO — não a promessa de gerá-lo depois.
   *
   * O relatório era construído dentro da própria aprovação: a pessoa clicava
   * em aprovar e o objeto nascia junto com o "aprovado". Ela nunca leu o que
   * estava assinando. O relatório passa a ser um ato anterior e visível, e a
   * ausência do modelo observado marca justamente o relatório gerado antes
   * desta leitura — que também não pode fechar a investigação.
   */
  /*
   * AMOSTRA VAZIA NÃO APROVA.
   *
   * O smoke aprovou uma investigação com 7 selecionadas, 4 analisadas, 3 falhas
   * e ZERO páginas comparáveis. O portão media relatório e evidência, mas nunca
   * perguntou se havia do que concluir.
   */
  if (analysis) {
    const payload = analysis.payload;
    const suficiencia = resolveRadarInvestigationSufficiency({
      hasSnapshot: Boolean(research),
      curationConfirmed: payload.selectedCompetitorIds.length > 0,
      selected: payload.selectedCompetitorIds.length,
      analyzed: payload.extractions.length,
      failed: payload.extractionFailures.length,
      comparable: payload.extractions.filter(isComparableRadarExtraction).length,
    });
    if (!suficiencia.canApprove) {
      issues.push(`Não há amostra competitiva suficiente para concluir esta investigação. ${suficiencia.reasons[0] || ""}`.trim());
    }
  }

  const relatorio = analysis?.payload.competitiveReport || null;
  if (analysis && !relatorio) {
    issues.push("Gere o relatório competitivo desta versão antes de aprovar a investigação.");
  } else if (relatorio && !relatorio.observedCompetitiveModel) {
    issues.push("O relatório desta versão foi gerado antes do modelo competitivo observado; gere o relatório novamente antes de aprovar.");
  }

  if (analysis) issues.push(...analysisApprovalIssues(analysis, input.kgrStrategy));
  return [...new Set(issues)];
}

/* ------------------------------ a aprovação ------------------------------ */

export type RadarApprovalPersistResult = {
  persistenceMode: "remote" | "local" | string;
  readbackConfirmed: boolean;
};

export type ApproveRadarReportInput = RadarApprovalGateInput & {
  analysis: RadarAnalysisVersion;
  article: VersionEnvelope<ArticleDNA>;
  research: SerpResearchSnapshot;
  siloDnaVersionId: string | null;
  selectedBy: string;
  expertEvidence: RadarApprovalExpertReadiness & { approved: RadarExpertEvidence[] };
  /** Escrita + readback. O domínio não conhece transporte. */
  persist: (successor: RadarAnalysisVersion) => Promise<RadarApprovalPersistResult>;
  now?: string;
  approvalVersionId?: string;
};

export type RadarApprovalResult =
  | { ok: false; reason: "BLOCKED"; issues: string[] }
  | { ok: false; reason: "NOT_PERSISTED"; message: string }
  | {
    ok: true;
    outcome: "APPROVED" | "ALREADY_APPROVED";
    approvedAt: string;
    analysisVersionId: string;
    analysisVersionNumber: number;
    evidencePackageHash: string | null;
    handoffId: string | null;
    successor: RadarAnalysisVersion | null;
  };

/**
 * Esta análise já é a aprovação canônica deste mesmo estado?
 *
 * Repetir o clique não pode empilhar sucessoras: cada uma criaria um hash novo
 * para uma decisão que não mudou, e o histórico deixaria de distinguir "a
 * pessoa aprovou de novo" de "a pessoa mudou algo e reaprovou".
 */
function alreadyApprovedFor(input: ApproveRadarReportInput) {
  const payload = input.analysis.payload;
  if (payload.status !== "approved") return null;
  const handoff = payload.plannerPackage;
  if (!isRadarPlannerHandoff(handoff)) return null;
  if (handoff.brandId !== input.identity.brandId
    || handoff.articleId !== input.identity.articleId
    || handoff.articleDnaVersionId !== input.identity.articleDnaVersionId
    || handoff.radarItemId !== input.identity.radarItemId) return null;
  if (handoff.serp.snapshotId !== input.research.id) return null;
  if (handoff.evidencePackage.serp.hash !== input.research.contentHash) return null;
  return handoff;
}

export async function approveRadarReport(input: ApproveRadarReportInput): Promise<RadarApprovalResult> {
  const issues = radarReportApprovalIssues(input);
  if (issues.length) return { ok: false, reason: "BLOCKED", issues };

  const jaAprovado = alreadyApprovedFor(input);
  if (jaAprovado) {
    return {
      ok: true,
      outcome: "ALREADY_APPROVED",
      approvedAt: input.analysis.payload.approvedAt || jaAprovado.provenance.capturedAt,
      analysisVersionId: input.analysis.versionId,
      analysisVersionNumber: input.analysis.versionNumber,
      evidencePackageHash: jaAprovado.evidencePackage.hash,
      handoffId: jaAprovado.id,
      successor: null,
    };
  }

  const approvalVersionId = input.approvalVersionId || crypto.randomUUID();
  const approvalVersionNumber = input.analysis.versionNumber + 1;
  const approvedAt = input.now || new Date().toISOString();

  const report = await buildRadarCompetitiveReport({
    payload: input.analysis.payload,
    article: input.article.payload,
    research: input.research,
    radarItemId: input.identity.radarItemId,
    analysisVersionId: approvalVersionId,
    analysisVersionNumber: approvalVersionNumber,
    generatedBy: input.selectedBy,
    siloDnaVersionId: input.siloDnaVersionId,
    status: "approved",
    approvedAt,
    approvedBy: input.selectedBy,
  });

  const packageData = await buildRadarEvidencePackage(input.analysis.payload, {
    radarItemId: input.identity.radarItemId,
    analysisVersionId: approvalVersionId,
    analysisVersionNumber: approvalVersionNumber,
    selectedBy: input.selectedBy,
    selectedAt: approvedAt,
    research: input.research,
    kgrStrategy: input.kgrStrategy,
    competitiveReport: report,
  });

  const handoff = await buildRadarPlannerHandoff({
    packageData,
    approvedReport: report,
    brandId: input.identity.brandId,
    radarItemId: input.identity.radarItemId,
    articleId: input.identity.articleId,
    articleDnaVersionId: input.identity.articleDnaVersionId,
    articleDnaContentHash: input.article.contentHash,
    siloDnaVersionId: input.siloDnaVersionId,
    sourceAnalysisVersionId: approvalVersionId,
    sourceAnalysisVersionNumber: approvalVersionNumber,
    selectedBy: input.selectedBy,
    humanDecisions: input.analysis.payload.keywordDecisions.map(decision => ({
      id: `keyword:${decision.keywordId}`,
      target: `keyword:${decision.keywordId}`,
      decision: decision.decision,
      actorId: input.selectedBy,
      decidedAt: approvedAt,
      note: decision.note,
    })),
    expertEvidence: input.expertEvidence.approved,
    now: approvedAt,
  });

  /*
   * `plannerPackage` recebe o HANDOFF v2, não o pacote de evidências.
   *
   * É por esse campo que `approvedHandoffForRadarItem` encontra o envelope na
   * importação ao Planejador, e ele o lê com `RadarPlannerHandoffSchema`.
   * Gravar o pacote v1 aqui passaria no schema — a união aceita os dois — e
   * deixaria o Planejador sem envelope, silenciosamente.
   */
  const successor = await createRadarAnalysisSuccessor(
    input.analysis,
    { status: "approved", competitiveReport: report, approvedAt, approvedBy: input.selectedBy, plannerPackage: handoff },
    input.selectedBy,
    undefined,
    approvalVersionId,
  );

  // O READBACK é quem encerra. Um POST que não lançou exceção não é prova de
  // que o remoto guardou o que foi enviado.
  const saved = await input.persist(successor);
  if (saved.persistenceMode !== "remote" || !saved.readbackConfirmed) {
    return {
      ok: false,
      reason: "NOT_PERSISTED",
      message: "A aprovação não foi confirmada no remoto: o relatório continua aguardando aprovação.",
    };
  }

  return {
    ok: true,
    outcome: "APPROVED",
    approvedAt,
    analysisVersionId: approvalVersionId,
    analysisVersionNumber: approvalVersionNumber,
    evidencePackageHash: packageData.hash,
    handoffId: handoff.id,
    successor,
  };
}
