import { NextResponse } from "next/server";
import { z } from "zod";
import {
  LINK_ANCHOR_SYSTEM_PROMPT,
  LinkAnchorResponseSchema,
  buildLinkAnchorPrompt,
  keepValidLinkAnchorProposals,
  summarizeLinkAnchorProposals,
  type LinkAnchorUnitFacts,
} from "@/lib/arquiteto/link-anchor-ai";
import { InternalLinkGraphRelationTypeSchema } from "@/lib/arquiteto/contracts";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI } from "@/lib/server/structured-ai";
import { integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * IA DE ÂNCORAS SEMÂNTICAS DA ABA LINKS INTERNOS.
 *
 * Motor interno do botão "Gerar mapa de âncoras" — não é um quinto processo
 * na tela. Usa a Connection global e o gerador estruturado compartilhado, a
 * mesma infraestrutura da IA territorial.
 *
 * NÃO consulta SERP. O Arquiteto responde QUEM linka para QUEM e COM QUAIS
 * CONCEITOS; quantas vezes, onde e em qual parágrafo é pergunta do Radar, e
 * duplicar a pesquisa competitiva aqui seria pagar duas vezes pela mesma
 * resposta.
 *
 * A rota é PROPOSTA. Ela não cria grafo, não abre working copy e não aprova
 * nada: devolve conexões revisáveis para um humano confirmar.
 */

const UnitSchema = z.object({
  ref: z.string().min(1),
  unitType: z.enum(["SILO_PAGE", "ARTICLE_DNA"]),
  label: z.string().min(1),
  siloId: z.string().min(1),
  siloLabel: z.string().min(1),
  architecturalRole: z.enum(["PILAR", "SUPORTE", "REFORCO", "OUTRO"]).nullable(),
  principal: z.string().nullable(),
  secondaries: z.array(z.string()).max(10),
  reinforcements: z.array(z.string()).max(10),
  entities: z.array(z.string()).max(10),
  intent: z.string().nullable(),
  slug: z.string().nullable(),
  narrative: z.string().nullable(),
  published: z.boolean(),
}).strict();

const RequestSchema = z.object({
  brandId: z.string().uuid(),
  siloId: z.string().min(1),
  units: z.array(UnitSchema).min(2).max(40),
  candidates: z.array(z.object({
    sourceRef: z.string().min(1),
    targetRef: z.string().min(1),
    relationType: InternalLinkGraphRelationTypeSchema,
    structuralReason: z.string().min(1),
  }).strict()).min(1).max(40),
}).strict();

/**
 * Mensagem para a interface, sem nome de provider.
 *
 * O detalhe técnico continua no log da operação; a UI do Arquiteto fala de
 * "geração com IA", não de fornecedor.
 */
function publicFailureMessage(error: unknown): string {
  const bruto = error instanceof Error ? error.message : "";
  // "O provider de IA respondeu…" virava "O serviço o modelo respondeu…": duas
  // substituições atropelando a mesma frase. A do fornecedor vem primeiro e já
  // carrega o artigo, então a segunda não tem mais o que trocar ali.
  const semProvider = bruto
    .replace(/\bo\s+provider\s+DeepSeek\b/gi, "o serviço de IA")
    .replace(/\bprovider\s+DeepSeek\b/gi, "serviço de IA")
    .replace(/\bDeepSeek\b/gi, "serviço de IA")
    .replace(/\bprovider\b/gi, "serviço");
  return semProvider.trim() || "Falha ao gerar o mapa de âncoras.";
}

export async function POST(request: Request) {
  const operationRequestId = crypto.randomUUID();
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Pedido de âncoras inválido.", issues: parsed.error.flatten() }, { status: 400 });
    }
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    const unitsByRef = new Map<string, LinkAnchorUnitFacts>(parsed.data.units.map(unit => [unit.ref, unit]));

    // Candidato que cita unidade inexistente ou atravessa Silo não chega ao
    // modelo: perguntar sobre objeto imaginário só produz resposta imaginária.
    const candidatos = parsed.data.candidates
      .map(candidate => ({
        source: unitsByRef.get(candidate.sourceRef),
        target: unitsByRef.get(candidate.targetRef),
        relationType: candidate.relationType,
        structuralReason: candidate.structuralReason,
      }))
      .filter((candidate): candidate is Parameters<typeof buildLinkAnchorPrompt>[0][number] =>
        Boolean(candidate.source && candidate.target)
        && candidate.source!.siloId === parsed.data.siloId
        && candidate.target!.siloId === parsed.data.siloId
        && candidate.source!.ref !== candidate.target!.ref);

    if (!candidatos.length) {
      return NextResponse.json(
        { success: false, error: "Nenhuma conexão candidata válida para este Silo." },
        { status: 400 },
      );
    }

    const provider = await resolveDeepSeekCanonicalConfig({
      actorUserId: pipelineContext.actorUserId,
      brandId: pipelineContext.brandId,
      client: pipelineContext.supabase,
      quotaUnits: candidatos.length,
    });

    try {
      const generated = await generateStructuredAI({
        provider,
        system: LINK_ANCHOR_SYSTEM_PROMPT,
        user: buildLinkAnchorPrompt(candidatos),
        schema: LinkAnchorResponseSchema,
        /*
         * O orçamento acompanha o lote, com piso para o raciocínio.
         *
         * Cada conexão devolve razão, até oito conceitos com texto e motivo, e
         * a razão da confiança; e o modelo gasta orçamento pensando antes de
         * escrever. No teto padrão o JSON cortava no meio, e a resposta
         * truncada chegava como "não retornou conteúdo utilizável" — o que
         * parece falha do fornecedor e é, na verdade, orçamento curto.
         *
         * O piso existe porque o lote PEQUENO era o que mais sofria: com dois
         * candidatos sobrava menos folga que com treze, e o Silo de duas
         * páginas — o caso mais simples — era o único que nunca completava.
         */
        maxTokens: Math.min(16000, 6000 + candidatos.length * 700),
      });

      // A validação editorial roda ANTES de qualquer humano ver: uma lista com
      // âncora inventada treina quem revisa a confiar menos na lista inteira.
      const revisao = keepValidLinkAnchorProposals({
        proposals: generated.proposals,
        unitsByRef,
      });

      await recordIntegrationUsage({
        resource: provider.resource,
        operation: "module_operation",
        module: "arquiteto",
        resultStatus: "succeeded",
        units: candidatos.length,
        idempotencyKey: `deepseek:link_anchors:${operationRequestId}`,
        metadata: { operationRequestId, operationKind: "link_anchors", siloId: parsed.data.siloId },
      });

      return NextResponse.json({
        success: true,
        data: {
          proposals: revisao.accepted,
          rejected: revisao.rejected,
          summary: summarizeLinkAnchorProposals(revisao),
          // A proposta é revisável; ela não é o grafo.
          persistence: "PROPOSAL_ONLY",
        },
      });
    } catch (error) {
      await recordIntegrationUsage({
        resource: provider.resource,
        operation: "module_operation",
        module: "arquiteto",
        resultStatus: "failed",
        units: candidatos.length,
        errorCode: "LINK_ANCHORS_FAILED",
        idempotencyKey: `deepseek:link_anchors:${operationRequestId}:failed`,
        metadata: { operationRequestId, operationKind: "link_anchors", siloId: parsed.data.siloId },
      });
      return NextResponse.json({ success: false, error: publicFailureMessage(error) }, { status: 502 });
    }
  } catch (error) {
    const mapped = integrationRuntimeErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message, code: mapped.code }, { status: mapped.status });
  }
}
