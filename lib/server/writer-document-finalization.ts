import "server-only";

import type { ContentDocument } from "../arquiteto/contracts.ts";
import { contentHash as hashContentDocument } from "../arquiteto/versioning.ts";
import { documentStatusColumn, ContentDocumentRepository, PublicationRepository } from "./editorial-repositories.ts";
import { finalizeArticleVersion, reuseFinalizedArticleVersion } from "./article-finalization.ts";
import { OptimisticLockError } from "./editorial-db.ts";
import { runGuardian } from "../redator/guardian.ts";

export type WriterDocumentFinalizationAssessment = {
  document: ContentDocument;
  contentHash: string;
  guardian: ReturnType<typeof runGuardian>;
  blockers: Array<{ code: string; message: string }>;
};

/** Shared approval gate used by the Redator route and the MCP preview. */
export function assessWriterDocumentFinalization(input: {
  document: ContentDocument;
  contentHash: string;
}): WriterDocumentFinalizationAssessment {
  const guardian = runGuardian(input.document, input.contentHash);
  return {
    ...input,
    guardian,
    blockers: guardian.findings.filter(finding => finding.severity === "blocked").map(finding => ({
      code: finding.category,
      message: finding.message,
    })),
  };
}

/**
 * Shared write path for the Redator UI and MCP. It preserves the same lock,
 * version, readback, retention, and PublicationRecord status synchronization.
 */
export async function saveAndFinalizeWriterDocument(input: {
  brandId: string;
  documentId: string;
  expectedLockVersion: number;
  document: ContentDocument;
  contentHash: string;
  createVersion: boolean;
  changeReason: string;
  actorId: string;
}) {
  if (input.document.id !== input.documentId) throw new Error("O identificador do documento não coincide com o documento enviado.");
  if (input.document.status === "aprovado") {
    const assessment = assessWriterDocumentFinalization({ document: input.document, contentHash: input.contentHash });
    if (assessment.blockers.length) throw new Error(`Documento bloqueado pelo Guardião: ${assessment.blockers.length} achado(s) crítico(s).`);
  }

  const targetStatus = documentStatusColumn(input.document.status);
  if (input.createVersion) {
    const alreadyFinalized = await reuseFinalizedArticleVersion({
      brandId: input.brandId, documentId: input.documentId,
      contentHash: input.contentHash, targetStatusColumn: targetStatus,
    });
    if (alreadyFinalized) return {
      lockVersion: alreadyFinalized.lockVersion,
      updatedAt: alreadyFinalized.updatedAt,
      contentHash: input.contentHash,
      version: { ...alreadyFinalized, updatedAt: undefined },
    };
  }

  const repository = new ContentDocumentRepository();
  let saved;
  try {
    saved = await repository.save(input.documentId, input.expectedLockVersion, input.document, input.contentHash, input.actorId, input.brandId);
  } catch (error) {
    if (input.createVersion && error instanceof OptimisticLockError) {
      const alreadyFinalized = await reuseFinalizedArticleVersion({
        brandId: input.brandId, documentId: input.documentId,
        contentHash: input.contentHash, targetStatusColumn: targetStatus,
      });
      if (alreadyFinalized) return {
        lockVersion: alreadyFinalized.lockVersion,
        updatedAt: alreadyFinalized.updatedAt,
        contentHash: input.contentHash,
        version: { ...alreadyFinalized, updatedAt: undefined },
      };
    }
    throw error;
  }

  const version = input.createVersion
    ? await finalizeArticleVersion({
      brandId: input.brandId, documentId: input.documentId, document: input.document,
      contentHash: input.contentHash, changeReason: input.changeReason, actorId: input.actorId,
      expectedStatusColumn: saved.status as string,
    })
    : null;
  await new PublicationRepository().syncDocumentStatus(input.documentId, input.document.status, input.actorId);
  return {
    lockVersion: version?.lockVersion ?? saved.lock_version,
    updatedAt: saved.updated_at,
    contentHash: saved.content_hash,
    version,
  };
}

export async function makeApprovedWriterDocument(document: ContentDocument) {
  const next = { ...document, status: "aprovado" as const };
  const contentHash = await hashContentDocument(next);
  return { document: next, contentHash, assessment: assessWriterDocumentFinalization({ document: next, contentHash }) };
}
