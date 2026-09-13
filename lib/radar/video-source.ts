import { z } from "zod";
import { RADAR_VIDEO_TEXT_STATES, RADAR_VIDEO_TEXT_STATE_LABEL, type RadarVideoTextState } from "./video-text-acquisition.ts";

/**
 * A FONTE DELIBERADA DE VÍDEO — identidade própria, de propósito.
 *
 * `Pesquisa → YouTube` descobre o que o mercado publicou; esta área recebe o
 * que a marca ESCOLHEU. O invariante 24 separa os dois papéis, e a separação
 * começa aqui: uma `YouTubeCompetitiveReference` e uma `DeliberateVideoSource`
 * podem apontar para o mesmo vídeo sem compartilhar identidade. Colapsá-las
 * faria "este vídeo concorre comigo" e "decidi usar este vídeo" virarem a mesma
 * afirmação — e elas não são.
 *
 * POR QUE A NORMALIZAÇÃO NÃO REUSA `radarNormalizedUrl`.
 *
 * Aquela função descarta a query string, que é exatamente onde o YouTube guarda
 * o vídeo: `youtube.com/watch?v=ABC` viraria `youtube.com/watch`, e TODO vídeo
 * do formato canônico colapsaria numa identidade só. Ela está certa para o
 * papel dela — identidade de página na SERP — e errada para este.
 *
 * POR QUE TAMBÉM NÃO REUSA `normalizeYouTubeVideoId`.
 *
 * O extrator do provider vive em `lib/server/google-cloud/` e começa com
 * `import "server-only"`: importá-lo aqui quebraria o bundle do cliente. As
 * duas implementações precisam concordar, e é um teste que garante isso — não
 * a boa vontade de quem editar uma delas.
 *
 * Domínio puro: sem fetch, sem storage, sem provider. Nenhuma URL é visitada;
 * o `videoId` sai da própria string, deterministicamente.
 */

export const RADAR_VIDEO_SOURCE_KINDS = ["YOUTUBE"] as const;
export type RadarVideoSourceKind = typeof RADAR_VIDEO_SOURCE_KINDS[number];

export const RADAR_VIDEO_SOURCE_STATUSES = ["REGISTERED", "ARCHIVED"] as const;
export type RadarVideoSourceRegistrationStatus = typeof RADAR_VIDEO_SOURCE_STATUSES[number];

/** O formato canônico para o qual toda forma equivalente converge. */
const FORMA_CANONICA = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

const PADRAO_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS_YOUTUBE = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"]);
/** Os prefixos de caminho que carregam o id no segmento seguinte. */
const CAMINHOS_COM_ID = new Set(["shorts", "embed", "live", "v"]);

/**
 * O `videoId` de uma URL do YouTube, ou `null`.
 *
 * Devolve `null` em vez de lançar: um lote com uma URL ruim não pode derrubar
 * as boas (§6), então quem chama precisa de uma resposta, não de uma exceção.
 */
export function radarYouTubeVideoId(value: string): string | null {
  const texto = (value || "").trim();
  if (!texto) return null;
  if (PADRAO_VIDEO_ID.test(texto)) return texto;

  let url: URL;
  try {
    /* Sem esquema, `new URL` recusa; o usuário cola "youtu.be/ABC" o tempo todo. */
    url = new URL(/^[a-z]+:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const partes = url.pathname.split("/").filter(Boolean);

  let candidato = "";
  if (host === "youtu.be") candidato = partes[0] || "";
  else if (HOSTS_YOUTUBE.has(host)) {
    candidato = url.searchParams.get("v") || "";
    if (!candidato && partes.length > 1 && CAMINHOS_COM_ID.has(partes[0].toLowerCase())) candidato = partes[1];
  } else return null;

  return PADRAO_VIDEO_ID.test(candidato) ? candidato : null;
}

/** É uma URL bem formada, ainda que não seja do YouTube? */
export function radarVideoSourceIsUrl(value: string): boolean {
  const texto = (value || "").trim();
  if (!texto || /\s/.test(texto)) return false;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(texto) ? texto : `https://${texto}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/* A mesma assinatura FNV-1a que o restante do Radar usa para identidade. */
function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export type RadarVideoSourceIdentity = {
  kind: RadarVideoSourceKind;
  videoId: string;
  normalizedUrl: string;
  normalizedUrlHash: string;
};

/**
 * A IDENTIDADE CANÔNICA DA FONTE.
 *
 * `youtu.be/ID`, `watch?v=ID`, `shorts/ID`, `embed/ID` e `live/ID` são a MESMA
 * fonte deliberada: o usuário copiou de lugares diferentes, não escolheu vídeos
 * diferentes. Todas convergem para a forma canônica, e é ela que a restrição de
 * unicidade enxerga.
 */
export function radarVideoSourceIdentity(value: string): RadarVideoSourceIdentity | null {
  const videoId = radarYouTubeVideoId(value);
  if (!videoId) return null;
  const normalizedUrl = FORMA_CANONICA(videoId);
  return { kind: "YOUTUBE", videoId, normalizedUrl, normalizedUrlHash: `ytv:${assinatura(normalizedUrl)}` };
}

/* ======================= a classificação do lote ======================= */

export const RADAR_VIDEO_SOURCE_INPUT_VERDICTS = [
  "VALID",
  "DUPLICATE_IN_INPUT",
  "ALREADY_REGISTERED",
  "INVALID",
  "UNSUPPORTED",
] as const;
export type RadarVideoSourceInputVerdict = typeof RADAR_VIDEO_SOURCE_INPUT_VERDICTS[number];

export type RadarVideoSourceInputEntry = {
  /** A linha como o usuário colou, preservada para ele se reconhecer. */
  raw: string;
  verdict: RadarVideoSourceInputVerdict;
  reason: string;
  identity: RadarVideoSourceIdentity | null;
};

export type RadarVideoSourceBatch = {
  entries: RadarVideoSourceInputEntry[];
  /** Só o que deve ser gravado: válidas, sem repetição, ainda não registradas. */
  registrable: Array<RadarVideoSourceIdentity & { raw: string }>;
  counts: Record<RadarVideoSourceInputVerdict, number>;
};

/**
 * CLASSIFICAR ANTES DE GRAVAR — e nunca abortar o lote inteiro.
 *
 * Uma linha inválida no meio de dez boas é o caso comum de quem cola de uma
 * planilha. Recusar o lote todo obrigaria o usuário a caçar a linha ruim sem
 * saber qual é; classificar linha a linha devolve exatamente isso.
 *
 * A ordem dos veredictos importa: uma URL que já está registrada E aparece duas
 * vezes no input é `ALREADY_REGISTERED` na primeira ocorrência e
 * `DUPLICATE_IN_INPUT` na segunda — o usuário precisa ver as duas coisas.
 */
export function classifyRadarVideoSourceBatch(input: {
  raw: string;
  /** O que já está na biblioteca desta MARCA — a identidade não vê artigo. */
  existing?: ReadonlyArray<{ normalizedUrlHash: string }>;
}): RadarVideoSourceBatch {
  const jaRegistradas = new Set((input.existing || []).map(item => item.normalizedUrlHash));
  const vistasNoInput = new Set<string>();
  const entries: RadarVideoSourceInputEntry[] = [];
  const registrable: Array<RadarVideoSourceIdentity & { raw: string }> = [];

  /* Espaço em branco e nova linha separam; linha vazia não é entrada. */
  for (const raw of (input.raw || "").split(/\s+/).map(item => item.trim()).filter(Boolean)) {
    const identity = radarVideoSourceIdentity(raw);

    if (!identity) {
      const ehUrl = radarVideoSourceIsUrl(raw);
      entries.push({
        raw,
        verdict: ehUrl ? "UNSUPPORTED" : "INVALID",
        reason: ehUrl
          ? "Endereço válido, mas esta área aceita somente vídeos do YouTube nesta fase."
          : "Não é um endereço reconhecível.",
        identity: null,
      });
      continue;
    }

    if (jaRegistradas.has(identity.normalizedUrlHash)) {
      entries.push({ raw, verdict: "ALREADY_REGISTERED", reason: "Esta fonte já está na biblioteca desta marca. Marque o checkbox dela para usar neste artigo.", identity });
      continue;
    }
    if (vistasNoInput.has(identity.normalizedUrlHash)) {
      entries.push({ raw, verdict: "DUPLICATE_IN_INPUT", reason: "O mesmo vídeo aparece mais de uma vez no que foi colado.", identity });
      continue;
    }

    vistasNoInput.add(identity.normalizedUrlHash);
    entries.push({ raw, verdict: "VALID", reason: "Pronta para registrar.", identity });
    registrable.push({ ...identity, raw });
  }

  const counts = RADAR_VIDEO_SOURCE_INPUT_VERDICTS.reduce((total, verdict) => {
    total[verdict] = entries.filter(entry => entry.verdict === verdict).length;
    return total;
  }, {} as Record<RadarVideoSourceInputVerdict, number>);

  return { entries, registrable, counts };
}

/* ============================ o contrato ============================== */

export const RadarVideoSourceSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().uuid(),
  /*
   * PROVENIÊNCIA, NUNCA IDENTIDADE — e opcional desde o §2.3.2.
   *
   * Cadastrar sem artigo selecionado é fluxo principal: aí não existe artigo de
   * origem a registrar, e `null` é a resposta honesta. Quem quer saber o uso
   * consulta `radar_article_video_sources`, não esta coluna.
   */
  articleId: z.string().min(1).nullable().default(null),
  sourceKind: z.enum(RADAR_VIDEO_SOURCE_KINDS),
  originalUrl: z.string().min(1),
  normalizedUrl: z.string().min(1),
  normalizedUrlHash: z.string().min(1),
  youtubeVideoId: z.string().nullable().default(null),
  displayName: z.string().nullable().default(null),
  registrationStatus: z.enum(RADAR_VIDEO_SOURCE_STATUSES).default("REGISTERED"),
  registeredBy: z.string().nullable().default(null),
  /* Proveniência: de qual fundamento o registro partiu. Nunca autoridade. */
  registrationArticleDnaVersionId: z.string().nullable().default(null),
  registrationArticleDnaContentHash: z.string().nullable().default(null),
  /*
   * O ESTADO DO TEXTO É AUTORIDADE ÚNICA — §11 do Gate 2.
   *
   * A tela não deduz "pronto" pela existência de uma string de transcript: ela
   * lê isto. Um processamento a meio caminho, com texto parcial gravado,
   * pareceria concluído sob a outra regra.
   */
  textState: z.enum(RADAR_VIDEO_TEXT_STATES).default("REGISTERED"),
  textStateReason: z.string().nullable().default(null),
  /*
   * OS METADADOS PÚBLICOS — §7 do Gate 2.1.
   *
   * `metadataFetchedAt` é a autoridade de "já foi obtido": um título nulo pode
   * significar tanto "não buscamos" quanto "o vídeo não tem", e as duas coisas
   * pedem respostas diferentes na tela.
   */
  metadataFetchedAt: z.string().nullable().default(null),
  videoTitle: z.string().nullable().default(null),
  channelId: z.string().nullable().default(null),
  channelTitle: z.string().nullable().default(null),
  videoDescription: z.string().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
  duration: z.string().nullable().default(null),
  thumbnails: z.record(z.string(), z.unknown()).nullable().default(null),
  /* O `gs://` do arquivo que o humano enviou. É ele que cria a capability. */
  uploadedMediaUri: z.string().nullable().default(null),
  uploadedMediaContentType: z.string().nullable().default(null),
  uploadedMediaAt: z.string().nullable().default(null),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

/** O texto original preservado de uma fonte. Nunca sobrescrito. */
export const RadarVideoSourceTextSchema = z.object({
  id: z.string().min(1),
  videoSourceId: z.string().min(1),
  sourceMethod: z.string().min(1),
  provider: z.string().nullable().default(null),
  languageCode: z.string().nullable().default(null),
  transcriptText: z.string(),
  segments: z.array(z.object({ text: z.string(), startMs: z.number(), endMs: z.number() }).strict()).default([]),
  hasTimestamps: z.boolean().default(false),
  processingVersion: z.number().int().positive(),
  createdAt: z.string().min(1),
}).strict();

export type RadarVideoSourceText = z.infer<typeof RadarVideoSourceTextSchema>;

export type RadarVideoSource = z.infer<typeof RadarVideoSourceSchema>;

/**
 * O QUE A PRIMEIRA CAMADA MOSTRA — §10.
 *
 * Nome, plataforma, endereço, estado e data. Id e hash existem e ficam fora:
 * quem opera não escolhe um vídeo por hash.
 */
export function radarVideoSourceDisplay(source: RadarVideoSource) {
  return {
    /*
     * O TÍTULO DO VÍDEO VEM ANTES DA URL. Quem opera reconhece a fonte pelo
     * nome; a URL é o que sobra quando ainda não se buscou o metadado.
     */
    title: source.videoTitle?.trim() || source.displayName?.trim() || source.normalizedUrl,
    channel: source.channelTitle,
    duration: source.duration,
    publishedAt: source.publishedAt,
    hasMetadata: Boolean(source.metadataFetchedAt),
    hasUploadedMedia: Boolean(source.uploadedMediaUri),
    platform: source.sourceKind === "YOUTUBE" ? "YouTube" : source.sourceKind,
    url: source.normalizedUrl,
    statusLabel: source.registrationStatus === "REGISTERED" ? "Registrada" : "Arquivada",
    registeredAt: source.createdAt,
    /*
     * O ESTADO DO TEXTO, LIDO — não presumido.
     *
     * A frase vem do estado gravado, e não de "existe transcript?". Enquanto
     * ninguém acionar a extração, ela diz exatamente isso.
     */
    textStatus: RADAR_VIDEO_TEXT_STATE_LABEL[source.textState as RadarVideoTextState] || RADAR_VIDEO_TEXT_STATE_LABEL.REGISTERED,
    textStatusReason: source.textStateReason,
  };
}
