import type { ArticleDNA, VersionEnvelope } from "./contracts.ts";
import type { KeywordDnaProjectionField, KeywordDnaProjectionSection } from "./keyword-dna-projection.ts";

/**
 * Projeção somente leitura da definição do artigo.
 *
 * Mesmo padrão homologado no KeywordDNA: resumo compacto fechado e ficha
 * vertical por tópicos quando aberta. Os controles humanos continuam na aba
 * Revisão; esta ficha só projeta o estado consolidado.
 */
export type ArticleDnaProjectionField = KeywordDnaProjectionField;
export type ArticleDnaProjectionSection = KeywordDnaProjectionSection;

export type ArticleDnaReadonlyProjection = {
  available: boolean;
  summary: ArticleDnaProjectionField[];
  sections: ArticleDnaProjectionSection[];
  /** Notas herdadas e alertas: informação, nunca bloqueio da aprovação. */
  notes: string[];
  technical: ArticleDnaProjectionField[];
  emptyNote: string | null;
};

export type ArticleDnaProjectionInput = {
  version?: VersionEnvelope<ArticleDNA> | null;
  versionStatus?: string | null;
  principalKeyword?: string | null;
  supportKeywords?: readonly { keyword: string; role: string }[];
  unitTypeLabel?: string | null;
  kgr: {
    label: string;
    source: string;
    principalScoreLabel: string;
    applicabilityLabel: string;
    requiresHumanDecision: boolean;
  };
  serp: {
    executionLabel: string;
    verdictLabel: string;
    impact: string;
    divergenceCount: number;
    registeredDecisions: number;
  };
  ai: {
    executionLabel: string;
    proposalCount: number;
    pendingCount: number;
  };
  review: {
    statusLabel: string;
    requiredCount: number;
    resolvedCount: number;
    pendingCount: number;
    approved: boolean;
  };
  protection: {
    publicationLabel: string;
    principalPolicy: string | null;
    slug: string | null;
    canonical: string | null;
    url: string | null;
    published: boolean;
  };
  siloLabel: string;
  linksLabel: string;
};

function field(label: string, value: string | null | undefined, options: { unresolved?: boolean; wide?: boolean; tone?: ArticleDnaProjectionField["tone"] } = {}): ArticleDnaProjectionField | null {
  if (value === null || value === undefined) return null;
  return { label, value, unresolved: options.unresolved ?? false, ...(options.wide ? { wide: true } : {}), ...(options.tone ? { tone: options.tone } : {}) };
}

function compact(fields: Array<ArticleDnaProjectionField | null>): ArticleDnaProjectionField[] {
  return fields.filter((item): item is ArticleDnaProjectionField => Boolean(item));
}

function section(id: string, title: string, fields: Array<ArticleDnaProjectionField | null>, emptyNote: string): ArticleDnaProjectionSection {
  const resolved = compact(fields);
  return resolved.length ? { id, title, fields: resolved } : { id, title, fields: [], emptyNote };
}

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Converte a definição consolidada do artigo em ficha somente leitura. */
export function projectArticleDnaForArchitect(input: ArticleDnaProjectionInput): ArticleDnaReadonlyProjection {
  const payload = input.version?.payload;
  const supports = input.supportKeywords || [];
  const secondaries = supports.filter(item => item.role !== "reforco_narrativo");
  const reinforcements = supports.filter(item => item.role === "reforco_narrativo");

  const summary = compact([
    field("Definição", input.version ? `v${input.version.versionNumber}` : "Não consolidada", { unresolved: !input.version }),
    field("Status", input.versionStatus === "approved" ? "Aprovado" : input.review.statusLabel),
    field("Principal", input.principalKeyword, { tone: "keyword" }),
    field("Keywords", String(1 + supports.length)),
    field("KGR do artigo", input.kgr.label),
    field("SERP", input.serp.verdictLabel),
  ]);

  if (!payload) {
    return {
      available: false,
      summary,
      sections: [],
      notes: [],
      technical: [],
      emptyNote: "A definição do artigo ainda não foi consolidada. Execute a Lógica e conclua a revisão para gerar o ArticleDNA.",
    };
  }

  const identity = section("identidade-article", "Identidade do Article", [
    field("Versão", input.version ? `v${input.version.versionNumber}` : null),
    field("Status", input.versionStatus === "approved" ? "Aprovado" : input.review.statusLabel),
    field("Principal", input.principalKeyword, { tone: "keyword" }),
    field("Quantidade de keywords", String(payload.keywordReferences.length)),
    field("Origem da definição", input.version?.origin || null),
    field("Motivo da versão", input.version?.changeReason || null, { wide: true }),
  ], "Identidade da definição não recebida.");

  const architecture = section("arquitetura-article", "Arquitetura", [
    field("Principal", input.principalKeyword, { tone: "keyword" }),
    field("Secundárias", secondaries.length ? secondaries.map(item => item.keyword).join(" · ") : "Nenhuma", { tone: secondaries.length ? "keyword" : undefined, wide: true }),
    field("Reforços", reinforcements.length ? reinforcements.map(item => item.keyword).join(" · ") : "Nenhum", { tone: reinforcements.length ? "keyword" : undefined, wide: true }),
    field("Tipo de unidade", input.unitTypeLabel || "A definir", { unresolved: !input.unitTypeLabel }),
    field("Hierarquia", payload.hierarchy),
  ], "Arquitetura não consolidada.");

  const semantic = section("semantica-article", "Semântica consolidada", [
    field("Intenção", payload.mainIntent),
    field("Intenções auxiliares", payload.auxiliaryIntents.length ? payload.auxiliaryIntents.join(" · ") : null, { wide: true }),
    field("Funil", payload.journeyStage),
    field("Público", payload.audience, { wide: true }),
    field("Problema", payload.problem, { wide: true }),
    field("Resultado desejado", payload.desiredResult, { wide: true }),
    field("Entidades", payload.entities.length ? payload.entities.join(" · ") : null, { wide: true }),
    field("Fronteira anticanibalização", payload.antiCannibalizationBoundary, { wide: true }),
  ], "Semântica consolidada não recebida.");

  const kgr = section("kgr-article", "KGR do artigo", [
    field("Decisão", input.kgr.label),
    field("Origem da decisão", input.kgr.source),
    field("Principal usada", input.principalKeyword, { tone: "keyword" }),
    field("Score da Principal", input.kgr.principalScoreLabel),
    field("Aplicabilidade upstream", input.kgr.applicabilityLabel),
    field("Decisão humana", input.kgr.requiresHumanDecision ? "Pendente na aba Revisão" : "Não exigida", { unresolved: input.kgr.requiresHumanDecision }),
  ], "KGR do artigo não resolvido.");

  const serp = section("serp-article", "SERP de formação", [
    field("Execução", input.serp.executionLabel),
    field("Veredito", input.serp.verdictLabel),
    field("Impacto", input.serp.impact, { wide: true }),
    field("Divergências abertas", String(input.serp.divergenceCount)),
    field("Decisões registradas", String(input.serp.registeredDecisions)),
    field("Assessment referenciado", payload.serpAssessmentRef?.versionId || null),
  ], "Nenhuma avaliação SERP registrada nesta definição.");

  const ai = section("ia-article", "IA arquitetural", [
    field("Execução", input.ai.executionLabel),
    field("Propostas", String(input.ai.proposalCount)),
    field("Resultado", input.ai.proposalCount === 0 ? "Sem alteração estrutural recomendada" : `${input.ai.pendingCount} aguardando decisão humana`),
    field("Decisões humanas", input.ai.pendingCount === 0 ? "Concluídas" : "Pendentes na aba Revisão", { unresolved: input.ai.pendingCount > 0 }),
  ], "IA ainda não executada nesta definição.");

  const review = section("revisao-article", "Revisão humana", [
    field("Status", input.review.statusLabel),
    field("Decisões obrigatórias", String(input.review.requiredCount)),
    field("Resolvidas", String(input.review.resolvedCount)),
    field("Pendentes", String(input.review.pendingCount), { unresolved: input.review.pendingCount > 0 }),
    field("Aprovação", input.review.approved ? "ArticleDNA aprovado" : "Ainda não aprovado", { unresolved: !input.review.approved }),
  ], "Nenhuma revisão registrada.");

  const identityTone = input.protection.published ? "identity-published" as const : "identity-new" as const;
  const protection = section("protecoes-article", "Proteções", [
    field("Publicação", input.protection.publicationLabel),
    field("Política da principal", input.protection.principalPolicy),
    field("Slug", input.protection.slug, { tone: identityTone }),
    field("Canonical", input.protection.canonical, { tone: identityTone }),
    field("URL publicada", input.protection.url, { tone: identityTone }),
  ], "Sem identidade publicada nesta definição.");

  const silo = section("silo-article", "Silo", [
    field("Estado", input.siloLabel),
    field("Silo vinculado", payload.siloId),
  ], "Silo não iniciado.");

  const links = section("links-article", "Links internos", [
    field("Estado", input.linksLabel),
    field("Links declarados", payload.internalLinks.length ? String(payload.internalLinks.length) : null),
  ], "Links internos não iniciados.");

  const technical = compact([
    field("Versão", input.version?.versionId || null),
    field("Hash", input.version?.contentHash || null),
    field("Article ID", payload.articleId),
    field("Brand ID", payload.brandId),
    field("Schema", String(payload.schemaVersion)),
    field("Referências de keyword", serialize(payload.keywordReferences.map(reference => ({ keywordId: reference.keywordId, role: reference.role, versionId: reference.keywordDnaVersionId }))), { wide: true }),
    field("Identidade publicada", serialize(payload.publishedIdentityRef), { wide: true }),
    field("Estratégia de keywords", serialize(payload.keywordStrategy), { wide: true }),
  ]);

  return {
    available: true,
    summary,
    sections: [identity, architecture, semantic, kgr, serp, ai, review, protection, silo, links],
    // Alertas e pendências herdadas viram nota: o gate estrutural do artigo já
    // não depende de promessa, CTA ou briefing do Planejador.
    // Alertas repetem entre versões e podem coincidir com pendências herdadas:
    // a nota é informação única, não histórico de ocorrências.
    notes: [...new Set([...payload.alerts, ...payload.humanPendingDecisions])],
    technical,
    emptyNote: null,
  };
}
