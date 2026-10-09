import { z } from "zod";
import {
  radarYoutubeCompetitiveSignal,
  radarYoutubeFormatCohorts,
  type RadarYoutubeUniverseEntry,
} from "./youtube-search-model.ts";
import type { RadarYoutubeSearchRun } from "./youtube-search-run.ts";
/* 2026-10-09 · a amostra pertinente mora aqui, com a coorte: a fotografia nova e o CSV de vídeo leem a MESMA régua. */
import { radarUbiquitousStems } from "./intent-adherence.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarWritingCompareKey, radarWritingDecodeEntities, type RadarWritingProjections } from "./portable-writing-export.ts";

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
  { id: "LISTA", label: "Lista (dicas, melhores, top)", marcadores: ["top ", "melhores", "piores", "dicas"] },
  { id: "RANKING", label: "Ranking", marcadores: ["ranking", "top 3", "top 5", "top 10", "os melhores"] },
  { id: "PERGUNTA", label: "Pergunta", marcadores: ["?"] },
  { id: "COMPARACAO", label: "Comparação", marcadores: [" vs ", " ou ", "comparativo", "qual o melhor", "qual e melhor", "diferenca entre"] },
  /* 2026-10-02 · "(e o que fazer diferente)" e "ajustes simples que…" são problema → solução: a amostra os tinha e a oportunidade dizia que não. */
  { id: "PROBLEMA_SOLUCAO", label: "Problema → solução", marcadores: ["acabe com", "acabar com", "resolva", "elimine", "controlar", "como tratar", "o que fazer", "como resolver", "solucao", "ajustes", "como corrigir", "como sair", "o que mudar"] },
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
  /**
   * 2026-10-09 · Aditivo: quantos vídeos deste formato a amostra tinha e ficaram
   * fora da conta por pertinência (fora do tema, outro público). Com a coorte
   * pertinente vazia, "a SERP não devolveu nenhum vídeo" seria falso: ela
   * devolveu, e eles não falam com o tema. Ausente, a frase de antes.
   */
  excludedCount?: number;
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
  if (entries.length === 0 && input.excludedCount) {
    limitations.push(`Nenhum vídeo ${input.format === "SHORTS" ? "curto" : "long-form"} pertinente: os ${input.excludedCount} da amostra estão fora do tema da busca ou falam com outro público.`);
  } else if (entries.length === 0) {
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
 *
 * 2026-10-09 · UMA FAIXA SÓ. A cópia que morava em `video-competitive.ts`
 * (`faixaDa`) saiu: a fotografia, o CSV de vídeo e a tela leem esta, exportada.
 */
export function radarYoutubeCohortRange(coorte: RadarYoutubeCohort): { min: number; max: number } | null {
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

/*
 * 2026-10-09 · O ROTEIRO GENÉRICO SAIU (regra do dono: o processo antigo é
 * substituído, nunca fica de alternativa). "HOOK → CONTEXTO → BLOCO 1…" e
 * "GANCHO → ENTREGA → PROVA → CORTE" eram o mesmo esqueleto para qualquer
 * tema. O roteiro do vídeo é a planta do artigo-modelo (capítulos = seções,
 * formato curto = recorte da planta), montado em `portable-video-export.ts`.
 * A fotografia nova grava `script: []`; a antiga continua legível como foi
 * gravada.
 */

/**
 * 2026-10-09 · AS LACUNAS PELA AMOSTRA PERTINENTE. `universo` são os
 * comparáveis que falam com o público ou com o tema; `fora` diz quantos, de
 * cada formato, ficaram fora da conta. Exportada: o CSV de vídeo relê as
 * lacunas da fotografia antiga com esta régua.
 */
export function radarYoutubePertinentGaps(input: {
  topicos: readonly string[];
  universo: readonly RadarYoutubeUniverseEntry[];
  longForm: RadarYoutubeCohort;
  shorts: RadarYoutubeCohort;
  fora?: { longos: number; curtos: number };
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
        statement: `O tópico "${topico}" não aparece em nenhum título da amostra pertinente.`,
        evidence: `Nenhum dos ${titulos.length} títulos pertinentes contém os termos centrais deste tópico.`,
      }));
    }
  }

  /* FORMATO AUSENTE: uma das coortes pertinentes está vazia. */
  for (const coorte of [input.longForm, input.shorts]) {
    if (coorte.videoCount === 0) {
      const curto = coorte.format === "SHORTS";
      const foraDaConta = (curto ? input.fora?.curtos : input.fora?.longos) || 0;
      encontradas.push(RadarYoutubeGapSchema.parse({
        kind: "FORMATO_AUSENTE",
        /*
         * 2026-10-02 · o que a amostra mostra, não o que existe no YouTube: a
         * coleta pode não trazer o formato, e "não há disputa" era afirmação
         * maior que o dado.
         * 2026-10-09 · D10: "confira se a coleta traz…" deixava conferência
         * aberta. A frase sai concluída: não é oportunidade comprovada, e o
         * motivo do zero é dito (coleta sem o formato ou vídeos fora do tema).
         */
        statement: `Nenhum ${curto ? "Short" : "vídeo longo"} pertinente na amostra coletada: não é oportunidade comprovada${foraDaConta ? ` — os ${foraDaConta} da amostra estão fora do tema da busca ou falam com outro público` : " — a coleta não trouxe esse formato"}.`,
        evidence: `A coorte ${coorte.format} ficou com zero vídeo pertinente na amostra coletada${foraDaConta ? ` (${foraDaConta} fora da conta)` : ""}.`,
      }));
    }
  }

  /* PROMESSA REPETITIVA: um padrão domina mais de 60% da amostra pertinente. */
  const dominante = input.longForm.titlePatterns[0];
  if (dominante && dominante.share >= 0.6) {
    encontradas.push(RadarYoutubeGapSchema.parse({
      kind: "PROMESSA_REPETITIVA",
      statement: `O padrão "${dominante.label}" domina a amostra pertinente e ficou previsível.`,
      evidence: `${dominante.count} de ${input.longForm.videoCount} títulos long-form pertinentes usam o mesmo padrão.`,
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
   *
   * 2026-10-09 · UMA LISTA DE CREDENCIAL SÓ (`radarYoutubeCredentialMarker`):
   * a lista de trechos daqui e a régua por palavra do CSV de vídeo diziam
   * coisas diferentes sobre o mesmo canal.
   */
  const comCredencial = new Set<string>();
  for (const item of input.universo) {
    if (radarYoutubeCredentialMarker(`${item.title} ${item.channelName || ""}`)) comCredencial.add(item.videoId);
  }
  const fatia = input.universo.length ? comCredencial.size / input.universo.length : 0;
  if (input.universo.length >= RADAR_YOUTUBE_MIN_COHORT && fatia < 0.25) {
    encontradas.push(RadarYoutubeGapSchema.parse({
      kind: "AUTORIDADE_ESCASSA",
      /* 2026-10-02 · mede credencial VISÍVEL no título ou no canal, não a autoridade de quem fala. */
      statement: "Pouca credencial visível no título ou no nome do canal dos vídeos pertinentes: espaço para mostrar a especialidade de quem fala.",
      evidence: `${comCredencial.size} de ${input.universo.length} vídeos pertinentes declaram credencial profissional no título ou no nome do canal.`,
    }));
  }

  return encontradas;
}

/* ===================== 2026-10-09 · a amostra pertinente ===================== */

/*
 * ===== A AMOSTRA PERTINENTE MORA COM A COORTE (regra do dono, 2026-10-09) =====
 *
 * A fotografia lia a amostra INTEIRA: a mediana de duração, a faixa, o formato
 * e a coorte que lidera somavam vídeo fora do tema ("A psicologia das pessoas
 * que não usam Instagram") e de outro público ("clientes de advocacia"). O CSV
 * de vídeo já relia só os pertinentes (`video-competitive.ts`, 2026-10-07) e
 * dizia a divergência sem aplicá-la. Agora a régua mora aqui, com a coorte, e
 * a fotografia NOVA nasce dela: coortes, formato, faixa, estratégia, títulos e
 * lacunas pelos vídeos que falam com o público ou com o tema. As funções
 * vieram de `video-competitive.ts` sem mudar de comportamento — ele as
 * reexporta com os mesmos nomes.
 *
 * A fotografia antiga não é recalculada nem regravada: ela é lida como foi
 * gravada (`radarYoutubeBlueprintRuler` diz qual régua a fez).
 */

/*
 * ===== 2026-10-02 · A RELEVÂNCIA DE CADA CONCORRENTE PARA O PÚBLICO =====
 *
 * Posição e visualizações não dizem se o vídeo fala com o mesmo público. Um de
 * estética, um de advocacia e um genérico entravam iguais. Pelo título e pelo
 * canal (nada foi assistido):
 *   - MESMO público: nomeia o público da marca (a primeira frase do público);
 *   - OUTRO público: "clientes de advocacia", "pacientes para contabilidade"…;
 *   - PRÓXIMO: fala do termo da busca relacionada (ex.: "pacientes");
 *   - GERAL: o resto, referência de formato.
 */
export type RadarVideoRelevance = "MESMO" | "PROXIMO" | "GERAL" | "OUTRO" | "FORA";
export const RADAR_VIDEO_RELEVANCE_LABELS: Readonly<Record<RadarVideoRelevance, string>> = {
  MESMO: "mesmo público: referência principal",
  PROXIMO: "mesma dor, público vizinho: referência de abordagem (não transportar o público)",
  GERAL: "tema geral: referência de formato e apresentação",
  OUTRO: "outro público: inspiração pontual, sem transportar recomendação",
  FORA: "fora do tema da busca (só cita a plataforma): fica fora das recomendações",
};

/** 2026-10-07 · Pertinente é quem fala com o público ou com o tema: OUTRO e FORA ficam fora da conta. */
export const RADAR_VIDEO_PERTINENT: ReadonlySet<RadarVideoRelevance> = new Set<RadarVideoRelevance>(["MESMO", "PROXIMO", "GERAL"]);

let genericasDoPublico: Set<string> | null = null;
/* Calculado na primeira chamada: nada roda no carregamento do módulo. */
const GENERICAS_DO_PUBLICO = () => (genericasDoPublico ??= new Set(radarSemanticStems("profissionais profissional pessoas que atendem atende outras especialidades entram quando o artigo tiver esse público explicitamente definido trabalham")));

const textoLimpo = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const unicosPorChave = (valores: readonly string[]): string[] => {
  const vistos = new Set<string>();
  return valores.filter(valor => {
    const chave = radarWritingCompareKey(valor);
    if (!chave || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
};

/*
 * 2026-10-02 · A LEITURA DO PÚBLICO EM DOIS NÍVEIS (revisão do CSV de vídeo).
 *
 *   - QUEM é o público: o começo da primeira frase, até "que" ("Biomédicas
 *     estetas e profissionais de estética e cosmética") — a profissão;
 *   - ONDE e COM QUE DOR: o resto da frase ("clínicas e consultórios") e o termo
 *     da busca relacionada ("pacientes"). Vídeo de marketing médico fala da
 *     mesma dor, mas não com biomédicas estetas: público vizinho, não o mesmo.
 *
 * E o que só cita a plataforma (a raiz onipresente nos títulos da amostra,
 * como "instagram") sem nada do assunto — "A psicologia das pessoas que não
 * usam Instagram" — está fora do tema da busca, por melhor posição que tenha.
 */
export type RadarVideoAudienceReading = { publico: ReadonlySet<string>; vizinho: ReadonlySet<string>; nucleo: ReadonlySet<string>; onipresentes: ReadonlySet<string> };

/** 2026-10-09 · A mesma leitura, sem as projeções do export: a fotografia lê a principal e as complementares da própria corrida. */
export function radarVideoAudienceReadingOf(input: {
  principalKeyword: string | null | undefined;
  complementaryKeywords: readonly string[];
  audience: string | null | undefined;
  titles?: readonly string[];
}): RadarVideoAudienceReading {
  const principal = new Set(radarSemanticStems(textoLimpo(input.principalKeyword)));
  const complementares = unicosPorChave(input.complementaryKeywords).flatMap(item => radarSemanticStems(item));
  const nucleo = new Set([...principal, ...complementares]);
  const primeiraFrase = (input.audience || "").split(/(?<=[.!?])\s+/)[0] || "";
  const corte = primeiraFrase.search(/\s(que|quem|onde)\s/i);
  const quem = corte > 0 ? primeiraFrase.slice(0, corte) : primeiraFrase;
  const resto = corte > 0 ? primeiraFrase.slice(corte) : "";
  const genericas = GENERICAS_DO_PUBLICO();
  const util = (raiz: string) => !genericas.has(raiz) && !nucleo.has(raiz);
  const publicoRaizes = new Set(radarSemanticStems(quem).filter(util));
  return {
    publico: publicoRaizes,
    vizinho: new Set([...radarSemanticStems(resto).filter(raiz => util(raiz) && !publicoRaizes.has(raiz)), ...complementares.filter(raiz => !principal.has(raiz))]),
    nucleo,
    onipresentes: radarUbiquitousStems((input.titles || []).map(titulo => radarWritingDecodeEntities(titulo))),
  };
}

export function radarVideoAudienceReading(p: RadarWritingProjections, publico: string | null, titulos: readonly string[] = []): RadarVideoAudienceReading {
  return radarVideoAudienceReadingOf({
    principalKeyword: p.dna.principalKeyword,
    complementaryKeywords: [...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements],
    audience: publico,
    titles: titulos,
  });
}

/* O radical não é uniforme ("pacientes" → "pacient", "paciente" → "paciente"): mesma raiz quando uma começa pela outra. */
export const radarVideoSameStem = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

export function radarVideoRelevance(video: Pick<RadarYoutubeUniverseEntry, "title" | "channelName">, leitura: RadarVideoAudienceReading): RadarVideoRelevance {
  const doTitulo = radarSemanticStems(radarWritingDecodeEntities(video.title));
  const raizes = [...doTitulo, ...radarSemanticStems(video.channelName || "")];
  const tem = (conjunto: ReadonlySet<string>, lista: readonly string[] = raizes) => lista.some(raiz => [...conjunto].some(outra => radarVideoSameStem(raiz, outra)));
  if (tem(leitura.publico)) return "MESMO";
  const outro = radarWritingCompareKey(radarWritingDecodeEntities(video.title)).match(/\b(?:clientes?|pacientes?|alunos?|negocios?)\s+(?:de|para|da|do|na|no)\s+([a-z]{4,})/);
  const raizDoOutro = outro ? radarSemanticStems(outro[1])[0] : null;
  if (raizDoOutro && !leitura.nucleo.has(raizDoOutro) && !leitura.publico.has(raizDoOutro)) return "OUTRO";
  if (tem(leitura.vizinho)) return "PROXIMO";
  /*
   * Do assunto, o título só tem o que todo título da amostra tem (a plataforma): fora do tema.
   * 2026-10-09 · a régua de aderência do núcleo (`radarAdheresToCore`): DUAS
   * raízes do núcleo também são o assunto, mesmo onipresentes. Na amostra em
   * que todo título traz a principal inteira ("como atrair clientes pelo
   * instagram: o passo a passo"), a raiz onipresente deixava TODOS fora do
   * tema — e a fotografia nova, que nasce da amostra pertinente, sairia vazia.
   */
  const doAssunto: string[] = [];
  for (const raiz of doTitulo) {
    if ([...leitura.nucleo].some(outra => radarVideoSameStem(raiz, outra)) && !doAssunto.some(outra => radarVideoSameStem(raiz, outra))) doAssunto.push(raiz);
  }
  if (doAssunto.length < 2 && !doAssunto.some(raiz => !leitura.onipresentes.has(raiz))) return "FORA";
  return "GERAL";
}

export type RadarVideoPertinentSample = {
  longos: { total: number; coorte: RadarYoutubeCohort };
  curtos: { total: number; coorte: RadarYoutubeCohort };
  /** Quantos ficaram fora da conta, por motivo. */
  foraDaConta: { FORA: number; OUTRO: number };
  /** Os formatos AV dos pertinentes (longos e Shorts juntos, como a fotografia faz). */
  formatos: RadarYoutubeAvFormat[];
  /** A coorte que governa a faixa: a maior, nunca as duas somadas (a mesma regra da fotografia). */
  lider: "LONG_FORM" | "SHORTS";
  /** P25 → P75 da coorte que lidera (`radarYoutubeCohortRange`). */
  faixa: { min: number; max: number } | null;
  /** O formato que domina os pertinentes; sem padrão, o mesmo texto da fotografia. */
  formato: string;
  /** A ressalva de amostra pequena, por coorte pertinente (só quando a coorte inteira tinha vídeo). */
  ressalvas: string[];
  /** 2026-10-09 · Aditivo: os vídeos comparáveis que entraram na conta (as lacunas e a fotografia nova os leem). */
  videos: RadarYoutubeUniverseEntry[];
};

/*
 * 2026-10-07 (revisão) · A faixa de UMA coorte pela mesma régua: a cadeia
 * competitiva diz a faixa do formato que a sequência segue (longos ou Shorts
 * pertinentes), não a da coorte que lidera.
 * 2026-10-09 · o nome antigo continua, apontando para a função única.
 */
export const radarVideoCohortRange = (coorte: RadarYoutubeCohort): { min: number; max: number } | null => radarYoutubeCohortRange(coorte);

export function radarVideoPertinentSample(input: {
  videos: readonly RadarYoutubeUniverseEntry[];
  relevancia: (video: RadarYoutubeUniverseEntry) => RadarVideoRelevance;
  collectedAt: string | null;
}): RadarVideoPertinentSample {
  const lidos = input.videos.map(video => ({ video, relevancia: input.relevancia(video) }));
  const pertinentes = lidos.filter(item => RADAR_VIDEO_PERTINENT.has(item.relevancia)).map(item => item.video);
  const ehLongo = (video: RadarYoutubeUniverseEntry) => video.universeClass === "COMPARABLE_LONG_FORM";
  const ehCurto = (video: RadarYoutubeUniverseEntry) => video.universeClass === "COMPARABLE_SHORT";
  const total = { longos: input.videos.filter(ehLongo).length, curtos: input.videos.filter(ehCurto).length };
  const daConta = { longos: pertinentes.filter(ehLongo), curtos: pertinentes.filter(ehCurto) };
  const longos = radarYoutubeCohort({ format: "LONG_FORM", entries: daConta.longos, collectedAt: input.collectedAt, excludedCount: total.longos - daConta.longos.length });
  const curtos = radarYoutubeCohort({ format: "SHORTS", entries: daConta.curtos, collectedAt: input.collectedAt, excludedCount: total.curtos - daConta.curtos.length });
  const comparaveis = pertinentes.filter(video => ehLongo(video) || ehCurto(video));
  const formatos = radarYoutubeAvFormats(radarYoutubeTitlePatterns(comparaveis.map(video => video.title)), comparaveis.length);
  const lider = curtos.videoCount > longos.videoCount ? curtos : longos;
  /*
   * A ressalva de amostra pequena é a do próprio cohort (abaixo de
   * RADAR_YOUTUBE_MIN_COHORT os padrões descrevem casos, não mercado), dita
   * sobre a amostra PERTINENTE. Coorte que já era vazia na amostra inteira não
   * ganha ressalva: o zero dela é dito na linha do YouTube.
   */
  const ressalvas: string[] = [];
  for (const [rotulo, coorte, inteira] of [["longos", longos, total.longos], ["Shorts", curtos, total.curtos]] as const) {
    if (!inteira) continue;
    if (!coorte.videoCount) ressalvas.push(`Ressalva: nenhum vídeo pertinente entre os ${rotulo}: sem estatística pertinente deste formato.`);
    else if (coorte.videoCount < RADAR_YOUTUBE_MIN_COHORT) ressalvas.push(`Ressalva: a amostra pertinente de ${rotulo} tem ${coorte.videoCount} vídeo(s): abaixo de ${RADAR_YOUTUBE_MIN_COHORT} os padrões descrevem casos, não mercado.`);
  }
  return {
    longos: { total: total.longos, coorte: longos },
    curtos: { total: total.curtos, coorte: curtos },
    foraDaConta: { FORA: lidos.filter(item => item.relevancia === "FORA").length, OUTRO: lidos.filter(item => item.relevancia === "OUTRO").length },
    formatos,
    lider: lider.format,
    faixa: radarYoutubeCohortRange(lider),
    formato: formatos[0]?.label ?? "Definido pela intenção do artigo",
    ressalvas,
    videos: comparaveis,
  };
}

/*
 * A CREDENCIAL NO NOME, POR LISTA FECHADA: os marcadores de autoridade da
 * pesquisa do YouTube (dermatologista, médico, especialista, Dra., Dr.) e as
 * profissões e conselhos equivalentes. "Profissional" sozinho não é credencial
 * ("Maquiadora Profissional" declara ofício, não registro), e "explica" é
 * marca de título, não de nome.
 * 2026-10-09 · a lista única: a lacuna de autoridade da fotografia e o CSV de vídeo leem esta.
 */
const CREDENCIAL = /(?:^|[^a-z])(dra?|doutora?|medic[oa]|dermatologista|especialista|farmaceutic[oa]|nutricionista|biomedic[oa]|enfermeir[oa]|fisioterapeuta|psicolog[oa]|dentista|odontolog[oa]|esteticista|cosmetolog[oa]|advogad[oa]|crm|cro|crf|crn|crbm|coren|crefito|crp|oab)(?![a-z])/;

/** 2026-10-07 · O marcador de credencial no texto (nome do autor, título ou canal), ou `null`. */
export function radarYoutubeCredentialMarker(valor: string | null | undefined): string | null {
  return semAcento(valor || "").match(CREDENCIAL)?.[1] ?? null;
}

/*
 * ===== 2026-10-09 · O NÚCLEO DA PERTINÊNCIA, LIDO DA PRÓPRIA CORRIDA =====
 *
 * Quem congela (a tela) entrega a corrida, a intenção e os tópicos — não a
 * principal nem as complementares. A corrida as tem: cada consulta diz de onde
 * veio (`PRIMARY_KEYWORD`, `SECONDARY_KEYWORD`). Sem consulta da principal, o
 * núcleo fica vazio e a pertinência não é julgada (todos entram, e a
 * limitação diz).
 */
export function radarYoutubeAudienceOfRun(run: Pick<RadarYoutubeSearchRun, "queries">): { principalKeyword: string | null; complementaryKeywords: string[] } {
  const principal = run.queries.find(consulta => consulta.origin === "PRIMARY_KEYWORD")?.text || null;
  const complementares = run.queries.filter(consulta => consulta.origin === "SECONDARY_KEYWORD").map(consulta => consulta.text);
  return { principalKeyword: principal, complementaryKeywords: complementares };
}

/*
 * ===== 2026-10-09 · A DECISÃO DE FORMATO CURTO, UMA SÓ =====
 *
 * Cinco lugares decidiam "formato curto" e cada um de um jeito: a faixa da
 * coorte líder da amostra INTEIRA com teto de 60s (sequência do CSV de vídeo,
 * descartando a planta), os blocos GANCHO/ENTREGA do roteiro genérico, a
 * saída SHORTS do multiformato, o tom da camada canônica e a semente do
 * Redator. A régua agora é uma, pela amostra PERTINENTE:
 *
 *   - curto quando os Shorts pertinentes lideram e são ao menos
 *     RADAR_YOUTUBE_MIN_COHORT (abaixo disso descrevem casos, não mercado);
 *   - senão, o vídeo longo — o artigo-modelo é a referência e o vídeo do mesmo
 *     assunto segue as seções dele.
 *
 * Formato curto NÃO é outro roteiro: é o RECORTE da planta (os capítulos que
 * funcionam sozinhos viram a série de vídeos curtos). Quem monta a sequência
 * (`portable-video-export.ts`) e o Redator usam esta decisão.
 */
export type RadarVideoFormatDecision = {
  curto: boolean;
  /** A coorte pertinente que lidera; `null` sem amostra pertinente. */
  lider: "LONG_FORM" | "SHORTS" | null;
  /** P25–P75 da coorte do formato decidido (Shorts no curto, longos no longo). */
  faixa: { min: number; max: number } | null;
  /** A faixa de cada coorte pertinente, para a tela e o CSV dizerem as duas. */
  faixas: { longos: { min: number; max: number } | null; curtos: { min: number; max: number } | null };
  /** Por que, em uma frase concluída. */
  motivo: string;
};

export function radarVideoFormatDecision(coortes: { longos: RadarYoutubeCohort; curtos: RadarYoutubeCohort } | null): RadarVideoFormatDecision {
  if (!coortes) {
    return { curto: false, lider: null, faixa: null, faixas: { longos: null, curtos: null }, motivo: "sem amostra pertinente do YouTube: o vídeo segue o artigo-modelo, em formato longo" };
  }
  const { longos, curtos } = coortes;
  const faixas = { longos: radarYoutubeCohortRange(longos), curtos: radarYoutubeCohortRange(curtos) };
  if (!longos.videoCount && !curtos.videoCount) {
    return { curto: false, lider: null, faixa: null, faixas, motivo: "nenhum vídeo pertinente na amostra do YouTube: o vídeo segue o artigo-modelo, em formato longo" };
  }
  const placar = `${curtos.videoCount} Short(s) × ${longos.videoCount} vídeo(s) longo(s) pertinentes`;
  if (curtos.videoCount > longos.videoCount) {
    return curtos.videoCount >= RADAR_YOUTUBE_MIN_COHORT
      ? { curto: true, lider: "SHORTS", faixa: faixas.curtos, faixas, motivo: `os Shorts lideram a amostra pertinente (${placar}): o vídeo é o recorte da planta, um capítulo por vídeo curto` }
      : { curto: false, lider: "SHORTS", faixa: faixas.longos, faixas, motivo: `os Shorts lideram a amostra pertinente (${placar}), mas abaixo de ${RADAR_YOUTUBE_MIN_COHORT} descrevem casos, não mercado: o vídeo segue o artigo-modelo, em formato longo` };
  }
  return { curto: false, lider: "LONG_FORM", faixa: faixas.longos, faixas, motivo: `os vídeos longos lideram a amostra pertinente (${placar}): o vídeo segue o artigo-modelo, em formato longo` };
}

/** 2026-10-09 · As coortes pertinentes de uma amostra, na forma que a decisão lê. */
export const radarVideoFormatCohortsOf = (amostra: Pick<RadarVideoPertinentSample, "longos" | "curtos"> | null) =>
  (amostra ? { longos: amostra.longos.coorte, curtos: amostra.curtos.coorte } : null);

/**
 * 2026-10-09 · A AMOSTRA PERTINENTE DE UMA CORRIDA, UMA SÓ CONTA. A fotografia
 * nova, a tela do YouTube e o multiformato leem a corrida pela mesma régua: o
 * núcleo vem de quem chama ou das consultas da corrida
 * (`radarYoutubeAudienceOfRun`); sem núcleo, a pertinência não é julgada
 * (`julgavel: false`) e todos os comparáveis entram como tema geral.
 */
export function radarYoutubeRunPertinentSample(
  run: Pick<RadarYoutubeSearchRun, "queries" | "universe" | "provenance">,
  audience?: RadarYoutubeBlueprintAudience | null,
): { amostra: RadarVideoPertinentSample; julgavel: boolean; decisao: RadarVideoFormatDecision } {
  const coortes = radarYoutubeFormatCohorts(run.universe);
  const comparaveis = [...coortes.longForm, ...coortes.shorts];
  const doRun = radarYoutubeAudienceOfRun(run);
  const leitura = radarVideoAudienceReadingOf({
    principalKeyword: audience?.principalKeyword ?? doRun.principalKeyword,
    complementaryKeywords: audience?.complementaryKeywords ?? doRun.complementaryKeywords,
    audience: audience?.audience ?? null,
    titles: comparaveis.map(item => item.title),
  });
  const julgavel = leitura.nucleo.size > 0;
  const amostra = radarVideoPertinentSample({ videos: comparaveis, relevancia: video => (julgavel ? radarVideoRelevance(video, leitura) : "GERAL"), collectedAt: run.provenance.collectedAt });
  return { amostra, julgavel, decisao: radarVideoFormatDecision(radarVideoFormatCohortsOf(amostra)) };
}

/**
 * 2026-10-09 · A conta pertinente na forma que o multiformato lê
 * (`buildRadarMultimodalBlueprint({ youtubePertinence })`): quantos longos e
 * Shorts pertinentes e se o formato decidido é o curto.
 */
export function radarYoutubeRunPertinence(run: Pick<RadarYoutubeSearchRun, "queries" | "universe" | "provenance">): { longForm: number; shorts: number; shortFormat: boolean } {
  const { amostra, decisao } = radarYoutubeRunPertinentSample(run);
  return { longForm: amostra.longos.coorte.videoCount, shorts: amostra.curtos.coorte.videoCount, shortFormat: decisao.curto };
}

/**
 * §3 · AS OPORTUNIDADES DE TÍTULO — padrões AUSENTES, nunca títulos copiados.
 *
 * O que sai é o nome de um padrão que a SERP não usa. Copiar um título
 * observado e sugerir variação dele entregaria o texto do concorrente como
 * material nosso.
 */
/*
 * 2026-10-02 · PADRÕES DA MESMA FAMÍLIA. "Lista numerada" (dicas, melhores, top)
 * e "Ranking" são o mesmo formato para quem lê a amostra (o formato "Ranking /
 * lista" soma os dois): com listas na amostra, "Ranking: nenhum título usa"
 * contradizia a linha de padrões logo acima.
 */
const FAMILIA_DO_PADRAO: Record<string, readonly string[]> = { RANKING: ["LISTA"], LISTA: ["RANKING"] };

export function radarYoutubeTitleOpportunities(padroes: readonly RadarYoutubeTitlePattern[]): string[] {
  const usados = new Set(padroes.filter(item => item.count > 0).map(item => item.id));
  return RADAR_YOUTUBE_TITLE_PATTERNS
    .filter(padrao => !usados.has(padrao.id) && !(FAMILIA_DO_PADRAO[padrao.id] || []).some(id => usados.has(id)))
    .map(padrao => `${padrao.label}: nenhum título da amostra usa este padrão.`);
}

/* ========================= a montagem do blueprint ======================= */

/*
 * ===== 2026-10-09 · A RÉGUA QUE FEZ A FOTOGRAFIA =====
 *
 * A fotografia nova nasce da amostra pertinente e grava, entre as limitações,
 * a linha que diz isso (com quantos entraram e quantos ficaram fora). É por
 * ela — e não por campo novo no contrato — que quem lê sabe qual régua fez a
 * fotografia: o contrato congelado não muda de forma, e a fotografia antiga
 * (sem a linha) continua lida como foi gravada, com o mesmo hash.
 */
export const RADAR_YOUTUBE_PERTINENT_RULER = "Amostra pertinente (régua de 2026-10-09):";

export type RadarYoutubeBlueprintRuler = "PERTINENTE" | "AMOSTRA_INTEIRA";

export function radarYoutubeBlueprintRuler(blueprint: Pick<RadarYoutubeBlueprint, "limitations"> | null | undefined): RadarYoutubeBlueprintRuler {
  return (blueprint?.limitations || []).some(item => item.startsWith(RADAR_YOUTUBE_PERTINENT_RULER)) ? "PERTINENTE" : "AMOSTRA_INTEIRA";
}

/**
 * 2026-10-09 · Aditivo: o núcleo e o público de quem chama. Ausente, o núcleo
 * sai das consultas da própria corrida (`radarYoutubeAudienceOfRun`) e o
 * público fica sem leitura — a pertinência continua julgada pelo tema.
 */
export type RadarYoutubeBlueprintAudience = {
  principalKeyword?: string | null;
  complementaryKeywords?: readonly string[];
  audience?: string | null;
};

export function buildRadarYoutubeBlueprint(input: {
  run: RadarYoutubeSearchRun;
  declaredIntent: string | null;
  editorialTopics: readonly string[];
  destination?: typeof RADAR_YOUTUBE_BLUEPRINT_DESTINATIONS[number];
  generatedAt: string;
  audience?: RadarYoutubeBlueprintAudience | null;
}): RadarYoutubeBlueprint {
  const { run } = input;
  const collectedAt = run.provenance.collectedAt;

  /*
   * 2026-10-09 · A FOTOGRAFIA NASCE DA AMOSTRA PERTINENTE (regra do dono: o
   * processo do piloto substitui o antigo). A mesma régua do CSV de vídeo
   * (`radarVideoRelevance`), lida da amostra comparável inteira: coortes,
   * formatos, faixa, estratégia, títulos e lacunas saem só dos vídeos que
   * falam com o público ou com o tema. Sem núcleo (a corrida não tem a
   * consulta da principal), a pertinência não é julgada e todos entram.
   */
  const { amostra, julgavel, decisao } = radarYoutubeRunPertinentSample(run, input.audience);
  const longForm = amostra.longos.coorte;
  const shorts = amostra.curtos.coorte;
  const comparaveis = amostra.videos;
  const avFormats = amostra.formatos;

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
   * A COORTE QUE GOVERNA A RECOMENDAÇÃO é a do formato decidido — e nunca as
   * duas somadas. Recomendar duração a partir de long-form e Shorts juntos
   * produziria uma faixa que nenhum dos dois formatos reconhece (§2).
   * 2026-10-09 · pela decisão única de formato (`radarVideoFormatDecision`):
   * Shorts que lideram com menos de 4 vídeos pertinentes não governam.
   */
  const coorteDoFormato = decisao.curto ? shorts : longForm;
  const dominante = maiorFormato(avFormats);
  const fora = { longos: amostra.longos.total - longForm.videoCount, curtos: amostra.curtos.total - shorts.videoCount };
  const motivosDeFora = [
    ...(amostra.foraDaConta.FORA ? [`${amostra.foraDaConta.FORA} fora do tema da busca`] : []),
    ...(amostra.foraDaConta.OUTRO ? [`${amostra.foraDaConta.OUTRO} de outro público`] : []),
  ];

  const limitations = [
    ...run.limitations,
    /* 2026-10-09 · a régua que fez esta fotografia, dita com a conta (e é por esta linha que a leitura reconhece a fotografia nova). */
    julgavel
      ? `${RADAR_YOUTUBE_PERTINENT_RULER} ${longForm.videoCount} de ${amostra.longos.total} longos e ${shorts.videoCount} de ${amostra.curtos.total} Shorts entram na leitura (mesmo público, público vizinho e tema geral, pelo título e pelo canal)${motivosDeFora.length ? `; fora da conta: ${motivosDeFora.join(" e ")}` : ""}. Formato: ${decisao.motivo}.`
      : `${RADAR_YOUTUBE_PERTINENT_RULER} a corrida não tem a consulta da keyword principal; os ${comparaveis.length} comparáveis entram na leitura sem julgamento de pertinência. Formato: ${decisao.motivo}.`,
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
      durationSecondsRange: decisao.faixa,
      strategy: estrategia({ coorte: coorteDoFormato, formatos: avFormats, declaredIntent: input.declaredIntent, canaisRecorrentes: recurrentChannels }),
      /* 2026-10-09 · sem roteiro genérico: o roteiro do vídeo é a planta do artigo-modelo. */
      script: [],
      scriptDisclaimer: RADAR_YOUTUBE_SCRIPT_DISCLAIMER,
      titleOpportunities: radarYoutubeTitleOpportunities(coorteDoFormato.titlePatterns),
      gaps: radarYoutubePertinentGaps({ topicos: input.editorialTopics, universo: comparaveis, longForm, shorts, fora }),
    },
    limitations,
  });
}
