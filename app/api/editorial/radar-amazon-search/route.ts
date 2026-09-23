import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { DataForSeoSerpError } from "@/lib/minerador/dataforseo-serp-core";
import { resolveDataForSeoCanonicalSerpCompatibilityConfig, DataForSeoCanonicalError } from "@/lib/server/dataforseo-canonical";
import {
  DATAFORSEO_AMAZON_ENDPOINT,
  DataForSeoAmazonReadError,
  RADAR_AMAZON_DEFAULT_DEPTH,
  RADAR_AMAZON_MAX_DEPTH,
  executeDataForSeoAmazonQuery,
  type RadarAmazonQuerySearchMetadata,
} from "@/lib/server/dataforseo-amazon-operation";
import { RADAR_AMAZON_MAX_QUERIES, buildRadarAmazonSearchRun, radarAmazonQueryId } from "@/lib/radar/amazon-search-run";
import { buildRadarAmazonUniverse, type RadarAmazonRelatedSearch, type RadarAmazonSerpResult } from "@/lib/radar/amazon-search-model";
import { RadarPrimaryModeConflictError } from "@/lib/radar/search-mode";
import { RadarAmazonEditorialIntentSchema, RadarAmazonResearchTargetSchema, radarAmazonSupportQuery, radarAmazonValidateSetup } from "@/lib/radar/amazon-editorial-target";
import { RadarStartError, radarStartPorts } from "@/lib/server/radar-youtube-start";
import { finishRadarAmazonRun, startRadarAmazonRun } from "@/lib/server/radar-amazon-start";
import { recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { collectRadarGoogleSupport, type RadarSupportCollectionOutcome } from "@/lib/server/radar-support-research";
import { radarProviderDeviceEchoRecorder } from "@/lib/server/radar-provider-echo";
import {
  RadarResearchPackageRecordSchema,
  radarAmazonPrimaryCounts,
  radarPackageHeadline,
  radarPackageNeedsSupportRetry,
  radarPackageStatus,
} from "@/lib/radar/research-package";
import { createRadarAnalysisSuccessor } from "@/lib/radar/analysis-contracts";
import {
  RadarAmazonAnalyzeError,
  analyzeRadarAmazonInvestigation,
  finalizeRadarAmazonInvestigation,
} from "@/lib/server/radar-amazon-analyze";
import { RadarAmazonFinalizeError, RadarAmazonRunRefError } from "@/lib/radar/amazon-evidence";

/**
 * ===== A COLETA DA SERP DA AMAZON — AMAZON_SEARCH_1 · §20 e §21 =====
 *
 * ========================= AÇÃO EXPLÍCITA, SEMPRE =========================
 *
 * §21: só o clique de START chega aqui. Não há GET que colete, não há efeito
 * que a chame, e ela custa dinheiro por consulta — é `POST` por isso, e não
 * por convenção.
 *
 * ===================== O APOIO DO GOOGLE NÃO MORA AQUI =====================
 *
 * §17 manda uma leitura de apoio depois da principal. Ela é a MESMA coleta
 * canônica de SERP que o perfil Google usa, disparada pela página no mesmo
 * clique — e não uma segunda porta ao provider dentro desta rota. Duas portas
 * seriam duas políticas de coleta, e uma delas acabaria sem o bloqueio de
 * duplo clique ou sem a localidade da marca.
 */

const ConsultaSchema = z.object({
  queryId: z.string().min(1).max(64),
  text: z.string().trim().min(2).max(200),
  origin: z.enum(["PRIMARY_KEYWORD", "ARTICLE_TOPIC"]).default("PRIMARY_KEYWORD"),
  reason: z.string().trim().min(1).max(500).default("Consulta planejada pelo Radar."),
}).strict();

const CorpoSchema = z.object({
  /*
   * §1 e §5 · DUAS INTENÇÕES, E SÓ DUAS.
   *
   * `collect` é o START inteiro: Amazon primary + apoio do Google + pacote.
   * `retry-support` alcança SÓ o apoio — refazer a primária para corrigir o
   * apoio cobraria de novo a coleta cara para arrumar a barata.
   *
   * Quem decide o que é válido é o SERVIDOR (§2): o navegador manda a
   * intenção, e a transição é conferida contra o que está gravado.
   */
  /*
   * ====== AMAZON_SEARCH_2 · DUAS INTENÇÕES A MAIS, E NENHUMA GASTA ======
   *
   * `analyze` deriva o blueprint do que já foi coletado; `finalize` congela.
   * Provider calls = 0 nas duas — e é por isso que elas podem ser repetidas
   * sem medo, ao contrário de `collect`.
   */
  /*
   * ====== §19 e §20 · `resolve-product` — AMAZON_EDITORIAL_TARGET_1 ======
   *
   * Uma intenção PRÓPRIA, e não um efeito colateral de digitar. "óleo nivea"
   * devolve variantes, tamanhos e versões; escolher qual delas o artigo avalia é
   * decisão humana, e descobrir os candidatos custa uma consulta.
   *
   * Ela não abre corrida e não grava investigação: devolve candidatos e para. O
   * que grava é o START, depois de a pessoa ter escolhido.
   */
  action: z.enum(["collect", "retry-support", "analyze", "finalize", "resolve-product"]),
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
  /*
   * O PLANO DE CONSULTA SÓ FAZ SENTIDO PARA QUEM VAI COLETAR.
   *
   * Exigi-lo em `analyze` obrigaria a tela a remontar um plano para pedir uma
   * derivação do que já está gravado — e um plano remontado divergente do
   * coletado seria uma segunda verdade sobre a mesma pesquisa.
   */
  queries: z.array(ConsultaSchema).max(RADAR_AMAZON_MAX_QUERIES).default([]),
  /*
   * ===== §17 e §18 · O ALVO EDITORIAL — AMAZON_EDITORIAL_TARGET_1 =====
   *
   * QUEM VALIDA É O SERVIDOR. O navegador desabilita o botão, e isso é conforto
   * de tela: um pedido montado à mão continuaria pagando uma coleta sobre uma
   * configuração incompleta. A regra do §17 roda aqui, antes do START.
   *
   * Opcional porque é aditivo: um artigo anterior a este gate continua coletando
   * pela keyword principal, como sempre fez.
   */
  editorialSetup: z.object({
    intent: RadarAmazonEditorialIntentSchema,
    target: RadarAmazonResearchTargetSchema,
  }).strict().nullable().default(null),
  depth: z.number().int().min(1).max(RADAR_AMAZON_MAX_DEPTH).default(RADAR_AMAZON_DEFAULT_DEPTH),
  /** A localidade da marca, para o apoio do Google usar a mesma da SERP dela. */
  location: z.string().trim().min(2).max(120).default("Brasil"),
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
     * Aceitar o id que o cliente mandou deixaria a proveniência de um produto
     * apontar para uma consulta que nunca existiu.
     */
    for (const consulta of input.queries) {
      if (radarAmazonQueryId(consulta.text) !== consulta.queryId) {
        throw new AuthzError(400, "O identificador de uma das consultas não corresponde ao texto dela.");
      }
    }

    /*
     * §5 · O RETRY DO APOIO NÃO PASSA PELO START.
     *
     * Ele não abre corrida, não toca a primária e não gasta Amazon. A guarda
     * está no read-model: só há retry quando a primária foi coletada e o apoio
     * não.
     */
    if (input.action === "retry-support") {
      return await repetirApoio({ input, profile });
    }

    /*
     * §19 e §20 · RESOLVER UM NOME É UMA AÇÃO HUMANA, e ela custa uma consulta.
     *
     * Não abre corrida, não grava análise e não declara alvo: devolve os
     * candidatos e para. Amarrá-la ao START faria a pessoa pagar a coleta
     * inteira para descobrir que escolheu o SKU errado.
     */
    if (input.action === "resolve-product") {
      return await resolverProduto({ input, profile });
    }

    /*
     * §2 e §23 · ANALISAR NÃO CHAMA PROVIDER.
     *
     * A derivação é determinística sobre a coleta gravada. Ela vem ANTES de
     * qualquer resolução de config justamente porque não há cota a reservar:
     * passar por lá reservaria quota para um trabalho que não gasta nenhuma.
     */
    if (input.action === "analyze") {
      const resultado = await analyzeRadarAmazonInvestigation({
        brandId: input.brandId,
        articleId: input.articleId,
        actorId: profile.userId,
        analyzedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        persistenceMode: "remote" as const,
        readbackConfirmed: true,
        analysisVersionId: resultado.analysisVersionId,
        blueprint: resultado.blueprint,
        supportApplied: resultado.supportApplied,
        headline: resultado.supportApplied
          ? "Blueprint competitivo da Amazon gerado com apoio do Google."
          : "Blueprint competitivo da Amazon gerado sem o apoio do Google — a análise declara a ausência.",
      }, { headers: noStoreHeaders });
    }

    /* §25 · o congelamento, também sem provider — e idempotente. */
    if (input.action === "finalize") {
      const resultado = await finalizeRadarAmazonInvestigation({
        brandId: input.brandId,
        articleId: input.articleId,
        actorId: profile.userId,
        finalizedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        persistenceMode: "remote" as const,
        readbackConfirmed: true,
        analysisVersionId: resultado.analysisVersionId,
        frozen: resultado.frozen,
        alreadyFrozen: resultado.alreadyFrozen,
        headline: resultado.alreadyFrozen
          ? "Esta investigação já estava finalizada: nenhuma fotografia nova foi tirada."
          : "Investigação Amazon finalizada.",
      }, { headers: noStoreHeaders });
    }

    /* Daqui para baixo é COLETA, e ela exige plano de consulta. */
    if (!input.queries.length) {
      return NextResponse.json({
        success: false,
        code: "radar_amazon_queries_required",
        error: "Uma coleta da Amazon precisa de pelo menos uma consulta.",
      }, { status: 400, headers: noStoreHeaders });
    }

    /*
     * §17 e §20 · NENHUMA CHAMADA PAGA ANTES DE O ALVO FECHAR.
     *
     * A validação acontece ANTES do START — antes da corrida `COLLECTING`, antes
     * da reserva de cota e muito antes do provider. Um `PRODUCT_VS_PRODUCT` com
     * um produto só, ou um `TOP_BEST` sem categoria, para aqui e não custa nada.
     */
    if (input.editorialSetup) {
      const validacao = radarAmazonValidateSetup(input.editorialSetup);
      if (!validacao.valid) {
        return NextResponse.json({
          success: false,
          code: "radar_amazon_target_invalid",
          error: validacao.blockedReason || "A configuração do alvo editorial da Amazon está incompleta.",
          issues: validacao.issues,
        }, { status: 422, headers: noStoreHeaders });
      }
    }

    /*
     * §20 · O START INTEIRO, ANTES DE QUALQUER GASTO.
     *
     * Artigo válido → contexto confirmado → alvo conferido → corrida COLLECTING
     * confirmada. Só depois disso a rota resolve config (que já reserva cota) e
     * chama o provider.
     */
    const inicio = await startRadarAmazonRun({
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      actorId: profile.userId,
      runId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      /* §18 · a configuração viaja com a corrida que ela originou. */
      editorialSetup: input.editorialSetup,
      queries: input.queries.map(consulta => ({
        queryId: consulta.queryId, text: consulta.text, origin: consulta.origin, reason: consulta.reason,
        executed: false, resultCount: 0, failureReason: null,
        checkUrl: null, seResultsCount: null, itemsCount: null,
      })),
      limitations: input.limitations,
    }, radarStartPorts);

    /*
     * DAQUI PARA BAIXO A CORRIDA JÁ EXISTE EM `COLLECTING`.
     *
     * Qualquer erro — cota recusada, credencial ausente — não pode deixá-la
     * pendurada: a tela diria "Coletando…" para sempre e o artigo ficaria de
     * Amazon sem nada para retomar.
     */
    try {
      return await executarColeta({ input, profile, inicio });
    } catch (erro) {
      await fecharComoFalha({ input, profile, inicio, erro }).catch(() => {});
      throw erro;
    }
  } catch (error) {
    if (error instanceof RadarAmazonAnalyzeError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    /* §26 · referência quebrada é erro explícito, nunca reconstrução. */
    if (error instanceof RadarAmazonRunRefError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 409, headers: noStoreHeaders });
    if (error instanceof RadarAmazonFinalizeError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 409, headers: noStoreHeaders });
    if (error instanceof RadarPrimaryModeConflictError) return NextResponse.json({ success: false, ...error.body }, { status: error.status, headers: noStoreHeaders });
    if (error instanceof RadarStartError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Pedido de coleta da Amazon inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    if (error instanceof DataForSeoCanonicalError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 503, headers: noStoreHeaders });
    /* §14 e §15 · a recusa do provider tem código próprio, e não vira "vazia". */
    if (error instanceof DataForSeoAmazonReadError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 502, headers: noStoreHeaders });
    if (error instanceof DataForSeoSerpError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: noStoreHeaders });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}

/**
 * ====== A ÚNICA PORTA AO PROVIDER DA AMAZON — §19 ======
 *
 * Duas intenções chegam ao mesmo endpoint: a COLETA monta universo, a
 * RESOLUÇÃO mostra candidatos. É a mesma busca de prateleira, e o que difere é
 * o que se faz com a resposta.
 *
 * Elas passam por aqui porque duas chamadas diretas seriam duas políticas de
 * acesso ao provider — e a segunda envelheceria sem o `depth` conferido, sem a
 * tradução de locale ou sem a leitura de recusa que o §14 exige.
 */
async function consultarProdutosAmazon(
  entrada: { keyword: string; depth: number; operationRequestId: string; queryId: string },
  deps: {
    config: Parameters<typeof executeDataForSeoAmazonQuery>[1]["config"];
    /* R5 · o gravador do eco do aparelho: a MESMA resposta, lida de uma cópia. */
    fetchImpl?: Parameters<typeof executeDataForSeoAmazonQuery>[1]["fetchImpl"];
  },
) {
  return executeDataForSeoAmazonQuery({
    keyword: entrada.keyword,
    locationCode: deps.config.locationCode,
    /* §13 · a tradução e a região do mercado acontecem dentro do adapter. */
    languageCode: deps.config.languageCode,
    depth: entrada.depth,
    operationRequestId: entrada.operationRequestId,
    queryId: entrada.queryId,
  }, { config: deps.config, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
}

type ColetaEmCurso = {
  input: z.infer<typeof CorpoSchema>;
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>;
  inicio: Awaited<ReturnType<typeof startRadarAmazonRun>>;
};

async function fecharComoFalha({ input, profile, inicio, erro }: ColetaEmCurso & { erro: unknown }) {
  const motivo = erro instanceof Error ? erro.message : "A coleta da Amazon falhou antes de consultar o provider.";
  const corrida = buildRadarAmazonSearchRun({
    runId: inicio.run.runId,
    runVersion: inicio.run.runVersion,
    startedAt: inicio.run.startedAt,
    startedBy: inicio.run.startedBy,
    fingerprint: inicio.run.fingerprint,
    provenance: {
      provider: "dataforseo" as const,
      endpoint: DATAFORSEO_AMAZON_ENDPOINT,
      depth: input.depth,
      queriesRequested: input.queries.length,
      queriesSucceeded: 0,
      queriesFailed: input.queries.length,
      failures: input.queries.map(consulta => ({ queryId: consulta.queryId, reason: motivo })),
      collectedAt: new Date().toISOString(),
    },
    queries: inicio.run.queries.map(consulta => ({ ...consulta, executed: false, failureReason: motivo })),
    results: [], universe: [], relatedSearches: [], limitations: inicio.run.limitations,
  });
  await finishRadarAmazonRun({
    brandId: input.brandId, articleId: input.articleId, actorId: profile.userId,
    runId: inicio.run.runId, run: corrida,
  }, radarStartPorts);
}

async function executarColeta({ input, profile, inicio }: ColetaEmCurso) {
  const resolucao = await resolveDataForSeoCanonicalSerpCompatibilityConfig({
    actorUserId: profile.userId, brandId: input.brandId, quotaUnits: input.queries.length,
  });
  const config = resolucao.config;

  const results: RadarAmazonSerpResult[] = [];
  const relatedSearches: RadarAmazonRelatedSearch[] = [];
  const failures: Array<{ queryId: string; reason: string }> = [];
  const executadas: Array<{ queryId: string; resultCount: number; checkUrl: string | null; seResultsCount: number | null; itemsCount: number | null }> = [];
  let eco: RadarAmazonQuerySearchMetadata | null = null;
  /*
   * R5 · A AMAZON CONTINUA EM LENTE ÚNICA — e o aparelho que o provider
   * ecoou fica gravado. O pedido não muda: nenhum `device` ou `os` é enviado.
   */
  const ecoDoAparelho = radarProviderDeviceEchoRecorder();
  const collectedAt = new Date().toISOString();

  /*
   * UMA CONSULTA POR VEZ, E A FALHA DE UMA NÃO DERRUBA AS OUTRAS.
   *
   * Em paralelo, um 429 na terceira levaria junto as duas que já responderam —
   * e o usuário pagaria de novo por elas no próximo START.
   */
  for (const consulta of input.queries) {
    try {
      /*
       * §13 e 2.1 · A GRAFIA DO PROVIDER NÃO É ASSUNTO DESTA ROTA.
       *
       * O locale canônico sai daqui como está. Quem traduz — e quem completa a
       * região a partir do mercado, quando a configuração não a declara — é a
       * autoridade, dentro do adapter, que também confere o que vai enviar.
       */
      const normalizada = await consultarProdutosAmazon({
        keyword: consulta.text,
        depth: input.depth,
        operationRequestId: `${input.articleId}:${consulta.queryId}`,
        queryId: consulta.queryId,
      }, { config, fetchImpl: ecoDoAparelho.fetchImpl });

      results.push(...normalizada.results);
      relatedSearches.push(...normalizada.relatedSearches);
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
        reason: erro instanceof Error ? erro.message : "A consulta à Amazon falhou.",
      });
    }
  }

  /* O que foi PAGO entra no livro — a unidade é a consulta respondida. */
  if (executadas.length) {
    await recordIntegrationUsage({
      resource: resolucao.resource,
      operation: "module_operation",
      module: "radar",
      resultStatus: "succeeded",
      units: executadas.length,
      idempotencyKey: `dataforseo:radar:amazon-search:${input.articleId}:${input.articleDnaVersionId}:${collectedAt}`,
      providerReference: null,
      metadata: { operationKind: "amazon_search", articleId: input.articleId, queries: executadas.length, failed: failures.length },
    });
  }

  const execucaoPorConsulta = new Map(executadas.map(item => [item.queryId, item]));
  const falhaPorConsulta = new Map(failures.map(item => [item.queryId, item.reason]));

  const corridaFinal = buildRadarAmazonSearchRun({
    runId: inicio.run.runId,
    runVersion: inicio.run.runVersion,
    startedAt: inicio.run.startedAt,
    startedBy: inicio.run.startedBy,
    fingerprint: inicio.run.fingerprint,
    provenance: {
      provider: "dataforseo" as const,
      endpoint: DATAFORSEO_AMAZON_ENDPOINT,
      locationCode: config.locationCode,
      /* A grafia GRAVADA é a que o provider ecoou, não a que a config guarda. */
      languageCode: eco?.languageCode || null,
      seDomain: eco?.seDomain || null,
      depth: input.depth,
      /* O eco, não o palpite: `null` quando a resposta não declarou aparelho. */
      device: ecoDoAparelho.echo()?.device ?? null,
      os: ecoDoAparelho.echo()?.os ?? null,
      queriesRequested: input.queries.length,
      queriesSucceeded: executadas.length,
      queriesFailed: failures.length,
      failures,
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
    universe: buildRadarAmazonUniverse(results),
    relatedSearches,
    limitations: inicio.run.limitations,
  });

  const gravada = await finishRadarAmazonRun({
    brandId: input.brandId, articleId: input.articleId, actorId: profile.userId,
    runId: inicio.run.runId, run: corridaFinal,
  }, radarStartPorts);

  /*
   * ============ §3 · O APOIO ACONTECE AQUI, NO SERVIDOR ============
   *
   * No perfil YouTube isto foi encadeado no navegador: a segunda chamada só
   * começava se a aba continuasse viva. Fechá-la entre as duas deixava a
   * investigação pela metade, com a coleta principal paga.
   *
   * §5 · A ORDEM É A DA CONSEQUÊNCIA. A primária falhar impede o apoio — gastar
   * a leitura do Google sobre uma investigação que não existe seria pagar por
   * contexto de nada.
   */
  const primariaOk = gravada.run.state === "COLLECTED" && gravada.run.universe.length > 0;
  /*
   * ============ §22 · O APOIO OLHA O MESMO ALVO QUE A AMAZON ============
   *
   * Continua sendo UMA camada e UMA chamada. O que muda é a pergunta: num
   * `PRODUCT_VS_PRODUCT`, "Produto A vs Produto B" é literalmente o que as
   * pessoas digitam no Google, e é essa SERP que mostra como a comparação é
   * feita. Perguntar pela keyword do artigo traria a intenção de outro texto.
   *
   * A derivação é determinística, e a keyword principal continua sendo a
   * reserva — é a única coisa que sempre existe.
   */
  const principal = input.editorialSetup
    ? radarAmazonSupportQuery({
      intent: input.editorialSetup.intent,
      target: input.editorialSetup.target,
      primaryKeyword: input.queries.find(consulta => consulta.origin === "PRIMARY_KEYWORD")?.text || null,
    })
    : input.queries.find(consulta => consulta.origin === "PRIMARY_KEYWORD")?.text || null;

  const apoio = primariaOk
    ? await collectRadarGoogleSupport({
      brandId: input.brandId,
      articleId: input.articleId,
      actorUserId: profile.userId,
      role: "SEO_COMMERCIAL_SUPPORT",
      location: input.location,
      primaryKeyword: principal,
    })
    : null;

  const pacote = await persistirPacote({
    input, profile,
    packageRunId: inicio.run.runId,
    startedAt: inicio.run.startedAt,
    run: gravada.run,
    apoio,
  });

  return NextResponse.json({
    success: true,
    persistenceMode: "remote" as const,
    readbackConfirmed: true,
    analysisVersionId: pacote.analysisVersionId,
    run: gravada.run,
    researchPackage: pacote.record,
    headline: radarPackageHeadline(pacote.record),
  }, { headers: noStoreHeaders });
}

/**
 * ============ §6 · O PACOTE, GRAVADO UMA VEZ ============
 *
 * Um clique, um pacote. As contagens vêm do universo JÁ deduplicado por ASIN —
 * é o que impede "2 produtos patrocinados" numa busca em que os dois slots são
 * o mesmo produto.
 */
async function persistirPacote(entrada: {
  input: z.infer<typeof CorpoSchema>;
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>;
  packageRunId: string;
  startedAt: string;
  run: Awaited<ReturnType<typeof finishRadarAmazonRun>>["run"];
  apoio: RadarSupportCollectionOutcome | null;
}) {
  const primariaOk = entrada.run.state === "COLLECTED" && entrada.run.universe.length > 0;
  const contagens = radarAmazonPrimaryCounts({
    universe: entrada.run.universe,
    queryCount: entrada.run.queries.filter(item => item.executed).length,
    relatedSearchCount: entrada.run.relatedSearches.length,
  });

  const primaryResearch = {
    source: "AMAZON_SERP" as const,
    status: primariaOk ? "COLLECTED" as const : "FAILED" as const,
    runId: entrada.run.runId,
    ...contagens,
    failureReason: primariaOk ? null : (entrada.run.provenance.failures[0]?.reason || "A coleta da Amazon não devolveu produto.").slice(0, 500),
  };

  const supportResearch = {
    source: "WEB_SERP" as const,
    role: "SEO_COMMERCIAL_SUPPORT" as const,
    status: !entrada.apoio ? "PENDING" as const
      : entrada.apoio.status === "COLLECTED" ? "COLLECTED" as const
        : entrada.apoio.status === "SKIPPED" ? "SKIPPED" as const
          : "FAILED" as const,
    snapshotId: entrada.apoio?.status === "COLLECTED" ? entrada.apoio.snapshotId : null,
    /*
     * §22 · A CONSULTA SOBREVIVE À FALHA.
     *
     * Ela era descartada quando o apoio falhava, e o retry ficava sem saber o
     * que perguntar — caía na consulta de prateleira da Amazon. Guardar o que
     * foi perguntado é o que torna o retry uma repetição, e não um chute novo.
     */
    keyword: entrada.apoio?.status === "COLLECTED"
      ? entrada.apoio.keyword
      : entrada.apoio?.status === "FAILED" ? entrada.apoio.keyword : null,
    collectedAt: entrada.apoio?.status === "COLLECTED" ? entrada.apoio.collectedAt : null,
    failureReason: entrada.apoio && entrada.apoio.status !== "COLLECTED"
      ? (entrada.apoio.status === "FAILED" ? entrada.apoio.reason : entrada.apoio.reason)
      : null,
  };

  const record = RadarResearchPackageRecordSchema.parse({
    profile: "AMAZON",
    packageRunId: entrada.packageRunId,
    status: radarPackageStatus({
      primaryStatus: primaryResearch.status,
      supportPlanned: true,
      supportStatus: primariaOk ? supportResearch.status : null,
    }),
    startedAt: entrada.startedAt,
    completedAt: new Date().toISOString(),
    primaryResearch,
    supportResearch,
  });

  const analysisVersionId = await gravarPacote({
    brandId: entrada.input.brandId,
    articleId: entrada.input.articleId,
    actorId: entrada.profile.userId,
    record,
  });
  return { record, analysisVersionId };
}

/**
 * §2 · A TRANSIÇÃO É DECIDIDA NO SERVIDOR.
 *
 * O navegador pede "repita o apoio"; quem confere se há o que repetir é o
 * estado gravado. Sem esta guarda, um clique num artigo sem primária coletada
 * gastaria uma leitura do Google sobre nada.
 */
async function repetirApoio(entrada: {
  input: z.infer<typeof CorpoSchema>;
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>;
}) {
  const estado = await radarStartPorts.loadRadarState({ brandId: entrada.input.brandId, articleId: entrada.input.articleId });
  const corrente = estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
  const pacoteAtual = corrente?.payload.researchPackage || null;

  if (!pacoteAtual || !radarPackageNeedsSupportRetry(pacoteAtual)) {
    return NextResponse.json({
      success: false,
      code: "radar_support_retry_not_applicable",
      error: "Não há apoio pendente para repetir neste artigo.",
    }, { status: 409, headers: noStoreHeaders });
  }

  /*
   * §22 · O RETRY PERGUNTA A MESMA COISA QUE O START PERGUNTARIA.
   *
   * A consulta de apoio é derivada do alvo GRAVADO — não do plano que o
   * navegador remontou. Cair nas `queries` faria o retry perguntar ao Google
   * pela consulta de PRATELEIRA ("Serum Nivea"), que é a pergunta da Amazon, e
   * não a do apoio ("melhores sérum facial Nivea").
   *
   * §5 · Amazon calls = 0. A corrida não é tocada.
   */
  const configuracaoGravada = corrente?.payload.amazonEditorialSetup || null;
  const consultaDeApoio = configuracaoGravada
    ? radarAmazonSupportQuery({
      intent: configuracaoGravada.intent,
      target: configuracaoGravada.target,
      primaryKeyword: pacoteAtual.supportResearch?.keyword || null,
    })
    : null;

  const apoio = await collectRadarGoogleSupport({
    brandId: entrada.input.brandId,
    articleId: entrada.input.articleId,
    actorUserId: entrada.profile.userId,
    role: "SEO_COMMERCIAL_SUPPORT",
    location: entrada.input.location,
    primaryKeyword: consultaDeApoio
      || pacoteAtual.supportResearch?.keyword
      || entrada.input.queries.find(consulta => consulta.origin === "PRIMARY_KEYWORD")?.text
      || null,
  });

  const supportResearch = {
    ...(pacoteAtual.supportResearch || { source: "WEB_SERP" as const, role: "SEO_COMMERCIAL_SUPPORT" as const }),
    status: apoio.status === "COLLECTED" ? "COLLECTED" as const : apoio.status === "SKIPPED" ? "SKIPPED" as const : "FAILED" as const,
    snapshotId: apoio.status === "COLLECTED" ? apoio.snapshotId : null,
    keyword: apoio.status === "COLLECTED" ? apoio.keyword : pacoteAtual.supportResearch?.keyword || null,
    collectedAt: apoio.status === "COLLECTED" ? apoio.collectedAt : null,
    failureReason: apoio.status === "COLLECTED" ? null : apoio.reason,
  };

  const record = RadarResearchPackageRecordSchema.parse({
    ...pacoteAtual,
    status: radarPackageStatus({
      primaryStatus: pacoteAtual.primaryResearch.status,
      supportPlanned: true,
      supportStatus: supportResearch.status,
    }),
    completedAt: new Date().toISOString(),
    supportResearch,
  });

  const analysisVersionId = await gravarPacote({
    brandId: entrada.input.brandId,
    articleId: entrada.input.articleId,
    actorId: entrada.profile.userId,
    record,
  });

  return NextResponse.json({
    success: true,
    persistenceMode: "remote" as const,
    readbackConfirmed: true,
    analysisVersionId,
    researchPackage: record,
    headline: radarPackageHeadline(record),
  }, { headers: noStoreHeaders });
}

/** A gravação do pacote sucede a versão corrente, com readback. */
async function gravarPacote(entrada: {
  brandId: string;
  articleId: string;
  actorId: string;
  record: z.infer<typeof RadarResearchPackageRecordSchema>;
}) {
  const estado = await radarStartPorts.loadRadarState({ brandId: entrada.brandId, articleId: entrada.articleId });
  const corrente = estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
  if (!estado || !corrente) throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para este artigo.", 404);

  const proxima = await createRadarAnalysisSuccessor(corrente, { researchPackage: entrada.record }, entrada.actorId);
  await radarStartPorts.appendAnalysis({
    brandId: entrada.brandId, articleId: entrada.articleId,
    expectedLock: estado.lockVersion, analysis: proxima,
  });
  return proxima.versionId;
}

/**
 * ===== §19 e §20 · A RESOLUÇÃO DE UM NOME EM PRODUTO =====
 *
 * ==================== NENHUM COMPORTAMENTO INVENTADO ====================
 *
 * §19 manda auditar a capacidade REAL do endpoint antes de implementar isto. O
 * `/v3/merchant/amazon/products/live/advanced` recebe `keyword` e devolve a
 * prateleira daquela busca, com `data_asin`, título, imagem e preço em cada
 * item. É exatamente a mesma chamada da coleta — o que muda é o que se faz com
 * a resposta.
 *
 * Então não há endpoint novo, provider novo nem capacidade suposta: há a busca
 * que já existe, usada para mostrar candidatos em vez de montar universo.
 *
 * ==================== PROFUNDIDADE PEQUENA, DE PROPÓSITO ====================
 *
 * Ninguém escolhe um produto entre vinte numa lista de rádio. Os primeiros
 * resultados da busca pelo nome são os candidatos plausíveis; o resto seria
 * ruído que custa o mesmo.
 */
async function resolverProduto(entrada: {
  input: z.infer<typeof CorpoSchema>;
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>;
}) {
  const termo = (entrada.input.queries[0]?.text || "").trim();
  if (!termo) {
    return NextResponse.json({
      success: false,
      code: "radar_amazon_resolve_term_required",
      error: "Informe o nome do produto que deve ser localizado na loja.",
    }, { status: 400, headers: noStoreHeaders });
  }

  const resolucao = await resolveDataForSeoCanonicalSerpCompatibilityConfig({
    actorUserId: entrada.profile.userId, brandId: entrada.input.brandId, quotaUnits: 1,
  });

  const normalizada = await consultarProdutosAmazon({
    keyword: termo,
    depth: RADAR_AMAZON_RESOLVE_DEPTH,
    operationRequestId: `${entrada.input.articleId}:resolve`,
    queryId: "resolve",
  }, { config: resolucao.config });

  /* O que foi PAGO entra no livro, mesmo sendo uma consulta de resolução. */
  await recordIntegrationUsage({
    resource: resolucao.resource,
    operation: "module_operation",
    module: "radar",
    resultStatus: "succeeded",
    units: 1,
    idempotencyKey: `dataforseo:radar:amazon-resolve:${entrada.input.articleId}:${termo}:${new Date().toISOString()}`,
    providerReference: null,
    metadata: { operationKind: "amazon_resolve_product", articleId: entrada.input.articleId },
  });

  /*
   * ORGÂNICO PRIMEIRO, e o patrocinado não some.
   *
   * Um slot pago no topo da busca por um nome é, com frequência, um concorrente
   * comprando a marca alheia — e oferecê-lo como primeira opção faria a pessoa
   * escolher o produto errado com um clique.
   */
  const candidatos = radarAmazonDedupeCandidates(normalizada.results);

  return NextResponse.json({
    success: true,
    term: termo,
    candidates: candidatos,
    headline: candidatos.length
      ? `${candidatos.length} produto(s) encontrado(s) para "${termo}".`
      : `A busca por "${termo}" não devolveu produto nenhum na loja.`,
  }, { headers: noStoreHeaders });
}

/** Profundidade da consulta de resolução — candidatos, não universo. */
const RADAR_AMAZON_RESOLVE_DEPTH = 10;

function radarAmazonDedupeCandidates(resultados: readonly RadarAmazonSerpResult[]) {
  const vistos = new Set<string>();
  const organicos: Array<{ asin: string; title: string; imageUrl: string | null; placement: string }> = [];
  const pagos: typeof organicos = [];

  for (const item of resultados) {
    if (vistos.has(item.asin)) continue;
    vistos.add(item.asin);
    const candidato = { asin: item.asin, title: item.title, imageUrl: item.imageUrl, placement: item.placement };
    (item.placement === "ORGANIC" ? organicos : pagos).push(candidato);
  }

  return [...organicos, ...pagos].slice(0, 8);
}
