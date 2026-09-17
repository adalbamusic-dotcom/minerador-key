import type { RadarCompetitiveBlueprint } from "./competitive-blueprint.ts";
import type { RadarCompetitiveBlueprintView } from "./competitive-blueprint-view.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import type { RadarEditorialArticleModel } from "./editorial-article-model.ts";
import type { RadarEditorialProfileModel } from "./editorial-profile-model.ts";
import type { RadarAmazonEditorialSetup } from "./amazon-editorial-target.ts";
import type { RadarResearchProfile } from "./research-profile.ts";
import {
  RADAR_EXPORT_BLUEPRINT_TYPE,
  radarPortableArticleDna,
  radarPortableEditorialOf,
  radarPortableFlatSections,
  type RadarPortableArticleDna,
  type RadarPortableEditorial,
  type RadarPortableSection,
} from "./portable-read-model.ts";
import {
  radarCompetitiveRadiographyMarkdown,
  radarSerpOutperformanceStrategyMarkdown,
} from "./portable-radiography.ts";
import {
  radarKeywordsContextMarkdown,
  radarPortableAmazonEvidence,
  radarPortableExternalSources,
  radarPortableInternalLinks,
  radarPortableKeywordsDna,
  radarPortableSectionEvidence,
  radarPortableSerpEvidence,
  radarPortableSerpSources,
  radarPortableYoutubeEvidence,
  radarSectionEvidenceMarkdown,
  radarSerpEvidenceMarkdown,
  radarSourcesMarkdown,
  radarInternalLinksResolvedMarkdown,
} from "./portable-evidence-pack.ts";
import {
  radarPortableSpecialistContext,
  radarPortableVideoContext,
  radarSpecialistContextMarkdown,
  radarVideoContextMarkdown,
  type RadarPortableSpecialistContext,
  type RadarPortableVideoContext,
} from "./portable-annex-context.ts";
import {
  radarArticleIdentityMarkdown,
  radarPortableArticleIdentity,
  radarPortableSeoMetadata,
  radarPortableVisualPlan,
  radarSeoMetadataMarkdown,
  radarVisualIdentityMarkdown,
  radarVisualPlanMarkdown,
} from "./portable-identity.ts";
import {
  RADAR_WRITING_RULES,
  radarCannotAssertFrom,
  radarWriterContextMarkdown,
} from "./portable-writer-context.ts";
import type { RadarAmazonUniverseEntry } from "./amazon-search-model.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";

export { RADAR_EXPORT_BLUEPRINT_TYPE };

/**
 * ===== O DOSSIÊ EDITORIAL PORTÁTIL — RADAR_PORTABLE_EXPORT_1.2 =====
 *
 * ==================== O QUE ESTE ARQUIVO É, E O QUE NÃO É ====================
 *
 * É um DOSSIÊ DE ESCRITA. Uma linha precisa responder sozinha: o que vamos
 * escrever, para quem, o que a concorrência faz, o que falta no mercado, qual
 * estrutura usar, o que cada seção resolve, que evidência sustenta cada parte,
 * o que precisa de fonte, o que não pode ser inventado.
 *
 * NÃO é backup, dump de banco, payload de debugging nem réplica de DTO interno.
 * O gate 1.1 nasceu porque o CSV tinha virado as quatro coisas: 68 colunas, o
 * `article_dna_json` inteiro do Arquiteto, bundleId, bundleHash, versionId,
 * contentHash, e `sections_json` repetido em três colunas com nomes diferentes.
 * Tecnicamente fiel ao domínio; inútil para escrever.
 *
 * ==================== A REGRA DE CADA COLUNA ====================
 *
 * Toda coluna precisa ter uma finalidade EDITORIAL (alguém lê para escrever) ou
 * de AUTOMAÇÃO EXTERNA (alguém consome para montar). Identificador técnico não
 * tem nenhuma das duas: ele serve para o banco encontrar a linha, e o banco já
 * a encontrou.
 *
 * Markdown é o produto humano e de LLM; JSON é apoio de automação, e são quatro
 * (§18). Invertido — JSON como produto — o dossiê volta a ser um dump.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== a linha ============================== */

export type RadarPortableExportRow = Record<string, string>;

const json = (valor: unknown): string => {
  if (valor === null || valor === undefined) return "";
  return JSON.stringify(valor);
};

const texto = (valor: string | null | undefined): string => (valor || "").trim();

/** Listas curtas viram texto legível. A forma estruturada vive nos JSONs (§18). */
const emLinha = (itens: readonly string[]): string => itens.filter(Boolean).join(" · ");

/**
 * ===== PARA CASAR DUAS FORMULAÇÕES DA MESMA NECESSIDADE =====
 *
 * A pauta de vídeo e o ponto do especialista guardam o título COMO ELE ERA
 * quando a investigação congelou. O artigo-modelo reformula o cabeçalho para
 * não copiar concorrente. As duas descrevem a mesma seção com palavras
 * diferentes, e só as palavras de CONTEÚDO as aproximam.
 */
const VAZIAS = new Set([
  "a", "as", "o", "os", "um", "uma", "de", "da", "do", "das", "dos",
  "em", "na", "no", "nas", "nos", "e", "ou", "que", "se", "com", "para",
  "por", "ao", "aos", "sobre", "ponto", "responder", "qualificar", "trecho",
  "considerar", "seu", "sua", "este", "esta", "isso",
]);

const palavrasDeConteudo = (valor: string): Set<string> => new Set(
  valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(palavra => palavra.length > 2 && !VAZIAS.has(palavra)),
);

/* ============================== o CSV ============================== */

/**
 * ===== O ESCAPE QUE O ARQUIVO PRECISA SOBREVIVER =====
 *
 * As células carregam Markdown com quebras de linha, JSON com aspas e títulos
 * com vírgula. Um CSV ingênuo quebra em qualquer um dos três, e o estrago é
 * silencioso: o Excel abre, mostra colunas deslocadas, e ninguém percebe até o
 * texto sair errado.
 *
 * A regra do RFC 4180 é simples e é esta: tudo entre aspas, aspas internas
 * duplicadas. Com tudo citado, vírgula e quebra de linha deixam de ser
 * problema — não há caso especial para esquecer.
 *
 * O BOM abre o arquivo com acento correto no Excel. Sem ele, "Sérum" vira
 * "SÃ©rum" — e a pessoa culpa o dado.
 */
export function radarPortableExportCsv(rows: readonly RadarPortableExportRow[]): string {
  if (!rows.length) return "";

  /*
   * AS COLUNAS SÃO A UNIÃO DE TODAS AS LINHAS, em ordem de primeira aparição.
   *
   * Um lote com um artigo Google e um Amazon tem colunas diferentes. Usar só as
   * do primeiro deixaria as colunas comerciais de fora do arquivo inteiro.
   */
  const colunas: string[] = [];
  for (const row of rows) {
    for (const chave of Object.keys(row)) if (!colunas.includes(chave)) colunas.push(chave);
  }

  const celula = (valor: string) => `"${valor.replaceAll('"', '""')}"`;
  const linhas = [
    colunas.map(celula).join(","),
    ...rows.map(row => colunas.map(coluna => celula(row[coluna] ?? "")).join(",")),
  ];

  /* CRLF é o que o RFC pede e o que o Excel espera em campo multilinha. */
  return `﻿${linhas.join("\r\n")}\r\n`;
}

/**
 * O NOME DO ARQUIVO, SANITIZADO.
 *
 * Um título de artigo vira nome de arquivo, e títulos têm barra, dois-pontos e
 * acento. O sistema de arquivos recusa alguns e o navegador silencia outros.
 */
export function radarPortableExportFilename(input: {
  articles: readonly { slug: string | null; keyword: string | null }[];
  today: string;
}): string {
  const limpar = (valor: string) => valor
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  if (input.articles.length === 1) {
    const unico = input.articles[0];
    const base = limpar(texto(unico.slug) || texto(unico.keyword) || "artigo");
    return `radar-${base || "artigo"}-dossie.csv`;
  }
  return `radar-dossies-${input.today.slice(0, 10)}.csv`;
}

/* ========================= as peças de Markdown ========================= */

const bloco = (titulo: string, linhas: readonly string[]): string[] =>
  linhas.length ? ["", `## ${titulo}`, "", ...linhas] : [];

const lista = (itens: readonly string[]): string[] => itens.filter(Boolean).map(item => `- ${item}`);

const EVIDENCIA_LEGIVEL: Record<string, string> = {
  STRONG: "a amostra sustenta",
  MODERATE: "a amostra sustenta parcialmente",
  DNA_REQUIRED: "exigido pelo ArticleDNA, sem apoio da amostra",
};

/**
 * ===== §11 · O OUTLINE É PARA COLAR NO EDITOR =====
 *
 * `sections_json` obrigava quem escreve a ler um array de objetos e montar a
 * hierarquia de cabeça. O produto é o Markdown: H2, H3, objetivo e o que
 * cobrir, na ordem em que vão para a página.
 *
 * O JSON continua ao lado, para automação (§18) — mas ele deixou de ser o que
 * a pessoa precisa decifrar.
 */
export function radarOutlineMarkdown(secoes: readonly RadarPortableSection[]): string {
  if (!secoes.length) return "";

  const escrever = (secao: RadarPortableSection): string[] => [
    "",
    `${"#".repeat(secao.level)} ${secao.heading}`,
    `Objetivo: ${secao.objective}`,
    ...(secao.readerQuestion ? [`Responde: ${secao.readerQuestion}`] : []),
    ...(secao.keyMessage ? [`Mensagem-chave: ${secao.keyMessage}`] : []),
    ...(secao.coveragePoints.length ? ["Cobrir:", ...lista(secao.coveragePoints)] : []),
    ...(secao.mustCoverReasons.length ? ["Exigido pelo ArticleDNA:", ...lista(secao.mustCoverReasons)] : []),
    ...(secao.evidenceStrength ? [`Evidência: ${EVIDENCIA_LEGIVEL[secao.evidenceStrength] || secao.evidenceStrength}`] : []),
    ...(secao.sourceNeeded ? [`Precisa de fonte: ${secao.sourceNeeded}`] : []),
    ...(secao.specialistRequired ? [`Precisa de revisão profissional: ${secao.specialistRequired}`] : []),
    ...(secao.internalLinks.length ? ["Links internos:", ...lista(secao.internalLinks)] : []),
    ...(secao.mediaOpportunity.length ? ["Apoio visual:", ...lista(secao.mediaOpportunity)] : []),
    ...secao.children.flatMap(escrever),
  ];

  return ["# Estrutura recomendada", ...secoes.flatMap(escrever)].join("\n");
}

/**
 * ===== §12 · O QUE PRECISA ENTRAR NO TEXTO — SEM TELEMETRIA =====
 *
 * Volume, KGR, posição e contagem de amostra sustentam a DECISÃO e não ajudam a
 * executá-la. Quem escreve precisa saber qual keyword usar, o que cobrir, que
 * perguntas fechar e que links aplicar.
 */
export function radarSeoRequirementsMarkdown(input: {
  dna: RadarPortableArticleDna;
  editorial: RadarPortableEditorial;
  blueprint: RadarCompetitiveBlueprint | null;
}): string {
  const identidade = [
    `Keyword principal: ${input.dna.principalKeyword || "não resolvida"}`,
    ...(input.dna.secondaryKeywords.length ? [`Keywords secundárias: ${emLinha(input.dna.secondaryKeywords)}`] : []),
    ...(input.dna.narrativeReinforcements.length ? [`Reforços narrativos: ${emLinha(input.dna.narrativeReinforcements)}`] : []),
    `Intenção a satisfazer: ${input.dna.intent || "não declarada"}`,
    ...(input.dna.funnel ? [`Etapa do funil: ${input.dna.funnel}`] : []),
    ...(input.dna.silo ? [`Silo: ${input.dna.silo}${input.dna.siloRole ? ` · papel ${input.dna.siloRole}` : ""}`] : []),
  ];

  const google = input.blueprint?.profile === "GOOGLE" ? input.blueprint.recommended : null;
  const secoes = radarPortableFlatSections(input.editorial.sections);

  const perguntas = [...new Set([
    ...(google?.questionCoverage || []).map(item => item.statement),
    ...secoes.map(item => item.readerQuestion).filter((valor): valor is string => Boolean(valor)),
  ])];

  const conceitos = [...new Set([
    ...(google?.entityCoverage || []).map(item => item.statement),
    ...(google?.sectionDirections || []).flatMap(item => item.mustCover),
  ])];

  return [
    "# Requisitos de SEO",
    "",
    ...identidade,
    ...bloco("Obrigatório cobrir (ArticleDNA)", lista(input.dna.mustCover)),
    ...bloco("Entidades e conceitos que precisam aparecer", lista(conceitos.slice(0, 12))),
    ...bloco("Perguntas que precisam ser respondidas", lista(perguntas.slice(0, 12))),
    ...bloco("Aplicações observadas", lista(input.editorial.seoApplications)),
    ...bloco("Critérios de comparação", lista(input.editorial.comparisonCriteria)),
    ...bloco("Precisa de fonte", lista(input.editorial.sourceNeeds)),
    ...bloco("Precisa de revisão profissional", lista(input.editorial.specialistNeeds)),
  ].join("\n").trim();
}

export function radarInternalLinksMarkdown(input: {
  planned: readonly string[];
  blueprint: RadarCompetitiveBlueprint | null;
  editorial: RadarPortableEditorial;
}): string {
  const direcoes = input.blueprint?.profile === "GOOGLE"
    ? input.blueprint.recommended.internalLinkPlan.map(item =>
      `${item.target} — ${item.role}. Âncora: ${item.anchorDirection}. Onde: ${item.placementContext}.`)
    : [];

  const porSecao = radarPortableFlatSections(input.editorial.sections)
    .flatMap(secao => secao.internalLinks.map(link => `${secao.heading} → ${link}`));

  const tudo = [...new Set([...direcoes, ...porSecao, ...input.planned])];
  if (!tudo.length) return "";

  return [
    "# Links internos",
    "",
    "Aplique somente os links abaixo. A arquitetura interna é do Arquiteto, e criar link novo aqui a desfaz.",
    "",
    ...lista(tudo),
  ].join("\n");
}

/**
 * ===== §13 · O QUE SABEMOS, O QUE É HIPÓTESE, O QUE PRECISA DE FONTE =====
 *
 * Esta separação é a diferença entre um texto que sustenta o que afirma e um
 * que afirma o que a coleta nunca mediu. Ela precisa estar em LINGUAGEM DE
 * ESCRITA: `bundleHash` e `amz-preco-faixa` são endereços internos, e endereço
 * interno não diz a ninguém o que pode ser afirmado.
 */
export function radarEvidenceAndSourcesMarkdown(input: {
  editorial: RadarPortableEditorial;
  blueprint: RadarCompetitiveBlueprint | null;
  limitations: readonly string[];
}): string {
  const secoes = radarPortableFlatSections(input.editorial.sections);

  const forte = secoes
    .filter(item => item.evidenceStrength === "STRONG")
    .map(item => `${item.heading} — a amostra observada sustenta este trecho.`);

  const competitiva = input.editorial.derived
    .slice(0, 8)
    .map(item => `${item.label}: ${item.detail}`);

  const fontes = [...new Set([
    ...input.editorial.sourceNeeds,
    ...secoes.flatMap(item => (item.sourceNeeded ? [`${item.heading}: ${item.sourceNeeded}`] : [])),
  ])];

  const especialista = [...new Set([
    ...input.editorial.specialistNeeds,
    ...secoes.flatMap(item => (item.specialistRequired ? [`${item.heading}: ${item.specialistRequired}`] : [])),
  ])];

  /*
   * "NÃO AFIRMAR SEM NOVA EVIDÊNCIA" NASCE DA LIMITAÇÃO, e não de uma lista à
   * parte. O que a coleta não alcançou é exatamente o que não pode virar
   * afirmação — dizer as duas coisas em lugares diferentes convidaria a ler só
   * uma delas.
   */
  const proibido = [
    ...input.limitations,
    ...(input.blueprint?.profile === "GOOGLE"
      ? input.blueprint.observed.conflicts.map(item => `${item.statement} — a amostra diverge, e o texto não pode escolher um lado sem fonte.`)
      : []),
  ];

  const corpo = [
    ...bloco("Evidência forte", lista(forte)),
    ...bloco("Evidência competitiva", lista(competitiva)),
    ...bloco("Precisa de fonte", lista(fontes)),
    ...bloco("Precisa de revisão profissional", lista(especialista)),
    ...bloco("Não afirmar sem nova evidência", lista(proibido)),
  ];

  return corpo.length ? ["# Evidência e fontes", ...corpo].join("\n").trim() : "";
}

export function radarVisualMediaPlanMarkdown(input: {
  editorial: RadarPortableEditorial;
  blueprint: RadarCompetitiveBlueprint | null;
}): string {
  const doBlueprint = input.blueprint?.profile === "GOOGLE"
    ? input.blueprint.recommended.multimediaPlan.map(item => item.statement)
    : input.blueprint?.profile === "AMAZON"
      ? input.blueprint.recommended.multimediaPlan.map(item => item.statement)
      : [];

  const corpo = [
    ...bloco("Apoio visual", lista([...new Set([...input.editorial.visualPlan, ...doBlueprint])])),
    ...bloco("Onde o vídeo entra no artigo", lista(input.editorial.videoApplication)),
  ];

  return corpo.length ? ["# Plano visual e de vídeo", ...corpo].join("\n").trim() : "";
}

/* ========================= §14 · as limitações ========================= */

/**
 * ===== §14 · SÓ LIMITAÇÃO ACIONÁVEL ATRAVESSA =====
 *
 * "Nenhum vídeo foi assistido ou transcrito" muda o que o texto pode afirmar.
 * "3 ids não resolvidos no transporte compacto" descreve um problema NOSSO, com
 * consequência zero para quem escreve — e misturado com a primeira, ensina a
 * pular a seção inteira.
 *
 * O corte é pelo VOCABULÁRIO DE TRANSPORTE, não por uma lista de frases: hash,
 * snapshot, versão, payload, DTO e identificador descrevem a máquina. Uma frase
 * nova com o mesmo defeito cai aqui sem precisar ser prevista.
 */
const VOCABULARIO_DE_TRANSPORTE = /\b(hash|snapshot|payload|dto|uuid|version[a-z]*id|bundleid|bundlehash|transporte compacto|não resolvid[oa]s? no transporte|schema)\b/i;

export function radarPortableActionableLimitations(limitacoes: readonly string[]): string[] {
  return [...new Set(limitacoes.map(item => item.trim()).filter(Boolean))]
    .filter(item => !VOCABULARIO_DE_TRANSPORTE.test(item));
}

export function radarLimitationsMarkdown(limitacoes: readonly string[]): string {
  if (!limitacoes.length) return "";
  return [
    "# Limitações desta investigação",
    "",
    "Cada linha abaixo é algo que a coleta NÃO alcançou. Nada disso pode virar afirmação no texto.",
    "",
    ...lista(limitacoes),
  ].join("\n");
}

/* ========================= §10 · o plano comercial ========================= */

export type RadarPortableCommercial = {
  setup: RadarAmazonEditorialSetup | null;
  counts: { observed: number; eligible: number; shortlist: number } | null;
  products: Array<{ asin: string; productName: string }>;
  links: RadarEditorialProfileModel["promotionLinks"];
  comparisonCriteria: readonly string[];
  disclosureRequired: boolean;
  shortlistStatus: RadarEditorialProfileModel["shortlistStatus"] | null;
};

/**
 * ===== §10 · O COMERCIAL VIRA ORIENTAÇÃO, NÃO DESPEJO DE OBJETO =====
 *
 * `amazon_research_target` era o DTO inteiro serializado numa célula. Quem lê
 * precisa da FRASE: que artigo é este, sobre que produto, com quantos
 * candidatos, comparados por quê, e com que ressalva.
 */
export function radarCommercialPlanMarkdown(input: RadarPortableCommercial): string {
  if (!input.setup && !input.links.length) return "";

  const setup = input.setup;
  const alvo = setup?.target || null;

  const contrato = [
    ...(setup ? [`Formato comercial: ${setup.intent.type}${setup.intent.desiredCount ? ` de ${setup.intent.desiredCount}` : ""}`] : []),
    ...(setup?.intent.rankingCriteria ? [`Critério do ranking: ${setup.intent.rankingCriteria}`] : []),
    ...(setup?.intent.useCase ? [`Caso de uso: ${setup.intent.useCase}`] : []),
    ...(alvo?.productClass ? [`Tipo de produto: ${alvo.productClass}`] : []),
    ...(alvo?.brandFilter ? [`Marca exigida: ${alvo.brandFilter}`] : []),
    ...(alvo?.categoryQuery ? [`Busca da prateleira: ${alvo.categoryQuery}`] : []),
  ];

  /*
   * AS TRÊS CAMADAS, EM FRASE.
   *
   * "59 · 9 · 6" em três colunas obriga quem lê a reconstruir o que aconteceu.
   * A frase diz o que cada número significa — e por que o artigo fala de seis
   * produtos e não de cinquenta e nove.
   */
  const camadas = input.counts
    ? [`A prateleira devolveu ${input.counts.observed} produto(s); ${input.counts.eligible} são compatíveis com o alvo declarado; ${input.counts.shortlist} entraram no artigo.`]
    : [];

  const estado = input.shortlistStatus && input.shortlistStatus.message
    ? [input.shortlistStatus.message]
    : [];

  const produtos = input.links.map((link, indice) => [
    `${indice + 1}. ${link.productName}`,
    `   - link: ${link.amazonUrl}`,
    `   - âncora sugerida: ${link.suggestedAnchor}`,
    `   - botão sugerido: ${link.suggestedButtonLabel}`,
    `   - onde: ${link.placement}`,
    `   - formato: ${link.linkFormat} · rel: ${link.relPolicy}`,
  ].join("\n"));

  return [
    "# Plano comercial",
    "",
    ...contrato,
    ...(camadas.length ? ["", ...camadas] : []),
    ...(estado.length ? ["", ...estado] : []),
    ...bloco("Comparar por", lista(input.comparisonCriteria)),
    ...bloco("Produtos que entram no artigo", produtos),
    ...(input.disclosureRequired
      ? ["", "## Aviso obrigatório", "", "Este conteúdo usará links monetizados: o aviso de afiliado é obrigatório e precisa aparecer antes do primeiro link."]
      : []),
    "",
    "Os links acima são o endereço limpo do produto. Não acrescente tag de afiliado aqui: quem troca o endereço é a etapa de publicação.",
  ].join("\n").trim();
}

/* ========================= §15 · o brief do redator ========================= */

const secao = (titulo: string, corpo: readonly string[]): string[] =>
  corpo.length ? ["", `# ${titulo}`, "", ...corpo] : [];

/** §15 · o Markdown já pronto entra inteiro, só perdendo o próprio H1. */
const embutir = (markdown: string): string[] =>
  markdown ? markdown.split("\n").slice(1).join("\n").trim().split("\n") : [];

export type RadarWriterBriefInput = {
  dna: RadarPortableArticleDna;
  editorial: RadarPortableEditorial;
  radiography: string;
  strategy: string;
  outline: string;
  seo: string;
  internalLinks: string;
  evidence: string;
  media: string;
  commercial: string;
  limitations: readonly string[];
};

/**
 * ===== §15 · O BRIEF É O PRODUTO CENTRAL =====
 *
 * ==================== POR QUE ELE NÃO É O ESPELHO DAS COLUNAS ====================
 *
 * A versão anterior repetia, em Markdown, o que já estava nas colunas ao lado.
 * Quem consumia o CSV lia duas vezes a mesma coisa; quem colava o brief num LLM
 * recebia um índice em vez de um documento.
 *
 * Aqui ele é AUTOSSUFICIENTE: começa pela missão, entrega o contrato do
 * ArticleDNA, mostra o que a concorrência faz, diz como superá-la, dá título,
 * promessa, estrutura, SEO, links, fontes, mídia, comercial e limitações — e
 * fecha com as regras de quem escreve a partir de um dossiê do Radar.
 *
 * Determinístico de ponta a ponta: dois redatores lendo duas exportações da
 * mesma rodada precisam receber o MESMO contrato.
 */
export function radarWriterBriefMarkdown(input: RadarWriterBriefInput): string {
  const { dna, editorial } = input;
  const assunto = dna.principalKeyword || "o assunto declarado pelo ArticleDNA";

  const missao = [
    `Escreva um conteúdo sobre ${assunto}.`,
    "",
    `Objetivo do leitor: ${editorial.objective || dna.intent || "encontrar respondido o que foi procurar."}`,
    `Resultado esperado: ${editorial.readerPromise || "um conteúdo que cumpre o ArticleDNA e a estrutura recomendada abaixo."}`,
    `Formato: ${editorial.blueprintType}${editorial.editorialOutput ? ` · ${editorial.editorialOutput}` : ""}`,
  ];

  const contrato = [
    `Keyword principal: ${dna.principalKeyword || "não resolvida"}`,
    `Secundárias: ${dna.secondaryKeywords.length ? emLinha(dna.secondaryKeywords) : "nenhuma declarada"}`,
    ...(dna.narrativeReinforcements.length ? [`Reforços narrativos: ${emLinha(dna.narrativeReinforcements)}`] : []),
    `Intenção: ${dna.intent || "não declarada"}`,
    ...(dna.funnel ? [`Etapa do funil: ${dna.funnel}`] : []),
    `Papel no silo: ${dna.siloRole || "não declarado"}${dna.silo ? ` (silo ${dna.silo})` : ""}`,
    "",
    ...(dna.mustCover.length
      ? ["Obrigatório cobrir:", ...lista(dna.mustCover)]
      : ["Nenhum assunto obrigatório foi declarado pelo ArticleDNA."]),
    ...(dna.protectedDecisions.length ? ["", "Decisões protegidas — não altere:", ...lista(dna.protectedDecisions)] : []),
  ];

  /*
   * §9 · O TÍTULO AUSENTE É DITO, e não preenchido com moldura.
   *
   * "Skin care noturno: skin care noturno" ocupava este campo. Um campo vazio
   * com a razão ao lado é mais útil: quem escreve sabe que precisa formular, em
   * vez de copiar uma frase que não decide nada.
   */
  const titulo = [
    editorial.title
      ? `Título de trabalho: ${editorial.title}`
      : "O blueprint não produziu um título utilizável para este artigo: formule a partir da promessa e da estrutura abaixo.",
    ...(editorial.alternateTitles.length ? ["", "Direções alternativas:", ...lista(editorial.alternateTitles)] : []),
    ...(editorial.readerPromise ? ["", `Promessa ao leitor: ${editorial.readerPromise}`] : []),
    ...(editorial.openingOrHook ? ["", `Abertura: ${editorial.openingOrHook}`] : []),
    ...(editorial.conclusion ? ["", `Fechamento: ${editorial.conclusion}`] : []),
    ...(editorial.cta ? [`Chamada final: ${editorial.cta}`] : []),
  ];

  /*
   * ===== AS REGRAS SÃO FIXAS, E É POR ISSO QUE ELAS FUNCIONAM =====
   *
   * Elas não descrevem este artigo: descrevem o contrato de escrever a partir
   * de um dossiê do Radar. Variá-las por artigo faria cada brief ensinar uma
   * disciplina diferente.
   */
  const regras = lista([
    "não copiar concorrentes — a radiografia é insumo, nunca modelo de texto;",
    "não inventar evidência, número, data, preço, benefício ou citação;",
    "preservar a intenção declarada e a keyword principal;",
    "cumprir tudo o que está em MUST_COVER;",
    "usar a keyword com naturalidade, sem repetição forçada;",
    "respeitar as dependências de fonte antes de afirmar;",
    "respeitar as necessidades de revisão profissional;",
    "aplicar somente os links internos planejados;",
    "respeitar as limitações — o que a coleta não alcançou não vira afirmação;",
    "sinalizar qualquer dependência que continue sem resolução.",
  ]);

  return [
    ...secao("MISSÃO", missao),
    ...secao("ARTICLE DNA", contrato),
    ...secao("RADIOGRAFIA COMPETITIVA", embutir(input.radiography)),
    ...secao("ESTRATÉGIA PARA SUPERAR A SERP", embutir(input.strategy)),
    ...secao("TÍTULO E PROMESSA", titulo),
    ...secao("ESTRUTURA COMPLETA", embutir(input.outline)),
    ...secao("SEO", embutir(input.seo)),
    ...secao("LINKS INTERNOS", embutir(input.internalLinks)),
    ...secao("FONTES E EVIDÊNCIAS", embutir(input.evidence)),
    ...secao("PLANO VISUAL E DE VÍDEO", embutir(input.media)),
    ...secao("COMERCIAL", embutir(input.commercial)),
    ...secao("LIMITAÇÕES", lista(input.limitations)),
    ...secao("REGRAS PARA O REDATOR", regras),
  ].join("\n").trim();
}

/**
 * §17 · O PROMPT EXTERNO — curto de propósito.
 *
 * Duplicar o brief aqui daria duas fontes para a mesma coisa, e elas
 * divergiriam na primeira edição. O prompt aponta para o brief; o brief é o
 * contrato.
 */
export const RADAR_EXTERNAL_WRITER_PROMPT = [
  "Você receberá um dossiê editorial produzido pelo Minerador Key.",
  "",
  "Use writer_brief_md como contrato editorial. Escreva o conteúdo completo obedecendo ao ArticleDNA, à intenção, à estrutura e às evidências.",
  "",
  "Não invente fatos. Quando uma dependência não estiver resolvida, não a transforme em afirmação factual.",
  "",
  "Não copie concorrentes. Use a radiografia competitiva para produzir uma resposta mais completa e clara.",
].join("\n");

/* ========================= a montagem da linha ========================= */


export type RadarPortableExportInput = {
  profile: RadarResearchProfile;
  blueprintView: RadarCompetitiveBlueprintView;
  exportedAt: string;
  article: {
    principalKeyword: string | null;
    secondaryKeywords: readonly string[];
    narrativeReinforcements: readonly string[];
    intent: string | null;
    funnel: string | null;
    siloName: string | null;
    articleRole: string | null;
    slug: string | null;
    canonical?: string | null;
    contentType?: string | null;
    audience?: string | null;
    promise?: string | null;
    publishedProtected?: boolean;
    /** §5 do addendum · o que o Arquiteto travou. Nunca reescrito de fora. */
    protectedFields?: readonly string[];
    mustCover: readonly string[];
  };
  /** O MODEL OUTPUT do perfil. Um dos dois, nunca os dois. */
  articleModel?: RadarEditorialArticleModel | null;
  profileModel?: RadarEditorialProfileModel | null;
  /** A fotografia do pipeline do Google, quando o perfil é GOOGLE. */
  googleObserved?: RadarCompetitiveObservedModel | null;
  /** §3 · o contexto resolvido, de onde sai o DNA das keywords. */
  researchContext?: RadarArticleResearchContext | null;
  /** §8 · o universo da corrida de YouTube, quando existe. */
  youtubeUniverse?: readonly RadarYoutubeUniverseEntry[];
  /** As consultas da corrida — é delas que sai o TEXTO buscado. */
  youtubeQueries?: ReadonlyArray<{ queryId: string; text: string }>;
  /** §16 · a prateleira observada e a configuração comercial. */
  amazon?: { setup: RadarAmazonEditorialSetup | null; universe: readonly RadarAmazonUniverseEntry[] } | null;
  commercial?: RadarPortableCommercial | null;
  /** §9 · a biblioteca de vídeos da marca, casada com as pautas. */
  videoContext?: RadarPortableVideoContext | null;
  /** §10 · as contribuições do especialista, já revisadas. */
  specialistContext?: RadarPortableSpecialistContext | null;
  internalLinks?: readonly string[];
  /** As limitações da investigação congelada, que valem para os três perfis. */
  researchLimitations?: readonly string[];
};

/**
 * ===== A LINHA DO DOSSIÊ EDITORIAL — 1.2 · §1 =====
 *
 * ==================== DUAS CAMADAS, NÃO UMA ESCOLHA ====================
 *
 * O WRITING BRIEF é a decisão editorial condensada; o EVIDENCE PACK é a
 * evidência estruturada que a sustenta. O 1.1 entregou só a primeira, e quem
 * escrevia, ao topar com uma afirmação que não entendeu, não tinha para onde
 * olhar. §1 é explícito: precisamos dos dois.
 *
 * Nenhuma coluna de identidade técnica (§3 do 1.1): `article_id`, `brand_id`,
 * `bundle_hash` e `article_dna_version_id` continuam no banco, que é onde eles
 * têm função. Quem escreve identifica o artigo pela keyword e pelo slug.
 */
export function buildRadarPortableExportRow(input: RadarPortableExportInput): RadarPortableExportRow {
  const blueprint = input.blueprintView.blueprint;

  const editorial = radarPortableEditorialOf({
    profile: input.profile,
    principalKeyword: input.article.principalKeyword,
    articleModel: input.articleModel,
    profileModel: input.profileModel,
  });

  const dna = radarPortableArticleDna({
    principalKeyword: input.article.principalKeyword,
    secondaryKeywords: input.article.secondaryKeywords,
    narrativeReinforcements: input.article.narrativeReinforcements,
    intent: input.article.intent,
    funnel: input.article.funnel,
    silo: input.article.siloName,
    siloRole: input.article.articleRole,
    mustCover: input.article.mustCover,
    slug: input.article.slug,
    publishedProtected: Boolean(input.article.publishedProtected),
    internalLinkRequirements: input.internalLinks || [],
  });

  /* ===================== o EVIDENCE PACK ===================== */

  const keywords = radarPortableKeywordsDna(input.researchContext ?? null);
  const keywordsMd = radarKeywordsContextMarkdown(keywords);

  const serp = radarPortableSerpEvidence({
    observed: input.googleObserved ?? null,
    blueprint,
    articleModel: input.articleModel ?? null,
  });
  const serpSources = radarPortableSerpSources(input.googleObserved ?? null);
  const externalSources = radarPortableExternalSources(input.googleObserved ?? null);
  const internalLinks = radarPortableInternalLinks({ observed: input.googleObserved ?? null, blueprint });

  const youtube = radarPortableYoutubeEvidence({
    universe: input.youtubeUniverse || [],
    queries: input.youtubeQueries || [],
    blueprint,
  });

  const amazon = radarPortableAmazonEvidence({
    setup: input.amazon?.setup ?? input.commercial?.setup ?? null,
    blueprint,
    universe: input.amazon?.universe || [],
    counts: input.commercial?.counts ?? null,
    comparisonCriteria: input.commercial?.comparisonCriteria || editorial.comparisonCriteria,
  });

  const video = input.videoContext ?? radarPortableVideoContext(null);
  const especialista = input.specialistContext ?? radarPortableSpecialistContext(null);

  /*
   * §12 · A EVIDÊNCIA AMARRADA À SEÇÃO QUE ELA SUSTENTA.
   *
   * Vídeo e especialista entram por SEÇÃO, e não como anexo solto: é a única
   * forma de quem escreve o terceiro H2 saber que existe um trecho de vídeo
   * exatamente para ele.
   */
  const secoesDoArtigo = radarPortableFlatSections(editorial.sections);

  /*
   * ===== A PAUTA DE VÍDEO NOMEIA A SEÇÃO COMO ELA ERA, NÃO COMO ELA FICOU =====
   *
   * A seção relacionada da pauta é congelada com a investigação e guarda a formulação
   * observada — "Rotina de cuidados para pele oleosa". O artigo-modelo
   * reformula o cabeçalho para não copiar concorrente, e vira "O que
   * considerar sobre rotina de cuidados para pele oleosa?".
   *
   * Casar por igualdade literal perderia todo trecho de vídeo no caminho — e
   * perderia em silêncio, com a seção dizendo que não há apoio audiovisual
   * exatamente onde ele existe.
   */
  const genericas = new Set(palavrasDeConteudo(input.article.principalKeyword || ""));

  const casaComSecao = (titulo: string | null): RadarPortableSection | null => {
    const alvo = palavrasDeConteudo(titulo || "");
    if (alvo.size < 2) return null;

    /*
     * ===== A PALAVRA QUE DISTINGUE PRECISA SER COMPARTILHADA =====
     *
     * "pele oleosa" é o assunto do artigo INTEIRO: casar por ele faria toda
     * pauta cair na primeira seção. O que aproxima duas formulações da mesma
     * necessidade é o que elas acrescentam ao assunto — `rotina`, `cuidados`,
     * `explica`. É a mesma disciplina que o artigo-modelo aplica ao decidir o
     * que o ArticleDNA realmente exige.
     */
    const distintivas = [...alvo].filter(palavra => !genericas.has(palavra));
    if (!distintivas.length) return null;

    let melhor: { secao: RadarPortableSection; pontos: number } | null = null;
    for (const secao of secoesDoArtigo) {
      const cabecalho = palavrasDeConteudo(`${secao.heading} ${secao.objective}`);
      if (!distintivas.some(palavra => cabecalho.has(palavra))) continue;
      const pontos = [...alvo].filter(palavra => cabecalho.has(palavra)).length;
      if (pontos >= Math.ceil(alvo.size / 2) && (!melhor || pontos > melhor.pontos)) melhor = { secao, pontos };
    }
    return melhor?.secao || null;
  };

  const videoPorSecao = new Map<string, string[]>();
  for (const brief of video.briefs) {
    const secao = casaComSecao(brief.relatedSection);
    if (!secao) continue;
    videoPorSecao.set(secao.heading, [
      ...(videoPorSecao.get(secao.heading) || []),
      ...brief.extracts.map(item => `"${item.text}" — ${item.sourceTitle} (${item.startLabel}–${item.endLabel})`),
    ]);
  }

  const especialistaPorSecao = new Map<string, string[]>();
  for (const item of especialista.items) {
    /*
     * A APLICAÇÃO EDITORIAL NOMEIA O PONTO, e o ponto nomeia a necessidade.
     *
     * "Responder ao ponto: Por que a pele fica oleosa?" e a pergunta do
     * requisito são duas formulações da mesma coisa. Tentar as duas é o que
     * evita perder a contribuição quando uma delas foi escrita de outro jeito.
     */
    const secaoAlvo = casaComSecao(item.appliesTo) || casaComSecao(item.requirementQuestion);
    if (!secaoAlvo) continue;
    especialistaPorSecao.set(secaoAlvo.heading, [
      ...(especialistaPorSecao.get(secaoAlvo.heading) || []),
      item.contribution,
    ]);
  }

  const sectionEvidence = radarPortableSectionEvidence({
    editorial,
    articleModel: input.articleModel ?? null,
    serp,
    videoBySection: videoPorSecao,
    specialistBySection: especialistaPorSecao,
  });

  /* ===================== identidade, SEO e visual ===================== */

  const identidade = radarPortableArticleIdentity({
    dna,
    editorial,
    profile: input.profile,
    slug: input.article.slug,
    canonical: input.article.canonical ?? null,
    contentType: input.article.contentType ?? null,
    audience: input.article.audience ?? null,
    promise: input.article.promise ?? null,
    published: Boolean(input.article.publishedProtected),
    outboundRelations: internalLinks.length,
    inboundRelations: input.googleObserved?.internalLinkPlan.incoming.length ?? 0,
  });

  const seo = radarPortableSeoMetadata({
    editorial, dna, blueprint,
    slug: input.article.slug,
    canonical: input.article.canonical ?? null,
    protectedFields: input.article.protectedFields || [],
  });

  const visual = radarPortableVisualPlan({
    editorial, blueprint,
    principalKeyword: input.article.principalKeyword,
    articleTitle: editorial.title,
    promise: input.article.promise ?? editorial.readerPromise,
    hasVideoBlueprint: input.profile === "YOUTUBE",
  });

  /* ===================== as sínteses ===================== */

  const limitacoes = radarPortableActionableLimitations([
    ...(input.researchLimitations || []),
    ...(blueprint?.limitations || []),
    ...editorial.limitations,
    ...(youtube?.limitations || []),
  ]);

  const radiografia = radarCompetitiveRadiographyMarkdown({
    blueprint,
    observed: input.googleObserved,
    sampleLabel: input.blueprintView.sample.label,
    sampleCount: input.blueprintView.sample.count,
  });

  const estrategia = radarSerpOutperformanceStrategyMarkdown({
    blueprint,
    observed: input.googleObserved,
    editorial,
    mustCover: input.article.mustCover,
  });

  const outline = radarOutlineMarkdown(editorial.sections);
  const seoMd = radarSeoRequirementsMarkdown({ dna, editorial, blueprint });
  const linksMd = radarInternalLinksResolvedMarkdown(internalLinks);
  const evidencia = radarEvidenceAndSourcesMarkdown({ editorial, blueprint, limitations: limitacoes });
  const comercial = input.commercial ? radarCommercialPlanMarkdown(input.commercial) : "";
  const identidadeMd = radarArticleIdentityMarkdown(identidade);
  const seoMetadataMd = radarSeoMetadataMarkdown(seo);
  const visualMd = radarVisualPlanMarkdown(visual);
  const visualIdentidadeMd = radarVisualIdentityMarkdown({
    editorial, dna, profile: input.profile, audience: input.article.audience ?? null,
  });
  const videoMd = radarVideoContextMarkdown(video);
  const especialistaMd = radarSpecialistContextMarkdown(especialista);
  const serpEvidenciaMd = radarSerpEvidenceMarkdown(serp);
  const secaoEvidenciaMd = radarSectionEvidenceMarkdown(sectionEvidence);
  const fontesMd = radarSourcesMarkdown({ serpSources, externalSources });

  const brief = radarWriterBriefMarkdown({
    dna,
    editorial,
    radiography: radiografia,
    strategy: estrategia,
    outline,
    seo: seoMd,
    internalLinks: linksMd,
    evidence: evidencia,
    media: visualMd,
    commercial: comercial,
    limitations: limitacoes,
  });

  const naoAfirmar = radarCannotAssertFrom({
    limitations: limitacoes,
    hasVideoLibrary: video.state === "MATCHED" && video.summary.extracts > 0,
    hasSpecialist: especialista.state === "RECEIVED",
    profile: input.profile,
    amazonEnrichmentGaps: amazon?.requiresEnrichment || [],
  });

  const contexto = radarWriterContextMarkdown({
    articleIdentity: identidadeMd,
    seoMetadata: seoMetadataMd,
    articleDna: [
      dna.mustCover.length ? `Obrigatório cobrir:\n${dna.mustCover.map(item => `- ${item}`).join("\n")}` : "Nenhum assunto obrigatório foi declarado pelo ArticleDNA.",
      dna.protectedDecisions.length ? `\nDecisões protegidas — não altere:\n${dna.protectedDecisions.map(item => `- ${item}`).join("\n")}` : "",
    ].join("\n"),
    keywords: keywordsMd,
    intent: dna.intent ? `${dna.intent}${serp.intent?.note ? ` — ${serp.intent.note}` : ""}` : null,
    outline,
    radiography: radiografia,
    strategy: estrategia,
    serpEvidence: serpEvidenciaMd,
    sectionEvidence: secaoEvidenciaMd,
    sources: fontesMd,
    internalLinks: linksMd,
    visualIdentity: visualIdentidadeMd,
    visualPlan: visualMd,
    video: videoMd,
    specialist: especialistaMd,
    commercial: comercial,
    limitations: limitacoes,
    cannotAssert: naoAfirmar,
    writingRules: RADAR_WRITING_RULES,
  });

  const linha: RadarPortableExportRow = {
    /* A identidade humana do artigo. Nenhum id, nenhum hash (§3 do 1.1). */
    keyword_principal: texto(dna.principalKeyword),
    secondary_keywords: emLinha(dna.secondaryKeywords),
    intent: texto(dna.intent),
    funnel: texto(dna.funnel),
    silo: texto(dna.silo),
    article_role: texto(dna.siloRole),
    slug: texto(input.article.slug),
    canonical: texto(input.article.canonical),

    research_profile: input.profile,
    editorial_output: texto(editorial.editorialOutput),

    suggested_title: texto(editorial.title),
    alternate_titles: emLinha(editorial.alternateTitles),
    reader_promise: texto(editorial.readerPromise),
    must_cover: emLinha(dna.mustCover),

    /* ===== 1.2A · a identidade da página ===== */
    article_identity_md: identidadeMd,
    article_identity_json: json(identidade),
    seo_metadata_md: seoMetadataMd,
    seo_metadata_json: json(seo),

    /* ===== o WRITING BRIEF — a decisão editorial condensada ===== */
    outline_md: outline,
    competitive_radiography_md: radiografia,
    serp_outperformance_strategy_md: estrategia,
    seo_requirements_md: seoMd,
    internal_links_md: linksMd,
    evidence_and_sources_md: evidencia,
    source_needs_md: editorial.sourceNeeds.length ? ["# Precisa de fonte", "", ...editorial.sourceNeeds.map(item => `- ${item}`)].join("\n") : "",
    specialist_needs_md: editorial.specialistNeeds.length ? ["# Precisa de revisão profissional", "", ...editorial.specialistNeeds.map(item => `- ${item}`)].join("\n") : "",
    limitations_md: radarLimitationsMarkdown(limitacoes),
    writer_brief_md: brief,

    /* ===== 1.2A · a identidade e o plano visual ===== */
    visual_identity_md: visualIdentidadeMd,
    visual_plan_md: visualMd,
    /* §22 · ausência EXPLÍCITA:  legível, e não uma célula em branco. */
    cover_image_plan_json: JSON.stringify(visual.cover),
    respite_images_plan_json: json(visual.respite),
    visual_evidence_json: json(visual.evidence),

    /* ===== o EVIDENCE PACK — a evidência que sustenta o brief ===== */
    keywords_context_md: keywordsMd,
    keywords_dna_json: json(keywords),
    serp_evidence_json: json(serp),
    serp_sources_json: json(serpSources),
    section_evidence_json: json(sectionEvidence),
    external_sources_json: json(externalSources),
    internal_links_resolved_json: json(internalLinks),
    video_context_md: videoMd,
    video_context_json: json(video),
    specialist_context_md: especialistaMd,
    specialist_context_json: json(especialista),

    /* ===== §18 · a célula que se cola inteira em outra IA ===== */
    writer_context_md: contexto,
    external_writer_prompt_md: RADAR_EXTERNAL_WRITER_PROMPT,

    /* §18 do 1.1 · o apoio de automação. */
    article_dna_compact_json: json(dna),
    outline_json: json(editorial.sections),

    exported_at: input.exportedAt,
  };

  /* §8 · as colunas audiovisuais, só onde a pesquisa de vídeo existe. */
  if (youtube) linha.video_evidence_json = json(youtube);

  /*
   * ===== §16 · AS COLUNAS COMERCIAIS, SÓ NO PERFIL COMERCIAL =====
   *
   * Um artigo de vídeo com `promotion_links = []` sugeriria que os links foram
   * considerados e não encontrados. Eles não se aplicam.
   */
  if (input.commercial) {
    linha.commercial_plan_md = comercial;
    linha.selected_products_json = json(input.commercial.products);
    linha.promotion_links_json = json(input.commercial.links);
  }
  if (amazon) linha.amazon_evidence_json = json(amazon);

  return linha;
}
