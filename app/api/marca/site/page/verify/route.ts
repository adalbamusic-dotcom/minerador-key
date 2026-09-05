import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { fetchAuthorizedText, SiteFetchError } from "@/lib/marca/site-fetch";
import { extractPageData } from "@/lib/marca/site-parser";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";
import { brandCanonicalSiteKey } from "@/lib/marca/site-canonical-url";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import {
  applyPageVerifications,
  catalogEntriesPendingVerification,
  readBrandSiteSnapshot,
  type PageVerificationObservation,
} from "@/lib/server/marca-site-store";

/**
 * Verificação de página — fatos observados, agora persistidos no remoto.
 *
 * O sitemap dá endereço; só a página dá `title`, `H1`, `canonical` e tipo real.
 * Aqui esses fatos são observados e gravados na MESMA linha do catálogo, pela
 * identidade `(marca_id, normalized_url)`. Decisão humana não é tocada.
 *
 * Aceita uma URL (`url`) ou um lote (`urls`), ou ainda `scope: "pending"` para
 * verificar o que o catálogo ainda não resolveu — que é onde está o valor.
 */
const InputSchema = z.object({
  brandId: z.string().uuid(),
  url: z.string().url().optional(),
  urls: z.array(z.string().url()).max(500).optional(),
  scope: z.enum(["pending", "all"]).optional(),
}).refine(body => Boolean(body.url || body.urls?.length || body.scope), {
  message: "Informe uma URL, um lote ou o escopo a verificar.",
});

/** Requisições simultâneas por lote. Host autorizado, sem enxurrada. */
const CONCURRENCY = 4;

type VerificationResult = {
  requestedUrl: string;
  normalizedUrl: string | null;
  observation: PageVerificationObservation | null;
  payload: Record<string, unknown>;
  failed: boolean;
};

async function verifyOne(input: { url: string; primaryHost: string; primaryUrl: string }): Promise<VerificationResult> {
  const requestedUrl = normalizeSiteUrl(input.url);
  const normalizedUrl = brandCanonicalSiteKey(input.primaryUrl, requestedUrl);
  const verifiedAt = new Date().toISOString();
  try {
    const fetched = await fetchAuthorizedText(requestedUrl, input.primaryHost, "html");
    const page = extractPageData(fetched.text, fetched.finalUrl);
    const finalUrl = normalizeSiteUrl(fetched.finalUrl);
    const declaredCanonical = page.canonical ? normalizeSiteUrl(new URL(page.canonical, finalUrl).toString()) : null;
    const verificationStatus = fetched.response.status === 404 ? "not_found"
      : fetched.response.status >= 400 ? "error"
      : page.indexability === "noindex" ? "noindex"
      : finalUrl !== requestedUrl ? "redirect"
      : !declaredCanonical ? "canonical_missing"
      : declaredCanonical === finalUrl ? "canonical_confirmed"
      : "canonical_conflict";

    const payload = {
      requestedUrl, resolvedUrl: finalUrl, httpStatus: fetched.response.status,
      contentType: fetched.contentType, ...page, canonical: declaredCanonical, verificationStatus,
    };
    return {
      requestedUrl,
      normalizedUrl,
      failed: false,
      payload,
      observation: normalizedUrl ? {
        normalizedUrl,
        resolvedUrl: finalUrl,
        declaredCanonicalUrl: declaredCanonical,
        normalizedCanonicalUrl: declaredCanonical ? brandCanonicalSiteKey(input.primaryUrl, declaredCanonical) : null,
        title: page.title || null,
        h1: page.h1 || null,
        metaDescription: page.metaDescription || null,
        pageType: page.pageType,
        indexability: page.indexability,
        verificationStatus,
        verifiedAt,
      } : null,
    };
  } catch (error) {
    // Falha de UMA página é observação daquela página: o catálogo continua
    // íntegro e o last-known-good do sitemap não é tocado.
    const status = error instanceof SiteFetchError && error.status === 404 ? "not_found" : "error";
    return {
      requestedUrl,
      normalizedUrl,
      failed: true,
      payload: { requestedUrl, verificationStatus: status, error: error instanceof Error ? error.message : "Falha ao verificar a página." },
      observation: normalizedUrl ? {
        normalizedUrl,
        resolvedUrl: null,
        declaredCanonicalUrl: null,
        normalizedCanonicalUrl: null,
        title: null,
        h1: null,
        metaDescription: null,
        // Sem observar a página não se reclassifica o tipo: fica `unknown`.
        pageType: "unknown",
        indexability: "unknown",
        verificationStatus: status,
        verifiedAt,
      } : null,
    };
  }
}

/** Pool simples: paralelismo limitado, sem enfileirar o site inteiro de uma vez. */
async function runBounded<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const brand = await authorizedSiteBrand(input.brandId);
    const context = await resolvePipelineContext({ brandId: input.brandId, module: "marca", action: "edit" });

    let targets: string[] = [];
    if (input.url) targets.push(input.url);
    if (input.urls?.length) targets.push(...input.urls);
    if (input.scope) {
      const snapshot = await readBrandSiteSnapshot(context);
      targets.push(...catalogEntriesPendingVerification(snapshot, { includeVerified: input.scope === "all" })
        .map(entry => entry.discoveredUrl));
    }
    targets = [...new Set(targets)];

    const results = await runBounded(targets, CONCURRENCY, url =>
      verifyOne({ url, primaryHost: brand.primaryHost, primaryUrl: brand.primaryUrl }));

    const observations = results
      .map(result => result.observation)
      .filter((observation): observation is PageVerificationObservation => Boolean(observation));
    const persisted = await applyPageVerifications(context, { observations });

    // Readback: o snapshot remoto é a prova, não o resultado do fetch.
    const snapshot = await readBrandSiteSnapshot(context);
    return NextResponse.json({
      persistence: observations.length ? "PERSISTED" : "UNCHANGED",
      source: "CANONICAL_REMOTE",
      // Compatibilidade: a chamada de uma URL só continua recebendo `verification`.
      verification: results[0]?.payload ?? null,
      summary: {
        requested: targets.length,
        verified: persisted.verified.length,
        failed: results.filter(result => result.failed).length,
        outsideBrandOrigin: results.filter(result => !result.normalizedUrl).length,
        notInCatalog: persisted.refused.length,
      },
      snapshot,
    });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    const status = error instanceof SiteFetchError && error.status === 404 ? 200 : mapped.status === 500 ? 422 : mapped.status;
    return NextResponse.json({
      error: mapped.message,
      verificationStatus: error instanceof SiteFetchError && error.status === 404 ? "not_found" : "error",
    }, { status });
  }
}
