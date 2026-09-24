import { ContentBlockSchema, type ContentDocument } from "../arquiteto/contracts.ts";
import { GuardianFindingSchema, SectionReviewSchema, type GuardianFinding } from "../editorial/operational-contracts.ts";
import { radarSemanticStems } from "../radar/semantic-concept-model.ts";
import { GuardianReportSchema, type GuardianReport } from "./contracts.ts";

type ContentBlock = import("zod").infer<typeof ContentBlockSchema>;

/**
 * O que o Guardião lê do documento: identidade, blocos e metadados. Nada do
 * contexto importado. O MCP lê só estes três caminhos do banco (Fase 0 da SDD
 * do leitor de evidências); quem já tem o documento inteiro continua passando
 * o documento inteiro.
 */
export type GuardianDocument = Pick<ContentDocument, "id" | "blocks" | "metadata">;

/**
 * UMA DIVERGÊNCIA NÃO ENCERRADA entre evidência e DNA (tabela
 * `writer_evidence_divergences`; SDD do leitor de evidências §5). O Guardião
 * só a mostra: não resolve, não muda DNA e não inventa base — sem divergência
 * registrada, nenhum achado de intenção, evidência ou canibalização sai daqui.
 */
export type GuardianDivergence = {
  id: string;
  status: string;
  severity: "info" | "alerta" | "bloqueante";
  targetKind: string;
  dnaClaimPath: string;
  dnaClaimSummary: string;
  evidenceSourceKey: string;
};

/**
 * O que o chamador acrescenta à análise determinística: as divergências
 * abertas que leu e os avisos de leitura (por exemplo, migration pendente).
 */
export type GuardianContext = {
  divergences?: readonly GuardianDivergence[];
  notices?: readonly string[];
  /**
   * O Assunto declarado no ArticleDNA fixado (SDD do Assunto, F4.2). Ausente
   * ou `null` sem Assunto: aí nenhuma conferência nova roda.
   */
  subject?: GuardianSubject | null;
};

export type GuardianSubject = { phrase: string; destinationUrl: string | null };

const DIVERGENCIA_ENCERRADA = new Set(["resolvida", "descartada"]);
const CAMINHO_DE_CANIBALIZACAO = /(cannibal|canibal|nearbyarticle|excludedsubject)/i;
const FONTE_DE_CANIBALIZACAO = /^(graph\.article|publication\.|brand\.site\.catalog)/;
const CAMINHO_DE_INTENCAO = /(intent|intenc|journey|jornada|promise|promessa|angle|angulo|audience|publico|problem|desiredresult)/i;

/** A categoria do enum do Guardião que a divergência sustenta. */
export function guardianDivergenceCategory(divergence: Pick<GuardianDivergence, "dnaClaimPath" | "evidenceSourceKey">): "intent" | "cannibalization" | "evidence" {
  if (CAMINHO_DE_CANIBALIZACAO.test(divergence.dnaClaimPath) || FONTE_DE_CANIBALIZACAO.test(divergence.evidenceSourceKey)) return "cannibalization";
  if (CAMINHO_DE_INTENCAO.test(divergence.dnaClaimPath)) return "intent";
  return "evidence";
}

const ALVO_DA_DIVERGENCIA: Record<string, string> = {
  article_dna: "ArticleDNA", keyword_dna: "KeywordDNA", silo_dna: "SiloDNA", brand_dna: "contexto da Marca", radar_bundle: "pacote do Radar",
};

/** Bloqueante só quando uma pessoa marcou; a IA registra no máximo `alerta`. */
const SEVERIDADE_DA_DIVERGENCIA = { info: "info", alerta: "warning", bloqueante: "blocked" } as const;

const textOf = (block: ContentBlock) => "text" in block ? block.text.trim() : "";

/* ======================= o Assunto declarado · F4.2 ======================= */

const semAcento = (valor: string) => valor.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * A FRASE OU OS TERMOS DO ASSUNTO num H2/H3 ou parágrafo. O critério é o do
 * Radar, por palavras (raízes de 4 letras ou mais): a frase inteira, ou todas
 * as raízes dela no mesmo bloco. Sentido próximo sem as palavras não conta, e
 * isso é dito no aviso.
 */
function guardianSubjectCovered(document: GuardianDocument, phrase: string): boolean {
  const frase = semAcento(phrase);
  const raizes = radarSemanticStems(phrase);
  return document.blocks.some(block => {
    if (!(block.type === "paragraph" || (block.type === "heading" && (block.level === 2 || block.level === 3)))) return false;
    const texto = textOf(block);
    if (!texto) return false;
    if (frase && ` ${semAcento(texto)} `.includes(` ${frase} `)) return true;
    if (!raizes.length) return false;
    const doBloco = new Set(radarSemanticStems(texto));
    return raizes.every(raiz => doBloco.has(raiz));
  });
}

/** O endereço comparável: sem protocolo, sem `www.`, sem fragmento e sem barra final. */
const enderecoComparavel = (valor: string) => valor.trim().toLowerCase()
  .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/#.*$/, "").replace(/\/+(?=\?|$)/, "");

const URL_NO_TEXTO = /https?:\/\/[^\s"'<>()[\]]+/gi;

/** Existe link para o destino do Assunto: URL no texto (Markdown ou crua), numa fonte ou num link interno. */
function guardianLinksTo(document: GuardianDocument, destinationUrl: string): boolean {
  const alvo = enderecoComparavel(destinationUrl);
  if (!alvo) return false;
  const confere = (valor: string | null | undefined) => Boolean(valor) && enderecoComparavel((valor as string).replace(/[.,;:!?]+$/, "")) === alvo;
  return document.blocks.some(block => {
    if (block.type === "external_source") return confere(block.url);
    if (block.type === "internal_link") return confere(block.targetArticleId);
    const textos = block.type === "list" ? block.items : block.type === "table" ? [...block.headers, ...block.rows.flat()] : [textOf(block)];
    return textos.some(texto => [...texto.matchAll(URL_NO_TEXTO)].some(achado => confere(achado[0])));
  });
}

const now = () => new Date().toISOString();

function finding(document: GuardianDocument, sectionId: string, category: GuardianFinding["category"], severity: "info" | "warning" | "blocked", message: string, suggestion: string | null) {
  return GuardianFindingSchema.parse({ id: `guardian:${document.id}:${sectionId}:${category}:${severity}:${message.slice(0, 24)}`, documentId: document.id, sectionId, category, severity, message, suggestion, humanDecisionRequired: true });
}

function sectionReviews(document: GuardianDocument, findings: ReturnType<typeof finding>[]) {
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

export function runGuardian(document: GuardianDocument, contentHash: string, context: GuardianContext = {}): GuardianReport {
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

  /*
   * O ASSUNTO DECLARADO (SDD do Assunto, F4.2; Q6). Dois AVISOS, nunca
   * bloqueio: onde e como fazer a virada é decisão de quem escreve
   * (invariante 48). Sem Assunto, nada roda.
   */
  const assunto = context.subject && typeof context.subject.phrase === "string" && context.subject.phrase.trim() ? context.subject : null;
  if (assunto) {
    const frase = assunto.phrase.trim();
    if (!guardianSubjectCovered(document, frase)) {
      findings.push(finding(document, "document", "coverage", "warning",
        `O Assunto declarado “${frase}” não aparece em nenhum H2/H3 nem parágrafo (critério por palavras: a frase ou todas as raízes dela no mesmo bloco).`,
        "Faça a virada para o Assunto onde a estrutura pedir; a seção e a forma são decisão de quem escreve. Aviso, não bloqueio."));
    }
    const destino = typeof assunto.destinationUrl === "string" ? assunto.destinationUrl.trim() : "";
    if (destino && !guardianLinksTo(document, destino)) {
      findings.push(finding(document, "document", "cta", "warning",
        `Nenhum link para o destino do Assunto (${destino}).`,
        "Leve o leitor ao destino com um link no texto ou na chamada final, sem trocar a chamada observada. Aviso, não bloqueio."));
    }
  }

  const vistas = new Set<string>();
  for (const divergence of context.divergences ?? []) {
    if (DIVERGENCIA_ENCERRADA.has(divergence.status) || vistas.has(divergence.id)) continue;
    vistas.add(divergence.id);
    const alvo = ALVO_DA_DIVERGENCIA[divergence.targetKind] ?? divergence.targetKind;
    findings.push(finding(document, "document", guardianDivergenceCategory(divergence), SEVERIDADE_DA_DIVERGENCIA[divergence.severity],
      `[${divergence.id.slice(0, 8)}] Divergência ${divergence.status} com o ${alvo} (${divergence.dnaClaimPath}): ${divergence.dnaClaimSummary} — evidência ${divergence.evidenceSourceKey}.`,
      "Decisão humana: reconhecer, enviar ao dono ou descartar. O texto não redefine o DNA; a mudança é do dono, com nova versão."));
  }

  const sections = sectionReviews(document, findings);
  const blockingCount = findings.filter(item => item.severity === "blocked").length;
  const warningCount = findings.filter(item => item.severity === "warning").length;
  const notices = (context.notices ?? []).filter(item => item.trim()).slice(0, 10).map(item => item.slice(0, 500));
  return GuardianReportSchema.parse({ documentId: document.id, contentHash, status: blockingCount ? "blocked" : warningCount ? "warnings" : "ready_for_human_review", findings, sections, blockingCount, warningCount, humanDecisionRequired: true, origin: "rule_engine", generatedAt: now(),
    ...(notices.length ? { notices } : {}) });
}

export function guardianHasBlockingFindings(document: GuardianDocument, contentHash: string, context: GuardianContext = {}) {
  return runGuardian(document, contentHash, context).blockingCount > 0;
}
