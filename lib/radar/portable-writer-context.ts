/**
 * ===== O CONTEXTO COMPLETO DE ESCRITA — 1.2 · §18 e 1.2A · §18 =====
 *
 * ==================== A DIFERENÇA ENTRE AS DUAS COLUNAS ====================
 *
 * `writer_brief_md` é a DECISÃO EDITORIAL CONDENSADA: o que escrever, com que
 * estrutura, sob que regras. Cabe numa leitura.
 *
 * `writer_context_md` é o CONTEXTO COMPLETO: a decisão mais a evidência que a
 * sustenta, mais a identidade da página, os metadados, o plano visual, os
 * vídeos, o especialista e o comercial. É a célula que se cola inteira em outra
 * IA quando se quer que ela produza a página, e não só o texto.
 *
 * ==================== POR QUE ELE É CONCATENAÇÃO, E NÃO SÍNTESE ====================
 *
 * Cada peça aqui já foi escrita por quem tem autoridade sobre ela. Resumi-las de
 * novo criaria uma terceira versão de cada fato — e a primeira divergência
 * apareceria num artigo já publicado.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

const NADA = "Nenhuma evidência deste tipo foi anexada a este artigo.";

/** O Markdown já pronto entra inteiro, trocando o próprio H1 pelo da seção. */
const incorporar = (markdown: string): string[] => {
  const corpo = (markdown || "").trim();
  if (!corpo) return [];
  const linhas = corpo.split("\n");
  return linhas[0].startsWith("# ") ? linhas.slice(1) : linhas;
};

const secao = (titulo: string, corpo: readonly string[], obrigatoria = false): string[] => {
  const conteudo = corpo.join("\n").trim();
  if (!conteudo) return obrigatoria ? ["", `# ${titulo}`, "", NADA] : [];
  return ["", `# ${titulo}`, "", conteudo];
};

export type RadarWriterContextInput = {
  articleIdentity: string;
  seoMetadata: string;
  articleDna: string;
  keywords: string;
  intent: string | null;
  outline: string;
  radiography: string;
  strategy: string;
  serpEvidence: string;
  sectionEvidence: string;
  sources: string;
  internalLinks: string;
  visualIdentity: string;
  visualPlan: string;
  video: string;
  specialist: string;
  commercial: string;
  limitations: readonly string[];
  /** §20 de 1.2 · o que a coleta NÃO alcançou vira proibição explícita. */
  cannotAssert: readonly string[];
  writingRules: readonly string[];
};

export function radarWriterContextMarkdown(input: RadarWriterContextInput): string {
  const lista = (itens: readonly string[]): string[] => itens.filter(Boolean).map(item => `- ${item}`);

  return [
    "# CONTEXTO COMPLETO PARA ESCRITA",
    "",
    "Este documento é autossuficiente: ele carrega a decisão editorial, a evidência que a sustenta, a identidade da página e o plano visual. Se algo não está aqui, não foi apurado — e não pode ser afirmado.",
    ...secao("IDENTIDADE DO ARTIGO", incorporar(input.articleIdentity), true),
    ...secao("METADADOS SEO", incorporar(input.seoMetadata), true),
    ...secao("ARTICLE DNA", incorporar(input.articleDna), true),
    ...secao("KEYWORD DNA", incorporar(input.keywords), true),
    ...secao("INTENÇÃO", input.intent ? [input.intent] : []),
    ...secao("BLUEPRINT", incorporar(input.outline), true),
    ...secao("RADIOGRAFIA COMPETITIVA", incorporar(input.radiography), true),
    ...secao("ESTRATÉGIA PARA SUPERAR A SERP", incorporar(input.strategy)),
    ...secao("EVIDÊNCIAS", incorporar(input.serpEvidence), true),
    ...secao("EVIDÊNCIA POR SEÇÃO", incorporar(input.sectionEvidence), true),
    ...secao("FONTES", incorporar(input.sources), true),
    ...secao("LINKS INTERNOS", incorporar(input.internalLinks), true),
    ...secao("IDENTIDADE VISUAL", incorporar(input.visualIdentity)),
    ...secao("PLANO VISUAL", incorporar(input.visualPlan), true),
    ...secao("VÍDEOS", incorporar(input.video), true),
    ...secao("ESPECIALISTA", incorporar(input.specialist), true),
    ...secao("COMERCIAL", incorporar(input.commercial)),
    ...secao("LIMITAÇÕES", lista(input.limitations), true),
    /*
     * ===== A SEÇÃO QUE FECHA O DOSSIÊ =====
     *
     * As limitações dizem o que a coleta não alcançou. Esta seção traduz isso
     * em PROIBIÇÃO: quem escreve não precisa deduzir, a partir de "nenhum vídeo
     * foi assistido", que não pode afirmar o que os vídeos ensinam.
     */
    ...secao("O QUE NÃO PODE SER AFIRMADO", lista(input.cannotAssert), true),
    ...secao("REGRAS DE REDAÇÃO", lista(input.writingRules), true),
  ].join("\n").trim();
}

/**
 * §22 de 1.2 e §19 de 1.2A · O QUE A LIMITAÇÃO PROÍBE, DITO COMO PROIBIÇÃO.
 *
 * A tradução é determinística e conservadora: cada ausência conhecida vira uma
 * frase sobre o que o texto não pode afirmar. O que não tem tradução conhecida
 * atravessa como está — silenciar seria pior do que repetir.
 */
export function radarCannotAssertFrom(input: {
  limitations: readonly string[];
  hasVideoLibrary: boolean;
  hasSpecialist: boolean;
  profile: string;
  amazonEnrichmentGaps: readonly string[];
}): string[] {
  const frases: string[] = [];

  if (input.profile === "YOUTUBE") {
    frases.push("Não afirme o que é dito DENTRO de um vídeo da pesquisa: a coleta lê título, canal, duração e posição, e nenhum vídeo foi assistido.");
  }
  if (!input.hasSpecialist) {
    frases.push("Não atribua opinião, recomendação ou ressalva a um profissional: nenhuma contribuição especializada foi anexada a este artigo.");
  }
  if (!input.hasVideoLibrary) {
    frases.push("Não cite trecho de vídeo: nenhuma fonte da biblioteca foi casada com as pautas deste artigo.");
  }
  for (const lacuna of input.amazonEnrichmentGaps) {
    frases.push(`Não afirme nada que dependa de ${lacuna.toLowerCase().replaceAll("_", " ")}: essa camada não foi coletada.`);
  }
  for (const limitacao of input.limitations) {
    frases.push(`${limitacao} Portanto, nada que dependa disso pode virar afirmação.`);
  }

  return [...new Set(frases)];
}

export const RADAR_WRITING_RULES = [
  "não copiar concorrentes — a radiografia é insumo, nunca modelo de texto;",
  "não inventar evidência, número, data, preço, benefício ou citação;",
  "preservar a intenção declarada e a keyword principal;",
  "cumprir tudo o que está em MUST_COVER;",
  "usar a keyword com naturalidade, sem repetição forçada;",
  "respeitar as dependências de fonte antes de afirmar;",
  "respeitar as necessidades de revisão profissional;",
  "aplicar somente os links internos planejados;",
  "não alterar slug, canonical nem qualquer decisão marcada como protegida;",
  "não inventar metadados que o dossiê declara como não definidos;",
  "respeitar o plano visual: cada imagem tem função, e nenhuma repete a outra;",
  "respeitar as limitações — o que a coleta não alcançou não vira afirmação;",
  "sinalizar qualquer dependência que continue sem resolução.",
];
