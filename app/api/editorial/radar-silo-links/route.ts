import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { radarSiloLinksRead } from "@/lib/server/radar-silo-links";

/**
 * ===== 2026-10-14 · F5 · LINKS A ATIVAR E "ATUALIZAR LINKS DO SILO" (só leitura) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6.5 e
 * D10. O painel do artigo no Radar pede a malha do Silo dele ("malha X/Y", links a
 * ativar, o que falta nas páginas publicadas) e o `-links.csv` de cada artigo. O
 * MESMO núcleo do .zip da exportação por artigo e do MCP `get_silo_links_update`
 * (`lib/server/radar-silo-links.ts`).
 *
 * POST (não cacheado): monta o export do Silo, lê as páginas publicadas (só GET) e
 * devolve a lista. Nada é gravado; nenhuma IA; nenhum provider pago; a página
 * publicada, a URL, o slug e o canonical nunca são alterados.
 */

const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  /** "silo" (padrão): todos os artigos do Silo do artigo; "article": só ele. */
  scope: z.enum(["article", "silo"]).optional(),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const corpo = CorpoSchema.parse(await request.json());
    await assertEditorialPermission(profile, corpo.brandId, "radar", "view");
    const leitura = await radarSiloLinksRead({
      brandId: corpo.brandId,
      articleId: corpo.articleId,
      scope: corpo.scope ?? "silo",
      actorUserId: profile.userId,
      supabase: profile.supabase,
    });
    return NextResponse.json({ success: true, ...leitura }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido dos links do Silo inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    }
    const mapped = authzErrorResponse(error);
    const semLeituraDaPlanta = error instanceof Error && (error as Error & { code?: unknown }).code === "blueprint_unavailable";
    return NextResponse.json({ success: false, error: mapped.message, ...(semLeituraDaPlanta ? { code: "blueprint_unavailable" } : {}) }, { status: mapped.status, headers: noStoreHeaders });
  }
}
