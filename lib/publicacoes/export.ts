import type { ContentDocument } from "../arquiteto/contracts.ts";
import { contentHash } from "../arquiteto/versioning.ts";
import type { OperationalPublication } from "../editorial/operational-flow.ts";
import type { PublicationExportFormat } from "./contracts.ts";

export interface PublicationExportArtifact {
  fileName: string;
  mimeType: string;
  content: string;
  documentHash: string;
}

function safeFileName(value: string) {
  return (value || "publicacao").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "publicacao";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function blockMarkdown(block: ContentDocument["blocks"][number]) {
  switch (block.type) {
    case "heading": return `${"#".repeat(block.level)} ${block.text}`;
    case "paragraph": return block.text;
    case "list": return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
    case "table": return [block.headers, ...block.rows].map(row => `| ${row.join(" | ")} |`).join("\n");
    case "quote": return `> ${block.text}`;
    case "internal_link": return `[${block.anchor}](#${block.targetArticleId})`;
    case "external_source": return `${block.claim}${block.url ? ` (${block.url})` : ""}`;
    case "CTA": return `> CTA: ${block.text}`;
    case "image_brief": return `> Imagem: ${block.objective} (${block.format})`;
    case "note": return `> Nota: ${block.text}`;
    case "source": return `Fonte: ${block.note}`;
    case "product_block": return `### ${block.title}\n\n${block.summary}`;
    case "comparison": return [`### ${block.title}`, block.columns.join(" | "), ...block.rows.map(row => row.join(" | "))].join("\n");
  }
}

function markdown(publication: OperationalPublication, document: ContentDocument) {
  const metadata = [
    ["title", publication.title], ["slug", publication.slug], ["unit_type", publication.unitType],
    ["destination", publication.destination], ["published_url", publication.destinationUrl],
  ].map(([key, value]) => `${key}: ${JSON.stringify(value ?? "")}`).join("\n");
  return `---\n${metadata}\n---\n\n${document.blocks.map(blockMarkdown).join("\n\n")}\n`;
}

export async function createPublicationExport(publication: OperationalPublication, document: ContentDocument, format: PublicationExportFormat): Promise<PublicationExportArtifact> {
  const documentHash = await contentHash(document);
  if (format === "json") return { fileName: `${safeFileName(publication.slug)}.json`, mimeType: "application/json;charset=utf-8", content: JSON.stringify({ publication, document, documentHash }, null, 2), documentHash };
  if (format === "csv") {
    const header = ["id", "title", "slug", "unitType", "destination", "destinationUrl", "state", "documentHash"].join(",");
    const row = [publication.id, publication.title, publication.slug, publication.unitType, publication.destination, publication.destinationUrl, publication.state, documentHash].map(csvCell).join(",");
    return { fileName: `${safeFileName(publication.slug)}.csv`, mimeType: "text/csv;charset=utf-8", content: `${header}\n${row}\n`, documentHash };
  }
  return { fileName: `${safeFileName(publication.slug)}.md`, mimeType: "text/markdown;charset=utf-8", content: markdown(publication, document), documentHash };
}

export function createPublicationsCsv(publications: OperationalPublication[]) {
  const header = ["id", "title", "slug", "unitType", "state", "destination", "destinationUrl", "lastExportedAt", "updateRequested"].join(",");
  const rows = publications.map(publication => [publication.id, publication.title, publication.slug, publication.unitType, publication.state, publication.destination, publication.destinationUrl, publication.lastExportedAt, publication.updateRequested].map(csvCell).join(","));
  return `${header}\n${rows.join("\n")}\n`;
}

