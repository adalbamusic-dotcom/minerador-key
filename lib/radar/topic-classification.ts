/**
 * NEM TUDO QUE APARECE UMA VEZ É UMA LACUNA COMPETITIVA.
 *
 * A regra anterior era aritmética: apareceu em 1 de 7 páginas, virou lacuna; e
 * toda lacuna virou oportunidade. O resultado foi a tela recomendando "cobrir
 * Buscar produtos com profundidade", "cobrir Disponível nos kits", "cobrir
 * Descrição do produto" — pedaços de vitrine de e-commerce promovidos a
 * estratégia editorial. Quem lia perdia a confiança no resto da leitura.
 *
 * Aqui um tópico observado recebe UMA classe, com motivo:
 *
 *   RECURRENT_TOPIC     · repete na amostra; é o que os concorrentes fazem
 *   COMPETITIVE_GAP     · relevante à consulta e pouco coberto pela amostra
 *   ISOLATED_TOPIC      · pouco coberto, mas sem relação com o que se busca
 *   PAGE_SPECIFIC_NOISE · vitrine, navegação, CTA, ficha de produto
 *
 * Só COMPETITIVE_GAP pode virar oportunidade. E mesmo essa é observação da
 * amostra: quem decide o que o artigo vai cobrir é o Planejador.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarTopicClass = "RECURRENT_TOPIC" | "COMPETITIVE_GAP" | "ISOLATED_TOPIC" | "PAGE_SPECIFIC_NOISE";

export type RadarTopicOccurrence = { pageId: string; url: string; title: string; level: 2 | 3 };

export type RadarClassifiedTopic = {
  topic: string;
  classification: RadarTopicClass;
  pages: number;
  sampleSize: number;
  /** Por que caiu nesta classe, em uma frase legível. */
  reason: string;
  /** A relação que sustenta (ou não sustenta) a promoção a lacuna. */
  relevance: { query: boolean; principal: boolean; editorial: boolean };
  occurrences: RadarTopicOccurrence[];
};

/*
 * Vitrine não é conteúdo editorial.
 *
 * Estes padrões descrevem blocos de e-commerce, navegação e ficha técnica que
 * aparecem como heading em página de produto. Eles existem na amostra e devem
 * continuar visíveis — como ruído nomeado, não como recomendação.
 */
const PADROES_DE_RUIDO: RegExp[] = [
  /^(buscar|comprar|adicionar|adicione|ver mais|veja mais|saiba mais|aproveite|conhe(ç|c)a)\b/i,
  /\b(carrinho|frete|cupom|parcel|boleto|pix|estoque|sku|c(ó|o)digo de barras|ean)\b/i,
  /\b(dispon(í|i)vel nos kits|kit|combo|leve \d|promo(ç|c)(ã|a)o|desconto|oferta)\b/i,
  /\b(descri(ç|c)(ã|a)o do produto|ficha t(é|e)cnica|especifica(ç|c)(õ|o)es|modo de uso do produto|composi(ç|c)(ã|a)o|ingredientes\s*:)\b/i,
  /\b(avalia(ç|c)(õ|o)es de clientes|coment(á|a)rios de clientes|entrega|trocas e devolu(ç|c)(õ|o)es|pol(í|i)tica|termos de uso|privacidade)\b/i,
  /\b(newsletter|cadastre-se|fale conosco|atendimento|institucional|categorias|menu|rodap(é|e)|siga|redes sociais)\b/i,
  /\b(produtos relacionados|quem viu também|você também pode gostar|mais vendidos)\b/i,
];

/** Ficha de produto disfarçada de tópico: volume, percentual, código de fórmula. */
const ASSINATURA_DE_PRODUTO = /(\d+\s?(ml|g|mg|un)\b)|(\b\d{1,2}([.,]\d+)?\s?%)|(\b[A-Z]{2,3}-\d)|(\b\d{5,}\b)/i;

const PALAVRAS_VAZIAS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "e", "ou", "em",
  "no", "na", "nos", "nas", "para", "por", "com", "sem", "que", "qual", "quais", "quando", "como",
  "onde", "porque", "se", "ao", "aos", "à", "às", "seu", "sua", "seus", "suas", "meu", "minha",
  "este", "esta", "esse", "essa", "isso", "aquele", "aquela", "mais", "menos", "muito", "pouco",
  "ser", "é", "sao", "são", "ter", "tem", "the", "of", "and", "for",
]);

const normalizar = (value: string) =>
  value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

/** Os termos que carregam sentido — o resto não sustenta relação nenhuma. */
export function radarTopicTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return normalizar(value).split(" ").filter(token => token.length >= 4 && !PALAVRAS_VAZIAS.has(token));
}

const compartilhaTermo = (topico: string, referencia: string | null | undefined) => {
  const daReferencia = new Set(radarTopicTokens(referencia));
  if (!daReferencia.size) return false;
  return radarTopicTokens(topico).some(token => daReferencia.has(token));
};

/** Um heading tão longo quanto uma frase é título de página, não tópico. */
const PALAVRAS_DEMAIS = 14;

export function radarTopicIsNoise(topic: string): boolean {
  if (PADROES_DE_RUIDO.some(pattern => pattern.test(topic))) return true;
  if (ASSINATURA_DE_PRODUTO.test(topic)) return true;
  return normalizar(topic).split(" ").length > PALAVRAS_DEMAIS;
}

export type RadarTopicContext = {
  query?: string | null;
  observedIntent?: string | null;
  principal?: string | null;
  /** Tópicos, cobertura e perguntas que o ArticleDNA declarou, quando existem. */
  editorialTopics?: readonly string[];
};

/**
 * O limiar de recorrência: metade da amostra, com no mínimo duas páginas.
 *
 * Abaixo disso o tópico não descreve o que os concorrentes fazem — descreve o
 * que uma delas fez.
 */
export function radarRecurrenceThreshold(sampleSize: number): number {
  return Math.max(2, Math.ceil(sampleSize / 2));
}

export function classifyRadarTopic(input: {
  topic: string;
  pages: number;
  sampleSize: number;
  occurrences?: RadarTopicOccurrence[];
  context?: RadarTopicContext;
}): RadarClassifiedTopic {
  const context = input.context || {};
  const occurrences = input.occurrences || [];
  const relevance = {
    query: compartilhaTermo(input.topic, context.query),
    principal: compartilhaTermo(input.topic, context.principal),
    editorial: (context.editorialTopics || []).some(item => compartilhaTermo(input.topic, item)),
  };
  const base = { topic: input.topic, pages: input.pages, sampleSize: input.sampleSize, relevance, occurrences };

  if (radarTopicIsNoise(input.topic)) {
    return { ...base, classification: "PAGE_SPECIFIC_NOISE", reason: "Bloco de vitrine, navegação ou ficha de produto — não é tema editorial da amostra." };
  }

  if (input.pages >= radarRecurrenceThreshold(input.sampleSize)) {
    return { ...base, classification: "RECURRENT_TOPIC", reason: `Observado em ${input.pages} de ${input.sampleSize} páginas comparáveis.` };
  }

  /*
   * Pouco coberto só vira lacuna com relação demonstrável.
   *
   * Sem relação com a consulta, com a principal ou com o contexto editorial
   * recebido, "apareceu uma vez" é exatamente isso — e nada mais.
   */
  const relacionado = relevance.query || relevance.principal || relevance.editorial;
  if (!relacionado) {
    return { ...base, classification: "ISOLATED_TOPIC", reason: `Aparece em ${input.pages} de ${input.sampleSize} páginas e não tem relação com a consulta, a principal ou o contexto editorial.` };
  }

  const vinculo = [relevance.query && "a consulta", relevance.principal && "a principal", relevance.editorial && "o contexto editorial"].filter(Boolean).join(" · ");
  return { ...base, classification: "COMPETITIVE_GAP", reason: `Relacionado a ${vinculo}, mas coberto por apenas ${input.pages} de ${input.sampleSize} páginas comparáveis.` };
}

export function classifyRadarTopics(
  topics: ReadonlyArray<{ topic: string; pages: number; sampleSize: number; occurrences?: RadarTopicOccurrence[] }>,
  context?: RadarTopicContext,
): RadarClassifiedTopic[] {
  return topics.map(item => classifyRadarTopic({ ...item, context }));
}

export const radarTopicsOfClass = (topics: readonly RadarClassifiedTopic[], classification: RadarTopicClass) =>
  topics.filter(item => item.classification === classification);
