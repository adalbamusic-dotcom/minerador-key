import type { SupabaseClient } from "@supabase/supabase-js";
import { isKeywordPublished } from "./keyword-lifecycle.ts";

/**
 * SOBRAS DO CADASTRO QUE PODEM SER EXCLUÍDAS (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 9, D9).
 *
 * A prévia do cadastro já sabe as sobras de import (nome do Silo, rótulo
 * colado). O card oferece "Excluir as k sobras" SÓ para a sobra NÃO publicada e
 * NUNCA enviada ao Arquiteto (sem item `keyword` no estágio `architect` de
 * `editorial_workflow_items`). A exclusão em si é a de sempre do Minerador
 * (prévia do servidor + nome digitado), e para keyword não publicada ela é
 * DEFINITIVA (C20): esta leitura não apaga nada.
 *
 * Só leitura, colunas estreitas, sempre pela marca. Falha de leitura = não
 * oferece (nunca adivinha que pode apagar).
 */

export type DeclaredPlanLeftoverDeletion = { deletable: boolean; blockedReason: string | null };

export const DECLARED_PLAN_LEFTOVER_BLOCKED = {
  published: "Publicada: não sai por aqui (publicada tem remoção recuperável, com confirmação própria).",
  sent: "Já foi enviada ao Arquiteto: não sai por aqui.",
  unknown: "Não foi possível conferir agora se foi publicada ou enviada ao Arquiteto: não é oferecida.",
} as const;

const CHUNK = 200;

export async function classifyDeclaredPlanLeftovers(client: Pick<SupabaseClient, "from">, brandId: string, keywordIds: readonly string[]): Promise<Map<string, DeclaredPlanLeftoverDeletion>> {
  const ids = [...new Set(keywordIds)];
  const out = new Map<string, DeclaredPlanLeftoverDeletion>();
  if (!ids.length) return out;
  try {
    const published = new Set<string>();
    const sent = new Set<string>();
    const found = new Set<string>();
    for (let start = 0; start < ids.length; start += CHUNK) {
      const slice = ids.slice(start, start + CHUNK);
      const rows = await client.from("minerador_keywords").select("id,status,analise_semantica").eq("brand_id", brandId).in("id", slice).is("deleted_at", null);
      if (rows.error) throw rows.error;
      for (const row of (rows.data || []) as Array<{ id: unknown; status?: unknown; analise_semantica?: unknown }>) {
        const id = String(row.id);
        found.add(id);
        const semantic = row.analise_semantica && typeof row.analise_semantica === "object" && !Array.isArray(row.analise_semantica) ? row.analise_semantica as Record<string, unknown> : {};
        // O status legado "publicado" também protege: na dúvida, não oferece exclusão definitiva.
        if (row.status === "publicado" || isKeywordPublished({ status: typeof row.status === "string" ? row.status : null, semantic })) published.add(id);
      }
      const items = await client.from("editorial_workflow_items").select("subject_id").eq("marca_id", brandId).eq("stage", "architect").eq("subject_type", "keyword").in("subject_id", slice);
      if (items.error) throw items.error;
      for (const item of (items.data || []) as Array<{ subject_id: unknown }>) sent.add(String(item.subject_id));
    }
    for (const id of ids) {
      if (!found.has(id)) out.set(id, { deletable: false, blockedReason: DECLARED_PLAN_LEFTOVER_BLOCKED.unknown });
      else if (published.has(id)) out.set(id, { deletable: false, blockedReason: DECLARED_PLAN_LEFTOVER_BLOCKED.published });
      else if (sent.has(id)) out.set(id, { deletable: false, blockedReason: DECLARED_PLAN_LEFTOVER_BLOCKED.sent });
      else out.set(id, { deletable: true, blockedReason: null });
    }
  } catch {
    for (const id of ids) out.set(id, { deletable: false, blockedReason: DECLARED_PLAN_LEFTOVER_BLOCKED.unknown });
  }
  return out;
}
