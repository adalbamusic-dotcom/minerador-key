import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { readTerritoryWorkflowItem } from "./arquiteto-territory-store";
import { isArchitectKeywordPublished } from "@/lib/arquiteto/published-identity";
import {
  planTerritoryUndo,
  territoryUndoLabel,
  type TerritoryUndoApprovedArticle,
  type TerritoryUndoMember,
  type TerritoryUndoSiloArtifact,
} from "@/lib/arquiteto/territory-undo";
import type { KeywordTerritoryDecision } from "@/lib/arquiteto/territory";

/**
 * DESFAZER SILO SUGERIDO — a leitura e o plano no SERVIDOR.
 *
 * Tudo o que decide a recusa é lido aqui, do banco, filtrado pela Brand do
 * contexto autenticado: o território, as keywords que apontam para ele, os
 * ArticleDNA aprovados e os SiloDNA/SiloPage do território. O corpo da
 * requisição traz só o ref e o lock.
 *
 * Esta função NÃO grava. Quem grava é a rota do workspace, pelos MESMOS
 * writers da decisão de Silo (item da keyword) e do lifecycle do território,
 * cada um com o seu lock — e só depois que este plano passou inteiro.
 */

type Row = Record<string, unknown>;

export type TerritoryUndoKeywordUpdate = {
  workflowItemId: string;
  expectedLock: number;
  assignment: { territoryRef: null; territoryAssignment: KeywordTerritoryDecision };
};

export type ServerTerritoryUndoPlan = {
  territoryDraft: Record<string, unknown>;
  keywordUpdates: TerritoryUndoKeywordUpdate[];
  memberKeywordIds: string[];
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
 * envelope não pode escapar da recusa.
 */
const ARTICLE_COLUMNS = "version_id,p_articleId:payload->>articleId,p_territoryRef:payload->>territoryRef,p_principalKeywordId:payload->>principalKeywordId,p_secondaryKeywordIds:payload->secondaryKeywordIds,p_narrativeReinforcementIds:payload->narrativeReinforcementIds,p_slug:payload->>suggestedSlug,e_articleId:payload->payload->>articleId,e_territoryRef:payload->payload->>territoryRef,e_principalKeywordId:payload->payload->>principalKeywordId,e_secondaryKeywordIds:payload->payload->secondaryKeywordIds,e_narrativeReinforcementIds:payload->payload->narrativeReinforcementIds,e_slug:payload->payload->>suggestedSlug";
const SILO_COLUMNS = "version_id,artifact_type,status,p_territoryRef:payload->>territoryRef,p_publicationStatus:payload->>publicationStatus,e_territoryRef:payload->payload->>territoryRef,e_publicationStatus:payload->payload->>publicationStatus";
const corpo = (row: Row, campo: string) => row[`p_${campo}`] ?? row[`e_${campo}`] ?? null;

async function readApprovedArticles(context: PipelineContext): Promise<TerritoryUndoApprovedArticle[]> {
  const artigos: TerritoryUndoApprovedArticle[] = [];
  for (let inicio = 0; ; inicio += PAGE) {
    const result = await context.supabase
      .from("editorial_artifact_versions")
      .select(ARTICLE_COLUMNS)
      .eq("marca_id", context.brandId)
      .eq("artifact_type", "article_dna")
      .eq("status", "approved")
      .order("version_id")
      .range(inicio, inicio + PAGE - 1);
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    const linhas = (result.data || []) as Row[];
    for (const row of linhas) {
      artigos.push({
        articleId: texto(corpo(row, "articleId")) || String(row.version_id),
        label: texto(corpo(row, "slug")),
        territoryRef: texto(corpo(row, "territoryRef")),
        keywordIds: [texto(corpo(row, "principalKeywordId")), ...ids(corpo(row, "secondaryKeywordIds")), ...ids(corpo(row, "narrativeReinforcementIds"))]
          .filter((id): id is string => Boolean(id)),
      });
    }
    if (linhas.length < PAGE) return artigos;
  }
}

async function readSiloArtifacts(context: PipelineContext, territoryRef: string): Promise<TerritoryUndoSiloArtifact[]> {
  // Sem filtro por `payload->>territoryRef` no banco: ele não enxergaria o
  // envelope. A marca tem poucos SiloDNA/SiloPage; o filtro vem depois.
  const artefatos: TerritoryUndoSiloArtifact[] = [];
  for (let inicio = 0; ; inicio += PAGE) {
    const result = await context.supabase
      .from("editorial_artifact_versions")
      .select(SILO_COLUMNS)
      .eq("marca_id", context.brandId)
      .in("artifact_type", ["silo_dna", "silo_page"])
      .order("version_id")
      .range(inicio, inicio + PAGE - 1);
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    const linhas = (result.data || []) as Row[];
    for (const row of linhas) {
      if (texto(corpo(row, "territoryRef")) !== territoryRef) continue;
      artefatos.push({
        kind: row.artifact_type === "silo_page" ? "silo_page" as const : "silo_dna" as const,
        territoryRef: texto(corpo(row, "territoryRef")),
        status: String(row.status ?? ""),
        published: corpo(row, "publicationStatus") === "published",
      });
    }
    if (linhas.length < PAGE) return artefatos;
  }
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

  const plano = planTerritoryUndo({
    territory: item.territory,
    members,
    approvedArticles: await readApprovedArticles(context),
    siloArtifacts: await readSiloArtifacts(context, territoryRef),
    actorUserId: context.actorUserId,
    decidedAt: new Date().toISOString(),
  });
  if (!plano.ok) {
    throw new PipelineRuntimeError("CONFLICT", `${nome} não pode ser desfeito: ${plano.refusals.map(refusal => refusal.message).join(" ")}`, 409);
  }

  return {
    territoryDraft: plano.territoryDraft,
    memberKeywordIds: plano.memberKeywordIds,
    keywordUpdates: linhas.map(row => ({
      workflowItemId: String(row.id),
      expectedLock: Number(row.lock_version),
      assignment: { territoryRef: null, territoryAssignment: plano.keywordDecision },
    })),
  };
}
