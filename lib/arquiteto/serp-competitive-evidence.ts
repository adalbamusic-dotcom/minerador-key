/**
 * A SERP INTEIRA, TRADUZIDA EM EVIDÊNCIA COMPETITIVA.
 *
 * O `SerpResearchSnapshot` sempre carregou muito mais do que o Arquiteto lia. O
 * normalizador extrai `organic`, PAA, related e knowledge graph, e
 * `buildRadarSerpFeatureIntelligence` ainda entrega `ai_overview`, mapa de
 * perguntas, entidades, vídeos e produtos. Tudo isso atravessa
 * `normalizeArchitectSerpSnapshot` intacto — o spread preserva o objeto.
 *
 * E o Arquiteto lia UM número: `sharedUrls`. Nem uma referência a
 * `serpFeatures` existia em `lib/arquiteto/` ou `modules/arquiteto/`.
 *
 * Este módulo é a tradução que faltava. Ele não decide nada e não coleta nada:
 * pega o que já está gravado e devolve no formato que a eleição do Silo e o
 * agrupamento sabem comparar.
 *
 * Por que isto importa para o produto: a doutrina põe a SERP acima da lógica e
 * da IA. Um agrupamento que só vê token é coocorrência léxica, não LSI; e o
 * BERT lê contexto, que é justamente o que mora nos blocos ignorados.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import { MIN_LENSES_FOR_DIVERGENCE_CREDIT, lensDatesSpreadDays as lensDatesSpreadDaysOf, lensDivergenceOf, type SerpCompetitiveObservation } from "./silo-primary-keyword.ts";
import { SERP_LENS_DATES_DIVERGE_DAYS } from "./serp-lens-plan.ts";
import { serpCacheLensLabel, type SerpCacheLens, type SerpCacheObservation } from "../editorial/serp-cache.ts";

/** O recorte do snapshot que interessa aqui. Estrutural, não o tipo inteiro. */
export type SerpSnapshotLike = {
  keywordId: string;
  device?: string | null;
  operatingSystem?: string | null;
  organicResults?: readonly { domain?: string | null }[];
  peopleAlsoAsk?: readonly { question?: string | null }[];
  relatedSearches?: readonly { term?: string | null }[];
  diagnostic?: { rawItemTypeCounts?: Record<string, number> | null } | null;
  serpFeatures?: {
    itemTypes?: readonly string[];
    questionMap?: readonly { question?: string | null }[];
    commercialSignals?: { present?: boolean } | null;
    aiOverview?: { present?: boolean; references?: readonly { domain?: string | null }[] } | null;
  } | null;
};

const texto = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const unico = (values: readonly string[]) => [...new Set(values.filter(Boolean))];

/**
 * O MESMO CONCORRENTE NÃO PODE CONTAR DUAS VEZES.
 *
 * Medido no provider em 2026-09-20: a mesma SERP devolveu `sephora.com.br` no
 * bloco orgânico e `www.sephora.com.br` nas citações do AI Overview. Sem
 * normalizar, o mesmo concorrente vira dois domínios — o universo parece maior
 * do que é e a sobreposição entre keywords parece menor do que é, que é
 * exatamente o erro que faz um grupo legítimo ser recusado por "pouca
 * sobreposição".
 */
const dominio = (value: unknown) => texto(value).toLowerCase().replace(/^www\./, "");

/** A mesma regra, para quem monta observação fora daqui (o cache de SERP). */
export const normalizeCompetitorDomain = dominio;

/**
 * A LENTE da observação: dispositivo + sistema.
 *
 * É ela que permite dizer "esta keyword se sustenta em 3 de 4 lentes". Sem
 * sistema declarado a lente é só o dispositivo — e isso é dito, não preenchido
 * com um padrão que fingiria uma coleta que não houve.
 */
export function serpLensOf(snapshot: Pick<SerpSnapshotLike, "device" | "operatingSystem">): string {
  const device = texto(snapshot.device) || "desconhecido";
  const os = texto(snapshot.operatingSystem);
  return os ? `${device}-${os}` : device;
}

/**
 * Traduz um snapshot em observação competitiva.
 *
 * Os domínios do AI Overview entram junto com os do orgânico: quando o Google
 * cita uma fonte na resposta que ele mesmo escreveu, aquele domínio está
 * disputando o universo — às vezes mais do que o quarto resultado azul.
 */
export function observationFromSnapshot(snapshot: SerpSnapshotLike): SerpCompetitiveObservation {
  const organicos = (snapshot.organicResults || []).map(item => dominio(item.domain));
  const citados = (snapshot.serpFeatures?.aiOverview?.references || []).map(item => dominio(item.domain));

  const perguntasPaa = (snapshot.peopleAlsoAsk || []).map(item => texto(item.question));
  const perguntasFeature = (snapshot.serpFeatures?.questionMap || []).map(item => texto(item.question));

  const tiposDeclarados = snapshot.serpFeatures?.itemTypes || [];
  const tiposContados = Object.keys(snapshot.diagnostic?.rawItemTypeCounts || {});

  return {
    keywordId: snapshot.keywordId,
    lens: serpLensOf(snapshot),
    competitorDomains: unico([...organicos, ...citados]),
    organicCount: organicos.filter(Boolean).length,
    itemTypes: unico([...tiposDeclarados, ...tiposContados]),
    questions: unico([...perguntasPaa, ...perguntasFeature]),
    commercialSignals: Boolean(snapshot.serpFeatures?.commercialSignals?.present),
  };
}

/**
 * A observação competitiva a partir da observação COMPACTA do cache (~1 KB).
 *
 * É o que a SERP por keyword devolve para cada keyword × lente. O `keywordId`
 * é o do PEDIDO, não o gravado na entrada: a mesma consulta pode ter sido paga
 * pelo Minerador, e o que a tela cruza é o id que ela mandou. A lente é a que
 * foi ENVIADA ao provider.
 *
 * `aiOverviewDomains` e `relatedSearches` vêm da observação do cache, que já
 * os tinha — antes eram descartados aqui. Os citados pela IA ficam só na lista
 * própria; `competitorDomains` não os recebe de novo.
 */
export function competitiveObservationFromCache(keywordId: string, lens: SerpCacheLens, observation: SerpCacheObservation, collectedAt?: string | null): SerpCompetitiveObservation {
  return {
    keywordId,
    lens: serpCacheLensLabel(lens),
    competitorDomains: [...observation.competitorDomains],
    organicCount: observation.organicCount,
    itemTypes: [...observation.itemTypes],
    questions: [...observation.questions],
    commercialSignals: observation.commercialSignals,
    aiOverviewDomains: unico(observation.aiOverviewDomains.map(dominio)),
    relatedSearches: unico(observation.relatedSearches.map(texto)),
    // Quando a lente foi observada: é o que marca lentes de datas diferentes.
    ...(collectedAt ? { collectedAt } : {}),
  };
}

/* ------------------------- a afinidade entre duas ------------------------- */

export type KeywordAffinity = {
  leftKeywordId: string;
  rightKeywordId: string;
  /** Domínios do universo que as duas dividem. */
  sharedDomains: number;
  /** Perguntas do PAA que aparecem nas duas. */
  sharedQuestions: number;
  /** Elas recebem os mesmos blocos do Google? */
  sharedFormats: number;
  /** Em quantas lentes a sobreposição se repete. */
  lensesAgreeing: number;
  /** Em quantas lentes as DUAS foram observadas — só nelas a concordância é medida. */
  lensesCompared: number;
  /**
   * Quanto as lentes discordam entre si sobre este par.
   *
   * 0 = todas devolvem o mesmo universo; 1 = nenhuma devolve o que a outra
   * devolveu. Alta divergência não invalida o par: diz que a busca muda de
   * contexto entre dispositivos, e isso é informação editorial.
   */
  lensDivergence: number;
  /**
   * Maior diferença de datas entre as lentes de uma mesma keyword do par (0
   * sem datas). Acima de 7 dias a divergência não conta em dobro.
   */
  lensDatesSpreadDays?: number;
  score: number;
  /** A SERP sustenta juntá-las no mesmo artigo? */
  supportsGrouping: boolean;
  reason: string;
};

export type AffinityThresholds = {
  minSharedDomains: number;
  minLensesAgreeing: number;
  /** Acima disto as lentes são universos distintos, não repetições. */
  minLensDivergenceToCount: number;
  /**
   * Lentes em que as duas foram observadas, no mínimo, para a divergência
   * contar em dobro. Ausente = `MIN_LENSES_FOR_DIVERGENCE_CREDIT` (3).
   */
  minLensesForDivergenceCredit?: number;
};

/**
 * Limiares da afinidade, visíveis e ajustáveis.
 *
 * O produto foi explícito: nada de agrupamento fraco. Dois domínios em comum
 * em duas lentes é o piso — abaixo disso a coincidência pode ser acaso de uma
 * SERP, e juntar por acaso é o que produz artigo sem força.
 */
export const DEFAULT_AFFINITY: AffinityThresholds = {
  minSharedDomains: 2,
  minLensesAgreeing: 2,
  minLensDivergenceToCount: 0.5,
};

const intersecao = (left: readonly string[], right: readonly string[]) => {
  const direita = new Set(right);
  return left.filter(item => direita.has(item));
};

/**
 * Mede se a SERP sustenta juntar duas keywords no mesmo artigo.
 *
 * O léxico continua existindo e continua valendo — o que muda é que ele deixa
 * de decidir sozinho. Aqui a pergunta é outra: o Google devolve o mesmo
 * universo para as duas? Se devolve, elas respondem à mesma busca e disputam a
 * mesma página. Se não devolve, o token em comum era só token.
 */
export function measureKeywordAffinity(input: {
  left: readonly SerpCompetitiveObservation[];
  right: readonly SerpCompetitiveObservation[];
  thresholds?: AffinityThresholds;
}): KeywordAffinity {
  const limiares = input.thresholds || DEFAULT_AFFINITY;
  const leftKeywordId = input.left[0]?.keywordId || "";
  const rightKeywordId = input.right[0]?.keywordId || "";

  const dominiosEsquerda = unico(input.left.flatMap(item => [...item.competitorDomains]));
  const dominiosDireita = unico(input.right.flatMap(item => [...item.competitorDomains]));
  const sharedDomains = intersecao(dominiosEsquerda, dominiosDireita).length;

  const sharedQuestions = intersecao(
    unico(input.left.flatMap(item => [...item.questions])),
    unico(input.right.flatMap(item => [...item.questions])),
  ).length;

  const sharedFormats = intersecao(
    unico(input.left.flatMap(item => [...item.itemTypes])),
    unico(input.right.flatMap(item => [...item.itemTypes])),
  ).length;

  /*
   * Concordância por LENTE: a sobreposição precisa se repetir no mesmo
   * dispositivo dos dois lados. Somar lentes diferentes deixaria uma keyword
   * forte no desktop parecer afim de outra forte no mobile.
   */
  const porLenteDireita = new Map(input.right.map(item => [item.lens, item]));
  const lensesAgreeing = input.left.filter(esquerda => {
    const direita = porLenteDireita.get(esquerda.lens);
    return direita ? intersecao([...esquerda.competitorDomains], [...direita.competitorDomains]).length > 0 : false;
  }).length;
  const lensesCompared = unico(input.left.map(item => item.lens)).filter(lens => porLenteDireita.has(lens)).length;

  /*
   * A DIVERGÊNCIA DAS LENTES, sobre o par inteiro.
   *
   * Quando o Google entrega universos diferentes por dispositivo, exigir que a
   * sobreposição se repita em duas lentes reprovaria justamente as buscas mais
   * sensíveis a contexto — e partiria em quatro um universo que é um só. Acima
   * do limiar, sustentar-se numa lente divergente conta como a evidência que é.
   *
   * Mas só com lentes bastantes: com 2 lentes comparáveis, a dobra fazia UMA
   * lente concordante atingir o mínimo de duas sozinha.
   */
  const lensDivergence = lensDivergenceOf([...input.left, ...input.right]);
  const lentesParaDobra = limiares.minLensesForDivergenceCredit ?? MIN_LENSES_FOR_DIVERGENCE_CREDIT;
  const divergenciaAlta = lensDivergence >= limiares.minLensDivergenceToCount;
  /*
   * E só com lentes da MESMA época: mais de 7 dias entre as lentes de uma
   * keyword e a divergência pode ser só o tempo, não o dispositivo.
   */
  const lensDatesSpreadDays = lensDatesSpreadDaysOf([...input.left, ...input.right]);
  const datasDivergem = lensDatesSpreadDays > SERP_LENS_DATES_DIVERGE_DAYS;
  const creditoDaDivergencia = divergenciaAlta && lensesCompared >= lentesParaDobra && !datasDivergem;
  const efetivaPorLente = creditoDaDivergencia
    ? lensesAgreeing * 2
    : lensesAgreeing;

  const supportsGrouping = sharedDomains >= limiares.minSharedDomains
    && efetivaPorLente >= limiares.minLensesAgreeing;

  return {
    leftKeywordId, rightKeywordId, sharedDomains, sharedQuestions, sharedFormats, lensesAgreeing, lensesCompared, lensDivergence,
    lensDatesSpreadDays,
    score: sharedDomains * 3 + sharedQuestions * 2 + sharedFormats,
    supportsGrouping,
    reason: `${supportsGrouping
      ? creditoDaDivergencia
        ? `A SERP devolve ${sharedDomains} domínio(s) em comum e as duas se mantêm juntas em ${lensesAgreeing} lente(s) mesmo com o universo mudando entre dispositivos (divergência ${lensDivergence.toFixed(2)}).`
        : `A SERP devolve ${sharedDomains} domínio(s) em comum em ${lensesAgreeing} lente(s): as duas disputam o mesmo universo.`
      : sharedDomains < limiares.minSharedDomains
        ? `Só ${sharedDomains} domínio(s) em comum; o mínimo para sustentar o agrupamento é ${limiares.minSharedDomains}.`
        : divergenciaAlta && !creditoDaDivergencia && !datasDivergem
          ? `A sobreposição aparece em ${lensesAgreeing} lente(s); o mínimo é ${limiares.minLensesAgreeing}. O universo muda entre dispositivos (divergência ${lensDivergence.toFixed(2)}), mas com ${lensesCompared} lente(s) comparável(is) a divergência não conta em dobro: o mínimo é ${lentesParaDobra}.`
          : `A sobreposição aparece em ${lensesAgreeing} lente(s); o mínimo é ${limiares.minLensesAgreeing}.`}${datasDivergem
      ? ` Lentes de datas diferentes (${lensDatesSpreadDays} dias entre as lentes da mesma keyword): a divergência entre elas pode ser só o tempo e não conta em dobro.`
      : ""}`,
  };
}

/**
 * A cobertura que o universo exige, segundo o próprio Google.
 *
 * Perguntas do PAA e blocos entregues, agregados. Não é sugestão de pauta: é o
 * que a SERP mostra que as pessoas perguntam sobre este universo, e serve para
 * dizer se o Silo cobre o assunto ou deixa buraco.
 */
export function aggregateUniverseCoverage(observations: readonly SerpCompetitiveObservation[]) {
  const questions = unico(observations.flatMap(item => [...item.questions]));
  const formats = unico(observations.flatMap(item => [...item.itemTypes]));

  /*
   * OS FORMATOS POR LENTE — a diferença entre dispositivos que realmente
   * aparece no dado.
   *
   * Medido no provider em 2026-09-20: em "clinica de estetica perto de mim" os
   * quatro universos de domínios eram quase o mesmo (divergência 0,17), mas o
   * desktop entregou `people_also_ask` e `google_reviews` enquanto o mobile
   * entregou `people_also_search` e NENHUMA pergunta. Quem vai escrever a
   * página precisa saber disso: é a diferença entre prever FAQ e prever vídeo.
   */
  const formatsByLens = [...new Set(observations.map(item => item.lens))].map(lens => ({
    lens,
    formats: unico(observations.filter(item => item.lens === lens).flatMap(item => [...item.itemTypes])),
  }));
  const exclusivosPorLente = formatsByLens
    .map(entry => ({
      lens: entry.lens,
      only: entry.formats.filter(format => formatsByLens.every(outra => outra.lens === entry.lens || !outra.formats.includes(format))),
    }))
    .filter(entry => entry.only.length);

  return {
    questions,
    formats,
    formatsByLens,
    /** O que só aparece em uma lente. Vazio = todas entregam o mesmo. */
    formatsExclusiveToLens: exclusivosPorLente,
    commercial: observations.some(item => item.commercialSignals),
    lenses: unico(observations.map(item => item.lens)),
    summary: questions.length
      ? `${questions.length} pergunta(s) do universo observadas em ${unico(observations.map(item => item.lens)).length} lente(s).`
      : "A SERP não devolveu perguntas para este universo.",
  };
}
