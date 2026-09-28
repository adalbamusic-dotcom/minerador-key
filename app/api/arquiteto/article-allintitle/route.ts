import { NextResponse } from "next/server";
import { z } from "zod";
import { ArticleKgrIdentitySchema } from "@/lib/arquiteto/contracts";
import {
  ARTICLE_ALLINTITLE_BLOCK_SIZE,
  ARTICLE_ALLINTITLE_KEYWORD_COLUMNS,
  buildArticleAllintitlePlan,
  resolveArticleAllintitleReuse,
  withArticleAllintitleMeasurement,
} from "@/lib/arquiteto/article-allintitle";
import { hasSearchVolume } from "@/lib/arquiteto/serp-subject-suggestions";
import { resolveDataForSeoCompatibilityConfig } from "@/lib/arquiteto/dataforseo-serp-compatibility";
import { SerpPaidBudgetExhaustedError, authorizeSerpPaidPlan, createPaidQueryBudget } from "@/lib/arquiteto/serp-lens-plan";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor } from "@/lib/arquiteto/serp-lens-targeting";
import { measureDataForSeoAllintitle, readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { WorkflowRepository } from "@/lib/server/pipeline-repositories";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * ALLINTITLE DA PRINCIPAL DO ARTIGO — uma consulta por artigo (SDD
 * `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`, A4).
 *
 * `plan` só lê: a medição do Arquiteto em `kgrIdentity` e a do Minerador, as
 * duas com validade de 30 dias. Não resolve credencial e não paga. `execute`
 * paga só as faltas, até o número que a pessoa autorizou ao ver o plano, pelo
 * MESMO núcleo de pedido do Minerador (`allintitle:` sem aspas, desktop,
 * profundidade 10). `recollect` ("Recalcular") ignora o reaproveitamento e
 * também só paga com autorização.
 *
 * Grava a medição em `kgrIdentity` do item de workflow da Principal (campos
 * que já existem). NUNCA escreve em `minerador_keywords`: a linha do
 * Minerador é só lida. Medir não decide: "Aplicar KGR" continua como estava.
 *
 * GUARDAS DO SERVIDOR (correção de 2026-09-28): Principal sem volume no
 * acervo da marca nunca é medida (sem volume não há KGR, e o número seria
 * dado inútil), mesmo numa chamada direta. Item fora da etapa, ou Principal
 * fora do acervo, vira lacuna (`gaps`) e não derruba os outros artigos do bloco.
 */

const RequestSchema = z.object({
  brandId: z.string().min(1),
  /** O item de workflow da Principal de cada artigo (etapa Arquiteto, recebido). */
  articles: z.array(z.object({
    workflowItemId: z.string().min(1),
    articleId: z.string().min(1).nullable().optional(),
  })).min(1).max(ARTICLE_ALLINTITLE_BLOCK_SIZE),
  mode: z.enum(["plan", "execute"]).default("plan"),
  authorizedPaidQueries: z.number().int().nonnegative().max(ARTICLE_ALLINTITLE_BLOCK_SIZE).default(0),
  /** "Recalcular": paga de novo mesmo com medição válida. Só por pedido humano. */
  recollect: z.boolean().default(false),
});

type KeywordRow = { id: string; keyword: string | null; volume_search: number | null; results_allintitle: number | null; allintitle_measured_at: string | null };

const texto = (valor: unknown): string | undefined => typeof valor === "string" && valor ? valor : undefined;

export async function POST(request: Request) {
  const operationRequestId = crypto.randomUUID();
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Pedido de allintitle do artigo inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });
    const repository = new WorkflowRepository(context);
    const now = new Date();

    /* 1. Os itens da Principal, da marca ativa, recebidos pelo Arquiteto. */
    const lacunas: Array<{ workflowItemId: string; reason: string }> = [];
    const itens = [];
    for (const article of parsed.data.articles) {
      const lido = await repository.find(article.workflowItemId);
      if (lido.status !== "READY" || !lido.data) throw new PipelineRuntimeError("NOT_AUTHORIZED", "O item de workflow não pertence à Brand ativa.", 403);
      const item = lido.data;
      if (item.subject_type !== "keyword" || item.stage !== "architect" || item.state !== "received") {
        lacunas.push({ workflowItemId: article.workflowItemId, reason: "Só a Principal recebida pelo Arquiteto pode ter o allintitle medido aqui; nada foi pago." });
        continue;
      }
      const payload = item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload as Record<string, unknown> : {};
      const identidade = ArticleKgrIdentitySchema.safeParse(payload.kgrIdentity);
      itens.push({ article, item, payload, kgrIdentity: identidade.success ? identidade.data : undefined, keywordId: String(item.subject_id) });
    }

    /* 2. A linha do Minerador, só leitura e estreita. */
    const linhas = new Map<string, KeywordRow>();
    const ids = [...new Set(itens.map(item => item.keywordId))];
    const lidas = ids.length ? await context.supabase.from("minerador_keywords").select(ARTICLE_ALLINTITLE_KEYWORD_COLUMNS).eq("brand_id", context.brandId).is("deleted_at", null).in("id", ids) : { data: [], error: null };
    if (lidas.error) throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível ler as keywords da marca; nada foi pago.", 503);
    for (const linha of (lidas.data || []) as unknown as KeywordRow[]) linhas.set(String(linha.id), linha);

    /* 3. Cache primeiro: o que já foi medido nos últimos 30 dias não paga. */
    const medisveis = itens.filter(item => {
      const linha = linhas.get(item.keywordId) || null;
      if (!linha || !String(linha.keyword || "").trim()) {
        lacunas.push({ workflowItemId: String(item.item.id), reason: "A keyword da Principal não está no acervo da marca ativa; nada foi pago." });
        return false;
      }
      if (!hasSearchVolume(typeof linha.volume_search === "number" ? linha.volume_search : null)) {
        lacunas.push({ workflowItemId: String(item.item.id), reason: "A Principal não tem volume no Google Ads: sem volume não há KGR, e o allintitle não é medido." });
        return false;
      }
      return true;
    });
    const alvos = medisveis.map(item => {
      const linha = linhas.get(item.keywordId) || null;
      const reuse = resolveArticleAllintitleReuse({
        principalKeywordId: item.keywordId,
        kgrIdentity: item.kgrIdentity,
        mineradorResultCount: linha?.results_allintitle ?? null,
        mineradorMeasuredAt: linha?.allintitle_measured_at ?? null,
      }, { now, recollect: parsed.data.recollect });
      return { ...item, linha, reuse };
    });
    const plan = buildArticleAllintitlePlan(alvos.map(alvo => alvo.reuse));
    const resumo = (alvo: typeof alvos[number], extra: Record<string, unknown> = {}) => ({
      workflowItemId: String(alvo.item.id),
      keywordId: alvo.keywordId,
      keyword: alvo.linha?.keyword ?? null,
      reuse: alvo.reuse.kind,
      ...(alvo.reuse.kind === "to_pay" ? { reason: alvo.reuse.reason } : { resultCount: alvo.reuse.resultCount, measuredAt: alvo.reuse.measuredAt }),
      ...extra,
    });
    if (parsed.data.mode === "plan") {
      return NextResponse.json({ success: true, data: { mode: "plan", operationRequestId, plan, items: alvos.map(alvo => resumo(alvo)), gaps: lacunas } });
    }

    const autorizacao = authorizeSerpPaidPlan(plan, parsed.data.authorizedPaidQueries);
    if (!autorizacao.ok) {
      return NextResponse.json({ success: false, error: autorizacao.message, code: autorizacao.code, data: { operationRequestId, plan } }, { status: 409 });
    }
    const orcamento = createPaidQueryBudget(parsed.data.authorizedPaidQueries);
    const aPagar = alvos.filter(alvo => alvo.reuse.kind === "to_pay");
    const resultados: Array<Record<string, unknown>> = alvos.filter(alvo => alvo.reuse.kind !== "to_pay").map(alvo => resumo(alvo, { status: "reused" }));
    const atualizados: unknown[] = [];

    /* 4. Só então credencial e quota, e só com faltas. */
    if (aPagar.length) {
      const dataForSeo = await resolveDataForSeoCompatibilityConfig({
        actorUserId: context.actorUserId,
        brandId: context.brandId,
        client: context.supabase,
        quotaUnits: aPagar.length,
      });
      const ambiente = readDataForSeoTargetCodes();
      const targeting = await readMineradorKeywordTargetCodes(context.supabase, context.brandId, aPagar.map(alvo => alvo.keywordId), ambiente);
      let pagas = 0;
      let medidas = 0;
      for (const alvo of aPagar) {
        try {
          if (!orcamento.take()) throw new SerpPaidBudgetExhaustedError("Fora do plano de chamadas autorizado; o allintitle não foi pago.");
          pagas += 1;
          // Os códigos do Minerador para a keyword; sem targeting, os da config que vai ao provider.
          const codigos = targeting.codes.has(alvo.keywordId)
            ? serpTargetCodesFor(targeting.codes, alvo.keywordId, ambiente)
            : { locationCode: dataForSeo.config.locationCode, languageCode: dataForSeo.config.languageCode };
          const medicao = await measureDataForSeoAllintitle({
            keyword: String(alvo.linha?.keyword || ""),
            locationCode: codigos.locationCode,
            languageCode: codigos.languageCode,
            operationRequestId,
          }, { config: dataForSeo.config });
          medidas += 1;
          const kgrIdentity = withArticleAllintitleMeasurement({
            identity: alvo.kgrIdentity,
            principalKeywordId: alvo.keywordId,
            principalKeywordDnaId: texto(alvo.item.source_entity_id),
            principalKeywordDnaVersionId: texto(alvo.item.source_version_id),
            brandId: context.brandId,
            workflowItemId: String(alvo.item.id),
            articleId: alvo.article.articleId ?? texto(alvo.item.article_id) ?? null,
            principalVolume: typeof alvo.linha?.volume_search === "number" ? alvo.linha.volume_search : null,
            measurement: {
              resultCount: medicao.resultsAllintitle,
              measuredAt: medicao.measuredAt,
              query: medicao.query,
              locationCode: medicao.locationCode,
              languageCode: medicao.languageCode,
              provider: medicao.provider,
              endpoint: medicao.endpoint,
              providerRequestId: medicao.providerRequestId,
              operationRequestId,
            },
            actorUserId: context.actorUserId,
            evaluatedAt: now.toISOString(),
          });
          // Relê e grava com o lock de agora: a medição paga nunca se perde por
          // uma edição concorrente da mesma cópia de trabalho.
          const atual = await repository.find(String(alvo.item.id));
          if (atual.status !== "READY" || !atual.data) throw new PipelineRuntimeError("CONFLICT", "O item da Principal sumiu durante a medição.", 409);
          const payloadAtual = atual.data.payload && typeof atual.data.payload === "object" && !Array.isArray(atual.data.payload) ? atual.data.payload as Record<string, unknown> : {};
          const gravado = await repository.update(String(alvo.item.id), Number(atual.data.lock_version), { payload: { ...payloadAtual, kgrIdentity } as never });
          atualizados.push(gravado.data);
          resultados.push(resumo({ ...alvo, reuse: { kind: "arquiteto", resultCount: medicao.resultsAllintitle, measuredAt: medicao.measuredAt } }, { status: "measured", kgrValue: kgrIdentity.kgrValue ?? null }));
        } catch (error) {
          lacunas.push({ workflowItemId: String(alvo.item.id), reason: error instanceof Error ? error.message : "Falha ao medir o allintitle." });
        }
      }
      if (pagas) await recordIntegrationUsage({
        resource: dataForSeo.resource,
        operation: "module_operation",
        module: "arquiteto",
        resultStatus: medidas ? "succeeded" : "failed",
        units: pagas,
        ...(medidas ? {} : { errorCode: "ARTICLE_ALLINTITLE_EMPTY" }),
        idempotencyKey: `dataforseo:article_allintitle:${operationRequestId}`,
        metadata: {
          operationRequestId,
          operationKind: "article_allintitle",
          requested: alvos.length,
          reused: alvos.length - aPagar.length,
          recollect: parsed.data.recollect,
        },
      }).catch(() => undefined);
    }

    return NextResponse.json({
      success: true,
      data: {
        mode: "execute",
        operationRequestId,
        plan,
        items: resultados,
        gaps: lacunas,
        updatedItems: atualizados,
        paidQueries: orcamento.used,
      },
    });
  } catch (error) {
    if (error instanceof PipelineRuntimeError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    const runtime = integrationRuntimeErrorResponse(error);
    if (runtime) return NextResponse.json({ success: false, error: runtime.message, code: runtime.code }, { status: runtime.status });
    const message = error instanceof Error ? error.message : "Não foi possível medir o allintitle do artigo.";
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ success: false, error: message, code: "ARTICLE_ALLINTITLE_FAILED" }, { status });
  }
}
