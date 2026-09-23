import { contentHash } from "../arquiteto/versioning.ts";
import { VersionedRadarAnalysisSchema, type RadarAnalysisVersion } from "../radar/analysis-contracts.ts";
import { evaluateRadarFrozenSerpLenses, evaluateRadarFrozenSerpStanding, type RadarStandingSnapshotRecord } from "../radar/frozen-serp-standing.ts";
import { radarGoogleResearchIsFinalized } from "../radar/google-research-write-lock.ts";
import { radarStampFrozenSerpLenses, radarStampFrozenSerpStanding } from "../radar/investigation-finalization.ts";
import type { SerpReviewRecord } from "../editorial/contracts.ts";
import { SerpSnapshotRepository } from "./editorial-repositories.ts";

/**
 * ===== O STANDING DA SERP ENTRA NA FOTOGRAFIA NA ESCRITA DO FINALIZE — R1 =====
 *
 * O bundle nasce no navegador, a partir do que o ANALYZE produziu. O que o
 * navegador não tem — e não deveria declarar — é o estado GRAVADO da SERP que
 * sustenta a investigação: se o snapshot é real, se é o mesmo que a análise
 * leu, se a revisão o rejeitou. Isso é lido aqui, no servidor, na mesma
 * escrita que congela, e vira cópia dentro do bundle.
 *
 * SÓ NA TRANSIÇÃO. Uma escrita que chega congelada sobre uma corrente já
 * congelada não é congelamento: é aprovar, anotar ou registrar envio, e a
 * trava garante que a fotografia chega igual. Carimbar de novo ali seria
 * recalcular na leitura com outro nome.
 *
 * Nenhum provider é chamado. A leitura é de duas tabelas do próprio artigo,
 * uma vez por congelamento.
 */

export type RadarSerpStandingSource = {
  list(marcaId: string, articleId?: string): Promise<{ records: readonly RadarStandingSnapshotRecord[]; available: boolean }>;
  listReviews(marcaId: string, articleId?: string): Promise<{ reviews: readonly SerpReviewRecord[]; available: boolean }>;
};

export type RadarFreezeStandingOutcome =
  | { ok: true; analysis: RadarAnalysisVersion; stamped: boolean }
  | { ok: false; status: number; code: string; message: string };

export const RADAR_FROZEN_BUNDLE_MUTATED = "RADAR_FROZEN_BUNDLE_MUTATED" as const;
export const RADAR_SERP_STANDING_UNAVAILABLE = "RADAR_SERP_STANDING_UNAVAILABLE" as const;
export const RADAR_FREEZE_SERP_LINK_CHANGED = "RADAR_FREEZE_SERP_LINK_CHANGED" as const;

type VinculoDaSerp = { serpSnapshotId: string | null; serpSnapshotHash: string | null };

/** O vínculo com a SERP que a versão GRAVADA declara; null quando não há versão gravada. */
function vinculoGravado(payload: unknown): VinculoDaSerp | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const registro = payload as Record<string, unknown>;
  return {
    serpSnapshotId: typeof registro.serpSnapshotId === "string" ? registro.serpSnapshotId : null,
    serpSnapshotHash: typeof registro.serpSnapshotHash === "string" ? registro.serpSnapshotHash : null,
  };
}

export async function stampRadarSerpStandingAtFreeze(input: {
  brandId: string;
  articleId: string;
  /** O payload da versão CORRENTE gravada, nunca o do pedido. */
  current: unknown;
  next: RadarAnalysisVersion;
  source?: RadarSerpStandingSource;
}): Promise<RadarFreezeStandingOutcome> {
  const bundle = input.next.payload.finalizedBundle;
  if (!bundle || !radarGoogleResearchIsFinalized(input.next.payload)) return { ok: true, analysis: input.next, stamped: false };
  if (radarGoogleResearchIsFinalized(input.current)) return { ok: true, analysis: input.next, stamped: false };

  /*
   * O STANDING É DO VÍNCULO GRAVADO, NÃO DO PEDIDO.
   *
   * Na transição a trava está aberta, então a mesma escrita que congela
   * poderia trocar `serpSnapshotId` ou `serpSnapshotHash` e fazer o standing
   * ser avaliado sobre outro snapshot, não rejeitado, que a amostra congelada
   * não leu. O bundle não carrega a identidade do snapshot; quem a prova é a
   * versão corrente. O fluxo normal (createRadarAnalysisSuccessor) preserva o
   * vínculo; um congelamento que o troque é recusado, e a SERP nova precisa
   * ser gravada numa versão aberta antes de finalizar.
   */
  const pedido: VinculoDaSerp = { serpSnapshotId: input.next.payload.serpSnapshotId, serpSnapshotHash: input.next.payload.serpSnapshotHash };
  const gravado = vinculoGravado(input.current);
  if (gravado && (gravado.serpSnapshotId !== pedido.serpSnapshotId || gravado.serpSnapshotHash !== pedido.serpSnapshotHash)) {
    return { ok: false, status: 409, code: RADAR_FREEZE_SERP_LINK_CHANGED, message: "A finalização troca a SERP vinculada à análise gravada. Grave a análise com a SERP nova antes de finalizar. Nada foi gravado." };
  }
  const vinculo = gravado || pedido;

  const fonte: RadarSerpStandingSource = input.source || new SerpSnapshotRepository();
  const [historico, revisoes] = await Promise.all([
    fonte.list(input.brandId, input.articleId),
    fonte.listReviews(input.brandId, input.articleId),
  ]);
  /*
   * SEM A LEITURA, NÃO SE CONGELA.
   *
   * Carimbar "não validada" por uma queda momentânea do banco congelaria para
   * sempre uma conclusão que não foi avaliada. A pessoa tenta de novo; nada
   * foi gravado.
   */
  if (!historico.available || !revisoes.available) {
    return { ok: false, status: 503, code: RADAR_SERP_STANDING_UNAVAILABLE, message: "Não foi possível ler a SERP gravada deste artigo para congelar a investigação. Nada foi gravado; tente finalizar de novo." };
  }

  const standing = evaluateRadarFrozenSerpStanding({
    bundle,
    analysis: vinculo,
    snapshots: historico.records,
    reviews: revisoes.reviews,
  });

  /*
   * R3 · AS LENTES ENTRAM NA MESMA ESCRITA, DA MESMA LEITURA.
   *
   * O snapshot que a análise leu já está em mãos; as quatro lentes dele (e as
   * das auxiliares da rodada, gravadas na evidência) viram cópia no bundle.
   * Nenhum cache é lido: o que o cache tiver depois não muda o congelado.
   */
  const lentes = evaluateRadarFrozenSerpLenses({
    analysis: vinculo,
    snapshots: historico.records,
    deepResearch: input.next.payload.deepResearch,
    /*
     * As auxiliares não têm snapshot: a evidência do pedido só vira cópia
     * quando confere com a gravada, e a cópia sai da gravada.
     */
    storedDeepResearch: input.current && typeof input.current === "object" && !Array.isArray(input.current)
      ? (input.current as { deepResearch?: unknown }).deepResearch ?? null
      : null,
  });

  let carimbado;
  try {
    carimbado = radarStampFrozenSerpLenses(radarStampFrozenSerpStanding(bundle, standing), lentes);
  } catch (erro) {
    if (erro instanceof Error && erro.message === RADAR_FROZEN_BUNDLE_MUTATED) {
      return { ok: false, status: 409, code: RADAR_FROZEN_BUNDLE_MUTATED, message: "A fotografia enviada não confere com o próprio hash. Nada foi gravado." };
    }
    throw erro;
  }

  /*
   * A VERSÃO NOVA CONTINUA COERENTE COM O PRÓPRIO CONTEÚDO.
   *
   * O envelope carrega o hash do payload. A versão ainda não existe no banco —
   * ela nasce nesta escrita —, então recalculá-lo não reescreve nada gravado.
   */
  const payload = { ...input.next.payload, finalizedBundle: carimbado };
  const analysis = VersionedRadarAnalysisSchema.parse({ ...input.next, payload, contentHash: await contentHash(payload) });
  return { ok: true, analysis, stamped: true };
}
