import "server-only";

/**
 * F5 · A PORTA DO BANCO da adoção da versão nova no Radar
 * (`radar-architect-adoption.ts`). Leitura por SELECT; a única escrita de
 * linha é a do item `stage = radar` (com trava otimista), a corrida da versão
 * nova da análise e o evento. O Arquiteto não é escrito.
 */

import type { ArticleDNA, InternalLinkGraph, SiloDNA, SiloPage, VersionEnvelope } from "../arquiteto/contracts";
import { VersionedSiloDNASchema, VersionedSiloPageSchema } from "../arquiteto/contracts";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
import { ArtifactRepository } from "./editorial-repositories";
import { buildCanonicalIndex } from "./global-workflow-canonical";
import { readInternalLinkGraph } from "./internal-link-graph-persistence";
import type { PipelineContext } from "./pipeline-runtime";
import type { RadarAdoptionItemHead, RadarAdoptionItemRow, RadarArchitectAdoptionStore } from "./radar-architect-adoption";

type Db = ReturnType<typeof getOperationalClient>;

const BLOCO = 100;
const COLUNAS_DO_ITEM = "id,marca_id,article_id,stage,state,lock_version,source_entity_id,source_version_id,source_content_hash,created_at,updated_at,payload";

type LinhaDeArtefato = {
  version_id: string; entity_id: string; version_number: number; previous_version_id: string | null;
  content_hash: string; origin: string; change_reason: string; created_by: string; created_at: string; payload: unknown;
};

/** O envelope gravado; sem ele (linha antiga), o envelope montado das colunas — a mesma tolerância do repositório. */
function envelopeDaLinha(linha: LinhaDeArtefato): Record<string, unknown> {
  const gravado = linha.payload && typeof linha.payload === "object" && !Array.isArray(linha.payload) ? linha.payload as Record<string, unknown> : null;
  if (gravado && typeof gravado.versionId === "string" && gravado.payload && typeof gravado.payload === "object") return gravado;
  return {
    versionId: linha.version_id, entityId: linha.entity_id, versionNumber: linha.version_number, previousVersionId: linha.previous_version_id,
    contentHash: linha.content_hash, origin: linha.origin, changeReason: linha.change_reason,
    createdAt: new Date(linha.created_at).toISOString(), createdBy: linha.created_by, payload: linha.payload,
  };
}

async function emBlocos<T>(ids: readonly string[], ler: (bloco: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const unicos = [...new Set(ids)];
  const saida: T[] = [];
  for (let indice = 0; indice < unicos.length; indice += BLOCO) {
    const { data, error } = await ler(unicos.slice(indice, indice + BLOCO));
    if (error) mapPersistenceError(error);
    saida.push(...((Array.isArray(data) ? data : []) as T[]));
  }
  return saida;
}

export function supabaseRadarArchitectAdoptionStore(db: Db = getOperationalClient()): RadarArchitectAdoptionStore {
  const colunasDoArtefato = "version_id,entity_id,version_number,previous_version_id,content_hash,origin,change_reason,created_by,created_at,payload";
  return {
    async listRadarItemHeads(brandId, articleIds) {
      const consulta = () => db.from("editorial_workflow_items")
        .select("id,marca_id,article_id,stage,state,lock_version,source_version_id,transported_version_id:payload->>articleDnaVersionId,carried_graph_version_id:payload->arquitetoInternalLinks->>graphVersionId")
        .eq("marca_id", brandId).eq("subject_type", "article").eq("stage", "radar");
      if (articleIds) return emBlocos<RadarAdoptionItemHead>(articleIds, bloco => consulta().in("article_id", bloco));
      const { data, error } = await consulta();
      if (error) mapPersistenceError(error);
      return (data || []) as unknown as RadarAdoptionItemHead[];
    },
    async readRadarItem(brandId, itemId) {
      const { data, error } = await db.from("editorial_workflow_items").select(COLUNAS_DO_ITEM)
        .eq("id", itemId).eq("marca_id", brandId).eq("stage", "radar").maybeSingle();
      if (error) mapPersistenceError(error);
      return (data || null) as RadarAdoptionItemRow | null;
    },
    canonicalIndex: brandId => buildCanonicalIndex(db, brandId),
    async readArticleVersions(brandId, articleIds, versionIds) {
      /*
       * O ArticleDNA é lido e validado pelo repositório CANÔNICO do acervo (o
       * Radar não monta nem valida ArticleDNA — F3 do Assunto). O `entityId` do
       * ArticleDNA é o `articleId`. O `content_hash` da coluna vem à parte,
       * sem payload, para conferir o envelope (como o `import_radar`).
       */
      const pedidas = new Set(versionIds);
      const { articles } = await new ArtifactRepository().listScoped(brandId, articleIds);
      const colunas = await emBlocos<{ version_id: string; content_hash: string }>(versionIds, bloco => db.from("editorial_artifact_versions").select("version_id,content_hash")
        .eq("marca_id", brandId).eq("artifact_type", "article_dna").in("version_id", bloco));
      const hashDaColuna = new Map(colunas.map(linha => [linha.version_id, linha.content_hash]));
      return articles.filter(envelope => pedidas.has(envelope.versionId) && hashDaColuna.has(envelope.versionId))
        .map(envelope => ({ envelope: envelope as VersionEnvelope<ArticleDNA>, storedContentHash: hashDaColuna.get(envelope.versionId)! }));
    },
    async readSiloInputs(brandId, versionIds) {
      const linhas = await emBlocos<LinhaDeArtefato & { artifact_type: string }>(versionIds, bloco => db.from("editorial_artifact_versions").select(`artifact_type,${colunasDoArtefato}`)
        .eq("marca_id", brandId).in("artifact_type", ["silo_dna", "silo_page"]).in("version_id", bloco));
      const siloVersions: VersionEnvelope<SiloDNA>[] = [];
      const siloPageVersions: VersionEnvelope<SiloPage>[] = [];
      for (const linha of linhas) {
        if (linha.artifact_type === "silo_dna") {
          const parsed = VersionedSiloDNASchema.safeParse(envelopeDaLinha(linha));
          if (parsed.success) siloVersions.push(parsed.data as VersionEnvelope<SiloDNA>);
        } else {
          const parsed = VersionedSiloPageSchema.safeParse(envelopeDaLinha(linha));
          if (parsed.success) siloPageVersions.push(parsed.data as VersionEnvelope<SiloPage>);
        }
      }
      return { siloVersions, siloPageVersions };
    },
    async readAnalysisRun(itemId, versionId) {
      const { data, error } = await db.from("radar_analysis_runs").select("payload").eq("workflow_item_id", itemId).eq("version_id", versionId).maybeSingle();
      if (error) mapPersistenceError(error);
      const payload = (data as { payload?: unknown } | null)?.payload;
      return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    },
    async writeAnalysisRun(input) {
      const { error } = await db.from("radar_analysis_runs").upsert({
        workflow_item_id: input.itemId, version_id: input.versionId, marca_id: input.brandId, article_id: input.articleId,
        payload: input.run, updated_by: input.actorId, updated_at: new Date().toISOString(),
      }, { onConflict: "workflow_item_id,version_id" });
      if (error) mapPersistenceError(error);
    },
    async readInternalLinkGraphs(brandId, graphVersionIds) {
      /* 2026-10-14 · o MESMO leitor canônico do grafo (nós e arestas), só SELECT, um por versão pedida. */
      const contexto = { supabase: db, brandId } as unknown as PipelineContext;
      const grafos: InternalLinkGraph[] = [];
      for (const graphVersionId of [...new Set(graphVersionIds)]) {
        const grafo = await readInternalLinkGraph(contexto, graphVersionId);
        if (grafo && grafo.brandId === brandId) grafos.push(grafo);
      }
      return grafos;
    },
    async updateRadarItem(input) {
      /* Sem `source*` (adoção de links, 2026-10-14), as colunas da versão transportada não são escritas. */
      const colunasDaVersao = input.sourceVersionId
        ? { source_entity_id: input.sourceEntityId, source_version_id: input.sourceVersionId, source_content_hash: input.sourceContentHash }
        : {};
      const { data, error } = await db.from("editorial_workflow_items").update({
        payload: input.payload, ...colunasDaVersao, updated_by: input.actorId,
      }).eq("id", input.itemId).eq("marca_id", input.brandId).eq("stage", "radar").eq("lock_version", input.expectedLock)
        .select("id,lock_version").maybeSingle();
      if (error) mapPersistenceError(error);
      return data ? { lock_version: (data as { lock_version: number }).lock_version } : null;
    },
    async appendDecisionEvent(input) {
      const { error } = await db.from("editorial_decision_events").insert({
        marca_id: input.brandId, workflow_item_id: input.itemId, article_id: input.articleId, event_type: "adopt_architect_version",
        from_state: input.state, to_state: input.state, source_version_id: input.sourceVersionId, payload: input.payload, actor_id: input.actorId,
      });
      if (error) mapPersistenceError(error);
    },
  };
}
