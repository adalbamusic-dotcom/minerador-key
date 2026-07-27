import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { crawlAuthorizedSitemap } from "@/lib/marca/site-fetch";

const InputSchema = z.object({ brandId: z.string().uuid(), sitemapId: z.string().uuid(), sitemapUrl: z.string().url() });

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const brand = await authorizedSiteBrand(input.brandId);
    const startedAt = new Date().toISOString();
    const result = await crawlAuthorizedSitemap(input.sitemapUrl, brand.primaryHost);
    const completedAt = new Date().toISOString();
    const status = result.errors.length === 0 ? "completed" : result.urls.length ? "partial" : "failed";
    return NextResponse.json({ run: { id: crypto.randomUUID(), brandId: input.brandId, sitemapId: input.sitemapId, status, startedAt, completedAt, foundCount: result.urls.length, newCount: 0, updatedCount: 0, missingCount: 0, errorCount: result.errors.length, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)), errorMessage: result.errors.length ? result.errors.map(item => `${item.url}: ${item.message}`).join(" | ") : null }, urls: result.urls, processed: result.processed, errors: result.errors });
  } catch (error) {
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status === 500 ? 422 : mapped.status });
  }
}
