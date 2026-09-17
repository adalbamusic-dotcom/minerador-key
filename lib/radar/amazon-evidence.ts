/**
 * ===== A FOTOGRAFIA DA INVESTIGAÇÃO AMAZON — AMAZON_SEARCH_2 · §25 e §26 =====
 *
 * ============ FOTOGRAFIA DAS CONCLUSÕES ≠ CÓPIA DA MATÉRIA-PRIMA ============
 *
 * A auditoria do banco já mediu o preço de confundir as duas: numa fotografia
 * de YouTube, 126.656 dos 144.440 bytes eram a corrida copiada byte a byte,
 * idêntica à que já estava na mesma versão da análise. 88% de repetição.
 *
 * Aqui a Amazon nasce corrigida. O freeze guarda REFERÊNCIA à corrida, o
 * resumo observado, o blueprint e as limitações — nunca o universo, nunca os
 * resultados, nunca o payload cru, nunca o snapshot do Google.
 *
 * ================= REFERÊNCIA QUEBRADA É ERRO, NÃO RECONSTRUÇÃO =================
 *
 * Se a corrida referida não estiver na versão corrente, a leitura FALHA com
 * código. Reconstruir a partir do que sobrou produziria uma fotografia que
 * descreve outra amostra sob um carimbo que diz "congelado".
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import {
  RadarCompetitiveBlueprintSchema,
  RadarAmazonEditorialOutputSchema,
  type RadarAmazonBlueprint,
} from "./competitive-blueprint.ts";
import { radarAmazonUniverseCounts } from "./amazon-search-model.ts";
import type { RadarAmazonSearchRun } from "./amazon-search-run.ts";
import { radarAmazonSetupSignature, type RadarAmazonEditorialIntent, type RadarAmazonResearchTarget } from "./amazon-editorial-target.ts";

/**
 * O RESUMO OBSERVADO, CONGELADO — oito números, não a amostra.
 *
 * A tela mostra "51 produtos · 1 patrocinado" o tempo todo; reabrir a corrida
 * para responder isso seria carregar 51 produtos por causa de dois números.
 */
export const RadarAmazonObservedSummarySchema = z.object({
  products: z.number().int().nonnegative(),
  organic: z.number().int().nonnegative(),
  sponsored: z.number().int().nonnegative(),
  /** POSIÇÕES pagas — dois slots do mesmo ASIN contam dois. */
  sponsoredPlacements: z.number().int().nonnegative(),
  both: z.number().int().nonnegative(),
  withPrice: z.number().int().nonnegative(),
  withRating: z.number().int().nonnegative(),
  relatedSearches: z.number().int().nonnegative(),
}).strict();
export type RadarAmazonObservedSummary = z.infer<typeof RadarAmazonObservedSummarySchema>;

export const RadarAmazonSupportRefSchema = z.object({
  source: z.literal("WEB_SERP"),
  role: z.literal("SEO_COMMERCIAL_SUPPORT"),
  snapshotId: z.string().min(1),
  keyword: z.string().min(1).nullable().default(null),
  collectedAt: z.string().min(1).nullable().default(null),
}).strict();

export const RadarAmazonFrozenInvestigationSchema = z.object({
  frozenVersion: z.literal(1),
  finalizedAt: z.string().min(1),
  finalizedBy: z.string().min(1),

  /**
   * ===== 1.2 · §6 e §7 · A INTENÇÃO ORIGINAL, CONGELADA COM A FOTOGRAFIA =====
   *
   * A configuração já é gravada no `amazonEditorialSetup` da análise — e uma
   * análise é sucedida por outra. A fotografia não: ela é o que "finalizado"
   * significa, e quem a lê depois precisa saber QUE ARTIGO ela foi tirada para
   * sustentar.
   *
   * Sem isto, um `TOP_BEST` finalizado poderia ser lido meses depois como
   * comparativo — e a leitura pareceria correta, porque a evidência de
   * prateleira serve às duas formas.
   *
   * Aditivo com `.default(null)`: fotografia tirada antes deste gate continua
   * legível, e a ausência é a verdade sobre ela — não uma intenção inventada.
   */
  originalEditorialIntent: z.object({
    type: z.string().min(1),
    desiredCount: z.number().int().positive().nullable().default(null),
    useCase: z.string().min(1).nullable().default(null),
    rankingCriteria: z.string().min(1).nullable().default(null),
    productClass: z.string().min(1).nullable().default(null),
    brandFilter: z.string().min(1).nullable().default(null),
    /** §19 · a assinatura da configuração material que originou a coleta. */
    setupSignature: z.string().min(1),
  }).strict().nullable().default(null),

  /** §26 · a referência. A corrida continua com autoridade própria. */
  runRef: z.object({
    runId: z.string().min(1),
    runVersion: z.number().int().positive(),
    /** A assinatura do fingerprint — é ela que prova que a corrida é a mesma. */
    runFingerprint: z.string().min(1),
    collectedAt: z.string().min(1),
    provider: z.string().min(1),
    endpoint: z.string().min(1),
    /** §13 · a grafia de locale REALMENTE enviada ao provider. */
    languageCode: z.string().min(1).nullable().default(null),
    queriesExecuted: z.number().int().nonnegative(),
    universeSize: z.number().int().nonnegative(),
  }).strict(),

  /**
   * §25 · O APOIO ENTRA POR REFERÊNCIA — o snapshot do Google fica onde está.
   *
   * Copiá-lo aqui repetiria, com outra fonte, o erro que este contrato nasceu
   * corrigindo: o snapshot tem identidade, versão e armazenamento próprios.
   */
  supportRefs: z.array(RadarAmazonSupportRefSchema).default([]),

  observedSummary: RadarAmazonObservedSummarySchema,
  /** O blueprint congelado — as CONCLUSÕES, que é o que a imutabilidade exige. */
  competitiveBlueprint: RadarCompetitiveBlueprintSchema,
  /** §11 · a saída editorial escolhida, quando a análise sustentou uma. */
  editorialOutput: RadarAmazonEditorialOutputSchema.nullable().default(null),
  /** §21 · as limitações vigentes no instante do congelamento. */
  limitations: z.array(z.string().min(1)).default([]),
}).strict();
export type RadarAmazonFrozenInvestigation = z.infer<typeof RadarAmazonFrozenInvestigationSchema>;

export class RadarAmazonFinalizeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RadarAmazonFinalizeError";
    this.code = code;
  }
}

/**
 * FINALIZE É DECISÃO HUMANA, e ele recusa o que não dá para congelar.
 *
 * Congelar uma coleta em curso, ou uma que falhou, produziria uma fotografia
 * de nada — e ela chegaria ao Planejador com o mesmo peso de uma investigação
 * real.
 */
export function freezeRadarAmazonInvestigation(input: {
  run: RadarAmazonSearchRun;
  blueprint: RadarAmazonBlueprint;
  supportRefs?: readonly z.input<typeof RadarAmazonSupportRefSchema>[];
  finalizedBy: string;
  finalizedAt: string;
  /** §6 · a configuração que originou a coleta, congelada com ela. */
  setup?: { intent: RadarAmazonEditorialIntent; target: RadarAmazonResearchTarget } | null;
}): RadarAmazonFrozenInvestigation {
  if (input.run.state !== "COLLECTED") {
    throw new RadarAmazonFinalizeError(
      "amazon_run_not_collected",
      "A coleta da Amazon não está concluída: não há investigação para congelar.",
    );
  }
  if (!input.run.universe.length) {
    throw new RadarAmazonFinalizeError(
      "amazon_universe_empty",
      "A coleta não devolveu produtos: congelar produziria uma fotografia de nada.",
    );
  }
  if (input.blueprint.profile !== "AMAZON") {
    throw new RadarAmazonFinalizeError(
      "amazon_blueprint_profile",
      "O blueprint entregue ao congelamento não é do perfil Amazon.",
    );
  }
  /*
   * A FOTOGRAFIA E A CORRIDA PRECISAM SER DA MESMA INVESTIGAÇÃO.
   *
   * Um blueprint de outro artigo congelado sobre esta corrida amarraria
   * conclusões a uma amostra que não as produziu.
   */
  if (input.blueprint.articleId !== input.run.fingerprint.articleId) {
    throw new RadarAmazonFinalizeError(
      "amazon_blueprint_article_mismatch",
      "O blueprint e a coleta descrevem artigos diferentes.",
    );
  }

  const contagem = radarAmazonUniverseCounts(input.run.universe);

  return RadarAmazonFrozenInvestigationSchema.parse({
    frozenVersion: 1,
    finalizedAt: input.finalizedAt,
    finalizedBy: input.finalizedBy,
    /* §6 · o artigo que esta fotografia foi tirada para sustentar. */
    originalEditorialIntent: input.setup
      ? {
        type: input.setup.intent.type,
        desiredCount: input.setup.intent.desiredCount,
        useCase: input.setup.intent.useCase,
        rankingCriteria: input.setup.intent.rankingCriteria,
        productClass: input.setup.target.productClass,
        brandFilter: input.setup.target.brandFilter,
        setupSignature: radarAmazonSetupSignature(input.setup),
      }
      : null,
    runRef: {
      runId: input.run.runId,
      runVersion: input.run.runVersion,
      runFingerprint: input.run.fingerprint.signature,
      collectedAt: input.run.provenance.collectedAt,
      provider: input.run.provenance.provider,
      endpoint: input.run.provenance.endpoint,
      languageCode: input.run.provenance.languageCode,
      queriesExecuted: input.run.queries.filter(item => item.executed).length,
      universeSize: input.run.universe.length,
    },
    supportRefs: input.supportRefs ? [...input.supportRefs] : [],
    observedSummary: {
      products: contagem.total,
      organic: contagem.organic,
      sponsored: contagem.sponsored,
      sponsoredPlacements: input.run.universe.reduce(
        (total, item) => total + item.occurrences.filter(ocorrencia => ocorrencia.placement === "SPONSORED").length,
        0,
      ),
      both: contagem.both,
      withPrice: contagem.withPrice,
      withRating: contagem.withRating,
      relatedSearches: input.run.relatedSearches.length,
    },
    competitiveBlueprint: {
      ...input.blueprint,
      /* A fotografia declara a própria data: `frozenAt` deixa de ser nulo. */
      provenance: { ...input.blueprint.provenance, frozenAt: input.finalizedAt },
    },
    editorialOutput: input.blueprint.recommended.recommendedOutputs[0]?.output ?? null,
    limitations: input.blueprint.limitations,
  });
}

export class RadarAmazonRunRefError extends Error {
  readonly code: string;
  readonly runId: string;
  constructor(code: string, message: string, runId: string) {
    super(message);
    this.name = "RadarAmazonRunRefError";
    this.code = code;
    this.runId = runId;
  }
}

/**
 * RESOLVE A CORRIDA REFERIDA — conferindo identidade, nunca presumindo.
 *
 * `runId` igual com assinatura diferente significa que a corrida foi refeita
 * sob o mesmo nome; a fotografia passaria a descrever uma amostra que não é a
 * dela. Falhar aqui é a resposta correta.
 */
export function resolveRadarAmazonFrozenRun(input: {
  frozen: RadarAmazonFrozenInvestigation;
  /** A corrida viva da MESMA versão da análise. */
  liveRun: RadarAmazonSearchRun | null | undefined;
}): RadarAmazonSearchRun {
  const referencia = input.frozen.runRef;
  const viva = input.liveRun;

  if (!viva) {
    throw new RadarAmazonRunRefError(
      "amazon_run_ref_missing",
      "A investigação congelada aponta para uma coleta que não está nesta versão da análise.",
      referencia.runId,
    );
  }
  if (viva.runId !== referencia.runId) {
    throw new RadarAmazonRunRefError(
      "amazon_run_ref_mismatch",
      "A coleta gravada não é a que foi congelada nesta investigação.",
      referencia.runId,
    );
  }
  if (viva.fingerprint.signature !== referencia.runFingerprint) {
    throw new RadarAmazonRunRefError(
      "amazon_run_ref_fingerprint",
      "A coleta mudou desde o congelamento: a assinatura não confere com a da fotografia.",
      referencia.runId,
    );
  }
  return viva;
}

/** As contagens da fotografia, sem precisar da corrida. */
export function radarAmazonFrozenCounts(frozen: RadarAmazonFrozenInvestigation) {
  return {
    queriesExecuted: frozen.runRef.queriesExecuted,
    universeSize: frozen.runRef.universeSize,
    collectedAt: frozen.runRef.collectedAt,
  };
}
