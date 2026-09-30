import "server-only";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { resolveMineradorProcessState } from "@/lib/minerador/process-state";
import { classifyVolumeReadback, type VolumeReadbackOutcome } from "@/lib/minerador/volume-eligibility";
import { handleGoogleAdsKeywordMetrics } from "./minerador-google-ads-metrics-http";
import type { PipelineContext } from "./pipeline-runtime";

/**
 * ===== MEDIR VOLUME FORA DA TELA (SDD MCP ponta a ponta, F1) =====
 *
 * O botão "Volume" do Processador chama a rota do Google Ads em blocos de 200,
 * um por vez, relê cada keyword e classifica o desfecho. A rota já era o
 * núcleo (`handleGoogleAdsKeywordMetrics`, que aceita contexto autorizado); o
 * que morava só na tela era o laço e a releitura. Aqui estão os dois, com as
 * MESMAS funções puras da tela (`classifyVolumeReadback`,
 * `resolveMineradorProcessState`): a ferramenta MCP `measure_keywords` chama
 * esta função, e a tela continua como estava.
 *
 * Custo em dinheiro: zero (o Google Ads não cobra a consulta). Gasta a cota do
 * Google Ads da marca; por isso o plano, o aceite e o escopo provider.spend.
 * Cota atingida para o lote antes do próximo bloco, com o que já voltou gravado.
 */

/** O mesmo bloco da tela (`VOLUME_BATCH_CHUNK_SIZE`). */
export const VOLUME_MEASURE_CHUNK = 200;

export type VolumeMeasurePlan = {
  keywordIds: string[];
  keywords: Array<{ id: string; keyword: string; currentVolume: number | null }>;
  /** Pedidos que não são keywords desta marca (ou foram excluídos): ficam fora e não entram no hash. */
  missingIds: string[];
  chunks: number;
  planHash: string;
  cost: { moneyUsd: 0; googleAdsQuota: true; note: string };
};

export type VolumeMeasureOutcome = {
  keywordId: string;
  keyword: string | null;
  outcome: VolumeReadbackOutcome;
  volume: number | null;
  reason?: string;
};

export type VolumeMeasureResult = {
  requested: number;
  measured: number;
  withoutAverage: number;
  failed: number;
  quotaReached: boolean;
  stoppedReason: string | null;
  outcomes: VolumeMeasureOutcome[];
};

type Row = { id: string; keyword?: string; status?: string | null; intent?: string | null; volume_search?: unknown; results_allintitle?: unknown; analise_semantica?: Record<string, unknown> | null };

/** O hash do plano: a marca e as keywords que existem, em ordem estável. */
export function volumePlanHash(brandId: string, keywordIds: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify({ brandId, keywordIds: [...keywordIds].sort() })).digest("hex");
}

async function readRows(context: PipelineContext, keywordIds: readonly string[]): Promise<Map<string, Row>> {
  const rows = new Map<string, Row>();
  for (let start = 0; start < keywordIds.length; start += VOLUME_MEASURE_CHUNK) {
    const chunk = keywordIds.slice(start, start + VOLUME_MEASURE_CHUNK);
    const { data, error } = await context.supabase.from("minerador_keywords")
      .select("id,keyword,status,intent,volume_search,results_allintitle,analise_semantica")
      .eq("brand_id", context.brandId).is("deleted_at", null).in("id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Row[]) rows.set(String(row.id), row);
  }
  return rows;
}

export async function planKeywordVolume(context: PipelineContext, keywordIds: readonly string[]): Promise<VolumeMeasurePlan> {
  const pedidos = [...new Set(keywordIds)];
  const rows = await readRows(context, pedidos);
  const existentes = pedidos.filter(id => rows.has(id));
  return {
    keywordIds: existentes,
    keywords: existentes.map(id => {
      const row = rows.get(id)!;
      return { id, keyword: String(row.keyword ?? ""), currentVolume: typeof row.volume_search === "number" ? row.volume_search : null };
    }),
    missingIds: pedidos.filter(id => !rows.has(id)),
    chunks: Math.ceil(existentes.length / VOLUME_MEASURE_CHUNK),
    planHash: volumePlanHash(context.brandId, existentes),
    cost: { moneyUsd: 0, googleAdsQuota: true, note: "Sem custo em dinheiro: o Google Ads não cobra a consulta. Usa a cota do Google Ads da marca." },
  };
}

export type VolumeMeasureDeps = { measure?: typeof handleGoogleAdsKeywordMetrics };

export async function measureKeywordVolume(context: PipelineContext, keywordIds: readonly string[], deps: VolumeMeasureDeps = {}): Promise<VolumeMeasureResult> {
  const measure = deps.measure ?? handleGoogleAdsKeywordMetrics;
  const ids = [...new Set(keywordIds)];
  const outcomes: VolumeMeasureOutcome[] = [];
  let quotaReached = false;
  let stoppedReason: string | null = null;

  for (let start = 0; start < ids.length; start += VOLUME_MEASURE_CHUNK) {
    const chunk = ids.slice(start, start + VOLUME_MEASURE_CHUNK);
    if (stoppedReason) {
      outcomes.push(...chunk.map(id => ({ keywordId: id, keyword: null, outcome: "failed" as const, volume: null, reason: stoppedReason! })));
      continue;
    }
    const request = new NextRequest(`http://localhost/api/minerador/marcas/${context.brandId}/google-ads/metricas-keywords`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ keywordIds: chunk, candidateIds: [], operationRequestId: crypto.randomUUID() }),
    });
    const response = await measure(request, { params: Promise.resolve({ brandId: context.brandId }) }, context);
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !data?.success) {
      const code = typeof data?.code === "string" ? data.code : "google_ads_volume_request_failed";
      const reason = code === "GOOGLE_ADS_QUOTA"
        ? "O limite temporário da Google Ads API foi atingido."
        : typeof data?.message === "string" && data.message ? data.message : "Google Ads não retornou uma resposta válida.";
      if (code === "GOOGLE_ADS_QUOTA") quotaReached = true;
      // Como a tela: cota, 401 e 403 param o lote; o que já voltou continua gravado.
      if (code === "GOOGLE_ADS_QUOTA" || response.status === 401 || response.status === 403) stoppedReason = reason;
      outcomes.push(...chunk.map(id => ({ keywordId: id, keyword: null, outcome: "failed" as const, volume: null, reason })));
      continue;
    }
    const projections = Array.isArray(data.projections) ? data.projections as Array<{ keywordId?: string; volumeSearch?: number | null; measuredAt?: string | null }> : [];
    const byId = new Map(projections.filter(item => typeof item.keywordId === "string").map(item => [item.keywordId!, item]));
    const unmatched = new Set(Array.isArray(data.unmatchedKeywordIds) ? (data.unmatchedKeywordIds as unknown[]).map(String) : []);
    // A releitura decide, como na tela: sucesso só com o registro gravado lido de volta.
    const rows = await readRows(context, chunk);
    for (const id of chunk) {
      const row = rows.get(id) ?? null;
      const outcome = classifyVolumeReadback({
        projection: byId.get(id) ?? null,
        unmatched: unmatched.has(id),
        row,
        volumeComplete: row ? resolveMineradorProcessState(row).volume.complete : false,
      });
      outcomes.push({
        keywordId: id,
        keyword: row ? String(row.keyword ?? "") : null,
        outcome,
        volume: row && typeof row.volume_search === "number" ? row.volume_search : null,
        ...(outcome === "failed" ? { reason: byId.has(id) ? "Medição recebida, mas a releitura não confirmou." : "Sem medição confirmada." } : {}),
        ...(outcome === "confirmed_empty" || outcome === "empty" ? { reason: "Google Ads sem média oficial para esta keyword (processada, sem dado)." } : {}),
      });
    }
  }

  return {
    requested: ids.length,
    measured: outcomes.filter(item => item.outcome === "confirmed").length,
    withoutAverage: outcomes.filter(item => item.outcome === "confirmed_empty" || item.outcome === "empty").length,
    failed: outcomes.filter(item => item.outcome === "failed").length,
    quotaReached,
    stoppedReason,
    outcomes,
  };
}
