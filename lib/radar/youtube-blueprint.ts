import { z } from "zod";
import {
  radarYoutubeCompetitiveSignal,
  radarYoutubeFormatCohorts,
  type RadarYoutubeUniverseEntry,
} from "./youtube-search-model.ts";
import type { RadarYoutubeSearchRun } from "./youtube-search-run.ts";

/**
 * ===== O BLUEPRINT COMPETITIVO DA SERP — YOUTUBE_SEARCH_2 =====
 *
 * ==================== O QUE ELE É, E O QUE ELE NÃO É ====================
 *
 * Ele transforma a SERP JÁ COLETADA em estratégia de vídeo. Nada é baixado,
 * transcrito ou processado: as fontes são exclusivamente o que a coleta
 * entregou — consulta, rank, título, canal, views, data, duração, formato,
 * selos e recorrência.
 *
 * A área Vídeos continua sendo a dona de fonte e transcrição DELIBERADAS. Aqui
 * é leitura de mercado; lá é acervo escolhido. Confundir as duas faria o
 * benchmark comparar a marca com ela mesma.
 *
 * ============ OBSERVADO E RECOMENDADO NUNCA SE MISTURAM — §5 ============
 *
 * `observed` é o que a SERP mostrou e pode ser conferido item a item.
 * `recommended` é o que DERIVAMOS disso, e é opinião derivada — sempre com o
 * sinal que a originou ao lado. Fundi-los faria uma sugestão nossa chegar ao
 * Planejador com a autoridade de um fato coletado.
 *
 * ============ E ELE NUNCA DESCREVE O ROTEIRO DO CONCORRENTE ============
 *
 * Não temos transcript, e por isso não sabemos a estrutura real de vídeo
 * nenhum. O roteiro daqui é RECOMENDAÇÃO derivada da intenção e do formato
 * dominante — o §6 é explícito, e o contrato carrega o aviso junto do dado.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem IA.
 */

/* ============================ as estatísticas ============================ */

/**
 * PERCENTIS SOBRE AMOSTRA PEQUENA, e a escolha importa.
 *
 * Interpolação linear entre vizinhos — o método que a maioria das planilhas
 * usa. Com cinco vídeos, "a mediana" é o terceiro; com quatro, é a média dos
 * dois do meio. Arredondar para o vizinho faria P25 e mediana coincidirem em
 * amostras pequenas e a faixa parecer mais estreita do que é.
 */
export function radarPercentil(valores: readonly number[], percentil: number): number | null {
  const ordenados = valores.filter(valor => Number.isFinite(valor)).slice().sort((esquerda, direita) => esquerda - direita);
  if (!ordenados.length) return null;
  if (ordenados.length === 1) return ordenados[0];
  const posicao = (ordenados.length - 1) * Math.min(1, Math.max(0, percentil));
  const baixo = Math.floor(posicao);
  const alto = Math.ceil(posicao);
  if (baixo === alto) return ordenados[baixo];
  return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (posicao - baixo);
}

export const RadarYoutubeRangeSchema = z.object({
  /** Quantos itens da coorte tinham o dado. Nunca é o tamanho da coorte. */
  sampleSize: z.number().int().nonnegative(),
  p25: z.number().nullable(),
  median: z.number().nullable(),
  p75: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
}).strict();
export type RadarYoutubeRange = z.infer<typeof RadarYoutubeRangeSchema>;

/**
 * A FAIXA DECLARA DE QUANTOS ITENS ELA SAIU.
 *
 * Uma mediana de duração calculada sobre dois vídeos e outra sobre quinze têm o
 * mesmo formato e pesos completamente diferentes. Sem `sampleSize`, quem lê
 * trata as duas igual.
 */
export function radarYoutubeRange(valores: readonly (number | null)[]): RadarYoutubeRange {
  const presentes = valores.filter((valor): valor is number => typeof valor === "number" && Number.isFinite(valor));
  const arredondar = (valor: number | null) => valor === null ? null : Math.round(valor);
  return RadarYoutubeRangeSchema.parse({
    sampleSize: presentes.length,
    p25: arredondar(radarPercentil(presentes, 0.25)),
    median: arredondar(radarPercentil(presentes, 0.5)),
    p75: arredondar(radarPercentil(presentes, 0.75)),
    min: presentes.length ? Math.min(...presentes) : null,
    max: presentes.length ? Math.max(...presentes) : null,
  });
}

/* ========================= §3 · os padrões de título ======================= */

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O VOCABULÁRIO DE PADRÕES — declarado, não inferido por IA.
 *
 * Cada padrão é um jeito de PROMETER, e é a promessa que a SERP repete. O
 * marcador é o sinal textual que o identifica; o rótulo é o que a tela mostra.
 *
 * Nada aqui copia título: o que sai é o NOME do padrão e quantos títulos o
 * exibem. Reproduzir o título do concorrente seria entregar o texto dele como
 * se fosse material nosso.
 */
export const RADAR_YOUTUBE_TITLE_PATTERNS = [
  { id: "PASSO_A_PASSO", label: "Passo a passo", marcadores: ["passo a passo", "passo-a-passo", "como fazer", "tutorial"] },
  { id: "COMO", label: "Como (instrucional)", marcadores: ["como ", "aprenda", "guia"] },
  { id: "LISTA", label: "Lista numerada", marcadores: ["top ", "melhores", "piores", "dicas"] },
  { id: "RANKING", label: "Ranking", marcadores: ["ranking", "top 3", "top 5", "top 10", "os melhores"] },
  { id: "PERGUNTA", label: "Pergunta", marcadores: ["?"] },
  { id: "COMPARACAO", label: "Comparação", marcadores: [" vs ", " ou ", "comparativo", "qual o melhor", "qual e melhor", "diferenca entre"] },
  { id: "PROBLEMA_SOLUCAO", label: "Problema → solução", marcadores: ["acabe com", "acabar com", "resolva", "elimine", "controlar", "como tratar"] },
  { id: "NAO_FACA", label: "Alerta / não faça", marcadores: ["nao faca", "nao compre", "pare de", "cuidado", "erros", "nunca", "mitos"] },
  { id: "VALE_A_PENA", label: "Vale a pena", marcadores: ["vale a pena", "vale o investimento", "funciona mesmo", "funciona?"] },
  { id: "CUSTO_BENEFICIO", label: "Custo-benefício", marcadores: ["barato", "baratinho", "custo beneficio", "custo-beneficio", "gastando", "reais", "economia"] },
  { id: "ROTINA", label: "Rotina", marcadores: ["rotina", "manha e noite", "dia a dia", "skincare da manha", "meu skincare"] },
  { id: "REVIEW", label: "Review / resenha", marcadores: ["resenha", "review", "testei", "avaliando", "dando nota"] },
  { id: "TRANSFORMACAO", label: "Transformação", marcadores: ["transformou", "antes e depois", "em 7 dias", "em 30 dias", "resultado"] },
  { id: "AUTORIDADE", label: "Autoridade profissional", marcadores: ["dermatologista", "medic", "especialista", "dra.", "dr.", "profissional explica", "explica"] },
] as const;

export type RadarYoutubeTitlePatternId = typeof RADAR_YOUTUBE_TITLE_PATTERNS[number]["id"];

export const RadarYoutubeTitlePatternSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Quantos títulos da coorte exibem o padrão. */
  count: z.number().int().nonnegative(),
  /** Fatia da coorte, de 0 a 1. Existe para "3" não parecer igual em 4 e em 40. */
  share: z.number().min(0).max(1),
}).strict();
export type RadarYoutubeTitlePattern = z.infer<typeof RadarYoutubeTitlePatternSchema>;

export function radarYoutubeTitlePatterns(titulos: readonly string[]): RadarYoutubeTitlePattern[] {
  const normalizados = titulos.map(semAcento);
  return RADAR_YOUTUBE_TITLE_PATTERNS
    .map(padrao => {
      const count = normalizados.filter(titulo => padrao.marcadores.some(marcador => titulo.includes(marcador))).length;
      return RadarYoutubeTitlePatternSchema.parse({
        id: padrao.id, label: padrao.label, count,
        share: normalizados.length ? count / normalizados.length : 0,
      });
    })
    .filter(padrao => padrao.count > 0)
    .sort((esquerda, direita) => direita.count - esquerda.count || esquerda.id.localeCompare(direita.id));
}

/**
 * PALAVRAS VAZIAS DO PORTUGUÊS — e elas não são ruído neutro.
 *
 * Sem esta lista, "para", "com" e "de" seriam sempre os termos mais recorrentes
 * de qualquer SERP em português, e a leitura de temas viraria gramática.
 */
const VAZIAS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "por", "para", "pra", "com", "sem", "e", "ou", "que", "se", "ao", "aos", "as", "mais", "menos", "meu", "minha",
  "seu", "sua", "isso", "este", "esta", "esse", "essa", "the", "for", "and", "you", "your", "shorts", "video", "videos",
]);

export const RadarYoutubeTermSchema = z.object({
  term: z.string().min(1),
  count: z.number().int().positive(),
}).strict();
export type RadarYoutubeTerm = z.infer<typeof RadarYoutubeTermSchema>;

/**
 * OS TERMOS QUE A SERP REPETE — §3, e NÃO os títulos.
 *
 * Um termo só entra se aparecer em mais de um título: uma palavra usada por um
 * vídeo só descreve aquele vídeo, não o mercado. É esse corte que separa
 * "padrão observado" de "eu li um título".
 */
export function radarYoutubeRecurrentTerms(titulos: readonly string[], limite = 12): RadarYoutubeTerm[] {
  const contagem = new Map<string, number>();
  for (const titulo of titulos) {
    const palavras = new Set(
      semAcento(titulo)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(palavra => palavra.length >= 4 && !VAZIAS.has(palavra)),
    );
    for (const palavra of palavras) contagem.set(palavra, (contagem.get(palavra) || 0) + 1);
  }
  return [...contagem.entries()]
    .filter(([, count]) => count > 1)
    .map(([term, count]) => RadarYoutubeTermSchema.parse({ term, count }))
    .sort((esquerda, direita) => direita.count - esquerda.count || esquerda.term.localeCompare(direita.term))
    .slice(0, limite);
}

/* ======================= §2 · a coorte, descrita ======================== */

export const RadarYoutubeChannelSchema = z.object({
  channelId: z.string().nullable(),
  channelName: z.string().min(1),
  videos: z.number().int().positive(),
  bestRank: z.number().int().positive(),
}).strict();

export const RadarYoutubeCohortSchema = z.object({
  format: z.enum(["LONG_FORM", "SHORTS"]),
  videoCount: z.number().int().nonnegative(),
  durationSeconds: RadarYoutubeRangeSchema,
  views: RadarYoutubeRangeSchema,
  /** Em meses, contra o instante da coleta. Nunca contra o relógio de quem lê. */
  ageMonths: RadarYoutubeRangeSchema,
  occurrence: RadarYoutubeRangeSchema,
  dominantChannels: z.array(RadarYoutubeChannelSchema),
  titlePatterns: z.array(RadarYoutubeTitlePatternSchema),
  recurrentTerms: z.array(RadarYoutubeTermSchema),
  /** Declarado quando a coorte é pequena demais para sustentar leitura. */
  limitations: z.array(z.string()),
}).strict();
export type RadarYoutubeCohort = z.infer<typeof RadarYoutubeCohortSchema>;

/**
 * ABAIXO DISTO A COORTE NÃO SUSTENTA LEITURA — e o número é declarado.
 *
 * Com menos de quatro vídeos, "a mediana de duração" e "o padrão dominante" são
 * o gosto de duas ou três pessoas. A coorte continua sendo mostrada; o que muda
 * é que ela CHEGA com a ressalva, em vez de chegar com ar de estatística.
 */
export const RADAR_YOUTUBE_MIN_COHORT = 4;

const idadeEmMeses = (publishedAt: string | null, collectedAt: string | null): number | null => {
  const referencia = collectedAt ? Date.parse(collectedAt) : Number.NaN;
  const publicado = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  if (!Number.isFinite(referencia) || !Number.isFinite(publicado)) return null;
  return Math.max(0, (referencia - publicado) / (1000 * 60 * 60 * 24 * 30.44));
};

export function radarYoutubeCohort(input: {
  format: "LONG_FORM" | "SHORTS";
  entries: readonly RadarYoutubeUniverseEntry[];
  collectedAt: string | null;
}): RadarYoutubeCohort {
  const { entries } = input;
  const titulos = entries.map(item => item.title);

  const porCanal = new Map<string, { channelId: string | null; channelName: string; videos: number; bestRank: number }>();
  for (const item of entries) {
    const nome = item.channelName;
    if (!nome) continue;
    const chave = item.channelId || nome;
    const atual = porCanal.get(chave);
    if (atual) {
      atual.videos += 1;
      atual.bestRank = Math.min(atual.bestRank, item.bestRank);
      continue;
    }
    porCanal.set(chave, { channelId: item.channelId, channelName: nome, videos: 1, bestRank: item.bestRank });
  }

  const limitations: string[] = [];
  if (entries.length === 0) {
    limitations.push(`A SERP não devolveu nenhum vídeo ${input.format === "SHORTS" ? "curto" : "long-form"} para estas consultas.`);
  } else if (entries.length < RADAR_YOUTUBE_MIN_COHORT) {
    limitations.push(`Esta coorte tem ${entries.length} vídeo(s): abaixo de ${RADAR_YOUTUBE_MIN_COHORT} os padrões descrevem casos, não mercado.`);
  }

  const semDuracao = entries.filter(item => item.durationSeconds === null).length;
  if (semDuracao) limitations.push(`${semDuracao} vídeo(s) vieram sem duração e ficaram fora da faixa.`);
  const semViews = entries.filter(item => item.views === null).length;
  if (semViews) limitations.push(`${semViews} vídeo(s) vieram sem visualizações e ficaram fora da faixa.`);

  return RadarYoutubeCohortSchema.parse({
    format: input.format,
    videoCount: entries.length,
    durationSeconds: radarYoutubeRange(entries.map(item => item.durationSeconds)),
    views: radarYoutubeRange(entries.map(item => item.views)),
    ageMonths: radarYoutubeRange(entries.map(item => idadeEmMeses(item.publishedAt, input.collectedAt))),
    occurrence: radarYoutubeRange(entries.map(item => item.occurrenceCount)),
    /* Dominante é quem repete: um canal com um vídeo só não domina nada. */
    dominantChannels: [...porCanal.values()]
      .filter(canal => canal.videos > 1)
      .sort((esquerda, direita) => direita.videos - esquerda.videos || esquerda.bestRank - direita.bestRank || esquerda.channelName.localeCompare(direita.channelName))
      .slice(0, 5)
      .map(canal => RadarYoutubeChannelSchema.parse(canal)),
    titlePatterns: radarYoutubeTitlePatterns(titulos),
    recurrentTerms: radarYoutubeRecurrentTerms(titulos),
    limitations,
  });
}

/* ===================== §4 · a intenção audiovisual ====================== */

export const RADAR_YOUTUBE_AV_FORMATS = [
  { id: "TUTORIAL", label: "Tutorial", padroes: ["PASSO_A_PASSO", "COMO"] },
  { id: "ROTINA", label: "Rotina", padroes: ["ROTINA"] },
  { id: "REVIEW", label: "Review / resenha", padroes: ["REVIEW", "VALE_A_PENA"] },
  { id: "COMPARACAO", label: "Comparação", padroes: ["COMPARACAO"] },
  { id: "RANKING", label: "Ranking / lista", padroes: ["RANKING", "LISTA"] },
  { id: "OPINIAO_PROFISSIONAL", label: "Opinião profissional", padroes: ["AUTORIDADE"] },
  { id: "ALERTA", label: "Alerta / desmistificação", padroes: ["NAO_FACA"] },
  { id: "SOLUCAO", label: "Problema → solução", padroes: ["PROBLEMA_SOLUCAO"] },
  { id: "CUSTO", label: "Custo-benefício", padroes: ["CUSTO_BENEFICIO"] },
  { id: "TRANSFORMACAO", label: "Transformação", padroes: ["TRANSFORMACAO"] },
] as const;

export const RadarYoutubeAvFormatSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().positive(),
  share: z.number().min(0).max(1),
}).strict();
export type RadarYoutubeAvFormat = z.infer<typeof RadarYoutubeAvFormatSchema>;

/**
 * MAIS DE UM FORMATO PODE VENCER — §4 é explícito.
 *
 * Forçar um único "formato dominante" numa SERP que mistura tutorial e review
 * inventaria uma maioria que não existe. O que sai é a lista ordenada, com a
 * fatia de cada um, e quem lê vê o empate quando ele é real.
 */
export function radarYoutubeAvFormats(padroes: readonly RadarYoutubeTitlePattern[], total: number): RadarYoutubeAvFormat[] {
  const porPadrao = new Map(padroes.map(item => [item.id, item.count]));
  return RADAR_YOUTUBE_AV_FORMATS
    .map(formato => {
      /* Um título pode servir a dois padrões do mesmo formato; o maior conta. */
      const count = Math.max(0, ...formato.padroes.map(padrao => porPadrao.get(padrao) || 0));
      return { id: formato.id, label: formato.label, count, share: total ? count / total : 0 };
    })
    .filter(formato => formato.count > 0)
    .map(formato => RadarYoutubeAvFormatSchema.parse(formato))
    .sort((esquerda, direita) => direita.count - esquerda.count || esquerda.id.localeCompare(direita.id));
}

/* ============ §5 · o sinal observado e a estratégia recomendada ========== */

export const RadarYoutubeRecommendationSchema = z.object({
  /** O eixo da recomendação: linguagem, promessa, duração… */
  dimension: z.string().min(1),
  /** O QUE A SERP MOSTROU. Conferível item a item na amostra. */
  observedSignal: z.string().min(1),
  /** O QUE DERIVAMOS DISSO. Opinião derivada, nunca coleta. */
  recommendedStrategy: z.string().min(1),
}).strict();
export type RadarYoutubeRecommendation = z.infer<typeof RadarYoutubeRecommendationSchema>;

/* ====================== §6 · o roteiro recomendado ===================== */

export const RadarYoutubeScriptBlockSchema = z.object({
  block: z.string().min(1),
  purpose: z.string().min(1),
  /** De onde veio a sugestão deste bloco. Vazio seria recomendação sem lastro. */
  derivedFrom: z.string().min(1),
}).strict();
export type RadarYoutubeScriptBlock = z.infer<typeof RadarYoutubeScriptBlockSchema>;

/**
 * O AVISO VIAJA COM O DADO, não no rodapé da tela.
 *
 * Sem transcript não sabemos a estrutura real de vídeo nenhum. Quem consumir o
 * blueprint em outro módulo — Planejador, Redator — precisa receber essa
 * ressalva junto do roteiro, e não depender de ter lido a tela que o exibiu.
 */
export const RADAR_YOUTUBE_SCRIPT_DISCLAIMER =
  "Roteiro RECOMENDADO, derivado da intenção e do formato dominante da SERP. Não é a estrutura literal dos concorrentes: esta pesquisa não baixa nem transcreve vídeo.";

/* ========================= §9 · as lacunas ========================= */

export const RadarYoutubeGapSchema = z.object({
  kind: z.enum(["TOPICO_SEM_COBERTURA", "FORMATO_AUSENTE", "PROMESSA_REPETITIVA", "ACERVO_ANTIGO", "AUTORIDADE_ESCASSA"]),
  statement: z.string().min(1),
  /** O que na SERP sustenta a lacuna. Sem isso, "oportunidade" vira palpite. */
  evidence: z.string().min(1),
}).strict();
export type RadarYoutubeGap = z.infer<typeof RadarYoutubeGapSchema>;

/* ====================== §10 e §11 · o blueprint ====================== */

export const RADAR_YOUTUBE_BLUEPRINT_DESTINATIONS = ["STANDALONE_YOUTUBE_VIDEO", "ARTICLE_VIDEO", "BOTH"] as const;

export const RadarYoutubeBlueprintSchema = z.object({
  blueprintVersion: z.literal(1),
  /** O fingerprint da corrida que o originou. É o que amarra leitura e coleta. */
  runId: z.string().min(1),
  runFingerprint: z.string().min(1),
  generatedAt: z.string().min(1),

  /* ---- o que foi OBSERVADO ---- */
  observed: z.object({
    /** A intenção declarada pelo Arquiteto, não inferida da SERP. */
    declaredIntent: z.string().nullable(),
    universeSize: z.number().int().nonnegative(),
    comparableSize: z.number().int().nonnegative(),
    longForm: RadarYoutubeCohortSchema,
    shorts: RadarYoutubeCohortSchema,
    avFormats: z.array(RadarYoutubeAvFormatSchema),
    /** Canais que repetem em QUALQUER coorte — a leitura de quem domina. */
    recurrentChannels: z.array(RadarYoutubeChannelSchema),
    /** Vídeos que apareceram em mais de uma consulta. Força, não verdade (§8). */
    crossQueryVideos: z.array(z.object({
      videoId: z.string().min(1),
      title: z.string().min(1),
      occurrenceCount: z.number().int().positive(),
      bestRank: z.number().int().positive(),
      signalLevel: z.string().min(1),
      signalReasons: z.array(z.string().min(1)),
    }).strict()),
  }).strict(),

  /* ---- o que foi RECOMENDADO a partir disso ---- */
  recommended: z.object({
    destination: z.enum(RADAR_YOUTUBE_BLUEPRINT_DESTINATIONS),
    format: z.string().min(1),
    durationSecondsRange: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }).strict().nullable(),
    strategy: z.array(RadarYoutubeRecommendationSchema),
    script: z.array(RadarYoutubeScriptBlockSchema),
    scriptDisclaimer: z.literal(RADAR_YOUTUBE_SCRIPT_DISCLAIMER),
    titleOpportunities: z.array(z.string().min(1)),
    gaps: z.array(RadarYoutubeGapSchema),
  }).strict(),

  limitations: z.array(z.string()),
}).strict();
export type RadarYoutubeBlueprint = z.infer<typeof RadarYoutubeBlueprintSchema>;

/* ---------------------- as derivações, uma a uma ---------------------- */

const maiorFormato = (formatos: readonly RadarYoutubeAvFormat[]) => formatos[0] || null;

/**
 * A FAIXA RECOMENDADA SAI DA OBSERVADA — §7, e nunca é um número mágico.
 *
 * P25→P75 da coorte que vai ser disputada. Recomendar a mediana exata faria
 * todo vídeo mirar o mesmo minuto; recomendar min→max não recomendaria nada.
 */
function faixaRecomendada(coorte: RadarYoutubeCohort): { min: number; max: number } | null {
  const baixo = coorte.durationSeconds.p25;
  const alto = coorte.durationSeconds.p75;
  if (baixo === null || alto === null || baixo <= 0) return null;
  return { min: Math.max(1, Math.round(baixo)), max: Math.max(Math.round(alto), Math.round(baixo) + 1) };
}

function estrategia(input: {
  coorte: RadarYoutubeCohort;
  formatos: readonly RadarYoutubeAvFormat[];
  declaredIntent: string | null;
  canaisRecorrentes: readonly z.infer<typeof RadarYoutubeChannelSchema>[];
}): RadarYoutubeRecommendation[] {
  const recomendacoes: RadarYoutubeRecommendation[] = [];
  const total = input.coorte.videoCount;
  const padrao = (id: string) => input.coorte.titlePatterns.find(item => item.id === id);

  /* LINGUAGEM E NÍVEL TÉCNICO — a partir de quem assina os vídeos do topo. */
  const autoridade = padrao("AUTORIDADE");
  recomendacoes.push(RadarYoutubeRecommendationSchema.parse({
    dimension: "Linguagem e nível técnico",
    observedSignal: autoridade
      ? `${autoridade.count} de ${total} título(s) invocam autoridade profissional.`
      : `Nenhum dos ${total} título(s) invoca autoridade profissional explícita.`,
    recommendedStrategy: autoridade && autoridade.share >= 0.3
      ? "Linguagem técnica acessível, com a credencial visível no título e no hook: a SERP premia quem assina."
      : "Linguagem direta e cotidiana; a credencial pode ficar no corpo, sem ocupar o título.",
  }));

  /* PROMESSA E ESPECIFICIDADE. */
  const custo = padrao("CUSTO_BENEFICIO");
  const transformacao = padrao("TRANSFORMACAO");
  recomendacoes.push(RadarYoutubeRecommendationSchema.parse({
    dimension: "Promessa",
    observedSignal: [
      custo ? `${custo.count} título(s) prometem custo-benefício` : null,
      transformacao ? `${transformacao.count} prometem transformação` : null,
    ].filter(Boolean).join(" e ") || "Nenhuma promessa de preço ou de resultado aparece de forma recorrente.",
    recommendedStrategy: custo || transformacao
      ? "Prometa um resultado ESPECÍFICO e verificável; a faixa de promessa genérica já está saturada."
      : "Há espaço para uma promessa concreta — a SERP está dominada por títulos descritivos.",
  }));

  /* POSICIONAMENTO E AUTORIDADE — quantos canais repetem. */
  recomendacoes.push(RadarYoutubeRecommendationSchema.parse({
    dimension: "Posicionamento",
    observedSignal: input.canaisRecorrentes.length
      ? `${input.canaisRecorrentes.length} canal(is) aparecem com mais de um vídeo; o mais recorrente tem ${input.canaisRecorrentes[0].videos}.`
      : "Nenhum canal repete: a SERP está pulverizada.",
    recommendedStrategy: input.canaisRecorrentes.length
      ? "Disputar por ÂNGULO, não por volume: os canais recorrentes já ocupam a busca genérica."
      : "A busca está aberta — consistência de publicação tende a render posição aqui.",
  }));

  /* URGÊNCIA — a partir da recência observada. */
  const idadeMediana = input.coorte.ageMonths.median;
  recomendacoes.push(RadarYoutubeRecommendationSchema.parse({
    dimension: "Urgência e recência",
    observedSignal: idadeMediana === null
      ? "O provider não informou data suficiente para ler recência."
      : `A mediana de idade da coorte é de ${Math.round(idadeMediana)} mês(es).`,
    recommendedStrategy: idadeMediana === null
      ? "Sem leitura de recência: trate o tema como perene até haver dado."
      : idadeMediana > 24
        ? "O acervo que ranqueia é antigo: conteúdo atual tem vantagem só por ser atual."
        : "O acervo é recente: a disputa é por qualidade e ângulo, não por atualização.",
  }));

  /* FOCO E CTA — a partir da intenção declarada. */
  const comercial = /COMMERCIAL|TRANSACTIONAL|COMERCIAL|TRANSACIONAL/i.test(input.declaredIntent || "");
  recomendacoes.push(RadarYoutubeRecommendationSchema.parse({
    dimension: "Foco e CTA",
    observedSignal: input.declaredIntent
      ? `A intenção declarada pelo Arquiteto é "${input.declaredIntent}".`
      : "O Arquiteto não fechou a classificação de intenção deste artigo.",
    recommendedStrategy: comercial
      ? "Foco comercial: CTA de decisão (comparar, escolher, conferir a opção recomendada)."
      : "Foco educativo: CTA de continuidade (aprofundar, salvar, acompanhar a série).",
  }));

  /* FORMATO — o que a SERP mais repete. */
  const dominante = maiorFormato(input.formatos);
  recomendacoes.push(RadarYoutubeRecommendationSchema.parse({
    dimension: "Formato",
    observedSignal: dominante
      ? `O formato mais recorrente é ${dominante.label} (${dominante.count} de ${total}).`
      : "Nenhum formato audiovisual se repete o suficiente para ser lido como dominante.",
    recommendedStrategy: dominante
      ? `Entregar em ${dominante.label} para competir no mesmo terreno — ou deliberadamente em outro, para diferenciar.`
      : "Escolha o formato pela intenção do artigo: a SERP não indica preferência.",
  }));

  return recomendacoes;
}

function roteiro(input: { formatos: readonly RadarYoutubeAvFormat[]; declaredIntent: string | null; shorts: boolean }): RadarYoutubeScriptBlock[] {
  const dominante = maiorFormato(input.formatos);
  const origem = dominante ? `formato dominante da SERP (${dominante.label})` : "intenção declarada do artigo";

  /*
   * SHORT NÃO É LONG-FORM ENCURTADO — §2 e §6.
   *
   * Um Short não tem contexto, desenvolvimento e conclusão: ele tem gancho,
   * entrega e corte. Devolver a mesma estrutura para os dois faria o roteiro
   * recomendado descrever um formato que ninguém está disputando.
   */
  if (input.shorts) {
    return [
      { block: "GANCHO", purpose: "Afirmar o resultado ou o erro nos primeiros 2 segundos.", derivedFrom: origem },
      { block: "ENTREGA", purpose: "Uma informação só, completa e verificável.", derivedFrom: origem },
      { block: "PROVA", purpose: "Demonstração rápida ou credencial que sustenta a afirmação.", derivedFrom: origem },
      { block: "CORTE", purpose: "Encerrar no ponto alto, com CTA curto de continuidade.", derivedFrom: origem },
    ].map(bloco => RadarYoutubeScriptBlockSchema.parse(bloco));
  }

  const comercial = /COMMERCIAL|TRANSACTIONAL|COMERCIAL|TRANSACIONAL/i.test(input.declaredIntent || "");
  return [
    { block: "HOOK", purpose: "Promessa direta ligada à intenção da busca.", derivedFrom: origem },
    { block: "CONTEXTO", purpose: "Por que isso importa para quem procurou.", derivedFrom: origem },
    { block: "BLOCO 1", purpose: "O fundamento principal do tema.", derivedFrom: origem },
    { block: "BLOCO 2", purpose: "A aplicação prática do fundamento.", derivedFrom: origem },
    { block: "BLOCO 3", purpose: "Erros e objeções que a busca revela.", derivedFrom: origem },
    { block: "DEMONSTRAÇÃO", purpose: "Exemplo concreto quando o formato pede.", derivedFrom: origem },
    { block: "CONCLUSÃO", purpose: "Síntese do que foi entregue.", derivedFrom: origem },
    { block: "CTA", purpose: comercial ? "Ação de decisão." : "Ação de continuidade.", derivedFrom: "intenção declarada do artigo" },
  ].map(bloco => RadarYoutubeScriptBlockSchema.parse(bloco));
}

function lacunas(input: {
  topicos: readonly string[];
  universo: readonly RadarYoutubeUniverseEntry[];
  longForm: RadarYoutubeCohort;
  shorts: RadarYoutubeCohort;
}): RadarYoutubeGap[] {
  const encontradas: RadarYoutubeGap[] = [];
  const titulos = input.universo.map(item => semAcento(item.title));

  /*
   * TÓPICO DO ARTIGO QUE A SERP NÃO COBRE — §9.
   *
   * A comparação é entre o que o Arquiteto decidiu cobrir e o que a busca
   * devolveu. Um tópico cujas palavras não aparecem em título nenhum é onde a
   * autoridade especializada tem espaço.
   */
  for (const topico of input.topicos) {
    const palavras = semAcento(topico).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(palavra => palavra.length >= 4 && !VAZIAS.has(palavra));
    if (!palavras.length) continue;
    const cobertos = titulos.filter(titulo => palavras.every(palavra => titulo.includes(palavra))).length;
    if (cobertos === 0) {
      encontradas.push(RadarYoutubeGapSchema.parse({
        kind: "TOPICO_SEM_COBERTURA",
        statement: `O tópico "${topico}" não aparece em nenhum título da amostra.`,
        evidence: `Nenhum dos ${titulos.length} títulos coletados contém os termos centrais deste tópico.`,
      }));
    }
  }

  /* FORMATO AUSENTE: uma das coortes está vazia. */
  for (const coorte of [input.longForm, input.shorts]) {
    if (coorte.videoCount === 0) {
      encontradas.push(RadarYoutubeGapSchema.parse({
        kind: "FORMATO_AUSENTE",
        statement: `Não há ${coorte.format === "SHORTS" ? "Shorts" : "long-form"} disputando estas consultas.`,
        evidence: `A coorte ${coorte.format} ficou com zero vídeo na amostra coletada.`,
      }));
    }
  }

  /* PROMESSA REPETITIVA: um padrão domina mais de 60% da amostra. */
  const dominante = input.longForm.titlePatterns[0];
  if (dominante && dominante.share >= 0.6) {
    encontradas.push(RadarYoutubeGapSchema.parse({
      kind: "PROMESSA_REPETITIVA",
      statement: `O padrão "${dominante.label}" domina a amostra e ficou previsível.`,
      evidence: `${dominante.count} de ${input.longForm.videoCount} títulos long-form usam o mesmo padrão.`,
    }));
  }

  /* ACERVO ANTIGO: mediana acima de dois anos. */
  const idade = input.longForm.ageMonths.median;
  if (idade !== null && idade > 24) {
    encontradas.push(RadarYoutubeGapSchema.parse({
      kind: "ACERVO_ANTIGO",
      statement: "O que ranqueia é antigo: há espaço para conteúdo atualizado.",
      evidence: `A mediana de idade do long-form é de ${Math.round(idade)} meses.`,
    }));
  }

  /*
   * AUTORIDADE ESCASSA — e ela se declara no TÍTULO **ou** no CANAL.
   *
   * A leitura da SERP real expôs o erro de olhar só o título: os canais que
   * dominavam eram "Dra. Marina Hayashida" e "Dr. Alan Ost", e o blueprint
   * anunciava "pouca autoridade na amostra" enquanto dois médicos ocupavam o
   * topo. Quem lesse isso concluiria que há espaço especializado onde não há.
   *
   * O nome do canal É credencial declarada: ele aparece embaixo de cada
   * miniatura, antes de qualquer clique.
   */
  const CREDENCIAIS = ["dermatolog", "medic", "dra.", "dra ", "dr.", "dr ", "especialista", "esteticista", "farmaceutic", "nutricion", "biomedic"];
  const comCredencial = new Set<string>();
  for (const item of input.universo) {
    const assinatura = `${semAcento(item.title)} ${semAcento(item.channelName || "")}`;
    if (CREDENCIAIS.some(termo => assinatura.includes(termo))) comCredencial.add(item.videoId);
  }
  const fatia = input.universo.length ? comCredencial.size / input.universo.length : 0;
  if (input.universo.length >= RADAR_YOUTUBE_MIN_COHORT && fatia < 0.25) {
    encontradas.push(RadarYoutubeGapSchema.parse({
      kind: "AUTORIDADE_ESCASSA",
      statement: "Pouca autoridade declarada na amostra: espaço para posicionamento especializado.",
      evidence: `${comCredencial.size} de ${input.universo.length} vídeos declaram credencial profissional no título ou no nome do canal.`,
    }));
  }

  return encontradas;
}

/**
 * §3 · AS OPORTUNIDADES DE TÍTULO — padrões AUSENTES, nunca títulos copiados.
 *
 * O que sai é o nome de um padrão que a SERP não usa. Copiar um título
 * observado e sugerir variação dele entregaria o texto do concorrente como
 * material nosso.
 */
export function radarYoutubeTitleOpportunities(padroes: readonly RadarYoutubeTitlePattern[]): string[] {
  const usados = new Set(padroes.filter(item => item.count > 0).map(item => item.id));
  return RADAR_YOUTUBE_TITLE_PATTERNS
    .filter(padrao => !usados.has(padrao.id))
    .map(padrao => `${padrao.label}: nenhum título da amostra usa este padrão.`);
}

/* ========================= a montagem do blueprint ======================= */

export function buildRadarYoutubeBlueprint(input: {
  run: RadarYoutubeSearchRun;
  declaredIntent: string | null;
  editorialTopics: readonly string[];
  destination?: typeof RADAR_YOUTUBE_BLUEPRINT_DESTINATIONS[number];
  generatedAt: string;
}): RadarYoutubeBlueprint {
  const { run } = input;
  const coortes = radarYoutubeFormatCohorts(run.universe);
  const collectedAt = run.provenance.collectedAt;

  const longForm = radarYoutubeCohort({ format: "LONG_FORM", entries: coortes.longForm, collectedAt });
  const shorts = radarYoutubeCohort({ format: "SHORTS", entries: coortes.shorts, collectedAt });

  const comparaveis = [...coortes.longForm, ...coortes.shorts];
  const avFormats = radarYoutubeAvFormats(
    radarYoutubeTitlePatterns(comparaveis.map(item => item.title)),
    comparaveis.length,
  );

  /* Canais que repetem em qualquer coorte, somados — a leitura de domínio. */
  const porCanal = new Map<string, z.infer<typeof RadarYoutubeChannelSchema>>();
  for (const canal of [...longForm.dominantChannels, ...shorts.dominantChannels]) {
    const chave = canal.channelId || canal.channelName;
    const atual = porCanal.get(chave);
    if (!atual) { porCanal.set(chave, { ...canal }); continue; }
    atual.videos += canal.videos;
    atual.bestRank = Math.min(atual.bestRank, canal.bestRank);
  }
  const recurrentChannels = [...porCanal.values()]
    .sort((esquerda, direita) => direita.videos - esquerda.videos || esquerda.bestRank - direita.bestRank)
    .map(canal => RadarYoutubeChannelSchema.parse(canal));

  const executadas = run.queries.filter(item => item.executed).length || run.queries.length;
  const crossQueryVideos = run.universe
    .filter(item => item.occurrenceCount > 1)
    .map(item => {
      const sinal = radarYoutubeCompetitiveSignal({ entry: item, totalQueries: executadas, collectedAt });
      return {
        videoId: item.videoId, title: item.title,
        occurrenceCount: item.occurrenceCount, bestRank: item.bestRank,
        signalLevel: sinal.level, signalReasons: sinal.reasons,
      };
    })
    .sort((esquerda, direita) => direita.occurrenceCount - esquerda.occurrenceCount || esquerda.bestRank - direita.bestRank);

  /*
   * A COORTE QUE GOVERNA A RECOMENDAÇÃO é a maior — e nunca as duas somadas.
   *
   * Recomendar duração a partir de long-form e Shorts juntos produziria uma
   * faixa que nenhum dos dois formatos reconhece; é a proibição do §2.
   */
  const coorteLider = shorts.videoCount > longForm.videoCount ? shorts : longForm;
  const dominante = maiorFormato(avFormats);

  const limitations = [
    ...run.limitations,
    ...longForm.limitations.map(item => `LONG-FORM · ${item}`),
    ...shorts.limitations.map(item => `SHORTS · ${item}`),
    /*
     * O TETO DA LEITURA, DITO SEMPRE — não só quando a amostra é pequena.
     *
     * Tudo aqui sai de título, canal, número e data. Abordagem, argumentação e
     * roteiro real dos concorrentes NÃO foram observados, e nenhuma linha deste
     * blueprint pode ser lida como se tivessem sido.
     */
    "Esta leitura usa apenas o que a SERP do YouTube entrega: título, canal, posição, duração, formato, visualizações e data. Nenhum vídeo foi baixado, assistido ou transcrito.",
  ];

  return RadarYoutubeBlueprintSchema.parse({
    blueprintVersion: 1,
    runId: run.runId,
    runFingerprint: run.fingerprint.signature,
    generatedAt: input.generatedAt,
    observed: {
      declaredIntent: input.declaredIntent,
      universeSize: run.universe.length,
      comparableSize: comparaveis.length,
      longForm, shorts, avFormats, recurrentChannels, crossQueryVideos,
    },
    recommended: {
      destination: input.destination || "BOTH",
      format: dominante ? dominante.label : "Definido pela intenção do artigo",
      durationSecondsRange: faixaRecomendada(coorteLider),
      strategy: estrategia({ coorte: coorteLider, formatos: avFormats, declaredIntent: input.declaredIntent, canaisRecorrentes: recurrentChannels }),
      script: roteiro({ formatos: avFormats, declaredIntent: input.declaredIntent, shorts: coorteLider.format === "SHORTS" }),
      scriptDisclaimer: RADAR_YOUTUBE_SCRIPT_DISCLAIMER,
      titleOpportunities: radarYoutubeTitleOpportunities(coorteLider.titlePatterns),
      gaps: lacunas({ topicos: input.editorialTopics, universo: run.universe, longForm, shorts }),
    },
    limitations,
  });
}
