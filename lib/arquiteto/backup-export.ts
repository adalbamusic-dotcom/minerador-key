/**
 * BACKUP_RESTORABLE_V1 — a coleta.
 *
 * Transforma os artefatos canônicos carregados pela mesa em registros de
 * backup, cada um com o envelope inteiro em `payload_json`. A identidade de
 * cada linha é a identidade do ARTEFATO (siloId, articleId, graphId), não o
 * UUID da linha do banco: é isso que permite religar referências na
 * restauração em vez de despejar ids antigos.
 *
 * Domínio puro: sem React, sem rede, sem storage.
 */

import {
  BACKUP_CONTRACT_ID,
  BACKUP_EXPORT_TYPE,
  BACKUP_SCHEMA_VERSION,
  serializeBackup,
  type BackupFile,
  type BackupRecord,
  type BackupRecordType,
} from "./backup-contract.ts";
import { ARQUITETO_CSV_MIME_TYPE, fileNameTimestamp, slugifyForFileName } from "./csv.ts";
import { ArquitetoExportError, graphFacts, type ArquitetoExportInput } from "./export-source.ts";

export type ArquitetoBackupArtifact = {
  contract: typeof BACKUP_CONTRACT_ID;
  fileName: string;
  mimeType: string;
  content: string;
  recordCount: number;
  countsByType: Record<string, number>;
  summary: string;
};

function record(
  recordType: BackupRecordType,
  recordKey: string,
  recordVersion: number | null,
  status: string,
  contentHash: string,
  parentRef: string,
  payload: Record<string, unknown>,
): BackupRecord {
  return { recordType, recordKey, recordVersion, status, contentHash, parentRef, payload };
}

export function backupFileName(brandLabel: string | null | undefined, now: Date): string {
  return `arquiteto-backup-${slugifyForFileName(brandLabel?.trim() || "brand")}-${fileNameTimestamp(now)}.csv`;
}

/** Monta o conjunto de registros do backup a partir dos read-models canônicos. */
export function buildArquitetoBackupFile(input: ArquitetoExportInput): BackupFile {
  const versionStatusOf = input.versionStatusOf ?? (() => null);
  const workflowStatusOf = input.workflowStatusOf ?? (() => null);
  const records: BackupRecord[] = [];

  // O território vem primeiro porque tudo o que aponta para ele depende do
  // identificador que o servidor vai emitir na restauração.
  for (const item of input.territories || []) {
    records.push(record("TERRITORY", item.territoryRef, null, "", "", "", item.territory));
  }
  for (const item of input.siloWorkingCopies || []) {
    records.push(record("SILO_WORKING_COPY", item.workingCopyRef, null, "", "", item.workingCopy.territoryRef ? String(item.workingCopy.territoryRef) : "", item.workingCopy));
  }

  for (const silo of input.silos) {
    const dna = silo.siloDna;
    records.push(record("SILO_DNA", dna.payload.siloId, dna.versionNumber, versionStatusOf(dna.versionId) ?? "proposed", dna.contentHash, dna.previousVersionId ?? "", dna as unknown as Record<string, unknown>));
  }

  for (const version of input.articles) {
    records.push(record("ARTICLE_DNA", version.payload.articleId, version.versionNumber, versionStatusOf(version.versionId) ?? "proposed", version.contentHash, version.previousVersionId ?? "", version as unknown as Record<string, unknown>));
  }

  // A SiloPage vem depois do ArticleDNA porque referencia Pilar e Suportes; a
  // ordem do arquivo é a ordem em que a restauração consegue religar.
  for (const silo of input.silos) {
    if (!silo.siloPage) continue;
    const page = silo.siloPage;
    records.push(record("SILO_PAGE", page.payload.siloPageId, page.versionNumber, versionStatusOf(page.versionId) ?? "proposed", page.contentHash, page.payload.siloId, page as unknown as Record<string, unknown>));
  }

  for (const review of input.aiReviews || []) {
    const articleId = typeof (review.payload as { articleId?: unknown }).articleId === "string" ? String((review.payload as { articleId: string }).articleId) : review.entityId;
    records.push(record("ARTICLE_AI_REVIEW", articleId, review.versionNumber, versionStatusOf(review.versionId) ?? "proposed", review.contentHash, review.previousVersionId ?? "", review as unknown as Record<string, unknown>));
  }

  for (const silo of input.silos) {
    // A working copy e a versão aprovada são artefatos DIFERENTES e os dois
    // entram: guardar só a autoridade corrente perderia a edição em curso ou
    // a última aprovação, dependendo do estado do Silo no dia do backup.
    if (silo.graph?.source === "working_copy") {
      const facts = graphFacts(silo.graph);
      records.push(record("INTERNAL_LINK_GRAPH_WORKING_COPY", facts.graphId, Number(facts.version), "working_copy", facts.hash, facts.previous, silo.graph.graph as unknown as Record<string, unknown>));
    }
    const approved = silo.approvedGraph
      || (silo.graph?.source === "approved" && "graphVersionId" in silo.graph.graph ? silo.graph.graph : null);
    if (approved) {
      records.push(record("INTERNAL_LINK_GRAPH", approved.graphId, approved.versionNumber, approved.workflowStatus, approved.contentHash, approved.previousVersionId ?? "", approved as unknown as Record<string, unknown>));
    }
  }

  for (const item of input.keywordAssignments || []) {
    records.push(record("KEYWORD_ASSIGNMENT", item.keywordId, null, "", "", "", item.payload));
  }
  for (const item of input.territorialSerp || []) {
    records.push(record("TERRITORIAL_SERP", item.questionId, null, "", "", "", item.payload));
  }
  for (const item of input.articleFormationSerp || []) {
    records.push(record("ARTICLE_FORMATION_SERP", item.candidateRef, null, "", "", item.payload.territoryRef ? String(item.payload.territoryRef) : "", item.payload));
  }
  for (const item of input.territorialAi || []) {
    records.push(record("TERRITORIAL_AI", item.questionId, null, "", "", "", item.payload));
  }
  if (input.architectureMarker) records.push(record("ARCHITECTURE_MARKER", "architecture", null, "", "", "", input.architectureMarker));
  if (input.articleFormationMarker) records.push(record("ARTICLE_FORMATION_MARKER", "article-formation", null, "", "", "", input.articleFormationMarker));

  // O status operacional fecha a lista: ele depende do ArticleDNA aprovado que
  // as linhas acima acabaram de recriar.
  for (const version of input.articles) {
    const status = workflowStatusOf(version.payload.articleId);
    if (!status) continue;
    records.push(record("WORKFLOW_STATUS", version.payload.articleId, null, status, "", version.payload.articleId, { articleId: version.payload.articleId, status, brandId: input.brandId }));
  }

  const now = input.now ?? new Date();
  return {
    header: {
      exportType: BACKUP_EXPORT_TYPE,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      contract: BACKUP_CONTRACT_ID,
      brandId: input.brandId,
      brandLabel: input.brandLabel?.trim() || "",
      exportedAt: now.toISOString(),
      recordCount: records.length,
      recordTypes: [...new Set(records.map(item => item.recordType))],
    },
    records,
  };
}

export function buildArquitetoBackup(input: ArquitetoExportInput): ArquitetoBackupArtifact {
  const file = buildArquitetoBackupFile(input);
  if (file.records.length === 0) {
    throw new ArquitetoExportError("EMPTY_BACKUP", "Nenhum artefato canônico do Arquiteto foi carregado para esta Marca.");
  }
  const countsByType = file.records.reduce<Record<string, number>>((totals, item) => {
    totals[item.recordType] = (totals[item.recordType] || 0) + 1;
    return totals;
  }, {});
  const parts = Object.entries(countsByType).map(([type, count]) => `${count} ${type}`);
  return {
    contract: BACKUP_CONTRACT_ID,
    fileName: backupFileName(input.brandLabel, input.now ?? new Date()),
    mimeType: ARQUITETO_CSV_MIME_TYPE,
    content: serializeBackup(file),
    recordCount: file.records.length,
    countsByType,
    summary: `Backup exportado: ${file.records.length} registro(s) · ${parts.join(" · ")}.`,
  };
}
