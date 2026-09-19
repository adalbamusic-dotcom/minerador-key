import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { listWriterMcpDelegations, WriterMcpAuthError } from "@/lib/server/writer-mcp-delegation";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";

const agencyOnlyResponse = () => NextResponse.json({
  code: "MCP_DELEGATION_AGENCY_ONLY",
  error: "A administração das conexões e delegações MCP pertence às Integrações da Agência.",
  guidance: "Use /agencias/{agencyRef}/integracoes.",
}, { status: 410, headers: { "Cache-Control": "no-store" } });

function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", issues: error.issues }, { status: 400 });
  if (error instanceof WriterMcpAuthError) return NextResponse.json({ code: error.code }, { status: error.status });
  if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code }, { status: 503 });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.message }, { status: mapped.status });
}

export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const brandId = z.string().uuid().parse(request.nextUrl.searchParams.get("brandId"));
    return NextResponse.json({ delegations: await listWriterMcpDelegations(profile, brandId) });
  } catch (error) { return failure(error); }
}

export async function POST() {
  return agencyOnlyResponse();
}

export async function DELETE() {
  return agencyOnlyResponse();
}
