/**
 * OS FUNDAMENTOS DO ARTIGO, PARA LEITURA — a mesma fonte que alimenta o motor.
 *
 * O Arquiteto mostra o fundamento de um artigo muito melhor do que o Radar
 * mostrava: identidade da keyword, leitura lógica, demanda, competição,
 * qualificação semântica, KGR, revisão upstream, publicação. O Radar exibia
 * "principal: texto" e escondia o resto num painel de diagnóstico.
 *
 * Aqui a MESMA projeção que o motor consome (`RadarArticleResearchContext`)
 * vira seções de leitura. Não existe um contexto técnico para o motor e um
 * resumo pobre para a pessoa: é um só, lido de dois jeitos.
 *
 * Nada é recopiado do Minerador. Tudo sai do que já foi incorporado à versão do
 * ArticleDNA durante a formação.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarConclusiveIntent, radarConclusiveIntents, radarDeclaredArticleIntent } from "./editorial-identity.ts";
import type { RadarArticleResearchContext, RadarResearchKeyword } from "./article-research-context.ts";

/**
 * AUSÊNCIA TEM TIPO.
 *
 * "Não informado" e "pendente" não são a mesma coisa, e nenhuma das duas é
 * "escondido". Cada campo declara qual ausência é a sua.
 */
export type RadarFieldState = "AVAILABLE" | "NOT_INFORMED" | "PENDING" | "NOT_APPLICABLE" | "NOT_IN_THIS_VERSION";

export type RadarProfileField = { label: string; value: string | null; state: RadarFieldState };
export type RadarProfileSection = { title: string; fields: RadarProfileField[] };

export const radarFieldStateLabel = (state: RadarFieldState) => ({
  AVAILABLE: "",
  NOT_INFORMED: "Não informado",
  PENDING: "Pendente",
  NOT_APPLICABLE: "Não aplicável",
  NOT_IN_THIS_VERSION: "Não disponível nesta versão",
}[state]);

const campo = (label: string, value: unknown, ausente: RadarFieldState = "NOT_INFORMED"): RadarProfileField => {
  if (typeof value === "number" && Number.isFinite(value)) return { label, value: String(value), state: "AVAILABLE" };
  if (typeof value === "boolean") return { label, value: value ? "Sim" : "Não", state: "AVAILABLE" };
  if (Array.isArray(value)) {
    return value.length
      ? { label, value: value.map(item => String(item)).join(" · "), state: "AVAILABLE" }
      : { label, value: null, state: ausente };
  }
  const texto = typeof value === "string" && value.trim() ? value.trim() : null;
  return texto ? { label, value: texto, state: "AVAILABLE" } : { label, value: null, state: ausente };
};

const doSnapshot = (keyword: RadarResearchKeyword, chave: string): unknown => {
  const snapshot = keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null;
  return snapshot?.payload?.[chave];
};

const PAPEL: Record<string, string> = { principal: "Principal", secundaria: "Secundária", reforco_narrativo: "Reforço narrativo" };

/**
 * O PERFIL COMPLETO DE UMA KEYWORD — principal, secundária ou reforço.
 *
 * O mesmo envelope para os três papéis. Uma secundária deixou de ser
 * `{ keywordId, role }` e passou a ter a leitura inteira que o Arquiteto tem.
 */
export function buildRadarKeywordProfile(keyword: RadarResearchKeyword): RadarProfileSection[] {
  const temSnapshot = keyword.strategy.keywordDnaSnapshot !== null;
  const semSnapshot: RadarFieldState = temSnapshot ? "NOT_INFORMED" : "NOT_IN_THIS_VERSION";

  return [
    {
      title: "Identidade",
      fields: [
        campo("Keyword", keyword.identity.text),
        campo("ID", keyword.identity.keywordId),
        campo("Papel", PAPEL[keyword.identity.role] || keyword.identity.role),
        campo("ID canônico", keyword.identity.canonicalKeywordId),
        campo("ID de origem", keyword.identity.sourceKeywordId),
        campo("Versão da KeywordDNA", keyword.identity.keywordDnaVersionId),
        campo("Hash da versão", keyword.provenance.keywordDnaContentHash),
        campo("Resolução no Radar", keyword.resolution),
      ],
    },
    {
      title: "Leitura lógica",
      fields: [
        campo("Intenção canônica", radarConclusiveIntent(keyword.strategy.normalizedIntent), "PENDING"),
        campo("Intenção consolidada", radarConclusiveIntent(keyword.strategy.semanticQualification?.intent), keyword.strategy.semanticQualification ? "PENDING" : "NOT_IN_THIS_VERSION"),
        campo("Funil consolidado", keyword.strategy.semanticQualification?.funnel, keyword.strategy.semanticQualification ? "PENDING" : "NOT_IN_THIS_VERSION"),
        campo("Funil", doSnapshot(keyword, "journeyStage"), semSnapshot),
        campo("Nível de consciência", doSnapshot(keyword, "awarenessLevel"), semSnapshot),
        campo("Entidade central", doSnapshot(keyword, "centralEntity"), semSnapshot),
        campo("Modificadores", doSnapshot(keyword, "modifiers"), semSnapshot),
        campo("Tipo editorial provável", doSnapshot(keyword, "likelyEditorialType"), semSnapshot),
      ],
    },
    {
      title: "Demanda",
      fields: [
        campo("Volume", keyword.strategy.volume),
        campo("Volume incremental", keyword.strategy.incrementalVolume, keyword.identity.role === "principal" ? "NOT_APPLICABLE" : "NOT_INFORMED"),
        campo("Evidência de demanda", keyword.strategy.demandEvidence ? "Recebida na formação" : null, semSnapshot),
      ],
    },
    {
      title: "Competição SEO",
      fields: [
        campo("Resultados", keyword.strategy.resultCount),
        campo("KGR", keyword.strategy.kgrScore === null ? null : keyword.strategy.kgrScore.toFixed(3)),
        campo("Potencial comercial", doSnapshot(keyword, "commercialPotential"), semSnapshot),
      ],
    },
    {
      title: "Qualificação semântica",
      fields: [
        campo("Intenções cobertas", radarConclusiveIntents(keyword.strategy.coveredIntentions), "PENDING"),
        campo("Estado da evidência", keyword.strategy.semanticQualification ? (keyword.strategy.semanticQualification.semanticState === "conclusive" ? "Conclusiva" : "Não conclusiva") : null, "NOT_IN_THIS_VERSION"),
        campo("Versão da qualificação", keyword.strategy.semanticQualification?.versionId, "NOT_IN_THIS_VERSION"),
        campo("Hash da qualificação", keyword.strategy.semanticQualification?.contentHash, "NOT_IN_THIS_VERSION"),
        campo("Qualificação coletada em", keyword.strategy.semanticQualification?.collectedAt, "NOT_IN_THIS_VERSION"),
        campo("Contribuição", keyword.strategy.contribution),
        campo("Contribuição estratégica", keyword.strategy.strategicContribution),
        campo("Propósito", keyword.strategy.purpose),
        campo("Risco de sobreposição", keyword.strategy.overlapRisk),
        campo("Audiência", doSnapshot(keyword, "audience"), semSnapshot),
        campo("Problema percebido", doSnapshot(keyword, "perceivedProblem"), semSnapshot),
      ],
    },
    {
      title: "Proveniência e publicação",
      fields: [
        campo("Relação keyword para URL", keyword.strategy.keywordUrlRelation),
        campo("Fonte do texto", keyword.provenance.textSource === "hydration" ? "Hidratação do Arquiteto" : null),
        campo("Fonte da estratégia", keyword.provenance.strategySource === "article_reference" ? "Referência do ArticleDNA" : null),
        campo("Snapshot da KeywordDNA", temSnapshot ? "Incorporado na versão" : null, "NOT_IN_THIS_VERSION"),
      ],
    },
  ];
}

/** Article, Silo, Formação e Arquitetura interna — as quatro seções de leitura. */
export function buildRadarFoundationSections(context: RadarArticleResearchContext): RadarProfileSection[] {
  const silo = context.silo;
  const formation = context.formationSerp;
  const links = context.internalLinks;
  const semFormacao: RadarFieldState = formation ? "PENDING" : "NOT_IN_THIS_VERSION";

  return [
    {
      title: "Article",
      fields: [
        campo("Versão do ArticleDNA", context.article.articleDnaVersionId),
        campo("Hash da versão", context.article.articleDnaContentHash),
        campo("Promessa", context.article.promise),
        /* "unknown" na tela do fundamento é PENDING: é isso que ele significa. */
        campo("Intenção do artigo", radarDeclaredArticleIntent(context.article), "PENDING"),
        campo("Hierarquia", context.article.hierarchy),
        campo("Quantidade de keywords", context.keywords.length),
        campo("Tópicos editoriais", context.editorialTopics),
        campo("Estado do contexto", context.state),
      ],
    },
    {
      title: "Silo",
      fields: [
        campo("Silo", silo?.siloName || silo?.siloId),
        campo("Versão do SiloDNA", silo?.siloDnaVersionId, "NOT_IN_THIS_VERSION"),
        campo("Hash do SiloDNA", silo?.siloDnaContentHash, "NOT_IN_THIS_VERSION"),
        campo("SiloPage", silo?.siloPageSlug, "NOT_IN_THIS_VERSION"),
        campo("Canonical", silo?.siloPageCanonical, "NOT_IN_THIS_VERSION"),
        campo("Status de publicação", silo?.siloPagePublicationStatus, "NOT_IN_THIS_VERSION"),
        campo("Papel do artigo no silo", silo?.articleRole),
      ],
    },
    {
      title: "Formação do artigo",
      fields: [
        campo("SERP de formação", formation ? "Recebida" : null, "NOT_IN_THIS_VERSION"),
        campo("Assessment", formation?.assessmentId, semFormacao),
        campo("Veredito", formation?.verdict, semFormacao),
        campo("Hash da base de formação", formation?.formationBaseHash, semFormacao),
        campo("Decisão humana", formation?.humanResolution?.decision, semFormacao),
        campo("Motivo da decisão", formation?.humanResolution?.reason, semFormacao),
        campo("Decidida por", formation?.humanResolution?.decidedBy, semFormacao),
        campo("Relações keyword para URL", formation?.keywordUrls.length, "NOT_IN_THIS_VERSION"),
      ],
    },
    {
      title: "Arquitetura interna",
      fields: [
        campo("Grafo de links", links?.graphId, "NOT_IN_THIS_VERSION"),
        campo("Versão do grafo", links?.graphVersionId, "NOT_IN_THIS_VERSION"),
        campo("Hash do grafo", links?.graphContentHash, "NOT_IN_THIS_VERSION"),
        campo("Relações aprovadas", links?.edges.length, "NOT_IN_THIS_VERSION"),
        campo("Conceitos de âncora", links ? [...new Set(links.edges.flatMap(edge => edge.anchorConcepts))] : null, "NOT_IN_THIS_VERSION"),
        campo("Tipos de relação", links ? [...new Set(links.edges.map(edge => edge.relationType))] : null, "NOT_IN_THIS_VERSION"),
      ],
    },
  ];
}

/**
 * O QUE AS KEYWORDS DIZEM SOBRE A CONSULTA — antes de olhar a SERP.
 *
 * "cremes skin care" foi julgado por "páginas de produto não comparáveis" sem
 * ninguém perguntar se o próprio artigo é transacional. Uma keyword BOFU que
 * traz loja não é erro da SERP: é a SERP concordando com a keyword.
 */
export function radarDeclaredCommercialSignal(context: RadarArticleResearchContext) {
  const intencoes = radarConclusiveIntents(
    context.keywords.flatMap(keyword => [keyword.strategy.normalizedIntent, keyword.strategy.semanticQualification?.intent, ...keyword.strategy.coveredIntentions]),
  ).map(value => value.toLowerCase());

  const comerciais = intencoes.filter(value => /transacional|transactional|commercial|comercial/.test(value));
  return {
    declaredIntents: [...new Set(intencoes)],
    commercialKeywords: comerciais.length,
    /** A composição declara comportamento comercial em alguma keyword? */
    expectsCommercialSerp: comerciais.length > 0,
  };
}
