/**
 * ===== O PACOTE DE PESQUISA, PERSISTIDO — AMAZON_SEARCH_1.1 · §6 e §7 =====
 *
 * ================ PRODUTO NÃO É POSIÇÃO — E A CONTA MUDA ================
 *
 * A amostra real de `protetor solar facial` provou a diferença com números:
 *
 *   55 itens de página     o que o provider devolveu
 *   51 produtos            ASINs distintos
 *    2 posições pagas      dois slots de anúncio
 *    1 produto patrocinado os dois slots são o MESMO ASIN
 *    1 produto em ambos    e esse ASIN também ranqueia organicamente
 *
 * "2 produtos patrocinados" seria falso sobre esta busca. Descreveria espaços
 * comprados, não concorrentes — e um artigo escrito a partir disso diria que a
 * categoria tem o dobro de anunciantes que tem.
 *
 * As duas contagens ficam, com nomes diferentes: quem decide precisa saber
 * quantos PRODUTOS disputam e quantas POSIÇÕES foram compradas.
 *
 * ==================== REFERÊNCIA, NUNCA CÓPIA ====================
 *
 * O pacote guarda `runId` e contagens. O universo competitivo tem autoridade
 * própria na corrida — copiá-lo aqui repetiria o erro que o freeze do YouTube
 * cometeu e que custou 88% do tamanho da fotografia.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import { RADAR_RESEARCH_PROFILES, RADAR_RESEARCH_SOURCE_ROLES } from "./research-profile.ts";
import { RADAR_RESEARCH_SOURCES } from "./search-mode.ts";
import { radarAmazonUniverseCounts, type RadarAmazonUniverseEntry } from "./amazon-search-model.ts";

export const RADAR_PACKAGE_STATUSES = ["COLLECTING", "READY", "PARTIAL_SUPPORT_FAILED", "FAILED"] as const;
export const RadarPackageStatusSchema = z.enum(RADAR_PACKAGE_STATUSES);
export type RadarPackageStatus = typeof RADAR_PACKAGE_STATUSES[number];

export const RADAR_RESEARCH_STATUSES = ["PENDING", "COLLECTED", "FAILED", "SKIPPED"] as const;
export const RadarResearchStatusSchema = z.enum(RADAR_RESEARCH_STATUSES);

/**
 * AS CONTAGENS DA COLETA PRIMÁRIA — e cada nome diz o que conta.
 *
 * `uniqueProductCount` é a medida que a tela usa; `sponsoredPlacementCount` é
 * a que descreve pressão comercial. Guardar só uma delas obrigaria a inventar
 * a outra depois.
 */
export const RadarPrimaryResearchSchema = z.object({
  source: z.enum(RADAR_RESEARCH_SOURCES),
  status: RadarResearchStatusSchema,
  runId: z.string().min(1).nullable().default(null),
  queryCount: z.number().int().nonnegative().default(0),
  uniqueProductCount: z.number().int().nonnegative().default(0),
  organicProductCount: z.number().int().nonnegative().default(0),
  sponsoredProductCount: z.number().int().nonnegative().default(0),
  /** POSIÇÕES compradas — dois slots do mesmo ASIN contam dois. */
  sponsoredPlacementCount: z.number().int().nonnegative().default(0),
  bothOrganicAndSponsoredCount: z.number().int().nonnegative().default(0),
  relatedSearchSignalCount: z.number().int().nonnegative().default(0),
  failureReason: z.string().max(500).nullable().default(null),
}).strict();
export type RadarPrimaryResearch = z.infer<typeof RadarPrimaryResearchSchema>;

export const RadarSupportResearchSummarySchema = z.object({
  source: z.enum(RADAR_RESEARCH_SOURCES),
  role: z.enum(RADAR_RESEARCH_SOURCE_ROLES),
  status: RadarResearchStatusSchema,
  snapshotId: z.string().min(1).nullable().default(null),
  keyword: z.string().min(1).nullable().default(null),
  collectedAt: z.string().min(1).nullable().default(null),
  failureReason: z.string().max(500).nullable().default(null),
}).strict();
export type RadarSupportResearchSummary = z.infer<typeof RadarSupportResearchSummarySchema>;

export const RadarResearchPackageRecordSchema = z.object({
  profile: z.enum(RADAR_RESEARCH_PROFILES),
  /** Amarra as duas coletas ao MESMO clique. É o que faz delas um pacote. */
  packageRunId: z.string().min(1),
  status: RadarPackageStatusSchema,
  startedAt: z.string().min(1),
  completedAt: z.string().min(1).nullable().default(null),
  primaryResearch: RadarPrimaryResearchSchema,
  /** `null` no perfil Google: ele é a pesquisa, não tem apoio. */
  supportResearch: RadarSupportResearchSummarySchema.nullable().default(null),
}).strict();
export type RadarResearchPackageRecord = z.infer<typeof RadarResearchPackageRecordSchema>;

/**
 * ============ §5 · O STATUS SAI DA ORDEM DOS DESFECHOS ============
 *
 * A primária falhar é falha do pacote, e o apoio nem chega a ser tentado —
 * gastar a leitura do Google sobre uma investigação que não existe seria pagar
 * por contexto de nada.
 *
 * O apoio falhar NÃO derruba a primária, que já foi paga. `PARTIAL_SUPPORT_FAILED`
 * existe para que o pacote não tenha de escolher entre mentir "pronto" e jogar
 * fora uma coleta boa.
 */
export function radarPackageStatus(input: {
  primaryStatus: RadarPrimaryResearch["status"];
  supportPlanned: boolean;
  supportStatus: RadarSupportResearchSummary["status"] | null;
}): RadarPackageStatus {
  if (input.primaryStatus === "FAILED") return "FAILED";
  if (input.primaryStatus !== "COLLECTED") return "COLLECTING";
  if (!input.supportPlanned) return "READY";
  if (input.supportStatus === "COLLECTED") return "READY";
  if (input.supportStatus === "FAILED") return "PARTIAL_SUPPORT_FAILED";
  /*
   * `SKIPPED` é decisão declarada — sem keyword principal não há apoio a fazer,
   * e ficar em COLLECTING para sempre esperaria algo que ninguém vai executar.
   */
  if (input.supportStatus === "SKIPPED") return "PARTIAL_SUPPORT_FAILED";
  return "COLLECTING";
}

/** As contagens da Amazon, a partir do universo já deduplicado por ASIN. */
export function radarAmazonPrimaryCounts(input: {
  universe: readonly RadarAmazonUniverseEntry[];
  queryCount: number;
  relatedSearchCount: number;
}) {
  const contagem = radarAmazonUniverseCounts(input.universe);
  return {
    queryCount: input.queryCount,
    uniqueProductCount: contagem.total,
    organicProductCount: contagem.organic,
    sponsoredProductCount: contagem.sponsored,
    /*
     * A SOMA DAS OCORRÊNCIAS PAGAS, não a contagem de produtos pagos. Dois
     * slots do mesmo ASIN somam dois aqui e um ali — é a diferença entre
     * "quantos anunciam" e "quanto espaço foi comprado".
     */
    sponsoredPlacementCount: input.universe.reduce(
      (total, item) => total + item.occurrences.filter(ocorrencia => ocorrencia.placement === "SPONSORED").length,
      0,
    ),
    bothOrganicAndSponsoredCount: contagem.both,
    relatedSearchSignalCount: input.relatedSearchCount,
  };
}

/**
 * A FRASE DO PACOTE — uma só, e ela distingue produto de posição.
 *
 * §20 pede uma notificação útil no fim, não três. O que a pessoa precisa saber
 * é quantos produtos disputam e se o apoio veio.
 */
export function radarPackageHeadline(pacote: RadarResearchPackageRecord): string {
  const primaria = pacote.primaryResearch;

  if (pacote.status === "FAILED") {
    return `A pesquisa ${rotulo(pacote.profile)} falhou. ${primaria.failureReason || ""}`.trim();
  }
  if (pacote.status === "COLLECTING") return `Pesquisa ${rotulo(pacote.profile)} em andamento…`;

  const partes = [`${primaria.uniqueProductCount} produto(s) comparável(is)`];
  if (primaria.sponsoredProductCount > 0) {
    partes.push(
      primaria.sponsoredPlacementCount > primaria.sponsoredProductCount
        ? `${primaria.sponsoredProductCount} patrocinado(s) em ${primaria.sponsoredPlacementCount} posições`
        : `${primaria.sponsoredProductCount} patrocinado(s)`,
    );
  }

  if (pacote.status === "PARTIAL_SUPPORT_FAILED") {
    return `Pesquisa ${rotulo(pacote.profile)} concluída: ${partes.join(" · ")}. O apoio do Google precisa ser repetido.`;
  }
  return `Pesquisa ${rotulo(pacote.profile)} concluída: ${partes.join(" · ")} · apoio Google coletado.`;
}

const rotulo = (profile: RadarResearchPackageRecord["profile"]) =>
  ({ GOOGLE: "Google", YOUTUBE: "YouTube", AMAZON: "Amazon" }[profile]);

/**
 * ============ §3 · A PENDÊNCIA RECUPERÁVEL ============
 *
 * Se o navegador fechou depois da primária, o pacote fica com a coleta boa e o
 * apoio ausente. Reabrir o artigo tem de OFERECER a retomada — e a retomada
 * alcança SÓ o apoio.
 *
 * Refazer a primária para corrigir o apoio cobraria de novo a coleta cara para
 * arrumar a barata.
 */
export function radarPackageNeedsSupportRetry(pacote: RadarResearchPackageRecord | null | undefined): boolean {
  if (!pacote) return false;
  if (pacote.primaryResearch.status !== "COLLECTED") return false;
  if (!pacote.supportResearch) return false;
  return pacote.supportResearch.status === "FAILED" || pacote.supportResearch.status === "PENDING";
}
