/**
 * ===== O BLUEPRINT COMPETITIVO CANÔNICO — RADAR_BLUEPRINT_CANONICAL_1 =====
 *
 * Três perfis, uma ferramenta. GOOGLE, YOUTUBE e AMAZON produzem radiografias
 * competitivas diferentes da MESMA intenção, e quem opera precisa reconhecer a
 * mesma ferramenta nos três — mudando o que se lê, não como se lê.
 *
 * ================= POR QUE UM ENVELOPE, E NÃO TRÊS MÓDULOS =================
 *
 * Três contratos independentes divergiriam na primeira semana: um ganharia
 * `limitations`, outro chamaria de `caveats`, o terceiro esqueceria a
 * proveniência. Quem consome — Relatório hoje, Planejador depois — teria de
 * aprender três dialetos para a mesma pergunta.
 *
 * E um schema único com tudo opcional seria pior: `products` nulo num artigo de
 * vídeo, `shorts` nulo num artigo comercial, e nenhuma forma de saber se o nulo
 * é ausência de coleta ou ausência de sentido.
 *
 * Envelope comum + união discriminada por perfil resolve os dois: o que é comum
 * é comum, e cada perfil só carrega o que existe nele.
 *
 * ================ A SEPARAÇÃO QUE NÃO PODE SER RELAXADA ================
 *
 * OBSERVED é o que a evidência mostrou. RECOMMENDED é o que decidimos a partir
 * disso. São objetos DIFERENTES no contrato, não um campo `isRecommendation`,
 * porque um booleano se perde numa projeção e o tipo não.
 *
 * O caso que obriga: "os concorrentes usam este gancho" é falso quando a SERP
 * do YouTube não abre vídeo nenhum — ela mostra TÍTULO. Dizer isso como
 * observação inventaria uma leitura que ninguém fez. O contrato torna o erro
 * impossível de escrever sem perceber.
 *
 * ===================== O QUE ESTE CONTRATO NÃO GUARDA =====================
 *
 * Matéria-prima. Universo competitivo, resultados do provider, snapshots de
 * SERP e transcrições têm autoridade própria — e a auditoria do banco mostrou
 * o preço de esquecer isso: 126.656 dos 144.440 bytes de uma fotografia eram a
 * corrida copiada byte a byte. Aqui entram REFERÊNCIAS.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import { z } from "zod";
import { RADAR_RESEARCH_PROFILES, RADAR_RESEARCH_SOURCE_ROLES } from "./research-profile.ts";
import { RADAR_RESEARCH_SOURCES } from "./search-mode.ts";

export const RADAR_BLUEPRINT_SCHEMA_VERSION = 1 as const;

/* ================== §6 e §16 · o grau de cada afirmação ================== */

/**
 * DE ONDE UMA AFIRMAÇÃO VEM — e é isto que impede review de virar fato.
 *
 *   OBSERVED_SERP      a busca mostrou. Conferível na amostra.
 *   BUYER_PERCEPTION   um comprador relatou. Sustenta "compradores dizem",
 *                      nunca "o produto faz".
 *   DERIVED            nós concluímos a partir do que foi observado.
 *
 * `BUYER_PERCEPTION` existe porque a Amazon vai trazer milhares de opiniões, e
 * a tentação de lê-las como especificação é enorme: "não hidrata o suficiente"
 * é experiência de uma pele, não medição de um produto.
 */
export const RADAR_EVIDENCE_GRADES = ["OBSERVED_SERP", "BUYER_PERCEPTION", "DERIVED"] as const;
export const RadarEvidenceGradeSchema = z.enum(RADAR_EVIDENCE_GRADES);
export type RadarEvidenceGrade = typeof RADAR_EVIDENCE_GRADES[number];

export const RADAR_EVIDENCE_GRADE_LABELS: Record<RadarEvidenceGrade, string> = {
  OBSERVED_SERP: "observado na busca",
  BUYER_PERCEPTION: "relatado por compradores",
  DERIVED: "recomendação nossa",
};

/**
 * UM SINAL OBSERVADO — e ele carrega o que o sustenta.
 *
 * `evidence` não é decoração: sem ela, "os títulos usam rotina" é uma frase que
 * ninguém consegue conferir nem contestar. Com "13 de 38 títulos", vira dado.
 */
export const RadarObservedSignalSchema = z.object({
  id: z.string().min(1),
  /** O que foi visto, em português. */
  statement: z.string().min(1),
  grade: RadarEvidenceGradeSchema,
  /** O que sustenta a afirmação — contagem, posição, faixa. */
  evidence: z.string().min(1),
  /** Quantas ocorrências, quando a contagem faz sentido. */
  count: z.number().int().nonnegative().nullable().default(null),
}).strict();
export type RadarObservedSignal = z.infer<typeof RadarObservedSignalSchema>;

/**
 * UMA RECOMENDAÇÃO — e ela aponta para o sinal que a originou.
 *
 * `sourceSignal` obrigatório é a trava: uma recomendação sem origem é palpite,
 * e palpite chegando ao Planejador com o mesmo peso de uma contagem de SERP é
 * exatamente o que este contrato existe para impedir.
 */
export const RadarRecommendationSchema = z.object({
  id: z.string().min(1),
  /** O que fazer. */
  statement: z.string().min(1),
  /** Para quê. Sem isto, a recomendação vira instrução sem critério. */
  objective: z.string().min(1),
  /** O sinal observado que a sustenta. Nunca vazio. */
  sourceSignal: z.string().min(1),
}).strict();
export type RadarBlueprintRecommendation = z.infer<typeof RadarRecommendationSchema>;

/* ================== §2 · as referências, nunca as cópias ================== */

/**
 * A REFERÊNCIA À PESQUISA — o que substitui a matéria-prima copiada.
 *
 * Identidade e assinatura juntas: `runId` sozinho não prova que a coleta é a
 * mesma, porque uma corrida refeita sob o mesmo nome passaria. As contagens
 * vêm congeladas para a tela não precisar reabrir a amostra só para dizer
 * "38 vídeos".
 */
export const RadarResearchRefSchema = z.object({
  source: z.enum(RADAR_RESEARCH_SOURCES),
  role: z.enum(RADAR_RESEARCH_SOURCE_ROLES),
  /** `runId` da coleta, ou o id do snapshot de SERP. */
  ref: z.string().min(1),
  /** A assinatura que prova identidade. `null` quando a fonte não tem uma. */
  fingerprint: z.string().min(1).nullable().default(null),
  collectedAt: z.string().min(1).nullable().default(null),
  /** Tamanho da amostra, congelado. Quatro números, não a amostra. */
  sampleSize: z.number().int().nonnegative().default(0),
}).strict();
export type RadarResearchRef = z.infer<typeof RadarResearchRefSchema>;

/* ========================= o perfil GOOGLE — §9 ========================= */

/**
 * ============ UMA SEÇÃO DO ARTIGO — 1.1 · §7 ============
 *
 * "H2: oleosidade" não diz a ninguém o que escrever. O que uma seção precisa
 * carregar é o que ela RESOLVE, a pergunta que responde, os conceitos que
 * precisa tocar e a evidência que ela vai exigir de quem escrever.
 *
 * E o título dela é DIREÇÃO, nunca o heading do concorrente: copiar a
 * arquitetura da amostra entrega o problema que a investigação veio resolver.
 */
export const RadarSectionDirectionSchema = z.object({
  order: z.number().int().positive(),
  /** A direção do heading. Não é o heading de ninguém. */
  headingDirection: z.string().min(1),
  objective: z.string().min(1),
  /** A pergunta observada que esta seção fecha. `null` quando não fecha uma. */
  answersQuestion: z.string().min(1).nullable().default(null),
  /** Conceitos e entidades que precisam aparecer aqui. */
  mustCover: z.array(z.string().min(1)).default([]),
  /** O que esta seção vai precisar sustentar com fonte. */
  evidenceNeeded: z.string().min(1).nullable().default(null),
  sourceSignal: z.string().min(1),
}).strict();
export type RadarSectionDirection = z.infer<typeof RadarSectionDirectionSchema>;

/**
 * ============ UMA AFIRMAÇÃO QUE PRECISA DE LASTRO — §8 ============
 *
 * O pipeline do Google já separa afirmação, evidência factual, conflito e
 * necessidade de especialista. O que faltava era entregar isso como INSTRUÇÃO:
 * o que sustentar, com que tipo de evidência, e quando um profissional é
 * mesmo necessário.
 *
 * `sourceTypeNeeded` é TIPO de fonte, nunca o domínio que o concorrente citou.
 * Recomendar "cite a clínica X porque três concorrentes citaram" transformaria
 * observação de mercado em endosso editorial.
 */
export const RadarAuthorityNeedSchema = z.object({
  claim: z.string().min(1),
  evidenceType: z.string().min(1),
  sourceTypeNeeded: z.string().min(1),
  /** Por que um especialista é necessário. `null` quando não é. */
  specialistReason: z.string().min(1).nullable().default(null),
  ymylRelevant: z.boolean().default(false),
  sourceSignal: z.string().min(1),
}).strict();
export type RadarAuthorityNeed = z.infer<typeof RadarAuthorityNeedSchema>;

/**
 * ============ UM LINK INTERNO, EDITORIALMENTE — §9 ============
 *
 * O grafo é do Arquiteto e continua sendo. Isto não o recria: traduz a
 * aplicação que o Radar já fundamentou para quem vai escrever — alvo, função,
 * contexto de inserção e direção da âncora.
 */
export const RadarInternalLinkDirectionSchema = z.object({
  target: z.string().min(1),
  role: z.string().min(1),
  /** Onde o link cabe dentro deste texto. */
  placementContext: z.string().min(1),
  anchorDirection: z.string().min(1),
  occurrences: z.number().int().nonnegative(),
  sourceSignal: z.string().min(1),
}).strict();
export type RadarInternalLinkDirection = z.infer<typeof RadarInternalLinkDirectionSchema>;

const GoogleObservedSchema = z.object({
  comparablePages: z.number().int().nonnegative(),
  /** A intenção, como o fundamento declarou e como a busca a mostra. */
  intent: z.array(RadarObservedSignalSchema).default([]),
  /** Padrões estruturais que a maioria da amostra repete. */
  recurringPatterns: z.array(RadarObservedSignalSchema).default([]),
  /** Conceitos que se repetem entre os concorrentes. */
  recurrentConcepts: z.array(RadarObservedSignalSchema).default([]),
  /** Perguntas que a busca faz — PAA, PAS, refinamentos. */
  questions: z.array(RadarObservedSignalSchema).default([]),
  entities: z.array(RadarObservedSignalSchema).default([]),
  /** Refinamentos e reformulações que a busca oferece. */
  refinementSignals: z.array(RadarObservedSignalSchema).default([]),
  /** O formato que a amostra usa para responder esta intenção. */
  formatSignals: z.array(RadarObservedSignalSchema).default([]),
  /** Sinais de E-E-A-T e afirmações que pedem sustentação. */
  authoritySignals: z.array(RadarObservedSignalSchema).default([]),
  /** Fontes externas citadas pelos concorrentes. Uso observado, não endosso. */
  sourceSignals: z.array(RadarObservedSignalSchema).default([]),
  /** O que o grafo aprovado relaciona a este artigo. */
  internalLinkSignals: z.array(RadarObservedSignalSchema).default([]),
  gaps: z.array(RadarObservedSignalSchema).default([]),
  /** Onde o que o mercado repete diverge do que a evidência permite afirmar. */
  conflicts: z.array(RadarObservedSignalSchema).default([]),
  multimediaSignals: z.array(RadarObservedSignalSchema).default([]),
  commercialSignals: z.array(RadarObservedSignalSchema).default([]),
  sufficiency: z.string().min(1),
}).strict();

const GoogleRecommendedSchema = z.object({
  intentToSatisfy: z.string().min(1),
  editorialAngle: RadarRecommendationSchema,
  differentiation: z.array(RadarRecommendationSchema).default([]),
  /** Direção de título. Nunca o título de um concorrente. */
  titleDirection: RadarRecommendationSchema.nullable().default(null),
  /** A arquitetura, em uma frase: o que a sequência de seções entrega. */
  contentArchitecture: z.string().min(1).nullable().default(null),
  sectionDirections: z.array(RadarSectionDirectionSchema).default([]),
  questionCoverage: z.array(RadarRecommendationSchema).default([]),
  entityCoverage: z.array(RadarRecommendationSchema).default([]),
  authorityPlan: z.array(RadarAuthorityNeedSchema).default([]),
  internalLinkPlan: z.array(RadarInternalLinkDirectionSchema).default([]),
  multimediaPlan: z.array(RadarRecommendationSchema).default([]),
  commercialApplication: z.array(RadarRecommendationSchema).default([]),
  /** §10 · o que produzir, quando a evidência sustenta mais que um artigo. */
  editorialOutput: z.string().min(1).nullable().default(null),
}).strict();

/* ======================== o perfil YOUTUBE — §10-13 ======================== */

const YoutubeObservedSchema = z.object({
  comparableVideos: z.number().int().nonnegative(),
  longForm: z.number().int().nonnegative(),
  shorts: z.number().int().nonnegative(),
  /** Padrões de TÍTULO. Nunca de gancho: a SERP não abre vídeo. */
  titlePatterns: z.array(RadarObservedSignalSchema).default([]),
  recurrentChannels: z.array(RadarObservedSignalSchema).default([]),
  durationRange: z.string().min(1).nullable().default(null),
  viewsRange: z.string().min(1).nullable().default(null),
  recency: z.string().min(1).nullable().default(null),
  crossQuery: z.array(RadarObservedSignalSchema).default([]),
  /** O que o apoio do Google mostrou sobre a mesma intenção. */
  googleSupport: z.array(RadarObservedSignalSchema).default([]),
  gaps: z.array(RadarObservedSignalSchema).default([]),
  sufficiency: z.string().min(1),
}).strict();

/**
 * O ROTEIRO RECOMENDADO — blocos com propósito, não um texto pronto.
 *
 * O Radar não escreve o vídeo: ele diz o que cada bloco precisa resolver. Um
 * roteiro literal aqui seria copy gerada sem contexto de marca, e chegaria ao
 * Redator competindo com o trabalho dele.
 */
export const RadarYoutubeScriptSectionSchema = z.object({
  block: z.string().min(1),
  objective: z.string().min(1),
  direction: z.string().min(1),
  sourceSignal: z.string().min(1),
}).strict();
export type RadarYoutubeScriptSection = z.infer<typeof RadarYoutubeScriptSectionSchema>;

/** §12 · um Short recomendado, e ele nasce de um sinal — nunca de uma cota. */
export const RadarShortPlanSchema = z.object({
  id: z.string().min(1),
  /** O bloco da busca que originou este Short. Obrigatório. */
  sourceSignal: z.string().min(1),
  /** A pergunta que ele responde, quando veio de uma. */
  sourceQuestion: z.string().min(1).nullable().default(null),
  objective: z.string().min(1),
  hookDirection: z.string().min(1),
  suggestedAngle: z.string().min(1),
  contentPromise: z.string().min(1),
  ctaDirection: z.string().min(1),
}).strict();
export type RadarShortPlan = z.infer<typeof RadarShortPlanSchema>;

/** §13 · como a investigação de vídeo vira pacote editorial. */
export const RadarArticleApplicationSchema = z.object({
  piece: z.enum(["VIDEO_HERO", "SHORT", "IMAGEM", "GOOGLE_SUPPORT"]),
  placement: z.string().min(1),
  role: z.string().min(1),
  sourceSignal: z.string().min(1),
}).strict();
export type RadarArticleApplication = z.infer<typeof RadarArticleApplicationSchema>;

const YoutubeRecommendedSchema = z.object({
  format: z.string().min(1),
  durationDirection: z.string().min(1).nullable().default(null),
  /** 2 a 4 direções de título. DIREÇÕES — nunca títulos de concorrente. */
  titleDirections: z.array(RadarRecommendationSchema).default([]),
  /**
   * O GANCHO É RECOMENDAÇÃO, E O CONTRATO DIZ ISSO.
   *
   * Ele vive em `recommended` e carrega `sourceSignal`. Não existe campo para
   * "gancho observado" porque a coleta não observa gancho nenhum: ela lê
   * título, canal, duração e posição.
   */
  hookDirection: RadarRecommendationSchema.nullable().default(null),
  script: z.array(RadarYoutubeScriptSectionSchema).default([]),
  tone: z.string().min(1).nullable().default(null),
  languageDirection: z.string().min(1).nullable().default(null),
  technicalLevel: z.string().min(1).nullable().default(null),
  authorityDirection: z.string().min(1).nullable().default(null),
  shorts: z.array(RadarShortPlanSchema).default([]),
  articleApplication: z.array(RadarArticleApplicationSchema).default([]),
}).strict();

/* ========================= o perfil AMAZON — §14-16 ========================= */

/**
 * §15 · PREÇO OBSERVADO CARREGA DATA; RECOMENDAÇÃO TRABALHA COM FAIXA.
 *
 * "R$ 89,90" é verdade sobre um instante. Gravá-lo como recomendação faria o
 * artigo envelhecer no dia seguinte e prometer um preço que a loja já mudou.
 * A observação preserva o valor com a data; a estratégia fala em banda.
 */
export const RADAR_PRICE_BANDS = ["ECONOMICO", "INTERMEDIARIO", "PREMIUM"] as const;
export const RadarPriceBandSchema = z.enum(RADAR_PRICE_BANDS);
export type RadarPriceBand = typeof RADAR_PRICE_BANDS[number];

export const RadarObservedPriceSchema = z.object({
  band: RadarPriceBandSchema,
  /** O valor visto, com a data. Observação, nunca recomendação. */
  observedValue: z.number().nonnegative().nullable().default(null),
  currency: z.string().min(1).default("BRL"),
  observedAt: z.string().min(1),
  source: z.string().min(1),
  sampleSize: z.number().int().nonnegative().default(0),
  /**
   * §10 · COMO A BANDA FOI DERIVADA.
   *
   * "Intermediário" sem método é opinião com cara de estatística. Com o método
   * ao lado — tercil da amostra, mediana, faixa declarada — quem lê sabe o que
   * o rótulo significa e pode discordar dele.
   */
  method: z.string().min(1).default("Tercil da amostra de preços observada nesta coleta."),
  /** O intervalo que a banda cobre, na moeda observada. */
  rangeFrom: z.number().nonnegative().nullable().default(null),
  rangeTo: z.number().nonnegative().nullable().default(null),
}).strict();
export type RadarObservedPrice = z.infer<typeof RadarObservedPriceSchema>;

/**
 * ====== §3 · O OBSERVED DA AMAZON, CORRIGIDO PELO PAYLOAD REAL ======
 *
 * Este bloco foi escrito antes de existir uma chamada. Ele prometia marcas,
 * categorias, atributos, benefícios percebidos, elogios e reclamações — e a
 * SERP de produtos não entrega nada disso.
 *
 * Manter os campos "nullable, para depois" seria pior do que removê-los: um
 * contrato com lugar vazio é um convite a preenchê-lo com heurística, e a
 * heurística chega ao Planejador com a mesma aparência de coleta.
 *
 * O que saiu, e por quê:
 *
 *   brands                   não existe campo de marca. Derivar do título é
 *                            heurística, e heurística não é identidade (§4).
 *   categories               `result.categories` veio null; `related_searches`
 *                            é reformulação de busca, não taxonomia (§5).
 *   attributes               exige PDP — outro endpoint, outro gate.
 *   benefitPatterns          idem.
 *   complaintPatterns        exige TEXTO de avaliação. A SERP dá nota e
 *   objectionPatterns        contagem de votos, e mais nada.
 *   frustratedExpectations
 *   buyingCriteria           derivável só de atributo ou review, que não temos.
 *
 * Eles voltam quando houver AMAZON_PRODUCT_ENRICHMENT — com fonte, custo e
 * fluxo próprios.
 */
const AmazonObservedSchema = z.object({
  /** Produtos comparáveis no universo, já deduplicados por ASIN. */
  products: z.number().int().nonnegative(),
  /** §8 · orgânico e patrocinado, contados separados. */
  placementSignals: z.array(RadarObservedSignalSchema).default([]),
  /** §9 · só preço atual e moeda. Sem preço anterior, sem desconto. */
  priceSignals: z.array(RadarObservedSignalSchema).default([]),
  /** §11 · nota e volume de votos. Agregado, nunca texto. */
  ratingSignals: z.array(RadarObservedSignalSchema).default([]),
  /** §12 · Amazon Choice, Best Seller, comprados no último mês. */
  purchaseSignals: z.array(RadarObservedSignalSchema).default([]),
  /** O texto de oferta, como o provider o entrega: strings soltas. */
  offerTextSignals: z.array(RadarObservedSignalSchema).default([]),
  /** §5 · buscas relacionadas. NÃO são categorias. */
  relatedSearchSignals: z.array(RadarObservedSignalSchema).default([]),
  /** O que o apoio do Google mostrou sobre a mesma intenção comercial. */
  googleSupport: z.array(RadarObservedSignalSchema).default([]),
  /** §10 · as bandas são DERIVADAS do universo, e declaram o método. */
  priceBands: z.array(RadarObservedPriceSchema).default([]),
  sufficiency: z.string().min(1),
}).strict();

/* ============ AMAZON_SEARCH_2 · o que a análise passa a produzir ============ */

/**
 * ============ §11 · O QUE PRODUZIR — E SÓ QUANDO HÁ SINAL ============
 *
 * Escolher formato por regra fixa ("busca comercial ⇒ comparativo") produziria
 * a mesma recomendação para toda categoria, e ela chegaria ao Planejador com a
 * aparência de conclusão de pesquisa.
 *
 * Por isso cada saída carrega `sourceSignals` NÃO VAZIO: sem sinal que a
 * sustente, a saída não existe.
 */
export const RADAR_AMAZON_EDITORIAL_OUTPUTS = [
  "PRODUCT_REVIEW",
  "COMPARISON",
  "BUYING_GUIDE",
  "COMMERCIAL_ARTICLE",
  "ARTICLE_WITH_VIDEO",
  "MULTIFORMAT_PACKAGE",
] as const;
export const RadarAmazonEditorialOutputSchema = z.enum(RADAR_AMAZON_EDITORIAL_OUTPUTS);
export type RadarAmazonEditorialOutput = typeof RADAR_AMAZON_EDITORIAL_OUTPUTS[number];

export const RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS: Record<RadarAmazonEditorialOutput, string> = {
  PRODUCT_REVIEW: "Análise de produto",
  COMPARISON: "Comparativo",
  BUYING_GUIDE: "Guia de compra",
  COMMERCIAL_ARTICLE: "Artigo comercial",
  ARTICLE_WITH_VIDEO: "Artigo com vídeo",
  MULTIFORMAT_PACKAGE: "Pacote multiformato",
};

export const RadarEditorialOutputPlanSchema = z.object({
  output: RadarAmazonEditorialOutputSchema,
  objective: z.string().min(1),
  /** Por que ESTA saída, e não outra. */
  reason: z.string().min(1),
  /** Os sinais que a sustentam. Vazio seria palpite com cara de conclusão. */
  sourceSignals: z.array(z.string().min(1)).min(1),
}).strict();
export type RadarEditorialOutputPlan = z.infer<typeof RadarEditorialOutputPlanSchema>;

/**
 * ============ §15 · OS EIXOS DE COMPARAÇÃO SUSTENTÁVEIS ============
 *
 * Esta lista é fechada de propósito. `buyingCriteria` saiu do contrato no gate
 * anterior porque a SERP de produtos não entrega atributo nenhum; uma lista
 * aberta de eixos o ressuscitaria por outro nome, e "hidratação" voltaria a
 * aparecer como critério observado numa investigação que nunca abriu um PDP.
 *
 * Cada eixo aqui corresponde a um campo que a coleta REALMENTE traz.
 * `GOOGLE_SUPPORT_CRITERION` é a única porta para um critério externo — e ela
 * exige que a SERP do Google o sustente.
 */
export const RADAR_AMAZON_COMPARISON_AXES = [
  "PRICE_BAND",
  "RATING",
  "REVIEW_VOLUME",
  "VISIBILITY",
  "AMAZON_CHOICE",
  "BEST_SELLER",
  "PURCHASE_VOLUME_SIGNAL",
  "DELIVERY_SIGNAL",
  "GOOGLE_SUPPORT_CRITERION",
] as const;
export const RadarAmazonComparisonAxisSchema = z.enum(RADAR_AMAZON_COMPARISON_AXES);
export type RadarAmazonComparisonAxis = typeof RADAR_AMAZON_COMPARISON_AXES[number];

export const RADAR_AMAZON_COMPARISON_AXIS_LABELS: Record<RadarAmazonComparisonAxis, string> = {
  PRICE_BAND: "Faixa de preço",
  RATING: "Nota de avaliação",
  REVIEW_VOLUME: "Volume de avaliações",
  VISIBILITY: "Visibilidade na busca",
  AMAZON_CHOICE: "Selo Amazon's Choice",
  BEST_SELLER: "Selo Mais Vendido",
  PURCHASE_VOLUME_SIGNAL: "Compras declaradas no último mês",
  DELIVERY_SIGNAL: "Condição de entrega",
  GOOGLE_SUPPORT_CRITERION: "Critério sustentado pela busca do Google",
};

export const RadarComparisonAxisSchema = z.object({
  axis: RadarAmazonComparisonAxisSchema,
  /** Como o eixo aparece na tabela, em português. */
  label: z.string().min(1),
  objective: z.string().min(1),
  sourceSignal: z.string().min(1),
  /**
   * §8 e §16 · A RESSALVA, quando o eixo é reputacional ou comercial.
   *
   * Nota e selo descrevem reputação e visibilidade — não qualidade. Sem a
   * ressalva ao lado, uma coluna "4,7" numa tabela comparativa é lida como
   * veredito, e o artigo passa a afirmar o que a coleta não mediu.
   */
  caveat: z.string().min(1).nullable().default(null),
}).strict();
export type RadarComparisonAxis = z.infer<typeof RadarComparisonAxisSchema>;

/**
 * ============ §13 · DIREÇÃO DE TÍTULO — NUNCA O TÍTULO DE NINGUÉM ============
 *
 * O campo se chama `pattern` porque é padrão: "comparação + critério comercial
 * + intenção". Copiar o título de um concorrente entregaria o problema que a
 * investigação veio resolver, e ainda por cima com a marca dele dentro.
 */
export const RadarTitleDirectionSchema = z.object({
  pattern: z.string().min(1),
  objective: z.string().min(1),
  sourceSignals: z.array(z.string().min(1)).min(1),
}).strict();
export type RadarTitleDirection = z.infer<typeof RadarTitleDirectionSchema>;

/**
 * ============ §22 · O QUE FALTA, DECLARADO — E NÃO BLOQUEANTE ============
 *
 * Registrar a lacuna é o oposto de preenchê-la. Quem lê o blueprint fica
 * sabendo que uma comparação por benefício exigiria outra coleta, em vez de
 * receber benefícios inventados com a mesma aparência dos observados.
 */
export const RADAR_AMAZON_ENRICHMENT_GAPS = [
  "REVIEW_TEXT",
  "PDP_ATTRIBUTES",
  "PRODUCT_BENEFITS",
  "BRAND_IDENTITY",
  "CATEGORY_TAXONOMY",
] as const;
export const RadarAmazonEnrichmentGapSchema = z.enum(RADAR_AMAZON_ENRICHMENT_GAPS);
export type RadarAmazonEnrichmentGap = typeof RADAR_AMAZON_ENRICHMENT_GAPS[number];

export const RADAR_AMAZON_ENRICHMENT_GAP_LABELS: Record<RadarAmazonEnrichmentGap, string> = {
  REVIEW_TEXT: "Texto das avaliações",
  PDP_ATTRIBUTES: "Atributos da página do produto",
  PRODUCT_BENEFITS: "Benefícios declarados do produto",
  BRAND_IDENTITY: "Marca canônica do produto",
  CATEGORY_TAXONOMY: "Categoria da loja",
};

/**
 * §23 · O APOIO FOI APLICADO, OU FALTOU — e a diferença é declarada.
 *
 * A decisão deste gate é permitir análise parcial. Isso só é honesto se a
 * ausência aparecer: sem `SUPPORT_MISSING`, um blueprint sem Google seria
 * indistinguível de um com Google que não achou nada.
 */
export const RADAR_AMAZON_SUPPORT_STATES = ["APPLIED", "SUPPORT_MISSING"] as const;
export const RadarAmazonSupportStateSchema = z.enum(RADAR_AMAZON_SUPPORT_STATES);
export type RadarAmazonSupportState = typeof RADAR_AMAZON_SUPPORT_STATES[number];

/**
 * O RECOMMENDED DA AMAZON — o que sobreviveu à evidência.
 *
 * `reviewStructure` saiu junto: uma seção de review pede matéria-prima de
 * review. O que a fonte sustenta é estrutura comercial, comparação e faixa de
 * preço — e é isso que fica.
 */
const AmazonRecommendedSchema = z.object({
  offerDirection: z.array(RadarRecommendationSchema).default([]),
  positioning: RadarRecommendationSchema.nullable().default(null),
  /** §10 · banda, nunca valor. */
  priceBandDirection: RadarPriceBandSchema.nullable().default(null),
  comparisonStructure: z.array(RadarRecommendationSchema).default([]),
  buyingGuideStructure: z.array(RadarRecommendationSchema).default([]),
  commercialArticleStructure: z.array(RadarRecommendationSchema).default([]),
  ctaDirection: RadarRecommendationSchema.nullable().default(null),
  googleSeoSupport: z.array(RadarRecommendationSchema).default([]),

  /* ===== AMAZON_SEARCH_2 · aditivos, todos com default ===== */

  /** §23 · se o apoio do Google entrou nesta análise, ou faltou. */
  supportState: RadarAmazonSupportStateSchema.default("SUPPORT_MISSING"),
  /** §11 · o que produzir. Vazio quando nenhum sinal sustenta uma saída. */
  recommendedOutputs: z.array(RadarEditorialOutputPlanSchema).default([]),
  /** §12 · o ângulo editorial e o comercial, separados. */
  editorialAngle: RadarRecommendationSchema.nullable().default(null),
  commercialAngle: RadarRecommendationSchema.nullable().default(null),
  differentiationDirection: z.array(RadarRecommendationSchema).default([]),
  /** §13 · 2 a 4 direções. Nunca títulos copiados. */
  titleDirections: z.array(RadarTitleDirectionSchema).default([]),
  /** §14 · a estrutura do conteúdo, na mesma gramática do perfil Google. */
  sectionDirections: z.array(RadarSectionDirectionSchema).default([]),
  /** §15 · eixos sustentados. Lista fechada, cada um com o sinal de origem. */
  comparisonAxes: z.array(RadarComparisonAxisSchema).default([]),
  /**
   * §16 · AGRUPAMENTOS, NÃO RANKING.
   *
   * "1º melhor" a partir de nota e preço seria veredito de qualidade tirado de
   * sinal comercial. Agrupar por faixa e por reputação descreve sem ordenar.
   */
  comparisonGrouping: z.array(RadarRecommendationSchema).default([]),
  /** §20 · multimídia, só quando o apoio do Google a sustenta. */
  multimediaPlan: z.array(RadarRecommendationSchema).default([]),
  /** §22 · o que outra coleta destravaria. Declarado, não bloqueante. */
  requiresEnrichment: z.array(RadarAmazonEnrichmentGapSchema).default([]),
}).strict();

/* ====================== §5 · o envelope e a união ====================== */

const ComumSchema = {
  schemaVersion: z.literal(RADAR_BLUEPRINT_SCHEMA_VERSION),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  articleDnaContentHash: z.string().min(1).nullable().default(null),
  /** §2 · as referências. Nunca a matéria-prima. */
  researchRefs: z.array(RadarResearchRefSchema).default([]),
  /** O que a investigação NÃO alcançou. Ausência declarada é dado. */
  limitations: z.array(z.string().min(1)).default([]),
  provenance: z.object({
    generatedAt: z.string().min(1),
    /** `null` enquanto vivo; preenchido no FINALIZE. */
    frozenAt: z.string().min(1).nullable().default(null),
  }).strict(),
};

export const RadarCompetitiveBlueprintSchema = z.discriminatedUnion("profile", [
  z.object({ ...ComumSchema, profile: z.literal("GOOGLE"), observed: GoogleObservedSchema, recommended: GoogleRecommendedSchema }).strict(),
  z.object({ ...ComumSchema, profile: z.literal("YOUTUBE"), observed: YoutubeObservedSchema, recommended: YoutubeRecommendedSchema }).strict(),
  z.object({ ...ComumSchema, profile: z.literal("AMAZON"), observed: AmazonObservedSchema, recommended: AmazonRecommendedSchema }).strict(),
]);
export type RadarCompetitiveBlueprint = z.infer<typeof RadarCompetitiveBlueprintSchema>;

export type RadarGoogleBlueprint = Extract<RadarCompetitiveBlueprint, { profile: "GOOGLE" }>;
export type RadarYoutubeCanonicalBlueprint = Extract<RadarCompetitiveBlueprint, { profile: "YOUTUBE" }>;
export type RadarAmazonBlueprint = Extract<RadarCompetitiveBlueprint, { profile: "AMAZON" }>;

/* Uma conferência de sanidade para quem monta: o perfil e a união batem. */
export const RADAR_BLUEPRINT_PROFILES = RADAR_RESEARCH_PROFILES;

/**
 * ============ A TRAVA DE MISTURA — §6 ============
 *
 * Um sinal observado não pode chegar a `recommended`, e uma recomendação não
 * pode chegar a `observed`. O schema já separa os TIPOS; isto pega o caso em
 * que alguém constrói o objeto certo com o conteúdo errado — uma recomendação
 * escrita como se fosse contagem.
 *
 * A regra é de GRAU: tudo em `observed` precisa de um grau observacional, e
 * nada em `recommended` pode se apresentar como observação.
 */
export function assertRadarBlueprintSeparation(blueprint: RadarCompetitiveBlueprint): void {
  const sinais: RadarObservedSignal[] = [];
  for (const valor of Object.values(blueprint.observed as Record<string, unknown>)) {
    if (!Array.isArray(valor)) continue;
    for (const item of valor) {
      if (item && typeof item === "object" && "grade" in item) sinais.push(item as RadarObservedSignal);
    }
  }
  for (const sinal of sinais) {
    if (sinal.grade === "DERIVED") {
      throw new RadarBlueprintSeparationError(
        `O sinal "${sinal.id}" está em observed com grau DERIVED: uma conclusão nossa apresentada como leitura da busca.`,
      );
    }
  }
}

export class RadarBlueprintSeparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadarBlueprintSeparationError";
  }
}

/* Atalhos de construção, para quem monta não repetir o grau à mão. */
export const sinalObservado = (id: string, statement: string, evidence: string, count: number | null = null): RadarObservedSignal =>
  RadarObservedSignalSchema.parse({ id, statement, grade: "OBSERVED_SERP", evidence, count });

/** §16 · percepção de comprador entra por aqui, e só por aqui. */
export const percepcaoDeComprador = (id: string, statement: string, evidence: string, count: number | null = null): RadarObservedSignal =>
  RadarObservedSignalSchema.parse({ id, statement, grade: "BUYER_PERCEPTION", evidence, count });

export const recomendacao = (id: string, statement: string, objective: string, sourceSignal: string): RadarBlueprintRecommendation =>
  RadarRecommendationSchema.parse({ id, statement, objective, sourceSignal });
