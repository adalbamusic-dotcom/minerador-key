import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { buildSubjectDiscoveryPorts } from "@/lib/server/subject-discovery-runtime";
import { SubjectDiscoverySearchRequestSchema, runSubjectDiscoverySearch } from "@/lib/minerador/subject-discovery-search";

/**
 * PESQUISA POR ASSUNTO — plano e execução
 * (SDD `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F1b.4).
 *
 * `POST { mode: "plan" }`    nada é pago e nenhuma credencial é lida: o cache
 *                            de SERP em `meta`, a declaração do Assunto, o
 *                            site da marca e a linha do catálogo do ledger.
 * `POST { mode: "execute" }` recalcula o plano, confere `authorizedPlan`, e só
 *                            então resolve a Connection DataForSEO e o Google
 *                            Ads (Secret Store), lê o ledger e paga.
 *
 * A marca é a da rota; o ator é `auth.users.id`. As candidatas voltam ao
 * navegador e NÃO são gravadas: esta rota não escreve em
 * `minerador_discovery_*` nem em `minerador_keywords`. O banco recebe só o
 * uso no ledger e a SERP da frase no cache da marca.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

function failure(status: number, code: string, stage: string, message: string) {
  return NextResponse.json({ success: false, code, stage, message }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure(404, "BRAND_NOT_FOUND", "authorization", "Marca inválida.");
    const input = SubjectDiscoverySearchRequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });

    const ports = buildSubjectDiscoveryPorts({ profile, context, input });

    const outcome = await runSubjectDiscoverySearch({ brandId: context.brandId, request: input }, ports);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ success: false, code: "INVALID_SUBJECT_DISCOVERY_REQUEST", stage: "request_validation", message: "A pesquisa por Assunto é inválida.", diagnostic: { issues: error.issues.map(issue => ({ path: issue.path.join("."), code: issue.code })) } }, { status: 400 });
    }
    if (error instanceof AuthzError) return failure(error.status, error.status === 401 ? "SUBJECT_DISCOVERY_UNAUTHENTICATED" : "SUBJECT_DISCOVERY_AUTHORIZATION_FAILED", "authorization", error.message);
    return failure(503, "SUBJECT_DISCOVERY_FAILED", "subject_discovery", "A pesquisa por Assunto não pôde ser concluída. Nada foi gravado como candidata.");
  }
}
