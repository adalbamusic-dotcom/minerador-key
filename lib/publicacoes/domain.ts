import { PublicationHistoryEntrySchema, OperationalPublicationSchema, type OperationalPublication, type PublicationHistoryEntry } from "../editorial/operational-flow.ts";
import type { PublicationActionRequest } from "./contracts.ts";

export class PublicationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicationDomainError";
  }
}

function historyId(publicationId: string, now: string) {
  return `publication-event:${publicationId}:${now}:${crypto.randomUUID()}`;
}

function appendHistory(
  publication: OperationalPublication,
  action: "queued" | "exported" | "published" | "update_requested" | "reedited",
  actorId: string,
  now: string,
  patch: Partial<PublicationHistoryEntry> = {},
) {
  const entry = PublicationHistoryEntrySchema.parse({
    id: historyId(publication.id, now), action, actorId, occurredAt: now,
    fromState: publication.state, toState: publication.state, ...patch,
  });
  return [...publication.history, entry];
}

function ensureIdentity(publication: OperationalPublication, input: PublicationActionRequest) {
  if (publication.brandId !== input.brandId || publication.id !== input.publicationId) {
    throw new PublicationDomainError("Publicação não pertence à marca selecionada.");
  }
  if (publication.lockVersion !== input.expectedLockVersion) {
    throw new PublicationDomainError("A publicação foi alterada em outra sessão. Atualize os dados antes de tentar novamente.");
  }
}

export function applyPublicationAction(
  rawPublication: OperationalPublication,
  input: PublicationActionRequest,
  actorId: string,
  now = new Date().toISOString(),
) {
  const publication = OperationalPublicationSchema.parse(rawPublication);
  ensureIdentity(publication, input);
  let next = { ...publication, updatedAt: now, responsible: publication.responsible || actorId };

  if (input.action === "queue") {
    if (publication.state === "queued") return publication;
    if (publication.state !== "ready_to_export") throw new PublicationDomainError("Somente uma publicação pronta para exportar pode entrar na fila.");
    next = { ...next, state: "queued", history: appendHistory(publication, "queued", actorId, now, { toState: "queued" }) };
  }

  if (input.action === "record_export") {
    const updateExport = publication.state === "published" && publication.updateRequested;
    if (!updateExport && !["queued", "ready_to_export", "exported"].includes(publication.state)) {
      throw new PublicationDomainError("A publicação precisa estar na fila antes da exportação.");
    }
    const history = appendHistory(publication, "exported", actorId, now, {
      exportFileName: input.exportFileName, exportFormat: input.exportFormat,
      toState: updateExport ? "published" : "exported",
    });
    next = { ...next, state: updateExport ? "published" : "exported", lastExportedAt: now, lastExportFileName: input.exportFileName,
      lastExportFormat: input.exportFormat, lastExportDocumentHash: input.documentHash, history };
  }

  if (input.action === "publish") {
    const updatePublish = publication.state === "published" && publication.updateRequested;
    if (!updatePublish && publication.state !== "exported") throw new PublicationDomainError("Exporte o arquivo antes de registrar a publicação manual.");
    if (updatePublish && publication.destinationUrl !== input.destinationUrl) throw new PublicationDomainError("A URL estrutural publicada não pode ser trocada neste fluxo.");
    const history = appendHistory(publication, "published", actorId, now, { destinationUrl: input.destinationUrl, toState: "published" });
    next = { ...next, state: "published", destination: input.destination, destinationUrl: input.destinationUrl, publishedAt: now,
      publishedDocumentHash: input.documentHash || publication.lastExportDocumentHash || publication.publishedDocumentHash,
      updateRequested: false, updateRequestedAt: null, history };
  }

  if (input.action === "request_update") {
    if (publication.state !== "published") throw new PublicationDomainError("Somente conteúdo publicado pode receber pedido de atualização.");
    if (publication.updateRequested) return publication;
    next = { ...next, updateRequested: true, updateRequestedAt: now,
      history: appendHistory(publication, "update_requested", actorId, now, { note: input.note || null }) };
  }

  if (input.action === "reedit") {
    if (publication.state !== "published") throw new PublicationDomainError("Somente conteúdo publicado pode ser reeditado.");
    next = { ...next, updateRequested: true, updateRequestedAt: publication.updateRequestedAt || now,
      history: appendHistory(publication, "reedited", actorId, now, { note: input.note || null }) };
  }

  return OperationalPublicationSchema.parse({ ...next, lockVersion: publication.lockVersion + 1 });
}
