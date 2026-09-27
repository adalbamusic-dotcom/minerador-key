import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "@/lib/arquiteto/contracts";
import { readPublishedIdentity } from "@/lib/arquiteto/published-identity";
import { publishedPrimaryPostOf, type PublishedPrimaryPost } from "@/lib/arquiteto/published-primary-swap";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor } from "@/lib/arquiteto/serp-lens-targeting";
import type { KeywordSerpFootprint } from "@/lib/arquiteto/serp-subject-overlap";
import {
  DIFFERENTIATION_ROW_STATES,
  DIFFERENTIATION_STAGE,
  DIFFERENTIATION_SUBJECT_TYPE,
  type DifferentiationKeptDecision,
  type DifferentiationPage,
  type DifferentiationProposalSummary,
  type DifferentiationRowState,
} from "@/lib/arquiteto/published-differentiation";
import { normalizeKeyword } from "@/lib/minerador/keyword-import-core";
import { DATAFORSEO_LABS_LANGUAGE_CODE, DATAFORSEO_LABS_LOCATION_CODE } from "@/lib/minerador/dataforseo-labs-keyword-research-core";
import { readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { readSerpSubjectFootprints, type SerpSubjectReadEgress } from "@/lib/server/arquiteto-serp-subject-store";

/**
 * DIFERENCIAR PUBLICADOS — LEITURAS E GRAVAÇÕES DO SERVIDOR.
 *
 * Toda consulta filtra pela marca do contexto (egress R4), só nas colunas que
 * a proposta usa (R5): o `analise_semantica` inteiro nunca trafega — só os
 * caminhos do Vínculo, do Posto e do DNA. A proposta mora em
 * `editorial_workflow_items` (`subject_type = 'differentiation_proposal'`,
 * `stage = 'architect'`), com `lock_version` na atualização.
 *
 * Nada aqui paga provider: a SERP é lida do cache (`readSerpSubjectFootprints`).
 */

export type DifferentiationStoreContext = {
  supabase: SupabaseClient;
  brandId: string;
  actorUserId: string;
};

function falha(etapa: string, error: { message?: string } | null | undefined): never {
  throw new Error(`${etapa}: ${error?.message || "falha desconhecida"}`);
}

const PAGINA = 1000;

/* -------------------------------- keywords -------------------------------- */

/**
 * As colunas da leitura dos publicados: o índice da keyword e os caminhos do
 * Vínculo (`site_origin`), do Posto e do DNA. ≈ 0,4 a 1 KB por keyword.
 */
export const DIFFERENTIATION_KEYWORD_COLUMNS = [
  "id",
  "keyword",
  "status",
  "volume_search",
  "volume_source",
  "intent",
  "site_origin:analise_semantica->site_origin",
  "primary_keyword_policy:analise_semantica->>primary_keyword_policy",
  "entidade_central:analise_semantica->>entidade_central",
  "problema_percebido:analise_semantica->>problema_percebido",
].join(",");

type LinhaKeyword = {
  id: string;
  keyword: string;
  status: string | null;
  volume_search: number | null;
  volume_source: string | null;
  intent: string | null;
  site_origin: unknown;
  primary_keyword_policy: string | null;
  entidade_central: string | null;
  problema_percebido: string | null;
};

const texto = (valor: unknown) => typeof valor === "string" && valor.trim() ? valor.trim() : null;
const numero = (valor: unknown) => typeof valor === "number" && Number.isFinite(valor) ? valor : null;

export type DifferentiationBrandKeywords = {
  /** Os publicados, na ordem do banco (id). */
  pages: DifferentiationPage[];
  /** Todas as keywords vivas: normalizada → id (o "já existe" do Aplicar). */
  existingByNormalized: Map<string, string>;
  /** As publicadas, normalizadas: nunca viram candidata. */
  publishedNormalized: Set<string>;
  rowsRead: number;
};

/** Os publicados da marca e o índice das vivas, numa leitura paginada e estreita. */
export async function readDifferentiationBrandKeywords(context: DifferentiationStoreContext): Promise<DifferentiationBrandKeywords> {
  const pages: DifferentiationPage[] = [];
  const existingByNormalized = new Map<string, string>();
  const publishedNormalized = new Set<string>();
  let rowsRead = 0;
  for (let inicio = 0; ; inicio += PAGINA) {
    const resultado = await context.supabase
      .from("minerador_keywords")
      .select(DIFFERENTIATION_KEYWORD_COLUMNS)
      .eq("brand_id", context.brandId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (resultado.error) falha("Leitura das keywords da marca", resultado.error);
    const linhas = (resultado.data || []) as unknown as LinhaKeyword[];
    rowsRead += linhas.length;
    for (const linha of linhas) {
      const id = texto(linha.id);
      const keyword = texto(linha.keyword);
      if (!id || !keyword) continue;
      const normal = normalizeKeyword(keyword);
      if (normal && !existingByNormalized.has(normal)) existingByNormalized.set(normal, id);
      const identidade = readPublishedIdentity({ status: linha.status, analise_semantica: { site_origin: linha.site_origin } });
      if (!identidade) continue;
      publishedNormalized.add(normal);
      const url = identidade.url;
      let slug: string | null = null;
      try { slug = url ? new URL(url).pathname.replace(/\/+$/, "") || "/" : null; } catch { slug = null; }
      const volume = numero(linha.volume_search);
      pages.push({
        keywordId: id,
        keyword,
        url,
        canonical: identidade.canonicalUrl,
        slug,
        // Posto sem declaração em publicada é desconhecido (AGENTS §11), como na mesa.
        post: texto(linha.primary_keyword_policy) ? publishedPrimaryPostOf(linha.primary_keyword_policy) : "unknown",
        volume,
        volumeValidated: texto(linha.volume_source)?.toLowerCase() === "google_ads" && (volume ?? 0) > 0,
        intent: texto(linha.intent) && texto(linha.intent)!.toLowerCase() !== "pendente" ? texto(linha.intent) : null,
        entity: texto(linha.entidade_central),
        problem: texto(linha.problema_percebido),
        articleId: null,
        articleKeywordCount: null,
      });
    }
    if (linhas.length < PAGINA) break;
  }
  return { pages, existingByNormalized, publishedNormalized, rowsRead };
}

/** O Posto relido agora, só da coluna da política (a mesma regra da troca na mesa). */
export async function readFreshPublishedPosts(context: DifferentiationStoreContext, keywordIds: readonly string[]): Promise<Map<string, PublishedPrimaryPost>> {
  const postos = new Map<string, PublishedPrimaryPost>();
  const ids = [...new Set(keywordIds)];
  if (!ids.length) return postos;
  const resultado = await context.supabase
    .from("minerador_keywords")
    .select("id,primary_keyword_policy:analise_semantica->>primary_keyword_policy")
    .eq("brand_id", context.brandId)
    .is("deleted_at", null)
    .in("id", ids);
  if (resultado.error) falha("Leitura do Posto", resultado.error);
  for (const linha of (resultado.data || []) as unknown as Array<{ id: string; primary_keyword_policy: string | null }>) {
    postos.set(String(linha.id), texto(linha.primary_keyword_policy) ? publishedPrimaryPostOf(linha.primary_keyword_policy) : "unknown");
  }
  return postos;
}

/* ------------------------------- ArticleDNA ------------------------------- */

/** A leitura estreita do índice de artigos: ids e papéis, nunca o payload inteiro. */
export const DIFFERENTIATION_ARTICLE_INDEX_COLUMNS = [
  "entity_id",
  "version_number",
  "principal:payload->>principalKeywordId",
  "previous:payload->primaryKeywordDecision->>previousKeywordId",
  "decision:payload->primaryKeywordDecision->>status",
  "secondary:payload->secondaryKeywordIds",
  "narrative:payload->narrativeReinforcementIds",
].join(",");

export type DifferentiationArticleIndexEntry = { articleId: string; versionNumber: number; keywordCount: number };

/**
 * A principal publicada → o artigo (versão vigente). Depois de uma troca
 * aplicada, o artigo continua sendo o da página pela principal anterior.
 */
export async function readDifferentiationArticleIndex(context: DifferentiationStoreContext): Promise<Map<string, DifferentiationArticleIndexEntry>> {
  const vigentes = new Map<string, Record<string, unknown>>();
  for (let inicio = 0; ; inicio += PAGINA) {
    const resultado = await context.supabase
      .from("editorial_artifact_versions")
      .select(DIFFERENTIATION_ARTICLE_INDEX_COLUMNS)
      .eq("marca_id", context.brandId)
      .eq("artifact_type", "article_dna")
      .order("version_number", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (resultado.error) falha("Leitura do índice de artigos", resultado.error);
    const linhas = (resultado.data || []) as unknown as Array<Record<string, unknown>>;
    for (const linha of linhas) {
      const entidade = texto(linha.entity_id);
      if (!entidade) continue;
      const atual = vigentes.get(entidade);
      if (!atual || Number(linha.version_number) >= Number(atual.version_number)) vigentes.set(entidade, linha);
    }
    if (linhas.length < PAGINA) break;
  }
  const indice = new Map<string, DifferentiationArticleIndexEntry>();
  for (const [articleId, linha] of vigentes) {
    const contar = (valor: unknown) => Array.isArray(valor) ? valor.length : 0;
    const entrada = { articleId, versionNumber: Number(linha.version_number), keywordCount: 1 + contar(linha.secondary) + contar(linha.narrative) };
    const principal = texto(linha.principal);
    if (principal) indice.set(principal, entrada);
    const anterior = texto(linha.previous);
    if (anterior && texto(linha.decision) === "confirmed") indice.set(anterior, entrada);
  }
  return indice;
}

export const DIFFERENTIATION_ARTICLE_VERSION_COLUMNS = "version_id,entity_id,version_number,previous_version_id,content_hash,origin,change_reason,created_at,created_by,payload";

/** A versão vigente de UM ArticleDNA, com o payload (só no Aplicar e no readback). */
export async function readLatestArticleDnaVersion(context: DifferentiationStoreContext, articleId: string): Promise<VersionEnvelope<ArticleDNA> | null> {
  const resultado = await context.supabase
    .from("editorial_artifact_versions")
    .select(DIFFERENTIATION_ARTICLE_VERSION_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("artifact_type", "article_dna")
    .eq("entity_id", articleId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (resultado.error) falha("Leitura do ArticleDNA", resultado.error);
  const linha = resultado.data as Record<string, unknown> | null;
  if (!linha) return null;
  const payload = ArticleDNASchema.safeParse(linha.payload);
  if (!payload.success || payload.data.brandId !== context.brandId) return null;
  const criado = texto(linha.created_at);
  return {
    versionId: String(linha.version_id),
    entityId: String(linha.entity_id),
    versionNumber: Number(linha.version_number),
    previousVersionId: texto(linha.previous_version_id),
    contentHash: String(linha.content_hash),
    origin: linha.origin as VersionEnvelope<ArticleDNA>["origin"],
    changeReason: String(linha.change_reason ?? ""),
    createdAt: criado ? new Date(criado).toISOString() : new Date(0).toISOString(),
    createdBy: String(linha.created_by ?? ""),
    payload: payload.data,
  };
}

/* ----------------------------------- SERP ----------------------------------- */

/** A pegada dos publicados no cache, com o targeting de cada keyword (a chave do cache). */
export async function readPublishedFootprints(context: DifferentiationStoreContext, pages: ReadonlyArray<Pick<DifferentiationPage, "keywordId" | "keyword">>, now: Date): Promise<{ footprints: KeywordSerpFootprint[]; withoutSerp: string[]; missingLenses: Array<{ keywordId: string; lens: string; reason: string }>; egress: SerpSubjectReadEgress }> {
  if (!pages.length) return { footprints: [], withoutSerp: [], missingLenses: [], egress: { queries: 0, entriesRead: 0, approxBytes: 0 } };
  const ambiente = readDataForSeoTargetCodes();
  const targeting = await readMineradorKeywordTargetCodes(context.supabase, context.brandId, pages.map(page => page.keywordId), ambiente);
  const alvos = pages.map(page => ({ keywordId: page.keywordId, keyword: page.keyword, ...serpTargetCodesFor(targeting.codes, page.keywordId, ambiente) }));
  return readSerpSubjectFootprints(context, alvos, { now });
}

/** A pegada das candidatas: a mesma chave que a Pesquisa por Assunto grava (Brasil, "pt"). */
export async function readCandidateFootprints(context: DifferentiationStoreContext, targets: ReadonlyArray<{ keywordId: string; keyword: string }>, now: Date) {
  const alvos = targets.map(target => ({ keywordId: target.keywordId, keyword: target.keyword, locationCode: DATAFORSEO_LABS_LOCATION_CODE, languageCode: DATAFORSEO_LABS_LANGUAGE_CODE }));
  const leitura = await readSerpSubjectFootprints(context, alvos, { now });
  return { footprints: leitura.footprints.filter(pegada => pegada.lenses.length), missingLenses: leitura.missingLenses };
}

/* --------------------------------- proposta --------------------------------- */

export type DifferentiationRow = {
  id: string;
  state: DifferentiationRowState;
  lockVersion: number;
  payload: Record<string, unknown>;
};

const COLUNAS_DA_PROPOSTA = "id,state,lock_version,payload";

export async function readDifferentiationProposal(context: DifferentiationStoreContext, groupId: string): Promise<DifferentiationRow | null> {
  const resultado = await context.supabase
    .from("editorial_workflow_items")
    .select(COLUNAS_DA_PROPOSTA)
    .eq("marca_id", context.brandId)
    .eq("subject_type", DIFFERENTIATION_SUBJECT_TYPE)
    .eq("stage", DIFFERENTIATION_STAGE)
    .eq("subject_id", groupId)
    .maybeSingle();
  if (resultado.error) falha("Leitura da proposta de diferenciação", resultado.error);
  const linha = resultado.data as Record<string, unknown> | null;
  if (!linha) return null;
  return { id: String(linha.id), state: String(linha.state) as DifferentiationRowState, lockVersion: Number(linha.lock_version), payload: (linha.payload && typeof linha.payload === "object" ? linha.payload : {}) as Record<string, unknown> };
}

/** As decisões "Manter como está" — só o grupo e a impressão da SERP, nunca o payload inteiro. */
export async function readKeptDifferentiationDecisions(context: DifferentiationStoreContext): Promise<DifferentiationKeptDecision[]> {
  const resultado = await context.supabase
    .from("editorial_workflow_items")
    .select("subject_id,kept:payload->kept->>serpFingerprint")
    .eq("marca_id", context.brandId)
    .eq("subject_type", DIFFERENTIATION_SUBJECT_TYPE)
    .eq("stage", DIFFERENTIATION_STAGE)
    .eq("state", "kept");
  if (resultado.error) falha("Leitura das decisões de manter", resultado.error);
  return ((resultado.data || []) as unknown as Array<{ subject_id: string; kept: string | null }>)
    .filter(linha => texto(linha.kept))
    .map(linha => ({ groupId: String(linha.subject_id), serpFingerprint: String(linha.kept) }));
}

/**
 * O resumo das propostas da marca, numa leitura só e estreita (egress R5):
 * o estado, a impressão do "Manter como está", se há avaliação paga gravada e
 * se há rodada reservada. A detecção o devolve por grupo; a tela reabre o
 * resultado pago sem cobrar e nunca oferece uma segunda rodada na mesma prévia.
 */
export async function readDifferentiationProposalSummaries(context: DifferentiationStoreContext): Promise<{ kept: DifferentiationKeptDecision[]; summaries: Map<string, DifferentiationProposalSummary> }> {
  const resultado = await context.supabase
    .from("editorial_workflow_items")
    .select("subject_id,state,kept:payload->kept->>serpFingerprint,evaluation_hash:payload->>evaluationHash,executed_at:payload->run->>executedAt,running_since:payload->running->>startedAt")
    .eq("marca_id", context.brandId)
    .eq("subject_type", DIFFERENTIATION_SUBJECT_TYPE)
    .eq("stage", DIFFERENTIATION_STAGE);
  if (resultado.error) falha("Leitura das propostas de diferenciação", resultado.error);
  const kept: DifferentiationKeptDecision[] = [];
  const summaries = new Map<string, DifferentiationProposalSummary>();
  for (const linha of (resultado.data || []) as unknown as Array<{ subject_id: string; state: string; kept: string | null; evaluation_hash: string | null; executed_at: string | null; running_since: string | null }>) {
    const groupId = String(linha.subject_id);
    const state = (DIFFERENTIATION_ROW_STATES as readonly string[]).includes(String(linha.state)) ? String(linha.state) as DifferentiationRowState : null;
    if (!state) continue;
    if (state === "kept" && texto(linha.kept)) kept.push({ groupId, serpFingerprint: String(linha.kept) });
    summaries.set(groupId, { state, hasRun: Boolean(texto(linha.evaluation_hash)), executedAt: texto(linha.executed_at), runningSince: state === "running" ? texto(linha.running_since) : null });
  }
  return { kept, summaries };
}

export class DifferentiationConflictError extends Error {
  readonly code = "DIFFERENTIATION_PROPOSAL_CONFLICT" as const;
}

/**
 * Cria ou sucede a proposta. Na sucessão, só grava se o `lock_version` ainda
 * for o lido (outra aba ou outro membro gravou antes → conflito, nada muda).
 * Devolve a linha relida: gravar não é sucesso, o readback é.
 */
export async function writeDifferentiationProposal(
  context: DifferentiationStoreContext,
  input: { groupId: string; state: DifferentiationRowState; payload: Record<string, unknown>; expected: DifferentiationRow | null },
): Promise<DifferentiationRow> {
  if (!input.expected) {
    const criada = await context.supabase
      .from("editorial_workflow_items")
      .insert({
        marca_id: context.brandId,
        subject_type: DIFFERENTIATION_SUBJECT_TYPE,
        subject_id: input.groupId,
        article_id: null,
        stage: DIFFERENTIATION_STAGE,
        state: input.state,
        source_entity_id: input.groupId,
        payload: input.payload,
        created_by: context.actorUserId,
        updated_by: context.actorUserId,
      })
      .select("id,lock_version")
      .maybeSingle();
    if (criada.error?.code === "23505") throw new DifferentiationConflictError("Outra gravação da mesma proposta chegou antes. Recarregue e tente de novo.");
    if (criada.error) falha("Gravação da proposta de diferenciação", criada.error);
  } else {
    const atualizada = await context.supabase
      .from("editorial_workflow_items")
      .update({ state: input.state, payload: input.payload, updated_by: context.actorUserId })
      .eq("id", input.expected.id)
      .eq("marca_id", context.brandId)
      .eq("lock_version", input.expected.lockVersion)
      .select("id,lock_version")
      .maybeSingle();
    if (atualizada.error) falha("Atualização da proposta de diferenciação", atualizada.error);
    if (!atualizada.data) throw new DifferentiationConflictError("A proposta mudou desde a leitura (outra aba ou outro membro). Recarregue e tente de novo.");
  }
  const relida = await readDifferentiationProposal(context, input.groupId);
  if (!relida || relida.state !== input.state) throw new Error("O readback da proposta de diferenciação não confirmou a gravação.");
  return relida;
}
