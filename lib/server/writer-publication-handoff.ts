/**
 * ===== REDATOR → PUBLICAÇÕES · A AUTORIDADE SAIU DO PLANO E FOI PARA O DOCUMENTO =====
 *
 * ==================== POR QUE ISTO EXISTE ====================
 *
 * `publication_records` só nascia por `start_writing`, e `start_writing` exigia
 * `ContentPlan` aprovado no Planejador. Com o Planejador fora do pipeline, o
 * artigo vindo do Radar não tinha COMO chegar a Publicações — e o banco real
 * mostrou o resultado: zero registros de publicação, com um documento v2 pronto
 * parado no Redator.
 *
 * A autoridade agora é `ContentDocument` + origem Radar + estado atual. Não há
 * plano sintético, item fictício nem id de compatibilidade: a origem que o
 * registro declara é o `radarOrigin` que o documento já carrega.
 *
 * ==================== A ORDEM PROTEGE A FRONTEIRA ====================
 *
 *   VALIDAR MARCA → VALIDAR DOCUMENTO → VALIDAR ORIGEM RADAR
 *   → VALIDAR PENDÊNCIAS E GATES → PERSISTIR → RELER DO SERVIDOR → SUCESSO
 *
 * O readback é o último passo e não é decorativo: um registro marcado como
 * entregue que Publicações nunca recebeu é pior do que uma entrega que falhou,
 * porque ninguém volta para conferir o que a tela já deu por feito.
 *
 * ==================== FALHA PARCIAL NÃO VIRA SUCESSO ====================
 *
 * Se o readback não confirmar, a resposta é ERRO. Não existe "gravou mas não
 * consegui reler, provavelmente está lá".
 */

import { ContentDocumentSchema, type ArticleDNA, type VersionEnvelope } from "../arquiteto/contracts.ts";
import { createWriterPublication } from "../editorial/operational-flow.ts";
import { runGuardian } from "../redator/guardian.ts";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
import { PublicationRepository } from "./editorial-repositories";

export class WriterPublicationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "WriterPublicationError";
    this.code = code;
    this.status = status;
  }
}

export type WriterPublicationChange = "CREATED" | "ALREADY_SENT";

export type WriterPublicationResult = {
  change: WriterPublicationChange;
  publicationId: string;
  documentHash: string;
  publication: ReturnType<typeof createWriterPublication>;
};

export async function sendWriterToPublications(input: {
  brandId: string;
  documentId: string;
  actorId: string;
  now?: string;
}): Promise<WriterPublicationResult> {
  const client = getOperationalClient();

  /* ---------- 1. VALIDAR MARCA E DOCUMENTO, NA MESMA CONSULTA ---------- */
  const documento = await client.from("content_documents")
    .select("id,marca_id,article_id,article_dna_version_id,payload,content_hash,status")
    .eq("id", input.documentId).eq("marca_id", input.brandId).maybeSingle();
  if (documento.error) mapPersistenceError(documento.error);
  if (!documento.data) {
    throw new WriterPublicationError("writer_publication_document_not_found",
      "Documento não encontrado nesta marca.", 404);
  }

  const parsed = ContentDocumentSchema.safeParse(documento.data.payload);
  if (!parsed.success) {
    throw new WriterPublicationError("writer_publication_document_invalid",
      "O documento gravado não passa no contrato editorial vigente.", 422);
  }
  const document = parsed.data;

  /* ---------- 2. VALIDAR ORIGEM RADAR ---------- */
  /*
   * v1 aqui significaria que alguém reabriu o caminho do Planejador. O erro
   * precisa dizer isso, e não fabricar uma publicação sem origem declarável.
   */
  if (document.schemaVersion !== 2) {
    throw new WriterPublicationError("writer_publication_origin_missing",
      "Somente documento de origem Radar (v2) entra em Publicações. Documento com ContentPlan é caminho histórico.");
  }
  if (!document.radarOrigin?.analysisVersionId || !document.radarOrigin?.evidenceBundleHash) {
    throw new WriterPublicationError("writer_publication_origin_missing",
      "O documento não declara a análise e o pacote de evidências do Radar.");
  }

  /* ---------- 3. VALIDAR PENDÊNCIAS E GATES ---------- */
  /*
   * Pendência BLOQUEANTE do Radar impede entregar como pronto — e continua não
   * impedindo escrever. São eixos diferentes, e foi assim que o gate anterior
   * fechou: quem escreve pode trabalhar com pendência aberta; quem entrega, não.
   */
  const bloqueantes = document.importedContext.pendingDecisions.filter(item => item.blocking);
  if (bloqueantes.length) {
    throw new WriterPublicationError("writer_publication_pending_blocking",
      `Há ${bloqueantes.length} pendência(s) bloqueante(s) do Radar. Resolva antes de enviar a Publicações.`);
  }

  const guardian = runGuardian(document, documento.data.content_hash as string);
  const criticos = guardian.findings.filter(finding => finding.severity === "blocked");
  if (criticos.length) {
    throw new WriterPublicationError("writer_publication_guardian_blocked",
      `O Guardião encontrou ${criticos.length} achado(s) bloqueante(s). A análise não aprova, mas ela impede entregar.`);
  }

  if (document.status !== "aprovado") {
    throw new WriterPublicationError("writer_publication_not_approved",
      "Somente documento aprovado no Redator segue para Publicações.");
  }

  /* ---------- 4. MONTAR O REGISTRO ---------- */
  const artefato = await client.from("editorial_artifact_versions")
    .select("payload").eq("marca_id", input.brandId)
    .eq("version_id", documento.data.article_dna_version_id).maybeSingle();
  if (artefato.error) mapPersistenceError(artefato.error);
  if (!artefato.data) {
    throw new WriterPublicationError("writer_publication_article_missing",
      "A versão do ArticleDNA referida pelo documento não foi encontrada.", 422);
  }
  const article = artefato.data.payload as VersionEnvelope<ArticleDNA>;

  const publication = createWriterPublication({ brandId: input.brandId, document, article }, input.now);

  /* ---------- 5. PERSISTIR ---------- */
  const repositorio = new PublicationRepository();
  const inserido = await repositorio.create(input.brandId, publication, input.actorId);
  /*
   * `create` faz upsert com `ignoreDuplicates`. Linha nula significa que o
   * registro JÁ existia — desfecho legítimo e idempotente, não falha.
   */
  const change: WriterPublicationChange = inserido ? "CREATED" : "ALREADY_SENT";

  /* ---------- 6. RELER DO SERVIDOR ---------- */
  const relido = await repositorio.find(input.brandId, publication.id);
  if (!relido) {
    throw new WriterPublicationError("writer_publication_readback_failed",
      "A publicação foi gravada, mas a leitura de confirmação não a encontrou.", 502);
  }
  if (relido.publication.documentId !== publication.documentId
    || relido.publication.articleId !== publication.articleId
    || relido.publication.brandId !== publication.brandId) {
    throw new WriterPublicationError("writer_publication_readback_mismatch",
      "O registro lido de volta diverge do que foi enviado.", 502);
  }

  /* ---------- 7. SÓ AGORA, SUCESSO ---------- */
  return {
    change,
    publicationId: relido.publication.id,
    documentHash: documento.data.content_hash as string,
    publication: relido.publication,
  };
}
