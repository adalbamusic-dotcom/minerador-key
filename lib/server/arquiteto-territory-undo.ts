import "server-only";

import { createHash } from "node:crypto";
import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase, resolvePipelineContext } from "./pipeline-runtime";
import { listTerritoryWorkflowItems, readTerritoryWorkflowItem } from "./arquiteto-territory-store";
import { readArticleVersionEvents } from "./arquiteto-workspace";
import { ArtifactRepository } from "./editorial-repositories";
import { readActiveDownstreamItems, withdrawDownstreamItems, type DownstreamWithdrawalOutcome } from "./radar-item-withdrawal";
import { deleteArticleGroupRows } from "@/lib/editorial/article-groups-store";
import { isArchitectKeywordPublished } from "@/lib/arquiteto/published-identity";
import type { ArchitectDismantlePort, ArchitectDismantlePreview, ArchitectDismantleResult } from "@/lib/minerador/architect-dismantle";
import {
  buildLooseArticleRejection,
  buildTerritoryUndoRejections,
  planTerritoryUndo,
  territoryUndoLabel,
  type TerritoryUndoApprovedArticle,
  type TerritoryUndoLinkGraph,
  type TerritoryUndoLinkedGroup,
  type TerritoryUndoMember,
  type TerritoryUndoSiloArtifact,
  type TerritoryUndoWholeSiloPlan,
} from "@/lib/arquiteto/territory-undo";
import type { KeywordTerritoryDecision, TerritoryCandidate } from "@/lib/arquiteto/territory";
import type { VersionStatusEvent } from "@/lib/arquiteto/contracts";
import { canonicalJson } from "@/lib/arquiteto/versioning";
import { declaredPlanSiloGroupFor, declaredPlanViewOfTerritory, type DeclaredPlanGroupView } from "@/lib/arquiteto/declared-plan-silo";
import { normalizeManualSiloPageSlug } from "@/lib/arquiteto/manual-silo";
import { EDITORIAL_GROUP_COLOR_LABELS, isEditorialGroupsSchemaMissing, type EditorialGroupColor } from "@/lib/editorial/editorial-groups";
import { listEditorialGroupPlans, unlinkEditorialGroupSilo } from "@/lib/editorial/editorial-groups-store";
import { typedConfirmationMatches } from "@/lib/lifecycle/typed-confirmation";
import { readDeclaredSiloPlan } from "@/lib/minerador/declared-plan";

/**
 * DESFAZER SILO — a leitura e o plano no SERVIDOR.
 *
 * Tudo o que decide a recusa é lido aqui, do banco, filtrado pela Brand do
 * contexto autenticado: o território, as keywords que apontam para ele, a
 * versão vigente de cada ArticleDNA (com o status efetivo pelos eventos), os
 * SiloDNA/SiloPage do território, as etapas posteriores dos artigos dele, o
 * grafo de links aprovado e o grupo ligado. O corpo da requisição traz só o
 * ref e o lock (e, no Silo inteiro, a prévia e o nome digitado).
 *
 * Esta função NÃO grava. Quem grava é a rota do workspace, pelos MESMOS
 * writers de sempre: a decisão de Silo (item da keyword), o lifecycle do
 * território, o evento de status das versões (o de "Retirar artigo do Silo")
 * e o vínculo do grupo (`unlinkEditorialGroupSilo`) — cada um com o seu lock,
 * e só depois que este plano passou inteiro.
 */

type Row = Record<string, unknown>;

export type TerritoryUndoKeywordUpdate = {
  workflowItemId: string;
  expectedLock: number;
  assignment: { territoryRef: null; territoryAssignment: KeywordTerritoryDecision };
};

export type ServerTerritoryUndoPlan = {
  /** "suggested" = o de sempre; "whole_silo" = o Silo inteiro (2026-10-18). */
  scope: "suggested" | "whole_silo";
  territoryDraft: Record<string, unknown>;
  keywordUpdates: TerritoryUndoKeywordUpdate[];
  memberKeywordIds: string[];
  /** Só no Silo inteiro: o que sai e a base da prévia (`decisionHash`). */
  wholeSilo: (TerritoryUndoWholeSiloPlan & { decisionHash: string }) | null;
};

/** A prévia que a tela mostra (nada pago, nada gravado). */
export type TerritoryUndoPreview = {
  territoryRef: string;
  scope: "suggested" | "whole_silo";
  label: string;
  memberCount: number;
  wholeSilo: (TerritoryUndoWholeSiloPlan & { decisionHash: string }) | null;
};

const PAGE = 1000;
const BATCH = 100;

const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const ids = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : []);

async function readMembers(context: PipelineContext, territoryRef: string): Promise<Row[]> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select("id,subject_id,state,lock_version,payload")
    .eq("marca_id", context.brandId)
    .eq("subject_type", "keyword")
    .eq("stage", "architect")
    .eq("payload->>territoryRef", territoryRef);
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return (result.data || []) as Row[];
}

async function readKeywordStatus(context: PipelineContext, keywordIds: readonly string[]): Promise<Map<string, Row>> {
  const porId = new Map<string, Row>();
  for (let inicio = 0; inicio < keywordIds.length; inicio += BATCH) {
    const result = await context.supabase
      .from("minerador_keywords")
      .select("id,keyword,status")
      .eq("brand_id", context.brandId)
      .in("id", keywordIds.slice(inicio, inicio + BATCH));
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    for (const row of (result.data || []) as Row[]) porId.set(String(row.id), row);
  }
  return porId;
}

/*
 * O corpo do artefato pode estar plano (`payload.x`) ou no envelope legado
 * (`payload.payload.x`, gravado por `ArtifactRepository.save`), como aceita
 * `global-workflow-canonical.ts`. Os dois são lidos: uma versão aprovada no
 * envelope não pode escapar da leitura.
 */
const ARTICLE_COLUMNS = "version_id,entity_id,version_number,status,p_articleId:payload->>articleId,p_territoryRef:payload->>territoryRef,p_siloId:payload->>siloId,p_principalKeywordId:payload->>principalKeywordId,p_secondaryKeywordIds:payload->secondaryKeywordIds,p_narrativeReinforcementIds:payload->narrativeReinforcementIds,p_subjectKeywordId:payload->subject->>keywordId,p_phrase:payload->subject->>phrase,p_slug:payload->>suggestedSlug,p_published:payload->>publishedIdentityRef,e_articleId:payload->payload->>articleId,e_territoryRef:payload->payload->>territoryRef,e_siloId:payload->payload->>siloId,e_principalKeywordId:payload->payload->>principalKeywordId,e_secondaryKeywordIds:payload->payload->secondaryKeywordIds,e_narrativeReinforcementIds:payload->payload->narrativeReinforcementIds,e_subjectKeywordId:payload->payload->subject->>keywordId,e_phrase:payload->payload->subject->>phrase,e_slug:payload->payload->>suggestedSlug,e_published:payload->payload->>publishedIdentityRef";
const SILO_COLUMNS = "version_id,entity_id,version_number,artifact_type,status,p_territoryRef:payload->>territoryRef,p_siloId:payload->>siloId,p_publicationStatus:payload->>publicationStatus,p_pillar:payload->>pillarArticleId,p_supports:payload->supportArticleIds,p_refs:payload->articleReferences,e_territoryRef:payload->payload->>territoryRef,e_siloId:payload->payload->>siloId,e_publicationStatus:payload->payload->>publicationStatus,e_pillar:payload->payload->>pillarArticleId,e_supports:payload->payload->supportArticleIds,e_refs:payload->payload->articleReferences";
const corpo = (row: Row, campo: string) => row[`p_${campo}`] ?? row[`e_${campo}`] ?? null;

/** A versão vigente de cada entidade (maior `version_number`). */
function vigentesDe(linhas: readonly Row[]): Row[] {
  const porEntidade = new Map<string, Row>();
  for (const row of linhas) {
    const chave = String(row.entity_id ?? row.version_id);
    const atual = porEntidade.get(chave);
    if (!atual || Number(row.version_number) > Number(atual.version_number)) porEntidade.set(chave, row);
  }
  return [...porEntidade.values()];
}

/** O status efetivo: o último evento da versão; sem evento, o da linha. */
async function statusEfetivo(context: PipelineContext, linhas: readonly Row[]): Promise<Map<string, string>> {
  const eventos = await readArticleVersionEvents(context, linhas.map(row => String(row.version_id)));
  const porVersao = new Map(linhas.map(row => [String(row.version_id), String(row.status ?? "")]));
  for (const evento of eventos) porVersao.set(evento.versionId, evento.status);
  return porVersao;
}

async function readArticles(context: PipelineContext): Promise<TerritoryUndoApprovedArticle[]> {
  const linhas: Row[] = [];
  for (let inicio = 0; ; inicio += PAGE) {
    const result = await context.supabase
      .from("editorial_artifact_versions")
      .select(ARTICLE_COLUMNS)
      .eq("marca_id", context.brandId)
      .eq("artifact_type", "article_dna")
      .order("version_id")
      .range(inicio, inicio + PAGE - 1);
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    const pagina = (result.data || []) as Row[];
    linhas.push(...pagina);
    if (pagina.length < PAGE) break;
  }
  const vigentes = vigentesDe(linhas);
  const status = await statusEfetivo(context, vigentes);
  return vigentes.map(row => ({
    articleId: texto(corpo(row, "articleId")) || String(row.entity_id ?? row.version_id),
    label: texto(corpo(row, "phrase")) || texto(corpo(row, "slug")),
    territoryRef: texto(corpo(row, "territoryRef")),
    siloId: texto(corpo(row, "siloId")),
    keywordIds: [texto(corpo(row, "principalKeywordId")), ...ids(corpo(row, "secondaryKeywordIds")), ...ids(corpo(row, "narrativeReinforcementIds")), texto(corpo(row, "subjectKeywordId"))]
      .filter((id): id is string => Boolean(id)),
    versionId: String(row.version_id),
    versionNumber: Number(row.version_number) || undefined,
    status: status.get(String(row.version_id)) || String(row.status ?? ""),
    published: Boolean(corpo(row, "published")),
  }));
}

async function readSiloArtifacts(context: PipelineContext, territory: TerritoryCandidate): Promise<TerritoryUndoSiloArtifact[]> {
  // Sem filtro por `payload->>territoryRef` no banco: ele não enxergaria o
  // envelope. A marca tem poucos SiloDNA/SiloPage; o filtro vem depois.
  const linhas: Row[] = [];
  for (let inicio = 0; ; inicio += PAGE) {
    const result = await context.supabase
      .from("editorial_artifact_versions")
      .select(SILO_COLUMNS)
      .eq("marca_id", context.brandId)
      .in("artifact_type", ["silo_dna", "silo_page"])
      .order("version_id")
      .range(inicio, inicio + PAGE - 1);
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    const pagina = (result.data || []) as Row[];
    linhas.push(...pagina);
    if (pagina.length < PAGE) break;
  }
  const doSilo = new Set([territory.territoryRef, territory.consolidation?.siloId].filter((id): id is string => Boolean(id)));
  const vigentes = vigentesDe(linhas.map(row => ({ ...row, entity_id: `${row.artifact_type}:${row.entity_id ?? row.version_id}` })))
    .filter(row => texto(corpo(row, "territoryRef")) === territory.territoryRef || doSilo.has(texto(corpo(row, "siloId")) ?? ""));
  const status = await statusEfetivo(context, vigentes);
  return vigentes.map(row => {
    const refs = Array.isArray(corpo(row, "refs")) ? corpo(row, "refs") as Row[] : [];
    return {
      kind: row.artifact_type === "silo_page" ? "silo_page" as const : "silo_dna" as const,
      territoryRef: texto(corpo(row, "territoryRef")),
      status: status.get(String(row.version_id)) || String(row.status ?? ""),
      published: corpo(row, "publicationStatus") === "published",
      siloId: texto(corpo(row, "siloId")),
      versionId: String(row.version_id),
      versionNumber: Number(row.version_number) || undefined,
      pillarArticleId: texto(corpo(row, "pillar")),
      articleIds: [...new Set([...ids(corpo(row, "supports")), ...refs.map(ref => texto(ref?.articleId)).filter((id): id is string => Boolean(id))])],
    };
  });
}

/** As etapas posteriores ATIVAS de cada artigo (o item já retirado da operação não conta de novo: repetir é seguro). */
async function readDownstream(context: PipelineContext, articleIds: readonly string[]): Promise<Map<string, string[]>> {
  const etapas = new Map<string, string[]>();
  let itens;
  try {
    itens = await readActiveDownstreamItems(context.supabase, context.brandId, articleIds);
  } catch (error) {
    throw pipelineErrorFromSupabase(error);
  }
  for (const item of itens) etapas.set(item.articleId, [...new Set([...(etapas.get(item.articleId) || []), item.stage])]);
  return etapas;
}

/** O grafo de links aprovado do Silo: só a prévia o cita (ele deixa de valer junto com o par). Tabela ausente = nenhum. */
async function readApprovedLinkGraphs(context: PipelineContext, siloIds: readonly string[]): Promise<TerritoryUndoLinkGraph[]> {
  if (!siloIds.length) return [];
  const result = await context.supabase
    .from("internal_link_graphs")
    .select("graph_version_id,silo_id,version_number,workflow_status")
    .eq("marca_id", context.brandId)
    .in("silo_id", [...siloIds]);
  if (result.error) return [];
  const aprovados = ((result.data || []) as Row[]).filter(row => row.workflow_status === "approved");
  const maisNovo = new Map<string, Row>();
  for (const row of aprovados) {
    const atual = maisNovo.get(String(row.silo_id));
    if (!atual || Number(row.version_number) > Number(atual.version_number)) maisNovo.set(String(row.silo_id), row);
  }
  return [...maisNovo.values()].map(row => ({ graphVersionId: String(row.graph_version_id), versionNumber: Number(row.version_number), siloId: String(row.silo_id) }));
}

/** O grupo editorial ligado a este Silo (`editorial_groups.silo_id`). Banco sem grupos = nenhum. */
async function readLinkedGroup(context: PipelineContext, siloIds: readonly string[]): Promise<TerritoryUndoLinkedGroup | null> {
  const result = await context.supabase
    .from("editorial_groups")
    .select("id,name,color,silo_id")
    .eq("marca_id", context.brandId)
    .in("silo_id", [...siloIds]);
  if (result.error) {
    if (isEditorialGroupsSchemaMissing(result.error)) return null;
    throw pipelineErrorFromSupabase(result.error);
  }
  const grupo = ((result.data || []) as Row[]).find(row => texto(row.silo_id));
  if (!grupo) return null;
  const cor = EDITORIAL_GROUP_COLOR_LABELS[grupo.color as EditorialGroupColor] ?? String(grupo.color ?? "");
  const nome = texto(grupo.name);
  return { groupId: String(grupo.id), groupLabel: `${cor}${nome && nome !== cor ? ` (${nome})` : ""}`, siloId: String(grupo.silo_id) };
}

/** Os grupos com plano declarado da marca, na forma da regra do Silo do plano (`null` quando o banco não tem grupos). */
export async function readDeclaredPlanGroupViews(context: PipelineContext): Promise<DeclaredPlanGroupView[] | null> {
  const lido = await listEditorialGroupPlans(context.supabase, context.brandId);
  if (!lido.ok) return null;
  return lido.groups.flatMap(group => {
    const plano = group.status === "active" ? readDeclaredSiloPlan(group.plan) : null;
    return plano ? [{ groupId: group.id, groupLabel: `${EDITORIAL_GROUP_COLOR_LABELS[group.color]}${group.name && group.name !== EDITORIAL_GROUP_COLOR_LABELS[group.color] ? ` (${group.name})` : ""}`, siloName: plano.siloName, siloSlug: plano.siloSlug, linkedTerritoryRef: group.siloId }] : [];
  });
}

async function readDeclaredPlanOfTerritory(context: PipelineContext, territory: TerritoryCandidate) {
  // Leitura que falha: a marca do plano no próprio território basta (fecha para o lado seguro).
  const planos = await readDeclaredPlanGroupViews(context).catch(() => null);
  /*
   * 2026-10-18 · o DUPLICADO do Silo do plano (o grupo está ligado a outro território vivo) não é o Silo do plano: o
   * "Desfazer Silo" de sempre o desfaz quando vazio. Leitura dos territórios que falha: sem ela, a regra de antes
   * (o duplicado conta como do plano — Silo inteiro, prévia e confirmação forte: fecha para o lado seguro).
   */
  const vivos = planos ? await listTerritoryWorkflowItems(context)
    .then(items => new Set(items.filter(item => item.territory.lifecycleStatus !== "rejected" && item.territory.lifecycleStatus !== "archived").map(item => item.territoryRef as string)))
    .catch(() => undefined) : undefined;
  return declaredPlanSiloGroupFor(declaredPlanViewOfTerritory(territory), planos, normalizeManualSiloPageSlug, vivos);
}

/** A base da prévia do Silo inteiro: mudou qualquer coisa (lock, artigo, par, grafo, grupo, membros), a decisão é outra. */
function wholeSiloDecisionHash(input: { brandId: string; territoryRef: string; lockVersion: number; memberKeywordIds: readonly string[]; plan: TerritoryUndoWholeSiloPlan }): string {
  return createHash("sha256").update(canonicalJson({
    contract: "territory-undo-whole-silo@1",
    brandId: input.brandId,
    territoryRef: input.territoryRef,
    lockVersion: input.lockVersion,
    members: [...input.memberKeywordIds].sort(),
    articles: input.plan.articles.map(article => `${article.versionId}:${article.published ? "p" : ""}:${article.downstreamStages.join("+")}`).sort(),
    pair: input.plan.pair.map(item => item.versionId).sort(),
    notices: [...input.plan.notices].sort(),
    graphs: input.plan.linkGraphs.map(graph => graph.graphVersionId).sort(),
    group: input.plan.group ? { groupId: input.plan.group.groupId, siloId: input.plan.group.siloId } : null,
  })).digest("hex");
}

/**
 * Lê, confere e planeja. Recusa com 409 e o motivo por extenso; nenhuma
 * escrita acontece aqui.
 */
export async function planTerritoryUndoForBrand(
  context: PipelineContext,
  territoryRef: string,
  expectedLock: number,
): Promise<ServerTerritoryUndoPlan> {
  const item = await readTerritoryWorkflowItem(context, territoryRef);
  if (!item) throw new PipelineRuntimeError("CONFLICT", "Este Silo não existe nesta marca.", 409);
  const nome = territoryUndoLabel(item.territory);
  // Lock vencido recusa ANTES de tocar em qualquer keyword: sem isso, as
  // keywords sairiam e o território ficaria de pé.
  if (item.lockVersion !== expectedLock) {
    throw new PipelineRuntimeError("CONFLICT", `${nome}: o Silo mudou desde a leitura. Recarregue e tente de novo.`, 409);
  }

  const linhas = await readMembers(context, territoryRef);
  const keywords = await readKeywordStatus(context, linhas.map(row => String(row.subject_id)));
  const members: TerritoryUndoMember[] = linhas.map(row => {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Row : {};
    const keyword = keywords.get(String(row.subject_id));
    return {
      keywordId: String(row.subject_id),
      label: texto(keyword?.keyword),
      isPublished: isArchitectKeywordPublished({ status: keyword?.status ?? null, canonicalWorkflow: { payload } }),
      editable: row.state === "received",
    };
  });

  const siloArtifacts = await readSiloArtifacts(context, item.territory);
  const siloIds = [...new Set([territoryRef, item.territory.consolidation?.siloId, item.territory.existingSiloRef?.siloId, ...siloArtifacts.map(artifact => artifact.siloId)].filter((id): id is string => Boolean(id)))];
  const artigos = await readArticles(context);
  // As etapas posteriores só dos artigos que podem ser deste Silo (aponta, compõe ou usa keyword membro).
  const membros = new Set(members.map(member => member.keywordId));
  const composicao = new Set(siloArtifacts.flatMap(artifact => [artifact.pillarArticleId, ...(artifact.articleIds || [])].filter((id): id is string => Boolean(id))));
  const candidatos = artigos.filter(article => article.territoryRef === territoryRef || siloIds.includes(article.siloId ?? "") || composicao.has(article.articleId) || article.keywordIds.some(id => membros.has(id)));
  const etapas = await readDownstream(context, candidatos.map(article => article.articleId));
  const approvedArticles = artigos.map(article => ({ ...article, downstreamStages: etapas.get(article.articleId) || [] }));

  const plano = planTerritoryUndo({
    territory: item.territory,
    members,
    approvedArticles,
    siloArtifacts,
    declaredPlan: await readDeclaredPlanOfTerritory(context, item.territory),
    linkGraphs: await readApprovedLinkGraphs(context, siloIds),
    linkedGroup: await readLinkedGroup(context, siloIds),
    actorUserId: context.actorUserId,
    decidedAt: new Date().toISOString(),
  });
  if (!plano.ok) {
    throw new PipelineRuntimeError("CONFLICT", `${nome} não pode ser desfeito: ${plano.refusals.map(refusal => refusal.message).join(" ")}`, 409);
  }

  return {
    scope: plano.scope,
    territoryDraft: plano.territoryDraft,
    memberKeywordIds: plano.memberKeywordIds,
    // Só o membro editável (recebido pelo Arquiteto) recebe a decisão de Silo; o de fora da etapa fica (a prévia diz).
    keywordUpdates: linhas.filter(row => row.state === "received").map(row => ({
      workflowItemId: String(row.id),
      expectedLock: Number(row.lock_version),
      assignment: { territoryRef: null, territoryAssignment: plano.keywordDecision },
    })),
    wholeSilo: plano.wholeSilo
      ? { ...plano.wholeSilo, decisionHash: wholeSiloDecisionHash({ brandId: context.brandId, territoryRef, lockVersion: item.lockVersion, memberKeywordIds: plano.memberKeywordIds, plan: plano.wholeSilo }) }
      : null,
  };
}

/** A prévia (o que a tela mostra antes da confirmação). */
export function territoryUndoPreviewOf(territoryRef: string, plan: ServerTerritoryUndoPlan, label: string): TerritoryUndoPreview {
  return { territoryRef, scope: plan.scope, label, memberCount: plan.memberKeywordIds.length, wholeSilo: plan.wholeSilo };
}

/* ======================================================================== */
/* O SILO INTEIRO NA GRAVAÇÃO — confirmação, eventos, grupo e releitura.     */
/* ======================================================================== */

export type TerritoryUndoWriteDeps = {
  /** O writer do evento de status (o mesmo de "Retirar artigo do Silo"). */
  appendEvents: (events: VersionStatusEvent[]) => Promise<void>;
  /** Rejeitar versão vigente de ArticleDNA é decisão sobre o artefato: exige `arquiteto:approve`. */
  canApprove: () => Promise<boolean>;
  now: () => string;
};

/** As dependências reais, sobre o contexto já autorizado da rota. */
export function territoryUndoWriteRuntime(context: PipelineContext): TerritoryUndoWriteDeps {
  return {
    appendEvents: events => new ArtifactRepository().appendEvents(context.brandId, events, context.actorUserId),
    canApprove: async () => {
      if (context.action === "approve") return true;
      const result = await context.supabase.rpc("canonical_actor_can_use_brand_action", {
        target_brand_id: context.brandId,
        target_actor_user_id: context.actorUserId,
        requested_module: "arquiteto",
        requested_action: "approve",
      });
      return !result.error && result.data === true;
    },
    now: () => new Date().toISOString(),
  };
}

/**
 * O Silo inteiro só grava sobre a prévia vigente e com o nome do Silo
 * digitado (a regra de confirmação da plataforma: `typedConfirmationMatches`,
 * a mesma da tela). Recusa ANTES de qualquer escrita.
 */
export async function assertWholeSiloUndoConfirmed(
  plan: ServerTerritoryUndoPlan,
  confirmation: { decisionHash?: string | null; typedName?: string | null },
  deps: Pick<TerritoryUndoWriteDeps, "canApprove">,
): Promise<void> {
  const silo = plan.wholeSilo;
  if (!silo) return;
  if (!confirmation.decisionHash || !confirmation.typedName) {
    throw new PipelineRuntimeError("CONFLICT", `Desfazer “${silo.siloName}” tira o Silo inteiro (${silo.articles.length} artigo(s), o par e o grafo): abra a prévia, confira e digite o nome do Silo para confirmar. Nada foi gravado.`, 409);
  }
  if (confirmation.decisionHash !== silo.decisionHash) {
    throw new PipelineRuntimeError("CONFLICT", `“${silo.siloName}” mudou desde a prévia. Abra a prévia de novo; nada foi gravado.`, 409);
  }
  if (!typedConfirmationMatches(confirmation.typedName, silo.confirmationName)) {
    throw new PipelineRuntimeError("CONFLICT", `Nada foi gravado: falta digitar o nome do Silo (“${silo.confirmationName}”).`, 409);
  }
  if (!await deps.canApprove()) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "Desfazer o Silo inteiro rejeita a versão vigente dos ArticleDNA: precisa da permissão de aprovar no Arquiteto. Nada foi gravado.", 403);
  }
}

/** Os eventos `rejected` do Silo inteiro, gravados pelo writer de sempre (id determinístico: repetir não duplica). */
export async function writeWholeSiloUndoRejections(
  context: PipelineContext,
  territoryRef: string,
  plan: ServerTerritoryUndoPlan,
  deps: Pick<TerritoryUndoWriteDeps, "appendEvents" | "now">,
): Promise<VersionStatusEvent[]> {
  if (!plan.wholeSilo) return [];
  const eventos = await buildTerritoryUndoRejections(plan.wholeSilo, { territoryRef, actorId: context.actorUserId, occurredAt: deps.now() });
  if (eventos.length) await deps.appendEvents(eventos);
  return eventos;
}

/** O grupo desligado do Silo pelo writer de sempre; desligado antes (ou sem grupo) = nada a fazer. */
export async function unlinkWholeSiloGroup(context: PipelineContext, plan: ServerTerritoryUndoPlan): Promise<boolean> {
  const grupo = plan.wholeSilo?.group;
  if (!grupo) return false;
  const desligado = await unlinkEditorialGroupSilo(context.supabase, { brandId: context.brandId, actorUserId: context.actorUserId, groupId: grupo.groupId, siloId: grupo.siloId });
  if (!desligado.ok) throw new PipelineRuntimeError("CONFLICT", `O grupo ${grupo.groupLabel} não pôde ser desligado do Silo: ${desligado.message} Os artigos e o par já saíram; abra a prévia de novo para terminar.`, 409);
  return desligado.changed;
}

/**
 * ADIANTE E ETIQUETAS (2026-10-18): o item do artigo no Radar/Redator/Publicações
 * sai da operação (`withdrawDownstreamItems`, a investigação fica como
 * histórico) e o artigo retirado perde a etiqueta da cor (`deleteArticleGroupRows`,
 * o writer de sempre) — sem isso a cor ficaria presa por "artigo etiquetado".
 */
export async function writeWholeSiloDownstream(
  context: PipelineContext,
  plan: ServerTerritoryUndoPlan,
  deps: Pick<TerritoryUndoWriteDeps, "now">,
): Promise<{ downstream: DownstreamWithdrawalOutcome; untagged: string[] }> {
  const silo = plan.wholeSilo;
  if (!silo) return { downstream: { withdrawn: [], failed: [] }, untagged: [] };
  const adiante = silo.articles.filter(article => article.downstreamStages.length).map(article => article.articleId);
  const downstream = adiante.length
    ? await withdrawDownstreamItems(context.supabase, { brandId: context.brandId, actorUserId: context.actorUserId, articleIds: adiante, reason: `Silo “${silo.siloName}” desfeito inteiro por decisão humana: o artigo saiu de vigência no Arquiteto.`, at: deps.now() })
    : { withdrawn: [], failed: [] };
  if (downstream.failed.length) {
    throw new PipelineRuntimeError("CONFLICT", `${downstream.failed.length} item(ns) adiante não saíram da operação (${downstream.failed.map(item => `${item.articleId} no ${item.stage}: ${item.message}`).join("; ")}). Os artigos e o par já saíram; abra a prévia de novo para terminar.`, 409);
  }
  let untagged: string[] = [];
  const artigos = silo.articles.map(article => article.articleId);
  if (artigos.length) {
    const tirado = await deleteArticleGroupRows(context.supabase, { brandId: context.brandId, articleIds: artigos });
    untagged = tirado.ok ? tirado.confirmed : [];
  }
  return { downstream, untagged };
}

/**
 * RELEITURA do Silo inteiro: sem ela não há sucesso. Os eventos voltaram
 * (`rejected`, na versão certa), o território está desfeito, o grupo não
 * aponta mais para o Silo e nenhum item adiante dos artigos ficou ativo.
 */
export async function readBackWholeSiloUndo(
  context: PipelineContext,
  territoryRef: string,
  plan: ServerTerritoryUndoPlan,
  events: readonly VersionStatusEvent[],
): Promise<{ rejectedVersionIds: string[]; groupUnlinked: boolean; downstreamActive: number }> {
  const divergencias: string[] = [];
  const adiante = (plan.wholeSilo?.articles || []).filter(article => article.downstreamStages.length).map(article => article.articleId);
  const ativos = adiante.length ? await readActiveDownstreamItems(context.supabase, context.brandId, adiante).catch(() => null) : [];
  if (ativos === null) divergencias.push("os itens adiante não puderam ser relidos");
  else if (ativos.length) divergencias.push(`${ativos.length} item(ns) adiante ainda ativo(s)`);
  const lidos = new Map<string, { versionId: string; status: string }>();
  for (let inicio = 0; inicio < events.length; inicio += BATCH) {
    const result = await context.supabase
      .from("editorial_version_status_events")
      .select("id,version_id,status")
      .in("id", events.slice(inicio, inicio + BATCH).map(event => event.eventId));
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    for (const row of (result.data || []) as Row[]) lidos.set(String(row.id), { versionId: String(row.version_id ?? ""), status: String(row.status ?? "") });
  }
  const faltam = events.filter(event => { const lido = lidos.get(event.eventId); return !lido || lido.status !== "rejected" || lido.versionId !== event.versionId; });
  if (faltam.length) divergencias.push(`${faltam.length} evento(s) “rejeitado” não voltaram na releitura`);
  const territorio = await readTerritoryWorkflowItem(context, territoryRef);
  if (territorio?.territory.lifecycleStatus !== "rejected") divergencias.push("o território não voltou desfeito");
  let groupUnlinked = true;
  const grupo = plan.wholeSilo?.group;
  if (grupo) {
    const ainda = await readLinkedGroup(context, [grupo.siloId]);
    groupUnlinked = !ainda;
    if (ainda) divergencias.push(`o grupo ${grupo.groupLabel} ainda aponta para o Silo`);
  }
  if (divergencias.length) {
    throw new PipelineRuntimeError("QUERY_FAILURE", `O Desfazer do Silo inteiro não foi confirmado pela releitura: ${divergencias.join("; ")}. Abra a prévia de novo para terminar (nada foi apagado).`, 503);
  }
  return { rejectedVersionIds: events.map(event => event.versionId), groupUnlinked, downstreamActive: ativos?.length ?? 0 };
}

/* ======================================================================== */
/* 2026-10-18 · O MESMO NÚCLEO DESMONTA O ARQUITETO PARA A EXCLUSÃO DO       */
/* MINERADOR ("Excluir" / "Excluir tudo da cor"). Decisão do dono: "tem que   */
/* poder apagar … não interessa qual seja o estado".                          */
/* ======================================================================== */

export type ArchitectDismantlePlan = {
  keywordIds: string[];
  /** Silos desfeitos inteiros (todos os artigos ou o Pilar saem; ou o Silo da cor inteira). */
  silos: Array<{ territoryRef: string; lockVersion: number; label: string; plan: ServerTerritoryUndoPlan }>;
  /** Artigos que saem de um Silo que fica com os outros ("Retirar artigo do Silo"). */
  withdrawals: Array<{ siloId: string; siloName: string; articleId: string; label: string; downstreamStages: string[] }>;
  /** Artigos sem Silo vigente: só o evento `rejected`. */
  looseArticles: Array<{ articleId: string; versionId: string; label: string; downstreamStages: string[]; published: boolean }>;
  /** Documentos do Redator dos artigos que saem (ficam como histórico). */
  documents: Array<{ articleId: string; label: string; count: number }>;
  preview: ArchitectDismantlePreview;
};

export type ArchitectDismantleDeps = TerritoryUndoWriteDeps & {
  /** O PATCH canônico da mesa (o "Desfazer Silo" de sempre). */
  patchWorkspace: (body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;
  /** "Retirar artigo do Silo" de sempre (prévia não; aplica). */
  withdrawArticle: (input: { siloId: string; articleId: string; reason: string }) => Promise<{ ok: true } | { ok: false; message: string }>;
};

const ROTULO_ETAPA: Record<string, string> = { radar: "Radar", writer: "Redator", publications: "Publicações" };

async function readDocumentsOf(context: PipelineContext, articleIds: readonly string[]): Promise<Map<string, number>> {
  const contagem = new Map<string, number>();
  const unicos = [...new Set(articleIds)];
  for (let inicio = 0; inicio < unicos.length; inicio += BATCH) {
    const result = await context.supabase.from("content_documents").select("id,article_id").eq("marca_id", context.brandId).in("article_id", unicos.slice(inicio, inicio + BATCH));
    if (result.error) return contagem;
    for (const row of (result.data || []) as Row[]) {
      const id = texto(row.article_id);
      if (id) contagem.set(id, (contagem.get(id) || 0) + 1);
    }
  }
  return contagem;
}

/** O território vivo de um artigo: pelo `territoryRef` ou pelo id do Silo (consolidação, registro anterior). */
function territorioDoArtigo(article: TerritoryUndoApprovedArticle, territorios: ReadonlyArray<{ territoryRef: string; territory: TerritoryCandidate }>) {
  return territorios.find(item => item.territoryRef === article.territoryRef)
    ?? territorios.find(item => article.siloId && (item.territoryRef === article.siloId || item.territory.consolidation?.siloId === article.siloId || item.territory.existingSiloRef?.siloId === article.siloId))
    ?? null;
}

/**
 * A PRÉVIA do desmonte para estas keywords (só leitura, grátis). Cada artigo
 * vigente que cita uma delas sai; o Silo dele sai inteiro quando todos os
 * artigos dele saem, quando o Pilar sai ou quando é o Silo da cor inteira
 * (`linkedTerritoryRef`); senão o artigo sai do Silo pela "Retirar artigo do
 * Silo" de sempre. Artigo sem Silo vivo: só o evento `rejected`.
 */
export async function planArchitectDismantleForKeywords(
  context: PipelineContext,
  input: { keywordIds: readonly string[]; linkedTerritoryRef?: string | null },
): Promise<ArchitectDismantlePlan> {
  const alvo = new Set(input.keywordIds);
  const artigos = await readArticles(context);
  const citam = artigos.filter(article => !["rejected", "superseded"].includes(article.status ?? "") && article.keywordIds.some(id => alvo.has(id)));
  const territorios = (await listTerritoryWorkflowItems(context))
    .filter(item => ["candidate", "confirmed", "consolidated"].includes(item.territory.lifecycleStatus));

  const porTerritorio = new Map<string, TerritoryUndoApprovedArticle[]>();
  const soltos: TerritoryUndoApprovedArticle[] = [];
  for (const article of citam) {
    const territorio = territorioDoArtigo(article, territorios);
    if (territorio) porTerritorio.set(territorio.territoryRef, [...(porTerritorio.get(territorio.territoryRef) || []), article]);
    else soltos.push(article);
  }
  const linked = input.linkedTerritoryRef && territorios.some(item => item.territoryRef === input.linkedTerritoryRef) ? input.linkedTerritoryRef : null;
  if (linked && !porTerritorio.has(linked)) porTerritorio.set(linked, []);

  const silos: ArchitectDismantlePlan["silos"] = [];
  const withdrawals: ArchitectDismantlePlan["withdrawals"] = [];
  for (const [territoryRef, saem] of [...porTerritorio.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const item = territorios.find(entrada => entrada.territoryRef === territoryRef)!;
    const plano = await planTerritoryUndoForBrand(context, territoryRef, item.lockVersion);
    const doSilo = plano.wholeSilo?.articles ?? [];
    const idsQueSaem = new Set(saem.map(article => article.articleId));
    const pilar = doSilo.find(article => article.role === "Pilar");
    const inteiro = territoryRef === linked || !doSilo.length || doSilo.every(article => idsQueSaem.has(article.articleId)) || Boolean(pilar && idsQueSaem.has(pilar.articleId));
    if (inteiro && (plano.wholeSilo || territoryRef === linked)) {
      silos.push({ territoryRef, lockVersion: item.lockVersion, label: territoryUndoLabel(item.territory), plan: plano });
      continue;
    }
    const temPar = Boolean(plano.wholeSilo?.pair.some(entrada => entrada.kind === "silo_dna"));
    for (const article of saem) {
      if (temPar) withdrawals.push({ siloId: plano.wholeSilo!.pair.find(entrada => entrada.kind === "silo_dna")!.siloId ?? territoryRef, siloName: territoryUndoLabel(item.territory), articleId: article.articleId, label: article.label || article.articleId, downstreamStages: [] });
      else soltos.push(article);
    }
  }

  // As etapas adiante e os documentos de quem sai fora dos Silos inteiros.
  const foraDosInteiros = [...withdrawals.map(item => item.articleId), ...soltos.map(article => article.articleId)];
  const etapas = await readDownstream(context, foraDosInteiros);
  for (const item of withdrawals) item.downstreamStages = etapas.get(item.articleId) || [];
  const looseArticles = soltos
    .filter((article, indice, todos) => todos.findIndex(outro => outro.articleId === article.articleId) === indice && article.versionId)
    .map(article => ({ articleId: article.articleId, versionId: article.versionId as string, label: article.label || article.articleId, downstreamStages: etapas.get(article.articleId) || [], published: Boolean(article.published) }));
  const todosQueSaem = [...new Set([...silos.flatMap(silo => silo.plan.wholeSilo?.articles.map(article => article.articleId) ?? []), ...foraDosInteiros])];
  const rotulo = new Map<string, string>();
  for (const silo of silos) for (const article of silo.plan.wholeSilo?.articles ?? []) rotulo.set(article.articleId, article.label);
  for (const item of withdrawals) rotulo.set(item.articleId, item.label);
  for (const item of looseArticles) rotulo.set(item.articleId, item.label);
  const docs = await readDocumentsOf(context, todosQueSaem);
  const documents = [...docs.entries()].map(([articleId, count]) => ({ articleId, label: rotulo.get(articleId) || articleId, count })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  // O ALERTA, por área.
  const areas: ArchitectDismantlePreview["areas"] = { arquiteto: [], radar: [], redator: [], publicacoes: [] };
  const adiante = new Map<string, { label: string; stages: Set<string> }>();
  const publicados = new Map<string, string>();
  for (const silo of silos) {
    const s = silo.plan.wholeSilo;
    if (!s) {
      areas.arquiteto.push(`Silo “${silo.label}”: sai (desfeito); ${silo.plan.memberKeywordIds.length} keyword(s) voltam para “sem Silo”.`);
      continue;
    }
    const pilar = s.articles.some(article => article.role === "Pilar");
    areas.arquiteto.push(`Silo “${silo.label}”: sai inteiro — ${s.articles.length} artigo(s)${pilar ? " (Pilar incluído)" : ""}${s.articles.length ? `: ${s.articles.map(article => `“${article.label}”`).join(", ")}` : ""}; ${s.pair.length ? "SiloDNA e SiloPage" : "o território"}${s.linkGraphs.length ? " e o grafo de links" : ""} deixam de valer${s.group ? `; o grupo ${s.group.groupLabel} é desligado do Silo` : ""}. As versões ficam como histórico.`);
    for (const article of s.articles) {
      if (article.published) publicados.set(article.articleId, article.label);
      if (article.downstreamStages.length) adiante.set(article.articleId, { label: article.label, stages: new Set(article.downstreamStages) });
    }
  }
  for (const item of withdrawals) {
    areas.arquiteto.push(`“${item.label}” sai do Silo “${item.siloName}” (o Silo fica com os outros artigos; SiloDNA e SiloPage ganham a versão seguinte sem ele).`);
    if (item.downstreamStages.length) adiante.set(item.articleId, { label: item.label, stages: new Set(item.downstreamStages) });
  }
  for (const item of looseArticles) {
    areas.arquiteto.push(`“${item.label}” (sem Silo vigente) sai de vigência (ArticleDNA “rejeitado”; a versão fica como histórico).`);
    if (item.published) publicados.set(item.articleId, item.label);
    if (item.downstreamStages.length) adiante.set(item.articleId, { label: item.label, stages: new Set(item.downstreamStages) });
  }
  for (const [, item] of adiante) {
    for (const stage of item.stages) {
      const linha = `“${item.label}”: o item sai da operação do ${ROTULO_ETAPA[stage] || stage} (“retirado”); a investigação e o histórico ficam.`;
      (stage === "radar" ? areas.radar : stage === "writer" ? areas.redator : areas.publicacoes).push(linha);
    }
  }
  for (const doc of documents) areas.redator.push(`“${doc.label}”: ${doc.count} documento(s) do Redator ficam como histórico (o documento não é apagado).`);
  for (const [, label] of publicados) areas.publicacoes.push(`“${label}” está publicado: no site nada muda (URL, slug e canonical ficam); a keyword publicada vai para a lixeira de 24 h.`);
  const lines = [
    ...areas.arquiteto.map(linha => `Arquiteto · ${linha}`),
    ...areas.radar.map(linha => `Radar · ${linha}`),
    ...areas.redator.map(linha => `Redator · ${linha}`),
    ...areas.publicacoes.map(linha => `Publicações · ${linha}`),
  ];

  const coberto = new Set<string>();
  for (const article of citam) for (const id of article.keywordIds) if (alvo.has(id)) coberto.add(id);
  const preview: ArchitectDismantlePreview = {
    keywordIds: [...coberto].sort(),
    articleIds: todosQueSaem.sort(),
    territoryRefs: silos.map(silo => silo.territoryRef),
    untagArticleIds: todosQueSaem,
    unlinkGroupIds: silos.flatMap(silo => silo.plan.wholeSilo?.group ? [silo.plan.wholeSilo.group.groupId] : []),
    areas,
    lines,
    basis: {
      operation: "architect_dismantle@1",
      silos: silos.map(silo => `${silo.territoryRef}:${silo.lockVersion}:${silo.plan.wholeSilo?.decisionHash ?? "sugerido"}`),
      withdrawals: withdrawals.map(item => `${item.siloId}:${item.articleId}`).sort(),
      loose: looseArticles.map(item => item.versionId).sort(),
      downstream: [...adiante.entries()].map(([id, item]) => `${id}:${[...item.stages].sort().join("+")}`).sort(),
      documents: documents.map(doc => `${doc.articleId}:${doc.count}`),
    },
  };
  return { keywordIds: [...alvo], silos, withdrawals, looseArticles, documents, preview };
}

/**
 * O DESMONTE, sobre a MESMA base da prévia. Ordem: os Silos inteiros (o PATCH
 * de sempre, que relê), os artigos que saem de um Silo que fica ("Retirar
 * artigo do Silo"), os artigos sem Silo (evento `rejected`), os itens adiante
 * e as etiquetas. Para no primeiro passo que falha e diz o que foi feito.
 */
export async function applyArchitectDismantle(
  context: PipelineContext,
  input: { keywordIds: readonly string[]; linkedTerritoryRef?: string | null; basis: Record<string, unknown> },
  deps: ArchitectDismantleDeps,
): Promise<ArchitectDismantleResult> {
  const plano = await planArchitectDismantleForKeywords(context, input);
  if (canonicalJson(plano.preview.basis) !== canonicalJson(input.basis)) {
    return { ok: false, applied: [], notApplied: plano.preview.lines, message: "o Arquiteto mudou desde a prévia" };
  }
  const feito: string[] = [];
  const pendente = (desde: number, linhas: string[]) => linhas.slice(desde);
  const etapas: string[] = [
    ...plano.silos.map(silo => `Silo “${silo.label}” desfeito`),
    ...plano.withdrawals.map(item => `“${item.label}” retirado do Silo “${item.siloName}”`),
    ...plano.looseArticles.map(item => `“${item.label}” fora de vigência`),
  ];
  let passo = 0;
  try {
    for (const silo of plano.silos) {
      const corpo = silo.plan.wholeSilo
        ? { brandId: context.brandId, territoryUndos: [{ territoryRef: silo.territoryRef, expectedLock: silo.lockVersion, decisionHash: silo.plan.wholeSilo.decisionHash, typedName: silo.plan.wholeSilo.confirmationName }] }
        : { brandId: context.brandId, territoryUndos: [{ territoryRef: silo.territoryRef, expectedLock: silo.lockVersion }] };
      const resposta = await deps.patchWorkspace(corpo);
      if (resposta.status !== 200 || resposta.body.success !== true) {
        return { ok: false, applied: feito, notApplied: pendente(passo, etapas), message: typeof resposta.body.error === "string" ? resposta.body.error : `o Silo “${silo.label}” não foi desfeito` };
      }
      feito.push(etapas[passo++]);
    }
    for (const item of plano.withdrawals) {
      const retirado = await deps.withdrawArticle({ siloId: item.siloId, articleId: item.articleId, reason: "Keyword excluída no Minerador por decisão humana." });
      if (!retirado.ok) return { ok: false, applied: feito, notApplied: pendente(passo, etapas), message: retirado.message };
      feito.push(etapas[passo++]);
    }
    const eventos = await Promise.all(plano.looseArticles.map(item => buildLooseArticleRejection({ versionId: item.versionId, label: item.label, actorId: context.actorUserId, occurredAt: deps.now() })));
    if (eventos.length) await deps.appendEvents(eventos);
    for (let indice = 0; indice < plano.looseArticles.length; indice += 1) feito.push(etapas[passo++]);
    // Adiante (de quem saiu fora dos Silos inteiros: o PATCH já tirou os dele) e as etiquetas.
    const adiante = [...plano.withdrawals.filter(item => item.downstreamStages.length).map(item => item.articleId), ...plano.looseArticles.filter(item => item.downstreamStages.length).map(item => item.articleId)];
    if (adiante.length) {
      const retirados = await withdrawDownstreamItems(context.supabase, { brandId: context.brandId, actorUserId: context.actorUserId, articleIds: adiante, reason: "Keyword excluída no Minerador por decisão humana: o artigo saiu de vigência no Arquiteto.", at: deps.now() });
      if (retirados.failed.length) return { ok: false, applied: feito, notApplied: retirados.failed.map(item => `${item.articleId} no ${ROTULO_ETAPA[item.stage] || item.stage}: ${item.message}`), message: "itens adiante não saíram da operação" };
      if (retirados.withdrawn.length) feito.push(`${retirados.withdrawn.length} item(ns) adiante retirado(s) da operação`);
    }
    const foraDosInteiros = [...plano.withdrawals.map(item => item.articleId), ...plano.looseArticles.map(item => item.articleId)];
    if (foraDosInteiros.length) await deleteArticleGroupRows(context.supabase, { brandId: context.brandId, articleIds: foraDosInteiros });
  } catch (error) {
    return { ok: false, applied: feito, notApplied: pendente(passo, etapas), message: error instanceof Error ? error.message : "falha no desmonte" };
  }
  // Releitura: nenhum artigo que devia sair continua vigente.
  const relidos = await readArticles(context);
  const vigentes = relidos.filter(article => plano.preview.articleIds.includes(article.articleId) && !["rejected", "superseded"].includes(article.status ?? ""));
  if (vigentes.length) return { ok: false, applied: feito, notApplied: vigentes.map(article => `“${article.label || article.articleId}” ainda vigente`), message: "a releitura ainda mostra artigo vigente" };
  return { ok: true, applied: feito };
}

/**
 * A PORTA que o Minerador usa (o contrato `lib/minerador/architect-dismantle.ts`).
 * O contexto do Arquiteto é resolvido com `arquiteto:approve` — rejeitar a
 * versão vigente de um ArticleDNA é decisão sobre o artefato; sem a permissão,
 * a prévia diz isso (nada de recusa por estado).
 */
export function architectDismantlePort(resolveContext: () => Promise<PipelineContext>, overrides: Partial<ArchitectDismantleDeps> = {}): ArchitectDismantlePort {
  const pick = (origem: Partial<ArchitectDismantleDeps>): Partial<TerritoryUndoWriteDeps> => ({
    ...(origem.appendEvents ? { appendEvents: origem.appendEvents } : {}),
    ...(origem.canApprove ? { canApprove: origem.canApprove } : {}),
    ...(origem.now ? { now: origem.now } : {}),
  });
  let lido: Promise<PipelineContext> | null = null;
  const contexto = () => (lido ??= resolveContext());
  const deps = async (context: PipelineContext): Promise<ArchitectDismantleDeps> => {
    const { handleArchitectWorkspacePatch } = await import("./arquiteto-workspace-http");
    const { handleSiloArticleWithdrawal, siloArticleWithdrawalRuntime } = await import("./arquiteto-silo-article-withdrawal");
    const escrita: TerritoryUndoWriteDeps = { ...territoryUndoWriteRuntime(context), ...pick(overrides) };
    return {
      ...escrita,
      // O PATCH de sempre, com os MESMOS writers desta porta (o evento de status e a permissão).
      patchWorkspace: async body => {
        const resposta = await handleArchitectWorkspacePatch(new Request("http://localhost/api/arquiteto/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), context, { territoryUndo: escrita });
        return { status: resposta.status, body: await resposta.json().catch(() => ({})) as Record<string, unknown> };
      },
      withdrawArticle: async entrada => {
        const resultado = await handleSiloArticleWithdrawal(siloArticleWithdrawalRuntime(context), { siloId: entrada.siloId, articleId: entrada.articleId, reason: entrada.reason, mode: "apply" });
        return resultado.state === "APPLIED" ? { ok: true as const } : { ok: false as const, message: resultado.state === "REFUSED" ? resultado.message : "a retirada não foi aplicada" };
      },
      ...overrides,
    };
  };
  return {
    preview: async entrada => {
      let context: PipelineContext;
      try { context = await contexto(); } catch {
        return { ok: false, message: "Esta keyword está num artigo do Arquiteto: excluí-la desmonta o artigo lá, e isso pede a permissão de aprovar no Arquiteto." };
      }
      try {
        const plano = await planArchitectDismantleForKeywords(context, { keywordIds: entrada.keywordIds, linkedTerritoryRef: entrada.linkedTerritoryRef });
        return { ok: true, preview: plano.preview };
      } catch (error) {
        return { ok: false, message: `A prévia do Arquiteto não pôde ser lida agora (${error instanceof Error ? error.message : "falha na leitura"}).` };
      }
    },
    apply: async entrada => {
      let context: PipelineContext;
      try { context = await contexto(); } catch {
        return { ok: false, applied: [], notApplied: [], message: "falta a permissão de aprovar no Arquiteto" };
      }
      return applyArchitectDismantle(context, entrada, await deps(context));
    },
  };
}

/** A porta do desmonte para as rotas do Minerador: o contexto do Arquiteto com `arquiteto:approve`, da sessão. */
export function architectDismantlePortForBrand(brandId: string): ArchitectDismantlePort {
  return architectDismantlePort(() => resolvePipelineContext({ brandId, module: "arquiteto", action: "approve" }));
}
