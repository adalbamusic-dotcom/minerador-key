import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { fetchAuthorizedText, SiteFetchError } from "@/lib/marca/site-fetch";
import { extractPageData } from "@/lib/marca/site-parser";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";

const InputSchema = z.object({ brandId: z.string().uuid(), url: z.string().url() });

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const brand = await authorizedSiteBrand(input.brandId);
    const requestedUrl = normalizeSiteUrl(input.url);
    const fetched = await fetchAuthorizedText(requestedUrl, brand.primaryHost, "html");
    const page = extractPageData(fetched.text, fetched.finalUrl);
    const finalUrl = normalizeSiteUrl(fetched.finalUrl);
    const declaredCanonical = page.canonical ? normalizeSiteUrl(new URL(page.canonical, finalUrl).toString()) : null;
    const verificationStatus = fetched.response.status === 404 ? "not_found" : fetched.response.status >= 400 ? "error" : page.indexability === "noindex" ? "noindex" : finalUrl !== requestedUrl ? "redirect" : !declaredCanonical ? "canonical_missing" : declaredCanonical === finalUrl ? "canonical_confirmed" : "canonical_conflict";
    return NextResponse.json({ verification: { requestedUrl, resolvedUrl: finalUrl, httpStatus: fetched.response.status, contentType: fetched.contentType, ...page, canonical: declaredCanonical, verificationStatus } });
  } catch (error) {
    const mapped = authzErrorResponse(error); const status = error instanceof SiteFetchError && error.status === 404 ? 200 : mapped.status === 500 ? 422 : mapped.status;
    return NextResponse.json({ error: mapped.message, verificationStatus: error instanceof SiteFetchError && error.status === 404 ? "not_found" : "error" }, { status });
  }
}
