import { readCanonicalKeywordDna } from "../minerador/logical-read-model.ts";
import { kgrApplicabilityLabel, readKgrApplicability, type KgrApplicability } from "../minerador/kgr-applicability.ts";

export type ArticleExpandedPanelKeyword = {
  id: string;
  keyword: string;
  volume_search?: number | null;
  results_allintitle?: number | null;
  intent?: string | null;
  kgr?: number | null;
  kgr_score?: number | null;
  funnel?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

export type ArticleExpandedPanelSummary = {
  keywordCount: number;
  volume: { principal: number | null; total: number | null; average: number | null };
  results: { principal: number | null; total: number | null; average: number | null };
  intent: { principal: string | null; conflicts: number };
  funnel: { principal: string | null; conflicts: number };
  compatibility: { conflicts: number };
  kgr: { principal: number | null; applicability: KgrApplicability; label: string };
};

export type ArticleExpandedPanelKeywordFacts = {
  intent: string | null;
  funnel: string | null;
  kgr: { value: number | null; applicability: KgrApplicability; label: string };
};

function numericValues(keywords: ArticleExpandedPanelKeyword[], field: "volume_search" | "results_allintitle") {
  return keywords
    .map(keyword => keyword[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function kgrValue(keyword: ArticleExpandedPanelKeyword) {
  const value = keyword.kgr ?? keyword.kgr_score;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * O rótulo compacto expressa a aplicabilidade recebida no KeywordDNA
 * (Aplicável / Não aplicável / Pendente). Não é a decisão KGR do artigo e o
 * valor decimal continua exclusivo do perfil completo da keyword.
 */
function kgrLabel(applicability: KgrApplicability): string {
  return kgrApplicabilityLabel(applicability);
}

/** Fatos canônicos recebidos do Minerador; o Arquiteto somente os projeta. */
export function readArticleExpandedPanelKeywordFacts(keyword: ArticleExpandedPanelKeyword): ArticleExpandedPanelKeywordFacts {
  const canonical = readCanonicalKeywordDna(keyword);
  const applicability = readKgrApplicability(keyword.analise_semantica);
  const directFunnel = typeof keyword.funnel === "string" && keyword.funnel.trim().length > 0 ? keyword.funnel.trim() : null;
  return {
    intent: canonical.intent,
    funnel: directFunnel || canonical.funnel,
    kgr: { value: kgrValue(keyword), applicability, label: kgrLabel(applicability) },
  };
}

/** Métricas comparativas do painel; null permanece desconhecido. */
export function summarizeArticleExpandedPanel(
  principal: ArticleExpandedPanelKeyword,
  supports: ArticleExpandedPanelKeyword[],
): ArticleExpandedPanelSummary {
  const keywords = [principal, ...supports];
  const volume = numericValues(keywords, "volume_search");
  const results = numericValues(keywords, "results_allintitle");
  const principalFacts = readArticleExpandedPanelKeywordFacts(principal);
  const supportFacts = supports.map(readArticleExpandedPanelKeywordFacts);
  const intentConflicts = supportFacts.filter(facts => principalFacts.intent !== null && facts.intent !== null && facts.intent !== principalFacts.intent).length;
  const funnelConflicts = supportFacts.filter(facts => principalFacts.funnel !== null && facts.funnel !== null && facts.funnel !== principalFacts.funnel).length;
  const compatibilityConflicts = supportFacts.filter(facts =>
    (principalFacts.intent !== null && facts.intent !== null && facts.intent !== principalFacts.intent)
    || (principalFacts.funnel !== null && facts.funnel !== null && facts.funnel !== principalFacts.funnel),
  ).length;

  return {
    keywordCount: keywords.length,
    volume: {
      principal: typeof principal.volume_search === "number" ? principal.volume_search : null,
      total: volume.length ? volume.reduce((sum, value) => sum + value, 0) : null,
      average: volume.length ? volume.reduce((sum, value) => sum + value, 0) / volume.length : null,
    },
    results: {
      principal: typeof principal.results_allintitle === "number" ? principal.results_allintitle : null,
      total: results.length ? results.reduce((sum, value) => sum + value, 0) : null,
      average: results.length ? results.reduce((sum, value) => sum + value, 0) / results.length : null,
    },
    intent: { principal: principalFacts.intent, conflicts: intentConflicts },
    funnel: { principal: principalFacts.funnel, conflicts: funnelConflicts },
    compatibility: { conflicts: compatibilityConflicts },
    kgr: { principal: principalFacts.kgr.value, applicability: principalFacts.kgr.applicability, label: principalFacts.kgr.label },
  };
}
