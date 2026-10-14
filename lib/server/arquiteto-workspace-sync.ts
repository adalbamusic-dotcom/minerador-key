import "server-only";

/**
 * ===== RELEITURA DO QUE MUDOU NA MESA DO ARQUITETO (2026-10-14) =====
 *
 * SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 4, F2. O domínio (marcas, hash, fusão) está em
 * `lib/arquiteto/workspace-delta.ts`; aqui ficam as leituras.
 *
 * `readArchitectSyncState` lê só METADADOS (nenhum `payload` de item ou de
 * artefato; das keywords, as colunas da lista e blocos pequenos do DNA) e
 * calcula as marcas e as listas derivadas (elegibilidade, status, ordem) com as
 * MESMAS funções da leitura inteira. `loadArchitectWorkspaceDelta` compara com
 * as marcas que a tela devolveu e relê inteiro só o que mudou.
 *
 * Ordem das leituras: as marcas são lidas ANTES das linhas. Uma mudança que
 * acontece no meio deixa a marca guardada mais velha que a linha — a próxima
 * releitura a vê como mudada e relê (nunca o contrário).
 *
 * O que as marcas NÃO veem: uma mudança só dentro do DNA da keyword (fora das
 * colunas da lista e dos blocos pequenos acima), feita em OUTRA aba enquanto o
 * Arquiteto está aberto. Ela aparece ao reabrir a área (a primeira leitura de
 * cada abertura é a inteira) ou quando qualquer execução que escreve no
 * Minerador a partir do Arquiteto (melhoria, reforço, diferenciação) muda —
 * aí todas as keywords recebidas são relidas. A coluna `row_version`
 * (migration 20260923140000, escrita e não aplicada) fecharia essa lacuna.
 */

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { arquitetoVersionFromRow, listArquitetoVersionMeta, readArquitetoVersionRows, vigentesFromMeta, type ArquitetoVersionMeta } from "./arquiteto-persistence";
import { ARQUITETO_KEYWORD_INDEX_COLUMNS, listBrandKeywordsByIds, readArticleVersionEvents, uuidBatches, workflowSnapshot, type WorkflowRow } from "./arquiteto-workspace";
import { listTerritoryWorkflowItems } from "./arquiteto-territory-store";
import { listSiloWorkingCopies } from "./arquiteto-silo-working-copy-store";
import { listTerritorialSerpAssessments } from "./arquiteto-territorial-serp-store";
import { listArticleFormationSerpAssessmentsByRefs } from "./arquiteto-article-serp-store";
import { listTerritorialAiProposals } from "./arquiteto-territorial-ai-store";
import { readArchitectureMarker } from "./arquiteto-architecture-marker-store";
import { readArticleFormationMarker } from "./arquiteto-article-formation-marker-store";
import { MINERADOR_ARQUITETO_RECEIVED_STATE, resolveCanonicalMineradorArquitetoImportEligibility } from "@/lib/arquiteto/minerador-handoff";
import { releaseRejectedArticles, type RejectedArticleRelease } from "@/lib/arquiteto/rejected-article-release";
import { readBrandSiloCatalog } from "@/lib/arquiteto/territorial-landscape";
import { ARTICLE_AI_REVIEW_ARTIFACT_TYPE } from "@/lib/arquiteto/article-ai-review";
import { projectArticleFormationSerpRecord } from "@/lib/arquiteto/article-serp-projection";
import type { ArticleDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { diffSyncMarks, stableJson, syncHash, syncPatchOf, type ArchitectSyncMarks, type ArchitectSyncPatch, type ArchitectWorkspaceDeltaChanges } from "@/lib/arquiteto/workspace-delta";

type ItemMeta = { id: string; subjectType: string; subjectId: string; stage: string; state: string; lockVersion: number; updatedAt: string; marcaId: string };

const KEYWORD_ITEM_META = "id,marca_id,subject_type,subject_id,stage,state,lock_version,updated_at";
const OTHER_ITEM_META = "id,subject_type,subject_id,stage,lock_version,updated_at";
const WORKFLOW_ROW_COLUMNS = "id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,source_version_id,source_content_hash,payload,lock_version,created_at,updated_at";

/** Itens de workflow da mesa que não são keyword: coleções pequenas, pareceres e execuções que escrevem no Minerador. */
const COLLECTION_TYPES = {
  territories: "territory",
  workingCopies: "silo_working_copy",
  territorialSerp: "territorial_serp_assessment",
  territorialAi: "territorial_ai_review",
  archMarker: "architecture_analysis",
  formMarker: "article_formation_analysis",
} as const;
const SERP_TYPE = "article_formation_serp_assessment";
/** Execuções do Arquiteto que gravam keywords no Minerador (SDD §6.1 W1–W5): mudou uma, todas as recebidas são relidas. */
const RUN_TYPES = ["article_improvement_run", "published_reinforcement_search", "differentiation_proposal"] as const;

/**
 * A impressão da keyword: as colunas da lista + o grupo + os blocos pequenos do
 * DNA que mudam numa decisão (Assunto/plano/trava, aprovação, Lógica, revisão
 * humana, KD, volume, elegibilidade de volume, tipo de página, origem do site,
 * funil e nicho).
 */
export const ARQUITETO_KEYWORD_SYNC_COLUMNS = [
  ARQUITETO_KEYWORD_INDEX_COLUMNS,
  "group_id",
  "ks:analise_semantica->keyword_subject",
  "kdp:analise_semantica->keyword_declared_principal",
  "ap:analise_semantica->aprovacao",
  "lp:analise_semantica->>logicProcessedAt",
  "lh:analise_semantica->>logicInputHash",
  "hr:analise_semantica->>dna_revisao_humana_em",
  "kd:analise_semantica->dataforseo_keyword_overview->>measuredAt",
  "vm:analise_semantica->volume_measurement->>measuredAt",
  "am:analise_semantica->allintitle_measurement->>measuredAt",
  "ve:analise_semantica->volume_eligibility",
  "kpt:analise_semantica->keyword_page_type",
  "so:analise_semantica->site_origin->>lastCheckedAt",
  "sop:analise_semantica->site_origin->>publicationStatus",
  "fn:analise_semantica->>funnel",
  "ni:analise_semantica->>nicho_override",
  "pkp:analise_semantica->>primary_keyword_policy_at",
].join(",");
const INDEX_KEYS = ARQUITETO_KEYWORD_INDEX_COLUMNS.split(",");

function indexRowOf(row: Record<string, unknown>) {
  return Object.fromEntries(INDEX_KEYS.map(key => [key, row[key]]));
}

/** As linhas do índice (sem `analise_semantica`) a partir da leitura das marcas: a leitura inteira não as lê de novo. */
export function keywordIndexRowsFromSync(state: { fpRows: ReadonlyArray<Record<string, unknown>> }) {
  return state.fpRows.map(indexRowOf);
}

async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 100; page += 1) {
    const from = page * 1000;
    const result = await build(from, from + 999);
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    const data = (Array.isArray(result.data) ? result.data : []) as T[];
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const itemMetaOf = (row: Record<string, unknown>): ItemMeta => ({
  id: String(row.id), marcaId: String(row.marca_id ?? ""), subjectType: String(row.subject_type), subjectId: String(row.subject_id),
  stage: String(row.stage ?? ""), state: String(row.state ?? ""), lockVersion: Number(row.lock_version), updatedAt: String(row.updated_at ?? ""),
});

const markOfRows = (rows: readonly ItemMeta[]) => syncHash(rows.map(row => `${row.id}|${row.subjectId}|${row.lockVersion}|${row.updatedAt}`).sort().join("\n"));

export type ArchitectSyncState = Awaited<ReturnType<typeof readArchitectSyncState>>;

/** Metadados e marcas da mesa, sem nenhum `payload` de item ou artefato. */
export async function readArchitectSyncState(context: PipelineContext) {
  const [keywordItems, otherItems, fpRows, versionMetas, brandRow] = await Promise.all([
    paged<Record<string, unknown>>((from, to) => context.supabase.from("editorial_workflow_items").select(KEYWORD_ITEM_META)
      .eq("marca_id", context.brandId).eq("subject_type", "keyword").eq("stage", "architect")
      .order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    paged<Record<string, unknown>>((from, to) => context.supabase.from("editorial_workflow_items").select(OTHER_ITEM_META)
      .eq("marca_id", context.brandId).in("subject_type", [...Object.values(COLLECTION_TYPES), SERP_TYPE, ...RUN_TYPES])
      .order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to)),
    paged<Record<string, unknown>>((from, to) => context.supabase.from("minerador_keywords").select(ARQUITETO_KEYWORD_SYNC_COLUMNS)
      .eq("brand_id", context.brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, to)),
    listArquitetoVersionMeta(context),
    context.supabase.from("marcas").select("silos_existentes").eq("id", context.brandId).maybeSingle(),
  ]);
  if (brandRow.error) throw brandRow.error;

  const itemMetas = keywordItems.map(itemMetaOf);
  const receivedItems = itemMetas.filter(item => item.state === MINERADOR_ARQUITETO_RECEIVED_STATE);
  const received = new Set(receivedItems.map(item => item.subjectId));
  const others = otherItems.map(itemMetaOf);

  /* Artefatos: a vigente de cada um, na ordem da leitura inteira, e os conjuntos que a mesa devolve. */
  const vigentes = vigentesFromMeta(versionMetas);
  const articleVigentes = vigentes.filter(meta => meta.artifactType === "article_dna" && meta.referenceKeywordIds.some(id => received.has(id)));
  const statusesDasVigentes = vigentes.map(meta => ({ versionId: meta.versionId, status: meta.status }));
  const events = await readArticleVersionEvents(context, articleVigentes.map(meta => meta.versionId));
  const envelopes = articleVigentes.map(meta => ({
    versionId: meta.versionId, entityId: meta.entityId, versionNumber: meta.versionNumber,
    payload: { articleId: meta.articleId ?? meta.entityId, brandId: meta.brandId, keywordReferences: meta.referenceKeywordIds.map(keywordId => ({ keywordId })), subject: meta.subjectKeywordId ? { keywordId: meta.subjectKeywordId } : null },
  })) as unknown as VersionEnvelope<ArticleDNA>[];
  const liberacao = releaseRejectedArticles({ articleDnas: envelopes, statuses: statusesDasVigentes, events, workflowItems: [] });
  const ativas = new Set(liberacao.articleDnas.map(version => version.versionId));
  const liberadaPor = new Map<string, RejectedArticleRelease>();
  for (const item of liberacao.rejected) for (const keywordId of item.releasedKeywordIds) if (!liberadaPor.has(keywordId)) liberadaPor.set(keywordId, item);
  const included = {
    articleDnas: articleVigentes.filter(meta => ativas.has(meta.versionId)),
    siloDnas: vigentes.filter(meta => meta.artifactType === "silo_dna" && meta.brandId === context.brandId),
    siloPages: vigentes.filter(meta => meta.artifactType === "silo_page" && meta.brandId === context.brandId),
    aiReviews: vigentes.filter(meta => meta.artifactType === ARTICLE_AI_REVIEW_ARTIFACT_TYPE && meta.brandId === context.brandId),
  };
  const relacionadas = new Set(Object.values(included).flat().map(meta => meta.versionId));
  const statuses = statusesDasVigentes.filter(item => relacionadas.has(item.versionId));

  /* Elegibilidade: a mesma função da leitura inteira, sobre as mesmas entradas (keywords de todas as versões vêm dos caminhos). */
  const incorporated = new Set(versionMetas.filter(meta => meta.artifactType === "article_dna" && meta.brandId === context.brandId).flatMap(meta => meta.keywordIds));
  const eligibility = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId: context.brandId,
    keywords: fpRows.map(row => ({ id: String(row.id), brandId: String(row.brand_id), status: typeof row.status === "string" ? row.status : null, contentHash: typeof row.content_hash === "string" ? row.content_hash : null })),
    workflowItems: itemMetas.map(item => ({ marcaId: item.marcaId, subjectType: item.subjectType, subjectId: item.subjectId, stage: item.stage, state: item.state })),
    articleDnaKeywordIds: incorporated,
  });
  const catalog = readBrandSiloCatalog(brandRow.data?.silos_existentes);
  const serpItems = others.filter(item => item.subjectType === SERP_TYPE && item.stage === "architect");

  const releaseSuffix = (subjectId: string) => {
    const artigo = liberadaPor.get(subjectId);
    return artigo ? `|r:${artigo.articleId}:${artigo.versionId}:${artigo.rejectedAt ?? ""}:${artigo.reason ?? ""}` : "";
  };
  const artKey = (meta: ArquitetoVersionMeta) => `${meta.artifactType}:${meta.entityId}`;
  const marks: ArchitectSyncMarks = {
    v: 1,
    items: Object.fromEntries(receivedItems.map(item => [item.id, `${item.lockVersion}|${item.updatedAt}${releaseSuffix(item.subjectId)}`])),
    kw: Object.fromEntries(fpRows.map(row => [String(row.id), syncHash(stableJson(row))])),
    art: Object.fromEntries(Object.values(included).flat().map(meta => [artKey(meta), meta.versionId])),
    serp: Object.fromEntries(serpItems.map(item => [item.subjectId, `${item.id}|${item.lockVersion}|${item.updatedAt}`])),
    hashes: {
      ...Object.fromEntries(Object.entries(COLLECTION_TYPES).map(([nome, tipo]) => [nome, markOfRows(others.filter(item => item.subjectType === tipo))])),
      runs: markOfRows(others.filter(item => (RUN_TYPES as readonly string[]).includes(item.subjectType))),
      eligibility: syncHash(eligibility.map(entry => `${entry.keywordId}|${entry.importability}|${entry.workflowState ?? ""}`).sort().join("\n")),
      statuses: syncHash(stableJson(statuses)),
      catalog: syncHash(stableJson(catalog)),
      orderItems: syncHash(receivedItems.map(item => item.id).join("\n")),
      orderArticleDnas: syncHash(included.articleDnas.map(meta => meta.entityId).join("\n")),
      orderSiloDnas: syncHash(included.siloDnas.map(meta => meta.entityId).join("\n")),
      orderSiloPages: syncHash(included.siloPages.map(meta => meta.entityId).join("\n")),
      orderAiReviews: syncHash(included.aiReviews.map(meta => meta.entityId).join("\n")),
      orderSerp: syncHash(serpItems.map(item => item.subjectId).join("\n")),
    },
  };
  return { marks, receivedItems, received, fpRows, versionMetas, included, envelopes, statusesDasVigentes, events, statuses, eligibility, catalog, serpItems };
}

/** Itens `keyword/architect` inteiros, pelo id, na forma da leitura da mesa (com a liberação por artigo rejeitado aplicada). */
async function readDerivedWorkflowItems(context: PipelineContext, state: ArchitectSyncState, itemIds: readonly string[]) {
  const rows: WorkflowRow[] = [];
  for (const batch of uuidBatches(itemIds)) {
    const result = await context.supabase.from("editorial_workflow_items").select(WORKFLOW_ROW_COLUMNS)
      .eq("marca_id", context.brandId).eq("subject_type", "keyword").eq("stage", "architect").in("id", batch);
    if (result.error) throw pipelineErrorFromSupabase(result.error);
    rows.push(...((result.data || []) as WorkflowRow[]));
  }
  const recebidos = rows.filter(row => row.state === MINERADOR_ARQUITETO_RECEIVED_STATE).map(workflowSnapshot);
  return releaseRejectedArticles({ articleDnas: state.envelopes, statuses: state.statusesDasVigentes, events: state.events, workflowItems: recebidos }).workflowItems;
}

export type ArchitectWorkspaceDelta = { changes: ArchitectWorkspaceDeltaChanges; sync: ArchitectSyncPatch; stats: Record<string, number> };

/** O que mudou desde as marcas `known`, na forma da leitura inteira. */
export async function loadArchitectWorkspaceDelta(context: PipelineContext, known: ArchitectSyncMarks): Promise<ArchitectWorkspaceDelta> {
  const state = await readArchitectSyncState(context);
  const { marks } = state;
  const changes: ArchitectWorkspaceDeltaChanges = {};
  const stats: Record<string, number> = {};
  const mudouHash = (nome: string) => marks.hashes[nome] !== known.hashes?.[nome];

  /* Mesma recusa da leitura inteira: keyword recebida que não está viva na marca. */
  const vivas = new Set(state.fpRows.map(row => String(row.id)));
  if ([...state.received].some(id => !vivas.has(id))) {
    throw new PipelineRuntimeError("CONFLICT", "O workflow canônico referencia uma keyword que não está disponível na mesma Brand.", 409);
  }

  /* 1. Itens recebidos. */
  const itens = diffSyncMarks(marks.items, known.items);
  const ordemDosItens = mudouHash("orderItems");
  let sujeitosRelidos = new Set<string>();
  if (itens.changed.length || itens.removed.length || ordemDosItens) {
    const upsert = itens.changed.length ? await readDerivedWorkflowItems(context, state, itens.changed) : [];
    sujeitosRelidos = new Set(upsert.map(item => item.subjectId));
    changes.workflowItems = { upsert, remove: itens.removed, ...(ordemDosItens || itens.changed.some(id => !(id in (known.items || {}))) ? { order: state.receivedItems.map(item => item.id) } : {}) };
    stats.workflowItems = upsert.length;
  }

  /* 2. Linhas inteiras das keywords recebidas: as do item relido, as de impressão nova, ou todas se uma execução que escreve no Minerador mudou. */
  const kw = diffSyncMarks(marks.kw, known.kw);
  const kwMudou = new Set(kw.changed);
  const todas = mudouHash("runs");
  const reler = [...state.received].filter(id => todas || sujeitosRelidos.has(id) || kwMudou.has(id));
  if (reler.length) {
    changes.keywords = { upsert: await listBrandKeywordsByIds(context, reler) as unknown as Array<Record<string, unknown>> };
    stats.keywords = reler.length;
  }
  if (kw.changed.length || kw.removed.length) {
    changes.availableKeywords = { upsert: state.fpRows.filter(row => kwMudou.has(String(row.id))).map(indexRowOf), remove: kw.removed };
    stats.availableKeywords = kw.changed.length;
  }
  if (mudouHash("eligibility")) changes.importEligibility = state.eligibility as unknown as Array<Record<string, unknown>>;

  /* 3. Artefatos vigentes. */
  const art = diffSyncMarks(marks.art, known.art);
  const linhas = art.changed.length ? await readArquitetoVersionRows(context, art.changed.map(key => marks.art[key])) : new Map<string, Record<string, unknown>>();
  const tipos = [
    ["articleDnas", "article_dna", "orderArticleDnas"],
    ["siloDnas", "silo_dna", "orderSiloDnas"],
    ["siloPages", "silo_page", "orderSiloPages"],
    ["aiReviews", ARTICLE_AI_REVIEW_ARTIFACT_TYPE, "orderAiReviews"],
  ] as const;
  for (const [secao, tipo, ordem] of tipos) {
    const prefixo = `${tipo}:`;
    const mudadas = art.changed.filter(key => key.startsWith(prefixo));
    const removidas = art.removed.filter(key => key.startsWith(prefixo)).map(key => key.slice(prefixo.length));
    if (!mudadas.length && !removidas.length && !mudouHash(ordem)) continue;
    const upsert: Array<Record<string, unknown>> = [];
    for (const key of mudadas) {
      const row = linhas.get(marks.art[key]);
      if (!row) throw new PipelineRuntimeError("QUERY_FAILURE", `A versão vigente ${marks.art[key]} não voltou na leitura.`, 503);
      const lida = arquitetoVersionFromRow(context, row, null);
      if (lida) upsert.push(lida.version as unknown as Record<string, unknown>);
    }
    const novas = mudadas.some(key => !(key in (known.art || {})));
    changes[secao] = { upsert, remove: removidas, ...(mudouHash(ordem) || novas ? { order: state.included[secao].map(meta => meta.entityId) } : {}) };
    stats[secao] = upsert.length;
  }
  if (mudouHash("statuses")) changes.statuses = state.statuses;
  if (mudouHash("catalog")) changes.brandSiloCatalog = state.catalog;

  /* 4. Coleções pequenas: relidas inteiras quando mudam (as mesmas leituras do GET). */
  if (mudouHash("territories")) changes.territories = await listTerritoryWorkflowItems(context);
  if (mudouHash("workingCopies")) changes.siloWorkingCopies = await listSiloWorkingCopies(context);
  if (mudouHash("territorialSerp")) changes.territorialSerp = await listTerritorialSerpAssessments(context);
  if (mudouHash("territorialAi")) changes.territorialAi = await listTerritorialAiProposals(context);
  if (mudouHash("archMarker")) changes.architectureMarker = (await readArchitectureMarker(context))?.payload ?? null;
  if (mudouHash("formMarker")) changes.articleFormationMarker = (await readArticleFormationMarker(context))?.payload ?? null;

  /* 5. Pareceres da formação: só os que mudaram, em projeção. */
  const serp = diffSyncMarks(marks.serp, known.serp);
  if (serp.changed.length || serp.removed.length || mudouHash("orderSerp")) {
    const upsert = serp.changed.length ? (await listArticleFormationSerpAssessmentsByRefs(context, serp.changed)).map(projectArticleFormationSerpRecord) : [];
    const novas = serp.changed.some(ref => !(ref in (known.serp || {})));
    changes.articleFormationSerp = { upsert: upsert as unknown as Array<Record<string, unknown>>, remove: serp.removed, ...(mudouHash("orderSerp") || novas ? { order: state.serpItems.map(item => item.subjectId) } : {}) };
    stats.articleFormationSerp = upsert.length;
  }

  return { changes, sync: syncPatchOf(marks, known), stats };
}
