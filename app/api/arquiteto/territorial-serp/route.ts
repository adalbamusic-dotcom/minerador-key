import { NextResponse } from "next/server";
import { z } from "zod";
import {
  TerritorialSerpQuestionKindSchema,
  assessTerritorialSerp,
  type TerritorialLensContext,
  type TerritorialLensReading,
  type TerritorialSerpQuestion,
} from "@/lib/arquiteto/territorial-serp";
import {
  architectSerpCollectionRequest,
  architectSerpStoresBody,
  normalizeOrganicDigestSerp,
  resolveDataForSeoCompatibilityConfig,
  serpBodyAtRequestedDepth,
} from "@/lib/arquiteto/dataforseo-serp-compatibility";
import {
  SerpLensLabelSchema,
  SerpPaidBudgetExhaustedError,
  authorizeSerpPaidPlan,
  buildSerpPaidPlan,
  createPaidQueryBudget,
  resolveRequestedSerpLenses,
  staleSlotKeys,
  type SerpLensesMarker,
  type SerpPlanSlot,
} from "@/lib/arquiteto/serp-lens-plan";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor } from "@/lib/arquiteto/serp-lens-targeting";
import { readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { executeDataForSeoSerpOperation } from "@/lib/server/dataforseo-serp-operation";
import { normalizeDataForSeoSerpResponse } from "@/lib/server/dataforseo-serp-normalizer";
import {
  buildSerpOrganicDigest,
  normalizeSerpCacheKeyword,
  pruneSerpBody,
  serpCacheLensLabel,
  serpCacheSubjectId,
  type SerpCacheLens,
  type SerpOrganicDigest,
} from "@/lib/editorial/serp-cache";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheLookup, type SerpCacheRequest } from "@/lib/server/serp-cache";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { readbackTerritorialSerpAssessment, saveTerritorialSerpAssessment } from "@/lib/server/arquiteto-territorial-serp-store";
import { TerritorialSerpBaseSchema } from "@/lib/arquiteto/territorial-serp-record";
import type { SerpSearchInput } from "@/lib/radar/serp/contracts";

/**
 * SERP da etapa Silos.
 *
 * Consulta o provider interno já configurado na Connection global da Marca —
 * o mesmo caminho da SERP de Article. A rota não escolhe provider, não guarda
 * credencial e não expõe nada disso na resposta: a UI só recebe o parecer.
 *
 * O parecer é EVIDÊNCIA. Nenhuma escrita de território acontece aqui.
 *
 * CACHE DE SERP (2026-09-23). A rota pergunta ao cache ANTES de resolver
 * credencial e quota; só a consulta ausente ou vencida vira chamada paga, e a
 * quota é pedida para essas — com tudo em cache, o Secret Store nem é lido.
 *
 * MUDANÇA DE COMPORTAMENTO, dita: a consulta passou de `regular` para
 * `advanced`, com lente explícita. Medido no provider em 2026-09-20 para
 * "skincare facial": o `regular` anunciava `people_also_ask` em `item_types`
 * e entregava zero perguntas; o `advanced` entregou 4. A amplitude do parecer
 * (`breadthOf` conta `diagnostic.questions`) passa a enxergar o PAA — antes
 * esse sinal era sempre zero nesta rota.
 *
 * AS QUATRO LENTES (adendo A4, 2026-09-23). A lente principal é lida em corpo
 * e dá amplitude, competição, tipo dominante e PAA, como antes. As extras são
 * lidas pelo digest e votam a sobreposição entre os dois silos: `high` só com
 * maioria de lentes; alta em algumas e não na maioria é fronteira para decisão
 * humana. Nada é pago sem autorização: `plan` devolve o plano, e `execute`
 * só paga até o número que a pessoa confirmou.
 */

const QuestionSchema = z.object({
  questionId: z.string().min(1),
  kind: TerritorialSerpQuestionKindSchema,
  territoryRef: z.string().nullable(),
  comparedTerritoryRef: z.string().nullable(),
  queries: z.array(z.object({
    keywordId: z.string().min(1),
    keyword: z.string().trim().min(1),
    role: z.enum(["primary", "comparison"]),
  })).min(1).max(2),
  reason: z.string().min(1),
  /** O que a pergunta valida; sustenta a detecção de desatualização. */
  base: TerritorialSerpBaseSchema,
});

const RequestSchema = z.object({
  brandId: z.string().min(1),
  // Lote pequeno por decisão humana: a SERP é sob demanda, não varredura.
  questions: z.array(QuestionSchema).min(1).max(10),
  /** Forma LEGADA de uma lente só. O cliente atual manda `lenses`. */
  device: z.enum(["desktop", "mobile"]).optional(),
  /** As lentes a observar. Ausente (e sem `device`): as quatro do produto. */
  lenses: z.array(SerpLensLabelSchema).min(1).max(4).optional(),
  resultLimit: z.number().int().positive().max(50).default(10),
  /** `plan` lê só `meta` e devolve o plano de chamadas pagas; `execute` valida. */
  mode: z.enum(["plan", "execute"]).default("execute"),
  /** Quantas chamadas pagas a pessoa autorizou ao ver o plano. */
  authorizedPaidQueries: z.number().int().nonnegative().max(500).default(0),
  /** `false`: as lentes extras que faltam não são pagas. */
  payMissingExtraLenses: z.boolean().default(true),
  /** Recoleta das lentes antigas pelo portão de datas — só por pedido explícito. */
  recollectStaleLenses: z.boolean().default(false),
});

/** Concorrência limitada: o provider é compartilhado com os outros módulos. */
const CONCURRENCY = 3;

/**
 * `buildTerritorialSerpQuestions` identifica a consulta de um silo por
 * `territory:<ref>` — um pseudo-id do território, não uma keyword do acervo.
 * A entrada de cache só leva `keywordId` quando é keyword real: é por ele que
 * ela some junto com a keyword.
 */
const PSEUDO_ID_DE_TERRITORIO = "territory:";
const keywordIdDoAcervo = (keywordId: string) => (keywordId.startsWith(PSEUDO_ID_DE_TERRITORIO) ? null : keywordId);

/** O corpo que a normalização lê, com a proveniência de quem o observou. */
type CorpoObservado = {
  body: unknown;
  providerRequestId: string | null;
  collectedAt: string;
  locationCode: number;
  languageCode: string;
};

/** O digest de uma lente extra, com a proveniência — ou o motivo da falta. */
type DigestObservado =
  | { digest: SerpOrganicDigest; providerRequestId: string | null; collectedAt: string; locationCode: number; languageCode: string }
  | { missing: SerpLensesMarker["missing"][number]["reason"]; detail: string };

/** Entrada de cache que atende com o corpo — o único caso em que não se paga. */
const corpoEmCache = (lookup: SerpCacheLookup) => (lookup.hit?.body ? lookup.hit : null);

/** Uma consulta de lente extra: pergunta, consulta e lente. */
type PedidoExtra = { questionIndex: number; queryIndex: number; extraLens: SerpCacheLens; comparison: boolean; request: SerpCacheRequest };

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

export async function POST(request: Request) {
  const operationRequestId = crypto.randomUUID();
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Pedido de SERP inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    // Um único instante por requisição: validade do cache e `collectedAt` das faltas.
    const now = new Date();
    // Os mesmos códigos que a config resolvida terá, lidos sem tocar credencial.
    const alvo = readDataForSeoTargetCodes();
    /*
     * A lente principal é SEMPRE enviada ao provider: desktop é a canônica
     * desktop-windows (o eco provou que desktop sem `os` já era windows) e o
     * pedido legado `mobile` é android — nenhum sistema é suposto. Sem
     * `device` nem `lenses`, valem as quatro lentes do produto.
     */
    const requested = resolveRequestedSerpLenses({ lenses: parsed.data.lenses, device: parsed.data.device });
    const lens = requested.primary;
    const lensLabels = requested.lenses.map(serpCacheLensLabel);

    /*
     * OS CÓDIGOS DO MINERADOR (A8): a cabeceira do universo é keyword do
     * acervo e usa os códigos que o Minerador usaria para ela. O texto de um
     * território (`territory:<ref>`) continua com os do ambiente.
     */
    const idsDoAcervo = parsed.data.questions.flatMap(question => question.queries.map(query => keywordIdDoAcervo(query.keywordId))).filter((id): id is string => Boolean(id));
    const targeting = await readMineradorKeywordTargetCodes(pipelineContext.supabase, pipelineContext.brandId, idsDoAcervo, alvo);
    const codigosDa = (keywordId: string) => serpTargetCodesFor(targeting.codes, keywordIdDoAcervo(keywordId), alvo);
    const usaCodigosDoAmbiente = (pedido: SerpCacheRequest) => !pedido.keywordId || !targeting.codes.has(pedido.keywordId);

    const pedidos: SerpCacheRequest[] = parsed.data.questions.flatMap(question => question.queries.map(query => ({
      query: { keyword: query.keyword, ...codigosDa(query.keywordId), lens, endpoint: "advanced" as const },
      depth: parsed.data.resultLimit,
      keywordId: keywordIdDoAcervo(query.keywordId),
    })));
    /*
     * As lentes extras de cada consulta. Só a pergunta COM comparação as paga:
     * é o voto de sobreposição que muda o parecer. Sem comparação, a extra só
     * mostraria o formato — é lida do cache, quando há, e nunca paga.
     */
    const pedidosExtras: PedidoExtra[] = parsed.data.questions.flatMap((question, questionIndex) => question.queries.flatMap((query, queryIndex) =>
      requested.extras.map(extraLens => ({
        questionIndex, queryIndex, extraLens, comparison: question.queries.length > 1,
        request: {
          query: { keyword: query.keyword, ...codigosDa(query.keywordId), lens: extraLens, endpoint: "advanced" as const },
          depth: parsed.data.resultLimit,
          keywordId: keywordIdDoAcervo(query.keywordId),
        },
      }))));

    /** O plano a partir das leituras: primária atende com corpo, extra com a entrada (o digest é conferido depois). */
    const planoDe = (primarias: readonly SerpCacheLookup[], extras: readonly SerpCacheLookup[], primariaAtende: (lookup: SerpCacheLookup) => boolean) => {
      const slots: SerpPlanSlot[] = [
        ...primarias.map(lookup => ({
          payKey: lookup.subjectId, dateGroup: `${normalizeSerpCacheKeyword(lookup.request.query.keyword)}`, lens, primary: true,
          conditional: false, payable: true,
          hitCollectedAt: primariaAtende(lookup) ? lookup.hit?.meta.collectedAt ?? null : null, missReason: lookup.missReason,
        })),
        ...extras.map((lookup, index) => ({
          payKey: lookup.subjectId, dateGroup: `${normalizeSerpCacheKeyword(lookup.request.query.keyword)}`, lens: pedidosExtras[index].extraLens, primary: false,
          conditional: false, payable: pedidosExtras[index].comparison,
          hitCollectedAt: lookup.hit?.meta.collectedAt ?? null, missReason: lookup.missReason,
        })),
      ];
      return {
        slots,
        plan: buildSerpPaidPlan({ lenses: requested.lenses, slots, payMissingExtraLenses: parsed.data.payMissingExtraLenses, recollectStaleLenses: parsed.data.recollectStaleLenses }),
      };
    };

    const semCache = (lista: readonly SerpCacheRequest[]): SerpCacheLookup[] =>
      lista.map(pedido => ({ request: pedido, subjectId: serpCacheSubjectId(pedido.query), hit: null, missReason: "cache indisponível" }));

    // O plano não paga, não resolve credencial e não lê corpo nem digest.
    if (parsed.data.mode === "plan") {
      let metas: SerpCacheLookup[];
      try {
        metas = await lookupSerpCache(pipelineContext, [...pedidos, ...pedidosExtras.map(item => item.request)], { mode: "meta", now });
      } catch {
        metas = semCache([...pedidos, ...pedidosExtras.map(item => item.request)]);
      }
      const { plan } = planoDe(metas.slice(0, pedidos.length), metas.slice(pedidos.length), lookup => Boolean(lookup.hit));
      return NextResponse.json({ success: true, data: { mode: "plan", operationRequestId, plan, lenses: lensLabels, requested: parsed.data.questions.length } });
    }

    let lookups: SerpCacheLookup[];
    let lookupsExtras: SerpCacheLookup[];
    try {
      // Todos os corpos são normalizados: a camada `observation` não basta aqui.
      lookups = await lookupSerpCache(pipelineContext, pedidos, { mode: "body", now });
      // As extras só pelo digest: nunca o corpo de uma lente extra (R8).
      lookupsExtras = pedidosExtras.length ? await lookupSerpCache(pipelineContext, pedidosExtras.map(item => item.request), { mode: "digest", now }) : [];
    } catch (error) {
      // Cache fora nunca derruba a operação: tudo vira falta e é pago como antes.
      console.warn("[territorial-serp] leitura do cache de SERP falhou; seguindo sem cache", {
        operationRequestId, error: error instanceof Error ? error.message : String(error),
      });
      lookups = pedidos.map(pedido => ({ request: pedido, subjectId: serpCacheSubjectId(pedido.query), hit: null, missReason: "cache indisponível" }));
      lookupsExtras = semCache(pedidosExtras.map(item => item.request));
    }

    const { slots, plan } = planoDe(lookups, lookupsExtras, lookup => Boolean(corpoEmCache(lookup)));
    const autorizacao = authorizeSerpPaidPlan(plan, parsed.data.authorizedPaidQueries);
    if (!autorizacao.ok) {
      // Nada foi pago: o plano de agora vai junto, para a pessoa decidir de novo.
      return NextResponse.json({ success: false, error: autorizacao.message, code: autorizacao.code, data: { plan, lenses: lensLabels } }, { status: 409 });
    }
    const orcamento = createPaidQueryBudget(parsed.data.authorizedPaidQueries);
    // Lentes antigas pelo portão de datas: trocadas só quando a pessoa pediu.
    const recoletar = parsed.data.recollectStaleLenses ? staleSlotKeys(slots) : new Set<string>();

    // A mesma consulta em duas perguntas (o silo confirmado comparado com
    // vários novos) é paga uma vez só: a quota conta consultas distintas.
    const faltantes = plan.paidQueries;
    // A quota recusa zero unidade; sem falta, credencial e quota nem são lidas.
    const dataForSeo = faltantes > 0
      ? await resolveDataForSeoCompatibilityConfig({
        actorUserId: pipelineContext.actorUserId,
        brandId: pipelineContext.brandId,
        client: pipelineContext.supabase,
        quotaUnits: faltantes,
      })
      : null;

    /*
     * A chave do texto de território foi montada com `readDataForSeoTargetCodes()`,
     * que é de onde a config tira os mesmos códigos. Se ainda assim divergirem,
     * a chave não descreve o que a config enviaria: essas faltas são pagas SEM
     * cache, com os códigos da config — exatamente como a rota fazia antes. A
     * consulta com os códigos do Minerador não é afetada: a chave dela é o que
     * vai ao provider.
     */
    const configDiverge = Boolean(dataForSeo && (
      dataForSeo.config.locationCode !== alvo.locationCode
      || dataForSeo.config.languageCode.trim().toLowerCase() !== alvo.languageCode.trim().toLowerCase()
    ));
    if (configDiverge) {
      console.warn("[territorial-serp] localidade/idioma da config divergem da chave do cache; faltas pagas sem cache", {
        operationRequestId, faltantes,
      });
    }

    const coletas = new Map<string, Promise<CorpoObservado>>();
    const coletar = async (lookup: SerpCacheLookup): Promise<CorpoObservado> => {
      if (!dataForSeo) throw new Error("Consulta de SERP sem credencial resolvida.");
      const { query } = lookup.request;
      const codigosDivergem = configDiverge && usaCodigosDoAmbiente(lookup.request);
      if (codigosDivergem) {
        const resposta = await executeDataForSeoSerpOperation({
          keyword: query.keyword,
          locationCode: dataForSeo.config.locationCode,
          languageCode: dataForSeo.config.languageCode,
          device: query.lens.device,
          operatingSystem: query.lens.operatingSystem,
          resultLimit: lookup.request.depth,
          operationRequestId,
          payloadDepth: query.endpoint,
        }, { config: dataForSeo.config });
        return {
          body: resposta.body, providerRequestId: resposta.providerRequestId, collectedAt: now.toISOString(),
          locationCode: dataForSeo.config.locationCode, languageCode: dataForSeo.config.languageCode,
        };
      }
      /*
       * A canônica é paga com 20, a profundidade da CALL 3 do Minerador: com
       * 10, a entrada gravada aqui obrigaria o Minerador a pagar de novo. O
       * caminho sem cache, acima, não grava nada e segue na profundidade pedida.
       */
      const coleta = await collectAndCacheSerp(pipelineContext, architectSerpCollectionRequest(lookup.request), {
        config: dataForSeo.config, operationRequestId, collectedBy: "arquiteto", now,
      });
      if (coleta.write === "failed") {
        // A SERP já está na mão; o cache só não guardou desta vez.
        console.warn("[territorial-serp] gravação do cache de SERP falhou", {
          operationRequestId, subjectId: lookup.subjectId, error: coleta.writeError,
        });
      }
      // Falta: o corpo CRU recortado à profundidade pedida — o mesmo que o acerto devolve.
      return {
        body: serpBodyAtRequestedDepth(coleta.body, coleta.meta.depth, lookup.request.depth), providerRequestId: coleta.providerRequestId, collectedAt: coleta.meta.collectedAt,
        locationCode: query.locationCode, languageCode: query.languageCode,
      };
    };

    /**
     * LENTE EXTRA QUE FALTA: paga SEM corpo, com o digest que o núcleo grava em
     * toda lente não canônica. No caminho sem cache (config divergente), o
     * digest sai do corpo podado pela MESMA função — nada é gravado.
     */
    const coletasExtras = new Map<string, Promise<DigestObservado>>();
    const coletarExtra = async (lookup: SerpCacheLookup): Promise<DigestObservado> => {
      if (!dataForSeo) return { missing: "não paga", detail: "Consulta sem credencial resolvida." };
      const { query } = lookup.request;
      try {
        if (configDiverge && usaCodigosDoAmbiente(lookup.request)) {
          const resposta = await executeDataForSeoSerpOperation({
            keyword: query.keyword, locationCode: dataForSeo.config.locationCode, languageCode: dataForSeo.config.languageCode,
            device: query.lens.device, operatingSystem: query.lens.operatingSystem, resultLimit: lookup.request.depth,
            operationRequestId, payloadDepth: query.endpoint,
          }, { config: dataForSeo.config });
          const digest = buildSerpOrganicDigest(pruneSerpBody(resposta.body));
          return digest
            ? { digest, providerRequestId: resposta.providerRequestId, collectedAt: now.toISOString(), locationCode: dataForSeo.config.locationCode, languageCode: dataForSeo.config.languageCode }
            : { missing: "falha", detail: "A resposta do provider não é uma SERP." };
        }
        const coleta = await collectAndCacheSerp(pipelineContext, architectSerpCollectionRequest(lookup.request), {
          config: dataForSeo.config, operationRequestId, collectedBy: "arquiteto", now, storeBody: architectSerpStoresBody(query.lens),
        });
        if (coleta.write === "failed") {
          console.warn("[territorial-serp] gravação do cache de SERP (lente extra) falhou", {
            operationRequestId, subjectId: lookup.subjectId, error: coleta.writeError,
          });
        }
        return coleta.digest
          ? { digest: coleta.digest, providerRequestId: coleta.providerRequestId, collectedAt: coleta.meta.collectedAt, locationCode: query.locationCode, languageCode: query.languageCode }
          : { missing: "falha", detail: (coleta.observationError || "A resposta do provider não é uma SERP.").slice(0, 200) };
      } catch (error) {
        return { missing: "falha", detail: error instanceof Error ? error.message.slice(0, 200) : "Falha ao consultar a lente." };
      }
    };

    const assessments = [];
    const failures: { questionId: string; error: string }[] = [];
    let reaproveitadas = 0;
    let pagasNoTotal = 0;
    let cursor = 0;

    for (const [questionIndex, question] of parsed.data.questions.entries()) {
      const lookupsDaPergunta = lookups.slice(cursor, cursor + question.queries.length);
      cursor += question.queries.length;
      // Só conta o que ESTA pergunta mandou pagar; reuso dentro da requisição não é cobrado de novo.
      let pagas = 0;
      try {
        const blocosDaPrincipal: string[] = [];
        const snapshots = await runBounded(question.queries.map((query, indice) => ({ query, lookup: lookupsDaPergunta[indice], indice })), CONCURRENCY, async ({ query, lookup, indice }) => {
          const entrada = recoletar.has(lookup.subjectId) ? null : corpoEmCache(lookup);
          let observado: CorpoObservado;
          if (entrada) {
            reaproveitadas += 1;
            // Acerto: a proveniência é a da observação gravada, não a de agora.
            observado = {
              body: entrada.body, providerRequestId: entrada.meta.providerRequestId, collectedAt: entrada.meta.collectedAt,
              locationCode: entrada.meta.locationCode, languageCode: entrada.meta.languageCode,
            };
          } else {
            let coleta = coletas.get(lookup.subjectId);
            if (!coleta) {
              // Fora do plano autorizado, nada é pago: a pergunta falha dizendo por quê.
              if (!orcamento.take()) throw new SerpPaidBudgetExhaustedError();
              pagas += 1;
              pagasNoTotal += 1;
              coleta = coletar(lookup);
              coletas.set(lookup.subjectId, coleta);
            }
            observado = await coleta;
          }
          if (indice === 0) blocosDaPrincipal.push(...(buildSerpOrganicDigest(observado.body)?.blocks.map(bloco => bloco.type) || []));
          return normalizeDataForSeoSerpResponse(observado.body, {
            brandId: parsed.data.brandId,
            // A SERP territorial não pertence a um Article: a identidade da
            // consulta é a própria pergunta arquitetural.
            articleId: question.questionId,
            articleDnaVersionId: `territorial:${question.questionId}`,
            keywordId: query.keywordId,
            keywordDnaVersionId: `territorial:${query.keywordId}`,
            keyword: query.keyword,
            location: "Brasil",
            language: "pt-br",
            device: lens.device,
            // Rotula a lente que de fato foi enviada ao provider.
            operatingSystem: lens.operatingSystem,
            expectedIntent: "",
            expectedFormat: "",
            requiredTopics: [query.keyword],
            articleEntities: [],
            resultLimit: parsed.data.resultLimit,
            // Consulta de evidência: cada pergunta é lida do zero, sem sucessão
            // de versões — a arquitetura ainda não decidiu nada para versionar.
            version: 1,
            previousSnapshotId: null,
          }, { locationCode: observado.locationCode, languageCode: observado.languageCode }, observado.collectedAt, observado.providerRequestId);
        });

        /*
         * AS LENTES EXTRAS desta pergunta: digest do cache primeiro; a falta só
         * é paga na pergunta com comparação, se a pessoa autorizou.
         */
        const extrasDaPergunta = pedidosExtras.map((pedido, indice) => ({ pedido, lookup: lookupsExtras[indice] })).filter(item => item.pedido.questionIndex === questionIndex);
        const leituras = new Map<string, TerritorialLensReading>(requested.extras.map(extraLens => [serpCacheLensLabel(extraLens), {
          lens: serpCacheLensLabel(extraLens), primaryUrls: null, comparisonUrls: null, collectedAt: [],
        }]));
        const faltantesDaPergunta: SerpLensesMarker["missing"] = [];
        for (const { pedido, lookup } of extrasDaPergunta) {
          const label = serpCacheLensLabel(pedido.extraLens);
          const query = question.queries[pedido.queryIndex];
          const naoObservada = (reason: SerpLensesMarker["missing"][number]["reason"], detail: string) => {
            faltantesDaPergunta.push({ lens: label, keywordId: keywordIdDoAcervo(query.keywordId), reason, detail });
          };
          let observado: DigestObservado;
          const trocar = recoletar.has(lookup.subjectId) && pedido.comparison && parsed.data.payMissingExtraLenses;
          // O acerto serve como na lente principal: a divergência da config só muda o que é PAGO.
          if (lookup.hit && !trocar) {
            if (!lookup.hit.digest) { naoObservada("sem digest", "Entrada gravada antes do digest orgânico; não é paga de novo sem pedido."); continue; }
            observado = { digest: lookup.hit.digest, providerRequestId: lookup.hit.meta.providerRequestId, collectedAt: lookup.hit.meta.collectedAt, locationCode: lookup.hit.meta.locationCode, languageCode: lookup.hit.meta.languageCode };
          } else if (!pedido.comparison) {
            // Já paga nesta requisição por uma pergunta com comparação: é a mesma SERP, sem custo a mais.
            const jaPaga = coletasExtras.get(lookup.subjectId);
            if (!jaPaga) {
              naoObservada("sem par", "Pergunta sem comparação: a lente extra só mostraria formato, e não é paga.");
              continue;
            }
            observado = await jaPaga;
          } else if (!parsed.data.payMissingExtraLenses) {
            naoObservada("não paga", "A validação foi pedida só com as lentes em cache.");
            continue;
          } else {
            let coleta = coletasExtras.get(lookup.subjectId);
            if (!coleta) {
              if (!orcamento.take()) { naoObservada("não paga", "Fora do plano de chamadas autorizado."); continue; }
              pagas += 1;
              pagasNoTotal += 1;
              coleta = coletarExtra(lookup);
              coletasExtras.set(lookup.subjectId, coleta);
            }
            observado = await coleta;
          }
          if ("missing" in observado) { naoObservada(observado.missing, observado.detail); continue; }
          const snapshot = normalizeOrganicDigestSerp(observado.digest, {
            brandId: parsed.data.brandId, articleId: question.questionId, articleDnaVersionId: `territorial:${question.questionId}`,
            keywordId: query.keywordId, keywordDnaVersionId: `territorial:${query.keywordId}:${label}`, keyword: query.keyword,
            location: "Brasil", language: "pt-br", device: pedido.extraLens.device, operatingSystem: pedido.extraLens.operatingSystem,
            expectedIntent: "", expectedFormat: "", requiredTopics: [query.keyword], articleEntities: [],
            resultLimit: parsed.data.resultLimit, version: 1, previousSnapshotId: null,
          } satisfies SerpSearchInput, { locationCode: observado.locationCode, languageCode: observado.languageCode, collectedAt: observado.collectedAt, providerRequestId: observado.providerRequestId });
          const leitura = leituras.get(label)!;
          const urls = snapshot.organicResults.map(result => result.url);
          leituras.set(label, {
            ...leitura,
            ...(pedido.queryIndex === 0
              ? { primaryUrls: urls, blocks: observado.digest.blocks.map(bloco => bloco.type), primaryCollectedAt: snapshot.collectedAt }
              : { comparisonUrls: urls, comparisonCollectedAt: snapshot.collectedAt }),
            collectedAt: [...leitura.collectedAt, snapshot.collectedAt],
          });
        }

        // Uso registrado só para o que foi pago; acerto de cache não consome crédito.
        if (pagas > 0 && dataForSeo) {
          await recordIntegrationUsage({
            resource: dataForSeo.resource,
            operation: "module_operation",
            module: "arquiteto",
            resultStatus: "succeeded",
            units: pagas,
            idempotencyKey: `dataforseo:territorial_serp:${operationRequestId}:${question.questionId}`,
            metadata: { operationRequestId, operationKind: "territorial_serp", questionId: question.questionId, lenses: lensLabels.length },
          });
        }

        const contexto: TerritorialLensContext | undefined = requested.legacy ? undefined : {
          primaryLens: serpCacheLensLabel(lens),
          requested: lensLabels,
          primaryBlocks: blocosDaPrincipal,
          extras: [...leituras.values()],
          missing: faltantesDaPergunta,
        };
        const assessment = assessTerritorialSerp({
          question: question as TerritorialSerpQuestion,
          snapshots,
          ...(contexto ? { lenses: contexto } : {}),
        });
        // Provider OK não é sucesso: só é sucesso o que persiste E volta.
        await saveTerritorialSerpAssessment(pipelineContext, {
          assessment, base: question.base, operationRequestId,
        });
        const readback = await readbackTerritorialSerpAssessment(pipelineContext, assessment.questionId);
        assessments.push(readback.payload.assessment);
      } catch (error) {
        // Uma pergunta que falha não derruba as outras; o parcial é declarado.
        if (pagas > 0 && dataForSeo) {
          await recordIntegrationUsage({
            resource: dataForSeo.resource,
            operation: "module_operation",
            module: "arquiteto",
            resultStatus: "failed",
            units: pagas,
            errorCode: error instanceof SerpPaidBudgetExhaustedError ? error.code : "TERRITORIAL_SERP_FAILED",
            idempotencyKey: `dataforseo:territorial_serp:${operationRequestId}:${question.questionId}:failed`,
            metadata: { operationRequestId, operationKind: "territorial_serp", questionId: question.questionId },
          }).catch(() => undefined);
        }
        failures.push({
          questionId: question.questionId,
          error: error instanceof Error ? error.message : "Falha ao consultar a SERP.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        // A evidência vem sempre do provider real — ao vivo ou reaproveitada do cache.
        source: "PROVIDER_LIVE",
        operationRequestId,
        assessments,
        failures,
        requested: parsed.data.questions.length,
        succeeded: assessments.length,
        serpCache: { queries: pedidos.length, reused: reaproveitadas, paid: pagasNoTotal },
        lenses: lensLabels,
        plan,
      },
    });
  } catch (error) {
    const runtime = integrationRuntimeErrorResponse(error);
    if (runtime) return NextResponse.json({ success: false, error: runtime.message, code: runtime.code }, { status: runtime.status });
    const message = error instanceof Error ? error.message : "Não foi possível validar a SERP dos silos.";
    return NextResponse.json({ success: false, error: message, code: "TERRITORIAL_SERP_FAILED" }, { status: 500 });
  }
}
