/**
 * ===== O STANDING DA SERP NO INSTANTE DO CONGELAMENTO — SDD do Radar, R1 =====
 *
 * "A SERP tem precedência sobre o terreno competitivo desta investigação?"
 *
 * A pergunta é respondida UMA vez, quando a investigação é congelada, e a
 * resposta vira cópia dentro do bundle. Esta função é a regra; quem a chama é
 * a escrita do FINALIZE, no servidor, com o que está gravado naquele instante.
 * Nenhuma leitura posterior a chama de novo: tempo, snapshot novo e revisão
 * posterior não mudam o que foi entregue.
 *
 * AS TRÊS PERGUNTAS, SEM REGRA NOVA — a conclusão continua sendo a de
 * `radarSerpEvidenceStanding`:
 *
 *   current    · verdadeiro por construção. A prontidão já recusa congelar uma
 *                investigação cujo fundamento mudou; um ArticleDNA que muda
 *                DEPOIS é tratado pelo vínculo do dossiê, não pelo standing.
 *   sufficient · o nível de suficiência congelado sustenta leitura de mercado
 *                (D2: SUFFICIENT, PARTIAL_BUT_USABLE e CONFLICTING_SEARCH_INTENT).
 *   valid      · o snapshot canônico é real, é o mesmo que a análise leu, é da
 *                mesma versão do ArticleDNA e a revisão dele não o rejeitou.
 *                `needs_review` é válido (D1): exigir aprovação tiraria a
 *                autoridade de 10 de 10 snapshots remotos — mudança de
 *                significado, não correção.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { canonicalJson } from "../arquiteto/versioning.ts";
import type { SerpReviewRecord } from "../editorial/contracts.ts";
import { radarSerpEvidenceStanding } from "./evidence-authority.ts";
import {
  RadarFrozenSerpStandingSchema,
  type RADAR_SERP_STANDING_INVALID_REASONS,
  type RadarFrozenEvidenceBundle,
  type RadarFrozenSerpStanding,
} from "./investigation-finalization.ts";
import { deriveRadarSerpReviewState } from "./serp-review-state.ts";
import { RadarQueryEvidenceSchema } from "./deep-research.ts";
import { buildRadarFrozenSerpLensBlock, type RadarFrozenSerpLens, type RadarFrozenSerpLensBlock } from "./serp/frozen-lenses.ts";
import { RadarSerpLensSetSchema } from "./serp/lens-set.ts";

export const RADAR_SERP_STANDING_SUFFICIENT_LEVELS: readonly string[] = [
  "SUFFICIENT",
  "PARTIAL_BUT_USABLE",
  "CONFLICTING_SEARCH_INTENT",
];

type MotivoDeInvalidez = typeof RADAR_SERP_STANDING_INVALID_REASONS[number];

/** O mínimo de um registro de snapshot que a regra lê. */
export type RadarStandingSnapshotRecord = {
  id: string;
  origin: string;
  isMock: boolean;
  /** `lensSet` só existe no snapshot coletado nas quatro lentes (R2); é lido para a cópia de R3. */
  research: { id: string; contentHash: string; articleDnaVersionId: string; status: string; lensSet?: unknown } | null;
};

/** O snapshot gravado que a análise nomeia — pelo id do registro ou pelo da pesquisa. */
export function radarFrozenBoundSnapshotRecord<T extends RadarStandingSnapshotRecord>(snapshots: readonly T[], serpSnapshotId: string | null): T | null {
  if (!serpSnapshotId) return null;
  return snapshots.find(item => item.id === serpSnapshotId || item.research?.id === serpSnapshotId) || null;
}

export function evaluateRadarFrozenSerpStanding(input: {
  bundle: Pick<RadarFrozenEvidenceBundle, "binding" | "model">;
  /** A identidade da SERP que a análise congelada leu. */
  analysis: { serpSnapshotId: string | null; serpSnapshotHash: string | null };
  /** Os snapshots gravados do artigo, lidos no instante do congelamento. */
  snapshots: readonly RadarStandingSnapshotRecord[];
  reviews: readonly SerpReviewRecord[];
}): RadarFrozenSerpStanding {
  const pedido = input.analysis.serpSnapshotId;
  const registro = radarFrozenBoundSnapshotRecord(input.snapshots, pedido);

  /*
   * A REVISÃO É A ÚLTIMA DAQUELE SNAPSHOT — pela mesma regra da tela.
   *
   * A revisão pode ter sido gravada com o id do registro ou com o da pesquisa;
   * os dois nomeiam o mesmo snapshot. Reescrever a ordenação aqui criaria a
   * segunda cópia da regra que decide qual revisão vale.
   */
  const idsDoSnapshot = new Set([pedido, registro?.id, registro?.research?.id].filter((item): item is string => Boolean(item)));
  const chave = registro?.id || pedido || "";
  const revisoes = input.reviews
    .filter(item => idsDoSnapshot.has(item.snapshotId))
    .map(item => ({ ...item, snapshotId: chave }));
  const ultima = deriveRadarSerpReviewState({ reviews: revisoes, snapshotId: chave || null, selectedCompetitorIds: [] }).review;
  const reviewStatus = ultima?.status ?? registro?.research?.status ?? null;

  const invalidReasons: MotivoDeInvalidez[] = [];
  if (!pedido) invalidReasons.push("SNAPSHOT_NOT_BOUND");
  else if (!registro) invalidReasons.push("SNAPSHOT_NOT_FOUND");
  else {
    if (registro.origin !== "real" || registro.isMock || !registro.research) invalidReasons.push("SNAPSHOT_NOT_REAL");
    if (registro.research && registro.research.contentHash !== input.analysis.serpSnapshotHash) invalidReasons.push("SNAPSHOT_HASH_MISMATCH");
    if (registro.research && registro.research.articleDnaVersionId !== input.bundle.binding.articleDnaVersionId) invalidReasons.push("ARTICLE_DNA_MISMATCH");
    if (reviewStatus === "rejected") invalidReasons.push("SNAPSHOT_REJECTED");
  }

  const sufficient = RADAR_SERP_STANDING_SUFFICIENT_LEVELS.includes(input.bundle.model.sufficiency);
  const standing = radarSerpEvidenceStanding({ current: true, sufficient, valid: invalidReasons.length === 0 });

  return RadarFrozenSerpStandingSchema.parse({
    ...standing,
    basis: {
      snapshotId: registro?.id ?? pedido ?? null,
      snapshotHash: registro?.research?.contentHash ?? null,
      reviewStatus,
      sufficiencyLevel: input.bundle.model.sufficiency,
      invalidReasons,
    },
  });
}

/**
 * ===== AS LENTES NO INSTANTE DO CONGELAMENTO — SDD do Radar, R3 =====
 *
 * A mesma leitura que o standing faz, uma vez, no FINALIZE. A canônica só é
 * copiada quando o snapshot gravado é o que a análise leu (real e com o mesmo
 * `contentHash`): lentes de outro conteúdo descreveriam uma SERP que a amostra
 * congelada não viu. A revisão não entra aqui — ela decide autoridade, e as
 * lentes são registro do que foi observado.
 *
 * As auxiliares vêm da evidência da investigação, que é onde a cópia delas
 * vive (a auxiliar não tem snapshot). A evidência que a escrita do FINALIZE
 * carrega é declarada pelo navegador; por isso ela só é copiada quando a
 * versão GRAVADA tem a mesma consulta executada, com o mesmo `contentHash` e
 * as mesmas lentes — e a cópia sai da gravada. A que não confere não entra e
 * é contada numa limitação. Consulta auxiliar executada antes das lentes é
 * contada e declarada, não inventada.
 */
function consultasDe(deepResearch: unknown): unknown[] {
  const registro = deepResearch && typeof deepResearch === "object" && !Array.isArray(deepResearch)
    ? (deepResearch as { queries?: unknown }).queries
    : null;
  return Array.isArray(registro) ? registro : [];
}

type AuxiliarLida = { queryId: string; keywordId: string | null; keyword: string | null; snapshotHash: string; lenses: RadarFrozenSerpLens[] | null };

function auxiliarExecutada(bruta: unknown): AuxiliarLida | null {
  const consulta = bruta && typeof bruta === "object" && !Array.isArray(bruta) ? bruta as Record<string, unknown> : null;
  if (!consulta || consulta.serpClass !== "auxiliary" || consulta.execution !== "EXECUTED") return null;
  const evidencia = RadarQueryEvidenceSchema.safeParse(consulta.evidence);
  if (!evidencia.success) return null;
  return {
    queryId: String(consulta.queryId || ""),
    keywordId: typeof consulta.keywordId === "string" ? consulta.keywordId : null,
    keyword: typeof consulta.keyword === "string" ? consulta.keyword : null,
    snapshotHash: evidencia.data.contentHash,
    lenses: evidencia.data.lenses || null,
  };
}

export function evaluateRadarFrozenSerpLenses(input: {
  analysis: { serpSnapshotId: string | null; serpSnapshotHash: string | null };
  snapshots: readonly RadarStandingSnapshotRecord[];
  /** `payload.deepResearch` da versão que congela (declarado pelo pedido). */
  deepResearch: unknown;
  /** `payload.deepResearch` da versão CORRENTE gravada; null quando não há versão gravada. */
  storedDeepResearch: unknown;
}): RadarFrozenSerpLensBlock | null {
  const registro = radarFrozenBoundSnapshotRecord(input.snapshots, input.analysis.serpSnapshotId);
  const pesquisa = registro && registro.origin === "real" && !registro.isMock ? registro.research : null;
  const conjunto = pesquisa && pesquisa.contentHash === input.analysis.serpSnapshotHash
    ? RadarSerpLensSetSchema.safeParse(pesquisa.lensSet)
    : null;
  const canonical = pesquisa && conjunto?.success
    ? { snapshotId: registro!.id, snapshotHash: pesquisa.contentHash, lensSet: conjunto.data }
    : null;

  const gravadas = new Map<string, AuxiliarLida>();
  for (const bruta of consultasDe(input.storedDeepResearch)) {
    const gravada = auxiliarExecutada(bruta);
    if (gravada?.queryId && !gravadas.has(gravada.queryId)) gravadas.set(gravada.queryId, gravada);
  }

  const auxiliary: Array<{ queryId: string; keywordId: string | null; keyword: string | null; snapshotHash: string; lenses: RadarFrozenSerpLens[] }> = [];
  let singleLensAuxiliary = 0;
  let unverifiedAuxiliary = 0;
  for (const bruta of consultasDe(input.deepResearch)) {
    const declarada = auxiliarExecutada(bruta);
    if (!declarada) continue;
    if (!declarada.lenses) { singleLensAuxiliary += 1; continue; }
    const gravada = gravadas.get(declarada.queryId);
    if (!gravada?.lenses || gravada.snapshotHash !== declarada.snapshotHash
      || canonicalJson(gravada.lenses) !== canonicalJson(declarada.lenses)) {
      unverifiedAuxiliary += 1;
      continue;
    }
    auxiliary.push({ ...gravada, lenses: gravada.lenses });
  }

  return buildRadarFrozenSerpLensBlock({ canonical, auxiliary, singleLensAuxiliary, unverifiedAuxiliary });
}
