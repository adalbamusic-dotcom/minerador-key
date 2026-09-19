import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse, AuthzError } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ContentDocumentRepository, PublicationRepository, documentStatusColumn } from "@/lib/server/editorial-repositories";
import { finalizeArticleVersion, reuseFinalizedArticleVersion } from "@/lib/server/article-finalization";
import { DocumentSaveInputSchema, DocumentUserStateInputSchema } from "@/lib/editorial/persistence-contracts";
import { OptimisticLockError, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { runGuardian } from "@/lib/redator/guardian";

export async function PATCH(request: NextRequest) {
  try { const profile = await requireCanonicalSessionProfile(); const input = DocumentSaveInputSchema.parse(await request.json()); await assertEditorialPermission(profile, input.brandId, "redator", "edit");
    if (input.document.status === "aprovado") { const report = runGuardian(input.document, input.contentHash); if (report.blockingCount > 0) throw new AuthzError(409, `Documento bloqueado pelo Guardião: ${report.blockingCount} achado(s) crítico(s).`); }
    if (input.document.id !== input.documentId) throw new AuthzError(400, "O identificador do documento não coincide com o payload enviado.");
    const repository = new ContentDocumentRepository();

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
    const alvo = documentStatusColumn(input.document.status);
    if (input.createVersion) {
      const jaFeito = await reuseFinalizedArticleVersion({
        brandId: input.brandId, documentId: input.documentId,
        contentHash: input.contentHash, targetStatusColumn: alvo });
      if (jaFeito) {
        const { updatedAt, ...version } = jaFeito;
        return NextResponse.json({ lockVersion: version.lockVersion, updatedAt,
          contentHash: input.contentHash, version });
      }
    }

    let saved;
    try {
      saved = await repository.save(input.documentId, input.expectedLockVersion, input.document, input.contentHash, profile.userId);
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
          contentHash: input.contentHash, targetStatusColumn: alvo });
        if (jaFeito) {
          const { updatedAt, ...version } = jaFeito;
          return NextResponse.json({ lockVersion: version.lockVersion, updatedAt,
            contentHash: input.contentHash, version });
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
          brandId: input.brandId, documentId: input.documentId, document: input.document,
          contentHash: input.contentHash, changeReason: input.changeReason, actorId: profile.userId,
          expectedStatusColumn: saved.status as string,
        })
      : null;
    await new PublicationRepository().syncDocumentStatus(input.documentId, input.document.status, profile.userId);
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
