import "server-only";
import { createHash } from "node:crypto";
import {
  ARCHITECT_SUGGESTIONS_SUBJECT_TYPE,
  normalizeKeyword,
  readArchitectSuggestionItem,
  readArchitectSuggestionSource,
  type ArchitectSuggestionStoredMeasurement,
} from "@/lib/arquiteto/minerador-suggestions";
import type { ArchitectSuggestionPorts } from "@/lib/minerador/architect-suggestions-apply";
import type { ArchitectSuggestionFacts, ArchitectSuggestionKeywordFact, ArchitectSuggestionRecordRead } from "@/lib/minerador/architect-suggestions-view";
import { importSubjectDiscoveryWithCore, SUBJECT_DISCOVERY_ORIGINS, type SubjectDiscoveryOrigin } from "@/lib/minerador/subject-discovery-import";
import { isEditorialGroupColor, type EditorialGroupColor } from "@/lib/editorial/editorial-groups";
import { normalizeGoogleAdsKeyword } from "@/lib/google/ads/normalizers";
import { handleGoogleAdsKeywordMetrics, type GoogleAdsMetricsReplay } from "./minerador-google-ads-metrics-http";
import { measureKeywordVolume } from "./minerador-volume-measure";
import { runKeywordLogicWithCore } from "./minerador-keyword-decision-core";
import type { PipelineContext } from "./pipeline-runtime";

/**
 * "SUGESTÕES DO ARQUITETO" NO MINERADOR — AS PORTAS REAIS (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2, F4; D3).
 *
 * Leitura: os registros que o Arquiteto gravou (`editorial_workflow_items`,
 * `subject_type = "architect_minerador_suggestions"`), em projeção leve (só
 * `payload->items`, nunca a medição guardada), dos últimos 30 dias; e o estado
 * de agora das keywords da marca (colunas estreitas, sem `analise_semantica`),
 * do item recebido no Arquiteto e da cor do grupo. Tudo com o cliente da
 * sessão (RLS de sempre).
 *
 * Escrita: SÓ pelos núcleos do Minerador, com a permissão de quem clicou —
 * `importSubjectDiscoveryWithCore` (minerador:create), `measureKeywordVolume`
 * com a medição guardada (minerador:edit; nenhuma consulta nova ao Google
 * Ads) e `runKeywordLogicWithCore` (minerador:edit).
 */

const PAGE = 1000;
const ID_BATCH = 100;
const RECORD_WINDOW_DAYS = 30;
const RECORD_LIMIT = 60;

const stableUuid = (...parts: string[]) => {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const canonicalJson = (value: unknown): unknown => Array.isArray(value) ? value.map(canonicalJson) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonicalJson(item)]))
  : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");

/**
 * A porta de "replay" da rota de métricas do Minerador (F3 · medir uma vez):
 * devolve as métricas que o Google Ads já mandou, uma por keyword pedida.
 * Keyword sem medição guardada derruba o pedido ANTES de qualquer gravação
 * (nunca vira "sem média" inventado). Mudou da melhoria do Arquiteto para cá
 * na F4: quem grava a medição é o Minerador.
 */
export function replayStoredMeasurements(guardadas: readonly ArchitectSuggestionStoredMeasurement[]): GoogleAdsMetricsReplay {
  const igual = (valor: string) => normalizeGoogleAdsKeyword(valor.replace(/\s+/g, " "));
  return async ({ keywords }) => {
    const metrics = keywords.map(pedida => {
      const achada = guardadas.find(item => item.metric.matchedRequestedKeywords.some(texto => igual(texto) === igual(pedida)) || igual(item.metric.keyword ?? "") === igual(pedida));
      if (!achada) throw Object.assign(new Error("A medição guardada não cobre esta keyword; nada foi gravado. Use o botão Volume."), { code: "SUGGESTION_REPLAY_MISSING" });
      return { ...achada.metric, matchedRequestedKeywords: [pedida] };
    });
    return { metrics, requestId: guardadas.find(item => item.requestId)?.requestId ?? null };
  };
}

type Db = PipelineContext["supabase"];

async function paginate<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw error;
    const page = (Array.isArray(data) ? data : []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function readArchitectSuggestionRecords(db: Db, brandId: string, now = new Date()): Promise<ArchitectSuggestionRecordRead[]> {
  const desde = new Date(now.getTime() - RECORD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("editorial_workflow_items")
    .select("subject_id,updated_at,items:payload->items,source:payload->>source,createdAt:payload->>createdAt,recordBrand:payload->>brandId")
    .eq("marca_id", brandId).eq("subject_type", ARCHITECT_SUGGESTIONS_SUBJECT_TYPE).eq("stage", "architect")
    .gte("updated_at", desde).order("updated_at", { ascending: false }).limit(RECORD_LIMIT);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).flatMap(row => {
    const source = readArchitectSuggestionSource(row.source);
    if (!source || typeof row.subject_id !== "string" || (typeof row.recordBrand === "string" && row.recordBrand !== brandId)) return [];
    const items = (Array.isArray(row.items) ? row.items : []).map(readArchitectSuggestionItem).filter((item): item is NonNullable<typeof item> => Boolean(item));
    return items.length ? [{ recordKey: row.subject_id, source, createdAt: typeof row.createdAt === "string" ? row.createdAt : String(row.updated_at ?? ""), items }] : [];
  });
}

export async function readArchitectSuggestionFacts(db: Db, brandId: string): Promise<ArchitectSuggestionFacts> {
  const linhas = await paginate<Record<string, unknown>>((from, to) => db.from("minerador_keywords")
    .select("id,keyword,status,intent,volume_source,volume_search,group_id").eq("brand_id", brandId).is("deleted_at", null).order("id").range(from, to));
  const keywordsById = new Map<string, ArchitectSuggestionKeywordFact>();
  const keywordsByNormalized = new Map<string, ArchitectSuggestionKeywordFact>();
  for (const row of linhas) {
    if (typeof row.id !== "string" || typeof row.keyword !== "string") continue;
    const fato: ArchitectSuggestionKeywordFact = {
      id: row.id, keyword: row.keyword, normalizedKeyword: normalizeKeyword(row.keyword),
      status: typeof row.status === "string" ? row.status : null,
      intent: typeof row.intent === "string" && row.intent.trim() ? row.intent : null,
      volumeSource: typeof row.volume_source === "string" ? row.volume_source : null,
      volume: typeof row.volume_search === "number" ? row.volume_search : null,
      groupId: typeof row.group_id === "string" ? row.group_id : null,
    };
    keywordsById.set(fato.id, fato);
    if (!keywordsByNormalized.has(fato.normalizedKeyword)) keywordsByNormalized.set(fato.normalizedKeyword, fato);
  }
  const ids = [...keywordsById.keys()];
  const recebidas = new Set<string>();
  for (let start = 0; start < ids.length; start += ID_BATCH) {
    const { data, error } = await db.from("editorial_workflow_items").select("subject_id,state")
      .eq("marca_id", brandId).eq("subject_type", "keyword").eq("stage", "architect").in("subject_id", ids.slice(start, start + ID_BATCH));
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ subject_id?: unknown; state?: unknown }>) if (typeof row.subject_id === "string" && row.state === "received") recebidas.add(row.subject_id);
  }
  const cores = new Map<string, EditorialGroupColor>();
  const grupos = await db.from("editorial_groups").select("id,color").eq("marca_id", brandId);
  if (!grupos.error) for (const row of (grupos.data ?? []) as Array<{ id?: unknown; color?: unknown }>) if (typeof row.id === "string" && isEditorialGroupColor(row.color)) cores.set(row.id, row.color);
  return { keywordsById, keywordsByNormalized, receivedInArquiteto: recebidas, colorOfGroup: groupId => groupId ? cores.get(groupId) ?? null : null };
}

async function readStoredMeasurements(db: Db, brandId: string, recordKeys: readonly string[]): Promise<Map<string, Record<string, ArchitectSuggestionStoredMeasurement>>> {
  const mapa = new Map<string, Record<string, ArchitectSuggestionStoredMeasurement>>();
  if (!recordKeys.length) return mapa;
  const { data, error } = await db.from("editorial_workflow_items").select("subject_id,measurements:payload->measurements")
    .eq("marca_id", brandId).eq("subject_type", ARCHITECT_SUGGESTIONS_SUBJECT_TYPE).eq("stage", "architect").in("subject_id", [...recordKeys]);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ subject_id?: unknown; measurements?: unknown }>) {
    if (typeof row.subject_id === "string" && row.measurements && typeof row.measurements === "object" && !Array.isArray(row.measurements)) mapa.set(row.subject_id, row.measurements as Record<string, ArchitectSuggestionStoredMeasurement>);
  }
  return mapa;
}

/**
 * As portas da caixa. `create`/`edit` são os contextos autorizados de quem
 * clicou (só resolvidos quando o pedido precisa deles); a leitura usa `view`.
 */
export function architectSuggestionPorts(input: {
  view: PipelineContext;
  create?: () => Promise<PipelineContext>;
  edit?: () => Promise<PipelineContext>;
}): ArchitectSuggestionPorts {
  const { view } = input;
  return {
    readRecords: () => readArchitectSuggestionRecords(view.supabase, view.brandId),
    readFacts: () => readArchitectSuggestionFacts(view.supabase, view.brandId),
    readMeasurements: recordKeys => readStoredMeasurements(view.supabase, view.brandId, recordKeys),
    importKeywords: async request => {
      if (!input.create || !input.edit) return { ok: false, reason: "importar exige minerador:create e minerador:edit" };
      const criar = await input.create(), editar = await input.edit();
      const origens = request.items.map(item => ({ ...item, origins: item.origins.filter((origem): origem is SubjectDiscoveryOrigin => (SUBJECT_DISCOVERY_ORIGINS as readonly string[]).includes(origem)) }));
      const resultado = await importSubjectDiscoveryWithCore({
        brandId: criar.brandId,
        actorUserId: criar.actorUserId,
        supabase: criar.supabase,
        request: { ...request, items: origens.map(item => ({ ...item, origins: item.origins.length ? item.origins : ["ads_keyword_seed" as const] })) },
        runLogic: async keywordIds => {
          const logica = await runKeywordLogicWithCore({ brandId: editar.brandId, keywordIds, db: editar.supabase });
          return { applied: logica.applied, unchanged: logica.unchanged, failed: logica.failed };
        },
      });
      return resultado.ok ? { ok: true } : { ok: false, reason: resultado.reason };
    },
    recordMeasurements: async entries => {
      if (!input.edit) return { failed: entries.map(entry => ({ keywordId: entry.keywordId, reason: "gravar a medição exige minerador:edit" })) };
      const editar = await input.edit();
      const replay = replayStoredMeasurements(entries.map(entry => entry.measurement));
      const medicao = await measureKeywordVolume(editar, entries.map(entry => entry.keywordId), { measure: (req, params, ctx) => handleGoogleAdsKeywordMetrics(req, params, ctx, { replay }) });
      return { failed: medicao.outcomes.filter(item => item.outcome === "failed").map(item => ({ keywordId: item.keywordId, reason: item.reason || "sem confirmação" })) };
    },
    runLogic: async keywordIds => {
      if (!input.edit) return { failedIds: [...keywordIds] };
      const editar = await input.edit();
      const logica = await runKeywordLogicWithCore({ brandId: editar.brandId, keywordIds, db: editar.supabase });
      return { failedIds: logica.readbackConfirmed ? logica.missingIds : [...keywordIds] };
    },
    hash,
    stableUuid,
  };
}
