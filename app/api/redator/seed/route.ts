/**
 * ===== SEMEADURA DE ENTREGÁVEL A PARTIR DOS FUNDAMENTOS DO RADAR =====
 *
 * Esta rota NÃO grava. Ela devolve um payload proposto, e quem persiste é o
 * `PUT /api/redator/deliverables`, que já existe e já sabe recusar entregável
 * finalizado e conflito de lock. Duas autoridades de escrita para a mesma tabela
 * divergiriam no primeiro ajuste.
 *
 * Consequência direta, e é a pedida pelo enunciado: semear grava **rascunho**.
 * Nenhuma versão é criada, nenhuma retenção começa, o lifecycle M4–M6 não é
 * tocado. Gerar não é finalizar.
 *
 * A chamada de IA é a canônica — a mesma de `/api/redator/section`. Sem
 * Connection válida, `resolveDeepSeekCanonicalConfig` lança com código e
 * mensagem próprios, e eles sobem inteiros para a tela: o enunciado pede estado
 * operacional claro, não conteúdo fictício.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse, AuthzError } from "@/lib/server/authz";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { resolveDeepSeekCanonicalConfig, DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { newWriterDeliverable, VideoScriptPayloadSchema, CarouselPayloadSchema } from "@/lib/redator/multiformat-contracts";
import {
  buildCarouselSeedPrompt, buildScriptSeedPrompt, carouselPayloadFromSeed, finalArticleText,
  ProviderCarouselSeedSchema, ProviderScriptSeedSchema, scriptPayloadFromSeed,
  CAROUSEL_SEED_SYSTEM_PROMPT, SCRIPT_SEED_SYSTEM_PROMPT,
} from "@/lib/redator/deliverable-seed";
import { writerSeedDocument } from "@/lib/server/writer-seed";

const RequestSchema = z.object({
  brandId: z.string().uuid(),
  documentId: z.string().min(1),
  kind: z.enum(["video_script", "carousel"]),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = RequestSchema.parse(await request.json());
    /* Semear escreve um rascunho, então exige permissão de edição, não de leitura. */
    await assertEditorialPermission(profile, input.brandId, "redator", "edit");

    /* Os fundamentos já vêm projetados: a leitura traz só os caminhos que eles usam. */
    const { document, foundations, contentHash } = await writerSeedDocument(input.brandId, input.documentId);
    if (!foundations) {
      throw new AuthzError(422, "Este documento não veio do Radar com dossiê. Não há contexto para semear.");
    }

    const source = { title: document.title, foundations, finalArticle: finalArticleText(document) };
    const provider = await resolveDeepSeekCanonicalConfig({
      actorUserId: profile.userId, brandId: input.brandId, client: createCanonicalServiceClient(),
    });
    const base = newWriterDeliverable(input.kind, {
      documentId: document.id, title: document.title, sourceDocumentHash: contentHash,
    });
    /*
     * O id da parte é sorteado aqui, no servidor: ele é a âncora da mídia
     * (`anchor_ref`), e deixar o modelo escolher abriria a porta para dois ids
     * iguais disputando a mesma âncora.
     */
    const novoId = () => crypto.randomUUID();

    if (input.kind === "video_script") {
      const seed = await generateStructuredAI({
        provider, system: SCRIPT_SEED_SYSTEM_PROMPT, user: buildScriptSeedPrompt(source),
        schema: ProviderScriptSeedSchema, maxTokens: 6000,
      });
      const payload = VideoScriptPayloadSchema.parse(
        scriptPayloadFromSeed({ base: base as never, seed, novoId }));
      return NextResponse.json({ payload });
    }

    const seed = await generateStructuredAI({
      provider, system: CAROUSEL_SEED_SYSTEM_PROMPT, user: buildCarouselSeedPrompt(source),
      schema: ProviderCarouselSeedSchema, maxTokens: 5000,
    });
    const payload = CarouselPayloadSchema.parse(
      carouselPayloadFromSeed({ base: base as never, seed, novoId }));
    return NextResponse.json({ payload });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ code: "invalid_input", error: "Pedido de semeadura inválido.", issues: error.issues }, { status: 400 });
    }
    /* Códigos e mensagens do provider sobem inteiros — a tela precisa do motivo real. */
    if (error instanceof DeepSeekCanonicalError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    }
    if (error instanceof StructuredAIError) {
      return NextResponse.json({ code: error.code, error: error.message, issues: error.issues }, { status: error.status });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
