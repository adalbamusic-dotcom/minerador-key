import { z } from "zod";

/**
 * O QUE O YOUTUBE DEVOLVE, NORMALIZADO — YOUTUBE_SEARCH_1 · §5, §6 e §7.
 *
 * ======================== ISTO NÃO É A ÁREA VÍDEOS ========================
 *
 * A área Vídeos é a biblioteca DELIBERADA: fontes que a marca escolheu para
 * enriquecer o artigo. Aqui é o oposto — é a SERP do YouTube, o que compete
 * pela intenção quer a marca goste ou não. Uma é curadoria, a outra é
 * observação de mercado, e confundi-las faria o benchmark descrever o acervo
 * da própria marca.
 *
 * ===================== O QUE NÃO ESTÁ AQUI NÃO É INVENTADO =====================
 *
 * Visualizações, duração e data vêm quando o provider as traz, e `null` quando
 * não. Um `0` em visualizações diria que o vídeo não foi visto — que é uma
 * afirmação, não uma ausência. O §5 é explícito: não inventar campo ausente.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/* ============================== um resultado ============================= */

export const RadarYoutubeSearchResultSchema = z.object({
  /** A identidade do vídeo no YouTube. É ela que decide duplicata. */
  videoId: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  channelName: z.string().nullable().default(null),
  channelId: z.string().nullable().default(null),
  /** §3 · o canal tem endereço e avatar próprios, e a tela usa os dois. */
  channelUrl: z.string().nullable().default(null),
  channelLogo: z.string().nullable().default(null),
  /**
   * AS TRÊS POSIÇÕES QUE O PROVIDER DÁ — e elas não são a mesma coisa.
   *
   * `rankGroup` é a posição entre os resultados do mesmo tipo, `rankAbsolute` é
   * a posição na lista inteira e `blockRank` é a posição no bloco renderizado.
   * Guardar só uma faria a proveniência mentir quando a SERP mistura formatos.
   * `rank` continua sendo o que a curadoria compara, e nasce de `rankAbsolute`.
   */
  rank: z.number().int().positive(),
  rankGroup: z.number().int().positive().nullable().default(null),
  rankAbsolute: z.number().int().positive().nullable().default(null),
  blockRank: z.number().int().positive().nullable().default(null),
  /**
   * O INSTANTE E O RÓTULO SÃO CAMPOS DIFERENTES — e confundi-los foi um defeito.
   *
   * O provider manda `publication_date: "há 7 meses"` e `timestamp` com a data
   * real. Gravar o rótulo no lugar do instante deixava `publishedAt` com um
   * texto que nenhuma conta de recência sabe ler.
   */
  publishedAt: z.string().nullable().default(null),
  publishedAtLabel: z.string().nullable().default(null),
  /** Em segundos, quando o provider informa. Nunca estimado. */
  durationSeconds: z.number().int().nonnegative().nullable().default(null),
  /** O rótulo como o YouTube o escreve: "14:39". Exibido, nunca recalculado. */
  durationLabel: z.string().nullable().default(null),
  views: z.number().int().nonnegative().nullable().default(null),
  description: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
  /**
   * O FORMATO VEM DO PROVIDER, NÃO DE PALPITE — §4.
   *
   * `is_shorts` é a resposta do YouTube sobre a prateleira em que o vídeo vive,
   * e ela vence a duração: o payload real tem Shorts de 1:42 e de 2:44. Deduzir
   * formato só por segundos classificaria esses dois como long-form.
   *
   * `null` é "o provider não disse", e não vira `false`: um `false` afirmaria
   * que o vídeo NÃO é Short, quando o que houve foi silêncio.
   */
  isShorts: z.boolean().nullable().default(null),
  isLive: z.boolean().nullable().default(null),
  isMovie: z.boolean().nullable().default(null),
  /** Selos que o próprio resultado trouxe: "AO VIVO", "4K". `null` vira lista vazia. */
  badges: z.array(z.string()).default([]),
  /** Qual consulta trouxe este item. A proveniência nasce aqui. */
  queryId: z.string().min(1),
}).strict();

export type RadarYoutubeSearchResult = z.infer<typeof RadarYoutubeSearchResultSchema>;

/* ========================= o universo competitivo ======================== */

/**
 * AS QUATRO CLASSES — e os critérios são de YouTube, não de HTML.
 *
 * O §7 é explícito: não aplicar automaticamente as regras do Google. Lá, o que
 * separa concorrente de ruído é estrutura de página. Aqui é FORMATO: um Short
 * de trinta segundos e um tutorial de doze minutos não disputam a mesma
 * intenção, mesmo que ambos falem do assunto.
 */
export const RADAR_YOUTUBE_UNIVERSE_CLASSES = [
  /** Vídeo editorial longo: tutorial, resenha, explicação com desenvolvimento. */
  "COMPARABLE_LONG_FORM",
  /**
   * SHORT NÃO É RUÍDO — YOUTUBE_SEARCH_1.1 · §4.
   *
   * O payload real mostrou a SERP misturando naturalmente tutorial de 19 minutos
   * com Short de 15 segundos: os dois competem pela mesma busca. Jogar o Short
   * em "não editorial" descartaria metade do universo que o YouTube considera
   * resposta.
   *
   * Eles ensinam coisas DIFERENTES — um ensina hook, ordem dos blocos,
   * demonstração e CTA; o outro ensina gancho imediato, formulação curta e
   * microestrutura — e é por isso que são duas classes e não uma.
   */
  "COMPARABLE_SHORT",
  /**
   * FALA DO ASSUNTO E O FORMATO NÃO SUSTENTA COMPARAÇÃO — ao vivo, estreia, e o
   * caso em que nem o provider nem a duração dizem qual é o formato.
   *
   * Não é descarte: é "entra no universo, fica fora das duas coortes". Empurrá-lo
   * para long-form ou para Shorts contaminaria a coorte que ele não pertence.
   */
  "PARTIAL",
  /** Não disputa a intenção: canal, playlist, anúncio, mix, filme. */
  "NOT_RELEVANT",
] as const;
export type RadarYoutubeUniverseClass = typeof RADAR_YOUTUBE_UNIVERSE_CLASSES[number];

export const RADAR_YOUTUBE_UNIVERSE_LABELS: Record<RadarYoutubeUniverseClass, string> = {
  COMPARABLE_LONG_FORM: "Long-form",
  COMPARABLE_SHORT: "Short",
  PARTIAL: "Parcial",
  NOT_RELEVANT: "Não disputa",
};

/** As duas coortes que se comparam entre si — e NUNCA uma com a outra (§4). */
export const RADAR_YOUTUBE_COMPARABLE_CLASSES = ["COMPARABLE_LONG_FORM", "COMPARABLE_SHORT"] as const;

/**
 * ABAIXO DISTO É FORMATO CURTO — e o número é declarado.
 *
 * Sessenta segundos é o teto histórico do Shorts. Ele decide o formato SOMENTE
 * quando o provider não disse: o payload real trouxe Shorts de 1:42 e 2:44, e
 * `is_shorts` é a autoridade justamente porque a duração já não basta.
 */
export const RADAR_YOUTUBE_SHORT_MAX_SECONDS = 60;

const SELOS_NAO_EDITORIAIS = ["playlist", "canal", "channel", "mix", "anúncio", "anuncio", "patrocinado", "sponsored"];
const SELOS_PARCIAIS = ["ao vivo", "live", "estreia", "premiere"];

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A CLASSE DE UM RESULTADO — e o motivo dela, sempre.
 *
 * Quem cura precisa saber POR QUE um vídeo ficou de fora do comparável. Sem o
 * motivo, "parcial" vira um rótulo que ninguém confere, e a pessoa acaba
 * incluindo tudo para não perder nada.
 */
export function radarYoutubeUniverseClass(result: {
  videoId: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  badges: readonly string[];
  isShorts?: boolean | null;
  isLive?: boolean | null;
  isMovie?: boolean | null;
}): { universeClass: RadarYoutubeUniverseClass; reason: string } {
  const selos = result.badges.map(semAcento);

  /*
   * O QUE NÃO DISPUTA A INTENÇÃO sai primeiro. Um resultado de canal, playlist
   * ou filme não tem abordagem nem sequência para comparar — e um anúncio está
   * ali porque foi pago, não porque venceu a busca.
   */
  const naoEditorial = selos.find(selo => SELOS_NAO_EDITORIAIS.some(termo => selo.includes(termo)));
  if (naoEditorial) return { universeClass: "NOT_RELEVANT", reason: `O resultado veio marcado como "${naoEditorial}": é uma coleção ou um anúncio, não um vídeo que disputa a intenção.` };
  if (result.isMovie === true) return { universeClass: "NOT_RELEVANT", reason: "O provider marcou o item como filme: ele não disputa a intenção editorial da busca." };
  /*
   * O ENDEREÇO DE UMA COLEÇÃO NEM SEMPRE TEM BARRA DEPOIS.
   *
   * Playlist é `/playlist?list=…`; canal é `/channel/UC…`, `/user/x`, `/c/x` ou
   * `/@handle`. Exigir a barra deixava a playlist passar como vídeo e cair em
   * "sem duração" — classificada como indecidível quando ela é decidida.
   */
  if (/youtube\.com\/(?:playlist|channel\/|user\/|c\/|@)/.test(result.url)) {
    return { universeClass: "NOT_RELEVANT", reason: "O endereço aponta para uma playlist ou um canal, não para um vídeo." };
  }

  /*
   * AO VIVO E ESTREIA SÃO PARCIAIS — o roteiro deles não está fechado, então
   * não há hook, sequência nem CTA estáveis para comparar.
   */
  if (result.isLive === true) return { universeClass: "PARTIAL", reason: "O vídeo está ao vivo: não há roteiro fechado para comparar abordagem nem sequência." };
  const parcial = selos.find(selo => SELOS_PARCIAIS.some(termo => selo.includes(termo)));
  if (parcial) return { universeClass: "PARTIAL", reason: `O resultado veio marcado como "${parcial}": fala do assunto, e o formato não sustenta comparação de abordagem.` };

  /*
   * ===================== O FORMATO DECIDE A COORTE — §4 =====================
   *
   * `is_shorts` é a autoridade, porque é o YouTube dizendo em que prateleira o
   * vídeo vive. A duração só responde quando o provider se cala: o payload real
   * trouxe Shorts de 1:42 e 2:44, que o teto de 60s classificaria como
   * long-form — e a coorte de long-form passaria a ter microestrutura dentro.
   */
  if (result.isShorts === true) {
    return {
      universeClass: "COMPARABLE_SHORT",
      reason: result.durationSeconds === null
        ? "O YouTube o entrega como Short: compete por gancho imediato e formulação curta."
        : `O YouTube o entrega como Short (${result.durationSeconds}s): compete por gancho imediato e formulação curta.`,
    };
  }

  if (result.durationSeconds === null) {
    /*
     * NEM SELO NEM DURAÇÃO É "NÃO SEI" — e "não sei" não entra em coorte.
     *
     * Chutar long-form encheria o benchmark de vídeo cujo formato ninguém
     * conferiu; chutar Short faria o mesmo do outro lado. Ele fica no universo,
     * visível e selecionável, fora das duas comparações.
     */
    return { universeClass: "PARTIAL", reason: "O provider não informou duração nem formato: sem isso não dá para comparar com long-form nem com Shorts." };
  }

  if (result.durationSeconds <= RADAR_YOUTUBE_SHORT_MAX_SECONDS) {
    return { universeClass: "COMPARABLE_SHORT", reason: `Dura ${result.durationSeconds}s, dentro do teto de formato curto: compete por gancho e microestrutura.` };
  }

  return { universeClass: "COMPARABLE_LONG_FORM", reason: "Vídeo editorial com duração que sustenta comparação de abordagem, sequência e desenvolvimento." };
}

/* ========================= o vídeo no universo ========================= */

/**
 * UM VÍDEO ENCONTRADO POR VÁRIAS CONSULTAS É UM CONCORRENTE — §6.
 *
 * Duplicá-lo inflaria o universo e faria o mesmo canal parecer dominar por
 * repetição. O que a repetição significa está preservado em
 * `occurrenceCount` e `queriesFoundIn`: um vídeo que aparece em quatro
 * consultas compete em quatro frentes, e isso é informação — não é volume.
 */
export const RadarYoutubeUniverseEntrySchema = z.object({
  videoId: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  channelName: z.string().nullable().default(null),
  channelId: z.string().nullable().default(null),
  channelUrl: z.string().nullable().default(null),
  channelLogo: z.string().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
  publishedAtLabel: z.string().nullable().default(null),
  durationSeconds: z.number().int().nonnegative().nullable().default(null),
  durationLabel: z.string().nullable().default(null),
  views: z.number().int().nonnegative().nullable().default(null),
  description: z.string().nullable().default(null),
  thumbnailUrl: z.string().nullable().default(null),
  isShorts: z.boolean().nullable().default(null),
  isLive: z.boolean().nullable().default(null),
  isMovie: z.boolean().nullable().default(null),
  badges: z.array(z.string()).default([]),
  /** Todas as consultas que o encontraram, na ordem em que foram executadas. */
  queriesFoundIn: z.array(z.string().min(1)).min(1),
  /** A melhor posição que ele alcançou em qualquer consulta. */
  bestRank: z.number().int().positive(),
  /** Todas as posições, por consulta. Nada é substituído pela melhor. */
  allRanks: z.array(z.object({ queryId: z.string().min(1), rank: z.number().int().positive() }).strict()).min(1),
  occurrenceCount: z.number().int().positive(),
  universeClass: z.enum(RADAR_YOUTUBE_UNIVERSE_CLASSES),
  universeReason: z.string().min(1),
}).strict();

export type RadarYoutubeUniverseEntry = z.infer<typeof RadarYoutubeUniverseEntrySchema>;

/**
 * O UNIVERSO, MONTADO A PARTIR DOS RESULTADOS CRUS.
 *
 * A ordem é a do mérito competitivo: melhor rank primeiro, e entre empates o
 * que apareceu em mais consultas. Ordenar por ordem de chegada faria a primeira
 * consulta parecer mais importante que as outras.
 *
 * O CAMPO MAIS COMPLETO VENCE quando duas consultas descrevem o mesmo vídeo com
 * detalhes diferentes: uma pode trazer duração e a outra não. Descartar a
 * segunda leitura perderia dado que o provider já entregou.
 */
export function buildRadarYoutubeUniverse(results: readonly RadarYoutubeSearchResult[]): RadarYoutubeUniverseEntry[] {
  const porVideo = new Map<string, {
    base: RadarYoutubeSearchResult;
    queries: string[];
    ranks: Array<{ queryId: string; rank: number }>;
  }>();

  for (const item of results) {
    const atual = porVideo.get(item.videoId);
    if (!atual) {
      porVideo.set(item.videoId, { base: item, queries: [item.queryId], ranks: [{ queryId: item.queryId, rank: item.rank }] });
      continue;
    }
    /* A mesma consulta não conta duas vezes o mesmo vídeo. */
    if (!atual.queries.includes(item.queryId)) {
      atual.queries.push(item.queryId);
      atual.ranks.push({ queryId: item.queryId, rank: item.rank });
    }
    atual.base = {
      ...atual.base,
      channelName: atual.base.channelName ?? item.channelName,
      channelId: atual.base.channelId ?? item.channelId,
      channelUrl: atual.base.channelUrl ?? item.channelUrl,
      channelLogo: atual.base.channelLogo ?? item.channelLogo,
      publishedAt: atual.base.publishedAt ?? item.publishedAt,
      publishedAtLabel: atual.base.publishedAtLabel ?? item.publishedAtLabel,
      durationSeconds: atual.base.durationSeconds ?? item.durationSeconds,
      durationLabel: atual.base.durationLabel ?? item.durationLabel,
      views: atual.base.views ?? item.views,
      description: atual.base.description ?? item.description,
      thumbnailUrl: atual.base.thumbnailUrl ?? item.thumbnailUrl,
      isShorts: atual.base.isShorts ?? item.isShorts,
      isLive: atual.base.isLive ?? item.isLive,
      isMovie: atual.base.isMovie ?? item.isMovie,
      badges: atual.base.badges.length ? atual.base.badges : item.badges,
    };
  }

  const entradas = [...porVideo.values()].map(item => {
    const classe = radarYoutubeUniverseClass({
      videoId: item.base.videoId, title: item.base.title, url: item.base.url,
      durationSeconds: item.base.durationSeconds, badges: item.base.badges,
      isShorts: item.base.isShorts, isLive: item.base.isLive, isMovie: item.base.isMovie,
    });
    return RadarYoutubeUniverseEntrySchema.parse({
      videoId: item.base.videoId,
      url: item.base.url,
      title: item.base.title,
      channelName: item.base.channelName,
      channelId: item.base.channelId,
      channelUrl: item.base.channelUrl,
      channelLogo: item.base.channelLogo,
      publishedAt: item.base.publishedAt,
      publishedAtLabel: item.base.publishedAtLabel,
      durationSeconds: item.base.durationSeconds,
      durationLabel: item.base.durationLabel,
      views: item.base.views,
      description: item.base.description,
      thumbnailUrl: item.base.thumbnailUrl,
      isShorts: item.base.isShorts,
      isLive: item.base.isLive,
      isMovie: item.base.isMovie,
      badges: item.base.badges,
      queriesFoundIn: item.queries,
      bestRank: Math.min(...item.ranks.map(rank => rank.rank)),
      allRanks: item.ranks,
      occurrenceCount: item.queries.length,
      universeClass: classe.universeClass,
      universeReason: classe.reason,
    });
  });

  return entradas.sort((esquerda, direita) =>
    esquerda.bestRank - direita.bestRank
    || direita.occurrenceCount - esquerda.occurrenceCount
    || esquerda.videoId.localeCompare(direita.videoId));
}

/* ============================== a contagem ============================== */

export type RadarYoutubeUniverseCounts = Record<RadarYoutubeUniverseClass, number> & { total: number; comparable: number };

export function radarYoutubeUniverseCounts(universe: readonly RadarYoutubeUniverseEntry[]): RadarYoutubeUniverseCounts {
  const contagem = { COMPARABLE_LONG_FORM: 0, COMPARABLE_SHORT: 0, PARTIAL: 0, NOT_RELEVANT: 0, total: universe.length, comparable: 0 };
  for (const item of universe) contagem[item.universeClass] += 1;
  contagem.comparable = contagem.COMPARABLE_LONG_FORM + contagem.COMPARABLE_SHORT;
  return contagem;
}

/* ===================== §4 · as duas coortes, separadas ==================== */

export type RadarYoutubeFormatCohorts = {
  longForm: RadarYoutubeUniverseEntry[];
  shorts: RadarYoutubeUniverseEntry[];
  partial: RadarYoutubeUniverseEntry[];
  notRelevant: RadarYoutubeUniverseEntry[];
};

/**
 * LONG-FORM E SHORTS SÃO DUAS LISTAS, E ISSO É ESTRUTURAL — §4.
 *
 * O gate proíbe calcular duração ou estrutura conjunta dos dois formatos, e a
 * forma de garantir isso não é lembrar: é nunca ter a lista misturada na mão de
 * quem calcula. Uma "duração média vencedora" somando 15 segundos com 19
 * minutos não descreve nenhum dos dois universos.
 */
export function radarYoutubeFormatCohorts(universe: readonly RadarYoutubeUniverseEntry[]): RadarYoutubeFormatCohorts {
  return {
    longForm: universe.filter(item => item.universeClass === "COMPARABLE_LONG_FORM"),
    shorts: universe.filter(item => item.universeClass === "COMPARABLE_SHORT"),
    partial: universe.filter(item => item.universeClass === "PARTIAL"),
    notRelevant: universe.filter(item => item.universeClass === "NOT_RELEVANT"),
  };
}

/* ==================== §6 e §7 · o sinal, não a verdade ==================== */

export const RADAR_YOUTUBE_SIGNAL_LEVELS = ["FORTE", "MEDIO", "OBSERVAR"] as const;
export type RadarYoutubeSignalLevel = typeof RADAR_YOUTUBE_SIGNAL_LEVELS[number];

export const RADAR_YOUTUBE_SIGNAL_LABELS: Record<RadarYoutubeSignalLevel, string> = {
  FORTE: "Sinal forte",
  MEDIO: "Sinal médio",
  OBSERVAR: "Observar",
};

export type RadarYoutubeCompetitiveSignal = {
  level: RadarYoutubeSignalLevel;
  score: number;
  /** Por que este nível. Sem isto o rótulo vira um número que ninguém confere. */
  reasons: string[];
};

/**
 * RECORRÊNCIA É FORÇA COMPETITIVA OBSERVADA — NÃO É VERDADE FACTUAL (§6).
 *
 * Um vídeo achado na posição 3 de uma consulta, na 7 de outra e na 2 de uma
 * terceira disputa três frentes; outro achado uma vez na posição 28 disputa
 * uma. Isso ORDENA e SUGERE — e é tudo o que faz. Quem seleciona continua
 * sendo quem opera, e por isso a função devolve motivos em vez de um veredito.
 *
 * O cálculo é determinístico e só usa o que a SERP já entregou: nenhuma
 * chamada, nenhuma estimativa, nada inventado. Campo ausente simplesmente não
 * pontua — ele não penaliza, porque ausência do provider não é demérito do
 * vídeo.
 */
export function radarYoutubeCompetitiveSignal(input: {
  entry: Pick<RadarYoutubeUniverseEntry, "bestRank" | "occurrenceCount" | "views" | "publishedAt" | "universeClass">;
  totalQueries: number;
  /** O instante de referência da coleta. Recência é relativa a ele, não a "agora". */
  collectedAt?: string | null;
}): RadarYoutubeCompetitiveSignal {
  const { entry } = input;
  const reasons: string[] = [];
  let score = 0;

  if (entry.bestRank <= 3) { score += 3; reasons.push(`Chegou à posição ${entry.bestRank} — topo da busca.`); }
  else if (entry.bestRank <= 10) { score += 2; reasons.push(`Melhor posição ${entry.bestRank} — primeira tela.`); }
  else { reasons.push(`Melhor posição ${entry.bestRank}.`); }

  const consultas = Math.max(1, input.totalQueries);
  if (entry.occurrenceCount >= 3) { score += 3; reasons.push(`Apareceu em ${entry.occurrenceCount} de ${consultas} consultas — disputa várias frentes.`); }
  else if (entry.occurrenceCount === 2) { score += 2; reasons.push(`Apareceu em 2 de ${consultas} consultas.`); }
  else { reasons.push(`Apareceu em 1 de ${consultas} consultas.`); }

  if (entry.views !== null) {
    if (entry.views >= 100_000) { score += 2; reasons.push(`${entry.views.toLocaleString("pt-BR")} visualizações.`); }
    else if (entry.views >= 10_000) { score += 1; reasons.push(`${entry.views.toLocaleString("pt-BR")} visualizações.`); }
    else { reasons.push(`${entry.views.toLocaleString("pt-BR")} visualizações.`); }
  } else {
    reasons.push("O provider não informou visualizações.");
  }

  /*
   * RECÊNCIA SE MEDE CONTRA A COLETA, NÃO CONTRA `Date.now()`.
   *
   * Um universo gravado há três meses precisa ser lido hoje com os mesmos
   * números de quando foi coletado; usar o relógio faria o mesmo dado mudar de
   * sinal sozinho, e ninguém saberia por quê.
   */
  const referencia = input.collectedAt ? Date.parse(input.collectedAt) : Number.NaN;
  const publicado = entry.publishedAt ? Date.parse(entry.publishedAt) : Number.NaN;
  if (Number.isFinite(referencia) && Number.isFinite(publicado)) {
    const meses = (referencia - publicado) / (1000 * 60 * 60 * 24 * 30.44);
    if (meses <= 12) { score += 2; reasons.push("Publicado no último ano."); }
    else if (meses <= 24) { score += 1; reasons.push("Publicado nos últimos dois anos."); }
    else { reasons.push("Publicado há mais de dois anos."); }
  }

  /* O que não disputa a intenção não recebe nível de sinal — ele não compete. */
  if (entry.universeClass === "NOT_RELEVANT") return { level: "OBSERVAR", score: 0, reasons: ["Não disputa a intenção da busca."] };

  const level: RadarYoutubeSignalLevel = score >= 8 ? "FORTE" : score >= 5 ? "MEDIO" : "OBSERVAR";
  return { level, score, reasons };
}
