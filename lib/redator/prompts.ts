import type { ContentDocument } from "../arquiteto/contracts.ts";
import { RedatorPromptContextSchema, type RedatorPromptContext } from "./contracts.ts";
import { WRITER_EVIDENCE_GUARDS } from "./writer-evidence-catalog.ts";
import type { WriterSectionEvidencePackage } from "./writer-section-evidence.ts";

const clamp = (value: string, max = 4000) => value.length > max ? `${value.slice(0, max)}…` : value;

/**
 * A evidência que o SERVIDOR montou para a escrita (lib/server/writer-evidence-ai.ts).
 * `notice` diz por que o pacote faltou, quando faltou: a IA escreve sem ele e
 * registra a lacuna, em vez de fingir que leu.
 */
export type WriterPromptEvidence = { package: WriterSectionEvidencePackage | null; notice: string | null };

function blockSummary(document: ContentDocument, sectionId: string) {
  const headingIndex = document.blocks.findIndex(block => block.id === sectionId);
  const previousBlocks = (headingIndex < 0 ? document.blocks : document.blocks.slice(0, headingIndex)).slice(-120);
  const section = headingIndex >= 0 ? document.blocks[headingIndex] : null;
  const sectionLabel = section && "text" in section ? section.text : document.title;
  return { sectionLabel, previousBlocks };
}

export function createSectionPromptContext(document: ContentDocument, sectionId: string, humanInstruction = "", evidence: WriterPromptEvidence | null = null) {
  const { sectionLabel, previousBlocks } = blockSummary(document, sectionId);
  return RedatorPromptContextSchema.parse({
    documentId: document.id,
    sectionId,
    sectionLabel,
    articleDnaRef: document.articleDnaRef,
    siloDnaRef: document.siloDnaRef,
    keywordDnaRefs: document.keywordDnaRefs,
    instructions: document.instructions,
    previousBlocks,
    pendingItems: document.blocks.filter((block): block is Extract<ContentDocument["blocks"][number], { type: "external_source" }> => block.type === "external_source" && !block.url).map(block => block.claim).slice(0, 40),
    humanInstruction,
    evidence: evidence?.package ?? null,
    evidenceNotice: evidence?.notice ? clamp(evidence.notice, 1000) : null,
  });
}

function contextText(context: RedatorPromptContext) {
  return JSON.stringify({
    section: { id: context.sectionId, label: context.sectionLabel },
    references: { article: context.articleDnaRef, silo: context.siloDnaRef, keywords: context.keywordDnaRefs },
    instructions: context.instructions.map(item => clamp(item)),
    previousBlocks: context.previousBlocks.map(block => ({ id: block.id, type: block.type, text: "text" in block ? clamp(block.text, 1600) : undefined })),
    pendingItems: context.pendingItems,
    humanInstruction: context.humanInstruction,
  }, null, 2);
}

/** O pacote vai compacto: é ele que foi medido em ≤ 24 kB. */
function evidenceText(evidence: RedatorPromptContext["evidence"], notice: string | null) {
  if (!evidence) return `Evidência do artigo: indisponível${notice ? ` (${notice})` : ""}. Não infira evidência; registre a lacuna em alerts.`;
  return `Evidência do artigo (montada pelo servidor; pesquisa para confrontar, não para copiar):\n${JSON.stringify(evidence)}`;
}

/**
 * AS GUARDAS DE TODA INSTRUÇÃO À IA QUE ESCREVE (SDD do leitor §4.5; AGENTS.md
 * §9 e §13): sem FAQ, dado de terceiros é pesquisa, conflito escrito dos dois
 * lados, ler não é mudar o DNA.
 */
const WRITING_GUARDS = WRITER_EVIDENCE_GUARDS.map(item => `- ${item}`).join("\n");

/**
 * O FORMATO DO ALERTA. A camada de IA exige a palavra JSON no prompt, e é a
 * forma declarada aqui que o modelo devolve. Todo alerta vira registro de
 * divergência "aberta" para decisão humana; nenhum muda DNA.
 */
const ALERT_FORMAT = "Cada item de alerts é um texto curto ou um objeto { message, targetKind, keywordId, dnaClaimPath, evidenceSourceKey, evidencePath } quando a evidência contradiz ou não sustenta um DNA: targetKind é article_dna, keyword_dna, silo_dna, brand_dna ou radar_bundle; keywordId só em keyword_dna, com uma keyword das referências; evidenceSourceKey é uma das chaves de evidence.sources. Nunca invente id. O alerta vira registro de divergência para decisão humana; você não muda DNA.";

/*
 * 2026-10-02 · O ARTIGO-MODELO APROVADO E A VOZ DA MARCA (SDD diretriz
 * editorial, Adendos A e C). O pacote traz, quando existem, a planta que o
 * dono aprovou no Radar para o pacote do documento e a voz corrente da Marca
 * ("inclusive para ser útil nos CTAs"). Planta e voz mandam na FORMA; não
 * mudam keyword, intenção, escopo nem fatos, e o conflito vira alerta.
 *
 * CORREÇÕES DA REVISÃO, no mesmo dia. (1) A seção da planta só
 * chega quando casa com segurança com o H2 alvo (writer-section-evidence.ts);
 * sem ela valem a ordem dos H2 e a voz, e nada de pergunta, H3 ou link de
 * outra seção — seguir a seção errada duplicava conteúdo e levava o link de
 * outro H2. (2) A melhoria de trecho não tem seção da planta e não ganha CTA,
 * link nem afirmação que mudem o sentido do trecho. (3) A voz entra no alerta
 * como a FONTE citada, nunca como alvo brand_dna: o registro do alerta
 * (lib/server/writer-evidence-ai.ts) ainda não repassa versionId ao
 * resolvedor, e brand_dna sem versão cai no BrandDNA aprovado — outro
 * artefato, trilha de decisão humana com o alvo errado.
 */
const BLUEPRINT_SECTION_RULE = "Quando evidence.articleBlueprint existir, ele é o artigo-modelo da SERP concluído no Radar. evidence.articleBlueprint.section é a seção da planta para ESTE H2, e o servidor só a entrega quando o título casa com segurança: siga a pergunta do leitor, a resposta que abre a seção, os H3 e os links internos dela com a âncora indicada, sem criar link fora dela. Quando section é null, a seção alvo não tem par seguro na planta: valem só a ordem dos H2 (outline), a promessa e o leitor; não copie pergunta, H3 nem link de outra seção da planta. A virada, o CTA e o próximo passo do fechamento (closing) entram só quando a seção alvo fecha o artigo.";
const BLUEPRINT_IMPROVE_RULE = "Quando evidence.articleBlueprint existir, ele é o artigo-modelo da SERP concluído no Radar e, na melhoria, só orienta a forma (promessa, leitor, ordem dos H2): não há seção da planta para o trecho, e você não acrescenta CTA, link, H3, pergunta nem afirmação que o trecho não tinha.";
const BRAND_VOICE_RULE = "Quando evidence.brandVoice existir, forma, copy, transições e CTA seguem a voz da marca (trechos cta e voice; statusLabel diz se a Skill está ativa ou em rascunho na Marca); o que a voz proíbe não entra. Planta e voz não mudam keyword, intenção, escopo nem fatos: diante da evidência, vale a evidência. Conflito entre planta, voz, DNA e evidência não se resolve em silêncio: devolva um alerta com evidenceSourceKey. Quando a voz entra no conflito, ela é a fonte citada (evidenceSourceKey = evidence.brandVoice.readAt), o targetKind é o do DNA do outro lado (article_dna quando não há DNA do outro lado) e o message diz o que a voz pede e o que o outro lado diz; não use targetKind brand_dna para a voz: esse alvo aponta o BrandDNA aprovado, não a Skill de voz.";

export const SECTION_WRITING_SYSTEM_PROMPT = [
  "Você é um redator editorial assistido. Escreva somente a seção solicitada, em português claro, sem inventar fontes, números, estudos, experiência ou promessa. Respeite a intenção, a fronteira anti-canibalização e as instruções recebidas.",
  "Regras que valem sempre:",
  WRITING_GUARDS,
  BLUEPRINT_SECTION_RULE,
  BRAND_VOICE_RULE,
  "Devolva JSON conforme o schema: paragraphs (1 a 8 strings), alerts (lista). A resposta é uma proposta de IA e nunca é aprovação.",
  ALERT_FORMAT,
].join("\n");

export function buildSectionWritingPrompt(context: RedatorPromptContext) {
  const parsed = RedatorPromptContextSchema.parse(context);
  return `Documento: ${parsed.documentId}\nSeção alvo: ${parsed.sectionId} — ${parsed.sectionLabel}\n\nContexto editorial validado:\n${contextText(parsed)}\n\n${evidenceText(parsed.evidence, parsed.evidenceNotice)}\n\nEscreva uma proposta de 1 a 8 parágrafos para esta seção. Não repita o H1/H2 como texto corrido. Não crie FAQ nem lista de perguntas e respostas. Se faltar evidência, registre o alerta em vez de preencher a lacuna com uma afirmação.`;
}

export const IMPROVE_SYSTEM_PROMPT = [
  "Você revisa um trecho editorial sem mudar seu sentido sem autorização. Preserve fatos, intenção, idioma e cautelas de evidência. Não invente fontes ou dados.",
  "Regras que valem sempre:",
  WRITING_GUARDS,
  BLUEPRINT_IMPROVE_RULE,
  BRAND_VOICE_RULE,
  "Devolva JSON conforme o schema: replacementText e alerts (lista). A resposta é uma proposta de IA e nunca é aprovação.",
  ALERT_FORMAT,
].join("\n");

export function buildImprovePrompt(document: ContentDocument, selectedText: string, humanInstruction = "", evidence: WriterPromptEvidence | null = null) {
  const payload = JSON.stringify({
    documentId: document.id,
    title: document.title,
    principalKeyword: document.metadata.principalKeyword,
    instructions: document.instructions.map(item => clamp(item)),
    selectedText: clamp(selectedText, 12000),
    humanInstruction: clamp(humanInstruction),
  }, null, 2);
  if (!evidence) return payload;
  return `${payload}\n\n${evidenceText(evidence.package ? { ...evidence.package } : null, evidence.notice)}`;
}
