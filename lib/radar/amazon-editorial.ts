/**
 * ===== O BLUEPRINT COMPETITIVO DA AMAZON — AMAZON_SEARCH_2 =====
 *
 * ============ O QUE A PESQUISA MOSTRA / O QUE RECOMENDAMOS ============
 *
 * A mesma linguagem do Google e do YouTube, sobre outra evidência. Quem opera
 * reconhece a ferramenta; o que muda é o que se lê, não como se lê.
 *
 * ================ A REGRA QUE GOVERNA ESTE MÓDULO INTEIRO ================
 *
 * A SERP de produtos entrega POSIÇÃO, PREÇO, NOTA, VOLUME DE VOTOS, SELO e
 * TEXTO DE OFERTA. Ela não entrega review, atributo, benefício, marca canônica
 * nem categoria da loja.
 *
 * Tudo aqui nasce de um desses campos ou do apoio do Google — e carrega o sinal
 * que o originou. Uma recomendação sem `sourceSignal` é palpite, e palpite
 * chegando ao Planejador com o peso de uma contagem de SERP é exatamente o que
 * o contrato existe para impedir.
 *
 * ================ NOTA NÃO É QUALIDADE. SELO NÃO É ENDOSSO. ================
 *
 * 4,7 estrelas descreve como compradores avaliaram, não como o produto é.
 * "Amazon's Choice" descreve uma decisão comercial da loja. Ordenar
 * "1º melhor, 2º melhor" a partir disso seria transformar reputação e
 * visibilidade em veredito de qualidade — e o artigo passaria a afirmar o que a
 * coleta nunca mediu. Por isso a saída agrupa e nunca ordena.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import {
  RadarCompetitiveBlueprintSchema,
  RadarComparisonAxisSchema,
  RadarEditorialOutputPlanSchema,
  RadarObservedPriceSchema,
  RadarSectionDirectionSchema,
  RadarTitleDirectionSchema,
  recomendacao,
  sinalObservado,
  type RadarAmazonBlueprint,
  type RadarAmazonComparisonAxis,
  type RadarAmazonEnrichmentGap,
  type RadarBlueprintRecommendation,
  type RadarComparisonAxis,
  type RadarEditorialOutputPlan,
  type RadarObservedPrice,
  type RadarObservedSignal,
  type RadarResearchRef,
  type RadarSectionDirection,
  type RadarTitleDirection,
} from "./competitive-blueprint.ts";
import { radarAmazonUniverseCounts, type RadarAmazonUniverseEntry } from "./amazon-search-model.ts";
import type { RadarAmazonSearchRun } from "./amazon-search-run.ts";
import type { RadarAmazonGoogleSupport } from "./amazon-google-support.ts";

/* ============================ as limitações — §21 ============================ */

/**
 * AS TRÊS FRASES QUE ESTA INVESTIGAÇÃO SEMPRE DEVE.
 *
 * Elas não são ressalva jurídica: são o contorno do que foi lido. Escondê-las
 * em proveniência técnica faria quem escreve tratar nota e selo como prova,
 * porque nada na tela diria o contrário.
 */
export const RADAR_AMAZON_BASE_LIMITATIONS = [
  "Esta investigação não analisou textos de avaliações.",
  "Esta investigação não abriu páginas individuais dos produtos.",
  "Ratings e selos são sinais comerciais e reputacionais, não prova de qualidade.",
] as const;

export const RADAR_AMAZON_SUPPORT_MISSING_LIMITATION =
  "O apoio de busca do Google não entrou nesta análise: perguntas, refinamentos e sinais de formato externos não foram considerados.";

/* ============================== utilidades ============================== */

const mediana = (valores: readonly number[]): number | null => {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
};

const dinheiro = (valor: number, moeda: string | null) =>
  `${moeda ? `${moeda} ` : ""}${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const numero = (valor: number) => valor.toLocaleString("pt-BR");

/* ========================= §7 · as faixas de preço ========================= */

/**
 * AS BANDAS SAEM DA AMOSTRA, NÃO DE CORTES UNIVERSAIS.
 *
 * "Até R$ 50 é econômico" seria verdade em protetor solar e absurdo em
 * eletrodoméstico. O tercil descreve ESTA prateleira, e o método viaja junto
 * para quem lê saber o que o rótulo significa — e poder discordar dele.
 *
 * Com menos de três preços não há tercil que signifique alguma coisa: a função
 * devolve vazio em vez de inventar três faixas sobre dois números.
 */
export function buildRadarAmazonPriceBands(input: {
  universe: readonly RadarAmazonUniverseEntry[];
  observedAt: string;
}): RadarObservedPrice[] {
  const precos = input.universe
    .map(item => item.priceFrom)
    .filter((valor): valor is number => valor !== null)
    .sort((a, b) => a - b);

  if (precos.length < 3) return [];

  const moeda = input.universe.find(item => item.currency)?.currency || "BRL";
  const corte = (fracao: number) => precos[Math.min(precos.length - 1, Math.floor(precos.length * fracao))];
  const primeiroCorte = corte(1 / 3);
  const segundoCorte = corte(2 / 3);

  const faixas: Array<{ band: "ECONOMICO" | "INTERMEDIARIO" | "PREMIUM"; valores: number[]; de: number; ate: number }> = [
    { band: "ECONOMICO", valores: precos.filter(valor => valor <= primeiroCorte), de: precos[0], ate: primeiroCorte },
    { band: "INTERMEDIARIO", valores: precos.filter(valor => valor > primeiroCorte && valor <= segundoCorte), de: primeiroCorte, ate: segundoCorte },
    { band: "PREMIUM", valores: precos.filter(valor => valor > segundoCorte), de: segundoCorte, ate: precos[precos.length - 1] },
  ];

  return faixas
    /* Uma faixa sem produto nenhum não descreve nada — e some. */
    .filter(faixa => faixa.valores.length > 0)
    .map(faixa => RadarObservedPriceSchema.parse({
      band: faixa.band,
      observedValue: mediana(faixa.valores),
      currency: moeda,
      observedAt: input.observedAt,
      source: "Universo de produtos desta coleta da Amazon.",
      sampleSize: faixa.valores.length,
      method: `Tercil da amostra de ${precos.length} preço(s) observada nesta coleta.`,
      rangeFrom: faixa.de,
      rangeTo: faixa.ate,
    }));
}

/* ============================ o observado ============================ */

type Contexto = {
  run: RadarAmazonSearchRun;
  contagem: ReturnType<typeof radarAmazonUniverseCounts>;
  posicoesPagas: number;
  moeda: string | null;
  precos: number[];
  notas: number[];
  votos: number[];
  comprados: RadarAmazonUniverseEntry[];
  entregas: number;
  bandas: RadarObservedPrice[];
  support: RadarAmazonGoogleSupport | null;
  /**
   * O FUNDAMENTO DO ARTIGO — e ele NÃO é observação da busca.
   *
   * A intenção declarada vem do ArticleDNA; a keyword principal, do plano de
   * consulta. As duas moldam o que RECOMENDAMOS e nunca entram em `observed`:
   * colocá-las lá faria a decisão do Arquiteto voltar como leitura da SERP.
   */
  declaredIntent: string | null;
  primaryKeyword: string | null;
};

function montarContexto(
  run: RadarAmazonSearchRun,
  support: RadarAmazonGoogleSupport | null,
  fundamento: { declaredIntent: string | null; primaryKeyword: string | null },
): Contexto {
  return {
    run,
    declaredIntent: fundamento.declaredIntent,
    primaryKeyword: fundamento.primaryKeyword,
    contagem: radarAmazonUniverseCounts(run.universe),
    posicoesPagas: run.universe.reduce(
      (total, item) => total + item.occurrences.filter(ocorrencia => ocorrencia.placement === "SPONSORED").length,
      0,
    ),
    moeda: run.universe.find(item => item.currency)?.currency || null,
    precos: run.universe.map(item => item.priceFrom).filter((valor): valor is number => valor !== null),
    notas: run.universe.map(item => item.ratingValue).filter((valor): valor is number => valor !== null),
    votos: run.universe.map(item => item.ratingVotes).filter((valor): valor is number => valor !== null),
    comprados: run.universe.filter(item => item.boughtPastMonth !== null),
    entregas: run.universe.filter(item => item.deliveryMessage).length,
    bandas: buildRadarAmazonPriceBands({ universe: run.universe, observedAt: run.provenance.collectedAt }),
    support,
  };
}

const sinaisDePosicao = (ctx: Contexto): RadarObservedSignal[] => {
  const sinais: RadarObservedSignal[] = [];
  if (ctx.contagem.organic) {
    sinais.push(sinalObservado(
      "amz-organico",
      `${ctx.contagem.organic} produto(s) aparecem organicamente nesta busca.`,
      `${ctx.contagem.organic} de ${ctx.contagem.total} produtos do universo.`,
      ctx.contagem.organic,
    ));
  }
  if (ctx.contagem.sponsored) {
    /*
     * PRODUTO PATROCINADO E POSIÇÃO PAGA SÃO DUAS CONTAGENS.
     *
     * Na amostra real, dois slots pagos são do MESMO ASIN. "2 patrocinados"
     * descreveria dois anunciantes onde há um comprando dois espaços.
     */
    sinais.push(sinalObservado(
      "amz-patrocinado",
      ctx.posicoesPagas > ctx.contagem.sponsored
        ? `${ctx.contagem.sponsored} produto(s) patrocinado(s) ocupam ${ctx.posicoesPagas} posições pagas.`
        : `${ctx.contagem.sponsored} produto(s) patrocinado(s).`,
      `${ctx.posicoesPagas} ocorrência(s) paga(s) sobre ${ctx.contagem.sponsored} produto(s) distinto(s).`,
      ctx.contagem.sponsored,
    ));
  }
  if (ctx.contagem.both) {
    sinais.push(sinalObservado(
      "amz-ambos",
      `${ctx.contagem.both} produto(s) aparecem organicamente e também compram espaço na mesma busca.`,
      "Presença simultânea em resultado orgânico e anúncio.",
      ctx.contagem.both,
    ));
  }
  return sinais;
};

const sinaisDePreco = (ctx: Contexto): RadarObservedSignal[] => {
  if (!ctx.precos.length) return [];
  const menor = Math.min(...ctx.precos);
  const maior = Math.max(...ctx.precos);
  const meio = mediana(ctx.precos);

  const sinais = [sinalObservado(
    "amz-preco-faixa",
    `Os preços exibidos vão de ${dinheiro(menor, ctx.moeda)} a ${dinheiro(maior, ctx.moeda)}.`,
    `${ctx.precos.length} de ${ctx.contagem.total} produto(s) exibem preço na listagem.`,
    ctx.precos.length,
  )];

  if (meio !== null) {
    sinais.push(sinalObservado(
      "amz-preco-mediana",
      `A mediana de preço da amostra é ${dinheiro(meio, ctx.moeda)}.`,
      `Mediana de ${ctx.precos.length} preço(s) observado(s).`,
      null,
    ));
  }
  return sinais;
};

const sinaisDeReputacao = (ctx: Contexto): RadarObservedSignal[] => {
  const sinais: RadarObservedSignal[] = [];
  const notaMediana = mediana(ctx.notas);
  const votosMedianos = mediana(ctx.votos);

  if (notaMediana !== null) {
    sinais.push(sinalObservado(
      "amz-nota",
      `A nota mediana dos produtos avaliados é ${notaMediana.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}.`,
      `${ctx.notas.length} de ${ctx.contagem.total} produto(s) têm avaliação.`,
      ctx.notas.length,
    ));
  }
  if (votosMedianos !== null) {
    sinais.push(sinalObservado(
      "amz-votos",
      `A mediana é de ${numero(Math.round(votosMedianos))} avaliação(ões) por produto.`,
      `Volume de votos em ${ctx.votos.length} produto(s).`,
      ctx.votos.length,
    ));
  }
  return sinais;
};

const sinaisDeCompra = (ctx: Contexto): RadarObservedSignal[] => {
  const sinais: RadarObservedSignal[] = [];
  if (ctx.contagem.amazonChoice) {
    sinais.push(sinalObservado(
      "amz-choice",
      `${ctx.contagem.amazonChoice} produto(s) exibem o selo Amazon's Choice.`,
      "Selo atribuído pela loja, visível na listagem.",
      ctx.contagem.amazonChoice,
    ));
  }
  if (ctx.contagem.bestSeller) {
    sinais.push(sinalObservado(
      "amz-bestseller",
      `${ctx.contagem.bestSeller} produto(s) exibem o selo Mais Vendido.`,
      "Selo atribuído pela loja, visível na listagem.",
      ctx.contagem.bestSeller,
    ));
  }
  if (ctx.comprados.length) {
    const maior = Math.max(...ctx.comprados.map(item => item.boughtPastMonth as number));
    sinais.push(sinalObservado(
      "amz-compras",
      `${ctx.comprados.length} produto(s) declaram compras no último mês; o maior declara ${numero(maior)}.`,
      "Contador de compras exibido pela loja na listagem.",
      ctx.comprados.length,
    ));
  }
  return sinais;
};

const sinaisDeOferta = (ctx: Contexto): RadarObservedSignal[] => {
  const textos = [...new Set(ctx.run.universe.flatMap(item => item.offerText))];
  const sinais: RadarObservedSignal[] = [];

  if (textos.length) {
    sinais.push(sinalObservado(
      "amz-oferta",
      `A listagem exibe ${textos.length} texto(s) de oferta distinto(s).`,
      textos.slice(0, 4).join(" · "),
      textos.length,
    ));
  }
  if (ctx.entregas) {
    sinais.push(sinalObservado(
      "amz-entrega",
      `${ctx.entregas} produto(s) anunciam prazo ou condição de entrega.`,
      "Mensagem de entrega exibida na listagem.",
      ctx.entregas,
    ));
  }
  return sinais;
};

const sinaisDeBuscaRelacionada = (ctx: Contexto): RadarObservedSignal[] =>
  /*
   * §19 · BUSCA RELACIONADA NÃO É CATEGORIA.
   *
   * O provider devolve termos de busca. Chamá-los de categoria afirmaria uma
   * taxonomia da loja que ninguém coletou — e um artigo escrito sobre isso
   * descreveria uma estrutura de catálogo inexistente.
   */
  ctx.run.relatedSearches.slice(0, 12).map((item, indice) => sinalObservado(
    `amz-relacionada-${indice + 1}`,
    `A busca relacionada "${item.term}" acompanha esta consulta.`,
    "Bloco de buscas relacionadas da própria loja.",
    null,
  ));

const sinaisDoGoogle = (ctx: Contexto): RadarObservedSignal[] => {
  const apoio = ctx.support;
  if (!apoio) return [];
  const sinais: RadarObservedSignal[] = [];

  for (const [indice, pergunta] of apoio.questions.slice(0, 8).entries()) {
    sinais.push(sinalObservado(
      `goo-pergunta-${indice + 1}`,
      `A busca do Google pergunta: "${pergunta}".`,
      "Bloco de perguntas da SERP do Google para a mesma intenção.",
      null,
    ));
  }
  for (const [indice, termo] of apoio.refinements.slice(0, 8).entries()) {
    sinais.push(sinalObservado(
      `goo-refinamento-${indice + 1}`,
      `A busca do Google refina para "${termo}".`,
      "Refinamento ou busca relacionada da SERP do Google.",
      null,
    ));
  }
  if (apoio.entities.length) {
    sinais.push(sinalObservado(
      "goo-entidades",
      `A SERP do Google destaca ${apoio.entities.length} termo(s) de segmentação.`,
      apoio.entities.slice(0, 6).join(" · "),
      apoio.entities.length,
    ));
  }
  if (apoio.popularProducts.length) {
    sinais.push(sinalObservado(
      "goo-produtos",
      `A SERP do Google exibe ${apoio.popularProducts.length} produto(s) populares para esta intenção.`,
      "Bloco comercial da SERP do Google — sinal de intenção de compra externa.",
      apoio.popularProducts.length,
    ));
  }
  if (apoio.comparisonTerms.length) {
    sinais.push(sinalObservado(
      "goo-comparacao",
      `${apoio.comparisonTerms.length} termo(s) da busca do Google comparam explicitamente.`,
      apoio.comparisonTerms.slice(0, 4).join(" · "),
      apoio.comparisonTerms.length,
    ));
  }
  if (apoio.multimedia.videos || apoio.multimedia.shorts || apoio.multimedia.images) {
    sinais.push(sinalObservado(
      "goo-multimidia",
      `A SERP do Google responde com ${apoio.multimedia.videos} vídeo(s), ${apoio.multimedia.shorts} Short(s) e ${apoio.multimedia.images} imagem(ns).`,
      "Blocos multimídia presentes na SERP do Google.",
      null,
    ));
  }
  return sinais;
};

/**
 * A SUFICIÊNCIA DA AMOSTRA, dita em português.
 *
 * Um número sozinho não diz se dá para concluir. A frase diz — e diz também
 * quando NÃO dá, que é a informação que evita um comparativo montado sobre
 * quatro produtos.
 */
const suficiencia = (ctx: Contexto): string => {
  if (ctx.contagem.total === 0) return "A coleta não devolveu produtos: não há amostra competitiva para concluir.";
  if (ctx.contagem.total < 8) {
    return `Amostra pequena: ${ctx.contagem.total} produto(s). Serve para descrever a prateleira, não para generalizar a categoria.`;
  }
  const comPreco = ctx.precos.length;
  const comNota = ctx.notas.length;
  return `Amostra de ${ctx.contagem.total} produto(s), ${comPreco} com preço e ${comNota} com avaliação — suficiente para faixas e agrupamentos, não para julgar produto individual.`;
};

/* ============================ o recomendado ============================ */

/** §15 · cada eixo só existe se o campo que o sustenta veio na coleta. */
function eixosDeComparacao(ctx: Contexto): RadarComparisonAxis[] {
  const eixos: Array<{ axis: RadarAmazonComparisonAxis; label: string; objective: string; sourceSignal: string; caveat: string | null }> = [];

  if (ctx.bandas.length >= 2) {
    eixos.push({
      axis: "PRICE_BAND",
      label: "Faixa de preço",
      objective: "Situar cada opção na prateleira sem prometer um valor que a loja muda amanhã.",
      sourceSignal: "amz-preco-faixa",
      caveat: "O preço observado vale para o instante da coleta.",
    });
  }
  if (ctx.notas.length >= 3) {
    eixos.push({
      axis: "RATING",
      label: "Nota de avaliação",
      objective: "Mostrar como compradores avaliaram cada opção.",
      sourceSignal: "amz-nota",
      caveat: "Nota é reputação declarada por compradores, não medida de qualidade.",
    });
  }
  if (ctx.votos.length >= 3) {
    eixos.push({
      axis: "REVIEW_VOLUME",
      label: "Volume de avaliações",
      objective: "Distinguir opção madura de opção recém-listada.",
      sourceSignal: "amz-votos",
      caveat: "Volume descreve maturidade do produto na loja, não desempenho.",
    });
  }
  if (ctx.contagem.sponsored || ctx.contagem.both) {
    eixos.push({
      axis: "VISIBILITY",
      label: "Visibilidade na busca",
      objective: "Registrar quem disputa atenção organicamente e quem compra espaço.",
      sourceSignal: ctx.contagem.both ? "amz-ambos" : "amz-patrocinado",
      caveat: "Visibilidade paga é investimento do vendedor, não atributo do produto.",
    });
  }
  if (ctx.contagem.amazonChoice) {
    eixos.push({
      axis: "AMAZON_CHOICE",
      label: "Selo Amazon's Choice",
      objective: "Registrar a escolha destacada pela própria loja.",
      sourceSignal: "amz-choice",
      caveat: "O selo é uma decisão comercial da loja, não um veredito independente.",
    });
  }
  if (ctx.contagem.bestSeller) {
    eixos.push({
      axis: "BEST_SELLER",
      label: "Selo Mais Vendido",
      objective: "Registrar o que a loja aponta como mais vendido.",
      sourceSignal: "amz-bestseller",
      caveat: "Volume de venda não indica adequação ao leitor deste artigo.",
    });
  }
  if (ctx.comprados.length >= 2) {
    eixos.push({
      axis: "PURCHASE_VOLUME_SIGNAL",
      label: "Compras declaradas no último mês",
      objective: "Mostrar demanda recente, como a loja a declara.",
      sourceSignal: "amz-compras",
      caveat: "O contador é declarado pela loja e não é auditável por nós.",
    });
  }
  if (ctx.entregas >= 3) {
    eixos.push({
      axis: "DELIVERY_SIGNAL",
      label: "Condição de entrega",
      objective: "Comparar prazo e condição, que mudam a decisão de compra.",
      sourceSignal: "amz-entrega",
      caveat: "A condição varia por região e por período.",
    });
  }
  /*
   * §15 · A ÚNICA PORTA PARA CRITÉRIO EXTERNO — e ela exige o Google.
   *
   * Sem apoio, nenhum critério de fora entra. É isto que impede "hidratação"
   * de reaparecer como eixo numa investigação que nunca abriu um PDP.
   */
  if (ctx.support?.comparisonTerms.length) {
    eixos.push({
      axis: "GOOGLE_SUPPORT_CRITERION",
      label: `Critério que a busca do Google compara: ${ctx.support.comparisonTerms[0]}`,
      objective: "Trazer para a tabela o recorte que quem pesquisa já compara fora da loja.",
      sourceSignal: "goo-comparacao",
      caveat: "O critério vem da formulação de busca, não de atributo de produto.",
    });
  }

  return eixos.map(eixo => RadarComparisonAxisSchema.parse(eixo));
}

/** §11 · uma saída editorial só nasce de sinal. */
function saidasRecomendadas(ctx: Contexto, eixos: RadarComparisonAxis[]): RadarEditorialOutputPlan[] {
  const saidas: RadarEditorialOutputPlan[] = [];
  const apoio = ctx.support;

  if (ctx.contagem.total >= 8 && eixos.length >= 2) {
    saidas.push({
      output: "COMPARISON",
      objective: "Ajudar a escolher entre opções reais da prateleira.",
      reason: `A busca devolve ${ctx.contagem.total} produtos distintos e ${eixos.length} eixos sustentados por campos coletados.`,
      sourceSignals: eixos.slice(0, 3).map(eixo => eixo.sourceSignal),
    });
  }
  if (ctx.bandas.length >= 2) {
    saidas.push({
      output: "BUYING_GUIDE",
      objective: "Explicar como escolher antes de mostrar o que escolher.",
      reason: `Os preços observados se distribuem em ${ctx.bandas.length} faixas distintas.`,
      sourceSignals: ["amz-preco-faixa"],
    });
  }
  if (apoio?.formats.hasProducts || ctx.contagem.sponsored > 0) {
    saidas.push({
      output: "COMMERCIAL_ARTICLE",
      objective: "Atender a intenção de compra que a busca demonstra.",
      reason: apoio?.formats.hasProducts
        ? "A SERP do Google exibe bloco comercial para a mesma intenção."
        : "Há investimento em anúncio dentro da própria busca da loja.",
      sourceSignals: [apoio?.formats.hasProducts ? "goo-produtos" : "amz-patrocinado"],
    });
  }
  /*
   * §20 · VÍDEO SÓ QUANDO O GOOGLE O SUSTENTA.
   *
   * Recomendar "vídeo hero" por padrão produziria a mesma peça para toda
   * categoria — e custaria uma produção que nenhum sinal pediu.
   */
  if (apoio?.formats.hasVideo || apoio?.formats.hasShortVideos) {
    saidas.push({
      output: "ARTICLE_WITH_VIDEO",
      objective: "Responder no formato que a busca externa já trata como resposta.",
      reason: `A SERP do Google devolve ${apoio.multimedia.videos} vídeo(s) e ${apoio.multimedia.shorts} Short(s) para esta intenção.`,
      sourceSignals: ["goo-multimidia"],
    });
  }
  if (saidas.length >= 3 && apoio?.formats.hasVideo && apoio.formats.hasImages) {
    saidas.push({
      output: "MULTIFORMAT_PACKAGE",
      objective: "Cobrir a intenção em texto, vídeo e imagem, que é como a busca a responde.",
      reason: "A SERP do Google responde com texto, vídeo e imagem simultaneamente.",
      sourceSignals: ["goo-multimidia"],
    });
  }

  return saidas.map(saida => RadarEditorialOutputPlanSchema.parse(saida));
}

/** §13 · 2 a 4 direções, e nenhuma delas é um título de concorrente. */
function direcoesDeTitulo(ctx: Contexto, eixos: RadarComparisonAxis[]): RadarTitleDirection[] {
  const direcoes: RadarTitleDirection[] = [];

  if (ctx.bandas.length >= 2) {
    direcoes.push({
      pattern: ctx.primaryKeyword
        ? `${ctx.primaryKeyword} + recorte por faixa de preço + atualidade`
        : "intenção + recorte por faixa de preço + atualidade",
      objective: "Alcançar quem já chega com orçamento definido.",
      sourceSignals: ["amz-preco-faixa"],
    });
  }
  if (eixos.length >= 2) {
    direcoes.push({
      pattern: "comparação + critério comercial observado + intenção",
      objective: "Prometer a decisão que o artigo realmente ajuda a tomar.",
      sourceSignals: eixos.slice(0, 2).map(eixo => eixo.sourceSignal),
    });
  }
  if (ctx.support?.questions.length) {
    direcoes.push({
      pattern: "pergunta que a busca já faz + resposta direta no título",
      objective: "Casar com a formulação que o leitor digitou.",
      sourceSignals: ["goo-pergunta-1"],
    });
  }
  if (ctx.contagem.total >= 8) {
    direcoes.push({
      pattern: "quantidade de opções avaliadas + critério de recorte",
      objective: "Declarar a extensão da análise antes do clique.",
      sourceSignals: ["amz-organico"],
    });
  }

  return direcoes.slice(0, 4).map(direcao => RadarTitleDirectionSchema.parse(direcao));
}

/** §14 · a estrutura. Cada seção existe porque um sinal a sustenta. */
function estruturaDoConteudo(ctx: Contexto, eixos: RadarComparisonAxis[]): RadarSectionDirection[] {
  const secoes: Array<Omit<RadarSectionDirection, "order">> = [];

  secoes.push({
    headingDirection: "Abertura: a intenção, a promessa e o limite desta análise",
    objective: "Dizer o que o texto resolve e o que ele não alcança, antes de qualquer recomendação.",
    answersQuestion: null,
    mustCover: [
      ...(ctx.declaredIntent ? [`intenção declarada: ${ctx.declaredIntent}`] : []),
      ...(ctx.primaryKeyword ? [`busca observada: ${ctx.primaryKeyword}`] : []),
      "o que foi observado",
      "o que não foi analisado",
    ],
    /*
     * §21 · O LIMITE ENTRA NA ABERTURA, NÃO NO RODAPÉ.
     *
     * Um leitor que descobre no fim que nenhuma avaliação foi lida já tomou a
     * decisão com a informação errada.
     */
    evidenceNeeded: "Declarar que avaliações e páginas de produto não foram analisadas.",
    sourceSignal: "amz-organico",
  });

  if (eixos.length >= 2) {
    secoes.push({
      headingDirection: "Como escolher: os critérios que a busca sustenta",
      objective: "Entregar critério antes de entregar opção.",
      answersQuestion: ctx.support?.questions[0] || null,
      mustCover: eixos.map(eixo => eixo.label),
      evidenceNeeded: "Cada critério precisa citar o campo coletado que o sustenta.",
      sourceSignal: eixos[0].sourceSignal,
    });
  }

  if (ctx.bandas.length >= 2) {
    secoes.push({
      headingDirection: "Faixas de preço: como a prateleira se distribui",
      objective: "Situar o leitor na distribuição real, em faixa e não em valor fixo.",
      answersQuestion: null,
      mustCover: ctx.bandas.map(banda => banda.band),
      evidenceNeeded: "A faixa precisa declarar o método e a data da observação.",
      sourceSignal: "amz-preco-faixa",
    });
  }

  if (eixos.length >= 2 && ctx.contagem.total >= 8) {
    secoes.push({
      headingDirection: "Comparação: as opções lado a lado, sem ranking de qualidade",
      objective: "Comparar por eixos observados, agrupando em vez de ordenar.",
      answersQuestion: ctx.support?.comparisonTerms[0] || null,
      mustCover: eixos.map(eixo => eixo.label),
      evidenceNeeded: "Cada coluna precisa da ressalva do eixo ao lado do número.",
      sourceSignal: eixos[0].sourceSignal,
    });
  }

  if (ctx.notas.length >= 3) {
    secoes.push({
      headingDirection: "Reputação: o que nota e volume de avaliações dizem — e o que não dizem",
      objective: "Usar o sinal reputacional sem transformá-lo em veredito de qualidade.",
      answersQuestion: null,
      mustCover: ["nota mediana", "volume de avaliações", "o que a nota não mede"],
      evidenceNeeded: "Dizer explicitamente que nenhum texto de avaliação foi lido.",
      sourceSignal: "amz-nota",
    });
  }

  if (ctx.contagem.total >= 5) {
    secoes.push({
      headingDirection: "Opções observadas: o que aparece nesta busca e por quê",
      objective: "Mostrar presença competitiva com o motivo factual de cada citação.",
      answersQuestion: null,
      mustCover: ["posição na busca", "faixa de preço", "sinal de reputação"],
      /*
       * §17 · PRESENÇA NÃO É ENDOSSO.
       *
       * Citar um produto porque ele aparece é observação; recomendar comprá-lo
       * seria transformar ranking de loja em conselho editorial.
       */
      evidenceNeeded: "Cada produto citado precisa do motivo factual da citação, nunca de endosso.",
      sourceSignal: "amz-organico",
    });
  }

  /*
   * §14 · "PARA QUEM CADA FAIXA SERVE" só entra quando dá para dizer isso sem
   * inventar atributo — ou seja, quando há faixa E reputação para cruzar. Sem
   * os dois, a seção viraria perfil de comprador imaginado.
   */
  if (ctx.bandas.length >= 2 && ctx.notas.length >= 3) {
    secoes.push({
      headingDirection: "Para quem cada faixa serve",
      objective: "Traduzir faixa e reputação em perfil de decisão, sem atribuir característica a produto.",
      answersQuestion: null,
      mustCover: ["faixa", "reputação observada", "o que não dá para afirmar"],
      evidenceNeeded: "O recorte é editorial sobre preço e reputação — não é atributo do produto.",
      sourceSignal: "amz-preco-faixa",
    });
  }

  if (ctx.support?.questions.length) {
    secoes.push({
      headingDirection: "Dúvidas que a busca já faz",
      objective: "Fechar as perguntas que a SERP externa mostra em aberto.",
      answersQuestion: ctx.support.questions[0],
      mustCover: ctx.support.questions.slice(0, 5),
      evidenceNeeded: null,
      sourceSignal: "goo-pergunta-1",
    });
  }

  secoes.push({
    headingDirection: "Conclusão: o que a análise sustenta",
    objective: "Retomar o critério, não eleger um vencedor.",
    answersQuestion: null,
    mustCover: ["critério", "limite da análise"],
    evidenceNeeded: null,
    sourceSignal: eixos[0]?.sourceSignal || "amz-organico",
  });

  secoes.push({
    headingDirection: "Chamada final: o próximo passo do leitor",
    objective: "Encaminhar a decisão sem prometer preço nem endossar produto.",
    answersQuestion: null,
    mustCover: ["próximo passo"],
    evidenceNeeded: null,
    sourceSignal: "amz-organico",
  });

  return secoes.map((secao, indice) => RadarSectionDirectionSchema.parse({ ...secao, order: indice + 1 }));
}

/** §16 · agrupamentos, com linguagem factual. Nunca "1º melhor". */
function agrupamentos(ctx: Contexto): RadarBlueprintRecommendation[] {
  const grupos: RadarBlueprintRecommendation[] = [];

  if (ctx.bandas.length >= 2) {
    grupos.push(recomendacao(
      "amz-grupo-faixa",
      `Agrupar as opções pelas ${ctx.bandas.length} faixas observadas, nomeando a faixa e não uma posição.`,
      "Comparar sem ordenar: a faixa descreve, a ordem julgaria.",
      "amz-preco-faixa",
    ));
  }
  if (ctx.notas.length >= 3) {
    grupos.push(recomendacao(
      "amz-grupo-reputacao",
      "Agrupar por reputação observada — nota e volume de avaliações — dizendo que é reputação, não qualidade.",
      "Usar o sinal sem deixá-lo passar por veredito.",
      "amz-nota",
    ));
  }
  if (ctx.contagem.sponsored || ctx.contagem.both) {
    grupos.push(recomendacao(
      "amz-grupo-visibilidade",
      "Separar o que aparece organicamente do que compra espaço, e dizer qual é qual.",
      "Impedir que investimento em anúncio seja lido como mérito do produto.",
      ctx.contagem.both ? "amz-ambos" : "amz-patrocinado",
    ));
  }
  return grupos;
}

/** §20 · multimídia, só quando o apoio a sustenta. */
function planoDeMultimidia(ctx: Contexto): RadarBlueprintRecommendation[] {
  const apoio = ctx.support;
  if (!apoio) return [];
  const plano: RadarBlueprintRecommendation[] = [];

  if (apoio.formats.hasVideo) {
    plano.push(recomendacao(
      "amz-video",
      `Produzir peça em vídeo para esta intenção: a SERP do Google devolve ${apoio.multimedia.videos} vídeo(s).`,
      "Ocupar o formato que a busca externa já trata como resposta.",
      "goo-multimidia",
    ));
  }
  if (apoio.formats.hasShortVideos) {
    plano.push(recomendacao(
      "amz-short",
      `Produzir Short a partir de uma das perguntas observadas: a SERP devolve ${apoio.multimedia.shorts} Short(s).`,
      "Alcançar a intenção no formato curto que a busca já exibe.",
      "goo-multimidia",
    ));
  }
  if (apoio.formats.hasImages) {
    plano.push(recomendacao(
      "amz-imagem",
      "Produzir comparativo visual das faixas observadas.",
      "Responder no formato visual que a busca exibe.",
      "goo-multimidia",
    ));
  }
  return plano;
}

/** §18 · como o apoio altera a estrutura — sem virar um segundo blueprint. */
function aplicacaoDoGoogle(ctx: Contexto): RadarBlueprintRecommendation[] {
  const apoio = ctx.support;
  if (!apoio) return [];
  const aplicacoes: RadarBlueprintRecommendation[] = [];

  if (apoio.questions.length) {
    aplicacoes.push(recomendacao(
      "goo-aplic-perguntas",
      `Abrir uma seção de dúvidas cobrindo ${Math.min(apoio.questions.length, 5)} das perguntas que a busca externa mostra.`,
      "Fechar na página o que o leitor ainda perguntaria depois dela.",
      "goo-pergunta-1",
    ));
  }
  if (apoio.refinements.length) {
    aplicacoes.push(recomendacao(
      "goo-aplic-refinamentos",
      `Usar os ${apoio.refinements.length} refinamentos como subtópicos e variações comerciais.`,
      "Cobrir a intenção adjacente sem abrir outro artigo.",
      "goo-refinamento-1",
    ));
  }
  if (apoio.entities.length) {
    aplicacoes.push(recomendacao(
      "goo-aplic-entidades",
      "Cobrir os termos de segmentação que a busca destaca, no corpo do texto.",
      "Falar a linguagem com que a intenção é recortada fora da loja.",
      "goo-entidades",
    ));
  }
  if (apoio.popularProducts.length) {
    aplicacoes.push(recomendacao(
      "goo-aplic-comercial",
      "Prever seção comercial: a busca externa já exibe bloco de produtos para esta intenção.",
      "Atender a camada de compra que a SERP demonstra.",
      "goo-produtos",
    ));
  }
  return aplicacoes;
}

/* ============================== o adapter ============================== */

/**
 * ============ A ANÁLISE — DETERMINÍSTICA E SEM PROVIDER ============
 *
 * Tudo abaixo sai da coleta que já foi paga e do apoio que já foi gravado. Não
 * há chamada, não há IA, não há aleatoriedade: a mesma entrada produz o mesmo
 * blueprint, que é o que faz F5 e outra sessão mostrarem a mesma página.
 */
export function amazonCompetitiveBlueprintOfAnalysis(input: {
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash?: string | null;
  run: RadarAmazonSearchRun;
  /** §23 · `null` é análise parcial declarada, nunca apoio silenciosamente ausente. */
  support: RadarAmazonGoogleSupport | null;
  primaryKeyword: string | null;
  declaredIntent: string | null;
  researchRefs: readonly RadarResearchRef[];
  generatedAt: string;
  frozenAt: string | null;
}): RadarAmazonBlueprint {
  const ctx = montarContexto(input.run, input.support, {
    declaredIntent: input.declaredIntent,
    primaryKeyword: input.primaryKeyword,
  });
  const eixos = eixosDeComparacao(ctx);
  const saidas = saidasRecomendadas(ctx, eixos);

  const semApoio = !input.support;
  const limitacoes = [
    ...RADAR_AMAZON_BASE_LIMITATIONS,
    ...(semApoio ? [RADAR_AMAZON_SUPPORT_MISSING_LIMITATION] : []),
    ...input.run.limitations,
  ];

  /*
   * §22 · AS LACUNAS SÃO FIXAS PORQUE A FONTE É FIXA.
   *
   * A SERP de produtos nunca traz review, atributo, benefício, marca canônica
   * nem categoria — em nenhuma busca. Declarar isso sempre é mais honesto do
   * que declarar "quando faltar", que sugeriria que às vezes não falta.
   */
  const enriquecimento: RadarAmazonEnrichmentGap[] = [
    "REVIEW_TEXT", "PDP_ATTRIBUTES", "PRODUCT_BENEFITS", "BRAND_IDENTITY", "CATEGORY_TAXONOMY",
  ];

  const anguloEditorial = eixos.length >= 2
    ? recomendacao(
      "amz-angulo-editorial",
      `Organizar o texto em torno dos ${eixos.length} critérios que a coleta sustenta, entregando decisão antes de lista.`,
      "Diferenciar de uma listagem de produtos, que é o que a própria loja já faz melhor.",
      eixos[0].sourceSignal,
    )
    : null;

  const anguloComercial = ctx.bandas.length >= 2
    ? recomendacao(
      "amz-angulo-comercial",
      `Tratar a decisão por faixa: são ${ctx.bandas.length} faixas observadas, da mais econômica à mais cara.`,
      "Atender orçamentos diferentes sem prometer um valor que muda.",
      "amz-preco-faixa",
    )
    : ctx.contagem.sponsored
      ? recomendacao(
        "amz-angulo-comercial",
        "Tratar a disputa comercial explicitamente: há investimento em anúncio dentro da própria busca.",
        "Dar ao leitor a leitura que a listagem esconde.",
        "amz-patrocinado",
      )
      : null;

  const diferenciacao: RadarBlueprintRecommendation[] = [];
  if (ctx.contagem.both) {
    diferenciacao.push(recomendacao(
      "amz-dif-visibilidade",
      "Explicitar quais opções pagam por posição além de ranquear — a listagem não separa as duas coisas.",
      "Entregar contexto que a loja não entrega.",
      "amz-ambos",
    ));
  }
  if (ctx.votos.length >= 3) {
    diferenciacao.push(recomendacao(
      "amz-dif-maturidade",
      "Distinguir opção com muitas avaliações de opção recém-listada com nota alta.",
      "Impedir que média sem volume seja lida como consenso.",
      "amz-votos",
    ));
  }
  if (semApoio) {
    /*
     * §23 · SEM APOIO, NENHUMA RECOMENDAÇÃO DEPENDENTE DO GOOGLE.
     *
     * Não é só omitir: é dizer que foi omitido. Um blueprint sem seção de
     * dúvidas e sem multimídia, calado sobre o motivo, seria indistinguível de
     * um blueprint cujo apoio não achou nada.
     */
    diferenciacao.push(recomendacao(
      "amz-dif-sem-apoio",
      "Repetir o apoio do Google antes de decidir formato e seção de dúvidas: esta análise não o teve.",
      "Evitar que a ausência de sinal externo seja lida como ausência de demanda externa.",
      "amz-organico",
    ));
  }

  const blueprint = RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1,
    profile: "AMAZON",
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    articleDnaContentHash: input.articleDnaContentHash ?? null,
    researchRefs: [...input.researchRefs],
    limitations: limitacoes,
    provenance: { generatedAt: input.generatedAt, frozenAt: input.frozenAt },
    observed: {
      products: ctx.contagem.total,
      placementSignals: sinaisDePosicao(ctx),
      priceSignals: sinaisDePreco(ctx),
      ratingSignals: sinaisDeReputacao(ctx),
      purchaseSignals: sinaisDeCompra(ctx),
      offerTextSignals: sinaisDeOferta(ctx),
      relatedSearchSignals: sinaisDeBuscaRelacionada(ctx),
      googleSupport: sinaisDoGoogle(ctx),
      priceBands: ctx.bandas,
      sufficiency: suficiencia(ctx),
    },
    recommended: {
      supportState: semApoio ? "SUPPORT_MISSING" : "APPLIED",
      recommendedOutputs: saidas,
      editorialAngle: anguloEditorial,
      commercialAngle: anguloComercial,
      differentiationDirection: diferenciacao,
      titleDirections: direcoesDeTitulo(ctx, eixos),
      sectionDirections: estruturaDoConteudo(ctx, eixos),
      comparisonAxes: eixos,
      comparisonGrouping: agrupamentos(ctx),
      multimediaPlan: planoDeMultimidia(ctx),
      requiresEnrichment: enriquecimento,

      /* Os campos do gate anterior, preenchidos pelo mesmo material. */
      offerDirection: ctx.entregas
        ? [recomendacao(
          "amz-oferta-direcao",
          "Mencionar condição de entrega onde ela muda a decisão, sem prometer prazo específico.",
          "Cobrir um fator de compra observado sem assumir logística que varia.",
          "amz-entrega",
        )]
        : [],
      positioning: anguloComercial,
      priceBandDirection: ctx.bandas.length >= 2 ? "INTERMEDIARIO" : null,
      comparisonStructure: eixos.map(eixo => recomendacao(
        `amz-comp-${eixo.axis.toLowerCase()}`,
        `Incluir a coluna "${eixo.label}" na comparação.`,
        eixo.objective,
        eixo.sourceSignal,
      )),
      buyingGuideStructure: ctx.bandas.length >= 2
        ? [recomendacao(
          "amz-guia",
          "Abrir com critério de escolha antes de apresentar opções.",
          "Entregar decisão, não catálogo.",
          "amz-preco-faixa",
        )]
        : [],
      commercialArticleStructure: saidas.some(saida => saida.output === "COMMERCIAL_ARTICLE")
        ? [recomendacao(
          "amz-comercial",
          "Reservar seção comercial explícita, separada da parte informativa.",
          "Atender a intenção de compra sem contaminar a explicação.",
          saidas.find(saida => saida.output === "COMMERCIAL_ARTICLE")!.sourceSignals[0],
        )]
        : [],
      ctaDirection: recomendacao(
        "amz-cta",
        "Encaminhar para a comparação da própria página, sem prometer preço nem recomendar compra de um produto específico.",
        "Fechar a decisão dentro do que a análise sustenta.",
        "amz-organico",
      ),
      googleSeoSupport: aplicacaoDoGoogle(ctx),
    },
  });

  /* A união discriminada já garante o perfil; este acesso é só a leitura. */
  return blueprint as RadarAmazonBlueprint;
}
