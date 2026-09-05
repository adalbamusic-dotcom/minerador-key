import { NextResponse } from "next/server";
import { z } from "zod";
import { InternalLinkGraphWorkingCopySchema } from "@/lib/arquiteto/contracts";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { persistInternalLinkGraphWorkingCopy, readInternalLinkGraphWorkingCopy } from "@/lib/server/internal-link-graph-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

const BrandQuerySchema = z.object({ brandId: z.string().uuid(), graphId: z.string().min(1) });
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  action: z.enum(["create", "edit"]),
  workingCopy: InternalLinkGraphWorkingCopySchema,
}).strict();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = BrandQuerySchema.parse({
      brandId: url.searchParams.get("brandId") || "",
      graphId: url.searchParams.get("graphId") || "",
    });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    const workingCopy = await readInternalLinkGraphWorkingCopy(context, query.graphId);
    return NextResponse.json({ success: true, data: { source: "CANONICAL_REMOTE", workingCopy } });
  } catch (error) {
    // Distinguir a query invalida da LINHA invalida: o mesmo 400 para os dois
    // fazia parecer que o pedido estava errado quando o problema era o que ja
    // estava gravado.
    if (error instanceof z.ZodError) {
      console.error("[internal-link-graph] leitura da working copy recusada", error.issues);
      return NextResponse.json(
        { success: false, error: "A leitura da working copy do InternalLinkGraph não passou no contrato canônico.", issues: error.flatten() },
        { status: 400 },
      );
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

async function write(request: Request, action: "create" | "edit") {
  try {
    const parsed = RequestSchema.parse({ ...(await request.json()), action });
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action });
    const result = await persistInternalLinkGraphWorkingCopy(context, parsed.workingCopy);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    // As issues acompanham a recusa, como já fazem as âncoras: quem montou o
    // payload é o próprio cliente, e esconder QUAL campo quebrou transforma um
    // erro de contrato em adivinhação.
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "A working copy do InternalLinkGraph não corresponde ao contrato canônico.", issues: error.flatten() },
        { status: 400 },
      );
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  return write(request, "create");
}

export async function PATCH(request: Request) {
  return write(request, "edit");
}
