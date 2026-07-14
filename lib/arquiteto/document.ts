import type { JSONContent } from "@tiptap/core";
import { ContentDocumentSchema, type ContentDocument } from "./contracts.ts";

const textNode = (text: string): JSONContent => ({ type: "text", text });
const paragraph = (text: string, blockId?: string): JSONContent => ({ type: "paragraph", attrs: blockId ? { blockId } : undefined, content: text ? [textNode(text)] : [] });
const editorialBlock = (blockId: string, kind: string, label: string, data: object): JSONContent => ({ type: "editorialBlock", attrs: { blockId, kind, label, data: JSON.stringify(data) } });

export function contentDocumentToTiptapSeed(input: unknown): JSONContent {
  const document = ContentDocumentSchema.parse(input);
  if (document.editorContent) return document.editorContent as JSONContent;
  const content = document.blocks.map<JSONContent>(block => {
    switch (block.type) {
      case "heading": return { type: "heading", attrs: { level: block.level, blockId: block.id }, content: [textNode(block.text)] };
      case "paragraph": return paragraph(block.text, block.id);
      case "list": return { type: block.ordered ? "orderedList" : "bulletList", attrs: { blockId: block.id }, content: block.items.map(item => ({ type: "listItem", content: [paragraph(item)] })) };
      case "table": return { type: "table", attrs: { blockId: block.id }, content: [block.headers, ...block.rows].map((row, rowIndex) => ({ type: "tableRow", content: row.map(cell => ({ type: rowIndex === 0 ? "tableHeader" : "tableCell", content: [paragraph(cell)] })) })) };
      case "quote": return { type: "blockquote", attrs: { blockId: block.id }, content: [paragraph(block.text)] };
      case "internal_link": return editorialBlock(block.id, block.type, `Link interno: ${block.anchor}`, { targetArticleId: block.targetArticleId, anchor: block.anchor });
      case "external_source": return editorialBlock(block.id, block.type, `Fonte externa: ${block.claim}`, { sourceId: block.sourceId, claim: block.claim, url: block.url });
      case "CTA": return editorialBlock(block.id, block.type, `CTA: ${block.text}`, { text: block.text, objective: block.objective });
      case "image_brief": return editorialBlock(block.id, block.type, `Briefing de imagem: ${block.objective}`, block);
      case "note": return editorialBlock(block.id, block.type, `Nota: ${block.text}`, { text: block.text });
      case "source": return editorialBlock(block.id, block.type, `Fonte: ${block.note}`, { sourceId: block.sourceId, note: block.note });
      case "product_block": return editorialBlock(block.id, block.type, `Produto: ${block.title}`, { productEvidenceId: block.productEvidenceId, title: block.title, summary: block.summary });
      case "comparison": return editorialBlock(block.id, block.type, `Comparação: ${block.title}`, { title: block.title, columns: block.columns, rows: block.rows });
    }
  });
  return { type: "doc", content };
}

const textContent = (node: JSONContent): string => `${node.text || ""}${(node.content || []).map(textContent).join("")}`;
const dataOf = (node: JSONContent) => { try { return typeof node.attrs?.data === "string" ? JSON.parse(node.attrs.data) as Record<string, unknown> : {}; } catch { return {}; } };

export function tiptapJsonToContentBlocks(json: JSONContent, previous: ContentDocument["blocks"]): ContentDocument["blocks"] {
  const provenanceById = new Map(previous.map(block => [block.id, block.provenance])); const fallbackProvenance = previous[0]?.provenance || { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] };
  return (json.content || []).map((node, index) => {
    const id = String(node.attrs?.blockId || `editor-block-${index + 1}`); const provenance = provenanceById.get(id) || fallbackProvenance;
    if (node.type === "heading") return { id, type: "heading" as const, level: Math.min(4, Math.max(1, Number(node.attrs?.level || 2))), text: textContent(node), provenance };
    if (node.type === "paragraph") return { id, type: "paragraph" as const, text: textContent(node), provenance };
    if (node.type === "bulletList" || node.type === "orderedList") return { id, type: "list" as const, ordered: node.type === "orderedList", items: (node.content || []).map(textContent), provenance };
    if (node.type === "blockquote") return { id, type: "quote" as const, text: textContent(node), sourceId: null, provenance };
    if (node.type === "table") { const rows = (node.content || []).map(row => (row.content || []).map(textContent)); return { id, type: "table" as const, headers: rows[0] || [], rows: rows.slice(1), provenance }; }
    const kind = String(node.attrs?.kind || "note"); const data = dataOf(node);
    if (kind === "internal_link") return { id, type: "internal_link" as const, targetArticleId: String(data.targetArticleId || ""), anchor: String(data.anchor || ""), provenance };
    if (kind === "external_source") return { id, type: "external_source" as const, sourceId: String(data.sourceId || "pending"), claim: String(data.claim || ""), url: typeof data.url === "string" ? data.url : null, provenance };
    if (kind === "CTA") return { id, type: "CTA" as const, text: String(data.text || ""), objective: String(data.objective || ""), provenance };
    if (kind === "image_brief") return { id, type: "image_brief" as const, objective: String(data.objective || ""), format: String(data.format || ""), requiredElements: Array.isArray(data.requiredElements) ? data.requiredElements.map(String) : [], avoid: Array.isArray(data.avoid) ? data.avoid.map(String) : [], provenance };
    if (kind === "source") return { id, type: "source" as const, sourceId: String(data.sourceId || "pending"), note: String(data.note || ""), provenance };
    if (kind === "product_block") return { id, type: "product_block" as const, productEvidenceId: String(data.productEvidenceId || "pending"), title: String(data.title || "Produto"), summary: String(data.summary || ""), provenance };
    if (kind === "comparison") return { id, type: "comparison" as const, title: String(data.title || "Comparação"), columns: Array.isArray(data.columns) && data.columns.length >= 2 ? data.columns.map(String) : ["Critério", "Opção"], rows: Array.isArray(data.rows) ? data.rows.map(row => Array.isArray(row) ? row.map(String) : []) : [], provenance };
    return { id, type: "note" as const, text: String(data.text || node.attrs?.label || ""), provenance };
  });
}
