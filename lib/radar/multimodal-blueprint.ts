import { z } from "zod";
import { RadarSerpFeatureIntelligenceSchema, type RadarSerpFeatureIntelligence } from "./serp-features.ts";
import { radarYoutubeFormatCohorts, type RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";

/**
 * ===== BLUEPRINT COMPETITIVO MULTIFORMATO — RADAR_MULTIMODAL_1 =====
 *
 * ==================== A PERGUNTA QUE ELE RESPONDE ====================
 *
 * Não é "como escrever um artigo parecido com quem está em primeiro". É:
 *
 *   O QUE ESTA INTENÇÃO PEDE QUE SEJA PRODUZIDO?
 *
 * Um artigo? Um vídeo? Um artigo COM vídeo? Shorts? Uma seção comercial? Ou um
 * pacote inteiro em que as peças se sustentam?
 *
 * ================= POR QUE AS DUAS SERPs, E NÃO UMA =================
 *
 *   O YOUTUBE diz qual FORMATO audiovisual vence: duração, título, canal.
 *   O GOOGLE diz o que esse formato precisa COBRIR: perguntas, entidades,
 *   síntese esperada, camada comercial, linguagem visual.
 *
 * Tratá-las como duas ilhas desperdiça justamente o cruzamento: um vídeo que
 * ranqueia no YouTube E aparece no Google atravessou plataformas. Isso é sinal
 * competitivo forte — e continua sendo SINAL, nunca verdade editorial.
 *
 * ==================== NADA AQUI COPIA CONCORRENTE ====================
 *
 * O que sai são contagens, padrões nomeados e recomendações nossas. Título,
 * texto e roteiro de terceiro não atravessam este módulo.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem IA.
 */

/* =================== o cruzamento entre as duas SERPs =================== */

export const RadarCrossSerpVideoSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  /** A melhor posição dele DENTRO do YouTube. */
  youtubeBestRank: z.number().int().positive(),
  /** Em que bloco do Google ele apareceu. */
  googleBlock: z.enum(["VIDEO", "SHORT_VIDEOS"]),
  /**
   * O SINAL, e ele é explicável.
   *
   * `CROSS_PLATFORM` é o vídeo que vence nos dois lugares — e é o único que
   * autoriza a leitura "este formato atravessa plataformas".
   */
  signal: z.enum(["CROSS_PLATFORM", "YOUTUBE_ONLY", "GOOGLE_ONLY"]),
  reason: z.string().min(1),
}).strict();
export type RadarCrossSerpVideo = z.infer<typeof RadarCrossSerpVideoSchema>;

/**
 * CROSS_SERP_VIDEO_SIGNAL — quem aparece nas duas buscas.
 *
 * O cruzamento é por `videoId`, a única identidade que as duas SERPs
 * compartilham. Vídeo de Instagram ou TikTok no bloco do Google não tem
 * correspondente possível no universo do YouTube: ele entra como `GOOGLE_ONLY`
 * e é dito, em vez de sumir.
 */
export function radarCrossSerpVideoSignal(input: {
  features: RadarSerpFeatureIntelligence | null;
  youtubeUniverse: readonly RadarYoutubeUniverseEntry[];
}): RadarCrossSerpVideo[] {
  const noGoogle = new Map((input.features?.videos || [])
    .filter(item => item.youtubeVideoId)
    .map(item => [item.youtubeVideoId!, item]));
  const noYoutube = new Map(input.youtubeUniverse.map(item => [item.videoId, item]));

  const cruzados: RadarCrossSerpVideo[] = [];

  for (const [videoId, doYoutube] of noYoutube) {
    const doGoogle = noGoogle.get(videoId);
    if (!doGoogle) continue;
    cruzados.push(RadarCrossSerpVideoSchema.parse({
      videoId,
      title: doYoutube.title,
      youtubeBestRank: doYoutube.bestRank,
      googleBlock: doGoogle.block,
      signal: "CROSS_PLATFORM",
      reason: `Está na posição ${doYoutube.bestRank} do YouTube e também no bloco de ${doGoogle.block === "SHORT_VIDEOS" ? "vídeos curtos" : "vídeos"} do Google para a mesma intenção.`,
    }));
  }

  /*
   * O QUE APARECE SÓ NO GOOGLE TAMBÉM É INFORMAÇÃO.
   *
   * Um vídeo que o Google escolhe e o YouTube não devolveu para as nossas
   * consultas revela que o nosso plano de consultas não o alcançou — e isso é
   * sobre NÓS, não sobre o vídeo.
   */
  for (const [videoId, doGoogle] of noGoogle) {
    if (noYoutube.has(videoId)) continue;
    cruzados.push(RadarCrossSerpVideoSchema.parse({
      videoId,
      title: doGoogle.title,
      youtubeBestRank: 1,
      googleBlock: doGoogle.block,
      signal: "GOOGLE_ONLY",
      reason: "O Google devolve este vídeo para a intenção e as nossas consultas de YouTube não o alcançaram.",
    }));
  }

  return cruzados.sort((esquerda, direita) => {
    if (esquerda.signal !== direita.signal) return esquerda.signal === "CROSS_PLATFORM" ? -1 : 1;
    return esquerda.youtubeBestRank - direita.youtubeBestRank;
  });
}

/* ==================== a saída editorial recomendada ==================== */

export const RADAR_EDITORIAL_OUTPUTS = [
  "ARTICLE",
  "YOUTUBE_VIDEO",
  "ARTICLE_WITH_VIDEO",
  "SHORTS",
  "PRODUCT_SECTION",
  "MULTIFORMAT_PACKAGE",
] as const;
export type RadarEditorialOutput = typeof RADAR_EDITORIAL_OUTPUTS[number];

export const RADAR_EDITORIAL_OUTPUT_LABELS: Record<RadarEditorialOutput, string> = {
  ARTICLE: "Artigo",
  YOUTUBE_VIDEO: "Vídeo de YouTube",
  ARTICLE_WITH_VIDEO: "Artigo com vídeo",
  SHORTS: "Shorts",
  PRODUCT_SECTION: "Seção comercial",
  MULTIFORMAT_PACKAGE: "Pacote multiformato",
};

export const RadarMultimodalPieceSchema = z.object({
  piece: z.enum(["ARTIGO", "VIDEO_HERO", "SHORT", "SECAO_COMERCIAL", "IMAGEM"]),
  role: z.string().min(1),
  /** O que na SERP sustenta esta peça. Peça sem lastro é palpite. */
  derivedFrom: z.string().min(1),
  /*
   * ============ §7 · CADA SHORT CARREGA O PRÓPRIO SINAL ============
   *
   * "Produza 3 Shorts" é recomendação hardcoded. Cada Short aqui nasce de UMA
   * pergunta ou oportunidade observada, e leva junto o que responder e com que
   * ângulo — senão quem produz teria de reabrir a SERP para saber o porquê.
   *
   * Nulos nas peças que não são Short: a ausência é da natureza da peça, não
   * uma lacuna de dado.
   */
  sourceSignal: z.string().nullable().default(null),
  sourceQuestion: z.string().nullable().default(null),
  objective: z.string().nullable().default(null),
  suggestedAngle: z.string().nullable().default(null),
}).strict();
export type RadarMultimodalPiece = z.infer<typeof RadarMultimodalPieceSchema>;

export const RadarMultimodalBlueprintSchema = z.object({
  multimodalVersion: z.literal(1),
  generatedAt: z.string().min(1),

  /* ---------------- OBSERVED ---------------- */
  observed: z.object({
    googleFeatures: RadarSerpFeatureIntelligenceSchema.nullable(),
    youtubeLongForm: z.number().int().nonnegative(),
    youtubeShorts: z.number().int().nonnegative(),
    crossSerpVideos: z.array(RadarCrossSerpVideoSchema),
    /** Quais fontes sustentam esta leitura. Ausência de fonte é declarada. */
    sources: z.array(z.enum(["GOOGLE_SERP", "YOUTUBE_SERP"])),
  }).strict(),

  /* ---------------- RECOMMENDED ---------------- */
  recommended: z.object({
    editorialOutput: z.enum(RADAR_EDITORIAL_OUTPUTS),
    /** Por que ESTA saída, e não outra. */
    rationale: z.array(z.string().min(1)),
    pieces: z.array(RadarMultimodalPieceSchema),
    /** As perguntas que a peça principal precisa responder, vindas do Google. */
    mustAnswer: z.array(z.string().min(1)),
    /** Entidades e subtemas que a SERP trata como parte da intenção. */
    mustCover: z.array(z.string().min(1)),
  }).strict(),

  limitations: z.array(z.string()),
}).strict();
export type RadarMultimodalBlueprint = z.infer<typeof RadarMultimodalBlueprintSchema>;

/**
 * ============ A DECISÃO DE SAÍDA EDITORIAL ============
 *
 * Ela não é uma tabela fixa: cada condição aponta para um sinal OBSERVADO, e o
 * raciocínio viaja junto. Um "produza um pacote multiformato" sem o porquê
 * seria um veredito que ninguém confere contra a SERP.
 *
 * A ordem importa: o pacote exige as duas linguagens competindo ao mesmo
 * tempo. Sem isso, cai para a saída que os sinais de fato sustentam.
 */
export function radarDecideEditorialOutput(input: {
  features: RadarSerpFeatureIntelligence | null;
  longForm: number;
  shorts: number;
}): { output: RadarEditorialOutput; rationale: string[] } {
  const rationale: string[] = [];
  const formatos = input.features?.contentFormatMap;
  const temVideoNoGoogle = Boolean(formatos?.hasVideo || formatos?.hasShortVideos);
  const temTexto = Boolean(formatos?.hasOrganic);
  const temComercial = Boolean(formatos?.hasProducts);
  const temVideoNoYoutube = input.longForm > 0 || input.shorts > 0;

  if (temVideoNoGoogle) rationale.push(`O Google devolve peça audiovisual para esta intenção (${input.features!.videos.length} item(ns)): vídeo compete na busca de texto.`);
  if (temVideoNoYoutube) rationale.push(`A SERP do YouTube tem ${input.longForm} long-form e ${input.shorts} Short(s) disputando a mesma intenção.`);
  if (temComercial) rationale.push(`O Google mostra ${input.features!.commercialSignals.products.length} produto(s): há camada comercial na intenção.`);
  if (temTexto) rationale.push(`A SERP tem ${input.features!.organicCount} resultado(s) orgânico(s): texto continua disputando.`);

  /*
   * PACOTE MULTIFORMATO: as três linguagens competindo ao mesmo tempo.
   *
   * Texto E vídeo E formato curto. É o caso em que responder com uma peça só
   * deixaria duas frentes inteiras sem resposta.
   */
  if (temTexto && temVideoNoGoogle && (input.shorts > 0 || formatos?.hasShortVideos)) {
    rationale.push("Texto, vídeo longo e formato curto disputam a MESMA intenção: uma peça só deixaria duas frentes sem resposta.");
    return { output: "MULTIFORMAT_PACKAGE", rationale };
  }

  if (temTexto && temVideoNoGoogle) {
    rationale.push("Texto e vídeo disputam juntos: o artigo ganha com a peça audiovisual embutida.");
    return { output: "ARTICLE_WITH_VIDEO", rationale };
  }

  if (!temTexto && temVideoNoYoutube) {
    rationale.push("A disputa observada é audiovisual, sem concorrência de texto relevante.");
    return { output: input.shorts > input.longForm ? "SHORTS" : "YOUTUBE_VIDEO", rationale };
  }

  if (temComercial && !temVideoNoGoogle) {
    rationale.push("O sinal dominante é comercial e não há disputa audiovisual na SERP.");
    return { output: "PRODUCT_SECTION", rationale };
  }

  rationale.push("Os sinais observados sustentam uma peça de texto.");
  return { output: "ARTICLE", rationale };
}

const SEM_SINAL = { sourceSignal: null, sourceQuestion: null, objective: null, suggestedAngle: null } as const;

function montarPecas(input: {
  output: RadarEditorialOutput;
  features: RadarSerpFeatureIntelligence | null;
  longForm: number;
  shorts: number;
}): RadarMultimodalPiece[] {
  const pecas: RadarMultimodalPiece[] = [];
  const formatos = input.features?.contentFormatMap;

  if (["ARTICLE", "ARTICLE_WITH_VIDEO", "MULTIFORMAT_PACKAGE"].includes(input.output)) {
    pecas.push({ ...SEM_SINAL,
      piece: "ARTIGO", role: "Peça principal: responde a intenção por escrito e sustenta a busca do Google.",
      derivedFrom: `${input.features?.organicCount || 0} resultado(s) orgânico(s) disputando a intenção.`,
    });
  }
  if (["YOUTUBE_VIDEO", "ARTICLE_WITH_VIDEO", "MULTIFORMAT_PACKAGE"].includes(input.output)) {
    pecas.push({ ...SEM_SINAL,
      piece: "VIDEO_HERO", role: "Vídeo principal, no topo do artigo quando houver artigo.",
      derivedFrom: input.longForm ? `${input.longForm} long-form disputam esta intenção no YouTube.` : "O Google devolve vídeo para esta intenção.",
    });
  }
  if (["SHORTS", "MULTIFORMAT_PACKAGE"].includes(input.output)) {
    /*
     * OS SHORTS NASCEM DAS PERGUNTAS, não de um número fixo.
     *
     * Cada Short responde UMA pergunta que a SERP já mostrou — é isso que o
     * torna derivado de dado, e não uma quantidade escolhida a dedo.
     */
    for (const pergunta of (input.features?.questionMap || []).slice(0, 4)) {
      pecas.push({
        piece: "SHORT", role: `Short de uma ideia só: "${pergunta.question}".`,
        derivedFrom: `Pergunta observada no bloco ${pergunta.source} da SERP.`,
        sourceSignal: `Bloco ${pergunta.source} da SERP do Google.`,
        sourceQuestion: pergunta.question,
        objective: "Responder esta pergunta por completo, e só ela.",
        /*
         * O ÂNGULO SAI DA FORMA DA PERGUNTA.
         *
         * "Qual a ordem?" pede demonstração sequencial; "o que usar?" pede
         * critério de escolha. Dar o mesmo ângulo aos dois faria o Short
         * responder a pergunta errada com a resposta certa.
         */
        suggestedAngle: /ordem|passo|sequ[êe]ncia/i.test(pergunta.question)
          ? "Demonstração sequencial: mostre a ordem acontecendo, não explique a ordem."
          : /o que|qual produto|quais/i.test(pergunta.question)
            ? "Critério de escolha: mostre COMO decidir, não uma lista de marcas."
            : "Resposta direta nos primeiros segundos, com a prova logo atrás.",
      });
    }
  }
  if (formatos?.hasImages) {
    pecas.push({ ...SEM_SINAL,
      piece: "IMAGEM", role: "Apoio visual nas seções em que a explicação é de ordem ou de passo.",
      derivedFrom: `${input.features?.visualOpportunities.length} imagem(ns) na SERP para esta intenção.`,
    });
  }
  if (formatos?.hasProducts && ["MULTIFORMAT_PACKAGE", "PRODUCT_SECTION", "ARTICLE_WITH_VIDEO"].includes(input.output)) {
    pecas.push({ ...SEM_SINAL,
      piece: "SECAO_COMERCIAL", role: "Seção de critérios e recomendação de produto, ao fim da peça principal.",
      derivedFrom: `${input.features?.commercialSignals.products.length} produto(s) que o Google mostra para esta busca.`,
    });
  }

  return pecas;
}

export function buildRadarMultimodalBlueprint(input: {
  features: RadarSerpFeatureIntelligence | null;
  youtubeUniverse: readonly RadarYoutubeUniverseEntry[];
  generatedAt: string;
}): RadarMultimodalBlueprint {
  const coortes = radarYoutubeFormatCohorts(input.youtubeUniverse);
  const longForm = coortes.longForm.length;
  const shorts = coortes.shorts.length;

  const crossSerpVideos = radarCrossSerpVideoSignal({ features: input.features, youtubeUniverse: input.youtubeUniverse });
  const { output, rationale } = radarDecideEditorialOutput({ features: input.features, longForm, shorts });

  const sources: Array<"GOOGLE_SERP" | "YOUTUBE_SERP"> = [];
  if (input.features) sources.push("GOOGLE_SERP");
  if (input.youtubeUniverse.length) sources.push("YOUTUBE_SERP");

  const limitations: string[] = [];
  /*
   * A AUSÊNCIA DE UMA FONTE É DECLARADA — e ela muda o peso da leitura.
   *
   * Um blueprint montado só com o Google não sabe qual formato audiovisual
   * vence; montado só com o YouTube, não sabe o que o vídeo precisa cobrir.
   */
  if (!input.features) limitations.push("Não há SERP do Google para esta investigação: perguntas, entidades, sinais comerciais e linguagem visual não foram observados.");
  if (!input.youtubeUniverse.length) limitations.push("Não há SERP do YouTube para esta investigação: duração, título e canal vencedores não foram observados.");
  if (input.features && input.youtubeUniverse.length && !crossSerpVideos.some(item => item.signal === "CROSS_PLATFORM")) {
    limitations.push("Nenhum vídeo apareceu nas duas SERPs: não há sinal de travessia entre plataformas nesta amostra.");
  }
  limitations.push("Leitura feita apenas com os blocos que as SERPs devolveram. Nenhuma página foi visitada, nenhum vídeo foi assistido ou transcrito.");

  return RadarMultimodalBlueprintSchema.parse({
    multimodalVersion: 1,
    generatedAt: input.generatedAt,
    observed: {
      googleFeatures: input.features,
      youtubeLongForm: longForm,
      youtubeShorts: shorts,
      crossSerpVideos,
      sources,
    },
    recommended: {
      editorialOutput: output,
      rationale,
      pieces: montarPecas({ output, features: input.features, longForm, shorts }),
      mustAnswer: (input.features?.questionMap || []).map(item => item.question),
      mustCover: (input.features?.entityMap || []).map(item => item.term),
    },
    limitations,
  });
}
