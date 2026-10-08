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
import { writerBrandVoiceFoundation } from "@/lib/redator/writer-evidence-catalog";
import { writerArticleBlueprintForWriting, type WriterBlueprintKeywords } from "@/lib/redator/writer-blueprint-for-writing";
import {
  WRITER_SEED_BUNDLE_SELECTS, WRITER_SEED_DOCUMENT_SELECT,
  writerSeedDossierFromRows, writerSeedHeadFromRow, type WriterSeedDocument,
} from "@/lib/redator/writer-document-reads";
import { getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";
import { WriterDeliverableError } from "@/lib/server/writer-deliverables";
import { readWriterApprovedArticleBlueprint, readWriterBrandVoice } from "@/lib/server/writer-evidence-sources";

/*
 * 2026-10-02 · O artigo da semeadura sai da origem do Radar que a PRIMEIRA
 * consulta já traz (`radarOrigin`, validada pelo contrato do documento): o
 * artigo-modelo é lido por Marca + artigo + pacote sem consulta extra ao
 * documento. O apelido vem do próprio select, não de um prefixo copiado.
 */
const APELIDO_DA_ORIGEM = WRITER_SEED_DOCUMENT_SELECT.split(",")
  .find(coluna => coluna.endsWith("->radarOrigin"))?.split(":")[0] ?? null;

const artigoDaOrigem = (linha: Record<string, unknown>): string | null => {
  const origem = APELIDO_DA_ORIGEM ? linha[APELIDO_DA_ORIGEM] : null;
  const articleId = origem && typeof origem === "object" && !Array.isArray(origem) ? (origem as Record<string, unknown>).articleId : null;
  return typeof articleId === "string" && articleId.trim() ? articleId : null;
};

/**
 * 2026-10-02 · SDD diretriz editorial, Adendos A e C · a voz corrente da Marca
 * e o artigo-modelo APROVADO do pacote, para roteiro e carrossel escreverem a
 * copy e o `closingCta` na voz da marca. Leitura de contexto, não condição: o
 * que não existe (ou não pôde ser lido agora) não entra, e a semeadura segue
 * como era. Mesmos leitores do leitor de evidências, na Marca autorizada, em
 * série como o resto desta leitura.
 */
async function vozEArtigoModelo(brandId: string, alvo: { articleId: string | null; bundleHash: string; keywords: WriterBlueprintKeywords | null }): Promise<Pick<RadarFoundations, "brandVoice" | "articleBlueprint">> {
  const contexto = { brandId, client: getOperationalClient() };
  const voz = await readWriterBrandVoice(contexto, { content: true });
  const artigoModelo = alvo.articleId
    ? await readWriterApprovedArticleBlueprint(contexto, { articleId: alvo.articleId, bundleHash: alvo.bundleHash }, { content: true })
    : null;
  const brandVoice = voz.kind === "current"
    ? writerBrandVoiceFoundation({ versionId: voz.meta.versionId, versionNumber: voz.meta.versionNumber, name: voz.name, lifecycle: voz.lifecycle, title: voz.title, sections: voz.sections })
    : null;
  /* 2026-10-08 · a mesma projeção do leitor de evidências: nomes atuais, frases que pedem fonte e o mapa da atualização. */
  const articleBlueprint = artigoModelo?.kind === "approved" && artigoModelo.content
    ? writerArticleBlueprintForWriting({ id: artigoModelo.meta.id, versionNumber: artigoModelo.meta.versionNumber, approvedAt: artigoModelo.meta.approvedAt, ...artigoModelo.content, keywords: alvo.keywords })
    : null;
  return { ...(brandVoice ? { brandVoice } : {}), ...(articleBlueprint ? { articleBlueprint } : {}) };
}

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

  const primeira = await ler(WRITER_SEED_DOCUMENT_SELECT);
  const head = writerSeedHeadFromRow(primeira);
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
  /* As linhas do envio (Assunto, F4.2) vêm do cabeçalho, pela mesma projeção do painel. */
  const fundamentos = radarFoundationsOfDossier(dossier, { editorialContext: head.editorialContext });
  /* 2026-10-02 · voz e artigo-modelo só quando existem: sem eles, os fundamentos são os do painel. */
  const vivos = fundamentos ? await vozEArtigoModelo(brandId, { articleId: artigoDaOrigem(primeira), bundleHash: head.dossier.bundleHash, keywords: head.dossier.keywordContext }) : {};
  return {
    document: head.document,
    foundations: fundamentos ? { ...fundamentos, ...vivos } : null,
    contentHash: head.contentHash,
  };
}
