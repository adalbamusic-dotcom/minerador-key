import { z } from "zod";

/**
 * ===== SERP FEATURE INTELLIGENCE — RADAR_MULTIMODAL_1 =====
 *
 * ==================== O QUE ESTAVA SENDO JOGADO FORA ====================
 *
 * A coleta do Google já recebia oito blocos e a normalização guardava três:
 * orgânicos, People Also Ask e buscas relacionadas. AI Overview, imagens,
 * vídeos, Shorts, People Also Search, refinement chips e produtos chegavam na
 * resposta e eram descartados na porta.
 *
 * Isto NÃO refaz a coleta homologada. É a mesma chamada, o mesmo endpoint e o
 * mesmo normalizador: o que muda é que os blocos param de ser descartados.
 *
 * ================= CADA BLOCO RESPONDE OUTRA PERGUNTA =================
 *
 *   AI Overview        o que o Google considera A resposta, e quem ele cita
 *   Orgânicos          quem disputa a página
 *   People Also Ask    o que precisa ser respondido
 *   People Also Search para onde a intenção se expande
 *   Refinement chips   entidades, filtros e segmentos
 *   Imagens            a linguagem visual da intenção
 *   Vídeos / Shorts    o audiovisual que o GOOGLE considera resposta
 *   Popular products   que a intenção tem camada comercial
 *
 * Tratar tudo como "10 páginas concorrentes" descartava sete respostas.
 *
 * ================ OBSERVADO É OBSERVADO — SEMPRE ================
 *
 * Nada aqui recomenda. Este módulo LÊ a SERP e nomeia o que encontrou; quem
 * deriva estratégia é o blueprint, e lá a separação entre observado e
 * recomendado é estrutural.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem IA.
 */

/* ============================== a leitura crua ============================= */

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

const inteiro = (valor: unknown): number | null =>
  typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : null;

const lista = (valor: unknown): unknown[] => Array.isArray(valor) ? valor : [];

/* =========================== os blocos, tipados =========================== */

export const RadarSerpAiOverviewSchema = z.object({
  present: z.boolean(),
  /** O texto que o Google sintetiza. Guardado para LER, nunca para copiar. */
  markdownLength: z.number().int().nonnegative(),
  /** Quem o Google cita como fonte — a autoridade que ele já reconhece. */
  references: z.array(z.object({
    domain: z.string().min(1),
    title: z.string().nullable(),
    url: z.string().nullable(),
  }).strict()),
}).strict();

export const RadarSerpQuestionSchema = z.object({
  question: z.string().min(1),
  /** De onde a pergunta veio: o bloco PAA ou a expansão semântica. */
  source: z.enum(["PEOPLE_ALSO_ASK", "PEOPLE_ALSO_SEARCH", "REFINEMENT_CHIP"]),
}).strict();

export const RadarSerpEntitySchema = z.object({
  term: z.string().min(1),
  source: z.enum(["REFINEMENT_CHIP", "PEOPLE_ALSO_SEARCH", "RELATED_IMAGE_SEARCH"]),
}).strict();

export const RadarSerpVisualSchema = z.object({
  /** O texto alternativo da imagem: é ele que descreve a linguagem visual. */
  alt: z.string().min(1),
  sourceDomain: z.string().nullable(),
}).strict();

export const RadarSerpVideoItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  domain: z.string().nullable(),
  source: z.string().nullable(),
  /** O bloco que o trouxe: vídeo tradicional ou Short. */
  block: z.enum(["VIDEO", "SHORT_VIDEOS"]),
  /** `videoId` quando a URL é do YouTube. É por ele que o cruzamento acontece. */
  youtubeVideoId: z.string().nullable(),
  /** A plataforma, derivada do domínio: YouTube, Instagram, TikTok, outra. */
  platform: z.enum(["YOUTUBE", "INSTAGRAM", "TIKTOK", "OUTRA"]),
}).strict();

export const RadarSerpProductSchema = z.object({
  title: z.string().min(1),
  seller: z.string().nullable(),
  price: z.string().nullable(),
  rating: z.number().nullable(),
  reviews: z.number().int().nonnegative().nullable(),
}).strict();

export const RadarSerpFeatureIntelligenceSchema = z.object({
  featuresVersion: z.literal(1),
  keyword: z.string().min(1),
  /** Os tipos de bloco que a SERP devolveu, verbatim. */
  itemTypes: z.array(z.string()),

  aiOverview: RadarSerpAiOverviewSchema,
  organicCount: z.number().int().nonnegative(),
  questionMap: z.array(RadarSerpQuestionSchema),
  entityMap: z.array(RadarSerpEntitySchema),
  visualOpportunities: z.array(RadarSerpVisualSchema),
  videos: z.array(RadarSerpVideoItemSchema),
  commercialSignals: z.object({
    present: z.boolean(),
    products: z.array(RadarSerpProductSchema),
  }).strict(),

  /**
   * ============ CONTENT_FORMAT_MAP — o que o Google trata como resposta ============
   *
   * A presença de cada bloco é um voto do Google sobre o formato que serve à
   * intenção. Uma SERP com vídeo, Short e produto está dizendo três coisas que
   * uma lista de dez links azuis não diria.
   */
  contentFormatMap: z.object({
    hasAiOverview: z.boolean(),
    hasOrganic: z.boolean(),
    hasQuestions: z.boolean(),
    hasImages: z.boolean(),
    hasVideo: z.boolean(),
    hasShortVideos: z.boolean(),
    hasProducts: z.boolean(),
  }).strict(),

  /**
   * SEARCH_INTENT OBSERVADA — derivada dos BLOCOS, não do ArticleDNA.
   *
   * Ela não substitui a classificação do Arquiteto: é o que a SERP demonstra,
   * e as duas juntas é que revelam divergência quando existe.
   */
  observedIntentSignals: z.array(z.string()),
  limitations: z.array(z.string()),
}).strict();
export type RadarSerpFeatureIntelligence = z.infer<typeof RadarSerpFeatureIntelligenceSchema>;

/* ========================= o extrator de YouTube ========================= */

/**
 * O `videoId` DENTRO DE UMA URL DO GOOGLE.
 *
 * É a chave do cruzamento: o mesmo vídeo que ranqueia no YouTube pode aparecer
 * no bloco de vídeos do Google, e é isso que separa "forte no YouTube" de
 * "forte em duas plataformas".
 */
export function radarYoutubeIdFromAnyUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const endereco = new URL(url);
    if (/(^|\.)youtu\.be$/.test(endereco.hostname)) return endereco.pathname.replace(/^\//, "").trim() || null;
    if (!/(^|\.)youtube\.com$/.test(endereco.hostname)) return null;
    const parametro = endereco.searchParams.get("v");
    if (parametro && parametro.trim()) return parametro.trim();
    const curto = endereco.pathname.match(/^\/(?:shorts|embed|v)\/([^/]+)/);
    return curto ? curto[1] : null;
  } catch {
    return null;
  }
}

/** Mantém a PRIMEIRA ocorrência de cada chave, na ordem de chegada. */
function primeiraDeCada<T>(itens: readonly T[], chaveDe: (item: T) => string): T[] {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const item of itens) {
    const chave = chaveDe(item);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(item);
  }
  return saida;
}

const plataformaDe = (url: string | null): z.infer<typeof RadarSerpVideoItemSchema>["platform"] => {
  const alvo = (url || "").toLowerCase();
  if (/youtube\.com|youtu\.be/.test(alvo)) return "YOUTUBE";
  if (/instagram\.com/.test(alvo)) return "INSTAGRAM";
  if (/tiktok\.com/.test(alvo)) return "TIKTOK";
  return "OUTRA";
};

/* ============================== a montagem ============================== */

/**
 * LÊ O PAYLOAD CRU DA DATAFORSEO e devolve as camadas — sem recoletar nada.
 *
 * Aceita a resposta com envelope (`{ tasks: [...] }`) e a tarefa já
 * desembrulhada, pelo mesmo motivo do adaptador de YouTube: as duas formas são
 * reais, e aceitar só uma faria a fixture confirmada ser lida como vazia.
 */
export function buildRadarSerpFeatureIntelligence(body: unknown): RadarSerpFeatureIntelligence | null {
  const raiz = objeto(body);
  const tarefas = lista(raiz?.tasks).length ? lista(raiz?.tasks) : raiz ? [raiz] : [];
  const tarefa = objeto(tarefas[0]);
  const resultado = objeto(lista(tarefa?.result)[0]);
  if (!resultado) return null;

  const keyword = texto(resultado.keyword);
  if (!keyword) return null;

  const itens = lista(resultado.items).map(objeto).filter((item): item is Record<string, unknown> => Boolean(item));
  const doTipo = (tipo: string) => itens.filter(item => texto(item.type) === tipo);

  /* ---------------- AI Overview ---------------- */
  const aio = doTipo("ai_overview")[0] || null;
  const aiOverview = {
    present: Boolean(aio),
    markdownLength: (texto(aio?.markdown) || "").length,
    references: lista(aio?.references).map(objeto).flatMap(ref => {
      const domain = texto(ref?.domain);
      return domain ? [{ domain, title: texto(ref?.title), url: texto(ref?.url) }] : [];
    }),
  };

  /* ---------------- QUESTION_MAP ---------------- */
  const questionMap: z.infer<typeof RadarSerpQuestionSchema>[] = [];
  for (const bloco of doTipo("people_also_ask")) {
    for (const item of lista(bloco.items).map(objeto)) {
      const pergunta = texto(item?.title);
      if (pergunta) questionMap.push({ question: pergunta, source: "PEOPLE_ALSO_ASK" });
    }
  }
  /*
   * "People Also Search" e os chips viram PERGUNTA quando têm cara de pergunta,
   * e ENTIDADE quando não têm. Jogar tudo num balde só misturaria "o que usar
   * à noite?" com "niacinamida" — que pedem tratamentos editoriais diferentes.
   */
  const pareceExpansao = (valor: string) => /\?|^(como|qual|quais|quando|por que|porque|o que|onde|quem)\b/i.test(valor);

  const entityMap: z.infer<typeof RadarSerpEntitySchema>[] = [];
  for (const bloco of doTipo("people_also_search")) {
    for (const item of lista(bloco.items)) {
      const termo = texto(item) || texto(objeto(item)?.title);
      if (!termo) continue;
      if (pareceExpansao(termo)) questionMap.push({ question: termo, source: "PEOPLE_ALSO_SEARCH" });
      else entityMap.push({ term: termo, source: "PEOPLE_ALSO_SEARCH" });
    }
  }

  const chips = objeto(resultado.refinement_chips);
  for (const item of lista(chips?.items).map(objeto)) {
    const titulo = texto(item?.title);
    if (!titulo) continue;
    if (pareceExpansao(titulo)) questionMap.push({ question: titulo, source: "REFINEMENT_CHIP" });
    else entityMap.push({ term: titulo, source: "REFINEMENT_CHIP" });
  }

  /* ---------------- VISUAL_OPPORTUNITIES ---------------- */
  const visualOpportunities: z.infer<typeof RadarSerpVisualSchema>[] = [];
  for (const bloco of doTipo("images")) {
    for (const item of lista(bloco.items).map(objeto)) {
      const alt = texto(item?.alt);
      if (!alt) continue;
      let sourceDomain: string | null = null;
      try { sourceDomain = texto(item?.url) ? new URL(texto(item?.url)!).hostname : null; } catch { sourceDomain = null; }
      visualOpportunities.push({ alt, sourceDomain });
    }
    for (const busca of lista(bloco.related_image_searches).map(objeto)) {
      const titulo = texto(busca?.title);
      if (titulo) entityMap.push({ term: titulo, source: "RELATED_IMAGE_SEARCH" });
    }
  }

  /* ---------------- VIDEO e SHORT_VIDEO ---------------- */
  const videos: z.infer<typeof RadarSerpVideoItemSchema>[] = [];
  for (const [tipo, bloco] of [["VIDEO", "video"], ["SHORT_VIDEOS", "short_videos"]] as const) {
    for (const container of doTipo(bloco)) {
      for (const item of lista(container.items).map(objeto)) {
        const title = texto(item?.title);
        const url = texto(item?.url);
        if (!title || !url) continue;
        videos.push({
          title, url,
          domain: texto(item?.domain),
          source: texto(item?.source),
          block: tipo,
          youtubeVideoId: radarYoutubeIdFromAnyUrl(url),
          platform: plataformaDe(url),
        });
      }
    }
  }

  /* ---------------- COMMERCIAL_SIGNALS ---------------- */
  const products: z.infer<typeof RadarSerpProductSchema>[] = [];
  for (const bloco of doTipo("popular_products")) {
    for (const item of lista(bloco.items).map(objeto)) {
      const title = texto(item?.title);
      if (!title) continue;
      const avaliacao = objeto(item?.rating);
      products.push({
        title,
        seller: texto(item?.seller),
        price: texto(item?.price) || texto(objeto(item?.price)?.displayed_price),
        rating: typeof avaliacao?.value === "number" ? avaliacao.value : null,
        reviews: inteiro(avaliacao?.votes_count),
      });
    }
  }

  const contentFormatMap = {
    hasAiOverview: Boolean(aio),
    hasOrganic: doTipo("organic").length > 0,
    hasQuestions: questionMap.length > 0,
    hasImages: visualOpportunities.length > 0,
    hasVideo: videos.some(item => item.block === "VIDEO"),
    hasShortVideos: videos.some(item => item.block === "SHORT_VIDEOS"),
    hasProducts: products.length > 0,
  };

  /*
   * ============ SEARCH_INTENT OBSERVADA — sinais, não veredito ============
   *
   * Cada linha nomeia o que a SERP demonstra, com o bloco que a sustenta. Sem
   * a evidência ao lado, "intenção comercial" seria um rótulo que ninguém
   * confere contra o payload.
   */
  const observedIntentSignals: string[] = [];
  if (contentFormatMap.hasProducts) observedIntentSignals.push(`O Google mostra ${products.length} produto(s) para esta busca: a intenção tem camada comercial.`);
  if (contentFormatMap.hasAiOverview) observedIntentSignals.push(`O Google sintetiza a resposta num AI Overview e cita ${aiOverview.references.length} fonte(s): a intenção tem resposta direta esperada.`);
  if (contentFormatMap.hasQuestions) observedIntentSignals.push(`${questionMap.length} pergunta(s) e expansões aparecem na SERP: a intenção é exploratória.`);
  if (contentFormatMap.hasVideo || contentFormatMap.hasShortVideos) {
    const curtos = videos.filter(item => item.block === "SHORT_VIDEOS").length;
    observedIntentSignals.push(`O Google devolve ${videos.length} peça(s) audiovisual(is)${curtos ? `, ${curtos} em formato curto` : ""}: vídeo compete nesta busca.`);
  }
  if (contentFormatMap.hasImages) observedIntentSignals.push(`${visualOpportunities.length} imagem(ns) aparecem na SERP: a intenção tem componente visual.`);

  const limitations: string[] = [];
  if (!aio) limitations.push("Esta SERP não trouxe AI Overview; não há síntese do Google para ler.");
  if (!contentFormatMap.hasVideo && !contentFormatMap.hasShortVideos) limitations.push("Esta SERP não trouxe bloco de vídeo: o Google não está tratando audiovisual como resposta para esta busca.");
  if (!contentFormatMap.hasProducts) limitations.push("Esta SERP não trouxe produtos: nenhum sinal comercial observado.");
  limitations.push("Esta leitura usa apenas os blocos que a SERP do Google devolveu. Nenhuma página foi visitada e nenhum vídeo foi assistido.");

  return RadarSerpFeatureIntelligenceSchema.parse({
    featuresVersion: 1,
    keyword,
    itemTypes: lista(resultado.item_types).map(String),
    aiOverview,
    organicCount: doTipo("organic").length,
    /*
     * DEDUPE PRESERVANDO A PRIMEIRA ORIGEM — e a ordem importa.
     *
     * A mesma dúvida aparece no People Also Ask e nas expansões. `new Map`
     * sobre um array de pares guardaria a ÚLTIMA, e a pergunta passaria a
     * dizer que veio de uma expansão quando o Google a destacou no PAA —
     * origem mais forte, e a que sustenta "isto precisa ser respondido".
     */
    questionMap: primeiraDeCada(questionMap, item => item.question.toLowerCase()),
    entityMap: primeiraDeCada(entityMap, item => item.term.toLowerCase()),
    visualOpportunities,
    videos,
    commercialSignals: { present: products.length > 0, products },
    contentFormatMap,
    observedIntentSignals,
    limitations,
  });
}
