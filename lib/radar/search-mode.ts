/**
 * UMA PESQUISA, UM MODO — e eles não se misturam.
 *
 *   GOOGLE   páginas e artigos. O benchmark é editorial: estrutura, tópicos,
 *            headings, tamanho, cobertura.
 *   YOUTUBE  vídeos. O benchmark é audiovisual: abordagem, sequência, hook,
 *            duração, canal. Comparar um vídeo com um artigo por número de H2
 *            não descreve nada.
 *   AMAZON   produtos. O benchmark é de listagem: atributos, benefícios,
 *            objeções, avaliações.
 *
 * A CASCA NASCE EXTENSÍVEL. Quando Mercado Livre e Shopee chegarem, entram na
 * mesma lista sem redesenhar o Radar — e a decisão de agrupar tudo sob
 * "Marketplaces" pode ser tomada lá, não agora.
 *
 * Seleção ÚNICA: uma investigação descreve um universo só. Nada de Google mais
 * Amazon marcados ao mesmo tempo.
 *
 * A escolha é do usuário, antes de começar, e fica gravada na investigação. O
 * modo NÃO muda no meio: uma investigação descreve um universo só.
 *
 * O QUE A FONTE ATUAL DÁ, E O QUE ELA NÃO DÁ — declarado, não presumido.
 * A SERP do Google já devolve o bloco de vídeos e o normalizador os preserva
 * com `inferredType: "video"`. Isso basta para observar quais vídeos competem,
 * de que canal e em que posição. Métricas próprias do YouTube (visualizações,
 * duração, capítulos, transcrição) NÃO vêm daí, e este módulo diz isso em vez
 * de inventar número.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";

export const RadarPrimarySearchModeSchema = z.enum(["WEB", "YOUTUBE", "AMAZON"]);
export type RadarPrimarySearchMode = z.infer<typeof RadarPrimarySearchModeSchema>;

export const RADAR_DEFAULT_SEARCH_MODE: RadarPrimarySearchMode = "WEB";

export const radarSearchModeLabel = (mode: RadarPrimarySearchMode) =>
  ({ WEB: "Google", YOUTUBE: "YouTube", AMAZON: "Amazon" }[mode]);

/**
 * O QUE CADA MODO CONSEGUE FAZER HOJE — declarado, não presumido.
 *
 * O seletor reconhece os três porque a casca precisa nascer extensível: quando
 * Mercado Livre e Shopee chegarem, entram aqui sem redesenhar o Radar. Mas
 * reconhecer o modo NÃO é ter a engine dele. Oferecer um botão que não pesquisa
 * seria pior do que não oferecer botão nenhum.
 */
export type RadarSearchModeEngine = "available" | "partial" | "planned";

export const RADAR_SEARCH_MODE_ENGINE: Record<RadarPrimarySearchMode, RadarSearchModeEngine> = {
  WEB: "available",
  /* Universo, separação e modelo de vídeo existem; a coleta usa o bloco de vídeos da SERP. */
  YOUTUBE: "partial",
  /* Modo reconhecido pela casca; a pesquisa de produto é o próximo módulo. */
  AMAZON: "planned",
};

export const radarSearchModeAvailability = (mode: RadarPrimarySearchMode) => ({
  engine: RADAR_SEARCH_MODE_ENGINE[mode],
  canStart: RADAR_SEARCH_MODE_ENGINE[mode] !== "planned",
  reason: RADAR_SEARCH_MODE_ENGINE[mode] === "planned"
    ? `A pesquisa em ${radarSearchModeLabel(mode)} ainda não foi construída. O modo aparece porque a casca já o reconhece.`
    : RADAR_SEARCH_MODE_ENGINE[mode] === "partial"
      ? `A pesquisa em ${radarSearchModeLabel(mode)} usa o bloco de vídeos da busca: observa quais vídeos competem, sem métricas próprias da plataforma.`
      : null,
});

/** Os tipos de resultado que cada modo aceita como AMOSTRA principal. */
const AMOSTRA_DO_MODO: Record<RadarPrimarySearchMode, (tipo: string | null | undefined) => boolean> = {
  /* Vídeo é observação da SERP, nunca página do benchmark editorial. */
  WEB: tipo => (tipo || "").toLowerCase() !== "video",
  /* E artigo não entra no benchmark de vídeo pelo mesmo motivo, invertido. */
  YOUTUBE: tipo => (tipo || "").toLowerCase() === "video",
  /* Produto é a unidade da pesquisa de marketplace. Engine ainda não construída. */
  AMAZON: tipo => (tipo || "").toLowerCase() === "product",
};

export const radarResultBelongsToMode = (mode: RadarPrimarySearchMode, inferredType: string | null | undefined) =>
  AMOSTRA_DO_MODO[mode](inferredType);

export type RadarModeSplit<T> = {
  /** O que forma o benchmark deste modo. */
  sample: T[];
  /** O que a busca mostrou e não pertence a este benchmark. Evidência, não amostra. */
  crossReference: T[];
};

/**
 * A separação estrita, em um lugar só.
 *
 * Nenhuma tela decide sozinha "isto é vídeo, então..."; quem responde é esta
 * função, e o que sobra continua visível como referência cruzada.
 */
export function splitRadarResultsByMode<T extends { inferredType?: string | null }>(
  mode: RadarPrimarySearchMode,
  results: readonly T[],
): RadarModeSplit<T> {
  const sample: T[] = [];
  const crossReference: T[] = [];
  for (const result of results) {
    (radarResultBelongsToMode(mode, result.inferredType) ? sample : crossReference).push(result);
  }
  return { sample, crossReference };
}

/**
 * O QUE A FONTE ATUAL ENTREGA NO MODO VÍDEO.
 *
 * Existe para o relatório poder dizer "isto não foi observado porque a fonte
 * não fornece" — em vez de deixar o campo vazio parecendo ausência de padrão.
 */
export const RADAR_YOUTUBE_SOURCE_COVERAGE = {
  dataForSeoHas: [
    "URL e videoId (derivável da URL)",
    "título do vídeo",
    "canal (pelo domínio/URL, quando o provider o expõe)",
    "posição no bloco de vídeos da SERP",
    "descrição curta / snippet",
    "data, quando o item a traz",
  ],
  youtubeApiRequiredFor: [
    "visualizações",
    "duração exata",
    "capítulos",
    "transcrição / legendas",
    "inscritos e autoridade do canal",
    "links da descrição completa",
    "engajamento (likes, comentários)",
  ],
} as const;

/** A limitação, escrita para o relatório. */
export function radarYoutubeSourceLimitation(): string {
  return `A pesquisa de vídeo usa o bloco de vídeos da SERP: ela observa qual vídeo compete, de que canal e em que posição. ${RADAR_YOUTUBE_SOURCE_COVERAGE.youtubeApiRequiredFor.join(", ")} exigiriam a API oficial do YouTube e não foram observados.`;
}

/**
 * Trocar de modo com investigação em curso descarta a anterior.
 *
 * Não existe "misturar depois": um universo de vídeo e um de artigo respondem
 * perguntas diferentes. A troca é permitida — e explícita.
 */
export function radarSearchModeChange(input: {
  current: RadarPrimarySearchMode;
  next: RadarPrimarySearchMode;
  hasInvestigation: boolean;
}): { allowed: boolean; requiresReset: boolean; message: string | null } {
  if (input.current === input.next) return { allowed: true, requiresReset: false, message: null };
  if (!input.hasInvestigation) return { allowed: true, requiresReset: false, message: null };
  return {
    allowed: true,
    requiresReset: true,
    message: `A investigação atual foi feita em ${radarSearchModeLabel(input.current)}. Trocar para ${radarSearchModeLabel(input.next)} descarta o resultado vigente e recomeça a pesquisa.`,
  };
}
