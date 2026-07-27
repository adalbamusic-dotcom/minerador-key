import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";
import { fetchAuthorizedText } from "@/lib/marca/site-fetch";
import { parseSitemapXml } from "@/lib/marca/site-parser";

const InputSchema = z.object({ brandId: z.string().uuid(), sitemapUrl: z.string().url() });

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const brand = await authorizedSiteBrand(input.brandId);
    const fetched = await fetchAuthorizedText(input.sitemapUrl, brand.primaryHost, "xml");
    if (!fetched.response.ok) return NextResponse.json({ error: `Sitemap respondeu HTTP ${fetched.response.status}.` }, { status: 502 });
    const parsed = parseSitemapXml(fetched.text);
    return NextResponse.json({ result: { url: input.sitemapUrl, finalUrl: fetched.finalUrl, contentType: fetched.contentType, kind: parsed.kind, itemCount: parsed.items.length, childUrls: parsed.kind === "sitemapindex" ? parsed.items.map(item => item.url) : [] } });
  } catch (error) {
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status === 500 ? 422 : mapped.status });
  }
}
