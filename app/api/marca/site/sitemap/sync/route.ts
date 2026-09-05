import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { crawlAuthorizedSitemap } from "@/lib/marca/site-fetch";
import { brandCanonicalSiteKey } from "@/lib/marca/site-canonical-url";
import { classifySitePage } from "@/lib/marca/site-parser";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import {
  failBrandSiteSync,
  finalizeBrandSiteSync,
  readBrandSiteSnapshot,
  startBrandSiteSync,
  upsertObservedCatalog,
  type ObservedCatalogPage,
} from "@/lib/server/marca-site-store";

const InputSchema = z.object({ brandId: z.string().uuid(), sitemapId: z.string().uuid(), sitemapUrl: z.string().url() });

/**
 * Sincronização de sitemap — agora com estado remoto como autoridade.
 *
 * Ordem canônica, e ela não pode ser invertida: a RPC de finalização NÃO
 * ingere o catálogo; ela PROVA que o conjunto declarado é o conjunto que a
 * ingestão carimbou com este `runId`.
 *
 *   abrir execução → coletar → ingerir catálogo → finalizar → readback remoto
 *
 * Sucesso só é declarado depois do readback: o resultado em memória do crawler
 * nunca é prova suficiente.
 */
export async function POST(request: Request) {
  let runId: string | null = null;
  let context: Awaited<ReturnType<typeof resolvePipelineContext>> | null = null;
  const startedAtMs = Date.now();

  try {
    const input = InputSchema.parse(await request.json());
    const brand = await authorizedSiteBrand(input.brandId);
    context = await resolvePipelineContext({ brandId: input.brandId, module: "marca", action: "edit" });

    const opened = await startBrandSiteSync(context, { sitemapId: input.sitemapId });
    runId = opened.runId;

    const crawl = await crawlAuthorizedSitemap(input.sitemapUrl, brand.primaryHost);

    // Identidade da linha é a chave canônica da Brand. URL fora da origem
    // declarada não recebe chave e por isso não entra no catálogo.
    const observations: ObservedCatalogPage[] = [];
    const unauthorized: Array<{ url: string; message: string }> = [];
    for (const item of crawl.urls) {
      const normalizedUrl = brandCanonicalSiteKey(brand.primaryUrl, item.url);
      if (!normalizedUrl) {
        unauthorized.push({ url: item.url, message: "Fora da origem declarada da Marca." });
        continue;
      }
      observations.push({
        normalizedUrl,
        discoveredUrl: item.url,
        sourceSitemapId: input.sitemapId,
        sitemapLastmod: item.lastmod,
        // Tipo derivado do próprio endereço; título e H1 são da verificação de
        // página, não da leitura do sitemap, e ficam como estão.
        pageType: classifySitePage(item.url, null, null),
        verificationStatus: "discovered",
      });
    }

    const ingestion = await upsertObservedCatalog(context, {
      runId: opened.runId,
      startedAt: opened.startedAt,
      observations,
    });

    const crawlErrors = [...crawl.errors, ...unauthorized];
    const finalized = await finalizeBrandSiteSync(context, {
      runId: opened.runId,
      ingestion,
      crawlErrorCount: crawlErrors.length,
      durationMs: Math.max(0, Date.now() - startedAtMs),
      errorMessage: crawlErrors.length ? crawlErrors.map(item => `${item.url}: ${item.message}`).join(" | ").slice(0, 2000) : null,
    });

    // Readback: o estado remoto é a resposta, não o que ficou na memória.
    const snapshot = await readBrandSiteSnapshot(context);
    return NextResponse.json({
      persistence: "PERSISTED",
      source: "CANONICAL_REMOTE",
      runId: opened.runId,
      finalization: finalized,
      snapshot,
      processed: crawl.processed,
      errors: crawlErrors,
    });
  } catch (error) {
    // Execução aberta não pode ficar `running` para sempre: encerra no estado
    // que o contrato permite, preservando o last-known-good anterior.
    if (runId && context) {
      await failBrandSiteSync(context, {
        runId,
        message: error instanceof Error ? error.message : "Falha na sincronização do sitemap.",
        durationMs: Math.max(0, Date.now() - startedAtMs),
      }).catch(() => undefined);
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status === 500 ? 422 : mapped.status });
  }
}
