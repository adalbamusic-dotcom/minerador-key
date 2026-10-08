import {
  RADAR_YOUTUBE_MIN_COHORT,
  radarYoutubeAvFormats,
  radarYoutubeCohort,
  radarYoutubeTitlePatterns,
  type RadarYoutubeAvFormat,
  type RadarYoutubeCohort,
} from "./youtube-blueprint.ts";
import type { RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  normalizeSerpCacheKeyword,
  sameSerpCacheLens,
  serpCacheLensLabel,
  type SerpCacheLens,
  type SerpOrganicDigest,
} from "../editorial/serp-cache.ts";
import { radarUbiquitousStems } from "./intent-adherence.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarWritingCompareKey, radarWritingDecodeEntities, type RadarWritingProjections } from "./portable-writing-export.ts";

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

const GENERICAS_DO_PUBLICO = new Set(radarSemanticStems("profissionais profissional pessoas que atendem atende outras especialidades entram quando o artigo tiver esse público explicitamente definido trabalham"));

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const unicos = (valores: readonly string[]): string[] => {
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

export function radarVideoAudienceReading(p: RadarWritingProjections, publico: string | null, titulos: readonly string[] = []): RadarVideoAudienceReading {
  const principal = new Set(radarSemanticStems(texto(p.dna.principalKeyword)));
  const complementares = unicos([...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements]).flatMap(item => radarSemanticStems(item));
  const nucleo = new Set([...principal, ...complementares]);
  const primeiraFrase = (publico || "").split(/(?<=[.!?])\s+/)[0] || "";
  const corte = primeiraFrase.search(/\s(que|quem|onde)\s/i);
  const quem = corte > 0 ? primeiraFrase.slice(0, corte) : primeiraFrase;
  const resto = corte > 0 ? primeiraFrase.slice(corte) : "";
  const util = (raiz: string) => !GENERICAS_DO_PUBLICO.has(raiz) && !nucleo.has(raiz);
  const publicoRaizes = new Set(radarSemanticStems(quem).filter(util));
  return {
    publico: publicoRaizes,
    vizinho: new Set([...radarSemanticStems(resto).filter(raiz => util(raiz) && !publicoRaizes.has(raiz)), ...complementares.filter(raiz => !principal.has(raiz))]),
    nucleo,
    onipresentes: radarUbiquitousStems(titulos.map(titulo => radarWritingDecodeEntities(titulo))),
  };
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
  /* Do assunto, o título só tem o que todo título da amostra tem (a plataforma): fora do tema. */
  const doAssunto = doTitulo.filter(raiz => [...leitura.nucleo].some(outra => radarVideoSameStem(raiz, outra)));
  if (!doAssunto.some(raiz => !leitura.onipresentes.has(raiz))) return "FORA";
  return "GERAL";
}

/* ============================== a amostra pertinente ============================== */

export type RadarVideoPertinentSample = {
  longos: { total: number; coorte: RadarYoutubeCohort };
  curtos: { total: number; coorte: RadarYoutubeCohort };
  /** Quantos ficaram fora da conta, por motivo. */
  foraDaConta: { FORA: number; OUTRO: number };
  /** Os formatos AV dos pertinentes (longos e Shorts juntos, como a fotografia faz). */
  formatos: RadarYoutubeAvFormat[];
  /** A coorte que governa a faixa: a maior, nunca as duas somadas (a mesma regra da fotografia). */
  lider: "LONG_FORM" | "SHORTS";
  /** P25 → P75 da coorte que lidera, pela régua da fotografia (`faixaRecomendada`). */
  faixa: { min: number; max: number } | null;
  /** O formato que domina os pertinentes; sem padrão, o mesmo texto da fotografia. */
  formato: string;
  /** A ressalva de amostra pequena, por coorte pertinente (só quando a coorte inteira tinha vídeo). */
  ressalvas: string[];
};

/*
 * A faixa recomendada é P25 → P75 da coorte que lidera — as mesmas quatro
 * linhas de `faixaRecomendada` (youtube-blueprint.ts), que é privada lá. Replicar
 * é mais barato que exportar e mantém a fotografia intocada.
 */
function faixaDa(coorte: RadarYoutubeCohort): { min: number; max: number } | null {
  const baixo = coorte.durationSeconds.p25;
  const alto = coorte.durationSeconds.p75;
  if (baixo === null || alto === null || baixo <= 0) return null;
  return { min: Math.max(1, Math.round(baixo)), max: Math.max(Math.round(alto), Math.round(baixo) + 1) };
}

/*
 * 2026-10-07 (revisão) · A faixa de UMA coorte pela mesma régua: a cadeia
 * competitiva diz a faixa do formato que a sequência segue (longos ou Shorts
 * pertinentes), não a da coorte que lidera — "vídeo longo, faixa 25s a 45s"
 * juntava o formato de um lado com a faixa do outro.
 */
export const radarVideoCohortRange = (coorte: RadarYoutubeCohort): { min: number; max: number } | null => faixaDa(coorte);

export function radarVideoPertinentSample(input: {
  videos: readonly RadarYoutubeUniverseEntry[];
  relevancia: (video: RadarYoutubeUniverseEntry) => RadarVideoRelevance;
  collectedAt: string | null;
}): RadarVideoPertinentSample {
  const lidos = input.videos.map(video => ({ video, relevancia: input.relevancia(video) }));
  const pertinentes = lidos.filter(item => RADAR_VIDEO_PERTINENT.has(item.relevancia)).map(item => item.video);
  const ehLongo = (video: RadarYoutubeUniverseEntry) => video.universeClass === "COMPARABLE_LONG_FORM";
  const ehCurto = (video: RadarYoutubeUniverseEntry) => video.universeClass === "COMPARABLE_SHORT";
  const longos = radarYoutubeCohort({ format: "LONG_FORM", entries: pertinentes.filter(ehLongo), collectedAt: input.collectedAt });
  const curtos = radarYoutubeCohort({ format: "SHORTS", entries: pertinentes.filter(ehCurto), collectedAt: input.collectedAt });
  const comparaveis = pertinentes.filter(video => ehLongo(video) || ehCurto(video));
  const formatos = radarYoutubeAvFormats(radarYoutubeTitlePatterns(comparaveis.map(video => video.title)), comparaveis.length);
  const lider = curtos.videoCount > longos.videoCount ? curtos : longos;
  const total = { longos: input.videos.filter(ehLongo).length, curtos: input.videos.filter(ehCurto).length };
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
    faixa: faixaDa(lider),
    formato: formatos[0]?.label ?? "Definido pela intenção do artigo",
    ressalvas,
  };
}

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

const normalizado = (valor: string | null | undefined) => (valor || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/*
 * A CREDENCIAL NO NOME, POR LISTA FECHADA: os marcadores de autoridade da
 * pesquisa do YouTube (dermatologista, médico, especialista, Dra., Dr.) e as
 * profissões e conselhos equivalentes. "Profissional" sozinho não é credencial
 * ("Maquiadora Profissional" declara ofício, não registro), e "explica" é
 * marca de título, não de nome.
 */
const CREDENCIAL = /(?:^|[^a-z])(dra?|doutora?|medic[oa]|dermatologista|especialista|farmaceutic[oa]|nutricionista|biomedic[oa]|enfermeir[oa]|fisioterapeuta|psicolog[oa]|dentista|odontolog[oa]|esteticista|cosmetolog[oa]|advogad[oa]|crm|cro|crf|crn|crbm|coren|crefito|crp|oab)(?![a-z])/;

/** 2026-10-07 · O marcador de credencial no texto (nome do autor, título ou canal), ou `null`. */
export function radarVideoCredentialMarker(valor: string | null | undefined): string | null {
  return normalizado(valor).match(CREDENCIAL)?.[1] ?? null;
}

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
