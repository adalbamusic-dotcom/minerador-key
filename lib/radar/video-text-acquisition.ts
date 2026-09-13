/**
 * COMO SE OBTÉM O TEXTO DE UMA FONTE — com a infraestrutura Google que o
 * MineKey realmente tem.
 *
 * A Plataforma opera três Connections neste domínio, e cada uma faz uma coisa:
 *
 *   YouTube Data API     identifica o vídeo e devolve METADADOS PÚBLICOS.
 *                        Não é provider de transcrição.
 *   Cloud Storage        preserva a mídia que a marca legitimamente possui e
 *                        devolve um `gs://` para processar.
 *   Speech-to-Text       transcreve ÁUDIO, com idioma e tempos reais.
 *                        Não converte URL do YouTube em áudio.
 *
 * Google Ads não participa deste domínio.
 *
 * A FRONTEIRA QUE ISSO CRIA, e que não é defeito do produto:
 *
 *   `captions.list` e `captions.download` exigem OAuth, e o download exige
 *   permissão sobre o vídeo. Uma API key de metadados públicos não alcança
 *   nenhum dos dois. Portanto legenda de vídeo de TERCEIRO não é obtenível com
 *   as Connections atuais — e tentar em silêncio só transformaria uma fronteira
 *   conhecida em erro intermitente.
 *
 * O QUE ISSO NÃO IMPEDE: registrar a fonte, obter os metadados públicos dela, e
 * receber o texto por um caminho legítimo — mídia da própria marca, legenda do
 * próprio canal, ou transcrição que o humano forneça.
 *
 * Domínio puro: sem fetch, sem provider, sem storage.
 */

import type { RadarVideoSourceKind } from "./video-source.ts";

export const RADAR_VIDEO_TEXT_METHODS = [
  /** O humano forneceu o texto. Proveniência própria: não se finge que veio de API. */
  "USER_PROVIDED_TRANSCRIPT",
  /** Legenda do canal da própria marca, via OAuth com permissão sobre o vídeo. */
  "OWNED_YOUTUBE_CAPTION",
  /** Arquivo de mídia que a marca enviou: vai ao Storage e daí ao Speech. */
  "MEDIA_FILE_TO_SPEECH",
  /** Áudio que já está preservado no Storage durável da marca. */
  "STORED_AUDIO_TO_SPEECH",
  /*
   * BEST EFFORT, E NÃO API OFICIAL — Gate 2.4.
   *
   * O endpoint público de legendas do YouTube: o mesmo que o player usa. Não é
   * a Data API, não tem contrato de estabilidade, e por isso tem proveniência
   * PRÓPRIA. Gravar isto como OWNED_YOUTUBE_CAPTION ou como se fosse a API
   * mentiria sobre a origem da evidência daqui a dois anos.
   */
  "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL",
] as const;
export type RadarVideoTextMethod = typeof RADAR_VIDEO_TEXT_METHODS[number];

export type RadarVideoAcquisitionCapability = {
  available: boolean;
  method: RadarVideoTextMethod | null;
  /** O motivo em português, para quem opera — nunca um código. */
  reason: string;
  /** O que tornaria o caminho possível. Vazio quando já é. */
  requires: string[];
};

/**
 * O QUE CADA CONNECTION OFERECE HOJE — declarado, nunca presumido.
 *
 * `youtubeMetadata`, `cloudStorage` e `speechToText` estão READY na Plataforma.
 * `ownedChannelOAuth` é capacidade FUTURA: ela não nasce da mesma credencial —
 * a API key atual é de metadados públicos, e OAuth de canal é outra coisa.
 */
export type RadarVideoAcquisitionInfrastructure = {
  youtubeMetadata: boolean;
  ownedChannelOAuth: boolean;
  cloudStorage: boolean;
  speechToText: boolean;
  /** Tentativa de legenda pública. NÃO é Connection: é best effort. */
  publicTranscriptBestEffort: boolean;
};

export const RADAR_VIDEO_ACQUISITION_TODAY: RadarVideoAcquisitionInfrastructure = {
  youtubeMetadata: true,
  ownedChannelOAuth: false,
  cloudStorage: true,
  speechToText: true,
  publicTranscriptBestEffort: true,
};

/** A frase única da fronteira, para a tela e o worker dizerem o mesmo. */
export const RADAR_PUBLIC_YOUTUBE_TEXT_LIMITATION =
  "A configuração atual não possui acesso à legenda ou ao áudio deste vídeo: a YouTube Data API responde com metadados públicos, e obter legenda exige OAuth com permissão sobre o vídeo.";

export function radarVideoAcquisitionCapability(input: {
  kind: RadarVideoSourceKind;
  /** O humano já forneceu um texto para esta fonte? */
  hasProvidedTranscript?: boolean;
  /** A marca já enviou um arquivo de mídia desta fonte? */
  hasUploadedMedia?: boolean;
  /** Já existe áudio desta fonte preservado no Storage? */
  hasStoredAudio?: boolean;
  /** A fonte é um vídeo de canal da própria marca? */
  ownedByBrand?: boolean;
  infrastructure?: RadarVideoAcquisitionInfrastructure;
}): RadarVideoAcquisitionCapability {
  const infra = input.infrastructure || RADAR_VIDEO_ACQUISITION_TODAY;

  /*
   * O TEXTO FORNECIDO VENCE — e não por preguiça.
   *
   * Ele não custa provider, não depende de autorização e é o original mais
   * fiel quando a marca já o tem. A proveniência registra que veio do humano;
   * fingir que veio da API seria mentir sobre a origem da evidência.
   */
  if (input.hasProvidedTranscript) {
    return { available: true, method: "USER_PROVIDED_TRANSCRIPT", reason: "O texto foi fornecido para esta fonte e é preservado como original.", requires: [] };
  }

  if (input.hasStoredAudio && infra.speechToText) {
    return { available: true, method: "STORED_AUDIO_TO_SPEECH", reason: "O áudio desta fonte já está preservado e pode ser transcrito.", requires: [] };
  }

  if (input.hasUploadedMedia && infra.cloudStorage && infra.speechToText) {
    return { available: true, method: "MEDIA_FILE_TO_SPEECH", reason: "A mídia enviada será preservada no Storage e transcrita.", requires: [] };
  }

  if (input.kind === "YOUTUBE" && input.ownedByBrand && infra.ownedChannelOAuth) {
    return { available: true, method: "OWNED_YOUTUBE_CAPTION", reason: "A legenda pode ser obtida como dono do canal.", requires: [] };
  }

  /*
   * A TENTATIVA BEST EFFORT — Gate 2.4, e ela é a ÚLTIMA das vias automáticas.
   *
   * Vem depois do áudio que a marca possui de propósito: quando existe mídia,
   * o Speech dá tempos reais e não depende de endpoint não documentado. Esta
   * aqui é o que resolve o caso comum — 25 palestras coladas, nenhuma mídia em
   * mãos — sem obrigar ninguém a baixar 25 áudios.
   *
   * "Best effort" está no contrato, não só no comentário: `available` é `true`
   * porque VALE TENTAR, e quem chama sabe que a tentativa pode voltar vazia
   * sem que isso seja falha da fonte.
   */
  if (input.kind === "YOUTUBE" && infra.publicTranscriptBestEffort) {
    return {
      available: true,
      method: "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL",
      reason: "Vamos tentar a legenda pública deste vídeo. É um endpoint não oficial do YouTube: pode não existir legenda, e aí a fonte continua registrada para você enviar o áudio ou informar a transcrição.",
      requires: [],
    };
  }

  /*
   * PUBLIC_YOUTUBE_URL_ONLY — a fronteira, dita.
   *
   * Metadados continuam disponíveis; texto, não. As três saídas legítimas
   * ficam escritas para que a limitação venha com o caminho, e não só com o
   * "não".
   */
  return {
    available: false,
    method: null,
    reason: RADAR_PUBLIC_YOUTUBE_TEXT_LIMITATION,
    requires: [
      "enviar o arquivo de mídia/áudio deste vídeo, quando a marca o possui; ou",
      "informar a transcrição que a marca já tem; ou",
      "OAuth do canal da própria marca, para vídeos dela — capacidade futura.",
    ],
  };
}

/* ===================== o estado do texto de uma fonte ==================== */

export const RADAR_VIDEO_TEXT_STATES = [
  "REGISTERED",
  /** Os metadados públicos foram obtidos. O texto continua não existindo. */
  "METADATA_READY",
  /**
   * NÃO É FALHA. É a configuração atual não ter via autorizada de aquisição —
   * sabido ANTES de tentar. Colapsar isto em `FAILED_*` faria o sistema
   * repetir para sempre algo que nunca teve caminho.
   */
  "TEXT_ACQUISITION_UNAVAILABLE",
  /**
   * TENTAMOS A LEGENDA PÚBLICA E ELA NÃO EXISTE — Gate 2.4, §8.
   *
   * Diferente de `TEXT_ACQUISITION_UNAVAILABLE`, que é saber ANTES de tentar
   * que não há via. Aqui houve tentativa, e a resposta foi "este vídeo não tem
   * legenda". Não é falha do sistema e não é fonte inválida: as duas saídas
   * humanas — enviar áudio, informar transcrição — continuam abertas, e é por
   * isso que este estado não colapsa em `FAILED_*`.
   */
  "PUBLIC_TRANSCRIPT_UNAVAILABLE",
  "QUEUED",
  "PROCESSING",
  "TEXT_READY",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
] as const;
export type RadarVideoTextState = typeof RADAR_VIDEO_TEXT_STATES[number];

export const RADAR_VIDEO_TEXT_STATE_LABEL: Record<RadarVideoTextState, string> = {
  REGISTERED: "Texto ainda não disponível",
  METADATA_READY: "Metadados obtidos · texto ainda não disponível",
  TEXT_ACQUISITION_UNAVAILABLE: "Texto ainda não disponível",
  /* Tentamos e não existe. Diferente de nunca ter havido via. */
  PUBLIC_TRANSCRIPT_UNAVAILABLE: "Sem legenda pública — envie o áudio ou informe a transcrição",
  QUEUED: "Na fila de extração",
  PROCESSING: "Extraindo texto",
  TEXT_READY: "Texto disponível",
  FAILED_RETRYABLE: "Falhou — será tentada novamente",
  FAILED_FINAL: "Falha definitiva",
};

/**
 * A EXTRAÇÃO PODE SER PEDIDA?
 *
 * Oferecer a ação sem capability transformaria uma fronteira conhecida em
 * suspeita de defeito a cada clique. E pedir de novo o que já está na fila ou
 * pronto é o que criaria job duplicado.
 */
export function radarVideoTextCanRequest(input: {
  state: RadarVideoTextState;
  capability: RadarVideoAcquisitionCapability;
}): { allowed: boolean; reason: string } {
  if (!input.capability.available) return { allowed: false, reason: input.capability.reason };
  if (input.state === "QUEUED" || input.state === "PROCESSING") {
    return { allowed: false, reason: "Já existe uma extração em andamento para esta fonte." };
  }
  /*
   * TEXT_READY É SOURCE-LEVEL — §9 do Gate 2.4.
   *
   * O texto pertence à FONTE, não ao artigo. Um segundo artigo que selecione a
   * mesma palestra reusa o que existe; nenhuma segunda chamada ao endpoint.
   */
  if (input.state === "TEXT_READY") return { allowed: false, reason: "O texto desta fonte já foi preservado e é reutilizado por qualquer artigo que a selecione." };
  /*
   * `PUBLIC_TRANSCRIPT_UNAVAILABLE` NÃO TRANCA A FONTE.
   *
   * Tentar de novo é legítimo: legenda pode ser publicada depois, e enviar o
   * áudio muda a via para o Speech. O que não existe é retry automático — a
   * porta continua aberta, e quem a abre é o clique.
   */
  if (input.state === "FAILED_FINAL") return { allowed: false, reason: "A extração falhou em definitivo; repetir exige decisão humana explícita." };
  return { allowed: true, reason: "Pronta para extrair o texto." };
}

/**
 * OS METADADOS PÚBLICOS PODEM SER PEDIDOS?
 *
 * Ação separada e explícita: obter metadado NÃO inicia transcrição, e nenhuma
 * coleta acontece no F5. Vale para fonte de terceiro tanto quanto para a
 * própria — é a única coisa que a API key alcança em ambas.
 */
export function radarVideoMetadataCanRequest(input: {
  kind: RadarVideoSourceKind;
  hasMetadata: boolean;
  infrastructure?: RadarVideoAcquisitionInfrastructure;
}): { allowed: boolean; reason: string } {
  const infra = input.infrastructure || RADAR_VIDEO_ACQUISITION_TODAY;
  if (input.kind !== "YOUTUBE") return { allowed: false, reason: "Metadados públicos são obtidos apenas para vídeos do YouTube nesta fase." };
  if (!infra.youtubeMetadata) return { allowed: false, reason: "A Connection da YouTube Data API não está disponível." };
  if (input.hasMetadata) return { allowed: false, reason: "Os metadados desta fonte já foram obtidos." };
  return { allowed: true, reason: "Pronta para obter os metadados públicos." };
}
