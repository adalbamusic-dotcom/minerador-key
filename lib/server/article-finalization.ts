import "server-only";
import type { ContentDocument } from "../arquiteto/contracts.ts";
import { ContentDocumentRepository } from "./editorial-repositories";
import { markArticlePredecessorSuperseded } from "./writer-retention";
import {
  finalizationDecisionFromReceipt, planArticleFinalization, planRetentionAfterFinalization,
  verifyFinalizationReadback,
} from "../redator/deliverable-lifecycle.ts";

/**
 * ===== CORTE 6A.4 · A FINALIZAÇÃO DO ARTIGO PASSA A INTEGRAR A RETENÇÃO M2 =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 *   FINAL_A → editar → FINAL_B
 *
 * B nascia, virava a última versão, e A NÃO recebia `superseded_at`,
 * `superseded_by_version_id` nem `purge_after`. O histórico crescia e nada era
 * recolhido.
 *
 * A causa não era a chamada de marcação faltando — era mais fundo:
 * `content_documents.current_version_id` **não era escrito por ninguém**.
 * `ContentDocumentRepository.createVersion` insere a linha da versão e para.
 * Antes da M6, quem movia o ponteiro era `writer_save_article_draft`, e o fazia
 * no SAVE, que é a hora errada; a M6 tirou isso e não havia mais ninguém.
 *
 * Com o ponteiro sempre nulo, a guarda `retention_successor_not_current` da RPC
 * `writer_mark_document_version_superseded` nunca podia passar. A autoridade de
 * banco existia e estava correta; faltava alguém dizer qual é a corrente.
 *
 * ==================== POR QUE ISTO NÃO É AUTORIDADE NOVA ====================
 *
 * O versionamento do artigo sempre morou do lado TypeScript — não existe RPC
 * que crie versão de artigo, ao contrário do entregável. Mover o ponteiro na
 * mesma camada que insere a versão é completar o que já era daqui, não abrir um
 * segundo caminho. A decisão de RETER continua sendo da regra pura, e a
 * execução continua sendo da RPC da M2.
 *
 * ==================== A ORDEM, QUE NÃO É NEGOCIÁVEL ====================
 *
 *   inserir versão → mover ponteiro → READBACK → conferir → só então marcar A
 *
 * Se o readback não confirmar, A **não** entra em retenção: a janela de 48h
 * abriria sobre o que talvez seja a única versão boa.
 *
 * Se a marcação falhar depois de B confirmada, B continua corrente, A fica
 * retida por mais tempo, e o desfecho volta no resultado. Nunca se compensa
 * apagando B.
 */

export type ArticleFinalizationResult = {
  versionId: string;
  versionNumber: number;
  /**
   * O `lock_version` DEPOIS do movimento do ponteiro. Mover a corrente é um
   * UPDATE, e o trigger `content_documents_touch_trg` incrementa o lock em
   * qualquer update — então o lock que o `save` devolveu já nasce velho aqui.
   * Quem responde ao cliente precisa usar este, ou a próxima gravação do usuário
   * bate em conflito logo depois de finalizar.
   */
  lockVersion: number | null;
  /** true quando nada foi criado: a versão devolvida já era a corrente. */
  reused: boolean;
  /** O que aconteceu com a predecessora. Visível, nunca engolido. */
  retention:
    | Awaited<ReturnType<typeof markArticlePredecessorSuperseded>>
    | { status: "skipped"; reason: "no_predecessor" | "readback_failed" | "unchanged_finalization" | "no_material_change" | "already_current" };
};

/**
 * Cria a versão da mudança de estado do artigo e integra a retenção.
 *
 * `expectedStatusColumn` é o estado que a leitura de volta precisa mostrar.
 * Enviar para revisão também cria versão e grava `in_review`; exigir `approved`
 * ali faria a conferência reprovar uma gravação correta.
 */
/**
 * ===== CORTE 6A.5 · A FINALIZAÇÃO JÁ FEITA SE RECONHECE =====
 *
 * Devolve a versão corrente quando a finalização pedida JÁ está persistida, e
 * `null` quando há trabalho a fazer. Nada é escrito aqui.
 *
 * Serve dois momentos, e é por isso que é função separada:
 *
 *   ANTES do save     clique duplicado ou retry cujo lock ainda é válido
 *   DEPOIS de um 409  retry cujo lock ficou para trás porque a primeira
 *                     requisição venceu — o caso do timeout, em que o cliente
 *                     nunca soube que deu certo
 *
 * No segundo caso, recusar com 409 seria dizer "falhou" para algo que está
 * gravado exatamente como foi pedido. Isso não é esconder concorrência: a
 * escrita aconteceu UMA vez, e o que se reconhece é que o estado desejado já é
 * o estado persistido. Se o que está gravado for OUTRO conteúdo, o plano devolve
 * `create_version` e o 409 do chamador continua valendo.
 */
export async function reuseFinalizedArticleVersion(input: {
  brandId: string;
  documentId: string;
  contentHash: string;
  targetStatusColumn: string;
}): Promise<(ArticleFinalizationResult & { updatedAt: string }) | null> {
  const repository = new ContentDocumentRepository();
  const documento = await repository.readFinalizationState(input.brandId, input.documentId);
  const corrente = documento?.currentVersionId
    ? await repository.versionSummary(input.documentId, documento.currentVersionId)
    : null;

  const plano = planArticleFinalization({
    document: documento
      ? { status: documento.status, contentHash: documento.contentHash,
          currentVersionId: documento.currentVersionId }
      : null,
    currentVersionContentHash: corrente?.contentHash ?? null,
    incomingContentHash: input.contentHash,
    targetStatus: input.targetStatusColumn,
  });
  if (plano.action !== "reuse_current" || !corrente || !documento) return null;

  /*
   * Nenhuma escrita: o lock devolvido é o que está no banco agora. É o que a
   * próxima gravação do cliente precisa para não bater em conflito por causa de
   * uma finalização que ele já tinha feito.
   */
  return {
    versionId: corrente.versionId, versionNumber: corrente.versionNumber,
    lockVersion: documento.lockVersion, updatedAt: documento.updatedAt, reused: true,
    retention: { status: "skipped", reason: "already_current" },
  };
}

export async function finalizeArticleVersion(input: {
  brandId: string;
  documentId: string;
  document: ContentDocument;
  contentHash: string;
  changeReason: string;
  actorId: string;
  expectedStatusColumn: string;
}): Promise<ArticleFinalizationResult> {
  const repository = new ContentDocumentRepository();

  /* ---------- 1. A VERSÃO NASCE, com previous = a última existente ---------- */
  const version = await repository.createVersion(
    input.documentId, input.document, input.contentHash, input.changeReason, input.actorId);

  /* ---------- 2. ELA VIRA A CORRENTE ---------- */
  await repository.promoteVersionToCurrent(input.brandId, input.documentId, version.versionId);

  /* ---------- 3. READBACK OBRIGATÓRIO ---------- */
  const lido = await repository.readFinalizationState(input.brandId, input.documentId);
  const conferencia = verifyFinalizationReadback({
    readback: lido
      ? { status: lido.status, currentVersionId: lido.currentVersionId, contentHash: lido.contentHash }
      : null,
    receipt: { versionId: version.versionId, contentHash: input.contentHash },
    expectedStatus: input.expectedStatusColumn,
  });

  /*
   * Readback reprovado NÃO derruba a requisição: a versão existe e a gravação
   * do documento valeu. Dizer "falhou" mandaria quem opera refazer algo que deu
   * certo. O que não acontece é a retenção — falha fechada.
   */
  if (!conferencia.ok) {
    return { ...version, lockVersion: lido?.lockVersion ?? null, reused: false,
      retention: { status: "skipped", reason: "readback_failed" } };
  }
  /* Depois de conferencia.ok, lido é necessariamente não-nulo. */
  if (!lido) {
    return { ...version, lockVersion: null, reused: false,
      retention: { status: "skipped", reason: "readback_failed" } };
  }

  /* ---------- 4. SÓ AGORA: A PREDECESSORA PODE ENTRAR EM RETENÇÃO ---------- */
  const passo = planRetentionAfterFinalization({
    decision: finalizationDecisionFromReceipt({ versionId: version.versionId, unchanged: false }),
    readbackCurrentVersionId: lido.currentVersionId,
    createdVersionId: version.versionId,
  });
  if (!passo.mark) {
    return { ...version, lockVersion: lido.lockVersion, reused: false,
      retention: { status: "skipped", reason: passo.reason } };
  }

  /*
   * ===== GUARDA DE CONTEÚDO: NÃO RETER POR UMA FINALIZAÇÃO QUE NÃO MUDOU NADA
   *
   * A rota não recusa uma segunda finalização com o mesmo conteúdo — o botão da
   * tela fica desabilitado quando o artigo já está aprovado, mas a rota em si
   * não compara hashes (gap registrado no relatório desta rodada).
   *
   * Se isso acontecer, a predecessora teria hash IDÊNTICO à sucessora, e marcá-la
   * condenaria uma versão boa à exclusão por causa de um ato que não produziu
   * nada. A guarda é o lado conservador do erro: na dúvida, não retém.
   */
  const predecessor = await repository.versionSummary(input.documentId, passo.predecessorVersionId);
  const predecessorHash = predecessor?.contentHash ?? null;
  if (predecessorHash !== null && predecessorHash === input.contentHash) {
    return { ...version, lockVersion: lido.lockVersion, reused: false,
      retention: { status: "skipped", reason: "no_material_change" } };
  }

  const retention = await markArticlePredecessorSuperseded({
    brandId: input.brandId, documentId: input.documentId,
    successorVersionId: version.versionId,
    currentVersionId: lido.currentVersionId,
    unchanged: false,
  });
  /*
   * A marcação escreve em content_document_versions, não em content_documents —
   * o lock do documento não muda por causa dela, então o lido acima continua
   * valendo.
   */
  return { ...version, lockVersion: lido.lockVersion, reused: false, retention };
}
