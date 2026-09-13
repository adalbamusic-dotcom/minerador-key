/**
 * BACKUP_RESTORABLE_V1 — a representação canônica, versionada e importável.
 *
 * Um backup restaurável não é uma planilha bonita: é o conjunto de artefatos
 * REAIS do Arquiteto, cada linha com o payload canônico inteiro em
 * `payload_json`. Achatá-los em 150 colunas perderia informação e inventaria
 * um segundo contrato ao lado do que o banco já guarda.
 *
 * O arquivo se declara: `minekey_export_type = ARQUITETO_BACKUP` e
 * `schema_version = 1`. O importador só aceita arquivos que se declaram assim,
 * e por isso o export editorial (EDITORIAL_EXPORT_V1) é deliberadamente
 * one-way — um CSV editorial editado no Excel nunca vira estado canônico.
 *
 * Domínio puro: sem React, sem rede, sem storage. Quem grava é o restaurador,
 * pelos caminhos canônicos já existentes.
 */

import {
  ARQUITETO_CSV_DELIMITER,
  buildCsv,
  csvCell,
  parseCsv,
  type ArquitetoCsvRow,
} from "./csv.ts";

export const BACKUP_EXPORT_TYPE = "ARQUITETO_BACKUP";
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_CONTRACT_ID = "BACKUP_RESTORABLE_V1";

/**
 * Os artefatos que pertencem ao Arquiteto.
 *
 * A lista é a mesma auditada no reset de homologação: quatro `artifact_type`
 * em `editorial_artifact_versions`, os grafos de links e o estado de trabalho
 * em `editorial_workflow_items` com `stage = 'architect'`.
 */
export const BACKUP_RECORD_TYPES = [
  "TERRITORY",
  "SILO_WORKING_COPY",
  "SILO_DNA",
  "SILO_PAGE",
  "ARTICLE_DNA",
  "ARTICLE_AI_REVIEW",
  "INTERNAL_LINK_GRAPH",
  "INTERNAL_LINK_GRAPH_WORKING_COPY",
  "WORKFLOW_STATUS",
  "KEYWORD_ASSIGNMENT",
  "TERRITORIAL_SERP",
  "ARTICLE_FORMATION_SERP",
  "TERRITORIAL_AI",
  "ARCHITECTURE_MARKER",
  "ARTICLE_FORMATION_MARKER",
] as const;
export type BackupRecordType = (typeof BACKUP_RECORD_TYPES)[number];

/**
 * Cada tipo tem um writer canônico próprio — a auditoria inicial subestimou
 * isso: `lib/server/arquiteto-*-store.ts` já expõe autoridade tipada para
 * território, working copy de Silo, pareceres de SERP, proposta de IA e
 * marcadores. A restauração REUTILIZA esses writers; ela não faz INSERT
 * genérico em tabela para "fazer funcionar".
 */
export const BACKUP_RESTORE_CAPABILITY: Record<BackupRecordType, "canonical"> = {
  TERRITORY: "canonical",
  SILO_WORKING_COPY: "canonical",
  SILO_DNA: "canonical",
  SILO_PAGE: "canonical",
  ARTICLE_DNA: "canonical",
  ARTICLE_AI_REVIEW: "canonical",
  INTERNAL_LINK_GRAPH: "canonical",
  INTERNAL_LINK_GRAPH_WORKING_COPY: "canonical",
  WORKFLOW_STATUS: "canonical",
  KEYWORD_ASSIGNMENT: "canonical",
  TERRITORIAL_SERP: "canonical",
  ARTICLE_FORMATION_SERP: "canonical",
  TERRITORIAL_AI: "canonical",
  ARCHITECTURE_MARKER: "canonical",
  ARTICLE_FORMATION_MARKER: "canonical",
};

/**
 * Ordem de restauração: uma referência só é religada depois de existir.
 *
 * Território vem primeiro porque o servidor EMITE um `territoryRef` novo na
 * criação — ele nunca aceita o do cliente. Todo o resto que aponta para o
 * território precisa ser remapeado depois, e por isso não pode entrar antes.
 */
export const BACKUP_RESTORE_ORDER: BackupRecordType[] = [
  "TERRITORY",
  "SILO_WORKING_COPY",
  "SILO_DNA",
  "ARTICLE_DNA",
  "SILO_PAGE",
  "ARTICLE_AI_REVIEW",
  "KEYWORD_ASSIGNMENT",
  "TERRITORIAL_SERP",
  "ARTICLE_FORMATION_SERP",
  "TERRITORIAL_AI",
  "ARCHITECTURE_MARKER",
  "ARTICLE_FORMATION_MARKER",
  "INTERNAL_LINK_GRAPH_WORKING_COPY",
  "INTERNAL_LINK_GRAPH",
  "WORKFLOW_STATUS",
];

/**
 * Tipos cuja identidade é EMITIDA pelo servidor na restauração. Eles nunca
 * são recriados com o identificador do backup: a identidade nova entra no mapa
 * e todas as referências são religadas por ele.
 */
export const BACKUP_SERVER_EMITTED_IDENTITY: BackupRecordType[] = ["TERRITORY", "SILO_WORKING_COPY"];

export const BACKUP_COLUMNS = [
  "record_type",
  "record_key",
  "record_version",
  "status",
  "content_hash",
  "parent_ref",
  "payload_json",
] as const;

export type BackupRecord = {
  recordType: BackupRecordType;
  /** Identidade estável do artefato dentro da Brand. Nunca um UUID de linha. */
  recordKey: string;
  /** Número da versão, ou `null` para artefato sem versionamento próprio. */
  recordVersion: number | null;
  status: string;
  contentHash: string;
  /** Antecessor direto: versão anterior, grafo base ou entidade dona. */
  parentRef: string;
  payload: Record<string, unknown>;
};

export type BackupHeader = {
  exportType: string;
  schemaVersion: number;
  contract: string;
  brandId: string;
  brandLabel: string;
  exportedAt: string;
  recordCount: number;
  /** Tipos que este arquivo carrega, para o preview não adivinhar. */
  recordTypes: BackupRecordType[];
};

export type BackupFile = {
  header: BackupHeader;
  records: BackupRecord[];
};

export class BackupContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BackupContractError";
    this.code = code;
  }
}

/* ------------------------------- escrita --------------------------------- */

function metadataLine(key: string, value: unknown) {
  return `${csvCell(key)}${ARQUITETO_CSV_DELIMITER}${csvCell(value)}`;
}

/**
 * Serializa o backup. O cabeçalho de metadados vem antes das colunas para que
 * o importador possa recusar o arquivo lendo as primeiras linhas, sem ter de
 * confiar no nome nem carregar o conteúdo inteiro.
 */
export function serializeBackup(file: BackupFile): string {
  const header = [
    metadataLine("minekey_export_type", file.header.exportType),
    metadataLine("schema_version", file.header.schemaVersion),
    metadataLine("contract", file.header.contract),
    metadataLine("brand_id", file.header.brandId),
    metadataLine("brand", file.header.brandLabel),
    metadataLine("exported_at", file.header.exportedAt),
    metadataLine("record_count", file.header.recordCount),
    metadataLine("record_types", file.header.recordTypes.join(",")),
    "",
  ].join("\r\n");
  const rows: ArquitetoCsvRow[] = file.records.map(record => [
    record.recordType,
    record.recordKey,
    record.recordVersion ?? "",
    record.status,
    record.contentHash,
    record.parentRef,
    JSON.stringify(record.payload),
  ]);
  // O BOM pertence ao início do arquivo; o bloco de metadados vem antes da
  // tabela, então ele é montado aqui e a tabela entra sem um segundo BOM.
  const table = buildCsv([...BACKUP_COLUMNS], rows, { bom: false });
  return `﻿${header}\r\n${table}`;
}

/* -------------------------------- leitura -------------------------------- */

function readMetadata(lines: string[][]): { header: Partial<BackupHeader>; tableStart: number } {
  const header: Partial<BackupHeader> = {};
  let index = 0;
  for (; index < lines.length; index += 1) {
    const [key, value] = lines[index];
    if (!key || key.trim() === "") { index += 1; break; }
    if (key === "record_type") break;
    const text = (value ?? "").trim();
    if (key === "minekey_export_type") header.exportType = text;
    if (key === "schema_version") header.schemaVersion = Number(text);
    if (key === "contract") header.contract = text;
    if (key === "brand_id") header.brandId = text;
    if (key === "brand") header.brandLabel = text;
    if (key === "exported_at") header.exportedAt = text;
    if (key === "record_count") header.recordCount = Number(text);
    if (key === "record_types") {
      header.recordTypes = text.split(",").map(item => item.trim()).filter((item): item is BackupRecordType => (BACKUP_RECORD_TYPES as readonly string[]).includes(item));
    }
  }
  return { header, tableStart: index };
}

/**
 * Lê o arquivo e recusa qualquer coisa que não se declare
 * `ARQUITETO_BACKUP` na versão suportada. Esta é a fronteira que impede um
 * CSV editorial de virar estado canônico.
 */
export function parseBackup(content: string): BackupFile {
  const lines = parseCsv(content);
  if (!lines.length) throw new BackupContractError("EMPTY_FILE", "O arquivo está vazio.");
  const { header, tableStart } = readMetadata(lines);

  if (header.exportType !== BACKUP_EXPORT_TYPE) {
    throw new BackupContractError(
      "NOT_A_BACKUP",
      `Este arquivo não é um backup do Arquiteto. Esperado minekey_export_type = ${BACKUP_EXPORT_TYPE}${header.exportType ? `, recebido ${header.exportType}` : " e o cabeçalho não o declara"}.`,
    );
  }
  if (header.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new BackupContractError(
      "UNSUPPORTED_SCHEMA_VERSION",
      `Versão de formato não suportada: esperado schema_version = ${BACKUP_SCHEMA_VERSION}, recebido ${header.schemaVersion ?? "ausente"}.`,
    );
  }
  if (!header.brandId) throw new BackupContractError("MISSING_BRAND", "O backup não declara a Brand de origem.");

  const columns = lines[tableStart];
  if (!columns || columns[0] !== "record_type") {
    throw new BackupContractError("MISSING_TABLE_HEADER", "O backup não possui a linha de colunas esperada.");
  }
  const columnIndex = new Map(columns.map((name, index) => [name, index]));
  for (const required of BACKUP_COLUMNS) {
    if (!columnIndex.has(required)) throw new BackupContractError("MISSING_COLUMN", `O backup não possui a coluna obrigatória ${required}.`);
  }

  const records: BackupRecord[] = [];
  for (let index = tableStart + 1; index < lines.length; index += 1) {
    const row = lines[index];
    if (!row.length || row.every(cell => cell === "")) continue;
    const cell = (name: (typeof BACKUP_COLUMNS)[number]) => row[columnIndex.get(name) ?? -1] ?? "";
    const recordType = cell("record_type");
    if (!(BACKUP_RECORD_TYPES as readonly string[]).includes(recordType)) {
      throw new BackupContractError("UNKNOWN_RECORD_TYPE", `Linha ${index + 1}: tipo de registro desconhecido "${recordType}".`);
    }
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(cell("payload_json"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload não é objeto");
      payload = parsed as Record<string, unknown>;
    } catch {
      throw new BackupContractError("INVALID_PAYLOAD", `Linha ${index + 1}: payload_json inválido para ${recordType}.`);
    }
    const versionText = cell("record_version");
    records.push({
      recordType: recordType as BackupRecordType,
      recordKey: cell("record_key"),
      recordVersion: versionText === "" ? null : Number(versionText),
      status: cell("status"),
      contentHash: cell("content_hash"),
      parentRef: cell("parent_ref"),
      payload,
    });
  }

  return {
    header: {
      exportType: header.exportType,
      schemaVersion: header.schemaVersion,
      contract: header.contract || BACKUP_CONTRACT_ID,
      brandId: header.brandId,
      brandLabel: header.brandLabel || "",
      exportedAt: header.exportedAt || "",
      recordCount: header.recordCount ?? records.length,
      recordTypes: header.recordTypes || [...new Set(records.map(record => record.recordType))],
    },
    records,
  };
}

/* ------------------------------ integridade ------------------------------ */

export type BackupIntegrityIssue = {
  severity: "error" | "warning";
  code: string;
  recordType: BackupRecordType | null;
  recordKey: string | null;
  detail: string;
};

/**
 * Confere o que o arquivo promete contra o que ele carrega: contagem,
 * duplicidade de identidade, Brand do payload e referências entre artefatos.
 * Nenhuma escrita acontece antes disto passar.
 */
export function validateBackupIntegrity(file: BackupFile): BackupIntegrityIssue[] {
  const issues: BackupIntegrityIssue[] = [];
  const add = (severity: BackupIntegrityIssue["severity"], code: string, recordType: BackupRecordType | null, recordKey: string | null, detail: string) =>
    issues.push({ severity, code, recordType, recordKey, detail });

  if (file.header.recordCount !== file.records.length) {
    add("warning", "RECORD_COUNT_MISMATCH", null, null, `O cabeçalho declara ${file.header.recordCount} registro(s) e o arquivo traz ${file.records.length}.`);
  }

  const seen = new Set<string>();
  const siloIds = new Set<string>();
  const articleIds = new Set<string>();
  for (const record of file.records) {
    const identity = `${record.recordType} ${record.recordKey} ${record.recordVersion ?? ""}`;
    if (seen.has(identity)) {
      add("error", "DUPLICATE_RECORD", record.recordType, record.recordKey, "O mesmo artefato aparece duas vezes na mesma versão.");
    }
    seen.add(identity);
    if (!record.recordKey.trim()) {
      add("error", "MISSING_RECORD_KEY", record.recordType, null, "Registro sem identidade não pode ser restaurado.");
    }
    const payloadBrand = readPayloadBrandId(record);
    if (payloadBrand && payloadBrand !== file.header.brandId) {
      add("error", "BRAND_MISMATCH", record.recordType, record.recordKey, `O payload pertence à Brand ${payloadBrand}, diferente da Brand do backup.`);
    }
    if (record.recordType === "SILO_DNA") siloIds.add(record.recordKey);
    if (record.recordType === "ARTICLE_DNA") articleIds.add(record.recordKey);
  }

  // Referências: SiloPage sem SiloDNA e grafo sem Silo não têm como religar.
  for (const record of file.records) {
    if (record.recordType === "SILO_PAGE") {
      const siloId = readString(record.payload, ["payload", "siloId"]);
      if (siloId && !siloIds.has(siloId)) {
        add("error", "MISSING_SILO_DNA", record.recordType, record.recordKey, `A SiloPage referencia o Silo ${siloId}, ausente no backup.`);
      }
    }
    if (record.recordType === "INTERNAL_LINK_GRAPH" || record.recordType === "INTERNAL_LINK_GRAPH_WORKING_COPY") {
      const siloId = readString(record.payload, ["siloId"]);
      if (siloId && !siloIds.has(siloId)) {
        add("error", "MISSING_SILO_DNA", record.recordType, record.recordKey, `O grafo referencia o Silo ${siloId}, ausente no backup.`);
      }
      for (const articleId of graphArticleIds(record.payload)) {
        if (!articleIds.has(articleId)) {
          add("warning", "MISSING_ARTICLE_DNA", record.recordType, record.recordKey, `O grafo aponta para o Article ${articleId}, ausente no backup.`);
        }
      }
    }
    if (record.recordType === "WORKFLOW_STATUS" && !articleIds.has(record.recordKey)) {
      add("warning", "MISSING_ARTICLE_DNA", record.recordType, record.recordKey, "O status operacional refere um Article ausente no backup.");
    }
  }

  return issues;
}

function readString(source: Record<string, unknown>, path: string[]): string | null {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function readPayloadBrandId(record: BackupRecord): string | null {
  return readString(record.payload, ["payload", "brandId"]) || readString(record.payload, ["brandId"]);
}

function graphArticleIds(payload: Record<string, unknown>): string[] {
  const nodes = payload.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map(node => (node && typeof node === "object" && !Array.isArray(node) ? readString(node as Record<string, unknown>, ["articleDnaVersionRef", "entityId"]) : null))
    .filter((value): value is string => Boolean(value));
}
