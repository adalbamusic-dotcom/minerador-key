import {
  RADAR_AMAZON_IMPLIED_CRITERIA,
  type RadarAmazonEditorialIntent,
  type RadarAmazonRankingCriteria,
} from "./amazon-editorial-target.ts";
import type { RadarAmazonUniverseEntry } from "./amazon-search-model.ts";

/**
 * ===== A SELEÇÃO DE CANDIDATOS — AMAZON_EDITORIAL_TARGET_1 · §23 a §25 =====
 *
 * ============ §23 · "TOP 10" NÃO É "OS DEZ PRIMEIROS DA AMAZON" ============
 *
 * Essa é a regra que este módulo existe para impedir de ser quebrada por
 * conveniência, porque quebrá-la é fácil: `universe.slice(0, 10)` compila,
 * passa em qualquer teste de contagem e produz um artigo que afirma serem "os
 * melhores" dez produtos escolhidos pelo algoritmo de vendas de uma loja.
 *
 * A posição orgânica da Amazon mede relevância comercial para AQUELA busca,
 * misturada a histórico de vendas, margem e estoque. Ela é um sinal — um sinal
 * bom — e não é um veredito editorial. Um slot patrocinado, menos ainda: ele
 * mede quem pagou.
 *
 * ==================== §25 · E CUSTO-BENEFÍCIO NÃO É "MAIS BARATO" ====================
 *
 * O produto mais barato da prateleira costuma ser o pior. Custo-benefício é uma
 * RELAÇÃO: o que se recebe pelo que se paga. Sem reputação do outro lado da
 * divisão, "custo-benefício" vira uma ordenação por preço com outro nome — e o
 * artigo recomendaria o item de R$ 12 com nota 2,8.
 *
 * ==================== O QUE ESTE MÓDULO NÃO FAZ ====================
 *
 * Ele não decide que os selecionados são "os melhores". Ele monta CANDIDATOS e
 * declara quais sinais sustentaram cada um — e diz, quando é o caso, que a
 * evidência não sustenta a palavra "melhores" (§24). Quem escreve a promessa é
 * o Planejador, e ele precisa saber em que pé a evidência está.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export type RadarAmazonCandidate = {
  asin: string;
  title: string;
  /** Os sinais que colocaram este produto na lista, em português. */
  supportingSignals: string[];
  /** O que FALTA para ele ser defensável. Vazio quando nada falta. */
  missingSignals: string[];
  /** A posição na seleção do Radar — nunca a posição na loja. */
  order: number;
};

export type RadarAmazonSelection = {
  /**
   * ===== 1.1 · §10 e §16 · OS TRÊS NÚMEROS, LADO A LADO =====
   *
   * "59 produto(s) comparável(is)" era uma frase falsa sobre um número
   * verdadeiro: os 59 existem, e eles não eram comparáveis entre si. Os três
   * respondem perguntas diferentes e precisam aparecer juntos:
   *
   *     observados    o que a Amazon devolveu   (evidência)
   *     compatíveis   o que o alvo admite        (universo comparável)
   *     selecionados  o que entra no artigo      (decisão editorial)
   *
   * `desiredCount` limita só o terceiro — nunca a coleta (§10).
   */
  observedCount: number;
  eligibleCount: number;
  criteria: RadarAmazonRankingCriteria;
  /** Os critérios, ditos — §24 exige que o blueprint os declare. */
  criteriaStatements: string[];
  candidates: RadarAmazonCandidate[];
  /** Quantos foram pedidos e quantos a evidência sustentou. */
  desiredCount: number | null;
  /**
   * §24 · A EVIDÊNCIA SUSTENTA A PALAVRA "MELHORES"?
   *
   * `false` não bloqueia o artigo: ele muda de promessa. "10 opções em destaque
   * para comparar" é verdadeiro com a evidência que temos; "os 10 melhores" não
   * é, e o Planejador precisa receber essa diferença decidida.
   */
  supportsSuperlative: boolean;
  recommendedWording: string;
  limitations: string[];
};

/* ============================== os sinais ============================== */

/**
 * A NOTA SOZINHA NÃO É REPUTAÇÃO.
 *
 * Cinco estrelas de três avaliações e 4,4 de oito mil dizem coisas diferentes
 * sobre o mesmo produto, e a primeira favorece sistematicamente o lançamento
 * sem histórico. O volume entra como peso, e não como desempate.
 */
function reputacao(produto: RadarAmazonUniverseEntry): number | null {
  if (produto.ratingValue === null) return null;
  const maximo = produto.ratingMax || 5;
  const normalizada = Math.max(0, Math.min(1, produto.ratingValue / maximo));
  const votos = produto.ratingVotes || 0;
  /* Confiança que cresce depressa no começo e satura — não é linear no volume. */
  const confianca = votos <= 0 ? 0 : Math.min(1, Math.log10(1 + votos) / Math.log10(1 + 2000));
  return normalizada * (0.35 + 0.65 * confianca);
}

function popularidade(produto: RadarAmazonUniverseEntry): number | null {
  const comprados = produto.boughtPastMonth;
  if (comprados === null && !produto.isBestSeller) return null;
  const base = comprados === null ? 0 : Math.min(1, Math.log10(1 + comprados) / Math.log10(1 + 5000));
  return Math.min(1, base + (produto.isBestSeller ? 0.25 : 0));
}

/**
 * RELEVÂNCIA É ORGÂNICA, e patrocinado não conta como relevância.
 *
 * Um produto que só apareceu comprando o slot não demonstrou nada sobre a
 * disputa: ele demonstrou orçamento. Ele continua no universo, visível, e não
 * entra na seleção como se tivesse ranqueado.
 */
function relevancia(produto: RadarAmazonUniverseEntry, universo: number): number | null {
  if (produto.bestOrganicRank === null) return null;
  const teto = Math.max(universo, 10);
  return Math.max(0, 1 - (produto.bestOrganicRank - 1) / teto);
}

/** Aparecer em mais de uma consulta é sinal próprio: o produto atravessa buscas. */
const recorrencia = (produto: RadarAmazonUniverseEntry, consultas: number) =>
  consultas <= 1 ? null : Math.min(1, (produto.occurrenceCount - 1) / Math.max(1, consultas - 1));

/**
 * §25 · CUSTO-BENEFÍCIO É REPUTAÇÃO SOBRE PREÇO RELATIVO.
 *
 * O preço entra NORMALIZADO contra a própria prateleira, e não em reais: uma
 * escala absoluta faria a fórmula significar coisas diferentes em categorias
 * diferentes. E o resultado só existe quando os DOIS lados existem — sem nota,
 * não há benefício para dividir, e o que sobraria seria preço.
 */
function custoBeneficio(produto: RadarAmazonUniverseEntry, precos: number[]): number | null {
  const preco = produto.priceFrom;
  const nota = reputacao(produto);
  if (preco === null || preco <= 0 || nota === null) return null;
  if (!precos.length) return null;

  const menor = Math.min(...precos);
  const maior = Math.max(...precos);
  /* Prateleira de preço único: o preço não diferencia, e a reputação decide. */
  if (maior <= menor) return nota;

  const posicao = (preco - menor) / (maior - menor);
  /* Barato pesa, e não decide sozinho: o piso de 0,35 impede o preço de zerar a nota. */
  return nota * (1 - 0.65 * posicao);
}

/* ============================ a seleção ============================ */

const ROTULO_DO_CRITERIO: Record<RadarAmazonRankingCriteria, string> = {
  BEST_OVERALL: "Avaliação geral",
  VALUE_FOR_MONEY: "Custo-benefício",
  POPULARITY: "Popularidade",
  REPUTATION: "Reputação",
  USE_CASE: "Adequação à necessidade declarada",
};

export function radarAmazonSelectCandidates(input: {
  intent: RadarAmazonEditorialIntent;
  /**
   * §11 e §12 · O UNIVERSO QUE ENTRA AQUI JÁ É O COMPATÍVEL.
   *
   * O ranking roda sobre `ELIGIBLE_CANDIDATES`, nunca sobre o bruto. Quem
   * separa é `radarAmazonEligibleCandidates`, e a separação acontece ANTES —
   * ordenar 59 produtos incomparáveis produziria uma lista bem ordenada de
   * coisas que não deveriam estar na mesma lista.
   */
  universe: readonly RadarAmazonUniverseEntry[];
  /** §10 e §16 · quantos a Amazon devolveu, para a tela dizer os três números. */
  observedCount?: number;
  /** Quantas consultas produziram este universo. Sustenta a recorrência. */
  queryCount: number;
}): RadarAmazonSelection {
  const criteria = input.intent.rankingCriteria
    || RADAR_AMAZON_IMPLIED_CRITERIA[input.intent.type]
    || "BEST_OVERALL";

  const universo = [...input.universe];
  const precos = universo.map(item => item.priceFrom).filter((valor): valor is number => valor !== null && valor > 0);
  const desiredCount = input.intent.desiredCount;
  const limitations: string[] = [];

  /*
   * O PESO DE CADA SINAL É DECLARADO POR CRITÉRIO.
   *
   * A alternativa — uma fórmula única com pesos fixos — faria "melhores" e
   * "custo-benefício" produzirem a mesma lista, que é exatamente o que o §25
   * proíbe. Os pesos ficam visíveis aqui porque é aqui que alguém vai querer
   * discutir se estão certos.
   */
  const PESOS: Record<RadarAmazonRankingCriteria, Partial<Record<string, number>>> = {
    BEST_OVERALL: { reputacao: 0.4, relevancia: 0.25, popularidade: 0.2, recorrencia: 0.15 },
    VALUE_FOR_MONEY: { custoBeneficio: 0.55, reputacao: 0.2, popularidade: 0.15, relevancia: 0.1 },
    POPULARITY: { popularidade: 0.55, relevancia: 0.25, reputacao: 0.2 },
    REPUTATION: { reputacao: 0.7, popularidade: 0.15, relevancia: 0.15 },
    USE_CASE: { relevancia: 0.35, recorrencia: 0.25, reputacao: 0.25, popularidade: 0.15 },
  };

  const pesos = PESOS[criteria];

  const avaliados = universo.map(produto => {
    const sinais: Record<string, number | null> = {
      reputacao: reputacao(produto),
      popularidade: popularidade(produto),
      relevancia: relevancia(produto, universo.length),
      recorrencia: recorrencia(produto, input.queryCount),
      custoBeneficio: criteria === "VALUE_FOR_MONEY" ? custoBeneficio(produto, precos) : null,
    };

    /*
     * SINAL AUSENTE NÃO VIRA ZERO — ele sai da conta.
     *
     * Tratar "sem preço" como preço zero coroaria de graça o produto sobre o
     * qual menos se sabe. O peso é renormalizado sobre o que existe, e o que
     * faltou é DITO no candidato.
     */
    let soma = 0;
    let total = 0;
    const presentes: string[] = [];
    const ausentes: string[] = [];
    for (const [nome, peso] of Object.entries(pesos)) {
      const valor = sinais[nome];
      if (valor === null || valor === undefined || !peso) { if (peso) ausentes.push(nome); continue; }
      soma += valor * peso;
      total += peso;
      presentes.push(nome);
    }

    return { produto, score: total > 0 ? soma / total : 0, cobertura: total, presentes, ausentes };
  });

  /*
   * §23 · SEM SINAL NENHUM, O PRODUTO NÃO ENTRA COMO CANDIDATO.
   *
   * Ele continua no universo e na amostra — o que ele não faz é ocupar uma vaga
   * numa lista que o artigo vai apresentar como selecionada por critério.
   */
  const elegiveis = avaliados.filter(item => item.cobertura > 0);
  if (elegiveis.length < avaliados.length) {
    limitations.push(`${avaliados.length - elegiveis.length} produto(s) do universo não trouxeram sinal suficiente para entrar na seleção e ficaram fora dela.`);
  }

  const ordenados = elegiveis.sort((esquerda, direita) =>
    direita.score - esquerda.score
    /* Empate: mais sinais conhecidos ganha de menos sinais conhecidos. */
    || direita.cobertura - esquerda.cobertura
    /* E, por último, o ASIN — para a ordem ser estável entre execuções. */
    || esquerda.produto.asin.localeCompare(direita.produto.asin));

  const selecionados = desiredCount ? ordenados.slice(0, desiredCount) : ordenados.slice(0, 10);

  const candidates: RadarAmazonCandidate[] = selecionados.map((item, indice) => ({
    asin: item.produto.asin,
    title: item.produto.title,
    supportingSignals: item.presentes.map(nome => FRASE_DO_SINAL[nome]?.(item.produto) || nome).filter(Boolean),
    missingSignals: item.ausentes.map(nome => FALTA_DO_SINAL[nome] || nome),
    order: indice + 1,
  }));

  if (desiredCount && candidates.length < desiredCount) {
    limitations.push(`O artigo pretende ${desiredCount} produto(s) e a evidência sustenta ${candidates.length}.`);
  }

  /*
   * ============ §24 · QUANDO "OS MELHORES" É DEFENSÁVEL ============
   *
   * A palavra exige que a maioria dos selecionados tenha reputação real — nota
   * COM volume — e que a lista tenha tamanho para ser uma lista. Uma seleção
   * sustentada por posição orgânica e nada mais está descrevendo a vitrine da
   * loja, e chamá-la de "as melhores" seria emprestar ao algoritmo da Amazon
   * uma autoridade editorial que ele não tem.
   */
  const comReputacao = selecionados.filter(item => item.presentes.includes("reputacao")).length;
  const proporcao = candidates.length ? comReputacao / candidates.length : 0;
  const supportsSuperlative = candidates.length >= 3 && proporcao >= 0.6;

  if (!supportsSuperlative && candidates.length) {
    limitations.push("A amostra não sustenta a afirmação de que estes são os melhores: parte dos produtos não trouxe nota e volume de avaliações suficientes.");
  }

  const criteriaStatements = Object.entries(pesos)
    .filter(([nome]) => FRASE_DO_CRITERIO[nome])
    .sort((esquerda, direita) => (direita[1] || 0) - (esquerda[1] || 0))
    .map(([nome]) => FRASE_DO_CRITERIO[nome]!);

  return {
    observedCount: input.observedCount ?? universo.length,
    eligibleCount: universo.length,
    criteria,
    criteriaStatements,
    candidates,
    desiredCount,
    supportsSuperlative,
    recommendedWording: supportsSuperlative
      ? `${candidates.length} ${ROTULO_DO_CRITERIO[criteria].toLowerCase()}: seleção sustentada pelos critérios declarados.`
      : `${candidates.length} opção(ões) em destaque para comparar — a evidência sustenta a seleção, não a superioridade.`,
    limitations,
  };
}

const FRASE_DO_SINAL: Record<string, (produto: RadarAmazonUniverseEntry) => string> = {
  reputacao: produto => `Nota ${produto.ratingValue} com ${produto.ratingVotes ?? 0} avaliação(ões).`,
  popularidade: produto => produto.boughtPastMonth !== null
    ? `${produto.boughtPastMonth} compra(s) no último mês${produto.isBestSeller ? " · Best Seller" : ""}.`
    : "Selo Best Seller na listagem.",
  relevancia: produto => `Posição orgânica ${produto.bestOrganicRank} na busca da loja.`,
  recorrencia: produto => `Aparece em ${produto.occurrenceCount} consulta(s) da mesma investigação.`,
  custoBeneficio: produto => `Preço observado ${produto.currency || "R$"} ${produto.priceFrom} em relação à faixa da prateleira.`,
};

const FALTA_DO_SINAL: Record<string, string> = {
  reputacao: "sem nota ou sem volume de avaliações",
  popularidade: "sem sinal de compra na listagem",
  relevancia: "não apareceu como orgânico — só patrocinado",
  recorrencia: "apareceu em uma consulta só",
  custoBeneficio: "sem preço observado para relacionar com a reputação",
};

const FRASE_DO_CRITERIO: Record<string, string> = {
  reputacao: "Reputação agregada: nota ponderada pelo volume de avaliações.",
  popularidade: "Popularidade: compras no último mês e selos da listagem.",
  relevancia: "Relevância orgânica: a posição alcançada sem anúncio.",
  recorrencia: "Recorrência: o produto aparece em mais de uma consulta.",
  custoBeneficio: "Custo-benefício: reputação em relação ao preço dentro da própria prateleira.",
};

export { ROTULO_DO_CRITERIO as RADAR_AMAZON_CRITERIA_LABELS };
