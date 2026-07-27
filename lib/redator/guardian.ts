import { ContentBlockSchema, type ContentDocument } from "../arquiteto/contracts.ts";
import { GuardianFindingSchema, SectionReviewSchema, type GuardianFinding } from "../editorial/operational-contracts.ts";
import { GuardianReportSchema, type GuardianReport } from "./contracts.ts";

type ContentBlock = import("zod").infer<typeof ContentBlockSchema>;

const textOf = (block: ContentBlock) => "text" in block ? block.text.trim() : "";
const now = () => new Date().toISOString();

function finding(document: ContentDocument, sectionId: string, category: GuardianFinding["category"], severity: "info" | "warning" | "blocked", message: string, suggestion: string | null) {
  return GuardianFindingSchema.parse({ id: `guardian:${document.id}:${sectionId}:${category}:${severity}:${message.slice(0, 24)}`, documentId: document.id, sectionId, category, severity, message, suggestion, humanDecisionRequired: true });
}

function sectionReviews(document: ContentDocument, findings: ReturnType<typeof finding>[]) {
  const headings = document.blocks.filter(block => block.type === "heading");
  return headings.map((heading, index) => {
    const sectionFindings = findings.filter(item => item.sectionId === heading.id);
    const nextHeading = headings[index + 1];
    const start = document.blocks.findIndex(block => block.id === heading.id);
    const end = nextHeading ? document.blocks.findIndex(block => block.id === nextHeading.id) : document.blocks.length;
    const hasBody = document.blocks.slice(start + 1, end).some(block => ["paragraph", "list", "table", "quote"].includes(block.type) && textOf(block).length > 0);
    const status = sectionFindings.some(item => item.severity === "blocked") ? "blocked" : sectionFindings.some(item => item.severity === "warning") || !hasBody ? "warning" : "approved";
    return SectionReviewSchema.parse({ sectionId: heading.id, label: textOf(heading) || `Seção ${index + 1}`, status, findings: sectionFindings });
  });
}

export function runGuardian(document: ContentDocument, contentHash: string): GuardianReport {
  const findings: GuardianFinding[] = [];
  const headings = document.blocks.filter(block => block.type === "heading");
  const h1 = headings.filter(block => block.level === 1);
  const firstSectionId = headings[0]?.id || "document";
  if (h1.length === 0) findings.push(finding(document, firstSectionId, "heading", "blocked", "O documento não possui H1.", "Mantenha exatamente um H1 alinhado ao artigo."));
  if (h1.length > 1) findings.push(finding(document, h1[1].id, "heading", "blocked", "O documento possui mais de um H1.", "Conserve apenas o H1 estrutural do documento."));
  if (!document.blocks.some(block => block.type === "paragraph" && textOf(block))) findings.push(finding(document, firstSectionId, "completeness", "blocked", "O documento ainda não possui corpo textual.", "Escreva ao menos um parágrafo antes de solicitar aprovação."));

  headings.forEach((heading, index) => {
    const nextHeading = headings[index + 1];
    const start = document.blocks.findIndex(block => block.id === heading.id);
    const end = nextHeading ? document.blocks.findIndex(block => block.id === nextHeading.id) : document.blocks.length;
    const hasBody = document.blocks.slice(start + 1, end).some(block => ["paragraph", "list", "table", "quote"].includes(block.type) && (block.type === "paragraph" ? textOf(block).length > 0 : true));
    if (!hasBody) findings.push(finding(document, heading.id, "completeness", "blocked", `A seção “${textOf(heading) || "sem título"}” ainda não possui corpo.`, "Escreva ou aplique uma proposta para esta seção antes da aprovação."));
  });

  const seenParagraphs = new Map<string, string>();
  for (const block of document.blocks.filter(item => item.type === "paragraph")) {
    const text = textOf(block).toLocaleLowerCase("pt-BR");
    if (!text) continue;
    const previous = seenParagraphs.get(text);
    if (previous) findings.push(finding(document, block.id, "repetition", "warning", "Este parágrafo repete exatamente outro trecho do documento.", `Revise ou remova a repetição do bloco ${previous}.`));
    else seenParagraphs.set(text, block.id);
    if (/\b(placeholder|preencher|definir|pendente|lorem ipsum)\b/i.test(text)) findings.push(finding(document, block.id, "completeness", "blocked", "O trecho contém um placeholder ou pendência explícita.", "Resolva a pendência ou transforme-a em nota humana antes da aprovação."));
  }

  for (const block of document.blocks) {
    if (block.type === "external_source" && !block.url) findings.push(finding(document, block.id, "source", "blocked", `A afirmação “${block.claim}” não possui URL de fonte validada.`, "Adicione uma fonte aprovada ou mantenha o claim explicitamente pendente."));
    if (block.type === "internal_link" && (!block.targetArticleId || !block.anchor.trim())) findings.push(finding(document, block.id, "internal_link", "blocked", "O link interno está incompleto.", "Informe destino e âncora natural antes de aprovar."));
  }

  if (!document.metadata.slug.trim() || !document.metadata.principalKeyword.trim()) findings.push(finding(document, "document", "metadata", "blocked", "Slug e keyword principal são obrigatórios para o documento.", "Complete os metadados estruturais."));
  if (!document.metadata.metaTitle.trim() || !document.metadata.metaDescription.trim()) findings.push(finding(document, "document", "metadata", "warning", "Meta title e meta description ainda não estão completos.", "Revise os metadados antes da transferência."));
  const sections = sectionReviews(document, findings);
  const blockingCount = findings.filter(item => item.severity === "blocked").length;
  const warningCount = findings.filter(item => item.severity === "warning").length;
  return GuardianReportSchema.parse({ documentId: document.id, contentHash, status: blockingCount ? "blocked" : warningCount ? "warnings" : "ready_for_human_review", findings, sections, blockingCount, warningCount, humanDecisionRequired: true, origin: "rule_engine", generatedAt: now() });
}

export function guardianHasBlockingFindings(document: ContentDocument, contentHash: string) {
  return runGuardian(document, contentHash).blockingCount > 0;
}
