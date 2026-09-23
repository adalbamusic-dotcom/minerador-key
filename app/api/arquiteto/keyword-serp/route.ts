import { NextResponse } from "next/server";
import { z } from "zod";
import {
  architectSerpCollectionRequest,
  architectSerpStoresBody,
  resolveDataForSeoCompatibilityConfig,
} from "@/lib/arquiteto/dataforseo-serp-compatibility";
import { DEFAULT_SERP_LENSES, SerpLensSchema, type SerpLens } from "@/lib/arquiteto/keyword-serp-record";
import { competitiveObservationFromCache } from "@/lib/arquiteto/serp-competitive-evidence";
import type { SerpCompetitiveObservation } from "@/lib/arquiteto/silo-primary-keyword";
import { SerpPaidBudgetExhaustedError, authorizeSerpPaidPlan, buildSerpPaidPlan, createPaidQueryBudget, type SerpPlanSlot } from "@/lib/arquiteto/serp-lens-plan";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor } from "@/lib/arquiteto/serp-lens-targeting";
import { SERP_CACHE_CANONICAL_LENS, sameSerpCacheLens, serpCacheLensLabel, type SerpCacheObservation } from "@/lib/editorial/serp-cache";
import { readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheRequest } from "@/lib/server/serp-cache";

/**
 * SERP POR KEYWORD, NAS QUATRO LENTES.
 *
 * A rota territorial responde outra pergunta: ela consulta o TEXTO da entidade
 * central de um território, no máximo duas consultas, e persiste um parecer.
 * Esta consulta cada KEYWORD do grupo, uma vez por lente, e devolve a
 * observação competitiva — domínios, blocos e perguntas. É o insumo que a
 * eleição por SERP e a proposta de reforço das páginas publicadas precisam.
 *
 * A PERSISTÊNCIA É O CACHE DE SERP (`lib/server/serp-cache.ts`). Antes a rota
 * gravava um registro por escopo (`keyword_serp_observations`) e pagava as
 * 4 lentes de novo a cada clique, mesmo quando o Minerador já tinha pago a
 * lente desktop da mesma keyword. Agora cada keyword × lente é UMA entrada do
 * cache, válida por 30 dias: quem pede de novo reaproveita, e só a entrada
 * ausente ou vencida vira chamada paga. O registro por escopo deixou de ser
 * escrito — ele duplicava o que o cache já guarda por keyword.
 *
 * Duas coisas que ela NÃO faz:
 *   - não decide nada: observação não move membership nem troca primária;
 *   - não varre: o lote vem de seleção humana e é pequeno por contrato.
 *
 * O provider é o mesmo já configurado na Connection global da Marca. A rota não
 * escolhe provider, não guarda credencial e não devolve nada disso.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  /** Identidade do grupo observado: `territory:<ref>`, artigo ou lote. Só rastreia o uso. */
  scopeId: z.string().min(1),
  territoryRef: z.string().min(1).nullable().default(null),
  // Teto de keywords por artigo mais folga para o grupo em avaliação.
  keywords: z.array(z.object({
    keywordId: z.string().min(1),
    keyword: z.string().trim().min(1),
  })).min(1).max(12),
  /** Lentes a observar. Vazio = as quatro do produto. */
  lenses: z.array(SerpLensSchema).min(1).max(4).default(() => [...DEFAULT_SERP_LENSES]),
  resultLimit: z.number().int().positive().max(50).default(10),
  /**
   * `plan` só lê o cache e devolve quantas lentes faltam e o custo estimado,
   * sem pagar nem resolver credencial. `execute` coleta — e só paga até o
   * número que a pessoa autorizou ao ver o plano (adendo A6).
   */
  mode: z.enum(["plan", "execute"]).default("execute"),
  authorizedPaidQueries: z.number().int().nonnegative().max(200).default(0),
});

/** Concorrência limitada: o provider é compartilhado com os outros módulos. */
const CONCURRENCY = 3;

async function runBounded<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

type Alvo = { keyword: { keywordId: string; keyword: string }; lens: SerpLens };
type Codigos = { locationCode: number; languageCode: string };

/*
 * A observação do agrupamento a partir da observação do cache.
 *
 * O `keywordId` é o do PEDIDO, não o gravado em `meta`: a mesma consulta pode
 * ter sido paga pelo Minerador para a mesma keyword, e o que a tela cruza é o
 * id que ela mandou. A lente é a que foi ENVIADA ao provider. Os citados pelo
 * AI Overview e as buscas relacionadas, que a observação do cache já trazia,
 * chegam agora à tela em campos próprios.
 */
const paraObservacao = (alvo: Alvo, observacao: SerpCacheObservation, collectedAt: string): SerpCompetitiveObservation =>
  competitiveObservationFromCache(alvo.keyword.keywordId, alvo.lens, observacao, collectedAt);

export async function POST(request: Request) {
  const operationRequestId = crypto.randomUUID();
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Pedido de SERP por keyword inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    // Um relógio só por requisição: validade do cache e data gravada batem.
    const now = new Date();

    /*
     * Uma consulta por keyword POR LENTE. É o produto cartesiano mesmo: sem
     * observar a mesma keyword em dispositivos diferentes não há como medir a
     * divergência entre lentes, e sem ela o universo pareceria sempre um só.
     */
    const alvos: Alvo[] = parsed.data.keywords.flatMap(keyword =>
      parsed.data.lenses.map(lens => ({ keyword, lens })));

    /*
     * Endpoint `advanced`, e não por capricho: medido no provider em
     * 2026-09-20, mesma keyword e mesma lente, o `regular` devolveu 8 domínios
     * e ZERO perguntas do People Also Ask (anunciado em `item_types` e não
     * entregue); o `advanced` devolveu 13 domínios e 4 perguntas — os 5 a mais
     * são citações do AI Overview.
     *
     * Localidade e idioma da chave: os que o Minerador usaria para a keyword
     * (adendo A8 — o resolvedor dele sobre o targeting da última medição, lido
     * aqui, no servidor, filtrado pela marca). Sem esse targeting, os do
     * ambiente, sem ler credencial: é deles que `buildDataForSeoSerpConfig`
     * tira os códigos da config, então a chave é o que seria enviado.
     */
    const pedidoDe = (alvo: Alvo, codigos: Codigos): SerpCacheRequest => ({
      query: { keyword: alvo.keyword.keyword, ...codigos, lens: alvo.lens, endpoint: "advanced" },
      depth: parsed.data.resultLimit,
      keywordId: alvo.keyword.keywordId,
    });
    const codigosDaChave = readDataForSeoTargetCodes();
    const targeting = await readMineradorKeywordTargetCodes(pipelineContext.supabase, pipelineContext.brandId, parsed.data.keywords.map(keyword => keyword.keywordId), codigosDaChave);
    const codigosDe = (alvo: Alvo): Codigos => serpTargetCodesFor(targeting.codes, alvo.keyword.keywordId, codigosDaChave);
    const usaCodigosDoAmbiente = (alvo: Alvo) => !targeting.codes.has(alvo.keyword.keywordId);

    const observacoes = new Array<SerpCompetitiveObservation | null>(alvos.length).fill(null);
    // Quando cada lente do cache foi observada: o plano mede a diferença entre elas.
    const coletadasEm = new Array<string | null>(alvos.length).fill(null);
    let faltantes = alvos.map((alvo, indice) => ({ indice, alvo, pedido: pedidoDe(alvo, codigosDe(alvo)) }));

    /*
     * 1. CACHE PRIMEIRO, em modo `observation`: o agrupamento só lê domínios,
     * blocos e perguntas (~1 KB por entrada), e o corpo do provider não
     * trafega (R8 da SDD de egress).
     *
     * O PLANO lê só `meta` (~0,3 KB): para contar o que falta basta saber se a
     * entrada existe — todo gravador grava a observação junto. Antes o plano
     * lia a observação e a execução lia de novo: a leitura da rota dobrava.
     *
     * Banco fora não derruba a coleta do usuário: tudo vira falta e a rota
     * paga como pagava antes do cache.
     */
    const soPlano = parsed.data.mode === "plan";
    const acertouNoPlano = new Array<boolean>(alvos.length).fill(false);
    try {
      const consultas = await lookupSerpCache(pipelineContext, faltantes.map(item => item.pedido), { mode: soPlano ? "meta" : "observation", now });
      const restantes: typeof faltantes = [];
      consultas.forEach((consulta, posicao) => {
        const item = faltantes[posicao];
        if (soPlano && consulta.hit) {
          acertouNoPlano[item.indice] = true;
          coletadasEm[item.indice] = consulta.hit.meta.collectedAt;
        } else if (consulta.hit?.observation) {
          observacoes[item.indice] = paraObservacao(item.alvo, consulta.hit.observation, consulta.hit.meta.collectedAt);
          coletadasEm[item.indice] = consulta.hit.meta.collectedAt;
        } else restantes.push(item);
      });
      faltantes = restantes;
    } catch (error) {
      console.warn("[arquiteto] keyword_serp_cache_read_failed", {
        operationRequestId,
        brandId: pipelineContext.brandId,
        message: error instanceof Error ? error.message.slice(0, 240) : "falha desconhecida",
      });
    }

    /*
     * O PLANO (adendo A6): cada keyword × lente que falta é uma chamada paga.
     * Nada é pago sem a pessoa ver quantas e confirmar esse número.
     */
    const acertou = (indice: number) => Boolean(observacoes[indice]) || acertouNoPlano[indice];
    const slots: SerpPlanSlot[] = alvos.map((alvo, indice) => ({
      payKey: `${alvo.keyword.keywordId}\u0000${serpCacheLensLabel(alvo.lens)}`, dateGroup: alvo.keyword.keywordId, lens: alvo.lens,
      primary: sameSerpCacheLens(alvo.lens, SERP_CACHE_CANONICAL_LENS), conditional: false, payable: true,
      hitCollectedAt: acertou(indice) ? coletadasEm[indice] : null, missReason: acertou(indice) ? null : "sem entrada",
    }));
    /*
     * Aqui NÃO há recoleta por datas: a rota não sabe trocar uma lente antiga.
     * `recollectAvailable: false` tira a recoleta do plano — a prévia deixava
     * de oferecer um botão pago que nada fazia — e a divergência de datas
     * segue marcada no plano e em cada observação (`collectedAt`), que a
     * afinidade e a força usam para NÃO contar a divergência em dobro.
     */
    const plan = buildSerpPaidPlan({ lenses: parsed.data.lenses, slots, payMissingExtraLenses: true, recollectStaleLenses: false, recollectAvailable: false });
    if (parsed.data.mode === "plan") {
      return NextResponse.json({ success: true, data: { mode: "plan", operationRequestId, scopeId: parsed.data.scopeId, plan, lenses: parsed.data.lenses.map(serpCacheLensLabel), requested: alvos.length } });
    }
    const autorizacao = authorizeSerpPaidPlan(plan, parsed.data.authorizedPaidQueries);
    if (!autorizacao.ok) {
      // Nada foi pago: o plano de agora vai junto.
      return NextResponse.json({ success: false, error: autorizacao.message, code: autorizacao.code, data: { operationRequestId, plan } }, { status: 409 });
    }
    // Cada lente paga consome o autorizado; esgotado, a lente vira lacuna declarada.
    const orcamento = createPaidQueryBudget(parsed.data.authorizedPaidQueries);

    const gaps: { keywordId: string; lens: string; reason: string }[] = [];
    let coletadas = 0;
    let pagasAgora = 0;

    /*
     * 2. SÓ ENTÃO credencial e quota, e só com faltantes. A quota recusa zero
     * unidade, e com tudo no cache nem o Secret Store precisa ser lido.
     */
    if (faltantes.length) {
      let quotaResolvida = faltantes.length;
      let dataForSeo = await resolveDataForSeoCompatibilityConfig({
        actorUserId: pipelineContext.actorUserId,
        brandId: pipelineContext.brandId,
        client: pipelineContext.supabase,
        quotaUnits: quotaResolvida,
      });

      /*
       * A chave precisa ser o que vai ao provider. Se a config resolvida trouxer
       * outra localidade ou idioma, o que veio do cache foi observado noutro
       * mercado: nenhum acerto é usado, tudo é pago com os códigos da config e
       * gravado sob a chave deles.
       */
      const { locationCode, languageCode } = dataForSeo.config;
      if (locationCode !== codigosDaChave.locationCode || languageCode.trim().toLowerCase() !== codigosDaChave.languageCode) {
        console.warn("[arquiteto] keyword_serp_cache_codes_diverge", {
          operationRequestId,
          brandId: pipelineContext.brandId,
          key: codigosDaChave,
          config: { locationCode, languageCode },
        });
        /*
         * Só as keywords com os códigos do AMBIENTE perdem o acerto: a chave
         * das que têm os códigos do Minerador é o que vai ao provider. As
         * pagas a mais continuam limitadas ao plano autorizado.
         */
        alvos.forEach((alvo, indice) => { if (usaCodigosDoAmbiente(alvo)) observacoes[indice] = null; });
        faltantes = alvos
          .map((alvo, indice) => ({ indice, alvo, pedido: pedidoDe(alvo, usaCodigosDoAmbiente(alvo) ? { locationCode, languageCode } : codigosDe(alvo)) }))
          .filter(item => !observacoes[item.indice]);
        if (faltantes.length > quotaResolvida) {
          quotaResolvida = faltantes.length;
          dataForSeo = await resolveDataForSeoCompatibilityConfig({
            actorUserId: pipelineContext.actorUserId,
            brandId: pipelineContext.brandId,
            client: pipelineContext.supabase,
            quotaUnits: quotaResolvida,
          });
        }
      }

      await runBounded(faltantes, CONCURRENCY, async item => {
        try {
          // Fora do plano autorizado, nada é pago: a lente vira lacuna com o motivo.
          if (!orcamento.take()) throw new SerpPaidBudgetExhaustedError("Fora do plano de chamadas autorizado; a lente não foi paga.");
          pagasAgora += 1;
          /*
           * A canônica é paga com 20 (a profundidade da CALL 3 do Minerador,
           * que senão pagaria de novo) e guarda o corpo, que tem leitores. As
           * três extras ficam em 10 e gravam só meta, observação e o digest que
           * o núcleo acrescenta: esta rota lê só a observação.
           */
          const coleta = await collectAndCacheSerp(pipelineContext, architectSerpCollectionRequest(item.pedido), {
            config: dataForSeo.config,
            operationRequestId,
            collectedBy: "arquiteto",
            now,
            storeBody: architectSerpStoresBody(item.alvo.lens),
          });
          // Gravar é otimização: a observação já está na mão. Só registra.
          if (coleta.writeError) {
            console.warn("[arquiteto] keyword_serp_cache_write_failed", {
              operationRequestId,
              brandId: pipelineContext.brandId,
              message: coleta.writeError.slice(0, 240),
            });
          }
          /*
           * A observação da coleta nova sai do corpo podado, pelo mesmo
           * normalizador e no mesmo top 10 do acerto — provado equivalente ao
           * corpo cru por `tests/serp-cache.test.mts`. Assim uma keyword
           * reaproveitada e outra coletada agora são medidas pela mesma régua.
           */
          // Paga e recusada pelo provider: a lente é buraco, com o motivo dele —
          // o código e a mensagem da task dizem se o defeito foi o pedido (40501).
          if (!coleta.observation) {
            const { taskStatusCode, taskStatusMessage } = coleta.diagnostic;
            const doProvider = taskStatusCode && taskStatusCode !== 20000 ? ` (provider ${taskStatusCode}${taskStatusMessage ? `: ${taskStatusMessage}` : ""})` : "";
            throw new Error(`${coleta.observationError || "A resposta do provider não é uma SERP."}${doProvider}`);
          }
          observacoes[item.indice] = paraObservacao(item.alvo, coleta.observation, coleta.meta.collectedAt);
          coletadas += 1;
        } catch (error) {
          /*
           * Uma lente que falha não derruba as outras, e o buraco é DECLARADO:
           * uma coleta parcial que se anuncia completa faria a eleição parecer
           * decidida sobre evidência que ninguém observou.
           */
          gaps.push({
            keywordId: item.alvo.keyword.keywordId,
            lens: serpCacheLensLabel(item.alvo.lens),
            reason: error instanceof Error ? error.message : "Falha ao consultar a SERP.",
          });
        }
      });

      // Uso só do que foi pago: acerto de cache e lente fora do plano não consomem o provider.
      if (pagasAgora) await recordIntegrationUsage({
        resource: dataForSeo.resource,
        operation: "module_operation",
        module: "arquiteto",
        resultStatus: coletadas ? "succeeded" : "failed",
        units: pagasAgora,
        ...(coletadas ? {} : { errorCode: "KEYWORD_SERP_EMPTY" }),
        idempotencyKey: `dataforseo:keyword_serp:${operationRequestId}:${parsed.data.scopeId}`,
        metadata: {
          operationRequestId,
          operationKind: "keyword_serp",
          scopeId: parsed.data.scopeId,
          lenses: parsed.data.lenses.length,
          requested: alvos.length,
          reused: alvos.length - faltantes.length,
        },
      }).catch(() => undefined);
    }

    const observations = observacoes.filter((item): item is SerpCompetitiveObservation => Boolean(item));
    const reused = observations.length - coletadas;

    if (!observations.length) {
      return NextResponse.json({
        success: false,
        error: "Nenhuma lente respondeu: não há observação a devolver.",
        code: "KEYWORD_SERP_EMPTY",
        data: { operationRequestId, gaps },
      }, { status: 502 });
    }

    /*
     * Só o LOTE. O cache guarda por keyword × lente; juntar os lotes de um
     * Silo é da tela, que sabe quais keywords pediu.
     */
    return NextResponse.json({
      success: true,
      data: {
        operationRequestId,
        scopeId: parsed.data.scopeId,
        observations,
        lenses: parsed.data.lenses.map(serpCacheLensLabel),
        gaps,
        requested: alvos.length,
        reused,
        collected: coletadas,
      },
    });
  } catch (error) {
    const runtime = integrationRuntimeErrorResponse(error);
    if (runtime) return NextResponse.json({ success: false, error: runtime.message, code: runtime.code }, { status: runtime.status });
    const message = error instanceof Error ? error.message : "Não foi possível coletar a SERP das keywords.";
    return NextResponse.json({ success: false, error: message, code: "KEYWORD_SERP_FAILED" }, { status: 500 });
  }
}
