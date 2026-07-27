import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";
import { extractPageData } from "@/lib/marca/site-parser";
import { crawlAuthorizedSitemap, fetchAuthorizedText, SiteFetchError } from "@/lib/marca/site-fetch";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { authzErrorResponse } from "@/lib/server/authz";

const InputSchema = z.object({
  brandId: z.string().uuid(), entityType: z.enum(["article", "silo_page"]).default("article"), articleId: z.string().min(1).optional(), siloPageId: z.string().min(1).optional(), articleDnaVersionId: z.string().min(1).nullable().optional(), siloPageVersionId: z.string().min(1).nullable().optional(),
  url: z.string().url(), sitemapUrl: z.string().url().nullable().optional(),
}).superRefine((input, context) => {
  if (input.entityType === "article" && !input.articleId) context.addIssue({ code: "custom", path: ["articleId"], message: "Artigo precisa de ID." });
  if (input.entityType === "silo_page" && !input.siloPageId) context.addIssue({ code: "custom", path: ["siloPageId"], message: "SiloPage precisa de ID." });
});

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const entityId = input.entityType === "silo_page" ? input.siloPageId! : input.articleId!;
    const brand = await authorizedSiteBrand(input.brandId);
    await assertEditorialPermission(brand.profile, input.brandId, "arquiteto", "edit");
    const requestedUrl = normalizeSiteUrl(input.url);
    const fetched = await fetchAuthorizedText(requestedUrl, brand.primaryHost, "html");
    const finalUrl = normalizeSiteUrl(fetched.finalUrl);
    const page = extractPageData(fetched.text, finalUrl);
    const declaredCanonical = page.canonical ? normalizeSiteUrl(new URL(page.canonical, finalUrl).toString()) : null;
    let sitemapMatch: boolean | null = null;
    let sitemapUrl: string | null = null;
    if (input.sitemapUrl) {
      sitemapUrl = normalizeSiteUrl(input.sitemapUrl);
      const sitemap = await crawlAuthorizedSitemap(sitemapUrl, brand.primaryHost);
      sitemapMatch = sitemap.urls.some(item => normalizeSiteUrl(item.url) === finalUrl || normalizeSiteUrl(item.url) === requestedUrl);
    }
    const status = fetched.response.status === 404 ? "unreachable" : declaredCanonical && declaredCanonical !== finalUrl ? "canonical_mismatch" : sitemapMatch === false ? "not_in_sitemap" : sitemapMatch === true ? "sitemap_match" : "verified";
    return NextResponse.json({ success: true, data: { verification: {
      schemaVersion: 1, id: `publication-verification:${input.brandId}:${entityId}:${input.entityType === "silo_page" ? input.siloPageVersionId || "work" : input.articleDnaVersionId || "work"}`, brandId: input.brandId,
      entityType: input.entityType, articleId: entityId, siloPageId: input.siloPageId ?? null, articleDnaVersionId: input.articleDnaVersionId ?? null, siloPageVersionId: input.siloPageVersionId ?? null, requestedUrl, resolvedUrl: finalUrl,
      declaredCanonical, httpStatus: fetched.response.status, sitemapUrl, sitemapMatch, status,
      checkedAt: new Date().toISOString(), checkedBy: brand.profile.userId,
      message: status === "canonical_mismatch" ? "A canonical declarado diverge da URL final." : status === "not_in_sitemap" ? "A URL não foi encontrada no sitemap informado." : null,
    } } });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    const siteError = error instanceof SiteFetchError;
    return NextResponse.json({ success: false, error: mapped.message, verificationStatus: siteError ? "error" : undefined }, { status: siteError && error.status === 404 ? 200 : mapped.status === 500 ? 422 : mapped.status });
  }
}
