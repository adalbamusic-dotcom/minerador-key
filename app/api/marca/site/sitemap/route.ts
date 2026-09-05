import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { readBrandSiteSnapshot, registerBrandSitemap } from "@/lib/server/marca-site-store";

const SNAPSHOT_QUERY = z.object({ brandId: z.string().uuid() });
const REGISTER_BODY = z.object({
  brandId: z.string().uuid(),
  url: z.string().url(),
  sitemapType: z.enum(["principal", "sitemap_index", "posts", "paginas", "produtos", "categorias", "outro"]).optional(),
});

/** Snapshot remoto do Site da Marca. Leitura não dispara coleta nenhuma. */
export async function GET(request: Request) {
  try {
    const query = SNAPSHOT_QUERY.parse({ brandId: new URL(request.url).searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "marca", action: "view" });
    return NextResponse.json({ source: "CANONICAL_REMOTE", snapshot: await readBrandSiteSnapshot(context) });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status === 500 ? 422 : mapped.status });
  }
}

/** Registra o sitemap no remoto — pré-requisito de qualquer sincronização. */
export async function POST(request: Request) {
  try {
    const body = REGISTER_BODY.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: body.brandId, module: "marca", action: "edit" });
    const sitemap = await registerBrandSitemap(context, { url: body.url, sitemapType: body.sitemapType });
    // Readback: o registro só é sucesso depois de aparecer no snapshot remoto.
    const snapshot = await readBrandSiteSnapshot(context);
    return NextResponse.json({ persistence: "PERSISTED", source: "CANONICAL_REMOTE", sitemap, snapshot });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status === 500 ? 422 : mapped.status });
  }
}
