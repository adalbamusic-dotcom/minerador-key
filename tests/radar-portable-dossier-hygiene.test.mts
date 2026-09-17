import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import {
  radarPortableSectionEvidence,
  radarPortableSerpEvidence,
  radarPortableSourceHasEditorialFunction,
  radarPortableYoutubeEvidence,
} from "../lib/radar/portable-evidence-pack.ts";
import { radarPortableEditorialOf } from "../lib/radar/portable-read-model.ts";
import { buildRadarPortableExportRow, radarPortableExportCsv } from "../lib/radar/portable-export.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ===== HIGIENE DO DOSSIÊ PORTÁTIL — o CSV é de quem escreve, não do banco =====
 *
 * ==================== O QUE ESTA SUÍTE GUARDA ====================
 *
 * O evidence pack do 1.2 levou junto os ENDEREÇOS INTERNOS da evidência:
 * `section:3fe7d06c`, `concept:cause:8ba7744a`, `question:c580aef1`, `ytq:1` e
 * a impressão digital da rodada no lugar de uma data.
 *
 * Nenhum deles abre nada para quem está fora da plataforma: eles endereçam
 * estruturas que só existem aqui dentro. O que precisa atravessar é a RELAÇÃO —
 * qual evidência sustenta qual seção — e ela atravessa por rótulo legível.
 *
 * ==================== O QUE NÃO PODE SUMIR JUNTO ====================
 *
 * URL real da SERP, título, domínio, posição, recorrência, força da evidência,
 * perguntas, conceitos, vídeo e especialista. A higiene tira endereço interno,
 * e nada além disso.
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

/* ============================== a bancada real ============================== */

const link = (destino: string, ancora: string): RadarObservedLink => ({
  destinationUrl: destino,
  destinationDomain: new URL(destino).host,
  kind: "EXTERNAL", anchorText: ancora,
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 3,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [
    link("https://www.aad.org/public/diseases/oily-skin", "American Academy of Dermatology"),
    /* As duas abaixo são citadas no corpo e não sustentam afirmação nenhuma. */
    link("https://loja-exemplo.com.br/politica-de-privacidade", "política de privacidade"),
    link("https://loja-exemplo.com.br/login", "entre na sua conta"),
  ],
  error: null,
});

const PAGINAS = Array.from({ length: 12 }, (_, indice) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (indice < 9) headings.push("Por que a pele fica oleosa?");
  if (indice < 8) headings.push("Rotina de cuidados para pele oleosa");
  return pagina(`A${indice}`, headings);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a1", articleDnaVersionId: "d1", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 41000, kgrScore: 0.589, incrementalVolume: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, semanticQualification: null },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

/**
 * ===== A IMPRESSÃO DIGITAL COMO CARIMBO — o caso real de produção =====
 *
 * A vista usa `fingerprint.value` quando ninguém informa o relógio. Ela é
 * composta e técnica, e num CSV aberto no Excel parece uma data corrompida.
 */
const vista = (comRelogio = false) => buildRadarDeepResearchView({
  context: contexto(),
  snapshot: { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, indice) => ({ position: indice + 1, title: item.title, domain: `d${indice}.com`, url: item.url })) } as never,
  extractions: PAGINAS,
  selectedReferences: PAGINAS.length,
  ...(comRelogio ? { observedAt: "2026-09-10T12:00:00.000Z" } : {}),
});

const pack = (comRelogio = false) => radarPortableSerpEvidence({
  observed: vista(comRelogio).observed,
  blueprint: null,
  articleModel: vista(comRelogio).articleModel,
});

const linha = () => {
  const leitura = vista(true);
  return buildRadarPortableExportRow({
    profile: "GOOGLE",
    blueprintView: { blueprint: null, sample: { label: "página(s)", count: 12 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: {
      principalKeyword: "skincare para pele oleosa",
      secondaryKeywords: [], narrativeReinforcements: [],
      intent: "Informacional", funnel: "Topo", siloName: "skincare", articleRole: "SUPORTE",
      slug: "skincare-pele-oleosa", mustCover: ["identificação da pele oleosa"],
    },
    articleModel: leitura.articleModel,
    googleObserved: leitura.observed,
    researchContext: contexto(),
    researchLimitations: leitura.observed.limitations,
  });
};

/* ================================ §1 ================================ */

const ENDERECOS_INTERNOS = [
  /section:[0-9a-f]{6,}/,
  /concept:[a-z]+:[0-9a-f]{6,}/,
  /question:[0-9a-f]{6,}/,
  /need:[0-9a-f]{6,}/,
  /page:[A-Za-z0-9]+"/,
  /\bytq:\d+/,
  /\bamzq:\d+/,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/,
  /sha256:/,
];

test("§1 · nenhum endereço interno atravessa nos JSONs portáteis", () => {
  const dossie = linha();
  const portateis = Object.entries(dossie).filter(([chave]) => chave.endsWith("_json"));
  assert.ok(portateis.length >= 4, "a bancada precisa exercitar os JSONs portáteis");

  for (const [coluna, valor] of portateis) {
    for (const padrao of ENDERECOS_INTERNOS) {
      const encontro = valor.match(padrao);
      assert.equal(encontro, null, `§1 · endereço interno em ${coluna}: ${encontro?.[0]}`);
    }
  }

  /* E o mesmo vale para o arquivo inteiro, Markdown incluído. */
  const csv = radarPortableExportCsv([dossie]);
  for (const padrao of ENDERECOS_INTERNOS) {
    const encontro = csv.match(padrao);
    assert.equal(encontro, null, `§1 · endereço interno no CSV: ${encontro?.[0]}`);
  }
});

test("§1 · o carimbo técnico da rodada não sai como data", () => {
  /*
   * Sem relógio informado, a fotografia carimba com a impressão digital. Ela
   * não é um instante — e uma data que não é data é pior do que campo vazio.
   */
  const semRelogio = pack(false);
  assert.equal(semRelogio.observedAt, null, "§1 · a impressão digital saiu como observedAt");

  const comRelogio = pack(true);
  assert.equal(comRelogio.observedAt, "2026-09-10T12:00:00.000Z");
});

/* ================================ §2 ================================ */

test("§2 · a relação seção → evidência sobrevive, agora por rótulo", () => {
  const leitura = vista(true);
  const evidencia = radarPortableSerpEvidence({ observed: leitura.observed, blueprint: null, articleModel: leitura.articleModel });
  const editorial = radarPortableEditorialOf({
    profile: "GOOGLE", principalKeyword: "skincare para pele oleosa", articleModel: leitura.articleModel,
  });
  const secoes = radarPortableSectionEvidence({
    editorial, articleModel: leitura.articleModel, serp: evidencia,
    videoBySection: new Map(), specialistBySection: new Map(),
  });

  const comEvidencia = secoes.filter(item => item.evidenceLabels.length);
  assert.ok(comEvidencia.length > 0, "§2 · a relação seção → evidência sumiu junto com os ids");

  /* Cada rótulo é legível E alcançável no pack. */
  const alcancaveis = new Set(evidencia.editorialCandidates.map(item => item.observedLabel));
  for (const secao of comEvidencia) {
    for (const rotulo of secao.evidenceLabels) {
      assert.equal(/^(section|concept|question|need):/.test(rotulo), false, `§2 · rótulo ainda é id: ${rotulo}`);
      assert.ok(alcancaveis.has(rotulo), `§2 · rótulo inalcançável: ${rotulo}`);
    }
    assert.ok(secao.serpEvidence.length > 0, "§2 · a seção perdeu a evidência resolvida");
  }

  /* E o candidato aponta para a SEÇÃO pelo cabeçalho, não pelo id dela. */
  const promovido = evidencia.editorialCandidates.find(item => item.section);
  assert.ok(promovido, "§2 · nenhum candidato ficou amarrado a uma seção");
  assert.equal(/^section:/.test(promovido!.section as string), false);
});

/* ================================ §3 ================================ */

test("§3 · página de utilidade não entra como fonte externa", () => {
  /* A regra, isolada. */
  assert.equal(radarPortableSourceHasEditorialFunction({ url: "https://loja.com.br/politica-de-privacidade", sourceType: "unknown" }), false);
  assert.equal(radarPortableSourceHasEditorialFunction({ url: "https://loja.com.br/login", sourceType: "media" }), false);
  assert.equal(radarPortableSourceHasEditorialFunction({ url: "https://loja.com.br/carrinho", sourceType: "unknown" }), false);
  assert.equal(radarPortableSourceHasEditorialFunction({ url: "https://www.aad.org/public/diseases/oily-skin", sourceType: "unknown" }), true);

  /*
   * A EXCEÇÃO É EXPLÍCITA: destino CLASSIFICADO atravessa mesmo com caminho de
   * utilidade, porque aí quem sustenta é a classificação, e não o caminho.
   */
  assert.equal(radarPortableSourceHasEditorialFunction({ url: "https://www.gov.br/anvisa/politica-de-cosmeticos", sourceType: "official" }), true);

  /* E no dossiê real: a AAD fica, a política de privacidade e o login saem. */
  const externas = JSON.parse(linha().external_sources_json) as Array<{ url: string }>;
  assert.ok(externas.some(item => item.url.includes("aad.org")), "§4 · a fonte real foi removida junto");
  assert.equal(externas.some(item => /privacidade|login/.test(item.url)), false, "§3 · página de utilidade atravessou");
});

/* ================================ §4 ================================ */

test("§4 · o que sustenta a escrita continua inteiro", () => {
  const dossie = linha();
  const evidencia = JSON.parse(dossie.serp_evidence_json);
  const fontes = JSON.parse(dossie.serp_sources_json) as Array<{ url: string; title: string; domain: string; position: number | null }>;

  /* As fontes competitivas continuam conferíveis. */
  assert.ok(fontes.length > 0);
  assert.ok(fontes[0].url.startsWith("https://"), "§4 · a URL real da SERP sumiu");
  assert.ok(fontes[0].title.length > 0, "§4 · o título sumiu");
  assert.ok(fontes[0].domain.length > 0, "§4 · o domínio sumiu");
  assert.notEqual(fontes[0].position, undefined, "§4 · a posição sumiu");

  /* E a leitura da amostra também. */
  assert.ok(evidencia.concepts.length > 0, "§4 · os conceitos sumiram");
  assert.ok(evidencia.questions.length > 0, "§4 · as perguntas sumiram");
  assert.ok(evidencia.concepts[0].label.length > 0);
  assert.ok(evidencia.concepts[0].sourceCount >= 0, "§4 · a recorrência sumiu");
  assert.ok(evidencia.concepts[0].evidence.length > 0);

  const secoes = JSON.parse(dossie.section_evidence_json) as Array<{ evidenceStrength: string | null }>;
  assert.ok(secoes.some(item => item.evidenceStrength), "§4 · a força da evidência sumiu");
});

test("§1 · a consulta do YouTube sai pelo texto, e nunca pelo id", () => {
  const universo = [{
    videoId: "abc", url: "https://www.youtube.com/watch?v=abc", title: "Rotina noturna",
    channelName: "Canal", channelId: null, channelUrl: null, channelLogo: null,
    publishedAt: null, publishedAtLabel: null, durationSeconds: 600, durationLabel: "10:00",
    views: 100, description: null, thumbnailUrl: null, isShorts: false, isLive: false, isMovie: false,
    badges: [], queriesFoundIn: ["ytq:1"], bestRank: 1,
    allRanks: [{ queryId: "ytq:1", rank: 1 }], occurrenceCount: 1,
    universeClass: "COMPARABLE", universeReason: "Vídeo comparável.",
  }] as never;

  const comCorrida = radarPortableYoutubeEvidence({
    universe: universo, blueprint: null,
    queries: [{ queryId: "ytq:1", text: "skin care noturno ordem" }],
  });
  assert.deepEqual(comCorrida!.queries, ["skin care noturno ordem"]);

  /*
   * SEM A CORRIDA, A CONSULTA SOME — e sumir é melhor do que sair como id.
   *
   * `ytq:1` no lugar do termo faria quem lê acreditar que a busca executada foi
   * aquela string.
   */
  const semCorrida = radarPortableYoutubeEvidence({ universe: universo, blueprint: null });
  assert.deepEqual(semCorrida!.queries, []);
  assert.equal(semCorrida!.videos.length, 1, "§4 · o vídeo não pode sumir junto com a consulta");
});

/* ================================ §5 ================================ */

test("§5 · o contexto completo não perdeu conteúdo na limpeza", () => {
  const contexto = linha().writer_context_md;

  for (const secao of [
    /# IDENTIDADE DO ARTIGO/, /# METADADOS SEO/, /# ARTICLE DNA/, /# KEYWORD DNA/,
    /# BLUEPRINT/, /# RADIOGRAFIA COMPETITIVA/, /# EVIDÊNCIAS/, /# EVIDÊNCIA POR SEÇÃO/,
    /# FONTES/, /# LINKS INTERNOS/, /# PLANO VISUAL/, /# VÍDEOS/, /# ESPECIALISTA/,
    /# LIMITAÇÕES/, /# O QUE NÃO PODE SER AFIRMADO/, /# REGRAS DE REDAÇÃO/,
  ]) {
    assert.match(contexto, secao, `§5 · o contexto completo perdeu ${secao}`);
  }

  assert.ok(contexto.includes("skincare para pele oleosa"), "§5 · a keyword sumiu do contexto");
  assert.ok(contexto.includes("pele oleosa"), "§5 · o assunto sumiu do contexto");
  assert.ok(contexto.length > 6000, `§5 · contexto encolheu para ${contexto.length} caracteres`);
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});

/* ==================== os sobreviventes da bateria, fechados ==================== */

test("§3 e §4 · o filtro de utilidade compara SEGMENTO, não substring", () => {
  /*
   * ===== O FALSO POSITIVO QUE UMA VARREDURA SOLTA PRODUZ =====
   *
   * "cookies" é token de utilidade e também é assunto editorial. Procurar a
   * palavra no caminho inteiro removeria uma receita de biscoito da lista de
   * fontes — e removeria calada, que é o pior jeito de errar num filtro.
   *
   * O que distingue é o SEGMENTO começar pelo token, que é como uma URL de
   * utilidade realmente se escreve.
   */
  for (const legitima of [
    "https://site.com.br/receitas/como-fazer-cookies",
    "https://site.com.br/blog/politicas-publicas-de-saude-da-pele",
    "https://site.com.br/artigos/contatos-da-pele-com-o-sol",
    "https://site.com.br/guia/buscando-a-rotina-certa",
  ]) {
    assert.equal(radarPortableSourceHasEditorialFunction({ url: legitima, sourceType: "unknown" }), true,
      `§4 · fonte editorial removida pelo filtro: ${legitima}`);
  }

  for (const utilidade of [
    "https://site.com.br/politica-de-privacidade",
    "https://site.com.br/institucional/termos-de-uso",
    "https://site.com.br/minha-conta/login",
    "https://site.com.br/carrinho",
    "https://site.com.br/onde-comprar",
  ]) {
    assert.equal(radarPortableSourceHasEditorialFunction({ url: utilidade, sourceType: "unknown" }), false,
      `§3 · página de utilidade atravessou: ${utilidade}`);
  }
});

test("§1 · a rota entrega as consultas da corrida para o id virar texto", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  /*
   * SEM A CORRIDA, A CONSULTA SOME DO DOSSIÊ — e sumir é correto, mas não é o
   * que se quer quando a corrida está ali, gravada, ao lado do universo. A
   * projeção só consegue resolver o texto se quem a chama entregar as duas.
   */
  assert.match(semComentarios, /youtubeQueries: perfil === "YOUTUBE"/);
  assert.match(semComentarios, /payload\.youtubeSearch\?\.queries \|\| \[\]/);
  assert.match(semComentarios, /queryId: item\.queryId, text: item\.text/);
});
