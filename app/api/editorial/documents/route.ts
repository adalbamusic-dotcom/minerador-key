import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse, AuthzError } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ContentDocumentRepository, PublicationRepository, documentStatusColumn } from "@/lib/server/editorial-repositories";
import { finalizeArticleVersion, reuseFinalizedArticleVersion } from "@/lib/server/article-finalization";
import { DocumentSaveInputSchema, DocumentUserStateInputSchema, PersistedDocumentDetailSchema } from "@/lib/editorial/persistence-contracts";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { runGuardian } from "@/lib/redator/guardian";
import { contentHash } from "@/lib/arquiteto/versioning";
import { isPartialContentDocument } from "@/lib/editorial/content-document-listing";

const DetailQuerySchema = z.object({ brandId: z.string().uuid(), documentId: z.string().min(1).max(200) });

/**
 * ===== E1 · O DETALHE DO DOCUMENTO ABERTO =====
 *
 * A listagem da mesa (`/api/editorial/workspace`) deixou de trazer o pacote do
 * Radar (`importedContext.dossier.bundle`, 99,8% do payload). Quem precisa do
 * documento inteiro pede UM, por aqui: o Redator ao abrir, antes de liberar a
 * edição, e Publicações ao exportar.
 *
 * A permissão é a mesma da listagem (`marca`/`view`): quem lia a mesa recebia
 * este mesmo payload inteiro, e Publicações exporta sem precisar do Redator.
 * A consulta filtra pela marca pedida (R4). Leitura por requisição: Route
 * Handler não é cacheado por padrão no Next 16
 * (node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:51).
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const consulta = DetailQuerySchema.safeParse({
      brandId: request.nextUrl.searchParams.get("brandId"),
      documentId: request.nextUrl.searchParams.get("documentId"),
    });
    if (!consulta.success) return NextResponse.json({ code: "invalid_request", error: "Marca ou documento inválidos." }, { status: 400 });
    const { brandId, documentId } = consulta.data;
    await assertEditorialPermission(profile, brandId, "marca", "view");
    const detalhe = await new ContentDocumentRepository().findDetail(brandId, documentId);
    if (!detalhe) return NextResponse.json({ code: "document_not_found", error: "Documento não encontrado nesta marca." }, { status: 404 });
    return NextResponse.json({ data: PersistedDocumentDetailSchema.parse({ brandId, ...detalhe }) });
  } catch (error) {
    /* Dado GRAVADO fora do contrato não é pedido inválido. */
    if (error instanceof z.ZodError) return NextResponse.json({ code: "persisted_data_invalid", error: "O documento gravado não corresponde ao contrato vigente." }, { status: 502 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function PATCH(request: NextRequest) {
  try { const profile = await requireCanonicalSessionProfile(); const input = DocumentSaveInputSchema.parse(await request.json()); await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    if (input.document.id !== input.documentId) throw new AuthzError(400, "O identificador do documento não coincide com o payload enviado.");
    const repository = new ContentDocumentRepository();

    /*
     * ===== E1 · A CÓPIA SEM O PACOTE DO RADAR NUNCA APAGA O PACOTE =====
     *
     * A listagem da mesa entrega o documento sem `importedContext.dossier.bundle`,
     * marcado como parcial. O Redator só edita depois de ler o detalhe, então o
     * caminho normal manda o documento completo e passa direto por aqui.
     *
     * Se uma cópia parcial chegar mesmo assim, ela não é gravada como está: o
     * bundle é lido verbatim da linha desta marca e devolvido ao documento, e o
     * hash é recalculado sobre o documento que de fato vai ser gravado — o do
     * cliente descreveria outro conteúdo. Tudo abaixo usa este documento.
     */
    const document = isPartialContentDocument(input.document)
      ? await repository.completeWithStoredBundle(input.brandId, input.documentId, input.document)
      : input.document;
    const hash = document === input.document ? input.contentHash : await contentHash(document);
    if (document.status === "aprovado") { const report = runGuardian(document, hash); if (report.blockingCount > 0) throw new AuthzError(409, `Documento bloqueado pelo Guardião: ${report.blockingCount} achado(s) crítico(s).`); }

    /*
     * ===== CORTE 6A.5 · FINALIZAR DUAS VEZES NÃO CRIA DUAS VERSÕES =====
     *
     * Antes de escrever qualquer coisa, a finalização pergunta se ela JÁ está
     * gravada: mesma versão corrente, mesmo hash no documento, mesmo status.
     * Se estiver, devolve a versão que existe — sem save, sem versão nova, sem
     * retenção — e com o lock que está no banco agora.
     *
     * Isso cobre o clique duplicado. O retry depois de um timeout cai no bloco
     * de captura abaixo, porque o lock do cliente ficou para trás.
     */
    const alvo = documentStatusColumn(document.status);
    if (input.createVersion) {
      const jaFeito = await reuseFinalizedArticleVersion({
        brandId: input.brandId, documentId: input.documentId,
        contentHash: hash, targetStatusColumn: alvo });
      if (jaFeito) {
        const { updatedAt, ...version } = jaFeito;
        return NextResponse.json({ lockVersion: version.lockVersion, updatedAt,
          contentHash: hash, version });
      }
    }

    let saved;
    try {
      saved = await repository.save(input.documentId, input.expectedLockVersion, document, hash, profile.userId, input.brandId);
    } catch (erro) {
      /*
       * ===== O RETRY QUE PERDEU O LOCK PORQUE A PRIMEIRA REQUISIÇÃO VENCEU =====
       *
       * O cliente mandou finalizar, a gravação aconteceu, e a resposta se
       * perdeu. Ele repete com o lock antigo, e o UPDATE condicional não casa.
       *
       * Recusar aqui seria dizer que falhou algo gravado exatamente como foi
       * pedido. Então pergunto de novo: o estado persistido É o pedido? Se sim,
       * devolvo a versão que existe. Se for outro conteúdo, o conflito é real e
       * o erro sobe.
       *
       * Nada é deduplicado depois do fato: a escrita aconteceu UMA vez, barrada
       * pelo próprio WHERE lock_version do UPDATE.
       */
      if (input.createVersion && erro instanceof OptimisticLockError) {
        const jaFeito = await reuseFinalizedArticleVersion({
          brandId: input.brandId, documentId: input.documentId,
          contentHash: hash, targetStatusColumn: alvo });
        if (jaFeito) {
          const { updatedAt, ...version } = jaFeito;
          return NextResponse.json({ lockVersion: version.lockVersion, updatedAt,
            contentHash: hash, version });
        }
      }
      throw erro;
    }
    /*
     * ===== CORTE 6A.4 · SALVAR E FINALIZAR SÃO CAMINHOS DIFERENTES AQUI =====
     *
     * Sem `createVersion`, nada além do `save` acima acontece: autosave e
     * "Salvar rascunho" continuam sem criar histórico e sem tocar em retenção.
     *
     * Com `createVersion`, a finalização passa a mover `current_version_id` e a
     * integrar a retenção M2 — nessa ordem, e só depois do readback confirmar.
     * O desfecho da retenção volta dentro de `version`, visível.
     */
    const version = input.createVersion
      ? await finalizeArticleVersion({
          brandId: input.brandId, documentId: input.documentId, document,
          contentHash: hash, changeReason: input.changeReason, actorId: profile.userId,
          expectedStatusColumn: saved.status as string,
        })
      : null;
    await new PublicationRepository().syncDocumentStatus(input.documentId, document.status, profile.userId);
    /*
     * ===== O LOCK DEVOLVIDO É O DE DEPOIS DA FINALIZAÇÃO =====
     *
     * Finalizar move current_version_id, e content_documents_touch_trg
     * incrementa lock_version em qualquer UPDATE. Devolver o lock do save faria
     * o cliente guardar um número já vencido e bater em conflito na próxima
     * gravação — logo depois de finalizar, que é o pior momento.
     */
    return NextResponse.json({ lockVersion: version?.lockVersion ?? saved.lock_version,
      updatedAt: saved.updated_at, contentHash: saved.content_hash, version });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Documento inválido.", details: error.issues }, { status: 400 });
    if (error instanceof OptimisticLockError) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 }); if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
}

export async function POST(request: NextRequest) {
  try { const profile = await requireCanonicalSessionProfile(); const input = DocumentUserStateInputSchema.parse(await request.json()); await assertEditorialPermission(profile, input.brandId, "redator", "view");
    await new ContentDocumentRepository().saveUserState(input.documentId, profile.userId, input); return NextResponse.json({ ok: true });
  } catch (error) { if (error instanceof z.ZodError) return NextResponse.json({ error: "Estado do editor inválido." }, { status: 400 }); if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
}
