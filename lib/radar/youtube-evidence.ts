import { z } from "zod";
import { RadarYoutubeBlueprintSchema, type RadarYoutubeBlueprint } from "./youtube-blueprint.ts";
import { RadarYoutubeSearchRunSchema, type RadarYoutubeSearchRun } from "./youtube-search-run.ts";
import { RADAR_EDITORIAL_OUTPUTS, RadarMultimodalBlueprintSchema, type RadarMultimodalBlueprint } from "./multimodal-blueprint.ts";
import { RADAR_RESEARCH_SOURCES, type RadarResearchSource } from "./search-mode.ts";

/**
 * ===== O CONGELAMENTO E A EVIDÊNCIA — YOUTUBE_SEARCH_2 · §12 e §13 =====
 *
 * ===================== POR QUE CONGELAR — §12 =====================
 *
 * O blueprint é recalculável a partir da corrida. Recalculá-lo a cada abertura
 * faria uma melhoria no vocabulário de padrões mudar conceitos, lacunas e
 * roteiro sob o mesmo carimbo de "finalizado" — e ninguém saberia por quê.
 *
 * FINALIZE tira a fotografia: consultas, amostra, coortes, sinais, blueprint,
 * limitações e proveniência ficam como estavam no instante da decisão humana.
 * F5 e outra sessão leem a mesma coisa porque leem a fotografia, não o cálculo.
 *
 * =========== POR QUE `observed` E `recommended` SÃO SEPARADOS — §13 ===========
 *
 * Quem consome esta camada — Planejador, Redator — precisa distinguir o que foi
 * COLETADO do que foi DERIVADO. Um roteiro recomendado chegando com a mesma
 * autoridade de uma contagem de vídeos é como uma opinião nossa vira "dado de
 * mercado" três módulos adiante.
 *
 * NENHUM TRANSCRIPT ATRAVESSA AQUI. A camada não tem campo para ele, e isso é
 * deliberado: um campo vazio esperando o dia em que houver transcrição seria um
 * convite a preenchê-lo com o que a área Vídeos já guarda por outro caminho.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem IA.
 */

/* ========================= §12 · a fotografia ========================= */

export const RadarYoutubeFrozenInvestigationSchema = z.object({
  frozenVersion: z.literal(1),
  finalizedAt: z.string().min(1),
  finalizedBy: z.string().min(1),
  /**
   * ====== A REFERÊNCIA À CORRIDA — RADAR_BLUEPRINT_CANONICAL_1 · §2 ======
   *
   * A auditoria do banco mediu o estrago: no artigo real, a fotografia pesava
   * 144.440 bytes e 126.656 deles eram a corrida copiada VERBATIM — idêntica,
   * byte a byte, à que já estava em `youtubeSearch` na mesma versão da análise.
   * 88% da fotografia era matéria-prima repetida.
   *
   * FOTOGRAFIA DAS CONCLUSÕES ≠ CÓPIA DA MATÉRIA-PRIMA.
   *
   * O que a imutabilidade exige é que as CONCLUSÕES não mudem. A corrida já é
   * append-only e tem identidade própria (`runId` + assinatura do fingerprint):
   * apontar para ela preserva a fotografia e para de pagar duas vezes por ela.
   */
  runRef: z.object({
    runId: z.string().min(1),
    runVersion: z.number().int().positive(),
    /** A assinatura do fingerprint. É ela que prova que a corrida é a mesma. */
    runFingerprint: z.string().min(1),
    collectedAt: z.string().min(1),
    provider: z.string().min(1),
    endpoint: z.string().min(1),
    /** Contagens congeladas: a leitura não depende de reabrir a corrida. */
    queriesExecuted: z.number().int().nonnegative(),
    universeSize: z.number().int().nonnegative(),
    selectedVideoIds: z.array(z.string().min(1)).default([]),
  }).strict().nullable().default(null),

  /**
   * ====== A CORRIDA COPIADA — LEGADO, E SÓ LEGADO — §3 ======
   *
   * Fotografias tiradas antes deste gate têm a corrida inteira aqui. Elas
   * DEVEM continuar legíveis: reescrevê-las seria migrar histórico, que este
   * gate proíbe. Congelamentos novos deixam este campo `null` e preenchem
   * `runRef`.
   */
  run: RadarYoutubeSearchRunSchema.nullable().default(null),
  blueprint: RadarYoutubeBlueprintSchema,
  /**
   * ============ A CAMADA MULTIFORMATO — RADAR_MULTIMODAL_1.1 · §9 ============
   *
   * O congelamento passou a guardar a investigação INTEIRA: as fontes usadas, o
   * cruzamento entre as SERPs, a saída editorial e o blueprint multiformato.
   *
   * O campo continua se chamando `youtubeFrozenInvestigation` no contrato
   * porque renomeá-lo agora seria migração de dado, não correção de fluxo — a
   * mesma decisão que manteve "versão de análise" como nome do contêiner
   * neutro. O nome é técnico; o conteúdo é a investigação toda.
   *
   * Aditivo com `.nullable().default(null)`: investigação congelada antes
   * deste gate continua legível, sem camada multiformato — e isso é a verdade
   * sobre ela, não uma leitura inventada.
   */
  multimodal: z.object({
    blueprint: RadarMultimodalBlueprintSchema,
    /** As fontes de pesquisa que sustentaram esta fotografia. */
    researchSources: z.array(z.enum(RADAR_RESEARCH_SOURCES)),
    editorialOutput: z.enum(RADAR_EDITORIAL_OUTPUTS),
  }).strict().nullable().default(null),
  /** As limitações vigentes no instante do congelamento. */
  limitations: z.array(z.string()),
}).strict();
export type RadarYoutubeFrozenInvestigation = z.infer<typeof RadarYoutubeFrozenInvestigationSchema>;

export class RadarYoutubeFinalizeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RadarYoutubeFinalizeError";
    this.code = code;
  }
}

/**
 * FINALIZE É DECISÃO HUMANA, e ele recusa o que não dá para congelar.
 *
 * Congelar uma coleta que falhou, ou uma que ainda está em curso, produziria
 * uma fotografia de nada — e ela chegaria ao Planejador com o mesmo peso de uma
 * investigação real.
 */
export function freezeRadarYoutubeInvestigation(input: {
  run: RadarYoutubeSearchRun;
  blueprint: RadarYoutubeBlueprint;
  finalizedBy: string;
  finalizedAt: string;
  /**
   * A CAMADA MULTIFORMATO, quando houver leitura das duas SERPs — §9.
   *
   * Opcional porque um artigo pode ter só a SERP do YouTube. Nesse caso o
   * congelamento sai sem ela, e a ausência é a verdade sobre a investigação.
   */
  multimodal?: { blueprint: RadarMultimodalBlueprint; researchSources: readonly RadarResearchSource[] } | null;
}): RadarYoutubeFrozenInvestigation {
  if (input.run.state !== "COLLECTED") {
    throw new RadarYoutubeFinalizeError(
      "youtube_run_not_collected",
      input.run.state === "COLLECTING"
        ? "A coleta ainda está em andamento; espere ela terminar antes de finalizar."
        : "A coleta falhou: não há amostra competitiva para congelar.",
    );
  }
  if (!input.run.universe.length) {
    throw new RadarYoutubeFinalizeError("youtube_universe_empty", "A coleta não devolveu vídeo nenhum; não há universo competitivo para congelar.");
  }
  /*
   * O BLUEPRINT TEM DE SER O DESTA CORRIDA.
   *
   * Congelar um blueprint gerado de outra coleta amarraria uma leitura a uma
   * amostra que não a produziu — e a proveniência apontaria para o lugar errado
   * para sempre.
   */
  if (input.blueprint.runId !== input.run.runId || input.blueprint.runFingerprint !== input.run.fingerprint.signature) {
    throw new RadarYoutubeFinalizeError("youtube_blueprint_mismatch", "O blueprint não corresponde à coleta que está sendo finalizada.");
  }

  return RadarYoutubeFrozenInvestigationSchema.parse({
    frozenVersion: 1,
    finalizedAt: input.finalizedAt,
    finalizedBy: input.finalizedBy,
    /*
     * §2 · REFERÊNCIA, NÃO CÓPIA.
     *
     * As contagens vêm junto porque a tela precisa delas para dizer "3
     * consultas · 38 vídeos" sem reabrir a corrida — o que é leitura, não
     * duplicação: são quatro números, não 126 KB de amostra.
     */
    runRef: {
      runId: input.run.runId,
      runVersion: input.run.runVersion,
      runFingerprint: input.run.fingerprint.signature,
      collectedAt: input.run.provenance.collectedAt,
      provider: input.run.provenance.provider,
      endpoint: input.run.provenance.endpoint,
      queriesExecuted: input.run.queries.filter(item => item.executed).length,
      universeSize: input.run.universe.length,
      selectedVideoIds: [...input.run.selectedVideoIds],
    },
    /* A cópia sai. O legado continua sendo lido pelo resolvedor abaixo. */
    run: null,
    blueprint: input.blueprint,
    multimodal: input.multimodal
      ? {
        blueprint: input.multimodal.blueprint,
        researchSources: [...input.multimodal.researchSources],
        /* A saída editorial vem do blueprint — nunca escolhida à parte. */
        editorialOutput: input.multimodal.blueprint.recommended.editorialOutput,
      }
      : null,
    limitations: [...new Set([
      ...input.run.limitations,
      ...input.blueprint.limitations,
      ...(input.multimodal?.blueprint.limitations || []),
    ])],
  });
}

/**
 * ========= §3 · A CORRIDA DE UMA FOTOGRAFIA, NOVA OU LEGADA =========
 *
 * Duas formas de congelamento convivem, e a diferença não pode vazar para
 * quem lê:
 *
 *   NOVA     `runRef` aponta para a corrida que vive em `youtubeSearch`.
 *   LEGADA   `run` traz a corrida copiada, de antes deste gate.
 *
 * A ordem importa. A referência vem primeiro porque é a forma corrente; a
 * cópia responde quando não há referência. Inverter faria uma fotografia nova,
 * cuja cópia é `null`, parecer vazia.
 *
 * REFERÊNCIA QUEBRADA É ERRO, NUNCA SILÊNCIO. Se a fotografia aponta para uma
 * corrida que a análise não tem, devolver `null` faria a tela dizer "nenhum
 * vídeo" sobre uma investigação finalizada — e ninguém saberia que o elo se
 * perdeu. Quem chama recebe o motivo.
 */
export class RadarYoutubeRunRefError extends Error {
  readonly code: string;
  readonly runId: string;
  constructor(code: string, message: string, runId: string) {
    super(message);
    this.name = "RadarYoutubeRunRefError";
    this.code = code;
    this.runId = runId;
  }
}

export function resolveRadarFrozenRun(input: {
  frozen: RadarYoutubeFrozenInvestigation;
  /** A corrida viva da MESMA versão da análise. */
  liveRun: RadarYoutubeSearchRun | null | undefined;
}): RadarYoutubeSearchRun {
  const referencia = input.frozen.runRef;

  if (referencia) {
    const viva = input.liveRun;
    if (!viva) {
      throw new RadarYoutubeRunRefError(
        "youtube_run_ref_missing",
        "A investigação congelada aponta para uma coleta que não está nesta versão da análise.",
        referencia.runId,
      );
    }
    /*
     * A IDENTIDADE É CONFERIDA, não presumida. `runId` igual com assinatura
     * diferente significa que a corrida foi refeita sob o mesmo nome — e a
     * fotografia passaria a descrever uma amostra que não é a dela.
     */
    if (viva.runId !== referencia.runId) {
      throw new RadarYoutubeRunRefError(
        "youtube_run_ref_mismatch",
        "A coleta gravada não é a que foi congelada nesta investigação.",
        referencia.runId,
      );
    }
    if (viva.fingerprint.signature !== referencia.runFingerprint) {
      throw new RadarYoutubeRunRefError(
        "youtube_run_ref_fingerprint",
        "A coleta mudou desde o congelamento: a assinatura não confere com a da fotografia.",
        referencia.runId,
      );
    }
    return viva;
  }

  if (input.frozen.run) return input.frozen.run;

  throw new RadarYoutubeRunRefError(
    "youtube_run_unresolvable",
    "A investigação congelada não tem referência de coleta nem cópia legada.",
    "",
  );
}

/**
 * AS CONTAGENS DA FOTOGRAFIA, SEM PRECISAR DA CORRIDA.
 *
 * A tela mostra "3 consultas · 38 vídeos" o tempo todo; abrir a amostra é
 * exceção. Ler quatro números da referência evita carregar a corrida para
 * responder o que já está congelado ao lado.
 */
export function radarFrozenRunCounts(frozen: RadarYoutubeFrozenInvestigation) {
  if (frozen.runRef) {
    return {
      queriesExecuted: frozen.runRef.queriesExecuted,
      universeSize: frozen.runRef.universeSize,
      selectedVideoIds: frozen.runRef.selectedVideoIds,
      collectedAt: frozen.runRef.collectedAt,
    };
  }
  /* Legado: os números saem da cópia, que é o que aquela fotografia tem. */
  return {
    queriesExecuted: frozen.run?.queries.filter(item => item.executed).length || 0,
    universeSize: frozen.run?.universe.length || 0,
    selectedVideoIds: frozen.run?.selectedVideoIds || [],
    collectedAt: frozen.run?.provenance.collectedAt || frozen.finalizedAt,
  };
}

/* ===================== §13 · a camada de evidência ===================== */

export const RadarYoutubeEvidenceSchema = z.object({
  researchMode: z.literal("YOUTUBE"),
  /** De onde esta evidência veio, para ela poder ser conferida. */
  provenance: z.object({
    runId: z.string().min(1),
    runFingerprint: z.string().min(1),
    provider: z.string().min(1),
    endpoint: z.string().min(1),
    collectedAt: z.string().min(1),
    finalizedAt: z.string().min(1),
    queriesExecuted: z.number().int().nonnegative(),
  }).strict(),

  /**
   * O QUE FOI OBSERVADO — conferível item a item na amostra congelada.
   */
  observedEvidence: z.object({
    universeSize: z.number().int().nonnegative(),
    comparableSize: z.number().int().nonnegative(),
    selectedVideoIds: z.array(z.string().min(1)),
    longForm: z.object({
      videoCount: z.number().int().nonnegative(),
      durationSeconds: z.object({ p25: z.number().nullable(), median: z.number().nullable(), p75: z.number().nullable() }).strict(),
      titlePatterns: z.array(z.object({ id: z.string(), label: z.string(), count: z.number().int() }).strict()),
    }).strict(),
    shorts: z.object({
      videoCount: z.number().int().nonnegative(),
      durationSeconds: z.object({ p25: z.number().nullable(), median: z.number().nullable(), p75: z.number().nullable() }).strict(),
      titlePatterns: z.array(z.object({ id: z.string(), label: z.string(), count: z.number().int() }).strict()),
    }).strict(),
    recurrentChannels: z.array(z.object({ channelName: z.string(), videos: z.number().int() }).strict()),
    avFormats: z.array(z.object({ id: z.string(), label: z.string(), count: z.number().int() }).strict()),
  }).strict(),

  /**
   * O QUE FOI DERIVADO — opinião nossa, e ela chega marcada como tal.
   */
  recommendedStrategy: z.object({
    destination: z.string().min(1),
    format: z.string().min(1),
    durationSecondsRange: z.object({ min: z.number().int(), max: z.number().int() }).strict().nullable(),
    dimensions: z.array(z.object({
      dimension: z.string().min(1),
      observedSignal: z.string().min(1),
      recommendedStrategy: z.string().min(1),
    }).strict()),
    script: z.array(z.object({ block: z.string().min(1), purpose: z.string().min(1) }).strict()),
    scriptDisclaimer: z.string().min(1),
    gaps: z.array(z.object({ kind: z.string().min(1), statement: z.string().min(1), evidence: z.string().min(1) }).strict()),
  }).strict(),

  limitations: z.array(z.string()),
}).strict();
export type RadarYoutubeEvidence = z.infer<typeof RadarYoutubeEvidenceSchema>;

const padroesResumidos = (padroes: readonly { id: string; label: string; count: number }[]) =>
  padroes.map(item => ({ id: item.id, label: item.label, count: item.count }));

/**
 * A PROJEÇÃO PARA QUEM CONSOME — e ela é MENOR que a fotografia.
 *
 * O congelamento guarda tudo; esta camada entrega o que outro módulo precisa
 * para decidir. Mandar a corrida inteira adiante faria cada consumidor
 * reimplementar a leitura — e cada um a implementaria um pouco diferente.
 */
export function projectRadarYoutubeEvidence(frozen: RadarYoutubeFrozenInvestigation): RadarYoutubeEvidence {
  const { blueprint } = frozen;
  /*
   * ====== A PROVENIÊNCIA VEM DA REFERÊNCIA, OU DA CÓPIA LEGADA — §3 ======
   *
   * Tudo o que esta camada precisa da corrida — identidade, assinatura,
   * provider, instante e contagens — foi congelado em `runRef`. É por isso que
   * a cópia de 126 KB podia sair: ela não estava sendo LIDA, estava sendo
   * carregada.
   *
   * Fotografia legada continua respondendo pela cópia que tem.
   */
  const ref = frozen.runRef;
  const legado = frozen.run;
  const proveniencia = ref
    ? {
      runId: ref.runId,
      runFingerprint: ref.runFingerprint,
      provider: ref.provider,
      endpoint: ref.endpoint,
      collectedAt: ref.collectedAt,
      queriesExecuted: ref.queriesExecuted,
      selectedVideoIds: ref.selectedVideoIds,
    }
    : legado
      ? {
        runId: legado.runId,
        runFingerprint: legado.fingerprint.signature,
        provider: legado.provenance.provider,
        endpoint: legado.provenance.endpoint,
        collectedAt: legado.provenance.collectedAt,
        queriesExecuted: legado.provenance.queriesSucceeded,
        selectedVideoIds: legado.selectedVideoIds,
      }
      : null;

  if (!proveniencia) {
    throw new RadarYoutubeRunRefError(
      "youtube_run_unresolvable",
      "A investigação congelada não tem referência de coleta nem cópia legada.",
      "",
    );
  }

  return RadarYoutubeEvidenceSchema.parse({
    researchMode: "YOUTUBE",
    provenance: {
      runId: proveniencia.runId,
      runFingerprint: proveniencia.runFingerprint,
      provider: proveniencia.provider,
      endpoint: proveniencia.endpoint,
      collectedAt: proveniencia.collectedAt,
      finalizedAt: frozen.finalizedAt,
      queriesExecuted: proveniencia.queriesExecuted,
    },
    observedEvidence: {
      universeSize: blueprint.observed.universeSize,
      comparableSize: blueprint.observed.comparableSize,
      selectedVideoIds: proveniencia.selectedVideoIds,
      longForm: {
        videoCount: blueprint.observed.longForm.videoCount,
        durationSeconds: {
          p25: blueprint.observed.longForm.durationSeconds.p25,
          median: blueprint.observed.longForm.durationSeconds.median,
          p75: blueprint.observed.longForm.durationSeconds.p75,
        },
        titlePatterns: padroesResumidos(blueprint.observed.longForm.titlePatterns),
      },
      shorts: {
        videoCount: blueprint.observed.shorts.videoCount,
        durationSeconds: {
          p25: blueprint.observed.shorts.durationSeconds.p25,
          median: blueprint.observed.shorts.durationSeconds.median,
          p75: blueprint.observed.shorts.durationSeconds.p75,
        },
        titlePatterns: padroesResumidos(blueprint.observed.shorts.titlePatterns),
      },
      recurrentChannels: blueprint.observed.recurrentChannels.map(canal => ({ channelName: canal.channelName, videos: canal.videos })),
      avFormats: blueprint.observed.avFormats.map(formato => ({ id: formato.id, label: formato.label, count: formato.count })),
    },
    recommendedStrategy: {
      destination: blueprint.recommended.destination,
      format: blueprint.recommended.format,
      durationSecondsRange: blueprint.recommended.durationSecondsRange,
      dimensions: blueprint.recommended.strategy,
      script: blueprint.recommended.script.map(bloco => ({ block: bloco.block, purpose: bloco.purpose })),
      scriptDisclaimer: blueprint.recommended.scriptDisclaimer,
      gaps: blueprint.recommended.gaps,
    },
    limitations: frozen.limitations,
  });
}
