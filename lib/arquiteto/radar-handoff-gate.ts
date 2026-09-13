/**
 * QUEM PODE IR PARA O RADAR — E POR QUE O RESTO NÃO PODE.
 *
 * O Radar investiga uma arquitetura já deliberada. Mandar para lá um Article
 * incompleto não produz uma pesquisa parcial: produz uma pesquisa sobre um
 * objeto que o Arquiteto não terminou de decidir, e o resultado volta parecendo
 * evidência quando é ruído.
 *
 * Por isso a elegibilidade é por Article, não por lote, e cada recusa vem com
 * a frase que um humano consegue ler. "0 enviados" sem motivo é a pior saída
 * possível: ela não diz o que fazer a seguir.
 *
 * Este módulo NÃO envia nada. Ele responde uma pergunta.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const RADAR_GATE_CODES = [
  "ARTICLE_DNA_CURRENT",
  "ARTICLE_PARENT_EXPLICIT",
  "CANONICAL_SILO_BINDING",
  "NO_CROSS_SILO",
  "PRINCIPAL_DEFINED",
  "COMPOSITION_VALID",
  "MAX_KEYWORDS_RESPECTED",
  "SLUG_STATE_VALID",
  "SERP_EXECUTED",
  "SERP_CURRENT",
  "SERP_RESOLVED",
  "INTERNAL_LINK_GRAPH_APPROVED",
] as const;

export type RadarGateCode = (typeof RADAR_GATE_CODES)[number];

export type RadarGateCheck = {
  code: RadarGateCode;
  ok: boolean;
  /** O motivo em linguagem humana; a recusa explica, não apenas nega. */
  detail: string;
};

export type RadarCandidateArticle = {
  articleId: string;
  label: string;
  articleDnaVersionId: string | null;
  articleDnaContentHash: string | null;
  /** Pai territorial declarado no payload. */
  territoryRef: string | null;
  /** Silo CANÔNICO declarado no payload. `null` é o normal na primeira passada. */
  siloId: string | null;
  /**
   * O par canônico do TERRITÓRIO foi resolvido?
   *
   * `ArticleDNA.siloId` nasce nulo por contrato — o artigo é escrito antes do
   * SiloDNA existir. Quem responde "existe Silo canônico para este artigo" é a
   * resolução por território, feita uma vez pelo chamador e informada aqui.
   */
  canonicalSiloResolved?: boolean;
  principalKeywordId: string | null;
  secondaryKeywordIds: readonly string[];
  narrativeReinforcementIds: readonly string[];
  suggestedSlug: string | null;
  /** Silo que a membership das keywords aponta; divergir é cross-Silo. */
  keywordTerritoryRefs: readonly string[];
  /** Estado do gate SERP da formação para a composição vigente. */
  serpState: string | null;
  serpReason: string | null;
  /** Grafo de links aprovado que cobre este Article. */
  internalLinkGraphApproved: boolean;
  /** Este ArticleDNA descreve o cenário corrente? */
  belongsToCurrentScenario: boolean;
  readbackConfirmed: boolean;
  /**
   * A FORMAÇÃO JÁ ABSORVEU ESTE PARECER?
   *
   * `Concluir formação` é o ato que decide sobre a composição — inclusive
   * sobre um parecer SERP inconclusivo. Quando ele acontece e produz um
   * ArticleDNA aprovado e vigente, a pergunta "a SERP espera decisão?" já foi
   * respondida: respondida por gente, no lugar onde ela é feita.
   *
   * Sem isto, o portão final reabria o inconclusivo e pedia à pessoa uma
   * decisão que ela já tinha tomado — e que não tem mais onde ser tomada,
   * porque a fase Artigos está encerrada.
   */
  formationConcluded?: boolean;
  /**
   * Pendência humana EXPLÍCITA gravada no próprio artefato.
   *
   * Esta é a única coisa que ainda barra por SERP depois da formação: uma
   * decisão nomeada, vigente e não resolvida. `humanPendingDecisions` do
   * ArticleDNA é onde ela vive.
   */
  humanPendingDecisions?: readonly string[];
};

export type RadarEligibility = {
  articleId: string;
  label: string;
  eligible: boolean;
  checks: RadarGateCheck[];
  /** Só os motivos que barram; é o que a mesa mostra. */
  blockers: string[];
};

const SERP_LIBERA = new Set([
  "current_supported",
  "current_divergent_resolved",
  "current_inconclusive_resolved",
]);

const SERP_EXECUTADA = (state: string | null) => Boolean(state && state.startsWith("current_"));

/**
 * O ceiling é repetido aqui como guarda de saída, não como segunda autoridade.
 *
 * Quem decide a composição é a formação; aqui só conferimos que o que está
 * saindo respeita o contrato que ela já aplicou.
 */
const MAX_KEYWORDS = 6;

export function resolveRadarEligibility(article: RadarCandidateArticle): RadarEligibility {
  const composicao = [
    article.principalKeywordId,
    ...article.secondaryKeywordIds,
    ...article.narrativeReinforcementIds,
  ].filter((value): value is string => Boolean(value));

  const cross = article.keywordTerritoryRefs
    .filter(ref => ref && article.territoryRef && ref !== article.territoryRef);

  const checks: RadarGateCheck[] = [
    {
      code: "ARTICLE_DNA_CURRENT",
      ok: Boolean(article.articleDnaVersionId) && article.belongsToCurrentScenario && article.readbackConfirmed,
      detail: !article.articleDnaVersionId
        ? "Este artigo ainda não tem ArticleDNA materializado."
        : !article.belongsToCurrentScenario
          ? "Este ArticleDNA descreve outra composição; ele é acervo, não o cenário corrente."
          : !article.readbackConfirmed
            ? "A gravação deste ArticleDNA não foi confirmada pelo remoto."
            : "ArticleDNA vigente e confirmado no remoto.",
    },
    {
      code: "ARTICLE_PARENT_EXPLICIT",
      ok: Boolean(article.territoryRef),
      detail: article.territoryRef
        ? "O pai estrutural está declarado no payload."
        : "O ArticleDNA não declara o Silo pai; ele só o descobriria pelo consenso das keywords.",
    },
    {
      code: "CANONICAL_SILO_BINDING",
      /*
       * O PAR CANÔNICO PODE SER RESOLVIDO PELO TERRITÓRIO.
       *
       * Esta checagem exigia `siloId` preenchido no ArticleDNA. Mas o contrato
       * da materialização inicial é o oposto: o ArticleDNA nasce ANTES do
       * SiloDNA — a auditoria de referências provou que ele não aponta para o
       * Silo — e `siloId` nasce `null`, com `territoryRef` carregando o pai.
       *
       * O que precisa existir é o PAR: SiloDNA e SiloPage canônicos do
       * território. Quem resolve isso é `resolveCanonicalSiloForArticle`, e o
       * chamador informa o resultado em `canonicalSiloResolved`. Exigir o
       * campo em vez do par mandava criar sucessora de ArticleDNA só para
       * preencher referência — exatamente o que a doutrina proíbe.
       */
      ok: Boolean(article.siloId) || Boolean(article.canonicalSiloResolved),
      detail: article.siloId || article.canonicalSiloResolved
        ? "O artigo aponta para um Silo canônico."
        : "O artigo tem território confirmado, mas nenhum Silo canônico: falta consolidar SiloDNA e SiloPage.",
    },
    {
      code: "NO_CROSS_SILO",
      ok: cross.length === 0,
      detail: cross.length === 0
        ? "Todas as buscas do artigo pertencem ao mesmo Silo."
        : `${cross.length} busca(s) deste artigo pertencem a outro Silo.`,
    },
    {
      code: "PRINCIPAL_DEFINED",
      ok: Boolean(article.principalKeywordId),
      detail: article.principalKeywordId
        ? "O artigo tem uma Principal definida."
        : "O artigo não tem Principal; ninguém o lidera.",
    },
    {
      code: "COMPOSITION_VALID",
      ok: composicao.length === new Set(composicao).size,
      detail: composicao.length === new Set(composicao).size
        ? "Nenhuma busca ocupa dois papéis no mesmo artigo."
        : "Há busca repetida entre Principal, secundárias e reforços.",
    },
    {
      code: "MAX_KEYWORDS_RESPECTED",
      ok: composicao.length <= MAX_KEYWORDS,
      detail: composicao.length <= MAX_KEYWORDS
        ? `A composição respeita o teto de ${MAX_KEYWORDS} buscas.`
        : `A composição tem ${composicao.length} buscas e o teto é ${MAX_KEYWORDS}.`,
    },
    {
      code: "SLUG_STATE_VALID",
      ok: Boolean(article.suggestedSlug),
      detail: article.suggestedSlug
        ? "O artigo tem endereço proposto."
        : "O artigo não tem endereço proposto; o Radar não saberia o que está investigando.",
    },
    {
      code: "SERP_EXECUTED",
      ok: SERP_EXECUTADA(article.serpState),
      detail: SERP_EXECUTADA(article.serpState)
        ? "A composição foi confrontada com a SERP."
        : article.serpReason || "Esta composição ainda não foi confrontada com a SERP.",
    },
    {
      code: "SERP_CURRENT",
      // Divergente e inconclusivo TÊM evidência vigente: o que falta neles é
      // decisão, e isso é o gate seguinte. Confundir os dois faria a mesa
      // mandar coletar de novo o que já está gravado.
      ok: article.serpState !== "stale" && article.serpState !== "failed",
      detail: article.serpState === "stale"
        ? "A composição mudou depois da coleta; a evidência não descreve mais este artigo."
        : article.serpState === "failed"
          ? "A coleta da SERP falhou neste artigo."
          : "A evidência SERP descreve a composição atual.",
    },
    (() => {
      /*
       * A FORMAÇÃO CONCLUÍDA É A DECISÃO EDITORIAL SOBRE A SERP.
       *
       * A homologação recusou quatro ArticleDNA aprovados dizendo "o parecer
       * da SERP ainda espera decisão editorial". Os quatro tinham parecer
       * inconclusivo — e os quatro já tinham passado por `Concluir formação`,
       * que é exatamente o ato onde essa decisão é tomada. O portão final
       * pedia de novo uma decisão já tomada, num lugar onde ela não pode mais
       * ser tomada: a fase Artigos está encerrada.
       *
       * A autoridade é o RESULTADO canônico da formação, não o parecer bruto.
       * O que continua barrando é pendência humana EXPLÍCITA gravada no
       * artefato — essa é vigente e ninguém a resolveu.
       */
      const liberadoPelaSerp = Boolean(article.serpState && SERP_LIBERA.has(article.serpState));
      const pendenciaExplicita = (article.humanPendingDecisions || []).length > 0;
      const absorvidoPelaFormacao = Boolean(article.formationConcluded)
        && article.readbackConfirmed
        && !pendenciaExplicita;
      return {
        code: "SERP_RESOLVED",
        ok: liberadoPelaSerp || absorvidoPelaFormacao,
        detail: liberadoPelaSerp
          ? "O parecer da SERP está sustentado ou resolvido por decisão humana."
          : absorvidoPelaFormacao
            ? "A conclusão da formação decidiu sobre este parecer; o ArticleDNA aprovado é o resultado dessa decisão."
            : pendenciaExplicita
              ? `A formação deixou decisão humana pendente: ${(article.humanPendingDecisions || []).join(" · ")}`
              : "O parecer da SERP ainda espera decisão editorial.",
      };
    })(),
    {
      code: "INTERNAL_LINK_GRAPH_APPROVED",
      ok: article.internalLinkGraphApproved,
      detail: article.internalLinkGraphApproved
        ? "O artigo está coberto por um InternalLinkGraph aprovado."
        : "Não há InternalLinkGraph aprovado para este artigo; a fase Links Internos ainda não fechou.",
    },
  ];

  const blockers = checks.filter(check => !check.ok).map(check => check.detail);
  return {
    articleId: article.articleId,
    label: article.label,
    eligible: blockers.length === 0,
    checks,
    blockers,
  };
}

export type RadarHandoffPlan = {
  eligible: RadarEligibility[];
  blocked: RadarEligibility[];
  /** Quantos artigos cada motivo está barrando — o caminho mais curto. */
  blockersByCode: { code: RadarGateCode; count: number; detail: string }[];
};

/**
 * O plano do lote.
 *
 * `blockersByCode` existe para responder "o que destrava mais coisas de uma
 * vez": com oito artigos parados pelo mesmo motivo, resolver esse motivo é o
 * único trabalho que importa.
 */
export function buildRadarHandoffPlan(articles: readonly RadarCandidateArticle[]): RadarHandoffPlan {
  const avaliados = articles.map(resolveRadarEligibility);
  const porCodigo = new Map<RadarGateCode, { count: number; detail: string }>();

  for (const item of avaliados) {
    for (const check of item.checks) {
      if (check.ok) continue;
      const atual = porCodigo.get(check.code);
      porCodigo.set(check.code, { count: (atual?.count || 0) + 1, detail: atual?.detail || check.detail });
    }
  }

  return {
    eligible: avaliados.filter(item => item.eligible),
    blocked: avaliados.filter(item => !item.eligible),
    blockersByCode: [...porCodigo.entries()]
      .map(([code, value]) => ({ code, ...value }))
      .sort((left, right) => right.count - left.count),
  };
}

/* ------------------- proveniência da SERP para o Radar ------------------- */

/**
 * O que o Radar precisa saber sobre a SERP que o Arquiteto já rodou.
 *
 * Não são os snapshots: é a rastreabilidade da deliberação. O Radar precisa
 * saber que investiga uma arquitetura discutida — qual composição foi olhada,
 * o que o mercado respondeu e, se houve divergência, quem decidiu seguir assim.
 *
 * Sem isso o Radar recomeça a conversa do zero e pode "descobrir" exatamente a
 * divergência que já foi vista e resolvida por uma pessoa.
 */
export type ArchitectSerpProvenance = {
  assessmentId: string;
  formationBaseHash: string;
  verdict: "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE";
  humanResolution: {
    decision: string;
    reason: string;
    decidedBy: string;
    decidedAt: string;
  } | null;
};

export function buildArchitectSerpProvenance(input: {
  assessmentId: string;
  formationBaseHash: string;
  verdict: "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE";
  humanResolution?: { decision: string; reason: string; decidedBy: string; decidedAt: string } | null;
}): ArchitectSerpProvenance {
  return {
    assessmentId: input.assessmentId,
    formationBaseHash: input.formationBaseHash,
    verdict: input.verdict,
    humanResolution: input.humanResolution ?? null,
  };
}

/**
 * A evidência do Radar continua valendo para esta versão do Article?
 *
 * Uma sucessora do ArticleDNA não invalida o que foi pesquisado — mas também
 * não herda. Tratar a evidência da v1 como atual na v2 é a mesma classe de
 * erro que tratar SERP de outra composição como vigente.
 */
export function radarEvidenceIsStale(input: {
  evidenceArticleDnaVersionId: string;
  evidenceArticleDnaContentHash: string | null;
  currentArticleDnaVersionId: string;
  currentArticleDnaContentHash: string | null;
}): boolean {
  if (input.evidenceArticleDnaVersionId !== input.currentArticleDnaVersionId) return true;
  if (!input.evidenceArticleDnaContentHash || !input.currentArticleDnaContentHash) return false;
  return input.evidenceArticleDnaContentHash !== input.currentArticleDnaContentHash;
}
