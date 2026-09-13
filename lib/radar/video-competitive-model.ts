/**
 * O MODELO COMPETITIVO DE VÍDEO — que não é o gabarito de artigo.
 *
 * Medir um vídeo por número de H2 e contagem de palavras não descreve nada. O
 * que compete no YouTube é outra coisa: qual canal aparece, com que recorrência,
 * que tema aborda, que pergunta responde, como abre. É isso que esta leitura
 * observa.
 *
 * E ela é HONESTA SOBRE O QUE NÃO VÊ. A fonte atual é o bloco de vídeos da SERP:
 * dá título, canal, posição e recorrência. Duração, visualizações, capítulos e
 * transcrição exigiriam a API do YouTube — então esses campos não aparecem como
 * zero, aparecem como limitação declarada.
 *
 * Não copia roteiro. Descreve padrão observado.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarResearchReference } from "./research-reference.ts";
import { radarYoutubeSourceLimitation } from "./search-mode.ts";

export type RadarVideoChannelPattern = {
  channel: string;
  videos: number;
  queries: number;
  bestRank: number | null;
  /** O canal aparece em mais de uma consulta da unidade editorial? */
  recurrent: boolean;
};

export type RadarVideoObservation = {
  referenceId: string;
  url: string;
  title: string;
  channel: string;
  queryCount: number;
  bestRank: number | null;
  appearedIn: string[];
};

export type RadarVideoCompetitiveModel = {
  sample: { videos: number; channels: number; queries: number };
  /** A intenção que a busca por vídeo revela, quando o diagnóstico a classifica. */
  observedIntent: string | null;
  videos: RadarVideoObservation[];
  channels: RadarVideoChannelPattern[];
  /** Temas recorrentes lidos dos títulos — o que os vídeos prometem responder. */
  recurringThemes: Array<{ theme: string; videos: number }>;
  /** Perguntas que os títulos declaram responder. */
  questionsAnswered: string[];
  /** O que a fonte atual não permitiu observar. Dito, nunca zerado. */
  notObserved: string[];
  limitations: string[];
};

const PALAVRAS_VAZIAS = new Set([
  "a", "as", "o", "os", "um", "uma", "de", "da", "do", "das", "dos", "e", "ou", "em", "no", "na",
  "para", "por", "com", "sem", "que", "qual", "quais", "como", "melhor", "melhores", "video", "vídeo",
  "shorts", "tutorial", "dicas", "passo",
]);

const normalizar = (value: string) =>
  value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const PERGUNTA = /^(como|o que|por que|porque|quando|onde|qual|quais|quanto|vale a pena|devo|posso)\b/i;

/** O canal, lido da URL quando o provider não o entrega separado. */
export function radarVideoChannel(reference: Pick<RadarResearchReference, "url" | "domain" | "title">): string {
  try {
    const url = new URL(reference.url);
    const caminho = url.pathname;
    const canal = caminho.match(/\/(?:@|c\/|channel\/|user\/)([^/?#]+)/);
    if (canal) return decodeURIComponent(canal[1]);
  } catch { /* URL inválida vira domínio, e o domínio é o que sobra de verdade. */ }
  return reference.domain || "canal não identificado";
}

export function buildRadarVideoCompetitiveModel(input: {
  references: readonly RadarResearchReference[];
  observedIntent?: string | null;
  /** Quantas consultas produziram este universo. */
  queries?: number;
}): RadarVideoCompetitiveModel {
  const videos: RadarVideoObservation[] = input.references.map(reference => ({
    referenceId: reference.referenceId,
    url: reference.url,
    title: reference.title,
    channel: radarVideoChannel(reference),
    queryCount: reference.queryCount,
    bestRank: reference.appearances.length ? Math.min(...reference.appearances.map(item => item.rank)) : null,
    appearedIn: reference.appearances.map(item => item.keyword || item.queryExecutionId),
  }));

  /* O canal que recorre é o que domina o tema — o sinal mais forte aqui. */
  const porCanal = new Map<string, RadarVideoChannelPattern>();
  for (const video of videos) {
    const atual = porCanal.get(video.channel) || { channel: video.channel, videos: 0, queries: 0, bestRank: null, recurrent: false };
    atual.videos += 1;
    atual.queries = Math.max(atual.queries, video.queryCount);
    atual.bestRank = atual.bestRank === null ? video.bestRank : Math.min(atual.bestRank, video.bestRank ?? atual.bestRank);
    atual.recurrent = atual.videos > 1 || atual.queries > 1;
    porCanal.set(video.channel, atual);
  }

  /* Os temas saem dos títulos: é o que a fonte permite ler sobre abordagem. */
  const contagem = new Map<string, number>();
  for (const video of videos) {
    const termos = [...new Set(normalizar(video.title).split(" ").filter(token => token.length >= 4 && !PALAVRAS_VAZIAS.has(token)))];
    for (const termo of termos) contagem.set(termo, (contagem.get(termo) || 0) + 1);
  }
  const recurringThemes = [...contagem.entries()]
    .filter(([, quantidade]) => quantidade > 1)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([theme, quantidade]) => ({ theme, videos: quantidade }));

  const questionsAnswered = [...new Set(videos.map(video => video.title.trim()).filter(titulo => PERGUNTA.test(titulo)))];

  return {
    sample: { videos: videos.length, channels: porCanal.size, queries: input.queries || 0 },
    observedIntent: input.observedIntent || null,
    videos: videos.sort((left, right) => (left.bestRank ?? 999) - (right.bestRank ?? 999)),
    channels: [...porCanal.values()].sort((left, right) => right.videos - left.videos || (left.bestRank ?? 999) - (right.bestRank ?? 999)),
    recurringThemes,
    questionsAnswered,
    /*
     * O que exigiria a API do YouTube. Aparecer como "não observado" é o que
     * impede alguém de ler a ausência como "nenhum vídeo tem capítulos".
     */
    notObserved: [
      "duração e faixa de duração",
      "visualizações e engajamento",
      "capítulos e sequência temática interna",
      "transcrição, hook de abertura e CTA",
      "autoridade do canal (inscritos, verificação)",
      "links e fontes citadas na descrição",
    ],
    limitations: [
      radarYoutubeSourceLimitation(),
      ...(videos.length < 3 ? ["Menos de três vídeos observados: os padrões descrevem esta amostra, não o mercado."] : []),
    ],
  };
}
