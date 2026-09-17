import { z } from "zod";

/**
 * ===== O ALVO EDITORIAL DA AMAZON — AMAZON_EDITORIAL_TARGET_1 · §0 a §20 =====
 *
 * ==================== O QUE O ARTICLEDNA NÃO RESPONDE ====================
 *
 * `skin care nivea` é um território editorial legítimo e uma instrução de
 * pesquisa péssima. Ele pode significar:
 *
 *   o review de UM creme específico
 *   Nivea contra Neutrogena
 *   a comparação de cinco óleos
 *   o top 10 de óleos Nivea
 *   o top 10 de melhor custo-benefício
 *   os melhores para pele seca
 *   um guia de compra
 *   a análise da linha inteira
 *
 * Todos cabem no mesmo ArticleDNA, e cada um exige uma pesquisa diferente, uma
 * amostra diferente e um blueprint diferente. Deixar a Amazon escolher
 * implicitamente significa pagar uma coleta para descobrir, depois, que ela
 * respondeu outra pergunta.
 *
 * ==================== DUAS DECISÕES, E ELAS SÃO SEPARADAS ====================
 *
 *   AmazonEditorialIntent    QUE CONTEÚDO queremos produzir
 *   AmazonResearchTarget     QUAIS PRODUTOS vamos investigar
 *
 * Elas não são a mesma coisa e não se derivam uma da outra. Um `TOP_BEST` pode
 * partir de uma categoria OU de uma lista que a pessoa já tem; um
 * `PRODUCT_COMPARISON` e um `TOP_BEST` podem investigar exatamente os mesmos
 * cinco produtos e produzir artigos completamente diferentes.
 *
 * Fundi-las num campo só — "modo da pesquisa" — obrigaria cada combinação nova a
 * virar um valor novo do enum, e a oitava intenção multiplicaria a tabela.
 *
 * ==================== §0 · O ARTICLEDNA CONTINUA IMUTÁVEL ====================
 *
 * Nada aqui entra no ArticleDNA. Ele segue definindo território, keyword
 * principal, silo, papel e MUST_COVER; isto é a configuração da INVESTIGAÇÃO,
 * que vive no Radar e morre com ela. O link de um produto não é identidade do
 * artigo — é o objeto que esta pesquisa foi olhar.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ========================= §4 e §5 · a intenção editorial ========================= */

export const RADAR_AMAZON_EDITORIAL_INTENTS = [
  "PRODUCT_REVIEW",
  "PRODUCT_VS_PRODUCT",
  "PRODUCT_COMPARISON",
  "TOP_BEST",
  "TOP_VALUE",
  "BEST_FOR_USE_CASE",
  "BUYING_GUIDE",
  "BRAND_LINE_REVIEW",
] as const;
export type RadarAmazonEditorialIntentType = typeof RADAR_AMAZON_EDITORIAL_INTENTS[number];

/**
 * §24 e §25 · O CRITÉRIO DO RANKING É DECLARADO, nunca deduzido do nome.
 *
 * "Top 10 melhores" e "Top 10 custo-benefício" usam a mesma prateleira e
 * raciocínios diferentes. Sem um campo que diga qual, a diferença viraria uma
 * heurística escondida na função de ordenação — e ninguém conseguiria auditar
 * por que um produto ficou em primeiro.
 */
export const RADAR_AMAZON_RANKING_CRITERIA = [
  "BEST_OVERALL",
  "VALUE_FOR_MONEY",
  "POPULARITY",
  "REPUTATION",
  "USE_CASE",
] as const;
export type RadarAmazonRankingCriteria = typeof RADAR_AMAZON_RANKING_CRITERIA[number];

export const RadarAmazonEditorialIntentSchema = z.object({
  type: z.enum(RADAR_AMAZON_EDITORIAL_INTENTS),
  /** Quantos produtos o artigo pretende apresentar. Só os TOP/BEST exigem. */
  desiredCount: z.number().int().min(1).max(50).nullable().default(null),
  /** §14 · a necessidade explícita. Obrigatória em `BEST_FOR_USE_CASE`. */
  useCase: z.string().trim().min(2).max(200).nullable().default(null),
  rankingCriteria: z.enum(RADAR_AMAZON_RANKING_CRITERIA).nullable().default(null),
}).strict();
export type RadarAmazonEditorialIntent = z.infer<typeof RadarAmazonEditorialIntentSchema>;

export const RADAR_AMAZON_INTENT_LABELS: Record<RadarAmazonEditorialIntentType, string> = {
  PRODUCT_REVIEW: "Review de um produto",
  PRODUCT_VS_PRODUCT: "X vs Y",
  PRODUCT_COMPARISON: "Comparação de produtos",
  TOP_BEST: "Top melhores produtos",
  TOP_VALUE: "Top custo-benefício",
  BEST_FOR_USE_CASE: "Melhores para uma necessidade",
  BUYING_GUIDE: "Guia de compra",
  BRAND_LINE_REVIEW: "Linha / marca",
};

/**
 * O CRITÉRIO QUE CADA INTENÇÃO IMPLICA QUANDO NINGUÉM ESCOLHEU.
 *
 * `TOP_VALUE` sem critério declarado é `VALUE_FOR_MONEY` — a intenção JÁ disse
 * isso, e obrigar a pessoa a repetir seria cerimônia. O que não existe é o
 * contrário: um `TOP_VALUE` cujo critério fosse `POPULARITY` ordenaria por
 * popularidade um artigo que promete custo-benefício.
 */
export const RADAR_AMAZON_IMPLIED_CRITERIA: Partial<Record<RadarAmazonEditorialIntentType, RadarAmazonRankingCriteria>> = {
  TOP_BEST: "BEST_OVERALL",
  TOP_VALUE: "VALUE_FOR_MONEY",
  BEST_FOR_USE_CASE: "USE_CASE",
};

/* ============================ §6 · o alvo da pesquisa ============================ */

export const RADAR_AMAZON_TARGET_TYPES = [
  "SPECIFIC_PRODUCT",
  "PRODUCT_PAIR",
  "PRODUCT_LIST",
  "CATEGORY_DISCOVERY",
  "BRAND_LINE",
] as const;
export type RadarAmazonTargetType = typeof RADAR_AMAZON_TARGET_TYPES[number];

export const RADAR_AMAZON_INPUT_TYPES = ["URL", "ASIN", "NAME"] as const;
export type RadarAmazonInputType = typeof RADAR_AMAZON_INPUT_TYPES[number];

/**
 * §19 · A IDENTIDADE CANÔNICA É O ASIN, e nada mais.
 *
 * O nome muda de embalagem em embalagem e a URL carrega rastreamento, variante e
 * campanha. Duas URLs diferentes apontam o mesmo produto o tempo todo; dois
 * produtos com o mesmo nome existem de verdade na loja.
 *
 * `resolvedAsin` nulo NÃO é erro: é uma entrada que ainda não foi resolvida, e a
 * validação é quem decide se isso trava o START.
 */
export const RadarAmazonTargetProductSchema = z.object({
  /** O que a pessoa digitou, preservado. É o que ela reconhece na tela. */
  input: z.string().trim().min(1).max(500),
  inputType: z.enum(RADAR_AMAZON_INPUT_TYPES),
  resolvedAsin: z.string().trim().min(1).max(20).nullable().default(null),
  resolvedTitle: z.string().trim().min(1).max(500).nullable().default(null),
  resolvedImageUrl: z.string().trim().max(2000).nullable().default(null),
}).strict();
export type RadarAmazonTargetProduct = z.infer<typeof RadarAmazonTargetProductSchema>;

export const RadarAmazonResearchTargetSchema = z.object({
  type: z.enum(RADAR_AMAZON_TARGET_TYPES),
  products: z.array(RadarAmazonTargetProductSchema).max(20).default([]),
  /** A consulta de descoberta. Os TOP/GUIA/necessidade partem dela. */
  categoryQuery: z.string().trim().min(2).max(200).nullable().default(null),
  /**
   * ===== 1.1 · §4 e §5 · O TIPO DE PRODUTO QUE ENTRA NO RANKING =====
   *
   * ==================== O QUE UM CAMPO LIVRE NÃO RESOLVE ====================
   *
   * A coleta real com `categoryQuery = "Serum Nivea"` trouxe 59 produtos, e o
   * ranking de custo-benefício comparou:
   *
   *     NIVEA Q10 Sérum Antissinais        ← o que se queria
   *     Dove Sérum Hidratante Corporal     ← outra marca
   *     NIVEA Creme para Mãos              ← outra classe
   *     NIVEA Tônico Facial                ← outra classe
   *
   * "Serum Nivea" é uma boa CONSULTA de busca e uma péssima definição de
   * universo comparável: ela diz o que procurar na loja, não o que o artigo
   * compara. A loja responde por relevância, e relevância inclui vizinhança.
   *
   * Separar os dois campos é o que permite BUSCAR amplo e COMPARAR estreito —
   * sem jogar fora a evidência que veio junto (§3 e §28).
   */
  productClass: z.string().trim().min(2).max(120).nullable().default(null),
  /**
   * §8 · A MARCA AQUI É FILTRO, NÃO FATO DO PRODUTO.
   *
   * O provider não entrega marca estruturada. Este campo diz "compare só o que
   * mostra este nome no título" — uma correspondência textual observável,
   * determinística e declarada como heurística. Ela nunca vira um atributo
   * afirmado sobre o produto.
   */
  brandFilter: z.string().trim().min(1).max(120).nullable().default(null),
  brand: z.string().trim().min(1).max(120).nullable().default(null),
  line: z.string().trim().min(1).max(120).nullable().default(null),
}).strict();
export type RadarAmazonResearchTarget = z.infer<typeof RadarAmazonResearchTargetSchema>;

/**
 * A CONFIGURAÇÃO INTEIRA, como ela é gravada — §18.
 *
 * Um objeto só, dentro do payload da análise que já existe. Uma tabela por
 * intenção criaria oito lugares para a mesma pergunta, e sete deles ficariam
 * vazios em qualquer artigo.
 */
export const RadarAmazonEditorialSetupSchema = z.object({
  intent: RadarAmazonEditorialIntentSchema,
  target: RadarAmazonResearchTargetSchema,
  declaredAt: z.string().min(1),
  declaredBy: z.string().min(1),
}).strict();
export type RadarAmazonEditorialSetup = z.infer<typeof RadarAmazonEditorialSetupSchema>;

/**
 * ===== 1.1 · §19 · A ASSINATURA DA CONFIGURAÇÃO MATERIAL =====
 *
 * ==================== O QUE ELA IMPEDE ====================
 *
 * Trocar `TOP_BEST` por `TOP_VALUE` na tela, sobre a coleta que já está
 * gravada, produzia um blueprint novo sobre evidência velha — com a aparência
 * de ter sido pesquisado assim. A corrida não pode fingir corresponder a uma
 * configuração que não foi a dela.
 *
 * ==================== O QUE É "MATERIAL" ====================
 *
 * O que MUDA a pesquisa ou o ranking: a intenção, o tipo de alvo, a classe de
 * produto, o filtro de marca, a consulta, a marca/linha, a necessidade, o
 * critério e os ASINs escolhidos.
 *
 * `desiredCount` NÃO entra. Ele corta a shortlist e não muda nem a coleta nem a
 * ordem: pedir 6 em vez de 10 sobre a mesma evidência é a mesma investigação
 * mostrando menos, e invalidar a corrida por isso cobraria uma coleta nova para
 * encurtar uma lista.
 */
export function radarAmazonSetupSignature(setup: {
  intent: RadarAmazonEditorialIntent;
  target: RadarAmazonResearchTarget;
}): string {
  const normalizar = (valor: string | null | undefined) =>
    (valor || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

  const base = [
    setup.intent.type,
    setup.intent.rankingCriteria || RADAR_AMAZON_IMPLIED_CRITERIA[setup.intent.type] || "",
    normalizar(setup.intent.useCase),
    setup.target.type,
    normalizar(setup.target.categoryQuery),
    normalizar(setup.target.productClass),
    normalizar(setup.target.brandFilter),
    normalizar(setup.target.brand),
    normalizar(setup.target.line),
    radarAmazonDedupeProducts(setup.target.products)
      .map(item => item.resolvedAsin || `texto:${normalizar(item.input)}`)
      .sort()
      .join(","),
  ].join("|");

  let hash = 0x811c9dc5;
  for (let indice = 0; indice < base.length; indice += 1) {
    hash ^= base.charCodeAt(indice);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `amzsetup:${hash.toString(16).padStart(8, "0")}`;
}

/**
 * §18 · A CONFIGURAÇÃO GRAVADA CORRESPONDE À QUE ESTÁ NA TELA?
 *
 * `true` quando a corrida pode ser lida com esta configuração. `false` quando a
 * tela mostraria uma decisão que a evidência não sustenta — e aí o caminho é
 * uma coleta nova, não um blueprint novo.
 */
export function radarAmazonSetupMatchesRun(
  gravado: { intent: RadarAmazonEditorialIntent; target: RadarAmazonResearchTarget } | null,
  atual: { intent: RadarAmazonEditorialIntent; target: RadarAmazonResearchTarget } | null,
): boolean {
  if (!gravado || !atual) return true;
  return radarAmazonSetupSignature(gravado) === radarAmazonSetupSignature(atual);
}

/* ============================ §7 · a leitura da entrada ============================ */

const ASIN = /^[A-Z0-9]{10}$/;

/**
 * §19 · O ASIN DENTRO DE UMA URL DA AMAZON.
 *
 * As formas que a loja realmente usa. Uma varredura genérica por "dez
 * caracteres alfanuméricos" pegaria o id de campanha do `?ref=` e devolveria um
 * ASIN que não existe — pior do que não resolver, porque parece resolvido.
 */
const CAMINHOS_DE_ASIN = [
  /\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  /\/product\/([A-Z0-9]{10})(?:[/?#]|$)/i,
  /[?&]asin=([A-Z0-9]{10})(?:&|$)/i,
];

export function radarAmazonAsinFromUrl(valor: string): string | null {
  const bruto = (valor || "").trim();
  if (!bruto) return null;
  for (const padrao of CAMINHOS_DE_ASIN) {
    const achado = bruto.match(padrao);
    if (achado?.[1]) return achado[1].toUpperCase();
  }
  return null;
}

const pareceUrl = (valor: string) => /^https?:\/\//i.test(valor) || /^www\./i.test(valor);

/**
 * §7 e §20 · UMA LINHA VIRA UM ALVO — e a leitura é de FORMA, não de rede.
 *
 * URL e ASIN se identificam sozinhos e resolvem sem chamada nenhuma. Nome não:
 * ele precisa de descoberta paga, e por isso sai daqui com `resolvedAsin` nulo e
 * uma ação humana explícita pela frente.
 */
export function radarAmazonParseTargetLine(valor: string): RadarAmazonTargetProduct | null {
  const bruto = (valor || "").trim();
  if (!bruto) return null;

  if (pareceUrl(bruto)) {
    const asin = radarAmazonAsinFromUrl(bruto);
    return RadarAmazonTargetProductSchema.parse({
      input: bruto.slice(0, 500),
      inputType: "URL",
      /*
       * UMA URL SEM ASIN LEGÍVEL continua sendo URL, e não vira nome.
       *
       * Reclassificá-la mandaria a página inteira para a busca da loja como se
       * fosse o nome de um produto, e a descoberta voltaria com qualquer coisa.
       */
      resolvedAsin: asin,
    });
  }

  const possivelAsin = bruto.toUpperCase();
  /*
   * O ASIN SOLTO PRECISA TER DÍGITO OU COMEÇAR COM B.
   *
   * Sem isso, "HIDRATANTE" — dez letras — entraria como identidade canônica de
   * um produto que ninguém escolheu.
   */
  if (ASIN.test(possivelAsin) && /\d/.test(possivelAsin)) {
    return RadarAmazonTargetProductSchema.parse({
      input: bruto, inputType: "ASIN", resolvedAsin: possivelAsin,
    });
  }

  return RadarAmazonTargetProductSchema.parse({ input: bruto.slice(0, 500), inputType: "NAME" });
}

/**
 * §7 e §11 · O CAMPO MULTILINHA — um produto, URL ou ASIN por linha.
 *
 * O dedupe é por ASIN e acontece aqui: a mesma URL colada duas vezes, ou a URL e
 * o ASIN do mesmo produto, são UM alvo. Deixar passar faria um "comparativo de 3
 * produtos" com dois produtos e uma repetição.
 *
 * Linhas ainda não resolvidas não têm como ser deduplicadas por identidade — o
 * texto idêntico é o melhor critério disponível, e é o que se usa.
 */
export function radarAmazonParseTargetInput(texto: string): RadarAmazonTargetProduct[] {
  const linhas = (texto || "").split(/\r?\n/);
  const porAsin = new Map<string, RadarAmazonTargetProduct>();
  const porTexto = new Map<string, RadarAmazonTargetProduct>();
  const ordem: RadarAmazonTargetProduct[] = [];

  for (const linha of linhas) {
    const alvo = radarAmazonParseTargetLine(linha);
    if (!alvo) continue;

    if (alvo.resolvedAsin) {
      if (porAsin.has(alvo.resolvedAsin)) continue;
      porAsin.set(alvo.resolvedAsin, alvo);
    } else {
      const chave = alvo.input.toLowerCase();
      if (porTexto.has(chave)) continue;
      porTexto.set(chave, alvo);
    }
    ordem.push(alvo);
  }

  return ordem;
}

/** O alvo com os produtos deduplicados por ASIN, depois de uma resolução. */
export function radarAmazonDedupeProducts(produtos: readonly RadarAmazonTargetProduct[]): RadarAmazonTargetProduct[] {
  const vistos = new Set<string>();
  const saida: RadarAmazonTargetProduct[] = [];
  for (const produto of produtos) {
    const chave = produto.resolvedAsin || `texto:${produto.input.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(produto);
  }
  return saida;
}

/* ============================== §17 · a validação ============================== */

/**
 * O QUE CADA INTENÇÃO EXIGE — e o START fica desabilitado até fechar.
 *
 * A tabela é declarativa de propósito. A versão em `if` encadeado foi tentada
 * primeiro e tinha o problema de sempre: a regra do sétimo caso ficava escrita
 * longe da do primeiro, e as duas discordavam sobre o que "lista" significa.
 */
type Exigencia = {
  target: RadarAmazonTargetType;
  produtosResolvidos: { minimo: number; maximo: number | null } | null;
  exigeCategoria: boolean;
  exigeQuantidade: boolean;
  exigeNecessidade: boolean;
  exigeMarca: boolean;
  /**
   * ===== 1.1 · §5 · RANKING EXIGE TIPO DE PRODUTO =====
   *
   * Um ranking compara coisas entre si, e comparar exige que elas sirvam à
   * mesma decisão de compra. A coleta real provou o que acontece sem isto: um
   * `TOP_BEST` com `"Nivea"` produziu "os 4 melhores" entre hidratante labial,
   * sabonete íntimo, creme de mãos e sérum antissinais.
   *
   * O guia de compra NÃO exige: ele mapeia critérios de uma categoria ampla e
   * não promete ranking. A diferença é exatamente a promessa.
   */
  exigeTipoDeProduto: boolean;
};

export const RADAR_AMAZON_INTENT_REQUIREMENTS: Record<RadarAmazonEditorialIntentType, Exigencia> = {
  PRODUCT_REVIEW: { target: "SPECIFIC_PRODUCT", produtosResolvidos: { minimo: 1, maximo: 1 }, exigeCategoria: false, exigeQuantidade: false, exigeNecessidade: false, exigeMarca: false, exigeTipoDeProduto: false },
  PRODUCT_VS_PRODUCT: { target: "PRODUCT_PAIR", produtosResolvidos: { minimo: 2, maximo: 2 }, exigeCategoria: false, exigeQuantidade: false, exigeNecessidade: false, exigeMarca: false, exigeTipoDeProduto: false },
  PRODUCT_COMPARISON: { target: "PRODUCT_LIST", produtosResolvidos: { minimo: 3, maximo: null }, exigeCategoria: false, exigeQuantidade: false, exigeNecessidade: false, exigeMarca: false, exigeTipoDeProduto: false },
  TOP_BEST: { target: "CATEGORY_DISCOVERY", produtosResolvidos: null, exigeCategoria: true, exigeQuantidade: true, exigeNecessidade: false, exigeMarca: false, exigeTipoDeProduto: true },
  TOP_VALUE: { target: "CATEGORY_DISCOVERY", produtosResolvidos: null, exigeCategoria: true, exigeQuantidade: true, exigeNecessidade: false, exigeMarca: false, exigeTipoDeProduto: true },
  BEST_FOR_USE_CASE: { target: "CATEGORY_DISCOVERY", produtosResolvidos: null, exigeCategoria: true, exigeQuantidade: true, exigeNecessidade: true, exigeMarca: false, exigeTipoDeProduto: true },
  /* §5 · o guia mapeia critérios de uma categoria ampla; ele não ranqueia. */
  BUYING_GUIDE: { target: "CATEGORY_DISCOVERY", produtosResolvidos: null, exigeCategoria: true, exigeQuantidade: false, exigeNecessidade: false, exigeMarca: false, exigeTipoDeProduto: false },
  /* §6 · a linha é brand-wide POR DESENHO — e por isso não promete ranking. */
  BRAND_LINE_REVIEW: { target: "BRAND_LINE", produtosResolvidos: null, exigeCategoria: false, exigeQuantidade: false, exigeNecessidade: false, exigeMarca: true, exigeTipoDeProduto: false },
};

/** §5 · o código que a UI usa para pedir o tipo de produto. */
export const RADAR_AMAZON_NEEDS_PRODUCT_CLASS = "CONFIG_NEEDS_PRODUCT_CLASS" as const;

/** A frase que a tela mostra — uma só, para a mensagem não divergir. */
export const RADAR_AMAZON_PRODUCT_CLASS_ISSUE =
  "Escolha também qual tipo de produto será comparado: um ranking precisa comparar coisas que servem à mesma decisão de compra.";

export type RadarAmazonSetupValidation = {
  valid: boolean;
  /** O primeiro motivo, para o botão. `null` quando dá para começar. */
  blockedReason: string | null;
  /** Todos os motivos, para a configuração. */
  issues: string[];
  /** Os produtos que já têm identidade canônica. */
  resolvedProducts: RadarAmazonTargetProduct[];
  /** As entradas por NOME que ainda precisam de uma resolução humana. */
  pendingResolution: RadarAmazonTargetProduct[];
};

export function radarAmazonValidateSetup(input: {
  intent: RadarAmazonEditorialIntent | null;
  target: RadarAmazonResearchTarget | null;
}): RadarAmazonSetupValidation {
  const issues: string[] = [];

  if (!input.intent) {
    return {
      valid: false,
      blockedReason: "Escolha o que você quer produzir antes de pesquisar a Amazon.",
      issues: ["A intenção editorial não foi escolhida."],
      resolvedProducts: [], pendingResolution: [],
    };
  }

  const exigencia = RADAR_AMAZON_INTENT_REQUIREMENTS[input.intent.type];
  const alvo = input.target;
  const produtos = radarAmazonDedupeProducts(alvo?.products || []);
  const resolvidos = produtos.filter(item => Boolean(item.resolvedAsin));
  const pendentes = produtos.filter(item => !item.resolvedAsin);

  if (!alvo) {
    issues.push("O alvo da pesquisa não foi configurado.");
  } else if (alvo.type !== exigencia.target) {
    issues.push(`"${RADAR_AMAZON_INTENT_LABELS[input.intent.type]}" pesquisa ${RADAR_AMAZON_TARGET_LABELS[exigencia.target].toLowerCase()}, e o alvo configurado é outro.`);
  }

  if (exigencia.produtosResolvidos) {
    const { minimo, maximo } = exigencia.produtosResolvidos;
    if (resolvidos.length < minimo) {
      issues.push(minimo === 1
        ? "Informe o produto — link, ASIN ou nome — e resolva a identidade dele antes de pesquisar."
        : `Esta escolha precisa de ${minimo} produto(s) com identidade resolvida; há ${resolvidos.length}.`);
    }
    if (maximo !== null && resolvidos.length > maximo) {
      issues.push(`Esta escolha aceita no máximo ${maximo} produto(s); há ${resolvidos.length}.`);
    }

    /*
     * §10 · O MESMO PRODUTO DOS DOIS LADOS NÃO É COMPARAÇÃO.
     *
     * O dedupe por ASIN já reduziria dois iguais a um — e o resultado seria a
     * mensagem errada ("falta um produto") para o problema certo. Este aviso
     * olha a lista ORIGINAL para poder dizer o que de fato aconteceu.
     */
    const asinsOriginais = (alvo?.products || []).map(item => item.resolvedAsin).filter(Boolean);
    if (new Set(asinsOriginais).size < asinsOriginais.length) {
      issues.push("O mesmo produto foi informado mais de uma vez; cada lado precisa de um produto diferente.");
    }
  }

  if (exigencia.exigeCategoria && !(alvo?.categoryQuery || "").trim()) {
    issues.push("Informe a categoria ou a consulta que a Amazon vai usar para descobrir os produtos.");
  }
  if (exigencia.exigeQuantidade && !input.intent.desiredCount) {
    issues.push("Informe quantos produtos o artigo pretende apresentar.");
  }
  if (exigencia.exigeNecessidade && !(input.intent.useCase || "").trim()) {
    issues.push('Informe a necessidade que o ranking atende — por exemplo "pele seca".');
  }
  if (exigencia.exigeMarca && !(alvo?.brand || "").trim()) {
    issues.push("Informe a marca ou a linha que será analisada.");
  }

  /*
   * ===== 1.1 · §5 · MARCA SOZINHA NÃO SUSTENTA UM RANKING =====
   *
   * A coleta real com `TOP_BEST` e `"Nivea"` trouxe hidratante labial, sabonete
   * íntimo, creme de mãos e sérum antissinais, e o artigo prometia "os 4
   * melhores". Melhores para quê? Não há decisão de compra em que essas quatro
   * coisas concorram.
   *
   * Quem quer "os melhores produtos Nivea em geral" tem um tipo próprio para
   * isso — `BRAND_LINE_REVIEW` (§6) —, e ele não promete ranking transversal.
   */
  if (exigencia.exigeTipoDeProduto && !(alvo?.productClass || "").trim()) {
    issues.push(RADAR_AMAZON_PRODUCT_CLASS_ISSUE);
  }

  /*
   * §20 · NOME PENDENTE TRAVA, e trava dizendo o que falta.
   *
   * Uma entrada por nome sem ASIN é uma pesquisa que não sabe de qual SKU está
   * falando. Deixá-la passar gastaria a coleta sobre um produto escolhido pela
   * relevância da loja — que é precisamente a decisão que este gate tirou do
   * automático.
   */
  if (exigencia.produtosResolvidos && pendentes.length) {
    issues.push(`${pendentes.length} entrada(s) por nome ainda não foram resolvidas para um produto da loja.`);
  }

  return {
    valid: issues.length === 0,
    blockedReason: issues[0] || null,
    issues,
    resolvedProducts: resolvidos,
    pendingResolution: pendentes,
  };
}

export const RADAR_AMAZON_TARGET_LABELS: Record<RadarAmazonTargetType, string> = {
  SPECIFIC_PRODUCT: "Um produto específico",
  PRODUCT_PAIR: "Dois produtos",
  PRODUCT_LIST: "Uma lista de produtos",
  CATEGORY_DISCOVERY: "Uma categoria, descoberta pela Amazon",
  BRAND_LINE: "Uma marca ou linha",
};

/** O alvo em branco que cada intenção pede — o que a UI monta ao trocar a escolha. */
export function radarAmazonEmptyTargetFor(intent: RadarAmazonEditorialIntentType): RadarAmazonResearchTarget {
  return RadarAmazonResearchTargetSchema.parse({ type: RADAR_AMAZON_INTENT_REQUIREMENTS[intent].target });
}

/* ========================= §21 · o plano de consulta ========================= */

export type RadarAmazonPlannedQuery = {
  text: string;
  origin: "PRIMARY_KEYWORD" | "TARGET_PRODUCT" | "CATEGORY_QUERY" | "BRAND_LINE";
  reason: string;
};

/**
 * ===== §21 · O QUE A AMAZON VAI PROCURAR, DE VERDADE =====
 *
 * Antes deste gate o plano era sempre a keyword principal do ArticleDNA. Num
 * review isso é quase garantia de amostra errada: "skin care nivea" devolve a
 * prateleira inteira da marca, e o produto que o artigo vai avaliar pode nem
 * aparecer nas vinte primeiras posições.
 *
 * A consulta agora sai do ALVO. A keyword principal continua existindo como
 * reserva — ela é a única coisa que sempre existe.
 */
export function radarAmazonTargetQueries(input: {
  intent: RadarAmazonEditorialIntent;
  target: RadarAmazonResearchTarget;
  primaryKeyword: string | null;
}): RadarAmazonPlannedQuery[] {
  const alvo = input.target;
  const categoria = (alvo.categoryQuery || "").trim();
  const marca = [alvo.brand, alvo.line].map(item => (item || "").trim()).filter(Boolean).join(" ");
  const produtos = radarAmazonDedupeProducts(alvo.products).filter(item => item.resolvedAsin);

  /*
   * O PRODUTO RESOLVIDO É PESQUISADO PELO QUE ELE É, não pelo ASIN.
   *
   * O endpoint de produtos recebe `keyword` — ele busca a prateleira. Mandar o
   * ASIN como palavra de busca devolveria, na melhor hipótese, o próprio
   * produto sozinho e nenhum contexto competitivo, que é metade do que um
   * review precisa.
   */
  const textoDoProduto = (indice: number) => {
    const produto = produtos[indice];
    return (produto?.resolvedTitle || produto?.input || "").trim();
  };

  switch (input.intent.type) {
    case "PRODUCT_REVIEW": {
      const texto = textoDoProduto(0);
      return texto ? [{
        text: texto,
        origin: "TARGET_PRODUCT",
        reason: "O produto que este artigo avalia, e a prateleira em volta dele.",
      }] : [];
    }
    case "PRODUCT_VS_PRODUCT": {
      return [0, 1].map(indice => textoDoProduto(indice)).filter(Boolean).map(texto => ({
        text: texto,
        origin: "TARGET_PRODUCT" as const,
        reason: "Um dos dois lados da comparação, com o contexto comercial dele.",
      }));
    }
    case "PRODUCT_COMPARISON": {
      /*
       * UMA CONSULTA POR PRODUTO CUSTA UMA CONSULTA POR PRODUTO.
       *
       * Numa comparação de dez, isso são dez coletas pagas. O teto existe para
       * a conta não crescer sem ninguém ter decidido que ela devia crescer.
       */
      return produtos.slice(0, 5).map(produto => ({
        text: (produto.resolvedTitle || produto.input).trim(),
        origin: "TARGET_PRODUCT" as const,
        reason: "Um dos produtos comparados, com o contexto comercial dele.",
      }));
    }
    case "TOP_BEST":
    case "TOP_VALUE":
    case "BEST_FOR_USE_CASE":
    case "BUYING_GUIDE": {
      if (!categoria) return [];
      const consultas: RadarAmazonPlannedQuery[] = [{
        text: categoria,
        origin: "CATEGORY_QUERY",
        reason: "A categoria que o artigo cobre, como as pessoas a procuram na loja.",
      }];
      /*
       * A NECESSIDADE VIRA UMA SEGUNDA CONSULTA, não um filtro.
       *
       * A loja não expõe atributo de "pele seca" nesta coleta. O que dá para
       * fazer honestamente é procurar como as pessoas procuram — e declarar,
       * no blueprint, que a adequação não foi verificada produto a produto.
       */
      const necessidade = (input.intent.useCase || "").trim();
      if (input.intent.type === "BEST_FOR_USE_CASE" && necessidade) {
        consultas.push({
          text: `${categoria} ${necessidade}`.slice(0, 200),
          origin: "CATEGORY_QUERY",
          reason: "A categoria somada à necessidade declarada, como a busca é feita na loja.",
        });
      }
      return consultas;
    }
    case "BRAND_LINE_REVIEW": {
      if (!marca) return [];
      return [{
        text: marca,
        origin: "BRAND_LINE",
        reason: "A marca ou linha que o artigo analisa.",
      }];
    }
    default:
      return [];
  }
}

/* ========================= §22 · a consulta do apoio ========================= */

/**
 * ===== §22 · UMA CAMADA DE APOIO, E ELA OLHA O MESMO ALVO =====
 *
 * O apoio do Google continua sendo UM e continua sendo apoio: ele traz intenção,
 * perguntas e vocabulário de busca. O que muda é que ele deixa de perguntar
 * sobre a keyword do artigo quando a investigação é sobre outra coisa.
 *
 * Num `PRODUCT_VS_PRODUCT`, "Produto A vs Produto B" é literalmente o que as
 * pessoas digitam — e é essa SERP que mostra como a comparação é feita.
 *
 * A derivação é DETERMINÍSTICA: a mesma configuração produz a mesma consulta,
 * sempre. Sem isso, duas execuções da mesma investigação pagariam duas leituras
 * diferentes do Google e ninguém saberia qual delas o blueprint usou.
 */
export function radarAmazonSupportQuery(input: {
  intent: RadarAmazonEditorialIntent;
  target: RadarAmazonResearchTarget;
  primaryKeyword: string | null;
}): string | null {
  const alvo = input.target;
  const categoria = (alvo.categoryQuery || "").trim();
  const marca = [alvo.brand, alvo.line].map(item => (item || "").trim()).filter(Boolean).join(" ");
  const produtos = radarAmazonDedupeProducts(alvo.products).filter(item => item.resolvedAsin);
  const nome = (indice: number) => (produtos[indice]?.resolvedTitle || produtos[indice]?.input || "").trim();
  const principal = (input.primaryKeyword || "").trim();

  const derivada = (() => {
    switch (input.intent.type) {
      case "PRODUCT_REVIEW":
        return nome(0) ? `${nome(0)} review` : null;
      case "PRODUCT_VS_PRODUCT":
        return nome(0) && nome(1) ? `${nome(0)} vs ${nome(1)}` : null;
      case "PRODUCT_COMPARISON":
        return categoria || (nome(0) ? `comparativo ${nome(0)}` : null);
      case "TOP_BEST":
        return categoria ? `melhores ${categoria}` : null;
      case "TOP_VALUE":
        return categoria ? `${categoria} custo benefício` : null;
      case "BEST_FOR_USE_CASE": {
        const necessidade = (input.intent.useCase || "").trim();
        return categoria && necessidade ? `melhores ${categoria} para ${necessidade}` : categoria || null;
      }
      case "BUYING_GUIDE":
        return categoria ? `como escolher ${categoria}` : null;
      case "BRAND_LINE_REVIEW":
        return marca || null;
      default:
        return null;
    }
  })();

  /* A keyword principal é a reserva — é a única coisa que sempre existe. */
  const escolhida = (derivada || principal || "").trim();
  return escolhida ? escolhida.slice(0, 200) : null;
}
