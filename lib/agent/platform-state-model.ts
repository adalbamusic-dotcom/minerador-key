import type { PlatformStage } from "./platform-catalog.ts";

/**
 * ===== O RETRATO DA MARCA QUE A IA RECEBE =====
 *
 * Forma pura, sem banco: o leitor do servidor
 * (`lib/server/agent-platform-state.ts`) preenche; `next-actions.ts` e a
 * busca de tema leem. Separar a forma do leitor deixa as decisões testáveis
 * sem Supabase.
 *
 * Tudo aqui é RESUMO. Nenhum campo carrega payload inteiro de DNA, dossiê ou
 * documento — a SDD de egress proíbe, e a IA não precisa: quando quiser o
 * detalhe de um artigo, as ferramentas do Redator descem por fatias.
 */

export type PlatformStateArticle = {
  articleId: string;
  /** A promessa do ArticleDNA: é o "do que trata" do artigo. */
  promise: string;
  slug: string | null;
  siloId: string | null;
  /** O que o ArticleDNA diz do próprio papel. */
  hierarchy: string | null;
  /**
   * O papel que o SILO dá ao artigo (`pillarArticleId` / `supportArticleIds`).
   * É a autoridade sobre Pilar × Suporte dentro do silo. Quando difere de
   * `hierarchy`, a divergência aparece — medido na Care Glow em 2026-09-26:
   * o Pilar do silo "skincare" tem `hierarchy: "Suporte"` no ArticleDNA.
   */
  siloRole: "Pilar" | "Suporte" | null;
  journeyStage: string | null;
  mainIntent: string | null;
  principalKeyword: string | null;
  /** Estado operacional no Arquiteto (ex.: PRONTO_PARA_RADAR). */
  workflowState: string | null;
  canonical: string | null;
};

export type PlatformStateSilo = {
  siloId: string;
  name: string;
  pillarArticleId: string | null;
  supportArticleIds: string[];
  formationStatus: string | null;
  page: { slug: string | null; h1: string | null; publicationStatus: string | null; publishedUrl: string | null } | null;
};

export type PlatformStateSubject = {
  keywordId: string;
  keyword: string;
  note: string | null;
  destinationUrl: string | null;
  status: string;
};

export type PlatformStateSnapshot = {
  brand: {
    brandId: string;
    brandName: string;
    siteUrl: string | null;
    niche: string | null;
    /** Link absoluto (ou relativo, sem base configurada) de cada tela. */
    screens: Record<PlatformStage, string>;
  };
  minerador: {
    total: number;
    byStatus: Record<string, number>;
    subjects: PlatformStateSubject[];
    /** Aprovadas que o Arquiteto ainda não recebeu. */
    approvedNotSentIds: string[];
  };
  arquiteto: {
    receivedKeywords: number;
    articles: PlatformStateArticle[];
    silos: PlatformStateSilo[];
  };
  radar: {
    items: Array<{ articleId: string; state: string }>;
  };
  redator: {
    documents: Array<{ documentId: string; articleId: string | null; title: string; status: string }>;
  };
  published: {
    total: number;
    pages: Array<{ url: string; title: string | null; h1: string | null; pageType: string | null }>;
  };
  /** O que foi cortado para caber, dito em vez de escondido. */
  truncated: string[];
  readAt: string;
};
