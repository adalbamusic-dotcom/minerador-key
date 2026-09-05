import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { RadarItem } from "../editorial/operational-flow.ts";
import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { RadarSerpView } from "./snapshot-view.ts";
import type { SerpCollectionRecord } from "../editorial/contracts.ts";
import type { SerpReviewRecord } from "../editorial/contracts.ts";
import type { RadarWorkbenchReferenceCounts } from "./workbench.ts";
import type { RadarR4LocalArticleState } from "./r4-queue.ts";
import type { RadarR6ConsolidatedReport } from "./r6-sequential.ts";
import type { RadarSerpReviewCurrentness } from "./serp-review-state.ts";

export const RADAR_R3_AREAS = ["serp", "amazon", "conteudo", "especialista"] as const;
export type RadarR3Area = typeof RADAR_R3_AREAS[number];

export type RadarR3ReferenceItem = {
  key: string;
  position: number;
  title: string;
  domain: string;
  url: string;
  role: "primary" | "support" | "format" | "own" | "excluded" | "pending";
  state: string;
};

export type RadarR3ContentRow = {
  area: "DNA" | "SERP" | "Amazon" | "Especialista";
  data: string;
  value: string;
  source: string;
  state: string;
};

export type RadarR3Model = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  title: string;
  keyword: string;
  silo: string;
  hierarchy: string;
  articleDnaVersion: string;
  publication: string;
  mode: string;
  article: VersionEnvelope<ArticleDNA> | null;
  serp: {
    provider: string;
    status: string;
    latestSnapshotId: string | null;
    reviewStatus: "approved" | "rejected" | null;
    reviewNotes: string | null;
    reviewCurrentness: RadarSerpReviewCurrentness;
    reviewedAt: string | null;
    reviewHistory: SerpReviewRecord[];
    capturedAt: string | null;
    resultCount: number;
    primaryCount: number;
    pendingCount: number;
    needs: number;
    latestCollection: string;
    view: RadarSerpView | null;
    records: SerpCollectionRecord[];
    references: RadarR3ReferenceItem[];
    analysis: RadarAnalysisVersion | null;
  };
  amazon: {
    status: "not_applicable" | "fixture";
    label: string;
    detail: string;
    productCount: number;
    reviewCount: number;
    criteriaCount: number;
  };
  content: {
    articleDnaVersion: string;
    principal: string;
    needs: number;
    evidenceCount: number;
    sourceCount: number;
    updatedAt: string | null;
    rows: RadarR3ContentRow[];
    technical: {
      brandId: string;
      articleId: string;
      articleDnaVersionId: string;
      siloId: string | null;
      snapshotId: string | null;
      provider: string | null;
      articleDnaEntityId: string | null;
      articleDnaHash: string | null;
    };
  };
  specialist: {
    selected: boolean;
    expert: string;
    specialty: string;
    channel: string;
    requestsSent: number;
    contributionsReceived: number;
    pending: number;
    reviewedEvidence: number;
    existingContent: string;
    status: string;
  };
  report: {
    status: string;
    version: number | null;
    needs: number;
    summary: string;
    approved: boolean;
    sentToPlanner: boolean;
    updatedAt: string | null;
  };
  nextAction: string;
  lastActivity: string | null;
  provenance: {
    brandId: string;
    articleId: string;
    articleDnaVersionId: string;
    snapshotId: string | null;
    provider: string | null;
  };
  r6Report?: RadarR6ConsolidatedReport | null;
  r4?: RadarR4LocalArticleState;
};

export function deriveRadarR3NextAction(input: {
  identityReady: boolean;
  serpCollected: boolean;
  referencesPending: number;
  analysisStarted: boolean;
  analysisQueue: number;
  pagesAnalyzed: number;
  amazonStatus: RadarR3Model["amazon"]["status"];
  amazonNeedsReview: boolean;
  specialistSelected: boolean;
  specialistPending: number;
  reportGenerated: boolean;
  reportApproved: boolean;
  sentToPlanner: boolean;
}): string {
  if (!input.identityReady) return "Confira a identidade recebida do Arquiteto antes de continuar.";
  if (!input.serpCollected) return "Colete ou recupere a SERP deste artigo.";
  if (input.referencesPending > 0) return `Revise ${input.referencesPending} referência(s) pendente(s) na SERP.`;
  if (!input.analysisStarted) return "Inicie a análise SERP usando o snapshot existente.";
  if (input.analysisQueue > 0) return `Analise ${input.analysisQueue} referência(s) selecionada(s).`;
  if (input.pagesAnalyzed === 0) return "Selecione referências comparáveis para formar a amostra.";
  if (input.amazonStatus === "fixture" && input.amazonNeedsReview) return "Revise a contribuição Amazon demonstrativa antes de consolidar.";
  if (input.specialistSelected && input.specialistPending > 0) return "Revise as contribuições pendentes do especialista.";
  if (!input.reportGenerated) return "Revise a análise SERP e gere a prévia do relatório consolidado.";
  if (!input.reportApproved) return "Revise as necessidades e aprove o relatório consolidado.";
  if (!input.sentToPlanner) return "Envie as evidências aprovadas ao Planejador quando fizer sentido.";
  return "Investigação consolidada; histórico e proveniência permanecem disponíveis.";
}

function formatCapturedAt(value: string | null | undefined) {
  if (!value) return "Ainda não coletada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export function buildRadarR3Model(input: {
  row: RadarItem;
  article: VersionEnvelope<ArticleDNA> | null;
  keyword: string;
  silo: string;
  publication: string;
  view: RadarSerpView | null;
  records: SerpCollectionRecord[];
  analysis: RadarAnalysisVersion | null;
  referenceCounts: RadarWorkbenchReferenceCounts;
  references: RadarR3ReferenceItem[];
  analysisQueue: number;
  pagesAnalyzed: number;
  reportGenerated: boolean;
  reportApproved: boolean;
  sentToPlanner: boolean;
  serpStatus: string;
  latestSnapshotId?: string | null;
  reviewStatus?: "approved" | "rejected" | null;
  reviewNotes?: string | null;
  reviewCurrentness?: RadarSerpReviewCurrentness;
  reviewedAt?: string | null;
  reviewHistory?: SerpReviewRecord[];
}): RadarR3Model {
  const report = input.analysis?.payload.competitiveReport || null;
  const extractionPages = input.analysis?.payload.extractions || [];
  const sourceUrls = new Set<string>([
    ...input.references.map(reference => reference.url),
    ...extractionPages.map(page => page.url),
    ...(input.view?.peopleAlsoAsk || []).flatMap(question => question.sourceUrl ? [question.sourceUrl] : []),
  ]);
  const principal = input.keyword || "Não hidratada";
  const articleVersion = input.article ? `v${input.article.versionNumber}` : "Não hidratado";
  const mode = input.analysis?.payload.mode === "competitive_full" ? "Competitivo completo" : "KGR leve";
  const amazon = {
    status: "not_applicable" as const,
    label: "Não aplicável neste artigo",
    detail: "Nenhuma coleta Amazon foi configurada. Esta área permanece opcional e não bloqueia o Radar.",
    productCount: 0,
    reviewCount: 0,
    criteriaCount: 0,
  };
  const specialist = {
    selected: false,
    expert: "Não selecionado",
    specialty: "Especialista ainda não vinculado a este artigo",
    channel: "Telegram não consumido nesta visão",
    requestsSent: 0,
    contributionsReceived: 0,
    pending: 0,
    reviewedEvidence: 0,
    existingContent: "Conteúdo existente do especialista ainda não associado",
    status: "Opcional · aguardando seleção",
  };
  const contentRows: RadarR3ContentRow[] = [
    { area: "DNA", data: "ArticleDNA", value: `${articleVersion} · ${principal}`, source: "ArticleDNA recebido do Arquiteto", state: input.article ? "preservado" : "pendente" },
    { area: "DNA", data: "KeywordDNAs", value: input.article ? `${input.article.payload.keywordReferences.length} referência(s) vinculada(s)` : "Não hidratado", source: "KeywordDNA referenciado pelo ArticleDNA", state: input.article ? "preservado" : "pendente" },
    { area: "DNA", data: "Silo", value: input.silo || "Não hidratado", source: "Contexto recebido do Arquiteto", state: input.silo ? "preservado" : "pendente" },
    { area: "DNA", data: "Função", value: input.article?.payload.hierarchy || input.row.hierarchy || "Não informada", source: "ArticleDNA / contexto editorial", state: input.article ? "preservado" : "pendente" },
    { area: "DNA", data: "SiloDNA", value: input.row.siloId ? "Preservado" : "Não vinculado", source: "Vínculo de silo recebido do Arquiteto", state: input.row.siloId ? "preservado" : "pendente" },
    { area: "DNA", data: "Intenção", value: input.article?.payload.mainIntent || input.row.intent || "Não informada", source: "ArticleDNA / KeywordDNA", state: input.article ? "preservado" : "pendente" },
    { area: "SERP", data: "Snapshot e referências", value: input.view ? `${input.view.provider} · ${input.view.organicResults.length} resultado(s) · ${input.referenceCounts.pending} pendente(s)` : "Ainda não coletado", source: input.view ? "Snapshot SERP do Radar" : "Aguardando coleta explícita", state: input.view ? "observado" : "pendente" },
    { area: "SERP", data: "Amostra e necessidades", value: `${input.pagesAnalyzed} página(s) · ${report?.needs.length || 0} necessidade(s)`, source: input.analysis ? "Análise SERP do Radar" : "Aguardando análise", state: input.analysis ? "observado" : "pendente" },
    { area: "Amazon", data: "Produtos e avaliações", value: amazon.label, source: "Sem provider Amazon nesta fase", state: "não aplicável" },
    { area: "Especialista", data: "Contribuições e evidências", value: specialist.status, source: "Nenhuma contribuição verificada nesta visão", state: "não verificado" },
  ];
  const nextAction = deriveRadarR3NextAction({
    identityReady: Boolean(input.article && input.row.brandId && input.row.articleDnaVersionId),
    serpCollected: Boolean(input.view),
    referencesPending: input.referenceCounts.pending,
    analysisStarted: Boolean(input.analysis),
    analysisQueue: input.analysisQueue,
    pagesAnalyzed: input.pagesAnalyzed,
    amazonStatus: amazon.status,
    amazonNeedsReview: false,
    specialistSelected: specialist.selected,
    specialistPending: specialist.pending,
    reportGenerated: input.reportGenerated,
    reportApproved: input.reportApproved,
    sentToPlanner: input.sentToPlanner,
  });
  const lastActivity = input.view?.capturedAt || input.analysis?.createdAt || input.row.updatedAt || null;
  return {
    brandId: input.row.brandId,
    articleId: input.row.articleId,
    articleDnaVersionId: input.row.articleDnaVersionId,
    title: input.article?.payload.promise || input.row.title,
    keyword: principal,
    silo: input.silo,
    hierarchy: input.row.hierarchy,
    articleDnaVersion: articleVersion,
    publication: input.publication,
    mode,
    article: input.article,
    serp: {
      provider: input.view?.provider || "DataForSEO",
      status: input.serpStatus,
      latestSnapshotId: input.latestSnapshotId || input.view?.record.id || null,
      reviewStatus: input.reviewStatus || null,
      reviewNotes: input.reviewNotes || null,
      reviewCurrentness: input.reviewCurrentness || "none",
      reviewedAt: input.reviewedAt || null,
      reviewHistory: input.reviewHistory || [],
      capturedAt: input.view?.capturedAt || null,
      resultCount: input.view?.organicResults.length || 0,
      primaryCount: input.referenceCounts.primary,
      pendingCount: input.referenceCounts.pending,
      needs: report?.needs.length || 0,
      latestCollection: formatCapturedAt(input.view?.capturedAt),
      view: input.view,
      records: input.records,
      references: input.references,
      analysis: input.analysis,
    },
    amazon,
    content: {
      articleDnaVersion: articleVersion,
      principal,
      needs: report?.needs.length || 0,
      evidenceCount: extractionPages.length,
      sourceCount: sourceUrls.size,
      updatedAt: input.analysis?.createdAt || input.view?.capturedAt || null,
      rows: contentRows,
      technical: {
        brandId: input.row.brandId,
        articleId: input.row.articleId,
        articleDnaVersionId: input.row.articleDnaVersionId,
        siloId: input.row.siloId || null,
        snapshotId: input.view?.record.id || null,
        provider: input.view?.provider || null,
        articleDnaEntityId: input.article?.entityId || null,
        articleDnaHash: input.article?.contentHash || null,
      },
    },
    specialist,
    report: {
      status: input.reportApproved ? "Aprovado" : input.reportGenerated ? "Prévia disponível" : "Aguardando",
      version: input.analysis?.versionNumber || null,
      needs: report?.needs.length || 0,
      summary: report?.summary.text || "O relatório consolidado será formado a partir da SERP e da análise da amostra.",
      approved: input.reportApproved,
      sentToPlanner: input.sentToPlanner,
      updatedAt: report?.provenance.generatedAt || input.analysis?.createdAt || null,
    },
    nextAction,
    lastActivity,
    provenance: {
      brandId: input.row.brandId,
      articleId: input.row.articleId,
      articleDnaVersionId: input.row.articleDnaVersionId,
      snapshotId: input.view?.record.id || null,
      provider: input.view?.provider || null,
    },
  };
}
