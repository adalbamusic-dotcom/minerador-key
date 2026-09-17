import type { RadarAmazonUniverseEntry } from "./amazon-search-model.ts";
import type { RadarAmazonEditorialSetup } from "./amazon-editorial-target.ts";
import type { RadarCompetitiveBlueprint } from "./competitive-blueprint.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import type { RadarArticleResearchContext, RadarResearchKeyword } from "./article-research-context.ts";
import type { RadarEditorialArticleModel } from "./editorial-article-model.ts";
import type { RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";
import type { RadarPortableEditorial, RadarPortableSection } from "./portable-read-model.ts";
import { radarPortableFlatSections } from "./portable-read-model.ts";
import { radarConclusiveIntents, radarDeclaredKeywordIntent } from "./editorial-identity.ts";

/**
 * ===== O EVIDENCE PACK — RADAR_PORTABLE_EXPORT_1.2 · §1 e §5 a §16 =====
 *
 * ==================== A PERGUNTA QUE ESTE ARQUIVO RESPONDE ====================
 *
 * "Se o banco do Minerador Key ficasse inacessível depois da exportação, este
 * dossiê ainda teria contexto editorial suficiente para redigir o conteúdo
 * corretamente?" (§19)
 *
 * O 1.1 entregou a SÍNTESE: radiografia, estratégia, estrutura, brief. Síntese
 * é uma leitura da evidência — e quem escreve, ao encontrar uma afirmação que
 * não entendeu, não tinha para onde olhar. O EVIDENCE PACK é esse lugar.
 *
 * ==================== COMPLETUDE NÃO É RAW — §20 ====================
 *
 * SIM: "o Google encontrou as perguntas X, Y e Z"; "a página A sustenta a
 * necessidade X"; "10 de 10 páginas usam imagem".
 *
 * NÃO: o JSON do endpoint do DataForSEO, HTML de concorrente, transcript
 * inteiro, conteúdo integral de terceiro.
 *
 * Tudo aqui é evidência JÁ NORMALIZADA pelo Radar, projetada para leitura
 * externa. Nada é recalculado, reclassificado ou coletado (§21).
 *
 * ==================== AUSÊNCIA É DECLARADA — §22 ====================
 *
 * `[]` e a frase explícita. "Não existe" e "o export esqueceu" precisam ser
 * distinguíveis por quem consome de fora.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export const RADAR_PORTABLE_NO_EVIDENCE = "Nenhuma evidência deste tipo foi anexada a este artigo.";

/* ========================= §3 e §4 · o DNA das keywords ========================= */

export type RadarPortableKeywordDna = {
  keyword: string | null;
  role: "PRIMARY" | "SECONDARY" | "NARRATIVE";
  /** §3 · a principal precisa ser reconhecível sem interpretar a lista. */
  isPrincipal: boolean;
  intent: string | null;
  funnel: string | null;
  volume: number | null;
  resultCount: number | null;
  kgrScore: number | null;
  incrementalVolume: number | null;
  /** As intenções cobertas que CONCLUEM. O sentinela da autoridade já saiu. */
  conclusiveIntentions: string[];
  strategicContribution: string | null;
  purpose: string | null;
  overlapRisk: string | null;
  semanticState: string | null;
  /** De onde o TEXTO veio. `none` significa keyword não resolvida. */
  textSource: string;
  resolution: string;
};

const PAPEL: Record<RadarResearchKeyword["identity"]["role"], RadarPortableKeywordDna["role"]> = {
  principal: "PRIMARY",
  secundaria: "SECONDARY",
  reforco_narrativo: "NARRATIVE",
};

const ROTULO_DO_PAPEL: Record<RadarPortableKeywordDna["role"], string> = {
  PRIMARY: "Principal",
  SECONDARY: "Secundária",
  NARRATIVE: "Reforço narrativo",
};

/**
 * ===== §3 · SÓ CAMPO QUE EXISTE UPSTREAM =====
 *
 * O gate pede volume, KGR, intenção, competição, resultados e papel semântico.
 * O que a autoridade do Minerador/Arquiteto realmente carrega é o que está
 * abaixo — e `competition` não está entre eles. Inventar a coluna faria uma
 * ferramenta externa tomar decisão sobre um número que ninguém mediu.
 */
export function radarPortableKeywordsDna(context: RadarArticleResearchContext | null): RadarPortableKeywordDna[] {
  return (context?.keywords || []).map(item => ({
    keyword: item.identity.text,
    role: PAPEL[item.identity.role],
    isPrincipal: item.identity.role === "principal",
    /*
     * A INTENÇÃO DA KEYWORD VEM DA AUTORIDADE — Gate 18.6 · §2.
     *
     * Ler a intenção normalizada direto é o que fazia "unknown" vencer uma
     * qualificação semântica que tinha concluído. A ordem entre qualificação,
     * intenção normalizada e intenções cobertas é dela, não minha.
     */
    intent: radarDeclaredKeywordIntent(item.strategy),
    funnel: item.strategy.semanticQualification?.funnel ?? null,
    volume: item.strategy.volume,
    resultCount: item.strategy.resultCount,
    kgrScore: item.strategy.kgrScore,
    incrementalVolume: item.strategy.incrementalVolume,
    conclusiveIntentions: radarConclusiveIntents(item.strategy.coveredIntentions),
    strategicContribution: item.strategy.strategicContribution ?? item.strategy.contribution,
    purpose: item.strategy.purpose,
    overlapRisk: item.strategy.overlapRisk,
    semanticState: item.strategy.semanticQualification?.semanticState ?? null,
    textSource: item.provenance.textSource,
    resolution: item.resolution,
  }));
}

const numero = (valor: number | null, sufixo = ""): string | null =>
  valor === null || valor === undefined ? null : `${valor}${sufixo}`;

/**
 * §4 · O MESMO DADO EM PROSA — porque é isto que um LLM consome sem instrução.
 *
 * O JSON serve à automação. Quem escreve precisa saber COMO cada keyword entra
 * na narrativa, e isso é uma frase, não um par chave-valor.
 */
export function radarKeywordsContextMarkdown(keywords: readonly RadarPortableKeywordDna[]): string {
  if (!keywords.length) return `# Keywords\n\n${RADAR_PORTABLE_NO_EVIDENCE}`;

  const ficha = (item: RadarPortableKeywordDna): string[] => [
    "",
    `### ${item.keyword || "Keyword não resolvida"}`,
    ...[
      `Papel: ${ROTULO_DO_PAPEL[item.role]}`,
      item.intent ? `Intenção: ${item.intent}` : null,
      item.funnel ? `Etapa do funil: ${item.funnel}` : null,
      numero(item.volume, " busca(s)/mês"),
      item.kgrScore !== null ? `KGR: ${item.kgrScore}` : null,
      numero(item.resultCount, " resultado(s) concorrentes"),
      item.conclusiveIntentions.length ? `Intenções cobertas: ${item.conclusiveIntentions.join(", ")}` : null,
      item.strategicContribution ? `Contribuição: ${item.strategicContribution}` : null,
      item.purpose ? `Propósito: ${item.purpose}` : null,
      item.overlapRisk ? `Risco de sobreposição: ${item.overlapRisk}` : null,
    ].filter((valor): valor is string => Boolean(valor)),
    /*
     * COMO ELA ENTRA NO TEXTO — a única linha que responde "e daí?".
     *
     * As três frases são fixas por PAPEL, e não por keyword: o papel é o que
     * decide o tratamento, e variar a instrução por termo ensinaria uma
     * disciplina diferente a cada artigo.
     */
    item.role === "PRIMARY"
      ? "Como usar: é a keyword do artigo. Precisa aparecer no H1, na abertura e ao longo do texto com naturalidade — nunca forçada."
      : item.role === "SECONDARY"
        ? "Como usar: cobre uma faceta da mesma intenção. Entra como cabeçalho ou dentro da seção que trata do assunto, sem virar seção própria por decreto."
        : "Como usar: reforço narrativo. Aparece no corpo do texto para sustentar o argumento, e não pede seção nem cabeçalho.",
  ];

  const porPapel = (papel: RadarPortableKeywordDna["role"]) => keywords.filter(item => item.role === papel);

  return [
    "# Keywords",
    ...(porPapel("PRIMARY").length ? ["", "## Principal", ...porPapel("PRIMARY").flatMap(ficha)] : []),
    ...(porPapel("SECONDARY").length ? ["", "## Secundárias", ...porPapel("SECONDARY").flatMap(ficha)] : []),
    ...(porPapel("NARRATIVE").length ? ["", "## Reforços narrativos", ...porPapel("NARRATIVE").flatMap(ficha)] : []),
  ].join("\n").trim();
}


/* ==================== POLIMENTO · a higiene do dossiê portátil ==================== */

/**
 * ===== O INSTANTE, E SÓ QUANDO ELE É UM INSTANTE =====
 *
 * A fotografia competitiva usa a impressão digital da rodada como carimbo
 * quando ninguém informa o relógio — um valor composto, técnico, que num CSV
 * aberto no Excel parece uma data corrompida.
 */
const instanteReal = (valor: string | null | undefined): string | null =>
  valor && !Number.isNaN(Date.parse(valor)) ? valor : null;

/**
 * ===== O QUE NÃO TEM FUNÇÃO EDITORIAL NÃO É FONTE =====
 *
 * A amostra cita política de privacidade, termos de uso, login, carrinho e
 * página de revendedor dentro do conteúdo. Eles passam pelo filtro de
 * "referência de conteúdo" porque estão no corpo do texto — e não sustentam
 * afirmação nenhuma.
 *
 * A exceção é explícita: um destino CLASSIFICADO como oficial ou estudo
 * atravessa mesmo com caminho de utilidade, porque aí a classificação é a
 * evidência, e não o caminho.
 */
const TOKENS_DE_UTILIDADE = [
  "privacidade", "privacy", "politica", "policy", "termos", "terms", "cookies",
  "login", "signin", "sign-in", "entrar", "cadastro", "cadastrar", "conta", "account",
  "carrinho", "cart", "checkout", "onde-comprar", "revendedor", "revendedores",
  "assinatura", "newsletter", "contato", "contact", "sitemap", "busca", "search",
];

const FONTE_CLASSIFICADA = new Set(["official", "study"]);

/**
 * A COMPARAÇÃO É POR SEGMENTO, e não por substring solta.
 *
 * `/politica-de-privacidade` é utilidade; `/receitas/como-fazer-cookies` não é,
 * e uma varredura por "cookie" no caminho inteiro excluiria a segunda. O que
 * distingue é o segmento COMEÇAR pelo token — que é como uma URL de utilidade
 * realmente se escreve.
 */
const segmentoDeUtilidade = (segmento: string): boolean =>
  TOKENS_DE_UTILIDADE.some(token => segmento === token || segmento.startsWith(`${token}-`) || segmento.startsWith(`${token}_`));

export function radarPortableSourceHasEditorialFunction(fonte: {
  url: string;
  sourceType: string;
}): boolean {
  if (FONTE_CLASSIFICADA.has(fonte.sourceType)) return true;

  let caminho = fonte.url;
  try { caminho = new URL(fonte.url).pathname; } catch { /* URL relativa: o texto serve. */ }

  return !caminho.toLowerCase().split("/").filter(Boolean).some(segmentoDeUtilidade);
}

/* ============ §5, §6 e §7 · a evidência da SERP e as fontes ============ */

export type RadarPortableSerpEvidence = {
  queries: string[];
  sample: {
    queriesExecuted: number;
    uniqueReferences: number;
    comparablePages: number;
    analyzedSuccess: number;
    failedFinal: number;
    recurrentReferences: number;
  } | null;
  intent: { declared: string | null; observedInSerp: string | null; observedInPages: string | null; alignment: string; note: string } | null;
  formats: Array<{ label: string; pages: number; comparable: boolean }>;
  structuralPatterns: Array<{ label: string; present: number; sampleSize: number; verdict: string; evidence: string }>;
  concepts: Array<{ label: string; status: string; sourceCount: number; sampleSize: number; queries: string[]; evidence: string }>;
  questions: Array<{ question: string; status: string; pages: number; sampleSize: number; declaredByArticle: boolean; evidence: string }>;
  entities: { article: string[]; shared: Array<{ label: string; pages: number }>; marketOnly: Array<{ label: string; pages: number }> };
  gaps: Array<{ subject: string; against: string; pagesCovering: number; sampleSize: number; evidence: string }>;
  differentiations: Array<{ subject: string; basis: string; pagesCovering: number; evidence: string }>;
  conflicts: Array<{ subject: string; articleSide: string | null; observedSide: string | null; impact: string }>;
  /** §26 · os candidatos que o blueprint referencia por id. */
  editorialCandidates: Array<{ observedLabel: string; pages: number; sampleSize: number; verdict: string; reason: string; section: string | null }>;
  authorityClaims: Array<{ claim: string; evidenceType: string; sourceTypeNeeded: string; ymylRelevant: boolean; specialistReason: string | null }>;
  crossSerp: Array<{ statement: string; evidence: string }>;
  sufficiency: { level: string; reasons: string[] } | null;
  observedAt: string | null;
};

export function radarPortableSerpEvidence(input: {
  observed: RadarCompetitiveObservedModel | null;
  blueprint: RadarCompetitiveBlueprint | null;
  articleModel: RadarEditorialArticleModel | null;
}): RadarPortableSerpEvidence {
  const visto = input.observed;

  /* §2 · o cabeçalho que hospeda cada candidato, para o id nunca sair. */
  const cabecalhoPorSecao = new Map<string, string>();
  const registrar = (secoes: readonly RadarEditorialArticleModel["sections"][number][]) => {
    for (const secao of secoes) {
      cabecalhoPorSecao.set(secao.id, secao.headingSuggestion);
      registrar(secao.childSections);
    }
  };
  registrar(input.articleModel?.sections || []);
  const google = input.blueprint?.profile === "GOOGLE" ? input.blueprint : null;

  return {
    /*
     * AS CONSULTAS SAEM DOS CONCEITOS, e não de uma lista à parte.
     *
     * Cada conceito guarda as consultas que o encontraram. A união delas é o
     * conjunto realmente executado — e é conferível contra o próprio conceito,
     * o que uma lista solta não seria.
     */
    queries: [...new Set((visto?.concepts.all || []).flatMap(item => item.queries))].sort(),
    sample: visto
      ? {
        queriesExecuted: visto.sample.queriesExecuted,
        uniqueReferences: visto.sample.uniqueReferences,
        comparablePages: visto.sample.comparablePages,
        analyzedSuccess: visto.sample.analyzedSuccess,
        failedFinal: visto.sample.failedFinal,
        recurrentReferences: visto.sample.recurrentReferences,
      }
      : null,
    intent: visto
      ? {
        declared: visto.intent.declared,
        observedInSerp: visto.intent.observedInSerp,
        observedInPages: visto.intent.observedInPages,
        alignment: visto.intent.alignment,
        note: visto.intent.note,
      }
      : null,
    formats: (visto?.formats.distribution || []).map(item => ({ label: item.label, pages: item.pages, comparable: item.comparable })),
    structuralPatterns: (visto?.structure.patterns || []).map(item => ({
      label: item.label, present: item.present, sampleSize: item.sampleSize, verdict: item.verdict, evidence: item.evidence,
    })),
    concepts: (visto?.concepts.all || []).map(item => ({
      label: item.canonicalLabel, status: item.status,
      sourceCount: item.sourceCount, sampleSize: item.sampleSize,
      queries: [...item.queries], evidence: item.evidence,
    })),
    questions: (visto?.questions || []).map(item => ({
      question: item.canonicalQuestion, status: item.status,
      pages: item.pages, sampleSize: item.sampleSize,
      declaredByArticle: item.declaredByArticle, evidence: item.evidence,
    })),
    entities: {
      article: [...(visto?.entities.article || [])],
      shared: (visto?.entities.shared || []).map(item => ({ label: item.label, pages: item.pages })),
      marketOnly: (visto?.entities.marketOnly || []).map(item => ({ label: item.label, pages: item.pages })),
    },
    gaps: (visto?.gaps || []).map(item => ({
      subject: item.subject, against: item.against,
      pagesCovering: item.pagesCovering, sampleSize: item.sampleSize, evidence: item.evidence,
    })),
    differentiations: (visto?.differentiations || []).map(item => ({
      subject: item.subject, basis: item.basis, pagesCovering: item.pagesCovering, evidence: item.evidence,
    })),
    conflicts: (visto?.conflicts || []).map(item => ({
      subject: item.subject, articleSide: item.articleSide, observedSide: item.observedSide, impact: item.impact,
    })),
    /*
     * ===== O CANDIDATO SAI PELO RÓTULO, e a seção pelo CABEÇALHO =====
     *
     * Um id como "section:3fe7d06c" não diz nada a quem escreve e não abre
     * nada a quem audita: é o endereço interno de um agrupamento semântico.
     * O que liga
     * a evidência ao texto é o rótulo observado e o cabeçalho que a
     * hospeda — e os dois são legíveis.
     */
    editorialCandidates: (input.articleModel?.candidates || []).map(item => ({
      observedLabel: item.observedLabel, pages: item.pages, sampleSize: item.sampleSize,
      verdict: item.verdict, reason: item.reason,
      section: item.sectionId ? cabecalhoPorSecao.get(item.sectionId) ?? null : null,
    })),
    authorityClaims: (google?.recommended.authorityPlan || []).map(item => ({
      claim: item.claim, evidenceType: item.evidenceType, sourceTypeNeeded: item.sourceTypeNeeded,
      ymylRelevant: item.ymylRelevant, specialistReason: item.specialistReason,
    })),
    crossSerp: (google?.observed.refinementSignals || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    sufficiency: visto ? { level: visto.sufficiency.level, reasons: [...visto.sufficiency.reasons] } : null,
    /*
     * §1 · O INSTANTE, E SÓ QUANDO ELE É UM INSTANTE.
     *
     * A fotografia usa a impressão digital da rodada como carimbo quando
     * ninguém informa o relógio. Ela é composta e técnica — e num CSV que
     * vai para fora parece uma data corrompida.
     */
    observedAt: instanteReal(visto?.identity.observedAt),
  };
}

export type RadarPortableSerpSource = {
  type: "WEB_PAGE";
  title: string;
  url: string;
  domain: string;
  queries: string[];
  position: number | null;
  role: "COMPARABLE" | "REFERENCE" | "SUPPORT";
  usedFor: string[];
  format: string | null;
  extractionStatus: string;
};

/**
 * ===== §7 · AS FONTES COMPETITIVAS, NORMALIZADAS =====
 *
 * Nada de HTML e nada de conteúdo integral de concorrente. O que atravessa é o
 * ENDEREÇO e o que aquela página sustentou: é isso que permite a quem escreve
 * conferir uma afirmação sem copiar ninguém.
 */
export function radarPortableSerpSources(observed: RadarCompetitiveObservedModel | null): RadarPortableSerpSource[] {
  return (observed?.competitors || []).map(item => ({
    type: "WEB_PAGE" as const,
    title: item.title,
    url: item.url,
    domain: item.domain,
    queries: [...item.queries],
    position: item.ranks[0]?.rank ?? null,
    role: item.comparable ? "COMPARABLE" as const
      : item.origin === "AUXILIARY" ? "SUPPORT" as const
        : "REFERENCE" as const,
    usedFor: [...item.conceptsCovered, ...item.questionsCovered],
    format: item.format,
    extractionStatus: item.extractionStatus,
  }));
}

/* ============================ §14 · fontes externas ============================ */

export type RadarPortableExternalSource = {
  title: string;
  url: string;
  domain: string;
  sourceType: string;
  authorityClass: string;
  supports: string[];
  citedByPages: number;
};

export function radarPortableExternalSources(observed: RadarCompetitiveObservedModel | null): RadarPortableExternalSource[] {
  /*
   * ===== §14 · SÓ FONTE ÚTIL À REDAÇÃO =====
   *
   * `observedLinks` traz TODO link que a amostra citou, inclusive menu, rodapé
   * e comercial. O que serve a quem escreve são as CANDIDATAS A EVIDÊNCIA: as
   * citadas dentro do conteúdo, com âncora, seção e razão.
   *
   * `authoritySignals` são sinais OBSERVÁVEIS — domínio oficial, estudo,
   * instituição. Não é nota de autoridade: ninguém visitou a página.
   */
  return (observed?.externalSources.evidenceCandidates || [])
    .filter(item => Boolean(item.destinationUrl))
    .map(item => ({
      title: item.anchors[0] || item.domain,
      url: item.destinationUrl as string,
      domain: item.domain,
      sourceType: item.sourceType,
      authorityClass: item.authoritySignals[0] || "NAO_CLASSIFICADA",
      supports: [...item.sections],
      citedByPages: item.competitorsUsingIt,
    }))
    /* POLIMENTO · §3 · página de utilidade não sustenta afirmação nenhuma. */
    .filter(item => radarPortableSourceHasEditorialFunction(item));
}

/* ========================= §13 · os links internos ========================= */

export type RadarPortableInternalLink = {
  targetTitle: string;
  targetSlug: string | null;
  targetUrl: string | null;
  relationship: string;
  suggestedAnchor: string;
  placement: string;
  reason: string;
  /** §13 · quando a página de destino ainda não existe, isso é dito. */
  targetPublished: boolean;
};

/**
 * ===== §13 · `article:article-candidate:territory:…` NÃO É DESTINO =====
 *
 * O CSV entregava o id do nó do grafo como se fosse o endereço do link. Quem
 * escreve não tem como transformar isso num `href`, e nem como saber de que
 * artigo se trata.
 *
 * O plano de links do modelo observado já carrega o NOME do destino, a âncora,
 * o contexto de inserção e a razão. É isso que atravessa — e o id fica onde
 * sempre esteve, no grafo do Arquiteto.
 */
export function radarPortableInternalLinks(input: {
  observed: RadarCompetitiveObservedModel | null;
  blueprint: RadarCompetitiveBlueprint | null;
}): RadarPortableInternalLink[] {
  const plano = input.observed?.internalLinkPlan.outgoing || [];
  const doBlueprint = input.blueprint?.profile === "GOOGLE" ? input.blueprint.recommended.internalLinkPlan : [];

  /*
   * O NOME DO DESTINO VEM DO GRAFO, e é ele que atravessa.
   *
   * O plano de aplicação conhece o nó e o slug; quem sabe COMO aquela página se
   * chama é a pesquisa de links internos. Sem esse cruzamento, o CSV entregava
   * `article:article-candidate:territory:…` como destino — que não vira `href`
   * nem diz de que artigo se trata.
   */
  const nomePorNo = new Map((input.observed?.internalLinks.relatedInternalPages || [])
    .map(item => [item.nodeId, { label: item.label, slug: item.slug }]));

  const daArquitetura = plano.map(item => {
    const destino = nomePorNo.get(item.nodeId) || null;
    const slug = item.slug ?? destino?.slug ?? null;
    return {
      targetTitle: destino?.label || slug || item.approvedAnchorConcepts[0] || "Destino sem nome no grafo",
      targetSlug: slug,
      /* O Radar não conhece o domínio publicado: URL só existe quando o grafo a tem. */
      targetUrl: null,
      relationship: item.relationTypes.join(", ") || item.targetRole,
      suggestedAnchor: item.anchor.recommendedAnchor,
      placement: item.preferredContexts[0] || item.distribution[0] || "Onde aplicar ainda não foi fundamentado nesta rodada.",
      reason: item.reason,
      targetPublished: false,
    };
  });

  if (daArquitetura.length) return daArquitetura;

  return doBlueprint.map(item => ({
    targetTitle: item.target,
    targetSlug: null,
    targetUrl: null,
    relationship: item.role,
    suggestedAnchor: item.anchorDirection,
    placement: item.placementContext,
    reason: item.sourceSignal,
    targetPublished: false,
  }));
}

export function radarInternalLinksResolvedMarkdown(links: readonly RadarPortableInternalLink[]): string {
  if (!links.length) return `# Links internos\n\n${RADAR_PORTABLE_NO_EVIDENCE}`;

  return [
    "# Links internos",
    "",
    "Aplique somente os links abaixo. A arquitetura interna é do Arquiteto, e criar link novo aqui a desfaz.",
    "",
    ...links.flatMap(item => [
      "",
      `## ${item.targetTitle}`,
      `Relação: ${item.relationship}`,
      `Âncora sugerida: ${item.suggestedAnchor}`,
      `Onde aplicar: ${item.placement}`,
      ...(item.reason ? [`Por quê: ${item.reason}`] : []),
      item.targetUrl
        ? `Destino: ${item.targetUrl}`
        : item.targetSlug
          ? `Destino: /${item.targetSlug} — a página ainda não foi publicada; use o link relativo planejado.`
          : "Destino: a página ainda não existe. Deixe a âncora marcada no texto e não invente URL.",
    ]),
  ].join("\n").trim();
}

/* ========================= §8 · a evidência do YouTube ========================= */

export type RadarPortableYoutubeEvidence = {
  queries: string[];
  videos: Array<{
    videoId: string;
    url: string;
    title: string;
    channel: string | null;
    durationLabel: string | null;
    views: number | null;
    publishedAt: string | null;
    bestRank: number;
    occurrenceCount: number;
    isShort: boolean | null;
    badges: string[];
    universeClass: string;
    observedSignals: string[];
  }>;
  counts: { universe: number; longForm: number; shorts: number } | null;
  titlePatterns: Array<{ statement: string; evidence: string }>;
  recurrentChannels: Array<{ statement: string; evidence: string }>;
  googleSupport: Array<{ statement: string; evidence: string }>;
  gaps: Array<{ statement: string; evidence: string }>;
  /** §8 · o que a coleta NÃO observa. Sem isto, título vira conteúdo. */
  limitations: string[];
};

export const RADAR_YOUTUBE_SERP_ONLY_LIMITATION =
  "Nenhum vídeo foi assistido ou transcrito nesta investigação: a coleta lê título, canal, duração, posição e data. Nada aqui afirma o que é dito dentro de um vídeo.";

export function radarPortableYoutubeEvidence(input: {
  universe: readonly RadarYoutubeUniverseEntry[];
  blueprint: RadarCompetitiveBlueprint | null;
  /** POLIMENTO · §1 · as consultas da corrida, para o id virar o TEXTO. */
  queries?: ReadonlyArray<{ queryId: string; text: string }>;
}): RadarPortableYoutubeEvidence | null {
  const youtube = input.blueprint?.profile === "YOUTUBE" ? input.blueprint : null;
  if (!youtube && !input.universe.length) return null;

  return {
    /*
     * POLIMENTO · §1 · A CONSULTA É O TEXTO, e nunca o id dela.
     *
     * O universo guarda um id como "ytq:1", que é o endereço da consulta dentro
     * da corrida. Quem lê de fora precisa saber O QUE foi buscado — e o id
     * some quando a corrida não veio junto, em vez de sair como se fosse
     * o termo.
     */
    queries: (() => {
      const texto = new Map((input.queries || []).map(item => [item.queryId, item.text]));
      return [...new Set(input.universe
        .flatMap(item => item.queriesFoundIn)
        .map(id => texto.get(id) ?? null)
        .filter((valor): valor is string => Boolean(valor)))];
    })(),
    videos: input.universe.map(item => ({
      videoId: item.videoId,
      url: item.url,
      title: item.title,
      channel: item.channelName,
      durationLabel: item.durationLabel,
      views: item.views,
      publishedAt: item.publishedAt,
      bestRank: item.bestRank,
      occurrenceCount: item.occurrenceCount,
      isShort: item.isShorts,
      badges: [...item.badges],
      universeClass: item.universeClass,
      /*
       * SINAL OBSERVADO É O QUE A BUSCA MOSTROU — nunca o conteúdo do vídeo.
       *
       * "Apareceu em 3 consultas" e "é o primeiro resultado" são fatos sobre a
       * SERP. "Ensina a ordem da rotina" seria uma afirmação sobre um vídeo
       * que ninguém assistiu.
       */
      observedSignals: [
        `Melhor posição: ${item.bestRank}`,
        `Apareceu em ${item.occurrenceCount} consulta(s)`,
        item.universeReason,
      ],
    })),
    counts: youtube
      ? { universe: youtube.observed.comparableVideos, longForm: youtube.observed.longForm, shorts: youtube.observed.shorts }
      : { universe: input.universe.length, longForm: 0, shorts: 0 },
    titlePatterns: (youtube?.observed.titlePatterns || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    recurrentChannels: (youtube?.observed.recurrentChannels || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    googleSupport: (youtube?.observed.googleSupport || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    gaps: (youtube?.observed.gaps || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    limitations: [...new Set([RADAR_YOUTUBE_SERP_ONLY_LIMITATION, ...(youtube?.limitations || [])])],
  };
}

/* ========================= §16 · a evidência da Amazon ========================= */

export type RadarPortableAmazonEvidence = {
  editorialIntent: string | null;
  desiredCount: number | null;
  rankingCriteria: string | null;
  useCase: string | null;
  target: { type: string; categoryQuery: string | null; productClass: string | null; brandFilter: string | null } | null;
  observedCount: number;
  eligibleCount: number;
  shortlistCount: number;
  products: Array<{
    asin: string;
    title: string;
    cleanUrl: string;
    price: number | null;
    currency: string | null;
    rating: number | null;
    votes: number | null;
    badges: string[];
    purchaseSignals: string[];
    placements: string[];
    bestOrganicRank: number | null;
    bestSponsoredRank: number | null;
    occurrenceCount: number;
  }>;
  priceBands: Array<{ band: string; observedValue: number | null; currency: string; sampleSize: number; observedAt: string }>;
  comparisonCriteria: string[];
  relatedSearches: Array<{ statement: string; evidence: string }>;
  purchaseSignals: Array<{ statement: string; evidence: string }>;
  ratingSignals: Array<{ statement: string; evidence: string }>;
  placementSignals: Array<{ statement: string; evidence: string }>;
  googleSupport: Array<{ statement: string; evidence: string }>;
  requiresEnrichment: string[];
  limitations: string[];
};

const LIMPAR_URL = (asin: string, observada: string): string => {
  try {
    const host = new URL(observada).host;
    return `https://${host}/dp/${asin}`;
  } catch {
    return `https://www.amazon.com.br/dp/${asin}`;
  }
};

/**
 * ===== §16 · O UNIVERSO NORMALIZADO É EVIDÊNCIA, NÃO BACKUP =====
 *
 * Os 59 produtos com ASIN, título, preço, nota, selos e posição são a
 * prateleira como ela estava. Isso é o que permite a quem escreve conferir por
 * que seis foram escolhidos — e o que uma síntese sozinha nunca responde.
 *
 * O que NÃO atravessa é a resposta do provider: `check_url`, `se_results_count`,
 * `dib=`, imagem hospedada, HTML. Nada disso escreve uma linha.
 */
export function radarPortableAmazonEvidence(input: {
  setup: RadarAmazonEditorialSetup | null;
  blueprint: RadarCompetitiveBlueprint | null;
  universe: readonly RadarAmazonUniverseEntry[];
  counts: { observed: number; eligible: number; shortlist: number } | null;
  comparisonCriteria: readonly string[];
}): RadarPortableAmazonEvidence | null {
  const amazon = input.blueprint?.profile === "AMAZON" ? input.blueprint : null;
  if (!amazon && !input.setup) return null;

  return {
    editorialIntent: input.setup?.intent.type ?? null,
    desiredCount: input.setup?.intent.desiredCount ?? null,
    rankingCriteria: input.setup?.intent.rankingCriteria ?? null,
    useCase: input.setup?.intent.useCase ?? null,
    target: input.setup
      ? {
        type: input.setup.target.type,
        categoryQuery: input.setup.target.categoryQuery ?? null,
        productClass: input.setup.target.productClass ?? null,
        brandFilter: input.setup.target.brandFilter ?? null,
      }
      : null,
    observedCount: input.counts?.observed ?? input.universe.length,
    eligibleCount: input.counts?.eligible ?? 0,
    shortlistCount: input.counts?.shortlist ?? 0,
    products: input.universe.map(item => ({
      asin: item.asin,
      title: item.title,
      cleanUrl: LIMPAR_URL(item.asin, item.url),
      price: item.priceFrom,
      currency: item.currency,
      rating: item.ratingValue,
      votes: item.ratingVotes,
      badges: [
        ...(item.isAmazonChoice ? ["Amazon's Choice"] : []),
        ...(item.isBestSeller ? ["Mais vendido"] : []),
      ],
      purchaseSignals: [
        ...(item.boughtPastMonth ? [`${item.boughtPastMonth} compra(s) no último mês`] : []),
        ...item.offerText,
      ],
      placements: [...new Set(item.placements)],
      bestOrganicRank: item.bestOrganicRank,
      bestSponsoredRank: item.bestSponsoredRank,
      occurrenceCount: item.occurrenceCount,
    })),
    priceBands: (amazon?.observed.priceBands || []).map(item => ({
      band: item.band, observedValue: item.observedValue, currency: item.currency,
      sampleSize: item.sampleSize, observedAt: item.observedAt,
    })),
    comparisonCriteria: [...input.comparisonCriteria],
    relatedSearches: (amazon?.observed.relatedSearchSignals || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    purchaseSignals: (amazon?.observed.purchaseSignals || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    ratingSignals: (amazon?.observed.ratingSignals || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    placementSignals: (amazon?.observed.placementSignals || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    googleSupport: (amazon?.observed.googleSupport || []).map(item => ({ statement: item.statement, evidence: item.evidence })),
    requiresEnrichment: [...(amazon?.recommended.requiresEnrichment || [])],
    limitations: [...(amazon?.limitations || [])],
  };
}

/* ========================= §12 · a evidência por seção ========================= */

export type RadarPortableSectionEvidence = {
  section: string;
  level: 2 | 3;
  mustCover: boolean;
  evidenceStrength: string | null;
  /** §2 · o que sustenta esta seção, pelo RÓTULO observado — nunca por id. */
  evidenceLabels: string[];
  serpEvidence: string[];
  videoEvidence: string[];
  specialistEvidence: string[];
  sourceNeeds: string[];
  internalLinks: string[];
  mediaOpportunity: string[];
  limitations: string[];
};

/**
 * ===== §12 · QUAL EVIDÊNCIA PERTENCE A QUAL SEÇÃO =====
 *
 * Esta é a peça que torna o dossiê utilizável por outra IA. Um pacote de
 * evidência solto obriga quem consome a adivinhar a que trecho do texto cada
 * observação se aplica — e adivinhar é exatamente o que produz afirmação sem
 * lastro.
 */
export function radarPortableSectionEvidence(input: {
  editorial: RadarPortableEditorial;
  articleModel: RadarEditorialArticleModel | null;
  serp: RadarPortableSerpEvidence;
  videoBySection: ReadonlyMap<string, string[]>;
  specialistBySection: ReadonlyMap<string, string[]>;
}): RadarPortableSectionEvidence[] {
  const porId = new Map((input.articleModel ? radarFlatModelSections(input.articleModel) : []).map(item => [item.headingSuggestion, item]));
  /*
   * ===== POLIMENTO · §2 · A RELAÇÃO CONTINUA, O ENDEREÇO NÃO =====
   *
   * O modelo aponta para a evidência por id de candidato. O que atravessa para
   * fora é o RÓTULO daquele candidato: ele liga a seção à evidência do pack com
   * a mesma precisão, e é legível por quem escreve.
   */
  const rotuloPorCandidato = new Map((input.articleModel?.candidates || []).map(item => [item.id, item.observedLabel]));
  const candidatos = new Map(input.serp.editorialCandidates.map(item => [item.observedLabel, item]));

  const daSecao = (secao: RadarPortableSection): RadarPortableSectionEvidence => {
    const original = porId.get(secao.heading) || null;
    const rotulos = [...new Set((original?.evidenceRefs || [])
      .map(ref => rotuloPorCandidato.get(ref))
      .filter((valor): valor is string => Boolean(valor)))];

    return {
      section: secao.heading,
      level: secao.level,
      mustCover: secao.mustCoverReasons.length > 0,
      evidenceStrength: secao.evidenceStrength,
      evidenceLabels: rotulos,
      /*
       * A EVIDÊNCIA RESOLVIDA, e não o rótulo repetido.
       *
       * Quem lê de fora precisa da FRASE. O rótulo fica ao lado, em
       * `evidenceLabels`, para quem quiser cruzar com o pack.
       */
      serpEvidence: rotulos
        .map(rotulo => candidatos.get(rotulo))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map(item => `${item.observedLabel} — ${item.pages} de ${item.sampleSize} página(s). ${item.reason}`),
      videoEvidence: [...(input.videoBySection.get(secao.heading) || [])],
      specialistEvidence: [...(input.specialistBySection.get(secao.heading) || [])],
      sourceNeeds: [
        ...(secao.sourceNeeded ? [secao.sourceNeeded] : []),
        ...(secao.specialistRequired ? [secao.specialistRequired] : []),
      ],
      internalLinks: [...secao.internalLinks],
      mediaOpportunity: [...secao.mediaOpportunity],
      limitations: secao.evidenceStrength === "DNA_REQUIRED"
        ? ["O ArticleDNA exige este assunto e a amostra não o sustenta: escreva sem apresentar como consenso de mercado."]
        : [],
    };
  };

  return radarPortableFlatSections(input.editorial.sections).map(daSecao);
}

/** As seções do modelo do Google, achatadas — para casar heading com refs. */
function radarFlatModelSections(modelo: RadarEditorialArticleModel): RadarEditorialArticleModel["sections"] {
  const achatar = (itens: RadarEditorialArticleModel["sections"]): RadarEditorialArticleModel["sections"] =>
    itens.flatMap(item => [item, ...achatar(item.childSections)]);
  return achatar(modelo.sections);
}

/* ============================== a prosa da SERP ============================== */

const lista = (itens: readonly string[]): string[] => itens.filter(Boolean).map(item => `- ${item}`);

const bloco = (titulo: string, linhas: readonly string[]): string[] =>
  linhas.length ? ["", `## ${titulo}`, "", ...linhas] : [];

/** §18 · a evidência da SERP em prosa, para entrar no contexto completo. */
export function radarSerpEvidenceMarkdown(pack: RadarPortableSerpEvidence): string {
  if (!pack.sample) return `# Evidência da SERP\n\n${RADAR_PORTABLE_NO_EVIDENCE}`;

  return [
    "# Evidência da SERP",
    "",
    `Amostra: ${pack.sample.comparablePages} página(s) comparável(is) de ${pack.sample.uniqueReferences} referência(s), em ${pack.sample.queriesExecuted} consulta(s).`,
    ...(pack.queries.length ? ["", `Consultas executadas: ${pack.queries.join(" · ")}`] : []),
    ...bloco("Conceitos recorrentes", lista(pack.concepts
      .filter(item => item.sourceCount > 0)
      .slice(0, 14)
      .map(item => `${item.label} — ${item.evidence}`))),
    ...bloco("Perguntas observadas", lista(pack.questions.slice(0, 14).map(item => `${item.question} — ${item.evidence}`))),
    ...bloco("Entidades que o mercado cita", lista(pack.entities.shared.concat(pack.entities.marketOnly)
      .slice(0, 12)
      .map(item => `${item.label} — ${item.pages} página(s)`))),
    ...bloco("Padrões estruturais", lista(pack.structuralPatterns.slice(0, 10).map(item => `${item.label} — ${item.evidence}`))),
    ...bloco("Lacunas", lista(pack.gaps.map(item => `${item.subject} — ${item.evidence}`))),
    ...bloco("Afirmações que pedem lastro", lista(pack.authorityClaims.map(item =>
      `${item.claim} — precisa de ${item.sourceTypeNeeded}${item.ymylRelevant ? " (assunto YMYL)" : ""}`))),
    ...(pack.sufficiency ? ["", `Suficiência: ${pack.sufficiency.level}. ${pack.sufficiency.reasons.join(" ")}`] : []),
  ].join("\n").trim();
}

/** §12 · a evidência por seção, em prosa. */
export function radarSectionEvidenceMarkdown(secoes: readonly RadarPortableSectionEvidence[]): string {
  if (!secoes.length) return `# Evidência por seção\n\n${RADAR_PORTABLE_NO_EVIDENCE}`;

  return [
    "# Evidência por seção",
    ...secoes.flatMap(item => [
      "",
      `## ${item.section}`,
      `Força da evidência: ${item.evidenceStrength || "não classificada"}${item.mustCover ? " · exigido pelo ArticleDNA" : ""}`,
      ...(item.serpEvidence.length ? ["O que a busca sustenta:", ...lista(item.serpEvidence)] : []),
      ...(item.videoEvidence.length ? ["O que o vídeo sustenta:", ...lista(item.videoEvidence)] : []),
      ...(item.specialistEvidence.length ? ["O que o especialista sustenta:", ...lista(item.specialistEvidence)] : []),
      ...(item.sourceNeeds.length ? ["Ainda precisa de:", ...lista(item.sourceNeeds)] : []),
      ...(item.limitations.length ? ["Cuidado:", ...lista(item.limitations)] : []),
    ]),
  ].join("\n").trim();
}

/** §14 · as fontes, em prosa. */
export function radarSourcesMarkdown(input: {
  serpSources: readonly RadarPortableSerpSource[];
  externalSources: readonly RadarPortableExternalSource[];
}): string {
  const corpo = [
    ...bloco("Concorrentes analisados", lista(input.serpSources
      .filter(item => item.role === "COMPARABLE")
      .slice(0, 20)
      .map(item => `${item.title} — ${item.url}`))),
    ...bloco("Fontes externas citadas pelo mercado", lista(input.externalSources
      .slice(0, 20)
      .map(item => `${item.title} (${item.authorityClass}) — ${item.url}`))),
  ];

  if (!corpo.length) return `# Fontes\n\n${RADAR_PORTABLE_NO_EVIDENCE}`;

  return [
    "# Fontes",
    "",
    "Os endereços abaixo são para CONFERIR, nunca para copiar. Nenhum conteúdo de concorrente foi exportado.",
    ...corpo,
  ].join("\n").trim();
}
