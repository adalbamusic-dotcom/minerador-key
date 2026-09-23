import "server-only";

/**
 * ===== A LEITURA DO DOCUMENTO PARA SEMEAR =====
 *
 * `writerSourceHash` já lia `content_documents`, mas só traz `content_hash`. A
 * semeadura precisa do título, do status, dos blocos e dos fundamentos do
 * Radar; esta é uma leitura própria, para ninguém pagar pelo que não usa.
 *
 * Mesmo escopo de marca e mesmo erro do módulo vizinho: um documento de outra
 * marca é `document_not_found`, não "acesso negado" — quem não é da marca não
 * deve nem aprender que o id existe.
 *
 * ===== FASE 0 · SÓ OS CAMINHOS QUE OS FUNDAMENTOS LEEM =====
 *
 * Antes, esta leitura trazia o payload inteiro (4.502.936 B no documento
 * GOOGLE, medido em 2026-09-23) para `radarFoundationsOf` usar ~75 kB dele.
 * Agora ela pede só os caminhos de `RADAR_FOUNDATIONS_BUNDLE_PATHS`, em
 * consultas em série de até cinco caminhos cada: juntar todos numa consulta só
 * custou 3,6 s de banco, contra ~0,55 s em fatias (ver
 * `lib/redator/writer-document-reads.ts`). Em série, e não em paralelo: a
 * causa provável do custo não linear é a memória que cada consulta aloca no
 * banco (hipótese, não medida), e consultas simultâneas a somariam.
 *
 * Documento v1, ou v2 sem dossiê, para na primeira consulta: sem dossiê não há
 * bundle a ler.
 */

import { radarFoundationsOfDossier, type RadarFoundations } from "@/lib/redator/radar-foundations";
import {
  WRITER_SEED_BUNDLE_SELECTS, WRITER_SEED_DOCUMENT_SELECT,
  writerSeedDossierFromRows, writerSeedHeadFromRow, type WriterSeedDocument,
} from "@/lib/redator/writer-document-reads";
import { getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";
import { WriterDeliverableError } from "@/lib/server/writer-deliverables";

export async function writerSeedDocument(brandId: string, documentId: string): Promise<{
  document: WriterSeedDocument;
  foundations: RadarFoundations | null;
  contentHash: string;
}> {
  const client = getOperationalClient();
  const ler = async (select: string): Promise<Record<string, unknown>> => {
    const { data, error } = await client.from("content_documents")
      .select(select).eq("id", documentId).eq("marca_id", brandId).maybeSingle();
    if (error) mapPersistenceError(error);
    if (!data) throw new WriterDeliverableError("document_not_found", "Documento não encontrado nesta marca.", 404);
    return data as unknown as Record<string, unknown>;
  };

  const head = writerSeedHeadFromRow(await ler(WRITER_SEED_DOCUMENT_SELECT));
  if (!head) {
    /*
     * Documento gravado fora do contrato não vira contexto de IA. Semear com
     * leitura parcial produziria um roteiro coerente construído sobre um
     * documento que ninguém validou — o pior tipo de saída, porque parece certa.
     * O que a semeadura lê (documento e dossiê) é validado pelos schemas do dono.
     */
    throw new WriterDeliverableError("document_incompatible",
      "O documento está gravado fora do contrato atual e não pode ser usado como contexto.", 422);
  }
  if (!head.dossier) return { document: head.document, foundations: null, contentHash: head.contentHash };

  const linhas: Record<string, unknown>[] = [];
  for (const select of WRITER_SEED_BUNDLE_SELECTS) linhas.push(await ler(select));
  const dossier = writerSeedDossierFromRows(head.dossier, linhas);
  if (!dossier) {
    throw new WriterDeliverableError("document_changed",
      "O pacote do Radar deste documento mudou durante a leitura. Tente de novo.", 409);
  }
  return { document: head.document, foundations: radarFoundationsOfDossier(dossier), contentHash: head.contentHash };
}
