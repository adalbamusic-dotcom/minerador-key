import "server-only";

import { createHash } from "node:crypto";
import { buildCanonicalWorkflowWorkspaceItems } from "@/lib/arquiteto/canonical-workspace";
import { choosePlanSiloTerritory, confirmedTerritoryDraft, planRecreatePlanSiloLines, type RecreatePlanSiloLine } from "@/lib/arquiteto/declared-plan-silo";
import { normalizeManualSiloPageSlug } from "@/lib/arquiteto/manual-silo";
import { planSiloDecisionBatch } from "@/lib/arquiteto/silo-decision-batch";
import { buildTerritorialLandscape } from "@/lib/arquiteto/territorial-landscape";
import { canonicalJson } from "@/lib/arquiteto/versioning";
import { readKeywordGroupInfo } from "@/lib/editorial/article-groups-store";
import { EDITORIAL_GROUP_COLOR_LABELS } from "@/lib/editorial/editorial-groups";
import { linkEditorialGroupSilo, listEditorialGroupPlans } from "@/lib/editorial/editorial-groups-store";
import { readDeclaredSiloPlan } from "@/lib/minerador/declared-plan";
import { canApprove, patchViaMesa } from "./arquiteto-declared-plan-silo";
import { listTerritoryWorkflowItems, updateTerritoryWorkflowItem, type TerritoryWorkflowItem } from "./arquiteto-territory-store";
import { PipelineRuntimeError, type PipelineContext } from "./pipeline-runtime";

/**
 * "RECRIAR O SILO DO PLANO" (2026-10-14, caso WifiConecta, azul).
 *
 * O dono clicou "Desfazer os Silos sugeridos" e o lote desfez também o Silo do
 * plano declarado ("Wi-Fi e fibra óptica"). "Processar arquitetura" respeita o
 * desfeito e não o recria — certo para Silo sugerido, errado para o plano, que
 * é decisão humana do cadastro. Esta é a volta, como decisão humana com prévia:
 *
 *  - prévia (só leitura): o Silo desfeito do plano e, por keyword do grupo,
 *    entra / já está / fica no artigo / fica publicada / ainda não chegou;
 *    `decisionHash` cobre o território (com a trava) e as linhas;
 *  - aplicar (o MESMO hash): o "desfeito" é limpo SÓ deste Silo (rejected →
 *    candidate, com o motivo e o ator no registro), confirmado quando quem
 *    pede tem `arquiteto:approve` (a rota exige), o grupo é ligado a ele e as
 *    keywords que entram vão para ele pela decisão de Silo de sempre
 *    (`planSiloDecisionBatch` → PATCH canônico da mesa). Relido no fim.
 *
 * Nada é apagado; keyword em artigo não é mexida (isso é revisão do artigo);
 * publicada fica no Silo que o site declara; nenhuma chamada paga.
 */

export class RecreatePlanSiloStaleError extends Error {
  readonly code = "RECREATE_PLAN_SILO_STALE";
  constructor() { super("O Silo ou as keywords mudaram desde a prévia. Gere a prévia de novo; nada foi gravado."); }
}

export type RecreatePlanSiloPreview = {
  groupId: string;
  groupLabel: string;
  siloName: string;
  territoryRef: string;
  territoryState: "rejected" | "candidate" | "confirmed";
  lines: RecreatePlanSiloLine[];
  counts: { enters: number; already: number; stays: number; notReceived: number };
  decisionHash: string;
};

type Row = Record<string, unknown>;
const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

async function readContext(context: PipelineContext, groupId: string) {
  const planos = await listEditorialGroupPlans(context.supabase, context.brandId);
  if (!planos.ok) throw new PipelineRuntimeError("CONFLICT", "Os grupos ainda não estão disponíveis neste banco.", 409);
  const grupo = planos.groups.find(item => item.id === groupId && item.status === "active");
  const plano = grupo ? readDeclaredSiloPlan(grupo.plan) : null;
  if (!grupo || !plano) throw new PipelineRuntimeError("CONFLICT", "Este grupo não tem plano declarado: não há Silo do plano para recriar.", 409);
  const rotulo = `${EDITORIAL_GROUP_COLOR_LABELS[grupo.color]}${grupo.name && grupo.name !== EDITORIAL_GROUP_COLOR_LABELS[grupo.color] ? ` (${grupo.name})` : ""}`;
  const territorios = await listTerritoryWorkflowItems(context);
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
  if (escolha.kind === "create") throw new PipelineRuntimeError("CONFLICT", `Não há Silo do plano ${rotulo} desfeito para recriar: envie as keywords do grupo ao Arquiteto e o Silo do plano é preparado no envio.`, 409);
  // 2026-10-18 · o Silo do plano fechado (consolidado) é achado pela mesma regra: não há o que recriar.
  if (escolha.kind !== "rejected_by_human" && escolha.lifecycleStatus === "consolidated") throw new PipelineRuntimeError("CONFLICT", `O Silo do plano ${rotulo} já está fechado (SiloDNA e SiloPage): não há o que recriar.`, 409);
  const territorio = territorios.find(item => item.territoryRef === escolha.territoryRef)!;

  const { loadCanonicalArquitetoWorkspace } = await import("./arquiteto-workspace");
  const mesa = await loadCanonicalArquitetoWorkspace(context, { groupFilter: { kind: "group", groupId } });
  const linhas = buildCanonicalWorkflowWorkspaceItems(mesa.workflowItems, mesa.keywords, context.brandId) as unknown as Row[];
  const linhaPorId = new Map(linhas.map(linha => [String(linha.id), linha]));
  const grupos = await readKeywordGroupInfo(context.supabase, context.brandId, mesa.availableKeywords.map(keyword => keyword.id));
  if (!grupos.ok) throw new PipelineRuntimeError("CONFLICT", "Os grupos ainda não estão disponíveis neste banco.", 409);
  const doGrupo = mesa.availableKeywords.filter(keyword => grupos.info.get(keyword.id)?.groupId === groupId);
  const nomeDoTerritorio = new Map(territorios.map(item => [item.territoryRef, item.territory.name || item.territory.centralEntity || "Silo"]));
  const artigoDe = new Map<string, string>();
  for (const versao of mesa.articleDnas) {
    const rotuloDoArtigo = texto((versao.payload as unknown as Row).suggestedSlug) || String(versao.payload.articleId);
    for (const referencia of versao.payload.keywordReferences) artigoDe.set(referencia.keywordId, rotuloDoArtigo);
  }
  const keywords = doGrupo.map(keyword => {
    const linha = linhaPorId.get(keyword.id);
    const territoryRef = texto(linha?.territoryRef);
    const decisao = linha?.territoryAssignment && typeof linha.territoryAssignment === "object" ? linha.territoryAssignment as Row : null;
    return {
      keywordId: keyword.id,
      keyword: String(keyword.keyword ?? keyword.id),
      received: Boolean(linha),
      territoryRef,
      territoryLabel: territoryRef ? nomeDoTerritorio.get(territoryRef) ?? null : null,
      isPublished: Boolean(linha?.isPublished),
      articleLabel: artigoDe.get(keyword.id) ?? (texto(linha?.articleFormationRef) ? "formação em andamento" : null),
      previousDecision: decisao && texto(decisao.reason) ? String(decisao.reason).replace(/^Decisão humana:\s*/i, "").replace(/\.$/, "") : null,
    };
  }).sort((a, b) => a.keyword.localeCompare(b.keyword, "pt-BR"));
  const lines = planRecreatePlanSiloLines({ territoryRef: territorio.territoryRef, keywords });
  return { grupo, plano, rotulo, territorio, territorios, linhas, lines };
}

function previewOf(lido: Awaited<ReturnType<typeof readContext>>, brandId: string, actorId: string): RecreatePlanSiloPreview {
  const estado = lido.territorio.territory.lifecycleStatus;
  const decisionHash = createHash("sha256").update(canonicalJson({
    contract: "recreate-plan-silo@1", brandId, actorId, groupId: lido.grupo.id,
    territoryRef: lido.territorio.territoryRef, lockVersion: lido.territorio.lockVersion, state: estado,
    lines: lido.lines.map(line => ({ id: line.keywordId, outcome: line.outcome })),
  })).digest("hex");
  return {
    groupId: lido.grupo.id,
    groupLabel: lido.rotulo,
    siloName: lido.plano.siloName,
    territoryRef: lido.territorio.territoryRef,
    territoryState: estado === "rejected" ? "rejected" : estado === "confirmed" ? "confirmed" : "candidate",
    lines: lido.lines,
    counts: {
      enters: lido.lines.filter(line => line.outcome === "enters").length,
      already: lido.lines.filter(line => line.outcome === "already").length,
      stays: lido.lines.filter(line => line.outcome === "stays_in_article" || line.outcome === "stays_published").length,
      notReceived: lido.lines.filter(line => line.outcome === "not_received").length,
    },
    decisionHash,
  };
}

export async function previewRecreatePlanSilo(context: PipelineContext, groupId: string): Promise<RecreatePlanSiloPreview> {
  return previewOf(await readContext(context, groupId), context.brandId, context.actorUserId);
}

export async function applyRecreatePlanSilo(context: PipelineContext, input: { groupId: string; decisionHash: string }, deps: { now?: () => string } = {}) {
  const lido = await readContext(context, input.groupId);
  const previa = previewOf(lido, context.brandId, context.actorUserId);
  if (previa.decisionHash !== input.decisionHash) throw new RecreatePlanSiloStaleError();
  const agora = deps.now?.() ?? new Date().toISOString();

  // 1 · o "desfeito" é limpo SÓ deste Silo (rejected → candidate), com o registro da decisão.
  let territorio: TerritoryWorkflowItem = lido.territorio;
  if (territorio.territory.lifecycleStatus === "rejected") {
    territorio = await updateTerritoryWorkflowItem(context, territorio.territoryRef, territorio.lockVersion, {
      ...(territorio.territory as unknown as Row),
      lifecycleStatus: "candidate",
      decisionState: "pending",
      reasons: [...territorio.territory.reasons, `Silo do plano recriado por decisão humana em ${agora} (ator ${context.actorUserId}): o “desfeito” anterior foi limpo só deste Silo.`],
    });
  }
  // 2 · confirmado (a rota exige arquiteto:approve; a conferência fica aqui também).
  if (territorio.territory.lifecycleStatus === "candidate" && await canApprove(context)) {
    territorio = await updateTerritoryWorkflowItem(context, territorio.territoryRef, territorio.lockVersion, confirmedTerritoryDraft(territorio.territory as unknown as Row));
  }
  // 3 · o grupo ligado ao Silo do plano (aditivo; nunca derruba).
  if (!lido.grupo.siloId) {
    await linkEditorialGroupSilo(context.supabase, { brandId: context.brandId, actorUserId: context.actorUserId, groupId: lido.grupo.id, siloId: territorio.territoryRef }).catch(() => null);
  }
  // 4 · as keywords que entram, pela decisão de Silo de sempre.
  const entram = lido.lines.filter(line => line.outcome === "enters").map(line => line.keywordId);
  const territorios = lido.territorios.map(item => item.territoryRef === territorio.territoryRef ? territorio : item);
  const porId = new Map(lido.linhas.map(linha => [String(linha.id), linha]));
  let recusadas: Array<{ keywordId: string; reason: string }> = [];
  if (entram.length) {
    const paisagem = buildTerritorialLandscape({ brandId: context.brandId, keywords: lido.linhas as Array<{ id: string }>, territories: territorios.map(item => item.territory), assignments: [] });
    const lote = planSiloDecisionBatch({
      brandId: context.brandId,
      landscape: paisagem,
      keywordOf: keywordId => {
        const linha = porId.get(keywordId);
        const workflow = linha?.canonicalWorkflow as { id?: unknown; lockVersion?: unknown } | undefined;
        if (!linha || typeof workflow?.id !== "string" || !Number.isInteger(workflow.lockVersion)) return null;
        return { keywordId, brandId: context.brandId, workflowItemId: workflow.id, expectedLock: Number(workflow.lockVersion), currentTerritoryRef: texto(linha.territoryRef), isPublished: Boolean(linha.isPublished) };
      },
      decisions: entram.map(keywordId => ({ keywordId, target: { kind: "territory" as const, territoryRef: territorio.territoryRef } })),
      decidedAt: agora,
    });
    recusadas = lote.refused.map(item => ({ keywordId: item.keywordId, reason: item.reason }));
    if (lote.writes.length) {
      await patchViaMesa(context, { brandId: context.brandId, updates: lote.writes.map(write => ({ workflowItemId: write.workflowItemId, expectedLock: write.expectedLock, assignment: write.assignment as Record<string, unknown> })) });
    }
  }
  // 5 · releitura: o desfecho é o que voltou do banco.
  const relido = await readContext(context, input.groupId);
  const noSilo = new Set(relido.lines.filter(line => line.outcome === "already").map(line => line.keywordId));
  const entraram = entram.filter(id => noSilo.has(id));
  const naoEntraram = entram.filter(id => !noSilo.has(id)).map(id => ({
    keywordId: id,
    keyword: lido.lines.find(line => line.keywordId === id)?.keyword ?? id,
    reason: recusadas.find(item => item.keywordId === id)?.reason ?? "A releitura não a mostrou no Silo do plano; tente de novo.",
  }));
  const estado = relido.territorio.territory.lifecycleStatus;
  return {
    groupId: lido.grupo.id,
    territoryRef: territorio.territoryRef,
    territoryState: estado,
    confirmed: estado === "confirmed",
    entered: entraram,
    notEntered: naoEntraram,
    lines: relido.lines,
    readbackConfirmed: estado !== "rejected" && naoEntraram.length === 0,
    message: `Silo do plano ${lido.rotulo} (“${lido.plano.siloName}”) recriado${estado === "confirmed" ? " e confirmado" : " como candidato"}; ${entraram.length} keyword(s) entraram nele${noSilo.size > entraram.length ? ` (${noSilo.size} no Silo agora)` : ""}${naoEntraram.length ? `; ${naoEntraram.length} não entraram (motivo na linha)` : ""}. Conferido na releitura; nada foi apagado.`,
  };
}
