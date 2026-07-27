import type { ContentDocument } from "../arquiteto/contracts.ts";
import { RedatorPromptContextSchema, type RedatorPromptContext } from "./contracts.ts";

const clamp = (value: string, max = 4000) => value.length > max ? `${value.slice(0, max)}…` : value;

function blockSummary(document: ContentDocument, sectionId: string) {
  const headingIndex = document.blocks.findIndex(block => block.id === sectionId);
  const previousBlocks = (headingIndex < 0 ? document.blocks : document.blocks.slice(0, headingIndex)).slice(-120);
  const section = headingIndex >= 0 ? document.blocks[headingIndex] : null;
  const sectionLabel = section && "text" in section ? section.text : document.title;
  return { sectionLabel, previousBlocks };
}

export function createSectionPromptContext(document: ContentDocument, sectionId: string, humanInstruction = "") {
  const { sectionLabel, previousBlocks } = blockSummary(document, sectionId);
  return RedatorPromptContextSchema.parse({
    documentId: document.id,
    sectionId,
    sectionLabel,
    contentPlanRef: document.contentPlanRef,
    articleDnaRef: document.articleDnaRef,
    siloDnaRef: document.siloDnaRef,
    keywordDnaRefs: document.keywordDnaRefs,
    instructions: document.instructions,
    previousBlocks,
    pendingItems: document.blocks.filter((block): block is Extract<ContentDocument["blocks"][number], { type: "external_source" }> => block.type === "external_source" && !block.url).map(block => block.claim).slice(0, 40),
    humanInstruction,
  });
}

function contextText(context: RedatorPromptContext) {
  return JSON.stringify({
    section: { id: context.sectionId, label: context.sectionLabel },
    references: { plan: context.contentPlanRef, article: context.articleDnaRef, silo: context.siloDnaRef, keywords: context.keywordDnaRefs },
    instructions: context.instructions.map(item => clamp(item)),
    previousBlocks: context.previousBlocks.map(block => ({ id: block.id, type: block.type, text: "text" in block ? clamp(block.text, 1600) : undefined })),
    pendingItems: context.pendingItems,
    humanInstruction: context.humanInstruction,
  }, null, 2);
}

export const SECTION_WRITING_SYSTEM_PROMPT = `Você é um redator editorial assistido. Escreva somente a seção solicitada, em português claro, sem inventar fontes, números, estudos, experiência ou promessa. Respeite a intenção, a fronteira anti-canibalização e as instruções recebidas. Devolva JSON conforme o schema: paragraphs (1 a 8 strings), alerts (strings). A resposta é uma proposta de IA e nunca é aprovação.`;

export function buildSectionWritingPrompt(context: RedatorPromptContext) {
  const parsed = RedatorPromptContextSchema.parse(context);
  return `Documento: ${parsed.documentId}\nSeção alvo: ${parsed.sectionId} — ${parsed.sectionLabel}\n\nContexto editorial validado:\n${contextText(parsed)}\n\nEscreva uma proposta de 1 a 8 parágrafos para esta seção. Não repita o H1/H2 como texto corrido. Se faltar evidência, registre o alerta em vez de preencher a lacuna com uma afirmação.`;
}

export const IMPROVE_SYSTEM_PROMPT = `Você revisa um trecho editorial sem mudar seu sentido sem autorização. Preserve fatos, intenção, idioma e cautelas de evidência. Não invente fontes ou dados. Devolva JSON conforme o schema: replacementText e alerts. A resposta é uma proposta de IA e nunca é aprovação.`;

export function buildImprovePrompt(document: ContentDocument, selectedText: string, humanInstruction = "") {
  return JSON.stringify({
    documentId: document.id,
    title: document.title,
    principalKeyword: document.metadata.principalKeyword,
    instructions: document.instructions.map(item => clamp(item)),
    selectedText: clamp(selectedText, 12000),
    humanInstruction: clamp(humanInstruction),
  }, null, 2);
}
