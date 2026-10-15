import "server-only";

import { NextRequest } from "next/server";
import { buildCanonicalWorkflowWorkspaceItems } from "@/lib/arquiteto/canonical-workspace";
import { choosePlanSiloTerritory, confirmedTerritoryDraft, declaredPlanSiloDraft, declaredPlanSiloNote } from "@/lib/arquiteto/declared-plan-silo";
import { normalizeManualSiloPageSlug } from "@/lib/arquiteto/manual-silo";
import { planSiloDecisionBatch } from "@/lib/arquiteto/silo-decision-batch";
import { buildTerritorialLandscape } from "@/lib/arquiteto/territorial-landscape";
import { readKeywordGroupInfo } from "@/lib/editorial/article-groups-store";
import { EDITORIAL_GROUP_COLOR_LABELS } from "@/lib/editorial/editorial-groups";
import { linkEditorialGroupSilo, listEditorialGroupPlans } from "@/lib/editorial/editorial-groups-store";
import { readDeclaredSiloPlan } from "@/lib/minerador/declared-plan";
import { createTerritoryWorkflowItem, listTerritoryWorkflowItems, updateTerritoryWorkflowItem, type TerritoryWorkflowItem } from "./arquiteto-territory-store";
import { resolvePipelineContext, type PipelineContext } from "./pipeline-runtime";

/**
 * O SILO DO PLANO CHEGA AO ARQUITETO JÁ CONFIRMADO (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 1, D1).
 *
 * Chamado pelo envio ao Arquiteto, DEPOIS da releitura do recebimento. Para cada
 * grupo com plano declarado que tem keywords neste envio:
 *
 *  1. acha o Silo do plano pela regra de "Processar arquitetura"
 *     (`choosePlanSiloTerritory`) ou cria o candidato com nome/slug do plano e a
 *     proveniência do cadastro (o store de território de sempre);
 *  2. confirma o território quando o ator tem `arquiteto:approve`; sem ela,
 *     fica candidato com o motivo (quem pode confirmar);
 *  3. põe nele as keywords recebidas do grupo que ainda não têm Silo, pela
 *     decisão de Silo de sempre (`planSiloDecisionBatch` → PATCH canônico da
 *     mesa, o mesmo writer da tela), e relê;
 *  4. liga o grupo ao Silo (evento `silo_linked`).
 *
 * Idempotente: repetir encontra o Silo ligado e confirmado e as keywords já
 * nele — nada é escrito. Keyword publicada ou que já está em outro Silo não é
 * movida (a decisão anterior é preservada). Sem plano no envio = nada acontece.
 * Falha aqui nunca derruba o envio: vira o desfecho, com o motivo.
 */

export type DeclaredPlanSiloOutcome = {
  groupId: string;
  groupLabel: string;
  territoryRef: string | null;
  /** `rejected`: o Silo do plano foi desfeito por alguém — nada é escrito; volta por "Recriar o Silo do plano". */
  territory: "linked" | "slug" | "created" | "failed" | "rejected";
  confirmed: boolean;
  /** Sem `arquiteto:approve`, o território fica candidato e isto diz por quê. */
  pendingConfirmation: string | null;
  assignedKeywordIds: string[];
  keptElsewhere: string[];
  message: string;
};

type Patch = (context: PipelineContext, body: Record<string, unknown>) => Promise<void>;

export async function patchViaMesa(context: PipelineContext, body: Record<string, unknown>): Promise<void> {
  const { handleArchitectWorkspacePatch } = await import("./arquiteto-workspace-http");
  const response = await handleArchitectWorkspacePatch(new NextRequest("http://localhost/api/arquiteto/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), context);
  const json = await response.json().catch(() => null) as { success?: boolean; error?: unknown } | null;
  if (!response.ok || json?.success === false) throw new Error(typeof json?.error === "string" ? json.error : `A mesa recusou a decisão de Silo (HTTP ${response.status}).`);
}

export async function canApprove(context: PipelineContext): Promise<boolean> {
  try {
    await resolvePipelineContext({ brandId: context.brandId, module: "arquiteto", action: "approve" }, { requireActorUserId: async () => context.actorUserId });
    return true;
  } catch {
    return false;
  }
}

/**
 * As keywords recebidas do grupo que ainda não têm Silo vão para o Silo do
 * plano, pela decisão de Silo de sempre (`planSiloDecisionBatch` → PATCH
 * canônico da mesa), e são relidas. Keyword publicada ou já em outro Silo não
 * é movida (`keptElsewhere`). Usado pelo envio e por "Consolidar o Silo do plano".
 */
export async function assignPlanGroupKeywordsToTerritory(context: PipelineContext, input: { groupId: string; territoryRef: string; territories: readonly TerritoryWorkflowItem[]; patch?: Patch; decidedAt: string }): Promise<{ assignedKeywordIds: string[]; keptElsewhere: string[] }> {
  const patch = input.patch ?? patchViaMesa;
  const { loadCanonicalArquitetoWorkspace } = await import("./arquiteto-workspace");
  const mesa = await loadCanonicalArquitetoWorkspace(context, { groupFilter: { kind: "group", groupId: input.groupId } });
  const linhas = buildCanonicalWorkflowWorkspaceItems(mesa.workflowItems, mesa.keywords, context.brandId) as unknown as Array<Record<string, unknown>>;
  const semSilo = linhas.filter(linha => !linha.territoryRef && !linha.isPublished);
  const keptElsewhere = linhas.filter(linha => typeof linha.territoryRef === "string" && linha.territoryRef !== input.territoryRef).map(linha => String(linha.id));
  if (!semSilo.length) return { assignedKeywordIds: [], keptElsewhere };
  const paisagem = buildTerritorialLandscape({ brandId: context.brandId, keywords: linhas as Array<{ id: string }>, territories: input.territories.map(item => item.territory), assignments: [] });
  const porId = new Map(linhas.map(linha => [String(linha.id), linha]));
  const lote = planSiloDecisionBatch({
    brandId: context.brandId,
    landscape: paisagem,
    keywordOf: keywordId => {
      const linha = porId.get(keywordId);
      const workflow = linha?.canonicalWorkflow as { id?: unknown; lockVersion?: unknown } | undefined;
      if (!linha || typeof workflow?.id !== "string" || !Number.isInteger(workflow.lockVersion)) return null;
      return { keywordId, brandId: context.brandId, workflowItemId: workflow.id, expectedLock: Number(workflow.lockVersion), currentTerritoryRef: null, isPublished: false };
    },
    decisions: semSilo.map(linha => ({ keywordId: String(linha.id), target: { kind: "territory" as const, territoryRef: input.territoryRef } })),
    decidedAt: input.decidedAt,
  });
  if (lote.writes.length) {
    await patch(context, { brandId: context.brandId, updates: lote.writes.map(write => ({ workflowItemId: write.workflowItemId, expectedLock: write.expectedLock, assignment: write.assignment as Record<string, unknown> })) });
  }
  // Releitura: só conta o que voltou no Silo do plano.
  const relida = await loadCanonicalArquitetoWorkspace(context, { groupFilter: { kind: "group", groupId: input.groupId } });
  const relidas = buildCanonicalWorkflowWorkspaceItems(relida.workflowItems, relida.keywords, context.brandId) as unknown as Array<Record<string, unknown>>;
  return { assignedKeywordIds: relidas.filter(linha => linha.territoryRef === input.territoryRef && semSilo.some(antes => antes.id === linha.id)).map(linha => String(linha.id)), keptElsewhere };
}

export async function materializeDeclaredPlanSilo(context: PipelineContext, keywordIds: readonly string[], deps: { patch?: Patch; now?: () => string } = {}): Promise<DeclaredPlanSiloOutcome[]> {
  if (!keywordIds.length) return [];
  const grupos = await readKeywordGroupInfo(context.supabase, context.brandId, keywordIds);
  if (!grupos.ok) return [];
  const doEnvio = new Set([...grupos.info.values()].map(info => info.groupId).filter((id): id is string => Boolean(id)));
  if (!doEnvio.size) return [];
  const planos = await listEditorialGroupPlans(context.supabase, context.brandId);
  if (!planos.ok) return [];
  const comPlano = planos.groups.filter(group => doEnvio.has(group.id) && group.status === "active" && readDeclaredSiloPlan(group.plan));
  if (!comPlano.length) return [];

  const patch = deps.patch ?? patchViaMesa;
  const agora = deps.now?.() ?? new Date().toISOString();
  const aprova = await canApprove(context);
  const saida: DeclaredPlanSiloOutcome[] = [];
  let territorios: TerritoryWorkflowItem[] = await listTerritoryWorkflowItems(context);

  for (const grupo of comPlano) {
    const plano = readDeclaredSiloPlan(grupo.plan)!;
    const rotulo = `${EDITORIAL_GROUP_COLOR_LABELS[grupo.color]}${grupo.name ? ` (${grupo.name})` : ""}`;
    const base = { groupId: grupo.id, groupLabel: rotulo, assignedKeywordIds: [] as string[], keptElsewhere: [] as string[] };
    try {
      // 1 · o Silo do plano
      const escolha = choosePlanSiloTerritory({
        plan: plano,
        linkedTerritoryRef: grupo.siloId,
        territories: territorios.map(item => ({
          territoryRef: item.territoryRef,
          lifecycleStatus: item.territory.lifecycleStatus,
          slugs: [item.territory.slugState.publishedSlug, item.territory.slugState.confirmed, ...item.territory.slugState.proposals.map(proposal => proposal.slug)],
          name: item.territory.name,
        })),
        slugOf: normalizeManualSiloPageSlug,
      });
      /*
       * 2026-10-14 (WifiConecta, azul): o Silo do plano DESFEITO não recebe
       * membros nem nasce duplicado em silêncio. O desfecho diz o caminho.
       */
      if (escolha.kind === "rejected_by_human") {
        saida.push({ ...base, territoryRef: escolha.territoryRef, territory: "rejected", confirmed: false, pendingConfirmation: null,
          message: `O Silo do plano ${rotulo} (“${plano.siloName}”) foi desfeito no Arquiteto: as keywords chegaram, mas não entraram nele. Para trazê-lo de volta, use “Recriar o Silo do plano · ${EDITORIAL_GROUP_COLOR_LABELS[grupo.color]}” em Arquiteto → Silos.` });
        continue;
      }
      let territorio: TerritoryWorkflowItem;
      let como: DeclaredPlanSiloOutcome["territory"];
      if (escolha.kind === "create") {
        territorio = await createTerritoryWorkflowItem(context, declaredPlanSiloDraft({
          plan: plano,
          slugOf: normalizeManualSiloPageSlug,
          note: declaredPlanSiloNote({ groupLabel: rotulo, planVersion: grupo.planVersion, actorUserId: context.actorUserId, at: agora }),
        }));
        territorios = [...territorios, territorio];
        como = "created";
      } else {
        territorio = territorios.find(item => item.territoryRef === escolha.territoryRef)!;
        como = escolha.kind;
      }
      // 2 · confirmar (só com a permissão; nunca muda slug nem identidade)
      let pendente: string | null = null;
      if (territorio.territory.lifecycleStatus === "candidate") {
        if (aprova) {
          territorio = await updateTerritoryWorkflowItem(context, territorio.territoryRef, territorio.lockVersion, confirmedTerritoryDraft(territorio.territory as unknown as Record<string, unknown>));
          territorios = territorios.map(item => item.territoryRef === territorio.territoryRef ? territorio : item);
        } else {
          pendente = "Quem envia não tem a permissão de aprovar no Arquiteto: o Silo do plano ficou candidato; o dono da marca (ou quem tem arquiteto:approve) confirma em Arquiteto → Silos.";
        }
      }
      // 3 · as keywords recebidas do grupo, sem Silo, vão para o Silo do plano
      const posto = await assignPlanGroupKeywordsToTerritory(context, { groupId: grupo.id, territoryRef: territorio.territoryRef, territories: territorios, patch, decidedAt: agora });
      base.keptElsewhere = posto.keptElsewhere;
      base.assignedKeywordIds = posto.assignedKeywordIds;
      // 4 · o grupo ligado ao Silo (aditivo; nunca derruba)
      if (grupo.siloId !== territorio.territoryRef && !grupo.siloId) {
        await linkEditorialGroupSilo(context.supabase, { brandId: context.brandId, actorUserId: context.actorUserId, groupId: grupo.id, siloId: territorio.territoryRef }).catch(() => null);
      }
      const confirmado = territorio.territory.lifecycleStatus === "confirmed";
      saida.push({
        ...base,
        territoryRef: territorio.territoryRef,
        territory: como,
        confirmed: confirmado,
        pendingConfirmation: pendente,
        message: `Silo do plano ${rotulo} (“${plano.siloName}”) ${como === "created" ? "criado" : "encontrado"}${confirmado ? " e confirmado" : " como candidato"}; ${base.assignedKeywordIds.length} keyword(s) do grupo entraram nele${base.keptElsewhere.length ? `; ${base.keptElsewhere.length} continuam no Silo onde já estavam (decisão anterior preservada)` : ""}.`,
      });
    } catch (error) {
      saida.push({ ...base, territoryRef: null, territory: "failed", confirmed: false, pendingConfirmation: null, message: `O Silo do plano ${rotulo} não pôde ser preparado: ${error instanceof Error ? error.message : "falha sem mensagem"}. O envio continua válido; use "Processar arquitetura" e "Confirmar propostas novas" no Arquiteto.` });
    }
  }
  return saida;
}
