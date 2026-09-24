import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import { resolveRadarCanonicalDossier } from "../lib/server/radar-canonical-dossier.ts";
import { radarPortableUsableStatement } from "../lib/radar/portable-read-model.ts";
import {
  RADAR_EXTERNAL_WRITER_PROMPT,
  buildRadarPortableExportRow,
  radarPortableActionableLimitations,
  radarPortableExportCsv,
  type RadarPortableExportInput,
  type RadarPortableExportRow,
} from "../lib/radar/portable-export.ts";
import { radarPortableExportDossierGapsInput } from "../lib/radar/portable-export-batch.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarEditorialProfileModel } from "../lib/radar/editorial-profile-model.ts";

/*
 * ===== RADAR_PORTABLE_EXPORT_1.1 · DOSSIÊ EDITORIAL, NÃO DUMP DE BANCO =====
 *
 * ==================== O QUE MUDOU, E POR QUÊ ====================
 *
 * O CSV do 1.0 era tecnicamente fiel ao domínio e inútil para escrever: 68
 * colunas, o payload inteiro do ArticleDNA, bundleId, bundleHash, versionId,
 * contentHash, e a mesma estrutura de seções repetida em três colunas com
 * nomes diferentes.
 *
 * Uma linha agora precisa responder sozinha: o que vamos escrever, para quem,
 * o que a concorrência faz, o que falta no mercado, qual estrutura usar, o que
 * cada seção resolve, que evidência sustenta cada parte, o que precisa de
 * fonte, e o que não pode ser inventado.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ==================== a bancada do Google: uma investigação real ==================== */

/*
 * A BANCADA É A MESMA DAS SUÍTES DO GOOGLE — de propósito.
 *
 * Inventar uma forma de página aqui testaria a minha fantasia do contrato de
 * extração, e não o dossiê que sai do pipeline real.
 */
const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
});

const PAGINAS = Array.from({ length: 12 }, (_, indice) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (indice < 9) headings.push("Por que a pele fica oleosa?");
  if (indice < 8) headings.push("Rotina de cuidados para pele oleosa");
  return pagina(`A${indice}`, headings);
});

const contextoDoGoogle = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, kgrScore: 0.589, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU" } },
    resolution: "FULL",
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

/** A MESMA passagem que a aba do Radar renderiza. */
const vistaDoGoogle = () => buildRadarDeepResearchView({
  context: contextoDoGoogle(),
  snapshot: { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  observedAt: "2026-09-10T12:00:00.000Z",
});

const vistaCompetitivaDoGoogle = () => radarCompetitiveBlueprintViewOfAnalysis({
  profile: "GOOGLE",
  articleId: "a1",
  articleDnaVersionId: "d1",
  articleDnaContentHash: "hash",
  frozen: null, liveBlueprint: null, liveMultimodal: null, primaryKeyword: "skincare para pele oleosa",
  googleObserved: vistaDoGoogle().observed,
  googleFrozenAt: "2026-09-10T13:00:00.000Z",
  serpSnapshotId: "serp-9",
  generatedAt: "2026-09-17T12:00:00.000Z",
});

/*
 * `extra` (2026-09-23): as entradas opcionais das colunas novas. Sem elas, as
 * colunas novas não existem e a linha só difere da de antes nas regras de
 * paridade com o Redator (em `writer_context_md` e `writer_brief_md`), que
 * entram sempre — é o resto que as travas abaixo continuam provando.
 */
const linhaDoGoogle = (extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportRow => {
  const vista = vistaDoGoogle();
  return buildRadarPortableExportRow({
    profile: "GOOGLE",
    blueprintView: vistaCompetitivaDoGoogle(),
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "skincare para pele oleosa",
      secondaryKeywords: ["cuidados pele oleosa"],
      narrativeReinforcements: [],
      intent: "Informacional",
      funnel: "Topo",
      siloName: "skincare",
      articleRole: "SUPORTE",
      slug: "skincare-pele-oleosa",
      mustCover: ["identificação da pele oleosa"],
    },
    articleModel: vista.articleModel,
    googleObserved: vista.observed,
    internalLinks: ["suporta: rotina de skincare"],
    researchLimitations: vista.observed.limitations,
    ...extra,
  });
};

/* ==================== a bancada audiovisual e a comercial ==================== */

const modeloDePerfil = (patch: Partial<RadarEditorialProfileModel> = {}): RadarEditorialProfileModel => ({
  kind: "COMMERCIAL",
  profile: "AMAZON",
  articleIdentity: {
    articleId: "artigo-1", articleDnaVersionId: "dna-v7",
    principalKeyword: "sérum nivea", intentLabel: "Investigação comercial", siloRole: "SUPORTE",
  },
  editorialOutput: "TOP_VALUE",
  workingTitle: "Os 6 sérum nivea com melhor custo-benefício",
  alternateTitleDirections: ["Sérum nivea: o que compensa em cada faixa de preço"],
  objective: "Dar critério de escolha",
  promise: "Ao final, o leitor sabe o que se ganha em cada faixa.",
  hook: null,
  blocks: [{
    id: "b1", order: 1, heading: "Como avaliamos custo-benefício",
    objective: "Explicar a relação preço/reputação.",
    coveragePoints: ["relação entre preço e nota"],
    function: "Bloco comercial", evidenceStrength: "MODERATE",
    mustCoverReasons: ['O ArticleDNA declara "tipos de sérum".'],
    sourceNeeded: null, specialistRequired: null, visualOpportunity: null,
    sourceSignal: "Bandas derivadas do universo observado.",
  }],
  conclusion: "Fechar indicando o que compensa em cada faixa.",
  cta: "Levar o leitor a comparar antes de decidir",
  derived: [{ id: "c1", label: "1. NIVEA Q10 Sérum", detail: "Nota 4,8 com 835 avaliações.", sourceSignal: "Selecionado por custo-benefício." }],
  derivedLabel: "Candidatos selecionados",
  articleApplication: [],
  seoApplication: ["Cobrir as buscas relacionadas na seção comercial"],
  evidenceNeeds: [],
  specialistNeeds: [],
  limitations: ["Benefícios e atributos do PDP não foram lidos nesta investigação."],
  readiness: { state: "READY", label: "Pronto para o Planejador", reasons: [] },
  promotionLinks: [{
    asin: "B0DBRR5BP4", productName: "NIVEA Q10 Sérum Antissinais Expert Dupla Ação 30ml",
    amazonUrl: "https://www.amazon.com.br/dp/B0DBRR5BP4",
    suggestedAnchor: "NIVEA Q10 Sérum Antissinais Expert Dupla Ação 30ml",
    suggestedButtonLabel: "Ver preço na Amazon",
    placement: "Na posição 1 da lista.", linkFormat: "BUTTON",
    affiliateReady: true, relPolicy: "sponsored nofollow",
  }],
  affiliateDisclosureRequired: true,
  comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
  shortlistStatus: { state: "OK", desired: 6, available: 6, message: null, fixHint: null },
  ...patch,
} as RadarEditorialProfileModel);

const SETUP = {
  intent: { type: "TOP_VALUE", desiredCount: 6, useCase: null, rankingCriteria: "melhor custo-benefício" },
  target: { type: "CATEGORY", categoryQuery: "serum nivea", productClass: "sérum", brandFilter: "nivea", brand: null, line: null, products: [] },
  declaredAt: "2026-09-16T10:00:00.000Z",
  declaredBy: "user-1",
} as never;

const linhaComercial = (patch: Record<string, unknown> = {}): RadarPortableExportRow =>
  buildRadarPortableExportRow({
    profile: "AMAZON",
    blueprintView: { blueprint: null, sample: { label: "produto(s)", count: 59 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "sérum nivea",
      secondaryKeywords: ["sérum antissinais"],
      narrativeReinforcements: [],
      intent: "Investigação comercial",
      funnel: "Meio",
      siloName: "skincare",
      articleRole: "SUPORTE",
      slug: "serum-nivea",
      mustCover: ["tipos de sérum"],
    },
    profileModel: modeloDePerfil(),
    commercial: {
      setup: SETUP,
      counts: { observed: 59, eligible: 9, shortlist: 6 },
      products: modeloDePerfil().promotionLinks.map(item => ({ asin: item.asin, productName: item.productName })),
      links: modeloDePerfil().promotionLinks,
      comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
      disclosureRequired: true,
      shortlistStatus: { state: "OK", desired: 6, available: 6, message: null, fixHint: null },
    },
    researchLimitations: ["A coleta da prateleira não traz texto de avaliação."],
    ...patch,
  });

/** O sintoma real do CSV: título e promessa que só repetem a keyword. */
const linhaDeVideo = (patch: Partial<RadarEditorialProfileModel> = {}): RadarPortableExportRow =>
  buildRadarPortableExportRow({
    profile: "YOUTUBE",
    blueprintView: { blueprint: null, sample: { label: "vídeo(s)", count: 38 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "skin care noturno",
      secondaryKeywords: [],
      narrativeReinforcements: [],
      intent: "Informacional",
      funnel: "Topo",
      siloName: "skincare",
      articleRole: "SUPORTE",
      slug: "skin-care-noturno",
      mustCover: ["ordem da rotina noturna"],
    },
    profileModel: modeloDePerfil({
      kind: "VIDEO", profile: "YOUTUBE",
      workingTitle: "Skin care noturno: skin care noturno",
      alternateTitleDirections: ["Skin care noturno: a ordem que evita irritação"],
      promise: "Ao final, o espectador sabe skin care noturno.",
      hook: "Abra pela dúvida de quem já tem produto em casa e não sabe a ordem.",
      promotionLinks: [], affiliateDisclosureRequired: false,
      articleApplication: [{ piece: "VIDEO_HERO", placement: "Abertura", role: "Mostrar a ordem" }] as never,
      ...patch,
    }),
    researchLimitations: ["Nenhum vídeo foi assistido ou transcrito."],
  });

/* ================================ §1 e §23 ================================ */

test("§1 e §23 · a barra tem UM botão Exportar, com os dois produtos dentro", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const barra = pagina.slice(pagina.indexOf("const renderTopbarActions"), pagina.indexOf("const openDetail"));

  /*
   * DOIS BOTÕES OBRIGAM A DECIDIR ANTES DE SABER QUE HÁ ESCOLHA.
   *
   * E o primeiro rótulo — "Exportar" — reivindicava o verbo inteiro para um dos
   * dois produtos, deixando o outro parecendo um formato alternativo.
   */
  const botoesDeExport = [...barra.matchAll(/data-testid="radar-export-[a-z-]+"/g)].map(item => item[0]);
  /*
   * 2026-09-23 · O MENU GANHOU UM TERCEIRO PRODUTO, E ELE VEM PRIMEIRO.
   *
   * O dono do produto pediu o export por SILO como recomendação: o CSV é a
   * saída final para escrever fora da plataforma, e um artigo de silo escrito
   * sozinho perde a ordem, o Pilar e os irmãos. A trava continua sendo "um
   * botão Exportar, com os produtos dentro" — o que mudou foi a contagem de
   * produtos (3 itens + o menu), e não a regra de um botão só na barra.
   */
  /*
   * 2026-09-23 · O CARD "EXPORTAR PARA ESCREVER".
   *
   * O dono do produto achou o menu bagunçado e aprovou um card: escolha de
   * escopo, um botão "Exportar CSV" (sempre no formato para escrever) e um
   * "Avançado (auditoria)" com o formato técnico e a planilha da tela. A trava
   * continua a mesma — um botão Exportar na barra, com os produtos dentro —;
   * mudaram as marcas dos caminhos de clique.
   */
  assert.deepEqual([...botoesDeExport].sort(), [
    'data-testid="radar-export-avancado"',
    'data-testid="radar-export-avancado-toggle"',
    'data-testid="radar-export-csv"',
    'data-testid="radar-export-dossiers-tecnico"',
    'data-testid="radar-export-escopo"',
    'data-testid="radar-export-escopo-selecionados"',
    'data-testid="radar-export-escopo-silo"',
    'data-testid="radar-export-grid"',
    'data-testid="radar-export-menu"',
    'data-testid="radar-export-painel"',
    'data-testid="radar-export-resumo-selecao"',
    'data-testid="radar-export-resumo-silo"',
    'data-testid="radar-export-silos-tecnico"',
  ], "§23 · o botão da barra e as marcas do card, e nada além disso");
  assert.equal(new Set(botoesDeExport).size, botoesDeExport.length, "§23 · cada marca aparece uma vez só");
  /* Um caminho de export sem marca nova também conta: são quatro cliques que exportam, e só quatro. */
  const cliquesQueExportam = [...barra.matchAll(/onClick=\{\(\) => \{[^\n]*?(?:exportarSilosCompletos|exportarDossiesFinalizados|grid\.exportRows)\(/g)];
  assert.equal(cliquesQueExportam.length, 4, "§23 · Exportar CSV, os dois técnicos e a planilha — nada além disso");
  assert.equal(/Dossiês editoriais finalizados|data-testid="radar-export-silos"|data-testid="radar-export-dossiers"/.test(barra), false,
    "§23 · um item do menu antigo voltou ao card");
  const ordemNoCard = [...barra.slice(barra.indexOf('data-testid="radar-export-menu"')).matchAll(/data-testid="(radar-export-(?:csv|silos-tecnico|dossiers-tecnico|grid))"/g)].map(item => item[1]);
  assert.deepEqual(ordemNoCard, ["radar-export-csv", "radar-export-silos-tecnico", "radar-export-dossiers-tecnico", "radar-export-grid"],
    "2026-09-23 · o botão 'Exportar CSV' vem antes do Avançado");

  /* O rótulo antigo não sobreviveu como botão de topo. */
  assert.equal(/CSV · Dossiês finalizados/.test(barra), false, "§1 · o botão separado continua na barra");

  /* Os produtos estão DENTRO do card, e o card abre por estado próprio. */
  const menu = barra.slice(barra.indexOf('data-testid="radar-export-menu"'));
  assert.match(menu, /Exportar para escrever/);
  assert.match(menu, /Planilha atual/);
  assert.match(menu, /Avançado \(auditoria\)/);
  assert.match(menu, /grid\.exportRows\(grid\.queriedRows, "planilha"\)/);
  assert.match(menu, /void exportarDossiesFinalizados\("full"\)/);
  assert.match(menu, /exportarDossiesFinalizados\("writing"\)/);

  /* §3 do gate anterior continua valendo: o FINALIZE não baixa nada. */
  const finalizar = pagina.slice(pagina.indexOf("const finalizarInvestigacao"), pagina.indexOf("const finalizarInvestigacao") + 3000);
  assert.equal(/radar-export|exportarDossies|\.download =/.test(finalizar), false, "o FINALIZE dispara download");
});

/* ================================ §3 e §4 ================================ */

const TECNICAS = [
  "article_id", "article_dna_version_id", "article_dna_content_hash", "brand_id",
  "bundle_id", "bundle_hash", "evidence_bundle_id", "evidence_bundle_hash",
  "article_dna_json", "blueprint_json", "sections_json", "evidence_summary_json",
  "snapshot_id", "run_id", "version_id", "content_hash",
];

test("§3 · nenhuma coluna de identidade técnica atravessa para o dossiê", () => {
  const colunas = Object.keys(linhaDoGoogle());
  for (const proibida of TECNICAS) {
    assert.equal(colunas.includes(proibida), false, `§3 · coluna técnica no dossiê: ${proibida}`);
  }

  /*
   * A TRAVA É SOBRE O CONTEÚDO, NÃO SÓ SOBRE O NOME DA COLUNA.
   *
   * Tirar `article_dna_json` do cabeçalho e continuar embutindo o payload em
   * outra célula seria o mesmo dump com outro endereço.
   */
  const csv = radarPortableExportCsv([linhaDoGoogle(), linhaComercial()]);
  for (const marca of ["dna-v7", "sha256:", "bundleHash", "articleDnaVersionId", "articleDnaContentHash", "serpSnapshotId"]) {
    assert.equal(csv.includes(marca), false, `§3 · identificador técnico vazou no arquivo: ${marca}`);
  }
});

test("§4 · o ArticleDNA compacto leva o contrato editorial, e nada de id", () => {
  const dna = JSON.parse(linhaComercial().article_dna_compact_json);

  assert.deepEqual(Object.keys(dna).sort(), [
    "funnel", "intent", "internalLinkRequirements", "mustCover", "narrativeReinforcements",
    "principalKeyword", "protectedDecisions", "secondaryKeywords", "silo", "siloRole",
  ]);
  assert.equal(dna.principalKeyword, "sérum nivea");
  assert.deepEqual(dna.mustCover, ["tipos de sérum"]);

  /* As decisões protegidas dizem O QUE é protegido e QUAL é o valor. */
  assert.ok(dna.protectedDecisions.some((item: string) => item.includes("Keyword principal: sérum nivea")));
  assert.ok(dna.protectedDecisions.some((item: string) => item.includes("Slug: serum-nivea")));

  /* E nada de proveniência: ela continua no banco, onde é auditada. */
  assert.equal(/keywordId|versionId|contentHash|kgr|volume/i.test(JSON.stringify(dna)), false);
});

/* ================================ §19 ================================ */

test("§19 · o dossiê cabe numa tela, e cada coluna tem finalidade", () => {
  const comuns = Object.keys(linhaDoGoogle());
  const comerciais = Object.keys(linhaComercial());

  /*
   * ===== O TETO DE 30 COLUNAS CAIU NO 1.2, E CAIU POR DECISÃO =====
   *
   * O 1.1 cortou de 68 para 28 porque as 40 excedentes eram identidade técnica
   * e DTO repetido. O 1.2 voltou a crescer por outro motivo: ele acrescentou o
   * EVIDENCE PACK, e evidência não cabe numa síntese.
   *
   * A regra nunca foi o número — é que cada coluna sirva para ESCREVER ou para
   * AUTOMATIZAR. O que este teste guarda é isso, e não um teto que já cumpriu
   * a função dele.
   */
  assert.ok(comuns.length >= 28, `§19 · ${comuns.length} colunas comuns`);
  assert.ok(comerciais.length > comuns.length, "§19 · o perfil comercial acrescenta colunas próprias");

  /* §18 · Markdown é o produto humano e de LLM; JSON é apoio de automação. */
  const markdown = comuns.filter(item => item.endsWith("_md")).length;
  const json = comuns.filter(item => item.endsWith("_json")).length;
  assert.ok(markdown >= 12, `§18 · ${markdown} colunas de texto`);
  assert.ok(json <= markdown, `§18 · ${json} colunas de JSON contra ${markdown} de texto — o JSON virou o produto`);

  /* E nenhuma coluna existe sem finalidade declarada: ou é texto, ou é dado. */
  const semSufixo = comuns.filter(item => !item.endsWith("_md") && !item.endsWith("_json"));
  assert.deepEqual(semSufixo.sort(), [
    "alternate_titles", "article_role", "canonical", "editorial_output", "exported_at",
    "funnel", "intent", "keyword_principal", "must_cover", "reader_promise",
    "research_profile", "secondary_keywords", "silo", "slug", "suggested_title",
  ], "§19 · coluna sem finalidade editorial nem de automação");

  /*
   * ===== 2026-09-23 · AS COLUNAS NOVAS: TODAS COM SUFIXO, E O JSON NÃO VIRA PRODUTO =====
   *
   * O CSV passou a levar a SERP da investigação, a SERP por lente, a situação
   * da investigação, a autoridade, a estrutura dos concorrentes e o contexto
   * do silo. A regra desta trava não mudou — o que mudou é que ela precisa
   * olhar também a linha COMPLETA, e não só a de antes. Com todas as entradas
   * novas, o conjunto sem sufixo é o MESMO, e o JSON continua sem passar do
   * Markdown.
   */
  const dossie = resolveRadarCanonicalDossier({
    analysis: { versionId: "v3", versionNumber: 3, payload: { finalizedBundle: { frozenAt: "2026-09-10T13:00:00.000Z", limitations: [] }, serpSnapshotId: "serp-9" } } as never,
    article: { brandId: "b", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash" },
    observedAt: "2026-09-17T12:00:00.000Z",
    authorities: { google: vistaDoGoogle(), video: null, specialist: null, researchContext: null },
  });
  assert.equal(dossie.ok, true);
  if (!dossie.ok) return;
  const completa = linhaDoGoogle({
    serpObserved: { snapshot: null, unavailableReason: "A coleta referenciada não está entre as coletas gravadas da marca." },
    serpLenses: { keywords: [{ keyword: "skincare para pele oleosa", role: "principal" }], lookups: [], readFailed: true },
    dossierGaps: radarPortableExportDossierGapsInput({
      analysis: { finalizedBundle: { frozenAt: "2026-09-10T13:00:00.000Z" } },
      profile: "GOOGLE",
      bundle: dossie.dossier.bundle,
      readiness: dossie.dossier.readiness,
      article: { articleDnaVersionId: "d1", articleDnaContentHash: "hash" },
      exportedAt: "2026-09-17T12:00:00.000Z",
    }),
    siloContext: { silo_context_md: "# Contexto do silo\n\nSilo: skincare", silo_context_json: JSON.stringify({ silo: "skincare" }) },
  });
  const colunasCompletas = Object.keys(completa);
  const novas = colunasCompletas.filter(item => !comuns.includes(item));
  assert.deepEqual(novas.sort(), [
    "authority_requirements_md", "competitors_structure_json", "research_status_md",
    "serp_lenses_json", "serp_lenses_md", "serp_observed_json", "serp_observed_md",
    "silo_context_json", "silo_context_md",
  ], "2026-09-23 · as colunas novas são estas nove, e só aparecem com a entrada delas");
  assert.deepEqual(colunasCompletas.filter(item => !item.endsWith("_md") && !item.endsWith("_json")).sort(), semSufixo.sort(),
    "2026-09-23 · coluna nova sem sufixo _md/_json");
  const markdownCompleto = colunasCompletas.filter(item => item.endsWith("_md")).length;
  const jsonCompleto = colunasCompletas.filter(item => item.endsWith("_json")).length;
  assert.ok(jsonCompleto <= markdownCompleto, `§18 · na linha completa, ${jsonCompleto} colunas de JSON contra ${markdownCompleto} de texto`);
});

/* ================================ §7 ================================ */

test("§7 · a radiografia é síntese editorial, e não a contagem da coleta", () => {
  const radiografia = linhaDoGoogle().competitive_radiography_md;

  assert.match(radiografia, /^# Radiografia competitiva/);

  /*
   * "38 vídeos" e "SERP suficiente" são verdades sobre a COLETA. Quem lê fica
   * sabendo que houve pesquisa, e não o que a pesquisa encontrou.
   */
  const secoes = [...radiografia.matchAll(/^## (.+)$/gm)].map(item => item[1]);
  assert.ok(secoes.length >= 4, `§7 · a radiografia tem ${secoes.length} seção(ões)`);
  assert.ok(secoes.some(item => /Intenção observada/.test(item)));
  assert.ok(secoes.some(item => /precisa fazer melhor/.test(item)), "§7 · falta o que fazer diferente");

  /*
   * ===== AS SEÇÕES QUE VÊM DOS SINAIS OBSERVADOS PRECISAM EXISTIR =====
   *
   * "Intenção" e "o que fazer melhor" saem da recomendação, e sobreviveriam a
   * uma radiografia que perdesse TODA a leitura da amostra. O que responde "o
   * que a concorrência faz" são os sinais — e cada um deles viaja com a
   * evidência que o sustenta entre parênteses.
   */
  assert.ok(
    secoes.some(item => /O que os resultados tendem a responder|Padrões de estrutura|Perguntas recorrentes/.test(item)),
    "§7 · a radiografia perdeu a leitura da amostra",
  );
  const comEvidencia = radiografia.split("\n").filter(linha => linha.startsWith("- ") && linha.includes("_("));
  assert.ok(comEvidencia.length >= 3, `§7 · ${comEvidencia.length} observação(ões) com evidência atrás`);

  /* E o conteúdo é o que a amostra real mostrou, não um rótulo genérico. */
  assert.ok(radiografia.includes("pele oleosa"), "§7 · a radiografia não fala do assunto investigado");
  assert.ok(radiografia.length > 400, "§7 · radiografia curta demais para orientar alguém");
});

test("§7 · sem análise, a radiografia diz o que falta — e não finge leitura", () => {
  const semBlueprint = linhaComercial().competitive_radiography_md;
  assert.match(semBlueprint, /ainda não produziu leitura competitiva analisada/);
  assert.match(semBlueprint, /59 produto\(s\) coletado\(s\)/);
});

/* ================================ §8 ================================ */

test("§8 · o Blueprint do Google que a tela mostra é o que o dossiê exporta", () => {
  const vista = vistaDoGoogle();
  const modeloDaTela = vista.articleModel;
  const linha = linhaDoGoogle();

  /*
   * ===== A PARIDADE É ESTRUTURAL, E NÃO UMA COMPARAÇÃO DE VALORES =====
   *
   * O defeito de origem: o modelo competitivo do Google só existia dentro do
   * React, e toda resolução de servidor recebia `undefined`. O CSV saía com
   * título, promessa e estrutura VAZIOS ao lado de uma tela cheia.
   *
   * A correção não foi preencher o CSV: foi fazer o servidor ler a mesma
   * passagem. Este teste prova que o que sai é o que a aba renderiza.
   */
  assert.ok(modeloDaTela.titleSuggestion, "a bancada precisa produzir um blueprint de verdade");
  assert.equal(linha.suggested_title, modeloDaTela.titleSuggestion);
  assert.equal(linha.reader_promise, modeloDaTela.readerPromise);

  /* E a estrutura inteira, na mesma ordem e com a mesma hierarquia. */
  const daTela = modeloDaTela.sections.map(item => item.headingSuggestion);
  for (const heading of daTela) {
    assert.ok(linha.outline_md.includes(`## ${heading}`), `§8 · H2 perdido no export: ${heading}`);
  }
  /* §8 · e nenhum dos campos do defeito continua vazio. */
  for (const coluna of ["suggested_title", "reader_promise", "outline_md", "competitive_radiography_md"]) {
    assert.ok(linha[coluna].length > 0, `§8 · ${coluna} saiu vazio num artigo Google com blueprint`);
  }
});

test("§8 · a rota lê a fotografia do Google pela cadeia de domínio, sem React", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  assert.match(semComentarios, /loadRadarCanonicalAuthorities\(\{/);
  assert.match(semComentarios, /autoridades\.google\?\.articleModel/);

  /*
   * AS AUTORIDADES PRECISAM CHEGAR NA CHAMADA QUE RESOLVE O DOSSIÊ.
   *
   * Informá-las só ao montar a linha do CSV deixaria o dossiê — e o blueprint
   * canônico dentro dele — exatamente como estavam: nulos. Por isso a
   * afirmação é sobre ESTA chamada, e não sobre o arquivo inteiro.
   */
  const inicio = semComentarios.indexOf("resolveRadarCanonicalDossier({");
  assert.notEqual(inicio, -1);
  const resolucao = semComentarios.slice(inicio, semComentarios.indexOf("});", inicio));
  assert.match(resolucao, /authorities: autoridades/,
    "§8 · a resolução canônica não recebe as autoridades do Radar");

  /*
   * A ROTA NÃO PODE REMONTAR O ARTIGO-MODELO.
   *
   * Ela fazia isso com um argumento a mais no builder do blueprint do que a
   * tela usa — e um argumento a mais é tudo o que é preciso para duas leituras
   * da mesma investigação divergirem sem ninguém notar.
   */
  assert.equal(/buildRadarEditorialArticleModel\(/.test(semComentarios), false, "§8 · a rota remonta o artigo-modelo");
  assert.equal(/buildRadarEditorialBlueprint\(/.test(semComentarios), false, "§8 · a rota remonta o blueprint editorial");
});

/* ================================ §9 ================================ */

test("§9 · título e promessa tautológicos não atravessam", () => {
  /* O núcleo da trava, isolado. */
  assert.equal(radarPortableUsableStatement("Skin care noturno: skin care noturno", "skin care noturno"), null);
  assert.equal(radarPortableUsableStatement("Ao final, o espectador sabe skin care noturno.", "skin care noturno"), null);
  assert.equal(
    radarPortableUsableStatement("Skin care noturno: a ordem que evita irritação", "skin care noturno"),
    "Skin care noturno: a ordem que evita irritação",
  );
  /* Sem keyword não há tautologia a detectar, e a frase passa. */
  assert.equal(radarPortableUsableStatement("Qualquer frase", null), "Qualquer frase");

  const linha = linhaDeVideo();

  /*
   * O CAMPO CAI PARA A PRÓXIMA DIREÇÃO UTILIZÁVEL, não para o vazio: o modelo
   * já produziu alternativas, e descartar a tautológica usa o que o Radar
   * apurou em vez de jogar o campo fora.
   */
  assert.equal(linha.suggested_title, "Skin care noturno: a ordem que evita irritação");
  assert.equal(linha.reader_promise, "", "§9 · a promessa tautológica ocupou o campo");

  /* §21 · e o brief continua carregando gancho e roteiro. */
  assert.match(linha.writer_brief_md, /Abertura: Abra pela dúvida/);
  assert.match(linha.outline_md, /## Como avaliamos custo-benefício/);
  assert.match(linha.writer_brief_md, /não produziu um título utilizável|Título de trabalho:/);
});

test("§9 · sem alternativa utilizável, o brief diz que falta título", () => {
  const linha = linhaDeVideo({ alternateTitleDirections: [] });
  assert.equal(linha.suggested_title, "");
  assert.match(linha.writer_brief_md, /O blueprint não produziu um título utilizável/);
});

/* ================================ §10 ================================ */

test("§10 · a Amazon exporta o contrato comercial como orientação, não como objeto", () => {
  const linha = linhaComercial();
  const plano = linha.commercial_plan_md;

  assert.match(plano, /Formato comercial: TOP_VALUE de 6/);
  assert.match(plano, /Tipo de produto: sérum/);
  assert.match(plano, /Marca exigida: nivea/);

  /* As três camadas viram FRASE: "59 · 9 · 6" obrigaria a reconstruir a história. */
  assert.match(plano, /59 produto\(s\); 9 são compatíveis com o alvo declarado; 6 entraram no artigo/);
  assert.match(plano, /aviso de afiliado é obrigatório/);

  /*
   * O PLANO É PROSA — o DTO serializado não volta pela porta dos fundos.
   *
   * O 1.2 acrescentou `amazon_evidence_json`, onde `categoryQuery` e
   * `desiredCount` são EVIDÊNCIA pedida pelo §16. O que continua proibido é o
   * plano de escrita virar objeto, e é sobre ele que a afirmação é feita.
   */
  assert.equal(/\{"|\}\]|"declaredAt"/.test(plano), false, "§10 · o plano comercial despejou objeto");

  /* E quem operou a declaração nunca atravessa: é identidade de usuário. */
  assert.equal(/declaredBy/.test(Object.values(linha).join(" ")), false, "§11 · id de usuário no dossiê");
});

test("§10 · sem shortlist válida não saem produtos nem links", () => {
  const vazio = linhaComercial({
    profileModel: modeloDePerfil({
      promotionLinks: [],
      shortlistStatus: { state: "BLOCKED", desired: 6, available: 0, message: "Nenhum produto compatível com o alvo declarado.", fixHint: "Revise o tipo de produto." },
    }),
    commercial: {
      setup: SETUP,
      counts: { observed: 59, eligible: 0, shortlist: 0 },
      products: [], links: [],
      comparisonCriteria: [],
      disclosureRequired: false,
      shortlistStatus: { state: "BLOCKED", desired: 6, available: 0, message: "Nenhum produto compatível com o alvo declarado.", fixHint: "Revise o tipo de produto." },
    },
  });

  assert.equal(JSON.parse(vazio.selected_products_json).length, 0);
  assert.equal(JSON.parse(vazio.promotion_links_json).length, 0);
  assert.match(vazio.commercial_plan_md, /Nenhum produto compatível com o alvo declarado/);
  assert.equal(/aviso de afiliado é obrigatório/.test(vazio.commercial_plan_md), false);
});

test("§10 · a rota recusa a corrida cuja configuração não é a da fotografia", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  /*
   * A fotografia guarda as CONCLUSÕES, não o universo — então a shortlist
   * precisa ser recalculada sobre a corrida gravada. Se alguém trocou a
   * configuração depois de congelar, a corrida descreve outra investigação, e
   * recalcular sobre ela produziria produtos de um alvo ao lado de um blueprint
   * de outro.
   */
  assert.match(semComentarios, /originalEditorialIntent\?\.setupSignature/);
  assert.match(semComentarios, /radarAmazonSetupSignature\(setup\)/);
  assert.match(semComentarios, /assinaturaCongelada !== assinaturaCorrente/);
});

test("§8 · sem a fotografia do Google, a resolução canônica volta a produzir blueprint nulo", () => {
  const analise = {
    versionId: "v3", versionNumber: 3,
    payload: { finalizedBundle: { frozenAt: "2026-09-10T13:00:00.000Z", limitations: [] }, serpSnapshotId: "serp-9" },
  } as never;
  const fundamento = { brandId: "b", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash" };

  const comFotografia = resolveRadarCanonicalDossier({
    analysis: analise, article: fundamento,
    observedAt: "2026-09-17T12:00:00.000Z",
    authorities: { google: vistaDoGoogle(), video: null, specialist: null, researchContext: null },
  });
  assert.equal(comFotografia.ok, true);
  if (!comFotografia.ok) return;
  assert.ok(comFotografia.dossier.blueprintView.blueprint, "§8 · a fotografia entrou e o blueprint continuou nulo");
  assert.ok(comFotografia.dossier.bundle.observed, "§8 · o dossiê não carrega a fotografia competitiva");

  /*
   * ===== O DEFEITO DE ORIGEM, PRESERVADO COMO CONTRASTE =====
   *
   * Sem a fotografia, a MESMA análise resolve com `blueprint: null`. Era isso
   * que todo consumidor de servidor recebia — e era por isso que o CSV saía
   * vazio ao lado de uma tela cheia. O adapter sempre fez a coisa certa; a
   * entrada é que nunca chegava.
   */
  const semFotografia = resolveRadarCanonicalDossier({
    analysis: analise, article: fundamento,
    observedAt: "2026-09-17T12:00:00.000Z",
  });
  assert.equal(semFotografia.ok, true);
  if (!semFotografia.ok) return;
  assert.equal(semFotografia.dossier.blueprintView.blueprint, null);
});

/* ================================ §11 ================================ */

test("§11 · o H3 continua filho do H2 que o hospeda", () => {
  /*
   * O gate anterior achatava a hierarquia para caber numa coluna de JSON, e o
   * outline saía como uma lista de perguntas soltas. A estrutura É o produto.
   */
  const comFilho = buildRadarPortableExportRow({
    profile: "GOOGLE",
    blueprintView: { blueprint: null, sample: { label: "página(s)", count: 3 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "pele oleosa", secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Informacional", funnel: "Topo", siloName: null, articleRole: null,
      slug: "pele-oleosa", mustCover: [],
    },
    articleModel: {
      titleSuggestion: "Pele oleosa: como reconhecer e cuidar",
      titleAlternatives: [],
      readerPromise: "Ao final, dá para montar a rotina certa.",
      editorialObjective: "Explicar e orientar",
      opening: { hookDirection: "Abra pela dúvida mais comum." },
      conclusion: { synthesis: "Fechar com a rotina.", callToAction: "Aplicar hoje." },
      evidenceNeeds: [], specialistNeeds: [], mediaPlan: [], limitations: [],
      sections: [{
        level: 2, headingSuggestion: "Pele oleosa e acne", objective: "Ligar causa e efeito.",
        readerQuestion: null, keyMessage: null, coveragePoints: ["relação entre sebo e acne"],
        mustCoverReasons: [], evidenceStrength: "STRONG", factualRequirement: null,
        specialistRequirement: null, internalLinks: [], mediaOpportunity: [],
        childSections: [{
          level: 3, headingSuggestion: "O que causa acne?", objective: "Explicar o mecanismo.",
          readerQuestion: null, keyMessage: null, coveragePoints: ["obstrução do folículo"],
          mustCoverReasons: [], evidenceStrength: "MODERATE", factualRequirement: null,
          specialistRequirement: null, internalLinks: [], mediaOpportunity: [], childSections: [],
        }],
      }],
    } as never,
  });

  assert.match(comFilho.outline_md, /^## Pele oleosa e acne$/m);
  assert.match(comFilho.outline_md, /^### O que causa acne\?$/m);
  assert.ok(
    comFilho.outline_md.indexOf("## Pele oleosa e acne") < comFilho.outline_md.indexOf("### O que causa acne?"),
    "§11 · o H3 saiu antes do H2 que o hospeda",
  );

  /* E o JSON de apoio preserva o aninhamento, em vez de achatá-lo. */
  const estrutura = JSON.parse(comFilho.outline_json);
  assert.equal(estrutura[0].children.length, 1);
  assert.equal(estrutura[0].children[0].heading, "O que causa acne?");
});

test("§11 · o outline é Markdown para colar, com objetivo e cobertura", () => {
  const outline = linhaDoGoogle().outline_md;

  assert.match(outline, /^# Estrutura recomendada/);
  assert.match(outline, /^## /m);
  assert.match(outline, /^Objetivo: /m);
  assert.match(outline, /^Cobrir:/m);

  /* O JSON continua ao lado, para automação — mas ele não é o produto. */
  const estrutura = JSON.parse(linhaDoGoogle().outline_json);
  assert.ok(Array.isArray(estrutura) && estrutura.length > 0);
  assert.ok("children" in estrutura[0], "§11 · a hierarquia sobrevive ao JSON de apoio");
});

/* ================================ §12 ================================ */

test("§12 · os requisitos de SEO não carregam telemetria", () => {
  const seo = linhaDoGoogle().seo_requirements_md;

  assert.match(seo, /Keyword principal: skincare para pele oleosa/);
  assert.match(seo, /Intenção a satisfazer: Informacional/);
  assert.match(seo, /## Obrigatório cobrir \(ArticleDNA\)/);

  /*
   * Volume, KGR, posição e contagem de amostra sustentam a DECISÃO e não
   * ajudam a executá-la. Na coluna de requisitos, eles só ocupam espaço.
   */
  for (const telemetria of [/\bKGR\b/i, /\bvolume\b/i, /\bposição \d/i, /\d+ de \d+ páginas/]) {
    assert.equal(telemetria.test(seo), false, `§12 · telemetria nos requisitos: ${telemetria}`);
  }
});

/* ================================ §13 ================================ */

test("§13 · a evidência separa o que sabemos do que precisa de fonte", () => {
  const evidencia = linhaDoGoogle().evidence_and_sources_md;
  const secoes = [...evidencia.matchAll(/^## (.+)$/gm)].map(item => item[1]);

  assert.ok(secoes.length >= 2, `§13 · ${secoes.length} seção(ões) de evidência`);
  assert.ok(
    secoes.some(item => /Precisa de fonte|Evidência forte|Não afirmar/.test(item)),
    "§13 · falta a separação entre o que sustenta e o que pede fonte",
  );

  /*
   * ENDEREÇO INTERNO NÃO DIZ A NINGUÉM O QUE PODE SER AFIRMADO.
   *
   * `amz-preco-faixa`, `goo-entidades` e `bundleHash` são como o sistema se
   * refere ao sinal. O escritor precisa da frase.
   */
  const comercial = linhaComercial().evidence_and_sources_md;
  assert.match(comercial, /## Evidência competitiva/, "§13 · o perfil comercial precisa exercitar a evidência derivada");

  for (const interno of ["bundleHash", "sourceSignal", "amz-", "goo-", "yt-", "concept:", "page:"]) {
    for (const [perfil, texto] of [["GOOGLE", evidencia], ["AMAZON", comercial]] as const) {
      assert.equal(texto.includes(interno), false, `§13 · endereço interno na evidência do ${perfil}: ${interno}`);
    }
  }
});

/* ================================ §14 ================================ */

test("§14 · só limitação acionável atravessa", () => {
  const acionaveis = radarPortableActionableLimitations([
    "Nenhum vídeo foi assistido ou transcrito.",
    "Textos de reviews não foram analisados.",
    "3 ids não resolvidos no transporte compacto.",
    "O snapshot 8f2c não trouxe hash de conteúdo.",
    "O payload da versão anterior falhou no schema.",
  ]);

  assert.deepEqual(acionaveis, [
    "Nenhum vídeo foi assistido ou transcrito.",
    "Textos de reviews não foram analisados.",
  ]);

  const linha = linhaDeVideo();
  assert.match(linha.limitations_md, /Nenhum vídeo foi assistido ou transcrito/);
  assert.match(linha.limitations_md, /Nada disso pode virar afirmação no texto/);
});

/* ============================== §15 e §22 ============================== */

/** §22 · a completude do brief, verificada sem chamar IA nenhuma. */
const EXIGIDOS_NO_BRIEF = [
  /# MISSÃO/,
  /# ARTICLE DNA/,
  /Keyword principal: /,
  /Intenção: /,
  /Obrigatório cobrir:/,
  /# RADIOGRAFIA COMPETITIVA/,
  /# ESTRATÉGIA PARA SUPERAR A SERP/,
  /# ESTRUTURA COMPLETA/,
  /# LIMITAÇÕES/,
  /# REGRAS PARA O REDATOR/,
];

test("§15 e §22 · o brief é um documento autossuficiente, e não um índice", () => {
  const brief = linhaDoGoogle().writer_brief_md;

  for (const exigido of EXIGIDOS_NO_BRIEF) {
    assert.match(brief, exigido, `§22 · o brief não carrega ${exigido}`);
  }

  /* E pelo menos uma das três camadas de apoio, conforme disponível. */
  assert.ok(
    /# FONTES E EVIDÊNCIAS/.test(brief) || /# LINKS INTERNOS/.test(brief) || /# SEO/.test(brief),
    "§22 · o brief não carrega evidência, links nem SEO",
  );

  /*
   * AUTOSSUFICIENTE SIGNIFICA QUE ELE BASTA.
   *
   * A versão anterior era um espelho das colunas ao lado: quem colava só o
   * brief num LLM recebia um índice do CSV, e não um documento.
   */
  assert.ok(brief.length > 2000, `§15 · brief de ${brief.length} caracteres não sustenta um artigo`);
  assert.ok(brief.includes("pele oleosa"), "§15 · o brief não fala do assunto investigado");

  /* As regras fecham o contrato, e elas são as mesmas em todo dossiê. */
  assert.match(brief, /não copiar concorrentes/);
  assert.match(brief, /não inventar evidência/);
  assert.match(brief, /cumprir tudo o que está em MUST_COVER/);
});

test("§15 · o brief é determinístico para a mesma evidência", () => {
  assert.equal(linhaDoGoogle().writer_brief_md, linhaDoGoogle().writer_brief_md);
});

/* ================================ §16 ================================ */

test("§16 · a estratégia nomeia movimentos concretos, com o sinal atrás", () => {
  const estrategia = linhaDoGoogle().serp_outperformance_strategy_md;

  assert.match(estrategia, /^# Estratégia para superar a SERP/);
  const movimentos = estrategia.split("\n").filter(linha => linha.startsWith("- "));
  assert.ok(movimentos.length >= 2, `§16 · ${movimentos.length} movimento(s)`);

  /*
   * "ESCREVA MELHOR" NÃO É ESTRATÉGIA.
   *
   * Cada linha precisa dizer uma ação sobre um sinal que o Radar observou.
   */
  assert.equal(/escreva melhor|seja mais completo|supere a concorrência/i.test(estrategia), false);
  assert.ok(
    movimentos.some(item => /Responder |Cobrir |Tratar |Explicar |Sustentar /.test(item)),
    "§16 · nenhum movimento diz o que fazer",
  );

  /* E o movimento mais barato que existe nasce da lacuna observada. */
  assert.ok(
    movimentos.some(item => /Cobrir o que a amostra não cobre/.test(item)),
    "§16 · a lacuna observada não virou movimento",
  );
});

test("§16 · sem sinal, a estratégia recusa em vez de inventar", () => {
  const estrategia = linhaComercial().serp_outperformance_strategy_md;
  assert.match(estrategia, /não produziu sinal suficiente|Não improvise diferenciação|Entregar por inteiro/);
});

/* ================================ §17 ================================ */

test("§17 · o prompt externo aponta para o brief, sem duplicá-lo", () => {
  assert.ok(RADAR_EXTERNAL_WRITER_PROMPT.includes("writer_brief_md"));
  assert.ok(RADAR_EXTERNAL_WRITER_PROMPT.includes("Não invente fatos"));
  assert.ok(RADAR_EXTERNAL_WRITER_PROMPT.length < 700, "um prompt gigante duplicaria o brief");
  assert.equal(linhaDoGoogle().external_writer_prompt_md, RADAR_EXTERNAL_WRITER_PROMPT);
});

/* ================================ §21 ================================ */

test("§21 · os três perfis produzem dossiê utilizável", () => {
  const google = linhaDoGoogle();
  assert.ok(google.suggested_title.length > 0, "GOOGLE · sem título");
  assert.ok(google.reader_promise.length > 0, "GOOGLE · sem promessa");
  assert.match(google.outline_md, /^## /m);
  assert.match(google.competitive_radiography_md, /^## /m);

  const youtube = linhaDeVideo();
  assert.equal(youtube.suggested_title.includes("skin care noturno: skin care noturno"), false, "YOUTUBE · título tautológico");
  assert.match(youtube.writer_brief_md, /Abertura: /);
  assert.match(youtube.outline_md, /^## /m);

  const amazon = linhaComercial();
  assert.match(amazon.commercial_plan_md, /TOP_VALUE/);
  assert.equal(JSON.parse(amazon.selected_products_json).length, 1);
  assert.equal(JSON.parse(amazon.promotion_links_json).length, 1);
});

/* ================================ §20 ================================ */

test("§20 · o export padrão usa o contrato editorial", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const inicio = pagina.indexOf("const exportarDossiesFinalizados");
  const corpo = pagina.slice(inicio, inicio + 2000);

  assert.match(corpo, /"\/api\/editorial\/radar-export"/);
  /* §1 e §16 · quem monta é o servidor — a tela só baixa o que recebeu. */
  assert.equal(/buildRadarPortableExportRow|radarPortableExportCsv/.test(corpo), false,
    "a tela remonta o dossiê em vez de receber o canônico");
});

/* ============================== a sentinela ============================== */

test("PROVIDER_CALLS_ON_EXPORT = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
