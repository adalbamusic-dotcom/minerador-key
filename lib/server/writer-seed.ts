import "server-only";

/**
 * ===== A LEITURA DO DOCUMENTO PARA SEMEAR =====
 *
 * `writerSourceHash` já lia `content_documents`, mas só traz `content_hash` — a
 * semeadura precisa do payload inteiro, porque é dele que sai o dossiê do Radar
 * e o artigo canônico. Em vez de alargar aquela consulta e fazer todo chamador
 * pagar por um `payload` que não usa, esta é uma leitura própria.
 *
 * Mesmo escopo de marca e mesmo erro do módulo vizinho: um documento de outra
 * marca é `document_not_found`, não "acesso negado" — quem não é da marca não
 * deve nem aprender que o id existe.
 */

import { ContentDocumentSchema, type ContentDocument } from "@/lib/arquiteto/contracts";
import { getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";
import { WriterDeliverableError } from "@/lib/server/writer-deliverables";

export async function writerSeedDocument(brandId: string, documentId: string): Promise<{
  document: ContentDocument;
  contentHash: string;
}> {
  const { data, error } = await getOperationalClient().from("content_documents")
    .select("id,marca_id,content_hash,payload").eq("id", documentId).eq("marca_id", brandId).maybeSingle();
  if (error) mapPersistenceError(error);
  if (!data) throw new WriterDeliverableError("document_not_found", "Documento não encontrado nesta marca.", 404);

  const parsed = ContentDocumentSchema.safeParse(data.payload);
  if (!parsed.success) {
    /*
     * Documento gravado fora do contrato não vira contexto de IA. Semear com
     * leitura parcial produziria um roteiro coerente construído sobre um
     * documento que ninguém validou — o pior tipo de saída, porque parece certa.
     */
    throw new WriterDeliverableError("document_incompatible",
      "O documento está gravado fora do contrato atual e não pode ser usado como contexto.", 422);
  }
  return { document: parsed.data, contentHash: data.content_hash };
}
