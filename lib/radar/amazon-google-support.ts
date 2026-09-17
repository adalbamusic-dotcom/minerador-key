/**
 * ===== O APOIO DO GOOGLE, DESTILADO PARA O PERFIL AMAZON — §18 =====
 *
 * ================ POR QUE DESTILAR, E NÃO LER O SNAPSHOT ================
 *
 * O snapshot da SERP tem dezenas de campos e existe para o pipeline do Google.
 * Passá-lo inteiro ao adapter da Amazon faria o adapter conhecer a forma de
 * outra investigação — e, no dia em que aquele contrato mudasse, o blueprint
 * comercial quebraria por um motivo que não tem nada a ver com a Amazon.
 *
 * O que atravessa é a leitura: perguntas, refinamentos, entidades, produtos
 * populares, comparações e formatos.
 *
 * ================== "COMPARAÇÃO" É LEITURA DE TEXTO ==================
 *
 * Marcar um termo como sinal de comparação porque ele contém "vs", "melhor" ou
 * "ou" é observação sobre o que a busca ESCREVEU — e a evidência guarda o termo
 * exato, para quem lê conferir. Não é inferência sobre produto nenhum.
 *
 * ===================== O QUE ESTE MÓDULO NUNCA FAZ =====================
 *
 * Não cria marca, não cria categoria, não cria benefício. O Google tampouco
 * entrega essas coisas: ele entrega busca.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarAmazonGoogleSupport = {
  snapshotId: string;
  keyword: string | null;
  collectedAt: string | null;
  /** PAA e People Also Search, na ordem em que a SERP as trouxe. */
  questions: string[];
  /** Refinement chips e buscas relacionadas. */
  refinements: string[];
  entities: string[];
  popularProducts: Array<{ title: string; seller: string | null; price: string | null }>;
  /** Termos da SERP que comparam explicitamente. O termo vira a evidência. */
  comparisonTerms: string[];
  formats: {
    hasAiOverview: boolean;
    hasQuestions: boolean;
    hasImages: boolean;
    hasVideo: boolean;
    hasShortVideos: boolean;
    hasProducts: boolean;
  };
  multimedia: { videos: number; shorts: number; images: number };
};

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const lista = (valor: unknown): unknown[] => Array.isArray(valor) ? valor : [];

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

const unicos = (valores: readonly (string | null)[]): string[] => {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const valor of valores) {
    if (!valor) continue;
    const chave = valor.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(valor);
  }
  return saida;
};

/**
 * OS MARCADORES DE COMPARAÇÃO — e eles são de LINGUAGEM, não de produto.
 *
 * A lista é curta e literal de propósito. Ampliá-la com heurística semântica
 * faria termos comuns virarem "comparação" e a recomendação de comparativo
 * nasceria de ruído.
 */
const MARCADORES = [" vs ", " vs. ", " x ", "melhor", "qual ", " ou ", "comparativo", "comparação", "diferença"];

const comparaExplicitamente = (termo: string): boolean => {
  const normalizado = ` ${termo.toLowerCase()} `;
  return MARCADORES.some(marcador => normalizado.includes(marcador));
};

/**
 * DESTILA O SNAPSHOT DO APOIO.
 *
 * Aceita `unknown` porque o snapshot vem do armazenamento e pode ser antigo:
 * um snapshot gravado antes do RADAR_MULTIMODAL_1 não tem `serpFeatures`, e
 * isso é ausência declarada — nunca motivo para inventar leitura.
 */
export function buildRadarAmazonGoogleSupport(input: {
  snapshotId: string;
  snapshot: unknown;
}): RadarAmazonGoogleSupport | null {
  const snapshot = objeto(input.snapshot);
  if (!snapshot) return null;

  const features = objeto(snapshot.serpFeatures);
  const formatMap = features ? objeto(features.contentFormatMap) : null;

  const perguntasPaa = lista(snapshot.peopleAlsoAsk).map(item => texto(objeto(item)?.question));
  const perguntasFeatures = features
    ? lista(features.questionMap).map(item => texto(objeto(item)?.question))
    : [];

  const relacionadas = lista(snapshot.relatedSearches).map(item => texto(objeto(item)?.term));
  const entidades = features ? lista(features.entityMap).map(item => texto(objeto(item)?.term)) : [];

  const videos = features ? lista(features.videos).map(item => objeto(item)) : [];
  const produtos = features ? objeto(features.commercialSignals) : null;

  const perguntas = unicos([...perguntasPaa, ...perguntasFeatures]);
  const refinamentos = unicos(relacionadas);

  return {
    snapshotId: input.snapshotId,
    keyword: texto(snapshot.query),
    collectedAt: texto(snapshot.collectedAt),
    questions: perguntas,
    refinements: refinamentos,
    entities: unicos(entidades),
    popularProducts: (produtos ? lista(produtos.products) : [])
      .map(item => objeto(item))
      .filter((item): item is Record<string, unknown> => Boolean(item && texto(item.title)))
      .map(item => ({
        title: texto(item.title) as string,
        seller: texto(item.seller),
        price: texto(item.price),
      })),
    /* O termo que compara vira evidência literal, em perguntas e refinamentos. */
    comparisonTerms: unicos([...perguntas, ...refinamentos].filter(comparaExplicitamente)),
    formats: {
      hasAiOverview: Boolean(formatMap?.hasAiOverview),
      hasQuestions: Boolean(formatMap?.hasQuestions) || perguntas.length > 0,
      hasImages: Boolean(formatMap?.hasImages),
      hasVideo: Boolean(formatMap?.hasVideo),
      hasShortVideos: Boolean(formatMap?.hasShortVideos),
      hasProducts: Boolean(formatMap?.hasProducts),
    },
    multimedia: {
      videos: videos.filter(item => item?.block === "VIDEO").length,
      shorts: videos.filter(item => item?.block === "SHORT_VIDEOS").length,
      images: features ? lista(features.visualOpportunities).length : 0,
    },
  };
}
