/**
 * ===== O QUE A PESQUISA AMAZON ENCONTROU — AMAZON_SEARCH_1.1 · §9 a §14 =====
 *
 * ================= ISTO NÃO É O BLUEPRINT DA AMAZON =================
 *
 * O Blueprint final é o AMAZON_SEARCH_2. Aqui há SÍNTESE OBSERVADA: contagens,
 * faixas e termos que vieram da coleta, ditos em português. Nada nesta leitura
 * recomenda ângulo, seção ou preço — porque recomendar exigiria a separação
 * entre observado e derivado que o gate 2 constrói, e antecipá-la aqui faria a
 * tela apresentar palpite com a mesma cara de fato.
 *
 * Por isso cada linha daqui responde "o que está lá", nunca "o que fazer".
 *
 * ================= PRODUTO NÃO É POSIÇÃO — §11 =================
 *
 * Dois slots pagos do mesmo ASIN são UM produto comprando DOIS espaços. A
 * amostra mostra um card só, e diz "2 posições patrocinadas" dentro dele.
 * Duplicar o card descreveria dois concorrentes onde há um.
 *
 * ================= "BUSCAS RELACIONADAS", NUNCA "CATEGORIAS" =================
 *
 * O provider devolve termos de busca. Chamá-los de categoria inventaria uma
 * taxonomia da loja que ninguém coletou — e um artigo escrito a partir disso
 * afirmaria uma estrutura de catálogo que não existe no dado.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import {
  RADAR_AMAZON_PLACEMENT_LABELS,
  radarAmazonUniverseCounts,
  type RadarAmazonUniverseEntry,
} from "./amazon-search-model.ts";
import type { RadarAmazonSearchRun } from "./amazon-search-run.ts";
import type { RadarAmazonBlueprint, RadarObservedPrice } from "./competitive-blueprint.ts";

export type RadarAmazonCardId = "COMPETITIVE_MODEL" | "PRICE_AND_OFFER" | "REPUTATION_AND_PURCHASE" | "COMMERCIAL_AND_SEO";

export type RadarAmazonObservedCard = {
  id: RadarAmazonCardId;
  title: string;
  lines: string[];
  /**
   * ====== AMAZON_SEARCH_2 · §5 · O CARD TEM DOIS LADOS ======
   *
   * O que a pesquisa mostra fica em `lines`; o que recomendamos, aqui. São
   * listas SEPARADAS e não um texto corrido com as duas coisas: misturá-las
   * faria uma conclusão nossa ser lida com o mesmo peso de uma contagem.
   *
   * Vazio antes da análise — e isso é a verdade sobre a tela naquele momento.
   */
  recommended: Array<{ statement: string; objective: string; sourceSignal: string }>;
  /** Dito quando o card não tem nada a mostrar — silêncio pareceria erro. */
  empty: string | null;
};

export type RadarAmazonSampleProduct = {
  asin: string;
  title: string;
  url: string;
  imageUrl: string | null;
  /** "orgânico · posição 3" — o que o dado sustenta, sem ranking inventado. */
  placementLine: string;
  priceLine: string | null;
  ratingLine: string | null;
  purchaseLine: string | null;
  badges: string[];
  offerText: string[];
};

export type RadarAmazonObservedView = {
  cards: RadarAmazonObservedCard[];
  sample: {
    /** O rótulo do disclosure: "Ver amostra competitiva · 51 produtos". */
    label: string;
    products: RadarAmazonSampleProduct[];
  };
  relatedSearches: string[];
  limitations: string[];
};

const dinheiro = (valor: number, moeda: string | null) =>
  moeda
    ? `${moeda} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mediana = (valores: readonly number[]): number | null => {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
};

/**
 * A LINHA DE POSIÇÃO DE UM PRODUTO — e ela distingue produto de espaço.
 *
 * Um ASIN pode aparecer orgânico uma vez e pago duas. Escrever "patrocinado"
 * esconderia que ele também ranqueia sozinho; escrever "orgânico" esconderia
 * que ele está pagando. As duas coisas são o sinal comercial.
 */
export function radarAmazonPlacementLine(produto: RadarAmazonUniverseEntry): string {
  const pagas = produto.occurrences.filter(item => item.placement === "SPONSORED").length;
  const partes: string[] = [];

  if (produto.placements.includes("ORGANIC")) {
    partes.push(
      produto.bestOrganicRank
        ? `${RADAR_AMAZON_PLACEMENT_LABELS.ORGANIC} · posição ${produto.bestOrganicRank}`
        : RADAR_AMAZON_PLACEMENT_LABELS.ORGANIC,
    );
  }
  if (produto.placements.includes("SPONSORED")) {
    /* §11 · duas posições pagas do mesmo produto viram UMA frase, não dois cards. */
    partes.push(pagas > 1 ? `${pagas} posições patrocinadas` : RADAR_AMAZON_PLACEMENT_LABELS.SPONSORED);
  }

  return partes.join(" · ") || "posição não informada";
}

function cardModeloCompetitivo(run: RadarAmazonSearchRun): RadarAmazonObservedCard {
  const contagem = radarAmazonUniverseCounts(run.universe);
  const posicoesPagas = run.universe.reduce(
    (total, item) => total + item.occurrences.filter(ocorrencia => ocorrencia.placement === "SPONSORED").length,
    0,
  );

  const linhas = [`${contagem.total} produto(s) distinto(s) disputam esta busca.`];
  if (contagem.organic) linhas.push(`${contagem.organic} aparece(m) organicamente.`);
  if (contagem.sponsored) {
    linhas.push(
      posicoesPagas > contagem.sponsored
        ? `${contagem.sponsored} produto(s) patrocinado(s), ocupando ${posicoesPagas} posições pagas.`
        : `${contagem.sponsored} produto(s) patrocinado(s).`,
    );
  }
  if (contagem.both) {
    linhas.push(`${contagem.both} aparece(m) nas duas formas — ranqueia(m) e também compra(m) espaço.`);
  }

  return {
    id: "COMPETITIVE_MODEL",
    recommended: [],
    title: "Modelo competitivo",
    lines: linhas,
    empty: contagem.total ? null : "A coleta não devolveu produtos para esta busca.",
  };
}

function cardPrecoEOferta(run: RadarAmazonSearchRun): RadarAmazonObservedCard {
  const precos = run.universe.map(item => item.priceFrom).filter((valor): valor is number => valor !== null);
  const moeda = run.universe.find(item => item.currency)?.currency ?? null;
  const linhas: string[] = [];

  if (precos.length) {
    const menor = Math.min(...precos);
    const maior = Math.max(...precos);
    const meio = mediana(precos);
    linhas.push(`${precos.length} de ${run.universe.length} produto(s) exibem preço.`);
    linhas.push(`Faixa observada: ${dinheiro(menor, moeda)} a ${dinheiro(maior, moeda)}.`);
    /*
     * A MEDIANA, NÃO A MÉDIA. Um produto profissional de 600 puxaria a média
     * para longe do que a página inteira mostra, e a faixa deixaria de
     * descrever a prateleira.
     */
    if (meio !== null) linhas.push(`Mediana: ${dinheiro(meio, moeda)}.`);
  }

  const ofertas = run.universe.flatMap(item => item.offerText);
  if (ofertas.length) {
    const distintas = [...new Set(ofertas)];
    linhas.push(`Textos de oferta na página: ${distintas.slice(0, 4).join(" · ")}${distintas.length > 4 ? ` (+${distintas.length - 4})` : ""}.`);
  }

  const semPreco = run.universe.length - precos.length;
  if (semPreco > 0 && precos.length) linhas.push(`${semPreco} produto(s) sem preço na listagem.`);

  return {
    id: "PRICE_AND_OFFER",
    recommended: [],
    title: "Preço e oferta",
    lines: linhas,
    empty: precos.length ? null : "Nenhum produto desta coleta exibiu preço na listagem.",
  };
}

function cardReputacao(run: RadarAmazonSearchRun): RadarAmazonObservedCard {
  const avaliados = run.universe.filter(item => item.ratingValue !== null);
  const notas = avaliados.map(item => item.ratingValue as number);
  const votos = run.universe.map(item => item.ratingVotes).filter((valor): valor is number => valor !== null);
  const comprados = run.universe.filter(item => item.boughtPastMonth !== null);
  const linhas: string[] = [];

  if (avaliados.length) {
    const meio = mediana(notas);
    const maximo = avaliados.find(item => item.ratingMax !== null)?.ratingMax ?? null;
    linhas.push(`${avaliados.length} de ${run.universe.length} produto(s) têm avaliação.`);
    if (meio !== null) {
      linhas.push(`Nota mediana: ${meio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${maximo ? ` de ${maximo}` : ""}.`);
    }
    /*
     * A CONTAGEM DE VOTOS DESCREVE MATURIDADE, não qualidade. Um produto com
     * 4,7 e 12 votos e outro com 4,4 e 30 mil dizem coisas diferentes sobre a
     * categoria, e a nota sozinha apagaria a diferença.
     */
    const votosMedianos = mediana(votos);
    if (votosMedianos !== null) linhas.push(`Mediana de ${Math.round(votosMedianos).toLocaleString("pt-BR")} avaliação(ões) por produto.`);
  }

  if (comprados.length) {
    const maior = Math.max(...comprados.map(item => item.boughtPastMonth as number));
    linhas.push(`${comprados.length} produto(s) exibem compras no último mês — o maior declara ${maior.toLocaleString("pt-BR")}.`);
  }

  return {
    id: "REPUTATION_AND_PURCHASE",
    recommended: [],
    title: "Reputação e sinais de compra",
    lines: linhas,
    empty: linhas.length ? null : "A coleta não trouxe avaliação nem sinal de compra.",
  };
}

function cardComercialESeo(run: RadarAmazonSearchRun): RadarAmazonObservedCard {
  const contagem = radarAmazonUniverseCounts(run.universe);
  const entregas = run.universe.filter(item => item.deliveryMessage);
  const linhas: string[] = [];

  if (contagem.amazonChoice) linhas.push(`${contagem.amazonChoice} produto(s) com selo Amazon's Choice.`);
  if (contagem.bestSeller) linhas.push(`${contagem.bestSeller} produto(s) com selo Mais Vendido.`);
  if (entregas.length) linhas.push(`${entregas.length} produto(s) anunciam prazo ou condição de entrega.`);

  if (run.relatedSearches.length) {
    /* §12 · o nome é o do provider: são buscas, e não a taxonomia da loja. */
    linhas.push(`${run.relatedSearches.length} busca(s) relacionada(s) acompanham esta consulta.`);
  }

  const titulos = run.universe.map(item => item.title.length);
  const tituloMediano = mediana(titulos);
  if (tituloMediano !== null) linhas.push(`Título mediano com ${Math.round(tituloMediano)} caracteres.`);

  return {
    id: "COMMERCIAL_AND_SEO",
    recommended: [],
    title: "Estrutura comercial e SEO",
    lines: linhas,
    empty: linhas.length ? null : "A coleta não trouxe selo, entrega nem busca relacionada.",
  };
}

function amostra(produto: RadarAmazonUniverseEntry): RadarAmazonSampleProduct {
  const badges: string[] = [];
  if (produto.isAmazonChoice) badges.push("Amazon's Choice");
  if (produto.isBestSeller) badges.push("Mais Vendido");

  return {
    asin: produto.asin,
    title: produto.title,
    url: produto.url,
    imageUrl: produto.imageUrl,
    placementLine: radarAmazonPlacementLine(produto),
    priceLine: produto.priceFrom === null ? null : dinheiro(produto.priceFrom, produto.currency),
    ratingLine: produto.ratingValue === null
      ? null
      : `${produto.ratingValue.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${produto.ratingMax ? `/${produto.ratingMax}` : ""}${
        produto.ratingVotes === null ? "" : ` · ${produto.ratingVotes.toLocaleString("pt-BR")} avaliação(ões)`
      }`,
    purchaseLine: produto.boughtPastMonth === null
      ? null
      : `${produto.boughtPastMonth.toLocaleString("pt-BR")} compra(s) no último mês`,
    badges,
    offerText: produto.offerText,
  };
}

/**
 * ============ A LEITURA ÚNICA DA COLETA AMAZON — §16 ============
 *
 * Cards, amostra e buscas relacionadas saem daqui. Deixar o componente React
 * derivar qualquer um deles criaria uma segunda contagem da mesma coleta, e foi
 * exatamente assim que a tela do 1.1 passou a discordar de si mesma.
 */
export function buildRadarAmazonObservedView(run: RadarAmazonSearchRun | null): RadarAmazonObservedView | null {
  if (!run) return null;

  /*
   * A AMOSTRA É ORDENADA PELA MELHOR POSIÇÃO ORGÂNICA.
   *
   * A ordem de chegada do provider mistura pago e orgânico, e abrir a amostra
   * por ela faria os anúncios parecerem os primeiros colocados.
   */
  const ordenados = [...run.universe].sort((a, b) => {
    const posicaoA = a.bestOrganicRank ?? a.bestSponsoredRank ?? Number.MAX_SAFE_INTEGER;
    const posicaoB = b.bestOrganicRank ?? b.bestSponsoredRank ?? Number.MAX_SAFE_INTEGER;
    return posicaoA - posicaoB;
  });

  return {
    cards: [
      cardModeloCompetitivo(run),
      cardPrecoEOferta(run),
      cardReputacao(run),
      cardComercialESeo(run),
    ],
    sample: {
      label: `Ver amostra competitiva · ${run.universe.length} produto(s)`,
      products: ordenados.map(amostra),
    },
    relatedSearches: run.relatedSearches.map(item => item.term),
    limitations: run.limitations,
  };
}

/* ============ AMAZON_SEARCH_2 · os cards depois da análise ============ */

/**
 * ============ §5 e §31 · OS MESMOS QUATRO CARDS, AGORA COM OS DOIS LADOS ============
 *
 * Antes da análise os cards saem da corrida; depois, saem do BLUEPRINT — que já
 * carrega os sinais observados e as recomendações com origem.
 *
 * Recalcular a corrida aqui abriria uma segunda contagem da mesma coleta ao
 * lado da que foi gravada, e as duas divergiriam no dia em que qualquer uma
 * fosse melhorada. O blueprint é a autoridade; isto o organiza em quatro caixas.
 */
export function buildRadarAmazonBlueprintCards(blueprint: RadarAmazonBlueprint): RadarAmazonObservedCard[] {
  const observado = blueprint.observed;
  const recomendado = blueprint.recommended;

  const recomendacao = (item: { statement: string; objective: string; sourceSignal: string }) => ({
    statement: item.statement, objective: item.objective, sourceSignal: item.sourceSignal,
  });

  const modelo: RadarAmazonObservedCard = {
    id: "COMPETITIVE_MODEL",
    title: "Modelo competitivo",
    lines: [
      ...observado.placementSignals.map(sinal => sinal.statement),
      observado.sufficiency,
    ],
    recommended: [
      ...(recomendado.editorialAngle ? [recomendacao(recomendado.editorialAngle)] : []),
      ...recomendado.differentiationDirection.map(recomendacao),
    ],
    empty: observado.products ? null : "A coleta não devolveu produtos para esta busca.",
  };

  const preco: RadarAmazonObservedCard = {
    id: "PRICE_AND_OFFER",
    title: "Preço e oferta",
    lines: [
      ...observado.priceSignals.map(sinal => sinal.statement),
      /*
       * §7 · A FAIXA VIAJA COM O MÉTODO.
       *
       * "Intermediário" sem o método ao lado é opinião com cara de estatística.
       * Com o tercil declarado, quem lê sabe o que o rótulo significa — e pode
       * discordar dele.
       */
      ...observado.priceBands.map(banda =>
        `${RADAR_PRICE_BAND_LABELS[banda.band]}: ${faixaLegivel(banda)} · ${banda.sampleSize} produto(s) · ${banda.method}`),
      ...observado.offerTextSignals.map(sinal => sinal.statement),
    ],
    recommended: [
      ...(recomendado.commercialAngle ? [recomendacao(recomendado.commercialAngle)] : []),
      ...recomendado.offerDirection.map(recomendacao),
      ...recomendado.buyingGuideStructure.map(recomendacao),
    ],
    empty: observado.priceSignals.length ? null : "Nenhum produto desta coleta exibiu preço na listagem.",
  };

  const reputacao: RadarAmazonObservedCard = {
    id: "REPUTATION_AND_PURCHASE",
    title: "Reputação e sinais de compra",
    lines: [
      ...observado.ratingSignals.map(sinal => sinal.statement),
      ...observado.purchaseSignals.map(sinal => sinal.statement),
    ],
    /*
     * §8 e §16 · A RESSALVA ANDA COM O EIXO.
     *
     * Uma coluna "4,7" sem a frase ao lado é lida como veredito. O eixo já
     * carrega o `caveat`; o card o mostra junto, e não num rodapé que ninguém lê.
     */
    recommended: [
      ...recomendado.comparisonGrouping.map(recomendacao),
      ...recomendado.comparisonAxes
        .filter(eixo => eixo.axis === "RATING" || eixo.axis === "REVIEW_VOLUME"
          || eixo.axis === "AMAZON_CHOICE" || eixo.axis === "BEST_SELLER"
          || eixo.axis === "PURCHASE_VOLUME_SIGNAL")
        .map(eixo => ({
          statement: `Comparar por "${eixo.label}" — ${eixo.caveat || "sinal observado na listagem"}.`,
          objective: eixo.objective,
          sourceSignal: eixo.sourceSignal,
        })),
    ],
    empty: observado.ratingSignals.length || observado.purchaseSignals.length
      ? null
      : "A coleta não trouxe avaliação nem sinal de compra.",
  };

  const comercial: RadarAmazonObservedCard = {
    id: "COMMERCIAL_AND_SEO",
    title: "Estrutura comercial e SEO",
    lines: [
      ...observado.relatedSearchSignals.map(sinal => sinal.statement),
      ...observado.googleSupport.map(sinal => sinal.statement),
    ],
    recommended: [
      ...recomendado.googleSeoSupport.map(recomendacao),
      ...recomendado.multimediaPlan.map(recomendacao),
      ...recomendado.commercialArticleStructure.map(recomendacao),
    ],
    empty: observado.relatedSearchSignals.length || observado.googleSupport.length
      ? null
      : "A coleta não trouxe busca relacionada, e o apoio do Google não entrou nesta análise.",
  };

  return [modelo, preco, reputacao, comercial];
}

const RADAR_PRICE_BAND_LABELS: Record<RadarObservedPrice["band"], string> = {
  ECONOMICO: "Econômico",
  INTERMEDIARIO: "Intermediário",
  PREMIUM: "Premium",
};

const faixaLegivel = (banda: RadarObservedPrice) => {
  const valor = (numero: number) =>
    `${banda.currency} ${numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (banda.rangeFrom === null || banda.rangeTo === null) {
    return banda.observedValue === null ? "faixa não informada" : valor(banda.observedValue);
  }
  return `${valor(banda.rangeFrom)} a ${valor(banda.rangeTo)}`;
};
