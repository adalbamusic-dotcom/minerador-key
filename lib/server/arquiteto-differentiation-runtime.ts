import "server-only";

import { createGoogleAdsKeywordAccount } from "@/lib/google/ads/account";
import { generateGoogleAdsHistoricalMetrics } from "@/lib/google/ads/historical-metrics";
import type { GoogleAdsHistoricalMetric } from "@/lib/google/ads/contracts";
import { DifferentiationAiResponseSchema } from "@/lib/arquiteto/published-differentiation";
import { IMPROVEMENT_AI_MAX_TOKENS, ImprovementAiResponseSchema } from "@/lib/arquiteto/article-improvement-ai";
import { GOOGLE_ADS_VOLUME_BATCH_SIZE } from "@/lib/minerador/google-ads-volume";
import { normalizeKeyword } from "@/lib/minerador/keyword-import-core";
import { createGoogleAdsCanonicalClient, defaultGoogleAdsCanonicalTargeting, resolveGoogleAdsCanonicalContext, targetingToProviderInput } from "@/lib/server/google-ads-canonical";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI } from "@/lib/server/structured-ai";

/**
 * DIFERENCIAR PUBLICADOS — AS DUAS PORTAS QUE ABREM CREDENCIAL.
 *
 * Volume do Google Ads: as MÉTRICAS HISTÓRICAS que o Minerador usa para a
 * coluna Volume (`generateGoogleAdsHistoricalMetrics`, contexto canônico
 * `metrics`). Grátis. Aqui ela só LÊ a média mensal para decidir a proposta —
 * não grava nada no Minerador: a medida oficial da keyword nova acontece no
 * Processador, depois do envio.
 *
 * IA dos ângulos (Q1, a menor autoridade): a Connection DeepSeek canônica e a
 * camada compartilhada `generateStructuredAI`, com o schema estrito do domínio.
 * Só roda quando o humano pede (`ai: true` no plano).
 */

export async function readGoogleAdsAverageVolumes(input: {
  actorUserId: string;
  agencyId: string | null;
  brandId: string;
  keywords: readonly string[];
}): Promise<Map<string, number | null>> {
  const volumes = new Map<string, number | null>();
  const unicas = [...new Set(input.keywords.map(keyword => keyword.replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (!unicas.length) return volumes;
  const canonical = await resolveGoogleAdsCanonicalContext({ actorUserId: input.actorUserId, agencyId: input.agencyId, brandId: input.brandId, operation: "metrics" });
  const { client } = await createGoogleAdsCanonicalClient({ context: canonical });
  const account = createGoogleAdsKeywordAccount({ customerId: canonical.customerId, loginCustomerId: canonical.managerCustomerId });
  const targeting = targetingToProviderInput(canonical.targeting || defaultGoogleAdsCanonicalTargeting());
  for (let inicio = 0; inicio < unicas.length; inicio += GOOGLE_ADS_VOLUME_BATCH_SIZE) {
    const lote = unicas.slice(inicio, inicio + GOOGLE_ADS_VOLUME_BATCH_SIZE);
    const resultado = await generateGoogleAdsHistoricalMetrics(client, {
      account: { customerId: account.customerId, loginCustomerId: account.loginCustomerId || undefined },
      targeting,
      keywords: lote,
      includeAverageCpc: false,
    }, account);
    for (const metric of resultado.metrics) {
      for (const pedida of metric.matchedRequestedKeywords) volumes.set(normalizeKeyword(pedida), metric.averageMonthlySearches);
    }
    // Pedida sem resposta é "sem média" (sem volume), nunca zero inventado.
    for (const pedida of resultado.unmatchedRequestedKeywords) if (!volumes.has(normalizeKeyword(pedida))) volumes.set(normalizeKeyword(pedida), null);
  }
  return volumes;
}

/**
 * F3 · MEDIR UMA VEZ (SDD 2026-10-13, item 3). A MESMA consulta de métricas
 * históricas que o "Medir volume" do Minerador faz (com o CPC), mas só LÊ: a
 * melhoria guarda a métrica de cada keyword na execução e, ao "Gravar
 * melhorias", grava ESTA medição pelo núcleo do Minerador sem chamar o Google
 * Ads de novo. A conta vai mascarada (os 4 últimos dígitos, como o Minerador grava).
 */
export async function readGoogleAdsHistoricalMetricsOnce(input: {
  actorUserId: string;
  agencyId: string | null;
  brandId: string;
  keywords: readonly string[];
}): Promise<{ metrics: Array<{ metric: GoogleAdsHistoricalMetric; requestId: string | null }>; unmatched: string[] }> {
  const metrics: Array<{ metric: GoogleAdsHistoricalMetric; requestId: string | null }> = [];
  const unmatched: string[] = [];
  const unicas = [...new Set(input.keywords.map(keyword => keyword.replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (!unicas.length) return { metrics, unmatched };
  const canonical = await resolveGoogleAdsCanonicalContext({ actorUserId: input.actorUserId, agencyId: input.agencyId, brandId: input.brandId, operation: "metrics" });
  const { client } = await createGoogleAdsCanonicalClient({ context: canonical });
  const account = createGoogleAdsKeywordAccount({ customerId: canonical.customerId, loginCustomerId: canonical.managerCustomerId });
  const targeting = targetingToProviderInput(canonical.targeting || defaultGoogleAdsCanonicalTargeting());
  for (let inicio = 0; inicio < unicas.length; inicio += GOOGLE_ADS_VOLUME_BATCH_SIZE) {
    const lote = unicas.slice(inicio, inicio + GOOGLE_ADS_VOLUME_BATCH_SIZE);
    const resultado = await generateGoogleAdsHistoricalMetrics(client, {
      account: { customerId: account.customerId, loginCustomerId: account.loginCustomerId || undefined },
      targeting,
      keywords: lote,
      includeAverageCpc: true,
    }, account);
    for (const metric of resultado.metrics) metrics.push({ metric: { ...metric, customerId: metric.customerId.slice(-4).padStart(metric.customerId.length, "*") }, requestId: resultado.requestId ?? null });
    unmatched.push(...resultado.unmatchedRequestedKeywords);
  }
  return { metrics, unmatched };
}

/**
 * A Connection DeepSeek resolvida como nas outras rotas do Arquiteto
 * (`/api/arquiteto/article-dna`): o cliente da sessão, que enxerga a agência
 * e a marca do ator.
 */
export async function proposeDifferentiationAiAngles(input: { actorUserId: string; brandId: string; agencyId?: string | null; client?: Parameters<typeof resolveDeepSeekCanonicalConfig>[0]["client"]; system: string; user: string }): Promise<unknown> {
  const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: input.actorUserId, agencyId: input.agencyId ?? null, brandId: input.brandId, client: input.client });
  return generateStructuredAI({ provider, system: input.system, user: input.user, schema: DifferentiationAiResponseSchema, maxTokens: 1500 });
}

/**
 * Melhorar publicados e formar Assuntos — a leitura editorial da lista (decisão
 * do dono, 2026-09-30). Mesma Connection e mesma camada; uma chamada em lote,
 * com limite de tempo e sem Thinking, para caber na preparação (rota de 120 s).
 * A resposta volta crua: quem confere ids e barreiras é o domínio.
 */
export async function proposeArticleImprovementAiPicks(input: { actorUserId: string; brandId: string; agencyId?: string | null; client?: Parameters<typeof resolveDeepSeekCanonicalConfig>[0]["client"]; system: string; user: string; timeoutMs: number }): Promise<unknown> {
  const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: input.actorUserId, agencyId: input.agencyId ?? null, brandId: input.brandId, client: input.client });
  // O schema aqui é só o envelope `{ picks: [...] }`: cada escolha é conferida no domínio, uma a uma.
  return generateStructuredAI({ provider, system: input.system, user: input.user, schema: ImprovementAiResponseSchema, maxTokens: IMPROVEMENT_AI_MAX_TOKENS, timeoutMs: input.timeoutMs, thinkingMode: "disabled" });
}
