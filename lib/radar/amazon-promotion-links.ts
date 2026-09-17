import { z } from "zod";
import type { RadarAmazonEditorialIntentType } from "./amazon-editorial-target.ts";
import type { RadarAmazonSelection } from "./amazon-candidate-selection.ts";
import type { RadarAmazonUniverseEntry } from "./amazon-search-model.ts";

/**
 * ===== O PLANO DE LINKS DE PRODUTO — AMAZON_PROMOTION_LINK_PLAN_1 =====
 *
 * ==================== O QUE ESTE PLANO É, E O QUE NÃO É ====================
 *
 * Ele diz QUAL produto vira link, ONDE ele entra no artigo e COMO ele deve
 * aparecer. Ele NÃO cria link de afiliado, NÃO guarda tag e NÃO conhece o
 * programa de afiliados de ninguém (§5).
 *
 * O Redator troca `amazonUrl` por `affiliateUrl` mais tarde, e a identidade do
 * produto — o ASIN — atravessa essa troca intacta. É isso que faz a
 * substituição ser segura: o que muda é o endereço, nunca o produto.
 *
 * ==================== §3 · A AUTORIDADE É A SHORTLIST ====================
 *
 *     raw = 59        →  nunca vira link
 *     eligible = 9    →  nunca vira link
 *     shortlist = 6   →  6 links
 *
 * Gerar link para o universo bruto produziria 59 links de afiliado num artigo
 * que apresenta 6 produtos — e 53 deles apontariam para coisas que o texto não
 * menciona. O plano nasce de onde a decisão editorial já foi tomada.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export const RADAR_AMAZON_LINK_FORMATS = ["TEXT_LINK", "BUTTON"] as const;
export type RadarAmazonLinkFormat = typeof RADAR_AMAZON_LINK_FORMATS[number];

/**
 * §8 · A POLÍTICA DE `rel` É UMA SÓ, e ela é decidida aqui.
 *
 * `sponsored nofollow` porque o link vai virar monetizado. `follow` puro passaria
 * autoridade para um destino comercial pago; `ugc` mentiria sobre a origem — o
 * link não foi posto por um usuário, foi posto pela redação.
 *
 * A política viaja com o plano mesmo enquanto a URL ainda é a normal: quem
 * aplica o link afiliado não precisa lembrar da regra, ele a recebe.
 */
export const RADAR_AMAZON_REL_POLICY = "sponsored nofollow" as const;

export const RadarAmazonPromotionLinkSchema = z.object({
  /** §5 · a identidade que sobrevive à troca por URL de afiliado. */
  asin: z.string().min(1),
  productName: z.string().min(1),
  /** §4 · a URL limpa do produto. Nunca a URL de busca com rastreamento. */
  amazonUrl: z.string().min(1),
  suggestedAnchor: z.string().min(1),
  suggestedButtonLabel: z.string().min(1),
  placement: z.string().min(1),
  linkFormat: z.enum(RADAR_AMAZON_LINK_FORMATS),
  /** §5 · pronto para receber a URL de afiliado — e sem tag nenhuma aqui. */
  affiliateReady: z.literal(true),
  relPolicy: z.literal(RADAR_AMAZON_REL_POLICY),
}).strict();
export type RadarAmazonPromotionLink = z.infer<typeof RadarAmazonPromotionLinkSchema>;

/* ============================== §4 · a URL ============================== */

const HOSTS_AMAZON = /(^|\.)amazon\.[a-z.]+$/i;

/**
 * ===== §4 · A URL LIMPA, CONSTRUÍDA A PARTIR DO ASIN =====
 *
 * ==================== O QUE A COLETA REAL DEVOLVE ====================
 *
 * Cada produto veio com ~700 caracteres de rastreamento de BUSCA:
 *
 *     /dp/B0DBRR5BP4/ref=sr_1_7?crid=KMVPVMW48DCI&dib=eyJ2IjoiMSJ9._WbDx…
 *     &keywords=Serum+Nivea&qid=1789532528&sprefix=…&sr=8-7
 *
 * E 12 dos 59 nem sequer são URLs de produto: são `sspa/click`, o redirecionador
 * de anúncio, com a URL real escondida dentro de um parâmetro.
 *
 * Publicar isso amarraria o link do artigo à busca que o encontrou — `qid` é um
 * timestamp, `sr=8-7` é a posição daquele dia. Um leitor clicando meses depois
 * carregaria o rastro de uma sessão que não é a dele.
 *
 * ==================== POR QUE CONSTRUIR, E NÃO LIMPAR ====================
 *
 * Tentar podar os parâmetros exigiria saber quais são inócuos hoje e continuar
 * sabendo amanhã. O ASIN já é a identidade canônica do produto (§5): com ele, a
 * URL de produto é uma forma conhecida e estável.
 *
 * O domínio vem do que foi OBSERVADO — a coleta foi em `amazon.com.br`, e um
 * `.com` fixo mandaria o leitor brasileiro para outra loja.
 */
export function radarAmazonCleanProductUrl(asin: string, observedUrl: string | null | undefined): string {
  const identidade = (asin || "").trim();
  if (!identidade) throw new Error("Um link de produto precisa do ASIN.");

  let host = "www.amazon.com.br";
  const bruto = (observedUrl || "").trim();
  if (bruto) {
    try {
      const lida = new URL(bruto);
      if (HOSTS_AMAZON.test(lida.hostname)) host = lida.hostname;
    } catch {
      /*
       * URL ilegível não impede o link: o ASIN basta.
       *
       * Propagar o erro faria um produto legítimo ficar sem link por causa de
       * um campo de vitrine malformado.
       */
    }
  }

  return `https://${host}/dp/${identidade}`;
}

/* ========================= §2 · quantos links ========================= */

/**
 * §2 · O TETO DE LINKS DE CADA INTENÇÃO.
 *
 * `null` significa "um por produto da shortlist" — que já é o teto natural,
 * porque a shortlist é a decisão editorial. Os números explícitos existem onde a
 * FORMA do artigo tem um limite próprio: um review fala de um produto, um X vs Y
 * de dois, e um guia de compra indica poucos sem virar lista de compras.
 */
const TETO_POR_INTENCAO: Partial<Record<RadarAmazonEditorialIntentType, number>> = {
  PRODUCT_REVIEW: 1,
  PRODUCT_VS_PRODUCT: 2,
  /*
   * §2 · O GUIA INDICA ATÉ CINCO, e isso é uma escolha de forma.
   *
   * Ele existe para dar critério, não para vender: uma lista longa de links o
   * transformaria no ranking que ele deliberadamente não é (1.1 · §5).
   */
  BUYING_GUIDE: 5,
};

/* ===================== a âncora e o rótulo do botão ===================== */

/**
 * §7 · A ÂNCORA É O NOME DO PRODUTO, e o botão é a ação.
 *
 * São duas aplicações do mesmo link, e o Blueprint recomenda as duas porque a
 * composição final é do Planejador/Redator. Inventar uma frase de venda aqui
 * seria escrever copy sem contexto de marca.
 *
 * O nome é ENCURTADO no ponto natural: os títulos da Amazon carregam a ficha
 * inteira depois da primeira vírgula — "NIVEA Q10 Sérum Antissinais Expert Dupla
 * Ação 30ml, Previne e Reduz Rugas, Renova a Pele" — e nada disso é âncora.
 */
function ancoraDoProduto(titulo: string): string {
  const limpo = (titulo || "").trim();
  const antesDaVirgula = limpo.split(",")[0].trim();
  const base = antesDaVirgula.length >= 12 ? antesDaVirgula : limpo;
  if (base.length <= 80) return base;

  /* Corta na última palavra inteira — meia palavra não é âncora. */
  const cortado = base.slice(0, 80);
  const ultimo = cortado.lastIndexOf(" ");
  return (ultimo > 40 ? cortado.slice(0, ultimo) : cortado).trim();
}

/**
 * §6 · ONDE O LINK ENTRA — dito em português, sem parâmetro técnico.
 *
 * O lugar depende da FORMA do artigo: num review há um bloco do produto; num
 * X vs Y há dois lados; num ranking há a posição da lista.
 */
function lugarDoLink(intent: RadarAmazonEditorialIntentType, ordem: number, total: number): string {
  switch (intent) {
    case "PRODUCT_REVIEW":
      return "No bloco do produto e no fechamento do review.";
    case "PRODUCT_VS_PRODUCT":
      return ordem === 1 ? "No lado A da comparação." : "No lado B da comparação.";
    case "PRODUCT_COMPARISON":
      return `Na linha do produto ${ordem} da comparação.`;
    case "BUYING_GUIDE":
      return `Na indicação ${ordem} de ${total}, depois dos critérios de escolha.`;
    case "BRAND_LINE_REVIEW":
      return `No bloco do produto ${ordem} da linha.`;
    default:
      return `Na posição ${ordem} da lista.`;
  }
}

/**
 * §7 · O FORMATO RECOMENDADO — e o ranking pede botão.
 *
 * Numa lista de dez, dez âncoras de texto viram parágrafo azul. Num review, o
 * nome do produto no corpo do texto lê melhor do que um botão no meio da frase.
 */
const formatoDoLink = (intent: RadarAmazonEditorialIntentType): RadarAmazonLinkFormat =>
  intent === "PRODUCT_REVIEW" || intent === "BUYING_GUIDE" ? "TEXT_LINK" : "BUTTON";

/* ============================== o plano ============================== */

export type RadarAmazonPromotionPlan = {
  links: RadarAmazonPromotionLink[];
  /** §9 · o handoff precisa saber que haverá link monetizado. */
  affiliateDisclosureRequired: boolean;
  /** §3 · os três números, para a leitura poder provar de onde os links vêm. */
  source: { observed: number; eligible: number; shortlist: number };
};

/**
 * ===== §1, §2 e §3 · O PLANO, A PARTIR DA SHORTLIST =====
 *
 * `selection` já é a decisão editorial — ela saiu dos elegíveis, que saíram do
 * bruto. Passar o universo aqui produziria 59 links num artigo de 6 produtos.
 */
export function buildRadarAmazonPromotionPlan(input: {
  intent: RadarAmazonEditorialIntentType;
  selection: RadarAmazonSelection;
  /** O universo, só para recuperar a URL e o título observados de cada ASIN. */
  universe: readonly RadarAmazonUniverseEntry[];
}): RadarAmazonPromotionPlan {
  const porAsin = new Map(input.universe.map(produto => [produto.asin, produto]));
  const teto = TETO_POR_INTENCAO[input.intent] ?? null;

  const escolhidos = teto === null
    ? input.selection.candidates
    : input.selection.candidates.slice(0, teto);

  const links = escolhidos.map((candidato, indice) => {
    const produto = porAsin.get(candidato.asin);
    const nome = produto?.title || candidato.title;

    return RadarAmazonPromotionLinkSchema.parse({
      asin: candidato.asin,
      productName: nome,
      amazonUrl: radarAmazonCleanProductUrl(candidato.asin, produto?.url),
      suggestedAnchor: ancoraDoProduto(nome),
      suggestedButtonLabel: "Ver preço na Amazon",
      placement: lugarDoLink(input.intent, indice + 1, escolhidos.length),
      linkFormat: formatoDoLink(input.intent),
      affiliateReady: true,
      relPolicy: RADAR_AMAZON_REL_POLICY,
    });
  });

  return {
    links,
    /*
     * §9 · A DIVULGAÇÃO É EXIGIDA ONDE HÁ LINK, e não onde há intenção.
     *
     * Um blueprint sem link nenhum não precisa de aviso de afiliado, e carimbar
     * a exigência assim mesmo ensinaria a ignorá-la. O texto do aviso não é
     * escrito aqui: a posição dele é decisão do Planejador/Redator.
     */
    affiliateDisclosureRequired: links.length > 0,
    source: {
      observed: input.selection.observedCount,
      eligible: input.selection.eligibleCount,
      shortlist: input.selection.candidates.length,
    },
  };
}
