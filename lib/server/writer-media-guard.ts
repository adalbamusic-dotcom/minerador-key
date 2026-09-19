import "server-only";
import { getOperationalClient } from "./editorial-db";
import { deliverableKindForMedia, type DeliverableKindForMedia } from "../redator/media-anchor.ts";

/**
 * ===== CORTE 6A.7 · MÍDIA DE ENTREGÁVEL FINALIZADO NÃO SE ALTERA =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * Nenhuma mutação de mídia olhava `writer_deliverables.status`. A leitura-somente
 * de um roteiro ou carrossel finalizado era garantida SÓ pelo `fieldset
 * disabled` da tela — e o painel de mídia vive fora dele. Um estado de React
 * preservado, ou uma chamada direta à rota, alterava mídia de um entregável
 * `approved` sem nenhuma recusa.
 *
 * ==================== COMO SE SABE DE QUEM É A ÂNCORA ====================
 *
 * `writer_media_assets.deliverable_id` está NULL em todos os ativos, e esta
 * rodada não o preenche. Não é preciso: a identidade já existe no banco.
 *
 *   UNIQUE (document_id, kind)  em writer_deliverables
 *   CHECK  kind IN ('video_script', 'carousel')
 *
 * E o mapa de âncora para tipo é total e fixo: `script_scene` só pode ser de um
 * roteiro, `carousel_slide` só pode ser de um carrossel. Então
 * `(document_id, kind)` resolve exatamente UM entregável — garantido por índice
 * único, não por heurística. Conferido em 2026-09-19: os 5 ativos ancorados
 * resolveram todos, sem ambiguidade.
 *
 * `article_cover` e `article_block` NÃO resolvem entregável nenhum, e é correto:
 * o artigo tem lifecycle próprio, e esta rodada não o toca.
 *
 * ==================== POR QUE DEVOLVE EM VEZ DE LANÇAR ====================
 *
 * Os chamadores traduzem de jeitos diferentes: `writer-deliverables.ts` lança
 * `WriterDeliverableError`, e `writer-media-lifecycle.ts` devolve desfecho. Se
 * esta função lançasse um erro definido em qualquer um dos dois, os módulos
 * passariam a se importar em círculo. Devolver o veredito mantém a decisão em um
 * lugar só e a tradução em cada fronteira.
 */

export type MediaTargetGate =
  | { editable: true }
  /** Não há entregável envolvido: âncora de artigo, ou nada a resolver. */
  | { editable: true; scope: "not_a_deliverable" }
  | { editable: false; refusal: "writer_deliverable_finalized"; deliverableKind: DeliverableKindForMedia };

/**
 * Resolve o entregável dono da mídia e diz se ele aceita mutação.
 *
 * `role` vem do briefing (o painel o envia na criação); `anchorKind` vem da
 * âncora já atribuída. Qualquer um dos dois resolve — e é por isso que a guarda
 * funciona tanto antes de existir âncora quanto depois.
 */
export async function checkMediaTargetEditable(input: {
  brandId: string;
  documentId: string;
  role?: string | null;
  anchorKind?: string | null;
}): Promise<MediaTargetGate> {
  const kind = deliverableKindForMedia({ role: input.role, anchorKind: input.anchorKind });
  if (!kind) return { editable: true, scope: "not_a_deliverable" };

  const { data, error } = await getOperationalClient().from("writer_deliverables")
    .select("status").eq("marca_id", input.brandId).eq("document_id", input.documentId)
    .eq("kind", kind).maybeSingle();

  /*
   * Sem entregável, não há o que proteger — a mídia nasce antes dele existir, e
   * recusar aqui impediria o primeiro briefing. Erro de leitura também não
   * recusa: falhar a mutação por causa de uma consulta auxiliar trocaria um
   * risco por outro, e a mutação seguinte tem suas próprias guardas.
   */
  if (error || !data) return { editable: true, scope: "not_a_deliverable" };
  if ((data.status as string) !== "approved") return { editable: true };
  return { editable: false, refusal: "writer_deliverable_finalized", deliverableKind: kind };
}

/** O mesmo veredito partindo de um ativo já gravado. */
export async function checkAssetTargetEditable(input: {
  brandId: string;
  assetId: string;
  /** Quando a ação já declara a âncora (ex.: ancorar numa posição nova). */
  anchorKind?: string | null;
}): Promise<MediaTargetGate> {
  const { data, error } = await getOperationalClient().from("writer_media_assets")
    .select("document_id,role,anchor_kind").eq("marca_id", input.brandId)
    .eq("id", input.assetId).maybeSingle();
  if (error || !data) return { editable: true, scope: "not_a_deliverable" };

  return checkMediaTargetEditable({
    brandId: input.brandId,
    documentId: data.document_id as string,
    role: data.role as string | null,
    anchorKind: input.anchorKind ?? (data.anchor_kind as string | null),
  });
}

export const MENSAGEM_ENTREGAVEL_FINALIZADO =
  "Este entregável está finalizado. Reabra para edição antes de alterar a mídia.";
