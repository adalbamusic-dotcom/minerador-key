/**
 * O TRANSCRIPT PÚBLICO DO YOUTUBE — best effort, e dito assim.
 *
 * O pacote `youtube-transcript` conversa com um endpoint NÃO OFICIAL do
 * YouTube: o mesmo que o player do site usa para carregar legendas. Ele não é
 * a YouTube Data API, não tem contrato de estabilidade e pode parar de
 * funcionar quando a plataforma mudar. Por isso ele NUNCA é autoridade sobre
 * metadado, e a proveniência do texto que ele traz é própria:
 * `PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL`.
 *
 * ================ O DEFEITO DO PACOTE QUE ESTE MÓDULO RESOLVE ===============
 *
 * `parseTranscriptXml` tem dois caminhos e DUAS UNIDADES, sem marcador:
 *
 *   srv3      <p t="12000" d="3000">   →  offset/duration em MILISSEGUNDOS
 *   clássico  <text start="12" dur="3">→  offset/duration em SEGUNDOS
 *
 * Os dois chegam no mesmo campo `offset`. Tratar tudo como milissegundo
 * comprimiria uma palestra de 50 minutos nos primeiros 3 segundos — em
 * silêncio, com o texto correto e os tempos todos errados. Tratar tudo como
 * segundo faria o inverso.
 *
 * A SAÍDA NÃO É ADIVINHAR. É comparar com a duração OFICIAL do vídeo, que a
 * YouTube Data API já nos deu e que está gravada na fonte. A interpretação que
 * couber na duração real é a verdadeira; quando nenhuma couber, ou quando não
 * existe duração oficial para comparar, a unidade fica INDETERMINADA — e aí o
 * texto é preservado SEM tempos, em vez de preservado com tempos inventados.
 *
 * É a mesma regra do R1 no Speech: palavra sem um dos limites é descartada,
 * nunca completada com zero.
 *
 * Domínio puro: sem fetch, sem rede, sem pacote importado aqui.
 */

/** Um trecho como o pacote devolve — unidade ambígua por construção. */
export type RawYouTubeTranscriptItem = {
  text: string;
  /** Início. Milissegundos no caminho srv3, SEGUNDOS no clássico. */
  offset: number;
  /** Duração, na mesma unidade ambígua do `offset`. */
  duration: number;
  lang?: string;
};

export const RADAR_TRANSCRIPT_TIMESTAMP_UNITS = ["MILLISECONDS", "SECONDS", "UNDETERMINED"] as const;
export type RadarTranscriptTimestampUnit = typeof RADAR_TRANSCRIPT_TIMESTAMP_UNITS[number];

export type RadarPublicTranscriptReading = {
  /** Trechos com tempo REAL, em ms. Vazio quando a unidade é indeterminada. */
  segments: Array<{ text: string; startMs: number; endMs: number }>;
  /** O texto original completo, sempre — ele não depende do tempo. */
  text: string;
  /** O idioma que o próprio YouTube declarou. Nunca inferido daqui. */
  languageCode: string | null;
  unit: RadarTranscriptTimestampUnit;
  hasTimestamps: boolean;
  /** Por que a unidade foi resolvida assim. Para auditoria, em português. */
  unitReason: string;
};

/**
 * QUAL UNIDADE O PACOTE USOU NESTA RESPOSTA.
 *
 * A evidência é a duração oficial do vídeo. Se o último trecho termina aos
 * 2.940.000 "unidades" e o vídeo tem 49 minutos, a unidade é milissegundo; se
 * termina aos 2.940 e o vídeo tem 49 minutos, é segundo.
 *
 * A tolerância existe porque legenda costuma terminar um pouco antes do fim do
 * vídeo, e o último trecho pode passar alguns segundos do corte. Ela é
 * generosa em relação ao fim e implacável em relação ao estouro: o que não
 * pode acontecer é a legenda durar MUITO mais que o vídeo.
 */
export function resolveRadarTranscriptUnit(input: {
  items: readonly RawYouTubeTranscriptItem[];
  /** Duração oficial do vídeo em ms, da YouTube Data API. `null` se não houver. */
  officialDurationMs: number | null;
}): { unit: RadarTranscriptTimestampUnit; reason: string } {
  const uteis = input.items.filter(item => Number.isFinite(item.offset) && Number.isFinite(item.duration));
  if (!uteis.length) return { unit: "UNDETERMINED", reason: "Nenhum trecho trouxe tempo numérico." };

  const fim = Math.max(...uteis.map(item => item.offset + item.duration));
  if (!(fim > 0)) return { unit: "UNDETERMINED", reason: "O último trecho não tem fim positivo." };

  if (!input.officialDurationMs || input.officialDurationMs <= 0) {
    /*
     * SEM DURAÇÃO OFICIAL NÃO HÁ COMO DECIDIR — e um palpite aqui seria pior
     * que a ausência: ele ficaria gravado como se fosse medida. Obter os
     * metadados públicos primeiro resolve.
     */
    return {
      unit: "UNDETERMINED",
      reason: "A duração oficial do vídeo não está disponível para conferir a unidade do tempo. Obtenha os metadados públicos e extraia de novo.",
    };
  }

  /*
   * A EVIDÊNCIA É COBERTURA, NÃO CONTINÊNCIA.
   *
   * "Cabe na duração" não distingue nada: 1.794 milissegundos cabem num vídeo
   * de 30 minutos, e 1.794 segundos também. O que separa as duas leituras é
   * QUANTO do vídeo a legenda cobre — uma legenda cobre quase o vídeo inteiro,
   * não 0,1% dele.
   *
   * O teto existe porque legenda não dura mais que o vídeo; o piso, porque uma
   * cobertura ínfima nas duas leituras significa que não dá para saber.
   */
  const cobertura = (valorMs: number) => valorMs / input.officialDurationMs!;
  const candidatos = [
    { unit: "MILLISECONDS" as const, razao: cobertura(fim) },
    { unit: "SECONDS" as const, razao: cobertura(fim * 1000) },
  ].filter(item => item.razao <= 1.1 && item.razao >= 0.5);

  if (!candidatos.length) {
    const excedeu = cobertura(fim) > 1.1 && cobertura(fim * 1000) > 1.1;
    return {
      unit: "UNDETERMINED",
      reason: excedeu
        ? "O transcript ultrapassa a duração oficial do vídeo nas duas leituras possíveis."
        : "A legenda cobre uma fração pequena demais do vídeo nas duas leituras: a unidade do tempo é ambígua.",
    };
  }
  /*
   * AS DUAS NUNCA PASSAM JUNTAS, e isso é aritmética, não sorte: as leituras
   * estão a um fator de 1000 uma da outra, então se uma cobre ≥ 50% do vídeo a
   * outra cobre ≥ 50.000%. Por isso não existe aqui um ramo de "empate" — ele
   * seria código morto, e código morto não é guarda: é ruído que ninguém testa.
   */
  const [escolhido] = candidatos;
  const rotulo = escolhido.unit === "MILLISECONDS" ? "milissegundos" : "segundos";
  return {
    unit: escolhido.unit,
    reason: `Lido em ${rotulo}, o transcript cobre ${Math.round(escolhido.razao * 100)}% da duração oficial do vídeo.`,
  };
}

/**
 * O QUE O PACOTE DEVOLVEU, VIRANDO EVIDÊNCIA GRAVÁVEL.
 *
 * O texto completo sai SEMPRE: ele é a matéria-prima e não depende do tempo.
 * Os trechos com tempo saem só quando a unidade foi estabelecida — §6 do gate
 * proíbe inventar timestamp ausente, e um timestamp na unidade errada é pior
 * que ausente, porque parece medido.
 *
 * NADA É TRADUZIDO, RESUMIDO OU REORGANIZADO. A ordem é a do provider.
 */
export function readRadarPublicTranscript(input: {
  items: readonly RawYouTubeTranscriptItem[];
  officialDurationMs?: number | null;
}): RadarPublicTranscriptReading {
  const limpos = input.items
    .map(item => ({ ...item, text: String(item.text ?? "").trim() }))
    .filter(item => item.text.length > 0);

  const { unit, reason } = resolveRadarTranscriptUnit({
    items: limpos,
    officialDurationMs: input.officialDurationMs ?? null,
  });

  const fator = unit === "MILLISECONDS" ? 1 : unit === "SECONDS" ? 1000 : 0;
  const segments = fator === 0 ? [] : limpos.flatMap(item => {
    const startMs = Math.round(item.offset * fator);
    const endMs = Math.round((item.offset + item.duration) * fator);
    /* Um trecho sem os dois limites reais é descartado, nunca completado. */
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
    return [{ text: item.text, startMs, endMs }];
  });

  /* O idioma é o que o YouTube declarou; ausência é `null`, nunca um palpite. */
  const idioma = limpos.map(item => item.lang).find(valor => typeof valor === "string" && valor.trim().length >= 2);

  return {
    segments,
    text: limpos.map(item => item.text).join(" "),
    languageCode: idioma ? idioma.trim() : null,
    unit,
    hasTimestamps: segments.length > 0,
    unitReason: reason,
  };
}

/**
 * A DURAÇÃO OFICIAL, do formato em que a YouTube Data API a entrega.
 *
 * `PT1H2M30S`. É a única medida confiável que temos do vídeo, e é ela que
 * resolve a unidade ambígua do tempo do transcript — por isso vive aqui, junto
 * de quem a usa, e devolve `null` em vez de zero quando não dá para ler.
 */
export function radarIsoDurationToMs(valor: string | null | undefined): number | null {
  if (typeof valor !== "string") return null;
  const achado = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(valor.trim());
  if (!achado) return null;
  const [, dias, horas, minutos, segundos] = achado;
  if (!dias && !horas && !minutos && !segundos) return null;
  const total =
    Number(dias || 0) * 86_400 +
    Number(horas || 0) * 3_600 +
    Number(minutos || 0) * 60 +
    Number(segundos || 0);
  return total > 0 ? Math.round(total * 1000) : null;
}

/* ===================== o resultado de uma tentativa ===================== */

export const RADAR_PUBLIC_TRANSCRIPT_OUTCOMES = [
  "TEXT_READY",
  /** O vídeo não tem legenda pública, ou o dono a desativou. Não é falha. */
  "PUBLIC_TRANSCRIPT_UNAVAILABLE",
  /** Rede, limite de requisições, endpoint fora do ar. Cabe repetir depois. */
  "FAILED_RETRYABLE",
] as const;
export type RadarPublicTranscriptOutcome = typeof RADAR_PUBLIC_TRANSCRIPT_OUTCOMES[number];

/**
 * O QUE UMA FALHA DO PACOTE SIGNIFICA PARA A FONTE — §8.
 *
 * "Este vídeo não tem legenda" NÃO é erro do sistema e não pode virar
 * `FAILED_FINAL`: a fonte continua válida, e quem opera ainda pode enviar
 * áudio ou informar a transcrição. "O endpoint não oficial mudou" também não
 * invalida a fonte — invalida a TENTATIVA.
 *
 * A distinção vem do nome da classe de erro do próprio pacote, que é estável o
 * suficiente para isso, com a mensagem como segunda evidência.
 */
export function classifyRadarPublicTranscriptFailure(error: unknown): { outcome: Exclude<RadarPublicTranscriptOutcome, "TEXT_READY">; reason: string } {
  const nome = (error as { name?: string })?.name || "";
  const mensagem = error instanceof Error ? error.message : String(error ?? "");
  const texto = `${nome} ${mensagem}`;

  if (/TooManyRequest/i.test(texto)) {
    return { outcome: "FAILED_RETRYABLE", reason: "O YouTube recusou por excesso de requisições. Tente de novo mais tarde." };
  }
  if (/TranscriptDisabled|NotAvailableLanguage|NotAvailable|VideoUnavailable/i.test(texto)) {
    return {
      outcome: "PUBLIC_TRANSCRIPT_UNAVAILABLE",
      reason: "Este vídeo não oferece legenda pública. A fonte continua registrada: envie o áudio ou informe a transcrição.",
    };
  }
  /*
   * QUALQUER OUTRA COISA É TENTATIVA FALHA, não fonte inválida. O endpoint não
   * é oficial: mudança de formato aparece aqui, e transformar isso em falha
   * definitiva da fonte apagaria um cadastro legítimo por um problema de fora.
   */
  return {
    outcome: "FAILED_RETRYABLE",
    reason: `A tentativa de legenda pública falhou (${mensagem || "motivo não informado"}). A fonte continua registrada.`,
  };
}

/** O que fica gravado sobre a origem deste texto, para daqui a dois anos. */
export const RADAR_PUBLIC_TRANSCRIPT_PROVIDER = "youtube-transcript";

/**
 * A DECLARAÇÃO DE QUE ISTO NÃO É API OFICIAL.
 *
 * Ela vai para a tela e para a proveniência. Um texto obtido por endpoint não
 * documentado não pode ser lido, no futuro, como se tivesse vindo da API.
 */
export const RADAR_PUBLIC_TRANSCRIPT_DISCLAIMER =
  "Obtido do endpoint público de legendas do YouTube, que não é API oficial e pode mudar sem aviso. Metadados continuam vindo da YouTube Data API.";
