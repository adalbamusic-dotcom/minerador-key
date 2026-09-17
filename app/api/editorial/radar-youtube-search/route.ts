import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { DataForSeoSerpError } from "@/lib/minerador/dataforseo-serp-core";
import { resolveDataForSeoCanonicalSerpCompatibilityConfig, DataForSeoCanonicalError } from "@/lib/server/dataforseo-canonical";
import { DATAFORSEO_YOUTUBE_ENDPOINT, RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH, RADAR_YOUTUBE_MAX_BLOCK_DEPTH, executeDataForSeoYoutubeQuery, type RadarYoutubeQuerySearchMetadata } from "@/lib/server/dataforseo-youtube-operation";
import { RADAR_YOUTUBE_MAX_QUERIES, radarYoutubeQueryId } from "@/lib/radar/youtube-search-queries";
import { RadarPrimaryModeConflictError } from "@/lib/radar/search-mode";
import { buildRadarYoutubeUniverse } from "@/lib/radar/youtube-search-model";
import { buildRadarYoutubeSearchRun } from "@/lib/radar/youtube-search-run";
import { RadarStartError, finishRadarYoutubeRun, radarStartPorts, startRadarYoutubeRun } from "@/lib/server/radar-youtube-start";
import { recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import type { RadarYoutubeSearchResult } from "@/lib/radar/youtube-search-model";

/**
 * A COLETA DA SERP DO YOUTUBE — YOUTUBE_SEARCH_1 · §2 e §4.
 *
 * =========================== O QUE ESTA ROTA FAZ ===========================
 *
 * Executa as consultas no provider e devolve os resultados normalizados, com a
 * proveniência da coleta. Ela NÃO grava: a persistência da investigação é a
 * versão da análise do Radar, pela rota que já existe — o mesmo caminho do
 * Google. Uma segunda porta de escrita criaria duas autoridades sobre o mesmo
 * artigo.
 *
 * ========================= AÇÃO EXPLÍCITA, SEMPRE =========================
 *
 * §2: só o clique de START chega aqui. Não há GET que colete, não há efeito que
 * a chame, e ela custa dinheiro por consulta — é `POST` por isso, e não por
 * convenção.
 *
 * ===================== O LIMITE DO QUE O CLIENTE DECIDE =====================
 *
 * O plano de consultas é montado no domínio e chega no corpo. A rota confere
 * que cada `queryId` é o hash do próprio texto — um id não pode ser forjado — e
 * limita a quantidade ao teto do domínio. O que ela NÃO faz ainda é derivar o
 * plano do ArticleDNA do lado de cá; enquanto isso, quem pode chamar é quem já
 * tem `radar:edit` na marca, e cada consulta paga fica registrada na
 * proveniência, verbatim.
 */

const ConsultaSchema = z.object({
  queryId: z.string().min(1).max(64),
  text: z.string().trim().min(2).max(200),
  /*
   * A ORIGEM E O MOTIVO VIAJAM porque a corrida é gravada AQUI desde o 1.4, e
   * é ela que precisa explicar por que cada consulta existe. Eles não decidem
   * nada: `queryId` continua sendo recalculado do texto.
   */
  origin: z.string().trim().min(1).max(64).default("PRIMARY_KEYWORD"),
  sourceRef: z.string().trim().min(1).max(256).nullable().default(null),
  reason: z.string().trim().min(1).max(500).default("Consulta planejada pelo Radar."),
}).strict();

const CorpoSchema = z.object({
  action: z.literal("collect"),
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
  queries: z.array(ConsultaSchema).min(1).max(RADAR_YOUTUBE_MAX_QUERIES),
  /**
   * A PROFUNDIDADE — §2, e o padrão é 20.
   *
   * O teto protege a QUALIDADE antes do custo: a coleta real com 100 devolveu
   * 114 itens cuja cauda era derivação lateral do assunto. Expandir é ação
   * explícita de um gate futuro, e por isso nem o cliente consegue pedir 100.
   */
  resultLimit: z.number().int().min(1).max(RADAR_YOUTUBE_MAX_BLOCK_DEPTH).default(RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH),
  /** Limitações que o plano declarou. Viajam para ficar gravadas na corrida. */
  limitations: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = CorpoSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");

    /*
     * O ID DE UMA CONSULTA É O HASH DO TEXTO DELA.
     *
     * Aceitar o id que o cliente mandou deixaria a proveniência de um vídeo
     * apontar para uma consulta que nunca existiu — e o "achado por estas
     * consultas" da curadoria viraria ficção. Recalcular é barato e fecha isso.
     */
    for (const consulta of input.queries) {
      if (radarYoutubeQueryId(consulta.text) !== consulta.queryId) {
        throw new AuthzError(400, "O identificador de uma das consultas não corresponde ao texto dela.");
      }
    }

    /*
     * ======== O START INTEIRO, ANTES DE QUALQUER GASTO — 1.4 · §1 e §4 ========
     *
     * Artigo válido → contexto confirmado → modo confirmado → corrida
     * COLLECTING confirmada. Só depois disso a rota tem permissão de resolver
     * config (que já reserva cota) e chamar o provider.
     *
     * A ordem não é opcional e não depende do cliente: `startRadarYoutubeRun`
     * só RETORNA quando a corrida está gravada e relida. Se qualquer passo
     * falhar, ele lança — e o provider nunca é alcançado.
     */
    const inicio = await startRadarYoutubeRun({
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      actorId: profile.userId,
      runId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      queries: input.queries.map(consulta => ({
        queryId: consulta.queryId, text: consulta.text, origin: consulta.origin,
        sourceRef: consulta.sourceRef, reason: consulta.reason,
        resultCount: 0, executed: false, failureReason: null,
        checkUrl: null, seResultsCount: null, itemsCount: null,
      })),
      limitations: input.limitations,
    }, radarStartPorts);

    /*
     * ============ §7 · DEPOIS DO START, A CORRIDA SEMPRE FECHA ============
     *
     * Daqui para baixo a corrida JÁ existe em `COLLECTING`. Qualquer erro —
     * cota recusada, credencial ausente, o ledger reclamando — não pode
     * deixá-la pendurada: a tela diria "Coletando…" para sempre e o artigo
     * ficaria de YouTube sem nada para retomar.
     *
     * Ela fecha como `COLLECTION_FAILED` com o motivo, mesmo `runId`, e o erro
     * original sobe. O `primaryMode` continua YOUTUBE e o retry é uma nova
     * coleta no mesmo modo.
     */
    try {
      return await executarColeta({ input, profile, inicio });
    } catch (erro) {
      await fecharCorridaComoFalha({ input, profile, inicio, erro }).catch(() => {
        /* Fechar é best-effort: o erro original é o que quem chamou precisa ler. */
      });
      throw erro;
    }
  } catch (error) {
    if (error instanceof RadarPrimaryModeConflictError) return NextResponse.json({ success: false, ...error.body }, { status: error.status, headers: noStoreHeaders });
    /*
     * As falhas do START carregam código próprio — contexto não confirmado,
     * corrida não confirmada, disputa de trava. Quem chamou precisa distinguir
     * "tente de novo" de "outro START venceu" de "o banco não confirmou".
     */
    if (error instanceof RadarStartError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Pedido de coleta de YouTube inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    if (error instanceof DataForSeoCanonicalError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 503, headers: noStoreHeaders });
    if (error instanceof DataForSeoSerpError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}

type ColetaEmCurso = {
  input: z.infer<typeof CorpoSchema>;
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>;
  inicio: Awaited<ReturnType<typeof startRadarYoutubeRun>>;
};

/** §7 · fecha a corrida iniciada como falha, preservando identidade e motivo. */
async function fecharCorridaComoFalha({ input, profile, inicio, erro }: ColetaEmCurso & { erro: unknown }) {
  const motivo = erro instanceof Error ? erro.message : "A coleta de YouTube falhou antes de consultar o provider.";
  const corrida = buildRadarYoutubeSearchRun({
    runId: inicio.run.runId,
    runVersion: inicio.run.runVersion,
    startedAt: inicio.run.startedAt,
    startedBy: inicio.run.startedBy,
    fingerprint: inicio.run.fingerprint,
    provenance: {
      provider: "dataforseo" as const,
      endpoint: DATAFORSEO_YOUTUBE_ENDPOINT,
      blockDepth: input.resultLimit,
      queriesRequested: input.queries.length,
      queriesSucceeded: 0,
      queriesFailed: input.queries.length,
      failures: input.queries.map(consulta => ({ queryId: consulta.queryId, reason: motivo })),
      collectedAt: new Date().toISOString(),
    },
    queries: inicio.run.queries.map(consulta => ({ ...consulta, executed: false, failureReason: motivo })),
    results: [], universe: [], selectedVideoIds: [], limitations: inicio.run.limitations,
  });
  await finishRadarYoutubeRun({
    brandId: input.brandId, articleId: input.articleId, actorId: profile.userId,
    runId: inicio.run.runId, run: corrida,
  }, radarStartPorts);
}

async function executarColeta({ input, profile, inicio }: ColetaEmCurso) {
  {
    const resolucao = await resolveDataForSeoCanonicalSerpCompatibilityConfig({ actorUserId: profile.userId, brandId: input.brandId, quotaUnits: input.queries.length });
    const config = resolucao.config;

    const results: RadarYoutubeSearchResult[] = [];
    const failures: Array<{ queryId: string; reason: string }> = [];
    const executadas: Array<{ queryId: string; resultCount: number; checkUrl: string | null; seResultsCount: number | null; itemsCount: number | null }> = [];
    let descartados = 0;
    /* O eco do provider sobre COMO ele executou. Vale para a corrida inteira. */
    let eco: RadarYoutubeQuerySearchMetadata | null = null;
    /*
     * §13 · A CONTAGEM DE SHORTS ATRAVESSA A COLETA INTEIRA.
     *
     * Somada sobre todas as consultas, ela fica na proveniência: a próxima
     * coleta real responde sozinha se "0 Shorts" foi resposta do provider ou
     * perda nossa, sem depender de ninguém reproduzir a busca à mão.
     */
    let shortsDoProvider = 0;
    let shortsNormalizados = 0;
    const collectedAt = new Date().toISOString();

    /*
     * UMA CONSULTA POR VEZ, E A FALHA DE UMA NÃO DERRUBA AS OUTRAS.
     *
     * Em paralelo, um 429 do provider na terceira consulta levaria junto as
     * duas que já tinham respondido — e o usuário pagaria de novo por elas no
     * próximo START. Sequencial, o que deu certo fica, e o que falhou é
     * declarado por consulta.
     */
    for (const consulta of input.queries) {
      try {
        const normalizada = await executeDataForSeoYoutubeQuery({
          keyword: consulta.text,
          locationCode: config.locationCode,
          languageCode: config.languageCode,
          resultLimit: input.resultLimit,
          operationRequestId: `${input.articleId}:${consulta.queryId}`,
          queryId: consulta.queryId,
        }, { config });
        results.push(...normalizada.results);
        descartados += normalizada.discarded;
        shortsDoProvider += normalizada.diagnostics.rawShorts;
        shortsNormalizados += normalizada.diagnostics.normalizedShorts;
        eco = eco || normalizada.search;
        executadas.push({
          queryId: consulta.queryId,
          resultCount: normalizada.results.length,
          checkUrl: normalizada.search.checkUrl,
          seResultsCount: normalizada.search.seResultsCount,
          itemsCount: normalizada.search.itemsCount,
        });
      } catch (erro) {
        failures.push({
          queryId: consulta.queryId,
          reason: erro instanceof DataForSeoSerpError ? erro.message : "A consulta ao YouTube falhou.",
        });
      }
    }

    /*
     * O QUE FOI PAGO ENTRA NO LIVRO — como em qualquer operação de provider.
     *
     * A unidade é a CONSULTA bem-sucedida, não o START: uma coleta com duas de
     * quatro consultas respondidas custou duas. Registrar o START inteiro faria
     * o ledger cobrar por perguntas que o provider recusou.
     */
    if (executadas.length) {
      await recordIntegrationUsage({
        resource: resolucao.resource,
        operation: "module_operation",
        module: "radar",
        /*
         * O LEDGER SÓ CONHECE `succeeded` E `failed`, e o que houve aqui foi
         * sucesso parcial: as consultas que responderam foram pagas. A recusa
         * das outras está contada em `failed`, no metadata.
         */
        resultStatus: "succeeded",
        units: executadas.length,
        idempotencyKey: `dataforseo:radar:youtube-search:${input.articleId}:${input.articleDnaVersionId}:${collectedAt}`,
        providerReference: null,
        metadata: { operationKind: "youtube_search", articleId: input.articleId, queries: executadas.length, failed: failures.length },
      });
    }

    /*
     * §1 · PASSOS 11 e 12 — QUEM GRAVA A COLETA É O SERVIDOR.
     *
     * Até o 1.3 a rota devolvia os resultados e o navegador os persistia. Isso
     * fazia o dado pago depender de o cliente continuar vivo: fechar a aba
     * entre a resposta e a gravação perdia uma coleta que já tinha sido paga.
     */
    const execucaoPorConsulta = new Map(executadas.map(item => [item.queryId, item]));
    const falhaPorConsulta = new Map(failures.map(item => [item.queryId, item.reason]));

    const corridaFinal = buildRadarYoutubeSearchRun({
      /* A MESMA corrida que o START abriu — identidade preservada (§7). */
      runId: inicio.run.runId,
      runVersion: inicio.run.runVersion,
      startedAt: inicio.run.startedAt,
      startedBy: inicio.run.startedBy,
      fingerprint: inicio.run.fingerprint,
      provenance: {
        provider: "dataforseo" as const,
        endpoint: DATAFORSEO_YOUTUBE_ENDPOINT,
        locationCode: config.locationCode,
        languageCode: config.languageCode,
        /*
         * A PROFUNDIDADE GRAVADA É A QUE PEDIMOS; `device` e `os` são o que o
         * provider ECOOU. Inventar um "desktop" aqui porque é o nosso palpite
         * faria a proveniência descrever uma coleta que não aconteceu.
         */
        blockDepth: input.resultLimit,
        device: eco?.device || null,
        os: eco?.os || null,
        queriesRequested: input.queries.length,
        queriesSucceeded: executadas.length,
        queriesFailed: failures.length,
        failures,
        /* §13 · medido durante a leitura, nunca reconstruído depois. */
        providerShortsCount: shortsDoProvider,
        normalizedShortsCount: shortsNormalizados,
        collectedAt,
      },
      queries: inicio.run.queries.map(consulta => {
        const execucao = execucaoPorConsulta.get(consulta.queryId);
        return {
          ...consulta,
          resultCount: execucao?.resultCount || 0,
          executed: Boolean(execucao),
          failureReason: falhaPorConsulta.get(consulta.queryId) || null,
          checkUrl: execucao?.checkUrl ?? null,
          seResultsCount: execucao?.seResultsCount ?? null,
          itemsCount: execucao?.itemsCount ?? null,
        };
      }),
      results,
      universe: buildRadarYoutubeUniverse(results),
      selectedVideoIds: [],
      limitations: inicio.run.limitations,
    });

    const gravada = await finishRadarYoutubeRun({
      brandId: input.brandId, articleId: input.articleId, actorId: profile.userId,
      runId: inicio.run.runId, run: corridaFinal,
    }, radarStartPorts);

    return NextResponse.json({
      success: true,
      /* O que a tela lê é o RELIDO, nunca o que mandamos gravar. */
      persistenceMode: "remote" as const,
      readbackConfirmed: true,
      analysisVersionId: gravada.analysis.versionId,
      run: gravada.run,
      /* Itens que o provider devolveu e não puderam virar resultado. */
      discardedItems: descartados,
    }, { headers: noStoreHeaders });
  }
}
