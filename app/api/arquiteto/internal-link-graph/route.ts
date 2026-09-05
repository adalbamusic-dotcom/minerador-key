import { NextResponse } from "next/server";
import { z } from "zod";
import { InternalLinkGraphSchema } from "@/lib/arquiteto/contracts";
import { internalLinkGraphRefForDownstream, listInternalLinkGraphs, persistInternalLinkGraph, readInternalLinkGraph } from "@/lib/server/internal-link-graph-persistence";
import { pipelineArtifactErrorResponse } from "@/lib/server/arquiteto-persistence";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

const BrandQuerySchema = z.object({ brandId: z.string().uuid() });
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  action: z.enum(["create", "edit"]),
  graph: InternalLinkGraphSchema,
}).strict();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = BrandQuerySchema.parse({ brandId: url.searchParams.get("brandId") || "" });
    const context = await resolvePipelineContext({ brandId: query.brandId, module: "arquiteto", action: "view" });
    const graphVersionId = url.searchParams.get("graphVersionId") || undefined;
    if (graphVersionId) {
      const graph = await readInternalLinkGraph(context, graphVersionId);
      return NextResponse.json({ success: true, data: { source: "CANONICAL_REMOTE", graph, ref: graph ? internalLinkGraphRefForDownstream(graph) : null } });
    }
    const graphs = await listInternalLinkGraphs(context, url.searchParams.get("graphId") || undefined);
    return NextResponse.json({ success: true, data: { source: "CANONICAL_REMOTE", graphs } });
  } catch (error) {
    // Query invalida e LINHA invalida nao sao o mesmo erro: responder sempre
    // "brandId e obrigatorio" mandava investigar o pedido quando o problema
    // estava no que ja foi gravado.
    if (error instanceof z.ZodError) {
      console.error("[internal-link-graph] leitura recusada", error.issues);
      return NextResponse.json(
        { success: false, error: "A leitura do InternalLinkGraph não passou no contrato canônico.", issues: error.flatten() },
        { status: 400 },
      );
    }
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const context = await resolvePipelineContext({ brandId: parsed.brandId, module: "arquiteto", action: parsed.action });
    const persisted = await persistInternalLinkGraph(context, parsed.graph);
    return NextResponse.json({ success: true, data: persisted });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "O InternalLinkGraph enviado não corresponde ao contrato canônico." }, { status: 400 });
    const mapped = pipelineArtifactErrorResponse(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
