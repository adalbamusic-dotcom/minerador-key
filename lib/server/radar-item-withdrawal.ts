import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { RADAR_WITHDRAWN_STATE } from "@/lib/editorial/operational-flow";

/**
 * ===== RETIRAR DA OPERAÇÃO O ITEM ADIANTE DO ARTIGO DESMONTADO (2026-10-18) =====
 *
 * Decisão do dono (literal): "tem que poder apagar sim não interessa qual seja
 * o estado, isso está no contrato global, tudo tem que poder ser apagado e
 * claro com instâncias de seleção e confirmação, e alerta falando o que está
 * apagando". O contrato global (`docs/compartilhado/sdd-lifecycle-global-plataforma-2026-08-20.md`)
 * dizia "se um downstream operacional ainda não possuir handler de remoção
 * seguro, falha fechada" — este é o handler mínimo do Radar (e da esteira do
 * Redator/Publicações, quando há item de esteira), DENTRO da esteira de sempre
 * (`editorial_workflow_items`):
 *
 *   - o item do artigo nas etapas `radar`, `writer` e `publications` passa ao
 *     estado `withdrawn`, com o registro (quando, quem, por quê, o estado de
 *     antes) no próprio payload, sob a trava otimista e com releitura;
 *   - NADA é apagado: a investigação (versões da análise, corridas) e o
 *     documento do Redator ficam como histórico (CANONICAL_HISTORY);
 *   - a mesa do Radar não lista o retirado, a adoção de versão nova o ignora e
 *     o envio ao Redator o recusa.
 *
 * Quem chama: o MESMO núcleo de desmontar do Arquiteto ("Desfazer Silo" e a
 * exclusão das keywords no Minerador). Repetir não refaz o que já saiu
 * (idempotente: o retirado não é relido como ativo).
 */

export const DOWNSTREAM_ITEM_STAGES = ["radar", "writer", "publications"] as const;

type Client = Pick<SupabaseClient, "from">;
type Row = Record<string, unknown>;

export type DownstreamItem = { itemId: string; articleId: string; stage: string; state: string; lockVersion: number };
export type DownstreamWithdrawalOutcome = {
  withdrawn: Array<{ itemId: string; articleId: string; stage: string; previousState: string }>;
  failed: Array<{ itemId: string; articleId: string; stage: string; message: string }>;
};

const BLOCO = 100;

/** Os itens ATIVOS (não retirados) das etapas posteriores destes artigos, da marca. */
export async function readActiveDownstreamItems(client: Client, brandId: string, articleIds: readonly string[]): Promise<DownstreamItem[]> {
  const unicos = [...new Set(articleIds)].filter(Boolean);
  const itens: DownstreamItem[] = [];
  for (let inicio = 0; inicio < unicos.length; inicio += BLOCO) {
    const { data, error } = await client.from("editorial_workflow_items")
      .select("id,article_id,stage,state,lock_version")
      .eq("marca_id", brandId)
      .in("article_id", unicos.slice(inicio, inicio + BLOCO))
      .in("stage", [...DOWNSTREAM_ITEM_STAGES]);
    if (error) throw error;
    for (const row of (data || []) as Row[]) {
      if (row.state === RADAR_WITHDRAWN_STATE) continue;
      if (typeof row.id !== "string" || typeof row.article_id !== "string") continue;
      itens.push({ itemId: row.id, articleId: row.article_id, stage: String(row.stage ?? ""), state: String(row.state ?? ""), lockVersion: Number(row.lock_version) });
    }
  }
  return itens;
}

/** Tira da operação os itens ativos destes artigos (estado `withdrawn`), com o registro e a releitura. */
export async function withdrawDownstreamItems(client: Client, input: {
  brandId: string;
  actorUserId: string;
  articleIds: readonly string[];
  reason: string;
  at: string;
}): Promise<DownstreamWithdrawalOutcome> {
  const saida: DownstreamWithdrawalOutcome = { withdrawn: [], failed: [] };
  const itens = await readActiveDownstreamItems(client, input.brandId, input.articleIds);
  for (const item of itens) {
    const lido = await client.from("editorial_workflow_items").select("id,payload,state,lock_version")
      .eq("marca_id", input.brandId).eq("id", item.itemId).maybeSingle();
    if (lido.error || !lido.data) { saida.failed.push({ ...item, message: "o item não pôde ser lido agora" }); continue; }
    const linha = lido.data as Row;
    const payload = linha.payload && typeof linha.payload === "object" && !Array.isArray(linha.payload) ? linha.payload as Row : {};
    const gravado = await client.from("editorial_workflow_items").update({
      state: RADAR_WITHDRAWN_STATE,
      payload: { ...payload, withdrawal: { at: input.at, actorUserId: input.actorUserId, reason: input.reason, previousState: String(linha.state ?? item.state) } },
      updated_by: input.actorUserId,
    }).eq("marca_id", input.brandId).eq("id", item.itemId).eq("lock_version", Number(linha.lock_version)).select("id,state").maybeSingle();
    if (gravado.error || !gravado.data || (gravado.data as Row).state !== RADAR_WITHDRAWN_STATE) {
      saida.failed.push({ ...item, message: "o item mudou em outra sessão; gere a prévia de novo" });
      continue;
    }
    saida.withdrawn.push({ itemId: item.itemId, articleId: item.articleId, stage: item.stage, previousState: String(linha.state ?? item.state) });
  }
  // Releitura: nenhum dos retirados volta ativo.
  const ainda = new Set((await readActiveDownstreamItems(client, input.brandId, input.articleIds)).map(item => item.itemId));
  for (const item of [...saida.withdrawn]) {
    if (!ainda.has(item.itemId)) continue;
    saida.withdrawn = saida.withdrawn.filter(outro => outro.itemId !== item.itemId);
    saida.failed.push({ itemId: item.itemId, articleId: item.articleId, stage: item.stage, message: "a releitura ainda mostra o item ativo" });
  }
  return saida;
}
