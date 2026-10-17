import "server-only";

import type { PublishedReinforcementMineradorPorts } from "@/lib/server/arquiteto-published-reinforcement";
import { createMineradorArquitetoHandoff } from "@/lib/server/arquiteto-workspace";
import { applyKeywordDecisionEntries, keywordDecisionEntries, readDecisionKeywords, runKeywordLogicWithCore } from "@/lib/server/minerador-keyword-decision-core";
import { measureKeywordVolume } from "@/lib/server/minerador-volume-measure";
import { importSubjectDiscoveryWithCore } from "@/lib/minerador/subject-discovery-import";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/*
 * 2026-10-17 · AS PORTAS DA KEYWORD NOVA, UM LUGAR SÓ: as mesmas para o
 * "Reforçar publicados" e o "Aceitar grupo" da diferenciação (antes ficavam na
 * rota do Reforçar; arquivo próprio para a leitura do MCP não carregar os
 * núcleos de escrita do Minerador). Os núcleos do Minerador das telas, com as permissões de
 * quem confirma, conferidas aqui, antes de qualquer escrita. Só servem à
 * keyword NOVA (que não existe na marca) e só às linhas que o import criou.
 */
/** Os núcleos do Minerador para a keyword NOVA, com a permissão de quem confirma (conferida aqui, antes de escrever). */
export async function mineradorPortsForNewKeywords(brandId: string): Promise<PublishedReinforcementMineradorPorts> {
  const [criar, editar, aprovar, enviar] = [
    await resolvePipelineContext({ brandId, module: "minerador", action: "create" }),
    await resolvePipelineContext({ brandId, module: "minerador", action: "edit" }),
    await resolvePipelineContext({ brandId, module: "minerador", action: "approve" }),
    await resolvePipelineContext({ brandId, module: "arquiteto", action: "create" }),
  ];
  return {
    importKeywords: async importRequest => {
      const resultado = await importSubjectDiscoveryWithCore({ brandId: criar.brandId, actorUserId: criar.actorUserId, supabase: criar.supabase, request: importRequest });
      if (!resultado.ok) return { ok: false, reason: resultado.reason };
      // Só as linhas que ESTE import criou: a que já existia nunca segue para a Lógica, o Volume, a aprovação ou o envio.
      return { ok: true, createdIds: resultado.rows.filter(row => row.outcome === "created" && row.keywordId).map(row => row.keywordId!) };
    },
    runLogic: async keywordIds => {
      const resultado = await runKeywordLogicWithCore({ brandId: editar.brandId, keywordIds, db: editar.supabase });
      return { ok: resultado.readbackConfirmed && !resultado.missingIds.length, reason: resultado.missingIds.length ? "keyword não encontrada" : resultado.readbackConfirmed ? null : "a releitura não confirmou a Lógica" };
    },
    measureVolume: async keywordIds => {
      const medicao = await measureKeywordVolume(editar, keywordIds);
      const falha = medicao.outcomes.find(item => item.outcome === "failed");
      return { ok: !falha, reason: falha ? falha.reason ?? "sem confirmação" : null };
    },
    readVolumes: async keywordIds => {
      const { data, error } = await editar.supabase.from("minerador_keywords").select("id,volume_search,volume_source").eq("brand_id", editar.brandId).is("deleted_at", null).in("id", keywordIds);
      if (error) throw error;
      return new Map(((data || []) as Array<{ id: string; volume_search: number | null; volume_source: string | null }>).map(linha => [String(linha.id), {
        volume: typeof linha.volume_search === "number" ? linha.volume_search : null,
        validated: String(linha.volume_source ?? "").toLowerCase() === "google_ads" && (linha.volume_search ?? 0) > 0,
      }]));
    },
    approve: async keywordIds => {
      const { rows, missingCount } = await readDecisionKeywords(aprovar.brandId, keywordIds, aprovar.supabase);
      if (missingCount) return { ok: false, reason: "keyword não encontrada" };
      const entries = keywordDecisionEntries(rows, "approve");
      const bloqueada = entries.find(entry => entry.outcome === "blocked");
      if (bloqueada) return { ok: false, reason: `"${bloqueada.keyword}": ${bloqueada.blockers[0]}` };
      const resultados = await applyKeywordDecisionEntries({ brandId: aprovar.brandId, actorId: aprovar.actorUserId, action: "approve", rows, entries, db: aprovar.supabase });
      const falha = resultados.find(item => item.outcome !== "applied" && item.outcome !== "unchanged");
      return { ok: !falha, reason: falha ? falha.reason ?? "a releitura não confirmou a aprovação" : null };
    },
    handoff: async keywordIds => { await createMineradorArquitetoHandoff(enviar, keywordIds); },
  };
}
