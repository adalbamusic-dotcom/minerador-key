/**
 * O UNIVERSO COMPETITIVO DA UNIDADE EDITORIAL — não "o top 8 da principal".
 *
 * Uma URL que aparece na principal E em duas secundárias disputa o mesmo
 * território editorial do artigo. Outra que aparece só numa consulta de reforço
 * é referência lateral. Uma terceira que aparece em duas consultas mas é ficha
 * de produto é concorrente comercial — evidência de intenção, não benchmark
 * editorial a imitar.
 *
 * A recorrência entre consultas é o sinal mais forte que a investigação tem, e
 * era exatamente o que se perdia ao pesquisar uma keyword só.
 *
 * Nada é eliminado em silêncio: tudo é CLASSIFICADO, com motivo legível. A
 * decisão editorial continua humana, e a prescrição continua sendo do
 * Planejador.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarConclusiveIntents } from "./editorial-identity.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import { buildRadarSemanticScope, radarEntityReadingAllows, radarSemanticEntityReading, type RadarEntityReading } from "./semantic-concept-model.ts";
import type { RadarQueryCandidate } from "./research-query-plan.ts";
import { radarNormalizedUrl } from "./research-reference.ts";

export type RadarCompetitorClass =
  | "EDITORIAL_COMPETITOR"
  | "COMMERCIAL_COMPETITOR"
  | "PRODUCT_REFERENCE"
  | "FORMAT_REFERENCE"
  | "AUTHORITY_SOURCE"
  | "SERP_FEATURE"
  | "LATERAL_REFERENCE"
  | "NOT_RELEVANT";

export type RadarUniverseResult = {
  position: number;
  url: string;
  title: string;
  domain: string;
  snippet?: string;
  inferredType?: string | null;
};

export type RadarExecutedQuery = {
  queryId: string;
  keyword: string;
  role: RadarQueryCandidate["role"];
  /** A keyword da composição que originou esta consulta, quando conhecida. */
  keywordId?: string | null;
  /** Canônica do artigo, auxiliar de pesquisa ou evidência da formação. */
  serpClass?: "canonical" | "auxiliary" | "formation";
  results: RadarUniverseResult[];
};

export type RadarCompetitorCandidate = {
  url: string;
  domain: string;
  title: string;
  appearedInQueries: string[];
  queryCount: number;
  principalRank: number | null;
  secondaryRanks: number[];
  reinforcementRanks: number[];
  rolesSeen: RadarQueryCandidate["role"][];
  formats: string[];
  /** O tipo observado é compatível com a intenção declarada da consulta? */
  intentCompatibility: "compatible" | "divergent" | "unknown";
  /**
   * A página trata do assunto do artigo?
   *
   * Quatro estados, e `unknown` é resposta legítima: antes da extração há só
   * título, URL e a consulta. `divergent` exige evidência positiva de outro
   * assunto — ausência de match léxico não é prova de nada.
   */
  entityCompatibility: RadarEntityReading;
  /** O domínio é o próprio site da marca (SiloPage/canonical)? */
  siloCompatibility: "own_domain" | "external" | "unknown";
  formationSerpSeen: boolean;
  formationSerpVerdict: string | null;
  humanFormationDecision: string | null;
  classification: RadarCompetitorClass;
  candidateReason: string;
};

export type RadarCompetitorUniverse = {
  candidates: RadarCompetitorCandidate[];
  queriesUsed: string[];
  uniqueDomains: number;
  byClass: Record<RadarCompetitorClass, number>;
  limitations: string[];
};

const normalizar = (value: string | null | undefined) =>
  (value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const PRODUTO = /\b(produto|comprar|carrinho|loja|shop|store|preco|preço|oferta|kit|sku|marketplace)\b/i;
const MARKETPLACE = /(mercadolivre|amazon|shopee|magazineluiza|americanas|submarino|aliexpress|shein)\./i;
const FORMATO = /(youtube|instagram|tiktok|facebook|pinterest|twitter|x\.com)\./i;
/* `gov.br` é o domínio do governo brasileiro — o ponto não vem antes de "gov". */
const AUTORIDADE = /((^|\.)gov(\.|$)|(^|\.)edu(\.|$)|(^|\.)org(\.|$)|who\.int|nih\.gov|scielo|pubmed|anvisa)/i;
const FEATURE = /^(paa|people_also_ask|related|knowledge_graph|featured)/i;

const dominioDe = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return ""; }
};

/**
 * O tipo observado conversa com a intenção que a consulta declarou?
 *
 * Uma consulta transacional trazendo loja é COERENTE — e foi por não perguntar
 * isso que "cremes skin care" virou "amostra falha" em vez de "consulta
 * comercial".
 */
function compatibilidadeDeIntencao(formatos: string[], intencoes: string[]): RadarCompetitorCandidate["intentCompatibility"] {
  if (!intencoes.length || !formatos.length) return "unknown";
  const comercial = intencoes.some(item => /transacional|transactional|commercial|comercial/.test(item));
  const informacional = intencoes.some(item => /informa|information/.test(item));
  const pareceProduto = formatos.some(item => /product|marketplace|local/.test(item));
  const pareceArtigo = formatos.some(item => /article|editorial|guide|blog/.test(item));
  if (comercial && pareceProduto) return "compatible";
  if (informacional && pareceArtigo) return "compatible";
  if (comercial && pareceArtigo) return "compatible";
  if (informacional && pareceProduto) return "divergent";
  return "unknown";
}

export function buildRadarCompetitorUniverse(input: {
  queries: RadarExecutedQuery[];
  context: RadarArticleResearchContext;
  /** URLs que a SERP de formação já mostrou, quando conhecidas. */
  formationUrls?: string[];
}): RadarCompetitorUniverse {
  const limitations: string[] = [];
  const formationUrls = new Set((input.formationUrls || []).map(url => radarNormalizedUrl(url)));
  const proprios = new Set([input.context.silo?.siloPageCanonical]
    .filter((value): value is string => Boolean(value))
    .map(dominioDe)
    .filter(Boolean));

  const entidades = input.context.keywords
    .map(keyword => {
      const snapshot = keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null;
      return typeof snapshot?.payload?.centralEntity === "string" ? snapshot.payload.centralEntity : null;
    })
    .filter((value): value is string => Boolean(value));

  /* O assunto do artigo por todos os seus nomes — a régua da leitura de entidade. */
  const escopoSemantico = buildRadarSemanticScope({
    centralEntities: entidades,
    principal: input.queries.find(query => query.role === "principal")?.keyword || null,
    /* `resolvedKeywordTexts` já é exatamente o texto resolvido de cada keyword. */
    keywordTexts: input.context.resolvedKeywordTexts,
    editorialTopics: input.context.editorialTopics,
  });

  /* A consulta que devolveu a página é evidência — e ela vive fora do candidato. */
  const textoDaConsulta = new Map(input.queries.map(query => [query.queryId, query.keyword]));

  const intencoes = radarConclusiveIntents(
    input.context.keywords.flatMap(keyword => [keyword.strategy.semanticQualification?.intent, keyword.strategy.normalizedIntent]),
  ).map(normalizar);

  const porUrl = new Map<string, RadarCompetitorCandidate>();

  for (const query of input.queries) {
    for (const resultado of query.results) {
      /*
       * A CHAVE É A URL NORMALIZADA CANÔNICA — a mesma que identifica a
       * referência da pesquisa. Duas autoridades com regras diferentes para
       * "é a mesma página?" produziriam universo e curadoria discordando.
       */
      const chave = radarNormalizedUrl(resultado.url);
      if (!chave) continue;
      const dominio = resultado.domain || dominioDe(resultado.url);
      const atual = porUrl.get(chave) || {
        url: resultado.url, domain: dominio, title: resultado.title,
        appearedInQueries: [], queryCount: 0,
        principalRank: null, secondaryRanks: [], reinforcementRanks: [],
        rolesSeen: [], formats: [],
        intentCompatibility: "unknown" as const,
        entityCompatibility: "unknown" as const,
        siloCompatibility: "unknown" as const,
        formationSerpSeen: formationUrls.has(chave),
        formationSerpVerdict: input.context.formationSerp?.verdict || null,
        humanFormationDecision: input.context.formationSerp?.humanResolution?.decision || null,
        classification: "NOT_RELEVANT" as RadarCompetitorClass,
        candidateReason: "",
      };

      if (!atual.appearedInQueries.includes(query.queryId)) {
        atual.appearedInQueries.push(query.queryId);
        atual.queryCount += 1;
      }
      if (!atual.rolesSeen.includes(query.role)) atual.rolesSeen.push(query.role);
      if (query.role === "principal") atual.principalRank = atual.principalRank ?? resultado.position;
      if (query.role === "secundaria") atual.secondaryRanks.push(resultado.position);
      if (query.role === "reforco_narrativo") atual.reinforcementRanks.push(resultado.position);

      const formato = normalizar(resultado.inferredType) || "other";
      if (!atual.formats.includes(formato)) atual.formats.push(formato);

      porUrl.set(chave, atual);
    }
  }

  /* -------------------------- a classificação ----------------------------- */

  for (const candidato of porUrl.values()) {
    const alvo = `${candidato.url} ${candidato.title}`;
    candidato.siloCompatibility = proprios.size ? (proprios.has(candidato.domain) ? "own_domain" : "external") : "unknown";
    /*
     * AUSÊNCIA DE STRING NÃO É AUSÊNCIA DE ASSUNTO.
     *
     * A leitura anterior perguntava se url+título continham LITERALMENTE a
     * entidade central. "peles oleosas" não contém "pele oleosa"; "oleosidade"
     * muito menos. A página saía como incompatível e o Gate 5 a barrava — um
     * veto construído em cima de uma diferença de flexão.
     *
     * Agora a pergunta é sobre RAÍZES, e o assunto é o artigo inteiro visto
     * por todos os seus nomes: entidade central, principal, secundárias,
     * reforços e tópicos editoriais — mais a CONSULTA que devolveu a página,
     * porque a SERP é evidência externa e não deve ser anulada por o nosso
     * matcher não conhecer a relação entre duas entidades.
     *
     * `divergent` só nasce de evidência POSITIVA de outro assunto. Nesta fase
     * a única disponível é a contradição de intenção/formato que a própria
     * consulta expõe: consulta informacional devolvendo ficha de produto. Sem
     * ela, o não-saber responde `unknown` e a página segue para a extração —
     * onde o texto resolve a dúvida que o título não resolvia.
     */
    candidato.intentCompatibility = compatibilidadeDeIntencao(candidato.formats, intencoes);
    candidato.entityCompatibility = radarSemanticEntityReading({
      text: alvo,
      scope: escopoSemantico,
      queryText: candidato.appearedInQueries.map(id => textoDaConsulta.get(id) || "").join(" "),
      divergenceEvidence: candidato.intentCompatibility === "divergent",
    });

    const recorrente = candidato.queryCount > 1;
    const naPrincipal = candidato.principalRank !== null;
    const soReforco = candidato.rolesSeen.length === 1 && candidato.rolesSeen[0] === "reforco_narrativo";
    /*
     * A SECUNDÁRIA TAMBÉM DESCOBRE CONCORRENTE.
     *
     * A regra antiga promovia a concorrente editorial quem estava na principal
     * ou recorria entre consultas. Uma página editorial que só a secundária
     * encontrou, aparecendo uma vez, virava `NOT_RELEVANT` — justamente o
     * resultado que a pesquisa multi-query existe para trazer.
     *
     * A promoção passa a olhar o PAPEL de quem descobriu. Secundária é decisão
     * editorial do Arquiteto, não busca lateral: o que ela traz disputa o mesmo
     * território, desde que o formato e a intenção conversem com o artigo.
     *
     * "Compatível" aqui é a ausência de sinal contrário: nem intenção
     * divergente nem entidade divergente. `unknown` NÃO é sinal contrário — é
     * falta de informação, e excluir por falta de informação é o erro que faz
     * a página nunca ser extraída e a dúvida nunca ser resolvida.
     */
    const daSecundaria = candidato.rolesSeen.includes("secundaria");
    const semSinalContrario = candidato.intentCompatibility !== "divergent" && radarEntityReadingAllows(candidato.entityCompatibility);
    const vindaDeSecundariaCompativel = daSecundaria && semSinalContrario;
    const pareceProduto = PRODUTO.test(alvo) || MARKETPLACE.test(candidato.domain) || candidato.formats.some(item => /product|marketplace/.test(item));
    const pareceFormato = FORMATO.test(candidato.domain) || candidato.formats.some(item => /video|social/.test(item));
    const pareceAutoridade = AUTORIDADE.test(candidato.domain);
    const pareceFeature = candidato.formats.some(item => FEATURE.test(item));

    /*
     * A ordem importa. Formato e feature descrevem o CONTINENTE do resultado;
     * produto e autoridade descrevem a NATUREZA da página; recorrência descreve
     * a FORÇA. Um concorrente comercial recorrente não deixa de ser comercial
     * por aparecer três vezes — mas deixa de ser lateral.
     */
    if (pareceFeature) {
      candidato.classification = "SERP_FEATURE";
      candidato.candidateReason = "Elemento da própria SERP, não uma página concorrente.";
    } else if (pareceFormato) {
      candidato.classification = "FORMAT_REFERENCE";
      candidato.candidateReason = `Vídeo ou rede social (${candidato.domain}): referência de formato, fora do benchmark editorial.`;
    } else if (pareceAutoridade) {
      candidato.classification = "AUTHORITY_SOURCE";
      candidato.candidateReason = `Domínio de autoridade (${candidato.domain}): candidato a fonte externa, não a concorrente.`;
    } else if (pareceProduto && recorrente) {
      candidato.classification = "COMMERCIAL_COMPETITOR";
      candidato.candidateReason = `Página comercial recorrente em ${candidato.queryCount} consulta(s): disputa a intenção, sem ser benchmark editorial.`;
    } else if (pareceProduto) {
      candidato.classification = "PRODUCT_REFERENCE";
      candidato.candidateReason = "Ficha ou vitrine de produto observada em uma consulta: evidência de intenção comercial.";
    } else if (soReforco) {
      candidato.classification = "LATERAL_REFERENCE";
      candidato.candidateReason = "Aparece somente em consulta de reforço narrativo: referência lateral do tema.";
    } else if (naPrincipal || recorrente || vindaDeSecundariaCompativel) {
      candidato.classification = "EDITORIAL_COMPETITOR";
      candidato.candidateReason = recorrente
        ? `Recorrente em ${candidato.queryCount} consulta(s) da unidade editorial${naPrincipal ? `, incluindo a principal (posição ${candidato.principalRank})` : ""}.`
        : naPrincipal
          ? `Observado na consulta principal, posição ${candidato.principalRank}.`
          : `Encontrado por keyword secundária da composição (posição ${candidato.secondaryRanks[0]}), com formato e intenção compatíveis com o artigo.`;
    } else {
      candidato.classification = "NOT_RELEVANT";
      candidato.candidateReason = "Não aparece na principal nem se repete entre consultas.";
    }

    if (candidato.formationSerpSeen) {
      candidato.candidateReason += " Já havia sido observada na SERP de formação.";
    }
  }

  const candidates = [...porUrl.values()].sort((left, right) =>
    right.queryCount - left.queryCount
    || (left.principalRank ?? 999) - (right.principalRank ?? 999));

  const byClass = candidates.reduce((contagem, item) => {
    contagem[item.classification] = (contagem[item.classification] || 0) + 1;
    return contagem;
  }, {} as Record<RadarCompetitorClass, number>);

  if (input.queries.length === 1) {
    limitations.push("Uma única consulta executada: a recorrência entre keywords não pôde ser observada nesta investigação.");
  }
  if (!candidates.length) limitations.push("Nenhum resultado observado nas consultas executadas.");

  return {
    candidates,
    queriesUsed: input.queries.map(query => query.queryId),
    uniqueDomains: new Set(candidates.map(item => item.domain).filter(Boolean)).size,
    byClass,
    limitations,
  };
}

export const radarCompetitorClassLabel = (classification: RadarCompetitorClass) => ({
  EDITORIAL_COMPETITOR: "Concorrente editorial",
  COMMERCIAL_COMPETITOR: "Concorrente comercial",
  PRODUCT_REFERENCE: "Referência de produto",
  FORMAT_REFERENCE: "Referência de formato",
  AUTHORITY_SOURCE: "Fonte de autoridade",
  SERP_FEATURE: "Elemento da SERP",
  LATERAL_REFERENCE: "Referência lateral",
  NOT_RELEVANT: "Sem relevância observada",
}[classification]);
