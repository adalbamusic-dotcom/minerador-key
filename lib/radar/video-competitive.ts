import { radarYoutubeCredentialMarker } from "./youtube-blueprint.ts";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  normalizeSerpCacheKeyword,
  sameSerpCacheLens,
  serpCacheLensLabel,
  type SerpCacheLens,
  type SerpOrganicDigest,
} from "../editorial/serp-cache.ts";
import { radarWritingDecodeEntities } from "./portable-writing-export.ts";

/*
 * 2026-10-09 · A RÉGUA DA AMOSTRA PERTINENTE FOI MORAR COM A COORTE
 * (`youtube-blueprint.ts`): a fotografia nova do YouTube nasce dela, e a
 * fotografia não pode importar o export. Os nomes continuam saindo daqui, sem
 * mudar de comportamento — e com eles a decisão única de formato curto
 * (`radarVideoFormatDecision`), que o CSV de vídeo, a tela e o Redator leem.
 */
export {
  RADAR_VIDEO_PERTINENT,
  RADAR_VIDEO_RELEVANCE_LABELS,
  radarVideoAudienceReading,
  radarVideoAudienceReadingOf,
  radarVideoCohortRange,
  radarVideoFormatCohortsOf,
  radarVideoFormatDecision,
  radarVideoPertinentSample,
  radarVideoRelevance,
  radarVideoSameStem,
  type RadarVideoAudienceReading,
  type RadarVideoFormatDecision,
  type RadarVideoPertinentSample,
  type RadarVideoRelevance,
} from "./youtube-blueprint.ts";
import type { RadarVideoRelevance } from "./youtube-blueprint.ts";

/**
 * ===== 2026-10-07 · A LEITURA COMPETITIVA DO VÍDEO, FORA DO EXPORT (pedido do dono) =====
 *
 * "Caprichar na pesquisa competitiva": a relevância de cada concorrente para o
 * público era privada do CSV de vídeo e servia só para rotular a lista do topo.
 * As estatísticas de duração e formato continuavam somando os vídeos fora do
 * tema — o CSV real dizia "10 de 44 só citam a plataforma… mas entram nas
 * estatísticas". Aqui a régua de relevância (movida sem mudar de
 * comportamento, com a assinatura relaxada para título e canal) e a amostra
 * PERTINENTE: as mesmas funções da fotografia do YouTube (`radarYoutubeCohort`,
 * `radarYoutubeAvFormats`), aplicadas só aos vídeos que falam com o público.
 *
 * A fotografia nunca é recalculada nem regravada: isto é releitura no export,
 * como os padrões de título já são. Sem o universo (congelamento que guarda só
 * a referência da corrida), não há o que reler — e quem chama diz isso.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/* ============================== o formato curto e o carrossel ============================== */

/*
 * ===== 2026-10-07 · A CONCORRÊNCIA DO CURTO E DO CARROSSEL COM O QUE JÁ EXISTE (item 6 do desenho) =====
 *
 * Pedido do dono: "utilizar a SERP para fazer desses conteúdos competitivos…
 * eles podem ser fundamento dos vídeos e dos carrosséis". O Radar não tem
 * coleta própria de Reels, TikTok nem carrossel — mas o Google já mostra
 * curtos (blocos de vídeos curtos e de vídeos, com o autor e a duração no fim
 * do título) e o orgânico das quatro lentes já traz Reels, posts e carrosséis
 * do Instagram, TikTok, Shorts e LinkedIn. Aqui ficam as réguas puras dessa
 * leitura: o que cada endereço é (pela URL, nada inventado), quem assina e se
 * o nome traz credencial, quanto dura (só quando o título diz) e o orgânico
 * das lentes extras lido do resumo gravado no cache.
 *
 * Nenhuma régua aqui olha imagem, retenção ou alcance: o Radar não vê nada
 * disso. Domínio puro: sem fetch, sem storage, sem provider.
 */

/** 2026-10-07 · O rótulo curto da relevância, para listas que dividem a célula com outras leituras. */
export const RADAR_VIDEO_RELEVANCE_SHORT: Readonly<Record<RadarVideoRelevance, string>> = {
  MESMO: "mesmo público",
  PROXIMO: "público vizinho",
  GERAL: "tema geral",
  OUTRO: "outro público",
  FORA: "fora do tema da busca",
};

/*
 * A CREDENCIAL NO NOME, POR LISTA FECHADA (2026-10-07).
 * 2026-10-09 · uma lista só: a régua mora em `youtube-blueprint.ts`
 * (`radarYoutubeCredentialMarker`), que a lacuna de autoridade da fotografia
 * também lê; o nome daqui continua, apontando para ela.
 */
export const radarVideoCredentialMarker = (valor: string | null | undefined): string | null => radarYoutubeCredentialMarker(valor);

/*
 * OS SINAIS DO TÍTULO QUE SE LEEM SEM VER A THUMBNAIL: palavra inteira em caixa
 * alta (4 letras ou mais, para sigla não contar), número, pergunta, emoji e
 * credencial no título ou no canal. É o padrão do TÍTULO — a imagem não foi
 * vista e nada aqui fala dela.
 */
export type RadarVideoTitleSignals = { total: number; caixaAlta: number; numero: number; pergunta: number; emoji: number; credencial: number };

export function radarVideoTitleSignals(videos: ReadonlyArray<{ title: string; channelName?: string | null }>): RadarVideoTitleSignals {
  const conta = (teste: (video: { title: string; channelName?: string | null }) => boolean) => videos.filter(teste).length;
  return {
    total: videos.length,
    caixaAlta: conta(video => /(?:^|[^\p{L}])\p{Lu}{4,}(?![\p{L}])/u.test(video.title)),
    numero: conta(video => /\d/.test(video.title)),
    pergunta: conta(video => video.title.includes("?")),
    emoji: conta(video => /\p{Extended_Pictographic}/u.test(video.title)),
    credencial: conta(video => Boolean(radarVideoCredentialMarker(`${video.title} ${video.channelName || ""}`))),
  };
}

/*
 * O QUE CADA ENDEREÇO É, PELA URL. Reel, post, Short, vídeo do TikTok e artigo
 * ou post do LinkedIn; perfil fica fora da conta (não é peça). Carrossel só é
 * CONFIRMADO quando a URL do post traz `img_index` — o parâmetro só existe em
 * post com várias imagens; sem ele, o post é "post" e o número de lâminas não
 * é afirmado.
 */
export type RadarSocialPiece = {
  rede: "Instagram" | "TikTok" | "YouTube" | "LinkedIn";
  tipo: "Reel" | "post" | "carrossel confirmado (img_index)" | "vídeo" | "post de fotos" | "Short" | "artigo" | "perfil";
  /** Perfil não é peça: fica fora da conta e da lista. */
  perfil: boolean;
  /** A peça sem parâmetros de rastreio nem de imagem: a mesma peça em duas lentes é uma só. */
  chave: string;
};

export function radarSocialPieceOf(url: string | null | undefined): RadarSocialPiece | null {
  let endereco: URL;
  try {
    endereco = new URL(url || "");
  } catch {
    return null;
  }
  const host = endereco.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const partes = endereco.pathname.split("/").filter(Boolean);
  const peca = (rede: RadarSocialPiece["rede"], tipo: RadarSocialPiece["tipo"], id: string): RadarSocialPiece =>
    ({ rede, tipo, perfil: tipo === "perfil", chave: `${rede}:${tipo === "carrossel confirmado (img_index)" ? "post" : tipo}:${id.toLowerCase()}` });
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const indice = partes.findIndex(parte => ["reel", "reels", "p", "tv"].includes(parte.toLowerCase()));
    const id = indice >= 0 ? partes[indice + 1] : null;
    if (!id) return peca("Instagram", "perfil", partes[0] || host);
    const marca = partes[indice].toLowerCase();
    if (marca === "p") return peca("Instagram", endereco.searchParams.has("img_index") ? "carrossel confirmado (img_index)" : "post", id);
    return peca("Instagram", marca === "tv" ? "vídeo" : "Reel", id);
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const indice = partes.findIndex(parte => parte === "video" || parte === "photo");
    if (indice < 0 || !partes[indice + 1]) return peca("TikTok", "perfil", partes[0] || host);
    return peca("TikTok", partes[indice] === "photo" ? "post de fotos" : "vídeo", partes[indice + 1]);
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    return partes[0] === "shorts" && partes[1] ? peca("YouTube", "Short", partes[1]) : null;
  }
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    if (partes[0] === "pulse" && partes[1]) return peca("LinkedIn", "artigo", partes[1]);
    if ((partes[0] === "posts" && partes[1]) || (partes[0] === "feed" && partes[1] === "update" && partes[2])) return peca("LinkedIn", "post", partes[0] === "posts" ? partes[1] : partes[2]);
    if (["in", "company", "school"].includes(partes[0] || "")) return peca("LinkedIn", "perfil", partes[1] || host);
    return null;
  }
  return null;
}

/*
 * OS CURTOS QUE O GOOGLE MOSTRA, sem repetição. No fixture real, os três itens
 * do bloco de vídeos repetem três do bloco de vídeos curtos: a mesma peça é
 * uma. O bloco de curtos vem primeiro (é ele que traz a duração no fim do
 * título); o de vídeos só acrescenta o que não repetiu. O título sai sem a
 * moldura do Google ("… enviado por X em Instagram. Assistir em Instagram.
 * 0:19"); o autor é só o campo `source` do provider; a duração, só quando o
 * título termina em m:ss.
 */
export type RadarGoogleShortVideo = {
  url: string;
  titulo: string;
  autor: string | null;
  segundos: number | null;
  plataforma: string;
  bloco: "VIDEO" | "SHORT_VIDEOS";
  youtubeVideoId: string | null;
  peca: RadarSocialPiece | null;
  /**
   * É formato curto: veio do bloco de vídeos curtos, ou a URL é Reel, Short ou
   * vídeo do TikTok. O vídeo comum do YouTube no bloco de vídeos é listado,
   * mas fica fora da amostra de curtos (no CSV real, os três eram longos).
   */
  curto: boolean;
};

const SEM_MOLDURA = /\s*(?:\.{3}|…)?\s*enviado por\s[\s\S]*$/i;
const DURACAO_NO_FIM = /(?:^|\s)(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\s*$/;

export function radarGoogleShortVideos(videos: ReadonlyArray<{ title: string; url: string; source: string | null; block: "VIDEO" | "SHORT_VIDEOS"; youtubeVideoId: string | null; platform: string }>): RadarGoogleShortVideo[] {
  const ordem = [...videos.filter(video => video.block === "SHORT_VIDEOS"), ...videos.filter(video => video.block !== "SHORT_VIDEOS")];
  const vistos = new Set<string>();
  const saida: RadarGoogleShortVideo[] = [];
  for (const video of ordem) {
    const peca = radarSocialPieceOf(video.url);
    let chave = video.youtubeVideoId ? `youtube:${video.youtubeVideoId}` : peca?.chave || video.url.toLowerCase();
    try {
      if (!video.youtubeVideoId && !peca) { const endereco = new URL(video.url); chave = `${endereco.hostname.replace(/^www\./, "")}${endereco.pathname.replace(/\/$/, "")}`.toLowerCase(); }
    } catch { /* URL sem formato: a chave é o texto dela */ }
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const tempo = video.title.match(DURACAO_NO_FIM);
    const segundos = tempo ? (tempo[3] ? Number(tempo[1]) * 3600 + Number(tempo[2]) * 60 + Number(tempo[3]) : Number(tempo[1]) * 60 + Number(tempo[2])) : null;
    const titulo = radarWritingDecodeEntities(video.title).replace(SEM_MOLDURA, "").replace(/\s*(?:\.{3}|…)\s*$/, "").trim() || video.title.trim();
    const curto = video.block === "SHORT_VIDEOS" || (peca !== null && (peca.tipo === "Reel" || peca.tipo === "Short" || (peca.rede === "TikTok" && peca.tipo === "vídeo")));
    saida.push({ url: video.url, titulo, autor: texto(video.source) || null, segundos, plataforma: video.platform, bloco: video.block, youtubeVideoId: video.youtubeVideoId, peca, curto });
  }
  return saida;
}

/* ============================== o orgânico das lentes extras ============================== */

/*
 * ===== 2026-10-07 · A ÚNICA LEITURA NOVA: O RESUMO ORGÂNICO DAS LENTES EXTRAS =====
 *
 * As três lentes extras (desktop · macOS, mobile · Android, mobile · iOS) são
 * gravadas sem corpo; delas o cache guarda o resumo orgânico (top 10 com url e
 * título), que o Minerador já lê para classificar a lente. O CSV de vídeo lê o
 * MESMO resumo, grátis, só para a keyword principal e só no modo vídeo — a
 * lente da investigação sai do snapshot que o pacote já referencia. Aqui fica
 * a parte pura: quais pedidos vão ao cache e o que cada lente devolveu, com o
 * motivo quando não devolveu nada. A leitura em si mora em `lib/server`.
 */
export type RadarVideoLensOrganic = {
  /** O rótulo técnico da lente: "desktop-macos", "mobile-android", "mobile-ios". */
  lens: string;
  /** O top 10 orgânico do resumo gravado; `null` quando a lente não tem leitura (o motivo em `missing`). */
  organic: Array<{ url: string; title: string | null; position: number | null }> | null;
  missing: string | null;
  /**
   * 2026-10-07 (revisão) · Aditivo: quando o cache observou esta lente
   * (`meta.collectedAt`). O resumo é o do momento da exportação, não o do
   * pacote congelado: a coluna diz a data e se ela é posterior ao
   * congelamento, como a coluna serp_lenses faz. Ausente/`null` = não lida.
   */
  collectedAt?: string | null;
};
export type RadarVideoLensOrganicReading = { readFailed: boolean; lenses: RadarVideoLensOrganic[] };

const chaveDaKeyword = (valor: string | null | undefined) => normalizeSerpCacheKeyword((valor || "").replace(/\s+/g, " ").trim());

/** Os pedidos de resumo: só a keyword principal de cada artigo, só nas lentes que não são a canônica. */
export function radarVideoLensDigestRequests<T extends { query: { keyword: string; lens: SerpCacheLens } }>(
  pedidos: readonly T[],
  principais: ReadonlyArray<string | null | undefined>,
): T[] {
  const chaves = new Set(principais.map(chaveDaKeyword).filter(Boolean));
  return pedidos.filter(pedido => !sameSerpCacheLens(pedido.query.lens, SERP_CACHE_CANONICAL_LENS) && chaves.has(chaveDaKeyword(pedido.query.keyword)));
}

type LeituraDoResumo = {
  request: { query: { keyword: string; lens: SerpCacheLens } };
  hit: { digest?: SerpOrganicDigest; meta?: { collectedAt?: string | null } } | null;
  missReason: string | null;
};

/** O que cada lente extra devolveu para a principal do artigo, com o motivo quando não devolveu. */
export function radarVideoLensOrganicOf(
  leitura: { lookups: readonly LeituraDoResumo[]; readFailed: boolean },
  keyword: string | null | undefined,
): RadarVideoLensOrganicReading {
  const chave = chaveDaKeyword(keyword);
  const lentes = SERP_CACHE_LENSES.filter(lens => !sameSerpCacheLens(lens, SERP_CACHE_CANONICAL_LENS));
  return {
    readFailed: leitura.readFailed,
    lenses: lentes.map(lens => {
      const rotulo = serpCacheLensLabel(lens);
      if (leitura.readFailed) return { lens: rotulo, organic: null, missing: "a leitura do cache falhou nesta exportação" };
      const achada = chave ? leitura.lookups.find(item => chaveDaKeyword(item.request.query.keyword) === chave && sameSerpCacheLens(item.request.query.lens, lens)) : null;
      if (!achada) return { lens: rotulo, organic: null, missing: "a lente não foi pedida ao cache" };
      if (!achada.hit) return { lens: rotulo, organic: null, missing: `sem coleta válida no cache (${achada.missReason || "sem entrada"})` };
      if (!achada.hit.digest) return { lens: rotulo, organic: null, missing: "a coleta gravada não tem o resumo orgânico" };
      return {
        lens: rotulo,
        organic: achada.hit.digest.organic.flatMap(item => (item.url ? [{ url: item.url, title: item.title ?? null, position: typeof item.rank_group === "number" ? item.rank_group : null }] : [])),
        missing: null,
        collectedAt: achada.hit.meta?.collectedAt ?? null,
      };
    }),
  };
}
