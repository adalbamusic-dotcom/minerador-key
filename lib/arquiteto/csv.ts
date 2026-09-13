/**
 * CSV do Arquiteto — as primitivas compartilhadas pelos dois contratos.
 *
 * Um único escape, um único delimitador, um único BOM: o backup restaurável e
 * o export editorial têm finalidades opostas, mas não podem discordar sobre o
 * que é uma célula. Domínio puro: sem React, sem rede, sem storage.
 */

export const ARQUITETO_CSV_BOM = "﻿";
/** Excel em PT-BR lê `;` como separador de lista; é o mesmo do CSV do Minerador. */
export const ARQUITETO_CSV_DELIMITER = ";";
export const ARQUITETO_CSV_LINE_BREAK = "\r\n";
export const ARQUITETO_CSV_LIST_SEPARATOR = " | ";
export const ARQUITETO_CSV_MIME_TYPE = "text/csv;charset=utf-8";

export type ArquitetoCsvRow = readonly unknown[];

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (Array.isArray(value)) return value.map(scalarText).filter(item => item !== "").join(ARQUITETO_CSV_LIST_SEPARATOR);
  // Objeto nunca vira "[object Object]": ou é serializado de forma legível, ou
  // a coluna deveria ter sido projetada antes de chegar aqui.
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** Texto de uma célula antes do escape: escalares, listas estáveis e JSON. */
export function csvCellText(value: unknown): string {
  return scalarText(value);
}

/** Escapa aspas, delimitador, vírgula e quebras de linha conforme RFC 4180. */
export function csvCell(value: unknown): string {
  const text = csvCellText(value);
  if (text === "") return "";
  const needsQuotes = /["\n\r;,]/.test(text) || text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function buildCsv(header: readonly string[], rows: readonly ArquitetoCsvRow[], options: { bom?: boolean } = {}): string {
  const lines = [header.map(csvCell).join(ARQUITETO_CSV_DELIMITER), ...rows.map(row => row.map(csvCell).join(ARQUITETO_CSV_DELIMITER))];
  const prefix = options.bom === false ? "" : ARQUITETO_CSV_BOM;
  return `${prefix}${lines.join(ARQUITETO_CSV_LINE_BREAK)}${ARQUITETO_CSV_LINE_BREAK}`;
}

/** Leitor completo: o importador do backup depende dele, não só os testes. */
export function parseCsv(content: string): string[][] {
  const source = content.startsWith(ARQUITETO_CSV_BOM) ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === "\"") {
        if (source[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === "\"") { quoted = true; continue; }
    if (char === ARQUITETO_CSV_DELIMITER) { row.push(cell); cell = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function slugifyForFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "brand";
}

/** Carimbo local de quem exporta; o arquivo é lido por uma pessoa, não por UTC. */
export function fileNameTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
